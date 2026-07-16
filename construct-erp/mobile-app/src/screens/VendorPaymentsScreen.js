import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { vendorPaymentsAPI } from '../api/client';
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

const ALLOWED_ROLES = ['super_admin', 'admin', 'accountant'];
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const MODE_ICONS = {
  rtgs: 'bank-transfer', neft: 'bank-transfer', imps: 'bank-transfer',
  upi: 'cellphone-wireless', cheque: 'checkbook', cash: 'cash', dd: 'file-document-outline',
};

export default function VendorPaymentsScreen() {
  const navigation = useNavigation();
  const { selectedProject, user } = useAuth();
  const canCreate = ALLOWED_ROLES.includes(user?.role);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['vendor-payments-list', selectedProject?.id],
    queryFn: () => vendorPaymentsAPI.list(selectedProject?.id).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!selectedProject?.id,
  });

  const items = data || [];

  return (
    <Screen>
      <ScreenHeader title="Vendor Payments" subtitle={selectedProject?.name} />
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message="Couldn't load payments" onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="wallet-outline" title="No payments yet" subtitle="Recorded vendor & subcontractor payments appear here." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 10, paddingBottom: canCreate ? 90 : 24 }}
          renderItem={({ item }) => {
            const modeIcon = MODE_ICONS[item.payment_mode?.toLowerCase()] || 'credit-card-outline';
            return (
              <TouchableOpacity onPress={() => navigation.navigate('VendorPaymentDetail', { id: item.id })}>
                <Card>
                  <View style={styles.rowTop}>
                    <View style={styles.leftGroup}>
                      <MaterialCommunityIcons name={modeIcon} size={16} color={theme.colors.primary} />
                      <Text style={styles.entity} numberOfLines={1}>{item.entity_name || '—'}</Text>
                    </View>
                    <StatusBadge status={item.status || 'paid'} />
                  </View>
                  <View style={styles.rowMid}>
                    <Text style={styles.amount}>{money(item.amount)}</Text>
                    {item.tds_deducted > 0 && (
                      <Text style={styles.tds}>TDS: {money(item.tds_deducted)}</Text>
                    )}
                  </View>
                  <View style={styles.rowBottom}>
                    <Text style={styles.meta}>
                      {item.payment_mode?.toUpperCase() || ''}
                      {item.payment_type ? ` · ${item.payment_type}` : ''}
                    </Text>
                    <Text style={styles.date}>
                      {item.payment_date ? dayjs(item.payment_date).format('DD MMM YYYY') : ''}
                    </Text>
                  </View>
                  {item.reference_number ? (
                    <Text style={styles.ref}>Ref: {item.reference_number}</Text>
                  ) : null}
                </Card>
              </TouchableOpacity>
            );
          }}
        />
      )}
      {canCreate && selectedProject?.id && (
        <FAB onPress={() => navigation.navigate('CreateVendorPayment')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leftGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  entity: { fontSize: 14, fontWeight: '700', color: theme.colors.text, flex: 1 },
  rowMid: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  amount: { fontSize: 17, fontWeight: '800', color: theme.colors.text, fontVariant: ['tabular-nums'] },
  tds: { fontSize: 11, color: theme.colors.muted, fontVariant: ['tabular-nums'] },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  meta: { fontSize: 11, color: theme.colors.muted },
  date: { fontSize: 11, color: theme.colors.muted },
  ref: { fontSize: 11, color: theme.colors.muted, marginTop: 4, fontFamily: 'monospace' },
});
