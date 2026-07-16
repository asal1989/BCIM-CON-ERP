// src/pages/hr-admin/compliance/ComplianceTimeline.jsx
// Vertical renewal/history timeline used inside the drawer.
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Clock3 } from 'lucide-react';

export default function ComplianceTimeline({ events }) {
  return (
    <div className="relative pl-5">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-slate-200" />
      {events.map((ev, i) => {
        const Icon = ev.state === 'done' ? CheckCircle2 : ev.state === 'current' ? Clock3 : Circle;
        const color = ev.state === 'done' ? '#22C55E' : ev.state === 'current' ? '#2563EB' : '#CBD5E1';
        return (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i }}
            className="relative pb-5 last:pb-0">
            <span className="absolute -left-5 top-0.5 bg-white rounded-full">
              <Icon className="w-4 h-4" style={{ color }} />
            </span>
            <p className="text-sm font-semibold text-slate-800 leading-tight">{ev.title}</p>
            <p className="text-xs text-slate-400 mt-0.5">{ev.date}{ev.by ? ` · ${ev.by}` : ''}</p>
            {ev.note && <p className="text-xs text-slate-500 mt-1">{ev.note}</p>}
          </motion.div>
        );
      })}
    </div>
  );
}
