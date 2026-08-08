// src/pages/hr-admin/onboarding/id-card/CardTemplatesPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LayoutTemplate, ArrowLeft, Plus, Trash2, Star } from 'lucide-react';
import { hrIdCardAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

const CARD_TYPES = ['corporate', 'site', 'visitor', 'contractor', 'temporary', 'labour', 'consultant'];
const THEMES = ['blue', 'dark', 'white'];
const SIZES = ['CR80', 'A6', 'custom'];
const FRONT_FIELDS = ['company_logo', 'employee_photo', 'employee_name', 'employee_id', 'designation', 'department', 'project', 'blood_group', 'qr_code', 'company_address'];
const BACK_FIELDS = ['emergency_contact', 'company_contact', 'issue_date', 'expiry_date', 'terms', 'barcode', 'signature', 'security_strip'];

function TemplateForm({ template, onClose, onSaved }) {
  const [form, setForm] = useState(template || { name: '', card_type: 'corporate', card_size: 'CR80', theme: 'blue', front_config: { fields: FRONT_FIELDS.slice(0, 6) }, back_config: { fields: BACK_FIELDS.slice(0, 4) }, is_default: false });
  const isEdit = !!template?.id;

  const mut = useMutation({
    mutationFn: () => isEdit ? hrIdCardAPI.updateTemplate(template.id, form) : hrIdCardAPI.createTemplate(form),
    onSuccess: () => { toast.success(isEdit ? 'Template updated' : 'Template created'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const toggleField = (side, field) => setForm(prev => {
    const key = side === 'front' ? 'front_config' : 'back_config';
    const fields = prev[key]?.fields || [];
    const next = fields.includes(field) ? fields.filter(f => f !== field) : [...fields, field];
    return { ...prev, [key]: { ...prev[key], fields: next } };
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-gray-900 mb-4">{isEdit ? 'Edit' : 'New'} Card Template</h3>
        <div className="space-y-3">
          <input placeholder="Template name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          <div className="flex gap-2">
            <select value={form.card_type} onChange={e => setForm(p => ({ ...p, card_type: e.target.value }))} className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
              {CARD_TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>
            <select value={form.card_size} onChange={e => setForm(p => ({ ...p, card_size: e.target.value }))} className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
              {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={form.theme} onChange={e => setForm(p => ({ ...p, theme: e.target.value }))} className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
              {THEMES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">Front Side Fields</p>
            <div className="flex flex-wrap gap-1.5">
              {FRONT_FIELDS.map(f => (
                <button key={f} onClick={() => toggleField('front', f)}
                  className="text-[11px] font-bold px-2 py-1 rounded-full"
                  style={(form.front_config?.fields || []).includes(f) ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
                  {f.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">Back Side Fields</p>
            <div className="flex flex-wrap gap-1.5">
              {BACK_FIELDS.map(f => (
                <button key={f} onClick={() => toggleField('back', f)}
                  className="text-[11px] font-bold px-2 py-1 rounded-full"
                  style={(form.back_config?.fields || []).includes(f) ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
                  {f.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.is_default} onChange={e => setForm(p => ({ ...p, is_default: e.target.checked }))} /> Set as default template
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button disabled={!form.name || mut.isPending} onClick={() => mut.mutate()} className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>Save Template</button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-500">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function CardTemplatesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['idcard-templates'], queryFn: () => hrIdCardAPI.templates().then(r => r.data.data) });
  const delMut = useMutation({
    mutationFn: (id) => hrIdCardAPI.deleteTemplate(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['idcard-templates'] }); },
  });
  const refetch = () => qc.invalidateQueries({ queryKey: ['idcard-templates'] });
  const templates = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><LayoutTemplate className="w-5 h-5" style={{ color: B.blue }} /></div>
          <div><h1 className="text-xl font-black text-gray-900">Card Templates</h1><p className="text-xs text-gray-400">Corporate, site, visitor, contractor and more</p></div>
        </div>
        <button onClick={() => setCreating(true)} className="text-sm font-bold px-4 py-2.5 rounded-xl text-white flex items-center gap-2" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <Plus className="w-4 h-4" /> New Template
        </button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
        {!isLoading && templates.length === 0 && <p className="text-sm text-gray-400">No templates yet — create one to get started.</p>}
        {templates.map((t, i) => (
          <motion.div key={t.id} {...fade(0.05 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">{t.name} {t.is_default && <Star className="w-3.5 h-3.5" style={{ color: B.yellow }} fill={B.yellow} />}</p>
                <p className="text-xs text-gray-400">{t.card_type} · {t.card_size} · {t.theme}</p>
              </div>
              <button onClick={() => delMut.mutate(t.id)}><Trash2 className="w-4 h-4 text-gray-300 hover:text-red-500" /></button>
            </div>
            <button onClick={() => setEditing(t)} className="w-full text-xs font-bold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 mt-2">Edit</button>
          </motion.div>
        ))}
      </div>

      {creating && <TemplateForm onClose={() => setCreating(false)} onSaved={refetch} />}
      {editing && <TemplateForm template={editing} onClose={() => setEditing(null)} onSaved={refetch} />}
    </div>
  );
}
