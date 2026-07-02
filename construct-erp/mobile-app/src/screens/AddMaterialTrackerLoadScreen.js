import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { materialTrackerAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import { theme } from '../theme';

const DIA_COLS = ['dia_8mm', 'dia_10mm', 'dia_12mm', 'dia_16mm', 'dia_20mm', 'dia_25mm', 'dia_32mm'];

export default function AddMaterialTrackerLoadScreen({ route }) {
  const { entryId, materialType } = route.params;
  const navigation = useNavigation();
  const qc = useQueryClient();
  const isSteel = materialType === 'steel';

  const [receivedDate, setReceivedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [vehicleNo, setVehicleNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [ignNo, setIgnNo] = useState('');
  const [grsNo, setGrsNo] = useState('');
  const [invoiceQty, setInvoiceQty] = useState('');
  const [weighbridgeQty, setWeighbridgeQty] = useState('');
  const [rate, setRate] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [remarks, setRemarks] = useState('');
  const [dia, setDia] = useState({});

  const diaTotal = DIA_COLS.reduce((s, k) => s + (parseFloat(dia[k]) || 0), 0);
  const grandTotal = useMemo(() => {
    const qty = parseFloat(invoiceQty) || 0;
    const r = parseFloat(rate) || 0;
    const gst = parseFloat(gstRate) || 0;
    const basic = qty * r;
    return basic + (basic * gst) / 100;
  }, [invoiceQty, rate, gstRate]);

  const createMutation = useMutation({
    mutationFn: (payload) => materialTrackerAPI.addLoad(entryId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-tracker-detail', entryId] });
      qc.invalidateQueries({ queryKey: ['material-tracker'] });
      Alert.alert('Added', 'Load entry recorded.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not add load'),
  });

  const submit = () => {
    if (!receivedDate) return Alert.alert('Received date is required');
    if (!invoiceQty) return Alert.alert('Invoice quantity is required');
    if (isSteel && invoiceQty && Math.abs(diaTotal - parseFloat(invoiceQty)) > 0.01) {
      return Alert.alert('Diameter mismatch', `Dia total (${diaTotal.toFixed(3)}) must equal invoice qty (${invoiceQty})`);
    }
    createMutation.mutate({
      received_date: receivedDate,
      vehicle_no: vehicleNo,
      invoice_no: invoiceNo,
      ign_no: ignNo,
      grs_no: grsNo,
      invoice_qty: invoiceQty,
      weighbridge_qty: weighbridgeQty || undefined,
      rate: rate || undefined,
      gst_rate: gstRate || 18,
      grand_total: grandTotal || undefined,
      remarks,
      dia: isSteel ? dia : undefined,
    });
  };

  return (
    <Screen>
      <ScreenHeader title="Add Delivery Load" showBack />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}>
        <Card>
          <Text style={styles.label}>Received Date *</Text>
          <TextInput value={receivedDate} onChangeText={setReceivedDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Vehicle No.</Text>
          <TextInput value={vehicleNo} onChangeText={setVehicleNo} placeholder="KA01AB1234" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <View style={styles.row3}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Invoice No.</Text>
              <TextInput value={invoiceNo} onChangeText={setInvoiceNo} placeholder="INV-001" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>IGN No.</Text>
              <TextInput value={ignNo} onChangeText={setIgnNo} placeholder="IGN/…" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
          </View>
          <Text style={styles.label}>GRS No.</Text>
          <TextInput value={grsNo} onChangeText={setGrsNo} placeholder="GRS/…" placeholderTextColor={theme.colors.muted} style={[styles.input, { marginBottom: 0 }]} />
        </Card>

        <Card>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Invoice Qty *</Text>
              <TextInput value={invoiceQty} onChangeText={setInvoiceQty} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Weighbridge Qty</Text>
              <TextInput value={weighbridgeQty} onChangeText={setWeighbridgeQty} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
          </View>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Rate (₹)</Text>
              <TextInput value={rate} onChangeText={setRate} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>GST %</Text>
              <TextInput value={gstRate} onChangeText={setGstRate} keyboardType="numeric" placeholder="18" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Grand Total (auto)</Text>
            <Text style={styles.totalValue}>₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
          </View>
        </Card>

        {isSteel && (
          <Card>
            <Text style={styles.sectionTitle}>Diameter Breakdown (MT)</Text>
            <Text style={styles.hint}>Total must equal invoice qty ({diaTotal.toFixed(3)} / {invoiceQty || 0})</Text>
            <View style={styles.diaGrid}>
              {DIA_COLS.map(k => (
                <View key={k} style={styles.diaField}>
                  <Text style={styles.diaLabel}>{k.replace('dia_', '')}</Text>
                  <TextInput
                    value={dia[k] || ''}
                    onChangeText={(v) => setDia(p => ({ ...p, [k]: v }))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.colors.muted}
                    style={styles.diaInput}
                  />
                </View>
              ))}
            </View>
          </Card>
        )}

        <Card>
          <Text style={styles.label}>Remarks</Text>
          <TextInput value={remarks} onChangeText={setRemarks} placeholder="Optional notes…" placeholderTextColor={theme.colors.muted} style={[styles.input, { marginBottom: 0 }]} />
        </Card>

        <Button title="Add Load" onPress={submit} loading={createMutation.isPending} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 4 },
  hint: { fontSize: 11, color: theme.colors.muted, marginBottom: 10 },
  input: {
    height: 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingHorizontal: 12, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10,
  },
  row2: { flexDirection: 'row', gap: 10 },
  row3: { flexDirection: 'row', gap: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  totalLabel: { fontSize: 12, color: theme.colors.muted, fontWeight: '600' },
  totalValue: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  diaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  diaField: { width: '30%' },
  diaLabel: { fontSize: 11, color: theme.colors.muted, marginBottom: 4, fontWeight: '600' },
  diaInput: {
    height: 38, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingHorizontal: 8, fontSize: 13, color: theme.colors.text, backgroundColor: theme.colors.surface,
  },
});
