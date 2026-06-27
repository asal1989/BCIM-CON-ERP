// src/pages/stores/MRSPage.jsx
import RecordAttachments from '../../components/shared/RecordAttachments';
import MaterialCombobox from '../../components/shared/MaterialCombobox';
import SearchableSelect from '../../components/shared/SearchableSelect';
import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import {
  ClipboardList, Plus, X, CheckCircle, Clock, XCircle,
  Search, Printer, Download, CheckCircle2, ShieldCheck,
  UserCheck, Building2, Landmark, Check, Package,
  ChevronRight, AlertCircle, FileText, Trash2, Activity,
  ChevronDown, Tag, CalendarDays, Filter, Eye, Rows3,
  UserRound, Layers3, Send, ClipboardCheck, Settings, GripVertical, RefreshCw,
  ShoppingCart, Upload, Paperclip, History, Info, MapPin, RotateCcw, Pencil,
  ArrowDownUp, ArrowUp, ArrowDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { mrsAPI, projectAPI, inventoryAPI, vendorAPI, budgetAPI } from '../../api/client';
import VendorSelect from '../../components/shared/VendorSelect';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import toast from 'react-hot-toast';
import MRSPrintTemplate from './MRSPrintTemplate';
import { useReactToPrint } from 'react-to-print';

import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';
import { Z_INP, Z_CARD, Z_HEAD } from '../../constants/zohoStyles';
import ZField from '../../components/shared/ZField';
const DEFAULT_CATEGORIES = ['Masonry Works'];

const MR_TYPE_OPTIONS = ['New Purchase', 'Internal Transfer', 'Return to Store', 'Tool & Equipment'];
const COST_CENTER_OPTIONS = ['CC-Civil-Structural', 'CC-MEP', 'CC-Finishing', 'CC-Admin-General'];
const DELIVERY_LOCATION_OPTIONS = ['Site Store – Zone A', 'Site Store – Zone B', 'Container Office', 'Main Warehouse'];
const ITEM_CATEGORY_OPTIONS = ['Steel', 'Cement', 'Aggregate', 'Electrical', 'Plumbing', 'Finishing', 'Other'];
const MRS_DRAFT_KEY = 'mrs_new_request_draft';

const WIZARD_STEPS = ['Request Info', 'Material Items', 'Justification', 'Review & Submit'];

function WizardSteps({ step }) {
  return (
    <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white flex-shrink-0 overflow-x-auto">
      {WIZARD_STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className={clsx(
            'flex items-center gap-2 py-2.5 pr-5 text-xs font-semibold whitespace-nowrap relative',
            done ? 'text-emerald-600' : active ? 'text-blue-600' : 'text-slate-400'
          )}>
            <span className={clsx(
              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
              done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
            )}>
              {done ? <Check className="w-3 h-3" /> : n}
            </span>
            {label}
            {n < WIZARD_STEPS.length && <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-2" />}
          </div>
        );
      })}
    </div>
  );
}

const DEPARTMENT_OPTIONS = [
  { value: 'Projects', label: 'Projects' },
  { value: 'Civil', label: 'Civil' },
  { value: 'Structural', label: 'Structural' },
  { value: 'MEP', label: 'MEP (Mechanical/Electrical/Plumbing)' },
  { value: 'Electrical', label: 'Electrical' },
  { value: 'Plumbing', label: 'Plumbing' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'Finishing', label: 'Finishing' },
  { value: 'Safety', label: 'Safety / HSE' },
  { value: 'QA/QC', label: 'QA / QC' },
  { value: 'Procurement', label: 'Procurement' },
  { value: 'Stores', label: 'Stores' },
  { value: 'Site Office', label: 'Site Office' },
  { value: 'Admin', label: 'Admin' },
  { value: 'HR', label: 'HR' },
  { value: 'Finance', label: 'Finance' },
  { value: 'IT', label: 'IT' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Security', label: 'Security' },
  { value: 'Other', label: 'Other' },
];

const STATUS_CONFIG = {
  pending:         { label: 'Pending Store Manager', short: 'Pending',    color: 'bg-yellow-50 text-yellow-700 border-yellow-200',   dot: 'bg-yellow-500',  icon: Clock,       stage: 1 },
  stores_verified: { label: 'Store Manager Approved',short: 'Store Mgr',  color: 'bg-orange-50 text-orange-700 border-orange-200',   dot: 'bg-orange-500',  icon: Package,     stage: 2 },
  verified_tower:  { label: 'Legacy Tower Verified', short: 'Legacy',     color: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-500',    icon: UserCheck,   stage: 2 },
  approved_pm:     { label: 'Project Manager Approved', short: 'PM Appvd', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: ShieldCheck, stage: 3 },
  approved_srpm:   { label: 'Legacy Sr. PM Approved',short: 'Legacy',     color: 'bg-teal-50 text-teal-700 border-teal-200',         dot: 'bg-teal-500',    icon: CheckCircle2,stage: 3 },
  approved_mgmt:   { label: 'Project Director Approved', short: 'Director', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500',  icon: Building2,   stage: 4 },
  approved_md:     { label: 'Managing Director Approved', short: 'MD Appvd', color: 'bg-green-50 text-green-700 border-green-200',    dot: 'bg-green-500',   icon: Landmark,    stage: 5 },
  issued:          { label: 'Items Issued',          short: 'Issued',     color: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-500',     icon: CheckCircle, stage: 6 },
  rejected:        { label: 'Rejected',              short: 'Rejected',   color: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-400',     icon: XCircle,     stage: 0 },
};

const PO_STATUS_CONFIG = {
  pending:        { short: 'Pending',     color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  verified_audit: { short: 'Proc OK',     color: 'bg-blue-50 text-blue-700 border-blue-200' },
  released_mgmt:  { short: 'Proc OK',     color: 'bg-blue-50 text-blue-700 border-blue-200' },
  approved:       { short: 'Authorized',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  part_received:  { short: 'Part Rcvd',   color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  fully_received: { short: 'Received',    color: 'bg-green-50 text-green-700 border-green-200' },
  rejected:       { short: 'Rejected',    color: 'bg-red-50 text-red-700 border-red-200' },
};

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    emoji: '🟢', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: 'Medium', emoji: '🟡', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  high:   { label: 'High',   emoji: '🟠', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  urgent: { label: 'Urgent', emoji: '🔴', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
// Older records used a 3-value priority scheme — map them onto the new 4-value set for display
const PRIORITY_ALIAS = { normal: 'medium', critical: 'urgent' };
const normalizePriority = (p) => (PRIORITY_CONFIG[p] ? p : (PRIORITY_ALIAS[p] || 'medium'));

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap', cfg.color)}>
      <Icon size={11} strokeWidth={2.5} />
      {cfg.short}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[normalizePriority(priority)];
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border', cfg.cls)}>
      <span>{cfg.emoji}</span> {cfg.label}
    </span>
  );
}

/* ── Master stage definitions (mirrors backend ALL_STAGES) ─────────────── */
const ALL_STAGES = [
  { id: 'stores-approve', label: 'Stores Verification',  short: 'Stores',       color: 'bg-orange-500 hover:bg-orange-600',  btnLabel: '✓ Stores Verified',       status: 'pending'         },
  { id: 'verify-tower',   label: 'Tower Manager/Incharge', short: 'Tower Mgr',  color: 'bg-blue-600 hover:bg-blue-700',      btnLabel: '✓ Verify',                status: 'stores_verified' },
  { id: 'approve-pm',     label: 'Project Head',          short: 'Proj Head',   color: 'bg-emerald-600 hover:bg-emerald-700',btnLabel: '✓ Approve',               status: 'verified_tower'  },
  { id: 'approve-srpm',   label: 'Sr. Project Manager',   short: 'Sr. PM',      color: 'bg-teal-600 hover:bg-teal-700',      btnLabel: '✓ Approve',               status: 'approved_pm'     },
  { id: 'approve-mgmt',   label: 'Management Director',   short: 'Mgmt Dir',    color: 'bg-indigo-600 hover:bg-indigo-700',  btnLabel: '✓ Release',               status: 'approved_srpm'   },
  { id: 'approve-md',     label: 'Managing Director',     short: 'MD',          color: 'bg-green-700 hover:bg-green-800',    btnLabel: 'Authorize (MD)',                 status: 'approved_mgmt'   },
];

const ACTIVE_STAGES = [
  { id: 'stores-approve', label: 'Store Manager',      short: 'Store Mgr', color: 'bg-orange-500 hover:bg-orange-600',   btnLabel: 'Approve Store',    status: 'pending',        allowedRoles: ['stores_manager', 'store_keeper'] },
  { id: 'approve-pm',     label: 'Project Manager',    short: 'PM',        color: 'bg-emerald-600 hover:bg-emerald-700', btnLabel: 'Approve PM',       status: 'stores_verified', allowedRoles: ['project_manager', 'pm', 'project_head'] },
  { id: 'approve-mgmt',   label: 'Project Director',   short: 'Director',  color: 'bg-indigo-600 hover:bg-indigo-700',   btnLabel: 'Approve Director', status: 'approved_pm',    allowedRoles: ['project_head', 'director', 'project_director', 'management', 'management_director'] },
  { id: 'approve-md',     label: 'Managing Director',  short: 'MD',        color: 'bg-green-700 hover:bg-green-800',     btnLabel: 'Approve MD',       status: 'approved_mgmt',  allowedRoles: ['managing_director', 'md', 'ceo', 'admin', 'super_admin'] },
];

/* Given enabled stage IDs, compute what status each stage requires as input */
function buildStageActions(enabledIds) {
  const validIds = new Set(ACTIVE_STAGES.map(s => s.id));
  const normalizedIds = (enabledIds || []).filter(id => validIds.has(id));
  const ids = normalizedIds.length ? normalizedIds : ACTIVE_STAGES.map(s => s.id);
  const enabled = ACTIVE_STAGES.filter(s => ids.includes(s.id));
  return enabled.map((s, i) => ({
    ...s,
    requiredStatus: i === 0 ? 'pending' : enabled[i - 1].nextStatus || getNextStatus(enabled[i - 1].id),
  }));
}
const STAGE_NEXT = {
  'stores-approve': 'stores_verified',
  'verify-tower':   'verified_tower',
  'approve-pm':     'approved_pm',
  'approve-srpm':   'approved_srpm',
  'approve-mgmt':   'approved_mgmt',
  'approve-md':     'approved_md',
};
function getNextStatus(stageId) { return STAGE_NEXT[stageId]; }

/* ── Per-project MR numbering editor (prefix / shared pool / next number) ── */
function NumberingCell({ project }) {
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState(project.mrs_prefix || '');
  const [group, setGroup]   = useState(project.mrs_seq_group || '');
  const [start, setStart]   = useState(project.mrs_start_seq ?? '');
  const [saving, setSaving] = useState(false);
  const dirty =
    (prefix || '') !== (project.mrs_prefix || '') ||
    (group || '')  !== (project.mrs_seq_group || '') ||
    String(start ?? '') !== String(project.mrs_start_seq ?? '');
  const save = async () => {
    setSaving(true);
    try {
      await mrsAPI.saveNumbering(project.id, { mrs_prefix: prefix, mrs_seq_group: group, mrs_start_seq: start });
      toast.success('Numbering saved');
      qc.invalidateQueries({ queryKey: ['mrs-workflow-config'] });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to save numbering');
    } finally { setSaving(false); }
  };
  const previewSeq = String(Math.max(parseInt(start) || 0, 1)).padStart(3, '0');
  const previewPrefix = prefix || `BCIM-${project.project_code || 'PRJ'}-MR`;
  return (
    <div className="space-y-1.5 min-w-[200px]">
      <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="Prefix e.g. BCIM-DQS-BLR-MR"
        className="w-full text-[11px] border border-slate-200 rounded px-2 py-1 font-mono" />
      <div className="flex gap-1.5">
        <input value={group} onChange={e => setGroup(e.target.value)} placeholder="Shared pool (optional)"
          title="Projects with the same shared-pool name share one continuous number"
          className="flex-1 text-[11px] border border-slate-200 rounded px-2 py-1" />
        <input type="number" min="0" value={start} onChange={e => setStart(e.target.value)} placeholder="Next #"
          title="Next serial number to use (e.g. 53)"
          className="w-16 text-[11px] border border-slate-200 rounded px-2 py-1" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] text-slate-400 font-mono truncate" title={`${previewPrefix}-${previewSeq}`}>{previewPrefix}-{previewSeq}</span>
        <button onClick={save} disabled={saving || !dirty}
          className="text-[11px] font-semibold px-2.5 py-1 rounded bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/* ── WorkflowConfigModal ───────────────────────────────────────────────── */
function WorkflowConfigModal({ onClose }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(null);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['mrs-workflow-config'],
    queryFn: () => mrsAPI.getWorkflowConfig().then(r => r.data?.data ?? r.data ?? { projects: [], allStages: [] }),
    staleTime: 0,
  });

  const projects = cfg?.projects || (Array.isArray(cfg) ? cfg : []);
  const allStagesMeta = cfg?.allStages || ACTIVE_STAGES.map(s => ({ id: s.id, label: s.label }));

  const PRESETS = [
    { label: 'SM → PM → MD (3-stage)', stages: ['stores-approve', 'approve-pm', 'approve-md'] },
    { label: 'Full (SM → PM → Dir → MD)', stages: ['stores-approve', 'approve-pm', 'approve-mgmt', 'approve-md'] },
  ];

  const applyPreset = async (projectId, stages) => {
    setSaving(projectId);
    try {
      await mrsAPI.saveWorkflow(projectId, stages);
      toast.success('Workflow preset applied');
      qc.invalidateQueries({ queryKey: ['mrs-workflow-config'] });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to apply preset');
    } finally { setSaving(null); }
  };

  const toggleStage = async (projectId, currentStages, stageId) => {
    const updated = currentStages.includes(stageId)
      ? currentStages.filter(s => s !== stageId)
      : [...currentStages, stageId].sort((a, b) => ACTIVE_STAGES.findIndex(x => x.id === a) - ACTIVE_STAGES.findIndex(x => x.id === b));
    if (updated.length === 0) return toast.error('At least one stage required');
    setSaving(projectId);
    try {
      await mrsAPI.saveWorkflow(projectId, updated);
      toast.success('Workflow updated');
      qc.invalidateQueries({ queryKey: ['mrs-workflow-config'] });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to save');
    } finally { setSaving(null); }
  };

  const resetWorkflow = async (projectId) => {
    setSaving(projectId);
    try {
      await mrsAPI.saveWorkflow(projectId, null);
      toast.success('Reset to default workflow');
      qc.invalidateQueries({ queryKey: ['mrs-workflow-config'] });
    } catch (e) {
      toast.error('Failed');
    } finally { setSaving(null); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
          style={{ background: `linear-gradient(135deg, #1a3a6b 0%, #0f2347 100%)` }}>
          <div>
            <h2 className="font-bold text-white text-base flex items-center gap-2">
              <Settings size={16} className="opacity-70" /> MRS Workflow &amp; Numbering — Per Project
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Configure approval stages and the MR serial number (prefix, shared pool, next number) per project
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Stage legend */}
        <div className="flex-shrink-0 px-6 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex flex-wrap gap-2">
            {ACTIVE_STAGES.map((s, i) => (
              <span key={s.id} className="flex items-center gap-1 text-[10px] font-semibold bg-white border border-slate-200 rounded-full px-2 py-1">
                <span className="w-4 h-4 rounded-full bg-slate-700 text-white text-[9px] flex items-center justify-center font-bold">{i+1}</span>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Projects list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw size={18} className="animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Project</th>
                  <th className="text-left px-4 py-3">Approval Stages</th>
                  <th className="text-left px-4 py-3">MR Numbering</th>
                  <th className="px-4 py-3 text-right">Reset</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {projects.map(p => {
                  const enabledStages = p.stages || ACTIVE_STAGES.map(s => s.id);
                  const isCustom = p.is_custom;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{p.project_code}</p>
                        {isCustom && <span className="text-[10px] text-orange-600 font-bold">Custom workflow</span>}
                      </td>
                      <td className="px-4 py-3">
                        {/* Active stage toggles */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {ACTIVE_STAGES.map((s, idx) => {
                            const on = enabledStages.includes(s.id);
                            return (
                              <button key={s.id} onClick={() => toggleStage(p.id, enabledStages, s.id)}
                                disabled={saving === p.id}
                                title={`${on ? 'Remove' : 'Add'} "${s.label}"`}
                                className={clsx(
                                  'flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all',
                                  on
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'bg-white text-slate-400 border-slate-200 line-through opacity-50 hover:opacity-80'
                                )}>
                                <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] ${on ? 'bg-white/20' : 'bg-slate-200'}`}>{idx+1}</span>
                                {s.short}
                                {!on && <X size={8} />}
                              </button>
                            );
                          })}
                        </div>
                        {/* Preset buttons */}
                        <div className="flex flex-wrap gap-1">
                          {PRESETS.map(preset => (
                            <button key={preset.label}
                              onClick={() => applyPreset(p.id, preset.stages)}
                              disabled={saving === p.id}
                              className="text-[9px] px-2 py-0.5 rounded border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors font-medium">
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <NumberingCell project={p} />
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        {isCustom && (
                          <button onClick={() => resetWorkflow(p.id)} disabled={saving === p.id}
                            className="text-xs text-slate-400 hover:text-rose-600 transition border border-slate-200 rounded px-2 py-1">
                            Reset
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex-shrink-0 px-6 py-3 border-t bg-slate-50 flex justify-between items-center text-xs text-slate-500">
          <span>Click a stage to toggle it on/off for that project. Changes apply immediately to new approvals.</span>
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900">Done</button>
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-28 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-6 text-right">{value}</span>
    </div>
  );
}

export default function MRSPage() {
  const { user, selectedProjectId } = useAuthStore();
  const printRef   = useRef(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });
  const location = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [hasDraft, setHasDraft] = useState(() => {
    try { return !!localStorage.getItem(MRS_DRAFT_KEY); } catch { return false; }
  });
  const [selectedMRS, setSelectedMRS] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showWorkflowConfig, setShowWorkflowConfig] = useState(false);
  const [projectFilter, setProjectFilter] = useState(selectedProjectId || 'all');
  const [sortBy, setSortBy]   = useState('mrs');   // 'mrs' | 'required_by' | 'created_at'
  const [sortDir, setSortDir] = useState('desc');  // 'asc' | 'desc'
  const [items, setItems] = useState([{ material: '', qty: '', unit: 'Nos', purpose: '', item_code: '', category: '', est_rate: '', preferred_vendor_id: '' }]);
  const [attachments, setAttachments] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    project_id: '', department: 'Projects', head_office_project_name: '',
    site_incharge: '', required_by: '', priority: 'medium', remarks: '',
    request_date: dayjs().format('YYYY-MM-DD'), mr_type: 'New Purchase',
    wo_boq_reference: '', cost_center: '', delivery_location: '',
    requester_name: '', requester_employee_id: '', requester_contact: '', requester_email: '',
    justification: '', linked_activity: '', planned_usage_date: '', special_handling: '',
  });

  const qc = useQueryClient();

  const { data: mrsData } = useQuery({
    queryKey: ['mrs', user?.id, selectedProjectId || 'all'],
    queryFn: () => mrsAPI.list({ project_id: selectedProjectId || undefined }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!user?.id,
  });
  const { data: projectsData } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!user?.id,
  });
  const { data: detailedMRS } = useQuery({
    queryKey: ['mrs', user?.id, selectedMRS?.id],
    queryFn: () => mrsAPI.get(selectedMRS.id).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!user?.id && !!selectedMRS?.id,
  });

  // Auto-open MRS when navigated from Approvals dashboard
  useEffect(() => {
    const viewId = location.state?.viewId;
    if (!viewId || !mrsData?.length) return;
    const found = mrsData.find(m => m.id === viewId);
    if (found) {
      setSelectedMRS(found);
      window.history.replaceState({}, '');
    }
  }, [location.state, mrsData]);

  // Inventory lookup — for material name combobox & current stock check.
  // Scoped to the selected project so "Stock" reflects that project's store, not a mix of all projects.
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-lookup', formData.project_id],
    queryFn: () => inventoryAPI.itemsLookup({ project_id: formData.project_id || undefined }).then(r => r.data?.data ?? []),
    staleTime: 60 * 1000,
  });
  const { data: existingCategories = [] } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: () => inventoryAPI.categories().then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  // Vendors — for "Preferred Vendor" dropdown on each item row
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () => vendorAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 5 * 60 * 1000,
  });
  const vendorOptions = [
    { value: '', label: 'Auto-assign' },
    ...vendors.map(v => ({ value: v.id, label: v.name, sublabel: v.vendor_type || v.category })),
  ];

  // Budget summary for the selected project — drives "Budget Available" / "After This MR"
  const { data: budgetLines = [] } = useQuery({
    queryKey: ['mrs-budget', formData.project_id],
    queryFn: () => budgetAPI.list({ project_id: formData.project_id }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.project_id && showForm,
    staleTime: 60 * 1000,
  });
  const budgetAvailable = budgetLines.length
    ? budgetLines.reduce((sum, b) => sum + ((parseFloat(b.budgeted_amount) || 0) - (parseFloat(b.actual_amount) || 0)), 0)
    : null;

  // New Item modal state
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [newItemTargetIdx, setNewItemTargetIdx] = useState(null);
  const [newItemForm, setNewItemForm] = useState({ material_name: '', category: '', category_custom: '', unit: 'Nos' });
  const [categoryMode, setCategoryMode] = useState('select'); // 'select' | 'custom'

  const createMutation = useMutation({
    mutationFn: (d) => mrsAPI.create(d),
    onSuccess: () => {
      toast.success('MRS submitted for approval!');
      resetForm();
      qc.invalidateQueries({ queryKey: ['mrs', user?.id] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Submission failed'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, stage, data }) => mrsAPI.approve(id, stage, data),
    onSuccess: (_, { id }) => {
      toast.success('Status updated successfully');
      qc.invalidateQueries({ queryKey: ['mrs', user?.id] });
      qc.invalidateQueries({ queryKey: ['mrs', user?.id, id] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Action failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, remarks }) => mrsAPI.reject(id, { remarks }),
    onSuccess: () => {
      toast.success('MRS rejected');
      setSelectedMRS(null);
      qc.invalidateQueries({ queryKey: ['mrs', user?.id] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Action failed'),
  });

  const cancelItemsMutation = useMutation({
    mutationFn: ({ id, item_ids, reason }) => mrsAPI.cancelItems(id, { item_ids, reason }),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Item cancelled');
      qc.invalidateQueries({ queryKey: ['mrs', user?.id] });
      qc.invalidateQueries({ queryKey: ['mrs', user?.id, selectedMRS?.id] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Cancel failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => mrsAPI.delete(id),
    onSuccess: () => {
      toast.success('MRS deleted');
      qc.invalidateQueries({ queryKey: ['mrs', user?.id] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const resendMutation = useMutation({
    mutationFn: (id) => mrsAPI.resendNotify(id),
    onSuccess: (_, id) => toast.success('Notification emails resent to stores & procurement teams'),
    onError: (e) => toast.error(e?.response?.data?.error || 'Resend failed'),
  });

  function handleDelete(e, mrs) {
    e.stopPropagation(); // don't open the detail panel
    const label = mrs.serial_no_formatted || mrs.mrs_number;
    if (!window.confirm(`Delete MRS ${label}?\n\nThis cannot be undone.`)) return;
    deleteMutation.mutate(mrs.id);
  }

  function handleResendNotify(e, mrs) {
    e.stopPropagation();
    const label = mrs.serial_no_formatted || mrs.mrs_number;
    if (!window.confirm(`Resend notification emails for ${label} to stores & procurement teams?`)) return;
    resendMutation.mutate(mrs.id);
  }

  const addInventoryItemMutation = useMutation({
    mutationFn: (data) => inventoryAPI.create(data),
    onSuccess: (res, vars) => {
      toast.success(`"${vars.material_name}" added to store ledger`);
      qc.invalidateQueries({ queryKey: ['inventory-lookup'] });
      qc.invalidateQueries({ queryKey: ['inventory-categories'] });
      // Auto-fill the item row that triggered this
      if (newItemTargetIdx !== null) {
        const n = [...items];
        n[newItemTargetIdx].material = vars.material_name;
        n[newItemTargetIdx].unit = vars.unit || n[newItemTargetIdx].unit;
        setItems(n);
      }
      setShowNewItemModal(false);
      setNewItemForm({ material_name: '', category: '', category_custom: '', unit: 'Nos' });
      setCategoryMode('select');
      setNewItemTargetIdx(null);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to add item'),
  });

  const visibleProjects = projectsData ?? [];

  // ── Stock lookup helpers for the requisition item table ─────
  const stockOf = (materialName) => inventoryItems.find(i => i.material_name === materialName);
  const itemStockStatus = (materialName) => {
    const inv = stockOf(materialName);
    if (!inv) return null;
    const c = parseFloat(inv.closing_stock) || 0;
    const m = parseFloat(inv.min_stock) || 0;
    const r = parseFloat(inv.reorder_level) || 0;
    if (c <= 0) return { state: 'out', value: 0 };
    if ((m > 0 && c <= m) || (r > 0 && c <= r)) return { state: 'low', value: c };
    return { state: 'ok', value: c };
  };

  useEffect(() => {
    setProjectFilter(selectedProjectId || 'all');
  }, [selectedProjectId]);

  // Pre-fill requester info from the logged-in user when the form opens
  useEffect(() => {
    if (!showForm || formData.requester_name) return;
    setFormData(p => ({
      ...p,
      requester_name:        user?.name        || user?.email || '',
      requester_email:       user?.email       || '',
      requester_employee_id: user?.employee_code || '',
      requester_contact:     user?.phone        || '',
      department:            p.department       || user?.department || '',
    }));
  }, [showForm]);

  useEffect(() => {
    if (!showForm || formData.project_id || !visibleProjects.length) return;
    const defaultProjectId =
      (projectFilter !== 'all' ? projectFilter : null) ||
      selectedProjectId ||
      (visibleProjects.length === 1 ? visibleProjects[0].id : '');
    if (defaultProjectId) {
      const project = visibleProjects.find(p => p.id === defaultProjectId);
      setFormData(p => ({
        ...p,
        project_id: defaultProjectId,
        head_office_project_name: p.head_office_project_name || project?.name || p.head_office_project_name,
      }));
    }
  }, [showForm, formData.project_id, projectFilter, selectedProjectId, visibleProjects]);

  // Client-side project filter — dropdown narrows the already-fetched dataset
  const rawMRS  = mrsData ?? [];
  const allMRS  = projectFilter !== 'all'
    ? rawMRS.filter(m => m.project_id === projectFilter)
    : rawMRS;

  const statusGroups = {
    stores_verified: ['stores_verified', 'verified_tower'],
    approved_pm: ['approved_pm', 'approved_srpm'],
  };

  const filtered = allMRS.filter(m => {
    if (statusFilter !== 'all') {
      const allowed = statusGroups[statusFilter] || [statusFilter];
      if (!allowed.includes(m.status)) return false;
    }
    const needle = search.toLowerCase();
    const itemText = (m.items || []).map(i => i.material_name || i.material || '').join(' ');
    if (search && ![
      m.mrs_number,
      m.serial_no_formatted,
      m.project_name,
      m.project_code,
      m.department,
      m.raised_by_name,
      itemText,
    ].some(v => String(v || '').toLowerCase().includes(needle))) return false;
    return true;
  });

  // Stable, predictable ordering. Serial sequence is reliable even when
  // created_at timestamps are inconsistent, so it is the default sort key.
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'mrs') {
      const sa = a.serial_no_formatted || a.mrs_number || '';
      const sb = b.serial_no_formatted || b.mrs_number || '';
      return dir * sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
    }
    const key = sortBy === 'required_by' ? 'required_by' : 'created_at';
    const ta = a[key] ? new Date(a[key]).getTime() : 0;
    const tb = b[key] ? new Date(b[key]).getTime() : 0;
    return dir * (ta - tb);
  });

  const exportToCSV = () => {
    const headers = ['Serial No', 'Project', 'Department', 'Required By', 'Status', 'Date', 'Requested By'];
    const rows = sorted.map(m => [
      m.serial_no_formatted || m.mrs_number, m.project_name, m.department,
      dayjs(m.required_by).format('DD-MM-YYYY'), m.status,
      dayjs(m.request_date || m.created_at).format('DD-MM-YYYY'), m.raised_by_name,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `MRS_Log_${dayjs().format('YYYY-MM-DD')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Exporting MRS log…');
  };

  // Build stage actions dynamically from the selected MRS's project workflow
  const projectWorkflowStages = detailedMRS?.mrs_workflow?.stages || ACTIVE_STAGES.map(s => s.id);
  const enabledStages = ACTIVE_STAGES.filter(s => projectWorkflowStages.includes(s.id));
  // Compute requiredStatus for each stage based on project chain
  const stageActions = enabledStages.map((s, i) => ({
    ...s,
    status: i === 0 ? 'pending' : STAGE_NEXT[enabledStages[i - 1].id],
  }));

  const liveStatus = detailedMRS?.status ?? selectedMRS?.status;
  const actionableStatus =
    liveStatus === 'verified_tower' ? 'stores_verified' :
    liveStatus === 'approved_srpm' ? 'approved_pm' :
    liveStatus;
  const currentAction = stageActions.find(a => a.status === actionableStatus);

  // Role gate — only the designated role sees Approve/Reject buttons
  const userRoleLower = (user?.role || '').toLowerCase();
  const isGlobalAdmin = ['admin', 'super_admin'].includes(userRoleLower);
  const canActOnCurrent = isGlobalAdmin ||
    (currentAction ? (currentAction.allowedRoles || []).includes(userRoleLower) : false);

  const stats = [
    { key: 'pending',     label: 'Pending',     icon: Clock,       color: 'amber'   },
    { key: 'approved_pm', label: 'PM Approved', icon: ShieldCheck, color: 'emerald' },
    { key: 'approved_md', label: 'Authorized',  icon: Landmark,    color: 'blue'    },
    { key: 'issued',      label: 'Issued',      icon: CheckCircle, color: 'orange'  },
  ];

  const statusTabs = [
    ['all',             'All',         allMRS.length],
    ['pending',         'Pending',     allMRS.filter(m => m.status === 'pending').length],
    ['stores_verified', 'Store Manager', allMRS.filter(m => ['stores_verified', 'verified_tower'].includes(m.status)).length],
    ['approved_pm',     'Project Manager', allMRS.filter(m => ['approved_pm', 'approved_srpm'].includes(m.status)).length],
    ['approved_mgmt',   'Project Director', allMRS.filter(m => m.status === 'approved_mgmt').length],
    ['approved_md',     'Managing Director', allMRS.filter(m => m.status === 'approved_md').length],
    ['issued',          'Issued',      allMRS.filter(m => m.status === 'issued').length],
    ['rejected',        'Rejected',    allMRS.filter(m => m.status === 'rejected').length],
  ];

  const totalRequestedItems = allMRS.reduce((sum, m) => sum + (m.items?.length || 0), 0);
  const urgentCount = allMRS.filter(m => ['urgent', 'critical'].includes(m.priority)).length;
  const now = dayjs();
  const mrsThisMonth  = allMRS.filter(m => dayjs(m.created_at).isSame(now, 'month'));
  const pendingCount  = allMRS.filter(m => m.status === 'pending').length;
  const inPipelineCount = allMRS.filter(m => ['stores_verified', 'verified_tower', 'approved_pm', 'approved_srpm', 'approved_mgmt'].includes(m.status)).length;
  const authorizedCount = allMRS.filter(m => m.status === 'approved_md').length;
  const issuedCount   = allMRS.filter(m => m.status === 'issued').length;
  const rejectedCount = allMRS.filter(m => m.status === 'rejected').length;
  const storesManagerCount = allMRS.filter(m => ['stores_verified', 'verified_tower'].includes(m.status)).length;
  const approvedPmCount    = allMRS.filter(m => ['approved_pm', 'approved_srpm'].includes(m.status)).length;
  const approvedMgmtCount  = allMRS.filter(m => m.status === 'approved_mgmt').length;

  const resetForm = () => {
    setShowForm(false);
    setStep(1);
    setItems([{ material: '', qty: '', unit: 'Nos', purpose: '', item_code: '', category: '', est_rate: '', preferred_vendor_id: '' }]);
    setFormData({
      project_id: '', department: 'Projects', head_office_project_name: '',
      site_incharge: '', required_by: '', priority: 'medium', remarks: '',
      request_date: dayjs().format('YYYY-MM-DD'), mr_type: 'New Purchase',
      wo_boq_reference: '', cost_center: '', delivery_location: '',
      requester_name: '', requester_employee_id: '', requester_contact: '', requester_email: '',
      justification: '', linked_activity: '', planned_usage_date: '', special_handling: '',
    });
    setAttachments([]);
    setDragOver(false);
  };

  // Step-by-step validation, mirrors required (*) fields in the mockup
  const STEP_VALIDATORS = {
    1: () => {
      if (!formData.project_id) return 'Please select a Project / Site';
      if (!formData.required_by) return 'Please enter the Required By date';
      if (!formData.mr_type) return 'Please select an MR Type';
      if (!formData.requester_name) return 'Please enter the Requester Name';
      if (!formData.department) return 'Please select a Department';
      return null;
    },
    2: () => {
      if (items.every(i => !i.material || !i.qty)) return 'Please add at least one material item with quantity';
      return null;
    },
    3: () => {
      if (!formData.justification?.trim()) return 'Please enter a Reason / Justification';
      return null;
    },
  };

  const goNext = () => {
    const err = STEP_VALIDATORS[step]?.();
    if (err) return toast.error(err);
    setStep(s => Math.min(s + 1, WIZARD_STEPS.length));
  };
  const goBack = () => setStep(s => Math.max(s - 1, 1));

  const saveDraft = () => {
    try {
      localStorage.setItem(MRS_DRAFT_KEY, JSON.stringify({ formData, items, savedAt: Date.now() }));
      setHasDraft(true);
      toast.success('Draft saved locally');
    } catch {
      toast.error('Could not save draft');
    }
  };

  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(MRS_DRAFT_KEY);
      if (!raw) { setHasDraft(false); return toast.error('No saved draft found'); }
      const { formData: fd, items: it } = JSON.parse(raw);
      if (fd) setFormData(d => ({ ...d, ...fd }));
      if (it?.length) setItems(it);
      toast.success('Draft restored');
    } catch {
      toast.error('Could not restore draft');
    }
  };

  const discardDraft = () => {
    try { localStorage.removeItem(MRS_DRAFT_KEY); } catch {}
    setHasDraft(false);
    toast.success('Draft discarded');
  };

  const handleSubmit = () => {
    for (const n of [1, 2, 3]) {
      const err = STEP_VALIDATORS[n]?.();
      if (err) { setStep(n); return toast.error(err); }
    }
    createMutation.mutate({
      ...formData,
      items: items.filter(i => i.material && i.qty),
      required_by: dayjs(formData.required_by).format('YYYY-MM-DD'),
      planned_usage_date: formData.planned_usage_date ? dayjs(formData.planned_usage_date).format('YYYY-MM-DD') : null,
    });
    localStorage.removeItem(MRS_DRAFT_KEY);
    setHasDraft(false);
  };

  const [showMDModal, setShowMDModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Only the Managing Director may edit MRS header/item details directly
  const canEditMRS = ['managing_director', 'super_admin'].includes(userRoleLower);
  const updateMRSMutation = useMutation({
    mutationFn: ({ id, data }) => mrsAPI.update(id, data),
    onSuccess: () => {
      toast.success('Material Requisition updated');
      qc.invalidateQueries({ queryKey: ['mrs'] });
      qc.invalidateQueries({ queryKey: ['mrs', user?.id, selectedMRS?.id] });
      setShowEditModal(false);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  // MD / Procurement may cancel individual items on a fully-approved MR
  const canCancelItems = liveStatus === 'approved_md' &&
    ['managing_director', 'md', 'ceo', 'procurement_manager', 'procurement', 'admin', 'super_admin'].includes(userRoleLower);
  const handleCancelItem = (it) => {
    if (!it.id) return;
    const reason = window.prompt(`Cancel "${it.material_name || it.material}" from this approved MR?\n\nThis excludes it from PO raising (kept for audit). Optional reason:`, '');
    if (reason === null) return; // prompt dismissed
    cancelItemsMutation.mutate({ id: selectedMRS.id, item_ids: [it.id], reason: reason || null });
  };

  // Admin / PM / Stores may correct an MR's serial number (e.g. a stray -001 → -053)
  const canRenumber = ['admin', 'super_admin', 'managing_director', 'md', 'procurement_manager',
    'procurement', 'project_manager', 'pm', 'stores_manager', 'store_keeper'].includes(userRoleLower);
  const renumberMutation = useMutation({
    mutationFn: ({ id, serial }) => mrsAPI.renumber(id, serial),
    onSuccess: (_d, v) => {
      toast.success('Serial number updated');
      setSelectedMRS(s => (s ? { ...s, serial_no_formatted: v.serial, mrs_number: v.serial } : s));
      qc.invalidateQueries({ queryKey: ['mrs'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to update serial'),
  });
  const handleRenumber = () => {
    const cur = selectedMRS.serial_no_formatted || selectedMRS.mrs_number || '';
    const next = window.prompt('Edit MR serial number:', cur);
    if (next == null) return;
    const v = next.trim();
    if (!v || v === cur) return;
    renumberMutation.mutate({ id: selectedMRS.id, serial: v });
  };

  if (selectedMRS) {
    const detailItems = detailedMRS?.items || selectedMRS.items || [];
    return (
      <div className="mrs-detail-screen fixed inset-0 z-50 bg-[#f4f6f9] flex flex-col">
        <div className="mrs-screen-ui bg-white border-b border-slate-200 px-5 md:px-8 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedMRS(null)}
              className="h-9 px-3 rounded-lg border border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-indigo-700 hover:border-indigo-300 transition-all"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back
            </button>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-lg font-bold text-slate-950 font-mono">{selectedMRS.serial_no_formatted || selectedMRS.mrs_number}</p>
                {canRenumber && (
                  <button onClick={handleRenumber} disabled={renumberMutation.isPending} title="Edit serial number"
                    className="text-[10px] font-semibold text-slate-400 hover:text-blue-600 border border-slate-200 hover:border-blue-300 rounded px-1.5 py-0.5 transition">
                    Edit #
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">Material Requisition • {dayjs(selectedMRS.request_date || selectedMRS.created_at).format('DD-MM-YYYY')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={liveStatus} />
            {canEditMRS && (
              <button
                onClick={() => setShowEditModal(true)}
                disabled={!detailedMRS}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-40 transition-all"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit MRS
              </button>
            )}
            <button
              onClick={() => handlePrint()}
              disabled={!detailedMRS}
              className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:border-indigo-300 disabled:opacity-40 transition-all"
            >
              <Printer className="w-3.5 h-3.5" /> {!detailedMRS ? 'Loading' : 'Print'}
            </button>
            <button
              onClick={() => setSelectedMRS(null)}
              className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:text-red-600 hover:border-red-200 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mrs-screen-ui flex-1 overflow-y-auto">
          <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 xl:p-8 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
              {[
                ['Project', selectedMRS.project_name],
                ['Department', selectedMRS.department || 'Projects'],
                ['Project Code', selectedMRS.project_code || '-'],
                ['Site Incharge', selectedMRS.site_incharge || '-'],
                ['Required By', selectedMRS.required_by ? dayjs(selectedMRS.required_by).format('DD-MM-YYYY') : '-'],
                ['Raised By', selectedMRS.raised_by_name || '-'],
              ].map(([label, value]) => (
                <div key={label} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                  <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-sm font-semibold text-slate-900 truncate">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Material Items</span>
                  <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                    {detailItems.length} items
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-white">
                        {['#', 'Material', 'Unit', 'Requested Qty', liveStatus === 'approved_md' ? 'MD Approved Qty' : null, 'PO Raised', 'Balance', 'Purpose', canCancelItems ? 'Action' : null].filter(Boolean).map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailItems.map((it, i) => {
                        const excluded = it.effective_included === false || it.md_included === false;
                        const reqQty = Number(it.effective_qty ?? it.md_approved_qty ?? it.quantity ?? it.qty ?? 0);
                        const orderedQty = Number(it.ordered_qty || 0);
                        const balanceQty = Math.max(reqQty - orderedQty, 0);
                        return (
                          <tr key={i} className={clsx('hover:bg-slate-50', excluded && 'opacity-40 line-through')}>
                            <td className="px-4 py-3 text-xs font-mono text-slate-500">{i + 1}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {it.material_name || it.material}
                              {excluded && <span className="ml-2 text-[10px] font-bold text-red-500 no-underline">(excluded by MD)</span>}
                            </td>
                            <td className="px-4 py-3"><span className="px-2 py-1 rounded bg-slate-100 text-xs font-semibold">{it.unit}</span></td>
                            <td className="px-4 py-3 font-bold text-indigo-700">{it.quantity || it.qty}</td>
                            {liveStatus === 'approved_md' && (
                              <td className="px-4 py-3 font-bold text-green-700">
                                {excluded ? '—' : (it.md_approved_qty ?? it.quantity ?? it.qty)}
                              </td>
                            )}
                            <td className="px-4 py-3">
                              {orderedQty > 0
                                ? <span className="font-bold text-purple-700">{orderedQty}</span>
                                : <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {excluded ? '—' : (
                                orderedQty > 0
                                  ? <span className={clsx('font-bold', balanceQty > 0 ? 'text-orange-600' : 'text-emerald-600')}>{balanceQty}</span>
                                  : <span className="text-slate-400">{reqQty}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{it.purpose || '-'}</td>
                            {canCancelItems && (
                              <td className="px-4 py-3">
                                {excluded ? (
                                  <span className="text-[10px] text-slate-400 no-underline" title={it.cancel_reason || ''}>Cancelled</span>
                                ) : (
                                  <button
                                    onClick={() => handleCancelItem(it)}
                                    disabled={cancelItemsMutation.isPending}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                                    title="Cancel this item (exclude from PO raising)">
                                    <XCircle className="w-3.5 h-3.5" /> Cancel
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-5">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Linked Purchase Orders</span>
                    {detailedMRS?.linked_pos?.length > 0 && (
                      <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                        {detailedMRS.linked_pos.length}
                      </span>
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    {!detailedMRS ? (
                      <p className="text-xs text-slate-400">Loading…</p>
                    ) : detailedMRS.linked_pos?.length ? (
                      detailedMRS.linked_pos.map(po => {
                        const cfg = PO_STATUS_CONFIG[po.status] || PO_STATUS_CONFIG.pending;
                        const poLabel = po.po_ref_no || po.po_number || po.serial_no_formatted || 'PO';
                        return (
                          <Link
                            key={po.id}
                            to="/procurement/po"
                            state={{ searchPO: poLabel }}
                            className="block border border-slate-200 rounded-lg p-3 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold font-mono text-indigo-700">{poLabel}</span>
                              <span className={clsx('text-[10px] px-2 py-0.5 rounded-full border font-semibold', cfg.color)}>
                                {cfg.short}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1.5 text-xs text-slate-500">
                              <span className="truncate">{po.vendor_name || '-'}</span>
                              <span className="font-semibold text-slate-700">₹{Number(po.grand_total || 0).toLocaleString('en-IN')}</span>
                            </div>
                            {po.po_date && (
                              <div className="text-[11px] text-slate-400 mt-1">{dayjs(po.po_date).format('DD-MM-YYYY')}</div>
                            )}
                          </Link>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-400">No purchase order raised yet for this MRS.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Approval Pipeline</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {stageActions.map((stage, idx) => {
                      const currentStage = (STATUS_CONFIG[liveStatus] || STATUS_CONFIG.pending).stage;
                      const isDone = currentStage > idx + 1;
                      const isActive = currentStage === idx + 1;
                      return (
                        <div key={stage.id} className="flex items-center gap-3">
                          <div className={clsx(
                            'w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold',
                            isDone ? 'bg-emerald-500 border-emerald-500 text-white' :
                              isActive ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500'
                          )}>
                            {isDone ? <Check className="w-3.5 h-3.5" /> : idx + 2}
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-800">{stage.label}</p>
                          </div>
                          {isDone && <span className="text-xs font-semibold text-emerald-600">Done</span>}
                          {isActive && <span className="text-xs font-semibold text-indigo-600">Pending</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {currentAction && (
                  <div className={`rounded-xl p-4 space-y-3 shadow-sm border ${
                    currentAction.id === 'stores-approve'
                      ? 'bg-orange-50 border-orange-200'
                      : canActOnCurrent ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        currentAction.id === 'stores-approve'
                          ? 'bg-orange-100 border border-orange-200'
                          : canActOnCurrent ? 'bg-emerald-100 border border-emerald-200' : 'bg-slate-100 border border-slate-200'
                      }`}>
                        {currentAction.id === 'stores-approve'
                          ? <Package className="w-4 h-4 text-orange-600" />
                          : canActOnCurrent
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            : <Clock className="w-4 h-4 text-slate-400" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {canActOnCurrent
                            ? (currentAction.id === 'stores-approve' ? '⚠ Awaiting Stores Verification' : 'Action Required')
                            : `Awaiting ${currentAction.label} Approval`
                          }
                        </p>
                        <p className={`text-xs font-bold ${
                          currentAction.id === 'stores-approve' ? 'text-orange-700' : canActOnCurrent ? 'text-emerald-700' : 'text-slate-500'
                        }`}>{currentAction.label}</p>
                        {!canActOnCurrent && (
                          <p className="text-[11px] text-slate-400 mt-0.5">This step requires a {currentAction.label} — not your role</p>
                        )}
                        {currentAction.id === 'stores-approve' && canActOnCurrent && (
                          <p className="text-[11px] text-orange-500 mt-0.5">This MRS must be verified by Stores before proceeding</p>
                        )}
                      </div>
                    </div>
                    {canActOnCurrent && (
                      <div className="flex gap-3">
                        {currentAction.id === 'approve-md' ? (
                          <button
                            onClick={() => setShowMDModal(true)}
                            disabled={!detailedMRS || approveMutation.isPending}
                            className="flex-[2] h-10 rounded-lg text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-60 bg-green-700 hover:bg-green-800"
                          >
                            {!detailedMRS ? 'Loading…' : 'Review & Authorize (MD) →'}
                          </button>
                        ) : (
                          <button
                            onClick={() => approveMutation.mutate({ id: selectedMRS.id, stage: currentAction.id, data: {} })}
                            disabled={approveMutation.isPending}
                            className={`flex-[2] h-10 rounded-lg text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-60 ${currentAction.color || 'bg-emerald-600 hover:bg-emerald-700'}`}
                          >
                            {approveMutation.isPending ? 'Updating…' : currentAction.btnLabel}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const remarks = window.prompt('Enter reason for rejection:');
                            if (remarks && remarks.trim()) {
                              rejectMutation.mutate({ id: selectedMRS.id, remarks: remarks.trim() });
                            }
                          }}
                          disabled={rejectMutation.isPending}
                          className="flex-1 h-10 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors disabled:opacity-60"
                        >
                          {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Attachments */}
        <div className="mrs-screen-ui px-5 py-3 border-t border-slate-100">
          <RecordAttachments
            module="mrs"
            recordId={selectedMRS.id}
            projectId={selectedMRS.project_id}
            label="MRS Attachments — Indent Forms, Drawings, Specs"
            compact
          />
        </div>


        {/* MD Authorization Modal */}
        {showMDModal && detailedMRS && (
          <MDApprovalModal
            mrs={selectedMRS}
            items={detailItems}
            loading={approveMutation.isPending}
            onClose={() => setShowMDModal(false)}
            onApprove={(data) => {
              approveMutation.mutate({ id: selectedMRS.id, stage: 'approve-md', data });
              setShowMDModal(false);
            }}
          />
        )}

        {/* MD Edit Modal */}
        {showEditModal && detailedMRS && (
          <MRSEditModal
            mrs={detailedMRS}
            items={detailItems}
            loading={updateMRSMutation.isPending}
            onClose={() => setShowEditModal(false)}
            onSave={(data) => updateMRSMutation.mutate({ id: selectedMRS.id, data })}
          />
        )}

        {/* Hidden print area — react-to-print renders this directly */}
        <div className="hidden">
          <div ref={printRef}>
            <MRSPrintTemplate data={detailedMRS} />
          </div>
        </div>

      </div>
    );
  }

  // ── Wizard derived values (New MR form footer / summary panels) ──
  const readyItems = items.filter(i => i.material && i.qty);
  const itemsWithValue = readyItems.map(i => {
    const qty = parseFloat(i.qty) || 0;
    const rate = parseFloat(i.est_rate) || 0;
    return { ...i, estValue: qty * rate, stock: itemStockStatus(i.material) };
  });
  const estTotalValue = itemsWithValue.reduce((sum, i) => sum + i.estValue, 0);
  const needPurchaseCount = itemsWithValue.filter(i => !i.stock || i.stock.state === 'out' || i.stock.state === 'low').length;
  const inStockCount = itemsWithValue.filter(i => i.stock && i.stock.state === 'ok').length;
  const afterThisMr = budgetAvailable !== null ? budgetAvailable - estTotalValue : null;
  const fmtINR = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
  const requesterInitials = (formData.requester_name || '?')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';

  return (
    <>
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Material Requisition System"
        subtitle="Multi-stage approval workflow for material requests"
        breadcrumbs={[{ label: 'Stores' }, { label: 'MRS' }]}
        actions={
          <>
            <button onClick={() => setShowWorkflowConfig(true)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
              title="Configure per-project approval workflows">
              <Settings className="w-4 h-4" /> Workflows
            </button>
            <button onClick={exportToCSV}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <Download className="w-4 h-4" /> Export
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}>
              <Plus className="w-4 h-4" /> New Requisition
            </button>
          </>
        }
      />

      <div className="p-4 md:p-6 xl:p-8 max-w-[1600px] mx-auto">


      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <ThemeKpiCard icon={ClipboardList} label="Total MRS"        value={allMRS.length}       color="slate"   />
        <ThemeKpiCard icon={CalendarDays}  label="This Month"       value={mrsThisMonth.length} color="indigo"  />
        <ThemeKpiCard icon={Clock}         label="Pending Approval" value={pendingCount}         color="amber"   />
        <ThemeKpiCard icon={Activity}      label="In Pipeline"      value={inPipelineCount}      color="blue"    />
        <ThemeKpiCard icon={Send}          label="Ready for Issue"  value={authorizedCount}      color="emerald" />
        <ThemeKpiCard icon={AlertCircle}   label="Urgent / Critical" value={urgentCount}         color="red"     />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Requisition Control Desk</h2>
                <p className="text-xs text-slate-500">Track requests from site entry through MD authorization and issue.</p>
              </div>
            </div>
            <div className="relative flex-1 lg:max-w-xl lg:ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search MRS, project, department, raised by, material..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none focus:border-indigo-400 focus:bg-white transition-all"
              />
              </div>
            </div>

          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-2">
            {/* Project selector */}
            <div className="flex items-center gap-2 mr-1">
              <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <select
                value={projectFilter}
                onChange={e => setProjectFilter(e.target.value)}
                className="h-8 bg-white border border-slate-200 rounded-lg pl-3 pr-7 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 transition-all appearance-none cursor-pointer min-w-[160px] max-w-[240px] truncate"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
              >
                <option value="all">All Projects</option>
                {visibleProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="w-px h-5 bg-slate-200 flex-shrink-0" />
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            {statusTabs.map(([val, lbl, count]) => (
              <button
                key={val}
                onClick={() => setStatusFilter(val)}
                className={clsx('h-8 px-3 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap',
                  statusFilter === val
                    ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                )}
              >
                {lbl}
                <span className={clsx('ml-2 px-1.5 py-0.5 rounded-md',
                  statusFilter === val ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                )}>{count}</span>
              </button>
            ))}

            {/* Sort control */}
            <div className="flex items-center gap-1.5 ml-auto">
              <ArrowDownUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="h-8 bg-white border border-slate-200 rounded-lg pl-3 pr-7 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 transition-all appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
              >
                <option value="mrs">MRS No.</option>
                <option value="required_by">Required By</option>
                <option value="created_at">Date Created</option>
              </select>
              <button
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition-all flex items-center gap-1 whitespace-nowrap"
              >
                {sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                {sortDir === 'asc' ? 'Asc' : 'Desc'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1180px]">
              <thead>
                <tr className="bg-white border-b border-slate-100">
                  {['MRS No.', 'Project / Department', 'Materials', 'Timeline', 'Raised By', 'Priority', 'Status', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map(mrs => {
                  const materials = mrs.items || [];
                  const firstMaterial = materials[0]?.material_name || materials[0]?.material || 'No material linked';
                  return (
                    <tr
                      key={mrs.id}
                      onClick={() => setSelectedMRS(mrs)}
                      className="cursor-pointer hover:bg-indigo-50/40 transition-colors group"
                    >
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <div className="text-xs font-bold font-mono text-indigo-700 group-hover:underline">
                          {mrs.serial_no_formatted || mrs.mrs_number}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">{dayjs(mrs.request_date || mrs.created_at).format('DD-MM-YYYY')}</div>
                      </td>
                      <td className="px-4 py-4 align-top min-w-[260px]">
                        <div className="text-sm font-semibold text-slate-950 truncate max-w-[280px]">{mrs.project_name || 'No project'}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {mrs.project_code && <span className="text-[11px] font-mono text-slate-500">{mrs.project_code}</span>}
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                            {mrs.department || 'Projects'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top min-w-[300px]">
                        <div className="text-sm font-semibold text-slate-900 truncate max-w-[320px]">{firstMaterial}</div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                          <Package className="w-3.5 h-3.5" />
                          {materials.length || 0} item(s)
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
                          <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                          Required {mrs.required_by ? dayjs(mrs.required_by).format('DD-MM-YYYY') : '-'}
                        </div>
                        <div className="mt-2 h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min(((STATUS_CONFIG[mrs.status]?.stage || 1) / 7) * 100, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                            <UserRound className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{mrs.raised_by_name || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <PriorityBadge priority={mrs.priority} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <div className="flex flex-col gap-1.5 items-start">
                          <StatusBadge status={mrs.status} />
                          {mrs.has_po && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border bg-purple-50 text-purple-700 border-purple-200">
                              <ShoppingCart size={10} strokeWidth={2.5} /> PO Raised
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right align-top">
                        <div className="flex items-center justify-end gap-2">
                          <button className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 bg-white">
                            <Eye className="w-3.5 h-3.5" /> Open
                          </button>
                          {['admin','super_admin'].includes(user?.role) && (
                            <button
                              onClick={(e) => handleResendNotify(e, mrs)}
                              disabled={resendMutation.isPending}
                              title="Resend notification emails to stores & procurement"
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all bg-white"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDelete(e, mrs)}
                            disabled={deleteMutation.isPending}
                            title="Delete MRS"
                            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all bg-white"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <Package className="w-9 h-9 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-700">No requisitions found</p>
                      <p className="text-xs text-slate-400 mt-1">Adjust filters or create a new requisition.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 font-semibold flex items-center justify-between">
            <span>Showing {filtered.length} of {allMRS.length} requisitions</span>
            <span>{totalRequestedItems} material rows requested</span>
          </div>
        </div>

        <div className="space-y-4">

          {/* Approval Pipeline breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={14} className="text-indigo-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Approval Pipeline</span>
              <span className="ml-auto text-xs text-slate-400">{allMRS.length} total</span>
            </div>
            <div className="space-y-2.5">
              <StatBar label="Pending Store Manager" value={pendingCount}       total={allMRS.length} color="bg-amber-400" />
              <StatBar label="Store Manager"         value={storesManagerCount} total={allMRS.length} color="bg-orange-400" />
              <StatBar label="Project Manager"       value={approvedPmCount}    total={allMRS.length} color="bg-indigo-400" />
              <StatBar label="Project Director"      value={approvedMgmtCount}  total={allMRS.length} color="bg-teal-400" />
              <StatBar label="Managing Director"     value={authorizedCount}    total={allMRS.length} color="bg-emerald-400" />
              <StatBar label="Issued"             value={issuedCount}        total={allMRS.length} color="bg-sky-400" />
              <StatBar label="Rejected"           value={rejectedCount}      total={allMRS.length} color="bg-red-400" />
            </div>
          </div>

          {/* Priority split */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={14} className="text-amber-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Priority Split</span>
            </div>
            <div className="space-y-2.5">
              <StatBar label="Low"    value={allMRS.filter(m => normalizePriority(m.priority) === 'low').length}    total={allMRS.length} color="bg-emerald-400" />
              <StatBar label="Medium" value={allMRS.filter(m => normalizePriority(m.priority) === 'medium').length} total={allMRS.length} color="bg-amber-400" />
              <StatBar label="High"   value={allMRS.filter(m => normalizePriority(m.priority) === 'high').length}   total={allMRS.length} color="bg-orange-400" />
              <StatBar label="Urgent" value={allMRS.filter(m => normalizePriority(m.priority) === 'urgent').length} total={allMRS.length} color="bg-rose-500" />
            </div>
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-2 gap-3">
            <InsightCard icon={Layers3}       label="Material Rows"  value={totalRequestedItems} sub="Across all MRS"      tone="indigo"  />
            <InsightCard icon={Send}          label="Ready to Issue" value={authorizedCount}     sub="MD authorized"        tone="emerald" />
            <InsightCard icon={CheckCircle}   label="Issued"         value={issuedCount}         sub="Fully completed"      tone="slate"   />
            <InsightCard icon={Rows3}         label="This Month"     value={mrsThisMonth.length} sub="New requisitions"     tone="amber"   />
          </div>
        </div>
      </div>


      {/* ── Detail Slide-over ── */}
      {/* ── New MRS Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
          <div className="w-full h-full flex flex-col overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-3.5 flex-shrink-0 bg-white border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-400">Procurement <span className="text-slate-300">›</span> Material Requests <span className="text-slate-300">›</span> <b className="text-slate-700">New MR</b></div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono">Auto-generated</span>
              </div>
              <button
                onClick={resetForm}
                className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <WizardSteps step={step} />

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
              <div className="flex flex-col lg:flex-row gap-4">

              {/* ── Main column ── */}
              <div className="flex-1 min-w-0 space-y-5">

              {/* ════════ STEP 1 — Request Info ════════ */}
              {step === 1 && <>
              {/* Request Header */}
              <div className={Z_CARD}>
                <h3 className={Z_HEAD}>Request Header</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 p-4">
                  <ZField label="MR Number">
                    <input className={clsx(Z_INP, 'bg-slate-50 text-slate-400 font-mono')} value="Auto-generated" readOnly />
                  </ZField>
                  <ZField label="Request Date *">
                    <input type="date" className={Z_INP} value={formData.request_date}
                      onChange={e => setFormData(p => ({ ...p, request_date: e.target.value }))} />
                  </ZField>
                  <ZField label="Required By Date *">
                    <input type="date" className={Z_INP} value={formData.required_by}
                      onChange={e => setFormData(p => ({ ...p, required_by: e.target.value }))} />
                  </ZField>
                  <ZField label="MR Type *">
                    <select className={Z_INP} value={formData.mr_type}
                      onChange={e => setFormData(p => ({ ...p, mr_type: e.target.value }))}>
                      {MR_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </ZField>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 px-4 pb-4">
                  <ZField label="Project / Site *">
                    <SearchableSelect
                      value={formData.project_id}
                      onChange={v => setFormData(p => ({ ...p, project_id: v }))}
                      options={visibleProjects.map(proj => ({ value: proj.id, label: proj.name }))}
                      placeholder="Select project…"
                      searchPlaceholder="Search projects…"
                      footerLabel="projects"
                      className="!h-9 !rounded-md !border-slate-300 !shadow-none !bg-white focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/30"
                    />
                  </ZField>
                  <ZField label="Work Order / BOQ Reference">
                    <input className={Z_INP} placeholder="e.g. WO-2026-041 – Civil Works"
                      value={formData.wo_boq_reference}
                      onChange={e => setFormData(p => ({ ...p, wo_boq_reference: e.target.value }))} />
                  </ZField>
                  <ZField label="Cost Center">
                    <input className={Z_INP} list="cost-centers" placeholder="Select / type cost center"
                      value={formData.cost_center}
                      onChange={e => setFormData(p => ({ ...p, cost_center: e.target.value }))} />
                    <datalist id="cost-centers">{COST_CENTER_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
                  </ZField>
                </div>
                <div className="px-4 pb-4">
                  <ZField label="Priority *">
                    <div className="flex gap-2 h-9">
                      {Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
                        <button key={v} type="button"
                          onClick={() => setFormData(d => ({ ...d, priority: v }))}
                          className={clsx('flex-1 rounded-md border text-xs font-semibold transition-colors',
                            formData.priority === v ? c.cls + ' ring-1 ring-current/30' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400')}>
                          {c.emoji} {c.label}
                        </button>
                      ))}
                    </div>
                  </ZField>
                </div>
              </div>

              {/* Requester Information */}
              <div className={Z_CARD}>
                <h3 className={Z_HEAD}><UserRound className="w-3.5 h-3.5 inline mr-1.5 text-blue-500" />Requester Information</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                  <div className="space-y-3.5">
                    <div className="grid grid-cols-2 gap-3.5">
                      <ZField label="Requester Name *">
                        <input className={Z_INP} placeholder="Full name" value={formData.requester_name}
                          onChange={e => setFormData(p => ({ ...p, requester_name: e.target.value }))} />
                      </ZField>
                      <ZField label="Employee ID">
                        <input className={clsx(Z_INP, 'font-mono')} placeholder="BCIM-EMP-…" value={formData.requester_employee_id}
                          onChange={e => setFormData(p => ({ ...p, requester_employee_id: e.target.value }))} />
                      </ZField>
                    </div>
                    <div className="flex gap-3 items-center rounded-md border border-blue-100 bg-blue-50 px-3.5 py-3">
                      <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{requesterInitials}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-blue-700 truncate">{formData.requester_name || 'Requester'}</p>
                        <p className="text-[11px] text-slate-600 truncate">{formData.department || '—'}{formData.project_id ? ` · ${visibleProjects.find(p => p.id === formData.project_id)?.name || ''}` : ''}</p>
                        <div className="flex gap-1.5 mt-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Active</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3.5">
                    <div className="grid grid-cols-2 gap-3.5">
                      <ZField label="Department *">
                        <SearchableSelect
                          value={formData.department}
                          onChange={v => setFormData(p => ({ ...p, department: v }))}
                          options={DEPARTMENT_OPTIONS}
                          placeholder="Select department…"
                          searchPlaceholder="Search departments…"
                          footerLabel="departments"
                          className="!h-9 !rounded-md !border-slate-300 !shadow-none !bg-white focus:!border-blue-500 focus:!ring-1 focus:!ring-blue-500/30"
                        />
                      </ZField>
                      <ZField label="Delivery Location">
                        <input className={Z_INP} list="delivery-locations" placeholder="Select / type location"
                          value={formData.delivery_location}
                          onChange={e => setFormData(p => ({ ...p, delivery_location: e.target.value }))} />
                        <datalist id="delivery-locations">{DELIVERY_LOCATION_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
                      </ZField>
                    </div>
                    <ZField label="Contact / Mobile">
                      <input className={Z_INP} placeholder="+91 …" value={formData.requester_contact}
                        onChange={e => setFormData(p => ({ ...p, requester_contact: e.target.value }))} />
                    </ZField>
                    <ZField label="Email for Notification">
                      <input type="email" className={Z_INP} placeholder="name@bcim…" value={formData.requester_email}
                        onChange={e => setFormData(p => ({ ...p, requester_email: e.target.value }))} />
                    </ZField>
                  </div>
                </div>
                <div className="px-4 pb-4">
                  <ZField label="Site Incharge">
                    <input className={Z_INP} placeholder="Enter name" value={formData.site_incharge}
                      onChange={e => setFormData(p => ({ ...p, site_incharge: e.target.value }))} />
                  </ZField>
                </div>
              </div>
              </>}

              {/* ════════ STEP 2 — Material Items ════════ */}
              {step === 2 && <>
              <div className="flex gap-2.5 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <span>Stock levels are as of today from the project store. Items marked <strong>Low / Nil</strong> are auto-flagged for purchase order.</span>
              </div>
              <div className={Z_CARD}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h3 className="text-[13px] font-semibold text-slate-700"><Package className="w-3.5 h-3.5 inline mr-1.5 text-blue-500" />Item List</h3>
                  <div className="flex items-center gap-2">
                    <button title="Coming soon" disabled className="flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold text-slate-400 border border-slate-200 cursor-not-allowed">
                      <Upload className="w-3 h-3" /> Import from BOQ
                    </button>
                    <button title="Coming soon" disabled className="flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold text-slate-400 border border-slate-200 cursor-not-allowed">
                      <Upload className="w-3 h-3" /> Import Excel
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[1100px]">
                    <div className="grid gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wide" style={{ gridTemplateColumns: '32px 100px minmax(220px,2fr) 110px 80px 80px 100px 110px 90px minmax(160px,1.5fr) 150px 32px' }}>
                      {['#', 'Item Code', 'Material Description', 'Category', 'UOM', 'Req. Qty', 'Est. Rate', 'Est. Value', 'Stock', 'Purpose / Usage', 'Preferred Vendor', ''].map((h, i) => (
                        <div key={i} className={i >= 5 && i <= 7 ? 'text-right' : ''}>{h}</div>
                      ))}
                    </div>
                    {items.map((item, idx) => {
                      const stock = itemStockStatus(item.material);
                      const qty = parseFloat(item.qty) || 0;
                      const rate = parseFloat(item.est_rate) || 0;
                      const estVal = qty * rate;
                      return (
                      <div key={idx} className={clsx('grid gap-2 items-center px-4 py-2 border-b border-slate-100 last:border-b-0', idx % 2 === 1 && 'bg-slate-50/60')}
                        style={{ gridTemplateColumns: '32px 100px minmax(220px,2fr) 110px 80px 80px 100px 110px 90px minmax(160px,1.5fr) 150px 32px' }}>
                        <div className="text-center text-xs font-semibold text-slate-400 font-mono">{idx + 1}</div>
                        <input className={clsx(Z_INP, 'font-mono !px-2')} placeholder="Code" value={item.item_code}
                          onChange={e => { const n = [...items]; n[idx].item_code = e.target.value; setItems(n); }} />
                        <MaterialCombobox
                          value={item.material}
                          inventoryItems={inventoryItems}
                          onChange={(materialName, unit) => {
                            const n = [...items];
                            n[idx].material = materialName;
                            if (unit) n[idx].unit = unit;
                            const inv = inventoryItems.find(i => i.material_name === materialName);
                            if (inv) { n[idx].category = inv.category || n[idx].category; n[idx].item_code = inv.item_code || n[idx].item_code; }
                            setItems(n);
                          }}
                          onNewItem={(prefill) => {
                            setNewItemTargetIdx(idx);
                            setNewItemForm(f => ({ ...f, material_name: prefill || '', category: '', category_custom: '', unit: item.unit || 'Nos' }));
                            setCategoryMode('select');
                            setShowNewItemModal(true);
                          }}
                        />
                        <select className={clsx(Z_INP, '!px-2')} value={item.category}
                          onChange={e => { const n = [...items]; n[idx].category = e.target.value; setItems(n); }}>
                          <option value="">—</option>
                          {ITEM_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select className={clsx(Z_INP, '!px-1')} value={item.unit}
                          onChange={e => { const n = [...items]; n[idx].unit = e.target.value; setItems(n); }}>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input type="number" placeholder="0" className={clsx(Z_INP, 'text-right font-mono !px-2')} value={item.qty}
                          onChange={e => { const n = [...items]; n[idx].qty = e.target.value; setItems(n); }} />
                        <input type="number" placeholder="0" className={clsx(Z_INP, 'text-right font-mono !px-2')} value={item.est_rate}
                          onChange={e => { const n = [...items]; n[idx].est_rate = e.target.value; setItems(n); }} />
                        <div className="text-right font-mono text-xs font-semibold text-slate-700">{estVal ? estVal.toLocaleString('en-IN') : '—'}</div>
                        <div className="flex justify-center">
                          {!item.material ? <span className="text-xs text-slate-300">—</span> :
                           !stock ? <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">New</span> :
                           stock.state === 'out' ? <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Nil</span> :
                           stock.state === 'low' ? <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Low ({stock.value})</span> :
                           <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">OK ({stock.value})</span>}
                        </div>
                        <input type="text" placeholder="Purpose / activity" className={Z_INP} value={item.purpose}
                          onChange={e => { const n = [...items]; n[idx].purpose = e.target.value; setItems(n); }} />
                        <VendorSelect
                          value={item.preferred_vendor_id}
                          options={vendorOptions}
                          onChange={v => { const n = [...items]; n[idx].preferred_vendor_id = v; setItems(n); }}
                          placeholder="Auto-assign"
                          className="!h-9 !text-xs !font-medium"
                        />
                        <button onClick={() => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); }}
                          disabled={items.length === 1}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 disabled:opacity-30 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                  <button
                    onClick={() => setItems([...items, { material: '', qty: '', unit: 'Nos', purpose: '', item_code: '', category: '', est_rate: '', preferred_vendor_id: '' }])}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                  <div className="text-sm">
                    <span className="text-slate-500">Est. Total Value: </span>
                    <span className="font-bold text-blue-600 font-mono">{fmtINR(estTotalValue)}</span>
                  </div>
                </div>
              </div>
              </>}

              {/* ════════ STEP 3 — Justification ════════ */}
              {step === 3 && <>
              <div className={Z_CARD}>
                <h3 className={Z_HEAD}>Justification &amp; Notes</h3>
                <div className="p-4 space-y-3.5">
                  <ZField label="Reason / Justification *">
                    <textarea rows={3} className={clsx(Z_INP, 'h-auto py-2 resize-none')}
                      placeholder="Why are these materials required?"
                      value={formData.justification}
                      onChange={e => setFormData(p => ({ ...p, justification: e.target.value }))} />
                  </ZField>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <ZField label="Linked Activity / Milestone">
                      <input className={Z_INP} placeholder="e.g. L3 Slab Casting – Block A"
                        value={formData.linked_activity}
                        onChange={e => setFormData(p => ({ ...p, linked_activity: e.target.value }))} />
                    </ZField>
                    <ZField label="Planned Usage Date">
                      <input type="date" className={Z_INP} value={formData.planned_usage_date}
                        onChange={e => setFormData(p => ({ ...p, planned_usage_date: e.target.value }))} />
                    </ZField>
                  </div>
                  <ZField label="Special Handling / Instructions">
                    <textarea rows={2} className={clsx(Z_INP, 'h-auto py-2 resize-none')}
                      placeholder="Any special storage, safety, or handling notes…"
                      value={formData.special_handling}
                      onChange={e => setFormData(p => ({ ...p, special_handling: e.target.value }))} />
                  </ZField>
                  <ZField label="Remarks">
                    <textarea rows={2} className={clsx(Z_INP, 'h-auto py-2 resize-none')}
                      placeholder="Additional notes…"
                      value={formData.remarks}
                      onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))} />
                  </ZField>
                </div>
              </div>

              {/* Attachments */}
              <div className={Z_CARD}>
                <h3 className={Z_HEAD}>Supporting Documents</h3>
                <div className="p-4">
                  <label
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOver(false);
                      const files = Array.from(e.dataTransfer.files || []);
                      if (files.length) setAttachments(a => [...a, ...files]);
                    }}
                    className={clsx('flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors',
                      dragOver ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/30')}>
                    <Upload className="w-5 h-5 text-blue-500" />
                    <span className="text-sm font-medium text-slate-700">Drag &amp; drop BOQ extracts, drawings, or site photos here</span>
                    <span className="text-xs text-slate-400">PDF, JPG, PNG, XLSX, DWG – max 10MB each</span>
                    <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx,.dwg" className="hidden"
                      onChange={e => { const files = Array.from(e.target.files || []); if (files.length) setAttachments(a => [...a, ...files]); e.target.value = ''; }} />
                  </label>
                  {attachments.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                      {attachments.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-50 border border-slate-200">
                          <FileText className="w-4 h-4 text-rose-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">{f.name}</p>
                            <p className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(0)} KB</p>
                          </div>
                          <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </>}

              {/* ════════ STEP 4 — Review & Submit ════════ */}
              {step === 4 && <>
              <div className={Z_CARD}>
                <h3 className={Z_HEAD}>Request Header</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 p-4 text-sm">
                  {[
                    ['Project', visibleProjects.find(p => p.id === formData.project_id)?.name || '—'],
                    ['MR Type', formData.mr_type],
                    ['Request Date', formData.request_date ? dayjs(formData.request_date).format('DD-MM-YYYY') : '—'],
                    ['Required By', formData.required_by ? dayjs(formData.required_by).format('DD-MM-YYYY') : '—'],
                    ['Cost Center', formData.cost_center || '—'],
                    ['WO / BOQ Ref', formData.wo_boq_reference || '—'],
                    ['Department', formData.department || '—'],
                    ['Priority', `${PRIORITY_CONFIG[normalizePriority(formData.priority)].emoji} ${PRIORITY_CONFIG[normalizePriority(formData.priority)].label}`],
                  ].map(([l, v]) => (
                    <div key={l}><p className="text-[11px] text-slate-400 uppercase tracking-wide">{l}</p><p className="font-semibold text-slate-800 truncate">{v}</p></div>
                  ))}
                </div>
              </div>

              <div className={Z_CARD}>
                <h3 className={Z_HEAD}>Requested By</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 p-4 text-sm">
                  {[
                    ['Requester', formData.requester_name || '—'],
                    ['Employee ID', formData.requester_employee_id || '—'],
                    ['Contact', formData.requester_contact || '—'],
                    ['Email', formData.requester_email || '—'],
                    ['Delivery Location', formData.delivery_location || '—'],
                    ['Site Incharge', formData.site_incharge || '—'],
                  ].map(([l, v]) => (
                    <div key={l}><p className="text-[11px] text-slate-400 uppercase tracking-wide">{l}</p><p className="font-semibold text-slate-800 truncate">{v}</p></div>
                  ))}
                </div>
              </div>

              <div className={Z_CARD}>
                <h3 className={Z_HEAD}>Material Items ({readyItems.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10.5px]">
                        <th className="text-left px-3 py-2">#</th><th className="text-left px-3 py-2">Material</th>
                        <th className="text-right px-3 py-2">Qty</th><th className="text-left px-3 py-2">Unit</th>
                        <th className="text-right px-3 py-2">Rate</th><th className="text-right px-3 py-2">Value</th>
                        <th className="text-center px-3 py-2">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsWithValue.map((i, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">{i.material}</td>
                          <td className="px-3 py-2 text-right font-mono">{i.qty}</td>
                          <td className="px-3 py-2">{i.unit}</td>
                          <td className="px-3 py-2 text-right font-mono">{i.est_rate ? parseFloat(i.est_rate).toLocaleString('en-IN') : '—'}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">{i.estValue ? i.estValue.toLocaleString('en-IN') : '—'}</td>
                          <td className="px-3 py-2 text-center">{!i.stock ? 'New' : i.stock.state === 'out' ? 'Nil' : i.stock.state === 'low' ? `Low` : 'OK'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {formData.justification && (
                <div className={Z_CARD}>
                  <h3 className={Z_HEAD}>Justification</h3>
                  <div className="p-4 text-sm text-slate-700 whitespace-pre-wrap">{formData.justification}</div>
                </div>
              )}

              {/* Approval Workflow chain */}
              <div className={Z_CARD}>
                <h3 className={Z_HEAD}>Approval Workflow</h3>
                <div className="p-4">
                  <p className="text-xs text-slate-400 mb-3">After submission, this MR will be routed through the approval chain below:</p>
                  <div className="flex items-center overflow-x-auto pb-2">
                    {[{ label: 'Requester', short: requesterInitials, status: 'Submitted', state: 'approved' },
                      ...ACTIVE_STAGES.map((s, i) => ({ label: s.short, short: s.short.replace(/[^A-Z]/g, '').slice(0, 2) || s.short.slice(0, 2).toUpperCase(), status: i === 0 ? 'Pending' : 'Waiting', state: i === 0 ? 'pending' : '' }))
                    ].map((node, i, arr) => (
                      <React.Fragment key={i}>
                        <div className="flex flex-col items-center gap-1 flex-1 min-w-[80px]">
                          <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold border-2',
                            node.state === 'approved' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                            node.state === 'pending' ? 'border-amber-500 bg-amber-50 text-amber-700' :
                            'border-slate-200 bg-slate-50 text-slate-400')}>{node.short}</div>
                          <span className="text-[11px] text-slate-500 text-center">{node.label}</span>
                          <span className={clsx('text-[10.5px] font-semibold',
                            node.state === 'approved' ? 'text-emerald-600' : node.state === 'pending' ? 'text-amber-600' : 'text-slate-400')}>{node.status}</span>
                        </div>
                        {i < arr.length - 1 && <div className="w-8 h-0.5 bg-slate-200 flex-shrink-0" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
              </>}

              </div>

              {/* ── Sidebar (visible all steps) ── */}
              <div className="w-full lg:w-[300px] shrink-0 space-y-4">
                {/* MR Summary panel */}
                <div className="rounded-md border border-slate-200 overflow-hidden bg-white">
                  <div className="px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold uppercase tracking-wide">📋 MR Summary</div>
                  {[
                    ['Total Items', readyItems.length, ''],
                    ['Need Purchase', `${needPurchaseCount} items`, 'text-rose-600'],
                    ['Available in Stock', `${inStockCount} item${inStockCount === 1 ? '' : 's'}`, 'text-emerald-600'],
                    ['Est. Total Value', fmtINR(estTotalValue), ''],
                    ['Priority', `${PRIORITY_CONFIG[normalizePriority(formData.priority)].emoji} ${PRIORITY_CONFIG[normalizePriority(formData.priority)].label}`, ''],
                    ['Required By', formData.required_by ? dayjs(formData.required_by).format('DD-MM-YYYY') : '—', ''],
                  ].map(([l, v, c]) => (
                    <div key={l} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 text-xs">
                      <span className="text-slate-500">{l}</span>
                      <span className={clsx('font-mono font-semibold', c || 'text-slate-800')}>{v}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-blue-50 text-xs">
                    <span className="text-blue-700 font-semibold">Budget Available</span>
                    <span className="font-mono font-bold text-blue-700">{budgetAvailable !== null ? fmtINR(budgetAvailable) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <span className="text-slate-500">After This MR</span>
                    <span className={clsx('font-mono font-semibold', afterThisMr !== null && afterThisMr < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                      {afterThisMr !== null ? `${fmtINR(afterThisMr)} left` : '—'}
                    </span>
                  </div>
                </div>

                {/* Approval Workflow */}
                <div className={Z_CARD}>
                  <h3 className={Z_HEAD}>Approval Workflow</h3>
                  <ul className="space-y-0 p-4 pt-3">
                    {[
                      { label: 'Request Created', sub: 'On submission', state: 'done' },
                      ...ACTIVE_STAGES.map(s => ({ label: s.label, sub: 'Pending', state: 'pending' })),
                      { label: 'Issue from Store', sub: 'Pending', state: 'pending' },
                    ].map((s, i, arr) => (
                      <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                        {i < arr.length - 1 && <span className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200" />}
                        <span className={clsx('relative z-10 flex items-center justify-center w-6 h-6 rounded-full shrink-0',
                          s.state === 'done' ? 'bg-blue-600 text-white' : i === 1 ? 'bg-white text-blue-600 border-2 border-blue-400' : 'bg-slate-100 text-slate-400 border border-slate-200')}>
                          {s.state === 'done' ? <Check className="w-3.5 h-3.5" /> : i === 1 ? <Clock className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                        </span>
                        <div className="pt-0.5">
                          <p className={clsx('text-xs font-semibold', s.state === 'done' || i === 1 ? 'text-slate-900' : 'text-slate-400')}>{s.label}</p>
                          <p className={clsx('text-[11px] mt-0.5', i === 1 ? 'text-blue-600 font-medium' : 'text-slate-400')}>{s.sub}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recent MRs */}
                <div className={Z_CARD}>
                  <h3 className={Z_HEAD}>Recent MRs</h3>
                  <div className="p-4 pt-3">
                  {(() => {
                    const recent = (formData.project_id ? rawMRS.filter(m => m.project_id === formData.project_id) : rawMRS)
                      .slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
                    if (!recent.length) return <p className="text-xs text-slate-400">No previous requisitions yet.</p>;
                    return (
                      <div className="space-y-2.5">
                        {recent.map(m => (
                          <div key={m.id} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 font-mono truncate">{m.serial_no_formatted || m.mrs_number}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{dayjs(m.request_date || m.created_at).format('DD-MM-YYYY')} · {m.item_count ?? '—'} items</p>
                            </div>
                            <StatusBadge status={m.status} />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  </div>
                </div>
              </div>

              </div>
            </div>

            {/* Bottom action bar */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white flex-shrink-0">
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span>{readyItems.length} items &nbsp;|&nbsp; Est. Value: <strong className="font-mono">{fmtINR(estTotalValue)}</strong></span>
                {needPurchaseCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-medium">
                    <AlertCircle className="w-3 h-3" /> {needPurchaseCount} need purchase
                  </span>
                )}
                {inStockCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                    <Check className="w-3 h-3" /> {inStockCount} in store
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={resetForm} className="px-4 h-9 rounded-md border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Discard</button>
                <button onClick={saveDraft} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md border border-blue-300 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors">
                  <Download className="w-4 h-4" /> Save Draft
                </button>
                {hasDraft && (
                  <button onClick={loadDraft} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md border border-amber-300 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors">
                    <RotateCcw className="w-4 h-4" /> Resume Draft
                  </button>
                )}
                <button title="Coming soon" disabled className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md border border-slate-200 text-sm font-medium text-slate-400 cursor-not-allowed">
                  Preview PDF
                </button>
                {step > 1 && (
                  <button onClick={goBack} className="px-4 h-9 rounded-md border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Back</button>
                )}
                {step < WIZARD_STEPS.length ? (
                  <button onClick={goNext} className="inline-flex items-center gap-2 px-5 h-9 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={createMutation.isPending}
                    className="inline-flex items-center gap-2 px-5 h-9 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    <Send className="w-4 h-4" />
                    {createMutation.isPending ? 'Submitting…' : 'Submit for Approval'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Inventory Item Modal ── */}
      {showNewItemModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-indigo-600">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Tag className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Add New Item to Store Ledger</p>
                  <p className="text-xs text-indigo-200 mt-0.5">Item will be available for future requisitions</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewItemModal(false)}
                className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Body */}
            <div className="p-5 space-y-4">
              <Field label="Material Name *">
                <input
                  className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
                  placeholder="e.g. TMT Steel Bars Fe500"
                  value={newItemForm.material_name}
                  onChange={e => setNewItemForm(f => ({ ...f, material_name: e.target.value }))}
                />
              </Field>

              <Field label="Category">
                <div className="space-y-2">
                  {categoryMode === 'select' ? (
                    <div className="flex gap-2">
                      <select
                        className="flex-1 h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
                        value={newItemForm.category}
                        onChange={e => setNewItemForm(f => ({ ...f, category: e.target.value }))}
                      >
                        <option value="">— Select category —</option>
                        {[...new Set([...DEFAULT_CATEGORIES, ...existingCategories])].sort().map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => setCategoryMode('custom')}
                        className="flex items-center gap-1 px-3 h-9 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 whitespace-nowrap transition-colors"
                      >
                        <Plus className="w-3 h-3" /> New Category
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        className="flex-1 h-9 bg-slate-50 border border-indigo-300 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
                        placeholder="Type new category name…"
                        value={newItemForm.category_custom}
                        onChange={e => setNewItemForm(f => ({ ...f, category_custom: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => { setCategoryMode('select'); setNewItemForm(f => ({ ...f, category_custom: '' })); }}
                        className="flex items-center gap-1 px-3 h-9 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors"
                      >
                        ← Back
                      </button>
                    </div>
                  )}
                  {categoryMode === 'custom' && newItemForm.category_custom && (
                    <p className="text-xs text-indigo-600 font-bold">
                      ✓ New category "<span className="font-bold">{newItemForm.category_custom}</span>" will be created
                    </p>
                  )}
                </div>
              </Field>

              <Field label="Unit">
                <select
                  className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
                  value={newItemForm.unit}
                  onChange={e => setNewItemForm(f => ({ ...f, unit: e.target.value }))}
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>

              {!formData.project_id && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-800">
                    Please select a <strong>Project</strong> in the form before adding a new item. The item will be registered under that project's store ledger.
                  </p>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setShowNewItemModal(false)}
                className="px-4 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition-all"
              >
                Cancel
              </button>
              <button
                disabled={!newItemForm.material_name || !formData.project_id || addInventoryItemMutation.isPending}
                onClick={() => {
                  const category = categoryMode === 'custom' ? newItemForm.category_custom : newItemForm.category;
                  addInventoryItemMutation.mutate({
                    project_id: formData.project_id,
                    material_name: newItemForm.material_name,
                    category: category || null,
                    unit: newItemForm.unit,
                    opening_stock: 0,
                  });
                }}
                className="px-5 h-9 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-sm"
              >
                {addInventoryItemMutation.isPending ? 'Adding…' : 'Add to Store Ledger'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Workflow Config Modal ── */}
      {showWorkflowConfig && (
        <WorkflowConfigModal onClose={() => setShowWorkflowConfig(false)} />
      )}
      </div>
    </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function InsightCard({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const tones = {
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-h-[118px]">
      <div className="flex items-center justify-between gap-3">
        <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center', tones[tone] || tones.slate)}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-2xl font-bold text-slate-950 tabular-nums">{value}</span>
      </div>
      <div className="mt-3">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">{label}</p>
        <p className="text-xs text-slate-500 mt-1">{sub}</p>
      </div>
    </div>
  );
}

/* ── MD Authorization Modal ─────────────────────────────────────────────── */
function MDApprovalModal({ mrs, items, loading, onClose, onApprove }) {
  const [approvedItems, setApprovedItems] = useState(() =>
    items.map(it => ({
      id: it.id,
      material_name: it.material_name || it.material,
      unit: it.unit,
      qty: String(it.quantity ?? it.qty ?? ''),
      original_qty: it.quantity ?? it.qty,
      included: true,
    }))
  );
  const [remarks, setRemarks] = useState('');

  const toggle    = (idx) => setApprovedItems(p => p.map((it, i) => i === idx ? { ...it, included: !it.included } : it));
  const setQty    = (idx, v) => setApprovedItems(p => p.map((it, i) => i === idx ? { ...it, qty: v } : it));
  const selectAll = () => setApprovedItems(p => p.map(it => ({ ...it, included: true })));
  const clearAll  = () => setApprovedItems(p => p.map(it => ({ ...it, included: false })));

  const includedCount = approvedItems.filter(it => it.included).length;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-green-800 px-6 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Landmark size={16} className="opacity-80" /> MD Authorization
            </h2>
            <p className="text-xs text-green-200 mt-0.5">
              {mrs.serial_no_formatted || mrs.mrs_number} — select items &amp; set approved quantities
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition">
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-green-50 border-b border-green-100 flex-shrink-0">
          <p className="text-xs text-green-800 font-medium">
            Check items to include · edit quantities if needed · uncheck to exclude
          </p>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-[10px] font-bold text-green-700 hover:underline">Select All</button>
            <span className="text-green-300">|</span>
            <button onClick={clearAll}  className="text-[10px] font-bold text-red-500 hover:underline">Clear All</button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {approvedItems.map((it, idx) => (
            <div key={it.id || idx} className={clsx(
              'flex items-center gap-3 border rounded-xl px-4 py-3 transition-all',
              it.included ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 opacity-50'
            )}>
              <input
                type="checkbox"
                checked={it.included}
                onChange={() => toggle(idx)}
                className="w-4 h-4 accent-green-700 cursor-pointer flex-shrink-0"
              />
              <span className="flex-1 text-sm font-semibold text-slate-800 truncate min-w-0">{it.material_name}</span>
              <span className="text-xs text-slate-500 bg-white border border-slate-200 rounded px-2 py-0.5 font-mono flex-shrink-0">{it.unit}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-slate-400 whitespace-nowrap">Req: <span className="font-bold text-slate-600">{it.original_qty}</span></span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-green-700 font-bold whitespace-nowrap">Approve:</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={it.qty}
                  onChange={e => setQty(idx, e.target.value)}
                  disabled={!it.included}
                  className="w-24 h-8 bg-white border border-slate-200 rounded-lg px-2 text-sm font-mono text-right outline-none focus:border-green-500 disabled:bg-slate-100 disabled:text-slate-400 transition"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Remarks */}
        <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0">
          <label className="text-xs font-bold text-slate-700 block mb-1.5">MD Remarks (optional)</label>
          <textarea
            rows={2}
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Authorization notes, conditions, or special instructions…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none focus:border-green-400 resize-none transition"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <div>
            <span className={clsx('text-sm font-bold', includedCount === 0 ? 'text-red-500' : 'text-green-700')}>
              {includedCount} of {approvedItems.length} items authorized
            </span>
            {includedCount === 0 && <p className="text-[11px] text-red-400">Please select at least one item</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-4 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition">
              Cancel
            </button>
            <button
              onClick={() => onApprove({
                approved_items: approvedItems.map(it => ({
                  id: it.id,
                  qty: parseFloat(it.qty) || 0,
                  included: it.included,
                })),
                remarks,
              })}
              disabled={loading || includedCount === 0}
              className="px-5 h-9 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition shadow-sm"
            >
              {loading ? 'Authorizing…' : `Authorize ${includedCount} Item${includedCount !== 1 ? 's' : ''} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MD Edit Modal — correct an MRS's header/item details ──────────────────────
// Existing items are kept and updated in place (id preserved); new rows have no
// id and are appended. Items are never removed here — that stays on
// /cancel-items so removals stay audit-tracked.
function MRSEditModal({ mrs, items, loading, onClose, onSave }) {
  const [form, setForm] = useState({
    priority: mrs.priority || 'medium',
    required_by: mrs.required_by ? dayjs(mrs.required_by).format('YYYY-MM-DD') : '',
    site_incharge: mrs.site_incharge || '',
    remarks: mrs.remarks || '',
  });
  const [rows, setRows] = useState(() =>
    items.map(it => ({
      id: it.id,
      material: it.material_name || it.material || '',
      qty: String(it.quantity ?? it.qty ?? ''),
      unit: it.unit || 'Nos',
      purpose: it.purpose || '',
    }))
  );

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setRow = (idx, k, v) => setRows(p => p.map((r, i) => i === idx ? { ...r, [k]: v } : r));
  const addRow = () => setRows(p => [...p, { material: '', qty: '', unit: 'Nos', purpose: '' }]);
  const removeNewRow = (idx) => setRows(p => p.filter((_, i) => i !== idx || p[i].id));

  const canSave = rows.every(r => r.material.trim() && parseFloat(r.qty) > 0 && r.unit.trim());

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-blue-800 px-6 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Pencil size={16} className="opacity-80" /> Edit Material Requisition
            </h2>
            <p className="text-xs text-blue-200 mt-0.5">
              {mrs.serial_no_formatted || mrs.mrs_number} — Managing Director correction
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Priority</label>
              <select value={form.priority} onChange={e => setField('priority', e.target.value)}
                className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2 text-sm outline-none focus:border-blue-400 transition">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Required By</label>
              <input type="date" value={form.required_by} onChange={e => setField('required_by', e.target.value)}
                className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2 text-sm outline-none focus:border-blue-400 transition" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Site Incharge</label>
              <input value={form.site_incharge} onChange={e => setField('site_incharge', e.target.value)}
                className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-2 text-sm outline-none focus:border-blue-400 transition" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Remarks</label>
            <textarea rows={2} value={form.remarks} onChange={e => setField('remarks', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none focus:border-blue-400 resize-none transition" />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700">Items</label>
              <button onClick={addRow} className="text-[11px] font-bold text-blue-600 hover:underline">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {rows.map((r, idx) => (
                <div key={r.id || `new-${idx}`} className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50">
                  <input value={r.material} onChange={e => setRow(idx, 'material', e.target.value)}
                    placeholder="Material name"
                    className="flex-1 h-8 bg-white border border-slate-200 rounded-lg px-2 text-sm outline-none focus:border-blue-400 transition" />
                  <input type="number" min="0" step="any" value={r.qty} onChange={e => setRow(idx, 'qty', e.target.value)}
                    placeholder="Qty"
                    className="w-24 h-8 bg-white border border-slate-200 rounded-lg px-2 text-sm font-mono text-right outline-none focus:border-blue-400 transition" />
                  <select value={r.unit} onChange={e => setRow(idx, 'unit', e.target.value)}
                    className="w-24 h-8 bg-white border border-slate-200 rounded-lg px-1 text-xs outline-none focus:border-blue-400 transition">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input value={r.purpose} onChange={e => setRow(idx, 'purpose', e.target.value)}
                    placeholder="Purpose (optional)"
                    className="flex-1 h-8 bg-white border border-slate-200 rounded-lg px-2 text-sm outline-none focus:border-blue-400 transition" />
                  {!r.id && (
                    <button onClick={() => removeNewRow(idx)} className="w-7 h-7 rounded hover:bg-red-50 flex items-center justify-center text-red-400 flex-shrink-0">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Existing items can be corrected here but not removed — use "Cancel" on the requisition detail to drop an item (kept for audit).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          {!canSave && <p className="text-[11px] text-red-500">Every item needs a material name, qty &gt; 0, and unit.</p>}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose}
              className="px-4 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition">
              Cancel
            </button>
            <button
              onClick={() => onSave({
                priority: form.priority,
                required_by: form.required_by || null,
                site_incharge: form.site_incharge || null,
                remarks: form.remarks || null,
                items: rows.map(r => ({
                  id: r.id, material: r.material.trim(), qty: r.qty, unit: r.unit, purpose: r.purpose || null,
                })),
              })}
              disabled={loading || !canSave}
              className="px-5 h-9 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition shadow-sm"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

