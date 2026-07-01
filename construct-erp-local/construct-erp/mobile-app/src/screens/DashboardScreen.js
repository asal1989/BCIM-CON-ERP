import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../api/client';
import { theme } from '../theme';

function inr(n) {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

function KPICard({ label, value, color, sub }) {
  return (
    <View style={[styles.kpi, { borderTopColor: color, borderTopWidth: 3 }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

export default function DashboardScreen() {
  const { user, selectedProject, changeProject } = useAuth();
  const insets = useSafeAreaInsets();
  const [kpis, setKpis]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const r = await dashboardAPI.kpis(selectedProject.id);
      setKpis(r.data?.data || r.data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [selectedProject.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.wrap}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.projectName} numberOfLines={1}>
            {selectedProject.project_code ? `${selectedProject.project_code} — ` : ''}{selectedProject.name}
          </Text>
          <Text style={styles.user}>Hi, {user?.name || user?.email}</Text>
        </View>
        <TouchableOpacity style={styles.switchBtn} onPress={changeProject}>
          <Text style={styles.switchText}>Switch ⇄</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={styles.body}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 50 }} />
        ) : (
          <>
            <Text style={styles.section}>Project Overview</Text>
            <View style={styles.kpiGrid}>
              <KPICard label="Contract Value"  value={inr(kpis?.contract_value)}  color="#2563EB" />
              <KPICard label="Billed to Date"  value={inr(kpis?.billed_amount)}   color="#10B981" />
              <KPICard label="Pending Bills"   value={String(kpis?.pending_bills  ?? '—')} color="#F59E0B" sub="awaiting approval" />
              <KPICard label="MR Requests"     value={String(kpis?.pending_mrs    ?? '—')} color="#8B5CF6" sub="open" />
              <KPICard label="Active WOs"      value={String(kpis?.active_work_orders ?? '—')} color="#0EA5E9" />
              <KPICard label="Today Manpower"  value={String(kpis?.today_manpower ?? '—')} color="#EC4899" />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:        { flex: 1, backgroundColor: theme.colors.bg },
  header:      {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  projectName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  user:        { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  switchBtn:   { backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  switchText:  { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
  body:        { padding: 16, paddingBottom: 32 },
  section:     { fontSize: 12, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  kpiGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi:         {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: theme.colors.border,
    width: '47%', flexGrow: 1,
  },
  kpiLabel:    { fontSize: 11, color: theme.colors.muted, marginBottom: 6 },
  kpiValue:    { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  kpiSub:      { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
});
