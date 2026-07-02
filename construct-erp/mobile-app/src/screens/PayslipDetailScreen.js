import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { essAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ErrorState from '../components/ErrorState';
import { theme } from '../theme';

export default function PayslipDetailScreen({ route }) {
  const { id } = route.params;
  const { data: slip, isError, refetch } = useQuery({
    queryKey: ['payslip-detail', id],
    queryFn: () => essAPI.payslipDetail(id).then(r => r.data?.data ?? null),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Payslip" showBack />
        <ErrorState message="Couldn't load payslip" onRetry={refetch} />
      </Screen>
    );
  }

  const earnings   = slip?.earnings   || [];
  const deductions = slip?.deductions || [];

  const handleDownload = async () => {
    if (!slip) return;
    const lines = [
      `Payslip — ${slip.month} ${slip.year}`,
      '',
      'Earnings:',
      ...earnings.map(e => `  ${e.label || e.component}: ₹${Number(e.amount || 0).toLocaleString('en-IN')}`),
      '',
      'Deductions:',
      ...deductions.map(d => `  ${d.label || d.component}: ₹${Number(d.amount || 0).toLocaleString('en-IN')}`),
      '',
      `Net Pay: ₹${Number(slip.net_pay || 0).toLocaleString('en-IN')}`,
    ];
    try {
      await Share.share({ message: lines.join('\n'), title: `Payslip ${slip.month} ${slip.year}` });
    } catch (e) {
      Alert.alert('Failed', 'Could not share payslip');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={slip ? `${slip.month} ${slip.year}` : 'Payslip'}
        showBack
        right={slip && (
          <TouchableOpacity onPress={handleDownload} style={styles.downloadBtn}>
            <MaterialCommunityIcons name="tray-arrow-down" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
        )}
      />
      {slip && (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}>
          <Card style={styles.netCard}>
            <Text style={styles.netLabel}>Net Pay</Text>
            <Text style={styles.netValue}>₹{Number(slip.net_pay || 0).toLocaleString('en-IN')}</Text>
          </Card>

          <Text style={styles.sectionTitle}>Earnings</Text>
          <Card>
            {earnings.map((e, i) => (
              <Row key={i} label={e.label || e.component} value={e.amount} last={i === earnings.length - 1} />
            ))}
            {earnings.length === 0 && <Text style={styles.empty}>No earnings breakdown available</Text>}
          </Card>

          <Text style={styles.sectionTitle}>Deductions</Text>
          <Card>
            {deductions.map((d, i) => (
              <Row key={i} label={d.label || d.component} value={d.amount} negative last={i === deductions.length - 1} />
            ))}
            {deductions.length === 0 && <Text style={styles.empty}>No deductions</Text>}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}

function Row({ label, value, negative, last }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, negative && styles.rowValueNeg]}>
        {negative ? '-' : ''}₹{Number(value || 0).toLocaleString('en-IN')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  downloadBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  netCard: { alignItems: 'center', backgroundColor: theme.colors.dark },
  netLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  netValue: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  rowLabel: { fontSize: 13, color: theme.colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  rowValueNeg: { color: theme.colors.danger },
  empty: { fontSize: 12, color: theme.colors.muted, paddingVertical: 8 },
});
