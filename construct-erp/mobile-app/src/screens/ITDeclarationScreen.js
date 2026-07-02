import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { taxDeclarationAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import ErrorState from '../components/ErrorState';
import { theme } from '../theme';

function currentFinancialYear() {
  const now = dayjs();
  // Indian FY: Apr–Mar
  const startYear = now.month() >= 3 ? now.year() : now.year() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export default function ITDeclarationScreen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fy = currentFinancialYear();
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [remarks, setRemarks] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tax-declarations', fy],
    queryFn: () => taxDeclarationAPI.list(fy).then(r => r.data?.data ?? r.data ?? []),
  });

  const myDeclaration = (data || []).find(d => d.user_id === user?.id);

  const createMutation = useMutation({
    mutationFn: (payload) => taxDeclarationAPI.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-declarations', fy] });
      Alert.alert('Submitted', 'Your IT declaration has been submitted for FY ' + fy);
      setDeclaredAmount('');
      setRemarks('');
    },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not submit declaration'),
  });

  const submit = () => {
    if (!declaredAmount) return Alert.alert('Enter your declared investment amount');
    createMutation.mutate({ financial_year: fy, declared_amount: declaredAmount, remarks });
  };

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="IT Declaration" showBack />
        <ErrorState message="Couldn't load declaration" onRetry={refetch} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="IT Declaration" subtitle={`FY ${fy}`} showBack />
      {!isLoading && (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}>
          {myDeclaration ? (
            <Card>
              <View style={styles.rowTop}>
                <Text style={styles.title}>Your Declaration</Text>
                <StatusBadge status={myDeclaration.status} />
              </View>
              <View style={styles.amountRow}>
                <View>
                  <Text style={styles.amountLabel}>Declared</Text>
                  <Text style={styles.amountValue}>₹{Number(myDeclaration.declared_amount || 0).toLocaleString('en-IN')}</Text>
                </View>
                <View>
                  <Text style={styles.amountLabel}>Approved</Text>
                  <Text style={styles.amountValueApproved}>₹{Number(myDeclaration.approved_amount || 0).toLocaleString('en-IN')}</Text>
                </View>
              </View>
              {myDeclaration.remarks ? <Text style={styles.remarks}>{myDeclaration.remarks}</Text> : null}
            </Card>
          ) : (
            <Card>
              <Text style={styles.title}>Submit Declaration for FY {fy}</Text>
              <Text style={styles.label}>Declared Investment Amount (₹) *</Text>
              <TextInput
                value={declaredAmount}
                onChangeText={setDeclaredAmount}
                keyboardType="numeric"
                placeholder="e.g. 150000"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
              />
              <Text style={styles.label}>Remarks</Text>
              <TextInput
                value={remarks}
                onChangeText={setRemarks}
                placeholder="80C, 80D investments, HRA proof etc…"
                placeholderTextColor={theme.colors.muted}
                multiline
                numberOfLines={3}
                style={[styles.input, styles.textarea, { marginBottom: 0 }]}
              />
              <Button title="Submit Declaration" onPress={submit} loading={createMutation.isPending} style={{ marginTop: 12 }} />
            </Card>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  amountRow: { flexDirection: 'row', gap: 24, marginTop: 14 },
  amountLabel: { fontSize: 11, color: theme.colors.muted, fontWeight: '600' },
  amountValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginTop: 3 },
  amountValueApproved: { fontSize: 18, fontWeight: '800', color: theme.colors.success, marginTop: 3 },
  remarks: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 12, fontStyle: 'italic' },
  label: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    height: 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingHorizontal: 12, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10,
  },
  textarea: { height: 80, paddingTop: 10, textAlignVertical: 'top' },
});
