import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI, projectAPI } from '../../../api/client';
import { Printer, Download, RefreshCw, ChevronRight, LayoutGrid, Building2, Mail, HardHat, Users, Briefcase, TrendingUp, Calendar, MapPin, Sparkles, Settings, Plus, Trash2, X, Send } from 'lucide-react';
import toast from 'react-hot-toast';

const SUMMARY_COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#4f46e5'];
const initials = (s) => (s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

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
  const [showConfigModal, setShowConfigModal] = useState(false);

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

  const th = { padding: '10px 10px', borderBottom: '2px solid #E2E8F0', background: '#F8FAFC', fontWeight: 800, fontSize: 10.5, color: '#475569', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.03em', position: 'sticky', top: 0, zIndex: 1 };
  const td = { padding: '9px 10px', borderBottom: '1px solid #F1F5F9', fontSize: 12.5, textAlign: 'center' };

  const selectCls = {
    border: '1px solid #E2E8F0', borderRadius: 9, padding: '8px 12px 8px 34px', fontSize: 13,
    background: '#fff', color: '#1E293B', outline: 'none', cursor: 'pointer', fontWeight: 600,
    appearance: 'none', WebkitAppearance: 'none',
  };
  const labelCls = { fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' };

  const actionBtnBase = {
    display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '9px 15px',
    cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: '1px solid transparent',
    transition: 'transform 0.12s ease, box-shadow 0.12s ease', whiteSpace: 'nowrap',
  };

  return (
    <div className="mp-page-root" style={{ background: 'radial-gradient(1200px 400px at 20% -10%, #EFF4FF 0%, #F8FAFC 55%)', minHeight: '100vh' }}>
      <style>{PRINT_CSS}</style>
      <style>{`
        .mp-hover-lift:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,42,0.10); }
        .mp-btn:hover { transform: translateY(-1px); }
        .mp-kpi-card:hover { transform: translateY(-3px); box-shadow: 0 14px 28px rgba(15,23,42,0.09); }
        .mp-row:hover td { background: #F1F5FE !important; }
        .mp-select-wrap select:focus, .mp-select-wrap input:focus { outline: 2px solid #93C5FD; outline-offset: 1px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Hero header banner ────────────────────────────────────────── */}
      <div className="no-print" style={{ padding: '22px 24px 0' }}>
        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: 20,
          background: 'linear-gradient(120deg,#0B1739 0%,#132A63 45%,#1A56DB 100%)',
          padding: '24px 28px', marginBottom: 18, boxShadow: '0 18px 40px -12px rgba(11,23,57,0.45)',
        }}>
          {/* decorative glow orbs */}
          <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,0.35),transparent 70%)' }} />
          <div style={{ position: 'absolute', bottom: -80, left: '30%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle,rgba(99,102,241,0.18),transparent 70%)' }} />

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                <HardHat size={24} color="#fff" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginBottom: 3, fontWeight: 600 }}>
                  <span>HR Admin</span><ChevronRight size={11} /><span>Reports</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 99, padding: '2px 8px', color: '#BFDBFE', fontSize: 10, fontWeight: 800, letterSpacing: '0.03em' }}>
                    <Sparkles size={10} /> LIVE
                  </span>
                </div>
                <h1 style={{ fontWeight: 800, fontSize: 22, color: '#fff', margin: 0, letterSpacing: '-0.015em' }}>Overall Daily Manpower Report</h1>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.68)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Calendar size={12} /> {fmtDate(date)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={12} /> {selectedProjectName}</span>
                </p>
              </div>
            </div>

            {!isLoading && rows.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '10px 20px', backdropFilter: 'blur(4px)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={17} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{grandTotal}</div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Present</div>
                </div>
              </div>
            )}
          </div>

          {/* action buttons row */}
          <div style={{ position: 'relative', display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 20 }}>
            <button className="mp-btn" onClick={() => refetch()} disabled={isFetching} style={{ ...actionBtnBase, background: 'rgba(255,255,255,0.10)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}>
              <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} /> Refresh
            </button>
            <button className="mp-btn" onClick={handleExport} style={{ ...actionBtnBase, background: 'rgba(255,255,255,0.10)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}>
              <Download size={13} /> Export CSV
            </button>
            <button className="mp-btn" onClick={handleSendTestEmail} disabled={sendingTest}
              title="Sends today's report to your own email — preview of the automated 10 AM client send"
              style={{ ...actionBtnBase, background: 'rgba(255,255,255,0.10)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)', cursor: sendingTest ? 'wait' : 'pointer', opacity: sendingTest ? 0.6 : 1 }}>
              <Mail size={13} /> {sendingTest ? 'Sending…' : 'Send Test Email'}
            </button>
            <button className="mp-btn" onClick={() => setShowConfigModal(true)}
              title="Manage which projects get an automated daily email, and who receives each one"
              style={{ ...actionBtnBase, background: 'rgba(255,255,255,0.10)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}>
              <Settings size={13} /> Email Recipients
            </button>
            <button className="mp-btn" onClick={() => window.print()} style={{ ...actionBtnBase, background: '#fff', color: '#132A63', boxShadow: '0 6px 16px rgba(0,0,0,0.18)', marginLeft: 'auto' }}>
              <Printer size={13} /> Print / PDF
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mp-select-wrap" style={{ background: '#fff', border: '1px solid #E7ECF3', borderRadius: 14, padding: '14px 18px', marginBottom: 18, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end', boxShadow: '0 2px 8px rgba(15,23,42,0.03)' }}>
          <div style={{ position: 'relative' }}>
            <label style={labelCls}>Date</label>
            <Calendar size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, bottom: 10.5, pointerEvents: 'none' }} />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={selectCls} />
          </div>
          <div style={{ position: 'relative' }}>
            <label style={labelCls}>Project</label>
            <MapPin size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, bottom: 10.5, pointerEvents: 'none' }} />
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ ...selectCls, minWidth: 210 }}>
              <option value="">All Projects</option>
              <option value="HEAD_OFFICE">Head Office</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94A3B8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {isFetching && <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Syncing latest data…</>}
          </div>
        </div>

        {/* KPI strip */}
        {!isLoading && rows.length > 0 && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
            {[
              { icon: Users,      label: 'Total Present',   value: grandTotal,        accent: '#16A34A', grad: 'linear-gradient(135deg,#22C55E,#16A34A)' },
              { icon: Building2,  label: 'Companies',       value: kpis.companies,    accent: '#7C3AED', grad: 'linear-gradient(135deg,#A78BFA,#7C3AED)' },
              { icon: Briefcase,  label: 'Designations',    value: kpis.designations, accent: '#0EA5E9', grad: 'linear-gradient(135deg,#38BDF8,#0EA5E9)' },
              { icon: TrendingUp, label: 'Top Contributor',  value: kpis.topCompany, sub: `${kpis.topCompanyPct}% of total headcount`, accent: '#EA580C', grad: 'linear-gradient(135deg,#FB923C,#EA580C)' },
            ].map(k => (
              <div key={k.label} className="mp-kpi-card mp-hover-lift" style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 14, background: '#fff',
                border: '1px solid #EEF1F6', borderRadius: 16, padding: '16px 18px', flex: '1 1 210px', minWidth: 210,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.grad }} />
                <div style={{ width: 44, height: 44, borderRadius: 12, background: k.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 6px 14px -4px ${k.accent}66` }}>
                  <k.icon size={20} color="#fff" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: k.sub ? 15 : 22, fontWeight: 800, color: '#0F172A', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.value}</div>
                  <div style={{ fontSize: 11.5, color: '#64748B', fontWeight: 600, marginTop: 1 }}>{k.sub || k.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'inline-flex', gap: 4, background: '#EEF2F9', padding: 4, borderRadius: 12, marginBottom: 4 }}>
          <button onClick={() => setTab('detail')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9,
            border: 'none', background: tab === 'detail' ? '#fff' : 'transparent',
            color: tab === 'detail' ? '#1A56DB' : '#64748b',
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            boxShadow: tab === 'detail' ? '0 2px 8px rgba(15,23,42,0.08)' : 'none',
            transition: 'all 0.15s ease',
          }}>
            <LayoutGrid size={14} /> Detailed (Site × Shift)
          </button>
          <button onClick={() => setTab('summary')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9,
            border: 'none', background: tab === 'summary' ? '#fff' : 'transparent',
            color: tab === 'summary' ? '#1A56DB' : '#64748b',
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            boxShadow: tab === 'summary' ? '0 2px 8px rgba(15,23,42,0.08)' : 'none',
            transition: 'all 0.15s ease',
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
          <div className="no-print" style={{ textAlign: 'center', padding: 64, color: '#94A3B8', background: '#fff', borderRadius: 16, border: '1px solid #EEF1F6' }}>
            <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Loading manpower data…</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="no-print" style={{ textAlign: 'center', padding: 64, color: '#94A3B8', background: '#fff', borderRadius: 16, border: '1px solid #EEF1F6' }}>
            <Users size={28} color="#CBD5E1" style={{ marginBottom: 10 }} />
            <div style={{ fontWeight: 700, color: '#475569', fontSize: 13.5 }}>No "present" attendance records found for {fmtDate(date)}</div>
            <span style={{ fontSize: 12 }}>Make sure the day's muster has been recorded.</span>
          </div>
        ) : tab === 'summary' ? (
          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 480px) 1fr', gap: 18, alignItems: 'start' }}>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #EEF1F6', overflow: 'hidden', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
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
                    <tr key={c.company} className="mp-row">
                      <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: SUMMARY_COLORS[i % SUMMARY_COLORS.length] + '1a', color: SUMMARY_COLORS[i % SUMMARY_COLORS.length],
                            fontSize: 9, fontWeight: 800,
                          }}>{initials(c.company)}</span>
                          {c.company}
                        </span>
                      </td>
                      <td style={{ ...td, color: '#64748b' }}>{c.designations}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#1a56db' }}>{c.total}</td>
                      <td style={{ ...td, color: '#64748b' }}>{grandTotal ? `${((c.total / grandTotal) * 100).toFixed(1)}%` : '0%'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F8FAFC' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 800, borderBottom: 'none' }}>Grand Total</td>
                    <td style={{ ...td, fontWeight: 800, borderBottom: 'none' }}>{companySummary.reduce((s, c) => s + c.designations, 0)}</td>
                    <td style={{ ...td, fontWeight: 900, color: '#1a56db', borderBottom: 'none' }}>{grandTotal}</td>
                    <td style={{ ...td, fontWeight: 800, borderBottom: 'none' }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #EEF1F6', padding: 22, boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
              <p style={{ margin: '0 0 18px', fontSize: 11.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Headcount by Company</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {companySummary.map((c, i) => {
                  const pct = grandTotal ? (c.total / grandTotal) * 100 : 0;
                  const color = SUMMARY_COLORS[i % SUMMARY_COLORS.length];
                  return (
                    <div key={c.company}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12.5 }}>
                        <span style={{ fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          {c.company}
                        </span>
                        <span style={{ fontWeight: 800, color: '#1e293b' }}>{c.total} <span style={{ color: '#94A3B8', fontWeight: 600, fontSize: 11 }}>({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div style={{ height: 9, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}cc, ${color})`, borderRadius: 99, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="no-print" style={{ overflowX: 'auto', background: '#fff', borderRadius: 16, border: '1px solid #EEF1F6', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 140, textAlign: 'left', borderTopLeftRadius: 16 }} rowSpan={2}>Company</th>
                  <th style={{ ...th, minWidth: 160, textAlign: 'left' }} rowSpan={2}>Designation</th>
                  {columns.map(c => (
                    <th key={c.key} style={th} colSpan={c.shifts.length}>{c.label}</th>
                  ))}
                  <th style={{ ...th, minWidth: 90, borderTopRightRadius: 16 }} rowSpan={2}>Grand Total</th>
                </tr>
                <tr>
                  {columns.map(c => c.shifts.map(s => (
                    <th key={`${c.key}-${s}`} style={{ ...th, minWidth: 60, color: '#94A3B8', top: 33 }}>{s}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="mp-row">
                    {rowSpans[i] !== undefined && (
                      <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#1e293b', verticalAlign: 'top', background: '#FAFBFD' }} rowSpan={rowSpans[i]}>
                        {r.company}
                      </td>
                    )}
                    <td style={{ ...td, textAlign: 'left', fontWeight: 500, color: '#334155' }}>{r.designation}</td>
                    {columns.map(c => c.shifts.map(s => {
                      const v = r.cells[`${c.key}|${s}`];
                      return (
                        <td key={`${c.key}-${s}`} style={{ ...td, color: v ? '#0f172a' : '#e2e8f0', fontWeight: v ? 700 : 400 }}>
                          {v || '—'}
                        </td>
                      );
                    }))}
                    <td style={{ ...td, fontWeight: 800, color: '#1a56db', background: '#F0F5FF' }}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F8FAFC' }}>
                  <td colSpan={2} style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#1e293b', borderBottom: 'none' }}>Grand Total</td>
                  {columns.map(c => c.shifts.map(s => (
                    <td key={`${c.key}-${s}-t`} style={{ ...td, fontWeight: 800, borderBottom: 'none' }}>{colTotal(c.key, s) || '—'}</td>
                  )))}
                  <td style={{ ...td, fontWeight: 900, color: '#1a56db', background: '#EAF1FF', borderBottom: 'none' }}>{grandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {showConfigModal && (
        <ManpowerConfigModal onClose={() => setShowConfigModal(false)} projects={projects} date={date} />
      )}
    </div>
  );
}

// ── Manage per-project automated-email recipients ─────────────────────────────
function ManpowerConfigModal({ onClose, projects, date }) {
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [sendingNowId, setSendingNowId] = useState(null);
  const [newProjectId, setNewProjectId] = useState('');
  const [newRecipients, setNewRecipients] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['manpower-report-configs'],
    queryFn: () => hrAttendanceAPI.manpowerReportConfigs.list().then(r => r.data),
  });
  const configs = data?.data || [];

  const projectLabel = (projectId) => {
    if (!projectId) return 'All Projects (combined)';
    if (projectId === 'HEAD_OFFICE') return 'Head Office';
    return projects.find(p => p.id === projectId)?.name || projectId;
  };

  const handleAdd = async () => {
    if (!newRecipients.trim()) { toast.error('Enter at least one recipient email'); return; }
    setSaving(true);
    try {
      await hrAttendanceAPI.manpowerReportConfigs.create({
        project_id: newProjectId || null,
        project_name: projectLabel(newProjectId || null),
        recipients: newRecipients.trim(),
      });
      setNewProjectId(''); setNewRecipients('');
      refetch();
      toast.success('Project added to daily manpower email list');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to add project');
    } finally { setSaving(false); }
  };

  const handleToggle = async (cfg) => {
    try {
      await hrAttendanceAPI.manpowerReportConfigs.update(cfg.id, { enabled: !cfg.enabled });
      refetch();
    } catch (e) { toast.error('Failed to update'); }
  };

  const handleDelete = async (cfg) => {
    if (!window.confirm(`Remove "${cfg.project_name}" from the daily email list?`)) return;
    try {
      await hrAttendanceAPI.manpowerReportConfigs.delete(cfg.id);
      refetch();
      toast.success('Removed');
    } catch (e) { toast.error('Failed to remove'); }
  };

  const handleTestSend = async (cfg) => {
    setTestingId(cfg.id);
    try {
      const res = await hrAttendanceAPI.manpowerReportTestEmail(date, cfg.project_id, cfg.project_name).then(r => r.data);
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
      const res = await hrAttendanceAPI.manpowerReportConfigs.sendNow(cfg.id, date).then(r => r.data);
      if (!res.ok) toast.error(res.reason || 'Could not send email');
      else toast.success(`Sent to ${res.recipients?.join(', ') || 'recipients'}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to send email');
    } finally { setSendingNowId(null); }
  };

  const inputCls = { border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 11px', fontSize: 12.5, fontWeight: 600, color: '#1E293B', outline: 'none', width: '100%' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(15,23,42,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF2F7' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Daily Manpower Email — Recipients</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>Each project below gets its own automated email at 10:00 AM IST, sent only to its own list.</p>
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
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{cfg.project_name}</div>
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
            <select value={newProjectId} onChange={e => setNewProjectId(e.target.value)} style={{ ...inputCls, width: 180, cursor: 'pointer' }}>
              <option value="">All Projects (combined)</option>
              <option value="HEAD_OFFICE">Head Office</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
