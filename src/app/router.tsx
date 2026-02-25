import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/ui/AppShell';
import { useAppStore } from '@/state/store';

const DatasetPage = lazy(() => import('@/features/dataset/DatasetPage').then((m) => ({ default: m.DatasetPage })));
const ExplorerPage = lazy(() => import('@/features/explorer/ExplorerPage').then((m) => ({ default: m.ExplorerPage })));
const ExplorerGraphicDetailPage = lazy(() => import('@/features/explorer/ExplorerGraphicDetailPage').then((m) => ({ default: m.ExplorerGraphicDetailPage })));
const RankingsPage = lazy(() => import('@/features/rankings/RankingsPage').then((m) => ({ default: m.RankingsPage })));
const TopItemsPage = lazy(() => import('@/features/top-items/TopItemsPage').then((m) => ({ default: m.TopItemsPage })));
const DeclinePage = lazy(() => import('@/features/decline/DeclinePage').then((m) => ({ default: m.DeclinePage })));
const DatabasePage = lazy(() => import('@/features/database/DatabasePage').then((m) => ({ default: m.DatabasePage })));
const PricingPage = lazy(() => import('@/features/pricing/PricingPage').then((m) => ({ default: m.PricingPage })));
const PricingComparatorPage = lazy(() => import('@/features/pricing/PricingComparatorPage').then((m) => ({ default: m.PricingComparatorPage })));
const PotentialTablesPage = lazy(() => import('@/features/dataset/PotentialTablesPage').then((m) => ({ default: m.PotentialTablesPage })));

export function AppRouter() {
  const datasetLoaded = useAppStore((s) => s.datasetLoaded);
  return <AppShell>
    <Suspense fallback={<div className="card p-4 text-sm text-[var(--text-muted)]">Loading page…</div>}>
      <Routes>
        <Route path="/dataset" element={<DatasetPage />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/explorer/graphic/:graphicKey" element={<ExplorerGraphicDetailPage />} />
        <Route path="/group-by" element={<RankingsPage />} />
        <Route path="/rankings" element={<Navigate to="/group-by" replace />} />
        <Route path="/top-items" element={<TopItemsPage />} />
        <Route path="/labels" element={<DeclinePage />} />
        <Route path="/decline" element={<Navigate to="/labels" replace />} />
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/pricing-comparator" element={<PricingComparatorPage />} />
        <Route path="/pricing/comparator" element={<Navigate to="/pricing-comparator" replace />} />
        <Route path="/potential-tables" element={<PotentialTablesPage />} />
        <Route path="*" element={<Navigate to={datasetLoaded ? '/explorer' : '/dataset'} replace />} />
      </Routes>
    </Suspense>
  </AppShell>;
}
