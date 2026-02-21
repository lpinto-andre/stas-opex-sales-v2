import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export type Filters = { startDate?: string; endDate?: string; customers?: string[]; countries?: string[]; territories?: string[]; prodGroups?: string[]; classes?: string[]; parts?: string[]; searchLineDesc?: string };

export const whereClause = (f: Filters) => {
  const c: string[] = [];
  if (f.startDate) c.push(`invoice_date >= '${f.startDate}'`);
  if (f.endDate) c.push(`invoice_date <= '${f.endDate}'`);
  if (f.searchLineDesc) c.push(`lower(line_desc) like '%${f.searchLineDesc.toLowerCase().replace(/'/g, "''")}%'
`);
  const addIn = (col: string, vals?: string[]) => vals?.length ? c.push(`${col} IN (${vals.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')})`) : null;
  addIn('cust_id', f.customers); addIn('country', f.countries); addIn('territory', f.territories); addIn('prod_group', f.prodGroups); addIn('class_id', f.classes); addIn('part_num', f.parts);
  return c.length ? `WHERE ${c.join(' AND ')}` : '';
};

export const getKPIs = async (conn: AsyncDuckDBConnection, f: Filters) => conn.query(`SELECT sum(amount) revenue, sum(case when cost_present then amount-cost end) profit, count(distinct invoice_num) invoices, count(distinct order_line_id) orders, count(distinct cust_id) customers, count(distinct part_num) parts FROM pdr_enriched ${whereClause(f)}`);
export const getRevenueByFY = async (conn: AsyncDuckDBConnection, f: Filters) => conn.query(`SELECT invoice_fy fy, sum(amount) revenue FROM pdr_enriched ${whereClause(f)} GROUP BY 1 ORDER BY 1`);
export const getOrdersByFY = async (conn: AsyncDuckDBConnection, f: Filters) => conn.query(`SELECT order_line_fy fy, count(distinct order_line_id) orders FROM pdr_enriched ${whereClause(f)} GROUP BY 1 ORDER BY 1`);
