import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppStore } from '@/state/store';
import { labels } from '@/constants/labels';
import { importDatasetFile, type ImportStatus } from '@/data/importPipeline';
import { buildStasPack, clearDatasetPackage, loadDatasetPackage, parseStasPack, saveDatasetPackage } from '@/data/cache';
import { buildModel, dropAllTables } from '@/data/duckdb';

type ToastState = { tone: 'success' | 'error'; text: string } | null;

const steps: { phase: ImportStatus['phase']; label: string }[] = [
  { phase: 'reading', label: 'Reading file' },
  { phase: 'parsing', label: 'Parsing sheet' },
  { phase: 'cleaning', label: 'Cleaning columns' },
  { phase: 'duckdb', label: 'Building dataset' },
  { phase: 'caching', label: 'Caching' }
];

function downloadFile(bytes: Uint8Array, filename: string) {
  const safeBytes = Uint8Array.from(bytes);
  const blob = new Blob([safeBytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DatasetPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [status, setStatus] = useState<ImportStatus>({ phase: 'idle', message: '', progress: 0, startedAt: 0 });
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [sheetWarning, setSheetWarning] = useState<string>('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  const { datasetMeta, performanceMode, setDataset } = useAppStore();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const elapsed = useMemo(() => {
    if (!status.startedAt) return 0;
    return Math.floor((Date.now() - status.startedAt) / 1000);
  }, [status.startedAt, status.progress]);

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

  const executeImport = async (file: File, forcedSheet?: string) => {
    setErrorMsg('');
    setErrorDetails('');
    setSheetWarning('');
    abortRef.current = new AbortController();
    try {
      if (file.name.toLowerCase().endsWith('.staspack')) {
        setStatus({ phase: 'reading', progress: 0.2, message: 'Reading dataset package...', startedAt: Date.now() });
        const buff = new Uint8Array(await file.arrayBuffer());
        const parsed = parseStasPack(buff);
        setStatus({ phase: 'duckdb', progress: 0.7, message: 'Building DuckDB tables...', startedAt: Date.now() });
        await buildModel(parsed.dataNdjson);
        await saveDatasetPackage(parsed.dataNdjson, parsed.meta);
        updateDatasetMeta(parsed.meta as Record<string, unknown>);
        setStatus({ phase: 'done', progress: 1, message: 'Dataset loaded successfully.', startedAt: Date.now() });
        setToast({ tone: 'success', text: 'Dataset package imported.' });
        setTimeout(() => navigate('/explorer'), 500);
        return;
      }

      const result = await importDatasetFile({
        file,
        selectedSheet: forcedSheet,
        signal: abortRef.current.signal,
        onStatus: setStatus
      });

      if (result.type === 'needs-sheet') {
        setStatus({ phase: 'idle', progress: 0, message: '', startedAt: 0 });
        setPendingFile(file);
        setSheetNames(result.sheetNames);
        setSelectedSheet(result.sheetNames[0] ?? '');
        setSheetWarning(result.message);
        return;
      }
      if (result.type === 'cancelled') {
        setStatus({ phase: 'error', progress: 1, message: 'Import cancelled.', startedAt: Date.now() });
        setToast({ tone: 'error', text: 'Import cancelled.' });
        return;
      }
      updateDatasetMeta(result.summary as unknown as Record<string, unknown>);
      setToast({ tone: 'success', text: 'Dataset loaded successfully.' });
      setTimeout(() => navigate('/explorer'), 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected import failure.';
      setErrorMsg(message);
      setErrorDetails(error instanceof Error && error.stack ? error.stack : String(error));
      setToast({ tone: 'error', text: 'Dataset import failed.' });
    } finally {
      abortRef.current = null;
      setIsImporting(false);
      console.log('IMPORT FINISHED');
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    console.log('IMPORT STARTED');
    await executeImport(file);
    event.target.value = '';
  };

  const exportStasPack = async () => {
    const loaded = await loadDatasetPackage();
    if (!loaded) {
      setToast({ tone: 'error', text: 'No cached dataset to export.' });
      return;
    }
    const bytes = buildStasPack(loaded.data, loaded.meta);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    downloadFile(bytes, `stas_opex_dataset_${stamp}.staspack`);
  };

  const clearLocalDataset = async () => {
    await clearDatasetPackage();
    await dropAllTables();
    setDataset(null);
    setToast({ tone: 'success', text: 'Local dataset cleared.' });
  };

  const unregisterSw = async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    setToast({ tone: 'success', text: 'Service workers unregistered.' });
  };

  const cancelImport = () => abortRef.current?.abort();

  return <div className="space-y-4">
    <PageHeader
      title="Dataset Manager - A"
      subtitle="Import status debugging enabled"
      actions={<div className="flex flex-wrap gap-2 items-center">
        <span className="px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--teal)] text-xs text-[var(--teal)]">Build A</span>
        <button disabled={isImporting} className="card px-3 py-2 disabled:opacity-50" onClick={() => fileRef.current?.click()}>Import Excel/CSV/.staspack</button>
        <button className="card px-3 py-2" onClick={exportStasPack}>Export .staspack</button>
        <button className="card px-3 py-2" onClick={clearLocalDataset}>Clear local dataset</button>
        {import.meta.env.DEV && <button className="card px-3 py-2" onClick={unregisterSw}>Unregister SW</button>}
        {isImporting && <button className="card px-3 py-2 border-[var(--danger)] text-[var(--danger)]" onClick={cancelImport}>Cancel</button>}
      </div>}
    />

    <p className="text-xs text-[var(--text-muted)]">mode: {import.meta.env.MODE} | build: {__BUILD_TIME__}</p>

    <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xlsm,.csv,.staspack" onChange={onFileChange} />

    {isImporting && (
      <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center px-4">
        <section className="card p-6 w-full max-w-2xl text-center">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-[var(--teal)] border-t-transparent animate-spin" />
          <h3 className="mt-3 font-semibold text-lg">Importing dataset... please wait</h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">{status.message || 'Parsing Analyse PDR sheet'}</p>
          <p className="text-xs text-[var(--text-muted)] mt-2">Elapsed: {elapsed}s</p>
          <div className="mt-3 h-2 w-full bg-[var(--surface)] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[var(--teal)] to-[var(--green)]" style={{ width: `${Math.round(status.progress * 100)}%` }} /></div>
          <div className="grid grid-cols-5 gap-2 mt-3 text-xs">{steps.map((s) => <div key={s.phase} className="card p-1">{s.label}</div>)}</div>
        </section>
      </div>
    )}

    {sheetWarning && (
      <section className="card p-4 border-[var(--warning)]">
        <p className="text-[var(--warning)] text-sm mb-2">{sheetWarning}</p>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-sm text-[var(--text-muted)]">Choose sheet:</label>
          <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)} className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1">
            {sheetNames.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
          </select>
          <button className="card px-3 py-1" onClick={() => pendingFile && executeImport(pendingFile, selectedSheet)}>Continue Import</button>
        </div>
      </section>
    )}

    {errorMsg && <section className="card p-4 border-[var(--danger)]"><h3 className="font-semibold text-[var(--danger)]">Import failed</h3><p className="text-sm mt-1">{errorMsg}</p><details className="mt-3 text-xs"><summary>Technical details</summary><pre className="mt-2 whitespace-pre-wrap text-[var(--text-muted)]">{errorDetails}</pre></details></section>}

    <div className="grid md:grid-cols-2 gap-4">
      <section className="card p-4 space-y-2"><h3 className="font-semibold">Current dataset status</h3><p>{performanceMode ? labels.hpOn : labels.hpOff}</p><pre className="text-xs text-[var(--text-muted)]">{JSON.stringify(datasetMeta, null, 2) || 'No dataset loaded'}</pre></section>
      <section className="card p-4"><h3 className="font-semibold">Validation report</h3><p className="text-sm text-[var(--text-muted)]">Required columns, filtered rows, invalid dates, and missing cost rows are listed after import.</p></section>
    </div>

    {toast && <div className={`fixed right-4 bottom-4 card px-4 py-2 ${toast.tone === 'success' ? 'border-[var(--green)] text-[var(--green)]' : 'border-[var(--danger)] text-[var(--danger)]'}`}>{toast.text}</div>}
  </div>;
}
