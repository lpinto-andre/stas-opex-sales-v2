import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { KPIStatCard } from '@/components/ui/KPIStatCard';
import { DataTable } from '@/components/ui/DataTable';
import { getAnomaliesTable, getPricingKPIs, getTopEntitiesByMetric, type Filters } from '@/data/queries';
import { useAppStore } from '@/state/store';

const currency = (v: number) => `$${Math.round(v).toLocaleString()}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function PricingPage() {
  const datasetMeta = useAppStore((s) => s.datasetMeta);
  const saved = useAppStore((s) => (s.pageState.pricing as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

  const [costOnly, setCostOnly] = useState(Boolean(saved.costOnly ?? true));
  const [viewEntity, setViewEntity] = useState<'parts'|'customers'>((saved.viewEntity as 'parts'|'customers') ?? 'parts');
  const [topMetric, setTopMetric] = useState<'revenue'|'profit'|'margin_pct'|'avg_price'>((saved.topMetric as 'revenue'|'profit'|'margin_pct'|'avg_price') ?? 'revenue');
  const [minRevenue, setMinRevenue] = useState(Number(saved.minRevenue ?? 0));
  const [minOrders, setMinOrders] = useState(Number(saved.minOrders ?? 0));
  const [marginThreshold, setMarginThreshold] = useState(Number(saved.marginThreshold ?? 0.2));
  const [dispersionThreshold, setDispersionThreshold] = useState(Number(saved.dispersionThreshold ?? 0.25));
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));

  const filters = useMemo<Filters>(() => {
    const f: Filters = {};
    if (/^\d{4}-\d{2}$/.test(fromMonth)) f.startDate = `${fromMonth}-01`;
    if (/^\d{4}-\d{2}$/.test(toMonth)) {
      const [y, m] = toMonth.split('-').map(Number);
      const d = new Date(y, m, 0).getDate();
      f.endDate = `${toMonth}-${String(d).padStart(2, '0')}`;
    }
    return f;
  }, [fromMonth, toMonth]);

  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [leaders, setLeaders] = useState<Record<string, unknown>[]>([]);
  const [anomalies, setAnomalies] = useState<Record<string, unknown>[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoadError('');

    Promise.allSettled([
      getPricingKPIs(filters, costOnly),
      getTopEntitiesByMetric(filters, costOnly, viewEntity, topMetric, 25),
      getAnomaliesTable(filters, costOnly, { minRevenue, minOrders, marginThreshold, dispersionThreshold })
    ]).then((results) => {
      if (!active) return;
      const [kpiResult, leadersResult, anomaliesResult] = results;
      setKpis(kpiResult.status === 'fulfilled' ? ((kpiResult.value as Record<string, number>) ?? {}) : {});
      setLeaders(leadersResult.status === 'fulfilled' ? ((leadersResult.value as Record<string, unknown>[]) ?? []) : []);
      setAnomalies(anomaliesResult.status === 'fulfilled' ? ((anomaliesResult.value as Record<string, unknown>[]) ?? []) : []);
      const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      setLoadError(firstError ? (firstError.reason instanceof Error ? firstError.reason.message : 'Failed to load pricing analytics') : '');
    });

    return () => {
      active = false;
    };
  }, [filters, costOnly, viewEntity, topMetric, minRevenue, minOrders, marginThreshold, dispersionThreshold]);

  useEffect(() => {
    setPageState('pricing', { costOnly, viewEntity, topMetric, minRevenue, minOrders, marginThreshold, dispersionThreshold, fromMonth, toMonth });
  }, [costOnly, viewEntity, topMetric, minRevenue, minOrders, marginThreshold, dispersionThreshold, fromMonth, toMonth, setPageState]);

  return <div>
    <PageHeader title="Pricing & Profitability" subtitle={`Cost Included: ${costOnly ? 'Yes' : 'No'} • ${datasetMeta?.dateRange ?? ''}`} actions={<div className="grid grid-cols-3 gap-2 items-end">
      <label className="text-xs text-[var(--text-muted)]">Cost Included<select value={String(costOnly)} onChange={(e) => setCostOnly(e.target.value === 'true')} className="card w-full px-2 py-1 mt-1"><option value="true">Yes</option><option value="false">No</option></select></label>
      <label className="text-xs text-[var(--text-muted)]">View By<select value={viewEntity} onChange={(e) => setViewEntity(e.target.value as 'parts'|'customers')} className="card w-full px-2 py-1 mt-1"><option value="parts">Parts</option><option value="customers">Customers</option></select></label>
      <label className="text-xs text-[var(--text-muted)]">Top Metric<select value={topMetric} onChange={(e) => setTopMetric(e.target.value as 'revenue'|'profit'|'margin_pct'|'avg_price')} className="card w-full px-2 py-1 mt-1"><option value="revenue">Revenue</option><option value="profit">Profit</option><option value="margin_pct">Margin %</option><option value="avg_price">Avg Price</option></select></label>
    </div>} />

    {loadError && <section className="card p-3 mb-3 border-[var(--danger)]"><h3 className="font-semibold text-[var(--danger)]">Pricing analytics query failed</h3><p className="text-sm mt-1">{loadError}</p></section>}

    <section className="card p-3 mb-3"><div className="grid md:grid-cols-6 gap-2">
      <label className="text-xs text-[var(--text-muted)]">From (YYYY-MM)<input value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">To (YYYY-MM)<input value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Min Revenue<input type="number" value={minRevenue} onChange={(e) => setMinRevenue(Number(e.target.value || 0))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Min Orders<input type="number" value={minOrders} onChange={(e) => setMinOrders(Number(e.target.value || 0))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Low Margin Limit<input type="number" step="0.01" value={marginThreshold} onChange={(e) => setMarginThreshold(Number(e.target.value || 0.2))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Dispersion Limit<input type="number" step="0.01" value={dispersionThreshold} onChange={(e) => setDispersionThreshold(Number(e.target.value || 0.25))} className="card w-full px-2 py-1 mt-1" /></label>
    </div></section>

    <div className="grid md:grid-cols-4 gap-3 mb-4">
      <KPIStatCard label="Revenue" value={currency(Number(kpis.revenue ?? 0))} />
      <KPIStatCard label="Cost" value={currency(Number(kpis.cost ?? 0))} />
      <KPIStatCard label="Profit" value={currency(Number(kpis.profit ?? 0))} />
      <KPIStatCard label="Margin %" value={pct(Number(kpis.margin_pct ?? 0))} />
    </div>

    <section className="mb-3"><h3 className="font-semibold mb-2">Top {viewEntity === 'parts' ? 'Parts' : 'Customers'} by {topMetric}</h3><DataTable rows={leaders} /></section>
    <section className="mb-3"><h3 className="font-semibold mb-2">Anomalies</h3><DataTable rows={anomalies} /></section>
  </div>;
}
