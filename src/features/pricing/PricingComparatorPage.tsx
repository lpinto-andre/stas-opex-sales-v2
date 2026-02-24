import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCustomerOptions, getDistinctOptions, getRevenueCostProfitOverTime, type Filters } from '@/data/queries';
import { useAppStore } from '@/state/store';

type CompareBy = 'country' | 'customer' | 'part_num' | 'prod_group';
type Option = { value: string; label: string };

const COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#06b6d4'];
const currency = (v: number) => `$${Math.round(v).toLocaleString()}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const isValidMonth = (m: string) => /^\d{4}-\d{2}$/.test(m);
const monthStart = (m: string) => (isValidMonth(m) ? `${m}-01` : '');
const monthEnd = (m: string) => {
  if (!isValidMonth(m)) return '';
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 0);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function MultiPick({ options, values, onChange }: { options: Option[]; values: string[]; onChange: (next: string[]) => void }) {
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((v) => v !== value) : values.length >= 5 ? values : [...values, value]);
  return <div className="card h-40 overflow-auto p-2 space-y-1">{options.map((o) => <label key={o.value} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} /><span className="truncate">{o.label}</span></label>)}</div>;
}

const applyCompareFilter = (filters: Filters, by: CompareBy, value: string): Filters => {
  if (by === 'country') return { ...filters, countries: [value] };
  if (by === 'customer') return { ...filters, customers: [value] };
  if (by === 'part_num') return { ...filters, parts: [value] };
  return { ...filters, prodGroups: [value] };
};

export function PricingComparatorPage() {
  const saved = useAppStore((s) => (s.pageState.pricing as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

  const [compareBy, setCompareBy] = useState<CompareBy>((saved.comparatorCompareBy as CompareBy) ?? 'part_num');
  const [lookup, setLookup] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedValues, setSelectedValues] = useState<string[]>((saved.comparatorSelectedValues as string[]) ?? []);
  const [tableRows, setTableRows] = useState<Record<string, string | number>[]>([]);

  const baseFilters = useMemo<Filters>(() => {
    const f: Filters = {
      customers: (saved.selectedCustomers as string[])?.length ? (saved.selectedCustomers as string[]) : undefined,
      countries: (saved.selectedCountries as string[])?.length ? (saved.selectedCountries as string[]) : undefined,
      territories: (saved.selectedTerritories as string[])?.length ? (saved.selectedTerritories as string[]) : undefined,
      parts: (saved.selectedParts as string[])?.length ? (saved.selectedParts as string[]) : undefined,
      prodGroups: (saved.selectedProdGroups as string[])?.length ? (saved.selectedProdGroups as string[]) : undefined,
      classes: (saved.selectedClasses as string[])?.length ? (saved.selectedClasses as string[]) : undefined,
      searchLineDesc: String(saved.searchText ?? '') || undefined
    };
    const mode = String(saved.periodMode ?? 'all');
    const fromMonth = String(saved.fromMonth ?? '');
    const toMonth = String(saved.toMonth ?? '');
    if (mode === 'after') f.startDate = monthStart(fromMonth) || undefined;
    if (mode === 'before') f.endDate = monthEnd(toMonth) || undefined;
    if (mode === 'between') { f.startDate = monthStart(fromMonth) || undefined; f.endDate = monthEnd(toMonth) || undefined; }
    return f;
  }, [saved]);

  useEffect(() => {
    setSelectedValues([]);
    setLookup('');
  }, [compareBy]);

  useEffect(() => {
    if (compareBy === 'customer') {
      getCustomerOptions(lookup, 120).then((rows) => setOptions(rows.map((r) => ({ value: r.value, label: r.label }))));
      return;
    }
    const column = compareBy === 'country' ? 'country' : compareBy === 'part_num' ? 'part_num' : 'prod_group';
    getDistinctOptions(column, lookup, 120).then((rows) => setOptions(rows.map((r) => ({ value: r.value, label: r.value }))));
  }, [compareBy, lookup]);

  useEffect(() => {
    if (!selectedValues.length) {
      setTableRows([]);
      return;
    }
    Promise.all(selectedValues.map(async (value) => ({ value, rows: await getRevenueCostProfitOverTime(applyCompareFilter(baseFilters, compareBy, value), true, 'monthly') }))).then((seriesData) => {
      const byPeriod = new Map<string, Record<string, string | number>>();
      seriesData.forEach(({ value, rows }) => {
        (rows as Record<string, unknown>[]).forEach((r) => {
          const period = String(r.period ?? '');
          if (!period) return;
          if (!byPeriod.has(period)) byPeriod.set(period, { period });
          byPeriod.get(period)![`${value}__revenue`] = Number(r.revenue ?? 0);
          byPeriod.get(period)![`${value}__cost`] = Number(r.cost ?? 0);
          byPeriod.get(period)![`${value}__profit`] = Number(r.profit ?? 0);
          byPeriod.get(period)![`${value}__margin_pct`] = Number(r.margin_pct ?? 0);
        });
      });
      setTableRows([...byPeriod.values()].sort((a, b) => String(a.period).localeCompare(String(b.period))));
    });
  }, [baseFilters, compareBy, selectedValues]);

  useEffect(() => {
    setPageState('pricing', { ...saved, comparatorCompareBy: compareBy, comparatorSelectedValues: selectedValues });
  }, [compareBy, selectedValues, saved, setPageState]);

  const chartData = tableRows;

  const renderMetricChart = (metric: 'revenue' | 'cost' | 'profit' | 'margin_pct', title: string, formatter: (v: number) => string) => (
    <section className="card p-3 h-[22rem] mb-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <XAxis dataKey="period" />
          <YAxis />
          <Tooltip shared formatter={(v) => formatter(Number(v))} />
          {selectedValues.map((value, i) => <Line key={`${value}-${metric}`} type="monotone" dataKey={`${value}__${metric}`} name={value} stroke={COLORS[i % COLORS.length]} dot={false} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </section>
  );

  return <div>
    <PageHeader title="Pricing Comparator" subtitle="Compare up to 5 values by country, customer, part number, or product group." actions={<Link to="/pricing" className="card px-3 py-2">Back to Pricing</Link>} />

    <section className="card p-3 mb-4">
      <div className="grid md:grid-cols-3 gap-3">
        <label className="text-xs text-[var(--text-muted)]">Compare by
          <select value={compareBy} onChange={(e) => setCompareBy(e.target.value as CompareBy)} className="card w-full px-2 py-1 mt-1">
            <option value="country">Country</option>
            <option value="customer">Customer</option>
            <option value="part_num">Part Number</option>
            <option value="prod_group">ProdGroups</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)] md:col-span-2">Lookup {compareBy}
          <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Type to search" className="card w-full px-2 py-1 mt-1" />
        </label>
      </div>
      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1">Available values</div>
          <MultiPick options={options} values={selectedValues} onChange={setSelectedValues} />
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1">Selected filters (max 5)</div>
          <div className="card p-2 min-h-16 flex flex-wrap gap-2">{selectedValues.length ? selectedValues.map((v) => <button key={v} className="card px-2 py-1 text-xs" onClick={() => setSelectedValues((prev) => prev.filter((x) => x !== v))}>{v} ×</button>) : <span className="text-xs text-[var(--text-muted)]">No values selected yet.</span>}</div>
        </div>
      </div>
    </section>

    {renderMetricChart('revenue', 'Revenue vs. Time', currency)}
    {renderMetricChart('cost', 'Cost vs. Time', currency)}
    {renderMetricChart('profit', 'Profit vs. Time', currency)}
    {renderMetricChart('margin_pct', 'Margin % vs. Time', pct)}

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]"><th className="px-3 py-2">Month</th>{selectedValues.map((value) => <th key={`r-${value}`} className="px-3 py-2">{value} Revenue</th>)}{selectedValues.map((value) => <th key={`c-${value}`} className="px-3 py-2">{value} Cost</th>)}{selectedValues.map((value) => <th key={`p-${value}`} className="px-3 py-2">{value} Profit</th>)}{selectedValues.map((value) => <th key={`m-${value}`} className="px-3 py-2">{value} Margin %</th>)}</tr></thead>
        <tbody>{tableRows.map((row) => <tr key={String(row.period)} className="border-b border-[var(--border)]"><td className="px-3 py-2 whitespace-nowrap">{row.period}</td>{selectedValues.map((value) => <td key={`rv-${row.period}-${value}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`${value}__revenue`] ?? 0))}</td>)}{selectedValues.map((value) => <td key={`cv-${row.period}-${value}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`${value}__cost`] ?? 0))}</td>)}{selectedValues.map((value) => <td key={`pv-${row.period}-${value}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`${value}__profit`] ?? 0))}</td>)}{selectedValues.map((value) => <td key={`mv-${row.period}-${value}`} className="px-3 py-2 whitespace-nowrap">{pct(Number(row[`${value}__margin_pct`] ?? 0))}</td>)}</tr>)}</tbody>
      </table>
    </section>
  </div>;
}
