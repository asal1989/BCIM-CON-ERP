import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { essAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { theme } from '../theme';

const TABS = ['Summary', 'Attendance', 'Leave', 'Payslips'];

export default function ESSScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const [tab, setTab] = useState('Summary');

  const { data: summary } = useQuery({
    queryKey: ['ess-summary'],
    queryFn: () => essAPI.summary().then(r => r.data?.data ?? r.data ?? {}),
  });
  const { data: attendance } = useQuery({
    queryKey: ['ess-attendance'],
    queryFn: () => essAPI.attendance().then(r => r.data?.data ?? r.data ?? []),
    enabled: tab === 'Attendance',
  });
  const { data: leaveBalances } = useQuery({
    queryKey: ['ess-leave-balances'],
    queryFn: () => essAPI.leaveBalances().then(r => r.data?.data ?? r.data ?? []),
    enabled: tab === 'Leave' || tab === 'Summary',
  });
  const { data: leaveRequests } = useQuery({
    queryKey: ['ess-leave-requests'],
    queryFn: () => essAPI.leaveRequests().then(r => r.data?.data ?? r.data ?? []),
    enabled: tab === 'Leave',
  });
  const { data: payslips } = useQuery({
    queryKey: ['ess-payslips'],
    queryFn: () => essAPI.payslips().then(r => r.data?.data ?? r.data ?? []),
    enabled: tab === 'Payslips',
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => essAPI.cancelLeave(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ess-leave-requests'] }),
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not cancel request'),
  });

  const confirmCancel = (req) => {
    Alert.alert('Cancel leave request?', `${req.leave_type_name} — ${req.from_date} to ${req.to_date}`, [
      { text: 'No', style: 'cancel' },
      { text: 'Cancel Request', style: 'destructive', onPress: () => cancelMutation.mutate(req.id) },
    ]);
  };

  const totalBalance = (leaveBalances || []).reduce((s, b) => s + Number(b.closing_balance || 0), 0);

  return (
    <Screen>
      <ScreenHeader title="ESS Portal" subtitle="Employee Self Service" />
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10 }}>
        {tab === 'Summary' && (
          <View style={styles.kpiRow}>
            <Card style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{summary?.present_days ?? '—'}</Text>
              <Text style={styles.kpiLabel}>Present Days</Text>
            </Card>
            <Card style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{totalBalance || summary?.leave_balance || '—'}</Text>
              <Text style={styles.kpiLabel}>Leave Balance</Text>
            </Card>
          </View>
        )}

        {tab === 'Attendance' && (
          <>
            <TouchableOpacity style={styles.applyBtn} onPress={() => navigation.navigate('AttendanceCorrection')}>
              <MaterialCommunityIcons name="pencil-outline" size={16} color="#fff" />
              <Text style={styles.applyBtnText}>Request Correction</Text>
            </TouchableOpacity>
            {(attendance || []).length === 0
              ? <EmptyState icon="calendar-blank-outline" title="No attendance records" />
              : attendance.map((a, i) => (
                <Card key={i} style={styles.listRow}>
                  <MaterialCommunityIcons name="calendar-check-outline" size={18} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{a.date}</Text>
                    <Text style={styles.rowSub}>{a.check_in || '—'} – {a.check_out || '—'}</Text>
                  </View>
                  <Text style={[styles.rowStatus, a.status === 'present' ? styles.statusOk : styles.statusWarn]}>{a.status}</Text>
                </Card>
              ))}
          </>
        )}

        {tab === 'Leave' && (
          <>
            <TouchableOpacity style={styles.applyBtn} onPress={() => navigation.navigate('ApplyLeave')}>
              <MaterialCommunityIcons name="plus" size={16} color="#fff" />
              <Text style={styles.applyBtnText}>Apply Leave</Text>
            </TouchableOpacity>

            <Text style={styles.subheading}>Balances</Text>
            <View style={styles.balanceRow}>
              {(leaveBalances || []).map((b, i) => (
                <Card key={i} style={styles.balanceCard}>
                  <Text style={styles.balanceValue}>{b.closing_balance}</Text>
                  <Text style={styles.balanceLabel} numberOfLines={1}>{b.leave_type_name}</Text>
                </Card>
              ))}
            </View>

            <Text style={styles.subheading}>Requests</Text>
            {(leaveRequests || []).length === 0
              ? <EmptyState icon="beach" title="No leave requests yet" />
              : leaveRequests.map((r) => (
                <Card key={r.id} style={{ marginBottom: 0 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle}>{r.leave_type_name}</Text>
                    <StatusBadge status={r.status} />
                  </View>
                  <Text style={styles.rowSub}>{r.from_date} → {r.to_date} · {r.days} day{r.days !== 1 ? 's' : ''}</Text>
                  {r.reason ? <Text style={styles.reason}>{r.reason}</Text> : null}
                  {r.status === 'pending' && (
                    <TouchableOpacity onPress={() => confirmCancel(r)} style={styles.cancelLink}>
                      <Text style={styles.cancelLinkText}>Cancel request</Text>
                    </TouchableOpacity>
                  )}
                </Card>
              ))}
          </>
        )}

        {tab === 'Payslips' && (
          (payslips || []).length === 0
            ? <EmptyState icon="file-document-outline" title="No payslips available" />
            : payslips.map((p, i) => (
              <TouchableOpacity key={i} onPress={() => navigation.navigate('PayslipDetail', { id: p.id })}>
                <Card style={styles.listRow}>
                  <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{p.month} {p.year}</Text>
                    <Text style={styles.rowSub}>Net Pay: ₹{Number(p.net_pay || 0).toLocaleString('en-IN')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.muted} />
                </Card>
              </TouchableOpacity>
            ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: theme.spacing.md, gap: 8, paddingVertical: 10, backgroundColor: theme.colors.card, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.surface },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: { flex: 1 },
  kpiValue: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  kpiLabel: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  rowSub: { fontSize: 12, color: theme.colors.muted, marginTop: 4 },
  rowStatus: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, textTransform: 'capitalize' },
  statusOk: { color: theme.colors.success },
  statusWarn: { color: theme.colors.warning },
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.primary, height: 42, borderRadius: theme.radius.md,
  },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  subheading: { fontSize: 12, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', marginTop: 8 },
  balanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  balanceCard: { width: '31%', alignItems: 'center' },
  balanceValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  balanceLabel: { fontSize: 10, color: theme.colors.muted, marginTop: 2, textAlign: 'center' },
  reason: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  cancelLink: { marginTop: 10 },
  cancelLinkText: { fontSize: 12, fontWeight: '700', color: theme.colors.danger },
});
