// src/pages/ERPChat.jsx — Real-time ERP Team Chat (Socket.IO + REST)
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { io as socketIO } from 'socket.io-client';
import {
  Send, Paperclip, Search, Pin, Users, Hash, MessageSquare,
  X, Smile, Code2, Settings, ChevronDown, ChevronRight,
  FileText, FileSpreadsheet, Image, File, Download, AtSign,
  Building2, IndianRupee, Package, HardHat, ShieldCheck,
  ClipboardList, Gavel, BarChart3, Truck, Layers, Flag,
  Wifi, WifiOff, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import useAuthStore from '../store/authStore';
import api from '../api/client';

// In dev, proxy /socket.io → backend (vite.config proxy). In prod, use env var or same origin.
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || window.location.origin;

// ── ERP Channels ──────────────────────────────────────────────────────────────
const CHANNELS = [
  { id: 'general',        label: 'general',        icon: MessageSquare, desc: 'Company-wide announcements' },
  { id: 'finance',        label: 'finance',         icon: IndianRupee,  desc: 'Finance, TDS, payments, invoices' },
  { id: 'procurement',    label: 'procurement',     icon: Truck,        desc: 'Purchase orders, vendors, quotations' },
  { id: 'stores',         label: 'stores',          icon: Package,      desc: 'GRN, MRS, inventory, stock' },
  { id: 'qs-billing',     label: 'qs-billing',      icon: Layers,       desc: 'BOQ, RA bills, measurements' },
  { id: 'tqs',            label: 'dqs-tracker',     icon: ClipboardList,desc: 'Bill approvals, transmittals' },
  { id: 'hr',             label: 'hr-admin',        icon: Users,        desc: 'Payroll, attendance, leave' },
  { id: 'planning',       label: 'planning',        icon: Flag,         desc: 'DPR, schedules, S-curve' },
  { id: 'quality',        label: 'quality-hse',     icon: ShieldCheck,  desc: 'QA/QC, NCR, RFI, safety' },
  { id: 'subcontractors', label: 'subcontractors',  icon: HardHat,      desc: 'Work orders, RA bills' },
  { id: 'tender',         label: 'tender-mgmt',     icon: Gavel,        desc: 'Tender register, bids' },
  { id: 'it-support',     label: 'it-support',      icon: BarChart3,    desc: 'Help desk, licenses, IT assets' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700','bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700','bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700','bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',    'bg-red-100 text-red-700',
];
function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function Avatar({ name = '', size = 'md', photo }) {
  const cls = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
  if (photo) return <img src={photo} alt={name} className={clsx(cls, 'rounded-full object-cover flex-shrink-0')} />;
  return (
    <div className={clsx(cls, 'rounded-full flex items-center justify-center font-medium flex-shrink-0', avatarColor(name))}>
      {getInitials(name)}
    </div>
  );
}

function fileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (['xlsx','xls','csv'].includes(ext)) return FileSpreadsheet;
  if (['pdf'].includes(ext)) return FileText;
  if (['png','jpg','jpeg','gif','webp'].includes(ext)) return Image;
  return File;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

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
  const [collapsed, setCollapsed]         = useState({});
  const [unread, setUnread]               = useState({});

  const socketRef  = useRef(null);
  const msgsRef    = useRef(null);
  const fileRef    = useRef(null);
  const searchRef  = useRef(null);
  const textRef    = useRef(null);
  const typingTimer = useRef(null);
  // Mirrors activeChannel for use inside the socket handlers below, which are
  // registered once (empty dep array) so their closures would otherwise only
  // ever see the channel active at mount time.
  const activeChannelRef = useRef(activeChannel);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

  // ── Desktop notification permission ─────────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Connect Socket.IO ───────────────────────────────────────────────────────
  useEffect(() => {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return;

    const socket = socketIO(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('new_message', (msg) => {
      const isOtherChannel = msg.channel !== activeChannelRef.current;
      setMessages(prev => isOtherChannel ? prev : [...prev, msg]);
      // increment unread if not in this channel
      setUnread(prev => ({
        ...prev,
        [msg.channel]: isOtherChannel ? (prev[msg.channel] || 0) + 1 : 0,
      }));

      // Desktop notification — only for messages from someone else, and only
      // when you're not already looking at that channel in a focused tab.
      const fromSomeoneElse = msg.sender_id !== user?.id;
      if (fromSomeoneElse && 'Notification' in window && Notification.permission === 'granted'
          && (document.hidden || isOtherChannel)) {
        const chDef = CHANNELS.find(c => c.id === msg.channel);
        const notif = new Notification(`${msg.sender_name} · #${chDef?.label || msg.channel}`, {
          body: msg.text || (msg.file_name ? `📎 ${msg.file_name}` : 'New message'),
          tag: `erp-chat-${msg.channel}`,
          icon: '/logo192.png',
        });
        notif.onclick = () => {
          window.focus();
          setActiveChannel(msg.channel);
          notif.close();
        };
      }
    });

    socket.on('message_pinned', ({ id, pinned }) => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, pinned } : m));
    });

    socket.on('message_reacted', ({ id, reactions }) => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions } : m));
    });

    socket.on('user_typing', ({ name }) => {
      setTypingUser(name);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTypingUser(''), 3000);
    });

    socket.on('user_stop_typing', () => setTypingUser(''));

    socketRef.current = socket;
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load employees for DM list ──────────────────────────────────────────────
  useEffect(() => {
    api.get('/hr-admin/employees', { params: { employment_status: 'active' } })
      .then(r => setEmployees((Array.isArray(r.data) ? r.data : r.data?.data || []).slice(0, 10)))
      .catch(() => {});
  }, []);

  // ── Switch channel: join room + load history ────────────────────────────────
  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setSearchOpen(false);
    setSearchQuery('');
    setPinsOpen(false);

    if (socketRef.current?.connected) {
      socketRef.current.emit('join_channel', activeChannel);
    }

    api.get('/chat/messages', { params: { channel: activeChannel, limit: 100 } })
      .then(r => setMessages(r.data?.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));

    setUnread(prev => ({ ...prev, [activeChannel]: 0 }));
  }, [activeChannel]);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [messages, typingUser]);

  // ── Focus search ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMsg = useCallback(async () => {
    const text = inputVal.trim();
    if (!text && pendingFiles.length === 0) return;

    const payload = {
      channel: activeChannel,
      text: text || null,
      file_name: pendingFiles[0]?.name || null,
      file_size: pendingFiles[0]?.size || null,
    };

    setInputVal('');
    setPendingFiles([]);
    if (textRef.current) textRef.current.style.height = 'auto';

    try {
      const res = await api.post('/chat/messages', payload);
      const saved = res.data.message;
      // Add to own view immediately
      setMessages(prev => [...prev, saved]);
      // Broadcast to others via socket
      socketRef.current?.emit('send_message', saved);
    } catch (e) {
      console.error('Send failed:', e);
    }

    // Stop typing
    socketRef.current?.emit('stop_typing', { channel: activeChannel });
  }, [inputVal, pendingFiles, activeChannel]);

  // ── Typing indicator ────────────────────────────────────────────────────────
  const handleInput = (e) => {
    setInputVal(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    socketRef.current?.emit('typing', { channel: activeChannel, name: user?.name || 'Someone' });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing', { channel: activeChannel });
    }, 2000);
  };

  // ── Pin message ─────────────────────────────────────────────────────────────
  const togglePin = useCallback(async (id) => {
    const res = await api.patch(`/chat/messages/${id}/pin`);
    const updated = res.data.message;
    setMessages(prev => prev.map(m => m.id === id ? { ...m, pinned: updated.pinned } : m));
    socketRef.current?.emit('pin_message', { id, channel: activeChannel, pinned: updated.pinned });
  }, [activeChannel]);

  // ── React ───────────────────────────────────────────────────────────────────
  const addReaction = useCallback(async (msgId, emoji) => {
    const res = await api.patch(`/chat/messages/${msgId}/react`, { emoji });
    const updated = res.data.message;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: updated.reactions } : m));
    socketRef.current?.emit('react_message', { id: msgId, channel: activeChannel, reactions: updated.reactions });
  }, [activeChannel]);

  const activeCh   = CHANNELS.find(c => c.id === activeChannel) || CHANNELS[0];
  const ChIcon     = activeCh.icon;
  const pinned     = messages.filter(m => m.pinned);

  const visible = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-[#f4f6f9] overflow-hidden">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 font-medium truncate">Construct ERP</p>
            <p className="text-[10px] text-slate-400">Team Workspace</p>
          </div>
          <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', connected ? 'bg-emerald-400' : 'bg-slate-300')} title={connected ? 'Connected' : 'Connecting…'} />
        </div>

        <div className="px-3 py-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Search className="w-3 h-3 text-slate-900 font-medium flex-shrink-0" />
            <input placeholder="Jump to channel…" className="flex-1 bg-transparent text-xs text-slate-900 placeholder-slate-400 outline-none" />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {/* Channels */}
          <div className="px-3 mb-1">
            <button onClick={() => setCollapsed(p => ({ ...p, channels: !p.channels }))}
              className="flex items-center gap-1 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wider w-full hover:text-slate-600">
              {collapsed.channels ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Channels
            </button>
          </div>
          {!collapsed.channels && CHANNELS.map(ch => {
            const Icon = ch.icon;
            const isActive = activeChannel === ch.id;
            const badge = unread[ch.id] || 0;
            return (
              <button key={ch.id} onClick={() => setActiveChannel(ch.id)}
                className={clsx('w-full flex items-center gap-2 px-3 py-1.5 text-left transition-all',
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-900 hover:bg-slate-50')}>
                <Hash className={clsx('w-3 h-3 flex-shrink-0', isActive ? 'text-indigo-500' : 'text-slate-400')} />
                <span className={clsx('text-xs flex-1 truncate', isActive ? 'font-semibold' : 'font-medium')}>{ch.label}</span>
                {badge > 0 && <span className="text-[10px] font-medium bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">{badge}</span>}
              </button>
            );
          })}

          {/* Direct Messages */}
          <div className="px-3 mt-3 mb-1">
            <button onClick={() => setCollapsed(p => ({ ...p, dms: !p.dms }))}
              className="flex items-center gap-1 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wider w-full hover:text-slate-600">
              {collapsed.dms ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Direct Messages
            </button>
          </div>
          {!collapsed.dms && employees.map(emp => {
            const name  = emp.full_name || emp.name || 'Employee';
            const dmId  = `dm-${emp.id}`;
            const isActive = activeChannel === dmId;
            return (
              <button key={emp.id} onClick={() => setActiveChannel(dmId)}
                className={clsx('w-full flex items-center gap-2 px-3 py-1.5 text-left transition-all',
                  isActive ? 'bg-indigo-50' : 'hover:bg-slate-50')}>
                <Avatar name={name} size="sm" photo={emp.profile_photo_url} />
                <div className="min-w-0 flex-1">
                  <p className={clsx('text-xs truncate', isActive ? 'font-medium text-indigo-700' : 'font-medium text-slate-700')}>{name}</p>
                  <p className="text-[10px] text-slate-900 font-medium truncate">{emp.designation_name || emp.designation || ''}</p>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              </button>
            );
          })}
        </nav>

        {/* Current user footer */}
        <div className="px-3 py-3 border-t border-slate-100 flex items-center gap-2.5">
          <div className="relative flex-shrink-0">
            <Avatar name={user?.name || 'You'} size="sm" />
            <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full border border-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-900 truncate">{user?.name || user?.username || 'You'}</p>
            <p className="text-[10px] text-slate-900 font-medium capitalize">{(user?.role || '').replace(/_/g, ' ')}</p>
          </div>
          {connected
            ? <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            : <WifiOff className="w-3.5 h-3.5 text-slate-300" />}
        </div>
      </aside>

      {/* ── Chat area ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-5 py-3 flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-indigo-50">
            <ChIcon className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-sm font-medium text-slate-800">{activeCh.label}</span>
              {pinned.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">
                  <Pin className="w-2.5 h-2.5" /> {pinned.length}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-900 font-medium truncate">{activeCh.desc}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => { setSearchOpen(v => !v); if (pinsOpen) setPinsOpen(false); }}
              className={clsx('p-1.5 rounded-lg transition-all', searchOpen ? 'bg-indigo-50 text-indigo-600' : 'text-slate-900 font-medium hover:bg-slate-50')}>
              <Search className="w-4 h-4" />
            </button>
            <button onClick={() => { setPinsOpen(v => !v); if (searchOpen) { setSearchOpen(false); setSearchQuery(''); } }}
              className={clsx('p-1.5 rounded-lg transition-all', pinsOpen ? 'bg-amber-50 text-amber-600' : 'text-slate-900 font-medium hover:bg-slate-50')}>
              <Pin className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pinned panel */}
        {pinsOpen && (
          <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 max-h-44 overflow-y-auto flex-shrink-0">
            <p className="text-xs font-medium text-amber-700 mb-2 flex items-center gap-1.5">
              <Pin className="w-3 h-3" /> Pinned Messages
              {pinned.length === 0 && <span className="text-amber-500 font-normal">— hover a message and click the pin icon</span>}
            </p>
            <div className="space-y-2">
              {pinned.map(m => (
                <div key={m.id} className="flex items-start gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2">
                  <Avatar name={m.sender_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-slate-900 mr-1.5">{m.sender_name}</span>
                    <span className="text-xs text-slate-500">{m.text?.slice(0, 100)}{m.text?.length > 100 ? '…' : ''}</span>
                  </div>
                  <button onClick={() => togglePin(m.id)} className="text-slate-300 hover:text-slate-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search bar */}
        {searchOpen && (
          <div className="bg-white border-b border-slate-100 px-5 py-2.5 flex items-center gap-2.5 flex-shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-900 font-medium flex-shrink-0" />
            <input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="flex-1 text-sm text-slate-900 placeholder-slate-400 outline-none bg-transparent" />
            {searchQuery && <span className="text-xs text-slate-400">{visible.length} result{visible.length !== 1 ? 's' : ''}</span>}
            <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="text-slate-900 font-medium hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Messages */}
        <div ref={msgsRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {/* Date divider */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wider">
              {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span className="text-sm">Loading messages…</span>
            </div>
          )}

          {!loading && visible.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <MessageSquare className="w-10 h-10 opacity-20 mb-2" />
              <p className="text-sm">{searchQuery ? 'No messages match your search' : 'No messages yet — be the first to say something!'}</p>
            </div>
          )}

          {!loading && visible.map((m, idx) => {
            const prev = visible[idx - 1];
            const grouped = prev && prev.sender_id === m.sender_id &&
              (new Date(m.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000;
            const isMe = m.sender_id === user?.id;
            const FIcon = m.file_name ? fileIcon(m.file_name) : null;

            return (
              <div key={m.id}
                onMouseEnter={() => setHoveredMsg(m.id)}
                onMouseLeave={() => setHoveredMsg(null)}
                className={clsx(
                  'flex gap-3 px-2 py-1 rounded-xl transition-colors group relative',
                  hoveredMsg === m.id ? 'bg-slate-50' : '',
                  grouped ? 'mt-0.5' : 'mt-3'
                )}>
                <div className="w-8 flex-shrink-0 mt-0.5">
                  {!grouped && <Avatar name={m.sender_name} size="sm" />}
                </div>
                <div className="flex-1 min-w-0">
                  {!grouped && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className={clsx('text-sm font-semibold', isMe ? 'text-indigo-700' : 'text-slate-800')}>{m.sender_name}</span>
                      {m.sender_role && (
                        <span className="text-[10px] text-slate-900 font-medium bg-slate-100 px-1.5 py-0.5 rounded-full capitalize">
                          {m.sender_role.replace(/_/g, ' ')}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">{fmtTime(m.created_at)}</span>
                      {m.pinned && (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          <Pin className="w-2.5 h-2.5" /> pinned
                        </span>
                      )}
                    </div>
                  )}
                  {m.text && (
                    <p className="text-sm text-slate-900 leading-relaxed">
                      {searchQuery
                        ? m.text.split(new RegExp(`(${searchQuery})`, 'gi')).map((part, i) =>
                            part.toLowerCase() === searchQuery.toLowerCase()
                              ? <mark key={i} className="bg-amber-100 text-amber-800 rounded px-0.5">{part}</mark>
                              : part
                          )
                        : m.text}
                    </p>
                  )}
                  {m.file_name && FIcon && (
                    <div className="mt-2 inline-flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs cursor-pointer hover:border-indigo-300 transition-colors">
                      <FIcon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      <span className="font-medium text-slate-700">{m.file_name}</span>
                      {m.file_size && <span className="text-slate-400">{m.file_size}</span>}
                      <Download className="w-3.5 h-3.5 text-indigo-500 ml-1" />
                    </div>
                  )}
                  {(m.reactions || []).length > 0 && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {m.reactions.map((r, i) => (
                        <span key={i} onClick={() => addReaction(m.id, r.e)}
                          className="text-xs border border-slate-200 bg-white rounded-full px-2 py-0.5 cursor-pointer hover:border-indigo-300 transition-all">
                          {r.e} {r.c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hover actions */}
                {hoveredMsg === m.id && (
                  <div className="absolute top-1 right-2 flex items-center gap-1 bg-white border border-slate-200 rounded-xl shadow-sm px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {['👍','✓','🎉'].map(e => (
                      <button key={e} onClick={() => addReaction(m.id, e)}
                        className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-xs transition-colors">
                        {e}
                      </button>
                    ))}
                    <div className="w-px h-4 bg-slate-200 mx-0.5" />
                    <button onClick={() => togglePin(m.id)}
                      className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors" title={m.pinned ? 'Unpin' : 'Pin'}>
                      <Pin className={clsx('w-3 h-3', m.pinned ? 'text-amber-500' : 'text-slate-400')} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {typingUser && (
            <div className="flex gap-3 px-2 py-1 mt-2">
              <div className="w-8" />
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="flex gap-0.5">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                  ))}
                </span>
                <span>{typingUser} is typing…</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Composer ─────────────────────────────────────────────────────── */}
        <div className="px-5 pb-5 flex-shrink-0">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
            {pendingFiles.length > 0 && (
              <div className="px-3 pt-2.5 pb-1 flex flex-wrap gap-2 border-b border-slate-100">
                {pendingFiles.map((f, i) => {
                  const FI = fileIcon(f.name);
                  return (
                    <div key={i} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1 text-xs text-indigo-700">
                      <FI className="w-3 h-3" />
                      <span className="font-medium">{f.name}</span>
                      <span className="text-indigo-400">{f.size}</span>
                      <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))} className="text-indigo-400 hover:text-indigo-600 ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <textarea ref={textRef} value={inputVal} onChange={handleInput}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
              placeholder={`Message #${activeCh.label}…`}
              rows={1}
              className="w-full px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none resize-none bg-transparent leading-relaxed"
              style={{ minHeight: 44, maxHeight: 120 }}
            />
            <div className="flex items-center gap-1 px-3 pb-2.5">
              <button onClick={() => fileRef.current?.click()}
                className="p-1.5 rounded-lg text-slate-900 font-medium hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Attach file">
                <Paperclip className="w-4 h-4" />
              </button>
              <button className="p-1.5 rounded-lg text-slate-900 font-medium hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Emoji">
                <Smile className="w-4 h-4" />
              </button>
              <button className="p-1.5 rounded-lg text-slate-900 font-medium hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Mention">
                <AtSign className="w-4 h-4" />
              </button>
              <input ref={fileRef} type="file" multiple className="hidden"
                onChange={e => {
                  setPendingFiles(Array.from(e.target.files).map(f => ({ name: f.name, size: `${(f.size/1024).toFixed(0)} KB` })));
                  e.target.value = '';
                }} />
              <button onClick={sendMsg} disabled={!inputVal.trim() && pendingFiles.length === 0}
                className={clsx('ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium transition-all',
                  inputVal.trim() || pendingFiles.length > 0
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-900 font-medium cursor-not-allowed')}>
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-900 font-medium mt-1.5 px-1">
            <kbd className="border border-slate-200 rounded px-1 py-0.5 bg-white text-[9px]">Enter</kbd> to send &nbsp;·&nbsp;
            <kbd className="border border-slate-200 rounded px-1 py-0.5 bg-white text-[9px]">Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>
    </div>
  );
}
