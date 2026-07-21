import { useState, useEffect, useCallback } from 'react';
import {
  Database, Play, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, XCircle, ExternalLink, HardDrive, Info
} from 'lucide-react';
import api from '../../api/client';

function fmtBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function duration(start, end) {
  if (!start || !end) return '—';
  const secs = Math.round((new Date(end) - new Date(start)) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const STATUS_CHIP = {
  completed: { cls: 'bg-green-100 text-green-700', Icon: CheckCircle2, label: 'Success' },
  failure:   { cls: 'bg-red-100 text-red-700',     Icon: XCircle,      label: 'Failed'  },
  in_progress: { cls: 'bg-blue-100 text-blue-700', Icon: RefreshCw,    label: 'Running' },
  queued:    { cls: 'bg-yellow-100 text-yellow-700', Icon: Clock,       label: 'Queued'  },
};

function RunChip({ run }) {
  const conclusion = run.conclusion ?? run.status;
  const { cls, Icon, label } = STATUS_CHIP[conclusion] || STATUS_CHIP.queued;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <Icon size={11} />
      {label}
    </span>
  );
}

export default function DatabaseBackupPage() {
  const [configured, setConfigured] = useState(null);
  const [runs, setRuns]             = useState([]);
  const [files, setFiles]           = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState('');
  const [err, setErr]               = useState('');

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const res = await api.get('/db-backup/runs');
      setRuns(res.data);
    } catch {
      // silently ignore — status banner will show config issue
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await api.get('/db-backup/files');
      setFiles(res.data);
    } catch {
      // ignore
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    api.get('/db-backup/status').then(r => setConfigured(r.data.configured)).catch(() => setConfigured(false));
    loadRuns();
    loadFiles();
  }, [loadRuns, loadFiles]);

  async function trigger() {
    setTriggering(true);
    setTriggerMsg('');
    setErr('');
    try {
      const res = await api.post('/db-backup/trigger');
      setTriggerMsg(res.data.message);
      // Refresh runs after 3s to pick up the new queued run
      setTimeout(() => { loadRuns(); }, 3000);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to trigger backup.');
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
          <Database size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Database Backup</h1>
          <p className="text-sm text-gray-500">Railway PostgreSQL → GitHub backups/ + SharePoint</p>
        </div>
      </div>

      {/* Config warning */}
      {configured === false && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <strong>GITHUB_PAT not configured.</strong> Add a GitHub Personal Access Token with <code>repo</code> scope as the <code>GITHUB_PAT</code> environment variable in Railway, then redeploy. The workflow also needs the same token added as a GitHub Actions secret named <code>GITHUB_PAT</code> if you want to trigger it via this page.
          </div>
        </div>
      )}

      {/* Schedule info */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg mb-6 text-sm text-blue-700">
        <Info size={16} className="mt-0.5 shrink-0" />
        <span>
          Backups run <strong>automatically every day at 1:00 AM UTC</strong> via GitHub Actions.
          They are stored in the <code>backups/</code> folder in this repository and also uploaded to SharePoint.
          Backups older than 30 days are pruned automatically.
        </span>
      </div>

      {/* Trigger */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Manual Backup</h2>
        <p className="text-sm text-gray-500 mb-4">Trigger an immediate backup outside the daily schedule.</p>

        {triggerMsg && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 mb-3">
            <CheckCircle2 size={15} /> {triggerMsg}
          </div>
        )}
        {err && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3">
            <XCircle size={15} /> {err}
          </div>
        )}

        <button
          onClick={trigger}
          disabled={triggering || configured === false}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {triggering ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
          {triggering ? 'Triggering…' : 'Backup Now'}
        </button>
      </div>

      {/* Recent runs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Recent Runs</h2>
          <button
            onClick={loadRuns}
            disabled={loadingRuns}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={loadingRuns ? 'animate-spin' : ''} />
          </button>
        </div>

        {loadingRuns ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No runs found. The workflow may not have run yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">Status</th>
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">Trigger</th>
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">Started</th>
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">Duration</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => (
                  <tr key={run.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <td className="py-2.5 pr-4"><RunChip run={run} /></td>
                    <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300 capitalize">{run.event === 'schedule' ? 'Scheduled' : 'Manual'}</td>
                    <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300 font-variant-numeric tabular-nums">{fmtDate(run.created_at)}</td>
                    <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300">{duration(run.created_at, run.updated_at)}</td>
                    <td className="py-2.5 text-right">
                      <a
                        href={run.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-purple-600 hover:underline text-xs"
                      >
                        View <ExternalLink size={11} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stored backups */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Stored Backups</h2>
            <span className="text-xs text-gray-400">backups/ folder in repository</span>
          </div>
          <button
            onClick={loadFiles}
            disabled={loadingFiles}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={loadingFiles ? 'animate-spin' : ''} />
          </button>
        </div>

        {loadingFiles ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
            <HardDrive size={28} className="text-gray-300" />
            <p className="text-sm">No backup files found. Run a backup first.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">File</th>
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">Size</th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file.sha} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-700 dark:text-gray-300">{file.name}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{fmtBytes(file.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
