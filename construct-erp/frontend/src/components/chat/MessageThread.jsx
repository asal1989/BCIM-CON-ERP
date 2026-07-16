// src/components/chat/MessageThread.jsx — message bubbles, file attachments,
// @mention highlighting, date dividers, typing indicator, and the scrollable
// message list. Extracted from ERPChat.jsx (component split).
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Download, Pin, CheckCheck, MessageSquare } from 'lucide-react';
import { Av, downloadAttachment } from './chatShared';
import { C, fmtFull, REACTIONS_LIST } from './chatTheme';

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

// Highlight @mentions in message text
function renderMentionText(text) {
  if (!text) return null;
  const parts = text.split(/(@[A-Za-z][A-Za-z0-9 _]*)/g);
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} style={{ color: '#60A5FA', fontWeight: 600, background: 'rgba(96,165,250,0.15)', borderRadius: 4, padding: '0 3px' }}>{p}</span>
      : p
  );
}

function MsgBubble({ msg, isOwn, showAvatar, showName, onReact, onPin, isDm, currentUserId }) {
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
            <p style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', margin: 0 }}>
              {renderMentionText(msg.text)}
            </p>
          )}
          {hasFile && (
            <FileBubble fileName={msg.file_name} fileSize={msg.file_size} fileUrl={msg.file_url} onDownload={downloadAttachment} />
          )}

          {/* Timestamp + status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 5 }}>
            <span style={{ fontSize: 10.5, color: isOwn ? 'rgba(255,255,255,0.6)' : C.subtle }}>
              {fmtFull(msg.created_at)}
            </span>
            {isOwn && isDm && (
              (msg.read_by && Array.isArray(msg.read_by) && msg.read_by.some(id => id !== currentUserId))
                ? <CheckCheck size={13} color="#34D399" title="Read" />
                : <CheckCheck size={13} color="rgba(255,255,255,0.5)" title="Delivered" />
            )}
            {isOwn && !isDm && <CheckCheck size={13} color="rgba(255,255,255,0.7)" />}
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

export function PremiumMessageList({ items, loading, emptyText, userId, onReact, onPin, threadRef, typingUser, isDm }) {
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
            onReact={onReact} onPin={onPin}
            isDm={isDm} currentUserId={userId} />
        );
      })}
      {typingUser && <TypingIndicator name={typingUser} />}
    </div>
  );
}
