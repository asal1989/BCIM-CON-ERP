import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { hrShiftsAPI, hrAdvancedAPI } from '../../api/client';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });

const SHIFT_COLORS = ['bg-blue-100 text-blue-700 border-blue-200','bg-emerald-100 text-emerald-700 border-emerald-200','bg-amber-100 text-amber-700 border-amber-200','bg-violet-100 text-violet-700 border-violet-200','bg-rose-100 text-rose-700 border-rose-200'];
const shiftColor = (id) => id ? SHIFT_COLORS[[...String(id)].reduce((s,ch)=>s+ch.charCodeAt(0),0) % SHIFT_COLORS.length] : 'bg-gray-100 text-gray-400 border-gray-200';

function getDays(year, month) {
  const first = new Date(year, month, 1).getDay();
  const total = new Date(year, month+1, 0).getDate();
  return { first, total };
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function ShiftCalendarPage() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const prev = () => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); };
  const next = () => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); };

  const { data: employees, isLoading: loadingEmps } = useQuery({
    queryKey: ['employee-shifts-current'],
    queryFn: () => hrShiftsAPI.currentShifts().then(r => r.data?.data || []),
  });
  const { data: rosterRows, isLoading: loadingRoster } = useQuery({
    queryKey: ['rosters', month+1, year],
    queryFn: () => hrAdvancedAPI.listRosters({ month: month+1, year }).then(r => r.data?.data || []),
  });

  const rosterMap = {};
  (rosterRows||[]).forEach(r => { rosterMap[`${r.user_id}_${String(r.roster_date).slice(0,10)}`] = r; });

  const { first, total } = getDays(year, month);
  const days = Array.from({length:total},(_,i)=>i+1);
  const emps = employees || [];
  const loading = loadingEmps || loadingRoster;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)}>
        {/* Header */}
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-white"/>
            </div>
            <div>
              <h1 className="text-lg font-black text-white">Shift Calendar</h1>
              <p className="text-xs text-blue-200">Monthly employee shift view — from Shift Roster (Advanced HR)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={prev} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"><ChevronLeft className="w-4 h-4"/></button>
            <span className="text-white font-black text-sm w-36 text-center">{MONTHS[month]} {year}</span>
            <button onClick={next} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"><ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>

        {!(rosterRows||[]).length && !loading && (
          <p className="text-xs text-gray-400 mb-4">No daily roster entries found for {MONTHS[month]} {year}. Assign shifts per-day from the Shift Roster (Advanced HR) module.</p>
        )}

        {/* Calendar Table */}
        <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-auto">
          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
          ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 font-black text-gray-600 bg-gray-50 sticky left-0 z-10 min-w-[140px]">Employee</th>
                {days.map(d=>{
                  const dow = (first + d - 1) % 7;
                  const isSun = dow===0;
                  return (
                    <th key={d} className={`px-2 py-3 font-bold text-center min-w-[36px] ${isSun?'text-red-500':'text-gray-500'}`}>
                      <div>{d}</div>
                      <div className="text-[9px] font-normal">{'SMTWTFS'[dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {emps.map((emp,ei)=>(
                <tr key={emp.id} className={ei%2===0?'bg-white':'bg-gray-50/40'}>
                  <td className="px-4 py-2.5 font-semibold text-gray-800 sticky left-0 bg-inherit z-10 border-r border-gray-100">{emp.name}</td>
                  {days.map(d=>{
                    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const r = rosterMap[`${emp.id}_${dateStr}`];
                    const code = r?.shift_code || r?.shift_name?.[0] || (r ? 'S' : null);
                    return (
                      <td key={d} className="px-1 py-2 text-center" title={r?.shift_name||''}>
                        <span className={`inline-block w-7 h-7 rounded-lg border text-[10px] font-black flex items-center justify-center ${shiftColor(r?.shift_id)}`}>
                          {code || '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!emps.length && (
                <tr><td colSpan={days.length+1} className="text-center py-12 text-gray-400 text-sm">No employees found</td></tr>
              )}
            </tbody>
          </table>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
