// src/pages/hr-admin/compliance/StatutoryCompliance.jsx
// Accordion cards — one per statutory act/scheme (EPF, ESI, PT, LWF, Income
// Tax, Bonus, Gratuity, Leave Encashment, Minimum Wages, Shops & Establishment,
// Contract Labour, Factory Act, Labour License). Each expands to show the
// filing cadence, responsible person, progress, and last filing, with quick
// actions to mark filed or view history.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Upload, History, CheckCircle2, User2, CalendarClock, Users2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrComplianceAPI } from '../../../api/client';
import { STATUS_STYLES, C, fmtDate, daysUntil } from './complianceData';

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function ProgressBar({ pct, status }) {
  const color = status === 'Overdue' ? C.danger : status === 'Compliant' ? C.success : status === 'Pending' ? C.warning : C.primary;
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <motion.div className="h-full rounded-full" style={{ background: color }}
        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  );
}

function StatutoryCard({ item, index, expanded, onToggle, onMarkFiled, markingFiled }) {
  const style = STATUS_STYLES[item.status];
  const d = daysUntil(item.dueDate);
  const urgencyText = d === null ? 'See Compliance Calendar'
    : item.status === 'Overdue' ? `${Math.abs(d)}d overdue`
    : d <= 7 ? `Due in ${d}d` : fmtDate(item.dueDate);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.03 * index, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,.05), 0 6px 20px rgba(15,23,42,.04)' }}
    >
      <button onClick={onToggle} className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50/60 transition-colors">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-xs"
          style={{ background: `${style.text}14`, color: style.text }}>
          {item.code}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-900">{item.name}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: style.bg, color: style.text }}>
              {item.status}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{item.act} · {item.frequency}</div>
        </div>

        <div className="hidden md:block w-32 flex-shrink-0">
          <ProgressBar pct={item.progress} status={item.status} />
          <div className="text-[11px] text-slate-400 mt-1">{item.progress}% complete</div>
        </div>

        <div className="hidden sm:flex flex-col items-end w-28 flex-shrink-0">
          <span className="text-xs font-semibold" style={{ color: item.status === 'Overdue' ? C.danger : '#334155' }}>{urgencyText}</span>
          <span className="text-[11px] text-slate-400">Due date</span>
        </div>

        <ChevronDown size={17} className="text-slate-400 flex-shrink-0 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4 pt-1 border-t border-slate-100">
              <p className="text-sm text-slate-500 mt-3 leading-relaxed">{item.description}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="flex items-center gap-2.5 bg-slate-50 rounded-xl p-3">
                  <User2 size={15} className="text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Responsible</div>
                    <div className="text-xs font-semibold text-slate-700 truncate">{item.responsible}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 bg-slate-50 rounded-xl p-3">
                  <History size={15} className="text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Last Filing</div>
                    <div className="text-xs font-semibold text-slate-700">{fmtDate(item.lastFiling)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 bg-slate-50 rounded-xl p-3">
                  <CalendarClock size={15} className="text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Next Due</div>
                    <div className="text-xs font-semibold text-slate-700">{fmtDate(item.dueDate)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 bg-slate-50 rounded-xl p-3">
                  <Users2 size={15} className="text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Covered</div>
                    <div className="text-xs font-semibold text-slate-700">{item.coveredEmployees} employees</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ background: C.primary }}>{initials(item.responsible)}</div>
                <span className="text-xs text-slate-400">Owned by <strong className="text-slate-600">{item.responsible}</strong></span>

                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => toast('Document upload will attach to this filing once backend is wired', { icon: '📎' })}
                    className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-1.5">
                    <Upload size={13} /> Upload
                  </button>
                  <button onClick={() => toast('Filing history view coming with backend wiring', { icon: '🕘' })}
                    className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-1.5">
                    <History size={13} /> History
                  </button>
                  {item.status !== 'Compliant' && (
                    <button disabled={markingFiled} onClick={() => onMarkFiled(item.code)}
                      className="h-8 px-3 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
                      style={{ background: C.success }}>
                      <CheckCircle2 size={13} /> Mark Filed
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function StatutoryCompliance() {
  const qc = useQueryClient();
  const [expandedCode, setExpandedCode] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['compliance-tracker-statutory'],
    queryFn: () => hrComplianceAPI.trackerStatutory().then(r => r.data.data),
  });
  const items = data || [];
  if (expandedCode === null && items.length) setExpandedCode(items[0].code);

  const markFiledMut = useMutation({
    mutationFn: (code) => hrComplianceAPI.markStatutoryFiled(code),
    onSuccess: (_, code) => {
      const item = items.find(it => it.code === code);
      toast.success(`${item?.name || code} marked as filed`);
      qc.invalidateQueries({ queryKey: ['compliance-tracker-statutory'] });
      qc.invalidateQueries({ queryKey: ['compliance-tracker-activity'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to mark as filed'),
  });

  const compliantCount = items.filter(it => it.status === 'Compliant').length;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="text-sm text-slate-500">
          {isLoading ? 'Loading…' : (
            <><strong className="text-slate-700">{compliantCount}</strong> of <strong className="text-slate-700">{items.length}</strong> statutory obligations fully compliant this period</>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <StatutoryCard
            key={item.code}
            item={item}
            index={i}
            expanded={expandedCode === item.code}
            onToggle={() => setExpandedCode(expandedCode === item.code ? null : item.code)}
            onMarkFiled={(code) => markFiledMut.mutate(code)}
            markingFiled={markFiledMut.isPending}
          />
        ))}
      </div>
    </div>
  );
}
