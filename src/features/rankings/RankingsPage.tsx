import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { getRanking, type Filters } from '@/data/queries';
import { useAppStore } from '@/state/store';

type Entity = 'parts' | 'customers' | 'prodgroup' | 'class' | 'country' | 'territory';
type Metric = 'revenue' | 'orders' | 'profit' | 'margin';
type PeriodMode = 'all' | 'after' | 'before' | 'between';

type RankingRow = {
  entity: string;
  revenue: number;
  orders: number;
  profit: number;
  margin: number;
  active_fy_count: number;
};

const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;

function toRankingFilters(base: Filters, mode: PeriodMode, fromDate: string, toDate: string): Filters {
  if (mode === 'all') return base;
  if (mode === 'after') return { ...base, startDate: fromDate || undefined, endDate: undefined };
  if (mode === 'before') return { ...base, startDate: undefined, endDate: toDate || undefined };
  return { ...base, startDate: fromDate || undefined, endDate: toDate || undefined };
}

export function RankingsPage() {
  const globalFilters = useAppStore((s) => s.filters);
  const [entity, setEntity] = useState<Entity>('parts');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [topN, setTopN] = useState(50);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState<RankingRow[]>([]);

  const rankingFilters = useMemo(() => toRankingFilters(globalFilters, periodMode, fromDate, toDate), [globalFilters, periodMode, fromDate, toDate]);

  useEffect(() => {
    getRanking(rankingFilters, entity, metric, topN).then((r) => setRows(r as RankingRow[]));
  }, [rankingFilters, entity, metric, topN]);

  return <div>
    <PageHeader title="Rankings" subtitle="Leaderboards with period and metric controls." actions={<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 items-end">
      <label className="text-xs text-[var(--text-muted)]">Group by
        <select value={entity} onChange={(e) => setEntity(e.target.value as Entity)} className="card px-2 py-1 block w-full mt-1"><option value="parts">Parts</option><option value="customers">Customers</option><option value="prodgroup">ProdGrup</option><option value="class">Class</option><option value="country">Country</option><option value="territory">Territory</option></select>
      </label>
      <label className="text-xs text-[var(--text-muted)]">Rank by
        <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="card px-2 py-1 block w-full mt-1"><option value="revenue">Revenue</option><option value="orders">Orders</option><option value="profit">Profit</option><option value="margin">Margin%</option></select>
      </label>
      <label className="text-xs text-[var(--text-muted)]">Items to show
        <input type="number" value={topN} min={1} onChange={(e) => setTopN(Number(e.target.value || 50))} className="card w-full px-2 py-1 mt-1" />
      </label>
      <label className="text-xs text-[var(--text-muted)]">Period
        <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card px-2 py-1 block w-full mt-1"><option value="all">All time</option><option value="after">After date</option><option value="before">Before date</option><option value="between">Between dates</option></select>
      </label>
      {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="card w-full px-2 py-1 mt-1" />
      </label>}
      {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="card w-full px-2 py-1 mt-1" />
      </label>}
    </div>} />

    <div className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <colgroup>
          <col style={{ width: '56px' }} />
          <col />
          <col style={{ width: '140px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '140px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '120px' }} />
        </colgroup>
        <thead className="bg-[var(--surface)] sticky top-0">
          <tr className="text-left border-b border-[var(--border)]">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Entity</th>
            <th className="px-3 py-2">Revenue</th>
            <th className="px-3 py-2">Orders</th>
            <th className="px-3 py-2">Profit</th>
            <th className="px-3 py-2">Margin</th>
            <th className="px-3 py-2">Active FY</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => <tr key={`${row.entity}-${idx}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
            <td className="px-3 py-2 whitespace-nowrap">{idx + 1}</td>
            <td className="px-3 py-2 whitespace-normal break-words leading-5">{row.entity}</td>
            <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue ?? 0))}</td>
            <td className="px-3 py-2 whitespace-nowrap">{Number(row.orders ?? 0).toLocaleString()}</td>
            <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit ?? 0))}</td>
            <td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.margin ?? 0))}</td>
            <td className="px-3 py-2 whitespace-nowrap">{Number(row.active_fy_count ?? 0)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
