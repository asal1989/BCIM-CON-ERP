import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { projectAPI, billsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import { theme } from '../theme';
import { useNavigation } from '@react-navigation/native';

function money(n) {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

const STATUS_STYLE = {
  active:    { bg: '#d1fae5', text: '#065f46' },
  planning:  { bg: '#dbeafe', text: '#1e40af' },
  completed: { bg: '#f1f5f9', text: '#475569' },
  on_hold:   { bg: '#fef3c7', text: '#92400e' },
};
const BILL_STYLE = {
  pending:  { bg: '#fef3c7', text: '#92400e' },
  stores:   { bg: '#dbeafe', text: '#1e40af' },
  qs:       { bg: '#e0e7ff', text: '#3730a3' },
  accounts: { bg: '#ede9fe', text: '#5b21b6' },
};

function KpiCard({ icon, label, value, color, sub }) {
  const bg = `${color}22`;
  return (
    <Card style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value ?? '—'}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={[styles.kpiSub, { color }]}>{sub}</Text> : null}
    </Card>
  );
}

export default function PMDashboardScreen() {
  const { selectedProject } = useAuth();
  const navigation = useNavigation();

  const { data: projects = [], isLoading: loadP } = useQuery({
    queryKey: ['pm-dash-projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.data ?? d?.projects ?? []);
    }),
    staleTime: 60_000,
  });

  const { data: bills = [], isLoading: loadB, isError: errB } = useQuery({
    queryKey: ['pm-dash-bills', selectedProject?.id],
    queryFn: () => billsAPI.list(selectedProject?.id).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60_000,
  });

  const now = dayjs();
  const active       = projects.filter(p => p.status === 'active').length;
  const onHold       = projects.filter(p => p.status === 'on_hold').length;
  const totalValue   = projects.reduce((s, p) => s + parseFloat(p.contract_value || p.value || 0), 0);
  const pendingBills = bills.filter(b => ['pending', 'stores', 'qs'].includes(b.workflow_status));
  const pendingAmt   = pendingBills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);

  const upcoming = projects
    .filter(p => {
      if (!p.end_date) return false;
      const diff = dayjs(p.end_date).diff(now, 'day');
      return diff >= 0 && diff <= 60;
    })
    .sort((a, b) => dayjs(a.end_date).diff(dayjs(b.end_date)));

  const overdue = projects.filter(p => p.end_date && dayjs(p.end_date).isBefore(now) && p.status !== 'completed');

  return (
    <Screen>
      <ScreenHeader title="Projects Dashboard" subtitle="Active projects, bills & progress" showBack />
      <ScrollView contentContainerStyle={styles.content}>

        {/* KPIs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiRow}>
          <KpiCard icon="briefcase-outline"   label="Active Projects"  value={loadP ? '…' : active}                 color="#4f46e5" sub={`${projects.length} total`} />
          <KpiCard icon="pause-circle-outline" label="On Hold"         value={loadP ? '…' : onHold}                 color="#f59e0b" sub="Projects paused" />
          <KpiCard icon="currency-inr"        label="Contract Value"   value={loadP ? '…' : money(totalValue)}       color="#10b981" />
          <KpiCard icon="receipt"             label="Bills Pending"    value={loadB ? '…' : pendingBills.length}    color="#f97316" sub={money(pendingAmt)} />
          <KpiCard icon="alert-triangle"      label="Overdue"          value={loadP ? '…' : overdue.length}         color="#ef4444" sub="Past deadline" />
          <KpiCard icon="calendar-clock"      label="Closing in 60d"   value={loadP ? '…' : upcoming.length}        color="#3b82f6" />
        </ScrollView>

        {/* Alert Banners */}
        {pendingBills.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}>
            <MaterialCommunityIcons name="alert-triangle" size={15} color="#d97706" />
            <Text style={[styles.bannerText, { color: '#92400e' }]}>
              {pendingBills.length} bill{pendingBills.length !== 1 ? 's' : ''} awaiting approval — {money(pendingAmt)} pending
            </Text>
          </View>
        )}
        {overdue.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
            <MaterialCommunityIcons name="alert-triangle" size={15} color="#dc2626" />
            <Text style={[styles.bannerText, { color: '#991b1b' }]}>
              {overdue.length} project{overdue.length !== 1 ? 's' : ''} past their deadline
            </Text>
          </View>
        )}

        {/* Projects List */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="office-building-outline" size={14} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>My Projects ({projects.length})</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
              <Text style={styles.viewAll}>View all →</Text>
            </TouchableOpacity>
          </View>
          {projects.length === 0
            ? <Text style={styles.empty}>No projects found</Text>
            : projects.slice(0, 8).map((p, i) => {
              const s = STATUS_STYLE[p.status] || STATUS_STYLE.planning;
              return (
                <View key={p.id || i} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.rowSub}>
                      Due: {p.end_date ? dayjs(p.end_date).format('DD MMM YY') : '—'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.rowAmt}>{money(p.contract_value || p.value)}</Text>
                    <View style={[styles.badge, { backgroundColor: s.bg }]}>
                      <Text style={[styles.badgeText, { color: s.text }]}>{p.status || 'active'}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          }
        </Card>

        {/* Bills Pending Approval */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="receipt" size={14} color="#f97316" />
            <Text style={styles.cardTitle}>Bills Pending Approval ({pendingBills.length})</Text>
          </View>
          {errB ? <Text style={styles.empty}>Could not load bills. Pull down to retry.</Text>
          : pendingBills.length === 0
            ? <Text style={styles.empty}>No pending approvals ✅</Text>
            : pendingBills.slice(0, 8).map((b, i) => {
              const s = BILL_STYLE[b.workflow_status] || { bg: '#f1f5f9', text: '#475569' };
              return (
                <View key={b.id || i} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{b.vendor_name || '—'}</Text>
                    <Text style={styles.rowSub}>{b.inv_number || '—'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.rowAmt}>{money(b.total_amount)}</Text>
                    <View style={[styles.badge, { backgroundColor: s.bg }]}>
                      <Text style={[styles.badgeText, { color: s.text }]}>{b.workflow_status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          }
          {pendingBills.length > 0 && (
            <View style={styles.totalFooter}>
              <Text style={styles.totalLabel}>Total Pending</Text>
              <Text style={styles.totalValue}>{money(pendingAmt)}</Text>
            </View>
          )}
        </Card>

        {/* Upcoming Deadlines */}
        {upcoming.length > 0 && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="calendar-clock" size={14} color="#f59e0b" />
              <Text style={styles.cardTitle}>Closing in 60 Days ({upcoming.length})</Text>
            </View>
            {upcoming.map((p, i) => {
              const daysLeft = dayjs(p.end_date).diff(now, 'day');
              return (
                <View key={p.id || i} style={styles.deadlineCard}>
                  <MaterialCommunityIcons name="calendar-clock" size={16} color="#f59e0b" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.deadlineSub}>
                      Due {dayjs(p.end_date).format('D MMM YYYY')} · {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}

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
  kpiSub: { fontSize: 10, marginTop: 1 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '500' },
  card: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1e293b' },
  viewAll: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
  listRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  rowName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  rowSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  rowAmt: { fontSize: 13, fontWeight: '700', color: '#334155' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  empty: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
  totalFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  totalLabel: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  totalValue: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  deadlineCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fef9eb', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#fde68a', marginBottom: 8,
  },
  deadlineSub: { fontSize: 11, color: '#d97706', marginTop: 2 },
});
