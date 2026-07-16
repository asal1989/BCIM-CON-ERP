import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { billsAPI } from '../api/client';
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

const STAGE_ROLES = {
  stores:          ['super_admin', 'admin', 'store_manager', 'stores'],
  document_control:['super_admin', 'admin', 'document_control'],
  qs:              ['super_admin', 'admin', 'qs_engineer', 'quantity_surveyor'],
  accounts:        ['super_admin', 'admin', 'accountant', 'finance'],
  procurement:     ['super_admin', 'admin', 'procurement_manager', 'procurement'],
  qs_sign:         ['super_admin', 'admin', 'qs_engineer'],
  payment:         ['super_admin', 'admin', 'accountant', 'finance'],
};

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function BillDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: bill, isLoading, isError, refetch } = useQuery({
    queryKey: ['bill-detail', id],
    queryFn: () => billsAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bill-detail', id] });
    qc.invalidateQueries({ queryKey: ['bills-list'] });
  };

  const advanceMut = useMutation({
    mutationFn: () => billsAPI.advanceStage(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not advance stage'),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Bill" showBack />
        <ErrorState message="Couldn't load bill" onRetry={refetch} />
      </Screen>
    );
  }

  const stage = bill?.workflow_status || bill?.current_stage || '';
  const role  = user?.role || '';
  const stageRoles = STAGE_ROLES[stage] || [];
  const canAdvance = stageRoles.includes(role) || role === 'super_admin';
  const items = bill?.line_items || bill?.items || [];
  const netAmt = parseFloat(bill?.net_payable || bill?.total_amount || bill?.amount || 0);
  const grossAmt = parseFloat(bill?.gross_amount || netAmt);

  return (
    <Screen>
      <ScreenHeader
        title={bill?.bill_number || bill?.sl_number || `BILL-${id}`}
        subtitle={bill?.project_name}
        showBack
        right={bill && <StatusBadge status={stage || bill?.status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : bill ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          <Card style={styles.amountCard}>
            <View style={styles.amountRow}>
              {grossAmt !== netAmt && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>Gross</Text>
                  <Text style={styles.amountVal}>{money(grossAmt)}</Text>
                </View>
              )}
              <View style={styles.amountGroup}>
                <Text style={styles.amountLabel}>Net Payable</Text>
                <Text style={[styles.amountVal, styles.totalVal]}>{money(netAmt)}</Text>
              </View>
              {bill.tax_amount > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>Tax</Text>
                  <Text style={styles.amountVal}>{money(bill.tax_amount)}</Text>
                </View>
              )}
            </View>
          </Card>

          <Card>
            {bill.inv_number  ? <MetaRow label="Invoice No."  value={bill.inv_number} /> : null}
            {bill.inv_date    ? <MetaRow label="Invoice Date" value={dayjs(bill.inv_date).format('DD MMM YYYY')} /> : null}
            <MetaRow label="Vendor"     value={bill.vendor_name || bill.supplier_name} />
            {bill.source_type ? <MetaRow label="Bill Type"   value={bill.source_type || bill.bill_type} /> : null}
            {bill.po_number   ? <MetaRow label="PO Number"   value={bill.po_number} /> : null}
            {bill.ign_number  ? <MetaRow label="IGN Number"  value={bill.ign_number} /> : null}
            {bill.created_by_name ? <MetaRow label="Created By" value={bill.created_by_name} /> : null}
            {bill.remarks     ? <MetaRow label="Remarks"     value={bill.remarks} last /> : null}
          </Card>

          {stage && (
            <Card>
              <MetaRow label="Current Stage" value={stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} last />
            </Card>
          )}

          {items.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Line Items ({items.length})</Text>
              {items.map((it, i) => (
                <View key={it.id ?? i} style={[styles.itemRow, i < items.length - 1 && styles.itemBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.description || it.material_name}</Text>
                    {it.cost_head ? <Text style={styles.itemMeta}>{it.cost_head}</Text> : null}
                  </View>
                  <View style={styles.itemRight}>
                    {it.quantity ? <Text style={styles.itemQty}>{it.quantity} {it.unit || ''}</Text> : null}
                    <Text style={styles.itemAmt}>{money(it.amount || it.total_amount)}</Text>
                  </View>
                </View>
              ))}
            </Card>
          )}

          {canAdvance && stage && stage !== 'paid' && (
            <Button
              title="Advance to Next Stage"
              onPress={() => Alert.alert('Advance Stage', `Move bill from "${stage}" to next stage?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Advance', onPress: () => advanceMut.mutate() },
              ])}
              loading={advanceMut.isPending}
            />
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
  amountVal: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  totalVal: { fontSize: 18, fontWeight: '800', color: theme.colors.success },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  itemRow: { paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  itemName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemQty: { fontSize: 12, color: theme.colors.muted },
  itemAmt: { fontSize: 13, fontWeight: '700', color: theme.colors.text, fontVariant: ['tabular-nums'] },
});
