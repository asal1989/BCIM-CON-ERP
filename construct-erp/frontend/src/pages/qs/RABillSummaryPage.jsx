// src/pages/qs/RABillSummaryPage.jsx — Portfolio-wide RA Bill summary:
// Contract Value vs Billed vs Certified vs Balance to Complete.
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Receipt, Wallet, CheckCircle2, ShieldCheck, XCircle, Building2 } from 'lucide-react';
import { raBillAPI, projectAPI } from '../../api/client';
import SearchableSelect from '../../components/shared/SearchableSelect';
import { Theme, PageHeader, KpiCard, SectionTitle, RichTable } from '../../theme';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const crore = v => `₹${(Number(v || 0) / 1e7).toFixed(2)} Cr`;

const STATUS_LABELS = {
  draft: 'Draft', submitted: 'Submitted', verified: 'Verified',
  certified: 'Certified', paid: 'Paid', rejected: 'Rejected',
};
const STATUS_COLORS = {
  draft: '#94a3b8', submitted: '#f59e0b', verified: '#3b82f6',
  certified: '#34d399', paid: '#2dd4bf', rejected: '#f87171',
};
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function RABillSummaryPage() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['ra-bill-summary', projectId],
    queryFn: () => raBillAPI.summary(projectId ? { project_id: projectId } : {}).then(r => r.data?.data),
  });

  const kpis = data?.kpis || {};
  const projectsOut = data?.projects || [];
  const statusBreakdown = data?.statusBreakdown || [];
  const deductions = data?.deductions || [];
  const trend = data?.trend || [];

  const totalDeductions = deductions.reduce((a, d) => a + d.amount, 0);
  const totalStatusCount = statusBreakdown.reduce((a, s) => a + s.count, 0);

  const pieData = statusBreakdown.map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] || '#94a3b8',
  }));

  const trendData = trend.map(t => {
    const [y, m] = t.month.split('-');
    return { label: `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y.slice(2)}`, value: t.value };
  });

  return (
    <div className="min-h-screen font-sans text-sm" style={{ background: Theme.pageBg }}>
      <PageHeader
        title="RA Bill Summary"
        subtitle="Portfolio-wide client billing status across all active project sites"
        breadcrumbs={[{ label: 'QS & Billing' }, { label: 'RA Bills', href: '/qs/ra-bills' }, { label: 'Summary' }]}
        onBack={() => navigate('/qs/ra-bills')}
        actions={
          <div className="w-56">
            <SearchableSelect
              value={projectId}
              onChange={setProjectId}
              options={[{ value: '', label: 'All Projects' }, ...(projects || []).map(p => ({ value: p.id, label: p.name }))]}
              placeholder="All Projects"
              searchPlaceholder="Search projects…"
            />
          </div>
        }
      />

      <div className="px-6 py-5 space-y-5">
        {isLoading ? (
          <div className="p-10 text-center text-xs text-slate-400">Loading summary…</div>
        ) : (
          <>
            {/* KPI row 1 — billing lifecycle */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard label="Total RA Bills" value={kpis.total_bills ?? 0} sub="all statuses" color="slate" icon={Receipt} />
              <KpiCard label="Gross Valuation" value={crore(kpis.gross_valuation)} sub="excl. rejected" color="blue" icon={Wallet} />
              <KpiCard label="Net Payable (Certified)" value={crore(kpis.net_payable_certified)} sub="after deductions" color="emerald" icon={CheckCircle2} />
              <KpiCard label="Pending Certification" value={crore(kpis.pending_certification_value)} sub={`${kpis.pending_certification_count || 0} bills awaiting PM`} color="amber" icon={ShieldCheck} />
              <KpiCard label="Rejected / Reverted" value={crore(kpis.rejected_value)} sub={`${kpis.rejected_count || 0} bills need correction`} color="red" icon={XCircle} />
            </div>

            {/* KPI row 2 — contract progress */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Total Contract Value" value={crore(kpis.total_contract_value)} sub="sum of BOQ/WO value" color="slate" icon={Building2} />
              <KpiCard
                label="Billed to Date"
                value={crore(kpis.billed_to_date)}
                sub={kpis.total_contract_value > 0 ? `${Math.round((kpis.billed_to_date / kpis.total_contract_value) * 100)}% of contract value` : '—'}
                color="blue"
              />
              <KpiCard
                label="Certified to Date"
                value={crore(kpis.certified_to_date)}
                sub={kpis.total_contract_value > 0 ? `${Math.round((kpis.certified_to_date / kpis.total_contract_value) * 100)}% of contract value` : '—'}
                color="emerald"
              />
              <KpiCard label="Balance to Complete" value={crore(kpis.balance_to_complete)} sub="contract value − certified" color="orange" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Project-wise table */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e2e6ec] shadow-sm p-5">
                <SectionTitle>Contract Value vs. Billed vs. Certified</SectionTitle>
                <RichTable>
                  <thead>
                    <RichTable.HeaderRow>
                      <RichTable.Th>Project</RichTable.Th>
                      <RichTable.Th align="right">Contract Value</RichTable.Th>
                      <RichTable.Th align="right">Billed</RichTable.Th>
                      <RichTable.Th align="right">Certified</RichTable.Th>
                      <RichTable.Th align="right">Balance to Complete</RichTable.Th>
                      <RichTable.Th align="right">% Complete</RichTable.Th>
                    </RichTable.HeaderRow>
                  </thead>
                  <tbody>
                    {projectsOut.length === 0 && (
                      <tr><td colSpan={6} className="py-10 text-center text-xs text-slate-400">No projects found</td></tr>
                    )}
                    {projectsOut.map(p => (
                      <RichTable.Row key={p.id} onClick={() => navigate(`/qs/ra-bills?project_id=${p.id}`)}>
                        <RichTable.Td>
                          <div>{p.name}</div>
                          {p.project_code && <div className="text-[10px] font-normal text-slate-400">{p.project_code}</div>}
                        </RichTable.Td>
                        <RichTable.Td mono align="right" color={Theme.textMuted}>{inr(p.contract_value)}</RichTable.Td>
                        <RichTable.Td mono align="right" color={Theme.textMuted}>{inr(p.billed)}</RichTable.Td>
                        <RichTable.Td mono align="right" color={Theme.emerald.to}>{inr(p.certified)}</RichTable.Td>
                        <RichTable.Td mono align="right">{inr(p.balance_to_complete)}</RichTable.Td>
                        <RichTable.Td align="right">
                          {p.pct_complete === null ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-mono text-xs">{p.pct_complete}%</span>
                              <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, p.pct_complete)}%`, background: Theme.navy }} />
                              </div>
                            </div>
                          )}
                        </RichTable.Td>
                      </RichTable.Row>
                    ))}
                  </tbody>
                </RichTable>
                <p className="text-[10px] text-slate-400 mt-2">
                  Billed = cumulative RA bill value submitted for approval &nbsp;·&nbsp;
                  Certified = PM-approved, payment-eligible value &nbsp;·&nbsp;
                  Balance to Complete = Contract Value − Certified
                </p>
              </div>

              {/* Right rail */}
              <div className="space-y-5">
                <div className="bg-white rounded-2xl border border-[#e2e6ec] shadow-sm p-5">
                  <SectionTitle>Bills by Status</SectionTitle>
                  {pieData.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">No bills yet</div>
                  ) : (
                    <>
                      <div style={{ width: '100%', height: 160 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                              {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                            <Tooltip formatter={(v, n) => [`${v} bills`, n]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                        {pieData.map((d, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                            <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                            {d.name} <span className="text-slate-400">({d.value})</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-2">{totalStatusCount} bills total</div>
                    </>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-[#e2e6ec] shadow-sm p-5">
                  <SectionTitle>Aggregate Deductions</SectionTitle>
                  {deductions.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-400">No deductions recorded</div>
                  ) : (
                    <div className="space-y-2.5">
                      {deductions.map(d => (
                        <div key={d.key} className="flex items-center justify-between">
                          <span className="text-[12px] text-slate-500 font-medium">{d.label}</span>
                          <span className="text-[12.5px] font-semibold font-mono text-slate-800">{inr(d.amount)}</span>
                        </div>
                      ))}
                      <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-slate-700">Total</span>
                        <span className="text-[13px] font-bold font-mono" style={{ color: Theme.navy }}>{inr(totalDeductions)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Trend */}
            <div className="bg-white rounded-2xl border border-[#e2e6ec] shadow-sm p-5">
              <SectionTitle>Certified Value — Monthly Trend</SectionTitle>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="raTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={Theme.navy} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={Theme.navy} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: Theme.textFaint }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: Theme.textFaint }} axisLine={false} tickLine={false}
                      tickFormatter={v => `₹${(v / 1e5).toFixed(0)}L`} width={50} />
                    <Tooltip formatter={v => [inr(v), 'Certified']} labelStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="value" stroke={Theme.navy} strokeWidth={2.5} fill="url(#raTrendFill)" dot={{ r: 3, fill: '#fff', stroke: Theme.navy, strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
