import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShoppingCart, FileText, Users, TrendingUp, ArrowRight, Hammer, IndianRupee } from 'lucide-react';
import { poAPI, quotationAPI, vendorAPI, subcontractorAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { DashKPI, DashSection, DashTable, Badge, inr } from './DashKPI';
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

  const { data: vendors = [] } = useQuery({
    queryKey: ['proc-dash-vendors'],
    queryFn: () => vendorAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: wos = [], isLoading: loadW } = useQuery({
    queryKey: ['proc-dash-wos'],
    queryFn: () => subcontractorAPI.listWorkOrders().then(r => r.data?.data ?? []),
  });

  const pendingPOs    = pos.filter(p => p.status === 'pending' || p.status === 'draft');
  const auditOKPOs    = pos.filter(p => p.status === 'verified_audit');
  const releasedPOs   = pos.filter(p => p.status === 'released_mgmt');
  const approvedPOs   = pos.filter(p => p.status === 'approved');
  const thisMonthPOs  = pos.filter(p => dayjs(p.po_date || p.created_at).format('YYYY-MM') === thisMonth);
  const poValueMonth  = thisMonthPOs.reduce((s, p) => s + parseFloat(p.grand_total || p.total_amount || 0), 0);
  const pendingQuotes = quotations.filter(q => q.status === 'sent' || q.status === 'draft');

  const pendingWOs    = wos.filter(w => w.status === 'pending' || w.status === 'draft');
  const activeWOs     = wos.filter(w => ['submitted', 'approved', 'active'].includes(w.status));
  const thisMonthWOs  = wos.filter(w => dayjs(w.wo_date || w.created_at).format('YYYY-MM') === thisMonth);
  const woValueTotal  = wos.reduce((s, w) => s + parseFloat(w.total_value || 0), 0);

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

  return (
    <div className="p-6 space-y-5 bg-[#f4f6f9] min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-slate-800">Good {dayjs().hour() < 12 ? 'morning' : dayjs().hour() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Procurement Dashboard — {dayjs().format('dddd, D MMMM YYYY')}</p>
        </div>
        <Badge label="Procurement" cls="bg-violet-100 text-violet-700 text-xs px-3 py-1" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <DashKPI icon={ShoppingCart} label="POs This Month"    value={thisMonthPOs.length}   sub={inr(poValueMonth)}  color="indigo"  loading={loadP} />
        <DashKPI icon={FileText}     label="Pending Audit"     value={pendingPOs.length}     sub="Awaiting audit"     color="amber"   loading={loadP} />
        <DashKPI icon={TrendingUp}   label="Audit OK"          value={auditOKPOs.length}     sub="Pending director"   color="blue"    loading={loadP} />
        <DashKPI icon={TrendingUp}   label="Mgmt Released"     value={releasedPOs.length}    sub="Pending MD auth"    color="blue"    loading={loadP} />
        <DashKPI icon={TrendingUp}   label="Quotes Open"       value={pendingQuotes.length}  sub="RFQ / evaluation"   color="blue"    loading={loadQ} />
        <DashKPI icon={Users}        label="Vendors"           value={vendors.length}        sub="Registered"         color="emerald" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <DashKPI icon={Hammer}       label="WOs This Month"    value={thisMonthWOs.length}   sub="New work orders"    color="violet"  loading={loadW} />
        <DashKPI icon={FileText}     label="Pending Approval"  value={pendingWOs.length}      sub="Draft / pending"    color="amber"   loading={loadW} />
        <DashKPI icon={TrendingUp}   label="Active WOs"        value={activeWOs.length}       sub="Approved / running" color="emerald" loading={loadW} />
        <DashKPI icon={IndianRupee}  label="Total WO Value"    value={inr(woValueTotal)}      sub={`${wos.length} work orders`} color="cyan" loading={loadW} />
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
      </div>

      {/* Vendor quick view */}
      {vendors.length > 0 && (
        <DashSection title="Top Vendors" action={<Link to="/procurement/vendors" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All Vendors <ArrowRight className="w-3 h-3" /></Link>}>
          <div className="flex flex-wrap gap-2">
            {vendors.slice(0, 12).map(v => (
              <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs">
                <p className="font-medium text-slate-700">{v.name}</p>
                <p className="text-slate-900 font-medium mt-0.5">{v.vendor_type || v.type || 'Vendor'}</p>
              </div>
            ))}
          </div>
        </DashSection>
      )}
    </div>
  );
}
