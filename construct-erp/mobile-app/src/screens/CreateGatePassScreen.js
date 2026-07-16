import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { gatePassAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import { theme } from '../theme';

const PASS_TYPES = [
  { id: 'non_returnable', label: 'Non-returnable' },
  { id: 'returnable',     label: 'Returnable' },
];

function emptyItem() { return { particulars: '', unit: '', quantity: '', remarks: '' }; }

export default function CreateGatePassScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { selectedProject } = useAuth();

  const [passType, setPassType]     = useState('non_returnable');
  const [vehicleNo, setVehicleNo]   = useState('');
  const [issuedBy, setIssuedBy]     = useState('');
  const [issuedTo, setIssuedTo]     = useState('');
  const [indentedBy, setIndentedBy] = useState('');
  const [authorisedBy, setAuthorisedBy] = useState('');
  const [remarks, setRemarks]       = useState('');
  const [items, setItems]           = useState([emptyItem()]);

  const createMutation = useMutation({
    mutationFn: (payload) => gatePassAPI.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gate-pass-list'] });
      Alert.alert('Created', 'Gate pass created successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not create gate pass'),
  });

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const submit = () => {
    const validItems = items.filter(it => it.particulars.trim());
    if (!validItems.length) return Alert.alert('Add at least one item');
    createMutation.mutate({
      project_id: selectedProject.id,
      pass_type: passType,
      vehicle_no: vehicleNo || null,
      issued_by: issuedBy || null,
      issued_to: issuedTo || null,
      indented_by: indentedBy || null,
      authorised_by: authorisedBy || null,
      remarks: remarks || null,
      items: validItems,
    });
  };

  return (
    <Screen>
      <ScreenHeader title="New Gate Pass" subtitle={selectedProject?.name} showBack />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12, paddingBottom: 40 }}>
        <Card>
          <Text style={styles.label}>Pass Type</Text>
          <View style={styles.chipsRow}>
            {PASS_TYPES.map(t => (
              <TouchableOpacity key={t.id} onPress={() => setPassType(t.id)} style={[styles.chip, passType === t.id && styles.chipActive]}>
                <Text style={[styles.chipText, passType === t.id && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Vehicle No.</Text>
          <TextInput value={vehicleNo} onChangeText={setVehicleNo} placeholder="e.g. MH12AB1234" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Issued By</Text>
          <TextInput value={issuedBy} onChangeText={setIssuedBy} placeholder="Name" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Issued To</Text>
          <TextInput value={issuedTo} onChangeText={setIssuedTo} placeholder="Recipient / driver name" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Indented By</Text>
          <TextInput value={indentedBy} onChangeText={setIndentedBy} placeholder="Name" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Authorised By</Text>
          <TextInput value={authorisedBy} onChangeText={setAuthorisedBy} placeholder="Name" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Remarks</Text>
          <TextInput value={remarks} onChangeText={setRemarks} placeholder="Optional notes…" placeholderTextColor={theme.colors.muted} style={styles.input} />
        </Card>

        <View style={styles.itemsHeader}>
          <Text style={styles.sectionTitle}>Items</Text>
          <TouchableOpacity onPress={addItem} style={styles.addBtn}>
            <MaterialCommunityIcons name="plus" size={14} color={theme.colors.primary} />
            <Text style={styles.addBtnText}>Add Item</Text>
          </TouchableOpacity>
        </View>

        {items.map((it, idx) => (
          <Card key={idx}>
            <View style={styles.itemRowTop}>
              <Text style={styles.itemIndex}>Item {idx + 1}</Text>
              {items.length > 1 && (
                <TouchableOpacity onPress={() => removeItem(idx)}>
                  <MaterialCommunityIcons name="close-circle-outline" size={18} color={theme.colors.danger} />
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              value={it.particulars}
              onChangeText={(v) => updateItem(idx, 'particulars', v)}
              placeholder="Particulars *"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
            />
            <View style={styles.row2}>
              <TextInput
                value={it.quantity}
                onChangeText={(v) => updateItem(idx, 'quantity', v)}
                placeholder="Quantity"
                keyboardType="numeric"
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, { flex: 1 }]}
              />
              <TextInput
                value={it.unit}
                onChangeText={(v) => updateItem(idx, 'unit', v)}
                placeholder="Unit"
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, { flex: 1 }]}
              />
            </View>
            <TextInput
              value={it.remarks}
              onChangeText={(v) => updateItem(idx, 'remarks', v)}
              placeholder="Remarks (optional)"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
            />
          </Card>
        ))}

        <Button title="Create Gate Pass" onPress={submit} loading={createMutation.isPending} style={{ marginTop: 8 }} />
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
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: '#fff' },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  itemRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemIndex: { fontSize: 11, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase' },
  row2: { flexDirection: 'row', gap: 10 },
});
