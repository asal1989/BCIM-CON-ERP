import { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, RefreshCw, ExternalLink,
  CheckCircle2, AlertTriangle, Info, LogIn, LogOut, KeyRound,
} from 'lucide-react';
import api from '../../api/client';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const SEV_ORDER = ['critical', 'high', 'moderate', 'medium', 'low'];
const SEV_STYLE = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  moderate: 'bg-amber-100 text-amber-700 border-amber-200',
  medium:   'bg-amber-100 text-amber-700 border-amber-200',
  low:      'bg-gray-100 text-gray-600 border-gray-200',
};

function SeverityRow({ counts }) {
  const present = SEV_ORDER.filter(s => counts?.[s] > 0);
  if (!present.length) {
    return <span className="text-sm text-green-600 inline-flex items-center gap-1"><CheckCircle2 size={14} /> None open</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map(s => (
        <span key={s} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SEV_STYLE[s]}`}>
          {counts[s]} {s}
        </span>
      ))}
    </div>
  );
}

function GitHubAlertCard({ title, result, repo }) {
  const configured = result && result.error !== 'not_configured';
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{title}</h3>
      {!result ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : result.error === 'not_configured' ? (
        <p className="text-xs text-amber-600 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> GITHUB_PAT not configured
        </p>
      ) : result.error ? (
        <p className="text-xs text-gray-400 flex items-start gap-1.5">
          <Info size={13} className="mt-0.5 shrink-0" /> Unavailable ({result.error === 'no_access' ? 'token lacks permission' : result.error})
        </p>
      ) : (
        <>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{result.total}</div>
          <SeverityRow counts={result.bySeverity} />
        </>
      )}
      {configured && (
        <a
          href={`https://github.com/${repo}/security`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline mt-3"
        >
          View on GitHub <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}

const ACTIVITY_META = {
  login_failed:     { Icon: LogIn,     cls: 'text-red-600 bg-red-50',    label: 'Failed login' },
  login_throttled:  { Icon: ShieldAlert, cls: 'text-orange-600 bg-orange-50', label: 'Login throttled' },
  create:           { Icon: CheckCircle2, cls: 'text-green-600 bg-green-50', label: 'Created' },
  update:           { Icon: KeyRound,  cls: 'text-blue-600 bg-blue-50',   label: 'Updated' },
  delete:           { Icon: LogOut,    cls: 'text-red-600 bg-red-50',     label: 'Deleted' },
};

export default function SecurityDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await api.get('/security/overview');
      setData(res.data);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to load security overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const okCount  = data?.checklist?.filter(c => c.status === 'ok').length || 0;
  const gapCount = data?.checklist?.filter(c => c.status === 'gap').length || 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Security Dashboard</h1>
            <p className="text-sm text-gray-500">Dependency alerts, protections shipped, and recent security activity</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-6">
          <AlertTriangle size={15} /> {err}
        </div>
      )}

      {/* Posture summary */}
      {data && (
        <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-100 rounded-lg mb-6 text-sm text-purple-800">
          <ShieldCheck size={18} className="shrink-0" />
          <span><strong>{okCount}</strong> protections in place, <strong>{gapCount}</strong> known gaps still open. Live vulnerability counts and full alert history: {' '}
            <a href={`https://github.com/${data.github.repo}/security`} target="_blank" rel="noopener noreferrer" className="underline font-medium">
              github.com/{data.github.repo}/security
            </a>
          </span>
        </div>
      )}

      {/* GitHub alert cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <GitHubAlertCard title="Dependabot (dependency vulns)" result={data?.github?.dependabot} repo={data?.github?.repo} />
        <GitHubAlertCard title="CodeQL (code scanning)" result={data?.github?.codeScanning} repo={data?.github?.repo} />
        <GitHubAlertCard title="Secret scanning" result={data?.github?.secretScanning} repo={data?.github?.repo} />
      </div>

      {/* Login activity, last 7 days */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{data?.login7d?.login_success ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-1">Successful logins (7d)</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{data?.login7d?.login_failed ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-1">Failed logins (7d)</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">{data?.login7d?.login_throttled ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-1">Accounts throttled (7d)</div>
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">Protection Checklist</h2>
        <div className="space-y-2.5">
          {data?.checklist?.map((c) => (
            <div key={c.item} className="flex items-start gap-3">
              {c.status === 'ok' ? (
                <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              )}
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{c.item}</span>
                <p className="text-xs text-gray-500">{c.note}</p>
              </div>
            </div>
          ))}
          {!data && loading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
        </div>
      </div>

      {/* Recent security-relevant activity */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">Recent Activity</h2>
        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : !data?.recentActivity?.length ? (
          <p className="text-sm text-gray-400 py-4 text-center">No recent activity.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">Event</th>
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">User</th>
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">Table</th>
                  <th className="text-left pb-2 font-medium text-gray-500 pr-4">IP</th>
                  <th className="text-left pb-2 font-medium text-gray-500">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map(row => {
                  const meta = ACTIVITY_META[row.action] || { Icon: Info, cls: 'text-gray-500 bg-gray-50', label: row.action };
                  const { Icon } = meta;
                  return (
                    <tr key={row.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
                          <Icon size={11} /> {meta.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300">
                        {row.user_name || row.new_values?.email || '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">{row.table_name || '—'}</td>
                      <td className="py-2.5 pr-4 text-gray-400 font-mono text-xs">{row.ip_address || '—'}</td>
                      <td className="py-2.5 text-gray-500 font-variant-numeric tabular-nums">{fmtDate(row.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
