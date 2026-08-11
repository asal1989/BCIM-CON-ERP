// src/pages/admin/UserModuleAccessPage.jsx — Administration: User Module Access
// Read-only report: which modules each user can currently see, derived from
// their role + accessible_modules — mirrors the exact bypass/fallback logic
// Layout.jsx uses to build the sidebar, so this reflects real access, not a
// separate permission system. This app does not track read-only vs
// read-write per module/user; write permissions are enforced per-screen by
// scattered backend role checks (e.g. BUDGET_WRITERS on BOQ budget routes),
// not by a single central table, so that distinction isn't shown here.
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { rolePermissionsAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import { Check, Search, ShieldCheck, Info } from 'lucide-react';
import { clsx } from 'clsx';

// Same bypass roles as filteredGroups() in Layout.jsx — these see every
// module regardless of what's stored in accessible_modules.
const FULL_ACCESS_ROLES = new Set(['admin', 'super_admin', 'managing_director', 'director', 'ceo', 'cfo', 'md']);

function hasModule(user, mod) {
  if (FULL_ACCESS_ROLES.has(String(user.role || '').toLowerCase())) return true;
  const mods = user.accessible_modules;
  if (!mods || !mods.length) return true; // unconfigured account -> Layout.jsx falls back to showing everything
  return mods.includes(mod);
}

export default function UserModuleAccessPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['user-module-access-users'],
    queryFn: () => api.get('/users').then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });
  const { data: modules = [] } = useQuery({
    queryKey: ['user-module-access-modules'],
    queryFn: () => rolePermissionsAPI.modules().then(r => r.data?.data || []),
  });

  const roles = useMemo(() => [...new Set(users.map(u => u.role).filter(Boolean))].sort(), [users]);

  const filtered = useMemo(() => users.filter(u => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${u.name} ${u.email}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [users, search, roleFilter]);

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="User Module Access"
        subtitle="Which modules each user can currently see, derived from their role and per-user overrides"
        breadcrumbs={[{ label: 'Administration' }, { label: 'User Module Access' }]}
      />

      <div className="p-5 md:p-6 max-w-[1600px] mx-auto space-y-5">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-indigo-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Module-level visibility only.</span> A checkmark means this user's sidebar shows that
            module — it does not distinguish read-only from read-write. Write access on individual screens (e.g. editing a
            budget, approving a bill) is enforced separately by role checks on the backend, not tracked in one central place.
            To change what a user or role can <em>see</em>, use <strong>Team Members</strong> (per-user) or{' '}
            <strong>Roles &amp; Module Access</strong> (per-role default).
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…"
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none">
            <option value="">All Roles</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} of {users.length} users</span>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map(n => <div key={n} className="h-12 bg-white border border-slate-200 rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl py-16 text-center text-sm text-slate-400">No users match.</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-slate-50 z-10 px-3 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider border-b border-r border-slate-200 min-w-[220px]">User</th>
                  {modules.map(m => (
                    <th key={m} className="px-2 py-2.5 text-center font-semibold text-slate-500 border-b border-slate-100 whitespace-nowrap" style={{ writingMode: 'vertical-rl', height: '110px' }}>
                      <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}>{m}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const fullAccess = FULL_ACCESS_ROLES.has(String(u.role || '').toLowerCase());
                  return (
                    <tr key={u.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                      <td className="sticky left-0 bg-white px-3 py-2 border-r border-slate-100">
                        <p className="font-semibold text-black">{u.name}</p>
                        <p className="text-[10px] text-slate-400">{u.email}</p>
                        <p className={clsx('text-[10px] font-bold mt-0.5 flex items-center gap-1', fullAccess ? 'text-indigo-600' : 'text-slate-400')}>
                          {fullAccess && <ShieldCheck className="w-3 h-3" />} {u.role}{fullAccess ? ' — full access' : ''}
                        </p>
                      </td>
                      {modules.map(m => (
                        <td key={m} className="px-2 py-2 text-center">
                          {hasModule(u, m) ? (
                            <div className="w-5 h-5 rounded bg-emerald-500 text-white flex items-center justify-center mx-auto">
                              <Check className="w-3 h-3" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded border border-slate-200 mx-auto" />
                          )}
                        </td>
                      ))}
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
