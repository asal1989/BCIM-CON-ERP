import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { dprAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ListSkeleton from '../components/ListSkeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import FAB from '../components/FAB';
import { theme } from '../theme';

export default function DPRScreen() {
  const navigation = useNavigation();
  const { selectedProject } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dpr-list', selectedProject?.id],
    queryFn: () => dprAPI.list(selectedProject?.id).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!selectedProject?.id,
  });

  const items = data || [];

  return (
    <Screen>
      <ScreenHeader title="Daily Progress Report" subtitle={selectedProject?.name} />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load DPRs" onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="file-chart-outline" title="No DPR entries yet" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 90 }}
          renderItem={({ item }) => (
            <Card>
              <View style={styles.rowTop}>
                <MaterialCommunityIcons name="file-chart-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.date}>{item.date || item.report_date}</Text>
              </View>
              <Text style={styles.summary} numberOfLines={2}>{item.summary || item.remarks || 'No summary'}</Text>
            </Card>
          )}
        />
      )}
      {selectedProject?.id && <FAB onPress={() => navigation.navigate('CreateDPR')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  summary: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 8, lineHeight: 18 },
});
