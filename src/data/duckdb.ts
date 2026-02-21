import * as duckdb from '@duckdb/duckdb-wasm';
import { toFiscalYear } from '@/utils/fiscal';

let db: duckdb.AsyncDuckDB | null = null;

export async function getDb() {
  if (db) return db;
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export async function buildModel(rows: Record<string, unknown>[]) {
  const adb = await getDb();
  const conn = await adb.connect();
  await conn.query('DROP TABLE IF EXISTS pdr_raw; DROP TABLE IF EXISTS pdr_clean; DROP TABLE IF EXISTS order_line_first; DROP TABLE IF EXISTS pdr_enriched;');
  await conn.insertJSONFromPath?.('');
  await conn.query(`CREATE TABLE pdr_raw AS SELECT * FROM read_json_auto('${JSON.stringify(rows).replace(/'/g, "''")}')`);
  await conn.query(`
    CREATE TABLE pdr_clean AS
    SELECT *,
      CASE WHEN cost IS NULL THEN false ELSE true END AS cost_present,
      CASE WHEN EXTRACT(MONTH FROM CAST(invoice_date AS DATE)) >= 5 THEN EXTRACT(YEAR FROM CAST(invoice_date AS DATE))+1 ELSE EXTRACT(YEAR FROM CAST(invoice_date AS DATE)) END AS invoice_fy,
      strftime(CAST(invoice_date AS DATE), '%Y-%m') AS invoice_month,
      concat(order_num, '|', part_num) AS order_line_id
    FROM pdr_raw WHERE amount > 0;
    CREATE TABLE order_line_first AS
    SELECT order_line_id, min(CAST(invoice_date AS DATE)) AS first_invoice_date,
      CASE WHEN EXTRACT(MONTH FROM min(CAST(invoice_date AS DATE))) >= 5 THEN EXTRACT(YEAR FROM min(CAST(invoice_date AS DATE)))+1 ELSE EXTRACT(YEAR FROM min(CAST(invoice_date AS DATE))) END AS first_invoice_fy
    FROM pdr_clean GROUP BY 1;
    CREATE TABLE pdr_enriched AS
    SELECT c.*, o.first_invoice_date AS order_line_first_invoice_date, o.first_invoice_fy AS order_line_fy
    FROM pdr_clean c LEFT JOIN order_line_first o USING(order_line_id);
  `);
  conn.close();
  return { fyNow: toFiscalYear(new Date()) };
}
