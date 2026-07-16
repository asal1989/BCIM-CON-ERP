import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { billsAPI, raBillAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { theme } from '../theme';

dayjs.extend(relativeTime);

// ─── stages ───────────────────────────────────────────────────────────────────
// TQS stages
const TQS_STAGES = [
  { key: 'pending',             label: 'Pending',    color: '#6366f1' },
  { key: 'document_controller', label: 'Doc Ctrl',   color: '#f59e0b' },
  { key: 'stores',              label: 'Stores',     color: '#06b6d4' },
  { key: 'pm',                  label: 'PM',         color: '#8b5cf6' },
  { key: 'qs',                  label: 'QS',         color: '#3b82f6' },
  { key: 'accounts',            label: 'Accounts',   color: '#ec4899' },
  { key: 'paid',                label: 'Paid',       color: '#10b981' },
];

// RA (subcontractor) bill statuses mapped to display labels
const RA_STATUS_LABEL = { pending: 'Pending', verified: 'Verified', approved: 'Approved', paid: 'Paid', rejected: 'Rejected' };

const STATUS_COLOR = {
  pending:             { bg: '#ede9fe', text: '#5b21b6' },
  document_controller: { bg: '#fef3c7', text: '#92400e' },
  stores:              { bg: '#cffafe', text: '#155e75' },
  pm:                  { bg: '#ede9fe', text: '#4c1d95' },
  qs:                  { bg: '#dbeafe', text: '#1e40af' },
  accounts:            { bg: '#fce7f3', text: '#9d174d' },
  paid:                { bg: '#d1fae5', text: '#065f46' },
  verified:            { bg: '#e0f2fe', text: '#0369a1' },
  approved:            { bg: '#dcfce7', text: '#166534' },
  rejected:            { bg: '#fee2e2', text: '#991b1b' },
};

function money(n) {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: color }]}>
      <View style={styles.kpiTop}>
        <View>
          <Text style={styles.kpiLabel}>{label}</Text>
          <Text style={styles.kpiValue}>{value ?? '—'}</Text>
          {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
        </View>
        <MaterialCommunityIcons name={icon} size={28} color="rgba(255,255,255,0.35)" />
      </View>
    </View>
  );
}

function TypeBadge({ type }) {
  const isSC = type === 'ra';
  return (
    <View style={[styles.typeBadge, isSC ? styles.typeBadgeSC : styles.typeBadgeTQS]}>
      <Text style={[styles.typeBadgeText, isSC ? styles.typeBadgeTextSC : styles.typeBadgeTextTQS]}>
        {isSC ? 'SC' : 'TQS'}
      </Text>
    </View>
  );
}

const FILTERS = [
  { key: 'all',    label: 'All' },
  { key: 'tqs',    label: 'TQS Bills' },
  { key: 'ra',     label: 'SC Bills' },
  { key: 'pending',label: 'Pending' },
  { key: 'paid',   label: 'Paid' },
];

export default function BillsScreen() {
  const navigation = useNavigation();
  const { selectedProject } = useAuth();
  const projectId = selectedProject?.id;
  const [filter, setFilter] = useState('all');

  const [tqsQuery, raQuery] = useQueries({
    queries: [
      {
        queryKey: ['bills-list', projectId],
        queryFn: () => billsAPI.list(projectId).then(r => {
          const raw = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
          return raw.map(b => ({ ...b, bill_type: 'tqs' }));
        }),
        staleTime: 60_000,
      },
      {
        queryKey: ['ra-bills-list', projectId],
        queryFn: () => raBillAPI.list(projectId).then(r => {
          const raw = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
          return raw.map(b => ({
            ...b,
            bill_type: 'ra',
            workflow_status: b.status,
            vendor_name: b.sc_name || b.vendor_name,
            bill_number: b.bill_number || b.ra_bill_number,
            inv_number: b.bill_number || b.ra_bill_number,
            total_amount: b.gross_amount || b.total_amount,
            inv_date: b.bill_date || b.inv_date,
          }));
        }),
        staleTime: 60_000,
      },
    ],
  });

  const isLoading = tqsQuery.isLoading || raQuery.isLoading;
  const isError   = tqsQuery.isError && raQuery.isError;
  const refetch   = () => { tqsQuery.refetch(); raQuery.refetch(); };

  const tqsBills = tqsQuery.data ?? [];
  const raBills  = raQuery.data  ?? [];
  const bills    = [...tqsBills, ...raBills];

  const now = dayjs();
  const open       = bills.filter(b => b.workflow_status !== 'paid');
  const inApproval = bills.filter(b => ['pending', 'document_controller', 'stores', 'pm'].includes(b.workflow_status));
  const atQS       = bills.filter(b => b.workflow_status === 'qs');
  const atAccounts = bills.filter(b => b.workflow_status === 'accounts' || b.workflow_status === 'verified');
  const paidThisMo = bills.filter(b => b.workflow_status === 'paid' && dayjs(b.updated_at).isSame(now, 'month'));
  const totalAmt   = bills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);

  const filtered = filter === 'all'    ? bills
    : filter === 'tqs'  ? tqsBills
    : filter === 'ra'   ? raBills
    : filter === 'paid' ? bills.filter(b => b.workflow_status === 'paid')
    : bills.filter(b => b.workflow_status === filter);

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Bill Tracker</Text>
          <Text style={styles.headerSub}>
            {selectedProject?.name ?? 'All Projects'} · TQS + SC bills
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
      ) : isError ? (
        <ErrorState message="Couldn't load bills" onRetry={refetch} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* KPI cards */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiRow}>
            <KpiCard label="OPEN BILLS"      value={open.length}       sub={`${bills.length} total`}            color="#6366f1" icon="receipt-clock" />
            <KpiCard label="IN APPROVAL"     value={inApproval.length} sub="Pending sign-off"                   color="#f59e0b" icon="clock-outline" />
            <KpiCard label="AT QS/VERIFIED"  value={atQS.length}       sub="Awaiting certification"             color="#3b82f6" icon="file-check-outline" />
            <KpiCard label="AT ACCOUNTS"     value={atAccounts.length} sub="Awaiting payment"                   color="#ec4899" icon="bank-outline" />
            <KpiCard label="PAID THIS MONTH" value={paidThisMo.length} sub={money(paidThisMo.reduce((s,b)=>s+parseFloat(b.total_amount||0),0))} color="#10b981" icon="check-circle-outline" />
            <KpiCard label="TQS BILLS"       value={tqsBills.length}   sub={money(tqsBills.reduce((s,b)=>s+parseFloat(b.total_amount||0),0))} color="#0ea5e9" icon="receipt-text-outline" />
            <KpiCard label="SC BILLS"        value={raBills.length}    sub={money(raBills.reduce((s,b)=>s+parseFloat(b.total_amount||0),0))}  color="#8b5cf6" icon="account-hard-hat" />
            <KpiCard label="TOTAL VALUE"     value={money(totalAmt)}   sub={`${bills.length} bills`}            color="#475569" icon="currency-inr" />
          </ScrollView>

          {/* Pipeline — TQS */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="timeline-check-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>TQS Bill Pipeline</Text>
              <Text style={styles.sectionSub}>{tqsBills.length} BILLS</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pipelineRow}>
              {TQS_STAGES.map((s, i) => {
                const cnt = tqsBills.filter(b => b.workflow_status === s.key).length;
                const active = cnt > 0;
                return (
                  <React.Fragment key={s.key}>
                    <View style={styles.stageBubbleWrap}>
                      <View style={[styles.stageBubble, { backgroundColor: active ? s.color : '#e2e8f0' }]}>
                        <Text style={[styles.stageBubbleCount, { color: active ? '#fff' : '#94a3b8' }]}>{cnt}</Text>
                      </View>
                      <Text style={[styles.stageLabel, active && { color: s.color, fontWeight: '700' }]} numberOfLines={1}>{s.label}</Text>
                    </View>
                    {i < TQS_STAGES.length - 1 && <View style={styles.pipelineConnector} />}
                  </React.Fragment>
                );
              })}
            </ScrollView>
          </View>

          {/* SC Bill Summary */}
          {raBills.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="account-hard-hat" size={16} color="#8b5cf6" />
                <Text style={styles.sectionTitle}>Subcontractor RA Bills</Text>
                <Text style={styles.sectionSub}>{raBills.length} BILLS</Text>
              </View>
              <View style={styles.pipelineSummary}>
                {['pending', 'verified', 'approved', 'paid'].map((s, i, arr) => {
                  const cnt = raBills.filter(b => b.workflow_status === s).length;
                  const sc  = STATUS_COLOR[s] || { bg: '#f1f5f9', text: '#475569' };
                  return (
                    <View key={s} style={[styles.pipelineSummaryBox, i > 0 && { borderLeftWidth: 1, borderLeftColor: theme.colors.border }]}>
                      <Text style={[styles.pipelineSummaryValue, { color: sc.text }]}>{cnt}</Text>
                      <Text style={[styles.pipelineSummaryLabel, { color: sc.text }]}>{RA_STATUS_LABEL[s]}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {FILTERS.map(f => (
              <TouchableOpacity key={f.key} style={[styles.filterChip, filter === f.key && styles.filterChipActive]} onPress={() => setFilter(f.key)}>
                <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                  {f.label}
                  {f.key === 'tqs' ? ` (${tqsBills.length})` : f.key === 'ra' ? ` (${raBills.length})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Bills table */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="receipt-text-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>
                {filter === 'all' ? 'All Bills' : filter === 'tqs' ? 'TQS Bills' : filter === 'ra' ? 'SC Bills' : `${filter} Bills`}
              </Text>
              <Text style={styles.sectionSub}>{filtered.length} BILLS</Text>
            </View>

            <View style={styles.tableHead}>
              <Text style={[styles.thCell, { flex: 2 }]}>BILL NO.</Text>
              <Text style={[styles.thCell, { flex: 2 }]}>VENDOR / SC</Text>
              <Text style={[styles.thCell, { flex: 1.5, textAlign: 'center' }]}>STATUS</Text>
              <Text style={[styles.thCell, { flex: 1.2, textAlign: 'right' }]}>AMOUNT</Text>
            </View>

            {filtered.length === 0 ? (
              <EmptyState icon="receipt" title="No bills" />
            ) : (
              filtered.slice().reverse().map((item, i) => {
                const sc    = STATUS_COLOR[item.workflow_status] || { bg: '#f1f5f9', text: '#475569' };
                const label = item.bill_type === 'ra'
                  ? (RA_STATUS_LABEL[item.workflow_status] ?? item.workflow_status ?? '—')
                  : (TQS_STAGES.find(s => s.key === item.workflow_status)?.label ?? item.workflow_status ?? '—');
                const billNo = (item.bill_number || item.inv_number || `BILL-${item.id}`).toUpperCase();
                const destination = item.bill_type === 'ra' ? 'RABillDetail' : 'BillDetail';
                return (
                  <TouchableOpacity
                    key={`${item.bill_type}-${item.id}`}
                    style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}
                    onPress={() => navigation.navigate(destination, { id: item.id })}
                  >
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TypeBadge type={item.bill_type} />
                      <Text style={styles.tdBillNo} numberOfLines={1}>{billNo}</Text>
                    </View>
                    <Text style={[styles.tdVendor, { flex: 2 }]} numberOfLines={1}>
                      {(item.vendor_name || '').toUpperCase() || '—'}
                    </Text>
                    <View style={{ flex: 1.5, alignItems: 'center' }}>
                      <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.badgeText, { color: sc.text }]} numberOfLines={1}>{label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.tdAmt, { flex: 1.2 }]}>
                      {money(item.total_amount || item.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: theme.colors.background,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  headerSub:   { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },

  content: { paddingBottom: 40 },

  kpiRow: { gap: 10, paddingHorizontal: 16, paddingBottom: 4, paddingTop: 4 },
  kpiCard: {
    width: 148, borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  kpiTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kpiLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  kpiValue: { fontSize: 24, fontWeight: '900', color: '#fff' },
  kpiSub:   { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 3 },

  section: {
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: theme.colors.card, borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle:  { flex: 1, fontSize: 13, fontWeight: '700', color: theme.colors.text },
  sectionSub:    { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600' },

  pipelineRow:       { gap: 0, paddingBottom: 6 },
  stageBubbleWrap:   { alignItems: 'center', width: 50 },
  stageBubble:       { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  stageBubbleCount:  { fontSize: 14, fontWeight: '800' },
  stageLabel:        { fontSize: 9, color: '#94a3b8', marginTop: 4, textAlign: 'center', fontWeight: '600' },
  pipelineConnector: { width: 12, height: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 18 },

  pipelineSummary:      { flexDirection: 'row' },
  pipelineSummaryBox:   { flex: 1, alignItems: 'center', paddingVertical: 4 },
  pipelineSummaryValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  pipelineSummaryLabel: { fontSize: 10, fontWeight: '600', marginTop: 2, color: theme.colors.muted },

  filterRow:            { gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 },
  filterChip:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  filterChipActive:     { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterChipText:       { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  filterChipTextActive: { color: '#fff' },

  typeBadge:       { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginRight: 2 },
  typeBadgeTQS:    { backgroundColor: '#DBEAFE' },
  typeBadgeSC:     { backgroundColor: '#EDE9FE' },
  typeBadgeText:   { fontSize: 8, fontWeight: '800' },
  typeBadgeTextTQS:{ color: '#1D4ED8' },
  typeBadgeTextSC: { color: '#6D28D9' },

  tableHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border, marginBottom: 2 },
  thCell:    { fontSize: 9, fontWeight: '700', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  tableRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tableRowAlt: { backgroundColor: theme.colors.surface },
  tdBillNo:  { fontSize: 11, fontWeight: '700', color: theme.colors.primary, flexShrink: 1 },
  tdVendor:  { fontSize: 11, color: theme.colors.text, fontWeight: '500' },
  tdAmt:     { fontSize: 11, fontWeight: '700', color: theme.colors.text, textAlign: 'right', fontVariant: ['tabular-nums'] },
  badge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 9, fontWeight: '700' },
});
