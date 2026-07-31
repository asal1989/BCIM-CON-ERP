// src/pages/auth/OAuthAuthorizePage.jsx — the ERP's OpenID Connect
// "authorization_endpoint". An external relying party (currently: Mattermost,
// configured with this exact URL under System Console > Authentication >
// OpenID Connect) redirects the user's browser here with the standard OIDC
// query params.
//
// The ERP is an SPA that keeps its own session as a JWT in localStorage, not
// a cookie — so a plain server-side redirect can't see whether the user is
// already logged in. This page bridges that: it's the one place a browser
// navigation (not a fetch/XHR) needs to know about the stored token.
//   - Already logged in  → silently exchange for a one-time code, bounce the
//                           browser straight back to the relying party.
//   - Not logged in      → send to /login?next=<this URL>, so after a normal
//                           credentials login the user lands back here and
//                           the exchange completes automatically.
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/client';

export default function OAuthAuthorizePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        const next = window.location.pathname + window.location.search;
        navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }

      const payload = {
        client_id: searchParams.get('client_id'),
        redirect_uri: searchParams.get('redirect_uri'),
        response_type: searchParams.get('response_type') || 'code',
        scope: searchParams.get('scope') || 'openid',
        state: searchParams.get('state'),
        nonce: searchParams.get('nonce'),
      };

      if (!payload.client_id || !payload.redirect_uri) {
        setError('This link is missing required parameters (client_id / redirect_uri). Ask IT to check the SSO configuration.');
        return;
      }

      try {
        const { data } = await api.post('/oauth/exchange', payload);
        window.location.href = data.redirect;
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401) {
          const next = window.location.pathname + window.location.search;
          navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
          return;
        }
        setError(err?.response?.data?.error || 'Could not complete sign-in. Please try again.');
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#0a2057', color: '#fff', textAlign: 'center', padding: 24,
    }}>
      {!error ? (
        <>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.25)', borderTopColor: '#c9a227',
            animation: 'oauth-spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Signing you in…</p>
          <style>{`@keyframes oauth-spin { to { transform: rotate(360deg); } }`}</style>
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, maxWidth: 420, lineHeight: 1.6 }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontSize: 13, cursor: 'pointer' }}
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
