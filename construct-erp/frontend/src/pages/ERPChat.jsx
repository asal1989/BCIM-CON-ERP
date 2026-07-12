// src/pages/ERPChat.jsx — Premium Team Chat UI
// Microsoft Teams + Slack + Discord inspired enterprise design
// Built with Framer Motion + Tailwind CSS + Lucide icons
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Pin, X, Hash, MessageSquare, Users, Phone, Video, ArrowLeft,
  Monitor, Send, Paperclip, Smile, Bell, BellOff, Info, MoreVertical,
  Plus, ChevronDown, Mic, Image, FileText, Check, CheckCheck,
  ThumbsUp, Heart, Zap, Star, Flame, PartyPopper, Filter,
  UserPlus, Settings, ChevronRight, File, Download, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../api/client';
import { useChat, CHANNELS } from '../context/ChatContext';
import { Av, fmtSize, withDateDividers, downloadAttachment } from '../components/chat/chatShared';

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  primary:      '#2563EB',
  primaryHover: '#1D4ED8',
  primaryLight: '#EFF6FF',
  primaryBorder:'#BFDBFE',
  bg:           '#F8FAFC',
  card:         '#FFFFFF',
  border:       '#E2E8F0',
  borderLight:  '#F1F5F9',
  text:         '#0F172A',
  muted:        '#64748B',
  subtle:       '#94A3B8',
  green:        '#22C55E',
  greenBg:      '#F0FDF4',
  amber:        '#F59E0B',
  red:          '#EF4444',
  shadow:       '0 1px 3px rgba(0,0,0,0.08)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.08)',
  shadowLg:     '0 12px 24px rgba(0,0,0,0.1)',
};

// Channel theme colors for avatars
const CH_COLORS = {
  general:     '#2563EB', site:       '#059669', finance:    '#7C3AED',
  procurement: '#DC2626', hr:         '#0891B2', safety:     '#D97706',
  qa:          '#16A34A', management: '#4F46E5', engineering:'#0284C7',
  client:      '#BE185D',
};

function chColor(id) { return CH_COLORS[id] || C.primary; }

function fmtTime(ts) {
  if (!ts) return '';
  const d   = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function fmtFull(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── CONVERSATION LIST ─────────────────────────────────────────────────────────

const CONV_TABS = [
  { id: 'all',      label: 'All' },
  { id: 'channels', label: 'Channels' },
  { id: 'direct',   label: 'Direct' },
  { id: 'unread',   label: 'Unread' },
];

function ConvCard({ name, sub, avatar, photo, isActive, badge, isOnline, isGroup, color, timestamp, isTyping, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ backgroundColor: isActive ? '#EFF6FF' : '#F8FAFC' }}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
        background: isActive ? C.primaryLight : 'transparent',
        borderLeft: isActive ? `3px solid ${C.primary}` : '3px solid transparent',
        transition: 'background 0.15s',
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {isGroup ? (
          <div style={{
            width: 46, height: 46, borderRadius: 14,
            background: color || C.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
            boxShadow: `0 4px 12px ${(color || C.primary)}40`,
          }}>
            {name.charAt(0).toUpperCase()}
          </div>
        ) : (
          <Av name={name} size={46} photo={photo} />
        )}
        {isOnline && (
          <span style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 11, height: 11, borderRadius: '50%',
            background: C.green, border: '2px solid #fff',
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{
            fontWeight: badge > 0 ? 700 : 600, fontSize: 14,
            color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>{name}</span>
          <span style={{ fontSize: 11, color: C.subtle, flexShrink: 0, marginLeft: 6 }}>{timestamp}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 12.5, color: isTyping ? C.primary : C.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            fontStyle: isTyping ? 'italic' : 'normal',
          }}>
            {isTyping ? `${isTyping} is typing…` : sub}
          </span>
          {badge > 0 && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              style={{
                background: C.primary, color: '#fff', borderRadius: 999,
                fontSize: 10.5, fontWeight: 700, minWidth: 20, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 5px', flexShrink: 0,
              }}
            >{badge > 99 ? '99+' : badge}</motion.span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

function ConvListPanel({
  tab, setTab, sidebarQ, setSidebarQ,
  filteredChannels, filteredEmployees,
  channel, setChannel, dmPeer, setDmPeer,
  unread, typing, user, connected, openMainPane, markRead,
  channelUnread, dmUnread, isMobile, mobilePaneOpen,
}) {
  const [convTab, setConvTab] = useState('all');

  // Build unified list for "all" tab
  const allConvs = useMemo(() => {
    const chs = filteredChannels.map(c => ({ type: 'channel', data: c, id: c.id }));
    const dms = filteredEmployees.map(e => ({ type: 'dm', data: e, id: e.id }));
    return [...chs, ...dms];
  }, [filteredChannels, filteredEmployees]);

  const displayList = useMemo(() => {
    if (convTab === 'channels') return filteredChannels.map(c => ({ type: 'channel', data: c }));
    if (convTab === 'direct')   return filteredEmployees.map(e => ({ type: 'dm', data: e }));
    if (convTab === 'unread')   return allConvs.filter(({ type, data }) => {
      const id = type === 'channel' ? data.id : `dm-${[user?.id, data.id].sort().join('-')}`;
      return (unread[id] || 0) > 0;
    });
    return allConvs;
  }, [convTab, filteredChannels, filteredEmployees, allConvs, unread, user?.id]);

  const totalUnread = channelUnread + dmUnread;

  if (isMobile && mobilePaneOpen) return null;

  return (
    <div style={{
      width: isMobile ? '100%' : 320,
      flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      background: C.card,
      borderRight: `1px solid ${C.border}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 16px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>Team Chat</h2>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? C.green : C.subtle, display: 'inline-block' }} />
                {connected ? 'Connected' : 'Connecting…'}
              </span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{
              width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.border}`,
              background: C.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title="New chat">
              <Plus size={16} color={C.muted} />
            </button>
            <button style={{
              width: 34, height: 34, borderRadius: 10, border: 'none',
              background: C.primary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title="Create group">
              <Users size={15} color="#fff" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: C.bg, borderRadius: 10, padding: '8px 12px',
          border: `1px solid ${C.border}`, marginTop: 10,
        }}>
          <Search size={14} color={C.subtle} />
          <input
            value={sidebarQ} onChange={e => setSidebarQ(e.target.value)}
            placeholder="Search conversations…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13.5, color: C.text }}
          />
          {sidebarQ && (
            <button onClick={() => setSidebarQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
              <X size={13} color={C.subtle} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 12px 0',
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        {CONV_TABS.map(t => {
          const isActive = convTab === t.id;
          const badge = t.id === 'unread' ? totalUnread : 0;
          return (
            <button key={t.id} onClick={() => setConvTab(t.id)}
              style={{
                padding: '5px 12px 8px', border: 'none', cursor: 'pointer',
                background: 'none', fontSize: 13, fontWeight: isActive ? 700 : 500,
                color: isActive ? C.primary : C.muted,
                borderBottom: isActive ? `2px solid ${C.primary}` : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
              }}>
              {t.label}
              {badge > 0 && (
                <span style={{ background: C.red, color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <AnimatePresence>
          {displayList.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ padding: '40px 16px', textAlign: 'center', color: C.subtle, fontSize: 13 }}>
              No conversations found
            </motion.div>
          )}
          {displayList.map(({ type, data }) => {
            if (type === 'channel') {
              const ch = data;
              const badge = unread[ch.id] || 0;
              const isActive = channel === ch.id && (!isMobile || !mobilePaneOpen);
              const lastTyping = typing[ch.id];
              return (
                <ConvCard key={`ch-${ch.id}`} name={ch.label} sub={ch.desc}
                  isActive={isActive} badge={badge} isGroup color={chColor(ch.id)}
                  timestamp="" isTyping={lastTyping}
                  onClick={() => { setChannel(ch.id); setTab('channels'); openMainPane(); }} />
              );
            } else {
              const emp = data;
              const name = emp.full_name || emp.name || 'Employee';
              const dmId = `dm-${[user?.id, emp.id].sort().join('-')}`;
              const badge = unread[dmId] || 0;
              const isActive = dmPeer?.id === emp.id && (!isMobile || !mobilePaneOpen);
              const lastTyping = typing[dmId];
              return (
                <ConvCard key={`dm-${emp.id}`} name={name}
                  sub={emp.designation_name || emp.designation || 'Direct message'}
                  photo={emp.profile_photo_url} isActive={isActive} badge={badge}
                  isOnline isGroup={false} timestamp="" isTyping={lastTyping}
                  onClick={() => { setDmPeer(emp); setTab('dms'); markRead(dmId); openMainPane(); }} />
              );
            }
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── PREMIUM MESSAGE BUBBLE ─────────────────────────────────────────────────────

const REACTIONS_LIST = ['👍','❤️','🔥','👏','🎉','😂'];

function FileBubble({ fileName, fileSize, fileUrl, onDownload }) {
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  const isImg = ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);
  const isPdf = ext === 'pdf';
  const isExcel = ['xls','xlsx','csv'].includes(ext);

  if (isImg && fileUrl) return (
    <img src={fileUrl} alt={fileName}
      style={{ maxWidth: 260, maxHeight: 200, borderRadius: 10, marginTop: 6, cursor: 'pointer', objectFit: 'cover', display: 'block' }}
      onClick={() => window.open(fileUrl, '_blank')} />
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginTop: 6,
      background: 'rgba(0,0,0,0.06)', borderRadius: 10, padding: '8px 12px',
      cursor: fileUrl ? 'pointer' : 'default',
    }} onClick={() => fileUrl && onDownload(fileUrl, fileName)}>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: isPdf ? '#FEE2E2' : isExcel ? '#D1FAE5' : '#E0E7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <FileText size={16} color={isPdf ? '#DC2626' : isExcel ? '#059669' : '#4F46E5'} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</p>
        {fileSize && <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{fileSize}</p>}
      </div>
      {fileUrl && <Download size={14} color={C.muted} />}
    </div>
  );
}

function MsgBubble({ msg, isOwn, showAvatar, showName, onReact, onPin }) {
  const [hovered, setHovered]  = useState(false);
  const [showReact, setShowReact] = useState(false);

  const reactions = msg.reactions || [];
  const hasFile   = !!msg.file_name;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row',
        alignItems: 'flex-end', gap: 8, marginBottom: 2,
        paddingLeft: isOwn ? 48 : 4, paddingRight: isOwn ? 4 : 48,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowReact(false); }}
    >
      {/* Avatar (incoming only) */}
      {!isOwn && (
        <div style={{ width: 32, flexShrink: 0, alignSelf: 'flex-end', marginBottom: 0 }}>
          {showAvatar ? <Av name={msg.sender_name} size={32} photo={msg.sender_photo} /> : null}
        </div>
      )}

      <div style={{ maxWidth: '72%', minWidth: 0 }}>
        {/* Sender name */}
        {!isOwn && showName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, marginLeft: 2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{msg.sender_name}</span>
            {msg.sender_role && (
              <span style={{ fontSize: 11, color: C.subtle, background: C.bg, borderRadius: 4, padding: '1px 5px', border: `1px solid ${C.border}` }}>
                {msg.sender_role}
              </span>
            )}
          </div>
        )}

        {/* Bubble */}
        <div style={{
          background: isOwn
            ? 'linear-gradient(135deg, #2563EB, #1D4ED8)'
            : C.card,
          color: isOwn ? '#fff' : C.text,
          borderRadius: isOwn ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
          padding: hasFile && !msg.text ? '10px 14px' : '10px 14px',
          boxShadow: isOwn
            ? '0 4px 12px rgba(37,99,235,0.25)'
            : C.shadowMd,
          border: isOwn ? 'none' : `1px solid ${C.border}`,
          position: 'relative',
          wordBreak: 'break-word',
        }}>
          {msg.text && (
            <p style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', margin: 0 }}>{msg.text}</p>
          )}
          {hasFile && (
            <FileBubble fileName={msg.file_name} fileSize={msg.file_size} fileUrl={msg.file_url} onDownload={downloadAttachment} />
          )}

          {/* Timestamp + status */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: isOwn ? 'flex-end' : 'flex-end',
            gap: 4, marginTop: 5,
          }}>
            <span style={{ fontSize: 10.5, color: isOwn ? 'rgba(255,255,255,0.6)' : C.subtle }}>
              {fmtFull(msg.created_at)}
            </span>
            {isOwn && <CheckCheck size={13} color="rgba(255,255,255,0.7)" />}
          </div>
        </div>

        {/* Reactions */}
        {reactions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
            {reactions.map(r => (
              <button key={r.e} onClick={() => onReact(msg.id, r.e)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  background: '#fff', border: `1px solid ${C.border}`,
                  borderRadius: 999, padding: '2px 8px', fontSize: 12,
                  cursor: 'pointer', boxShadow: C.shadow,
                }}>
                {r.e} <span style={{ fontWeight: 600, color: C.muted, fontSize: 11 }}>{r.c}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 2,
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '3px 6px',
              boxShadow: C.shadowMd, flexShrink: 0,
              order: isOwn ? -1 : 1,
            }}
          >
            {REACTIONS_LIST.slice(0, 4).map(e => (
              <button key={e} onClick={() => onReact(msg.id, e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 3px', borderRadius: 6, transition: 'background 0.1s' }}
                onMouseEnter={el => el.currentTarget.style.background = C.bg}
                onMouseLeave={el => el.currentTarget.style.background = 'none'}>
                {e}
              </button>
            ))}
            {onPin && (
              <button onClick={() => onPin(msg.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                <Pin size={13} color={C.muted} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DateDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 8px', flexShrink: 0 }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{
        fontSize: 11.5, fontWeight: 600, color: C.muted, background: C.bg,
        padding: '3px 12px', borderRadius: 999, border: `1px solid ${C.border}`,
        whiteSpace: 'nowrap',
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

function TypingIndicator({ name }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px 12px' }}>
      <div style={{ display: 'flex', gap: 3, background: C.card, padding: '8px 12px', borderRadius: '4px 18px 18px 18px', border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
        {[0,1,2].map(i => (
          <motion.span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.muted, display: 'inline-block' }}
            animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.2 }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: C.subtle }}>{name} is typing…</span>
    </motion.div>
  );
}

function PremiumMessageList({ items, loading, emptyText, userId, onReact, onPin, threadRef, typingUser }) {
  return (
    <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', background: C.bg }}>
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <motion.div style={{ width: 24, height: 24, borderRadius: '50%', border: `3px solid ${C.border}`, borderTop: `3px solid ${C.primary}` }}
            animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} />
        </div>
      )}
      {!loading && items.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, opacity: 0.5 }}>
          <MessageSquare size={40} color={C.muted} />
          <p style={{ fontSize: 14, color: C.muted }}>{emptyText}</p>
        </div>
      )}
      {items.map((item, idx) => {
        if (item.__divider) return <DateDivider key={`d-${idx}`} label={item.label} />;
        const msg = item;
        const isOwn  = msg.sender_id === userId;
        const prev   = items[idx - 1];
        const prevMsg = prev && !prev.__divider ? prev : null;
        const showAvatar = !isOwn && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
        const showName   = showAvatar;
        return (
          <MsgBubble key={msg.id} msg={msg} isOwn={isOwn}
            showAvatar={showAvatar} showName={showName}
            onReact={onReact} onPin={onPin} />
        );
      })}
      {typingUser && <TypingIndicator name={typingUser} />}
    </div>
  );
}

// ── PREMIUM COMPOSER ──────────────────────────────────────────────────────────

function PremiumComposer({ value, onChange, onKeyDown, onSend, files, onRemoveFile, onPickFiles, disabled, textRef, placeholder }) {
  const fileInputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const dropped = [...e.dataTransfer.files];
    if (dropped.length) onPickFiles(dropped);
  }, [onPickFiles]);

  const handlePaste = useCallback((e) => {
    const items = [...e.clipboardData.items];
    const imageItems = items.filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
    if (imageItems.length) { e.preventDefault(); onPickFiles(imageItems); }
  }, [onPickFiles]);

  return (
    <div
      style={{ padding: '10px 16px 14px', background: C.card, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Pending files */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {files.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '5px 10px', fontSize: 12,
            }}>
              {f.uploading ? (
                <motion.div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${C.border}`, borderTop: `2px solid ${C.primary}` }}
                  animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} />
              ) : (
                <Check size={12} color={C.green} />
              )}
              <span style={{ color: C.text, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              {f.size && <span style={{ color: C.subtle }}>{f.size}</span>}
              <button onClick={() => onRemoveFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: C.muted }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8,
        background: C.bg, borderRadius: 14,
        border: `1.5px solid ${C.border}`, padding: '6px 8px 6px 14px',
        transition: 'border-color 0.2s',
      }}
        onFocus={() => {}} // could add focus ring
      >
        {/* Attach */}
        <button onClick={() => fileInputRef.current?.click()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, color: C.muted, flexShrink: 0, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = C.primary}
          onMouseLeave={e => e.currentTarget.style.color = C.muted}>
          <Paperclip size={17} />
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.length) onPickFiles([...e.target.files]); e.target.value = ''; }} />

        {/* Textarea */}
        <textarea
          ref={textRef}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder || 'Type your message…'}
          rows={1}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            resize: 'none', fontSize: 14, color: C.text, lineHeight: 1.5,
            maxHeight: 120, overflowY: 'auto', padding: '4px 0',
            fontFamily: 'inherit',
          }}
        />

        {/* Emoji placeholder */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, color: C.muted, flexShrink: 0, display: 'flex', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = C.amber}
          onMouseLeave={e => e.currentTarget.style.color = C.muted}>
          <Smile size={17} />
        </button>

        {/* Send */}
        <motion.button
          onClick={onSend}
          disabled={disabled}
          whileTap={disabled ? {} : { scale: 0.9 }}
          style={{
            width: 34, height: 34, borderRadius: 10, border: 'none',
            background: disabled ? C.border : `linear-gradient(135deg, ${C.primary}, #1D4ED8)`,
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: disabled ? 'none' : '0 4px 12px rgba(37,99,235,0.3)',
            transition: 'background 0.2s',
          }}>
          <Send size={15} color={disabled ? C.subtle : '#fff'} />
        </motion.button>
      </div>

      <p style={{ fontSize: 11, color: C.subtle, marginTop: 6, textAlign: 'center' }}>
        Press <kbd style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '0 4px', fontSize: 10 }}>Enter</kbd> to send · <kbd style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '0 4px', fontSize: 10 }}>Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}

// ── CHAT HEADER ────────────────────────────────────────────────────────────────

function ChatHeader({
  title, subtitle, isGroup, color, photo,
  onVoiceCall, onVideoCall, onScreenShare,
  callState, shareState,
  onToggleDetails, detailsOpen,
  onBack, isMobile,
  onToggleSearch, onTogglePin,
  searchOpen, pinsOpen,
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
      background: C.card, borderBottom: `1px solid ${C.border}`,
      flexShrink: 0, boxShadow: C.shadow,
    }}>
      {isMobile && (
        <motion.button onClick={onBack} whileTap={{ scale: 0.9 }}
          style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ArrowLeft size={18} color={C.text} />
        </motion.button>
      )}

      {/* Avatar */}
      {isGroup ? (
        <div style={{
          width: 42, height: 42, borderRadius: 13, background: color || C.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0,
          boxShadow: `0 4px 12px ${(color || C.primary)}40`,
        }}>
          {title?.charAt(0)?.toUpperCase() || '#'}
        </div>
      ) : (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Av name={title} size={42} photo={photo} />
          <span style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: C.green, border: '2px solid #fff' }} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h3>
        <p style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {onVoiceCall && (
          <ActionBtn icon={Phone} color="#16A34A" bg="#F0FDF4" disabled={callState !== 'idle'}
            title="Voice call" onClick={onVoiceCall} />
        )}
        {onVideoCall && (
          <ActionBtn icon={Video} color={C.primary} bg={C.primaryLight} disabled={callState !== 'idle'}
            title="Video call" onClick={onVideoCall} />
        )}
        {onScreenShare && (
          <ActionBtn icon={Monitor} color="#7C3AED" bg="#F5F3FF" disabled={shareState && shareState !== 'idle'}
            title="Share screen" onClick={onScreenShare} />
        )}
        <div style={{ width: 1, height: 22, background: C.border, margin: '0 2px' }} />
        <ActionBtn icon={Search} color={searchOpen ? C.primary : C.muted} bg={searchOpen ? C.primaryLight : 'transparent'}
          title="Search messages" onClick={onToggleSearch} />
        <ActionBtn icon={Pin} color={pinsOpen ? C.amber : C.muted} bg={pinsOpen ? '#FFFBEB' : 'transparent'}
          title="Pinned messages" onClick={onTogglePin} />
        <ActionBtn icon={Info} color={detailsOpen ? C.primary : C.muted} bg={detailsOpen ? C.primaryLight : 'transparent'}
          title="Details" onClick={onToggleDetails} />
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, color, bg, disabled, title, onClick }) {
  return (
    <motion.button whileTap={disabled ? {} : { scale: 0.88 }} onClick={onClick}
      disabled={disabled} title={title}
      style={{
        width: 34, height: 34, borderRadius: 9, border: 'none',
        background: bg || 'transparent', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.4 : 1, transition: 'background 0.15s',
      }}>
      <Icon size={16} color={color} />
    </motion.button>
  );
}

// ── PINNED BANNER ─────────────────────────────────────────────────────────────

function PinnedBanner({ messages, onUnpin }) {
  const [idx, setIdx] = useState(0);
  const msg = messages[idx % messages.length];
  if (!msg) return null;
  return (
    <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
        background: '#FFFBEB', borderBottom: '1px solid #FDE68A', flexShrink: 0,
        cursor: messages.length > 1 ? 'pointer' : 'default',
      }}
      onClick={() => messages.length > 1 && setIdx(i => i + 1)}>
      <Pin size={13} color={C.amber} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, marginRight: 6 }}>
          {messages.length > 1 ? `Pinned (${idx + 1}/${messages.length})` : 'Pinned'}
        </span>
        <span style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {msg.text?.slice(0, 100)}{msg.text?.length > 100 ? '…' : ''}
        </span>
      </div>
      <button onClick={e => { e.stopPropagation(); onUnpin(msg.id); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, color: C.muted }}>
        <X size={14} />
      </button>
    </motion.div>
  );
}

// ── DETAILS PANEL ─────────────────────────────────────────────────────────────

function DetailsSection({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: `1px solid ${C.borderLight}` }}>
      <button onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
        }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        <motion.div animate={{ rotate: open ? 0 : -90 }}>
          <ChevronDown size={14} color={C.muted} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailsPanel({ isChannel, channelInfo, dmPeer, employees, pinnedMessages, onTogglePin, onClose }) {
  const title     = isChannel ? channelInfo?.label : (dmPeer?.full_name || dmPeer?.name || 'Employee');
  const subtitle  = isChannel ? channelInfo?.desc  : (dmPeer?.designation_name || dmPeer?.designation || 'Direct message');
  const color     = isChannel ? chColor(channelInfo?.id) : C.primary;

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: C.card, borderLeft: `1px solid ${C.border}`,
        overflowY: 'auto', overflowX: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Details</span>
        <button onClick={onClose}
          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={14} color={C.muted} />
        </button>
      </div>

      {/* Identity card */}
      <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
        {isChannel ? (
          <div style={{
            width: 64, height: 64, borderRadius: 18, background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 auto 12px',
            boxShadow: `0 8px 24px ${color}40`,
          }}>
            {title?.charAt(0)?.toUpperCase()}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <Av name={title} size={64} photo={dmPeer?.profile_photo_url} />
              <span style={{ position: 'absolute', bottom: 3, right: 3, width: 14, height: 14, borderRadius: '50%', background: C.green, border: '2.5px solid #fff' }} />
            </div>
          </div>
        )}
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{title}</h3>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{subtitle}</p>
        {isChannel && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 14 }}>
            {[
              { label: 'Members', value: employees?.length || '—' },
              { label: 'Online', value: Math.min(employees?.length || 0, 3) },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{value}</p>
                <p style={{ fontSize: 11, color: C.muted }}>{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info cards */}
      <DetailsSection title="Information">
        <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Project', value: 'BCIM - TQS' },
            { label: 'Created by', value: 'Admin' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: C.muted }}>{label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{value}</span>
            </div>
          ))}
        </div>
      </DetailsSection>

      {/* Pinned messages */}
      {pinnedMessages.length > 0 && (
        <DetailsSection title={`Pinned (${pinnedMessages.length})`}>
          <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pinnedMessages.map(m => (
              <div key={m.id} style={{
                background: C.bg, borderRadius: 10, padding: '8px 10px',
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Av name={m.sender_name} size={20} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.text }}>{m.sender_name}</span>
                </div>
                <p style={{ fontSize: 12.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.text?.slice(0, 70)}{m.text?.length > 70 ? '…' : ''}
                </p>
              </div>
            ))}
          </div>
        </DetailsSection>
      )}

      {/* Members (channels) */}
      {isChannel && employees && employees.length > 0 && (
        <DetailsSection title="Members">
          <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {employees.slice(0, 8).map(emp => (
              <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <Av name={emp.full_name || emp.name} size={30} photo={emp.profile_photo_url} />
                  <span style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: C.green, border: '1.5px solid #fff' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.full_name || emp.name}</p>
                  <p style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.designation_name || emp.designation || ''}</p>
                </div>
              </div>
            ))}
            {employees.length > 8 && (
              <button style={{ fontSize: 12.5, color: C.primary, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontWeight: 600 }}>
                +{employees.length - 8} more members
              </button>
            )}
          </div>
        </DetailsSection>
      )}

      {/* Quick actions */}
      <DetailsSection title="Quick Actions">
        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { icon: UserPlus, label: 'Add Member', color: C.primary },
            { icon: Bell,     label: 'Notifications', color: C.amber },
            { icon: Settings, label: 'Group Settings', color: C.muted },
          ].map(({ icon: Icon, label, color }) => (
            <button key={label}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 10, border: 'none',
                background: C.bg, cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.primaryLight}
              onMouseLeave={e => e.currentTarget.style.background = C.bg}>
              <Icon size={15} color={color} />
              <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</span>
            </button>
          ))}
        </div>
      </DetailsSection>
    </motion.div>
  );
}

// ── NOTIFICATION BANNER ────────────────────────────────────────────────────────

function NotifBanner({ perm, onEnable, onDismiss }) {
  if (perm === 'default') return (
    <motion.div initial={{ y: -40 }} animate={{ y: 0 }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: C.primary, color: '#fff', fontSize: 12.5, flexShrink: 0 }}>
      <Bell size={14} />
      <span style={{ flex: 1 }}>Enable desktop notifications to stay updated</span>
      <button onClick={onEnable} style={{ padding: '3px 14px', background: '#fff', color: C.primary, borderRadius: 6, fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 12 }}>Enable</button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'rgba(255,255,255,0.7)' }}><X size={14} /></button>
    </motion.div>
  );
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ERPChat() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const { socketRef, connected, employees, unread, typing, markRead, registerActive, startCall, callState, startShare, shareState, SHARE_STATE } = useChat();

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
  }, [channel, markRead]);

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
  const visibleCh = useMemo(() => {
    if (!chSearch.trim()) return chMessages;
    const q = chSearch.toLowerCase();
    return chMessages.filter(m => m.text?.toLowerCase().includes(q));
  }, [chMessages, chSearch]);
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

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', background: C.bg }}>

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
          unread={unread} typing={typing} user={user}
          connected={connected} openMainPane={openMainPane} markRead={markRead}
          channelUnread={channelUnread} dmUnread={dmUnread}
          isMobile={isMobile} mobilePaneOpen={mobilePaneOpen}
        />

        {/* ── MAIN CHAT AREA ─────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, display: isMobile && !mobilePaneOpen ? 'none' : 'flex',
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
                textRef={chTextRef} placeholder={`Message #${activeCh.label}`} />
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
                    threadRef={dmThreadRef} typingUser={typing[dmChannel]} />

                  <PremiumComposer value={dmInput} onChange={handleDmTyping}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); } }}
                    onSend={sendDm} files={dmFiles}
                    onRemoveFile={i => setDmFiles(p => p.filter((_, j) => j !== i))}
                    onPickFiles={pickDmFiles}
                    disabled={(!dmInput.trim() && dmFiles.length === 0) || dmFiles.some(f => f.uploading)}
                    textRef={dmTextRef} placeholder={`Message ${dmPeerName}`} />
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
