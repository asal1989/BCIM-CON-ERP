// src/components/layout/CommandPalette.jsx
// Global search / command palette — opens with Ctrl+K (or Cmd+K)
// Searches both nav pages AND live ERP records (vendors, projects, POs, bills, employees, etc.)

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, CornerDownLeft, Clock3, Loader2 } from 'lucide-react';
import api from '../../api/client';

// ── Type metadata (badge colour + label) ──────────────────────────────────────
const TYPE_META = {
  vendor:    { label: 'Vendor',    bg: '#DCFCE7', text: '#15803D' },
  project:   { label: 'Project',   bg: '#DBEAFE', text: '#1D4ED8' },
  po:        { label: 'PO',        bg: '#FEF3C7', text: '#B45309' },
  bill:      { label: 'Bill',      bg: '#EDE9FE', text: '#6D28D9' },
  employee:  { label: 'Employee',  bg: '#CFFAFE', text: '#0E7490' },
  ign:       { label: 'IGN',       bg: '#FEF9C3', text: '#A16207' },
  min:       { label: 'MIN',       bg: '#FEE2E2', text: '#B91C1C' },
  variation: { label: 'VO',        bg: '#E0E7FF', text: '#4338CA' },
  ra:        { label: 'RA Bill',   bg: '#FCE7F3', text: '#BE185D' },
  equipment: { label: 'Equipment', bg: '#F1F5F9', text: '#475569' },
  asset:     { label: 'Asset',     bg: '#FEF3C7', text: '#92400E' },
};

const STATUS_DOT = {
  approved: '#22C55E', active: '#22C55E', issued: '#22C55E', paid: '#3B82F6',
  pending: '#F59E0B', draft: '#94A3B8', inspected: '#F59E0B',
  rejected: '#EF4444', cancelled: '#EF4444', disposed: '#EF4444',
};

export default function CommandPalette({ isOpen, onClose, navGroups, recentPages = [] }) {
  const navigate    = useNavigate();
  const [query, setQuery]           = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [active, setActive]         = useState(0);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  // Debounce the query for API calls (300 ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // ── Live record search ───────────────────────────────────────────────────────
  const { data: recordHits = [], isFetching } = useQuery({
    queryKey: ['global-search', debouncedQ],
    queryFn: () =>
      api.get('/search', { params: { q: debouncedQ } }).then(r => r.data.data || []),
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
    placeholderData: [],
  });

  // ── Nav-item search (existing behaviour) ────────────────────────────────────
  const allNavItems = useMemo(() => {
    const items = [];
    navGroups.forEach(group => {
      group.items.forEach(item => items.push({ ...item, group: group.label }));
    });
    return items;
  }, [navGroups]);

  // ── Flat list of ALL items for keyboard navigation ───────────────────────────
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = [];

    // Records section (only when typing ≥ 2 chars)
    if (q.length >= 2 && recordHits.length > 0) {
      result.push({ label: 'Records', items: recordHits, kind: 'record' });
    }

    // Pages section
    if (q) {
      const filtered = allNavItems.filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.to.toLowerCase().includes(q)
      );
      if (filtered.length > 0) result.push({ label: q.length >= 2 ? 'Pages' : null, items: filtered, kind: 'nav' });
    } else {
      const recentItems = recentPages
        .map(r => allNavItems.find(i => i.to === r.to))
        .filter(Boolean);
      const recentPaths = new Set(recentItems.map(i => i.to));
      const suggestions = allNavItems.filter(i => !recentPaths.has(i.to)).slice(0, 10);
      if (recentItems.length > 0) result.push({ label: 'Recently Visited', items: recentItems, kind: 'nav' });
      result.push({ label: recentItems.length > 0 ? 'Suggestions' : null, items: suggestions, kind: 'nav' });
    }
    return result;
  }, [query, recordHits, allNavItems, recentPages]);

  const results = useMemo(() => sections.flatMap(s => s.items), [sections]);

  // ── Reset on open ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDebouncedQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results, active]);

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[active];
        if (item) { navigate(item.to); onClose(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, results, active, navigate, onClose]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!isOpen) return null;

  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4"
      style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          {isFetching
            ? <Loader2 className="w-4 h-4 text-blue-400 flex-shrink-0 animate-spin" />
            : <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search modules, vendors, POs, employees…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 placeholder:text-slate-400"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setActive(0); }}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition ml-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[460px] overflow-y-auto py-2">
          {/* Loading placeholder */}
          {isFetching && debouncedQ.length >= 2 && recordHits.length === 0 && (
            <div className="px-4 py-3 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Searching records…
            </div>
          )}

          {results.length === 0 && !isFetching ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              {query.length >= 2
                ? <>No matches for "<span className="font-medium text-slate-600">{query}</span>"</>
                : 'Start typing to search…'
              }
            </div>
          ) : (
            sections.map((section, si) => (
              <React.Fragment key={si}>
                {section.label && (
                  <div className="px-4 pt-2 pb-1 flex items-center gap-1.5" style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {section.label === 'Recently Visited' && <Clock3 className="w-3 h-3" />}
                    {section.label}
                    {section.kind === 'record' && (
                      <span style={{ fontSize: 9, background: '#EFF6FF', color: '#3B82F6', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>
                        {section.items.length} found
                      </span>
                    )}
                  </div>
                )}

                {section.items.map((item) => {
                  const idx     = globalIdx++;
                  const isActive = idx === active;

                  // ── Record result row ───────────────────────────────────────
                  if (section.kind === 'record') {
                    const meta   = TYPE_META[item.type] || { label: item.type, bg: '#F1F5F9', text: '#475569' };
                    const dotClr = STATUS_DOT[item.status?.toLowerCase()] || null;
                    return (
                      <button
                        key={`rec-${idx}`}
                        data-idx={idx}
                        onClick={() => { navigate(item.to); onClose(); }}
                        onMouseEnter={() => setActive(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${isActive ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        {/* Type badge */}
                        <span style={{ background: meta.bg, color: meta.text, fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '2px 7px', flexShrink: 0, letterSpacing: '0.03em' }}>
                          {meta.label}
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${isActive ? 'text-blue-900' : 'text-slate-800'}`}>
                            {item.label}
                          </div>
                          {item.sub && (
                            <div className="text-xs text-slate-400 truncate">{item.sub}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {dotClr && item.status && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: dotClr }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotClr, display: 'inline-block' }} />
                              {item.status}
                            </span>
                          )}
                          {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-blue-400" />}
                        </div>
                      </button>
                    );
                  }

                  // ── Nav page result row (existing style) ────────────────────
                  const Icon = item.icon;
                  return (
                    <button
                      key={`nav-${item.to}-${idx}`}
                      data-idx={idx}
                      onClick={() => { navigate(item.to); onClose(); }}
                      onMouseEnter={() => setActive(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${isActive ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    >
                      {Icon && (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-blue-100' : 'bg-slate-100'}`}>
                          <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${isActive ? 'text-blue-900' : 'text-slate-800'}`}>
                          {item.label}
                        </div>
                        <div className="text-xs text-slate-400">{item.group}</div>
                      </div>
                      {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                    </button>
                  );
                })}

                {si < sections.length - 1 && (
                  <div style={{ height: 1, background: '#F1F5F9', margin: '4px 16px' }} />
                )}
              </React.Fragment>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono">
                <CornerDownLeft className="w-2.5 h-2.5 inline" />
              </kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono">esc</kbd>
              close
            </span>
          </div>
          <span className="text-slate-400">{results.length} result{results.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
