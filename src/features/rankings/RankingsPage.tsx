import { useEffect, useMemo, useState } from 'react';
import { SearchMultiPickFilter } from '@/components/ui/FilterFields';
import { PageHeader } from '@/components/ui/PageHeader';
import { SavedViewsPanel } from '@/components/ui/SavedViewsPanel';
import { useCustomerOptions, useDistinctFilterOptions } from '@/hooks/useFilterOptions';
import { useSavedViews } from '@/hooks/useSavedViews';
import { useAppStore } from '@/state/store';
import { getRanking, type Filters } from '@/data/queries';
import { formatCurrency as currency, formatInteger, formatPercent as pct } from '@/utils/formatters';
import { monthEnd, monthStart, safeMonthInput } from '@/utils/monthRange';

type Entity = 'customers' | 'prodgroup' | 'class' | 'country' | 'territory';
type Metric = 'revenue' | 'orders' | 'profit' | 'margin';
type SortDir = 'desc' | 'asc';
type PeriodMode = 'all' | 'after' | 'before' | 'between';
type RankingRow = { entity: string; revenue: number; orders: number; profit: number; margin: number; active_fy_count: number };
type RankingsSavedView = {
  periodMode: PeriodMode;
  fromMonth: string;
  toMonth: string;
  searchText: string;
  selectedCustomers: string[];
  selectedCountries: string[];
  selectedParts: string[];
  selectedProdGroups: string[];
};

export function RankingsPage() {
  const saved = useAppStore((s) => (s.pageState['rankings'] as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

  const [entity, setEntity] = useState<Entity>((saved.entity as Entity) ?? 'customers');
  const [metric, setMetric] = useState<Metric>((saved.metric as Metric) ?? 'revenue');
  const [dir, setDir] = useState<SortDir>((saved.dir as SortDir) ?? 'desc');
  const [topN, setTopN] = useState(Number(saved.topN ?? 100));
  const [periodMode, setPeriodMode] = useState<PeriodMode>((saved.periodMode as PeriodMode) ?? 'all');
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));
  const [searchText, setSearchText] = useState(String(saved.searchText ?? ''));

  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>((saved.selectedCountries as string[]) ?? []);
  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>((saved.selectedProdGroups as string[]) ?? []);

  const [rows, setRows] = useState<RankingRow[]>([]);
  const customerOptions = useCustomerOptions(customerSearch, 150);
  const countryOptions = useDistinctFilterOptions('country', countrySearch, 150);
  const partOptions = useDistinctFilterOptions('part_num', partSearch, 150);
  const groupOptions = useDistinctFilterOptions('prod_group', groupSearch, 150);

  const filters = useMemo<Filters>(() => {
    const f: Filters = {
      customers: selectedCustomers.length ? selectedCustomers : undefined,
      countries: selectedCountries.length ? selectedCountries : undefined,
      parts: selectedParts.length ? selectedParts : undefined,
      prodGroups: selectedProdGroups.length ? selectedProdGroups : undefined,
      searchLineDesc: searchText || undefined
    };
    if (periodMode === 'after') f.startDate = monthStart(fromMonth) || undefined;
    if (periodMode === 'before') f.endDate = monthEnd(toMonth) || undefined;
    if (periodMode === 'between') {
      f.startDate = monthStart(fromMonth) || undefined;
      f.endDate = monthEnd(toMonth) || undefined;
    }
    return f;
  }, [selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, searchText, periodMode, fromMonth, toMonth]);
  const currentSavedView = useMemo<RankingsSavedView>(() => ({
    periodMode,
    fromMonth,
    toMonth,
    searchText,
    selectedCustomers,
    selectedCountries,
    selectedParts,
    selectedProdGroups
  }), [periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups]);
  const {
    activeViewName,
    collapsed: savedViewsCollapsed,
    deleteSavedView,
    saveCurrentView,
    saveName,
    savedViews,
    setCollapsed: setSavedViewsCollapsed,
    setSaveName
  } = useSavedViews<RankingsSavedView>({
    storageKey: 'saved-views-rankings',
    currentSnapshot: currentSavedView
  });

  useEffect(() => {
    getRanking(filters, entity, metric, 2500).then((r) => {
      const sorted = [...(r as RankingRow[])].sort((a, b) => {
        const va = Number(a[metric]);
        const vb = Number(b[metric]);
        return dir === 'desc' ? vb - va : va - vb;
      }).slice(0, topN);
      setRows(sorted);
    });
  }, [filters, entity, metric, dir, topN]);

  const chips = [
    ...selectedCustomers.map((v) => ({ k: 'customers' as const, v })),
    ...selectedCountries.map((v) => ({ k: 'countries' as const, v })),
    ...selectedParts.map((v) => ({ k: 'parts' as const, v })),
    ...selectedProdGroups.map((v) => ({ k: 'prodGroups' as const, v }))
  ];

  const removeValue = (kind: 'customers' | 'countries' | 'parts' | 'prodGroups', value: string) => {
    if (kind === 'customers') setSelectedCustomers((x) => x.filter((v) => v !== value));
    if (kind === 'countries') setSelectedCountries((x) => x.filter((v) => v !== value));
    if (kind === 'parts') setSelectedParts((x) => x.filter((v) => v !== value));
    if (kind === 'prodGroups') setSelectedProdGroups((x) => x.filter((v) => v !== value));
  };

  const resetFilters = () => {
    setCustomerSearch('');
    setCountrySearch('');
    setPartSearch('');
    setGroupSearch('');
    setSelectedCustomers([]);
    setSelectedCountries([]);
    setSelectedParts([]);
    setSelectedProdGroups([]);
    setSearchText('');
    setPeriodMode('all');
    setFromMonth('');
    setToMonth('');
  };
  const applySavedView = (view: RankingsSavedView) => {
    setPeriodMode(view.periodMode);
    setFromMonth(view.fromMonth);
    setToMonth(view.toMonth);
    setSearchText(view.searchText);
    setSelectedCustomers(view.selectedCustomers);
    setSelectedCountries(view.selectedCountries);
    setSelectedParts(view.selectedParts);
    setSelectedProdGroups(view.selectedProdGroups);
  };
  const describeSavedView = (view: RankingsSavedView) => {
    const parts = [
      view.periodMode === 'all'
        ? 'All period'
        : view.periodMode === 'after'
          ? `After ${view.fromMonth || '...'}`
          : view.periodMode === 'before'
            ? `Before ${view.toMonth || '...'}`
            : `${view.fromMonth || '...'} to ${view.toMonth || '...'}`
    ];
    if (view.selectedCustomers.length) parts.push(`${view.selectedCustomers.length} customer${view.selectedCustomers.length > 1 ? 's' : ''}`);
    if (view.selectedCountries.length) parts.push(`${view.selectedCountries.length} countr${view.selectedCountries.length > 1 ? 'ies' : 'y'}`);
    if (view.selectedParts.length) parts.push(`${view.selectedParts.length} part${view.selectedParts.length > 1 ? 's' : ''}`);
    if (view.selectedProdGroups.length) parts.push(`${view.selectedProdGroups.length} group${view.selectedProdGroups.length > 1 ? 's' : ''}`);
    if (view.searchText) parts.push(`LineDesc contains "${view.searchText}"`);
    return parts.join(' | ');
  };
  const savedViewItems = savedViews.map((view) => ({
    name: view.name,
    summary: describeSavedView(view.snapshot),
    active: view.name === activeViewName
  }));


  useEffect(() => {
    setPageState('rankings', { entity, metric, dir, topN, periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups });
  }, [entity, metric, dir, topN, periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, setPageState]);

  return <div>
    <PageHeader title="Group By" subtitle="Leaderboard by selected business dimension." />

    <SavedViewsPanel
      description="Save the current Group By filters, then apply or delete them whenever needed."
      saveName={saveName}
      onSaveNameChange={setSaveName}
      onSave={saveCurrentView}
      savePlaceholder="Ex: EMEA filtered groups"
      collapsed={savedViewsCollapsed}
      onToggleCollapsed={() => setSavedViewsCollapsed(!savedViewsCollapsed)}
      items={savedViewItems}
      onApply={(name) => {
        const target = savedViews.find((view) => view.name === name);
        if (target) applySavedView(target.snapshot);
      }}
      onDelete={deleteSavedView}
      collapsedSummary={`${formatInteger(savedViews.length)} saved view${savedViews.length === 1 ? '' : 's'}. Expand to manage them.`}
    />

    <section className="card p-3 mb-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="font-semibold">Filters</h3>
          <p className="text-xs text-[var(--text-muted)] mt-2">Tip: tick multiple values in each filter to combine selections freely.</p>
        </div>
        <button className="card px-3 py-1 text-xs" onClick={resetFilters}>Reset filters</button>
      </div>
      <div className="grid lg:grid-cols-4 gap-3">
        <SearchMultiPickFilter searchValue={customerSearch} onSearchChange={setCustomerSearch} searchPlaceholder="Search customer" label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} />
        <SearchMultiPickFilter searchValue={countrySearch} onSearchChange={setCountrySearch} searchPlaceholder="Search country" label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} />
        <SearchMultiPickFilter searchValue={partSearch} onSearchChange={setPartSearch} searchPlaceholder="Search part" label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} />
        <SearchMultiPickFilter searchValue={groupSearch} onSearchChange={setGroupSearch} searchPlaceholder="Search group" label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} />
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">Period
          <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card px-2 py-1 block w-full mt-1">
            <option value="all">All</option>
            <option value="after">After (month)</option>
            <option value="before">Before (month)</option>
            <option value="between">Between (months)</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={fromMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setFromMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={toMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setToMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((c) => <button key={`${c.k}:${c.v}`} className="card px-2 py-1 text-xs" onClick={() => removeValue(c.k, c.v)}>{c.k}:{c.v} ×</button>)}</div>}
    </section>

    <section className="card p-3 mb-3">
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
        <label className="text-xs text-[var(--text-muted)]">Group by
          <select value={entity} onChange={(e) => setEntity(e.target.value as Entity)} className="card px-2 py-1 block w-full mt-1">
            <option value="customers">Customers</option>
            <option value="prodgroup">ProdGroup</option>
            <option value="class">Class</option>
            <option value="country">Country</option>
            <option value="territory">Territory</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">Rank by
          <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="card px-2 py-1 block w-full mt-1">
            <option value="revenue">Revenue</option>
            <option value="orders">Orders</option>
            <option value="profit">Profit</option>
            <option value="margin">Profit %</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">Order
          <select value={dir} onChange={(e) => setDir(e.target.value as SortDir)} className="card px-2 py-1 block w-full mt-1">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">Items to show
          <input type="number" value={topN} min={1} onChange={(e) => setTopN(Math.max(1, Number(e.target.value || 100)))} className="card w-full px-2 py-1 mt-1" />
        </label>
      </div>
    </section>

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]"><th className="px-3 py-2">#</th><th className="px-3 py-2">Entity</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Margin</th><th className="px-3 py-2">Active FY</th></tr></thead>
        <tbody>{rows.map((row, idx) => <tr key={`${row.entity}-${idx}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
          <td className="px-3 py-2 whitespace-nowrap">{idx + 1}</td><td className="px-3 py-2 whitespace-normal break-words leading-5">{row.entity}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue ?? 0))}</td><td className="px-3 py-2 whitespace-nowrap">{formatInteger(Number(row.orders ?? 0))}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit ?? 0))}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.margin ?? 0))}</td><td className="px-3 py-2 whitespace-nowrap">{formatInteger(Number(row.active_fy_count ?? 0))}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </div>;
}
