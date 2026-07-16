// src/components/chat/NotifBanner.jsx — top-of-page prompt to enable desktop
// notifications. Extracted from ERPChat.jsx (component split).
import { motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { C } from './chatTheme';

export function NotifBanner({ perm, onEnable, onDismiss }) {
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
