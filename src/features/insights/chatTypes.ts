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

export type InsightsTopItemsSignal = {
  topN: number;
  displayedRows: number;
  rankedParts: number;
  tableMode: string;
  filters: {
    periodMode: string;
    fromMonth: string;
    toMonth: string;
    trendScoreFromMonth: string;
    minimumRevenue: number;
    minimumOrders: number;
    minimumThresholdMode: string;
    searchLineDesc: string;
    customers: string[];
    countries: string[];
    parts: string[];
    prodGroups: string[];
  };
  weights: {
    revenue: number;
    orders: number;
    profit: number;
    margin: number;
    trend: number;
    active: number;
  };
  topRows: InsightsTopItemsRow[];
  nextRows: InsightsTopItemsRow[];
  cutoff: {
    visibleRank: number;
    visiblePart: string;
    visibleFinalScore: number;
    nextRank: number;
    nextPart: string;
    nextFinalScore: number;
    finalScoreGap: number;
  } | null;
};

export type InsightsTopItemsRow = {
  rank: number;
  part_num: string;
  line_desc_short: string;
  cust_id: string;
  cust_name: string;
  country: string;
  prod_group: string;
  revenue: number;
  orders: number;
  profit: number;
  margin: number;
  revenue_score: number;
  orders_score: number;
  profit_score: number;
  margin_score: number;
  trend_score: number;
  active_score: number;
  final_score: number;
};

export type InsightsContextPack = {
  route: string;
  language: 'fr' | 'en';
  filters: Filters;
  scope: {
    page: string;
    filterSource: 'global' | 'pricing' | 'pricing-comparator' | 'potential' | 'top-items';
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
    topItems?: InsightsTopItemsSignal;
  };
};

export type InsightsReply = {
  answer: string;
  tips: string[];
  in_scope: boolean;
};
