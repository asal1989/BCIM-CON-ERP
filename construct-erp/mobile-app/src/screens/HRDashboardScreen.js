import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { hrDashAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import { theme } from '../theme';
import { useNavigation } from '@react-navigation/native';

function KpiCard({ icon, label, value, color }) {
  const bg = `${color}22`;
  return (
    <Card style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value ?? '—'}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </Card>
  );
}

const PRIORITY_STYLE = {
  urgent: { bg: '#fee2e2', text: '#991b1b' },
  high:   { bg: '#ffedd5', text: '#9a3412' },
  normal: { bg: '#dbeafe', text: '#1e40af' },
};

export default function HRDashboardScreen() {
  const { selectedProject } = useAuth();
  const navigation = useNavigation();

  const month = dayjs().month() + 1;
  const year  = dayjs().year();

  const { data: employees = [], isLoading: loadE, isError: errE } = useQuery({
    queryKey: ['hr-dash-employees'],
    queryFn: () => hrDashAPI.employees({ employment_status: 'active' })
      .then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60_000,
  });

  const { data: leaves = [], isLoading: loadL } = useQuery({
    queryKey: ['hr-dash-leaves'],
    queryFn: () => hrDashAPI.leaveRequests({ status: 'pending' })
      .then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60_000,
  });

  const { data: payrollData, isLoading: loadP } = useQuery({
    queryKey: ['hr-dash-payroll', month, year],
    queryFn: () => hrDashAPI.payroll({ month, year }).then(r => r.data?.data ?? []),
    staleTime: 60_000,
  });
  const payroll = Array.isArray(payrollData) ? payrollData : [];

  const { data: otData } = useQuery({
    queryKey: ['hr-dash-overtime', month, year],
    queryFn: () => hrDashAPI.overtime({ month, year }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });
  const otHoursTotal = Array.isArray(otData) ? otData.reduce((s, r) => s + parseFloat(r.ot_hours || 0), 0) : 0;

  const { data: reqData } = useQuery({
    queryKey: ['hr-dash-requests'],
    queryFn: () => hrDashAPI.serviceRequests({})
      .then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60_000,
  });
  const pendingRequests = Array.isArray(reqData) ? reqData.filter(r => ['open', 'in_progress'].includes(r.status)) : [];

  const { data: deptData } = useQuery({
    queryKey: ['hr-dash-dept', month, year],
    queryFn: () => hrDashAPI.deptSummary({ month, year }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });
  const depts = Array.isArray(deptData) ? deptData : [];

  const payrollPending = payroll.filter(p => p.status !== 'paid');
  const payrollPendingAmt = payrollPending.reduce((s, p) => s + parseFloat(p.net_pay || 0), 0);
  const fmtLakh = v => `₹${(v / 1e5).toFixed(2)}L`;

  return (
    <Screen>
      <ScreenHeader title="HR Dashboard" subtitle="Employees, attendance & payroll" showBack />
      <ScrollView contentContainerStyle={styles.content}>

        {/* KPIs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiRow}>
          <KpiCard icon="account-group-outline" label="Active Employees"   value={errE ? '!' : loadE ? '…' : employees.length}                          color="#2563eb" />
          <KpiCard icon="calendar-check-outline" label="Pending Leaves"   value={loadL ? '…' : leaves.length}                             color="#d97706" />
          <KpiCard icon="currency-inr"           label="Payroll Pending"  value={loadP ? '…' : (payrollPending.length > 0 ? fmtLakh(payrollPendingAmt) : '0')} color="#ea580c" />
          <KpiCard icon="clock-outline"          label="OT Hours"         value={otHoursTotal.toFixed(0)}                                  color="#475569" />
          <KpiCard icon="ticket-outline"         label="Open HR Requests" value={pendingRequests.length}                                   color="#dc2626" />
        </ScrollView>

        {/* Department Attendance Summary */}
        {depts.length > 0 && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="office-building-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.cardTitle}>Dept Attendance — {dayjs().format('MMM YYYY')}</Text>
            </View>
            <View style={styles.tableHead}>
              <Text style={[styles.thCell, { flex: 2, textAlign: 'left' }]}>Department</Text>
              <Text style={styles.thCell}>HC</Text>
              <Text style={[styles.thCell, { color: '#059669' }]}>Pres.</Text>
              <Text style={[styles.thCell, { color: '#dc2626' }]}>Abs.</Text>
              <Text style={[styles.thCell, { color: '#d97706' }]}>Leave</Text>
            </View>
            {depts.slice(0, 10).map((d, i) => (
              <View key={i} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: '#f8fafc' }]}>
                <Text style={[styles.tdCell, { flex: 2, fontWeight: '500', textAlign: 'left' }]} numberOfLines={1}>
                  {d.department_name || d.department}
                </Text>
                <Text style={styles.tdCell}>{d.headcount || 0}</Text>
                <Text style={[styles.tdCell, { color: '#059669', fontWeight: '600' }]}>{d.present || 0}</Text>
                <Text style={[styles.tdCell, { color: '#dc2626' }]}>{d.absent || 0}</Text>
                <Text style={[styles.tdCell, { color: '#d97706' }]}>{d.on_leave || 0}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Pending Leaves */}
        {leaves.length > 0 && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="calendar-remove-outline" size={14} color="#d97706" />
              <Text style={styles.cardTitle}>Pending Leave Requests ({leaves.length})</Text>
            </View>
            {leaves.slice(0, 6).map((lv, i) => {
              const from = lv.from_date ? dayjs(lv.from_date).format('DD MMM') : '—';
              const to   = lv.to_date   ? dayjs(lv.to_date).format('DD MMM')   : '—';
              return (
                <View key={lv.id || i} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{lv.employee_name || lv.employee?.name || '—'}</Text>
                    <Text style={styles.rowSub}>{lv.leave_type || 'Leave'}  ·  {from} – {to}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: '#fef3c7' }]}>
                    <Text style={[styles.badgeText, { color: '#92400e' }]}>Pending</Text>
                  </View>
                </View>
              );
            })}
            {leaves.length > 6 && (
              <TouchableOpacity onPress={() => navigation.navigate('ESS')}>
                <Text style={styles.seeAll}>+{leaves.length - 6} more leave requests →</Text>
              </TouchableOpacity>
            )}
          </Card>
        )}

        {/* Open HR Service Requests */}
        {pendingRequests.length > 0 && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="ticket-outline" size={14} color="#dc2626" />
              <Text style={styles.cardTitle}>Open HR Requests ({pendingRequests.length})</Text>
            </View>
            {pendingRequests.slice(0, 6).map((r, i) => {
              const ps = PRIORITY_STYLE[r.priority] || PRIORITY_STYLE.normal;
              const ss = r.status === 'in_progress'
                ? { bg: '#dbeafe', text: '#1e40af' }
                : { bg: '#fef3c7', text: '#92400e' };
              return (
                <View key={r.id || i} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{r.employee_name || '—'}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>{r.subject || '—'}</Text>
                  </View>
                  <View style={{ gap: 4, alignItems: 'flex-end' }}>
                    <View style={[styles.badge, { backgroundColor: ps.bg }]}>
                      <Text style={[styles.badgeText, { color: ps.text }]}>{r.priority || 'normal'}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: ss.bg }]}>
                      <Text style={[styles.badgeText, { color: ss.text }]}>
                        {r.status === 'in_progress' ? 'In Progress' : 'Open'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        )}

        {/* Quick Links */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Quick Links</Text>
          <View style={styles.quickLinks}>
            {[
              { label: 'Employee Directory', screen: 'EmployeeDirectory', icon: 'account-group-outline' },
              { label: 'Payroll',            screen: 'Payroll',           icon: 'currency-inr' },
              { label: 'Leave / Attendance', screen: 'ESS',               icon: 'calendar-check-outline' },
              { label: 'Performance',        screen: 'Performance',       icon: 'chart-line' },
            ].map(l => (
              <TouchableOpacity key={l.label} style={styles.quickLink} onPress={() => navigation.navigate(l.screen)}>
                <MaterialCommunityIcons name={l.icon} size={18} color={theme.colors.primary} />
                <Text style={styles.quickLinkText}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 12, padding: 12 },
  kpiRow: { gap: 10, paddingBottom: 4 },
  kpiCard: { width: 128, alignItems: 'flex-start', padding: 14, gap: 4 },
  kpiIcon: { borderRadius: 10, padding: 8, marginBottom: 4 },
  kpiValue: { fontSize: 20, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: '#64748b', lineHeight: 14 },
  card: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  tableHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderRadius: 6, paddingHorizontal: 2 },
  thCell: { flex: 1, fontSize: 11, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', textAlign: 'center' },
  tdCell: { flex: 1, fontSize: 12, color: '#64748b', textAlign: 'center' },
  listRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  rowName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  rowSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  seeAll: { fontSize: 12, color: theme.colors.primary, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f0f4ff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  quickLinkText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
});
