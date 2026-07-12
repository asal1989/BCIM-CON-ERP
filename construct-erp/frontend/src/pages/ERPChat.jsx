// src/pages/ERPChat.jsx — Premium Team Chat UI
// Microsoft Teams + Slack + Discord inspired enterprise design
// Built with Framer Motion + Tailwind CSS + Lucide icons
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Pin, X, Hash, MessageSquare, Users, Phone, Video, ArrowLeft,
  Monitor, Send, Paperclip, Smile, Bell, Info,
  Plus, ChevronDown, FileText, Check, CheckCheck,
  UserPlus, Settings, Download, PhoneIncoming, PhoneOutgoing,
  PhoneMissed, PhoneOff, VideoIcon, Voicemail, CalendarDays, Copy, ExternalLink, Clock,
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

// Width of sidebar per view
const SIDEBAR_W = { chat: 320, calls: 380, meetings: 360 };

function ConvListPanel({
  tab, setTab, sidebarQ, setSidebarQ,
  filteredChannels, filteredEmployees,
  channel, setChannel, dmPeer, setDmPeer,
  unread, typing, user, connected, openMainPane, markRead,
  channelUnread, dmUnread, isMobile, mobilePaneOpen,
  previews, mainView, setMainView, onNewMeeting,
  // Calls pane props
  callsCurrentUserId, callsEmployees, callsStartCall,
}) {
  const [convTab, setConvTab] = useState('all');

  // Build unified list sorted by most recent message
  const allConvs = useMemo(() => {
    const chs = filteredChannels.map(c => ({ type: 'channel', data: c, id: c.id }));
    const dms = filteredEmployees.map(e => ({
      type: 'dm', data: e,
      id: `dm-${[user?.id, e.id].sort().join('-')}`,
    }));
    return [...chs, ...dms].sort((a, b) => {
      const ta = previews?.[a.id]?.created_at ? new Date(previews[a.id].created_at) : new Date(0);
      const tb = previews?.[b.id]?.created_at ? new Date(previews[b.id].created_at) : new Date(0);
      return tb - ta;
    });
  }, [filteredChannels, filteredEmployees, previews, user?.id]);

  const displayList = useMemo(() => {
    if (convTab === 'channels') return filteredChannels.map(c => ({ type: 'channel', data: c, id: c.id }));
    if (convTab === 'direct')   return filteredEmployees.map(e => ({ type: 'dm', data: e, id: `dm-${[user?.id, e.id].sort().join('-')}` }));
    if (convTab === 'unread')   return allConvs.filter(({ id }) => (unread[id] || 0) > 0);
    return allConvs;
  }, [convTab, filteredChannels, filteredEmployees, allConvs, unread, user?.id]);

  const totalUnread = channelUnread + dmUnread;

  if (isMobile && mobilePaneOpen) return null;

  const sidebarWidth = isMobile ? '100%' : SIDEBAR_W[mainView] ?? 320;

  return (
    <div style={{
      width: sidebarWidth, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      background: C.card, borderRight: `1px solid ${C.border}`,
      overflow: 'hidden', transition: 'width 0.2s ease',
    }}>

      {/* ── Sidebar header (always visible) ── */}
      <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: mainView === 'chat' ? 8 : 0 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>
              {mainView === 'calls' ? 'Call Logs' : mainView === 'meetings' ? 'Teams Meetings' : 'Team Chat'}
            </h2>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? C.green : C.subtle, display: 'inline-block' }} />
              {connected ? 'Connected' : 'Connecting…'}
            </p>
          </div>
          <motion.button whileTap={{ scale: 0.92 }} onClick={onNewMeeting}
            title="Schedule Teams Meeting"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
              borderRadius: 9, border: 'none', background: '#5058E5', cursor: 'pointer',
              fontSize: 11.5, fontWeight: 600, color: '#fff',
              boxShadow: '0 2px 8px rgba(80,88,229,0.3)',
            }}>
            <CalendarDays size={12} /> Meeting
          </motion.button>
        </div>

        {/* Search bar — chat view only */}
        {mainView === 'chat' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, borderRadius: 10, padding: '7px 12px', border: `1px solid ${C.border}` }}>
            <Search size={14} color={C.subtle} />
            <input value={sidebarQ} onChange={e => setSidebarQ(e.target.value)}
              placeholder="Search conversations…"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13.5, color: C.text }} />
            {sidebarQ && (
              <button onClick={() => setSidebarQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                <X size={13} color={C.subtle} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Main-view tabs: Chat / Calls / Meetings ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.card }}>
        {[
          { id: 'chat',     label: 'Chats',    Icon: MessageSquare, badge: totalUnread },
          { id: 'calls',    label: 'Calls',    Icon: Phone,         badge: 0 },
          { id: 'meetings', label: 'Meetings', Icon: CalendarDays,  badge: 0 },
        ].map(({ id, label, Icon, badge }) => {
          const active = mainView === id;
          return (
            <button key={id} onClick={() => setMainView(id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '9px 0 8px', border: 'none', cursor: 'pointer',
                background: active ? C.primaryLight : 'none',
                borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent',
                color: active ? C.primary : C.muted,
                fontSize: 10.5, fontWeight: active ? 700 : 500, transition: 'all 0.15s',
                position: 'relative',
              }}>
              <Icon size={16} />
              {label}
              {badge > 0 && (
                <span style={{
                  position: 'absolute', top: 6, right: '50%', marginRight: -20,
                  background: C.red, color: '#fff', borderRadius: 999,
                  fontSize: 9, fontWeight: 700, minWidth: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                }}>{badge > 99 ? '99+' : badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── CHATS view ── */}
      {mainView === 'chat' && (
        <>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 2, padding: '6px 10px 0', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            {CONV_TABS.map(t => {
              const isActive = convTab === t.id;
              const badge = t.id === 'unread' ? totalUnread : 0;
              return (
                <button key={t.id} onClick={() => setConvTab(t.id)}
                  style={{
                    padding: '4px 10px 7px', border: 'none', cursor: 'pointer',
                    background: 'none', fontSize: 12.5, fontWeight: isActive ? 700 : 500,
                    color: isActive ? C.primary : C.muted,
                    borderBottom: isActive ? `2px solid ${C.primary}` : '2px solid transparent',
                    marginBottom: -1, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4,
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

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <AnimatePresence>
              {displayList.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ padding: '40px 16px', textAlign: 'center', color: C.subtle, fontSize: 13 }}>
                  No conversations found
                </motion.div>
              )}
              {displayList.map(({ type, data, id: convId }) => {
                const preview = previews?.[convId];
                if (type === 'channel') {
                  const ch = data;
                  const badge = unread[ch.id] || 0;
                  const isActive = channel === ch.id && (!isMobile || !mobilePaneOpen);
                  const lastTyping = typing[ch.id];
                  const previewText = preview?.text
                    ? (preview.sender_name ? `${preview.sender_name}: ` : '') + preview.text.slice(0, 50)
                    : ch.desc;
                  return (
                    <ConvCard key={`ch-${ch.id}`} name={ch.label} sub={previewText}
                      isActive={isActive} badge={badge} isGroup color={chColor(ch.id)}
                      timestamp={preview?.created_at ? fmtTime(preview.created_at) : ''}
                      isTyping={lastTyping}
                      onClick={() => { setChannel(ch.id); setTab('channels'); openMainPane(); }} />
                  );
                } else {
                  const emp = data;
                  const name = emp.full_name || emp.name || 'Employee';
                  const dmId = convId;
                  const badge = unread[dmId] || 0;
                  const isActive = dmPeer?.id === emp.id && (!isMobile || !mobilePaneOpen);
                  const lastTyping = typing[dmId];
                  const previewText = preview?.text
                    ? preview.text.slice(0, 55) + (preview.text.length > 55 ? '…' : '')
                    : (emp.designation_name || emp.designation || 'Direct message');
                  return (
                    <ConvCard key={`dm-${emp.id}`} name={name} sub={previewText}
                      photo={emp.profile_photo_url} isActive={isActive} badge={badge}
                      isOnline isGroup={false}
                      timestamp={preview?.created_at ? fmtTime(preview.created_at) : ''}
                      isTyping={lastTyping}
                      onClick={() => { setDmPeer(emp); setTab('dms'); markRead(dmId); openMainPane(); }} />
                  );
                }
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* ── CALLS view (inline in sidebar, WhatsApp-style) ── */}
      {mainView === 'calls' && (
        <CallsPane
          currentUserId={callsCurrentUserId}
          employees={callsEmployees}
          startCall={callsStartCall}
          compact
        />
      )}

      {/* ── MEETINGS view (inline in sidebar) ── */}
      {mainView === 'meetings' && (
        <MeetingsPane onNewMeeting={onNewMeeting} compact />
      )}
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

// ── CALLS PANE ────────────────────────────────────────────────────────────────

function fmtDur(secs) {
  if (!secs) return '';
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtCallTime(ts) {
  if (!ts) return '';
  const d   = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const CALL_STATUS_META = {
  answered:  { label: 'Answered',  color: C.green,   Icon: null },
  cancelled: { label: 'Cancelled', color: C.muted,   Icon: null },
  missed:    { label: 'Missed',    color: '#EF4444', Icon: null },
  rejected:  { label: 'Declined',  color: '#EF4444', Icon: null },
  busy:      { label: 'Busy',      color: C.amber,   Icon: null },
  failed:    { label: 'Failed',    color: '#EF4444', Icon: null },
};

function CallLogRow({ log, currentUserId, onCallBack, employees }) {
  const isOutgoing = log.caller_id === currentUserId;
  const peerName   = isOutgoing ? log.callee_name : log.caller_name;
  const peerId     = isOutgoing ? log.callee_id   : log.caller_id;
  const peer       = employees.find(e => e.id === peerId);
  const meta       = CALL_STATUS_META[log.status] || CALL_STATUS_META.answered;
  const isMissed   = log.status === 'missed' || log.status === 'rejected';

  const DirectionIcon = isOutgoing
    ? PhoneOutgoing
    : isMissed ? PhoneMissed : PhoneIncoming;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px', borderBottom: `1px solid ${C.borderLight}`,
        background: C.card,
      }}
      onMouseEnter={e => e.currentTarget.style.background = C.bg}
      onMouseLeave={e => e.currentTarget.style.background = C.card}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Av name={peerName} size={44} photo={peer?.profile_photo_url} />
        <div style={{
          position: 'absolute', bottom: 0, right: -2,
          width: 18, height: 18, borderRadius: '50%',
          background: isMissed ? '#FEE2E2' : C.greenBg,
          border: `2px solid ${C.card}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DirectionIcon size={9} color={isMissed ? '#EF4444' : C.green} strokeWidth={2.5} />
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{
            fontWeight: 600, fontSize: 14, color: isMissed ? '#EF4444' : C.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{peerName}</span>
          {log.call_type === 'video' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10.5, color: C.muted, background: C.bg,
              border: `1px solid ${C.border}`, borderRadius: 5, padding: '1px 6px',
            }}>
              <VideoIcon size={9} /> Video
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: meta.color, fontWeight: 500 }}>{meta.label}</span>
          {log.duration_secs > 0 && (
            <span style={{ fontSize: 12, color: C.subtle }}>· {fmtDur(log.duration_secs)}</span>
          )}
        </div>
      </div>

      {/* Time + call-back */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <span style={{ fontSize: 11.5, color: C.subtle }}>{fmtCallTime(log.started_at)}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => onCallBack(peer || { id: peerId, full_name: peerName }, 'audio')}
            style={{
              width: 30, height: 30, borderRadius: '50%', border: 'none',
              background: C.greenBg, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title="Voice call">
            <Phone size={13} color={C.green} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => onCallBack(peer || { id: peerId, full_name: peerName }, 'video')}
            style={{
              width: 30, height: 30, borderRadius: '50%', border: 'none',
              background: C.primaryLight, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title="Video call">
            <Video size={13} color={C.primary} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function CallsPane({ currentUserId, employees, startCall, compact = false }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all'); // all | missed | outgoing | incoming

  const loadLogs = useCallback(() => {
    setLoading(true);
    api.get('/chat/call-logs', { params: { limit: 200 } })
      .then(r => setLogs(r.data?.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const filtered = useMemo(() => {
    if (filter === 'all')      return logs;
    if (filter === 'missed')   return logs.filter(l => l.status === 'missed' || l.status === 'rejected');
    if (filter === 'outgoing') return logs.filter(l => l.caller_id === currentUserId);
    if (filter === 'incoming') return logs.filter(l => l.callee_id === currentUserId);
    return logs;
  }, [logs, filter, currentUserId]);

  // Group by date
  const grouped = useMemo(() => {
    const groups = [];
    let lastDate = '';
    for (const log of filtered) {
      const d = new Date(log.started_at);
      const label = (() => {
        const diff = Math.floor((Date.now() - d) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        if (diff < 7)  return d.toLocaleDateString([], { weekday: 'long' });
        return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
      })();
      if (label !== lastDate) { groups.push({ type: 'date', label }); lastDate = label; }
      groups.push({ type: 'log', log });
    }
    return groups;
  }, [filtered]);

  const missedCount = logs.filter(l => l.status === 'missed' || l.status === 'rejected').length;

  const onCallBack = useCallback((peer, callType) => {
    if (!peer?.id) return toast.error('Cannot call — user not found');
    startCall(peer, callType).catch(e => toast.error(e.message || 'Could not start call'));
  }, [startCall]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      {/* Header */}
      <div style={{ padding: compact ? '10px 14px 8px' : '16px 20px 12px', background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: compact ? 8 : 12 }}>
          <p style={{ fontSize: 12, color: C.muted }}>{logs.length} call{logs.length !== 1 ? 's' : ''} total</p>
          <motion.button whileTap={{ scale: 0.9 }} onClick={loadLogs}
            style={{
              padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.bg, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: C.muted,
            }}>
            Refresh
          </motion.button>
        </div>

        {/* Stats row */}
        {!compact && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'Total', val: logs.length, color: C.primary },
              { label: 'Answered', val: logs.filter(l => l.status === 'answered').length, color: C.green },
              { label: 'Missed', val: missedCount, color: '#EF4444' },
              { label: 'Outgoing', val: logs.filter(l => l.caller_id === currentUserId).length, color: C.amber },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, background: C.bg, borderRadius: 10, padding: '8px 10px', border: `1px solid ${C.border}`, textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 700, color }}>{val}</p>
                <p style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Compact stats */}
        {compact && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {[
              { label: 'All', val: logs.length, id: 'all', color: C.text },
              { label: `Missed${missedCount > 0 ? ` (${missedCount})` : ''}`, val: null, id: 'missed', color: '#EF4444' },
              { label: 'In', val: null, id: 'incoming', color: C.green },
              { label: 'Out', val: null, id: 'outgoing', color: C.primary },
            ].map(({ label, id, color }) => (
              <button key={id} onClick={() => setFilter(id)}
                style={{
                  flex: 1, padding: '4px 6px', borderRadius: 8, cursor: 'pointer',
                  background: filter === id ? C.primary : C.bg,
                  color: filter === id ? '#fff' : C.muted,
                  fontSize: 11, fontWeight: filter === id ? 700 : 500,
                  border: `1px solid ${filter === id ? C.primary : C.border}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Filter chips (non-compact) */}
        {!compact && (
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'missed', label: `Missed${missedCount > 0 ? ` (${missedCount})` : ''}` },
              { id: 'incoming', label: 'Incoming' },
              { id: 'outgoing', label: 'Outgoing' },
            ].map(({ id, label }) => (
              <button key={id} onClick={() => setFilter(id)}
                style={{
                  padding: '4px 14px', borderRadius: 999, cursor: 'pointer',
                  background: filter === id ? C.primary : C.bg,
                  color: filter === id ? '#fff' : C.muted,
                  fontSize: 12.5, fontWeight: filter === id ? 700 : 500,
                  border: `1px solid ${filter === id ? C.primary : C.border}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Log list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <motion.div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${C.border}`, borderTop: `3px solid ${C.primary}` }}
              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} />
          </div>
        )}
        {!loading && grouped.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 14, opacity: 0.5 }}>
            <PhoneOff size={48} color={C.muted} />
            <p style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>
              {filter === 'missed' ? 'No missed calls' : 'No call history yet'}
            </p>
            <p style={{ fontSize: 12.5, color: C.subtle }}>
              Voice and video calls appear here after they end
            </p>
          </div>
        )}
        {!loading && grouped.map((item, i) => {
          if (item.type === 'date') return (
            <div key={`d-${i}`} style={{
              padding: '10px 20px 4px', fontSize: 11.5, fontWeight: 700,
              color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em',
              background: C.bg,
            }}>{item.label}</div>
          );
          return (
            <CallLogRow key={item.log.id} log={item.log}
              currentUserId={currentUserId} onCallBack={onCallBack} employees={employees} />
          );
        })}
      </div>
    </div>
  );
}

// ── TEAMS LOGO (inline SVG) ───────────────────────────────────────────────────
function TeamsLogo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="#5058E5"/>
      <text x="4" y="17" fontFamily="Arial,sans-serif" fontWeight="800" fontSize="13" fill="#fff">T</text>
      <circle cx="17" cy="7" r="3.5" fill="#fff"/>
      <rect x="12.5" y="11" width="9" height="7" rx="2" fill="#fff"/>
    </svg>
  );
}

// ── TEAMS MEETING MODAL ────────────────────────────────────────────────────────
function TeamsMeetingModal({ onClose, onMeetingCreated, employees = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = (() => {
    const h = new Date().getHours() + 1;
    return `${String(h % 24).padStart(2, '0')}:00`;
  })();

  const [subject,    setSubject]    = useState('');
  const [dateStr,    setDateStr]    = useState(today);
  const [startTime,  setStartTime]  = useState(defaultStart);
  const [endTime,    setEndTime]    = useState(`${String((parseInt(defaultStart) + 1) % 24).padStart(2, '0')}:00`);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [copied,     setCopied]     = useState(false);
  const [permError,  setPermError]  = useState(null);
  const [attendees,  setAttendees]  = useState([]);
  const [empSearch,  setEmpSearch]  = useState('');
  const [empOpen,    setEmpOpen]    = useState(false);
  const [opened,     setOpened]     = useState(false);

  const empList = useMemo(() => {
    const q = empSearch.toLowerCase();
    return employees
      .filter(e => {
        if (attendees.find(a => a.id === e.id)) return false;
        const name = (e.full_name || e.name || '').toLowerCase();
        const des  = (e.designation_name || e.designation || '').toLowerCase();
        return !q || name.includes(q) || des.includes(q);
      })
      .slice(0, 7);
  }, [employees, empSearch, attendees]);

  const removeAttendee = id => setAttendees(prev => prev.filter(a => a.id !== id));
  const addAttendee    = emp => { setAttendees(prev => [...prev, emp]); setEmpSearch(''); };

  // Build Teams deep-link as fallback (works without API permissions)
  const teamsDeepLink = useMemo(() => {
    const start = new Date(`${dateStr}T${startTime}:00`).toISOString();
    const end   = new Date(`${dateStr}T${endTime}:00`).toISOString();
    const emails = attendees.map(a => a.email).filter(Boolean).join(',');
    return `https://teams.microsoft.com/l/meeting/new?subject=${encodeURIComponent(subject || 'Team Meeting')}&startTime=${encodeURIComponent(start)}&endTime=${encodeURIComponent(end)}${emails ? `&attendees=${encodeURIComponent(emails)}` : ''}`;
  }, [subject, dateStr, startTime, endTime, attendees]);

  const createMeeting = async () => {
    if (!subject.trim()) { toast.error('Please enter a meeting title'); return; }
    setLoading(true); setPermError(null);
    try {
      const startDT = new Date(`${dateStr}T${startTime}:00`).toISOString();
      const endDT   = new Date(`${dateStr}T${endTime}:00`).toISOString();
      const res = await api.post('/chat/teams-meeting', {
        subject:       subject.trim(),
        startDateTime: startDT,
        endDateTime:   endDT,
        attendeeEmails: attendees.map(a => a.email).filter(Boolean),
      });
      setResult(res.data.meeting);
      toast.success('Teams meeting created!');
    } catch (err) {
      const data = err?.response?.data || {};
      if (data.isPermissionError || err?.response?.status === 403) {
        setPermError(data);
      } else {
        toast.error(data.error || 'Failed to create meeting');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(result.joinUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareToChat = () => {
    if (!result) return;
    const start = new Date(result.startDateTime);
    const end   = new Date(result.endDateTime);
    const attendeeNames = attendees.map(a => a.full_name || a.name).filter(Boolean).join(', ');
    const text = [
      `📅 Teams Meeting: ${result.subject}`,
      `🕐 ${start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      attendeeNames ? `👥 ${attendeeNames}` : '',
      `🔗 Join: ${result.joinUrl}`,
    ].filter(Boolean).join('\n');
    onMeetingCreated(text);
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '9px 11px', borderRadius: 10,
    border: `1.5px solid ${C.border}`, outline: 'none',
    fontSize: 13.5, color: C.text, background: C.bg, boxSizing: 'border-box',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        style={{
          width: '100%', maxWidth: 500, background: C.card,
          borderRadius: 20, boxShadow: '0 28px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '18px 20px 16px',
          background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
        }}>
          <TeamsLogo size={34} />
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>New Teams Meeting</h3>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Schedule a virtual meeting for your team</p>
          </div>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} color="#fff" />
          </button>
        </div>

        <div style={{ padding: '18px 20px 20px' }}>
          {/* ── Permission error ── */}
          {permError && !result && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              style={{ background: '#FEF9F0', borderRadius: 12, border: '1px solid #FCD34D', padding: '12px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 12.5, color: '#92400E', margin: 0 }}>
                ⚠️ API permission not set up yet — use <strong>Open in Teams</strong> below to create the meeting now.
              </p>
            </motion.div>
          )}

          {/* ── Create form ── */}
          {!result && (
            <>
              {/* Title */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meeting Title</label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Weekly Standup, Project Seminar, Site Review…"
                  autoFocus
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = C.primary}
                  onBlur={e => e.target.style.borderColor = C.border}
                  onKeyDown={e => e.key === 'Enter' && !loading && createMeeting()} />
              </div>

              {/* Date + times */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Date', type: 'date', val: dateStr, set: setDateStr },
                  { label: 'Start', type: 'time', val: startTime, set: setStartTime },
                  { label: 'End', type: 'time', val: endTime, set: setEndTime },
                ].map(({ label, type, val, set }) => (
                  <div key={label}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                    <input type={type} value={val} onChange={e => set(e.target.value)}
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = C.primary}
                      onBlur={e => e.target.style.borderColor = C.border} />
                  </div>
                ))}
              </div>

              {/* Participants */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Participants <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— optional</span>
                </label>

                {/* Selected chips */}
                {attendees.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {attendees.map(a => (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: C.primaryLight, border: `1px solid ${C.primaryBorder}`,
                        borderRadius: 999, padding: '3px 10px 3px 6px',
                      }}>
                        <Av name={a.full_name || a.name} size={20} photo={a.profile_photo_url} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.primary }}>
                          {a.full_name || a.name}
                        </span>
                        <button onClick={() => removeAttendee(a.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: C.primary }}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search input */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, borderRadius: 10, padding: '8px 12px', border: `1.5px solid ${empOpen ? C.primary : C.border}`, transition: 'border-color 0.15s' }}>
                    <Search size={13} color={C.subtle} />
                    <input
                      value={empSearch}
                      onChange={e => { setEmpSearch(e.target.value); setEmpOpen(true); }}
                      onFocus={() => setEmpOpen(true)}
                      onBlur={() => setTimeout(() => setEmpOpen(false), 150)}
                      placeholder="Search team members to invite…"
                      style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: C.text }}
                    />
                    <UserPlus size={13} color={C.muted} />
                  </div>

                  {/* Dropdown */}
                  <AnimatePresence>
                    {empOpen && empList.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                          background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
                          boxShadow: C.shadowLg, overflow: 'hidden', marginTop: 4,
                        }}>
                        {empList.map(emp => (
                          <button key={emp.id}
                            onMouseDown={() => addAttendee(emp)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                              padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer',
                              textAlign: 'left', borderBottom: `1px solid ${C.borderLight}`,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.bg}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <Av name={emp.full_name || emp.name} size={32} photo={emp.profile_photo_url} />
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{emp.full_name || emp.name}</p>
                              <p style={{ fontSize: 11.5, color: C.muted }}>{emp.designation_name || emp.designation || emp.email || ''}</p>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Primary action — Open in Teams */}
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (!subject.trim()) { toast.error('Please enter a meeting title'); return; }
                  window.open(teamsDeepLink, '_blank');
                  setOpened(true);
                }}
                disabled={!subject.trim()}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                  background: !subject.trim() ? C.border : 'linear-gradient(135deg, #4F46E5, #6366F1)',
                  color: !subject.trim() ? C.subtle : '#fff',
                  fontSize: 15, fontWeight: 700,
                  cursor: !subject.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: !subject.trim() ? 'none' : '0 4px 16px rgba(79,70,229,0.4)',
                  transition: 'all 0.2s', marginBottom: 10,
                }}>
                <ExternalLink size={16} />
                {opened ? 'Open in Teams Again' : 'Open in Microsoft Teams'}
              </motion.button>

              {opened && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  style={{ background: '#F0FDF4', borderRadius: 10, border: '1px solid #BBF7D0', padding: '10px 14px', marginBottom: 10, textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#166534', margin: 0 }}>
                    ✅ Teams opened — click <strong>Send</strong> inside Teams to confirm the meeting.
                  </p>
                </motion.div>
              )}

              {/* Secondary — create via API */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontSize: 11, color: C.subtle }}>or create via API (needs Azure setup)</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              <motion.button whileTap={{ scale: 0.96 }}
                onClick={createMeeting}
                disabled={loading || !subject.trim()}
                style={{
                  width: '100%', padding: '9px 0', borderRadius: 10, border: `1.5px solid ${C.border}`,
                  background: C.bg, color: C.muted,
                  fontSize: 13, fontWeight: 600,
                  cursor: loading || !subject.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  transition: 'all 0.2s',
                }}>
                {loading ? (
                  <>
                    <motion.div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.15)', borderTop: `2px solid ${C.muted}` }}
                      animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }} />
                    Creating…
                  </>
                ) : (
                  <><CalendarDays size={13} /> Create Meeting Link (API)</>
                )}
              </motion.button>
            </>
          )}

          {/* ── Result ── */}
          {result && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  style={{ width: 56, height: 56, borderRadius: '50%', background: '#D1FAE5', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={26} color="#16A34A" />
                </motion.div>
                <h4 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Meeting Ready!</h4>
                <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{result.subject}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 10 }}>
                <Clock size={14} color={C.muted} />
                <span style={{ fontSize: 13, color: C.text }}>
                  {new Date(result.startDateTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' · '}
                  {new Date(result.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(result.endDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {attendees.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 10 }}>
                  <Users size={13} color={C.muted} />
                  <span style={{ fontSize: 13, color: C.muted }}>
                    {attendees.map(a => a.full_name || a.name).join(', ')}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', background: '#EEF2FF', borderRadius: 10, border: '1px solid #C7D2FE', marginBottom: 14 }}>
                <span style={{ flex: 1, fontSize: 12, color: '#4338CA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {result.joinUrl}
                </span>
                <button onClick={copyLink} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}>
                  {copied ? <Check size={14} color="#16A34A" /> : <Copy size={14} color="#4F46E5" />}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button whileTap={{ scale: 0.95 }} onClick={shareToChat}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
                    color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  <MessageSquare size={14} /> Share to Chat
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => window.open(result.joinUrl, '_blank')}
                  style={{
                    padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${C.border}`,
                    background: C.bg, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                  <ExternalLink size={13} /> Open
                </motion.button>
              </div>

              <button onClick={() => { setResult(null); setSubject(''); setAttendees([]); }}
                style={{ width: '100%', marginTop: 10, padding: '7px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: C.muted, fontWeight: 500 }}>
                + Schedule another meeting
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── MEETINGS PANE ─────────────────────────────────────────────────────────────
function MeetingsPane({ onNewMeeting, compact = false }) {
  const TIPS = [
    { icon: '📅', title: 'Seminars', desc: 'Host company-wide seminars with up to 1,000 attendees via Teams Live Events.' },
    { icon: '👥', title: 'Team Meetings', desc: 'Virtual project sync-ups with screen sharing, chat, and recording built in.' },
    { icon: '🖥️', title: 'Screen Share', desc: 'Present drawings, BOQ sheets, or site plans directly in the call.' },
    { icon: '🔗', title: 'Join Link', desc: 'Share the join link in any chat channel — no Teams account required for guests.' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      {/* Hero */}
      <div style={{
        padding: compact ? '16px 16px 14px' : '32px 32px 28px',
        background: 'linear-gradient(135deg, #4F46E5 0%, #2563EB 100%)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: compact ? 12 : 20 }}>
          <div style={{ width: compact ? 36 : 52, height: compact ? 36 : 52, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TeamsLogo size={compact ? 22 : 32} />
          </div>
          <div>
            <h2 style={{ fontSize: compact ? 15 : 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Microsoft Teams</h2>
            <p style={{ fontSize: compact ? 11 : 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Virtual meetings & seminars</p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={onNewMeeting}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: compact ? '9px 16px' : '12px 22px',
            borderRadius: 10, border: 'none',
            background: '#fff', color: '#4F46E5',
            fontSize: compact ? 13 : 15, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
          <CalendarDays size={compact ? 14 : 17} />
          Schedule a Meeting
        </motion.button>
      </div>

      {/* Tips grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 32px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          What you can do
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {TIPS.map(({ icon, title, desc }) => (
            <motion.div key={title}
              whileHover={{ y: -2, boxShadow: C.shadowMd }}
              style={{
                background: C.card, borderRadius: 14, padding: '16px 14px',
                border: `1px solid ${C.border}`, boxShadow: C.shadow,
                transition: 'box-shadow 0.2s',
              }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 5 }}>{title}</p>
              <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>{desc}</p>
            </motion.div>
          ))}
        </div>

        {/* How it works */}
        <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 28, marginBottom: 14 }}>
          How it works
        </p>
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {[
            { step: '1', text: 'Click "Schedule a Meeting" and fill in the title, date & time.' },
            { step: '2', text: "A Teams meeting is created instantly using your organisation's Microsoft 365 account." },
            { step: '3', text: 'Share the join link in any channel or DM — teammates can join with one click.' },
            { step: '4', text: 'The meeting opens directly in Microsoft Teams with full audio, video & screen share.' },
          ].map(({ step, text }, i) => (
            <div key={step} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px',
              borderTop: i > 0 ? `1px solid ${C.borderLight}` : 'none',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11.5, fontWeight: 800, color: C.primary,
              }}>{step}</div>
              <p style={{ fontSize: 13, color: C.text, lineHeight: 1.55, margin: 0 }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Admin note */}
        <div style={{
          marginTop: 20, padding: '12px 14px', background: '#FFF7ED',
          borderRadius: 12, border: '1px solid #FED7AA',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚙️</span>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: '#92400E', marginBottom: 3 }}>Admin Setup Required</p>
            <p style={{ fontSize: 12, color: '#B45309', lineHeight: 1.5, margin: 0 }}>
              Ensure the Azure AD app registration has <strong>OnlineMeetings.ReadWrite.All</strong> (Application) permission granted by an admin. Set <code style={{ background: '#FEF3C7', borderRadius: 3, padding: '0 4px' }}>TEAMS_ORGANIZER_EMAIL</code> in Railway env vars if users don't have Azure AD accounts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

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

