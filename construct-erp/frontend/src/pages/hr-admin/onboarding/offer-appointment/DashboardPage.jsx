// src/pages/hr-admin/onboarding/offer-appointment/DashboardPage.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Cell } from 'recharts';
import {
  FileSignature, Clock, Send, CheckCircle2, XCircle, FileCheck2, CalendarCheck,
  CalendarDays, ArrowRight, ClipboardList, ShieldCheck, PenTool, Mail, History, FileBarChart, Settings,
} from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade, KpiCard, SectionHeader, ChartTip, DEPT_COLORS } from '../../../../components/hr/DashboardKit';

const LINKS = [
  { label: 'Offer Requests', to: '/hr-admin/onboarding/offer-appointment/requests', icon: ClipboardList },
  { label: 'Offer Approval', to: '/hr-admin/onboarding/offer-appointment/approval', icon: ShieldCheck },
  { label: 'Candidate Acceptance', to: '/hr-admin/onboarding/offer-appointment/acceptance', icon: CheckCircle2 },
  { label: 'Appointment Letters', to: '/hr-admin/onboarding/offer-appointment/appointments', icon: FileCheck2 },
  { label: 'Appointment Approval', to: '/hr-admin/onboarding/offer-appointment/appointment-approval', icon: ShieldCheck },
  { label: 'Document Templates', to: '/hr-admin/onboarding/offer-appointment/templates', icon: FileSignature },
  { label: 'Digital Signatures', to: '/hr-admin/onboarding/offer-appointment/signatures', icon: PenTool },
  { label: 'Email & Delivery', to: '/hr-admin/onboarding/offer-appointment/email', icon: Mail },
  { label: 'Letter History', to: '/hr-admin/onboarding/offer-appointment/history', icon: History },
  { label: 'Reports', to: '/hr-admin/onboarding/offer-appointment/reports', icon: FileBarChart },
  { label: 'Settings', to: '/hr-admin/onboarding/offer-appointment/settings', icon: Settings },
];

export default function OfferDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['offers-summary'], queryFn: () => hrOffersAPI.summary().then(r => r.data.data) });
  const k = data?.kpis || {};

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><FileSignature className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Offer &amp; Appointment</h1>
          <p className="text-xs text-gray-400">Candidate approved &rarr; Offer &rarr; Approval &rarr; Acceptance &rarr; Appointment &rarr; Onboarding</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Offers Pending" value={isLoading ? undefined : k.offers_pending} icon={Clock} color={B.warning} bg="#F59E0B18" delay={0.02}
          onClick={() => navigate('/hr-admin/onboarding/offer-appointment/approval')} />
        <KpiCard label="Offers Sent" value={isLoading ? undefined : k.offers_sent} icon={Send} color={B.blue} bg={`${B.blue}18`} delay={0.04} />
        <KpiCard label="Offers Accepted" value={isLoading ? undefined : k.offers_accepted} icon={CheckCircle2} color={B.success} bg="#10B98118" delay={0.06} />
        <KpiCard label="Offers Rejected" value={isLoading ? undefined : k.offers_rejected} icon={XCircle} color={B.danger} bg="#EF444418" delay={0.08} />
        <KpiCard label="Appointment Letters Generated" value={isLoading ? undefined : k.appointment_letters_generated} icon={FileCheck2} color={B.navy} bg={`${B.navy}18`} delay={0.1} />
        <KpiCard label="Appointment Letters Pending" value={isLoading ? undefined : k.appointment_letters_pending} icon={Clock} color={B.warning} bg="#F59E0B18" delay={0.12} />
        <KpiCard label="Joining Today" value={isLoading ? undefined : k.joining_today} icon={CalendarCheck} color={B.success} bg="#10B98118" delay={0.14} />
        <KpiCard label="Joining This Week" value={isLoading ? undefined : k.joining_this_week} icon={CalendarDays} color={B.blue} bg={`${B.blue}18`} delay={0.16} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div {...fade(0.18)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Monthly Offers" icon={FileSignature} iconColor={B.blue} />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.monthly_offers || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} fill={B.blue} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div {...fade(0.2)} className="bg-white rounded-2xl p-5 border border-gray-100 flex flex-col items-center justify-center" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Offer Acceptance Rate" icon={CheckCircle2} iconColor={B.success} />
          <div className="relative w-36 h-36">
            <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#F1F5F9" strokeWidth="10" />
              <circle cx="50" cy="50" r="42" fill="none" stroke={B.success} strokeWidth="10"
                strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - (data?.acceptance_rate_pct || 0) / 100)} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-gray-800">{data?.acceptance_rate_pct ?? 0}%</div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Avg. time to join: {data?.avg_time_to_join_days ?? '—'} days</p>
        </motion.div>

        <motion.div {...fade(0.22)} className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Department-wise Hiring" icon={ClipboardList} iconColor={B.blue} />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.by_department || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="cnt" radius={[0, 8, 8, 0]}>
                {(data?.by_department || []).map((d, i) => <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      <motion.div {...fade(0.24)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <SectionHeader title="Quick Links" icon={ArrowRight} iconColor={B.blue} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {LINKS.map(l => (
            <button key={l.to} onClick={() => navigate(l.to)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left transition-colors">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${B.blue}18` }}><l.icon className="w-4 h-4" style={{ color: B.blue }} /></div>
              <span className="text-sm font-bold text-gray-700 flex-1">{l.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
