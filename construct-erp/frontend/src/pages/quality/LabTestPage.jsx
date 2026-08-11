// src/pages/quality/LabTestPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Microscope, Plus, X, MapPin, Calendar,
  CheckCircle2, XCircle, Clock, AlertTriangle,
  FlaskConical, TrendingUp, Search, Download
} from 'lucide-react';
import { qualityAPI, projectAPI } from '../../api/client';
import AttachmentPanel from '../../components/quality/AttachmentPanel';
import QAQCDocPicker from '../../components/quality/QAQCDocPicker';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const STAT_CFG = [
  { key: 'total',   label: 'Total Samples',    icon: FlaskConical,   iconBg: 'bg-indigo-500', iconRing: 'bg-indigo-50' },
  { key: 'pass',    label: 'Pass Rate (%)',     icon: TrendingUp,     iconBg: 'bg-emerald-500', iconRing: 'bg-emerald-50' },
  { key: 'pending', label: 'Pending Results',  icon: Clock,          iconBg: 'bg-amber-500',  iconRing: 'bg-amber-50'  },
  { key: 'failed',  label: 'Critical Failures', icon: AlertTriangle,  iconBg: 'bg-red-500',    iconRing: 'bg-red-50'    },
];

function ResultBadge({ status }) {
  const s = status || 'pending';
  const cls = {
    pass:    'bg-emerald-50 text-emerald-700 border-emerald-200',
    fail:    'bg-red-50 text-red-700 border-red-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
  }[s] ?? 'bg-amber-50 text-amber-700 border-amber-200';
  const Icon = s === 'pass' ? CheckCircle2 : s === 'fail' ? XCircle : Clock;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-2.5 py-1 rounded-full border ${cls}`}>
      <Icon className="w-3 h-3" />{s}
    </span>
  );
}

export default function LabTestPage() {
  const [showForm, setShowForm] = useState(false);
  const [newAttachments, setNewAttachments] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const { register, handleSubmit, reset } = useForm();

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ['quality-lab'],
    queryFn: () => qualityAPI.listLabTests().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r?.data;
      return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(r) ? r : []));
    }).catch(() => []),
  });

  const createMut = useMutation({
    mutationFn: (d) => qualityAPI.createLabTest({ ...d, attachments: newAttachments }),
    onSuccess: () => {
      toast.success('Lab sample recorded');
      reset();
      setShowForm(false);
      setNewAttachments([]);
      qc.invalidateQueries({ queryKey: ['quality-lab'] });
    },
    onError: () => toast.error('Failed to record sample'),
  });

  const attachMut = useMutation({
    mutationFn: ({ id, attachments }) => qualityAPI.updateLabTestAttachments(id, attachments),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['quality-lab'] });
      setSelectedTest(prev => prev ? { ...prev, attachments: vars.attachments } : prev);
      toast.success('Attachments saved');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => qualityAPI.updateLabTest(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['quality-lab'] });
      setSelectedTest(prev => prev ? { ...prev, ...res.data?.data } : prev);
      const chain = res.data?.chain;
      if (chain?.failed) toast.error(`Cube failed — NCR auto-created: ${chain.ncrId}`);
      else if (chain?.evaluated) toast.success('Result saved — all certs verified!');
      else toast.success('Result updated');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const arr = Array.isArray(tests) ? tests : [];
  const filtered = arr.filter(t =>
    !search ||
    (t.test_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.material_type || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.project_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const passCount = arr.filter(t => t.result_status === 'pass').length;
  const failCount = arr.filter(t => t.result_status === 'fail').length;
  const pendingCount = arr.filter(t => !t.result_status || t.result_status === 'pending').length;
  const passRate = arr.length > 0 ? Math.round((passCount / arr.length) * 100) : 0;
  const statVals = { total: arr.length, pass: `${passRate}%`, pending: pendingCount, failed: failCount };

  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Microscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-black">Material Lab Certifications</h1>
            <p className="text-xs text-slate-500">Concrete · Steel · Soil · Aggregates</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Lab Sample
        </button>
      </div>

      {/* Vendor NABL Certificates from DMS */}
      <QAQCDocPicker
        docType="certificate"
        title="Approved Lab Vendor Certificates (NABL, GST, MSME)"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CFG.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.key} className="bg-white rounded-xl border border-[#e2e6ec] p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.iconRing}`}>
                <Icon className={`w-6 h-6 ${s.iconBg.replace('bg-', 'text-')}`} />
              </div>
              <div>
                <div className="text-2xl font-medium text-black">{statVals[s.key]}</div>
                <div className="text-xs text-slate-900 font-medium mt-0.5">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by serial, material, project…"
          className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#e2e6ec] overflow-hidden">
        <div className="bg-[#f8f9fc] border-b border-[#e2e6ec] px-5 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Lab Test Records</span>
          <span className="text-xs text-slate-500">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <table className="w-full">
          <thead className="bg-[#f8f9fc] border-b border-slate-100">
            <tr>
              {['#', 'Test Number', 'Project', 'Material Type', 'Test Name', 'Lab', 'Sample Location', '7-Day', '28-Day', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400">Loading…</td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400">No lab samples recorded yet</td>
              </tr>
            )}
            {filtered.map((t, i) => (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs font-medium text-slate-700">{t.test_number || '—'}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{t.project_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full capitalize">
                    {t.material_type || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{t.test_name || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{t.lab_name || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-sm text-slate-600">
                    <MapPin className="w-3 h-3 text-slate-400" />{t.sample_location || '—'}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 text-center">
                  {t.result_7day != null ? (
                    <span className="font-medium">{t.result_7day} <span className="text-xs text-slate-400">MPa</span></span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  {t.result_28day != null ? (
                    <span className={`text-sm font-semibold ${t.is_failed ? 'text-red-600' : 'text-emerald-600'}`}>
                      {t.result_28day} <span className="text-xs font-normal text-slate-400">MPa</span>
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <ResultBadge status={t.result_status} />
                    {t.is_failed && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">AUTO-NCR</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      title="View attachments"
                      onClick={() => setSelectedTest(t)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Attachments Detail Modal */}
      {selectedTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[85vh]">
            <div className="px-6 py-4 bg-indigo-600 flex items-center justify-between">
              <div>
                <span className="text-base font-medium text-white">Lab Test Attachments</span>
                <p className="text-xs text-indigo-200 mt-0.5">{selectedTest.test_number} — {selectedTest.material_type}</p>
              </div>
              <button onClick={() => setSelectedTest(null)} className="text-indigo-200 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-4 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Test Name</p>
                  <p className="text-sm font-medium text-black">{selectedTest.test_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Lab</p>
                  <p className="text-sm font-medium text-black">{selectedTest.lab_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <ResultBadge status={selectedTest.result_status} />
                    {selectedTest.is_failed && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">AUTO-NCR</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Target Strength</p>
                  <p className="text-sm font-medium text-black">{selectedTest.target_strength ? `${selectedTest.target_strength} MPa` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">7-Day Result</p>
                  <p className={`text-sm font-semibold ${selectedTest.result_7day != null ? 'text-black' : 'text-slate-400'}`}>
                    {selectedTest.result_7day != null ? `${selectedTest.result_7day} MPa` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">28-Day Result</p>
                  <p className={`text-sm font-semibold ${selectedTest.is_failed ? 'text-red-600' : selectedTest.result_28day != null ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {selectedTest.result_28day != null ? `${selectedTest.result_28day} MPa` : '—'}
                  </p>
                </div>
              </div>

              {/* Enter 7-day / 28-day results */}
              {!selectedTest.is_failed && (
                <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-indigo-700">Enter Strength Results</p>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">7-Day (MPa)</label>
                      <input type="number" step="0.01"
                        defaultValue={selectedTest.result_7day ?? ''}
                        id={`r7_${selectedTest.id}`}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">28-Day (MPa)</label>
                      <input type="number" step="0.01"
                        defaultValue={selectedTest.result_28day ?? ''}
                        id={`r28_${selectedTest.id}`}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
                    </div>
                    <button
                      disabled={updateMut.isPending}
                      onClick={() => {
                        const r7  = parseFloat(document.getElementById(`r7_${selectedTest.id}`)?.value);
                        const r28 = parseFloat(document.getElementById(`r28_${selectedTest.id}`)?.value);
                        const payload = { id: selectedTest.id };
                        if (!isNaN(r7))  { payload.result_7day  = r7; }
                        if (!isNaN(r28)) { payload.result_28day = r28; payload.result_status = 'pending'; }
                        updateMut.mutate(payload);
                      }}
                      className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg disabled:opacity-60">
                      {updateMut.isPending ? 'Saving…' : 'Save Results'}
                    </button>
                  </div>
                </div>
              )}
              <AttachmentPanel
                attachments={selectedTest?.attachments || []}
                onUpdate={(atts) => attachMut.mutate({ id: selectedTest.id, attachments: atts })}
                label="Test Certificates & Reports"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[92vh]">
            {/* Modal header */}
            <div className="px-6 py-4 bg-indigo-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Microscope className="w-5 h-5 text-white" />
                <span className="text-base font-medium text-white">New Lab Sample</span>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="text-indigo-200 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(createMut.mutate)} className="p-6 flex flex-col gap-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Project</label>
                  <select {...register('project_id', { required: true })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Material Type</label>
                  <select {...register('material_type', { required: true })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="Concrete">Concrete</option>
                    <option value="Steel">Steel</option>
                    <option value="Soil">Soil</option>
                    <option value="Aggregates">Aggregates</option>
                    <option value="Brick">Brick</option>
                    <option value="Sand">Sand</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Material Name</label>
                  <input {...register('material_name')} placeholder="e.g. M30 Concrete" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Test Name</label>
                  <input {...register('test_name')} placeholder="e.g. Compressive Strength" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Lab Name</label>
                  <input {...register('lab_name')} placeholder="e.g. National Test Lab" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Sample Location</label>
                  <input {...register('sample_location', { required: true })} placeholder="e.g. Footing P5" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Request Date</label>
                  <input type="date" {...register('request_date', { required: true })} defaultValue={dayjs().format('YYYY-MM-DD')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Batch Number</label>
                  <input {...register('batch_number')} placeholder="e.g. Batch #42" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Target Strength (MPa)</label>
                  <input type="number" step="any" {...register('target_strength')} placeholder="e.g. 30 for M30" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Result Status</label>
                  <select {...register('result_status')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="pending">Pending</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Result Value</label>
                  <input {...register('result_value')} placeholder="e.g. 32.5 MPa" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Remarks</label>
                <textarea {...register('remarks')} rows={3} placeholder="Additional notes or observations…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </div>

              <div className="flex gap-3 pt-2">
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
                  className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-60"
                >
                  {createMut.isPending ? 'Saving…' : 'Log Sample'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
