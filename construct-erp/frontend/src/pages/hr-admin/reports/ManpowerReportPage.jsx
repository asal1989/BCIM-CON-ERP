import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Printer, Download, RefreshCw, ChevronRight } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  html, body { margin:0 !important; padding:0 !important; background:#fff !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  nav, header, footer, aside, .no-print,
  .sidebar, .topbar, .app-header, .app-sidebar,
  [class*="sidebar"], [class*="Sidebar"], [class*="topbar"], [class*="Topbar"], [class*="navbar"], [class*="Navbar"] {
    display:none !important; width:0 !important; height:0 !important; overflow:hidden !important;
  }
  #mp-print-root { display:block !important; }
  .mp-table { width:100% !important; border-collapse:collapse !important; font-size:8pt !important; }
  .mp-table th, .mp-table td { border:1px solid #333 !important; padding:3px 5px !important; }
}
`;

export default function ManpowerReportPage() {
  const [date, setDate] = useState(today());
  const [projectFilter, setProjectFilter] = useState('');

  const { data: projectsData } = useQuery({
    queryKey: ['projects-active-mp'],
    queryFn: () => projectAPI.list({ is_active: true }).then(r => r.data),
  });
  const projects = projectsData?.data || [];

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['manpower-report', date, projectFilter],
    queryFn: () => hrAttendanceAPI.manpowerReport({ date, project_id: projectFilter || undefined }).then(r => r.data),
  });

  const columns = data?.columns || [];
  const rows = data?.rows || [];
  const grandTotal = data?.grandTotal || 0;

  // Precompute company rowspans for merged-cell rendering
  const rowSpans = useMemo(() => {
    const spans = {};
    let i = 0;
    while (i < rows.length) {
      let j = i;
      while (j < rows.length && rows[j].company === rows[i].company) j++;
      spans[i] = j - i;
      i = j;
    }
    return spans;
  }, [rows]);

  const colTotal = (colKey, shift) => {
    let sum = 0;
    for (const r of rows) sum += r.cells[`${colKey}|${shift}`] || 0;
    return sum;
  };
  const handleExport = () => {
    const header = ['Company', 'Designation', ...columns.flatMap(c => c.shifts.map(s => `${c.label} ${s}`)), 'Grand Total'];
    const csvRows = rows.map(r => [
      r.company, r.designation,
      ...columns.flatMap(c => c.shifts.map(s => r.cells[`${c.key}|${s}`] || '')),
      r.total,
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manpower-report-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const th = { padding: '6px 8px', border: '1px solid #cbd5e1', background: '#eef2f7', fontWeight: 700, fontSize: 11, color: '#1e293b', textAlign: 'center' };
  const td = { padding: '5px 8px', border: '1px solid #e2e8f0', fontSize: 12, textAlign: 'center' };

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>
      <style>{PRINT_CSS}</style>

      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, fontSize: 12, color: '#9ca3af' }}>
            <span>HR Admin</span><ChevronRight size={11} /><span>Reports</span><ChevronRight size={11} />
            <span style={{ color: '#1a56db', fontWeight: 600 }}>Manpower Report</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>Overall Daily Manpower Report</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>{fmtDate(date)} &nbsp;·&nbsp; Grand Total: <strong>{grandTotal}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, minWidth: 160 }}>
            <option value="">All Projects</option>
            <option value="HEAD_OFFICE">Head Office</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => refetch()} disabled={isFetching} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: 7, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
            <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: 7, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
            <Download size={13} /> Export CSV
          </button>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            <Printer size={13} /> Print / PDF
          </button>
        </div>
      </div>

      <div id="mp-print-root" style={{ padding: 24 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 56, color: '#9ca3af' }}>Loading manpower data…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 56, color: '#9ca3af', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            No "present" attendance records found for {fmtDate(date)}.<br />
            <span style={{ fontSize: 12 }}>This report is built from Site/Shift data on attendance records — make sure the day's muster has been recorded.</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <table className="mp-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 140 }} rowSpan={2}>Company</th>
                  <th style={{ ...th, minWidth: 160, textAlign: 'left' }} rowSpan={2}>Designation</th>
                  {columns.map(c => (
                    <th key={c.key} style={th} colSpan={c.shifts.length}>{c.label}</th>
                  ))}
                  <th style={{ ...th, minWidth: 90 }} rowSpan={2}>Grand Total</th>
                </tr>
                <tr>
                  {columns.map(c => c.shifts.map(s => (
                    <th key={`${c.key}-${s}`} style={{ ...th, minWidth: 60, color: '#64748b' }}>{s}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                    {rowSpans[i] !== undefined && (
                      <td style={{ ...td, fontWeight: 700, color: '#1e293b', verticalAlign: 'top', background: '#f8fafc' }} rowSpan={rowSpans[i]}>
                        {r.company}
                      </td>
                    )}
                    <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{r.designation}</td>
                    {columns.map(c => c.shifts.map(s => {
                      const v = r.cells[`${c.key}|${s}`];
                      return (
                        <td key={`${c.key}-${s}`} style={{ ...td, color: v ? '#0f172a' : '#d1d5db', fontWeight: v ? 700 : 400 }}>
                          {v || ''}
                        </td>
                      );
                    }))}
                    <td style={{ ...td, fontWeight: 800, color: '#1a56db', background: '#eff6ff' }}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#eef2f7' }}>
                  <td colSpan={2} style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>Grand Total</td>
                  {columns.map(c => c.shifts.map(s => (
                    <td key={`${c.key}-${s}-t`} style={{ ...td, fontWeight: 800 }}>{colTotal(c.key, s) || ''}</td>
                  )))}
                  <td style={{ ...td, fontWeight: 900, color: '#1a56db' }}>{grandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
