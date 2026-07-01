import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';

// Every screen previously hardcoded paddingTop (48/56) to clear the status
// bar, which overlaps or leaves a gap depending on the device's actual
// notch/status-bar height. useSafeAreaInsets() gets the real value per device.
export default function ScreenHeader({ title, subtitle, right, dark = false, onBack }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[
      styles.wrap,
      { paddingTop: insets.top + 12 },
      dark ? styles.dark : styles.light,
    ]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={dark ? '#F8FAFC' : theme.colors.text} />
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, dark && styles.titleDark]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, dark && styles.subtitleDark]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  light: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  dark:  { backgroundColor: theme.colors.dark },
  title:       { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  titleDark:   { color: '#F8FAFC' },
  subtitle:    { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  subtitleDark:{ color: '#94A3B8' },
});
