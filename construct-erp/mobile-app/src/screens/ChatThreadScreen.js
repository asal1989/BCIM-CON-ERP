// src/screens/ChatThreadScreen.js — message thread for a channel or DM:
// loads history via REST, listens for live messages via the shared socket
// from ChatContext, and sends via REST + socket broadcast (same pattern as
// the web app's ERPChat.jsx). Includes file attachments, pin/unpin, typing
// indicators, and in-thread search — all mirroring web's feature set (web's
// voice/video calls and screen share are intentionally out of scope here;
// they need react-native-webrtc and a native dev client, not Expo Go).
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { chatAPI, uploadAPI } from '../api/client';
import { chColor } from '../constants/chatChannels';
import { theme } from '../theme';

function fmtFull(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtSize(bytes) {
  const n = Number(bytes);
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function renderMentions(text, isOwn) {
  if (!text) return null;
  const parts = text.split(/(@[A-Za-z][A-Za-z0-9 _]*)/g);
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <Text key={i} style={{ fontWeight: '700', color: isOwn ? '#BFDBFE' : theme.colors.primary }}>{p}</Text>
      : p
  );
}

export default function ChatThreadScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { channel, title, isGroup, color, peer } = route.params;
  const { user } = useAuth();
  const { socketRef, subscribe, joinChannel, employees, refreshPreviews, typing, emitTyping, emitStopTyping } = useChat();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [pendingFile, setPendingFile] = useState(null); // { name, size, mimeType, uri, url, uploading, progress }
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = inactive
  const listRef = useRef(null);
  const typingTimerRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title,
      headerStyle: { backgroundColor: theme.colors.card },
      headerTitleStyle: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
      headerTintColor: theme.colors.text,
      headerRight: () => (
        <TouchableOpacity onPress={() => setSearchOpen(v => !v)} style={{ padding: 6 }}>
          <MaterialCommunityIcons name={searchOpen ? 'close' : 'magnify'} size={22} color={theme.colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, title, searchOpen]);

  useEffect(() => {
    setLoading(true);
    chatAPI.messages(channel, 100)
      .then(r => setMessages(r.data?.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
    chatAPI.markRead(channel).catch(() => {});
    joinChannel(channel);
  }, [channel, joinChannel]);

  useEffect(() => {
    const unsub = subscribe((evt) => {
      if (evt._type === 'message' && evt.channel === channel) {
        setMessages(prev => [...prev, evt]);
      } else if (evt._type === 'pin' && evt.channel === channel) {
        setMessages(prev => prev.map(m => m.id === evt.id ? { ...m, pinned: evt.pinned } : m));
      } else if (evt._type === 'react' && evt.channel === channel) {
        setMessages(prev => prev.map(m => m.id === evt.id ? { ...m, reactions: evt.reactions } : m));
      }
    });
    return unsub;
  }, [channel, subscribe]);

  useEffect(() => {
    return () => {
      refreshPreviews();
      chatAPI.markRead(channel).catch(() => {});
      emitStopTyping(channel);
      clearTimeout(typingTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  // ── In-thread search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    const t = setTimeout(() => {
      chatAPI.search(searchQuery, channel, 100)
        .then(r => setSearchResults(r.data?.messages || []))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, channel]);

  const visibleMessages = searchResults ?? messages;

  // ── Mentions ───────────────────────────────────────────────────────────────
  const mentionList = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return employees.filter(e => {
      const n = (e.full_name || e.name || '').toLowerCase();
      return !q || n.includes(q);
    }).slice(0, 6);
  }, [mentionOpen, mentionQuery, employees]);

  const handleChangeText = (val) => {
    setInput(val);
    const match = val.match(/@([A-Za-z0-9 ]*)$/);
    if (match) { setMentionQuery(match[1]); setMentionOpen(true); }
    else { setMentionOpen(false); setMentionQuery(''); }

    emitTyping(channel, user?.name || 'Someone');
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitStopTyping(channel), 2000);
  };

  const selectMention = (emp) => {
    const name = emp.full_name || emp.name;
    setInput(prev => prev.replace(/@([A-Za-z0-9 ]*)$/, `@${name} `));
    setMentionOpen(false);
  };

  // ── File attachment ───────────────────────────────────────────────────────
  const pickFile = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const file = res.assets[0];
    setPendingFile({ name: file.name, size: file.size, mimeType: file.mimeType, uri: file.uri, url: null, uploading: true, progress: 0 });
    try {
      const uploadRes = await uploadAPI.single(file, (pct) => {
        setPendingFile(prev => (prev ? { ...prev, progress: pct } : prev));
      });
      setPendingFile(prev => (prev ? { ...prev, url: uploadRes.data.url, uploading: false } : prev));
    } catch (err) {
      Alert.alert('Upload failed', err?.response?.data?.error || `Could not upload ${file.name}`);
      setPendingFile(null);
    }
  }, []);

  // ── Send ───────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingFile) || sending) return;
    if (pendingFile?.uploading) return;
    setSending(true);
    setInput('');
    const filePayload = pendingFile ? { file_name: pendingFile.name, file_size: pendingFile.size, file_url: pendingFile.url } : {};
    setPendingFile(null);
    try {
      const res = await chatAPI.send({ channel, text: text || null, ...filePayload });
      setMessages(prev => [...prev, res.data.message]);
      socketRef.current?.emit('send_message', res.data.message);
    } catch (err) {
      // put the text back so the user doesn't lose it
      setInput(text);
    } finally {
      setSending(false);
    }
    emitStopTyping(channel);
  }, [input, pendingFile, sending, channel, socketRef, emitStopTyping]);

  const react = useCallback(async (id, emoji) => {
    try {
      const res = await chatAPI.react(id, emoji);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions: res.data.message.reactions } : m));
      socketRef.current?.emit('react_message', { id, channel, reactions: res.data.message.reactions });
    } catch {}
  }, [channel, socketRef]);

  const togglePin = useCallback(async (id) => {
    try {
      const res = await chatAPI.pin(id);
      const pinned = res.data.message.pinned;
      setMessages(prev => prev.map(m => m.id === id ? { ...m, pinned } : m));
      socketRef.current?.emit('pin_message', { id, channel, pinned });
    } catch {}
  }, [channel, socketRef]);

  const onLongPressMessage = useCallback((item) => {
    Alert.alert(
      item.pinned ? 'Unpin message' : 'Pin message',
      item.text ? item.text.slice(0, 80) : item.file_name || '',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: item.pinned ? 'Unpin' : 'Pin', onPress: () => togglePin(item.id) },
      ]
    );
  }, [togglePin]);

  const pinnedMessages = useMemo(() => messages.filter(m => m.pinned), [messages]);
  const [pinsOpen, setPinsOpen] = useState(false);

  const headerColor = isGroup ? (color || chColor(channel)) : theme.colors.primary;
  const typingName = typing?.[channel];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {searchOpen && (
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={16} color={theme.colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search messages…"
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
            autoFocus
          />
          {searchQuery ? <Text style={styles.searchCount}>{visibleMessages.length} result{visibleMessages.length !== 1 ? 's' : ''}</Text> : null}
        </View>
      )}

      {!searchOpen && pinnedMessages.length > 0 && (
        <TouchableOpacity style={styles.pinnedBanner} onPress={() => setPinsOpen(v => !v)}>
          <MaterialCommunityIcons name="pin" size={14} color={theme.colors.warning} />
          <Text style={styles.pinnedBannerText} numberOfLines={1}>
            {pinnedMessages.length} pinned message{pinnedMessages.length !== 1 ? 's' : ''}
          </Text>
          <MaterialCommunityIcons name={pinsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.muted} />
        </TouchableOpacity>
      )}
      {pinsOpen && pinnedMessages.length > 0 && (
        <View style={styles.pinsList}>
          {pinnedMessages.map(m => (
            <TouchableOpacity key={m.id} style={styles.pinRow} onPress={() => togglePin(m.id)}>
              <Avatar name={m.sender_name} size={22} />
              <Text style={styles.pinRowText} numberOfLines={1}>
                <Text style={{ fontWeight: '700' }}>{m.sender_name}: </Text>
                {m.text || m.file_name}
              </Text>
              <MaterialCommunityIcons name="close" size={14} color={theme.colors.muted} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={visibleMessages}
          keyExtractor={m => String(m.id)}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => { if (!searchOpen) listRef.current?.scrollToEnd({ animated: true }); }}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="message-outline" size={40} color={theme.colors.muted} />
              <Text style={styles.emptyText}>{searchQuery ? 'No messages match your search' : 'No messages yet — start the conversation!'}</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isOwn = item.sender_id === user?.id;
            const prev = visibleMessages[index - 1];
            const showName = !isOwn && (!prev || prev.sender_id !== item.sender_id);
            return (
              <TouchableOpacity activeOpacity={0.85} onLongPress={() => onLongPressMessage(item)}>
                <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
                  {!isOwn && (
                    <View style={styles.avatarSlot}>
                      {showName ? <Avatar name={item.sender_name} size={30} /> : null}
                    </View>
                  )}
                  <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                    {showName && !isOwn && <Text style={styles.senderName}>{item.sender_name}</Text>}
                    {item.pinned ? (
                      <View style={styles.pinnedTag}>
                        <MaterialCommunityIcons name="pin" size={10} color={isOwn ? '#BFDBFE' : theme.colors.warning} />
                        <Text style={[styles.pinnedTagText, isOwn && { color: '#BFDBFE' }]}>Pinned</Text>
                      </View>
                    ) : null}
                    {item.text ? (
                      <Text style={[styles.msgText, isOwn && styles.msgTextOwn]}>
                        {renderMentions(item.text, isOwn)}
                      </Text>
                    ) : null}
                    {item.file_name ? (
                      <View style={styles.fileChip}>
                        <MaterialCommunityIcons name="file-outline" size={14} color={isOwn ? '#fff' : theme.colors.primary} />
                        <Text style={[styles.fileChipText, isOwn && { color: '#fff' }]} numberOfLines={1}>{item.file_name}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>{fmtFull(item.created_at)}</Text>
                    {(item.reactions || []).length > 0 && (
                      <View style={styles.reactionsRow}>
                        {item.reactions.map(r => (
                          <TouchableOpacity key={r.e} style={styles.reactionChip} onPress={() => react(item.id, r.e)}>
                            <Text style={styles.reactionText}>{r.e} {r.c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {typingName && !searchOpen && (
        <View style={styles.typingRow}>
          <Text style={styles.typingText}>{typingName} is typing…</Text>
        </View>
      )}

      {mentionOpen && mentionList.length > 0 && (
        <View style={styles.mentionBox}>
          {mentionList.map(emp => (
            <TouchableOpacity key={emp.id} style={styles.mentionRow} onPress={() => selectMention(emp)}>
              <Avatar name={emp.full_name || emp.name} size={26} />
              <Text style={styles.mentionName}>{emp.full_name || emp.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {pendingFile && (
        <View style={styles.pendingFile}>
          <MaterialCommunityIcons name="file-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.pendingFileName} numberOfLines={1}>{pendingFile.name}</Text>
          <Text style={styles.pendingFileMeta}>
            {pendingFile.uploading ? `Uploading ${pendingFile.progress}%…` : fmtSize(pendingFile.size)}
          </Text>
          <TouchableOpacity onPress={() => setPendingFile(null)}>
            <MaterialCommunityIcons name="close" size={16} color={theme.colors.muted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(10, insets.bottom) }]}>
        <TouchableOpacity style={styles.attachBtn} onPress={pickFile}>
          <MaterialCommunityIcons name="paperclip" size={20} color={theme.colors.muted} />
        </TouchableOpacity>
        <TextInput
          value={input}
          onChangeText={handleChangeText}
          placeholder="Type a message… use @ to mention someone"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() && !pendingFile || sending || pendingFile?.uploading) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={(!input.trim() && !pendingFile) || sending || pendingFile?.uploading}
        >
          <MaterialCommunityIcons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 48 },
  emptyText: { fontSize: 14, color: theme.colors.muted },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: theme.colors.card, borderBottomWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
  searchCount: { fontSize: 11, color: theme.colors.muted },
  pinnedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderColor: '#FDE68A',
  },
  pinnedBannerText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#92400E' },
  pinsList: { backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderColor: '#FDE68A', maxHeight: 160, paddingBottom: 4 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6 },
  pinRowText: { flex: 1, fontSize: 12.5, color: theme.colors.text },
  pinnedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
  pinnedTagText: { fontSize: 10, fontWeight: '700', color: theme.colors.warning, textTransform: 'uppercase' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6, paddingRight: 40 },
  msgRowOwn: { flexDirection: 'row-reverse', paddingRight: 0, paddingLeft: 40 },
  avatarSlot: { width: 30 },
  bubble: { maxWidth: '78%', borderRadius: 16, padding: 10, paddingBottom: 6 },
  bubbleOwn: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: theme.colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
  senderName: { fontSize: 12, fontWeight: '700', color: theme.colors.text, marginBottom: 2 },
  msgText: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  msgTextOwn: { color: '#fff' },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: 8, marginTop: 4 },
  fileChipText: { fontSize: 12, color: theme.colors.text, flexShrink: 1 },
  msgTime: { fontSize: 10, color: theme.colors.muted, marginTop: 4, textAlign: 'right' },
  msgTimeOwn: { color: 'rgba(255,255,255,0.7)' },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  reactionText: { fontSize: 11, color: theme.colors.text },
  typingRow: { paddingHorizontal: 16, paddingBottom: 4 },
  typingText: { fontSize: 12, color: theme.colors.muted, fontStyle: 'italic' },
  mentionBox: {
    backgroundColor: theme.colors.card, borderTopWidth: 1, borderColor: theme.colors.border,
    maxHeight: 200, paddingVertical: 4,
  },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  mentionName: { fontSize: 13.5, fontWeight: '600', color: theme.colors.text },
  pendingFile: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border,
  },
  pendingFileName: { flex: 1, fontSize: 12.5, color: theme.colors.text },
  pendingFileMeta: { fontSize: 11, color: theme.colors.muted },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10,
    backgroundColor: theme.colors.card, borderTopWidth: 1, borderColor: theme.colors.border,
  },
  attachBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1, maxHeight: 100, fontSize: 14, color: theme.colors.text,
    backgroundColor: theme.colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: theme.colors.muted },
});
