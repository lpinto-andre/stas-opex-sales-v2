import test from 'node:test';
import assert from 'node:assert/strict';

const toFiscalYear = (date) => (date.getMonth() + 1 >= 5 ? date.getFullYear() + 1 : date.getFullYear());
const computeOrderLineFirst = (rows) => {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.order_num}|${r.part_num}`;
    const d = new Date(r.invoice_date);
    if (!map.has(key) || d < map.get(key)) map.set(key, d);
  }
  return [...map.entries()].map(([order_line_id, d]) => ({ order_line_id, first_invoice_date: d.toISOString().slice(0, 10), first_invoice_fy: toFiscalYear(d) }));
};

test('dedupes order-line and assigns first FY', () => {
  const out = computeOrderLineFirst([
    { order_num: 'O1', part_num: 'P1', invoice_date: '2025-06-01' },
    { order_num: 'O1', part_num: 'P1', invoice_date: '2025-01-01' },
    { order_num: 'O1', part_num: 'P2', invoice_date: '2025-07-01' }
  ]);
  assert.equal(out.length, 2);
  const p1 = out.find((x) => x.order_line_id === 'O1|P1');
  assert.equal(p1.first_invoice_date, '2025-01-01');
  assert.equal(p1.first_invoice_fy, 2025);
});
