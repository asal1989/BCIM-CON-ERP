// src/pages/hr-admin/compliance/ComplianceStatusBadge.jsx
import React from 'react';
import { STATUS_STYLES, PRIORITY_STYLES } from './complianceData';

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES['Expired'];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const p = PRIORITY_STYLES[priority] || PRIORITY_STYLES['Medium'];
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
      style={{ background: p.bg, color: p.text }}>
      {priority}
    </span>
  );
}
