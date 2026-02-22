import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCustomerOptions, getDistinctOptions, getPartYearMetrics, getPartsOrdersByFY, getPartsPriorityRows, getPartsRevenueByFY, type Filters } from '@/data/queries';

type Option = { value: string; label: string };
type PeriodMode = 'all' | 'after' | 'before' | 'between';
type RowLabel = 'Growing' | 'Stable' | 'Declining' | 'New' | 'Inactive';
type RankMetric = 'revenue' | 'orders' | 'profit' | 'margin' | 'revenue_ratio' | 'orders_ratio';
type SortDir = 'asc' | 'desc';

type DeclineRow = {
  label: RowLabel;
  cust_id: string;
  cust_name: string;
  country: string;
  part_num: string;
  line_desc_short: string;
  prod_group: string;
  revenue: number;
  orders: number;
  profit: number;
  margin: number;
  past_avg_rev: number;
  recent_avg_rev: number;
  past_avg_orders: number;
  recent_avg_orders: number;
  revenue_ratio: number;
  orders_ratio: number;
  [key: string]: number | string;
};

const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const score2 = (value: number) => value.toFixed(2);

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

const labelClasses: Record<RowLabel, string> = {
  Growing: 'bg-emerald-500/20 border-emerald-400 text-emerald-300',
  Stable: 'bg-sky-500/20 border-sky-300 text-sky-200',
  Declining: 'bg-red-500/20 border-red-400 text-red-300',
  New: 'bg-amber-500/20 border-amber-400 text-amber-300',
  Inactive: 'bg-white/10 border-white/50 text-white'
};

const labelOptions: Option[] = ['Growing', 'Stable', 'Declining', 'New', 'Inactive'].map((l) => ({ value: l, label: l }));

export function DeclinePage() {
  const [k, setK] = useState(2);
  const [m, setM] = useState(3);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');

  const [rankBy, setRankBy] = useState<RankMetric>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [minPastRevenue, setMinPastRevenue] = useState('');
  const [minPastOrders, setMinPastOrders] = useState('');
  const [maxRevRatio, setMaxRevRatio] = useState('');
  const [maxOrdRatio, setMaxOrdRatio] = useState('');
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND');

  const [searchText, setSearchText] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [partOptions, setPartOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);

  const [rows, setRows] = useState<DeclineRow[]>([]);
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
    if (periodMode === 'between') {
      f.startDate = monthStart(fromMonth) || undefined;
      f.endDate = monthEnd(toMonth) || undefined;
    }
    return f;
  }, [selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, searchText, periodMode, fromMonth, toMonth]);

  const minPastRevenueNum = minPastRevenue === '' ? null : Number(minPastRevenue);
  const minPastOrdersNum = minPastOrders === '' ? null : Number(minPastOrders);
  const maxRevRatioNum = maxRevRatio === '' ? null : Number(maxRevRatio);
  const maxOrdRatioNum = maxOrdRatio === '' ? null : Number(maxOrdRatio);

  useEffect(() => {
    Promise.all([getPartYearMetrics(filters), getPartsPriorityRows(filters, 6000), getPartsRevenueByFY(filters), getPartsOrdersByFY(filters)]).then(([data, partRows, revFY, ordFY]) => {
      const byPart = new Map<string, { fy: number; revenue: number; orders: number }[]>();
      data.forEach((r) => byPart.set(r.part_num, [...(byPart.get(r.part_num) ?? []), { fy: Number(r.invoice_fy), revenue: Number(r.revenue), orders: Number(r.orders) }]));

      const detailByPart = new Map<string, Pick<DeclineRow, 'cust_id' | 'cust_name' | 'country' | 'line_desc_short' | 'prod_group' | 'revenue' | 'orders' | 'profit' | 'margin'>>();
      (partRows as Record<string, unknown>[]).forEach((r) => {
        const part = String(r.part_num ?? '');
        if (!part || detailByPart.has(part)) return;
        const revenue = Number(r.revenue ?? 0);
        const profit = Number(r.profit ?? 0);
        detailByPart.set(part, {
          cust_id: String(r.cust_id ?? ''), cust_name: String(r.cust_name ?? ''), country: String(r.country ?? ''), line_desc_short: String(r.line_desc_short ?? ''), prod_group: String(r.prod_group ?? ''),
          revenue, orders: Number(r.orders ?? 0), profit, margin: revenue === 0 ? 0 : profit / revenue
        });
      });

      const currentFY = Math.max(...data.map((d) => Number(d.invoice_fy || 0)), 0);
      const mapped: DeclineRow[] = [...byPart.entries()].map(([part, years]) => {
        const avgWindow = (start: number, len: number, key: 'revenue' | 'orders') => {
          let sum = 0;
          for (let i = 0; i < len; i += 1) sum += years.find((y) => y.fy === start - i)?.[key] ?? 0;
          return sum / Math.max(len, 1);
        };
        const recentRev = avgWindow(currentFY, k, 'revenue');
        const pastRev = avgWindow(currentFY - k, m, 'revenue');
        const recentOrd = avgWindow(currentFY, k, 'orders');
        const pastOrd = avgWindow(currentFY - k, m, 'orders');
        const revenue_ratio = Number.isFinite(recentRev / (pastRev || 1)) ? (pastRev === 0 ? (recentRev > 0 ? 99 : 0) : recentRev / pastRev) : 99;
        const orders_ratio = Number.isFinite(recentOrd / (pastOrd || 1)) ? (pastOrd === 0 ? (recentOrd > 0 ? 99 : 0) : recentOrd / pastOrd) : 99;

        let label: RowLabel = 'Stable';
        if ((pastRev === 0 && recentRev > 0) || (pastOrd === 0 && recentOrd > 0)) label = 'New';
        else if ((recentRev === 0 && pastRev > 0) || (recentOrd === 0 && pastOrd > 0)) label = 'Inactive';
        else if (revenue_ratio > 1 || orders_ratio > 1) label = 'Growing';
        else if (maxRevRatioNum != null && maxOrdRatioNum != null && ((logic === 'AND' && revenue_ratio <= maxRevRatioNum && orders_ratio <= maxOrdRatioNum) || (logic === 'OR' && (revenue_ratio <= maxRevRatioNum || orders_ratio <= maxOrdRatioNum)))) label = 'Declining';

        const details = detailByPart.get(part);
        return { label, cust_id: details?.cust_id ?? '', cust_name: details?.cust_name ?? '', country: details?.country ?? '', part_num: part, line_desc_short: details?.line_desc_short ?? '', prod_group: details?.prod_group ?? '', revenue: details?.revenue ?? 0, orders: details?.orders ?? 0, profit: details?.profit ?? 0, margin: details?.margin ?? 0, past_avg_rev: pastRev, recent_avg_rev: recentRev, past_avg_orders: pastOrd, recent_avg_orders: recentOrd, revenue_ratio, orders_ratio };
      });

      const filtered = mapped.filter((row) => {
        const minCheck = (minPastRevenueNum == null || row.past_avg_rev >= minPastRevenueNum) && (minPastOrdersNum == null || row.past_avg_orders >= minPastOrdersNum);
        const ratioCheck = maxRevRatioNum == null && maxOrdRatioNum == null ? true : (maxRevRatioNum == null ? row.orders_ratio <= (maxOrdRatioNum ?? 0) : maxOrdRatioNum == null ? row.revenue_ratio <= (maxRevRatioNum ?? 0) : logic === 'AND' ? row.revenue_ratio <= maxRevRatioNum && row.orders_ratio <= maxOrdRatioNum : row.revenue_ratio <= maxRevRatioNum || row.orders_ratio <= maxOrdRatioNum);
        const labelCheck = selectedLabels.length === 0 || selectedLabels.includes(row.label);
        return minCheck && ratioCheck && labelCheck;
      });

      const rowsMap = new Map<string, DeclineRow>();
      filtered.forEach((row) => rowsMap.set(row.part_num, row));
      const yearsSet = new Set<number>();
      const addFyValue = (part: string, fy: number, key: string, value: number) => {
        const row = rowsMap.get(part);
        if (!row || !fy) return;
        yearsSet.add(fy);
        row[`${key}_${fy}`] = Number(row[`${key}_${fy}`] ?? 0) + value;
      };
      (revFY as Record<string, unknown>[]).forEach((r) => addFyValue(String(r.part_num ?? ''), Number(r.fy ?? 0), 'revenue_fy', Number(r.revenue ?? 0)));
      (ordFY as Record<string, unknown>[]).forEach((r) => addFyValue(String(r.part_num ?? ''), Number(r.fy ?? 0), 'orders_fy', Number(r.orders ?? 0)));

      const years = [...yearsSet].sort((a, b) => a - b);
      const dir = sortDir === 'asc' ? 1 : -1;
      const sorted: DeclineRow[] = [...rowsMap.values()].sort((a, b) => (Number(a[rankBy]) - Number(b[rankBy])) * dir);
      sorted.forEach((r) => years.forEach((fy) => { if (r[`revenue_fy_${fy}`] == null) r[`revenue_fy_${fy}`] = 0; if (r[`orders_fy_${fy}`] == null) r[`orders_fy_${fy}`] = 0; }));

      setRows(sorted);
      setFyColumns(years);
    });
  }, [filters, k, m, minPastRevenueNum, minPastOrdersNum, maxRevRatioNum, maxOrdRatioNum, logic, selectedLabels, rankBy, sortDir]);

  const chips = [...selectedCustomers.map((v) => ({ k: 'customers' as const, v })), ...selectedCountries.map((v) => ({ k: 'countries' as const, v })), ...selectedParts.map((v) => ({ k: 'parts' as const, v })), ...selectedProdGroups.map((v) => ({ k: 'prodGroups' as const, v })), ...selectedLabels.map((v) => ({ k: 'labels' as const, v }))];
  const removeValue = (kind: 'customers' | 'countries' | 'parts' | 'prodGroups' | 'labels', value: string) => {
    if (kind === 'customers') setSelectedCustomers((x) => x.filter((v) => v !== value));
    if (kind === 'countries') setSelectedCountries((x) => x.filter((v) => v !== value));
    if (kind === 'parts') setSelectedParts((x) => x.filter((v) => v !== value));
    if (kind === 'prodGroups') setSelectedProdGroups((x) => x.filter((v) => v !== value));
    if (kind === 'labels') setSelectedLabels((x) => x.filter((v) => v !== value));
  };

  return <div>
    <PageHeader title="Labels Model" subtitle="Classify parts as Declining/Stable/Growing/New/Inactive." actions={<div className="grid grid-cols-5 gap-2 items-end">
      <label className="text-xs text-[var(--text-muted)]">Rank by<select value={rankBy} onChange={(e) => setRankBy(e.target.value as RankMetric)} className="card w-full px-2 py-1 mt-1"><option value="revenue">Revenue</option><option value="orders">Orders</option><option value="profit">Profit</option><option value="margin">Profit %</option><option value="revenue_ratio">Revenue Ratio</option><option value="orders_ratio">Orders Ratio</option></select></label>
      <label className="text-xs text-[var(--text-muted)]">Order<select value={sortDir} onChange={(e) => setSortDir(e.target.value as SortDir)} className="card w-full px-2 py-1 mt-1"><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
      <label className="text-xs text-[var(--text-muted)]">Recent FY window (k)<input type="number" value={k} onChange={(e) => setK(Number(e.target.value || 2))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Past FY window (m)<input type="number" value={m} onChange={(e) => setM(Number(e.target.value || 3))} className="card w-full px-2 py-1 mt-1" /></label>
      <label className="text-xs text-[var(--text-muted)]">Period<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card px-2 py-1 block w-full mt-1"><option value="all">All</option><option value="after">After (month)</option><option value="before">Before (month)</option><option value="between">Between (months)</option></select></label>
    </div>} />

    <section className="card p-3 mb-3">
      <h3 className="font-semibold mb-2">Filters</h3>
      <div className="grid lg:grid-cols-5 gap-3">
        <div className="space-y-2"><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} /></div>
        <div className="space-y-2"><input value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} placeholder="Search country" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} /></div>
        <div className="space-y-2"><input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search part" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} /></div>
        <div className="space-y-2"><input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search group" className="card w-full px-2 py-1 text-xs" /><MultiPick label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} /></div>
        <div className="space-y-2"><MultiPick label="Labels" options={labelOptions} values={selectedLabels} onChange={setSelectedLabels} /></div>
      </div>
      <div className="grid md:grid-cols-4 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
      </div>
      <div className="grid md:grid-cols-4 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">Min Past Revenue<input type="number" value={minPastRevenue} onChange={(e) => setMinPastRevenue(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        <label className="text-xs text-[var(--text-muted)]">Min Past Orders<input type="number" value={minPastOrders} onChange={(e) => setMinPastOrders(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        <label className="text-xs text-[var(--text-muted)]">Max Revenue Ratio<input type="number" value={maxRevRatio} onChange={(e) => setMaxRevRatio(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        <label className="text-xs text-[var(--text-muted)]">Max Orders Ratio<input type="number" value={maxOrdRatio} onChange={(e) => setMaxOrdRatio(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
      </div>
      <div className="grid md:grid-cols-4 gap-2 mt-3">
        <button className="card px-3 py-2 self-end text-xs" onClick={() => { setMinPastRevenue(''); setMinPastOrders(''); setMaxRevRatio(''); setMaxOrdRatio(''); }}>Reset numeric filters</button>
        <label className="text-xs text-[var(--text-muted)]">Decline Logic<select value={logic} onChange={(e) => setLogic(e.target.value as 'AND' | 'OR')} className="card px-2 py-1 block w-full mt-1"><option>AND</option><option>OR</option></select></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={fromMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setFromMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input type="text" inputMode="numeric" placeholder="YYYY-MM" value={toMonth} onChange={(e) => { const next = safeMonthInput(e.target.value); if (next !== null) setToMonth(next); }} className="card w-full px-2 py-1 mt-1" /></label>}
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{chips.map((c) => <button key={`${c.k}:${c.v}`} className="card px-2 py-1 text-xs" onClick={() => removeValue(c.k, c.v)}>{c.k}:{c.v} ×</button>)}</div>}
    </section>

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]">
          <th className="px-3 py-2">Label</th><th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (25)</th><th className="px-3 py-2">ProdGroup</th>
          <th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Margin</th>
          <th className="px-3 py-2">Past Avg Rev</th><th className="px-3 py-2">Recent Avg Rev</th><th className="px-3 py-2">Past Avg Orders</th><th className="px-3 py-2">Recent Avg Orders</th><th className="px-3 py-2 bg-amber-500/15">Revenue Ratio</th><th className="px-3 py-2 bg-amber-500/15">Orders Ratio</th>
          {fyColumns.map((fy) => <th key={`r-${fy}`} className="px-3 py-2">Rev {fyLabel(fy)}</th>)}{fyColumns.map((fy) => <th key={`o-${fy}`} className="px-3 py-2">Ord {fyLabel(fy)}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row, i) => <tr key={`${row.part_num}-${i}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
            <td className="px-3 py-2 whitespace-nowrap"><span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${labelClasses[row.label as RowLabel]}`}>{row.label}</span></td>
            <td className="px-3 py-2 whitespace-nowrap">{row.cust_id}</td><td className="px-3 py-2 whitespace-normal break-words">{row.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{row.country}</td><td className="px-3 py-2 whitespace-nowrap">{row.part_num}</td><td className="px-3 py-2 whitespace-normal break-words">{row.line_desc_short}</td><td className="px-3 py-2 whitespace-nowrap">{row.prod_group}</td>
            <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue))}</td><td className="px-3 py-2 whitespace-nowrap">{Number(row.orders).toLocaleString()}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit))}</td><td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.margin))}</td>
            <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.past_avg_rev))}</td><td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.recent_avg_rev))}</td><td className="px-3 py-2 whitespace-nowrap">{score2(Number(row.past_avg_orders))}</td><td className="px-3 py-2 whitespace-nowrap">{score2(Number(row.recent_avg_orders))}</td><td className="px-3 py-2 whitespace-nowrap bg-amber-500/10 font-semibold">{score2(Number(row.revenue_ratio))}</td><td className="px-3 py-2 whitespace-nowrap bg-amber-500/10 font-semibold">{score2(Number(row.orders_ratio))}</td>
            {fyColumns.map((fy) => <td key={`rv-${i}-${fy}`} className="px-3 py-2 whitespace-nowrap">{currency(Number(row[`revenue_fy_${fy}`] ?? 0))}</td>)}{fyColumns.map((fy) => <td key={`ov-${i}-${fy}`} className="px-3 py-2 whitespace-nowrap">{Number(row[`orders_fy_${fy}`] ?? 0).toLocaleString()}</td>)}
          </tr>)}
        </tbody>
      </table>
    </section>
  </div>;
}
