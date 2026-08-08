// src/pages/hr-admin/CostCenterPage.jsx
import React from 'react';
import { Landmark } from 'lucide-react';
import { hrMastersAPI } from '../../api/client';
import OrgMastersPage from './OrgMastersPage';

export default function CostCenterPage() {
  return (
    <OrgMastersPage config={{
      title: 'Cost Centers',
      subtitle: 'Budget & cost tracking units, linked to departments',
      icon: Landmark,
      listKey: 'hr-cost-centers',
      listFn: hrMastersAPI.listCostCenters,
      createFn: hrMastersAPI.createCostCenter,
      updateFn: hrMastersAPI.updateCostCenter,
      deleteFn: hrMastersAPI.deleteCostCenter,
      extraQueries: [{ key: 'hr-departments', fn: hrMastersAPI.listDepts }],
      fields: (extras) => [
        { key: 'name', label: 'Cost Center Name', placeholder: 'e.g. Site Overheads — WDIRY0151' },
        { key: 'code', label: 'Code', placeholder: 'e.g. CC-1001', optional: true },
        {
          key: 'department_id', label: 'Department', type: 'select', optional: true,
          options: (extras['hr-departments'] || []).map(d => ({ value: d.id, label: d.name })),
        },
        { key: 'budget_amount', label: 'Budget Amount (₹)', type: 'number', placeholder: 'e.g. 500000', optional: true },
      ],
      getSubtitle: (r) => r.department_name || r.code || null,
      getBadge: (r) => (r.budget_amount ? `₹${Number(r.budget_amount).toLocaleString('en-IN')}` : null),
    }} />
  );
}
