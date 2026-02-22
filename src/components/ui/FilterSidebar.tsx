import { useEffect, useState } from 'react';
import { getDistinctOptions } from '@/data/queries';
import { useAppStore } from '@/state/store';

const EMPTY: string[] = [];

function MultiFilter({ label, keyName, column }: { label: string; keyName: 'customers' | 'countries' | 'territories' | 'prodGroups' | 'classes' | 'parts'; column: string }) {
  const filters = useAppStore((s) => s.filters);
  const selected = (filters[keyName] as string[] | undefined) ?? EMPTY;
  const setFilters = useAppStore((s) => s.setFilters);
  const [options, setOptions] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getDistinctOptions(column, search, 80)
      .then((rows) => setOptions(rows.map((r) => r.value).filter(Boolean)))
      .catch(() => setOptions([]));
  }, [column, search]);

  return <div className="space-y-1">
    <label className="text-xs text-[var(--text-muted)]">{label}</label>
    <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs" placeholder="Search..." />
    <select multiple value={selected} onChange={(e) => setFilters({ [keyName]: Array.from(e.currentTarget.selectedOptions).map((o) => o.value) })} className="w-full h-24 bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>;
}

export function FilterSidebar() {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const reset = useAppStore((s) => s.resetFilters);

  return <aside className="card p-3 space-y-2">
    <h3 className="font-semibold text-sm">Filters</h3>
    <div className="grid grid-cols-2 gap-2">
      <input type="date" value={filters.startDate ?? ''} onChange={(e) => setFilters({ startDate: e.target.value || undefined })} className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs" />
      <input type="date" value={filters.endDate ?? ''} onChange={(e) => setFilters({ endDate: e.target.value || undefined })} className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs" />
    </div>
    <input value={filters.searchLineDesc ?? ''} onChange={(e) => setFilters({ searchLineDesc: e.target.value || undefined })} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs" placeholder="Search LineDesc" />
    <MultiFilter label="Customers" keyName="customers" column="cust_id" />
    <MultiFilter label="Countries" keyName="countries" column="country" />
    <MultiFilter label="Territories" keyName="territories" column="territory" />
    <MultiFilter label="Prod Groups" keyName="prodGroups" column="prod_group" />
    <MultiFilter label="Classes" keyName="classes" column="class_id" />
    <MultiFilter label="Parts" keyName="parts" column="part_num" />
    <button className="card px-3 py-1 text-xs" onClick={reset}>Reset All</button>
  </aside>;
}
