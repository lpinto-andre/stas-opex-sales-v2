import { toFiscalYear } from './fiscal';

type Row = { order_num: string; part_num: string; invoice_date: string };

export function computeOrderLineFirst(rows: Row[]) {
  const map = new Map<string, Date>();
  for (const row of rows) {
    const key = `${row.order_num}|${row.part_num}`;
    const d = new Date(row.invoice_date);
    const cur = map.get(key);
    if (!cur || d < cur) map.set(key, d);
  }
  return [...map.entries()].map(([order_line_id, firstDate]) => ({ order_line_id, first_invoice_date: firstDate.toISOString().slice(0, 10), first_invoice_fy: toFiscalYear(firstDate) }));
}
