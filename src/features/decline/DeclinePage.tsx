import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';

export function DeclinePage() {
  return <div><PageHeader title="Declining Items Model" subtitle="Classify parts as Declining/Stable/Growing/New/Inactive using configurable thresholds." /><DataTable rows={[{ part_num: 'P-200', label: 'Declining', revenue_ratio: 0.34, orders_ratio: 0.5 }]} /></div>;
}
