// src/pages/stores/IssuePage.jsx
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight, Search, Plus, Clock, CheckCircle2,
  Printer, Box, ShieldCheck, MapPin, HardHat,
  FileText, Send, X, Package, Trash2
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { minAPI, projectAPI, mrsAPI, vendorAPI, inventoryAPI } from '../../api/client';
import { FIELD_HL } from '../../constants/fieldStyles';
import SearchableSelect from '../../components/shared/SearchableSelect';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import MINPrintTemplate from './MINPrintTemplate';
import useAuthStore from '../../store/authStore';

const inr = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Issue Slip Detail Panel (full-screen) ──────────────────────────────── */
function MINDetailPanel({ min, onClose, onAuthorize, authLoading, onReceive, receiveLoading }) {
  const printRef = useRef(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });
  const items = min.items || [];
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="bg-slate-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition">
            <X size={16} />
          </button>
          <div>
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-0.5">Issue Slip</div>
            <h2 className="text-xl font-semibold text-white font-mono leading-tight">{min.min_number}</h2>
            <p className="text-sm text-slate-300 mt-0.5">{min.project_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border',
            min.status === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          )}>
            {min.status === 'draft' ? 'Pending' : 'Issued'}
          </span>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-xs font-medium transition">
            <Printer size={14} /> Print Slip
          </button>
        </div>
      </div>
      <div style={{ display: 'none' }}><div ref={printRef}><MINPrintTemplate min={min} /></div></div>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-4xl mx-auto p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Project',      min.project_name    || '—'],
              ['Activity',     min.activity_name   || '—'],
              ['Issued To',    min.issued_to        || 'Site Team'],
              ['Contractor',   min.contractor_name  || '—'],
              ['Issue Date',   min.issue_date ? dayjs(min.issue_date).format('DD-MM-YYYY HH:mm') : '—'],
              ['Total Value',  `₹${inr(min.total_value)}`],
              ['Issued By',    min.issued_by_name   || '—'],
              ['Received By',  min.received_by_name || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-0.5">{lbl}</div>
                <div className="text-sm font-medium text-slate-900">{val}</div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Package size={13} /> Materials Issued
              </span>
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                {items.length} items
              </span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Sl.','Material','Unit','Qty Issued','Rate','Value','Remarks'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((it, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{it.material_name || it.item_name || '—'}</td>
                    <td className="px-3 py-2.5">
                      {(it.unit) && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] uppercase font-medium">{it.unit}</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-emerald-700 font-medium">{it.quantity ?? it.qty_issued ?? '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">₹{inr(it.rate)}</td>
                    <td className="px-3 py-2.5 font-mono font-medium text-slate-800">₹{inr(it.value || it.total_value)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{it.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white flex-shrink-0 px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-3">
          {min.status === 'draft' && (
            <button onClick={onAuthorize} disabled={authLoading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition shadow-sm">
              <Send size={15} />
              {authLoading ? 'Processing…' : 'Finalize & Deduct Stock'}
            </button>
          )}
          {min.status === 'issued' && !min.verified_receiver_by && (
            <button onClick={onReceive} disabled={receiveLoading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition shadow-sm">
              <CheckCircle2 size={15} />
              {receiveLoading ? 'Confirming…' : 'Confirm Receipt at Site'}
            </button>
          )}
          {min.status === 'issued' && min.verified_receiver_by && (
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
              <CheckCircle2 size={16} className="text-emerald-600" /> Receipt Confirmed
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IssuePage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = String(user?.role || '').toLowerCase() === 'super_admin';
  const [showForm, setShowForm] = useState(false);
  const [selectedMIN, setSelectedMIN] = useState(null);
  const [detailMIN, setDetailMIN] = useState(null);
  const printRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => setSelectedMIN(null),
  });

  React.useEffect(() => {
    if (selectedMIN) handlePrint();
  }, [selectedMIN, handlePrint]);

  const { data: mins, isLoading } = useQuery({
    queryKey: ['min-list'],
    queryFn: () => minAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: contractors } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => vendorAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const authorizeMutation = useMutation({
    mutationFn: (id) => minAPI.authorize(id),
    onSuccess: () => {
      toast.success('Stock deducted and material issued!');
      qc.invalidateQueries({ queryKey: ['min-list'] });
      setDetailMIN(null);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Authorization failed'),
  });

  const receiveMutation = useMutation({
    mutationFn: (id) => minAPI.receive(id, { signature: user?.signature_url || '' }),
    onSuccess: () => {
      toast.success('Receipt confirmed at site!');
      qc.invalidateQueries({ queryKey: ['min-list'] });
      setDetailMIN(null);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to confirm receipt'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => minAPI.remove(id),
    onSuccess: () => {
      toast.success('Issue slip deleted');
      qc.invalidateQueries({ queryKey: ['min-list'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const handleDelete = (min) => {
    const warn = ['issued', 'received'].includes(min.status)
      ? `Delete ${min.min_number}? The issued quantities will be ADDED BACK to inventory and this slip removed. This cannot be undone.`
      : `Delete ${min.min_number}? This permanently removes the issue slip. This cannot be undone.`;
    if (window.confirm(warn)) deleteMutation.mutate(min.id);
  };

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const allMINs = mins || [];
  const draftCount = allMINs.filter(m => m.status === 'draft').length;
  const issuedCount = allMINs.filter(m => m.status === 'issued').length;
  const totalValue = allMINs.reduce((s, m) => s + parseFloat(m.total_value || 0), 0);

  const minList = allMINs.filter(m => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return `${m.min_number} ${m.project_name} ${m.activity_name || ''} ${m.issued_to || ''} ${m.contractor_name || ''}`.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Stock Consumption"
        subtitle="Issue Slip — Material issue to site &amp; logistics"
        breadcrumbs={[{ label: 'Stores' }, { label: 'Issues' }]}
        actions={
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition shadow-sm"
            style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}>
            <Plus className="w-4 h-4" /> New Material Issue
          </button>
        }
      />

      <div className="p-6 md:p-8 max-w-7xl mx-auto">

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <ThemeKpiCard icon={Clock}        label="Pending Issues" value={draftCount}    sub="Draft"          color="amber"   />
        <ThemeKpiCard icon={CheckCircle2} label="Finalized"      value={issuedCount}   sub="Total Issued"   color="emerald" />
        <div className="md:col-span-2">
          <ThemeKpiCard label="Cumulative Consumption Value" value={`₹${inr(totalValue)}`} sub="Audit Verified" color="blue" />
        </div>
      </div>

      {/* Search & filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900 font-semibold" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search issue slip, project, activity…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-900 font-medium outline-none focus:border-indigo-400 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[['all', 'All'], ['draft', 'Pending'], ['issued', 'Issued']].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                statusFilter === val
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-indigo-300'
              )}
            >
              {lbl}
              {val !== 'all' && (
                <span className="ml-1 opacity-70">
                  {val === 'draft' ? draftCount : issuedCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-900 font-medium ml-auto hidden sm:block">{minList.length} of {allMINs.length}</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(n => <div key={n} className="h-16 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-900 font-medium uppercase tracking-wider">Issue Slip</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-900 font-medium uppercase tracking-wider">Work Activity</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-900 font-medium uppercase tracking-wider">Recipient</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-900 font-medium uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-slate-900 font-medium uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {minList.map(min => (
                  <tr key={min.id} onClick={() => setDetailMIN(min)} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-indigo-600 font-mono">{min.min_number}</div>
                          <div className="text-xs text-slate-900 font-medium mt-0.5">{min.project_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-900 font-medium shrink-0" />
                        <span className="text-sm text-slate-900 truncate max-w-[200px]">{min.activity_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <HardHat className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <div>
                          <div className="text-sm text-slate-900 truncate max-w-[180px]">{min.issued_to || 'Site Team'}</div>
                          <div className="text-xs text-slate-900 font-medium mt-0.5">{min.contractor_name || 'Local / internal work'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={clsx('w-2 h-2 rounded-full', min.status === 'issued' ? 'bg-emerald-500' : 'bg-amber-500')} />
                        <span className={clsx('text-xs font-bold', min.status === 'issued' ? 'text-emerald-600' : 'text-amber-600')}>
                          {min.status === 'issued' ? 'Issued' : 'Pending'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-900 font-medium mt-0.5 ml-4">
                        {dayjs(min.issue_date).format('DD-MM-YYYY HH:mm')}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedMIN(min); }}
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300 transition-all"
                        title="Quick print"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleDelete(min)}
                          disabled={deleteMutation.isPending && deleteMutation.variables === min.id}
                          title="Delete issue slip"
                          className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {minList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <Box className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-900 font-semibold">
                        {search || statusFilter !== 'all' ? 'No results match your filters' : 'No material issue notes yet'}
                      </p>
                      {(search || statusFilter !== 'all') && (
                        <button
                          onClick={() => { setSearch(''); setStatusFilter('all'); }}
                          className="mt-2 text-xs text-indigo-500 underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-900 font-semibold">
            {minList.length} issue note{minList.length !== 1 ? 's' : ''} total
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <MINForm
          onClose={() => setShowForm(false)}
          projects={projects}
          contractors={contractors}
          qc={qc}
        />
      )}

      {/* Full-screen detail panel */}
      {detailMIN && (
        <MINDetailPanel
          min={detailMIN}
          onClose={() => setDetailMIN(null)}
          onAuthorize={() => authorizeMutation.mutate(detailMIN.id)}
          authLoading={authorizeMutation.isPending}
          onReceive={() => receiveMutation.mutate(detailMIN.id)}
          receiveLoading={receiveMutation.isPending}
        />
      )}

      {/* Hidden print area (quick-print from table row) */}
      <div className="hidden">
        <div ref={printRef}>
          {selectedMIN && <MINPrintTemplate min={selectedMIN} />}
        </div>
      </div>
      </div>
    </div>
  );
}

// ── MINForm ───────────────────────────────────────────────────────────────────

function MINForm({ onClose, projects, contractors, qc }) {
  const [formData, setFormData] = useState({
    project_id: '', activity_name: '', contractor_id: '',
    issued_to: '', vehicle_number: '', issue_date: dayjs().format('YYYY-MM-DD'),
    material_notes: '', instructions_notes: '', remarks: '',
  });
  const [items, setItems] = useState([]);
  const [inventorySearch, setInventorySearch] = useState('');

  const { data: inventory } = useQuery({
    queryKey: ['inventory-lookup', formData.project_id],
    queryFn: () => inventoryAPI.list({ project_id: formData.project_id }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.project_id,
  });

  const createMutation = useMutation({
    mutationFn: (d) => minAPI.create(d),
    onSuccess: () => {
      toast.success('Material issue note created as draft!');
      qc.invalidateQueries({ queryKey: ['min-list'] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Issue failed'),
  });

  const addItem = (inv) => {
    if (items.some(it => it.inventory_id === inv.id)) {
      toast.error('Item already added');
      return;
    }
    setItems(p => [...p, {
      inventory_id:       inv.id,
      material_name:      inv.material_name,
      unit:               inv.unit,
      available_stock:    inv.closing_stock ?? 0,
      quantity_requested: '',
      quantity_issued:    '',
      rate:               inv.unit_rate || inv.rate || 0,
      purpose:            formData.activity_name,
    }]);
  };

  const setItem = (idx, k, v) => setItems(p => p.map((it, i) => i === idx ? { ...it, [k]: v } : it));

  const submit = () => {
    if (!formData.project_id)         return toast.error('Select a project');
    if (!formData.activity_name?.trim()) return toast.error('Work activity is required');
    if (!formData.issued_to?.trim())   return toast.error('Issued To / Receiver is required');
    if (!items.length)                 return toast.error('Add at least one material item');
    const validItems = items
      .filter(it => parseFloat(it.quantity_issued) > 0)
      .map(it => ({ ...it, quantity_requested: it.quantity_requested || it.quantity_issued || 0 }));
    if (!validItems.length)            return toast.error('Enter quantity to issue for at least one item');
    createMutation.mutate({ ...formData, items: validItems });
  };

  const filteredInventory = (inventory || []).filter(i =>
    i.material_name.toLowerCase().includes(inventorySearch.toLowerCase())
  );

  const inp = `w-full h-10 rounded-lg px-3 text-sm font-medium outline-none transition-all border ${FIELD_HL}`;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0"
          style={{ background: `linear-gradient(135deg, #1e293b 0%, #0f172a 100%)` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-500 rounded-lg flex items-center justify-center">
              <Send className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">New Material Issue Note</h2>
              <p className="text-xs text-slate-400 mt-0.5">Store outward — draft pending authorization</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-slate-300 hover:text-white hover:bg-white/20 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Issue Details */}
          <div className="border border-slate-200 rounded-xl p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Issue Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="col-span-2 md:col-span-1 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Project *</label>
                <SearchableSelect
                  value={formData.project_id}
                  onChange={v => setFormData(p => ({ ...p, project_id: v }))}
                  options={(projects || []).map(p => ({ value: p.id, label: p.name }))}
                  placeholder="Select site store…"
                  searchPlaceholder="Search projects…"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Work Activity *</label>
                <input className={inp} placeholder="e.g. Columns Casting Ground Floor — required"
                  value={formData.activity_name}
                  onChange={e => setFormData(p => ({ ...p, activity_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Issue Date *</label>
                <input type="date" className={inp} value={formData.issue_date}
                  onChange={e => setFormData(p => ({ ...p, issue_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Issued To / Receiver *</label>
                <input className={inp} placeholder="Foreman, engineer or staff name"
                  value={formData.issued_to}
                  onChange={e => setFormData(p => ({ ...p, issued_to: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Vehicle Number</label>
                <input className={inp} placeholder="e.g. KA01AB1234"
                  value={formData.vehicle_number}
                  onChange={e => setFormData(p => ({ ...p, vehicle_number: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Subcontractor / Agency</label>
                <select className={inp} value={formData.contractor_id}
                  onChange={e => setFormData(p => ({ ...p, contractor_id: e.target.value }))}>
                  <option value="">None — internal work</option>
                  {contractors?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* MIN Notes bracket — Material Condition · Instructions · Notes */}
          <div className="border-2 border-slate-300 rounded-xl overflow-hidden">
            <div className="bg-slate-800 px-5 py-2.5 flex items-center gap-3">
              <span className="text-xs font-black text-white uppercase tracking-widest">MIN Notes</span>
              <span className="text-[10px] text-slate-400 font-medium">Material Condition · Instructions · Notes</span>
            </div>
            <div className="grid grid-cols-3 divide-x-2 divide-slate-300">
              {/* M — Material Condition */}
              <div className="bg-amber-50 p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black text-amber-700 uppercase tracking-widest">M</span>
                  <span className="text-[10px] font-semibold text-amber-600">Material Condition Notes</span>
                </div>
                <textarea rows={3}
                  className="w-full text-xs bg-white border border-amber-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 resize-none"
                  placeholder="Condition at issue — packaging, damage, batch…"
                  value={formData.material_notes}
                  onChange={e => setFormData(p => ({ ...p, material_notes: e.target.value }))} />
              </div>
              {/* I — Instructions to Receiver */}
              <div className="bg-white p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">I</span>
                  <span className="text-[10px] font-semibold text-slate-600">Instructions to Receiver</span>
                </div>
                <textarea rows={3}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-slate-400 resize-none"
                  placeholder="Handling, deployment, return conditions…"
                  value={formData.instructions_notes}
                  onChange={e => setFormData(p => ({ ...p, instructions_notes: e.target.value }))} />
              </div>
              {/* N — Notes / General Remarks */}
              <div className="bg-indigo-50 p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black text-indigo-700 uppercase tracking-widest">N</span>
                  <span className="text-[10px] font-semibold text-indigo-600">Notes / General Remarks</span>
                </div>
                <textarea rows={3}
                  className="w-full text-xs bg-white border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 resize-none"
                  placeholder="Admin notes, observations, follow-up…"
                  value={formData.remarks}
                  onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Material selector */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Box className="w-4 h-4 text-indigo-500" />
                Materials to Issue
                {items.length > 0 && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{items.length}</span>
                )}
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  className={clsx('w-72 h-10 pl-9 pr-4 text-sm font-medium rounded-lg outline-none transition-all border', FIELD_HL)}
                  placeholder={formData.project_id ? 'Search stock in project store…' : 'Select project first'}
                  disabled={!formData.project_id}
                  value={inventorySearch}
                  onChange={e => setInventorySearch(e.target.value)}
                />
                {inventorySearch && formData.project_id && (
                  <div className="absolute top-full right-0 mt-2 w-full bg-white border border-slate-200 rounded-xl max-h-72 overflow-y-auto z-[110] shadow-2xl p-1.5">
                    {filteredInventory.map(i => {
                      const c = parseFloat(i.closing_stock) || 0;
                      const m = parseFloat(i.min_stock) || 0;
                      const r = parseFloat(i.reorder_level) || 0;
                      const dot = c <= 0 ? 'bg-rose-500' : (m > 0 && c <= m) || (r > 0 && c <= r) ? 'bg-amber-500' : 'bg-emerald-500';
                      return (
                      <button key={i.id}
                        className="w-full text-left px-2.5 py-2.5 rounded-lg hover:bg-indigo-50 flex justify-between items-center gap-2.5 group transition-colors"
                        onClick={() => { addItem(i); setInventorySearch(''); }}>
                        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', dot)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 truncate">{i.material_name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Available:&nbsp;
                            <span className={clsx('font-bold', c <= 0 ? 'text-red-500' : 'text-indigo-600')}>
                              {i.closing_stock ?? 0} {i.unit}
                            </span>
                            {(i.unit_rate || i.rate) ? ` · ₹${i.unit_rate || i.rate}/unit` : ''}
                          </p>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 group-hover:bg-indigo-100 group-hover:text-indigo-600 rounded px-2 py-0.5 flex-shrink-0">{i.unit}</span>
                        <Plus className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      </button>
                      );
                    })}
                    {filteredInventory.length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                        <Package className="w-5 h-5 text-slate-300" />
                        No matching items in project store
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Items table */}
            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 text-left text-xs font-bold text-slate-500 uppercase">Material</th>
                      <th className="pb-2 text-center text-xs font-bold text-slate-500 uppercase w-24">In Stock</th>
                      <th className="pb-2 text-center text-xs font-bold text-slate-500 uppercase w-28">Requested</th>
                      <th className="pb-2 text-center text-xs font-bold text-slate-500 uppercase w-28">Issued *</th>
                      <th className="pb-2 text-left text-xs font-bold text-slate-500 uppercase">Purpose / Location</th>
                      <th className="pb-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 pr-3">
                          <p className="font-semibold text-slate-800">{it.material_name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{it.unit} · ₹{Number(it.rate).toLocaleString('en-IN')}/unit</p>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={clsx('text-sm font-bold',
                            (it.available_stock || 0) <= 0 ? 'text-red-500' : 'text-emerald-600')}>
                            {it.available_stock}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <input type="number" min={0} placeholder="0" value={it.quantity_requested}
                            onChange={e => setItem(idx, 'quantity_requested', e.target.value)}
                            className={clsx('w-full h-9 rounded-lg px-2 text-xs text-center font-mono outline-none transition-all border', FIELD_HL)} />
                        </td>
                        <td className="py-2.5 px-2">
                          <input type="number" min={0} placeholder="0" required value={it.quantity_issued}
                            onChange={e => setItem(idx, 'quantity_issued', e.target.value)}
                            className={clsx('w-full h-9 rounded-lg px-2 text-xs text-center font-mono font-bold text-indigo-700 outline-none transition-all border', FIELD_HL)} />
                        </td>
                        <td className="py-2.5 px-2">
                          <input placeholder="Activity / floor details" value={it.purpose}
                            onChange={e => setItem(idx, 'purpose', e.target.value)}
                            className={clsx('w-full h-9 rounded-lg px-3 text-xs outline-none transition-all border', FIELD_HL)} />
                        </td>
                        <td className="py-2.5 pl-2">
                          <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={3} className="px-3 py-2 text-xs font-bold text-slate-500 text-right">Total Issue Value:</td>
                      <td colSpan={3} className="px-3 py-2 text-xs font-bold text-indigo-700">
                        ₹{items.reduce((s, it) => s + (parseFloat(it.quantity_issued || 0) * parseFloat(it.rate || 0)), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <Box className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-500">No items added yet</p>
                <p className="text-xs text-slate-400 mt-1">Search and add materials from the project store above</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
            Draft MIN — requires authorization to deduct stock
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-5 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition">
              Cancel
            </button>
            <button onClick={submit} disabled={createMutation.isPending || !items.length}
              className="px-6 h-9 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-40 shadow-sm">
              {createMutation.isPending ? 'Saving…' : 'Save Draft MIN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-700">{label}</label>
      {children}
    </div>
  );
}
