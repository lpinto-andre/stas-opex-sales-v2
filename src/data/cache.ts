import { openDB } from 'idb';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const DB_NAME = 'stas-opex-cache';

export async function saveDatasetPackage(dataArrow: Uint8Array, meta: object) {
  const db = await openDB(DB_NAME, 1, { upgrade(d) { d.createObjectStore('dataset'); } });
  await db.put('dataset', dataArrow, 'data.arrow');
  await db.put('dataset', meta, 'meta.json');
}

export async function loadDatasetPackage() {
  const db = await openDB(DB_NAME, 1, { upgrade(d) { d.createObjectStore('dataset'); } });
  const data = await db.get('dataset', 'data.arrow');
  const meta = await db.get('dataset', 'meta.json');
  return data && meta ? { data, meta } : null;
}

export function buildStasPack(dataArrow: Uint8Array, meta: object) {
  return zipSync({ 'data.arrow': dataArrow, 'meta.json': strToU8(JSON.stringify(meta, null, 2)) });
}

export function parseStasPack(content: Uint8Array) {
  const unzipped = unzipSync(content);
  return { dataArrow: unzipped['data.arrow'], meta: JSON.parse(strFromU8(unzipped['meta.json'])) };
}
