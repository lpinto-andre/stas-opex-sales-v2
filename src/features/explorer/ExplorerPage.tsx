import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { KPIStatCard } from '@/components/ui/KPIStatCard';
import { FilterChipsBar } from '@/components/ui/FilterChipsBar';
import { DataTable } from '@/components/ui/DataTable';
import { FilterSidebar } from '@/components/ui/FilterSidebar';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { getDetailRows, getKPIs, getOrdersByFY, getRevenueByFY, getRevenueByMonth, getRevenueByProdGroup } from '@/data/queries';
import { useAppStore } from '@/state/store';

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
}

export function ExplorerPage() {
  const filters = useAppStore((s) => s.filters);
  const resetFilters = useAppStore((s) => s.resetFilters);

  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [revMonth, setRevMonth] = useState<Record<string, unknown>[]>([]);
  const [revFy, setRevFy] = useState<Record<string, unknown>[]>([]);
  const [ordersFy, setOrdersFy] = useState<Record<string, unknown>[]>([]);
  const [revGroup, setRevGroup] = useState<Record<string, unknown>[]>([]);
  const [detailRows, setDetailRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    getKPIs(filters).then((r) => setKpis(r as unknown as Record<string, number>));
    getRevenueByMonth(filters).then((r) => setRevMonth(r as unknown as Record<string, unknown>[]));
    getRevenueByFY(filters).then((r) => setRevFy(r as unknown as Record<string, unknown>[]));
    getOrdersByFY(filters).then((r) => setOrdersFy(r as unknown as Record<string, unknown>[]));
    getRevenueByProdGroup(filters).then((r) => setRevGroup(r as unknown as Record<string, unknown>[]));
    getDetailRows(filters, 600).then((r) => setDetailRows(r));
  }, [filters]);

  const marginPct = useMemo(() => {
    const revenue = Number(kpis.revenue ?? 0);
    const profit = Number(kpis.profit ?? 0);
    return revenue > 0 ? (profit / revenue) * 100 : 0;
  }, [kpis]);

  const chips = Object.entries(filters).flatMap(([k, v]) => Array.isArray(v) ? v.map((x) => `${k}:${x}`) : v ? [`${k}:${v}`] : []);

  const exportRows = () => {
    const csv = toCsv(detailRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'explorer_detail.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return <div>
    <PageHeader title="Data Explorer" subtitle="Real-time DuckDB analytics across imported dataset." actions={<div className="flex gap-2"><button className="card px-3 py-2" onClick={exportRows}>Export CSV</button><button className="card px-3 py-2" onClick={resetFilters}>Reset filters</button></div>} />
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      <FilterSidebar />
      <div>
        <FilterChipsBar chips={chips} onRemove={() => undefined} />
        <div className="grid md:grid-cols-4 gap-3 mb-4">
          <KPIStatCard label="Revenue" value={`CAD ${Number(kpis.revenue ?? 0).toLocaleString()}`} />
          <KPIStatCard label="Profit" value={`CAD ${Number(kpis.profit ?? 0).toLocaleString()}`} />
          <KPIStatCard label="Margin%" value={`${marginPct.toFixed(2)}%`} />
          <KPIStatCard label="Orders" value={String(kpis.orders ?? 0)} />
          <KPIStatCard label="Invoices" value={String(kpis.invoices ?? 0)} />
          <KPIStatCard label="Customers" value={String(kpis.customers ?? 0)} />
          <KPIStatCard label="Parts" value={String(kpis.parts ?? 0)} />
        </div>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="card p-3 h-64"><ResponsiveContainer><LineChart data={revMonth}><XAxis dataKey="month"/><YAxis/><Tooltip/><Line type="monotone" dataKey="revenue" stroke="#1bc7b3"/></LineChart></ResponsiveContainer></div>
          <div className="card p-3 h-64"><ResponsiveContainer><BarChart data={revFy}><XAxis dataKey="fy"/><YAxis/><Tooltip/><Bar dataKey="revenue" fill="#2889c2"/></BarChart></ResponsiveContainer></div>
          <div className="card p-3 h-64"><ResponsiveContainer><BarChart data={ordersFy}><XAxis dataKey="fy"/><YAxis/><Tooltip/><Bar dataKey="orders" fill="#21bd5b"/></BarChart></ResponsiveContainer></div>
          <div className="card p-3 h-64"><ResponsiveContainer><BarChart data={revGroup}><XAxis dataKey="prod_group"/><YAxis/><Tooltip/><Bar dataKey="revenue" fill="#f0b429"/></BarChart></ResponsiveContainer></div>
        </div>
        <DataTable rows={detailRows} />
      </div>
    </div>
  </div>;
}
