// src/pages/hr-admin/EmployeeListPage.jsx  — Modern redesign
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, Plus, Search, UserCheck, UserX, Briefcase, Building2,
  LayoutGrid, List, ChevronRight, X, SlidersHorizontal,
  Phone, Mail, Calendar, ArrowUpRight,
} from 'lucide-react';
import { hrEmployeesAPI, hrMastersAPI } from '../../api/client';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_GRADS = [
  ['#6366F1','#4F46E5'], ['#0EA5E9','#0284C7'], ['#10B981','#059669'],
  ['#F59E0B','#D97706'], ['#EF4444','#DC2626'], ['#8B5CF6','#7C3AED'],
  ['#EC4899','#DB2777'], ['#14B8A6','#0D9488'], ['#F97316','#EA580C'],
];
const avatarGrad = (name) => AVATAR_GRADS[(name?.charCodeAt(0) || 0) % AVATAR_GRADS.length];
const initials = (name) => (name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

const STATUS_CFG = {
  active:     { label: 'Active',      bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  resigned:   { label: 'Resigned',    bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  terminated: { label: 'Terminated',  bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'     },
  absconded:  { label: 'Absconded',   bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500'    },
};
const TYPE_CFG = {
  permanent:  { label: 'Permanent', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  probation:  { label: 'Probation', bg: 'bg-amber-50',  text: 'text-amber-700'  },
  contract:   { label: 'Contract',  bg: 'bg-purple-50', text: 'text-purple-700' },
  intern:     { label: 'Intern',    bg: 'bg-gray-100',  text: 'text-gray-600'   },
};

const fade = (d = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, delay: d, ease: [0.16, 1, 0.3, 1] },
});

// ── Employee Card ─────────────────────────────────────────────────────────────
function EmpCard({ emp, onClick }) {
  const [g1, g2] = avatarGrad(emp.name);
  const status = STATUS_CFG[emp.employment_status] || STATUS_CFG.active;
  const type   = TYPE_CFG[emp.employment_type]     || TYPE_CFG.permanent;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.10)' }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 p-5 cursor-pointer relative overflow-hidden"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-medium text-lg select-none"
            style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
            {initials(emp.name)}
          </div>
          {/* online dot for active */}
          {emp.employment_status === 'active' && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
          )}
        </div>
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 ${status.bg} ${status.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {/* Name & designation */}
      <div className="mb-3">
        <p className="font-medium text-slate-900 leading-tight">{emp.name}</p>
        <p className="text-xs text-slate-900 font-medium mt-0.5">{emp.employee_code}</p>
        <p className="text-sm text-slate-900 mt-1.5 font-medium">{emp.designation_name || emp.designation || '—'}</p>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
          <Building2 className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{emp.department_name || 'No Department'}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${type.bg} ${type.text}`}>
          {type.label}
        </span>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Calendar className="w-3 h-3" />
          {emp.date_of_joining
            ? new Date(emp.date_of_joining).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
            : '—'}
        </div>
      </div>

      {/* hover chevron */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </div>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function EmployeeListPage() {
  const navigate = useNavigate();
  const [search,       setSearch]       = useState('');
  const [deptFilter,   setDeptFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [view,         setView]         = useState('card');
  const [showFilters,  setShowFilters]  = useState(false);

  const { data: empData, isLoading } = useQuery({
    queryKey: ['hr-employees', search, deptFilter, statusFilter],
    queryFn: () => hrEmployeesAPI.list({
      search: search || undefined,
      department_id: deptFilter || undefined,
      employment_status: statusFilter || undefined,
    }).then(r => r.data),
  });

  const { data: deptData } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data),
  });

  const allEmployees = empData?.data || [];
  const departments  = deptData?.data || [];

  // client-side type filter
  const employees = useMemo(() =>
    typeFilter ? allEmployees.filter(e => e.employment_type === typeFilter) : allEmployees,
    [allEmployees, typeFilter]
  );

  // KPIs from full list
  const kpis = useMemo(() => ({
    total:      allEmployees.length,
    permanent:  allEmployees.filter(e => e.employment_type === 'permanent').length,
    probation:  allEmployees.filter(e => e.employment_type === 'probation').length,
    contract:   allEmployees.filter(e => e.employment_type === 'contract').length,
  }), [allEmployees]);

  const activeFilters = [deptFilter, typeFilter].filter(Boolean).length;

  return (
    <div className="p-6 space-y-5" style={{ background: '#F8F9FA', minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div {...fade(0)} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Employees</h1>
            <p className="text-sm text-gray-500">
              {employees.length} {statusFilter || 'total'} employee{employees.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/hr-admin/employees/new')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium shadow-sm transition-all hover:shadow-md active:scale-95"
          style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}
        >
          <Plus className="w-4 h-4" /> Add Employee
        </button>
      </motion.div>

      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <motion.div {...fade(0.05)} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Active',    value: kpis.total,     icon: UserCheck,  color: '#6366F1', bg: '#EEF2FF', filter: ''          },
          { label: 'Permanent',       value: kpis.permanent, icon: Briefcase,  color: '#0EA5E9', bg: '#E0F2FE', filter: 'permanent'  },
          { label: 'On Probation',    value: kpis.probation, icon: Users,      color: '#F59E0B', bg: '#FFFBEB', filter: 'probation'  },
          { label: 'Contract / Intern', value: kpis.contract, icon: UserX,    color: '#EF4444', bg: '#FEF2F2', filter: 'contract'   },
        ].map((c, i) => (
          <motion.button
            key={c.label}
            onClick={() => setTypeFilter(prev => prev === c.filter ? '' : c.filter)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            className={`bg-white rounded-2xl p-4 text-left shadow-sm border transition-all ${typeFilter === c.filter ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-100 hover:border-gray-200'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500">{c.label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
                <c.icon className="w-4 h-4" style={{ color: c.color }} />
              </div>
            </div>
            <p className="text-2xl font-medium text-gray-900">{c.value}</p>
          </motion.button>
        ))}
      </motion.div>

      {/* ── Search + Filter Bar ─────────────────────────────────────────────── */}
      <motion.div {...fade(0.10)} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, code, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 font-medium placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-900 font-medium hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {[
              { value: 'active',     label: 'Active'      },
              { value: 'resigned',   label: 'Resigned'    },
              { value: 'terminated', label: 'Terminated'  },
              { value: '',           label: 'All'         },
            ].map(s => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === s.value
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-900 font-medium hover:text-gray-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Filter button */}
          <button
            onClick={() => setShowFilters(p => !p)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
              showFilters || activeFilters > 0
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-gray-50 text-slate-900 border-gray-200 hover:border-gray-300'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilters > 0 && (
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-medium flex items-center justify-center">{activeFilters}</span>
            )}
          </button>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button onClick={() => setView('card')} className={`p-1.5 rounded-lg transition-all ${view === 'card' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-900 font-medium hover:text-gray-600'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setView('list')} className={`p-1.5 rounded-lg transition-all ${view === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-900 font-medium hover:text-gray-600'}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
                <div>
                  <label className="text-xs text-slate-600 font-medium block mb-1">Department</label>
                  <select
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-indigo-400"
                  >
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-600 font-medium block mb-1">Employment Type</label>
                  <div className="flex gap-2">
                    {['', 'permanent', 'probation', 'contract', 'intern'].map(t => (
                      <button key={t}
                        onClick={() => setTypeFilter(t)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                          typeFilter === t
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-gray-50 text-slate-900 font-medium border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {t || 'All Types'}
                      </button>
                    ))}
                  </div>
                </div>
                {(deptFilter || typeFilter) && (
                  <button
                    onClick={() => { setDeptFilter(''); setTypeFilter(''); }}
                    className="self-end flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium"
                  >
                    <X className="w-3.5 h-3.5" /> Clear filters
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
            <p className="text-sm text-gray-400">Loading employees…</p>
          </div>
        </div>
      )}

      {/* ── Card Grid ───────────────────────────────────────────────────────── */}
      {!isLoading && view === 'card' && (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <AnimatePresence>
            {employees.map(emp => (
              <EmpCard
                key={emp.id}
                emp={emp}
                onClick={() => navigate(`/hr-admin/employees/${emp.id}`)}
              />
            ))}
          </AnimatePresence>
          {employees.length === 0 && (
            <div className="col-span-full py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-slate-900 font-medium font-medium">No employees found</p>
              <p className="text-sm text-slate-900 font-medium mt-1">Try adjusting your filters or search</p>
            </div>
          )}
        </motion.div>
      )}

      {/* ── List View ───────────────────────────────────────────────────────── */}
      {!isLoading && view === 'list' && (
        <motion.div {...fade(0.12)} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">
            <div className="col-span-3">Employee</div>
            <div className="col-span-2">Department</div>
            <div className="col-span-2">Designation</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Joined</div>
            <div className="col-span-1">Status</div>
          </div>

          <div className="divide-y divide-gray-50">
            {employees.map(emp => {
              const [g1, g2] = avatarGrad(emp.name);
              const status = STATUS_CFG[emp.employment_status] || STATUS_CFG.active;
              const type   = TYPE_CFG[emp.employment_type]     || TYPE_CFG.permanent;
              return (
                <motion.div
                  key={emp.id}
                  onClick={() => navigate(`/hr-admin/employees/${emp.id}`)}
                  whileHover={{ backgroundColor: '#F9FAFB' }}
                  className="grid grid-cols-12 px-5 py-3.5 cursor-pointer items-center transition-colors"
                >
                  {/* Name */}
                  <div className="col-span-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
                      {initials(emp.name)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.employee_code}</p>
                    </div>
                  </div>
                  <div className="col-span-2 text-sm text-slate-900 truncate pr-3">{emp.department_name || '—'}</div>
                  <div className="col-span-2 text-sm text-slate-900 truncate pr-3">{emp.designation_name || emp.designation || '—'}</div>
                  <div className="col-span-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${type.bg} ${type.text}`}>{type.label}</span>
                  </div>
                  <div className="col-span-2 text-sm text-gray-500">
                    {emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString('en-IN') : '—'}
                  </div>
                  <div className="col-span-1">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {employees.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">No employees found</div>
          )}
        </motion.div>
      )}
    </div>
  );
}
