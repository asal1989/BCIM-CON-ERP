import React from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { projectDashboardAPI, approvalsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import Card from '../components/Card';
import AnimatedNumber from '../components/AnimatedNumber';
import FadeInView from '../components/FadeInView';
import { theme } from '../theme';

const QUICK_LINKS = [
  { label: 'Approvals',     icon: 'check-decagram-outline', screen: 'Approvals', color: '#2563EB' },
  { label: 'Stores',        icon: 'warehouse',               screen: 'Stores',    color: '#059669' },
  { label: 'IGN',           icon: 'clipboard-check-outline', screen: 'IGN',       color: '#7C3AED' },
  { label: 'Material Req.', icon: 'clipboard-list-outline',  screen: 'MaterialRequest', color: '#EA580C' },
  { label: 'ESS Portal',    icon: 'account-circle-outline',  screen: 'ESS',       color: '#0891B2' },
  { label: 'Bills',         icon: 'receipt',                 screen: 'Bills',     color: '#DB2777' },
  { label: 'BOQ Breakdown', icon: 'ruler-square',            screen: 'BOQ',       color: '#0369A1' },
  { label: 'Budget Control',icon: 'cash-multiple',           screen: 'BudgetControl', color: '#B45309' },
];

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { user, selectedProject, changeProject } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-kpis', selectedProject?.id],
    queryFn: () => projectDashboardAPI.get(selectedProject.id).then(r => r.data ?? {}),
    enabled: !!selectedProject?.id,
  });

  const { data: approvals, refetch: refetchApprovals } = useQuery({
    queryKey: ['dashboard-approvals'],
    queryFn: () => approvalsAPI.pending().then(r => r.data ?? {}),
  });

  const boq = data?.boq || {};
  const billing = data?.billing || {};
  const workers = data?.workers || {};
  const incidents = data?.incidents || {};
  const lowStock = data?.low_stock_materials || [];
  const pendingApprovals = approvals?.total ?? 0;

  const onRefresh = () => { refetch(); refetchApprovals(); };

  const kpis = [
    { label: 'Pending Approvals', value: pendingApprovals, icon: 'check-decagram-outline', color: '#2563EB', screen: 'Approvals' },
    { label: 'BOQ Items',         value: boq.items || 0,   icon: 'ruler-square',            color: '#0891B2', screen: 'BOQ' },
    { label: 'Certified Billing', value: Number(billing.certified || 0), icon: 'receipt', color: '#059669', screen: 'RABills', money: true },
    { label: 'Active Workers',    value: workers.total || 0, icon: 'account-hard-hat',       color: '#7C3AED' },
    { label: 'Open Incidents',    value: incidents.open || 0, icon: 'alert-octagon-outline', color: '#DC2626', warn: true, screen: 'Incidents' },
    { label: 'Low Stock Items',   value: lowStock.length, icon: 'package-variant-closed',   color: '#EA580C', warn: lowStock.length > 0, screen: 'StoreLedger' },
  ];

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}>
        {/* Header banner */}
        <View style={styles.headerBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerDate}>{dayjs().format('dddd, DD MMMM')}</Text>
            <Text style={styles.greeting}>Hi, {user?.name || user?.full_name || 'there'} 👋</Text>
            <TouchableOpacity onPress={changeProject} style={styles.projectPill}>
              <MaterialCommunityIcons name="office-building-outline" size={13} color="#fff" />
              <Text style={styles.projectText} numberOfLines={1}>{selectedProject?.name || 'Select project'}</Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.headerLogoChip}>
            <Image source={require('../../assets/bcim-logo.png')} style={styles.headerLogo} resizeMode="contain" />
          </View>
        </View>

        {/* KPI grid */}
        <View style={styles.kpiGrid}>
          {kpis.map((kpi, i) => (
            <FadeInView key={kpi.label} index={i} style={styles.kpiWrap}>
              <TouchableOpacity
                activeOpacity={kpi.screen ? 0.7 : 1}
                onPress={() => kpi.screen && navigation.navigate(kpi.screen)}
              >
                <Card style={[styles.kpiCard, kpi.warn && kpi.value > 0 && styles.kpiCardWarn]}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: `${kpi.color}1A` }]}>
                    <MaterialCommunityIcons name={kpi.icon} size={18} color={kpi.color} />
                  </View>
                  {kpi.money ? (
                    <AnimatedNumber
                      value={kpi.value}
                      style={[styles.kpiValue, kpi.warn && kpi.value > 0 && styles.kpiValueWarn]}
                      formatter={(n) => `₹${n.toLocaleString('en-IN')}`}
                    />
                  ) : (
                    <AnimatedNumber
                      value={kpi.value}
                      style={[styles.kpiValue, kpi.warn && kpi.value > 0 && styles.kpiValueWarn]}
                    />
                  )}
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                </Card>
              </TouchableOpacity>
            </FadeInView>
          ))}
        </View>

        {/* Low stock alert strip */}
        {lowStock.length > 0 && (
          <FadeInView index={6} style={styles.alertStrip}>
            <MaterialCommunityIcons name="alert-outline" size={16} color={theme.colors.warning} />
            <Text style={styles.alertText} numberOfLines={1}>
              {lowStock.length} material{lowStock.length !== 1 ? 's' : ''} below minimum stock — {lowStock[0].material_name}{lowStock.length > 1 ? ` +${lowStock.length - 1} more` : ''}
            </Text>
          </FadeInView>
        )}

        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.grid}>
          {QUICK_LINKS.map((item, i) => (
            <FadeInView key={item.label} index={7 + i} style={styles.gridItem}>
              <TouchableOpacity style={styles.gridItemInner} onPress={() => navigation.navigate(item.screen)}>
                <View style={[styles.gridIcon, { backgroundColor: `${item.color}1A` }]}>
                  <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
                </View>
                <Text style={styles.gridLabel}>{item.label}</Text>
              </TouchableOpacity>
            </FadeInView>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBanner: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    backgroundColor: theme.colors.dark, padding: theme.spacing.md, paddingTop: theme.spacing.lg,
    paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  headerDate: { fontSize: 11, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  greeting: { fontSize: 21, fontWeight: '800', color: '#fff', marginTop: 4 },
  projectPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.14)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    maxWidth: 240,
  },
  projectText: { fontSize: 12, fontWeight: '600', color: '#fff', flexShrink: 1 },
  headerLogoChip: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  headerLogo: { width: 52, height: 24 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.md, marginTop: -14, gap: 10 },
  kpiWrap: { width: '47%' },
  kpiCard: { minHeight: 92 },
  kpiCardWarn: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  kpiIconWrap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiValue: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  kpiValueWarn: { color: theme.colors.danger },
  kpiLabel: { fontSize: 11, color: theme.colors.muted, marginTop: 3 },
  alertStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: theme.spacing.md, marginTop: 12,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: theme.radius.md, padding: 10,
  },
  alertText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#92400E' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, paddingHorizontal: theme.spacing.md, marginTop: 20, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.md, gap: 12, paddingBottom: 24 },
  gridItem: { width: '30%' },
  gridItemInner: { alignItems: 'center', gap: 8 },
  gridIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary, textAlign: 'center' },
});
