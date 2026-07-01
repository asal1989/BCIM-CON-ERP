// CelebrationsWidget.jsx — Today's birthdays & work anniversaries
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Gift, Award, Send, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import { hrComplianceAPI } from '../../api/client';

const ORDINAL = (n) => {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const AVATAR_COLORS = [
  ['#6366f1','#4f46e5'], ['#0ea5e9','#0284c7'], ['#10b981','#059669'],
  ['#f59e0b','#d97706'], ['#ec4899','#db2777'], ['#8b5cf6','#7c3aed'],
];
const avatarColor = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initials    = (name) => (name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

function Avatar({ name, size = 'md' }) {
  const [c1, c2] = avatarColor(name);
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={clsx('rounded-full flex items-center justify-center text-white font-bold flex-shrink-0', sz)}
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
      {initials(name)}
    </div>
  );
}

export default function CelebrationsWidget() {
  const [showAll, setShowAll] = useState(false);
  const [sent, setSent]       = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hr-celebrations-today'],
    queryFn: () => hrComplianceAPI.celebrations().then(r => r.data),
    staleTime: 30 * 60 * 1000,
  });

  const trigger = useMutation({
    mutationFn: () => hrComplianceAPI.triggerCelebrations(),
    onSuccess: () => { setSent(true); setTimeout(() => setSent(false), 4000); },
  });

  const birthdays    = data?.birthdays    || [];
  const anniversaries = data?.anniversaries || [];
  const total = birthdays.length + anniversaries.length;

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
      </div>
    );
  }

  const allItems = [
    ...birthdays.map(e    => ({ ...e, type: 'birthday' })),
    ...anniversaries.map(e => ({ ...e, type: 'anniversary' })),
  ];
  const visible = showAll ? allItems : allItems.slice(0, 4);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-400 to-violet-500 flex items-center justify-center">
            <span className="text-base">🎉</span>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Today's Celebrations</p>
            <p className="text-[10px] text-slate-400">
              {total === 0 ? 'No celebrations today' : `${birthdays.length} birthday${birthdays.length !== 1 ? 's' : ''} · ${anniversaries.length} anniversar${anniversaries.length !== 1 ? 'ies' : 'y'}`}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => refetch()} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {total > 0 && (
            <button
              onClick={() => trigger.mutate()}
              disabled={trigger.isPending || sent}
              title="Send greetings via Email + WhatsApp"
              className={clsx(
                'flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium transition-all',
                sent
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60'
              )}
            >
              {trigger.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {sent ? 'Sent!' : 'Send Greetings'}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {total === 0 && (
        <div className="py-10 text-center px-4">
          <div className="text-4xl mb-2">🌟</div>
          <p className="text-sm text-slate-500">No birthdays or anniversaries today</p>
          <p className="text-xs text-slate-400 mt-1">Check back tomorrow!</p>
        </div>
      )}

      {/* List */}
      {visible.map((emp, i) => (
        <div key={i} className={clsx('flex items-center gap-3 px-5 py-3', i < visible.length - 1 && 'border-b border-slate-50')}>
          <Avatar name={emp.name} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{emp.name}</p>
            <p className="text-[11px] text-slate-400 truncate">{emp.emp_code || '—'} · {emp.department || emp.designation || '—'}</p>
          </div>
          {emp.type === 'birthday' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 flex-shrink-0">
              <Gift className="w-3 h-3 text-pink-500" />
              <span className="text-[10px] font-bold text-pink-600">Birthday 🎂</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 flex-shrink-0">
              <Award className="w-3 h-3 text-indigo-500" />
              <span className="text-[10px] font-bold text-indigo-600">{ORDINAL(emp.years)} Year 🏆</span>
            </div>
          )}
        </div>
      ))}

      {/* Show more */}
      {allItems.length > 4 && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="w-full py-2.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1 border-t border-slate-100"
        >
          {showAll ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> Show {allItems.length - 4} more</>}
        </button>
      )}

      {/* Footer note */}
      {total > 0 && (
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] text-slate-400">
            🤖 Greetings auto-sent at 8:30 AM via Email & WhatsApp · Click "Send Greetings" to re-send
          </p>
        </div>
      )}
    </div>
  );
}
