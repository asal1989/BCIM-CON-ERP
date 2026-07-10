// src/pages/ERPChat.jsx — WhatsApp-styled ERP Team Chat main pane (Socket.IO + REST)
// The socket connection, employee directory, and DM floating popups all live in
// ChatContext (mounted once at the app root) so they survive navigating away
// from this page. This component renders only the inline channel pane + sidebar.
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Pin, X, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../api/client';
import { useChat, CHANNELS } from '../context/ChatContext';
import { Av, WA, MessageThread, Composer, fmtSize, withDateDividers, downloadAttachment } from '../components/chat/chatShared';

// ─────────────────────────────────────────────────────────────────────────────
export default function ERPChat() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const { socketRef, connected, employees, unread, typing, openPopup, markRead, registerActive } = useChat();

  const [mainChannel, setMainChannel]     = useState(() => searchParams.get('channel') || 'general');
  const [mainMessages, setMainMessages]   = useState([]);
  const [mainLoading, setMainLoading]     = useState(false);
  const [mainInput, setMainInput]         = useState('');
  const [mainFiles, setMainFiles]         = useState([]);
  const [mainHovered, setMainHovered]     = useState(null);
  const [searchOpen, setSearchOpen]       = useState(false);
  const [pinsOpen, setPinsOpen]           = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [sidebarQuery, setSidebarQuery]   = useState('');
  const [notifPerm, setNotifPerm]         = useState('Notification' in window ? Notification.permission : 'unsupported');
  const [notifDismissed, setNotifDismissed] = useState(false);

  const mainThreadRef = useRef(null);
  const searchRef     = useRef(null);
  const mainTextRef   = useRef(null);
  const typingTimerRef = useRef(null);

  // Jump to a specific channel if the bubble dropdown (Layout.jsx) navigated
  // here with ?channel=... while this page was already mounted.
  useEffect(() => {
    const ch = searchParams.get('channel');
    if (ch && ch !== mainChannel) setMainChannel(ch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const enableNotifications = () => {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(setNotifPerm);
  };

  // Tell the shared context this channel is actively being viewed, so it
  // doesn't count unread/fire a desktop notification for it, and re-join it
  // whenever the socket (re)connects.
  useEffect(() => {
    registerActive(mainChannel, true);
    if (socketRef.current?.connected) socketRef.current.emit('join_channel', mainChannel);
    return () => registerActive(mainChannel, false);
  }, [mainChannel, registerActive, socketRef]);

  useEffect(() => {
    if (!connected) return;
    socketRef.current?.emit('join_channel', mainChannel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Listen for this channel's live events
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onMsg = (msg) => { if (msg.channel === mainChannel) setMainMessages(prev => [...prev, msg]); };
    const onPinned = ({ id, channel, pinned }) => { if (channel === mainChannel) setMainMessages(prev => prev.map(m => m.id === id ? { ...m, pinned } : m)); };
    const onReacted = ({ id, channel, reactions }) => { if (channel === mainChannel) setMainMessages(prev => prev.map(m => m.id === id ? { ...m, reactions } : m)); };
    socket.on('new_message', onMsg);
    socket.on('message_pinned', onPinned);
    socket.on('message_reacted', onReacted);
    return () => { socket.off('new_message', onMsg); socket.off('message_pinned', onPinned); socket.off('message_reacted', onReacted); };
  }, [socketRef, mainChannel]);

  // Main channel switch
  useEffect(() => {
    setMainMessages([]); setMainLoading(true); setSearchOpen(false); setSearchQuery(''); setPinsOpen(false);
    api.get('/chat/messages', { params: { channel: mainChannel, limit: 100 } })
      .then(r => setMainMessages(r.data?.messages || []))
      .catch(() => setMainMessages([]))
      .finally(() => setMainLoading(false));
    markRead(mainChannel);
  }, [mainChannel, markRead]);

  useEffect(() => { if (mainThreadRef.current) mainThreadRef.current.scrollTop = mainThreadRef.current.scrollHeight; }, [mainMessages, typing[mainChannel]]);
  useEffect(() => { if (searchOpen && searchRef.current) searchRef.current.focus(); }, [searchOpen]);

  const sendMain = useCallback(async () => {
    const text = mainInput.trim();
    if (!text && mainFiles.length === 0) return;
    if (mainFiles.some(f => f.uploading)) return;
    const payload = { channel: mainChannel, text: text || null, file_name: mainFiles[0]?.name || null, file_size: mainFiles[0]?.size || null, file_url: mainFiles[0]?.url || null };
    setMainInput(''); setMainFiles([]);
    if (mainTextRef.current) mainTextRef.current.style.height = 'auto';
    try {
      const res = await api.post('/chat/messages', payload);
      const saved = res.data.message;
      setMainMessages(prev => [...prev, saved]);
      socketRef.current?.emit('send_message', saved);
    } catch (e) { console.error('Send failed:', e); }
    socketRef.current?.emit('stop_typing', { channel: mainChannel });
  }, [mainInput, mainFiles, mainChannel, socketRef]);

  const handleTyping = useCallback((e) => {
    setMainInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    socketRef.current?.emit('typing', { channel: mainChannel, name: user?.name || 'Someone' });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => socketRef.current?.emit('stop_typing', { channel: mainChannel }), 2000);
  }, [mainChannel, socketRef, user?.name]);

  const pickFiles = useCallback((files) => {
    const placeholders = files.map(f => ({ name: f.name, size: fmtSize(f.size), url: null, uploading: true, progress: 0 }));
    setMainFiles(prev => {
      const startIdx = prev.length;
      files.forEach((file, idx) => {
        const targetIdx = startIdx + idx;
        const fd = new FormData(); fd.append('file', file);
        api.post('/upload/single', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: pe => {
            const pct = pe.total ? Math.round((pe.loaded * 100) / pe.total) : 0;
            setMainFiles(p => p.map((f, i) => i === targetIdx ? { ...f, progress: pct } : f));
          },
        })
          .then(r => setMainFiles(p => p.map((f, i) => i === targetIdx ? { ...f, url: r.data.url, uploading: false } : f)))
          .catch(err => {
            toast.error(err?.response?.data?.error || `Failed to upload ${file.name}`);
            setMainFiles(p => p.filter((_, i) => i !== targetIdx));
          });
      });
      return [...prev, ...placeholders];
    });
  }, []);

  const togglePin = useCallback(async (id) => {
    const res = await api.patch(`/chat/messages/${id}/pin`);
    const updated = res.data.message;
    setMainMessages(prev => prev.map(m => m.id === id ? { ...m, pinned: updated.pinned } : m));
    socketRef.current?.emit('pin_message', { id, channel: mainChannel, pinned: updated.pinned });
  }, [mainChannel, socketRef]);

  const addReaction = useCallback(async (id, emoji) => {
    const res = await api.patch(`/chat/messages/${id}/react`, { emoji });
    const updated = res.data.message;
    setMainMessages(prev => prev.map(m => m.id === id ? { ...m, reactions: updated.reactions } : m));
    socketRef.current?.emit('react_message', { id, channel: mainChannel, reactions: updated.reactions });
  }, [mainChannel, socketRef]);

  // ── Derived state ────────────────────────────────────────────────────────────
  const activeCh = CHANNELS.find(c => c.id === mainChannel) || CHANNELS[0];
  const pinned = mainMessages.filter(m => m.pinned);

  const visibleMain = useMemo(() => {
    if (!searchQuery.trim()) return mainMessages;
    const q = searchQuery.toLowerCase();
    return mainMessages.filter(m => m.text?.toLowerCase().includes(q));
  }, [mainMessages, searchQuery]);

  const mainItems = useMemo(() => withDateDividers(visibleMain), [visibleMain]);

  const otherEmployees = employees.filter(e => e.id !== user?.id);

  const q = sidebarQuery.trim().toLowerCase();
  const filteredChannels  = q ? CHANNELS.filter(ch => ch.label.toLowerCase().includes(q) || ch.desc.toLowerCase().includes(q)) : CHANNELS;
  const filteredEmployees = q ? otherEmployees.filter(emp => (emp.full_name || emp.name || '').toLowerCase().includes(q) || (emp.designation_name || emp.designation || '').toLowerCase().includes(q)) : otherEmployees;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
            <Av name={user?.name || 'Me'} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: WA.dark, fontSize: 16 }}>Construct ERP</p>
              <p style={{ fontSize: 11, color: WA.muted }}>Team Chat</p>
            </div>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? WA.greenBadge : '#ccc', flexShrink: 0 }} title={connected ? 'Connected' : 'Connecting…'} />
          </div>

          <div style={{ padding: '8px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '7px 12px', border: `1px solid ${WA.divider}` }}>
              <Search size={14} color={WA.muted} />
              <input value={sidebarQuery} onChange={e => setSidebarQuery(e.target.value)}
                placeholder="Search channels or staff…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: WA.dark }} />
              {sidebarQuery && (
                <button onClick={() => setSidebarQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, display: 'flex', padding: 0 }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <nav style={{ flex: 1, overflowY: 'auto' }}>
            {filteredChannels.length > 0 && (
            <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: WA.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Channels</div>
            )}
            {filteredChannels.map(ch => {
              const isActive = mainChannel === ch.id;
              const badge = unread[ch.id] || 0;
              return (
                <button key={ch.id} onClick={() => setMainChannel(ch.id)}
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

            {filteredChannels.length === 0 && filteredEmployees.length === 0 && (
              <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: WA.muted }}>No channels or staff match "{sidebarQuery}"</p>
            )}

            {filteredEmployees.length > 0 && (
              <>
                <div style={{ padding: '12px 16px 4px', fontSize: 11, fontWeight: 700, color: WA.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Direct Messages</div>
                {filteredEmployees.map(emp => {
                  const name = emp.full_name || emp.name || 'Employee';
                  const dmId = `dm-${[user?.id, emp.id].sort().join('-')}`;
                  const badge = unread[dmId] || 0;
                  return (
                    <button key={emp.id} onClick={() => openPopup(emp)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${WA.divider}`, textAlign: 'left', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = WA.hover}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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

        {/* ── MAIN CHANNEL PANE ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: WA.sidebar, borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: WA.green, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Hash size={18} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: WA.dark, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{activeCh.label}</p>
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

          {searchOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#fff', borderBottom: `1px solid ${WA.divider}`, flexShrink: 0 }}>
              <Search size={14} color={WA.muted} />
              <input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: WA.dark, background: 'none' }} />
              {searchQuery && <span style={{ fontSize: 12, color: WA.muted }}>{visibleMain.length} result{visibleMain.length !== 1 ? 's' : ''}</span>}
              <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, display: 'flex' }}><X size={16} /></button>
            </div>
          )}

          <MessageThread
            items={mainItems} loading={mainLoading} emptyText={searchQuery ? 'No messages match your search' : 'No messages yet — say something!'}
            searchQuery={searchQuery} userId={user?.id} isDm={false} compact={false}
            hoveredMsg={mainHovered} onHover={setMainHovered} onDownload={downloadAttachment}
            onTogglePin={togglePin} onReact={addReaction}
            typingUser={typing[mainChannel]} threadRef={mainThreadRef}
          />

          <Composer
            inputVal={mainInput} onInputChange={handleTyping}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMain(); } }}
            onSend={sendMain} pendingFiles={mainFiles}
            onRemoveFile={i => setMainFiles(p => p.filter((_, j) => j !== i))}
            onPickFiles={pickFiles}
            disabled={(!mainInput.trim() && mainFiles.length === 0) || mainFiles.some(f => f.uploading)}
            textRef={mainTextRef} compact={false}
          />
        </div>
      </div>

      <style>{`
        @keyframes waTyping { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }
      `}</style>
    </div>
  );
}
