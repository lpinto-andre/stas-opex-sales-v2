import * as XLSX from 'xlsx';

export type PotentialRow = Record<string, string | number | null | boolean>;
export type ValidationRow = {
  SheetName: string;
  CustomerID: string;
  MissingCriticalCount: number;
  TotalCriticalChecked: number;
  MissingCriticalRatio: number;
  MissingCriticalCells: string[];
  MissingWarningCells: string[];
  IsValid: boolean;
};

export type PotentialExtraction = {
  summaryTable: PotentialRow[];
  consumablesTable: PotentialRow[];
  equipmentSummaryTable: PotentialRow[];
  validationReport: ValidationRow[];
  warningNoDashSheets: string[];
};

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const readCell = (sheet: XLSX.WorkSheet, addr: string) => sheet[addr]?.v ?? null;

const CRITICAL = [
  'D2', 'G43',
  'D11', 'E11', 'F11', 'G11', 'D15', 'E15', 'F15', 'G15', 'D19', 'E19', 'F19', 'G19', 'H19', 'I19', 'D23', 'E23', 'D27', 'E27', 'D31', 'E31', 'F35', 'G35', 'D39', 'E39', 'F39', 'G39', 'H39', 'I39',
  'C41', 'C42', 'C43', 'E41', 'E42', 'E43', 'G41', 'G42', 'G43'
];
const WARNING = ['D4', 'D5', 'D6', 'D7', 'E3', 'C10', 'C11', 'C14', 'C15', 'C18', 'C19', 'C22', 'C26', 'C30', 'C31', 'C34', 'C35', 'C38', 'C39'];

const LINES = [
  ['ACD', 'Graphite', 'D11', 'E11', 'B48', 'C48', 'B49', 'C49'],
  ['ACD', 'Refractory', 'F11', 'G11', 'D48', 'E48', 'D49', 'E49'],
  ['RI', 'Graphite', 'D15', 'E15', 'H48', 'I48', 'H49', 'I49'],
  ['RI', 'Flux', 'F15', 'G15', 'F48', 'G48', 'F49', 'G49'],
  ['DBF', 'Billes', 'D19', 'E19', 'J48', 'K48', 'J49', 'K49'],
  ['DBF', 'GridPlate', 'F19', 'G19', 'L48', 'M48', 'L49', 'M49'],
  ['DBF', 'Refractory', 'H19', 'I19', null, null, null, null],
  ['TAC', 'Fonte', 'D23', 'E23', 'B53', 'C53', 'B54', 'C54'],
  ['ACS', 'Fonte', 'D27', 'E27', 'D53', 'E53', 'D54', 'E54'],
  ['STARprobe', 'Probe', 'D31', 'E31', 'F53', 'G53', 'F54', 'G54'],
  ['HACC', 'Pastille', 'F35', 'G35', 'H53', 'I53', 'H54', 'I54'],
  ['AIR', 'Graphite', 'D39', 'E39', 'B58', 'C58', 'B59', 'C59'],
  ['AIR', 'Refractory', 'F39', 'G39', 'D58', 'E58', 'D59', 'E59'],
  ['AIR', 'HeatingTube', 'H39', 'I39', 'F58', 'G58', 'F59', 'G59']
] as const;

export async function extractPotentialWorkbook(file: File): Promise<PotentialExtraction> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false, cellHTML: false });
  const sheets = wb.SheetNames.filter((n) => n.toLowerCase() !== 'a copier');

  const summaryTable: PotentialRow[] = [];
  const consumablesTable: PotentialRow[] = [];
  const validationReport: ValidationRow[] = [];
  const warningNoDashSheets: string[] = [];

  for (const name of sheets) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const customerID = name.includes('-') ? name.split('-')[0].trim() : name;
    if (!name.includes('-')) warningNoDashSheets.push(name);
    const client = String(readCell(ws, 'D2') ?? '');

    const missingCritical = CRITICAL.filter((c) => readCell(ws, c) == null || readCell(ws, c) === '');
    const missingWarning = WARNING.filter((c) => readCell(ws, c) == null || readCell(ws, c) === '');
    const ratio = CRITICAL.length ? missingCritical.length / CRITICAL.length : 0;
    const isValid = ratio <= 0.2;
    validationReport.push({
      SheetName: name,
      CustomerID: customerID,
      MissingCriticalCount: missingCritical.length,
      TotalCriticalChecked: CRITICAL.length,
      MissingCriticalRatio: Number(ratio.toFixed(4)),
      MissingCriticalCells: missingCritical,
      MissingWarningCells: missingWarning,
      IsValid: isValid
    });

    summaryTable.push({
      CustomerID: customerID,
      SheetName: name,
      ClientName: client,
      HoursPerDay: num(readCell(ws, 'D4')),
      NumberOfYears: num(readCell(ws, 'D5')),
      USDExchangeRate: num(readCell(ws, 'D6')),
      TotalOperatingHours: num(readCell(ws, 'D7')),
      PotentialScore: num(readCell(ws, 'E3')),
      AverageCoverage: num(readCell(ws, 'M57')),
      Total_ACD_CAD: num(readCell(ws, 'C41')),
      Total_RI_CAD: num(readCell(ws, 'C42')),
      Total_DBF_CAD: num(readCell(ws, 'C43')),
      Total_TAC_CAD: num(readCell(ws, 'E41')),
      Total_ACS_CAD: num(readCell(ws, 'E42')),
      Total_STARprobe_CAD: num(readCell(ws, 'E43')),
      Total_HACC_CAD: num(readCell(ws, 'G41')),
      Total_AIR_CAD: num(readCell(ws, 'G42')),
      GrandTotal_Theoretical_CAD: num(readCell(ws, 'G43'))
    });

    for (const [equipment, consumable, tv, tq, av, aq, cv, cq] of LINES) {
      consumablesTable.push({
        CustomerID: customerID,
        SheetName: name,
        ClientName: client,
        EquipmentType: equipment,
        ConsumableName: consumable,
        TheoreticalValue: num(readCell(ws, tv)),
        TheoreticalQty: num(readCell(ws, tq)),
        ActualValue: av ? num(readCell(ws, av)) : null,
        ActualQty: aq ? num(readCell(ws, aq)) : null,
        CoverageValuePct: cv ? num(readCell(ws, cv)) : null,
        CoverageQtyPct: cq ? num(readCell(ws, cq)) : null,
        AverageCoverage: num(readCell(ws, 'M57')),
        GrandTotal_Theoretical_CAD: num(readCell(ws, 'G43'))
      });
    }
  }

  const invalidSheets = validationReport.filter((r) => !r.IsValid).length;
  if (invalidSheets >= 2) {
    throw new Error('Workbook appears to be missing cached formula values from external links. Please open in Excel, choose “Don’t Update Links”, save, and upload again.');
  }

  const grouped = new Map<string, { theo: number; actual: number; coverageSum: number; coverageCount: number }>();
  consumablesTable.forEach((r) => {
    const key = `${r.CustomerID}|${r.EquipmentType}`;
    const g = grouped.get(key) ?? { theo: 0, actual: 0, coverageSum: 0, coverageCount: 0 };
    g.theo += Number(r.TheoreticalValue ?? 0);
    g.actual += Number(r.ActualValue ?? 0);
    if (r.CoverageValuePct != null) { g.coverageSum += Number(r.CoverageValuePct); g.coverageCount += 1; }
    grouped.set(key, g);
  });

  const equipmentSummaryTable: PotentialRow[] = [...grouped.entries()].map(([k, v]) => {
    const [CustomerID, EquipmentType] = k.split('|');
    return {
      CustomerID,
      EquipmentType,
      TheoreticalValue: v.theo,
      ActualValue: v.actual,
      CoverageValuePct: v.coverageCount ? v.coverageSum / v.coverageCount : null,
      GapValue: v.theo - v.actual
    };
  });

  return { summaryTable, consumablesTable, equipmentSummaryTable, validationReport, warningNoDashSheets };
}
