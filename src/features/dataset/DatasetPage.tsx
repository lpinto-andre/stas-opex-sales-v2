import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppStore } from '@/state/store';
import { labels } from '@/constants/labels';
import { importDatasetFile, type ImportStatus } from '@/data/importPipeline';

type ToastState = { tone: 'success' | 'error'; text: string } | null;

const steps: { phase: ImportStatus['phase']; label: string }[] = [
  { phase: 'reading', label: 'Reading file' },
  { phase: 'parsing', label: 'Parsing sheet' },
  { phase: 'cleaning', label: 'Cleaning columns' },
  { phase: 'duckdb', label: 'Building dataset' },
  { phase: 'caching', label: 'Caching' }
];

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

  const { datasetMeta, performanceMode, setDataset } = useAppStore();
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const elapsed = useMemo(() => {
    if (!status.startedAt) return 0;
    return Math.floor((Date.now() - status.startedAt) / 1000);
  }, [status.startedAt, status.progress]);

  const setStatusSafe = (next: ImportStatus) => {
    setStatus({ ...next });
  };

  const executeImport = async (file: File, forcedSheet?: string) => {
    setErrorMsg('');
    setErrorDetails('');
    setSheetWarning('');
    abortRef.current = new AbortController();
    try {
      const result = await importDatasetFile({
        file,
        selectedSheet: forcedSheet,
        signal: abortRef.current.signal,
        onStatus: setStatusSafe
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

      const summary = result.summary;
      setDataset({
        loadedAt: summary.loadedAt,
        rowCount: summary.rowCount,
        missingCostPct: summary.missingCostPct,
        fyRange: 'Computed from invoice dates',
        dateRange: `${summary.dateMin} → ${summary.dateMax}`,
        customers: summary.customers,
        parts: summary.parts,
        selectedSheet: summary.selectedSheet,
        droppedPct: summary.droppedPct,
        invalidDateRows: summary.invalidDateRows
      });
      setToast({ tone: 'success', text: 'Dataset loaded successfully.' });
      setTimeout(() => navigate('/explorer'), 800);
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

  const cancelImport = () => {
    abortRef.current?.abort();
  };

  return <div className="space-y-4">
    <PageHeader
      title="Dataset Manager - AA"
      subtitle="Import status debugging enabled"
      actions={<div className="flex gap-2">
        <button disabled={isImporting} className="card px-3 py-2 disabled:opacity-50" onClick={() => fileRef.current?.click()}>Import Excel/CSV</button>
        {isImporting && <button className="card px-3 py-2 border-[var(--danger)] text-[var(--danger)]" onClick={cancelImport}>Cancel</button>}
      </div>}
    />

    <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xlsm,.csv,.staspack" onChange={onFileChange} />

    {isImporting && (
      <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center px-4">
        <section className="card p-6 w-full max-w-2xl text-center">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-[var(--teal)] border-t-transparent animate-spin" />
          <h3 className="mt-3 font-semibold text-lg">Importing dataset... please wait</h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">Parsing Analyse PDR sheet</p>
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

    {isImporting && (
      <section className="card p-4 shadow-[0_0_0_1px_rgba(27,199,179,0.25)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full border-2 border-[var(--teal)] border-t-transparent animate-spin" />
            <div>
              <div className="font-medium">Import in progress...</div>
              <div className="text-xs text-[var(--text-muted)]">{status.message} · Do not close this tab.</div>
            </div>
          </div>
          <div className="text-xs text-[var(--text-muted)]">Elapsed: {elapsed}s</div>
        </div>
        <div className="mt-3 h-2 w-full bg-[var(--surface)] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[var(--teal)] to-[var(--green)]" style={{ width: `${Math.round(status.progress * 100)}%` }} />
        </div>
        <div className="grid md:grid-cols-5 gap-2 mt-3 text-xs">
          {steps.map((step) => {
            const done = steps.findIndex((s) => s.phase === step.phase) < steps.findIndex((s) => s.phase === status.phase);
            const active = status.phase === step.phase;
            return <div key={step.phase} className="card px-2 py-1 text-center">
              <span className={done ? 'text-[var(--green)]' : active ? 'text-[var(--teal)]' : 'text-[var(--text-muted)]'}>{done ? '✓' : active ? '•' : '○'} {step.label}</span>
            </div>;
          })}
        </div>
      </section>
    )}

    {errorMsg && (
      <section className="card p-4 border-[var(--danger)]">
        <h3 className="font-semibold text-[var(--danger)]">Import failed</h3>
        <p className="text-sm mt-1">{errorMsg}</p>
        <ul className="text-xs text-[var(--text-muted)] list-disc ml-4 mt-2">
          <li>Check sheet name and confirm "Analyse PDR" exists.</li>
          <li>Ensure required columns like InvoiceDate, Amount, and OrderNum are available.</li>
          <li>Verify date and numeric columns are not fully blank.</li>
        </ul>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-[var(--text-muted)]">Technical details</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[var(--text-muted)]">{errorDetails}</pre>
        </details>
      </section>
    )}

    {datasetMeta && status.phase === 'done' && (
      <section className="card p-4 border-[var(--green)]">
        <h3 className="font-semibold text-[var(--green)]">Dataset loaded successfully</h3>
        <div className="grid md:grid-cols-3 gap-2 mt-2 text-sm">
          <p>Rows imported: <span className="font-semibold">{datasetMeta.rowCount}</span></p>
          <p>Date range: <span className="font-semibold">{datasetMeta.dateRange}</span></p>
          <p>Customers: <span className="font-semibold">{datasetMeta.customers}</span></p>
          <p>Parts: <span className="font-semibold">{datasetMeta.parts}</span></p>
          <p>Rows dropped (Amount≤0): <span className="font-semibold">{(datasetMeta.droppedPct ?? 0).toFixed(2)}%</span></p>
          <p className={datasetMeta.missingCostPct > 0 ? 'text-[var(--warning)]' : ''}>Missing cost: <span className="font-semibold">{datasetMeta.missingCostPct.toFixed(2)}%</span></p>
          <p>Loaded: <span className="font-semibold">{new Date(datasetMeta.loadedAt).toLocaleString()}</span></p>
          <p>Sheet used: <span className="font-semibold">{datasetMeta.selectedSheet ?? 'N/A'}</span></p>
        </div>
        <button className="card px-3 py-2 mt-3" onClick={() => navigate('/explorer')}>Go to Explorer</button>
      </section>
    )}

    <div className="grid md:grid-cols-2 gap-4">
      <section className="card p-4 space-y-2"><h3 className="font-semibold">Current dataset status</h3><p>{performanceMode ? labels.hpOn : labels.hpOff}</p><pre className="text-xs text-[var(--text-muted)]">{JSON.stringify(datasetMeta, null, 2) || 'No dataset loaded'}</pre></section>
      <section className="card p-4"><h3 className="font-semibold">Validation report</h3><p className="text-sm text-[var(--text-muted)]">Required columns, filtered rows, invalid dates, and missing cost rows are listed after import.</p></section>
    </div>

    {toast && (
      <div className={`fixed right-4 bottom-4 card px-4 py-2 ${toast.tone === 'success' ? 'border-[var(--green)] text-[var(--green)]' : 'border-[var(--danger)] text-[var(--danger)]'}`}>
        {toast.text}
      </div>
    )}
  </div>;
}
