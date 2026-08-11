import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Plus, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { FIELD_HL } from '../../constants/fieldStyles';

/**
 * Searchable replacement for a native <select>, styled to match MaterialCombobox.
 * options: [{ value, label, sublabel? }]
 * footerLabel: plural noun shown in the footer count, e.g. "vendors" (default "options")
 * onAddNew: optional async (name) => void — shows a "+ Add new …" action that lets the
 *   user type a name and create a new option inline (e.g. add a new vendor)
 * addNewLabel: label for the add-new action, e.g. "vendor" (default "item")
 */
export default function SearchableSelect({ value, options = [], onChange, placeholder = 'Select…', searchPlaceholder = 'Search…', className, footerLabel = 'options', onAddNew, addNewLabel = 'item' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(''); setAdding(false); setNewName(''); } };
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

  const handleAddNew = async () => {
    const name = newName.trim();
    if (!name || !onAddNew) return;
    setSaving(true);
    try {
      await onAddNew(name);
      setAdding(false);
      setNewName('');
      setQ('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
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
                    <span className={clsx('block font-semibold truncate', isSelected ? 'text-indigo-700' : 'text-black group-hover:text-indigo-700')}>{opt.label}</span>
                    {opt.sublabel && <span className="block text-[11px] text-slate-500 truncate">{opt.sublabel}</span>}
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                </button>
                );
              })
            )}
          </div>
          {(filtered.length > 0 || onAddNew) && (
            <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
              {filtered.length > 0 && (
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {filtered.length} {footerLabel}
                </span>
              )}
              {onAddNew && !adding && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setAdding(true); setNewName(q); }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#378ADD] hover:text-[#2569b3] transition-colors ml-auto"
                >
                  <Plus className="w-3 h-3" /> Add new {addNewLabel}
                </button>
              )}
            </div>
          )}
          {onAddNew && adding && (
            <div className="p-2 border-t border-slate-100 bg-white flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                placeholder={`New ${addNewLabel} name…`}
                className="h-8 flex-1 border border-slate-200 bg-white rounded-lg px-2.5 text-xs text-slate-900 placeholder:text-slate-400 font-medium outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/15 transition-all"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNew(); } if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
              />
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleAddNew(); }}
                disabled={saving || !newName.trim()}
                className="h-8 px-3 rounded-lg bg-[#378ADD] text-white text-xs font-bold disabled:opacity-50 hover:bg-[#2569b3] transition-colors inline-flex items-center gap-1"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setAdding(false); setNewName(''); }}
                className="h-8 px-2 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
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
