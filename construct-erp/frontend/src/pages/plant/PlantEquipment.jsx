// src/pages/plant/PlantEquipment.jsx — Asset Register: equipment list, form, detail (docs + depreciation)
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Eye, FileText, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { plantAPI, projectAPI } from '../../api/client';
import {
  PageShell, Table, Modal, SearchBar, StatusBadge, inputCls, inr, ddmmyyyy,
} from './_shared';

const STATUSES = ['active', 'idle', 'maintenance', 'disposed'];

function useLookups() {
  const { data: categories = [] } = useQuery({ queryKey: ['pm-cats'], queryFn: () => plantAPI.listCategories().then((r) => r.data?.data || []).catch(() => []) });
  const { data: manufacturers = [] } = useQuery({ queryKey: ['pm-mfrs'], queryFn: () => plantAPI.listManufacturers().then((r) => r.data?.data || []).catch(() => []) });
  const { data: projects = [] } = useQuery({ queryKey: ['projects-list'], queryFn: () => projectAPI.list().then((r) => r.data?.data || r.data || []).catch(() => []) });
  return { categories, manufacturers, projects };
}

function EquipmentForm({ record, onClose }) {
  const qc = useQueryClient();
  const { categories, manufacturers, projects } = useLookups();
  const [f, setF] = useState(() => ({
    name: record?.name || '', category_id: record?.category_id || '', type: record?.type || 'own',
    manufacturer_id: record?.manufacturer_id || '', make: record?.make || '', model: record?.model || '',
    year: record?.year || '', capacity: record?.capacity || '', uom: record?.uom || '',
    reg_number: record?.reg_number || '', purchase_date: record?.purchase_date?.slice(0, 10) || '',
    purchase_value: record?.purchase_value || '', useful_life_years: record?.useful_life_years || 10,
    salvage_value: record?.salvage_value || '', status: record?.status || 'active',
    current_site_id: record?.current_site_id || '', remarks: record?.remarks || '',
  }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: (payload) => (record ? plantAPI.updateEquipment(record.id, payload) : plantAPI.createEquipment(payload)),
    onSuccess: () => { toast.success(record ? 'Equipment updated' : 'Equipment added'); qc.invalidateQueries({ queryKey: ['pm-equipment'] }); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!f.name) return toast.error('Name is required');
    save.mutate(f);
  };

  const Field = ({ label, children, span }) => (
    <div className={span === 2 ? 'col-span-2 space-y-1' : 'space-y-1'}>
      <label className="block text-xs font-medium text-gray-500">{label}</label>{children}
    </div>
  );

  return (
    <Modal title={record ? `Edit — ${record.code}` : 'Add Equipment'} onClose={onClose} maxW="max-w-3xl"
      footer={
        <>
          <button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button>
          <button form="equip-form" type="submit" disabled={save.isPending} className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }>
      <form id="equip-form" onSubmit={submit} className="grid grid-cols-3 gap-4">
        <Field label="Name *"><input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Category">
          <select className={inputCls} value={f.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className={inputCls} value={f.type} onChange={(e) => set('type', e.target.value)}>
            <option value="own">Own</option><option value="hired">Hired</option>
          </select>
        </Field>
        <Field label="Manufacturer">
          <select className={inputCls} value={f.manufacturer_id} onChange={(e) => set('manufacturer_id', e.target.value)}>
            <option value="">—</option>{manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Make"><input className={inputCls} value={f.make} onChange={(e) => set('make', e.target.value)} /></Field>
        <Field label="Model"><input className={inputCls} value={f.model} onChange={(e) => set('model', e.target.value)} /></Field>
        <Field label="Year"><input type="number" className={inputCls} value={f.year} onChange={(e) => set('year', e.target.value)} /></Field>
        <Field label="Capacity"><input className={inputCls} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} /></Field>
        <Field label="Unit of Measure"><input className={inputCls} value={f.uom} onChange={(e) => set('uom', e.target.value)} /></Field>
        <Field label="Registration No."><input className={inputCls} value={f.reg_number} onChange={(e) => set('reg_number', e.target.value)} /></Field>
        <Field label="Purchase Date"><input type="date" className={inputCls} value={f.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} /></Field>
        <Field label="Purchase Value (₹)"><input type="number" className={inputCls} value={f.purchase_value} onChange={(e) => set('purchase_value', e.target.value)} /></Field>
        <Field label="Useful Life (yrs)"><input type="number" className={inputCls} value={f.useful_life_years} onChange={(e) => set('useful_life_years', e.target.value)} /></Field>
        <Field label="Salvage Value (₹)"><input type="number" className={inputCls} value={f.salvage_value} onChange={(e) => set('salvage_value', e.target.value)} /></Field>
        <Field label="Status">
          <select className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
        </Field>
        <Field label="Current Site">
          <select className={inputCls} value={f.current_site_id} onChange={(e) => set('current_site_id', e.target.value)}>
            <option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Remarks" span={2}><input className={inputCls} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

function EquipmentDetail({ id, onClose }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['pm-equipment', id],
    queryFn: () => plantAPI.getEquipment(id).then((r) => r.data?.data).catch(() => null),
  });
  const [doc, setDoc] = useState({ document_type: '', doc_number: '', issue_date: '', expiry_date: '' });

  const addDoc = useMutation({
    mutationFn: (payload) => plantAPI.addDocument(id, payload),
    onSuccess: () => { toast.success('Document added'); qc.invalidateQueries({ queryKey: ['pm-equipment', id] }); setDoc({ document_type: '', doc_number: '', issue_date: '', expiry_date: '' }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const delDoc = useMutation({
    mutationFn: (docId) => plantAPI.deleteDocument(docId),
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['pm-equipment', id] }); },
  });

  if (isLoading || !data) return <Modal title="Equipment" onClose={onClose}><div className="py-10 text-center text-sm text-gray-400">Loading…</div></Modal>;

  return (
    <Modal title={`${data.code} · ${data.name}`} onClose={onClose} maxW="max-w-4xl">
      <div className="space-y-5">
        <div className="grid grid-cols-4 gap-3 text-sm">
          {[
            ['Category', data.category_name], ['Type', data.type], ['Make / Model', `${data.make || ''} ${data.model || ''}`.trim() || '—'],
            ['Year', data.year], ['Capacity', `${data.capacity || ''} ${data.uom || ''}`.trim() || '—'], ['Reg No.', data.reg_number],
            ['Current Site', data.current_site_name], ['Purchase Value', inr(data.purchase_value)],
          ].map(([k, v]) => (
            <div key={k}><div className="text-[11px] uppercase text-gray-400">{k}</div><div className="font-medium text-gray-800">{v || '—'}</div></div>
          ))}
          <div><div className="text-[11px] uppercase text-gray-400">Status</div><StatusBadge status={data.status} /></div>
        </div>

        {/* Documents */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">Documents</h3>
          <Table
            columns={[
              { key: 'document_type', label: 'Type' },
              { key: 'doc_number', label: 'Number' },
              { key: 'issue_date', label: 'Issued', render: (r) => ddmmyyyy(r.issue_date) },
              { key: 'expiry_date', label: 'Expiry', render: (r) => ddmmyyyy(r.expiry_date) },
              { key: '_a', label: '', render: (r) => <button onClick={() => delDoc.mutate(r.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button> },
            ]}
            rows={data.documents || []}
            empty="No documents"
          />
          <div className="mt-2 grid grid-cols-5 gap-2">
            <input className={inputCls} placeholder="Type (RC, Insurance…)" value={doc.document_type} onChange={(e) => setDoc({ ...doc, document_type: e.target.value })} />
            <input className={inputCls} placeholder="Doc number" value={doc.doc_number} onChange={(e) => setDoc({ ...doc, doc_number: e.target.value })} />
            <input type="date" className={inputCls} value={doc.issue_date} onChange={(e) => setDoc({ ...doc, issue_date: e.target.value })} />
            <input type="date" className={inputCls} value={doc.expiry_date} onChange={(e) => setDoc({ ...doc, expiry_date: e.target.value })} />
            <button onClick={() => doc.document_type ? addDoc.mutate(doc) : toast.error('Type required')} className="flex items-center justify-center gap-1 rounded bg-teal-600 text-xs font-semibold text-white hover:bg-teal-700"><Plus className="h-3.5 w-3.5" /> Add</button>
          </div>
        </div>

        {/* Depreciation */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">Depreciation Schedule (Straight-Line)</h3>
          <Table
            columns={[
              { key: 'year', label: 'Year' },
              { key: 'opening_value', label: 'Opening', render: (r) => inr(r.opening_value) },
              { key: 'depreciation_amount', label: 'Depreciation', render: (r) => inr(r.depreciation_amount) },
              { key: 'closing_value', label: 'Closing', render: (r) => inr(r.closing_value) },
            ]}
            rows={data.depreciation || []}
            empty="No depreciation (set purchase value)"
          />
        </div>
      </div>
    </Modal>
  );
}

export default function PlantEquipment() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editRec, setEditRec] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['pm-equipment'],
    queryFn: () => plantAPI.listEquipment().then((r) => r.data?.data || []).catch(() => []),
  });

  const delMut = useMutation({
    mutationFn: (id) => plantAPI.deleteEquipment(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-equipment'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const filtered = data.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (search && !`${e.code} ${e.name} ${e.make || ''} ${e.model || ''} ${e.reg_number || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const columns = [
    { key: 'code', label: 'Code', render: (r) => <span className="rounded bg-teal-50 px-2 py-0.5 font-mono text-xs font-semibold text-teal-700">{r.code}</span> },
    { key: 'name', label: 'Name', render: (r) => <div><div className="font-semibold text-gray-900">{r.name}</div><div className="text-[11px] text-gray-400">{`${r.make || ''} ${r.model || ''}`.trim()}</div></div> },
    { key: 'category_name', label: 'Category' },
    { key: 'type', label: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
    { key: 'current_site_name', label: 'Site' },
    { key: 'purchase_value', label: 'Value', render: (r) => inr(r.purchase_value) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: '_a', label: 'Actions', render: (r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setDetailId(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-slate-100 hover:text-slate-700"><Eye className="h-3.5 w-3.5" /></button>
          <button onClick={() => { setEditRec(r); setShowForm(true); }} className="rounded p-1.5 text-gray-400 hover:bg-teal-50 hover:text-teal-600"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={() => window.confirm(`Delete ${r.name}?`) && delMut.mutate(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <PageShell title="Asset Register" onRefresh={refetch} onAdd={() => { setEditRec(null); setShowForm(true); }} addLabel="Add Equipment" exportData={filtered} exportName="pm_equipment">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[240px]"><SearchBar value={search} onChange={setSearch} placeholder="Search by code, name, make, reg no…" /></div>
        <select className="rounded border border-gray-200 bg-white px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>{STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
      </div>
      <Table columns={columns} rows={filtered} isLoading={isLoading} onRowClick={(r) => setDetailId(r.id)} />
      {showForm && <EquipmentForm record={editRec} onClose={() => { setShowForm(false); setEditRec(null); }} />}
      {detailId && <EquipmentDetail id={detailId} onClose={() => setDetailId(null)} />}
    </PageShell>
  );
}
