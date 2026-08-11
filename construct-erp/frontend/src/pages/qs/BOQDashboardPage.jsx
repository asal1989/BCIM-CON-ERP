// src/pages/qs/BOQDashboardPage.jsx — BOQ Margin & Profitability Dashboard
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { boqMappingAPI, projectAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import {
  BarChart3, AlertTriangle, TrendingUp, TrendingDown,
  IndianRupee, Layers, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, ReferenceLine } from 'recharts';

const fmt  = (n) => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const pct  = (n) => `${Number(n||0).toFixed(1)}%`;
const num  = (v) => parseFloat(v||0);

function marginBg(p) {
  if (p < 0)  return '#FEF2F2';
  if (p < 10) return '#FFF7ED';
  if (p < 20) return '#FFFBEB';
  return '#F0FDF4';
}
function marginTextColor(p) {
  if (p < 0)  return '#DC2626';
  if (p < 10) return '#EA580C';
  if (p < 20) return '#D97706';
  return '#16A34A';
}

export default function BOQDashboardPage() {
  const [projectId, setProjectId] = useState('');
  const { data: projects=[] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ['boq-dashboard', projectId],
    queryFn:  () => boqMappingAPI.dashboard(projectId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 0, enabled: !!projectId,
  });

  const d = dash || {};
  const marginPct = d.total_client_value > 0 ? (d.total_margin / d.total_client_value) * 100 : 0;
  const coveragePct = d.total_boq_items > 0 ? (d.mapped_items / d.total_boq_items) * 100 : 0;

  // Chart data
  const chartData = (d.by_chapter || []).map(ch => ({
    name: (ch.chapter_name||'').slice(0,18),
    client: num(ch.client_value),
    sc:     num(ch.sc_value),
    margin: num(ch.margin),
    pct:    num(ch.client_value) > 0 ? (num(ch.margin)/num(ch.client_value))*100 : 0,
  }));

  return (
    <div style={{ background: Theme.pageBg, minHeight:'100vh' }}>
      <PageHeader
        title="BOQ Margin Dashboard"
        subtitle="Project profitability — client contract value vs subcontractor cost"
        breadcrumbs={[{label:'QS & Billing'},{label:'BOQ Margin Dashboard'}]}
        actions={
          <button onClick={()=>refetch()} disabled={!projectId}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition"
            style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff'}}>
            <RefreshCw className="w-3.5 h-3.5"/> Refresh
          </button>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* Project selector */}
        <select value={projectId} onChange={e=>setProjectId(e.target.value)}
          className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none min-w-64">
          <option value="">— Select Project —</option>
          {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {!projectId && (
          <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center shadow-sm">
            <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-4"/>
            <p className="text-slate-500 font-semibold">Select a project to view the margin dashboard</p>
          </div>
        )}

        {projectId && isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map(n=><div key={n} className="h-28 bg-white rounded-xl animate-pulse border border-slate-200"/>)}
          </div>
        )}

        {projectId && !isLoading && dash && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ThemeKpiCard icon={IndianRupee}   label="Client Contract Value" value={fmt(d.total_client_value)} color="blue"    sub="Total BOQ value"/>
              <ThemeKpiCard icon={IndianRupee}   label="SC Committed Cost"     value={fmt(d.total_sc_committed)} color="orange"  sub="Total SC allocation"/>
              <ThemeKpiCard icon={marginPct>=0?TrendingUp:TrendingDown}
                            label="Net Margin"                                 value={fmt(d.total_margin)}       color={marginPct>=0?"emerald":"red"}
                            sub={`${pct(marginPct)} of contract`}/>
              <ThemeKpiCard icon={Layers}        label="BOQ Coverage"          value={`${d.mapped_items}/${d.total_boq_items}`} color="teal"
                            sub={`${pct(coveragePct)} items allocated`}/>
            </div>

            {/* Big margin number */}
            <div className="rounded-2xl p-6 flex items-center justify-between shadow-sm border-2"
              style={{ background: marginBg(marginPct), borderColor: marginPct < 0 ? '#FCA5A5' : marginPct < 20 ? '#FDE68A' : '#BBF7D0' }}>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest" style={{color:marginTextColor(marginPct)}}>
                  {marginPct < 0 ? '⚠ LOSS MAKING' : marginPct < 10 ? '⚠ LOW MARGIN' : marginPct < 20 ? 'MODERATE MARGIN' : '✓ HEALTHY MARGIN'}
                </p>
                <p className="text-4xl font-bold mt-1" style={{color:marginTextColor(marginPct)}}>
                  {pct(marginPct)}
                </p>
                <p className="text-sm mt-1" style={{color:marginTextColor(marginPct)}}>
                  {fmt(d.total_margin)} on {fmt(d.total_client_value)} contract
                </p>
              </div>
              <div className="text-right">
                {d.unmapped_items > 0 && (
                  <div className="bg-amber-100 border border-amber-300 rounded-xl px-4 py-3">
                    <p className="text-amber-800 font-bold text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4"/> {d.unmapped_items} BOQ items not yet allocated
                    </p>
                    <p className="text-amber-700 text-xs mt-0.5">Go to BOQ SC Mapping to assign vendors</p>
                  </div>
                )}
              </div>
            </div>

            {/* Chapter margin chart */}
            {chartData.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-bold text-black">Margin by Chapter / Category</p>
                    <p className="text-xs text-slate-400">Green bars = margin, Orange = SC cost, Blue = client value</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {[['Client Value','#1A3A6B'],['SC Cost','#EA580C'],['Margin','#16A34A']].map(([l,c])=>(
                      <div key={l} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm" style={{background:c}}/>
                        <span className="text-slate-500">{l}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{top:5,right:10,left:0,bottom:60}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
                    <XAxis dataKey="name" tick={{fontSize:10}} angle={-30} textAnchor="end" interval={0}/>
                    <YAxis tick={{fontSize:10}} tickFormatter={v=>`₹${(v/100000).toFixed(0)}L`}/>
                    <Tooltip formatter={(v,n)=>[fmt(v),n.charAt(0).toUpperCase()+n.slice(1)]}/>
                    <ReferenceLine y={0} stroke="#94A3B8"/>
                    <Bar dataKey="client" name="Client Value" fill="#1A3A6B" radius={[2,2,0,0]}/>
                    <Bar dataKey="sc"     name="SC Cost"      fill="#EA580C" radius={[2,2,0,0]}/>
                    <Bar dataKey="margin" name="Margin"       radius={[4,4,0,0]}>
                      {chartData.map((entry, i)=>(
                        <Cell key={i} fill={entry.margin >= 0 ? '#16A34A' : '#DC2626'}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Chapter margin table */}
            {(d.by_chapter||[]).length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3" style={{background:`linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`}}>
                  <p className="text-xs font-bold text-white uppercase tracking-widest">Chapter-wise Margin Breakdown</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      {['Chapter','Client Value','SC Cost','Margin ₹','Margin %'].map(h=>(
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(d.by_chapter||[]).map((ch,i)=>{
                      const p = num(ch.client_value)>0?(num(ch.margin)/num(ch.client_value))*100:0;
                      const tc = marginTextColor(p);
                      return (
                        <tr key={i} className={clsx('border-b border-slate-50', i%2===0?'bg-white':'bg-slate-50/30')}>
                          <td className="px-4 py-3 font-semibold text-black">{ch.chapter_name||'General'}</td>
                          <td className="px-4 py-3 text-right font-mono text-black">{fmt(ch.client_value)}</td>
                          <td className="px-4 py-3 text-right font-mono text-orange-700">{fmt(ch.sc_value)}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold" style={{color:tc}}>{fmt(ch.margin)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[80px]">
                                <div className="h-full rounded-full" style={{width:`${Math.min(100,Math.max(0,p))}%`,background:tc}}/>
                              </div>
                              <span className="text-xs font-bold" style={{color:tc}}>{pct(p)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top unmapped items */}
            {(d.top_unmapped||[]).length > 0 && (
              <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600"/>
                  <p className="text-sm font-bold text-amber-800">High-Value Unallocated BOQ Items (top 10)</p>
                  <p className="text-xs text-amber-600 ml-2">— Assign SC vendors to lock in your margin</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      {['Item No.','Description','Unit','Qty','Client Rate','Client Amount'].map(h=>(
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(d.top_unmapped||[]).map((it,i)=>(
                      <tr key={i} className={clsx('border-b border-slate-50', i%2===0?'bg-white':'bg-amber-50/20')}>
                        <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-600">{it.item_no}</td>
                        <td className="px-4 py-2.5 text-slate-700 max-w-[280px] truncate">{it.description}</td>
                        <td className="px-4 py-2.5 text-slate-500">{it.unit}</td>
                        <td className="px-4 py-2.5 text-right">{it.quantity}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmt(it.rate)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-amber-700">{fmt(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
