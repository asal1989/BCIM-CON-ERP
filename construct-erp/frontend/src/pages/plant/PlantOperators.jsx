// src/pages/plant/PlantOperators.jsx — Operator management: roster, license expiry, performance
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { plantAPI } from '../../api/client';
import { PageShell, Table, KpiRow, ExpiryBadge, StatusBadge } from './_shared';
import { Users, ShieldAlert, Activity } from 'lucide-react';
import dayjs from 'dayjs';

export default function PlantOperators() {
  const { data: operators = [], isLoading, refetch } = useQuery({
    queryKey: ['pm-operators'],
    queryFn: () => plantAPI.listOperators().then((r) => r.data?.data || []).catch(() => []),
  });
  const { data: deployment = [] } = useQuery({
    queryKey: ['pm-deployment'],
    queryFn: () => plantAPI.listDeployment().then((r) => r.data?.data || []).catch(() => []),
  });

  // Aggregate performance per operator from deployment logs
  const perf = useMemo(() => {
    const map = {};
    deployment.forEach((d) => {
      if (!d.operator_id) return;
      if (!map[d.operator_id]) map[d.operator_id] = { hours: 0, equipment: new Set(), days: 0 };
      map[d.operator_id].hours += Number(d.hours_worked || 0);
      map[d.operator_id].days += 1;
      if (d.equipment_id) map[d.operator_id].equipment.add(d.equipment_id);
    });
    return map;
  }, [deployment]);

  const rows = operators.map((o) => ({
    ...o,
    hours: perf[o.id]?.hours || 0,
    equipment_count: perf[o.id]?.equipment.size || 0,
    days: perf[o.id]?.days || 0,
  }));

  const expiringLicenses = operators.filter((o) => o.license_expiry && dayjs(o.license_expiry).diff(dayjs(), 'day') <= 30).length;

  const cards = [
    { label: 'Total Operators', value: operators.length, icon: Users, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Licenses Expiring ≤30d', value: expiringLicenses, icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Active', value: operators.filter((o) => o.status === 'active').length, icon: Activity, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  const columns = [
    { key: 'name', label: 'Operator' },
    { key: 'license_no', label: 'License No.' },
    { key: 'license_expiry', label: 'License Expiry', render: (r) => <ExpiryBadge date={r.license_expiry} /> },
    { key: 'contact', label: 'Contact' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status === 'active' ? 'active' : 'idle'} /> },
    { key: 'hours', label: 'Hours Operated', render: (r) => Number(r.hours).toFixed(1) },
    { key: 'equipment_count', label: 'Equipment Handled' },
    { key: 'days', label: 'Deployment Days' },
  ];

  return (
    <PageShell title="Operator Management" onRefresh={refetch} exportData={rows} exportName="pm_operators">
      <div className="grid grid-cols-3 gap-3">
        {cards.map((k) => (
          <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><span className="text-xs text-gray-400">{k.label}</span><span className={`rounded p-1 ${k.bg}`}><k.icon className={`h-4 w-4 ${k.color}`} /></span></div>
            <div className="mt-2 text-xl font-bold text-gray-800">{k.value}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">Operators are maintained under Masters. This view adds license-expiry alerts and performance from deployment logs.</p>
      <Table columns={columns} rows={rows} isLoading={isLoading} empty="No operators — add them under Masters" />
    </PageShell>
  );
}
