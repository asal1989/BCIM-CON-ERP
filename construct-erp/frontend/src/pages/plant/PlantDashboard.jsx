// src/pages/plant/PlantDashboard.jsx — Fleet status dashboard
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Truck, CheckCircle, Clock, Wrench, CircleSlash, AlertTriangle, FileWarning,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { plantAPI } from '../../api/client';
import { PageShell, KpiRow, inr } from './_shared';

const PIE_COLORS = ['#0d9488', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];

export default function PlantDashboard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pm-dashboard'],
    queryFn: () => plantAPI.dashboard().then((r) => r.data?.data).catch(() => null),
  });

  const s = data?.summary || {};
  const cards = [
    { label: 'Total Equipment', value: s.total_equipment ?? 0, icon: Truck, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Active', value: s.active ?? 0, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Idle', value: s.idle ?? 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Maintenance', value: s.maintenance ?? 0, icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Disposed', value: s.disposed ?? 0, icon: CircleSlash, color: 'text-red-600', bg: 'bg-red-50' },
  ];
  const alertCards = [
    { label: 'Maintenance Due (7d)', value: s.maintenance_due ?? 0, icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Hire-In Pending Returns', value: s.hire_pending ?? 0, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Docs Expiring (30d)', value: s.expiring_docs ?? 0, icon: FileWarning, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  const util = (data?.utilisation || []).map((u) => ({
    name: u.code || u.name, Worked: Number(u.hours_worked || 0), Idle: Number(u.idle_hours || 0),
  }));
  const byType = (data?.by_type || []).map((t) => ({ name: t.type, value: Number(t.c || 0), cost: Number(t.v || 0) }));

  return (
    <PageShell title="Fleet Dashboard" onRefresh={refetch}>
      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">Loading dashboard…</div>
      ) : (
        <>
          <KpiRow cards={cards} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {alertCards.map((k) => (
              <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{k.label}</span>
                  <span className={`rounded p-1 ${k.bg}`}><k.icon className={`h-4 w-4 ${k.color}`} /></span>
                </div>
                <div className="mt-2 text-xl font-bold text-gray-800">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Utilisation — Hours Worked vs Idle</h3>
              {util.length === 0 ? <div className="py-16 text-center text-sm text-gray-400">No deployment data</div> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={util}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Worked" fill="#0d9488" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Idle" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Fleet by Type (Own vs Hired)</h3>
              {byType.length === 0 ? <div className="py-16 text-center text-sm text-gray-400">No equipment</div> : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => `${e.name}: ${e.value}`}>
                      {byType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n, p) => [`${v} units · ${inr(p.payload.cost)}`, p.payload.name]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
