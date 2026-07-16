import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { ignAPI } from '../api/client';
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

export default function IGNDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showItems, setShowItems] = useState(true);

  const { data: ign, isLoading, isError, refetch } = useQuery({
    queryKey: ['ign-detail', id],
    queryFn: () => ignAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ign-detail', id] });
    qc.invalidateQueries({ queryKey: ['ign-list'] });
  };

  const action = (fn, label, msg) => useMutation({
    mutationFn: fn,
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || `Could not ${label}`),
  });

  const receiveMut = useMutation({
    mutationFn: () => ignAPI.receive(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not mark received'),
  });
  const inspectMut = useMutation({
    mutationFn: () => ignAPI.inspect(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not mark inspected'),
  });
  const approveMut = useMutation({
    mutationFn: () => ignAPI.approve(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not approve'),
  });
  const cancelMut = useMutation({
    mutationFn: () => ignAPI.cancel(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not cancel'),
  });

  const confirm = (title, msg, onPress) => Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', onPress },
  ]);

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="IGN Entry" showBack />
        <ErrorState message="Couldn't load IGN" onRetry={refetch} />
      </Screen>
    );
  }

  const status = ign?.status || '';
  const items  = ign?.items || [];
  const bills  = ign?.bills || [];

  return (
    <Screen>
      <ScreenHeader
        title={ign?.ign_number || `IGN-${id}`}
        subtitle={ign?.project_name}
        showBack
        right={ign && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : ign ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          <Card>
            <MetaRow label="Date/Time" value={ign.date_time ? dayjs(ign.date_time).format('DD MMM YYYY, HH:mm') : null} />
            <MetaRow label="Supplier"  value={ign.supplier_name || ign.vendor_name} />
            {ign.vehicle_no  ? <MetaRow label="Vehicle No."  value={ign.vehicle_no} /> : null}
            {ign.dc_number   ? <MetaRow label="DC Number"    value={ign.dc_number} /> : null}
            {ign.bill_number ? <MetaRow label="Bill Number"  value={ign.bill_number} /> : null}
            {ign.po_number   ? <MetaRow label="PO Number"    value={ign.po_number} /> : null}
            {ign.inspected_by ? <MetaRow label="Inspected By" value={ign.inspected_by} /> : null}
            {ign.received_by  ? <MetaRow label="Received By"  value={ign.received_by} /> : null}
            {ign.remarks ? <MetaRow label="Remarks" value={ign.remarks} /> : null}
            <MetaRow label="Created By" value={ign.created_by_name} last />
          </Card>

          <Card>
            <SectionHeader title={`Materials (${items.length})`} expanded={showItems} onToggle={() => setShowItems(v => !v)} />
            {showItems && items.map((it, i) => (
              <View key={it.id ?? i} style={[styles.itemRow, i < items.length - 1 && styles.itemBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.particulars || it.material_name}</Text>
                  {it.cost_head ? <Text style={styles.itemMeta}>{it.cost_head}</Text> : null}
                  {it.remarks   ? <Text style={styles.itemMeta}>{it.remarks}</Text> : null}
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemQty}>{parseFloat(it.quantity || 0)} {it.unit || ''}</Text>
                  {it.rate != null ? <Text style={styles.itemRate}>@ {money(it.rate)}</Text> : null}
                  {it.short_qty > 0 ? <Text style={[styles.itemRate, { color: '#EF4444' }]}>Short: {it.short_qty}</Text> : null}
                </View>
              </View>
            ))}
          </Card>

          {bills.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Linked Bills ({bills.length})</Text>
              {bills.map((b, i) => (
                <View key={b.id ?? i} style={[styles.itemRow, i < bills.length - 1 && styles.itemBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{b.bill_number || b.inv_number || `Bill #${b.id}`}</Text>
                    {b.supplier_name ? <Text style={styles.itemMeta}>{b.supplier_name}</Text> : null}
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemQty}>{money(b.total_amount)}</Text>
                    <StatusBadge status={b.workflow_status || b.status} />
                  </View>
                </View>
              ))}
            </Card>
          )}

          {status === 'pending' && (
            <Button title="Mark Received" onPress={() => confirm('Receive IGN', 'Mark this IGN as received?', () => receiveMut.mutate())} loading={receiveMut.isPending} />
          )}
          {status === 'received' && (
            <Button title="Mark Inspected" onPress={() => confirm('Inspect IGN', 'Mark this IGN as inspected?', () => inspectMut.mutate())} loading={inspectMut.isPending} />
          )}
          {status === 'inspected' && (
            <Button title="Approve IGN" onPress={() => confirm('Approve IGN', 'Approve this IGN entry?', () => approveMut.mutate())} loading={approveMut.isPending} />
          )}
          {(status === 'pending' || status === 'received') && (
            <Button title="Cancel" variant="outline" onPress={() => confirm('Cancel IGN', 'Cancel this IGN? This cannot be undone.', () => cancelMut.mutate())} loading={cancelMut.isPending} style={{ marginTop: 4 }} />
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
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  itemRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  itemName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemQty: { fontSize: 12, color: theme.colors.textSecondary },
  itemRate: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
});
