// src/pages/hr-admin/LocationsPage.jsx
// Locations master — employee_profiles.work_location was free text with no
// managed list (flagged in the module audit). This gives HR a real,
// structured list of sites/offices to reference and report against.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Pencil, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrMastersAPI } from '../../api/client';
import { B, fade } from '../../components/hr/DashboardKit';

const inp = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all";
const label = "text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5";

function LocationModal({ location, onClose, onSaved }) {
  const isEdit = !!location;
  const [form, setForm] = useState({ name: location?.name || '', address: location?.address || '', city: location?.city || '', state: location?.state || '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: (d) => isEdit ? hrMastersAPI.updateLocation(location.id, d) : hrMastersAPI.createLocation(d),
    onSuccess: () => { toast.success(isEdit ? 'Updated' : 'Location added'); onSaved(); onClose(); },
    onError: e => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-gray-900">{isEdit ? 'Edit Location' : 'New Location'}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={label}>Name *</label>
            <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Head Office, Site — LH10" />
          </div>
          <div>
            <label className={label}>Address</label>
            <input className={inp} value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>City</label>
              <input className={inp} value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div>
              <label className={label}>State</label>
              <input className={inp} value={form.state} onChange={e => set('state', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100">Cancel</button>
          <button disabled={!form.name || mut.isPending} onClick={() => mut.mutate(form)}
            className="px-5 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: B.blue }}>
            {mut.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add Location'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function LocationsPage() {
  const qc = useQueryClient();
  const [modalTarget, setModalTarget] = useState(undefined); // undefined=closed, null=new, obj=edit

  const { data, isLoading } = useQuery({ queryKey: ['hr-locations'], queryFn: () => hrMastersAPI.listLocations().then(r => r.data) });
  const rows = data?.data || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr-locations'] });

  const delMut = useMutation({
    mutationFn: (id) => hrMastersAPI.deleteLocation(id),
    onSuccess: () => { toast.success('Removed'); refresh(); },
    onError: e => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg,#0A1F5C,#1e3a8a)`, boxShadow: '0 8px 32px rgba(10,31,92,0.2)' }}>
        <div className="relative z-10 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Locations</h1>
              <p className="text-white/55 text-sm mt-0.5">Sites &amp; offices master list</p>
            </div>
          </div>
          <button onClick={() => setModalTarget(null)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black bg-white text-blue-700">
            <Plus className="w-4 h-4" /> New Location
          </button>
        </div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Name', 'Address', 'City', 'State', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-gray-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">No locations yet</td></tr>
            ) : rows.map(loc => (
              <tr key={loc.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-800">{loc.name}</td>
                <td className="px-4 py-3 text-gray-600">{loc.address || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{loc.city || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{loc.state || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setModalTarget(loc)} className="p-2 rounded-lg hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-gray-500" /></button>
                    <button onClick={() => window.confirm(`Remove "${loc.name}"?`) && delMut.mutate(loc.id)} className="p-2 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      {modalTarget !== undefined && <LocationModal location={modalTarget} onClose={() => setModalTarget(undefined)} onSaved={refresh} />}
    </div>
  );
}
