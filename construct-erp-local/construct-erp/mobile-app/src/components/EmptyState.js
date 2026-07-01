import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';

export default function EmptyState({ icon = 'file-tray-outline', title = 'Nothing here yet', message }) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={40} color={theme.colors.muted} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:    { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  title:   { marginTop: 12, fontSize: 15, fontWeight: '700', color: theme.colors.text },
  message: { marginTop: 4, fontSize: 13, color: theme.colors.muted, textAlign: 'center' },
});
