import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/ui/PageHeader';
import { getPartsOrdersByFY, getPartsPriorityRows, getPartsRevenueByFY, getRevenueTotalsForParts, type Filters } from '@/data/queries';
import { useAppStore } from '@/state/store';

type TopKey = 'trendRevenue' | 'trendOrders' | 'totalRevenue' | 'totalOrders' | 'multiRevenue' | 'multiOrders';

type PartRow = {
  cust_id: string; cust_name: string; country: string; part_num: string; line_desc_short: string; prod_group: string;
  orders: number; revenue: number; profit: number; profit_pct: number; active_fy_count: number; [key: string]: string | number;
};

const COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#f43f5e', '#eab308', '#10b981'];
const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const isValidMonth = (m: string) => /^\d{4}-\d{2}$/.test(m);
const monthStart = (m: string) => (isValidMonth(m) ? `${m}-01` : '');
const monthEnd = (m: string) => {
  if (!isValidMonth(m)) return '';
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 0);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const titleByKey: Record<TopKey, string> = {
  trendRevenue: 'Top Items: Revenue by Time', trendOrders: 'Top Items: Orders by Time', totalRevenue: 'Top Items: Total Revenue', totalOrders: 'Top Items: Total Orders', multiRevenue: 'Top Items: Revenue by Time (multiple curves)', multiOrders: 'Top Items: Orders by Time (multiple curves)'
};

export function ExplorerGraphicDetailPage() {
  const params = useParams<{ graphicKey: TopKey }>();
  const graphicKey = (params.graphicKey ?? 'trendRevenue') as TopKey;
  const saved = useAppStore((s) => (s.pageState.explorer as Record<string, unknown>) ?? {});
  const topItemsSelection = useAppStore((s) => s.topItemsSelection);

  const topFilters = (saved.topFilters as Record<TopKey, { fromMonth: string; toMonth: string; parts: string[] }>) ?? {
    trendRevenue: { fromMonth: '', toMonth: '', parts: [] }, trendOrders: { fromMonth: '', toMonth: '', parts: [] }, totalRevenue: { fromMonth: '', toMonth: '', parts: [] }, totalOrders: { fromMonth: '', toMonth: '', parts: [] }, multiRevenue: { fromMonth: '', toMonth: '', parts: [] }, multiOrders: { fromMonth: '', toMonth: '', parts: [] }
  };

  const defaultN = Math.max(1, Math.min(10, Number(saved.topItemsN ?? 5)));
  const limitedTop = topItemsSelection.partNums.slice(0, defaultN);
  const selectedParts = topFilters[graphicKey]?.parts?.length ? topFilters[graphicKey].parts : limitedTop;

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
    const sec = topFilters[graphicKey];
    if (sec?.fromMonth) f.startDate = monthStart(sec.fromMonth) || f.startDate;
    if (sec?.toMonth) f.endDate = monthEnd(sec.toMonth) || f.endDate;
    return f;
  }, [saved, topFilters, graphicKey, selectedParts]);

  const [tableRows, setTableRows] = useState<PartRow[]>([]);
  const [fyColumns, setFyColumns] = useState<number[]>([]);
  const [pieRows, setPieRows] = useState<{ part_num: string; revenue: number }[]>([]);

  useEffect(() => {
    Promise.all([getPartsPriorityRows(baseFilters, 3000), getPartsRevenueByFY(baseFilters), getPartsOrdersByFY(baseFilters), getRevenueTotalsForParts(baseFilters, selectedParts)]).then(([base, revFy, ordFy, pie]) => {
      const map = new Map<string, PartRow>();
      (base as Record<string, unknown>[]).forEach((r) => {
        if (!selectedParts.includes(String(r.part_num ?? ''))) return;
        map.set(String(r.part_num ?? ''), {
          cust_id: String(r.cust_id ?? ''), cust_name: String(r.cust_name ?? ''), country: String(r.country ?? ''), part_num: String(r.part_num ?? ''), line_desc_short: String(r.line_desc_short ?? ''), prod_group: String(r.prod_group ?? ''),
          orders: Number(r.orders ?? 0), revenue: Number(r.revenue ?? 0), profit: Number(r.profit ?? 0), profit_pct: Number(r.profit_pct ?? 0), active_fy_count: 0
        });
      });
      const yearsSet = new Set<number>();
      (revFy as Record<string, unknown>[]).forEach((r) => {
        const part = String(r.part_num ?? '');
        const fy = Number(r.fy ?? 0);
        const row = map.get(part);
        if (!row || !fy) return;
        yearsSet.add(fy);
        row[`revenue_fy_${fy}`] = Number(r.revenue ?? 0);
      });
      (ordFy as Record<string, unknown>[]).forEach((r) => {
        const part = String(r.part_num ?? '');
        const fy = Number(r.fy ?? 0);
        const row = map.get(part);
        if (!row || !fy) return;
        yearsSet.add(fy);
        row[`orders_fy_${fy}`] = Number(r.orders ?? 0);
      });
      const years = [...yearsSet].sort((a, b) => a - b);
      map.forEach((row) => {
        row.active_fy_count = years.filter((fy) => Number(row[`revenue_fy_${fy}`] ?? 0) > 0).length;
        years.forEach((fy) => { if (row[`revenue_fy_${fy}`] == null) row[`revenue_fy_${fy}`] = 0; if (row[`orders_fy_${fy}`] == null) row[`orders_fy_${fy}`] = 0; });
      });
      setFyColumns(years);
      setTableRows([...map.values()]);
      setPieRows((pie as Record<string, unknown>[]).map((p) => ({ part_num: String(p.part_num ?? ''), revenue: Number(p.revenue ?? 0) })));
    });
  }, [baseFilters, selectedParts]);

  return <div>
    <PageHeader title={titleByKey[graphicKey]} subtitle="Expanded view with supporting details." actions={<Link to="/explorer" className="card px-3 py-2">Back to Discover</Link>} />

    <section className="card p-3 h-[32rem] mb-4">
      <h3 className="font-semibold mb-2">Expanded Chart</h3>
      <ResponsiveContainer>
        <BarChart data={pieRows}><XAxis dataKey="part_num"/><YAxis/><Tooltip formatter={(v) => currency(Number(v))} /><Bar dataKey="revenue" fill="#0ea5e9"/></BarChart>
      </ResponsiveContainer>
    </section>

    <section className="card p-3 h-[22rem] mb-4">
      <h3 className="font-semibold mb-2">Revenue Mix (donut)</h3>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={pieRows} dataKey="revenue" nameKey="part_num" innerRadius={70} outerRadius={110}>
            {pieRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => currency(Number(v))} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </section>

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]"><th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (25)</th><th className="px-3 py-2">ProdGroup</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Profit %</th><th className="px-3 py-2">Active FY</th>{fyColumns.map((fy) => <th key={`r-${fy}`} className="px-3 py-2">Rev FY{fy}</th>)}{fyColumns.map((fy) => <th key={`o-${fy}`} className="px-3 py-2">Ord FY{fy}</th>)}</tr></thead>
        <tbody>{tableRows.map((row, i) => <tr key={`${row.part_num}-${i}`} className="border-b border-[var(--border)]"><td className="px-3 py-2 whitespace-nowrap">{row.cust_id}</td><td className="px-3 py-2">{row.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{row.country}</td><td className="px-3 py-2 whitespace-nowrap">{row.part_num}</td><td className="px-3 py-2">{row.line_desc_short}</td><td className="px-3 py-2 whitespace-nowrap">{row.prod_group}</td><td className="px-3 py-2 whitespace-nowrap">{Number(row.orders).toLocaleString()}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue))}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit))}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.profit_pct))}</td><td className="px-3 py-2 whitespace-nowrap">{row.active_fy_count}</td>{fyColumns.map((fy) => <td key={`rv-${i}-${fy}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`revenue_fy_${fy}`] ?? 0))}</td>)}{fyColumns.map((fy) => <td key={`ov-${i}-${fy}`} className="px-3 py-2 whitespace-nowrap">{Number(row[`orders_fy_${fy}`] ?? 0).toLocaleString()}</td>)}</tr>)}</tbody>
      </table>
    </section>
  </div>;
}
