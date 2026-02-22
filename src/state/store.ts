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
  setTopItemsSelection: (next) => set({ topItemsSelection: next })
}));
