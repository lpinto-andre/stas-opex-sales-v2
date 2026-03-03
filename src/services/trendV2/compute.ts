import { defaultTrendV2Params } from '@/services/trendV2/params';
import type { TrendV2MonthlyInput, TrendV2Params, TrendV2Reasons, TrendV2Result, TrendV2ResultMap } from '@/services/trendV2/types';

type ComputeTrendV2Options = {
  scopeStartMonth?: string;
  scopeEndMonth?: string;
  params?: Partial<TrendV2Params>;
};

type PartPoint = {
  month: string;
  revenue: number;
  orders: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const isMonthKey = (value: string) => /^\d{4}-\d{2}$/.test(value);

const monthToIndex = (month: string) => {
  if (!isMonthKey(month)) return null;
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return null;
  return year * 12 + monthNumber - 1;
};

const indexToMonth = (index: number) => {
  const year = Math.floor(index / 12);
  const monthNumber = (index % 12) + 1;
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
};

const buildMonthAxis = (startMonth: string, endMonth: string) => {
  const startIndex = monthToIndex(startMonth);
  const endIndex = monthToIndex(endMonth);
  if (startIndex == null || endIndex == null) return [];
  const lo = Math.min(startIndex, endIndex);
  const hi = Math.max(startIndex, endIndex);
  const axis: string[] = [];
  for (let index = lo; index <= hi; index += 1) axis.push(indexToMonth(index));
  return axis;
};

const average = (values: number[]) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
};

const getZeroRunStats = (activeFlags: boolean[]) => {
  let longestZeroRun = 0;
  let trailingZeroRun = 0;
  let currentRun = 0;

  activeFlags.forEach((isActive) => {
    if (isActive) {
      currentRun = 0;
      return;
    }
    currentRun += 1;
    longestZeroRun = Math.max(longestZeroRun, currentRun);
  });

  for (let index = activeFlags.length - 1; index >= 0; index -= 1) {
    if (activeFlags[index]) break;
    trailingZeroRun += 1;
  }

  return { longestZeroRun, trailingZeroRun };
};

const mergeParams = (overrides?: Partial<TrendV2Params>): TrendV2Params => ({
  ...defaultTrendV2Params,
  ...overrides,
  demandWeights: {
    ...defaultTrendV2Params.demandWeights,
    ...(overrides?.demandWeights ?? {})
  }
});

const deriveScopeBounds = (rows: readonly TrendV2MonthlyInput[], scopeStartMonth?: string, scopeEndMonth?: string) => {
  const rowMonthIndexes = rows
    .map((row) => ({ month: row.month, index: monthToIndex(row.month) }))
    .filter((row): row is { month: string; index: number } => row.index != null);
  const explicitStart = scopeStartMonth && isMonthKey(scopeStartMonth) ? scopeStartMonth : '';
  const explicitEnd = scopeEndMonth && isMonthKey(scopeEndMonth) ? scopeEndMonth : '';
  const inferredStart = rowMonthIndexes.length ? indexToMonth(Math.min(...rowMonthIndexes.map((row) => row.index))) : '';
  const inferredEnd = rowMonthIndexes.length ? indexToMonth(Math.max(...rowMonthIndexes.map((row) => row.index))) : '';
  const startMonth = explicitStart || inferredStart;
  const endMonth = explicitEnd || inferredEnd;
  if (!startMonth || !endMonth) return null;
  const startIndex = monthToIndex(startMonth);
  const endIndex = monthToIndex(endMonth);
  if (startIndex == null || endIndex == null) return null;
  if (startIndex <= endIndex) return { startMonth, endMonth };
  return { startMonth: endMonth, endMonth: startMonth };
};

const rowsMemo = new WeakMap<readonly TrendV2MonthlyInput[], Map<string, TrendV2ResultMap>>();

const sumValues = (points: PartPoint[], pick: (point: PartPoint) => number) => points.reduce((sum, point) => sum + pick(point), 0);

const toReasonNumbers = (reasons: TrendV2Reasons): TrendV2Reasons => ({
  ...reasons,
  activeShare: round(reasons.activeShare),
  recentRevenue: round(reasons.recentRevenue, 2),
  baselineRevenue: round(reasons.baselineRevenue, 2),
  recentAvgRevenue: round(reasons.recentAvgRevenue, 2),
  baselineAvgRevenue: round(reasons.baselineAvgRevenue, 2),
  recentOrders: round(reasons.recentOrders, 2),
  baselineOrders: round(reasons.baselineOrders, 2),
  recentAvgOrders: round(reasons.recentAvgOrders, 2),
  baselineAvgOrders: round(reasons.baselineAvgOrders, 2),
  recentDemand: round(reasons.recentDemand),
  baselineDemand: round(reasons.baselineDemand),
  momentum: round(reasons.momentum),
  slope: round(reasons.slope),
  recentActiveShare: round(reasons.recentActiveShare),
  maxMonthRevenueShare: round(reasons.maxMonthRevenueShare),
  recentRevenueShare: round(reasons.recentRevenueShare),
  maxMonthOrderShare: round(reasons.maxMonthOrderShare),
  recentOrderShare: round(reasons.recentOrderShare)
});

function computeForPart(partNum: string, series: PartPoint[], params: TrendV2Params, scopeStartMonth: string, scopeEndMonth: string): TrendV2Result {
  const scopeMonths = series.length;
  const nonZeroRevenues = series.map((point) => point.revenue).filter((value) => value > 0);
  const nonZeroOrders = series.map((point) => point.orders).filter((value) => value > 0);
  const revenueCap = nonZeroRevenues.length ? Math.max(median(nonZeroRevenues) * params.revenueCapMultiplier, median(nonZeroRevenues)) : 0;
  const orderCap = nonZeroOrders.length ? Math.max(median(nonZeroOrders) * params.orderCapMultiplier, median(nonZeroOrders)) : 0;
  const cappedRevenues = series.map((point) => revenueCap > 0 ? Math.min(point.revenue, revenueCap) : point.revenue);
  const cappedOrders = series.map((point) => orderCap > 0 ? Math.min(point.orders, orderCap) : point.orders);
  const maxCappedRevenue = Math.max(...cappedRevenues, 0);
  const maxCappedOrders = Math.max(...cappedOrders, 0);
  const activeFlags = series.map((point) => point.revenue > 0 || point.orders > 0);
  const { longestZeroRun, trailingZeroRun } = getZeroRunStats(activeFlags);

  const demandSeries = series.map((point, index) => {
    const presence = activeFlags[index] ? 1 : 0;
    const revenueScore = maxCappedRevenue > 0 ? Math.log1p(cappedRevenues[index]) / Math.log1p(maxCappedRevenue) : 0;
    const orderScore = maxCappedOrders > 0 ? Math.log1p(cappedOrders[index]) / Math.log1p(maxCappedOrders) : 0;
    return (params.demandWeights.presence * presence) + (params.demandWeights.revenue * revenueScore) + (params.demandWeights.orders * orderScore);
  });

  const activeMonths = activeFlags.filter(Boolean).length;
  const activeShare = scopeMonths === 0 ? 0 : activeMonths / scopeMonths;

  let recentWindowMonths = Math.min(params.recentWindowMonths, Math.max(1, scopeMonths));
  let baselineWindowMonths = Math.min(params.baselineWindowMonths, Math.max(0, scopeMonths - recentWindowMonths));
  if (baselineWindowMonths === 0 && scopeMonths >= 4) {
    recentWindowMonths = Math.max(2, Math.ceil(scopeMonths / 2));
    baselineWindowMonths = scopeMonths - recentWindowMonths;
  }

  const recentPoints = series.slice(-recentWindowMonths);
  const baselinePoints = baselineWindowMonths > 0 ? series.slice(-(recentWindowMonths + baselineWindowMonths), -recentWindowMonths) : [];
  const recentDemandValues = demandSeries.slice(-recentWindowMonths);
  const baselineDemandValues = baselineWindowMonths > 0 ? demandSeries.slice(-(recentWindowMonths + baselineWindowMonths), -recentWindowMonths) : [];

  const recentRevenue = sumValues(recentPoints, (point) => point.revenue);
  const baselineRevenue = sumValues(baselinePoints, (point) => point.revenue);
  const recentOrders = sumValues(recentPoints, (point) => point.orders);
  const baselineOrders = sumValues(baselinePoints, (point) => point.orders);
  const recentAvgRevenue = recentWindowMonths === 0 ? 0 : recentRevenue / recentWindowMonths;
  const baselineAvgRevenue = baselineWindowMonths === 0 ? 0 : baselineRevenue / baselineWindowMonths;
  const recentAvgOrders = recentWindowMonths === 0 ? 0 : recentOrders / recentWindowMonths;
  const baselineAvgOrders = baselineWindowMonths === 0 ? 0 : baselineOrders / baselineWindowMonths;
  const recentDemand = average(recentDemandValues);
  const baselineDemand = average(baselineDemandValues);

  const recentActiveMonths = recentPoints.filter((point) => point.revenue > 0 || point.orders > 0).length;
  const baselineActiveMonths = baselinePoints.filter((point) => point.revenue > 0 || point.orders > 0).length;
  const recentActiveShare = recentWindowMonths === 0 ? 0 : recentActiveMonths / recentWindowMonths;

  const totalRevenue = sumValues(series, (point) => point.revenue);
  const totalOrders = sumValues(series, (point) => point.orders);
  const maxMonthRevenue = Math.max(...series.map((point) => point.revenue), 0);
  const maxMonthOrders = Math.max(...series.map((point) => point.orders), 0);
  const maxMonthRevenueShare = totalRevenue > 0 ? maxMonthRevenue / totalRevenue : 0;
  const recentRevenueShare = totalRevenue > 0 ? recentRevenue / totalRevenue : 0;
  const maxMonthOrderShare = totalOrders > 0 ? maxMonthOrders / totalOrders : 0;
  const recentOrderShare = totalOrders > 0 ? recentOrders / totalOrders : 0;

  const scale = Math.max(params.minScale, recentDemand, baselineDemand, 0.25);
  const momentum = clamp((recentDemand - baselineDemand) / scale, -1, 1);

  const slopeWindowMonths = Math.min(params.slopeWindowMonths, Math.max(1, scopeMonths));
  const slopeSeries = demandSeries.slice(-slopeWindowMonths);
  const slopeEdge = Math.max(1, Math.floor(slopeSeries.length / 3));
  const slope = clamp((average(slopeSeries.slice(-slopeEdge)) - average(slopeSeries.slice(0, slopeEdge))) / Math.max(params.minScale, Math.max(...slopeSeries, 0.25)), -1, 1);
  const dormantLookback = Math.min(params.dormantLookbackMonths, scopeMonths);
  const dormantRecentActive = dormantLookback === 0
    ? 0
    : series.slice(-dormantLookback).filter((point) => point.revenue > 0 || point.orders > 0).length;
  const baselineWasMeaningful = baselineWindowMonths > 0 && (baselineDemand >= params.minScale || baselineActiveMonths > 1);
  const recentSignalStrong = recentDemand >= params.emergingMinRecentDemand || recentActiveShare >= 0.5;

  const dormant = totalRevenue > 0
    && activeMonths > params.oneOffMaxActiveMonths
    && trailingZeroRun >= dormantLookback
    && dormantRecentActive <= params.dormantRecentActiveMax;

  const oneOffSpike = activeMonths > 0
    && activeMonths <= params.oneOffMaxActiveMonths
    && maxMonthRevenueShare >= params.oneOffRevenueShareThreshold
    && recentRevenueShare >= params.oneOffRecentShareThreshold
    && (totalOrders === 0 || maxMonthOrderShare >= params.oneOffOrderShareThreshold || recentOrderShare >= params.oneOffRecentShareThreshold);

  const emergingBaselineQuiet = baselineWindowMonths === 0
    || (baselineActiveMonths <= params.emergingBaselineActiveMax && baselineDemand <= Math.max(params.minScale, recentDemand) * 0.45);

  const emerging = !dormant
    && !oneOffSpike
    && recentAvgRevenue >= params.emergingRecentMinRevenue
    && recentActiveMonths >= params.emergingRecentMinActiveMonths
    && recentSignalStrong
    && momentum >= params.emergingMinMomentum
    && (!baselineWasMeaningful || recentAvgRevenue >= Math.max(params.emergingRecentMinRevenue, baselineAvgRevenue * 1.2) || recentAvgOrders > baselineAvgOrders)
    && emergingBaselineQuiet;

  const growing = !dormant
    && !oneOffSpike
    && !emerging
    && momentum >= params.growthMomentumThreshold
    && slope >= params.growthMomentumThreshold * 0.2
    && recentActiveShare >= 0.45
    && recentSignalStrong;

  const declining = !dormant
    && !oneOffSpike
    && !emerging
    && baselineWasMeaningful
    && momentum <= params.declineMomentumThreshold
    && (slope <= params.declineMomentumThreshold * 0.1 || trailingZeroRun >= Math.max(2, dormantLookback - 1))
    && (recentAvgRevenue < baselineAvgRevenue || recentAvgOrders < baselineAvgOrders);

  const irregular = !dormant
    && !oneOffSpike
    && !emerging
    && !growing
    && !declining
    && activeMonths > 0
    && activeShare <= params.irregularActiveShareMax
    && recentActiveShare <= params.irregularRecentActiveShareMax
    && longestZeroRun >= params.irregularLongestGapMin
    && Math.abs(momentum) <= params.irregularNeutralMomentumMax
    && Math.abs(slope) <= params.irregularNeutralSlopeMax;

  const consistency = clamp(
    1 - (
      ((1 - recentActiveShare) * 0.45)
      + ((Math.max(0, maxMonthRevenueShare - 0.4)) * 0.7)
      + ((Math.max(0, maxMonthOrderShare - 0.45)) * 0.55)
      + ((longestZeroRun / Math.max(1, scopeMonths)) * 0.35)
    ),
    0,
    1
  );

  let trendScoreV2 = clamp(
    0.5
      + (0.34 * momentum)
      + (0.16 * slope)
      + (0.08 * (recentActiveShare - 0.5))
      + (0.08 * (consistency - 0.5)),
    0,
    1
  );

  if (emerging) trendScoreV2 = Math.max(trendScoreV2, 0.58 + (0.1 * clamp(momentum, 0, 1)));
  if (growing) trendScoreV2 = Math.max(trendScoreV2, 0.54 + (0.08 * clamp(momentum, 0, 1)));
  if (declining) trendScoreV2 = Math.min(trendScoreV2, 0.46 - (0.08 * clamp(Math.abs(momentum), 0, 1)));
  if (irregular) trendScoreV2 = clamp(trendScoreV2, 0.42, 0.56);
  if (oneOffSpike) trendScoreV2 = Math.min(trendScoreV2, 0.2);
  if (dormant) trendScoreV2 = Math.min(trendScoreV2, 0.08);

  let trendLabelV2: TrendV2Result['trendLabelV2'] = 'Stable';
  if (oneOffSpike) trendLabelV2 = 'OneOffSpike';
  else if (dormant) trendLabelV2 = 'Dormant';
  else if (emerging) trendLabelV2 = 'Emerging';
  else if (growing) trendLabelV2 = 'Growing';
  else if (declining) trendLabelV2 = 'Declining';
  else if (irregular) trendLabelV2 = 'Irregular';

  const coverageConfidence = clamp(scopeMonths / params.fullConfidenceMonths, 0, 1);
  const activityConfidence = clamp(activeMonths / params.fullConfidenceActiveMonths, 0, 1);
  const continuityConfidence = clamp(1 - (longestZeroRun / Math.max(1, scopeMonths)), 0, 1);
  const patternConfidence = clamp(
    1 - (
      ((1 - activeShare) * 0.28)
      + ((1 - recentActiveShare) * 0.22)
      + (Math.max(0, maxMonthRevenueShare - 0.45) * 0.55)
      + (Math.max(0, maxMonthOrderShare - 0.5) * 0.45)
    ),
    0,
    1
  );
  const historyConfidence = baselineWindowMonths > 0 ? clamp((baselineActiveMonths + recentActiveMonths) / Math.max(2, params.fullConfidenceActiveMonths), 0, 1) : clamp(0.25 + (0.35 * recentActiveShare), 0.2, 0.6);

  let trendConfidenceV2 = clamp(
    (0.28 * coverageConfidence)
    + (0.24 * activityConfidence)
    + (0.24 * patternConfidence)
    + (0.14 * continuityConfidence)
    + (0.1 * historyConfidence),
    0.05,
    0.99
  );

  if (trendLabelV2 === 'Irregular') trendConfidenceV2 = clamp(trendConfidenceV2 * 0.92, 0.05, 0.99);
  if (trendLabelV2 === 'Emerging') trendConfidenceV2 = clamp(trendConfidenceV2 * clamp(0.72 + (0.35 * clamp(momentum, 0, 1)), 0.65, 0.95), 0.05, 0.99);
  if (trendLabelV2 === 'Dormant') trendConfidenceV2 = clamp(trendConfidenceV2 * (trailingZeroRun >= dormantLookback ? 1 : 0.88), 0.05, 0.99);
  if (trendLabelV2 === 'OneOffSpike') trendConfidenceV2 = clamp(trendConfidenceV2 * 0.78, 0.05, 0.99);
  if (trendLabelV2 === 'Stable' && !baselineWasMeaningful) trendConfidenceV2 = clamp(trendConfidenceV2 * 0.78, 0.05, 0.99);

  const trendReasonsV2 = toReasonNumbers({
    scopeStartMonth,
    scopeEndMonth,
    scopeMonths,
    activeMonths,
    activeShare,
    recentWindowMonths,
    baselineWindowMonths,
    recentRevenue,
    baselineRevenue,
    recentAvgRevenue,
    baselineAvgRevenue,
    recentOrders,
    baselineOrders,
    recentAvgOrders,
    baselineAvgOrders,
    recentDemand,
    baselineDemand,
    momentum,
    slope,
    recentActiveMonths,
    baselineActiveMonths,
    recentActiveShare,
    longestZeroRun,
    trailingZeroRun,
    maxMonthRevenueShare,
    recentRevenueShare,
    maxMonthOrderShare,
    recentOrderShare,
    flags: {
      dormant,
      irregular,
      emerging,
      oneOffSpike
    }
  });

  return {
    partNum,
    trendScoreV2: round(trendScoreV2),
    trendLabelV2,
    trendConfidenceV2: round(trendConfidenceV2),
    trendReasonsV2
  };
}

export function computeTrendV2ForParts(timeSeries: readonly TrendV2MonthlyInput[], options: ComputeTrendV2Options = {}): TrendV2ResultMap {
  const params = mergeParams(options.params);
  const scope = deriveScopeBounds(timeSeries, options.scopeStartMonth, options.scopeEndMonth);
  if (!scope || timeSeries.length === 0) return {};

  // Trend v2 follows the app's cleaned demand model: negative credit lines are already excluded upstream.
  const cacheKey = `${scope.startMonth}|${scope.endMonth}|${JSON.stringify(params)}`;
  const cachedByRows = rowsMemo.get(timeSeries);
  if (cachedByRows?.has(cacheKey)) return cachedByRows.get(cacheKey) as TrendV2ResultMap;

  const monthAxis = buildMonthAxis(scope.startMonth, scope.endMonth);
  if (monthAxis.length === 0) return {};

  const grouped = new Map<string, Map<string, PartPoint>>();
  for (const row of timeSeries) {
    if (!row.partNum || !row.month) continue;
    if (!grouped.has(row.partNum)) grouped.set(row.partNum, new Map<string, PartPoint>());
    const partRows = grouped.get(row.partNum) as Map<string, PartPoint>;
    const current = partRows.get(row.month) ?? { month: row.month, revenue: 0, orders: 0 };
    current.revenue += Number(row.revenue ?? 0);
    current.orders += Number(row.orders ?? 0);
    partRows.set(row.month, current);
  }

  const results: TrendV2ResultMap = {};
  for (const [partNum, partRows] of grouped.entries()) {
    const series = monthAxis.map((month) => partRows.get(month) ?? { month, revenue: 0, orders: 0 });
    results[partNum] = computeForPart(partNum, series, params, scope.startMonth, scope.endMonth);
  }

  const nextCache = cachedByRows ?? new Map<string, TrendV2ResultMap>();
  nextCache.set(cacheKey, results);
  if (!cachedByRows) rowsMemo.set(timeSeries, nextCache);
  return results;
}
