// src/pages/plant/PlantReports.jsx — Reports: utilisation, maintenance due, cost analysis
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { plantAPI } from '../../api/client';
import { PageShell, Table, StatusBadge, inr, ddmmyyyy } from './_shared';

const PIE_COLORS = ['#0d9488', '#f59e0b'];

export default function PlantReports() {
  const [tab, setTab] = useState('utilisation');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const util = useQuery({
    queryKey: ['pm-util-report', from, to],
    queryFn: () => plantAPI.utilizationReport({ from: from || undefined, to: to || undefined }).then((r) => r.data?.data || []).catch(() => []),
    enabled: tab === 'utilisation',
  });
  const maintDue = useQuery({
    queryKey: ['pm-maint-due'],
    queryFn: () => plantAPI.maintenanceDue().then((r) => r.data?.data || []).catch(() => []),
    enabled: tab === 'maintenance',
  });
  const cost = useQuery({
    queryKey: ['pm-cost-report'],
    queryFn: () => plantAPI.costReport().then((r) => r.data?.data || {}).catch(() => ({})),
    enabled: tab === 'cost',
  });

  const utilRows = util.data || [];
  const utilChart = utilRows.slice(0, 12).map((u) => ({ name: u.code, Worked: Number(u.hours_worked || 0), Idle: Number(u.idle_hours || 0) }));
  const ownVsHired = (cost.data?.own_vs_hired || []).map((c) => ({ name: c.cost_type, value: Number(c.total_cost || 0) }));

  const utilCols = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Equipment' },
    { key: 'type', label: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'hours_worked', label: 'Hours Worked', render: (r) => Number(r.hours_worked || 0).toFixed(1) },
    { key: 'idle_hours', label: 'Idle Hours', render: (r) => Number(r.idle_hours || 0).toFixed(1) },
    { key: 'deployment_days', label: 'Days Deployed' },
  ];
  const maintCols = [
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'maintenance_type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'due_date', label: 'Due Date', render: (r) => ddmmyyyy(r.due_date) },
    { key: 'days_left', label: 'Days Left', render: (r) => <span className={Number(r.days_left) < 0 ? 'font-semibold text-red-600' : Number(r.days_left) <= 7 ? 'font-semibold text-amber-600' : ''}>{r.days_left}</span> },
  ];
  const costCols = [
    { key: 'project_name', label: 'Project' },
    { key: 'cost_type', label: 'Type', render: (r) => <span className="capitalize">{r.cost_type}</span> },
    { key: 'hours', label: 'Hours', render: (r) => Number(r.hours || 0).toFixed(1) },
    { key: 'total_cost', label: 'Total Cost', render: (r) => inr(r.total_cost) },
  ];

  const exportData = tab === 'utilisation' ? utilRows : tab === 'maintenance' ? (maintDue.data || []) : (cost.data?.by_project || []);

  return (
    <PageShell title="Reports & Analytics"
      onRefresh={() => { util.refetch(); maintDue.refetch(); cost.refetch(); }}
      exportData={exportData} exportName={`pm_report_${tab}`}
      extra={tab === 'utilisation' ? (
        <div className="flex items-center gap-2">
          <input type="date" className="rounded border border-gray-200 px-2 py-1 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" className="rounded border border-gray-200 px-2 py-1 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      ) : null}>
      <div className="flex gap-1 border-b border-gray-200">
        {[['utilisation', 'Utilisation Summary'], ['maintenance', 'Maintenance Due'], ['cost', 'Cost Analysis']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-xs font-medium transition ${tab === k ? 'border-b-2 border-teal-600 text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>{lbl}</button>
        ))}
      </div>

      {tab === 'utilisation' && (
        <>
          {utilChart.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Hours Worked vs Idle</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={utilChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="Worked" fill="#0d9488" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Idle" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <Table columns={utilCols} rows={utilRows} isLoading={util.isLoading} empty="No utilisation data" />
        </>
      )}

      {tab === 'maintenance' && <Table columns={maintCols} rows={maintDue.data || []} isLoading={maintDue.isLoading} empty="Nothing due in next 30 days" />}

      {tab === 'cost' && (
        <>
          {ownVsHired.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Own vs Hired Cost</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={ownVsHired} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => `${e.name}: ${inr(e.value)}`}>
                    {ownVsHired.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => inr(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <Table columns={costCols} rows={cost.data?.by_project || []} isLoading={cost.isLoading} empty="No cost data" />
        </>
      )}
    </PageShell>
  );
}
