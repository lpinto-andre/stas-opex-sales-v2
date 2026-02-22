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


export const getOrdersByMonth = (filters: Filters) => queryRows<{ month: string; orders: number }>(`SELECT invoice_month AS month, COUNT(DISTINCT order_line_id) AS orders FROM pdr_enriched ${buildWhereClause(filters, 'order_line_first_invoice_date')} GROUP BY 1 ORDER BY 1`);
export const getOrdersByProdGroup = (filters: Filters) => queryRows<{ prod_group: string; orders: number }>(`SELECT prod_group, COUNT(DISTINCT order_line_id) AS orders FROM pdr_enriched ${buildWhereClause(filters, 'order_line_first_invoice_date')} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);

const withParts = (filters: Filters, partNums: string[]): Filters => ({ ...filters, parts: partNums.length ? partNums : [''] });

export const getRevenueByFYForParts = (filters: Filters, partNums: string[]) => queryRows<{ fy: number; revenue: number }>(`SELECT invoice_fy AS fy, SUM(amount) AS revenue FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums))} GROUP BY 1 ORDER BY 1`);
export const getOrdersByFYForParts = (filters: Filters, partNums: string[]) => queryRows<{ fy: number; orders: number }>(`SELECT order_line_fy AS fy, COUNT(DISTINCT order_line_id) AS orders FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums), 'order_line_first_invoice_date')} GROUP BY 1 ORDER BY 1`);
export const getRevenueByFYAndPartForParts = (filters: Filters, partNums: string[]) => queryRows<{ fy: number; part_num: string; revenue: number }>(`SELECT invoice_fy AS fy, part_num, SUM(amount) AS revenue FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums))} GROUP BY 1,2 ORDER BY 1,2`);
export const getOrdersByFYAndPartForParts = (filters: Filters, partNums: string[]) => queryRows<{ fy: number; part_num: string; orders: number }>(`SELECT order_line_fy AS fy, part_num, COUNT(DISTINCT order_line_id) AS orders FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums), 'order_line_first_invoice_date')} GROUP BY 1,2 ORDER BY 1,2`);
export const getRevenueByMonthForParts = (filters: Filters, partNums: string[]) => queryRows<{ month: string; revenue: number }>(`SELECT invoice_month AS month, SUM(amount) AS revenue FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums))} GROUP BY 1 ORDER BY 1`);
export const getOrdersByMonthForParts = (filters: Filters, partNums: string[]) => queryRows<{ month: string; orders: number }>(`SELECT invoice_month AS month, COUNT(DISTINCT order_line_id) AS orders FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums), 'order_line_first_invoice_date')} GROUP BY 1 ORDER BY 1`);
export const getRevenueTotalsForParts = (filters: Filters, partNums: string[]) => queryRows<{ part_num: string; revenue: number }>(`SELECT part_num, SUM(amount) AS revenue FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums))} GROUP BY 1 ORDER BY 2 DESC`);
export const getOrderTotalsForParts = (filters: Filters, partNums: string[]) => queryRows<{ part_num: string; orders: number }>(`SELECT part_num, COUNT(DISTINCT order_line_id) AS orders FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums), 'order_line_first_invoice_date')} GROUP BY 1 ORDER BY 2 DESC`);
export const getRevenueByMonthAndPartForParts = (filters: Filters, partNums: string[]) => queryRows<{ month: string; part_num: string; revenue: number }>(`SELECT invoice_month AS month, part_num, SUM(amount) AS revenue FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums))} GROUP BY 1,2 ORDER BY 1,2`);
export const getOrdersByMonthAndPartForParts = (filters: Filters, partNums: string[]) => queryRows<{ month: string; part_num: string; orders: number }>(`SELECT invoice_month AS month, part_num, COUNT(DISTINCT order_line_id) AS orders FROM pdr_enriched ${buildWhereClause(withParts(filters, partNums), 'order_line_first_invoice_date')} GROUP BY 1,2 ORDER BY 1,2`);
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

export const getCustomerOptions = (search = '', limit = 200) => {
  const clause = search ? `WHERE lower(cust_id) LIKE '%${esc(search.toLowerCase())}%' OR lower(cust_name) LIKE '%${esc(search.toLowerCase())}%'` : '';
  return queryRows<{ value: string; label: string }>(`SELECT DISTINCT cust_id AS value, concat(cust_id, ' - ', cust_name) AS label FROM pdr_enriched ${clause} ORDER BY 2 LIMIT ${limit}`);
};

export const getPartsPriorityRows = (filters: Filters, limit = 500) => queryRows<Record<string, unknown>>(`
  SELECT
    cust_id,
    cust_name,
    country,
    part_num,
    substr(line_desc, 1, 25) AS line_desc_short,
    prod_group,
    COUNT(DISTINCT order_num) AS orders,
    SUM(amount) AS revenue,
    SUM(CASE WHEN cost_present THEN amount - cost END) AS profit,
    CASE WHEN SUM(amount)=0 THEN 0 ELSE SUM(CASE WHEN cost_present THEN amount - cost END)/SUM(amount) END AS profit_pct
  FROM pdr_enriched ${buildWhereClause(filters)}
  GROUP BY 1,2,3,4,5,6
  ORDER BY revenue DESC
  LIMIT ${limit}
`);

export const getPartsRevenueByFY = (filters: Filters) => queryRows<Record<string, unknown>>(`
  SELECT cust_id, cust_name, country, part_num, substr(line_desc,1,25) AS line_desc_short, prod_group, invoice_fy AS fy, SUM(amount) AS revenue
  FROM pdr_enriched ${buildWhereClause(filters)}
  GROUP BY 1,2,3,4,5,6,7
`);

export const getPartsOrdersByFY = (filters: Filters) => queryRows<Record<string, unknown>>(`
  SELECT cust_id, cust_name, country, part_num, substr(line_desc,1,25) AS line_desc_short, prod_group, order_line_fy AS fy, COUNT(DISTINCT order_num) AS orders
  FROM pdr_enriched ${buildWhereClause(filters, 'order_line_first_invoice_date')}
  GROUP BY 1,2,3,4,5,6,7
`);

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


const basePricingWhere = (filters: Filters, costOnly = true, dateColumn = 'invoice_date') => {
  const where = buildWhereClause(filters, dateColumn);
  const extra = [`amount >= 0`, costOnly ? `cost_present` : ``].filter(Boolean).join(' AND ');
  if (!where) return extra ? `WHERE ${extra}` : '';
  return `${where} AND ${extra}`;
};

export async function getPricingKPIs(filters: Filters, costOnly = true) {
  const rows = await queryRows<Record<string, number>>(`
    SELECT
      COALESCE(SUM(amount),0) AS revenue,
      COALESCE(SUM(CASE WHEN cost_present THEN cost END),0) AS cost,
      COALESCE(SUM(CASE WHEN cost_present THEN amount-cost END),0) AS profit,
      CASE WHEN COALESCE(SUM(CASE WHEN cost_present THEN amount END),0)=0 THEN 0 ELSE SUM(CASE WHEN cost_present THEN amount-cost END)/SUM(CASE WHEN cost_present THEN amount END) END AS margin_pct,
      CASE WHEN COALESCE(SUM(CASE WHEN cost_present THEN amount END),0)=0 THEN 0 ELSE SUM(CASE WHEN cost_present THEN (amount-cost)*amount END)/NULLIF(SUM(CASE WHEN cost_present THEN amount*amount END),0) END AS avg_margin_pct,
      CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(CASE WHEN cost_present THEN 0 ELSE 1 END)::DOUBLE/COUNT(*) END AS missing_cost_pct,
      COUNT(DISTINCT invoice_num) AS invoice_count,
      COUNT(DISTINCT order_line_id) AS order_count
    FROM pdr_enriched ${basePricingWhere(filters, costOnly)}
  `);
  return rows[0] ?? {};
}

export const getRevenueCostProfitOverTime = (filters: Filters, costOnly = true, granularity: 'monthly' | 'fy' = 'monthly') => {
  const period = granularity === 'monthly' ? 'invoice_month' : 'invoice_fy';
  return queryRows<Record<string, unknown>>(`
    SELECT ${period} AS period,
      SUM(amount) AS revenue,
      SUM(CASE WHEN cost_present THEN cost END) AS cost,
      SUM(CASE WHEN cost_present THEN amount-cost END) AS profit,
      CASE WHEN SUM(CASE WHEN cost_present THEN amount END)=0 THEN 0 ELSE SUM(CASE WHEN cost_present THEN amount-cost END)/SUM(CASE WHEN cost_present THEN amount END) END AS margin_pct
    FROM pdr_enriched ${basePricingWhere(filters, costOnly)} GROUP BY 1 ORDER BY 1
  `);
};

export const getMarginDistribution = (filters: Filters, costOnly = true, bucketSpec = [-20,0,10,20,30,40,50,60,999]) => {
  const cases = bucketSpec.slice(0,-1).map((start, i) => `WHEN margin_pct >= ${start/100} AND margin_pct < ${bucketSpec[i+1]/100} THEN '[${start},${bucketSpec[i+1]})'`).join(' ');
  return queryRows<Record<string, unknown>>(`
    WITH b AS (
      SELECT amount, CASE WHEN amount=0 OR NOT cost_present THEN NULL ELSE (amount-cost)/amount END AS margin_pct
      FROM pdr_enriched ${basePricingWhere(filters, true)}
    )
    SELECT CASE ${cases} ELSE '[60,999]' END AS bucketLabel,
      COUNT(*) AS count_lines,
      SUM(amount) AS revenue_in_bucket
    FROM b WHERE margin_pct IS NOT NULL GROUP BY 1 ORDER BY 1
  `);
};

export const getTopEntitiesByMetric = (filters: Filters, costOnly = true, entityType: 'parts'|'customers'='parts', metric: 'revenue'|'profit'|'margin_pct'|'avg_price'='revenue', topN = 15) => {
  const idCol = entityType === 'parts' ? 'part_num' : 'cust_id';
  const nameCol = entityType === 'parts' ? 'substr(max(line_desc),1,40)' : 'max(cust_name)';
  const metricExpr = metric === 'revenue' ? 'SUM(amount)' : metric === 'profit' ? 'SUM(CASE WHEN cost_present THEN amount-cost END)' : metric === 'margin_pct' ? 'SUM(CASE WHEN cost_present THEN amount-cost END)/NULLIF(SUM(CASE WHEN cost_present THEN amount END),0)' : 'AVG(amount)';
  return queryRows<Record<string, unknown>>(`
    SELECT ${idCol} AS id, ${nameCol} AS name, ${metricExpr} AS value
    FROM pdr_enriched ${basePricingWhere(filters, costOnly)}
    GROUP BY 1 ORDER BY 3 DESC NULLS LAST LIMIT ${topN}
  `);
};

export const getMarginLeakScatter = (filters: Filters, costOnly = true, entityType: 'parts'|'customers'='parts', topNUniverse = 500) => {
  const idCol = entityType === 'parts' ? 'part_num' : 'cust_id';
  const nameCol = entityType === 'parts' ? 'substr(max(line_desc),1,40)' : 'max(cust_name)';
  return queryRows<Record<string, unknown>>(`
    SELECT ${idCol} AS id, ${nameCol} AS name,
      SUM(amount) AS revenue,
      SUM(CASE WHEN cost_present THEN amount-cost END) AS profit,
      CASE WHEN SUM(CASE WHEN cost_present THEN amount END)=0 THEN 0 ELSE SUM(CASE WHEN cost_present THEN amount-cost END)/SUM(CASE WHEN cost_present THEN amount END) END AS margin_pct,
      COUNT(DISTINCT order_line_id) AS orders,
      AVG(amount) AS avg_price
    FROM pdr_enriched ${basePricingWhere(filters, costOnly)}
    GROUP BY 1 ORDER BY revenue DESC LIMIT ${topNUniverse}
  `);
};

export const getPriceDispersionStats = (filters: Filters, costOnly = true, entityType: 'part'|'customer'='part', topN = 30) => {
  const idCol = entityType === 'part' ? 'part_num' : 'cust_id';
  return queryRows<Record<string, unknown>>(`
    SELECT ${idCol} AS id,
      SUM(amount) AS revenue,
      quantile_cont(amount,0.5) AS median_price,
      quantile_cont(amount,0.25) AS p25_price,
      quantile_cont(amount,0.75) AS p75_price,
      MIN(amount) AS min_price,
      MAX(amount) AS max_price,
      (quantile_cont(amount,0.75)-quantile_cont(amount,0.25))/NULLIF(quantile_cont(amount,0.5),0) AS dispersion_index,
      quantile_cont(CASE WHEN cost_present THEN (amount-cost)/NULLIF(amount,0) END,0.5) AS median_margin
    FROM pdr_enriched ${basePricingWhere(filters, costOnly)}
    GROUP BY 1 ORDER BY revenue DESC LIMIT ${topN}
  `);
};

export const getAnomaliesTable = (filters: Filters, costOnly = true, params: { minRevenue?: number; minOrders?: number; marginThreshold?: number; dispersionThreshold?: number } = {}) => {
  const minRevenue = Number(params.minRevenue ?? 0);
  const minOrders = Number(params.minOrders ?? 0);
  const marginThreshold = Number(params.marginThreshold ?? 0.2);
  const dispersionThreshold = Number(params.dispersionThreshold ?? 0.25);
  return queryRows<Record<string, unknown>>(`
    WITH base AS (
      SELECT
        part_num, substr(max(line_desc),1,40) AS line_desc,
        cust_id, max(cust_name) AS cust_name,
        max(country) AS country, max(territory) AS territory, max(prod_group) AS prod_group,
        SUM(amount) AS revenue,
        COUNT(DISTINCT order_line_id) AS orders,
        AVG(amount) AS avg_price,
        MIN(amount) AS min_price,
        MAX(amount) AS max_price,
        SUM(CASE WHEN cost_present THEN amount-cost END) AS profit,
        CASE WHEN SUM(CASE WHEN cost_present THEN amount END)=0 THEN 0 ELSE SUM(CASE WHEN cost_present THEN amount-cost END)/SUM(CASE WHEN cost_present THEN amount END) END AS margin_pct,
        (quantile_cont(amount,0.75)-quantile_cont(amount,0.25))/NULLIF(quantile_cont(amount,0.5),0) AS dispersion_index
      FROM pdr_enriched ${basePricingWhere(filters, costOnly)}
      GROUP BY 1,3
    )
    SELECT * FROM base
    WHERE revenue >= ${minRevenue} AND orders >= ${minOrders}
      AND (margin_pct <= ${marginThreshold} OR dispersion_index >= ${dispersionThreshold})
    ORDER BY margin_pct ASC, revenue DESC
    LIMIT 3000
  `);
};
