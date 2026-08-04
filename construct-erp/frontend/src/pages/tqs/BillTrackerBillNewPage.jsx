// src/pages/tqs/TQSBillNewPage.jsx
// Standalone "New Bill" form — opens in a separate browser tab/window
// via window.open('/tqs/bills/new'). On save or cancel, closes the tab
// (or falls back to navigating back to /tqs/bills if popups are blocked).

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { projectAPI } from '../../api/client';
import { NewBillModal } from './BillTrackerBillsPage';
import { Theme } from '../../theme';

export default function BillTrackerBillNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const defaultProjectId = params.get('project') || '';

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const handleClose = () => {
    // Try to close the tab (works when opened via window.open).
    // If popups blocked / opened by user typing URL, navigate back.
    if (window.opener) {
      window.close();
    } else {
      navigate('/tqs/bills');
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: Theme.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-slate-600 font-bold">Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: Theme.pageBg }}>
      <NewBillModal
        onClose={handleClose}
        projects={projects}
        defaultProjectId={defaultProjectId}
      />
    </div>
  );
}
