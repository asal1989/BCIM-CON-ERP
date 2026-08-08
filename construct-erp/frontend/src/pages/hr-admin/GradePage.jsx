// src/pages/hr-admin/GradePage.jsx
import React from 'react';
import { Award } from 'lucide-react';
import { hrMastersAPI } from '../../api/client';
import OrgMastersPage from './OrgMastersPage';

export default function GradePage() {
  return (
    <OrgMastersPage config={{
      title: 'Grades',
      subtitle: 'Salary / seniority grade levels',
      icon: Award,
      listKey: 'hr-grades',
      listFn: hrMastersAPI.listGrades,
      createFn: hrMastersAPI.createGrade,
      updateFn: hrMastersAPI.updateGrade,
      deleteFn: hrMastersAPI.deleteGrade,
      fields: [
        { key: 'name', label: 'Grade Name', placeholder: 'e.g. Senior Manager' },
        { key: 'code', label: 'Code', placeholder: 'e.g. M2', optional: true },
        { key: 'level', label: 'Level (rank order)', type: 'number', placeholder: 'e.g. 5', optional: true },
      ],
      getSubtitle: (r) => r.code || null,
      getBadge: (r) => (r.level != null ? `L${r.level}` : null),
    }} />
  );
}
