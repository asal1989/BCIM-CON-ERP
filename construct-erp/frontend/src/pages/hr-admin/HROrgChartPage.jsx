// HR Organization Chart — Department View (default) + Hierarchy View
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, GitBranch, Building2, MapPin,
  ChevronDown, ChevronRight, Layers, Network,
  Mail, Phone, Briefcase,
} from 'lucide-react';
import { hrAdvancedAPI } from '../../api/client';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  ['#6366F1','#4F46E5'],['#0EA5E9','#0284C7'],['#10B981','#059669'],
  ['#F59E0B','#D97706'],['#EF4444','#DC2626'],['#8B5CF6','#7C3AED'],
  ['#EC4899','#DB2777'],['#14B8A6','#0D9488'],['#F97316','#EA580C'],
  ['#06B6D4','#0891B2'],
];
const DEPT_COLORS = [
  '#2563EB','#059669','#D97706','#DC2626','#7C3AED',
  '#0D9488','#DB2777','#F97316','#0891B2','#65A30D',
];
const avatarGrad = (n='') => AVATAR_COLORS[(n.charCodeAt(0)||0) % AVATAR_COLORS.length];
const initials   = (n='') => n.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase() || 'U';
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name='', photo='', size=40, ring=false }) {
  const [g1, g2] = avatarGrad(name);
  const style = { width:size, height:size, fontSize:Math.round(size*0.36), flexShrink:0 };
  const cls = `rounded-full flex-shrink-0 ${ring?'ring-2 ring-white ring-offset-1':''}`;
  if (photo) return <img src={photo} alt={name} className={`${cls} object-cover`} style={style}/>;
  return (
    <div className={`${cls} flex items-center justify-center font-bold text-white`}
      style={{...style, background:`linear-gradient(135deg,${g1},${g2})`}}>
      {initials(name)}
    </div>
  );
}

// ── Employee Card (compact) ───────────────────────────────────────────────────
function EmpCard({ emp, onClick, highlight=false, compact=false }) {
  return (
    <motion.div
      whileHover={{y:-2, boxShadow:'0 8px 24px rgba(10,31,92,0.14)'}}
      onClick={() => onClick(emp)}
      className={`bg-white rounded-2xl border cursor-pointer transition-all flex flex-col items-center text-center p-4 gap-2
        ${compact ? 'w-36' : 'w-44'}
        ${highlight ? 'ring-2 ring-yellow-400 ring-offset-1 border-yellow-300' : 'border-gray-100 hover:border-blue-200'}
      `}
      style={{boxShadow:'0 2px 10px rgba(10,31,92,0.07)'}}>
      <Avatar name={emp.name} photo={emp.profile_photo_url} size={compact?36:44} ring/>
      <div className="w-full min-w-0">
        <p className={`font-bold text-gray-900 leading-tight truncate ${compact?'text-[11px]':'text-[12px]'}`}>{emp.name}</p>
        {emp.designation && (
          <p className={`text-blue-600 font-semibold mt-0.5 truncate ${compact?'text-[9px]':'text-[10px]'}`}>{emp.designation}</p>
        )}
        {!compact && emp.work_location && (
          <p className="text-[9px] text-gray-400 mt-0.5 flex items-center justify-center gap-0.5 truncate">
            <MapPin size={7}/>{emp.work_location}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Org Node (for hierarchy tree) ─────────────────────────────────────────────
function OrgTreeNode({ node, allEmps, collapsed, toggle, onClick, searchQ, depth=0 }) {
  const children = allEmps.filter(e => e.reporting_manager_id === node.id);
  const isOpen   = !collapsed[node.id];
  const isRoot   = depth === 0;

  const hl = searchQ && (
    node.name?.toLowerCase().includes(searchQ) ||
    node.designation?.toLowerCase().includes(searchQ) ||
    node.department?.toLowerCase().includes(searchQ)
  );

  return (
    <div className="flex flex-col items-center" style={{margin:'0 6px'}}>
      {/* Card */}
      <motion.div
        initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}}
        transition={{duration:0.3,delay:Math.min(depth*0.05,0.3)}}
        onClick={() => onClick(node)}
        className={`cursor-pointer rounded-2xl border flex flex-col items-center text-center transition-all
          ${isRoot ? 'w-52 p-5' : depth===1 ? 'w-44 p-4' : 'w-36 p-3'}
          ${hl ? 'ring-2 ring-yellow-400 border-yellow-300' : ''}
        `}
        style={{
          background: isRoot ? 'linear-gradient(135deg,#0A1F5C,#1d4ed8)' : '#fff',
          boxShadow: isRoot ? '0 10px 32px rgba(10,31,92,0.28)' : '0 2px 12px rgba(10,31,92,0.08)',
          border: isRoot ? 'none' : hl ? undefined : '1px solid #e5e7eb',
        }}
      >
        <Avatar name={node.name} photo={node.profile_photo_url} size={isRoot?52:depth===1?42:34} ring/>
        <div className="mt-2 w-full min-w-0">
          <p className={`font-bold leading-tight truncate ${isRoot?'text-white text-[13px]':depth===1?'text-gray-900 text-[12px]':'text-gray-900 text-[11px]'}`}>
            {node.name}
          </p>
          {node.designation && (
            <p className={`font-semibold mt-0.5 truncate ${isRoot?'text-blue-200 text-[10px]':'text-blue-600 text-[10px]'}`}>
              {node.designation}
            </p>
          )}
          {node.department && !isRoot && (
            <p className="text-[9px] text-gray-400 mt-0.5 truncate">{node.department}</p>
          )}
          {node.work_location && (
            <p className={`text-[9px] mt-0.5 flex items-center justify-center gap-0.5 truncate ${isRoot?'text-blue-300':'text-gray-400'}`}>
              <MapPin size={7}/>{node.work_location}
            </p>
          )}
        </div>
        {children.length > 0 && (
          <span className={`mt-2 text-[9px] font-bold px-2 py-0.5 rounded-full ${isRoot?'bg-white/20 text-white':'bg-blue-50 text-blue-600'}`}>
            {children.length} report{children.length!==1?'s':''}
          </span>
        )}
      </motion.div>

      {/* Toggle */}
      {children.length > 0 && (
        <button
          onClick={e=>{e.stopPropagation(); toggle(node.id);}}
          className="mt-1.5 w-6 h-6 rounded-full bg-white border-2 border-blue-300 flex items-center justify-center text-blue-600 shadow-sm hover:bg-blue-50 transition-colors z-10 flex-shrink-0"
        >
          {isOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
        </button>
      )}

      {/* Children */}
      {children.length > 0 && isOpen && (
        <div className="flex flex-col items-center">
          <div style={{width:1,height:12,background:'#d1d5db'}}/>
          {children.length > 1 && (
            <div style={{display:'flex',width:'100%',borderTop:'1px solid #d1d5db',minWidth:children.length*160}}/>
          )}
          <div className="flex items-start">
            {children.map(child => (
              <div key={child.id} className="flex flex-col items-center">
                <div style={{width:1,height:14,background:'#d1d5db'}}/>
                <OrgTreeNode node={child} allEmps={allEmps} collapsed={collapsed}
                  toggle={toggle} onClick={onClick} searchQ={searchQ} depth={depth+1}/>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Department View ────────────────────────────────────────────────────────────
function DepartmentView({ employees, onClick, searchQ }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (d) => setCollapsed(c => ({...c,[d]:!c[d]}));

  const grouped = useMemo(() => {
    const map = {};
    employees.forEach(e => {
      const d = e.department || 'Unassigned';
      if (!map[d]) map[d]=[];
      map[d].push(e);
    });
    return Object.entries(map).sort(([a],[b]) => {
      if (a==='Unassigned') return 1;
      if (b==='Unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [employees]);

  const filtered = useMemo(() => {
    if (!searchQ) return grouped;
    return grouped.map(([dept, members]) => {
      const f = members.filter(e =>
        e.name?.toLowerCase().includes(searchQ) ||
        e.designation?.toLowerCase().includes(searchQ) ||
        dept.toLowerCase().includes(searchQ)
      );
      return [dept, f];
    }).filter(([,m]) => m.length > 0);
  }, [grouped, searchQ]);

  return (
    <div className="flex flex-col items-center pb-16">
      {/* Company Root */}
      <motion.div {...fade(0)} className="flex flex-col items-center mb-2">
        <div className="rounded-2xl px-8 py-4 flex items-center gap-3"
          style={{background:'linear-gradient(135deg,#0A1F5C,#1d4ed8)',boxShadow:'0 8px 28px rgba(10,31,92,0.25)'}}>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Building2 size={20} className="text-white"/>
          </div>
          <div>
            <p className="font-bold text-white text-base">BCIM</p>
            <p className="text-blue-200 text-[11px]">{employees.length} staff</p>
          </div>
        </div>
        {/* Vertical line to departments */}
        <div style={{width:1,height:20,background:'#d1d5db'}}/>
        {/* Horizontal span */}
        {filtered.length > 1 && (
          <div style={{width:Math.min(filtered.length,6)*200,maxWidth:'80vw',height:1,background:'#d1d5db'}}/>
        )}
      </motion.div>

      {/* Departments Row */}
      <div className="flex flex-wrap justify-center gap-8 px-4">
        {filtered.map(([dept, members], di) => {
          const deptColor = DEPT_COLORS[di % DEPT_COLORS.length];
          const isOpen = !collapsed[dept];
          return (
            <motion.div key={dept} {...fade(di*0.06)} className="flex flex-col items-center">
              {/* Vertical connector */}
              <div style={{width:1,height:16,background:'#d1d5db'}}/>

              {/* Dept header card */}
              <div className="rounded-2xl border px-5 py-3 flex items-center gap-3 cursor-pointer transition-all hover:shadow-lg"
                style={{borderColor:`${deptColor}40`,background:`${deptColor}0d`,boxShadow:`0 2px 12px ${deptColor}18`}}
                onClick={()=>toggle(dept)}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{background:`${deptColor}22`}}>
                  <Building2 size={15} style={{color:deptColor}}/>
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-[12px] leading-tight">{dept}</p>
                  <p className="text-[10px]" style={{color:deptColor}}>{members.length} member{members.length!==1?'s':''}</p>
                </div>
                <div className="ml-2 text-gray-400">
                  {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                </div>
              </div>

              {/* Employees */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                    className="overflow-hidden">
                    <div style={{width:1,height:12,background:'#d1d5db',margin:'0 auto'}}/>
                    {/* Members grid */}
                    <div className={`flex flex-wrap justify-center gap-3 ${members.length>4?'max-w-[360px]':''}`}>
                      {members.map((emp, ei) => {
                        const hl = searchQ && (
                          emp.name?.toLowerCase().includes(searchQ) ||
                          emp.designation?.toLowerCase().includes(searchQ)
                        );
                        return (
                          <div key={emp.id} className="flex flex-col items-center">
                            <div style={{width:1,height:10,background:'#e5e7eb'}}/>
                            <EmpCard emp={emp} onClick={onClick} highlight={hl} compact={members.length>3}/>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-3 text-gray-400">
          <Users size={40} className="text-gray-200"/>
          <p className="text-sm">No employees match your search</p>
        </div>
      )}
    </div>
  );
}

// ── Hierarchy View ─────────────────────────────────────────────────────────────
function HierarchyView({ employees, onClick, searchQ }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (id) => setCollapsed(c => ({...c,[id]:!c[id]}));

  const empIds = useMemo(() => new Set(employees.map(e => e.id)), [employees]);

  // Roots = no manager OR manager not in our list
  const roots = useMemo(() =>
    employees.filter(e => !e.reporting_manager_id || !empIds.has(e.reporting_manager_id)),
    [employees, empIds]
  );

  // Everyone who is NOT reachable from roots
  const reachable = useMemo(() => {
    const seen = new Set();
    function walk(id) {
      seen.add(id);
      employees.filter(e => e.reporting_manager_id === id).forEach(c => walk(c.id));
    }
    roots.forEach(r => walk(r.id));
    return seen;
  }, [roots, employees]);

  const unlinked = employees.filter(e => !reachable.has(e.id));

  const expandAll  = () => setCollapsed({});
  const collapseAll = () => {
    const c = {};
    employees.forEach(e => { c[e.id]=true; });
    setCollapsed(c);
  };

  if (roots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-60 text-sm text-gray-400 gap-3">
        <GitBranch size={40} className="text-gray-200"/>
        <p className="text-center max-w-xs">No hierarchy configured yet.<br/>
          Set <strong>Reporting Manager</strong> in employee profiles to build the hierarchy tree.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center pb-20">
      <div className="flex gap-2 mb-6 self-end mr-4">
        <button onClick={expandAll}  className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">Expand All</button>
        <button onClick={collapseAll} className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">Collapse All</button>
      </div>

      <div className="overflow-x-auto w-full flex justify-center">
        <div className="inline-flex gap-16 flex-wrap justify-center px-8">
          {roots.map(root => (
            <OrgTreeNode key={root.id} node={root} allEmps={employees}
              collapsed={collapsed} toggle={toggle} onClick={onClick} searchQ={searchQ} depth={0}/>
          ))}
        </div>
      </div>

      {unlinked.length > 0 && (
        <div className="mt-10 w-full px-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px bg-gray-200"/>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">No Manager Set ({unlinked.length})</span>
            <div className="flex-1 h-px bg-gray-200"/>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {unlinked.map(emp => <EmpCard key={emp.id} emp={emp} onClick={onClick} compact/>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Employee Detail Popup ─────────────────────────────────────────────────────
function EmpDetailPopup({ emp, onClose, onOpen }) {
  if (!emp) return null;
  const [g1,g2] = avatarGrad(emp.name);
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:'rgba(10,31,92,0.35)'}}
      onClick={onClose}>
      <motion.div initial={{scale:0.9,y:20}} animate={{scale:1,y:0}} exit={{scale:0.9,y:20}}
        className="bg-white rounded-3xl shadow-2xl w-72 overflow-hidden"
        onClick={e=>e.stopPropagation()}>
        {/* Banner */}
        <div className="h-20 relative" style={{background:`linear-gradient(135deg,${g1},${g2})`}}>
          <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30">
            ×
          </button>
        </div>
        <div className="px-5 pb-5">
          <div className="-mt-8 mb-3 flex justify-center">
            <Avatar name={emp.name} photo={emp.profile_photo_url} size={56} ring/>
          </div>
          <div className="text-center mb-4">
            <p className="font-bold text-gray-900 text-base">{emp.name}</p>
            {emp.designation && <p className="text-sm text-blue-600 font-semibold mt-0.5">{emp.designation}</p>}
            {emp.department && <p className="text-xs text-gray-500 mt-0.5">{emp.department}</p>}
            {emp.grade && (
              <span className="inline-block mt-2 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                Grade {emp.grade}
              </span>
            )}
          </div>
          <div className="space-y-2 text-xs text-gray-600">
            {emp.email && (
              <div className="flex items-center gap-2">
                <Mail size={12} className="text-gray-400 flex-shrink-0"/>
                <span className="truncate">{emp.email}</span>
              </div>
            )}
            {emp.work_location && (
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-gray-400 flex-shrink-0"/>
                {emp.work_location}
              </div>
            )}
            {emp.employment_type && (
              <div className="flex items-center gap-2">
                <Briefcase size={12} className="text-gray-400 flex-shrink-0"/>
                <span className="capitalize">{emp.employment_type.replace(/_/g,' ')}</span>
              </div>
            )}
          </div>
          <button onClick={()=>onOpen(emp.id)}
            className="mt-4 w-full py-2.5 rounded-xl text-xs font-bold text-white transition-colors"
            style={{background:'linear-gradient(135deg,#0A1F5C,#2563EB)'}}>
            View Full Profile
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HROrgChartPage() {
  const navigate  = useNavigate();
  const [view, setView]     = useState('department'); // 'department' | 'hierarchy'
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const { data: employees=[], isLoading, error } = useQuery({
    queryKey: ['hr-org-chart'],
    queryFn: () => hrAdvancedAPI.orgChart().then(r => r.data?.data ?? []),
  });

  const searchQ = search.trim().toLowerCase();

  // Has any reporting manager relationship?
  const hasHierarchy = useMemo(() =>
    employees.some(e => e.reporting_manager_id && employees.find(m => m.id === e.reporting_manager_id)),
    [employees]
  );

  const handleSelect = (emp) => setSelected(emp);
  const handleOpen   = (id) => navigate(`/hr-admin/employees/${id}`);

  return (
    <div className="min-h-screen" style={{background:'#F8FAFC'}}>

      {/* Header */}
      <motion.div {...fade(0)} className="bg-white border-b border-gray-100 px-6 py-5 sticky top-0 z-20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl p-3 bg-blue-50">
              <GitBranch size={20} className="text-blue-600"/>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Organization Chart</h1>
              <p className="text-xs text-gray-400">{employees.length} staff members</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search name, role, dept…"
                className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white w-44 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"/>
            </div>

            {/* View Toggle */}
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={()=>setView('department')}
                className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${view==='department'?'bg-blue-600 text-white':'text-gray-600 hover:bg-gray-50'}`}>
                <Layers size={13}/> Dept View
              </button>
              <button onClick={()=>setView('hierarchy')}
                className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${view==='hierarchy'?'bg-blue-600 text-white':'text-gray-600 hover:bg-gray-50'}`}>
                <Network size={13}/> Hierarchy
                {!hasHierarchy && <span className="text-[9px] opacity-60">(not set)</span>}
              </button>
            </div>
          </div>
        </div>

        {/* Info bar */}
        {view === 'hierarchy' && !hasHierarchy && employees.length > 0 && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            <GitBranch size={13} className="flex-shrink-0"/>
            <span>No reporting manager relationships set yet. Go to <strong>Employee profile → Edit</strong> to set reporting managers and build the hierarchy.</span>
          </div>
        )}
      </motion.div>

      {/* Chart area — scrollable */}
      <div className="overflow-x-auto overflow-y-auto px-4 pt-6 min-h-[calc(100vh-80px)]">
        {isLoading && (
          <div className="flex items-center justify-center h-60 text-sm text-gray-400">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin"/>
              Loading staff…
            </div>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex items-center justify-center h-60 text-sm text-red-500">
            Failed to load staff data
          </div>
        )}

        {!isLoading && !error && employees.length === 0 && (
          <div className="flex flex-col items-center justify-center h-60 text-sm text-gray-400 gap-3">
            <Users size={40} className="text-gray-200"/>
            <p>No staff found. Add team members via Administration → Team Members.</p>
          </div>
        )}

        {!isLoading && !error && employees.length > 0 && view === 'department' && (
          <DepartmentView employees={employees} onClick={handleSelect} searchQ={searchQ}/>
        )}

        {!isLoading && !error && employees.length > 0 && view === 'hierarchy' && (
          <HierarchyView employees={employees} onClick={handleSelect} searchQ={searchQ}/>
        )}
      </div>

      {/* Employee popup */}
      <AnimatePresence>
        {selected && (
          <EmpDetailPopup emp={selected} onClose={()=>setSelected(null)} onOpen={handleOpen}/>
        )}
      </AnimatePresence>

      {/* Legend */}
      {!isLoading && employees.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/95 backdrop-blur border border-gray-200 rounded-2xl px-4 py-2.5 text-[11px] text-gray-500 shadow-lg">
          <span className="font-semibold text-gray-700">Click any card</span>
          <span className="text-gray-300">|</span>
          <span>to view employee details</span>
          {view === 'hierarchy' && (
            <>
              <span className="text-gray-300">|</span>
              <span><ChevronDown size={11} className="inline"/> toggle subtree</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
