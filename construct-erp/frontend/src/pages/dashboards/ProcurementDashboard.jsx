import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, FileText, Users, TrendingUp, ArrowRight, Hammer, IndianRupee,
  Clock, UserCheck, Building2, CheckCircle2, Package, Check, AlertTriangle, ClipboardList,
} from 'lucide-react';
import { poAPI, quotationAPI, vendorAPI, subcontractorAPI, mrsAPI, inventoryAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { FlatKPI, DashSection, DashTable, Badge, inr } from './DashKPI';
import dayjs from 'dayjs';

const PO_CLS = {
  draft:    'bg-slate-100 text-slate-600',
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  completed:'bg-blue-100 text-blue-700',
  cancelled:'bg-red-100 text-red-700',
};
const QT_CLS = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-100 text-blue-700',
  received: 'bg-indigo-100 text-indigo-700',
  approved: 'bg-emerald-100 text-emerald-700',
};
const WO_CLS = {
  draft:      'bg-slate-100 text-slate-600',
  pending:    'bg-amber-100 text-amber-700',
  submitted:  'bg-blue-100 text-blue-700',
  approved:   'bg-emerald-100 text-emerald-700',
  active:     'bg-teal-100 text-teal-700',
  completed:  'bg-indigo-100 text-indigo-700',
  terminated: 'bg-red-100 text-red-700',
  closed:     'bg-gray-100 text-gray-500',
  rejected:   'bg-red-100 text-red-700',
};
const MRS_CLS = {
  draft:    'bg-slate-100 text-slate-600',
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  issued:   'bg-blue-100 text-blue-700',
};

export default function ProcurementDashboard() {
  const { user } = useAuthStore();
  const thisMonth = dayjs().format('YYYY-MM');

  const { data: pos = [], isLoading: loadP } = useQuery({
    queryKey: ['proc-dash-pos'],
    queryFn: () => poAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: quotations = [], isLoading: loadQ } = useQuery({
    queryKey: ['proc-dash-quotations'],
    queryFn: () => quotationAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: vendors = [], isLoading: loadV } = useQuery({
    queryKey: ['proc-dash-vendors'],
    queryFn: () => vendorAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: wos = [], isLoading: loadW } = useQuery({
    queryKey: ['proc-dash-wos'],
    queryFn: () => subcontractorAPI.listWorkOrders().then(r => r.data?.data ?? []),
  });

  const { data: mrsList = [], isLoading: loadM } = useQuery({
    queryKey: ['proc-dash-mrs'],
    queryFn: () => mrsAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: lowStock = [], isLoading: loadL } = useQuery({
    queryKey: ['proc-dash-low-stock'],
    queryFn: () => inventoryAPI.lowStock().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  // PO pipeline
  const pendingPOs    = pos.filter(p => p.status === 'pending');
  const auditOKPOs    = pos.filter(p => p.status === 'verified_audit');
  const releasedPOs   = pos.filter(p => p.status === 'released_mgmt');
  const approvedPOs   = pos.filter(p => p.status === 'approved');
  const receivingPOs  = pos.filter(p => p.status === 'part_received');
  const receivedPOs   = pos.filter(p => p.status === 'fully_received');
  const thisMonthPOs  = pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === thisMonth);
  const poValueMonth  = thisMonthPOs.reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0);
  const poValueTotal  = pos.reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0);
  const pendingQuotes = quotations.filter(q => q.status === 'sent' || q.status === 'draft');

  // Work orders
  const pendingWOs    = wos.filter(w => w.status === 'pending' || w.status === 'draft');
  const activeWOs     = wos.filter(w => ['submitted', 'approved', 'active'].includes(w.status));
  const thisMonthWOs  = wos.filter(w => dayjs(w.wo_date || w.created_at).format('YYYY-MM') === thisMonth);
  const woValueTotal  = wos.reduce((s, w) => s + parseFloat(w.total_value || 0), 0);

  // MRS
  const pendingMRS    = mrsList.filter(m => m.status === 'pending' || m.status === 'draft');

  const poCols = [
    { key: 'po_number',    label: 'PO #',    cls: 'font-mono text-[11px] text-slate-500' },
    { key: 'vendor_name',  label: 'Vendor',  cls: 'font-medium text-slate-900 max-w-[120px] truncate' },
    { key: 'grand_total',  label: 'Value',   right: true, render: r => inr(r.grand_total || r.total_amount) },
    { key: 'po_date',      label: 'Date',    render: r => r.po_date ? dayjs(r.po_date).format('DD MMM') : '—' },
    { key: 'status',       label: 'Status',  render: r => <Badge label={r.status || 'draft'} cls={PO_CLS[r.status] || PO_CLS.draft} /> },
  ];

  const qtCols = [
    { key: 'quotation_number', label: 'Ref #',      cls: 'font-mono text-[11px] text-slate-500' },
    { key: 'vendor_name',      label: 'Vendor',     cls: 'font-medium text-slate-900 max-w-[120px] truncate' },
    { key: 'subject',          label: 'Material',   cls: 'text-slate-900 max-w-[130px] truncate' },
    { key: 'created_at',       label: 'Date',       render: r => r.created_at ? dayjs(r.created_at).format('DD MMM') : '—' },
    { key: 'status',           label: 'Status',     render: r => <Badge label={r.status || 'draft'} cls={QT_CLS[r.status] || QT_CLS.draft} /> },
  ];

  const woCols = [
    { key: 'wo_number',   label: 'WO #',       cls: 'font-mono text-[11px] text-slate-500' },
    { key: 'vendor_name', label: 'Contractor', cls: 'font-medium text-slate-900 max-w-[120px] truncate' },
    { key: 'subject',     label: 'Scope',      cls: 'text-slate-900 max-w-[130px] truncate' },
    { key: 'total_value', label: 'Value',      right: true, render: r => inr(r.total_value) },
    { key: 'status',      label: 'Status',     render: r => <Badge label={r.status || 'draft'} cls={WO_CLS[r.status] || WO_CLS.draft} /> },
  ];

  const mrsCols = [
    { key: 'mrs_number',  label: 'MRS #',    cls: 'font-mono text-[11px] text-slate-500' },
    { key: 'project_name',label: 'Project',  cls: 'font-medium text-slate-900 max-w-[120px] truncate' },
    { key: 'requested_by',label: 'Requested By', cls: 'text-slate-900 max-w-[120px] truncate' },
    { key: 'created_at',  label: 'Date',     render: r => r.created_at ? dayjs(r.created_at).format('DD MMM') : '—' },
    { key: 'status',      label: 'Status',   render: r => <Badge label={r.status || 'draft'} cls={MRS_CLS[r.status] || MRS_CLS.draft} /> },
  ];

  const lowStockCols = [
    { key: 'item_name',     label: 'Item',     cls: 'font-medium text-slate-900 max-w-[140px] truncate' },
    { key: 'project_name',  label: 'Project',  cls: 'text-slate-900 max-w-[110px] truncate' },
    { key: 'current_stock', label: 'In Stock', right: true, render: r => `${r.current_stock ?? 0} ${r.unit || ''}` },
    { key: 'reorder_level', label: 'Reorder At', right: true, render: r => `${r.reorder_level ?? '—'} ${r.unit || ''}` },
  ];

  return (
    <div className="p-6 space-y-5 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Good {dayjs().hour() < 12 ? 'morning' : dayjs().hour() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-400 mt-0.5">Procurement Dashboard — {dayjs().format('dddd, D MMMM YYYY')}</p>
        </div>
        <Badge label="Procurement" cls="bg-violet-100 text-violet-700 text-xs px-3 py-1" />
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <FlatKPI icon={ShoppingCart} label="POs This Month"  value={thisMonthPOs.length} sub={inr(poValueMonth)} color="blue"    loading={loadP} to="/procurement/po" />
        <FlatKPI icon={IndianRupee}  label="Total PO Value"  value={inr(poValueTotal)}   sub={`${pos.length} purchase orders`} color="indigo" loading={loadP} to="/procurement/po-register" />
        <FlatKPI icon={Hammer}       label="Total WO Value"  value={inr(woValueTotal)}   sub={`${wos.length} work orders`} color="violet" loading={loadW} to="/procurement/work-orders" />
        <FlatKPI icon={TrendingUp}   label="Quotes Open"     value={pendingQuotes.length} sub="RFQ / evaluation" color="cyan"   loading={loadQ} to="/procurement/quotations" />
        <FlatKPI icon={ClipboardList} label="MRS Pending"    value={pendingMRS.length}   sub="Awaiting approval" color="amber"  loading={loadM} to="/procurement/material-request" />
        <FlatKPI icon={Users}        label="Vendors"         value={vendors.length}      sub="Registered"        color="emerald" loading={loadV} to="/procurement/vendors" />
      </div>

      {/* PO pipeline */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Purchase Order Pipeline</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <FlatKPI icon={Clock}        label="Pending Audit" value={pendingPOs.length}   color="amber"   loading={loadP} to="/procurement/po" />
          <FlatKPI icon={UserCheck}    label="Audit OK"      value={auditOKPOs.length}   color="blue"    loading={loadP} to="/procurement/po" />
          <FlatKPI icon={Building2}    label="Mgmt Released" value={releasedPOs.length}  color="violet"  loading={loadP} to="/procurement/po" />
          <FlatKPI icon={CheckCircle2} label="Authorized"    value={approvedPOs.length}  color="emerald" loading={loadP} to="/procurement/po" />
          <FlatKPI icon={Package}      label="Receiving"     value={receivingPOs.length} color="cyan"    loading={loadP} to="/procurement/po" />
          <FlatKPI icon={Check}        label="Received"      value={receivedPOs.length}  color="green"   loading={loadP} to="/procurement/po" />
        </div>
      </div>

      {/* Work orders & inventory */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Work Orders &amp; Inventory</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FlatKPI icon={Hammer}         label="WOs This Month"   value={thisMonthWOs.length} color="violet"  loading={loadW} to="/procurement/work-orders" />
          <FlatKPI icon={Clock}          label="Pending Approval" value={pendingWOs.length}   color="amber"   loading={loadW} to="/procurement/work-orders" />
          <FlatKPI icon={CheckCircle2}   label="Active WOs"       value={activeWOs.length}    color="emerald" loading={loadW} to="/procurement/work-orders" />
          <FlatKPI icon={AlertTriangle}  label="Low Stock Items"  value={lowStock.length}      color="red"     loading={loadL} to="/procurement/inventory" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DashSection
          title="Recent Purchase Orders"
          action={<Link to="/procurement/po" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All POs <ArrowRight className="w-3 h-3" /></Link>}
        >
          <DashTable cols={poCols} rows={pos.slice(0, 8)} empty="No purchase orders found" />
        </DashSection>

        <DashSection
          title="Recent Work Orders"
          action={<Link to="/procurement/work-orders" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All WOs <ArrowRight className="w-3 h-3" /></Link>}
        >
          <DashTable cols={woCols} rows={wos.slice(0, 8)} empty="No work orders found" />
        </DashSection>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DashSection
          title="Quotations to Evaluate"
          action={<Link to="/procurement/quotations" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All <ArrowRight className="w-3 h-3" /></Link>}
        >
          <DashTable cols={qtCols} rows={pendingQuotes.slice(0, 8)} empty="No pending quotations" />
        </DashSection>

        <DashSection
          title="Material Requests Pending"
          action={<Link to="/procurement/material-request" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All MRS <ArrowRight className="w-3 h-3" /></Link>}
        >
          <DashTable cols={mrsCols} rows={pendingMRS.slice(0, 8)} empty="No pending material requests" />
        </DashSection>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DashSection
          title="Low Stock Alerts"
          action={<Link to="/procurement/inventory" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">Inventory <ArrowRight className="w-3 h-3" /></Link>}
        >
          <DashTable cols={lowStockCols} rows={lowStock.slice(0, 8)} empty="All stock levels healthy" />
        </DashSection>

        {/* Vendor quick view */}
        <DashSection title="Top Vendors" action={<Link to="/procurement/vendors" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All Vendors <ArrowRight className="w-3 h-3" /></Link>}>
          {vendors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {vendors.slice(0, 12).map(v => (
                <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs">
                  <p className="font-medium text-slate-700">{v.name}</p>
                  <p className="text-slate-400 mt-0.5">{v.vendor_type || v.type || 'Vendor'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-400 py-6">No vendors found</p>
          )}
        </DashSection>
      </div>
    </div>
  );
}
