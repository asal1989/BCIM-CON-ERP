// src/pages/hr-admin/compliance/ComplianceFilters.jsx
// Horizontal filter panel: month, department, location, type, status,
// priority, free-text search, Reset + Apply. Staged locally, applied on click.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { COMPLIANCE_TYPES, DEPARTMENTS, LOCATIONS, PRIORITIES, STATUSES } from './complianceData';

const EMPTY = { month: '', department: '', location: '', type: '', status: '', priority: '', search: '' };

const selCls = 'h-10 px-3 pr-8 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-shadow appearance-none bg-no-repeat bg-[right_0.6rem_center]';
const chevronBg = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` };

export default function ComplianceFilters({ onApply }) {
  const [f, setF] = useState(EMPTY);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }}
      className="bg-white rounded-2xl border border-slate-200/70 p-4"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,.05), 0 6px 20px rgba(15,23,42,.04)' }}>
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={f.month} onChange={e => set('month', e.target.value)}
          className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        <select value={f.department} onChange={e => set('department', e.target.value)} className={selCls} style={chevronBg}>
          <option value="">Department</option>
          {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select value={f.location} onChange={e => set('location', e.target.value)} className={selCls} style={chevronBg}>
          <option value="">Location</option>
          {LOCATIONS.map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={f.type} onChange={e => set('type', e.target.value)} className={selCls} style={chevronBg}>
          <option value="">Compliance Type</option>
          {COMPLIANCE_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={f.status} onChange={e => set('status', e.target.value)} className={selCls} style={chevronBg}>
          <option value="">Status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={f.priority} onChange={e => set('priority', e.target.value)} className={selCls} style={chevronBg}>
          <option value="">Priority</option>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={f.search} onChange={e => set('search', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onApply(f)}
            className="w-full h-10 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Search compliance…" />
        </div>

        <button onClick={() => { setF(EMPTY); onApply(EMPTY); }}
          className="h-10 px-4 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <button onClick={() => onApply(f)}
          className="h-10 px-5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-transform active:scale-[0.98]"
          style={{ background: '#2563EB', boxShadow: '0 4px 14px rgba(37,99,235,.30)' }}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> Apply Filters
        </button>
      </div>
    </motion.div>
  );
}
