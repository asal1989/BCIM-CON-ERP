import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ignAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import { theme } from '../theme';

function emptyItem() { return { particulars: '', unit: '', quantity: '', remarks: '' }; }

export default function CreateIGNScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { selectedProject } = useAuth();

  const [vehicleNo, setVehicleNo] = useState('');
  const [dcNumber, setDcNumber] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [inspectedBy, setInspectedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState([emptyItem()]);

  const createMutation = useMutation({
    mutationFn: (payload) => ignAPI.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ign-list'] });
      Alert.alert('Submitted', 'IGN entry created successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not create IGN entry'),
  });

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const submit = () => {
    const validItems = items.filter(it => it.particulars.trim() && it.quantity);
    if (!validItems.length) return Alert.alert('Add at least one item with name and quantity');
    createMutation.mutate({
      project_id: selectedProject.id,
      vehicle_no: vehicleNo,
      dc_number: dcNumber,
      bill_number: billNumber,
      inspected_by: inspectedBy,
      remarks,
      items: validItems,
    });
  };

  return (
    <Screen>
      <ScreenHeader title="New IGN Entry" subtitle={selectedProject?.name} showBack />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}>
        <Card>
          <TextInput value={vehicleNo} onChangeText={setVehicleNo} placeholder="Vehicle No." placeholderTextColor={theme.colors.muted} style={styles.input} />
          <View style={styles.row2}>
            <TextInput value={dcNumber} onChangeText={setDcNumber} placeholder="DC Number" placeholderTextColor={theme.colors.muted} style={[styles.input, { flex: 1 }]} />
            <TextInput value={billNumber} onChangeText={setBillNumber} placeholder="Bill Number" placeholderTextColor={theme.colors.muted} style={[styles.input, { flex: 1 }]} />
          </View>
          <TextInput value={inspectedBy} onChangeText={setInspectedBy} placeholder="Inspected By" placeholderTextColor={theme.colors.muted} style={styles.input} />
          <TextInput value={remarks} onChangeText={setRemarks} placeholder="Remarks" placeholderTextColor={theme.colors.muted} style={[styles.input, { marginBottom: 0 }]} />
        </Card>

        <View style={styles.itemsHeader}>
          <Text style={styles.sectionTitle}>Items Received</Text>
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
              placeholder="Material description *"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
            />
            <View style={styles.row2}>
              <TextInput
                value={it.quantity}
                onChangeText={(v) => updateItem(idx, 'quantity', v)}
                placeholder="Quantity *"
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
              style={[styles.input, { marginBottom: 0 }]}
            />
          </Card>
        ))}

        <Button title="Submit IGN" onPress={submit} loading={createMutation.isPending} style={{ marginTop: 8 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingHorizontal: 12, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10,
  },
  row2: { flexDirection: 'row', gap: 10 },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  itemRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemIndex: { fontSize: 11, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase' },
});
