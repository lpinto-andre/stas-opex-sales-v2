import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { useAppStore } from '@/state/store';
import { getPartYearMetrics } from '@/data/queries';

type Weights = { revenue: number; orders: number; profit: number; margin: number; trend: number; active: number };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function TopItemsPage() {
  const filters = useAppStore((s) => s.filters);
  const [topN, setTopN] = useState(50);
  const [k, setK] = useState(2);
  const [m, setM] = useState(3);
  const [weights, setWeights] = useState<Weights>({ revenue: 1, orders: 1, profit: 1, margin: 1, trend: 1, active: 1 });
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    getPartYearMetrics(filters).then((data) => {
      const byPart = new Map<string, { fy: number; revenue: number; orders: number; profit: number; margin: number }[]>();
      data.forEach((r) => {
        const arr = byPart.get(r.part_num) ?? [];
        arr.push({ fy: Number(r.invoice_fy), revenue: Number(r.revenue), orders: Number(r.orders), profit: Number(r.profit), margin: Number(r.margin) });
        byPart.set(r.part_num, arr);
      });
      const currentFY = Math.max(...data.map((d) => Number(d.invoice_fy || 0)), 0);
      const scored = [...byPart.entries()].map(([part, years]) => {
        const getWindow = (start: number, len: number) => Array.from({ length: len }, (_, i) => start - i);
        const recentFys = getWindow(currentFY, k);
        const pastFys = getWindow(currentFY - k, m);
        const sumAt = (fys: number[], key: 'revenue' | 'orders') => fys.reduce((acc, fy) => acc + (years.find((y) => y.fy === fy)?.[key] ?? 0), 0);
        const recentRev = sumAt(recentFys, 'revenue') / Math.max(k, 1);
        const pastRev = sumAt(pastFys, 'revenue') / Math.max(m, 1);
        const recentOrd = sumAt(recentFys, 'orders') / Math.max(k, 1);
        const pastOrd = sumAt(pastFys, 'orders') / Math.max(m, 1);
        const ratioScore = (recent: number, past: number) => past === 0 && recent > 0 ? 1 : past > 0 && recent === 0 ? 0 : past === 0 ? 0 : clamp(recent / past, 0, 2) / 2;
        const trend = (ratioScore(recentRev, pastRev) + ratioScore(recentOrd, pastOrd)) / 2;
        const totalRevenue = years.reduce((a, y) => a + y.revenue, 0);
        const totalOrders = years.reduce((a, y) => a + y.orders, 0);
        const totalProfit = years.reduce((a, y) => a + y.profit, 0);
        const margin = totalRevenue ? totalProfit / totalRevenue : 0;
        const activeYears = years.filter((y) => y.revenue > 0).length;
        return { part_num: part, revenue: totalRevenue, orders: totalOrders, profit: totalProfit, margin, trend_score: trend, active_years: activeYears };
      });
      const rankNorm = (arr: typeof scored, key: keyof (typeof scored)[number]) => {
        const sorted = [...arr].sort((a, b) => Number(b[key]) - Number(a[key]));
        const map = new Map<string, number>();
        sorted.forEach((row, i) => map.set(row.part_num, sorted.length === 1 ? 1 : 1 - i / (sorted.length - 1)));
        return map;
      };
      const nRevenue = rankNorm(scored, 'revenue');
      const nOrders = rankNorm(scored, 'orders');
      const nProfit = rankNorm(scored, 'profit');
      const nMargin = rankNorm(scored, 'margin');
      const nTrend = rankNorm(scored, 'trend_score');
      const nActive = rankNorm(scored, 'active_years');
      const final = scored.map((r) => ({ ...r,
        final_score: weights.revenue * (nRevenue.get(r.part_num) ?? 0) + weights.orders * (nOrders.get(r.part_num) ?? 0) + weights.profit * (nProfit.get(r.part_num) ?? 0) + weights.margin * (nMargin.get(r.part_num) ?? 0) + weights.trend * (nTrend.get(r.part_num) ?? 0) + weights.active * (nActive.get(r.part_num) ?? 0)
      })).sort((a, b) => b.final_score - a.final_score).slice(0, topN).map((r, i) => ({ rank: i + 1, ...r, explain: `High orders rank + trend ${r.trend_score.toFixed(2)} drove score.` }));
      setRows(final as unknown as Record<string, unknown>[]);
    });
  }, [filters, k, m, topN, weights]);

  const slider = (key: keyof Weights) => <label className="text-xs">{key}<input type="range" min={0} max={5} step={0.1} value={weights[key]} onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))} className="w-full" /></label>;

  return <div>
    <PageHeader title="Top Items Scoring Model" subtitle="Weighted deterministic model for top parts." actions={<div className="flex gap-2"><input type="number" value={topN} onChange={(e) => setTopN(Number(e.target.value || 50))} className="card w-20 px-2 py-1" /><input type="number" value={k} onChange={(e) => setK(Number(e.target.value || 2))} className="card w-16 px-2 py-1" /><input type="number" value={m} onChange={(e) => setM(Number(e.target.value || 3))} className="card w-16 px-2 py-1" /></div>} />
    <div className="card p-3 grid md:grid-cols-6 gap-2 mb-3">{(['revenue', 'orders', 'profit', 'margin', 'trend', 'active'] as (keyof Weights)[]).map(slider)}</div>
    <DataTable rows={rows} />
  </div>;
}
