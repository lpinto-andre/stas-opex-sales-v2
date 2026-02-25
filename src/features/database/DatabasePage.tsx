import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAppStore } from '@/state/store';
import { getCustomerOptions, getDistinctOptions, getPartsOrdersByFY, getPartsRevenueByFY, getPartsPriorityRows, type Filters } from '@/data/queries';

type Metric = 'revenue' | 'orders' | 'profit' | 'profit_pct';
type SortDir = 'desc' | 'asc';
type PeriodMode = 'all' | 'after' | 'before' | 'between';
type Option = { value: string; label: string };

type PartRow = {
  cust_id: string;
  cust_name: string;
  country: string;
  part_num: string;
  line_desc_short: string;
  prod_group: string;
  orders: number;
  revenue: number;
  profit: number;
  profit_pct: number;
  active_fy_count: number;
  [key: string]: string | number;
};

const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;

const isValidMonth = (m: string) => /^\d{4}-\d{2}$/.test(m);
const safeMonthInput = (v: string) => {
  if (/^\d{0,4}(?:-\d{0,2})?$/.test(v)) return v;
  return null;
};

const monthStart = (m: string) => (isValidMonth(m) ? `${m}-01` : '');
const monthEnd = (m: string) => {
  if (!isValidMonth(m)) return '';
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 0);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function MultiPick({ label, options, values, onChange }: { label: string; options: Option[]; values: string[]; onChange: (next: string[]) => void }) {
  const toggle = (value: string) => {
    if (values.includes(value)) onChange(values.filter((v) => v !== value));
    else onChange([...values, value]);
  };
  return <div className="text-xs text-[var(--text-muted)]">
    <div className="mb-1">{label}</div>
    <div className="card h-28 overflow-auto p-2 space-y-1">
      {options.map((o) => <label key={o.value} className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} />
        <span className="text-xs">{o.label}</span>
      </label>)}
      {options.length === 0 && <div className="text-[var(--text-muted)]">No options</div>}
    </div>
  </div>;
}

const fyLabel = (fy: number) => {
  const start = String((fy - 1) % 100).padStart(2, '0');
  const end = String(fy % 100).padStart(2, '0');
  return `FY${start}-${end}`;
};

export function DatabasePage() {
  const saved = useAppStore((s) => (s.pageState['database'] as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

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

  const customerSearchQ = useDebouncedValue(customerSearch, 250);
  const countrySearchQ = useDebouncedValue(countrySearch, 250);
  const partSearchQ = useDebouncedValue(partSearch, 250);
  const groupSearchQ = useDebouncedValue(groupSearch, 250);

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>((saved.selectedCountries as string[]) ?? []);
  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>((saved.selectedProdGroups as string[]) ?? []);

  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [partOptions, setPartOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);

  const [rows, setRows] = useState<PartRow[]>([]);
  const [fyColumns, setFyColumns] = useState<number[]>([]);

  useEffect(() => { getCustomerOptions(customerSearchQ, 150).then((r) => setCustomerOptions(r.map((x) => ({ value: x.value, label: x.label })))); }, [customerSearchQ]);
  useEffect(() => { getDistinctOptions('country', countrySearchQ, 150).then((r) => setCountryOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [countrySearchQ]);
  useEffect(() => { getDistinctOptions('part_num', partSearchQ, 150).then((r) => setPartOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [partSearchQ]);
  useEffect(() => { getDistinctOptions('prod_group', groupSearchQ, 150).then((r) => setGroupOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [groupSearchQ]);

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
    Promise.all([getPartsPriorityRows(filters, 2000), getPartsRevenueByFY(filters), getPartsOrdersByFY(filters)]).then(([base, revFy, ordFy]) => {
      const keyOf = (r: Record<string, unknown>) => `${r.cust_id}|${r.cust_name}|${r.country}|${r.part_num}|${r.line_desc_short}|${r.prod_group}`;
      const map = new Map<string, PartRow>();
      const yearsSet = new Set<number>();
      (base as Record<string, unknown>[]).forEach((r) => {
        const key = keyOf(r);
        map.set(key, {
          cust_id: String(r.cust_id ?? ''),
          cust_name: String(r.cust_name ?? ''),
          country: String(r.country ?? ''),
          part_num: String(r.part_num ?? ''),
          line_desc_short: String(r.line_desc_short ?? ''),
          prod_group: String(r.prod_group ?? ''),
          orders: Number(r.orders ?? 0),
          revenue: Number(r.revenue ?? 0),
          profit: Number(r.profit ?? 0),
          profit_pct: Number(r.profit_pct ?? 0),
          active_fy_count: 0
        });
      });
      (revFy as Record<string, unknown>[]).forEach((r) => {
        const key = keyOf(r);
        const fy = Number(r.fy ?? 0);
        if (!fy || !map.has(key)) return;
        yearsSet.add(fy);
        const row = map.get(key)!;
        row[`revenue_fy_${fy}`] = Number(r.revenue ?? 0);
      });
      (ordFy as Record<string, unknown>[]).forEach((r) => {
        const key = keyOf(r);
        const fy = Number(r.fy ?? 0);
        if (!fy || !map.has(key)) return;
        yearsSet.add(fy);
        const row = map.get(key)!;
        row[`orders_fy_${fy}`] = Number(r.orders ?? 0);
      });
      const years = [...yearsSet].sort((a, b) => a - b);
      map.forEach((row) => {
        row.active_fy_count = years.filter((fy) => Number(row[`revenue_fy_${fy}`] ?? 0) > 0).length;
        years.forEach((fy) => {
          if (row[`revenue_fy_${fy}`] == null) row[`revenue_fy_${fy}`] = 0;
          if (row[`orders_fy_${fy}`] == null) row[`orders_fy_${fy}`] = 0;
        });
      });
      const sorted = [...map.values()].sort((a, b) => {
        const va = Number(a[metric] ?? 0);
        const vb = Number(b[metric] ?? 0);
        return dir === 'desc' ? vb - va : va - vb;
      }).slice(0, topN);
      setFyColumns(years);
      setRows(sorted);
    });
  }, [filters, metric, dir, topN]);

  const removeValue = (kind: 'customers' | 'countries' | 'parts' | 'prodGroups', value: string) => {
    if (kind === 'customers') setSelectedCustomers((x) => x.filter((v) => v !== value));
    if (kind === 'countries') setSelectedCountries((x) => x.filter((v) => v !== value));
    if (kind === 'parts') setSelectedParts((x) => x.filter((v) => v !== value));
    if (kind === 'prodGroups') setSelectedProdGroups((x) => x.filter((v) => v !== value));
  };

  const chips = [
    ...selectedCustomers.map((v) => ({ k: 'customers' as const, v })),
    ...selectedCountries.map((v) => ({ k: 'countries' as const, v })),
    ...selectedParts.map((v) => ({ k: 'parts' as const, v })),
    ...selectedProdGroups.map((v) => ({ k: 'prodGroups' as const, v }))
  ];


  useEffect(() => {
    setPageState('database', { metric, dir, topN, periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups });
  }, [metric, dir, topN, periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, setPageState]);

  return <div>
    <PageHeader title="Database" subtitle="Full parts database with combinable Excel-style filters." actions={<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 items-end">
      <label className="text-xs text-[var(--text-muted)]">Rank by
        <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="card px-2 py-1 block w-full mt-1"><option value="revenue">Revenue</option><option value="orders">Orders</option><option value="profit">Profit</option><option value="profit_pct">Profit %</option></select>
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
        <thead className="bg-[var(--surface)] sticky top-0">
          <tr className="text-left border-b border-[var(--border)]">
            <th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (25)</th><th className="px-3 py-2">ProdGroup</th>
            <th className="px-3 py-2">Orders</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Profit %</th><th className="px-3 py-2">Active FY</th>
            {fyColumns.map((fy) => <th key={`rev-${fy}`} className="px-3 py-2">Rev {fyLabel(fy)}</th>)}
            {fyColumns.map((fy) => <th key={`ord-${fy}`} className="px-3 py-2">Ord {fyLabel(fy)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => <tr key={`${row.cust_id}|${row.part_num}|${idx}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
            <td className="px-3 py-2 whitespace-nowrap">{row.cust_id}</td><td className="px-3 py-2 whitespace-normal break-words">{row.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{row.country}</td><td className="px-3 py-2 whitespace-nowrap">{row.part_num}</td><td className="px-3 py-2 whitespace-normal break-words">{row.line_desc_short}</td><td className="px-3 py-2 whitespace-nowrap">{row.prod_group}</td>
            <td className="px-3 py-2 whitespace-nowrap">{Number(row.orders).toLocaleString()}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue))}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit))}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.profit_pct))}</td><td className="px-3 py-2 whitespace-nowrap">{row.active_fy_count}</td>
            {fyColumns.map((fy) => <td key={`r-${idx}-${fy}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`revenue_fy_${fy}`] ?? 0))}</td>)}
            {fyColumns.map((fy) => <td key={`o-${idx}-${fy}`} className="px-3 py-2 whitespace-nowrap">{Number(row[`orders_fy_${fy}`] ?? 0).toLocaleString()}</td>)}
          </tr>)}
        </tbody>
      </table>
    </section>
  </div>;
}
