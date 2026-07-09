import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { billsAPI, accountsDashAPI } from '../api/client';
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

const AGING_COLOR = { '0-30': '#10b981', '31-60': '#f59e0b', '61-90': '#f97316', '90+': '#ef4444' };
const AGING_BG   = { '0-30': '#d1fae5', '31-60': '#fef3c7', '61-90': '#ffedd5', '90+': '#fee2e2' };
const AGING_TEXT = { '0-30': '#065f46', '31-60': '#92400e', '61-90': '#9a3412', '90+': '#991b1b' };

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

export default function AccountsDashboardScreen() {
  const { selectedProject } = useAuth();
  const navigation = useNavigation();
  const projectId = selectedProject?.id;

  const { data: bills = [], isLoading: loadB, isError: errB } = useQuery({
    queryKey: ['accts-dash-bills', projectId],
    queryFn: () => billsAPI.list(projectId).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60_000,
  });

  const { data: pcList = [], isLoading: loadPC } = useQuery({
    queryKey: ['accts-dash-pc', projectId],
    queryFn: () => accountsDashAPI.pcPending({ project_id: projectId || undefined }).then(r => r.data?.data ?? []),
    staleTime: 60_000,
  });

  const { data: aging = [] } = useQuery({
    queryKey: ['accts-dash-aging', projectId],
    queryFn: () => accountsDashAPI.apAging({ project_id: projectId || undefined }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['accts-dash-payments', projectId],
    queryFn: () => accountsDashAPI.payments({ project_id: projectId || undefined })
      .then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60_000,
  });

  const now = dayjs();
  const readyForPayment = bills.filter(b => b.workflow_status === 'accounts');
  const paidThisMonth   = bills.filter(b => b.workflow_status === 'paid' && dayjs(b.updated_at).isSame(now, 'month'));
  const unpaidBills     = bills.filter(b => b.workflow_status !== 'paid');
  const totalOutstanding = unpaidBills.reduce((s, b) => s + parseFloat(b.balance_to_pay || b.certified_net || b.total_amount || 0), 0);
  const totalDue        = readyForPayment.reduce((s, b) => s + parseFloat(b.certified_net || b.total_amount || 0), 0);
  const paidAmt         = paidThisMonth.reduce((s, b) => s + parseFloat(b.paid_amount || 0), 0);
  const overdue90       = aging.filter(a => a.aging_bucket === '90+');
  const totalOverdue    = overdue90.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
  const stuckBills      = unpaidBills.filter(b => b.updated_at && Math.floor((Date.now() - new Date(b.updated_at)) / 86400000) > 7);
  const pendingPCCount  = pcList.filter(p => parseFloat(p.balance_due) > 0).length;
  const totalPCDue      = pcList.reduce((s, p) => s + parseFloat(p.balance_due || 0), 0);

  const agingBuckets = ['0-30', '31-60', '61-90', '90+'].map(bucket => ({
    bucket,
    count: aging.filter(a => a.aging_bucket === bucket).length,
    total: aging.filter(a => a.aging_bucket === bucket).reduce((s, a) => s + parseFloat(a.balance || 0), 0),
  }));

  return (
    <Screen>
      <ScreenHeader title="Accounts Dashboard" subtitle="Payments, ledgers & financial overview" showBack />
      <ScrollView contentContainerStyle={styles.content}>

        {/* KPIs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiRow}>
          <KpiCard icon="currency-inr"        label="Total Outstanding"  value={unpaidBills.length}     color="#ef4444" sub={money(totalOutstanding)} />
          <KpiCard icon="file-document-outline" label="PCs Pending"      value={pendingPCCount}         color="#f59e0b" sub={money(totalPCDue)} />
          <KpiCard icon="clock-outline"       label="At Accounts Stage"  value={readyForPayment.length} color="#7c3aed" sub={money(totalDue)} />
          <KpiCard icon="check-circle-outline" label="Paid This Month"   value={paidThisMonth.length}   color="#10b981" sub={money(paidAmt)} />
          <KpiCard icon="alert-triangle"      label="Overdue 90+ Days"   value={overdue90.length}       color="#f97316" sub={money(totalOverdue)} />
          <KpiCard icon="clock-alert-outline" label="Stuck 7+ Days"      value={stuckBills.length}      color="#64748b" sub={`${unpaidBills.length} unpaid`} />
        </ScrollView>

        {/* Alert Banners */}
        {overdue90.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}>
            <MaterialCommunityIcons name="alert-triangle" size={15} color="#d97706" />
            <Text style={[styles.bannerText, { color: '#92400e' }]}>
              {overdue90.length} bill{overdue90.length !== 1 ? 's' : ''} overdue 90+ days — {money(totalOverdue)} outstanding
            </Text>
          </View>
        )}
        {stuckBills.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#dbeafe', borderColor: '#93c5fd' }]}>
            <MaterialCommunityIcons name="clock-outline" size={15} color="#2563eb" />
            <Text style={[styles.bannerText, { color: '#1e40af' }]}>
              {stuckBills.length} bill{stuckBills.length !== 1 ? 's' : ''} stuck at Accounts for 7+ days
            </Text>
          </View>
        )}

        {/* AP Aging Distribution */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="chart-bar" size={14} color="#dc2626" />
            <Text style={styles.cardTitle}>AP Aging Distribution</Text>
          </View>
          <View style={styles.agingGrid}>
            {agingBuckets.map(b => (
              <View key={b.bucket} style={[styles.agingCard, { borderTopColor: AGING_COLOR[b.bucket] || '#94a3b8' }]}>
                <Text style={[styles.agingCount, { color: AGING_TEXT[b.bucket] || '#334155' }]}>{b.count}</Text>
                <Text style={[styles.agingDays, { color: AGING_COLOR[b.bucket] }]}>{b.bucket} days</Text>
                <Text style={styles.agingAmt}>{money(b.total)}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* PC Pending Payments */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="credit-card-outline" size={14} color="#7c3aed" />
            <Text style={styles.cardTitle}>Payment Certificates Pending ({pendingPCCount})</Text>
          </View>
          {errB ? <Text style={styles.empty}>Could not load data. Pull down to retry.</Text>
          : loadPC ? <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 12 }} />
          : pendingPCCount === 0
            ? <Text style={styles.empty}>No PCs pending payment 🎉</Text>
            : pcList.filter(p => parseFloat(p.balance_due) > 0).slice(0, 8).map((pc, i) => (
              <View key={pc.pc_number || i} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.monoText} numberOfLines={1}>{pc.pc_number || 'No PC'}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{pc.vendor_name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.redAmt}>{money(pc.balance_due)}</Text>
                  <Text style={styles.rowSub}>{pc.bill_count || 0} bills</Text>
                </View>
              </View>
            ))
          }
          {pendingPCCount > 8 && (
            <TouchableOpacity onPress={() => navigation.navigate('Bills')}>
              <Text style={styles.seeAll}>+{pendingPCCount - 8} more PCs →</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Recent Payments */}
        {payments.length > 0 && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="cash-multiple" size={14} color="#059669" />
              <Text style={styles.cardTitle}>Recent Payments</Text>
            </View>
            {payments.slice(0, 8).map((p, i) => (
              <View key={p.id || i} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{p.entity_name || p.vendor_name || '—'}</Text>
                  <Text style={styles.rowSub}>{p.payment_mode || '—'}  ·  {p.payment_date ? dayjs(p.payment_date).format('DD MMM') : '—'}</Text>
                </View>
                <Text style={styles.greenAmt}>{money(p.amount)}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => navigation.navigate('VendorPayments')}>
              <Text style={styles.seeAll}>View all payments →</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Quick Links */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Quick Links</Text>
          <View style={styles.quickLinks}>
            {[
              { label: 'Bills',           screen: 'Bills',         icon: 'file-document-outline' },
              { label: 'Invoices',        screen: 'Invoices',      icon: 'receipt' },
              { label: 'Vendor Payments', screen: 'VendorPayments', icon: 'cash-multiple' },
              { label: 'Bank Accounts',   screen: 'BankAccounts',  icon: 'bank-outline' },
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
  kpiSub: { fontSize: 10, marginTop: 1 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '500' },
  card: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  agingGrid: { flexDirection: 'row', gap: 8 },
  agingCard: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 10, padding: 10,
    alignItems: 'center', borderTopWidth: 3,
  },
  agingCount: { fontSize: 22, fontWeight: '800' },
  agingDays: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  agingAmt: { fontSize: 10, color: '#64748b', marginTop: 4, textAlign: 'center' },
  listRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  rowName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  rowSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  monoText: { fontSize: 12, fontWeight: '700', color: '#4f46e5' },
  redAmt: { fontSize: 14, fontWeight: '800', color: '#dc2626' },
  greenAmt: { fontSize: 14, fontWeight: '700', color: '#059669' },
  empty: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
  seeAll: { fontSize: 12, color: theme.colors.primary, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f0f4ff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  quickLinkText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
});
