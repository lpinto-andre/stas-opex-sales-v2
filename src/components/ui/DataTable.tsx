import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '@/state/store';

function formatValue(value: unknown, key: string, lang: 'fr' | 'en', currency: 'USD' | 'CAD') {
  if (value == null) return '';
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  if (typeof value === 'number' && (key.includes('amount') || key.includes('revenue') || key.includes('profit') || key.includes('cost'))) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  }
  if (typeof value === 'number' && key.includes('margin')) return `${(value * 100).toFixed(2)}%`;
  return String(value);
}

export function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const cols = useMemo(() => Object.keys(rows[0] ?? {}), [rows]);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const uiLang = useAppStore((s) => s.uiLang);
  const uiCurrency = useAppStore((s) => s.uiCurrency);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort]);

  const rowVirtualizer = useVirtualizer({ count: sortedRows.length, getScrollElement: () => parentRef.current, estimateSize: () => 36, overscan: 12 });

  return <div className="card overflow-hidden">
    <div className="grid sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)]" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(120px, 1fr))` }}>
      {cols.map((c) => <button key={c} onClick={() => setSort((s) => !s || s.key !== c ? { key: c, dir: 'asc' } : { key: c, dir: s.dir === 'asc' ? 'desc' : 'asc' })} className="text-left px-2 py-2 text-xs font-semibold hover:text-[var(--teal)]">{c}</button>)}
    </div>
    <div ref={parentRef} className="h-[420px] overflow-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((v) => <div key={v.key} className="absolute top-0 left-0 right-0 hover:bg-[var(--surface)]/70" style={{ transform: `translateY(${v.start}px)` }}>
          <div className="grid border-b border-[var(--border)]" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(120px, 1fr))` }}>
            {cols.map((c) => <div key={c} className="px-2 py-2 text-xs">{formatValue(sortedRows[v.index]?.[c], c, uiLang, uiCurrency)}</div>)}
          </div>
        </div>)}
      </div>
    </div>
  </div>;
}
