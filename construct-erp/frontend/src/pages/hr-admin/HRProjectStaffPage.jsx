// src/pages/hr-admin/HRProjectStaffPage.jsx — Project-wise staff roster
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, UserCheck, UserX, Search, ChevronRight,
  HardHat, Briefcase, Phone, Mail, FolderKanban, X,
  AlertCircle, MapPin, SlidersHorizontal,
} from 'lucide-react';
import { clsx } from 'clsx';
import { hrEmployeesAPI, projectAPI } from '../../api/client';
import { PageHeader } from '../../theme';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_GRADS = [
  ['#6366F1','#4F46E5'],['#0EA5E9','#0284C7'],['#10B981','#059669'],
  ['#F59E0B','#D97706'],['#EF4444','#DC2626'],['#8B5CF6','#7C3AED'],
  ['#EC4899','#DB2777'],['#14B8A6','#0D9488'],['#F97316','#EA580C'],
];
const avatarGrad = (name) => AVATAR_GRADS[(name?.charCodeAt(0) || 0) % AVATAR_GRADS.length];
const initials   = (name) => (name||'U').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

const STATUS_CFG = {
  active:     { label:'Active',     cls:'bg-emerald-100 text-emerald-700' },
  resigned:   { label:'Resigned',   cls:'bg-amber-100 text-amber-700'   },
  terminated: { label:'Terminated', cls:'bg-red-100 text-red-700'       },
  absconded:  { label:'Absconded',  cls:'bg-rose-100 text-rose-700'     },
};

const TYPE_CFG = {
  permanent: { label:'Permanent', cls:'bg-indigo-50 text-indigo-700' },
  probation: { label:'Probation', cls:'bg-amber-50 text-amber-700'   },
  contract:  { label:'Contract',  cls:'bg-purple-50 text-purple-700' },
  intern:    { label:'Intern',    cls:'bg-gray-100 text-gray-600'    },
};

// ── Staff card ────────────────────────────────────────────────────────────────
function StaffCard({ emp }) {
  const navigate = useNavigate();
  const [g1, g2] = avatarGrad(emp.name);
  const status   = STATUS_CFG[emp.employment_status] || STATUS_CFG.active;
  const empType  = TYPE_CFG[emp.employment_type]     || {};

  return (
    <div
      onClick={() => navigate(`/hr-admin/employees/${emp.id}`)}
      className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}
      >
        {initials(emp.name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
              {emp.name}
            </p>
            <p className="text-[11px] text-slate-400 font-mono">{emp.employee_code || '—'}</p>
          </div>
          <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0', status.cls)}>
            {status.label}
          </span>
        </div>

        <p className="text-xs text-slate-600 mt-1 truncate">
          {emp.designation_name || emp.designation || '—'}
        </p>
        {emp.department_name && (
          <p className="text-[11px] text-slate-400 mt-0.5 truncate flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            {emp.department_name}
          </p>
        )}

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {emp.employment_type && (
            <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', empType.cls)}>
              {empType.label || emp.employment_type}
            </span>
          )}
          {emp.phone && (
            <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
              <Phone className="w-3 h-3" />
              {emp.phone}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors flex-shrink-0 mt-1" />
    </div>
  );
}

// ── Project section ───────────────────────────────────────────────────────────
function ProjectSection({ project, employees, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const active   = employees.filter(e => (e.employment_status || 'active') === 'active').length;
  const inactive = employees.length - active;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center flex-shrink-0">
          <FolderKanban className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-800">{project.name}</span>
            {project.project_code && (
              <span className="text-[11px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                {project.project_code}
              </span>
            )}
            {project.location && (
              <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                <MapPin className="w-3 h-3" />{project.location}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Users className="w-3 h-3" />
              <strong>{employees.length}</strong> staff
            </span>
            {active > 0 && (
              <span className="text-[11px] text-emerald-600 flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                {active} active
              </span>
            )}
            {inactive > 0 && (
              <span className="text-[11px] text-amber-600">{inactive} inactive</span>
            )}
          </div>
        </div>
        <ChevronRight className={clsx('w-4 h-4 text-slate-400 transition-transform flex-shrink-0', open && 'rotate-90')} />
      </button>

      {/* Staff grid */}
      {open && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {employees.map(emp => <StaffCard key={emp.id} emp={emp} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HRProjectStaffPage() {
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterType, setFilterType]     = useState('');

  // Fetch all employees (no project filter — we group on frontend)
  const { data: empRes, isLoading } = useQuery({
    queryKey: ['hr-employees-project-staff', filterStatus, filterType],
    queryFn: () => hrEmployeesAPI.list({
      employment_status: filterStatus || undefined,
      employment_type:   filterType   || undefined,
      limit: 1000,
    }).then(r => r.data?.data || []),
  });

  // Fetch projects for sorting by status (active projects first)
  const { data: projRes } = useQuery({
    queryKey: ['projects-list-simple'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data || r.data || []),
  });

  const allEmployees = empRes || [];

  // Filter by search
  const q = search.toLowerCase();
  const employees = useMemo(() => {
    if (!q) return allEmployees;
    return allEmployees.filter(e =>
      `${e.name} ${e.employee_code||''} ${e.email||''} ${e.designation_name||''} ${e.department_name||''}`.toLowerCase().includes(q)
    );
  }, [allEmployees, q]);

  // Group by project
  const { projectGroups, unassigned, projectOrder } = useMemo(() => {
    const groups = {};
    const unassignedList = [];
    for (const emp of employees) {
      if (emp.project_id) {
        if (!groups[emp.project_id]) {
          groups[emp.project_id] = {
            id: emp.project_id,
            name: emp.project_name || 'Unknown Project',
            project_code: emp.project_code,
          };
        }
        if (!groups[emp.project_id].employees) groups[emp.project_id].employees = [];
        groups[emp.project_id].employees.push(emp);
      } else {
        unassignedList.push(emp);
      }
    }

    // Sort projects: those in projRes first (preserving active status ordering)
    const projectsList = projRes || [];
    const projectIds = projectsList.map(p => p.id);
    const order = Object.keys(groups).sort((a, b) => {
      const ia = projectIds.indexOf(a);
      const ib = projectIds.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return (groups[a].name || '').localeCompare(groups[b].name || '');
    });

    return { projectGroups: groups, unassigned: unassignedList, projectOrder: order };
  }, [employees, projRes]);

  // KPIs
  const totalStaff        = allEmployees.length;
  const assignedCount     = allEmployees.filter(e => e.project_id).length;
  const unassignedCount   = allEmployees.filter(e => !e.project_id).length;
  const projectCount      = Object.keys(projectGroups).length;

  const KPI_CARDS = [
    { label: 'Total Staff',         value: totalStaff,      icon: Users,       color: 'indigo' },
    { label: 'Projects with Staff', value: projectCount,    icon: FolderKanban, color: 'blue'  },
    { label: 'Assigned to Project', value: assignedCount,   icon: UserCheck,   color: 'emerald'},
    { label: 'Head Office (HO)',    value: unassignedCount, icon: Building2,   color: 'amber'  },
  ];

  const COLOR_MAP = {
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  icon: 'text-indigo-500'  },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    icon: 'text-blue-500'    },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'text-emerald-500' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   icon: 'text-amber-500'   },
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader
        title="Project-wise Staff"
        subtitle="View staff assigned to each project"
        breadcrumbs={[{ label: 'HR & Admin' }, { label: 'Project-wise Staff' }]}
      />

      <div className="flex-1 overflow-auto p-5 md:p-6 space-y-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {KPI_CARDS.map(({ label, value, icon: Icon, color }) => {
            const c = COLOR_MAP[color];
            return (
              <div key={label} className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm flex items-center gap-4">
                <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center', c.bg)}>
                  <Icon className={clsx('w-5 h-5', c.icon)} />
                </div>
                <div>
                  <div className={clsx('text-2xl font-bold', c.text)}>{value}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, code, designation…"
              className="w-full pl-8 pr-8 h-9 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-indigo-400 bg-slate-50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status tabs */}
          <div className="flex gap-1">
            {[
              { key: 'active',     label: 'Active'    },
              { key: 'resigned',   label: 'Resigned'  },
              { key: 'terminated', label: 'Terminated'},
              { key: '',           label: 'All'       },
            ].map(s => (
              <button key={s.key}
                onClick={() => setFilterStatus(s.key)}
                className={clsx('h-8 px-3 rounded-lg text-xs font-medium transition-colors',
                  filterStatus === s.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="h-8 pl-3 pr-8 rounded-lg border border-slate-200 text-xs text-slate-600 bg-slate-50 focus:outline-none focus:border-indigo-400">
            <option value="">All Types</option>
            <option value="permanent">Permanent</option>
            <option value="contract">Contract</option>
            <option value="probation">Probation</option>
            <option value="intern">Intern</option>
          </select>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="py-16 text-center text-slate-400 text-sm">Loading staff…</div>
        )}

        {/* No results */}
        {!isLoading && employees.length === 0 && (
          <div className="py-16 text-center">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No staff found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your search or filter</p>
          </div>
        )}

        {/* Project sections */}
        {!isLoading && projectOrder.map((projectId, idx) => {
          const project = projectGroups[projectId];
          const projDetail = (projRes || []).find(p => p.id === projectId) || {};
          return (
            <ProjectSection
              key={projectId}
              project={{ ...project, location: projDetail.location || projDetail.site_location }}
              employees={project.employees || []}
              defaultOpen={idx < 3}
            />
          );
        })}

        {/* Head Office section */}
        {!isLoading && unassigned.length > 0 && (
          <div className="bg-white rounded-2xl border border-indigo-200 overflow-hidden shadow-sm">
            <details open={projectOrder.length === 0}>
              <summary className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-indigo-50/50 transition-colors list-none">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">Head Office (HO)</span>
                    <span className="text-[11px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                      {unassigned.length} staff
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Head office and support staff</p>
                </div>
                <ChevronRight className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              </summary>
              <div className="border-t border-indigo-100 px-5 pb-5 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {unassigned.map(emp => <StaffCard key={emp.id} emp={emp} />)}
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
