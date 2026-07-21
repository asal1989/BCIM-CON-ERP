import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, Check, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import api from '../../api/client';

const SCOPES_LABEL = { 'careers:read': 'Careers – read jobs & accept applications' };

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ApiKeysPage() {
  const [keys, setKeys]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState('');
  const [revealed, setRevealed] = useState(null); // { id, raw_key }
  const [copied, setCopied]     = useState(false);
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/settings/api-keys');
      setKeys(res.data.data || []);
    } catch {
      setErr('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    if (!newName.trim()) return;
    setCreating(true);
    setErr('');
    try {
      const res = await api.post('/settings/api-keys', { name: newName.trim() });
      const created = res.data.data;
      setKeys(prev => [{ ...created, revoked_at: null }, ...prev]);
      setRevealed({ id: created.id, raw_key: created.raw_key });
      setNewName('');
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to generate key');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id) {
    if (!window.confirm('Revoke this key? Any app using it will stop working immediately.')) return;
    try {
      await api.delete(`/settings/api-keys/${id}`);
      setKeys(prev => prev.map(k => k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k));
      if (revealed?.id === id) setRevealed(null);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to revoke key');
    }
  }

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Key size={22} className="text-purple-500" />
        <div>
          <h1 className="text-xl font-semibold">API Keys</h1>
          <p className="text-sm text-gray-500">Permanent tokens for external integrations (e.g. website careers page)</p>
        </div>
      </div>

      {/* Generate new key */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <p className="text-sm font-medium mb-3">Generate New Key</p>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Label, e.g. Website Careers Page"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generate()}
          />
          <button
            onClick={generate}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Generate
          </button>
        </div>
      </div>

      {/* Revealed key banner */}
      {revealed && (
        <div className="mb-6 p-4 rounded-xl border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-yellow-600" />
            <span className="font-medium text-yellow-700 dark:text-yellow-400 text-sm">
              Copy this key now — it won't be shown again
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 bg-white dark:bg-gray-900 border border-yellow-300 rounded-lg px-3 py-2 text-xs font-mono break-all">
              {revealed.raw_key}
            </code>
            <button
              onClick={() => copy(revealed.raw_key)}
              className="flex items-center gap-1 px-3 py-2 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600 whitespace-nowrap"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-3 text-xs text-yellow-600 dark:text-yellow-400">
            Set <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">ERP_API_TOKEN</code> in your website's <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">.env.local</code> to this value.
            <br />
            Your website should pass it as the <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">X-Api-Key</code> header when calling
            <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded ml-1">{window.location.origin.replace(':3000','')}/api/public/careers/jobs</code>
          </p>
        </div>
      )}

      {err && <p className="text-red-500 text-sm mb-4">{err}</p>}

      {/* Key list */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-gray-400">No API keys yet. Generate one above.</p>
      ) : (
        <div className="space-y-3">
          {keys.map(k => (
            <div
              key={k.id}
              className={`bg-white dark:bg-gray-800 rounded-xl border p-4 flex items-start justify-between gap-4
                ${k.revoked_at ? 'opacity-50 border-gray-200 dark:border-gray-700' : 'border-gray-200 dark:border-gray-700'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{k.name}</span>
                  {k.revoked_at && (
                    <span className="text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">Revoked</span>
                  )}
                </div>
                <code className="text-xs text-gray-400 font-mono">{k.key_prefix}</code>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-400">
                  <span>Created {fmtDate(k.created_at)}</span>
                  {k.last_used_at && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> Last used {fmtDate(k.last_used_at)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(k.scopes || []).map(s => (
                    <span key={s} className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full">
                      {SCOPES_LABEL[s] || s}
                    </span>
                  ))}
                </div>
              </div>
              {!k.revoked_at && (
                <button
                  onClick={() => revoke(k.id)}
                  title="Revoke key"
                  className="text-gray-400 hover:text-red-500 shrink-0 mt-1"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
