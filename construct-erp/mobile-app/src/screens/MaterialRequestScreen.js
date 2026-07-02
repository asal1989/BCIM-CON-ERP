import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mrsAPI } from '../api/client';
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

export default function MaterialRequestScreen() {
  const navigation = useNavigation();
  const { selectedProject } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['mrs-list', selectedProject?.id],
    queryFn: () => mrsAPI.list(selectedProject?.id).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!selectedProject?.id,
  });

  const items = data || [];

  return (
    <Screen>
      <ScreenHeader title="Material Requisition" subtitle={selectedProject?.name} />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load requests" onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="clipboard-list-outline" title="No material requests yet" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 90 }}
          renderItem={({ item }) => (
            <Card>
              <View style={styles.rowTop}>
                <View style={styles.refWrap}>
                  <MaterialCommunityIcons name="clipboard-list-outline" size={16} color={theme.colors.primary} />
                  <Text style={styles.ref}>{item.mrs_number || item.reference || `MRS-${item.id}`}</Text>
                </View>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.desc}>{item.description || item.remarks || `${item.item_count || 0} items`}</Text>
              <Text style={styles.date}>{item.date || item.created_at?.slice(0, 10)}</Text>
            </Card>
          )}
        />
      )}
      {selectedProject?.id && <FAB onPress={() => navigation.navigate('CreateMaterialRequest')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ref: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  desc: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 8 },
  date: { fontSize: 12, color: theme.colors.muted, marginTop: 4 },
});
