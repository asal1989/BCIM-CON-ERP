// src/pages/hr-admin/compliance/CompliancePage.jsx
// HR Compliance — premium enterprise dashboard (Zoho/Rippling-grade).
// Composes: KPI cards, filter panel, data grid, right-rail analytics,
// slide-in detail drawer, Add Compliance dialog, delete confirm dialog.
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import ComplianceKpiCards from './ComplianceKpiCards';
import ComplianceFilters from './ComplianceFilters';
import ComplianceTable from './ComplianceTable';
import ComplianceDrawer from './ComplianceDrawer';
import ComplianceForm from './ComplianceForm';
import ComplianceAnalytics from './ComplianceAnalytics';
import StatutoryCompliance from './StatutoryCompliance';
import StatutoryTracker from './StatutoryTracker';
import { hrComplianceAPI, hrMastersAPI } from '../../../api/client';
import { daysUntil } from './complianceData';

const EMPTY_FILTERS = { month: '', department: '', location: '', type: '', status: '', priority: '', search: '' };

function DeleteDialog({ item, onCancel, onConfirm }) {
  return (
    <AnimatePresence>
      {item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]" onClick={onCancel} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Delete compliance item?</h3>
            <p className="text-sm text-slate-500 mt-1.5">"{item.name}" and its history will be removed. This cannot be undone.</p>
            <div className="flex gap-2.5 mt-5">
              <button onClick={onCancel} className="flex-1 h-10 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button onClick={onConfirm} className="flex-1 h-10 rounded-xl text-sm font-semibold text-white" style={{ background: '#EF4444' }}>Delete</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'statutory', label: 'Statutory Compliance' },
  { key: 'tracker', label: 'Statutory Tracker (Projects/HO)' },
];

export default function CompliancePage() {
  const qc = useQueryClient();
  const [tab,     setTab]     = useState('dashboard');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [drawerItem, setDrawerItem] = useState(null);
  const [formOpen,   setFormOpen]   = useState(false);
  const [editItem,   setEditItem]   = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);

  const { data: itemsData, isLoading: loading } = useQuery({
    queryKey: ['compliance-tracker-items'],
    queryFn: () => hrComplianceAPI.trackerItems().then(r => r.data.data),
  });
  const items = itemsData || [];

  const { data: deptData } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []),
  });
  const departments = (deptData || []).map(d => d.name).filter(Boolean);

  const { data: locationData } = useQuery({
    queryKey: ['compliance-tracker-locations'],
    queryFn: () => hrComplianceAPI.trackerLocations().then(r => r.data.data),
  });
  const locations = locationData || [];

  const invalidateItems = () => qc.invalidateQueries({ queryKey: ['compliance-tracker-items'] });

  const createMut = useMutation({
    mutationFn: (values) => hrComplianceAPI.createTrackerItem(values),
    onSuccess: () => { invalidateItems(); toast.success('Compliance item saved'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to save compliance item'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, values }) => hrComplianceAPI.updateTrackerItem(id, values),
    onSuccess: () => { invalidateItems(); toast.success('Compliance item updated'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to update compliance item'),
  });
  const renewMut = useMutation({
    mutationFn: (id) => hrComplianceAPI.renewTrackerItem(id),
    onSuccess: () => { invalidateItems(); toast.success('Renewed for the next cycle'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to renew'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => hrComplianceAPI.deleteTrackerItem(id),
    onSuccess: () => { invalidateItems(); toast.success('Compliance item deleted'); setDeleteItem(null); },
    onError: (e) => { toast.error(e.response?.data?.error || 'Failed to delete'); setDeleteItem(null); },
  });

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return items.filter(r => {
      if (filters.month && !String(r.dueDate).startsWith(filters.month)) return false;
      if (filters.department && r.department !== filters.department) return false;
      if (filters.location && r.location !== filters.location) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.priority && r.priority !== filters.priority) return false;
      if (q) return [r.id, r.name, r.type, r.owner, r.category].some(v => String(v).toLowerCase().includes(q));
      return true;
    });
  }, [items, filters]);

  const stats = useMemo(() => ({
    total:      items.length,
    compliant:  items.filter(r => r.status === 'Compliant').length,
    dueSoon:    items.filter(r => { const d = daysUntil(r.dueDate); return d >= 0 && d <= 15 && r.status !== 'Compliant'; }).length,
    overdue:    items.filter(r => r.status === 'Overdue').length,
    documents:  items.reduce((s, r) => s + r.documents, 0),
    completionRate: items.length ? Math.round((items.filter(r => ['Compliant', 'In Progress'].includes(r.status)).length / items.length) * 100) : 0,
  }), [items]);

  const exportReport = () => {
    const header = ['Compliance ID', 'Name', 'Category', 'Type', 'Applicable To', 'Department', 'Location', 'Due Date', 'Renewal Date', 'Status', 'Priority', 'Owner', 'Documents', 'Last Updated'];
    const lines = filtered.map(r => [r.code || r.id, r.name, r.category, r.type, r.applicableTo, r.department, r.location, r.dueDate, r.renewalDate, r.status, r.priority, r.owner, r.documents, r.lastUpdated]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `compliance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Compliance report exported');
  };

  const handleRowAction = (action, row) => {
    if (row.readOnly && ['edit', 'renew', 'delete'].includes(action)) {
      toast(`This item is sourced from ${row.sourcePage} — manage it there instead`, { icon: 'ℹ️' });
      return;
    }
    if (action === 'edit')    { setDrawerItem(null); setEditItem(row); setFormOpen(true); return; }
    if (action === 'history') { setDrawerItem(row); return; }
    if (action === 'delete')  { setDeleteItem(row); return; }
    if (action === 'renew')   { renewMut.mutate(row.id); return; }
  };

  const handleSave = (values) => {
    if (editItem) updateMut.mutate({ id: editItem.id, values });
    else createMut.mutate(values);
    setEditItem(null);
  };

  return (
    <div className="hrc-modern min-h-screen p-6" style={{ background: '#F8FAFC' }}>
      {/* This module is designed sentence-case (Zoho/Rippling style) — neutralise
          the HR-module-wide uppercase transform inside this page only. */}
      <style>{`.hr-admin-uppercase .hrc-modern, .hr-admin-uppercase .hrc-modern * { text-transform: none !important; }`}</style>

      {/* ── Page header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#2563EB,#1E40AF)', boxShadow: '0 6px 18px rgba(37,99,235,.35)' }}>
            <ShieldCheck className="w-5.5 h-5.5 w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">HR Compliance</h1>
            <p className="text-sm text-slate-500 mt-0.5">Monitor statutory compliance, licenses, employee obligations, and legal requirements.</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={exportReport}
            className="h-10 px-4 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" /> Export Report
          </button>
          <button onClick={() => { setEditItem(null); setFormOpen(true); }}
            className="h-10 px-5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-transform active:scale-[0.98]"
            style={{ background: '#2563EB', boxShadow: '0 4px 14px rgba(37,99,235,.30)' }}>
            <Plus className="w-4 h-4" /> Add Compliance
          </button>
        </div>
      </motion.div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1.5 mb-5 border-b border-slate-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="relative px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{ color: tab === t.key ? '#2563EB' : '#64748B' }}>
            {t.label}
            {tab === t.key && (
              <motion.div layoutId="compliance-tab-underline" className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full"
                style={{ background: '#2563EB' }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} />
            )}
          </button>
        ))}
      </div>

      {/* ── KPI cards (shared across tabs) ── */}
      <div className="mb-4">
        <ComplianceKpiCards stats={stats} />
      </div>

      {tab === 'dashboard' ? (
        <>
          {/* ── Filters ── */}
          <div className="mb-4">
            <ComplianceFilters onApply={setFilters} departments={departments} locations={locations} />
          </div>

          {/* ── Grid + analytics rail ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
            <ComplianceTable
              rows={filtered}
              loading={loading}
              onView={setDrawerItem}
              onAction={handleRowAction}
              onCreate={() => { setEditItem(null); setFormOpen(true); }}
            />
            <ComplianceAnalytics rows={items} />
          </div>
        </>
      ) : tab === 'statutory' ? (
        <StatutoryCompliance />
      ) : (
        <StatutoryTracker />
      )}

      {/* ── Overlays ── */}
      <ComplianceDrawer item={drawerItem} onClose={() => setDrawerItem(null)} />
      <ComplianceForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditItem(null); }}
        onSave={handleSave}
        departments={departments}
        locations={locations}
        initialValues={editItem ? {
          name: editItem.name, category: editItem.category, type: editItem.type,
          applicableTo: editItem.applicableTo, department: editItem.department === '—' ? '' : editItem.department,
          location: editItem.location === '—' ? '' : editItem.location,
          dueDate: editItem.dueDate ? String(editItem.dueDate).slice(0, 10) : '',
          priority: editItem.priority, owner: editItem.owner === '—' ? '' : editItem.owner,
          description: editItem.description, renewalFrequency: 'Annual', reminderDays: 30,
        } : null}
      />
      <DeleteDialog
        item={deleteItem}
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => deleteMut.mutate(deleteItem.id)}
      />
    </div>
  );
}
