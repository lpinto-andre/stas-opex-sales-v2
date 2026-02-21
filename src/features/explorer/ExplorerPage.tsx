import { PageHeader } from '@/components/ui/PageHeader';
import { KPIStatCard } from '@/components/ui/KPIStatCard';
import { FilterChipsBar } from '@/components/ui/FilterChipsBar';
import { DataTable } from '@/components/ui/DataTable';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const data = [{ m: '2024-11', rev: 20000, fy: 2025, ord: 15 }, { m: '2024-12', rev: 24000, fy: 2025, ord: 18 }];
export function ExplorerPage() {
  return <div>
    <PageHeader title="Data Explorer" subtitle="KPIs, trends, and detailed rows with global filters." />
    <FilterChipsBar chips={['FY:2025']} onRemove={() => undefined} />
    <div className="grid md:grid-cols-4 gap-3 mb-4">
      <KPIStatCard label="Revenue" value="CAD 44,000" /><KPIStatCard label="Profit" value="CAD 9,200" /><KPIStatCard label="Margin%" value="20.9%" /><KPIStatCard label="Orders" value="33" />
    </div>
    <div className="grid md:grid-cols-2 gap-4 mb-4">
      <div className="card p-3 h-64"><ResponsiveContainer><LineChart data={data}><XAxis dataKey="m"/><YAxis/><Tooltip/><Line type="monotone" dataKey="rev" stroke="#1bc7b3"/></LineChart></ResponsiveContainer></div>
      <div className="card p-3 h-64"><ResponsiveContainer><BarChart data={data}><XAxis dataKey="fy"/><YAxis/><Tooltip/><Bar dataKey="ord" fill="#2889c2"/></BarChart></ResponsiveContainer></div>
    </div>
    <DataTable rows={data as unknown as Record<string, unknown>[]} />
  </div>;
}
