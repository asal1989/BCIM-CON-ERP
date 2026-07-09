import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { billsAPI, tqsDashAPI } from '../api/client';
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

function PipelineRow({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={styles.pipeRow}>
      <Text style={styles.pipeLabel}>{label}</Text>
      <View style={styles.pipeBar}>
        <View style={[styles.pipeFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.pipeCount, { color }]}>{count}</Text>
    </View>
  );
}

export default function QSDashboardScreen() {
  const { selectedProject } = useAuth();
  const navigation = useNavigation();

  const { data: bills = [], isLoading: loadB, isError: errB } = useQuery({
    queryKey: ['qs-dash-bills', selectedProject?.id],
    queryFn: () => billsAPI.list(selectedProject?.id).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60_000,
  });

  const { data: aging = [] } = useQuery({
    queryKey: ['qs-dash-aging', selectedProject?.id],
    queryFn: () => tqsDashAPI.getAPAging({ project_id: selectedProject?.id || undefined })
      .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });

  const { data: advances = [] } = useQuery({
    queryKey: ['qs-dash-advances'],
    queryFn: () => tqsDashAPI.listAdvances({}).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });

  const now = dayjs();
  const pendingQS    = bills.filter(b => b.workflow_status === 'document_controller');
  const paidBills    = bills.filter(b => b.workflow_status === 'paid');
  const pendingAcct  = bills.filter(b => b.workflow_status === 'accounts');
  const certified    = bills.filter(b => ['qs', 'accounts', 'paid'].includes(b.workflow_status));
  const thisMonth    = certified.filter(b => dayjs(b.updated_at).isSame(now, 'month'));
  const certAmtMonth = thisMonth.reduce((s, b) => s + parseFloat(b.certified_net || 0), 0);
  const totalInvoiced  = bills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
  const totalCertified = bills.reduce((s, b) => s + parseFloat(b.certified_net || 0), 0);
  const totalOutstanding = aging.reduce((s, r) => s + parseFloat(r.balance || 0), 0);
  const overdueItems = aging.filter(r => ['61-90', '90+'].includes(r.aging_bucket));
  const pendingAdvCount = Array.isArray(advances) ? advances.filter(a => !a.recovered_at).length : 0;

  const withCertDate = bills.filter(b => b.inv_date && b.qs_certified_date);
  const avgTurnaround = withCertDate.length
    ? Math.round(withCertDate.reduce((s, b) => s + dayjs(b.qs_certified_date).diff(dayjs(b.inv_date), 'day'), 0) / withCertDate.length)
    : null;

  const agingBuckets = ['0-30', '31-60', '61-90', '90+'].map(bucket => ({
    bucket,
    count: aging.filter(r => r.aging_bucket === bucket).length,
    amount: aging.filter(r => r.aging_bucket === bucket).reduce((s, r) => s + parseFloat(r.balance || 0), 0),
  }));

  return (
    <Screen>
      <ScreenHeader title="QS Dashboard" subtitle="Bill certification & AP aging" showBack />
      <ScrollView contentContainerStyle={styles.content}>

        {/* KPIs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiRow}>
          <KpiCard icon="clock-outline"       label="Awaiting QS Cert"     value={pendingQS.length}                                   color="#f59e0b" />
          <KpiCard icon="check-circle-outline" label="Certified This Month" value={thisMonth.length}                                   color="#10b981" />
          <KpiCard icon="currency-inr"         label="Cert Value (Month)"   value={money(certAmtMonth)}                                color="#4f46e5" />
          <KpiCard icon="alert-circle-outline" label="Total Outstanding"    value={money(totalOutstanding)}                            color="#ef4444" />
          <KpiCard icon="timer-outline"        label="Avg Turnaround"       value={avgTurnaround != null ? `${avgTurnaround}d` : '—'} color="#3b82f6" />
          <KpiCard icon="cash-clock"           label="Pending Advances"     value={pendingAdvCount}                                    color="#7c3aed" />
        </ScrollView>

        {/* Alert Banners */}
        {pendingQS.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}>
            <MaterialCommunityIcons name="clock-outline" size={15} color="#d97706" />
            <Text style={[styles.bannerText, { color: '#92400e' }]}>
              {pendingQS.length} bill{pendingQS.length !== 1 ? 's' : ''} awaiting QS certification
            </Text>
          </View>
        )}
        {overdueItems.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
            <MaterialCommunityIcons name="alert-triangle" size={15} color="#dc2626" />
            <Text style={[styles.bannerText, { color: '#991b1b' }]}>
              {overdueItems.length} vendor{overdueItems.length !== 1 ? 's' : ''} with payments overdue 60+ days
            </Text>
          </View>
        )}

        {/* Bill Workflow */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="chart-timeline-variant" size={14} color={theme.colors.primary} />
            <Text style={styles.cardTitle}>Bill Workflow Pipeline</Text>
            <Text style={styles.cardSub}>{bills.length} total</Text>
          </View>
          <PipelineRow label="Awaiting QS Cert" count={pendingQS.length}   total={bills.length} color="#f59e0b" />
          <PipelineRow label="With Accounts"    count={pendingAcct.length}  total={bills.length} color="#3b82f6" />
          <PipelineRow label="Paid"             count={paidBills.length}    total={bills.length} color="#10b981" />
          <View style={styles.totalsRow}>
            <View style={styles.totalBox}>
              <Text style={styles.totalAmt}>{money(totalInvoiced)}</Text>
              <Text style={styles.totalLbl}>Total Invoiced</Text>
            </View>
            <View style={styles.totalBox}>
              <Text style={[styles.totalAmt, { color: '#059669' }]}>{money(totalCertified)}</Text>
              <Text style={styles.totalLbl}>Total Certified</Text>
            </View>
          </View>
        </Card>

        {/* AP Aging */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="chart-bar" size={14} color="#dc2626" />
            <Text style={styles.cardTitle}>AP Aging Breakdown</Text>
            <Text style={styles.cardSub}>{aging.length} vendors</Text>
          </View>
          <View style={styles.agingGrid}>
            {agingBuckets.map(b => (
              <View key={b.bucket} style={[styles.agingCard, { backgroundColor: AGING_BG[b.bucket] }]}>
                <Text style={[styles.agingCount, { color: AGING_TEXT[b.bucket] }]}>{b.count}</Text>
                <Text style={[styles.agingDays, { color: AGING_COLOR[b.bucket] }]}>{b.bucket} days</Text>
                {b.amount > 0 && <Text style={[styles.agingAmt, { color: AGING_TEXT[b.bucket] }]}>{money(b.amount)}</Text>}
              </View>
            ))}
          </View>
          <Text style={[styles.totalAmt, { color: '#dc2626', textAlign: 'center', marginTop: 10 }]}>{money(totalOutstanding)}</Text>
          <Text style={[styles.totalLbl, { textAlign: 'center' }]}>Total Outstanding</Text>
        </Card>

        {/* This Month */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="trending-up" size={14} color="#059669" />
            <Text style={styles.cardTitle}>This Month</Text>
            <Text style={styles.cardSub}>{now.format('MMM YYYY')}</Text>
          </View>
          {[
            { label: 'New Bills Received', value: bills.filter(b => dayjs(b.created_at || b.inv_date).isSame(now, 'month')).length },
            { label: 'Bills Certified',    value: thisMonth.length, green: true },
            { label: 'Payments Made',      value: paidBills.filter(b => dayjs(b.updated_at).isSame(now, 'month')).length },
          ].map(row => (
            <View key={row.label} style={styles.monthRow}>
              <Text style={styles.monthLabel}>{row.label}</Text>
              <Text style={[styles.monthValue, row.green && { color: '#059669' }]}>{row.value}</Text>
            </View>
          ))}
          <Text style={[styles.totalAmt, { color: '#059669', textAlign: 'center', marginTop: 10 }]}>{money(certAmtMonth)}</Text>
          <Text style={[styles.totalLbl, { textAlign: 'center' }]}>Certified Value This Month</Text>
        </Card>

        {/* Bills Awaiting Cert */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="file-clock-outline" size={14} color="#d97706" />
            <Text style={styles.cardTitle}>Bills Awaiting QS Cert ({pendingQS.length})</Text>
          </View>
          {errB ? <Text style={styles.empty}>Could not load bills. Pull down to retry.</Text>
          : loadB ? <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 12 }} />
          : pendingQS.length === 0
            ? <Text style={styles.empty}>No bills awaiting certification ✅</Text>
            : pendingQS.slice(0, 8).map((b, i) => (
              <View key={b.id || i} style={styles.billRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.billVendor} numberOfLines={1}>{b.vendor_name || '—'}</Text>
                  <Text style={styles.billSub}>{b.inv_number || '—'}  ·  {b.inv_date ? dayjs(b.inv_date).format('DD MMM') : '—'}</Text>
                </View>
                <Text style={styles.billAmt}>{money(b.total_amount)}</Text>
              </View>
            ))
          }
          {pendingQS.length > 8 && (
            <TouchableOpacity onPress={() => navigation.navigate('Bills')}>
              <Text style={styles.seeAll}>See all {pendingQS.length} bills →</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* AP Aging Vendors */}
        {aging.length > 0 && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="account-clock-outline" size={14} color="#dc2626" />
              <Text style={styles.cardTitle}>AP Aging Summary ({aging.length} Vendors)</Text>
            </View>
            {aging.slice(0, 8).map((r, i) => (
              <View key={r.id || i} style={styles.billRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.billVendor} numberOfLines={1}>{r.vendor_name}</Text>
                  <Text style={styles.billSub}>Certified: {money(r.certified_net)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 13 }}>{money(r.balance)}</Text>
                  <View style={[styles.badge, { backgroundColor: AGING_BG[r.aging_bucket] }]}>
                    <Text style={[styles.badgeText, { color: AGING_TEXT[r.aging_bucket] || '#334155' }]}>
                      {r.aging_bucket || '—'} days
                    </Text>
                  </View>
                </View>
              </View>
            ))}
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
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '500' },
  card: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1e293b' },
  cardSub: { fontSize: 11, color: '#94a3b8' },
  pipeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pipeLabel: { width: 130, fontSize: 12, color: '#64748b' },
  pipeBar: { flex: 1, height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  pipeFill: { height: 6, borderRadius: 3 },
  pipeCount: { width: 28, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  totalsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  totalBox: { flex: 1, alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  totalAmt: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  totalLbl: { fontSize: 10, color: '#94a3b8', marginTop: 2, textTransform: 'uppercase' },
  agingGrid: { flexDirection: 'row', gap: 8 },
  agingCard: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  agingCount: { fontSize: 20, fontWeight: '800' },
  agingDays: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  agingAmt: { fontSize: 10, marginTop: 4, textAlign: 'center' },
  monthRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  monthLabel: { fontSize: 13, color: '#475569' },
  monthValue: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  billRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  billVendor: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  billSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  billAmt: { fontSize: 13, fontWeight: '700', color: '#334155' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  empty: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
  seeAll: { fontSize: 12, color: theme.colors.primary, fontWeight: '600', marginTop: 8, textAlign: 'center' },
});
