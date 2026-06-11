// src/pages/stores/MRSPage.jsx
import RecordAttachments from '../../components/shared/RecordAttachments';
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
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { mrsAPI, projectAPI, inventoryAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import toast from 'react-hot-toast';
import MRSPrintTemplate from './MRSPrintTemplate';
import { useReactToPrint } from 'react-to-print';

import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';
const DEFAULT_CATEGORIES = ['Masonry Works'];

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

const PRIORITY_CONFIG = {
  normal:   { label: 'Normal',   cls: 'bg-slate-100 text-slate-900 font-medium border-slate-200' },
  urgent:   { label: 'Urgent',   cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  critical: { label: 'Critical', cls: 'bg-red-50 text-red-600 border-red-200' },
};

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
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', cfg.cls)}>
      {cfg.label}
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
          style={{ background: `linear-gradient(135deg, #1a3a6b 0%, #0f2347 100%)` }}>
          <div>
            <h2 className="font-bold text-white text-base flex items-center gap-2">
              <Settings size={16} className="opacity-70" /> MRS Approval Workflow — Per Project
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Configure which approval stages apply to each project
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
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-semibold">Project</th>
                  <th className="text-left px-4 py-3 font-semibold">Approval Stages</th>
                  <th className="px-4 py-3 font-semibold text-right">Reset</th>
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
                        <div className="flex flex-wrap gap-1.5">
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
                      </td>
                      <td className="px-4 py-3 text-right">
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
  const [selectedMRS, setSelectedMRS] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showWorkflowConfig, setShowWorkflowConfig] = useState(false);
  const [projectFilter, setProjectFilter] = useState(selectedProjectId || 'all');
  const [items, setItems] = useState([{ material: '', qty: '', unit: 'Nos', purpose: '' }]);
  const [formData, setFormData] = useState({
    project_id: '', department: 'Projects', head_office_project_name: '',
    site_incharge: '', required_by: '', priority: 'normal', remarks: '',
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

  // Inventory lookup — for material name combobox
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-lookup'],
    queryFn: () => inventoryAPI.itemsLookup().then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });
  const { data: existingCategories = [] } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: () => inventoryAPI.categories().then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

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

  useEffect(() => {
    setProjectFilter(selectedProjectId || 'all');
  }, [selectedProjectId]);

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

  const exportToCSV = () => {
    const headers = ['Serial No', 'Project', 'Department', 'Required By', 'Status', 'Date', 'Requested By'];
    const rows = filtered.map(m => [
      m.serial_no_formatted || m.mrs_number, m.project_name, m.department,
      dayjs(m.required_by).format('DD/MM/YYYY'), m.status,
      dayjs(m.created_at).format('DD/MM/YYYY'), m.raised_by_name,
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
    setItems([{ material: '', qty: '', unit: 'Nos', purpose: '' }]);
    setFormData({ project_id: '', department: 'Projects', head_office_project_name: '', site_incharge: '', required_by: '', priority: 'normal', remarks: '' });
  };

  const handleSubmit = () => {
    if (!formData.project_id || !formData.required_by || items.every(i => !i.material || !i.qty)) {
      return toast.error('Please fill all required fields');
    }
    createMutation.mutate({
      ...formData,
      items: items.filter(i => i.material && i.qty),
      required_by: dayjs(formData.required_by).format('YYYY-MM-DD'),
    });
  };

  const [showMDModal, setShowMDModal] = useState(false);

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
              <p className="text-lg font-bold text-slate-950 font-mono">{selectedMRS.serial_no_formatted || selectedMRS.mrs_number}</p>
              <p className="text-xs text-slate-500 font-medium">Material Requisition • {dayjs(selectedMRS.created_at).format('D MMM YYYY, HH:mm')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={liveStatus} />
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
                ['Required By', selectedMRS.required_by ? dayjs(selectedMRS.required_by).format('DD MMM YYYY') : '-'],
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
                        {['#', 'Material', 'Unit', 'Requested Qty', liveStatus === 'approved_md' ? 'MD Approved Qty' : null, 'Purpose'].filter(Boolean).map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailItems.map((it, i) => {
                        const excluded = it.effective_included === false || it.md_included === false;
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
                            <td className="px-4 py-3 text-slate-700">{it.purpose || '-'}</td>
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
                          onClick={() => rejectMutation.mutate({ id: selectedMRS.id, remarks: 'Rejected by approver' })}
                          className="flex-1 h-10 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors"
                        >
                          Reject
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

        {/* Hidden print area — react-to-print renders this directly */}
        <div className="hidden">
          <div ref={printRef}>
            <MRSPrintTemplate data={detailedMRS} />
          </div>
        </div>

      </div>
    );
  }

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
                <h2 className="text-sm font-semibold text-slate-950">Requisition Control Desk</h2>
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
                {filtered.map(mrs => {
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
                        <div className="text-[11px] text-slate-500 mt-1">{dayjs(mrs.created_at).format('DD MMM YYYY')}</div>
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
                          Required {mrs.required_by ? dayjs(mrs.required_by).format('DD MMM YYYY') : '-'}
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
                        <StatusBadge status={mrs.status} />
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
              <StatBar label="Normal"   value={allMRS.filter(m => !m.priority || m.priority === 'normal').length}   total={allMRS.length} color="bg-slate-400" />
              <StatBar label="Urgent"   value={allMRS.filter(m => m.priority === 'urgent').length}                  total={allMRS.length} color="bg-yellow-400" />
              <StatBar label="Critical" value={allMRS.filter(m => m.priority === 'critical').length}                total={allMRS.length} color="bg-red-500" />
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 w-full max-w-6xl rounded-2xl flex flex-col max-h-[92vh] shadow-2xl overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Create Material Requisition</p>
                  <p className="text-xs text-slate-500 mt-0.5">Multi-stage approval document</p>
                </div>
              </div>
              <button
                onClick={resetForm}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Project Details */}
              <div className="border border-slate-200 rounded-xl p-5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Project Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <Field label="Project *">
                    <select
                      className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
                      value={formData.project_id}
                      onChange={e => setFormData(p => ({ ...p, project_id: e.target.value }))}
                    >
                      <option value="">Select project…</option>
                      {visibleProjects.map(proj => <option key={proj.id} value={proj.id}>{proj.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Department">
                    <select
                      className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
                      value={formData.department}
                      onChange={e => setFormData(p => ({ ...p, department: e.target.value }))}
                    >
                      <option value="Projects">Projects</option>
                      <option value="Civil">Civil</option>
                      <option value="Structural">Structural</option>
                      <option value="MEP">MEP (Mechanical/Electrical/Plumbing)</option>
                      <option value="Electrical">Electrical</option>
                      <option value="Plumbing">Plumbing</option>
                      <option value="HVAC">HVAC</option>
                      <option value="Finishing">Finishing</option>
                      <option value="Safety">Safety / HSE</option>
                      <option value="QA/QC">QA / QC</option>
                      <option value="Procurement">Procurement</option>
                      <option value="Stores">Stores</option>
                      <option value="Site Office">Site Office</option>
                      <option value="Admin">Admin</option>
                      <option value="HR">HR</option>
                      <option value="Finance">Finance</option>
                      <option value="IT">IT</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Security">Security</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>
                  <Field label="HO Project Name">
                    <input
                      className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
                      placeholder="HO project name"
                      value={formData.head_office_project_name}
                      onChange={e => setFormData(p => ({ ...p, head_office_project_name: e.target.value }))}
                    />
                  </Field>
                  <Field label="Site Incharge">
                    <input
                      className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
                      placeholder="Enter name"
                      value={formData.site_incharge}
                      onChange={e => setFormData(p => ({ ...p, site_incharge: e.target.value }))}
                    />
                  </Field>
                  <Field label="Required By *">
                    <input
                      type="date"
                      className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
                      value={formData.required_by}
                      onChange={e => setFormData(p => ({ ...p, required_by: e.target.value }))}
                    />
                  </Field>
                  <Field label="Priority">
                    <select
                      className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
                      value={formData.priority}
                      onChange={e => setFormData(p => ({ ...p, priority: e.target.value }))}
                    >
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                      <option value="critical">Critical</option>
                    </select>
                  </Field>
                </div>
              </div>

              {/* Material Items */}
              <div className="border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Material Items</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Select from store ledger or add new items</p>
                  </div>
                  <button
                    onClick={() => setItems([...items, { material: '', qty: '', unit: 'Nos', purpose: '' }])}
                    className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add Row
                  </button>
                </div>
                <div className="hidden lg:grid gap-1.5 mb-2" style={{ gridTemplateColumns: 'minmax(280px,2fr) 120px 110px minmax(240px,2fr) 44px' }}>
                  {['Material Name', 'Quantity', 'Unit', 'Purpose', ''].map(h => (
                    <div key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">{h}</div>
                  ))}
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-1 lg:grid-cols-[minmax(280px,2fr)_120px_110px_minmax(240px,2fr)_44px] gap-2 items-start rounded-lg lg:rounded-none border lg:border-0 border-slate-200 p-3 lg:p-0 bg-slate-50/60 lg:bg-transparent">
                      <MaterialCombobox
                        value={item.material}
                        inventoryItems={inventoryItems}
                        onChange={(materialName, unit) => {
                          const n = [...items];
                          n[idx].material = materialName;
                          if (unit) n[idx].unit = unit;
                          setItems(n);
                        }}
                        onNewItem={(prefill) => {
                          setNewItemTargetIdx(idx);
                          setNewItemForm(f => ({ ...f, material_name: prefill || '', category: '', category_custom: '', unit: item.unit || 'Nos' }));
                          setCategoryMode('select');
                          setShowNewItemModal(true);
                        }}
                      />
                      <input
                        type="number"
                        placeholder="0"
                        className="h-9 bg-white lg:bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none focus:border-indigo-400 transition-all text-right"
                        value={item.qty}
                        onChange={e => { const n = [...items]; n[idx].qty = e.target.value; setItems(n); }}
                      />
                      <select
                        className="h-9 bg-white lg:bg-slate-50 border border-slate-200 rounded-lg px-2 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
                        value={item.unit}
                        onChange={e => { const n = [...items]; n[idx].unit = e.target.value; setItems(n); }}
                      >
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <input
                        type="text"
                        placeholder="Intended use"
                        className="h-9 bg-white lg:bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none focus:border-indigo-400 transition-all"
                        value={item.purpose}
                        onChange={e => { const n = [...items]; n[idx].purpose = e.target.value; setItems(n); }}
                      />
                      <button
                        onClick={() => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); }}
                        disabled={items.length === 1}
                        className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all mt-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div className="border border-slate-200 rounded-xl p-5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Remarks</h3>
                <textarea
                  rows={3}
                  placeholder="Additional notes or special instructions…"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none focus:border-indigo-400 transition-all resize-none"
                  value={formData.remarks}
                  onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
              <span className="text-xs text-slate-500 font-semibold">{items.filter(i => i.material && i.qty).length} item(s) ready</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetForm}
                  className="px-5 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                  className="px-6 h-9 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-sm"
                >
                  {createMutation.isPending ? 'Submitting…' : 'Submit Requisition →'}
                </button>
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
                  className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
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
                  className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 transition-all"
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
      <label className="text-xs font-bold text-slate-700">{label}</label>
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

function MaterialCombobox({ value, inventoryItems, onChange, onNewItem }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || '');
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync display text when external value changes (e.g. after new item added)
  useEffect(() => { setQ(value || ''); }, [value]);

  const filtered = inventoryItems
    .filter(i => !q || i.material_name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 40);

  // Group by category
  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const hasResults = filtered.length > 0;

  const handleSelect = (item) => {
    setQ(item.material_name);
    onChange(item.material_name, item.unit);
    setOpen(false);
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    setQ(v);
    onChange(v, '');
    setOpen(true);
  };

  // Find category of selected item (for hint)
  const selectedItem = inventoryItems.find(i => i.material_name === value);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          placeholder="Search store ledger…"
          className="h-9 w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none focus:border-indigo-400 transition-all"
          value={q}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
      {selectedItem?.category && !open && (
        <div className="text-xs text-slate-500 px-1 mt-0.5 truncate">{selectedItem.category}</div>
      )}
      {open && (
        <div className="absolute z-[80] top-10 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          {!hasResults && q ? (
            <div className="px-3 py-2 text-xs text-slate-500 italic">No match for "{q}"</div>
          ) : !hasResults ? (
            <div className="px-3 py-2 text-xs text-slate-600 font-semibold">Store ledger is empty — add items below</div>
          ) : (
            Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat}>
                <div className="px-3 py-1 text-xs font-semibold text-slate-500 bg-slate-50 uppercase tracking-wider border-b border-slate-100 sticky top-0">
                  {cat}
                </div>
                {catItems.map(item => (
                  <button
                    key={item.material_name}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 flex items-center justify-between group transition-colors"
                  >
                    <span className="font-semibold">{item.material_name}</span>
                    <span className="text-slate-400 font-mono text-xs group-hover:text-indigo-400">{item.unit}</span>
                  </button>
                ))}
              </div>
            ))
          )}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setOpen(false); onNewItem(q); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-indigo-600 font-medium border-t border-slate-100 hover:bg-indigo-50 transition-colors"
          >
            <div className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Plus className="w-3 h-3 text-white" />
            </div>
            {q ? `Add "${q}" to store ledger` : 'Add new item to store ledger'}
          </button>
        </div>
      )}
    </div>
  );
}
