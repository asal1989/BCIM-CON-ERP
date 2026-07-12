// src/context/ChatContext.js — app-wide chat socket connection + shared
// conversation previews (last message per channel/DM), mirroring the web
// app's ChatContext.jsx but without the WebRTC call/screen-share pieces
// (native voice/video calling needs react-native-webrtc + a custom dev
// client — a separate follow-up, not part of this text-chat build).
import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import { chatAPI, employeeDirectoryAPI } from '../api/client';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

// API_BASE_URL is e.g. "https://erp.bcim.in/api/v1" — the socket server is
// mounted on the same host at the root, not under /api/v1.
const SOCKET_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [previews, setPreviews]   = useState({});
  const [employees, setEmployees] = useState([]);
  const [typing, setTyping]       = useState({}); // { [channel]: name | null }
  const socketRef = useRef(null);
  const listenersRef = useRef(new Set()); // per-screen 'new_message' subscribers
  const typingTimersRef = useRef({}); // per-channel auto-clear timers

  const loadPreviews = useCallback(() => {
    chatAPI.previews().then(r => setPreviews(r.data?.previews || {})).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    employeeDirectoryAPI.list()
      .then(r => setEmployees((r.data?.data || r.data?.employees || r.data || []).filter(e => e.id !== user.id)))
      .catch(() => setEmployees([]));

    loadPreviews();

    let socket;
    (async () => {
      const token = await SecureStore.getItemAsync('auth_token');
      if (!token) return;
      socket = io(SOCKET_URL, {
        transports: ['websocket'],
        auth: { token },
      });
      socketRef.current = socket;

      socket.on('connect',    () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));

      socket.on('new_message', (msg) => {
        setPreviews(prev => ({
          ...prev,
          [msg.channel]: {
            text: msg.text, file_name: msg.file_name,
            sender_name: msg.sender_name, sender_id: msg.sender_id,
            created_at: msg.created_at,
          },
        }));
        // A new message implies the sender stopped typing — clear it immediately
        // rather than waiting for their stop_typing event to arrive.
        setTyping(prev => (prev[msg.channel] ? { ...prev, [msg.channel]: null } : prev));
        listenersRef.current.forEach(fn => fn({ _type: 'message', ...msg }));
      });

      // Pin/reaction updates made by OTHER users in the same channel — relayed
      // through the same per-screen subscribe() mechanism as new_message,
      // tagged with _type so ChatThreadScreen can branch on it. (The user who
      // performed the action already updates their own state optimistically;
      // this is what makes it show up live for everyone else viewing the
      // channel.)
      socket.on('message_pinned', (data) => {
        listenersRef.current.forEach(fn => fn({ _type: 'pin', ...data }));
      });
      socket.on('message_reacted', (data) => {
        listenersRef.current.forEach(fn => fn({ _type: 'react', ...data }));
      });

      // The server relays our 'typing'/'stop_typing' emits back to other
      // clients in the room as 'user_typing'/'user_stop_typing' — see
      // socket.on('typing', ...) in backend/src/server.js.
      socket.on('user_typing', ({ channel, name }) => {
        setTyping(prev => ({ ...prev, [channel]: name }));
        clearTimeout(typingTimersRef.current[channel]);
        // Safety auto-clear in case a stop_typing event never arrives (e.g.
        // sender's app backgrounds mid-type).
        typingTimersRef.current[channel] = setTimeout(() => {
          setTyping(prev => ({ ...prev, [channel]: null }));
        }, 4000);
      });
      socket.on('user_stop_typing', ({ channel }) => {
        clearTimeout(typingTimersRef.current[channel]);
        setTyping(prev => ({ ...prev, [channel]: null }));
      });
    })();

    return () => {
      socket?.disconnect();
      socketRef.current = null;
      Object.values(typingTimersRef.current).forEach(clearTimeout);
      typingTimersRef.current = {};
    };
  }, [user?.id, loadPreviews]);

  // Screens (ChatThreadScreen) subscribe here to get live messages for the
  // channel they're currently viewing, without each screen managing its own
  // socket connection.
  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  const joinChannel = useCallback((channel) => {
    socketRef.current?.emit('join_channel', channel);
  }, []);

  const emitTyping = useCallback((channel, name) => {
    socketRef.current?.emit('typing', { channel, name });
  }, []);
  const emitStopTyping = useCallback((channel) => {
    socketRef.current?.emit('stop_typing', { channel });
  }, []);

  const value = {
    connected, previews, employees, typing, socketRef,
    subscribe, joinChannel, refreshPreviews: loadPreviews,
    emitTyping, emitStopTyping,
  };
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useChat = () => useContext(ChatContext);
