import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { projectDashboardAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import Card from '../components/Card';
import { theme } from '../theme';

const QUICK_LINKS = [
  { label: 'Approvals',     icon: 'check-decagram-outline', screen: 'Approvals', color: '#2563EB' },
  { label: 'Stores',        icon: 'warehouse',               screen: 'Stores',    color: '#059669' },
  { label: 'IGN',           icon: 'clipboard-check-outline', screen: 'IGN',       color: '#7C3AED' },
  { label: 'Material Req.', icon: 'clipboard-list-outline',  screen: 'MaterialRequest', color: '#EA580C' },
  { label: 'ESS Portal',    icon: 'account-circle-outline',  screen: 'ESS',       color: '#0891B2' },
  { label: 'Bills',         icon: 'receipt',                 screen: 'Bills',     color: '#DB2777' },
];

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { user, selectedProject, changeProject } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-kpis', selectedProject?.id],
    queryFn: () => projectDashboardAPI.get(selectedProject.id).then(r => r.data ?? {}),
    enabled: !!selectedProject?.id,
  });

  const boq = data?.boq || {};
  const billing = data?.billing || {};
  const workers = data?.workers || {};
  const incidents = data?.incidents || {};

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Hi, {user?.name || user?.full_name || 'there'} 👋</Text>
            <TouchableOpacity onPress={changeProject} style={styles.projectPill}>
              <MaterialCommunityIcons name="office-building-outline" size={13} color={theme.colors.primary} />
              <Text style={styles.projectText} numberOfLines={1}>{selectedProject?.name || 'Select project'}</Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{boq.items ?? '—'}</Text>
            <Text style={styles.kpiLabel}>BOQ Items</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiValue}>₹{Number(billing.certified || 0).toLocaleString('en-IN')}</Text>
            <Text style={styles.kpiLabel}>Certified Billing</Text>
          </Card>
        </View>
        <View style={styles.kpiRow}>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{workers.total ?? '—'}</Text>
            <Text style={styles.kpiLabel}>Active Workers</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={[styles.kpiValue, Number(incidents.open) > 0 && styles.kpiWarn]}>{incidents.open ?? '—'}</Text>
            <Text style={styles.kpiLabel}>Open Incidents</Text>
          </Card>
        </View>

        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.grid}>
          {QUICK_LINKS.map(item => (
            <TouchableOpacity
              key={item.label}
              style={styles.gridItem}
              onPress={() => navigation.navigate(item.screen)}
            >
              <View style={[styles.gridIcon, { backgroundColor: `${item.color}1A` }]}>
                <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
              </View>
              <Text style={styles.gridLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', padding: theme.spacing.md, paddingTop: theme.spacing.lg, alignItems: 'flex-start' },
  greeting: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  projectPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    backgroundColor: '#EFF6FF', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    maxWidth: 260,
  },
  projectText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary, flexShrink: 1 },
  kpiRow: { flexDirection: 'row', gap: 10, paddingHorizontal: theme.spacing.md, marginBottom: 10 },
  kpiCard: { flex: 1 },
  kpiValue: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  kpiWarn: { color: theme.colors.warning },
  kpiLabel: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, paddingHorizontal: theme.spacing.md, marginTop: 18, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.md, gap: 12, paddingBottom: 24 },
  gridItem: { width: '30%', alignItems: 'center', gap: 8 },
  gridIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary, textAlign: 'center' },
});
