import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { currentSalaryAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { theme } from '../theme';

export default function CurrentSalaryScreen() {
  const { user } = useAuth();

  const { data: salary, isLoading, isError, refetch } = useQuery({
    queryKey: ['current-salary', user?.id],
    queryFn: () => currentSalaryAPI.get(user.id).then(r => r.data?.data ?? null),
    enabled: !!user?.id,
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Current Salary" showBack />
        <ErrorState message="Couldn't load salary details" onRetry={refetch} />
      </Screen>
    );
  }

  const components = salary ? [
    { label: 'Basic', value: salary.basic },
    { label: 'HRA', value: salary.hra },
    { label: 'Conveyance', value: salary.conveyance },
    { label: 'Medical', value: salary.medical },
    { label: 'Special Allowance', value: salary.special_allowance },
    { label: 'Other Allowance', value: salary.other_allowance },
  ].filter(c => Number(c.value) > 0) : [];

  return (
    <Screen>
      <ScreenHeader title="Current Salary" subtitle={salary?.structure_name} showBack />
      {!isLoading && !salary ? (
        <EmptyState icon="cash-multiple" title="No salary record found" subtitle="Contact HR if this seems incorrect." />
      ) : !isLoading && salary ? (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}>
          <Card style={styles.ctcCard}>
            <Text style={styles.ctcLabel}>Annual CTC</Text>
            <Text style={styles.ctcValue}>₹{Number(salary.ctc_annual || 0).toLocaleString('en-IN')}</Text>
            <Text style={styles.grossLabel}>Gross Monthly: ₹{Number(salary.gross_monthly || 0).toLocaleString('en-IN')}</Text>
          </Card>

          <Text style={styles.sectionTitle}>Salary Components</Text>
          <Card>
            {components.map((c, i) => (
              <View key={c.label} style={[styles.row, i < components.length - 1 && styles.rowBorder]}>
                <Text style={styles.label}>{c.label}</Text>
                <Text style={styles.value}>₹{Number(c.value).toLocaleString('en-IN')}</Text>
              </View>
            ))}
            {components.length === 0 && <Text style={styles.empty}>No component breakdown available</Text>}
          </Card>

          <Text style={styles.sectionTitle}>Statutory Applicability</Text>
          <Card>
            <StatutoryRow label="PF Applicable" value={salary.pf_applicable} />
            <StatutoryRow label="ESI Applicable" value={salary.esi_applicable} />
            <StatutoryRow label="PT Applicable" value={salary.pt_applicable} last />
          </Card>

          <Text style={styles.effectiveText}>Effective from {salary.effective_from ? String(salary.effective_from).slice(0, 10) : '—'}</Text>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function StatutoryRow({ label, value, last }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.pill, value ? styles.pillYes : styles.pillNo]}>
        <Text style={[styles.pillText, value ? styles.pillTextYes : styles.pillTextNo]}>{value ? 'Yes' : 'No'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ctcCard: { alignItems: 'center', backgroundColor: theme.colors.dark },
  ctcLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase' },
  ctcValue: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 6 },
  grossLabel: { fontSize: 12, color: '#94A3B8', marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  label: { fontSize: 13, color: theme.colors.textSecondary },
  value: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pillYes: { backgroundColor: '#DCFCE7' },
  pillNo: { backgroundColor: '#F1F5F9' },
  pillText: { fontSize: 11, fontWeight: '700' },
  pillTextYes: { color: '#15803D' },
  pillTextNo: { color: theme.colors.muted },
  empty: { fontSize: 12, color: theme.colors.muted, textAlign: 'center', paddingVertical: 8 },
  effectiveText: { fontSize: 11, color: theme.colors.muted, textAlign: 'center', marginTop: 4 },
});
