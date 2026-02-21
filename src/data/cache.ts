import { openDB } from 'idb';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const DB_NAME = 'stas-opex-cache';

async function getStore() {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('dataset')) d.createObjectStore('dataset');
    }
  });
}

export async function saveDatasetPackage(dataNdjson: Uint8Array, meta: object) {
  const db = await getStore();
  await db.put('dataset', dataNdjson, 'data.ndjson');
  await db.put('dataset', meta, 'meta.json');
}

export async function loadDatasetPackage() {
  const db = await getStore();
  const dataNdjson = (await db.get('dataset', 'data.ndjson')) as Uint8Array | undefined;
  const dataArrowLegacy = (await db.get('dataset', 'data.arrow')) as Uint8Array | undefined;
  const meta = await db.get('dataset', 'meta.json');
  const data = dataNdjson ?? dataArrowLegacy;
  return data && meta ? { data, meta } : null;
}

export async function clearDatasetPackage() {
  const db = await getStore();
  await db.delete('dataset', 'data.ndjson');
  await db.delete('dataset', 'data.arrow');
  await db.delete('dataset', 'meta.json');
}

export function buildStasPack(dataNdjson: Uint8Array, meta: object) {
  return zipSync({
    'data.ndjson': dataNdjson,
    'meta.json': strToU8(JSON.stringify(meta, null, 2))
  });
}

export function parseStasPack(content: Uint8Array) {
  const unzipped = unzipSync(content);
  const data = unzipped['data.ndjson'] ?? unzipped['data.arrow'];
  if (!data || !unzipped['meta.json']) throw new Error('Invalid .staspack file.');
  return { dataNdjson: data, meta: JSON.parse(strFromU8(unzipped['meta.json'])) };
}
