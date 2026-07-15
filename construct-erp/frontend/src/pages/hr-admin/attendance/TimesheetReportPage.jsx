import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import {
  Printer, Download, RefreshCw, Search, CalendarDays,
  Users, UserCheck, UserX, Clock3, Palmtree, AlarmClockOff,
} from 'lucide-react';

const today     = () => new Date().toISOString().slice(0, 10);
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

const STATUS_META = {
  present:  { bg: '#DCFCE7', color: '#15803D', dot: '#22C55E', label: 'Present'  },
  absent:   { bg: '#FEE2E2', color: '#B91C1C', dot: '#EF4444', label: 'Absent'   },
  leave:    { bg: '#FEF3C7', color: '#B45309', dot: '#F59E0B', label: 'Leave'    },
  half_day: { bg: '#DBEAFE', color: '#1D4ED8', dot: '#3B82F6', label: 'Half Day' },
  holiday:  { bg: '#EDE9FE', color: '#6D28D9', dot: '#8B5CF6', label: 'Holiday'  },
  week_off: { bg: '#F1F5F9', color: '#475569', dot: '#94A3B8', label: 'Week Off' },
};

function Pill({ status }) {
  const s = (status || 'absent').toLowerCase();
  const m = STATUS_META[s] || STATUS_META.absent;
  return (
    <span style={{
      background: m.bg, color: m.color, borderRadius: 999,
      padding: '2px 10px 2px 7px', fontWeight: 700, fontSize: 10.5,
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function Avatar({ name }) {
  const initials = (name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  let hash = 0;
  for (const ch of (name || '')) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hash}, 55%, 92%)`, color: `hsl(${hash}, 55%, 32%)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3,
    }}>{initials}</span>
  );
}

const COL_KEYS = {
  'EMP ID':      'emp_id',
  'Employee':    'name',
  'Designation': 'designation',
  'Department':  'department',
  'Company':     'company',
  'Status':      'attendance_status',
  'In Time':     'in_time',
  'Out Time':    'out_time',
  'Late':        'late_minutes',
  'Hrs':         'hours_worked',
  'OT':          'overtime_hours',
  'Location':    'location',
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
    font-size:7.5pt !important; table-layout:auto !important;
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
    white-space:nowrap !important; position:static !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  .print-table td {
    padding:3px 4px !important; border:1px solid #bbb !important;
    vertical-align:middle !important; font-size:7.5pt !important; white-space:nowrap !important;
  }
  .print-table tr:nth-child(even) td {
    background:#F0F4FF !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  .print-table .ts-avatar { display:none !important; }
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
  const [search, setSearch]         = useState('');
  const [rows, setRows]             = useState([]);
  const [summary, setSummary]       = useState({ total: 0, present: 0, half: 0, absent: 0, leave: 0, week_off: 0, holiday: 0, late: 0 });
  const [meta, setMeta]             = useState({ companyName: 'BCIM', projectName: '', projectCode: '', holidayName: null });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [sortKey, setSortKey]       = useState(null);
  const [sortDir, setSortDir]       = useState('asc');

  const handleSort = (col) => {
    const key = COL_KEYS[col];
    if (!key) return;
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
      setSortDir('asc'); return key;
    });
  };

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
      setSummary({ total: 0, present: 0, half: 0, absent: 0, leave: 0, week_off: 0, holiday: 0, late: 0, ...(d.summary || {}) });
      setMeta({
        companyName: d.companyName || 'BCIM',
        projectName: d.projectName || '',
        projectCode: d.projectCode || '',
        holidayName: d.holidayName || null,
      });
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load timesheet');
    } finally { setLoading(false); }
  }, [date, category, projectFilter]);

  useEffect(() => { load(); }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.emp_id || '').toLowerCase().includes(q) ||
      String(r.department || '').toLowerCase().includes(q) ||
      String(r.designation || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      let av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
      if (['late_minutes', 'hours_worked', 'overtime_hours'].includes(sortKey)) {
        av = Number(av) || 0; bv = Number(bv) || 0;
      } else {
        av = String(av).toLowerCase(); bv = String(bv).toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredRows, sortKey, sortDir]);

  const presentPct = summary.total > 0
    ? Math.round(((summary.present + (summary.half || 0) * 0.5) / summary.total) * 100)
    : 0;

  const handleExport = () => {
    const headers = ['S.No','EMP ID','Name','Designation','Department','Company','Status','In Time','Out Time','Late Min','Hrs Worked','Overtime Hrs','Shift','Location','Emp Status','Reason'];
    const csvRows = sortedRows.map((r, i) => [
      i + 1, r.emp_id || '', r.name, r.designation, r.department,
      r.company, r.attendance_status, r.in_time || '', r.out_time || '',
      r.late_minutes || 0, r.hours_worked || '', r.overtime_hours || '',
      r.shift, r.location, r.status, r.reason || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `timesheet_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const chipBtn = (active) => ({
    border: active ? '1px solid #4F46E5' : '1px solid #E2E8F0',
    background: active ? '#EEF2FF' : '#fff',
    color: active ? '#4338CA' : '#475569',
    borderRadius: 999, padding: '5px 14px', fontSize: 12.5,
    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  });

  const KPIS = [
    { label: 'Total',    val: summary.total,        Icon: Users,         accent: '#6366F1', bg: '#EEF2FF' },
    { label: 'Present',  val: summary.present,      Icon: UserCheck,     accent: '#16A34A', bg: '#F0FDF4' },
    { label: 'Half Day', val: summary.half || 0,    Icon: Clock3,        accent: '#2563EB', bg: '#EFF6FF' },
    { label: 'Absent',   val: summary.absent,       Icon: UserX,         accent: '#DC2626', bg: '#FEF2F2' },
    { label: 'On Leave', val: summary.leave,        Icon: Palmtree,      accent: '#D97706', bg: '#FFFBEB' },
    { label: 'Late',     val: summary.late || 0,    Icon: AlarmClockOff, accent: '#EA580C', bg: '#FFF7ED' },
  ];

  return (
    <div style={{ background: '#F1F5F9', minHeight: '100vh' }}>
      <style>{PRINT_CSS}</style>

      {/* ── HERO HEADER ─────────────────────────────────────── */}
      <div className="no-print" style={{
        background: 'linear-gradient(120deg, #1E1B4B 0%, #312E81 55%, #4338CA 100%)',
        padding: '22px 28px 68px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CalendarDays size={19} color="#C7D2FE" />
              </span>
              <div>
                <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>
                  Daily Timesheet Report
                </h1>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#A5B4FC' }}>
                  {fmtDate(date)}
                  {meta.holidayName && <span style={{ marginLeft: 8, background: 'rgba(255,255,255,0.14)', borderRadius: 999, padding: '1px 10px', fontSize: 11, color: '#DDD6FE', fontWeight: 600 }}>🎉 {meta.holidayName}</span>}
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={load} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.12)', color: '#E0E7FF',
              border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}>
              <RefreshCw size={13} style={{ animation: loading ? 'ts-spin 1s linear infinite' : undefined }} /> Refresh
            </button>
            <button onClick={handleExport} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.12)', color: '#E0E7FF',
              border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}>
              <Download size={13} /> CSV
            </button>
            <button onClick={() => window.print()} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#fff', color: '#312E81',
              border: 'none', borderRadius: 8, padding: '7px 16px',
              fontSize: 13, cursor: 'pointer', fontWeight: 700,
            }}>
              <Printer size={13} /> Print / PDF
            </button>
          </div>
        </div>

        {/* Attendance progress */}
        <div style={{ marginTop: 18, maxWidth: 420 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, color: '#C7D2FE', fontWeight: 600 }}>Attendance rate</span>
            <span style={{ fontSize: 11.5, color: '#fff', fontWeight: 800 }}>{presentPct}%</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${presentPct}%`, borderRadius: 999,
              background: presentPct >= 85 ? 'linear-gradient(90deg,#34D399,#10B981)'
                        : presentPct >= 60 ? 'linear-gradient(90deg,#FBBF24,#F59E0B)'
                        : 'linear-gradient(90deg,#F87171,#EF4444)',
              transition: 'width .5s ease',
            }} />
          </div>
        </div>
      </div>

      {/* ── KPI CARDS (overlapping hero) ───────────────────── */}
      <div className="no-print" style={{
        padding: '0 28px', marginTop: -44,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12,
      }}>
        {KPIS.map(({ label, val, Icon, accent, bg }) => (
          <div key={label} style={{
            background: '#fff', borderRadius: 14, padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(15,23,42,0.08), 0 8px 24px -12px rgba(15,23,42,0.12)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{
              width: 38, height: 38, borderRadius: 10, background: bg, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={18} color={accent} />
            </span>
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>{val}</div>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── FILTER BAR ──────────────────────────────────────── */}
      <div className="no-print" style={{
        margin: '16px 28px 0', background: '#fff', borderRadius: 14,
        boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <button onClick={() => setDate(today())}     style={chipBtn(date === today())}>Today</button>
        <button onClick={() => setDate(yesterday())} style={chipBtn(date === yesterday())}>Yesterday</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#334155' }} />

        <span style={{ width: 1, height: 24, background: '#E2E8F0' }} />

        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#334155', background: '#fff' }}>
          <option value="staff">Staff Only</option>
          <option value="labour">Labour / SC Workers</option>
          <option value="all">All (Staff + Labour)</option>
        </select>
        <select value={projectFilter} onChange={e => setProject(e.target.value)}
          style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', fontSize: 13, minWidth: 170, color: '#334155', background: '#fff' }}>
          <option value="">All Projects</option>
          <option value="HEAD_OFFICE">🏢 Head Office</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.project_code ? `[${p.project_code}] ` : ''}{p.name}
            </option>
          ))}
        </select>

        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7,
          border: '1px solid #E2E8F0', borderRadius: 999, padding: '6px 14px', minWidth: 220, background: '#F8FAFC',
        }}>
          <Search size={14} color="#94A3B8" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, dept..."
            style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent', color: '#334155' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 13, padding: 0 }}>✕</button>
          )}
        </div>
      </div>

      {/* ── PRINTABLE DOCUMENT ─────────────────────────────── */}
      <div id="ts-print-root" style={{ padding: '16px 28px 40px' }}>

        {/* PRINT HEADER */}
        <div className="print-only" style={{ borderBottom: '3px solid #1B3A6B', paddingBottom: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="/bcim-logo.png" alt="BCIM Logo"
              style={{ height: 60, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>
                {meta.companyName}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1B3A6B', letterSpacing: 0.5, margin: '2px 0' }}>
                DAILY ATTENDANCE / TIMESHEET REPORT
              </div>
              <div style={{ fontSize: 9, color: '#444' }}>
                {meta.projectName
                  ? <>Project: <strong>{meta.projectName}</strong>{meta.projectCode ? ` (${meta.projectCode})` : ''}&emsp;|&emsp;</>
                  : null}
                Date: <strong>{fmtDate(date)}</strong>&emsp;|&emsp;
                Category: <strong>{category === 'staff' ? 'STAFF ONLY' : category === 'labour' ? 'LABOUR / SC WORKERS' : 'ALL (STAFF + LABOUR)'}</strong>
              </div>
            </div>
            <table style={{ border: '1px solid #1B3A6B', borderCollapse: 'collapse', fontSize: 8, flexShrink: 0 }}>
              <tbody>
                {[
                  ['Total Strength', summary.total],
                  ['Present (P)',    summary.present],
                  ['Half Day (HD)',  summary.half || 0],
                  ['Absent (A)',     summary.absent],
                  ['On Leave (L)',   summary.leave],
                ].map(([l, v]) => (
                  <tr key={l}>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #ccc', borderRight: '1px solid #ccc', fontWeight: 600 }}>{l}</td>
                    <td style={{ padding: '3px 10px', borderBottom: '1px solid #ccc', textAlign: 'center', fontWeight: 700, color: '#1B3A6B' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* LOADING / ERROR */}
        {loading && (
          <div className="no-print" style={{ textAlign: 'center', padding: 60, color: '#64748B', background: '#fff', borderRadius: 14 }}>
            <RefreshCw size={22} style={{ animation: 'ts-spin 1s linear infinite', marginBottom: 10 }} />
            <div style={{ fontSize: 13 }}>Loading timesheet…</div>
          </div>
        )}
        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12,
            padding: 16, color: '#B91C1C', marginBottom: 16, fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* TABLE */}
        {!loading && !error && (
          <div className="ts-table-wrap" style={{
            overflowX: 'auto', background: '#fff', borderRadius: 14,
            boxShadow: '0 1px 3px rgba(15,23,42,0.07)', maxHeight: '68vh', overflowY: 'auto',
          }}>
            <table className="print-table" style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  {['S.No','EMP ID','Employee','Designation','Department','Company',
                    'Status','In Time','Out Time','Late','Hrs','OT','Location','Emp Status','Reason',
                  ].map(h => {
                    const key = COL_KEYS[h];
                    const active = sortKey === key;
                    return (
                      <th key={h} onClick={() => handleSort(h)} style={{
                        position: 'sticky', top: 0, zIndex: 2,
                        background: active ? '#252159' : '#1E1B4B', color: '#E0E7FF',
                        padding: '10px 10px', whiteSpace: 'nowrap', textAlign: 'left',
                        fontWeight: 700, fontSize: 11, letterSpacing: 0.4,
                        cursor: key ? 'pointer' : 'default', userSelect: 'none',
                        borderBottom: '2px solid #4338CA',
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {h}
                          {key && (
                            <span style={{ opacity: active ? 1 : 0.35, fontSize: 9, lineHeight: 1 }}>
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
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={15} style={{ textAlign: 'center', padding: 48, color: '#64748B', fontSize: 13 }}>
                      {search ? <>No employees match “{search}”</> : <>No records found for {date}</>}
                    </td>
                  </tr>
                ) : sortedRows.map((r, i) => (
                  <tr key={r.user_id || i}
                    style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#EEF2FF'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#F8FAFC'}>
                    <td style={{ ...td, color: '#94A3B8', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 700, color: '#4338CA', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{r.emp_id || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span className="ts-avatar"><Avatar name={r.name} /></span>
                        <span style={{ fontWeight: 650, color: '#0F172A' }}>{r.name}</span>
                      </span>
                    </td>
                    <td style={{ ...td, color: '#64748B' }}>{r.designation}</td>
                    <td style={{ ...td, color: '#64748B' }}>{r.department}</td>
                    <td style={{ ...td, color: '#64748B', fontSize: 11 }}>{r.company}</td>
                    <td style={{ ...td, textAlign: 'center' }}><Pill status={r.attendance_status} /></td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#334155' }}>{r.in_time || '—'}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#334155' }}>{r.out_time || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {r.late_minutes > 0
                        ? <span style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 999, padding: '1px 8px', fontSize: 10.5, fontWeight: 700 }}>{r.late_minutes}m</span>
                        : <span style={{ color: '#CBD5E1' }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                      {r.hours_worked > 0 ? r.hours_worked : <span style={{ color: '#CBD5E1' }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {r.overtime_hours > 0
                        ? <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 999, padding: '1px 8px', fontSize: 10.5, fontWeight: 700 }}>+{r.overtime_hours}h</span>
                        : <span style={{ color: '#CBD5E1' }}>—</span>}
                    </td>
                    <td style={{ ...td, color: '#64748B', fontSize: 11 }}>{r.location}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: r.status === 'ACTIVE' ? '#15803D' : '#B91C1C' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ ...td, color: '#94A3B8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {r.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {sortedRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#EEF2FF', fontWeight: 700 }}>
                    <td colSpan={6} style={{ ...td, textAlign: 'right', color: '#4338CA', fontWeight: 800, borderTop: '2px solid #C7D2FE' }}>
                      Grand Total
                    </td>
                    <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap', borderTop: '2px solid #C7D2FE' }}>
                      <span style={{ color: '#15803D', fontWeight: 800 }}>{summary.present}P</span>
                      {' · '}
                      <span style={{ color: '#B91C1C', fontWeight: 800 }}>{summary.absent}A</span>
                      {(summary.half || 0) > 0 && <>{' · '}<span style={{ color: '#1D4ED8', fontWeight: 800 }}>{summary.half}HD</span></>}
                    </td>
                    <td colSpan={8} style={{ ...td, borderTop: '2px solid #C7D2FE' }} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Footer count */}
        {!loading && !error && sortedRows.length > 0 && (
          <div className="no-print" style={{ marginTop: 10, fontSize: 12, color: '#94A3B8', textAlign: 'right' }}>
            Showing {sortedRows.length} of {rows.length} employees
          </div>
        )}

        {/* SIGNATURE SECTION (print only) */}
        <div className="print-only sig-section" style={{ marginTop: 40, borderTop: '1px solid #ccc', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
            {[
              { role: 'Prepared By', name: 'HR Executive' },
              { role: 'Verified By', name: 'HR Manager / Admin' },
              { role: 'Site Incharge', name: 'Project Manager' },
              { role: 'Approved By', name: 'Management / Director' },
            ].map(sig => (
              <div key={sig.role} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ borderBottom: '1.5px solid #333', marginBottom: 6, height: 40 }} />
                <div style={{ fontSize: 9, fontWeight: 700, color: '#1B3A6B' }}>{sig.role}</div>
                <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>{sig.name}</div>
                <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>Date: ____________</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 8, color: '#888' }}>
            This is a system-generated report - {meta.companyName} | Printed on: {new Date().toLocaleString('en-IN')}
          </div>
        </div>

      </div>

      <style>{`@keyframes ts-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const td = {
  padding: '8px 10px',
  borderBottom: '1px solid #F1F5F9',
  color: '#111827',
  fontSize: 12,
  verticalAlign: 'middle',
};
