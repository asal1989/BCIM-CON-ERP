import React, { useState } from 'react';
import { Fingerprint, RefreshCw, Upload, Monitor, History, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrEsslAPI } from '../../../api/client';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'sync',      label: 'Device Sync',        icon: RefreshCw    },
  { key: 'import',    label: 'Import Logs',         icon: Upload       },
  { key: 'status',    label: 'Device Status',       icon: Monitor      },
  { key: 'history',   label: 'Sync History',        icon: History      },
  { key: 'unmatched', label: 'Unmatched Logs',      icon: AlertCircle  },
];

function DeviceSyncTab() {
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: () => hrEsslAPI.triggerSync().then(r => r.data),
    onSuccess: () => { toast.success('Sync triggered'); qc.invalidateQueries(['essl-history']); },
    onError: e => toast.error(e.response?.data?.error || 'Sync failed'),
  });
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex items-start gap-4">
        <Fingerprint size={28} className="text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-blue-800">Biometric Device Sync</p>
          <p className="text-sm text-blue-600 mt-1">Pull latest punch data from all connected ESSL/ZKTeco devices and map to employee records.</p>
        </div>
      </div>
      <button
        onClick={() => sync.mutate()}
        disabled={sync.isPending}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        <RefreshCw size={14} className={sync.isPending ? 'animate-spin' : ''} />
        {sync.isPending ? 'Syncing…' : 'Sync Now'}
      </button>
    </div>
  );
}

function ImportLogsTab() {
  const [file, setFile] = useState(null);
  const qc = useQueryClient();
  const imp = useMutation({
    mutationFn: (f) => {
      const fd = new FormData(); fd.append('file', f);
      return hrEsslAPI.importLogs?.(fd).then(r => r.data);
    },
    onSuccess: (d) => { toast.success(`Imported ${d?.imported ?? ''} records`); setFile(null); qc.invalidateQueries(['essl-history']); },
    onError: e => toast.error(e.response?.data?.error || 'Import failed'),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Upload a CSV / XLS export from your biometric device software to import attendance logs.</p>
      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-10 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
        <Upload size={24} className="text-slate-400" />
        <span className="text-sm text-slate-500">{file ? file.name : 'Click or drag file here'}</span>
        <input type="file" accept=".csv,.xls,.xlsx,.txt,.dat" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
      </label>
      {file && (
        <button
          onClick={() => imp.mutate(file)}
          disabled={imp.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
        >
          <Upload size={13} /> {imp.isPending ? 'Importing…' : 'Import'}
        </button>
      )}
    </div>
  );
}

function DeviceStatusTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['essl-devices'],
    queryFn: () => hrEsslAPI.getDevices?.().then(r => r.data).catch(() => []),
    enabled: !!hrEsslAPI.getDevices,
  });
  const devices = Array.isArray(data) ? data : [];
  if (isLoading) return <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>;
  if (!devices.length) return (
    <div className="py-10 text-center text-slate-300 text-sm border-2 border-dashed border-slate-100 rounded-xl">
      No devices configured — add devices in ESSL settings
    </div>
  );
  return (
    <div className="space-y-3">
      {devices.map(d => (
        <div key={d.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center gap-3">
            <Monitor size={16} className="text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-slate-800">{d.name}</p>
              <p className="text-xs text-slate-400">{d.ip}</p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${d.online ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
            {d.online ? <CheckCircle size={11} /> : <XCircle size={11} />}
            {d.online ? 'Online' : 'Offline'}
          </span>
        </div>
      ))}
    </div>
  );
}

function SyncHistoryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['essl-history'],
    queryFn: () => hrEsslAPI.getSyncHistory?.().then(r => r.data).catch(() => []),
    enabled: !!hrEsslAPI.getSyncHistory,
  });
  const rows = Array.isArray(data) ? data : [];
  if (isLoading) return <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>;
  if (!rows.length) return (
    <div className="py-10 text-center text-slate-300 text-sm border-2 border-dashed border-slate-100 rounded-xl">
      No sync history yet
    </div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
            <th className="text-left py-2 px-3">Date / Time</th>
            <th className="text-left py-2 px-3">Device</th>
            <th className="text-right py-2 px-3">Records</th>
            <th className="text-left py-2 px-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="py-2 px-3 text-slate-600">{r.synced_at || r.created_at}</td>
              <td className="py-2 px-3 text-slate-700">{r.device_name || r.device}</td>
              <td className="py-2 px-3 text-right text-slate-700">{r.records_count ?? r.count}</td>
              <td className="py-2 px-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnmatchedLogsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['essl-unmatched'],
    queryFn: () => hrEsslAPI.getUnmatched?.().then(r => r.data).catch(() => []),
    enabled: !!hrEsslAPI.getUnmatched,
  });
  const rows = Array.isArray(data) ? data : [];
  if (isLoading) return <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>;
  if (!rows.length) return (
    <div className="py-10 text-center text-emerald-300 text-sm border-2 border-dashed border-emerald-100 rounded-xl">
      No unmatched logs — all punch records are mapped
    </div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
            <th className="text-left py-2 px-3">Device ID</th>
            <th className="text-left py-2 px-3">Punch Time</th>
            <th className="text-left py-2 px-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="py-2 px-3 font-mono text-slate-700">{r.device_user_id}</td>
              <td className="py-2 px-3 text-slate-600">{r.punch_time}</td>
              <td className="py-2 px-3 text-amber-600 text-xs">{r.reason || 'No matching employee'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TAB_COMPONENTS = {
  sync:      DeviceSyncTab,
  import:    ImportLogsTab,
  status:    DeviceStatusTab,
  history:   SyncHistoryTab,
  unmatched: UnmatchedLogsTab,
};

export default function BiometricAttendancePage() {
  const [tab, setTab] = useState('sync');
  const TabComponent = TAB_COMPONENTS[tab];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Fingerprint size={20} className="text-blue-500" /> Biometric Attendance
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage device sync, log import, and unmatched punch records</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <TabComponent />
      </div>
    </div>
  );
}
