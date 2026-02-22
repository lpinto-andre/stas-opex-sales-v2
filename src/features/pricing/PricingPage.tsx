import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { KPIStatCard } from '@/components/ui/KPIStatCard';
import { getCustomerOptions, getDetailRows, getDistinctOptions, getPricingKPIs, type Filters } from '@/data/queries';
import { useAppStore } from '@/state/store';

type Option = { value: string; label: string };
type PeriodMode = 'all' | 'after' | 'before' | 'between';

type PricingRow = {
  invoice_date: string;
  invoice_num: string;
  cust_id: string;
  cust_name: string;
  country: string;
  territory: string;
  class_id: string;
  part_num: string;
  line_desc_short: string;
  amount: number;
  cost: number | null;
  profit: number | null;
  margin_pct: number | null;
};

const currency = (v: number) => `$${Math.round(v).toLocaleString()}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
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

export function PricingPage() {
  const datasetMeta = useAppStore((s) => s.datasetMeta);
  const saved = useAppStore((s) => (s.pageState.pricing as Record<string, unknown>) ?? {});
  const setPageState = useAppStore((s) => s.setPageState);

  const [costOnly, setCostOnly] = useState(Boolean(saved.costOnly ?? true));
  const [periodMode, setPeriodMode] = useState<PeriodMode>((saved.periodMode as PeriodMode) ?? 'all');
  const [fromMonth, setFromMonth] = useState(String(saved.fromMonth ?? ''));
  const [toMonth, setToMonth] = useState(String(saved.toMonth ?? ''));
  const [searchText, setSearchText] = useState(String(saved.searchText ?? ''));

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>((saved.selectedCustomers as string[]) ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>((saved.selectedCountries as string[]) ?? []);
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>((saved.selectedTerritories as string[]) ?? []);
  const [selectedParts, setSelectedParts] = useState<string[]>((saved.selectedParts as string[]) ?? []);
  const [selectedProdGroups, setSelectedProdGroups] = useState<string[]>((saved.selectedProdGroups as string[]) ?? []);
  const [selectedClasses, setSelectedClasses] = useState<string[]>((saved.selectedClasses as string[]) ?? []);

  const [customerSearch, setCustomerSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [territorySearch, setTerritorySearch] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');

  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [territoryOptions, setTerritoryOptions] = useState<Option[]>([]);
  const [partOptions, setPartOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);
  const [classOptions, setClassOptions] = useState<Option[]>([]);

  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => { getCustomerOptions(customerSearch, 150).then((r) => setCustomerOptions(r.map((x) => ({ value: x.value, label: x.label })))); }, [customerSearch]);
  useEffect(() => { getDistinctOptions('country', countrySearch, 150).then((r) => setCountryOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [countrySearch]);
  useEffect(() => { getDistinctOptions('territory', territorySearch, 150).then((r) => setTerritoryOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [territorySearch]);
  useEffect(() => { getDistinctOptions('part_num', partSearch, 150).then((r) => setPartOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [partSearch]);
  useEffect(() => { getDistinctOptions('prod_group', groupSearch, 150).then((r) => setGroupOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [groupSearch]);
  useEffect(() => { getDistinctOptions('class_id', classSearch, 150).then((r) => setClassOptions(r.map((x) => ({ value: x.value, label: x.value })))); }, [classSearch]);

  const filters = useMemo<Filters>(() => {
    const f: Filters = {
      customers: selectedCustomers.length ? selectedCustomers : undefined,
      countries: selectedCountries.length ? selectedCountries : undefined,
      territories: selectedTerritories.length ? selectedTerritories : undefined,
      parts: selectedParts.length ? selectedParts : undefined,
      prodGroups: selectedProdGroups.length ? selectedProdGroups : undefined,
      classes: selectedClasses.length ? selectedClasses : undefined,
      searchLineDesc: searchText || undefined
    };
    if (periodMode === 'after') f.startDate = monthStart(fromMonth) || undefined;
    if (periodMode === 'before') f.endDate = monthEnd(toMonth) || undefined;
    if (periodMode === 'between') { f.startDate = monthStart(fromMonth) || undefined; f.endDate = monthEnd(toMonth) || undefined; }
    return f;
  }, [selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, selectedClasses, searchText, periodMode, fromMonth, toMonth]);

  useEffect(() => {
    let active = true;
    setLoadError('');
    Promise.allSettled([
      getPricingKPIs(filters, costOnly),
      getDetailRows(filters, 2000)
    ]).then(([kpiRes, rowsRes]) => {
      if (!active) return;
      setKpis(kpiRes.status === 'fulfilled' ? ((kpiRes.value as Record<string, number>) ?? {}) : {});
      if (rowsRes.status === 'fulfilled') {
        setRows((rowsRes.value as Record<string, unknown>[]).map((r) => ({
          invoice_date: String(r.invoice_date ?? '').slice(0, 10),
          invoice_num: String(r.invoice_num ?? ''),
          cust_id: String(r.cust_id ?? ''),
          cust_name: String(r.cust_name ?? ''),
          country: String(r.country ?? ''),
          territory: String(r.territory ?? ''),
          class_id: String(r.class_id ?? ''),
          part_num: String(r.part_num ?? ''),
          line_desc_short: String(r.line_desc ?? '').slice(0, 25),
          amount: Number(r.amount ?? 0),
          cost: r.cost == null ? null : Number(r.cost),
          profit: r.profit == null ? null : Number(r.profit),
          margin_pct: r.margin_pct == null ? null : Number(r.margin_pct)
        })));
      } else {
        setRows([]);
      }
      const firstError = [kpiRes, rowsRes].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      setLoadError(firstError ? (firstError.reason instanceof Error ? firstError.reason.message : 'Failed to load pricing analytics') : '');
    });

    return () => { active = false; };
  }, [filters, costOnly]);

  useEffect(() => {
    setPageState('pricing', { costOnly, periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, selectedClasses });
  }, [costOnly, periodMode, fromMonth, toMonth, searchText, selectedCustomers, selectedCountries, selectedTerritories, selectedParts, selectedProdGroups, selectedClasses, setPageState]);

  return <div>
    <PageHeader title="Pricing & Profitability" subtitle={`Cost Included: ${costOnly ? 'Yes' : 'No'} • ${datasetMeta?.dateRange ?? ''}`} actions={<div className="grid grid-cols-2 gap-2 items-end">
      <label className="text-xs text-[var(--text-muted)]">Cost Included<select value={String(costOnly)} onChange={(e) => setCostOnly(e.target.value === 'true')} className="card w-full px-2 py-1 mt-1"><option value="true">Yes</option><option value="false">No</option></select></label>
      <label className="text-xs text-[var(--text-muted)]">Period<select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="card w-full px-2 py-1 mt-1"><option value="all">All</option><option value="after">After (month)</option><option value="before">Before (month)</option><option value="between">Between (months)</option></select></label>
    </div>} />

    {loadError && <section className="card p-3 mb-3 border-[var(--danger)]"><h3 className="font-semibold text-[var(--danger)]">Pricing analytics query failed</h3><p className="text-sm mt-1">{loadError}</p></section>}

    <section className="card p-3 mb-3">
      <h3 className="font-semibold mb-2">Filters</h3>
      <div className="grid lg:grid-cols-3 gap-3">
        <div className="space-y-2"><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Customers" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} /></div>
        <div className="space-y-2"><input value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} placeholder="Search country" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Countries" options={countryOptions} values={selectedCountries} onChange={setSelectedCountries} /></div>
        <div className="space-y-2"><input value={territorySearch} onChange={(e) => setTerritorySearch(e.target.value)} placeholder="Search territory" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Territories" options={territoryOptions} values={selectedTerritories} onChange={setSelectedTerritories} /></div>
        <div className="space-y-2"><input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search part" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Parts" options={partOptions} values={selectedParts} onChange={setSelectedParts} /></div>
        <div className="space-y-2"><input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search group" className="card w-full px-2 py-1 text-xs" /><MultiPick label="ProdGroups" options={groupOptions} values={selectedProdGroups} onChange={setSelectedProdGroups} /></div>
        <div className="space-y-2"><input value={classSearch} onChange={(e) => setClassSearch(e.target.value)} placeholder="Search class" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Class" options={classOptions} values={selectedClasses} onChange={setSelectedClasses} /></div>
      </div>
      <div className="grid md:grid-cols-4 gap-2 mt-3">
        <label className="text-xs text-[var(--text-muted)]">LineDesc contains<input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="card w-full px-2 py-1 mt-1" /></label>
        {(periodMode === 'after' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">From YYYY-MM<input value={fromMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setFromMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
        {(periodMode === 'before' || periodMode === 'between') && <label className="text-xs text-[var(--text-muted)]">To YYYY-MM<input value={toMonth} onChange={(e) => { const n = safeMonthInput(e.target.value); if (n !== null) setToMonth(n); }} className="card w-full px-2 py-1 mt-1" /></label>}
      </div>
    </section>

    <div className="grid md:grid-cols-4 gap-3 mb-4">
      <KPIStatCard label="Revenue" value={currency(Number(kpis.revenue ?? 0))} />
      <KPIStatCard label="Cost" value={currency(Number(kpis.cost ?? 0))} />
      <KPIStatCard label="Profit" value={currency(Number(kpis.profit ?? 0))} />
      <KPIStatCard label="Margin %" value={pct(Number(kpis.margin_pct ?? 0))} />
    </div>

    <section className="card overflow-auto">
      <table className="w-full table-auto text-sm">
        <thead className="bg-[var(--surface)] sticky top-0"><tr className="text-left border-b border-[var(--border)]">
          <th className="px-3 py-2">Invoice Date</th><th className="px-3 py-2">Invoice #</th><th className="px-3 py-2">CustID</th><th className="px-3 py-2">CustName</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">PartNum</th><th className="px-3 py-2">LineDesc (25)</th>
          <th className="px-3 py-2">Price</th><th className="px-3 py-2">Cost</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Profit %</th>
        </tr></thead>
        <tbody>{rows.map((row, i) => <tr key={`${row.invoice_num}-${row.part_num}-${i}`} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/60 align-top">
          <td className="px-3 py-2 whitespace-nowrap">{row.invoice_date}</td><td className="px-3 py-2 whitespace-nowrap">{row.invoice_num}</td><td className="px-3 py-2 whitespace-nowrap">{row.cust_id}</td><td className="px-3 py-2 whitespace-normal break-words">{row.cust_name}</td><td className="px-3 py-2 whitespace-nowrap">{row.country}</td><td className="px-3 py-2 whitespace-nowrap">{row.part_num}</td><td className="px-3 py-2 whitespace-normal break-words">{row.line_desc_short}</td>
          <td className="px-3 py-2 whitespace-nowrap">{currency(row.amount)}</td><td className="px-3 py-2 whitespace-nowrap">{row.cost == null ? '-' : currency(row.cost)}</td><td className="px-3 py-2 whitespace-nowrap">{row.profit == null ? '-' : currency(row.profit)}</td><td className="px-3 py-2 whitespace-nowrap">{row.margin_pct == null ? '-' : pct(row.margin_pct)}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </div>;
}
