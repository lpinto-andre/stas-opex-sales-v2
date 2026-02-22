export function FilterChipsBar({ chips, onRemove }: { chips: string[]; onRemove: (c: string)=>void }) {
  return <div className="flex flex-wrap gap-2 mb-4">{chips.map((c) => <button key={c} onClick={() => onRemove(c)} className="px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs">{c} ×</button>)}</div>;
}
