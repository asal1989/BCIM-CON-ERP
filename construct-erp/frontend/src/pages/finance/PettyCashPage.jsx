import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pettyCashAPI, projectAPI, storesPettyCashAPI } from '../../api/client';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import dayjs from 'dayjs';
import {
  Wallet, PlusCircle, CheckCircle, XCircle, Clock, BarChart2,
  FileText, RefreshCw, Settings, Send, IndianRupee, TrendingUp,
  AlertCircle, Layers, Store
} from 'lucide-react';

const fmt = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtD = d => d ? dayjs(d).format('DD MMM YYYY') : '—';

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
  issued:    'bg-purple-100 text-purple-700',
  settled:   'bg-teal-100 text-teal-700',
  cancelled: 'bg-gray-200 text-gray-500',
  verified:  'bg-emerald-100 text-emerald-700',
};

const PRIORITY_COLORS = {
  normal:    'bg-gray-100 text-gray-600',
  urgent:    'bg-orange-100 text-orange-700',
  emergency: 'bg-red-100 text-red-700',
};

const TABS = [
  { id: 'dashboard',    label: 'Dashboard',      icon: BarChart2  },
  { id: 'stores-pc',   label: 'Stores PC',       icon: Store      },
  { id: 'requests',     label: 'Requests',        icon: FileText   },
  { id: 'expenses',     label: 'Expenses',        icon: Wallet     },
  { id: 'sc-advances',  label: 'SC Advances',     icon: Send       },
  { id: 'approvals',    label: 'Approvals',       icon: CheckCircle},
  { id: 'settlements',  label: 'Settlements',     icon: Layers     },
  { id: 'masters',      label: 'Masters',         icon: Settings   },
  { id: 'reports',      label: 'Reports',         icon: TrendingUp },
];

const COST_HEADS = ['Material', 'Consumables', 'Electrical', 'Safety', 'P&M'];

// ── Shared helpers ─────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, color = 'blue' }) {
  const cls = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   icon: 'text-blue-500'   },
    green:  { bg: 'bg-green-50',  text: 'text-green-700',  icon: 'text-green-500'  },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  icon: 'text-amber-500'  },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500' },
    red:    { bg: 'bg-red-50',    text: 'text-red-700',    icon: 'text-red-500'    },
  }[color];
  return (
    <div className={clsx('rounded-2xl p-4 border border-white/60', cls.bg)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className={clsx('text-2xl font-bold mt-1', cls.text)}>{value}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {Icon && <Icon size={22} className={cls.icon} />}
      </div>
    </div>
  );
}

function Badge({ status, label }) {
  return (
    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[status] || 'bg-gray-100 text-gray-600')}>
      {label || status}
    </span>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className={clsx('bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]', wide ? 'w-full max-w-2xl' : 'w-full max-w-lg')}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <XCircle size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide block mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const btnPrimary = 'h-9 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50';
const btnSecondary = 'h-9 px-4 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors';

// ── Dashboard Tab ──────────────────────────────────────────────────────────────
function DashboardTab({ projectId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pc-dashboard', projectId],
    queryFn: () => pettyCashAPI.dashboard({ project_id: projectId || undefined }).then(r => r.data),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-400">Loading dashboard…</div>;
  if (!data) return null;

  const trend = data.monthly_trend || [];
  const maxTrend = Math.max(...trend.map(t => Number(t.total)), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Cash in Hand" value={fmt(data.balance?.total_balance)} sub={`${data.balance?.account_count} accounts`} icon={Wallet} color="blue" />
        <KpiCard title="Pending Requests" value={data.pending_requests} sub="awaiting approval" icon={Clock} color="amber" />
        <KpiCard title="Pending Expenses" value={data.pending_expenses} sub="to be verified" icon={AlertCircle} color="red" />
        <KpiCard title="This Month" value={fmt((data.categories || []).reduce((s, c) => s + Number(c.total), 0))} sub="total expenses" icon={TrendingUp} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Expense Trend</h3>
          <div className="flex items-end gap-1.5 h-28">
            {trend.length === 0 ? (
              <p className="text-xs text-gray-400 m-auto">No data</p>
            ) : trend.map(t => (
              <div key={t.month} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full bg-blue-500 rounded-t-md" style={{ height: `${(Number(t.total)/maxTrend)*100}%`, minHeight: 4 }} title={fmt(t.total)} />
                <span className="text-[9px] text-gray-400">{t.month?.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">This Month by Category</h3>
          <div className="space-y-1.5">
            {(data.categories || []).slice(0, 5).map(c => {
              const total = (data.categories || []).reduce((s, x) => s + Number(x.total), 0);
              const pct = total ? Math.round(Number(c.total)*100/total) : 0;
              return (
                <div key={c.category_name} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600 w-28 truncate">{c.category_name}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-gray-500 w-10 text-right">{pct}%</span>
                  <span className="text-gray-700 font-medium w-20 text-right">{fmt(c.total)}</span>
                </div>
              );
            })}
            {(data.categories || []).length === 0 && <p className="text-xs text-gray-400">No expense data</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Requests</h3>
          <div className="space-y-2">
            {(data.recent_requests || []).map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs border-b border-gray-50 pb-1.5 last:border-0">
                <div>
                  <span className="font-medium text-gray-700">{r.request_number}</span>
                  <span className="text-gray-400 ml-1.5">{r.purpose?.slice(0, 30)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700">{fmt(r.amount_requested)}</span>
                  <Badge status={r.status} />
                </div>
              </div>
            ))}
            {(data.recent_requests || []).length === 0 && <p className="text-xs text-gray-400">No requests yet</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Site-wise (This Month)</h3>
          <div className="space-y-1.5">
            {(data.site_wise || []).map(s => (
              <div key={s.site_location} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 w-28 truncate">{s.site_location}</span>
                <span className="text-gray-500">{s.count} entries</span>
                <span className="font-medium text-gray-800">{fmt(s.total)}</span>
              </div>
            ))}
            {(data.site_wise || []).length === 0 && <p className="text-xs text-gray-400">No site data</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Requests Tab ───────────────────────────────────────────────────────────────
function RequestsTab({ projectId, projects, custodians, accounts }) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ status: '', from_date: '', to_date: '' });
  const [showForm, setShowForm] = useState(false);
  const [showIssue, setShowIssue] = useState(null);
  const blankForm = { purpose: '', amount_requested: '', priority: 'normal', site_location: '', custodian_id: '', account_id: '', remarks: '' };
  const [form, setForm] = useState(blankForm);
  const [issueForm, setIssueForm] = useState({ amount_issued: '', payment_mode: 'cash', reference_number: '', remarks: '' });

  const params = useMemo(() => ({ project_id: projectId || undefined, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) }), [projectId, filters]);
  const { data, isLoading } = useQuery({ queryKey: ['pc-requests', params], queryFn: () => pettyCashAPI.requests(params).then(r => r.data.data) });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['pc-requests'] }); qc.invalidateQueries({ queryKey: ['pc-dashboard'] }); };
  const createMut  = useMutation({ mutationFn: d => pettyCashAPI.createRequest({ ...d, project_id: projectId || undefined }), onSuccess: () => { toast.success('Request created'); invalidate(); setShowForm(false); setForm(blankForm); } });
  const submitMut  = useMutation({ mutationFn: id => pettyCashAPI.submitRequest(id), onSuccess: () => { toast.success('Submitted for approval'); invalidate(); } });
  const issueMut   = useMutation({ mutationFn: ({ id, ...d }) => pettyCashAPI.issueRequest(id, d), onSuccess: () => { toast.success('Cash issued'); invalidate(); setShowIssue(null); } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select className={clsx(inputCls, 'w-36')} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Status</option>
          {['draft','submitted','approved','rejected','issued','settled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" className={clsx(inputCls, 'w-36')} value={filters.from_date} onChange={e => setFilters(f => ({ ...f, from_date: e.target.value }))} />
        <input type="date" className={clsx(inputCls, 'w-36')} value={filters.to_date} onChange={e => setFilters(f => ({ ...f, to_date: e.target.value }))} />
        <div className="ml-auto">
          <button onClick={() => setShowForm(true)} className={btnPrimary}><PlusCircle size={14} className="inline mr-1" />New Request</button>
        </div>
      </div>

      {isLoading ? <div className="text-center py-8 text-gray-400">Loading…</div> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>{['Request #','Purpose','Project / Site','Custodian','Amount','Priority','Status','Actions'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data || []).map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-blue-600">{r.request_number}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate">{r.purpose}</td>
                  <td className="px-3 py-2 text-gray-500">{r.project_name || '—'}<br /><span className="text-gray-400">{r.site_location}</span></td>
                  <td className="px-3 py-2">{r.custodian_name || '—'}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(r.amount_requested)}</td>
                  <td className="px-3 py-2"><span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold', PRIORITY_COLORS[r.priority])}>{r.priority}</span></td>
                  <td className="px-3 py-2"><Badge status={r.status} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {r.status === 'draft' && <button onClick={() => submitMut.mutate(r.id)} className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"><Send size={10} className="inline mr-0.5" />Submit</button>}
                      {r.status === 'approved' && <button onClick={() => { setShowIssue(r.id); setIssueForm(f => ({ ...f, amount_issued: r.amount_approved || r.amount_requested })); }} className="text-[10px] px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium"><IndianRupee size={10} className="inline mr-0.5" />Issue</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {(data || []).length === 0 && <tr><td colSpan={8} className="py-8 text-center text-gray-400">No requests found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title="New Cash Request" onClose={() => setShowForm(false)} wide>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Purpose *"><textarea className={inputCls} rows={2} value={form.purpose} onChange={e => setForm(f => ({...f, purpose: e.target.value}))} /></Field></div>
            <Field label="Amount Requested *"><input type="number" className={inputCls} value={form.amount_requested} onChange={e => setForm(f => ({...f, amount_requested: e.target.value}))} /></Field>
            <Field label="Priority">
              <select className={inputCls} value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                <option value="normal">Normal</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option>
              </select>
            </Field>
            <Field label="Site Location"><input className={inputCls} value={form.site_location} onChange={e => setForm(f => ({...f, site_location: e.target.value}))} /></Field>
            <Field label="Custodian">
              <select className={inputCls} value={form.custodian_id} onChange={e => setForm(f => ({...f, custodian_id: e.target.value}))}>
                <option value="">— Select —</option>
                {(custodians || []).map(c => <option key={c.id} value={c.id}>{c.custodian_name}</option>)}
              </select>
            </Field>
            <div className="col-span-2"><Field label="Cash Account">
              <select className={inputCls} value={form.account_id} onChange={e => setForm(f => ({...f, account_id: e.target.value}))}>
                <option value="">— Select —</option>
                {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.account_name} ({fmt(a.current_balance)})</option>)}
              </select>
            </Field></div>
            <div className="col-span-2"><Field label="Remarks"><input className={inputCls} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} /></Field></div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
            <button onClick={() => { if (!form.purpose || !form.amount_requested) return toast.error('Purpose and amount required'); createMut.mutate(form); }} disabled={createMut.isPending} className={btnPrimary}>Create Request</button>
          </div>
        </Modal>
      )}

      {showIssue && (
        <Modal title="Issue Cash" onClose={() => setShowIssue(null)}>
          <div className="space-y-3">
            <Field label="Amount to Issue *"><input type="number" className={inputCls} value={issueForm.amount_issued} onChange={e => setIssueForm(f => ({...f, amount_issued: e.target.value}))} /></Field>
            <Field label="Payment Mode">
              <select className={inputCls} value={issueForm.payment_mode} onChange={e => setIssueForm(f => ({...f, payment_mode: e.target.value}))}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option>
              </select>
            </Field>
            <Field label="Reference Number"><input className={inputCls} value={issueForm.reference_number} onChange={e => setIssueForm(f => ({...f, reference_number: e.target.value}))} /></Field>
            <Field label="Remarks"><input className={inputCls} value={issueForm.remarks} onChange={e => setIssueForm(f => ({...f, remarks: e.target.value}))} /></Field>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowIssue(null)} className={btnSecondary}>Cancel</button>
            <button onClick={() => { if (!issueForm.amount_issued) return toast.error('Amount required'); issueMut.mutate({ id: showIssue, ...issueForm }); }} disabled={issueMut.isPending} className={btnPrimary}>Issue Cash</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Expenses Tab ───────────────────────────────────────────────────────────────
function ExpensesTab({ projectId, custodians, categories }) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ status: '', from_date: '', to_date: '' });
  const [showForm, setShowForm] = useState(false);
  const blankExp = { expense_date: dayjs().format('YYYY-MM-DD'), description: '', amount: '', category_id: '', cost_head: '', custodian_id: '', site_location: '', payment_mode: 'cash', bill_number: '', vendor_name: '', remarks: '' };
  const [form, setForm] = useState(blankExp);

  const params = useMemo(() => ({ project_id: projectId || undefined, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) }), [projectId, filters]);
  const { data, isLoading } = useQuery({ queryKey: ['pc-expenses', params], queryFn: () => pettyCashAPI.expenses(params).then(r => r.data.data) });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['pc-expenses'] }); qc.invalidateQueries({ queryKey: ['pc-dashboard'] }); };
  const createMut = useMutation({ mutationFn: d => pettyCashAPI.createExpense({ ...d, project_id: projectId || undefined }), onSuccess: () => { toast.success('Expense added'); invalidate(); setShowForm(false); setForm(blankExp); } });
  const submitMut = useMutation({ mutationFn: id => pettyCashAPI.submitExpense(id), onSuccess: () => { toast.success('Submitted'); invalidate(); } });
  const deleteMut = useMutation({ mutationFn: id => pettyCashAPI.deleteExpense(id), onSuccess: () => { toast.success('Deleted'); invalidate(); } });

  const totals = useMemo(() => {
    const rows = data || [];
    return { total: rows.reduce((s, r) => s + Number(r.amount), 0), approved: rows.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.amount), 0) };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select className={clsx(inputCls, 'w-36')} value={filters.status} onChange={e => setFilters(f => ({...f, status: e.target.value}))}>
          <option value="">All Status</option>
          {['draft','submitted','approved','rejected'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" className={clsx(inputCls, 'w-36')} value={filters.from_date} onChange={e => setFilters(f => ({...f, from_date: e.target.value}))} />
        <input type="date" className={clsx(inputCls, 'w-36')} value={filters.to_date} onChange={e => setFilters(f => ({...f, to_date: e.target.value}))} />
        <div className="flex items-center gap-3 ml-auto text-xs text-gray-500">
          <span>Total: <strong className="text-gray-800">{fmt(totals.total)}</strong></span>
          <span>Approved: <strong className="text-green-700">{fmt(totals.approved)}</strong></span>
          <button onClick={() => setShowForm(true)} className={btnPrimary}><PlusCircle size={14} className="inline mr-1" />Add Expense</button>
        </div>
      </div>

      {isLoading ? <div className="text-center py-8 text-gray-400">Loading…</div> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>{['Voucher','Date','Cost Head','Category','Description','Vendor','Custodian','Amount','Status','Actions'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data || []).map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-blue-600">{e.voucher_number}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtD(e.expense_date)}</td>
                  <td className="px-3 py-2">{e.cost_head ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">{e.cost_head}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2"><span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{e.category_name || 'Misc'}</span></td>
                  <td className="px-3 py-2 max-w-[160px] truncate">{e.description}</td>
                  <td className="px-3 py-2 text-gray-500">{e.vendor_name || '—'}</td>
                  <td className="px-3 py-2">{e.custodian_name || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmt(e.amount)}</td>
                  <td className="px-3 py-2"><Badge status={e.status} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {e.status === 'draft' && <>
                        <button onClick={() => submitMut.mutate(e.id)} className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">Submit</button>
                        <button onClick={() => { if (window.confirm('Delete this expense?')) deleteMut.mutate(e.id); }} className="text-[10px] px-2 py-0.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium">Del</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
              {(data || []).length === 0 && <tr><td colSpan={10} className="py-8 text-center text-gray-400">No expenses found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title="Add Expense Entry" onClose={() => setShowForm(false)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expense Date *"><input type="date" className={inputCls} value={form.expense_date} onChange={e => setForm(f => ({...f, expense_date: e.target.value}))} /></Field>
            <Field label="Amount *"><input type="number" className={inputCls} value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} /></Field>
            <div className="col-span-2"><Field label="Description *"><input className={inputCls} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} /></Field></div>
            <Field label="Cost Head (BOQ Budget)">
              <select className={inputCls} value={form.cost_head} onChange={e => setForm(f => ({...f, cost_head: e.target.value}))}>
                <option value="">— Select Head —</option>
                {COST_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select className={inputCls} value={form.category_id} onChange={e => setForm(f => ({...f, category_id: e.target.value}))}>
                <option value="">— Select —</option>
                {(categories || []).map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
              </select>
            </Field>
            <Field label="Custodian">
              <select className={inputCls} value={form.custodian_id} onChange={e => setForm(f => ({...f, custodian_id: e.target.value}))}>
                <option value="">— Select —</option>
                {(custodians || []).map(c => <option key={c.id} value={c.id}>{c.custodian_name}</option>)}
              </select>
            </Field>
            <Field label="Payment Mode">
              <select className={inputCls} value={form.payment_mode} onChange={e => setForm(f => ({...f, payment_mode: e.target.value}))}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option>
              </select>
            </Field>
            <Field label="Site Location"><input className={inputCls} value={form.site_location} onChange={e => setForm(f => ({...f, site_location: e.target.value}))} /></Field>
            <Field label="Bill / Voucher No"><input className={inputCls} value={form.bill_number} onChange={e => setForm(f => ({...f, bill_number: e.target.value}))} /></Field>
            <Field label="Vendor / Paid To"><input className={inputCls} value={form.vendor_name} onChange={e => setForm(f => ({...f, vendor_name: e.target.value}))} /></Field>
            <div className="col-span-2"><Field label="Remarks"><input className={inputCls} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} /></Field></div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
            <button onClick={() => { if (!form.expense_date || !form.description || !form.amount) return toast.error('Date, description, amount required'); createMut.mutate(form); }} disabled={createMut.isPending} className={btnPrimary}>Save Expense</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Approvals Tab ──────────────────────────────────────────────────────────────
function ApprovalsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['pc-pending'], queryFn: () => pettyCashAPI.pendingApprovals().then(r => r.data) });
  const [remarks, setRemarks] = useState({});
  const [amountMap, setAmountMap] = useState({});

  const invalidateAll = () => { qc.invalidateQueries({ queryKey: ['pc-pending'] }); qc.invalidateQueries({ queryKey: ['pc-requests'] }); qc.invalidateQueries({ queryKey: ['pc-expenses'] }); qc.invalidateQueries({ queryKey: ['pc-dashboard'] }); };
  const approveReqMut = useMutation({ mutationFn: ({ id, action, amount_approved }) => pettyCashAPI.approveRequest(id, { action, amount_approved, remarks: remarks[id] }), onSuccess: () => { toast.success('Request updated'); invalidateAll(); } });
  const approveExpMut = useMutation({ mutationFn: ({ id, action }) => pettyCashAPI.approveExpense(id, { action, remarks: remarks[id] }), onSuccess: () => { toast.success('Expense updated'); invalidateAll(); } });

  if (isLoading) return <div className="text-center py-8 text-gray-400">Loading…</div>;

  const requests = data?.requests || [];
  const expenses = data?.expenses || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">Pending Approvals</span>
        <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{requests.length + expenses.length}</span>
      </div>

      {requests.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-xs font-semibold text-amber-700">Cash Requests ({requests.length})</div>
          <div className="divide-y divide-gray-50">
            {requests.map(r => (
              <div key={r.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-semibold text-sm text-gray-800">{r.request_number}</span>
                    <span className={clsx('ml-2 text-[10px] px-2 py-0.5 rounded-full font-semibold', PRIORITY_COLORS[r.priority])}>{r.priority}</span>
                    <p className="text-xs text-gray-600 mt-0.5">{r.purpose}</p>
                    <p className="text-[11px] text-gray-400">{r.project_name} · {r.custodian_name} · Requested {fmtD(r.requested_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-800">{fmt(r.amount_requested)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="Approved amount" className={clsx(inputCls, 'w-36 text-xs')} value={amountMap[r.id] || r.amount_requested} onChange={e => setAmountMap(m => ({...m, [r.id]: e.target.value}))} />
                  <input placeholder="Remarks" className={clsx(inputCls, 'flex-1 text-xs')} value={remarks[r.id] || ''} onChange={e => setRemarks(m => ({...m, [r.id]: e.target.value}))} />
                  <button onClick={() => approveReqMut.mutate({ id: r.id, action: 'approve', amount_approved: amountMap[r.id] || r.amount_requested })} className="h-8 px-3 rounded-xl bg-green-600 text-white text-xs font-medium hover:bg-green-700 flex items-center gap-1"><CheckCircle size={12} />Approve</button>
                  <button onClick={() => { if (!remarks[r.id]) return toast.error('Provide rejection reason'); approveReqMut.mutate({ id: r.id, action: 'reject' }); }} className="h-8 px-3 rounded-xl bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 flex items-center gap-1"><XCircle size={12} />Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expenses.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-xs font-semibold text-blue-700">Expense Vouchers ({expenses.length})</div>
          <div className="divide-y divide-gray-50">
            {expenses.map(e => (
              <div key={e.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-semibold text-sm text-gray-800">{e.voucher_number}</span>
                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{e.category_name}</span>
                    <p className="text-xs text-gray-600 mt-0.5">{e.description}</p>
                    <p className="text-[11px] text-gray-400">{e.project_name} · {e.custodian_name} · {fmtD(e.expense_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-800">{fmt(e.amount)}</p>
                    {e.vendor_name && <p className="text-[11px] text-gray-400">{e.vendor_name}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input placeholder="Remarks" className={clsx(inputCls, 'flex-1 text-xs')} value={remarks[e.id] || ''} onChange={el => setRemarks(m => ({...m, [e.id]: el.target.value}))} />
                  <button onClick={() => approveExpMut.mutate({ id: e.id, action: 'approve' })} className="h-8 px-3 rounded-xl bg-green-600 text-white text-xs font-medium hover:bg-green-700 flex items-center gap-1"><CheckCircle size={12} />Approve</button>
                  <button onClick={() => { if (!remarks[e.id]) return toast.error('Provide rejection reason'); approveExpMut.mutate({ id: e.id, action: 'reject' }); }} className="h-8 px-3 rounded-xl bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 flex items-center gap-1"><XCircle size={12} />Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {requests.length === 0 && expenses.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle size={36} className="text-green-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">All caught up! No pending approvals.</p>
        </div>
      )}
    </div>
  );
}

// ── Settlements Tab ────────────────────────────────────────────────────────────
function SettlementsTab({ projectId, custodians, accounts }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const blankForm = { settlement_date: dayjs().format('YYYY-MM-DD'), period_from: '', period_to: '', custodian_id: '', account_id: '', opening_balance: '', total_issued: '', total_expenses: '', total_returned: '', remarks: '' };
  const [form, setForm] = useState(blankForm);

  const { data, isLoading } = useQuery({ queryKey: ['pc-settlements', projectId], queryFn: () => pettyCashAPI.settlements({ project_id: projectId || undefined }).then(r => r.data.data) });
  const createMut = useMutation({ mutationFn: d => pettyCashAPI.createSettlement({ ...d, project_id: projectId || undefined }), onSuccess: () => { toast.success('Settlement created'); qc.invalidateQueries({ queryKey: ['pc-settlements'] }); setShowForm(false); setForm(blankForm); } });
  const verifyMut = useMutation({ mutationFn: id => pettyCashAPI.verifySettlement(id, {}), onSuccess: () => { toast.success('Settlement verified'); qc.invalidateQueries({ queryKey: ['pc-settlements'] }); } });

  const closing = (Number(form.opening_balance)||0) + (Number(form.total_issued)||0) - (Number(form.total_expenses)||0) - (Number(form.total_returned)||0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className={btnPrimary}><PlusCircle size={14} className="inline mr-1" />New Settlement</button>
      </div>

      {isLoading ? <div className="text-center py-8 text-gray-400">Loading…</div> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>{['Settlement #','Date','Period','Custodian','Issued','Expenses','Returned','Variance','Status','Action'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data || []).map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-blue-600">{s.settlement_number}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtD(s.settlement_date)}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtD(s.period_from)} → {fmtD(s.period_to)}</td>
                  <td className="px-3 py-2">{s.custodian_name}</td>
                  <td className="px-3 py-2 text-right">{fmt(s.total_issued)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt(s.total_expenses)}</td>
                  <td className="px-3 py-2 text-right text-green-600">{fmt(s.total_returned)}</td>
                  <td className={clsx('px-3 py-2 text-right font-semibold', Number(s.variance) < 0 ? 'text-red-600' : 'text-green-600')}>{fmt(s.variance)}</td>
                  <td className="px-3 py-2"><Badge status={s.status} /></td>
                  <td className="px-3 py-2">
                    {s.status === 'draft' && <button onClick={() => verifyMut.mutate(s.id)} className="text-[10px] px-2 py-0.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium">Verify</button>}
                  </td>
                </tr>
              ))}
              {(data || []).length === 0 && <tr><td colSpan={10} className="py-8 text-center text-gray-400">No settlements yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title="New Settlement" onClose={() => setShowForm(false)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Settlement Date *"><input type="date" className={inputCls} value={form.settlement_date} onChange={e => setForm(f => ({...f, settlement_date: e.target.value}))} /></Field>
            <Field label="Custodian">
              <select className={inputCls} value={form.custodian_id} onChange={e => setForm(f => ({...f, custodian_id: e.target.value}))}>
                <option value="">— Select —</option>
                {(custodians||[]).map(c => <option key={c.id} value={c.id}>{c.custodian_name}</option>)}
              </select>
            </Field>
            <Field label="Period From"><input type="date" className={inputCls} value={form.period_from} onChange={e => setForm(f => ({...f, period_from: e.target.value}))} /></Field>
            <Field label="Period To"><input type="date" className={inputCls} value={form.period_to} onChange={e => setForm(f => ({...f, period_to: e.target.value}))} /></Field>
            <Field label="Opening Balance"><input type="number" className={inputCls} value={form.opening_balance} onChange={e => setForm(f => ({...f, opening_balance: e.target.value}))} /></Field>
            <Field label="Total Issued"><input type="number" className={inputCls} value={form.total_issued} onChange={e => setForm(f => ({...f, total_issued: e.target.value}))} /></Field>
            <Field label="Total Expenses"><input type="number" className={inputCls} value={form.total_expenses} onChange={e => setForm(f => ({...f, total_expenses: e.target.value}))} /></Field>
            <Field label="Total Returned"><input type="number" className={inputCls} value={form.total_returned} onChange={e => setForm(f => ({...f, total_returned: e.target.value}))} /></Field>
            <div className="col-span-2 flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2">
              <span className="text-xs text-gray-500">Calculated Closing Balance:</span>
              <span className={clsx('text-sm font-bold ml-auto', closing < 0 ? 'text-red-600' : 'text-green-700')}>{fmt(closing)}</span>
            </div>
            <div className="col-span-2"><Field label="Remarks"><input className={inputCls} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} /></Field></div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
            <button onClick={() => createMut.mutate(form)} disabled={createMut.isPending} className={btnPrimary}>Create Settlement</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Masters Tab ────────────────────────────────────────────────────────────────
function MastersTab({ projects }) {
  const qc = useQueryClient();
  const [section, setSection] = useState('accounts');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // row being edited
  const [topupRow, setTopupRow] = useState(null);
  const [topupAmt, setTopupAmt] = useState('');
  const [topupRmk, setTopupRmk] = useState('');
  const [form, setForm] = useState({});

  const { data: accounts }   = useQuery({ queryKey: ['pc-accounts'],   queryFn: () => pettyCashAPI.accounts().then(r => r.data) });
  const { data: custodians } = useQuery({ queryKey: ['pc-custodians'], queryFn: () => pettyCashAPI.custodians().then(r => r.data) });
  const { data: categories } = useQuery({ queryKey: ['pc-categories'], queryFn: () => pettyCashAPI.categories().then(r => r.data) });
  const { data: usersResp }  = useQuery({ queryKey: ['pc-users'],      queryFn: () => pettyCashAPI.users().then(r => r.data) });
  const users = usersResp?.data || [];

  const applyUserLink = userId => {
    if (!userId) { setForm(f => ({ ...f, user_id: '' })); return; }
    const u = users.find(x => x.id === userId);
    if (!u) return;
    setForm(f => ({
      ...f, user_id: userId,
      custodian_name: u.name || f.custodian_name,
      employee_code:  u.employee_code || f.employee_code,
      designation:    u.designation || u.department || f.designation,
      contact_number: u.phone || f.contact_number,
    }));
  };

  const inv = key => qc.invalidateQueries({ queryKey: [key] });

  const createAccount   = useMutation({ mutationFn: d => pettyCashAPI.createAccount(d),   onSuccess: () => { toast.success('Account created');  inv('pc-accounts');   setShowForm(false); setForm({}); } });
  const updateAccount   = useMutation({ mutationFn: d => pettyCashAPI.updateAccount(d.id, d), onSuccess: () => { toast.success('Account updated');  inv('pc-accounts');   setEditing(null); } });
  const topupAccount    = useMutation({ mutationFn: ({ id, amount, remarks }) => pettyCashAPI.topupAccount(id, { amount, remarks }), onSuccess: () => { toast.success('Balance added'); inv('pc-accounts'); inv('pc-dashboard'); setTopupRow(null); setTopupAmt(''); setTopupRmk(''); } });
  const createCustodian = useMutation({ mutationFn: d => pettyCashAPI.createCustodian(d), onSuccess: () => { toast.success('Custodian added');  inv('pc-custodians'); setShowForm(false); setForm({}); } });
  const updateCustodian = useMutation({ mutationFn: d => pettyCashAPI.updateCustodian(d.id, d), onSuccess: () => { toast.success('Custodian updated'); inv('pc-custodians'); setEditing(null); } });
  const createCategory  = useMutation({ mutationFn: d => pettyCashAPI.createCategory(d),  onSuccess: () => { toast.success('Category added');   inv('pc-categories'); setShowForm(false); setForm({}); } });
  const updateCategory  = useMutation({ mutationFn: d => pettyCashAPI.updateCategory(d.id, d), onSuccess: () => { toast.success('Category updated'); inv('pc-categories'); setEditing(null); } });
  const deactivateCat   = useMutation({ mutationFn: id => pettyCashAPI.updateCategory(id, { is_active: false }), onSuccess: () => { toast.success('Category deactivated'); inv('pc-categories'); } });

  const sections = [{ id: 'accounts', label: 'Cash Accounts' }, { id: 'custodians', label: 'Custodians' }, { id: 'categories', label: 'Categories' }];
  const addLabel = { accounts: 'Add Cash', custodians: 'Add Custodian', categories: 'Add Category' };

  const openEdit = row => { setEditing(row); setForm({ ...row }); };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-100 pb-2">
        {sections.map(s => (
          <button key={s.id} onClick={() => { setSection(s.id); setEditing(null); }} className={clsx('text-xs font-medium px-4 py-1.5 rounded-xl transition-colors', section === s.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
            {s.label}
          </button>
        ))}
        <div className="ml-auto">
          <button onClick={() => { setForm({}); setEditing(null); setShowForm(true); }} className={btnPrimary}><PlusCircle size={14} className="inline mr-1" />{addLabel[section]}</button>
        </div>
      </div>

      {/* ── Cash Accounts ── */}
      {section === 'accounts' && (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50"><tr>{['Account','Code','Project','Site','Balance','Limit','Custodian','Status','Actions'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {(accounts||[]).map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{a.account_name}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{a.account_code || '—'}</td>
                  <td className="px-3 py-2">{a.project_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{a.site_location || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700">{fmt(a.current_balance)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmt(a.credit_limit)}</td>
                  <td className="px-3 py-2">{a.custodian_name || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold cursor-pointer', a.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}
                      onClick={() => updateAccount.mutate({ id: a.id, status: a.status === 'active' ? 'inactive' : 'active' })}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => { setTopupRow(a); setTopupAmt(''); setTopupRmk(''); }} className="text-[10px] px-2 py-0.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium">+ Balance</button>
                      <button onClick={() => openEdit(a)} className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
              {(accounts||[]).length === 0 && <tr><td colSpan={9} className="py-8 text-center text-gray-400">No accounts. Add your first cash account.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Custodians ── */}
      {section === 'custodians' && (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50"><tr>{['Name','Code','Designation','Project','Site','Spending Limit','Holding','Status','Actions'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {(custodians||[]).map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">
                    {c.custodian_name}
                    {c.user_id
                      ? <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">Linked</span>
                      : <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 font-semibold">Manual</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-500">{c.employee_code || '—'}</td>
                  <td className="px-3 py-2">{c.designation || '—'}</td>
                  <td className="px-3 py-2">{c.project_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{c.site_location || '—'}</td>
                  <td className="px-3 py-2 text-right">{fmt(c.spending_limit)}</td>
                  <td className={clsx('px-3 py-2 text-right font-semibold', Number(c.current_holding) > 0 ? 'text-amber-600' : 'text-gray-400')}>{fmt(c.current_holding)}</td>
                  <td className="px-3 py-2">
                    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold cursor-pointer', c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}
                      onClick={() => updateCustodian.mutate({ id: c.id, status: c.status === 'active' ? 'inactive' : 'active' })}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => openEdit(c)} className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">Edit</button>
                  </td>
                </tr>
              ))}
              {(custodians||[]).length === 0 && <tr><td colSpan={9} className="py-8 text-center text-gray-400">No custodians yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Categories ── */}
      {section === 'categories' && (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50"><tr>{['Code','Category','Type','GL Account','Receipt Req.','Active','Actions'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {(categories||[]).map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-500">{c.category_code || '—'}</td>
                  <td className="px-3 py-2 font-medium">{c.category_name}</td>
                  <td className="px-3 py-2"><span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{c.construction_type || '—'}</span></td>
                  <td className="px-3 py-2 font-mono">{c.gl_account || '—'}</td>
                  <td className="px-3 py-2">{c.requires_receipt ? <CheckCircle size={12} className="text-green-600" /> : '—'}</td>
                  <td className="px-3 py-2">{c.is_active ? <CheckCircle size={12} className="text-green-600" /> : <XCircle size={12} className="text-gray-400" />}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(c)} className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">Edit</button>
                      {c.is_active && <button onClick={() => { if (window.confirm('Deactivate this category?')) deactivateCat.mutate(c.id); }} className="text-[10px] px-2 py-0.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium">Hide</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Cash Account modal ── */}
      {showForm && section === 'accounts' && (
        <Modal title="New Cash Account" onClose={() => setShowForm(false)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account Name *"><input className={inputCls} value={form.account_name||''} onChange={e => setForm(f => ({...f, account_name: e.target.value}))} /></Field>
            <Field label="Account Code"><input className={inputCls} value={form.account_code||''} onChange={e => setForm(f => ({...f, account_code: e.target.value}))} /></Field>
            <Field label="Project">
              <select className={inputCls} value={form.project_id||''} onChange={e => setForm(f => ({...f, project_id: e.target.value}))}>
                <option value="">— Select —</option>
                {(projects||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Site Location"><input className={inputCls} value={form.site_location||''} onChange={e => setForm(f => ({...f, site_location: e.target.value}))} /></Field>
            <Field label="Initial Balance"><input type="number" className={inputCls} value={form.initial_balance||''} onChange={e => setForm(f => ({...f, initial_balance: e.target.value}))} /></Field>
            <Field label="Credit Limit"><input type="number" className={inputCls} value={form.credit_limit||''} onChange={e => setForm(f => ({...f, credit_limit: e.target.value}))} /></Field>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
            <button onClick={() => { if (!form.account_name) return toast.error('Account name required'); createAccount.mutate(form); }} disabled={createAccount.isPending} className={btnPrimary}>Create Account</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Cash Account modal ── */}
      {editing && section === 'accounts' && (
        <Modal title={`Edit — ${editing.account_name}`} onClose={() => setEditing(null)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account Name *"><input className={inputCls} value={form.account_name||''} onChange={e => setForm(f => ({...f, account_name: e.target.value}))} /></Field>
            <Field label="Account Code"><input className={inputCls} value={form.account_code||''} onChange={e => setForm(f => ({...f, account_code: e.target.value}))} /></Field>
            <Field label="Site Location"><input className={inputCls} value={form.site_location||''} onChange={e => setForm(f => ({...f, site_location: e.target.value}))} /></Field>
            <Field label="Credit Limit"><input type="number" className={inputCls} value={form.credit_limit||''} onChange={e => setForm(f => ({...f, credit_limit: e.target.value}))} /></Field>
            <Field label="Custodian">
              <select className={inputCls} value={form.custodian_id||''} onChange={e => setForm(f => ({...f, custodian_id: e.target.value}))}>
                <option value="">— None —</option>
                {(custodians||[]).map(c => <option key={c.id} value={c.id}>{c.custodian_name}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
            <button onClick={() => updateAccount.mutate(form)} disabled={updateAccount.isPending} className={btnPrimary}>Save Changes</button>
          </div>
        </Modal>
      )}

      {/* ── Top-up Balance modal ── */}
      {topupRow && (
        <Modal title={`Add Balance — ${topupRow.account_name}`} onClose={() => setTopupRow(null)}>
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-green-50 rounded-xl px-4 py-2 text-xs">
              <span className="text-gray-600">Current Balance</span>
              <span className="font-bold text-green-700 text-base">{fmt(topupRow.current_balance)}</span>
            </div>
            <Field label="Amount to Add *"><input type="number" className={inputCls} value={topupAmt} onChange={e => setTopupAmt(e.target.value)} placeholder="5000" autoFocus /></Field>
            <Field label="Remarks"><input className={inputCls} value={topupRmk} onChange={e => setTopupRmk(e.target.value)} placeholder="Cash received from HO, cheque no…" /></Field>
            {topupAmt && <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-2 text-xs">
              <span className="text-gray-600">New Balance will be</span>
              <span className="font-bold text-blue-700 text-base">{fmt(Number(topupRow.current_balance) + Number(topupAmt))}</span>
            </div>}
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setTopupRow(null)} className={btnSecondary}>Cancel</button>
            <button onClick={() => { if (!topupAmt || Number(topupAmt) <= 0) return toast.error('Enter a valid amount'); topupAccount.mutate({ id: topupRow.id, amount: topupAmt, remarks: topupRmk }); }} disabled={topupAccount.isPending} className={btnPrimary}>Add Balance</button>
          </div>
        </Modal>
      )}

      {/* ── Add Custodian modal ── */}
      {showForm && section === 'custodians' && (
        <Modal title="New Custodian" onClose={() => setShowForm(false)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Link to Employee / User">
              <select className={inputCls} value={form.user_id||''} onChange={e => applyUserLink(e.target.value)}>
                <option value="">— Manual entry (no login) —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.designation ? ` — ${u.designation}` : ''}</option>)}
              </select>
            </Field>
            <div />
            <Field label="Name *"><input className={inputCls} value={form.custodian_name||''} onChange={e => setForm(f => ({...f, custodian_name: e.target.value}))} /></Field>
            <Field label="Employee Code"><input className={inputCls} value={form.employee_code||''} onChange={e => setForm(f => ({...f, employee_code: e.target.value}))} /></Field>
            <Field label="Designation"><input className={inputCls} value={form.designation||''} onChange={e => setForm(f => ({...f, designation: e.target.value}))} /></Field>
            <Field label="Contact Number"><input className={inputCls} value={form.contact_number||''} onChange={e => setForm(f => ({...f, contact_number: e.target.value}))} /></Field>
            <Field label="Project">
              <select className={inputCls} value={form.project_id||''} onChange={e => setForm(f => ({...f, project_id: e.target.value}))}>
                <option value="">— Select —</option>
                {(projects||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Site Location"><input className={inputCls} value={form.site_location||''} onChange={e => setForm(f => ({...f, site_location: e.target.value}))} /></Field>
            <Field label="Spending Limit"><input type="number" className={inputCls} value={form.spending_limit||''} onChange={e => setForm(f => ({...f, spending_limit: e.target.value}))} /></Field>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
            <button onClick={() => { if (!form.custodian_name) return toast.error('Name required'); createCustodian.mutate(form); }} disabled={createCustodian.isPending} className={btnPrimary}>Add Custodian</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Custodian modal ── */}
      {editing && section === 'custodians' && (
        <Modal title={`Edit — ${editing.custodian_name}`} onClose={() => setEditing(null)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Link to Employee / User">
              <select className={inputCls} value={form.user_id||''} onChange={e => applyUserLink(e.target.value)}>
                <option value="">— Manual entry (no login) —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.designation ? ` — ${u.designation}` : ''}</option>)}
              </select>
            </Field>
            <div />
            <Field label="Name *"><input className={inputCls} value={form.custodian_name||''} onChange={e => setForm(f => ({...f, custodian_name: e.target.value}))} /></Field>
            <Field label="Designation"><input className={inputCls} value={form.designation||''} onChange={e => setForm(f => ({...f, designation: e.target.value}))} /></Field>
            <Field label="Site Location"><input className={inputCls} value={form.site_location||''} onChange={e => setForm(f => ({...f, site_location: e.target.value}))} /></Field>
            <Field label="Spending Limit"><input type="number" className={inputCls} value={form.spending_limit||''} onChange={e => setForm(f => ({...f, spending_limit: e.target.value}))} /></Field>
            <Field label="Contact Number"><input className={inputCls} value={form.contact_number||''} onChange={e => setForm(f => ({...f, contact_number: e.target.value}))} /></Field>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
            <button onClick={() => updateCustodian.mutate(form)} disabled={updateCustodian.isPending} className={btnPrimary}>Save Changes</button>
          </div>
        </Modal>
      )}

      {/* ── Add Category modal ── */}
      {showForm && section === 'categories' && (
        <Modal title="New Category" onClose={() => setShowForm(false)}>
          <div className="space-y-3">
            <Field label="Category Name *"><input className={inputCls} value={form.category_name||''} onChange={e => setForm(f => ({...f, category_name: e.target.value}))} /></Field>
            <Field label="Category Code"><input className={inputCls} value={form.category_code||''} onChange={e => setForm(f => ({...f, category_code: e.target.value}))} /></Field>
            <Field label="Construction Type">
              <select className={inputCls} value={form.construction_type||''} onChange={e => setForm(f => ({...f, construction_type: e.target.value}))}>
                <option value="">— Select —</option>
                {['Labour','Material','Vehicle','Site','General'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="GL Account"><input className={inputCls} value={form.gl_account||''} onChange={e => setForm(f => ({...f, gl_account: e.target.value}))} /></Field>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.requires_receipt||false} onChange={e => setForm(f => ({...f, requires_receipt: e.target.checked}))} className="rounded" />
              Requires receipt / bill
            </label>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
            <button onClick={() => { if (!form.category_name) return toast.error('Category name required'); createCategory.mutate(form); }} disabled={createCategory.isPending} className={btnPrimary}>Add Category</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Category modal ── */}
      {editing && section === 'categories' && (
        <Modal title={`Edit — ${editing.category_name}`} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <Field label="Category Name *"><input className={inputCls} value={form.category_name||''} onChange={e => setForm(f => ({...f, category_name: e.target.value}))} /></Field>
            <Field label="Category Code"><input className={inputCls} value={form.category_code||''} onChange={e => setForm(f => ({...f, category_code: e.target.value}))} /></Field>
            <Field label="Construction Type">
              <select className={inputCls} value={form.construction_type||''} onChange={e => setForm(f => ({...f, construction_type: e.target.value}))}>
                <option value="">— Select —</option>
                {['Labour','Material','Vehicle','Site','General'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="GL Account"><input className={inputCls} value={form.gl_account||''} onChange={e => setForm(f => ({...f, gl_account: e.target.value}))} /></Field>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.requires_receipt||false} onChange={e => setForm(f => ({...f, requires_receipt: e.target.checked}))} className="rounded" />
              Requires receipt / bill
            </label>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
            <button onClick={() => updateCategory.mutate(form)} disabled={updateCategory.isPending} className={btnPrimary}>Save Changes</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── SC Advances Tab ─────────────────────────────────────────────────────────────
function ScAdvancesTab({ projectId, projects }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');
  const blank = {
    advance_date: dayjs().format('YYYY-MM-DD'),
    project_id: projectId || '',
    vendor_id: '', vendor_name: '',
    amount: '', wo_number: '',
    payment_mode: 'cash', reference_number: '', remarks: '',
  };
  const [form, setForm] = useState(blank);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['pc-sc-advances', projectId],
    queryFn: () => pettyCashAPI.scAdvances({ project_id: projectId || undefined }).then(r => r.data),
  });

  const { data: vendorData } = useQuery({
    queryKey: ['pc-sc-vendors', vendorSearch],
    queryFn: () => pettyCashAPI.scVendorLookup({ search: vendorSearch || undefined }).then(r => r.data),
    enabled: showForm,
  });
  const vendors = vendorData?.data || [];

  const createMut = useMutation({
    mutationFn: d => pettyCashAPI.createScAdvance(d),
    onSuccess: () => {
      toast.success('SC Advance recorded & linked to BOQ budget');
      qc.invalidateQueries({ queryKey: ['pc-sc-advances'] });
      qc.invalidateQueries({ queryKey: ['pc-dashboard'] });
      setShowForm(false); setForm(blank);
    },
    onError: e => toast.error(e.response?.data?.error || 'Save failed'),
  });

  const rows = listData?.data || [];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-4 text-xs text-gray-500">
          <span>Total advances: <strong className="text-gray-800">{rows.length}</strong></span>
          <span>Total amount: <strong className="text-orange-700">{fmt(total)}</strong></span>
        </div>
        <div className="ml-auto">
          <button onClick={() => setShowForm(true)} className={btnPrimary}>
            <PlusCircle size={14} className="inline mr-1" />New SC Advance
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 text-xs text-orange-700">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <span>Sub-contractor petty cash advances are automatically recorded in the Advance Tracker and appear under <strong>Sub Con</strong> cost in the BOQ Budget Breakdown.</span>
      </div>

      {/* List */}
      {isLoading ? <div className="text-center py-8 text-gray-400">Loading…</div> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>{['Voucher','Date','Sub-Contractor','Project','WO No.','Amount','Mode','Status'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-orange-600 font-semibold">{r.voucher_number}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtD(r.advance_date)}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.vendor_name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.project_name || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{r.wo_number || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-orange-700">{fmt(r.amount)}</td>
                  <td className="px-3 py-2 capitalize text-gray-500">{(r.payment_mode||'cash').replace('_',' ')}</td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold">{r.status}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400">No SC advances recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New SC Advance modal */}
      {showForm && (
        <Modal title="Record Sub-Contractor Advance (Petty Cash)" onClose={() => setShowForm(false)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <input type="date" className={inputCls} value={form.advance_date} onChange={e => setForm(f => ({...f, advance_date: e.target.value}))} />
            </Field>
            <Field label="Amount *">
              <input type="number" className={inputCls} value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} placeholder="0.00" />
            </Field>

            {/* Vendor search */}
            <div className="col-span-2">
              <Field label="Sub-Contractor *">
                <input
                  className={inputCls} placeholder="Type to search sub-contractor…"
                  value={vendorSearch || form.vendor_name}
                  onChange={e => { setVendorSearch(e.target.value); setForm(f => ({...f, vendor_id:'', vendor_name: e.target.value})); }}
                />
                {vendors.length > 0 && vendorSearch && (
                  <div className="mt-1 border border-gray-200 rounded-xl bg-white shadow-sm max-h-40 overflow-y-auto">
                    {vendors.map(v => (
                      <button key={v.id} type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 text-gray-700"
                        onClick={() => { setForm(f => ({...f, vendor_id: v.id, vendor_name: v.name})); setVendorSearch(''); }}>
                        {v.name} {v.vendor_code ? `(${v.vendor_code})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            </div>

            <Field label="Project">
              <select className={inputCls} value={form.project_id} onChange={e => setForm(f => ({...f, project_id: e.target.value}))}>
                <option value="">— Select —</option>
                {(projects||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Work Order No.">
              <input className={inputCls} value={form.wo_number} onChange={e => setForm(f => ({...f, wo_number: e.target.value}))} placeholder="e.g. WOLANLH10004" />
            </Field>

            <Field label="Payment Mode">
              <select className={inputCls} value={form.payment_mode} onChange={e => setForm(f => ({...f, payment_mode: e.target.value}))}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </Field>
            <Field label="Reference No.">
              <input className={inputCls} value={form.reference_number} onChange={e => setForm(f => ({...f, reference_number: e.target.value}))} placeholder="UPI ref / cheque no." />
            </Field>

            <div className="col-span-2">
              <Field label="Remarks">
                <input className={inputCls} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} />
              </Field>
            </div>
          </div>

          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700">
            <strong>Note:</strong> This will also create an entry in the Advance Tracker so it appears in BOQ Budget Breakdown under "Sub Con" cost head.
          </div>

          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
            <button
              onClick={() => {
                if (!form.vendor_name || !form.advance_date || !form.amount) return toast.error('Sub-contractor, date and amount are required');
                createMut.mutate(form);
              }}
              disabled={createMut.isPending}
              className={btnPrimary}
            >
              {createMut.isPending ? 'Saving…' : 'Record SC Advance'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Reports Tab ────────────────────────────────────────────────────────────────
function ReportsTab({ projectId }) {
  const [activeReport, setActiveReport] = useState('cash-book');
  const [rParams, setRParams] = useState({ from_date: dayjs().startOf('month').format('YYYY-MM-DD'), to_date: dayjs().format('YYYY-MM-DD') });

  const reportDefs = [
    { id: 'cash-book',         label: 'Cash Book',          fn: () => pettyCashAPI.cashBook({ ...rParams, project_id: projectId||undefined }) },
    { id: 'expense-register',  label: 'Expense Register',   fn: () => pettyCashAPI.expenseRegister({ ...rParams, project_id: projectId||undefined }) },
    { id: 'site-wise',         label: 'Site-wise',          fn: () => pettyCashAPI.siteWise(rParams) },
    { id: 'custodian-wise',    label: 'Custodian-wise',     fn: () => pettyCashAPI.custodianWise({ ...rParams, project_id: projectId||undefined }) },
    { id: 'category-wise',     label: 'Category-wise',      fn: () => pettyCashAPI.categoryWise({ ...rParams, project_id: projectId||undefined }) },
    { id: 'pending-settlement',label: 'Pending Settlement', fn: () => pettyCashAPI.pendingSettlement() },
    { id: 'audit-trail',       label: 'Audit Trail',        fn: () => pettyCashAPI.auditTrail(rParams) },
  ];

  const active = reportDefs.find(r => r.id === activeReport);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pc-report', activeReport, rParams, projectId],
    queryFn: () => active.fn().then(r => r.data.data),
    enabled: !!active,
  });

  const COLS = {
    'cash-book':          ['txn_date','txn_type','ref_number','description','category_name','debit','credit','running_balance'],
    'expense-register':   ['expense_date','voucher_number','category_name','description','vendor_name','custodian_name','amount','status'],
    'site-wise':          ['site_location','project_name','expense_count','total_amount','last_expense_date'],
    'custodian-wise':     ['custodian_name','designation','project_name','expense_count','total_expenses','spending_limit'],
    'category-wise':      ['category_name','construction_type','expense_count','total_amount','pct_of_total'],
    'pending-settlement': ['custodian_name','site_location','project_name','current_holding','unapproved_expenses','draft_amount','pending_amount'],
    'audit-trail':        ['performed_at','entity_type','action','old_status','new_status','remarks','performed_by_name'],
  };
  const cols = COLS[activeReport] || [];

  const fmtCell = (col, val) => {
    if (val == null) return '—';
    const moneyKeys = ['amount','total','debit','credit','running_balance','spending_limit','current_holding','draft_amount','pending_amount','total_expenses'];
    if (moneyKeys.some(k => col.includes(k))) return fmt(val);
    if (col === 'pct_of_total') return `${val}%`;
    if (['expense_date','txn_date','last_expense_date','performed_at'].includes(col)) return fmtD(val);
    return String(val);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {reportDefs.map(r => (
          <button key={r.id} onClick={() => setActiveReport(r.id)} className={clsx('text-xs font-medium px-3 py-1.5 rounded-xl transition-colors', activeReport === r.id ? 'bg-blue-600 text-white' : 'text-gray-600 border border-gray-200 hover:bg-gray-50')}>
            {r.label}
          </button>
        ))}
      </div>

      {activeReport !== 'pending-settlement' && (
        <div className="flex gap-2 items-center">
          <input type="date" className={clsx(inputCls, 'w-36')} value={rParams.from_date} onChange={e => setRParams(p => ({...p, from_date: e.target.value}))} />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" className={clsx(inputCls, 'w-36')} value={rParams.to_date} onChange={e => setRParams(p => ({...p, to_date: e.target.value}))} />
          <button onClick={() => refetch()} className={btnSecondary}><RefreshCw size={13} className="inline mr-1" />Refresh</button>
          <span className="text-xs text-gray-400 ml-auto">{(data||[]).length} rows</span>
        </div>
      )}

      {isLoading ? <div className="text-center py-8 text-gray-400">Loading report…</div> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>{cols.map(c => (
                <th key={c} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap capitalize">
                  {c.replace(/_/g, ' ')}
                </th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data||[]).map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {cols.map(c => (
                    <td key={c} className={clsx('px-3 py-2', ['amount','total','debit','credit','running_balance','spending_limit','current_holding'].some(k => c.includes(k)) ? 'text-right font-medium' : '')}>
                      {c === 'running_balance' ? (
                        <span className={clsx('font-semibold', Number(row[c]) < 0 ? 'text-red-600' : 'text-green-700')}>{fmt(row[c])}</span>
                      ) : fmtCell(c, row[c])}
                    </td>
                  ))}
                </tr>
              ))}
              {(data||[]).length === 0 && <tr><td colSpan={cols.length} className="py-8 text-center text-gray-400">No data for selected period</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Stores Petty Cash Tab ──────────────────────────────────────────────────────
function StoresPCTab({ projectId }) {
  const [search, setSearch] = useState('');
  const { data: resp, isLoading } = useQuery({
    queryKey: ['spc-entries-accounts', projectId],
    queryFn: () => storesPettyCashAPI.listEntries({ project_id: projectId || undefined, limit: 1000 })
      .then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const entries = (resp?.data ?? []).filter(e => e.status === 'Approved');
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      [e.supplier, e.invoice_no, e.project_name, e.approved_by_name].some(v => v?.toLowerCase().includes(q))
    );
  }, [entries, search]);

  const totalAmount = entries.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const totalGST    = entries.reduce((s, e) => s + parseFloat(e.gst_amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">Stores Petty Cash — Approved Entries</h2>
          <p className="text-xs text-gray-500 mt-0.5">Entries approved in the Stores Petty Cash Tracker · JV auto-posted on approval</p>
        </div>
        <a href="/stores/petty-cash" className="text-xs text-blue-600 hover:underline font-medium">Open Tracker →</a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard title="Approved Entries" value={entries.length} icon={CheckCircle} color="green" />
        <KpiCard title="Total Amount" value={fmt(totalAmount)} icon={IndianRupee} color="blue" />
        <KpiCard title="Total GST / ITC" value={fmt(totalGST)} icon={TrendingUp} color="purple" />
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="Search supplier, invoice, project…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wide">
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-left">Invoice</th>
                <th className="px-3 py-2 text-left">Project</th>
                <th className="px-3 py-2 text-right">Basic Amt</th>
                <th className="px-3 py-2 text-right">GST</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Approved By</th>
                <th className="px-3 py-2 text-left">JV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((e, i) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{e.sl_no || i + 1}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtD(e.entry_date)}</td>
                  <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px] truncate">{e.supplier}</td>
                  <td className="px-3 py-2 text-gray-500">{e.invoice_no || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{e.project_name || '—'}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(e.basic_amount || e.amount)}</td>
                  <td className="px-3 py-2 text-right text-purple-600">{fmt(e.gst_amount)}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(e.total_amount || e.amount)}</td>
                  <td className="px-3 py-2 text-gray-500">{e.approved_by_name || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                      <CheckCircle size={9} /> Posted
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="py-10 text-center text-gray-400">No approved entries found</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-bold text-gray-700">
                  <td colSpan={5} className="px-3 py-2">Total ({filtered.length} entries)</td>
                  <td className="px-3 py-2 text-right">{fmt(filtered.reduce((s, e) => s + parseFloat(e.basic_amount || e.amount || 0), 0))}</td>
                  <td className="px-3 py-2 text-right text-purple-600">{fmt(filtered.reduce((s, e) => s + parseFloat(e.gst_amount || 0), 0))}</td>
                  <td className="px-3 py-2 text-right text-green-700">{fmt(filtered.reduce((s, e) => s + parseFloat(e.total_amount || e.amount || 0), 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PettyCashPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [projectId, setProjectId] = useState('');
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-simple'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: custodians } = useQuery({ queryKey: ['pc-custodians'], queryFn: () => pettyCashAPI.custodians().then(r => r.data) });
  const { data: accounts }   = useQuery({ queryKey: ['pc-accounts'],   queryFn: () => pettyCashAPI.accounts().then(r => r.data) });
  const { data: categories } = useQuery({ queryKey: ['pc-categories'], queryFn: () => pettyCashAPI.categories().then(r => r.data) });

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
            <Wallet size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Petty Cash Management</h1>
            <p className="text-[11px] text-gray-500">Finance · Accounts</p>
          </div>
        </div>
        <div className="ml-auto">
          <select className={clsx(inputCls, 'w-48 text-xs')} value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All Projects</option>
            {(projects||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-1 bg-white rounded-2xl border border-gray-100 p-1 mb-5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={clsx(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap',
            activeTab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
          )}>
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        {activeTab === 'dashboard'   && <DashboardTab projectId={projectId} />}
        {activeTab === 'requests'    && <RequestsTab projectId={projectId} projects={projects} custodians={custodians} accounts={accounts} />}
        {activeTab === 'expenses'    && <ExpensesTab projectId={projectId} custodians={custodians} categories={categories} />}
        {activeTab === 'approvals'   && <ApprovalsTab />}
        {activeTab === 'settlements' && <SettlementsTab projectId={projectId} custodians={custodians} accounts={accounts} />}
        {activeTab === 'masters'     && <MastersTab projects={projects} />}
        {activeTab === 'reports'     && <ReportsTab projectId={projectId} />}
        {activeTab === 'stores-pc'   && <StoresPCTab projectId={projectId} />}
      </div>
    </div>
  );
}
