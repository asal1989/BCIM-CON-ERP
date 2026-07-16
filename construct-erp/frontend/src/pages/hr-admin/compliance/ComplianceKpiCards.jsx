// src/pages/hr-admin/compliance/ComplianceKpiCards.jsx
// Six animated KPI cards: count-up numbers, progress rings, hover lift.
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, CheckCircle2, Clock3, AlertTriangle, FileText, Gauge } from 'lucide-react';
import { C } from './complianceData';

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf; const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3)))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function ProgressRing({ pct, color, size = 52, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
      <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ * (1 - pct / 100) }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
    </svg>
  );
}

const cardAnim = (i) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] },
  whileHover: { y: -3, boxShadow: '0 12px 32px rgba(15,23,42,0.10)' },
});

function Card({ i, children }) {
  return (
    <motion.div {...cardAnim(i)}
      className="bg-white/80 backdrop-blur rounded-2xl border border-slate-200/70 p-5 cursor-default"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,.05), 0 6px 20px rgba(15,23,42,.04)' }}>
      {children}
    </motion.div>
  );
}

export default function ComplianceKpiCards({ stats }) {
  const total     = useCountUp(stats.total);
  const compliant = useCountUp(stats.compliant);
  const dueSoon   = useCountUp(stats.dueSoon);
  const overdue   = useCountUp(stats.overdue);
  const docs      = useCountUp(stats.documents);
  const rate      = useCountUp(stats.completionRate);
  const compliantPct = stats.total ? Math.round((stats.compliant / stats.total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {/* 1 — Total (blue gradient) */}
      <motion.div {...cardAnim(0)}
        className="rounded-2xl p-5 text-white cursor-default"
        style={{ background: 'linear-gradient(135deg,#2563EB 0%,#1D4ED8 60%,#1E40AF 100%)', boxShadow: '0 8px 24px rgba(37,99,235,.30)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-blue-100">Total Compliance Items</span>
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><ShieldCheck className="w-4.5 h-4.5 w-5 h-5 text-white" /></div>
        </div>
        <div className="text-3xl font-bold tracking-tight">{total}</div>
        <div className="text-xs text-blue-100/80 mt-1">Across all departments</div>
      </motion.div>

      {/* 2 — Compliant with ring */}
      <Card i={1}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Compliant</span>
            <div className="text-3xl font-bold text-slate-900 mt-2">{compliant}</div>
            <div className="text-xs text-slate-400 mt-1">{compliantPct}% of total</div>
          </div>
          <div className="relative">
            <ProgressRing pct={compliantPct} color={C.success} />
            <CheckCircle2 className="w-4 h-4 absolute inset-0 m-auto" style={{ color: C.success }} />
          </div>
        </div>
      </Card>

      {/* 3 — Due Soon */}
      <Card i={2}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-500">Due Soon</span>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
            <Clock3 className="w-4 h-4" style={{ color: C.warning }} />
          </div>
        </div>
        <div className="text-3xl font-bold text-slate-900">{dueSoon}</div>
        <div className="text-xs text-slate-400 mt-1">Next 15 days</div>
      </Card>

      {/* 4 — Overdue */}
      <Card i={3}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-500">Overdue</span>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#FEF2F2' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: C.danger }} />
          </div>
        </div>
        <div className="text-3xl font-bold" style={{ color: C.danger }}>{overdue}</div>
        <div className="text-xs text-slate-400 mt-1">Needs immediate action</div>
      </Card>

      {/* 5 — Documents */}
      <Card i={4}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-500">Documents</span>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#F5F3FF' }}>
            <FileText className="w-4 h-4" style={{ color: C.purple }} />
          </div>
        </div>
        <div className="text-3xl font-bold text-slate-900">{docs}</div>
        <div className="text-xs text-slate-400 mt-1">Attached evidence files</div>
      </Card>

      {/* 6 — Completion rate ring */}
      <Card i={5}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Completion Rate</span>
            <div className="text-3xl font-bold text-slate-900 mt-2">{rate}%</div>
            <div className="text-xs text-slate-400 mt-1">This quarter</div>
          </div>
          <div className="relative">
            <ProgressRing pct={stats.completionRate} color={C.primary} />
            <Gauge className="w-4 h-4 absolute inset-0 m-auto" style={{ color: C.primary }} />
          </div>
        </div>
      </Card>
    </div>
  );
}
