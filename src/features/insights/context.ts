import {
  getKPIs,
  getPricingKPIs,
  getRevenueByProdGroup,
  getRevenueCostProfitOverTime,
  type Filters
} from '@/data/queries';
import { detectTerritoryGroup } from '@/data/potentialTerritories';
import type { InsightsContextPack, InsightsPotentialFileSummary, InsightsPotentialViewState } from '@/features/insights/chatTypes';
import { monthEnd, monthStart } from '@/utils/monthRange';

type DatasetMeta = {
  rowCount: number;
  customers: number;
  parts: number;
  dateRange: string;
} | null;

type PotentialStoredFile = {
  sourceFileName: string;
  territoryGroup?: string;
  summaryTable?: Record<string, unknown>[];
  consumablesTable?: Record<string, unknown>[];
  validationReport?: Record<string, unknown>[];
};

const parsePotentialFiles = (potentialRaw: Record<string, unknown> | undefined) => {
  if (!potentialRaw) return [] as PotentialStoredFile[];
  const files = Array.isArray(potentialRaw.files) ? potentialRaw.files as PotentialStoredFile[] : [];
  if (files.length) return files;
  if (Array.isArray(potentialRaw.summaryTable)) {
    return [{
      sourceFileName: String(potentialRaw.sourceFileName ?? 'Legacy Potential Workbook'),
      territoryGroup: detectTerritoryGroup(String(potentialRaw.sourceFileName ?? '')),
      summaryTable: potentialRaw.summaryTable as Record<string, unknown>[],
      consumablesTable: Array.isArray(potentialRaw.consumablesTable) ? potentialRaw.consumablesTable as Record<string, unknown>[] : [],
      validationReport: Array.isArray(potentialRaw.validationReport) ? potentialRaw.validationReport as Record<string, unknown>[] : []
    }];
  }
  return [] as PotentialStoredFile[];
};

const summarizePotentialFiles = (files: PotentialStoredFile[]): InsightsPotentialFileSummary[] => files.map((file) => {
  const validation = Array.isArray(file.validationReport) ? file.validationReport : [];
  return {
    fileName: file.sourceFileName,
    territoryGroup: String(file.territoryGroup ?? detectTerritoryGroup(file.sourceFileName)),
    summaryRows: Array.isArray(file.summaryTable) ? file.summaryTable.length : 0,
    validationRows: validation.length,
    invalidRows: validation.filter((row) => !Boolean(row.IsValid)).length
  };
});

const toStringArray = (value: unknown) => Array.isArray(value) ? value.map((entry) => String(entry)) : [];

const buildPricingFiltersFromState = (stateRaw: Record<string, unknown> | undefined): Filters => {
  const state = stateRaw ?? {};
  const periodMode = String(state.periodMode ?? 'all');
  const fromMonth = String(state.fromMonth ?? '');
  const toMonth = String(state.toMonth ?? '');
  const filters: Filters = {
    customers: toStringArray(state.selectedCustomers).length ? toStringArray(state.selectedCustomers) : undefined,
    countries: toStringArray(state.selectedCountries).length ? toStringArray(state.selectedCountries) : undefined,
    territories: toStringArray(state.selectedTerritories).length ? toStringArray(state.selectedTerritories) : undefined,
    parts: toStringArray(state.selectedParts).length ? toStringArray(state.selectedParts) : undefined,
    prodGroups: toStringArray(state.selectedProdGroups).length ? toStringArray(state.selectedProdGroups) : undefined,
    classes: toStringArray(state.selectedClasses).length ? toStringArray(state.selectedClasses) : undefined,
    searchLineDesc: state.searchText ? String(state.searchText) : undefined
  };
  if (periodMode === 'after') filters.startDate = monthStart(fromMonth) || undefined;
  if (periodMode === 'before') filters.endDate = monthEnd(toMonth) || undefined;
  if (periodMode === 'between') {
    filters.startDate = monthStart(fromMonth) || undefined;
    filters.endDate = monthEnd(toMonth) || undefined;
  }
  return filters;
};

const buildPricingComparatorBaseFiltersFromState = (stateRaw: Record<string, unknown> | undefined): Filters => {
  const state = stateRaw ?? {};
  const periodMode = String(state.comparatorPeriodMode ?? 'all');
  const fromMonth = String(state.comparatorFromMonth ?? '');
  const toMonth = String(state.comparatorToMonth ?? '');
  const compareAlsoByPart = String(state.comparatorByPartEnabled ?? 'no') === 'yes';
  const selectedPart = toStringArray(state.comparatorSelectedPart)[0];
  const filters: Filters = {
    territories: toStringArray(state.selectedTerritories).length ? toStringArray(state.selectedTerritories) : undefined,
    classes: toStringArray(state.selectedClasses).length ? toStringArray(state.selectedClasses) : undefined,
    searchLineDesc: state.searchText ? String(state.searchText) : undefined,
    parts: compareAlsoByPart && selectedPart ? [selectedPart] : undefined
  };
  if (periodMode === 'after') filters.startDate = monthStart(fromMonth) || undefined;
  if (periodMode === 'before') filters.endDate = monthEnd(toMonth) || undefined;
  if (periodMode === 'between') {
    filters.startDate = monthStart(fromMonth) || undefined;
    filters.endDate = monthEnd(toMonth) || undefined;
  }
  return filters;
};

const applyComparatorFilter = (filters: Filters, compareBy: string, value: string): Filters => {
  if (compareBy === 'country') return { ...filters, countries: [value] };
  if (compareBy === 'customer') return { ...filters, customers: [value] };
  if (compareBy === 'part_num') return { ...filters, parts: [value] };
  if (compareBy === 'prod_group') return { ...filters, prodGroups: [value] };
  return filters;
};

type PotentialEquipmentRow = {
  customerId: string;
  customerLabel: string;
  equipment: string;
  item: string;
  theoretical: number;
  actual: number;
  coverage: number | null;
  hasTheoBaseline: boolean;
  hasActualNoTheo: boolean;
};

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampPct = (value: number) => Math.max(0, Math.min(100, value));

const rows = (value: unknown) => Array.isArray(value)
  ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
  : [];

const coverageFromTotals = (theoretical: number, actual: number) => (theoretical > 0 ? clampPct((actual / theoretical) * 100) : (actual > 0 ? 100 : null));

const buildPotentialSignals = (
  potentialFiles: PotentialStoredFile[],
  activeView: InsightsPotentialViewState
): InsightsContextPack['signals']['potential'] => {
  const selectedTerritory = activeView.selectedTerritory ? String(activeView.selectedTerritory) : '';
  const selectedCustomers = Array.isArray(activeView.selectedCustomers)
    ? activeView.selectedCustomers.map((value) => String(value))
    : [];
  const scopedFiles = selectedTerritory
    ? potentialFiles.filter((file) => String(file.territoryGroup ?? detectTerritoryGroup(file.sourceFileName)) === selectedTerritory)
    : potentialFiles;
  const filesInScope = scopedFiles.map((file) => file.sourceFileName);

  const customerNameById = new Map<string, string>();
  const grandTheoByCustomer = new Map<string, number>();
  const sumTheoByCustomer = new Map<string, number>();

  scopedFiles.forEach((file) => {
    rows(file.summaryTable).forEach((row) => {
      const customerId = String(row.CustomerID ?? '').trim();
      if (!customerId) return;
      const name = String(row.ClientName ?? '').trim();
      if (name && !customerNameById.has(customerId)) customerNameById.set(customerId, name);
      grandTheoByCustomer.set(customerId, (grandTheoByCustomer.get(customerId) ?? 0) + num(row.GrandTotal_Theoretical_CAD));
    });
    rows(file.consumablesTable).forEach((row) => {
      const customerId = String(row.CustomerID ?? '').trim();
      if (!customerId) return;
      const name = String(row.ClientName ?? '').trim();
      if (name && !customerNameById.has(customerId)) customerNameById.set(customerId, name);
      sumTheoByCustomer.set(customerId, (sumTheoByCustomer.get(customerId) ?? 0) + num(row.TheoreticalValue));
    });
  });

  const customerLabel = (customerId: string) => {
    const name = customerNameById.get(customerId);
    return name ? `${customerId} - ${name}` : customerId;
  };

  const allRows = scopedFiles.flatMap((file) => rows(file.consumablesTable).map((row) => {
    const theoretical = num(row.TheoreticalValue);
    const actual = num(row.ActualValue);
    const customerId = String(row.CustomerID ?? '').trim();
    return {
      customerId,
      customerLabel: customerLabel(customerId),
      equipment: String(row.EquipmentType ?? ''),
      item: String(row.ConsumableName ?? ''),
      theoretical,
      actual,
      coverage: coverageFromTotals(theoretical, actual),
      hasTheoBaseline: theoretical > 0,
      hasActualNoTheo: theoretical === 0 && actual > 0
    } satisfies PotentialEquipmentRow;
  }));

  const selectedRows = selectedCustomers.length
    ? allRows.filter((row) => selectedCustomers.includes(row.customerId))
    : allRows;

  const aggregate = <K extends string>(rowsIn: PotentialEquipmentRow[], getKey: (row: PotentialEquipmentRow) => K) => {
    const grouped = new Map<K, { theoretical: number; actual: number }>();
    rowsIn.forEach((row) => {
      const key = getKey(row);
      const current = grouped.get(key) ?? { theoretical: 0, actual: 0 };
      current.theoretical += row.theoretical;
      current.actual += row.actual;
      grouped.set(key, current);
    });
    return grouped;
  };

  const sortCoverageAsc = <T extends { coverage_pct: number | null; theoretical: number; actual: number }>(rowsIn: T[]) => [...rowsIn]
    .sort((a, b) => {
      const av = a.coverage_pct == null ? Number.POSITIVE_INFINITY : a.coverage_pct;
      const bv = b.coverage_pct == null ? Number.POSITIVE_INFINITY : b.coverage_pct;
      if (av !== bv) return av - bv;
      return (b.theoretical - a.theoretical) || (b.actual - a.actual);
    });

  const sumActualByCustomer = (rowsIn: PotentialEquipmentRow[]) => {
    const grouped = new Map<string, number>();
    rowsIn.forEach((row) => grouped.set(row.customerId, (grouped.get(row.customerId) ?? 0) + row.actual));
    return grouped;
  };

  const buildCompanyCoverage = (rowsIn: PotentialEquipmentRow[], forcedCustomerIds?: string[]) => {
    const actualByCustomer = sumActualByCustomer(rowsIn);
    const candidateIds = forcedCustomerIds?.length
      ? forcedCustomerIds
      : [...new Set([...grandTheoByCustomer.keys(), ...actualByCustomer.keys()])];
    const rowsOut = candidateIds.map((customerId) => {
      const theoretical = grandTheoByCustomer.get(customerId) ?? sumTheoByCustomer.get(customerId) ?? 0;
      const actual = actualByCustomer.get(customerId) ?? 0;
      return {
        customer: customerLabel(customerId),
        theoretical,
        actual,
        coverage_pct: coverageFromTotals(theoretical, actual)
      };
    });
    return sortCoverageAsc(rowsOut).slice(0, 40);
  };

  const productCoverage = sortCoverageAsc(
    [...aggregate(selectedRows.filter((row) => row.hasTheoBaseline), (row) => row.equipment).entries()].map(([product, value]) => ({
      product,
      theoretical: value.theoretical,
      actual: value.actual,
      coverage_pct: coverageFromTotals(value.theoretical, value.actual)
    }))
  ).slice(0, 30);

  const itemCoverage = sortCoverageAsc(
    [...aggregate(selectedRows.filter((row) => row.hasTheoBaseline), (row) => `${row.equipment} / ${row.item}`).entries()].map(([item, value]) => ({
      item,
      theoretical: value.theoretical,
      actual: value.actual,
      coverage_pct: coverageFromTotals(value.theoretical, value.actual)
    }))
  ).slice(0, 50);

  const distribution = [
    { bucket: '0-25%', count: 0 },
    { bucket: '25-50%', count: 0 },
    { bucket: '50-75%', count: 0 },
    { bucket: '75-100%', count: 0 }
  ];
  selectedRows.filter((row) => row.hasTheoBaseline).forEach((row) => {
    if (row.coverage == null) return;
    if (row.coverage < 25) distribution[0].count += 1;
    else if (row.coverage < 50) distribution[1].count += 1;
    else if (row.coverage < 75) distribution[2].count += 1;
    else distribution[3].count += 1;
  });

  const selectedCompanyIds = selectedCustomers.length
    ? selectedCustomers
    : [...new Set(selectedRows.map((row) => row.customerId))];
  const selectedGrandTheo = selectedCompanyIds.reduce(
    (acc, customerId) => acc + (grandTheoByCustomer.get(customerId) ?? sumTheoByCustomer.get(customerId) ?? 0),
    0
  );
  const selectedActual = selectedRows.reduce((acc, row) => acc + row.actual, 0);

  return {
    selectedTerritory: selectedTerritory || null,
    selectedCustomers,
    filesInScope,
    customersInScope: selectedCompanyIds.length,
    equipmentRowsInScope: selectedRows.length,
    coverage: {
      theoretical: selectedGrandTheo,
      actual: selectedActual,
      pct: coverageFromTotals(selectedGrandTheo, selectedActual)
    },
    coverageByCompanyAll: buildCompanyCoverage(allRows),
    coverageByCompanySelected: selectedCustomers.length ? buildCompanyCoverage(selectedRows, selectedCustomers) : [],
    coverageByProduct: productCoverage,
    coverageByItem: itemCoverage,
    distribution,
    exceptionsCount: selectedRows.filter((row) => row.hasActualNoTheo || (row.hasTheoBaseline && row.actual > row.theoretical)).length,
    naRowsCount: selectedRows.filter((row) => !row.hasTheoBaseline && row.actual === 0).length
  };
};

export async function buildInsightsContextPack(args: {
  route: string;
  language: 'fr' | 'en';
  globalFilters: Filters;
  datasetMeta: DatasetMeta;
  potentialRaw: Record<string, unknown> | undefined;
  potentialViewRaw: Record<string, unknown> | undefined;
  pricingViewRaw: Record<string, unknown> | undefined;
}): Promise<InsightsContextPack> {
  const isPricingComparatorRoute = args.route.startsWith('/pricing-comparator') || args.route.startsWith('/pricing/comparator');
  const isPricingRoute = args.route.startsWith('/pricing') && !isPricingComparatorRoute;
  const isPotentialRoute = args.route.startsWith('/potential-tables') || args.route.startsWith('/insights') || args.route.startsWith('/tips');
  const effectiveFilters = isPricingComparatorRoute
    ? buildPricingComparatorBaseFiltersFromState(args.pricingViewRaw)
    : (isPricingRoute ? buildPricingFiltersFromState(args.pricingViewRaw) : (isPotentialRoute ? {} : args.globalFilters));

  const potentialFiles = parsePotentialFiles(args.potentialRaw);
  const files = isPotentialRoute ? summarizePotentialFiles(potentialFiles) : [];
  const activeView: InsightsPotentialViewState = {
    selectedTerritory: isPotentialRoute && args.potentialViewRaw?.selectedTerritory ? String(args.potentialViewRaw.selectedTerritory) : undefined,
    selectedCustomers: isPotentialRoute && Array.isArray(args.potentialViewRaw?.selectedCustomers) ? args.potentialViewRaw?.selectedCustomers.map((value) => String(value)) : undefined,
    equipmentCustomerFilter: isPotentialRoute && args.potentialViewRaw?.equipmentCustomerFilter ? String(args.potentialViewRaw.equipmentCustomerFilter) : undefined,
    equipmentTypeFilter: isPotentialRoute && args.potentialViewRaw?.equipmentTypeFilter ? String(args.potentialViewRaw.equipmentTypeFilter) : undefined,
    equipmentItemFilter: isPotentialRoute && args.potentialViewRaw?.equipmentItemFilter ? String(args.potentialViewRaw.equipmentItemFilter) : undefined
  };

  const signals: InsightsContextPack['signals'] = {};
  if (isPricingComparatorRoute) {
    const compareBy = String(args.pricingViewRaw?.comparatorCompareBy ?? 'country');
    const selectedValues = toStringArray(args.pricingViewRaw?.comparatorSelectedValues).slice(0, 5);
    const selectedPart = toStringArray(args.pricingViewRaw?.comparatorSelectedPart)[0] ?? null;
    const periodMode = String(args.pricingViewRaw?.comparatorPeriodMode ?? 'all');
    const fromMonth = String(args.pricingViewRaw?.comparatorFromMonth ?? '');
    const toMonth = String(args.pricingViewRaw?.comparatorToMonth ?? '');
    const totals: Array<{ value: string; revenue: number; cost: number; profit: number; margin_pct: number }> = [];
    try {
      await Promise.all(selectedValues.map(async (value) => {
        const scopedFilters = applyComparatorFilter(effectiveFilters, compareBy, value);
        const rows = await getRevenueCostProfitOverTime(scopedFilters, true, 'monthly');
        const totalsRow = (rows as Record<string, unknown>[]).reduce<{ revenue: number; cost: number; profit: number }>(
          (acc, row) => ({
            revenue: acc.revenue + Number(row.revenue ?? 0),
            cost: acc.cost + Number(row.cost ?? 0),
            profit: acc.profit + Number(row.profit ?? 0)
          }),
          { revenue: 0, cost: 0, profit: 0 }
        );
        const margin_pct = totalsRow.revenue > 0 ? totalsRow.profit / totalsRow.revenue : 0;
        totals.push({ value, ...totalsRow, margin_pct });
      }));
    } catch {
      // Keep comparator context even if data queries fail.
    }
    signals.pricingComparator = {
      compareBy,
      selectedValues,
      selectedPart,
      periodMode,
      fromMonth,
      toMonth,
      totals
    };
  } else if (isPricingRoute) {
    const [pricingKpiResult, trendResult] = await Promise.allSettled([
      getPricingKPIs(effectiveFilters, true),
      getRevenueCostProfitOverTime(effectiveFilters, true, 'monthly')
    ]);
    if (pricingKpiResult.status === 'fulfilled') {
      const pricingKpis = pricingKpiResult.value;
      signals.pricingKpis = Object.fromEntries(Object.entries(pricingKpis ?? {}).map(([key, value]) => [key, Number(value ?? 0)]));
    }
    if (trendResult.status === 'fulfilled') {
      signals.pricingTrend = trendResult.value.slice(-12).map((row) => ({
        period: String(row.period ?? ''),
        revenue: Number(row.revenue ?? 0),
        cost: Number(row.cost ?? 0),
        profit: Number(row.profit ?? 0),
        margin_pct: Number(row.margin_pct ?? 0)
      }));
    }
  } else if (isPotentialRoute) {
    signals.potential = buildPotentialSignals(potentialFiles, activeView);
  } else {
    const [kpiResult, prodGroupResult] = await Promise.allSettled([
      getKPIs(effectiveFilters),
      getRevenueByProdGroup(effectiveFilters)
    ]);
    if (kpiResult.status === 'fulfilled' && kpiResult.value) {
      signals.kpis = Object.fromEntries(Object.entries(kpiResult.value).map(([key, value]) => [key, Number(value ?? 0)]));
    }
    if (prodGroupResult.status === 'fulfilled') {
      signals.topProdGroups = prodGroupResult.value.slice(0, 8).map((row) => ({ prod_group: String(row.prod_group ?? '-'), revenue: Number(row.revenue ?? 0) }));
    }
  }

  return {
    route: args.route,
    language: args.language,
    filters: effectiveFilters,
    scope: {
      page: isPricingComparatorRoute ? 'pricing-comparator' : (isPricingRoute ? 'pricing' : (args.route.startsWith('/potential-tables') ? 'potential-tables' : 'general')),
      filterSource: isPricingComparatorRoute ? 'pricing-comparator' : (isPricingRoute ? 'pricing' : (isPotentialRoute ? 'potential' : 'global')),
      pageState: isPricingComparatorRoute
        ? {
          compareBy: String(args.pricingViewRaw?.comparatorCompareBy ?? 'country'),
          selectedValues: toStringArray(args.pricingViewRaw?.comparatorSelectedValues).slice(0, 5),
          selectedPart: toStringArray(args.pricingViewRaw?.comparatorSelectedPart)[0] ?? null
        }
        : (isPricingRoute ? {
          periodMode: String(args.pricingViewRaw?.periodMode ?? 'all'),
          fromMonth: String(args.pricingViewRaw?.fromMonth ?? ''),
          toMonth: String(args.pricingViewRaw?.toMonth ?? '')
        } : (isPotentialRoute ? {
          selectedTerritory: activeView.selectedTerritory ?? null,
          selectedCustomers: activeView.selectedCustomers ?? [],
          equipmentCustomerFilter: activeView.equipmentCustomerFilter ?? '',
          equipmentTypeFilter: activeView.equipmentTypeFilter ?? '',
          equipmentItemFilter: activeView.equipmentItemFilter ?? ''
        } : undefined))
    },
    dataset: {
      loaded: !!args.datasetMeta,
      rowCount: Number(args.datasetMeta?.rowCount ?? 0),
      customers: Number(args.datasetMeta?.customers ?? 0),
      parts: Number(args.datasetMeta?.parts ?? 0),
      dateRange: String(args.datasetMeta?.dateRange ?? '')
    },
    potential: {
      importedFiles: potentialFiles.length,
      files,
      activeView
    },
    signals
  };
}
