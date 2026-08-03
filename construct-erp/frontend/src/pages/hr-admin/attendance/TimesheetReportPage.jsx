import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import useAuthStore from '../../../store/authStore';
import {
  Printer, Download, RefreshCw, Filter, ChevronRight, Search, X,
  Users, Clock, AlertTriangle, Timer, CalendarDays, Building2, LayoutList, Rows3, Mail,
  Settings, Trash2, Send, Plus, Power,
} from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

// ── Design tokens ───────────────────────────────────────────────────────────
const T = {
  navy:      '#0F2544',
  navyMid:   '#1B3A6B',
  navyLift:  '#27508C',
  ink:       '#0B1524',
  body:      '#334155',
  muted:     '#64748B',
  faint:     '#94A3B8',
  hair:      '#E8EDF5',
  hairSoft:  '#F1F5F9',
  surface:   '#FFFFFF',
  canvas:    '#F5F7FB',
  // semantic — separate from the navy brand accent
  present:   '#059669',
  absent:    '#DC2626',
  leave:     '#D97706',
  half:      '#4F46E5',
  single:    '#EA580C',
  off:       '#64748B',
  holiday:   '#7C3AED',
  hours:     '#0891B2',
};

const STATUS_COLOR = {
  present:  { bg: '#ECFDF5', color: '#065F46', dot: T.present },
  sp:       { bg: '#FFF7ED', color: '#9A3412', dot: T.single },  // single punch — no out-punch
  absent:   { bg: '#FEF2F2', color: '#991B1B', dot: T.absent },
  leave:    { bg: '#FFFBEB', color: '#92400E', dot: T.leave },
  half_day: { bg: '#EEF2FF', color: '#3730A3', dot: T.half },
  holiday:  { bg: '#F5F3FF', color: '#5B21B6', dot: T.holiday },
  // The API synthesises week_off for anyone with no punch on a Sunday. Without
  // its own entry it fell through to the ABSENT style, painting a normal
  // weekend red and making a rest day look like mass absenteeism.
  week_off: { bg: '#F1F5F9', color: '#475569', dot: T.off },
};
const STATUS_LABEL = { present:'P', sp:'SP', absent:'A', leave:'L', half_day:'HD', holiday:'H', week_off:'WO' };
const STATUS_FULL  = {
  present:'Present', sp:'Single Punch', absent:'Absent', leave:'On Leave',
  half_day:'Half Day', holiday:'Holiday', week_off:'Week Off',
};

const statusKey = (r) => {
  const s = (r.attendance_status || 'absent').toLowerCase();
  return (s === 'present' && !r.out_time) ? 'sp' : s;
};

function Pill({ status, out_time }) {
  const key = statusKey({ attendance_status: status, out_time });
  const { bg, color, dot } = STATUS_COLOR[key] || STATUS_COLOR.absent;
  return (
    <span title={STATUS_FULL[key] || key} style={{
      background: bg, color, border: `1px solid ${dot}2E`,
      borderRadius: 999, padding: '3px 9px 3px 7px', fontWeight: 800,
      fontSize: 10, letterSpacing: 0.4, display: 'inline-flex', alignItems: 'center', gap: 5,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0 }}/>
      {STATUS_LABEL[key] || key.toUpperCase()}
    </span>
  );
}

function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const palette = ['#2563EB','#0891B2','#059669','#CA8A04','#DC2626','#7C3AED','#DB2777','#0D9488'];
  const idx = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
  const c = palette[idx];
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      width:size, height:size, borderRadius:9, flexShrink:0,
      background:`linear-gradient(140deg, ${c} 0%, ${c}C4 100%)`,
      color:'#fff', fontSize: size * 0.34, fontWeight:800, letterSpacing:0.3,
      boxShadow:`0 1px 3px ${c}55`,
    }}>{initials}</span>
  );
}

function Donut({ pct = 0, size = 76 }) {
  const stroke = 8, r = (size - stroke) / 2, c = size / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(Math.max(pct, 0) / 100, 1) * circ;
  const tone = pct >= 85 ? T.present : pct >= 65 ? T.leave : T.absent;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={T.hairSoft} strokeWidth={stroke}/>
      <circle cx={c} cy={c} r={r} fill="none" stroke={tone} strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`} style={{ transition:'stroke-dasharray .5s ease' }}/>
      <text x={c} y={c - 2} textAnchor="middle" dominantBaseline="middle"
        fontSize={17} fontWeight={800} fill={T.ink} style={{ fontVariantNumeric:'tabular-nums' }}>{Math.round(pct)}</text>
      <text x={c} y={c + 13} textAnchor="middle" dominantBaseline="middle"
        fontSize={8} fontWeight={700} fill={T.faint} letterSpacing={0.6}>PERCENT</text>
    </svg>
  );
}

function AttBar({ present=0, absent=0, half=0, leave=0, height=7 }) {
  const total = (present + absent + half + leave) || 1;
  const segs = [
    { val: present, color: T.present, label: 'Present' },
    { val: half,    color: T.half,    label: 'Half Day' },
    { val: leave,   color: T.leave,   label: 'Leave' },
    { val: absent,  color: T.absent,  label: 'Absent' },
  ];
  return (
    <div style={{ display:'flex', height, borderRadius:99, overflow:'hidden', width:'100%',
      gap:1.5, background:T.hairSoft }}>
      {segs.map((s, i) => s.val > 0 && (
        <div key={i} title={`${s.label}: ${s.val}`}
          style={{ width:`${(s.val / total) * 100}%`, background:s.color, borderRadius:99 }}/>
      ))}
    </div>
  );
}

/* Working-window bar — plots the in→out span across a 06:00–22:00 day so a late
   start or early finish is visible at a glance instead of having to compare two
   timestamps in adjacent columns. */
const WINDOW_START = 6 * 60, WINDOW_END = 22 * 60;
// The API formats punches as 'HH12:MI AM' (e.g. "09:15 AM"), so a naive
// split(':') yields NaN on the minutes and the bar never renders. Accept both
// that 12-hour form and a plain 24-hour "HH:MM" in case the format changes.
const toMin = (t) => {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const mer = m[3] && m[3].toUpperCase();
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

function WorkWindow({ in_time, out_time, late_minutes }) {
  const i = toMin(in_time), o = toMin(out_time);
  if (i == null) return <span style={{ color:'#CBD5E1' }}>—</span>;
  const span = WINDOW_END - WINDOW_START;
  const clamp = (v) => Math.min(100, Math.max(0, v));
  const left  = clamp(((i - WINDOW_START) / span) * 100);
  const right = o != null ? clamp(((o - WINDOW_START) / span) * 100) : left;
  const width = Math.max(o != null ? right - left : 2.5, 2.5);
  const isLate = Number(late_minutes) > 0;
  const open   = o == null;                       // still open / missing out-punch
  const tone   = open ? T.single : isLate ? T.leave : T.present;
  return (
    <div title={`${in_time || '—'} → ${out_time || 'no out-punch'}`}
      style={{ position:'relative', height:16, minWidth:96, display:'flex', alignItems:'center' }}>
      {/* noon tick */}
      <div style={{ position:'absolute', left:'37.5%', top:2, bottom:2, width:1, background:T.hair }}/>
      <div style={{ position:'absolute', inset:'6px 0', borderRadius:99, background:T.hairSoft }}/>
      <div style={{
        position:'absolute', left:`${left}%`, width:`${width}%`, top:4, height:8,
        borderRadius:99, background:open ? `repeating-linear-gradient(90deg, ${tone} 0 4px, ${tone}55 4px 8px)` : tone,
      }}/>
      <div style={{ position:'absolute', left:`${left}%`, top:1, width:2, height:14,
        borderRadius:2, background:isLate ? T.absent : tone, transform:'translateX(-1px)' }}/>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent, loading, onClick, active }) {
  return (
    <div onClick={onClick} style={{
      background:T.surface, border:`1px solid ${active ? accent : T.hair}`,
      borderRadius:14, padding:'13px 16px', minWidth:132, flex:'0 0 auto',
      boxShadow: active ? `0 0 0 3px ${accent}1A` : '0 1px 2px rgba(15,37,68,0.05)',
      cursor:onClick ? 'pointer' : 'default', position:'relative', overflow:'hidden',
      transition:'box-shadow .15s ease, border-color .15s ease',
    }}>
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:accent }}/>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:7 }}>
        {Icon && <Icon size={12} color={accent} strokeWidth={2.6}/>}
        <span style={{ fontSize:10, color:T.muted, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize:27, fontWeight:800, color:T.ink, lineHeight:1, fontVariantNumeric:'tabular-nums',
        letterSpacing:-0.6 }}>
        {loading ? <span style={{ fontSize:16, color:T.hair }}>—</span> : value}
      </div>
      {!loading && sub && (
        <div style={{ fontSize:10.5, color:T.faint, marginTop:6, fontWeight:600 }}>{sub}</div>
      )}
    </div>
  );
}

function SkeletonRows({ cols = 21, rows = 8 }) {
  return Array.from({ length: rows }).map((_, r) => (
    <tr key={r}>
      {Array.from({ length: cols }).map((__, c) => (
        <td key={c} style={{ padding:'11px 12px', borderBottom:`1px solid ${T.hairSoft}` }}>
          <div style={{
            height:9, borderRadius:5, width: c === 1 ? '78%' : c === 0 ? 18 : '58%',
            background:`linear-gradient(90deg, ${T.hairSoft} 25%, #E9EEF6 50%, ${T.hairSoft} 75%)`,
            backgroundSize:'200% 100%', animation:'shimmer 1.3s linear infinite',
          }}/>
        </td>
      ))}
    </tr>
  ));
}

const COL_KEYS = {
  'EMP ID':      'emp_id',
  'Employee':    'name',
  'Designation': 'designation',
  'Department':  'department',
  'Trade':       'trade',
  'Company':     'company',
  'Project':     'project_name',
  'Status':      'attendance_status',
  'In':          'in_time',
  'Out':         'out_time',
  'Late':        'late_minutes',
  'Hrs':         'hours_worked',
  'OT':          'overtime_hours',
  'Shift':       'shift',
  'Location':    'location',
  'Eng/FM/Ch/CM':   'eng_fm_ch_cm',
  'Incharge':       'incharge_name',
  'Tower Incharge': 'tower_incharge',
  'Emp Status':  'status',
  'Reason':      'reason',
};

const PRINT_CSS = `
@media print {
  @page { size: A3 landscape; margin: 8mm 10mm; }
  html, body {
    margin:0 !important; padding:0 !important;
    background:#fff !important;
    overflow:visible !important;
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
  nav, header, footer, aside,
  .no-print,
  .sidebar, .topbar, .app-header, .app-sidebar,
  [class*="sidebar"], [class*="Sidebar"],
  [class*="topbar"], [class*="Topbar"],
  [class*="navbar"], [class*="Navbar"] {
    display:none !important;
    width:0 !important; height:0 !important;
    overflow:hidden !important;
  }
  .print-only { display:block !important; }
  #ts-print-root, #ts-print-root * { visibility:visible !important; }
  #ts-print-root {
    display:block !important; position:static !important;
    overflow:visible !important; width:100% !important;
    margin:0 !important; padding:4px !important;
    background:#fff !important;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt; color: #000;
  }
  #ts-print-root .ts-table-wrap,
  #ts-print-root .ts-table-wrap > * {
    overflow:visible !important; width:100% !important;
    position:static !important; max-height:none !important; height:auto !important;
  }
  .print-table {
    width:100% !important; border-collapse:collapse !important;
    font-size: 7.5pt !important; table-layout:auto !important;
    page-break-inside:auto !important; box-shadow:none !important; border-radius:0 !important;
  }
  .print-table thead { display:table-header-group !important; }
  .print-table tfoot { display:table-footer-group !important; }
  .print-table tbody { display:table-row-group !important; }
  .print-table tr { page-break-inside:avoid !important; page-break-after:auto !important; }
  .print-table th {
    background:#1B3A6B !important; color:#fff !important;
    padding:4px 4px !important; border:1px solid #1B3A6B !important;
    text-align:left !important; font-size:7pt !important; font-weight:700 !important;
    white-space:nowrap !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  .print-table td {
    padding:3px 4px !important; border:1px solid #bbb !important;
    vertical-align:middle !important; font-size:7.5pt !important; white-space:nowrap !important;
  }
  .print-table tr.dept-header-row td {
    background:#E8EFF8 !important; font-weight:700 !important; color:#1B3A6B !important;
    font-size:7.5pt !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  .print-table tr:not(.dept-header-row):nth-child(even) td {
    background:#F0F4FF !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  .sig-section { page-break-inside:avoid !important; margin-top:16px !important; }
  .print-table span { font-size:7pt !important; padding:0px 4px !important; }
}
@media screen {
  .print-only { display:none !important; }
  #ts-print-root { display:block; }
}
`;

export default function TimesheetReportPage() {
  const { user }                    = useAuthStore();
  const isSuperAdmin                = String(user?.role || '').toLowerCase() === 'super_admin';
  const [date, setDate]             = useState(today());
  const [category, setCategory]     = useState('staff');
  const [projectFilter, setProject] = useState('');
  const [rows, setRows]             = useState([]);
  const [showMailModal, setShowMail]= useState(false);
  const [mailTo, setMailTo]         = useState('');
  const [sending, setSending]       = useState(false);
  const [showConfigsModal, setShowConfigs] = useState(false);
  const [cfgProjectId, setCfgProjectId]     = useState('');
  const [cfgCategory, setCfgCategory]       = useState('staff');
  const [cfgRecipients, setCfgRecipients]   = useState('');
  const [cfgSavingId, setCfgSavingId]       = useState(null); // id currently mid-action, or 'new'
  const [summary, setSummary]       = useState({ total:0, present:0, half:0, absent:0, leave:0 });
  const [meta, setMeta]             = useState({ companyName:'BCIM', projectName:'', projectCode:'', holidayName:null, isSunday:false });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [sortKey, setSortKey]       = useState(null);
  const [sortDir, setSortDir]       = useState('asc');
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusF]  = useState('all');
  const [companyFilter, setCompany] = useState('');
  const [density, setDensity]       = useState('comfortable'); // comfortable | compact

  // Drag-to-scroll (both axes) on the table wrapper
  const tableWrapRef = useRef(null);
  const dragState    = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, a, input, select')) return;
    const el = tableWrapRef.current;
    if (!el) return;
    dragState.current = {
      active: true,
      startX: e.clientX, startY: e.clientY,
      scrollLeft: el.scrollLeft, scrollTop: el.scrollTop,
    };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };
  const onMouseMove = (e) => {
    const ds = dragState.current;
    if (!ds.active) return;
    const el = tableWrapRef.current;
    if (!el) return;
    el.scrollLeft = ds.scrollLeft - (e.clientX - ds.startX);
    el.scrollTop  = ds.scrollTop  - (e.clientY - ds.startY);
  };
  const onMouseUp = () => {
    dragState.current.active = false;
    const el = tableWrapRef.current;
    if (el) { el.style.cursor = 'grab'; el.style.userSelect = ''; }
  };

  const handleSort = (col) => {
    const key = COL_KEYS[col];
    if (!key) return;
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
      setSortDir('asc'); return key;
    });
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
      if (sortKey === 'late_minutes' || sortKey === 'hours_worked' || sortKey === 'overtime_hours') {
        av = Number(av)||0; bv = Number(bv)||0;
      } else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  const availableCompanies = useMemo(() => {
    const seen = new Set();
    rows.forEach(r => { if (r.company) seen.add(r.company); });
    return [...seen].sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    let r = sortedRows;
    if (companyFilter) {
      r = r.filter(row => (row.company || '') === companyFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(row =>
        (row.name || '').toLowerCase().includes(q) ||
        (row.emp_id || '').toLowerCase().includes(q) ||
        (row.department || '').toLowerCase().includes(q) ||
        (row.designation || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'sp') {
      r = r.filter(row => (row.attendance_status || '').toLowerCase() === 'present' && !row.out_time);
    } else if (statusFilter === 'late') {
      r = r.filter(row => Number(row.late_minutes) > 0);
    } else if (statusFilter !== 'all') {
      r = r.filter(row => (row.attendance_status || '').toLowerCase() === statusFilter);
    }
    return r;
  }, [sortedRows, companyFilter, search, statusFilter]);

  const deptBreakdown = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      const d = r.department || 'Unknown';
      if (!map[d]) map[d] = { present:0, absent:0, half:0, leave:0 };
      const s = (r.attendance_status || '').toLowerCase();
      if (s === 'present')  map[d].present++;
      else if (s === 'absent')   map[d].absent++;
      else if (s === 'half_day') map[d].half++;
      else if (s === 'leave')    map[d].leave++;
    });
    return Object.entries(map)
      .map(([dept, c]) => ({ dept, ...c, total: c.present+c.absent+c.half+c.leave }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const lateCount = useMemo(() => rows.filter(r => Number(r.late_minutes) > 0).length, [rows]);
  const spCount   = useMemo(() => rows.filter(r => (r.attendance_status || '').toLowerCase() === 'present' && !r.out_time).length, [rows]);

  // Attendance rate is measured against EXPECTED strength (total minus anyone
  // on a week-off or public holiday), not headcount — dividing by headcount
  // made every Sunday read as a ~70% collapse.
  const expectedStrength = Math.max(0, (summary.total || 0) - (summary.week_off || 0) - (summary.holiday || 0));
  const attendancePct = expectedStrength > 0
    ? Math.round(((summary.present + (summary.half || 0) * 0.5) / expectedStrength) * 100)
    : 0;

  /* Manpower hours — the API returns hours_worked / overtime_hours per row but
     the page never aggregated them, so there was no view of actual effort. */
  const hoursStats = useMemo(() => {
    let worked = 0, ot = 0, withHours = 0;
    for (const r of rows) {
      const h = Number(r.hours_worked) || 0;
      const o = Number(r.overtime_hours) || 0;
      worked += h; ot += o;
      if (h > 0) withHours++;
    }
    return { worked, ot, withHours, avg: withHours > 0 ? worked / withHours : 0 };
  }, [rows]);

  /* Punctuality — average lateness across only those who actually arrived late,
     so a handful of very late arrivals isn't diluted by everyone on time. */
  const lateStats = useMemo(() => {
    const late = rows.filter(r => Number(r.late_minutes) > 0).map(r => Number(r.late_minutes));
    const totalMin = late.reduce((s, m) => s + m, 0);
    return { count: late.length, totalMin, avg: late.length ? totalMin / late.length : 0,
             worst: late.length ? Math.max(...late) : 0 };
  }, [rows]);

  /* Totals for the CURRENT filter — the footer previously showed unfiltered
     summary counts next to a filtered record count, which never reconciled. */
  const filteredTotals = useMemo(() => {
    const t = { present: 0, half: 0, absent: 0, leave: 0, week_off: 0, holiday: 0, late: 0, hours: 0, ot: 0 };
    for (const r of filteredRows) {
      const s = (r.attendance_status || '').toLowerCase();
      if (s === 'present') t.present++;
      else if (s === 'half_day') t.half++;
      else if (s === 'absent') t.absent++;
      else if (s === 'leave') t.leave++;
      else if (s === 'week_off') t.week_off++;
      else if (s === 'holiday') t.holiday++;
      if (Number(r.late_minutes) > 0) t.late++;
      t.hours += Number(r.hours_worked) || 0;
      t.ot    += Number(r.overtime_hours) || 0;
    }
    return t;
  }, [filteredRows]);

  const { data: projectsData } = useQuery({
    queryKey: ['projects-active-ts'],
    queryFn: () => projectAPI.list({ is_active: true }).then(r => r.data),
  });
  const projects = projectsData?.data || [];

  const { data: configsData, refetch: refetchConfigs } = useQuery({
    queryKey: ['timesheet-report-configs'],
    queryFn: () => hrAttendanceAPI.timesheetReportConfigs.list().then(r => r.data),
    enabled: isSuperAdmin && showConfigsModal,
  });
  const configs = configsData?.data || [];

  const resetCfgForm = () => { setCfgProjectId(''); setCfgCategory('staff'); setCfgRecipients(''); };

  const handleCreateConfig = async () => {
    if (!cfgRecipients.trim()) return toast.error('Enter at least one recipient email');
    const proj = projects.find(p => p.id === cfgProjectId);
    const projectName = cfgProjectId === 'HEAD_OFFICE' ? 'Head Office' : (proj?.name || 'All Projects');
    setCfgSavingId('new');
    try {
      await hrAttendanceAPI.timesheetReportConfigs.create({
        project_id: cfgProjectId || null,
        project_name: projectName,
        category: cfgCategory,
        recipients: cfgRecipients.trim(),
      });
      toast.success('Recipient config added');
      resetCfgForm();
      refetchConfigs();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to add config');
    } finally { setCfgSavingId(null); }
  };

  const handleToggleConfig = async (cfg) => {
    setCfgSavingId(cfg.id);
    try {
      await hrAttendanceAPI.timesheetReportConfigs.update(cfg.id, { enabled: !cfg.enabled });
      refetchConfigs();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update');
    } finally { setCfgSavingId(null); }
  };

  const handleDeleteConfig = async (cfg) => {
    if (!window.confirm(`Remove the email config for ${cfg.project_name}?`)) return;
    setCfgSavingId(cfg.id);
    try {
      await hrAttendanceAPI.timesheetReportConfigs.delete(cfg.id);
      toast.success('Config removed');
      refetchConfigs();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to delete');
    } finally { setCfgSavingId(null); }
  };

  const handleSendNowConfig = async (cfg) => {
    setCfgSavingId(cfg.id);
    try {
      const res = await hrAttendanceAPI.timesheetReportConfigs.sendNow(cfg.id, date);
      if (res.data?.ok) toast.success(`Sent to ${res.data.recipients?.join(', ') || cfg.recipients}`);
      else toast.error(res.data?.reason || 'Send failed');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Send failed');
    } finally { setCfgSavingId(null); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await hrAttendanceAPI.timesheetReport({
        date, category,
        project_id: projectFilter || undefined,
      });
      const d = res.data;
      setRows(d.data || []);
      setSummary(d.summary || { total:0, present:0, absent:0, leave:0 });
      setMeta({
        companyName: d.companyName || 'BCIM',
        projectName: d.projectName || '',
        projectCode: d.projectCode || '',
        // The API has always returned these; the page just never used them,
        // so a public holiday looked identical to a day of mass absence.
        holidayName: d.holidayName || null,
        isSunday:    !!d.isSunday,
      });
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load timesheet');
    } finally { setLoading(false); }
  }, [date, category, projectFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSendToClient = async () => {
    if (!mailTo.trim()) return toast.error('Enter at least one recipient email');
    setSending(true);
    try {
      const res = await hrAttendanceAPI.timesheetReportSendToClient(
        date, projectFilter || undefined, meta.projectName || undefined, category, mailTo.trim()
      );
      if (res.data?.ok) {
        toast.success(`Sent to ${res.data.recipients?.join(', ') || mailTo}`);
        setShowMail(false);
        setMailTo('');
      } else {
        toast.error(res.data?.reason || 'Send failed');
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Send failed');
    } finally { setSending(false); }
  };

  const handleExport = () => {
    const headers = ['S.No','EMP ID','Name','Designation','Department','Trade','Company','Project','P/A',
      'In Time','Out Time','Late Min','Hrs Worked','Overtime Hrs','Shift','Location',
      'Eng/FM/Ch/CM','Incharge Name','Tower Incharge','Emp Status','Reason'];
    const csvRows = filteredRows.map((r, i) => [
      i+1, r.emp_id||'', r.name, r.designation, r.department, r.trade||'',
      r.company, r.project_name||'', r.attendance_status, r.in_time||'', r.out_time||'',
      r.late_minutes||0, r.hours_worked||'', r.overtime_hours||'',
      r.shift, r.location, r.eng_fm_ch_cm||'', r.incharge_name||'', r.tower_incharge||'',
      r.status, r.reason||'',
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `timesheet_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Group rows by department for print.
  // Built from filteredRows, not sortedRows: the print header already states
  // the active Company/status filter, so printing the unfiltered set produced
  // a document whose contents contradicted its own header.
  const deptGroupedRows = useMemo(() => {
    const groups = {};
    filteredRows.forEach(r => {
      const d = r.department || 'Unknown';
      if (!groups[d]) groups[d] = [];
      groups[d].push(r);
    });
    return groups;
  }, [filteredRows]);

  // Week-off / holiday cards appear only when they apply, so a normal working
  // day keeps a tight strip — but on a Sunday the numbers now reconcile to
  // Total Strength instead of 80 people silently vanishing.
  const kpiCards = [
    { key:'all',      icon:Users,         label:'Total Strength', val:summary.total,   accent:T.navyLift, sub:`${expectedStrength} expected in` },
    { key:'present',  icon:Clock,         label:'Present',        val:summary.present, accent:T.present,  sub: spCount > 0 ? `${spCount} single-punch` : 'full punch pairs' },
    { key:'half_day', icon:Timer,         label:'Half Day',       val:summary.half||0, accent:T.half },
    { key:'absent',   icon:AlertTriangle, label:'Absent',         val:summary.absent,  accent:T.absent },
    { key:'leave',    icon:CalendarDays,  label:'On Leave',       val:summary.leave,   accent:T.leave },
    ...((summary.week_off || 0) > 0 ? [{ key:'week_off', icon:CalendarDays, label:'Week Off', val:summary.week_off, accent:T.off }] : []),
    ...((summary.holiday  || 0) > 0 ? [{ key:'holiday',  icon:CalendarDays, label:'Holiday',  val:summary.holiday,  accent:T.holiday }] : []),
    { key:'late',     icon:AlertTriangle, label:'Late Arrivals',  val:lateCount,       accent:T.single,
      sub: lateStats.count > 0 ? `avg ${Math.round(lateStats.avg)}m · max ${lateStats.worst}m` : 'all on time' },
    { key:null,       icon:Timer,         label:'Man-Hours',      val:hoursStats.worked.toFixed(0), accent:T.hours,
      sub: hoursStats.ot > 0 ? `+${hoursStats.ot.toFixed(0)} OT · avg ${hoursStats.avg.toFixed(1)}h` : `avg ${hoursStats.avg.toFixed(1)}h` },
  ];

  const qFilters = [
    { key:'all',      label:'All' },
    { key:'present',  label:'Present',  color:T.present },
    { key:'sp',       label:'Single Punch', color:T.single },
    { key:'late',     label:'Late',     color:T.absent },
    { key:'absent',   label:'Absent',   color:T.absent },
    { key:'half_day', label:'Half Day', color:T.half },
    { key:'leave',    label:'Leave',    color:T.leave },
    ...((summary.week_off || 0) > 0 ? [{ key:'week_off', label:'Week Off', color:T.off }] : []),
    ...((summary.holiday  || 0) > 0 ? [{ key:'holiday',  label:'Holiday',  color:T.holiday }] : []),
  ];

  const inputStyle = {
    border:`1px solid ${T.hair}`, borderRadius:9,
    padding:'7px 11px', fontSize:12.5, color:T.body, fontWeight:600,
    background:T.surface, outline:'none',
  };
  const ghostBtn = {
    display:'flex', alignItems:'center', gap:6,
    background:'rgba(255,255,255,0.10)', color:'#fff',
    border:'1px solid rgba(255,255,255,0.20)',
    borderRadius:9, padding:'8px 14px', fontSize:12.5, cursor:'pointer', fontWeight:700,
    backdropFilter:'blur(6px)', whiteSpace:'nowrap',
  };

  const pad = density === 'compact' ? '6px 12px' : '11px 12px';
  const td = {
    padding: pad, borderBottom:`1px solid ${T.hairSoft}`,
    color:T.ink, fontSize:12, verticalAlign:'middle',
  };
  const dash = <span style={{ color:'#CBD5E1' }}>—</span>;

  // Column groups — a 21-column sheet is unreadable as one flat band, so the
  // header is tiered: identity / role / org / attendance / deployment / record.
  const GROUPS = [
    { label:'',            span:2, cols:['#','Employee'] },
    { label:'Role',        span:3, cols:['Designation','Department','Trade'] },
    { label:'Organisation',span:2, cols:['Company','Project'] },
    { label:'Attendance',  span:7, cols:['Status','In','Out','Working Window','Late','Hrs','OT'], tint:'#F0F7FF' },
    { label:'Deployment',  span:5, cols:['Shift','Location','Eng/FM/Ch/CM','Incharge','Tower Incharge'] },
    { label:'Record',      span:2, cols:['Emp Status','Reason'] },
  ];
  const FLAT_COLS = GROUPS.flatMap(g => g.cols);

  return (
    <div style={{ background:T.canvas, minHeight:'100vh' }}>
      <style>{PRINT_CSS}</style>

      {/* ── COMMAND BAR ── */}
      <div className="no-print" style={{
        position:'relative', overflow:'hidden',
        background:`linear-gradient(128deg, ${T.navyMid} 0%, ${T.navy} 62%, #0A1B33 100%)`,
        padding:'18px 26px 20px',
      }}>
        <div style={{ position:'absolute', inset:0, opacity:0.055, pointerEvents:'none',
          backgroundImage:'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize:'18px 18px' }}/>
        <div style={{ position:'absolute', right:-70, top:-110, width:280, height:280,
          borderRadius:'50%', background:'radial-gradient(circle, rgba(96,165,250,0.20) 0%, transparent 68%)',
          pointerEvents:'none' }}/>
        <div style={{ position:'absolute', left:0, right:0, bottom:0, height:1,
          background:'linear-gradient(90deg, transparent, rgba(147,197,253,0.45), transparent)' }}/>

        <div style={{ position:'relative', display:'flex', alignItems:'flex-start',
          justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:6 }}>
              <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.42)', fontWeight:600 }}>HR Admin</span>
              <ChevronRight size={10} color="rgba(255,255,255,0.3)"/>
              <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.42)', fontWeight:600 }}>Attendance</span>
              <ChevronRight size={10} color="rgba(255,255,255,0.3)"/>
              <span style={{ fontSize:10.5, color:'#93C5FD', fontWeight:700 }}>Daily Timesheet</span>
            </div>
            <h2 style={{ margin:0, fontSize:25, fontWeight:800, color:'#fff', letterSpacing:-0.7, lineHeight:1.1 }}>
              Daily Timesheet Report
            </h2>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginTop:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.72)', fontWeight:600 }}>{fmtDate(date)}</span>
              {meta.projectName && (
                <>
                  <span style={{ color:'rgba(255,255,255,0.22)' }}>·</span>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12,
                    color:'#fff', fontWeight:700 }}>
                    <Building2 size={11} color="rgba(255,255,255,0.6)"/>{meta.projectName}
                    {meta.projectCode ? <span style={{ color:'rgba(255,255,255,0.45)', fontWeight:600 }}>({meta.projectCode})</span> : null}
                  </span>
                </>
              )}
              {meta.holidayName && (
                <span style={{ background:'rgba(139,92,246,0.22)', border:'1px solid rgba(196,181,253,0.38)',
                  color:'#DDD6FE', borderRadius:999, padding:'3px 11px', fontSize:10.5, fontWeight:800,
                  letterSpacing:0.3 }}>
                  PUBLIC HOLIDAY — {meta.holidayName}
                </span>
              )}
              {!meta.holidayName && meta.isSunday && (
                <span style={{ background:'rgba(148,163,184,0.22)', border:'1px solid rgba(203,213,225,0.38)',
                  color:'#E2E8F0', borderRadius:999, padding:'3px 11px', fontSize:10.5, fontWeight:800,
                  letterSpacing:0.3 }}>
                  SUNDAY — WEEK OFF
                </span>
              )}
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
            <button onClick={load} disabled={loading} style={{ ...ghostBtn, opacity: loading ? 0.6 : 1 }}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/> Refresh
            </button>
            <button onClick={handleExport} style={ghostBtn}>
              <Download size={13}/> Export CSV
            </button>
            {isSuperAdmin && (
              <button onClick={() => setShowMail(true)} title="Email this report to a client" style={ghostBtn}>
                <Mail size={13}/> Mail to Client
              </button>
            )}
            {isSuperAdmin && (
              <button onClick={() => setShowConfigs(true)} title="Manage saved recipient lists" style={ghostBtn}>
                <Settings size={13}/> Recipients
              </button>
            )}
            <button onClick={() => window.print()} style={{
              display:'flex', alignItems:'center', gap:6,
              background:'#fff', color:T.navyMid, border:'none',
              borderRadius:9, padding:'8px 17px', fontSize:12.5, cursor:'pointer', fontWeight:800,
              boxShadow:'0 2px 10px rgba(0,0,0,0.18)',
            }}>
              <Printer size={13}/> Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── FILTER BAR ── */}
      <div className="no-print" style={{
        background:T.surface, borderBottom:`1px solid ${T.hair}`,
        padding:'11px 26px', display:'flex', alignItems:'center', gap:9, flexWrap:'wrap',
        boxShadow:'0 1px 2px rgba(15,37,68,0.03)',
      }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:10,
          color:T.faint, fontWeight:800, letterSpacing:0.7, textTransform:'uppercase', marginRight:2 }}>
          <Filter size={12}/> Filters
        </span>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle}/>
        <select value={category} onChange={e => { setCategory(e.target.value); setCompany(''); }}
          style={{ ...inputStyle, cursor:'pointer' }}>
          <option value="staff">BCIM Staff</option>
          <option value="labour">SC / Labour Workers</option>
          <option value="all">All Employees</option>
        </select>

        <select value={companyFilter} onChange={e => setCompany(e.target.value)}
          style={{ ...inputStyle, minWidth:180, maxWidth:250, cursor:'pointer' }}
          title="Filter by contractor / company">
          <option value="">All Companies</option>
          {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {companyFilter && (
          <button onClick={() => setCompany('')} style={{
            display:'flex', alignItems:'center', gap:4,
            background:'#FEF2F2', color:'#B91C1C', border:'1px solid #FECACA',
            borderRadius:8, padding:'6px 11px', fontSize:11.5, cursor:'pointer', fontWeight:700,
          }}>
            <X size={11}/> {companyFilter}
          </button>
        )}

        <select value={projectFilter} onChange={e => setProject(e.target.value)}
          style={{ ...inputStyle, minWidth:190, cursor:'pointer' }}>
          <option value="">All Projects</option>
          <option value="HEAD_OFFICE">Head Office</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.project_code ? `[${p.project_code}] ` : ''}{p.name}
            </option>
          ))}
        </select>

        {/* Density toggle */}
        <div style={{ marginLeft:'auto', display:'flex', gap:2, background:T.hairSoft,
          borderRadius:9, padding:3 }}>
          {[
            { k:'comfortable', icon:Rows3,     t:'Comfortable rows' },
            { k:'compact',     icon:LayoutList, t:'Compact rows' },
          ].map(d => (
            <button key={d.k} onClick={() => setDensity(d.k)} title={d.t} style={{
              display:'flex', alignItems:'center', justifyContent:'center',
              width:30, height:26, borderRadius:7, cursor:'pointer',
              border:'none', background: density === d.k ? T.surface : 'transparent',
              color: density === d.k ? T.navyMid : T.faint,
              boxShadow: density === d.k ? '0 1px 3px rgba(15,37,68,0.12)' : 'none',
            }}>
              <d.icon size={13}/>
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI RAIL ── */}
      <div className="no-print" style={{ padding:'18px 26px 0', display:'flex', gap:11,
        flexWrap:'wrap', alignItems:'stretch' }}>
        {kpiCards.map(k => (
          <StatCard key={k.label} icon={k.icon} label={k.label} value={k.val} sub={k.sub}
            accent={k.accent} loading={loading}
            active={k.key && statusFilter === k.key}
            onClick={k.key ? () => setStatusF(statusFilter === k.key ? 'all' : k.key) : undefined}/>
        ))}

        {/* Attendance rate panel */}
        {!loading && summary.total > 0 && (
          <div style={{
            background:T.surface, border:`1px solid ${T.hair}`, borderRadius:14,
            padding:'13px 18px', display:'flex', alignItems:'center', gap:16, flex:'1 1 300px',
            minWidth:290, boxShadow:'0 1px 2px rgba(15,37,68,0.05)',
          }}>
            <Donut pct={attendancePct}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:10, color:T.muted, fontWeight:800, letterSpacing:0.6,
                textTransform:'uppercase', marginBottom:3 }}>Attendance Rate</div>
              <div style={{ fontSize:10.5, color:T.faint, marginBottom:9, fontWeight:600 }}>
                of {expectedStrength} expected
                {((summary.week_off||0) + (summary.holiday||0)) > 0 && (
                  <span> · {(summary.week_off||0) + (summary.holiday||0)} off-duty excluded</span>
                )}
              </div>
              <AttBar present={summary.present} absent={summary.absent}
                half={summary.half||0} leave={summary.leave}/>
              <div style={{ display:'flex', gap:11, marginTop:9, flexWrap:'wrap' }}>
                {[
                  { label:'Present',  color:T.present, val:summary.present },
                  { label:'Single',   color:T.single,  val:spCount },
                  { label:'Half',     color:T.half,    val:summary.half||0 },
                  { label:'Leave',    color:T.leave,   val:summary.leave },
                  { label:'Absent',   color:T.absent,  val:summary.absent },
                ].map(s => (
                  <span key={s.label} style={{ display:'inline-flex', alignItems:'center', gap:4,
                    fontSize:10.5, color:T.body, fontWeight:600 }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:s.color }}/>
                    {s.label}
                    <b style={{ color:T.ink, fontVariantNumeric:'tabular-nums' }}>{s.val}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── DEPARTMENT BREAKDOWN ── */}
      {!loading && deptBreakdown.length > 0 && (
        <div className="no-print" style={{ padding:'14px 26px 0' }}>
          <div style={{ fontSize:10, color:T.faint, fontWeight:800, letterSpacing:0.7,
            textTransform:'uppercase', marginBottom:8 }}>
            Department Breakdown
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {deptBreakdown.slice(0, 8).map(d => {
              const rate = d.total ? Math.round(((d.present + d.half * 0.5) / d.total) * 100) : 0;
              return (
                <div key={d.dept} style={{
                  background:T.surface, border:`1px solid ${T.hair}`, borderRadius:12,
                  padding:'11px 14px', minWidth:168, flex:'0 0 auto',
                  boxShadow:'0 1px 2px rgba(15,37,68,0.04)',
                }}>
                  <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between',
                    gap:8, marginBottom:7 }}>
                    <span style={{ fontSize:11.5, color:T.ink, fontWeight:700,
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:120 }}
                      title={d.dept}>{d.dept}</span>
                    <span style={{ fontSize:11, fontWeight:800, fontVariantNumeric:'tabular-nums',
                      color: rate >= 85 ? T.present : rate >= 65 ? T.leave : T.absent }}>{rate}%</span>
                  </div>
                  <AttBar present={d.present} absent={d.absent} half={d.half} leave={d.leave} height={6}/>
                  <div style={{ display:'flex', gap:7, marginTop:7, alignItems:'center' }}>
                    <span style={{ fontSize:10, color:T.present, fontWeight:800 }}>{d.present}P</span>
                    {d.half  > 0 && <span style={{ fontSize:10, color:T.half,  fontWeight:800 }}>{d.half}HD</span>}
                    {d.leave > 0 && <span style={{ fontSize:10, color:T.leave, fontWeight:800 }}>{d.leave}L</span>}
                    <span style={{ fontSize:10, color:T.absent, fontWeight:800 }}>{d.absent}A</span>
                    <span style={{ fontSize:10, color:T.faint, marginLeft:'auto', fontWeight:600 }}>{d.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SEARCH + QUICK FILTERS ── */}
      <div className="no-print" style={{
        padding:'16px 26px 10px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
      }}>
        <div style={{ position:'relative', flex:'0 0 auto' }}>
          <Search size={13} color={T.faint} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)' }}/>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, EMP ID, department…"
            style={{
              border:`1px solid ${T.hair}`, borderRadius:9,
              padding:'8px 32px 8px 31px', fontSize:12.5, color:T.body, fontWeight:600,
              background:T.surface, outline:'none', width:250,
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position:'absolute', right:9, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', padding:0, display:'flex',
            }}>
              <X size={12} color={T.faint}/>
            </button>
          )}
        </div>

        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {qFilters.map(f => {
            const on = statusFilter === f.key;
            return (
              <button key={f.key} onClick={() => setStatusF(f.key)} style={{
                border: on ? `1px solid ${f.color || T.navyLift}` : `1px solid ${T.hair}`,
                background: on ? `${f.color || T.navyLift}12` : T.surface,
                color: on ? (f.color || T.navyLift) : T.muted,
                borderRadius:8, padding:'6px 13px', fontSize:11.5, cursor:'pointer',
                fontWeight: on ? 800 : 600, display:'inline-flex', alignItems:'center', gap:6,
                transition:'all .12s ease',
              }}>
                {f.color && <span style={{ width:6, height:6, borderRadius:'50%', background:f.color }}/>}
                {f.label}
              </button>
            );
          })}
        </div>

        <span style={{ fontSize:11.5, color:T.faint, marginLeft:'auto', fontWeight:600,
          fontVariantNumeric:'tabular-nums' }}>
          {loading ? 'Loading…' : (
            filteredRows.length === rows.length
              ? `${rows.length} records`
              : `${filteredRows.length} of ${rows.length} records`
          )}
        </span>
      </div>

      {/* ── PRINTABLE DOCUMENT ── */}
      <div id="ts-print-root" style={{ padding:'0 26px 36px' }}>

        {/* PRINT HEADER */}
        <div className="print-only" style={{
          borderBottom:'3px solid #1B3A6B', paddingBottom:10, marginBottom:12,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <img src="/bcim-logo.png" alt="BCIM Logo"
              style={{ height:60, width:'auto', objectFit:'contain', flexShrink:0 }}/>
            <div style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:9, fontWeight:600, color:'#555', letterSpacing:2, textTransform:'uppercase' }}>
                {meta.companyName}
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:'#1B3A6B', letterSpacing:0.5, margin:'2px 0' }}>
                DAILY ATTENDANCE / TIMESHEET REPORT
              </div>
              <div style={{ fontSize:9, color:'#444' }}>
                {meta.projectName
                  ? <>Project: <strong>{meta.projectName}</strong>{meta.projectCode ? ` (${meta.projectCode})` : ''}&emsp;|&emsp;</>
                  : null}
                Date: <strong>{fmtDate(date)}</strong>&emsp;|&emsp;
                Category: <strong>{category === 'staff' ? 'BCIM STAFF' : category === 'labour' ? 'SC / LABOUR WORKERS' : 'ALL EMPLOYEES'}</strong>
                {companyFilter && <>&emsp;|&emsp;Company: <strong>{companyFilter}</strong></>}
              </div>
            </div>
            <table style={{ border:'1px solid #1B3A6B', borderCollapse:'collapse', fontSize:8, flexShrink:0 }}>
              <tbody>
                {[
                  ['Total Strength', filteredRows.length],
                  ['Present (P)',    filteredTotals.present],
                  ['Half Day (HD)',  filteredTotals.half],
                  ['Absent (A)',     filteredTotals.absent],
                  ['On Leave (L)',   filteredTotals.leave],
                  ...(filteredTotals.week_off > 0 ? [['Week Off (WO)', filteredTotals.week_off]] : []),
                  ...(filteredTotals.holiday  > 0 ? [['Holiday (H)',   filteredTotals.holiday]]  : []),
                  ['Late Arrivals',  filteredTotals.late],
                  ['Man-Hours',      filteredTotals.hours.toFixed(1)],
                  ['Attendance %',   `${attendancePct}%`],
                ].map(([l,v]) => (
                  <tr key={l}>
                    <td style={{ padding:'3px 8px', borderBottom:'1px solid #ccc', borderRight:'1px solid #ccc', fontWeight:600 }}>{l}</td>
                    <td style={{ padding:'3px 10px', borderBottom:'1px solid #ccc', textAlign:'center', fontWeight:700, color:'#1B3A6B' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div style={{
            background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12,
            padding:'14px 18px', color:'#B91C1C', margin:'16px 0', fontSize:13, fontWeight:600,
            display:'flex', alignItems:'center', gap:9,
          }}>
            <AlertTriangle size={16}/> {error}
          </div>
        )}

        {/* ── TABLE ── */}
        {!error && (
          <div className="no-print" style={{
            background:T.surface, borderRadius:14, border:`1px solid ${T.hair}`,
            boxShadow:'0 1px 3px rgba(15,37,68,0.06)', overflow:'hidden',
          }}>
            <div
              ref={tableWrapRef}
              className="ts-table-wrap ts-scroll"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              style={{ overflowX:'auto', overflowY:'auto', maxHeight:'64vh', cursor:'grab' }}
            >
              <table className="print-table" style={{
                borderCollapse:'separate', borderSpacing:0, width:'100%', fontSize:12,
              }}>
                <thead>
                  {/* Tier 1 — column groups */}
                  <tr>
                    {GROUPS.map((g, gi) => (
                      <th key={gi} colSpan={g.span} style={{
                        padding: g.label ? '7px 12px' : 0,
                        background: g.tint || '#FBFCFE',
                        borderBottom:`1px solid ${T.hair}`,
                        borderRight: gi < GROUPS.length - 1 ? `1px solid ${T.hair}` : 'none',
                        position:'sticky', top:0, zIndex:3,
                        textAlign:'left', fontSize:9, fontWeight:800, letterSpacing:0.8,
                        color: g.tint ? T.navyLift : T.faint, textTransform:'uppercase',
                        whiteSpace:'nowrap',
                      }}>
                        {g.label}
                      </th>
                    ))}
                  </tr>
                  {/* Tier 2 — sortable column names */}
                  <tr>
                    {FLAT_COLS.map(h => {
                      const key = COL_KEYS[h];
                      const active = sortKey === key;
                      const inAtt = GROUPS.find(g => g.tint && g.cols.includes(h));
                      return (
                        <th key={h} onClick={() => handleSort(h)} style={{
                          padding:'9px 12px', textAlign:'left',
                          fontWeight:700, fontSize:10.5,
                          color: active ? T.navyLift : T.muted,
                          background: active ? '#EAF2FE' : (inAtt ? '#F7FBFF' : '#FBFCFE'),
                          borderBottom:`1px solid ${T.hair}`,
                          cursor: key ? 'pointer' : 'default',
                          userSelect:'none', whiteSpace:'nowrap',
                          position:'sticky', top:27, zIndex:2,
                        }}>
                          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                            {h}
                            {key && (
                              <span style={{ opacity: active ? 1 : 0.28, fontSize:8 }}>
                                {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonRows cols={FLAT_COLS.length} rows={9}/>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={FLAT_COLS.length} style={{ textAlign:'center', padding:'64px 20px' }}>
                        <div style={{ display:'inline-flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                          <div style={{ width:44, height:44, borderRadius:12, background:T.hairSoft,
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Users size={19} color={T.faint}/>
                          </div>
                          <div style={{ fontSize:13.5, fontWeight:700, color:T.body }}>
                            {rows.length === 0 ? 'No attendance records' : 'No matching records'}
                          </div>
                          <div style={{ fontSize:12, color:T.faint, maxWidth:320 }}>
                            {rows.length === 0
                              ? `Nothing was logged for ${fmtDate(date)} in this category.`
                              : 'Try clearing the search box or switching back to the All filter.'}
                          </div>
                          {rows.length > 0 && (
                            <button onClick={() => { setSearch(''); setStatusF('all'); setCompany(''); }}
                              style={{ marginTop:4, border:`1px solid ${T.hair}`, background:T.surface,
                                color:T.navyLift, borderRadius:8, padding:'6px 14px',
                                fontSize:12, fontWeight:700, cursor:'pointer' }}>
                              Clear filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : filteredRows.map((r, i) => {
                    const isLate = Number(r.late_minutes) > 0;
                    const sk = statusKey(r);
                    const accent = (STATUS_COLOR[sk] || STATUS_COLOR.absent).dot;
                    return (
                      <tr key={r.user_id || i} className="ts-row" style={{
                        background: i % 2 === 0 ? T.surface : '#FCFDFF',
                      }}>
                        <td style={{ ...td, borderLeft:`3px solid ${accent}`, paddingLeft:9 }}>
                          <span style={{ color:'#C7CEDB', fontSize:10.5, fontVariantNumeric:'tabular-nums' }}>{i+1}</span>
                        </td>
                        <td style={{ ...td, whiteSpace:'nowrap', minWidth:196 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <Avatar name={r.name} size={density === 'compact' ? 26 : 32}/>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontWeight:700, color:T.ink, fontSize:12.5, lineHeight:1.25 }}>{r.name}</div>
                              <div style={{ fontSize:10, color:T.faint, fontWeight:600,
                                fontVariantNumeric:'tabular-nums' }}>
                                {r.emp_id || '—'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...td, color:T.body, fontSize:11.5 }}>{r.designation || dash}</td>
                        <td style={{ ...td, color:T.body, fontSize:11.5 }}>{r.department || dash}</td>
                        <td style={{ ...td, color:T.muted, fontSize:11.5 }}>{r.trade || dash}</td>
                        <td style={td}>
                          <span style={{
                            fontSize:9.5, fontWeight:800, letterSpacing:0.3,
                            background: r.company?.toLowerCase().includes('bcim') ? '#EFF6FF' : '#FFF7ED',
                            color: r.company?.toLowerCase().includes('bcim') ? '#1D4ED8' : '#9A3412',
                            border:`1px solid ${r.company?.toLowerCase().includes('bcim') ? '#BFDBFE' : '#FED7AA'}`,
                            borderRadius:5, padding:'2px 7px', display:'inline-block', whiteSpace:'nowrap',
                          }}>
                            {r.company || '—'}
                          </span>
                        </td>
                        <td style={{ ...td, color:T.muted, fontSize:11.5, maxWidth:150,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                          title={r.project_name}>
                          {r.project_name || dash}
                        </td>

                        {/* ── Attendance cluster ── */}
                        <td style={{ ...td, textAlign:'center', background:'#F9FCFF' }}>
                          <Pill status={r.attendance_status} out_time={r.out_time}/>
                        </td>
                        <td style={{ ...td, background:'#F9FCFF', fontVariantNumeric:'tabular-nums',
                          whiteSpace:'nowrap', fontWeight:700,
                          color: isLate ? T.absent : T.ink }}>
                          {r.in_time || dash}
                        </td>
                        <td style={{ ...td, background:'#F9FCFF', fontVariantNumeric:'tabular-nums',
                          whiteSpace:'nowrap', fontWeight:700,
                          color: (r.in_time && !r.out_time) ? T.single : T.ink }}>
                          {r.out_time || dash}
                        </td>
                        <td style={{ ...td, background:'#F9FCFF', minWidth:110 }}>
                          <WorkWindow in_time={r.in_time} out_time={r.out_time} late_minutes={r.late_minutes}/>
                        </td>
                        <td style={{ ...td, textAlign:'center', background:'#F9FCFF', fontVariantNumeric:'tabular-nums' }}>
                          {isLate
                            ? <span style={{
                                background:'#FEF2F2', color:'#B91C1C', border:'1px solid #FECACA',
                                borderRadius:5, padding:'2px 7px', fontWeight:800, fontSize:10.5,
                                whiteSpace:'nowrap',
                              }}>{r.late_minutes}m</span>
                            : dash}
                        </td>
                        <td style={{ ...td, textAlign:'center', background:'#F9FCFF',
                          color:T.body, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>
                          {Number(r.hours_worked) > 0 ? Number(r.hours_worked).toFixed(1) : dash}
                        </td>
                        <td style={{ ...td, textAlign:'center', background:'#F9FCFF' }}>
                          {Number(r.overtime_hours) > 0
                            ? <span style={{ background:'#FFFBEB', color:'#92400E', border:'1px solid #FDE68A',
                                borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:800,
                                whiteSpace:'nowrap', fontVariantNumeric:'tabular-nums' }}>
                                +{Number(r.overtime_hours).toFixed(1)}h
                              </span>
                            : dash}
                        </td>

                        <td style={{ ...td, color:T.body, fontSize:11.5, whiteSpace:'nowrap' }}>{r.shift || dash}</td>
                        <td style={{ ...td, color:T.body, fontSize:11.5, whiteSpace:'nowrap' }}>{r.location || dash}</td>
                        <td style={{ ...td, color:T.muted, fontSize:11.5 }}>{r.eng_fm_ch_cm || dash}</td>
                        <td style={{ ...td, color:T.muted, fontSize:11.5 }}>{r.incharge_name || dash}</td>
                        <td style={{ ...td, color:T.muted, fontSize:11.5 }}>{r.tower_incharge || dash}</td>
                        <td style={td}>
                          <span style={{
                            fontSize:9.5, fontWeight:800, letterSpacing:0.3,
                            color: r.status === 'ACTIVE' ? '#15803D' : '#B91C1C',
                            background: r.status === 'ACTIVE' ? '#F0FDF4' : '#FEF2F2',
                            border:`1px solid ${r.status === 'ACTIVE' ? '#BBF7D0' : '#FECACA'}`,
                            borderRadius:5, padding:'2px 7px', display:'inline-block',
                          }}>
                            {r.status || '—'}
                          </span>
                        </td>
                        <td style={{ ...td, color:T.muted, fontSize:11.5, maxWidth:140,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                          title={r.reason}>
                          {r.reason || dash}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {!loading && rows.length > 0 && (
                  <tfoot>
                    {/* Totals track the CURRENT filter, so the breakdown always
                        reconciles with the record count shown beside it. */}
                    <tr style={{ background:'#F0F6FF' }}>
                      <td colSpan={7} style={{ ...td, textAlign:'right', color:T.navyMid, fontWeight:800,
                        borderTop:`2px solid #BFDBFE`, borderBottom:'none', fontSize:11.5 }}>
                        {filteredRows.length === rows.length ? 'Grand Total' : 'Filtered Total'}
                        <span style={{ color:T.faint, fontWeight:600 }}> · {filteredRows.length} records</span>
                      </td>
                      <td style={{ ...td, textAlign:'center', whiteSpace:'nowrap',
                        borderTop:`2px solid #BFDBFE`, borderBottom:'none' }}>
                        <span style={{ display:'inline-flex', gap:7, fontSize:10.5, fontWeight:800 }}>
                          <span style={{ color:T.present }}>{filteredTotals.present}P</span>
                          <span style={{ color:T.half }}>{filteredTotals.half}HD</span>
                          <span style={{ color:T.absent }}>{filteredTotals.absent}A</span>
                          <span style={{ color:T.leave }}>{filteredTotals.leave}L</span>
                          {filteredTotals.week_off > 0 && <span style={{ color:T.off }}>{filteredTotals.week_off}WO</span>}
                        </span>
                      </td>
                      <td colSpan={2} style={{ ...td, borderTop:`2px solid #BFDBFE`, borderBottom:'none' }}/>
                      <td style={{ ...td, borderTop:`2px solid #BFDBFE`, borderBottom:'none' }}/>
                      <td style={{ ...td, textAlign:'center', color:T.absent, fontWeight:800,
                        borderTop:`2px solid #BFDBFE`, borderBottom:'none', fontSize:11 }}>
                        {filteredTotals.late > 0 ? `${filteredTotals.late} late` : '—'}
                      </td>
                      <td style={{ ...td, textAlign:'center', color:T.hours, fontWeight:800,
                        fontVariantNumeric:'tabular-nums', borderTop:`2px solid #BFDBFE`,
                        borderBottom:'none', fontSize:11.5 }}>
                        {filteredTotals.hours > 0 ? filteredTotals.hours.toFixed(1) : '—'}
                      </td>
                      <td style={{ ...td, textAlign:'center', color:'#92400E', fontWeight:800,
                        fontVariantNumeric:'tabular-nums', borderTop:`2px solid #BFDBFE`,
                        borderBottom:'none', fontSize:11 }}>
                        {filteredTotals.ot > 0 ? `+${filteredTotals.ot.toFixed(1)}` : '—'}
                      </td>
                      <td colSpan={7} style={{ ...td, borderTop:`2px solid #BFDBFE`, borderBottom:'none' }}/>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Legend */}
            {!loading && filteredRows.length > 0 && (
              <div className="no-print" style={{
                display:'flex', alignItems:'center', gap:14, flexWrap:'wrap',
                padding:'10px 16px', borderTop:`1px solid ${T.hair}`, background:'#FCFDFF',
              }}>
                <span style={{ fontSize:9.5, color:T.faint, fontWeight:800, letterSpacing:0.7,
                  textTransform:'uppercase' }}>Legend</span>
                {Object.entries(STATUS_FULL).map(([k, label]) => (
                  <span key={k} style={{ display:'inline-flex', alignItems:'center', gap:5,
                    fontSize:10.5, color:T.muted, fontWeight:600 }}>
                    <span style={{ width:7, height:7, borderRadius:'50%',
                      background:(STATUS_COLOR[k] || STATUS_COLOR.absent).dot }}/>
                    <b style={{ color:T.body }}>{STATUS_LABEL[k]}</b> {label}
                  </span>
                ))}
                <span style={{ fontSize:10.5, color:T.faint, marginLeft:'auto', fontWeight:600 }}>
                  Working Window plots 06:00 → 22:00 · striped bar = no out-punch
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── PRINT TABLE (grouped by dept, visible only in print) ── */}
        {!loading && !error && rows.length > 0 && (
          <div className="print-only ts-table-wrap" style={{ marginTop:8 }}>
            <table className="print-table" style={{ borderCollapse:'collapse', width:'100%', fontSize:12 }}>
              <thead>
                <tr>
                  {['#','EMP ID','Name','Designation','Dept','Trade','Company','P/A','In','Out','Late','Hrs','OT','Shift','Location',
                    'Eng/FM/Ch/CM','Incharge','Tower Incharge','Status','Reason']
                    .map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(deptGroupedRows).map(([dept, dRows]) => {
                  const dp = dRows.filter(r => r.attendance_status === 'present').length;
                  const da = dRows.filter(r => r.attendance_status === 'absent').length;
                  const dh = dRows.filter(r => r.attendance_status === 'half_day').length;
                  const dl = dRows.filter(r => r.attendance_status === 'leave').length;
                  return [
                    <tr key={`dept-${dept}`} className="dept-header-row">
                      <td colSpan={20} style={{ padding:'3px 6px', fontWeight:700, fontSize:7.5 }}>
                        {dept} &nbsp;—&nbsp; {dp}P / {da}A{dh > 0 ? ` / ${dh}HD` : ''}{dl > 0 ? ` / ${dl}L` : ''} &nbsp; ({dRows.length} total)
                      </td>
                    </tr>,
                    ...dRows.map((r, i) => (
                      <tr key={r.user_id || `${dept}-${i}`}>
                        <td>{i+1}</td>
                        <td style={{ fontWeight:600 }}>{r.emp_id || '—'}</td>
                        <td style={{ fontWeight:600 }}>{r.name}</td>
                        <td>{r.designation}</td>
                        <td>{r.department}</td>
                        <td>{r.trade || '—'}</td>
                        <td>{r.company}</td>
                        <td style={{ textAlign:'center' }}><Pill status={r.attendance_status} out_time={r.out_time}/></td>
                        <td>{r.in_time || '—'}</td>
                        <td>{r.out_time || '—'}</td>
                        <td style={{ textAlign:'center', color: Number(r.late_minutes)>0 ? '#DC2626' : 'inherit', fontWeight: Number(r.late_minutes)>0 ? 700 : 400 }}>
                          {r.late_minutes > 0 ? `${r.late_minutes}m` : '—'}
                        </td>
                        <td style={{ textAlign:'center' }}>{r.hours_worked > 0 ? r.hours_worked : '—'}</td>
                        <td style={{ textAlign:'center' }}>{r.overtime_hours > 0 ? `+${r.overtime_hours}h` : '—'}</td>
                        <td>{r.shift}</td>
                        <td>{r.location}</td>
                        <td>{r.eng_fm_ch_cm || '—'}</td>
                        <td>{r.incharge_name || '—'}</td>
                        <td>{r.tower_incharge || '—'}</td>
                        <td style={{ fontWeight:700, color: r.status === 'ACTIVE' ? '#15803D' : '#B91C1C' }}>{r.status}</td>
                        <td style={{ color:'#555' }}>{r.reason || '—'}</td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign:'right', fontWeight:700, padding:'4px 6px', borderTop:'2px solid #1B3A6B' }}>
                    Grand Total
                  </td>
                  <td style={{ textAlign:'center', fontWeight:700, padding:'4px 6px', borderTop:'2px solid #1B3A6B' }}>
                    {filteredTotals.present}P / {filteredTotals.absent}A / {filteredTotals.half}HD / {filteredTotals.leave}L
                    {filteredTotals.week_off > 0 ? ` / ${filteredTotals.week_off}WO` : ''}
                  </td>
                  <td colSpan={13} style={{ borderTop:'2px solid #1B3A6B' }}/>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* SIGNATURE SECTION */}
        <div className="print-only sig-section" style={{
          marginTop:40, borderTop:'1px solid #ccc', paddingTop:16,
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:20 }}>
            {[
              { role:'Prepared By',   name:'HR Executive' },
              { role:'Verified By',   name:'HR Manager / Admin' },
              { role:'Site Incharge', name:'Project Manager' },
              { role:'Approved By',   name:'Management / Director' },
            ].map(sig => (
              <div key={sig.role} style={{ flex:1, textAlign:'center' }}>
                <div style={{ borderBottom:'1.5px solid #333', marginBottom:6, height:40 }}/>
                <div style={{ fontSize:9, fontWeight:700, color:'#1B3A6B' }}>{sig.role}</div>
                <div style={{ fontSize:8, color:'#555', marginTop:2 }}>{sig.name}</div>
                <div style={{ fontSize:8, color:'#888', marginTop:2 }}>Date: ____________</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:'center', marginTop:12, fontSize:8, color:'#888' }}>
            This is a system-generated report — {meta.companyName} &nbsp;|&nbsp; Attendance Rate: {attendancePct}% &nbsp;|&nbsp; Printed on: {new Date().toLocaleString('en-IN')}
          </div>
        </div>

      </div>

      {/* MAIL TO CLIENT MODAL */}
      {showMailModal && (
        <div className="no-print" style={{
          position:'fixed', inset:0, background:'rgba(15,37,68,0.45)', zIndex:50,
          display:'flex', alignItems:'center', justifyContent:'center', padding:16,
        }} onClick={() => !sending && setShowMail(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:T.surface, borderRadius:16, width:'100%', maxWidth:420,
            padding:'22px 24px', boxShadow:'0 20px 60px rgba(15,37,68,0.35)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:4 }}>
              <Mail size={17} color={T.navyMid}/>
              <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:T.ink }}>Email Report to Client</h3>
            </div>
            <p style={{ fontSize:12, color:T.muted, margin:'6px 0 16px' }}>
              Sends the {fmtDate(date)} timesheet ({meta.projectName || 'All Projects'}) as a PDF, right now.
            </p>
            <label style={{ fontSize:11, fontWeight:700, color:T.faint, textTransform:'uppercase', letterSpacing:0.5 }}>
              Recipient email(s)
            </label>
            <input
              type="text" value={mailTo} onChange={e => setMailTo(e.target.value)}
              placeholder="client@example.com, another@example.com"
              autoFocus
              style={{ ...inputStyle, width:'100%', marginTop:6, marginBottom:18, boxSizing:'border-box' }}
            />
            <div style={{ display:'flex', gap:9, justifyContent:'flex-end' }}>
              <button onClick={() => setShowMail(false)} disabled={sending} style={{
                border:`1px solid ${T.hair}`, background:T.surface, color:T.body,
                borderRadius:9, padding:'8px 16px', fontSize:12.5, fontWeight:700, cursor:'pointer',
              }}>Cancel</button>
              <button onClick={handleSendToClient} disabled={sending} style={{
                border:'none', background:T.navyMid, color:'#fff',
                borderRadius:9, padding:'8px 18px', fontSize:12.5, fontWeight:800, cursor:'pointer',
                opacity: sending ? 0.7 : 1, display:'flex', alignItems:'center', gap:6,
              }}>
                <Mail size={13}/> {sending ? 'Sending…' : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAVED RECIPIENT CONFIGS MODAL */}
      {showConfigsModal && (
        <div className="no-print" style={{
          position:'fixed', inset:0, background:'rgba(15,37,68,0.45)', zIndex:50,
          display:'flex', alignItems:'center', justifyContent:'center', padding:16,
        }} onClick={() => setShowConfigs(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:T.surface, borderRadius:16, width:'100%', maxWidth:640,
            maxHeight:'82vh', display:'flex', flexDirection:'column',
            boxShadow:'0 20px 60px rgba(15,37,68,0.35)',
          }}>
            <div style={{ padding:'20px 24px 14px', borderBottom:`1px solid ${T.hair}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                <Settings size={17} color={T.navyMid}/>
                <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:T.ink }}>Saved Recipient Configs</h3>
              </div>
              <p style={{ fontSize:12, color:T.muted, margin:'6px 0 0' }}>
                Each config auto-sends its own daily timesheet email at 09:30 AM to its recipient list.
                Use Send Now to trigger one immediately for today's date.
              </p>
            </div>

            <div style={{ overflowY:'auto', padding:'14px 24px', flex:1 }}>
              {/* Add new config */}
              <div style={{
                display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:10,
                padding:'12px 14px', background:T.canvas, borderRadius:10, border:`1px solid ${T.hair}`,
              }}>
                <select value={cfgProjectId} onChange={e => setCfgProjectId(e.target.value)}
                  style={{ ...inputStyle, gridColumn:'1 / 2' }}>
                  <option value="">All Projects (combined)</option>
                  <option value="HEAD_OFFICE">Head Office</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={cfgCategory} onChange={e => setCfgCategory(e.target.value)} style={inputStyle}>
                  <option value="staff">BCIM Staff</option>
                  <option value="labour">SC / Labour Workers</option>
                  <option value="all">All Employees</option>
                </select>
                <input
                  type="text" value={cfgRecipients} onChange={e => setCfgRecipients(e.target.value)}
                  placeholder="client@example.com, another@example.com"
                  style={{ ...inputStyle, gridColumn:'1 / 3' }}
                />
                <button onClick={handleCreateConfig} disabled={cfgSavingId === 'new'} style={{
                  gridColumn:'1 / 3', border:'none', background:T.navyMid, color:'#fff',
                  borderRadius:9, padding:'8px 14px', fontSize:12.5, fontWeight:800, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  opacity: cfgSavingId === 'new' ? 0.7 : 1,
                }}>
                  <Plus size={14}/> {cfgSavingId === 'new' ? 'Adding…' : 'Add Config'}
                </button>
              </div>

              {/* Existing configs */}
              {configs.length === 0 ? (
                <div style={{ textAlign:'center', color:T.faint, fontSize:12.5, padding:'24px 0' }}>
                  No saved recipient configs yet.
                </div>
              ) : configs.map(cfg => (
                <div key={cfg.id} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                  border:`1px solid ${T.hair}`, borderRadius:10, marginBottom:8,
                  opacity: cfg.enabled ? 1 : 0.55,
                }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, display:'flex', alignItems:'center', gap:7 }}>
                      {cfg.project_name}
                      <span style={{ fontSize:9.5, fontWeight:800, color:T.navyLift, background:'#EAF2FE',
                        borderRadius:999, padding:'1px 8px', textTransform:'uppercase' }}>{cfg.category}</span>
                      {!cfg.enabled && <span style={{ fontSize:9.5, fontWeight:800, color:T.absent }}>PAUSED</span>}
                    </div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:2, whiteSpace:'nowrap',
                      overflow:'hidden', textOverflow:'ellipsis' }} title={cfg.recipients}>
                      {cfg.recipients}
                    </div>
                  </div>
                  <button onClick={() => handleSendNowConfig(cfg)} disabled={cfgSavingId === cfg.id}
                    title="Send now" style={{
                      border:`1px solid ${T.hair}`, background:T.surface, color:T.navyMid,
                      borderRadius:8, padding:6, cursor:'pointer', display:'flex',
                    }}>
                    <Send size={13}/>
                  </button>
                  <button onClick={() => handleToggleConfig(cfg)} disabled={cfgSavingId === cfg.id}
                    title={cfg.enabled ? 'Pause' : 'Resume'} style={{
                      border:`1px solid ${T.hair}`, background:T.surface,
                      color: cfg.enabled ? T.present : T.faint,
                      borderRadius:8, padding:6, cursor:'pointer', display:'flex',
                    }}>
                    <Power size={13}/>
                  </button>
                  <button onClick={() => handleDeleteConfig(cfg)} disabled={cfgSavingId === cfg.id}
                    title="Remove" style={{
                      border:`1px solid ${T.hair}`, background:T.surface, color:T.absent,
                      borderRadius:8, padding:6, cursor:'pointer', display:'flex',
                    }}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
            </div>

            <div style={{ padding:'12px 24px', borderTop:`1px solid ${T.hair}`, display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => setShowConfigs(false)} style={{
                border:`1px solid ${T.hair}`, background:T.surface, color:T.body,
                borderRadius:9, padding:'8px 16px', fontSize:12.5, fontWeight:700, cursor:'pointer',
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .ts-row:hover td { background: #F2F7FE !important; }
        .ts-scroll::-webkit-scrollbar { height: 11px; width: 11px; }
        .ts-scroll::-webkit-scrollbar-track { background: ${T.hairSoft}; }
        .ts-scroll::-webkit-scrollbar-thumb {
          background: #A9B6C9; border-radius: 8px;
          border: 3px solid ${T.hairSoft};
        }
        .ts-scroll::-webkit-scrollbar-thumb:hover { background: #7B8CA5; }
        .ts-scroll::-webkit-scrollbar-corner { background: ${T.hairSoft}; }
        .ts-scroll { scrollbar-width: thin; scrollbar-color: #A9B6C9 ${T.hairSoft}; }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
}
