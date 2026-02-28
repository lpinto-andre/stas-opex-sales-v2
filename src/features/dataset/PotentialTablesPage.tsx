import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/ui/PageHeader';
import { AdvancedFiltersPanel } from '@/components/ui/AdvancedFiltersPanel';
import { MultiPickFilter } from '@/components/ui/MultiPickFilter';
import { SavedViewsPanel } from '@/components/ui/SavedViewsPanel';
import { detectTerritoryGroup, TERRITORY_GROUP_ORDER, territoryGroupLabel, type TerritoryGroup } from '@/data/potentialTerritories';
import { useSavedViews } from '@/hooks/useSavedViews';
import { uiText } from '@/i18n/ui';
import { useAppStore } from '@/state/store';
import { formatInteger } from '@/utils/formatters';

type Option = { value: string; label: string };
type ChartKey = 'allCompany' | 'selectedCompany' | 'product' | 'item' | 'distribution' | 'opportunities' | 'heatmap' | 'exceptions';
type PotentialSavedView = {
  selectedTerritory: string;
  selectedCustomers: string[];
};

type PotentialStoredFile = {
  sourceFileName: string;
  loadedAt: string;
  territoryGroup: TerritoryGroup;
  summaryTable: Record<string, unknown>[];
  consumablesTable: Record<string, unknown>[];
  validationReport: Record<string, unknown>[];
};

type EquipmentRow = {
  TerritoryGroup: TerritoryGroup;
  SourceFileName: string;
  CustomerID: string;
  Equipment: string;
  Item: string;
  TheoreticalValue: number;
  TheoreticalQty: number;
  ActualValue: number;
  ActualQty: number;
  CoveragePct: number | null;
  HasTheoBaseline: boolean;
  HasActualNoTheo: boolean;
};
type EquipmentSortKey = 'CustomerID' | 'Equipment' | 'Item' | 'TheoreticalValue' | 'ActualValue' | 'TheoreticalQty' | 'ActualQty' | 'CoveragePct';

type CoverageRow = { key: string; label: string; coveragePct: number | null; theoreticalValue: number; actualValue: number };
type TerritorySection = {
  group: TerritoryGroup;
  label: string;
  files: string[];
  equipment: EquipmentRow[];
  validation: ValidationMetaRow[];
  coverageAll: CoverageRow[];
  coverageSelected: CoverageRow[];
  coverageProduct: CoverageRow[];
  coverageItem: CoverageRow[];
  distribution: { label: string; count: number }[];
  excludedNa: number;
  opportunities: Array<{ key: string; customer: string; equipment: string; item: string; theo: number; real: number; gap: number }>;
  heatmap: { equipment: string[]; matrix: Array<{ company: string; cells: Array<{ equipment: string; coverage: number | null }> }> };
  exceptions: Array<{ key: string; customer: string; equipment: string; item: string; theo: number; real: number; reason: string }>;
};

type SummaryMetaRow = Record<string, unknown> & {
  TerritoryGroup: TerritoryGroup;
  SourceFileName: string;
  CustomerID?: unknown;
  GrandTotal_Theoretical_CAD?: unknown;
};

type ValidationMetaRow = Record<string, unknown> & {
  TerritoryGroup: TerritoryGroup;
  SourceFileName: string;
  CustomerID?: unknown;
};

function SinglePick({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (next: string) => void }) {
  return <div className="text-xs text-[var(--text-muted)]">
    <div className="mb-1">{label}</div>
    <div className="card h-32 overflow-auto p-2 space-y-1">
      {options.map((option) => <button
        key={option.value}
        type="button"
        className={`w-full text-left px-2 py-1 rounded ${value === option.value ? 'bg-[var(--teal)] text-black' : 'hover:bg-[var(--surface)]'}`}
        onClick={() => onChange(value === option.value ? '' : option.value)}
      >
        {option.label}
      </button>)}
    </div>
  </div>;
}

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const clampPct = (value: number) => Math.max(0, Math.min(100, value));
const money = (value: unknown) => `$${Math.round(num(value)).toLocaleString()}`;
const qty = (value: unknown) => Math.round(num(value)).toLocaleString();
const pct = (value: unknown) => `${num(value).toFixed(1)}%`;
const normalizeText = (value: string) => value.trim().toLowerCase();
const compactLabel = (value: string, max = 56) => value.length > max ? `${value.slice(0, max - 3)}...` : value;
const chartId = (group: TerritoryGroup, key: ChartKey) => `${group}:${key}`;
const ITEM_ORDER = [
  'ACD / Graphite',
  'ACD / Refractory',
  'RI / Graphite',
  'RI / Flux',
  'DBF / Billes',
  'DBF / GridPlate',
  'DBF / Refractory',
  'TAC / Fonte',
  'ACS / Fonte',
  'STARprobe / Probe',
  'HACC / Pastille',
  'AIR / Graphite',
  'AIR / Refractory',
  'AIR / HeatingTube'
];
const ITEM_ORDER_INDEX = new Map(ITEM_ORDER.map((label, index) => [label.toLowerCase(), index]));

const isTerritoryGroup = (value: unknown): value is TerritoryGroup => value === 'america_africa' || value === 'europe_mo' || value === 'asia_oceania' || value === 'unknown';
const rows = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object') : [];

const parsePotentialFiles = (raw: Record<string, unknown>): PotentialStoredFile[] => {
  const rawFiles = rows(raw.files);
  if (rawFiles.length) return rawFiles.map((file) => {
    const fileName = String(file.sourceFileName ?? 'Potential Workbook');
    return {
      sourceFileName: fileName,
      loadedAt: String(file.loadedAt ?? new Date().toISOString()),
      territoryGroup: isTerritoryGroup(file.territoryGroup) ? file.territoryGroup : detectTerritoryGroup(fileName),
      summaryTable: rows(file.summaryTable),
      consumablesTable: rows(file.consumablesTable),
      validationReport: rows(file.validationReport)
    };
  });
  if (!Array.isArray(raw.summaryTable) && !Array.isArray(raw.consumablesTable) && !Array.isArray(raw.validationReport)) return [];
  const fileName = String(raw.sourceFileName ?? 'Legacy Potential Workbook');
  return [{
    sourceFileName: fileName,
    loadedAt: String(raw.loadedAt ?? new Date().toISOString()),
    territoryGroup: detectTerritoryGroup(fileName),
    summaryTable: rows(raw.summaryTable),
    consumablesTable: rows(raw.consumablesTable),
    validationReport: rows(raw.validationReport)
  }];
};

const buildEquipmentRows = (rowsIn: Array<Record<string, unknown> & { TerritoryGroup: TerritoryGroup; SourceFileName: string }>): EquipmentRow[] => rowsIn.map((row) => {
  const theoRaw = row.TheoreticalValue;
  const realRaw = row.ActualValue;
  const theo = num(theoRaw);
  const real = num(realRaw);
  return {
    TerritoryGroup: row.TerritoryGroup,
    SourceFileName: row.SourceFileName,
    CustomerID: String(row.CustomerID ?? ''),
    Equipment: String(row.EquipmentType ?? ''),
    Item: String(row.ConsumableName ?? ''),
    TheoreticalValue: theo,
    TheoreticalQty: num(row.TheoreticalQty),
    ActualValue: real,
    ActualQty: num(row.ActualQty),
    // Interpret blank actual values as 0 when theoretical baseline exists.
    // NA is only for rows with neither theoretical nor actual value.
    CoveragePct: theo > 0 ? clampPct((real / theo) * 100) : (real > 0 ? 100 : null),
    HasTheoBaseline: theo > 0,
    HasActualNoTheo: theo === 0 && real > 0
  };
});

const aggregateCoverage = (rowsIn: EquipmentRow[], getLabel: (row: EquipmentRow) => string): CoverageRow[] => {
  const grouped = new Map<string, { theo: number; real: number }>();
  rowsIn.forEach((row) => {
    const label = getLabel(row) || '-';
    const current = grouped.get(label) ?? { theo: 0, real: 0 };
    current.theo += row.TheoreticalValue;
    current.real += row.ActualValue;
    grouped.set(label, current);
  });
  return [...grouped.entries()].map(([label, value]) => ({
    key: label,
    label,
    theoreticalValue: value.theo,
    actualValue: value.real,
    coveragePct: value.theo > 0 ? clampPct((value.real / value.theo) * 100) : (value.real > 0 ? 100 : null)
  })).sort((a, b) => a.label.localeCompare(b.label));
};

export function PotentialTablesPage() {
  const dataRaw = useAppStore((state) => state.pageState.potential as Record<string, unknown> | undefined);
  const setPageState = useAppStore((state) => state.setPageState);
  const uiLang = useAppStore((state) => state.uiLang);
  const uiTheme = useAppStore((state) => state.uiTheme);
  const common = uiText[uiLang];
  const data = dataRaw ?? {};

  const t = uiLang === 'fr' ? {
    title: 'Tables de Potentiel',
    subtitle: 'Choisissez d’abord les groupes de territoires.',
    territoryGroups: 'Groupes de territoires',
    companies: 'Sociétés',
    applied: 'Filtres',
    noData: 'Aucune donnée chargée.',
    chooseTerritories: 'Choisissez au moins un groupe de territoires pour afficher les analyses.',
    files: 'Fichiers',
    charts: 'Visualisations',
    validation: 'Rapport de validation',
    equipment: 'Résumé par équipement et item',
    customer: 'CustomerID',
    equipmentCol: 'Equipment',
    item: 'Item',
    theoValue: 'Theor. consumption $',
    realValue: 'Real consumption $',
    theoQty: 'Theor. consumption Qty',
    realQty: 'Real consumption Qty',
    coverage: 'Coverage %',
    show: 'Afficher',
    hide: 'Masquer',
    collapsed: 'Réduit.',
    showChart: 'Afficher le graphique',
    hideChart: 'Masquer le graphique',
    byCompanyAll: 'Coverage % par société (toutes)',
    byCompanySelected: 'Coverage % par société (sélection)',
    byProduct: 'Coverage % par produit',
    byItem: 'Coverage % par item',
    distribution: 'Coverage distribution',
    opportunities: 'Top opportunities ($ gap)',
    heatmap: 'Company x equipment heatmap',
    exceptions: 'Data exceptions',
    globalCoverageTitle: 'Coverage global par territoire importé',
    importedCustomers: 'Clients importés',
    importedFilesLabel: 'Fichiers importés',
    globalTheoretical: 'Théorique total',
    globalActual: 'Réel total',
    reason: 'Raison',
    reasonTheoNoBaseline: 'Theo=0 et Real>0',
    reasonCoverageCapped: 'Coverage limité à 100%',
    na: 'NA',
    zeroCoverageList: '0% (Theor. > 0 et Real = 0)',
    filterCustomer: 'Filtre Customer',
    filterEquipment: 'Filtre Equipment',
    filterItem: 'Filtre Item'
  } : {
    title: 'Potential Consumption Tables',
    subtitle: 'Choose territory groups first.',
    territoryGroups: 'Territory groups',
    companies: 'Companies',
    applied: 'Filters',
    noData: 'No data loaded yet.',
    chooseTerritories: 'Choose at least one territory group to display analytics.',
    files: 'Files',
    charts: 'Visualizations',
    validation: 'Validation report',
    equipment: 'Equipment-level summary by item',
    customer: 'CustomerID',
    equipmentCol: 'Equipment',
    item: 'Item',
    theoValue: 'Theor. consumption $',
    realValue: 'Real consumption $',
    theoQty: 'Theor. consumption Qty',
    realQty: 'Real consumption Qty',
    coverage: 'Coverage %',
    show: 'Show',
    hide: 'Hide',
    collapsed: 'Collapsed.',
    showChart: 'Show chart',
    hideChart: 'Hide chart',
    byCompanyAll: 'Coverage % by company (all)',
    byCompanySelected: 'Coverage % by company (selected)',
    byProduct: 'Coverage % by product',
    byItem: 'Coverage % by item',
    distribution: 'Coverage distribution',
    opportunities: 'Top opportunities ($ gap)',
    heatmap: 'Company x equipment heatmap',
    exceptions: 'Data exceptions',
    globalCoverageTitle: 'Global coverage by imported territory',
    importedCustomers: 'Imported customers',
    importedFilesLabel: 'Imported files',
    globalTheoretical: 'Total theoretical',
    globalActual: 'Total actual',
    reason: 'Reason',
    reasonTheoNoBaseline: 'Theo=0 and Real>0',
    reasonCoverageCapped: 'Coverage capped to 100%',
    na: 'NA',
    zeroCoverageList: '0% (Theor. > 0 and Real = 0)',
    filterCustomer: 'Filter Customer',
    filterEquipment: 'Filter Equipment',
    filterItem: 'Filter Item'
  };

  const files = useMemo(() => parsePotentialFiles(data), [data]);
  const territoryOptions = useMemo<Option[]>(() => {
    const groups = new Set(files.map((file) => file.territoryGroup));
    return TERRITORY_GROUP_ORDER.filter((group) => groups.has(group)).map((group) => ({ value: group, label: territoryGroupLabel(group, uiLang) }));
  }, [files, uiLang]);

  const [selectedTerritory, setSelectedTerritory] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [showEquipment, setShowEquipment] = useState(true);
  const [showValidation, setShowValidation] = useState(false);
  const [collapsedCharts, setCollapsedCharts] = useState<Record<string, boolean>>({});
  const [equipmentSort, setEquipmentSort] = useState<{ key: EquipmentSortKey; dir: 'asc' | 'desc' }>({ key: 'CustomerID', dir: 'asc' });
  const [equipmentCustomerFilter, setEquipmentCustomerFilter] = useState('');
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState('');
  const [equipmentItemFilter, setEquipmentItemFilter] = useState('');
  const currentSavedView = useMemo<PotentialSavedView>(() => ({
    selectedTerritory,
    selectedCustomers
  }), [selectedTerritory, selectedCustomers]);
  const {
    activeViewName,
    collapsed: savedViewsCollapsed,
    deleteSavedView,
    saveCurrentView,
    saveName,
    savedViews,
    setCollapsed: setSavedViewsCollapsed,
    setSaveName
  } = useSavedViews<PotentialSavedView>({
    storageKey: 'saved-views-potential-tables',
    currentSnapshot: currentSavedView
  });

  useEffect(() => {
    setPageState('potentialView', {
      selectedTerritory,
      selectedCustomers,
      equipmentCustomerFilter,
      equipmentTypeFilter,
      equipmentItemFilter
    });
  }, [setPageState, selectedTerritory, selectedCustomers, equipmentCustomerFilter, equipmentTypeFilter, equipmentItemFilter]);

  useEffect(() => {
    const available = new Set(territoryOptions.map((option) => option.value));
    if (selectedTerritory && !available.has(selectedTerritory)) setSelectedTerritory('');
  }, [territoryOptions, selectedTerritory]);

  const potentialCustomerMap = useMemo(() => {
    const byId = new Map<string, string>();
    files.forEach((file) => {
      file.summaryTable.forEach((row) => {
        const customerId = String(row.CustomerID ?? '').trim();
        if (!customerId || byId.has(customerId)) return;
        const name = String(row.ClientName ?? '').trim();
        if (name) byId.set(customerId, name);
      });
      file.consumablesTable.forEach((row) => {
        const customerId = String(row.CustomerID ?? '').trim();
        if (!customerId || byId.has(customerId)) return;
        const name = String(row.ClientName ?? '').trim();
        if (name) byId.set(customerId, name);
      });
    });
    return byId;
  }, [files]);

  const territoryCustomerUniverse = useMemo(() => {
    const relevantFiles = selectedTerritory ? files.filter((file) => file.territoryGroup === selectedTerritory) : files;
    const byId = new Map<string, string>();
    relevantFiles.forEach((file) => {
      file.summaryTable.forEach((row) => {
        const customerId = String(row.CustomerID ?? '').trim();
        if (!customerId || byId.has(customerId)) return;
        byId.set(customerId, String(row.ClientName ?? '').trim());
      });
      file.consumablesTable.forEach((row) => {
        const customerId = String(row.CustomerID ?? '').trim();
        if (!customerId || byId.has(customerId)) return;
        byId.set(customerId, String(row.ClientName ?? '').trim());
      });
    });
    return byId;
  }, [files, selectedTerritory]);

  const customerOptions = useMemo<Option[]>(() => {
    const needle = normalizeText(customerSearch);
    return [...territoryCustomerUniverse.entries()]
      .map(([id, name]) => ({ value: id, label: name ? `${id} - ${name}` : id }))
      .filter((option) => {
        if (!needle) return true;
        const valueText = normalizeText(option.value);
        const labelText = normalizeText(option.label);
        return valueText.includes(needle) || labelText.includes(needle);
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [territoryCustomerUniverse, customerSearch]);

  useEffect(() => {
    const available = new Set([...territoryCustomerUniverse.keys()]);
    setSelectedCustomers((prev) => prev.filter((value) => available.has(value)));
  }, [territoryCustomerUniverse]);

  const customerLabel = (potentialId: string) => {
    const name = potentialCustomerMap.get(potentialId);
    return name ? `${potentialId} - ${name}` : potentialId;
  };
  const byCompanyFilter = (potentialId: string) => {
    if (!selectedCustomers.length) return true;
    return selectedCustomers.includes(potentialId);
  };

  const selectedFiles = useMemo(() => files.filter((file) => selectedTerritory && file.territoryGroup === selectedTerritory), [files, selectedTerritory]);
  const allConsumableRows = useMemo(
    () => files.flatMap((file) => file.consumablesTable.map((row) => ({ ...row, TerritoryGroup: file.territoryGroup, SourceFileName: file.sourceFileName }))),
    [files]
  );
  const allEquipmentRows = useMemo(
    () => buildEquipmentRows(allConsumableRows as Array<Record<string, unknown> & { TerritoryGroup: TerritoryGroup; SourceFileName: string }>),
    [allConsumableRows]
  );
  const globalTerritoryCoverage = useMemo(() => {
    const grouped = new Map<TerritoryGroup, { theoretical: number; actual: number; customers: Set<string>; files: number }>();
    files.forEach((file) => {
      const current = grouped.get(file.territoryGroup) ?? { theoretical: 0, actual: 0, customers: new Set<string>(), files: 0 };
      current.files += 1;
      file.summaryTable.forEach((row) => {
        const customer = String(row.CustomerID ?? '').trim();
        if (customer) current.customers.add(customer);
      });
      grouped.set(file.territoryGroup, current);
    });
    allEquipmentRows.forEach((row) => {
      const current = grouped.get(row.TerritoryGroup) ?? { theoretical: 0, actual: 0, customers: new Set<string>(), files: 0 };
      current.theoretical += row.TheoreticalValue;
      current.actual += row.ActualValue;
      grouped.set(row.TerritoryGroup, current);
    });
    return TERRITORY_GROUP_ORDER
      .filter((group) => grouped.has(group))
      .map((group) => {
        const value = grouped.get(group)!;
        const coverage = value.theoretical > 0 ? clampPct((value.actual / value.theoretical) * 100) : (value.actual > 0 ? 100 : null);
        return {
          group,
          label: territoryGroupLabel(group, uiLang),
          coverage,
          theoretical: value.theoretical,
          actual: value.actual,
          customers: value.customers.size,
          files: value.files
        };
      });
  }, [files, allEquipmentRows, uiLang]);
  const summaryRows = useMemo<SummaryMetaRow[]>(
    () => selectedFiles.flatMap((file) => file.summaryTable.map((row) => ({ ...(row as Record<string, unknown>), TerritoryGroup: file.territoryGroup, SourceFileName: file.sourceFileName } as SummaryMetaRow))),
    [selectedFiles]
  );
  const consumableRows = useMemo(() => selectedFiles.flatMap((file) => file.consumablesTable.map((row) => ({ ...row, TerritoryGroup: file.territoryGroup, SourceFileName: file.sourceFileName }))), [selectedFiles]);
  const validationRows = useMemo<ValidationMetaRow[]>(
    () => selectedFiles.flatMap((file) => file.validationReport.map((row) => ({ ...(row as Record<string, unknown>), TerritoryGroup: file.territoryGroup, SourceFileName: file.sourceFileName } as ValidationMetaRow))),
    [selectedFiles]
  );
  const equipmentRowsAll = useMemo(() => buildEquipmentRows(consumableRows as Array<Record<string, unknown> & { TerritoryGroup: TerritoryGroup; SourceFileName: string }>), [consumableRows]);
  const equipmentRowsFiltered = useMemo(() => equipmentRowsAll.filter((row) => byCompanyFilter(row.CustomerID)), [equipmentRowsAll, selectedCustomers]);

  const sections = useMemo<TerritorySection[]>(() => (selectedTerritory ? [selectedTerritory] : []).map((rawGroup) => {
    const group = rawGroup as TerritoryGroup;
    const equipment = equipmentRowsFiltered.filter((row) => row.TerritoryGroup === group);
    const allEquipment = equipmentRowsAll.filter((row) => row.TerritoryGroup === group);
    const summary = summaryRows.filter((row) => row.TerritoryGroup === group);
    const summarySelected = summary.filter((row) => byCompanyFilter(String(row.CustomerID ?? '')));
    const validation = validationRows.filter((row) => row.TerritoryGroup === group && byCompanyFilter(String(row.CustomerID ?? '')));

    const coverageAllBase = aggregateCoverage(allEquipment, (row) => customerLabel(row.CustomerID));
    const coverageSelectedBase = selectedCustomers.length ? aggregateCoverage(equipment, (row) => customerLabel(row.CustomerID)) : [];
    const coverageAll = coverageAllBase.map((row) => {
      const customerId = summary.find((entry) => customerLabel(String(entry.CustomerID ?? '')) === row.label)?.CustomerID;
      const grandTheo = num(summary.find((entry) => String(entry.CustomerID ?? '') === String(customerId ?? ''))?.GrandTotal_Theoretical_CAD);
      const actual = allEquipment.filter((entry) => customerLabel(entry.CustomerID) === row.label).reduce((acc, entry) => acc + entry.ActualValue, 0);
      return { ...row, theoreticalValue: grandTheo, actualValue: actual, coveragePct: grandTheo > 0 ? clampPct((actual / grandTheo) * 100) : (actual > 0 ? 100 : null) };
    });
    const coverageSelected = coverageSelectedBase.map((row) => {
      const customerId = summarySelected.find((entry) => customerLabel(String(entry.CustomerID ?? '')) === row.label)?.CustomerID;
      const grandTheo = num(summarySelected.find((entry) => String(entry.CustomerID ?? '') === String(customerId ?? ''))?.GrandTotal_Theoretical_CAD);
      const actual = equipment.filter((entry) => customerLabel(entry.CustomerID) === row.label).reduce((acc, entry) => acc + entry.ActualValue, 0);
      return { ...row, theoreticalValue: grandTheo, actualValue: actual, coveragePct: grandTheo > 0 ? clampPct((actual / grandTheo) * 100) : (actual > 0 ? 100 : null) };
    });

    const coverageProduct = aggregateCoverage(equipment.filter((row) => row.HasTheoBaseline), (row) => row.Equipment);
    const coverageItem = [...aggregateCoverage(equipment.filter((row) => row.HasTheoBaseline), (row) => `${row.Equipment} / ${row.Item}`)].sort((a, b) => {
      const ai = ITEM_ORDER_INDEX.get(a.label.toLowerCase());
      const bi = ITEM_ORDER_INDEX.get(b.label.toLowerCase());
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a.label.localeCompare(b.label);
    });
    const distBuckets = [{ label: '0-25%', count: 0 }, { label: '25-50%', count: 0 }, { label: '50-75%', count: 0 }, { label: '75-100%', count: 0 }];
    equipment.filter((row) => row.HasTheoBaseline).forEach((row) => {
      if (row.CoveragePct == null) return;
      if (row.CoveragePct < 25) distBuckets[0].count += 1;
      else if (row.CoveragePct < 50) distBuckets[1].count += 1;
      else if (row.CoveragePct < 75) distBuckets[2].count += 1;
      else distBuckets[3].count += 1;
    });
    const opportunities = equipment
      .map((row) => ({ key: `${row.SourceFileName}|${row.CustomerID}|${row.Equipment}|${row.Item}`, customer: customerLabel(row.CustomerID), equipment: row.Equipment, item: row.Item, theo: row.TheoreticalValue, real: row.ActualValue, gap: Math.max(0, row.TheoreticalValue - row.ActualValue) }))
      .filter((row) => row.gap > 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 15);
    const sourceRows = selectedCustomers.length ? equipment : allEquipment;
    const companyIds = [...new Set(sourceRows.map((row) => customerLabel(row.CustomerID)))].sort((a, b) => a.localeCompare(b));
    const equipmentIds = [...new Set(sourceRows.map((row) => row.Equipment))].sort((a, b) => a.localeCompare(b));
    const heatmap = {
      equipment: equipmentIds,
      matrix: companyIds.map((company) => ({
        company,
        cells: equipmentIds.map((eq) => {
          const rowsInCell = sourceRows.filter((row) => customerLabel(row.CustomerID) === company && row.Equipment === eq);
          const theo = rowsInCell.reduce((acc, row) => acc + row.TheoreticalValue, 0);
          const real = rowsInCell.reduce((acc, row) => acc + row.ActualValue, 0);
          return { equipment: eq, coverage: theo > 0 ? clampPct((real / theo) * 100) : (real > 0 ? 100 : null) };
        })
      }))
    };
    const exceptions = equipment.flatMap((row) => {
      const reasons: string[] = [];
      if (row.HasActualNoTheo) reasons.push(t.reasonTheoNoBaseline);
      if (row.HasTheoBaseline && row.ActualValue > row.TheoreticalValue) reasons.push(t.reasonCoverageCapped);
      if (!reasons.length) return [];
      return [{ key: `${row.SourceFileName}|${row.CustomerID}|${row.Equipment}|${row.Item}`, customer: customerLabel(row.CustomerID), equipment: row.Equipment, item: row.Item, theo: row.TheoreticalValue, real: row.ActualValue, reason: reasons.join(' | ') }];
    });

    return {
      group,
      label: territoryGroupLabel(group, uiLang),
      files: selectedFiles.filter((file) => file.territoryGroup === group).map((file) => file.sourceFileName),
      equipment,
      validation,
      coverageAll,
      coverageSelected,
      coverageProduct,
      coverageItem,
      distribution: distBuckets,
      excludedNa: equipment.length - equipment.filter((row) => row.HasTheoBaseline).length,
      opportunities,
      heatmap,
      exceptions
    };
  }), [selectedTerritory, selectedFiles, equipmentRowsFiltered, equipmentRowsAll, summaryRows, validationRows, selectedCustomers, uiLang, potentialCustomerMap]);

  const isDark = uiTheme === 'dark';
  const colors = isDark ? ['#06b6d4', '#22c55e', '#f59e0b', '#a855f7', '#ef4444'] : ['#0284c7', '#16a34a', '#d97706', '#7c3aed', '#dc2626'];
  const tick = { fill: isDark ? '#f8fafc' : '#0f172a', fontSize: 12 };
  const axis = isDark ? '#cbd5e1' : '#64748b';
  const grid = isDark ? '#334155' : '#cbd5e1';
  const tooltipStyle = { backgroundColor: isDark ? '#0f172a' : '#ffffff', border: `1px solid ${isDark ? '#334155' : '#94a3b8'}`, color: isDark ? '#f8fafc' : '#0f172a' };
  const tooltipLabelStyle = { color: isDark ? '#f8fafc' : '#0f172a' };
  const tooltipItemStyle = { color: isDark ? '#f8fafc' : '#0f172a' };
  const chartCollapsed = (group: TerritoryGroup, key: ChartKey) => collapsedCharts[chartId(group, key)] ?? (key === 'selectedCompany' ? selectedCustomers.length === 0 : false);
  const toggleChart = (group: TerritoryGroup, key: ChartKey) => setCollapsedCharts((prev) => ({ ...prev, [chartId(group, key)]: !chartCollapsed(group, key) }));
  const heatColor = (value: number | null) => value == null ? (isDark ? '#1f2937' : '#e5e7eb') : value >= 75 ? (isDark ? '#15803d' : '#86efac') : value >= 50 ? (isDark ? '#ca8a04' : '#fde047') : value >= 25 ? (isDark ? '#ea580c' : '#fdba74') : (isDark ? '#b91c1c' : '#fecaca');

  const renderChart = (group: TerritoryGroup, title: string, dataSet: CoverageRow[], key: ChartKey, options?: { yAxisWidth?: number; compactZeroRows?: boolean; truncateLabelMax?: number; autoLabelWidth?: boolean }) => {
    const yAxisWidthBase = options?.yAxisWidth ?? 170;
    const truncateLabelMax = options?.truncateLabelMax;
    const compactZeroRows = options?.compactZeroRows ?? false;
    if (chartCollapsed(group, key)) return <section className="card p-3">
      <div className="flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button className="card px-3 py-1 text-xs" onClick={() => toggleChart(group, key)}>{t.showChart}</button></div>
      <div className="text-xs text-[var(--text-muted)]">{t.collapsed}</div>
    </section>;
    const rowsForChartAll = dataSet.filter((row) => row.coveragePct != null) as Array<CoverageRow & { coveragePct: number }>;
    const zeroCoverageRows = compactZeroRows ? rowsForChartAll.filter((row) => row.coveragePct === 0) : [];
    const rowsForChart = compactZeroRows ? rowsForChartAll.filter((row) => row.coveragePct > 0) : rowsForChartAll;
    if (!rowsForChart.length && !zeroCoverageRows.length) return <section className="card p-3">
      <div className="flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button className="card px-3 py-1 text-xs" onClick={() => toggleChart(group, key)}>{t.hideChart}</button></div>
      <p className="text-sm text-[var(--text-muted)]">{t.noData}</p>
    </section>;
    if (!rowsForChart.length && zeroCoverageRows.length) return <section className="card p-3">
      <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{title}</h3><button className="card px-3 py-1 text-xs" onClick={() => toggleChart(group, key)}>{t.hideChart}</button></div>
      <p className="text-xs text-[var(--text-muted)] mb-1">{t.zeroCoverageList}</p>
      <div className="text-xs text-[var(--text-muted)] break-words">{zeroCoverageRows.map((row) => row.label).join(' | ')}</div>
    </section>;
    const rowHeight = key === 'allCompany' || key === 'selectedCompany' ? 30 : 28;
    const dynamicHeight = rowsForChart.length * rowHeight;
    const chartHeight = key === 'allCompany' || key === 'selectedCompany'
      ? Math.max(320, dynamicHeight)
      : Math.max(280, Math.min(640, dynamicHeight));
    const computedYAxisWidth = options?.autoLabelWidth
      ? Math.min(760, Math.max(yAxisWidthBase, rowsForChart.reduce((max, row) => Math.max(max, row.label.length), 0) * 7 + 24))
      : yAxisWidthBase;
    return <section className="card p-3">
      <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{title}</h3><button className="card px-3 py-1 text-xs" onClick={() => toggleChart(group, key)}>{t.hideChart}</button></div>
      <div style={{ height: `${chartHeight}px` }}>
        <ResponsiveContainer>
          <BarChart data={rowsForChart} layout="vertical" margin={{ top: 6, right: 24, left: 8, bottom: 6 }}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis type="number" domain={[0, 100]} tick={tick} axisLine={{ stroke: axis }} tickLine={{ stroke: axis }} tickFormatter={(value) => `${Math.round(num(value))}%`} />
            <YAxis type="category" dataKey="label" width={computedYAxisWidth} interval={0} tick={tick} axisLine={{ stroke: axis }} tickLine={{ stroke: axis }} tickFormatter={(value) => truncateLabelMax ? compactLabel(String(value), truncateLabelMax) : String(value)} />
            <Tooltip formatter={(value: number | string) => [pct(value), t.coverage]} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
            <Bar dataKey="coveragePct">{rowsForChart.map((row, index) => <Cell key={`${row.key}-${index}`} fill={colors[index % colors.length]} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!!zeroCoverageRows.length && <div className="mt-2">
        <p className="text-xs text-[var(--text-muted)] mb-1">{t.zeroCoverageList}</p>
        <div className="text-xs text-[var(--text-muted)] break-words">{zeroCoverageRows.map((row) => row.label).join(' | ')}</div>
      </div>}
    </section>;
  };

  const sortEquipmentRows = (rowsIn: EquipmentRow[]) => {
    const rowsCopy = [...rowsIn];
    rowsCopy.sort((a, b) => {
      const direction = equipmentSort.dir === 'asc' ? 1 : -1;
      const key = equipmentSort.key;
      if (key === 'CoveragePct') {
        const av = a.CoveragePct == null ? -1 : a.CoveragePct;
        const bv = b.CoveragePct == null ? -1 : b.CoveragePct;
        return (av - bv) * direction;
      }
      if (key === 'TheoreticalValue' || key === 'ActualValue' || key === 'TheoreticalQty' || key === 'ActualQty') {
        return (a[key] - b[key]) * direction;
      }
      return String(a[key]).localeCompare(String(b[key])) * direction;
    });
    return rowsCopy;
  };

  const onSortEquipment = (key: EquipmentSortKey) => {
    setEquipmentSort((prev) => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });
  };
  const sortIndicator = (key: EquipmentSortKey) => equipmentSort.key === key ? (equipmentSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const filterEquipmentRows = (rowsIn: EquipmentRow[]) => {
    const customerNeedle = normalizeText(equipmentCustomerFilter);
    const equipmentNeedle = normalizeText(equipmentTypeFilter);
    const itemNeedle = normalizeText(equipmentItemFilter);
    return rowsIn.filter((row) => {
      const customerValue = normalizeText(`${customerLabel(row.CustomerID)} ${row.CustomerID}`);
      const equipmentValue = normalizeText(row.Equipment);
      const itemValue = normalizeText(row.Item);
      return (!customerNeedle || customerValue.includes(customerNeedle))
        && (!equipmentNeedle || equipmentValue.includes(equipmentNeedle))
        && (!itemNeedle || itemValue.includes(itemNeedle));
    });
  };
  const applySavedView = (view: PotentialSavedView) => {
    setSelectedTerritory(view.selectedTerritory);
    setSelectedCustomers(view.selectedCustomers);
    setCustomerSearch('');
  };
  const describeSavedView = (view: PotentialSavedView) => {
    const parts = [
      view.selectedTerritory
        ? territoryGroupLabel(view.selectedTerritory as TerritoryGroup, uiLang)
        : 'No territory selected'
    ];
    if (view.selectedCustomers.length) parts.push(`${view.selectedCustomers.length} compan${view.selectedCustomers.length > 1 ? 'ies' : 'y'}`);
    return parts.join(' | ');
  };
  const savedViewItems = savedViews.map((view) => ({
    name: view.name,
    summary: describeSavedView(view.snapshot),
    active: view.name === activeViewName
  }));

  return <div className="space-y-4">
    <PageHeader title={t.title} subtitle={t.subtitle} />
    <SavedViewsPanel
      description="Save the current Potential Tables filters, then apply or delete them whenever needed."
      saveName={saveName}
      onSaveNameChange={setSaveName}
      onSave={saveCurrentView}
      savePlaceholder="Ex: Americas foundry accounts"
      collapsed={savedViewsCollapsed}
      onToggleCollapsed={() => setSavedViewsCollapsed(!savedViewsCollapsed)}
      items={savedViewItems}
      onApply={(name) => {
        const target = savedViews.find((view) => view.name === name);
        if (target) applySavedView(target.snapshot);
      }}
      onDelete={deleteSavedView}
      collapsedSummary={`${formatInteger(savedViews.length)} saved view${savedViews.length === 1 ? '' : 's'}. Expand to manage them.`}
    />
    <AdvancedFiltersPanel
      title={common.filters}
      tip={common.filtersTip}
      actions={<button className="card px-3 py-1 text-xs" onClick={() => { setSelectedTerritory(''); setCustomerSearch(''); setSelectedCustomers([]); }}>{common.resetFilters}</button>}
    >
      <div className="grid xl:grid-cols-3 gap-3">
        <SinglePick label={t.territoryGroups} options={territoryOptions} value={selectedTerritory} onChange={setSelectedTerritory} />
        <div className="space-y-2">
          <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={common.searchCustomer} className="card w-full px-2 py-1 text-xs" />
          <MultiPickFilter label={t.companies} options={customerOptions} values={selectedCustomers} onChange={setSelectedCustomers} heightClass="h-32" />
        </div>
      </div>
    </AdvancedFiltersPanel>

    {(!!selectedTerritory || selectedCustomers.length > 0) && <div className="flex flex-wrap gap-2">
      {!!selectedTerritory && <button className="card px-2 py-1 text-xs" onClick={() => setSelectedTerritory('')}>{t.applied}: {territoryGroupLabel(selectedTerritory as TerritoryGroup, uiLang)} x</button>}
      {selectedCustomers.map((value) => <button key={`company-${value}`} className="card px-2 py-1 text-xs" onClick={() => setSelectedCustomers((prev) => prev.filter((entry) => entry !== value))}>{t.applied}: {customerLabel(value)} x</button>)}
    </div>}

    {!!globalTerritoryCoverage.length && <section className="space-y-2">
      <h3 className="font-semibold">{t.globalCoverageTitle}</h3>
      <div className="grid xl:grid-cols-3 gap-3">
        {globalTerritoryCoverage.map((entry) => <article key={`global-${entry.group}`} className="card p-3">
          <h4 className="font-semibold mb-1">{entry.label}</h4>
          <p className="text-lg font-bold">{entry.coverage == null ? t.na : pct(entry.coverage)}</p>
          <p className="text-xs text-[var(--text-muted)]">{t.importedFilesLabel}: {entry.files.toLocaleString()} | {t.importedCustomers}: {entry.customers.toLocaleString()}</p>
          <p className="text-xs text-[var(--text-muted)]">{t.globalTheoretical}: {money(entry.theoretical)}</p>
          <p className="text-xs text-[var(--text-muted)]">{t.globalActual}: {money(entry.actual)}</p>
        </article>)}
      </div>
    </section>}

    {!files.length && <section className="card p-4 text-sm text-[var(--text-muted)]">{t.noData}</section>}
    {!!files.length && !selectedTerritory && <section className="card p-4 text-sm text-[var(--text-muted)]">{t.chooseTerritories}</section>}

    {sections.map((section) => <section key={section.group} className="card p-4 space-y-4">
      <div><h2 className="font-semibold">{section.label}</h2><p className="text-xs text-[var(--text-muted)]">{t.files}: {section.files.join(', ') || '-'}</p></div>
      <section className="space-y-4">
        <h3 className="font-semibold">{t.charts}</h3>
        {renderChart(section.group, t.byCompanyAll, section.coverageAll, 'allCompany', { yAxisWidth: 520, autoLabelWidth: true })}
        {renderChart(section.group, t.byCompanySelected, section.coverageSelected, 'selectedCompany', { yAxisWidth: 520, autoLabelWidth: true })}
        <div className="grid xl:grid-cols-2 gap-4">
          {renderChart(section.group, t.byProduct, section.coverageProduct, 'product', { yAxisWidth: 180, compactZeroRows: true })}
          {renderChart(section.group, t.byItem, section.coverageItem, 'item', { yAxisWidth: 190, compactZeroRows: true })}
        </div>
      </section>

      <section className="card p-3">
        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{t.distribution}</h3><button className="card px-3 py-1 text-xs" onClick={() => toggleChart(section.group, 'distribution')}>{chartCollapsed(section.group, 'distribution') ? t.showChart : t.hideChart}</button></div>
        {chartCollapsed(section.group, 'distribution')
          ? <div className="text-xs text-[var(--text-muted)]">{t.collapsed}</div>
          : <div className="h-[20rem]"><ResponsiveContainer><BarChart data={section.distribution}><CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="label" tick={tick} axisLine={{ stroke: axis }} tickLine={{ stroke: axis }} /><YAxis tick={tick} axisLine={{ stroke: axis }} tickLine={{ stroke: axis }} /><Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Bar dataKey="count">{section.distribution.map((row, index) => <Cell key={`${row.label}-${index}`} fill={colors[index % colors.length]} />)}</Bar></BarChart></ResponsiveContainer></div>}
      </section>

      <section className="card p-3">
        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{t.opportunities}</h3><button className="card px-3 py-1 text-xs" onClick={() => toggleChart(section.group, 'opportunities')}>{chartCollapsed(section.group, 'opportunities') ? t.showChart : t.hideChart}</button></div>
        {chartCollapsed(section.group, 'opportunities')
          ? <div className="text-xs text-[var(--text-muted)]">{t.collapsed}</div>
          : (!section.opportunities.length ? <p className="text-sm text-[var(--text-muted)]">{t.noData}</p> : <div className="overflow-auto max-h-[18rem]"><table className="w-full table-auto text-xs"><thead className="bg-[var(--surface)] sticky top-0"><tr><th className="px-2 py-2 text-left whitespace-nowrap">{t.customer}</th><th className="px-2 py-2 text-left whitespace-nowrap">{t.equipmentCol}</th><th className="px-2 py-2 text-left whitespace-nowrap">{t.item}</th><th className="px-2 py-2 text-left whitespace-nowrap">{t.theoValue}</th><th className="px-2 py-2 text-left whitespace-nowrap">{t.realValue}</th><th className="px-2 py-2 text-left whitespace-nowrap">$ gap</th></tr></thead><tbody>{section.opportunities.map((row) => <tr key={row.key} className="border-b border-[var(--border)]"><td className="px-2 py-1 whitespace-nowrap">{row.customer}</td><td className="px-2 py-1 whitespace-nowrap">{row.equipment}</td><td className="px-2 py-1 whitespace-nowrap">{row.item}</td><td className="px-2 py-1 whitespace-nowrap">{money(row.theo)}</td><td className="px-2 py-1 whitespace-nowrap">{money(row.real)}</td><td className="px-2 py-1 whitespace-nowrap">{money(row.gap)}</td></tr>)}</tbody></table></div>)}
      </section>

      <section className="card p-3">
        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{t.heatmap}</h3><button className="card px-3 py-1 text-xs" onClick={() => toggleChart(section.group, 'heatmap')}>{chartCollapsed(section.group, 'heatmap') ? t.showChart : t.hideChart}</button></div>
        {chartCollapsed(section.group, 'heatmap')
          ? <div className="text-xs text-[var(--text-muted)]">{t.collapsed}</div>
          : (!section.heatmap.matrix.length ? <p className="text-sm text-[var(--text-muted)]">{t.noData}</p> : <div className="overflow-auto"><table className="w-full table-auto text-xs"><thead className="bg-[var(--surface)] sticky top-0"><tr><th className="px-2 py-2 text-left whitespace-nowrap">{t.customer}</th>{section.heatmap.equipment.map((entry) => <th key={entry} className="px-2 py-2 text-center whitespace-nowrap">{entry}</th>)}</tr></thead><tbody>{section.heatmap.matrix.map((row) => <tr key={row.company} className="border-b border-[var(--border)]"><td className="px-2 py-1 whitespace-nowrap">{row.company}</td>{row.cells.map((cell) => <td key={`${row.company}-${cell.equipment}`} className="px-2 py-1 text-center font-semibold" style={{ backgroundColor: heatColor(cell.coverage), color: isDark ? '#f8fafc' : '#0f172a' }}>{cell.coverage == null ? t.na : pct(cell.coverage)}</td>)}</tr>)}</tbody></table></div>)}
      </section>

      <section className="card p-3">
        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{t.exceptions}</h3><button className="card px-3 py-1 text-xs" onClick={() => toggleChart(section.group, 'exceptions')}>{chartCollapsed(section.group, 'exceptions') ? t.showChart : t.hideChart}</button></div>
        {chartCollapsed(section.group, 'exceptions')
          ? <div className="text-xs text-[var(--text-muted)]">{t.collapsed}</div>
          : (!section.exceptions.length ? <p className="text-sm text-[var(--text-muted)]">{t.noData}</p> : <div className="overflow-auto max-h-[16rem]"><table className="w-full table-auto text-xs"><thead className="bg-[var(--surface)] sticky top-0"><tr><th className="px-2 py-2 text-left whitespace-nowrap">{t.customer}</th><th className="px-2 py-2 text-left whitespace-nowrap">{t.equipmentCol}</th><th className="px-2 py-2 text-left whitespace-nowrap">{t.item}</th><th className="px-2 py-2 text-left whitespace-nowrap">{t.theoValue}</th><th className="px-2 py-2 text-left whitespace-nowrap">{t.realValue}</th><th className="px-2 py-2 text-left whitespace-nowrap">{t.reason}</th></tr></thead><tbody>{section.exceptions.map((row) => <tr key={row.key} className="border-b border-[var(--border)]"><td className="px-2 py-1 whitespace-nowrap">{row.customer}</td><td className="px-2 py-1 whitespace-nowrap">{row.equipment}</td><td className="px-2 py-1 whitespace-nowrap">{row.item}</td><td className="px-2 py-1 whitespace-nowrap">{money(row.theo)}</td><td className="px-2 py-1 whitespace-nowrap">{money(row.real)}</td><td className="px-2 py-1 whitespace-nowrap">{row.reason}</td></tr>)}</tbody></table></div>)}
      </section>

      <section className="card overflow-auto">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]"><h3 className="font-semibold">{t.equipment}</h3><button className="card px-3 py-1 text-xs" onClick={() => setShowEquipment((value) => !value)}>{showEquipment ? t.hide : t.show}</button></div>
        <div className="grid md:grid-cols-3 gap-2 p-3 border-b border-[var(--border)]">
          <input value={equipmentCustomerFilter} onChange={(event) => setEquipmentCustomerFilter(event.target.value)} placeholder={t.filterCustomer} className="card px-2 py-1 text-xs" />
          <input value={equipmentTypeFilter} onChange={(event) => setEquipmentTypeFilter(event.target.value)} placeholder={t.filterEquipment} className="card px-2 py-1 text-xs" />
          <input value={equipmentItemFilter} onChange={(event) => setEquipmentItemFilter(event.target.value)} placeholder={t.filterItem} className="card px-2 py-1 text-xs" />
        </div>
        {!showEquipment
          ? <div className="p-3 text-xs text-[var(--text-muted)]">{t.collapsed}</div>
          : (!filterEquipmentRows(section.equipment).length ? <div className="p-3 text-sm text-[var(--text-muted)]">{t.noData}</div> : <table className="w-full table-auto text-xs">
            <thead className="bg-[var(--surface)] sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left whitespace-nowrap"><button type="button" className="text-left" onClick={() => onSortEquipment('CustomerID')}>{t.customer}{sortIndicator('CustomerID')}</button></th>
                <th className="px-2 py-2 text-left whitespace-nowrap"><button type="button" className="text-left" onClick={() => onSortEquipment('Equipment')}>{t.equipmentCol}{sortIndicator('Equipment')}</button></th>
                <th className="px-2 py-2 text-left whitespace-nowrap"><button type="button" className="text-left" onClick={() => onSortEquipment('Item')}>{t.item}{sortIndicator('Item')}</button></th>
                <th className="px-2 py-2 text-left whitespace-nowrap"><button type="button" className="text-left" onClick={() => onSortEquipment('TheoreticalValue')}>{t.theoValue}{sortIndicator('TheoreticalValue')}</button></th>
                <th className="px-2 py-2 text-left whitespace-nowrap"><button type="button" className="text-left" onClick={() => onSortEquipment('ActualValue')}>{t.realValue}{sortIndicator('ActualValue')}</button></th>
                <th className="px-2 py-2 text-left whitespace-nowrap"><button type="button" className="text-left" onClick={() => onSortEquipment('TheoreticalQty')}>{t.theoQty}{sortIndicator('TheoreticalQty')}</button></th>
                <th className="px-2 py-2 text-left whitespace-nowrap"><button type="button" className="text-left" onClick={() => onSortEquipment('ActualQty')}>{t.realQty}{sortIndicator('ActualQty')}</button></th>
                <th className="px-2 py-2 text-left whitespace-nowrap"><button type="button" className="text-left" onClick={() => onSortEquipment('CoveragePct')}>{t.coverage}{sortIndicator('CoveragePct')}</button></th>
              </tr>
            </thead>
            <tbody>
              {sortEquipmentRows(filterEquipmentRows(section.equipment)).map((row, index) => <tr key={`${row.SourceFileName}-${row.CustomerID}-${row.Equipment}-${row.Item}-${index}`} className="border-b border-[var(--border)]">
                <td className="px-2 py-1 whitespace-nowrap">{customerLabel(row.CustomerID)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.Equipment}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.Item}</td>
                <td className="px-2 py-1 whitespace-nowrap">{money(row.TheoreticalValue)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{money(row.ActualValue)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{qty(row.TheoreticalQty)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{qty(row.ActualQty)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.CoveragePct == null ? t.na : pct(row.CoveragePct)}</td>
              </tr>)}
            </tbody>
          </table>)}
      </section>

      <section className="card overflow-auto">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]"><h3 className="font-semibold">{t.validation}</h3><button className="card px-3 py-1 text-xs" onClick={() => setShowValidation((value) => !value)}>{showValidation ? t.hide : t.show}</button></div>
        {!showValidation
          ? <div className="p-3 text-xs text-[var(--text-muted)]">{t.collapsed}</div>
          : (!section.validation.length ? <div className="p-3 text-sm text-[var(--text-muted)]">{t.noData}</div> : <table className="w-full table-auto text-xs"><thead className="bg-[var(--surface)] sticky top-0"><tr>{Object.keys(section.validation[0]).map((column) => <th key={column} className="px-2 py-2 text-left whitespace-nowrap">{column}</th>)}</tr></thead><tbody>{section.validation.slice(0, 2000).map((row, index) => <tr key={`${section.group}-validation-${index}`} className="border-b border-[var(--border)]">{Object.keys(section.validation[0]).map((column) => <td key={column} className="px-2 py-1 whitespace-nowrap">{String(row[column] ?? '')}</td>)}</tr>)}</tbody></table>)}
      </section>
    </section>)}
  </div>;
}
