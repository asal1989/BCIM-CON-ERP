import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { storeLedgerAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ListSkeleton from '../components/ListSkeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { theme } from '../theme';

const rq3 = (n) => Math.round((parseFloat(n) || 0) * 1000) / 1000;
const qty = (n) => rq3(n).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// Mirrors web StoreLedgerPage's stockStatus() — same thresholds, same labels.
function stockStatus(closing, minStock, reorder) {
  const c = rq3(closing);
  const m = parseFloat(minStock) || 0;
  const r = parseFloat(reorder) || 0;
  if (c <= 0) return { label: 'Out of Stock', bg: '#FEE2E2', fg: '#991B1B' };
  if (m > 0 && c <= m) return { label: 'Critical Low', bg: '#FEE2E2', fg: '#991B1B' };
  if (r > 0 && c <= r) return { label: 'Reorder', bg: '#FEF3C7', fg: '#92400E' };
  return { label: 'Adequate', bg: '#D1FAE5', fg: '#065F46' };
}

export default function StoreLedgerScreen() {
  const navigation = useNavigation();
  const { selectedProject } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['store-ledger-list', selectedProject?.id],
    queryFn: () => storeLedgerAPI.list(selectedProject?.id).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!selectedProject?.id,
  });

  const items = data || [];

  return (
    <Screen>
      <ScreenHeader title="Store Ledger" subtitle={selectedProject?.name} />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load store ledger" onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="book-open-outline" title="No inventory items yet" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const closing = rq3(item.closing_stock);
            const badge = stockStatus(closing, item.min_stock, item.reorder_level);
            return (
              <TouchableOpacity onPress={() => navigation.navigate('StoreLedgerDetail', { id: item.id, name: item.material_name })}>
                <Card style={styles.row}>
                  <View style={styles.left}>
                    <Text style={styles.name} numberOfLines={1}>{item.material_name}</Text>
                    <Text style={styles.sub}>
                      {item.unit ? `Unit: ${item.unit}` : ''}
                      {item.project_name ? ` · ${item.project_name}` : ''}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <Text style={styles.qty}>{qty(closing)}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
                </Card>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  left: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  sub: { fontSize: 12, color: theme.colors.muted, marginTop: 3 },
  right: { alignItems: 'flex-end' },
  qty: { fontSize: 15, fontWeight: '800', color: theme.colors.text, fontVariant: ['tabular-nums'] },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
