import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../theme';

export default function Button({ label, onPress, variant = 'primary', loading = false, disabled = false, style }) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={variant === 'ghost' ? theme.colors.primary : '#fff'} size="small" />
        : <Text style={[styles.label, variant === 'ghost' && styles.labelGhost]}>{label}</Text>}
    </Pressable>
  );
}

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: theme.colors.primary },
  danger:  { backgroundColor: theme.colors.danger },
  success: { backgroundColor: theme.colors.success },
  ghost:   { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
});

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  pressed:  { opacity: 0.85 },
  label:      { color: '#fff', fontWeight: '700', fontSize: 14 },
  labelGhost: { color: theme.colors.text },
});
