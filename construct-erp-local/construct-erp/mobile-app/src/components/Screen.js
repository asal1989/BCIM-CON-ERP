import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { theme } from '../theme';

export default function Screen({ title, children, scroll = true, noPad = false }) {
  const body = noPad ? children : <View style={styles.pad}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe}>
      {title ? (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
      ) : null}
      {scroll
        ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>{body}</ScrollView>
        : <View style={styles.body}>{body}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: theme.colors.bg },
  header: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  title:  { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  scroll: { flexGrow: 1 },
  body:   { flex: 1 },
  pad:    { padding: 16 },
});
