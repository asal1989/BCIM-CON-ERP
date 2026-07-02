import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { materialTrackerAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import { theme } from '../theme';

const TYPES = [{ key: 'rmc', label: 'RMC (Concrete)' }, { key: 'steel', label: 'Steel' }];

export default function CreateMaterialTrackerEntryScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { selectedProject } = useAuth();

  const [materialType, setMaterialType] = useState('rmc');
  const [poNumber, setPoNumber] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [grade, setGrade] = useState('');
  const [mrNumber, setMrNumber] = useState('');
  const [mrQty, setMrQty] = useState('');
  const [orderedQty, setOrderedQty] = useState('');
  const [unit, setUnit] = useState('');

  const createMutation = useMutation({
    mutationFn: (payload) => materialTrackerAPI.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-tracker'] });
      Alert.alert('Created', 'PO registered for tracking.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not register PO'),
  });

  const submit = () => {
    if (!poNumber.trim()) return Alert.alert('PO number is required');
    createMutation.mutate({
      project_id: selectedProject.id,
      material_type: materialType,
      po_number: poNumber,
      vendor_name: vendorName,
      grade,
      mr_number: mrNumber,
      mr_qty: mrQty || undefined,
      ordered_qty: orderedQty || undefined,
      unit,
    });
  };

  return (
    <Screen>
      <ScreenHeader title="Register PO for Tracking" subtitle={selectedProject?.name} showBack />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}>
        <Card>
          <Text style={styles.label}>Material Type</Text>
          <View style={styles.chipsRow}>
            {TYPES.map(t => (
              <TouchableOpacity key={t.key} onPress={() => setMaterialType(t.key)} style={[styles.chip, materialType === t.key && styles.chipActive]}>
                <Text style={[styles.chipText, materialType === t.key && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>PO Number *</Text>
          <TextInput value={poNumber} onChangeText={setPoNumber} placeholder="POTQS-001" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Vendor Name</Text>
          <TextInput value={vendorName} onChangeText={setVendorName} placeholder="Vendor name" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Grade</Text>
          <TextInput value={grade} onChangeText={setGrade} placeholder={materialType === 'steel' ? 'Fe500' : 'M25'} placeholderTextColor={theme.colors.muted} style={styles.input} />

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>MR Number</Text>
              <TextInput value={mrNumber} onChangeText={setMrNumber} placeholder="MR-001" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>MR Qty</Text>
              <TextInput value={mrQty} onChangeText={setMrQty} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Ordered Qty</Text>
              <TextInput value={orderedQty} onChangeText={setOrderedQty} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Unit</Text>
              <TextInput value={unit} onChangeText={setUnit} placeholder={materialType === 'steel' ? 'MT' : 'Cum'} placeholderTextColor={theme.colors.muted} style={[styles.input, { marginBottom: 0 }]} />
            </View>
          </View>
        </Card>

        <Button title="Register PO" onPress={submit} loading={createMutation.isPending} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 4 },
  input: {
    height: 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingHorizontal: 12, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10,
  },
  row2: { flexDirection: 'row', gap: 10 },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: '#fff' },
});
