import test from 'node:test';
import assert from 'node:assert/strict';

const normalizeHeader = (v) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const aliases = {
  cust_id: ['custid'], cust_name: ['custname'], country: ['country'], territory: ['territory'],
  prod_group: ['prodgrup', 'prodgroup'], prod_group_desc: ['prodgrupdesc', 'prodgroupdesc'], part_num: ['partnum'],
  line_desc: ['linedesc'], class_id: ['classid'], class_desc: ['classdesc'], invoice_num: ['invoicenum'],
  invoice_date: ['invoicedate'], order_num: ['ordernum'], amount: ['amount'], cost: ['cost']
};

function mapColumns(headers) {
  const normalized = headers.map((h) => normalizeHeader(h));
  const map = {};
  for (const [k, vals] of Object.entries(aliases)) {
    const idx = normalized.findIndex((h) => vals.includes(h));
    if (idx >= 0) map[k] = headers[idx];
  }
  return map;
}

test('maps STAS canonical Epicor headers', () => {
  const headers = ['CustID','CustName','Country','Territory','ProdGrup','ProdGrupDesc','PartNum','LineDesc','ClassID','ClassDesc','InvoiceNum','InvoiceDate','OrderNum','Amount','Cost','Profit','Profit %'];
  const map = mapColumns(headers);
  assert.equal(map.cust_id, 'CustID');
  assert.equal(map.invoice_date, 'InvoiceDate');
  assert.equal(map.amount, 'Amount');
  assert.equal(map.part_num, 'PartNum');
});
