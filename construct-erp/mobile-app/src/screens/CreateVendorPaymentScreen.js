import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { vendorPaymentsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import { theme } from '../theme';

const PAYMENT_TYPES = ['vendor', 'subcontractor', 'labour', 'consultant', 'other'];
const PAYMENT_MODES = ['RTGS', 'NEFT', 'IMPS', 'UPI', 'Cheque', 'Cash', 'DD'];
const STATUSES     = ['paid', 'pending', 'processing'];

function ToggleRow({ label, options, value, onChange }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
        {options.map(o => (
          <TouchableOpacity
            key={o}
            style={[styles.toggleBtn, value === o && styles.toggleBtnActive]}
            onPress={() => onChange(o)}
          >
            <Text style={[styles.toggleText, value === o && styles.toggleTextActive]}>
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType = 'default', multiline }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || label}
        placeholderTextColor={theme.colors.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

export default function CreateVendorPaymentScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { selectedProject } = useAuth();

  const [paymentType, setPaymentType] = useState('vendor');
  const [entityName, setEntityName]   = useState('');
  const [entityPan, setEntityPan]     = useState('');
  const [amount, setAmount]           = useState('');
  const [tdsDeducted, setTdsDeducted] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [mode, setMode]               = useState('NEFT');
  const [refNo, setRefNo]             = useState('');
  const [bankName, setBankName]       = useState('');
  const [costHead, setCostHead]       = useState('');
  const [remarks, setRemarks]         = useState('');
  const [status, setStatus]           = useState('paid');

  const createMutation = useMutation({
    mutationFn: (payload) => vendorPaymentsAPI.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-payments-list'] });
      Alert.alert('Recorded', 'Payment recorded successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not record payment'),
  });

  const handleSubmit = () => {
    if (!entityName.trim()) return Alert.alert('Required', 'Entity name is required.');
    if (!amount || isNaN(parseFloat(amount))) return Alert.alert('Required', 'Enter a valid amount.');
    if (!paymentDate.trim()) return Alert.alert('Required', 'Payment date is required (YYYY-MM-DD).');

    createMutation.mutate({
      project_id:       selectedProject?.id,
      payment_type:     paymentType,
      entity_name:      entityName.trim(),
      entity_pan:       entityPan.trim() || undefined,
      amount:           parseFloat(amount),
      tds_deducted:     parseFloat(tdsDeducted) || 0,
      payment_date:     paymentDate.trim(),
      payment_mode:     mode,
      reference_number: refNo.trim() || undefined,
      bank_name:        bankName.trim() || undefined,
      cost_head:        costHead.trim() || undefined,
      remarks:          remarks.trim() || undefined,
      status,
    });
  };

  return (
    <Screen>
      <ScreenHeader title="Record Payment" showBack />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 4, paddingBottom: 40 }}>
        <Card>
          <ToggleRow label="Payment Type" options={PAYMENT_TYPES} value={paymentType} onChange={setPaymentType} />
          <Field label="Entity Name *" value={entityName} onChange={setEntityName} placeholder="Vendor / subcontractor name" />
          <Field label="Entity PAN" value={entityPan} onChange={setEntityPan} placeholder="ABCDE1234F" />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Field label="Amount (₹) *" value={amount} onChange={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
          <Field label="TDS Deducted (₹)" value={tdsDeducted} onChange={setTdsDeducted} keyboardType="decimal-pad" placeholder="0.00" />
          {amount && tdsDeducted ? (
            <Text style={styles.netPreview}>
              Net: ₹{(parseFloat(amount || 0) - parseFloat(tdsDeducted || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </Text>
          ) : null}
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Field label="Payment Date * (YYYY-MM-DD)" value={paymentDate} onChange={setPaymentDate} placeholder="2025-01-15" />
          <ToggleRow label="Payment Mode" options={PAYMENT_MODES} value={mode} onChange={setMode} />
          <Field label="Reference / Cheque No." value={refNo} onChange={setRefNo} placeholder="UTR / Cheque number" />
          <Field label="Bank Name" value={bankName} onChange={setBankName} placeholder="HDFC Bank" />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Field label="Cost Head" value={costHead} onChange={setCostHead} placeholder="e.g. Civil Works" />
          <Field label="Remarks" value={remarks} onChange={setRemarks} multiline placeholder="Optional notes..." />
          <ToggleRow label="Status" options={STATUSES} value={status} onChange={setStatus} />
        </Card>

        <Button
          title="Record Payment"
          onPress={handleSubmit}
          loading={createMutation.isPending}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
    padding: 10, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surface,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  toggleBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  toggleBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  toggleText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  toggleTextActive: { color: '#fff' },
  netPreview: { fontSize: 13, fontWeight: '700', color: theme.colors.success, marginTop: -4, marginBottom: 4 },
});
