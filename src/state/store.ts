import { create } from 'zustand';
import type { Filters } from '@/data/queries';

type DatasetMeta = {
  loadedAt: string;
  rowCount: number;
  missingCostPct: number;
  fyRange: string;
  dateRange: string;
  customers: number;
  parts: number;
  selectedSheet?: string;
  droppedPct?: number;
  invalidDateRows?: number;
} | null;

type AppState = {
  datasetLoaded: boolean;
  performanceMode: boolean;
  datasetMeta: DatasetMeta;
  filters: Filters;
  setFilters: (next: Partial<Filters>) => void;
  resetFilters: () => void;
  setDataset: (meta: DatasetMeta) => void;
  pageState: Record<string, unknown>;
  setPageState: <T>(page: string, state: T) => void;
  topItemsSelection: { partNums: string[]; topN: number };
  setTopItemsSelection: (next: { partNums: string[]; topN: number }) => void;
  uiTheme: 'dark' | 'light';
  setUiTheme: (theme: 'dark' | 'light') => void;
  uiLang: 'fr' | 'en';
  setUiLang: (lang: 'fr' | 'en') => void;
  uiCurrency: 'USD' | 'CAD';
  setUiCurrency: (currency: 'USD' | 'CAD') => void;
};

const getSavedUiTheme = (): 'dark' | 'light' => {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem('uiTheme');
  return saved === 'light' ? 'light' : 'dark';
};

const getSavedUiLang = (): 'fr' | 'en' => {
  if (typeof window === 'undefined') return 'fr';
  const saved = window.localStorage.getItem('uiLang');
  return saved === 'en' ? 'en' : 'fr';
};

const getSavedUiCurrency = (): 'USD' | 'CAD' => {
  if (typeof window === 'undefined') return 'USD';
  const saved = window.localStorage.getItem('uiCurrency');
  return saved === 'CAD' ? 'CAD' : 'USD';
};

export const useAppStore = create<AppState>((set) => ({
  datasetLoaded: false,
  performanceMode: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
  datasetMeta: null,
  filters: {},
  setFilters: (next) => set((s) => ({ filters: { ...s.filters, ...next } })),
  resetFilters: () => set({ filters: {} }),
  setDataset: (datasetMeta) => set({ datasetMeta, datasetLoaded: !!datasetMeta }),
  pageState: {},
  setPageState: (page, state) => set((s) => ({ pageState: { ...s.pageState, [page]: state } })),
  topItemsSelection: { partNums: [], topN: 0 },
  setTopItemsSelection: (next) => set({ topItemsSelection: next }),
  uiTheme: getSavedUiTheme(),
  setUiTheme: (theme) => set(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('uiTheme', theme);
    return { uiTheme: theme };
  }),
  uiLang: getSavedUiLang(),
  setUiLang: (lang) => set(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('uiLang', lang);
    return { uiLang: lang };
  }),
  uiCurrency: getSavedUiCurrency(),
  setUiCurrency: (currency) => set(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('uiCurrency', currency);
    return { uiCurrency: currency };
  })
}));
