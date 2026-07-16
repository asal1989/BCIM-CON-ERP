import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { gatePassAPI } from '../api/client';
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

export default function GatePassScreen() {
  const navigation = useNavigation();
  const { selectedProject } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['gate-pass-list', selectedProject?.id],
    queryFn: () => gatePassAPI.list(selectedProject?.id).then(r => r.data?.data ?? []),
    enabled: !!selectedProject?.id,
  });

  const items = data || [];

  return (
    <Screen>
      <ScreenHeader title="Gate Pass" subtitle={selectedProject?.name} />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load gate passes" onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="logout" title="No gate passes yet" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 90 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('GatePassDetail', { id: item.id })}>
              <Card>
                <View style={styles.rowTop}>
                  <View style={styles.refWrap}>
                    <MaterialCommunityIcons name="logout" size={16} color={theme.colors.primary} />
                    <Text style={styles.ref}>{item.gp_number || `GP-${item.id}`}</Text>
                  </View>
                  <StatusBadge status={item.status} />
                </View>
                <Text style={styles.desc} numberOfLines={1}>
                  {item.pass_type === 'returnable' ? 'Returnable' : 'Non-returnable'}
                  {item.vehicle_no ? ` · ${item.vehicle_no}` : ''}
                  {item.item_count ? ` · ${item.item_count} item${item.item_count !== 1 ? 's' : ''}` : ''}
                </Text>
                <Text style={styles.date}>{item.date_time ? dayjs(item.date_time).format('DD MMM YYYY, HH:mm') : ''}</Text>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
      {selectedProject?.id && <FAB onPress={() => navigation.navigate('CreateGatePass')} />}
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
