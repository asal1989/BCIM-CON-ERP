// src/components/common/InstallBanner.jsx
// Shows an install hint banner for iOS Safari and a native install prompt for Android/Chrome.
// Dismissed state is persisted in localStorage so it only shows once.
import React, { useState, useEffect } from 'react';

const DISMISS_KEY = 'bcim-pwa-install-dismissed';

export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Don't show if already dismissed
    if (localStorage.getItem(DISMISS_KEY)) return;

    // Don't show if already running as installed PWA
    const isStandalone =
      window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    const ua = navigator.userAgent.toLowerCase();

    // iOS Safari detection — iPhone/iPad on Safari, not Chrome/Firefox wrappers
    const iosDevice = /iphone|ipad|ipod/.test(ua);
    const safariOnly = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    if (iosDevice && safariOnly) {
      setIsIOS(true);
      // Small delay so the app feels loaded first
      setTimeout(() => setShow(true), 3000);
      return;
    }

    // Android / Chrome / desktop — use native beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShow(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  };

  const installApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  if (!show) return null;

  // ── iOS banner — full-width at bottom ────────────────────────────────────
  if (isIOS) {
    return (
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: 'linear-gradient(135deg, #0a2057 0%, #1e3a8a 100%)',
          color: '#fff',
          padding: '14px 16px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.35)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <img
          src="/bcim-logo.png"
          alt="BCIM"
          style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: '#fff', padding: 3 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
            Install BCIM ERP on your iPhone
          </div>
          <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.4 }}>
            Tap the&nbsp;<strong style={{ fontSize: 15 }}>⬆</strong>&nbsp;<strong>Share</strong> button below,
            then choose <strong>"Add to Home Screen"</strong>
          </div>
        </div>
        <button
          onClick={dismiss}
          style={{
            flexShrink: 0, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff', borderRadius: 8, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 16, fontWeight: 700,
          }}
          aria-label="Dismiss"
        >✕</button>
      </div>
    );
  }

  // ── Android / Chrome — floating card ─────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 9999,
        background: 'linear-gradient(135deg, #0a2057 0%, #1e3a8a 100%)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: 14,
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <img
        src="/bcim-logo.png"
        alt="BCIM"
        style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: '#fff', padding: 3 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Install BCIM ERP</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>Add to home screen for quick access</div>
      </div>
      <button
        onClick={installApp}
        style={{
          flexShrink: 0, background: '#fff', color: '#0a2057', border: 'none',
          borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
          fontWeight: 700, fontSize: 13,
        }}
      >
        Install
      </button>
      <button
        onClick={dismiss}
        style={{
          flexShrink: 0, background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
          fontSize: 18, lineHeight: 1, padding: '4px',
        }}
        aria-label="Dismiss"
      >✕</button>
    </div>
  );
}
