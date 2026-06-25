import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { vendorAPI, projectAPI } from '../../api/client';
import { Search, Download, TrendingUp, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

const inr = (v) => `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;

export default function VendorWiseReportsPage() {
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r?.data;
      if (Array.isArray(d)) return d;
      if (d?.data) return d.data;
      return [];
    }).catch(() => []),
  });

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', projectId],
    queryFn: () => vendorAPI.list({ project_id: projectId }).then(r => {
      const d = r?.data;
      if (Array.isArray(d)) return d;
      if (d?.data) return d.data;
      return [];
    }).catch(() => []),
    enabled: !!projectId,
  });

  const filtered = useMemo(() => {
    return vendors.filter(v =>
      !search || v.name?.toLowerCase().includes(search.toLowerCase()) ||
      v.vendor_code?.toLowerCase().includes(search.toLowerCase())
    );
  }, [vendors, search]);

  const exportExcel = () => {
    const rows = filtered.map(v => ({
      'Vendor Code': v.vendor_code,
      'Vendor Name': v.name,
      'Category': v.category,
      'Status': v.status,
      'Contact': v.contact_person,
      'Phone': v.phone,
      'Email': v.email,
      'Address': v.address,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendor Report');
    XLSX.writeFile(wb, `Vendor_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '2rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#0F172A', margin: 0 }}>
              Vendor-wise Reports
            </h1>
            <p style={{ fontSize: '14px', color: '#64748B', marginTop: '0.5rem' }}>
              Vendor performance, purchase history, and delivery tracking
            </p>
          </div>
          <button
            onClick={exportExcel}
            disabled={!projectId}
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
              minWidth: '250px',
            }}
          >
            <option value="">Select Project *</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
            <Search style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '16px',
              height: '16px',
              color: '#94A3B8',
            }} />
            <input
              type="text"
              placeholder="Search vendor name or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem 0.75rem 2.5rem',
                border: '1px solid #E2E8F0',
                borderRadius: '0.5rem',
                fontSize: '14px',
                outline: 'none',
              }}
              disabled={!projectId}
            />
          </div>
        </div>

        {!projectId && (
          <div style={{
            backgroundColor: '#FEF3C7',
            border: '1px solid #FCD34D',
            borderRadius: '0.75rem',
            padding: '1rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start',
          }}>
            <AlertCircle size={20} style={{ color: '#D97706', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '14px', color: '#92400E' }}>
              Please select a project to view vendor reports
            </div>
          </div>
        )}

        {projectId && isLoading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8' }}>
            Loading vendors...
          </div>
        )}

        {projectId && !isLoading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8' }}>
            {search ? 'No vendors found matching your search' : 'No vendors for this project'}
          </div>
        )}

        {/* Vendors Table */}
        {projectId && !isLoading && filtered.length > 0 && (
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '0.75rem',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Vendor Code</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Name</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Category</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Contact</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vendor, idx) => (
                  <tr key={vendor.id} style={{
                    borderBottom: '1px solid #E2E8F0',
                    backgroundColor: idx % 2 === 0 ? '#fff' : '#F8FAFC',
                  }}>
                    <td style={{ padding: '1rem', fontSize: '13px', fontWeight: 'bold', color: '#1E293B' }}>
                      {vendor.vendor_code}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '13px', color: '#1E293B' }}>
                      {vendor.name}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '13px', color: '#64748B' }}>
                      {vendor.category || '—'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '13px', color: '#64748B' }}>
                      {vendor.contact_person || '—'}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        backgroundColor: vendor.status === 'active' ? '#D1FAE5' : '#FEE2E2',
                        color: vendor.status === 'active' ? '#065F46' : '#991B1B',
                      }}>
                        {vendor.status === 'active' ? '✓ Active' : '○ Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {projectId && !isLoading && filtered.length > 0 && (
          <div style={{
            marginTop: '2rem',
            padding: '1.5rem',
            backgroundColor: '#fff',
            borderRadius: '0.75rem',
            border: '1px solid #E2E8F0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.5rem',
          }}>
            <div>
              <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', margin: 0 }}>Total Vendors</p>
              <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#1E293B', margin: '0.5rem 0 0 0' }}>{filtered.length}</p>
            </div>
            <div>
              <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', margin: 0 }}>Active Vendors</p>
              <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669', margin: '0.5rem 0 0 0' }}>
                {filtered.filter(v => v.status === 'active').length}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', margin: 0 }}>Inactive Vendors</p>
              <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#DC2626', margin: '0.5rem 0 0 0' }}>
                {filtered.filter(v => v.status !== 'active').length}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
