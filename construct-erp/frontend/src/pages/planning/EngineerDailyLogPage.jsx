// src/pages/planning/EngineerDailyLogPage.jsx — Engineer Daily Activity Log
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { engineerLogAPI, projectAPI, scAPI, planningAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import useAuthStore from '../../store/authStore';
import {
  Plus, X, Search, RefreshCw, Eye, Edit2, CheckCircle2,
  Clock, Sun, Cloud, CloudRain, Wind, Thermometer,
  MapPin, Users, Trash2, ChevronRight, Send,
  ClipboardList, Package, AlertTriangle, FileText,
  CalendarDays, TrendingUp, Check, BarChart2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

/* ── constants ───────────────────────────────────────────────────────────── */
const WEATHER_OPTIONS = [
  { value: 'sunny',  label: 'Sunny',   icon: Sun,         color: 'text-amber-500',  bg: 'bg-amber-50  border-amber-300' },
  { value: 'cloudy', label: 'Cloudy',  icon: Cloud,       color: 'text-slate-500',  bg: 'bg-slate-50  border-slate-300' },
  { value: 'rainy',  label: 'Rainy',   icon: CloudRain,   color: 'text-blue-500',   bg: 'bg-blue-50   border-blue-300'  },
  { value: 'hot',    label: 'Hot',     icon: Thermometer, color: 'text-red-500',    bg: 'bg-red-50    border-red-300'   },
  { value: 'windy',  label: 'Windy',   icon: Wind,        color: 'text-teal-500',   bg: 'bg-teal-50   border-teal-300'  },
];

const ACT_STATUS = {
  not_started: { label: 'Not Started', color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700'   },
  completed:   { label: 'Completed',   color: 'bg-emerald-100 text-emerald-700' },
  on_hold:     { label: 'On Hold',     color: 'bg-amber-100 text-amber-700'  },
};

const LOG_STATUS = {
  draft:     { label: 'Draft',     bg: 'bg-slate-100',    text: 'text-slate-600',   icon: Edit2 },
  submitted: { label: 'Submitted', bg: 'bg-blue-100',     text: 'text-blue-700',    icon: Send },
  reviewed:  { label: 'Reviewed',  bg: 'bg-emerald-100',  text: 'text-emerald-700', icon: CheckCircle2 },
};

const UNITS = ['Sqm','Sqft','Cum','Rmt','Nos','Kg','MT','Bags','Ltrs','Sets','LS','%'];
const EMPTY_ACT = { activity_id:'', activity_name:'', location:'', unit:'Nos', planned_qty:'', achieved_qty:'', status:'in_progress', remarks:'' };
const MANAGER_ROLES = new Set([
  'super_admin',
  'superadmin',
  'admin',
  'manager',
  'director',
  'pm',
  'project_manager',
  'planning_manager',
  'planning_head',
  'site_manager',
]);
const isManagerRole = (role) => MANAGER_ROLES.has(String(role || '').toLowerCase());

/* ── helpers ─────────────────────────────────────────────────────────────── */
const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition bg-white';
const WeatherIcon = ({ value, size = 16 }) => {
  const w = WEATHER_OPTIONS.find(x => x.value === value) || WEATHER_OPTIONS[0];
  const Icon = w.icon;
  return <Icon size={size} className={w.color} />;
};
const StatusBadge = ({ status }) => {
  const cfg = LOG_STATUS[status] || LOG_STATUS.submitted;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', cfg.bg, cfg.text)}>
      <Icon size={10} />{cfg.label}
    </span>
  );
};
const ActBadge = ({ status }) => {
  const cfg = ACT_STATUS[status] || ACT_STATUS.in_progress;
  return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold', cfg.color)}>{cfg.label}</span>;
};

/* ════════════════════════════════════════════════════════════════════════════
   LOG FORM  — full-screen entry modal
════════════════════════════════════════════════════════════════════════════ */
function LogForm({ log, projects, selectedProjectId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!log;

  // Load subcontractors for the dropdown
  const { data: scList = [] } = useQuery({
    queryKey: ['sc-list-for-log'],
    queryFn: () => scAPI.listSC().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });

  // Load planning activities for the selected project (for schedule-linked logging)
  const { data: planActivities = [] } = useQuery({
    queryKey: ['plan-acts-for-log', form.project_id],
    queryFn: () => planningAPI.listActivities({ project_id: form.project_id, limit: 500 })
      .then(r => r.data?.data ?? r.data ?? [])
      .catch(() => []),
    enabled: !!form.project_id,
    staleTime: 60000,
  });

  const initActivities = () =>
    isEdit && log.activities?.length
      ? log.activities.map(a => ({ ...a }))
      : [{ ...EMPTY_ACT }];

  const [form, setForm] = useState({
    project_id:      log?.project_id     || selectedProjectId || '',
    log_date:        log?.log_date?.slice(0,10) || dayjs().format('YYYY-MM-DD'),
    weather:         log?.weather        || 'sunny',
    site_conditions: log?.site_conditions || '',
    general_remarks: log?.general_remarks || '',
    issues:          log?.issues         || '',
    next_day_plan:   log?.next_day_plan  || '',
  });

  useEffect(() => {
    if (form.project_id) return;
    const fallbackProjectId = selectedProjectId || (projects.length === 1 ? projects[0].id : '');
    if (fallbackProjectId) setForm(f => ({ ...f, project_id: fallbackProjectId }));
  }, [form.project_id, selectedProjectId, projects.length]);

  // ── Manpower breakdown state ─────────────────────────────────────────
  const initMB = () => {
    const mb = log?.manpower_breakdown;
    return {
      company: mb?.company ?? '',
      nmr:     mb?.nmr ?? '',
      subcontractors: mb?.subcontractors?.length
        ? mb.subcontractors.map(s => ({ ...s }))
        : [],
    };
  };
  const [manpower, setManpower] = useState(initMB);
  const setMP = (k, v) => setManpower(m => ({ ...m, [k]: v }));
  const addSC = () => setManpower(m => ({ ...m, subcontractors: [...m.subcontractors, { id: '', name: '', count: '' }] }));
  const removeSC = (i) => setManpower(m => ({ ...m, subcontractors: m.subcontractors.filter((_,idx)=>idx!==i) }));
  const setSC = (i, k, v) => setManpower(m => ({
    ...m,
    subcontractors: m.subcontractors.map((s, idx) => idx === i ? { ...s, [k]: v } : s),
  }));

  const totalManpower = useMemo(() => {
    const scT = manpower.subcontractors.reduce((s, x) => s + (parseInt(x.count) || 0), 0);
    return (parseInt(manpower.company) || 0) + scT + (parseInt(manpower.nmr) || 0);
  }, [manpower]);
  const [activities, setActivities] = useState(initActivities);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setAct = (i, k, v) => setActivities(prev => prev.map((a, idx) => idx === i ? { ...a, [k]: v } : a));
  const addAct = () => setActivities(prev => [...prev, { ...EMPTY_ACT }]);
  const removeAct = (i) => setActivities(prev => prev.filter((_, idx) => idx !== i));

  const completedCount = activities.filter(a => a.status === 'completed').length;
  const totalCount = activities.filter(a => a.activity_name?.trim()).length;

  const mut = useMutation({
    mutationFn: d => isEdit ? engineerLogAPI.update(log.id, d) : engineerLogAPI.create(d),
    onSuccess: (r) => {
      toast.success(r.data?.message || (isEdit ? 'Log updated' : 'Daily log submitted ✓'));
      qc.invalidateQueries({ queryKey: ['engineer-logs'] });
      qc.invalidateQueries({ queryKey: ['engineer-log-stats'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to submit'),
  });

  const handleSubmit = () => {
    if (!form.project_id) return toast.error('Please select a project');
    const validActs = activities.filter(a => a.activity_name?.trim());
    if (!validActs.length) return toast.error('Add at least one activity');
    // Build clean manpower_breakdown
    const mb = {
      company: parseInt(manpower.company) || 0,
      nmr:     parseInt(manpower.nmr) || 0,
      subcontractors: manpower.subcontractors
        .filter(s => s.name?.trim() && parseInt(s.count) > 0)
        .map(s => ({ id: s.id || null, name: s.name, count: parseInt(s.count) || 0 })),
    };
    mut.mutate({ ...form, manpower_breakdown: mb, activities: validActs });
  };

  const selectedWeather = WEATHER_OPTIONS.find(w => w.value === form.weather);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
        <div>
          <h2 className="font-bold text-white text-base flex items-center gap-2">
            <ClipboardList size={18} className="opacity-80" />
            {isEdit ? `Edit Log — ${log.log_number}` : "Today's Activity Log"}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {isEdit ? 'Update your log entries' : 'Fill in what you worked on today'}
          </p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
          style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-4xl mx-auto p-5 space-y-5">

          {/* ── Section 1: Header Info ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <CalendarDays size={14} className="text-indigo-500" /> Log Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Project <span className="text-red-400">*</span>
                </label>
                <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className={inp}>
                  <option value="">— Select your project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Date</label>
                <input type="date" value={form.log_date} onChange={e => set('log_date', e.target.value)} className={inp} />
              </div>
            </div>

            {/* Weather */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Weather</label>
              <div className="flex gap-2">
                {WEATHER_OPTIONS.map(w => {
                  const Icon = w.icon;
                  const active = form.weather === w.value;
                  return (
                    <button key={w.value} onClick={() => set('weather', w.value)} type="button"
                      className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all',
                        active ? `${w.bg} border-2` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300')}>
                      <Icon size={14} className={w.color} /> {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Site Conditions
                </label>
                <input value={form.site_conditions} onChange={e => set('site_conditions', e.target.value)}
                  className={inp} placeholder="e.g. Dry, Wet, Muddy, Access issues" />
              </div>
            </div>
          </div>

          {/* ── Manpower Breakdown ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Users size={14} className="text-indigo-500" />
                Manpower on Site
                {totalManpower > 0 && (
                  <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    Total: {totalManpower}
                  </span>
                )}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Company Labour */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Users size={10} /> Company Labour
                </label>
                <input type="number" min={0} value={manpower.company}
                  onChange={e => setMP('company', e.target.value)}
                  className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-center"
                  placeholder="0" />
                <p className="text-[10px] text-blue-400 mt-1.5 text-center">BCIM direct employees</p>
              </div>

              {/* NMR */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <label className="block text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Users size={10} /> NMR (Daily Wage)
                </label>
                <input type="number" min={0} value={manpower.nmr}
                  onChange={e => setMP('nmr', e.target.value)}
                  className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm font-bold text-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white text-center"
                  placeholder="0" />
                <p className="text-[10px] text-purple-400 mt-1.5 text-center">Nominal Muster Roll workers</p>
              </div>
            </div>

            {/* Subcontractors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest flex items-center gap-1">
                  <Users size={10} /> Subcontractors
                </label>
                <button onClick={addSC} type="button"
                  className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-200 transition">
                  <Plus size={11} /> Add SC
                </button>
              </div>

              {manpower.subcontractors.length === 0 && (
                <p className="text-xs text-slate-400 italic px-1">No subcontractors — click "Add SC" to add</p>
              )}

              {manpower.subcontractors.map((sc, i) => (
                <div key={i} className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg p-2">
                  <div className="flex-1">
                    <select
                      value={sc.id || ''}
                      onChange={e => {
                        const found = scList.find(s => s.id === e.target.value);
                        setSC(i, 'id', e.target.value);
                        if (found) setSC(i, 'name', found.name);
                      }}
                      className="w-full border border-orange-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-300"
                    >
                      <option value="">— Select subcontractor —</option>
                      {scList.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.contractor_type === 'labour_contractor' ? 'LC' : 'SC'})</option>
                      ))}
                    </select>
                    {/* Free-text fallback if SC not in list */}
                    {!sc.id && (
                      <input value={sc.name} onChange={e => setSC(i, 'name', e.target.value)}
                        className="w-full border border-orange-200 rounded-md px-2 py-1.5 text-xs bg-white mt-1 focus:outline-none focus:ring-1 focus:ring-orange-300"
                        placeholder="Or type SC name manually…" />
                    )}
                  </div>
                  <div className="w-20 flex-shrink-0">
                    <input type="number" min={0} value={sc.count}
                      onChange={e => setSC(i, 'count', e.target.value)}
                      className="w-full border border-orange-300 rounded-md px-2 py-1.5 text-xs font-bold text-orange-800 bg-white text-center focus:outline-none focus:ring-1 focus:ring-orange-400"
                      placeholder="Count" />
                  </div>
                  <button onClick={() => removeSC(i)} className="text-slate-300 hover:text-red-500 transition flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Total bar */}
            {totalManpower > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                  <span>Manpower Breakdown</span>
                  <span className="text-base font-bold text-indigo-700">{totalManpower} total</span>
                </div>
                <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                  {parseInt(manpower.company) > 0 && (
                    <div className="bg-blue-500 h-full rounded-l-full"
                      style={{ width: `${(parseInt(manpower.company)/totalManpower)*100}%` }}
                      title={`Company: ${manpower.company}`} />
                  )}
                  {manpower.subcontractors.map((sc, i) => parseInt(sc.count) > 0 && (
                    <div key={i} className="bg-orange-500 h-full"
                      style={{ width: `${(parseInt(sc.count)/totalManpower)*100}%` }}
                      title={`${sc.name || 'SC'}: ${sc.count}`} />
                  ))}
                  {parseInt(manpower.nmr) > 0 && (
                    <div className="bg-purple-500 h-full rounded-r-full"
                      style={{ width: `${(parseInt(manpower.nmr)/totalManpower)*100}%` }}
                      title={`NMR: ${manpower.nmr}`} />
                  )}
                </div>
                <div className="flex gap-3 mt-2 flex-wrap">
                  {parseInt(manpower.company) > 0 && (
                    <span className="text-[10px] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Company: {manpower.company}</span>
                  )}
                  {manpower.subcontractors.filter(s=>parseInt(s.count)>0).map((sc,i) => (
                    <span key={i} className="text-[10px] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />{sc.name||'SC'}: {sc.count}</span>
                  ))}
                  {parseInt(manpower.nmr) > 0 && (
                    <span className="text-[10px] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />NMR: {manpower.nmr}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Section 2: Activities ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <BarChart2 size={14} className="text-indigo-500" />
                Activities Done Today
                {totalCount > 0 && (
                  <span className="text-xs text-slate-400 font-normal">
                    ({completedCount}/{totalCount} completed)
                  </span>
                )}
              </h3>
              <button onClick={addAct}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition">
                <Plus size={12} /> Add Activity
              </button>
            </div>

            <div className="space-y-3">
              {activities.map((a, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                  {/* Row 1 */}
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
                      {i+1}
                    </span>
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                          Activity / Work Description <span className="text-red-400">*</span>
                        </label>
                        {planActivities.length > 0 ? (
                          <div className="space-y-1.5">
                            <select
                              value={a.activity_id || ''}
                              onChange={e => {
                                const found = planActivities.find(p => p.id === e.target.value);
                                setActivities(prev => prev.map((act, idx) => idx !== i ? act : found
                                  ? { ...act, activity_id: found.id, activity_name: found.activity_name,
                                      unit: found.measurement_unit || act.unit,
                                      planned_qty: found.planned_quantity != null ? String(found.planned_quantity) : act.planned_qty }
                                  : { ...act, activity_id: '' }
                                ));
                              }}
                              className={inp}
                            >
                              <option value="">— Pick from schedule —</option>
                              {planActivities.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.activity_code ? `[${p.activity_code}] ` : ''}{p.activity_name}
                                  {p.location ? ` · ${p.location}` : ''}
                                  {p.progress_pct > 0 ? ` (${p.progress_pct}% done)` : ''}
                                </option>
                              ))}
                            </select>
                            <input value={a.activity_name}
                              onChange={e => setAct(i, 'activity_name', e.target.value)}
                              className={inp}
                              placeholder={a.activity_id ? 'Activity name (auto-filled, can edit)' : 'Or type a custom activity not in schedule…'} />
                            {a.activity_id && (
                              <p className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
                                <TrendingUp size={9} /> Linked to schedule — submitting will auto-update progress %
                              </p>
                            )}
                          </div>
                        ) : (
                          <input value={a.activity_name}
                            onChange={e => setAct(i, 'activity_name', e.target.value)}
                            className={inp} placeholder="e.g. Column casting Tower A, Beam shuttering 3rd floor" />
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                          <MapPin size={9} className="inline mr-1" />Location
                        </label>
                        <input value={a.location} onChange={e => setAct(i, 'location', e.target.value)}
                          className={inp} placeholder="Floor, Block, Grid" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
                        <select value={a.status} onChange={e => setAct(i, 'status', e.target.value)} className={inp}>
                          {Object.entries(ACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <button onClick={() => removeAct(i)} className="text-slate-300 hover:text-red-500 transition mt-1 flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Row 2 — Quantities */}
                  <div className="flex items-end gap-3 pl-9">
                    <div className="w-20">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Unit</label>
                      <select value={a.unit} onChange={e => setAct(i, 'unit', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white">
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Planned Qty</label>
                      <input type="number" min={0} step="0.01" value={a.planned_qty}
                        onChange={e => setAct(i, 'planned_qty', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        placeholder="0" />
                    </div>
                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        ✓ Achieved Qty
                      </label>
                      <input type="number" min={0} step="0.01" value={a.achieved_qty}
                        onChange={e => setAct(i, 'achieved_qty', e.target.value)}
                        className="w-full border border-indigo-300 rounded-lg px-2 py-1.5 text-xs text-right font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-indigo-50"
                        placeholder="0" />
                    </div>
                    {a.planned_qty > 0 && a.achieved_qty > 0 && (
                      <div className="pb-1.5">
                        <span className={clsx('text-xs font-bold px-2 py-1 rounded-lg',
                          parseFloat(a.achieved_qty) >= parseFloat(a.planned_qty)
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700')}>
                          {Math.round((parseFloat(a.achieved_qty) / parseFloat(a.planned_qty)) * 100)}%
                        </span>
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Remarks</label>
                      <input value={a.remarks} onChange={e => setAct(i, 'remarks', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        placeholder="Any note…" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Section 3: Issues & Next Day Plan ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" /> Issues & Planning
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Issues / Constraints / Blockers
                </label>
                <textarea value={form.issues} onChange={e => set('issues', e.target.value)}
                  rows={2} placeholder="Any site issues, material shortage, design query, safety concern…"
                  className={inp + ' resize-none'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Tomorrow's Plan
                </label>
                <textarea value={form.next_day_plan} onChange={e => set('next_day_plan', e.target.value)}
                  rows={2} placeholder="What do you plan to do tomorrow?"
                  className={inp + ' resize-none'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  General Remarks
                </label>
                <input value={form.general_remarks} onChange={e => set('general_remarks', e.target.value)}
                  className={inp} placeholder="Any other notes for today…" />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex justify-between items-center px-5 py-4 border-t bg-white">
        <p className="text-xs text-slate-400">
          {totalCount} activit{totalCount === 1 ? 'y' : 'ies'} · {completedCount} completed
          {totalManpower > 0 ? ` · ${totalManpower} workers on site` : ''}
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={mut.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${Theme.navy}, ${Theme.navyDark})` }}>
            {mut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            {isEdit ? 'Update Log' : 'Submit Log'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   DETAIL VIEW
════════════════════════════════════════════════════════════════════════════ */
function LogDetail({ log, onClose, onEdit }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isManager = isManagerRole(user?.role);

  const { data: detail } = useQuery({
    queryKey: ['engineer-log-detail', log.id],
    queryFn: () => engineerLogAPI.get(log.id).then(r => r.data?.data ?? r.data),
    staleTime: 0,
  });

  const reviewMut = useMutation({
    mutationFn: () => engineerLogAPI.review(log.id, {}),
    onSuccess: () => {
      toast.success('Log marked as reviewed');
      qc.invalidateQueries({ queryKey: ['engineer-logs'] });
      qc.invalidateQueries({ queryKey: ['engineer-log-detail', log.id] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const d = detail || log;
  const acts = d.activities || [];
  const completed = acts.filter(a => a.status === 'completed').length;
  const weather = WEATHER_OPTIONS.find(w => w.value === d.weather) || WEATHER_OPTIONS[0];
  const WeatherIcon2 = weather.icon;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
        <div>
          <h2 className="font-bold text-white text-base flex items-center gap-2">
            <FileText size={16} className="opacity-70" />
            {d.log_number} — {d.engineer_name}
            <StatusBadge status={d.status} />
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {d.project_name} · {dayjs(d.log_date).format('dddd, DD MMM YYYY')}
          </p>
        </div>
        <div className="flex gap-2">
          {d.status !== 'reviewed' && d.engineer_id === user?.id && (
            <button onClick={() => onEdit(d)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-semibold transition"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
              <Edit2 size={12} /> Edit
            </button>
          )}
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-4xl mx-auto p-5 space-y-5">

          {/* Summary strip */}
          <div className="grid grid-cols-4 gap-3">
            {[
              [<WeatherIcon2 size={18} className={weather.color} />, 'Weather', weather.label],
              [<Users size={18} className="text-indigo-500" />, 'Manpower', `${d.manpower_count || 0} total`],
              [<BarChart2 size={18} className="text-emerald-500" />, 'Activities', `${completed}/${acts.length} done`],
              [<MapPin size={18} className="text-rose-500" />, 'Site', d.site_conditions || '—'],
            ].map(([icon, label, val]) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                {icon}
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">{label}</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{val}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Manpower breakdown detail */}
          {d.manpower_breakdown && (d.manpower_breakdown.company > 0 || d.manpower_breakdown.nmr > 0 || d.manpower_breakdown.subcontractors?.length > 0) && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Users size={14} className="text-indigo-500" /> Manpower Breakdown
                <span className="text-indigo-600 font-bold text-sm">{d.manpower_count} total</span>
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{d.manpower_breakdown.company || 0}</p>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1">Company Labour</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{d.manpower_breakdown.nmr || 0}</p>
                  <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mt-1">NMR</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-700">
                    {(d.manpower_breakdown.subcontractors || []).reduce((s,x) => s + (parseInt(x.count)||0), 0)}
                  </p>
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mt-1">Subcontractors</p>
                </div>
              </div>
              {(d.manpower_breakdown.subcontractors || []).length > 0 && (
                <div className="mt-3 space-y-1">
                  {d.manpower_breakdown.subcontractors.map((sc, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-orange-50 rounded-lg px-3 py-1.5">
                      <span className="font-semibold text-slate-700">{sc.name}</span>
                      <span className="font-bold text-orange-700">{sc.count} workers</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activities */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">Activities ({acts.length})</h3>
              <span className="text-xs text-slate-500">
                {completed} completed · {acts.filter(a=>a.status==='in_progress').length} in progress
              </span>
            </div>
            {acts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">No activities recorded</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {acts.map((a, i) => {
                  const pct = a.planned_qty > 0 ? Math.min(100, Math.round((a.achieved_qty / a.planned_qty) * 100)) : null;
                  return (
                    <div key={a.id || i} className="px-5 py-3 hover:bg-slate-50/50">
                      <div className="flex items-start gap-3">
                        <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5',
                          a.status === 'completed' ? 'bg-emerald-500 text-white' :
                          a.status === 'in_progress' ? 'bg-blue-500 text-white' :
                          a.status === 'on_hold' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500')}>
                          {a.status === 'completed' ? <Check size={10} /> : i+1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-800 text-sm">{a.activity_name}</p>
                            <ActBadge status={a.status} />
                            {a.activity_id && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-600">
                                <TrendingUp size={8} /> Schedule
                              </span>
                            )}
                          </div>
                          {a.location && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin size={10} /> {a.location}
                            </p>
                          )}
                          {(a.planned_qty > 0 || a.achieved_qty > 0) && (
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-xs text-slate-500">
                                Planned: <span className="font-semibold text-slate-700">{a.planned_qty} {a.unit}</span>
                              </span>
                              <span className="text-xs text-emerald-700 font-semibold">
                                ✓ Done: {a.achieved_qty} {a.unit}
                              </span>
                              {pct !== null && (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={clsx('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500')}
                                      style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-600">{pct}%</span>
                                </div>
                              )}
                            </div>
                          )}
                          {a.remarks && <p className="text-xs text-slate-400 mt-0.5 italic">{a.remarks}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Issues / Next Day / Remarks */}
          {(d.issues || d.next_day_plan || d.general_remarks) && (
            <div className="grid grid-cols-1 gap-4">
              {d.issues && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <AlertTriangle size={11} /> Issues / Constraints
                  </p>
                  <p className="text-sm text-slate-700">{d.issues}</p>
                </div>
              )}
              {d.next_day_plan && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <ChevronRight size={11} /> Tomorrow's Plan
                  </p>
                  <p className="text-sm text-slate-700">{d.next_day_plan}</p>
                </div>
              )}
              {d.general_remarks && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Remarks</p>
                  <p className="text-sm text-slate-700">{d.general_remarks}</p>
                </div>
              )}
            </div>
          )}

          {/* Review info */}
          {d.status === 'reviewed' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Reviewed by {d.reviewed_by_name}</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {d.reviewed_at ? dayjs(d.reviewed_at).format('DD MMM YYYY HH:mm') : ''}
                  {d.review_remarks && ` — ${d.review_remarks}`}
                </p>
              </div>
            </div>
          )}

        </div>
      </div>

      <div className="flex-shrink-0 flex justify-between items-center px-5 py-3 border-t bg-white">
        <span className="text-xs text-slate-400">Submitted {dayjs(d.created_at).format('DD MMM YYYY HH:mm')}</span>
        <div className="flex gap-2">
          {isManager && d.status === 'submitted' && (
            <button onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">
              {reviewMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Mark Reviewed
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function EngineerDailyLogPage() {
  const { user, selectedProjectId } = useAuthStore();
  const isManager = isManagerRole(user?.role);

  const [showForm, setShowForm]     = useState(false);
  const [editLog, setEditLog]       = useState(null);
  const [viewLog, setViewLog]       = useState(null);
  const [search, setSearch]         = useState('');
  const [filterProject, setFilterProject] = useState(selectedProjectId || '');
  const [filterStatus, setFilterStatus]   = useState('');

  useEffect(() => {
    if (!isManager) setFilterProject(selectedProjectId || '');
  }, [isManager, selectedProjectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-simple'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });

  const { data: stats } = useQuery({
    queryKey: ['engineer-log-stats'],
    queryFn: () => engineerLogAPI.stats().then(r => r.data?.data ?? r.data ?? {}).catch(() => ({})),
    staleTime: 0,
  });

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['engineer-logs', filterProject, filterStatus, search],
    queryFn: () => engineerLogAPI.list({
      ...(filterProject && { project_id: filterProject }),
      ...(filterStatus  && { status: filterStatus }),
      ...(search        && { search }),
    }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const openEdit = (log) => { setViewLog(null); setEditLog(log); };

  const kpis = [
    { label: 'This Month',       value: stats?.this_month  || 0, sub: 'Logs submitted',      color: 'blue',    icon: ClipboardList },
    { label: 'Today',            value: stats?.today       || 0, sub: 'Submitted today',      color: 'emerald', icon: CalendarDays  },
    { label: 'Pending Review',   value: stats?.pending_review || 0, sub: 'Awaiting manager',  color: 'amber',   icon: Clock         },
    { label: 'Activities Done',  value: stats?.activities_completed || 0, sub: `of ${stats?.activities_total || 0} this month`, color: 'orange', icon: TrendingUp },
  ];

  // Group today's logs
  const today = dayjs().format('YYYY-MM-DD');
  const todayLogs = logs.filter(l => l.log_date?.slice(0,10) === today);
  const olderLogs = logs.filter(l => l.log_date?.slice(0,10) !== today);

  const alreadySubmittedToday = !isManager && todayLogs.some(l => l.engineer_id === user?.id);

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader
        title="Engineer Daily Log"
        subtitle="Log your daily work activities, quantities achieved and site issues"
        actions={
          <button
            onClick={() => { setEditLog(null); setShowForm(true); }}
            disabled={alreadySubmittedToday}
            title={alreadySubmittedToday ? 'Already submitted today — edit existing log' : ''}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${Theme.navy}, ${Theme.navyDark})` }}>
            <Plus size={15} />
            {alreadySubmittedToday ? "Today's Log ✓" : "Today's Log"}
          </button>
        }
      />

      <div className="p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map(k => (
            <ThemeKpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} icon={k.icon} color={k.color} />
          ))}
        </div>

        {/* Quick tip banner */}
        {!alreadySubmittedToday && !isManager && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <ClipboardList size={16} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-900">Submit today's log before you leave site</p>
              <p className="text-xs text-indigo-500 mt-0.5">Takes 2 minutes · your manager reviews it each evening</p>
            </div>
            <button onClick={() => setShowForm(true)}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition flex-shrink-0">
              <Plus size={14} /> Start Log
            </button>
          </div>
        )}

        {/* Filter bar + List */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Search logs…" />
            </div>
            {isManager && (
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
              </select>
            )}
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="">All Statuses</option>
              {Object.entries(LOG_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={() => refetch()} className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100">
              <RefreshCw size={14} />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw size={18} className="animate-spin mr-2" /> Loading logs…
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <ClipboardList size={40} className="mb-3 opacity-30" />
              <p className="font-semibold">No logs yet</p>
              <p className="text-sm mt-1">Submit your first daily log to get started</p>
              <button onClick={() => setShowForm(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition">
                <Plus size={14} /> Start Today's Log
              </button>
            </div>
          ) : (
            <div>
              {/* Today's logs */}
              {todayLogs.length > 0 && (
                <>
                  <div className="px-5 py-2 bg-indigo-50 border-b border-indigo-100">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Today</span>
                  </div>
                  {todayLogs.map(log => <LogRow key={log.id} log={log} onView={() => setViewLog(log)} onEdit={openEdit} isManager={isManager} />)}
                </>
              )}
              {/* Older logs */}
              {olderLogs.length > 0 && (
                <>
                  {todayLogs.length > 0 && (
                    <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Earlier</span>
                    </div>
                  )}
                  {olderLogs.map(log => <LogRow key={log.id} log={log} onView={() => setViewLog(log)} onEdit={openEdit} isManager={isManager} />)}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {(showForm || editLog) && (
        <LogForm
          log={editLog}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onClose={() => { setShowForm(false); setEditLog(null); }}
        />
      )}
      {viewLog && (
        <LogDetail
          log={viewLog}
          onClose={() => setViewLog(null)}
          onEdit={openEdit}
        />
      )}
    </div>
  );
}

/* ── Log table row ───────────────────────────────────────────────────────── */
function LogRow({ log, onView, onEdit, isManager }) {
  const weather = WEATHER_OPTIONS.find(w => w.value === log.weather) || WEATHER_OPTIONS[0];
  const WIcon = weather.icon;
  const completed = parseInt(log.completed_count) || 0;
  const total = parseInt(log.activity_count) || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-50 hover:bg-slate-50/60 transition-colors cursor-pointer"
      onClick={onView}>
      {/* Date */}
      <div className="w-20 flex-shrink-0 text-center">
        <p className="text-lg font-bold text-slate-800 leading-none">{dayjs(log.log_date).format('DD')}</p>
        <p className="text-[10px] text-slate-400 font-semibold uppercase">{dayjs(log.log_date).format('MMM YYYY')}</p>
        <p className="text-[9px] text-slate-300 mt-0.5">{dayjs(log.log_date).format('ddd')}</p>
      </div>

      {/* Weather */}
      <div className="w-7 flex-shrink-0 flex justify-center">
        <WIcon size={18} className={weather.color} />
      </div>

      {/* Project + Engineer */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm truncate">
          {isManager ? `${log.engineer_name} · ` : ''}{log.project_name}
        </p>
        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{log.log_number} · {log.project_code}</p>
      </div>

      {/* Activity progress */}
      <div className="w-32 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-400">{completed}/{total} activities</span>
          <span className="text-[10px] font-bold text-slate-600">{pct}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={clsx('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-blue-500')}
            style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Manpower */}
      <div className="w-20 text-center flex-shrink-0">
        <p className="text-sm font-bold text-slate-700">{log.manpower_count || 0}</p>
        <p className="text-[10px] text-slate-400">workers</p>
      </div>

      {/* Status */}
      <div className="w-24 flex-shrink-0">
        <StatusBadge status={log.status} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={onView} className="p-1.5 text-slate-400 hover:text-indigo-600 transition">
          <Eye size={15} />
        </button>
        {log.status !== 'reviewed' && (
          <button onClick={() => onEdit(log)} className="p-1.5 text-slate-400 hover:text-amber-600 transition">
            <Edit2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
