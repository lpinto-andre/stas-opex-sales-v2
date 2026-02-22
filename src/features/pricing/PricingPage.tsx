import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { PageHeader } from '@/components/ui/PageHeader';
import { KPIStatCard } from '@/components/ui/KPIStatCard';
import { DataTable } from '@/components/ui/DataTable';
import { getAnomaliesTable, getMarginDistribution, getMarginLeakScatter, getPriceDispersionStats, getPricingKPIs, getRevenueCostProfitOverTime, getTopEntitiesByMetric, type Filters } from '@/data/queries';
import { useAppStore } from '@/state/store';

const currency = (v: number) => `$${Math.round(v).toLocaleString()}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function PricingPage() {
  const datasetMeta = useAppStore((s) => s.datasetMeta);
  const saved = useAppStore((s) => (s.pageState.pricing as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

  const [costOnly, setCostOnly] = useState(Boolean(saved.costOnly ?? true));
  const [viewEntity, setViewEntity] = useState<'parts'|'customers'>((saved.viewEntity as 'parts'|'customers') ?? 'parts');
  const [aggGranularity, setAggGranularity] = useState<'monthly'|'fy'>((saved.aggGranularity as 'monthly'|'fy') ?? 'monthly');
  const [distributionMode, setDistributionMode] = useState<'count'|'revenue'>((saved.distributionMode as 'count'|'revenue') ?? 'count');
  const [topMetric, setTopMetric] = useState<'revenue'|'profit'|'margin_pct'|'avg_price'>((saved.topMetric as 'revenue'|'profit'|'margin_pct'|'avg_price') ?? 'revenue');
  const [minRevenue, setMinRevenue] = useState(Number(saved.minRevenue ?? 0));
  const [minOrders, setMinOrders] = useState(Number(saved.minOrders ?? 0));
  const [marginThreshold, setMarginThreshold] = useState(Number(saved.marginThreshold ?? 0.2));
  const [dispersionThreshold, setDispersionThreshold] = useState(Number(saved.dispersionThreshold ?? 0.25));

  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));

  const filters = useMemo<Filters>(() => {
    const f: Filters = {
      parts: selectedParts.length ? selectedParts : undefined,
      customers: selectedCustomers.length ? selectedCustomers : undefined
    };
    if (/^\d{4}-\d{2}$/.test(fromMonth)) f.startDate = `${fromMonth}-01`;
    if (/^\d{4}-\d{2}$/.test(toMonth)) {
      const [y, m] = toMonth.split('-').map(Number);
      const d = new Date(y, m, 0).getDate();
      f.endDate = `${toMonth}-${String(d).padStart(2, '0')}`;
    }
    return f;
  }, [selectedParts, selectedCustomers, fromMonth, toMonth]);

  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [trend, setTrend] = useState<Record<string, unknown>[]>([]);
  const [dist, setDist] = useState<Record<string, unknown>[]>([]);
  const [leadersRev, setLeadersRev] = useState<Record<string, unknown>[]>([]);
  const [leadersMetric, setLeadersMetric] = useState<Record<string, unknown>[]>([]);
  const [scatter, setScatter] = useState<Record<string, unknown>[]>([]);
  const [dispersion, setDispersion] = useState<Record<string, unknown>[]>([]);
  const [anomalies, setAnomalies] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    Promise.all([
      getPricingKPIs(filters, costOnly),
      getRevenueCostProfitOverTime(filters, costOnly, aggGranularity),
      getMarginDistribution(filters, costOnly),
      getTopEntitiesByMetric(filters, costOnly, viewEntity, 'revenue', 12),
      getTopEntitiesByMetric(filters, costOnly, viewEntity, topMetric, 12),
      getMarginLeakScatter(filters, costOnly, viewEntity, 2000),
      getPriceDispersionStats(filters, costOnly, viewEntity === 'parts' ? 'part' : 'customer', 40),
      getAnomaliesTable(filters, costOnly, { minRevenue, minOrders, marginThreshold, dispersionThreshold })
    ]).then(([k, tr, d, lr, lm, sc, di, an]) => {
      setKpis(k as Record<string, number>); setTrend(tr as Record<string, unknown>[]); setDist(d as Record<string, unknown>[]);
      setLeadersRev(lr as Record<string, unknown>[]); setLeadersMetric(lm as Record<string, unknown>[]); setScatter(sc as Record<string, unknown>[]);
      setDispersion(di as Record<string, unknown>[]); setAnomalies(an as Record<string, unknown>[]);
    });
  }, [filters, costOnly, aggGranularity, viewEntity, topMetric, minRevenue, minOrders, marginThreshold, dispersionThreshold]);

  useEffect(() => {
    setPageState('pricing', { costOnly, viewEntity, aggGranularity, distributionMode, topMetric, minRevenue, minOrders, marginThreshold, dispersionThreshold, selectedParts, selectedCustomers, fromMonth, toMonth });
  }, [costOnly, viewEntity, aggGranularity, distributionMode, topMetric, minRevenue, minOrders, marginThreshold, dispersionThreshold, selectedParts, selectedCustomers, fromMonth, toMonth, setPageState]);

  const onBarClick = (d: Record<string, unknown>) => {
    const id = String(d.id ?? '');
    if (!id) return;
    if (viewEntity === 'parts') setSelectedParts((x) => x.includes(id) ? x : [...x, id]);
    else setSelectedCustomers((x) => x.includes(id) ? x : [...x, id]);
  };
  const onScatterClick = (d: Record<string, unknown>) => onBarClick(d);

  return <div>
    <PageHeader title="Pricing & Profitability" subtitle={`Cost Included: ${costOnly ? 'Yes' : 'No'} • ${datasetMeta?.dateRange ?? ''}`} actions={<div className="grid grid-cols-4 gap-2 items-end">
      <label className="text-xs text-[var(--text-muted)]">Cost Included<select value={String(costOnly)} onChange={(e) => setCostOnly(e.target.value === 'true')} className="card w-full px-2 py-1 mt-1"><option value="true">Yes</option><option value="false">No</option></select></label>
      <label className="text-xs text-[var(--text-muted)]">View By<select value={viewEntity} onChange={(e) => setViewEntity(e.target.value as 'parts'|'customers')} className="card w-full px-2 py-1 mt-1"><option value="parts">Parts</option><option value="customers">Customers</option></select></label>
      <label className="text-xs text-[var(--text-muted)]">Time Grain<select value={aggGranularity} onChange={(e) => setAggGranularity(e.target.value as 'monthly'|'fy')} className="card w-full px-2 py-1 mt-1"><option value="monthly">Monthly</option><option value="fy">Fiscal Year</option></select></label>
      <label className="text-xs text-[var(--text-muted)]">Top Metric<select value={topMetric} onChange={(e) => setTopMetric(e.target.value as 'revenue'|'profit'|'margin_pct'|'avg_price')} className="card w-full px-2 py-1 mt-1"><option value="revenue">Revenue</option><option value="profit">Profit</option><option value="margin_pct">Margin %</option><option value="avg_price">Avg Price</option></select></label>
    </div>} />

    <section className="card p-3 mb-3"><div className="grid md:grid-cols-8 gap-2">
      <label className="text-xs text-[var(--text-muted)]">From (YYYY-MM)<input value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">To (YYYY-MM)<input value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Min Revenue<input type="number" value={minRevenue} onChange={(e) => setMinRevenue(Number(e.target.value || 0))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Min Orders<input type="number" value={minOrders} onChange={(e) => setMinOrders(Number(e.target.value || 0))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Low Margin Limit<input type="number" step="0.01" value={marginThreshold} onChange={(e) => setMarginThreshold(Number(e.target.value || 0.2))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Dispersion Limit<input type="number" step="0.01" value={dispersionThreshold} onChange={(e) => setDispersionThreshold(Number(e.target.value || 0.25))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Distribution by<select value={distributionMode} onChange={(e) => setDistributionMode(e.target.value as 'count'|'revenue')} className="card w-full px-2 py-1 mt-1"><option value="count">Count</option><option value="revenue">Revenue</option></select></label>
    </div></section>

    <div className="grid md:grid-cols-4 gap-3 mb-4">
      <KPIStatCard label="Revenue" value={currency(Number(kpis.revenue ?? 0))} />
      <KPIStatCard label="Cost" value={currency(Number(kpis.cost ?? 0))} />
      <KPIStatCard label="Profit" value={currency(Number(kpis.profit ?? 0))} />
      <KPIStatCard label="Margin %" value={pct(Number(kpis.margin_pct ?? 0))} />
    </div>

    <section className="card p-3 mb-3 h-[22rem]"><h3 className="font-semibold mb-2">Trend</h3><ResponsiveContainer><ComposedChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period"/><YAxis yAxisId="a"/><YAxis yAxisId="b" orientation="right"/><Tooltip/><Legend/><Line yAxisId="a" dataKey="revenue" stroke="#0ea5e9" /><Line yAxisId="a" dataKey="cost" stroke="#f97316" /><Line yAxisId="a" dataKey="profit" stroke="#22c55e" /><Line yAxisId="b" dataKey="margin_pct" stroke="#a855f7" /></ComposedChart></ResponsiveContainer></section>

    <div className="grid md:grid-cols-2 gap-3 mb-3">
      <section className="card p-3 h-[22rem]"><h3 className="font-semibold mb-2">Distribution</h3><ResponsiveContainer><BarChart data={dist}><XAxis dataKey="bucketLabel"/><YAxis/><Tooltip/><Bar dataKey={distributionMode === 'count' ? 'count_lines' : 'revenue_in_bucket'} fill="#06b6d4"/></BarChart></ResponsiveContainer></section>
      <section className="card p-3 h-[22rem]"><h3 className="font-semibold mb-2">Leaders by Revenue</h3><ResponsiveContainer><BarChart data={leadersRev} onClick={(s) => onBarClick(s.activePayload?.[0]?.payload ?? {})}><XAxis dataKey="id"/><YAxis/><Tooltip/><Bar dataKey="value" fill="#22c55e"/></BarChart></ResponsiveContainer></section>
      <section className="card p-3 h-[22rem]"><h3 className="font-semibold mb-2">Leaders by Selected Metric</h3><ResponsiveContainer><BarChart data={leadersMetric} onClick={(s) => onBarClick(s.activePayload?.[0]?.payload ?? {})}><XAxis dataKey="id"/><YAxis/><Tooltip/><Bar dataKey="value" fill="#f59e0b"/></BarChart></ResponsiveContainer></section>
      <section className="card p-3 h-[22rem]"><h3 className="font-semibold mb-2">Segmentation</h3><ResponsiveContainer><ScatterChart onClick={(s) => onScatterClick(s.activePayload?.[0]?.payload ?? {})}><XAxis dataKey="revenue" name="Revenue"/><YAxis dataKey="margin_pct" name="Margin"/><ZAxis dataKey="profit" range={[60, 300]} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter data={scatter} fill="#a855f7" /></ScatterChart></ResponsiveContainer></section>
    </div>

    <section className="card p-3 mb-3 h-[20rem]"><h3 className="font-semibold mb-2">Price Dispersion</h3><ResponsiveContainer><BarChart data={dispersion}><XAxis dataKey="id"/><YAxis/><Tooltip/><Bar dataKey="dispersion_index" fill="#ef4444"/></BarChart></ResponsiveContainer></section>

    <section className="mb-3"><h3 className="font-semibold mb-2">Anomalies</h3><DataTable rows={anomalies} /></section>
  </div>;
}
