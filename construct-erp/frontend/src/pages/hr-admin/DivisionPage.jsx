// src/pages/hr-admin/DivisionPage.jsx
import React from 'react';
import { GitBranch } from 'lucide-react';
import { hrMastersAPI } from '../../api/client';
import OrgMastersPage from './OrgMastersPage';

export default function DivisionPage() {
  return (
    <OrgMastersPage config={{
      title: 'Divisions',
      subtitle: 'Divisions within each business unit',
      icon: GitBranch,
      listKey: 'hr-divisions',
      listFn: hrMastersAPI.listDivisions,
      createFn: hrMastersAPI.createDivision,
      updateFn: hrMastersAPI.updateDivision,
      deleteFn: hrMastersAPI.deleteDivision,
      extraQueries: [{ key: 'hr-business-units', fn: hrMastersAPI.listBUs }],
      fields: (extras) => [
        { key: 'name', label: 'Division Name', placeholder: 'e.g. Residential Projects' },
        { key: 'code', label: 'Code', placeholder: 'e.g. DIV-RES', optional: true },
        {
          key: 'business_unit_id', label: 'Business Unit', type: 'select', optional: true,
          options: (extras['hr-business-units'] || []).map(bu => ({ value: bu.id, label: bu.name })),
        },
      ],
      getSubtitle: (r) => r.business_unit_name || r.code || null,
    }} />
  );
}
