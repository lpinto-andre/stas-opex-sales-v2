import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const cols = useMemo(() => Object.keys(rows[0] ?? {}), [rows]);
  const rowVirtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 34 });
  return <div ref={parentRef} className="card h-[420px] overflow-auto"><div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
    {rowVirtualizer.getVirtualItems().map((v) => <div key={v.key} style={{ transform: `translateY(${v.start}px)` }} className="absolute top-0 left-0 right-0 grid" >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(140px, 1fr))` }}>{cols.map((c) => <div key={c} className="px-2 py-1 text-xs border-b border-[var(--border)]">{String(rows[v.index]?.[c] ?? '')}</div>)}</div>
    </div>)}
  </div></div>;
}
