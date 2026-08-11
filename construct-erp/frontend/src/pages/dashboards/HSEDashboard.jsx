import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Shield, FileCheck, Activity, ArrowRight } from 'lucide-react';
import { incidentAPI, permitAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { DashKPI, DashSection, DashTable, Badge, inr } from './DashKPI';
import dayjs from 'dayjs';

const SEV_CLS = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-blue-100 text-blue-700',
};
const PTW_CLS = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  active:   'bg-blue-100 text-blue-700',
  expired:  'bg-red-100 text-red-700',
  closed:   'bg-slate-100 text-slate-500',
};

export default function HSEDashboard() {
  const { user } = useAuthStore();

  const { data: incidents = [], isLoading: loadI } = useQuery({
    queryKey: ['hse-dash-incidents'],
    queryFn: () => incidentAPI.list().then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  const { data: permits = [], isLoading: loadP } = useQuery({
    queryKey: ['hse-dash-permits'],
    queryFn: () => permitAPI.list().then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  const openIncidents   = incidents.filter(i => i.status !== 'closed' && i.status !== 'resolved');
  const critical        = incidents.filter(i => i.severity === 'critical' || i.severity === 'high');
  const pendingPTW      = permits.filter(p => p.status === 'pending');
  const expiringPTW     = permits.filter(p =>
    p.valid_to && dayjs(p.valid_to).diff(dayjs(), 'hour') <= 48 && dayjs(p.valid_to).isAfter(dayjs())
  );

  // Days since last incident
  const sorted = [...incidents].sort((a, b) => dayjs(b.incident_date || b.created_at).diff(dayjs(a.incident_date || a.created_at)));
  const lastIncident = sorted[0];
  const daysSince = lastIncident
    ? dayjs().diff(dayjs(lastIncident.incident_date || lastIncident.created_at), 'day')
    : null;

  const incidentCols = [
    { key: 'incident_number', label: 'Ref #',    cls: 'font-mono text-slate-900 font-medium text-[11px]' },
    { key: 'title',           label: 'Incident', cls: 'font-medium text-slate-900 max-w-[140px] truncate' },
    { key: 'incident_date',   label: 'Date',     render: r => r.incident_date ? dayjs(r.incident_date).format('DD MMM') : '—' },
    { key: 'severity',        label: 'Severity', render: r => <Badge label={r.severity || 'low'} cls={SEV_CLS[r.severity] || SEV_CLS.low} /> },
    { key: 'status',          label: 'Status',   render: r => <Badge label={r.status || 'open'} cls={r.status === 'closed' ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-700'} /> },
  ];

  const ptwCols = [
    { key: 'permit_number', label: 'PTW #',     cls: 'font-mono text-slate-900 font-medium text-[11px]' },
    { key: 'work_type',     label: 'Work Type', cls: 'text-slate-700' },
    { key: 'valid_to',      label: 'Expires',   render: r => r.valid_to ? dayjs(r.valid_to).format('DD MMM HH:mm') : '—' },
    { key: 'status',        label: 'Status',    render: r => <Badge label={r.status || 'pending'} cls={PTW_CLS[r.status] || PTW_CLS.pending} /> },
  ];

  return (
    <div className="p-6 space-y-5 bg-[#f4f6f9] min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-black">Good {dayjs().hour() < 12 ? 'morning' : dayjs().hour() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">HSE Dashboard — {dayjs().format('dddd, D MMMM YYYY')}</p>
        </div>
        <Badge label="HSE Officer" cls="bg-orange-100 text-orange-700 text-xs px-3 py-1" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashKPI icon={AlertTriangle} label="Open Incidents"       value={openIncidents.length}  color="red"     loading={loadI} />
        <DashKPI icon={Shield}        label="PTW Pending Approval" value={pendingPTW.length}     color="amber"   loading={loadP} />
        <DashKPI icon={Activity}      label="Days Since Last Incident" value={daysSince ?? 'N/A'} color="emerald" loading={loadI} />
        <DashKPI icon={FileCheck}     label="Expiring in 48 hrs"   value={expiringPTW.length}    color="blue"    loading={loadP} />
      </div>

      {/* Critical incidents banner */}
      {critical.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">{critical.length} Critical / High Severity Incident{critical.length > 1 ? 's' : ''} Open</p>
            <p className="text-xs text-red-500 mt-0.5">Immediate attention required. Escalate if not yet investigated.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DashSection
          title="Open Incidents"
          action={<Link to="/hse/incidents" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All <ArrowRight className="w-3 h-3" /></Link>}
        >
          <DashTable cols={incidentCols} rows={openIncidents.slice(0, 8)} empty="No open incidents — site is safe ✅" />
        </DashSection>

        <DashSection
          title="Permits to Work"
          action={<Link to="/hse/permits" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All <ArrowRight className="w-3 h-3" /></Link>}
        >
          {expiringPTW.length > 0 && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
              ⚠ {expiringPTW.length} permit{expiringPTW.length > 1 ? 's' : ''} expiring within 48 hours
            </div>
          )}
          <DashTable cols={ptwCols} rows={[...pendingPTW, ...expiringPTW].slice(0, 8)} empty="No pending permits" />
        </DashSection>
      </div>
    </div>
  );
}
