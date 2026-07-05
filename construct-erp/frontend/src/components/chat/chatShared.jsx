// src/components/chat/chatShared.jsx — shared WhatsApp-style chat UI pieces,
// used by both the full /chat page (ERPChat.jsx) and the floating DM popups
// (ChatContext.jsx) so both surfaces render identically.
import { useRef } from 'react';
import {
  Send, Paperclip, Pin, X, Smile,
  FileText, FileSpreadsheet, Image as ImgIcon, File,
  Download, Loader2, CheckCheck, MessageSquare,
} from 'lucide-react';
import toast from 'react-hot-toast';

export function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

const AV_COLORS = ['#075e54','#128c7e','#1c6ea4','#6c3483','#1a5276','#784212','#186a3b','#7b241c','#4a235a','#0e6655'];
export function avColor(name = '') {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AV_COLORS.length; return AV_COLORS[h];
}

export function Av({ name = '', size = 40, photo }) {
  const fs = Math.round(size * 0.38);
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avColor(name), color: '#fff', fontWeight: 700, fontSize: fs, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, userSelect: 'none' }}>
      {getInitials(name)}
    </div>
  );
}

export function FileIcon({ name = '', size = 18 }) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const Icon = ['xlsx','xls','csv'].includes(ext) ? FileSpreadsheet : ['pdf'].includes(ext) ? FileText : ['png','jpg','jpeg','gif','webp'].includes(ext) ? ImgIcon : File;
  return <Icon size={size} />;
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtDateLabel(ts) {
  const d = new Date(ts), t = new Date(), y = new Date(t);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'TODAY';
  if (d.toDateString() === y.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}

export function fmtSize(n) {
  n = Number(n); if (!n || isNaN(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function withDateDividers(list) {
  const items = []; let lastDate = null;
  for (const msg of list) {
    const d = new Date(msg.created_at).toDateString();
    if (d !== lastDate) { items.push({ _type: 'divider', ts: msg.created_at, key: `div-${d}-${msg.id}` }); lastDate = d; }
    items.push({ ...msg, _type: 'msg' });
  }
  return items;
}

export async function downloadAttachment(url, filename) {
  if (!url) return;
  if (/^https?:\/\//i.test(url)) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
  try {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const bu = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = bu; a.download = filename || 'file';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(bu);
  } catch (e) {
    toast.error(e.message || 'Failed to download');
  }
}

// WhatsApp palette
export const WA = {
  bg:          '#efeae2',
  sidebar:     '#f0f2f5',
  myBubble:    '#dcf8c6',
  bubble:      '#ffffff',
  green:       '#00a884',
  greenBadge:  '#25d366',
  dark:        '#111b21',
  muted:       '#667781',
  divider:     '#e9edef',
  active:      '#ffffff',
  hover:       '#f5f6f6',
};

// ── Reusable message thread ────────────────────────────────────────────────────
export function MessageThread({
  items, loading, emptyText, searchQuery, userId, isDm, compact,
  hoveredMsg, onHover, onDownload, onTogglePin, onReact, typingUser, threadRef,
}) {
  return (
    <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: compact ? '10px 10px' : '12px 6%', background: WA.bg, display: 'flex', flexDirection: 'column' }}>
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: WA.muted }}>
          <Loader2 size={compact ? 16 : 22} className="animate-spin" style={{ marginRight: 8 }} />
          <span style={{ fontSize: compact ? 12 : 14 }}>Loading messages…</span>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: WA.muted }}>
          <MessageSquare size={compact ? 28 : 42} style={{ opacity: 0.18, marginBottom: 10 }} />
          <p style={{ fontSize: compact ? 12 : 14 }}>{emptyText}</p>
        </div>
      )}

      {!loading && items.map((item, idx) => {
        if (item._type === 'divider') {
          return (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 6px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.1)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', background: 'rgba(255,255,255,0.85)', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                {fmtDateLabel(item.ts)}
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.1)' }} />
            </div>
          );
        }

        const m = item;
        const prevItem = items[idx - 1];
        const prev = prevItem?._type === 'msg' ? prevItem : null;
        const grouped = prev && prev.sender_id === m.sender_id && (new Date(m.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000;
        const isMe = m.sender_id === userId;

        return (
          <div key={m.id}
            onMouseEnter={() => onHover(m.id)}
            onMouseLeave={() => onHover(null)}
            style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: grouped ? 2 : 10, position: 'relative' }}>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: compact ? '86%' : '72%', flexDirection: isMe ? 'row-reverse' : 'row' }}>

              {!isMe && !compact && (grouped ? <div style={{ width: 28, flexShrink: 0 }} /> : <Av name={m.sender_name} size={28} />)}

              <div style={{ position: 'relative' }}>
                <div style={{
                  background: isMe ? WA.myBubble : WA.bubble,
                  borderRadius: isMe
                    ? (grouped ? '12px' : '12px 2px 12px 12px')
                    : (grouped ? '12px' : '2px 12px 12px 12px'),
                  padding: '7px 11px 22px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  minWidth: 70,
                  position: 'relative',
                  wordBreak: 'break-word',
                }}>
                  {!isMe && !isDm && !grouped && (
                    <p style={{ fontSize: 12, fontWeight: 700, color: avColor(m.sender_name), marginBottom: 3 }}>{m.sender_name}</p>
                  )}

                  {m.text && (
                    <p style={{ fontSize: compact ? 13 : 14, color: WA.dark, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                      {searchQuery
                        ? m.text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                            part.toLowerCase() === searchQuery.toLowerCase()
                              ? <mark key={i} style={{ background: '#ffd97d', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
                              : part
                          )
                        : m.text}
                    </p>
                  )}

                  {m.file_name && (
                    <div style={{ marginTop: m.text ? 6 : 0 }}>
                      {m.file_url ? (
                        <button onClick={() => onDownload(m.file_url, m.file_name)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, background: isMe ? 'rgba(0,0,0,0.06)' : '#f0f2f5', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', width: '100%', textAlign: 'left', minWidth: compact ? 140 : 180 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 6, background: isMe ? 'rgba(0,0,0,0.1)' : '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: WA.muted }}>
                            <FileIcon name={m.file_name} size={18} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: WA.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name}</p>
                            {m.file_size && <p style={{ fontSize: 10, color: WA.muted }}>{m.file_size}</p>}
                          </div>
                          <Download size={14} color={WA.muted} style={{ flexShrink: 0 }} />
                        </button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '8px 10px', opacity: 0.55, color: WA.muted }}>
                          <File size={16} />
                          <span style={{ fontSize: 12 }}>{m.file_name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {(m.reactions || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      {m.reactions.map((r, i) => (
                        <span key={i} onClick={() => onReact(m.id, r.e)}
                          style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 999, padding: '1px 6px', cursor: 'pointer', background: 'rgba(255,255,255,0.65)', userSelect: 'none' }}>
                          {r.e} {r.c}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ position: 'absolute', bottom: 5, right: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 10, color: isMe ? 'rgba(0,0,0,0.4)' : WA.muted, whiteSpace: 'nowrap' }}>{fmtTime(m.created_at)}</span>
                    {isMe && <CheckCheck size={13} color="#53bdeb" />}
                  </div>

                  {m.pinned && (
                    <span style={{ position: 'absolute', top: -7, [isMe ? 'left' : 'right']: -7, background: '#e6a817', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Pin size={8} color="#fff" />
                    </span>
                  )}
                </div>

                {hoveredMsg === m.id && (
                  <div style={{
                    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                    [isMe ? 'left' : 'right']: compact ? -80 : -96,
                    display: 'flex', alignItems: 'center', gap: 2,
                    background: '#fff', border: `1px solid ${WA.divider}`, borderRadius: 20,
                    padding: '3px 6px', boxShadow: '0 2px 10px rgba(0,0,0,0.12)', zIndex: 20,
                  }}>
                    {['👍','✅','🎉'].map(e => (
                      <button key={e} onClick={() => onReact(m.id, e)}
                        style={{ width: compact ? 24 : 28, height: compact ? 24 : 28, border: 'none', background: 'none', cursor: 'pointer', fontSize: compact ? 12 : 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {e}
                      </button>
                    ))}
                    {!compact && <>
                      <div style={{ width: 1, height: 16, background: WA.divider, margin: '0 2px' }} />
                      <button onClick={() => onTogglePin(m.id)}
                        style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Pin size={13} color={m.pinned ? '#b7860b' : WA.muted} />
                      </button>
                    </>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {typingUser && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 8 }}>
          <div style={{ background: WA.bubble, borderRadius: '2px 12px 12px 12px', padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {[0,1,2].map(i => (
              <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: WA.muted, display: 'inline-block', animation: `waTyping 1.2s ${i * 0.2}s infinite` }} />
            ))}
            <span style={{ fontSize: 12, color: WA.muted, marginLeft: 4 }}>{typingUser} is typing…</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable composer ──────────────────────────────────────────────────────────
export function Composer({ inputVal, onInputChange, onKeyDown, onSend, pendingFiles, onRemoveFile, onPickFiles, disabled, textRef, compact }) {
  const fileRef = useRef(null);
  return (
    <div style={{ padding: compact ? '6px 8px' : '8px 12px', background: WA.sidebar, borderTop: `1px solid ${WA.divider}`, flexShrink: 0 }}>
      {pendingFiles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {pendingFiles.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${WA.divider}`, borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
              {f.uploading ? <Loader2 size={13} className="animate-spin" /> : <FileIcon name={f.name} size={13} />}
              <span style={{ color: WA.dark, fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              {f.uploading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 60, height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${f.progress || 0}%`, height: '100%', background: WA.green, transition: 'width 0.2s' }} />
                  </div>
                  <span style={{ color: WA.muted, fontSize: 11 }}>{f.progress || 0}%</span>
                </div>
              ) : <span style={{ color: WA.muted }}>{f.size}</span>}
              {!f.uploading && (
                <button onClick={() => onRemoveFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: WA.muted, display: 'flex', padding: 0 }}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 4 }}>
          <button onClick={() => fileRef.current?.click()}
            style={{ width: compact ? 32 : 38, height: compact ? 32 : 38, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: WA.muted }}>
            <Paperclip size={compact ? 17 : 20} />
          </button>
          {!compact && (
            <button style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: WA.muted }}>
              <Smile size={20} />
            </button>
          )}
        </div>

        <div style={{ flex: 1, background: '#fff', borderRadius: 24, border: `1px solid ${WA.divider}`, display: 'flex', alignItems: 'flex-end', padding: '0 14px' }}>
          <textarea ref={textRef} value={inputVal} onChange={onInputChange} onKeyDown={onKeyDown}
            placeholder="Type a message" rows={1}
            style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: compact ? 13 : 14, color: WA.dark, background: 'none', lineHeight: 1.5, minHeight: compact ? 34 : 40, maxHeight: 120, paddingTop: compact ? 6 : 8, paddingBottom: compact ? 6 : 8, fontFamily: 'inherit' }}
          />
        </div>

        <button onClick={onSend} disabled={disabled}
          style={{
            width: compact ? 38 : 44, height: compact ? 38 : 44, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
            background: !disabled ? WA.green : '#ccc',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}>
          <Send size={compact ? 15 : 18} color="#fff" style={{ marginLeft: 2 }} />
        </button>
      </div>

      <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files);
          e.target.value = '';
          if (files.length) onPickFiles(files);
        }}
      />
    </div>
  );
}
