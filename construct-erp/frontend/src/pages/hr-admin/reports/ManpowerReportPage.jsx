import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Printer, Download, RefreshCw, ChevronRight, LayoutGrid, Building2, Mail, HardHat, Users, Briefcase, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

const SUMMARY_COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#4f46e5'];

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 10mm 8mm; }
  html, body { margin:0!important; padding:0!important; background:#fff!important; overflow:visible!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  body * { visibility:hidden!important; }
  #mp-print-root, #mp-print-root * { visibility:visible!important; }
  #mp-print-root { position:absolute!important; top:0!important; left:0!important; width:100%!important; background:#fff!important; font-family:Arial,Helvetica,sans-serif; font-size:9pt; color:#000; }
  .mp-print-table { width:100%!important; border-collapse:collapse!important; font-size:8pt!important; }
  .mp-print-table th { background:#1B3A6B!important; color:#fff!important; padding:4px 6px!important; border:1px solid #1B3A6B!important; font-size:7.5pt!important; font-weight:700!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  .mp-print-table td { padding:3px 6px!important; border:1px solid #bbb!important; vertical-align:middle!important; font-size:8pt!important; }
  .mp-print-table tr:nth-child(even) td { background:#F3F6FB!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  .mp-print-table tfoot td { background:#E8EEF7!important; font-weight:800!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  .mp-print-company-cell { background:#f0f4fa!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  .mp-print-total-cell { background:#dbeafe!important; color:#1e40af!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
  .print-only { display:block!important; }
  .mp-sig-section { page-break-inside:avoid!important; margin-top:14px!important; }
}
@media screen {
  .print-only { display:none!important; }
}
`;

export default function ManpowerReportPage() {
  const [date, setDate] = useState(today());
  const [projectFilter, setProjectFilter] = useState('');
  const [tab, setTab] = useState('detail'); // 'detail' | 'summary'
  const [sendingTest, setSendingTest] = useState(false);

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

  const selectedProjectName = useMemo(() => {
    if (!projectFilter) return 'All Projects';
    if (projectFilter === 'HEAD_OFFICE') return 'Head Office';
    return projects.find(p => p.id === projectFilter)?.name || '';
  }, [projectFilter, projects]);

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

  const kpis = useMemo(() => ({
    companies: companySummary.length,
    designations: companySummary.reduce((s, c) => s + c.designations, 0),
    topCompany: companySummary[0]?.company || '—',
    topCompanyPct: grandTotal && companySummary[0] ? Math.round((companySummary[0].total / grandTotal) * 100) : 0,
  }), [companySummary, grandTotal]);

  const handleSendTestEmail = async () => {
    setSendingTest(true);
    try {
      const res = await hrAttendanceAPI.manpowerReportTestEmail(date).then(r => r.data);
      if (!res.ok) {
        toast.error(res.reason || 'Could not send test email');
      } else {
        toast.success(`Test email sent to ${res.recipients?.join(', ') || 'your inbox'}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

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

  const selectCls = {
    border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 13,
    background: '#fff', color: '#334155', outline: 'none', cursor: 'pointer',
  };
  const labelCls = { fontSize: 10.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <style>{PRINT_CSS}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="no-print" style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#1A56DB,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(26,86,219,0.25)' }}>
              <HardHat size={21} color="#fff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>
                <span>HR Admin</span><ChevronRight size={11} /><span>Reports</span>
              </div>
              <h1 style={{ fontWeight: 800, fontSize: 19, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>Overall Daily Manpower Report</h1>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748B' }}>{fmtDate(date)} · {selectedProjectName}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => refetch()} disabled={isFetching} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 9, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              <RefreshCw size={14} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} /> Refresh
            </button>
            <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC', borderRadius: 9, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              <Download size={14} /> Export CSV
            </button>
            <button onClick={handleSendTestEmail} disabled={sendingTest}
              title="Sends today's report to your own email — preview of the automated 10 AM client send"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA', borderRadius: 9, padding: '9px 16px', cursor: sendingTest ? 'wait' : 'pointer', opacity: sendingTest ? 0.6 : 1, fontSize: 13, fontWeight: 700 }}>
              <Mail size={14} /> {sendingTest ? 'Sending…' : 'Send Test Email'}
            </button>
            <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#1A56DB,#3B82F6)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700, boxShadow: '0 2px 8px rgba(26,86,219,0.3)' }}>
              <Printer size={14} /> Print / PDF
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label style={labelCls}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={selectCls} />
          </div>
          <div>
            <label style={labelCls}>Project</label>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ ...selectCls, minWidth: 190 }}>
              <option value="">All Projects</option>
              <option value="HEAD_OFFICE">Head Office</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* KPI strip */}
        {!isLoading && rows.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { icon: Users,      label: 'Total Present',  value: grandTotal,             accent: '#16A34A', bg: '#F0FDF4' },
              { icon: Building2,  label: 'Companies',      value: kpis.companies,         accent: '#7C3AED', bg: '#F5F3FF' },
              { icon: Briefcase,  label: 'Designations',   value: kpis.designations,      accent: '#0EA5E9', bg: '#F0F9FF' },
              { icon: TrendingUp, label: 'Top Contributor', value: kpis.topCompany, sub: `${kpis.topCompanyPct}% of total`, accent: '#EA580C', bg: '#FFF7ED' },
            ].map(k => (
              <div key={k.label} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 16px', flex: '1 1 180px', minWidth: 180 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <k.icon size={18} color={k.accent} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: k.sub ? 14 : 20, fontWeight: 800, color: '#0F172A', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{k.sub || k.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8 }}>
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
      </div>

      <div id="mp-print-root" style={{ padding: 24 }}>

        {/* ── PRINT-ONLY HEADER ─────────────────────────────────────────────── */}
        <div className="print-only" style={{ borderBottom: '3px solid #1B3A6B', paddingBottom: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="/bcim-logo.png" alt="BCIM Logo" style={{ height: 52, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 8, fontWeight: 600, color: '#555', letterSpacing: 3, textTransform: 'uppercase' }}>BCIM Engineering Private Limited</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#1B3A6B', letterSpacing: 0.5, margin: '3px 0' }}>OVERALL DAILY MANPOWER REPORT</div>
              <div style={{ fontSize: 9, color: '#444', fontWeight: 600 }}>Project: {selectedProjectName}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 8.5, color: '#444', minWidth: 150, flexShrink: 0 }}>
              <div style={{ marginBottom: 2 }}><strong>Report Date:</strong> {fmtDate(date)}</div>
              <div style={{ marginBottom: 6 }}><strong>Printed:</strong> {new Date().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              <div style={{ background: '#1B3A6B', color: '#fff', borderRadius: 4, padding: '4px 10px', display: 'inline-block', fontWeight: 800, fontSize: 11 }}>
                Total Present: {grandTotal}
              </div>
            </div>
          </div>
        </div>

        {/* ── PRINT-ONLY BODY: Summary + Detail ────────────────────────────── */}
        {!isLoading && rows.length > 0 && (
          <div className="print-only">
            {/* Company-wise summary */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1.5px solid #1B3A6B', paddingBottom: 3, marginBottom: 6 }}>
                Company-wise Present Summary
              </div>
              <table className="mp-print-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', width: '40%' }}>Company / Contractor</th>
                    <th style={{ textAlign: 'center' }}>No. of Designations</th>
                    <th style={{ textAlign: 'center' }}>Total Present</th>
                    <th style={{ textAlign: 'center' }}>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {companySummary.map((c, i) => (
                    <tr key={c.company}>
                      <td style={{ fontWeight: 700 }}>{c.company}</td>
                      <td style={{ textAlign: 'center', color: '#555' }}>{c.designations}</td>
                      <td style={{ textAlign: 'center', fontWeight: 800, color: '#1B3A6B' }}>{c.total}</td>
                      <td style={{ textAlign: 'center' }}>{grandTotal ? `${((c.total / grandTotal) * 100).toFixed(1)}%` : '0%'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ fontWeight: 800 }}>Grand Total</td>
                    <td style={{ textAlign: 'center', fontWeight: 800 }}>{companySummary.reduce((s, c) => s + c.designations, 0)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 900, color: '#1B3A6B' }}>{grandTotal}</td>
                    <td style={{ textAlign: 'center', fontWeight: 800 }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Site × Shift detail */}
            {columns.length > 0 && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1.5px solid #1B3A6B', paddingBottom: 3, marginBottom: 6 }}>
                  Detailed Manpower — Site × Shift
                </div>
                <table className="mp-print-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ textAlign: 'left', width: '14%' }}>Company</th>
                      <th rowSpan={2} style={{ textAlign: 'left', width: '18%' }}>Designation</th>
                      {columns.map(c => (
                        <th key={c.key} colSpan={c.shifts.length} style={{ textAlign: 'center' }}>{c.label}</th>
                      ))}
                      <th rowSpan={2} style={{ textAlign: 'center' }}>Total</th>
                    </tr>
                    <tr>
                      {columns.map(c => c.shifts.map(s => (
                        <th key={`${c.key}-${s}`} style={{ textAlign: 'center', background: '#2d5fa6' }}>{s}</th>
                      )))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {rowSpans[i] !== undefined && (
                          <td className="mp-print-company-cell" style={{ fontWeight: 700, verticalAlign: 'top' }} rowSpan={rowSpans[i]}>
                            {r.company}
                          </td>
                        )}
                        <td style={{ textAlign: 'left' }}>{r.designation}</td>
                        {columns.map(c => c.shifts.map(s => {
                          const v = r.cells[`${c.key}|${s}`];
                          return <td key={`${c.key}-${s}`} style={{ textAlign: 'center', color: v ? '#000' : '#ccc', fontWeight: v ? 700 : 400 }}>{v || '—'}</td>;
                        }))}
                        <td className="mp-print-total-cell" style={{ textAlign: 'center', fontWeight: 800 }}>{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'right', fontWeight: 800 }}>Grand Total</td>
                      {columns.map(c => c.shifts.map(s => (
                        <td key={`${c.key}-${s}-t`} style={{ textAlign: 'center', fontWeight: 800 }}>{colTotal(c.key, s) || '—'}</td>
                      )))}
                      <td style={{ textAlign: 'center', fontWeight: 900, color: '#1B3A6B' }}>{grandTotal}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Signature section */}
            <div className="mp-sig-section" style={{ marginTop: 20, borderTop: '1px solid #ccc', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                {['Prepared By\nHR Executive', 'Verified By\nHR Manager', 'Site Incharge\nProject Manager', 'Approved By\nManagement / Director'].map(s => {
                  const [role, name] = s.split('\n');
                  return (
                    <div key={role} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ borderBottom: '1.5px solid #333', marginBottom: 6, height: 36 }} />
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#1B3A6B' }}>{role}</div>
                      <div style={{ fontSize: 7.5, color: '#555', marginTop: 2 }}>{name}</div>
                      <div style={{ fontSize: 7.5, color: '#888', marginTop: 2 }}>Date: ___________</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 7, color: '#aaa' }}>
                System-generated report &nbsp;|&nbsp; BCIM Engineering Private Limited &nbsp;|&nbsp; {new Date().toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        )}

        {/* ── SCREEN CONTENT (hidden on print) ──────────────────────────────── */}
        {isLoading ? (
          <div className="no-print" style={{ textAlign: 'center', padding: 56, color: '#9ca3af' }}>Loading manpower data…</div>
        ) : rows.length === 0 ? (
          <div className="no-print" style={{ textAlign: 'center', padding: 56, color: '#9ca3af', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            No "present" attendance records found for {fmtDate(date)}.<br />
            <span style={{ fontSize: 12 }}>Make sure the day's muster has been recorded.</span>
          </div>
        ) : tab === 'summary' ? (
          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 480px) 1fr', gap: 20, alignItems: 'start' }}>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
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
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 20 }}>
              <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Headcount by Company</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {companySummary.map((c, i) => {
                  const pct = grandTotal ? (c.total / grandTotal) * 100 : 0;
                  return (
                    <div key={c.company}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{c.company}</span>
                        <span style={{ fontWeight: 800, color: '#1e293b' }}>{c.total}</span>
                      </div>
                      <div style={{ height: 10, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: SUMMARY_COLORS[i % SUMMARY_COLORS.length], borderRadius: 99, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="no-print" style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
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
