import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { pettyCashAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

const APPROVER_ROLES = ['super_admin', 'admin', 'procurement_manager', 'procurement'];
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function PettyCashDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();
  const canApprove = APPROVER_ROLES.includes(user?.role);

  const { data: entry, isLoading, isError, refetch } = useQuery({
    queryKey: ['petty-cash-detail', id],
    queryFn: () => pettyCashAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['petty-cash-detail', id] });
    qc.invalidateQueries({ queryKey: ['petty-cash-list'] });
  };

  const statusMutation = useMutation({
    mutationFn: (payload) => pettyCashAPI.updateStatus(id, payload),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Action failed'),
  });

  const confirmApprove = () => Alert.alert('Approve Entry', 'Approve this petty cash entry?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Approve', onPress: () => statusMutation.mutate({ status: 'Approved' }) },
  ]);

  const confirmReject = () => Alert.alert('Reject Entry', 'Reject this petty cash entry?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reject', style: 'destructive', onPress: () => statusMutation.mutate({ status: 'Rejected', rejected_reason: 'Rejected via mobile app' }) },
  ]);

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Petty Cash" showBack />
        <ErrorState message="Couldn't load entry" onRetry={refetch} />
      </Screen>
    );
  }

  const isPending = entry?.status === 'Pending' || entry?.status === 'ph_approved';
  const items = entry?.items || [];
  const total = parseFloat(entry?.total_amount || entry?.amount || 0);
  const basic = parseFloat(entry?.basic_amount || 0);
  const gst   = parseFloat(entry?.gst_amount || 0);

  return (
    <Screen>
      <ScreenHeader
        title={entry?.supplier || 'Entry'}
        subtitle={entry?.project_name}
        showBack
        right={entry && <StatusBadge status={entry.status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : entry ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>
          {/* Amount card */}
          <Card style={styles.amountCard}>
            <View style={styles.amountRow}>
              {basic > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>Basic</Text>
                  <Text style={styles.amountVal}>{money(basic)}</Text>
                </View>
              )}
              {gst > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>GST</Text>
                  <Text style={styles.amountVal}>{money(gst)}</Text>
                </View>
              )}
              <View style={styles.amountGroup}>
                <Text style={[styles.amountLabel, { fontWeight: '700' }]}>Total</Text>
                <Text style={[styles.amountVal, styles.totalVal]}>{money(total)}</Text>
              </View>
            </View>
          </Card>

          {/* Details */}
          <Card>
            <MetaRow label="Entry Date" value={entry.entry_date ? dayjs(entry.entry_date).format('DD MMM YYYY') : null} />
            <MetaRow label="Supplier" value={entry.supplier} />
            {entry.invoice_no ? <MetaRow label="Invoice No." value={entry.invoice_no} /> : null}
            {entry.pc_voucher_no ? <MetaRow label="PC Voucher" value={entry.pc_voucher_no} /> : null}
            <MetaRow label="Sl. No." value={entry.sl_no ? String(entry.sl_no) : null} />
            {entry.remarks ? <MetaRow label="Remarks" value={entry.remarks} /> : null}
            {entry.je_reference ? <MetaRow label="Journal Ref." value={entry.je_reference} /> : null}
            <MetaRow label="Created By" value={entry.created_by_name} last />
          </Card>

          {/* Approval info */}
          {(entry.approved_by_name || entry.rejected_reason || entry.ph_approved_by_name) && (
            <Card>
              {entry.ph_approved_by_name ? (
                <MetaRow label="PH Approved By" value={entry.ph_approved_by_name} />
              ) : null}
              {entry.approved_by_name ? (
                <MetaRow label="Approved By" value={`${entry.approved_by_name}${entry.approved_at ? ' · ' + dayjs(entry.approved_at).format('DD MMM') : ''}`} />
              ) : null}
              {entry.approval_remarks ? (
                <MetaRow label="Approval Note" value={entry.approval_remarks} />
              ) : null}
              {entry.rejected_reason ? (
                <MetaRow label="Rejection Reason" value={entry.rejected_reason} last />
              ) : null}
            </Card>
          )}

          {/* Items */}
          {items.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Items ({items.length})</Text>
              {items.map((it, i) => (
                <Card key={it.id ?? i} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.material_name}</Text>
                    {it.cost_head ? <Text style={styles.itemMeta}>{it.cost_head}</Text> : null}
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemQty}>{parseFloat(it.quantity || 0)} {it.unit || ''}</Text>
                    <Text style={styles.itemAmt}>{money(it.total_amount)}</Text>
                  </View>
                </Card>
              ))}
            </>
          )}

          {/* Approve/Reject actions */}
          {canApprove && isPending && (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Button title="Approve" onPress={confirmApprove} loading={statusMutation.isPending} />
              <Button title="Reject" variant="outline" onPress={confirmReject} loading={statusMutation.isPending} />
            </View>
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
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  itemName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemQty: { fontSize: 12, color: theme.colors.muted },
  itemAmt: { fontSize: 13, fontWeight: '700', color: theme.colors.text, fontVariant: ['tabular-nums'], marginTop: 2 },
});
