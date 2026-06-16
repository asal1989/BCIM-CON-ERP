// src/pages/projects/ProjectDetail.jsx
import React from 'react';
import dayjs from 'dayjs';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectAPI, variationAPI, raBillAPI, clientAdvanceAPI } from '../../api/client';
import {
  ArrowLeft, Building2, FileText, UploadCloud, Trash2,
  TrendingUp, Wallet, Receipt, ShieldCheck, History,
  MapPin, Activity, Users, CalendarDays, Hash, Coins, Check, X as XIcon, Pencil
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const STATUS_STYLE = {
  active:    'bg-blue-50 text-blue-700 border-blue-200',
  delayed:   'bg-red-50 text-red-700 border-red-200',
  planning:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  on_hold:   'bg-slate-100 text-slate-900 border-slate-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const inr = v => {
  const n = parseFloat(v || 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const crore = v => {
  const n = parseFloat(v || 0);
  if (n === 0) return '₹0';
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const fullInr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editingAdvance, setEditingAdvance] = React.useState(false);
  const [advanceInput, setAdvanceInput] = React.useState('');

  const { data: project = {}, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectAPI.get(id).then(r => r.data?.data || r.data || {}),
  });

  const saveAdvance = useMutation({
    mutationFn: (val) => projectAPI.update(id, { client_advance_received: val }),
    onSuccess: () => { qc.invalidateQueries(['project', id]); setEditingAdvance(false); toast.success('Advance updated'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const { data: variations = [] } = useQuery({
    queryKey: ['variations', id],
    queryFn: () => variationAPI.list({ project_id: id, status: 'approved' }).then(r => r.data?.data || []),
  });

  const { data: bills = [] } = useQuery({
    queryKey: ['ra-bills', id],
    queryFn: () => raBillAPI.list({ project_id: id }).then(r => r.data?.data || []),
  });

  const { data: advStats = {} } = useQuery({
    queryKey: ['client-advance-stats', id],
    queryFn: () => clientAdvanceAPI.stats({ project_id: id }).then(r => r.data?.data || {}),
  });

  const [docs, setDocs] = React.useState([]);

  const totalVariations = variations.reduce((s, v) => s + parseFloat(v.total_variation_amount || 0), 0);
  const totalBilled = bills
    .filter(b => ['certified', 'paid'].includes(b.status))
    .reduce((s, b) => s + parseFloat(b.gross_amount || 0), 0);
  const totalRetention = bills.reduce((s, b) => s + parseFloat(b.retention_amount || 0), 0);
  const totalRecovery  = bills.reduce((s, b) => s + parseFloat(b.mobilization_advance_recovery || 0), 0);
  const clientAdvance  = parseFloat(project.client_advance_received || 0);
  const advanceBalance = clientAdvance - totalRecovery;
  const revisedContract = parseFloat(project.contract_value || 0) + totalVariations;
  const balanceToExecute = revisedContract - totalBilled;
  const progress = parseFloat(project.progress_pct || 0);

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocs(prev => [...prev, {
      id: Date.now(),
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      date: dayjs().format('DD MMM YYYY'),
    }]);
    toast.success('Document added to project');
    e.target.value = null;
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
        <div className="animate-pulse space-y-5">
          <div className="h-10 w-64 bg-slate-200 rounded-lg" />
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(n => <div key={n} className="h-28 bg-slate-200 rounded-xl" />)}</div>
          <div className="h-64 bg-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9] space-y-6">

      {/* Breadcrumb Header */}
      <div className="flex items-start gap-4">
        <Link
          to="/projects"
          className="mt-1 w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-900 font-medium hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-all shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-medium text-slate-900 leading-tight truncate">{project.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {project.city}{project.state ? `, ${project.state}` : ''}</span>
            <span>·</span>
            <span className="capitalize">{project.type}</span>
            {project.project_code && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {project.project_code}</span>
              </>
            )}
            <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize', STATUS_STYLE[project.status] || STATUS_STYLE.active)}>
              {project.status?.replace('_', ' ')}
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Link to={`/qs/boq?project_id=${id}`} className="px-4 py-2 bg-white border border-slate-200 text-slate-900 text-xs font-medium rounded-lg hover:border-indigo-300 hover:text-indigo-600 shadow-sm transition-all">
            Master BOQ
          </Link>
          <Link to={`/qs/ra-bills?project_id=${id}`} className="px-4 py-2 bg-white border border-slate-200 text-slate-900 text-xs font-medium rounded-lg hover:border-indigo-300 hover:text-indigo-600 shadow-sm transition-all">
            RA Bills
          </Link>
          <Link to={`/hse?project_id=${id}`} className="px-4 py-2 bg-white border border-slate-200 text-slate-900 text-xs font-medium rounded-lg hover:border-indigo-300 hover:text-indigo-600 shadow-sm transition-all">
            Safety Desk
          </Link>
          <button onClick={() => navigate(`/projects/${id}/edit`)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all">
            <Pencil className="w-3.5 h-3.5" /> Edit Project
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Baseline BOQ',         value: inr(project.contract_value), sub: 'Original order value',       color: 'text-indigo-600',  border: 'border-indigo-100' },
          { label: 'Approved Variations',  value: inr(totalVariations),        sub: 'Extras certified',           color: 'text-amber-600',   border: 'border-amber-100' },
          { label: 'Total Certified',      value: inr(totalBilled),            sub: 'Certified & paid bills',     color: 'text-emerald-600', border: 'border-emerald-100' },
          { label: 'Net Retention',        value: inr(totalRetention),         sub: 'Held back from payments',    color: 'text-blue-600',    border: 'border-blue-100' },
          { label: 'Client Advance',       value: inr(clientAdvance),          sub: parseFloat(advStats.total_pending || 0) > 0.01 ? `${crore(advStats.total_pending)} due from client` : (parseFloat(advStats.total_requested || 0) > 0 ? 'Fully received' : 'No advance requested'), color: 'text-orange-600', border: 'border-orange-100' },
        ].map(m => (
          <div key={m.label} className={clsx('bg-white border rounded-xl p-4 shadow-sm', m.border)}>
            <div className={clsx('text-lg font-semibold tracking-tight font-mono mb-1 truncate', m.color)}>{m.value}</div>
            <div className="text-xs font-medium text-slate-600">{m.label}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column */}
        <div className="lg:col-span-4 space-y-5">

          {/* Admin Info */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-900 font-medium uppercase tracking-wider mb-4">
              <Building2 className="w-4 h-4 text-indigo-500" /> Administrative Profile
            </div>
            <div className="space-y-3">
              {[
                ['Client',       project.client_name],
                ['Project Manager', project.pm_name],
                ['Site Lead',    project.se_name],
                ['QS Lead',      project.qs_name],
                ['RERA No.',     project.rera_number || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                  <span className="text-xs text-slate-900 font-medium shrink-0">{k}</span>
                  <span className="text-xs text-slate-900 font-medium text-right">{v || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Progress */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wider">Construction Progress</span>
              <span className={clsx('text-lg font-bold', progress >= 90 ? 'text-emerald-600' : 'text-indigo-600')}>
                {progress.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden mb-5">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
              <div className="text-center">
                <div className="text-[10px] text-slate-900 font-medium uppercase tracking-wider mb-1">Budgeted</div>
                <div className="text-sm font-medium text-slate-900 font-mono">{inr(project.contract_value)}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-slate-900 font-medium uppercase tracking-wider mb-1">Certified</div>
                <div className="text-sm font-medium text-emerald-600 font-mono">{inr(project.total_certified)}</div>
              </div>
            </div>
          </div>

          {/* Key Dates */}
          {(project.start_date || project.end_date) && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-900 font-medium uppercase tracking-wider mb-4">
                <CalendarDays className="w-4 h-4 text-indigo-500" /> Project Timeline
              </div>
              <div className="space-y-3">
                {project.start_date && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Start Date</span>
                    <span className="text-xs font-medium text-slate-800">{dayjs(project.start_date).format('DD MMM YYYY')}</span>
                  </div>
                )}
                {project.end_date && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">End Date</span>
                    <span className="text-xs font-medium text-slate-800">{dayjs(project.end_date).format('DD MMM YYYY')}</span>
                  </div>
                )}
                {project.worker_count > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-900 font-medium flex items-center gap-1.5"><Users className="w-3 h-3" /> Workers on site</span>
                    <span className="text-xs font-medium text-slate-800">{project.worker_count}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8 flex flex-col gap-5">

          {/* Financial Ledger */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
              <div className="w-9 h-9 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                <Wallet size={16} />
              </div>
              <h3 className="text-sm font-medium text-slate-800">Contract Financial Ledger</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contract Summary */}
              <div className="space-y-3">
                <LedgerRow label="Original Contract"   value={fullInr(project.contract_value)} icon={<FileText size={13} />} />
                <LedgerRow label="Approved Variations" value={fullInr(totalVariations)}         icon={<TrendingUp size={13} />} valueClass="text-amber-600" />
                <div className="pt-3 border-t border-slate-100">
                  <LedgerRow label="Revised Contract Sum" value={fullInr(revisedContract)} valueClass="text-slate-900 font-bold" />
                </div>
              </div>

              {/* Recovery & Billing */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <LedgerRow label="Total Billed to Date"  value={fullInr(totalBilled)}    icon={<Receipt size={13} />} />
                <LedgerRow label="Retention Held"        value={fullInr(totalRetention)} icon={<ShieldCheck size={13} />} valueClass="text-blue-600" />
                <LedgerRow label="Advance Recovered"     value={fullInr(totalRecovery)}  icon={<History size={13} />} valueClass="text-indigo-600" />
                <div className="pt-3 border-t border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-500">Balance to Execute</span>
                    <span className={clsx('text-base font-medium font-mono', balanceToExecute < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {fullInr(balanceToExecute)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Advance from Client */}
              <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Coins size={15} className="text-amber-600" />
                    <span className="text-sm font-semibold text-amber-900">Advance Received from Client</span>
                  </div>
                  {!editingAdvance && (
                    <button onClick={() => { setAdvanceInput(clientAdvance || ''); setEditingAdvance(true); }}
                      className="text-xs text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2">
                      Edit
                    </button>
                  )}
                </div>

                {editingAdvance ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">₹</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={advanceInput}
                      onChange={e => setAdvanceInput(e.target.value)}
                      className="flex-1 border border-amber-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      placeholder="0.00"
                      autoFocus
                    />
                    <button onClick={() => saveAdvance.mutate(parseFloat(advanceInput) || 0)}
                      disabled={saveAdvance.isPending}
                      className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingAdvance(false)} className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">
                      <XIcon size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4 mt-1">
                    <div>
                      <p className="text-xs text-amber-700 mb-0.5">Total Advance</p>
                      <p className="text-base font-bold font-mono text-amber-900">{fullInr(clientAdvance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-amber-700 mb-0.5">Recovered in Bills</p>
                      <p className="text-base font-bold font-mono text-indigo-700">{fullInr(totalRecovery)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-amber-700 mb-0.5">Balance to Recover</p>
                      <p className={clsx('text-base font-bold font-mono', advanceBalance > 0 ? 'text-red-600' : 'text-emerald-600')}>
                        {fullInr(advanceBalance)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RA Bills Summary */}
          {bills.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                    <Receipt size={16} />
                  </div>
                  <h3 className="text-sm font-medium text-slate-800">Recent RA Bills</h3>
                </div>
                <Link to={`/qs/ra-bills?project_id=${id}`} className="text-xs text-indigo-600 hover:underline font-medium">
                  View all →
                </Link>
              </div>
              <div className="space-y-2">
                {bills.slice(0, 5).map(b => (
                  <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="text-xs font-medium text-slate-800">{b.bill_number}</div>
                      <div className="text-[11px] text-slate-400">{b.bill_date ? dayjs(b.bill_date).format('DD MMM YYYY') : '—'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-900 font-mono">{inr(b.net_payable)}</span>
                      <span className={clsx(
                        'text-[10px] px-2 py-0.5 rounded-full font-medium border',
                        b.status === 'certified' || b.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        b.status === 'verified'  ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        b.status === 'submitted' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        b.status === 'rejected'  ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-slate-100 text-slate-900 border-slate-200'
                      )}>
                        {b.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document Repository */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center text-slate-500">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-800">Project Repository</h3>
                  <p className="text-xs text-slate-400">PDF documents & drawings</p>
                </div>
              </div>
              <label className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-medium rounded-lg hover:bg-indigo-100 cursor-pointer transition-all">
                <UploadCloud size={13} /> Upload PDF
                <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
              </label>
            </div>

            {docs.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-lg">
                <UploadCloud size={28} className="mb-2 text-slate-300" />
                <p className="text-xs text-slate-400">No documents uploaded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
                        <FileText size={15} />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-800">{doc.name}</div>
                        <div className="text-[10px] text-slate-400">{doc.size} · {doc.date}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setDocs(prev => prev.filter(d => d.id !== doc.id)); toast.success('Document removed'); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-300 hover:text-red-500 hover:border-red-200 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LedgerRow({ label, value, icon, valueClass = 'text-slate-700' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {icon && (
          <div className="w-7 h-7 rounded-md bg-white border border-slate-100 flex items-center justify-center text-slate-400">
            {icon}
          </div>
        )}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <span className={clsx('text-xs font-mono font-semibold', valueClass)}>{value}</span>
    </div>
  );
}
