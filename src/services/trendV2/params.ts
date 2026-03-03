import type { TrendV2Params } from '@/services/trendV2/types';

export const defaultTrendV2Params: TrendV2Params = {
  recentWindowMonths: 6,
  baselineWindowMonths: 6,
  slopeWindowMonths: 6,
  fullConfidenceMonths: 18,
  fullConfidenceActiveMonths: 8,
  dormantLookbackMonths: 4,
  dormantRecentActiveMax: 0,
  irregularActiveShareMax: 0.55,
  irregularRecentActiveShareMax: 0.55,
  irregularNeutralMomentumMax: 0.14,
  irregularNeutralSlopeMax: 0.12,
  irregularLongestGapMin: 2,
  emergingBaselineActiveMax: 1,
  emergingRecentMinActiveMonths: 2,
  emergingRecentMinRevenue: 1,
  emergingMinMomentum: 0.18,
  emergingMinRecentDemand: 0.4,
  oneOffMaxActiveMonths: 2,
  oneOffRevenueShareThreshold: 0.7,
  oneOffRecentShareThreshold: 0.6,
  oneOffOrderShareThreshold: 0.7,
  growthMomentumThreshold: 0.18,
  declineMomentumThreshold: -0.18,
  minScale: 0.28,
  revenueCapMultiplier: 2.5,
  orderCapMultiplier: 2.5,
  demandWeights: {
    presence: 0.25,
    revenue: 0.5,
    orders: 0.25
  }
};
