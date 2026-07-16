// src/pages/hr-admin/compliance/ComplianceForm.jsx
// Large "Add Compliance" modal — react-hook-form, full field set, Save /
// Save & Continue / Cancel.
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { X, UploadCloud, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  COMPLIANCE_TYPES, DEPARTMENTS, LOCATIONS, PRIORITIES, RENEWAL_FREQUENCIES,
} from './complianceData';

const inp = 'w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-shadow';
const lbl = 'text-xs font-semibold text-slate-600 block mb-1.5';
const err = 'text-[11px] text-red-500 mt-1';

export default function ComplianceForm({ open, onClose, onSave }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { priority: 'Medium', renewalFrequency: 'Annual', reminderDays: 15 },
  });

  const submit = (keepOpen) => handleSubmit((values) => {
    onSave(values);
    toast.success(`Compliance "${values.name}" saved`);
    reset();
    if (!keepOpen) onClose();
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden">

            <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100"
              style={{ background: 'linear-gradient(135deg,#EFF6FF,#ffffff)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Add Compliance</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Register a statutory, license or internal compliance item</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[62vh] overflow-y-auto">
              <div className="md:col-span-2">
                <label className={lbl}>Compliance Name *</label>
                <input {...register('name', { required: 'Required' })} className={inp} placeholder="e.g. PF Monthly Return (ECR)" />
                {errors.name && <p className={err}>{errors.name.message}</p>}
              </div>
              <div>
                <label className={lbl}>Compliance Code</label>
                <input {...register('code')} className={inp} placeholder="Auto e.g. CMP-2026-016" />
              </div>
              <div>
                <label className={lbl}>Category *</label>
                <select {...register('category', { required: 'Required' })} className={inp}>
                  <option value="">Select…</option>
                  {['Statutory', 'License', 'Legal', 'Audit', 'Insurance', 'Vendor', 'Welfare'].map(c => <option key={c}>{c}</option>)}
                </select>
                {errors.category && <p className={err}>{errors.category.message}</p>}
              </div>
              <div>
                <label className={lbl}>Compliance Type *</label>
                <select {...register('type', { required: 'Required' })} className={inp}>
                  <option value="">Select…</option>
                  {COMPLIANCE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                {errors.type && <p className={err}>{errors.type.message}</p>}
              </div>
              <div>
                <label className={lbl}>Department</label>
                <select {...register('department')} className={inp}>
                  <option value="">Select…</option>
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Location</label>
                <select {...register('location')} className={inp}>
                  <option value="">Select…</option>
                  {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Applicable Employees</label>
                <select {...register('applicableTo')} className={inp}>
                  {['All Employees', 'Site Workers', 'Contract Workers', 'Head Office', 'Construction Staff', 'Subcontractors'].map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Effective Date</label>
                <input type="date" {...register('effectiveDate')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Due Date *</label>
                <input type="date" {...register('dueDate', { required: 'Required' })} className={inp} />
                {errors.dueDate && <p className={err}>{errors.dueDate.message}</p>}
              </div>
              <div>
                <label className={lbl}>Renewal Frequency</label>
                <select {...register('renewalFrequency')} className={inp}>
                  {RENEWAL_FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Priority</label>
                <select {...register('priority')} className={inp}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Responsible Person *</label>
                <input {...register('owner', { required: 'Required' })} className={inp} placeholder="Owner name" />
                {errors.owner && <p className={err}>{errors.owner.message}</p>}
              </div>
              <div>
                <label className={lbl}>Reminder (days before due)</label>
                <input type="number" min="0" {...register('reminderDays')} className={inp} />
              </div>
              <div className="md:col-span-3">
                <label className={lbl}>Description</label>
                <textarea {...register('description')} rows={3}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-y"
                  placeholder="What this compliance covers, scope, and notes…" />
              </div>
              <div className="md:col-span-3">
                <label className={lbl}>Upload Documents</label>
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl py-8 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
                  <UploadCloud className="w-7 h-7 text-slate-300" />
                  <span className="text-sm text-slate-500"><span className="text-blue-600 font-semibold">Click to upload</span> or drag and drop</span>
                  <span className="text-xs text-slate-400">PDF, JPG, XLSX up to 10 MB</span>
                  <input type="file" multiple className="hidden" {...register('files')} />
                </label>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button onClick={onClose}
                className="h-10 px-4 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button onClick={submit(true)}
                className="h-10 px-4 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors">
                Save &amp; Continue
              </button>
              <button onClick={submit(false)}
                className="h-10 px-5 rounded-xl text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                style={{ background: '#2563EB', boxShadow: '0 4px 14px rgba(37,99,235,.30)' }}>
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
