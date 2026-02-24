import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { labels } from '@/constants/labels';
import { loadDatasetPackage } from '@/data/cache';
import { buildModel } from '@/data/duckdb';
import { useAppStore } from '@/state/store';

const nav = ['/dataset', '/explorer', '/database', '/group-by', '/pricing', '/pricing-comparator', '/potential-tables', '/top-items', '/labels'];
const navLabel: Record<string, string> = { '/dataset': 'Dataset Manager', '/explorer': 'Dashboard', '/group-by': 'Group By', '/database': 'Parts Database', '/pricing': 'Pricing', '/pricing-comparator': 'Pricing Comparator', '/potential-tables': 'Potential Tables', '/top-items': 'Top Items', '/labels': 'Labels' };

export function AppShell({ children }: { children: ReactNode }) {
  const setDataset = useAppStore((s) => s.setDataset);
  const initialized = useRef(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      try {
        setRestoring(true);
        const cached = await loadDatasetPackage();
        if (!cached) return;
        const meta = cached.meta as Record<string, unknown>;
        try {
          await buildModel(cached.data);
        } catch (error) {
          console.warn('Cached dataset model rebuild failed; keeping metadata loaded.', error);
        }
        setDataset({
          loadedAt: String(meta.loadedAt ?? new Date().toISOString()),
          rowCount: Number(meta.rowCount ?? 0),
          missingCostPct: Number(meta.missingCostPct ?? 0),
          fyRange: String(meta.fyRange ?? 'Computed from invoice dates'),
          dateRange: String(meta.dateRange ?? `${meta.dateMin ?? ''} → ${meta.dateMax ?? ''}`),
          customers: Number(meta.customers ?? 0),
          parts: Number(meta.parts ?? 0),
          selectedSheet: meta.selectedSheet ? String(meta.selectedSheet) : undefined,
          droppedPct: Number(meta.droppedPct ?? 0),
          invalidDateRows: Number(meta.invalidDateRows ?? 0)
        });
      } catch (error) {
        console.warn('Failed restoring cached dataset', error);
      } finally {
        setRestoring(false);
      }
    })();
  }, [setDataset]);

  return <div className="min-h-screen text-[var(--text)]">
    <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 px-6 py-4 flex items-center justify-between">
      <Link to="/" className="font-semibold">{labels.appName}</Link>
      <nav className="flex gap-2">{nav.map((n) => <NavLink key={n} to={n} className={({ isActive }) => `px-3 py-1 rounded-full border text-sm ${isActive ? 'border-[var(--teal)] text-[var(--teal)] shadow-[0_0_0_1px_rgba(27,199,179,0.2)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>{navLabel[n] ?? n.slice(1)}</NavLink>)}</nav>
    </header>
    {restoring && <div className="px-6 py-2 text-xs text-[var(--text-muted)]">Restoring cached dataset…</div>}
    <main className="p-6">{children}</main>
  </div>;
}
