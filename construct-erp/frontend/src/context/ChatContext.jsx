// src/context/ChatContext.jsx — app-wide chat socket + Messenger-style floating
// DM popups. Mounted once at the app root so the socket connection (and any
// open DM popup) survives navigation between ERP modules, not just while the
// /chat page itself is open.
import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { io as socketIO } from 'socket.io-client';
import { Minus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../api/client';
import {
  Av, WA, MessageThread, Composer, fmtSize, withDateDividers, downloadAttachment,
} from '../components/chat/chatShared';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || window.location.origin;
const MAX_OPEN_POPUPS = 3;

// Two-note notification chime, synthesized with Web Audio API so there's no
// audio file to host. Lazily created so the AudioContext is only constructed
// (and, if needed, resumed) once a message actually needs to play — most
// browsers require it to happen after some prior user interaction on the page.
let chimeCtx;
function playChime() {
  try {
    if (!chimeCtx) chimeCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (chimeCtx.state === 'suspended') chimeCtx.resume();
    const t = chimeCtx.currentTime;
    const osc = chimeCtx.createOscillator();
    const gain = chimeCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(660, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(gain).connect(chimeCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  } catch { /* audio unsupported or blocked — silently skip */ }
}

export const CHANNELS = [
  { id: 'general',        label: 'General',        desc: 'Company-wide announcements' },
  { id: 'finance',        label: 'Finance',         desc: 'Finance, TDS, payments' },
  { id: 'procurement',    label: 'Procurement',     desc: 'POs, vendors, quotations' },
  { id: 'stores',         label: 'Stores',          desc: 'GRN, MRS, inventory' },
  { id: 'qs-billing',     label: 'QS & Billing',    desc: 'BOQ, RA bills' },
  { id: 'tqs',            label: 'DQS Tracker',     desc: 'Bill approvals' },
  { id: 'hr',             label: 'HR Admin',        desc: 'Payroll, attendance, leave' },
  { id: 'planning',       label: 'Planning',        desc: 'DPR, schedules' },
  { id: 'quality',        label: 'Quality & HSE',   desc: 'QA/QC, safety' },
  { id: 'subcontractors', label: 'Subcontractors',  desc: 'Work orders, RA bills' },
  { id: 'tender',         label: 'Tender Mgmt',     desc: 'Bids & tenders' },
  { id: 'it-support',     label: 'IT Support',      desc: 'Help desk, assets' },
];

const ChatContext = createContext(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}

export function ChatProvider({ children }) {
  const { user } = useAuthStore();

  const [connected, setConnected] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [unread, setUnread]       = useState({}); // { channelId: count }
  const [previews, setPreviews]   = useState({}); // { channelId: { text, file_name, sender_name, sender_id, created_at } }
  const [popups, setPopups]       = useState([]); // [{ channel, name, photo, minimized }]
  const [typing, setTyping]       = useState({});

  const socketRef       = useRef(null);
  const employeesRef    = useRef([]);
  const popupsRef        = useRef([]);
  const activeChannelsRef = useRef(new Set()); // channels a mounted page (e.g. ERPChat main pane) is actively showing
  const typingTimers    = useRef({});

  useEffect(() => { employeesRef.current = employees; }, [employees]);
  useEffect(() => { popupsRef.current = popups; }, [popups]);

  const registerActive = useCallback((channel, active) => {
    if (!channel) return;
    if (active) activeChannelsRef.current.add(channel);
    else activeChannelsRef.current.delete(channel);
  }, []);

  const markRead = useCallback((channel) => {
    setUnread(prev => (prev[channel] ? { ...prev, [channel]: 0 } : prev));
  }, []);

  const openPopup = useCallback((emp) => {
    if (!user?.id || !emp?.id) return;
    const name = emp.full_name || emp.name || 'Employee';
    const dmId = `dm-${[user.id, emp.id].sort().join('-')}`;
    setUnread(prev => (prev[dmId] ? { ...prev, [dmId]: 0 } : prev));
    setPopups(prev => {
      const existing = prev.find(p => p.channel === dmId);
      if (existing) return prev.map(p => p.channel === dmId ? { ...p, minimized: false } : p);
      const next = [...prev, { channel: dmId, name, photo: emp.profile_photo_url, minimized: false }];
      return next.slice(-MAX_OPEN_POPUPS);
    });
    if (socketRef.current?.connected) socketRef.current.emit('join_channel', dmId);
  }, [user?.id]);

  const closePopup = useCallback((channel) => {
    setPopups(prev => prev.filter(p => p.channel !== channel));
  }, []);

  const toggleMinimize = useCallback((channel) => {
    setPopups(prev => prev.map(p => p.channel === channel ? { ...p, minimized: !p.minimized } : p));
  }, []);

  // Clear unread whenever a popup becomes (or stays) the visible, un-minimized one
  useEffect(() => {
    popups.forEach(p => { if (!p.minimized) markRead(p.channel); });
  }, [popups, markRead]);

  // Employees — open to all staff (GET /users has no role gate, unlike /hr-admin/employees)
  useEffect(() => {
    if (!user?.id) return;
    api.get('/users').then(r => setEmployees((r.data?.data || []).filter(u => u.is_active !== false))).catch(() => {});
  }, [user?.id]);

  const findEmployeeForDm = useCallback((channel) => {
    if (!channel?.startsWith('dm-') || !user?.id) return null;
    const raw = channel.slice(3);
    const id1 = raw.slice(0, 36), id2 = raw.slice(37);
    const otherId = id1 === user.id ? id2 : id1;
    return employeesRef.current.find(e => e.id === otherId) || null;
  }, [user?.id]);

  // Socket connection — lives for the whole authenticated session
  useEffect(() => {
    if (!user?.id) return;
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    if (!token) return;

    const socket = socketIO(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      setConnected(true);
      popupsRef.current.forEach(p => socket.emit('join_channel', p.channel));
      activeChannelsRef.current.forEach(ch => socket.emit('join_channel', ch));
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', err => console.error('[chat] socket:', err.message));

    socket.on('new_message', (msg) => {
      setPreviews(prev => ({
        ...prev,
        [msg.channel]: { text: msg.text, file_name: msg.file_name, sender_name: msg.sender_name, sender_id: msg.sender_id, created_at: msg.created_at },
      }));

      const popupVisible = popupsRef.current.some(p => p.channel === msg.channel && !p.minimized);
      const isActive = activeChannelsRef.current.has(msg.channel);

      if (msg.sender_id !== user.id && !popupVisible && !isActive) {
        setUnread(prev => ({ ...prev, [msg.channel]: (prev[msg.channel] || 0) + 1 }));
        playChime();
      }

      if (msg.sender_id !== user.id && 'Notification' in window && Notification.permission === 'granted' && (document.hidden || (!popupVisible && !isActive))) {
        const ch = CHANNELS.find(c => c.id === msg.channel);
        const title = msg.channel.startsWith('dm-') ? msg.sender_name : `${msg.sender_name} · #${ch?.label || msg.channel}`;
        const n = new Notification(title, {
          body: msg.text || (msg.file_name ? `📎 ${msg.file_name}` : 'New message'),
          tag: `chat-${msg.channel}`,
          icon: '/logo192.png',
        });
        n.onclick = () => {
          window.focus();
          if (msg.channel.startsWith('dm-')) {
            const emp = findEmployeeForDm(msg.channel);
            if (emp) openPopup(emp);
          } else {
            window.location.assign(`/chat?channel=${msg.channel}`);
          }
          n.close();
        };
      }
    });

    socket.on('user_typing', ({ channel, name }) => {
      setTyping(prev => ({ ...prev, [channel]: name }));
      clearTimeout(typingTimers.current[channel]);
      typingTimers.current[channel] = setTimeout(() => setTyping(prev => ({ ...prev, [channel]: '' })), 3000);
    });
    socket.on('user_stop_typing', ({ channel }) => setTyping(prev => ({ ...prev, [channel]: '' })));

    socketRef.current = socket;
    return () => socket.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unreadTotal = Object.values(unread).reduce((a, b) => a + b, 0);

  const value = {
    socketRef, connected, employees, unread, unreadTotal, previews, popups, typing,
    openPopup, closePopup, toggleMinimize, markRead, registerActive, findEmployeeForDm,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
      <PopupStack popups={popups} socketRef={socketRef} typing={typing} unread={unread}
        currentUserId={user?.id} onClose={closePopup} onToggleMinimize={toggleMinimize} />
    </ChatContext.Provider>
  );
}

// ── Floating popup stack — Messenger-style chat heads ────────────────────────
function PopupStack({ popups, socketRef, typing, unread, currentUserId, onClose, onToggleMinimize }) {
  if (!popups.length) return null;
  return (
    <>
      {popups.map((popup, i) => (
        <DmPopupWindow
          key={popup.channel} popup={popup} index={i} socketRef={socketRef}
          typingUser={typing[popup.channel]} unreadCount={unread[popup.channel] || 0}
          currentUserId={currentUserId} onClose={() => onClose(popup.channel)}
          onToggleMinimize={() => onToggleMinimize(popup.channel)}
        />
      ))}
    </>
  );
}

function DmPopupWindow({ popup, index, socketRef, typingUser, unreadCount, currentUserId, onClose, onToggleMinimize }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [input, setInput]       = useState('');
  const [files, setFiles]       = useState([]);
  const [hovered, setHovered]   = useState(null);

  const threadRef = useRef(null);
  const textRef   = useRef(null);
  const typingTimerRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    api.get('/chat/messages', { params: { channel: popup.channel, limit: 100 } })
      .then(r => setMessages(r.data?.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [popup.channel]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onMsg = (msg) => { if (msg.channel === popup.channel) setMessages(prev => [...prev, msg]); };
    const onPinned = ({ id, channel, pinned }) => { if (channel === popup.channel) setMessages(prev => prev.map(m => m.id === id ? { ...m, pinned } : m)); };
    const onReacted = ({ id, channel, reactions }) => { if (channel === popup.channel) setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions } : m)); };
    socket.on('new_message', onMsg);
    socket.on('message_pinned', onPinned);
    socket.on('message_reacted', onReacted);
    return () => { socket.off('new_message', onMsg); socket.off('message_pinned', onPinned); socket.off('message_reacted', onReacted); };
  }, [socketRef, popup.channel]);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [messages, typingUser]);

  const items = withDateDividers(messages);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text && files.length === 0) return;
    if (files.some(f => f.uploading)) return;
    const payload = { channel: popup.channel, text: text || null, file_name: files[0]?.name || null, file_size: files[0]?.size || null, file_url: files[0]?.url || null };
    setInput(''); setFiles([]);
    if (textRef.current) textRef.current.style.height = 'auto';
    try {
      const res = await api.post('/chat/messages', payload);
      const saved = res.data.message;
      setMessages(prev => [...prev, saved]);
      socketRef.current?.emit('send_message', saved);
    } catch (e) { console.error('Send failed:', e); }
    socketRef.current?.emit('stop_typing', { channel: popup.channel });
  }, [input, files, popup.channel, socketRef]);

  const handleInput = useCallback((e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    socketRef.current?.emit('typing', { channel: popup.channel, name: 'Someone' });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => socketRef.current?.emit('stop_typing', { channel: popup.channel }), 2000);
  }, [popup.channel, socketRef]);

  const pickFiles = useCallback((picked) => {
    const placeholders = picked.map(f => ({ name: f.name, size: fmtSize(f.size), url: null, uploading: true, progress: 0 }));
    setFiles(prev => {
      const startIdx = prev.length;
      picked.forEach((file, idx) => {
        const targetIdx = startIdx + idx;
        const fd = new FormData(); fd.append('file', file);
        api.post('/upload/single', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: pe => {
            const pct = pe.total ? Math.round((pe.loaded * 100) / pe.total) : 0;
            setFiles(p => p.map((f, i) => i === targetIdx ? { ...f, progress: pct } : f));
          },
        })
          .then(r => setFiles(p => p.map((f, i) => i === targetIdx ? { ...f, url: r.data.url, uploading: false } : f)))
          .catch(err => {
            toast.error(err?.response?.data?.error || `Failed to upload ${file.name}`);
            setFiles(p => p.filter((_, i) => i !== targetIdx));
          });
      });
      return [...prev, ...placeholders];
    });
  }, []);

  const addReaction = useCallback(async (id, emoji) => {
    const res = await api.patch(`/chat/messages/${id}/react`, { emoji });
    const updated = res.data.message;
    setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions: updated.reactions } : m));
    socketRef.current?.emit('react_message', { id, channel: popup.channel, reactions: updated.reactions });
  }, [popup.channel, socketRef]);

  return (
    <div style={{
      position: 'fixed', right: 96 + index * 356, bottom: 24, zIndex: 100 + index,
      width: 340, height: popup.minimized ? 'auto' : 480,
      background: '#fff', borderRadius: 10, overflow: 'hidden',
      boxShadow: '0 6px 28px rgba(0,0,0,0.25)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div onClick={() => popup.minimized && onToggleMinimize()}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: WA.green, flexShrink: 0, cursor: popup.minimized ? 'pointer' : 'default' }}>
        <div style={{ position: 'relative' }}>
          <Av name={popup.name} size={34} photo={popup.photo} />
          <span style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: WA.greenBadge, border: `2px solid ${WA.green}` }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, color: '#fff', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{popup.name}</p>
          {!popup.minimized && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>Direct message</p>}
        </div>
        {popup.minimized && unreadCount > 0 && (
          <span style={{ background: '#fff', color: WA.green, borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{unreadCount}</span>
        )}
        <button onClick={(e) => { e.stopPropagation(); onToggleMinimize(); }}
          style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Minus size={14} color="#fff" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <X size={14} color="#fff" />
        </button>
      </div>

      {!popup.minimized && (
        <>
          <MessageThread
            items={items} loading={loading} emptyText="No messages yet — say hi!"
            searchQuery="" userId={currentUserId} isDm={true} compact={true}
            hoveredMsg={hovered} onHover={setHovered} onDownload={downloadAttachment}
            onTogglePin={() => {}} onReact={addReaction}
            typingUser={typingUser} threadRef={threadRef}
          />
          <Composer
            inputVal={input} onInputChange={handleInput}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            onSend={send} pendingFiles={files}
            onRemoveFile={i => setFiles(p => p.filter((_, j) => j !== i))}
            onPickFiles={pickFiles}
            disabled={(!input.trim() && files.length === 0) || files.some(f => f.uploading)}
            textRef={textRef} compact={true}
          />
        </>
      )}
    </div>
  );
}
