import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { pettyCashAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import ListSkeleton from '../components/ListSkeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import FAB from '../components/FAB';
import { theme } from '../theme';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function PettyCashScreen() {
  const navigation = useNavigation();
  const { selectedProject } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['petty-cash-list', selectedProject?.id],
    queryFn: () => pettyCashAPI.list(selectedProject?.id).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!selectedProject?.id,
  });

  const items = data || [];

  return (
    <Screen>
      <ScreenHeader title="Stores Petty Cash" subtitle={selectedProject?.name} />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load petty cash entries" onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="cash-multiple" title="No entries yet" subtitle="Site purchase entries will appear here." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 90 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('PettyCashDetail', { id: item.id })}>
              <Card>
                <View style={styles.rowTop}>
                  <View style={styles.leftGroup}>
                    <MaterialCommunityIcons name="receipt" size={16} color={theme.colors.primary} />
                    <Text style={styles.supplier} numberOfLines={1}>{item.supplier}</Text>
                  </View>
                  <StatusBadge status={item.status} />
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.amount}>{money(item.total_amount || item.amount)}</Text>
                  {item.pc_voucher_no && (
                    <Text style={styles.voucher}>{item.pc_voucher_no}</Text>
                  )}
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.meta}>
                    {item.invoice_no ? `Inv: ${item.invoice_no}` : `SL #${item.sl_no}`}
                  </Text>
                  <Text style={styles.date}>
                    {item.entry_date ? dayjs(item.entry_date).format('DD MMM YYYY') : ''}
                  </Text>
                </View>
                {item.items?.length > 0 && (
                  <Text style={styles.itemsHint} numberOfLines={1}>
                    {item.items.map(i => i.material_name).join(', ')}
                  </Text>
                )}
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
      {selectedProject?.id && (
        <FAB onPress={() => navigation.navigate('CreatePettyCashEntry')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leftGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  supplier: { fontSize: 14, fontWeight: '700', color: theme.colors.text, flex: 1 },
  rowMid: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 },
  amount: { fontSize: 17, fontWeight: '800', color: theme.colors.text, fontVariant: ['tabular-nums'] },
  voucher: { fontSize: 11, color: theme.colors.muted, fontFamily: 'monospace' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  meta: { fontSize: 11, color: theme.colors.muted },
  date: { fontSize: 11, color: theme.colors.muted },
  itemsHint: { fontSize: 11, color: theme.colors.muted, marginTop: 5, fontStyle: 'italic' },
});
