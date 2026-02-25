import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { labels } from '@/constants/labels';
import { loadDatasetPackage } from '@/data/cache';
import { buildModel } from '@/data/duckdb';
import { useAppStore } from '@/state/store';

const nav = ['/dataset', '/explorer', '/database', '/group-by', '/pricing', '/pricing-comparator', '/potential-tables', '/top-items', '/labels'];

const navLabel: Record<'fr' | 'en', Record<string, string>> = {
  en: { '/dataset': 'Dataset Manager', '/explorer': 'Dashboard', '/group-by': 'Group By', '/database': 'Parts Database', '/pricing': 'Pricing', '/pricing-comparator': 'Pricing Comparator', '/potential-tables': 'Potential', '/top-items': 'Top Items', '/labels': 'Labels' },
  fr: { '/dataset': 'Gestion Données', '/explorer': 'Tableau de bord', '/group-by': 'Groupes', '/database': 'Base Articles', '/pricing': 'Prix', '/pricing-comparator': 'Comparateur Prix', '/potential-tables': 'Potentiel', '/top-items': 'Top Articles', '/labels': 'Étiquettes' }
};

export function AppShell({ children }: { children: ReactNode }) {
  const setDataset = useAppStore((s) => s.setDataset);
  const uiTheme = useAppStore((s) => s.uiTheme);
  const setUiTheme = useAppStore((s) => s.setUiTheme);
  const uiLang = useAppStore((s) => s.uiLang);
  const setUiLang = useAppStore((s) => s.setUiLang);

  const initialized = useRef(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
  }, [uiTheme]);

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
    <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 px-6 py-4 flex items-center justify-between gap-3">
      <Link to="/" className="font-semibold">{labels.appName}</Link>
      <div className="flex items-center gap-2">
        <div className="card p-1 flex items-center gap-1" role="group" aria-label={uiLang === 'fr' ? 'Sélection du thème' : 'Theme selection'}>
          <button className={`px-2 py-1 text-xs rounded ${uiTheme === 'light' ? 'bg-[var(--teal)] text-black' : 'text-[var(--text-muted)]'}`} onClick={() => setUiTheme('light')}>{uiLang === 'fr' ? 'Clair' : 'Light'}</button>
          <button className={`px-2 py-1 text-xs rounded ${uiTheme === 'dark' ? 'bg-[var(--teal)] text-black' : 'text-[var(--text-muted)]'}`} onClick={() => setUiTheme('dark')}>{uiLang === 'fr' ? 'Sombre' : 'Dark'}</button>
        </div>
        <div className="card p-1 flex items-center gap-1" role="group" aria-label={uiLang === 'fr' ? 'Sélection de la langue' : 'Language selection'}>
          <button className={`px-2 py-1 text-xs rounded ${uiLang === 'en' ? 'bg-[var(--teal)] text-black' : 'text-[var(--text-muted)]'}`} onClick={() => setUiLang('en')}>EN</button>
          <button className={`px-2 py-1 text-xs rounded ${uiLang === 'fr' ? 'bg-[var(--teal)] text-black' : 'text-[var(--text-muted)]'}`} onClick={() => setUiLang('fr')}>FR</button>
        </div>
      </div>
      <nav className="flex gap-2 flex-wrap justify-end">{nav.map((n) => <NavLink key={n} to={n} className={({ isActive }) => `px-3 py-1 rounded-full border text-sm ${isActive ? 'border-[var(--teal)] text-[var(--teal)] shadow-[0_0_0_1px_rgba(27,199,179,0.2)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>{navLabel[uiLang][n] ?? n.slice(1)}</NavLink>)}</nav>
    </header>
    {restoring && <div className="px-6 py-2 text-xs text-[var(--text-muted)]">{uiLang === 'fr' ? 'Restauration du cache…' : 'Restoring cached dataset…'}</div>}
    <main className="p-6">{children}</main>
  </div>;
}
