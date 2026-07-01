import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';
import Button from './Button';

// Every screen previously swallowed fetch errors silently (catch {}), leaving
// users staring at a blank list with no idea whether it's empty or broken.
export default function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="cloud-offline-outline" size={40} color={theme.colors.danger} />
      <Text style={styles.title}>Couldn't load this</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Button label="Try again" onPress={onRetry} variant="ghost" style={styles.retry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:    { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  title:   { marginTop: 12, fontSize: 15, fontWeight: '700', color: theme.colors.text },
  message: { marginTop: 4, fontSize: 13, color: theme.colors.muted, textAlign: 'center' },
  retry:   { marginTop: 16, paddingHorizontal: 24 },
});
