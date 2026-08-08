// src/components/hr/id-card/IdCardFace.jsx
// Shared front/back card visual — standard CR80 (85.6mm x 54mm) proportions
// rendered at screen scale (px, ~3.78x mm). Used by Preview, Bulk
// Generation, Print Queue and Reprint pages so the card layout stays
// consistent everywhere it's shown.
import React from 'react';
import { B, avatarGrad, initials } from '../DashboardKit';

const THEME_BG = {
  blue: `linear-gradient(135deg,${B.navy},${B.blue})`,
  dark: 'linear-gradient(135deg,#0F172A,#1E293B)',
  white: '#FFFFFF',
};
const THEME_TEXT = { blue: '#fff', dark: '#fff', white: '#0F172A' };

export default function IdCardFace({ side = 'front', employee = {}, company = {}, qrDataUri, theme = 'blue' }) {
  const [c1, c2] = avatarGrad(employee.name || 'Employee');
  const headerBg = THEME_BG[theme] || THEME_BG.blue;
  const headerText = THEME_TEXT[theme] || '#fff';

  if (side === 'back') {
    return (
      <div style={{ width: 324, height: 204, borderRadius: 12, overflow: 'hidden', background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: 16, fontFamily: 'Arial,sans-serif' }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Emergency Contact</p>
        <p style={{ fontSize: 9, color: '#64748B', marginBottom: 10 }}>{employee.emergency_contact_name || '—'} · {employee.emergency_contact_phone || '—'}</p>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Company Contact</p>
        <p style={{ fontSize: 9, color: '#64748B', marginBottom: 10 }}>{company.phone || '—'} · {company.email || '—'}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#94A3B8', marginTop: 10 }}>
          <span>Issued: {employee.issue_date ? new Date(employee.issue_date).toLocaleDateString('en-IN') : '—'}</span>
          <span>Expiry: {employee.expiry_date ? new Date(employee.expiry_date).toLocaleDateString('en-IN') : 'N/A'}</span>
        </div>
        <p style={{ fontSize: 7, color: '#CBD5E1', marginTop: 12, lineHeight: 1.4 }}>
          This card is property of {company.name || 'the company'}. If found, please return to HR. Unauthorized use is prohibited.
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: 324, height: 204, borderRadius: 12, overflow: 'hidden', background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontFamily: 'Arial,sans-serif', position: 'relative' }}>
      <div style={{ background: headerBg, height: 58, display: 'flex', alignItems: 'center', padding: '0 16px', color: headerText }}>
        {company.logo_url && <img src={company.logo_url} alt="" style={{ height: 32, marginRight: 8 }} />}
        <span style={{ fontSize: 12, fontWeight: 800 }}>{company.name || 'Company'}</span>
      </div>
      <div style={{ display: 'flex', padding: '12px 16px', gap: 12 }}>
        <div style={{ width: 68, height: 76, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: `linear-gradient(135deg,${c1},${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 22 }}>
          {employee.profile_photo_url ? <img src={employee.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(employee.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>{employee.name}</p>
          <p style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{employee.designation_name || employee.designation || ''}</p>
          <p style={{ fontSize: 10, color: '#64748B' }}>{employee.department_name || ''}</p>
          <p style={{ fontSize: 11, fontWeight: 700, color: B.blue, marginTop: 6 }}>ID: {employee.employee_code}</p>
          {employee.blood_group && <p style={{ fontSize: 9, color: '#94A3B8', marginTop: 2 }}>Blood Group: {employee.blood_group}</p>}
        </div>
        {qrDataUri && <img src={qrDataUri} alt="QR" style={{ width: 52, height: 52, flexShrink: 0 }} />}
      </div>
    </div>
  );
}
