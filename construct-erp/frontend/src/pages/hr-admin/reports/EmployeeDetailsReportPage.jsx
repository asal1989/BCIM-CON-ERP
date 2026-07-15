import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrEmployeesAPI } from '../../../api/client';
import { Download, Users } from 'lucide-react';

export default function EmployeeDetailsReportPage() {
  const [dept, setDept] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');

  const { data, isLoading } = useQuery({
    queryKey: ['employees-report', dept, status],
    queryFn: () => hrEmployeesAPI.list({ limit:500, department: dept||undefined, status: status||undefined }).then(r => r.data?.data || r.data?.employees || r.data || []),
  });

  const rows = (Array.isArray(data) ? data : []).filter(r =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.employee_code?.includes(search) || r.email?.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    const header = ['Emp Code','Name','Email','Phone','Department','Designation','Date of Joining','Employment Type','Category','Status'];
    const csvRows = rows.map(r=>[r.employee_code||'',r.name||'',r.email||'',r.phone||'',r.department||'',r.designation||'',r.date_of_joining||r.doj||'',r.employment_type||'',r.employee_category||'',r.is_active?'Active':'Inactive']);
    const csv=[header,...csvRows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download='employee-details.csv'; a.click();
  };

  return (
    <div className="p-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Users size={22} style={{ color:'#7C3AED' }} />
          <h1 style={{ fontWeight:700, fontSize:18, color:'#1E293B', margin:0 }}>Employee Details Report</h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:12, color:'#64748B' }}>{rows.length} employees</span>
          <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
            <Download size={14}/> Export CSV
          </button>
        </div>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name / code / email..." style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13, minWidth:220 }} />
        <input value={dept} onChange={e=>setDept(e.target.value)} placeholder="Filter by department..." style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
        <select value={status} onChange={e=>setStatus(e.target.value)} style={{ border:'1px solid #CBD5E1', borderRadius:6, padding:'5px 10px', fontSize:13 }}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="">All</option>
        </select>
      </div>

      <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0' }}>
        {isLoading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>No employees found</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                {['Code','Name','Email','Phone','Department','Designation','DOJ','Type','Category','Status'].map(h=>(
                  <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'7px 12px', color:'#64748B', fontFamily:'monospace' }}>{r.employee_code||'-'}</td>
                  <td style={{ padding:'7px 12px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{r.name||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.email||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.phone||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.department||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B', whiteSpace:'nowrap' }}>{r.designation||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B', whiteSpace:'nowrap' }}>{r.date_of_joining||r.doj||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.employment_type||'-'}</td>
                  <td style={{ padding:'7px 12px', color:'#64748B' }}>{r.employee_category||'-'}</td>
                  <td style={{ padding:'7px 12px' }}>
                    <span style={{ background: r.is_active!==false?'#D1FAE5':'#FEE2E2', color: r.is_active!==false?'#065F46':'#991B1B', borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:700 }}>
                      {r.is_active!==false?'Active':'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
