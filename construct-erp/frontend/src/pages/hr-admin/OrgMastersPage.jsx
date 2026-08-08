// src/pages/hr-admin/OrgMastersPage.jsx
// Generic master-data CRUD page, reused for Business Unit / Division / Grade / Cost Center.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Search, X } from 'lucide-react';
import { hrMastersAPI } from '../../api/client';
import toast from 'react-hot-toast';

const B = { navy: '#0A1F5C', blue: '#2563EB', yellow: '#F4C430' };
const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const ACCENT_COLORS = [
  { bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: '#3b82f6' },
  { bg: 'bg-violet-500', light: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: '#8b5cf6' },
  { bg: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: '#10b981' },
  { bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: '#f59e0b' },
];
const accent = (name) => ACCENT_COLORS[(name?.charCodeAt(0) || 0) % ACCENT_COLORS.length];
const initials = (name) => name?.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

function Modal({ title, icon: Icon, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="relative px-6 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg,#0A1F5C,#1e3a8a)` }}>
          <div className="absolute inset-0 opacity-[0.07]" style={{ background: 'radial-gradient(circle at 80% 50%,#fff,transparent 70%)' }} />
          <div className="relative z-10 flex items-center gap-2.5">
            {Icon && <Icon className="w-4 h-4 text-white/80" />}
            <h2 className="text-sm font-black text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="relative z-10 p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </motion.div>
    </div>
  );
}

/**
 * fields: [{ key, label, placeholder, type: 'text'|'number'|'select', options: [{value,label}], optional }]
 */
function RecordModal({ record, fields, title, icon, onClose, onSave, loading }) {
  const [values, setValues] = useState(() => {
    const v = {};
    fields.forEach(f => { v[f.key] = record?.[f.key] ?? ''; });
    return v;
  });
  const set = (k, val) => setValues(prev => ({ ...prev, [k]: val }));
  const requiredOk = fields.filter(f => !f.optional).every(f => String(values[f.key] || '').trim());

  return (
    <Modal title={title} icon={icon} onClose={onClose}>
      <div className="space-y-4">
        {fields.map(f => (
          <div key={f.key}>
            <label className={lbl}>{f.label}{f.optional ? ' (optional)' : ''}</label>
            {f.type === 'select' ? (
              <select className={inp} value={values[f.key] || ''} onChange={e => set(f.key, e.target.value)}>
                <option value="">— None —</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                className={inp}
                type={f.type === 'number' ? 'number' : 'text'}
                value={values[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                autoFocus={f.key === fields[0].key}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition">
          Cancel
        </button>
        <button onClick={() => requiredOk && onSave(values)} disabled={!requiredOk || loading}
          className="flex-1 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-40 transition"
          style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

function RecordRow({ record, subtitle, badge, onEdit, onDelete }) {
  const c = accent(record.name);
  return (
    <div className="flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all group">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-xl ${c.light} border ${c.border} flex items-center justify-center shrink-0`}>
          <span className={`text-xs font-black ${c.text}`}>{initials(record.name)}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-gray-900 truncate">{record.name}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {badge && <span className={`text-[10px] font-bold ${c.light} ${c.text} border ${c.border} px-2 py-0.5 rounded-full mr-1`}>{badge}</span>}
        <button onClick={() => onEdit(record)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition opacity-0 group-hover:opacity-100">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => window.confirm(`Delete "${record.name}"?`) && onDelete(record.id)}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * config: {
 *   title, subtitle, icon, listKey, listFn, createFn, updateFn, deleteFn,
 *   fields, getSubtitle(record, extra), getBadge(record), extraQueries: [{key, fn}]
 * }
 */
export default function OrgMastersPage({ config }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');

  const { data } = useQuery({ queryKey: [config.listKey], queryFn: () => config.listFn().then(r => r.data) });
  const records = data?.data || [];

  const extras = {};
  (config.extraQueries || []).forEach(eq => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data: ed } = useQuery({ queryKey: [eq.key], queryFn: () => eq.fn().then(r => r.data) });
    extras[eq.key] = ed?.data || [];
  });

  const saveMut = useMutation({
    mutationFn: (d) => (modal?.id ? config.updateFn(modal.id, d) : config.createFn(d)),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: [config.listKey] }); setModal(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  });
  const delMut = useMutation({
    mutationFn: (id) => config.deleteFn(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: [config.listKey] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  });

  const fields = typeof config.fields === 'function' ? config.fields(extras) : config.fields;
  const filtered = records.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg,#0A1F5C,#1e3a8a)`, boxShadow: '0 8px 32px rgba(10,31,92,0.2)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }} />
        <div className="relative z-10 px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <config.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">{config.title}</h1>
              <p className="text-white/55 text-sm mt-0.5">{config.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5">
              <config.icon className="w-4 h-4 text-white/70" />
              <span className="text-lg font-black text-white leading-none">{records.length}</span>
            </div>
            <button onClick={() => setModal('new')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition"
              style={{ background: B.yellow, color: B.navy }}>
              <Plus className="w-4 h-4" /> New
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div {...fade(0.08)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${config.title.toLowerCase()}…`}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
          </div>
        </div>
        <div className="p-3">
          {filtered.length > 0 ? filtered.map(r => (
            <RecordRow key={r.id} record={r}
              subtitle={config.getSubtitle ? config.getSubtitle(r) : null}
              badge={config.getBadge ? config.getBadge(r) : null}
              onEdit={setModal} onDelete={id => delMut.mutate(id)} />
          )) : (
            <div className="text-center py-16 text-gray-400">
              <config.icon className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{search ? 'No records match' : `No ${config.title.toLowerCase()} yet`}</p>
            </div>
          )}
        </div>
      </motion.div>

      {modal && (
        <RecordModal
          record={modal === 'new' ? null : modal}
          fields={fields}
          title={modal === 'new' ? `New ${config.title.slice(0, -1)}` : `Edit ${config.title.slice(0, -1)}`}
          icon={config.icon}
          loading={saveMut.isPending}
          onClose={() => setModal(null)}
          onSave={d => saveMut.mutate(d)}
        />
      )}
    </div>
  );
}
