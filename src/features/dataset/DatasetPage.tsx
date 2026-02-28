import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppStore } from '@/state/store';
import { importDatasetFile, type ImportStatus } from '@/data/importPipeline';
import { clearDatasetPackage, clearPotentialState, savePotentialState } from '@/data/cache';
import { dropAllTables } from '@/data/duckdb';
import { extractPotentialWorkbook } from '@/data/potentialWorkbook';
import { detectTerritoryGroup, territoryGroupLabel, type TerritoryGroup } from '@/data/potentialTerritories';

type ToastState = { tone: 'success' | 'error'; text: string } | null;
type PotentialStoredFile = {
  sourceFileName: string;
  loadedAt: string;
  territoryGroup: TerritoryGroup;
  summaryTable: Record<string, unknown>[];
  consumablesTable: Record<string, unknown>[];
  equipmentSummaryTable: Record<string, unknown>[];
  validationReport: Record<string, unknown>[];
  warningNoDashSheets: string[];
};

function ImportStatusCard({ title, status, isImporting, steps, copy }: { title: string; status: ImportStatus; isImporting: boolean; steps: { phase: ImportStatus['phase']; label: string }[]; copy: { importStatus: string; idle: string; working: string } }) {
  const activeStep = steps.findIndex((s) => s.phase === status.phase);
  return <section className="card p-4">
    <h3 className="font-semibold mb-2">{copy.importStatus} {title}</h3>
    {!isImporting && <p className="text-sm text-[var(--text-muted)]">{copy.idle}</p>}
    {isImporting && <div className="space-y-2">
      <div className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden"><div className="h-full bg-[var(--teal)]" style={{ width: `${Math.max(5, Math.min(100, Math.round(status.progress * 100)))}%` }} /></div>
      <p className="text-sm">{status.message || copy.working}</p>
      <div className="text-xs text-[var(--text-muted)]">{steps.map((s, i) => <span key={s.phase} className={i <= activeStep ? 'text-[var(--teal)] mr-2' : 'mr-2'}>{i + 1}. {s.label}</span>)}</div>
    </div>}
  </section>;
}

export function DatasetPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const potentialRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [toast, setToast] = useState<ToastState>(null);
  const [statusMain, setStatusMain] = useState<ImportStatus>({ phase: 'idle', message: '', progress: 0, startedAt: 0 });
  const [statusPotential, setStatusPotential] = useState<ImportStatus>({ phase: 'idle', message: '', progress: 0, startedAt: 0 });
  const [isImportingMain, setIsImportingMain] = useState(false);
  const [isImportingPotential, setIsImportingPotential] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [sheetWarning, setSheetWarning] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');

  const datasetMeta = useAppStore((s) => s.datasetMeta);
  const setDataset = useAppStore((s) => s.setDataset);
  const setPageState = useAppStore((s) => s.setPageState);
  const uiLang = useAppStore((s) => s.uiLang);
  const potentialStateRaw = useAppStore((s) => s.pageState.potential as Record<string, unknown> | undefined);
  const potentialState = potentialStateRaw ?? {};
  const potentialFiles = useMemo<PotentialStoredFile[]>(() => {
    const rawFiles = potentialState.files;
    if (Array.isArray(rawFiles)) return rawFiles as PotentialStoredFile[];
    if (potentialState.summaryTable && potentialState.consumablesTable) {
      return [{
        sourceFileName: String(potentialState.sourceFileName ?? 'Legacy Potential Workbook'),
        loadedAt: String(potentialState.loadedAt ?? new Date().toISOString()),
        territoryGroup: detectTerritoryGroup(String(potentialState.sourceFileName ?? '')),
        summaryTable: (potentialState.summaryTable as Record<string, unknown>[]) ?? [],
        consumablesTable: (potentialState.consumablesTable as Record<string, unknown>[]) ?? [],
        equipmentSummaryTable: (potentialState.equipmentSummaryTable as Record<string, unknown>[]) ?? [],
        validationReport: (potentialState.validationReport as Record<string, unknown>[]) ?? [],
        warningNoDashSheets: (potentialState.warningNoDashSheets as string[]) ?? []
      }];
    }
    return [];
  }, [potentialState]);

  const t = uiLang === 'fr' ? {
    readingFile: 'Lecture du fichier', parsingSheet: 'Analyse de la feuille', cleaningColumns: 'Nettoyage des colonnes', buildingDataset: 'Construction du dataset', savingCache: 'Sauvegarde du cache local',
    importStatus: 'Statut d\'import —', idle: 'En attente.', working: 'Traitement en cours…',
    shippedImported: 'Fichier ShippedSO importé avec succès.', shippedFailed: 'Échec de l\'import ShippedSO.',
    potentialImported: 'Fichier Full Potential importé avec succès.', potentialFailed: 'Échec de l\'import Full Potential.',
    readingWorkbook: 'Lecture du classeur...', preparingTables: 'Préparation des tables normalisées...', workbookOk: 'Classeur extrait avec succès.',
    pageTitle: 'Gestion des données', pageSubtitle: 'Importer les fichiers ShippedSO et Full Potential Consumption.', clearDataset: 'Effacer les données locales',
    importShipped: 'Importer fichier ShippedSO', shippedFormats: 'Formats supportés : Excel (.xlsx/.xlsm) et CSV.',
    importPotential: 'Importer fichier Full Potential Consumption', potentialFormats: 'Classeur Excel avec onglets clients et valeurs théoriques en cache.',
    importing: 'Importation…', importFile: 'Importer', continueImport: 'Continuer l\'import',
    noShipped: 'Aucun dataset ShippedSO chargé.', noPotential: 'Aucun classeur potentiel chargé.', loadedAt: 'Chargé le :', rows: 'Lignes :', dateRange: 'Période :',
    sheetsExtracted: 'Feuilles extraites :', validationRows: 'Lignes de validation :', invalidSheets: 'Feuilles invalides :', openGenerated: 'Ouvrir les tables générées', importedFiles: 'Fichiers importés :', territory: 'Territoire',
    qualityShipped: 'Résumé qualité — ShippedSO', qualityPotential: 'Résumé qualité — Full Potential Consumption',
    importShippedToSee: 'Importez un fichier ShippedSO pour afficher les indicateurs.', importPotentialToSee: 'Importez le classeur potentiel pour afficher la validation.',
    customers: 'Clients :', parts: 'Articles :', missingCostRows: 'Lignes sans coût :', droppedRows: 'Lignes supprimées :', sheetsChecked: 'Feuilles vérifiées :', rule: 'Règle : invalide si ratio critique manquant > 20%.',
    localCleared: 'Jeu de données local effacé.'
  } : {
    readingFile: 'Reading file', parsingSheet: 'Parsing sheet', cleaningColumns: 'Cleaning columns', buildingDataset: 'Building dataset', savingCache: 'Saving local cache',
    importStatus: 'Import status —', idle: 'Idle.', working: 'Working...',
    shippedImported: 'ShippedSO file imported successfully.', shippedFailed: 'ShippedSO import failed.',
    potentialImported: 'Full potential consumption file imported successfully.', potentialFailed: 'Potential workbook import failed.',
    readingWorkbook: 'Reading workbook...', preparingTables: 'Preparing normalized tables...', workbookOk: 'Workbook extracted successfully.',
    pageTitle: 'Dataset Manager', pageSubtitle: 'Import ShippedSO and Full Potential Consumption files.', clearDataset: 'Clear local dataset',
    importShipped: 'Import ShippedSO file', shippedFormats: 'Supported formats: Excel (.xlsx/.xlsm) and CSV.',
    importPotential: 'Import Full Potential Consumption file', potentialFormats: 'Excel workbook with client tabs and cached theoretical values.',
    importing: 'Importing…', importFile: 'Import File', continueImport: 'Continue import',
    noShipped: 'No ShippedSO dataset loaded yet.', noPotential: 'No potential workbook loaded yet.', loadedAt: 'Loaded at:', rows: 'Rows:', dateRange: 'Date range:',
    sheetsExtracted: 'Sheets extracted:', validationRows: 'Validation rows:', invalidSheets: 'Invalid sheets:', openGenerated: 'Open generated tables', importedFiles: 'Imported files:', territory: 'Territory',
    qualityShipped: 'Data quality summary — ShippedSO', qualityPotential: 'Data quality summary — Full Potential Consumption',
    importShippedToSee: 'Import a ShippedSO file to view quality indicators.', importPotentialToSee: 'Import the potential workbook to view validation.',
    customers: 'Customers:', parts: 'Parts:', missingCostRows: 'Missing cost rows:', droppedRows: 'Dropped rows:', sheetsChecked: 'Sheets checked:', rule: 'Rule: invalid if missing critical ratio > 20%.',
    localCleared: 'Local dataset cleared.'
  };

  const steps: { phase: ImportStatus['phase']; label: string }[] = [
    { phase: 'reading', label: t.readingFile },
    { phase: 'parsing', label: t.parsingSheet },
    { phase: 'cleaning', label: t.cleaningColumns },
    { phase: 'duckdb', label: t.buildingDataset },
    { phase: 'caching', label: t.savingCache }
  ];

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const updateDatasetMeta = (summary: Record<string, unknown>) => {
    setDataset({
      loadedAt: String(summary.loadedAt),
      rowCount: Number(summary.rowCount ?? 0),
      missingCostPct: Number(summary.missingCostPct ?? 0),
      fyRange: String(summary.fyRange ?? 'Computed from invoice dates'),
      dateRange: String(summary.dateRange ?? `${summary.dateMin ?? ''} → ${summary.dateMax ?? ''}`),
      customers: Number(summary.customers ?? 0),
      parts: Number(summary.parts ?? 0),
      selectedSheet: summary.selectedSheet ? String(summary.selectedSheet) : undefined,
      droppedPct: Number(summary.droppedPct ?? 0),
      invalidDateRows: Number(summary.invalidDateRows ?? 0)
    });
  };

  const executeMainImport = async (file: File, forcedSheet?: string) => {
    setErrorMsg('');
    setSheetWarning('');
    abortRef.current = new AbortController();
    try {
      const result = await importDatasetFile({ file, selectedSheet: forcedSheet, signal: abortRef.current.signal, onStatus: setStatusMain });
      if (result.type === 'needs-sheet') {
        setPendingFile(file);
        setSheetNames(result.sheetNames);
        setSelectedSheet(result.sheetNames[0] ?? '');
        setSheetWarning(result.message);
        setStatusMain({ phase: 'idle', message: '', progress: 0, startedAt: 0 });
        return;
      }
      if (result.type === 'cancelled') return;
      updateDatasetMeta(result.summary as unknown as Record<string, unknown>);
      setToast({ tone: 'success', text: t.shippedImported });
      setTimeout(() => navigate('/explorer'), 500);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Unexpected import failure.');
      setToast({ tone: 'error', text: t.shippedFailed });
    } finally {
      abortRef.current = null;
      setIsImportingMain(false);
    }
  };

  const onMainFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImportingMain(true);
    await executeMainImport(file);
    event.target.value = '';
  };

  const onPotentialFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setIsImportingPotential(true);
    let mergedFiles = [...potentialFiles];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const ratio = index / Math.max(files.length, 1);
        setStatusPotential({ phase: 'reading', message: `${t.readingWorkbook} (${index + 1}/${files.length}) - ${file.name}`, progress: Math.min(0.8, 0.1 + ratio * 0.6), startedAt: Date.now() });
        const extracted = await extractPotentialWorkbook(file);
        const importedFile: PotentialStoredFile = {
          ...extracted,
          loadedAt: new Date().toISOString(),
          sourceFileName: file.name,
          territoryGroup: detectTerritoryGroup(file.name)
        };
        mergedFiles = [...mergedFiles.filter((entry) => entry.sourceFileName !== importedFile.sourceFileName), importedFile];
      }
      setStatusPotential({ phase: 'caching', message: t.preparingTables, progress: 0.9, startedAt: Date.now() });
      const potentialPayload = { files: mergedFiles, loadedAt: new Date().toISOString() };
      setPageState('potential', potentialPayload);
      await savePotentialState(potentialPayload);
      setStatusPotential({ phase: 'done', message: t.workbookOk, progress: 1, startedAt: Date.now() });
      setToast({ tone: 'success', text: t.potentialImported });
      setTimeout(() => setStatusPotential({ phase: 'idle', message: '', progress: 0, startedAt: 0 }), 900);
    } catch (error) {
      setStatusPotential({ phase: 'error', message: error instanceof Error ? error.message : 'Failed extracting workbook.', progress: 1, startedAt: Date.now() });
      setToast({ tone: 'error', text: t.potentialFailed });
    } finally {
      setIsImportingPotential(false);
      event.target.value = '';
    }
  };

  const clearLocalDataset = async () => {
    await clearDatasetPackage();
    await clearPotentialState();
    await dropAllTables();
    setDataset(null);
    setPageState('potential', {});
    setPageState('potentialView', {});
    setToast({ tone: 'success', text: t.localCleared });
  };

  const potentialSummary = useMemo(() => {
    const summaryRows = potentialFiles.reduce((acc, file) => acc + file.summaryTable.length, 0);
    const validationRows = potentialFiles.reduce((acc, file) => acc + file.validationReport.length, 0);
    const invalidRows = potentialFiles.reduce((acc, file) => acc + file.validationReport.filter((r) => !Boolean(r.IsValid)).length, 0);
    const fileRows = potentialFiles.map((file) => ({
      fileName: file.sourceFileName,
      loadedAt: file.loadedAt,
      territoryGroup: file.territoryGroup,
      summaryRows: file.summaryTable.length,
      validationRows: file.validationReport.length,
      invalidRows: file.validationReport.filter((r) => !Boolean(r.IsValid)).length
    }));
    return { summaryRows, validationRows, invalidRows, fileRows };
  }, [potentialFiles]);

  return <div className="space-y-4">
    <PageHeader title={t.pageTitle} subtitle={t.pageSubtitle} actions={<button className="card px-3 py-2" onClick={clearLocalDataset}>{t.clearDataset}</button>} />

    <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xlsm,.csv" onChange={onMainFile} />
    <input ref={potentialRef} type="file" className="hidden" accept=".xlsx,.xlsm" multiple onChange={onPotentialFile} />

    <div className="grid lg:grid-cols-2 gap-4">
      <section className="card p-6 text-center">
        <h3 className="font-semibold text-lg mb-2">{t.importShipped}</h3>
        <p className="text-sm text-[var(--text-muted)] mb-4">{t.shippedFormats}</p>
        <button disabled={isImportingMain} className="card mx-auto h-40 w-40 flex items-center justify-center text-sm font-semibold border-[var(--teal)] text-[var(--teal)] disabled:opacity-50" onClick={() => fileRef.current?.click()}>{isImportingMain ? t.importing : t.importFile}</button>
      </section>
      <section className="card p-6 text-center">
        <h3 className="font-semibold text-lg mb-2">{t.importPotential}</h3>
        <p className="text-sm text-[var(--text-muted)] mb-4">{t.potentialFormats}</p>
        <button disabled={isImportingPotential} className="card mx-auto h-40 w-40 flex items-center justify-center text-sm font-semibold border-[var(--teal)] text-[var(--teal)] disabled:opacity-50" onClick={() => potentialRef.current?.click()}>{isImportingPotential ? t.importing : t.importFile}</button>
      </section>
    </div>

    {(isImportingMain || statusMain.phase === 'done' || statusMain.phase === 'error') && <ImportStatusCard title="ShippedSO" status={statusMain} isImporting={isImportingMain || statusMain.phase !== 'idle'} steps={steps} copy={t} />}
    {(isImportingPotential || statusPotential.phase === 'error') && <ImportStatusCard title="Full Potential Consumption" status={statusPotential} isImporting={isImportingPotential || statusPotential.phase !== 'idle'} steps={steps} copy={t} />}

    {sheetWarning && <section className="card p-3"><p className="text-sm mb-2">{sheetWarning}</p><div className="flex gap-2"><select className="card px-2 py-1" value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>{sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}</select><button className="card px-3 py-1" onClick={() => pendingFile && executeMainImport(pendingFile, selectedSheet)}>{t.continueImport}</button></div></section>}
    {errorMsg && <section className="card p-3 border border-red-400/40 text-red-300 text-sm">{errorMsg}</section>}

    <div className="grid lg:grid-cols-2 gap-4">
      <section className="card p-4">
        <h3 className="font-semibold mb-2">{t.importStatus} ShippedSO</h3>
        {!datasetMeta ? <p className="text-sm text-[var(--text-muted)]">{t.noShipped}</p> : <div className="space-y-1 text-sm"><p>{t.loadedAt} <span className="text-[var(--text-muted)]">{datasetMeta.loadedAt}</span></p><p>{t.rows} <span className="text-[var(--text-muted)]">{datasetMeta.rowCount.toLocaleString()}</span></p><p>{t.dateRange} <span className="text-[var(--text-muted)]">{datasetMeta.dateRange}</span></p></div>}
      </section>
      <section className="card p-4">
        <h3 className="font-semibold mb-2">{t.importStatus} Full Potential Consumption</h3>
        {!potentialSummary.summaryRows ? <p className="text-sm text-[var(--text-muted)]">{t.noPotential}</p> : <div className="space-y-2 text-sm">
          <p>{t.sheetsExtracted} <span className="text-[var(--text-muted)]">{potentialSummary.summaryRows.toLocaleString()}</span></p>
          <p>{t.validationRows} <span className="text-[var(--text-muted)]">{potentialSummary.validationRows.toLocaleString()}</span></p>
          <p>{t.invalidSheets} <span className="text-[var(--text-muted)]">{potentialSummary.invalidRows.toLocaleString()}</span></p>
          <div>
            <p className="mb-1">{t.importedFiles}</p>
            <div className="space-y-1">
              {potentialSummary.fileRows.map((file) => <div key={file.fileName} className="text-xs text-[var(--text-muted)]">{file.fileName} - {t.territory}: {territoryGroupLabel(file.territoryGroup, uiLang)}</div>)}
            </div>
          </div>
          <button className="card px-3 py-1 mt-2" onClick={() => navigate('/potential-tables')}>{t.openGenerated}</button>
        </div>}
      </section>
    </div>

    <div className="grid lg:grid-cols-2 gap-4">
      <section className="card p-4">
        <h3 className="font-semibold mb-2">{t.qualityShipped}</h3>
        {!datasetMeta ? <p className="text-sm text-[var(--text-muted)]">{t.importShippedToSee}</p> : <div className="space-y-1 text-sm"><p>{t.customers} <span className="text-[var(--text-muted)]">{datasetMeta.customers.toLocaleString()}</span></p><p>{t.parts} <span className="text-[var(--text-muted)]">{datasetMeta.parts.toLocaleString()}</span></p><p>{t.missingCostRows} <span className="text-[var(--text-muted)]">{datasetMeta.missingCostPct.toFixed(2)}%</span></p><p>{t.droppedRows} <span className="text-[var(--text-muted)]">{Number(datasetMeta.droppedPct ?? 0).toFixed(2)}%</span></p></div>}
      </section>
      <section className="card p-4">
        <h3 className="font-semibold mb-2">{t.qualityPotential}</h3>
        {!potentialSummary.validationRows ? <p className="text-sm text-[var(--text-muted)]">{t.importPotentialToSee}</p> : <div className="space-y-2 text-sm">
          <p>{t.sheetsChecked} <span className="text-[var(--text-muted)]">{potentialSummary.validationRows.toLocaleString()}</span></p>
          <p>{t.invalidSheets} <span className="text-[var(--text-muted)]">{potentialSummary.invalidRows.toLocaleString()}</span></p>
          <p>{t.rule}</p>
          <div className="space-y-1">
            {potentialSummary.fileRows.map((file) => <div key={`${file.fileName}-quality`} className="text-xs text-[var(--text-muted)]">{file.fileName} - {territoryGroupLabel(file.territoryGroup, uiLang)} - {t.sheetsChecked} {file.validationRows.toLocaleString()} - {t.invalidSheets} {file.invalidRows.toLocaleString()}</div>)}
          </div>
        </div>}
      </section>
    </div>

    {toast && <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl border shadow-lg ${toast.tone === 'success' ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200' : 'bg-rose-500/10 border-rose-400/30 text-rose-200'}`}>{toast.text}</div>}
  </div>;
}
