export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return <div className="flex items-start justify-between mb-4"><div><h1 className="text-2xl font-semibold">{title}</h1><p className="text-[var(--text-muted)]">{subtitle}</p></div><div>{actions}</div></div>;
}
