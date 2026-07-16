// src/pages/ERPChat.jsx — Premium Team Chat UI
// Microsoft Teams + Slack + Discord inspired enterprise design
// Built with Framer Motion + Tailwind CSS + Lucide icons
//
// This file used to be a single ~2,373-line component. It's now split into
// per-component modules under src/components/chat/ (ConversationList,
// MessageThread, PremiumComposer, ChatHeader, PinnedBanner, DetailsPanel,
// NotifBanner, CallsPane, TeamsMeeting) with shared design tokens in
// chatTheme.js — this file keeps only the top-level orchestrator: state,
// socket wiring, and the render tree that composes those pieces.
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Pin, X, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../api/client';
import { useChat, CHANNELS } from '../context/ChatContext';
import { Av, fmtSize, withDateDividers } from '../components/chat/chatShared';
import { chColor } from '../components/chat/chatTheme';
import { ConvListPanel } from '../components/chat/ConversationList';
import { PremiumMessageList } from '../components/chat/MessageThread';
import { PremiumComposer } from '../components/chat/PremiumComposer';
import { ChatHeader } from '../components/chat/ChatHeader';
import { PinnedBanner } from '../components/chat/PinnedBanner';
import { DetailsPanel } from '../components/chat/DetailsPanel';
import { NotifBanner } from '../components/chat/NotifBanner';
import { TeamsMeetingModal } from '../components/chat/TeamsMeeting';

// Design tokens used directly in this file (most components import their own
// copy from chatTheme.js — this one is only needed for the top-level bg).
import { C } from '../components/chat/chatTheme';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ERPChat() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const { socketRef, connected, employees, unread, typing, markRead, registerActive, startCall, callState, startShare, shareState, SHARE_STATE, previews } = useChat();
  const [mainView, setMainView] = useState('chat'); // 'chat' | 'calls' | 'meetings'
  const [showMeetingModal, setShowMeetingModal] = useState(false);

  const [tab, setTab] = useState('channels');
  const [channel, setChannel]             = useState(() => searchParams.get('channel') || 'general');
  const [chMessages, setChMessages]       = useState([]);
  const [chLoading, setChLoading]         = useState(false);
  const [chInput, setChInput]             = useState('');
  const [chFiles, setChFiles]             = useState([]);
  const [chSearch, setChSearch]           = useState('');
  const [chSearchOpen, setChSearchOpen]   = useState(false);
  const [chPinsOpen, setChPinsOpen]       = useState(false);
  const chThreadRef  = useRef(null);
  const chTextRef    = useRef(null);
  const chSearchRef  = useRef(null);
  const chTypingRef  = useRef(null);

  const [dmPeer, setDmPeer]               = useState(null);
  const [dmMessages, setDmMessages]       = useState([]);
  const [dmLoading, setDmLoading]         = useState(false);
  const [dmInput, setDmInput]             = useState('');
  const [dmFiles, setDmFiles]             = useState([]);
  const dmThreadRef  = useRef(null);
  const dmTextRef    = useRef(null);
  const dmTypingRef  = useRef(null);

  const [sidebarQ, setSidebarQ]           = useState('');
  const [detailsOpen, setDetailsOpen]     = useState(false);
  const [notifPerm, setNotifPerm]         = useState('Notification' in window ? Notification.permission : 'unsupported');
  const [notifDismissed, setNotifDismissed] = useState(false);

  const [isMobile, setIsMobile]           = useState(() => window.innerWidth < 768);
  const [mobilePaneOpen, setMobilePaneOpen] = useState(false);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const openMainPane  = () => { if (isMobile) setMobilePaneOpen(true); };
  const backToSidebar = () => setMobilePaneOpen(false);

  const dmChannel = useMemo(() => {
    if (!dmPeer || !user?.id) return null;
    return `dm-${[user.id, dmPeer.id].sort().join('-')}`;
  }, [dmPeer, user?.id]);

  // ── URL param sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = searchParams.get('channel');
    if (ch && ch !== channel) { setChannel(ch); setTab('channels'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Register active + socket join ─────────────────────────────────────────────
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

  // ── Socket message listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onMsg     = (msg) => {
      if (msg.channel === channel)   setChMessages(p => [...p, msg]);
      if (msg.channel === dmChannel) setDmMessages(p => [...p, msg]);
    };
    const onPinned  = ({ id, channel: ch, pinned }) => {
      if (ch === channel) setChMessages(p => p.map(m => m.id === id ? { ...m, pinned } : m));
    };
    const onReacted = ({ id, channel: ch, reactions }) => {
      if (ch === channel)   setChMessages(p => p.map(m => m.id === id ? { ...m, reactions } : m));
      if (ch === dmChannel) setDmMessages(p => p.map(m => m.id === id ? { ...m, reactions } : m));
    };
    socket.on('new_message',     onMsg);
    socket.on('message_pinned',  onPinned);
    socket.on('message_reacted', onReacted);
    return () => {
      socket.off('new_message',     onMsg);
      socket.off('message_pinned',  onPinned);
      socket.off('message_reacted', onReacted);
    };
  }, [socketRef, channel, dmChannel]);

  // ── Load messages ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setChMessages([]); setChLoading(true); setChSearchOpen(false); setChSearch(''); setChPinsOpen(false);
    api.get('/chat/messages', { params: { channel, limit: 100 } })
      .then(r => setChMessages(r.data?.messages || []))
      .catch(() => setChMessages([]))
      .finally(() => setChLoading(false));
    markRead(channel);
    api.post('/chat/messages/mark-read', { channel }).catch(() => {});
  }, [channel, markRead]);

  useEffect(() => {
    if (!dmChannel) return;
    setDmMessages([]); setDmLoading(true);
    api.get('/chat/messages', { params: { channel: dmChannel, limit: 100 } })
      .then(r => setDmMessages(r.data?.messages || []))
      .catch(() => setDmMessages([]))
      .finally(() => setDmLoading(false));
    markRead(dmChannel);
    api.post('/chat/messages/mark-read', { channel: dmChannel }).catch(() => {});
  }, [dmChannel, markRead]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  useEffect(() => { if (chThreadRef.current) chThreadRef.current.scrollTop = chThreadRef.current.scrollHeight; }, [chMessages, typing[channel]]);
  useEffect(() => { if (dmThreadRef.current) dmThreadRef.current.scrollTop = dmThreadRef.current.scrollHeight; }, [dmMessages, typing[dmChannel]]);
  useEffect(() => { if (chSearchOpen && chSearchRef.current) chSearchRef.current.focus(); }, [chSearchOpen]);

  // ── Send messages ─────────────────────────────────────────────────────────────
  const sendChannel = useCallback(async () => {
    const text = chInput.trim();
    if (!text && chFiles.length === 0) return;
    if (chFiles.some(f => f.uploading)) return;
    const payload = { channel, text: text || null, file_name: chFiles[0]?.name || null, file_size: chFiles[0]?.size || null, file_url: chFiles[0]?.url || null };
    setChInput(''); setChFiles([]);
    if (chTextRef.current) chTextRef.current.style.height = 'auto';
    try {
      const res = await api.post('/chat/messages', payload);
      setChMessages(p => [...p, res.data.message]);
      socketRef.current?.emit('send_message', res.data.message);
    } catch { /* handled by toast */ }
    socketRef.current?.emit('stop_typing', { channel });
  }, [chInput, chFiles, channel, socketRef]);

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
      setDmMessages(p => [...p, res.data.message]);
      socketRef.current?.emit('send_message', res.data.message);
    } catch { /* handled by toast */ }
    socketRef.current?.emit('stop_typing', { channel: dmChannel });
  }, [dmInput, dmFiles, dmChannel, socketRef]);

  // ── Typing ────────────────────────────────────────────────────────────────────
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

  // ── Files ──────────────────────────────────────────────────────────────────────
  const makePickFiles = useCallback((setFiles) => (files) => {
    setFiles(prev => {
      const startIdx = prev.length;
      const placeholders = files.map(f => ({ name: f.name, size: fmtSize(f.size), url: null, uploading: true, progress: 0 }));
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

  // ── Pin / react ───────────────────────────────────────────────────────────────
  const togglePin = useCallback(async (id) => {
    const res = await api.patch(`/chat/messages/${id}/pin`);
    const u = res.data.message;
    setChMessages(p => p.map(m => m.id === id ? { ...m, pinned: u.pinned } : m));
    socketRef.current?.emit('pin_message', { id, channel, pinned: u.pinned });
  }, [channel, socketRef]);

  const addChReaction = useCallback(async (id, emoji) => {
    const res = await api.patch(`/chat/messages/${id}/react`, { emoji });
    setChMessages(p => p.map(m => m.id === id ? { ...m, reactions: res.data.message.reactions } : m));
    socketRef.current?.emit('react_message', { id, channel, reactions: res.data.message.reactions });
  }, [channel, socketRef]);

  const addDmReaction = useCallback(async (id, emoji) => {
    if (!dmChannel) return;
    const res = await api.patch(`/chat/messages/${id}/react`, { emoji });
    setDmMessages(p => p.map(m => m.id === id ? { ...m, reactions: res.data.message.reactions } : m));
    socketRef.current?.emit('react_message', { id, channel: dmChannel, reactions: res.data.message.reactions });
  }, [dmChannel, socketRef]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const activeCh  = CHANNELS.find(c => c.id === channel) || CHANNELS[0];
  const pinned    = chMessages.filter(m => m.pinned);
  const [chSearchResults, setChSearchResults] = useState(null); // null = no search active
  useEffect(() => {
    if (!chSearch.trim()) { setChSearchResults(null); return; }
    const t = setTimeout(() => {
      api.get('/chat/search', { params: { q: chSearch, channel, limit: 100 } })
        .then(r => setChSearchResults(r.data?.messages || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [chSearch, channel]);

  const visibleCh = chSearchResults ?? chMessages;
  const chItems = useMemo(() => withDateDividers(visibleCh), [visibleCh]);
  const dmItems = useMemo(() => withDateDividers(dmMessages), [dmMessages]);

  const otherEmployees     = employees.filter(e => e.id !== user?.id);
  const q                  = sidebarQ.trim().toLowerCase();
  const filteredChannels   = q ? CHANNELS.filter(c => c.label.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)) : CHANNELS;
  const filteredEmployees  = q ? otherEmployees.filter(e => (e.full_name || e.name || '').toLowerCase().includes(q) || (e.designation_name || e.designation || '').toLowerCase().includes(q)) : otherEmployees;
  const channelUnread      = CHANNELS.reduce((s, c) => s + (unread[c.id] || 0), 0);
  const dmUnread           = otherEmployees.reduce((s, e) => {
    const id = `dm-${[user?.id, e.id].sort().join('-')}`;
    return s + (unread[id] || 0);
  }, 0);
  const dmPeerName = dmPeer ? (dmPeer.full_name || dmPeer.name || 'Employee') : '';

  // Active conversation for details panel
  const isChannelView = tab === 'channels';
  const showDetails   = detailsOpen && !isMobile;

  // ── Share meeting link to current active channel ──────────────────────────────
  const shareMeetingToChat = useCallback((text) => {
    if (tab === 'dms' && dmChannel) {
      setDmInput(text);
      setMainView('chat');
      if (dmTextRef.current) { dmTextRef.current.focus(); }
    } else {
      setChInput(text);
      setMainView('chat');
      if (chTextRef.current) { chTextRef.current.focus(); }
    }
  }, [tab, dmChannel]);

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', background: C.bg }}>

      {/* Teams Meeting Modal */}
      {showMeetingModal && (
        <TeamsMeetingModal
          onClose={() => setShowMeetingModal(false)}
          onMeetingCreated={shareMeetingToChat}
          employees={employees}
        />
      )}

      {/* Notification banner */}
      {!notifDismissed && (
        <NotifBanner perm={notifPerm}
          onEnable={() => Notification.requestPermission().then(setNotifPerm)}
          onDismiss={() => setNotifDismissed(true)} />
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── CONVERSATION LIST ──────────────────────────────────────────────── */}
        <ConvListPanel
          tab={tab} setTab={setTab}
          sidebarQ={sidebarQ} setSidebarQ={setSidebarQ}
          filteredChannels={filteredChannels} filteredEmployees={filteredEmployees}
          channel={channel} setChannel={setChannel}
          dmPeer={dmPeer} setDmPeer={setDmPeer}
          unread={unread} typing={typing} user={user} previews={previews}
          connected={connected} openMainPane={openMainPane} markRead={markRead}
          channelUnread={channelUnread} dmUnread={dmUnread}
          isMobile={isMobile} mobilePaneOpen={mobilePaneOpen}
          mainView={mainView} setMainView={setMainView}
          onNewMeeting={() => setShowMeetingModal(true)}
          callsCurrentUserId={user?.id} callsEmployees={employees} callsStartCall={startCall}
        />

        {/* ── MAIN CHAT AREA — always visible ───────────────────────────────── */}
        <div style={{
          flex: 1,
          display: isMobile && !mobilePaneOpen ? 'none' : 'flex',
          flexDirection: 'column', minWidth: 0, overflow: 'hidden', background: C.bg,
        }}>

          {/* ── CHANNELS ──────────────────────────────────────────────────────── */}
          {tab === 'channels' && (
            <>
              <ChatHeader
                title={activeCh.label} subtitle={`${activeCh.desc}`}
                isGroup color={chColor(activeCh.id)}
                onToggleSearch={() => { setChSearchOpen(v => !v); if (chPinsOpen) setChPinsOpen(false); }}
                onTogglePin={() => { setChPinsOpen(v => !v); if (chSearchOpen) { setChSearchOpen(false); setChSearch(''); } }}
                searchOpen={chSearchOpen} pinsOpen={chPinsOpen}
                onToggleDetails={() => setDetailsOpen(v => !v)} detailsOpen={detailsOpen}
                onBack={backToSidebar} isMobile={isMobile}
                callState="idle" shareState="idle"
              />

              {pinned.length > 0 && chPinsOpen === false && (
                <PinnedBanner messages={pinned} onUnpin={togglePin} />
              )}

              {chPinsOpen && pinned.length > 0 && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A', padding: '10px 16px', maxHeight: 180, overflowY: 'auto', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Pin size={12} /> Pinned Messages
                  </p>
                  {pinned.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 10, padding: '7px 10px', marginBottom: 6, border: '1px solid #FDE68A' }}>
                      <Av name={m.sender_name} size={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text, marginRight: 6 }}>{m.sender_name}</span>
                        <span style={{ fontSize: 12, color: C.muted }}>{m.text?.slice(0, 80)}{m.text?.length > 80 ? '…' : ''}</span>
                      </div>
                      <button onClick={() => togglePin(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={13} color={C.muted} /></button>
                    </div>
                  ))}
                </motion.div>
              )}

              {chSearchOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                  <Search size={14} color={C.subtle} />
                  <input ref={chSearchRef} value={chSearch} onChange={e => setChSearch(e.target.value)}
                    placeholder="Search messages…"
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: C.text, background: 'none' }} />
                  {chSearch && <span style={{ fontSize: 12, color: C.subtle }}>{visibleCh.length} result{visibleCh.length !== 1 ? 's' : ''}</span>}
                  <button onClick={() => { setChSearchOpen(false); setChSearch(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={15} color={C.muted} /></button>
                </motion.div>
              )}

              <PremiumMessageList items={chItems} loading={chLoading}
                emptyText={chSearch ? 'No messages match your search' : 'No messages yet — start the conversation!'}
                userId={user?.id} onReact={addChReaction} onPin={togglePin}
                threadRef={chThreadRef} typingUser={typing[channel]} />

              <PremiumComposer value={chInput} onChange={handleChTyping}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChannel(); } }}
                onSend={sendChannel} files={chFiles}
                onRemoveFile={i => setChFiles(p => p.filter((_, j) => j !== i))}
                onPickFiles={pickChFiles}
                disabled={(!chInput.trim() && chFiles.length === 0) || chFiles.some(f => f.uploading)}
                textRef={chTextRef} placeholder={`Message #${activeCh.label}`}
                employees={employees} />
            </>
          )}

          {/* ── DMS ───────────────────────────────────────────────────────────── */}
          {tab === 'dms' && (
            <>
              {!dmPeer ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: C.bg }}>
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
                    <MessageSquare size={52} color={C.border} />
                  </motion.div>
                  <p style={{ fontSize: 15, color: C.subtle, fontWeight: 500 }}>Select someone to start a conversation</p>
                </div>
              ) : (
                <>
                  <ChatHeader
                    title={dmPeerName} subtitle={dmPeer.designation_name || dmPeer.designation || 'Direct message'}
                    isGroup={false} photo={dmPeer.profile_photo_url}
                    onVoiceCall={() => startCall(dmPeer, 'audio').catch(e => toast.error(e.message || 'Could not start call'))}
                    onVideoCall={() => startCall(dmPeer, 'video').catch(e => toast.error(e.message || 'Could not start call'))}
                    onScreenShare={() => startShare(dmPeer).catch(e => toast.error(e.message || 'Could not start screen share'))}
                    callState={callState}
                    shareState={callState !== 'idle' ? 'active' : shareState}
                    onToggleSearch={() => {}} onTogglePin={() => {}}
                    searchOpen={false} pinsOpen={false}
                    onToggleDetails={() => setDetailsOpen(v => !v)} detailsOpen={detailsOpen}
                    onBack={() => { backToSidebar(); setDmPeer(null); }} isMobile={isMobile}
                  />

                  <PremiumMessageList items={dmItems} loading={dmLoading}
                    emptyText="No messages yet — say hello!"
                    userId={user?.id} onReact={addDmReaction} onPin={null}
                    threadRef={dmThreadRef} typingUser={typing[dmChannel]}
                    isDm={true} />

                  <PremiumComposer value={dmInput} onChange={handleDmTyping}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); } }}
                    onSend={sendDm} files={dmFiles}
                    onRemoveFile={i => setDmFiles(p => p.filter((_, j) => j !== i))}
                    onPickFiles={pickDmFiles}
                    disabled={(!dmInput.trim() && dmFiles.length === 0) || dmFiles.some(f => f.uploading)}
                    textRef={dmTextRef} placeholder={`Message ${dmPeerName}`}
                    employees={employees} />
                </>
              )}
            </>
          )}
        </div>

        {/* ── DETAILS PANEL ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showDetails && (
            <DetailsPanel
              isChannel={isChannelView}
              channelInfo={isChannelView ? activeCh : null}
              dmPeer={isChannelView ? null : dmPeer}
              employees={otherEmployees}
              pinnedMessages={isChannelView ? pinned : []}
              onTogglePin={isChannelView ? togglePin : null}
              onClose={() => setDetailsOpen(false)}
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
