// src/components/layout/CommandPalette.jsx
// Global search / command palette — opens with Ctrl+K (or Cmd+K)

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, CornerDownLeft, Clock3 } from 'lucide-react';

export default function CommandPalette({ isOpen, onClose, navGroups, recentPages = [] }) {
  const navigate    = useNavigate();
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(0);
  const inputRef            = useRef(null);
  const listRef             = useRef(null);

  const allItems = useMemo(() => {
    const items = [];
    navGroups.forEach(group => {
      group.items.forEach(item => items.push({ ...item, group: group.label }));
    });
    return items;
  }, [navGroups]);

  // Returns [{label, items}] — sections for rendering
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const filtered = allItems.filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.to.toLowerCase().includes(q)
      );
      return [{ label: null, items: filtered }];
    }

    const recentItems = recentPages
      .map(r => allItems.find(i => i.to === r.to))
      .filter(Boolean);
    const recentPaths = new Set(recentItems.map(i => i.to));
    const suggestions = allItems.filter(i => !recentPaths.has(i.to)).slice(0, 10);

    const result = [];
    if (recentItems.length > 0) result.push({ label: 'Recently Visited', items: recentItems });
    result.push({ label: recentItems.length > 0 ? 'Suggestions' : null, items: suggestions });
    return result;
  }, [query, allItems, recentPages]);

  // Flat list for keyboard navigation
  const results = useMemo(() => sections.flatMap(s => s.items), [sections]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results, active]);

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
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search modules, pages, reports…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 placeholder:text-slate-400"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No matches for "<span className="font-medium text-slate-600">{query}</span>"
            </div>
          ) : (
            sections.map((section, si) => (
              <React.Fragment key={si}>
                {section.label && (
                  <div className="px-4 pt-2 pb-1 flex items-center gap-1.5" style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {section.label === 'Recently Visited' && <Clock3 className="w-3 h-3" />}
                    {section.label}
                  </div>
                )}
                {section.items.map((item) => {
                  const idx = globalIdx++;
                  const isActive = idx === active;
                  const Icon = item.icon;
                  return (
                    <button
                      key={`${item.to}-${idx}`}
                      data-idx={idx}
                      onClick={() => { navigate(item.to); onClose(); }}
                      onMouseEnter={() => setActive(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                        isActive ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
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
                      {isActive && (
                        <CornerDownLeft className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
                {!query && si < sections.length - 1 && (
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
