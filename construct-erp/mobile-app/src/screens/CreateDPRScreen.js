import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { dprAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import { theme } from '../theme';

const WEATHER_OPTIONS = ['Sunny', 'Cloudy', 'Rainy', 'Windy'];

export default function CreateDPRScreen() {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { selectedProject } = useAuth();

  const [reportDate, setReportDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [weather, setWeather] = useState('Sunny');
  const [activities, setActivities] = useState('');
  const [issuesFaced, setIssuesFaced] = useState('');
  const [nextDayPlan, setNextDayPlan] = useState('');
  const [preparedBy, setPreparedBy] = useState('');

  const createMutation = useMutation({
    mutationFn: (payload) => dprAPI.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dpr-list'] });
      Alert.alert('Submitted', 'Daily Progress Report submitted successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (e) => Alert.alert('Failed', e?.response?.data?.error || 'Could not submit DPR'),
  });

  const submit = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return Alert.alert('Invalid date', 'Use format YYYY-MM-DD');
    if (!activities.trim()) return Alert.alert('Add at least one line of work done today');
    createMutation.mutate({
      project_id: selectedProject.id,
      report_date: reportDate,
      weather,
      activities: activities.split('\n').map(s => s.trim()).filter(Boolean),
      issues_faced: issuesFaced,
      next_day_plan: nextDayPlan,
      prepared_by: preparedBy,
    });
  };

  return (
    <Screen>
      <ScreenHeader title="New Daily Progress Report" subtitle={selectedProject?.name} showBack />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, gap: 12 }}>
        <Card>
          <Text style={styles.label}>Report Date</Text>
          <TextInput value={reportDate} onChangeText={setReportDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.muted} style={styles.input} />

          <Text style={styles.label}>Weather</Text>
          <View style={styles.chipsRow}>
            {WEATHER_OPTIONS.map(w => (
              <TouchableOpacity key={w} onPress={() => setWeather(w)} style={[styles.chip, weather === w && styles.chipActive]}>
                <Text style={[styles.chipText, weather === w && styles.chipTextActive]}>{w}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Prepared By</Text>
          <TextInput value={preparedBy} onChangeText={setPreparedBy} placeholder="Your name" placeholderTextColor={theme.colors.muted} style={[styles.input, { marginBottom: 0 }]} />
        </Card>

        <Card>
          <Text style={styles.label}>Work Done Today *</Text>
          <Text style={styles.hint}>One activity per line</Text>
          <TextInput
            value={activities}
            onChangeText={setActivities}
            placeholder={'e.g.\nColumn casting — Grid A1-A4\nBrickwork — 2nd floor'}
            placeholderTextColor={theme.colors.muted}
            multiline
            numberOfLines={5}
            style={[styles.input, styles.textarea, { marginBottom: 0 }]}
          />
        </Card>

        <Card>
          <Text style={styles.label}>Issues / Constraints</Text>
          <TextInput
            value={issuesFaced}
            onChangeText={setIssuesFaced}
            placeholder="Any blockers or issues faced…"
            placeholderTextColor={theme.colors.muted}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.textareaSmall]}
          />

          <Text style={styles.label}>Tomorrow's Plan</Text>
          <TextInput
            value={nextDayPlan}
            onChangeText={setNextDayPlan}
            placeholder="Plan for next day…"
            placeholderTextColor={theme.colors.muted}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.textareaSmall, { marginBottom: 0 }]}
          />
        </Card>

        <Button title="Submit DPR" onPress={submit} loading={createMutation.isPending} style={{ marginTop: 8 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 4, marginTop: 4 },
  hint: { fontSize: 11, color: theme.colors.muted, marginBottom: 6 },
  input: {
    height: 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingHorizontal: 12, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10,
  },
  textarea: { height: 110, paddingTop: 10, textAlignVertical: 'top' },
  textareaSmall: { height: 70, paddingTop: 10, textAlignVertical: 'top', marginBottom: 10 },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: '#fff' },
});
