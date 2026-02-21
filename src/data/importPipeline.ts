import * as XLSX from 'xlsx';
import { mapColumns } from '@/data/columnMapping';
import { saveDatasetPackage } from '@/data/cache';
import { buildModel } from '@/data/duckdb';
import { parseDate } from '@/utils/fiscal';
import { parseNumber } from '@/utils/parsing';

export type ImportPhase = 'idle' | 'reading' | 'parsing' | 'cleaning' | 'duckdb' | 'caching' | 'done' | 'error';
export type ImportStatus = { phase: ImportPhase; progress: number; message: string; startedAt: number };
export type ImportSummary = {
  rowCount: number;
  totalRows: number;
  droppedAmountRows: number;
  droppedPct: number;
  missingCostRows: number;
  missingCostPct: number;
  invalidDateRows: number;
  customers: number;
  parts: number;
  dateMin: string;
  dateMax: string;
  loadedAt: string;
  selectedSheet: string;
  columnMap: Record<string, string>;
};

type CleanRow = {
  cust_id: string; cust_name: string; country: string; territory: string; prod_group: string; prod_group_desc: string;
  part_num: string; line_desc: string; class_id: string; class_desc: string; invoice_num: string; invoice_date: string; order_num: string; amount: number; cost: number | null;
};
export type ImportResult =
  | { type: 'needs-sheet'; sheetNames: string[]; message: string }
  | { type: 'success'; summary: ImportSummary; dataNdjson: Uint8Array }
  | { type: 'cancelled' };

const requiredColumns = ['cust_id', 'cust_name', 'invoice_num', 'invoice_date', 'order_num', 'amount', 'part_num'] as const;
const phaseProgress: Record<Exclude<ImportPhase, 'idle'>, number> = { reading: 0.1, parsing: 0.3, cleaning: 0.55, duckdb: 0.78, caching: 0.92, done: 1, error: 1 };
const pauseForUI = async () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Import cancelled by user.', 'AbortError'); };

export async function importDatasetFile(params: { file: File; selectedSheet?: string; onStatus: (status: ImportStatus) => void; signal?: AbortSignal; }): Promise<ImportResult> {
  const startedAt = Date.now();
  const mark = (phase: Exclude<ImportPhase, 'idle'>, message: string) => {
    const t0 = performance.now();
    params.onStatus({ phase, message, progress: phaseProgress[phase], startedAt });
    console.debug(`[import] ${phase}: ${message}`);
    return t0;
  };
  const doneMark = (phase: ImportPhase, t0?: number) => t0 ? console.debug(`[import] ${phase} completed in ${(performance.now() - t0).toFixed(1)}ms`) : null;

  try {
    checkAbort(params.signal);
    const readT = mark('reading', 'Reading file...');
    await pauseForUI();
    const buffer = await params.file.arrayBuffer();
    doneMark('reading', readT);

    checkAbort(params.signal);
    const parseT = mark('parsing', 'Parsing workbook and detecting sheet...');
    await pauseForUI();
    const workbook = XLSX.read(buffer, { type: 'array' });
    console.log('Available sheets:', workbook.SheetNames);
    const sheetNames = workbook.SheetNames;
    let sheetName = params.selectedSheet;
    if (!sheetName) sheetName = sheetNames.find((s) => s === 'Analyse PDR');
    if (!sheetName) {
      console.warn('Analyse PDR not found. Showing selector.');
      doneMark('parsing', parseT);
      return { type: 'needs-sheet', sheetNames, message: "Default sheet 'Analyse PDR' not found." };
    }
    if (sheetName === 'Analyse PDR') console.log('Using sheet: Analyse PDR');
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Sheet '${sheetName}' cannot be read.`);
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    doneMark('parsing', parseT);

    checkAbort(params.signal);
    const cleanT = mark('cleaning', 'Cleaning columns and validating rows...');
    await pauseForUI();
    if (!rawRows.length) throw new Error('Selected sheet is empty.');
    const colMap = mapColumns(Object.keys(rawRows[0]));
    const missing = requiredColumns.filter((c) => !colMap[c]);
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);

    let invalidDateRows = 0; let droppedAmountRows = 0; let missingCostRows = 0;
    const customers = new Set<string>(); const parts = new Set<string>(); const dates: string[] = [];

    const cleanedRows = rawRows.map((row) => {
      const amount = parseNumber(row[colMap.amount]);
      if (amount == null || amount <= 0) { droppedAmountRows += 1; return null; }
      const invoiceDate = parseDate(row[colMap.invoice_date]);
      if (!invoiceDate) { invalidDateRows += 1; return null; }
      const costRaw = colMap.cost ? parseNumber(row[colMap.cost]) : null;
      if (costRaw == null) missingCostRows += 1;
      const invoiceIso = invoiceDate.toISOString().slice(0, 10);
      dates.push(invoiceIso);
      const clean = {
        cust_id: String(row[colMap.cust_id] ?? '').trim(), cust_name: String(row[colMap.cust_name] ?? '').trim(),
        country: String(row[colMap.country] ?? '').trim(), territory: String(row[colMap.territory] ?? '').trim(),
        prod_group: String(row[colMap.prod_group] ?? '').trim(), prod_group_desc: String(row[colMap.prod_group_desc] ?? '').trim(),
        part_num: String(row[colMap.part_num] ?? '').trim(), line_desc: String(row[colMap.line_desc] ?? '').trim(),
        class_id: String(row[colMap.class_id] ?? '').trim(), class_desc: String(row[colMap.class_desc] ?? '').trim(),
        invoice_num: String(row[colMap.invoice_num] ?? '').trim(), invoice_date: invoiceIso, order_num: String(row[colMap.order_num] ?? '').trim(),
        amount, cost: costRaw
      };
      customers.add(String(clean.cust_id)); parts.add(String(clean.part_num));
      return clean;
    }).filter((x): x is CleanRow => x !== null);

    if (!cleanedRows.length) throw new Error('No valid rows found after cleaning.');
    doneMark('cleaning', cleanT);

    const ndjson = cleanedRows.map((r) => JSON.stringify(r)).join('\n');
    const dataNdjson = new TextEncoder().encode(ndjson);

    checkAbort(params.signal);
    const duckT = mark('duckdb', 'Building DuckDB tables...');
    await pauseForUI();
    await buildModel(dataNdjson);
    doneMark('duckdb', duckT);

    const summary: ImportSummary = {
      rowCount: cleanedRows.length,
      totalRows: rawRows.length,
      droppedAmountRows,
      droppedPct: rawRows.length ? (droppedAmountRows / rawRows.length) * 100 : 0,
      missingCostRows,
      missingCostPct: cleanedRows.length ? (missingCostRows / cleanedRows.length) * 100 : 0,
      invalidDateRows,
      customers: customers.size,
      parts: parts.size,
      dateMin: [...dates].sort()[0],
      dateMax: [...dates].sort().at(-1) ?? '',
      loadedAt: new Date().toISOString(),
      selectedSheet: sheetName,
      columnMap: colMap
    };

    checkAbort(params.signal);
    const cacheT = mark('caching', 'Saving to local cache...');
    await pauseForUI();
    await saveDatasetPackage(dataNdjson, summary);
    doneMark('caching', cacheT);

    mark('done', 'Dataset loaded successfully.');
    return { type: 'success', summary, dataNdjson };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { type: 'cancelled' };
    const message = error instanceof Error ? error.message : 'Unknown import error.';
    params.onStatus({ phase: 'error', progress: 1, message, startedAt });
    throw error;
  }
}
