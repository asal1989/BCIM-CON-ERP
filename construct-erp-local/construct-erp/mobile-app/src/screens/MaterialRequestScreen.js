import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { mrsAPI } from '../api/client';
import { theme } from '../theme';

const STATUS = {
  draft:     { label: 'Draft',     color: '#94A3B8' },
  pending:   { label: 'Pending',   color: '#F59E0B' },
  approved:  { label: 'Approved',  color: '#10B981' },
  issued:    { label: 'Issued',    color: '#3B82F6' },
  fulfilled: { label: 'Fulfilled', color: '#8B5CF6' },
  rejected:  { label: 'Rejected',  color: '#EF4444' },
};

export default function MaterialRequestScreen() {
  const { selectedProject } = useAuth();
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const r = await mrsAPI.list(selectedProject.id);
      setItems(r.data?.data ?? r.data ?? []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [selectedProject.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Material Requests</Text>
        <Text style={styles.count}>{items.length} records</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        renderItem={({ item }) => {
          const st = STATUS[item.status] || { label: item.status, color: '#64748B' };
          return (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.mrNo}>{item.mr_number || item.mrs_number || item.id?.slice(0, 8)}</Text>
                <View style={[styles.pill, { backgroundColor: st.color + '20' }]}>
                  <Text style={[styles.pillText, { color: st.color }]}>{st.label.toUpperCase()}</Text>
                </View>
              </View>
              {item.description || item.remarks
                ? <Text style={styles.desc} numberOfLines={2}>{item.description || item.remarks}</Text>
                : null}
              <Text style={styles.date}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No material requests found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:     { flex: 1, backgroundColor: theme.colors.bg },
  center:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:   { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title:    { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  count:    { fontSize: 12, color: theme.colors.muted },
  card:     { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.colors.border },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mrNo:     { fontWeight: '700', fontSize: 14, color: theme.colors.text },
  pill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pillText: { fontSize: 10, fontWeight: '700' },
  desc:     { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  date:     { fontSize: 11, color: theme.colors.muted },
  empty:    { textAlign: 'center', color: theme.colors.muted, marginTop: 60, fontSize: 14 },
});
