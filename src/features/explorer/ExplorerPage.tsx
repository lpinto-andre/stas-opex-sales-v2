import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { KPIStatCard } from '@/components/ui/KPIStatCard';
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  getCustomerOptions,
  getDetailRows,
  getDistinctOptions,
  getKPIs,
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

type Option = { value: string; label: string };
type PeriodMode = 'all' | 'after' | 'before' | 'between';
type TopKey = 'trendRevenue' | 'trendOrders' | 'totalRevenue' | 'totalOrders' | 'multiRevenue' | 'multiOrders';

type ExplorerRow = {
  invoice_date: string; invoice_num: string; order_num: string; cust_id: string; cust_name: string;
  part_num: string; line_desc_short: string; prod_group: string; country: string; territory: string; class_id: string;
  amount: number; cost: number; profit: number; margin_pct: number; invoice_fy: number; order_line_fy: number;
};

type TopSectionFilter = { fromMonth: string; toMonth: string; parts: string[] };

const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', color: '#f8fafc' };
const tooltipLabelStyle = { color: '#f8fafc', fontWeight: 600 };
const isValidMonth = (m: string) => /^\d{4}-\d{2}$/.test(m);
const safeMonthInput = (v: string) => (/^\d{0,4}(?:-\d{0,2})?$/.test(v) ? v : null);
const monthStart = (m: string) => (isValidMonth(m) ? `${m}-01` : '');
const monthEnd = (m: string) => {
  if (!isValidMonth(m)) return '';
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 0);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function MultiPick({ label, options, values, onChange }: { label: string; options: Option[]; values: string[]; onChange: (next: string[]) => void }) {
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return <div className="text-xs text-[var(--text-muted)]"><div className="mb-1">{label}</div><div className="card h-28 overflow-auto p-2 space-y-1">{options.map((o) => <label key={o.value} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} /><span className="text-xs">{o.label}</span></label>)}</div></div>;
}

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

  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [territorySearch, setTerritorySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>((saved.selectedCountries as string[]) ?? []);
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>((saved.selectedTerritories as string[]) ?? []);
  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>((saved.selectedProdGroups as string[]) ?? []);

  const [topFilters, setTopFilters] = useState<Record<TopKey, TopSectionFilter>>((saved.topFilters as Record<TopKey, TopSectionFilter>) ?? emptyTopFilters(String(saved.fromMonth ?? ''), String(saved.toMonth ?? '')));

  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [territoryOptions, setTerritoryOptions] = useState<Option[]>([]);
  const [partOptions, setPartOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);

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

  useEffect(() => { getCustomerOptions(customerSearch, 150).then((r) => setCustomerOptions(r.map((x) => ({ value: x.value, label: x.label })))); }, [customerSearch]);
  useEffect(() => { getDistinctOptions('country', countrySearch, 150).then((r) => setCountryOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [countrySearch]);
  useEffect(() => { getDistinctOptions('territory', territorySearch, 150).then((r) => setTerritoryOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [territorySearch]);
  useEffect(() => { getDistinctOptions('part_num', partSearch, 150).then((r) => setPartOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [partSearch]);
  useEffect(() => { getDistinctOptions('prod_group', groupSearch, 150).then((r) => setGroupOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [groupSearch]);

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

  const allTopParts = useMemo(() => topItemsSelection.partNums.length ? topItemsSelection.partNums : [], [topItemsSelection.partNums]);
  const boundedTopItemsN = Math.max(1, Math.min(10, topItemsN || 5));
  const limitedTopParts = useMemo(() => allTopParts.slice(0, boundedTopItemsN), [allTopParts, boundedTopItemsN]);

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
    Promise.all([
      getKPIs(filters), getRevenueByMonth(filters), getOrdersByMonth(filters), getRevenueByFY(filters), getOrdersByFY(filters), getRevenueByProdGroup(filters), getOrdersByProdGroup(filters), getDetailRows(filters, 600)
    ]).then(([kpi, rm, om, rf, ofy, rg, og, details]) => {
      setKpis(kpi as Record<string, number>);
      setRevMonth(rm as Record<string, unknown>[]); setOrdMonth(om as Record<string, unknown>[]); setRevFy(rf as Record<string, unknown>[]); setOrdersFy(ofy as Record<string, unknown>[]); setRevGroup(rg as Record<string, unknown>[]); setOrdGroup(og as Record<string, unknown>[]);
      setDetailRows((details as Record<string, unknown>[]).map((r) => ({
        invoice_date: String(r.invoice_date ?? '').slice(0, 10), invoice_num: String(r.invoice_num ?? ''), order_num: String(r.order_num ?? ''), cust_id: String(r.cust_id ?? ''), cust_name: String(r.cust_name ?? ''),
        part_num: String(r.part_num ?? ''), line_desc_short: String(r.line_desc ?? '').slice(0, 25), prod_group: String(r.prod_group ?? ''), country: String(r.country ?? ''), territory: String(r.territory ?? ''), class_id: String(r.class_id ?? ''),
        amount: Number(r.amount ?? 0), cost: Number(r.cost ?? 0), profit: Number(r.profit ?? 0), margin_pct: Number(r.margin_pct ?? 0), invoice_fy: Number(r.invoice_fy ?? 0), order_line_fy: Number(r.order_line_fy ?? 0)
      })));
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

  const marginRatio = Number(kpis.revenue ?? 0) > 0 ? Number(kpis.profit ?? 0) / Number(kpis.revenue ?? 1) : 0;
  const resetAll = () => { setSelectedCustomers([]); setSelectedCountries([]); setSelectedTerritories([]); setSelectedParts([]); setSelectedProdGroups([]); setSearchText(''); setPeriodMode('all'); setFromMonth(''); setToMonth(''); setTopItemsN(5); };

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
    <PageHeader title="Discover" subtitle="Real-time DuckDB analytics across imported dataset." actions={<div className="flex gap-2"><button className="card px-3 py-2" onClick={resetAll}>Reset filters</button></div>} />

    <section className="card p-3 mb-3">{/* filters omitted for brevity in this file style */}
      <h3 className="font-semibold mb-2">Filters</h3>
      <div className="grid lg:grid-cols-5 gap-3">
        <div className="space-y-2"><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} /></div>
        <div className="space-y-2"><input value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} placeholder="Search country" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} /></div>
        <div className="space-y-2"><input value={territorySearch} onChange={(e) => setTerritorySearch(e.target.value)} placeholder="Search territory" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Territories" options={territoryOptions} values={selectedTerritories} onChange={setSelectedTerritories} /></div>
        <div className="space-y-2"><input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search part" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} /></div>
        <div className="space-y-2"><input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search group" className="card w-full px-2 py-1 text-xs" /><MultiPick label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} /></div>
      </div>
      <div className="grid md:grid-cols-5 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        <label className="text-xs text-[var(--text-muted)]">Period<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card w-full px-2 py-1 mt-1"><option value="all">All</option><option value="after">After</option><option value="before">Before</option><option value="between">Between</option></select></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input type="text" value={fromMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setFromMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input type="text" value={toMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setToMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
        <label className="text-xs text-[var(--text-muted)]">Default Top Items Count (max 10)<input type="number" min={1} max={10} value={boundedTopItemsN} onChange={(e) => setTopItemsN(Math.max(1, Math.min(10, Number(e.target.value || 5))))} className="card w-full px-2 py-1 mt-1" /></label>
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((c) => <button key={`${c.k}:${c.v}`} onClick={() => removeValue(c.k, c.v)} className="px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs">{c.k}:{c.v} ×</button>)}</div>}
    </section>

    <section className="mb-6 border-2 border-[var(--border)] rounded-2xl p-4 bg-[var(--surface)]/30">
      <h3 className="font-semibold mb-3 text-base">General Graphics</h3>
      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <KPIStatCard label="Revenue" value={currency(Number(kpis.revenue ?? 0))} />
        <KPIStatCard label="Profit" value={currency(Number(kpis.profit ?? 0))} />
        <KPIStatCard label="Margin%" value={pct(marginRatio)} />
        <KPIStatCard label="Orders" value={String(kpis.orders ?? 0)} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Revenue by Month</h3><ResponsiveContainer><LineChart data={chartRevMonth}><XAxis dataKey="month"/><YAxis/><Tooltip formatter={(v) => currency(Number(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Line type="monotone" dataKey="revenue" stroke="#1bc7b3"/></LineChart></ResponsiveContainer></section>
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Orders by Month</h3><ResponsiveContainer><LineChart data={chartOrdMonth}><XAxis dataKey="month"/><YAxis/><Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Line type="monotone" dataKey="orders" stroke="#22c55e"/></LineChart></ResponsiveContainer></section>
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Revenue by Fiscal Year</h3><ResponsiveContainer><BarChart data={chartRevFy}><XAxis dataKey="fy"/><YAxis/><Tooltip formatter={(v) => currency(Number(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Bar dataKey="revenue" fill="#2889c2"/></BarChart></ResponsiveContainer></section>
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Orders by Fiscal Year</h3><ResponsiveContainer><BarChart data={chartOrdersFy}><XAxis dataKey="fy"/><YAxis/><Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Bar dataKey="orders" fill="#21bd5b"/></BarChart></ResponsiveContainer></section>
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Revenue by Product Group</h3><ResponsiveContainer><BarChart data={chartRevGroup}><XAxis dataKey="prod_group"/><YAxis/><Tooltip formatter={(v) => currency(Number(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Bar dataKey="revenue" fill="#f0b429"/></BarChart></ResponsiveContainer></section>
        <section className="card p-3 h-72"><h3 className="font-semibold mb-2">Orders by Product Group</h3><ResponsiveContainer><BarChart data={chartOrdGroup}><XAxis dataKey="prod_group"/><YAxis/><Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Bar dataKey="orders" fill="#a855f7"/></BarChart></ResponsiveContainer></section>
      </div>
    </section>

    <section className="mb-4 border-2 border-[var(--teal)]/40 rounded-2xl p-4 bg-[var(--surface)]/20">
      <h3 className="font-semibold mb-3 text-base">Top Items Graphics</h3>
      <div className="grid xl:grid-cols-2 gap-4">
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Revenue by Time', 'trendRevenue')}{renderTopControls('trendRevenue')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopRev}><XAxis dataKey="fy"/><YAxis/><Tooltip formatter={(v) => currency(Number(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Line type="monotone" dataKey="revenue" stroke="#06b6d4"/></LineChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Orders by Time', 'trendOrders')}{renderTopControls('trendOrders')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopOrd}><XAxis dataKey="fy"/><YAxis/><Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Line type="monotone" dataKey="orders" stroke="#84cc16"/></LineChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Total Revenue', 'totalRevenue')}{renderTopControls('totalRevenue')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><BarChart data={chartTopRevTotals}><XAxis dataKey="part_num"/><YAxis/><Tooltip formatter={(v) => currency(Number(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Bar dataKey="revenue" fill="#0ea5e9"/></BarChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Total Orders', 'totalOrders')}{renderTopControls('totalOrders')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><BarChart data={chartTopOrdTotals}><XAxis dataKey="part_num"/><YAxis/><Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Bar dataKey="orders" fill="#65a30d"/></BarChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Revenue by Time (multiple curves)', 'multiRevenue')}{renderTopControls('multiRevenue')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopRevMulti}><XAxis dataKey="fy"/><YAxis/><Tooltip shared formatter={(v) => currency(Number(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />{multiRevSeries.map((p, i) => <Line key={p} type="monotone" dataKey={p} name={p} stroke={["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#06b6d4", "#f43f5e", "#eab308", "#10b981"][i % 8]} connectNulls dot />)}</LineChart></ResponsiveContainer></div></section>
        <section className="card p-3 min-h-[34rem] flex flex-col">{cardTitle('Top Items: Orders by Time (multiple curves)', 'multiOrders')}{renderTopControls('multiOrders')}<div className="flex-1 min-h-[18rem]"><ResponsiveContainer><LineChart data={chartTopOrdMulti}><XAxis dataKey="fy"/><YAxis/><Tooltip shared contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />{multiOrdSeries.map((p, i) => <Line key={p} type="monotone" dataKey={p} name={p} stroke={["#84cc16", "#14b8a6", "#f59e0b", "#8b5cf6", "#f43f5e", "#0ea5e9", "#22c55e", "#eab308"][i % 8]} connectNulls dot />)}</LineChart></ResponsiveContainer></div></section>
      </div>
    </section>

    <section className="card overflow-auto"><table className="w-full table-auto text-sm"><thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]"><th className="px-3 py-2">InvoiceDate</th><th className="px-3 py-2">InvoiceNum</th><th className="px-3 py-2">OrderNum</th><th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (25)</th><th className="px-3 py-2">ProdGroup</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">Territory</th><th className="px-3 py-2">ClassID</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Cost</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Margin %</th><th className="px-3 py-2">InvoiceFY</th><th className="px-3 py-2">OrderLineFY</th></tr></thead><tbody>{detailRows.map((r, i) => <tr key={`${r.invoice_num}-${i}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top"><td className="px-3 py-2 whitespace-nowrap">{r.invoice_date}</td><td className="px-3 py-2 whitespace-nowrap">{r.invoice_num}</td><td className="px-3 py-2 whitespace-nowrap">{r.order_num}</td><td className="px-3 py-2 whitespace-nowrap">{r.cust_id}</td><td className="px-3 py-2 whitespace-normal break-words">{r.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{r.part_num}</td><td className="px-3 py-2 whitespace-normal break-words">{r.line_desc_short}</td><td className="px-3 py-2 whitespace-nowrap">{r.prod_group}</td><td className="px-3 py-2 whitespace-nowrap">{r.country}</td><td className="px-3 py-2 whitespace-nowrap">{r.territory}</td><td className="px-3 py-2 whitespace-nowrap">{r.class_id}</td><td className="px-3 py-2 whitespace-nowrap">{currency(r.amount)}</td><td className="px-3 py-2 whitespace-nowrap">{currency(r.cost)}</td><td className="px-3 py-2 whitespace-nowrap">{currency(r.profit)}</td><td className="px-3 py-2 whitespace-nowrap">{pct(r.margin_pct)}</td><td className="px-3 py-2 whitespace-nowrap">{r.invoice_fy}</td><td className="px-3 py-2 whitespace-nowrap">{r.order_line_fy}</td></tr>)}</tbody></table></section>
  </div>;
}
