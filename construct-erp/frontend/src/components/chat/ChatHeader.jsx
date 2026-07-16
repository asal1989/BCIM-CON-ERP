// src/components/chat/ChatHeader.jsx — top bar for the active channel/DM
// (avatar, title, call/screen-share/search/pin/details actions). Extracted
// from ERPChat.jsx (component split).
import { motion } from 'framer-motion';
import { ArrowLeft, Phone, Video, Monitor, Search, Pin, Info } from 'lucide-react';
import { Av } from './chatShared';
import { C } from './chatTheme';

export function ActionBtn({ icon: Icon, color, bg, disabled, title, onClick }) {
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

export function ChatHeader({
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
