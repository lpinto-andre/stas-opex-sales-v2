import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { labels } from '@/constants/labels';
import { loadDatasetPackage, loadPotentialState } from '@/data/cache';
import { buildModel } from '@/data/duckdb';
import { InsightsChatDock } from '@/features/insights/InsightsChatDock';
import { useAppStore } from '@/state/store';

const nav = ['/dataset', '/explorer', '/database', '/group-by', '/pricing', '/pricing-comparator', '/potential-tables', '/top-items', '/labels', '/tips'];

const navLabel: Record<'fr' | 'en', Record<string, string>> = {
  en: { '/dataset': 'Dataset Manager', '/explorer': 'Dashboard', '/group-by': 'Group By', '/database': 'Database', '/pricing': 'Pricing', '/pricing-comparator': 'Comparator', '/potential-tables': 'Potential', '/top-items': 'Top Items', '/labels': 'Labels', '/tips': 'Tips' },
  fr: { '/dataset': 'Gestion Données', '/explorer': 'Tableau de bord', '/group-by': 'Groupes', '/database': 'Base de données', '/pricing': 'Prix', '/pricing-comparator': 'Comparateur', '/potential-tables': 'Potentiel', '/top-items': 'Top Articles', '/labels': 'Étiquettes', '/tips': 'Conseils' }
};

export function AppShell({ children }: { children: ReactNode }) {
  const setDataset = useAppStore((s) => s.setDataset);
  const setPageState = useAppStore((s) => s.setPageState);
  const uiTheme = useAppStore((s) => s.uiTheme);
  const setUiTheme = useAppStore((s) => s.setUiTheme);
  const uiLang = useAppStore((s) => s.uiLang);
  const setUiLang = useAppStore((s) => s.setUiLang);

  const initialized = useRef(false);
  const [restoring, setRestoring] = useState(false);
  const logoSrc = uiTheme === 'dark' ? '/stas-inc-logo-dark.svg' : '/stas-inc-logo.svg';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
  }, [uiTheme]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      try {
        setRestoring(true);
        const potential = await loadPotentialState();
        if (potential) setPageState('potential', potential);
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
          dateRange: String(meta.dateRange ?? `${meta.dateMin ?? ''} -> ${meta.dateMax ?? ''}`),
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
  }, [setDataset, setPageState]);

  return <div className="min-h-screen text-[var(--text)]">
    <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <span className="h-10 w-[8.5rem] shrink-0 flex items-center">
            <img src={logoSrc} alt="STAS Inc logo" className="block h-full w-full object-contain" />
          </span>
          <span className="font-semibold truncate">{labels.appName}</span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <div className="card p-1 flex items-center gap-1" role="group" aria-label={uiLang === 'fr' ? 'Sélection du thème' : 'Theme selection'}>
            <button className={`px-2 py-1 text-xs rounded ${uiTheme === 'light' ? 'bg-[var(--teal)] text-black' : 'text-[var(--text-muted)]'}`} onClick={() => setUiTheme('light')}>{uiLang === 'fr' ? 'Clair' : 'Light'}</button>
            <button className={`px-2 py-1 text-xs rounded ${uiTheme === 'dark' ? 'bg-[var(--teal)] text-black' : 'text-[var(--text-muted)]'}`} onClick={() => setUiTheme('dark')}>{uiLang === 'fr' ? 'Sombre' : 'Dark'}</button>
          </div>
          <div className="card p-1 flex items-center gap-1" role="group" aria-label={uiLang === 'fr' ? 'Sélection de la langue' : 'Language selection'}>
            <button className={`px-2 py-1 text-xs rounded ${uiLang === 'en' ? 'bg-[var(--teal)] text-black' : 'text-[var(--text-muted)]'}`} onClick={() => setUiLang('en')}>EN</button>
            <button className={`px-2 py-1 text-xs rounded ${uiLang === 'fr' ? 'bg-[var(--teal)] text-black' : 'text-[var(--text-muted)]'}`} onClick={() => setUiLang('fr')}>FR</button>
          </div>
        </div>
      </div>
      <nav className="mt-3 overflow-x-auto">
        <div className="app-nav-strip w-max min-w-full pr-1">
          {nav.map((n) => <NavLink key={n} to={n} className={({ isActive }) => `app-nav-btn ${isActive ? 'app-nav-btn-active' : ''}`}>{navLabel[uiLang][n] ?? n.slice(1)}</NavLink>)}
        </div>
      </nav>
    </header>
    {restoring && <div className="px-6 py-2 text-xs text-[var(--text-muted)]">{uiLang === 'fr' ? 'Restauration du cache...' : 'Restoring cached dataset...'}</div>}
    <main className="p-6">{children}</main>
    <InsightsChatDock />
  </div>;
}

