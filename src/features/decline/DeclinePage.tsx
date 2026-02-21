import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { useAppStore } from '@/state/store';
import { getPartYearMetrics } from '@/data/queries';

export function DeclinePage() {
  const filters = useAppStore((s) => s.filters);
  const [k, setK] = useState(2);
  const [m, setM] = useState(3);
  const [minPastRevenue, setMinPastRevenue] = useState(10000);
  const [minPastOrders, setMinPastOrders] = useState(5);
  const [maxRevRatio, setMaxRevRatio] = useState(0.5);
  const [maxOrdRatio, setMaxOrdRatio] = useState(0.5);
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    getPartYearMetrics(filters).then((data) => {
      const byPart = new Map<string, { fy: number; revenue: number; orders: number }[]>();
      data.forEach((r) => byPart.set(r.part_num, [...(byPart.get(r.part_num) ?? []), { fy: Number(r.invoice_fy), revenue: Number(r.revenue), orders: Number(r.orders) }]));
      const currentFY = Math.max(...data.map((d) => Number(d.invoice_fy || 0)), 0);
      const res = [...byPart.entries()].map(([part, years]) => {
        const avgWindow = (start: number, len: number, key: 'revenue' | 'orders') => {
          let sum = 0;
          for (let i = 0; i < len; i += 1) sum += years.find((y) => y.fy === start - i)?.[key] ?? 0;
          return sum / Math.max(len, 1);
        };
        const recentRev = avgWindow(currentFY, k, 'revenue');
        const pastRev = avgWindow(currentFY - k, m, 'revenue');
        const recentOrd = avgWindow(currentFY, k, 'orders');
        const pastOrd = avgWindow(currentFY - k, m, 'orders');
        const revRatio = pastRev === 0 ? (recentRev > 0 ? Number.POSITIVE_INFINITY : 0) : recentRev / pastRev;
        const ordRatio = pastOrd === 0 ? (recentOrd > 0 ? Number.POSITIVE_INFINITY : 0) : recentOrd / pastOrd;
        let label = 'Stable';
        if ((pastRev === 0 && recentRev > 0) || (pastOrd === 0 && recentOrd > 0)) label = 'New';
        else if ((recentRev === 0 && pastRev > 0) || (recentOrd === 0 && pastOrd > 0)) label = 'Inactive';
        else {
          const declineHit = logic === 'AND' ? (revRatio <= maxRevRatio && ordRatio <= maxOrdRatio) : (revRatio <= maxRevRatio || ordRatio <= maxOrdRatio);
          if (pastRev >= minPastRevenue && pastOrd >= minPastOrders && declineHit) label = 'Declining';
          else if (revRatio > 1 || ordRatio > 1) label = 'Growing';
        }
        return { part_num: part, label, past_avg_rev: pastRev, recent_avg_rev: recentRev, past_avg_orders: pastOrd, recent_avg_orders: recentOrd, revenue_ratio: Number.isFinite(revRatio) ? revRatio : 99, orders_ratio: Number.isFinite(ordRatio) ? ordRatio : 99 };
      });
      setRows(res as unknown as Record<string, unknown>[]);
    });
  }, [filters, k, m, minPastRevenue, minPastOrders, maxRevRatio, maxOrdRatio, logic]);

  return <div>
    <PageHeader title="Declining Items Model" subtitle="Classify parts as Declining/Stable/Growing/New/Inactive." actions={<div className="flex gap-2">
      <input type="number" value={k} onChange={(e) => setK(Number(e.target.value || 2))} className="card w-16 px-2 py-1" />
      <input type="number" value={m} onChange={(e) => setM(Number(e.target.value || 3))} className="card w-16 px-2 py-1" />
      <input type="number" value={minPastRevenue} onChange={(e) => setMinPastRevenue(Number(e.target.value || 10000))} className="card w-24 px-2 py-1" />
      <input type="number" value={minPastOrders} onChange={(e) => setMinPastOrders(Number(e.target.value || 5))} className="card w-20 px-2 py-1" />
      <select value={logic} onChange={(e) => setLogic(e.target.value as 'AND' | 'OR')} className="card px-2 py-1"><option>AND</option><option>OR</option></select>
    </div>} />
    <DataTable rows={rows} />
  </div>;
}
