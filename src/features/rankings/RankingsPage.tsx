import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCustomerOptions, getDistinctOptions, getPartsPriorityRows, getRanking, type Filters } from '@/data/queries';

type Entity = 'parts' | 'customers' | 'prodgroup' | 'class' | 'country' | 'territory';
type Metric = 'revenue' | 'orders' | 'profit' | 'margin';
type PeriodMode = 'all' | 'after' | 'before' | 'between';

type RankingRow = { entity: string; revenue: number; orders: number; profit: number; margin: number; active_fy_count: number };

type Option = { value: string; label: string };

const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;

function MultiSelect({ label, options, values, onChange }: { label: string; options: Option[]; values: string[]; onChange: (v: string[]) => void }) {
  return <label className="text-xs text-[var(--text-muted)]">{label}
    <select multiple value={values} onChange={(e) => onChange(Array.from(e.currentTarget.selectedOptions).map((o) => o.value))} className="card w-full h-24 px-2 py-1 mt-1">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>;
}

export function RankingsPage() {
  const [entity, setEntity] = useState<Entity>('parts');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [topN, setTopN] = useState(50);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchText, setSearchText] = useState('');

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>([]);

  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [partOptions, setPartOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);

  const [rows, setRows] = useState<RankingRow[]>([]);
  const [partsRows, setPartsRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => { getCustomerOptions(customerSearch, 120).then((r) => setCustomerOptions(r.map((x) => ({ value: x.value, label: x.label })))); }, [customerSearch]);
  useEffect(() => { getDistinctOptions('country', countrySearch, 120).then((r) => setCountryOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [countrySearch]);
  useEffect(() => { getDistinctOptions('part_num', partSearch, 120).then((r) => setPartOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [partSearch]);
  useEffect(() => { getDistinctOptions('prod_group', groupSearch, 120).then((r) => setGroupOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [groupSearch]);

  const rankingFilters = useMemo<Filters>(() => {
    const f: Filters = {
      customers: selectedCustomers.length ? selectedCustomers : undefined,
      countries: selectedCountries.length ? selectedCountries : undefined,
      parts: selectedParts.length ? selectedParts : undefined,
      prodGroups: selectedProdGroups.length ? selectedProdGroups : undefined,
      searchLineDesc: searchText || undefined
    };
    if (periodMode === 'after') f.startDate = fromDate || undefined;
    if (periodMode === 'before') f.endDate = toDate || undefined;
    if (periodMode === 'between') {
      f.startDate = fromDate || undefined;
      f.endDate = toDate || undefined;
    }
    return f;
  }, [selectedCustomers, selectedCountries, selectedParts, selectedProdGroups, searchText, periodMode, fromDate, toDate]);

  useEffect(() => {
    getRanking(rankingFilters, entity, metric, topN).then((r) => setRows(r as RankingRow[]));
    getPartsPriorityRows(rankingFilters, 600).then((r) => setPartsRows(r));
  }, [rankingFilters, entity, metric, topN]);

  return <div>
    <PageHeader title="Rankings" subtitle="Leaderboards with period and metric controls." actions={<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 items-end">
      <label className="text-xs text-[var(--text-muted)]">Group by
        <select value={entity} onChange={(e) => setEntity(e.target.value as Entity)} className="card px-2 py-1 block w-full mt-1"><option value="parts">Parts</option><option value="customers">Customers</option><option value="prodgroup">ProdGrup</option><option value="class">Class</option><option value="country">Country</option><option value="territory">Territory</option></select>
      </label>
      <label className="text-xs text-[var(--text-muted)]">Rank by
        <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="card px-2 py-1 block w-full mt-1"><option value="revenue">Revenue</option><option value="orders">Orders</option><option value="profit">Profit</option><option value="margin">Margin%</option></select>
      </label>
      <label className="text-xs text-[var(--text-muted)]">Items to show
        <input type="number" value={topN} min={1} onChange={(e) => setTopN(Number(e.target.value || 50))} className="card w-full px-2 py-1 mt-1" />
      </label>
      <label className="text-xs text-[var(--text-muted)]">Period
        <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card px-2 py-1 block w-full mt-1"><option value="all">All time</option><option value="after">After date</option><option value="before">Before date</option><option value="between">Between dates</option></select>
      </label>
    </div>} />

    <section className="card p-3 mb-3">
      <h3 className="font-semibold mb-2">Filters</h3>
      <div className="grid lg:grid-cols-4 gap-3">
        <div className="space-y-2">
          <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer (ID or name)" className="card w-full px-2 py-1 text-xs" />
          <MultiSelect label="Customers (ID/Name)" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} />
        </div>
        <div className="space-y-2">
          <input value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} placeholder="Search country" className="card w-full px-2 py-1 text-xs" />
          <MultiSelect label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} />
        </div>
        <div className="space-y-2">
          <input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search part" className="card w-full px-2 py-1 text-xs" />
          <MultiSelect label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} />
        </div>
        <div className="space-y-2">
          <input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search product group" className="card w-full px-2 py-1 text-xs" />
          <MultiSelect label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} />
        </div>
      </div>
      <div className="grid md:grid-cols-4 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">Line description contains
          <input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" />
        </label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From date
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="card w-full px-2 py-1 mt-1" />
        </label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To date
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="card w-full px-2 py-1 mt-1" />
        </label>}
        <button className="card px-3 py-2 self-end" onClick={() => { setSelectedCustomers([]); setSelectedCountries([]); setSelectedParts([]); setSelectedProdGroups([]); setSearchText(''); setPeriodMode('all'); setFromDate(''); setToDate(''); }}>Reset filters</button>
      </div>
    </section>

    {entity === 'parts' && <section className="card overflow-auto mb-4">
      <div className="px-3 py-2 font-semibold border-b border-[var(--border)]">Parts table (priority)</div>
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0">
          <tr className="text-left border-b border-[var(--border)]"><th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (25)</th><th className="px-3 py-2">ProdGroup</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Profit %</th></tr>
        </thead>
        <tbody>{partsRows.map((row, i) => <tr key={`p-${i}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
          <td className="px-3 py-2 whitespace-nowrap">{String(row.cust_id ?? '')}</td>
          <td className="px-3 py-2 whitespace-normal break-words leading-5">{String(row.cust_name ?? '')}</td>
          <td className="px-3 py-2 whitespace-nowrap">{String(row.country ?? '')}</td>
          <td className="px-3 py-2 whitespace-nowrap">{String(row.part_num ?? '')}</td>
          <td className="px-3 py-2 whitespace-normal break-words">{String(row.line_desc_short ?? '')}</td>
          <td className="px-3 py-2 whitespace-nowrap">{String(row.prod_group ?? '')}</td>
          <td className="px-3 py-2 whitespace-nowrap">{Number(row.orders ?? 0).toLocaleString()}</td>
          <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue ?? 0))}</td>
          <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit ?? 0))}</td>
          <td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.profit_pct ?? 0))}</td>
        </tr>)}</tbody>
      </table>
    </section>}

    <section className="card overflow-auto">
      <div className="px-3 py-2 font-semibold border-b border-[var(--border)]">General ranking table</div>
      <table className="w-full table-auto text-sm">
        <colgroup><col style={{ width: '56px' }} /><col /><col style={{ width: '140px' }} /><col style={{ width: '90px' }} /><col style={{ width: '140px' }} /><col style={{ width: '90px' }} /><col style={{ width: '120px' }} /></colgroup>
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]"><th className="px-3 py-2">#</th><th className="px-3 py-2">Entity</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Margin</th><th className="px-3 py-2">Active FY</th></tr></thead>
        <tbody>{rows.map((row, idx) => <tr key={`${row.entity}-${idx}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
          <td className="px-3 py-2 whitespace-nowrap">{idx + 1}</td>
          <td className="px-3 py-2 whitespace-normal break-words leading-5">{row.entity}</td>
          <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.revenue ?? 0))}</td>
          <td className="px-3 py-2 whitespace-nowrap">{Number(row.orders ?? 0).toLocaleString()}</td>
          <td className="px-3 py-2 whitespace-nowrap">{currency(Number(row.profit ?? 0))}</td>
          <td className="px-3 py-2 whitespace-nowrap">{pct(Number(row.margin ?? 0))}</td>
          <td className="px-3 py-2 whitespace-nowrap">{Number(row.active_fy_count ?? 0)}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </div>;
}
