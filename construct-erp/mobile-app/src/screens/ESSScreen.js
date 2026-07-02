import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { essAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import AnimatedNumber from '../components/AnimatedNumber';
import FadeInView from '../components/FadeInView';
import { theme } from '../theme';

const TABS = [
  { key: 'Summary', icon: 'view-dashboard-outline' },
  { key: 'Attendance', icon: 'calendar-check-outline' },
  { key: 'Leave', icon: 'beach' },
  { key: 'Payslips', icon: 'file-document-outline' },
  { key: 'Documents', icon: 'folder-outline' },
];

const DAY_STATUS = {
  P: { bg: '#DCFCE7', text: '#15803D', label: 'P' },
  A: { bg: '#FEE2E2', text: '#B91C1C', label: 'A' },
  L: { bg: '#DBEAFE', text: '#1D4ED8', label: 'L' },
  HD: { bg: '#FEF3C7', text: '#B45309', label: 'HD' },
  WO: { bg: '#F1F5F9', text: '#64748B', label: 'WO' },
  H: { bg: '#EDE9FE', text: '#6D28D9', label: 'H' },
};
const DAY_STATUS_NAME = { P: 'Present', A: 'Absent', L: 'Leave', HD: 'Half Day', WO: 'Week Off', H: 'Holiday' };

function normalizeStatus(raw) {
  if (!raw) return null;
  const u = String(raw).toUpperCase();
  if (u === 'PRESENT') return 'P';
  if (u === 'ABSENT') return 'A';
  if (u === 'LEAVE') return 'L';
  if (u === 'HALF_DAY' || u === 'HD') return 'HD';
  if (u === 'WEEK_OFF' || u === 'WO' || u === 'WEEKOFF') return 'WO';
  if (u === 'HOLIDAY' || u === 'H') return 'H';
  return u.slice(0, 2);
}

const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ESSScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState('Summary');
  const now = dayjs();
  const [calYear, setCalYear] = useState(now.year());
  const [calMonth, setCalMonth] = useState(now.month());

  const { data: summary } = useQuery({
    queryKey: ['ess-summary'],
    queryFn: () => essAPI.summary().then(r => r.data?.data ?? r.data ?? {}),
  });
  const { data: attendance } = useQuery({
    queryKey: ['ess-attendance'],
    queryFn: () => essAPI.attendance().then(r => r.data?.data ?? r.data ?? []),
    enabled: tab === 'Attendance',
  });
  const { data: corrections } = useQuery({
    queryKey: ['ess-corrections'],
    queryFn: () => essAPI.attendanceCorrections().then(r => r.data?.data ?? r.data ?? []),
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
  const { data: documents } = useQuery({
    queryKey: ['ess-documents'],
    queryFn: () => essAPI.documents().then(r => r.data?.data ?? r.data ?? []),
    enabled: tab === 'Documents',
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
  const latestPayslip = (payslips || [])[0];

  const statusMap = useMemo(() => {
    const m = {};
    for (const row of (attendance || [])) {
      const d = String(row.attendance_date || row.date || '').slice(0, 10);
      if (d) m[d] = normalizeStatus(row.status);
    }
    return m;
  }, [attendance]);

  const calendarCells = useMemo(() => {
    const firstDay = dayjs(`${calYear}-${calMonth + 1}-01`).day();
    const daysInMonth = dayjs(`${calYear}-${calMonth + 1}-01`).daysInMonth();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calYear, calMonth]);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const fmtDay = (d) => `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const initial = (user?.name || user?.full_name || 'U').charAt(0).toUpperCase();

  return (
    <Screen>
      <ScrollView stickyHeaderIndices={[1]}>
        {/* Profile header */}
        <View style={styles.profileBanner}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name || user?.full_name || 'Employee'}</Text>
            <Text style={styles.profileMeta}>{user?.designation || user?.role || 'Employee'}{user?.employee_code ? ` · ${user.employee_code}` : ''}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('HRRequests')} style={styles.hrReqBtn}>
            <MaterialCommunityIcons name="account-question-outline" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Sticky tab bar */}
        <View style={styles.tabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {TABS.map(t => (
              <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
                <MaterialCommunityIcons name={t.icon} size={14} color={tab === t.key ? '#fff' : theme.colors.textSecondary} />
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.key}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={{ padding: theme.spacing.md, gap: 12 }}>
          {tab === 'Summary' && (
            <>
              <View style={styles.kpiGrid}>
                {[
                  { label: 'Present Days', value: summary?.present_days ?? summary?.present ?? 0, icon: 'calendar-check', color: '#059669' },
                  { label: 'Leave Balance', value: totalBalance || summary?.leave_balance || 0, icon: 'beach', color: '#0891B2' },
                  { label: 'Pending Leaves', value: summary?.pending_leaves ?? 0, icon: 'clock-outline', color: '#D97706', warn: true },
                  { label: 'Corrections', value: summary?.pending_corrections ?? 0, icon: 'pencil-outline', color: '#7C3AED', warn: true },
                ].map((kpi, i) => (
                  <FadeInView key={kpi.label} index={i} style={styles.kpiWrap}>
                    <Card style={styles.kpiCard}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: `${kpi.color}1A` }]}>
                        <MaterialCommunityIcons name={kpi.icon} size={16} color={kpi.color} />
                      </View>
                      <AnimatedNumber value={kpi.value} style={[styles.kpiValue, kpi.warn && kpi.value > 0 && styles.kpiValueWarn]} />
                      <Text style={styles.kpiLabel}>{kpi.label}</Text>
                    </Card>
                  </FadeInView>
                ))}
              </View>

              {latestPayslip && (
                <FadeInView index={4}>
                  <TouchableOpacity onPress={() => navigation.navigate('PayslipDetail', { id: latestPayslip.id })}>
                    <Card style={styles.payslipCard}>
                      <View style={styles.payslipTopRow}>
                        <Text style={styles.payslipLabel}>Payslip</Text>
                        <View style={styles.payslipArrowWrap}>
                          <MaterialCommunityIcons name="arrow-top-right" size={16} color="#059669" />
                        </View>
                      </View>
                      <View style={styles.payslipBodyRow}>
                        <View style={styles.payslipPigWrap}>
                          <MaterialCommunityIcons name="piggy-bank-outline" size={36} color="#F59E0B" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.payslipMonth}>{latestPayslip.month} {latestPayslip.year}</Text>
                          <Text style={styles.payslipDays}>{latestPayslip.paid_days ?? 30} paid days</Text>
                        </View>
                      </View>
                      <View style={styles.payslipDivider} />
                      <View style={styles.payslipStatsRow}>
                        <View>
                          <Text style={styles.payslipStatLabel}>Net Pay</Text>
                          <Text style={styles.payslipNet}>₹{Number(latestPayslip.net_pay || 0).toLocaleString('en-IN')}</Text>
                        </View>
                        <View style={styles.payslipDownloadWrap}>
                          <MaterialCommunityIcons name="tray-arrow-down" size={18} color={theme.colors.primary} />
                        </View>
                      </View>
                    </Card>
                  </TouchableOpacity>
                </FadeInView>
              )}
            </>
          )}

          {tab === 'Attendance' && (
            <>
              <Card>
                <View style={styles.calHeader}>
                  <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
                    <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.calTitle}>{dayjs(`${calYear}-${calMonth + 1}-01`).format('MMMM YYYY')}</Text>
                  <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
                <View style={styles.calDayHeaderRow}>
                  {DAYS_OF_WEEK.map((d, i) => <Text key={i} style={styles.calDayHeader}>{d}</Text>)}
                </View>
                <View style={styles.calGrid}>
                  {calendarCells.map((day, idx) => {
                    if (!day) return <View key={idx} style={styles.calCell} />;
                    const dateStr = fmtDay(day);
                    const status = statusMap[dateStr];
                    const style = status ? DAY_STATUS[status] : null;
                    const isToday = dateStr === now.format('YYYY-MM-DD');
                    return (
                      <View key={idx} style={[styles.calCell, isToday && styles.calCellToday]}>
                        <Text style={[styles.calDayNum, isToday && styles.calDayNumToday]}>{day}</Text>
                        {style ? (
                          <View style={[styles.calBadge, { backgroundColor: style.bg }]}>
                            <Text style={[styles.calBadgeText, { color: style.text }]}>{style.label}</Text>
                          </View>
                        ) : <View style={styles.calBadgeEmpty} />}
                      </View>
                    );
                  })}
                </View>
                <View style={styles.legendRow}>
                  {Object.entries(DAY_STATUS).map(([code, s]) => (
                    <View key={code} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: s.bg }]}><Text style={[styles.legendDotText, { color: s.text }]}>{s.label}</Text></View>
                      <Text style={styles.legendText}>{DAY_STATUS_NAME[code]}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              <TouchableOpacity style={styles.applyBtn} onPress={() => navigation.navigate('AttendanceCorrection')}>
                <MaterialCommunityIcons name="pencil-outline" size={16} color="#fff" />
                <Text style={styles.applyBtnText}>Request Correction</Text>
              </TouchableOpacity>

              {(corrections || []).length > 0 && (
                <>
                  <Text style={styles.subheading}>Correction Requests</Text>
                  {corrections.map((c, i) => (
                    <Card key={i}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowTitle}>{String(c.attendance_date || '').slice(0, 10)}</Text>
                        <StatusBadge status={c.status} />
                      </View>
                      <Text style={styles.rowSub}>Requested: {c.requested_status}</Text>
                      {c.reason ? <Text style={styles.reason}>{c.reason}</Text> : null}
                    </Card>
                  ))}
                </>
              )}
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
                  <FadeInView key={i} index={i} style={styles.balanceCardWrap}>
                    <Card style={styles.balanceCard}>
                      <Text style={styles.balanceValue}>{b.closing_balance}</Text>
                      <Text style={styles.balanceLabel} numberOfLines={1}>{b.leave_type_name}</Text>
                    </Card>
                  </FadeInView>
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
                <FadeInView key={i} index={i}>
                  <TouchableOpacity onPress={() => navigation.navigate('PayslipDetail', { id: p.id })}>
                    <Card style={styles.listRow}>
                      <View style={styles.payslipIconWrap}>
                        <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{p.month} {p.year}</Text>
                        <Text style={styles.rowSub}>Net Pay: ₹{Number(p.net_pay || 0).toLocaleString('en-IN')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.muted} />
                    </Card>
                  </TouchableOpacity>
                </FadeInView>
              ))
          )}

          {tab === 'Documents' && (
            (documents || []).length === 0
              ? <EmptyState icon="folder-outline" title="No documents uploaded" />
              : documents.map((d, i) => (
                <Card key={i} style={styles.listRow}>
                  <View style={styles.payslipIconWrap}>
                    <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{d.doc_name || d.doc_type}</Text>
                    <Text style={styles.rowSub}>{d.doc_type}{d.uploaded_at ? ` · ${String(d.uploaded_at).slice(0, 10)}` : ''}</Text>
                  </View>
                </Card>
              ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.colors.dark, padding: theme.spacing.md, paddingTop: theme.spacing.lg,
    paddingBottom: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  profileName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  profileMeta: { fontSize: 12, color: '#94A3B8', marginTop: 2, textTransform: 'capitalize' },
  hrReqBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  tabsWrap: { backgroundColor: theme.colors.card, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tabs: { paddingHorizontal: theme.spacing.md, gap: 8, paddingVertical: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.surface },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiWrap: { width: '47%' },
  kpiCard: { minHeight: 90 },
  kpiIconWrap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiValue: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  kpiValueWarn: { color: theme.colors.warning },
  kpiLabel: { fontSize: 11, color: theme.colors.muted, marginTop: 3 },
  payslipCard: { backgroundColor: '#fff', borderColor: theme.colors.border, borderRadius: 20, padding: 18 },
  payslipTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payslipLabel: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  payslipArrowWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  payslipBodyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  payslipPigWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  payslipMonth: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  payslipDays: { fontSize: 12, color: theme.colors.muted, marginTop: 3 },
  payslipDivider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 14 },
  payslipStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payslipStatLabel: { fontSize: 11, color: theme.colors.muted, fontWeight: '600' },
  payslipNet: { fontSize: 24, fontWeight: '800', color: '#059669', marginTop: 4 },
  payslipDownloadWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  payslipIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calNavBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
  calTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  calDayHeaderRow: { flexDirection: 'row', marginTop: 14 },
  calDayHeader: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: theme.colors.muted },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  calCell: { width: '14.28%', alignItems: 'center', paddingVertical: 6 },
  calCellToday: { backgroundColor: '#EFF6FF', borderRadius: 8 },
  calDayNum: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
  calDayNumToday: { color: theme.colors.primary, fontWeight: '800' },
  calBadge: { marginTop: 3, paddingHorizontal: 5, borderRadius: 4 },
  calBadgeText: { fontSize: 9, fontWeight: '800' },
  calBadgeEmpty: { marginTop: 3, height: 14 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 20, height: 16, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  legendDotText: { fontSize: 9, fontWeight: '800' },
  legendText: { fontSize: 10, color: theme.colors.muted, fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  rowSub: { fontSize: 12, color: theme.colors.muted, marginTop: 4 },
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.primary, height: 44, borderRadius: theme.radius.md,
  },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  subheading: { fontSize: 12, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', marginTop: 4 },
  balanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  balanceCardWrap: { width: '31%' },
  balanceCard: { alignItems: 'center' },
  balanceValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  balanceLabel: { fontSize: 10, color: theme.colors.muted, marginTop: 2, textAlign: 'center' },
  reason: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  cancelLink: { marginTop: 10 },
  cancelLinkText: { fontSize: 12, fontWeight: '700', color: theme.colors.danger },
});
