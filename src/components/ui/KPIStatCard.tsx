export function KPIStatCard({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><div className="text-xs text-[var(--text-muted)]">{label}</div><div className="text-2xl font-bold">{value}</div></div>;
}
