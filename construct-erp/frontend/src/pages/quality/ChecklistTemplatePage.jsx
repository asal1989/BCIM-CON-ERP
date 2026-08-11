// src/pages/quality/ChecklistTemplatePage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  ClipboardCheck, Plus, Trash2, Save,
  CheckCircle2, X, ShieldCheck, Tag
} from 'lucide-react';
import { qualityAPI } from '../../api/client';
import toast from 'react-hot-toast';

export default function ChecklistTemplatePage() {
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['quality-checklists'],
    queryFn: () => qualityAPI.listChecklists().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { register, control, handleSubmit, reset } = useForm({
    defaultValues: {
      name: '',
      category: 'Civil',
      discipline: '',
      use_as_pre_pour: false,
      use_as_post_pour: false,
      items: [{ description: '', mandatory: true, weighting: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const createMut = useMutation({
    mutationFn: (d) => qualityAPI.createChecklist(d),
    onSuccess: () => {
      toast.success('ITP Protocol Standardized');
      reset();
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['quality-checklists'] });
    },
  });

  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-black">ITP Template Master</h1>
            <p className="text-xs text-slate-500">Inspection Test Plans · Standardized Site Checklists</p>
          </div>
        </div>
        <button
          onClick={() => { reset(); setShowForm(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> New ITP Template
        </button>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && (
          <div className="bg-white rounded-xl border border-[#e2e6ec] h-48 animate-pulse" />
        )}
        {templates?.map(tpl => (
          <div key={tpl.id} className="bg-white rounded-xl border border-[#e2e6ec] overflow-hidden flex flex-col">
            <div className="bg-[#f8f9fc] border-b border-[#e2e6ec] px-5 py-3 flex items-center justify-between">
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                {tpl.category}
              </span>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Tag className="w-3 h-3" />
                {tpl.items?.length || 0} points
              </div>
            </div>
            <div className="p-5 flex flex-col flex-1 gap-3">
              <h3 className="text-sm font-medium text-slate-900 font-medium leading-snug">{tpl.name}</h3>
              {(tpl.use_as_pre_pour || tpl.use_as_post_pour) && (
                <div className="flex items-center gap-1.5 -mt-1">
                  {tpl.use_as_pre_pour && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">PRE-POUR</span>
                  )}
                  {tpl.use_as_post_pour && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">POST-POUR</span>
                  )}
                </div>
              )}
              <div className="space-y-2 flex-1">
                {tpl.items?.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-xs text-slate-500">{item.description}</span>
                  </div>
                ))}
                {tpl.items?.length > 3 && (
                  <div className="text-xs text-slate-900 font-medium pl-5">+ {tpl.items.length - 3} more checks</div>
                )}
              </div>
            </div>
          </div>
        ))}
        {!isLoading && (!templates || templates.length === 0) && (
          <div className="col-span-full bg-white rounded-xl border border-[#e2e6ec] py-16 text-center text-sm text-slate-400">
            No ITP templates yet. Create the first one.
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[92vh]">
            {/* Modal header */}
            <div className="px-6 py-4 bg-indigo-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="w-5 h-5 text-white" />
                <span className="text-base font-medium text-white">New ITP Template</span>
              </div>
              <button onClick={() => setShowForm(false)} className="text-indigo-200 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(createMut.mutate)} className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Protocol Name</label>
                  <input
                    {...register('name', { required: true })}
                    placeholder="e.g. Slab Reinforcement Audit"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Category</label>
                  <select {...register('category', { required: true })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="Civil">Civil</option>
                    <option value="Structural">Structural</option>
                    <option value="MEP">MEP</option>
                    <option value="Finishing">Finishing</option>
                    <option value="Safety">Safety</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Discipline</label>
                <input
                  {...register('discipline')}
                  placeholder="e.g. RCC / Structural Steel"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* Pour-card usage flags */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2.5">
                  <input type="checkbox" {...register('use_as_pre_pour')} className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500" />
                  <span className="text-xs font-medium text-cyan-700">Use as Pre-Pour checklist</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2.5">
                  <input type="checkbox" {...register('use_as_post_pour')} className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500" />
                  <span className="text-xs font-medium text-cyan-700">Use as Post-Pour checklist</span>
                </label>
              </div>

              {/* Dynamic Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-700">Checklist Items</span>
                  <button
                    type="button"
                    onClick={() => append({ description: '', mandatory: true, weighting: 1 })}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Checkpoint
                  </button>
                </div>
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="bg-[#f8f9fc] border border-[#e2e6ec] rounded-lg p-3 flex gap-3 items-start group">
                      <div className="flex-1 space-y-2">
                        <input
                          {...register(`items.${index}.description`, { required: true })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                          placeholder={`Inspection point #${index + 1}…`}
                        />
                        <div className="flex items-center gap-5">
                          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500">
                            <input
                              type="checkbox"
                              {...register(`items.${index}.mandatory`)}
                              className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            Mandatory
                          </label>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>Weight:</span>
                            <input
                              type="number"
                              {...register(`items.${index}.weighting`)}
                              defaultValue={1}
                              className="w-14 border border-slate-200 rounded px-2 py-1 text-xs text-center outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-1.5 text-slate-900 font-medium hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700">Mandatory items will block RFI approval if failed on-site. Ensure weighting reflects the critical nature of the work.</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 text-slate-900 text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {createMut.isPending ? 'Saving…' : 'Finalize ITP Protocol'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
