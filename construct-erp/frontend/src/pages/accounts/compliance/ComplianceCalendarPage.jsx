import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, CheckCircle2, Clock, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { reportAPI } from '../../../api/client';
import useAuthStore from '../../../store/authStore';
import ProjectFilter from '../../../components/ProjectFilter';

const inr = v => `₹${(+v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const now = new Date();
const CURRENT_FY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

const STATUS = {
  filed:    { label: 'Recorded', cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2, iconCls: 'text-emerald-500' },
  due_soon: { label: 'Due Soon', cls: 'bg-amber-50  text-amber-700',    icon: Clock,        iconCls: 'text-amber-500'   },
  overdue:  { label: 'Overdue',  cls: 'bg-red-50    text-red-700',      icon: XCircle,      iconCls: 'text-red-500'     },
  upcoming: { label: 'Upcoming', cls: 'bg-blue-50   text-blue-700',     icon: AlertTriangle,iconCls: 'text-blue-400'    },
};

const CATEGORIES = ['All', 'GST', 'TDS', 'PF', 'ESI'];
const CAT_CLR = { GST: 'bg-violet-100 text-violet-700', TDS: 'bg-blue-100 text-blue-700', PF: 'bg-teal-100 text-teal-700', ESI: 'bg-cyan-100 text-cyan-700' };

export default function ComplianceCalendarPage() {
  const [cat, setCat] = useState('All');
  const [fy, setFy] = useState(CURRENT_FY);
  const { selectedProjectId } = useAuthStore();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['compliance-calendar', fy, selectedProjectId],
    queryFn: () => reportAPI.complianceCalendar({ fy, project_id: selectedProjectId || undefined }).then(r => r.data),
  });

  const items = data?.items ?? [];
  const counts = data?.counts ?? {};
  const fyLabel = data?.fy ?? `FY ${fy}-${String(fy + 1).slice(-2)}`;
  const rows = cat === 'All' ? items : items.filter(r => r.category === cat);
  const fyOptions = [CURRENT_FY, CURRENT_FY - 1, CURRENT_FY - 2];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-indigo-50 flex items-center justify-center">
              <Shield className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Compliance Overview</h1>
              <p className="text-xs text-slate-400">{fyLabel} — statutory due dates with amounts computed from your ERP data</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ProjectFilter />
            <select value={fy} onChange={e => setFy(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200">
              {fyOptions.map(y => <option key={y} value={y}>FY {y}-{String(y + 1).slice(-2)}</option>)}
            </select>
            <button onClick={() => refetch()} disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} /> {isFetching ? 'Syncing…' : 'Sync from ERP'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            { key: 'overdue',  label: 'Overdue',   color: 'red'     },
            { key: 'due_soon', label: 'Due ≤15d',  color: 'amber'   },
            { key: 'upcoming', label: 'Upcoming',  color: 'blue'    },
            { key: 'filed',    label: 'Recorded',  color: 'emerald' },
          ].map(({ key, label, color }) => (
            <div key={key} className={`bg-${color}-50 border border-${color}-100 rounded-md px-4 py-3`}>
              <p className={`text-2xl font-bold text-${color}-700`}>{counts[key] || 0}</p>
              <p className={`text-xs text-${color}-600 mt-0.5`}>{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-1 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3 py-1.5 text-xs rounded-md border ${cat === c ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-4 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Category', 'Obligation', 'Period', 'Due Date', 'Amount', 'Status'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r, i) => {
                  const s = STATUS[r.status] || STATUS.upcoming;
                  const Icon = s.icon;
                  return (
                    <tr key={i} className={`hover:bg-slate-50 ${r.status === 'overdue' ? 'bg-red-50/30' : r.status === 'due_soon' ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CAT_CLR[r.category] || 'bg-slate-100 text-slate-600'}`}>{r.category}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.period}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{dayjs(r.due_date).format('DD MMM YYYY')}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{r.amount ? inr(r.amount) : '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
                          <Icon className={`w-3 h-3 ${s.iconCls}`} />{s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <p className="px-4 py-10 text-sm text-slate-400 text-center">No obligations for {fyLabel}.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
