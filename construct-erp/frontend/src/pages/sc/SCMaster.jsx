// src/pages/sc/SCMaster.jsx — Subcontractor Master Register
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { scAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  Plus, Search, Edit2, Eye, X, RefreshCw, Users, Phone, Mail,
  MapPin, Building2, CreditCard, FileText, ChevronRight,
  AlertTriangle, CheckCircle2, Ban, Briefcase, IndianRupee,
  Wallet, Shield, Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const initials = (name='') => name.trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);
const AVATAR_COLORS = ['#1a3a6b','#0f766e','#9333ea','#c2410c','#0369a1','#b45309','#4f46e5','#be185d'];
const avatarColor = (name='') => AVATAR_COLORS[name.charCodeAt(0)%AVATAR_COLORS.length];

const TRADE_TYPES = ['Civil','Structural','Waterproofing','Electrical','Plumbing','Painting','Carpentry','Tiles','Aluminium','Demolition','Earth Work','Fabrication','Interior','Landscaping','General'];

// ─── Contractor type config ───────────────────────────────────────────────────
const CONTRACTOR_TYPES = {
  sub_contractor:    { label:'Sub-Contractor',    short:'SC',  bg:'bg-orange-100',  text:'text-orange-700',  border:'border-orange-300',  dot:'#EA580C', desc:'Executes specific trade work (civil, MEP, finishing etc.)' },
  labour_contractor: { label:'Labour Contractor', short:'LC',  bg:'bg-blue-100',    text:'text-blue-700',    border:'border-blue-300',    dot:'#1D4ED8', desc:'Supplies skilled / unskilled workforce by attendance' },
};

const STATUS_META = {
  active:      { bg:'bg-emerald-100', text:'text-emerald-700', icon: CheckCircle2, label:'Active' },
  inactive:    { bg:'bg-slate-100',   text:'text-slate-600',   icon: AlertTriangle, label:'Inactive' },
  blacklisted: { bg:'bg-red-100',     text:'text-red-700',     icon: Ban,           label:'Blacklisted' },
};

const EMPTY_FORM = {
  name:'', contact_person:'', mobile:'', email:'',
  gst_number:'', pan_number:'', address:'', city:'', state:'', pincode:'',
  trade_type:'', contractor_type:'sub_contractor',
  bank_name:'', account_number:'', ifsc_code:'', bank_branch:'',
  notes:'', status:'active',
};

// ─── Form Field ───────────────────────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition';

// ─── Register / Edit Modal ────────────────────────────────────────────────────
function SCFormModal({ sc, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!sc;
  const [form, setForm] = useState(isEdit ? { ...sc } : { ...EMPTY_FORM });
  const [tab, setTab] = useState('company');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: d => isEdit ? scAPI.updateSC(sc.id, d) : scAPI.createSC(d),
    onSuccess: () => {
      toast.success(isEdit ? 'Subcontractor updated' : 'Subcontractor registered');
      qc.invalidateQueries({ queryKey: ['sc-list'] });
      qc.invalidateQueries({ queryKey: ['sc-profile', sc?.id] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const TABS = [
    { k:'company', label:'Company Info' },
    { k:'contact', label:'Contact & Address' },
    { k:'bank',    label:'Bank Details' },
    { k:'notes',   label:'Notes' },
  ];

  const canSave = form.name?.trim();

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div>
            <h2 className="font-bold text-white text-base">
              {isEdit ? `Edit — ${sc.sc_code}` : 'Register Subcontractor'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {isEdit ? sc.name : 'Fill in company details to register a new subcontractor'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          {TABS.map(({ k, label }) => (
            <button key={k} onClick={() => setTab(k)}
              className={clsx('px-5 py-3 text-xs font-semibold border-b-2 transition-colors',
                tab === k
                  ? 'border-orange-500 text-orange-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60')}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">

          {/* Company Info */}
          {tab === 'company' && (
            <div className="grid grid-cols-2 gap-4">

              {/* ── Contractor Type toggle — most important field ── */}
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                  Contractor Type <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(CONTRACTOR_TYPES).map(([k, meta]) => {
                    const active = form.contractor_type === k;
                    return (
                      <button key={k} type="button" onClick={() => set('contractor_type', k)}
                        className={clsx(
                          'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                          active ? `${meta.border} shadow-sm` : 'border-slate-200 hover:border-slate-300 bg-white'
                        )}
                        style={active ? { background: k==='sub_contractor' ? '#FFF7ED' : '#EFF6FF' } : {}}>
                        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold', active ? meta.bg : 'bg-slate-100')}
                          style={active ? { color: meta.dot } : { color:'#94A3B8' }}>
                          {meta.short}
                        </div>
                        <div>
                          <p className={clsx('text-sm font-bold', active ? meta.text : 'text-slate-600')}>{meta.label}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{meta.desc}</p>
                        </div>
                        {active && (
                          <div className="ml-auto flex-shrink-0">
                            <CheckCircle2 className="w-5 h-5" style={{ color: meta.dot }} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="col-span-2">
                <Field label="Company / Firm Name" required>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    className={inp} placeholder="e.g. ABC Civil Works Pvt Ltd" />
                </Field>
              </div>
              <Field label="Trade / Work Type">
                <select value={form.trade_type || ''} onChange={e => set('trade_type', e.target.value)} className={inp}>
                  <option value="">Select trade…</option>
                  {TRADE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="GST Number">
                <input value={form.gst_number || ''} onChange={e => set('gst_number', e.target.value.toUpperCase())}
                  className={inp} placeholder="22AAAAA0000A1Z5" maxLength={15} />
              </Field>
              <Field label="PAN Number">
                <input value={form.pan_number || ''} onChange={e => set('pan_number', e.target.value.toUpperCase())}
                  className={inp} placeholder="AAAPL1234C" maxLength={10} />
              </Field>
              {isEdit && (
                <Field label="Status">
                  <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="blacklisted">Blacklisted</option>
                  </select>
                </Field>
              )}
            </div>
          )}

          {/* Contact & Address */}
          {tab === 'contact' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Person Name">
                <input value={form.contact_person || ''} onChange={e => set('contact_person', e.target.value)} className={inp} />
              </Field>
              <Field label="Mobile Number">
                <input value={form.mobile || ''} onChange={e => set('mobile', e.target.value)}
                  className={inp} placeholder="+91 98765 43210" maxLength={15} />
              </Field>
              <div className="col-span-2">
                <Field label="Email Address">
                  <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)}
                    className={inp} placeholder="contact@example.com" />
                </Field>
              </div>
              <div className="col-span-2 border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Address</p>
              </div>
              <div className="col-span-2">
                <Field label="Street Address">
                  <input value={form.address || ''} onChange={e => set('address', e.target.value)} className={inp} />
                </Field>
              </div>
              <Field label="City">
                <input value={form.city || ''} onChange={e => set('city', e.target.value)} className={inp} />
              </Field>
              <Field label="State">
                <input value={form.state || ''} onChange={e => set('state', e.target.value)} className={inp} />
              </Field>
              <Field label="PIN Code">
                <input value={form.pincode || ''} onChange={e => set('pincode', e.target.value)} className={inp} maxLength={6} />
              </Field>
            </div>
          )}

          {/* Bank Details */}
          {tab === 'bank' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 mb-2">
                  Bank details are used to generate payment instructions and verify payments.
                </div>
              </div>
              <Field label="Bank Name">
                <input value={form.bank_name || ''} onChange={e => set('bank_name', e.target.value)}
                  className={inp} placeholder="e.g. State Bank of India" />
              </Field>
              <Field label="IFSC Code">
                <input value={form.ifsc_code || ''} onChange={e => set('ifsc_code', e.target.value.toUpperCase())}
                  className={inp} placeholder="SBIN0001234" maxLength={11} />
              </Field>
              <div className="col-span-2">
                <Field label="Account Number">
                  <input value={form.account_number || ''} onChange={e => set('account_number', e.target.value)} className={inp} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Bank Branch">
                  <input value={form.bank_branch || ''} onChange={e => set('bank_branch', e.target.value)} className={inp} />
                </Field>
              </div>
            </div>
          )}

          {/* Notes */}
          {tab === 'notes' && (
            <Field label="Internal Notes">
              <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={6}
                className={inp + ' resize-none'}
                placeholder="Performance notes, special conditions, past issues…" />
            </Field>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t bg-slate-50/60">
          <div className="flex gap-1.5">
            {TABS.map(({ k }) => (
              <button key={k} onClick={() => setTab(k)}
                className={clsx('w-2 h-2 rounded-full transition-all', tab === k ? 'bg-orange-500 w-4' : 'bg-slate-300')} />
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={() => mut.mutate(form)} disabled={!canSave || mut.isPending}
              className="px-5 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
              style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
              {mut.isPending ? 'Saving…' : isEdit ? 'Update' : 'Register'}
            </button>
          </div>
        </div>
    </div>
  );
}

// ─── Profile Drawer ───────────────────────────────────────────────────────────
function ProfileDrawer({ scId, onClose, onEdit }) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['sc-profile', scId],
    queryFn: () => scAPI.getSC(scId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 0, enabled: !!scId,
  });

  const sc  = raw || {};
  const fin = sc.financials || {};
  const wos = sc.work_orders || [];
  const sm  = STATUS_META[sc.status] || STATUS_META.active;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Drawer header */}
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div className="flex items-center gap-3">
            {sc.name && (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ background: avatarColor(sc.name) }}>
                {initials(sc.name)}
              </div>
            )}
            <div>
              <p className="font-bold text-white text-sm leading-tight">{sc.name || '…'}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {sc.sc_code} · {CONTRACTOR_TYPES[sc.contractor_type]?.label || 'Sub-Contractor'} · {sc.trade_type || 'General'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/sc/profile/${sc.id}`} onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition"
              style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}>
              <ChevronRight className="w-3 h-3" /> Full Profile
            </Link>
            <button onClick={() => { onClose(); onEdit(sc); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition"
              style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}>
              <Edit2 className="w-3 h-3" /> Edit
            </button>
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{ background: 'rgba(255,255,255,0.10)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(n => <div key={n} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Status + Basic */}
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="flex items-center gap-2">
                  <sm.icon className={clsx('w-4 h-4', sm.text)} />
                  <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', sm.bg, sm.text)}>{sm.label}</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400">Registered</p>
                  <p className="text-xs font-semibold text-slate-700">{sc.created_at ? dayjs(sc.created_at).format('DD MMM YYYY') : '—'}</p>
                </div>
              </div>

              {/* Financial summary */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Financial Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Work Orders',   value: wos.length,           color: 'text-indigo-700', mono: true },
                    { label: 'Bills Raised',  value: fin.bill_count ?? 0,  color: 'text-purple-700', mono: true },
                    { label: 'Total Billed',  value: fmt(fin.total_net),   color: 'text-orange-700' },
                    { label: 'Total Paid',    value: fmt(fin.total_paid),  color: 'text-emerald-700' },
                    { label: 'Outstanding',   value: fmt(fin.outstanding), color: fin.outstanding > 0 ? 'text-red-600' : 'text-slate-500' },
                  ].map(({ label, value, color, mono }) => (
                    <div key={label} className="bg-white border border-slate-100 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                      <p className={clsx('text-sm font-bold', color, mono && 'font-mono')}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact info */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Contact Details</p>
                <div className="bg-white border border-slate-100 rounded-xl divide-y divide-slate-50">
                  {[
                    { icon: Users,   value: sc.contact_person, label: 'Contact Person' },
                    { icon: Phone,   value: sc.mobile,         label: 'Mobile' },
                    { icon: Mail,    value: sc.email,          label: 'Email' },
                    { icon: MapPin,  value: [sc.address, sc.city, sc.state, sc.pincode].filter(Boolean).join(', '), label: 'Address' },
                  ].filter(r => r.value).map(({ icon: Icon, value, label }) => (
                    <div key={label} className="flex items-start gap-3 px-4 py-3">
                      <Icon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
                        <p className="text-xs font-medium text-slate-700 break-words">{value}</p>
                      </div>
                    </div>
                  ))}
                  {!sc.contact_person && !sc.mobile && !sc.email && (
                    <p className="px-4 py-3 text-xs text-slate-400 italic">No contact details</p>
                  )}
                </div>
              </div>

              {/* Tax details */}
              {(sc.gst_number || sc.pan_number) && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Tax & Compliance</p>
                  <div className="bg-white border border-slate-100 rounded-xl divide-y divide-slate-50">
                    {sc.gst_number && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Hash className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">GST Number</p>
                          <p className="text-xs font-mono font-bold text-slate-800">{sc.gst_number}</p>
                        </div>
                      </div>
                    )}
                    {sc.pan_number && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">PAN Number</p>
                          <p className="text-xs font-mono font-bold text-slate-800">{sc.pan_number}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bank details */}
              {(sc.bank_name || sc.account_number) && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Bank Details</p>
                  <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-2">
                    {[
                      { l: 'Bank Name',     v: sc.bank_name },
                      { l: 'Account No.',   v: sc.account_number },
                      { l: 'IFSC Code',     v: sc.ifsc_code },
                      { l: 'Branch',        v: sc.bank_branch },
                    ].filter(r => r.v).map(({ l, v }) => (
                      <div key={l} className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">{l}</span>
                        <span className="text-xs font-semibold text-slate-800 font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Work Orders */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Work Orders ({wos.length})</p>
                  <Link to="/sc/work-orders" onClick={onClose}
                    className="flex items-center gap-1 text-[10px] font-semibold text-orange-600 hover:text-orange-700">
                    View All <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                {wos.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-4 text-center text-xs text-slate-400">No work orders yet</div>
                ) : (
                  <div className="space-y-2">
                    {wos.map(wo => (
                      <div key={wo.id} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-indigo-700 font-mono">{wo.wo_number}</p>
                          <p className="text-[11px] text-slate-600 truncate">{wo.subject}</p>
                          <p className="text-[10px] text-slate-400">{wo.project_name}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
                          <span className="text-xs font-bold text-slate-800">{fmt(wo.contract_amount)}</span>
                          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase',
                            wo.status === 'active'    ? 'bg-emerald-100 text-emerald-700' :
                            wo.status === 'completed' ? 'bg-teal-100 text-teal-700' :
                            wo.status === 'approved'  ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-500')}>
                            {wo.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              {sc.notes && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Notes</p>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-slate-700 whitespace-pre-wrap">{sc.notes}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SCMaster() {
  const { selectedProjectId } = useAuthStore();
  const [search,   setSearch]   = useState('');
  const [statusFilter, setStatus] = useState('');
  const [tradeFilter,  setTrade]  = useState('');
  const [typeFilter,   setType]   = useState('');   // '' | 'sub_contractor' | 'labour_contractor'
  const [modal,  setModal]        = useState(null);  // null | 'new' | sc_object
  const [drawer, setDrawer]       = useState(null);  // sc_id | null

  const { data: list = [], isLoading, refetch } = useQuery({
    queryKey: ['sc-list', selectedProjectId, statusFilter, tradeFilter, typeFilter],
    queryFn: () => scAPI.listSC({
      project_id:      selectedProjectId || undefined,
      status:          statusFilter || undefined,
      trade_type:      tradeFilter  || undefined,
      contractor_type: typeFilter   || undefined,
    }).then(r => r.data?.data || []),
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });

  // Client-side search
  const filtered = useMemo(() => {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(s =>
      [s.name, s.sc_code, s.mobile, s.trade_type, s.contact_person, s.gst_number, s.city].some(v => v?.toLowerCase().includes(q))
    );
  }, [list, search]);

  // KPI counts
  const counts = useMemo(() => ({
    total:             list.length,
    active:            list.filter(s => s.status === 'active').length,
    inactive:          list.filter(s => s.status === 'inactive').length,
    blacklisted:       list.filter(s => s.status === 'blacklisted').length,
    sub_contractor:    list.filter(s => s.contractor_type === 'sub_contractor').length,
    labour_contractor: list.filter(s => s.contractor_type === 'labour_contractor').length,
  }), [list]);

  // Unique trades for filter
  const tradeOptions = useMemo(() =>
    [...new Set(list.map(s => s.trade_type).filter(Boolean))].sort(), [list]);

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Subcontractor Master"
        subtitle="Registered companies, vendors & labour contractors"
        breadcrumbs={[{ label: 'Subcontractors' }, { label: 'Master Register' }]}
        actions={
          <button onClick={() => setModal('new')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
            style={{ background: '#fff', color: Theme.navyDark }}>
            <Plus className="w-3.5 h-3.5" /> Register Subcontractor
          </button>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ThemeKpiCard icon={Users}         label="Total Registered"   value={counts.total}              color="blue"    sub="All contractors" />
          <ThemeKpiCard icon={Briefcase}     label="Sub-Contractors"    value={counts.sub_contractor}     color="orange"  sub="Trade work" />
          <ThemeKpiCard icon={Users}         label="Labour Contractors" value={counts.labour_contractor}  color="slate"   sub="Manpower supply" />
          <ThemeKpiCard icon={CheckCircle2}  label="Active"             value={counts.active}             color="emerald" sub="Currently working" />
          <ThemeKpiCard icon={AlertTriangle} label="Inactive"           value={counts.inactive}           color="amber"   sub="Not in use" />
          <ThemeKpiCard icon={Ban}           label="Blacklisted"        value={counts.blacklisted}        color="red"     sub="Blocked" />
        </div>

        {/* Contractor Type Tab Filter */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit">
          {[
            { k:'',                  label:'All Types',         count: counts.total },
            { k:'sub_contractor',    label:'Sub-Contractors',   count: counts.sub_contractor,    dot: '#EA580C' },
            { k:'labour_contractor', label:'Labour Contractors',count: counts.labour_contractor, dot: '#1D4ED8' },
          ].map(({ k, label, count, dot }) => (
            <button key={k} onClick={() => setType(k)}
              className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                typeFilter === k ? 'text-white shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50')}
              style={typeFilter === k ? { background: dot || `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` } : {}}>
              {dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: typeFilter === k ? '#fff' : dot }} />}
              {label} ({count})
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, code, mobile, GST…"
              className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-300 shadow-sm" />
          </div>
          <select value={statusFilter} onChange={e => setStatus(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
          <select value={tradeFilter} onChange={e => setTrade(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-36">
            <option value="">All Trades</option>
            {tradeOptions.map(t => <option key={t}>{t}</option>)}
          </select>
          <button onClick={() => refetch()} className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-400 font-medium">{filtered.length} of {list.length} records</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1,2,3,4,5].map(n => (
                <div key={n} className="flex gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-1/3" />
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-semibold">No subcontractors found</p>
              <p className="text-xs text-slate-400 mt-1">
                {search || statusFilter || tradeFilter ? 'Try adjusting your filters' : 'Register your first subcontractor'}
              </p>
              {!search && !statusFilter && !tradeFilter && (
                <button onClick={() => setModal('new')}
                  className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl mx-auto"
                  style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
                  <Plus className="w-4 h-4" /> Register First Subcontractor
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
                    {['', 'SC Code', 'Company Name', 'Contact', 'Trade', 'GST / PAN', 'Work Orders', 'Billed', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/80 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => {
                    const sm = STATUS_META[s.status] || STATUS_META.active;
                    return (
                      <tr key={s.id}
                        className={clsx('border-b border-slate-50 transition-colors cursor-pointer',
                          i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30',
                          'hover:bg-orange-50/40')}
                        onClick={() => setDrawer(s.id)}>

                        {/* Avatar */}
                        <td className="px-3 py-3 w-12">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ background: avatarColor(s.name) }}>
                            {initials(s.name)}
                          </div>
                        </td>

                        {/* Code */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg">{s.sc_code}</span>
                        </td>

                        {/* Name */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 text-sm leading-tight">{s.name}</p>
                          {(s.city || s.state) && (
                            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{[s.city, s.state].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </td>

                        {/* Contact */}
                        <td className="px-4 py-3">
                          {s.contact_person && <p className="text-xs text-slate-700 font-medium">{s.contact_person}</p>}
                          {s.mobile && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" />{s.mobile}
                            </p>
                          )}
                          {s.email && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 max-w-[150px] truncate">
                              <Mail className="w-3 h-3 flex-shrink-0" />{s.email}
                            </p>
                          )}
                        </td>

                        {/* Contractor Type + Trade */}
                        <td className="px-4 py-3">
                          {/* Type badge */}
                          {(() => {
                            const ct = CONTRACTOR_TYPES[s.contractor_type] || CONTRACTOR_TYPES.sub_contractor;
                            return (
                              <span className={clsx('inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold mb-1', ct.bg, ct.text)}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: ct.dot }} />
                                {ct.short} — {ct.label.replace(' Contractor','')}
                              </span>
                            );
                          })()}
                          {s.trade_type && (
                            <div>
                              <span className="text-xs bg-orange-50 text-orange-700 border border-orange-100 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                                {s.trade_type}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* GST/PAN */}
                        <td className="px-4 py-3">
                          {s.gst_number ? (
                            <p className="text-xs font-mono text-slate-700">{s.gst_number}</p>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                          {s.pan_number && <p className="text-xs font-mono text-slate-400 mt-0.5">{s.pan_number}</p>}
                        </td>

                        {/* WOs */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-base font-bold text-indigo-700">{s.wo_count || 0}</span>
                        </td>

                        {/* Billed */}
                        <td className="px-4 py-3">
                          <p className="text-xs font-bold text-slate-800">{fmt(s.total_billed)}</p>
                          {parseFloat(s.total_paid) > 0 && (
                            <p className="text-[10px] text-emerald-600 mt-0.5">Paid: {fmt(s.total_paid)}</p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={clsx('flex items-center gap-1 w-fit text-xs px-2 py-0.5 rounded-full font-semibold', sm.bg, sm.text)}>
                            <sm.icon className="w-3 h-3" /> {sm.label}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setDrawer(s.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="View Profile">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => setModal(s)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors" title="Edit">
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Profile Drawer */}
      {drawer && (
        <ProfileDrawer
          scId={drawer}
          onClose={() => setDrawer(null)}
          onEdit={sc => { setDrawer(null); setModal(sc); }}
        />
      )}

      {/* Form Modal */}
      {modal && (
        <SCFormModal
          sc={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
