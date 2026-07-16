// src/components/chat/PremiumComposer.jsx — message input with @mention
// autocomplete, file attach/drag-drop/paste, and send button. Extracted from
// ERPChat.jsx (component split).
import { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, Smile, Send, X, Check } from 'lucide-react';
import { Av } from './chatShared';
import { C } from './chatTheme';

export function PremiumComposer({ value, onChange, onKeyDown, onSend, files, onRemoveFile, onPickFiles, disabled, textRef, placeholder, employees = [] }) {
  const fileInputRef   = useRef(null);
  const [mentionOpen,  setMentionOpen]  = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  const mentionList = useMemo(() => {
    if (!mentionQuery && !mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return employees.filter(e => {
      const n = (e.full_name || e.name || '').toLowerCase();
      return !q || n.includes(q);
    }).slice(0, 6);
  }, [mentionQuery, mentionOpen, employees]);

  const handleChange = useCallback((e) => {
    onChange(e);
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@([A-Za-z0-9 ]*)$/);
    if (match) { setMentionQuery(match[1]); setMentionOpen(true); }
    else { setMentionOpen(false); setMentionQuery(''); }
  }, [onChange]);

  const selectMention = useCallback((emp) => {
    const name = emp.full_name || emp.name;
    const cursor = textRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor).replace(/@([A-Za-z0-9 ]*)$/, `@${name} `);
    const after  = value.slice(cursor);
    onChange({ target: { value: before + after } });
    setMentionOpen(false);
    setTimeout(() => { textRef.current?.focus(); textRef.current && (textRef.current.selectionStart = textRef.current.selectionEnd = before.length); }, 10);
  }, [value, onChange, textRef]);

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
      style={{ padding: '10px 16px 14px', background: C.card, borderTop: `1px solid ${C.border}`, flexShrink: 0, position: 'relative' }}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* @mention dropdown */}
      <AnimatePresence>
        {mentionOpen && mentionList.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            style={{
              position: 'absolute', bottom: '100%', left: 16, right: 16, zIndex: 50,
              background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
              boxShadow: C.shadowLg, overflow: 'hidden', marginBottom: 6,
            }}>
            <div style={{ padding: '6px 12px 4px', borderBottom: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.subtle }}>Mention someone</span>
            </div>
            {mentionList.map(emp => (
              <button key={emp.id} onMouseDown={() => selectMention(emp)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  borderBottom: `1px solid ${C.borderLight}`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <Av name={emp.full_name || emp.name} size={28} photo={emp.profile_photo_url} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{emp.full_name || emp.name}</p>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{emp.designation_name || emp.designation || ''}</p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
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
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Escape') setMentionOpen(false); onKeyDown(e); }}
          onPaste={handlePaste}
          placeholder={placeholder || 'Type a message… use @ to mention someone'}
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
