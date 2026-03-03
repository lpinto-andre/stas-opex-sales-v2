import type { TrendV2Label, TrendV2Reasons } from '@/services/trendV2/types';

export const trendV2LabelOrder: TrendV2Label[] = [
  'Growing',
  'Stable',
  'Declining',
  'Emerging',
  'Irregular',
  'Dormant',
  'OneOffSpike'
];

export const formatTrendV2Label = (label: TrendV2Label) => label === 'OneOffSpike' ? 'One-off spike' : label;

export const formatTrendReasonsSummary = (reasons: TrendV2Reasons) => {
  const flags = [
    reasons.flags.emerging ? 'emerging pattern' : '',
    reasons.flags.irregular ? 'irregular cadence' : '',
    reasons.flags.dormant ? 'recent dormancy' : '',
    reasons.flags.oneOffSpike ? 'spike-dominated history' : ''
  ].filter(Boolean);

  const lines = [
    `Scope: ${reasons.scopeStartMonth} to ${reasons.scopeEndMonth} (${reasons.scopeMonths} months)`,
    `Active months: ${reasons.activeMonths} (${Math.round(reasons.activeShare * 100)}%)`,
    `Recent vs baseline avg revenue/month: ${reasons.recentAvgRevenue.toFixed(2)} vs ${reasons.baselineAvgRevenue.toFixed(2)}`,
    `Recent vs baseline avg orders/month: ${reasons.recentAvgOrders.toFixed(2)} vs ${reasons.baselineAvgOrders.toFixed(2)}`,
    `Recent vs baseline demand: ${reasons.recentDemand.toFixed(3)} vs ${reasons.baselineDemand.toFixed(3)}`,
    `Momentum: ${reasons.momentum.toFixed(3)} | Slope: ${reasons.slope.toFixed(3)}`,
    `Longest gap: ${reasons.longestZeroRun} months | Trailing gap: ${reasons.trailingZeroRun} months`,
    `Peak month share (rev/orders): ${(reasons.maxMonthRevenueShare * 100).toFixed(1)}% / ${(reasons.maxMonthOrderShare * 100).toFixed(1)}%`
  ];

  if (flags.length) lines.push(`Flags: ${flags.join(', ')}`);
  return lines.join('\n');
};
