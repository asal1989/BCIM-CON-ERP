// src/pages/ERPChat.jsx — ERP Team Chat with separate Channels / DMs tabs
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Pin, X, Hash, MessageSquare, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../api/client';
import { useChat, CHANNELS } from '../context/ChatContext';
import { Av, WA, MessageThread, Composer, fmtSize, withDateDividers, downloadAttachment } from '../components/chat/chatShared';

// ── Tab bar ────────────────────────────────────────────────────────────────────
function TabBar({ tab, onTab, channelUnread, dmUnread }) {
  const tabs = [
    { id: 'channels', label: 'Channels',        Icon: Hash,         badge: channelUnread },
    { id: 'dms',      label: 'Direct Messages', Icon: MessageSquare, badge: dmUnread },
  ];
  return (
    <div style={{ display: 'flex', borderBottom: `2px solid ${WA.divider}`, flexShrink: 0, background: WA.sidebar }}>
      {tabs.map(({ id, label, Icon, badge }) => {
        const active = tab === id;
        return (
          <button key={id} onClick={() => onTab(id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '11px 8px', border: 'none', cursor: 'pointer', background: 'none',
              borderBottom: active ? `2px solid ${WA.green}` : '2px solid transparent',
              marginBottom: -2, color: active ? WA.green : WA.muted,
              fontWeight: active ? 700 : 500, fontSize: 13, transition: 'all 0.15s',
            }}>
            <Icon size={15} />
            {label}
            {badge > 0 && (
              <span style={{ background: WA.greenBadge, color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Shared search bar ──────────────────────────────────────────────────────────
function SidebarSearch({ value, onChange, placeholder }) {
  return (
    <div style={{ padding: '8px 12px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '7px 12px', border: `1px solid ${WA.divider}` }}>
        <Search size={14} color={WA.muted} />
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: WA.dark }} />
        {value && (
          <button onClick={() => onChange('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, display: 'flex', padding: 0 }}>
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Channel list item ──────────────────────────────────────────────────────────
function ChannelItem({ ch, isActive, badge, onClick }) {
  return (
    <button onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', background: isActive ? WA.active : 'transparent', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${WA.divider}`, textAlign: 'left', transition: 'background 0.1s' }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = WA.hover; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? WA.active : 'transparent'; }}>
      <div style={{ width: 46, height: 46, borderRadius: '50%', background: isActive ? WA.green : '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Hash size={19} color={isActive ? '#fff' : WA.muted} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontWeight: 600, color: WA.dark, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ch.label}</span>
          {badge > 0 && <span style={{ background: WA.greenBadge, color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0, marginLeft: 6 }}>{badge}</span>}
        </div>
        <p style={{ fontSize: 12, color: WA.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.desc}</p>
      </div>
    </button>
  );
}

// ── DM list item ───────────────────────────────────────────────────────────────
function DmItem({ emp, isActive, badge, onClick }) {
  const name = emp.full_name || emp.name || 'Employee';
  return (
    <button onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', background: isActive ? WA.active : 'transparent', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${WA.divider}`, textAlign: 'left', transition: 'background 0.1s' }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = WA.hover; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? WA.active : 'transparent'; }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Av name={name} size={46} photo={emp.profile_photo_url} />
        <span style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: WA.greenBadge, border: `2px solid ${WA.sidebar}` }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontWeight: 600, color: WA.dark, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
          {badge > 0 && <span style={{ background: WA.greenBadge, color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0, marginLeft: 6 }}>{badge}</span>}
        </div>
        <p style={{ fontSize: 12, color: WA.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.designation_name || emp.designation || 'Direct message'}</p>
      </div>
    </button>
  );
}

// ── Empty state for main pane ──────────────────────────────────────────────────
function EmptyPane({ tab }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: WA.bg, gap: 12 }}>
      {tab === 'channels'
        ? <Hash size={48} color={WA.muted} style={{ opacity: 0.2 }} />
        : <Users size={48} color={WA.muted} style={{ opacity: 0.2 }} />}
      <p style={{ fontSize: 14, color: WA.muted }}>
        {tab === 'channels' ? 'Select a channel to start chatting' : 'Select a person to start a direct message'}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ERPChat() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const { socketRef, connected, employees, unread, typing, markRead, registerActive } = useChat();

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('channels');

  // ── Channel state ────────────────────────────────────────────────────────────
  const [channel, setChannel]       = useState(() => searchParams.get('channel') || 'general');
  const [chMessages, setChMessages] = useState([]);
  const [chLoading, setChLoading]   = useState(false);
  const [chInput, setChInput]       = useState('');
  const [chFiles, setChFiles]       = useState([]);
  const [chHovered, setChHovered]   = useState(null);
  const [chSearch, setChSearch]     = useState('');
  const [chSearchOpen, setChSearchOpen] = useState(false);
  const [chPinsOpen, setChPinsOpen] = useState(false);
  const chThreadRef  = useRef(null);
  const chTextRef    = useRef(null);
  const chSearchRef  = useRef(null);
  const chTypingRef  = useRef(null);

  // ── DM state ─────────────────────────────────────────────────────────────────
  const [dmPeer, setDmPeer]         = useState(null); // selected employee object
  const [dmMessages, setDmMessages] = useState([]);
  const [dmLoading, setDmLoading]   = useState(false);
  const [dmInput, setDmInput]       = useState('');
  const [dmFiles, setDmFiles]       = useState([]);
  const [dmHovered, setDmHovered]   = useState(null);
  const dmThreadRef  = useRef(null);
  const dmTextRef    = useRef(null);
  const dmTypingRef  = useRef(null);

  // ── Sidebar search ────────────────────────────────────────────────────────────
  const [sidebarQ, setSidebarQ] = useState('');

  // ── Notification permission ───────────────────────────────────────────────────
  const [notifPerm, setNotifPerm]           = useState('Notification' in window ? Notification.permission : 'unsupported');
  const [notifDismissed, setNotifDismissed] = useState(false);

  const dmChannel = useMemo(() => {
    if (!dmPeer || !user?.id) return null;
    return `dm-${[user.id, dmPeer.id].sort().join('-')}`;
  }, [dmPeer, user?.id]);

  // ── URL channel param ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = searchParams.get('channel');
    if (ch && ch !== channel) { setChannel(ch); setTab('channels'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Register active channel ───────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'channels') return;
    registerActive(channel, true);
    if (socketRef.current?.connected) socketRef.current.emit('join_channel', channel);
    return () => registerActive(channel, false);
  }, [channel, tab, registerActive, socketRef]);

  useEffect(() => {
    if (!dmChannel || tab !== 'dms') return;
    registerActive(dmChannel, true);
    if (socketRef.current?.connected) socketRef.current.emit('join_channel', dmChannel);
    return () => registerActive(dmChannel, false);
  }, [dmChannel, tab, registerActive, socketRef]);

  useEffect(() => {
    if (!connected) return;
    socketRef.current?.emit('join_channel', channel);
    if (dmChannel) socketRef.current?.emit('join_channel', dmChannel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // ── Socket listeners ──────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onMsg     = (msg) => {
      if (msg.channel === channel)    setChMessages(prev => [...prev, msg]);
      if (msg.channel === dmChannel)  setDmMessages(prev => [...prev, msg]);
    };
    const onPinned  = ({ id, channel: ch, pinned }) => {
      if (ch === channel)   setChMessages(prev => prev.map(m => m.id === id ? { ...m, pinned } : m));
    };
    const onReacted = ({ id, channel: ch, reactions }) => {
      if (ch === channel)   setChMessages(prev => prev.map(m => m.id === id ? { ...m, reactions } : m));
      if (ch === dmChannel) setDmMessages(prev => prev.map(m => m.id === id ? { ...m, reactions } : m));
    };
    socket.on('new_message',    onMsg);
    socket.on('message_pinned', onPinned);
    socket.on('message_reacted', onReacted);
    return () => { socket.off('new_message', onMsg); socket.off('message_pinned', onPinned); socket.off('message_reacted', onReacted); };
  }, [socketRef, channel, dmChannel]);

  // ── Load channel messages ─────────────────────────────────────────────────────
  useEffect(() => {
    setChMessages([]); setChLoading(true); setChSearchOpen(false); setChSearch(''); setChPinsOpen(false);
    api.get('/chat/messages', { params: { channel, limit: 100 } })
      .then(r => setChMessages(r.data?.messages || []))
      .catch(() => setChMessages([]))
      .finally(() => setChLoading(false));
    markRead(channel);
  }, [channel, markRead]);

  // ── Load DM messages ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dmChannel) return;
    setDmMessages([]); setDmLoading(true);
    api.get('/chat/messages', { params: { channel: dmChannel, limit: 100 } })
      .then(r => setDmMessages(r.data?.messages || []))
      .catch(() => setDmMessages([]))
      .finally(() => setDmLoading(false));
    markRead(dmChannel);
  }, [dmChannel, markRead]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  useEffect(() => { if (chThreadRef.current) chThreadRef.current.scrollTop = chThreadRef.current.scrollHeight; }, [chMessages, typing[channel]]);
  useEffect(() => { if (dmThreadRef.current) dmThreadRef.current.scrollTop = dmThreadRef.current.scrollHeight; }, [dmMessages, typing[dmChannel]]);
  useEffect(() => { if (chSearchOpen && chSearchRef.current) chSearchRef.current.focus(); }, [chSearchOpen]);

  // ── Send channel message ──────────────────────────────────────────────────────
  const sendChannel = useCallback(async () => {
    const text = chInput.trim();
    if (!text && chFiles.length === 0) return;
    if (chFiles.some(f => f.uploading)) return;
    const payload = { channel, text: text || null, file_name: chFiles[0]?.name || null, file_size: chFiles[0]?.size || null, file_url: chFiles[0]?.url || null };
    setChInput(''); setChFiles([]);
    if (chTextRef.current) chTextRef.current.style.height = 'auto';
    try {
      const res = await api.post('/chat/messages', payload);
      setChMessages(prev => [...prev, res.data.message]);
      socketRef.current?.emit('send_message', res.data.message);
    } catch (e) { console.error('Send failed:', e); }
    socketRef.current?.emit('stop_typing', { channel });
  }, [chInput, chFiles, channel, socketRef]);

  // ── Send DM message ───────────────────────────────────────────────────────────
  const sendDm = useCallback(async () => {
    if (!dmChannel) return;
    const text = dmInput.trim();
    if (!text && dmFiles.length === 0) return;
    if (dmFiles.some(f => f.uploading)) return;
    const payload = { channel: dmChannel, text: text || null, file_name: dmFiles[0]?.name || null, file_size: dmFiles[0]?.size || null, file_url: dmFiles[0]?.url || null };
    setDmInput(''); setDmFiles([]);
    if (dmTextRef.current) dmTextRef.current.style.height = 'auto';
    try {
      const res = await api.post('/chat/messages', payload);
      setDmMessages(prev => [...prev, res.data.message]);
      socketRef.current?.emit('send_message', res.data.message);
    } catch (e) { console.error('Send failed:', e); }
    socketRef.current?.emit('stop_typing', { channel: dmChannel });
  }, [dmInput, dmFiles, dmChannel, socketRef]);

  // ── Typing handlers ───────────────────────────────────────────────────────────
  const handleChTyping = useCallback((e) => {
    setChInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    socketRef.current?.emit('typing', { channel, name: user?.name || 'Someone' });
    clearTimeout(chTypingRef.current);
    chTypingRef.current = setTimeout(() => socketRef.current?.emit('stop_typing', { channel }), 2000);
  }, [channel, socketRef, user?.name]);

  const handleDmTyping = useCallback((e) => {
    if (!dmChannel) return;
    setDmInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    socketRef.current?.emit('typing', { channel: dmChannel, name: user?.name || 'Someone' });
    clearTimeout(dmTypingRef.current);
    dmTypingRef.current = setTimeout(() => socketRef.current?.emit('stop_typing', { channel: dmChannel }), 2000);
  }, [dmChannel, socketRef, user?.name]);

  // ── File upload (shared) ──────────────────────────────────────────────────────
  const makePickFiles = useCallback((setFiles) => (files) => {
    const placeholders = files.map(f => ({ name: f.name, size: fmtSize(f.size), url: null, uploading: true, progress: 0 }));
    setFiles(prev => {
      const startIdx = prev.length;
      files.forEach((file, idx) => {
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

  const pickChFiles = useMemo(() => makePickFiles(setChFiles), [makePickFiles]);
  const pickDmFiles = useMemo(() => makePickFiles(setDmFiles), [makePickFiles]);

  // ── Pin / react (channel only) ────────────────────────────────────────────────
  const togglePin = useCallback(async (id) => {
    const res = await api.patch(`/chat/messages/${id}/pin`);
    const updated = res.data.message;
    setChMessages(prev => prev.map(m => m.id === id ? { ...m, pinned: updated.pinned } : m));
    socketRef.current?.emit('pin_message', { id, channel, pinned: updated.pinned });
  }, [channel, socketRef]);

  const addChReaction = useCallback(async (id, emoji) => {
    const res = await api.patch(`/chat/messages/${id}/react`, { emoji });
    setChMessages(prev => prev.map(m => m.id === id ? { ...m, reactions: res.data.message.reactions } : m));
    socketRef.current?.emit('react_message', { id, channel, reactions: res.data.message.reactions });
  }, [channel, socketRef]);

  const addDmReaction = useCallback(async (id, emoji) => {
    if (!dmChannel) return;
    const res = await api.patch(`/chat/messages/${id}/react`, { emoji });
    setDmMessages(prev => prev.map(m => m.id === id ? { ...m, reactions: res.data.message.reactions } : m));
    socketRef.current?.emit('react_message', { id, channel: dmChannel, reactions: res.data.message.reactions });
  }, [dmChannel, socketRef]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const activeCh = CHANNELS.find(c => c.id === channel) || CHANNELS[0];
  const pinned   = chMessages.filter(m => m.pinned);

  const visibleCh = useMemo(() => {
    if (!chSearch.trim()) return chMessages;
    const q = chSearch.toLowerCase();
    return chMessages.filter(m => m.text?.toLowerCase().includes(q));
  }, [chMessages, chSearch]);

  const chItems = useMemo(() => withDateDividers(visibleCh), [visibleCh]);
  const dmItems = useMemo(() => withDateDividers(dmMessages), [dmMessages]);

  const otherEmployees = employees.filter(e => e.id !== user?.id);
  const q = sidebarQ.trim().toLowerCase();
  const filteredChannels  = q ? CHANNELS.filter(c => c.label.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)) : CHANNELS;
  const filteredEmployees = q ? otherEmployees.filter(e => (e.full_name || e.name || '').toLowerCase().includes(q) || (e.designation_name || e.designation || '').toLowerCase().includes(q)) : otherEmployees;

  // Unread totals per tab
  const channelUnread = CHANNELS.reduce((s, c) => s + (unread[c.id] || 0), 0);
  const dmUnread      = otherEmployees.reduce((s, e) => {
    const id = `dm-${[user?.id, e.id].sort().join('-')}`;
    return s + (unread[id] || 0);
  }, 0);

  const dmPeerName = dmPeer ? (dmPeer.full_name || dmPeer.name || 'Employee') : '';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>

      {/* Notification banners */}
      {notifPerm === 'default' && !notifDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px', background: WA.green, color: '#fff', fontSize: 12, flexShrink: 0 }}>
          <span style={{ flex: 1 }}>🔔 Enable desktop notifications to get alerts when this tab is in the background.</span>
          <button onClick={() => Notification.requestPermission().then(setNotifPerm)} style={{ padding: '3px 12px', background: '#fff', color: WA.green, borderRadius: 6, fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 12 }}>Enable</button>
          <button onClick={() => setNotifDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.75)', display: 'flex' }}><X size={14} /></button>
        </div>
      )}
      {notifPerm === 'denied' && !notifDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px', background: '#fff8e1', borderBottom: '1px solid #ffe082', fontSize: 12, flexShrink: 0 }}>
          <span style={{ flex: 1, color: '#6d4c00' }}>🔕 Notifications blocked — click the lock icon in your address bar → Notifications → Allow, then reload.</span>
          <button onClick={() => setNotifDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b8860b', display: 'flex' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
        <aside style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', background: WA.sidebar, borderRight: `1px solid ${WA.divider}`, overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
            <Av name={user?.name || 'Me'} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: WA.dark, fontSize: 15 }}>Construct ERP</p>
              <p style={{ fontSize: 11, color: WA.muted }}>Team Chat</p>
            </div>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? WA.greenBadge : '#ccc', flexShrink: 0 }} title={connected ? 'Connected' : 'Connecting…'} />
          </div>

          {/* Tab switcher */}
          <TabBar tab={tab} onTab={(t) => { setTab(t); setSidebarQ(''); }} channelUnread={channelUnread} dmUnread={dmUnread} />

          {/* Search */}
          <SidebarSearch
            value={sidebarQ} onChange={setSidebarQ}
            placeholder={tab === 'channels' ? 'Search channels…' : 'Search people…'}
          />

          {/* List */}
          <nav style={{ flex: 1, overflowY: 'auto' }}>
            {tab === 'channels' && (
              <>
                {filteredChannels.length === 0 && (
                  <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: WA.muted }}>No channels match "{sidebarQ}"</p>
                )}
                {filteredChannels.map(ch => (
                  <ChannelItem key={ch.id} ch={ch} isActive={channel === ch.id} badge={unread[ch.id] || 0}
                    onClick={() => setChannel(ch.id)} />
                ))}
              </>
            )}

            {tab === 'dms' && (
              <>
                {filteredEmployees.length === 0 && (
                  <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: WA.muted }}>No people match "{sidebarQ}"</p>
                )}
                {filteredEmployees.map(emp => {
                  const dmId = `dm-${[user?.id, emp.id].sort().join('-')}`;
                  return (
                    <DmItem key={emp.id} emp={emp} isActive={dmPeer?.id === emp.id} badge={unread[dmId] || 0}
                      onClick={() => { setDmPeer(emp); markRead(dmId); }} />
                  );
                })}
              </>
            )}
          </nav>
        </aside>

        {/* ── MAIN PANE ───────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* ── CHANNELS PANE ──────────────────────────────────────────────────── */}
          {tab === 'channels' && (
            <>
              {/* Channel header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: WA.sidebar, borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: WA.green, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Hash size={18} color="#fff" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: WA.dark, fontSize: 15 }}>#{activeCh.label}</p>
                  <p style={{ fontSize: 12, color: WA.muted }}>{activeCh.desc}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => { setChSearchOpen(v => !v); if (chPinsOpen) setChPinsOpen(false); }}
                    style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: chSearchOpen ? WA.divider : 'none' }}>
                    <Search size={18} color={chSearchOpen ? WA.green : WA.muted} />
                  </button>
                  <button onClick={() => { setChPinsOpen(v => !v); if (chSearchOpen) { setChSearchOpen(false); setChSearch(''); } }}
                    style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: chPinsOpen ? WA.divider : 'none' }}>
                    <Pin size={18} color={chPinsOpen ? '#b7860b' : WA.muted} />
                  </button>
                </div>
              </div>

              {/* Pinned messages */}
              {chPinsOpen && (
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

              {/* In-channel search */}
              {chSearchOpen && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#fff', borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
                  <Search size={14} color={WA.muted} />
                  <input ref={chSearchRef} value={chSearch} onChange={e => setChSearch(e.target.value)}
                    placeholder="Search messages…"
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: WA.dark, background: 'none' }} />
                  {chSearch && <span style={{ fontSize: 12, color: WA.muted }}>{visibleCh.length} result{visibleCh.length !== 1 ? 's' : ''}</span>}
                  <button onClick={() => { setChSearchOpen(false); setChSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, display: 'flex' }}><X size={16} /></button>
                </div>
              )}

              <MessageThread
                items={chItems} loading={chLoading}
                emptyText={chSearch ? 'No messages match your search' : 'No messages yet — say something!'}
                searchQuery={chSearch} userId={user?.id} isDm={false} compact={false}
                hoveredMsg={chHovered} onHover={setChHovered} onDownload={downloadAttachment}
                onTogglePin={togglePin} onReact={addChReaction}
                typingUser={typing[channel]} threadRef={chThreadRef}
              />
              <Composer
                inputVal={chInput} onInputChange={handleChTyping}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChannel(); } }}
                onSend={sendChannel} pendingFiles={chFiles}
                onRemoveFile={i => setChFiles(p => p.filter((_, j) => j !== i))}
                onPickFiles={pickChFiles}
                disabled={(!chInput.trim() && chFiles.length === 0) || chFiles.some(f => f.uploading)}
                textRef={chTextRef} compact={false}
              />
            </>
          )}

          {/* ── DMs PANE ───────────────────────────────────────────────────────── */}
          {tab === 'dms' && (
            <>
              {!dmPeer ? (
                <EmptyPane tab="dms" />
              ) : (
                <>
                  {/* DM header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: WA.sidebar, borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Av name={dmPeerName} size={40} photo={dmPeer.profile_photo_url} />
                      <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: WA.greenBadge, border: `2px solid ${WA.sidebar}` }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, color: WA.dark, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dmPeerName}</p>
                      <p style={{ fontSize: 12, color: WA.muted }}>{dmPeer.designation_name || dmPeer.designation || 'Direct message'}</p>
                    </div>
                  </div>

                  <MessageThread
                    items={dmItems} loading={dmLoading}
                    emptyText="No messages yet — say hello!"
                    searchQuery="" userId={user?.id} isDm={true} compact={false}
                    hoveredMsg={dmHovered} onHover={setDmHovered} onDownload={downloadAttachment}
                    onTogglePin={() => {}} onReact={addDmReaction}
                    typingUser={typing[dmChannel]} threadRef={dmThreadRef}
                  />
                  <Composer
                    inputVal={dmInput} onInputChange={handleDmTyping}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); } }}
                    onSend={sendDm} pendingFiles={dmFiles}
                    onRemoveFile={i => setDmFiles(p => p.filter((_, j) => j !== i))}
                    onPickFiles={pickDmFiles}
                    disabled={(!dmInput.trim() && dmFiles.length === 0) || dmFiles.some(f => f.uploading)}
                    textRef={dmTextRef} compact={false}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes waTyping { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }`}</style>
    </div>
  );
}
