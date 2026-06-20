import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, ClipboardList, Truck, AlertTriangle, ArrowRight } from 'lucide-react';
import { ignAPI, mrsAPI, minAPI, inventoryAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { DashKPI, DashSection, DashTable, Badge, inr } from './DashKPI';
import dayjs from 'dayjs';

const MRS_CLS  = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700' };
const IGN_CLS  = { pending: 'bg-amber-100 text-amber-700', inspected: 'bg-blue-100 text-blue-700', approved: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-700' };

export default function SiteEngineerDashboard() {
  const { user } = useAuthStore();

  const { data: grns = [], isLoading: loadG } = useQuery({
    queryKey: ['site-dash-igns'],
    queryFn: () => ignAPI.list().then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  const { data: mrs = [], isLoading: loadM } = useQuery({
    queryKey: ['site-dash-mrs'],
    queryFn: () => mrsAPI.list().then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  const { data: issues = [], isLoading: loadI } = useQuery({
    queryKey: ['site-dash-issues'],
    queryFn: () => minAPI.list().then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['site-dash-inventory'],
    queryFn: () => inventoryAPI.list().then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  const pendingGRNs  = grns.filter(g => g.status === 'pending' || !g.status);
  const openMRS      = mrs.filter(m => m.status === 'pending' || m.status === 'approved');
  const todayIssues  = issues.filter(i => dayjs(i.issue_date || i.created_at).isSame(dayjs(), 'day'));
  const lowStock     = inventory.filter(i => parseFloat(i.closing_stock || 0) <= parseFloat(i.min_stock || 0) && i.min_stock);

  const grnCols = [
    { key: 'ign_number',   label: 'IGN #',     cls: 'font-mono text-slate-600' },
    { key: 'vendor_name',  label: 'Vendor',    cls: 'font-medium text-slate-700' },
    { key: 'date_time',    label: 'Date',      render: r => r.date_time ? dayjs(r.date_time).format('DD MMM') : '—' },
    { key: 'status',       label: 'Status',    render: r => <Badge label={r.status || 'pending'} cls={IGN_CLS[r.status] || IGN_CLS.pending} /> },
  ];

  const mrsCols = [
    { key: 'mrs_number',    label: 'MRS #',    cls: 'font-mono text-slate-600' },
    { key: 'project_name',  label: 'Project',  cls: 'text-slate-700' },
    { key: 'requested_date',label: 'Requested',render: r => r.requested_date ? dayjs(r.requested_date).format('DD MMM') : '—' },
    { key: 'status',        label: 'Status',   render: r => <Badge label={r.status || 'pending'} cls={MRS_CLS[r.status] || MRS_CLS.pending} /> },
  ];

  return (
    <div className="p-6 space-y-5 bg-[#f4f6f9] min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-slate-800">Good {dayjs().hour() < 12 ? 'morning' : dayjs().hour() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Site Engineer Dashboard — {dayjs().format('dddd, D MMMM YYYY')}</p>
        </div>
        <Badge label="Site Engineer" cls="bg-blue-100 text-blue-700 text-xs px-3 py-1" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashKPI icon={Truck}         label="IGNs Pending Approval" value={pendingGRNs.length}  color="amber"   loading={loadG} />
        <DashKPI icon={ClipboardList} label="Open Requisitions"     value={openMRS.length}      color="indigo"  loading={loadM} />
        <DashKPI icon={Package}       label="Materials Issued Today" value={todayIssues.length} color="emerald" loading={loadI} />
        <DashKPI icon={AlertTriangle} label="Low Stock Alerts"       value={lowStock.length}    color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DashSection
          title="IGNs Awaiting Approval"
          action={<Link to="/stores/ign" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All IGNs <ArrowRight className="w-3 h-3" /></Link>}
        >
          <DashTable cols={grnCols} rows={pendingGRNs.slice(0, 8)} empty="No IGNs pending approval" />
        </DashSection>

        <DashSection
          title="Pending Material Requisitions"
          action={<Link to="/stores/material-requisition" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All MRS <ArrowRight className="w-3 h-3" /></Link>}
        >
          <DashTable cols={mrsCols} rows={openMRS.slice(0, 8)} empty="No open requisitions" />
        </DashSection>
      </div>

      {lowStock.length > 0 && (
        <DashSection title={`⚠ Low Stock Alerts (${lowStock.length} items)`}>
          <div className="flex flex-wrap gap-2">
            {lowStock.slice(0, 12).map((item, i) => (
              <div key={i} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
                <p className="font-medium text-red-700">{item.material_name}</p>
                <p className="text-red-500">Stock: {item.closing_stock} {item.unit} (min: {item.min_stock})</p>
              </div>
            ))}
          </div>
        </DashSection>
      )}
    </div>
  );
}
