import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppStore } from '@/state/store';
import { getCustomerOptions, getDistinctOptions, getRanking, type Filters } from '@/data/queries';

type Entity = 'customers' | 'prodgroup' | 'class' | 'country' | 'territory';
type Metric = 'revenue' | 'orders' | 'profit' | 'margin';
type SortDir = 'desc' | 'asc';
type PeriodMode = 'all' | 'after' | 'before' | 'between';
type Option = { value: string; label: string };

type RankingRow = { entity: string; revenue: number; orders: number; profit: number; margin: number; active_fy_count: number };

const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const isValidMonth = (m: string) => /^\d{4}-\d{2}$/.test(m);
const safeMonthInput = (v: string) => (/^\d{0,4}(?:-\d{0,2})?$/.test(v) ? v : null);
const monthStart = (m: string) => (isValidMonth(m) ? `${m}-01` : '');
const monthEnd = (m: string) => {
  if (!isValidMonth(m)) return '';
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 0);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function MultiPick({ label, options, values, onChange }: { label: string; options: Option[]; values: string[]; onChange: (next: string[]) => void }) {
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return <div className="text-xs text-[var(--text-muted)]"><div className="mb-1">{label}</div><div className="card h-28 overflow-auto p-2 space-y-1">{options.map((o) => <label key={o.value} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} /><span className="text-xs">{o.label}</span></label>)}</div></div>;
}

export function RankingsPage() {
  const saved = useAppStore((s) => (s.pageState['rankings'] as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

  const [entity, setEntity] = useState<Entity>((saved.entity as Entity) ?? 'customers');
  const [metric, setMetric] = useState<Metric>((saved.metric as Metric) ?? 'revenue');
  const [dir, setDir] = useState<SortDir>((saved.dir as SortDir) ?? 'desc');
  const [topN, setTopN] = useState(Number(saved.topN ?? 100));
  const [periodMode, setPeriodMode] = useState<PeriodMode>((saved.periodMode as PeriodMode) ?? 'all');
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));
  const [searchText, setSearchText] = useState(String(saved.searchText ?? ''));

  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>((saved.selectedCountries as string[]) ?? []);
  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>((saved.selectedProdGroups as string[]) ?? []);

  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [partOptions, setPartOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);

  const [rows, setRows] = useState<RankingRow[]>([]);

  useEffect(() => { getCustomerOptions(customerSearch, 150).then((r) => setCustomerOptions(r.map((x) => ({ value: x.value, label: x.label })))); }, [customerSearch]);
  useEffect(() => { getDistinctOptions('country', countrySearch, 150).then((r) => setCountryOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [countrySearch]);
  useEffect(() => { getDistinctOptions('part_num', partSearch, 150).then((r) => setPartOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [partSearch]);
  useEffect(() => { getDistinctOptions('prod_group', groupSearch, 150).then((r) => setGroupOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [groupSearch]);

  const filters = useMemo<Filters>(() => {
    const f: Filters = {
      customers: selectedCustomers.length ? selectedCustomers : undefined,
      countries: selectedCountries.length ? selectedCountries : undefined,
      parts: selectedParts.length ? selectedParts : undefined,
      prodGroups: selectedProdGroups.length ? selectedProdGroups : undefined,
      searchLineDesc: searchText || undefined
    };
    if (periodMode === 'after') f.startDate = monthStart(fromMonth) || undefined;
    if (periodMode === 'before') f.endDate = monthEnd(toMonth) || undefined;
    if (periodMode === 'between') {
      f.startDate = monthStart(fromMonth) || undefined;
      f.endDate = monthEnd(toMonth) || undefined;
    }
    return f;
  }, [selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, searchText, periodMode, fromMonth, toMonth]);

  useEffect(() => {
    getRanking(filters, entity, metric, 2500).then((r) => {
      const sorted = [...(r as RankingRow[])].sort((a, b) => {
        const va = Number(a[metric]);
        const vb = Number(b[metric]);
        return dir === 'desc' ? vb - va : va - vb;
      }).slice(0, topN);
      setRows(sorted);
    });
  }, [filters, entity, metric, dir, topN]);

  const chips = [
    ...selectedCustomers.map((v) => ({ k: 'customers' as const, v })),
    ...selectedCountries.map((v) => ({ k: 'countries' as const, v })),
    ...selectedParts.map((v) => ({ k: 'parts' as const, v })),
    ...selectedProdGroups.map((v) => ({ k: 'prodGroups' as const, v }))
  ];

  const removeValue = (kind: 'customers' | 'countries' | 'parts' | 'prodGroups', value: string) => {
    if (kind === 'customers') setSelectedCustomers((x) => x.filter((v) => v !== value));
    if (kind === 'countries') setSelectedCountries((x) => x.filter((v) => v !== value));
    if (kind === 'parts') setSelectedParts((x) => x.filter((v) => v !== value));
    if (kind === 'prodGroups') setSelectedProdGroups((x) => x.filter((v) => v !== value));
  };


  useEffect(() => {
    setPageState('rankings', { entity, metric, dir, topN, periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups });
  }, [entity, metric, dir, topN, periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, setPageState]);

  return <div>
    <PageHeader title="Group By" subtitle="Leaderboard by selected business dimension." actions={<div className="grid grid-cols-5 gap-2 items-end">
      <label className="text-xs text-[var(--text-muted)]">Group by
        <select value={entity} onChange={(e) => setEntity(e.target.value as Entity)} className="card px-2 py-1 block w-full mt-1"><option value="customers">Customers</option><option value="prodgroup">ProdGroup</option><option value="class">Class</option><option value="country">Country</option><option value="territory">Territory</option></select>
      </label>
      <label className="text-xs text-[var(--text-muted)]">Rank by
        <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="card px-2 py-1 block w-full mt-1"><option value="revenue">Revenue</option><option value="orders">Orders</option><option value="profit">Profit</option><option value="margin">Profit %</option></select>
      </label>
      <label className="text-xs text-[var(--text-muted)]">Order
        <select value={dir} onChange={(e) => setDir(e.target.value as SortDir)} className="card px-2 py-1 block w-full mt-1"><option value="desc">Descending</option><option value="asc">Ascending</option></select>
      </label>
      <label className="text-xs text-[var(--text-muted)]">Items to show
        <input type="number" value={topN} min={1} onChange={(e) => setTopN(Number(e.target.value || 100))} className="card w-full px-2 py-1 mt-1" />
      </label>
      <label className="text-xs text-[var(--text-muted)]">Period
        <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card px-2 py-1 block w-full mt-1"><option value="all">All</option><option value="after">After (month)</option><option value="before">Before (month)</option><option value="between">Between (months)</option></select>
      </label>
    </div>} />

    <section className="card p-3 mb-3">
      <h3 className="font-semibold mb-2">Filters</h3>
      <p className="text-xs text-[var(--text-muted)] mb-2">Tip: tick multiple values in each filter to combine selections freely.</p>
      <div className="grid lg:grid-cols-4 gap-3">
        <div className="space-y-2"><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} /></div>
        <div className="space-y-2"><input value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} placeholder="Search country" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} /></div>
        <div className="space-y-2"><input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search part" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} /></div>
        <div className="space-y-2"><input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search group" className="card w-full px-2 py-1 text-xs" /><MultiPick label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} /></div>
      </div>
      <div className="grid md:grid-cols-4 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={fromMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setFromMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={toMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setToMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((c) => <button key={`${c.k}:${c.v}`} className="card px-2 py-1 text-xs" onClick={() => removeValue(c.k, c.v)}>{c.k}:{c.v} ×</button>)}</div>}
    </section>

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]"><th className="px-3 py-2">#</th><th className="px-3 py-2">Entity</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Margin</th><th className="px-3 py-2">Active FY</th></tr></thead>
        <tbody>{rows.map((row, idx) => <tr key={`${row.entity}-${idx}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
          <td className="px-3 py-2 whitespace-nowrap">{idx + 1}</td><td className="px-3 py-2 whitespace-normal break-words leading-5">{row.entity}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue ?? 0))}</td><td className="px-3 py-2 whitespace-nowrap">{Number(row.orders ?? 0).toLocaleString()}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit ?? 0))}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.margin ?? 0))}</td><td className="px-3 py-2 whitespace-nowrap">{Number(row.active_fy_count ?? 0)}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </div>;
}
