import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ignAPI } from '../api/client';
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

export default function IGNScreen() {
  const navigation = useNavigation();
  const { selectedProject } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ign-list', selectedProject?.id],
    queryFn: () => ignAPI.list(selectedProject?.id).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!selectedProject?.id,
  });

  const items = data || [];

  return (
    <Screen>
      <ScreenHeader title="Inward Goods Note" subtitle={selectedProject?.name} />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load IGN entries" onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="clipboard-check-outline" title="No IGN entries yet" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 90 }}
          renderItem={({ item }) => (
            <Card>
              <View style={styles.rowTop}>
                <View style={styles.refWrap}>
                  <MaterialCommunityIcons name="clipboard-check-outline" size={16} color={theme.colors.primary} />
                  <Text style={styles.ref}>{item.ign_number || item.reference || `IGN-${item.id}`}</Text>
                </View>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.vendor}>{item.vendor_name || item.supplier_name || '—'}</Text>
              <Text style={styles.date}>{item.date || item.created_at?.slice(0, 10)}</Text>
            </Card>
          )}
        />
      )}
      {selectedProject?.id && <FAB onPress={() => navigation.navigate('CreateIGN')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ref: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  vendor: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginTop: 8 },
  date: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
});
