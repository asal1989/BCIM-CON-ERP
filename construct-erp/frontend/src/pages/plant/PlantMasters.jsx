// src/pages/plant/PlantMasters.jsx — All Plant & Machinery master data (tabbed)
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { plantAPI } from '../../api/client';
import { PageShell, Table, Modal, inputCls, ddmmyyyy, StatusBadge } from './_shared';

/* Master definitions: api keys + field schema */
const MASTERS = {
  categories: {
    label: 'Equipment Categories',
    list: plantAPI.listCategories, create: plantAPI.createCategory, update: plantAPI.updateCategory, del: plantAPI.deleteCategory,
    fields: [
      { name: 'name', label: 'Category Name', required: true },
      { name: 'description', label: 'Description' },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
    ],
  },
  manufacturers: {
    label: 'Manufacturers / Suppliers',
    list: plantAPI.listManufacturers, create: plantAPI.createManufacturer, update: plantAPI.updateManufacturer, del: plantAPI.deleteManufacturer,
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['manufacturer', 'supplier'] },
      { name: 'contact_person', label: 'Contact Person' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email' },
      { name: 'address', label: 'Address' },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
      { key: 'contact_person', label: 'Contact' },
      { key: 'phone', label: 'Phone' },
    ],
  },
  'fuel-types': {
    label: 'Fuel Types',
    list: plantAPI.listFuelTypes, create: plantAPI.createFuelType, update: plantAPI.updateFuelType, del: plantAPI.deleteFuelType,
    fields: [
      { name: 'name', label: 'Fuel Name', required: true },
      { name: 'uom', label: 'Unit of Measure', default: 'litre' },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'uom', label: 'UoM' },
    ],
  },
  'maintenance-vendors': {
    label: 'Maintenance Vendors',
    list: plantAPI.listMaintVendors, create: plantAPI.createMaintVendor, update: plantAPI.updateMaintVendor, del: plantAPI.deleteMaintVendor,
    fields: [
      { name: 'name', label: 'Vendor Name', required: true },
      { name: 'specialisation', label: 'Specialisation' },
      { name: 'contact_person', label: 'Contact Person' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email' },
      { name: 'address', label: 'Address' },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'specialisation', label: 'Specialisation' },
      { key: 'phone', label: 'Phone' },
    ],
  },
  'document-types': {
    label: 'Document Types',
    list: plantAPI.listDocTypes, create: plantAPI.createDocType, update: plantAPI.updateDocType, del: plantAPI.deleteDocType,
    fields: [{ name: 'name', label: 'Document Type', required: true }],
    columns: [{ key: 'name', label: 'Name' }],
  },
  operators: {
    label: 'Operators / Drivers',
    list: plantAPI.listOperators, create: plantAPI.createOperator, update: plantAPI.updateOperator, del: plantAPI.deleteOperator,
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'license_no', label: 'License No.' },
      { name: 'license_expiry', label: 'License Expiry', type: 'date' },
      { name: 'contact', label: 'Contact' },
      { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'], default: 'active' },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'license_no', label: 'License' },
      { key: 'license_expiry', label: 'Expiry', render: (r) => ddmmyyyy(r.license_expiry) },
      { key: 'contact', label: 'Contact' },
      { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status === 'active' ? 'active' : 'idle'} /> },
    ],
  },
};

function MasterForm({ def, record, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => {
    const init = {};
    def.fields.forEach((f) => { init[f.name] = record?.[f.name] ?? f.default ?? ''; });
    return init;
  });
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    for (const f of def.fields) {
      if (f.required && !form[f.name]) return toast.error(`${f.label} is required`);
    }
    onSave(form);
  };

  return (
    <Modal
      title={`${record ? 'Edit' : 'Add'} — ${def.label}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button>
          <button form="master-form" type="submit" disabled={saving} className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }>
      <form id="master-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        {def.fields.map((f) => (
          <div key={f.name} className={f.name === 'address' || f.name === 'description' ? 'col-span-2 space-y-1' : 'space-y-1'}>
            <label className="block text-xs font-medium text-gray-500">{f.label}{f.required && ' *'}</label>
            {f.type === 'select' ? (
              <select className={inputCls} value={form[f.name]} onChange={(e) => set(f.name, e.target.value)}>
                {f.options.map((o) => <option key={o} value={o} className="capitalize">{o}</option>)}
              </select>
            ) : (
              <input type={f.type || 'text'} className={inputCls} value={form[f.name] || ''} onChange={(e) => set(f.name, e.target.value)} />
            )}
          </div>
        ))}
      </form>
    </Modal>
  );
}

export default function PlantMasters() {
  const [tab, setTab] = useState('categories');
  const [showForm, setShowForm] = useState(false);
  const [editRec, setEditRec] = useState(null);
  const qc = useQueryClient();
  const def = MASTERS[tab];

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['pm-master', tab],
    queryFn: () => def.list().then((r) => r.data?.data || []).catch(() => []),
  });

  const saveMut = useMutation({
    mutationFn: (payload) => (editRec ? def.update(editRec.id, payload) : def.create(payload)),
    onSuccess: () => {
      toast.success(editRec ? 'Updated' : 'Created');
      qc.invalidateQueries({ queryKey: ['pm-master', tab] });
      setShowForm(false); setEditRec(null);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const delMut = useMutation({
    mutationFn: (id) => def.del(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-master', tab] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const columns = [
    ...def.columns,
    {
      key: '_actions', label: 'Actions', render: (row) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setEditRec(row); setShowForm(true); }} className="rounded p-1.5 text-gray-400 hover:bg-teal-50 hover:text-teal-600"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={() => window.confirm('Delete this record?') && delMut.mutate(row.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="Masters"
      onRefresh={refetch}
      onAdd={() => { setEditRec(null); setShowForm(true); }}
      addLabel={`Add ${def.label}`}
      exportData={data}
      exportName={`pm_${tab}`}
    >
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {Object.entries(MASTERS).map(([key, m]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-2 text-xs font-medium transition ${tab === key ? 'border-b-2 border-teal-600 text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <Table columns={columns} rows={data} isLoading={isLoading} />
      {showForm && (
        <MasterForm def={def} record={editRec} saving={saveMut.isPending}
          onClose={() => { setShowForm(false); setEditRec(null); }}
          onSave={(d) => saveMut.mutate(d)} />
      )}
    </PageShell>
  );
}
