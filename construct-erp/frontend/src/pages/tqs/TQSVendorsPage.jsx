import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tqsVendorsAPI } from '../../api/client';
import { Users, Plus, Search, Edit2, Trash2, X, ChevronDown, ChevronUp, Building2, Phone, Mail, MapPin, CreditCard, Briefcase } from 'lucide-react';
import toast from 'react-hot-toast';

const VENDOR_TYPES = ['Contractor', 'Supplier', 'Consultant', 'Sub-contractor', 'Service Provider', 'Labour Contractor', 'Other'];

// Zoho-style type tab config
const TYPE_TABS = [
  { key: '',                 label: 'All Vendors'      },
  { key: 'Contractor',       label: 'Contractor'       },
  { key: 'Sub-contractor',   label: 'Sub-Contractor'   },
  { key: 'Supplier',         label: 'Supplier'         },
  { key: 'Labour Contractor',label: 'Labour'           },
  { key: 'Service Provider', label: 'Service Provider' },
  { key: 'Consultant',       label: 'Consultant'       },
  { key: 'Other',            label: 'Other'            },
];

const EMPTY = {
  name: '', trade_name: '', vendor_type: '', contact_person: '', phone: '', email: '',
  address: '', city: '', state: 'Karnataka', pincode: '',
  gstin: '', pan: '', trade_license: '', msme_reg: '',
  bank_name: '', bank_account: '', bank_ifsc: '', bank_branch: '', notes: '',
  // Subcontractor-only extension fields
  trade_category: '', contract_start_date: '', contract_end_date: '',
  subcontractor_status: 'active',
};

const TRADE_CATEGORIES = ['Civil', 'Electrical', 'Plumbing', 'HVAC', 'Painting', 'Fabrication', 'Tiling', 'Carpentry', 'Glazing', 'Waterproofing', 'Demolition', 'Earthwork', 'Steel Works', 'Other'];

function Input({ label, value, onChange, required, upper, maxLength, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-900 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
      />
    </div>
  );
}

function Textarea({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-900 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-none"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-900 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
      >
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SectionHeader({ icon: Icon, label, color = 'blue' }) {
  const colors = { blue: 'text-blue-600 bg-blue-50', indigo: 'text-blue-600 bg-blue-50', amber: 'text-amber-600 bg-amber-50', emerald: 'text-emerald-600 bg-emerald-50', violet: 'text-blue-600 bg-blue-50' };
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${colors[color]} mb-3`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}

function VendorModal({ vendor, onClose, onSave }) {
  const [form, setForm] = useState(vendor ? { ...vendor } : { ...EMPTY });
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Vendor name is required');
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-medium text-slate-800">{vendor ? 'Edit Vendor' : 'New Vendor'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Basic */}
          <div>
            <SectionHeader icon={Building2} label="Basic Details" color="indigo" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Vendor / Company Name" value={form.name} onChange={set('name')} required />
              <Input label="Trade Name / Brand" value={form.trade_name} onChange={set('trade_name')} />
              <Select label="Vendor Type" value={form.vendor_type} onChange={set('vendor_type')} options={VENDOR_TYPES} />
              <Input label="Contact Person" value={form.contact_person} onChange={set('contact_person')} />
              <Input label="Phone" value={form.phone} onChange={set('phone')} type="tel" />
              <Input label="Email" value={form.email} onChange={set('email')} type="email" />
            </div>
          </div>

          {/* Subcontractor-only extension */}
          {['Sub-contractor', 'Labour Contractor'].includes(form.vendor_type) && (
            <div>
              <SectionHeader icon={Briefcase} label="Subcontractor Details" color="orange" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select label="Trade Category" value={form.trade_category} onChange={set('trade_category')} options={TRADE_CATEGORIES} />
                <Select label="Status" value={form.subcontractor_status} onChange={set('subcontractor_status')}
                  options={['active', 'inactive', 'blacklisted']} />
                <Input label="Contract Start Date" value={form.contract_start_date} onChange={set('contract_start_date')} type="date" />
                <Input label="Contract End Date" value={form.contract_end_date} onChange={set('contract_end_date')} type="date" />
              </div>
            </div>
          )}

          {/* Address */}
          <div>
            <SectionHeader icon={MapPin} label="Address" color="amber" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Textarea label="Address" value={form.address} onChange={set('address')} />
              </div>
              <Input label="City" value={form.city} onChange={set('city')} />
              <Input label="State" value={form.state} onChange={set('state')} />
              <Input label="Pincode" value={form.pincode} onChange={set('pincode')} maxLength={6} />
            </div>
          </div>

          {/* Tax & Compliance */}
          <div>
            <SectionHeader icon={Briefcase} label="Tax & Compliance" color="violet" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="GSTIN" value={form.gstin} onChange={set('gstin')} upper maxLength={15} />
              <Input label="PAN" value={form.pan} onChange={set('pan')} upper maxLength={10} />
              <Input label="Trade License No." value={form.trade_license} onChange={set('trade_license')} />
              <Input label="MSME Registration No." value={form.msme_reg} onChange={set('msme_reg')} />
            </div>
          </div>

          {/* Bank */}
          <div>
            <SectionHeader icon={CreditCard} label="Bank Details" color="emerald" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Bank Name" value={form.bank_name} onChange={set('bank_name')} />
              <Input label="Account Number" value={form.bank_account} onChange={set('bank_account')} />
              <Input label="IFSC Code" value={form.bank_ifsc} onChange={set('bank_ifsc')} upper maxLength={11} />
              <Input label="Branch" value={form.bank_branch} onChange={set('bank_branch')} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Textarea label="Notes" value={form.notes} onChange={set('notes')} />
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700">Cancel</button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            {vendor ? 'Save Changes' : 'Add Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}

function VendorCard({ vendor, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const typeColors = {
    Contractor: 'bg-blue-50 text-blue-700',
    Supplier: 'bg-green-50 text-green-700',
    Consultant: 'bg-violet-50 text-violet-700',
    'Sub-contractor': 'bg-amber-50 text-amber-700',
    'Service Provider': 'bg-cyan-50 text-cyan-700',
    'Labour Contractor': 'bg-orange-50 text-orange-700',
    Other: 'bg-slate-100 text-slate-600',
  };
  const tc = typeColors[vendor.vendor_type] || 'bg-slate-100 text-slate-600';

  return (
    <div className="bg-white border border-slate-100 rounded-xl hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-slate-900 font-medium text-sm">{(vendor.name || '').toUpperCase()}</h3>
            {vendor.vendor_type && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tc}`}>{vendor.vendor_type}</span>
            )}
          </div>
          {vendor.trade_name && <p className="text-xs text-slate-900 font-medium mt-0.5">{vendor.trade_name}</p>}
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {vendor.contact_person && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Users className="w-3 h-3" />{vendor.contact_person}
              </span>
            )}
            {vendor.phone && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Phone className="w-3 h-3" />{vendor.phone}
              </span>
            )}
            {vendor.email && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Mail className="w-3 h-3" />{vendor.email}
              </span>
            )}
            {vendor.city && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="w-3 h-3" />{vendor.city}{vendor.state ? `, ${vendor.state}` : ''}
              </span>
            )}
          </div>
          {(vendor.gstin || vendor.pan) && (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {vendor.gstin && <span className="text-xs font-mono text-slate-900 bg-slate-50 px-2 py-0.5 rounded">GSTIN: {vendor.gstin}</span>}
              {vendor.pan && <span className="text-xs font-mono text-slate-900 bg-slate-50 px-2 py-0.5 rounded">PAN: {vendor.pan}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 ml-3 flex-shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            title="Details"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => onEdit(vendor)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-900 font-medium hover:text-blue-600" title="Edit">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(vendor)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-900 font-medium hover:text-red-500" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-50 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 rounded-b-xl">
          {vendor.address && (
            <div className="md:col-span-2">
              <p className="text-slate-900 font-medium mb-0.5">Address</p>
              <p className="text-slate-700">{vendor.address}{vendor.city ? `, ${vendor.city}` : ''}{vendor.state ? `, ${vendor.state}` : ''} {vendor.pincode}</p>
            </div>
          )}
          {vendor.bank_name && (
            <div>
              <p className="text-slate-900 font-medium mb-0.5">Bank</p>
              <p className="text-slate-700">{vendor.bank_name}</p>
              {vendor.bank_branch && <p className="text-slate-500">{vendor.bank_branch}</p>}
            </div>
          )}
          {vendor.bank_account && (
            <div>
              <p className="text-slate-900 font-medium mb-0.5">Account / IFSC</p>
              <p className="text-slate-900 font-mono">{vendor.bank_account}</p>
              {vendor.bank_ifsc && <p className="text-slate-900 font-medium font-mono">{vendor.bank_ifsc}</p>}
            </div>
          )}
          {vendor.trade_license && (
            <div>
              <p className="text-slate-900 font-medium mb-0.5">Trade License</p>
              <p className="text-slate-700">{vendor.trade_license}</p>
            </div>
          )}
          {vendor.msme_reg && (
            <div>
              <p className="text-slate-900 font-medium mb-0.5">MSME Reg.</p>
              <p className="text-slate-700">{vendor.msme_reg}</p>
            </div>
          )}
          {vendor.notes && (
            <div className="md:col-span-4">
              <p className="text-slate-900 font-medium mb-0.5">Notes</p>
              <p className="text-slate-700">{vendor.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TQSVendorsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | vendor-object

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['tqs-vendors'],
    queryFn: () => tqsVendorsAPI.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60000,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => modal && modal !== 'new'
      ? tqsVendorsAPI.update(modal.id, data)
      : tqsVendorsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tqs-vendors'] });
      setModal(null);
      toast.success(modal && modal !== 'new' ? 'Vendor updated' : 'Vendor added');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to save vendor'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => tqsVendorsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tqs-vendors'] });
      toast.success('Vendor deleted');
    },
    onError: () => toast.error('Failed to delete vendor'),
  });

  const handleDelete = (v) => {
    if (window.confirm(`Delete vendor "${v.name}"?`)) deleteMutation.mutate(v.id);
  };

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.name?.toLowerCase().includes(q) || v.contact_person?.toLowerCase().includes(q)
      || v.phone?.includes(q) || v.gstin?.toLowerCase().includes(q) || v.city?.toLowerCase().includes(q);
    const matchType = !typeFilter || v.vendor_type === typeFilter;
    return matchSearch && matchType;
  });

  const totalByType = VENDOR_TYPES.reduce((acc, t) => {
    acc[t] = vendors.filter(v => v.vendor_type === t).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-medium text-slate-800">Vendor Management</h1>
              <p className="text-xs text-slate-500">DQS vendors — suppliers, contractors &amp; consultants</p>
            </div>
          </div>
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Vendor
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-3 text-center">
            <p className="text-2xl font-medium text-blue-700">{vendors.length}</p>
            <p className="text-xs text-slate-900 font-medium mt-0.5">Total Vendors</p>
          </div>
          {['Contractor','Sub-contractor','Supplier','Labour Contractor'].map(t => (
            <div key={t} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
              <p className="text-2xl font-medium text-slate-700">{totalByType[t] || 0}</p>
              <p className="text-xs text-slate-900 font-medium mt-0.5">{t}s</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Zoho-style horizontal type tabs ───────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex items-center gap-0 overflow-x-auto no-scrollbar">
          {TYPE_TABS.map(tab => {
            const count = tab.key === '' ? vendors.length : (totalByType[tab.key] || 0);
            const active = typeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setTypeFilter(tab.key)}
                className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  active
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-900 font-medium border-transparent hover:text-slate-900 font-medium hover:border-slate-300'
                }`}
              >
                {tab.label}
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                  active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-6 py-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendor name, contact, GSTIN, city…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* ── Vendor table / list ───────────────────────────────────────────── */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">{vendors.length === 0 ? 'No vendors yet' : 'No vendors match your search'}</p>
            {vendors.length === 0 && (
              <button onClick={() => setModal('new')} className="mt-3 text-sm text-blue-600 hover:underline">Add your first vendor</button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <span className="text-xs text-slate-900 font-medium font-medium">{filtered.length} vendor{filtered.length !== 1 ? 's' : ''}{typeFilter ? ` · ${typeFilter}` : ''}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.map(v => (
                <VendorCard key={v.id} vendor={v} onEdit={setModal} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <VendorModal
          vendor={modal !== 'new' ? modal : null}
          onClose={() => setModal(null)}
          onSave={(data) => saveMutation.mutate(data)}
        />
      )}
    </div>
  );
}
