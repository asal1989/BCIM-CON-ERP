// TrainingAssignmentPage.jsx — Onboarding > Training Assignment
// Scoped to induction/safety/compliance training tied to onboarding —
// separate from the ongoing HR Admin > Training & Development module
// (TrainingPage.jsx / hr-training.routes.js), per explicit product split.
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Clock, UserPlus, BookOpen, TrendingUp, History as HistoryIcon,
  Award, FileBarChart, Settings as SettingsIcon, Plus, X, Trash2, Send, Bell,
  CheckCircle2, ShieldAlert, GraduationCap, Download,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { hrOnboardingTrainingAPI, hrMastersAPI, projectAPI, hrEmployeesAPI } from '../../../api/client';
import { PageHeader } from '../../../theme';
import { KpiCard } from '../../../components/hr/DashboardKit';
import { FIELD_HL } from '../../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const TA  = `w-full rounded-lg px-3 py-2 text-xs outline-none transition-all border ${FIELD_HL} resize-none`;

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pending', label: 'Pending Assignments', icon: Clock },
  { id: 'assign', label: 'Assign Training', icon: UserPlus },
  { id: 'courses', label: 'Courses', icon: BookOpen },
  { id: 'progress', label: 'Training Progress', icon: TrendingUp },
  { id: 'history', label: 'Training History', icon: HistoryIcon },
  { id: 'certificates', label: 'Certificates', icon: Award },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const CATEGORIES = ['mandatory', 'safety', 'department', 'project', 'compliance'];
const CATEGORY_LABEL = { mandatory: 'Mandatory', safety: 'Safety Induction', department: 'Department', project: 'Project', compliance: 'Compliance' };
const CATEGORY_COLOR = { mandatory: '#2563EB', safety: '#DC2626', department: '#7C3AED', project: '#059669', compliance: '#D97706' };
const STATUS_COLOR = { pending: 'bg-slate-100 text-slate-600', in_progress: 'bg-blue-50 text-blue-700', completed: 'bg-emerald-50 text-emerald-700', failed: 'bg-red-50 text-red-700', expired: 'bg-amber-50 text-amber-700' };

const Badge = ({ className, style, children }) => (
  <span style={style} className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize whitespace-nowrap', className)}>{children}</span>
);
const Field = ({ label, children, wide }) => (
  <div className={wide ? 'col-span-2' : ''}>
    <label className="block text-[11px] text-slate-500 mb-1">{label}</label>
    {children}
  </div>
);

/* ═══════════════════════ Dashboard ═══════════════════════ */
function DashboardTab() {
  const { data, isLoading } = useQuery({ queryKey: ['ob-train-dashboard'], queryFn: () => hrOnboardingTrainingAPI.dashboard().then(r => r.data?.data || {}) });
  const cards = [
    ['Employees Pending Training', data?.pending_employees, Clock, '#F59E0B'],
    ['Assigned Training', data?.assigned, BookOpen, '#2563EB'],
    ['Completed Training', data?.completed, CheckCircle2, '#10B981'],
    ['Overdue Training', data?.overdue, ShieldAlert, '#EF4444'],
    ['Certificates Issued', data?.certificates_issued, Award, '#7C3AED'],
    ['Safety Induction Pending', data?.safety_pending, ShieldAlert, '#DC2626'],
    ['Compliance Training Pending', data?.compliance_pending, FileBarChart, '#D97706'],
    ['Avg Completion Rate', `${data?.avg_completion_rate || 0}%`, TrendingUp, '#059669'],
  ];
  if (isLoading) return <p className="text-center py-16 text-slate-400 text-sm">Loading…</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl">
      {cards.map(([label, value, Icon, color], i) => (
        <KpiCard key={label} label={label} value={value ?? 0} icon={Icon} color={color} bg={`${color}18`} delay={i * 0.03} />
      ))}
    </div>
  );
}

/* ═══════════════════════ Pending Assignments ═══════════════════════ */
function PendingTab() {
  const qc = useQueryClient();
  const [extendFor, setExtendFor] = useState(null);
  const [extendDate, setExtendDate] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['ob-train-assignments', 'pending'],
    queryFn: () => hrOnboardingTrainingAPI.assignments({ status: 'pending' }).then(r => r.data?.data || []),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['ob-train-assignments'] });

  const startMut = useMutation({ mutationFn: (id) => hrOnboardingTrainingAPI.start(id), onSuccess: () => { toast.success('Marked in progress'); refresh(); } });
  const reassignMut = useMutation({ mutationFn: (id) => hrOnboardingTrainingAPI.reassign(id, {}), onSuccess: () => { toast.success('Reassigned'); refresh(); } });
  const extendMut = useMutation({
    mutationFn: ({ id, due_date }) => hrOnboardingTrainingAPI.extend(id, { due_date }),
    onSuccess: () => { toast.success('Due date extended'); setExtendFor(null); refresh(); },
  });
  const remindMut = useMutation({ mutationFn: (id) => hrOnboardingTrainingAPI.remind(id), onSuccess: () => toast.success('Reminder sent') });

  return (
    <div className="max-w-5xl">
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Emp ID', 'Name', 'Department', 'Project', 'Course', 'Due Date', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Nothing pending</td></tr>
            ) : rows.map(r => {
              const overdue = r.due_date && dayjs(r.due_date).isBefore(dayjs(), 'day');
              return (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-mono text-slate-500">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{r.employee_name}</td>
                  <td className="px-3 py-2">{r.department_name || '—'}</td>
                  <td className="px-3 py-2">{r.project_name || '—'}</td>
                  <td className="px-3 py-2">{r.course_name}</td>
                  <td className={clsx('px-3 py-2', overdue && 'text-red-600 font-bold')}>{r.due_date ? dayjs(r.due_date).format('DD-MM-YYYY') : '—'}</td>
                  <td className="px-3 py-2"><Badge className={STATUS_COLOR[r.status]}>{r.status.replace('_', ' ')}</Badge></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => startMut.mutate(r.id)} className="h-6 px-2 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold">Start</button>
                      <button onClick={() => reassignMut.mutate(r.id)} className="h-6 px-2 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">Reassign</button>
                      <button onClick={() => { setExtendFor(r.id); setExtendDate(r.due_date || ''); }} className="h-6 px-2 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">Extend</button>
                      <button onClick={() => remindMut.mutate(r.id)} className="h-6 px-2 rounded bg-violet-50 text-violet-700 text-[10px] font-semibold flex items-center gap-1"><Bell size={10} /> Remind</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {extendFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setExtendFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Extend Due Date</h3>
            <input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)} className={INP} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setExtendFor(null)} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
              <button disabled={!extendDate} onClick={() => extendMut.mutate({ id: extendFor, due_date: extendDate })} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ Assign Training ═══════════════════════ */
function AssignTab({ courses }) {
  const [form, setForm] = useState({ course_id: '', target_type: 'department', target_ids: [], due_date: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: depts } = useQuery({ queryKey: ['hr-departments'], queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []) });
  const { data: desigs } = useQuery({ queryKey: ['hr-designations'], queryFn: () => hrMastersAPI.listDesigs().then(r => r.data?.data || []) });
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => projectAPI.list().then(r => r.data?.data || r.data || []) });
  const { data: employees } = useQuery({ queryKey: ['hr-employees-lite'], queryFn: () => hrEmployeesAPI.list({ page_size: 500 }).then(r => r.data?.data || r.data || []) });

  const mut = useMutation({
    mutationFn: (d) => hrOnboardingTrainingAPI.assign(d),
    onSuccess: (r) => { toast.success(`Assigned to ${r.data?.count ?? 0} employee(s)`); setForm({ course_id: '', target_type: 'department', target_ids: [], due_date: '' }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to assign'),
  });

  const targetOptions = () => {
    switch (form.target_type) {
      case 'department': return (depts || []).map(d => ({ id: d.id, label: d.name }));
      case 'project':    return (projects || []).map(p => ({ id: p.id, label: p.name }));
      case 'designation':return (desigs || []).map(d => ({ id: d.id, label: d.name }));
      case 'individual':  return (employees || []).map(e => ({ id: e.id, label: `${e.name} (${e.employee_code || '—'})` }));
      default: return [];
    }
  };

  const toggleTarget = (id) => set('target_ids', form.target_ids.includes(id) ? form.target_ids.filter(x => x !== id) : [...form.target_ids, id]);

  return (
    <div className="max-w-2xl bg-white rounded-xl border border-slate-200 p-5">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Course *" wide>
          <select value={form.course_id} onChange={e => set('course_id', e.target.value)} className={INP}>
            <option value="">Select course…</option>
            {(courses || []).map(c => <option key={c.id} value={c.id}>{CATEGORY_LABEL[c.category]} — {c.name}</option>)}
          </select>
        </Field>
        <Field label="Assign By">
          <select value={form.target_type}
            onChange={e => { set('target_type', e.target.value); set('target_ids', []); }} className={INP}>
            {['individual', 'department', 'project', 'designation', 'new_joiners'].map(t => (
              <option key={t} value={t}>{t === 'new_joiners' ? 'New Joiners (last N days)' : t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </Field>
        <Field label="Due Date"><input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className={INP} /></Field>
      </div>

      {form.target_type === 'new_joiners' ? (
        <Field label="Joined within last N days" wide>
          <input type="number" min={1} value={form.target_ids[0] || ''} onChange={e => set('target_ids', [e.target.value])} className={INP} placeholder="e.g. 30" />
        </Field>
      ) : (
        <div>
          <label className="block text-[11px] text-slate-500 mb-1.5">Select {form.target_type}(s)</label>
          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
            {targetOptions().map(o => (
              <label key={o.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={form.target_ids.includes(o.id)} onChange={() => toggleTarget(o.id)} />
                {o.label}
              </label>
            ))}
            {targetOptions().length === 0 && <p className="text-xs text-slate-400 px-2 py-2">No options</p>}
          </div>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button
          disabled={!form.course_id || form.target_ids.length === 0 || mut.isPending}
          onClick={() => mut.mutate(form)}
          className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-2">
          <Send size={13} /> {mut.isPending ? 'Assigning…' : 'Assign Training'}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════ Courses (Mandatory/Safety/Department/Project/Compliance) ═══════════════════════ */
function CourseForm({ onClose, onSaved }) {
  const [f, setF] = useState({ category: 'mandatory', name: '', description: '', pass_percentage: 70, validity_months: '', duration_hours: '' });
  const { data: trainers } = useQuery({ queryKey: ['ob-trainers'], queryFn: () => hrOnboardingTrainingAPI.trainers().then(r => r.data?.data || []) });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mut = useMutation({
    mutationFn: (d) => hrOnboardingTrainingAPI.createCourse(d),
    onSuccess: () => { toast.success('Course created'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">New Training Course</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category *">
            <select value={f.category} onChange={e => set('category', e.target.value)} className={INP}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="Trainer">
            <select value={f.trainer_id || ''} onChange={e => set('trainer_id', e.target.value)} className={INP}>
              <option value="">—</option>
              {(trainers || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Course Name *" wide><input value={f.name} onChange={e => set('name', e.target.value)} className={INP} /></Field>
          <Field label="Description" wide><textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} className={TA} /></Field>
          <Field label="Duration (hrs)"><input type="number" value={f.duration_hours} onChange={e => set('duration_hours', e.target.value)} className={INP} /></Field>
          <Field label="Pass %"><input type="number" value={f.pass_percentage} onChange={e => set('pass_percentage', e.target.value)} className={INP} /></Field>
          <Field label="Certificate Validity (months)"><input type="number" value={f.validity_months} onChange={e => set('validity_months', e.target.value)} className={INP} placeholder="Leave blank = no expiry" /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button disabled={!f.name || mut.isPending} onClick={() => mut.mutate(f)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({ course, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ question: '', options: ['', '', '', ''], correct_index: 0, marks: 1 });
  const { data: questions = [] } = useQuery({ queryKey: ['ob-train-questions', course.id], queryFn: () => hrOnboardingTrainingAPI.questions(course.id).then(r => r.data?.data || []) });
  const addMut = useMutation({
    mutationFn: (d) => hrOnboardingTrainingAPI.addQuestion(course.id, d),
    onSuccess: () => { toast.success('Question added'); setF({ question: '', options: ['', '', '', ''], correct_index: 0, marks: 1 }); qc.invalidateQueries({ queryKey: ['ob-train-questions', course.id] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: (id) => hrOnboardingTrainingAPI.deleteQuestion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ob-train-questions', course.id] }),
  });
  const setOpt = (i, v) => setF(p => ({ ...p, options: p.options.map((o, idx) => idx === i ? v : o) }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Quiz Questions — {course.name}</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          <div className="space-y-2 mb-2">
            {questions.map((q, i) => (
              <div key={q.id} className="flex items-start justify-between border border-slate-200 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-slate-800">{i + 1}. {q.question}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Correct: {q.options[q.correct_index]} · {q.marks} mark(s)</p>
                </div>
                <button onClick={() => delMut.mutate(q.id)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
              </div>
            ))}
            {questions.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No questions yet</p>}
          </div>
          <div className="mt-4 p-3 bg-slate-50 rounded-xl space-y-2">
            <input value={f.question} onChange={e => setF(p => ({ ...p, question: e.target.value }))} placeholder="Question text" className={INP} />
            {f.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" checked={f.correct_index === i} onChange={() => setF(p => ({ ...p, correct_index: i }))} />
                <input value={o} onChange={e => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} className={INP} />
              </div>
            ))}
            <div className="flex justify-between items-center">
              <label className="text-xs text-slate-500 flex items-center gap-1.5">Marks <input type="number" value={f.marks} onChange={e => setF(p => ({ ...p, marks: e.target.value }))} className="w-14 h-7 border border-slate-200 rounded px-2 text-xs" /></label>
              <button disabled={!f.question || f.options.filter(Boolean).length < 2 || addMut.isPending}
                onClick={() => addMut.mutate({ ...f, options: f.options.filter(Boolean) })}
                className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">Add Question</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoursesTab() {
  const qc = useQueryClient();
  const [category, setCategory] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [quizFor, setQuizFor] = useState(null);
  const { data: courses = [], isLoading } = useQuery({ queryKey: ['ob-train-courses', category], queryFn: () => hrOnboardingTrainingAPI.courses({ category: category || undefined }).then(r => r.data?.data || []) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['ob-train-courses'] });

  return (
    <div className="max-w-5xl">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setCategory('')} className={clsx('h-8 px-3 rounded-lg text-xs font-medium', !category ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600')}>All</button>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} className={clsx('h-8 px-3 rounded-lg text-xs font-medium', category === c ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600')}>{CATEGORY_LABEL[c]}</button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2"><Plus size={14} /> New Course</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isLoading ? <p className="text-slate-400 text-sm col-span-2 text-center py-10">Loading…</p> : courses.length === 0 ? (
          <div className="col-span-2 text-center py-16 text-slate-400 text-sm">No courses in this category yet</div>
        ) : courses.map(c => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="text-white" style={{ background: CATEGORY_COLOR[c.category] }}>{CATEGORY_LABEL[c.category]}</Badge>
              <span className="font-semibold text-sm text-slate-800">{c.name}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{c.department_name || c.project_name || c.description || '—'}</p>
            <div className="flex justify-between items-center mt-2">
              <span className="text-[10px] text-slate-400">{c.assignment_count} assigned · Pass {c.pass_percentage}% {c.validity_months ? `· Valid ${c.validity_months}mo` : ''}</span>
              <button onClick={() => setQuizFor(c)} className="text-[11px] font-semibold text-blue-600">Manage Quiz</button>
            </div>
          </div>
        ))}
      </div>
      {showForm && <CourseForm onClose={() => setShowForm(false)} onSaved={refresh} />}
      {quizFor && <QuestionEditor course={quizFor} onClose={() => setQuizFor(null)} />}
    </div>
  );
}

/* ═══════════════════════ Training Progress ═══════════════════════ */
function ProgressTab() {
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['ob-train-assignments', 'all'], queryFn: () => hrOnboardingTrainingAPI.assignments({}).then(r => r.data?.data || []) });
  const grouped = rows.reduce((acc, r) => { (acc[r.employee_name] ||= []).push(r); return acc; }, {});
  const PCT = { pending: 0, in_progress: 40, completed: 100, failed: 60, expired: 80 };
  return (
    <div className="max-w-4xl grid grid-cols-1 gap-3">
      {isLoading ? <p className="text-center py-16 text-slate-400 text-sm">Loading…</p> : Object.entries(grouped).length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No training assignments yet</div>
      ) : Object.entries(grouped).map(([name, items]) => (
        <div key={name} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="font-semibold text-sm text-slate-800 mb-2">{name}</p>
          <div className="space-y-2">
            {items.map(it => (
              <div key={it.id}>
                <div className="flex justify-between text-[11px] text-slate-500 mb-0.5">
                  <span>{it.course_name}</span>
                  <Badge className={STATUS_COLOR[it.status]}>{it.status.replace('_', ' ')}</Badge>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${PCT[it.status] ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════ Training History ═══════════════════════ */
function HistoryTab() {
  const { data: employees } = useQuery({ queryKey: ['hr-employees-lite'], queryFn: () => hrEmployeesAPI.list({ page_size: 500 }).then(r => r.data?.data || r.data || []) });
  const [empId, setEmpId] = useState('');
  const { data: rows = [] } = useQuery({
    queryKey: ['ob-train-history', empId],
    enabled: !!empId,
    queryFn: () => hrOnboardingTrainingAPI.history(empId).then(r => r.data?.data || []),
  });
  return (
    <div className="max-w-4xl">
      <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${INP} max-w-xs mb-3`}>
        <option value="">Select employee…</option>
        {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_code || '—'})</option>)}
      </select>
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Course', 'Date', 'Trainer', 'Score', 'Certificate', 'Expiry Date'].map(h => <th key={h} className="px-3 py-2 text-left font-bold text-slate-500">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {!empId ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Select an employee to view history</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">No completed training yet</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-3 py-2 font-semibold">{r.course_name}</td>
                <td className="px-3 py-2">{r.completed_at ? dayjs(r.completed_at).format('DD-MM-YYYY') : '—'}</td>
                <td className="px-3 py-2">{r.trainer_name || '—'}</td>
                <td className="px-3 py-2">{r.best_score != null ? `${Math.round(r.best_score)}%` : '—'}</td>
                <td className="px-3 py-2 font-mono">{r.certificate_number || '—'}</td>
                <td className="px-3 py-2">{r.valid_until ? dayjs(r.valid_until).format('DD-MM-YYYY') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ Certificates ═══════════════════════ */
function CertificatesTab() {
  const { data: rows = [] } = useQuery({ queryKey: ['ob-train-assignments', 'completed'], queryFn: () => hrOnboardingTrainingAPI.assignments({ status: 'completed' }).then(r => r.data?.data || []) });
  const [viewing, setViewing] = useState(null);
  const { data: cert } = useQuery({
    queryKey: ['ob-train-cert', viewing],
    enabled: !!viewing,
    queryFn: () => hrOnboardingTrainingAPI.certificate(viewing).then(r => r.data?.data),
  });
  const printCert = () => window.print();

  return (
    <div className="max-w-4xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.filter(r => r.certificate_number).map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-slate-800">{r.employee_name}</p>
              <p className="text-[11px] text-slate-500">{r.course_name} · {r.certificate_number}</p>
            </div>
            <button onClick={() => setViewing(r.id)} className="h-8 px-3 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold flex items-center gap-1"><Award size={12} /> View</button>
          </div>
        ))}
        {rows.filter(r => r.certificate_number).length === 0 && <div className="col-span-2 text-center py-16 text-slate-400 text-sm">No certificates issued yet</div>}
      </div>
      {viewing && cert && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 text-center border-8" style={{ borderColor: '#1E3A8A22' }} onClick={e => e.stopPropagation()}>
            <GraduationCap size={36} className="mx-auto text-blue-700 mb-2" />
            <p className="text-[11px] tracking-widest text-slate-400 uppercase">{cert.company_name || 'Certificate of Completion'}</p>
            <h2 className="text-xl font-bold text-slate-800 my-2">Certificate of Completion</h2>
            <p className="text-sm text-slate-600">This certifies that</p>
            <p className="text-lg font-bold text-blue-700 my-1">{cert.employee_name}</p>
            <p className="text-sm text-slate-600">has successfully completed</p>
            <p className="text-base font-semibold text-slate-800 my-1">{cert.course_name}</p>
            <p className="text-[11px] text-slate-400 mt-3">Issued {dayjs(cert.issued_date).format('DD-MM-YYYY')}{cert.valid_until ? ` · Valid until ${dayjs(cert.valid_until).format('DD-MM-YYYY')}` : ''}</p>
            <p className="text-[10px] font-mono text-slate-400 mt-1">{cert.certificate_number}</p>
            {cert.qr_data_url && <img src={cert.qr_data_url} alt="QR" className="w-20 h-20 mx-auto mt-3" />}
            <div className="flex justify-center gap-2 mt-5">
              <button onClick={() => setViewing(null)} className="h-9 px-4 rounded-xl border text-xs">Close</button>
              <button onClick={printCert} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5"><Download size={13} /> Print / Save PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ Reports ═══════════════════════ */
const REPORTS = [
  ['pending', 'Pending Training'], ['completed', 'Completed Training'],
  ['safety-compliance', 'Safety & Compliance'], ['certificate-expiry', 'Certification Expiry'],
  ['department-wise', 'Department-wise Completion'], ['project-wise', 'Project-wise Completion'],
  ['employee-register', 'Employee Training Register'],
];
function ReportsTab() {
  const [key, setKey] = useState('pending');
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['ob-train-report', key], queryFn: () => hrOnboardingTrainingAPI.report(key).then(r => r.data?.data || []) });

  const exportCSV = () => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `training-${key}.csv`;
    a.click();
  };

  return (
    <div className="max-w-5xl">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {REPORTS.map(([k, label]) => (
            <button key={k} onClick={() => setKey(k)} className={clsx('h-8 px-3 rounded-lg text-xs font-medium', key === k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600')}>{label}</button>
          ))}
        </div>
        <button onClick={exportCSV} className="h-9 px-4 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-2"><Download size={13} /> Export CSV</button>
      </div>
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {rows[0] && Object.keys(rows[0]).map(h => <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 capitalize whitespace-nowrap">{h.replace(/_/g, ' ')}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="text-center py-10 text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="text-center py-10 text-slate-400">No data</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                {Object.values(r).map((v, j) => <td key={j} className="px-3 py-2 whitespace-nowrap">{v == null ? '—' : String(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ Settings ═══════════════════════ */
function SettingsTab() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const { data: trainers = [] } = useQuery({ queryKey: ['ob-trainers'], queryFn: () => hrOnboardingTrainingAPI.trainers().then(r => r.data?.data || []) });
  const addMut = useMutation({
    mutationFn: (d) => hrOnboardingTrainingAPI.addTrainer(d),
    onSuccess: () => { setName(''); qc.invalidateQueries({ queryKey: ['ob-trainers'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const delMut = useMutation({ mutationFn: (id) => hrOnboardingTrainingAPI.deleteTrainer(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['ob-trainers'] }) });

  return (
    <div className="max-w-2xl grid grid-cols-1 gap-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h4 className="text-xs font-bold text-slate-700 mb-3">Trainers</h4>
        <div className="flex gap-2 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Trainer name" className={INP} />
          <button onClick={() => name.trim() && addMut.mutate({ name: name.trim() })} disabled={!name.trim()} className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold flex-shrink-0 disabled:opacity-50">Add</button>
        </div>
        <div className="space-y-1.5">
          {trainers.map(t => (
            <div key={t.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 text-xs">
              <span>{t.name}</span>
              <button onClick={() => delMut.mutate(t.id)} className="text-red-500 hover:text-red-700"><Trash2 size={12} /></button>
            </div>
          ))}
          {trainers.length === 0 && <p className="text-[11px] text-slate-400 py-2">None yet</p>}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h4 className="text-xs font-bold text-slate-700 mb-2">Training Categories</h4>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(c => <Badge key={c} className="text-white" style={{ background: CATEGORY_COLOR[c] }}>{CATEGORY_LABEL[c]}</Badge>)}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Pass % and certificate validity are configured per-course under Courses.</p>
      </div>
    </div>
  );
}

/* ═══════════════════════ Page Shell ═══════════════════════ */
export default function TrainingAssignmentPage() {
  const [tab, setTab] = useState('dashboard');
  const { data: courses = [] } = useQuery({ queryKey: ['ob-train-courses', ''], queryFn: () => hrOnboardingTrainingAPI.courses({}).then(r => r.data?.data || []) });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="Training Assignment" subtitle="Onboarding — mandatory, safety, department, project & compliance training"
        breadcrumbs={[{ label: 'HR & Admin' }, { label: 'Onboarding' }, { label: 'Training Assignment' }]} />

      <div className="flex gap-1 px-5 pt-3 bg-white border-b flex-shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap',
              tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500')}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-5">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'pending' && <PendingTab />}
        {tab === 'assign' && <AssignTab courses={courses} />}
        {tab === 'courses' && <CoursesTab />}
        {tab === 'progress' && <ProgressTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'certificates' && <CertificatesTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
