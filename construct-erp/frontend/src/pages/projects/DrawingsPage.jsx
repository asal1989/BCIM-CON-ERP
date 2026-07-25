import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSearch, Plus, Download, Pencil, Trash2, X,
  Building2, ChevronDown, Search, ExternalLink,
} from 'lucide-react';
import { drawingAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const fmt = d => d && dayjs(d).isValid() ? dayjs(d).format('DD MMM YYYY') : '—';

const DISCIPLINES = ['Civil', 'Structural', 'Architecture', 'MEP', 'Electrical', 'Plumbing', 'Landscaping', 'Other'];
const STATUSES = [
  { value: 'issued',     label: 'Issued (IFC)', bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  { value: 'for_review', label: 'For Review',   bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  { value: 'superseded', label: 'Superseded',   bg: '#fafafa', text: '#737373', border: '#e5e5e5' },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]));

const EMPTY_FORM = { project_id: '', drawing_no: '', title: '', discipline: '', revision: 'R0', status: 'issued', file_url: '', file_name: '', issued_date: '' };

export default function DrawingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [modal, setModal] = useState(null); // null | { mode: 'add'|'edit', drawing?: {} }
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list-drawings'],
    queryFn: () => projectAPI.list({ limit: 200 }).then(r => {
      const d = r.data?.data ?? r.data ?? [];
      return Array.isArray(d) ? d : (d?.projects ?? []);
    }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: drawings = [], isLoading } = useQuery({
    queryKey: ['drawings', projectFilter, disciplineFilter],
    queryFn: () => drawingAPI.list({
      ...(projectFilter && { project_id: projectFilter }),
      ...(disciplineFilter && { discipline: disciplineFilter }),
    }).then(r => r.data?.data ?? []),
    staleTime: 60 * 1000,
  });

  const createMut = useMutation({
    mutationFn: drawingAPI.create,
    onSuccess: () => { qc.invalidateQueries(['drawings']); toast.success('Drawing added'); closeModal(); },
    onError: () => toast.error('Failed to add drawing'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => drawingAPI.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['drawings']); toast.success('Drawing updated'); closeModal(); },
    onError: () => toast.error('Failed to update drawing'),
  });
  const deleteMut = useMutation({
    mutationFn: drawingAPI.delete,
    onSuccess: () => { qc.invalidateQueries(['drawings']); toast.success('Drawing removed'); },
    onError: () => toast.error('Failed to delete drawing'),
  });

  const openAdd = () => { setForm(EMPTY_FORM); setModal({ mode: 'add' }); };
  const openEdit = (d) => { setForm({ project_id: d.project_id || '', drawing_no: d.drawing_no || '', title: d.title, discipline: d.discipline || '', revision: d.revision || '', status: d.status, file_url: d.file_url || '', file_name: d.file_name || '', issued_date: d.issued_date ? d.issued_date.slice(0, 10) : '' }); setModal({ mode: 'edit', drawing: d }); };
  const closeModal = () => setModal(null);

  const handleSubmit = () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (modal.mode === 'add') createMut.mutate(form);
    else updateMut.mutate({ id: modal.drawing.id, data: form });
  };

  const filtered = drawings.filter(d => {
    const matchTab = statusTab === 'all' || d.status === statusTab;
    const matchSearch = !search || d.title?.toLowerCase().includes(search.toLowerCase()) || d.drawing_no?.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const tabs = [
    { key: 'all',        label: 'All',         count: drawings.length },
    { key: 'issued',     label: 'Issued (IFC)', count: drawings.filter(d => d.status === 'issued').length },
    { key: 'for_review', label: 'For Review',   count: drawings.filter(d => d.status === 'for_review').length },
    { key: 'superseded', label: 'Superseded',   count: drawings.filter(d => d.status === 'superseded').length },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Projects</p>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Drawings Register</h1>
          </div>
          <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#0ea5e9', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Add Drawing
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 28px' }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#fff', borderRadius: 10, padding: 4, border: '1px solid #e2e8f0', width: 'fit-content' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setStatusTab(t.key)}
              style={{ padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: statusTab === t.key ? '#0ea5e9' : 'transparent', color: statusTab === t.key ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.label}
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: statusTab === t.key ? 'rgba(255,255,255,0.25)' : '#f1f5f9', color: statusTab === t.key ? '#fff' : '#94a3b8', fontWeight: 700 }}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drawings..."
              style={{ paddingLeft: 32, paddingRight: 14, paddingTop: 8, paddingBottom: 8, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', minWidth: 240 }} />
          </div>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#475569', background: '#fff', cursor: 'pointer', minWidth: 180 }}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={disciplineFilter} onChange={e => setDisciplineFilter(e.target.value)}
            style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#475569', background: '#fff', cursor: 'pointer' }}>
            <option value="">All Disciplines</option>
            {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} drawings</span>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div style={{ width: 28, height: 28, border: '3px solid #0ea5e9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
              <FileSearch size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: 14, margin: '0 0 4px' }}>No drawings found</p>
              <p style={{ fontSize: 12 }}>Add the first drawing using the button above</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Drawing No', 'Title', 'Project', 'Discipline', 'Rev', 'Status', 'Issued Date', 'File', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => {
                  const sc = STATUS_MAP[d.status] || STATUS_MAP.issued;
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafafa' : '#fff' }}>
                      <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#0f172a', fontWeight: 600 }}>{d.drawing_no || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#0f172a', fontWeight: 500, maxWidth: 280 }}>{d.title}</td>
                      <td style={{ padding: '11px 14px', color: '#64748b', fontSize: 12 }}>{d.project_name || '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {d.discipline ? <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>{d.discipline}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>{d.revision || '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{sc.label}</span>
                      </td>
                      <td style={{ padding: '11px 14px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(d.issued_date)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {d.file_url
                          ? <a href={d.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0ea5e9', fontSize: 12, textDecoration: 'none', fontWeight: 600 }}><ExternalLink size={12} /> View</a>
                          : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEdit(d)} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                            <Pencil size={11} /> Edit
                          </button>
                          <button onClick={() => { if (window.confirm('Delete this drawing?')) deleteMut.mutate(d.id); }}
                            style={{ padding: '4px 8px', border: '1px solid #fecdd3', borderRadius: 6, background: '#fff1f2', color: '#e11d48', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{modal.mode === 'add' ? 'Add Drawing' : 'Edit Drawing'}</h2>
              <button onClick={closeModal} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Project" full>
                <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} style={SELECT}>
                  <option value="">— Select Project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Drawing No">
                <input value={form.drawing_no} onChange={e => setForm(f => ({ ...f, drawing_no: e.target.value }))} placeholder="e.g. DRW-CIVIL-001" style={INPUT} />
              </Field>
              <Field label="Title *" full>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Drawing title / description" style={INPUT} />
              </Field>
              <Field label="Discipline">
                <select value={form.discipline} onChange={e => setForm(f => ({ ...f, discipline: e.target.value }))} style={SELECT}>
                  <option value="">— Select —</option>
                  {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Revision">
                <input value={form.revision} onChange={e => setForm(f => ({ ...f, revision: e.target.value }))} placeholder="e.g. R0, R1, Rev A" style={INPUT} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={SELECT}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Issued Date">
                <input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))} style={INPUT} />
              </Field>
              <Field label="File URL (optional)" full>
                <input value={form.file_url} onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))} placeholder="https://..." style={INPUT} />
              </Field>
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 13, color: '#475569', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (createMut.isPending || updateMut.isPending) ? 0.6 : 1 }}>
                {createMut.isPending || updateMut.isPending ? 'Saving…' : modal.mode === 'add' ? 'Add Drawing' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const INPUT = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const SELECT = { ...INPUT, cursor: 'pointer', background: '#fff' };

function Field({ label, children, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
