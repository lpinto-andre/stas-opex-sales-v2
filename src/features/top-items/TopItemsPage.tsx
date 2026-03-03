import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cartesianAxisProps, chartTooltipProps } from '@/components/ui/chartStyles';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { SearchMultiPickFilter } from '@/components/ui/FilterFields';
import { HoverInfo } from '@/components/ui/HoverInfo';
import { PageHeader } from '@/components/ui/PageHeader';
import { SavedViewsPanel } from '@/components/ui/SavedViewsPanel';
import { getOrderTotalsForParts, getOrdersByFYAndPartForParts, getOrdersByFYForParts, getPartYearMetrics, getPartsOrdersByFY, getPartsPriorityRows, getPartsRevenueByFY, getRevenueByFYAndPartForParts, getRevenueByFYForParts, getRevenueCostProfitOverTime, getRevenueTotalsForParts, getTrendV2PartMonthlyMetrics, type Filters } from '@/data/queries';
import { requestInsightsReply } from '@/features/insights/api';
import { buildInsightsContextPack } from '@/features/insights/context';
import { useCustomerOptions, useDistinctFilterOptions } from '@/hooks/useFilterOptions';
import { useSavedViews } from '@/hooks/useSavedViews';
import { computeTrendV2ForParts, type TrendV2Label, type TrendV2Reasons } from '@/services/trendV2';
import { useAppStore } from '@/state/store';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatCurrency as currency, formatFixed, formatInteger, formatPercent as pct } from '@/utils/formatters';
import { monthEnd, monthStart, safeMonthInput } from '@/utils/monthRange';

type PeriodMode = 'all' | 'after' | 'before' | 'between';
type TableMode = 'compact' | 'complete';
type Weights = { revenue: number; orders: number; profit: number; margin: number; trend: number; active: number };
type TopKey = 'trendRevenue' | 'trendOrders' | 'trendCost' | 'trendProfit' | 'trendMargin' | 'totalRevenue' | 'totalOrders' | 'multiRevenue' | 'multiOrders';
type TopSectionFilter = { fromMonth: string; toMonth: string; parts: string[] };
type TopItemsSavedView = {
  topN: number;
  graphicsTopN: number;
  periodMode: PeriodMode;
  fromMonth: string;
  toMonth: string;
  trendScoreFromMonth: string;
  minimumRevenue: string;
  minimumOrders: string;
  minimumThresholdMode: 'and' | 'or';
  searchText: string;
  selectedCustomers: string[];
  selectedCountries: string[];
  selectedParts: string[];
  selectedProdGroups: string[];
};

type ScoreRow = {
  rank: number;
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
  revenue_score: number;
  orders_score: number;
  profit_score: number;
  margin_score: number;
  trend_score: number;
  trend_label_v2: TrendV2Label;
  trend_confidence_v2: number;
  trend_reasons_v2: TrendV2Reasons | null;
  active_score: number;
  final_score: number;
  [key: string]: number | string | TrendV2Reasons | null;
};

type AnalysisSection = {
  title: string;
  items: string[];
};

const mapInsightsRow = (row: ScoreRow) => ({
  rank: Number(row.rank),
  part_num: String(row.part_num),
  line_desc_short: String(row.line_desc_short),
  cust_id: String(row.cust_id),
  cust_name: String(row.cust_name),
  country: String(row.country),
  prod_group: String(row.prod_group),
  revenue: Number(row.revenue),
  orders: Number(row.orders),
  profit: Number(row.profit),
  margin: Number(row.margin),
  revenue_score: Number(row.revenue_score),
  orders_score: Number(row.orders_score),
  profit_score: Number(row.profit_score),
  margin_score: Number(row.margin_score),
  trend_score: Number(row.trend_score),
  active_score: Number(row.active_score),
  final_score: Number(row.final_score)
});

const isShipping = (partNum: string) => partNum.trim().toUpperCase() === 'SHIPPING';
const fyLabel = (fy: number) => `FY${String((fy - 1) % 100).padStart(2, '0')}-${String(fy % 100).padStart(2, '0')}`;
const emptyTopFilters = (fromMonth: string, toMonth: string): Record<TopKey, TopSectionFilter> => ({
  trendRevenue: { fromMonth, toMonth, parts: [] },
  trendOrders: { fromMonth, toMonth, parts: [] },
  trendCost: { fromMonth, toMonth, parts: [] },
  trendProfit: { fromMonth, toMonth, parts: [] },
  trendMargin: { fromMonth, toMonth, parts: [] },
  totalRevenue: { fromMonth, toMonth, parts: [] },
  totalOrders: { fromMonth, toMonth, parts: [] },
  multiRevenue: { fromMonth, toMonth, parts: [] },
  multiOrders: { fromMonth, toMonth, parts: [] }
});

const parseAnalysisSections = (text: string, lang: 'fr' | 'en'): AnalysisSection[] => {
  const cleaned = text
    .replace(/\r/g, '')
    .replace(/\btopRows\b/gi, lang === 'fr' ? 'top items visibles' : 'visible top items')
    .replace(/\bnextRows\b/gi, lang === 'fr' ? 'items suivants juste sous la limite d affichage' : 'next-ranked items just below the display cutoff')
    .replace(/\bcutoff\b/gi, lang === 'fr' ? 'limite d affichage' : 'display cutoff')
    .trim();
  if (!cleaned) return [];

  const fallbackTitles = ['Scope', 'Main drivers', 'Shared patterns', 'Why these vs next', 'Outliers', 'Business read', 'Next checks', 'Limits'];
  const knownHeadings = [
    'Scope',
    'Main drivers',
    'Shared patterns',
    'Why these over the next candidates',
    'Why these vs next',
    'Outliers',
    'Business read',
    'Next checks',
    'Limits'
  ];
  const normalizedText = knownHeadings.reduce((acc, heading) => {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withColon = new RegExp(`\\s+(${escaped}):`, 'gi');
    return acc.replace(withColon, '\n$1:');
  }, cleaned)
    .replace(/\s*[•·]\s*/g, '\n- ')
    .replace(/\s+-\s+(?=[A-Z])/g, '\n- ');
  const lines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean);
  const sections: AnalysisSection[] = [];
  let current: AnalysisSection | null = null;

  const splitLongItem = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const bulletParts = trimmed
      .split(/\s+(?=[-*]\s+)/)
      .map((item) => item.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean);
    if (bulletParts.length > 1) return bulletParts;
    if (trimmed.length < 180) return [trimmed];
    const sentenceParts = trimmed
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return sentenceParts.length > 1 ? sentenceParts : [trimmed];
  };

  const pushCurrent = () => {
    if (!current) return;
    const items = current.items.flatMap(splitLongItem);
    if (items.length) sections.push({ title: current.title, items });
    current = null;
  };

  lines.forEach((line) => {
    const headingMatch = line.match(/^([^:]{2,40}):\s*(.*)$/);
    if (headingMatch && !line.startsWith('http')) {
      pushCurrent();
      current = { title: headingMatch[1].trim(), items: [] };
      if (headingMatch[2].trim()) current.items.push(headingMatch[2].trim());
      return;
    }
    const normalized = line.replace(/^[-*]\s+/, '').trim();
    if (!current) current = { title: fallbackTitles[sections.length] ?? (lang === 'fr' ? 'Analysis' : 'Analysis'), items: [] };
    current.items.push(normalized);
  });
  pushCurrent();

  if (sections.length) return sections;

  const sentences = cleaned
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (!sentences.length) return [];
  const chunkSize = Math.max(1, Math.ceil(sentences.length / Math.min(4, sentences.length)));
  const fallbackSections: AnalysisSection[] = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    fallbackSections.push({
      title: fallbackTitles[fallbackSections.length] ?? (lang === 'fr' ? 'Analysis' : 'Analysis'),
      items: sentences.slice(i, i + chunkSize)
    });
  }
  return fallbackSections;
};

export function TopItemsPage() {
  const saved = useAppStore((s) => (s.pageState['top-items'] as Record<string, unknown>) ?? {});
  const uiLang = useAppStore((s) => s.uiLang);
  const globalFilters = useAppStore((s) => s.filters);
  const datasetMeta = useAppStore((s) => s.datasetMeta);
  const potentialRaw = useAppStore((s) => s.pageState.potential as Record<string, unknown> | undefined);
  const potentialViewRaw = useAppStore((s) => s.pageState.potentialView as Record<string, unknown> | undefined);
  const pricingViewRaw = useAppStore((s) => s.pageState.pricing as Record<string, unknown> | undefined);
  const setPageState = useAppStore((s) => s.setPageState);
  const setTopItemsSelection = useAppStore((s) => s.setTopItemsSelection);
  const [topN, setTopN] = useState(Number(saved.topN ?? 10));
  const [periodMode, setPeriodMode] = useState<PeriodMode>((saved.periodMode as PeriodMode) ?? 'all');
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));
  const [trendScoreFromMonth, setTrendScoreFromMonth] = useState(String(saved.trendScoreFromMonth ?? ''));
  const [minimumRevenue, setMinimumRevenue] = useState(String(saved.minimumRevenue ?? ''));
  const [minimumOrders, setMinimumOrders] = useState(String(saved.minimumOrders ?? ''));
  const [minimumThresholdMode, setMinimumThresholdMode] = useState<'and' | 'or'>((saved.minimumThresholdMode as 'and' | 'or') ?? 'and');
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

  const [weights, setWeights] = useState<Weights>((saved.weights as Weights) ?? { revenue: 30, orders: 20, profit: 20, margin: 10, trend: 5, active: 15 });
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [nextRowsPreview, setNextRowsPreview] = useState<ScoreRow[]>([]);
  const [rankedPartNums, setRankedPartNums] = useState<string[]>([]);
  const [fyColumns, setFyColumns] = useState<number[]>([]);
  const [graphicsTopN, setGraphicsTopN] = useState(Number(saved.graphicsTopN ?? saved.topItemsN ?? 5));
  const [tableMode, setTableMode] = useState<TableMode>((saved.tableMode as TableMode) ?? 'compact');
  const [topFilters, setTopFilters] = useState<Record<TopKey, TopSectionFilter>>((saved.topFilters as Record<TopKey, TopSectionFilter>) ?? emptyTopFilters(String(saved.fromMonth ?? ''), String(saved.toMonth ?? '')));
  const [topRevByFy, setTopRevByFy] = useState<Record<string, unknown>[]>([]);
  const [topOrdByFy, setTopOrdByFy] = useState<Record<string, unknown>[]>([]);
  const [topRevTotals, setTopRevTotals] = useState<Record<string, unknown>[]>([]);
  const [topOrdTotals, setTopOrdTotals] = useState<Record<string, unknown>[]>([]);
  const [topRevByFyPart, setTopRevByFyPart] = useState<Record<string, unknown>[]>([]);
  const [topOrdByFyPart, setTopOrdByFyPart] = useState<Record<string, unknown>[]>([]);
  const [topValueByFy, setTopValueByFy] = useState<Record<string, unknown>[]>([]);
  const [graphicsCollapsed, setGraphicsCollapsed] = useState(Boolean(saved.graphicsCollapsed ?? false));
  const [weightsCollapsed, setWeightsCollapsed] = useState(Boolean(saved.weightsCollapsed ?? false));
  const [analysisCollapsed, setAnalysisCollapsed] = useState(Boolean(saved.analysisCollapsed ?? false));
  const [analysisPending, setAnalysisPending] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [analysisTips, setAnalysisTips] = useState<string[]>([]);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisContextKey, setAnalysisContextKey] = useState('');
  const previousLimitedTopPartsRef = useRef<string[]>([]);

  const customerOptions = useCustomerOptions(customerSearchQ, 150);
  const countryOptions = useDistinctFilterOptions('country', countrySearchQ, 150);
  const partOptions = useDistinctFilterOptions('part_num', partSearchQ, 150);
  const groupOptions = useDistinctFilterOptions('prod_group', groupSearchQ, 150);

  const baseFilters = useMemo<Filters>(() => ({
    customers: selectedCustomers.length ? selectedCustomers : undefined,
    countries: selectedCountries.length ? selectedCountries : undefined,
    parts: selectedParts.length ? selectedParts : undefined,
    prodGroups: selectedProdGroups.length ? selectedProdGroups : undefined,
    searchLineDesc: searchText || undefined
  }), [selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, searchText]);
  const filters = useMemo<Filters>(() => {
    const f: Filters = { ...baseFilters };
    if (periodMode === 'after') f.startDate = monthStart(fromMonth) || undefined;
    if (periodMode === 'before') f.endDate = monthEnd(toMonth) || undefined;
    if (periodMode === 'between') {
      f.startDate = monthStart(fromMonth) || undefined;
      f.endDate = monthEnd(toMonth) || undefined;
    }
    return f;
  }, [baseFilters, periodMode, fromMonth, toMonth]);
  const trendScoreFilters = useMemo<Filters>(() => {
    const f: Filters = { ...filters };
    if (trendScoreFromMonth) f.startDate = monthStart(trendScoreFromMonth) || f.startDate;
    return f;
  }, [filters, trendScoreFromMonth]);
  const minimumRevenueValue = useMemo(() => {
    const parsed = Number(minimumRevenue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [minimumRevenue]);
  const minimumOrdersValue = useMemo(() => {
    const parsed = Number(minimumOrders);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [minimumOrders]);
  const currentSavedView = useMemo<TopItemsSavedView>(() => ({
    topN,
    graphicsTopN: Math.max(1, topN),
    periodMode,
    fromMonth,
    toMonth,
    trendScoreFromMonth,
    minimumRevenue,
    minimumOrders,
    minimumThresholdMode,
    searchText,
    selectedCustomers,
    selectedCountries,
    selectedParts,
    selectedProdGroups
  }), [topN, periodMode, fromMonth, toMonth, trendScoreFromMonth, minimumRevenue, minimumOrders, minimumThresholdMode, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups]);
  const {
    activeViewName,
    collapsed: savedViewsCollapsed,
    deleteSavedView,
    saveCurrentView,
    saveName,
    savedViews,
    setCollapsed: setSavedViewsCollapsed,
    setSaveName
  } = useSavedViews<TopItemsSavedView>({
    storageKey: 'saved-views-top-items',
    currentSnapshot: currentSavedView
  });

  useEffect(() => {
    Promise.all([
      getPartYearMetrics(filters),
      getPartsRevenueByFY(filters),
      getPartsOrdersByFY(filters),
      getPartsPriorityRows(filters, 6000),
      getTrendV2PartMonthlyMetrics(trendScoreFilters)
    ]).then(([data, revFY, ordFY, partRows, trendRows]) => {
      const byPart = new Map<string, { fy: number; revenue: number; orders: number; profit: number; margin: number }[]>();
      data.forEach((r) => {
        if (!r.part_num || isShipping(r.part_num)) return;
        const arr = byPart.get(r.part_num) ?? [];
        arr.push({ fy: Number(r.invoice_fy), revenue: Number(r.revenue), orders: Number(r.orders), profit: Number(r.profit), margin: Number(r.margin) });
        byPart.set(r.part_num, arr);
      });

      const trendByPart = computeTrendV2ForParts(
        (trendRows ?? []).filter((row) => row.partNum && !isShipping(row.partNum)),
        {
          scopeStartMonth: trendScoreFilters.startDate?.slice(0, 7),
          scopeEndMonth: trendScoreFilters.endDate?.slice(0, 7)
        }
      );

      const detailByPart = new Map<string, Pick<ScoreRow, 'cust_id' | 'cust_name' | 'country' | 'line_desc_short' | 'line_desc_full' | 'prod_group'>>();
      (partRows as Record<string, unknown>[]).forEach((r) => {
        const part = String(r.part_num ?? '');
        if (!part || isShipping(part) || detailByPart.has(part)) return;
        detailByPart.set(part, {
          cust_id: String(r.cust_id ?? ''),
          cust_name: String(r.cust_name ?? ''),
          country: String(r.country ?? ''),
          line_desc_short: String(r.line_desc_short ?? ''),
          line_desc_full: String(r.line_desc_full ?? r.line_desc_display ?? r.line_desc_short ?? ''),
          prod_group: String(r.prod_group ?? '')
        });
      });

      const base = [...byPart.entries()].map(([part, years]) => {
        const revenue = years.reduce((sum, year) => sum + year.revenue, 0);
        const orders = years.reduce((sum, year) => sum + year.orders, 0);
        const profit = years.reduce((sum, year) => sum + year.profit, 0);
        const margin = revenue ? profit / revenue : 0;
        const activeYears = years.filter((year) => year.revenue > 0 || year.orders > 0).length;
        const trend = trendByPart[part];
        return {
          part_num: part,
          revenue,
          orders,
          profit,
          margin,
          trend_score_v2: trend?.trendScoreV2 ?? 0.08,
          trend_label_v2: trend?.trendLabelV2 ?? 'Dormant',
          trend_confidence_v2: trend?.trendConfidenceV2 ?? 0.3,
          trend_reasons_v2: trend?.trendReasonsV2 ?? null,
          active_years: activeYears
        };
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
      const nActive = rankNorm(base, 'active_years');

      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
      const wn = {
        revenue: weights.revenue / totalWeight,
        orders: weights.orders / totalWeight,
        profit: weights.profit / totalWeight,
        margin: weights.margin / totalWeight,
        trend: weights.trend / totalWeight,
        active: weights.active / totalWeight
      };

      const rowsMap = new Map<string, ScoreRow>();
      base.forEach((r) => {
        const revenue_score = nRevenue.get(r.part_num) ?? 0;
        const orders_score = nOrders.get(r.part_num) ?? 0;
        const profit_score = nProfit.get(r.part_num) ?? 0;
        const margin_score = nMargin.get(r.part_num) ?? 0;
        const trend_score = Number(r.trend_score_v2 ?? 0);
        const active_score = nActive.get(r.part_num) ?? 0;
        const final_score = wn.revenue * revenue_score + wn.orders * orders_score + wn.profit * profit_score + wn.margin * margin_score + wn.trend * trend_score + wn.active * active_score;
        const detail = detailByPart.get(r.part_num);
        rowsMap.set(r.part_num, {
          rank: 0,
          cust_id: detail?.cust_id ?? '',
          cust_name: detail?.cust_name ?? '',
          country: detail?.country ?? '',
          part_num: r.part_num,
          line_desc_short: detail?.line_desc_short ?? '',
          line_desc_full: detail?.line_desc_full ?? detail?.line_desc_short ?? '',
          prod_group: detail?.prod_group ?? '',
          revenue: r.revenue,
          orders: r.orders,
          profit: r.profit,
          margin: r.margin,
          revenue_score,
          orders_score,
          profit_score,
          margin_score,
          trend_score,
          trend_label_v2: r.trend_label_v2,
          trend_confidence_v2: Number(r.trend_confidence_v2 ?? 0),
          trend_reasons_v2: (r.trend_reasons_v2 as TrendV2Reasons | null) ?? null,
          active_score,
          final_score
        });
      });

      const yearsSet = new Set<number>();
      const addFyValue = (part: string, fy: number, key: string, value: number) => {
        const row = rowsMap.get(part);
        if (!row || !fy) return;
        yearsSet.add(fy);
        const col = `${key}_${fy}`;
        row[col] = Number(row[col] ?? 0) + value;
      };

      (revFY as Record<string, unknown>[]).forEach((r) => {
        const part = String(r.part_num ?? '');
        if (!part || isShipping(part)) return;
        addFyValue(part, Number(r.fy ?? 0), 'revenue_fy', Number(r.revenue ?? 0));
      });
      (ordFY as Record<string, unknown>[]).forEach((r) => {
        const part = String(r.part_num ?? '');
        if (!part || isShipping(part)) return;
        addFyValue(part, Number(r.fy ?? 0), 'orders_fy', Number(r.orders ?? 0));
      });

      const years = [...yearsSet].sort((a, b) => a - b);
      const sortedAll: ScoreRow[] = [...rowsMap.values()]
        .filter((row) => {
          const revenueActive = minimumRevenueValue > 0;
          const ordersActive = minimumOrdersValue > 0;
          if (!revenueActive && !ordersActive) return true;
          const revenuePass = !revenueActive || Number(row.revenue) >= minimumRevenueValue;
          const ordersPass = !ordersActive || Number(row.orders) >= minimumOrdersValue;
          if (revenueActive && ordersActive) return minimumThresholdMode === 'and' ? (revenuePass && ordersPass) : (revenuePass || ordersPass);
          return revenuePass && ordersPass;
        })
        .sort((a, b) => b.final_score - a.final_score);
      const topRows: ScoreRow[] = sortedAll
        .slice(0, topN)
        .map((row, i) => ({ ...row, rank: i + 1 }));
      topRows.forEach((r) => years.forEach((fy) => {
        if (r[`revenue_fy_${fy}`] == null) r[`revenue_fy_${fy}`] = 0;
        if (r[`orders_fy_${fy}`] == null) r[`orders_fy_${fy}`] = 0;
      }));
      const nextCandidates: ScoreRow[] = sortedAll
        .slice(topN, topN + 5)
        .map((row, i) => ({ ...row, rank: topN + i + 1 }));
      setRankedPartNums(sortedAll.map((r) => r.part_num));
      setFyColumns(years);
      setRows(topRows);
      setNextRowsPreview(nextCandidates);
    });
  }, [filters, trendScoreFilters, topN, weights, minimumRevenueValue, minimumOrdersValue, minimumThresholdMode]);

  const weightDesc: Record<keyof Weights, string> = {
    revenue: 'Higher revenue gets better rank contribution.',
    orders: 'Higher unique orders gets better rank contribution.',
    profit: 'Higher absolute profit gets better rank contribution.',
    margin: 'Higher profit rate (profit/revenue) gets better rank contribution.',
    trend: 'Uses Trend v2 momentum, gap handling, dormancy and spike protection.',
    active: 'Rewards parts active across more fiscal years.'
  };

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
    setTopN(10);
    setGraphicsTopN(5);
    setPeriodMode('all');
    setFromMonth('');
    setToMonth('');
    setTrendScoreFromMonth('');
    setMinimumRevenue('');
    setMinimumOrders('');
    setMinimumThresholdMode('and');
    setWeights({ revenue: 30, orders: 20, profit: 20, margin: 10, trend: 5, active: 15 });
  };

  const toggleSectionOnKeyDown = (event: { key: string; preventDefault: () => void }, toggle: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };



  useEffect(() => {
    setGraphicsTopN(topN);
  }, [topN]);

  const boundedGraphicsTopN = Math.max(1, topN || 1);
  const limitedTopParts = useMemo(() => rankedPartNums.slice(0, boundedGraphicsTopN), [rankedPartNums, boundedGraphicsTopN]);
  const applySavedView = (view: TopItemsSavedView) => {
    setTopN(view.topN);
    setGraphicsTopN(view.topN);
    setPeriodMode(view.periodMode);
    setFromMonth(view.fromMonth);
    setToMonth(view.toMonth);
    setTrendScoreFromMonth(String(view.trendScoreFromMonth ?? ''));
    setMinimumRevenue(String(view.minimumRevenue ?? ''));
    setMinimumOrders(String(view.minimumOrders ?? ''));
    setMinimumThresholdMode((view.minimumThresholdMode as 'and' | 'or') ?? 'and');
    setSearchText(view.searchText);
    setSelectedCustomers(view.selectedCustomers);
    setSelectedCountries(view.selectedCountries);
    setSelectedParts(view.selectedParts);
    setSelectedProdGroups(view.selectedProdGroups);
  };
  const describeSavedView = (view: TopItemsSavedView) => {
    const parts = [
      `${view.topN} top items`,
      `${view.graphicsTopN} chart items`,
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
    if (view.trendScoreFromMonth) parts.push(`Trend after ${view.trendScoreFromMonth}`);
    if (view.minimumRevenue) parts.push(`Min revenue ${view.minimumRevenue}`);
    if (view.minimumOrders) parts.push(`Min orders ${view.minimumOrders}`);
    if (view.minimumRevenue && view.minimumOrders) parts.push(`Thresholds: ${view.minimumThresholdMode.toUpperCase()}`);
    if (view.searchText) parts.push(`LineDesc contains "${view.searchText}"`);
    return parts.join(' | ');
  };
  const savedViewItems = savedViews.map((view) => ({
    name: view.name,
    summary: describeSavedView(view.snapshot),
    active: view.name === activeViewName
  }));

  const sectionFilters = (sf: TopSectionFilter): Filters => {
    const f: Filters = { ...filters, parts: sf.parts.length ? sf.parts : [''] };
    if (sf.fromMonth) f.startDate = monthStart(sf.fromMonth) || f.startDate;
    if (sf.toMonth) f.endDate = monthEnd(sf.toMonth) || f.endDate;
    return f;
  };

  useEffect(() => {
    setTopFilters((prev) => {
      const next = { ...prev };
      const previousLimited = previousLimitedTopPartsRef.current;
      (Object.keys(next) as TopKey[]).forEach((k) => {
        const currentParts = next[k].parts;
        const kept = currentParts.filter((p) => limitedTopParts.includes(p));
        const hadAllSelected = previousLimited.length > 0
          && currentParts.length === previousLimited.length
          && previousLimited.every((part) => currentParts.includes(part));
        const shouldDefaultToAll = hadAllSelected || currentParts.length === 0;
        next[k] = { ...next[k], parts: shouldDefaultToAll ? [...limitedTopParts] : kept };
      });
      previousLimitedTopPartsRef.current = [...limitedTopParts];
      return next;
    });
  }, [limitedTopParts]);

  useEffect(() => {
    Promise.all([
      getRevenueByFYForParts(sectionFilters(topFilters.trendRevenue), topFilters.trendRevenue.parts),
      getOrdersByFYForParts(sectionFilters(topFilters.trendOrders), topFilters.trendOrders.parts),
      getRevenueCostProfitOverTime(sectionFilters(topFilters.trendCost), true, 'fy'),
      getRevenueCostProfitOverTime(sectionFilters(topFilters.trendProfit), true, 'fy'),
      getRevenueCostProfitOverTime(sectionFilters(topFilters.trendMargin), true, 'fy'),
      getRevenueTotalsForParts(sectionFilters(topFilters.totalRevenue), topFilters.totalRevenue.parts),
      getOrderTotalsForParts(sectionFilters(topFilters.totalOrders), topFilters.totalOrders.parts),
      getRevenueByFYAndPartForParts(sectionFilters(topFilters.multiRevenue), topFilters.multiRevenue.parts),
      getOrdersByFYAndPartForParts(sectionFilters(topFilters.multiOrders), topFilters.multiOrders.parts)
    ]).then(([tr, to, tc, tp, tm, trt, tot, mrv, mor]) => {
      setTopRevByFy(tr as Record<string, unknown>[]); setTopOrdByFy(to as Record<string, unknown>[]); setTopRevTotals(trt as Record<string, unknown>[]); setTopOrdTotals(tot as Record<string, unknown>[]);
      setTopRevByFyPart(mrv as Record<string, unknown>[]); setTopOrdByFyPart(mor as Record<string, unknown>[]);
      const mapRows = (rows: Record<string, unknown>[], key: 'cost' | 'profit' | 'margin_pct') => rows.map((r) => ({ fy: String(r.period ?? ''), [key]: Number(r[key] ?? 0) }));
      setTopValueByFy([
        ...mapRows(tc as Record<string, unknown>[], 'cost').map((r) => ({ fy: r.fy, cost: r.cost })),
        ...mapRows(tp as Record<string, unknown>[], 'profit').map((r) => ({ fy: r.fy, profit: r.profit })),
        ...mapRows(tm as Record<string, unknown>[], 'margin_pct').map((r) => ({ fy: r.fy, margin_pct: r.margin_pct }))
      ]);
    });
  }, [topFilters, filters, limitedTopParts]);

  const topItemsInsightsSummary = useMemo(() => ({
    topN,
    displayedRows: rows.length,
    rankedParts: rankedPartNums.length,
    tableMode,
    filters: {
      periodMode,
      fromMonth,
      toMonth,
      trendScoreFromMonth,
      minimumRevenue,
      minimumOrders,
      minimumThresholdMode,
      searchLineDesc: searchText,
      customers: [...selectedCustomers],
      countries: [...selectedCountries],
      parts: [...selectedParts],
      prodGroups: [...selectedProdGroups]
    },
    weights: { ...weights },
    topRows: rows.slice(0, 8).map(mapInsightsRow),
    nextRows: nextRowsPreview.slice(0, 5).map(mapInsightsRow),
    cutoff: rows.length && nextRowsPreview.length
      ? {
        visibleRank: Number(rows[rows.length - 1].rank),
        visiblePart: String(rows[rows.length - 1].part_num),
        visibleFinalScore: Number(rows[rows.length - 1].final_score),
        nextRank: Number(nextRowsPreview[0].rank),
        nextPart: String(nextRowsPreview[0].part_num),
        nextFinalScore: Number(nextRowsPreview[0].final_score),
        finalScoreGap: Number(rows[rows.length - 1].final_score) - Number(nextRowsPreview[0].final_score)
      }
      : null
  }), [
    topN,
    rows,
    nextRowsPreview,
    rankedPartNums.length,
    tableMode,
    periodMode,
    fromMonth,
    toMonth,
    trendScoreFromMonth,
    minimumRevenue,
    minimumOrders,
    minimumThresholdMode,
    searchText,
    selectedCustomers,
    selectedCountries,
    selectedParts,
    selectedProdGroups,
    weights
  ]);
  const topItemsAnalysisKey = useMemo(() => JSON.stringify(topItemsInsightsSummary), [topItemsInsightsSummary]);
  const analysisPrompt = uiLang === 'fr'
    ? 'Explique pourquoi les top items actuellement affiches ressortent dans ce scope. Utilise uniquement les filtres actifs, la fenetre de tendance, les ponderations, les lignes visibles, les items suivants juste sous la limite d affichage et le contexte de limite d affichage fournis. Chaque affirmation doit s appuyer sur ces donnees. N utilise jamais les noms techniques internes comme topRows, nextRows ou cutoff dans ta reponse. Utilise exactement cette structure, avec des lignes courtes et des puces. Scope: 1 a 2 puces. Main drivers: 2 a 3 puces. Shared patterns: 2 a 3 puces. Why these over the next candidates: 2 a 3 puces, en comparant les top items visibles aux items suivants juste sous la limite d affichage. Outliers: 1 a 2 puces. Business read: 1 a 2 puces. Next checks: 2 a 3 puces. Limits: 1 puce. Ne justifie pas la formule abstraitement. Explique ce que le classement visible reflete et pourquoi ces lignes passent devant les suivantes.'
    : 'Explain why the currently displayed top items surface in this scope. Use only the active filters, trend window, weights, visible rows, the next-ranked items just below the display cutoff, and the display cutoff context. Every claim must tie back to that evidence. Never use internal field names like topRows, nextRows, or cutoff in the response. Use exactly this structure, with short lines and bullet points. Scope: 1-2 bullets. Main drivers: 2-3 bullets. Shared patterns: 2-3 bullets. Why these over the next candidates: 2-3 bullets comparing the visible top items to the next-ranked items just below the display cutoff. Outliers: 1-2 bullets. Business read: 1-2 bullets. Next checks: 2-3 bullets. Limits: 1 bullet. Do not defend the formula abstractly. Explain what the visible ranking is reflecting and why these rows clear the display cutoff ahead of the next candidates.';
  const analysisIsStale = Boolean(analysisText || analysisError) && analysisContextKey !== topItemsAnalysisKey;
  const analysisSections = useMemo(() => parseAnalysisSections(analysisText, uiLang), [analysisText, uiLang]);
  const analysisStatusLabel = !topItemsInsightsSummary.topRows.length
    ? (uiLang === 'fr' ? 'Pas de lignes' : 'No rows yet')
    : analysisPending
      ? (uiLang === 'fr' ? 'Analyse en cours' : 'Analyzing')
      : analysisText
        ? (analysisIsStale
            ? (uiLang === 'fr' ? 'A rafraichir' : 'Needs refresh')
            : (uiLang === 'fr' ? 'Pret' : 'Ready'))
        : analysisError
          ? (uiLang === 'fr' ? 'A relancer' : 'Retry needed')
          : (uiLang === 'fr' ? 'Non genere' : 'Not generated');

  const runTopItemsAnalysis = async () => {
    if (analysisPending || !topItemsInsightsSummary.topRows.length) return;
    setAnalysisPending(true);
    setAnalysisError('');
    setAnalysisContextKey(topItemsAnalysisKey);
    try {
      const topItemsViewRaw = {
        topN,
        graphicsTopN: boundedGraphicsTopN,
        tableMode,
        periodMode,
        fromMonth,
        toMonth,
        trendScoreFromMonth,
        minimumRevenue,
        minimumOrders,
        minimumThresholdMode,
        searchText,
        selectedCustomers,
        selectedCountries,
        selectedParts,
        selectedProdGroups,
        topFilters,
        weights,
        insightsSummary: topItemsInsightsSummary
      };
      const context = await buildInsightsContextPack({
        route: '/top-items',
        language: uiLang,
        globalFilters,
        datasetMeta,
        potentialRaw,
        potentialViewRaw,
        pricingViewRaw,
        topItemsViewRaw
      });
      const reply = await requestInsightsReply({
        messages: [{ role: 'user', content: analysisPrompt }],
        context
      });
      setAnalysisText(reply.answer);
      setAnalysisTips(reply.tips);
      setAnalysisContextKey(topItemsAnalysisKey);
    } catch {
      setAnalysisError(uiLang === 'fr'
        ? 'Impossible de generer l analyse maintenant. Reessayez.'
        : 'Unable to generate the analysis right now. Please try again.');
    } finally {
      setAnalysisPending(false);
    }
  };

  useEffect(() => {
    setPageState('top-items', {
      topN,
      graphicsTopN: boundedGraphicsTopN,
      graphicsCollapsed,
      weightsCollapsed,
      analysisCollapsed,
      tableMode,
      topFilters,
        periodMode,
        fromMonth,
        toMonth,
        trendScoreFromMonth,
        minimumRevenue,
        minimumOrders,
        minimumThresholdMode,
        searchText,
        selectedCustomers,
      selectedCountries,
      selectedParts,
      selectedProdGroups,
      weights,
      insightsSummary: topItemsInsightsSummary
    });
  }, [topN, boundedGraphicsTopN, graphicsCollapsed, weightsCollapsed, analysisCollapsed, tableMode, topFilters, periodMode, fromMonth, toMonth, trendScoreFromMonth, minimumRevenue, minimumOrders, minimumThresholdMode, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, weights, topItemsInsightsSummary, setPageState]);

  useEffect(() => {
    setTopItemsSelection({ partNums: rankedPartNums, topN: boundedGraphicsTopN });
  }, [rankedPartNums, boundedGraphicsTopN, setTopItemsSelection]);


  const setTopFilter = (key: TopKey, patch: Partial<TopSectionFilter>) => setTopFilters((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const chartTopRev = topRevByFy.map((r) => ({ fy: String(r.fy ?? ''), revenue: Math.round(Number(r.revenue ?? 0)) }));
  const chartTopOrd = topOrdByFy.map((r) => ({ fy: String(r.fy ?? ''), orders: Number(r.orders ?? 0) }));
  const chartTopRevTotals = topRevTotals.map((r) => ({ part_num: String(r.part_num ?? ''), revenue: Math.round(Number(r.revenue ?? 0)) }));
  const chartTopOrdTotals = topOrdTotals.map((r) => ({ part_num: String(r.part_num ?? ''), orders: Number(r.orders ?? 0) }));
  const chartTopCost = topValueByFy.filter((r) => r.cost != null).map((r) => ({ fy: String(r.fy ?? ''), cost: Number(r.cost ?? 0) }));
  const chartTopProfit = topValueByFy.filter((r) => r.profit != null).map((r) => ({ fy: String(r.fy ?? ''), profit: Number(r.profit ?? 0) }));
  const chartTopMargin = topValueByFy.filter((r) => r.margin_pct != null).map((r) => ({ fy: String(r.fy ?? ''), margin_pct: Number(r.margin_pct ?? 0) }));
  const multiRevSeries = (topFilters.multiRevenue.parts.length ? topFilters.multiRevenue.parts : limitedTopParts).slice(0, 8);
  const multiOrdSeries = (topFilters.multiOrders.parts.length ? topFilters.multiOrders.parts : limitedTopParts).slice(0, 8);
  const pivotByFy = (rows: Record<string, unknown>[], valueKey: 'revenue' | 'orders', series: string[]) => {
    const byFy = new Map<string, Record<string, number | string>>();
    rows.forEach((r) => { const fy = String(r.fy ?? ''); const part = String(r.part_num ?? ''); if (!fy || !part) return; if (!byFy.has(fy)) byFy.set(fy, { fy }); byFy.get(fy)![part] = Number(r[valueKey] ?? 0); });
    return [...byFy.values()].sort((a, b) => Number(a.fy) - Number(b.fy)).map((row) => { const filled: Record<string, number | string> = { ...row }; series.forEach((part) => { if (filled[part] == null) filled[part] = 0; }); return filled; });
  };
  const chartTopRevMulti = pivotByFy(topRevByFyPart, 'revenue', multiRevSeries);
  const chartTopOrdMulti = pivotByFy(topOrdByFyPart, 'orders', multiOrdSeries);
  const lineDescByPart = useMemo(() => new Map(rows.map((row) => [String(row.part_num), String(row.line_desc_full || row.line_desc_short)])), [rows]);
  const scoreHelpText = {
    revenue: 'Normalized rank based on total revenue.',
    orders: 'Normalized rank based on total orders.',
    profit: 'Normalized rank based on total profit.',
    margin: 'Normalized rank based on profit margin.',
    trend: 'Trend v2 momentum score for this part.',
    active: 'Normalized rank based on active fiscal years.',
    final: 'Weighted blend of the score columns.'
  };
  const renderTopControls = (key: TopKey) => {
    const current = topFilters[key];
    return <div className="grid gap-2 mb-2 md:grid-cols-[8rem_8rem_minmax(0,1fr)]">
      <label className="text-xs text-[var(--text-muted)]">From YYYY-MM
        <input type="text" value={current.fromMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setTopFilter(key, { fromMonth: n }); }} className="card w-full px-2 py-1 mt-1" />
      </label>
      <label className="text-xs text-[var(--text-muted)]">To YYYY-MM
        <input type="text" value={current.toMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setTopFilter(key, { toMonth: n }); }} className="card w-full px-2 py-1 mt-1" />
      </label>
      <div className="text-xs text-[var(--text-muted)]">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span>Top Items (from model)</span>
          <div className="flex items-center gap-1">
            <button className="card px-2 py-0.5 text-[10px]" onClick={() => setTopFilter(key, { parts: [...limitedTopParts] })}>{uiLang === 'fr' ? 'Tout selectionner' : 'Select all'}</button>
            <button className="card px-2 py-0.5 text-[10px]" onClick={() => setTopFilter(key, { parts: [] })}>{uiLang === 'fr' ? 'Tout deselectionner' : 'Unselect all'}</button>
          </div>
        </div>
        <div className="card h-24 overflow-auto p-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">{limitedTopParts.map((p) => <label key={`${key}-${p}`} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={current.parts.includes(p)} onChange={() => setTopFilter(key, { parts: current.parts.includes(p) ? current.parts.filter((x) => x !== p) : [...current.parts, p] })} /><HoverInfo label={<span className="truncate max-w-[9rem]">{p}</span>} tooltip={lineDescByPart.get(p) || (uiLang === 'fr' ? 'Aucune description disponible.' : 'No line description available.')} placement="bottom" className="min-w-0" /></label>)}</div>
        </div>
      </div>
    </div>;
  };
  const cardTitle = (title: string, key: TopKey) => <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{title}</h3><Link className="card px-2 py-1 text-xs" to={`/explorer/graphic/${key}`}>Expand</Link></div>;

  return <div>
    <PageHeader title="Top Items Scoring Model" subtitle="Weighted deterministic model for top parts." />

    <SavedViewsPanel
      description="Save the current Top Items filters, then apply or delete them whenever needed."
      saveName={saveName}
      onSaveNameChange={setSaveName}
      onSave={saveCurrentView}
      savePlaceholder="Ex: High-value refractory parts"
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
      <div className="grid md:grid-cols-1 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">Period<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card px-2 py-1 block w-full mt-1"><option value="all">All</option><option value="after">After (month)</option><option value="before">Before (month)</option><option value="between">Between (months)</option></select></label>
      </div>
      <div className="grid md:grid-cols-5 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={fromMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setFromMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={toMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setToMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
        <label className="text-xs text-[var(--text-muted)]">Period for trending score (After YYYY-MM)<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={trendScoreFromMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setTrendScoreFromMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>
        <label className="text-xs text-[var(--text-muted)]">Top items to show<input type="number" min={1} value={topN} onChange={(e) => setTopN(Math.max(1, Number(e.target.value || 50)))} className="card w-full px-2 py-1 mt-1" /></label>
      </div>
      <div className="card mt-3 p-3">
        <p className="text-xs font-semibold">Minimum thresholds</p>
        <p className="text-[11px] text-[var(--text-muted)] mt-1">Hide low-signal items before ranking. If both thresholds are filled, choose whether items must satisfy both or just one.</p>
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem] gap-2 mt-3">
          <label className="text-xs text-[var(--text-muted)]">Minimum revenue
            <input type="number" min={0} step="any" value={minimumRevenue} onChange={(e) => setMinimumRevenue(e.target.value)} className="card w-full px-2 py-1 mt-1" placeholder="0" />
          </label>
          <label className="text-xs text-[var(--text-muted)]">Minimum orders
            <input type="number" min={0} step={1} value={minimumOrders} onChange={(e) => setMinimumOrders(e.target.value)} className="card w-full px-2 py-1 mt-1" placeholder="0" />
          </label>
          <label className="text-xs text-[var(--text-muted)]">If both are set
            <select value={minimumThresholdMode} onChange={(e) => setMinimumThresholdMode(e.target.value as 'and' | 'or')} className="card w-full px-2 py-1 mt-1">
              <option value="and">Require both (AND)</option>
              <option value="or">Require either (OR)</option>
            </select>
          </label>
        </div>
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((c) => <button key={`${c.k}:${c.v}`} className="card px-2 py-1 text-xs" onClick={() => removeValue(c.k, c.v)}>{c.k}:{c.v} ×</button>)}</div>}
    </section>

    <section className="mb-3 border-2 border-[var(--teal)]/25 rounded-2xl p-4 bg-[var(--surface)]/15">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!weightsCollapsed}
        className="flex items-center justify-between gap-3 cursor-pointer"
        onClick={() => setWeightsCollapsed((x) => !x)}
        onKeyDown={(event) => toggleSectionOnKeyDown(event, () => setWeightsCollapsed((x) => !x))}
      >
        <div>
          <h3 className="font-semibold">{uiLang === 'fr' ? 'Pond\u00e9rations' : 'Weights'}</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">{uiLang === 'fr' ? 'Contr\u00f4lez la saisie des pond\u00e9rations et le radar avec un seul bouton.' : 'Control the weight inputs and radar with one collapse button.'}</p>
        </div>
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <button className="card px-3 py-1 text-xs" onClick={() => setWeightsCollapsed((x) => !x)}>
            {weightsCollapsed
              ? (uiLang === 'fr' ? 'Afficher les pond\u00e9rations' : 'Show weights')
              : (uiLang === 'fr' ? 'Masquer les pond\u00e9rations' : 'Hide weights')}
          </button>
        </div>
      </div>
      {!weightsCollapsed && <div className="grid lg:grid-cols-2 gap-3 mt-4">
        <div className="card p-3">
          <h3 className="font-semibold mb-2">{uiLang === 'fr' ? 'Pond\u00e9rations (saisie)' : 'Weights (type values)'}</h3>
          <p className="text-xs text-[var(--text-muted)] mb-2">{uiLang === 'fr' ? 'Les valeurs peuvent \u00eatre positives, la normalisation est appliqu\u00e9e automatiquement.' : 'Values can be any positive numbers. We normalize internally so the total influence is balanced.'}</p>
          <p className="text-xs text-[var(--text-muted)] mb-2">{uiLang === 'fr' ? 'Le poids de tendance utilise Trend v2 avec detection des pics, d une cadence irreguliere et de la dormance.' : 'The trend weight uses Trend v2 with spike, irregular-cadence and dormancy detection.'}</p>
          <div className="grid md:grid-cols-2 gap-2">
            {(Object.keys(weights) as (keyof Weights)[]).map((key) => <label key={key} className="text-xs text-[var(--text-muted)]"><span className="text-[var(--text)] font-semibold">{String(key).charAt(0).toUpperCase() + String(key).slice(1)}</span>
              <input type="number" min={0} max={100} step={1} value={weights[key]} onChange={(e) => setWeights((w) => ({ ...w, [key]: Math.max(0, Math.min(100, Number(e.target.value || 0))) }))} className="card w-full px-2 py-1 mt-1" />
              <span className="block mt-1">{weightDesc[key]}</span>
              <span className="block mt-1 text-[10px]">{uiLang === 'fr' ? 'Maximum : 100' : 'Maximum: 100'}</span>
            </label>)}
          </div>
        </div>
        <div className="card p-3 min-h-[23rem]">
          <h3 className="font-semibold mb-2">{uiLang === 'fr' ? 'Visualisation radar des pond\u00e9rations' : 'Weights radar visualization'}</h3>
          <div className="h-[19rem]">
            <ResponsiveContainer>
              <RadarChart data={(Object.keys(weights) as (keyof Weights)[]).map((k) => ({ metric: String(k), value: Number(weights[k]) }))}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" />
                <Radar dataKey="value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.35} />
                <Tooltip {...chartTooltipProps} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>}
    </section>

    <section className="mb-4 border-2 border-[var(--teal)]/40 rounded-2xl p-4 bg-[var(--surface)]/20">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!graphicsCollapsed}
        className="flex flex-wrap items-end justify-between gap-3 mb-3 cursor-pointer"
        onClick={() => setGraphicsCollapsed((x) => !x)}
        onKeyDown={(event) => toggleSectionOnKeyDown(event, () => setGraphicsCollapsed((x) => !x))}
      >
        <h3 className="font-semibold text-base">Top Items Graphics</h3>
        <div className="flex flex-wrap items-end gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          {!graphicsCollapsed && <label className="text-xs text-[var(--text-muted)]">Top items to show
            <input type="number" min={1} value={topN} onChange={(e) => setTopN(Math.max(1, Number(e.target.value || 50)))} className="card w-24 px-2 py-1 mt-1" />
          </label>}
          <button className="card px-3 py-1 text-xs" onClick={() => setGraphicsCollapsed((x) => !x)}>{graphicsCollapsed ? 'Show top-items graphics' : 'Hide top-items graphics'}</button>
        </div>
      </div>
      {!graphicsCollapsed && <div className="grid xl:grid-cols-2 gap-4">
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Revenue by Time', 'trendRevenue')}{renderTopControls('trendRevenue')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopRev}><XAxis dataKey="fy" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Line type="monotone" dataKey="revenue" stroke="#06b6d4"/></LineChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Orders by Time', 'trendOrders')}{renderTopControls('trendOrders')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopOrd}><XAxis dataKey="fy" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip {...chartTooltipProps} /><Line type="monotone" dataKey="orders" stroke="#84cc16"/></LineChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Total Cost by Time', 'trendCost')}{renderTopControls('trendCost')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopCost}><XAxis dataKey="fy" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Line type="monotone" dataKey="cost" stroke="#f59e0b"/></LineChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Total Profit by Time', 'trendProfit')}{renderTopControls('trendProfit')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopProfit}><XAxis dataKey="fy" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Line type="monotone" dataKey="profit" stroke="#22c55e"/></LineChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Total Margin % by Time', 'trendMargin')}{renderTopControls('trendMargin')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopMargin}><XAxis dataKey="fy" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => pct(Number(v))} {...chartTooltipProps} /><Line type="monotone" dataKey="margin_pct" stroke="#a855f7"/></LineChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Total Revenue', 'totalRevenue')}{renderTopControls('totalRevenue')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><BarChart data={chartTopRevTotals}><XAxis dataKey="part_num" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip formatter={(v) => currency(Number(v))} {...chartTooltipProps} /><Bar dataKey="revenue" fill="#0ea5e9"/></BarChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Total Orders', 'totalOrders')}{renderTopControls('totalOrders')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><BarChart data={chartTopOrdTotals}><XAxis dataKey="part_num" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip {...chartTooltipProps} /><Bar dataKey="orders" fill="#65a30d"/></BarChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Revenue by Time (multiple curves)', 'multiRevenue')}{renderTopControls('multiRevenue')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopRevMulti}><XAxis dataKey="fy" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip shared formatter={(v) => currency(Number(v))} {...chartTooltipProps} />{multiRevSeries.map((p, i) => <Line key={p} type="monotone" dataKey={p} name={p} stroke={["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#06b6d4", "#f43f5e", "#eab308", "#10b981"][i % 8]} connectNulls dot />)}</LineChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Orders by Time (multiple curves)', 'multiOrders')}{renderTopControls('multiOrders')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopOrdMulti}><XAxis dataKey="fy" {...cartesianAxisProps} /><YAxis {...cartesianAxisProps} /><Tooltip shared {...chartTooltipProps} />{multiOrdSeries.map((p, i) => <Line key={p} type="monotone" dataKey={p} name={p} stroke={["#84cc16", "#14b8a6", "#f59e0b", "#8b5cf6", "#f43f5e", "#0ea5e9", "#22c55e", "#eab308"][i % 8]} connectNulls dot />)}</LineChart></ResponsiveContainer></div></section>
      </div>}
    </section>

    <section className="mb-3 flex justify-center">
      <div className="insights-feature-card w-full max-w-5xl p-4">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!analysisCollapsed}
          className="flex flex-wrap items-start justify-between gap-3 cursor-pointer"
          onClick={() => setAnalysisCollapsed((value) => !value)}
          onKeyDown={(event) => toggleSectionOnKeyDown(event, () => setAnalysisCollapsed((value) => !value))}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{uiLang === 'fr' ? 'Analyse IA des top items actuels' : 'AI analysis of current top items'}</h3>
              <span className="card px-2 py-0.5 text-[10px]">{analysisStatusLabel}</span>
            </div>
            <p className="text-xs mt-1 opacity-85">
              {uiLang === 'fr'
                ? 'Placee ici pour analyser le classement apres les graphiques, juste avant le tableau detaille.'
                : 'Placed here to interpret the ranking after the charts, just before the detailed table.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="card px-3 py-1 text-xs"
              disabled={analysisPending || !topItemsInsightsSummary.topRows.length}
              onClick={() => void runTopItemsAnalysis()}
            >
              {analysisPending
                ? (uiLang === 'fr' ? 'Analyse...' : 'Analyzing...')
                : (analysisText || analysisError
                    ? (uiLang === 'fr' ? 'Rafraichir l analyse' : 'Refresh analysis')
                    : (uiLang === 'fr' ? 'Expliquer les top items visibles' : 'Explain current top items'))}
            </button>
            {(analysisText || analysisError) && (
              <button
                type="button"
                className="card px-3 py-1 text-xs"
                onClick={() => {
                  setAnalysisText('');
                  setAnalysisTips([]);
                  setAnalysisError('');
                  setAnalysisContextKey('');
                }}
              >
                {uiLang === 'fr' ? 'Effacer' : 'Clear'}
              </button>
            )}
            <button type="button" className="card px-3 py-1 text-xs" onClick={() => setAnalysisCollapsed((value) => !value)}>
              {analysisCollapsed
                ? (uiLang === 'fr' ? 'Afficher l analyse' : 'Show analysis')
                : (uiLang === 'fr' ? 'Masquer l analyse' : 'Hide analysis')}
            </button>
          </div>
        </div>

        {!analysisCollapsed && (
          <div className="mt-4 space-y-3">
            {!topItemsInsightsSummary.topRows.length && (
              <p className="text-xs opacity-85">
                {uiLang === 'fr'
                  ? 'Aucune ligne visible pour l instant. Chargez d abord les top items, puis lancez l analyse.'
                  : 'No visible rows yet. Load top items first, then run the analysis.'}
              </p>
            )}
            {analysisIsStale && !analysisPending && (
              <p className="text-xs text-amber-200">
                {uiLang === 'fr'
                  ? 'Cette analyse a ete generee avec un ancien etat de filtres ou de ponderations. Rafraichissez-la pour l aligner sur le classement visible.'
                  : 'The current analysis was generated with an older filter or weight state. Refresh it to match the visible ranking.'}
              </p>
            )}
            {analysisError && (
              <p className="text-xs text-rose-100">{analysisError}</p>
            )}
            {analysisSections.length > 0 && (
              <div className="grid lg:grid-cols-2 gap-3">
                {analysisSections.map((section, index) => (
                  <div key={`${section.title}-${index}`} className="card p-3">
                    <p className="text-xs font-semibold mb-2">{section.title}</p>
                    <ul className="space-y-2 text-sm leading-6">
                      {section.items.map((item, itemIndex) => <li key={`${section.title}-${itemIndex}`} className="flex gap-2"><span className="mt-[0.15rem] text-[10px]">-</span><span>{item}</span></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {analysisTips.length > 0 && (
              <div className="card p-3">
                <p className="text-xs font-semibold mb-2">{uiLang === 'fr' ? 'Verifications rapides a faire ensuite' : 'Quick follow-up checks'}</p>
                <ul className="text-xs space-y-1">
                  {analysisTips.map((tip, index) => <li key={`${tip}-${index}`}>- {tip}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>

    <section className="card p-3 mb-2">
      <div className="grid md:grid-cols-2 gap-3 items-end">
        <label className="text-xs text-[var(--text-muted)]">Table view
          <select value={tableMode} onChange={(e) => setTableMode(e.target.value as TableMode)} className="card w-full px-2 py-1 mt-1">
            <option value="compact">Compact</option>
            <option value="complete">Complete</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">Top items to show
          <input type="number" min={1} value={topN} onChange={(e) => setTopN(Math.max(1, Number(e.target.value || 50)))} className="card w-full px-2 py-1 mt-1" />
        </label>
      </div>
    </section>

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0">
          <tr className="text-left border-b border-[var(--border)]">
            <th className="px-3 py-2">Rank</th><th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (Expandable)</th><th className="px-3 py-2">ProdGroup</th>
            <th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Margin</th>
            <th className="px-3 py-2"><HoverInfo label="Revenue Score" tooltip={scoreHelpText.revenue} placement="bottom" /></th><th className="px-3 py-2"><HoverInfo label="Orders Score" tooltip={scoreHelpText.orders} placement="bottom" /></th><th className="px-3 py-2"><HoverInfo label="Profit Score" tooltip={scoreHelpText.profit} placement="bottom" /></th><th className="px-3 py-2"><HoverInfo label="Margin Score" tooltip={scoreHelpText.margin} placement="bottom" /></th><th className="px-3 py-2"><HoverInfo label="Trend Score v2" tooltip={scoreHelpText.trend} placement="bottom" /></th>
            <th className="px-3 py-2"><HoverInfo label="Active Score" tooltip={scoreHelpText.active} placement="bottom" /></th><th className="px-3 py-2 bg-amber-500/15"><HoverInfo label="Final Score" tooltip={scoreHelpText.final} placement="bottom" /></th>
            {tableMode === 'complete' && <>
              {fyColumns.map((fy) => <th key={`r-${fy}`} className="px-3 py-2">Rev {fyLabel(fy)}</th>)}
              {fyColumns.map((fy) => <th key={`o-${fy}`} className="px-3 py-2">Ord {fyLabel(fy)}</th>)}
            </>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            return <tr key={`${row.part_num}-${i}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
              <td className="px-3 py-2 whitespace-nowrap">{row.rank}</td><td className="px-3 py-2 whitespace-nowrap">{row.cust_id}</td><td className="px-3 py-2 whitespace-normal break-words">{row.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{row.country}</td><td className="px-3 py-2 whitespace-nowrap">{row.part_num}</td><td className="px-3 py-2 whitespace-normal break-words"><ExpandableText previewText={row.line_desc_short} fullText={row.line_desc_full} /></td><td className="px-3 py-2 whitespace-nowrap">{row.prod_group}</td>
              <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue))}</td><td className="px-3 py-2 whitespace-nowrap">{formatInteger(Number(row.orders))}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit))}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.margin))}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatFixed(Number(row.revenue_score), 3)}</td><td className="px-3 py-2 whitespace-nowrap">{formatFixed(Number(row.orders_score), 3)}</td><td className="px-3 py-2 whitespace-nowrap">{formatFixed(Number(row.profit_score), 3)}</td><td className="px-3 py-2 whitespace-nowrap">{formatFixed(Number(row.margin_score), 3)}</td><td className="px-3 py-2 whitespace-nowrap">{formatFixed(Number(row.trend_score), 3)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatFixed(Number(row.active_score), 3)}</td><td className="px-3 py-2 whitespace-nowrap bg-amber-500/10 font-semibold">{formatFixed(Number(row.final_score), 3)}</td>
              {tableMode === 'complete' && <>
                {fyColumns.map((fy) => <td key={`rv-${i}-${fy}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`revenue_fy_${fy}`] ?? 0))}</td>)}
                {fyColumns.map((fy) => <td key={`ov-${i}-${fy}`} className="px-3 py-2 whitespace-nowrap">{formatInteger(Number(row[`orders_fy_${fy}`] ?? 0))}</td>)}
              </>}
            </tr>;
          })}
        </tbody>
      </table>
    </section>
  </div>;
}
