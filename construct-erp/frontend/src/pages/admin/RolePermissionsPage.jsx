// src/pages/admin/RolePermissionsPage.jsx — Administration: Roles & Module Access
// Additive manager for each role's default accessible_modules — does not
// replace backend authorize() role checks, just gives a real screen to
// manage what RequireModule gates on, instead of editing it ad hoc per user.
import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolePermissionsAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import { Check, Save, Send, ShieldCheck, Users } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

export default function RolePermissionsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState({}); // role -> Set(modules), only for dirty rows

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => rolePermissionsAPI.list().then(r => r.data?.data || []),
  });
  const { data: modules = [] } = useQuery({
    queryKey: ['role-permissions-modules'],
    queryFn: () => rolePermissionsAPI.modules().then(r => r.data?.data || []),
  });

  const saveMut = useMutation({
    mutationFn: ({ role, mods }) => rolePermissionsAPI.save(role, mods),
    onSuccess: (_, { role }) => {
      toast.success(`Saved defaults for ${role}`);
      setDraft(d => { const n = { ...d }; delete n[role]; return n; });
      qc.invalidateQueries({ queryKey: ['role-permissions'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const applyMut = useMutation({
    mutationFn: (role) => rolePermissionsAPI.apply(role),
    onSuccess: (res) => toast.success(res.data?.message || 'Applied'),
    onError: e => toast.error(e?.response?.data?.error || 'Apply failed'),
  });

  const getModsForRole = (roleRow) => draft[roleRow.role] ? [...draft[roleRow.role]] : roleRow.modules;
  const isDirty = (role) => draft[role] !== undefined;

  const toggle = (roleRow, mod) => {
    setDraft(d => {
      const current = new Set(d[roleRow.role] || roleRow.modules);
      if (current.has(mod)) current.delete(mod); else current.add(mod);
      return { ...d, [roleRow.role]: current };
    });
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Roles & Module Access"
        subtitle="Manage which modules each role sees by default — doesn't change backend permission checks"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Roles & Module Access' }]}
      />

      <div className="p-5 md:p-6 max-w-[1500px] mx-auto space-y-5">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-indigo-800">
          <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">How this works:</span> toggling a module here only changes the <em>default</em> module
            list for that role. Click <strong>Save</strong> to store the default, then <strong>Apply</strong> to push it onto every
            user currently holding that role. Existing per-user overrides (set individually in Team Members) aren't touched until you click Apply.
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map(n => <div key={n} className="h-12 bg-white border border-slate-200 rounded-xl animate-pulse" />)}</div>
        ) : roles.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl py-16 text-center text-sm text-slate-400">No roles found.</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-slate-50 px-3 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider border-b border-r border-slate-200 min-w-[160px]">Role</th>
                  {modules.map(m => (
                    <th key={m} className="px-2 py-2.5 text-center font-semibold text-slate-500 border-b border-slate-100 whitespace-nowrap" style={{ writingMode: 'vertical-rl', height: '90px' }}>
                      <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}>{m}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 min-w-[180px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(roleRow => {
                  const mods = getModsForRole(roleRow);
                  const dirty = isDirty(roleRow.role);
                  return (
                    <tr key={roleRow.role} className={clsx('border-t border-slate-50', dirty && 'bg-amber-50/40')}>
                      <td className="sticky left-0 bg-white px-3 py-2 border-r border-slate-100">
                        <p className="font-semibold text-slate-800">{roleRow.role}</p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" /> {roleRow.user_count} user{roleRow.user_count !== 1 ? 's' : ''}</p>
                      </td>
                      {modules.map(m => {
                        const checked = mods.includes(m);
                        return (
                          <td key={m} className="px-2 py-2 text-center">
                            <button onClick={() => toggle(roleRow, m)}
                              className={clsx('w-5 h-5 rounded border flex items-center justify-center mx-auto transition-colors',
                                checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 hover:border-indigo-400')}>
                              {checked && <Check className="w-3 h-3" />}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => saveMut.mutate({ role: roleRow.role, mods })}
                            disabled={!dirty || saveMut.isPending}
                            className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border',
                              dirty ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-400')}>
                            <Save className="w-3 h-3" /> Save
                          </button>
                          <button onClick={() => { if (window.confirm(`Apply ${roleRow.role}'s saved modules to all ${roleRow.user_count} user(s) with this role?`)) applyMut.mutate(roleRow.role); }}
                            disabled={applyMut.isPending}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50">
                            <Send className="w-3 h-3" /> Apply
                          </button>
                        </div>
                      </td>
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
