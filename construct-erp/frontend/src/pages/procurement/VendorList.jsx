// src/pages/procurement/VendorList.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Users, Plus, X, Phone, Mail, Star, MapPin, CreditCard,
  Shield, Search, Building2, ChevronDown, ChevronUp,
  Banknote, FileText, Filter
} from 'lucide-react';
import { vendorAPI, default as api } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import DataToolbar from '../../components/common/DataToolbar';
import TableActions from '../../components/common/TableActions';

const TYPES = {
  material_supplier:  { label: 'Material Supplier',  dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  subcontractor:      { label: 'Subcontractor',       dot: 'bg-purple-500',  badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  'Sub-contractor':   { label: 'Sub-contractor',      dot: 'bg-purple-500',  badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  labour_contractor:  { label: 'Labour Contractor',   dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  'Labour Contractor':{ label: 'Labour Contractor',   dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  equipment_supplier: { label: 'Equipment Supplier',  dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  service_provider:   { label: 'Service Provider',    dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-900 border-slate-200' },
  'Service Provider': { label: 'Service Provider',    dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-900 border-slate-200' },
  Contractor:         { label: 'Contractor',          dot: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  Supplier:           { label: 'Supplier',            dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  Consultant:         { label: 'Consultant',          dot: 'bg-teal-500',    badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  Other:              { label: 'Other',               dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-900 border-slate-200' },
};

// Vendor type options for the "Register" form (combined list)
const VENDOR_TYPE_OPTIONS = [
  { value: 'material_supplier',  label: 'Material Supplier' },
  { value: 'subcontractor',      label: 'Subcontractor' },
  { value: 'labour_contractor',  label: 'Labour Contractor' },
  { value: 'equipment_supplier', label: 'Equipment Supplier' },
  { value: 'service_provider',   label: 'Service Provider' },
  { value: 'Contractor',         label: 'Contractor' },
  { value: 'Supplier',           label: 'Supplier' },
  { value: 'Consultant',         label: 'Consultant' },
  { value: 'Other',              label: 'Other' },
];

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh',
];

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={clsx('w-3 h-3', i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200')} />
      ))}
      <span className="text-xs text-slate-900 font-medium ml-1">{Number(rating).toFixed(1)}</span>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all placeholder:text-slate-400';

export default function VendorList() {
  const [showForm, setShowForm]     = useState(false);
  const [editVendor, setEditVendor] = useState(null); // null = create mode, object = edit mode
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { credit_days: 30 },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorAPI.list().then(r => r.data?.data || []).catch(() => []),
  });

  const openCreate = () => { setEditVendor(null); reset({ credit_days: 30 }); setShowForm(true); };
  const openEdit   = v  => {
    setEditVendor(v);
    reset({
      name: v.name, trade_name: v.trade_name, vendor_type: v.vendor_type,
      contact_person: v.contact_person, phone: v.phone,
      mobile_number_1: v.mobile_number_1, mobile_number_2: v.mobile_number_2,
      email: v.email, website_url: v.website_url, credit_days: v.credit_days || 30,
      gstin: v.gstin, pan: v.pan, trade_license: v.trade_license,
      msme_reg: v.msme_reg, address: v.address, city: v.city,
      pincode: v.pincode, state: v.state,
      bank_name: v.bank_name, bank_branch: v.bank_branch,
      ifsc_code: v.ifsc_code || v.bank_ifsc,
      account_number: v.account_number || v.bank_account,
      notes: v.notes,
    });
    setShowForm(true);
  };
  const closeForm = () => { reset(); setShowForm(false); setEditVendor(null); };

  const createMut = useMutation({
    mutationFn: d => vendorAPI.create(d),
    onSuccess: () => {
      toast.success('Vendor registered successfully');
      closeForm();
      qc.invalidateQueries({ queryKey: ['vendors'] });
      qc.invalidateQueries({ queryKey: ['tqs-vendors'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Registration failed'),
  });

  const updateMut = useMutation({
    mutationFn: d => vendorAPI.update(editVendor.id, d),
    onSuccess: () => {
      toast.success('Vendor updated successfully');
      closeForm();
      qc.invalidateQueries({ queryKey: ['vendors'] });
      qc.invalidateQueries({ queryKey: ['tqs-vendors'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/vendors/${id}`),
    onSuccess: () => { toast.success('Vendor removed'); qc.invalidateQueries({ queryKey: ['vendors'] }); },
    onError: () => toast.error('Delete failed'),
  });

  const importMut = useMutation({
    mutationFn: file => { const fd = new FormData(); fd.append('file', file); return vendorAPI.import(fd); },
    onSuccess: res => { toast.success(res.data.message || 'Import complete'); qc.invalidateQueries({ queryKey: ['vendors'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Import failed'),
  });

  // Normalise legacy mixed-case vendor_type values to canonical snake_case keys
  const normalizeType = t => ({
    'Sub-contractor':   'subcontractor',
    'Labour Contractor':'labour_contractor',
    'Service Provider': 'service_provider',
  })[t] || t;

  const allVendors = data || [];
  const vendors = allVendors.filter(v => {
    if (filterType !== 'all' && normalizeType(v.vendor_type) !== filterType) return false;
    if (search && !`${v.name} ${v.vendor_code} ${v.city} ${v.contact_person}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-900 font-medium mb-1">
            <Building2 className="w-3.5 h-3.5" /> Shared · Procurement &amp; Bill Tracker
          </div>
          <h1 className="text-2xl font-medium text-slate-900">Vendor Master</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">{allVendors.length} vendors · shared across Procurement &amp; Bill Tracker</p>
        </div>
        <div className="flex items-center gap-3">
          <DataToolbar
            data={vendors}
            fileName="Vendor_Register"
            onImport={f => importMut.mutate(f)}
            templateName="Vendor_Import_Template"
            templateData={[{ name: 'ABC Trading Co', vendor_type: 'material_supplier', gstin: '27AABCS1234A1Z5', pan: 'AABCS1234A', contact_person: 'John Doe', phone: '9876543210', city: 'Mumbai', state: 'Maharashtra', website_url: 'https://example.com', credit_days: '30' }]}
            hideAdd
          />
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Register Vendor
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total',     val: allVendors.length,                                                  color: 'text-slate-900',   bg: 'bg-slate-100' },
          { label: 'Material',  val: allVendors.filter(v => normalizeType(v.vendor_type)==='material_supplier').length,  color: 'text-blue-700',    bg: 'bg-blue-50' },
          { label: 'Sub-Con',   val: allVendors.filter(v => normalizeType(v.vendor_type)==='subcontractor').length,       color: 'text-purple-700',  bg: 'bg-purple-50' },
          { label: 'Labour',    val: allVendors.filter(v => normalizeType(v.vendor_type)==='labour_contractor').length,   color: 'text-amber-700',   bg: 'bg-amber-50' },
          { label: 'Equipment', val: allVendors.filter(v => normalizeType(v.vendor_type)==='equipment_supplier').length,  color: 'text-emerald-700', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
            <div className={clsx('text-2xl font-medium font-mono', s.color)}>{s.val}</div>
            <div className="text-xs text-slate-900 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-900 font-medium outline-none focus:border-indigo-400 transition-all"
            placeholder="Search name, code, city…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          {[{ value: 'all', label: 'All Types' }, ...VENDOR_TYPE_OPTIONS].map(t => (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                filterType === t.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Vendor Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(n => <div key={n} className="h-16 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : vendors.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No vendors found</p>
          <p className="text-xs text-slate-900 font-medium mt-1">Adjust your search or register a new vendor</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Table Head */}
          <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
            <div className="col-span-4">Vendor</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">GSTIN</div>
            <div className="col-span-1 text-center">Credit</div>
            <div className="col-span-2">Contact</div>
            <div className="col-span-1" />
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-50">
            {vendors.map(v => {
              const vt = TYPES[v.vendor_type] || TYPES.service_provider;
              const isOpen = expanded === v.id;

              return (
                <div key={v.id}>
                  {/* Main Row */}
                  <div
                    className="grid grid-cols-12 gap-3 px-4 py-3.5 items-center hover:bg-slate-50 transition-colors cursor-pointer group"
                    onClick={() => setExpanded(isOpen ? null : v.id)}
                  >
                    {/* Vendor name + code */}
                    <div className="col-span-4 flex items-center gap-3 min-w-0">
                      <div className={clsx('w-2 h-2 rounded-full shrink-0', vt.dot)} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{v.name}</div>
                        <div className="text-xs text-slate-900 font-medium font-mono">{v.vendor_code}</div>
                      </div>
                    </div>

                    {/* Type badge */}
                    <div className="col-span-2">
                      <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border', vt.badge)}>
                        {vt.label}
                      </span>
                    </div>

                    {/* GSTIN */}
                    <div className="col-span-2 text-xs font-mono text-slate-900 truncate">{v.gstin || '—'}</div>

                    {/* Credit days */}
                    <div className="col-span-1 text-center">
                      <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-medium">
                        {v.credit_days || 30}d
                      </span>
                    </div>

                    {/* Contact */}
                    <div className="col-span-2 text-xs text-slate-900 font-medium truncate">
                      {v.contact_person || '—'}
                      {v.phone && <div className="text-slate-400">{v.phone}</div>}
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setExpanded(isOpen ? null : v.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-900 font-medium hover:border-indigo-300 hover:text-indigo-600 transition-all"
                      >
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <TableActions onEdit={() => openEdit(v)} onDelete={() => deleteMut.mutate(v.id)} recordName={v.name} />
                    </div>
                  </div>

                  {/* Expanded Detail Row */}
                  {isOpen && (
                    <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Detail label="Trade Name" value={v.trade_name} />
                        <Detail label="PAN" value={v.pan} mono />
                        <Detail label="GSTIN" value={v.gstin} mono />
                        <Detail label="Website" value={v.website_url} />
                        <Detail label="Email" value={v.email} />
                        <Detail label="Mobile Number 1" value={v.mobile_number_1} />
                        <Detail label="Mobile Number 2" value={v.mobile_number_2} />
                        <Detail label="Address" value={[v.address, v.city, v.state, v.pincode].filter(Boolean).join(', ')} />
                        <Detail label="Credit Days" value={v.credit_days ? `${v.credit_days} days` : '—'} />
                        <Detail label="Trade License" value={v.trade_license} />
                        <Detail label="MSME Reg." value={v.msme_reg} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                        <Detail label="Bank" value={v.bank_name} />
                        <Detail label="Account No." value={v.account_number || v.bank_account} mono />
                        <Detail label="IFSC" value={v.ifsc_code || v.bank_ifsc} mono />
                        <Detail label="Branch" value={v.bank_branch} />
                      </div>
                      {v.notes && (
                        <div className="pt-2 border-t border-slate-100">
                          <div className="text-[10px] text-slate-900 font-medium uppercase tracking-wider mb-1">Notes</div>
                          <p className="text-xs text-slate-600">{v.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer count */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
            Showing {vendors.length} of {allVendors.length} vendors
          </div>
        </div>
      )}

      {/* Register Vendor Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6">

            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-medium text-slate-900">{editVendor ? 'Edit Vendor' : 'Register Vendor'}</h2>
                <p className="text-xs text-slate-900 font-medium mt-0.5">{editVendor ? `Editing: ${editVendor.name}` : 'Add a new vendor to the master ledger'}</p>
              </div>
              <button onClick={closeForm} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-900 font-medium hover:text-slate-900 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(d => editVendor ? updateMut.mutate(d) : createMut.mutate(d))} className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">

              {/* Section: Basic */}
              <Section icon={<Shield className="w-4 h-4 text-indigo-500" />} title="Basic Information">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <FormField label="Vendor / Company Name *">
                      <input {...register('name', { required: true })} className={clsx(inputCls, errors.name && 'border-red-300')} placeholder="ABC Traders Pvt Ltd" />
                    </FormField>
                  </div>
                  <FormField label="Trade Name / Brand">
                    <input {...register('trade_name')} className={inputCls} placeholder="ABC" />
                  </FormField>
                  <FormField label="Vendor Type *">
                    <select {...register('vendor_type', { required: true })} className={clsx(inputCls, errors.vendor_type && 'border-red-300')}>
                      <option value="">Select…</option>
                      {VENDOR_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Contact Person">
                    <input {...register('contact_person')} className={inputCls} placeholder="Ramesh Patil" />
                  </FormField>
                  <FormField label="Phone">
                    <input {...register('phone')} className={inputCls} placeholder="9876543210" maxLength={15} />
                  </FormField>
                  <FormField label="Mobile Number 1">
                    <input {...register('mobile_number_1')} className={inputCls} placeholder="9876543210" maxLength={15} />
                  </FormField>
                  <FormField label="Mobile Number 2">
                    <input {...register('mobile_number_2')} className={inputCls} placeholder="9876543210" maxLength={15} />
                  </FormField>
                  <div className="col-span-2">
                    <FormField label="Email">
                      <input type="email" {...register('email')} className={inputCls} placeholder="accounts@vendor.com" />
                    </FormField>
                  </div>
                  <div className="col-span-2">
                    <FormField label="Website / Catalog URL">
                      <input {...register('website_url')} className={inputCls} placeholder="https://vendor.com/catalog" />
                    </FormField>
                  </div>
                  <FormField label="Credit Period (Days)">
                    <input type="number" {...register('credit_days')} className={inputCls} placeholder="30" />
                  </FormField>
                </div>
              </Section>

              {/* Section: Statutory */}
              <Section icon={<FileText className="w-4 h-4 text-blue-500" />} title="Statutory &amp; Address">
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="GSTIN">
                    <input {...register('gstin')} className={inputCls} placeholder="27AABCS1234A1Z5" maxLength={15} style={{ textTransform: 'uppercase' }} />
                  </FormField>
                  <FormField label="PAN">
                    <input {...register('pan')} className={inputCls} placeholder="AABCS1234A" maxLength={10} style={{ textTransform: 'uppercase' }} />
                  </FormField>
                  <FormField label="Trade License No.">
                    <input {...register('trade_license')} className={inputCls} placeholder="TL/2024/1234" />
                  </FormField>
                  <FormField label="MSME Reg. No.">
                    <input {...register('msme_reg')} className={inputCls} placeholder="UDYAM-XX-00-0000000" />
                  </FormField>
                  <div className="col-span-2">
                    <FormField label="Address">
                      <input {...register('address')} className={inputCls} placeholder="Street / Building No." />
                    </FormField>
                  </div>
                  <FormField label="City">
                    <input {...register('city')} className={inputCls} placeholder="Bangalore" />
                  </FormField>
                  <FormField label="Pincode">
                    <input {...register('pincode')} className={inputCls} placeholder="560001" maxLength={6} />
                  </FormField>
                  <div className="col-span-2">
                    <FormField label="State">
                      <select {...register('state')} className={inputCls}>
                        <option value="">Select state…</option>
                        {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </FormField>
                  </div>
                </div>
              </Section>

              {/* Section: Banking */}
              <Section icon={<Banknote className="w-4 h-4 text-emerald-500" />} title="Banking Details">
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Bank Name">
                    <input {...register('bank_name')} className={inputCls} placeholder="HDFC Bank" />
                  </FormField>
                  <FormField label="Branch">
                    <input {...register('bank_branch')} className={inputCls} placeholder="MG Road, Bangalore" />
                  </FormField>
                  <FormField label="IFSC Code">
                    <input {...register('ifsc_code')} className={inputCls} placeholder="HDFC0001234" maxLength={11} style={{ textTransform: 'uppercase' }} />
                  </FormField>
                  <FormField label="Account Number">
                    <input {...register('account_number')} className={inputCls} placeholder="50100123456789" maxLength={25} />
                  </FormField>
                </div>
              </Section>

              {/* Section: Notes */}
              <Section icon={<FileText className="w-4 h-4 text-slate-400" />} title="Notes">
                <FormField label="Internal Notes">
                  <textarea {...register('notes')} rows={2} className={inputCls} placeholder="Any remarks about this vendor…" />
                </FormField>
              </Section>

              {/* Footer Buttons */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-200 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-60">
                  {editVendor
                    ? (updateMut.isPending ? 'Saving…' : 'Save Changes')
                    : (createMut.isPending ? 'Registering…' : 'Register Vendor')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
        {icon}
        <span className="text-xs font-medium text-slate-900 uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] text-slate-900 font-medium uppercase tracking-wider mb-1">{label}</div>
      <div className={clsx('text-xs text-slate-800', mono && 'font-mono')}>{value || '—'}</div>
    </div>
  );
}
