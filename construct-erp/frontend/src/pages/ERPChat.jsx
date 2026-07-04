// src/pages/ERPChat.jsx — WhatsApp-styled ERP Team Chat (Socket.IO + REST)
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { io as socketIO } from 'socket.io-client';
import {
  Send, Paperclip, Search, Pin, X, Smile,
  FileText, FileSpreadsheet, Image as ImgIcon, File,
  Download, Loader2, CheckCheck, Hash, MessageSquare,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../api/client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || window.location.origin;

const CHANNELS = [
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

const AV_COLORS = ['#075e54','#128c7e','#1c6ea4','#6c3483','#1a5276','#784212','#186a3b','#7b241c','#4a235a','#0e6655'];
function avColor(name = '') {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AV_COLORS.length; return AV_COLORS[h];
}

function Av({ name = '', size = 40, photo }) {
  const fs = Math.round(size * 0.38);
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avColor(name), color: '#fff', fontWeight: 700, fontSize: fs, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, userSelect: 'none' }}>
      {getInitials(name)}
    </div>
  );
}

function FileIcon({ name = '', size = 18 }) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const Icon = ['xlsx','xls','csv'].includes(ext) ? FileSpreadsheet : ['pdf'].includes(ext) ? FileText : ['png','jpg','jpeg','gif','webp'].includes(ext) ? ImgIcon : File;
  return <Icon size={size} />;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDateLabel(ts) {
  const d = new Date(ts), t = new Date(), y = new Date(t);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'TODAY';
  if (d.toDateString() === y.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}

function fmtSize(n) {
  n = Number(n); if (!n || isNaN(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

// WhatsApp palette
const WA = {
  bg:          '#efeae2',
  sidebar:     '#f0f2f5',
  myBubble:    '#dcf8c6',
  bubble:      '#ffffff',
  green:       '#00a884',
  greenBadge:  '#25d366',
  dark:        '#111b21',
  muted:       '#667781',
  divider:     '#e9edef',
  active:      '#ffffff',
  hover:       '#f5f6f6',
};

// ─────────────────────────────────────────────────────────────────────────────
export default function ERPChat() {
  const { user } = useAuthStore();
  const [activeChannel, setActiveChannel] = useState('general');
  const [messages, setMessages]           = useState([]);
  const [employees, setEmployees]         = useState([]);
  const [inputVal, setInputVal]           = useState('');
  const [pendingFiles, setPendingFiles]   = useState([]);
  const [loading, setLoading]             = useState(false);
  const [connected, setConnected]         = useState(false);
  const [typingUser, setTypingUser]       = useState('');
  const [searchOpen, setSearchOpen]       = useState(false);
  const [pinsOpen, setPinsOpen]           = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [hoveredMsg, setHoveredMsg]       = useState(null);
  const [unread, setUnread]               = useState({});
  const [notifPerm, setNotifPerm]         = useState('Notification' in window ? Notification.permission : 'unsupported');
  const [notifDismissed, setNotifDismissed] = useState(false);

  const socketRef   = useRef(null);
  const msgsRef     = useRef(null);
  const fileRef     = useRef(null);
  const searchRef   = useRef(null);
  const textRef     = useRef(null);
  const typingTimer = useRef(null);
  const activeChannelRef = useRef(activeChannel);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

  const enableNotifications = () => {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(setNotifPerm);
  };

  // ── Socket.IO connection ─────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    if (!token) return;

    const socket = socketIO(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      setConnected(true);
      // Re-join current channel on connect — critical for DM channels that are NOT
      // in the server's fixed CHAT_CHANNELS list (auto-joined on connect). Without
      // this, if the socket connects AFTER the user has already switched to a DM
      // channel the earlier join_channel emit was lost (socket wasn't connected yet).
      socket.emit('join_channel', activeChannelRef.current);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', err => { console.error('[chat] socket:', err.message); setConnected(false); });

    socket.on('new_message', (msg) => {
      const isOther = msg.channel !== activeChannelRef.current;
      setMessages(prev => isOther ? prev : [...prev, msg]);
      setUnread(prev => ({ ...prev, [msg.channel]: isOther ? (prev[msg.channel] || 0) + 1 : 0 }));
      if (msg.sender_id !== user?.id && 'Notification' in window && Notification.permission === 'granted' && (document.hidden || isOther)) {
        const ch = CHANNELS.find(c => c.id === msg.channel);
        const title = msg.channel.startsWith('dm-') ? msg.sender_name : `${msg.sender_name} · #${ch?.label || msg.channel}`;
        const n = new Notification(title, { body: msg.text || (msg.file_name ? `📎 ${msg.file_name}` : 'New message'), tag: `chat-${msg.channel}`, icon: '/logo192.png' });
        n.onclick = () => { window.focus(); setActiveChannel(msg.channel); n.close(); };
      }
    });

    socket.on('message_pinned',  ({ id, pinned })    => setMessages(prev => prev.map(m => m.id === id ? { ...m, pinned } : m)));
    socket.on('message_reacted', ({ id, reactions }) => setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions } : m)));
    socket.on('user_typing',     ({ name }) => { setTypingUser(name); clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => setTypingUser(''), 3000); });
    socket.on('user_stop_typing', () => setTypingUser(''));

    socketRef.current = socket;
    return () => socket.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load employees for DM list (no cap — show everyone) ──────────────────────
  // Uses /users (open to any authenticated staff member) rather than
  // /hr-admin/employees, which 403s for non-HR/admin roles and left most
  // staff with an empty DM list.
  useEffect(() => {
    api.get('/users')
      .then(r => setEmployees((r.data?.data || []).filter(u => u.is_active !== false)))
      .catch(() => {});
  }, []);

  // ── Channel switch ───────────────────────────────────────────────────────────
  useEffect(() => {
    setMessages([]); setLoading(true); setSearchOpen(false); setSearchQuery(''); setPinsOpen(false);
    if (socketRef.current?.connected) socketRef.current.emit('join_channel', activeChannel);
    api.get('/chat/messages', { params: { channel: activeChannel, limit: 100 } })
      .then(r => setMessages(r.data?.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
    setUnread(prev => ({ ...prev, [activeChannel]: 0 }));
  }, [activeChannel]);

  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, [messages, typingUser]);
  useEffect(() => { if (searchOpen && searchRef.current) searchRef.current.focus(); }, [searchOpen]);

  // ── Download attachment ──────────────────────────────────────────────────────
  const downloadAttachment = useCallback(async (url, filename) => {
    if (!url) return;
    if (/^https?:\/\//i.test(url)) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    try {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const bu = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = bu; a.download = filename || 'file';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(bu);
    } catch (e) { toast.error(e.message || 'Failed to download'); }
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMsg = useCallback(async () => {
    const text = inputVal.trim();
    if (!text && pendingFiles.length === 0) return;
    if (pendingFiles.some(f => f.uploading)) return;
    const payload = { channel: activeChannel, text: text || null, file_name: pendingFiles[0]?.name || null, file_size: pendingFiles[0]?.size || null, file_url: pendingFiles[0]?.url || null };
    setInputVal(''); setPendingFiles([]);
    if (textRef.current) textRef.current.style.height = 'auto';
    try {
      const res = await api.post('/chat/messages', payload);
      const saved = res.data.message;
      setMessages(prev => [...prev, saved]);
      socketRef.current?.emit('send_message', saved);
    } catch (e) { console.error('Send failed:', e); }
    socketRef.current?.emit('stop_typing', { channel: activeChannel });
  }, [inputVal, pendingFiles, activeChannel]);

  const handleInput = (e) => {
    setInputVal(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    socketRef.current?.emit('typing', { channel: activeChannel, name: user?.name || 'Someone' });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketRef.current?.emit('stop_typing', { channel: activeChannel }), 2000);
  };

  const togglePin = useCallback(async (id) => {
    const res = await api.patch(`/chat/messages/${id}/pin`);
    const updated = res.data.message;
    setMessages(prev => prev.map(m => m.id === id ? { ...m, pinned: updated.pinned } : m));
    socketRef.current?.emit('pin_message', { id, channel: activeChannel, pinned: updated.pinned });
  }, [activeChannel]);

  const addReaction = useCallback(async (msgId, emoji) => {
    const res = await api.patch(`/chat/messages/${msgId}/react`, { emoji });
    const updated = res.data.message;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: updated.reactions } : m));
    socketRef.current?.emit('react_message', { id: msgId, channel: activeChannel, reactions: updated.reactions });
  }, [activeChannel]);

  // ── Derived state ────────────────────────────────────────────────────────────
  const isDm = activeChannel.startsWith('dm-');
  const dmPartner = isDm ? employees.find(e => `dm-${[user?.id, e.id].sort().join('-')}` === activeChannel) : null;
  const activeCh = isDm
    ? { id: activeChannel, label: dmPartner?.full_name || dmPartner?.name || 'Direct Message', desc: dmPartner?.designation_name || dmPartner?.designation || 'Direct message' }
    : (CHANNELS.find(c => c.id === activeChannel) || CHANNELS[0]);

  const pinned = messages.filter(m => m.pinned);

  const visible = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const visibleWithDividers = useMemo(() => {
    const items = []; let lastDate = null;
    for (const msg of visible) {
      const d = new Date(msg.created_at).toDateString();
      if (d !== lastDate) { items.push({ _type: 'divider', ts: msg.created_at, key: `div-${d}` }); lastDate = d; }
      items.push({ ...msg, _type: 'msg' });
    }
    return items;
  }, [visible]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Notification banner */}
      {notifPerm === 'default' && !notifDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px', background: WA.green, color: '#fff', fontSize: 12, flexShrink: 0 }}>
          <span style={{ flex: 1 }}>🔔 Enable desktop notifications to get chat alerts when this tab is in the background.</span>
          <button onClick={enableNotifications} style={{ padding: '3px 12px', background: '#fff', color: WA.green, borderRadius: 6, fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 12 }}>Enable</button>
          <button onClick={() => setNotifDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.75)', display: 'flex' }}><X size={14} /></button>
        </div>
      )}
      {notifPerm === 'denied' && !notifDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px', background: '#fff8e1', borderBottom: '1px solid #ffe082', fontSize: 12, flexShrink: 0 }}>
          <span style={{ flex: 1, color: '#6d4c00' }}>🔕 Notifications are blocked. Click the lock icon in your address bar → Notifications → Allow, then reload.</span>
          <button onClick={() => setNotifDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b8860b', display: 'flex' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── SIDEBAR ───────────────────────────────────────────────────────── */}
        <aside style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', background: WA.sidebar, borderRight: `1px solid ${WA.divider}`, overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
            <Av name={user?.name || 'Me'} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: WA.dark, fontSize: 16 }}>Construct ERP</p>
              <p style={{ fontSize: 11, color: WA.muted }}>Team Chat</p>
            </div>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? WA.greenBadge : '#ccc', flexShrink: 0 }} title={connected ? 'Connected' : 'Connecting…'} />
          </div>

          {/* Search */}
          <div style={{ padding: '8px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '7px 12px', border: `1px solid ${WA.divider}` }}>
              <Search size={14} color={WA.muted} />
              <input placeholder="Search channels…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: WA.dark }} />
            </div>
          </div>

          {/* List */}
          <nav style={{ flex: 1, overflowY: 'auto' }}>

            {/* — Channels — */}
            <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: WA.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Channels</div>
            {CHANNELS.map(ch => {
              const isActive = activeChannel === ch.id;
              const badge = unread[ch.id] || 0;
              return (
                <button key={ch.id} onClick={() => setActiveChannel(ch.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', background: isActive ? WA.active : 'transparent', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${WA.divider}`, textAlign: 'left', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = WA.hover; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: isActive ? WA.green : '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Hash size={19} color={isActive ? '#fff' : WA.muted} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, color: WA.dark, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ch.label}</span>
                      {badge > 0 && <span style={{ background: WA.greenBadge, color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0, marginLeft: 6 }}>{badge}</span>}
                    </div>
                    <p style={{ fontSize: 12, color: WA.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.desc}</p>
                  </div>
                </button>
              );
            })}

            {/* — Direct Messages — */}
            {employees.filter(e => e.id !== user?.id).length > 0 && (
              <>
                <div style={{ padding: '12px 16px 4px', fontSize: 11, fontWeight: 700, color: WA.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Direct Messages</div>
                {employees.filter(e => e.id !== user?.id).map(emp => {
                  const name = emp.full_name || emp.name || 'Employee';
                  const dmId = `dm-${[user?.id, emp.id].sort().join('-')}`;
                  const isActive = activeChannel === dmId;
                  const badge = unread[dmId] || 0;
                  return (
                    <button key={emp.id} onClick={() => setActiveChannel(dmId)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', background: isActive ? WA.active : 'transparent', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${WA.divider}`, textAlign: 'left', transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = WA.hover; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <Av name={name} size={46} photo={emp.profile_photo_url} />
                        <span style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: WA.greenBadge, border: `2px solid ${WA.sidebar}` }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, color: WA.dark, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
                          {badge > 0 && <span style={{ background: WA.greenBadge, color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0, marginLeft: 6 }}>{badge}</span>}
                        </div>
                        <p style={{ fontSize: 12, color: WA.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.designation_name || emp.designation || 'Direct message'}</p>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </nav>
        </aside>

        {/* ── CHAT AREA ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Chat header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: WA.sidebar, borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
            {isDm
              ? <Av name={activeCh.label} size={40} photo={dmPartner?.profile_photo_url} />
              : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: WA.green, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Hash size={18} color="#fff" />
                </div>
              )
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: WA.dark, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isDm ? activeCh.label : `#${activeCh.label}`}
              </p>
              <p style={{ fontSize: 12, color: WA.muted }}>{activeCh.desc}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button onClick={() => { setSearchOpen(v => !v); if (pinsOpen) setPinsOpen(false); }}
                style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: searchOpen ? WA.divider : 'none' }}>
                <Search size={18} color={searchOpen ? WA.green : WA.muted} />
              </button>
              <button onClick={() => { setPinsOpen(v => !v); if (searchOpen) { setSearchOpen(false); setSearchQuery(''); } }}
                style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: pinsOpen ? WA.divider : 'none' }}>
                <Pin size={18} color={pinsOpen ? '#b7860b' : WA.muted} />
              </button>
            </div>
          </div>

          {/* Pinned panel */}
          {pinsOpen && (
            <div style={{ background: '#fffde7', borderBottom: '1px solid #ffe082', padding: '10px 16px', maxHeight: 160, overflowY: 'auto', flexShrink: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#b7860b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Pin size={11} /> Pinned Messages
                {pinned.length === 0 && <span style={{ fontWeight: 400, color: '#c9960c' }}>— hover a message to pin it</span>}
              </p>
              {pinned.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '6px 10px', marginBottom: 4, border: '1px solid #ffe082' }}>
                  <Av name={m.sender_name} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: WA.dark, marginRight: 6 }}>{m.sender_name}</span>
                    <span style={{ fontSize: 12, color: WA.muted }}>{m.text?.slice(0, 80)}{m.text?.length > 80 ? '…' : ''}</span>
                  </div>
                  <button onClick={() => togglePin(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, display: 'flex' }}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Search bar */}
          {searchOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#fff', borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
              <Search size={14} color={WA.muted} />
              <input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: WA.dark, background: 'none' }} />
              {searchQuery && <span style={{ fontSize: 12, color: WA.muted }}>{visible.length} result{visible.length !== 1 ? 's' : ''}</span>}
              <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, display: 'flex' }}><X size={16} /></button>
            </div>
          )}

          {/* ── MESSAGES ──────────────────────────────────────────────────── */}
          <div ref={msgsRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 6%', background: WA.bg, display: 'flex', flexDirection: 'column', gap: 0 }}>

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: WA.muted }}>
                <Loader2 size={22} className="animate-spin" style={{ marginRight: 8 }} />
                <span style={{ fontSize: 14 }}>Loading messages…</span>
              </div>
            )}

            {!loading && visible.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: WA.muted }}>
                <MessageSquare size={42} style={{ opacity: 0.18, marginBottom: 10 }} />
                <p style={{ fontSize: 14 }}>{searchQuery ? 'No messages match your search' : 'No messages yet — say something!'}</p>
              </div>
            )}

            {!loading && visibleWithDividers.map((item, idx) => {

              /* Date divider */
              if (item._type === 'divider') {
                return (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 6px' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.1)' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', background: 'rgba(255,255,255,0.85)', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                      {fmtDateLabel(item.ts)}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.1)' }} />
                  </div>
                );
              }

              const m = item;
              const prevItem = visibleWithDividers[idx - 1];
              const prev = prevItem?._type === 'msg' ? prevItem : null;
              const grouped = prev && prev.sender_id === m.sender_id && (new Date(m.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000;
              const isMe = m.sender_id === user?.id;

              return (
                <div key={m.id}
                  onMouseEnter={() => setHoveredMsg(m.id)}
                  onMouseLeave={() => setHoveredMsg(null)}
                  style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: grouped ? 2 : 10, position: 'relative' }}>

                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: '72%', flexDirection: isMe ? 'row-reverse' : 'row' }}>

                    {/* Avatar (others only) */}
                    {!isMe && (grouped ? <div style={{ width: 28, flexShrink: 0 }} /> : <Av name={m.sender_name} size={28} />)}

                    {/* Bubble wrapper */}
                    <div style={{ position: 'relative' }}>
                      <div style={{
                        background: isMe ? WA.myBubble : WA.bubble,
                        borderRadius: isMe
                          ? (grouped ? '12px' : '12px 2px 12px 12px')
                          : (grouped ? '12px' : '2px 12px 12px 12px'),
                        padding: '7px 11px 22px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        minWidth: 70,
                        position: 'relative',
                        wordBreak: 'break-word',
                      }}>
                        {/* Sender name (channel, not DM, others only, first in group) */}
                        {!isMe && !isDm && !grouped && (
                          <p style={{ fontSize: 12, fontWeight: 700, color: avColor(m.sender_name), marginBottom: 3 }}>{m.sender_name}</p>
                        )}

                        {/* Text */}
                        {m.text && (
                          <p style={{ fontSize: 14, color: WA.dark, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            {searchQuery
                              ? m.text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                                  part.toLowerCase() === searchQuery.toLowerCase()
                                    ? <mark key={i} style={{ background: '#ffd97d', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
                                    : part
                                )
                              : m.text}
                          </p>
                        )}

                        {/* File attachment */}
                        {m.file_name && (
                          <div style={{ marginTop: m.text ? 6 : 0 }}>
                            {m.file_url ? (
                              <button onClick={() => downloadAttachment(m.file_url, m.file_name)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, background: isMe ? 'rgba(0,0,0,0.06)' : '#f0f2f5', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', width: '100%', textAlign: 'left', minWidth: 180 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 6, background: isMe ? 'rgba(0,0,0,0.1)' : '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: WA.muted }}>
                                  <FileIcon name={m.file_name} size={20} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 13, fontWeight: 600, color: WA.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name}</p>
                                  {m.file_size && <p style={{ fontSize: 11, color: WA.muted }}>{m.file_size}</p>}
                                </div>
                                <Download size={15} color={WA.muted} style={{ flexShrink: 0 }} />
                              </button>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '8px 10px', opacity: 0.55, color: WA.muted }}>
                                <File size={18} />
                                <span style={{ fontSize: 13 }}>{m.file_name}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Reactions */}
                        {(m.reactions || []).length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                            {m.reactions.map((r, i) => (
                              <span key={i} onClick={() => addReaction(m.id, r.e)}
                                style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 999, padding: '1px 6px', cursor: 'pointer', background: 'rgba(255,255,255,0.65)', userSelect: 'none' }}>
                                {r.e} {r.c}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Time + sent tick — inside bubble, bottom-right */}
                        <div style={{ position: 'absolute', bottom: 5, right: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 10, color: isMe ? 'rgba(0,0,0,0.4)' : WA.muted, whiteSpace: 'nowrap' }}>{fmtTime(m.created_at)}</span>
                          {isMe && <CheckCheck size={13} color="#53bdeb" />}
                        </div>

                        {/* Pin indicator */}
                        {m.pinned && (
                          <span style={{ position: 'absolute', top: -7, [isMe ? 'left' : 'right']: -7, background: '#e6a817', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Pin size={8} color="#fff" />
                          </span>
                        )}
                      </div>

                      {/* Hover quick-action bar */}
                      {hoveredMsg === m.id && (
                        <div style={{
                          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                          [isMe ? 'left' : 'right']: -96,
                          display: 'flex', alignItems: 'center', gap: 2,
                          background: '#fff', border: `1px solid ${WA.divider}`, borderRadius: 20,
                          padding: '3px 6px', boxShadow: '0 2px 10px rgba(0,0,0,0.12)', zIndex: 20,
                        }}>
                          {['👍','✅','🎉'].map(e => (
                            <button key={e} onClick={() => addReaction(m.id, e)}
                              style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {e}
                            </button>
                          ))}
                          <div style={{ width: 1, height: 16, background: WA.divider, margin: '0 2px' }} />
                          <button onClick={() => togglePin(m.id)}
                            style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Pin size={13} color={m.pinned ? '#b7860b' : WA.muted} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {typingUser && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 8 }}>
                <div style={{ background: WA.bubble, borderRadius: '2px 12px 12px 12px', padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: WA.muted, display: 'inline-block', animation: `waTyping 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                  <span style={{ fontSize: 12, color: WA.muted, marginLeft: 4 }}>{typingUser} is typing…</span>
                </div>
              </div>
            )}
          </div>

          {/* ── COMPOSER ──────────────────────────────────────────────────── */}
          <div style={{ padding: '8px 12px', background: WA.sidebar, borderTop: `1px solid ${WA.divider}`, flexShrink: 0 }}>

            {/* Pending files preview */}
            {pendingFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${WA.divider}`, borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
                    {f.uploading
                      ? <Loader2 size={13} className="animate-spin" />
                      : <FileIcon name={f.name} size={13} />}
                    <span style={{ color: WA.dark, fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    {f.uploading
                      ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 60, height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${f.progress || 0}%`, height: '100%', background: WA.green, transition: 'width 0.2s' }} />
                          </div>
                          <span style={{ color: WA.muted, fontSize: 11 }}>{f.progress || 0}%</span>
                        </div>
                      )
                      : <span style={{ color: WA.muted }}>{f.size}</span>
                    }
                    {!f.uploading && (
                      <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, display: 'flex', padding: 0 }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              {/* Attach + emoji */}
              <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 4 }}>
                <button onClick={() => fileRef.current?.click()}
                  style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: WA.muted }}>
                  <Paperclip size={20} />
                </button>
                <button style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: WA.muted }}>
                  <Smile size={20} />
                </button>
              </div>

              {/* Text input */}
              <div style={{ flex: 1, background: '#fff', borderRadius: 24, border: `1px solid ${WA.divider}`, display: 'flex', alignItems: 'flex-end', padding: '0 14px' }}>
                <textarea ref={textRef} value={inputVal} onChange={handleInput}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                  placeholder="Type a message"
                  rows={1}
                  style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: 14, color: WA.dark, background: 'none', lineHeight: 1.5, minHeight: 40, maxHeight: 120, paddingTop: 8, paddingBottom: 8, fontFamily: 'inherit' }}
                />
              </div>

              {/* Send button */}
              <button onClick={sendMsg}
                disabled={(!inputVal.trim() && pendingFiles.length === 0) || pendingFiles.some(f => f.uploading)}
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: (inputVal.trim() || pendingFiles.length > 0) && !pendingFiles.some(f => f.uploading) ? WA.green : '#ccc',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}>
                <Send size={18} color="#fff" style={{ marginLeft: 2 }} />
              </button>
            </div>

            <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
              onChange={e => {
                const files = Array.from(e.target.files);
                e.target.value = '';
                if (!files.length) return;
                const placeholders = files.map(f => ({ name: f.name, size: fmtSize(f.size), rawSize: f.size, url: null, uploading: true, progress: 0 }));
                setPendingFiles(prev => [...prev, ...placeholders]);
                files.forEach((file, idx) => {
                  const startIdx = pendingFiles.length + idx;
                  const fd = new FormData(); fd.append('file', file);
                  api.post('/upload/single', fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: pe => {
                      const pct = pe.total ? Math.round((pe.loaded * 100) / pe.total) : 0;
                      setPendingFiles(prev => prev.map((p, i) => i === startIdx ? { ...p, progress: pct } : p));
                    },
                  })
                    .then(r => setPendingFiles(prev => prev.map((p, i) => i === startIdx ? { ...p, url: r.data.url, uploading: false } : p)))
                    .catch(err => {
                      toast.error(err?.response?.data?.error || `Failed to upload ${file.name}`);
                      setPendingFiles(prev => prev.filter((_, i) => i !== startIdx));
                    });
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* Inline CSS for animations */}
      <style>{`
        @keyframes waTyping { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }
      `}</style>
    </div>
  );
}
