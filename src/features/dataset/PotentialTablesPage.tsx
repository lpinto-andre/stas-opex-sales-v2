import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCustomerOptions } from '@/data/queries';
import { useAppStore } from '@/state/store';

type Option = { value: string; label: string };

function MultiPick({ label, options, values, onChange }: { label: string; options: Option[]; values: string[]; onChange: (next: string[]) => void }) {
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return <div className="text-xs text-[var(--text-muted)]"><div className="mb-1">{label}</div><div className="card h-32 overflow-auto p-2 space-y-1">{options.map((o) => <label key={o.value} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} /><span className="text-xs truncate">{o.label}</span></label>)}</div></div>;
}

const money = (v: unknown) => `$${Math.round(Number(v ?? 0)).toLocaleString()}`;
const qty = (v: unknown) => Math.round(Number(v ?? 0)).toLocaleString();
const pct = (v: unknown) => `${Math.round(Number(v ?? 0))}%`;

export function PotentialTablesPage() {
  const dataRaw = useAppStore((s) => s.pageState.potential as Record<string, unknown> | undefined);
  const uiLang = useAppStore((s) => s.uiLang);
  const data = dataRaw ?? {};

  const summary = (data.summaryTable as Record<string, unknown>[]) ?? [];
  const consumables = (data.consumablesTable as Record<string, unknown>[]) ?? [];
  const validation = (data.validationReport as Record<string, unknown>[]) ?? [];

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);

  const [showValidation, setShowValidation] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showConsumables, setShowConsumables] = useState(false);
  const [showEquipment, setShowEquipment] = useState(true);

  const t = uiLang === 'fr' ? {
    title: 'Tables de Potentiel', subtitle: 'Filtrer par sociétés mappées. Les colonnes de données restent inchangées.',
    filters: 'Filtres', searchCompany: 'Rechercher société (client ShippedSO)', companies: 'Sociétés',
    noData: 'Aucune donnée chargée.', show: 'Afficher le tableau', hide: 'Masquer le tableau', collapsed: 'Tableau réduit.',
    validation: 'Rapport de validation', summary: 'Résumé par feuille (mappé aux IDs ShippedSO)',
    consumables: 'Consommables normalisés (produit + item + théorique + réel)',
    equipment: 'Résumé par équipement et item',
    customerId: 'CustomerID', equipmentCol: 'Equipment', item: 'Item', theoValue: 'Theor. consumption $', theoQty: 'Theor. consumption Qty', realValue: 'Real consumption $', realQty: 'Real consumption Qty', coverage: 'Coverage %'
  } : {
    title: 'Potential Consumption Tables', subtitle: 'Filter by mapped companies. Data columns are kept as-is.',
    filters: 'Filters', searchCompany: 'Search company (ShippedSO customer)', companies: 'Companies',
    noData: 'No data loaded yet.', show: 'Show table', hide: 'Hide table', collapsed: 'Table collapsed.',
    validation: 'Validation Report', summary: 'Sheet-level Summary (mapped to ShippedSO IDs)',
    consumables: 'Normalized Consumables (product + item + theoretical + real)',
    equipment: 'Equipment-level Summary by item',
    customerId: 'CustomerID', equipmentCol: 'Equipment', item: 'Item', theoValue: 'Theor. consumption $', theoQty: 'Theor. consumption Qty', realValue: 'Real consumption $', realQty: 'Real consumption Qty', coverage: 'Coverage %'
  };

  useEffect(() => {
    getCustomerOptions(customerSearch, 300).then((rows) => setCustomerOptions(rows.map((r) => ({ value: r.value, label: r.label }))));
  }, [customerSearch]);

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

  const filteredSummary = useMemo(() => mappedSummary.filter((r) => {
    if (!selectedCustomers.length) return true;
    const shipped = String(r.ShippedSOCustomerID ?? '');
    return shipped && customerFilterSet.has(shipped);
  }), [mappedSummary, selectedCustomers.length, customerFilterSet]);

  const filteredValidation = useMemo(() => validation.filter((r) => {
    if (!selectedCustomers.length) return true;
    const customerId = String(r.CustomerID ?? '');
    const mapped = mappedSummary.find((m) => String(m.CustomerID ?? '') === customerId);
    const shipped = String(mapped?.ShippedSOCustomerID ?? '');
    return shipped && customerFilterSet.has(shipped);
  }), [validation, mappedSummary, selectedCustomers.length, customerFilterSet]);

  const filteredConsumables = useMemo(() => consumables.filter((row) => {
    const mapped = mappedSummary.find((m) => String(m.CustomerID ?? '') === String(row.CustomerID ?? ''));
    const shipped = String(mapped?.ShippedSOCustomerID ?? '');
    return !selectedCustomers.length || (shipped && customerFilterSet.has(shipped));
  }), [consumables, mappedSummary, selectedCustomers.length, customerFilterSet]);

  const equipmentRows = useMemo(() => filteredConsumables.map((r) => ({
    CustomerID: String(r.CustomerID ?? ''),
    Equipment: String(r.EquipmentType ?? ''),
    Item: String(r.ConsumableName ?? ''),
    TheoreticalValue: Number(r.TheoreticalValue ?? 0),
    TheoreticalQty: Number(r.TheoreticalQty ?? 0),
    ActualValue: Number(r.ActualValue ?? 0),
    ActualQty: Number(r.ActualQty ?? 0),
    CoveragePct: Number(r.CoverageValuePct ?? 0)
  })), [filteredConsumables]);

  const renderTable = (rows: Record<string, unknown>[], title: string, shown: boolean, toggle: () => void) => {
    const cols = rows.length ? Object.keys(rows[0]) : [];
    return <section className="card overflow-auto mb-4"><div className="flex items-center justify-between p-3 border-b border-[var(--border)]"><h3 className="font-semibold">{title}</h3><button className="card px-3 py-1 text-xs" onClick={toggle}>{shown ? t.hide : t.show}</button></div>
      {!shown ? <div className="p-3 text-xs text-[var(--text-muted)]">{t.collapsed}</div> : (!rows.length ? <div className="p-3 text-sm text-[var(--text-muted)]">{t.noData}</div> : <table className="w-full table-auto text-xs"><thead className="bg-[var(--surface)] sticky top-0"><tr>{cols.map((c) => <th key={c} className="px-2 py-2 text-left whitespace-nowrap">{c}</th>)}</tr></thead><tbody>{rows.slice(0, 3000).map((r, i) => <tr key={i} className="border-b border-[var(--border)]">{cols.map((c) => <td key={c} className="px-2 py-1 whitespace-nowrap">{String(r[c] ?? '')}</td>)}</tr>)}</tbody></table>)}
    </section>;
  };

  return <div>
    <PageHeader title={t.title} subtitle={t.subtitle} />

    <section className="card p-3 mb-4">
      <h3 className="font-semibold mb-2">{t.filters}</h3>
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="space-y-2"><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder={t.searchCompany} className="card w-full px-2 py-1 text-xs" /><MultiPick label={t.companies} options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} /></div>
      </div>
    </section>

    <section className="card overflow-auto mb-4">
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]"><h3 className="font-semibold">{t.equipment}</h3><button className="card px-3 py-1 text-xs" onClick={() => setShowEquipment((x) => !x)}>{showEquipment ? t.hide : t.show}</button></div>
      {!showEquipment ? <div className="p-3 text-xs text-[var(--text-muted)]">{t.collapsed}</div> : (!equipmentRows.length ? <div className="p-3 text-sm text-[var(--text-muted)]">{t.noData}</div> : <table className="w-full table-auto text-xs"><thead className="bg-[var(--surface)] sticky top-0"><tr>
        <th className="px-2 py-2 text-left whitespace-nowrap">{t.customerId}</th>
        <th className="px-2 py-2 text-left whitespace-nowrap">{t.equipmentCol}</th>
        <th className="px-2 py-2 text-left whitespace-nowrap">{t.item}</th>
        <th className="px-2 py-2 text-left whitespace-nowrap">{t.theoValue}</th>
        <th className="px-2 py-2 text-left whitespace-nowrap">{t.theoQty}</th>
        <th className="px-2 py-2 text-left whitespace-nowrap">{t.realValue}</th>
        <th className="px-2 py-2 text-left whitespace-nowrap">{t.realQty}</th>
        <th className="px-2 py-2 text-left whitespace-nowrap">{t.coverage}</th>
      </tr></thead><tbody>{equipmentRows.slice(0, 3000).map((r, i) => <tr key={`${r.CustomerID}-${r.Equipment}-${r.Item}-${i}`} className="border-b border-[var(--border)]">
        <td className="px-2 py-1 whitespace-nowrap">{r.CustomerID}</td>
        <td className="px-2 py-1 whitespace-nowrap">{r.Equipment}</td>
        <td className="px-2 py-1 whitespace-nowrap">{r.Item}</td>
        <td className="px-2 py-1 whitespace-nowrap">{money(r.TheoreticalValue)}</td>
        <td className="px-2 py-1 whitespace-nowrap">{qty(r.TheoreticalQty)}</td>
        <td className="px-2 py-1 whitespace-nowrap">{money(r.ActualValue)}</td>
        <td className="px-2 py-1 whitespace-nowrap">{qty(r.ActualQty)}</td>
        <td className="px-2 py-1 whitespace-nowrap">{pct(r.CoveragePct)}</td>
      </tr>)}</tbody></table>)}
    </section>

    {renderTable(filteredValidation, t.validation, showValidation, () => setShowValidation((x) => !x))}
    {renderTable(filteredSummary, t.summary, showSummary, () => setShowSummary((x) => !x))}
    {renderTable(filteredConsumables, t.consumables, showConsumables, () => setShowConsumables((x) => !x))}
  </div>;
}
