import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { FIELD_HL } from '../../constants/fieldStyles';

/**
 * Searchable replacement for a native <select>, styled to match MaterialCombobox.
 * options: [{ value, label, sublabel? }]
 */
export default function SearchableSelect({ value, options = [], onChange, placeholder = 'Select…', searchPlaceholder = 'Search…', className }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(''); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => String(o.value) === String(value));

  const filtered = !q
    ? options
    : options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()) || (o.sublabel || '').toLowerCase().includes(q.toLowerCase()));

  const handleSelect = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setQ('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'h-10 w-full rounded-lg pl-3 pr-8 text-sm font-medium outline-none transition-all border text-left truncate',
          selected ? 'text-slate-900' : 'text-slate-500',
          FIELD_HL,
          className,
        )}
      >
        {selected ? selected.label : placeholder}
      </button>
      <ChevronDown className={clsx('absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none transition-transform', open && 'rotate-180')} />
      {open && (
        <div className="absolute z-[80] top-[calc(100%+6px)] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/5 overflow-hidden">
          <div className="relative p-2 border-b border-slate-100 bg-slate-50/60">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              autoFocus
              placeholder={searchPlaceholder}
              className="h-9 w-full border border-slate-200 bg-white rounded-lg pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/15 transition-all"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="ss-scroll max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-xs text-slate-500 italic text-center">No match for "{q}"</div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                return (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 text-sm flex items-center gap-3 group transition-colors',
                    idx !== filtered.length - 1 && 'border-b border-slate-50',
                    isSelected ? 'bg-indigo-50/80' : 'hover:bg-slate-50',
                  )}
                >
                  <span className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-colors',
                    isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600',
                  )}>
                    {opt.label.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={clsx('block font-semibold truncate', isSelected ? 'text-indigo-700' : 'text-slate-800 group-hover:text-indigo-700')}>{opt.label}</span>
                    {opt.sublabel && <span className="block text-[11px] text-slate-500 truncate">{opt.sublabel}</span>}
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                </button>
                );
              })
            )}
          </div>
          {filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/60">
              {filtered.length} {filtered.length === 1 ? 'option' : 'options'}
            </div>
          )}
          <style>{`
            .ss-scroll::-webkit-scrollbar { width: 8px; }
            .ss-scroll::-webkit-scrollbar-track { background: transparent; }
            .ss-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
            .ss-scroll::-webkit-scrollbar-thumb:hover { background: #378ADD; background-clip: content-box; }
            .ss-scroll { scrollbar-width: thin; scrollbar-color: #e2e8f0 transparent; }
          `}</style>
        </div>
      )}
    </div>
  );
}
