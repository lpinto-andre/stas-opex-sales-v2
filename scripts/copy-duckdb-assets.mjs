import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(process.cwd());
const from = resolve(root, 'node_modules/@duckdb/duckdb-wasm/dist');
const to = resolve(root, 'public/duckdb');

const files = [
  'duckdb-mvp.wasm',
  'duckdb-eh.wasm',
  'duckdb-browser-mvp.worker.js',
  'duckdb-browser-eh.worker.js',
  'duckdb-browser-coi.pthread.worker.js'
];

await mkdir(to, { recursive: true });
for (const file of files) {
  const src = resolve(from, file);
  const destName = file === 'duckdb-browser-coi.pthread.worker.js' ? 'duckdb-browser-eh.pthread.worker.js' : file;
  const dest = resolve(to, destName);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

console.log('DuckDB assets copied to public/duckdb');
