import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';

const ITEMS = [
  { key: 'Assets',    icon: 'qr-code-outline',       label: 'Assets' },
  { key: 'Documents', icon: 'folder-open-outline',   label: 'Documents' },
  { key: 'ESS',       icon: 'person-check-outline',  label: 'ESS — Attendance & Leave' },
  { key: 'Profile',   icon: 'person-circle-outline', label: 'Profile' },
];

// Bottom tabs are capped at 5 (platform guideline) so anything beyond
// Dashboard/MRS/Stores/Bills lives here instead of overflowing the tab bar.
export default function MoreScreen({ navigation }) {
  return (
    <View style={styles.wrap}>
      <ScreenHeader title="More" />
      <View style={styles.body}>
        <Card style={styles.listCard}>
          {ITEMS.map((item, i) => (
            <React.Fragment key={item.key}>
              <TouchableOpacity style={styles.row} onPress={() => navigation.navigate(item.key)} activeOpacity={0.6}>
                <View style={styles.iconWrap}>
                  <Ionicons name={item.icon} size={18} color={theme.colors.primary} />
                </View>
                <Text style={styles.label}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} />
              </TouchableOpacity>
              {i < ITEMS.length - 1 ? <View style={styles.divider} /> : null}
            </React.Fragment>
          ))}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: 16 },
  listCard: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, color: theme.colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: theme.colors.border, marginLeft: 14 },
});
