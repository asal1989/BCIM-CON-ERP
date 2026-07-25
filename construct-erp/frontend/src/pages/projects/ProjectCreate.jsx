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
  ArrowLeft, Save, Building2, ChevronRight, Image, TrendingUp,
  Clock, AlertTriangle, IndianRupee, Users, Plus, Trash2, User,
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
  base: { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, color: '#0f172a', outline: 'none', background: '#fff', boxSizing: 'border-box', transition: 'border-color 0.15s' },
};
const lbl = { fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' };
const err = { fontSize: 10, color: '#ef4444', marginTop: 2 };

function F({ label, error, children, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? '1 / -1' : undefined }}>
      {label && <label style={lbl}>{label}</label>}
      {children}
      {error && <p style={err}>{error}</p>}
    </div>
  );
}

function crore(v) {
  const n = parseFloat(v || 0);
  if (!n) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
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

function ProgressRow({ label, value, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: color, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

export default function ProjectCreate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);

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
      <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
        {[1,2,3].map(n => <div key={n} style={{ height: 120, background: '#f1f5f9', borderRadius: 12, marginBottom: 12, animation: 'pulse 1.5s infinite' }} />)}
      </div>
    );
  }

  // Project Status panel computed values
  const progress  = parseFloat(watchedValues.progress_pct || 0);
  const elapsed   = timeElapsed(watchedValues.start_date, watchedValues.end_date);
  const delayD    = delayDays(watchedValues.end_date, watchedValues.status);
  const pmUser    = allUsers.find(u => u.id === watchedValues.project_manager_id);
  const seUser    = allUsers.find(u => u.id === watchedValues.site_engineer_id);
  const qsUser    = allUsers.find(u => u.id === watchedValues.qs_engineer_id);

  const teamMembers = [
    pmUser && { role: 'Project Manager', user: pmUser, field: 'project_manager_id' },
    seUser && { role: 'Site Engineer',   user: seUser, field: 'site_engineer_id' },
    qsUser && { role: 'QS Engineer',     user: qsUser, field: 'qs_engineer_id' },
  ].filter(Boolean);

  const statusColor = {
    active: '#22c55e', planning: '#3b82f6', delayed: '#ef4444', on_hold: '#94a3b8', completed: '#14b8a6',
  }[watchedValues.status] || '#3b82f6';

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Breadcrumb bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
            <span style={{ cursor: 'pointer', color: '#64748b' }} onClick={() => navigate('/projects')}>Projects</span>
            <ChevronRight size={13} />
            <span style={{ cursor: 'pointer', color: '#64748b' }} onClick={() => navigate('/projects')}>Project Master</span>
            <ChevronRight size={13} />
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{isEdit ? (project?.name || 'Edit Project') : 'New Project'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', fontSize: 12, color: '#475569', cursor: 'pointer', fontWeight: 600 }}
            >
              <ArrowLeft size={13} /> Back
            </button>
            {!isEdit && (
              <button
                type="button"
                onClick={() => reset()}
                style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', fontSize: 12, color: '#475569', cursor: 'pointer', fontWeight: 600 }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(mutation.mutate)}>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

            {/* LEFT: Tabbed form */}
            <div>
              {/* Tab Header */}
              <div style={{ background: '#fff', borderRadius: '12px 12px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none', display: 'flex' }}>
                {TABS.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(i)}
                    style={{
                      flex: 1, padding: '12px 8px', border: 'none', borderBottom: tab === i ? '2px solid #0ea5e9' : '2px solid transparent',
                      background: 'none', fontSize: 12, fontWeight: tab === i ? 700 : 600,
                      color: tab === i ? '#0ea5e9' : '#94a3b8', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Tab Body */}
              <div style={{ background: '#fff', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', padding: 20 }}>

                {/* TAB 0: Basic Details */}
                {tab === 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <F label="Project Code *" error={errors.project_code?.message}>
                      <input {...register('project_code')} style={inp.base} placeholder="PRJ-001" disabled={isEdit} />
                    </F>
                    <F label="Project Name *" error={errors.name?.message} span={2}>
                      <input {...register('name')} style={{ ...inp.base, gridColumn: '1/-1' }} placeholder="e.g. Skyline Heights — 2B+G+18 Tower" />
                    </F>
                    <F label="Client *" error={errors.client_name?.message}>
                      <input {...register('client_name')} style={inp.base} placeholder="Client Name" />
                    </F>
                    <F label="Project Type *" error={errors.type?.message}>
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
                    <F label="Project Location" error={errors.location?.message}>
                      <input {...register('location')} style={inp.base} placeholder="Site address" />
                    </F>
                    <F label="Contract Value">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select {...register('currency')} style={{ ...inp.base, width: 80, flexShrink: 0 }}>
                          <option value="INR">INR</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="AED">AED</option>
                        </select>
                        <input {...register('contract_value')} type="number" style={inp.base} placeholder="85000000" />
                      </div>
                    </F>
                    <F label="Award Date">
                      <input {...register('award_date')} type="date" style={inp.base} />
                    </F>
                    <F label="Project Manager">
                      <select {...register('project_manager_id')} style={inp.base}>
                        <option value="">— None —</option>
                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </select>
                    </F>
                    <F label="Site Engineer">
                      <select {...register('site_engineer_id')} style={inp.base}>
                        <option value="">— None —</option>
                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </select>
                    </F>
                    <F label="Start Date">
                      <input {...register('start_date')} type="date" style={inp.base} />
                    </F>
                    <F label="Business Unit">
                      <input {...register('business_unit')} style={inp.base} placeholder="e.g. Residential Division" />
                    </F>
                    <F label="GST Applicable">
                      <select {...register('gst_applicable')} style={inp.base}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </F>
                    <F label="End Date">
                      <input {...register('end_date')} type="date" style={inp.base} />
                    </F>
                    <F label="Status">
                      <select {...register('status')} style={inp.base}>
                        <option value="planning">Planning</option>
                        <option value="active">Active</option>
                        <option value="delayed">Delayed</option>
                        <option value="on_hold">On Hold</option>
                        <option value="completed">Completed</option>
                      </select>
                    </F>
                    {isEdit && (
                      <F label="Progress (%)">
                        <input {...register('progress_pct')} type="number" min="0" max="100" step="0.1" style={{ ...inp.base, fontFamily: 'monospace' }} placeholder="0" />
                      </F>
                    )}
                    <F label="Description" span={2}>
                      <textarea {...register('description')} style={{ ...inp.base, resize: 'vertical', minHeight: 72 }} placeholder="Brief project scope and details..." />
                    </F>
                  </div>
                )}

                {/* TAB 1: Additional Details */}
                {tab === 1 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                        <option value="">— None —</option>
                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </select>
                    </F>
                  </div>
                )}

                {/* TAB 2: Financial Details */}
                {tab === 2 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div style={{ gridColumn: '1/-1', padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contract Value</p>
                      <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{crore(watchedValues.contract_value)}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0' }}>{watchedValues.currency || 'INR'}</p>
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
                    <F label="Currency">
                      <select {...register('currency')} style={inp.base}>
                        <option value="INR">INR — Indian Rupee</option>
                        <option value="USD">USD — US Dollar</option>
                        <option value="EUR">EUR — Euro</option>
                        <option value="AED">AED — UAE Dirham</option>
                      </select>
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
                    <div style={{ gridColumn: '1/-1', borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Financial summary for this project is available in the Accounts module.</p>
                    </div>
                  </div>
                )}

                {/* TAB 3: Notes */}
                {tab === 3 && (
                  <div>
                    <F label="Project Notes / Remarks">
                      <textarea
                        {...register('notes')}
                        style={{ ...inp.base, resize: 'vertical', minHeight: 180 }}
                        placeholder="Add any notes, special conditions, client remarks, or scope clarifications here..."
                      />
                    </F>
                    <div style={{ marginTop: 16, padding: '12px 14px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                      <p style={{ fontSize: 11, color: '#92400e', margin: 0, fontWeight: 600 }}>Note: For detailed project notes and document attachments, use the Documents section under this project.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Save button strip */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" onClick={() => navigate(-1)} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 13, color: '#475569', cursor: 'pointer', fontWeight: 600 }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px', borderRadius: 8, background: '#0ea5e9', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: mutation.isPending ? 0.6 : 1 }}
                >
                  <Save size={14} />
                  {mutation.isPending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Project')}
                </button>
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Project Image */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Project Image</p>
                <div style={{ height: 140, background: '#f8fafc', borderRadius: 8, border: '2px dashed #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Image size={20} color="#3b82f6" />
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Click to upload</span>
                  <span style={{ fontSize: 10, color: '#cbd5e1' }}>PNG, JPG up to 5MB</span>
                </div>
              </div>

              {/* Project Status */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Project Status</p>
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: statusColor + '18', color: statusColor }}>
                    {(watchedValues.status || 'planning').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>

                <ProgressRow label="Overall Progress" value={Math.round(progress)} color="#0ea5e9" />
                <ProgressRow label="Time Elapsed" value={elapsed} color="#f59e0b" />

                {/* Delay + Budget as stat tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: delayD > 0 ? '#fff1f2' : '#f0fdf4', border: `1px solid ${delayD > 0 ? '#fecdd3' : '#bbf7d0'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <AlertTriangle size={11} color={delayD > 0 ? '#ef4444' : '#22c55e'} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: delayD > 0 ? '#ef4444' : '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Delay</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: delayD > 0 ? '#be123c' : '#15803d' }}>{delayD}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>days</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <IndianRupee size={11} color="#8b5cf6" />
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contract</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{crore(watchedValues.contract_value)}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{watchedValues.currency || 'INR'}</div>
                  </div>
                </div>

                {/* Key dates */}
                {(watchedValues.start_date || watchedValues.end_date) && (
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                    {watchedValues.start_date && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={10} /> Start Date
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{dayjs(watchedValues.start_date).format('DD MMM YYYY')}</span>
                      </div>
                    )}
                    {watchedValues.end_date && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <TrendingUp size={10} /> End Date
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: delayD > 0 ? '#ef4444' : '#475569' }}>{dayjs(watchedValues.end_date).format('DD MMM YYYY')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Project Members */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Project Members</p>
                  <Users size={14} color="#94a3b8" />
                </div>
                {teamMembers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8' }}>
                    <User size={24} style={{ margin: '0 auto 6px', opacity: 0.4 }} />
                    <p style={{ fontSize: 11, margin: 0 }}>Assign team in Basic Details tab</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {teamMembers.map(m => (
                      <div key={m.field} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#f8fafc' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={14} color="#3b82f6" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.user.name || m.user.email}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{m.role}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setValue(m.field, '')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2 }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {teamMembers.length < 3 && (
                  <button
                    type="button"
                    onClick={() => setTab(0)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', marginTop: 8, padding: '7px 10px', borderRadius: 7, border: '1px dashed #e2e8f0', background: 'none', fontSize: 11, color: '#94a3b8', cursor: 'pointer', justifyContent: 'center', fontWeight: 600 }}
                  >
                    <Plus size={12} /> Add Member
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
