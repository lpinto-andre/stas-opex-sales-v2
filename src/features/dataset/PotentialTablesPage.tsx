import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCustomerOptions } from '@/data/queries';
import { useAppStore } from '@/state/store';

type Option = { value: string; label: string };
type ConsumptionView = 'theoretical' | 'actual' | 'both';

function MultiPick({ label, options, values, onChange }: { label: string; options: Option[]; values: string[]; onChange: (next: string[]) => void }) {
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return <div className="text-xs text-[var(--text-muted)]"><div className="mb-1">{label}</div><div className="card h-32 overflow-auto p-2 space-y-1">{options.map((o) => <label key={o.value} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} /><span className="text-xs truncate">{o.label}</span></label>)}</div></div>;
}

export function PotentialTablesPage() {
  const dataRaw = useAppStore((s) => s.pageState.potential as Record<string, unknown> | undefined);
  const data = dataRaw ?? {};

  const summary = (data.summaryTable as Record<string, unknown>[]) ?? [];
  const consumables = (data.consumablesTable as Record<string, unknown>[]) ?? [];
  const equipment = (data.equipmentSummaryTable as Record<string, unknown>[]) ?? [];
  const validation = (data.validationReport as Record<string, unknown>[]) ?? [];

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [consumptionView, setConsumptionView] = useState<ConsumptionView>('both');

  const [showValidation, setShowValidation] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showConsumables, setShowConsumables] = useState(false);
  const [showEquipment, setShowEquipment] = useState(false);

  useEffect(() => {
    getCustomerOptions(customerSearch, 300).then((rows) => setCustomerOptions(rows.map((r) => ({ value: r.value, label: r.label }))));
  }, [customerSearch]);

  const productOptions = useMemo<Option[]>(() => {
    const set = new Set<string>();
    consumables.forEach((r) => set.add(String(r.EquipmentType ?? '')));
    set.add('Total');
    return [...set].filter(Boolean).sort().map((x) => ({ value: x, label: x }));
  }, [consumables]);

  const shippedCustomerValues = useMemo(() => new Set(customerOptions.map((o) => o.value)), [customerOptions]);

  const mappedSummary = useMemo<Record<string, unknown>[]>(() => summary.map((row) => {
    const potentialId = String(row.CustomerID ?? '');
    let shippedId: string | null = null;
    if (shippedCustomerValues.has(potentialId)) shippedId = potentialId;
    else {
      const starts = customerOptions.find((c) => c.value.startsWith(potentialId));
      if (starts) shippedId = starts.value;
    }
    return { ...row, ShippedSOCustomerID: shippedId ?? '', MappingStatus: shippedId ? 'mapped' : 'unmapped' };
  }), [summary, shippedCustomerValues, customerOptions]);

  const customerFilterSet = new Set(selectedCustomers);
  const productFilterSet = new Set(selectedProducts);

  const filteredConsumables = useMemo(() => {
    return consumables.filter((row) => {
      const mapped = mappedSummary.find((m) => String(m.CustomerID ?? '') === String(row.CustomerID ?? ''));
      const shipped = String(mapped?.ShippedSOCustomerID ?? '');
      const customerMatch = !selectedCustomers.length || (shipped && customerFilterSet.has(shipped));
      const product = String(row.EquipmentType ?? '');
      const productMatch = !selectedProducts.length || productFilterSet.has(product) || (productFilterSet.has('Total') && product);
      if (!customerMatch || !productMatch) return false;
      if (consumptionView === 'theoretical') return row.TheoreticalValue != null || row.TheoreticalQty != null;
      if (consumptionView === 'actual') return row.ActualValue != null || row.ActualQty != null;
      return true;
    });
  }, [consumables, mappedSummary, selectedCustomers.length, customerFilterSet, selectedProducts.length, productFilterSet, consumptionView]);

  const filteredSummary = useMemo(() => mappedSummary.filter((r) => {
    if (!selectedCustomers.length) return true;
    const shipped = String(r.ShippedSOCustomerID ?? '');
    return shipped && customerFilterSet.has(shipped);
  }), [mappedSummary, selectedCustomers.length, customerFilterSet]);

  const filteredEquipment = useMemo(() => equipment.filter((r) => {
    const customerId = String(r.CustomerID ?? '');
    const mapped = mappedSummary.find((m) => String(m.CustomerID ?? '') === customerId);
    const shipped = String(mapped?.ShippedSOCustomerID ?? '');
    const customerMatch = !selectedCustomers.length || (shipped && customerFilterSet.has(shipped));
    const product = String(r.EquipmentType ?? '');
    const productMatch = !selectedProducts.length || productFilterSet.has(product) || productFilterSet.has('Total');
    return customerMatch && productMatch;
  }), [equipment, mappedSummary, selectedCustomers.length, customerFilterSet, selectedProducts.length, productFilterSet]);

  const filteredValidation = useMemo(() => validation.filter((r) => {
    if (!selectedCustomers.length) return true;
    const customerId = String(r.CustomerID ?? '');
    const mapped = mappedSummary.find((m) => String(m.CustomerID ?? '') === customerId);
    const shipped = String(mapped?.ShippedSOCustomerID ?? '');
    return shipped && customerFilterSet.has(shipped);
  }), [validation, mappedSummary, selectedCustomers.length, customerFilterSet]);

  const productItemList = useMemo(() => {
    const map = new Map<string, Set<string>>();
    filteredConsumables.forEach((r) => {
      const product = String(r.EquipmentType ?? '');
      const item = String(r.ConsumableName ?? '');
      if (!product || !item) return;
      if (!map.has(product)) map.set(product, new Set<string>());
      map.get(product)!.add(item);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredConsumables]);

  const renderTable = (rows: Record<string, unknown>[], title: string, shown: boolean, toggle: () => void) => {
    const cols = rows.length ? Object.keys(rows[0]) : [];
    return <section className="card overflow-auto mb-4"><div className="flex items-center justify-between p-3 border-b border-[var(--border)]"><h3 className="font-semibold">{title}</h3><button className="card px-3 py-1 text-xs" onClick={toggle}>{shown ? 'Hide table' : 'Show table'}</button></div>
      {!shown ? <div className="p-3 text-xs text-[var(--text-muted)]">Table collapsed.</div> : (!rows.length ? <div className="p-3 text-sm text-[var(--text-muted)]">No data loaded yet.</div> : <table className="w-full table-auto text-xs"><thead className="bg-[var(--surface)] sticky top-0"><tr>{cols.map((c) => <th key={c} className="px-2 py-2 text-left whitespace-nowrap">{c}</th>)}</tr></thead><tbody>{rows.slice(0, 3000).map((r, i) => <tr key={i} className="border-b border-[var(--border)]">{cols.map((c) => <td key={c} className="px-2 py-1 whitespace-nowrap">{String(r[c] ?? '')}</td>)}</tr>)}</tbody></table>)}
    </section>;
  };

  return <div>
    <PageHeader title="Potential Consumption Tables" subtitle="Filter by mapped companies, products, and theoretical/actual consumption views." />

    <section className="card p-3 mb-4">
      <h3 className="font-semibold mb-2">Filters</h3>
      <div className="grid lg:grid-cols-3 gap-3">
        <div className="space-y-2"><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search company (ShippedSO customer)" className="card w-full px-2 py-1 text-xs" /><MultiPick label="Companies" options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} /></div>
        <div className="space-y-2"><MultiPick label="Products" options={productOptions} values={selectedProducts} onChange={setSelectedProducts} /></div>
        <label className="text-xs text-[var(--text-muted)]">Consumption view<select value={consumptionView} onChange={(e) => setConsumptionView(e.target.value as ConsumptionView)} className="card w-full px-2 py-1 mt-1"><option value="both">Theoretical + Real</option><option value="theoretical">Theoretical only</option><option value="actual">Real only</option></select></label>
      </div>
    </section>

    <section className="card p-3 mb-4">
      <h3 className="font-semibold mb-2">Items by Product</h3>
      {!productItemList.length ? <p className="text-sm text-[var(--text-muted)]">No items available for current filters.</p> : <div className="grid md:grid-cols-3 gap-3 text-sm">{productItemList.map(([product, items]) => <div key={product} className="card p-2"><div className="font-semibold mb-1">{product}</div><ul className="list-disc ml-4 text-[var(--text-muted)]">{[...items].sort().map((i) => <li key={i}>{i}</li>)}</ul></div>)}</div>}
    </section>

    {renderTable(filteredValidation, 'Validation Report', showValidation, () => setShowValidation((x) => !x))}
    {renderTable(filteredSummary, 'Sheet-level Summary (mapped to ShippedSO IDs)', showSummary, () => setShowSummary((x) => !x))}
    {renderTable(filteredConsumables, 'Normalized Consumables (product + item + theoretical + real)', showConsumables, () => setShowConsumables((x) => !x))}
    {renderTable(filteredEquipment, 'Equipment-level Summary', showEquipment, () => setShowEquipment((x) => !x))}
  </div>;
}
