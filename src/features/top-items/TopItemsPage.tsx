import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';

export function TopItemsPage() {
  return <div><PageHeader title="Top Items Scoring Model" subtitle="Weighted, deterministic ranking across revenue/orders/profit/margin/trend/active years." /><div className="card p-4 mb-4 text-sm">Explain: High orders rank (#12) + strong trend (0.83) drove the score.</div><DataTable rows={[{ rank: 1, part_num: 'P-100', final_score: 0.92, trend_score: 0.83, active_years: 5 }]} /></div>;
}
