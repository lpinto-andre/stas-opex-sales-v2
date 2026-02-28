import type { ReactNode } from 'react';

type Props = {
  title: string;
  tip?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdvancedFiltersPanel({ title, tip, actions, children }: Props) {
  return <section className="card p-3 mb-4">
    <div className="flex items-start justify-between gap-3 mb-2">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {tip && <p className="text-xs text-[var(--text-muted)] mt-2">{tip}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>;
}
