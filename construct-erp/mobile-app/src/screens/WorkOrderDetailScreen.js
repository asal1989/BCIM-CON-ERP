import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { workOrderAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${parseFloat(v || 0).toFixed(1)}%`;

const APPROVE_ROLES = ['super_admin', 'admin', 'project_manager'];
const CLOSE_ROLES   = ['super_admin', 'admin', 'project_manager', 'qs_engineer'];

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

export default function WorkOrderDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showItems, setShowItems] = useState(true);

  const { data: wo, isLoading, isError, refetch } = useQuery({
    queryKey: ['wo-detail', id],
    queryFn: () => workOrderAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wo-detail', id] });
    qc.invalidateQueries({ queryKey: ['work-order-list'] });
  };

  const approveMut = useMutation({
    mutationFn: () => workOrderAPI.approve(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not approve'),
  });

  const closeMut = useMutation({
    mutationFn: () => workOrderAPI.close(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not close'),
  });

  const confirmApprove = () => Alert.alert('Approve Work Order', 'Activate this work order?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Approve', onPress: () => approveMut.mutate() },
  ]);

  const confirmClose = () => Alert.alert('Close Work Order', 'Mark this work order as closed?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Close', style: 'destructive', onPress: () => closeMut.mutate() },
  ]);

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Work Order" showBack />
        <ErrorState message="Couldn't load work order" onRetry={refetch} />
      </Screen>
    );
  }

  const role = user?.role || '';
  const canApprove = APPROVE_ROLES.includes(role) && wo?.status === 'pending';
  const canClose   = CLOSE_ROLES.includes(role) && wo?.status === 'active';
  const items = wo?.items || [];
  const contractAmt = parseFloat(wo?.contract_amount || wo?.total_amount || 0);
  const advPaid = parseFloat(wo?.advance_paid || 0);
  const advBal  = parseFloat(wo?.advance_balance || 0);

  return (
    <Screen>
      <ScreenHeader
        title={wo?.wo_number || `WO-${id}`}
        subtitle={wo?.project_name}
        showBack
        right={wo && <StatusBadge status={wo.status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : wo ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          <Card style={styles.amountCard}>
            <View style={styles.amountRow}>
              <View style={styles.amountGroup}>
                <Text style={styles.amountLabel}>Contract Value</Text>
                <Text style={styles.amountVal}>{money(contractAmt)}</Text>
              </View>
              {advPaid > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>Adv. Paid</Text>
                  <Text style={styles.amountVal}>{money(advPaid)}</Text>
                </View>
              )}
              {advBal > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>Adv. Balance</Text>
                  <Text style={[styles.amountVal, { color: theme.colors.warning || '#F59E0B' }]}>{money(advBal)}</Text>
                </View>
              )}
            </View>
          </Card>

          <Card>
            <MetaRow label="Subcontractor" value={wo.sc_name} />
            <MetaRow label="Trade Type"    value={wo.trade_type} />
            {wo.contractor_type ? <MetaRow label="Contractor Type" value={wo.contractor_type} /> : null}
            {wo.start_date ? <MetaRow label="Start Date" value={dayjs(wo.start_date).format('DD MMM YYYY')} /> : null}
            {wo.end_date   ? <MetaRow label="End Date"   value={dayjs(wo.end_date).format('DD MMM YYYY')} /> : null}
            {wo.payment_terms ? <MetaRow label="Payment Terms" value={wo.payment_terms} /> : null}
            {wo.remarks ? <MetaRow label="Remarks" value={wo.remarks} /> : null}
            <MetaRow label="Created By" value={wo.created_by_name} last />
          </Card>

          <Card>
            <SectionHeader title={`Items (${items.length})`} expanded={showItems} onToggle={() => setShowItems(v => !v)} />
            {showItems && items.map((it, i) => (
              <View key={it.id ?? i} style={[styles.itemRow, i < items.length - 1 && styles.itemBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.description || it.boq_description}</Text>
                  {it.cost_head ? <Text style={styles.itemMeta}>{it.cost_head}</Text> : null}
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemQty}>{parseFloat(it.quantity || 0)} {it.unit || ''}</Text>
                  {it.rate != null ? <Text style={styles.itemRate}>@ {money(it.rate)}</Text> : null}
                  {it.billed_qty != null ? (
                    <Text style={styles.itemBilled}>
                      Billed: {parseFloat(it.billed_qty)} {it.billed_pct != null ? `(${pct(it.billed_pct)})` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>

          {canApprove && (
            <Button title="Approve Work Order" onPress={confirmApprove} loading={approveMut.isPending} style={{ marginTop: 4 }} />
          )}
          {canClose && (
            <Button title="Close Work Order" variant="outline" onPress={confirmClose} loading={closeMut.isPending} style={{ marginTop: 4 }} />
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountCard: {},
  amountRow: { flexDirection: 'row', justifyContent: 'space-around' },
  amountGroup: { alignItems: 'center' },
  amountLabel: { fontSize: 11, color: theme.colors.muted, textTransform: 'uppercase' },
  amountVal: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  itemRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  itemName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemQty: { fontSize: 12, color: theme.colors.textSecondary },
  itemRate: { fontSize: 11, color: theme.colors.muted },
  itemBilled: { fontSize: 11, color: theme.colors.primary, marginTop: 2 },
});
