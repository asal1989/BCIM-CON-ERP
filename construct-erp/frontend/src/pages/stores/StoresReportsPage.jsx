import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectAPI } from '../../api/client';
import { BarChart3, Truck, Calendar, TrendingUp } from 'lucide-react';

export default function StoresReportsPage() {
  const [projectId, setProjectId] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r?.data;
      if (Array.isArray(d)) return d;
      if (d?.data) return d.data;
      return [];
    }).catch(() => []),
  });

  const reports = [
    {
      id: 'vendor-wise',
      title: 'Vendor-wise Reports',
      icon: Truck,
      description: 'Vendor performance, pending deliveries, purchase analysis',
      link: '/stores/reports/vendor-wise',
      color: 'from-blue-500 to-blue-600',
    },
    {
      id: 'dmr',
      title: 'Daily Material Register (DMR)',
      icon: Calendar,
      description: 'Daily inward/outward material movements and transactions',
      link: '/stores/reports/dmr',
      color: 'from-emerald-500 to-emerald-600',
    },
    {
      id: 'stock-analysis',
      title: 'Stock Analysis',
      icon: TrendingUp,
      description: 'Current inventory, stock levels, and movement trends',
      link: '/stores/reports/stock-analysis',
      color: 'from-purple-500 to-purple-600',
    },
    {
      id: 'purchase-analysis',
      title: 'Purchase Analysis',
      icon: BarChart3,
      description: 'PO trends, spending analysis, and supplier comparison',
      link: '/stores/reports/purchase-analysis',
      color: 'from-orange-500 to-orange-600',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '2rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#0F172A', marginBottom: '0.5rem' }}>
            Stores Reports
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B' }}>
            Comprehensive analytics and reporting for material management
          </p>
        </div>

        {/* Project Selector */}
        <div style={{ marginBottom: '2rem' }}>
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
            <option value="">Select Project (Optional)</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Reports Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}>
          {reports.map(report => {
            const Icon = report.icon;
            return (
              <a
                key={report.id}
                href={`${report.link}${projectId ? `?project=${projectId}` : ''}`}
                style={{
                  textDecoration: 'none',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'all 0.3s ease',
                  backgroundColor: '#fff',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Header with gradient */}
                <div style={{
                  background: `linear-gradient(135deg, ${report.color.split(' ')[1]} 0%, ${report.color.split(' ')[3]} 100%)`,
                  padding: '2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: 'white',
                }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
                      {report.title}
                    </h3>
                  </div>
                  <Icon size={32} style={{ opacity: 0.8 }} />
                </div>

                {/* Content */}
                <div style={{ padding: '1.5rem' }}>
                  <p style={{
                    fontSize: '13px',
                    color: '#64748B',
                    margin: 0,
                    lineHeight: 1.6,
                  }}>
                    {report.description}
                  </p>
                  <div style={{
                    marginTop: '1rem',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#3B82F6',
                  }}>
                    View Report →
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
