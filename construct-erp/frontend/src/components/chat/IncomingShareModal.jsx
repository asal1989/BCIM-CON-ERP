// src/components/chat/IncomingShareModal.jsx — shown on the viewer's side when
// someone initiates a screen share session with them.
import { Monitor } from 'lucide-react';
import { Av } from './chatShared';

export default function IncomingShareModal({ shareInfo, onAccept, onDecline }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 210,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, padding: '32px 36px',
        maxWidth: 340, width: '90vw', textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
      }}>
        <Av name={shareInfo?.peerName || '?'} size={72} photo={shareInfo?.peerPhoto} />

        <p style={{ fontWeight: 700, fontSize: 20, marginTop: 14, color: '#111827', letterSpacing: '-0.01em' }}>
          {shareInfo?.peerName}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
          <Monitor size={15} color="#4F46E5" />
          <p style={{ fontSize: 14, color: '#4F46E5', fontWeight: 600 }}>wants to share their screen</p>
        </div>

        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
          Move your mouse over the stream to use the laser pointer
        </p>

        <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'center' }}>
          <button
            onClick={onDecline}
            style={{
              padding: '10px 26px', borderRadius: 10,
              border: '1.5px solid #E5E7EB', background: '#fff',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151',
            }}>
            Decline
          </button>
          <button
            onClick={onAccept}
            style={{
              padding: '10px 26px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#4F46E5,#4338CA)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#fff',
              boxShadow: '0 4px 14px rgba(79,70,229,0.35)',
            }}>
            View screen
          </button>
        </div>
      </div>
    </div>
  );
}
