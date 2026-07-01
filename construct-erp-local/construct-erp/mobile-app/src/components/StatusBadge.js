import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

// Shared status → color mapping used across MRS, bills, DPR, approvals, etc.
const STATUS_COLORS = {
  draft:       { bg: '#F1F5F9', fg: theme.colors.muted },
  pending:     { bg: '#FEF3C7', fg: '#B45309' },
  submitted:   { bg: '#FEF3C7', fg: '#B45309' },
  in_progress: { bg: '#DBEAFE', fg: '#1D4ED8' },
  under_review:{ bg: '#DBEAFE', fg: '#1D4ED8' },
  approved:    { bg: '#D1FAE5', fg: '#047857' },
  qs_approved: { bg: '#D1FAE5', fg: '#047857' },
  pm_approved: { bg: '#D1FAE5', fg: '#047857' },
  certified:   { bg: '#D1FAE5', fg: '#047857' },
  verified:    { bg: '#D1FAE5', fg: '#047857' },
  issued:      { bg: '#E0E7FF', fg: '#4338CA' },
  fulfilled:   { bg: '#D1FAE5', fg: '#047857' },
  paid:        { bg: '#D1FAE5', fg: '#047857' },
  rejected:    { bg: '#FEE2E2', fg: '#B91C1C' },
  cancelled:   { bg: '#FEE2E2', fg: '#B91C1C' },
};
const DEFAULT_COLOR = { bg: '#F1F5F9', fg: theme.colors.muted };

export default function StatusBadge({ status }) {
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');
  const { bg, fg } = STATUS_COLORS[key] || DEFAULT_COLOR;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{(status || 'Unknown').replace(/_/g, ' ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  text:  { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
