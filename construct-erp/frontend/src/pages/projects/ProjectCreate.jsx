// src/pages/projects/ProjectCreate.jsx  (create + edit – tabbed redesign)
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectAPI } from '../../api/client';
import api from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import {
  ArrowLeft, Save, Building2, ChevronRight, Image, MapPin,
  Plus, Trash2, Pencil, Home, Upload,
} from 'lucide-react';

const schema = z.object({
  project_code:         z.string().min(1, 'Required'),
  name:                 z.string().min(2, 'Required'),
  type:                 z.enum(['residential','commercial','infrastructure','industrial']),
  category:             z.string().optional(),
  client_name:          z.string().min(1, 'Required'),
  client_gstin:         z.string().optional(),
  client_pan:           z.string().optional(),
  location:             z.string().optional(),
  city:                 z.string().optional(),
  state:                z.string().optional(),
  contract_value:       z.string().optional(),
  currency:             z.string().optional(),
  award_date:           z.string().optional(),
  start_date:           z.string().optional(),
  end_date:             z.string().optional(),
  rera_number:          z.string().optional(),
  gst_type:             z.enum(['intra','inter']).optional(),
  gst_applicable:       z.string().optional(),
  business_unit:        z.string().optional(),
  company_name:         z.string().optional(),
  description:          z.string().optional(),
  notes:                z.string().optional(),
  status:               z.string().optional(),
  progress_pct:         z.string().optional(),
  project_manager_id:   z.string().optional(),
  site_engineer_id:     z.string().optional(),
  qs_engineer_id:       z.string().optional(),
});

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh',
];

const TABS = ['Basic Details', 'Additional Details', 'Financial Details', 'Notes'];

const inp = {
  base: { width: '100%', padding: '9px 12px', border: '1px solid #dbe2ea', borderRadius: 8, fontSize: 13, color: '#1e293b', outline: 'none', background: '#fff', boxSizing: 'border-box', transition: 'border-color 0.15s' },
};
const lbl = { fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 6, display: 'block' };
const err = { fontSize: 10, color: '#ef4444', marginTop: 2 };
const REQ = <span style={{ color: '#ef4444' }}> *</span>;

function F({ label, error, children, span }) {
  return (
    <div style={{ gridColumn: span === 3 ? '1 / -1' : span === 2 ? 'span 2' : undefined }}>
      {label && <label style={lbl}>{label}</label>}
      {children}
      {error && <p style={err}>{error}</p>}
    </div>
  );
}

function crore(v) {
  const n = parseFloat(v || 0);
  if (!n) return '₹0';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function timeElapsed(start, end) {
  if (!start || !end) return 0;
  const s = dayjs(start), e = dayjs(end), now = dayjs();
  const total = e.diff(s, 'day');
  if (total <= 0) return 100;
  const elapsed = now.diff(s, 'day');
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

function delayDays(end, status) {
  if (!end || status === 'completed') return 0;
  const e = dayjs(end), now = dayjs();
  return now.isAfter(e) ? now.diff(e, 'day') : 0;
}

function StatusBadge({ value, tone }) {
  const tones = {
    green:  { bg: '#dcfce7', text: '#16a34a' },
    amber:  { bg: '#fef3c7', text: '#b45309' },
    red:    { bg: '#fee2e2', text: '#dc2626' },
    blue:   { bg: '#dbeafe', text: '#2563eb' },
  };
  const c = tones[tone] || tones.blue;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: c.bg, color: c.text }}>
      {value}
    </span>
  );
}

function StatusRow({ label, value, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 13, color: '#475569' }}>{label}</span>
      <StatusBadge value={value} tone={tone} />
    </div>
  );
}

export default function ProjectCreate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [imgPreview, setImgPreview] = useState(null);

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectAPI.get(id).then(r => r.data?.data || r.data || {}),
    enabled: isEdit,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then(r => r.data?.data || r.data || []),
  });

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { gst_type: 'intra', gst_applicable: 'yes', type: 'residential', status: 'active', currency: 'INR', progress_pct: '0' },
  });

  const watchedValues = watch();

  // Project Members (Key Personnel) — separate list, independent of PM/SE/QS single-select fields
  const [members, setMembers] = useState([]);
  const [memberDraft, setMemberDraft] = useState(null); // { role, user_id } while adding/editing

  useEffect(() => {
    if (isEdit && project?.id) {
      const fmt = d => d ? d.slice(0, 10) : '';
      reset({
        project_code:       project.project_code || '',
        name:               project.name || '',
        type:               project.type || 'residential',
        category:           project.category || '',
        client_name:        project.client_name || '',
        client_gstin:       project.client_gstin || '',
        client_pan:         project.client_pan || '',
        location:           project.location || '',
        city:               project.city || '',
        state:              project.state || '',
        contract_value:     String(project.contract_value || ''),
        currency:           project.currency || 'INR',
        award_date:         fmt(project.award_date),
        start_date:         fmt(project.start_date),
        end_date:           fmt(project.end_date),
        rera_number:        project.rera_number || '',
        gst_type:           project.gst_type || 'intra',
        gst_applicable:     project.gst_applicable || 'yes',
        business_unit:      project.business_unit || '',
        company_name:       project.company_name || '',
        description:        project.description || '',
        notes:              project.notes || '',
        status:             project.status || 'active',
        progress_pct:       String(project.progress_pct || '0'),
        project_manager_id: project.project_manager_id || '',
        site_engineer_id:   project.site_engineer_id || '',
        qs_engineer_id:     project.qs_engineer_id || '',
      });
    }
  }, [project, isEdit, reset]);

  // Seed the members table from PM / SE / QS whenever those fields or the user list change
  useEffect(() => {
    if (!allUsers.length) return;
    const seeded = [
      watchedValues.project_manager_id && { role: 'Project Manager', user_id: watchedValues.project_manager_id },
      watchedValues.site_engineer_id   && { role: 'Site Engineer',   user_id: watchedValues.site_engineer_id },
      watchedValues.qs_engineer_id     && { role: 'QS Engineer',     user_id: watchedValues.qs_engineer_id },
    ].filter(Boolean);
    setMembers(prev => {
      const extra = prev.filter(m => !['Project Manager','Site Engineer','QS Engineer'].includes(m.role));
      return [...seeded, ...extra];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues.project_manager_id, watchedValues.site_engineer_id, watchedValues.qs_engineer_id, allUsers.length]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        contract_value: data.contract_value ? parseFloat(data.contract_value) : undefined,
        progress_pct:   data.progress_pct ? parseFloat(data.progress_pct) : undefined,
        project_manager_id: data.project_manager_id || null,
        site_engineer_id:   data.site_engineer_id   || null,
        qs_engineer_id:     data.qs_engineer_id     || null,
        award_date:         data.award_date || null,
      };
      return isEdit ? projectAPI.update(id, payload) : projectAPI.create(payload);
    },
    onSuccess: (res) => {
      toast.success(isEdit ? 'Project updated!' : 'Project created!');
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', id] });
      const pid = isEdit ? id : (res.data?.data?.id ?? res.data?.id);
      navigate(`/projects/${pid}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to save project'),
  });

  if (isEdit && projLoading) {
    return (
      <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
        {[1,2,3].map(n => <div key={n} style={{ height: 120, background: '#f1f5f9', borderRadius: 12, marginBottom: 12, animation: 'pulse 1.5s infinite' }} />)}
      </div>
    );
  }

  const progress  = parseFloat(watchedValues.progress_pct || 0);
  const elapsed   = timeElapsed(watchedValues.start_date, watchedValues.end_date);
  const delayD    = delayDays(watchedValues.end_date, watchedValues.status);
  const contractV = parseFloat(watchedValues.contract_value || 0);
  const spentV    = contractV * (progress / 100) * 0.9; // approximation until Accounts module wired
  const budgetUtil = contractV > 0 ? Math.min(100, Math.round((spentV / contractV) * 100)) : 0;
  const billingProgress = Math.min(100, Math.round(progress * 0.8));

  const statusTone = {
    active: 'green', planning: 'blue', delayed: 'red', on_hold: 'amber', completed: 'green',
  }[watchedValues.status] || 'blue';

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImgPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const addMemberRow = () => {
    setMemberDraft({ role: '', user_id: '', isNew: true, idx: members.length });
    setMembers(prev => [...prev, { role: '', user_id: '' }]);
  };
  const removeMemberRow = (idx) => {
    setMembers(prev => prev.filter((_, i) => i !== idx));
    if (memberDraft?.idx === idx) setMemberDraft(null);
  };
  const updateMemberRow = (idx, field, value) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9' }}>
      {/* Breadcrumb / title bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Project Master</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#94a3b8' }}>
              <Home size={12} />
              <span style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>Home</span>
              <ChevronRight size={12} />
              <span style={{ cursor: 'pointer' }} onClick={() => navigate('/projects')}>Projects</span>
              <ChevronRight size={12} />
              <span style={{ fontWeight: 600, color: '#334155' }}>Project Master</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1px solid #dbe2ea', borderRadius: 8, background: '#fff', fontSize: 13, color: '#475569', cursor: 'pointer', fontWeight: 600 }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              type="button"
              onClick={() => reset()}
              style={{ padding: '9px 16px', border: '1px solid #dbe2ea', borderRadius: 8, background: '#fff', fontSize: 13, color: '#475569', cursor: 'pointer', fontWeight: 600 }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => navigate('/projects/new')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, background: '#2563eb', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              <Plus size={14} /> New Project
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(mutation.mutate)}>
        <div style={{ padding: '20px 28px', maxWidth: 1440, margin: '0 auto' }}>

          {/* Project Information card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            <div style={{ padding: '16px 22px 0' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Project Information</h2>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid #e2e8f0' }}>
                {TABS.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(i)}
                    style={{
                      padding: '0 0 10px', border: 'none', borderBottom: tab === i ? '2px solid #2563eb' : '2px solid transparent',
                      background: 'none', fontSize: 13.5, fontWeight: tab === i ? 700 : 500,
                      color: tab === i ? '#2563eb' : '#64748b', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, padding: 22, alignItems: 'start' }}>

              {/* Form fields */}
              <div>
                {tab === 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <F label={<>Project Code{REQ}</>} error={errors.project_code?.message}>
                      <input {...register('project_code')} style={inp.base} placeholder="PRJ-2025-001" disabled={isEdit} />
                    </F>
                    <F label={<>Project Name{REQ}</>} error={errors.name?.message}>
                      <input {...register('name')} style={inp.base} placeholder="e.g. BCIM Commercial Complex" />
                    </F>
                    <F label={<>Client{REQ}</>} error={errors.client_name?.message}>
                      <input {...register('client_name')} style={inp.base} placeholder="Client Name" />
                    </F>

                    <F label={<>Project Type{REQ}</>} error={errors.type?.message}>
                      <select {...register('type')} style={inp.base}>
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                        <option value="infrastructure">Infrastructure</option>
                        <option value="industrial">Industrial</option>
                      </select>
                    </F>
                    <F label="Project Category">
                      <select {...register('category')} style={inp.base}>
                        <option value="">Select Category</option>
                        <option value="building">Building</option>
                        <option value="apartment">Apartment</option>
                        <option value="villa">Villa / Row House</option>
                        <option value="plotted">Plotted Development</option>
                        <option value="township">Township</option>
                        <option value="mall">Mall / Retail</option>
                        <option value="office">Office / IT Park</option>
                        <option value="hotel">Hotel / Hospitality</option>
                        <option value="road">Road / Highway</option>
                        <option value="bridge">Bridge</option>
                        <option value="factory">Factory / Industrial</option>
                        <option value="other">Other</option>
                      </select>
                    </F>
                    <F label={<>Project Location{REQ}</>} error={errors.location?.message}>
                      <div style={{ position: 'relative' }}>
                        <input {...register('location')} style={{ ...inp.base, paddingRight: 34 }} placeholder="Bengaluru, Karnataka, India" />
                        <MapPin size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      </div>
                    </F>

                    <F label={<>Contract Value (₹){REQ}</>} error={errors.contract_value?.message}>
                      <input {...register('contract_value')} type="number" style={{ ...inp.base, fontFamily: 'monospace' }} placeholder="125000000.00" />
                    </F>
                    <F label={<>Currency{REQ}</>}>
                      <select {...register('currency')} style={inp.base}>
                        <option value="INR">INR - Indian Rupee</option>
                        <option value="USD">USD - US Dollar</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="AED">AED - UAE Dirham</option>
                      </select>
                    </F>
                    <F label="Award Date">
                      <input {...register('award_date')} type="date" style={inp.base} />
                    </F>

                    <F label={<>Project Manager{REQ}</>}>
                      <select {...register('project_manager_id')} style={inp.base}>
                        <option value="">— Select —</option>
                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </select>
                    </F>
                    <F label="Site Engineer">
                      <select {...register('site_engineer_id')} style={inp.base}>
                        <option value="">— Select —</option>
                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </select>
                    </F>
                    <F label={<>Start Date{REQ}</>}>
                      <input {...register('start_date')} type="date" style={inp.base} />
                    </F>

                    <F label="Business Unit">
                      <select {...register('business_unit')} style={inp.base}>
                        <option value="">Select Business Unit</option>
                        <option value="Residential Division">Residential Division</option>
                        <option value="Commercial Division">Commercial Division</option>
                        <option value="Infrastructure">Infrastructure</option>
                        <option value="Industrial">Industrial</option>
                      </select>
                    </F>
                    <F label="GST Applicable">
                      <select {...register('gst_applicable')} style={inp.base}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </F>
                    <F label={<>End Date{REQ}</>}>
                      <input {...register('end_date')} type="date" style={inp.base} />
                    </F>

                    <F label="Description" span={2}>
                      <textarea {...register('description')} style={{ ...inp.base, resize: 'vertical', minHeight: 70 }} placeholder="Construction of Commercial Complex with Basement + G + 10 Floors." />
                    </F>
                    <F label={<>Status{REQ}</>}>
                      <select {...register('status')} style={inp.base}>
                        <option value="planning">Planning</option>
                        <option value="active">Active</option>
                        <option value="delayed">Delayed</option>
                        <option value="on_hold">On Hold</option>
                        <option value="completed">Completed</option>
                      </select>
                    </F>

                    <F label={<>Company{REQ}</>}>
                      <input {...register('company_name')} style={inp.base} placeholder="BCIM Engineering Pvt Ltd" />
                    </F>
                    {isEdit && (
                      <F label="Progress (%)">
                        <input {...register('progress_pct')} type="number" min="0" max="100" step="0.1" style={{ ...inp.base, fontFamily: 'monospace' }} />
                      </F>
                    )}
                  </div>
                )}

                {tab === 1 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <F label="City" error={errors.city?.message}>
                      <input {...register('city')} style={inp.base} placeholder="Bangalore" />
                    </F>
                    <F label="State" error={errors.state?.message}>
                      <select {...register('state')} style={inp.base}>
                        <option value="">Select State</option>
                        {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </F>
                    <F label="GST Type">
                      <select {...register('gst_type')} style={inp.base}>
                        <option value="intra">Intra-state (CGST + SGST)</option>
                        <option value="inter">Inter-state (IGST)</option>
                      </select>
                    </F>
                    <F label="RERA / MahaRERA Number">
                      <input {...register('rera_number')} style={{ ...inp.base, fontFamily: 'monospace', textTransform: 'uppercase' }} placeholder="P52100054321" />
                    </F>
                    <F label="Client GSTIN">
                      <input {...register('client_gstin')} style={{ ...inp.base, fontFamily: 'monospace', textTransform: 'uppercase' }} placeholder="27AABCS1234C1Z5" maxLength={15} />
                    </F>
                    <F label="Client PAN">
                      <input {...register('client_pan')} style={{ ...inp.base, fontFamily: 'monospace', textTransform: 'uppercase' }} placeholder="AABCS1234C" maxLength={10} />
                    </F>
                    <F label="QS / Quantity Surveyor">
                      <select {...register('qs_engineer_id')} style={inp.base}>
                        <option value="">— Select —</option>
                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </select>
                    </F>
                  </div>
                )}

                {tab === 2 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div style={{ gridColumn: '1/-1', padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contract Value</p>
                      <p style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>{crore(watchedValues.contract_value)}</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>{watchedValues.currency || 'INR'}</p>
                    </div>
                    <F label="Award Date">
                      <input {...register('award_date')} type="date" style={inp.base} />
                    </F>
                    <F label="Start Date">
                      <input {...register('start_date')} type="date" style={inp.base} />
                    </F>
                    <F label="End Date">
                      <input {...register('end_date')} type="date" style={inp.base} />
                    </F>
                    {isEdit && (
                      <>
                        <div style={{ gridColumn: '1/-1', borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                          <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>Project Progress</p>
                        </div>
                        <F label="Overall Progress (%)">
                          <input {...register('progress_pct')} type="number" min="0" max="100" step="0.1" style={{ ...inp.base, fontFamily: 'monospace' }} />
                        </F>
                      </>
                    )}
                  </div>
                )}

                {tab === 3 && (
                  <div>
                    <F label="Project Notes / Remarks">
                      <textarea
                        {...register('notes')}
                        style={{ ...inp.base, resize: 'vertical', minHeight: 180 }}
                        placeholder="Add any notes, special conditions, client remarks, or scope clarifications here..."
                      />
                    </F>
                  </div>
                )}
              </div>

              {/* RIGHT PANEL */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Project Image */}
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: '0 0 10px' }}>Project Image</p>
                  <div style={{ height: 150, borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {imgPreview ? (
                      <img src={imgPreview} alt="Project" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Image size={28} color="#cbd5e1" />
                    )}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, padding: '8px 14px', border: '1px solid #dbe2ea', borderRadius: 8, background: '#fff', fontSize: 12.5, color: '#2563eb', fontWeight: 700, cursor: 'pointer' }}>
                    <Upload size={13} /> Change Image
                    <input type="file" accept="image/*" onChange={handleImagePick} style={{ display: 'none' }} />
                  </label>
                </div>

                {/* Project Status */}
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: '0 0 6px' }}>Project Status</p>
                  <StatusRow label="Overall Progress" value={`${Math.round(progress)}%`} tone={progress >= 70 ? 'green' : progress >= 30 ? 'blue' : 'amber'} />
                  <StatusRow label="Time Elapsed" value={`${elapsed}%`} tone="blue" />
                  <StatusRow label="Delay (Days)" value={delayD} tone={delayD > 0 ? 'red' : 'green'} />
                  <StatusRow label="Budget Utilization" value={`${budgetUtil}%`} tone={budgetUtil >= 90 ? 'red' : budgetUtil >= 70 ? 'amber' : 'green'} />
                  <div style={{ borderBottom: 'none' }}>
                    <StatusRow label="Billing Progress" value={`${billingProgress}%`} tone="blue" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Project Members (Key Personnel) — full width table */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 22px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Project Members (Key Personnel)</h2>
              <button
                type="button"
                onClick={addMemberRow}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#2563eb', border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                <Plus size={13} /> Add Member
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    {['S.No', 'Role', 'Name', 'Department', 'Email', 'Phone', 'Action'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => {
                    const u = allUsers.find(x => x.id === m.user_id);
                    const editing = memberDraft?.idx === i;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px', color: '#64748b' }}>{i + 1}</td>
                        <td style={{ padding: '10px' }}>
                          {editing ? (
                            <input
                              value={m.role}
                              onChange={e => updateMemberRow(i, 'role', e.target.value)}
                              style={{ ...inp.base, padding: '6px 8px', fontSize: 12 }}
                              placeholder="Role"
                            />
                          ) : (
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{m.role || '—'}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {editing ? (
                            <select
                              value={m.user_id}
                              onChange={e => updateMemberRow(i, 'user_id', e.target.value)}
                              style={{ ...inp.base, padding: '6px 8px', fontSize: 12 }}
                            >
                              <option value="">— Select —</option>
                              {allUsers.map(usr => <option key={usr.id} value={usr.id}>{usr.name || usr.email}</option>)}
                            </select>
                          ) : (
                            u?.name || u?.email || '—'
                          )}
                        </td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{u?.department || '—'}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{u?.email || '—'}</td>
                        <td style={{ padding: '10px', color: '#64748b' }}>{u?.phone || '—'}</td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => setMemberDraft(editing ? null : { idx: i })}
                              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #dbeafe', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeMemberRow(i)}
                              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fecdd3', background: '#fff1f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {members.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 13 }}>No members added yet. Assign a Project Manager above or click "Add Member".</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Save strip */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 24 }}>
            <button type="button" onClick={() => navigate(-1)} style={{ padding: '10px 20px', border: '1px solid #dbe2ea', borderRadius: 8, background: '#fff', fontSize: 13.5, color: '#475569', cursor: 'pointer', fontWeight: 600 }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 24px', borderRadius: 8, background: '#2563eb', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: mutation.isPending ? 0.6 : 1 }}
            >
              <Save size={14} />
              {mutation.isPending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Project')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
