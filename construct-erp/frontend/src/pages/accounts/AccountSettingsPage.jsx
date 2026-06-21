// src/pages/accounts/AccountSettingsPage.jsx — Company Profile, FY, Currency, Payment Terms, Tax Rates
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Settings, Building2, CalendarRange, Plus, Trash2, Upload, ImageOff } from 'lucide-react';
import { companySettingsAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';

const F = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white';
const L = 'block text-xs font-medium text-slate-600 mb-1';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (₹)' },
  { code: 'USD', symbol: '$', label: 'US Dollar ($)' },
  { code: 'EUR', symbol: '€', label: 'Euro (€)' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham (د.إ)' },
];

const TABS = [
  { key: 'profile',  label: 'Company Profile', icon: Building2 },
  { key: 'fiscal',   label: 'FY & Currency', icon: CalendarRange },
  { key: 'terms',    label: 'Payment Terms & Tax Rates', icon: Settings },
];

export default function AccountSettingsPage() {
  const [tab, setTab] = useState('profile');
  const qc = useQueryClient();
  const accessToken = useAuthStore(s => s.accessToken);
  const fileInputRef = useRef(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => companySettingsAPI.get().then(r => r.data?.data),
  });

  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (data) {
      setProfile({
        name: data.name || '', gstin: data.gstin || '', pan: data.pan || '', cin: data.cin || '',
        address: data.address || '', city: data.city || '', state: data.state || '',
        pincode: data.pincode || '', phone: data.phone || '', email: data.email || '',
      });
      setSettings(data.settings || {});
    }
  }, [data]);

  // logo_url points at an authenticated static route (/uploads/...), so it can't be
  // used directly as an <img src> — fetch it with the auth header and render as a blob URL.
  useEffect(() => {
    let objectUrl = null;
    if (data?.logo_url && accessToken) {
      fetch(data.logo_url, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then(r => (r.ok ? r.blob() : Promise.reject()))
        .then(blob => { objectUrl = URL.createObjectURL(blob); setLogoPreviewUrl(objectUrl); })
        .catch(() => setLogoPreviewUrl(null));
    } else {
      setLogoPreviewUrl(null);
    }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [data?.logo_url, accessToken]);

  const profileMut = useMutation({
    mutationFn: () => companySettingsAPI.updateProfile(profile).then(r => r.data),
    onSuccess: () => { toast.success('Company profile updated'); qc.invalidateQueries({ queryKey: ['company-settings'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const logoMut = useMutation({
    mutationFn: (file) => companySettingsAPI.uploadLogo(file).then(r => r.data),
    onSuccess: () => { toast.success('Logo updated'); qc.invalidateQueries({ queryKey: ['company-settings'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  const handleLogoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return; }
    logoMut.mutate(file);
    e.target.value = '';
  };

  const settingsMut = useMutation({
    mutationFn: (payload) => companySettingsAPI.updateSettings(payload).then(r => r.data),
    onSuccess: (d) => { toast.success('Settings updated'); setSettings(d.data); qc.invalidateQueries({ queryKey: ['company-settings'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const setP = (k, v) => setProfile(f => ({ ...f, [k]: v }));
  const setS = (k, v) => setSettings(f => ({ ...f, [k]: v }));

  const addTaxRate = () => setS('tax_rates', [...(settings.tax_rates || []), { name: '', rate: 0 }]);
  const updateTaxRate = (i, k, v) => {
    const rates = [...(settings.tax_rates || [])];
    rates[i] = { ...rates[i], [k]: k === 'rate' ? Number(v) : v };
    setS('tax_rates', rates);
  };
  const removeTaxRate = (i) => setS('tax_rates', (settings.tax_rates || []).filter((_, idx) => idx !== i));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
            <Settings className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Accounts Settings</h1>
            <p className="text-xs text-slate-400">Company profile, fiscal year, currency, payment terms &amp; tax rates</p>
          </div>
        </div>
      </div>

      <div className="px-6 pt-4">
        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={clsx('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
                  tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-5 max-w-3xl">
        {isLoading || !profile || !settings ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'profile' ? (
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
              <div className="w-16 h-16 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoPreviewUrl ? (
                  <img src={logoPreviewUrl} alt="Company logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <ImageOff className="w-5 h-5 text-slate-300" />
                )}
              </div>
              <div>
                <label className={L}>Company Logo</label>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoPick} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={logoMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50">
                  <Upload className="w-3.5 h-3.5" /> {logoMut.isPending ? 'Uploading…' : 'Upload Logo'}
                </button>
                <p className="text-[11px] text-slate-400 mt-1">PNG, JPG, SVG or WebP — up to 2MB</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={L}>Company Name</label>
                <input className={F} value={profile.name} onChange={e => setP('name', e.target.value)} />
              </div>
              <div>
                <label className={L}>GSTIN</label>
                <input className={F} value={profile.gstin} onChange={e => setP('gstin', e.target.value)} />
              </div>
              <div>
                <label className={L}>PAN</label>
                <input className={F} value={profile.pan} onChange={e => setP('pan', e.target.value)} />
              </div>
              <div>
                <label className={L}>CIN</label>
                <input className={F} value={profile.cin} onChange={e => setP('cin', e.target.value)} />
              </div>
              <div>
                <label className={L}>Phone</label>
                <input className={F} value={profile.phone} onChange={e => setP('phone', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={L}>Email</label>
                <input className={F} value={profile.email} onChange={e => setP('email', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={L}>Address</label>
                <input className={F} value={profile.address} onChange={e => setP('address', e.target.value)} />
              </div>
              <div>
                <label className={L}>City</label>
                <input className={F} value={profile.city} onChange={e => setP('city', e.target.value)} />
              </div>
              <div>
                <label className={L}>State</label>
                <input className={F} value={profile.state} onChange={e => setP('state', e.target.value)} />
              </div>
              <div>
                <label className={L}>Pincode</label>
                <input className={F} value={profile.pincode} onChange={e => setP('pincode', e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => profileMut.mutate()} disabled={profileMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                {profileMut.isPending ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </div>
        ) : tab === 'fiscal' ? (
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={L}>Fiscal Year Start Month</label>
                <select className={F} value={settings.fy_start_month} onChange={e => setS('fy_start_month', Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={L}>Currency</label>
                <select className={F} value={settings.currency} onChange={e => {
                  const c = CURRENCIES.find(c => c.code === e.target.value);
                  setSettings(s => ({ ...s, currency: c.code, currency_symbol: c.symbol }));
                }}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => settingsMut.mutate({ fy_start_month: settings.fy_start_month, currency: settings.currency, currency_symbol: settings.currency_symbol })}
                disabled={settingsMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                {settingsMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-md p-5">
              <label className={L}>Default Payment Terms (days)</label>
              <input type="number" className={clsx(F, 'w-40')} value={settings.payment_terms_days}
                onChange={e => setS('payment_terms_days', Number(e.target.value))} />
              <div className="flex justify-end mt-3">
                <button onClick={() => settingsMut.mutate({ payment_terms_days: settings.payment_terms_days })}
                  disabled={settingsMut.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {settingsMut.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-800">Tax Rates</p>
                <button onClick={addTaxRate} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Add Rate
                </button>
              </div>
              <div className="space-y-2">
                {(settings.tax_rates || []).map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className={F} placeholder="Name (e.g. GST 18%)" value={r.name} onChange={e => updateTaxRate(i, 'name', e.target.value)} />
                    <input type="number" step="0.01" className={clsx(F, 'w-28')} placeholder="Rate %" value={r.rate} onChange={e => updateTaxRate(i, 'rate', e.target.value)} />
                    <button onClick={() => removeTaxRate(i)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                {(settings.tax_rates || []).length === 0 && <p className="text-sm text-slate-400">No tax rates configured</p>}
              </div>
              <div className="flex justify-end mt-3">
                <button onClick={() => settingsMut.mutate({ tax_rates: settings.tax_rates })}
                  disabled={settingsMut.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {settingsMut.isPending ? 'Saving…' : 'Save Tax Rates'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
