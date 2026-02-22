import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/ui/AppShell';
import { DatasetPage } from '@/features/dataset/DatasetPage';
import { ExplorerPage } from '@/features/explorer/ExplorerPage';
import { ExplorerGraphicDetailPage } from '@/features/explorer/ExplorerGraphicDetailPage';
import { RankingsPage } from '@/features/rankings/RankingsPage';
import { TopItemsPage } from '@/features/top-items/TopItemsPage';
import { DeclinePage } from '@/features/decline/DeclinePage';
import { DatabasePage } from '@/features/database/DatabasePage';
import { useAppStore } from '@/state/store';

export function AppRouter() {
  const datasetLoaded = useAppStore((s) => s.datasetLoaded);
  return <AppShell><Routes>
    <Route path="/dataset" element={<DatasetPage />} />
    <Route path="/explorer" element={<ExplorerPage />} />
    <Route path="/explorer/graphic/:graphicKey" element={<ExplorerGraphicDetailPage />} />
    <Route path="/group-by" element={<RankingsPage />} />
    <Route path="/rankings" element={<Navigate to="/group-by" replace />} />
    <Route path="/top-items" element={<TopItemsPage />} />
    <Route path="/labels" element={<DeclinePage />} />
    <Route path="/decline" element={<Navigate to="/labels" replace />} />
    <Route path="/database" element={<DatabasePage />} />
    <Route path="*" element={<Navigate to={datasetLoaded ? '/explorer' : '/dataset'} replace />} />
  </Routes></AppShell>;
}
