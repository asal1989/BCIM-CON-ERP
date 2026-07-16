import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { incidentAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

const CLOSE_ROLES = ['super_admin', 'admin', 'hse_officer', 'project_manager'];

const SEVERITY_COLORS = {
  critical: '#DC2626',
  high:     '#EA580C',
  medium:   '#D97706',
  low:      '#16A34A',
};

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function IncidentDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: incident, isLoading, isError, refetch } = useQuery({
    queryKey: ['incident-detail', id],
    queryFn: () => incidentAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['incident-detail', id] });
    qc.invalidateQueries({ queryKey: ['incidents-list'] });
  };

  const closeMut = useMutation({
    mutationFn: () => incidentAPI.close(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not close incident'),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Incident" showBack />
        <ErrorState message="Couldn't load incident" onRetry={refetch} />
      </Screen>
    );
  }

  const status   = incident?.status || '';
  const role     = user?.role || '';
  const actions  = incident?.corrective_actions || [];
  const sevColor = SEVERITY_COLORS[(incident?.severity || '').toLowerCase()] || theme.colors.muted;

  return (
    <Screen>
      <ScreenHeader
        title={incident?.incident_number || `Incident #${id}`}
        subtitle={incident?.project_name}
        showBack
        right={incident && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : incident ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          {incident.severity && (
            <View style={[styles.severityBar, { backgroundColor: sevColor }]}>
              <Text style={styles.severityText}>{incident.severity.toUpperCase()} SEVERITY</Text>
            </View>
          )}

          <Card>
            {incident.incident_date ? <MetaRow label="Date"        value={dayjs(incident.incident_date).format('DD MMM YYYY')} /> : null}
            {incident.time          ? <MetaRow label="Time"        value={incident.time} /> : null}
            {incident.location      ? <MetaRow label="Location"    value={incident.location} /> : null}
            {incident.incident_type ? <MetaRow label="Type"        value={incident.incident_type} /> : null}
            {incident.description   ? <MetaRow label="Description" value={incident.description} /> : null}
            {incident.persons_involved ? <MetaRow label="Persons Involved" value={incident.persons_involved} /> : null}
            {incident.reported_by_name ? <MetaRow label="Reported By"     value={incident.reported_by_name} /> : null}
            {incident.investigated_by  ? <MetaRow label="Investigated By" value={incident.investigated_by} /> : null}
            {incident.root_cause    ? <MetaRow label="Root Cause"  value={incident.root_cause} /> : null}
            {incident.closed_at     ? <MetaRow label="Closed At"   value={dayjs(incident.closed_at).format('DD MMM YYYY') } last /> : null}
          </Card>

          {actions.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Corrective Actions ({actions.length})</Text>
              {actions.map((a, i) => (
                <View key={a.id ?? i} style={[styles.actRow, i < actions.length - 1 && styles.actBorder]}>
                  <Text style={styles.actDesc}>{a.action || a.description}</Text>
                  <View style={styles.actMeta}>
                    {a.responsible_person ? <Text style={styles.actDetail}>By: {a.responsible_person}</Text> : null}
                    {a.due_date ? <Text style={styles.actDetail}>Due: {dayjs(a.due_date).format('DD MMM YYYY')}</Text> : null}
                    {a.status   ? <StatusBadge status={a.status} /> : null}
                  </View>
                </View>
              ))}
            </Card>
          )}

          {status !== 'closed' && CLOSE_ROLES.includes(role) && (
            <Button
              title="Close Incident"
              variant="outline"
              onPress={() => Alert.alert('Close Incident', 'Mark this incident as closed?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Close', style: 'destructive', onPress: () => closeMut.mutate() },
              ])}
              loading={closeMut.isPending}
            />
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  severityBar: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  severityText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  actRow: { paddingVertical: 10 },
  actBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  actDesc: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  actMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, alignItems: 'center' },
  actDetail: { fontSize: 11, color: theme.colors.muted },
});
