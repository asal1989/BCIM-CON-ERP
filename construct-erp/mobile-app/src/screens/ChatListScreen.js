// src/screens/ChatListScreen.js — unified conversation list (channels + DMs),
// sorted by most recent message, mirroring the web app's sidebar.
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Screen from '../components/Screen';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { CHANNELS, chColor, dmChannelId } from '../constants/chatChannels';
import { theme } from '../theme';
import { chatAPI } from '../api/client';

const TABS = [
  { id: 'all',      label: 'All' },
  { id: 'channels', label: 'Channels' },
  { id: 'direct',   label: 'Direct' },
  { id: 'calls',    label: 'Calls' },
];

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtDuration(secs) {
  if (!secs) return '';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function CallLogItem({ log, currentUserId }) {
  const isCaller   = log.caller_id === currentUserId;
  const otherName  = isCaller ? (log.callee_name || 'Unknown') : (log.caller_name || 'Unknown');
  const icon =
    log.call_type === 'video'  ? 'video' :
    log.call_type === 'screen' ? 'monitor-share' : 'phone';
  const statusColor =
    log.status === 'answered' ? theme.colors.success :
    log.status === 'missed'   ? '#EF4444' : theme.colors.muted;
  const statusIcon =
    log.status === 'answered' ? (isCaller ? 'phone-outgoing' : 'phone-incoming') :
    log.status === 'missed'   ? 'phone-missed' : 'phone-remove';

  return (
    <View style={styles.callRow}>
      <Avatar name={otherName} size={46} />
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>{otherName}</Text>
          <Text style={styles.rowTime}>{fmtTime(log.started_at)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <MaterialCommunityIcons name={statusIcon} size={14} color={statusColor} />
          <MaterialCommunityIcons name={icon} size={13} color={theme.colors.muted} />
          <Text style={[styles.rowSub, { color: statusColor }]}>
            {log.status === 'answered' ? fmtDuration(log.duration_secs) || log.status : log.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function ChatListScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { previews, employees, connected } = useChat();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [callLogs, setCallLogs]   = useState([]);
  const [callsLoading, setCallsLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'calls') return;
    setCallsLoading(true);
    chatAPI.callLogs(50).then(r => setCallLogs(r.data || [])).catch(() => {}).finally(() => setCallsLoading(false));
  }, [tab]);

  const q = search.trim().toLowerCase();

  const items = useMemo(() => {
    const chs = CHANNELS
      .filter(c => !q || c.label.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      .map(c => ({ type: 'channel', id: c.id, data: c }));
    const dms = employees
      .filter(e => !q || (e.full_name || e.name || '').toLowerCase().includes(q))
      .map(e => ({ type: 'dm', id: dmChannelId(user?.id, e.id), data: e }));

    let list = tab === 'channels' ? chs : tab === 'direct' ? dms : [...chs, ...dms];
    return list.sort((a, b) => {
      const ta = previews?.[a.id]?.created_at ? new Date(previews[a.id].created_at) : new Date(0);
      const tb = previews?.[b.id]?.created_at ? new Date(previews[b.id].created_at) : new Date(0);
      return tb - ta;
    });
  }, [tab, q, employees, previews, user?.id]);

  const openConversation = (item) => {
    if (item.type === 'channel') {
      navigation.navigate('ChatThread', { channel: item.id, title: item.data.label, isGroup: true, color: chColor(item.id) });
    } else {
      navigation.navigate('ChatThread', { channel: item.id, title: item.data.full_name || item.data.name, isGroup: false, peer: item.data });
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Team Chat</Text>
          <View style={styles.statusDot}>
            <View style={[styles.dot, { backgroundColor: connected ? theme.colors.success : theme.colors.muted }]} />
            <Text style={styles.statusText}>{connected ? 'Connected' : 'Connecting…'}</Text>
          </View>
        </View>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations…"
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
          />
        </View>
        <View style={styles.tabs}>
          {TABS.map(t => (
            <TouchableOpacity key={t.id} onPress={() => setTab(t.id)}
              style={[styles.tab, tab === t.id && styles.tabActive]}>
              <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === 'calls' ? (
        <FlatList
          data={callLogs}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            callsLoading
              ? <Text style={styles.loadingText}>Loading…</Text>
              : <EmptyState icon="phone-outline" title="No call history yet" />
          }
          renderItem={({ item }) => <CallLogItem log={item} currentUserId={user?.id} />}
        />
      ) : (
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState icon="message-outline" title="No conversations found" />}
        renderItem={({ item }) => {
          const preview = previews?.[item.id];
          const name = item.type === 'channel' ? item.data.label : (item.data.full_name || item.data.name || 'Employee');
          const previewText = preview?.text
            ? (preview.sender_name ? `${preview.sender_name}: ` : '') + preview.text.slice(0, 60)
            : (item.type === 'channel' ? item.data.desc : (item.data.designation_name || item.data.designation || 'Direct message'));
          return (
            <TouchableOpacity style={styles.row} onPress={() => openConversation(item)}>
              {item.type === 'channel' ? (
                <View style={[styles.channelIcon, { backgroundColor: chColor(item.id) }]}>
                  <Text style={styles.channelIconText}>{name.charAt(0).toUpperCase()}</Text>
                </View>
              ) : (
                <Avatar name={name} size={46} />
              )}
              <View style={styles.rowContent}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
                  {preview?.created_at && <Text style={styles.rowTime}>{fmtTime(preview.created_at)}</Text>}
                </View>
                <Text style={styles.rowSub} numberOfLines={1}>{previewText}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  statusDot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, color: theme.colors.muted },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    paddingHorizontal: 12, height: 40, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.surface },
  tabActive: { backgroundColor: theme.colors.primary },
  tabLabel: { fontSize: 12.5, fontWeight: '600', color: theme.colors.textSecondary },
  tabLabelActive: { color: '#fff' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: theme.spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card,
  },
  channelIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  channelIconText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  rowContent: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowName: { fontSize: 14.5, fontWeight: '700', color: theme.colors.text, flex: 1 },
  rowTime: { fontSize: 11, color: theme.colors.muted, marginLeft: 6 },
  rowSub: { fontSize: 12.5, color: theme.colors.textSecondary, marginTop: 2 },
  callRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: theme.spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card,
  },
  loadingText: { textAlign: 'center', color: theme.colors.muted, marginTop: 40, fontSize: 14 },
});
