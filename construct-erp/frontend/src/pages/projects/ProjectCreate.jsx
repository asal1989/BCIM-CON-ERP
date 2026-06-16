// src/pages/projects/ProjectCreate.jsx  (create + edit)
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectAPI } from '../../api/client';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { ArrowLeft, Save, Building2, MapPin, Briefcase, IndianRupee, Users, Activity, ChevronRight } from 'lucide-react';

const schema = z.object({
  project_code:         z.string().min(3, 'Project code is required'),
  name:                 z.string().min(3, 'Project name is required'),
  type:                 z.enum(['residential','commercial','infrastructure','industrial']),
  client_name:          z.string().min(2, 'Client name is required'),
  client_gstin:         z.string().optional(),
  client_pan:           z.string().optional(),
  location:             z.string().min(3, 'Location is required'),
  city:                 z.string().min(2, 'City is required'),
  state:                z.string().min(2, 'State is required'),
  contract_value:       z.string().min(1, 'Contract value is required'),
  start_date:           z.string().min(1, 'Start date is required'),
  end_date:             z.string().min(1, 'End date is required'),
  rera_number:          z.string().optional(),
  gst_type:             z.enum(['intra','inter']),
  description:          z.string().optional(),
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

const inputCls = 'w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 font-medium outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition';
const labelCls = 'block text-xs font-medium text-slate-900 mb-1';
const errorCls = 'mt-1 text-xs text-red-500';

function Field({ label, error, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {error && <p className={errorCls}>{error}</p>}
    </div>
  );
}

function Section({ icon: Icon, color, title, children }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className={`flex items-center gap-3 border-b border-gray-100 px-5 py-4 ${color}`}>
        <Icon className="h-4 w-4" />
        <h2 className="text-sm font-medium text-gray-800">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

export default function ProjectCreate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const qc = useQueryClient();

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectAPI.get(id).then(r => r.data?.data || r.data || {}),
    enabled: isEdit,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then(r => r.data?.data || r.data || []),
  });

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { gst_type: 'intra', type: 'residential', status: 'active' },
  });

  React.useEffect(() => {
    if (isEdit && project?.id) {
      const fmt = (d) => d ? d.slice(0, 10) : '';
      reset({
        project_code:       project.project_code || '',
        name:               project.name || '',
        type:               project.type || 'residential',
        client_name:        project.client_name || '',
        client_gstin:       project.client_gstin || '',
        client_pan:         project.client_pan || '',
        location:           project.location || '',
        city:               project.city || '',
        state:              project.state || '',
        contract_value:     String(project.contract_value || ''),
        start_date:         fmt(project.start_date),
        end_date:           fmt(project.end_date),
        rera_number:        project.rera_number || '',
        gst_type:           project.gst_type || 'intra',
        description:        project.description || '',
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
        contract_value: parseFloat(data.contract_value),
        progress_pct:   data.progress_pct ? parseFloat(data.progress_pct) : undefined,
        project_manager_id: data.project_manager_id || null,
        site_engineer_id:   data.site_engineer_id   || null,
        qs_engineer_id:     data.qs_engineer_id     || null,
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

  const projectType = watch('type');

  if (isEdit && projLoading) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          {[1,2,3,4].map(n => <div key={n} className="h-40 bg-gray-200 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Overview</span>
          <ChevronRight className="h-4 w-4" />
          <span className="cursor-pointer hover:text-blue-600" onClick={() => navigate('/projects')}>Projects</span>
          <ChevronRight className="h-4 w-4" />
          {isEdit && project?.name && (
            <>
              <span className="cursor-pointer hover:text-blue-600" onClick={() => navigate(`/projects/${id}`)}>{project.name}</span>
              <ChevronRight className="h-4 w-4" />
            </>
          )}
          <span className="font-medium text-gray-800">{isEdit ? 'Edit Project' : 'New Project'}</span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-5 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-slate-900 hover:text-blue-600 transition">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-medium text-gray-900">{isEdit ? 'Edit Project' : 'New Project'}</h1>
            <p className="text-xs text-gray-400">{isEdit ? 'Update project details and team' : 'Fill in the details to create a new project'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(mutation.mutate)} className="space-y-4">

          {/* 1. Project Details */}
          <Section icon={Building2} color="bg-blue-50 text-blue-600" title="Project Details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Project Code *" error={errors.project_code?.message}>
                <input {...register('project_code')} className={inputCls} placeholder="PRJ-001" disabled={isEdit} />
              </Field>
              <Field label="Project Type *" error={errors.type?.message}>
                <select {...register('type')} className={inputCls}>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="infrastructure">Infrastructure</option>
                  <option value="industrial">Industrial</option>
                </select>
              </Field>
            </div>
            <Field label="Project Name *" error={errors.name?.message}>
              <input {...register('name')} className={inputCls} placeholder="e.g. Skyline Heights — 2B+G+18 Tower" />
            </Field>
            <Field label="Project Description">
              <textarea {...register('description')} className={inputCls + ' resize-none'} rows={2} placeholder="Brief project scope and description..." />
            </Field>
            {isEdit && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Status">
                  <select {...register('status')} className={inputCls}>
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="delayed">Delayed</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                  </select>
                </Field>
                <Field label="Progress (%)">
                  <input {...register('progress_pct')} type="number" min="0" max="100" step="0.1" className={inputCls + ' font-mono'} placeholder="0" />
                </Field>
              </div>
            )}
          </Section>

          {/* 2. Client Details */}
          <Section icon={Briefcase} color="bg-indigo-50 text-indigo-600" title="Client Details">
            <Field label="Client Name *" error={errors.client_name?.message}>
              <input {...register('client_name')} className={inputCls} placeholder="e.g. DQS Developers Pvt Ltd" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Client GSTIN">
                <input {...register('client_gstin')} className={inputCls + ' font-mono uppercase'} placeholder="27AABCS1234C1Z5" maxLength={15} />
              </Field>
              <Field label="Client PAN">
                <input {...register('client_pan')} className={inputCls + ' font-mono uppercase'} placeholder="AABCS1234C" maxLength={10} />
              </Field>
            </div>
          </Section>

          {/* 3. Location & Compliance */}
          <Section icon={MapPin} color="bg-green-50 text-green-600" title="Location & Compliance">
            <Field label="Site Address *" error={errors.location?.message}>
              <input {...register('location')} className={inputCls} placeholder="Plot No., Street, Area" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City *" error={errors.city?.message}>
                <input {...register('city')} className={inputCls} placeholder="Bangalore" />
              </Field>
              <Field label="State *" error={errors.state?.message}>
                <select {...register('state')} className={inputCls}>
                  <option value="">Select State</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="GST Type *">
                <select {...register('gst_type')} className={inputCls}>
                  <option value="intra">Intra-state (CGST + SGST)</option>
                  <option value="inter">Inter-state (IGST)</option>
                </select>
              </Field>
              {projectType === 'residential' && (
                <Field label="RERA / MahaRERA Number">
                  <input {...register('rera_number')} className={inputCls + ' font-mono uppercase'} placeholder="P52100054321" />
                </Field>
              )}
            </div>
          </Section>

          {/* 4. Financial & Timeline */}
          <Section icon={IndianRupee} color="bg-amber-50 text-amber-600" title="Financial & Timeline">
            <Field label="Contract Value (₹) *" error={errors.contract_value?.message}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                <input {...register('contract_value')} type="number" className={inputCls + ' pl-7 font-mono'} placeholder="85000000" />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start Date *" error={errors.start_date?.message}>
                <input {...register('start_date')} type="date" className={inputCls} />
              </Field>
              <Field label="End Date *" error={errors.end_date?.message}>
                <input {...register('end_date')} type="date" className={inputCls} />
              </Field>
            </div>
          </Section>

          {/* 5. Project Team */}
          {allUsers.length > 0 && (
            <Section icon={Users} color="bg-purple-50 text-purple-600" title="Project Team">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Project Manager">
                  <select {...register('project_manager_id')} className={inputCls}>
                    <option value="">— None —</option>
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Site Engineer">
                  <select {...register('site_engineer_id')} className={inputCls}>
                    <option value="">— None —</option>
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </Field>
                <Field label="QS / Quantity Surveyor">
                  <select {...register('qs_engineer_id')} className={inputCls}>
                    <option value="">— None —</option>
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </Section>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)} className="rounded border border-gray-200 bg-white px-5 py-2 text-sm text-slate-900 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Project')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
