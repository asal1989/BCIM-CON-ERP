// HR Organisation Chart — Construction Sector
// Views: Division View (default) | Department View | Reporting Hierarchy
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, Building2, MapPin, ChevronDown, ChevronRight,
  HardHat, Wrench, ShieldAlert, Truck, Package, IndianRupee,
  TrendingUp, Mail, Phone, X, ExternalLink, Network, Layers,
  Briefcase, BadgeCheck, AlignLeft
} from 'lucide-react';
import { hrAdvancedAPI } from '../../api/client';

// ── Construction Divisions ─────────────────────────────────────────────────────
const DIVISIONS = [
  {
    key: 'operations',
    label: 'Operations',
    icon: HardHat,
    color: '#0A1F5C',
    bg: '#EFF6FF',
    desc: 'Project Execution & Site Operations',
    patterns: ['project','site','planning','estimation','tender','contract','execution','civil','construction','survey'],
  },
  {
    key: 'engineering',
    label: 'Engineering & Technical',
    icon: Wrench,
    color: '#2563EB',
    bg: '#DBEAFE',
    desc: 'Design, Engineering & QA/QC',
    patterns: ['engineer','technical','design','qa','qc','quality','structural','mep','drawing','architect'],
  },
  {
    key: 'hse',
    label: 'Safety & HSE',
    icon: ShieldAlert,
    color: '#DC2626',
    bg: '#FEE2E2',
    desc: 'Health, Safety & Environment',
    patterns: ['safety','hse','environment','ehs','health','fire'],
  },
  {
    key: 'plant',
    label: 'Plant & Machinery',
    icon: Truck,
    color: '#D97706',
    bg: '#FEF3C7',
    desc: 'Plant, Equipment & Maintenance',
    patterns: ['plant','machine','equipment','workshop','mechanical','vehicle','fleet'],
  },
  {
    key: 'procurement',
    label: 'Procurement & Store',
    icon: Package,
    color: '#059669',
    bg: '#D1FAE5',
    desc: 'Purchase, Store & Subcontracts',
    patterns: ['purchase','procurement','store','material','supply','warehouse','inventory','subcontract'],
  },
  {
    key: 'finance',
    label: 'Finance & Accounts',
    icon: IndianRupee,
    color: '#7C3AED',
    bg: '#EDE9FE',
    desc: 'Finance, Accounts & Billing',
    patterns: ['finance','account','billing','cost','commercial','audit','tax'],
  },
  {
    key: 'hr',
    label: 'HR & Administration',
    icon: Users,
    color: '#DB2777',
    bg: '#FCE7F3',
    desc: 'Human Resources & Administration',
    patterns: ['hr','human resource','admin','it ','information technology','legal','compliance','secretar'],
  },
  {
    key: 'bd',
    label: 'Business Development',
    icon: TrendingUp,
    color: '#0891B2',
    bg: '#CFFAFE',
    desc: 'Business Development & Client Relations',
    patterns: ['business','marketing','sales','bd','client','crm','tender bid'],
  },
];

function getDivision(deptName = '') {
  const lower = deptName.toLowerCase();
  for (const div of DIVISIONS) {
    if (div.patterns.some(p => lower.includes(p))) return div;
  }
  return { key: 'other', label: 'General', icon: Briefcase, color: '#6B7280', bg: '#F3F4F6', desc: 'General' };
}

// ── Level badges ──────────────────────────────────────────────────────────────
const GRADE_LEVELS = {
  'L1': { label: 'Top Management',    color: '#0A1F5C', bg: '#DBEAFE' },
  'L2': { label: 'Senior Management', color: '#1d4ed8', bg: '#DBEAFE' },
  'L3': { label: 'Management',        color: '#2563EB', bg: '#EFF6FF' },
  'L4': { label: 'Supervisory',       color: '#0891B2', bg: '#CFFAFE' },
  'L5': { label: 'Senior Staff',      color: '#059669', bg: '#D1FAE5' },
  'L6': { label: 'Staff',             color: '#6B7280', bg: '#F3F4F6' },
};
function GradeBadge({ grade }) {
  if (!grade) return null;
  const g = GRADE_LEVELS[grade] || { label: grade, color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none"
      style={{ background: g.bg, color: g.color }}>
      {grade}
    </span>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  ['#6366F1','#4F46E5'],['#0EA5E9','#0284C7'],['#10B981','#059669'],
  ['#F59E0B','#D97706'],['#EF4444','#DC2626'],['#8B5CF6','#7C3AED'],
  ['#EC4899','#DB2777'],['#14B8A6','#0D9488'],['#F97316','#EA580C'],
];
const avatarGrad = (n='') => AVATAR_COLORS[(n.charCodeAt(0)||0) % AVATAR_COLORS.length];
const initials   = (n='') => n.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase() || 'U';
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });

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

// ── Employee Card ─────────────────────────────────────────────────────────────
function EmpCard({ emp, onClick, highlight=false, compact=false, divColor }) {
  return (
    <motion.div
      whileHover={{y:-2, boxShadow:'0 8px 24px rgba(10,31,92,0.16)'}}
      onClick={() => onClick(emp)}
      className={`bg-white rounded-2xl border cursor-pointer transition-all flex flex-col items-center text-center
        ${compact ? 'w-36 p-3 gap-1.5' : 'w-44 p-4 gap-2'}
        ${highlight ? 'ring-2 ring-yellow-400 ring-offset-1 border-yellow-300' : 'border-gray-100 hover:border-blue-200'}
      `}
      style={{boxShadow:'0 2px 10px rgba(10,31,92,0.07)',borderTop: divColor ? `3px solid ${divColor}` : undefined}}>
      <Avatar name={emp.name} photo={emp.profile_photo_url} size={compact?34:42} ring/>
      <div className="w-full min-w-0">
        <p className={`font-bold text-gray-900 leading-tight truncate ${compact?'text-[10px]':'text-[12px]'}`}>{emp.name}</p>
        {emp.designation && (
          <p className={`text-blue-600 font-semibold mt-0.5 truncate ${compact?'text-[9px]':'text-[10px]'}`}>{emp.designation}</p>
        )}
        <div className="flex items-center justify-center gap-1 mt-1">
          {emp.grade && <GradeBadge grade={emp.grade}/>}
          {emp.employee_code && (
            <span className="text-[8px] text-gray-400 font-mono">{emp.employee_code}</span>
          )}
        </div>
        {!compact && emp.work_location && (
          <p className="text-[9px] text-gray-400 mt-0.5 flex items-center justify-center gap-0.5 truncate">
            <MapPin size={7}/>{emp.work_location}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Employee Detail Popup ─────────────────────────────────────────────────────
function EmpDetailPopup({ emp, onClose }) {
  const navigate = useNavigate();
  if (!emp) return null;
  const div = getDivision(emp.department);
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:'rgba(10,31,92,0.45)'}} onClick={onClose}>
      <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center"
          style={{borderBottom:`4px solid ${div.color}`}}>
          <Avatar name={emp.name} photo={emp.profile_photo_url} size={72} ring/>
          <h2 className="mt-3 font-black text-gray-900 text-lg leading-tight">{emp.name}</h2>
          {emp.designation && <p className="text-blue-600 font-bold text-sm mt-0.5">{emp.designation}</p>}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{background: div.bg, color: div.color}}>
              <div.icon size={11}/>{div.label}
            </div>
            {emp.grade && <GradeBadge grade={emp.grade}/>}
          </div>
        </div>
        {/* Details */}
        <div className="px-6 py-4 space-y-2">
          {[
            { icon: Building2, label: 'Department', val: emp.department },
            { icon: Briefcase, label: 'Emp Code',   val: emp.employee_code },
            { icon: MapPin,    label: 'Location',   val: emp.work_location },
            { icon: AlignLeft, label: 'Type',       val: (emp.employment_type||'').replace(/_/g,' ') },
            { icon: Mail,      label: 'Email',      val: emp.email },
          ].filter(r => r.val).map(({ icon: Icon, label, val }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                <Icon size={13} className="text-gray-500"/>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="text-sm text-gray-800 font-semibold truncate capitalize">{val}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 pb-5 flex gap-2">
          <button onClick={() => navigate(`/hr-admin/employees/${emp.id}`)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{background:'linear-gradient(135deg,#0A1F5C,#2563EB)'}}>
            <ExternalLink size={13}/> View Profile
          </button>
          <button onClick={onClose}
            className="w-10 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500">
            <X size={16}/>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Division View (Construction Sector) ───────────────────────────────────────
function DivisionView({ employees, onClick, searchQ }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (k) => setCollapsed(c => ({...c,[k]:!c[k]}));

  // Group employees into divisions → departments
  const divMap = useMemo(() => {
    const map = {};
    employees.forEach(emp => {
      const div = getDivision(emp.department);
      if (!map[div.key]) map[div.key] = { div, depts: {} };
      const deptKey = emp.department || 'Unassigned';
      if (!map[div.key].depts[deptKey]) map[div.key].depts[deptKey] = [];
      map[div.key].depts[deptKey].push(emp);
    });
    // Sort members within each dept by grade (L1 first)
    const gradeRank = (g) => g ? (parseInt(g.replace(/\D/g,''),10) || 99) : 99;
    Object.values(map).forEach(({ depts }) =>
      Object.values(depts).forEach(members =>
        members.sort((a,b) => gradeRank(a.grade) - gradeRank(b.grade) || a.name.localeCompare(b.name))
      )
    );
    // Sort divisions by predefined order
    const ordered = DIVISIONS.map(d => map[d.key]).filter(Boolean);
    if (map['other']) ordered.push(map['other']);
    return ordered;
  }, [employees]);

  const filteredDivMap = useMemo(() => {
    if (!searchQ) return divMap;
    return divMap.map(entry => {
      const newDepts = {};
      Object.entries(entry.depts).forEach(([dk, emps]) => {
        const f = emps.filter(e =>
          e.name?.toLowerCase().includes(searchQ) ||
          e.designation?.toLowerCase().includes(searchQ) ||
          dk.toLowerCase().includes(searchQ)
        );
        if (f.length) newDepts[dk] = f;
      });
      return Object.keys(newDepts).length ? { ...entry, depts: newDepts } : null;
    }).filter(Boolean);
  }, [divMap, searchQ]);

  const totalEmp = employees.length;

  return (
    <div className="pb-16">
      {/* Company Root */}
      <div className="flex flex-col items-center mb-8">
        <motion.div {...fade(0)} className="rounded-2xl px-8 py-5 flex items-center gap-4"
          style={{background:'linear-gradient(135deg,#0A1F5C,#1d4ed8)',boxShadow:'0 10px 32px rgba(10,31,92,0.28)'}}>
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Building2 size={24} className="text-white"/>
          </div>
          <div>
            <p className="font-black text-white text-lg">BCIM</p>
            <p className="text-blue-200 text-xs font-semibold">B.C.I.M. Construction Pvt. Ltd.</p>
            <p className="text-blue-300 text-[10px] mt-0.5">{totalEmp} Employees · {filteredDivMap.length} Divisions</p>
          </div>
        </motion.div>
      </div>

      {/* Divisions */}
      <div className="space-y-6 px-4">
        {filteredDivMap.map((entry, di) => {
          const { div, depts } = entry;
          const totalInDiv = Object.values(depts).flat().length;
          const isOpen = !collapsed[div.key];
          const DivIcon = div.icon;

          return (
            <motion.div key={div.key} {...fade(di * 0.05)}
              className="rounded-2xl border overflow-hidden"
              style={{borderColor:`${div.color}25`,boxShadow:`0 2px 16px ${div.color}12`}}>

              {/* Division Header */}
              <div className="flex items-center justify-between px-5 py-3 cursor-pointer"
                style={{background:`${div.color}0d`,borderBottom: isOpen ? `1px solid ${div.color}20` : 'none'}}
                onClick={() => toggle(div.key)}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{background:`${div.color}18`}}>
                    <DivIcon size={16} style={{color:div.color}}/>
                  </div>
                  <div>
                    <p className="font-black text-gray-900 text-sm">{div.label}</p>
                    <p className="text-[10px] text-gray-500">{div.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{background:`${div.color}15`,color:div.color}}>
                    {totalInDiv} staff
                  </span>
                  <div style={{color:div.color}}>
                    {isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                  </div>
                </div>
              </div>

              {/* Departments inside Division */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                    className="overflow-hidden bg-white">
                    <div className="p-4 space-y-4">
                      {Object.entries(depts).map(([deptName, members]) => {
                        const deptKey = `${div.key}|${deptName}`;
                        const isDeptOpen = !collapsed[deptKey];
                        return (
                          <div key={deptName} className="rounded-xl border border-gray-100 overflow-hidden">
                            {/* Dept header */}
                            <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
                              onClick={() => toggle(deptKey)}>
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:div.color}}/>
                                <p className="text-sm font-bold text-gray-800">{deptName}</p>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                  style={{background:`${div.color}15`,color:div.color}}>
                                  {members.length}
                                </span>
                              </div>
                              <div className="text-gray-400">
                                {isDeptOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                              </div>
                            </div>

                            {/* Members */}
                            <AnimatePresence>
                              {isDeptOpen && (
                                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                                  className="overflow-hidden">
                                  <div className="p-3 flex flex-wrap gap-3">
                                    {members.map(emp => {
                                      const hl = searchQ && (
                                        emp.name?.toLowerCase().includes(searchQ) ||
                                        emp.designation?.toLowerCase().includes(searchQ)
                                      );
                                      return (
                                        <EmpCard key={emp.id} emp={emp} onClick={onClick}
                                          highlight={hl} compact={members.length > 4}
                                          divColor={div.color}/>
                                      );
                                    })}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
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

      {filteredDivMap.length === 0 && (
        <div className="flex flex-col items-center gap-3 text-gray-400 mt-16">
          <Users size={40} className="text-gray-200"/>
          <p className="text-sm">No employees match your search</p>
        </div>
      )}
    </div>
  );
}

// ── Department View ────────────────────────────────────────────────────────────
function DepartmentView({ employees, onClick, searchQ }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (d) => setCollapsed(c => ({...c,[d]:!c[d]}));

  const gradeRank = (g) => g ? (parseInt(g.replace(/\D/g,''),10) || 99) : 99;

  const grouped = useMemo(() => {
    const map = {};
    employees.forEach(e => { const d = e.department||'Unassigned'; if(!map[d]) map[d]=[]; map[d].push(e); });
    // Sort members within each dept by grade (L1 first)
    Object.values(map).forEach(members => members.sort((a,b) => gradeRank(a.grade) - gradeRank(b.grade) || a.name.localeCompare(b.name)));
    // Sort depts: higher-grade dept first, then alpha; Unassigned last
    return Object.entries(map).sort(([a, ma],[b, mb]) => {
      if (a==='Unassigned') return 1;
      if (b==='Unassigned') return -1;
      const topA = gradeRank(ma[0]?.grade);
      const topB = gradeRank(mb[0]?.grade);
      return topA !== topB ? topA - topB : a.localeCompare(b);
    });
  }, [employees]);

  const filtered = useMemo(() => {
    if (!searchQ) return grouped;
    return grouped.map(([dept,members]) => {
      const f = members.filter(e =>
        e.name?.toLowerCase().includes(searchQ) ||
        e.designation?.toLowerCase().includes(searchQ) ||
        dept.toLowerCase().includes(searchQ)
      );
      return [dept,f];
    }).filter(([,m])=>m.length>0);
  }, [grouped, searchQ]);

  return (
    <div className="flex flex-col items-center pb-16">
      <motion.div {...fade(0)} className="flex flex-col items-center mb-6">
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
      </motion.div>

      <div className="flex flex-wrap justify-center gap-6 px-4">
        {filtered.map(([dept, members], di) => {
          const divInfo = getDivision(dept);
          const isOpen  = !collapsed[dept];
          return (
            <motion.div key={dept} {...fade(di*0.05)} className="flex flex-col items-center">
              <div className="rounded-2xl border px-5 py-3 flex items-center gap-3 cursor-pointer hover:shadow-lg transition-all"
                style={{borderColor:`${divInfo.color}30`,background:divInfo.bg,boxShadow:`0 2px 12px ${divInfo.color}18`}}
                onClick={()=>toggle(dept)}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{background:`${divInfo.color}20`}}>
                  <divInfo.icon size={15} style={{color:divInfo.color}}/>
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-[12px] leading-tight">{dept}</p>
                  <p className="text-[10px] font-semibold" style={{color:divInfo.color}}>{members.length} member{members.length!==1?'s':''}</p>
                </div>
                <div className="ml-1 text-gray-400">{isOpen?<ChevronDown size={13}/>:<ChevronRight size={13}/>}</div>
              </div>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden">
                    <div className="flex flex-wrap justify-center gap-2 mt-3 max-w-xs">
                      {members.map(emp => {
                        const hl = searchQ&&(emp.name?.toLowerCase().includes(searchQ)||emp.designation?.toLowerCase().includes(searchQ));
                        return <EmpCard key={emp.id} emp={emp} onClick={onClick} highlight={hl} compact={members.length>3} divColor={divInfo.color}/>;
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Reporting Hierarchy Tree ───────────────────────────────────────────────────
function OrgTreeNode({ node, allEmps, collapsed, toggle, onClick, searchQ, depth=0 }) {
  const children = allEmps.filter(e => e._parent_id === node.id);
  const isOpen   = !collapsed[node.id];
  const hl = searchQ && (
    node.name?.toLowerCase().includes(searchQ) ||
    node.designation?.toLowerCase().includes(searchQ) ||
    node.department?.toLowerCase().includes(searchQ)
  );
  const divInfo = getDivision(node.department || '');
  const isRoot = depth === 0;

  return (
    <div className="flex flex-col items-center" style={{margin:'0 6px'}}>
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
          borderTop: !isRoot && divInfo ? `3px solid ${divInfo.color}` : undefined,
        }}>
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
          <div className="flex items-center justify-center gap-1 mt-1">
            {node.grade && <GradeBadge grade={node.grade}/>}
          </div>
          {node.department && !isRoot && (
            <p className="text-[9px] text-gray-400 mt-0.5 truncate">{node.department}</p>
          )}
        </div>
        {children.length > 0 && (
          <span className={`mt-2 text-[9px] font-bold px-2 py-0.5 rounded-full ${isRoot?'bg-white/20 text-white':'bg-blue-50 text-blue-600'}`}>
            {children.length} direct report{children.length!==1?'s':''}
          </span>
        )}
      </motion.div>

      {children.length > 0 && (
        <button onClick={e=>{e.stopPropagation();toggle(node.id);}}
          className="mt-1.5 w-6 h-6 rounded-full bg-white border-2 border-blue-300 flex items-center justify-center text-blue-600 shadow-sm hover:bg-blue-50 z-10 flex-shrink-0">
          {isOpen?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
        </button>
      )}

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

const gradeRankH = (g) => g ? (parseInt(String(g).replace(/\D/g,''),10) || 99) : 99;

// Build a top-down tree. Uses real reporting_manager_id when available;
// otherwise auto-generates a hierarchy by seniority:
//   MD (lowest grade) → division head → department head → staff chain
function buildHierarchy(employees) {
  const byId = new Map(employees.map(e => [e.id, e]));
  const realCount = employees.filter(e => e.reporting_manager_id && byId.has(e.reporting_manager_id)).length;
  const useReal = realCount >= Math.max(1, Math.floor(employees.length * 0.5)); // mostly set

  if (useReal) {
    return {
      mode: 'real',
      employees: employees.map(e => ({ ...e, _parent_id: byId.has(e.reporting_manager_id) ? e.reporting_manager_id : null })),
    };
  }

  // ── Auto hierarchy by seniority ───────────────────────────────────────────
  const sorted = [...employees].sort((a,b) =>
    gradeRankH(a.grade) - gradeRankH(b.grade) || (a.name||'').localeCompare(b.name||''));
  if (!sorted.length) return { mode: 'auto', employees: [] };

  const root = sorted[0];                       // MD / highest grade
  const parentOf = { [root.id]: null };

  // Group everyone else by division, then by department
  const rest = sorted.slice(1);
  const divMap = {};                            // divKey -> { div, depts: { deptName: [emps] } }
  rest.forEach(e => {
    const div = getDivision(e.department);
    if (!divMap[div.key]) divMap[div.key] = { div, depts: {} };
    const d = e.department || 'General';
    if (!divMap[div.key].depts[d]) divMap[div.key].depts[d] = [];
    divMap[div.key].depts[d].push(e);
  });

  // Order divisions by predefined construction order, then 'other'
  const orderedDivKeys = [...DIVISIONS.map(d => d.key), 'other'].filter(k => divMap[k]);

  orderedDivKeys.forEach(divKey => {
    const { depts } = divMap[divKey];
    // The single most-senior person across the whole division reports to the MD.
    const allInDiv = Object.values(depts).flat()
      .sort((a,b) => gradeRankH(a.grade) - gradeRankH(b.grade) || (a.name||'').localeCompare(b.name||''));
    const divHead = allInDiv[0];
    parentOf[divHead.id] = root.id;

    // Each department forms a vertical chain (head → next → next …).
    // Department heads (other than the divHead) report to the divHead.
    Object.values(depts).forEach(members => {
      members.sort((a,b) => gradeRankH(a.grade) - gradeRankH(b.grade) || (a.name||'').localeCompare(b.name||''));
      members.forEach((m, i) => {
        if (m.id === divHead.id) return;           // already parented to root
        parentOf[m.id] = i === 0 ? divHead.id : members[i-1].id;
      });
    });
  });

  return {
    mode: 'auto',
    employees: employees.map(e => ({ ...e, _parent_id: parentOf[e.id] ?? null })),
  };
}

function HierarchyView({ employees, onClick, searchQ }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (id) => setCollapsed(c => ({...c,[id]:!c[id]}));

  const { mode, employees: tree } = useMemo(() => buildHierarchy(employees), [employees]);
  const roots = useMemo(() => tree.filter(e => !e._parent_id), [tree]);

  return (
    <div className="pb-16 overflow-x-auto">
      {mode === 'auto' && (
        <div className="mx-4 mb-6 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3 text-sm text-blue-800">
          <p className="font-bold mb-0.5">ℹ️ Auto-generated by seniority</p>
          <p className="text-xs">This tree is built automatically from each person&#39;s grade (L1 → L6) and department, with the Managing Director at the top. To use actual reporting lines, set each employee&#39;s reporting manager under <strong>HR → Employees → Edit</strong>.</p>
        </div>
      )}
      <div className="flex justify-center flex-wrap gap-8 px-4" style={{minWidth:'max-content'}}>
        {roots.map((root) => (
          <div key={root.id} className="flex flex-col items-center">
            <OrgTreeNode node={root} allEmps={tree} collapsed={collapsed}
              toggle={toggle} onClick={onClick} searchQ={searchQ}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────
function DivisionLegend() {
  return (
    <div className="px-7 py-3 bg-gray-50 border-b border-gray-100">
      <div className="flex flex-wrap gap-3 items-center">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Divisions:</p>
        {DIVISIONS.map(d => (
          <div key={d.key} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{background:`${d.color}12`,color:d.color}}>
            <d.icon size={9}/>{d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const VIEWS = [
  { key: 'division',    label: 'Division View',   icon: Layers,   desc: 'Construction sector divisions' },
  { key: 'department',  label: 'Department View',  icon: Building2,desc: 'By department'                },
  { key: 'hierarchy',   label: 'Reporting Chart',  icon: Network,  desc: 'Reporting hierarchy tree'    },
];

export default function HROrgChartPage() {
  const [view,      setView]      = useState('division');
  const [searchQ,   setSearchQ]   = useState('');
  const [selected,  setSelected]  = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['hr-org-chart'],
    queryFn:  () => hrAdvancedAPI.orgChart().then(r => r.data?.data ?? []),
  });
  const employees = data || [];
  const sq = searchQ.toLowerCase().trim();

  return (
    <div className="min-h-screen" style={{background:'#F8FAFC'}}>

      {/* Header */}
      <motion.div {...fade(0)} className="relative overflow-hidden"
        style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)',boxShadow:'0 4px 20px rgba(10,31,92,0.2)'}}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.06]"
          style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
        <div className="relative z-10 px-7 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                  <Network size={16} className="text-white"/>
                </div>
                <span className="text-white/60 text-sm font-semibold">HR & Admin</span>
              </div>
              <h1 className="text-2xl font-black text-white">Organisation Chart</h1>
              <p className="text-white/55 text-sm mt-1">
                {employees.length} employees · {DIVISIONS.length} construction divisions
              </p>
            </div>
            {/* Search */}
            <div className="relative flex-shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"/>
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search name, designation…"
                className="pl-9 pr-4 py-2.5 bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl text-sm focus:outline-none focus:bg-white/20 focus:border-white/40 transition-all w-56"/>
            </div>
          </div>

          {/* View Tabs */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {VIEWS.map(v => (
              <button key={v.key} onClick={()=>setView(v.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  view===v.key ? 'bg-white text-blue-700' : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}>
                <v.icon size={13}/>{v.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Division Legend (only for division view) */}
      {view === 'division' && <DivisionLegend/>}

      {/* Grade Legend */}
      <div className="px-7 py-2 bg-white border-b border-gray-100">
        <div className="flex flex-wrap gap-2 items-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Grade:</p>
          {Object.entries(GRADE_LEVELS).map(([g, info]) => (
            <span key={g} className="text-[9px] font-black px-2 py-0.5 rounded-full"
              style={{background:info.bg,color:info.color}}>
              {g} — {info.label}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="py-6">
        {isLoading && (
          <div className="flex items-center justify-center h-64 text-sm text-gray-400">
            <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mr-2"/>
            Loading organisation chart…
          </div>
        )}
        {error && (
          <div className="mx-7 bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-600">
            <p className="font-bold">Failed to load staff data</p>
            <button onClick={refetch} className="mt-2 text-sm underline">Retry</button>
          </div>
        )}
        {!isLoading && !error && employees.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
            <Users size={48} className="text-gray-200"/>
            <p className="text-sm font-semibold">No employees found</p>
          </div>
        )}
        {!isLoading && !error && employees.length > 0 && (
          <>
            {view === 'division'   && <DivisionView   employees={employees} onClick={setSelected} searchQ={sq}/>}
            {view === 'department' && <DepartmentView employees={employees} onClick={setSelected} searchQ={sq}/>}
            {view === 'hierarchy'  && <HierarchyView  employees={employees} onClick={setSelected} searchQ={sq}/>}
          </>
        )}
      </div>

      {/* Detail Popup */}
      <AnimatePresence>
        {selected && <EmpDetailPopup emp={selected} onClose={()=>setSelected(null)}/>}
      </AnimatePresence>
    </div>
  );
}
