// src/pages/hr-admin/PositionHistoryPage.jsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Search, Building2, Briefcase, MapPin, Calendar, ChevronRight } from 'lucide-react';
import { hrEmployeesAPI } from '../../api/client';

const B = { navy: '#0A1F5C', blue: '#2563EB', purple: '#7C3AED' };

export default function PositionHistoryPage() {
  const [search, setSearch] = useState('');
  const [empId,  setEmpId]  = useState(null);
  const [empType, setEmpType] = useState('Current');

  const { data: empData } = useQuery({
    queryKey: ['hr-employees-search', search],
    queryFn: () => hrEmployeesAPI.list({ search, status: empType === 'Current' ? 'active' : undefined }).then(r => r.data),
    enabled: search.length > 1,
  });

  const { data: histData, isLoading } = useQuery({
    queryKey: ['hr-position-history', empId],
    queryFn: () => hrEmployeesAPI.getPositionHistory?.(empId).then(r => r.data) ?? Promise.resolve({ data: [] }),
    enabled: !!empId,
  });

  const employees = empData?.data || [];
  const history   = histData?.data || [];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${B.purple}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <History size={18} color={B.purple} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Position History</h1>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
          View and manage employee designation, department, grade, and location change history.
        </p>
      </div>

      {/* Search */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Employee Type</label>
            <select
              value={empType}
              onChange={e => setEmpType(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#0F172A', background: '#F8FAFC', cursor: 'pointer' }}
            >
              <option>Current</option>
              <option>Ex-Employee</option>
              <option>All</option>
            </select>
          </div>
          <div style={{ flex: 3 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Search Employee</label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setEmpId(null); }}
                placeholder="Search by Emp No / Name"
                style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#0F172A', background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }}
              />
              {search && employees.length > 0 && !empId && (
                <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
                  {employees.slice(0, 8).map(e => (
                    <button
                      key={e.id}
                      onClick={() => { setEmpId(e.id); setSearch(`${e.employee_code || e.id} – ${e.name}`); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e2 => e2.currentTarget.style.background = '#F8FAFC'}
                      onMouseLeave={e2 => e2.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${B.purple}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: B.purple }}>
                        {(e.name||'').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{e.name}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>{e.employee_code || `#${e.id}`} · {e.designation || e.department}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* History Timeline */}
      {!empId && (
        <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 14, padding: 60, textAlign: 'center' }}>
          <History size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: '#94A3B8', fontWeight: 600 }}>Start searching to see specific employee details here</p>
        </div>
      )}

      {empId && isLoading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>Loading...</div>
      )}

      {empId && !isLoading && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>Position History Timeline</h3>
            <span style={{ fontSize: 12, color: '#64748B' }}>{history.length} record{history.length !== 1 ? 's' : ''}</span>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No position history records found for this employee.</div>
          ) : (
            <div style={{ padding: '16px 24px' }}>
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, paddingBottom: 20, position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${B.purple}15`, border: `2px solid ${B.purple}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ChevronRight size={14} color={B.purple} />
                    </div>
                    {i < history.length - 1 && <div style={{ width: 2, flex: 1, background: '#E2E8F0', marginTop: 4 }} />}
                  </div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                      <Calendar size={11} /> {h.effective_date || h.from_date || 'N/A'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {h.designation && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: '#EFF6FF', color: '#1D4ED8', borderRadius: 6, padding: '3px 8px' }}>
                          <Briefcase size={11} /> {h.designation}
                        </span>
                      )}
                      {h.department && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: '#F0FDF4', color: '#15803D', borderRadius: 6, padding: '3px 8px' }}>
                          <Building2 size={11} /> {h.department}
                        </span>
                      )}
                      {h.location && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: '#FFF7ED', color: '#C2410C', borderRadius: 6, padding: '3px 8px' }}>
                          <MapPin size={11} /> {h.location}
                        </span>
                      )}
                    </div>
                    {h.remarks && <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{h.remarks}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
