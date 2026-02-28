import type { CSSProperties } from 'react';

export const cartesianAxisProps = {
  axisLine: { stroke: 'var(--border)' },
  tickLine: { stroke: 'var(--border)' },
  tick: { fill: 'var(--text)', fontSize: 12 }
};

export const chartTooltipProps: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    color: 'var(--text)',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.18)'
  },
  labelStyle: {
    color: 'var(--text)',
    fontWeight: 600
  },
  itemStyle: {
    color: 'var(--text)'
  }
};
