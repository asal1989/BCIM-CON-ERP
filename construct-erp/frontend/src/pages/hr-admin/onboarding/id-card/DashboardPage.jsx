// src/pages/hr-admin/onboarding/id-card/DashboardPage.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Contact, Users, CheckCircle2, Clock, Printer, AlertTriangle, RotateCcw, CalendarX,
  UserPlus, LayoutTemplate, PackagePlus, Layers3, ListChecks, FileWarning, QrCode, History, FileBarChart, Settings, ArrowRight,
} from 'lucide-react';
import { hrIdCardAPI } from '../../../../api/client';
import { B, fade, KpiCard, SectionHeader, ChartTip, DEPT_COLORS } from '../../../../components/hr/DashboardKit';

const LINKS = [
  { label: 'Generate ID Card', to: '/hr-admin/onboarding/id-card/generate', icon: UserPlus },
  { label: 'Employee Selection', to: '/hr-admin/onboarding/id-card/employees', icon: Users },
  { label: 'Card Templates', to: '/hr-admin/onboarding/id-card/templates', icon: LayoutTemplate },
  { label: 'Bulk Generation', to: '/hr-admin/onboarding/id-card/bulk', icon: Layers3 },
  { label: 'Print Queue', to: '/hr-admin/onboarding/id-card/print-queue', icon: ListChecks },
  { label: 'Reprint ID Card', to: '/hr-admin/onboarding/id-card/reprint', icon: RotateCcw },
  { label: 'Lost / Damaged Card', to: '/hr-admin/onboarding/id-card/lost-damaged', icon: FileWarning },
  { label: 'QR Code Management', to: '/hr-admin/onboarding/id-card/qr-codes', icon: QrCode },
  { label: 'Card History', to: '/hr-admin/onboarding/id-card/history', icon: History },
  { label: 'Reports', to: '/hr-admin/onboarding/id-card/reports', icon: FileBarChart },
  { label: 'Settings', to: '/hr-admin/onboarding/id-card/settings', icon: Settings },
];

export default function IdCardDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['idcard-summary'],
    queryFn: () => hrIdCardAPI.summary().then(r => r.data.data),
  });
  const k = data?.kpis || {};
  const activeInactive = data?.active_vs_inactive || { active: 0, inactive: 0 };

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
          <Contact className="w-5 h-5" style={{ color: B.blue }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">ID Card Generation</h1>
          <p className="text-xs text-gray-400">Dashboard — issuance, printing and reissue overview</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Employees" value={isLoading ? undefined : k.total_employees} icon={Users} color={B.blue} bg={`${B.blue}18`} delay={0.02} />
        <KpiCard label="Cards Generated" value={isLoading ? undefined : k.cards_generated} icon={CheckCircle2} color={B.success} bg="#10B98118" delay={0.04} />
        <KpiCard label="Pending Generation" value={isLoading ? undefined : k.pending_generation} icon={Clock} color={B.warning} bg="#F59E0B18" delay={0.06}
          onClick={() => navigate('/hr-admin/onboarding/id-card/employees')} />
        <KpiCard label="Printed Today" value={isLoading ? undefined : k.printed_today} icon={Printer} color={B.navy} bg={`${B.navy}18`} delay={0.08} />
        <KpiCard label="Pending Print" value={isLoading ? undefined : k.pending_print} icon={ListChecks} color={B.warning} bg="#F59E0B18" delay={0.1}
          onClick={() => navigate('/hr-admin/onboarding/id-card/print-queue')} />
        <KpiCard label="Lost Cards" value={isLoading ? undefined : k.lost_cards} icon={AlertTriangle} color={B.danger} bg="#EF444418" delay={0.12} />
        <KpiCard label="Reissued Cards" value={isLoading ? undefined : k.reissued_cards} icon={RotateCcw} color={B.blue} bg={`${B.blue}18`} delay={0.14} />
        <KpiCard label="Expired Cards" value={isLoading ? undefined : k.expired_cards} icon={CalendarX} color="#94A3B8" bg="#94A3B818" delay={0.16} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div {...fade(0.18)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Monthly ID Card Generation" icon={Contact} iconColor={B.blue} />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.monthly_generation || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} fill={B.blue} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div {...fade(0.2)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Active vs Inactive Cards" icon={CheckCircle2} iconColor={B.success} />
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[{ name: 'Active', value: activeInactive.active, color: B.success }, { name: 'Inactive', value: activeInactive.inactive, color: '#94A3B8' }]}
                dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                <Cell fill={B.success} /><Cell fill="#94A3B8" />
              </Pie>
              <Tooltip content={<ChartTip />} />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div {...fade(0.22)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Department-wise Cards" icon={Users} iconColor={B.blue} />
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

        <motion.div {...fade(0.24)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Site-wise Cards" icon={Contact} iconColor={B.blue} />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.by_site || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="cnt" radius={[0, 8, 8, 0]}>
                {(data?.by_site || []).map((d, i) => <Cell key={i} fill={DEPT_COLORS[(i + 3) % DEPT_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      <motion.div {...fade(0.26)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <SectionHeader title="Quick Links" icon={ArrowRight} iconColor={B.blue} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {LINKS.map(l => (
            <button key={l.to} onClick={() => navigate(l.to)}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left transition-colors">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${B.blue}18` }}>
                <l.icon className="w-4 h-4" style={{ color: B.blue }} />
              </div>
              <span className="text-sm font-bold text-gray-700 flex-1">{l.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
