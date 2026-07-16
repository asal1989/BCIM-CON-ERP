import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { mrsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

const APPROVER_ROLES = ['super_admin', 'admin', 'project_manager', 'store_manager', 'procurement_manager', 'procurement'];

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

function SectionHeader({ title, expanded, onToggle }) {
  return (
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

const STAGE_MAP = {
  pending:         { next: 'site-approve',  label: 'Site Approve' },
  site_approved:   { next: 'store-approve', label: 'Store Approve' },
  store_approved:  { next: 'pm-approve',    label: 'PM Approve' },
};

export default function MRSDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showItems, setShowItems] = useState(true);

  const { data: mrs, isLoading, isError, refetch } = useQuery({
    queryKey: ['mrs-detail', id],
    queryFn: () => mrsAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mrs-detail', id] });
    qc.invalidateQueries({ queryKey: ['mrs-list'] });
  };

  const approveMut = useMutation({
    mutationFn: (stage) => mrsAPI.approve(id, stage),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not approve'),
  });

  const rejectMut = useMutation({
    mutationFn: () => mrsAPI.reject(id, 'Rejected via mobile app'),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not reject'),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Material Request" showBack />
        <ErrorState message="Couldn't load MRS" onRetry={refetch} />
      </Screen>
    );
  }

  const status = mrs?.status || '';
  const role   = user?.role || '';
  const canAct = APPROVER_ROLES.includes(role);
  const nextStage = STAGE_MAP[status];
  const items  = mrs?.items || [];

  return (
    <Screen>
      <ScreenHeader
        title={mrs?.mrs_number || `MRS-${id}`}
        subtitle={mrs?.project_name}
        showBack
        right={mrs && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : mrs ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          <Card>
            <MetaRow label="Raised By"   value={mrs.raised_by_name} />
            <MetaRow label="Date"        value={mrs.created_at ? dayjs(mrs.created_at).format('DD MMM YYYY') : null} />
            {mrs.required_date ? <MetaRow label="Required By" value={dayjs(mrs.required_date).format('DD MMM YYYY')} /> : null}
            {mrs.priority ? <MetaRow label="Priority" value={mrs.priority} /> : null}
            {mrs.remarks  ? <MetaRow label="Remarks"  value={mrs.remarks} /> : null}
            <MetaRow label="Created By" value={mrs.created_by_name || mrs.raised_by_name} last />
          </Card>

          {(mrs.site_approved_by || mrs.store_approved_by || mrs.pm_approved_by) && (
            <Card>
              <Text style={styles.trailTitle}>Approval Trail</Text>
              {mrs.site_approved_by  ? <MetaRow label="Site"  value={mrs.site_approved_by} /> : null}
              {mrs.store_approved_by ? <MetaRow label="Store" value={mrs.store_approved_by} /> : null}
              {mrs.pm_approved_by    ? <MetaRow label="PM"    value={mrs.pm_approved_by} last /> : null}
            </Card>
          )}

          <Card>
            <SectionHeader title={`Items (${items.length})`} expanded={showItems} onToggle={() => setShowItems(v => !v)} />
            {showItems && items.map((it, i) => (
              <View key={it.id ?? i} style={[styles.itemRow, i < items.length - 1 && styles.itemBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.material_name || it.material}</Text>
                  {it.purpose ? <Text style={styles.itemMeta}>{it.purpose}</Text> : null}
                  {it.cost_head ? <Text style={styles.itemMeta}>{it.cost_head}</Text> : null}
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemQty}>Req: {it.effective_qty ?? it.quantity ?? it.qty ?? '—'} {it.unit || ''}</Text>
                  {it.ordered_qty != null ? <Text style={[styles.itemQty, { color: theme.colors.primary }]}>Ord: {it.ordered_qty}</Text> : null}
                </View>
              </View>
            ))}
          </Card>

          {canAct && nextStage && (
            <Button
              title={nextStage.label}
              onPress={() => Alert.alert(nextStage.label, 'Approve this material request?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Approve', onPress: () => approveMut.mutate(nextStage.next) },
              ])}
              loading={approveMut.isPending}
            />
          )}
          {canAct && (status === 'pending' || status === 'site_approved') && (
            <Button
              title="Reject"
              variant="outline"
              onPress={() => Alert.alert('Reject MRS', 'Reject this material request?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reject', style: 'destructive', onPress: () => rejectMut.mutate() },
              ])}
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
  trailTitle: { fontSize: 11, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  itemRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  itemName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemQty: { fontSize: 12, color: theme.colors.textSecondary },
});
