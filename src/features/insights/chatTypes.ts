import type { Filters } from '@/data/queries';

export type InsightsMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type InsightsPotentialFileSummary = {
  fileName: string;
  territoryGroup: string;
  summaryRows: number;
  validationRows: number;
  invalidRows: number;
};

export type InsightsPotentialViewState = {
  selectedTerritory?: string;
  selectedCustomers?: string[];
  equipmentCustomerFilter?: string;
  equipmentTypeFilter?: string;
  equipmentItemFilter?: string;
};

export type InsightsContextPack = {
  route: string;
  language: 'fr' | 'en';
  filters: Filters;
  scope: {
    page: string;
    filterSource: 'global' | 'pricing' | 'pricing-comparator' | 'potential';
    pageState?: Record<string, unknown>;
  };
  dataset: {
    loaded: boolean;
    rowCount: number;
    customers: number;
    parts: number;
    dateRange: string;
  };
  potential: {
    importedFiles: number;
    files: InsightsPotentialFileSummary[];
    activeView: InsightsPotentialViewState;
  };
  signals: {
    kpis?: Record<string, number>;
    topProdGroups?: Array<{ prod_group: string; revenue: number }>;
    pricingKpis?: Record<string, number>;
    pricingTrend?: Array<{ period: string; revenue: number; cost: number; profit: number; margin_pct: number }>;
    pricingComparator?: {
      compareBy: string;
      selectedValues: string[];
      selectedPart: string | null;
      periodMode: string;
      fromMonth: string;
      toMonth: string;
      totals: Array<{ value: string; revenue: number; cost: number; profit: number; margin_pct: number }>;
    };
    potential?: {
      selectedTerritory: string | null;
      selectedCustomers: string[];
      filesInScope: string[];
      customersInScope: number;
      equipmentRowsInScope: number;
      coverage: { theoretical: number; actual: number; pct: number | null };
      coverageByCompanyAll: Array<{ customer: string; theoretical: number; actual: number; coverage_pct: number | null }>;
      coverageByCompanySelected: Array<{ customer: string; theoretical: number; actual: number; coverage_pct: number | null }>;
      coverageByProduct: Array<{ product: string; theoretical: number; actual: number; coverage_pct: number | null }>;
      coverageByItem: Array<{ item: string; theoretical: number; actual: number; coverage_pct: number | null }>;
      distribution: Array<{ bucket: string; count: number }>;
      exceptionsCount: number;
      naRowsCount: number;
    };
  };
};

export type InsightsReply = {
  answer: string;
  tips: string[];
  in_scope: boolean;
};
