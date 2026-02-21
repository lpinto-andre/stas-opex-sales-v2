import { Link, NavLink } from 'react-router-dom';
import { labels } from '@/constants/labels';

const nav = ['/dataset', '/explorer', '/rankings', '/top-items', '/decline'];
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen text-[var(--text)]">
    <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 px-6 py-4 flex items-center justify-between">
      <Link to="/" className="font-semibold">{labels.appName}</Link>
      <nav className="flex gap-2">{nav.map((n) => <NavLink key={n} to={n} className="px-3 py-1 rounded-full border border-[var(--border)] text-sm">{n.slice(1)}</NavLink>)}</nav>
    </header>
    <main className="p-6">{children}</main>
  </div>;
}
