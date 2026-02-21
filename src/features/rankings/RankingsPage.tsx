import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { getRanking } from '@/data/queries';
import { useAppStore } from '@/state/store';
import { useNavigate } from 'react-router-dom';

export function RankingsPage() {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const [entity, setEntity] = useState<'parts' | 'customers' | 'prodgroup' | 'class' | 'country' | 'territory'>('parts');
  const [metric, setMetric] = useState<'revenue' | 'orders' | 'profit' | 'margin'>('revenue');
  const [topN, setTopN] = useState(50);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    getRanking(filters, entity, metric, topN).then((r) => setRows(r));
  }, [filters, entity, metric, topN]);

  return <div>
    <PageHeader title="Rankings" subtitle="Real leaderboard by selected entity + metric." actions={<div className="flex gap-2">
      <select value={entity} onChange={(e) => setEntity(e.target.value as typeof entity)} className="card px-2 py-1"><option value="parts">Parts</option><option value="customers">Customers</option><option value="prodgroup">ProdGrup</option><option value="class">Class</option><option value="country">Country</option><option value="territory">Territory</option></select>
      <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} className="card px-2 py-1"><option value="revenue">Revenue</option><option value="orders">Orders</option><option value="profit">Profit</option><option value="margin">Margin%</option></select>
      <input type="number" value={topN} onChange={(e) => setTopN(Number(e.target.value || 50))} className="card w-20 px-2 py-1" />
    </div>} />
    <p className="text-xs text-[var(--text-muted)] mb-2">Tip: click a row entity in table data and apply to explorer filter manually for drilldown.</p>
    <DataTable rows={rows} />
    <button className="card px-3 py-2 mt-3" onClick={() => { if (!rows[0]?.entity) return; setFilters({ searchLineDesc: String(rows[0].entity) }); navigate('/explorer'); }}>Drill first row to Explorer</button>
  </div>;
}
