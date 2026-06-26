import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Landmark, Search, Filter, RefreshCw, BadgeIndianRupee, ClipboardList,
  TrendingUp, Building2, FileText, Plus, Edit2, Trash2, Check, X,
  ShieldCheck, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { poAPI, projectAPI, quotationAPI, vendorAPI, rateContractAPI } from '../../api/client';

const asArray = payload => {
  if (Array.isArray(payload)) return payload;
  return payload?.data || payload?.rows || payload?.items || payload?.po || payload?.quotations || [];
};

const clean = value => String(value || '').trim().toLowerCase();
const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = value => (value ? dayjs(value).format('DD-MM-YYYY') : '—');

const extractItems = record => {
  const nested = [record?.items, record?.po_items, record?.line_items, record?.quotation_items, record?.quote_items].find(Array.isArray);
  if (nested?.length) return nested;
  if (record?.material_name || record?.description || record?.item_name || record?.rate || record?.unit_rate || record?.quoted_rate) return [record];
  if (Array.isArray(record?.vendors)) {
    return record.vendors.flatMap(v => (Array.isArray(v?.items) ? v.items : []).map(item => ({ ...item, vendor_name: v.vendor_name || v.name || v.vendor?.name })));
  }
  return [];
};

const toRows = (records, sourceType, projectLookup) =>
  (records || []).flatMap(record => {
    const items = extractItems(record);
    return items.map((item, index) => {
      const material = item?.material_name || item?.description || item?.name || item?.item_name || 'Unnamed material';
      const qty = Number(item?.quantity || item?.qty || 0);
      const rate = Number(item?.rate || item?.unit_rate || item?.basic_rate || item?.quoted_rate || 0);
      const projectId = record?.project_id || record?.project?.id || '';
      const projectName = record?.project_name || record?.project?.name || projectLookup.get(projectId) || '—';
      const vendorName = record?.vendor_name || record?.vendor?.name || '—';
      const docNo = record?.serial_no_formatted || record?.po_number || record?.quotation_number || record?.quote_number || record?.reference_no || record?.serial_no || record?.mrs_number || record?.id || '—';
      const sourceDate = record?.po_date || record?.quotation_date || record?.created_at || record?.updated_at || null;
      return {
        id: `${sourceType}-${record?.id || 'row'}-${index}`,
        sourceType, projectId, projectName, vendorName, docNo, sourceDate, material, qty,
        unit: item?.unit || item?.uom || 'Nos', rate, total: qty * rate,
        note: item?.remarks || record?.notes || '',
        searchableText: [material, vendorName, projectName, docNo, item?.remarks, record?.notes].map(clean).join(' '),
      };
    });
  });

function StatCard({ label, value, sub, icon: Icon, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center', tones[tone])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-medium text-slate-900">{value}</div>
      <div className="text-[11px] font-medium tracking-[0.18em] text-slate-900 uppercase mt-1">{label}</div>
      <div className="text-xs text-slate-900 font-medium mt-1.5 leading-tight">{sub}</div>
    </div>
  );
}

const EMPTY_FORM = { vendor_id: '', material_name: '', unit: '', contracted_rate: '', valid_from: dayjs().format('YYYY-MM-DD'), valid_to: '', contracted_qty: '', notes: '' };

function RateContractForm({ vendors, onSave, onCancel, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const inp = 'w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400';
  return (
    <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Material Name *</label>
          <input className={inp} value={form.material_name} onChange={set('material_name')} placeholder="e.g. TMT Steel Fe500" />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Unit</label>
          <input className={inp} value={form.unit} onChange={set('unit')} placeholder="MT, Kg, Nos..." />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Contracted Rate (₹) *</label>
          <input className={inp} type="number" step="0.01" value={form.contracted_rate} onChange={set('contracted_rate')} placeholder="0.00" />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Vendor</label>
          <select className={inp} value={form.vendor_id} onChange={set('vendor_id')}>
            <option value="">Any Vendor</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Contracted Qty</label>
          <input className={inp} type="number" step="0.001" value={form.contracted_qty} onChange={set('contracted_qty')} placeholder="Optional" />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Valid From *</label>
          <input className={inp} type="date" value={form.valid_from} onChange={set('valid_from')} />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Valid To</label>
          <input className={inp} type="date" value={form.valid_to} onChange={set('valid_to')} />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Notes</label>
          <input className={inp} value={form.notes} onChange={set('notes')} placeholder="Optional remarks" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(form)} className="h-8 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Save
        </button>
        <button onClick={onCancel} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:border-slate-300 transition-colors flex items-center gap-1.5">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}

export default function RateContractPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('live');
  const [projectId, setProjectId] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const projectQuery = useQuery({ queryKey: ['rc-projects'], queryFn: () => projectAPI.list().then(r => asArray(r.data)).catch(() => []) });
  const vendorQuery  = useQuery({ queryKey: ['rc-vendors'],  queryFn: () => vendorAPI.list().then(r => asArray(r.data)).catch(() => []) });
  const poQuery = useQuery({
    queryKey: ['rc-pos'],
    queryFn: async () => {
      const list = asArray((await poAPI.list()).data);
      const detailed = await Promise.all(list.map(async po => { try { const res = await poAPI.get(po.id); return res.data?.data || res.data || po; } catch { return po; } }));
      return detailed;
    },
  });
  const quoteQuery = useQuery({
    queryKey: ['rc-quotations'],
    queryFn: async () => {
      const list = asArray((await quotationAPI.list()).data);
      const mrsIds = [...new Set(list.map(q => q?.mrs_id).filter(Boolean))];
      const detailed = await Promise.all(mrsIds.map(async mrsId => { try { const res = await quotationAPI.getCS(mrsId); return res.data?.data || res.data || null; } catch { return null; } }));
      return detailed.filter(Boolean);
    },
  });
  const contractsQuery = useQuery({ queryKey: ['formal-rate-contracts'], queryFn: () => rateContractAPI.list().then(r => asArray(r.data)).catch(() => []) });

  const refresh = async () => {
    await Promise.all([projectQuery.refetch(), poQuery.refetch(), quoteQuery.refetch(), contractsQuery.refetch()]);
    toast.success('Refreshed');
  };

  const projects = projectQuery.data || [];
  const vendors  = vendorQuery.data  || [];
  const pos = poQuery.data || [];
  const quotations = quoteQuery.data || [];
  const contracts = contractsQuery.data || [];

  const projectLookup = useMemo(() => {
    const map = new Map();
    projects.forEach(p => { if (p?.id) map.set(p.id, p.project_code ? `${p.name} (${p.project_code})` : (p.name || '—')); });
    return map;
  }, [projects]);

  const rateRows = useMemo(() => {
    const rows = [...toRows(pos, 'po', projectLookup), ...toRows(quotations, 'quotation', projectLookup)];
    rows.sort((a, b) => { const aT = a.sourceDate ? new Date(a.sourceDate).getTime() : 0; const bT = b.sourceDate ? new Date(b.sourceDate).getTime() : 0; return bT !== aT ? bT - aT : b.rate - a.rate; });
    return rows;
  }, [pos, quotations, projectLookup]);

  const filtered = useMemo(() => {
    const q = clean(search);
    return rateRows.filter(row => {
      if (projectId !== 'all' && row.projectId !== projectId) return false;
      if (sourceFilter !== 'all' && row.sourceType !== sourceFilter) return false;
      return !q || clean(row.searchableText).includes(q);
    });
  }, [rateRows, projectId, sourceFilter, search]);

  const uniqueMaterials = new Set(filtered.map(r => clean(r.material)).filter(Boolean)).size;
  const uniqueVendors   = new Set(filtered.map(r => clean(r.vendorName)).filter(Boolean)).size;
  const avgRate = filtered.length ? filtered.reduce((s, r) => s + Number(r.rate || 0), 0) / filtered.length : 0;
  const latest = filtered[0];

  const contractSearch = useQuery({ queryKey: ['unused'], enabled: false });
  const [contractQ, setContractQ] = useState('');
  const filteredContracts = useMemo(() => {
    const q = clean(contractQ);
    return contracts.filter(c => !q || clean(c.material_name + ' ' + (c.vendor_name || '')).includes(q));
  }, [contracts, contractQ]);

  const activeContracts  = contracts.filter(c => !c.valid_to || dayjs(c.valid_to).isAfter(dayjs()));
  const expiredContracts = contracts.filter(c => c.valid_to && !dayjs(c.valid_to).isAfter(dayjs()));

  const handleSave = async (form) => {
    if (!form.material_name?.trim() || !form.contracted_rate || !form.valid_from) {
      toast.error('Material name, rate and valid-from are required'); return;
    }
    try {
      if (editingId) {
        await rateContractAPI.update(editingId, form);
        toast.success('Rate contract updated');
      } else {
        await rateContractAPI.create(form);
        toast.success('Rate contract created');
      }
      qc.invalidateQueries(['formal-rate-contracts']);
      setShowForm(false); setEditingId(null);
    } catch (err) { toast.error(err?.response?.data?.error || 'Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this rate contract?')) return;
    try { await rateContractAPI.delete(id); qc.invalidateQueries(['formal-rate-contracts']); toast.success('Deleted'); }
    catch (err) { toast.error(err?.response?.data?.error || 'Failed to delete'); }
  };

  const editingContract = editingId ? contracts.find(c => c.id === editingId) : null;

  return (
    <div className="p-6 md:p-7 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-indigo-500 font-medium mb-1.5">
            <Landmark className="w-3.5 h-3.5" /> Procurement
          </div>
          <h1 className="text-2xl md:text-[28px] font-medium text-slate-900 leading-tight">Rate Contracts</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">
            Manage formal rate contracts or browse historical rates from POs and quotations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:border-indigo-300 hover:text-indigo-700 transition-all shadow-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit mb-5">
        {[['live', 'Historical Rates'], ['contracts', 'Rate Contracts']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx('h-8 px-4 rounded-lg text-sm font-medium transition-all', tab === key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-indigo-600')}>
            {label}
          </button>
        ))}
      </div>

      {/* ── LIVE RATES TAB ── */}
      {tab === 'live' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Materials"    value={uniqueMaterials} sub="Distinct live rate items" icon={ClipboardList} tone="indigo" />
            <StatCard label="Vendors"      value={uniqueVendors}   sub="Unique vendors in scope"  icon={Building2}    tone="emerald" />
            <StatCard label="Average Rate" value={filtered.length ? money(avgRate) : '—'} sub="Mean of filtered rows" icon={BadgeIndianRupee} tone="amber" />
            <StatCard label="Source Rows"  value={filtered.length} sub="PO and quotation rows"    icon={TrendingUp}   tone="cyan" />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-3 md:p-4 shadow-sm mb-5">
            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.1fr_0.8fr_auto] gap-3 items-center">
              <div>
                <label className="block text-[11px] font-medium tracking-[0.18em] uppercase text-slate-500 mb-1">Project</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm text-slate-900 outline-none focus:border-indigo-400">
                  <option value="all">All Projects</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.name} (${p.project_code})` : p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium tracking-[0.18em] uppercase text-slate-500 mb-1">Search Material / Vendor</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Steel, cement, shuttering, vendor..." className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium tracking-[0.18em] uppercase text-slate-500 mb-1">Source</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[['all','All'],['po','PO'],['quotation','Quotation']].map(([key,label]) => (
                    <button key={key} onClick={() => setSourceFilter(key)} className={clsx('h-10 px-3 rounded-xl border text-sm font-medium transition-all', sourceFilter === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={() => { setProjectId('all'); setSourceFilter('all'); setSearch(''); }} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium text-sm hover:text-indigo-700 hover:border-indigo-300 transition-all">
                  <Filter className="w-4 h-4 inline mr-1.5" /> Reset
                </button>
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-[1.55fr_0.9fr] gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-slate-900">Live Rate Register</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Latest PO and quotation line items, sorted by date</p>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{filtered.length} rows</span>
              </div>
              {(poQuery.isLoading || quoteQuery.isLoading) ? (
                <div className="p-5 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="p-14 text-center"><FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" /><p className="text-sm font-medium text-slate-600">No rate references found</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        <th className="text-left font-medium px-4 py-3">Material</th>
                        <th className="text-left font-medium px-4 py-3">Rate</th>
                        <th className="text-left font-medium px-4 py-3">Vendor / Source</th>
                        <th className="text-left font-medium px-4 py-3">Project</th>
                        <th className="text-left font-medium px-4 py-3">Document / Date</th>
                        <th className="text-right font-medium px-4 py-3">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filtered.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 align-top"><div className="text-sm font-medium text-slate-900 leading-tight">{row.material}</div>{row.note ? <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[240px]">{row.note}</div> : null}</td>
                          <td className="px-4 py-3 align-top"><div className="text-sm font-medium text-indigo-600">{money(row.rate)}</div><div className="text-[11px] text-slate-400">{row.sourceType === 'po' ? 'Purchase Order' : 'Quotation'}</div></td>
                          <td className="px-4 py-3 align-top"><div className="text-sm font-medium text-slate-700">{row.vendorName}</div></td>
                          <td className="px-4 py-3 align-top"><div className="text-sm text-slate-700 truncate max-w-[190px]">{row.projectName}</div></td>
                          <td className="px-4 py-3 align-top"><div className="text-sm font-mono text-slate-700 truncate max-w-[170px]">{row.docNo}</div><div className="text-[11px] text-slate-400 mt-0.5">{fmt(row.sourceDate)}</div></td>
                          <td className="px-4 py-3 align-top text-right"><div className="text-sm font-medium text-slate-700">{row.qty || 0} {row.unit}</div><div className="text-[11px] text-slate-400">{money(row.total)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-emerald-500" /><div><h3 className="text-sm font-medium text-slate-900">Best Suggested Rate</h3><p className="text-xs text-slate-400">Latest filtered rate</p></div></div>
                {latest ? (
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-emerald-50 border border-indigo-100 p-4">
                    <div className="text-xs text-slate-500 uppercase tracking-[0.18em]">Recommended</div>
                    <div className="text-3xl font-medium text-slate-900 mt-1">{money(latest.rate)}</div>
                    <div className="text-sm text-slate-700 mt-2">{latest.material}</div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      {[['Vendor', latest.vendorName], ['Project', latest.projectName], ['Document', latest.docNo], ['Date', fmt(latest.sourceDate)]].map(([l, v]) => (
                        <div key={l} className="p-3 rounded-xl bg-white/80 border border-slate-100"><div className="text-slate-400 uppercase tracking-[0.18em] text-[10px]">{l}</div><div className="text-slate-800 font-medium mt-1">{v}</div></div>
                      ))}
                    </div>
                  </div>
                ) : <div className="py-8 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">No rate available</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── RATE CONTRACTS TAB ── */}
      {tab === 'contracts' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total Contracts" value={contracts.length} sub="All rate contracts on record" icon={ClipboardList} tone="indigo" />
            <StatCard label="Active"  value={activeContracts.length}  sub="Valid today"   icon={ShieldCheck}    tone="emerald" />
            <StatCard label="Expired" value={expiredContracts.length} sub="Past valid_to" icon={AlertTriangle}  tone="amber" />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-slate-900">Formal Rate Contracts</h2>
                <p className="text-xs text-slate-500 mt-0.5">Negotiated rates with validity dates and contracted quantities</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input value={contractQ} onChange={e => setContractQ(e.target.value)} placeholder="Search material or vendor..." className="h-9 w-56 bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 text-sm outline-none focus:border-indigo-400" />
                </div>
                <button onClick={() => { setShowForm(true); setEditingId(null); }}
                  className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add Contract
                </button>
              </div>
            </div>

            <div className="px-5 py-4">
              {(showForm && !editingId) && (
                <div className="mb-4">
                  <RateContractForm vendors={vendors} onSave={handleSave} onCancel={() => setShowForm(false)} />
                </div>
              )}
            </div>

            {contractsQuery.isLoading ? (
              <div className="p-5 space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}</div>
            ) : filteredContracts.length === 0 ? (
              <div className="p-14 text-center">
                <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">No rate contracts yet</p>
                <p className="text-xs text-slate-400 mt-1">Click "Add Contract" to create your first negotiated rate contract.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      <th className="text-left font-medium px-4 py-3">Material</th>
                      <th className="text-left font-medium px-4 py-3">Vendor</th>
                      <th className="text-right font-medium px-4 py-3">Rate (₹)</th>
                      <th className="text-right font-medium px-4 py-3">Contracted Qty</th>
                      <th className="text-left font-medium px-4 py-3">Valid From</th>
                      <th className="text-left font-medium px-4 py-3">Valid To</th>
                      <th className="text-left font-medium px-4 py-3">Status</th>
                      <th className="text-right font-medium px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredContracts.map(c => {
                      const isActive = !c.valid_to || dayjs(c.valid_to).isAfter(dayjs());
                      return (
                        <React.Fragment key={c.id}>
                          <tr className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-slate-900">{c.material_name}</div>
                              {c.unit && <div className="text-[11px] text-slate-400">{c.unit}</div>}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">{c.vendor_name || <span className="text-slate-400">Any vendor</span>}</td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-indigo-700">{money(c.contracted_rate)}</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">{c.contracted_qty ? `${Number(c.contracted_qty).toLocaleString('en-IN')} ${c.unit || ''}` : '—'}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{fmt(c.valid_from)}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{c.valid_to ? fmt(c.valid_to) : <span className="text-slate-400">No expiry</span>}</td>
                            <td className="px-4 py-3">
                              <span className={clsx('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full', isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                                {isActive ? <><Check className="w-3 h-3" /> Active</> : 'Expired'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => { setEditingId(c.id); setShowForm(false); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                          {editingId === c.id && (
                            <tr><td colSpan={8} className="px-4 pb-3 bg-indigo-50/30">
                              <RateContractForm vendors={vendors} initial={{ ...c, vendor_id: c.vendor_id || '', valid_from: c.valid_from ? dayjs(c.valid_from).format('YYYY-MM-DD') : '', valid_to: c.valid_to ? dayjs(c.valid_to).format('YYYY-MM-DD') : '', contracted_qty: c.contracted_qty || '', notes: c.notes || '' }}
                                onSave={handleSave} onCancel={() => setEditingId(null)} />
                            </td></tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
