export type TrendV2Label =
  | 'Growing'
  | 'Stable'
  | 'Declining'
  | 'Emerging'
  | 'Irregular'
  | 'Dormant'
  | 'OneOffSpike';

export type TrendV2MonthlyInput = {
  partNum: string;
  month: string;
  revenue: number;
  orders: number;
};

export type TrendV2Params = {
  recentWindowMonths: number;
  baselineWindowMonths: number;
  slopeWindowMonths: number;
  fullConfidenceMonths: number;
  fullConfidenceActiveMonths: number;
  dormantLookbackMonths: number;
  dormantRecentActiveMax: number;
  irregularActiveShareMax: number;
  irregularRecentActiveShareMax: number;
  irregularNeutralMomentumMax: number;
  irregularNeutralSlopeMax: number;
  irregularLongestGapMin: number;
  emergingBaselineActiveMax: number;
  emergingRecentMinActiveMonths: number;
  emergingRecentMinRevenue: number;
  emergingMinMomentum: number;
  emergingMinRecentDemand: number;
  oneOffMaxActiveMonths: number;
  oneOffRevenueShareThreshold: number;
  oneOffRecentShareThreshold: number;
  oneOffOrderShareThreshold: number;
  growthMomentumThreshold: number;
  declineMomentumThreshold: number;
  minScale: number;
  revenueCapMultiplier: number;
  orderCapMultiplier: number;
  demandWeights: {
    presence: number;
    revenue: number;
    orders: number;
  };
};

export type TrendV2Flags = {
  dormant: boolean;
  irregular: boolean;
  emerging: boolean;
  oneOffSpike: boolean;
};

export type TrendV2Reasons = {
  scopeStartMonth: string;
  scopeEndMonth: string;
  scopeMonths: number;
  activeMonths: number;
  activeShare: number;
  recentWindowMonths: number;
  baselineWindowMonths: number;
  recentRevenue: number;
  baselineRevenue: number;
  recentAvgRevenue: number;
  baselineAvgRevenue: number;
  recentOrders: number;
  baselineOrders: number;
  recentAvgOrders: number;
  baselineAvgOrders: number;
  recentDemand: number;
  baselineDemand: number;
  momentum: number;
  slope: number;
  recentActiveMonths: number;
  baselineActiveMonths: number;
  recentActiveShare: number;
  longestZeroRun: number;
  trailingZeroRun: number;
  maxMonthRevenueShare: number;
  recentRevenueShare: number;
  maxMonthOrderShare: number;
  recentOrderShare: number;
  flags: TrendV2Flags;
};

export type TrendV2Result = {
  partNum: string;
  trendScoreV2: number;
  trendLabelV2: TrendV2Label;
  trendConfidenceV2: number;
  trendReasonsV2: TrendV2Reasons;
};

export type TrendV2ResultMap = Record<string, TrendV2Result>;
