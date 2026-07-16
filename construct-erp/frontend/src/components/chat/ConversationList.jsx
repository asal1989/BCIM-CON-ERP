// src/components/chat/ConversationList.jsx — left sidebar: conv card row,
// the 3-way Chats/Calls/Meetings tab switcher, and the channel/DM list.
// Extracted from ERPChat.jsx (component split).
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MessageSquare, Phone, CalendarDays } from 'lucide-react';
import { Av } from './chatShared';
import { C, chColor, fmtRelTime, CONV_TABS, SIDEBAR_W } from './chatTheme';
import { CallsPane } from './CallsPane';
import { MeetingsPane } from './TeamsMeeting';

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

export function ConvListPanel({
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
                      timestamp={preview?.created_at ? fmtRelTime(preview.created_at) : ''}
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
                      timestamp={preview?.created_at ? fmtRelTime(preview.created_at) : ''}
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
