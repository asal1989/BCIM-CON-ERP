import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { projectAPI } from '../../api/client';
import { Calendar, Download, TrendingUp, AlertCircle, ArrowDown, ArrowUp } from 'lucide-react';
import * as XLSX from 'xlsx';

const inr = (v) => `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
const fmt_date = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '—';
  return `${String(x.getDate()).padStart(2,'0')}-${String(x.getMonth()+1).padStart(2,'0')}-${x.getFullYear()}`;
};

export default function DailyMaterialRegisterPage() {
  const [searchParams] = useSearchParams();
  const [projectId, setProjectId] = useState(searchParams.get('project') || '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [materialType, setMaterialType] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r?.data;
      if (Array.isArray(d)) return d;
      if (d?.data) return d.data;
      return [];
    }).catch(() => []),
  });

  const materialTypes = [
    { id: 'all', label: 'All Materials' },
    { id: 'inward', label: 'Inward (GRS/IGN)' },
    { id: 'outward', label: 'Outward (Issue Slip)' },
    { id: 'transfer', label: 'Transfer (MTR)' },
  ];

  // Mock data - in production this would come from API
  const dmrData = useMemo(() => [
    {
      date: new Date().toISOString(),
      type: 'inward',
      material: 'Cement (50kg bags)',
      qty: 500,
      unit: 'bags',
      rate: 350,
      amount: 175000,
      reference: 'GRS-001',
      warehouse: 'Main Store',
      remarks: 'From ABC Suppliers',
    },
    {
      date: new Date().toISOString(),
      type: 'outward',
      material: 'Steel Bars (16mm)',
      qty: 2000,
      unit: 'kg',
      rate: 75,
      amount: 150000,
      reference: 'IS-001',
      warehouse: 'Main Store',
      remarks: 'Issued to site',
    },
    {
      date: new Date(Date.now() - 86400000).toISOString(),
      type: 'inward',
      material: 'Bricks (Common)',
      qty: 50000,
      unit: 'nos',
      rate: 8,
      amount: 400000,
      reference: 'IGN-001',
      warehouse: 'Yard A',
      remarks: 'From supplier XYZ',
    },
  ], []);

  const filtered = useMemo(() => {
    return dmrData.filter(d => {
      if (projectId && !d.projectId) return false;
      if (fromDate && new Date(d.date) < new Date(fromDate)) return false;
      if (toDate && new Date(d.date) > new Date(toDate + 'T23:59:59')) return false;
      if (materialType === 'inward' && d.type !== 'inward') return false;
      if (materialType === 'outward' && d.type !== 'outward') return false;
      if (materialType === 'transfer' && d.type !== 'transfer') return false;
      return true;
    });
  }, [dmrData, projectId, fromDate, toDate, materialType]);

  const summary = useMemo(() => {
    const inward = filtered.filter(d => d.type === 'inward').reduce((s, d) => s + d.amount, 0);
    const outward = filtered.filter(d => d.type === 'outward').reduce((s, d) => s + d.amount, 0);
    return { inward, outward, balance: inward - outward };
  }, [filtered]);

  const exportExcel = () => {
    const rows = filtered.map(d => ({
      'Date': fmt_date(d.date),
      'Type': d.type === 'inward' ? 'Inward' : d.type === 'outward' ? 'Outward' : 'Transfer',
      'Material': d.material,
      'Quantity': d.qty,
      'Unit': d.unit,
      'Rate': inr(d.rate),
      'Amount': inr(d.amount),
      'Reference': d.reference,
      'Warehouse': d.warehouse,
      'Remarks': d.remarks,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DMR');
    XLSX.writeFile(wb, `DMR_${fromDate || 'all'}_to_${toDate || 'all'}.xlsx`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '2rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#0F172A', margin: 0 }}>
              Daily Material Register (DMR)
            </h1>
            <p style={{ fontSize: '14px', color: '#64748B', marginTop: '0.5rem' }}>
              Track all inward, outward, and transfer movements
            </p>
          </div>
          <button
            onClick={exportExcel}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: filtered.length > 0 ? '#059669' : '#D1D5DB',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: filtered.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Download size={16} /> Export Excel
          </button>
        </div>

        {/* Filters */}
        <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '1px solid #E2E8F0',
              borderRadius: '0.5rem',
              fontSize: '14px',
              backgroundColor: '#fff',
              minWidth: '200px',
            }}
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '1px solid #E2E8F0',
              borderRadius: '0.5rem',
              fontSize: '14px',
            }}
          />

          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '1px solid #E2E8F0',
              borderRadius: '0.5rem',
              fontSize: '14px',
            }}
          />

          <select
            value={materialType}
            onChange={e => setMaterialType(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              border: '1px solid #E2E8F0',
              borderRadius: '0.5rem',
              fontSize: '14px',
              backgroundColor: '#fff',
              minWidth: '200px',
            }}
          >
            {materialTypes.map(mt => (
              <option key={mt.id} value={mt.id === 'all' ? '' : mt.id}>{mt.label}</option>
            ))}
          </select>
        </div>

        {/* Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}>
          <div style={{
            backgroundColor: '#D1FAE5',
            borderLeft: '4px solid #059669',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <ArrowDown size={24} style={{ color: '#059669' }} />
            <div>
              <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#065F46', textTransform: 'uppercase', margin: 0 }}>Total Inward</p>
              <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#065F46', margin: '0.25rem 0 0 0' }}>{inr(summary.inward)}</p>
            </div>
          </div>

          <div style={{
            backgroundColor: '#FEE2E2',
            borderLeft: '4px solid #DC2626',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <ArrowUp size={24} style={{ color: '#DC2626' }} />
            <div>
              <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#991B1B', textTransform: 'uppercase', margin: 0 }}>Total Outward</p>
              <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#991B1B', margin: '0.25rem 0 0 0' }}>{inr(summary.outward)}</p>
            </div>
          </div>

          <div style={{
            backgroundColor: '#DBEAFE',
            borderLeft: '4px solid #2563EB',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <TrendingUp size={24} style={{ color: '#2563EB' }} />
            <div>
              <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#1E40AF', textTransform: 'uppercase', margin: 0 }}>Net Balance</p>
              <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#1E40AF', margin: '0.25rem 0 0 0' }}>{inr(summary.balance)}</p>
            </div>
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={{
            backgroundColor: '#FEF3C7',
            border: '1px solid #FCD34D',
            borderRadius: '0.75rem',
            padding: '2rem',
            textAlign: 'center',
            color: '#92400E',
          }}>
            <AlertCircle size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            No material movements found for the selected filters
          </div>
        ) : (
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '0.75rem',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Type</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Material</th>
                    <th style={{ padding: '1rem', textAlign: 'right', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Qty</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Unit</th>
                    <th style={{ padding: '1rem', textAlign: 'right', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Rate</th>
                    <th style={{ padding: '1rem', textAlign: 'right', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Amount</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Reference</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Warehouse</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, idx) => (
                    <tr key={idx} style={{
                      borderBottom: '1px solid #E2E8F0',
                      backgroundColor: idx % 2 === 0 ? '#fff' : '#F8FAFC',
                    }}>
                      <td style={{ padding: '1rem', fontSize: '13px', fontWeight: 'bold', color: '#1E293B' }}>{fmt_date(row.date)}</td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          backgroundColor: row.type === 'inward' ? '#D1FAE5' : '#FEE2E2',
                          color: row.type === 'inward' ? '#065F46' : '#991B1B',
                        }}>
                          {row.type === 'inward' ? '↓ Inward' : row.type === 'outward' ? '↑ Outward' : '↔ Transfer'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', fontSize: '13px', color: '#1E293B' }}>{row.material}</td>
                      <td style={{ padding: '1rem', fontSize: '13px', textAlign: 'right', fontWeight: 'bold', color: '#1E293B' }}>{row.qty.toLocaleString()}</td>
                      <td style={{ padding: '1rem', fontSize: '12px', color: '#64748B' }}>{row.unit}</td>
                      <td style={{ padding: '1rem', fontSize: '13px', textAlign: 'right', color: '#64748B' }}>{inr(row.rate)}</td>
                      <td style={{ padding: '1rem', fontSize: '13px', textAlign: 'right', fontWeight: 'bold', color: '#1E293B' }}>{inr(row.amount)}</td>
                      <td style={{ padding: '1rem', fontSize: '12px', fontFamily: 'monospace', color: '#64748B' }}>{row.reference}</td>
                      <td style={{ padding: '1rem', fontSize: '12px', color: '#64748B' }}>{row.warehouse}</td>
                      <td style={{ padding: '1rem', fontSize: '12px', color: '#64748B' }}>{row.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Count */}
        {filtered.length > 0 && (
          <div style={{ marginTop: '1rem', fontSize: '13px', color: '#64748B', textAlign: 'right' }}>
            Total Transactions: <strong>{filtered.length}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
