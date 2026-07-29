import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Printer, Download, RefreshCw, Filter, ChevronRight, Search, X, Mail, Settings, Send, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const today = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

const STATUS_COLOR = {
  present:  { bg: '#D1FAE5', color: '#065F46' },
  sp:       { bg: '#FFF7ED', color: '#C2410C' }, // single punch — present but missing out-punch
  absent:   { bg: '#FEE2E2', color: '#991B1B' },
  leave:    { bg: '#FEF3C7', color: '#92400E' },
  half_day: { bg: '#DBEAFE', color: '#1E40AF' },
  holiday:  { bg: '#EDE9FE', color: '#5B21B6' },
  // The API synthesises week_off for anyone with no punch on a Sunday. Without
  // its own entry it fell through to the ABSENT style, painting a normal
  // weekend red and making a rest day look like mass absenteeism.
  week_off: { bg: '#F1F5F9', color: '#475569' },
};
const STATUS_LABEL = { present:'P', sp:'SP', absent:'A', leave:'L', half_day:'HD', holiday:'H', week_off:'WO' };

// Statuses where the employee was never expected in — they must be excluded
// from the attendance-rate denominator, otherwise every Sunday and public
// holiday reports a collapse in attendance.
const NON_WORKING = ['week_off', 'holiday'];

function Pill({ status, out_time }) {
  const s = (status || 'absent').toLowerCase();
  // SP = present but missing out-punch (forgot to punch out)
  const key = (s === 'present' && !out_time) ? 'sp' : s;
  const { bg, color } = STATUS_COLOR[key] || STATUS_COLOR.absent;
  return (
    <span style={{
      background: bg, color, border: `1px solid ${color}33`,
      borderRadius: 3, padding: '2px 8px', fontWeight: 700,
      fontSize: 10, letterSpacing: 0.5, display: 'inline-block',
    }}>
      {STATUS_LABEL[key] || key.toUpperCase()}
    </span>
  );
}

function Avatar({ name }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#0EA5E9'];
  const idx = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      width:30, height:30, borderRadius:'50%', background:colors[idx],
      color:'#fff', fontSize:11, fontWeight:700, flexShrink:0, letterSpacing:0.5,
    }}>{initials}</span>
  );
}

function MiniDonut({ pct = 0 }) {
  const r = 28, cx = 32, cy = 32;
  const circ = 2 * Math.PI * r;
  const filled = Math.min((pct / 100) * circ, circ);
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" style={{ flexShrink:0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={7}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#10B981" strokeWidth={7}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}/>
      <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle"
        fontSize={12} fontWeight={800} fill="#111827">{Math.round(pct)}%</text>
    </svg>
  );
}

function AttBar({ present=0, absent=0, half=0, leave=0 }) {
  const total = (present + absent + half + leave) || 1;
  const segs = [
    { val: present, color: '#10B981' },
    { val: absent,  color: '#EF4444' },
    { val: half,    color: '#6366F1' },
    { val: leave,   color: '#F59E0B' },
  ];
  return (
    <div style={{ display:'flex', height:6, borderRadius:4, overflow:'hidden', width:'100%', gap:1 }}>
      {segs.map((s, i) => s.val > 0 && (
        <div key={i} style={{
          width: `${(s.val / total) * 100}%`, background: s.color, borderRadius:2,
        }}/>
      ))}
    </div>
  );
}

const COL_KEYS = {
  'EMP ID':      'emp_id',
  'Name':        'name',
  'Designation': 'designation',
  'Department':  'department',
  'Trade':       'trade',
  'Company':     'company',
  'Project':     'project_name',
  'P/A':         'attendance_status',
  'In Time':     'in_time',
  'Out Time':    'out_time',
  'Late Min':    'late_minutes',
  'Hrs':         'hours_worked',
  'Shift':       'shift',
  'Location':    'location',
  'Eng/FM/Ch/CM':    'eng_fm_ch_cm',
  'Incharge':        'incharge_name',
  'Tower Incharge':  'tower_incharge',
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
  const [date, setDate]             = useState(today());
  const [category, setCategory]     = useState('staff');
  const [projectFilter, setProject] = useState('');
  const [rows, setRows]             = useState([]);
  const [summary, setSummary]       = useState({ total:0, present:0, half:0, absent:0, leave:0 });
  const [meta, setMeta]             = useState({ companyName:'BCIM', projectName:'', projectCode:'', holidayName:null, isSunday:false });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [sortKey, setSortKey]       = useState(null);
  const [sortDir, setSortDir]       = useState('asc');
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusF]  = useState('all');
  const [companyFilter, setCompany] = useState('');
  const [sendingTest, setSendingTest]     = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Drag-to-scroll (both axes) on the table wrapper
  const tableWrapRef = useRef(null);
  const dragState    = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
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
      if (sortKey === 'late_minutes' || sortKey === 'hours_worked') {
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

  const handleSendTestEmail = async () => {
    setSendingTest(true);
    try {
      const res = await hrAttendanceAPI.timesheetReportTestEmail(date, undefined, undefined, category).then(r => r.data);
      if (!res.ok) toast.error(res.reason || 'Could not send test email');
      else toast.success(`Test email sent to ${res.recipients?.join(', ') || 'your inbox'}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to send test email');
    } finally { setSendingTest(false); }
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
    { label:'Total Strength', val:summary.total,   accent:'#3B82F6', sub:`${expectedStrength} expected in` },
    { label:'Present',        val:summary.present, accent:'#10B981', sub: spCount > 0 ? `${spCount} single-punch` : null },
    { label:'Half Day',       val:summary.half||0, accent:'#6366F1' },
    { label:'Absent',         val:summary.absent,  accent:'#EF4444' },
    { label:'On Leave',       val:summary.leave,   accent:'#F59E0B' },
    ...((summary.week_off || 0) > 0 ? [{ label:'Week Off', val:summary.week_off, accent:'#94A3B8' }] : []),
    ...((summary.holiday  || 0) > 0 ? [{ label:'Holiday',  val:summary.holiday,  accent:'#8B5CF6' }] : []),
    { label:'Late Arrivals',  val:lateCount,        accent:'#F97316' },
    { label:'Man-Hours',      val:hoursStats.worked.toFixed(0), accent:'#0891B2',
      sub: hoursStats.ot > 0 ? `+${hoursStats.ot.toFixed(0)} OT` : `avg ${hoursStats.avg.toFixed(1)}h` },
  ];

  const qFilters = [
    { key:'all',      label:'All' },
    { key:'present',  label:'Present',  color:'#10B981' },
    { key:'sp',       label:'Single Punch', color:'#F97316' },
    { key:'late',     label:'Late',     color:'#DC2626' },
    { key:'absent',   label:'Absent',   color:'#EF4444' },
    { key:'half_day', label:'Half Day', color:'#6366F1' },
    { key:'leave',    label:'Leave',    color:'#F59E0B' },
    ...((summary.week_off || 0) > 0 ? [{ key:'week_off', label:'Week Off', color:'#64748B' }] : []),
    ...((summary.holiday  || 0) > 0 ? [{ key:'holiday',  label:'Holiday',  color:'#8B5CF6' }] : []),
  ];

  const inputStyle = {
    border:'0.5px solid #D1D5DB', borderRadius:6,
    padding:'5px 10px', fontSize:13, color:'#374151',
    background:'#F9FAFB', outline:'none',
  };

  return (
    <div style={{ background:'#F8FAFC', minHeight:'100vh' }}>
      <style>{PRINT_CSS}</style>

      {/* ── TOP HEADER BAR ── */}
      <div className="no-print" style={{
        position:'relative', overflow:'hidden',
        background:'linear-gradient(135deg, #1B3A6B 0%, #0F2544 100%)',
        padding:'16px 24px', display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:12,
      }}>
        <div style={{ position:'absolute', inset:0, opacity:0.07, pointerEvents:'none',
          backgroundImage:'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize:'16px 16px' }}/>
        <div style={{ position:'absolute', right:-48, top:-48, width:200, height:200,
          borderRadius:'50%', background:'rgba(255,255,255,0.05)', pointerEvents:'none' }}/>
        <div style={{ position:'relative' }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>HR Admin</span>
            <ChevronRight size={11} color="rgba(255,255,255,0.35)"/>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>Attendance</span>
            <ChevronRight size={11} color="rgba(255,255,255,0.35)"/>
            <span style={{ fontSize:11, color:'#93C5FD', fontWeight:600 }}>Daily Timesheet</span>
          </div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:'#fff', letterSpacing:-0.4 }}>
            Daily Timesheet Report
          </h2>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:5, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{fmtDate(date)}</span>
            {meta.projectName && (
              <>
                <span style={{ color:'rgba(255,255,255,0.25)' }}>·</span>
                <span style={{ fontSize:12, color:'#fff', fontWeight:600 }}>{meta.projectName}</span>
              </>
            )}
            {meta.holidayName && (
              <span style={{ background:'rgba(139,92,246,0.25)', border:'1px solid rgba(196,181,253,0.4)',
                color:'#DDD6FE', borderRadius:999, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                Public Holiday — {meta.holidayName}
              </span>
            )}
            {!meta.holidayName && meta.isSunday && (
              <span style={{ background:'rgba(148,163,184,0.25)', border:'1px solid rgba(203,213,225,0.4)',
                color:'#E2E8F0', borderRadius:999, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                Sunday — Week Off
              </span>
            )}
          </div>
        </div>
        <div style={{ position:'relative', display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={load} disabled={loading} style={{
            display:'flex', alignItems:'center', gap:5,
            background:'rgba(255,255,255,0.12)', color:'#fff', border:'1px solid rgba(255,255,255,0.22)',
            borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
            opacity: loading ? 0.6 : 1,
          }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/> Refresh
          </button>
          <button onClick={handleExport} style={{
            display:'flex', alignItems:'center', gap:5,
            background:'rgba(255,255,255,0.12)', color:'#fff', border:'1px solid rgba(255,255,255,0.22)',
            borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
          }}>
            <Download size={13}/> Export CSV
          </button>
          <button onClick={handleSendTestEmail} disabled={sendingTest}
            title="Sends today's report to your own email — preview of the automated daily send"
            style={{
              display:'flex', alignItems:'center', gap:5,
              background:'rgba(255,255,255,0.12)', color:'#fff', border:'1px solid rgba(255,255,255,0.22)',
              borderRadius:8, padding:'7px 14px', fontSize:13, fontWeight:600,
              cursor: sendingTest ? 'wait' : 'pointer', opacity: sendingTest ? 0.6 : 1,
            }}>
            <Mail size={13}/> {sendingTest ? 'Sending…' : 'Send Test Email'}
          </button>
          <button onClick={() => setShowConfigModal(true)}
            title="Manage which projects get an automated daily timesheet email, and who receives each one"
            style={{
              display:'flex', alignItems:'center', gap:5,
              background:'rgba(255,255,255,0.12)', color:'#fff', border:'1px solid rgba(255,255,255,0.22)',
              borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
            }}>
            <Settings size={13}/> Email Recipients
          </button>
          <button onClick={() => window.print()} style={{
            display:'flex', alignItems:'center', gap:5,
            background:'#fff', color:'#1B3A6B', border:'none',
            borderRadius:8, padding:'7px 16px', fontSize:13, cursor:'pointer', fontWeight:800,
          }}>
            <Printer size={13}/> Print / PDF
          </button>
        </div>
      </div>

      {/* ── FILTER BAR ── */}
      <div className="no-print" style={{
        background:'#fff', borderBottom:'0.5px solid #E5E7EB',
        padding:'10px 24px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
      }}>
        <Filter size={13} color="#6B7280"/>
        <span style={{ fontSize:12, color:'#6B7280', fontWeight:500, marginRight:2 }}>Filters:</span>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle}/>
        <select value={category} onChange={e => { setCategory(e.target.value); setCompany(''); }} style={inputStyle}>
          <option value="staff">BCIM Staff</option>
          <option value="labour">SC / Labour Workers</option>
          <option value="all">All Employees</option>
        </select>

        {/* Company filter — populated from loaded rows */}
        <select
          value={companyFilter}
          onChange={e => setCompany(e.target.value)}
          style={{ ...inputStyle, minWidth:190, maxWidth:260 }}
          title="Filter by contractor / company"
        >
          <option value="">All Companies</option>
          {availableCompanies.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {companyFilter && (
          <button onClick={() => setCompany('')} style={{
            display:'flex', alignItems:'center', gap:3,
            background:'#FEF2F2', color:'#B91C1C', border:'0.5px solid #FECACA',
            borderRadius:6, padding:'4px 10px', fontSize:12, cursor:'pointer',
          }}>
            <X size={11}/> {companyFilter}
          </button>
        )}

        <select value={projectFilter} onChange={e => setProject(e.target.value)}
          style={{ ...inputStyle, minWidth:190 }}>
          <option value="">All Projects</option>
          <option value="HEAD_OFFICE">Head Office</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.project_code ? `[${p.project_code}] ` : ''}{p.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── KPI + ANALYTICS ROW ── */}
      <div className="no-print" style={{ padding:'16px 24px 0', display:'flex', gap:12, flexWrap:'wrap' }}>
        {/* KPI Cards */}
        {kpiCards.map(k => (
          <div key={k.label} style={{
            background:'#fff', border:'0.5px solid #E5E7EB',
            borderLeft:`3px solid ${k.accent}`, borderRadius:10,
            padding:'12px 18px', minWidth:118, flex:'0 0 auto',
            boxShadow:'0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize:11, color:'#6B7280', fontWeight:500, marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:26, fontWeight:800, color:'#111827', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>
              {loading ? <span style={{ fontSize:16, color:'#E5E7EB' }}>—</span> : k.val}
            </div>
            {!loading && k.sub && (
              <div style={{ fontSize:10, color:'#9CA3AF', marginTop:4 }}>{k.sub}</div>
            )}
          </div>
        ))}

        {/* Attendance % Donut */}
        {!loading && summary.total > 0 && (
          <div style={{
            background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:10,
            padding:'12px 18px', display:'flex', alignItems:'center', gap:14, flex:'0 0 auto',
          }}>
            <MiniDonut pct={attendancePct}/>
            <div>
              <div style={{ fontSize:11, color:'#6B7280', fontWeight:500, marginBottom:2 }}>Attendance Rate</div>
              <div style={{ fontSize:10, color:'#9CA3AF', marginBottom:5 }}>
                of {expectedStrength} expected
                {(summary.week_off || summary.holiday) > 0 && (
                  <span> · {(summary.week_off||0) + (summary.holiday||0)} off-duty excluded</span>
                )}
              </div>
              <AttBar
                present={summary.present} absent={summary.absent}
                half={summary.half||0} leave={summary.leave}
              />
              <div style={{ display:'flex', gap:8, marginTop:6 }}>
                {[
                  { label:'P',  color:'#10B981', val:summary.present },
                  { label:'SP', color:'#F97316', val:rows.filter(r=>r.attendance_status==='present'&&!r.out_time).length },
                  { label:'A',  color:'#EF4444', val:summary.absent },
                  { label:'HD', color:'#6366F1', val:summary.half||0 },
                  { label:'L',  color:'#F59E0B', val:summary.leave },
                ].map(s => (
                  <span key={s.label} style={{ fontSize:10, color:'#374151' }}>
                    <span style={{ color:s.color, fontWeight:700 }}>{s.label}</span> {s.val}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── DEPARTMENT BREAKDOWN ── */}
      {!loading && deptBreakdown.length > 0 && (
        <div className="no-print" style={{ padding:'12px 24px 0', display:'flex', gap:10, flexWrap:'wrap' }}>
          {deptBreakdown.slice(0, 6).map(d => (
            <div key={d.dept} style={{
              background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:8,
              padding:'8px 14px', minWidth:140, flex:'0 0 auto',
            }}>
              <div style={{ fontSize:10, color:'#6B7280', fontWeight:600, marginBottom:4,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:160 }}>
                {d.dept}
              </div>
              <AttBar present={d.present} absent={d.absent} half={d.half} leave={d.leave}/>
              <div style={{ display:'flex', gap:6, marginTop:5 }}>
                <span style={{ fontSize:10, color:'#10B981', fontWeight:700 }}>{d.present}P</span>
                <span style={{ fontSize:10, color:'#EF4444', fontWeight:700 }}>{d.absent}A</span>
                {d.half > 0 && <span style={{ fontSize:10, color:'#6366F1', fontWeight:700 }}>{d.half}HD</span>}
                {d.leave > 0 && <span style={{ fontSize:10, color:'#F59E0B', fontWeight:700 }}>{d.leave}L</span>}
                <span style={{ fontSize:10, color:'#9CA3AF', marginLeft:'auto' }}>{d.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SEARCH + QUICK FILTERS ── */}
      <div className="no-print" style={{
        padding:'12px 24px 8px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
      }}>
        {/* Search box */}
        <div style={{ position:'relative', flex:'0 0 auto' }}>
          <Search size={13} color="#9CA3AF" style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)' }}/>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, EMP ID, dept…"
            style={{
              border:'0.5px solid #D1D5DB', borderRadius:6,
              padding:'6px 30px 6px 28px', fontSize:13, color:'#374151',
              background:'#fff', outline:'none', width:220,
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position:'absolute', right:7, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', padding:0,
              display:'flex', alignItems:'center',
            }}>
              <X size={12} color="#9CA3AF"/>
            </button>
          )}
        </div>

        {/* Status quick filters */}
        <div style={{ display:'flex', gap:4 }}>
          {qFilters.map(f => (
            <button key={f.key} onClick={() => setStatusF(f.key)} style={{
              border: statusFilter === f.key ? `1.5px solid ${f.color || '#1A56DB'}` : '0.5px solid #E5E7EB',
              background: statusFilter === f.key ? (f.color ? `${f.color}15` : '#EFF6FF') : '#fff',
              color: statusFilter === f.key ? (f.color || '#1A56DB') : '#6B7280',
              borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer',
              fontWeight: statusFilter === f.key ? 700 : 500,
            }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Row count */}
        <span style={{ fontSize:12, color:'#9CA3AF', marginLeft:'auto' }}>
          {loading ? 'Loading…' : (
            filteredRows.length === rows.length
              ? `${rows.length} records`
              : `${filteredRows.length} of ${rows.length} records`
          )}
        </span>
      </div>

      {/* ── PRINTABLE DOCUMENT ── */}
      <div id="ts-print-root" style={{ padding:'0 24px 32px' }}>

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

        {/* LOADING / ERROR */}
        {loading && (
          <div className="no-print" style={{ textAlign:'center', padding:56 }}>
            <div style={{ display:'inline-flex', flexDirection:'column', alignItems:'center', gap:10 }}>
              <div style={{
                width:32, height:32, borderRadius:'50%',
                border:'3px solid #E5E7EB', borderTopColor:'#1A56DB',
                animation:'spin 0.8s linear infinite',
              }}/>
              <span style={{ fontSize:13, color:'#6B7280' }}>Loading attendance data…</span>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        {error && (
          <div style={{
            background:'#FEF2F2', border:'0.5px solid #FECACA', borderRadius:8,
            padding:16, color:'#B91C1C', margin:'16px 0',
          }}>
            {error}
          </div>
        )}

        {/* ── TABLE ── */}
        {!loading && !error && (
          <div
            ref={tableWrapRef}
            className="ts-table-wrap ts-scroll"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            style={{ overflowX:'auto', overflowY:'auto', maxHeight:'65vh', marginTop:8, cursor:'grab' }}
          >
            <table className="print-table" style={{
              borderCollapse:'collapse', width:'100%', fontSize:12,
              background:'#fff', borderRadius:10,
              boxShadow:'0 1px 6px rgba(0,0,0,0.05)',
            }}>
              <thead>
                <tr style={{
                  background:'#F9FAFB',
                  position:'sticky', top:0, zIndex:2,
                  boxShadow:'0 1px 0 #E5E7EB',
                }}>
                  {['#','EMP ID','Name','Designation','Department','Trade','Company','Project',
                    'P/A','In Time','Out Time','Late Min','Hrs','OT','Shift','Location',
                    'Eng/FM/Ch/CM','Incharge','Tower Incharge','Emp Status','Reason',
                  ].map(h => {
                    const key = COL_KEYS[h];
                    const active = sortKey === key;
                    return (
                      <th key={h} onClick={() => handleSort(h)} style={{
                        padding:'9px 10px', textAlign:'left',
                        fontWeight:600, fontSize:11,
                        color: active ? '#1A56DB' : '#6B7280',
                        background: active ? '#EFF6FF' : '#F9FAFB',
                        cursor: key ? 'pointer' : 'default',
                        userSelect:'none', whiteSpace:'nowrap',
                      }}>
                        <span style={{ display:'flex', alignItems:'center', gap:3 }}>
                          {h}
                          {key && (
                            <span style={{ opacity: active ? 1 : 0.3, fontSize:9 }}>
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
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={21} style={{ textAlign:'center', padding:56, color:'#9CA3AF', fontSize:13 }}>
                      {rows.length === 0 ? `No records found for ${date}` : 'No records match your filter'}
                    </td>
                  </tr>
                ) : filteredRows.map((r, i) => {
                  const isLate = Number(r.late_minutes) > 0;
                  return (
                    <tr key={r.user_id || i} style={{
                      background: i % 2 === 0 ? '#fff' : '#FAFAFA',
                      borderBottom:'0.5px solid #F3F4F6',
                      borderLeft: isLate ? '3px solid #FCA5A5' : '3px solid transparent',
                    }}>
                      <td style={td}><span style={{ color:'#C4C9D4', fontSize:11 }}>{i+1}</span></td>
                      <td style={{ ...td, fontWeight:600, color:'#1A56DB', fontSize:11, whiteSpace:'nowrap' }}>
                        {r.emp_id || '—'}
                      </td>
                      <td style={{ ...td, whiteSpace:'nowrap' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                          <Avatar name={r.name}/>
                          <div>
                            <div style={{ fontWeight:600, color:'#111827', fontSize:12, lineHeight:1.3 }}>{r.name}</div>
                            <div style={{ fontSize:10, color:'#9CA3AF' }}>{r.designation}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...td, color:'#6B7280', fontSize:11 }}>{r.designation}</td>
                      <td style={{ ...td, color:'#374151' }}>{r.department}</td>
                      <td style={{ ...td, color:'#6B7280' }}>{r.trade || <span style={{ color:'#D1D5DB' }}>—</span>}</td>
                      <td style={td}>
                        <span style={{
                          fontSize:10, fontWeight:700, letterSpacing:0.3,
                          background: r.company?.toLowerCase().includes('bcim') ? '#EFF6FF' : '#FFF7ED',
                          color: r.company?.toLowerCase().includes('bcim') ? '#1D4ED8' : '#C2410C',
                          borderRadius:3, padding:'1px 6px', display:'inline-block',
                        }}>
                          {r.company}
                        </span>
                      </td>
                      <td style={{ ...td, color:'#6B7280', fontSize:11, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                        title={r.project_name}>
                        {r.project_name || <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign:'center' }}><Pill status={r.attendance_status} out_time={r.out_time}/></td>
                      <td style={{ ...td, color:'#374151', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                        {r.in_time || <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...td, color:'#374151', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                        {r.out_time || <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign:'center', fontVariantNumeric:'tabular-nums' }}>
                        {isLate
                          ? <span style={{
                              background:'#FEE2E2', color:'#DC2626',
                              borderRadius:4, padding:'1px 7px', fontWeight:700, fontSize:11,
                            }}>{r.late_minutes}m</span>
                          : <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign:'center', color:'#475569', fontVariantNumeric:'tabular-nums' }}>
                        {r.hours_worked > 0 ? r.hours_worked : <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign:'center' }}>
                        {r.overtime_hours > 0
                          ? <span style={{ background:'#FEF3C7', color:'#92400E', borderRadius:4, padding:'1px 7px', fontSize:10, fontWeight:700 }}>+{r.overtime_hours}h</span>
                          : <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...td, color:'#374151' }}>{r.shift}</td>
                      <td style={{ ...td, color:'#374151' }}>{r.location}</td>
                      <td style={{ ...td, color:'#6B7280' }}>{r.eng_fm_ch_cm || <span style={{ color:'#D1D5DB' }}>—</span>}</td>
                      <td style={{ ...td, color:'#6B7280' }}>{r.incharge_name || <span style={{ color:'#D1D5DB' }}>—</span>}</td>
                      <td style={{ ...td, color:'#6B7280' }}>{r.tower_incharge || <span style={{ color:'#D1D5DB' }}>—</span>}</td>
                      <td style={td}>
                        <span style={{
                          fontSize:10, fontWeight:700,
                          color: r.status === 'ACTIVE' ? '#15803D' : '#B91C1C',
                          background: r.status === 'ACTIVE' ? '#F0FDF4' : '#FEF2F2',
                          borderRadius:3, padding:'1px 7px', display:'inline-block',
                        }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ ...td, color:'#6B7280', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {r.reason || <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  {/* Totals track the CURRENT filter, so the breakdown always
                      reconciles with the record count shown beside it. */}
                  <tr style={{ background:'#F0F7FF', borderTop:'1.5px solid #BFDBFE' }}>
                    <td colSpan={8} style={{ ...td, textAlign:'right', color:'#1E40AF', fontWeight:700 }}>
                      {filteredRows.length === rows.length ? 'Grand Total' : 'Filtered Total'} ({filteredRows.length} records)
                    </td>
                    <td style={{ ...td, textAlign:'center', whiteSpace:'nowrap' }}>
                      <span style={{ color:'#15803D', fontWeight:800 }}>{filteredTotals.present}P</span>
                      {' / '}
                      <span style={{ color:'#6366F1', fontWeight:800 }}>{filteredTotals.half}HD</span>
                      {' / '}
                      <span style={{ color:'#B91C1C', fontWeight:800 }}>{filteredTotals.absent}A</span>
                      {' / '}
                      <span style={{ color:'#B45309', fontWeight:800 }}>{filteredTotals.leave}L</span>
                      {filteredTotals.week_off > 0 && <>{' / '}<span style={{ color:'#475569', fontWeight:800 }}>{filteredTotals.week_off}WO</span></>}
                    </td>
                    <td colSpan={2} style={td}/>
                    <td style={{ ...td, textAlign:'center', color:'#DC2626', fontWeight:800 }}>
                      {filteredTotals.late > 0 ? `${filteredTotals.late} late` : '—'}
                    </td>
                    <td style={{ ...td, textAlign:'center', color:'#0F766E', fontWeight:800, fontVariantNumeric:'tabular-nums' }}>
                      {filteredTotals.hours > 0 ? filteredTotals.hours.toFixed(1) : '—'}
                    </td>
                    <td style={{ ...td, textAlign:'center', color:'#92400E', fontWeight:800, fontVariantNumeric:'tabular-nums' }}>
                      {filteredTotals.ot > 0 ? `+${filteredTotals.ot.toFixed(1)}` : '—'}
                    </td>
                    <td colSpan={7} style={td}/>
                  </tr>
                </tfoot>
              )}
            </table>
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
                        <td style={{ textAlign:'center' }}><Pill status={r.attendance_status}/></td>
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ts-scroll::-webkit-scrollbar { height: 10px; width: 10px; }
        .ts-scroll::-webkit-scrollbar-track { background: #F1F5F9; border-radius: 8px; }
        .ts-scroll::-webkit-scrollbar-thumb {
          background: #94A3B8; border-radius: 8px;
          border: 2px solid #F1F5F9;
        }
        .ts-scroll::-webkit-scrollbar-thumb:hover { background: #475569; }
        .ts-scroll::-webkit-scrollbar-corner { background: #F1F5F9; }
        .ts-scroll { scrollbar-width: auto; scrollbar-color: #94A3B8 #F1F5F9; }
      `}</style>

      {showConfigModal && (
        <TimesheetConfigModal onClose={() => setShowConfigModal(false)} projects={projects} date={date} />
      )}
    </div>
  );
}

// ── Manage per-project automated-email recipients ─────────────────────────────
function TimesheetConfigModal({ onClose, projects, date }) {
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [sendingNowId, setSendingNowId] = useState(null);
  const [newProjectId, setNewProjectId] = useState('');
  const [newCategory, setNewCategory] = useState('staff');
  const [newRecipients, setNewRecipients] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['timesheet-report-configs'],
    queryFn: () => hrAttendanceAPI.timesheetReportConfigs.list().then(r => r.data),
  });
  const configs = data?.data || [];

  const projectLabel = (projectId) => {
    if (!projectId) return 'All Projects (combined)';
    if (projectId === 'HEAD_OFFICE') return 'Head Office';
    return projects.find(p => p.id === projectId)?.name || projectId;
  };
  const categoryLabel = (c) => c === 'labour' ? 'SC / Labour' : c === 'all' ? 'All Employees' : 'BCIM Staff';

  const handleAdd = async () => {
    if (!newRecipients.trim()) { toast.error('Enter at least one recipient email'); return; }
    setSaving(true);
    try {
      await hrAttendanceAPI.timesheetReportConfigs.create({
        project_id: newProjectId || null,
        project_name: projectLabel(newProjectId || null),
        category: newCategory,
        recipients: newRecipients.trim(),
      });
      setNewProjectId(''); setNewCategory('staff'); setNewRecipients('');
      refetch();
      toast.success('Project added to daily timesheet email list');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to add project');
    } finally { setSaving(false); }
  };

  const handleToggle = async (cfg) => {
    try {
      await hrAttendanceAPI.timesheetReportConfigs.update(cfg.id, { enabled: !cfg.enabled });
      refetch();
    } catch (e) { toast.error('Failed to update'); }
  };

  const handleDelete = async (cfg) => {
    if (!window.confirm(`Remove "${cfg.project_name}" from the daily email list?`)) return;
    try {
      await hrAttendanceAPI.timesheetReportConfigs.delete(cfg.id);
      refetch();
      toast.success('Removed');
    } catch (e) { toast.error('Failed to remove'); }
  };

  const handleTestSend = async (cfg) => {
    setTestingId(cfg.id);
    try {
      const res = await hrAttendanceAPI.timesheetReportTestEmail(date, cfg.project_id, cfg.project_name, cfg.category).then(r => r.data);
      if (!res.ok) toast.error(res.reason || 'Could not send test email');
      else toast.success(`Test email sent to ${res.recipients?.join(', ') || 'your inbox'}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to send test email');
    } finally { setTestingId(null); }
  };

  const handleSendNow = async (cfg) => {
    if (!window.confirm(`Send today's report to the REAL recipients now?\n\n${cfg.recipients}\n\nThis goes out immediately, not as a test.`)) return;
    setSendingNowId(cfg.id);
    try {
      const res = await hrAttendanceAPI.timesheetReportConfigs.sendNow(cfg.id, date).then(r => r.data);
      if (!res.ok) toast.error(res.reason || 'Could not send email');
      else toast.success(`Sent to ${res.recipients?.join(', ') || 'recipients'}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to send email');
    } finally { setSendingNowId(null); }
  };

  const inputCls = { border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 11px', fontSize: 12.5, fontWeight: 600, color: '#1E293B', outline: 'none', width: '100%' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(15,23,42,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF2F7' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Daily Timesheet Email — Recipients</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>Each project/category below gets its own automated email daily, sent only to its own list.</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <p style={{ fontSize: 13, color: '#94A3B8' }}>Loading…</p>
          ) : configs.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>No projects configured yet — add one below.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {configs.map(cfg => (
                <div key={cfg.id} style={{ border: '1px solid #EEF2F7', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, opacity: cfg.enabled ? 1 : 0.55 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                      {cfg.project_name}
                      <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: '#6366F1', background: '#EEF2FF', borderRadius: 999, padding: '1px 8px' }}>
                        {categoryLabel(cfg.category)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.recipients}</div>
                  </div>
                  <button onClick={() => handleTestSend(cfg)} disabled={testingId === cfg.id}
                    title="Send a test copy to your own email"
                    style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 700, color: '#334155', cursor: testingId === cfg.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Send size={12} /> {testingId === cfg.id ? '…' : 'Test'}
                  </button>
                  <button onClick={() => handleSendNow(cfg)} disabled={sendingNowId === cfg.id}
                    title="Send today's report to the real recipients right now"
                    style={{ border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 700, color: '#1D4ED8', cursor: sendingNowId === cfg.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Mail size={12} /> {sendingNowId === cfg.id ? '…' : 'Send Now'}
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={cfg.enabled} onChange={() => handleToggle(cfg)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                  </label>
                  <button onClick={() => handleDelete(cfg)} style={{ border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 22px', borderTop: '1px solid #EEF2F7', background: '#F8FAFC', borderRadius: '0 0 16px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Add Project</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={newProjectId} onChange={e => setNewProjectId(e.target.value)} style={{ ...inputCls, width: 170, cursor: 'pointer' }}>
              <option value="">All Projects (combined)</option>
              <option value="HEAD_OFFICE">Head Office</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ ...inputCls, width: 140, cursor: 'pointer' }}>
              <option value="staff">BCIM Staff</option>
              <option value="labour">SC / Labour</option>
              <option value="all">All Employees</option>
            </select>
            <input value={newRecipients} onChange={e => setNewRecipients(e.target.value)}
              placeholder="client@example.com, pm@example.com" style={{ ...inputCls, flex: 1, minWidth: 200 }} />
            <button onClick={handleAdd} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1A56DB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const td = {
  padding:'8px 10px',
  borderBottom:'0.5px solid #F3F4F6',
  color:'#111827',
  fontSize:12,
  verticalAlign:'middle',
};
