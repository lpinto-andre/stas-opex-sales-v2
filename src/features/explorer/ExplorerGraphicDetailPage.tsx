import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/ui/PageHeader';
import { getOrdersByFYAndPartForParts, getOrdersByFYForParts, getPartsOrdersByFY, getPartsPriorityRows, getPartsRevenueByFY, getRevenueByFYAndPartForParts, getRevenueByFYForParts, getRevenueTotalsForParts, type Filters } from '@/data/queries';
import { useAppStore } from '@/state/store';

type TopKey = 'trendRevenue' | 'trendOrders' | 'totalRevenue' | 'totalOrders' | 'multiRevenue' | 'multiOrders';
type TopSectionFilter = { fromMonth: string; toMonth: string; parts: string[] };
type PartRow = {
  cust_id: string; cust_name: string; country: string; part_num: string; line_desc_short: string; prod_group: string;
  orders: number; revenue: number; profit: number; profit_pct: number; active_fy_count: number; [key: string]: string | number;
};

const COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#f43f5e', '#eab308', '#10b981'];
const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', color: '#f8fafc' };
const tooltipLabelStyle = { color: '#f8fafc', fontWeight: 600 };
const isValidMonth = (m: string) => /^\d{4}-\d{2}$/.test(m);
const safeMonthInput = (v: string) => (/^\d{0,4}(?:-\d{0,2})?$/.test(v) ? v : null);
const monthStart = (m: string) => (isValidMonth(m) ? `${m}-01` : '');
const monthEnd = (m: string) => { if (!isValidMonth(m)) return ''; const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 0); return `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fyLabel = (fyRaw: number | string) => {
  const fy = Number(fyRaw);
  if (!fy) return String(fyRaw ?? '');
  return `FY${String((fy - 1) % 100).padStart(2, '0')}-${String(fy % 100).padStart(2, '0')}`;
};

const titleByKey: Record<TopKey, string> = {
  trendRevenue: 'Top Items: Revenue by Time', trendOrders: 'Top Items: Orders by Time', totalRevenue: 'Top Items: Total Revenue', totalOrders: 'Top Items: Total Orders', multiRevenue: 'Top Items: Revenue by Time (multiple curves)', multiOrders: 'Top Items: Orders by Time (multiple curves)'
};

const defaultTopFilters = (): Record<TopKey, TopSectionFilter> => ({
  trendRevenue: { fromMonth: '', toMonth: '', parts: [] },
  trendOrders: { fromMonth: '', toMonth: '', parts: [] },
  totalRevenue: { fromMonth: '', toMonth: '', parts: [] },
  totalOrders: { fromMonth: '', toMonth: '', parts: [] },
  multiRevenue: { fromMonth: '', toMonth: '', parts: [] },
  multiOrders: { fromMonth: '', toMonth: '', parts: [] }
});

export function ExplorerGraphicDetailPage() {
  const params = useParams<{ graphicKey: TopKey }>();
  const graphicKey = (params.graphicKey ?? 'trendRevenue') as TopKey;
  const saved = useAppStore((s) => (s.pageState.explorer as Record<string, unknown>) ?? {});
  const topItemsSelection = useAppStore((s) => s.topItemsSelection);
  const setPageState = useAppStore((s) => s.setPageState);

  const topFilters = (saved.topFilters as Record<TopKey, TopSectionFilter>) ?? defaultTopFilters();
  const sectionFilter = topFilters[graphicKey] ?? { fromMonth: '', toMonth: '', parts: [] };

  const defaultN = Math.max(1, Math.min(10, Number(saved.topItemsN ?? 5)));
  const [availableTopParts, setAvailableTopParts] = useState<string[]>([]);

  const limitedTop = useMemo(() => {
    if (availableTopParts.length) return availableTopParts.slice(0, defaultN);
    if (topItemsSelection.partNums.length) return topItemsSelection.partNums.slice(0, defaultN);
    return sectionFilter.parts.slice(0, defaultN);
  }, [availableTopParts, topItemsSelection.partNums, sectionFilter.parts, defaultN]);

  const [fromMonth, setFromMonth] = useState(sectionFilter.fromMonth || String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(sectionFilter.toMonth || String(saved.toMonth ?? ''));
  const [parts, setParts] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const globalFilters: Filters = {
      customers: (saved.selectedCustomers as string[])?.length ? (saved.selectedCustomers as string[]) : undefined,
      countries: (saved.selectedCountries as string[])?.length ? (saved.selectedCountries as string[]) : undefined,
      territories: (saved.selectedTerritories as string[])?.length ? (saved.selectedTerritories as string[]) : undefined,
      prodGroups: (saved.selectedProdGroups as string[])?.length ? (saved.selectedProdGroups as string[]) : undefined,
      searchLineDesc: String(saved.searchText ?? '') || undefined,
      parts: (saved.selectedParts as string[])?.length ? (saved.selectedParts as string[]) : undefined
    };
    const mode = String(saved.periodMode ?? 'all');
    const fm = String(saved.fromMonth ?? '');
    const tm = String(saved.toMonth ?? '');
    if (mode === 'after') globalFilters.startDate = monthStart(fm) || undefined;
    if (mode === 'before') globalFilters.endDate = monthEnd(tm) || undefined;
    if (mode === 'between') { globalFilters.startDate = monthStart(fm) || undefined; globalFilters.endDate = monthEnd(tm) || undefined; }

    getPartsPriorityRows(globalFilters, 2000).then((rows) => {
      if (!active) return;
      const allParts = (rows as Record<string, unknown>[]).map((r) => String(r.part_num ?? '')).filter(Boolean);
      setAvailableTopParts(Array.from(new Set(allParts)));
    }).catch(() => {
      if (!active) return;
      setAvailableTopParts([]);
    });

    return () => {
      active = false;
    };
  }, [saved.selectedCustomers, saved.selectedCountries, saved.selectedTerritories, saved.selectedProdGroups, saved.searchText, saved.selectedParts, saved.periodMode, saved.fromMonth, saved.toMonth]);

  useEffect(() => {
    const nextFrom = sectionFilter.fromMonth || String(saved.fromMonth ?? '');
    const nextTo = sectionFilter.toMonth || String(saved.toMonth ?? '');
    const initial = sectionFilter.parts.length ? sectionFilter.parts : limitedTop;
    const validParts = limitedTop.length ? initial.filter((p) => limitedTop.includes(p)) : initial;
    setFromMonth(nextFrom);
    setToMonth(nextTo);
    setParts(validParts.length ? validParts : limitedTop);
  }, [graphicKey, sectionFilter.fromMonth, sectionFilter.toMonth, sectionFilter.parts, limitedTop, saved.fromMonth, saved.toMonth]);

  useEffect(() => {
    const current = (useAppStore.getState().pageState.explorer as Record<string, unknown>) ?? {};
    const currentTopFilters = (current.topFilters as Record<TopKey, TopSectionFilter>) ?? defaultTopFilters();
    const nextTopFilters = { ...currentTopFilters, [graphicKey]: { fromMonth, toMonth, parts } };
    setPageState('explorer', { ...current, topFilters: nextTopFilters });
  }, [fromMonth, toMonth, parts, graphicKey, setPageState]);

  const selectedParts = parts.length ? parts : limitedTop;

  const baseFilters = useMemo<Filters>(() => {
    const f: Filters = {
      customers: (saved.selectedCustomers as string[])?.length ? (saved.selectedCustomers as string[]) : undefined,
      countries: (saved.selectedCountries as string[])?.length ? (saved.selectedCountries as string[]) : undefined,
      territories: (saved.selectedTerritories as string[])?.length ? (saved.selectedTerritories as string[]) : undefined,
      prodGroups: (saved.selectedProdGroups as string[])?.length ? (saved.selectedProdGroups as string[]) : undefined,
      searchLineDesc: String(saved.searchText ?? '') || undefined,
      parts: selectedParts.length ? selectedParts : undefined
    };
    const mode = String(saved.periodMode ?? 'all');
    const fm = String(saved.fromMonth ?? '');
    const tm = String(saved.toMonth ?? '');
    if (mode === 'after') f.startDate = monthStart(fm) || undefined;
    if (mode === 'before') f.endDate = monthEnd(tm) || undefined;
    if (mode === 'between') { f.startDate = monthStart(fm) || undefined; f.endDate = monthEnd(tm) || undefined; }
    if (fromMonth) f.startDate = monthStart(fromMonth) || f.startDate;
    if (toMonth) f.endDate = monthEnd(toMonth) || f.endDate;
    return f;
  }, [saved, selectedParts, fromMonth, toMonth]);

  const [tableRows, setTableRows] = useState<PartRow[]>([]);
  const [fyColumns, setFyColumns] = useState<number[]>([]);
  const [chartRows, setChartRows] = useState<Record<string, unknown>[]>([]);
  const [pieRows, setPieRows] = useState<{ part_num: string; revenue: number }[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoadError('');

    Promise.allSettled([
      getPartsPriorityRows(baseFilters, 3000), getPartsRevenueByFY(baseFilters), getPartsOrdersByFY(baseFilters),
      getRevenueTotalsForParts(baseFilters, selectedParts),
      graphicKey.includes('Revenue') ? (graphicKey.includes('multi') ? getRevenueByFYAndPartForParts(baseFilters, selectedParts) : getRevenueByFYForParts(baseFilters, selectedParts)) : (graphicKey.includes('multi') ? getOrdersByFYAndPartForParts(baseFilters, selectedParts) : getOrdersByFYForParts(baseFilters, selectedParts))
    ]).then((results) => {
      if (!active) return;
      const [baseRes, revFyRes, ordFyRes, pieRes, chartRes] = results;
      if (baseRes.status !== 'fulfilled') {
        setLoadError(baseRes.reason instanceof Error ? baseRes.reason.message : 'Failed to load expanded analytics');
        setTableRows([]); setFyColumns([]); setPieRows([]); setChartRows([]);
        return;
      }

      const base = (baseRes.value as Record<string, unknown>[]) ?? [];
      const revFy = revFyRes.status === 'fulfilled' ? ((revFyRes.value as Record<string, unknown>[]) ?? []) : [];
      const ordFy = ordFyRes.status === 'fulfilled' ? ((ordFyRes.value as Record<string, unknown>[]) ?? []) : [];
      const pie = pieRes.status === 'fulfilled' ? ((pieRes.value as Record<string, unknown>[]) ?? []) : [];
      const chart = chartRes.status === 'fulfilled' ? ((chartRes.value as Record<string, unknown>[]) ?? []) : [];

      const map = new Map<string, PartRow>();
      base.forEach((r) => {
        const part = String(r.part_num ?? '');
        if (!part || !selectedParts.includes(part)) return;
        map.set(part, { cust_id: String(r.cust_id ?? ''), cust_name: String(r.cust_name ?? ''), country: String(r.country ?? ''), part_num: part, line_desc_short: String(r.line_desc_short ?? ''), prod_group: String(r.prod_group ?? ''), orders: Number(r.orders ?? 0), revenue: Number(r.revenue ?? 0), profit: Number(r.profit ?? 0), profit_pct: Number(r.profit_pct ?? 0), active_fy_count: 0 });
      });
      const yearsSet = new Set<number>();
      revFy.forEach((r) => { const part = String(r.part_num ?? ''); const fy = Number(r.fy ?? 0); const row = map.get(part); if (!row || !fy) return; yearsSet.add(fy); row[`revenue_fy_${fy}`] = Number(r.revenue ?? 0); });
      ordFy.forEach((r) => { const part = String(r.part_num ?? ''); const fy = Number(r.fy ?? 0); const row = map.get(part); if (!row || !fy) return; yearsSet.add(fy); row[`orders_fy_${fy}`] = Number(r.orders ?? 0); });
      const years = [...yearsSet].sort((a, b) => a - b);
      map.forEach((row) => { row.active_fy_count = years.filter((fy) => Number(row[`revenue_fy_${fy}`] ?? 0) > 0).length; years.forEach((fy) => { if (row[`revenue_fy_${fy}`] == null) row[`revenue_fy_${fy}`] = 0; if (row[`orders_fy_${fy}`] == null) row[`orders_fy_${fy}`] = 0; }); });
      setFyColumns(years); setTableRows([...map.values()]); setPieRows(pie.map((p) => ({ part_num: String(p.part_num ?? ''), revenue: Number(p.revenue ?? 0) }))); setChartRows(chart);

      const firstError = [revFyRes, ordFyRes, pieRes, chartRes].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      setLoadError(firstError ? (firstError.reason instanceof Error ? firstError.reason.message : 'Failed to load some expanded analytics') : '');
    });

    return () => { active = false; };
  }, [baseFilters, selectedParts, graphicKey]);

  const togglePart = (p: string) => setParts((x) => x.includes(p) ? x.filter((v) => v !== p) : [...x, p]);
  const pivotByFy = (rows: Record<string, unknown>[], valueKey: 'revenue' | 'orders', series: string[]) => {
    const byFy = new Map<string, Record<string, number | string>>();
    rows.forEach((r) => { const fy = String(r.fy ?? ''); const part = String(r.part_num ?? ''); if (!fy || !part) return; if (!byFy.has(fy)) byFy.set(fy, { fy }); byFy.get(fy)![part] = Number(r[valueKey] ?? 0); });
    return [...byFy.values()].sort((a, b) => Number(a.fy) - Number(b.fy)).map((row) => { const filled: Record<string, number | string> = { ...row }; series.forEach((part) => { if (filled[part] == null) filled[part] = 0; }); return filled; });
  };

  const renderExpanded = () => {
    if (graphicKey === 'trendRevenue') return <LineChart data={chartRows.map((r) => ({ fy: Number(r.fy ?? 0), revenue: Number(r.revenue ?? 0) }))}><XAxis dataKey="fy" tickFormatter={fyLabel}/><YAxis/><Tooltip formatter={(v) => currency(Number(v))} labelFormatter={(v) => fyLabel(String(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Line type="monotone" dataKey="revenue" stroke="#0ea5e9" /></LineChart>;
    if (graphicKey === 'trendOrders') return <LineChart data={chartRows.map((r) => ({ fy: Number(r.fy ?? 0), orders: Number(r.orders ?? 0) }))}><XAxis dataKey="fy" tickFormatter={fyLabel}/><YAxis/><Tooltip labelFormatter={(v) => fyLabel(String(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /><Line type="monotone" dataKey="orders" stroke="#84cc16" /></LineChart>;
    if (graphicKey === 'totalRevenue') return <BarChart data={chartRows.map((r) => ({ part_num: String(r.part_num ?? ''), revenue: Number(r.revenue ?? 0) }))}><XAxis dataKey="part_num"/><YAxis/><Tooltip formatter={(v) => currency(Number(v))} /><Bar dataKey="revenue" fill="#0ea5e9"/></BarChart>;
    if (graphicKey === 'totalOrders') return <BarChart data={chartRows.map((r) => ({ part_num: String(r.part_num ?? ''), orders: Number(r.orders ?? 0) }))}><XAxis dataKey="part_num"/><YAxis/><Tooltip /><Bar dataKey="orders" fill="#65a30d"/></BarChart>;
    if (graphicKey === 'multiRevenue') {
      const series = selectedParts.slice(0, 8); const data = pivotByFy(chartRows, 'revenue', series);
      return <LineChart data={data}><XAxis dataKey="fy" tickFormatter={fyLabel}/><YAxis/><Tooltip shared formatter={(v) => currency(Number(v))} labelFormatter={(v) => fyLabel(String(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />{series.map((p, i) => <Line key={p} type="monotone" dataKey={p} stroke={COLORS[i % COLORS.length]} dot />)}</LineChart>;
    }
    const series = selectedParts.slice(0, 8); const data = pivotByFy(chartRows, 'orders', series);
    return <LineChart data={data}><XAxis dataKey="fy" tickFormatter={fyLabel}/><YAxis/><Tooltip shared labelFormatter={(v) => fyLabel(String(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />{series.map((p, i) => <Line key={p} type="monotone" dataKey={p} stroke={COLORS[i % COLORS.length]} dot />)}</LineChart>;
  };

  return <div>
    <PageHeader title={titleByKey[graphicKey]} subtitle="Expanded view with supporting details. Time-based charts use fiscal years (May–Apr)." actions={<Link to="/explorer" className="card px-3 py-2">Back to Discover</Link>} />

    {loadError && <section className="card p-3 mb-4 border-[var(--danger)]"><h3 className="font-semibold text-[var(--danger)]">Expanded analytics query failed</h3><p className="text-sm mt-1">{loadError}</p></section>}

    <section className="card p-3 mb-4">
      <h3 className="font-semibold mb-2">Graphic Filters</h3>
      <div className="grid md:grid-cols-4 gap-2">
        <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input className="card w-full px-2 py-1 mt-1" value={fromMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setFromMonth(n); }} /></label>
        <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input className="card w-full px-2 py-1 mt-1" value={toMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setToMonth(n); }} /></label>
        <div className="md:col-span-2 text-xs text-[var(--text-muted)]"><div className="mb-1">Top Items (from model)</div><div className="card h-24 overflow-auto p-2"><div className="grid grid-cols-2 gap-2">{limitedTop.map((p) => <label key={p} className="flex items-center gap-2"><input type="checkbox" checked={selectedParts.includes(p)} onChange={() => togglePart(p)} /><span className="truncate">{p}</span></label>)}</div></div></div>
      </div>
    </section>

    <section className="card p-3 h-[34rem] mb-4"><h3 className="font-semibold mb-2">Expanded Chart</h3><ResponsiveContainer>{renderExpanded()}</ResponsiveContainer></section>

    <section className="card p-3 mb-4">
      <h3 className="font-semibold mb-2">Revenue Mix (donut)</h3>
      <div className="h-[22rem]"><ResponsiveContainer><PieChart><Pie data={pieRows} dataKey="revenue" nameKey="part_num" innerRadius={85} outerRadius={135}>{pieRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v) => currency(Number(v))} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} /></PieChart></ResponsiveContainer></div>
    </section>

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]"><th className="px-3 py-2">Rank</th><th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (25)</th><th className="px-3 py-2">ProdGroup</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Profit %</th><th className="px-3 py-2">Active FY</th>{fyColumns.map((fy) => <th key={`r-${fy}`} className="px-3 py-2">Rev FY{fy}</th>)}{fyColumns.map((fy) => <th key={`o-${fy}`} className="px-3 py-2">Ord FY{fy}</th>)}</tr></thead>
        <tbody>{tableRows.map((row, i) => <tr key={`${row.part_num}-${i}`} className="border-b border-[var(--border)]"><td className="px-3 py-2 whitespace-nowrap">{i + 1}</td><td className="px-3 py-2 whitespace-nowrap">{row.cust_id}</td><td className="px-3 py-2">{row.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{row.country}</td><td className="px-3 py-2 whitespace-nowrap">{row.part_num}</td><td className="px-3 py-2">{row.line_desc_short}</td><td className="px-3 py-2 whitespace-nowrap">{row.prod_group}</td><td className="px-3 py-2 whitespace-nowrap">{Number(row.orders).toLocaleString()}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue))}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit))}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.profit_pct))}</td><td className="px-3 py-2 whitespace-nowrap">{row.active_fy_count}</td>{fyColumns.map((fy) => <td key={`rv-${i}-${fy}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`revenue_fy_${fy}`] ?? 0))}</td>)}{fyColumns.map((fy) => <td key={`ov-${i}-${fy}`} className="px-3 py-2 whitespace-nowrap">{Number(row[`orders_fy_${fy}`] ?? 0).toLocaleString()}</td>)}</tr>)}</tbody>
      </table>
    </section>
  </div>;
}
