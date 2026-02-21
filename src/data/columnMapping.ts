import { normalizeHeader } from '@/utils/parsing';

const aliases: Record<string, string[]> = {
  cust_id: ['custid','customerid','codeclient'],
  cust_name: ['custname','customername','nomclient'],
  country: ['country','pays'], territory: ['territory','zone'],
  prod_group: ['prodgrup','prodgroup','groupeproduit'],
  prod_group_desc: ['prodgrupdesc','prodgroupdesc'],
  part_num: ['partnum','article','item'],
  line_desc: ['linedesc','description'],
  class_id: ['classid','classeid'], class_desc: ['classdesc','classe'],
  invoice_num: ['invoicenum','invoice','facture'],
  invoice_date: ['invoicedate','datefacture'],
  order_num: ['ordernum','order','commande'],
  amount: ['amount','montant','revenue'],
  cost: ['cost','cout']
};

export function mapColumns(headers: string[]) {
  const normalized = headers.map((h) => normalizeHeader(h));
  const map: Record<string, string> = {};
  for (const [canonical, vals] of Object.entries(aliases)) {
    const idx = normalized.findIndex((h) => vals.includes(h));
    if (idx >= 0) map[canonical] = headers[idx];
  }
  return map;
}
