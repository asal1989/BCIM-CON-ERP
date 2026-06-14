import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Plus, X, Loader2, Store } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * Professional vendor dropdown for the procurement module.
 * options: [{ value, label, sublabel? }]  — sublabel is the vendor category/type,
 * used both for the muted subtitle text and to color-code the avatar circle.
 *
 * onAddNew: optional async (name) => void — shows a "+ Add new vendor" footer
 *   action that lets the user type a name and create a vendor inline.
 */

// Category → avatar color mapping (keyword match against the vendor type / sublabel)
const CATEGORY_COLORS = [
  { match: /civil/i,                    bg: '#EEEDFE', fg: '#534AB7' },  // purple
  { match: /waterproof/i,               bg: '#E3F8F6', fg: '#0F9C93' },  // teal
  { match: /material/i,                 bg: '#FEF3DA', fg: '#B8790A' },  // amber
  { match: /furniture/i,                bg: '#FDE8E4', fg: '#E15B43' },  // coral
  { match: /mep|electrical|plumbing/i,  bg: '#E2EDFE', fg: '#2569B3' },  // blue
  { match: /steel/i,                    bg: '#FCE4E4', fg: '#C0392B' },  // red
  { match: /paint/i,                    bg: '#EEF1F4', fg: '#64748B' },  // gray
];
const DEFAULT_COLOR = { bg: '#EEF1F4', fg: '#64748B' };

function categoryColor(sublabel) {
  if (!sublabel) return DEFAULT_COLOR;
  const found = CATEGORY_COLORS.find(c => c.match.test(sublabel));
  return found || DEFAULT_COLOR;
}

export default function VendorSelect({
  value, options = [], onChange,
  placeholder = 'Select vendor…', searchPlaceholder = 'Search vendors…',
  className, footerLabel = 'vendors', onAddNew, addNewLabel = 'vendor',
}) {
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
    <div ref={ref} className="vs-root relative">
      <style>{`
        .vs-root {
          --vs-primary: #534AB7;
          --vs-primary-soft: #EEEDFE;
          --vs-text: #0f172a;
          --vs-text-muted: #64748b;
          --vs-placeholder: #94a3b8;
          --vs-border: rgba(15, 23, 42, 0.12);
          --vs-bg: #ffffff;
          --vs-bg-hover: #f8fafc;
        }
        @media (prefers-color-scheme: dark) {
          .vs-root {
            --vs-primary: #8b80f5;
            --vs-primary-soft: rgba(83, 74, 183, 0.18);
            --vs-text: #e2e8f0;
            --vs-text-muted: #94a3b8;
            --vs-placeholder: #64748b;
            --vs-border: rgba(255, 255, 255, 0.12);
            --vs-bg: #1e293b;
            --vs-bg-hover: #273349;
          }
        }
        .vs-scroll { scrollbar-width: thin; scrollbar-color: var(--vs-primary) var(--vs-primary-soft); }
        .vs-scroll::-webkit-scrollbar { width: 8px; }
        .vs-scroll::-webkit-scrollbar-track { background: var(--vs-primary-soft); border-radius: 8px; }
        .vs-scroll::-webkit-scrollbar-thumb { background: var(--vs-primary); border-radius: 8px; }
        .vs-scroll::-webkit-scrollbar-thumb:hover { background: #423a99; }
      `}</style>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'h-10 w-full rounded-md pl-9 pr-8 text-sm font-bold outline-none transition-colors border text-left truncate',
          'bg-[var(--vs-bg)]',
          open ? 'border-[var(--vs-primary)] ring-1 ring-[var(--vs-primary)]/20' : 'border-[var(--vs-border)]',
          className,
        )}
        style={{ color: selected ? 'var(--vs-text)' : 'var(--vs-placeholder)', fontWeight: selected ? 700 : 400 }}
      >
        {selected ? selected.label : placeholder}
      </button>
      <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--vs-text-muted)' }} />
      <ChevronDown
        className={clsx('absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none transition-transform', open && 'rotate-180')}
        style={{ color: 'var(--vs-text-muted)' }}
      />

      {open && (
        <div
          className="absolute z-[80] top-[calc(100%+6px)] left-0 right-0 rounded-lg overflow-hidden border"
          style={{ background: 'var(--vs-bg)', borderColor: 'var(--vs-border)', borderWidth: '0.5px' }}
        >
          {/* Search bar */}
          <div className="relative p-2 border-b" style={{ borderColor: 'var(--vs-border)', borderBottomWidth: '0.5px' }}>
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--vs-text-muted)' }} />
            <input
              type="text"
              autoFocus
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-md pl-8 pr-8 text-sm outline-none transition-colors border"
              style={{
                background: 'var(--vs-bg)',
                borderColor: 'var(--vs-border)', borderWidth: '0.5px',
                color: 'var(--vs-text)', fontWeight: 700,
              }}
              value={q}
              onChange={e => setQ(e.target.value)}
              onFocus={e => { e.target.style.borderColor = 'var(--vs-primary)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--vs-border)'; }}
            />
            {q && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setQ(''); }}
                className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full"
                style={{ color: 'var(--vs-text-muted)' }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Vendor list */}
          <div className="vs-scroll max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-xs italic text-center" style={{ color: 'var(--vs-text-muted)' }}>No match for "{q}"</div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                const color = categoryColor(opt.sublabel);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                    className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-3 transition-colors border-b last:border-b-0"
                    style={{
                      borderColor: 'var(--vs-border)', borderBottomWidth: idx !== filtered.length - 1 ? '0.5px' : 0,
                      background: isSelected ? 'var(--vs-primary-soft)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--vs-bg-hover)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ background: color.bg, color: color.fg }}
                    >
                      {opt.label.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold truncate" style={{ color: isSelected ? 'var(--vs-primary)' : 'var(--vs-text)' }}>{opt.label}</span>
                      {opt.sublabel && <span className="block text-[11px] truncate font-normal" style={{ color: 'var(--vs-text-muted)' }}>{opt.sublabel}</span>}
                    </span>
                    {isSelected && <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--vs-primary)' }} />}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--vs-border)', borderTopWidth: '0.5px' }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--vs-text-muted)' }}>
              {filtered.length} {footerLabel}
            </span>
            {onAddNew && !adding && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setAdding(true); setNewName(q); }}
                className="inline-flex items-center gap-1 text-[11px] font-bold transition-colors"
                style={{ color: 'var(--vs-primary)' }}
              >
                <Plus className="w-3 h-3" /> Add new {addNewLabel}
              </button>
            )}
          </div>
          {onAddNew && adding && (
            <div className="p-2 border-t flex items-center gap-1.5" style={{ borderColor: 'var(--vs-border)', borderTopWidth: '0.5px' }}>
              <input
                type="text"
                autoFocus
                placeholder={`New ${addNewLabel} name…`}
                className="h-8 flex-1 rounded-md px-2.5 text-xs font-bold outline-none border"
                style={{ background: 'var(--vs-bg)', borderColor: 'var(--vs-border)', borderWidth: '0.5px', color: 'var(--vs-text)' }}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNew(); } if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
              />
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleAddNew(); }}
                disabled={saving || !newName.trim()}
                className="h-8 px-3 rounded-md text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1"
                style={{ background: 'var(--vs-primary)' }}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setAdding(false); setNewName(''); }}
                className="h-8 px-2 rounded-md text-xs font-bold transition-colors"
                style={{ color: 'var(--vs-text-muted)' }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
