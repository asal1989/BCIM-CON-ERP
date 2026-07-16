import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { qualityAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

const APPROVE_ROLES = ['super_admin', 'admin', 'managing_director', 'director', 'project_manager'];

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function ITPDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: itp, isLoading, isError, refetch } = useQuery({
    queryKey: ['itp-detail', id],
    queryFn: () => qualityAPI.itpDetail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['itp-detail', id] });
    qc.invalidateQueries({ queryKey: ['quality-itp-list'] });
  };

  const approveMut = useMutation({
    mutationFn: () => qualityAPI.itpApprove(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not approve'),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="ITP" showBack />
        <ErrorState message="Couldn't load ITP" onRetry={refetch} />
      </Screen>
    );
  }

  const status = itp?.status || '';
  const role   = user?.role || '';
  const activities = itp?.activities || [];

  return (
    <Screen>
      <ScreenHeader
        title={itp?.itp_number || itp?.title || `ITP-${id}`}
        subtitle={itp?.project_name}
        showBack
        right={itp && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : itp ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>
          <Card>
            {itp.title         ? <MetaRow label="Title"       value={itp.title} /> : null}
            {itp.activity_name ? <MetaRow label="Activity"    value={itp.activity_name} /> : null}
            {itp.description   ? <MetaRow label="Description" value={itp.description} /> : null}
            {itp.created_at    ? <MetaRow label="Created"     value={dayjs(itp.created_at).format('DD MMM YYYY')} /> : null}
            {itp.approved_by_name ? <MetaRow label="Approved By" value={itp.approved_by_name} /> : null}
            {itp.remarks       ? <MetaRow label="Remarks"     value={itp.remarks} last /> : null}
          </Card>

          {activities.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Activities ({activities.length})</Text>
              {activities.map((act, i) => (
                <View key={act.id ?? i} style={[styles.actRow, i < activities.length - 1 && styles.actBorder]}>
                  <Text style={styles.actName}>{act.activity_name || act.description}</Text>
                  <View style={styles.actMeta}>
                    {act.acceptance_criteria ? <Text style={styles.actDetail}>{act.acceptance_criteria}</Text> : null}
                    {act.frequency          ? <Text style={styles.actDetail}>Freq: {act.frequency}</Text> : null}
                    {act.responsibility     ? <Text style={styles.actDetail}>By: {act.responsibility}</Text> : null}
                  </View>
                </View>
              ))}
            </Card>
          )}

          {status === 'pending' && APPROVE_ROLES.includes(role) && (
            <Button
              title="Approve ITP"
              onPress={() => Alert.alert('Approve ITP', 'Approve this Inspection Test Plan?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Approve', onPress: () => approveMut.mutate() },
              ])}
              loading={approveMut.isPending}
            />
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  actRow: { paddingVertical: 10 },
  actBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  actName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  actMeta: { marginTop: 4, gap: 2 },
  actDetail: { fontSize: 11, color: theme.colors.muted },
});
