import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { materialTrackerAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ListSkeleton from '../components/ListSkeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import FAB from '../components/FAB';
import { theme } from '../theme';

const TYPES = [
  { key: '', label: 'All' },
  { key: 'rmc', label: 'RMC (Concrete)' },
  { key: 'steel', label: 'Steel' },
];

export default function MaterialTrackerScreen() {
  const navigation = useNavigation();
  const { selectedProject } = useAuth();
  const [materialType, setMaterialType] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['material-tracker', selectedProject?.id, materialType],
    queryFn: () => materialTrackerAPI.list(selectedProject?.id, materialType || undefined).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!selectedProject?.id,
  });

  const items = data || [];

  return (
    <Screen>
      <ScreenHeader title="Material Tracker" subtitle={selectedProject?.name} />

      <View style={styles.tabs}>
        {TYPES.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setMaterialType(t.key)} style={[styles.tab, materialType === t.key && styles.tabActive]}>
            <Text style={[styles.tabText, materialType === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load material tracker" onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="truck-delivery-outline" title="No PO entries tracked yet" subtitle="Register a PO to start tracking deliveries against it." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: 90 }}
          renderItem={({ item }) => {
            const ordered = Number(item.ordered_qty || 0);
            const supplied = Number(item.supplied_qty || 0);
            const pct = ordered > 0 ? Math.min(100, Math.round((supplied / ordered) * 100)) : 0;
            const isSteel = item.material_type === 'steel';
            return (
              <TouchableOpacity onPress={() => navigation.navigate('MaterialTrackerDetail', { id: item.id })}>
                <Card>
                  <View style={styles.rowTop}>
                    <View style={styles.refWrap}>
                      <MaterialCommunityIcons name={isSteel ? 'grid' : 'truck-delivery-outline'} size={16} color={theme.colors.primary} />
                      <Text style={styles.ref}>{item.po_number}</Text>
                    </View>
                    <View style={[styles.typeBadge, isSteel ? styles.typeBadgeSteel : styles.typeBadgeRmc]}>
                      <Text style={[styles.typeBadgeText, isSteel ? styles.typeBadgeTextSteel : styles.typeBadgeTextRmc]}>
                        {isSteel ? 'STEEL' : 'RMC'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.vendor}>{item.vendor_name || '—'}{item.grade ? ` · ${item.grade}` : ''}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>{supplied} / {ordered} {item.unit || ''} supplied</Text>
                    <Text style={styles.meta}>{item.load_count || 0} load{item.load_count !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }, pct >= 100 && styles.progressFillDone]} />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          }}
        />
      )}
      {selectedProject?.id && <FAB onPress={() => navigation.navigate('CreateMaterialTrackerEntry')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: theme.spacing.md, paddingVertical: 10, backgroundColor: theme.colors.card, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  tabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  ref: { fontSize: 13, fontWeight: '700', color: theme.colors.text, flexShrink: 1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  typeBadgeRmc: { backgroundColor: '#E0F2FE' },
  typeBadgeSteel: { backgroundColor: '#EDE9FE' },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  typeBadgeTextRmc: { color: '#0369A1' },
  typeBadgeTextSteel: { color: '#6D28D9' },
  vendor: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  meta: { fontSize: 11, color: theme.colors.muted, fontWeight: '600' },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: theme.colors.surface, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: theme.colors.primary },
  progressFillDone: { backgroundColor: theme.colors.success },
});
