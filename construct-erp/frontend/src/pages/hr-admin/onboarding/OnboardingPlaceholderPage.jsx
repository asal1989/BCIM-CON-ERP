// src/pages/hr-admin/onboarding/OnboardingPlaceholderPage.jsx
// Shared placeholder for Onboarding menu items that don't have a built-out
// screen yet. Navigation/routing exists for the full 17-item menu structure
// now; each of these gets replaced with a real page one at a time.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';

const B = { navy: '#0A1F5C', blue: '#2563EB' };

export default function OnboardingPlaceholderPage({ title, description }) {
  const navigate = useNavigate();
  return (
    <div className="p-6 min-h-screen flex items-center justify-center" style={{ background: '#F8FAFC' }}>
      <div className="max-w-md w-full text-center bg-white rounded-2xl border border-gray-100 p-10" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <Construction className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-lg font-black text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-2">{description || 'This screen is being built. Check back soon.'}</p>
        <button onClick={() => navigate('/hr-admin')}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <ArrowLeft className="w-4 h-4" /> Back to HR Admin
        </button>
      </div>
    </div>
  );
}
