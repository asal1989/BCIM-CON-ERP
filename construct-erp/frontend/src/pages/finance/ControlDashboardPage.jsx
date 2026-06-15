import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, AlertTriangle, TrendingUp, Calculator, Search } from 'lucide-react';
import { budgetAPI, invoiceAPI, paymentAPI, projectAPI, raBillAPI, reportAPI } from '../../api/client';
import FinanceActionBar from '../../components/finance/FinanceActionBar';
import dayjs from 'dayjs';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Card({ label, value, sub, accent = 'indigo' }) {
  const colors = {
    indigo: 'border-indigo-100 bg-indigo-50 text-indigo-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
  };
  return (
    <div className={`rounded-[1.75rem] border p-5 shadow-sm bg-white ${colors[accent] || colors.indigo}`}>
      <div className="text-[10px] font-medium uppercase tracking-widest opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-medium font-mono tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-[11px] font-medium uppercase tracking-widest opacity-60">{sub}</div>}
    </div>
  );
}

export default function ControlDashboardPage() {
  const [selectedProject, setSelectedProject] = useState('all');
  const [search, setSearch] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['finance-control-projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []).catch(() => []),
  });

  const { data: projectPL = [] } = useQuery({
    queryKey: ['finance-control-pl'],
    queryFn: () => reportAPI.projectPL().then(r => r.data?.data || []).catch(() => []),
  });

  const { data: budgetsRaw = [] } = useQuery({
    queryKey: ['finance-control-budgets', selectedProject],
    queryFn: () => selectedProject === 'all'
      ? Promise.resolve([])
      : budgetAPI.list({ project_id: selectedProject }).then(r => r.data?.data || []).catch(() => []),
    enabled: selectedProject !== 'all',
  });

  const { data: raBills = [] } = useQuery({
    queryKey: ['finance-control-ra'],
    queryFn: () => raBillAPI.list({ limit: 500 }).then(r => r.data?.data || []).catch(() => []),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['finance-control-invoices'],
    queryFn: () => invoiceAPI.list({ status: 'pending' }).then(r => r.data?.data || []).catch(() => []),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['finance-control-payments'],
    queryFn: () => paymentAPI.list().then(r => r.data?.data || []).catch(() => []),
  });

  const projectRows = selectedProject === 'all' ? projectPL : projectPL.filter(p => p.id === selectedProject);
  const budgetRows = budgetsRaw || [];

  const filteredBudgetRows = useMemo(() => {
    if (!search) return budgetRows;
    const s = search.toLowerCase();
    return budgetRows.filter(r => String(r.cost_head || '').toLowerCase().includes(s));
  }, [budgetRows, search]);

  const totalBudget = filteredBudgetRows.reduce((s, b) => s + Number(b.budgeted_amount || 0), 0);
  const totalActual = filteredBudgetRows.reduce((s, b) => s + Number(b.actual_amount || 0), 0);
  const overrun = totalActual - totalBudget;
  const openRA = raBills.filter(b => !['paid', 'rejected'].includes(b.status)).length;
  const overdueInvoices = invoices.length;
  const recentPayments = payments.filter(p => p.payment_date && dayjs(p.payment_date).isAfter(dayjs().subtract(30, 'day'))).length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1500px] mx-auto bg-slate-50 min-h-screen text-[0.94rem]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-[1.25rem] md:text-[1.5rem] font-medium text-slate-900 uppercase tracking-tight italic">Control Dashboard</h1>
            <p className="text-[9px] text-slate-900 font-medium uppercase tracking-widest mt-1">Budget control, approvals and variance monitoring</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Budget Total" value={inr(totalBudget)} sub="Filtered project budget" accent="indigo" />
        <Card label="Actual Spend" value={inr(totalActual)} sub="Cost head actuals" accent="emerald" />
        <Card label="Variance" value={inr(Math.abs(overrun))} sub={overrun > 0 ? 'Overrun' : 'Saving'} accent={overrun > 0 ? 'rose' : 'amber'} />
        <Card label="Open Approvals" value={openRA + overdueInvoices} sub="RA bills + vendor invoices" accent="rose" />
      </div>

      <FinanceActionBar
        data={filteredBudgetRows}
        fileName="Control_Dashboard_Budget"
        search={search}
        onSearchChange={setSearch}
        projectId={selectedProject}
        onProjectChange={setSelectedProject}
        projectOptions={projects}
        showDateRange={false}
        searchPlaceholder="Search budget heads"
        onReset={() => {
          setSelectedProject('all');
          setSearch('');
        }}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-medium text-[0.88rem] text-slate-900 uppercase tracking-tight">Budget vs Actual</h2>
              <p className="text-[11px] text-slate-900 font-medium mt-1">Current selected project budget lines</p>
            </div>
            <Calculator className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Cost Head', 'Budget', 'Actual', 'Variance'].map(h => <th key={h} className="px-3 py-2.5 text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest text-left">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBudgetRows.map(row => {
                  const variance = Number(row.budgeted_amount || 0) - Number(row.actual_amount || 0);
                  return (
                    <tr key={row.id || row.cost_head} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.cost_head}</div>
                        <div className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-1">{row.remarks || 'Budget line'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">{inr(row.budgeted_amount)}</td>
                      <td className="px-4 py-3 font-mono text-slate-900 font-medium">{inr(row.actual_amount)}</td>
                      <td className={`px-4 py-3 font-mono font-medium ${variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{variance >= 0 ? '+' : '-'}{inr(Math.abs(variance))}</td>
                    </tr>
                  );
                })}
                {!filteredBudgetRows.length && <tr><td colSpan={4} className="py-12 text-center text-slate-900 font-medium text-xs font-medium uppercase tracking-widest">Select a project to view budget control</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-medium text-slate-900 uppercase tracking-tight">Control Summary</h2>
              <p className="text-xs text-slate-900 font-medium mt-1">Open finance items that need attention</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="p-5 grid grid-cols-1 gap-4">
            {projectRows.slice(0, 8).map(p => (
              <div key={p.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="font-medium text-slate-900">{p.project_name || p.name}</div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-[11px] font-medium uppercase tracking-widest text-slate-500">
                  <div>Billed<br /><span className="text-slate-900 text-sm font-medium normal-case">{inr(p.net_billed)}</span></div>
                  <div>Margin<br /><span className="text-slate-900 text-sm font-medium normal-case">{p.margin_pct || 0}%</span></div>
                  <div>Contract<br /><span className="text-slate-900 text-sm font-medium normal-case">{inr(p.contract_value)}</span></div>
                </div>
              </div>
            ))}
            {!projectRows.length && <div className="py-10 text-center text-slate-900 font-medium text-xs font-medium uppercase tracking-widest">No project summary available</div>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card label="Recent Payments" value={recentPayments} sub="Last 30 days" accent="emerald" />
        <Card label="Open RA Bills" value={openRA} sub="Awaiting completion" accent="amber" />
        <Card label="Pending Vendor Invoices" value={overdueInvoices} sub="Awaiting audit/authorization" accent="rose" />
      </div>
    </div>
  );
}
