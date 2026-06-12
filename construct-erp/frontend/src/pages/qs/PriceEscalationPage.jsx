import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Plus, X, Trash2, Package, HardHat } from 'lucide-react';
import { priceEscalationAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const fmt = (n) => {
  const v = parseFloat(n || 0);
  const s = v < 0 ? '-' : '';
  return `${s}₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const num = (n, d = 3) => parseFloat(n || 0).toFixed(d);

const TYPE_CFG = {
  rmc:   { label: 'RMC / Concrete', cls: 'bg-blue-50 text-blue-700 border border-blue-200', icon: Package },
  steel: { label: 'Steel',          cls: 'bg-amber-50 text-amber-700 border border-amber-200', icon: HardHat },
  other: { label: 'Other',          cls: 'bg-slate-50 text-slate-600 border border-slate-200', icon: Package },
};

function KpiCard({ label, value, sub, color = 'slate' }) {
  const ring = {
    slate: 'border-l-slate-400', emerald: 'border-l-emerald-500',
    blue: 'border-l-blue-500', amber: 'border-l-amber-400', red: 'border-l-red-400',
  }[color];
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${ring} rounded-xl shadow-sm p-4`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold text-slate-900 mt-1 truncate">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function TypeBadge({ type }) {
  const cfg = TYPE_CFG[type] || TYPE_CFG.other;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

const BLANK = {
  project_id: '', ra_no: '', esc_type: 'rmc', material: '', supplier: '',
  invoice_no: '', invoice_date: dayjs().format('YYYY-MM-DD'), unit: 'Cum',
  received_qty: '', consumed_qty: '', base_rate: '', approved_rate: '', purchase_rate: '', remarks: '',
};

export default function PriceEscalationPage() {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [raNo, setRaNo] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(BLANK);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const params = {};
  if (projectId) params.project_id = projectId;
  if (raNo) params.ra_no = raNo;
  if (typeFilter !== 'all') params.esc_type = typeFilter;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['price-escalations', projectId, raNo, typeFilter],
    queryFn: () => priceEscalationAPI.list(params).then(r => r.data?.data ?? []).catch(() => []),
  });

  const { data: stats } = useQuery({
    queryKey: ['price-escalation-stats', projectId, raNo],
    queryFn: () => priceEscalationAPI.stats(
      { ...(projectId ? { project_id: projectId } : {}), ...(raNo ? { ra_no: raNo } : {}) }
    ).then(r => r.data?.data ?? {}).catch(() => ({})),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['price-escalations'] });
    qc.invalidateQueries({ queryKey: ['price-escalation-stats'] });
  };

  const createMut = useMutation({
    mutationFn: (d) => priceEscalationAPI.create(d),
    onSuccess: () => { toast.success('Escalation line added'); invalidate(); setShowModal(false); setForm(BLANK); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to add'),
  });

  const delMut = useMutation({
    mutationFn: (id) => priceEscalationAPI.remove(id),
    onSuccess: () => { toast.success('Deleted'); invalidate(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to delete'),
  });

  const rateDiff = (parseFloat(form.approved_rate || 0) - parseFloat(form.base_rate || 0));
  const lineAmount = parseFloat(form.consumed_qty || 0) * rateDiff;

  const submit = () => {
    if (!form.project_id) return toast.error('Select a project');
    createMut.mutate({ ...form, rate_diff: rateDiff, amount: lineAmount });
  };

  const net = parseFloat(stats?.net_escalation || 0);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" /> Price Escalation Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Per-invoice rate variations (RMC / Steel) grouped by RA bill.</p>
        </div>
        <button onClick={() => { setForm({ ...BLANK, project_id: projectId, ra_no: raNo }); setShowModal(true); }}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus className="w-4 h-4" /> Add Escalation
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={projectId} onChange={e => setProjectId(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[260px]">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ''}{p.name}</option>)}
        </select>
        <input value={raNo} onChange={e => setRaNo(e.target.value)} placeholder="RA No. (e.g. RA-01)"
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-40" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="all">All Types</option>
          <option value="rmc">RMC / Concrete</option>
          <option value="steel">Steel</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="RMC / Concrete" value={fmt(stats?.rmc_total)} color="blue" />
        <KpiCard label="Steel" value={fmt(stats?.steel_total)} color="amber" />
        <KpiCard label="Net Escalation" value={fmt(net)} color={net >= 0 ? 'emerald' : 'red'}
          sub={net >= 0 ? 'Payable to contractor' : 'Recoverable from contractor'} />
        <KpiCard label="Invoice Lines" value={stats?.line_count ?? 0} color="slate" />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">Type</th>
                <th className="text-left px-3 py-2.5 font-medium">Material</th>
                <th className="text-left px-3 py-2.5 font-medium">Supplier</th>
                <th className="text-left px-3 py-2.5 font-medium">Invoice</th>
                <th className="text-right px-3 py-2.5 font-medium">Consumed</th>
                <th className="text-right px-3 py-2.5 font-medium">Base ₹</th>
                <th className="text-right px-3 py-2.5 font-medium">Approved ₹</th>
                <th className="text-right px-3 py-2.5 font-medium">Diff ₹</th>
                <th className="text-right px-3 py-2.5 font-medium">Amount</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={10} className="text-center py-10 text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-slate-400">No escalation records. Click "Add Escalation".</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2"><TypeBadge type={r.esc_type} /></td>
                  <td className="px-3 py-2 text-slate-700">{r.material || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.supplier || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">
                    <div>{r.invoice_no || '—'}</div>
                    <div className="text-xs text-slate-400">{r.invoice_date ? dayjs(r.invoice_date).format('DD-MMM-YY') : ''}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">{num(r.consumed_qty)} {r.unit}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{fmt(r.base_rate)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{fmt(r.approved_rate)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${parseFloat(r.rate_diff) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {parseFloat(r.rate_diff) >= 0 ? '+' : ''}{fmt(r.rate_diff)}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${parseFloat(r.amount) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {parseFloat(r.amount) >= 0 ? '+' : ''}{fmt(r.amount)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => window.confirm('Delete this escalation line?') && delMut.mutate(r.id)}
                      className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td colSpan={8} className="px-3 py-2.5 text-right">Net Escalation</td>
                  <td className={`px-3 py-2.5 text-right ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {net >= 0 ? '+' : ''}{fmt(net)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">Add Price Escalation Line</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600">Project *</label>
                <select value={form.project_id} onChange={e => set('project_id', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ''}{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">RA No.</label>
                <input value={form.ra_no} onChange={e => set('ra_no', e.target.value)} placeholder="RA-01"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Type</label>
                <select value={form.esc_type} onChange={e => set('esc_type', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="rmc">RMC / Concrete</option>
                  <option value="steel">Steel</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Material / Grade</label>
                <input value={form.material} onChange={e => set('material', e.target.value)} placeholder="M30 / 16MM"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Unit</label>
                <input value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="Cum / MT"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Supplier</label>
                <input value={form.supplier} onChange={e => set('supplier', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Invoice No.</label>
                <input value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Invoice Date</label>
                <input type="date" value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Consumed Qty</label>
                <input type="number" value={form.consumed_qty} onChange={e => set('consumed_qty', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Base Rate ₹</label>
                <input type="number" value={form.base_rate} onChange={e => set('base_rate', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Approved Rate ₹</label>
                <input type="number" value={form.approved_rate} onChange={e => set('approved_rate', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div className="col-span-2 bg-slate-50 rounded-lg p-3 flex justify-between text-sm">
                <span className="text-slate-600">Rate Diff: <b className={rateDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}>{fmt(rateDiff)}</b> / {form.unit}</span>
                <span className="text-slate-600">Line Amount: <b className={lineAmount >= 0 ? 'text-emerald-600' : 'text-red-500'}>{fmt(lineAmount)}</b></span>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={submit} disabled={createMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {createMut.isPending ? 'Saving…' : 'Add Line'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
