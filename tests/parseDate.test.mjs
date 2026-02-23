import test from 'node:test';
import assert from 'node:assert/strict';

const parseDate = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const ms = (value - 25569) * 86400 * 1000;
    return new Date(ms);
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
};

test('parses excel serial date', () => {
  const d = parseDate(45444); // 2024-06-01 UTC-based
  assert.equal(d.toISOString().slice(0, 10), '2024-06-01');
});
