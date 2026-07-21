// src/pages/plant/TowerCranePage.jsx — Tower Crane Installation Register
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, FileText, X, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { plantAPI, projectAPI } from '../../api/client';

const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white';
const lbl = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1';
const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN') : '—';
const daysLeft = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

const STATUS_COLOR = {
  operational:   { bg: '#D1FAE5', color: '#065F46', label: 'Operational' },
  maintenance:   { bg: '#FEF3C7', color: '#92400E', label: 'Under Maintenance' },
  dismantled:    { bg: '#FEE2E2', color: '#991B1B', label: 'Dismantled' },
  standby:       { bg: '#DBEAFE', color: '#1E40AF', label: 'Standby' },
};

const DOC_TYPES = [
  'Erection & Commissioning Certificate',
  'Load Test Report (110% SWL)',
  'Third Party Inspection Certificate',
  'Stability Certificate',
  'Electrical Fitness Certificate',
  'Insurance Certificate',
  'Crane Operator License',
  'IBR / Factory Inspector Approval',
  'Foundation Design Drawing',
  'Erection Drawing',
  'Operation & Maintenance Manual',
  'Other',
];

const BLANK_CRANE = {
  crane_tag: '', make: '', model: '', serial_number: '', project_id: '',
  max_capacity_t: '', jib_length_m: '', counter_jib_length_m: '', max_height_m: '',
  free_standing_height_m: '', foundation_type: '', mast_section: '', number_of_sections: '',
  electrical_supply: '', hoist_motor_kw: '', slewing_motor_kw: '', trolley_motor_kw: '',
  erection_agency: '', erection_supervisor: '', installation_date: '', commissioning_date: '',
  last_load_test_date: '', next_load_test_date: '', last_inspection_date: '', next_inspection_date: '',
  status: 'operational', remarks: '',
};

const BLANK_DOC = { doc_type: '', doc_number: '', issued_by: '', issue_date: '', expiry_date: '', file_url: '', remarks: '' };

function ExpiryChip({ date, label }) {
  const d = daysLeft(date);
  if (!date) return null;
  const expired = d < 0;
  const soon    = d >= 0 && d <= 30;
  const bg   = expired ? '#FEE2E2' : soon ? '#FEF3C7' : '#D1FAE5';
  const color= expired ? '#991B1B' : soon ? '#92400E' : '#065F46';
  const Icon = expired ? AlertTriangle : soon ? Clock : CheckCircle2;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:bg, color, borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:600 }}>
      <Icon size={11} />
      {label}: {expired ? `${Math.abs(d)}d ago` : `${d}d`}
    </span>
  );
}

function CraneForm({ initial, projects, onSave, onClose, saving }) {
  const [form, setForm] = useState({ ...BLANK_CRANE, ...initial });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const num = (k) => ({ type: 'number', step: '0.01', value: form[k], onChange: e => set(k, e.target.value) });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-base font-bold text-slate-900">{initial?.id ? 'Edit Tower Crane' : 'New Tower Crane'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Identity */}
          <Section title="Identity">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Crane Tag *"><input className={inp} value={form.crane_tag} onChange={e => set('crane_tag', e.target.value)} placeholder="TC-001" /></Field>
              <Field label="Make"><input className={inp} value={form.make} onChange={e => set('make', e.target.value)} placeholder="Potain" /></Field>
              <Field label="Model"><input className={inp} value={form.model} onChange={e => set('model', e.target.value)} placeholder="MDT 178" /></Field>
              <Field label="Serial Number"><input className={inp} value={form.serial_number} onChange={e => set('serial_number', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Project / Site">
                <select className={inp} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                  <option value="">— Select Project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                  {Object.entries(STATUS_COLOR).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* Technical Specs */}
          <Section title="Technical Specifications">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Max Capacity (t)"><input className={inp} {...num('max_capacity_t')} placeholder="6.0" /></Field>
              <Field label="Jib Length (m)"><input className={inp} {...num('jib_length_m')} placeholder="50.0" /></Field>
              <Field label="Counter Jib (m)"><input className={inp} {...num('counter_jib_length_m')} /></Field>
              <Field label="Max Height (m)"><input className={inp} {...num('max_height_m')} placeholder="60.0" /></Field>
              <Field label="Free-Standing Height (m)"><input className={inp} {...num('free_standing_height_m')} /></Field>
              <Field label="Mast Section Type"><input className={inp} value={form.mast_section} onChange={e => set('mast_section', e.target.value)} /></Field>
              <Field label="No. of Sections"><input className={inp} type="number" value={form.number_of_sections} onChange={e => set('number_of_sections', e.target.value)} /></Field>
              <Field label="Foundation Type"><input className={inp} value={form.foundation_type} onChange={e => set('foundation_type', e.target.value)} placeholder="Fixed base / Rail" /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Field label="Electrical Supply"><input className={inp} value={form.electrical_supply} onChange={e => set('electrical_supply', e.target.value)} placeholder="3 Ph, 415V, 50Hz" /></Field>
              <Field label="Hoist Motor (kW)"><input className={inp} {...num('hoist_motor_kw')} /></Field>
              <Field label="Slewing Motor (kW)"><input className={inp} {...num('slewing_motor_kw')} /></Field>
            </div>
          </Section>

          {/* Installation */}
          <Section title="Installation Details">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Erection Agency"><input className={inp} value={form.erection_agency} onChange={e => set('erection_agency', e.target.value)} placeholder="Company that installed the crane" /></Field>
              <Field label="Erection Supervisor"><input className={inp} value={form.erection_supervisor} onChange={e => set('erection_supervisor', e.target.value)} /></Field>
              <Field label="Installation Date"><input type="date" className={inp} value={form.installation_date} onChange={e => set('installation_date', e.target.value)} /></Field>
              <Field label="Commissioning Date"><input type="date" className={inp} value={form.commissioning_date} onChange={e => set('commissioning_date', e.target.value)} /></Field>
            </div>
          </Section>

          {/* Inspection & Load Test */}
          <Section title="Inspection & Load Test Schedule">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Last Load Test"><input type="date" className={inp} value={form.last_load_test_date} onChange={e => set('last_load_test_date', e.target.value)} /></Field>
              <Field label="Next Load Test"><input type="date" className={inp} value={form.next_load_test_date} onChange={e => set('next_load_test_date', e.target.value)} /></Field>
              <Field label="Last Inspection"><input type="date" className={inp} value={form.last_inspection_date} onChange={e => set('last_inspection_date', e.target.value)} /></Field>
              <Field label="Next Inspection"><input type="date" className={inp} value={form.next_inspection_date} onChange={e => set('next_inspection_date', e.target.value)} /></Field>
            </div>
          </Section>

          {/* Remarks */}
          <Section title="Remarks">
            <textarea className={inp} rows={3} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any additional notes…" />
          </Section>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.crane_tag.trim()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
          >
            {saving ? 'Saving…' : 'Save Crane'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocForm({ craneId, onSave, onClose, saving }) {
  const [form, setForm] = useState(BLANK_DOC);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Add Document</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Document Type *">
            <select className={inp} value={form.doc_type} onChange={e => set('doc_type', e.target.value)}>
              <option value="">— Select —</option>
              {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Document Number"><input className={inp} value={form.doc_number} onChange={e => set('doc_number', e.target.value)} /></Field>
            <Field label="Issued By"><input className={inp} value={form.issued_by} onChange={e => set('issued_by', e.target.value)} /></Field>
            <Field label="Issue Date"><input type="date" className={inp} value={form.issue_date} onChange={e => set('issue_date', e.target.value)} /></Field>
            <Field label="Expiry Date"><input type="date" className={inp} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} /></Field>
          </div>
          <Field label="File URL / Reference"><input className={inp} value={form.file_url} onChange={e => set('file_url', e.target.value)} placeholder="https://… or shared drive path" /></Field>
          <Field label="Remarks"><input className={inp} value={form.remarks} onChange={e => set('remarks', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.doc_type}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
          >
            {saving ? 'Saving…' : 'Add Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CraneCard({ crane, projects, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [showDocForm, setShowDocForm] = useState(false);
  const qc = useQueryClient();
  const sc = STATUS_COLOR[crane.status] || STATUS_COLOR.operational;

  const { data: docs = [] } = useQuery({
    queryKey: ['tc-docs', crane.id],
    queryFn: () => plantAPI.listTowerCraneDocs(crane.id).then(r => r.data?.data || []),
    enabled: expanded,
  });

  const addDocMut = useMutation({
    mutationFn: (d) => plantAPI.addTowerCraneDoc(crane.id, d),
    onSuccess: () => { toast.success('Document added'); qc.invalidateQueries(['tc-docs', crane.id]); setShowDocForm(false); },
    onError: e => toast.error(e.response?.data?.error || 'Failed'),
  });

  const delDocMut = useMutation({
    mutationFn: (id) => plantAPI.deleteTowerCraneDoc(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries(['tc-docs', crane.id]); },
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-700 font-bold text-sm">TC</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-sm">{crane.crane_tag || '—'}</span>
              {crane.make && <span className="text-slate-500 text-xs">{crane.make} {crane.model}</span>}
              <span style={{ background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 7px' }}>
                {sc.label}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 flex gap-3 flex-wrap">
              {crane.project_name && <span>📍 {crane.project_name}</span>}
              {crane.max_capacity_t && <span>⚖️ {crane.max_capacity_t}t SWL</span>}
              {crane.jib_length_m && <span>↔️ {crane.jib_length_m}m jib</span>}
              {crane.max_height_m && <span>↕️ {crane.max_height_m}m height</span>}
              {crane.installation_date && <span>🔧 Installed {fmt(crane.installation_date)}</span>}
            </div>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              <ExpiryChip date={crane.next_load_test_date} label="Load Test" />
              <ExpiryChip date={crane.next_inspection_date} label="Inspection" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => onEdit(crane)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil size={14} /></button>
          <button onClick={() => onDelete(crane.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
          <button onClick={() => setExpanded(p => !p)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Specs grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Spec label="Serial No." value={crane.serial_number} />
            <Spec label="Mast Section" value={crane.mast_section} />
            <Spec label="No. of Sections" value={crane.number_of_sections} />
            <Spec label="Foundation Type" value={crane.foundation_type} />
            <Spec label="Free-Standing Ht." value={crane.free_standing_height_m ? `${crane.free_standing_height_m}m` : null} />
            <Spec label="Counter Jib" value={crane.counter_jib_length_m ? `${crane.counter_jib_length_m}m` : null} />
            <Spec label="Electrical Supply" value={crane.electrical_supply} />
            <Spec label="Hoist Motor" value={crane.hoist_motor_kw ? `${crane.hoist_motor_kw}kW` : null} />
            <Spec label="Slewing Motor" value={crane.slewing_motor_kw ? `${crane.slewing_motor_kw}kW` : null} />
            <Spec label="Erection Agency" value={crane.erection_agency} />
            <Spec label="Erection Supervisor" value={crane.erection_supervisor} />
            <Spec label="Commissioning" value={fmt(crane.commissioning_date)} />
            <Spec label="Last Load Test" value={fmt(crane.last_load_test_date)} />
            <Spec label="Last Inspection" value={fmt(crane.last_inspection_date)} />
          </div>
          {crane.remarks && <p className="text-xs text-slate-500 italic">{crane.remarks}</p>}

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Documents</span>
              <button onClick={() => setShowDocForm(true)}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 border border-emerald-200 hover:bg-emerald-50 px-2 py-1 rounded-lg">
                <Plus size={11} /> Add Document
              </button>
            </div>
            {docs.length === 0
              ? <p className="text-xs text-slate-400 italic">No documents yet — add erection certificate, load test reports, etc.</p>
              : <div className="space-y-1.5">
                  {docs.map(d => {
                    const exp = daysLeft(d.expiry_date);
                    const expired = exp !== null && exp < 0;
                    const soon = exp !== null && exp >= 0 && exp <= 30;
                    return (
                      <div key={d.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-xs ${expired ? 'bg-red-50 border-red-200' : soon ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={12} className="text-slate-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800">{d.doc_type}</span>
                            {d.doc_number && <span className="text-slate-500 ml-2">#{d.doc_number}</span>}
                            {d.issued_by && <span className="text-slate-400 ml-2">by {d.issued_by}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {d.issue_date && <span className="text-slate-400">Issued {fmt(d.issue_date)}</span>}
                          {d.expiry_date && (
                            <span className={`font-semibold ${expired ? 'text-red-600' : soon ? 'text-amber-600' : 'text-emerald-700'}`}>
                              {expired ? `Expired ${Math.abs(exp)}d ago` : `Exp ${fmt(d.expiry_date)}`}
                            </span>
                          )}
                          {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">View</a>}
                          <button onClick={() => delDocMut.mutate(d.id)} className="text-slate-300 hover:text-red-500"><X size={12} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        </div>
      )}

      {showDocForm && (
        <DocForm
          craneId={crane.id}
          saving={addDocMut.isPending}
          onSave={(d) => addDocMut.mutate(d)}
          onClose={() => setShowDocForm(false)}
        />
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3 pb-1 border-b border-blue-100">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      {children}
    </div>
  );
}

function Spec({ label, value }) {
  if (!value || value === '—') return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-slate-800 font-medium mt-0.5">{value}</p>
    </div>
  );
}

export default function TowerCranePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: cranes = [], isLoading } = useQuery({
    queryKey: ['tower-cranes'],
    queryFn: () => plantAPI.listTowerCranes().then(r => r.data?.data || []),
  });

  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []),
  });

  const createMut = useMutation({
    mutationFn: (d) => plantAPI.createTowerCrane(d),
    onSuccess: () => { toast.success('Tower crane added'); qc.invalidateQueries(['tower-cranes']); setShowForm(false); },
    onError: e => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const updateMut = useMutation({
    mutationFn: (d) => plantAPI.updateTowerCrane(editing.id, d),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries(['tower-cranes']); setEditing(null); },
    onError: e => toast.error(e.response?.data?.error || 'Failed to update'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => plantAPI.deleteTowerCrane(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries(['tower-cranes']); },
    onError: e => toast.error(e.response?.data?.error || 'Failed'),
  });

  const alerts = useMemo(() => {
    let count = 0;
    cranes.forEach(c => {
      if (c.next_load_test_date && daysLeft(c.next_load_test_date) <= 30) count++;
      if (c.next_inspection_date && daysLeft(c.next_inspection_date) <= 30) count++;
    });
    return count;
  }, [cranes]);

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Tower Crane Register</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {cranes.length} crane{cranes.length !== 1 ? 's' : ''} registered
            {alerts > 0 && <span className="ml-2 text-amber-600 font-semibold">⚠ {alerts} expiry alert{alerts !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm">
          <Plus size={15} /> Add Tower Crane
        </button>
      </div>

      {/* List */}
      {isLoading
        ? <div className="text-center py-12 text-sm text-slate-400">Loading…</div>
        : cranes.length === 0
          ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <div className="text-4xl mb-3">🏗️</div>
              <p className="font-semibold text-slate-700">No tower cranes registered yet</p>
              <p className="text-sm text-slate-400 mt-1">Click "Add Tower Crane" to register installation details and documents.</p>
            </div>
          )
          : (
            <div className="space-y-3">
              {cranes.map(c => (
                <CraneCard
                  key={c.id}
                  crane={c}
                  projects={projectsData}
                  onEdit={setEditing}
                  onDelete={(id) => { if (window.confirm('Delete this tower crane record?')) deleteMut.mutate(id); }}
                />
              ))}
            </div>
          )
      }

      {/* Create form */}
      {showForm && (
        <CraneForm
          initial={{}}
          projects={projectsData}
          saving={createMut.isPending}
          onSave={(d) => createMut.mutate(d)}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Edit form */}
      {editing && (
        <CraneForm
          initial={editing}
          projects={projectsData}
          saving={updateMut.isPending}
          onSave={(d) => updateMut.mutate(d)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
