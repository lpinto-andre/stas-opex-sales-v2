import * as duckdb from '@duckdb/duckdb-wasm';

type BundleDef = { mainModule: string; mainWorker: string; pthreadWorker?: string };

let db: duckdb.AsyncDuckDB | null = null;
let dbWorker: Worker | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();
let activeReads = 0;
let idleReadConnections: duckdb.AsyncDuckDBConnection[] = [];
const readConnections = new Set<duckdb.AsyncDuckDBConnection>();
const pendingReadCache = new Map<string, Promise<unknown>>();
const resultCache = new Map<string, unknown>();
const MAX_RESULT_CACHE = 40;
const readIdleResolvers: Array<() => void> = [];

const MANUAL_BUNDLES: Record<'mvp' | 'eh', BundleDef> = {
  mvp: { mainModule: '/duckdb/duckdb-mvp.wasm', mainWorker: '/duckdb/duckdb-browser-mvp.worker.js' },
  eh: { mainModule: '/duckdb/duckdb-eh.wasm', mainWorker: '/duckdb/duckdb-browser-eh.worker.js', pthreadWorker: '/duckdb/duckdb-browser-eh.pthread.worker.js' }
};

function touchCache<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_RESULT_CACHE) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function clearQueryCache() {
  pendingReadCache.clear();
  resultCache.clear();
}

function releaseReadWaitersIfIdle() {
  if (activeReads > 0) return;
  while (readIdleResolvers.length) readIdleResolvers.shift()?.();
}

async function waitForActiveReads() {
  if (activeReads === 0) return;
  await new Promise<void>((resolve) => readIdleResolvers.push(resolve));
}

async function closeReadConnections() {
  const connections = [...readConnections];
  idleReadConnections = [];
  readConnections.clear();
  await Promise.all(connections.map(async (conn) => {
    try {
      await conn.close();
    } catch {
      // Ignore stale connection close failures after a worker reset.
    }
  }));
}

async function resetDb() {
  clearQueryCache();
  await closeReadConnections();
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
    await resetDb();
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

async function acquireReadConnection() {
  const existing = idleReadConnections.pop();
  if (existing) return existing;
  const created = await (await getDb()).connect();
  readConnections.add(created);
  return created;
}

function releaseReadConnection(conn: duckdb.AsyncDuckDBConnection) {
  if (!readConnections.has(conn)) return;
  idleReadConnections.push(conn);
}

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  clearQueryCache();
  const next = writeQueue.then(async () => {
    await waitForActiveReads();
    await closeReadConnections();
    return task();
  }, async () => {
    await waitForActiveReads();
    await closeReadConnections();
    return task();
  });
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function runWithRetry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch {
    await resetDb();
    return task();
  }
}

async function enterReadSection() {
  while (true) {
    const barrier = writeQueue;
    await barrier;
    if (barrier !== writeQueue) continue;
    activeReads += 1;
    if (barrier === writeQueue) return;
    activeReads = Math.max(0, activeReads - 1);
    releaseReadWaitersIfIdle();
  }
}

function leaveReadSection() {
  activeReads = Math.max(0, activeReads - 1);
  releaseReadWaitersIfIdle();
}

export async function buildModel(dataBytes: Uint8Array) {
  return enqueueWrite(() => runWithRetry(async () => {
    const adb = await getDb();
    await adb.registerFileBuffer('pdr.ndjson', dataBytes);
    await withConnection(async (conn) => {
      await conn.query('DROP TABLE IF EXISTS pdr_part_order_start_metrics');
      await conn.query('DROP TABLE IF EXISTS pdr_part_month_metrics');
      await conn.query('DROP TABLE IF EXISTS pdr_order_month_metrics');
      await conn.query('DROP TABLE IF EXISTS pdr_invoice_month_metrics');
      await conn.query('DROP TABLE IF EXISTS pdr_enriched');
      await conn.query('DROP TABLE IF EXISTS order_line_first');
      await conn.query('DROP TABLE IF EXISTS pdr_clean');
      await conn.query('DROP TABLE IF EXISTS pdr_raw');
      await conn.query("CREATE TABLE pdr_raw AS SELECT * FROM read_json_auto('pdr.ndjson', format='newline_delimited')");
      await conn.query(`CREATE TABLE pdr_clean AS SELECT trim(cust_id) AS cust_id, trim(cust_name) AS cust_name, trim(country) AS country, trim(territory) AS territory, trim(prod_group) AS prod_group, trim(prod_group_desc) AS prod_group_desc, trim(part_num) AS part_num, trim(line_desc) AS line_desc, trim(class_id) AS class_id, trim(class_desc) AS class_desc, trim(invoice_num) AS invoice_num, CAST(invoice_date AS DATE) AS invoice_date, trim(order_num) AS order_num, CAST(amount AS DOUBLE) AS amount, CAST(cost AS DOUBLE) AS cost, CASE WHEN cost IS NULL THEN false ELSE true END AS cost_present, CASE WHEN EXTRACT(MONTH FROM CAST(invoice_date AS DATE)) >= 5 THEN EXTRACT(YEAR FROM CAST(invoice_date AS DATE)) + 1 ELSE EXTRACT(YEAR FROM CAST(invoice_date AS DATE)) END AS invoice_fy, strftime(CAST(invoice_date AS DATE), '%Y-%m') AS invoice_month, concat(trim(order_num), '|', trim(part_num)) AS order_line_id FROM pdr_raw WHERE CAST(amount AS DOUBLE) > 0`);
      await conn.query(`CREATE TABLE order_line_first AS SELECT order_line_id, MIN(invoice_date) AS first_invoice_date, CASE WHEN EXTRACT(MONTH FROM MIN(invoice_date)) >= 5 THEN EXTRACT(YEAR FROM MIN(invoice_date)) + 1 ELSE EXTRACT(YEAR FROM MIN(invoice_date)) END AS first_invoice_fy FROM pdr_clean GROUP BY order_line_id`);
      await conn.query(`CREATE TABLE pdr_enriched AS SELECT c.*, CASE WHEN c.cost_present THEN c.amount - c.cost ELSE NULL END AS profit, CASE WHEN c.cost_present AND c.amount <> 0 THEN (c.amount - c.cost) / c.amount ELSE NULL END AS profit_pct, o.first_invoice_date AS order_line_first_invoice_date, o.first_invoice_fy AS order_line_fy FROM pdr_clean c LEFT JOIN order_line_first o USING(order_line_id)`);
      await conn.query(`
        CREATE TABLE pdr_part_month_metrics AS
        SELECT
          invoice_month,
          invoice_fy,
          cust_id,
          cust_name,
          country,
          territory,
          prod_group,
          class_id,
          part_num,
          SUM(amount) AS revenue_all,
          SUM(CASE WHEN cost_present THEN amount ELSE 0 END) AS revenue_cost_present,
          SUM(CASE WHEN cost_present THEN cost ELSE 0 END) AS cost,
          SUM(CASE WHEN cost_present THEN amount - cost ELSE 0 END) AS profit,
          COUNT(DISTINCT order_num) AS orders,
          COUNT(DISTINCT order_line_id) AS order_lines,
          SUM(CASE WHEN cost_present THEN 0 ELSE 1 END) AS missing_cost_rows
        FROM pdr_enriched
        GROUP BY 1,2,3,4,5,6,7,8,9
      `);
      await conn.query(`
        CREATE TABLE pdr_invoice_month_metrics AS
        SELECT
          invoice_month,
          cust_id,
          cust_name,
          country,
          territory,
          prod_group,
          class_id,
          part_num,
          line_desc AS line_desc_full,
          substr(line_desc, 1, 25) AS line_desc_short,
          substr(line_desc, 1, 30) AS line_desc_display,
          SUM(amount) AS revenue_all,
          SUM(CASE WHEN cost_present THEN amount ELSE 0 END) AS revenue_cost_present,
          SUM(CASE WHEN cost_present THEN cost ELSE 0 END) AS cost,
          SUM(CASE WHEN cost_present THEN amount - cost ELSE 0 END) AS profit,
          SUM(CASE WHEN cost_present THEN 0 ELSE 1 END) AS missing_cost_rows
        FROM pdr_enriched
        GROUP BY 1,2,3,4,5,6,7,8,9
      `);
      await conn.query(`
        CREATE TABLE pdr_part_order_start_metrics AS
        SELECT
          strftime(order_line_first_invoice_date, '%Y-%m') AS order_line_first_month,
          order_line_fy,
          cust_id,
          cust_name,
          country,
          territory,
          prod_group,
          class_id,
          part_num,
          COUNT(DISTINCT order_line_id) AS order_lines
        FROM pdr_enriched
        GROUP BY 1,2,3,4,5,6,7,8,9
      `);
      await conn.query(`
        CREATE TABLE pdr_order_month_metrics AS
        SELECT
          strftime(order_line_first_invoice_date, '%Y-%m') AS order_line_first_month,
          order_line_fy,
          cust_id,
          cust_name,
          country,
          territory,
          prod_group,
          class_id,
          part_num,
          line_desc AS line_desc_full,
          substr(line_desc, 1, 25) AS line_desc_short,
          substr(line_desc, 1, 30) AS line_desc_display,
          COUNT(DISTINCT order_num) AS orders,
          COUNT(DISTINCT order_line_id) AS order_lines
        FROM pdr_enriched
        GROUP BY 1,2,3,4,5,6,7,8,9,10
      `);
    });
  }));
}

export async function dropAllTables() {
  return enqueueWrite(() => runWithRetry(async () => withConnection(async (conn) => {
    await conn.query('DROP TABLE IF EXISTS pdr_part_order_start_metrics');
    await conn.query('DROP TABLE IF EXISTS pdr_part_month_metrics');
    await conn.query('DROP TABLE IF EXISTS pdr_order_month_metrics');
    await conn.query('DROP TABLE IF EXISTS pdr_invoice_month_metrics');
    await conn.query('DROP TABLE IF EXISTS pdr_enriched');
    await conn.query('DROP TABLE IF EXISTS order_line_first');
    await conn.query('DROP TABLE IF EXISTS pdr_clean');
    await conn.query('DROP TABLE IF EXISTS pdr_raw');
  })));
}

export async function queryRows<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  await enterReadSection();
  try {
    if (resultCache.has(sql)) {
      const cached = resultCache.get(sql) as T[];
      touchCache(resultCache, sql, cached);
      return cached;
    }
    if (pendingReadCache.has(sql)) return await (pendingReadCache.get(sql) as Promise<T[]>);

    const pending = runWithRetry(async () => {
      const conn = await acquireReadConnection();
      try {
        const result = await conn.query(sql);
        const rows = result.toArray().map((row) => row.toJSON() as T);
        pendingReadCache.delete(sql);
        touchCache(resultCache, sql, rows);
        return rows;
      } catch (error) {
        pendingReadCache.delete(sql);
        resultCache.delete(sql);
        throw error;
      } finally {
        releaseReadConnection(conn);
      }
    });

    touchCache(pendingReadCache, sql, pending);
    return await pending;
  } finally {
    leaveReadSection();
  }
}
