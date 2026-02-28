import { useEffect, useMemo, useState } from 'react';
import { SearchMultiPickFilter } from '@/components/ui/FilterFields';
import { PageHeader } from '@/components/ui/PageHeader';
import { SavedViewsPanel } from '@/components/ui/SavedViewsPanel';
import { TablePager } from '@/components/ui/TablePager';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePaginatedRows } from '@/hooks/usePaginatedRows';
import { useSavedViews } from '@/hooks/useSavedViews';
import { useAppStore } from '@/state/store';
import { getPartsOrdersByFY, getPartsPriorityRows, getPartsRevenueByFY, type Filters } from '@/data/queries';
import { useCustomerOptions, useDistinctFilterOptions } from '@/hooks/useFilterOptions';
import { formatCurrency as currency, formatInteger, formatPercent as pct } from '@/utils/formatters';
import { monthEnd, monthStart, safeMonthInput } from '@/utils/monthRange';

type Metric = 'revenue' | 'orders' | 'profit' | 'profit_pct';
type SortDir = 'desc' | 'asc';
type PeriodMode = 'all' | 'after' | 'before' | 'between';
type TableMode = 'compact' | 'complete';
type DatabaseSavedView = {
  periodMode: PeriodMode;
  fromMonth: string;
  toMonth: string;
  searchText: string;
  selectedCustomers: string[];
  selectedCountries: string[];
  selectedParts: string[];
  selectedProdGroups: string[];
};

type PartRow = {
  cust_id: string;
  cust_name: string;
  country: string;
  part_num: string;
  line_desc_short: string;
  line_desc_display: string;
  line_desc_full: string;
  prod_group: string;
  orders: number;
  revenue: number;
  profit: number;
  profit_pct: number;
  active_fy_count: number;
  [key: string]: string | number;
};

const fyLabel = (fy: number) => {
  const start = String((fy - 1) % 100).padStart(2, '0');
  const end = String(fy % 100).padStart(2, '0');
  return `FY${start}-${end}`;
};

export function DatabasePage() {
  const saved = useAppStore((s) => (s.pageState.database as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

  const [metric, setMetric] = useState<Metric>((saved.metric as Metric) ?? 'revenue');
  const [dir, setDir] = useState<SortDir>((saved.dir as SortDir) ?? 'desc');
  const [topN, setTopN] = useState(Number(saved.topN ?? 100));
  const [tableMode, setTableMode] = useState<TableMode>((saved.tableMode as TableMode) ?? 'compact');
  const [periodMode, setPeriodMode] = useState<PeriodMode>((saved.periodMode as PeriodMode) ?? 'all');
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));
  const [searchText, setSearchText] = useState(String(saved.searchText ?? ''));

  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const customerSearchQ = useDebouncedValue(customerSearch, 250);
  const countrySearchQ = useDebouncedValue(countrySearch, 250);
  const partSearchQ = useDebouncedValue(partSearch, 250);
  const groupSearchQ = useDebouncedValue(groupSearch, 250);

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>((saved.selectedCountries as string[]) ?? []);
  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>((saved.selectedProdGroups as string[]) ?? []);
  const [expandedLineDesc, setExpandedLineDesc] = useState<Record<string, boolean>>({});

  const [rows, setRows] = useState<PartRow[]>([]);
  const [fyColumns, setFyColumns] = useState<number[]>([]);
  const customerOptions = useCustomerOptions(customerSearchQ, 150);
  const countryOptions = useDistinctFilterOptions('country', countrySearchQ, 150);
  const partOptions = useDistinctFilterOptions('part_num', partSearchQ, 150);
  const groupOptions = useDistinctFilterOptions('prod_group', groupSearchQ, 150);

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
  const currentSavedView = useMemo<DatabaseSavedView>(() => ({
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
  } = useSavedViews<DatabaseSavedView>({
    storageKey: 'saved-views-database',
    currentSnapshot: currentSavedView
  });

  useEffect(() => {
    Promise.all([getPartsPriorityRows(filters, 2000), getPartsRevenueByFY(filters), getPartsOrdersByFY(filters)]).then(([base, revFy, ordFy]) => {
      const keyOf = (r: Record<string, unknown>) => `${r.cust_id}|${r.cust_name}|${r.country}|${r.part_num}|${r.line_desc_short}|${r.prod_group}`;
      const map = new Map<string, PartRow>();
      const yearsSet = new Set<number>();
      (base as Record<string, unknown>[]).forEach((r) => {
        const key = keyOf(r);
        map.set(key, {
          cust_id: String(r.cust_id ?? ''),
          cust_name: String(r.cust_name ?? ''),
          country: String(r.country ?? ''),
          part_num: String(r.part_num ?? ''),
          line_desc_short: String(r.line_desc_short ?? ''),
          line_desc_display: String(r.line_desc_display ?? r.line_desc_short ?? ''),
          line_desc_full: String(r.line_desc_full ?? r.line_desc_display ?? r.line_desc_short ?? ''),
          prod_group: String(r.prod_group ?? ''),
          orders: Number(r.orders ?? 0),
          revenue: Number(r.revenue ?? 0),
          profit: Number(r.profit ?? 0),
          profit_pct: Number(r.profit_pct ?? 0),
          active_fy_count: 0
        });
      });
      (revFy as Record<string, unknown>[]).forEach((r) => {
        const key = keyOf(r);
        const fy = Number(r.fy ?? 0);
        if (!fy || !map.has(key)) return;
        yearsSet.add(fy);
        const row = map.get(key)!;
        row[`revenue_fy_${fy}`] = Number(r.revenue ?? 0);
      });
      (ordFy as Record<string, unknown>[]).forEach((r) => {
        const key = keyOf(r);
        const fy = Number(r.fy ?? 0);
        if (!fy || !map.has(key)) return;
        yearsSet.add(fy);
        const row = map.get(key)!;
        row[`orders_fy_${fy}`] = Number(r.orders ?? 0);
      });
      const years = [...yearsSet].sort((a, b) => a - b);
      map.forEach((row) => {
        row.active_fy_count = years.filter((fy) => Number(row[`revenue_fy_${fy}`] ?? 0) > 0).length;
        years.forEach((fy) => {
          if (row[`revenue_fy_${fy}`] == null) row[`revenue_fy_${fy}`] = 0;
          if (row[`orders_fy_${fy}`] == null) row[`orders_fy_${fy}`] = 0;
        });
      });
      const sorted = [...map.values()]
        .sort((a, b) => {
          const va = Number(a[metric] ?? 0);
          const vb = Number(b[metric] ?? 0);
          return dir === 'desc' ? vb - va : va - vb;
        })
        .slice(0, topN);
      setFyColumns(years);
      setRows(sorted);
      setExpandedLineDesc({});
    });
  }, [filters, metric, dir, topN]);

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
  const applySavedView = (view: DatabaseSavedView) => {
    setPeriodMode(view.periodMode);
    setFromMonth(view.fromMonth);
    setToMonth(view.toMonth);
    setSearchText(view.searchText);
    setSelectedCustomers(view.selectedCustomers);
    setSelectedCountries(view.selectedCountries);
    setSelectedParts(view.selectedParts);
    setSelectedProdGroups(view.selectedProdGroups);
  };
  const describeSavedView = (view: DatabaseSavedView) => {
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

  const chips = [
    ...selectedCustomers.map((v) => ({ k: 'customers' as const, v })),
    ...selectedCountries.map((v) => ({ k: 'countries' as const, v })),
    ...selectedParts.map((v) => ({ k: 'parts' as const, v })),
    ...selectedProdGroups.map((v) => ({ k: 'prodGroups' as const, v }))
  ];

  useEffect(() => {
    setPageState('database', {
      metric,
      dir,
      topN,
      tableMode,
      periodMode,
      fromMonth,
      toMonth,
      searchText,
      selectedCustomers,
      selectedCountries,
      selectedParts,
      selectedProdGroups
    });
  }, [metric, dir, topN, tableMode, periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, setPageState]);

  const toggleLineDesc = (rowKey: string) => {
    setExpandedLineDesc((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };
  const databaseTable = usePaginatedRows(rows, 100);

  return <div>
    <PageHeader title="Database" subtitle="Full parts database with combinable Excel-style filters." />

    <SavedViewsPanel
      description="Save the current Database filters, then apply or delete them whenever needed."
      saveName={saveName}
      onSaveNameChange={setSaveName}
      onSave={saveCurrentView}
      savePlaceholder="Ex: Europe spare parts"
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
        <SearchMultiPickFilter searchValue={customerSearch} onSearchChange={setCustomerSearch} searchPlaceholder="Search customer" label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} emptyLabel="No options" />
        <SearchMultiPickFilter searchValue={countrySearch} onSearchChange={setCountrySearch} searchPlaceholder="Search country" label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} emptyLabel="No options" />
        <SearchMultiPickFilter searchValue={partSearch} onSearchChange={setPartSearch} searchPlaceholder="Search part" label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} emptyLabel="No options" />
        <SearchMultiPickFilter searchValue={groupSearch} onSearchChange={setGroupSearch} searchPlaceholder="Search group" label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} emptyLabel="No options" />
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
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((c) => <button key={`${c.k}:${c.v}`} className="card px-2 py-1 text-xs" onClick={() => removeValue(c.k, c.v)}>{c.k}:{c.v} x</button>)}</div>}
    </section>

    <section className="card p-3 mb-3">
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
        <label className="text-xs text-[var(--text-muted)]">Table view
          <select value={tableMode} onChange={(e) => setTableMode(e.target.value as TableMode)} className="card px-2 py-1 block w-full mt-1">
            <option value="compact">Compact</option>
            <option value="complete">Complete</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">Rank by
          <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="card px-2 py-1 block w-full mt-1">
            <option value="revenue">Revenue</option>
            <option value="orders">Orders</option>
            <option value="profit">Profit</option>
            <option value="profit_pct">Profit %</option>
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

    <TablePager
      totalRows={rows.length}
      page={databaseTable.page}
      pageSize={databaseTable.pageSize}
      pageCount={databaseTable.pageCount}
      rangeStart={databaseTable.rangeStart}
      rangeEnd={databaseTable.rangeEnd}
      onPageChange={databaseTable.setPage}
      onPageSizeChange={databaseTable.setPageSize}
    />

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0">
          <tr className="text-left border-b border-[var(--border)]">
            <th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (Expandable)</th><th className="px-3 py-2">ProdGroup</th>
            <th className="px-3 py-2">Orders</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Profit %</th><th className="px-3 py-2">Active FY</th>
            {tableMode === 'complete' && <>
              {fyColumns.map((fy) => <th key={`rev-${fy}`} className="px-3 py-2">Rev {fyLabel(fy)}</th>)}
              {fyColumns.map((fy) => <th key={`ord-${fy}`} className="px-3 py-2">Ord {fyLabel(fy)}</th>)}
            </>}
          </tr>
        </thead>
        <tbody>
          {databaseTable.pageRows.map((row, idx) => {
            const absoluteIndex = databaseTable.rangeStart + idx;
            const rowKey = `${row.cust_id}|${row.part_num}|${row.country}|${absoluteIndex}`;
            const isExpanded = !!expandedLineDesc[rowKey];
            const canExpand = row.line_desc_full.length > 30;
            const lineDescText = isExpanded ? row.line_desc_full : row.line_desc_display;
            return <tr key={rowKey} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
              <td className="px-3 py-2 whitespace-nowrap">{row.cust_id}</td><td className="px-3 py-2 whitespace-normal break-words">{row.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{row.country}</td><td className="px-3 py-2 whitespace-nowrap">{row.part_num}</td><td className="px-3 py-2 whitespace-normal break-words">
                <div className="group flex items-start gap-2">
                  <span className="min-w-0 flex-1 break-words">{lineDescText}</span>
                  {canExpand && <button
                    type="button"
                    className="card shrink-0 px-2 py-0.5 text-[10px] opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                    onClick={() => toggleLineDesc(rowKey)}
                  >
                    {isExpanded ? 'Less' : 'More'}
                  </button>}
                </div>
              </td><td className="px-3 py-2 whitespace-nowrap">{row.prod_group}</td>
            <td className="px-3 py-2 whitespace-nowrap">{formatInteger(Number(row.orders))}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue))}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit))}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.profit_pct))}</td><td className="px-3 py-2 whitespace-nowrap">{formatInteger(Number(row.active_fy_count))}</td>
            {tableMode === 'complete' && <>
              {fyColumns.map((fy) => <td key={`r-${idx}-${fy}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`revenue_fy_${fy}`] ?? 0))}</td>)}
              {fyColumns.map((fy) => <td key={`o-${idx}-${fy}`} className="px-3 py-2 whitespace-nowrap">{formatInteger(Number(row[`orders_fy_${fy}`] ?? 0))}</td>)}
            </>}
            </tr>;
          })}
        </tbody>
      </table>
    </section>
  </div>;
}
