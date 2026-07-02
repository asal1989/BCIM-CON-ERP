import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { boqBudgetAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ListSkeleton from '../components/ListSkeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { theme } from '../theme';

function money(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function DrilldownList({ projectId, costHead }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['budget-drilldown', projectId, costHead],
    queryFn: () => boqBudgetAPI.costheadDrilldown(projectId, costHead).then(r => r.data?.data ?? []),
    enabled: !!projectId && !!costHead,
  });

  if (isLoading) return <ActivityIndicator style={{ marginVertical: 12 }} color={theme.colors.primary} />;
  if (isError) return <Text style={styles.drillEmpty}>Couldn't load transactions</Text>;
  const rows = data || [];
  if (rows.length === 0) return <Text style={styles.drillEmpty}>No direct transactions — may be a derived/pro-rated head</Text>;

  return (
    <View style={styles.drillWrap}>
      {rows.map((r, i) => (
        <View key={i} style={[styles.drillRow, i !== rows.length - 1 && styles.drillRowBorder]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.drillRef} numberOfLines={1}>{r.reference || '—'}</Text>
            <Text style={styles.drillDesc} numberOfLines={1}>{r.description || r.source}</Text>
            <View style={styles.drillTagRow}>
              <View style={styles.drillTag}><Text style={styles.drillTagText}>{r.source}</Text></View>
              {r.date && <Text style={styles.drillDate}>{new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>}
            </View>
          </View>
          <Text style={styles.drillAmount}>{money(r.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function BudgetControlScreen() {
  const { selectedProject } = useAuth();
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['boq-budget-costhead-summary', selectedProject?.id],
    queryFn: () => boqBudgetAPI.costheadSummary(selectedProject?.id).then(r => r.data ?? {}),
    enabled: !!selectedProject?.id,
  });

  const rows = (data?.data || []).filter(r => r.budget > 0 || r.actual > 0);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    budget: acc.budget + Number(r.budget || 0),
    actual: acc.actual + Number(r.actual || 0),
  }), { budget: 0, actual: 0 }), [rows]);

  return (
    <Screen>
      <ScreenHeader title="Budget Control" subtitle={selectedProject?.name} showBack />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load budget" onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState icon="cash-multiple" title="No budget data found" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, i) => item.cost_head || String(i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10 }}
          ListHeaderComponent={
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Project Totals</Text>
              <View style={styles.summaryRow}>
                <SummaryStat label="Total Budget" value={totals.budget} />
                <SummaryStat label="Total Spent" value={totals.actual} warn={totals.actual > totals.budget} />
                <SummaryStat label="Balance" value={totals.budget - totals.actual} warn={totals.budget - totals.actual < 0} />
              </View>
              {data?.total_boq_value ? (
                <Text style={styles.summaryFoot}>BOQ Contract Value: {money(data.total_boq_value)}</Text>
              ) : null}
            </Card>
          }
          renderItem={({ item }) => {
            const budget = Number(item.budget || 0);
            const actual = Number(item.actual || 0);
            const balance = Number(item.balance ?? (budget - actual));
            const pct = budget > 0 ? Math.round((actual / budget) * 100) : (actual > 0 ? 100 : 0);
            const over = balance < 0;
            const isOpen = expanded === item.cost_head;
            return (
              <Card>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setExpanded(isOpen ? null : item.cost_head)}>
                  <View style={styles.rowTop}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.costHead} numberOfLines={2}>{item.cost_head}</Text>
                      {item.derived && (
                        <View style={styles.derivedBadge}><Text style={styles.derivedBadgeText}>derived</Text></View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {over && (
                        <View style={styles.overBadge}>
                          <MaterialCommunityIcons name="alert-outline" size={11} color="#DC2626" />
                          <Text style={styles.overBadgeText}>Over</Text>
                        </View>
                      )}
                      <MaterialCommunityIcons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.muted} />
                    </View>
                  </View>

                  <View style={styles.progressTrack}>
                    <View style={[
                      styles.progressFill,
                      { width: `${Math.min(100, pct)}%`, backgroundColor: over ? theme.colors.danger : theme.colors.success },
                    ]} />
                  </View>
                  <Text style={styles.pctLabel}>{pct}% of budget spent</Text>

                  <View style={styles.metaRow}>
                    <MetaCol label="Budget" value={budget} />
                    <MetaCol label="Actual" value={actual} valueColor={over ? theme.colors.danger : theme.colors.text} />
                    <MetaCol label="Balance" value={balance} valueColor={over ? theme.colors.danger : theme.colors.success} />
                  </View>
                </TouchableOpacity>

                {isOpen && !item.derived && (
                  <DrilldownList projectId={selectedProject?.id} costHead={item.cost_head} />
                )}
                {isOpen && item.derived && (
                  <Text style={styles.drillEmpty}>Derived head — calculated from other cost heads, no direct transactions</Text>
                )}
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
      <Text style={[styles.summaryValue, warn && { color: '#FCA5A5' }]}>{money(value)}</Text>
    </View>
  );
}

function MetaCol({ label, value, valueColor }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, valueColor && { color: valueColor }]}>{money(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: { backgroundColor: theme.colors.dark },
  summaryTitle: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  summaryLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  summaryValue: { fontSize: 15, fontWeight: '800', color: '#fff', marginTop: 3 },
  summaryFoot: { fontSize: 10, color: '#64748B', marginTop: 12, fontWeight: '600' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  costHead: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.colors.text },
  derivedBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  derivedBadgeText: { fontSize: 9, fontWeight: '700', color: '#4338CA' },
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
  drillWrap: { marginTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10 },
  drillEmpty: { fontSize: 11, color: theme.colors.muted, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },
  drillRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 8 },
  drillRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  drillRef: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  drillDesc: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  drillTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  drillTag: { backgroundColor: theme.colors.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  drillTagText: { fontSize: 9, fontWeight: '700', color: theme.colors.textSecondary },
  drillDate: { fontSize: 9, color: theme.colors.muted },
  drillAmount: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
});
