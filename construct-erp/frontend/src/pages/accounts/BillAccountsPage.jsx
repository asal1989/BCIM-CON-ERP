// src/pages/accounts/BillAccountsPage.jsx
// Accounts automation derived from the bill tracker: GST ITC, TDS/26Q, retention,
// vendor ledger, AP aging.
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';
import {
  Receipt, Percent, Lock, Users, Clock, Download, RefreshCw,
  CheckCircle, X, Landmark,
} from 'lucide-react';
import { billAccountsAPI, projectAPI } from '../../api/client';
import { downloadCsv } from '../../utils/exportCsv';

const fmt = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtD = d => d ? dayjs(d).format('DD MMM YYYY') : '—';
const num = v => parseFloat(v || 0) || 0;
const inputCls = 'border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';

const TABS = [
  { id: 'itc',       label: 'GST ITC',       icon: Receipt },
  { id: 'tds',       label: 'TDS / 26Q',      icon: Percent },
  { id: 'retention', label: 'Retention',      icon: Lock },
  { id: 'vendor',    label: 'Vendor Ledger',  icon: Users },
  { id: 'aging',     label: 'AP Aging',       icon: Clock },
];

function Th({ children, right }) {
  return <th className={clsx('px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400', right ? 'text-right' : 'text-left')}>{children}</th>;
}
function Empty({ cols, label }) {
  return <tr><td colSpan={cols} className="py-10 text-center text-slate-400 text-sm">{label}</td></tr>;
}
function Spinner() {
  return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>;
}

function DateRange({ value, onChange }) {
  return (
    <>
      <input type="date" className={inputCls} value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} />
      <span className="text-slate-400 text-sm">to</span>
      <input type="date" className={inputCls} value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} />
    </>
  );
}

// ── GST ITC tab ─────────────────────────────────────────────────────────────────
function ItcTab({ projectId }) {
  const [range, setRange] = useState({ from: dayjs().startOf('year').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') });
  const params = useMemo(() => ({ from: range.from, to: range.to, project_id: projectId || undefined }), [range, projectId]);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['itc-register', params], queryFn: () => billAccountsAPI.itcRegister(params).then(r => r.data) });
  const summary = data?.summary ?? [];
  const rows = data?.data ?? [];
  const totals = summary.reduce((a, s) => ({ cgst: a.cgst + num(s.cgst), sgst: a.sgst + num(s.sgst), igst: a.igst + num(s.igst), itc: a.itc + num(s.total_itc) }), { cgst: 0, sgst: 0, igst: 0, itc: 0 });

  const exportCsv = () => {
    const lines = [['Period', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total ITC', 'Bills']];
    summary.forEach(s => lines.push([s.period, num(s.taxable), num(s.cgst), num(s.sgst), num(s.igst), num(s.total_itc), s.count]));
    downloadCsv(`itc-register-${dayjs().format('YYYY-MM-DD')}.csv`, lines);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <DateRange value={range} onChange={setRange} />
        <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        <button onClick={exportCsv} disabled={!summary.length} className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Download className="w-3.5 h-3.5" /> CSV</button>
        <span className="ml-auto text-sm text-slate-500">Total ITC: <strong className="text-emerald-700">{fmt(totals.itc)}</strong></span>
      </div>

      {isLoading ? <Spinner /> : (
        <>
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">Monthly summary (feeds GSTR-3B input credit)</div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                <Th>Period</Th><Th right>Taxable</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>IGST</Th><Th right>Total ITC</Th><Th right>Bills</Th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {summary.map(s => (
                  <tr key={s.period} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{s.period}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(s.taxable)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(s.cgst)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(s.sgst)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(s.igst)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">{fmt(s.total_itc)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{s.count}</td>
                  </tr>
                ))}
                {!summary.length && <Empty cols={7} label="No GST input credit in this period" />}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">Bill-wise detail ({rows.length})</div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-100">
                    <Th>Bill</Th><Th>Vendor</Th><Th>GSTIN</Th><Th>Inv Date</Th><Th right>Taxable</Th><Th right>GST</Th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.sl_number}</td>
                        <td className="px-3 py-2">{r.vendor_name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.vendor_gstin || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtD(r.inv_date)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(r.basic_amount)}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium">{fmt(r.gst_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── TDS / 26Q tab ─────────────────────────────────────────────────────────────
function TdsTab({ projectId }) {
  const qc = useQueryClient();
  const [range, setRange] = useState({ from: dayjs().startOf('year').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') });
  const [modal, setModal] = useState(null); // { period, section }
  const [challan, setChallan] = useState({ challan_no: '', deposit_date: dayjs().format('YYYY-MM-DD'), bsr_code: '' });

  const params = useMemo(() => ({ from: range.from, to: range.to, project_id: projectId || undefined }), [range, projectId]);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['tds-register', params], queryFn: () => billAccountsAPI.tdsRegister(params).then(r => r.data) });
  const summary = data?.summary ?? [];
  const rows = data?.data ?? [];

  const depositMut = useMutation({
    mutationFn: (d) => billAccountsAPI.tdsDeposit(d),
    onSuccess: (r) => { toast.success(r.data?.message || 'TDS deposit recorded'); qc.invalidateQueries({ queryKey: ['tds-register'] }); qc.invalidateQueries({ queryKey: ['je-auto-log'] }); setModal(null); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const export26Q = () => {
    const lines = [['Bill', 'Vendor', 'PAN', 'Section', 'Period', 'Bill Amount', 'TDS']];
    rows.forEach(r => lines.push([r.sl_number, r.vendor_name, r.vendor_pan || '', r.section, r.period, num(r.total_amount), num(r.tds_deduction)]));
    downloadCsv(`form-26Q-${dayjs().format('YYYY-MM')}.csv`, lines);
  };

  const totalPending = summary.filter(s => !s.deposited).reduce((a, s) => a + num(s.tds_total), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <DateRange value={range} onChange={setRange} />
        <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        <button onClick={export26Q} disabled={!rows.length} className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Form 26Q</button>
        <span className="ml-auto text-sm text-slate-500">Pending deposit: <strong className="text-amber-700">{fmt(totalPending)}</strong></span>
      </div>

      {isLoading ? <Spinner /> : (
        <>
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">TDS deducted on bills, by month — deposit posts Dr TDS Payable, Cr Bank</div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                <Th>Period</Th><Th>Section</Th><Th right>Bills</Th><Th right>TDS Amount</Th><Th>Status</Th><Th right>Action</Th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {summary.map(s => (
                  <tr key={`${s.period}-${s.section}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{s.period}</td>
                    <td className="px-3 py-2 text-slate-500">{s.section}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{s.count}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(s.tds_total)}</td>
                    <td className="px-3 py-2">
                      {s.deposited
                        ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium"><CheckCircle className="w-3 h-3" /> Deposited{s.challan_no ? ` · ${s.challan_no}` : ''}</span>
                        : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Pending</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!s.deposited && (
                        <button onClick={() => { setModal({ period: s.period, section: s.section }); setChallan({ challan_no: '', deposit_date: dayjs().format('YYYY-MM-DD'), bsr_code: '' }); }}
                          className="text-[11px] px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">Record deposit</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!summary.length && <Empty cols={6} label="No TDS deducted on bills in this period" />}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">Deductee detail ({rows.length})</div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-100">
                    <Th>Bill</Th><Th>Vendor</Th><Th>PAN</Th><Th>Section</Th><Th right>Bill Amount</Th><Th right>TDS</Th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.sl_number}</td>
                        <td className="px-3 py-2">{r.vendor_name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.vendor_pan || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{r.section}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(r.total_amount)}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium">{fmt(r.tds_deduction)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-md border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-black">Record TDS deposit — {modal.period}</p>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">Posts the period's pending TDS as Dr TDS Payable → Cr Bank. The amount is summed automatically from the bills.</p>
            <div className="space-y-2">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Challan no.</label><input className={clsx(inputCls, 'w-full')} value={challan.challan_no} onChange={e => setChallan(c => ({ ...c, challan_no: e.target.value }))} placeholder="ITNS 281 ref" /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Deposit date</label><input type="date" className={clsx(inputCls, 'w-full')} value={challan.deposit_date} onChange={e => setChallan(c => ({ ...c, deposit_date: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">BSR code</label><input className={clsx(inputCls, 'w-full')} value={challan.bsr_code} onChange={e => setChallan(c => ({ ...c, bsr_code: e.target.value }))} placeholder="Optional" /></div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => depositMut.mutate({ ...modal, ...challan })} disabled={depositMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5" />{depositMut.isPending ? 'Posting…' : 'Post deposit JV'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Retention tab ─────────────────────────────────────────────────────────────
function RetentionTab({ projectId }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('held');
  const params = useMemo(() => ({ project_id: projectId || undefined, status }), [projectId, status]);
  const { data, isLoading } = useQuery({ queryKey: ['retention-register', params], queryFn: () => billAccountsAPI.retentionRegister(params).then(r => r.data) });
  const rows = data?.data ?? [];
  const totals = data?.totals ?? { held: 0, released: 0 };

  const releaseMut = useMutation({
    mutationFn: (billId) => billAccountsAPI.retentionRelease(billId, { release_date: dayjs().format('YYYY-MM-DD') }),
    onSuccess: (r) => { toast.success(r.data?.message || 'Retention released'); qc.invalidateQueries({ queryKey: ['retention-register'] }); qc.invalidateQueries({ queryKey: ['je-auto-log'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="held">Held</option>
          <option value="released">Released</option>
          <option value="">All</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">Held: <strong className="text-amber-700">{fmt(totals.held)}</strong> · Released: <strong className="text-emerald-700">{fmt(totals.released)}</strong></span>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">Release posts Dr Retention Payable, Cr Bank</div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <Th>Bill</Th><Th>Vendor</Th><Th>Project</Th><Th>Certified</Th><Th right>Days held</Th><Th right>Retention</Th><Th>Status</Th><Th right>Action</Th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.sl_number}</td>
                  <td className="px-3 py-2">{r.vendor_name}</td>
                  <td className="px-3 py-2 text-slate-500">{r.project_name || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtD(r.qs_certified_date)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{r.days_held ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(r.retention_money)}</td>
                  <td className="px-3 py-2">
                    {r.released
                      ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium"><CheckCircle className="w-3 h-3" /> {fmtD(r.retention_released_date)}</span>
                      : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Held</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!r.released && (
                      <button onClick={() => { if (window.confirm(`Release ${fmt(r.retention_money)} retention to ${r.vendor_name}?`)) releaseMut.mutate(r.id); }}
                        disabled={releaseMut.isPending}
                        className="text-[11px] px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium disabled:opacity-50">Release</button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <Empty cols={8} label="No retention records" />}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Vendor Ledger tab ─────────────────────────────────────────────────────────
function VendorTab({ projectId }) {
  const params = useMemo(() => ({ project_id: projectId || undefined }), [projectId]);
  const { data, isLoading } = useQuery({ queryKey: ['vendor-ledger', params], queryFn: () => billAccountsAPI.vendorLedger(params).then(r => r.data?.data ?? []) });
  const rows = data ?? [];
  const totalOut = rows.reduce((s, r) => s + num(r.outstanding), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center"><span className="ml-auto text-sm text-slate-500">Total outstanding: <strong className="text-black">{fmt(totalOut)}</strong></span></div>
      {isLoading ? <Spinner /> : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <Th>Vendor</Th><Th right>Bills</Th><Th right>Invoiced</Th><Th right>Certified</Th><Th right>TDS</Th><Th right>Paid</Th><Th right>Outstanding</Th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{r.vendor_name}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{r.bill_count}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(r.total_invoiced)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(r.total_certified)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{fmt(r.total_tds)}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-700">{fmt(r.total_paid)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-amber-700">{fmt(r.outstanding)}</td>
                </tr>
              ))}
              {!rows.length && <Empty cols={7} label="No vendor balances" />}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── AP Aging tab ──────────────────────────────────────────────────────────────
const BUCKET_CLS = { '0-30': 'text-slate-600', '31-60': 'text-amber-600', '61-90': 'text-orange-600', '90+': 'text-red-600', 'unscheduled': 'text-slate-400' };
function AgingTab({ projectId }) {
  const params = useMemo(() => ({ project_id: projectId || undefined }), [projectId]);
  const { data, isLoading } = useQuery({ queryKey: ['ap-aging', params], queryFn: () => billAccountsAPI.apAging(params).then(r => r.data?.data ?? []) });
  const rows = data ?? [];
  const buckets = rows.reduce((a, r) => { a[r.aging_bucket] = (a[r.aging_bucket] || 0) + num(r.balance); return a; }, {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['0-30', '31-60', '61-90', '90+'].map(b => (
          <div key={b} className="bg-white border border-slate-200 rounded-md p-3">
            <div className="text-xs text-slate-400">{b} days</div>
            <div className={clsx('text-lg font-semibold mt-0.5', BUCKET_CLS[b])}>{fmt(buckets[b])}</div>
          </div>
        ))}
      </div>
      {isLoading ? <Spinner /> : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <Th>Bill</Th><Th>Vendor</Th><Th>Project</Th><Th>Certified</Th><Th right>Days</Th><Th>Bucket</Th><Th right>Balance</Th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.sl_number}</td>
                  <td className="px-3 py-2">{r.vendor_name}</td>
                  <td className="px-3 py-2 text-slate-500">{r.project_name || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtD(r.qs_certified_date)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{r.days_outstanding ?? '—'}</td>
                  <td className="px-3 py-2"><span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-50', BUCKET_CLS[r.aging_bucket])}>{r.aging_bucket}</span></td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-amber-700">{fmt(r.balance)}</td>
                </tr>
              ))}
              {!rows.length && <Empty cols={7} label="No outstanding payables" />}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BillAccountsPage() {
  const [activeTab, setActiveTab] = useState('itc');
  const [projectId, setProjectId] = useState('');
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-simple'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center"><Receipt className="w-4 h-4 text-blue-600" /></div>
          <div>
            <h1 className="text-lg font-semibold text-black">Bill accounts automation</h1>
            <p className="text-xs text-slate-400">GST ITC · TDS / 26Q · retention · vendor ledger · AP aging — from the bill tracker</p>
          </div>
          <div className="ml-auto">
            <select className={clsx(inputCls, 'w-48')} value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={clsx('flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                activeTab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        {activeTab === 'itc'       && <ItcTab projectId={projectId} />}
        {activeTab === 'tds'       && <TdsTab projectId={projectId} />}
        {activeTab === 'retention' && <RetentionTab projectId={projectId} />}
        {activeTab === 'vendor'    && <VendorTab projectId={projectId} />}
        {activeTab === 'aging'     && <AgingTab projectId={projectId} />}
      </div>
    </div>
  );
}
