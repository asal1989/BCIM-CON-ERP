import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { storeLedgerAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ErrorState from '../components/ErrorState';
import ListSkeleton from '../components/ListSkeleton';
import EmptyState from '../components/EmptyState';
import { theme } from '../theme';

const rq3 = (n) => Math.round((parseFloat(n) || 0) * 1000) / 1000;
const qty = (n) => rq3(n).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// Same transaction_type → label/color/icon mapping as web StoreLedgerPage's TYPE_CONFIG.
const TYPE_CONFIG = {
  grn:          { label: 'Receipt',      icon: 'tray-arrow-down', fg: '#065F46', bg: '#D1FAE5' },
  issue:        { label: 'Issue',        icon: 'tray-arrow-up',   fg: '#9F1239', bg: '#FFE4E6' },
  transfer_in:  { label: 'Transfer In',  icon: 'tray-arrow-down', fg: '#3730A3', bg: '#E0E7FF' },
  transfer_out: { label: 'Transfer Out', icon: 'tray-arrow-up',   fg: '#86198F', bg: '#FAE8FF' },
  adjustment:   { label: 'Adjustment',   icon: 'swap-vertical',   fg: '#92400E', bg: '#FEF3C7' },
};

function isReceipt(t) { return t === 'grn' || t === 'transfer_in'; }
function isIssue(t)    { return t === 'issue' || t === 'transfer_out'; }

export default function StoreLedgerDetailScreen({ route }) {
  const { id, name } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['store-ledger-detail', id],
    queryFn: () => storeLedgerAPI.ledger(id).then(r => r.data),
  });

  const inventory = data?.inventory;
  const transactions = data?.transactions || [];

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title={name || 'Ledger'} showBack />
        <ErrorState message="Couldn't load transactions" onRetry={refetch} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={inventory?.material_name || name || 'Ledger'} subtitle="Material Ledger" showBack />
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 24 }}>
          {inventory && (
            <Card style={styles.summary}>
              <View>
                <Text style={styles.summaryLabel}>Current Stock</Text>
                <Text style={styles.summaryQty}>{qty(inventory.closing_stock)} {inventory.unit || ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.summaryLabel}>Opening Stock</Text>
                <Text style={styles.summarySub}>{qty(inventory.opening_stock)} {inventory.unit || ''}</Text>
              </View>
            </Card>
          )}

          <Text style={styles.sectionTitle}>Transactions ({transactions.length})</Text>

          {transactions.length === 0 ? (
            <EmptyState icon="tray-remove-outline" title="No transactions yet" subtitle="Receipts, issues and transfers will appear here." />
          ) : (
            transactions.map((t, i) => {
              const cfg = TYPE_CONFIG[t.transaction_type] || TYPE_CONFIG.adjustment;
              const q = rq3(t.quantity);
              return (
                <Card key={t.id ?? i} style={styles.txnRow}>
                  <View style={[styles.txnIcon, { backgroundColor: cfg.bg }]}>
                    <MaterialCommunityIcons name={cfg.icon} size={16} color={cfg.fg} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.txnTop}>
                      <Text style={[styles.txnType, { color: cfg.fg }]}>{cfg.label}</Text>
                      <Text style={styles.txnDate}>{t.transacted_at ? dayjs(t.transacted_at).format('DD MMM YYYY') : ''}</Text>
                    </View>
                    {t.reference_number ? <Text style={styles.txnRef}>{t.reference_number}</Text> : null}
                    {t.remarks ? <Text style={styles.txnRemarks} numberOfLines={2}>{t.remarks}</Text> : null}
                    {t.transacted_by_name ? <Text style={styles.txnBy}>By {t.transacted_by_name}</Text> : null}
                  </View>
                  <Text style={[styles.txnQty, { color: isReceipt(t.transaction_type) ? '#059669' : isIssue(t.transaction_type) ? '#E11D48' : theme.colors.text }]}>
                    {isReceipt(t.transaction_type) ? '+' : isIssue(t.transaction_type) ? '−' : '±'}{qty(q)}
                  </Text>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryLabel: { fontSize: 11, color: theme.colors.muted, fontWeight: '600', textTransform: 'uppercase' },
  summaryQty: { fontSize: 20, fontWeight: '800', color: theme.colors.text, marginTop: 3 },
  summarySub: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  txnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  txnIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  txnTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txnType: { fontSize: 13, fontWeight: '700' },
  txnDate: { fontSize: 11, color: theme.colors.muted },
  txnRef: { fontSize: 11, color: theme.colors.muted, marginTop: 2, fontFamily: 'monospace' },
  txnRemarks: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3 },
  txnBy: { fontSize: 11, color: theme.colors.muted, marginTop: 3 },
  txnQty: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
});
