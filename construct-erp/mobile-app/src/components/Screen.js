import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';

export default function Screen({ children, style }) {
  // Bottom edge included: Android 15+ enforces edge-to-edge (mandatory as of
  // Expo SDK 54 / RN 0.81), so any screen bordering the raw system nav bar —
  // full-screen stack routes like chat threads and detail screens, not just
  // tab screens — needs the real bottom inset or the system nav bar overlaps
  // and swallows touches on content near the bottom (e.g. a chat input box).
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={[styles.container, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  container: { flex: 1, backgroundColor: theme.colors.bg },
});
