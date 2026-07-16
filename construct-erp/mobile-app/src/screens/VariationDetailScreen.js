import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { variationAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

const money = (v) => v != null ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
const APPROVE_ROLES = ['super_admin', 'admin', 'project_manager'];

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

export default function VariationDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showItems, setShowItems] = useState(true);

  const { data: vo, isLoading, isError, refetch } = useQuery({
    queryKey: ['variation-detail', id],
    queryFn: () => variationAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['variation-detail', id] });
    qc.invalidateQueries({ queryKey: ['variations-list'] });
  };

  const approveMut = useMutation({
    mutationFn: () => variationAPI.approve(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not approve'),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Variation Order" showBack />
        <ErrorState message="Couldn't load variation" onRetry={refetch} />
      </Screen>
    );
  }

  const status = vo?.status || '';
  const role   = user?.role || '';
  const items  = vo?.items || [];
  const amt    = parseFloat(vo?.amount || vo?.total_amount || 0);

  return (
    <Screen>
      <ScreenHeader
        title={vo?.vo_number || `VO-${id}`}
        subtitle={vo?.project_name}
        showBack
        right={vo && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : vo ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          {amt > 0 && (
            <Card style={styles.amountCard}>
              <Text style={styles.amountLabel}>Variation Amount</Text>
              <Text style={styles.amountVal}>{money(amt)}</Text>
            </Card>
          )}

          <Card>
            {vo.title        ? <MetaRow label="Title"         value={vo.title} /> : null}
            {vo.description  ? <MetaRow label="Description"   value={vo.description} /> : null}
            {vo.created_at   ? <MetaRow label="Date"          value={dayjs(vo.created_at).format('DD MMM YYYY')} /> : null}
            {vo.requested_by_name ? <MetaRow label="Requested By" value={vo.requested_by_name} /> : null}
            {vo.approved_by_name  ? <MetaRow label="Approved By"  value={vo.approved_by_name} /> : null}
            {vo.remarks      ? <MetaRow label="Remarks"       value={vo.remarks} last /> : null}
          </Card>

          {items.length > 0 && (
            <Card>
              <SectionHeader title={`Items (${items.length})`} expanded={showItems} onToggle={() => setShowItems(v => !v)} />
              {showItems && items.map((it, i) => (
                <View key={it.id ?? i} style={[styles.itemRow, i < items.length - 1 && styles.itemBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.description}</Text>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemQty}>{it.quantity ?? '—'} {it.unit || ''}</Text>
                    {it.amount != null ? <Text style={styles.itemAmt}>{money(it.amount)}</Text> : null}
                  </View>
                </View>
              ))}
            </Card>
          )}

          {status === 'pending' && APPROVE_ROLES.includes(role) && (
            <Button
              title="Approve Variation"
              onPress={() => Alert.alert('Approve VO', 'Approve this variation order?', [
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
  amountCard: { alignItems: 'center', paddingVertical: 8 },
  amountLabel: { fontSize: 11, color: theme.colors.muted, textTransform: 'uppercase' },
  amountVal: { fontSize: 22, fontWeight: '800', color: theme.colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  itemRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  itemName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  itemRight: { alignItems: 'flex-end' },
  itemQty: { fontSize: 12, color: theme.colors.muted },
  itemAmt: { fontSize: 13, fontWeight: '700', color: theme.colors.text, fontVariant: ['tabular-nums'], marginTop: 2 },
});
