// src/pages/plant/PlantCompliance.jsx — Document expiry alerts & compliance dashboard
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { plantAPI } from '../../api/client';
import { PageShell, Table, KpiRow, ExpiryBadge } from './_shared';

export default function PlantCompliance() {
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['pm-expiry'],
    queryFn: () => plantAPI.expiryAlerts().then((r) => r.data?.data || []).catch(() => []),
  });

  const expired = data.filter((d) => d.expiry_status === 'expired');
  const expiring = data.filter((d) => d.expiry_status === 'expiring');
  const valid = data.filter((d) => d.expiry_status === 'valid');

  const cards = [
    { label: 'Expired', value: expired.length, icon: ShieldX, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Expiring ≤30d', value: expiring.length, icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Valid', value: valid.length, icon: ShieldCheck, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  const columns = [
    { key: 'equipment_name', label: 'Equipment', render: (r) => `${r.equipment_code || ''} ${r.equipment_name || ''}`.trim() },
    { key: 'document_type', label: 'Document' },
    { key: 'doc_number', label: 'Number' },
    { key: 'expiry_date', label: 'Expiry', render: (r) => <ExpiryBadge date={r.expiry_date} /> },
  ];

  return (
    <PageShell title="Document & Compliance" onRefresh={refetch} exportData={data} exportName="pm_compliance">
      <div className="grid grid-cols-3 gap-3">
        {cards.map((k) => (
          <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><span className="text-xs text-gray-400">{k.label}</span><span className={`rounded p-1 ${k.bg}`}><k.icon className={`h-4 w-4 ${k.color}`} /></span></div>
            <div className="mt-2 text-xl font-bold text-gray-800">{k.value}</div>
          </div>
        ))}
      </div>
      <Table columns={columns} rows={data} isLoading={isLoading} empty="No documents with expiry dates" />
    </PageShell>
  );
}
