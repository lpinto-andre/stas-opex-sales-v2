import { queryRows } from '@/data/duckdb';

export type Filters = {
  startDate?: string;
  endDate?: string;
  customers?: string[];
  countries?: string[];
  territories?: string[];
  prodGroups?: string[];
  classes?: string[];
  parts?: string[];
  searchLineDesc?: string;
};

const esc = (v: string) => v.replace(/'/g, "''");
const addList = (col: string, vals?: string[]) => vals?.length ? `${col} IN (${vals.map((v) => `'${esc(v)}'`).join(',')})` : '';

export const buildWhereClause = (f: Filters, dateColumn = 'invoice_date') => {
  const clauses: string[] = [];
  if (f.startDate) clauses.push(`${dateColumn} >= DATE '${esc(f.startDate)}'`);
  if (f.endDate) clauses.push(`${dateColumn} <= DATE '${esc(f.endDate)}'`);
  if (f.searchLineDesc) clauses.push(`lower(line_desc) LIKE '%${esc(f.searchLineDesc.toLowerCase())}%'`);
  [addList('cust_id', f.customers), addList('country', f.countries), addList('territory', f.territories), addList('prod_group', f.prodGroups), addList('class_id', f.classes), addList('part_num', f.parts)]
    .filter(Boolean).forEach((c) => clauses.push(c));
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
};

export async function getKPIs(filters: Filters) {
  const rows = await queryRows<Record<string, number>>(`
    SELECT
      COALESCE(SUM(amount),0) AS revenue,
      COALESCE(SUM(CASE WHEN cost_present THEN amount - cost END),0) AS profit,
      COUNT(DISTINCT order_line_id) AS orders,
      COUNT(DISTINCT invoice_num) AS invoices,
      COUNT(DISTINCT cust_id) AS customers,
      COUNT(DISTINCT part_num) AS parts,
      SUM(CASE WHEN cost_present THEN 0 ELSE 1 END) AS missing_cost_rows,
      COUNT(*) AS total_rows
    FROM pdr_enriched ${buildWhereClause(filters)}
  `);
  return rows[0];
}

export const getRevenueByMonth = (filters: Filters) => queryRows<{ month: string; revenue: number }>(`SELECT invoice_month AS month, SUM(amount) AS revenue FROM pdr_enriched ${buildWhereClause(filters)} GROUP BY 1 ORDER BY 1`);
export const getRevenueByFY = (filters: Filters) => queryRows<{ fy: number; revenue: number }>(`SELECT invoice_fy AS fy, SUM(amount) AS revenue FROM pdr_enriched ${buildWhereClause(filters)} GROUP BY 1 ORDER BY 1`);
export const getOrdersByFY = (filters: Filters) => queryRows<{ fy: number; orders: number }>(`SELECT order_line_fy AS fy, COUNT(DISTINCT order_line_id) AS orders FROM pdr_enriched ${buildWhereClause(filters, 'order_line_first_invoice_date')} GROUP BY 1 ORDER BY 1`);
export const getRevenueByProdGroup = (filters: Filters) => queryRows<{ prod_group: string; revenue: number }>(`SELECT prod_group, SUM(amount) AS revenue FROM pdr_enriched ${buildWhereClause(filters)} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);

export const getDetailRows = (filters: Filters, limit = 300) => queryRows<Record<string, unknown>>(`
  SELECT invoice_date, invoice_num, order_num, cust_id, cust_name, part_num, line_desc, prod_group, country, territory, class_id, amount, cost,
    CASE WHEN cost_present THEN amount - cost ELSE NULL END AS profit,
    CASE WHEN cost_present THEN (amount-cost)/NULLIF(amount,0) ELSE NULL END AS margin_pct,
    invoice_fy, order_line_fy
  FROM pdr_enriched ${buildWhereClause(filters)} ORDER BY invoice_date DESC LIMIT ${limit}
`);

const entityColumn: Record<string, string> = {
  parts: 'part_num', customers: 'cust_name', prodgroup: 'prod_group', class: 'class_id', country: 'country', territory: 'territory'
};

export async function getRanking(filters: Filters, entity: keyof typeof entityColumn, metric: 'revenue' | 'orders' | 'profit' | 'margin', topN: number) {
  const col = entityColumn[entity];
  const metricExpr = metric === 'revenue'
    ? 'SUM(amount)'
    : metric === 'orders'
      ? 'COUNT(DISTINCT order_num)'
      : metric === 'profit'
        ? 'SUM(CASE WHEN cost_present THEN amount-cost END)'
        : 'SUM(CASE WHEN cost_present THEN amount-cost END)/NULLIF(SUM(amount),0)';
  return queryRows<Record<string, unknown>>(`
    SELECT ${col} AS entity,
      SUM(amount) AS revenue,
      COUNT(DISTINCT order_num) AS orders,
      SUM(CASE WHEN cost_present THEN amount-cost END) AS profit,
      SUM(CASE WHEN cost_present THEN amount-cost END)/NULLIF(SUM(amount),0) AS margin,
      COUNT(DISTINCT invoice_fy) AS active_fy_count
    FROM pdr_enriched ${buildWhereClause(filters)}
    GROUP BY 1 ORDER BY ${metricExpr} DESC NULLS LAST LIMIT ${topN}
  `);
}

export const getDistinctOptions = (column: string, search = '', limit = 200) => {
  const searchClause = search ? `WHERE lower(${column}) LIKE '%${esc(search.toLowerCase())}%'` : '';
  return queryRows<{ value: string }>(`SELECT DISTINCT ${column} AS value FROM pdr_enriched ${searchClause} ORDER BY 1 LIMIT ${limit}`);
};

export async function getPartYearMetrics(filters: Filters) {
  return queryRows<{ part_num: string; invoice_fy: number; order_line_fy: number; revenue: number; orders: number; profit: number; margin: number }>(`
    WITH rev AS (
      SELECT part_num, invoice_fy AS fy, SUM(amount) AS revenue, SUM(CASE WHEN cost_present THEN amount-cost END) AS profit
      FROM pdr_enriched ${buildWhereClause(filters)} GROUP BY 1,2
    ), ord AS (
      SELECT part_num, order_line_fy AS fy, COUNT(DISTINCT order_line_id) AS orders
      FROM pdr_enriched ${buildWhereClause(filters, 'order_line_first_invoice_date')} GROUP BY 1,2
    )
    SELECT COALESCE(rev.part_num, ord.part_num) AS part_num,
      COALESCE(rev.fy, ord.fy) AS invoice_fy,
      COALESCE(ord.fy, rev.fy) AS order_line_fy,
      COALESCE(revenue,0) AS revenue,
      COALESCE(orders,0) AS orders,
      COALESCE(profit,0) AS profit,
      CASE WHEN COALESCE(revenue,0)=0 THEN 0 ELSE COALESCE(profit,0)/revenue END AS margin
    FROM rev FULL OUTER JOIN ord ON rev.part_num=ord.part_num AND rev.fy=ord.fy
  `);
}
