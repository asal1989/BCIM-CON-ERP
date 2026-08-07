// src/pages/hr-admin/onboarding/document-verification/DashboardPage.jsx
// Document Verification — command center. Every figure comes from a real
// query over employee_documents / employee_timeline (see
// hr-document-verification.routes.js GET /summary), no fabricated numbers.
import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  FileCheck2, Clock, CheckCircle2, XCircle, Users, TrendingUp,
  Upload, ShieldCheck, ArrowRight, Activity,
} from 'lucide-react';
import { hrDocVerificationAPI } from '../../../../api/client';
import { B, fade, KpiCard, SectionHeader } from '../../../../components/hr/DashboardKit';

const LINKS = [
  { label: 'Pending Verification', to: '/hr-admin/onboarding/document-verification/pending', icon: Clock },
  { label: 'Employee Documents', to: '/hr-admin/onboarding/document-verification/employees', icon: Users },
  { label: 'Upload Documents', to: '/hr-admin/onboarding/document-verification/upload', icon: Upload },
  { label: 'Verify Documents', to: '/hr-admin/onboarding/document-verification/verify', icon: ShieldCheck },
  { label: 'Rejected Documents', to: '/hr-admin/onboarding/document-verification/rejected', icon: XCircle },
  { label: 'Missing Documents', to: '/hr-admin/onboarding/document-verification/missing', icon: FileCheck2 },
];

function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function DocVerificationDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['doc-verification-summary'],
    queryFn: () => hrDocVerificationAPI.summary().then(r => r.data.data),
  });

  const s = data || {};

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
          <FileCheck2 className="w-5 h-5" style={{ color: B.blue }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Document Verification</h1>
          <p className="text-xs text-gray-400">Dashboard — verification KPIs and recent activity</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Total Documents" value={isLoading ? undefined : s.total_documents} icon={FileCheck2} color={B.blue} bg={`${B.blue}18`} delay={0.02} />
        <KpiCard label="Pending" value={isLoading ? undefined : s.pending} icon={Clock} color={B.warning} bg="#F59E0B18" delay={0.04}
          onClick={() => navigate('/hr-admin/onboarding/document-verification/pending')} />
        <KpiCard label="Verified" value={isLoading ? undefined : s.verified} icon={CheckCircle2} color={B.success} bg="#10B98118" delay={0.06} />
        <KpiCard label="Rejected" value={isLoading ? undefined : s.rejected} icon={XCircle} color={B.danger} bg="#EF444418" delay={0.08}
          onClick={() => navigate('/hr-admin/onboarding/document-verification/rejected')} />
        <KpiCard label="Missing Documents" value={isLoading ? undefined : s.missing_employees} sub="employees" icon={Users} color="#94A3B8" bg="#94A3B818" delay={0.1}
          onClick={() => navigate('/hr-admin/onboarding/document-verification/missing')} />
        <KpiCard label="Verification Progress" value={isLoading ? undefined : `${s.verification_progress_pct}%`} icon={TrendingUp} color={B.navy} bg={`${B.navy}18`} delay={0.12} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div {...fade(0.14)} className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Recent Activity" sub="Latest uploads, verifications and rejections" icon={Activity} iconColor={B.blue} />
          <div className="space-y-3 max-h-[420px] overflow-y-auto">
            {!isLoading && (s.recent_activity || []).length === 0 && <p className="text-xs text-gray-400">No document activity yet.</p>}
            {(s.recent_activity || []).map(a => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                <Clock className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-800">{a.title}</p>
                  <p className="text-xs text-gray-500 truncate">{a.description} — {a.employee_name} ({a.employee_code})</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(a.created_at)}{a.actor_name ? ` · by ${a.actor_name}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div {...fade(0.16)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Quick Links" icon={ArrowRight} iconColor={B.blue} />
          <div className="space-y-2">
            {LINKS.map(l => (
              <button key={l.to} onClick={() => navigate(l.to)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left transition-colors">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${B.blue}18` }}>
                  <l.icon className="w-4 h-4" style={{ color: B.blue }} />
                </div>
                <span className="text-sm font-bold text-gray-700 flex-1">{l.label}</span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
