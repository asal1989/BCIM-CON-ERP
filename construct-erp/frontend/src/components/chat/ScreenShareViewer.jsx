// src/components/chat/ScreenShareViewer.jsx — fullscreen view for the VIEWER.
// Mouse movement over the video sends {x,y} ratios via DataChannel so the sharer
// sees a laser dot in their preview window at the same position.
import { useRef, useEffect, useState } from 'react';
import { Monitor, X, MousePointer, Maximize2, Minimize2 } from 'lucide-react';

export default function ScreenShareViewer({ viewerStream, shareInfo, onStop, sendPointer }) {
  const videoRef   = useRef(null);
  const [compact, setCompact] = useState(false); // mini mode (bottom-right pip)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = viewerStream || null;
  }, [viewerStream]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top)  / rect.height;
    sendPointer(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
  };

  if (compact) {
    return (
      <div style={{
        position: 'fixed', bottom: 100, right: 20, zIndex: 200,
        width: 300, background: '#0d1117',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
        overflow: 'hidden', boxShadow: '0 20px 56px rgba(0,0,0,0.65)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(5,10,20,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <Monitor size={13} color="#60a5fa" />
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareInfo?.peerName}'s screen</span>
          <button onClick={() => setCompact(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex' }} title="Expand">
            <Maximize2 size={13} />
          </button>
          <button onClick={onStop} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <X size={10} /> Stop
          </button>
        </div>
        <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000', cursor: 'crosshair' }} onMouseMove={handleMouseMove}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#050a14', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 18px', background: 'rgba(5,10,20,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
      }}>
        <Monitor size={18} color="#60a5fa" />
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
          {shareInfo?.peerName}'s screen
        </span>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8,
          background: 'rgba(96,165,250,0.12)', borderRadius: 6,
          padding: '3px 10px',
        }}>
          <MousePointer size={12} color="#60a5fa" />
          <span style={{ color: '#60a5fa', fontSize: 11, fontWeight: 600 }}>LASER POINTER — move mouse over screen</span>
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => setCompact(true)} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 14px', background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
          color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          <Minimize2 size={13} /> Mini
        </button>

        <button onClick={onStop} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 16px',
          background: 'linear-gradient(135deg,#EF4444,#DC2626)',
          border: 'none', borderRadius: 8, color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(239,68,68,0.3)',
        }}>
          <X size={14} /> Stop viewing
        </button>
      </div>

      {/* Video area — mouse tracked for laser pointer */}
      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'crosshair', background: '#050a14' }}
        onMouseMove={handleMouseMove}
      >
        <video ref={videoRef} autoPlay playsInline muted
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' }} />

        {!viewerStream && (
          <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <Monitor size={52} color="rgba(255,255,255,0.1)" />
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Waiting for stream…</p>
          </div>
        )}
      </div>
    </div>
  );
}
