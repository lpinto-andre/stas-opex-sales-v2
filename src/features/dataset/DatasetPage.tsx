import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppStore } from '@/state/store';
import { importDatasetFile, type ImportStatus } from '@/data/importPipeline';
import { clearDatasetPackage } from '@/data/cache';
import { dropAllTables } from '@/data/duckdb';
import { extractPotentialWorkbook } from '@/data/potentialWorkbook';

type ToastState = { tone: 'success' | 'error'; text: string } | null;

const steps: { phase: ImportStatus['phase']; label: string }[] = [
  { phase: 'reading', label: 'Reading file' },
  { phase: 'parsing', label: 'Parsing sheet' },
  { phase: 'cleaning', label: 'Cleaning columns' },
  { phase: 'duckdb', label: 'Building dataset' },
  { phase: 'caching', label: 'Saving local cache' }
];

function ImportStatusCard({ title, status, isImporting }: { title: string; status: ImportStatus; isImporting: boolean }) {
  const activeStep = steps.findIndex((s) => s.phase === status.phase);
  return <section className="card p-4">
    <h3 className="font-semibold mb-2">Import status — {title}</h3>
    {!isImporting && <p className="text-sm text-[var(--text-muted)]">Idle.</p>}
    {isImporting && <div className="space-y-2">
      <div className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden"><div className="h-full bg-[var(--teal)]" style={{ width: `${Math.max(5, Math.min(100, Math.round(status.progress * 100)))}%` }} /></div>
      <p className="text-sm">{status.message || 'Working...'}</p>
      <div className="text-xs text-[var(--text-muted)]">{steps.map((s, i) => <span key={s.phase} className={i <= activeStep ? 'text-[var(--teal)] mr-2' : 'mr-2'}>{i + 1}. {s.label}</span>)}</div>
    </div>}
  </section>;
}

export function DatasetPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const potentialRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [toast, setToast] = useState<ToastState>(null);
  const [statusMain, setStatusMain] = useState<ImportStatus>({ phase: 'idle', message: '', progress: 0, startedAt: 0 });
  const [statusPotential, setStatusPotential] = useState<ImportStatus>({ phase: 'idle', message: '', progress: 0, startedAt: 0 });
  const [isImportingMain, setIsImportingMain] = useState(false);
  const [isImportingPotential, setIsImportingPotential] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [sheetWarning, setSheetWarning] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');

  const datasetMeta = useAppStore((s) => s.datasetMeta);
  const setDataset = useAppStore((s) => s.setDataset);
  const setPageState = useAppStore((s) => s.setPageState);
  const potentialState = useAppStore((s) => (s.pageState.potential as Record<string, unknown>) ?? {});

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const updateDatasetMeta = (summary: Record<string, unknown>) => {
    setDataset({
      loadedAt: String(summary.loadedAt),
      rowCount: Number(summary.rowCount ?? 0),
      missingCostPct: Number(summary.missingCostPct ?? 0),
      fyRange: String(summary.fyRange ?? 'Computed from invoice dates'),
      dateRange: String(summary.dateRange ?? `${summary.dateMin ?? ''} → ${summary.dateMax ?? ''}`),
      customers: Number(summary.customers ?? 0),
      parts: Number(summary.parts ?? 0),
      selectedSheet: summary.selectedSheet ? String(summary.selectedSheet) : undefined,
      droppedPct: Number(summary.droppedPct ?? 0),
      invalidDateRows: Number(summary.invalidDateRows ?? 0)
    });
  };

  const executeMainImport = async (file: File, forcedSheet?: string) => {
    setErrorMsg('');
    setSheetWarning('');
    abortRef.current = new AbortController();
    try {
      const result = await importDatasetFile({ file, selectedSheet: forcedSheet, signal: abortRef.current.signal, onStatus: setStatusMain });
      if (result.type === 'needs-sheet') {
        setPendingFile(file);
        setSheetNames(result.sheetNames);
        setSelectedSheet(result.sheetNames[0] ?? '');
        setSheetWarning(result.message);
        setStatusMain({ phase: 'idle', message: '', progress: 0, startedAt: 0 });
        return;
      }
      if (result.type === 'cancelled') return;
      updateDatasetMeta(result.summary as unknown as Record<string, unknown>);
      setToast({ tone: 'success', text: 'ShippedSO file imported successfully.' });
      setTimeout(() => navigate('/explorer'), 500);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Unexpected import failure.');
      setToast({ tone: 'error', text: 'ShippedSO import failed.' });
    } finally {
      abortRef.current = null;
      setIsImportingMain(false);
    }
  };

  const onMainFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImportingMain(true);
    await executeMainImport(file);
    event.target.value = '';
  };

  const onPotentialFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImportingPotential(true);
    setStatusPotential({ phase: 'reading', message: 'Reading workbook...', progress: 0.2, startedAt: Date.now() });
    try {
      const extracted = await extractPotentialWorkbook(file);
      setStatusPotential({ phase: 'caching', message: 'Preparing normalized tables...', progress: 0.9, startedAt: Date.now() });
      setPageState('potential', { ...extracted, loadedAt: new Date().toISOString(), sourceFileName: file.name });
      setStatusPotential({ phase: 'done', message: 'Workbook extracted successfully.', progress: 1, startedAt: Date.now() });
      setToast({ tone: 'success', text: 'Full potential consumption file imported successfully.' });
    } catch (error) {
      setStatusPotential({ phase: 'error', message: error instanceof Error ? error.message : 'Failed extracting workbook.', progress: 1, startedAt: Date.now() });
      setToast({ tone: 'error', text: 'Potential workbook import failed.' });
    } finally {
      setIsImportingPotential(false);
      event.target.value = '';
    }
  };

  const clearLocalDataset = async () => {
    await clearDatasetPackage();
    await dropAllTables();
    setDataset(null);
    setPageState('potential', {});
    setToast({ tone: 'success', text: 'Local dataset cleared.' });
  };

  const potentialSummary = useMemo(() => {
    const summaryRows = (potentialState.summaryTable as unknown[] | undefined)?.length ?? 0;
    const validationRows = (potentialState.validationReport as unknown[] | undefined)?.length ?? 0;
    const invalidRows = ((potentialState.validationReport as Record<string, unknown>[] | undefined) ?? []).filter((r) => !Boolean(r.IsValid)).length;
    return { summaryRows, validationRows, invalidRows };
  }, [potentialState]);

  return <div className="space-y-4">
    <PageHeader title="Dataset Manager" subtitle="Import ShippedSO and Full Potential Consumption files." actions={<button className="card px-3 py-2" onClick={clearLocalDataset}>Clear local dataset</button>} />

    <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xlsm,.csv" onChange={onMainFile} />
    <input ref={potentialRef} type="file" className="hidden" accept=".xlsx,.xlsm" onChange={onPotentialFile} />

    <div className="grid lg:grid-cols-2 gap-4">
      <section className="card p-6 text-center">
        <h3 className="font-semibold text-lg mb-2">Import ShippedSO file</h3>
        <p className="text-sm text-[var(--text-muted)] mb-4">Supported formats: Excel (.xlsx/.xlsm) and CSV.</p>
        <button disabled={isImportingMain} className="card mx-auto h-40 w-40 flex items-center justify-center text-sm font-semibold border-[var(--teal)] text-[var(--teal)] disabled:opacity-50" onClick={() => fileRef.current?.click()}>{isImportingMain ? 'Importing…' : 'Import File'}</button>
      </section>
      <section className="card p-6 text-center">
        <h3 className="font-semibold text-lg mb-2">Import Full Potential Consumption file</h3>
        <p className="text-sm text-[var(--text-muted)] mb-4">Excel workbook with client tabs and cached theoretical values.</p>
        <button disabled={isImportingPotential} className="card mx-auto h-40 w-40 flex items-center justify-center text-sm font-semibold border-[var(--teal)] text-[var(--teal)] disabled:opacity-50" onClick={() => potentialRef.current?.click()}>{isImportingPotential ? 'Importing…' : 'Import File'}</button>
      </section>
    </div>

    {(isImportingMain || statusMain.phase === 'done' || statusMain.phase === 'error') && <ImportStatusCard title="ShippedSO" status={statusMain} isImporting={isImportingMain || statusMain.phase !== 'idle'} />}
    {(isImportingPotential || statusPotential.phase === 'done' || statusPotential.phase === 'error') && <ImportStatusCard title="Full Potential Consumption" status={statusPotential} isImporting={isImportingPotential || statusPotential.phase !== 'idle'} />}

    {sheetWarning && <section className="card p-3"><p className="text-sm mb-2">{sheetWarning}</p><div className="flex gap-2"><select className="card px-2 py-1" value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>{sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}</select><button className="card px-3 py-1" onClick={() => pendingFile && executeMainImport(pendingFile, selectedSheet)}>Continue import</button></div></section>}
    {errorMsg && <section className="card p-3 border border-red-400/40 text-red-300 text-sm">{errorMsg}</section>}

    <div className="grid lg:grid-cols-2 gap-4">
      <section className="card p-4">
        <h3 className="font-semibold mb-2">Import status — ShippedSO</h3>
        {!datasetMeta ? <p className="text-sm text-[var(--text-muted)]">No ShippedSO dataset loaded yet.</p> : <div className="space-y-1 text-sm"><p>Loaded at: <span className="text-[var(--text-muted)]">{datasetMeta.loadedAt}</span></p><p>Rows: <span className="text-[var(--text-muted)]">{datasetMeta.rowCount.toLocaleString()}</span></p><p>Date range: <span className="text-[var(--text-muted)]">{datasetMeta.dateRange}</span></p></div>}
      </section>
      <section className="card p-4">
        <h3 className="font-semibold mb-2">Import status — Full Potential Consumption</h3>
        {!potentialSummary.summaryRows ? <p className="text-sm text-[var(--text-muted)]">No potential workbook loaded yet.</p> : <div className="space-y-1 text-sm"><p>Sheets extracted: <span className="text-[var(--text-muted)]">{potentialSummary.summaryRows.toLocaleString()}</span></p><p>Validation rows: <span className="text-[var(--text-muted)]">{potentialSummary.validationRows.toLocaleString()}</span></p><p>Invalid sheets: <span className="text-[var(--text-muted)]">{potentialSummary.invalidRows.toLocaleString()}</span></p><button className="card px-3 py-1 mt-2" onClick={() => navigate('/potential-tables')}>Open generated tables</button></div>}
      </section>
    </div>

    <div className="grid lg:grid-cols-2 gap-4">
      <section className="card p-4">
        <h3 className="font-semibold mb-2">Data quality summary — ShippedSO</h3>
        {!datasetMeta ? <p className="text-sm text-[var(--text-muted)]">Import a ShippedSO file to view quality indicators.</p> : <div className="space-y-1 text-sm"><p>Customers: <span className="text-[var(--text-muted)]">{datasetMeta.customers.toLocaleString()}</span></p><p>Parts: <span className="text-[var(--text-muted)]">{datasetMeta.parts.toLocaleString()}</span></p><p>Missing cost rows: <span className="text-[var(--text-muted)]">{datasetMeta.missingCostPct.toFixed(2)}%</span></p><p>Dropped rows: <span className="text-[var(--text-muted)]">{Number(datasetMeta.droppedPct ?? 0).toFixed(2)}%</span></p></div>}
      </section>
      <section className="card p-4">
        <h3 className="font-semibold mb-2">Data quality summary — Full Potential Consumption</h3>
        {!potentialSummary.validationRows ? <p className="text-sm text-[var(--text-muted)]">Import the potential workbook to view validation.</p> : <div className="space-y-1 text-sm"><p>Sheets checked: <span className="text-[var(--text-muted)]">{potentialSummary.validationRows.toLocaleString()}</span></p><p>Invalid sheets: <span className="text-[var(--text-muted)]">{potentialSummary.invalidRows.toLocaleString()}</span></p><p>Rule: invalid if missing critical ratio &gt; 20%.</p></div>}
      </section>
    </div>

    {toast && <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl border shadow-lg ${toast.tone === 'success' ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200' : 'bg-rose-500/10 border-rose-400/30 text-rose-200'}`}>{toast.text}</div>}
  </div>;
}
