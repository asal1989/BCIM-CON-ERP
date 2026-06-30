// src/components/layout/NotificationPanel.jsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Bell, Package, PackageCheck, AlertTriangle, FileText,
  ClipboardList, CalendarOff, Ticket, Key, Hammer,
  Truck, CheckCircle, RefreshCw, X,
} from 'lucide-react';
import { notificationsAPI } from '../../api/client';

// Map icon string → component
const ICON_MAP = {
  'package':        Package,
  'package-check':  PackageCheck,
  'alert-triangle': AlertTriangle,
  'file-text':      FileText,
  'clipboard-list': ClipboardList,
  'calendar-off':   CalendarOff,
  'ticket':         Ticket,
  'key':            Key,
  'hammer':         Hammer,
  'truck':          Truck,
};

const SEVERITY_STYLES = {
  error:   { bg: 'bg-red-50',    border: 'border-red-100',    icon: 'text-red-500',    dot: 'bg-red-500'    },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-100',  icon: 'text-amber-500',  dot: 'bg-amber-500'  },
  info:    { bg: 'bg-blue-50',   border: 'border-blue-100',   icon: 'text-blue-500',   dot: 'bg-blue-400'   },
};

const CATEGORY_COLORS = {
  Stores:      'bg-emerald-100 text-emerald-700',
  Finance:     'bg-indigo-100 text-indigo-700',
  HR:          'bg-violet-100 text-violet-700',
  IT:          'bg-slate-100 text-slate-600',
  HSE:         'bg-red-100 text-red-700',
  Quality:     'bg-amber-100 text-amber-700',
  Procurement: 'bg-cyan-100 text-cyan-700',
};

export default function NotificationPanel({ onClose }) {
  const navigate = useNavigate();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsAPI.list().then(r => r.data),
    staleTime: 1000 * 30,        // re-fetch after 30 s
    refetchInterval: 1000 * 60,  // auto-poll every 60 s while open
  });

  const items = data?.items ?? [];
  const count = data?.count ?? 0;

  function handleClick(link) {
    navigate(link);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div
        className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-16px)] rounded-2xl overflow-hidden z-50 flex flex-col"
        style={{
          background: '#fff',
          border: '1px solid #E8EAED',
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-bold text-slate-900">Notifications</span>
            {count > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500 text-white">
                {count}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refetch()}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
              title="Refresh"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-widest">
                Checking alerts…
              </span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="text-sm font-bold text-slate-700">All clear!</div>
              <div className="text-[11px] text-slate-400 text-center px-8">
                No pending actions across GRN, invoices, stock, leave, or safety
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {items.map((item) => {
                const s = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
                const IconComp = ICON_MAP[item.icon] || Bell;
                const catColor = CATEGORY_COLORS[item.category] || 'bg-slate-100 text-slate-600';

                return (
                  <button
                    key={item.id}
                    onClick={() => handleClick(item.link)}
                    className={clsx(
                      'w-full text-left px-5 py-4 flex items-start gap-3.5 transition-colors hover:bg-slate-50 group'
                    )}
                  >
                    {/* Icon bubble */}
                    <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', s.bg)}>
                      <IconComp className={clsx('w-4 h-4', s.icon)} />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[12px] font-bold text-slate-900 leading-tight truncate">
                          {item.title}
                        </span>
                        <span className={clsx(
                          'flex-shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-medium uppercase tracking-wider',
                          catColor
                        )}>
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                        {item.body}
                      </p>
                    </div>

                    {/* Severity dot */}
                    <div className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-2', s.dot)} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            Live alerts from GRN · Stock · Invoices · HR · Safety · Procurement
          </p>
        </div>
      </div>
    </>
  );
}

// Export the count hook so the bell badge stays in sync
export function useNotificationCount() {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsAPI.list().then(r => r.data),
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });
  return data?.count ?? 0;
}
