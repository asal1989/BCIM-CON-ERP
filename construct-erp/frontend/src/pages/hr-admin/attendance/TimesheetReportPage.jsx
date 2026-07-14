import React, { useState, useEffect, useCallback, useRef } from 'react';
import { hrAttendanceAPI } from '../../../api/client';
import { Printer, Download, RefreshCw, Filter } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_COLOR = {
  present:  { bg: '#D1FAE5', color: '#065F46' },
  absent:   { bg: '#FEE2E2', color: '#991B1B' },
  leave:    { bg: '#FEF3C7', color: '#92400E' },
  half_day: { bg: '#DBEAFE', color: '#1E40AF' },
  holiday:  { bg: '#EDE9FE', color: '#5B21B6' },
};

const STATUS_LABEL = {
  present:  'P',
  absent:   'A',
  leave:    'L',
  half_day: 'HD',
  holiday:  'H',
};

function Pill({ status }) {
  const s = (status || 'absent').toLowerCase();
  const { bg, color } = STATUS_COLOR[s] || STATUS_COLOR.absent;
  return (
    <span
      style={{
        background: bg, color, border: `1px solid ${color}33`,
        borderRadius: 4, padding: '1px 8px', fontWeight: 700,
        fontSize: 11, letterSpacing: 0.5,
      }}
    >
      {STATUS_LABEL[s] || s.toUpperCase()}
    </span>
  );
}

export default function TimesheetReportPage() {
  const [date, setDate]         = useState(today());
  const [category, setCategory] = useState('staff');
  const [rows, setRows]         = useState([]);
  const [summary, setSummary]   = useState({ total: 0, present: 0, absent: 0, leave: 0 });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const printRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hrAttendanceAPI.timesheetReport({ date, category });
      setRows(res.data.data || []);
      setSummary(res.data.summary || { total: 0, present: 0, absent: 0, leave: 0 });
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load timesheet');
    } finally {
      setLoading(false);
    }
  }, [date, category]);

  useEffect(() => { load(); }, [load]);

  const handlePrint = () => window.print();

  const handleExport = () => {
    const headers = [
      'S.No','EMP ID','Name','Designation','Department','Trade','Company',
      'Status','In Time','Out Time','Late Min','Location','Shift','Emp Status','Reason',
    ];
    const csvRows = rows.map((r, i) => [
      i + 1, r.emp_id || '—', r.name, r.designation, r.department, r.trade,
      r.company, r.attendance_status, r.in_time || '—', r.out_time || '—',
      r.late_minutes || 0, r.location, r.shift, r.status, r.reason || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `timesheet_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }} className="print-area">
      {/* ── Print styles ─────────────────────────────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .no-print { display: none !important; }
          .print-area { position: absolute; top: 0; left: 0; width: 100%; }
          @page { size: A3 landscape; margin: 10mm; }
        }
      `}</style>

      {/* ── Header ───────────────────────────────────────── */}
      <div
        className="no-print"
        style={{
          background: '#fff', borderBottom: '1px solid #E5E7EB',
          padding: '12px 24px', display: 'flex', alignItems: 'center',
          gap: 12, flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
            Daily Timesheet Report
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
            Attendance record for {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={14} color="#6B7280" />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 10px',
              fontSize: 13, color: '#111827',
            }}
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{
              border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 10px',
              fontSize: 13, color: '#111827',
            }}
          >
            <option value="staff">Staff Only</option>
            <option value="all">All Employees</option>
          </select>
          <button
            onClick={load}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#2563EB', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleExport}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC',
              borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}
          >
            <Download size={13} />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#F5F3FF', color: '#7C3AED', border: '1px solid #C4B5FD',
              borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}
          >
            <Printer size={13} />
            Print
          </button>
        </div>
      </div>

      {/* ── Summary KPIs ─────────────────────────────────── */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Total', val: summary.total,   bg: '#F0F9FF', border: '#BAE6FD', text: '#0369A1' },
          { label: 'Present', val: summary.present, bg: '#F0FDF4', border: '#86EFAC', text: '#15803D' },
          { label: 'Absent',  val: summary.absent,  bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
          { label: 'On Leave',val: summary.leave,   bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' },
        ].map(k => (
          <div
            key={k.label}
            style={{
              background: k.bg, border: `1px solid ${k.border}`,
              borderRadius: 8, padding: '10px 20px', minWidth: 110, textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: k.text }}>{k.val}</div>
            <div style={{ fontSize: 11, color: k.text, fontWeight: 600, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Print Header (shows only on print) ──────────── */}
      <div style={{ display: 'none' }} className="print-header">
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>BCIM — Daily Timesheet Report</div>
          <div style={{ fontSize: 12 }}>
            Date: {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            &nbsp;&nbsp;|&nbsp;&nbsp;Category: {category.toUpperCase()}
            &nbsp;&nbsp;|&nbsp;&nbsp;Total: {summary.total} &nbsp; Present: {summary.present} &nbsp; Absent: {summary.absent}
          </div>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      <div style={{ padding: '16px 24px 32px', overflow: 'auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 48, color: '#6B7280' }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
            padding: 16, color: '#B91C1C', marginBottom: 16,
          }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table
              ref={printRef}
              style={{
                borderCollapse: 'collapse', width: '100%', fontSize: 12,
                background: '#fff', borderRadius: 8, overflow: 'hidden',
                boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
              }}
            >
              <thead>
                <tr style={{ background: '#1E3A5F', color: '#fff' }}>
                  {[
                    'S.No','EMP ID','Name','Designation','Department','Trade',
                    'Company','P/A','In Time','Out Time','Late\nMin',
                    'Incharge','Shift','Location','Emp Status','Reason',
                  ].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 10px', whiteSpace: 'pre', textAlign: 'left',
                        fontWeight: 700, fontSize: 11, letterSpacing: 0.3,
                        borderRight: '1px solid #2d527a',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={16} style={{ textAlign: 'center', padding: 32, color: '#6B7280' }}>
                      No records found for {date}
                    </td>
                  </tr>
                ) : rows.map((r, i) => {
                  const isEven = i % 2 === 0;
                  return (
                    <tr
                      key={r.user_id || i}
                      style={{ background: isEven ? '#fff' : '#F8FAFC' }}
                    >
                      <td style={td}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 600, color: '#2563EB' }}>{r.emp_id || '—'}</td>
                      <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}</td>
                      <td style={td}>{r.designation}</td>
                      <td style={td}>{r.department}</td>
                      <td style={td}>{r.trade}</td>
                      <td style={td}>{r.company}</td>
                      <td style={{ ...td, textAlign: 'center' }}><Pill status={r.attendance_status} /></td>
                      <td style={td}>{r.in_time  || '—'}</td>
                      <td style={td}>{r.out_time || '—'}</td>
                      <td style={{ ...td, textAlign: 'center', color: r.late_minutes > 0 ? '#DC2626' : '#111' }}>
                        {r.late_minutes > 0 ? r.late_minutes : '—'}
                      </td>
                      <td style={td}>—</td>
                      <td style={td}>{r.shift}</td>
                      <td style={td}>{r.location}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: r.status === 'ACTIVE' ? '#15803D' : '#B91C1C',
                        }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ ...td, color: '#6B7280', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.reason || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#F0F9FF', fontWeight: 700 }}>
                    <td colSpan={7} style={{ ...td, textAlign: 'right', color: '#0369A1' }}>
                      Grand Total &nbsp;
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ color: '#15803D', fontWeight: 800 }}>{summary.present}P</span>
                      {' / '}
                      <span style={{ color: '#B91C1C', fontWeight: 800 }}>{summary.absent}A</span>
                    </td>
                    <td colSpan={8} style={td} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const td = {
  padding: '7px 10px',
  borderBottom: '1px solid #E5E7EB',
  borderRight: '1px solid #F3F4F6',
  color: '#111827',
  fontSize: 12,
  verticalAlign: 'middle',
};
