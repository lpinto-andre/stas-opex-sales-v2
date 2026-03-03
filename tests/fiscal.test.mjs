import test from 'node:test';
import assert from 'node:assert/strict';

const toFiscalYear = (date) => (date.getUTCMonth() + 1 >= 5 ? date.getUTCFullYear() + 1 : date.getUTCFullYear());

test('Apr stays in same FY', () => {
  assert.equal(toFiscalYear(new Date('2025-04-30')), 2025);
});

test('May shifts to next FY', () => {
  assert.equal(toFiscalYear(new Date('2025-05-01')), 2026);
});
