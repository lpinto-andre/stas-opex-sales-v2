import { Fragment, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { TrendV2Legend, trendV2LabelBadgeClasses } from '@/components/ui/TrendV2Legend';
import { MultiPickFilter } from '@/components/ui/MultiPickFilter';
import { SearchMultiPickFilter } from '@/components/ui/FilterFields';
import { HoverInfo } from '@/components/ui/HoverInfo';
import { SavedViewsPanel } from '@/components/ui/SavedViewsPanel';
import { TablePager } from '@/components/ui/TablePager';
import { usePaginatedRows } from '@/hooks/usePaginatedRows';
import { useSavedViews } from '@/hooks/useSavedViews';
import { useAppStore } from '@/state/store';
import { getPartsOrdersByFY, getPartsPriorityRows, getPartsRevenueByFY, getTrendV2PartMonthlyMetrics, type Filters } from '@/data/queries';
import { useCustomerOptions, useDistinctFilterOptions } from '@/hooks/useFilterOptions';
import { computeTrendV2ForParts, formatTrendReasonsSummary, formatTrendV2Label, trendV2LabelOrder, type TrendV2Label, type TrendV2Reasons } from '@/services/trendV2';
import { formatCurrency as currency, formatFixed, formatInteger, formatPercent as pct } from '@/utils/formatters';
import { monthEnd, monthStart, safeMonthInput } from '@/utils/monthRange';

type Option = { value: string; label: string };
type PeriodMode = 'all' | 'after' | 'before' | 'between';
type RankMetric = 'revenue' | 'orders' | 'profit' | 'margin' | 'trend_score_v2' | 'trend_confidence_v2';
type SortDir = 'asc' | 'desc';
type TableMode = 'compact' | 'complete';
type DeclineSavedView = {
  periodMode: PeriodMode;
  fromMonth: string;
  toMonth: string;
  searchText: string;
  selectedCustomers: string[];
  selectedCountries: string[];
  selectedParts: string[];
  selectedProdGroups: string[];
  selectedLabels: string[];
};

type DeclineRow = {
  label: TrendV2Label;
  cust_id: string;
  cust_name: string;
  country: string;
  part_num: string;
  line_desc_short: string;
  line_desc_full: string;
  prod_group: string;
  revenue: number;
  orders: number;
  profit: number;
  margin: number;
  trend_score_v2: number;
  trend_confidence_v2: number;
  trend_reasons_v2: TrendV2Reasons | null;
  [key: string]: number | string | TrendV2Reasons | null;
};

const fyLabel = (fy: number) => `FY${String((fy - 1) % 100).padStart(2, '0')}-${String(fy % 100).padStart(2, '0')}`;

const labelOptions: Option[] = trendV2LabelOrder.map((label) => ({ value: label, label: formatTrendV2Label(label) }));
const lineDescColumnWidthClass = 'w-[18rem] min-w-[18rem] max-w-[18rem]';

export function DeclinePage() {
  const saved = useAppStore((s) => (s.pageState['decline'] as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

  const [periodMode, setPeriodMode] = useState<PeriodMode>((saved.periodMode as PeriodMode) ?? 'all');
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));

  const [rankBy, setRankBy] = useState<RankMetric>((saved.rankBy as RankMetric) ?? 'trend_score_v2');
  const [sortDir, setSortDir] = useState<SortDir>((saved.sortDir as SortDir) ?? 'desc');
  const [tableMode, setTableMode] = useState<TableMode>((saved.tableMode as TableMode) ?? 'compact');
  const [groupByLabel, setGroupByLabel] = useState(Boolean(saved.groupByLabel ?? false));

  const [searchText, setSearchText] = useState(String(saved.searchText ?? ''));
  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>((saved.selectedCountries as string[]) ?? []);
  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>((saved.selectedProdGroups as string[]) ?? []);
  const [selectedLabels, setSelectedLabels] = useState<string[]>((saved.selectedLabels as string[]) ?? []);

  const [rows, setRows] = useState<DeclineRow[]>([]);
  const [fyColumns, setFyColumns] = useState<number[]>([]);

  const customerOptions = useCustomerOptions(customerSearch, 150);
  const countryOptions = useDistinctFilterOptions('country', countrySearch, 150);
  const partOptions = useDistinctFilterOptions('part_num', partSearch, 150);
  const groupOptions = useDistinctFilterOptions('prod_group', groupSearch, 150);

  const filters = useMemo<Filters>(() => {
    const next: Filters = {
      customers: selectedCustomers.length ? selectedCustomers : undefined,
      countries: selectedCountries.length ? selectedCountries : undefined,
      parts: selectedParts.length ? selectedParts : undefined,
      prodGroups: selectedProdGroups.length ? selectedProdGroups : undefined,
      searchLineDesc: searchText || undefined
    };
    if (periodMode === 'after') next.startDate = monthStart(fromMonth) || undefined;
    if (periodMode === 'before') next.endDate = monthEnd(toMonth) || undefined;
    if (periodMode === 'between') {
      next.startDate = monthStart(fromMonth) || undefined;
      next.endDate = monthEnd(toMonth) || undefined;
    }
    return next;
  }, [selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, searchText, periodMode, fromMonth, toMonth]);

  const currentSavedView = useMemo<DeclineSavedView>(() => ({
    periodMode,
    fromMonth,
    toMonth,
    searchText,
    selectedCustomers,
    selectedCountries,
    selectedParts,
    selectedProdGroups,
    selectedLabels
  }), [periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, selectedLabels]);

  const {
    activeViewName,
    collapsed: savedViewsCollapsed,
    deleteSavedView,
    saveCurrentView,
    saveName,
    savedViews,
    setCollapsed: setSavedViewsCollapsed,
    setSaveName
  } = useSavedViews<DeclineSavedView>({
    storageKey: 'saved-views-labels',
    currentSnapshot: currentSavedView
  });

  useEffect(() => {
    Promise.all([
      getPartsPriorityRows(filters, 6000),
      getPartsRevenueByFY(filters),
      getPartsOrdersByFY(filters),
      getTrendV2PartMonthlyMetrics(filters)
    ]).then(([partRows, revFY, ordFY, trendRows]) => {
      const trendByPart = computeTrendV2ForParts(
        trendRows.filter((row) => row.partNum),
        {
          scopeStartMonth: filters.startDate?.slice(0, 7),
          scopeEndMonth: filters.endDate?.slice(0, 7)
        }
      );

      const mapped = (partRows as Record<string, unknown>[])
        .map<DeclineRow | null>((row) => {
          const part = String(row.part_num ?? '');
          if (!part) return null;
          const trend = trendByPart[part];
          if (!trend) return null;
          const revenue = Number(row.revenue ?? 0);
          const profit = Number(row.profit ?? 0);
          return {
            label: trend.trendLabelV2,
            cust_id: String(row.cust_id ?? ''),
            cust_name: String(row.cust_name ?? ''),
            country: String(row.country ?? ''),
            part_num: part,
            line_desc_short: String(row.line_desc_short ?? ''),
            line_desc_full: String(row.line_desc_full ?? row.line_desc_display ?? row.line_desc_short ?? ''),
            prod_group: String(row.prod_group ?? ''),
            revenue,
            orders: Number(row.orders ?? 0),
            profit,
            margin: revenue === 0 ? 0 : profit / revenue,
            trend_score_v2: trend.trendScoreV2,
            trend_confidence_v2: trend.trendConfidenceV2,
            trend_reasons_v2: trend.trendReasonsV2 ?? null
          };
        })
        .filter((row): row is DeclineRow => row != null);

      const filtered = selectedLabels.length === 0
        ? mapped
        : mapped.filter((row) => selectedLabels.includes(row.label));

      const rowsMap = new Map<string, DeclineRow>();
      filtered.forEach((row) => rowsMap.set(row.part_num, row));

      const yearsSet = new Set<number>();
      const addFyValue = (part: string, fy: number, key: string, value: number) => {
        const current = rowsMap.get(part);
        if (!current || !fy) return;
        yearsSet.add(fy);
        current[`${key}_${fy}`] = Number(current[`${key}_${fy}`] ?? 0) + value;
      };

      (revFY as Record<string, unknown>[]).forEach((row) => addFyValue(String(row.part_num ?? ''), Number(row.fy ?? 0), 'revenue_fy', Number(row.revenue ?? 0)));
      (ordFY as Record<string, unknown>[]).forEach((row) => addFyValue(String(row.part_num ?? ''), Number(row.fy ?? 0), 'orders_fy', Number(row.orders ?? 0)));

      const years = [...yearsSet].sort((a, b) => a - b);
      const direction = sortDir === 'asc' ? 1 : -1;
      const sorted = [...rowsMap.values()].sort((left, right) => (Number(left[rankBy]) - Number(right[rankBy])) * direction);
      sorted.forEach((row) => years.forEach((fy) => {
        if (row[`revenue_fy_${fy}`] == null) row[`revenue_fy_${fy}`] = 0;
        if (row[`orders_fy_${fy}`] == null) row[`orders_fy_${fy}`] = 0;
      }));

      setRows(sorted);
      setFyColumns(years);
    });
  }, [filters, selectedLabels, rankBy, sortDir]);

  const chips = [
    ...selectedCustomers.map((value) => ({ k: 'customers' as const, v: value })),
    ...selectedCountries.map((value) => ({ k: 'countries' as const, v: value })),
    ...selectedParts.map((value) => ({ k: 'parts' as const, v: value })),
    ...selectedProdGroups.map((value) => ({ k: 'prodGroups' as const, v: value })),
    ...selectedLabels.map((value) => ({ k: 'labels' as const, v: value }))
  ];

  const removeValue = (kind: 'customers' | 'countries' | 'parts' | 'prodGroups' | 'labels', value: string) => {
    if (kind === 'customers') setSelectedCustomers((current) => current.filter((entry) => entry !== value));
    if (kind === 'countries') setSelectedCountries((current) => current.filter((entry) => entry !== value));
    if (kind === 'parts') setSelectedParts((current) => current.filter((entry) => entry !== value));
    if (kind === 'prodGroups') setSelectedProdGroups((current) => current.filter((entry) => entry !== value));
    if (kind === 'labels') setSelectedLabels((current) => current.filter((entry) => entry !== value));
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
    setSelectedLabels([]);
    setSearchText('');
    setPeriodMode('all');
    setFromMonth('');
    setToMonth('');
  };

  const applySavedView = (view: DeclineSavedView) => {
    setPeriodMode(view.periodMode);
    setFromMonth(view.fromMonth);
    setToMonth(view.toMonth);
    setSearchText(view.searchText);
    setSelectedCustomers(view.selectedCustomers);
    setSelectedCountries(view.selectedCountries);
    setSelectedParts(view.selectedParts);
    setSelectedProdGroups(view.selectedProdGroups);
    setSelectedLabels(view.selectedLabels);
  };

  const describeSavedView = (view: DeclineSavedView) => {
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
    if (view.selectedLabels.length) parts.push(`${view.selectedLabels.length} label${view.selectedLabels.length > 1 ? 's' : ''}`);
    if (view.searchText) parts.push(`LineDesc contains "${view.searchText}"`);
    return parts.join(' | ');
  };

  const savedViewItems = savedViews.map((view) => ({
    name: view.name,
    summary: describeSavedView(view.snapshot),
    active: view.name === activeViewName
  }));

  useEffect(() => {
    setPageState('decline', {
      periodMode,
      fromMonth,
      toMonth,
      searchText,
      rankBy,
      sortDir,
      tableMode,
      groupByLabel,
      selectedCustomers,
      selectedCountries,
      selectedParts,
      selectedProdGroups,
      selectedLabels
    });
  }, [periodMode, fromMonth, toMonth, searchText, rankBy, sortDir, tableMode, groupByLabel, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, selectedLabels, setPageState]);

  const tableRows = useMemo(() => {
    if (!groupByLabel) return rows;
    const grouped = new Map<TrendV2Label, DeclineRow[]>();
    trendV2LabelOrder.forEach((label) => grouped.set(label, []));
    rows.forEach((row) => {
      const bucket = grouped.get(row.label);
      if (bucket) bucket.push(row);
      else grouped.set(row.label, [row]);
    });
    return trendV2LabelOrder.flatMap((label) => grouped.get(label) ?? []);
  }, [rows, groupByLabel]);

  const labelCounts = useMemo(() => {
    const counts = new Map<TrendV2Label, number>();
    rows.forEach((row) => counts.set(row.label, (counts.get(row.label) ?? 0) + 1));
    return counts;
  }, [rows]);

  const totalColumnCount = 14 + (tableMode === 'complete' ? fyColumns.length * 2 : 0);
  const declineTable = usePaginatedRows(tableRows, 100);

  return <div>
    <PageHeader title="Labels Model" subtitle="Classify parts with Trend v2 labels." />

    <SavedViewsPanel
      description="Save the current Labels filters, then apply or delete them whenever needed."
      saveName={saveName}
      onSaveNameChange={setSaveName}
      onSave={saveCurrentView}
      savePlaceholder="Ex: Dormant high-revenue parts"
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
        <h3 className="font-semibold">Filters</h3>
        <button className="card px-3 py-1 text-xs" onClick={resetFilters}>Reset filters</button>
      </div>
      <div className="grid lg:grid-cols-5 gap-3">
        <SearchMultiPickFilter searchValue={customerSearch} onSearchChange={setCustomerSearch} searchPlaceholder="Search customer" label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} />
        <SearchMultiPickFilter searchValue={countrySearch} onSearchChange={setCountrySearch} searchPlaceholder="Search country" label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} />
        <SearchMultiPickFilter searchValue={partSearch} onSearchChange={setPartSearch} searchPlaceholder="Search part" label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} />
        <SearchMultiPickFilter searchValue={groupSearch} onSearchChange={setGroupSearch} searchPlaceholder="Search group" label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} />
        <div className="space-y-2"><MultiPickFilter label="Labels" options={labelOptions} values={selectedLabels} onChange={setSelectedLabels} /></div>
      </div>
      <div className="grid md:grid-cols-1 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">Period<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card px-2 py-1 block w-full mt-1"><option value="all">All</option><option value="after">After (month)</option><option value="before">Before (month)</option><option value="between">Between (months)</option></select></label>
      </div>
      <div className="grid md:grid-cols-4 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={fromMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setFromMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={toMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setToMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((chip) => <button key={`${chip.k}:${chip.v}`} className="card px-2 py-1 text-xs" onClick={() => removeValue(chip.k, chip.v)}>{chip.k}:{chip.v} x</button>)}</div>}
    </section>

    <TrendV2Legend className="mb-3" />

    <section className="card p-3 mb-3">
      <div className="grid md:grid-cols-3 gap-3 items-end mb-3">
        <label className="text-xs text-[var(--text-muted)]">Table view<select value={tableMode} onChange={(e) => setTableMode(e.target.value as TableMode)} className="card w-full px-2 py-1 mt-1"><option value="compact">Compact</option><option value="complete">Complete</option></select></label>
        <label className="text-xs text-[var(--text-muted)]">Rank by<select value={rankBy} onChange={(e) => setRankBy(e.target.value as RankMetric)} className="card w-full px-2 py-1 mt-1"><option value="trend_score_v2">Trend Score v2</option><option value="trend_confidence_v2">Trend Confidence</option><option value="revenue">Revenue</option><option value="orders">Orders</option><option value="profit">Profit</option><option value="margin">Profit %</option></select></label>
        <label className="text-xs text-[var(--text-muted)]">Order<select value={sortDir} onChange={(e) => setSortDir(e.target.value as SortDir)} className="card w-full px-2 py-1 mt-1"><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
      </div>
      <TablePager
        totalRows={tableRows.length}
        page={declineTable.page}
        pageSize={declineTable.pageSize}
        pageCount={declineTable.pageCount}
        rangeStart={declineTable.rangeStart}
        rangeEnd={declineTable.rangeEnd}
        onPageChange={declineTable.setPage}
        onPageSizeChange={declineTable.setPageSize}
      />
    </section>

    <section className="card overflow-auto">
      <table className="w-max table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]">
          <th className="sticky left-0 z-20 bg-[var(--surface)] px-3 py-2"><button type="button" className="inline-flex items-center gap-2 text-left font-semibold" onClick={() => setGroupByLabel((current) => !current)}>Label<span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-normal text-[var(--text-muted)]">{groupByLabel ? 'Grouped' : 'Group'}</span></button></th><th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-1 py-2">PartNum</th><th className={`px-3 py-2 ${lineDescColumnWidthClass}`}>LineDesc (Expandable)</th><th className="px-3 py-2">ProdGroup</th>
          <th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Margin</th><th className="px-3 py-2"><HoverInfo label="Trend Score v2" tooltip="Trend v2 demand score for this part in the active filter scope." placement="bottom" /></th><th className="px-3 py-2"><HoverInfo label="Trend Conf." tooltip="Confidence level for the Trend v2 classification." placement="bottom" /></th><th className="px-3 py-2"><HoverInfo label="Why" tooltip="Shows the main Trend v2 facts behind the label and score for this row." placement="bottom" /></th>
          {tableMode === 'complete' && <>{fyColumns.map((fy) => <th key={`r-${fy}`} className="px-3 py-2">Rev {fyLabel(fy)}</th>)}{fyColumns.map((fy) => <th key={`o-${fy}`} className="px-3 py-2">Ord {fyLabel(fy)}</th>)}</>}
        </tr></thead>
        <tbody>
          {declineTable.pageRows.map((row, index) => {
            const showLabelRow = groupByLabel && (index === 0 || declineTable.pageRows[index - 1]?.label !== row.label);
            const whyText = row.trend_reasons_v2 ? formatTrendReasonsSummary(row.trend_reasons_v2) : 'No trend explanation available.';
            return <Fragment key={`${row.part_num}-${declineTable.rangeStart + index}`}>
              {showLabelRow && <tr className="border-b border-[var(--border)] bg-[var(--surface)]/70">
                <td colSpan={totalColumnCount} className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{formatTrendV2Label(row.label)} ({formatInteger(labelCounts.get(row.label) ?? 0)})</td>
              </tr>}
              <tr className="group/row border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
                <td className="sticky left-0 z-10 bg-[var(--card)] px-3 py-2 whitespace-nowrap group-hover/row:bg-[var(--surface)]"><span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${trendV2LabelBadgeClasses[row.label]}`}>{formatTrendV2Label(row.label)}</span></td>
                <td className="px-3 py-2 whitespace-nowrap">{row.cust_id}</td><td className="px-3 py-2 whitespace-normal break-words">{row.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{row.country}</td><td className="px-1 py-2 whitespace-nowrap"><span className="inline-block max-w-[8rem] truncate align-top" title={row.part_num}>{row.part_num}</span></td><td className={`px-3 py-2 whitespace-normal break-words align-top ${lineDescColumnWidthClass}`}><div className="max-w-full"><ExpandableText previewText={row.line_desc_short} fullText={row.line_desc_full} /></div></td><td className="px-3 py-2 whitespace-nowrap">{row.prod_group}</td>
                <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue))}</td><td className="px-3 py-2 whitespace-nowrap">{formatInteger(Number(row.orders))}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit))}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.margin))}</td><td className="px-3 py-2 whitespace-nowrap">{formatFixed(Number(row.trend_score_v2), 3)}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.trend_confidence_v2))}</td><td className="px-3 py-2 align-top"><HoverInfo label="Why" tooltip={whyText} placement="bottom" /></td>
                {tableMode === 'complete' && <>{fyColumns.map((fy) => <td key={`rv-${index}-${fy}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`revenue_fy_${fy}`] ?? 0))}</td>)}{fyColumns.map((fy) => <td key={`ov-${index}-${fy}`} className="px-3 py-2 whitespace-nowrap">{formatInteger(Number(row[`orders_fy_${fy}`] ?? 0))}</td>)}</>}
              </tr>
            </Fragment>;
          })}
        </tbody>
      </table>
    </section>
  </div>;
}
