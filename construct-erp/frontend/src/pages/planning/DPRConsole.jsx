// src/pages/planning/DPRConsole.jsx
// DPR Console — full multi-view console styled after the provided mockup
// (navy/orange glass UI, Space Grotesk/Inter/JetBrains Mono). Renders inside
// the app's existing Layout; owns its own internal sidebar + topbar.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, FileText, FilePlus2, BarChart2, Smartphone, Settings as SettingsIcon,
  Search, Bell, ChevronRight, Check, X, Plus, Trash2, Camera, Send, ShieldCheck,
  Users, Truck, Package, AlertTriangle, Calendar, MapPin, Clock, CheckCircle2, Download,
  Upload, Mic, QrCode, Wifi, WifiOff, Image as ImageIcon, ChevronUp, ChevronDown, Edit2,
  Eye, GripVertical, FileSpreadsheet, TrendingUp, TrendingDown, Building2,
} from 'lucide-react';
import { planningAPI, projectAPI, documentsAPI, subcontractorAPI, vendorAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import DPRPrintTemplate from './DPRPrintTemplate';
import RecordAttachments from '../../components/shared/RecordAttachments';
import './dpr-console.css';

const NAV = [
  { key: 'dashboard', label: 'Dashboard',        icon: LayoutDashboard },
  { key: 'create',    label: 'Create DPR',        icon: FilePlus2 },
  { key: 'drafts',    label: 'Draft DPRs',        icon: FileText,  countKey: 'draft' },
  { key: 'submitted', label: 'Submitted DPRs',    icon: Send,      countKey: 'submitted' },
  { key: 'approved',  label: 'Approved DPRs',     icon: CheckCircle2, countKey: 'approved' },
  { key: 'gallery',   label: 'Image Gallery',     icon: ImageIcon },
  { key: 'reports',   label: 'Reports & Analytics', icon: BarChart2 },
  { key: 'mobile',    label: 'Mobile App',        icon: Smartphone },
  { key: 'settings',  label: 'Settings',          icon: SettingsIcon },
];

const STEEL_DIAS = ['8mm','10mm','12mm','16mm','20mm','25mm','32mm'];
const PLANT_ITEMS = [
  'Excavators / JCB','Dewatering Pumps','Compactors / Roller','D.G Sets','Tower Crane',
  'Transit Mixer','Concrete Pump','Bar Bending Machine','Bar Cutting Machine',
  'Welding Machine','Tippers','Hydra Crane','Fork Lift / Bobcat',
];
const LABOUR_CATEGORIES = ['Mason','Carpenter','Barbender','Scaffolder','Unskilled','Helpers','Supporting Team (P&M)'];
const SAFETY_CHECKS = [
  'Toolbox Talk Conducted', 'PPE Compliance Verified', 'Fire Extinguishers Checked',
  'Barricades / Signage in Place', 'First Aid Kit Available',
];
const QUALITY_CHECKS = [
  'Material Inspection Done', 'Work Cleared as per Drawing', 'Curing Compliance',
  'Rework / NCR Raised Cleared', 'Checklist Signed by QC',
];
const STEPS = ['Header','Activities','Manpower','Equipment','Material','Issues','Safety & QC','Photos','Approval'];

function emptyWizardDraft(projectId) {
  return {
    project_id: projectId,
    report_date: dayjs().format('YYYY-MM-DD'),
    weather: 'sunny',
    site_conditions: 'Dry',
    rain_log: '',
    client_name: '', contractor_name: '', site_location: '', shift: 'Day',
    work_items: [{ description: '', unit: 'Cum', boq_qty: '', planned: '', achieved: '', cumulative: '', remarks: '' }],
    concrete_today: [],
    steel: STEEL_DIAS.map(d => ({ dia: d, receipts_today: '', receipts_till_date: '', available: '', consumption: '' })),
    materials: [{ name: '', unit: '', opening: '', received: '', consumed: '', closing: '', remarks: '' }],
    staff: [
      { category: 'Engineer', nos: '' }, { category: 'Supervisor', nos: '' },
      { category: 'Safety', nos: '' }, { category: 'Stores', nos: '' },
    ],
    direct_workers: LABOUR_CATEGORIES.map(c => ({ category: c, day: '', night: '' })),
    subcontractors: [{ subcontract_wo_id: '', vendor_id: '', name: '', work: '', day: '', night: '' }],
    plant_items: PLANT_ITEMS.map(p => ({ item: p, nos: '' })),
    issues_list: [],
    safety_checklist: Object.fromEntries(SAFETY_CHECKS.map(c => [c, false])),
    quality_checklist: Object.fromEntries(QUALITY_CHECKS.map(c => [c, false])),
    constraints: '', rfi: '',
    prepared_by: '', approved_by: '', reviewed_by: '',
    approval_chain: ['Site Engineer','Project Engineer','Construction Manager','Project Manager','Client Approval'],
  };
}

function Inp(props) {
  return <input {...props} className={clsx('w-full', props.className)} />;
}
function Sel({ children, ...props }) {
  return <select {...props} className={clsx('w-full', props.className)}>{children}</select>;
}

function StatusBadge({ status }) {
  const cfg = {
    draft:     { cls: 'neutral', label: 'Draft' },
    submitted: { cls: 'warn',    label: 'Submitted' },
    approved:  { cls: 'ok',      label: 'Approved' },
    rejected:  { cls: 'danger',  label: 'Rejected' },
  }[status] || { cls: 'neutral', label: status || 'Draft' };
  return <span className={clsx('badge', cfg.cls)}>{cfg.label}</span>;
}

// ─────────────────────────────────────────────────────────────────────────
// Toolbar — tab pills + project filter + search + notifications
// (replaces the old inner sidebar/topbar: the app Layout already provides
// global navigation, so the console only needs its own view switcher)
// ─────────────────────────────────────────────────────────────────────────
function Toolbar({ view, setView, counts, search, setSearch, notifItems, projects, projectId, setProjectId }) {
  const [open, setOpen] = useState(false);
  const unread = notifItems.filter(n => n.unread).length;
  return (
    <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Tab pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {NAV.map(item => {
            const Icon = item.icon;
            const count = item.countKey ? counts?.[item.countKey] : null;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition whitespace-nowrap',
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                )}
              >
                <Icon size={13} />
                {item.label}
                {!!count && (
                  <span className={clsx(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                    active ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'
                  )}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 ml-auto">
          <select
            className="h-8 text-xs font-medium border border-slate-200 rounded-lg px-2 text-slate-600 bg-white focus:border-indigo-400 focus:outline-none max-w-[180px]"
            value={projectId} onChange={e => setProjectId(e.target.value)}
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="hidden md:flex items-center gap-2 h-8 bg-white border border-slate-200 rounded-lg px-2.5 w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              placeholder="Search DPRs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border-none outline-none w-full bg-transparent text-xs text-slate-700"
            />
          </div>
          <div className="relative">
            <button
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition relative"
              onClick={() => setOpen(o => !o)}
            >
              <Bell className="w-4 h-4" />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white">
                  {unread}
                </span>
              )}
            </button>
            {open && (
              <div className="absolute top-10 right-0 w-80 max-h-[420px] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700">Notifications</h4>
                  <button className="text-[11px] font-semibold text-indigo-600" onClick={() => setOpen(false)}>Close</button>
                </div>
                {notifItems.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">No alerts right now.</div>
                ) : notifItems.map((n, i) => (
                  <div key={i} className={clsx('flex gap-2.5 px-4 py-3 border-b border-slate-50', n.unread && 'bg-indigo-50/40')}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: n.bg, color: n.fg }}>
                      <n.Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <b className="text-xs text-slate-800 block">{n.title}</b>
                      <p className="text-[11px] text-slate-500 mt-0.5">{n.body}</p>
                      <time className="text-[10px] text-slate-400">{n.time}</time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Dashboard view
// ─────────────────────────────────────────────────────────────────────────
function DashboardView({ dashboard, setView }) {
  const k = dashboard?.kpis || {};
  const trend = dashboard?.trend || [];
  const projectProgress = dashboard?.project_progress || [];
  const recent = dashboard?.recent_dprs || [];

  const kpis = [
    { label: 'DPRs Today',        val: k.dprs_today ?? 0,        delta: (k.dprs_today ?? 0) - (k.dprs_yesterday ?? 0) },
    { label: 'Projects Updated',  val: k.projects_updated ?? 0 },
    { label: 'Activities Done',   val: k.activities_done_today ?? 0 },
    { label: 'Total Manpower',    val: k.total_manpower ?? 0 },
    { label: 'Equipment Running', val: `${k.equipment_running ?? 0}/${k.equipment_total ?? 0}` },
    { label: 'Delayed Activities',val: k.delayed_activities ?? 0, warn: (k.delayed_activities ?? 0) > 0 },
    { label: 'Pending Approvals', val: k.pending_approvals ?? 0, warn: (k.pending_approvals ?? 0) > 0 },
  ];

  return (
    <div className="view">
      <div className="kpi-grid">
        {kpis.map(x => (
          <div className="card kpi" key={x.label}>
            <div className="kicker">{x.label}</div>
            <div className="val" style={x.warn ? { color: 'var(--danger)' } : undefined}>{x.val}</div>
            {typeof x.delta === 'number' && (
              <div className={clsx('delta', x.delta >= 0 ? 'up' : 'down')}>
                {x.delta >= 0 ? <TrendingUp size={12} style={{ display: 'inline' }} /> : <TrendingDown size={12} style={{ display: 'inline' }} />}
                {' '}{x.delta >= 0 ? '+' : ''}{x.delta} vs yesterday
              </div>
            )}
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="pulse">
          <div className="tag"><span className="pulse-dot" /> Live</div>
          <div className="pulse-track">
            <ul>
              {recent.concat(recent).map((r, i) => (
                <li key={i}><b>{r.project_name}</b> — DPR #{r.dpr_number} {r.status}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="chart-grid">
        <div className="card chart-card">
          <div className="chd"><h3>Planned vs Executed (14 days)</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-200)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="planned_pct" stroke="var(--blue-700)" strokeWidth={2} dot={false} name="Planned %" />
              <Line type="monotone" dataKey="executed_pct" stroke="var(--orange-500)" strokeWidth={2} dot={false} name="Executed %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card chart-card">
          <div className="chd"><h3>Project Progress</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={projectProgress} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="project_name" tick={{ fontSize: 10 }} width={110} />
              <Tooltip />
              <Bar dataKey="avg_pct" fill="var(--blue-700)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="chd" style={{ marginBottom: 12 }}>
          <h3>Recent DPRs</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => setView('drafts')}>View all</button>
        </div>
        <div className="dpr-list">
          {recent.slice(0, 8).map(r => (
            <div className="dpr-row" key={r.id}>
              <div className="id mono">{r.dpr_number || r.id.slice(0, 8)}</div>
              <div className="proj"><b>{r.project_name}</b><span>{dayjs(r.report_date).format('DD MMM YYYY')}</span></div>
              <div className="meta">{r.submitted_by_name || '—'}</div>
              <div className="stat"><StatusBadge status={r.status} /></div>
            </div>
          ))}
          {recent.length === 0 && <div className="empty-state"><FileText /><h3>No DPRs yet</h3><p>Create your first Daily Progress Report to see activity here.</p></div>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DPR list views (drafts / submitted / approved)
// ─────────────────────────────────────────────────────────────────────────
function DPRListView({ title, status, dprs, isLoading, onView, setView }) {
  return (
    <div className="view">
      <div className="card" style={{ padding: 20 }}>
        <div className="chd" style={{ marginBottom: 14 }}>
          <h3>{title}</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setView('create')}><Plus size={14} /> New DPR</button>
        </div>
        {isLoading ? (
          <div className="empty-state"><Clock /><h3>Loading…</h3></div>
        ) : dprs.length === 0 ? (
          <div className="empty-state"><FileText /><h3>No {title.toLowerCase()}</h3><p>Reports will appear here once submitted.</p></div>
        ) : (
          <div className="dpr-list">
            {dprs.map(d => (
              <div className="dpr-row" key={d.id} onClick={() => onView(d)} style={{ cursor: 'pointer' }}>
                <div className="id mono">{d.dpr_number || d.id.slice(0, 8)}</div>
                <div className="proj"><b>{d.project_name}</b><span>{d.submitted_by_name || '—'}</span></div>
                <div className="meta">{dayjs(d.report_date).format('DD MMM YYYY')}</div>
                <div className="meta">{d.activities_count} activities · {d.total_workers} workers</div>
                <div className="stat"><StatusBadge status={d.status} /></div>
                <div className="go"><ChevronRight size={16} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DPR detail / approval drawer
// ─────────────────────────────────────────────────────────────────────────
function DPRDetailDrawer({ dpr, project, onClose, qc }) {
  const { user } = useAuthStore();
  const [comment, setComment] = useState('');
  const canApprove = ['project_manager', 'admin', 'super_admin', 'construction_manager'].includes(user?.role);

  const actionMut = useMutation({
    mutationFn: (action) => planningAPI.approvalAction(dpr.id, { action, comment }),
    onSuccess: () => {
      toast.success('Updated');
      qc.invalidateQueries({ queryKey: ['dpr-console-list'] });
      qc.invalidateQueries({ queryKey: ['dpr-console-dashboard'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Action failed'),
  });

  const chain = dpr.approval_chain?.length ? dpr.approval_chain : ['Site Engineer', 'Project Manager'];
  const history = dpr.approval_history || [];
  const approvedCount = history.filter(h => h.action === 'approve').length;

  return (
    <div className="fixed inset-0 z-50 flex" style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(10,20,32,0.35)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="dpr-console" style={{ width: 980, maxWidth: '92vw', background: 'var(--gray-50)', height: '100vh', overflowY: 'auto', boxShadow: '-16px 0 44px rgba(0,0,0,0.25)' }}>
        <div className="topbar" style={{ position: 'sticky' }}>
          <div>
            <h1>DPR #{dpr.dpr_number || dpr.id.slice(0, 8)}</h1>
            <div className="crumb">{project?.name} · {dayjs(dpr.report_date).format('DD MMM YYYY')}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={dpr.status} />
            <button className="icon-btn" onClick={onClose}><X /></button>
          </div>
        </div>
        <div className="view">
          <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
            <h3 style={{ marginBottom: 14 }}>Approval Progress</h3>
            <div className="approval-flow">
              {chain.map((role, i) => {
                const done = i < approvedCount;
                const current = i === approvedCount && dpr.status !== 'approved' && dpr.status !== 'rejected';
                const rejected = dpr.status === 'rejected' && i === approvedCount;
                return (
                  <React.Fragment key={role}>
                    <div className={clsx('af-step', done && 'done', current && 'current', rejected && 'rejected')}>
                      <div className="circ">{done ? <Check size={16} /> : i + 1}</div>
                      <div className="role">{role}</div>
                      <div className="stat">{done ? 'Approved' : current ? 'Pending' : rejected ? 'Rejected' : 'Waiting'}</div>
                    </div>
                    {i < chain.length - 1 && <div className={clsx('af-line', done && 'done')} />}
                  </React.Fragment>
                );
              })}
            </div>
            {history.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {history.map((h, i) => (
                  <div className="hist-item" key={i}>
                    <div className="av2">{(h.role || '?').slice(0, 2).toUpperCase()}</div>
                    <div className="body">
                      <b>{h.role} — {h.action}</b>
                      {h.comment && <p>{h.comment}</p>}
                      <time>{h.at ? dayjs(h.at).format('DD MMM YYYY, hh:mm A') : ''}</time>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {canApprove && dpr.status !== 'approved' && dpr.status !== 'rejected' && (
              <div className="comment-box" style={{ marginTop: 14 }}>
                <textarea placeholder="Add a comment (optional)…" value={comment} onChange={e => setComment(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-primary btn-sm" disabled={actionMut.isPending} onClick={() => actionMut.mutate('approve')}>
                    <Check size={14} /> Approve
                  </button>
                  <button className="btn btn-outline btn-sm" disabled={actionMut.isPending} onClick={() => actionMut.mutate('return')}>
                    Return for Revision
                  </button>
                  <button className="btn btn-danger-outline btn-sm" disabled={actionMut.isPending} onClick={() => actionMut.mutate('reject')}>
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <DPRPrintTemplate dpr={dpr} project={project} />
          </div>
          <div className="card" style={{ padding: 20, marginTop: 16 }}>
            <RecordAttachments module="daily_progress_report" recordId={dpr.id} projectId={dpr.project_id} label="DPR Photos & Attachments" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Gallery view
// ─────────────────────────────────────────────────────────────────────────
function GalleryView() {
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['dpr-console-gallery'],
    queryFn: () => documentsAPI.list({ module: 'daily_progress_report' }).then(r => r.data?.data ?? r.data ?? []),
  });
  const images = docs.filter(d => /\.(jpe?g|png|webp|gif)$/i.test(d.file_name || d.filename || ''));

  return (
    <div className="view">
      <div className="card" style={{ padding: 20 }}>
        <div className="chd" style={{ marginBottom: 6 }}>
          <h3>Image Gallery</h3>
          <span className="pill-note">{images.length} photos</span>
        </div>
        {isLoading ? (
          <div className="empty-state"><Clock /><h3>Loading…</h3></div>
        ) : images.length === 0 ? (
          <div className="empty-state"><ImageIcon /><h3>No photos yet</h3><p>Photos attached to DPRs will appear here automatically.</p></div>
        ) : (
          <div className="gallery-grid">
            {images.map(d => (
              <div className="photo-card" key={d.id}>
                <div className="photo-thumb">
                  <img src={d.file_url || d.url || d.path} alt={d.file_name} onError={e => { e.target.style.display = 'none'; }} />
                </div>
                <div className="photo-meta">
                  <div className="cap">{d.file_name || d.filename || 'Photo'}</div>
                  <div className="row2f">
                    <span>{d.project_name || ''}</span>
                    <span>{d.created_at ? dayjs(d.created_at).format('DD MMM YYYY') : ''}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Reports & Analytics view
// ─────────────────────────────────────────────────────────────────────────
function ReportsView({ dprs, projects }) {
  const [reportProject, setReportProject] = useState('');
  const filtered = reportProject ? dprs.filter(d => d.project_id === reportProject) : dprs;

  const exportExcel = () => {
    const rows = filtered.map(d => ({
      'DPR #': d.dpr_number, Project: d.project_name, Date: dayjs(d.report_date).format('DD-MMM-YYYY'),
      Status: d.status, 'Prepared By': d.submitted_by_name, Activities: d.activities_count,
      'Total Workers': d.total_workers, 'Photos': d.photos_count,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DPR Report');
    XLSX.writeFile(wb, `DPR_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('DPR Summary Report', 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [['DPR #', 'Project', 'Date', 'Status', 'Prepared By', 'Activities', 'Workers', 'Photos']],
      body: filtered.map(d => [
        d.dpr_number, d.project_name, dayjs(d.report_date).format('DD-MMM-YYYY'), d.status,
        d.submitted_by_name, d.activities_count, d.total_workers, d.photos_count,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 41, 66] },
    });
    doc.save(`DPR_Report_${dayjs().format('YYYY-MM-DD')}.pdf`);
  };

  const byStatus = ['draft', 'submitted', 'approved', 'rejected'].map(s => ({
    name: s, value: filtered.filter(d => d.status === s).length,
  })).filter(x => x.value > 0);
  const COLORS = { draft: '#93A0B2', submitted: '#E8720C', approved: '#1E9E6B', rejected: '#D8402F' };

  return (
    <div className="view">
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="chd">
          <h3>Reports & Analytics</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="btn btn-ghost btn-sm" value={reportProject} onChange={e => setReportProject(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn btn-outline btn-sm" onClick={exportExcel}><FileSpreadsheet size={14} /> Excel</button>
            <button className="btn btn-primary btn-sm" onClick={exportPDF}><Download size={14} /> PDF</button>
          </div>
        </div>
      </div>
      <div className="chart-grid row2">
        <div className="card chart-card">
          <div className="chd"><h3>Status Split</h3></div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                {byStatus.map((entry, i) => <Cell key={i} fill={COLORS[entry.name]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card chart-card">
          <div className="chd"><h3>DPRs per Project</h3></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={projects.map(p => ({ name: p.name, count: dprs.filter(d => d.project_id === p.id).length })).filter(x => x.count > 0)}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--blue-700)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card chart-card">
          <div className="chd"><h3>Photos Captured</h3></div>
          <div className="val" style={{ fontSize: 34, padding: '20px 0', textAlign: 'center' }}>
            {filtered.reduce((s, d) => s + (d.photos_count || 0), 0)}
          </div>
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead><tr>{['DPR #', 'Project', 'Date', 'Status', 'Prepared By', 'Activities', 'Workers', 'Photos'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.slice(0, 100).map(d => (
              <tr key={d.id}>
                <td className="mono">{d.dpr_number}</td>
                <td>{d.project_name}</td>
                <td>{dayjs(d.report_date).format('DD MMM YYYY')}</td>
                <td><StatusBadge status={d.status} /></td>
                <td>{d.submitted_by_name}</td>
                <td>{d.activities_count}</td>
                <td>{d.total_workers}</td>
                <td>{d.photos_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Mobile App preview view
// ─────────────────────────────────────────────────────────────────────────
function MobileView({ dashboard }) {
  const k = dashboard?.kpis || {};
  const features = [
    { icon: Camera, title: 'Photo Capture', desc: 'Attach geo-tagged site photos directly from the camera' },
    { icon: Mic, title: 'Voice Notes', desc: 'Dictate constraints & remarks on the move' },
    { icon: QrCode, title: 'QR Asset Scan', desc: 'Scan plant & equipment tags to log usage' },
    { icon: WifiOff, title: 'Offline Drafts', desc: 'Keep filling DPRs with no signal, sync later' },
  ];
  return (
    <div className="view">
      <div className="mobile-wrap">
        <div className="phone dark">
          <div className="notch" />
          <div className="screen">
            <div className="screen-status"><span>9:41</span><span>●●●●</span></div>
            <div className="sync-banner">Synced just now</div>
            <div className="screen-topbar"><b>DPR Mobile</b><Bell size={16} /></div>
            <div className="screen-body">
              <div className="m-card"><b>Today's DPR</b><p>{k.dprs_today ?? 0} submitted across {k.projects_updated ?? 0} sites</p></div>
              <div className="m-card"><b>Manpower on site</b><p>{k.total_manpower ?? 0} workers checked in</p></div>
              <div className="m-card"><b>Pending Approvals</b><p>{k.pending_approvals ?? 0} awaiting your action</p></div>
              <button className="mic-btn"><Mic /></button>
              <div className="m-card"><b>Quick Actions</b><p>New DPR · Attach Photo · Report Issue</p></div>
            </div>
          </div>
        </div>
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ marginBottom: 6 }}>BCIM ERP Mobile</h3>
            <p style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 14 }}>
              The companion mobile app (Expo / React Native, <code className="mono">mobile-app/</code>) lets site
              engineers submit DPRs, attach photos and track approvals from the field. Scan the QR code from the
              app's login screen or install it from your organization's distribution link.
            </p>
            <div className="qr-box"><QrCode size={60} color="var(--gray-400)" /></div>
          </div>
          <div className="mobile-feature-list">
            {features.map(f => (
              <div className="mf-item" key={f.title}>
                <div className="ic"><f.icon /></div>
                <div className="tx"><b>{f.title}</b><span>{f.desc}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Settings view
// ─────────────────────────────────────────────────────────────────────────
function SettingsView() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['dpr-settings'],
    queryFn: () => planningAPI.getDPRSettings().then(r => r.data?.data ?? r.data ?? {}),
  });
  const [form, setForm] = useState(null);
  useEffect(() => { if (settings && !form) setForm(settings); }, [settings]);

  const saveMut = useMutation({
    mutationFn: (d) => planningAPI.updateDPRSettings(d),
    onSuccess: () => { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['dpr-settings'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  if (isLoading || !form) return <div className="view"><div className="empty-state"><Clock /><h3>Loading settings…</h3></div></div>;

  const chain = form.approval_chain || [];
  const setChainRole = (i, val) => setForm(f => ({ ...f, approval_chain: chain.map((r, idx) => idx === i ? val : r) }));
  const addChainRole = () => setForm(f => ({ ...f, approval_chain: [...chain, 'New Role'] }));
  const removeChainRole = (i) => setForm(f => ({ ...f, approval_chain: chain.filter((_, idx) => idx !== i) }));
  const notif = form.notification_rules || {};
  const toggleNotif = (k) => setForm(f => ({ ...f, notification_rules: { ...notif, [k]: !notif[k] } }));

  return (
    <div className="view">
      <div className="card form-section">
        <div className="fs-head"><h2>Numbering</h2><p>Controls the auto-generated DPR number format</p></div>
        <div className="grid g-3">
          <div className="field"><label>Prefix</label><input value={form.number_prefix || ''} onChange={e => setForm(f => ({ ...f, number_prefix: e.target.value }))} /></div>
          <div className="field"><label>Next Number</label><input type="number" value={form.number_next || 1} onChange={e => setForm(f => ({ ...f, number_next: Number(e.target.value) }))} /></div>
          <div className="field"><label>Padding Digits</label><input type="number" value={form.number_pad || 4} onChange={e => setForm(f => ({ ...f, number_pad: Number(e.target.value) }))} /></div>
        </div>
      </div>

      <div className="card form-section" style={{ marginTop: 16 }}>
        <div className="fs-head"><h2>Approval Chain</h2><p>Order of roles a DPR moves through before final approval</p></div>
        <div className="chain-list">
          {chain.map((role, i) => (
            <div className="chain-row" key={i}>
              <div className="num">{i + 1}</div>
              <input value={role} onChange={e => setChainRole(i, e.target.value)} />
              <div className="cbtns"><button onClick={() => removeChainRole(i)}><X size={12} /></button></div>
            </div>
          ))}
          <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addChainRole}><Plus size={14} /> Add Role</button>
        </div>
      </div>

      <div className="card form-section" style={{ marginTop: 16 }}>
        <div className="fs-head"><h2>Notifications</h2><p>Choose which events trigger alerts</p></div>
        <div className="checklist">
          {Object.keys(notif).map(k => (
            <div className="chk-item" key={k}>
              <span className="lab">{k.replace(/_/g, ' ')}</span>
              <label className="switch">
                <input type="checkbox" checked={!!notif[k]} onChange={() => toggleNotif(k)} />
                <span className="slider" />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="card form-section" style={{ marginTop: 16 }}>
        <div className="fs-head"><h2>Sync & Field Capture</h2><p>Mobile app sync and photo behaviour</p></div>
        <div className="grid g-3">
          <div className="field">
            <label>Sync Frequency</label>
            <select value={form.sync_frequency || 'realtime'} onChange={e => setForm(f => ({ ...f, sync_frequency: e.target.value }))}>
              <option value="realtime">Real-time</option>
              <option value="15min">Every 15 minutes</option>
              <option value="hourly">Hourly</option>
              <option value="manual">Manual only</option>
            </select>
          </div>
          <div className="field">
            <label>Photo Quality</label>
            <select value={form.photo_quality || 'compressed'} onChange={e => setForm(f => ({ ...f, photo_quality: e.target.value }))}>
              <option value="compressed">Compressed</option>
              <option value="original">Original</option>
            </select>
          </div>
          <div className="field">
            <label>Offline Drafts</label>
            <label className="switch" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={!!form.allow_offline_drafts} onChange={() => setForm(f => ({ ...f, allow_offline_drafts: !f.allow_offline_drafts }))} />
              <span className="slider" />
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate(form)}>
          <Check size={15} /> {saveMut.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Create DPR — 9 step wizard
// ─────────────────────────────────────────────────────────────────────────
function CreateWizard({ projects, projectId, setProjectId, setView, qc, editing, setEditing }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => editing ? { ...editing } : emptyWizardDraft(projectId));
  const F = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateRow = (key, idx, field, val) => {
    const arr = [...(form[key] || [])];
    arr[idx] = { ...arr[idx], [field]: val };
    F(key, arr);
  };
  const addRow = (key, template) => F(key, [...(form[key] || []), template]);
  const removeRow = (key, idx) => F(key, (form[key] || []).filter((_, i) => i !== idx));

  const saveMut = useMutation({
    mutationFn: (payload) => editing ? planningAPI.updateDPR(editing.id, payload) : planningAPI.createDPR(payload),
    onSuccess: () => {
      toast.success(editing ? 'DPR updated' : 'DPR created');
      qc.invalidateQueries({ queryKey: ['dpr-console-list'] });
      qc.invalidateQueries({ queryKey: ['dpr-console-dashboard'] });
      setEditing?.(null);
      setView('drafts');
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const submit = (status) => {
    if (!form.project_id) return toast.error('Select a project first');
    if (!form.report_date) return toast.error('Report date is required');
    saveMut.mutate({ ...form, status: status || form.status || 'draft' });
  };

  return (
    <div className="view">
      <div className="stepper">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={clsx('step', i === step && 'active', i < step && 'done')} onClick={() => setStep(i)}>
              <div className="n">{i < step ? <Check size={13} /> : i + 1}</div>
              <div className="t">{s}</div>
            </div>
            {i < STEPS.length - 1 && <div className="step-sep" />}
          </React.Fragment>
        ))}
      </div>

      <div className="card form-section">
        {step === 0 && (
          <>
            <div className="fs-head"><h2>Header</h2><p>Project, date and site conditions for this report</p></div>
            <div className="grid g-4">
              <div className="field"><label>Project *</label>
                <select value={form.project_id || ''} onChange={e => { F('project_id', e.target.value); setProjectId(e.target.value); }}>
                  <option value="">Select project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Report Date *</label><input type="date" value={form.report_date} onChange={e => F('report_date', e.target.value)} /></div>
              <div className="field"><label>Shift</label>
                <select value={form.shift} onChange={e => F('shift', e.target.value)}><option>Day</option><option>Night</option></select>
              </div>
              <div className="field"><label>Weather</label>
                <select value={form.weather} onChange={e => F('weather', e.target.value)}>
                  <option value="sunny">Sunny</option><option value="cloudy">Cloudy</option><option value="rainy">Rainy</option><option value="normal">Normal</option>
                </select>
              </div>
              <div className="field"><label>Site Conditions</label>
                <select value={form.site_conditions} onChange={e => F('site_conditions', e.target.value)}>
                  {['Dry','Slushy','Wet','Rainy'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field"><label>Site Location</label><input value={form.site_location} onChange={e => F('site_location', e.target.value)} /></div>
              <div className="field"><label>Client Name</label><input value={form.client_name} onChange={e => F('client_name', e.target.value)} /></div>
              <div className="field"><label>Contractor Name</label><input value={form.contractor_name} onChange={e => F('contractor_name', e.target.value)} /></div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="fs-head">
              <div><h2>Activities</h2><p>Work progress against BOQ quantities</p></div>
              <button className="btn btn-outline btn-sm" onClick={() => addRow('work_items', { description: '', unit: 'Cum', boq_qty: '', planned: '', achieved: '', cumulative: '', remarks: '' })}><Plus size={14} /> Add Row</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>{['Description', 'Unit', 'BOQ Qty', 'Planned', 'Achieved', 'Cumulative', 'Remarks', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {(form.work_items || []).map((r, i) => (
                    <tr key={i}>
                      <td><input value={r.description} onChange={e => updateRow('work_items', i, 'description', e.target.value)} /></td>
                      <td><input value={r.unit} onChange={e => updateRow('work_items', i, 'unit', e.target.value)} /></td>
                      <td><input type="number" value={r.boq_qty} onChange={e => updateRow('work_items', i, 'boq_qty', e.target.value)} /></td>
                      <td><input type="number" value={r.planned} onChange={e => updateRow('work_items', i, 'planned', e.target.value)} /></td>
                      <td><input type="number" value={r.achieved} onChange={e => updateRow('work_items', i, 'achieved', e.target.value)} /></td>
                      <td><input type="number" value={r.cumulative} onChange={e => updateRow('work_items', i, 'cumulative', e.target.value)} /></td>
                      <td><input value={r.remarks} onChange={e => updateRow('work_items', i, 'remarks', e.target.value)} /></td>
                      <td><button className="row-del" onClick={() => removeRow('work_items', i)}><X size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="fs-head"><h2>Manpower</h2><p>Staff, direct workers and subcontractor labour</p></div>
            <div className="grid g-3">
              <div>
                <h3 style={{ fontSize: 13, marginBottom: 8 }}>Staff</h3>
                <div className="table-wrap"><table><thead><tr><th>Category</th><th>Nos</th></tr></thead>
                  <tbody>{(form.staff || []).map((s, i) => (
                    <tr key={i}><td>{s.category}</td><td><input type="number" value={s.nos} onChange={e => updateRow('staff', i, 'nos', e.target.value)} /></td></tr>
                  ))}</tbody></table></div>
              </div>
              <div>
                <h3 style={{ fontSize: 13, marginBottom: 8 }}>Direct Workers</h3>
                <div className="table-wrap"><table><thead><tr><th>Category</th><th>Day</th><th>Night</th></tr></thead>
                  <tbody>{(form.direct_workers || []).map((w, i) => (
                    <tr key={i}><td>{w.category}</td>
                      <td><input type="number" value={w.day} onChange={e => updateRow('direct_workers', i, 'day', e.target.value)} /></td>
                      <td><input type="number" value={w.night} onChange={e => updateRow('direct_workers', i, 'night', e.target.value)} /></td>
                    </tr>
                  ))}</tbody></table></div>
              </div>
              <div>
                <div className="fs-head" style={{ marginBottom: 6 }}>
                  <h3 style={{ fontSize: 13 }}>Subcontractors</h3>
                  <button className="btn btn-outline btn-sm" onClick={() => addRow('subcontractors', { name: '', work: '', day: '', night: '' })}><Plus size={12} /></button>
                </div>
                <div className="table-wrap"><table><thead><tr><th>Name</th><th>Work</th><th>Day</th><th>Night</th><th /></tr></thead>
                  <tbody>{(form.subcontractors || []).map((s, i) => (
                    <tr key={i}>
                      <td><input value={s.name} onChange={e => updateRow('subcontractors', i, 'name', e.target.value)} /></td>
                      <td><input value={s.work} onChange={e => updateRow('subcontractors', i, 'work', e.target.value)} /></td>
                      <td><input type="number" value={s.day} onChange={e => updateRow('subcontractors', i, 'day', e.target.value)} /></td>
                      <td><input type="number" value={s.night} onChange={e => updateRow('subcontractors', i, 'night', e.target.value)} /></td>
                      <td><button className="row-del" onClick={() => removeRow('subcontractors', i)}><X size={12} /></button></td>
                    </tr>
                  ))}</tbody></table></div>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="fs-head"><h2>Equipment</h2><p>Plant & machinery deployed on site</p></div>
            <div className="grid g-3">
              {(form.plant_items || []).map((p, i) => (
                <div className="field" key={i}>
                  <label>{p.item}</label>
                  <input type="number" value={p.nos} onChange={e => updateRow('plant_items', i, 'nos', e.target.value)} />
                </div>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="fs-head">
              <div><h2>Material</h2><p>Steel and generic material consumption</p></div>
              <button className="btn btn-outline btn-sm" onClick={() => addRow('materials', { name: '', unit: '', opening: '', received: '', consumed: '', closing: '', remarks: '' })}><Plus size={14} /> Add Material</button>
            </div>
            <h3 style={{ fontSize: 13, margin: '4px 0 8px' }}>Steel (MT)</h3>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table><thead><tr><th>Dia</th><th>Receipts Today</th><th>Till Date</th><th>Available</th><th>Consumption</th></tr></thead>
                <tbody>{(form.steel || []).map((s, i) => (
                  <tr key={i}>
                    <td>{s.dia}</td>
                    <td><input type="number" value={s.receipts_today} onChange={e => updateRow('steel', i, 'receipts_today', e.target.value)} /></td>
                    <td><input type="number" value={s.receipts_till_date} onChange={e => updateRow('steel', i, 'receipts_till_date', e.target.value)} /></td>
                    <td><input type="number" value={s.available} onChange={e => updateRow('steel', i, 'available', e.target.value)} /></td>
                    <td><input type="number" value={s.consumption} onChange={e => updateRow('steel', i, 'consumption', e.target.value)} /></td>
                  </tr>
                ))}</tbody></table>
            </div>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>Other Materials</h3>
            <div className="table-wrap">
              <table><thead><tr>{['Name', 'Unit', 'Opening', 'Received', 'Consumed', 'Closing', 'Remarks', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{(form.materials || []).map((m, i) => (
                  <tr key={i}>
                    <td><input value={m.name} onChange={e => updateRow('materials', i, 'name', e.target.value)} /></td>
                    <td><input value={m.unit} onChange={e => updateRow('materials', i, 'unit', e.target.value)} /></td>
                    <td><input type="number" value={m.opening} onChange={e => updateRow('materials', i, 'opening', e.target.value)} /></td>
                    <td><input type="number" value={m.received} onChange={e => updateRow('materials', i, 'received', e.target.value)} /></td>
                    <td><input type="number" value={m.consumed} onChange={e => updateRow('materials', i, 'consumed', e.target.value)} /></td>
                    <td><input type="number" value={m.closing} onChange={e => updateRow('materials', i, 'closing', e.target.value)} /></td>
                    <td><input value={m.remarks} onChange={e => updateRow('materials', i, 'remarks', e.target.value)} /></td>
                    <td><button className="row-del" onClick={() => removeRow('materials', i)}><X size={12} /></button></td>
                  </tr>
                ))}</tbody></table>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div className="fs-head">
              <div><h2>Issues</h2><p>Delays, blockers and constraints</p></div>
              <button className="btn btn-outline btn-sm" onClick={() => addRow('issues_list', { category: '', description: '', impact: '', responsible: '', status: 'Open' })}><Plus size={14} /> Add Issue</button>
            </div>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table><thead><tr>{['Category', 'Description', 'Impact', 'Responsible', 'Status', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{(form.issues_list || []).map((it, i) => (
                  <tr key={i}>
                    <td><input value={it.category} onChange={e => updateRow('issues_list', i, 'category', e.target.value)} /></td>
                    <td><input value={it.description} onChange={e => updateRow('issues_list', i, 'description', e.target.value)} /></td>
                    <td><input value={it.impact} onChange={e => updateRow('issues_list', i, 'impact', e.target.value)} /></td>
                    <td><input value={it.responsible} onChange={e => updateRow('issues_list', i, 'responsible', e.target.value)} /></td>
                    <td>
                      <select value={it.status} onChange={e => updateRow('issues_list', i, 'status', e.target.value)}>
                        <option>Open</option><option>In Progress</option><option>Resolved</option>
                      </select>
                    </td>
                    <td><button className="row-del" onClick={() => removeRow('issues_list', i)}><X size={12} /></button></td>
                  </tr>
                ))}</tbody></table>
            </div>
            <div className="grid g-2">
              <div className="field"><label>Constraints / Issues (free text)</label><textarea rows={3} value={form.constraints} onChange={e => F('constraints', e.target.value)} /></div>
              <div className="field"><label>RFI / Open Items</label><textarea rows={3} value={form.rfi} onChange={e => F('rfi', e.target.value)} /></div>
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <div className="fs-head"><h2>Safety & QC</h2><p>Daily compliance checklist</p></div>
            <div className="grid g-2">
              <div>
                <h3 style={{ fontSize: 13, marginBottom: 8 }}>Safety</h3>
                <div className="checklist">
                  {SAFETY_CHECKS.map(c => (
                    <div className="chk-item" key={c}>
                      <span className="lab">{c}</span>
                      <label className="switch">
                        <input type="checkbox" checked={!!(form.safety_checklist || {})[c]} onChange={() => F('safety_checklist', { ...form.safety_checklist, [c]: !form.safety_checklist?.[c] })} />
                        <span className="slider" />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: 13, marginBottom: 8 }}>Quality</h3>
                <div className="checklist">
                  {QUALITY_CHECKS.map(c => (
                    <div className="chk-item" key={c}>
                      <span className="lab">{c}</span>
                      <label className="switch">
                        <input type="checkbox" checked={!!(form.quality_checklist || {})[c]} onChange={() => F('quality_checklist', { ...form.quality_checklist, [c]: !form.quality_checklist?.[c] })} />
                        <span className="slider" />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <div className="fs-head"><h2>Photos</h2><p>Site photos are attached after the report is saved, using the record's own attachment area</p></div>
            {form.id || editing?.id ? (
              <RecordAttachments module="daily_progress_report" recordId={(form.id || editing?.id)} projectId={form.project_id} label="DPR Photos & Attachments" />
            ) : (
              <div className="upload-zone">
                <Upload />
                <h4>Save the DPR first</h4>
                <p>Click "Save as Draft" below, then return to this step to attach photos.</p>
              </div>
            )}
          </>
        )}

        {step === 8 && (
          <>
            <div className="fs-head"><h2>Approval</h2><p>Review sign-off fields before submitting</p></div>
            <div className="grid g-3">
              <div className="field"><label>Prepared By</label><input value={form.prepared_by} onChange={e => F('prepared_by', e.target.value)} /></div>
              <div className="field"><label>Reviewed By</label><input value={form.reviewed_by} onChange={e => F('reviewed_by', e.target.value)} /></div>
              <div className="field"><label>Approved By</label><input value={form.approved_by} onChange={e => F('approved_by', e.target.value)} /></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 13, marginBottom: 8 }}>Approval Chain</h3>
              <div className="chain-list">
                {(form.approval_chain || []).map((r, i) => (
                  <div className="chain-row" key={i}><div className="num">{i + 1}</div><span style={{ fontSize: 13, fontWeight: 500 }}>{r}</span></div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="form-footer">
          <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}>Back</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" disabled={saveMut.isPending} onClick={() => submit('draft')}>Save as Draft</button>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}>Next Step <ChevronRight size={14} /></button>
            ) : (
              <button className="btn btn-primary" disabled={saveMut.isPending} onClick={() => submit('submitted')}>
                <Send size={14} /> Submit for Approval
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
export default function DPRConsole() {
  const qc = useQueryClient();
  const [view, setView] = useState('dashboard');
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: dashboard } = useQuery({
    queryKey: ['dpr-console-dashboard'],
    queryFn: () => planningAPI.dprConsoleDashboard().then(r => r.data?.data ?? r.data ?? {}),
    refetchInterval: 60000,
  });

  const { data: allDprs = [], isLoading: dprsLoading } = useQuery({
    queryKey: ['dpr-console-list', projectId],
    queryFn: () => planningAPI.listDPRs(projectId ? { project_id: projectId } : {}).then(r => r.data?.data ?? r.data ?? []),
  });

  const searched = useMemo(() => {
    if (!search) return allDprs;
    const q = search.toLowerCase();
    return allDprs.filter(d =>
      (d.project_name || '').toLowerCase().includes(q) ||
      (d.dpr_number || '').toLowerCase().includes(q) ||
      (d.submitted_by_name || '').toLowerCase().includes(q)
    );
  }, [allDprs, search]);

  const counts = {
    draft: allDprs.filter(d => d.status === 'draft').length,
    submitted: allDprs.filter(d => d.status === 'submitted').length,
    approved: allDprs.filter(d => d.status === 'approved').length,
  };

  const notifItems = useMemo(() => {
    const items = [];
    const k = dashboard?.kpis || {};
    if (k.pending_approvals > 0) items.push({ Icon: Send, bg: 'var(--orange-100)', fg: 'var(--orange-600)', title: 'Pending Approvals', body: `${k.pending_approvals} DPRs awaiting your review`, time: 'Now', unread: true });
    if (k.delayed_activities > 0) items.push({ Icon: AlertTriangle, bg: '#FBEAE7', fg: 'var(--danger)', title: 'Delayed Activities', body: `${k.delayed_activities} activities behind plan`, time: 'Today', unread: true });
    return items;
  }, [dashboard]);

  const titleMap = {
    dashboard: 'Dashboard', create: editing ? 'Edit DPR' : 'Create DPR', drafts: 'Draft DPRs',
    submitted: 'Submitted DPRs', approved: 'Approved DPRs', gallery: 'Image Gallery',
    reports: 'Reports & Analytics', mobile: 'Mobile App', settings: 'Settings',
  };

  const project = projects.find(p => p.id === (detail?.project_id));

  return (
    <div className="dpr-console" style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title={titleMap[view] === 'Dashboard' ? 'DPR Console' : `DPR Console — ${titleMap[view]}`}
        subtitle="Daily progress reports — create, track, approve and analyse"
        breadcrumbs={[{ label: 'Planning' }, { label: 'DPR Console' }]}
        actions={
          <button
            onClick={() => { setEditing(null); setView('create'); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
            style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}
          >
            <Plus className="w-3.5 h-3.5" /> New DPR
          </button>
        }
      />
      <Toolbar
        view={view}
        setView={(v) => { setView(v); if (v !== 'create') setEditing(null); }}
        counts={counts}
        search={search} setSearch={setSearch}
        notifItems={notifItems}
        projects={projects} projectId={projectId} setProjectId={setProjectId}
      />
      <div className="console-main">
        {view === 'dashboard' && <DashboardView dashboard={dashboard} setView={setView} />}
        {view === 'create' && (
          <CreateWizard projects={projects} projectId={projectId} setProjectId={setProjectId} setView={setView} qc={qc} editing={editing} setEditing={setEditing} />
        )}
        {view === 'drafts' && <DPRListView title="Draft DPRs" status="draft" dprs={searched.filter(d => d.status === 'draft')} isLoading={dprsLoading} onView={setDetail} setView={setView} />}
        {view === 'submitted' && <DPRListView title="Submitted DPRs" status="submitted" dprs={searched.filter(d => d.status === 'submitted')} isLoading={dprsLoading} onView={setDetail} setView={setView} />}
        {view === 'approved' && <DPRListView title="Approved DPRs" status="approved" dprs={searched.filter(d => d.status === 'approved')} isLoading={dprsLoading} onView={setDetail} setView={setView} />}
        {view === 'gallery' && <GalleryView />}
        {view === 'reports' && <ReportsView dprs={allDprs} projects={projects} />}
        {view === 'mobile' && <MobileView dashboard={dashboard} />}
        {view === 'settings' && <SettingsView />}
      </div>
      {detail && <DPRDetailDrawer dpr={detail} project={project} onClose={() => setDetail(null)} qc={qc} />}
    </div>
  );
}
