import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Package, Plus } from 'lucide-react';
import { clsx } from 'clsx';

export default function MaterialCombobox({ value, inventoryItems = [], onChange, onNewItem, placeholder = 'Search store ledger…' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || '');
  const ref = useRef(null);
  // Prevents the value→q sync effect from running when we just changed value ourselves,
  // which would reset the cursor position and make typing feel broken.
  const skipSyncRef = useRef(false);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync q from parent (e.g. pre-fill from MRS, editing existing PO).
  // Skipped when the change came from our own handleInputChange / handleSelect.
  useEffect(() => {
    if (skipSyncRef.current) { skipSyncRef.current = false; return; }
    setQ(value || '');
  }, [value]);

  const filtered = inventoryItems
    .filter(i => !q || i.material_name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 40);

  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const hasResults = filtered.length > 0;

  const handleSelect = (item) => {
    skipSyncRef.current = true;
    setQ(item.material_name);
    onChange(item.material_name, item.unit);
    setOpen(false);
  };

  const handleInputChange = (e) => {
    skipSyncRef.current = true;
    const v = e.target.value;
    setQ(v);
    onChange(v, '');
    setOpen(true);
  };

  const selectedItem = inventoryItems.find(i => i.material_name === value);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder={placeholder}
          className="h-9 w-full border-[#378ADD] bg-[#E6F1FB] shadow-[0_0_0_3px_rgba(55,138,221,0.15)] rounded-lg pl-8 pr-8 text-sm text-slate-900 placeholder:text-slate-500 font-medium outline-none focus:border-[#2569b3] transition-all border"
          value={q}
          onChange={handleInputChange}
          onFocus={() => { if (q.trim()) setOpen(true); }}
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => { e.preventDefault(); setOpen(o => !o); }}
          className="absolute right-0 top-0 h-full px-2 flex items-center text-slate-400 hover:text-slate-600"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      {selectedItem?.category && !open && (
        <div className="text-xs text-slate-500 px-1 mt-0.5 truncate">{selectedItem.category}</div>
      )}
      {open && (
        <div className="absolute z-[80] top-10 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-72 overflow-y-auto p-1.5">
          {!hasResults && q ? (
            <div className="px-3 py-3 text-xs text-slate-500 italic text-center">No match for "{q}" — type freely or add to store ledger</div>
          ) : !hasResults ? (
            <div className="px-3 py-3 text-xs text-slate-600 font-semibold text-center">Store ledger is empty — add items below</div>
          ) : (
            Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat} className="mb-1 last:mb-0">
                <div className="px-2.5 py-1.5 text-[11px] font-bold text-indigo-600 bg-indigo-50/70 rounded-md uppercase tracking-wider sticky top-0 flex items-center gap-1.5 mb-0.5">
                  <Package className="w-3 h-3" /> {cat}
                </div>
                {catItems.map(item => {
                  const c = parseFloat(item.closing_stock) || 0;
                  const m = parseFloat(item.min_stock) || 0;
                  const r = parseFloat(item.reorder_level) || 0;
                  const dot = c <= 0 ? 'bg-rose-500' : (m > 0 && c <= m) || (r > 0 && c <= r) ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                  <button
                    key={item.material_name}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                    className="w-full text-left px-2.5 py-2.5 rounded-lg text-sm hover:bg-indigo-50 flex items-center gap-2.5 group transition-colors"
                  >
                    <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', dot)} />
                    <span className="flex-1 min-w-0 font-semibold text-black group-hover:text-indigo-700 truncate">{item.material_name}</span>
                    <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 group-hover:bg-indigo-100 group-hover:text-indigo-600 rounded px-2 py-0.5 flex-shrink-0">{item.unit}</span>
                  </button>
                  );
                })}
              </div>
            ))
          )}
          {onNewItem && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); onNewItem(q); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm text-indigo-600 font-bold border-t border-slate-100 mt-1 pt-2.5 hover:bg-indigo-50 transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0">
                <Plus className="w-3.5 h-3.5 text-white" />
              </div>
              {q ? `Add "${q}" to store ledger` : 'Add new item to store ledger'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
