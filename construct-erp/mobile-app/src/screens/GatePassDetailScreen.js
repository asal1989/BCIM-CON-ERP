import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { gatePassAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function GatePassDetailScreen({ route }) {
  const { id } = route.params;
  const qc = useQueryClient();

  const { data: gp, isLoading, isError, refetch } = useQuery({
    queryKey: ['gate-pass-detail', id],
    queryFn: () => gatePassAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gate-pass-detail', id] });
    qc.invalidateQueries({ queryKey: ['gate-pass-list'] });
  };

  const returnMutation = useMutation({
    mutationFn: () => gatePassAPI.return(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not mark as returned'),
  });
  const closeMutation = useMutation({
    mutationFn: () => gatePassAPI.close(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not close'),
  });
  const cancelMutation = useMutation({
    mutationFn: () => gatePassAPI.cancel(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not cancel'),
  });

  const confirmReturn = () => Alert.alert('Mark as Returned', 'Confirm the material/vehicle has returned?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', onPress: () => returnMutation.mutate() },
  ]);
  const confirmClose = () => Alert.alert('Close Gate Pass', 'This closes the pass permanently.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Close', onPress: () => closeMutation.mutate() },
  ]);
  const confirmCancel = () => Alert.alert('Cancel Gate Pass', 'This cannot be undone.', [
    { text: 'No', style: 'cancel' },
    { text: 'Cancel Pass', style: 'destructive', onPress: () => cancelMutation.mutate() },
  ]);

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Gate Pass" showBack />
        <ErrorState message="Couldn't load gate pass" onRetry={refetch} />
      </Screen>
    );
  }

  const items = gp?.items || [];
  const isOpen = gp?.status === 'open';

  return (
    <Screen>
      <ScreenHeader title={gp?.gp_number || 'Gate Pass'} subtitle={gp?.project_name} showBack right={gp && <StatusBadge status={gp.status} />} />
      {isLoading && <ListSkeleton rows={4} />}
      {!isLoading && gp && (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10 }}>
          <Card>
            <MetaRow label="Type" value={gp.pass_type === 'returnable' ? 'Returnable' : 'Non-returnable'} />
            <MetaRow label="Vehicle No." value={gp.vehicle_no} />
            <MetaRow label="Date & Time" value={gp.date_time ? dayjs(gp.date_time).format('DD MMM YYYY, HH:mm') : '—'} />
            <MetaRow label="Issued By" value={gp.issued_by} />
            <MetaRow label="Issued To" value={gp.issued_to} />
            <MetaRow label="Indented By" value={gp.indented_by} />
            <MetaRow label="Authorised By" value={gp.authorised_by} />
            {gp.pass_type === 'returnable' && (
              <MetaRow label="Expected Return" value={gp.expected_return_date ? dayjs(gp.expected_return_date).format('DD MMM YYYY') : '—'} />
            )}
            {gp.remarks ? <MetaRow label="Remarks" value={gp.remarks} last /> : null}
          </Card>

          <Text style={styles.sectionTitle}>Items ({items.length})</Text>
          {items.map((it, i) => (
            <Card key={i} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it.particulars}</Text>
                {it.remarks ? <Text style={styles.itemRemarks}>{it.remarks}</Text> : null}
              </View>
              <Text style={styles.itemQty}>{it.quantity ?? '—'} {it.unit || ''}</Text>
            </Card>
          ))}

          {gp.status === 'returned' && (
            <Card style={styles.statusBanner}>
              <Text style={styles.statusBannerTitle}>Returned</Text>
              <Text style={styles.statusBannerSub}>{gp.returned_at ? dayjs(gp.returned_at).format('DD MMM YYYY, HH:mm') : ''}</Text>
            </Card>
          )}

          {isOpen && (
            <View style={{ gap: 10, marginTop: 8 }}>
              {gp.pass_type === 'returnable' && (
                <Button title="Mark as Returned" onPress={confirmReturn} loading={returnMutation.isPending} />
              )}
              <Button title="Close Gate Pass" onPress={confirmClose} loading={closeMutation.isPending} variant={gp.pass_type === 'returnable' ? 'outline' : 'primary'} />
              <Button title="Cancel Gate Pass" variant="outline" onPress={confirmCancel} loading={cancelMutation.isPending} />
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemName: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  itemRemarks: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  itemQty: { fontSize: 14, fontWeight: '700', color: theme.colors.success },
  statusBanner: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  statusBannerTitle: { fontSize: 12, fontWeight: '800', color: theme.colors.success, textTransform: 'uppercase' },
  statusBannerSub: { fontSize: 12, color: '#065F46', marginTop: 4 },
});
