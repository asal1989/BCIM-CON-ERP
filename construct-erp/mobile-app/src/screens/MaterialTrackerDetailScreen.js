import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { materialTrackerAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import FAB from '../components/FAB';
import { theme } from '../theme';

export default function MaterialTrackerDetailScreen({ route }) {
  const { id } = route.params;
  const navigation = useNavigation();

  const { data: entry, isLoading, isError, refetch } = useQuery({
    queryKey: ['material-tracker-detail', id],
    queryFn: () => materialTrackerAPI.detail(id).then(r => r.data?.data ?? null),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Material Tracker" showBack />
        <ErrorState message="Couldn't load entry" onRetry={refetch} />
      </Screen>
    );
  }

  const loads = entry?.loads || [];
  const isSteel = entry?.material_type === 'steel';
  const ordered = Number(entry?.ordered_qty || 0);
  const supplied = Number(entry?.supplied_qty || 0);
  const balance = Number(entry?.balance_qty ?? (ordered - supplied));

  return (
    <Screen>
      <ScreenHeader title={entry?.po_number || 'Material Tracker'} subtitle={entry?.project_name} showBack />
      {!isLoading && entry && (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12, paddingBottom: 90 }}>
          <Card>
            <MetaRow label="Material Type" value={isSteel ? 'Steel' : 'RMC (Concrete)'} />
            <MetaRow label="Vendor" value={entry.vendor_name} />
            <MetaRow label="Grade" value={entry.grade} />
            <MetaRow label="MR Number" value={entry.mr_number} />
            <MetaRow label="MR Qty" value={entry.mr_qty} last />
          </Card>

          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{ordered}</Text>
              <Text style={styles.statLabel}>Ordered ({entry.unit})</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, styles.statValueOk]}>{supplied}</Text>
              <Text style={styles.statLabel}>Supplied</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, balance > 0 && styles.statValueWarn]}>{balance}</Text>
              <Text style={styles.statLabel}>Balance</Text>
            </Card>
          </View>

          <Text style={styles.sectionTitle}>Delivery Loads ({loads.length})</Text>
          {loads.length === 0 ? (
            <EmptyState icon="truck-outline" title="No loads recorded yet" />
          ) : loads.map((load, i) => {
            const diff = Number(load.difference || 0);
            const mismatch = Math.abs(diff) > 0.01;
            return (
              <Card key={load.id || i}>
                <View style={styles.loadRowTop}>
                  <Text style={styles.loadDate}>{load.received_date ? dayjs(load.received_date).format('DD MMM YYYY') : '—'}</Text>
                  {!!load.grand_total && <Text style={styles.loadAmount}>₹{Number(load.grand_total).toLocaleString('en-IN')}</Text>}
                </View>
                <View style={styles.loadQtyRow}>
                  <Text style={styles.loadQty}>Invoice: <Text style={styles.loadQtyValue}>{load.invoice_qty ?? '—'}</Text></Text>
                  <Text style={styles.loadQty}>Weighbridge: <Text style={styles.loadQtyValue}>{load.weighbridge_qty ?? '—'}</Text></Text>
                  {mismatch && (
                    <View style={styles.mismatchBadge}>
                      <MaterialCommunityIcons name="alert-outline" size={11} color={theme.colors.danger} />
                      <Text style={styles.mismatchText}>{diff > 0 ? '+' : ''}{diff.toFixed(3)}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.loadRefRow}>
                  {load.vehicle_no ? <Text style={styles.loadRef}>🚛 {load.vehicle_no}</Text> : null}
                  {load.invoice_no ? <Text style={styles.loadRef}>Inv: {load.invoice_no}</Text> : null}
                  {load.ign_no ? <Text style={styles.loadRef}>IGN: {load.ign_no}</Text> : null}
                </View>
                {isSteel && (
                  <View style={styles.diaRow}>
                    {['dia_8mm','dia_10mm','dia_12mm','dia_16mm','dia_20mm','dia_25mm','dia_32mm'].map(k => (
                      Number(load[k]) > 0 && (
                        <View key={k} style={styles.diaChip}>
                          <Text style={styles.diaChipText}>{k.replace('dia_', '')}: {load[k]}</Text>
                        </View>
                      )
                    ))}
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
      <FAB onPress={() => navigation.navigate('AddMaterialTrackerLoad', { entryId: id, materialType: entry?.material_type })} />
    </Screen>
  );
}

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaLabel: { fontSize: 12, color: theme.colors.muted },
  metaValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  statValue: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  statValueOk: { color: theme.colors.success },
  statValueWarn: { color: theme.colors.warning },
  statLabel: { fontSize: 9, color: theme.colors.muted, marginTop: 3, textAlign: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  loadRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loadDate: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  loadAmount: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  loadQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  loadQty: { fontSize: 12, color: theme.colors.muted },
  loadQtyValue: { fontWeight: '700', color: theme.colors.text },
  mismatchBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  mismatchText: { fontSize: 10, fontWeight: '800', color: theme.colors.danger },
  loadRefRow: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  loadRef: { fontSize: 11, color: theme.colors.muted },
  diaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  diaChip: { backgroundColor: theme.colors.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  diaChipText: { fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary },
});
