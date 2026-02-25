import type { ReactNode } from 'react';

type Props = {
  title: string;
  tip?: string;
  children: ReactNode;
};

export function AdvancedFiltersPanel({ title, tip, children }: Props) {
  return <section className="card p-3 mb-4">
    <h3 className="font-semibold mb-2">{title}</h3>
    {tip && <p className="text-xs text-[var(--text-muted)] mb-2">{tip}</p>}
    {children}
  </section>;
}
