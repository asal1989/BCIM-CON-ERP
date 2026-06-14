// src/pages/accounts/CustomersPage.jsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Building2 } from 'lucide-react';
import { projectAPI } from '../../api/client';

export default function CustomersPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['accounts-customers'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []),
  });
  const rows = (data ?? []).filter(p => p.client_name);

  const filtered = rows.filter(p =>
    !search ||
    p.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.client_gstin?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Customers</h1>
            <p className="text-xs text-slate-400">Clients derived from project billing details</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Search customer / project / GSTIN…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="px-6 pb-10">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <Building2 className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No customers found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Customer / Client', 'Project', 'GSTIN', 'PAN'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{p.client_name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.name}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{p.client_gstin || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{p.client_pan || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
