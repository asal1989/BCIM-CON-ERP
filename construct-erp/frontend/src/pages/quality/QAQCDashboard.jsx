// src/pages/quality/QAQCDashboard.jsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck, AlertOctagon, FlaskConical, Clock,
  TrendingUp, ChevronRight, Plus, ArrowUpRight,
  ClipboardCheck, Activity, Shield, FileSearch,
  Hammer, FolderSearch, BarChart3, CheckCircle2,
  XCircle, AlertTriangle, ClipboardList, BookOpen,
  PackageCheck, ShieldCheck, Layers,
} from 'lucide-react';
import { qualityAPI, dmsAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const fmt = (d) => d ? dayjs(d).fromNow() : '—';

const STATUS_BADGE = {
  raised:       'bg-blue-50 text-blue-700 border border-blue-200',
  approved:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected:     'bg-red-50 text-red-700 border border-red-200',
  closed:       'bg-slate-100 text-slate-900 border border-slate-200',
  open:         'bg-amber-50 text-amber-700 border border-amber-200',
  under_review: 'bg-purple-50 text-purple-700 border border-purple-200',
  pass:         'bg-emerald-50 text-emerald-700 border border-emerald-200',
  fail:         'bg-red-50 text-red-700 border border-red-200',
  pending:      'bg-slate-100 text-slate-900 border border-slate-200',
};

function StatusBadge({ status }) {
  const cls = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return (
    <span className={`inline-block text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

const SEV = {
  critical: 'bg-red-500',
  major:    'bg-orange-500',
  minor:    'bg-amber-400',
};

function KPICard({ label, sub, value, icon: Icon, color, bg }) {
  return (
    <div className="bg-white rounded-xl border border-[#e2e6ec] p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-medium text-slate-900 font-medium leading-none">{value}</p>
        <p className="text-xs font-medium text-slate-900 mt-1">{label}</p>
        <p className="text-xs text-slate-900 font-medium mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function SectionCard({ title, sub, action, onAction, children }) {
  return (
    <div className="bg-white rounded-xl border border-[#e2e6ec] overflow-hidden">
      <div className="bg-[#f8f9fc] border-b border-[#e2e6ec] px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-black">{title}</p>
          {sub && <p className="text-xs text-slate-900 font-medium mt-0.5">{sub}</p>}
        </div>
        {action && (
          <button onClick={onAction}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
            {action} <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ProgressBar({ pct, color = 'bg-indigo-500' }) {
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  );
}

const NAV_TILES = [
  { to: '/quality/itp',          icon: ClipboardList,  label: 'ITP Register',     desc: 'Inspection & test plans', color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  { to: '/quality/method-statements', icon: BookOpen,  label: 'Method Stmts',     desc: 'Work methodology',       color: 'text-violet-600',  bg: 'bg-violet-50' },
  { to: '/quality/rfi',          icon: FileSearch,     label: 'RFI / WIR',        desc: 'Inspection requests',   color: 'text-blue-600',    bg: 'bg-blue-50' },
  { to: '/quality/mir',          icon: PackageCheck,   label: 'Material Insp.',   desc: 'MIR approvals',         color: 'text-teal-600',    bg: 'bg-teal-50' },
  { to: '/quality/mtc',          icon: ShieldCheck,    label: 'Test Certs',       desc: 'MTC / NABL certs',      color: 'text-violet-600',  bg: 'bg-violet-50' },
  { to: '/quality/lab-tests',    icon: FlaskConical,   label: 'Lab Tests',        desc: 'Material testing',      color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { to: '/quality/pour-cards',   icon: Layers,         label: 'Pour Cards',       desc: 'Concrete pours',        color: 'text-cyan-600',    bg: 'bg-cyan-50' },
  { to: '/quality/ncr',          icon: AlertOctagon,   label: 'NCR Registry',     desc: 'Non-conformance',       color: 'text-red-600',     bg: 'bg-red-50' },
  { to: '/quality/snags',        icon: Hammer,         label: 'Snag List',        desc: 'Punch list',            color: 'text-amber-600',   bg: 'bg-amber-50' },
  { to: '/quality/audits',       icon: Shield,         label: 'Audits',           desc: 'ISO 9001 / IS codes',   color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  { to: '/quality/documents',    icon: FolderSearch,   label: 'Doc Control',      desc: 'Drawings & submittals', color: 'text-blue-600',    bg: 'bg-blue-50' },
  { to: '/quality/reports',      icon: BarChart3,      label: 'Reports',          desc: 'QA/QC analytics',       color: 'text-slate-600',   bg: 'bg-slate-100' },
];

export default function QAQCDashboard() {
  const navigate = useNavigate();

  const { data: rfis      = [] } = useQuery({ queryKey: ['quality-rfi'], queryFn: () => qualityAPI.listRFI().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: ncrs      = [] } = useQuery({ queryKey: ['quality-ncr'], queryFn: () => qualityAPI.listNCR().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: labTests  = [] } = useQuery({ queryKey: ['quality-lab'], queryFn: () => qualityAPI.listLabTests().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: checklists= [] } = useQuery({ queryKey: ['quality-checklists'], queryFn: () => qualityAPI.listChecklists().then(r => r.data?.data ?? []).catch(() => []) });
  const { data: stats     = {} } = useQuery({ queryKey: ['quality-stats'], queryFn: () => qualityAPI.qualityStats().then(r => r.data?.data ?? {}).catch(() => ({})) });
  // QC Documents from DMS
  const { data: qcDocs    = [] } = useQuery({ queryKey: ['qaqc-dms-docs'], queryFn: () => dmsAPI.list({ module: 'qaqc' }).then(r => r.data?.data ?? []).catch(() => []) });

  const activeRFI  = rfis.filter(r => r.status === 'raised').length;
  const openNCR    = ncrs.filter(n => n.status === 'open' || n.status === 'under_review').length;
  const totalLab   = labTests.length;
  const passRate   = totalLab > 0 ? Math.round((labTests.filter(t => t.result_status === 'pass').length / totalLab) * 100) : 0;
  const signedRFI  = rfis.filter(r => r.status === 'approved').length;

  const critNCR = ncrs.filter(n => n.severity === 'critical').length;
  const majNCR  = ncrs.filter(n => n.severity === 'major').length;
  const minNCR  = ncrs.filter(n => n.severity === 'minor').length;
  const totalNCR = ncrs.length;

  const matTypes = ['Concrete', 'Steel', 'Soil', 'Aggregates'];

  return (
    <div className="p-6 space-y-5 bg-[#f4f6f9] min-h-full">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-black">QA / QC Command Centre</h1>
            <p className="text-xs text-slate-500">RFI · NCR · Lab Tests · ITP Checklists · Snag List</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/quality/rfi')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e2e6ec] text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
            <FileSearch className="w-4 h-4" /> Raise RFI
          </button>
          <button onClick={() => navigate('/quality/ncr')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
            <AlertOctagon className="w-4 h-4" /> Issue NCR
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Active RFIs"          sub="Pending inspection"    value={activeRFI}         icon={Clock}       color="text-indigo-600" bg="bg-indigo-50" />
        <KPICard label="Open NCRs"            sub="Non-conformances"      value={openNCR}           icon={AlertOctagon} color="text-red-600"    bg="bg-red-50" />
        <KPICard label="Lab Pass Rate"        sub="Material compliance"   value={`${passRate}%`}    icon={TrendingUp}  color="text-emerald-600" bg="bg-emerald-50" />
        <KPICard label="Certified Inspections" sub="QA/QC sign-offs done" value={signedRFI}         icon={BadgeCheck}  color="text-blue-600"   bg="bg-blue-50" />
      </div>

      {/* ── Module Coverage Band ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Pending MIR',    value: stats.mir?.pending ?? 0,          tone: 'text-teal-600',    to: '/quality/mir' },
          { label: 'MTC Review',     value: stats.mtc?.pending_review ?? 0,   tone: 'text-violet-600',  to: '/quality/mtc' },
          { label: 'Pours: Certs',   value: stats.pour?.certs_pending ?? 0,   tone: 'text-amber-600',   to: '/quality/pour-cards' },
          { label: 'Auto-NCR (Lab)', value: stats.ncr?.auto_lab ?? 0,         tone: 'text-red-600',     to: '/quality/ncr' },
          { label: 'Open Findings',  value: stats.audit?.open_findings ?? 0,  tone: 'text-orange-600',  to: '/quality/audits' },
          { label: 'Open Snags',     value: stats.snag?.open ?? 0,            tone: 'text-amber-600',   to: '/quality/snags' },
        ].map(s => (
          <button key={s.label} onClick={() => navigate(s.to)}
            className="bg-white rounded-xl border border-[#e2e6ec] p-3 text-center hover:border-indigo-200 hover:shadow-sm transition-all">
            <div className={`text-xl font-bold ${s.tone}`}>{s.value}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* ── Navigation Tiles ── */}
      <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
        {NAV_TILES.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.to} onClick={() => navigate(t.to)}
              className="bg-white rounded-xl border border-[#e2e6ec] p-4 flex flex-col items-center gap-2 hover:border-indigo-200 hover:shadow-sm transition-all text-center group">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.bg} group-hover:scale-105 transition-transform`}>
                <Icon className={`w-5 h-5 ${t.color}`} />
              </div>
              <p className="text-xs font-medium text-slate-700">{t.label}</p>
              <p className="text-[10px] text-slate-900 font-medium hidden lg:block">{t.desc}</p>
            </button>
          );
        })}
      </div>

      {/* ── QC Document Library Banner ── */}
      {qcDocs.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e2e6ec] overflow-hidden">
          <div className="bg-[#f8f9fc] border-b border-[#e2e6ec] px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <FolderSearch className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-black">QC Document Library</p>
                <p className="text-xs text-slate-500">
                  {qcDocs.length} documents — checklists, method statements, ITPs, certificates
                </p>
              </div>
            </div>
            <button onClick={() => navigate('/quality/document-library')}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
              View All <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { type: 'inspection_report', label: 'Checklists',       icon: ClipboardCheck, color: 'text-blue-600',    bg: 'bg-blue-50',    to: '/quality/rfi' },
                { type: 'method_statement',  label: 'Method Stmts',     icon: BookOpen,       color: 'text-emerald-600', bg: 'bg-emerald-50', to: '/quality/method-statements' },
                { type: 'quality_plan',      label: 'ITPs & QA Plans',  icon: ClipboardList,  color: 'text-purple-600',  bg: 'bg-purple-50',  to: '/quality/itp' },
                { type: 'certificate',       label: 'Lab Certificates',  icon: BadgeCheck,     color: 'text-amber-600',   bg: 'bg-amber-50',   to: '/quality/lab-tests' },
              ].map(cat => {
                const count = qcDocs.filter(d => d.doc_type === cat.type).length;
                const Icon  = cat.icon;
                return (
                  <button key={cat.type} onClick={() => navigate('/quality/document-library')}
                    className="flex items-center gap-3 p-3 rounded-xl border border-[#e2e6ec] hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group text-left">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cat.bg} group-hover:scale-105 transition-transform`}>
                      <Icon className={`w-4 h-4 ${cat.color}`} />
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${cat.color} leading-none`}>{count}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{cat.label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Middle Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Live RFI Feed — 2 cols */}
        <div className="lg:col-span-2">
          <SectionCard title="Live Inspection Feed — RFI" sub="Latest requests for inspection"
            action="View all" onAction={() => navigate('/quality/rfi')}>
            {rfis.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <FileSearch className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No RFIs raised yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rfis.slice(0, 6).map(r => (
                  <button key={r.id} onClick={() => navigate('/quality/rfi')}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#f8f9fc] border border-transparent hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0">
                      {String(r.rfi_number || r.id).slice(-3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 font-medium truncate">{r.activity_name || 'Unnamed Inspection'}</p>
                      <p className="text-xs text-slate-900 font-medium truncate">{r.location}{r.checklist_name ? ` · ${r.checklist_name}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={r.status} />
                      <span className="text-[10px] text-slate-400">{fmt(r.scheduled_at || r.created_at)}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* NCR Analysis — 1 col */}
        <div>
          <SectionCard title="NCR Analysis" sub="Non-conformance breakdown"
            action="View all" onAction={() => navigate('/quality/ncr')}>
            <div className="space-y-4">
              {[
                { label: 'Critical', sev: 'critical', count: critNCR, bar: 'bg-red-500' },
                { label: 'Major',    sev: 'major',    count: majNCR,  bar: 'bg-orange-500' },
                { label: 'Minor',    sev: 'minor',    count: minNCR,  bar: 'bg-amber-400' },
              ].map(row => (
                <div key={row.sev}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-700">{row.label}</span>
                    <span className={`font-medium ${row.sev === 'critical' ? 'text-red-600' : row.sev === 'major' ? 'text-orange-600' : 'text-amber-600'}`}>
                      {row.count} open
                    </span>
                  </div>
                  <ProgressBar pct={totalNCR > 0 ? (row.count / totalNCR) * 100 : 5} color={row.bar} />
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400">Total NCRs raised</span>
              <span className="font-medium text-slate-700">{totalNCR}</span>
            </div>

            <button onClick={() => navigate('/quality/ncr')}
              className="mt-3 w-full py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5" /> Manage NCRs
            </button>
          </SectionCard>
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Lab Testing */}
        <SectionCard title="Forensic Material Testing" sub="Lab certification results by material type"
          action="Lab ledger" onAction={() => navigate('/quality/lab-tests')}>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {matTypes.map(mat => {
              const tests   = labTests.filter(l => (l.material_type || '').toLowerCase().includes(mat.toLowerCase()));
              const passed  = tests.filter(t => t.result_status === 'pass').length;
              const rate    = tests.length > 0 ? Math.round((passed / tests.length) * 100) : null;
              const isGood  = rate !== null && rate >= 80;
              return (
                <div key={mat} className="bg-[#f8f9fc] border border-[#e2e6ec] rounded-lg p-3 text-center">
                  <FlaskConical className="w-4 h-4 text-indigo-500 mx-auto mb-1.5" />
                  <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide">{mat}</p>
                  <p className="text-lg font-medium text-slate-900 font-medium mt-1">{tests.length}</p>
                  <p className={`text-[10px] font-medium mt-0.5 ${rate === null ? 'text-slate-400' : isGood ? 'text-emerald-600' : 'text-red-600'}`}>
                    {rate !== null ? `${rate}% pass` : 'No data'}
                  </p>
                </div>
              );
            })}
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-600">Overall pass rate</span>
              <span className={`font-medium ${passRate >= 80 ? 'text-emerald-600' : 'text-red-600'}`}>{passRate}%</span>
            </div>
            <ProgressBar pct={passRate} color={passRate >= 80 ? 'bg-emerald-500' : 'bg-red-500'} />
            <p className="text-[10px] text-slate-900 font-medium mt-1">{totalLab} total samples tested</p>
          </div>
        </SectionCard>

        {/* ITP Checklists */}
        <SectionCard title="Inspection Test Plans (ITP)" sub="Active QA/QC checklist templates"
          action="Manage" onAction={() => navigate('/quality/templates')}>
          {checklists.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No ITP templates yet</p>
              <button onClick={() => navigate('/quality/templates')}
                className="mt-3 px-4 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-lg hover:bg-indigo-100 transition-colors">
                Create template
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {checklists.slice(0, 4).map((t, i) => {
                const colors = ['text-indigo-600 bg-indigo-50', 'text-amber-600 bg-amber-50', 'text-emerald-600 bg-emerald-50', 'text-blue-600 bg-blue-50'];
                const bars   = ['bg-indigo-500', 'bg-amber-500', 'bg-emerald-500', 'bg-blue-500'];
                const [tc, bc] = [colors[i % 4], bars[i % 4]];
                const itemCount = Array.isArray(t.items) ? t.items.length : 0;
                return (
                  <button key={t.id} onClick={() => navigate('/quality/templates')}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#f8f9fc] border border-transparent hover:border-indigo-200 hover:bg-indigo-50/20 transition-all text-left">
                    <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${bc}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 font-medium truncate">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.category} · {itemCount} checkpoint{itemCount !== 1 ? 's' : ''}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tc}`}>{t.category}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  </button>
                );
              })}
            </div>
          )}

          <button onClick={() => navigate('/quality/templates')}
            className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add New ITP Template
          </button>
        </SectionCard>
      </div>
    </div>
  );
}
