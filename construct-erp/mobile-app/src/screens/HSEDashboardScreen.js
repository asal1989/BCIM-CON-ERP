import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { incidentAPI, permitAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import { theme } from '../theme';
import { useNavigation } from '@react-navigation/native';

const SEV_STYLE = {
  critical: { bg: '#fee2e2', text: '#991b1b' },
  high:     { bg: '#ffedd5', text: '#9a3412' },
  medium:   { bg: '#fef3c7', text: '#92400e' },
  low:      { bg: '#dbeafe', text: '#1e40af' },
};
const PTW_STYLE = {
  pending:  { bg: '#fef3c7', text: '#92400e' },
  approved: { bg: '#d1fae5', text: '#065f46' },
  active:   { bg: '#dbeafe', text: '#1e40af' },
  expired:  { bg: '#fee2e2', text: '#991b1b' },
  closed:   { bg: '#f1f5f9', text: '#475569' },
};

function KpiCard({ icon, label, value, color }) {
  const bg = `${color}22`;
  return (
    <View style={[styles.kpiCard, { backgroundColor: bg }]}>
      <MaterialCommunityIcons name={icon} size={22} color={color} />
      <Text style={[styles.kpiValue, { color }]}>{value ?? '—'}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function HSEDashboardScreen() {
  const { selectedProject } = useAuth();
  const navigation = useNavigation();
  const projectId = selectedProject?.id;

  const { data: incidents = [], isError: errI } = useQuery({
    queryKey: ['hse-dash-incidents', projectId],
    queryFn: () => incidentAPI.list(projectId).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60_000,
  });

  const { data: permits = [] } = useQuery({
    queryKey: ['hse-dash-permits', projectId],
    queryFn: () => permitAPI.list(projectId).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60_000,
  });

  const now = dayjs();
  const openIncidents = incidents.filter(i => !['closed', 'resolved'].includes(i.status));
  const critical      = incidents.filter(i => ['critical', 'high'].includes(i.severity));
  const pendingPTW    = permits.filter(p => p.status === 'pending');
  const expiringPTW   = permits.filter(p =>
    p.valid_to && dayjs(p.valid_to).diff(now, 'hour') <= 48 && dayjs(p.valid_to).isAfter(now)
  );

  const sorted = [...incidents].sort((a, b) =>
    dayjs(b.incident_date || b.created_at).diff(dayjs(a.incident_date || a.created_at))
  );
  const lastIncident = sorted[0];
  const daysSince = lastIncident
    ? now.diff(dayjs(lastIncident.incident_date || lastIncident.created_at), 'day')
    : null;

  return (
    <Screen>
      <ScreenHeader title="HSE Dashboard" subtitle={`${selectedProject?.name || 'All Projects'} · Safety overview`} showBack />
      <ScrollView contentContainerStyle={styles.content}>

        {/* KPIs — 2×2 grid */}
        <View style={styles.kpiGrid}>
          <KpiCard icon="alert-circle-outline"  label="Open Incidents"         value={openIncidents.length} color="#ef4444" />
          <KpiCard icon="shield-outline"         label="PTW Pending Approval"  value={pendingPTW.length}    color="#f59e0b" />
          <KpiCard icon="clock-check-outline"   label="Days Since Last Incident" value={daysSince ?? 'N/A'} color="#10b981" />
          <KpiCard icon="timer-alert-outline"   label="Expiring in 48hrs"      value={expiringPTW.length}   color="#3b82f6" />
        </View>

        {/* Critical incidents banner */}
        {critical.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
            <MaterialCommunityIcons name="alert-triangle" size={16} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: '#991b1b' }]}>
                {critical.length} Critical/High Severity Incident{critical.length !== 1 ? 's' : ''} Open
              </Text>
              <Text style={[styles.bannerSub, { color: '#b91c1c' }]}>
                Immediate attention required. Escalate if not yet investigated.
              </Text>
            </View>
          </View>
        )}

        {/* Expiring permits banner */}
        {expiringPTW.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}>
            <MaterialCommunityIcons name="timer-alert-outline" size={15} color="#d97706" />
            <Text style={[styles.bannerTitle, { color: '#92400e' }]}>
              {expiringPTW.length} permit{expiringPTW.length !== 1 ? 's' : ''} expiring within 48 hours
            </Text>
          </View>
        )}

        {/* Open Incidents */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#ef4444" />
            <Text style={styles.cardTitle}>Open Incidents ({openIncidents.length})</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Incidents')}>
              <Text style={styles.viewAll}>All →</Text>
            </TouchableOpacity>
          </View>
          {errI ? <Text style={styles.empty}>Could not load incidents. Pull down to retry.</Text>
          : openIncidents.length === 0 ? (
            <View style={styles.safeRow}>
              <MaterialCommunityIcons name="shield-check" size={24} color="#059669" />
              <Text style={styles.safeText}>No open incidents — site is safe ✅</Text>
            </View>
          ) : openIncidents.slice(0, 8).map((inc, i) => {
            const sv = SEV_STYLE[inc.severity] || SEV_STYLE.low;
            const dt = inc.incident_date ? dayjs(inc.incident_date).format('DD MMM') : '—';
            return (
              <View key={inc.id || i} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{inc.title || inc.description || '—'}</Text>
                  <Text style={styles.rowSub}>{inc.incident_number || '—'}  ·  {dt}</Text>
                </View>
                <View style={{ gap: 4, alignItems: 'flex-end' }}>
                  <View style={[styles.badge, { backgroundColor: sv.bg }]}>
                    <Text style={[styles.badgeText, { color: sv.text }]}>{inc.severity || 'low'}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: inc.status === 'closed' ? '#f1f5f9' : '#fee2e2' }]}>
                    <Text style={[styles.badgeText, { color: inc.status === 'closed' ? '#475569' : '#991b1b' }]}>
                      {inc.status || 'open'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>

        {/* Permits to Work */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="shield-outline" size={14} color="#f59e0b" />
            <Text style={styles.cardTitle}>Permits to Work ({permits.length})</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Permits')}>
              <Text style={styles.viewAll}>All →</Text>
            </TouchableOpacity>
          </View>
          {permits.length === 0
            ? <Text style={styles.empty}>No permits found</Text>
            : [...pendingPTW, ...expiringPTW.filter(p => !pendingPTW.includes(p)),
                ...permits.filter(p => !pendingPTW.includes(p) && !expiringPTW.includes(p))]
              .slice(0, 8)
              .map((p, i) => {
                const ps = PTW_STYLE[p.status] || PTW_STYLE.pending;
                const exp = p.valid_to ? dayjs(p.valid_to).format('DD MMM HH:mm') : '—';
                return (
                  <View key={p.id || i} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{p.work_type || p.description || '—'}</Text>
                      <Text style={styles.rowSub}>{p.permit_number || '—'}  ·  Expires: {exp}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: ps.bg }]}>
                      <Text style={[styles.badgeText, { color: ps.text }]}>{p.status}</Text>
                    </View>
                  </View>
                );
              })
          }
        </Card>

        {/* Quick Links */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { marginBottom: 10 }]}>Quick Links</Text>
          <View style={styles.quickLinks}>
            {[
              { label: 'Incidents',    screen: 'Incidents', icon: 'alert-circle-outline' },
              { label: 'Permits (PTW)', screen: 'Permits',  icon: 'shield-outline' },
              { label: 'PPE Tracker',  screen: 'PPE',       icon: 'hard-hat' },
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
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: {
    width: '46%', flexGrow: 1, borderRadius: 14, padding: 14, gap: 4, alignItems: 'flex-start',
  },
  kpiValue: { fontSize: 28, fontWeight: '800', marginTop: 6 },
  kpiLabel: { fontSize: 11, color: '#64748b', lineHeight: 14 },
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  bannerTitle: { fontSize: 13, fontWeight: '600' },
  bannerSub: { fontSize: 11, marginTop: 2 },
  card: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1e293b' },
  viewAll: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
  safeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  safeText: { fontSize: 14, color: '#059669', fontWeight: '500' },
  listRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  rowName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  rowSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  empty: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f0f4ff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  quickLinkText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
});
