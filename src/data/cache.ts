import { openDB } from 'idb';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const DB_NAME = 'stas-opex-cache';
const FALLBACK_KEY = 'stas-opex-cache-v1';
const POTENTIAL_FALLBACK_KEY = 'stas-opex-potential-v1';

async function getStore() {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('dataset')) d.createObjectStore('dataset');
    }
  });
}

const u8ToB64 = (bytes: Uint8Array) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return btoa(out);
};

const b64ToU8 = (base64: string) => {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

function saveFallback(dataNdjson: Uint8Array, meta: object) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify({ dataB64: u8ToB64(dataNdjson), meta }));
  } catch (error) {
    console.warn('Unable to save localStorage cache fallback.', error);
  }
}

function loadFallback(): { data: Uint8Array; meta: object } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { dataB64?: string; meta?: object };
    if (!parsed.dataB64 || !parsed.meta) return null;
    return { data: b64ToU8(parsed.dataB64), meta: parsed.meta };
  } catch (error) {
    console.warn('Unable to read localStorage cache fallback.', error);
    return null;
  }
}

export async function saveDatasetPackage(dataNdjson: Uint8Array, meta: object) {
  const safeBytes = Uint8Array.from(dataNdjson);
  saveFallback(safeBytes, meta);
  const db = await getStore();
  await db.put('dataset', safeBytes, 'data.ndjson');
  await db.put('dataset', meta, 'meta.json');
}

export async function loadDatasetPackage() {
  try {
    const db = await getStore();
    const dataNdjson = (await db.get('dataset', 'data.ndjson')) as Uint8Array | undefined;
    const dataArrowLegacy = (await db.get('dataset', 'data.arrow')) as Uint8Array | undefined;
    const meta = await db.get('dataset', 'meta.json');
    const data = dataNdjson ?? dataArrowLegacy;
    if (data && meta) return { data, meta };
  } catch (error) {
    console.warn('IndexedDB cache read failed, trying localStorage fallback.', error);
  }
  return loadFallback();
}

export async function clearDatasetPackage() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(FALLBACK_KEY);
  const db = await getStore();
  await db.delete('dataset', 'data.ndjson');
  await db.delete('dataset', 'data.arrow');
  await db.delete('dataset', 'meta.json');
}

export async function savePotentialState(state: object) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(POTENTIAL_FALLBACK_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Unable to save potential localStorage fallback.', error);
    }
  }
  try {
    const db = await getStore();
    await db.put('dataset', state, 'potential.json');
  } catch (error) {
    console.warn('Unable to save potential IndexedDB cache.', error);
  }
}

export async function loadPotentialState() {
  try {
    const db = await getStore();
    const potential = (await db.get('dataset', 'potential.json')) as Record<string, unknown> | undefined;
    if (potential) return potential;
  } catch (error) {
    console.warn('IndexedDB potential cache read failed, trying localStorage fallback.', error);
  }
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(POTENTIAL_FALLBACK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    console.warn('Unable to read potential localStorage fallback.', error);
    return null;
  }
}

export async function clearPotentialState() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(POTENTIAL_FALLBACK_KEY);
  try {
    const db = await getStore();
    await db.delete('dataset', 'potential.json');
  } catch (error) {
    console.warn('Unable to clear potential cache.', error);
  }
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
