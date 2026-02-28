import { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { SearchMultiPickFilter } from '@/components/ui/FilterFields';
import { PageHeader } from '@/components/ui/PageHeader';
import { SavedViewsPanel } from '@/components/ui/SavedViewsPanel';
import { TablePager } from '@/components/ui/TablePager';
import { cartesianAxisProps, chartTooltipProps } from '@/components/ui/chartStyles';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCustomerOptions, useDistinctFilterOptions } from '@/hooks/useFilterOptions';
import { usePaginatedRows } from '@/hooks/usePaginatedRows';
import { useSavedViews } from '@/hooks/useSavedViews';
import { KPIStatCard } from '@/components/ui/KPIStatCard';
import { getDetailRows, getPricingKPIs, getRevenueCostProfitOverTime, type Filters } from '@/data/queries';
import { useAppStore } from '@/state/store';
import { formatCurrency as currency, formatInteger, formatPercent as pct } from '@/utils/formatters';
import { monthEnd, monthStart, safeMonthInput } from '@/utils/monthRange';

type PeriodMode = 'all' | 'after' | 'before' | 'between';
type RankBy = 'price' | 'cost' | 'profit' | 'profit_pct';
type SortDir = 'desc' | 'asc';

type PricingRow = {
  invoice_month: string;
  invoice_num: string;
  cust_id: string;
  cust_name: string;
  country: string;
  territory: string;
  class_id: string;
  part_num: string;
  line_desc_short: string;
  line_desc_full: string;
  amount: number;
  cost: number | null;
  profit: number | null;
  margin_pct: number | null;
};
type PricingSavedView = {
  periodMode: PeriodMode;
  fromMonth: string;
  toMonth: string;
  searchText: string;
  selectedCustomers: string[];
  selectedCountries: string[];
  selectedTerritories: string[];
  selectedParts: string[];
  selectedProdGroups: string[];
  selectedClasses: string[];
};

export function PricingPage() {
  const datasetMeta = useAppStore((s) => s.datasetMeta);
  const saved = useAppStore((s) => (s.pageState.pricing as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

  const [periodMode, setPeriodMode] = useState<PeriodMode>((saved.periodMode as PeriodMode) ?? 'all');
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));
  const [searchText, setSearchText] = useState(String(saved.searchText ?? ''));
  const [rankBy, setRankBy] = useState<RankBy>((saved.rankBy as RankBy) ?? 'profit');
  const [order, setOrder] = useState<SortDir>((saved.order as SortDir) ?? 'desc');

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>((saved.selectedCountries as string[]) ?? []);
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>((saved.selectedTerritories as string[]) ?? []);
  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>((saved.selectedProdGroups as string[]) ?? []);
  const [selectedClasses, setSelectedClasses] = useState<string[]>((saved.selectedClasses as string[]) ?? []);

  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [territorySearch, setTerritorySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');

  const customerSearchQ = useDebouncedValue(customerSearch, 250);
  const countrySearchQ = useDebouncedValue(countrySearch, 250);
  const territorySearchQ = useDebouncedValue(territorySearch, 250);
  const partSearchQ = useDebouncedValue(partSearch, 250);
  const groupSearchQ = useDebouncedValue(groupSearch, 250);
  const classSearchQ = useDebouncedValue(classSearch, 250);

  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [trend, setTrend] = useState<Record<string, unknown>[]>([]);
  const [graphicsCollapsed, setGraphicsCollapsed] = useState(Boolean(saved.graphicsCollapsed ?? false));
  const [loadError, setLoadError] = useState('');

  const customerOptions = useCustomerOptions(customerSearchQ, 150);
  const countryOptions = useDistinctFilterOptions('country', countrySearchQ, 150);
  const territoryOptions = useDistinctFilterOptions('territory', territorySearchQ, 150);
  const partOptions = useDistinctFilterOptions('part_num', partSearchQ, 150);
  const groupOptions = useDistinctFilterOptions('prod_group', groupSearchQ, 150);
  const classOptions = useDistinctFilterOptions('class_id', classSearchQ, 150);

  const filters = useMemo<Filters>(() => {
    const f: Filters = {
      customers: selectedCustomers.length ? selectedCustomers : undefined,
      countries: selectedCountries.length ? selectedCountries : undefined,
      territories: selectedTerritories.length ? selectedTerritories : undefined,
      parts: selectedParts.length ? selectedParts : undefined,
      prodGroups: selectedProdGroups.length ? selectedProdGroups : undefined,
      classes: selectedClasses.length ? selectedClasses : undefined,
      searchLineDesc: searchText || undefined
    };
    if (periodMode === 'after') f.startDate = monthStart(fromMonth) || undefined;
    if (periodMode === 'before') f.endDate = monthEnd(toMonth) || undefined;
    if (periodMode === 'between') { f.startDate = monthStart(fromMonth) || undefined; f.endDate = monthEnd(toMonth) || undefined; }
    return f;
  }, [selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, selectedClasses, searchText, periodMode, fromMonth, toMonth]);
  const currentSavedView = useMemo<PricingSavedView>(() => ({
    periodMode,
    fromMonth,
    toMonth,
    searchText,
    selectedCustomers,
    selectedCountries,
    selectedTerritories,
    selectedParts,
    selectedProdGroups,
    selectedClasses
  }), [periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, selectedClasses]);
  const {
    activeViewName,
    collapsed: savedViewsCollapsed,
    deleteSavedView,
    saveCurrentView,
    saveName,
    savedViews,
    setCollapsed: setSavedViewsCollapsed,
    setSaveName
  } = useSavedViews<PricingSavedView>({
    storageKey: 'saved-views-pricing',
    currentSnapshot: currentSavedView
  });

  useEffect(() => {
    let active = true;
    setLoadError('');
    Promise.allSettled([
      getPricingKPIs(filters, true),
      getDetailRows(filters, 2000),
      getRevenueCostProfitOverTime(filters, true, 'monthly')
    ]).then(([kpiRes, rowsRes, trendRes]) => {
      if (!active) return;
      setKpis(kpiRes.status === 'fulfilled' ? ((kpiRes.value as Record<string, number>) ?? {}) : {});
      setTrend(trendRes.status === 'fulfilled' ? ((trendRes.value as Record<string, unknown>[]) ?? []) : []);
      if (rowsRes.status === 'fulfilled') {
        setRows((rowsRes.value as Record<string, unknown>[]).map((r) => ({
          invoice_month: String(r.invoice_date ?? '').slice(0, 7), invoice_num: String(r.invoice_num ?? ''), cust_id: String(r.cust_id ?? ''), cust_name: String(r.cust_name ?? ''),
          country: String(r.country ?? ''), territory: String(r.territory ?? ''), class_id: String(r.class_id ?? ''), part_num: String(r.part_num ?? ''), line_desc_short: String(r.line_desc ?? '').slice(0, 25), line_desc_full: String(r.line_desc ?? ''),
          amount: Number(r.amount ?? 0), cost: r.cost == null ? null : Number(r.cost), profit: r.profit == null ? null : Number(r.profit), margin_pct: r.margin_pct == null ? null : Number(r.margin_pct)
        })));
      } else setRows([]);

      const firstError = [kpiRes, rowsRes, trendRes].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      setLoadError(firstError ? (firstError.reason instanceof Error ? firstError.reason.message : 'Failed to load pricing analytics') : '');
    });
    return () => { active = false; };
  }, [filters]);


  const rowsSorted = useMemo(() => {
    const v = [...rows];
    const value = (r: PricingRow) => rankBy === 'price' ? r.amount : rankBy === 'cost' ? Number(r.cost ?? Number.NEGATIVE_INFINITY) : rankBy === 'profit' ? Number(r.profit ?? Number.NEGATIVE_INFINITY) : Number(r.margin_pct ?? Number.NEGATIVE_INFINITY);
    v.sort((a, b) => order === 'desc' ? value(b) - value(a) : value(a) - value(b));
    return v;
  }, [rows, rankBy, order]);
  const pricingTable = usePaginatedRows(rowsSorted, 100);

  const trendData = useMemo(() => trend.map((r) => ({ period: String(r.period ?? ''), revenue: Number(r.revenue ?? 0), cost: Number(r.cost ?? 0), profit: Number(r.profit ?? 0), margin_pct: Number(r.margin_pct ?? 0) })), [trend]);

  useEffect(() => {
    setPageState('pricing', { periodMode, fromMonth, toMonth, searchText, rankBy, order, graphicsCollapsed, selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, selectedClasses });
  }, [periodMode, fromMonth, toMonth, searchText, rankBy, order, graphicsCollapsed, selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, selectedClasses, setPageState]);

  const chips = [
    ...selectedCustomers.map((v) => ({ k: 'customers' as const, v })), ...selectedCountries.map((v) => ({ k: 'countries' as const, v })), ...selectedTerritories.map((v) => ({ k: 'territories' as const, v })),
    ...selectedParts.map((v) => ({ k: 'parts' as const, v })), ...selectedProdGroups.map((v) => ({ k: 'prodGroups' as const, v })), ...selectedClasses.map((v) => ({ k: 'classes' as const, v }))
  ];
  const removeValue = (kind: 'customers' | 'countries' | 'territories' | 'parts' | 'prodGroups' | 'classes', value: string) => {
    if (kind === 'customers') setSelectedCustomers((x) => x.filter((v) => v !== value));
    if (kind === 'countries') setSelectedCountries((x) => x.filter((v) => v !== value));
    if (kind === 'territories') setSelectedTerritories((x) => x.filter((v) => v !== value));
    if (kind === 'parts') setSelectedParts((x) => x.filter((v) => v !== value));
    if (kind === 'prodGroups') setSelectedProdGroups((x) => x.filter((v) => v !== value));
    if (kind === 'classes') setSelectedClasses((x) => x.filter((v) => v !== value));
  };

  const resetFilters = () => {
    setCustomerSearch('');
    setCountrySearch('');
    setTerritorySearch('');
    setPartSearch('');
    setGroupSearch('');
    setClassSearch('');
    setSelectedCustomers([]);
    setSelectedCountries([]);
    setSelectedTerritories([]);
    setSelectedParts([]);
    setSelectedProdGroups([]);
    setSelectedClasses([]);
    setSearchText('');
    setPeriodMode('all');
    setFromMonth('');
    setToMonth('');
  };
  const applySavedView = (view: PricingSavedView) => {
    setPeriodMode(view.periodMode);
    setFromMonth(view.fromMonth);
    setToMonth(view.toMonth);
    setSearchText(view.searchText);
    setSelectedCustomers(view.selectedCustomers);
    setSelectedCountries(view.selectedCountries);
    setSelectedTerritories(view.selectedTerritories);
    setSelectedParts(view.selectedParts);
    setSelectedProdGroups(view.selectedProdGroups);
    setSelectedClasses(view.selectedClasses);
  };
  const describeSavedView = (view: PricingSavedView) => {
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
    if (view.selectedTerritories.length) parts.push(`${view.selectedTerritories.length} territor${view.selectedTerritories.length > 1 ? 'ies' : 'y'}`);
    if (view.selectedParts.length) parts.push(`${view.selectedParts.length} part${view.selectedParts.length > 1 ? 's' : ''}`);
    if (view.selectedProdGroups.length) parts.push(`${view.selectedProdGroups.length} group${view.selectedProdGroups.length > 1 ? 's' : ''}`);
    if (view.selectedClasses.length) parts.push(`${view.selectedClasses.length} class${view.selectedClasses.length > 1 ? 'es' : ''}`);
    if (view.searchText) parts.push(`LineDesc contains "${view.searchText}"`);
    return parts.join(' | ');
  };
  const savedViewItems = savedViews.map((view) => ({
    name: view.name,
    summary: describeSavedView(view.snapshot),
    active: view.name === activeViewName
  }));


  return <div>
    <PageHeader title="Pricing" subtitle={datasetMeta ? `${datasetMeta.dateRange} · ${formatInteger(datasetMeta.rowCount)} rows` : 'Upload dataset to start'} />

    {loadError && <div className="card p-3 mb-3 border border-red-400/40 text-red-300 text-sm">{loadError}</div>}

    <SavedViewsPanel
      description="Save the current Pricing filters, then apply or delete them whenever needed."
      saveName={saveName}
      onSaveNameChange={setSaveName}
      onSave={saveCurrentView}
      savePlaceholder="Ex: APAC critical pricing"
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
      <div className="grid lg:grid-cols-3 gap-3">
        <SearchMultiPickFilter searchValue={customerSearch} onSearchChange={setCustomerSearch} searchPlaceholder="Search customer" label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} />
        <SearchMultiPickFilter searchValue={countrySearch} onSearchChange={setCountrySearch} searchPlaceholder="Search country" label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} />
        <SearchMultiPickFilter searchValue={territorySearch} onSearchChange={setTerritorySearch} searchPlaceholder="Search territory" label="Territories" options={territoryOptions} values={selectedTerritories} onChange={setSelectedTerritories} />
        <SearchMultiPickFilter searchValue={partSearch} onSearchChange={setPartSearch} searchPlaceholder="Search part" label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} />
        <SearchMultiPickFilter searchValue={groupSearch} onSearchChange={setGroupSearch} searchPlaceholder="Search group" label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} />
        <SearchMultiPickFilter searchValue={classSearch} onSearchChange={setClassSearch} searchPlaceholder="Search class" label="Class" options={classOptions} values={selectedClasses} onChange={setSelectedClasses} />
      </div>
      <div className="grid md:grid-cols-4 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input value={fromMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setFromMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input value={toMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setToMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
        <label className="text-xs text-[var(--text-muted)]">Period<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card px-2 py-1 block w-full mt-1"><option value="all">All</option><option value="after">After (month)</option><option value="before">Before (month)</option><option value="between">Between (months)</option></select></label>
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((c) => <button key={`${c.k}:${c.v}`} className="card px-2 py-1 text-xs" onClick={() => removeValue(c.k, c.v)}>{c.k}:{c.v} ×</button>)}</div>}
    </section>

    <div className="grid md:grid-cols-4 gap-3 mb-4">
      <KPIStatCard label="Revenue" value={currency(Number(kpis.revenue ?? 0))} />
      <KPIStatCard label="Cost" value={currency(Number(kpis.cost ?? 0))} />
      <KPIStatCard label="Profit" value={currency(Number(kpis.profit ?? 0))} />
      <KPIStatCard label="Margin %" value={pct(Number(kpis.margin_pct ?? 0))} />
    </div>

    <section className="mb-4 border-2 border-[var(--teal)]/40 rounded-2xl p-4 bg-[var(--surface)]/20">
      <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-base">Pricing Graphics</h3><button className="card px-3 py-1 text-xs" onClick={() => setGraphicsCollapsed((x) => !x)}>{graphicsCollapsed ? 'Show pricing graphics' : 'Hide pricing graphics'}</button></div>
      {!graphicsCollapsed && <div className="grid xl:grid-cols-2 gap-4">
        <section className="card p-3 h-[22rem]"><h3 className="font-semibold mb-2">Revenue vs. Time</h3><ResponsiveContainer><LineChart data={trendData}><XAxis dataKey="period" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Line type="monotone" dataKey="revenue" stroke="#06b6d4" /></LineChart></ResponsiveContainer></section>
        <section className="card p-3 h-[22rem]"><h3 className="font-semibold mb-2">Cost vs. Time</h3><ResponsiveContainer><LineChart data={trendData}><XAxis dataKey="period" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Line type="monotone" dataKey="cost" stroke="#f59e0b" /></LineChart></ResponsiveContainer></section>
        <section className="card p-3 h-[22rem]"><h3 className="font-semibold mb-2">Profit vs. Time</h3><ResponsiveContainer><LineChart data={trendData}><XAxis dataKey="period" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Line type="monotone" dataKey="profit" stroke="#22c55e" /></LineChart></ResponsiveContainer></section>
        <section className="card p-3 h-[22rem]"><h3 className="font-semibold mb-2">Margin % vs. Time</h3><ResponsiveContainer><LineChart data={trendData}><XAxis dataKey="period" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => pct(Number(v))} {...chartTooltipProps} /><Line type="monotone" dataKey="margin_pct" stroke="#a855f7" /></LineChart></ResponsiveContainer></section>
      </div>}
    </section>

    <section className="card p-3 mb-3">
      <div className="grid md:grid-cols-4 gap-2">
        <label className="text-xs text-[var(--text-muted)]">Rank by<select value={rankBy} onChange={(e) => setRankBy(e.target.value as RankBy)} className="card px-2 py-1 block w-full mt-1"><option value="price">Price</option><option value="cost">Cost</option><option value="profit">Profit</option><option value="profit_pct">Profit %</option></select></label>
        <label className="text-xs text-[var(--text-muted)]">Sort<select value={order} onChange={(e) => setOrder(e.target.value as SortDir)} className="card px-2 py-1 block w-full mt-1"><option value="desc">Desc</option><option value="asc">Asc</option></select></label>
      </div>
    </section>


    <TablePager
      totalRows={rowsSorted.length}
      page={pricingTable.page}
      pageSize={pricingTable.pageSize}
      pageCount={pricingTable.pageCount}
      rangeStart={pricingTable.rangeStart}
      rangeEnd={pricingTable.rangeEnd}
      onPageChange={pricingTable.setPage}
      onPageSizeChange={pricingTable.setPageSize}
    />

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]">
          <th className="px-3 py-2">Invoice Month</th><th className="px-3 py-2">Invoice #</th><th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (Expandable)</th>
          <th className="px-3 py-2">Price</th><th className="px-3 py-2">Cost</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Profit %</th>
        </tr></thead>
        <tbody>{pricingTable.pageRows.map((row, i) => <tr key={`${row.invoice_num}-${row.part_num}-${pricingTable.rangeStart + i}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
          <td className="px-3 py-2 whitespace-nowrap">{row.invoice_month}</td><td className="px-3 py-2 whitespace-nowrap">{row.invoice_num}</td><td className="px-3 py-2 whitespace-nowrap">{row.cust_id}</td><td className="px-3 py-2 whitespace-normal break-words">{row.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{row.country}</td><td className="px-3 py-2 whitespace-nowrap">{row.part_num}</td><td className="px-3 py-2 whitespace-normal break-words"><ExpandableText previewText={row.line_desc_short} fullText={row.line_desc_full} /></td>
          <td className="px-3 py-2 whitespace-nowrap">{currency(row.amount)}</td><td className="px-3 py-2 whitespace-nowrap">{row.cost == null ? '-' : currency(row.cost)}</td><td className="px-3 py-2 whitespace-nowrap">{row.profit == null ? '-' : currency(row.profit)}</td><td className="px-3 py-2 whitespace-nowrap">{row.margin_pct == null ? '-' : pct(row.margin_pct)}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </div>;
}
