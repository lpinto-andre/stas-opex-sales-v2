import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCustomerOptions, getDistinctOptions, getPartYearMetrics, getPartsOrdersByFY, getPartsRevenueByFY, type Filters } from '@/data/queries';

type Option = { value: string; label: string };
type PeriodMode = 'all' | 'after' | 'before' | 'between';
type Weights = { revenue: number; orders: number; profit: number; margin: number; trend: number; active: number };

type ScoreRow = {
  rank: number;
  part_num: string;
  revenue: number;
  orders: number;
  profit: number;
  margin: number;
  revenue_score: number;
  orders_score: number;
  profit_score: number;
  margin_score: number;
  trend_score: number;
  active_score: number;
  final_score: number;
  [key: string]: number | string;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const score3 = (value: number) => value.toFixed(3);

const isValidMonth = (m: string) => /^\d{4}-\d{2}$/.test(m);
const safeMonthInput = (v: string) => (/^\d{0,4}(?:-\d{0,2})?$/.test(v) ? v : null);
const monthStart = (m: string) => (isValidMonth(m) ? `${m}-01` : '');
const monthEnd = (m: string) => {
  if (!isValidMonth(m)) return '';
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 0);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fyLabel = (fy: number) => `FY${String((fy - 1) % 100).padStart(2, '0')}-${String(fy % 100).padStart(2, '0')}`;

function MultiPick({ label, options, values, onChange }: { label: string; options: Option[]; values: string[]; onChange: (next: string[]) => void }) {
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return <div className="text-xs text-[var(--text-muted)]"><div className="mb-1">{label}</div><div className="card h-28 overflow-auto p-2 space-y-1">{options.map((o) => <label key={o.value} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} /><span className="text-xs">{o.label}</span></label>)}</div></div>;
}

export function TopItemsPage() {
  const [topN, setTopN] = useState(50);
  const [k, setK] = useState(2);
  const [m, setM] = useState(3);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [searchText, setSearchText] = useState('');

  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>([]);

  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [partOptions, setPartOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);

  const [weights, setWeights] = useState<Weights>({ revenue: 30, orders: 20, profit: 20, margin: 10, trend: 10, active: 10 });
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [fyColumns, setFyColumns] = useState<number[]>([]);

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
    if (periodMode === 'between') { f.startDate = monthStart(fromMonth) || undefined; f.endDate = monthEnd(toMonth) || undefined; }
    return f;
  }, [selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, searchText, periodMode, fromMonth, toMonth]);

  useEffect(() => {
    Promise.all([getPartYearMetrics(filters), getPartsRevenueByFY(filters), getPartsOrdersByFY(filters)]).then(([data, revFY, ordFY]) => {
      const byPart = new Map<string, { fy: number; revenue: number; orders: number; profit: number; margin: number }[]>();
      data.forEach((r) => {
        const arr = byPart.get(r.part_num) ?? [];
        arr.push({ fy: Number(r.invoice_fy), revenue: Number(r.revenue), orders: Number(r.orders), profit: Number(r.profit), margin: Number(r.margin) });
        byPart.set(r.part_num, arr);
      });
      const currentFY = Math.max(...data.map((d) => Number(d.invoice_fy || 0)), 0);
      const base = [...byPart.entries()].map(([part, years]) => {
        const getWindow = (start: number, len: number) => Array.from({ length: len }, (_, i) => start - i);
        const recentFys = getWindow(currentFY, k);
        const pastFys = getWindow(currentFY - k, m);
        const sumAt = (fys: number[], key: 'revenue' | 'orders') => fys.reduce((acc, fy) => acc + (years.find((y) => y.fy === fy)?.[key] ?? 0), 0);
        const recentRev = sumAt(recentFys, 'revenue') / Math.max(k, 1);
        const pastRev = sumAt(pastFys, 'revenue') / Math.max(m, 1);
        const recentOrd = sumAt(recentFys, 'orders') / Math.max(k, 1);
        const pastOrd = sumAt(pastFys, 'orders') / Math.max(m, 1);
        const ratio = (recent: number, past: number) => past === 0 && recent > 0 ? 1 : past > 0 && recent === 0 ? 0 : past === 0 ? 0 : clamp(recent / past, 0, 2) / 2;
        const trend = (ratio(recentRev, pastRev) + ratio(recentOrd, pastOrd)) / 2;
        const revenue = years.reduce((a, y) => a + y.revenue, 0);
        const orders = years.reduce((a, y) => a + y.orders, 0);
        const profit = years.reduce((a, y) => a + y.profit, 0);
        const margin = revenue ? profit / revenue : 0;
        const activeYears = years.filter((y) => y.revenue > 0).length;
        return { part_num: part, revenue, orders, profit, margin, trend_score: trend, active_years: activeYears };
      });

      const rankNorm = (arr: typeof base, key: keyof (typeof base)[number]) => {
        const sorted = [...arr].sort((a, b) => Number(b[key]) - Number(a[key]));
        const map = new Map<string, number>();
        sorted.forEach((row, i) => map.set(row.part_num, sorted.length === 1 ? 1 : 1 - i / (sorted.length - 1)));
        return map;
      };
      const nRevenue = rankNorm(base, 'revenue');
      const nOrders = rankNorm(base, 'orders');
      const nProfit = rankNorm(base, 'profit');
      const nMargin = rankNorm(base, 'margin');
      const nTrend = rankNorm(base, 'trend_score');
      const nActive = rankNorm(base, 'active_years');

      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
      const wn = {
        revenue: weights.revenue / totalWeight,
        orders: weights.orders / totalWeight,
        profit: weights.profit / totalWeight,
        margin: weights.margin / totalWeight,
        trend: weights.trend / totalWeight,
        active: weights.active / totalWeight
      };

      const rowsMap = new Map<string, ScoreRow>();
      base.forEach((r) => {
        const revenue_score = nRevenue.get(r.part_num) ?? 0;
        const orders_score = nOrders.get(r.part_num) ?? 0;
        const profit_score = nProfit.get(r.part_num) ?? 0;
        const margin_score = nMargin.get(r.part_num) ?? 0;
        const trend_score = nTrend.get(r.part_num) ?? 0;
        const active_score = nActive.get(r.part_num) ?? 0;
        const final_score = wn.revenue * revenue_score + wn.orders * orders_score + wn.profit * profit_score + wn.margin * margin_score + wn.trend * trend_score + wn.active * active_score;
        rowsMap.set(r.part_num, { rank: 0, part_num: r.part_num, revenue: r.revenue, orders: r.orders, profit: r.profit, margin: r.margin, revenue_score, orders_score, profit_score, margin_score, trend_score, active_score, final_score });
      });

      const yearsSet = new Set<number>();
      (revFY as Record<string, unknown>[]).forEach((r) => {
        const part = String(r.part_num ?? '');
        const fy = Number(r.fy ?? 0);
        if (!part || !fy || !rowsMap.has(part)) return;
        yearsSet.add(fy);
        rowsMap.get(part)![`revenue_fy_${fy}`] = Number(r.revenue ?? 0);
      });
      (ordFY as Record<string, unknown>[]).forEach((r) => {
        const part = String(r.part_num ?? '');
        const fy = Number(r.fy ?? 0);
        if (!part || !fy || !rowsMap.has(part)) return;
        yearsSet.add(fy);
        rowsMap.get(part)![`orders_fy_${fy}`] = Number(r.orders ?? 0);
      });

      const years = [...yearsSet].sort((a, b) => a - b);
      const sorted: ScoreRow[] = [...rowsMap.values()]
        .sort((a, b) => b.final_score - a.final_score)
        .slice(0, topN)
        .map((row, i) => ({ ...row, rank: i + 1 }));
      sorted.forEach((r) => years.forEach((fy) => { if (r[`revenue_fy_${fy}`] == null) r[`revenue_fy_${fy}`] = 0; if (r[`orders_fy_${fy}`] == null) r[`orders_fy_${fy}`] = 0; }));
      setFyColumns(years);
      setRows(sorted);
    });
  }, [filters, k, m, topN, weights]);

  const weightDesc: Record<keyof Weights, string> = {
    revenue: 'Higher revenue gets better rank contribution.',
    orders: 'Higher unique orders gets better rank contribution.',
    profit: 'Higher absolute profit gets better rank contribution.',
    margin: 'Higher profit rate (profit/revenue) gets better rank contribution.',
    trend: 'Rewards parts with stronger recent performance vs past window.',
    active: 'Rewards parts active across more fiscal years.'
  };

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

  return <div>
    <PageHeader title="Top Items Scoring Model" subtitle="Weighted deterministic model for top parts." actions={<div className="grid grid-cols-3 gap-2 items-end">
      <label className="text-xs text-[var(--text-muted)]">Items to show<input type="number" value={topN} onChange={(e) => setTopN(Number(e.target.value || 50))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Recent FY window (k)<input type="number" value={k} onChange={(e) => setK(Number(e.target.value || 2))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Past FY window (m)<input type="number" value={m} onChange={(e) => setM(Number(e.target.value || 3))} className="card w-full px-2 py-1 mt-1" /></label>
    </div>} />

    <section className="card p-3 mb-3">
      <h3 className="font-semibold mb-2">Filters</h3>
      <div className="grid lg:grid-cols-4 gap-3">
        <div className="space-y-2"><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} /></div>
        <div className="space-y-2"><input value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} placeholder="Search country" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} /></div>
        <div className="space-y-2"><input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search part" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} /></div>
        <div className="space-y-2"><input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search group" className="card w-full px-2 py-1 text-xs" /><MultiPick label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} /></div>
      </div>
      <div className="grid md:grid-cols-4 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        <label className="text-xs text-[var(--text-muted)]">Period<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card w-full px-2 py-1 mt-1"><option value="all">All</option><option value="after">After</option><option value="before">Before</option><option value="between">Between</option></select></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input type="text" value={fromMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setFromMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input type="text" value={toMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setToMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((c) => <button key={`${c.k}:${c.v}`} className="card px-2 py-1 text-xs" onClick={() => removeValue(c.k, c.v)}>{c.k}:{c.v} ×</button>)}</div>}
    </section>

    <section className="card p-3 mb-3">
      <h3 className="font-semibold mb-2">Weights (type values)</h3>
      <p className="text-xs text-[var(--text-muted)] mb-2">Values can be any positive numbers. We normalize internally so the total influence is balanced.</p>
      <div className="grid md:grid-cols-3 gap-2">
        {(Object.keys(weights) as (keyof Weights)[]).map((key) => <label key={key} className="text-xs text-[var(--text-muted)]">{key}
          <input type="number" min={0} step={1} value={weights[key]} onChange={(e) => setWeights((w) => ({ ...w, [key]: Math.max(0, Number(e.target.value || 0)) }))} className="card w-full px-2 py-1 mt-1" />
          <span className="block mt-1">{weightDesc[key]}</span>
        </label>)}
      </div>
    </section>

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0">
          <tr className="text-left border-b border-[var(--border)]">
            <th className="px-3 py-2">rank</th><th className="px-3 py-2">part_num</th><th className="px-3 py-2">revenue</th><th className="px-3 py-2">orders</th><th className="px-3 py-2">profit</th><th className="px-3 py-2">margin</th>
            <th className="px-3 py-2">revenue score</th><th className="px-3 py-2">orders score</th><th className="px-3 py-2">profit score</th><th className="px-3 py-2">margin score</th><th className="px-3 py-2">trend score</th><th className="px-3 py-2">active score</th><th className="px-3 py-2">final score</th>
            {fyColumns.map((fy) => <th key={`r-${fy}`} className="px-3 py-2">Revenue {fyLabel(fy)}</th>)}
            {fyColumns.map((fy) => <th key={`o-${fy}`} className="px-3 py-2">Orders {fyLabel(fy)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => <tr key={`${row.part_num}-${i}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
            <td className="px-3 py-2">{row.rank}</td><td className="px-3 py-2 whitespace-nowrap">{row.part_num}</td><td className="px-3 py-2">{currency(Number(row.revenue))}</td><td className="px-3 py-2">{Number(row.orders).toLocaleString()}</td><td className="px-3 py-2">{currency(Number(row.profit))}</td><td className="px-3 py-2">{pct(Number(row.margin))}</td>
            <td className="px-3 py-2">{score3(Number(row.revenue_score))}</td><td className="px-3 py-2">{score3(Number(row.orders_score))}</td><td className="px-3 py-2">{score3(Number(row.profit_score))}</td><td className="px-3 py-2">{score3(Number(row.margin_score))}</td><td className="px-3 py-2">{score3(Number(row.trend_score))}</td><td className="px-3 py-2">{score3(Number(row.active_score))}</td><td className="px-3 py-2">{score3(Number(row.final_score))}</td>
            {fyColumns.map((fy) => <td key={`rv-${i}-${fy}`} className="px-3 py-2">{currency(Number(row[`revenue_fy_${fy}`] ?? 0))}</td>)}
            {fyColumns.map((fy) => <td key={`ov-${i}-${fy}`} className="px-3 py-2">{Number(row[`orders_fy_${fy}`] ?? 0).toLocaleString()}</td>)}
          </tr>)}
        </tbody>
      </table>
    </section>
  </div>;
}
