// src/components/hr/DashboardKit.jsx
// Shared building blocks for HR dashboards (HRDashboardPage, OnboardingDashboardPage)
// — extracted so both dashboards stay visually consistent instead of drifting
// apart from two independently-maintained copies.
import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';

// ── Brand palette ─────────────────────────────────────────────────────────────
export const B = {
  navy:    '#0A1F5C',
  blue:    '#2563EB',
  yellow:  '#F4C430',
  success: '#10B981',
  warning: '#F59E0B',
  danger:  '#EF4444',
  bg:      '#F8FAFC',
};

export const fade = (d = 0) => ({
  initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 },
  transition: { duration: 0.42, delay: d, ease: [0.16, 1, 0.3, 1] },
});

const AVATAR_COLORS = [
  ['#6366F1', '#4F46E5'], ['#0EA5E9', '#0284C7'], ['#10B981', '#059669'],
  ['#F59E0B', '#D97706'], ['#EF4444', '#DC2626'], ['#8B5CF6', '#7C3AED'],
  ['#EC4899', '#DB2777'], ['#14B8A6', '#0D9488'],
];
export const avatarGrad = (n) => AVATAR_COLORS[(n?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
export const initials = (n) => (n || 'U').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
export const DEPT_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#EC4899'];

// ── Custom chart tooltip ─────────────────────────────────────────────────────
export function ChartTip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || B.blue }} className="font-medium">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}{suffix}
        </p>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, icon: Icon, color, bg, trend, delay = 0, onClick }) {
  const isUp = (trend || 0) >= 0;
  return (
    <motion.div {...fade(delay)} onClick={onClick}
      whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(10,31,92,0.12)' }}
      className={`bg-white rounded-2xl p-5 relative overflow-hidden border border-gray-100 ${onClick ? 'cursor-pointer' : ''}`}
      style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
      <div className="absolute -right-5 -top-5 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: color }} />
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-3xl font-black text-gray-900 leading-none mb-1">{value ?? '—'}</p>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </motion.div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
export function SectionHeader({ title, sub, action, onAction, icon: Icon, iconColor }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${iconColor}18` }}>
            <Icon className="w-4 h-4" style={{ color: iconColor }} />
          </div>
        )}
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
      {action && (
        <button onClick={onAction}
          className="text-xs font-bold flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-all"
          style={{ color: B.blue }}>
          {action}<ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
