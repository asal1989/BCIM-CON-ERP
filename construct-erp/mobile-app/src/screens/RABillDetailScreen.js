import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { raBillAPI } from '../api/client';
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

const VERIFY_ROLES  = ['super_admin', 'admin', 'qs_engineer', 'project_manager'];
const APPROVE_ROLES = ['super_admin', 'admin', 'project_manager'];
const PAY_ROLES     = ['super_admin', 'admin', 'accountant'];

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function RABillDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: bill, isLoading, isError, refetch } = useQuery({
    queryKey: ['ra-bill-detail', id],
    queryFn: () => raBillAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ra-bill-detail', id] });
    qc.invalidateQueries({ queryKey: ['ra-bills-list'] });
  };

  const verifyMut  = useMutation({ mutationFn: () => raBillAPI.verify(id),  onSuccess: invalidate, onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not verify') });
  const approveMut = useMutation({ mutationFn: () => raBillAPI.approve(id), onSuccess: invalidate, onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not approve') });
  const rejectMut  = useMutation({ mutationFn: () => raBillAPI.reject(id, 'Rejected via mobile'), onSuccess: invalidate, onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not reject') });
  const payMut     = useMutation({ mutationFn: () => raBillAPI.pay(id),     onSuccess: invalidate, onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not mark paid') });

  const confirm = (title, msg, onPress) => Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', onPress },
  ]);

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="RA Bill" showBack />
        <ErrorState message="Couldn't load RA Bill" onRetry={refetch} />
      </Screen>
    );
  }

  const status = bill?.status || '';
  const role   = user?.role || '';
  const gross  = parseFloat(bill?.gross_amount || 0);
  const net    = parseFloat(bill?.net_payable || gross);
  const ret    = parseFloat(bill?.retention_amount || 0);

  return (
    <Screen>
      <ScreenHeader
        title={`RA Bill #${bill?.bill_number || id}`}
        subtitle={bill?.project_name}
        showBack
        right={bill && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : bill ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          <Card style={styles.amountCard}>
            <View style={styles.amountRow}>
              <View style={styles.amountGroup}>
                <Text style={styles.amountLabel}>Gross</Text>
                <Text style={styles.amountVal}>{money(gross)}</Text>
              </View>
              {ret > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>Retention</Text>
                  <Text style={[styles.amountVal, { color: '#F59E0B' }]}>{money(ret)}</Text>
                </View>
              )}
              <View style={styles.amountGroup}>
                <Text style={styles.amountLabel}>Net Payable</Text>
                <Text style={[styles.amountVal, styles.totalVal]}>{money(net)}</Text>
              </View>
            </View>
          </Card>

          <Card>
            {bill.bill_date     ? <MetaRow label="Bill Date"     value={dayjs(bill.bill_date).format('DD MMM YYYY')} /> : null}
            {bill.sc_name       ? <MetaRow label="Subcontractor" value={bill.sc_name} /> : null}
            {bill.work_order_no ? <MetaRow label="Work Order"    value={bill.work_order_no} /> : null}
            {bill.period_from   ? <MetaRow label="Period"        value={`${dayjs(bill.period_from).format('DD MMM')} – ${dayjs(bill.period_to).format('DD MMM YYYY')}`} /> : null}
            {bill.certified_by_name ? <MetaRow label="Certified By"  value={bill.certified_by_name} /> : null}
            {bill.verified_by_name  ? <MetaRow label="Verified By"   value={bill.verified_by_name} /> : null}
            {bill.approved_by_name  ? <MetaRow label="Approved By"   value={bill.approved_by_name} /> : null}
            {bill.remarks           ? <MetaRow label="Remarks"       value={bill.remarks} last /> : null}
          </Card>

          {status === 'pending'  && VERIFY_ROLES.includes(role)  && (
            <Button title="Verify Bill" onPress={() => confirm('Verify RA Bill', 'Verify this RA Bill?', () => verifyMut.mutate())} loading={verifyMut.isPending} />
          )}
          {status === 'verified' && APPROVE_ROLES.includes(role) && (
            <Button title="Approve Bill" onPress={() => confirm('Approve RA Bill', 'Approve this RA Bill for payment?', () => approveMut.mutate())} loading={approveMut.isPending} />
          )}
          {status === 'approved' && PAY_ROLES.includes(role) && (
            <Button title="Mark Paid" onPress={() => confirm('Mark as Paid', 'Mark this RA Bill as paid?', () => payMut.mutate())} loading={payMut.isPending} />
          )}
          {(status === 'pending' || status === 'verified') && VERIFY_ROLES.includes(role) && (
            <Button
              title="Reject"
              variant="outline"
              onPress={() => confirm('Reject RA Bill', 'Reject this RA Bill?', () => rejectMut.mutate())}
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
});
