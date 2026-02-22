import * as duckdb from '@duckdb/duckdb-wasm';

type BundleDef = { mainModule: string; mainWorker: string; pthreadWorker?: string };

let db: duckdb.AsyncDuckDB | null = null;
let dbWorker: Worker | null = null;
let queryQueue: Promise<unknown> = Promise.resolve();

const MANUAL_BUNDLES: Record<'mvp' | 'eh', BundleDef> = {
  mvp: { mainModule: '/duckdb/duckdb-mvp.wasm', mainWorker: '/duckdb/duckdb-browser-mvp.worker.js' },
  eh: { mainModule: '/duckdb/duckdb-eh.wasm', mainWorker: '/duckdb/duckdb-browser-eh.worker.js', pthreadWorker: '/duckdb/duckdb-browser-eh.pthread.worker.js' }
};

function resetDb() {
  try { dbWorker?.terminate(); } catch { /* ignore */ }
  dbWorker = null;
  db = null;
}

export async function getDb() {
  if (db) return db;
  try {
    const preferred: BundleDef = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated ? MANUAL_BUNDLES.eh : MANUAL_BUNDLES.mvp;
    dbWorker = new Worker(preferred.mainWorker);
    const logger = new duckdb.ConsoleLogger();
    db = new duckdb.AsyncDuckDB(logger, dbWorker);
    await db.instantiate(preferred.mainModule, preferred.pthreadWorker);
    return db;
  } catch (error) {
    resetDb();
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`DuckDB initialization failed. Ensure local duckdb assets are available in /public/duckdb. Details: ${details}`);
  }
}

async function withConnection<T>(fn: (conn: duckdb.AsyncDuckDBConnection) => Promise<T>) {
  const adb = await getDb();
  const conn = await adb.connect();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = queryQueue.then(task, task);
  queryQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function runWithRetry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch {
    resetDb();
    return task();
  }
}

export async function buildModel(dataBytes: Uint8Array) {
  return enqueue(() => runWithRetry(async () => {
    const adb = await getDb();
    await adb.registerFileBuffer('pdr.ndjson', dataBytes);
    await withConnection(async (conn) => {
      await conn.query('DROP TABLE IF EXISTS pdr_enriched');
      await conn.query('DROP TABLE IF EXISTS order_line_first');
      await conn.query('DROP TABLE IF EXISTS pdr_clean');
      await conn.query('DROP TABLE IF EXISTS pdr_raw');
      await conn.query("CREATE TABLE pdr_raw AS SELECT * FROM read_json_auto('pdr.ndjson', format='newline_delimited')");
      await conn.query(`CREATE TABLE pdr_clean AS SELECT trim(cust_id) AS cust_id, trim(cust_name) AS cust_name, trim(country) AS country, trim(territory) AS territory, trim(prod_group) AS prod_group, trim(prod_group_desc) AS prod_group_desc, trim(part_num) AS part_num, trim(line_desc) AS line_desc, trim(class_id) AS class_id, trim(class_desc) AS class_desc, trim(invoice_num) AS invoice_num, CAST(invoice_date AS DATE) AS invoice_date, trim(order_num) AS order_num, CAST(amount AS DOUBLE) AS amount, CAST(cost AS DOUBLE) AS cost, CASE WHEN cost IS NULL THEN false ELSE true END AS cost_present, CASE WHEN EXTRACT(MONTH FROM CAST(invoice_date AS DATE)) >= 5 THEN EXTRACT(YEAR FROM CAST(invoice_date AS DATE)) + 1 ELSE EXTRACT(YEAR FROM CAST(invoice_date AS DATE)) END AS invoice_fy, strftime(CAST(invoice_date AS DATE), '%Y-%m') AS invoice_month, concat(trim(order_num), '|', trim(part_num)) AS order_line_id FROM pdr_raw WHERE CAST(amount AS DOUBLE) > 0`);
      await conn.query(`CREATE TABLE order_line_first AS SELECT order_line_id, MIN(invoice_date) AS first_invoice_date, CASE WHEN EXTRACT(MONTH FROM MIN(invoice_date)) >= 5 THEN EXTRACT(YEAR FROM MIN(invoice_date)) + 1 ELSE EXTRACT(YEAR FROM MIN(invoice_date)) END AS first_invoice_fy FROM pdr_clean GROUP BY order_line_id`);
      await conn.query(`CREATE TABLE pdr_enriched AS SELECT c.*, CASE WHEN c.cost_present THEN c.amount - c.cost ELSE NULL END AS profit, CASE WHEN c.cost_present AND c.amount <> 0 THEN (c.amount - c.cost) / c.amount ELSE NULL END AS profit_pct, o.first_invoice_date AS order_line_first_invoice_date, o.first_invoice_fy AS order_line_fy FROM pdr_clean c LEFT JOIN order_line_first o USING(order_line_id)`);
    });
  }));
}

export async function dropAllTables() {
  return enqueue(() => runWithRetry(async () => withConnection(async (conn) => {
    await conn.query('DROP TABLE IF EXISTS pdr_enriched');
    await conn.query('DROP TABLE IF EXISTS order_line_first');
    await conn.query('DROP TABLE IF EXISTS pdr_clean');
    await conn.query('DROP TABLE IF EXISTS pdr_raw');
  })));
}

export async function queryRows<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  return enqueue(() => runWithRetry(async () => withConnection(async (conn) => {
    const result = await conn.query(sql);
    return result.toArray().map((row) => row.toJSON() as T);
  })));
}
