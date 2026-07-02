import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { budgetAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ListSkeleton from '../components/ListSkeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { theme } from '../theme';

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

export default function BudgetControlScreen() {
  const { selectedProject } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['budget-commitment', selectedProject?.id],
    queryFn: () => budgetAPI.commitment(selectedProject?.id).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!selectedProject?.id,
  });

  const rows = data || [];

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    budgeted: acc.budgeted + Number(r.budgeted || 0),
    committed: acc.committed + Number(r.committed || 0),
    actual: acc.actual + Number(r.actual || 0),
  }), { budgeted: 0, committed: 0, actual: 0 }), [rows]);

  return (
    <Screen>
      <ScreenHeader title="Budget Control" subtitle={selectedProject?.name} showBack />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load budget" onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState icon="cash-multiple" title="No budget lines found" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, i) => item.cost_head || String(i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10 }}
          ListHeaderComponent={
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Project Totals</Text>
              <View style={styles.summaryRow}>
                <SummaryStat label="Budgeted" value={totals.budgeted} />
                <SummaryStat label="Committed" value={totals.committed} />
                <SummaryStat label="Actual" value={totals.actual} warn={totals.actual > totals.budgeted} />
              </View>
            </Card>
          }
          renderItem={({ item }) => {
            const budgeted = Number(item.budgeted || 0);
            const committed = Number(item.committed || 0);
            const actual = Number(item.actual || 0);
            const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : (actual > 0 ? 100 : 0);
            const over = budgeted > 0 && actual > budgeted;
            return (
              <Card>
                <View style={styles.rowTop}>
                  <Text style={styles.costHead} numberOfLines={2}>{item.cost_head}</Text>
                  {over && (
                    <View style={styles.overBadge}>
                      <MaterialCommunityIcons name="alert-outline" size={11} color="#DC2626" />
                      <Text style={styles.overBadgeText}>Over</Text>
                    </View>
                  )}
                </View>

                <View style={styles.progressTrack}>
                  <View style={[
                    styles.progressFill,
                    { width: `${Math.min(100, pct)}%`, backgroundColor: over ? theme.colors.danger : theme.colors.success },
                  ]} />
                </View>
                <Text style={styles.pctLabel}>{pct}% of budget spent</Text>

                <View style={styles.metaRow}>
                  <MetaCol label="Budgeted" value={budgeted} />
                  <MetaCol label="Committed" value={committed} sub={item.po_count ? `${item.po_count} PO${item.po_count !== 1 ? 's' : ''}` : null} />
                  <MetaCol label="Actual" value={actual} valueColor={over ? theme.colors.danger : theme.colors.text} />
                </View>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}

function SummaryStat({ label, value, warn }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, warn && { color: theme.colors.danger }]}>{money(value)}</Text>
    </View>
  );
}

function MetaCol({ label, value, sub, valueColor }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, valueColor && { color: valueColor }]}>{money(value)}</Text>
      {sub ? <Text style={styles.metaSub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: { backgroundColor: theme.colors.dark },
  summaryTitle: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  summaryLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  summaryValue: { fontSize: 15, fontWeight: '800', color: '#fff', marginTop: 3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  costHead: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.colors.text },
  overBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF2F2',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  overBadgeText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: theme.colors.surface, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  pctLabel: { fontSize: 10, color: theme.colors.muted, marginTop: 4 },
  metaRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  metaLabel: { fontSize: 10, color: theme.colors.muted, fontWeight: '600' },
  metaValue: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  metaSub: { fontSize: 9, color: theme.colors.muted, marginTop: 1 },
});
