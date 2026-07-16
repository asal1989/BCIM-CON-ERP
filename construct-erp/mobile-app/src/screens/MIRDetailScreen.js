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

const INSPECT_ROLES = ['super_admin', 'admin', 'quality_engineer', 'site_engineer', 'project_manager'];
const APPROVE_ROLES = ['super_admin', 'admin', 'project_manager', 'site_engineer', 'quality_engineer', 'director', 'md'];

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function MIRDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: mir, isLoading, isError, refetch } = useQuery({
    queryKey: ['mir-detail', id],
    queryFn: () => qualityAPI.mirDetail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mir-detail', id] });
    qc.invalidateQueries({ queryKey: ['quality-mir-list'] });
  };

  const inspectMut = useMutation({ mutationFn: () => qualityAPI.mirStartInspection(id), onSuccess: invalidate, onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not start inspection') });
  const approveMut = useMutation({ mutationFn: () => qualityAPI.mirApprove(id),         onSuccess: invalidate, onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not approve') });
  const rejectMut  = useMutation({ mutationFn: () => qualityAPI.mirReject(id, 'Rejected via mobile'), onSuccess: invalidate, onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not reject') });

  const confirm = (title, msg, onPress) => Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', onPress },
  ]);

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="MIR" showBack />
        <ErrorState message="Couldn't load MIR" onRetry={refetch} />
      </Screen>
    );
  }

  const status   = mir?.status || '';
  const role     = user?.role || '';
  const labTests = mir?.lab_tests || [];
  const mtcs     = mir?.mtcs || [];

  return (
    <Screen>
      <ScreenHeader
        title={mir?.mir_number || `MIR-${id}`}
        subtitle={mir?.project_name}
        showBack
        right={mir && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : mir ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          <Card>
            <MetaRow label="Material"    value={mir.material_name} />
            {mir.material_code   ? <MetaRow label="Material Code" value={mir.material_code} /> : null}
            {mir.supplier_name   ? <MetaRow label="Supplier"      value={mir.supplier_name} /> : null}
            {mir.quantity        ? <MetaRow label="Quantity"       value={`${mir.quantity} ${mir.unit || ''}`} /> : null}
            {mir.inspection_date ? <MetaRow label="Inspection Date" value={dayjs(mir.inspection_date).format('DD MMM YYYY')} /> : null}
            {mir.inspected_by_name ? <MetaRow label="Inspector" value={mir.inspected_by_name} /> : null}
            {mir.approved_by_name  ? <MetaRow label="Approved By" value={mir.approved_by_name} /> : null}
            {mir.remarks ? <MetaRow label="Remarks" value={mir.remarks} last /> : null}
          </Card>

          {labTests.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Lab Tests ({labTests.length})</Text>
              {labTests.map((t, i) => (
                <View key={t.id ?? i} style={[styles.testRow, i < labTests.length - 1 && styles.testBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.testName}>{t.test_name || t.parameter}</Text>
                    {t.standard ? <Text style={styles.testMeta}>Std: {t.standard}</Text> : null}
                  </View>
                  <View style={styles.testRight}>
                    {t.result ? <Text style={styles.testResult}>{t.result}</Text> : null}
                    {t.status ? <StatusBadge status={t.status} /> : null}
                  </View>
                </View>
              ))}
            </Card>
          )}

          {mtcs.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Material Test Certificates ({mtcs.length})</Text>
              {mtcs.map((m, i) => (
                <View key={m.id ?? i} style={[styles.testRow, i < mtcs.length - 1 && styles.testBorder]}>
                  <Text style={styles.testName}>{m.certificate_number || m.file_name || `MTC #${i + 1}`}</Text>
                </View>
              ))}
            </Card>
          )}

          {status === 'pending' && INSPECT_ROLES.includes(role) && (
            <Button title="Start Inspection" onPress={() => confirm('Start Inspection', 'Start inspection for this MIR?', () => inspectMut.mutate())} loading={inspectMut.isPending} />
          )}
          {status === 'inspecting' && APPROVE_ROLES.includes(role) && (
            <Button title="Approve MIR" onPress={() => confirm('Approve MIR', 'Approve this material inspection?', () => approveMut.mutate())} loading={approveMut.isPending} />
          )}
          {(status === 'pending' || status === 'inspecting') && APPROVE_ROLES.includes(role) && (
            <Button
              title="Reject"
              variant="outline"
              onPress={() => confirm('Reject MIR', 'Reject this MIR?', () => rejectMut.mutate())}
              loading={rejectMut.isPending}
              style={{ marginTop: 4 }}
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
  testRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  testBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  testName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  testMeta: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  testRight: { alignItems: 'flex-end' },
  testResult: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
});
