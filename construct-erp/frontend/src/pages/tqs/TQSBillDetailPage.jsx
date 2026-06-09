import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tqsBillsAPI, projectAPI, poAPI } from '../../api/client';
import api from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import SignaturePadModal from '../../components/common/SignaturePadModal';
import {
  ArrowLeft, FileText, Warehouse, CreditCard,
  Upload, Trash2, ExternalLink, Clock, CheckCircle2, AlertCircle,
  IndianRupee, X, Download, Printer, ListOrdered, Award, PenLine, RefreshCw,
  Inbox,
  Cloud, CloudOff, ChevronRight
} from 'lucide-react';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

const STATUS_COLORS = {
  pending:             'bg-amber-100 text-amber-700',
  stores:              'bg-blue-100 text-blue-700',
  document_controller: 'bg-cyan-100 text-cyan-700',
  qs:                  'bg-emerald-100 text-emerald-700',
  accounts:            'bg-purple-100 text-purple-700',
  procurement:         'bg-orange-100 text-orange-700',
  qs_sign:             'bg-violet-100 text-violet-700',
  paid:                'bg-emerald-100 text-emerald-700',
};

const TABS = [
  { id: 'overview',    label: 'Overview',            icon: FileText     },
  { id: 'stores',      label: 'Stores',              icon: Warehouse    },
  { id: 'doc_control', label: 'Document Controller', icon: Inbox        },
  { id: 'qs',          label: 'QS Certification',    icon: Award        },
  { id: 'accounts',    label: 'Accounts',            icon: CreditCard   },
  { id: 'procurement', label: 'Procurement',         icon: Inbox        },
  { id: 'qs_sign',     label: 'QS Sign',             icon: PenLine      },
  { id: 'payment',     label: 'Payment',             icon: IndianRupee  },
];

const DEPT_TAB_MAP = [
  { match: ['store'], tabs: ['stores'] },
  { match: ['document controller', 'document', 'controller', 'doc'], tabs: ['doc_control'] },
  { match: ['qs', 'quantity'], tabs: ['qs', 'qs_sign'] },
  { match: ['account', 'finance'], tabs: ['accounts', 'payment'] },
  { match: ['procure', 'purchase'], tabs: ['procurement'] },
];

function refreshBillQueries(qc, billId) {
  qc.invalidateQueries({ queryKey: ['tqs-bill', billId] });
  qc.invalidateQueries({ queryKey: ['tqs-bills'] });
  qc.invalidateQueries({ queryKey: ['dashboard-tqs-bills'] });
  qc.invalidateQueries({ queryKey: ['liability-summary'] });
  qc.invalidateQueries({ queryKey: ['liability-ledger'] });
}

// Roles that need full cross-department visibility (management, PM, etc.)
const FULL_ACCESS_ROLES = [
  'super_admin', 'admin', 'management', 'project_manager',
  'planning_engineer', 'site_engineer', 'contracts_manager',
  'tender_manager', 'hr', 'it_admin',
];

function getVisibleTabsForDepartment(department, role) {
  if (FULL_ACCESS_ROLES.includes(role)) return TABS;

  const normalizedDept = String(department || '').toLowerCase();

  for (const rule of DEPT_TAB_MAP) {
    if (rule.match.some(token => normalizedDept.includes(token))) {
      return TABS.filter(tab => tab.id === 'overview' || rule.tabs.includes(tab.id));
    }
  }

  // Fallback: show all tabs so users are never completely locked out
  return TABS;
}

function Field({ label, value }) {
  const empty = !value || value === '—';
  return (
    <div>
      <span className="block text-[11px] font-medium text-slate-900 font-medium uppercase tracking-[0.10em] mb-1">{label}</span>
      <span className={`text-[14px] font-medium tracking-tight ${empty ? 'text-slate-300' : 'text-slate-900'}`}>{value || '—'}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="text-[11px] font-medium text-slate-900 uppercase tracking-[0.14em] mb-3 flex items-center gap-2">
      <span className="inline-block w-1 h-3.5 rounded-full" style={{ background: '#1a3a6b' }} />
      {children}
    </p>
  );
}

/* ─── Overview Tab ─── */
function RequiredDateLabel({ children }) {
  return (
    <label className="block text-xs font-medium text-slate-900 mb-1">
      {children}<span className="text-red-500 ml-0.5">*</span>
    </label>
  );
}

function requireDates(form, fields) {
  const missing = fields.filter(field => !form[field.key]);
  if (missing.length) {
    toast.error(`Please enter required date: ${missing[0].label}`);
    return false;
  }
  return true;
}

function OverviewTab({ bill }) {
  const items = bill.line_items || [];
  const upd = bill.bill_updates || {};
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Basic Amount',  value: `₹${inr(bill.basic_amount)}`,     accent: '#1a3a6b' },
          { label: 'GST Amount',    value: `₹${inr(bill.gst_amount)}`,        accent: '#d97706' },
          { label: 'Transport',     value: `₹${inr(bill.transport_charges)}`, accent: '#0891b2' },
          { label: 'Total Invoice', value: `₹${inr(bill.total_amount)}`,      accent: '#1d4ed8' },
        ].map(c => (
          <div key={c.label}
            className="bg-white rounded-xl px-4 py-3.5 border-2"
            style={{ borderColor: '#e2e8f0', borderLeft: `4px solid ${c.accent}` }}>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">{c.label}</p>
            <p className="text-xl font-medium tracking-tight mt-1" style={{ color: c.accent }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="CGST" value={bill.cgst_pct ? `${bill.cgst_pct}% = ₹${inr(bill.cgst_amt)}` : null} />
        <Field label="SGST" value={bill.sgst_pct ? `${bill.sgst_pct}% = ₹${inr(bill.sgst_amt)}` : null} />
        <Field label="IGST" value={bill.igst_pct ? `${bill.igst_pct}% = ₹${inr(bill.igst_amt)}` : null} />
        <Field label="Other Charges" value={bill.other_charges ? `₹${inr(bill.other_charges)}` : null} />
        <Field label="Bill Type" value={bill.bill_type === 'wo' ? 'Work Order' : 'Purchase Order'} />
        <Field label="Invoice Month" value={bill.inv_month} />
        <Field label="Sent to HO" value={fmt(upd.sent_to_ho_date)} />
        <Field label="HO Received" value={fmt(upd.ho_received_date)} />
        <Field label="Handed to QS" value={fmt(upd.handed_over_qs_date)} />
        <Field label="Handed to Accounts" value={fmt(upd.handed_over_accounts_date)} />
        <Field label="Accounts Received from QS" value={fmt(upd.accts_received_from_qs_date)} />
        <Field label="Proc. Received from Accounts" value={fmt(upd.proc_received_from_accounts_date)} />
        <Field label="Proc. Handed to QS (Sign)"   value={fmt(upd.proc_handed_over_to_accounts_date)} />
        <Field label="QS Sign Received from Procurement" value={fmt(upd.qs_sign_received_from_procurement_date)} />
        <Field label="MD Signed Date"               value={fmt(upd.qs_sign_date)} />
        <Field label="QS Handed to Accounts"        value={fmt(upd.qs_sign_handed_to_accounts_date)} />
      </div>

      {items.length > 0 && (
        <div>
          <SectionTitle>Line Items</SectionTitle>
          <div className="overflow-x-auto rounded-xl border-2 border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead style={{ background: 'linear-gradient(90deg, #1a3a6b 0%, #122d58 100%)' }}>
                <tr>
                  {['#', 'Description', 'Unit', 'Qty', 'Rate (₹)', 'GST%', 'Total (₹)'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[11px] font-medium text-white uppercase tracking-[0.10em]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it, i) => (
                  <tr key={it.id || i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-900 font-medium text-xs font-medium">{i + 1}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium tracking-tight">{it.item_name}</td>
                    <td className="px-4 py-3 text-slate-900 font-semibold">{it.unit}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium font-mono tracking-tight">{it.quantity}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium font-mono tracking-tight">₹{inr(it.rate)}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium font-mono">{it.gst_pct}%</td>
                    <td className="px-4 py-3 font-medium font-mono tracking-tight" style={{ color: '#1d4ed8' }}>₹{inr(it.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Stores Tab ─── */
function StoresTab({ bill, billId }) {
  const qc = useQueryClient();
  const upd = bill.bill_updates || {};
  const [form, setForm] = useState({
    store_recv_date: upd.store_recv_date?.slice(0, 10) || '',
    dc_number: upd.dc_number || '',
    vehicle_number: upd.vehicle_number || '',
    inspection_status: upd.inspection_status || 'pending',
    received_by: upd.received_by || '',
    sent_to_ho_date: upd.sent_to_ho_date?.slice(0, 10) || '',
    store_remarks: upd.store_remarks || '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: (d) => tqsBillsAPI.updateStores(billId, d),
    onSuccess: () => { refreshBillQueries(qc, billId); toast.success('Stores updated'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <SectionTitle>Store Receipt Details</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: 'Received Date', key: 'store_recv_date', type: 'date' },
            { label: 'DC Number', key: 'dc_number' },
            { label: 'Vehicle Number', key: 'vehicle_number' },
            { label: 'Received By', key: 'received_by' },
            { label: 'Sent to HO Date', key: 'sent_to_ho_date', type: 'date' },
          ].map(f => (
            <div key={f.key}>
              {f.type === 'date' ? <RequiredDateLabel>{f.label}</RequiredDateLabel> : <label className="block text-xs font-medium text-slate-900 mb-1">{f.label}</label>}
            <input
              type={f.type || 'text'}
              required={f.type === 'date'}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={form[f.key]} onChange={e => set(f.key, e.target.value)}
            />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-slate-900 mb-1">Inspection Status</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={form.inspection_status} onChange={e => set('inspection_status', e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="partial">Partial</option>
          </select>
        </div>
      </div>
        <div>
          <label className="block text-xs font-medium text-slate-900 mb-1">Remarks</label>
          <textarea
          rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          value={form.store_remarks} onChange={e => set('store_remarks', e.target.value)}
        />
      </div>
      <button
        onClick={() => requireDates(form, [
          { key: 'store_recv_date', label: 'Received Date' },
          { key: 'sent_to_ho_date', label: 'Sent to HO Date' },
        ]) && mutation.mutate(form)}
        disabled={mutation.isPending}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving…' : 'Save & Send to Document Controller'}
      </button>
    </div>
  );
}

/* ─── Document Controller Tab ─── */
function DocumentControlTab({ bill, billId }) {
  const qc = useQueryClient();
  const upd = bill.bill_updates || {};
  const [form, setForm] = useState({
    ho_received_date: upd.ho_received_date?.slice(0, 10) || '',
    handed_over_qs_date: upd.handed_over_qs_date?.slice(0, 10) || '',
    document_controller_remarks: upd.document_controller_remarks || '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: (d) => tqsBillsAPI.updateDocumentControl(billId, d),
    onSuccess: () => { refreshBillQueries(qc, billId); toast.success('Document Controller updated'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <SectionTitle>Head Office Document Control</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Date Received at HO', key: 'ho_received_date', type: 'date' },
          { label: 'Date Handed Over to QS', key: 'handed_over_qs_date', type: 'date' },
        ].map(f => (
          <div key={f.key}>
            <RequiredDateLabel>{f.label}</RequiredDateLabel>
            <input
              type={f.type || 'text'}
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={form[f.key]}
              onChange={e => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-900 mb-1">Remarks</label>
        <textarea
          rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          value={form.document_controller_remarks}
          onChange={e => set('document_controller_remarks', e.target.value)}
        />
      </div>
      <button
        onClick={() => requireDates(form, [
          { key: 'ho_received_date', label: 'Date Received at HO' },
          { key: 'handed_over_qs_date', label: 'Date Handed Over to QS' },
        ]) && mutation.mutate(form)}
        disabled={mutation.isPending}
        className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving…' : 'Save & Send to QS'}
      </button>
    </div>
  );
}

/* ─── Signature Box (top-level so React Fast Refresh can track it) ─── */
function SigBox({ stage, label, role, upd, pcReady, isPending, onSign }) {
  const sigImg   = upd[`pc_${stage}_sig_img`];
  const signedBy = upd[`pc_${stage}_signed_by`];
  const signedAt = upd[`pc_${stage}_signed_at`];
  return (
    <div className="border border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center gap-2 min-h-[120px]">
      <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">{label}</p>
      <p className="text-[10px] text-slate-400">{role}</p>
      {sigImg ? (
        <>
          <img src={sigImg} alt="signature" className="h-14 object-contain border border-slate-100 rounded" />
          <p className="text-[9px] text-emerald-600 font-semibold">
            {signedBy} · {signedAt ? new Date(signedAt).toLocaleDateString('en-IN') : ''}
          </p>
        </>
      ) : (
        <button
          onClick={() => onSign(stage)}
          disabled={!pcReady || isPending}
          className="mt-1 flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg disabled:opacity-40 transition"
        >
          <PenLine className="w-3.5 h-3.5" /> Sign
        </button>
      )}
    </div>
  );
}

/* ─── QS Certification Tab ─── */
function QSTab({ bill, billId }) {
  const qc       = useQueryClient();
  const navigate = useNavigate();
  const upd      = bill.bill_updates || {};

  // Default qs_gross to bill total_amount if no QS gross was previously saved
  const defaultGross = parseFloat(upd.qs_gross || bill.total_amount || 0);

  const [form, setForm] = useState({
    qs_received_date:          upd.qs_received_date?.slice(0, 10)          || '',
    qs_certified_date:         upd.qs_certified_date?.slice(0, 10)         || '',
    handed_over_accounts_date: upd.handed_over_accounts_date?.slice(0, 10) || '',
    qs_remarks:                upd.qs_remarks || '',
    qs_gross:                  defaultGross || '',
    advance_recovered:         parseFloat(upd.advance_recovered || 0) || '',
    tds_deduction:             parseFloat(upd.tds_deduction     || 0) || '',
    retention_money:           parseFloat(upd.retention_money   || 0) || '',
    other_deductions:          parseFloat(upd.other_deductions  || 0) || '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Live certified net preview
  const gross   = parseFloat(form.qs_gross)          || parseFloat(bill.total_amount) || 0;
  const advRec  = parseFloat(form.advance_recovered)  || 0;
  const tds     = parseFloat(form.tds_deduction)      || 0;
  const ret     = parseFloat(form.retention_money)    || 0;
  const other   = parseFloat(form.other_deductions)   || 0;
  const totalDed = advRec + tds + ret + other;
  const certNet  = Math.max(0, gross - totalDed);

  const mutation = useMutation({
    mutationFn: (d) => tqsBillsAPI.updateQS(billId, d),
    onSuccess: () => {
      refreshBillQueries(qc, billId);
      toast.success('QS updated — bill moved to Accounts');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  // Build link — opens the New Certification modal pre-filled with this bill's vendor + order
  const vendor  = bill.vendor_name  ? `&vendor_name=${encodeURIComponent(bill.vendor_name)}`  : '';
  const order   = bill.wo_number    ? `&wo_number=${encodeURIComponent(bill.wo_number)}`
                : bill.po_number    ? `&po_number=${encodeURIComponent(bill.po_number)}`       : '';
  const certLink = `/tqs/vendor-certifications?action=new${vendor}${order}`;

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none';

  return (
    <div className="space-y-5">
      <SectionTitle>QS Certification</SectionTitle>

      {/* Link to Vendor QS Certification module */}
      <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <Award className="w-5 h-5 text-emerald-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-emerald-900">RA Abstract &amp; Payment Certificate</p>
          <p className="text-xs text-emerald-700 mt-0.5">For full RA breakdown with line items, use the QS Certification module. Use this form for quick certification of PO bills.</p>
        </div>
        <button onClick={() => navigate(certLink)}
          className="shrink-0 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5">
          Open QS Certification <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Date fields */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <RequiredDateLabel>QS Received Date</RequiredDateLabel>
          <input type="date" required className={inputCls}
            value={form.qs_received_date} onChange={e => set('qs_received_date', e.target.value)} />
        </div>
        <div>
          <RequiredDateLabel>QS Certified Date</RequiredDateLabel>
          <input type="date" required className={inputCls}
            value={form.qs_certified_date} onChange={e => set('qs_certified_date', e.target.value)} />
        </div>
        <div>
          <RequiredDateLabel>Handed to Accounts Date</RequiredDateLabel>
          <input type="date" required className={inputCls}
            value={form.handed_over_accounts_date} onChange={e => set('handed_over_accounts_date', e.target.value)} />
        </div>
      </div>

      {/* Certified Amount & Deductions */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Certification Amounts</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Certified Amount (₹) <span className="text-slate-400 font-normal">— defaults to Total Invoice</span>
            </label>
            <input type="number" step="0.01" className={inputCls}
              value={form.qs_gross}
              onChange={e => set('qs_gross', e.target.value)}
              placeholder={`${parseFloat(bill.total_amount || 0).toFixed(2)}`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Advance Recovered (₹)</label>
            <input type="number" step="0.01" className={inputCls}
              value={form.advance_recovered} onChange={e => set('advance_recovered', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">TDS Deduction (₹)</label>
            <input type="number" step="0.01" className={inputCls}
              value={form.tds_deduction} onChange={e => set('tds_deduction', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Retention Money (₹)</label>
            <input type="number" step="0.01" className={inputCls}
              value={form.retention_money} onChange={e => set('retention_money', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Other Deductions (₹)</label>
            <input type="number" step="0.01" className={inputCls}
              value={form.other_deductions} onChange={e => set('other_deductions', e.target.value)} placeholder="0" />
          </div>
        </div>
        {/* Live preview */}
        <div className="flex items-center gap-4 pt-1 border-t border-slate-200 flex-wrap">
          <div className="text-xs text-slate-500">
            Certified Gross: <span className="font-semibold text-slate-800">₹{gross.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
          </div>
          <div className="text-xs text-slate-500">
            Total Deductions: <span className="font-semibold text-orange-600">₹{totalDed.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
          </div>
          <div className="text-xs text-slate-500 ml-auto">
            Certified Net: <span className={`text-base font-bold ${certNet > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              ₹{certNet.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
            </span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">QS Remarks</label>
        <textarea rows={2} className={inputCls + ' resize-none'}
          value={form.qs_remarks} onChange={e => set('qs_remarks', e.target.value)} />
      </div>

      <button
        onClick={() => requireDates(form, [
          { key: 'qs_received_date', label: 'QS Received Date' },
          { key: 'qs_certified_date', label: 'QS Certified Date' },
          { key: 'handed_over_accounts_date', label: 'Handed to Accounts Date' },
        ]) && mutation.mutate(form)}
        disabled={mutation.isPending}
        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving…' : 'Save & Send to Accounts'}
      </button>
    </div>
  );
}

/* ─── QS Sign Tab (MD Signature) ─── */
function QSSignTab({ bill, billId }) {
  const qc  = useQueryClient();
  const upd = bill.bill_updates || {};
  const [form, setForm] = useState({
    qs_sign_received_from_procurement_date: upd.qs_sign_received_from_procurement_date?.slice(0, 10) || '',
    qs_sign_date:                    upd.qs_sign_date?.slice(0, 10)                    || '',
    qs_sign_handed_to_accounts_date: upd.qs_sign_handed_to_accounts_date?.slice(0, 10) || '',
    qs_sign_remarks:                 upd.qs_sign_remarks                               || '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: (d) => tqsBillsAPI.updateQSSign(billId, d),
    onSuccess: () => {
      refreshBillQueries(qc, billId);
      toast.success('MD signature recorded — bill moved to Accounts for payment');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <SectionTitle>QS — MD Signature Collection</SectionTitle>

      <div className="flex items-start gap-3 p-4 bg-violet-50 border border-violet-200 rounded-xl text-sm text-violet-800">
        <PenLine className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">MD Signature Required</p>
          <p className="text-xs text-violet-700 mt-1">QS has received the bill from Procurement. Get MD Sir's signature on the Payment Certificate and record the date below before handing to Accounts for payment.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <RequiredDateLabel>Received from Procurement Date</RequiredDateLabel>
          <input type="date"
            required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
            value={form.qs_sign_received_from_procurement_date} onChange={e => set('qs_sign_received_from_procurement_date', e.target.value)} />
        </div>
        <div>
          <RequiredDateLabel>MD Signed Date</RequiredDateLabel>
          <input type="date"
            required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
            value={form.qs_sign_date} onChange={e => set('qs_sign_date', e.target.value)} />
        </div>
        <div>
          <RequiredDateLabel>Handed to Accounts Date</RequiredDateLabel>
          <input type="date"
            required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
            value={form.qs_sign_handed_to_accounts_date} onChange={e => set('qs_sign_handed_to_accounts_date', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-900 mb-1">Remarks</label>
        <textarea rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none resize-none"
          value={form.qs_sign_remarks} onChange={e => set('qs_sign_remarks', e.target.value)} />
      </div>

      <button
        onClick={() => requireDates(form, [
          { key: 'qs_sign_received_from_procurement_date', label: 'Received from Procurement Date' },
          { key: 'qs_sign_date', label: 'MD Signed Date' },
          { key: 'qs_sign_handed_to_accounts_date', label: 'Handed to Accounts Date' },
        ]) && mutation.mutate(form)}
        disabled={mutation.isPending}
        className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving…' : 'Save & Send to Accounts for Payment'}
      </button>
    </div>
  );
}

/* ─── Accounts / Procurement / Payment Tabs ─── */
const PAYMENT_MODES = [
  { value: 'RTGS',          label: 'RTGS' },
  { value: 'NEFT',          label: 'NEFT' },
  { value: 'IMPS',          label: 'IMPS' },
  { value: 'UPI',           label: 'UPI' },
  { value: 'Cheque',        label: 'Cheque' },
  { value: 'Cash',          label: 'Cash' },
  { value: 'DD',            label: 'Demand Draft' },
  { value: 'bank_transfer', label: 'Bank Transfer (Other)' },
];

function AccountsTab({ bill, billId }) {
  const qc  = useQueryClient();
  const upd = bill.bill_updates || {};
  const totalAmount = parseFloat(bill.total_amount || 0);

  const [form, setForm] = useState({
    accts_received_from_qs_date: upd.accts_received_from_qs_date?.slice(0, 10) || '',
    accts_jv_date:      upd.accts_jv_date?.slice(0, 10) || '',
    accts_remarks:      upd.accts_remarks      || '',
    advance_recovered:  upd.advance_recovered  != null ? String(upd.advance_recovered)  : '',
    tds_deduction:      upd.tds_deduction      != null ? String(upd.tds_deduction)      : '',
    retention_money:    upd.retention_money    != null ? String(upd.retention_money)    : '',
    other_deductions:   upd.other_deductions   != null ? String(upd.other_deductions)   : '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  /* Pending advance auto-suggest — query by vendor_id or vendor_name fallback */
  const vendorId   = bill.vendor_id;
  const vendorName = bill.vendor_name;
  const projectId  = bill.project_id;
  const { data: pendingAdv } = useQuery({
    queryKey: ['tqs-pending-advances', vendorId, vendorName, projectId],
    queryFn: () => tqsBillsAPI.pendingAdvances({
      ...(vendorId   ? { vendor_id:   vendorId   } : {}),
      ...(vendorName ? { vendor_name: vendorName } : {}),
      ...(projectId  ? { project_id:  projectId  } : {}),
    }).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!(vendorId || vendorName),
    staleTime: 30000,
  });
  // pendingAdv shape: { total_advanced, total_recovered, pending_balance, advances: [...] }
  const totalPending = parseFloat(pendingAdv?.pending_balance ?? 0);

  /* Live certified net preview */
  const advRec  = parseFloat(form.advance_recovered)  || 0;
  const tdsDed  = parseFloat(form.tds_deduction)      || 0;
  const retMon  = parseFloat(form.retention_money)    || 0;
  const othDed  = parseFloat(form.other_deductions)   || 0;
  const certNet = totalAmount - advRec - tdsDed - retMon - othDed;

  const mutation = useMutation({
    mutationFn: (d) => tqsBillsAPI.updateAccounts(billId, d),
    onSuccess: () => {
      refreshBillQueries(qc, billId);
      qc.invalidateQueries({ queryKey: ['tqs-pending-advances', vendorId, projectId] });
      toast.success('Accounts updated');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <SectionTitle>Accounts / JV</SectionTitle>

      {/* Dates */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <RequiredDateLabel>Received from QS Date</RequiredDateLabel>
          <input type="date"
            required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.accts_received_from_qs_date} onChange={e => set('accts_received_from_qs_date', e.target.value)} />
        </div>
        <div>
          <RequiredDateLabel>JV Date (Accounts)</RequiredDateLabel>
          <input type="date"
            required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.accts_jv_date} onChange={e => set('accts_jv_date', e.target.value)} />
        </div>
      </div>

      {/* Deductions */}
      <div>
        <SectionTitle>Deductions</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          {/* Advance Recovery */}
          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">Advance Recovered (₹)</label>
            <input type="number" min="0" step="0.01" placeholder="0"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={form.advance_recovered} onChange={e => set('advance_recovered', e.target.value)} />
            {totalPending > 0 && (
              <button
                type="button"
                className="mt-1 text-xs text-blue-600 hover:underline"
                onClick={() => set('advance_recovered', String(Math.min(totalPending, totalAmount).toFixed(2)))}
              >
                Pending advance ₹{Number(totalPending || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — apply
              </button>
            )}
          </div>

          {/* TDS Deduction */}
          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">TDS Deduction (₹)</label>
            <input type="number" min="0" step="0.01" placeholder="0"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={form.tds_deduction} onChange={e => set('tds_deduction', e.target.value)} />
          </div>

          {/* Retention Money */}
          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">Retention Money (₹)</label>
            <input type="number" min="0" step="0.01" placeholder="0"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={form.retention_money} onChange={e => set('retention_money', e.target.value)} />
          </div>

          {/* Other Deductions */}
          <div>
            <label className="block text-xs font-medium text-slate-900 mb-1">Other Deductions (₹)</label>
            <input type="number" min="0" step="0.01" placeholder="0"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={form.other_deductions} onChange={e => set('other_deductions', e.target.value)} />
          </div>
        </div>

        {/* Certified Net Preview */}
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="text-slate-500">Invoice Total: <strong className="text-slate-700">₹{inr(totalAmount)}</strong></span>
          <span className="text-slate-400">−</span>
          <span className="text-slate-500">Deductions: <strong className="text-red-600">₹{inr(advRec + tdsDed + retMon + othDed)}</strong></span>
          <span className="text-slate-400">=</span>
          <span className="text-slate-900 font-semibold">Certified Net: <strong className="text-emerald-700">₹{inr(certNet)}</strong></span>
        </div>
      </div>

      {/* Remarks */}
      <div>
        <label className="block text-xs font-medium text-slate-900 mb-1">Accounts Remarks</label>
        <textarea rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          value={form.accts_remarks} onChange={e => set('accts_remarks', e.target.value)} />
      </div>

      <button
        onClick={() => requireDates(form, [
          { key: 'accts_received_from_qs_date', label: 'Received from QS Date' },
          { key: 'accts_jv_date', label: 'JV Date (Accounts)' },
        ]) && mutation.mutate(form)}
        disabled={mutation.isPending}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving…' : 'Save & Send to Procurement'}
      </button>
    </div>
  );
}

function ProcurementTab({ bill, billId }) {
  const qc  = useQueryClient();
  const upd = bill.bill_updates || {};
  const [form, setForm] = useState({
    proc_received_from_accounts_date: upd.proc_received_from_accounts_date?.slice(0, 10) || '',
    proc_handed_over_to_accounts_date: upd.proc_handed_over_to_accounts_date?.slice(0, 10) || '',
    procurement_remarks: upd.procurement_remarks || '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: (d) => tqsBillsAPI.updateProcurement(billId, d),
    onSuccess: () => {
      refreshBillQueries(qc, billId);
      toast.success('Procurement updated');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <SectionTitle>Procurement Handoff</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <RequiredDateLabel>Received from Accounts Date</RequiredDateLabel>
          <input type="date"
            required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.proc_received_from_accounts_date} onChange={e => set('proc_received_from_accounts_date', e.target.value)} />
        </div>
        <div>
          <RequiredDateLabel>Handed to QS (for MD Signature) Date</RequiredDateLabel>
          <input type="date"
            required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.proc_handed_over_to_accounts_date} onChange={e => set('proc_handed_over_to_accounts_date', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-900 mb-1">Procurement Remarks</label>
        <textarea rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          value={form.procurement_remarks} onChange={e => set('procurement_remarks', e.target.value)} />
      </div>
      <button
        onClick={() => requireDates(form, [
          { key: 'proc_received_from_accounts_date', label: 'Received from Accounts Date' },
          { key: 'proc_handed_over_to_accounts_date', label: 'Handed to QS Date' },
        ]) && mutation.mutate(form)}
        disabled={mutation.isPending}
        className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving…' : 'Save & Send to QS for MD Signature'}
      </button>
    </div>
  );
}

function PaymentTab({ bill, billId }) {
  const qc  = useQueryClient();
  const upd = bill.bill_updates || {};
  const certified = parseFloat(upd.certified_net || bill.total_amount) || 0;
  const [form, setForm] = useState({
    paid_amount:      upd.paid_amount      || (certified > 0 ? certified : ''),
    payment_date:     upd.payment_date?.slice(0, 10)     || '',
    payment_mode:     upd.payment_mode     || '',
    reference_number: upd.reference_number || '',
    bank_name:        upd.bank_name        || '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const paid      = parseFloat(form.paid_amount) || 0;
  const balance   = parseFloat(bill.liability_balance ?? upd.balance_to_pay ?? (certified - paid)) || 0;
  const tds       = parseFloat(upd.tds_deduction || 0);

  const mutation = useMutation({
    mutationFn: (d) => tqsBillsAPI.updatePayment(billId, d),
    onSuccess: (res) => {
      refreshBillQueries(qc, billId);
      if (res?.data?.data?.finance_payment_id) {
        toast.success('Payment recorded & Finance entry created!');
      } else {
        toast.success('Payment recorded');
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const markPaidMutation = useMutation({
    mutationFn: () => tqsBillsAPI.markPaid(billId),
    onSuccess: () => {
      refreshBillQueries(qc, billId);
      toast.success('Bill marked as Fully Paid');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const financeLinked = !!upd.finance_payment_id;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Certified Net',  value: inr(certified),    color: 'text-slate-800' },
          { label: 'TDS Deducted',   value: inr(tds),          color: 'text-orange-600' },
          { label: 'Net Payable',    value: inr(certified - tds), color: 'text-blue-700' },
          { label: 'Balance to Pay', value: inr(balance),      color: balance > 0 ? 'text-red-500' : 'text-emerald-600' },
        ].map(c => (
          <div key={c.label} className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-900 font-medium font-medium">{c.label}</p>
            <p className={`text-xl font-medium mt-0.5 ${c.color}`}>₹{c.value}</p>
          </div>
        ))}
      </div>

      {financeLinked && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-emerald-700">Finance Payment Record Created</p>
            <p className="text-[11px] text-emerald-600 mt-0.5">This payment is recorded in the Finance module and appears in TDS reports and cash flow.</p>
          </div>
          <a
            href="/finance/payments"
            className="text-xs font-medium text-emerald-700 hover:underline flex items-center gap-1"
          >
            View <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <SectionTitle>Payment</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-900 mb-1">Amount Paid (₹)</label>
          <input type="number" step="0.01"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)} />
        </div>
        <div>
          <RequiredDateLabel>Payment Date</RequiredDateLabel>
          <input type="date"
            required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.payment_date} onChange={e => set('payment_date', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-900 mb-1">Payment Mode</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)}
          >
            <option value="">— Select —</option>
            {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-900 mb-1">Reference / Cheque No.</label>
          <input type="text"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="UTR / Cheque number"
            value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-900 mb-1">Bank Name</label>
          <input type="text"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="e.g. HDFC, SBI"
            value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
        </div>
      </div>

      {!financeLinked && paid > 0 && form.payment_date && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
          <IndianRupee className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Saving will automatically create a <strong>Finance payment record</strong> for ₹{inr(paid - tds)} — it will appear in TDS reports and cash flow under the <em>{bill.bill_type === 'wo' ? 'Subcontractor' : 'Vendor'}</em> category.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => requireDates(form, [
            { key: 'payment_date', label: 'Payment Date' },
          ]) && mutation.mutate(form)}
          disabled={mutation.isPending}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : financeLinked ? 'Update Payment' : 'Save Payment'}
        </button>

        {(upd.payment_status === 'partial' || (parseFloat(upd.paid_amount) > 0 && bill.workflow_status === 'accounts')) && (
          <button
            onClick={() => {
              if (window.confirm('Mark this bill as Fully Paid? This will advance the workflow stage to Paid.')) {
                markPaidMutation.mutate();
              }
            }}
            disabled={markPaidMutation.isPending}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {markPaidMutation.isPending ? 'Processing…' : '✓ Mark as Fully Paid'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Files Panel ─── */
function FilesPanel({ bill, billId }) {
  const qc = useQueryClient();
  const fileRef = useRef();
  const files = bill.files || [];
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkForm, setLinkForm] = useState({ file_name: '', onedrive_web_url: '' });

  const uploadMutation = useMutation({
    mutationFn: (fd) => tqsBillsAPI.uploadFile(billId, fd),
    onSuccess: (res) => {
      const synced = res.data?.onedrive_synced;
      toast.success(synced ? 'Uploaded & synced to OneDrive ☁' : 'Uploaded locally');
      qc.invalidateQueries({ queryKey: ['tqs-bill', billId] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Upload failed'),
  });

  const linkMutation = useMutation({
    mutationFn: (data) => tqsBillsAPI.linkOneDrive(billId, data),
    onSuccess: () => {
      toast.success('OneDrive document linked');
      qc.invalidateQueries({ queryKey: ['tqs-bill', billId] });
      setShowLinkForm(false);
      setLinkForm({ file_name: '', onedrive_web_url: '' });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to link document'),
  });

  const deleteMutation = useMutation({
    mutationFn: (fid) => tqsBillsAPI.deleteFile(billId, fid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tqs-bill', billId] }); toast.success('File deleted'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const syncMutation = useMutation({
    mutationFn: (fid) => tqsBillsAPI.syncFileToOneDrive(billId, fid),
    onSuccess: (res) => {
      const synced = res.data?.onedrive_synced;
      toast.success(synced ? 'Attachment synced to OneDrive' : 'Attachment sync skipped');
      qc.invalidateQueries({ queryKey: ['tqs-bill', billId] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'OneDrive sync failed'),
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    uploadMutation.mutate(fd);
    e.target.value = '';
  };

  const handleLink = () => {
    if (!linkForm.file_name.trim() || !linkForm.onedrive_web_url.trim()) {
      toast.error('Document name and OneDrive URL are required');
      return;
    }
    linkMutation.mutate(linkForm);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => { setShowLinkForm(v => !v); }}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Cloud className="w-3.5 h-3.5" />
          Link OneDrive
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {showLinkForm && (
        <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
          <p className="text-xs font-medium text-blue-700">Link OneDrive Document</p>
          <input
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Document name (e.g. Invoice_WOTQS011.pdf)"
            value={linkForm.file_name}
            onChange={e => setLinkForm(f => ({ ...f, file_name: e.target.value }))}
          />
          <input
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="OneDrive share URL (https://...)"
            value={linkForm.onedrive_web_url}
            onChange={e => setLinkForm(f => ({ ...f, onedrive_web_url: e.target.value }))}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowLinkForm(false)} className="text-xs text-slate-900 font-medium hover:text-slate-900 px-3 py-1.5">Cancel</button>
            <button
              onClick={handleLink}
              disabled={linkMutation.isPending}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {linkMutation.isPending ? 'Linking…' : 'Link Document'}
            </button>
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <p className="text-xs text-slate-900 font-medium text-center py-4">No files attached</p>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="flex flex-col bg-slate-50 rounded-lg p-2 gap-1.5 border border-slate-100 hover:border-blue-200 transition-all">
              <div className="flex items-center gap-2">
                {f.file_type === 'link' ? <Cloud className="w-4 h-4 text-blue-500 flex-shrink-0" /> : <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                <span className="text-xs text-slate-900 flex-1 truncate font-medium" title={f.file_name}>{f.file_name}</span>
                <span className="text-[10px] text-slate-400">{f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : f.file_type === 'link' ? 'OneDrive' : ''}</span>
              </div>

              <div className="flex items-center justify-between mt-0.5 pt-1 border-t border-slate-200/60">
                <div className="flex items-center gap-2">
                  {f.onedrive_id || f.onedrive_web_url ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                      <Cloud className="w-3 h-3" /> OneDrive
                    </span>
                  ) : (
                    <button
                      onClick={() => syncMutation.mutate(f.id)}
                      disabled={syncMutation.isPending}
                      className="flex items-center gap-1 text-[10px] text-slate-900 font-medium transition hover:text-blue-600 disabled:opacity-50"
                    >
                      {syncMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CloudOff className="w-3 h-3" />}
                      {syncMutation.isPending ? 'Syncing…' : 'Local only'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {f.file_type !== 'link' && (
                    <button
                      title="Preview / Download"
                      onClick={async () => {
                        try {
                          // Ask backend for the best available URL (local → OneDrive fresh link → webUrl)
                          const res = await tqsBillsAPI.getFilePreviewUrl(billId, f.id);
                          const { url, type } = res.data;
                          if (type === 'local') {
                            // Local file: fetch with auth header, open as blob
                            const blob = await api.get(url, { responseType: 'blob' });
                            const blobUrl = URL.createObjectURL(blob.data);
                            window.open(blobUrl, '_blank');
                            setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
                          } else {
                            // OneDrive pre-signed URL or webUrl: open directly (no auth needed)
                            window.open(url, '_blank');
                          }
                        } catch {
                          toast.error('Could not open file — it may have been removed from storage');
                        }
                      }}
                      className="text-slate-900 font-medium hover:text-blue-600 p-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => deleteMutation.mutate(f.id)} className="text-slate-900 font-medium hover:text-red-500 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── History Panel ─── */
function HistoryPanel({ history = [] }) {
  return (
    <div>
      {history.length === 0 ? (
        <p className="text-xs text-slate-900 font-medium text-center py-3">No history yet</p>
      ) : (
        <div className="space-y-2">
          {history.map((h, i) => (
            <div key={h.id || i} className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
              <div>
                <span className="text-xs font-medium text-slate-700">{h.dept}</span>
                <span className="mx-1.5 text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-600">{h.action}</span>
                <p className="text-[10px] text-slate-900 font-medium mt-0.5">{new Date(h.ts).toLocaleString('en-IN')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Workflow Steps Strip ─── */
const WORKFLOW_STEPS = [
  { id: 'pending',             label: 'Received'    },
  { id: 'stores',              label: 'Stores'      },
  { id: 'document_controller', label: 'Doc Ctrl'    },
  { id: 'qs',                  label: 'QS Cert'     },
  { id: 'accounts',            label: 'Accounts'    },
  { id: 'procurement',         label: 'Procurement' },
  { id: 'qs_sign',             label: 'QS Sign'     },
  { id: 'paid',                label: 'Paid'        },
];
const STEP_ORDER = WORKFLOW_STEPS.map(s => s.id);

function WorkflowStrip({ status }) {
  const currentIdx = STEP_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-0">
      {WORKFLOW_STEPS.map((step, i) => {
        const done    = i < currentIdx;
        const active  = i === currentIdx;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium transition-all relative"
                style={
                  done ? {
                    background: 'linear-gradient(160deg, #34d399 0%, #059669 100%)',
                    color: '#ffffff',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(5,150,105,0.4), 0 4px 12px rgba(5,150,105,0.25)',
                  } : active ? {
                    background: 'linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 4px rgba(59,130,246,0.18), 0 2px 8px rgba(29,78,216,0.4), 0 6px 16px rgba(29,78,216,0.30)',
                  } : {
                    background: '#ffffff',
                    color: '#94a3b8',
                    border: '2px solid #c8d5e8',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(15,23,42,0.05)',
                  }
                }>
                {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span className="text-[10px] font-medium text-center leading-tight uppercase tracking-wide"
                style={{ color: done ? '#059669' : active ? '#1d4ed8' : '#94a3b8' }}>
                {step.label}
              </span>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <div className="flex-1 mb-5 rounded-full"
                style={{
                  height: 3,
                  background: i < currentIdx
                    ? 'linear-gradient(90deg, #34d399 0%, #059669 100%)'
                    : '#e2e8f0',
                  boxShadow: i < currentIdx ? 'inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
                }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── Main Page ─── */
export default function TQSBillDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const visibleTabs = useMemo(
    () => getVisibleTabsForDepartment(user?.department, user?.role),
    [user?.department, user?.role]
  );

  useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === activeTab)) {
      setActiveTab('overview');
    }
  }, [activeTab, visibleTabs]);

  const { data: bill, isLoading, error } = useQuery({
    queryKey: ['tqs-bill', id],
    queryFn: () => tqsBillsAPI.get(id).then(r => r.data?.data ?? r.data),
    enabled: !!id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []),
  });

  const qc = useQueryClient();
  const [metaProject, setMetaProject]   = useState(null);
  const [metaWorkDesc, setMetaWorkDesc] = useState(null);
  const metaMutation = useMutation({
    mutationFn: (d) => tqsBillsAPI.updateMeta(id, d),
    onSuccess: () => { refreshBillQueries(qc, id); toast.success('Bill info updated'); },
  });

  const repairMutation = useMutation({
    mutationFn: () => tqsBillsAPI.repairCertifiedNet(),
    onSuccess: (res) => {
      refreshBillQueries(qc, id);
      toast.success(res.data?.message || 'Certified net repaired');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Repair failed'),
  });

  if (isLoading) return (
    <div className="p-8 space-y-4 bg-[#eef2f9] min-h-screen">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`h-${i === 0 ? 20 : 12} bg-white rounded-xl animate-pulse border border-slate-100`} />
      ))}
    </div>
  );

  if (error || !bill) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#eef2f9]">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center max-w-sm">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-slate-900 font-medium mb-1">Bill Not Found</p>
        <p className="text-sm text-slate-900 font-medium mb-5">This bill may have been deleted or you may not have access.</p>
        <button onClick={() => navigate('/tqs/bills')} className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          Back to Bills
        </button>
      </div>
    </div>
  );

  const statusCls   = STATUS_COLORS[bill.workflow_status] || STATUS_COLORS.pending;
  const statusLabel = (bill.workflow_status || 'pending').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const upd         = bill.bill_updates || {};

  return (
    <div className="bg-[#eef2f9] min-h-screen">

      {/* ── Sticky Page Header (navy band) ─────────────────────────────────── */}
      <div className="sticky top-0 z-20 shadow-md" style={{ background: 'linear-gradient(180deg, #1a3a6b 0%, #122d58 100%)' }}>
        {/* Breadcrumb strip */}
        <div className="px-6 py-2 flex items-center gap-2 text-[11px]" style={{ background: 'rgba(0,0,0,0.18)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => navigate('/tqs/bills')} className="hover:text-white transition-colors" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Bill Tracker
          </button>
          <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
          <span className="font-semibold" style={{ color: '#fde047' }}>Bills</span>
          <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
          <span style={{ color: 'rgba(255,255,255,0.75)' }}>{bill.sl_number}</span>
        </div>

        <div className="px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/tqs/bills')}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#ffffff' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-lg font-medium tracking-tight text-white">{bill.sl_number}</span>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border ${statusCls}`}>
                {statusLabel}
              </span>
              {upd.pc_number && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium border"
                  style={{ background: 'rgba(253,224,71,0.15)', color: '#fde047', borderColor: 'rgba(253,224,71,0.40)' }}>
                  PC: {upd.pc_number}
                </span>
              )}
            </div>
            <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>
              <span className="font-medium text-white">{bill.vendor_name}</span>
              <span className="mx-2" style={{ color: 'rgba(255,255,255,0.30)' }}>·</span>
              <span>{bill.inv_number}</span>
            </p>
          </div>

          {/* Amount pills — glass-style on dark band */}
          <div className="hidden md:flex items-center gap-2">
            {[
              { label: 'Basic',         value: `₹${inr(bill.basic_amount)}`,  color: 'rgba(255,255,255,0.95)' },
              { label: 'Total Invoice', value: `₹${inr(bill.total_amount)}`,  color: '#bfdbfe' },
              ...(upd.certified_net ? [{ label: 'Certified Net', value: `₹${inr(upd.certified_net)}`, color: '#86efac' }] : []),
            ].map((p) => (
              <div key={p.label} className="px-3.5 py-2 rounded-lg"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
                }}>
                <p className="text-[9px] font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)' }}>{p.label}</p>
                <p className="text-sm font-medium mt-0.5" style={{ color: p.color }}>{p.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5 max-w-[1400px] mx-auto">

        {/* ── Workflow Progress Strip ─────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#c8d5e8] shadow-sm px-6 py-4">
          <WorkflowStrip status={bill.workflow_status || 'pending'} />
        </div>

        {/* ── Cross-module links ──────────────────────────────── */}
        {(bill.po_id || bill.grn_id) && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-medium text-blue-500 uppercase tracking-widest">Linked to Procurement</span>
            {bill.po_id && (
              <a href="/procurement/po" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 transition-all">
                <FileText className="w-3.5 h-3.5" />
                PO: {bill.linked_po_number || bill.po_number}
                {bill.linked_po_total && <span className="text-blue-400 font-normal ml-1">₹{Number(bill.linked_po_total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
              </a>
            )}
            {bill.grn_id && (
              <a href="/procurement/grn" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-all">
                <FileText className="w-3.5 h-3.5" />
                GRN: {bill.linked_grn_number}
                {bill.linked_grn_date && <span className="text-emerald-400 font-normal ml-1">{fmt(bill.linked_grn_date)}</span>}
              </a>
            )}
          </div>
        )}

        <div className="flex gap-5 items-start">
          {/* ── Main content ─────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Bill Info Card */}
            <div className="bg-white rounded-xl border border-[#c8d5e8] shadow-sm overflow-hidden">
              {/* Card header bar — navy theme */}
              <div className="px-5 py-3 flex items-center justify-between"
                style={{ background: 'linear-gradient(90deg, #1a3a6b 0%, #122d58 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full" style={{ background: '#fde047' }} />
                  <span className="text-xs font-medium text-white uppercase tracking-wider">Bill Information</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide"
                  style={{ background: 'rgba(255,255,255,0.10)', color: '#bfdbfe', border: '1px solid rgba(255,255,255,0.18)' }}>
                  {bill.bill_type === 'wo' ? 'Work Order' : 'Purchase Order'}
                </span>
              </div>

              <div className="p-5">
                {/* Row 1 — key identifiers */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5 pb-5 border-b border-slate-200">
                  {[
                    { label: 'PO / WO #',      value: bill.po_number,  mono: true },
                    { label: 'Invoice #',       value: bill.inv_number, mono: true },
                    { label: 'Invoice Date',    value: fmt(bill.inv_date) },
                    { label: 'Received Date',   value: fmt(bill.received_date) },
                  ].map(f => (
                    <div key={f.label}>
                      <p className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-[0.10em] mb-1.5">{f.label}</p>
                      <p className={`text-[15px] font-medium text-slate-900 tracking-tight ${f.mono ? 'font-mono' : ''}`}>{f.value || '—'}</p>
                    </div>
                  ))}
                </div>

                {/* Row 2 — editable fields */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5 pt-5 pb-5 border-b border-slate-200">
                  {/* Project */}
                  <div>
                    <p className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-[0.10em] mb-1.5">Project</p>
                    <select
                      className="w-full border-2 border-slate-200 rounded-lg px-2.5 py-2 text-[14px] font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none bg-white text-slate-900"
                      value={metaProject ?? bill.project_id ?? ''}
                      onChange={e => {
                        setMetaProject(e.target.value);
                        metaMutation.mutate({ project_id: e.target.value || null, work_desc: metaWorkDesc ?? bill.work_desc ?? '' });
                      }}
                    >
                      <option value="">— Select Project —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {/* Package Description */}
                  <div className="col-span-2">
                    <p className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-[0.10em] mb-1.5">Package Description</p>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 border-2 border-slate-200 rounded-lg px-3 py-2 text-[14px] font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-900"
                        placeholder="e.g. PPC Cement for DQS, Yelahanka"
                        value={metaWorkDesc ?? bill.work_desc ?? ''}
                        onChange={e => setMetaWorkDesc(e.target.value)}
                      />
                      <button
                        onClick={() => metaMutation.mutate({ project_id: metaProject ?? bill.project_id ?? null, work_desc: metaWorkDesc ?? bill.work_desc ?? '' })}
                        disabled={metaMutation.isPending}
                        className="px-4 py-2 bg-blue-600 text-white text-xs font-medium uppercase tracking-wider rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  {/* Invoice Month */}
                  <div>
                    <p className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-[0.10em] mb-1.5">Invoice Month</p>
                    <p className="text-[15px] font-medium text-slate-900 tracking-tight">{bill.inv_month || '—'}</p>
                  </div>

                  {/* Admin: manual status override */}
                  {['super_admin','admin','management','project_manager'].includes(user?.role) && (
                    <div>
                      <p className="text-[11px] font-medium text-amber-700 uppercase tracking-[0.10em] mb-1.5">⚙ Override Status</p>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 border-2 border-amber-300 rounded-lg px-2.5 py-2 text-[13px] font-medium focus:ring-2 focus:ring-amber-400 outline-none bg-amber-50 text-slate-900"
                          defaultValue={bill.workflow_status}
                          onChange={e => {
                            if (e.target.value && e.target.value !== bill.workflow_status) {
                              metaMutation.mutate({
                                project_id:      metaProject      ?? bill.project_id  ?? null,
                                work_desc:       metaWorkDesc     ?? bill.work_desc   ?? '',
                                workflow_status: e.target.value,
                              });
                            }
                          }}
                        >
                          {['pending','stores','document_controller','qs','accounts','procurement','qs_sign','paid'].map(s => (
                            <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Row 3 — amount summary boxes (solid colored 3D chips) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
                  {[
                    { label: 'Basic Amount',  value: `₹${inr(bill.basic_amount)}`,  from: '#64748b', to: '#334155', shadow: '#1e293b' },
                    { label: 'GST Amount',    value: `₹${inr(bill.gst_amount)}`,    from: '#fbbf24', to: '#d97706', shadow: '#b45309' },
                    { label: 'Total Invoice', value: `₹${inr(bill.total_amount)}`,  from: '#3b82f6', to: '#1d4ed8', shadow: '#1e40af' },
                    { label: 'Certified Net', value: upd.certified_net ? `₹${inr(upd.certified_net)}` : '—', from: '#34d399', to: '#059669', shadow: '#047857' },
                  ].map(c => {
                    const glow = (a) => {
                      const r = parseInt(c.shadow.slice(1, 3), 16);
                      const g = parseInt(c.shadow.slice(3, 5), 16);
                      const b = parseInt(c.shadow.slice(5, 7), 16);
                      return `rgba(${r},${g},${b},${a})`;
                    };
                    return (
                      <div key={c.label} className="rounded-xl px-4 py-3.5 relative overflow-hidden"
                        style={{
                          background: `linear-gradient(160deg, ${c.from} 0%, ${c.to} 100%)`,
                          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 0 ${glow(0.4)}, 0 1px 2px rgba(15,23,42,0.10), 0 6px 14px ${glow(0.25)}`,
                        }}>
                        <div aria-hidden style={{ position: 'absolute', top: -30, right: -30, width: 90, height: 90, background: 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
                        <p className="text-[10px] font-medium uppercase tracking-[0.14em] relative" style={{ color: 'rgba(255,255,255,0.92)', textShadow: '0 1px 0 rgba(0,0,0,0.20)' }}>{c.label}</p>
                        <p className="text-2xl font-medium mt-1.5 relative tracking-tight" style={{ color: '#fde047', textShadow: '0 1px 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.15)' }}>{c.value}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Certified Net repair banner ── */}
            {['accounts','procurement','qs_sign','paid'].includes(bill.workflow_status) &&
             !(upd.certified_net > 0) && bill.total_amount > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">Certified Net is ₹0.00</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    This bill was certified without a gross amount — click Repair to set certified net = total invoice amount for all affected bills.
                  </p>
                </div>
                <button
                  onClick={() => repairMutation.mutate()}
                  disabled={repairMutation.isPending}
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${repairMutation.isPending ? 'animate-spin' : ''}`} />
                  {repairMutation.isPending ? 'Repairing…' : 'Repair Certified Net'}
                </button>
              </div>
            )}

            {/* Tabs Card */}
            <div className="bg-white rounded-xl border border-[#c8d5e8] shadow-sm overflow-hidden">
              {/* Tab nav */}
              <div className="flex border-b border-[#c8d5e8] overflow-x-auto bg-[#f4f7fc]">
                {visibleTabs.map(tab => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-5 py-3.5 text-xs font-medium transition-all border-b-2 whitespace-nowrap shrink-0 ${
                        active
                          ? 'border-blue-600 text-blue-600 bg-white'
                          : 'border-transparent text-slate-900 font-medium hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <tab.icon className={`w-3.5 h-3.5 ${active ? 'text-blue-500' : 'text-slate-400'}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="p-6">
                {activeTab === 'overview'    && <OverviewTab bill={bill} />}
                {activeTab === 'stores'      && <StoresTab bill={bill} billId={id} />}
                {activeTab === 'doc_control' && <DocumentControlTab bill={bill} billId={id} />}
                {activeTab === 'qs'          && <QSTab bill={bill} billId={id} />}
                {activeTab === 'accounts'    && <AccountsTab bill={bill} billId={id} />}
                {activeTab === 'procurement' && <ProcurementTab bill={bill} billId={id} />}
                {activeTab === 'qs_sign'     && <QSSignTab bill={bill} billId={id} />}
                {activeTab === 'payment'     && <PaymentTab bill={bill} billId={id} />}
              </div>
            </div>
          </div>

          {/* ── Right Sidebar ─────────────────────────────────── */}
          <div className="w-72 flex-shrink-0 space-y-4">

            {/* Attachments */}
            <div className="bg-white rounded-xl border border-[#c8d5e8] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[#c8d5e8] bg-[#f4f7fc] flex items-center justify-between">
                <span className="text-xs font-medium text-slate-900 uppercase tracking-wide">Attachments</span>
                <span className="text-[10px] text-slate-400">{(bill.files || []).length} file{(bill.files || []).length !== 1 ? 's' : ''}</span>
              </div>
              <div className="p-4">
                <FilesPanel bill={bill} billId={id} />
              </div>
            </div>

            {/* Audit History */}
            <div className="bg-white rounded-xl border border-[#c8d5e8] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[#c8d5e8] bg-[#f4f7fc]">
                <span className="text-xs font-medium text-slate-900 uppercase tracking-wide">Audit History</span>
              </div>
              <div className="p-4">
                <HistoryPanel history={bill.history || []} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
