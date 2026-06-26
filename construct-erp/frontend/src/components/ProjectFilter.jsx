// src/components/ProjectFilter.jsx
// Reusable project-scope dropdown for the Accounts module.
// Drives the GLOBAL selected project (authStore + sessionStorage) so it stays
// in sync with the top-bar project chip and the axios interceptor that
// auto-injects project_id into every API call. On change it invalidates the
// react-query cache so pages that rely on the interceptor (rather than reading
// selectedProjectId directly) also refetch with the new scope.
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { projectAPI } from '../api/client';
import useAuthStore from '../store/authStore';

export default function ProjectFilter({
  className = '',
  allLabel = 'All Projects (company-wide)',
  showIcon = true,
}) {
  const qc = useQueryClient();
  const { selectedProjectId, setSelectedProject, clearSelectedProject } = useAuthStore();

  const { data: projects = [] } = useQuery({
    queryKey: ['project-filter-list'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const handleChange = (e) => {
    const id = e.target.value;
    if (!id) {
      clearSelectedProject();
    } else {
      const p = projects.find(pr => String(pr.id) === String(id));
      setSelectedProject(p || { id });
    }
    // Refetch everything so pages whose query keys don't include the project id
    // (they rely on the interceptor's auto-injected project_id) pick up the
    // new scope immediately.
    qc.invalidateQueries();
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {showIcon && <Building2 className="w-4 h-4 text-slate-400 shrink-0" />}
      <select
        className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200 max-w-[220px]"
        value={selectedProjectId || ''}
        onChange={handleChange}
        title="Filter by project"
      >
        <option value="">{allLabel}</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>
            {p.project_code ? `${p.project_code} — ` : ''}{p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
