import React, { useState } from 'react';
import { View, Text, TextInput, SectionList, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Screen from '../components/Screen';
import EmptyState from '../components/EmptyState';
import { MODULE_GROUPS } from '../navigation/moduleRegistry';
import { theme } from '../theme';

// Full menu of every module in the web app's sidebar, grouped exactly like
// the web Layout.jsx. Tapping an item either opens its dedicated mobile
// screen, or the generic Placeholder screen if it hasn't been built yet.
export default function MoreScreen() {
  const navigation = useNavigation();
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const sections = MODULE_GROUPS
    .map(g => ({
      title: g.label,
      icon: g.icon,
      data: g.items.filter(i => !q || i.label.toLowerCase().includes(q)),
    }))
    .filter(s => s.data.length > 0);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>All Modules</Text>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search modules…"
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
          />
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, idx) => item.label + idx}
        contentContainerStyle={{ paddingBottom: 24 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={<EmptyState icon="magnify-close" title="No modules match" />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name={section.icon} size={16} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate(item.screen, item.params || (item.path ? { path: item.path, title: item.label } : undefined))}
          >
            <MaterialCommunityIcons name={item.icon || 'chevron-right-circle-outline'} size={18} color={theme.colors.textSecondary} />
            <Text style={styles.rowLabel}>{item.label}</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.muted} />
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.md, paddingTop: theme.spacing.lg },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: theme.spacing.md, paddingTop: 16, paddingBottom: 6,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: theme.spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card,
  },
  rowLabel: { flex: 1, fontSize: 14, color: theme.colors.text, fontWeight: '500' },
});
