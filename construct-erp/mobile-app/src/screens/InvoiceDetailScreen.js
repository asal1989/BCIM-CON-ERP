import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { invoiceAPI } from '../api/client';
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
const VERIFY_ROLES    = ['super_admin', 'admin', 'accountant', 'finance', 'qs_engineer'];
const AUTHORIZE_ROLES = ['super_admin', 'admin', 'project_manager', 'director', 'md'];

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function InvoiceDetailScreen({ route }) {
  const { id } = route.params;
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: inv, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoice-detail', id],
    queryFn: () => invoiceAPI.detail(id).then(r => r.data?.data ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['invoice-detail', id] });
    qc.invalidateQueries({ queryKey: ['invoices-list'] });
  };

  const verifyMut    = useMutation({ mutationFn: () => invoiceAPI.verify(id),    onSuccess: invalidate, onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not verify') });
  const authorizeMut = useMutation({ mutationFn: () => invoiceAPI.authorize(id), onSuccess: invalidate, onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not authorize') });

  const confirm = (title, msg, onPress) => Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', onPress },
  ]);

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Invoice" showBack />
        <ErrorState message="Couldn't load invoice" onRetry={refetch} />
      </Screen>
    );
  }

  const status = inv?.status || '';
  const role   = user?.role || '';
  const total  = parseFloat(inv?.total_amount || inv?.net_payable || 0);
  const taxAmt = parseFloat(inv?.tax_amount || inv?.gst_amount || 0);
  const basic  = parseFloat(inv?.basic_amount || (total - taxAmt) || 0);

  return (
    <Screen>
      <ScreenHeader
        title={inv?.invoice_number || `INV-${id}`}
        subtitle={inv?.project_name}
        showBack
        right={inv && <StatusBadge status={status} />}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : inv ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 30 }}>

          <Card style={styles.amountCard}>
            <View style={styles.amountRow}>
              {basic > 0 && taxAmt > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>Basic</Text>
                  <Text style={styles.amountVal}>{money(basic)}</Text>
                </View>
              )}
              {taxAmt > 0 && (
                <View style={styles.amountGroup}>
                  <Text style={styles.amountLabel}>Tax/GST</Text>
                  <Text style={styles.amountVal}>{money(taxAmt)}</Text>
                </View>
              )}
              <View style={styles.amountGroup}>
                <Text style={styles.amountLabel}>Total</Text>
                <Text style={[styles.amountVal, styles.totalVal]}>{money(total)}</Text>
              </View>
            </View>
          </Card>

          <Card>
            <MetaRow label="Vendor" value={inv.vendor_name} />
            {inv.invoice_date ? <MetaRow label="Invoice Date" value={dayjs(inv.invoice_date).format('DD MMM YYYY')} /> : null}
            {inv.due_date     ? <MetaRow label="Due Date"     value={dayjs(inv.due_date).format('DD MMM YYYY')} /> : null}
            {inv.po_number    ? <MetaRow label="PO Number"    value={inv.po_number} /> : null}
            {inv.invoice_number ? <MetaRow label="Invoice No."  value={inv.invoice_number} /> : null}
            {inv.verified_by_name    ? <MetaRow label="Verified By"   value={inv.verified_by_name} /> : null}
            {inv.authorized_by_name  ? <MetaRow label="Authorized By" value={inv.authorized_by_name} /> : null}
            {inv.remarks ? <MetaRow label="Remarks" value={inv.remarks} last /> : null}
          </Card>

          {status === 'pending'  && VERIFY_ROLES.includes(role) && (
            <Button title="Verify Invoice" onPress={() => confirm('Verify Invoice', 'Verify this invoice?', () => verifyMut.mutate())} loading={verifyMut.isPending} />
          )}
          {status === 'verified' && AUTHORIZE_ROLES.includes(role) && (
            <Button title="Authorize Invoice" onPress={() => confirm('Authorize Invoice', 'Authorize this invoice for payment?', () => authorizeMut.mutate())} loading={authorizeMut.isPending} />
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
