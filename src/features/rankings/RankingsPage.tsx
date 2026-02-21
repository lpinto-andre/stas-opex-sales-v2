import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';

export function RankingsPage() {
  return <div><PageHeader title="Rankings" subtitle="Top entities by revenue, orders, profit, or margin." /><DataTable rows={[{ rank: 1, entity: 'Part A', revenue: 12300, orders: 9, profit: 1300, margin: '10.6%' }]} /></div>;
}
