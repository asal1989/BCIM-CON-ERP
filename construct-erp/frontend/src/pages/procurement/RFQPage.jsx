import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, ClipboardList,
  Mail, Package, Search, Send, Settings, Users,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { mrsAPI, quotationAPI, vendorAPI } from '../../api/client';

const asArray = (payload) => payload?.data || payload?.vendors || payload || [];

export default function RFQPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [subject, setSubject] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [terms, setTerms] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mailSettings, setMailSettings] = useState(null);
  const [emailDrafts, setEmailDrafts] = useState({});

  const { data: indent, isLoading: loadingMRS } = useQuery({
    queryKey: ['mrs-detail', id],
    queryFn: () => mrsAPI.get(id).then(r => r.data?.data),
    enabled: !!id,
  });

  const { data: vendors = [], isLoading: loadingVendors } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () => vendorAPI.list({ limit: 500 }).then(r => asArray(r.data)),
  });

  const { data: rfq } = useQuery({
    queryKey: ['rfq-detail', id],
    queryFn: () => quotationAPI.getRFQ(id).then(r => r.data?.data),
    enabled: !!id,
  });

  const { data: rfqSettings } = useQuery({
    queryKey: ['rfq-settings'],
    queryFn: () => quotationAPI.getRFQSettings().then(r => r.data?.data),
  });

  useEffect(() => {
    if (!indent) return;
    setSubject(prev => prev || `RFQ for ${indent.serial_no_formatted || indent.mrs_number || 'Material Requisition'}`);
  }, [indent]);

  useEffect(() => {
    if (!rfqSettings) return;
    setMailSettings(rfqSettings);
    setTerms(prev => prev || rfqSettings.default_terms || '');
  }, [rfqSettings]);

  useEffect(() => {
    if (!rfq) return;
    setSubject(rfq.subject || '');
    setDueDate(rfq.due_date ? dayjs(rfq.due_date).format('YYYY-MM-DD') : '');
    setRemarks(rfq.remarks || '');
    setDeliveryLocation(rfq.delivery_location || '');
    setTerms(rfq.terms || rfqSettings?.default_terms || '');
    setSelected(new Set((rfq.vendors || []).map(v => v.vendor_id).filter(Boolean)));
  }, [rfq, rfqSettings?.default_terms]);

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(v =>
      v.name?.toLowerCase().includes(q) ||
      v.contact_person?.toLowerCase().includes(q) ||
      v.phone?.toLowerCase().includes(q) ||
      v.email?.toLowerCase().includes(q)
    );
  }, [search, vendors]);

  const selectedVendors = useMemo(
    () => vendors.filter(v => selected.has(v.id)),
    [vendors, selected]
  );
  const selectedWithoutEmail = selectedVendors.filter(v => !String(v.email || '').trim());

  const issueMutation = useMutation({
    mutationFn: () => quotationAPI.issueRFQ({
      mrs_id: id,
      vendor_ids: Array.from(selected),
      subject,
      due_date: dueDate || null,
      remarks,
      delivery_location: deliveryLocation,
      terms,
      send_email: true,
    }),
    onSuccess: () => {
      toast.success('RFQ issued and mail request processed');
      qc.invalidateQueries({ queryKey: ['mrs-for-cs'] });
      qc.invalidateQueries({ queryKey: ['rfq-detail', id] });
      qc.invalidateQueries({ queryKey: ['rfq-list'] });
      navigate('/procurement/quotations');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to issue RFQ'),
  });

  const settingsMutation = useMutation({
    mutationFn: (data) => quotationAPI.updateRFQSettings(data),
    onSuccess: (res) => {
      toast.success('RFQ mail settings saved');
      setMailSettings(res.data?.data);
      qc.invalidateQueries({ queryKey: ['rfq-settings'] });
      setSettingsOpen(false);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to save RFQ settings'),
  });

  const vendorEmailMutation = useMutation({
    mutationFn: ({ vendor, email }) => vendorAPI.update(vendor.id, { email }),
    onSuccess: (_res, vars) => {
      toast.success(`Email saved for ${vars.vendor.name}`);
      setEmailDrafts(prev => {
        const next = { ...prev };
        delete next[vars.vendor.id];
        return next;
      });
      qc.invalidateQueries({ queryKey: ['vendors-list'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to save vendor email'),
  });

  const toggleVendor = (vendorId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });
  };

  const submitRFQ = () => {
    if (!selected.size) return toast.error('Select at least one vendor');
    if (selectedWithoutEmail.length) return toast.error(`Email missing for: ${selectedWithoutEmail.map(v => v.name).join(', ')}`);
    issueMutation.mutate();
  };

  const saveVendorEmail = (vendor) => {
    const email = String(emailDrafts[vendor.id] || '').trim().toLowerCase();
    if (!email) return toast.error('Enter vendor email first');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error('Enter a valid email address');
    vendorEmailMutation.mutate({ vendor, email });
  };

  if (loadingMRS) {
    return (
      <div className="p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
        <div className="h-10 w-72 bg-slate-200 rounded-xl animate-pulse mb-5" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="h-96 bg-white rounded-xl border border-slate-100 animate-pulse" />
          <div className="lg:col-span-2 h-96 bg-white rounded-xl border border-slate-100 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!indent) {
    return (
      <div className="p-8 min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <div className="bg-white border border-red-100 rounded-xl p-8 text-center">
          <p className="text-sm font-medium text-slate-800">MRS not found</p>
          <button onClick={() => navigate('/procurement/rfqs')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
            Back to RFQ List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/procurement/rfqs')}
            className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-900 font-medium hover:text-indigo-600 hover:border-indigo-300 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-900 font-medium mb-0.5">
              <span>Procurement</span>
              <ChevronRight className="w-3 h-3" />
              <span>RFQ</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-slate-900 font-medium">{indent.serial_no_formatted || indent.mrs_number}</span>
            </div>
            <h1 className="text-xl font-medium text-slate-900">Issue RFQ to Vendors</h1>
            <p className="text-sm text-slate-900 font-medium mt-0.5">Select purchase vendors for this MRS before quotation entry.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:border-indigo-300"
          >
            <Settings className="w-4 h-4" />
            Mail Settings
          </button>
          <button
            onClick={submitRFQ}
            disabled={issueMutation.isPending}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {issueMutation.isPending ? 'Sending...' : rfq ? 'Update & Send RFQ' : 'Send RFQ Mail'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Info label="MRS No." value={indent.serial_no_formatted || indent.mrs_number || '-'} />
          <Info label="Project" value={indent.project_name || '-'} />
          <Info label="Required By" value={indent.required_by ? dayjs(indent.required_by).format('DD-MM-YYYY') : '-'} />
          <Info label="Items" value={`${(indent.items || []).filter(it => it.effective_included !== false && it.md_included !== false).length} materials`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-5">
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
              <ClipboardList className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-medium text-slate-800">RFQ Details</h2>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Subject</span>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-900 font-medium flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Quote Due Date
                </span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Remarks / Scope Notes</span>
                <textarea
                  rows={4}
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
                  placeholder="Delivery location, technical notes, attachments reference..."
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Delivery Location</span>
                <input
                  value={deliveryLocation}
                  onChange={e => setDeliveryLocation(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                  placeholder="Project/site delivery address"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">RFQ Terms</span>
                <textarea
                  rows={5}
                  value={terms}
                  onChange={e => setTerms(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
                  placeholder="GST, delivery, payment, validity, warranty..."
                />
              </label>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
              <Package className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-medium text-slate-800">MRS Materials</h2>
            </div>
            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {(indent.items || [])
                .filter(item => item.effective_included !== false && item.md_included !== false)
                .map((item, index) => (
                  <div key={item.id || index} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-medium flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{item.material_name}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.effective_qty ?? item.md_approved_qty ?? item.quantity} {item.unit}
                        {(item.md_approved_qty && item.md_approved_qty !== item.quantity) && (
                          <span className="ml-1 text-amber-600 font-medium">(MD: {item.md_approved_qty})</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>

        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-medium text-slate-800">Select Vendors</h2>
              </div>
              <p className="text-xs text-slate-900 font-medium mt-1">{selected.size} selected for RFQ</p>
              {selectedWithoutEmail.length > 0 && (
                <p className="text-xs text-red-600 font-medium mt-1">
                  Email missing: {selectedWithoutEmail.map(v => v.name).join(', ')}
                </p>
              )}
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search vendors..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-medium text-slate-900 font-medium uppercase tracking-wide">
            <div className="col-span-4">Vendor</div>
            <div className="col-span-4">Contact / Email</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Pick</div>
          </div>

          <div className="divide-y divide-slate-50 max-h-[560px] overflow-auto">
            {loadingVendors ? (
              <div className="p-8 text-sm text-slate-400">Loading vendors...</div>
            ) : filteredVendors.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">No vendors found</div>
            ) : filteredVendors.map(vendor => {
              const checked = selected.has(vendor.id);
              return (
                <div
                  key={vendor.id}
                  onClick={() => toggleVendor(vendor.id)}
                  className={clsx(
                    'w-full grid grid-cols-12 gap-3 px-5 py-4 items-center text-left transition-colors cursor-pointer',
                    checked ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                  )}
                >
                  <div className="col-span-4 min-w-0">
                    <p className="text-sm font-medium text-slate-900 font-medium truncate">{vendor.name}</p>
                    <p className="text-[11px] text-slate-900 font-medium truncate">{vendor.category || vendor.type || 'Purchase vendor'}</p>
                  </div>
                  <div className="col-span-4 min-w-0" onClick={e => e.stopPropagation()}>
                    <p className="text-xs text-slate-900 truncate">
                      {vendor.contact_person || '-'}{vendor.phone ? ` · ${vendor.phone}` : ''}
                    </p>
                    {String(vendor.email || '').trim() ? (
                      <p className="text-[11px] text-emerald-700 font-medium truncate flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {vendor.email}
                      </p>
                    ) : (
                      <div className="mt-1 flex items-center gap-1.5">
                        <input
                          type="email"
                          value={emailDrafts[vendor.id] || ''}
                          onChange={e => setEmailDrafts(prev => ({ ...prev, [vendor.id]: e.target.value }))}
                          placeholder="Add vendor email"
                          className="w-full min-w-0 h-8 bg-white border border-red-200 rounded-md px-2 text-xs outline-none focus:border-indigo-400"
                        />
                        <button
                          type="button"
                          onClick={() => saveVendorEmail(vendor)}
                          disabled={vendorEmailMutation.isPending}
                          className="h-8 px-2.5 rounded-md bg-indigo-600 text-white text-[11px] font-medium disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    {checked ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Selected
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Available</span>
                    )}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <span className={clsx(
                      'w-5 h-5 rounded-md border flex items-center justify-center',
                      checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'
                    )}>
                      {checked && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedVendors.length > 0 && (
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
              RFQ will be sent to: <span className="font-medium text-slate-700">{selectedVendors.map(v => v.name).join(', ')}</span>
            </div>
          )}

          {rfq?.mail_logs?.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-medium text-slate-900 uppercase tracking-wider">Mail Log</span>
              </div>
              <div className="space-y-1">
                {rfq.mail_logs.slice(0, 8).map(log => (
                  <div key={log.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-900 font-medium truncate">{log.vendor_name || log.email}</span>
                    <span className={clsx('px-2 py-0.5 rounded-full border',
                      log.status === 'sent'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : 'bg-red-50 text-red-700 border-red-100'
                    )}>
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {settingsOpen && mailSettings && (
        <RFQSettingsModal
          settings={mailSettings}
          onChange={setMailSettings}
          onClose={() => setSettingsOpen(false)}
          onSave={() => settingsMutation.mutate(mailSettings)}
          isSaving={settingsMutation.isPending}
        />
      )}
    </div>
  );
}

function RFQSettingsModal({ settings, onChange, onClose, onSave, isSaving }) {
  const set = (key, value) => onChange({ ...settings, [key]: value });
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">RFQ Mail Settings</h3>
            <p className="text-xs text-slate-500 mt-0.5">Configure default mail templates used when sending vendor RFQs.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900">×</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Reply-to Email</span>
              <input value={settings.reply_to_email || ''} onChange={e => set('reply_to_email', e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">CC Emails</span>
              <input value={settings.cc_emails || ''} onChange={e => set('cc_emails', e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="email1@bcim.in; email2@bcim.in" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Subject Template</span>
            <input value={settings.subject_template || ''} onChange={e => set('subject_template', e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Body Template</span>
            <textarea rows={9} value={settings.body_template || ''} onChange={e => set('body_template', e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono resize-y" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Default Terms</span>
            <textarea rows={5} value={settings.default_terms || ''} onChange={e => set('default_terms', e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm resize-y" />
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800">
            <input type="checkbox" checked={Boolean(settings.attach_item_table)} onChange={e => set('attach_item_table', e.target.checked)} />
            Include MR item table in RFQ email
          </label>
          <p className="text-[11px] text-slate-500">
            Template variables: {'{rfq_no}'}, {'{mrs_no}'}, {'{project_name}'}, {'{due_date}'}, {'{vendor_name}'}, {'{delivery_location}'}, {'{terms}'}.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-900 bg-white">Cancel</button>
          <button onClick={onSave} disabled={isSaving} className="px-5 h-9 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-slate-900 font-medium uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-900 font-medium truncate">{value}</p>
    </div>
  );
}
