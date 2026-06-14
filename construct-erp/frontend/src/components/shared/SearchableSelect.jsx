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
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      {open && (
        <div className="absolute z-[80] top-11 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-80 overflow-y-auto p-1.5">
          <div className="relative mb-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              autoFocus
              placeholder={searchPlaceholder}
              className="h-9 w-full border border-slate-200 bg-slate-50 rounded-lg pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-500 font-medium outline-none focus:border-[#378ADD] focus:bg-white transition-all"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500 italic text-center">No match for "{q}"</div>
          ) : (
            filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                className="w-full text-left px-2.5 py-2.5 rounded-lg text-sm hover:bg-indigo-50 flex items-center gap-2.5 group transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-slate-800 group-hover:text-indigo-700 truncate">{opt.label}</span>
                  {opt.sublabel && <span className="block text-[11px] text-slate-500 truncate">{opt.sublabel}</span>}
                </span>
                {String(opt.value) === String(value) && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
