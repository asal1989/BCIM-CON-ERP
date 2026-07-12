// src/screens/ChatThreadScreen.js — message thread for a channel or DM:
// loads history via REST, listens for live messages via the shared socket
// from ChatContext, and sends via REST + socket broadcast (same pattern as
// the web app's ERPChat.jsx).
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { chatAPI } from '../api/client';
import { chColor } from '../constants/chatChannels';
import { theme } from '../theme';

function fmtFull(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  const { channel, title, isGroup, color, peer } = route.params;
  const { user } = useAuth();
  const { socketRef, subscribe, joinChannel, employees, refreshPreviews } = useChat();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title,
      headerStyle: { backgroundColor: theme.colors.card },
      headerTitleStyle: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
      headerTintColor: theme.colors.text,
    });
  }, [navigation, title]);

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
    const unsub = subscribe((msg) => {
      if (msg.channel === channel) setMessages(prev => [...prev, msg]);
    });
    return unsub;
  }, [channel, subscribe]);

  useEffect(() => {
    return () => { refreshPreviews(); chatAPI.markRead(channel).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

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
  };

  const selectMention = (emp) => {
    const name = emp.full_name || emp.name;
    setInput(prev => prev.replace(/@([A-Za-z0-9 ]*)$/, `@${name} `));
    setMentionOpen(false);
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      const res = await chatAPI.send({ channel, text });
      setMessages(prev => [...prev, res.data.message]);
      socketRef.current?.emit('send_message', res.data.message);
    } catch (err) {
      // put the text back so the user doesn't lose it
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [input, sending, channel, socketRef]);

  const react = useCallback(async (id, emoji) => {
    try {
      const res = await chatAPI.react(id, emoji);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions: res.data.message.reactions } : m));
      socketRef.current?.emit('react_message', { id, channel, reactions: res.data.message.reactions });
    } catch {}
  }, [channel, socketRef]);

  const headerColor = isGroup ? (color || chColor(channel)) : theme.colors.primary;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => String(m.id)}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="message-outline" size={40} color={theme.colors.muted} />
              <Text style={styles.emptyText}>No messages yet — start the conversation!</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isOwn = item.sender_id === user?.id;
            const prev = messages[index - 1];
            const showName = !isOwn && (!prev || prev.sender_id !== item.sender_id);
            return (
              <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
                {!isOwn && (
                  <View style={styles.avatarSlot}>
                    {showName ? <Avatar name={item.sender_name} size={30} /> : null}
                  </View>
                )}
                <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                  {showName && !isOwn && <Text style={styles.senderName}>{item.sender_name}</Text>}
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
            );
          }}
        />
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

      <View style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={handleChangeText}
          placeholder="Type a message… use @ to mention someone"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!input.trim() || sending}
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
  mentionBox: {
    backgroundColor: theme.colors.card, borderTopWidth: 1, borderColor: theme.colors.border,
    maxHeight: 200, paddingVertical: 4,
  },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  mentionName: { fontSize: 13.5, fontWeight: '600', color: theme.colors.text },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10,
    backgroundColor: theme.colors.card, borderTopWidth: 1, borderColor: theme.colors.border,
  },
  input: {
    flex: 1, maxHeight: 100, fontSize: 14, color: theme.colors.text,
    backgroundColor: theme.colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: theme.colors.muted },
});
