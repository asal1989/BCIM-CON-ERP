import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pettyCashAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import { theme } from '../theme';

function emptyItem() {
  return { material_name: '', unit: "NOS", quantity: '', rate: '' };
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

export default function CreatePettyCashEntryScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { selectedProject } = useAuth();

  const [entryDate, setEntryDate]   = useState('');
  const [supplier, setSupplier]     = useState('');
  const [invoiceNo, setInvoiceNo]   = useState('');
  const [gstPct, setGstPct]         = useState('');
  const [remarks, setRemarks]       = useState('');
  const [items, setItems]           = useState([emptyItem()]);

  const updateItem = (idx, field, value) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  const addItem    = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  // Compute totals from items
  const buildLines = () => items
    .filter(it => it.material_name?.trim())
    .map(it => {
      const qty  = parseFloat(it.quantity) || 0;
      const rate = parseFloat(it.rate) || 0;
      const gst  = parseFloat(gstPct) || 0;
      const basic = qty * rate;
      const gstAmt = basic * gst / 100;
      const tot  = basic + gstAmt;
      return {
        material_name: it.material_name.trim(),
        unit:  it.unit?.trim() || 'NOS',
        quantity: qty,
        rate,
        gst_pct:    gst,
        gst_amount: parseFloat(gstAmt.toFixed(2)),
        total_amount: parseFloat(tot.toFixed(2)),
      };
    });

  const createMutation = useMutation({
    mutationFn: (payload) => pettyCashAPI.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['petty-cash-list'] });
      Alert.alert('Saved', 'Petty cash entry recorded.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (e) => {
      const err = e?.response?.data;
      if (err?.errorCode === 'DUPLICATE_INVOICE') {
        Alert.alert('Duplicate Invoice', `Invoice ${invoiceNo} already exists (SL #${err.existing?.sl_no}).`);
      } else {
        Alert.alert('Failed', err?.error || 'Could not save entry');
      }
    },
  });

  const handleSubmit = () => {
    if (!entryDate.trim()) return Alert.alert('Required', 'Entry date is required (YYYY-MM-DD).');
    if (!supplier.trim())  return Alert.alert('Required', 'Supplier name is required.');
    const lines = buildLines();
    if (!lines.length)     return Alert.alert('Required', 'Add at least one material item.');

    const basicTotal = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
    const gstTotal   = lines.reduce((s, l) => s + l.gst_amount, 0);
    const grandTotal = lines.reduce((s, l) => s + l.total_amount, 0);

    createMutation.mutate({
      project_id:   selectedProject?.id,
      entry_date:   entryDate.trim(),
      supplier:     supplier.trim(),
      invoice_no:   invoiceNo.trim() || undefined,
      remarks:      remarks.trim() || undefined,
      basic_amount: parseFloat(basicTotal.toFixed(2)),
      gst_pct:      parseFloat(gstPct) || 0,
      gst_amount:   parseFloat(gstTotal.toFixed(2)),
      total_amount: parseFloat(grandTotal.toFixed(2)),
      amount:       parseFloat(grandTotal.toFixed(2)),
      items:        lines,
    });
  };

  const grandTotal = buildLines().reduce((s, l) => s + l.total_amount, 0);

  return (
    <Screen>
      <ScreenHeader title="New Petty Cash Entry" showBack />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 4, paddingBottom: 40 }}>
        <Card>
          <Field label="Entry Date * (YYYY-MM-DD)" value={entryDate} onChange={setEntryDate} placeholder="2025-01-15" />
          <Field label="Supplier / Vendor *" value={supplier} onChange={setSupplier} placeholder="Shop / vendor name" />
          <Field label="Invoice No." value={invoiceNo} onChange={setInvoiceNo} placeholder="INV-001 (optional)" />
          <Field label="GST % (applied to all items)" value={gstPct} onChange={setGstPct} keyboardType="decimal-pad" placeholder="0 / 5 / 12 / 18" />
        </Card>

        <Text style={styles.sectionTitle}>Material Items</Text>
        {items.map((it, idx) => (
          <Card key={idx} style={{ marginBottom: 6 }}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemNo}>Item {idx + 1}</Text>
              {items.length > 1 && (
                <TouchableOpacity onPress={() => removeItem(idx)}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={theme.colors.danger || '#EF4444'} />
                </TouchableOpacity>
              )}
            </View>
            <Field label="Material Name *" value={it.material_name} onChange={v => updateItem(idx, 'material_name', v)} placeholder="e.g. Cement, Fuel, Stationery" />
            <View style={styles.row3}>
              <View style={{ flex: 2 }}>
                <Field label="Unit" value={it.unit} onChange={v => updateItem(idx, 'unit', v)} placeholder="NOS" />
              </View>
              <View style={{ flex: 2 }}>
                <Field label="Qty" value={it.quantity} onChange={v => updateItem(idx, 'quantity', v)} keyboardType="decimal-pad" placeholder="0" />
              </View>
              <View style={{ flex: 3 }}>
                <Field label="Rate (₹)" value={it.rate} onChange={v => updateItem(idx, 'rate', v)} keyboardType="decimal-pad" placeholder="0.00" />
              </View>
            </View>
            {it.quantity && it.rate ? (
              <Text style={styles.lineTotal}>
                Line total: ₹{((parseFloat(it.quantity)||0)*(parseFloat(it.rate)||0)*(1+(parseFloat(gstPct)||0)/100)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            ) : null}
          </Card>
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={addItem}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.addBtnText}>Add Item</Text>
        </TouchableOpacity>

        <Card style={{ marginTop: 8 }}>
          <Field label="Remarks" value={remarks} onChange={setRemarks} multiline placeholder="Optional notes..." />
          {grandTotal > 0 && (
            <Text style={styles.grandTotal}>
              Grand Total: ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </Text>
          )}
        </Card>

        <Button
          title="Save Entry"
          onPress={handleSubmit}
          loading={createMutation.isPending}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 12, marginBottom: 6 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  itemNo: { fontSize: 12, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase' },
  row3: { flexDirection: 'row', gap: 8 },
  lineTotal: { fontSize: 12, fontWeight: '700', color: theme.colors.success, marginTop: -4, marginBottom: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, justifyContent: 'center' },
  addBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  grandTotal: { fontSize: 16, fontWeight: '800', color: theme.colors.success, textAlign: 'right', marginTop: 4 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
    padding: 10, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surface,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
});
