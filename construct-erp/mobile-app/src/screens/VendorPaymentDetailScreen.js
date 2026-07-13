import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { vendorPaymentsAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import { theme } from '../theme';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

export default function VendorPaymentDetailScreen({ route }) {
  const { id } = route.params;

  const { data: pmt, isLoading, isError, refetch } = useQuery({
    queryKey: ['vendor-payment-detail', id],
    queryFn: () => vendorPaymentsAPI.detail(id).then(r => r.data?.data ?? r.data ?? null),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Payment" showBack />
        <ErrorState message="Couldn't load payment details" onRetry={refetch} />
      </Screen>
    );
  }

  const net = pmt ? (parseFloat(pmt.net_amount) || (parseFloat(pmt.amount) - parseFloat(pmt.tds_deducted || 0))) : null;

  return (
    <Screen>
      <ScreenHeader
        title={pmt?.entity_name || 'Payment'}
        subtitle={pmt?.project_name}
        showBack
        right={pmt && <StatusBadge status={pmt.status || 'paid'} />}
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : pmt ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 24 }}>
          {/* Amount summary */}
          <Card style={styles.amountCard}>
            <View style={styles.amountGroup}>
              <Text style={styles.amountLabel}>Gross Amount</Text>
              <Text style={styles.amountValue}>{money(pmt.amount)}</Text>
            </View>
            {parseFloat(pmt.tds_deducted) > 0 && (
              <View style={styles.amountGroup}>
                <Text style={styles.amountLabel}>TDS Deducted</Text>
                <Text style={[styles.amountValue, { color: '#E11D48' }]}>−{money(pmt.tds_deducted)}</Text>
              </View>
            )}
            <View style={[styles.amountGroup, styles.netGroup]}>
              <Text style={[styles.amountLabel, { fontWeight: '700' }]}>Net Paid</Text>
              <Text style={[styles.amountValue, styles.netValue]}>{money(net)}</Text>
            </View>
          </Card>

          {/* Details */}
          <Card>
            <MetaRow label="Payment Type" value={pmt.payment_type} />
            <MetaRow label="Entity Name" value={pmt.entity_name} />
            {pmt.entity_pan ? <MetaRow label="PAN" value={pmt.entity_pan} /> : null}
            <MetaRow label="Payment Date" value={pmt.payment_date ? dayjs(pmt.payment_date).format('DD MMM YYYY') : null} />
            <MetaRow label="Payment Mode" value={pmt.payment_mode?.toUpperCase()} />
            {pmt.reference_number ? <MetaRow label="Reference No." value={pmt.reference_number} /> : null}
            {pmt.bank_name ? <MetaRow label="Bank" value={pmt.bank_name} /> : null}
            {pmt.cost_head ? <MetaRow label="Cost Head" value={pmt.cost_head} /> : null}
            {pmt.remarks ? <MetaRow label="Remarks" value={pmt.remarks} last /> : <MetaRow label="Project" value={pmt.project_name} last />}
          </Card>

          {pmt.source === 'finance' && (pmt.pc_number || pmt.tqs_bill_id) && (
            <Card>
              <Text style={styles.sectionLabel}>Finance Link</Text>
              {pmt.pc_number ? <MetaRow label="PC Number" value={pmt.pc_number} /> : null}
              {pmt.tqs_bill_id ? <MetaRow label="TQS Bill" value={pmt.tqs_bill_id} last /> : null}
            </Card>
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountCard: { gap: 10 },
  amountGroup: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountLabel: { fontSize: 12, color: theme.colors.muted },
  amountValue: { fontSize: 15, fontWeight: '700', color: theme.colors.text, fontVariant: ['tabular-nums'] },
  netGroup: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10, marginTop: 4 },
  netValue: { fontSize: 18, fontWeight: '800', color: theme.colors.success },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
});
