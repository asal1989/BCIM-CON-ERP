// src/pages/procurement/QuotationPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft, Search, Clock, CheckCircle2,
  FileSearch, UserPlus, Filter, FileBox, ChevronRight,
  Package, AlertCircle, BarChart3, TrendingUp,
  Send, ClipboardList, FileText,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { mrsAPI } from '../../api/client';

const CS_STATUS = {
  pending_entry:        { label: 'RFQ Pending',      color: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-400',   icon: Clock },
  rfq_sent:             { label: 'RFQ Sent',         color: 'bg-cyan-50 text-cyan-700 border-cyan-200',      dot: 'bg-cyan-400',    icon: Send },
  pending_verification: { label: 'In Verification',  color: 'bg-blue-50 text-blue-700 border-blue-200',      dot: 'bg-blue-400',    icon: FileSearch },
  pending_finance:      { label: 'Finance Review',   color: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-400',  icon: ArrowRightLeft },
  pending_approval:     { label: 'MD Approval',      color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-400',  icon: UserPlus },
  approved:             { label: 'CS Approved',      color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400', icon: CheckCircle2 },
};

const SCREEN_CONFIG = {
  rfq: {
    title: 'RFQ Register',
    crumb: 'RFQ',
    subtitle: 'Raised material requests where RFQ can be issued or more vendors can be added',
    empty: 'No RFQs available. Raised material requests will appear here.',
    statuses: ['pending_entry', 'rfq_sent', 'pending_verification'],
    icon: Send,
    actionLabel: 'Issue / Add Vendors',
  },
  quotes: {
    title: 'Quotation Entry Register',
    crumb: 'Quotations',
    subtitle: 'RFQs issued to vendors, including online quotations already received',
    empty: 'No quotations pending or received. Send RFQs first to begin vendor quote entry.',
    statuses: ['rfq_sent', 'pending_verification'],
    icon: FileText,
    actionLabel: 'Open Quotes',
  },
  cs: {
    title: 'Comparative Statement Register',
    crumb: 'Comparative Statements',
    subtitle: 'Prepare, verify, approve, and convert comparative statements to PO',
    empty: 'No comparative statements are ready. Enter vendor quotations first.',
    statuses: ['pending_verification', 'pending_finance', 'pending_approval', 'approved'],
    icon: BarChart3,
    actionLabel: 'Open CS',
  },
  all: {
    title: 'RFQ, Quotations & Comparative Statements',
    crumb: 'RFQ / Quotations / CS',
    subtitle: 'Select vendors, record quotations, prepare CS, and issue purchase orders',
    empty: 'No approved material indents found. Indents must be approved before quotation entry.',
    statuses: Object.keys(CS_STATUS),
    icon: ArrowRightLeft,
    actionLabel: 'Open',
  },
};

const WORKFLOW_TABS = [
  { mode: 'rfq', label: 'RFQ', path: '/procurement/rfqs', icon: Send },
  { mode: 'quotes', label: 'Quotations', path: '/procurement/quotations', icon: FileText },
  { mode: 'cs', label: 'Comparative Statements', path: '/procurement/comparative-statements', icon: BarChart3 },
];

export default function QuotationPage({ mode = 'all' }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const screen = SCREEN_CONFIG[mode] || SCREEN_CONFIG.all;
  const ScreenIcon = screen.icon;
  const allowedStatuses = new Set(screen.statuses);

  // Fetch active MRs so every raised request can enter the RFQ workflow.
  const { data: mrs = [], isLoading } = useQuery({
    queryKey: ['mrs-for-cs'],
    queryFn: () => mrsAPI.list().then(r => r.data?.data || []),
  });

  const normalizeCS = i => ({ ...i, cs_status: i.cs_status || 'pending_entry' });
  const allItems = mrs
    .map(normalizeCS)
    .filter(i => i.status !== 'rejected')
    .filter(i => allowedStatuses.has(i.cs_status));

  const filtered = allItems.filter(i => {
    const q = search.toLowerCase();
    const matchSearch =
      i.mrs_number?.toLowerCase().includes(q) ||
      i.serial_no_formatted?.toLowerCase().includes(q) ||
      i.project_name?.toLowerCase().includes(q) ||
      i.items?.some(it => it.material_name?.toLowerCase().includes(q));
    return matchSearch && (filterStatus === 'all' || i.cs_status === filterStatus);
  });

  const countByStatus = key => allItems.filter(i => i.cs_status === key).length;
  const totalPending = allItems.filter(i => ['pending_entry','rfq_sent','pending_verification','pending_finance','pending_approval'].includes(i.cs_status)).length;
  const visibleStatuses = Object.entries(CS_STATUS).filter(([key]) => allowedStatuses.has(key));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-900 font-medium mb-1">
            <ScreenIcon className="w-3.5 h-3.5" />
            <span>Procurement</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-900 font-medium">{screen.crumb}</span>
          </div>
          <h1 className="text-2xl font-medium text-slate-900">{screen.title}</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">
            {screen.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-center shadow-sm">
            <div className="text-xl font-medium text-slate-900">{totalPending}</div>
            <div className="text-[11px] text-slate-400">Action Needed</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-center shadow-sm">
            <div className="text-xl font-medium text-emerald-600">{countByStatus('approved')}</div>
            <div className="text-[11px] text-slate-400">CS Approved</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-2 mb-6 shadow-sm flex flex-wrap gap-2">
        {WORKFLOW_TABS.map(tab => {
          const Icon = tab.icon;
          const active = mode === tab.mode;
          return (
            <button
              key={tab.mode}
              type="button"
              onClick={() => navigate(tab.path)}
              className={clsx(
                'flex items-center gap-2 px-4 h-10 rounded-lg text-sm border transition-all',
                active
                  ? 'bg-slate-950 text-white border-slate-950 font-bold shadow-sm'
                  : 'bg-white text-slate-950 border-slate-200 font-bold hover:border-indigo-300 hover:text-indigo-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {visibleStatuses.map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = countByStatus(key);
          const active = filterStatus === key;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(active ? 'all' : key)}
              className={clsx(
                'bg-white border rounded-xl p-4 text-left shadow-sm transition-all hover:shadow-md',
                active ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={clsx('p-1.5 rounded-lg', active ? 'bg-indigo-50' : 'bg-slate-50')}>
                  <Icon className={clsx('w-3.5 h-3.5', active ? 'text-indigo-500' : 'text-slate-400')} />
                </div>
                <span className={clsx('w-2 h-2 rounded-full', cfg.dot)} />
              </div>
              <div className="text-2xl font-medium text-slate-900">{count}</div>
              <div className="text-[11px] text-slate-900 font-medium mt-0.5 leading-tight">{cfg.label}</div>
            </button>
          );
        })}
      </div>

      {/* Search + Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-900 font-medium outline-none focus:border-indigo-400 transition-all"
            placeholder="Search MRS #, project, material..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <button
            onClick={() => setFilterStatus('all')}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              filterStatus === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-indigo-300')}
          >All ({allItems.length})</button>
          {visibleStatuses.map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                filterStatus === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-indigo-300')}
            >{cfg.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(n => (
            <div key={n} className="h-16 bg-white border border-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white">
          <FileBox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No comparative statements</p>
          <p className="text-xs text-slate-900 font-medium mt-1">
            {allItems.length === 0
              ? screen.empty
              : 'No records match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">
            <div className="col-span-2">Indent Ref</div>
            <div className="col-span-2">Project</div>
            <div className="col-span-4">Materials</div>
            <div className="col-span-1 text-center">Items</div>
            <div className="col-span-1">MR Status</div>
            <div className="col-span-1">CS Stage</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.map(indent => {
              const cfg = CS_STATUS[indent.cs_status] || CS_STATUS.pending_entry;
              const isRFQ = ['pending_entry', 'rfq_sent', 'pending_verification'].includes(indent.cs_status) && mode === 'rfq';
              const isEntry = indent.cs_status === 'rfq_sent';
              const isReceived = indent.cs_status === 'pending_verification';
              const nextPath = isRFQ
                ? `/procurement/rfq/${indent.id}`
                : isEntry
                  ? `/procurement/quotations/entry/${indent.id}`
                  : `/procurement/quotations/comparison/${indent.id}`;
              const materials = indent.items || [];
              const firstMat = materials[0]?.material_name || '—';
              const extraCount = Math.max(0, materials.length - 1);
              const Icon = cfg.icon;
              const actionText = isRFQ
                ? 'Issue RFQ'
                : isEntry
                  ? 'Enter Quotes'
                  : (isReceived && mode === 'quotes' ? 'Received' : 'View CS');

              return (
                <div
                  key={indent.id}
                  className="grid grid-cols-12 gap-2 px-5 py-4 items-center hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  onClick={() =>
                    navigate(nextPath)
                  }
                >
                  {/* MRS ref */}
                  <div className="col-span-2">
                    <div className="text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                      {indent.serial_no_formatted || indent.mrs_number || indent.id?.slice(0, 8)}
                    </div>
                    <div className="text-[11px] text-slate-900 font-medium mt-0.5">
                      {indent.required_by ? dayjs(indent.required_by).format('DD-MM-YYYY') : '—'}
                    </div>
                  </div>

                  {/* Project */}
                  <div className="col-span-2">
                    <div className="text-sm text-slate-900 font-medium truncate">{indent.project_name || '—'}</div>
                    <div className="text-[11px] text-slate-900 font-medium mt-0.5">{indent.priority || 'Normal'}</div>
                  </div>

                  {/* Materials */}
                  <div className="col-span-4">
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span className="text-sm text-slate-900 truncate">{firstMat}</span>
                      {extraCount > 0 && (
                        <span className="shrink-0 px-1.5 py-0.5 bg-slate-100 text-slate-900 font-medium text-[11px] rounded-full font-medium">
                          +{extraCount} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Item count */}
                  <div className="col-span-1 text-center">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-full">
                      {materials.length}
                    </span>
                  </div>

                  {/* MR Approval Status */}
                  <div className="col-span-1">
                    <span className="inline-flex px-2 py-1 rounded-full text-[11px] font-medium border bg-slate-50 text-slate-700 border-slate-200">
                      {(indent.status || 'raised').replaceAll('_', ' ')}
                    </span>
                  </div>

                  {/* CS Stage */}
                  <div className="col-span-1">
                    <span className={clsx(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border',
                      cfg.color
                    )}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Action */}
                  <div className="col-span-1 flex justify-end">
                    <button
                      className={clsx(
                        'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        isRFQ || isEntry
                          ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-sm'
                          : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                      )}
                      onClick={e => {
                        e.stopPropagation();
                        navigate(nextPath);
                      }}
                    >
                      {actionText}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-400">
            <span>Showing <strong className="text-slate-600">{filtered.length}</strong> of {allItems.length} indents</span>
            <span className="text-[11px]">Source: Active Material Requests</span>
          </div>
        </div>
      )}
    </div>
  );
}
