import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { essAPI } from '../api/client';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import { theme } from '../theme';

const STATUS_OPTIONS = ['present', 'half_day', 'absent', 'leave'];

export default function AttendanceCorrectionScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();

  const [attendanceDate, setAttendanceDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [requestedStatus, setRequestedStatus] = useState('present');
  const [inTime, setInTime] = useState('');
  const [outTime, setOutTime] = useState('');
  const [reason, setReason] = useState('');

  const createMutation = useMutation({
    mutationFn: (payload) => essAPI.requestAttendanceCorrection(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ess-attendance'] });
      Alert.alert('Submitted', 'Correction request sent for approval.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not submit correction request'),
  });

  const submit = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) return Alert.alert('Invalid date', 'Use format YYYY-MM-DD');
    if (!reason.trim()) return Alert.alert('Reason is required');
    createMutation.mutate({
      attendance_date: attendanceDate,
      requested_status: requestedStatus,
      requested_in_time: inTime || undefined,
      requested_out_time: outTime || undefined,
      reason,
    });
  };

  return (
    <Screen>
      <ScreenHeader title="Attendance Correction" showBack />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}>
        <Card>
          <Text style={styles.label}>Date</Text>
          <TextInput value={attendanceDate} onChangeText={setAttendanceDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Requested Status</Text>
          <View style={styles.chipsRow}>
            {STATUS_OPTIONS.map(s => (
              <TouchableOpacity key={s} onPress={() => setRequestedStatus(s)} style={[styles.chip, requestedStatus === s && styles.chipActive]}>
                <Text style={[styles.chipText, requestedStatus === s && styles.chipTextActive]}>{s.replace('_', ' ')}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>In Time</Text>
              <TextInput value={inTime} onChangeText={setInTime} placeholder="09:00" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Out Time</Text>
              <TextInput value={outTime} onChangeText={setOutTime} placeholder="18:00" placeholderTextColor={theme.colors.muted} style={styles.input} />
            </View>
          </View>

          <Text style={styles.label}>Reason *</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Explain why this correction is needed…"
            placeholderTextColor={theme.colors.muted}
            multiline
            numberOfLines={4}
            style={[styles.input, styles.textarea, { marginBottom: 0 }]}
          />
        </Card>

        <Button title="Submit Correction Request" onPress={submit} loading={createMutation.isPending} style={{ marginTop: 8 }} />
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
  textarea: { height: 100, paddingTop: 10, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 10 },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
});
