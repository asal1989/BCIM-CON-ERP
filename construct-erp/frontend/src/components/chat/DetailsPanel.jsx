// src/components/chat/DetailsPanel.jsx — right-side slide-in panel showing
// channel/DM info, pinned messages, members, and quick actions. Extracted
// from ERPChat.jsx (component split).
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, X, UserPlus, Bell, Settings } from 'lucide-react';
import { Av } from './chatShared';
import { C, chColor } from './chatTheme';

export function DetailsSection({ title, children }) {
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

export function DetailsPanel({ isChannel, channelInfo, dmPeer, employees, pinnedMessages, onTogglePin, onClose }) {
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
