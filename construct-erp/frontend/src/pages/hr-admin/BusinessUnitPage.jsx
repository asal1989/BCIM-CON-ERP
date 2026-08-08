// src/pages/hr-admin/BusinessUnitPage.jsx
import React from 'react';
import { Building } from 'lucide-react';
import { hrMastersAPI } from '../../api/client';
import OrgMastersPage from './OrgMastersPage';

export default function BusinessUnitPage() {
  return (
    <OrgMastersPage config={{
      title: 'Business Units',
      subtitle: 'Top-level operating units of the organisation',
      icon: Building,
      listKey: 'hr-business-units',
      listFn: hrMastersAPI.listBUs,
      createFn: hrMastersAPI.createBU,
      updateFn: hrMastersAPI.updateBU,
      deleteFn: hrMastersAPI.deleteBU,
      fields: [
        { key: 'name', label: 'Business Unit Name', placeholder: 'e.g. Construction Division' },
        { key: 'code', label: 'Code', placeholder: 'e.g. BU-CON', optional: true },
      ],
      getSubtitle: (r) => r.code || null,
    }} />
  );
}
