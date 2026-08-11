import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BadgeCheck, CheckCircle2, Clock3, GitBranch, PlayCircle, Plus,
  RefreshCw, ShieldCheck, ToggleLeft, ToggleRight, XCircle,
} from 'lucide-react';
import { approvalEngineAPI } from '../../api/client';

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const MODULES = [
  'Procurement', 'Stores', 'Bill Tracker', 'Finance', 'Assets & IT',
  'DMS', 'Quality (QA/QC)', 'Planning', 'Administration',
];

const fmtMoney = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
}).format(Number(value || 0));

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value || 0}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function WorkflowCard({ workflow, onToggle }) {
  const enabled = workflow.is_enabled !== false;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-700">{workflow.module_name}</p>
          <h3 className="mt-1 text-base font-black text-slate-950">{workflow.name}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-600">{workflow.description || 'Approval workflow'}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(workflow.id, !enabled)}
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-black ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}
        >
          {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        {(workflow.steps || []).map((step) => (
          <div key={step.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-950 text-xs font-black text-white">
              {step.sequence_no}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{step.step_name}</p>
              <p className="text-[11px] font-bold text-slate-500">{step.approver_role || 'Any role'} / {step.approver_department || 'Any department'}</p>
            </div>
            <div className="text-right text-[11px] font-black text-slate-600">
              {Number(step.min_amount || 0) > 0 ? `From ${fmtMoney(step.min_amount)}` : 'All amounts'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstanceRow({ item, onAction }) {
  return (
    <tr className="border-b border-slate-200 align-top">
      <td className="px-3 py-3">
        <p className="font-black text-slate-950">{item.entity_number || item.entity_type}</p>
        <p className="text-xs font-semibold text-slate-500">{item.workflow_name}</p>
      </td>
      <td className="px-3 py-3">
        <p className="font-black text-slate-950">{item.title}</p>
        <p className="text-xs font-semibold text-slate-500">{item.project_name || 'No project'} / {item.module_name}</p>
      </td>
      <td className="px-3 py-3 text-right font-black text-slate-950">{fmtMoney(item.amount)}</td>
      <td className="px-3 py-3">
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">
          {item.step_name || item.status}
        </span>
        {item.approver_role && <p className="mt-1 text-[11px] font-bold text-slate-500">{item.approver_role}</p>}
      </td>
      <td className="px-3 py-3 text-right">
        {item.status === 'pending' ? (
          <div className="flex justify-end gap-2">
            <button onClick={() => onAction(item.id, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">
              Approve
            </button>
            <button onClick={() => onAction(item.id, 'rejected')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-black hover:bg-slate-50">
              Reject
            </button>
          </div>
        ) : (
          <span className="text-xs font-black uppercase text-slate-500">{item.status}</span>
        )}
      </td>
    </tr>
  );
}

const initialForm = {
  workflow_id: '',
  entity_type: 'manual_test',
  entity_number: '',
  title: '',
  amount: '',
};

export default function ApprovalEnginePage() {
  const [stats, setStats] = useState({});
  const [workflows, setWorkflows] = useState([]);
  const [instances, setInstances] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialForm);

  const enabledWorkflows = useMemo(() => workflows.filter((w) => w.is_enabled !== false), [workflows]);

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, wfRes, instRes] = await Promise.all([
        approvalEngineAPI.stats(),
        approvalEngineAPI.workflows(),
        approvalEngineAPI.instances({ status }),
      ]);
      setStats(statsRes.data?.data || {});
      setWorkflows(wfRes.data?.data || []);
      setInstances(instRes.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load approval engine');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const seedDefaults = async () => {
    try {
      await approvalEngineAPI.seedDefaults();
      toast.success('Default workflows are ready');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to seed workflows');
    }
  };

  const toggle = async (id, is_enabled) => {
    try {
      await approvalEngineAPI.toggle(id, { is_enabled });
      setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, is_enabled } : w)));
      toast.success(is_enabled ? 'Workflow turned ON' : 'Workflow turned OFF');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update workflow');
    }
  };

  const createInstance = async (e) => {
    e.preventDefault();
    try {
      await approvalEngineAPI.create({ ...form, amount: Number(form.amount || 0) });
      toast.success('Approval request created');
      setForm(initialForm);
      setShowCreate(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create approval request');
    }
  };

  const action = async (id, nextAction) => {
    const comments = window.prompt(nextAction === 'approved' ? 'Approval remarks' : 'Reason for rejection');
    if (comments === null) return;
    try {
      await approvalEngineAPI.action(id, { action: nextAction, comments });
      toast.success(nextAction === 'approved' ? 'Approved' : 'Rejected');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update approval');
    }
  };

  const setF = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-screen-2xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-white">
                <GitBranch className="h-7 w-7" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">Approval Control Center</p>
                <h1 className="text-2xl font-black text-slate-950">Approval Workflow Engine</h1>
                <p className="mt-1 text-sm font-semibold text-slate-600">Configure approval paths, control ON/OFF, and track pending decisions from one place.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-900 hover:bg-slate-50">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button onClick={seedDefaults} className="inline-flex items-center gap-2 rounded-xl bg-blue-950 px-4 py-3 text-sm font-black text-white hover:bg-blue-900">
                <PlayCircle className="h-4 w-4" /> Load Default Workflows
              </button>
              <button onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800">
                <Plus className="h-4 w-4" /> Test Approval
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={GitBranch} label="Workflows" value={stats.workflows} tone="bg-blue-50 text-blue-700" />
          <StatCard icon={ToggleRight} label="Enabled" value={stats.enabled} tone="bg-emerald-50 text-emerald-700" />
          <StatCard icon={Clock3} label="Pending" value={stats.pending} tone="bg-amber-50 text-amber-700" />
          <StatCard icon={CheckCircle2} label="Approved" value={stats.approved} tone="bg-green-50 text-green-700" />
          <StatCard icon={XCircle} label="Rejected" value={stats.rejected} tone="bg-slate-100 text-slate-700" />
        </div>

        {showCreate && (
          <form onSubmit={createInstance} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-5">
              <div>
                <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Workflow</label>
                <select value={form.workflow_id} onChange={(e) => setF('workflow_id', e.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-950">
                  <option value="">Select workflow</option>
                  {enabledWorkflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Reference No.</label>
                <input value={form.entity_number} onChange={(e) => setF('entity_number', e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-950" placeholder="PO/MR/Bill no." />
              </div>
              <div className="lg:col-span-2">
                <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Title</label>
                <input value={form.title} onChange={(e) => setF('title', e.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-950" placeholder="Approval request title" />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Amount</label>
                <input type="number" value={form.amount} onChange={(e) => setF('amount', e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-950" placeholder="0.00" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:bg-blue-800">Create Approval Request</button>
            </div>
          </form>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-slate-950">Workflow Setup</h2>
              <span className="text-xs font-black text-slate-500">{workflows.length} workflows</span>
            </div>
            {loading && workflows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">Loading workflows...</div>
            ) : workflows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <ShieldCheck className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-3 text-sm font-black text-slate-950">No workflows configured</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Click Load Default Workflows to create the first engine setup.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {workflows.map((workflow) => <WorkflowCard key={workflow.id} workflow={workflow} onToggle={toggle} />)}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-700">Approval Inbox</p>
                <h2 className="text-base font-black text-slate-950">Requests</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setStatus(tab.key)}
                    className={`rounded-lg px-3 py-2 text-xs font-black ${status === tab.key ? 'bg-blue-950 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs font-black uppercase tracking-[0.08em] text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Reference</th>
                    <th className="px-3 py-3">Details</th>
                    <th className="px-3 py-3 text-right">Amount</th>
                    <th className="px-3 py-3">Current Step</th>
                    <th className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((item) => <InstanceRow key={item.id} item={item} onAction={action} />)}
                  {!instances.length && (
                    <tr>
                      <td colSpan="5" className="px-3 py-10 text-center">
                        <BadgeCheck className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-2 text-sm font-black text-slate-700">No approval requests found</p>
                        <p className="text-xs font-semibold text-slate-500">When modules submit approvals to the engine, they will appear here.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-black text-blue-950">Next connection work</p>
          <p className="mt-1 text-sm font-semibold text-blue-900">
            This engine is ready as the common approval layer. The next step is connecting live PO, MRS, RFQ, Bill Tracker, Asset, DMS, and Quality submit/approve buttons to create and action these approval requests.
          </p>
        </div>
      </div>
    </div>
  );
}
