// src/pages/hr-admin/compliance/CompliancePage.jsx
// HR Compliance — premium enterprise dashboard (Zoho/Rippling-grade).
// Composes: KPI cards, filter panel, data grid, right-rail analytics,
// slide-in detail drawer, Add Compliance dialog, delete confirm dialog.
import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import ComplianceKpiCards from './ComplianceKpiCards';
import ComplianceFilters from './ComplianceFilters';
import ComplianceTable from './ComplianceTable';
import ComplianceDrawer from './ComplianceDrawer';
import ComplianceForm from './ComplianceForm';
import ComplianceAnalytics from './ComplianceAnalytics';
import { DUMMY_COMPLIANCES, daysUntil } from './complianceData';

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

export default function CompliancePage() {
  const [items,   setItems]   = useState(DUMMY_COMPLIANCES);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [drawerItem, setDrawerItem] = useState(null);
  const [formOpen,   setFormOpen]   = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);

  // Skeleton pass on first mount — mirrors a react-query fetch lifecycle.
  useEffect(() => { const t = setTimeout(() => setLoading(false), 650); return () => clearTimeout(t); }, []);

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
    const lines = filtered.map(r => [r.id, r.name, r.category, r.type, r.applicableTo, r.department, r.location, r.dueDate, r.renewalDate, r.status, r.priority, r.owner, r.documents, r.lastUpdated]
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
    if (action === 'edit')    { setDrawerItem(null); setFormOpen(true); toast('Editing pre-fill coming with backend wiring', { icon: '✏️' }); return; }
    if (action === 'history') { setDrawerItem(row); return; }
    if (action === 'delete')  { setDeleteItem(row); return; }
    if (action === 'renew')   {
      setItems(p => p.map(r => r.id === row.id
        ? { ...r, status: 'Compliant', renewalDate: new Date(new Date(r.renewalDate).setFullYear(new Date(r.renewalDate).getFullYear() + 1)).toISOString().slice(0, 10), lastUpdated: new Date().toISOString().slice(0, 10) }
        : r));
      toast.success(`"${row.name}" renewed for the next cycle`);
      return;
    }
    if (action === 'upload')  { toast('Document upload will attach to this item once backend is wired', { icon: '📎' }); return; }
    if (action === 'assign')  { toast('Owner reassignment opens the employee picker once backend is wired', { icon: '👤' }); return; }
  };

  const handleCreate = (values) => {
    const nextSeq = String(items.length + 1).padStart(3, '0');
    setItems(p => [{
      id: values.code || `CMP-2026-${nextSeq}`,
      name: values.name, category: values.category || 'Statutory', type: values.type,
      applicableTo: values.applicableTo || 'All Employees',
      department: values.department || 'HR', location: values.location || 'Head Office',
      dueDate: values.dueDate, renewalDate: values.dueDate,
      status: 'Pending', priority: values.priority || 'Medium',
      owner: values.owner, documents: 0,
      lastUpdated: new Date().toISOString().slice(0, 10),
      description: values.description || '', legalRef: '—',
    }, ...p]);
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
          <button onClick={() => setFormOpen(true)}
            className="h-10 px-5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-transform active:scale-[0.98]"
            style={{ background: '#2563EB', boxShadow: '0 4px 14px rgba(37,99,235,.30)' }}>
            <Plus className="w-4 h-4" /> Add Compliance
          </button>
        </div>
      </motion.div>

      {/* ── KPI cards ── */}
      <div className="mb-4">
        <ComplianceKpiCards stats={stats} />
      </div>

      {/* ── Filters ── */}
      <div className="mb-4">
        <ComplianceFilters onApply={setFilters} />
      </div>

      {/* ── Grid + analytics rail ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <ComplianceTable
          rows={filtered}
          loading={loading}
          onView={setDrawerItem}
          onAction={handleRowAction}
          onCreate={() => setFormOpen(true)}
        />
        <ComplianceAnalytics rows={items} />
      </div>

      {/* ── Overlays ── */}
      <ComplianceDrawer item={drawerItem} onClose={() => setDrawerItem(null)} />
      <ComplianceForm open={formOpen} onClose={() => setFormOpen(false)} onSave={handleCreate} />
      <DeleteDialog
        item={deleteItem}
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => { setItems(p => p.filter(r => r.id !== deleteItem.id)); toast.success('Compliance item deleted'); setDeleteItem(null); }}
      />
    </div>
  );
}
