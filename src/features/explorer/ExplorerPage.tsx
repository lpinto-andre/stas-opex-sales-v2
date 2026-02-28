import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { cartesianAxisProps, chartTooltipProps } from '@/components/ui/chartStyles';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { SearchMultiPickFilter } from '@/components/ui/FilterFields';
import { PageHeader } from '@/components/ui/PageHeader';
import { KPIStatCard } from '@/components/ui/KPIStatCard';
import { SavedViewsPanel } from '@/components/ui/SavedViewsPanel';
import { TablePager } from '@/components/ui/TablePager';
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCustomerOptions, useDistinctFilterOptions } from '@/hooks/useFilterOptions';
import { usePaginatedRows } from '@/hooks/usePaginatedRows';
import { useSavedViews } from '@/hooks/useSavedViews';
import {
  getDetailRows,
  getKPIs,
  getPartYearMetrics,
  getOrderTotalsForParts,
  getOrdersByFY,
  getOrdersByFYAndPartForParts,
  getOrdersByFYForParts,
  getOrdersByMonth,
  getOrdersByProdGroup,
  getRevenueByFY,
  getRevenueByFYAndPartForParts,
  getRevenueByFYForParts,
  getRevenueByMonth,
  getRevenueByProdGroup,
  getRevenueTotalsForParts,
  type Filters
} from '@/data/queries';
import { useAppStore } from '@/state/store';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatCurrency as currency, formatInteger, formatPercent as pct } from '@/utils/formatters';
import { monthEnd, monthStart, safeMonthInput } from '@/utils/monthRange';

type PeriodMode = 'all' | 'after' | 'before' | 'between';
type TopKey = 'trendRevenue' | 'trendOrders' | 'totalRevenue' | 'totalOrders' | 'multiRevenue' | 'multiOrders';

type ExplorerRow = {
  invoice_date: string; invoice_num: string; order_num: string; cust_id: string; cust_name: string;
  part_num: string; line_desc_short: string; line_desc_full: string; prod_group: string; country: string; territory: string; class_id: string;
  amount: number; cost: number; profit: number; margin_pct: number; invoice_fy: number; order_line_fy: number;
};

type TopSectionFilter = { fromMonth: string; toMonth: string; parts: string[] };
type Weights = { revenue: number; orders: number; profit: number; margin: number; trend: number; active: number };
type FilterPreset = { name: string; filters: Filters; periodMode: PeriodMode; fromMonth: string; toMonth: string; searchText: string };
type TableColumn = { key: keyof ExplorerRow; label: string; compact?: boolean };

const downloadCsv = (filename: string, rows: Record<string, unknown>[]) => {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const body = rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(',')).join('\n');
  const csv = `${cols.join(',')}\n${body}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const downloadChartSvg = (chartId: string, filename: string) => {
  const svg = document.querySelector(`#${chartId} svg`) as SVGElement | null;
  if (!svg) return;
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};


const emptyTopFilters = (fromMonth: string, toMonth: string): Record<TopKey, TopSectionFilter> => ({
  trendRevenue: { fromMonth, toMonth, parts: [] },
  trendOrders: { fromMonth, toMonth, parts: [] },
  totalRevenue: { fromMonth, toMonth, parts: [] },
  totalOrders: { fromMonth, toMonth, parts: [] },
  multiRevenue: { fromMonth, toMonth, parts: [] },
  multiOrders: { fromMonth, toMonth, parts: [] }
});

export function ExplorerPage() {
  const saved = useAppStore((s) => (s.pageState.explorer as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);
  const topItemsSelection = useAppStore((s) => s.topItemsSelection);

  const [periodMode, setPeriodMode] = useState<PeriodMode>((saved.periodMode as PeriodMode) ?? 'all');
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));
  const [searchText, setSearchText] = useState(String(saved.searchText ?? ''));
  const [topItemsN, setTopItemsN] = useState(Number(saved.topItemsN ?? 5));
  const [scopedTopParts, setScopedTopParts] = useState<string[]>([]);

  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [territorySearch, setTerritorySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const customerSearchQ = useDebouncedValue(customerSearch, 250);
  const countrySearchQ = useDebouncedValue(countrySearch, 250);
  const territorySearchQ = useDebouncedValue(territorySearch, 250);
  const partSearchQ = useDebouncedValue(partSearch, 250);
  const groupSearchQ = useDebouncedValue(groupSearch, 250);

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>((saved.selectedCountries as string[]) ?? []);
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>((saved.selectedTerritories as string[]) ?? []);
  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>((saved.selectedProdGroups as string[]) ?? []);

  const [topFilters, setTopFilters] = useState<Record<TopKey, TopSectionFilter>>((saved.topFilters as Record<TopKey, TopSectionFilter>) ?? emptyTopFilters(String(saved.fromMonth ?? ''), String(saved.toMonth ?? '')));

  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [revMonth, setRevMonth] = useState<Record<string, unknown>[]>([]);
  const [ordMonth, setOrdMonth] = useState<Record<string, unknown>[]>([]);
  const [revFy, setRevFy] = useState<Record<string, unknown>[]>([]);
  const [ordersFy, setOrdersFy] = useState<Record<string, unknown>[]>([]);
  const [revGroup, setRevGroup] = useState<Record<string, unknown>[]>([]);
  const [ordGroup, setOrdGroup] = useState<Record<string, unknown>[]>([]);
  const [detailRows, setDetailRows] = useState<ExplorerRow[]>([]);

  const [topRevByFy, setTopRevByFy] = useState<Record<string, unknown>[]>([]);
  const [topOrdByFy, setTopOrdByFy] = useState<Record<string, unknown>[]>([]);
  const [topRevTotals, setTopRevTotals] = useState<Record<string, unknown>[]>([]);
  const [topOrdTotals, setTopOrdTotals] = useState<Record<string, unknown>[]>([]);
  const [topRevByFyPart, setTopRevByFyPart] = useState<Record<string, unknown>[]>([]);
  const [topOrdByFyPart, setTopOrdByFyPart] = useState<Record<string, unknown>[]>([]);
  const [queryDurationMs, setQueryDurationMs] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(() => window.localStorage.getItem('explorer-onboarding-dismissed') !== '1');
  const [columnPreset, setColumnPreset] = useState<'full' | 'compact'>('full');

  const customerOptions = useCustomerOptions(customerSearchQ, 150);
  const countryOptions = useDistinctFilterOptions('country', countrySearchQ, 150);
  const territoryOptions = useDistinctFilterOptions('territory', territorySearchQ, 150);
  const partOptions = useDistinctFilterOptions('part_num', partSearchQ, 150);
  const groupOptions = useDistinctFilterOptions('prod_group', groupSearchQ, 150);

  const filters = useMemo<Filters>(() => {
    const f: Filters = {
      customers: selectedCustomers.length ? selectedCustomers : undefined,
      countries: selectedCountries.length ? selectedCountries : undefined,
      territories: selectedTerritories.length ? selectedTerritories : undefined,
      parts: selectedParts.length ? selectedParts : undefined,
      prodGroups: selectedProdGroups.length ? selectedProdGroups : undefined,
      searchLineDesc: searchText || undefined
    };
    if (periodMode === 'after') f.startDate = monthStart(fromMonth) || undefined;
    if (periodMode === 'before') f.endDate = monthEnd(toMonth) || undefined;
    if (periodMode === 'between') { f.startDate = monthStart(fromMonth) || undefined; f.endDate = monthEnd(toMonth) || undefined; }
    return f;
  }, [selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, searchText, periodMode, fromMonth, toMonth]);

  const currentSavedView = useMemo<FilterPreset>(() => ({
    name: '',
    filters,
    periodMode,
    fromMonth,
    toMonth,
    searchText
  }), [filters, fromMonth, periodMode, searchText, toMonth]);
  const {
    activeViewName,
    collapsed: savedViewsCollapsed,
    deleteSavedView,
    saveCurrentView,
    saveName,
    savedViews,
    setCollapsed: setSavedViewsCollapsed,
    setSaveName
  } = useSavedViews<FilterPreset>({
    storageKey: 'saved-views-explorer',
    currentSnapshot: currentSavedView
  });

  const allTopParts = useMemo(() => (scopedTopParts.length ? scopedTopParts : topItemsSelection.partNums), [scopedTopParts, topItemsSelection.partNums]);
  const boundedTopItemsN = Math.max(1, Math.min(10, topItemsN || 5));
  const limitedTopParts = useMemo(() => allTopParts.slice(0, boundedTopItemsN), [allTopParts, boundedTopItemsN]);


  useEffect(() => {
    const topSaved = (useAppStore.getState().pageState['top-items'] as Record<string, unknown>) ?? {};
    const k = Math.max(1, Number(topSaved.k ?? 2));
    const m = Math.max(1, Number(topSaved.m ?? 3));
    const weights = (topSaved.weights as Weights) ?? { revenue: 30, orders: 20, profit: 20, margin: 10, trend: 10, active: 10 };
    getPartYearMetrics(filters).then((data) => {
      const byPart = new Map<string, { fy: number; revenue: number; orders: number; profit: number; margin: number }[]>();
      data.forEach((r) => {
        const part = String(r.part_num ?? '');
        if (!part || part.trim().toUpperCase() === 'SHIPPING') return;
        const arr = byPart.get(part) ?? [];
        arr.push({ fy: Number(r.invoice_fy), revenue: Number(r.revenue), orders: Number(r.orders), profit: Number(r.profit), margin: Number(r.margin) });
        byPart.set(part, arr);
      });
      const currentFY = Math.max(...data.map((d) => Number(d.invoice_fy || 0)), 0);
      const base = [...byPart.entries()].map(([part, years]) => {
        const getWindow = (start: number, len: number) => Array.from({ length: len }, (_, i) => start - i);
        const recentFys = getWindow(currentFY, k);
        const pastFys = getWindow(currentFY - k, m);
        const sumAt = (fys: number[], key: 'revenue' | 'orders') => fys.reduce((acc, fy) => acc + (years.find((y) => y.fy === fy)?.[key] ?? 0), 0);
        const recentRev = sumAt(recentFys, 'revenue') / Math.max(k, 1);
        const pastRev = sumAt(pastFys, 'revenue') / Math.max(m, 1);
        const recentOrd = sumAt(recentFys, 'orders') / Math.max(k, 1);
        const pastOrd = sumAt(pastFys, 'orders') / Math.max(m, 1);
        const ratio = (recent: number, past: number) => past === 0 && recent > 0 ? 1 : past > 0 && recent === 0 ? 0 : past === 0 ? 0 : Math.max(0, Math.min(2, recent / past)) / 2;
        const trend_score = (ratio(recentRev, pastRev) + ratio(recentOrd, pastOrd)) / 2;
        const revenue = years.reduce((a, y) => a + y.revenue, 0);
        const orders = years.reduce((a, y) => a + y.orders, 0);
        const profit = years.reduce((a, y) => a + y.profit, 0);
        const margin = revenue ? profit / revenue : 0;
        const active_years = years.filter((y) => y.revenue > 0).length;
        return { part_num: part, revenue, orders, profit, margin, trend_score, active_years };
      });
      const rankNorm = (arr: typeof base, key: keyof (typeof base)[number]) => {
        const sorted = [...arr].sort((a, b) => Number(b[key]) - Number(a[key]));
        const map = new Map<string, number>();
        sorted.forEach((row, i) => map.set(row.part_num, sorted.length === 1 ? 1 : 1 - i / (sorted.length - 1)));
        return map;
      };
      const nRevenue = rankNorm(base, 'revenue');
      const nOrders = rankNorm(base, 'orders');
      const nProfit = rankNorm(base, 'profit');
      const nMargin = rankNorm(base, 'margin');
      const nTrend = rankNorm(base, 'trend_score');
      const nActive = rankNorm(base, 'active_years');
      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
      const wn = { revenue: weights.revenue / totalWeight, orders: weights.orders / totalWeight, profit: weights.profit / totalWeight, margin: weights.margin / totalWeight, trend: weights.trend / totalWeight, active: weights.active / totalWeight };
      const ranked = [...base].map((r) => ({
        part_num: r.part_num,
        score: wn.revenue * (nRevenue.get(r.part_num) ?? 0) + wn.orders * (nOrders.get(r.part_num) ?? 0) + wn.profit * (nProfit.get(r.part_num) ?? 0) + wn.margin * (nMargin.get(r.part_num) ?? 0) + wn.trend * (nTrend.get(r.part_num) ?? 0) + wn.active * (nActive.get(r.part_num) ?? 0)
      })).sort((a, b) => b.score - a.score).map((x) => x.part_num);
      setScopedTopParts(ranked);
    });
  }, [filters]);

  useEffect(() => {
    setTopFilters((prev) => {
      const next = { ...prev };
      (Object.keys(next) as TopKey[]).forEach((k) => {
        const current = next[k].parts.filter((p) => limitedTopParts.includes(p));
        next[k] = { ...next[k], parts: current.length ? current : [...limitedTopParts] };
      });
      return next;
    });
  }, [limitedTopParts]);

  useEffect(() => {
    const started = performance.now();
    Promise.all([
      getKPIs(filters), getRevenueByMonth(filters), getOrdersByMonth(filters), getRevenueByFY(filters), getOrdersByFY(filters), getRevenueByProdGroup(filters), getOrdersByProdGroup(filters), getDetailRows(filters, 600)
    ]).then(([kpi, rm, om, rf, ofy, rg, og, details]) => {
      setKpis(kpi as Record<string, number>);
      setRevMonth(rm as Record<string, unknown>[]); setOrdMonth(om as Record<string, unknown>[]); setRevFy(rf as Record<string, unknown>[]); setOrdersFy(ofy as Record<string, unknown>[]); setRevGroup(rg as Record<string, unknown>[]); setOrdGroup(og as Record<string, unknown>[]);
      setDetailRows((details as Record<string, unknown>[]).map((r) => ({
        invoice_date: String(r.invoice_date ?? '').slice(0, 10), invoice_num: String(r.invoice_num ?? ''), order_num: String(r.order_num ?? ''), cust_id: String(r.cust_id ?? ''), cust_name: String(r.cust_name ?? ''),
        part_num: String(r.part_num ?? ''), line_desc_short: String(r.line_desc ?? '').slice(0, 25), line_desc_full: String(r.line_desc ?? ''), prod_group: String(r.prod_group ?? ''), country: String(r.country ?? ''), territory: String(r.territory ?? ''), class_id: String(r.class_id ?? ''),
        amount: Number(r.amount ?? 0), cost: Number(r.cost ?? 0), profit: Number(r.profit ?? 0), margin_pct: Number(r.margin_pct ?? 0), invoice_fy: Number(r.invoice_fy ?? 0), order_line_fy: Number(r.order_line_fy ?? 0)
      })));
      setQueryDurationMs(Math.round(performance.now() - started));
    });
  }, [filters]);

  const sectionFilters = (sf: TopSectionFilter): Filters => {
    const f: Filters = { ...filters, parts: sf.parts.length ? sf.parts : limitedTopParts };
    if (sf.fromMonth) f.startDate = monthStart(sf.fromMonth) || f.startDate;
    if (sf.toMonth) f.endDate = monthEnd(sf.toMonth) || f.endDate;
    return f;
  };

  useEffect(() => {
    Promise.all([
      getRevenueByFYForParts(sectionFilters(topFilters.trendRevenue), topFilters.trendRevenue.parts),
      getOrdersByFYForParts(sectionFilters(topFilters.trendOrders), topFilters.trendOrders.parts),
      getRevenueTotalsForParts(sectionFilters(topFilters.totalRevenue), topFilters.totalRevenue.parts),
      getOrderTotalsForParts(sectionFilters(topFilters.totalOrders), topFilters.totalOrders.parts),
      getRevenueByFYAndPartForParts(sectionFilters(topFilters.multiRevenue), topFilters.multiRevenue.parts),
      getOrdersByFYAndPartForParts(sectionFilters(topFilters.multiOrders), topFilters.multiOrders.parts)
    ]).then(([tr, to, trt, tot, mrv, mor]) => {
      setTopRevByFy(tr as Record<string, unknown>[]); setTopOrdByFy(to as Record<string, unknown>[]); setTopRevTotals(trt as Record<string, unknown>[]); setTopOrdTotals(tot as Record<string, unknown>[]);
      setTopRevByFyPart(mrv as Record<string, unknown>[]); setTopOrdByFyPart(mor as Record<string, unknown>[]);
    });
  }, [topFilters, filters, limitedTopParts]);

  useEffect(() => {
    setPageState('explorer', { periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, topItemsN: boundedTopItemsN, topFilters });
  }, [periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, boundedTopItemsN, topFilters, setPageState]);

  const chips = [
    ...selectedCustomers.map((v) => ({ k: 'customers' as const, v })), ...selectedCountries.map((v) => ({ k: 'countries' as const, v })), ...selectedTerritories.map((v) => ({ k: 'territories' as const, v })),
    ...selectedParts.map((v) => ({ k: 'parts' as const, v })), ...selectedProdGroups.map((v) => ({ k: 'prodGroups' as const, v }))
  ];
  const removeValue = (kind: 'customers' | 'countries' | 'territories' | 'parts' | 'prodGroups', value: string) => {
    if (kind === 'customers') setSelectedCustomers((x) => x.filter((v) => v !== value));
    if (kind === 'countries') setSelectedCountries((x) => x.filter((v) => v !== value));
    if (kind === 'territories') setSelectedTerritories((x) => x.filter((v) => v !== value));
    if (kind === 'parts') setSelectedParts((x) => x.filter((v) => v !== value));
    if (kind === 'prodGroups') setSelectedProdGroups((x) => x.filter((v) => v !== value));
  };

  const setTopFilter = (key: TopKey, patch: Partial<TopSectionFilter>) => setTopFilters((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const tableColumns: TableColumn[] = [
    { key: 'invoice_date', label: 'InvoiceDate', compact: true }, { key: 'invoice_num', label: 'InvoiceNum', compact: true }, { key: 'order_num', label: 'OrderNum', compact: true },
    { key: 'cust_id', label: 'CustID', compact: true }, { key: 'cust_name', label: 'CustName', compact: true }, { key: 'part_num', label: 'PartNum', compact: true },
    { key: 'line_desc_short', label: 'LineDesc (Expandable)' }, { key: 'prod_group', label: 'ProdGroup', compact: true }, { key: 'country', label: 'Country', compact: true },
    { key: 'territory', label: 'Territory', compact: true }, { key: 'class_id', label: 'ClassID', compact: true },
    { key: 'amount', label: 'Revenue', compact: true }, { key: 'cost', label: 'Cost', compact: true }, { key: 'profit', label: 'Profit', compact: true },
    { key: 'margin_pct', label: 'Margin %', compact: true }, { key: 'invoice_fy', label: 'InvoiceFY', compact: true }, { key: 'order_line_fy', label: 'OrderLineFY', compact: true }
  ];
  const activeColumns = tableColumns.filter((c) => columnPreset === 'full' || c.compact);
  const detailTable = usePaginatedRows(detailRows, 100);

  const marginRatio = Number(kpis.revenue ?? 0) > 0 ? Number(kpis.profit ?? 0) / Number(kpis.revenue ?? 1) : 0;
  const applyPreset = (preset: FilterPreset) => {
    setPeriodMode(preset.periodMode);
    setFromMonth(preset.fromMonth);
    setToMonth(preset.toMonth);
    setSearchText(preset.searchText);
    setSelectedCustomers(preset.filters.customers ?? []);
    setSelectedCountries(preset.filters.countries ?? []);
    setSelectedTerritories(preset.filters.territories ?? []);
    setSelectedParts(preset.filters.parts ?? []);
    setSelectedProdGroups(preset.filters.prodGroups ?? []);
  };
  const describePreset = (preset: FilterPreset) => {
    const parts = [
      preset.periodMode === 'all'
        ? 'All period'
        : preset.periodMode === 'after'
          ? `After ${preset.fromMonth || '...'}`
          : preset.periodMode === 'before'
            ? `Before ${preset.toMonth || '...'}`
            : `${preset.fromMonth || '...'} to ${preset.toMonth || '...'}`
    ];
    if (preset.filters.customers?.length) parts.push(`${preset.filters.customers.length} customer${preset.filters.customers.length > 1 ? 's' : ''}`);
    if (preset.filters.countries?.length) parts.push(`${preset.filters.countries.length} countr${preset.filters.countries.length > 1 ? 'ies' : 'y'}`);
    if (preset.filters.territories?.length) parts.push(`${preset.filters.territories.length} territor${preset.filters.territories.length > 1 ? 'ies' : 'y'}`);
    if (preset.filters.parts?.length) parts.push(`${preset.filters.parts.length} part${preset.filters.parts.length > 1 ? 's' : ''}`);
    if (preset.filters.prodGroups?.length) parts.push(`${preset.filters.prodGroups.length} group${preset.filters.prodGroups.length > 1 ? 's' : ''}`);
    if (preset.searchText) parts.push(`LineDesc contains "${preset.searchText}"`);
    return parts.join(' | ');
  };
  const savedViewItems = savedViews.map((preset) => ({
    name: preset.name,
    summary: describePreset(preset.snapshot),
    active: preset.name === activeViewName
  }));
  const resetAll = () => {
    setCustomerSearch('');
    setCountrySearch('');
    setTerritorySearch('');
    setPartSearch('');
    setGroupSearch('');
    setSelectedCustomers([]);
    setSelectedCountries([]);
    setSelectedTerritories([]);
    setSelectedParts([]);
    setSelectedProdGroups([]);
    setSearchText('');
    setPeriodMode('all');
    setFromMonth('');
    setToMonth('');
  };

  const chartRevMonth = revMonth.map((r) => ({ month: String(r.month ?? ''), revenue: Math.round(Number(r.revenue ?? 0)) }));
  const chartOrdMonth = ordMonth.map((r) => ({ month: String(r.month ?? ''), orders: Number(r.orders ?? 0) }));
  const chartRevFy = revFy.map((r) => ({ fy: String(r.fy ?? ''), revenue: Math.round(Number(r.revenue ?? 0)) }));
  const chartOrdersFy = ordersFy.map((r) => ({ fy: String(r.fy ?? ''), orders: Number(r.orders ?? 0) }));
  const chartRevGroup = revGroup.map((r) => ({ prod_group: String(r.prod_group ?? ''), revenue: Math.round(Number(r.revenue ?? 0)) }));
  const chartOrdGroup = ordGroup.map((r) => ({ prod_group: String(r.prod_group ?? ''), orders: Number(r.orders ?? 0) }));

  const chartTopRev = topRevByFy.map((r) => ({ fy: String(r.fy ?? ''), revenue: Math.round(Number(r.revenue ?? 0)) }));
  const chartTopOrd = topOrdByFy.map((r) => ({ fy: String(r.fy ?? ''), orders: Number(r.orders ?? 0) }));
  const chartTopRevTotals = topRevTotals.map((r) => ({ part_num: String(r.part_num ?? ''), revenue: Math.round(Number(r.revenue ?? 0)) }));
  const chartTopOrdTotals = topOrdTotals.map((r) => ({ part_num: String(r.part_num ?? ''), orders: Number(r.orders ?? 0) }));

  const multiRevSeries = (topFilters.multiRevenue.parts.length ? topFilters.multiRevenue.parts : limitedTopParts).slice(0, 8);
  const multiOrdSeries = (topFilters.multiOrders.parts.length ? topFilters.multiOrders.parts : limitedTopParts).slice(0, 8);
  const pivotByFy = (rows: Record<string, unknown>[], valueKey: 'revenue' | 'orders', series: string[]) => {
    const byFy = new Map<string, Record<string, number | string>>();
    rows.forEach((r) => {
      const fy = String(r.fy ?? '');
      const part = String(r.part_num ?? '');
      if (!fy || !part) return;
      if (!byFy.has(fy)) byFy.set(fy, { fy });
      byFy.get(fy)![part] = Number(r[valueKey] ?? 0);
    });
    return [...byFy.values()].sort((a, b) => Number(a.fy) - Number(b.fy)).map((row) => {
      const filled: Record<string, number | string> = { ...row };
      series.forEach((part) => { if (filled[part] == null) filled[part] = 0; });
      return filled;
    });
  };
  const chartTopRevMulti = pivotByFy(topRevByFyPart, 'revenue', multiRevSeries);
  const chartTopOrdMulti = pivotByFy(topOrdByFyPart, 'orders', multiOrdSeries);

  const renderTopControls = (key: TopKey) => {
    const current = topFilters[key];
    return <div className="grid md:grid-cols-4 gap-2 mb-3">
      <label className="text-xs text-[var(--text-muted)]">From YYYY-MM
        <input type="text" value={current.fromMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setTopFilter(key, { fromMonth: n }); }} className="card w-full px-2 py-1 mt-1" />
      </label>
      <label className="text-xs text-[var(--text-muted)]">To YYYY-MM
        <input type="text" value={current.toMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setTopFilter(key, { toMonth: n }); }} className="card w-full px-2 py-1 mt-1" />
      </label>
      <div className="md:col-span-2 text-xs text-[var(--text-muted)]">
        <div className="mb-1">Top Items (from model)</div>
        <div className="card h-20 overflow-auto p-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">{limitedTopParts.map((p) => <label key={`${key}-${p}`} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={current.parts.includes(p)} onChange={() => setTopFilter(key, { parts: current.parts.includes(p) ? current.parts.filter((x) => x !== p) : [...current.parts, p] })} /><span className="truncate">{p}</span></label>)}</div>
        </div>
      </div>
    </div>;
  };

  const cardTitle = (title: string, key: TopKey) => <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{title}</h3><Link className="card px-2 py-1 text-xs" to={`/explorer/graphic/${key}`}>Expand</Link></div>;

  return <div>
    <PageHeader title="Dashboard" subtitle="Real-time DuckDB analytics across imported dataset." />

    {showOnboarding && <section className="card p-3 mb-3 border border-[var(--teal)]/40"><div className="flex items-center justify-between"><div className="text-sm">Tip: Start by selecting date period, then narrow by customer/country. Use presets to save your analysis view.</div><button className="card px-2 py-1 text-xs" onClick={() => { setShowOnboarding(false); window.localStorage.setItem('explorer-onboarding-dismissed', '1'); }}>Dismiss</button></div></section>}

    <SavedViewsPanel
      description="Save the current Explorer filters, then apply or delete them whenever needed."
      saveName={saveName}
      onSaveNameChange={setSaveName}
      onSave={saveCurrentView}
      savePlaceholder="Ex: Americas key accounts"
      collapsed={savedViewsCollapsed}
      onToggleCollapsed={() => setSavedViewsCollapsed(!savedViewsCollapsed)}
      items={savedViewItems}
      onApply={(name) => {
        const target = savedViews.find((preset) => preset.name === name);
        if (target) applyPreset(target.snapshot);
      }}
      onDelete={deleteSavedView}
      collapsedSummary={`${formatInteger(savedViews.length)} saved view${savedViews.length === 1 ? '' : 's'}. Expand to manage them.`}
      slowHint={queryDurationMs > 1200 ? `Slow query detected (${queryDurationMs}ms). Hint: narrow date range or customer selection.` : ''}
    />

    <section className="card p-3 mb-3">{/* filters omitted for brevity in this file style */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold">Filters</h3>
        <button className="card px-3 py-1 text-xs" onClick={resetAll}>Reset filters</button>
      </div>
      <div className="grid lg:grid-cols-5 gap-3">
        <SearchMultiPickFilter searchValue={customerSearch} onSearchChange={setCustomerSearch} searchPlaceholder="Search customer" label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} />
        <SearchMultiPickFilter searchValue={countrySearch} onSearchChange={setCountrySearch} searchPlaceholder="Search country" label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} />
        <SearchMultiPickFilter searchValue={territorySearch} onSearchChange={setTerritorySearch} searchPlaceholder="Search territory" label="Territories" options={territoryOptions} values={selectedTerritories} onChange={setSelectedTerritories} />
        <SearchMultiPickFilter searchValue={partSearch} onSearchChange={setPartSearch} searchPlaceholder="Search part" label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} />
        <SearchMultiPickFilter searchValue={groupSearch} onSearchChange={setGroupSearch} searchPlaceholder="Search group" label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} />
      </div>
      <div className="grid md:grid-cols-5 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        <label className="text-xs text-[var(--text-muted)]">Period<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card w-full px-2 py-1 mt-1"><option value="all">All</option><option value="after">After</option><option value="before">Before</option><option value="between">Between</option></select></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input type="text" value={fromMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setFromMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input type="text" value={toMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setToMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((c) => <button key={`${c.k}:${c.v}`} onClick={() => removeValue(c.k, c.v)} className="px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs">{c.k}:{c.v} ×</button>)}</div>}
    </section>

    <section className="mb-6 border-2 border-[var(--border)] rounded-2xl p-4 bg-[var(--surface)]/30">
      <h3 className="font-semibold mb-3 text-base">General Graphics</h3>
      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <KPIStatCard label="Revenue" value={currency(Number(kpis.revenue ?? 0))} />
        <KPIStatCard label="Profit" value={currency(Number(kpis.profit ?? 0))} />
        <KPIStatCard label="Margin%" value={pct(marginRatio)} />
        <KPIStatCard label="Orders" value={formatInteger(Number(kpis.orders ?? 0))} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <section id="chart-rev-month" className="card p-3 h-72"><div className="flex items-center justify-between mb-2"><h3 className="font-semibold">Revenue by Month</h3><div className="flex gap-1"><button className="card px-2 py-1 text-xs" onClick={() => downloadCsv('revenue-by-month.csv', chartRevMonth)}>CSV</button><button className="card px-2 py-1 text-xs" onClick={() => downloadChartSvg('chart-rev-month', 'revenue-by-month.svg')}>Image</button></div></div><ResponsiveContainer><LineChart data={chartRevMonth}><XAxis dataKey="month" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Line type="monotone" dataKey="revenue" stroke="#1bc7b3"/></LineChart></ResponsiveContainer></section>
        <section id="chart-ord-month" className="card p-3 h-72"><div className="flex items-center justify-between mb-2"><h3 className="font-semibold">Orders by Month</h3><div className="flex gap-1"><button className="card px-2 py-1 text-xs" onClick={() => downloadCsv('orders-by-month.csv', chartOrdMonth)}>CSV</button><button className="card px-2 py-1 text-xs" onClick={() => downloadChartSvg('chart-ord-month', 'orders-by-month.svg')}>Image</button></div></div><ResponsiveContainer><LineChart data={chartOrdMonth}><XAxis dataKey="month" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip {...chartTooltipProps} /><Line type="monotone" dataKey="orders" stroke="#22c55e"/></LineChart></ResponsiveContainer></section>
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Revenue by Fiscal Year</h3><ResponsiveContainer><BarChart data={chartRevFy}><XAxis dataKey="fy" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Bar dataKey="revenue" fill="#2889c2"/></BarChart></ResponsiveContainer></section>
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Orders by Fiscal Year</h3><ResponsiveContainer><BarChart data={chartOrdersFy}><XAxis dataKey="fy" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip {...chartTooltipProps} /><Bar dataKey="orders" fill="#21bd5b"/></BarChart></ResponsiveContainer></section>
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Revenue by Product Group</h3><ResponsiveContainer><BarChart data={chartRevGroup}><XAxis dataKey="prod_group" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Bar dataKey="revenue" fill="#f0b429"/></BarChart></ResponsiveContainer></section>
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Orders by Product Group</h3><ResponsiveContainer><BarChart data={chartOrdGroup}><XAxis dataKey="prod_group" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip {...chartTooltipProps} /><Bar dataKey="orders" fill="#a855f7"/></BarChart></ResponsiveContainer></section>
      </div>
    </section>

    <section className="card p-3 mb-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">Table columns</span>
        <button className="card px-2 py-1 text-xs" onClick={() => setColumnPreset('compact')}>Compact</button>
        <button className="card px-2 py-1 text-xs" onClick={() => setColumnPreset('full')}>Full</button>
      </div>
    </section>

    <TablePager
      totalRows={detailRows.length}
      page={detailTable.page}
      pageSize={detailTable.pageSize}
      pageCount={detailTable.pageCount}
      rangeStart={detailTable.rangeStart}
      rangeEnd={detailTable.rangeEnd}
      onPageChange={detailTable.setPage}
      onPageSizeChange={detailTable.setPageSize}
    />

    <section className="card overflow-auto"><table className="w-full table-auto text-sm"><thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]">{activeColumns.map((c) => <th key={String(c.key)} className="px-3 py-2">{c.label}</th>)}</tr></thead><tbody>{detailTable.pageRows.map((r, i) => <tr key={`${r.invoice_num}-${detailTable.rangeStart + i}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">{activeColumns.map((c) => <td key={String(c.key)} className={`px-3 py-2 ${c.key === 'line_desc_short' ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`}>{c.key === 'line_desc_short' ? <ExpandableText previewText={r.line_desc_short} fullText={r.line_desc_full} /> : c.key === 'amount' || c.key === 'cost' || c.key === 'profit' ? currency(Number(r[c.key])) : c.key === 'margin_pct' ? pct(Number(r[c.key])) : String(r[c.key])}</td>)}</tr>)}</tbody></table></section>
  </div>;
}
