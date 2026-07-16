// src/components/chat/PinnedBanner.jsx — sticky banner showing pinned messages
// in the active channel/DM (cycles through them on click). Extracted from
// ERPChat.jsx as part of splitting that 2,373-line file into per-component
// modules.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Pin, X } from 'lucide-react';
import { C } from './chatTheme';

export function PinnedBanner({ messages, onUnpin }) {
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
