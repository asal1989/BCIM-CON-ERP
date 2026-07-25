import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Printer, Download, RefreshCw, ChevronRight, LayoutGrid, Building2 } from 'lucide-react';
import { ReportPrintHeader, ReportPrintSignature } from '../../../components/reports/ReportPrintKit';

const SUMMARY_COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#4f46e5'];

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
  .print-only { display:block !important; }
}
@media screen {
  .print-only { display:none !important; }
}
`;

export default function ManpowerReportPage() {
  const [date, setDate] = useState(today());
  const [projectFilter, setProjectFilter] = useState('');
  const [tab, setTab] = useState('detail'); // 'detail' | 'summary'

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

  // Company-wise present summary — grouped + sorted from the same detail rows
  const companySummary = useMemo(() => {
    const map = {};
    for (const r of rows) {
      if (!map[r.company]) map[r.company] = { company: r.company, total: 0, designations: 0 };
      map[r.company].total += r.total;
      map[r.company].designations += 1;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [rows]);

  const handleExport = () => {
    if (tab === 'summary') {
      const header = ['Company', 'Designations', 'Total Present', '% of Grand Total'];
      const csvRows = companySummary.map(c => [
        c.company, c.designations, c.total, grandTotal ? `${((c.total/grandTotal)*100).toFixed(1)}%` : '0%',
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
      const blob = new Blob([[header.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `manpower-company-summary-${date}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
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

      {/* Tabs */}
      <div className="no-print" style={{ padding: '16px 24px 0', display: 'flex', gap: 8 }}>
        <button onClick={() => setTab('detail')} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
          border: tab === 'detail' ? '1.5px solid #1a56db' : '1px solid #e2e8f0',
          background: tab === 'detail' ? '#eff6ff' : '#fff',
          color: tab === 'detail' ? '#1a56db' : '#64748b',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <LayoutGrid size={14} /> Detailed (Site × Shift)
        </button>
        <button onClick={() => setTab('summary')} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
          border: tab === 'summary' ? '1.5px solid #1a56db' : '1px solid #e2e8f0',
          background: tab === 'summary' ? '#eff6ff' : '#fff',
          color: tab === 'summary' ? '#1a56db' : '#64748b',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <Building2 size={14} /> Company-wise Present Summary
        </button>
      </div>

      <div id="mp-print-root" style={{ padding: 24 }}>
        <ReportPrintHeader reportTitle="Overall Daily Manpower Report" subtitle={fmtDate(date)} />
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 56, color: '#9ca3af' }}>Loading manpower data…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 56, color: '#9ca3af', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            No "present" attendance records found for {fmtDate(date)}.<br />
            <span style={{ fontSize: 12 }}>This report is built from Site/Shift data on attendance records — make sure the day's muster has been recorded.</span>
          </div>
        ) : tab === 'summary' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 480px) 1fr', gap: 20, alignItems: 'start' }}>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <table className="mp-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>Company</th>
                    <th style={th}>Designations</th>
                    <th style={th}>Total Present</th>
                    <th style={th}>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {companySummary.map((c, i) => (
                    <tr key={c.company} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>
                        <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: SUMMARY_COLORS[i % SUMMARY_COLORS.length], marginRight: 8 }} />
                        {c.company}
                      </td>
                      <td style={{ ...td, color: '#64748b' }}>{c.designations}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#1a56db' }}>{c.total}</td>
                      <td style={{ ...td, color: '#64748b' }}>{grandTotal ? `${((c.total / grandTotal) * 100).toFixed(1)}%` : '0%'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#eef2f7' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>Grand Total</td>
                    <td style={{ ...td, fontWeight: 800 }}>{companySummary.reduce((s, c) => s + c.designations, 0)}</td>
                    <td style={{ ...td, fontWeight: 900, color: '#1a56db' }}>{grandTotal}</td>
                    <td style={{ ...td, fontWeight: 800 }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Horizontal bar visualization */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 20 }}>
              <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Headcount by Company</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {companySummary.map((c, i) => {
                  const pct = grandTotal ? (c.total / grandTotal) * 100 : 0;
                  const color = SUMMARY_COLORS[i % SUMMARY_COLORS.length];
                  return (
                    <div key={c.company}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{c.company}</span>
                        <span style={{ fontWeight: 800, color: '#1e293b' }}>{c.total}</span>
                      </div>
                      <div style={{ height: 10, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
        {!isLoading && rows.length > 0 && <ReportPrintSignature />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
