import { PageHeader } from '@/components/ui/PageHeader';
import { useAppStore } from '@/state/store';

export function PotentialTablesPage() {
  const data = useAppStore((s) => (s.pageState.potential as Record<string, unknown>) ?? {});
  const summary = (data.summaryTable as Record<string, unknown>[]) ?? [];
  const consumables = (data.consumablesTable as Record<string, unknown>[]) ?? [];
  const equipment = (data.equipmentSummaryTable as Record<string, unknown>[]) ?? [];
  const validation = (data.validationReport as Record<string, unknown>[]) ?? [];

  const renderTable = (rows: Record<string, unknown>[], title: string) => {
    const cols = rows.length ? Object.keys(rows[0]) : [];
    return <section className="card overflow-auto mb-4"><h3 className="font-semibold p-3 border-b border-[var(--border)]">{title}</h3>
      {!rows.length ? <div className="p-3 text-sm text-[var(--text-muted)]">No data loaded yet.</div> : <table className="w-full table-auto text-xs"><thead className="bg-[var(--surface)] sticky top-0"><tr>{cols.map((c) => <th key={c} className="px-2 py-2 text-left whitespace-nowrap">{c}</th>)}</tr></thead><tbody>{rows.slice(0, 2000).map((r, i) => <tr key={i} className="border-b border-[var(--border)]">{cols.map((c) => <td key={c} className="px-2 py-1 whitespace-nowrap">{String(r[c] ?? '')}</td>)}</tr>)}</tbody></table>}
    </section>;
  };

  return <div>
    <PageHeader title="Potential Consumption Tables" subtitle="Extracted and normalized tables from theoretical consumption workbook." />
    {renderTable(validation, 'Validation Report')}
    {renderTable(summary, 'Sheet-level Summary')}
    {renderTable(consumables, 'Normalized Consumables')}
    {renderTable(equipment, 'Equipment-level Summary')}
  </div>;
}
