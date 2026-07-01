import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../theme';

export default function ListSkeleton({ rows = 4 }) {
  return (
    <View style={styles.wrap}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.bar, { width: '60%' }]} />
          <View style={[styles.bar, { width: '35%', marginTop: 8 }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 8 },
  row: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 10,
  },
  bar: { height: 12, borderRadius: 6, backgroundColor: theme.colors.surface },
});
