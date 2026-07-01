import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { projectAPI } from '../api/client';

export default function ProjectSelectScreen() {
  const { user, selectProject, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    projectAPI.list()
      .then(r => setProjects(r.data?.data ?? r.data ?? []))
      .catch(() => Alert.alert('Error', 'Could not load projects. Check your connection.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading projects…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.greeting}>Hi, {user?.name || user?.email} 👋</Text>
        <Text style={styles.sub}>Select a project to continue</Text>
      </View>

      <FlatList
        data={projects}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => selectProject(item)}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {(item.project_code || item.name || '?').slice(0, 3).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.project_code
                ? <Text style={styles.code}>{item.project_code}</Text>
                : null}
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No projects are assigned to your account.</Text>
        }
      />

      <TouchableOpacity style={[styles.logoutBtn, { paddingBottom: 20 + insets.bottom }]} onPress={logout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:        { flex: 1, backgroundColor: '#0F172A' },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A', gap: 12 },
  loadingText: { color: '#94A3B8', fontSize: 14 },
  header:      { padding: 24 },
  greeting:    { fontSize: 22, fontWeight: '800', color: '#F8FAFC' },
  sub:         { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  card:        {
    backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: '#334155',
  },
  badge:       { width: 46, height: 46, borderRadius: 10, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  badgeText:   { color: '#fff', fontWeight: '700', fontSize: 12 },
  name:        { color: '#F8FAFC', fontWeight: '600', fontSize: 15 },
  code:        { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  arrow:       { color: '#475569', fontSize: 24 },
  empty:       { color: '#64748B', textAlign: 'center', marginTop: 50, fontSize: 14 },
  logoutBtn:   { padding: 20, alignItems: 'center' },
  logoutText:  { color: '#64748B', fontSize: 14 },
});
