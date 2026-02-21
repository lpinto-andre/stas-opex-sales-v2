import { useRef } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppStore } from '@/state/store';
import { labels } from '@/constants/labels';

export function DatasetPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { datasetMeta, performanceMode } = useAppStore();
  return <div>
    <PageHeader title="Dataset Manager" subtitle="Import Epicor Analyse PDR and cache locally." actions={<button className="card px-3 py-2" onClick={() => fileRef.current?.click()}>Import Excel/CSV</button>} />
    <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xlsm,.csv,.staspack" />
    <div className="grid md:grid-cols-2 gap-4">
      <section className="card p-4 space-y-2"><h3 className="font-semibold">Current dataset status</h3><p>{performanceMode ? labels.hpOn : labels.hpOff}</p><pre className="text-xs text-[var(--text-muted)]">{JSON.stringify(datasetMeta, null, 2) || 'No dataset loaded'}</pre></section>
      <section className="card p-4"><h3 className="font-semibold">Validation report</h3><p className="text-sm text-[var(--text-muted)]">Required columns, filtered rows, invalid dates, and missing cost rows are listed after import.</p></section>
    </div>
  </div>;
}
