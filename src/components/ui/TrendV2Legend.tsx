import { useState, type KeyboardEvent } from 'react';
import { formatTrendV2Label, trendV2LabelOrder, type TrendV2Label } from '@/services/trendV2';

type TrendV2LegendProps = {
  className?: string;
  title?: string;
  subtitle?: string;
  defaultCollapsed?: boolean;
};

type TrendV2LegendItem = {
  description: string;
};

export const trendV2LabelBadgeClasses: Record<TrendV2Label, string> = {
  Growing: 'bg-emerald-500/20 border-emerald-400 text-emerald-200',
  Stable: 'bg-sky-500/20 border-sky-300 text-sky-100',
  Declining: 'bg-red-500/20 border-red-400 text-red-200',
  Emerging: 'bg-cyan-500/20 border-cyan-300 text-cyan-100',
  Irregular: 'bg-amber-500/20 border-amber-300 text-amber-100',
  Dormant: 'bg-slate-500/20 border-slate-300 text-slate-100',
  OneOffSpike: 'bg-fuchsia-500/20 border-fuchsia-300 text-fuchsia-100'
};

const trendV2LegendItems: Record<TrendV2Label, TrendV2LegendItem> = {
  Growing: {
    description: 'Recent demand is rising with steady activity across the selected period.'
  },
  Stable: {
    description: 'Demand is consistent overall, without a clear acceleration or drop.'
  },
  Declining: {
    description: 'Recent demand is softer than the earlier baseline, signaling a slowdown.'
  },
  Emerging: {
    description: 'Demand has started showing up recently after a mostly quiet earlier period.'
  },
  Irregular: {
    description: 'Demand has real gaps, but no stronger directional signal is dominating the pattern.'
  },
  Dormant: {
    description: 'The part had activity before, but there has been no recent demand.'
  },
  OneOffSpike: {
    description: 'Most of the history is quiet, with one concentrated spike driving the total.'
  }
};

export function TrendV2Legend({
  className = '',
  title = 'Trend v2 legend',
  subtitle = 'Quick reference for what each label means in the current filter scope.',
  defaultCollapsed = false
}: TrendV2LegendProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const classes = ['card p-3', className].filter(Boolean).join(' ');
  const toggleCollapsed = () => setCollapsed((current) => !current);
  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleCollapsed();
    }
  };

  return <section className={classes}>
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      className="flex items-start justify-between gap-3 cursor-pointer"
      onClick={toggleCollapsed}
      onKeyDown={handleHeaderKeyDown}
    >
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
      </div>
      <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <button type="button" className="card px-3 py-1 text-xs" onClick={toggleCollapsed}>
          {collapsed ? 'Show legend' : 'Hide legend'}
        </button>
      </div>
    </div>
    {!collapsed && <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {trendV2LabelOrder.map((label) => <div
        key={label}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-3 py-2"
      >
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${trendV2LabelBadgeClasses[label]}`}>
          {formatTrendV2Label(label)}
        </span>
        <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{trendV2LegendItems[label].description}</p>
      </div>)}
    </div>}
  </section>;
}
