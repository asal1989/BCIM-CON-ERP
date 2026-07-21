// src/pages/auth/SelectProjectPage.jsx
// Shown right after login (or via Switch Project button).
// Lists the projects the user has access to and stashes the picked one
// into the auth store + sessionStorage so the axios interceptor can
// inject project_id into all subsequent requests.

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, Search, ArrowRight, Loader2, AlertCircle, LogOut } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { projectAPI } from '../../api/client';
import toast from 'react-hot-toast';

export default function SelectProjectPage() {
  const navigate = useNavigate();
  const { user, setSelectedProject, logout } = useAuthStore();

  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [pickingId, setPickingId] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    // Temporarily clear any stale selected project so this fetch is unscoped
    sessionStorage.removeItem('selectedProjectId');
    projectAPI.list({ status: 'active' })
      .then(({ data }) => {
        if (!alive) return;
        const list = data?.data || data || [];
        setProjects(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.response?.data?.error || 'Failed to load your projects.');
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.project_code || '').toLowerCase().includes(q) ||
      (p.city || '').toLowerCase().includes(q) ||
      (p.client_name || '').toLowerCase().includes(q)
    );
  }, [projects, search]);

  function handlePick(p, silent = false) {
    setPickingId(p.id);
    setSelectedProject(p);
    if (!silent) toast.success(`Loaded ${p.name}`);
    // give the store a tick to commit, then go to the user's module home
    setTimeout(() => navigate('/', { replace: true }), 80);
  }

  return (
    <div style={styles.root}>
      <style>{keyframes}</style>

      <div style={styles.topBar}>
        <div style={styles.logoBlock}>
          <div style={styles.logoBox}><img src="/bcim-logo.png" alt="BCIM" style={styles.logoImg} /></div>
          <div>
            <div style={styles.brandTop}>BCIM ENGINEERING</div>
            <div style={styles.brandSub}>Construct ERP</div>
          </div>
        </div>
        <div style={styles.userBlock}>
          <div style={{ textAlign: 'right' }}>
            <div style={styles.userName}>{user?.name || 'User'}</div>
            <div style={styles.userEmail}>{user?.email}</div>
          </div>
          <button type="button" style={styles.logoutBtn} onClick={logout} title="Sign out">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      <div style={styles.body}>
        <div style={styles.headline}>
          <span style={styles.tag}>STEP 2</span>
          <h1 style={styles.h1}>Choose your project</h1>
          <p style={styles.sub}>
            Select the project you want to work on. All data — bills, stores, reports — will be scoped
            to this project for your session. You can switch any time.
          </p>
        </div>

        {/* Search */}
        <div style={styles.searchWrap}>
          <Search size={15} style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by name, code, city or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {/* States */}
        {loading && (
          <div style={styles.stateBox}>
            <Loader2 size={20} className="spin" />
            <span>Loading your projects…</span>
          </div>
        )}

        {!loading && error && (
          <div style={{ ...styles.stateBox, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={styles.stateBox}>
            <Building2 size={20} />
            <div>
              <div style={{ fontWeight: 700, color: '#0a2057' }}>No projects assigned</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Please contact your administrator to be added to a project.
              </div>
            </div>
          </div>
        )}

        {/* Project grid */}
        {!loading && !error && filtered.length > 0 && (
          <div style={styles.grid}>
            {filtered.map((p) => {
              const picking = pickingId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePick(p)}
                  disabled={picking}
                  className="project-card"
                  style={{ ...styles.card, ...(picking ? { borderColor: '#0a2057', boxShadow: '0 10px 30px rgba(10,32,87,0.15)' } : {}) }}
                >
                  <div style={styles.cardHead}>
                    <div style={styles.cardIcon}><Building2 size={18} /></div>
                    <span style={styles.cardCode}>{p.project_code || '—'}</span>
                  </div>
                  <div style={styles.cardName}>{p.name}</div>
                  <div style={styles.cardClient}>{p.client_name || '—'}</div>
                  <div style={styles.cardMeta}>
                    <MapPin size={11} />
                    <span>{p.city || p.location || 'Location N/A'}</span>
                  </div>
                  <div style={styles.cardFooter}>
                    <span style={styles.cardStatus(p.status)}>{p.status || 'active'}</span>
                    <span style={styles.openLink}>
                      {picking ? 'Loading…' : 'Open'} <ArrowRight size={13} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={styles.footer}>BCIM Construct ERP · v3.0</div>
    </div>
  );
}

const keyframes = `
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.9s linear infinite; }
  .project-card:hover:not(:disabled) { transform: translateY(-3px); border-color: #0a2057 !important; box-shadow: 0 12px 32px rgba(10,32,87,0.14); }
  .project-card:active:not(:disabled) { transform: translateY(-1px); }
`;

const styles = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f5f8fd 0%, #eef3fb 100%)',
    fontFamily: "'Geist Variable', -apple-system, sans-serif",
    color: '#0f172a',
    display: 'flex', flexDirection: 'column',
  },
  topBar: {
    padding: '14px 32px',
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 1px 3px rgba(10,32,87,0.04)',
  },
  logoBlock: { display: 'flex', alignItems: 'center', gap: 12 },
  logoBox: {
    width: 42, height: 42, borderRadius: 9, background: '#0a2057',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5,
  },
  logoImg: { width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) invert(1)' },
  brandTop: { fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', color: '#0a2057' },
  brandSub: { fontSize: 10, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 },

  userBlock: { display: 'flex', alignItems: 'center', gap: 14 },
  userName:  { fontSize: 13, fontWeight: 700, color: '#0a2057' },
  userEmail: { fontSize: 11, color: '#64748b', marginTop: 1 },
  logoutBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', border: '1px solid #e2e8f0', background: '#fff',
    borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569',
  },

  body: { flex: 1, padding: '36px 32px 60px', maxWidth: 1240, width: '100%', margin: '0 auto' },

  headline: { textAlign: 'center', marginBottom: 22 },
  tag: {
    display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
    color: '#0a2057', background: '#eef3fb', border: '1px solid #c7d8f5',
    padding: '3px 10px', borderRadius: 999, marginBottom: 10,
  },
  h1: { fontSize: 28, fontWeight: 800, color: '#0a2057', letterSpacing: '-0.02em', marginBottom: 6 },
  sub: { fontSize: 13, color: '#64748b', maxWidth: 580, margin: '0 auto', lineHeight: 1.55 },

  searchWrap: {
    position: 'relative', maxWidth: 460, margin: '0 auto 22px',
  },
  searchIcon: {
    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8',
  },
  searchInput: {
    width: '100%', padding: '12px 14px 12px 40px',
    border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13.5,
    background: '#fff', outline: 'none', fontFamily: 'inherit',
    boxShadow: '0 1px 2px rgba(10,32,87,0.03)',
  },

  stateBox: {
    maxWidth: 460, margin: '40px auto', padding: '18px 22px',
    border: '1.5px dashed #cbd5e1', borderRadius: 12, background: '#fff',
    display: 'flex', alignItems: 'center', gap: 12, color: '#475569',
    fontSize: 13.5,
  },

  grid: {
    display: 'grid', gap: 16,
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  },
  card: {
    textAlign: 'left', background: '#fff',
    border: '1.5px solid #e2e8f0', borderRadius: 14,
    padding: 18, cursor: 'pointer',
    transition: 'transform 0.18s, border-color 0.18s, box-shadow 0.18s',
    boxShadow: '0 1px 3px rgba(10,32,87,0.04)',
    fontFamily: 'inherit',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardIcon: {
    width: 36, height: 36, borderRadius: 9, background: '#eef3fb',
    color: '#0a2057', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cardCode: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b',
    background: '#f1f5f9', padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase',
  },
  cardName: { fontSize: 15, fontWeight: 800, color: '#0a2057', lineHeight: 1.3, marginTop: 4 },
  cardClient: { fontSize: 12, color: '#475569' },
  cardMeta: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 11, color: '#64748b', marginTop: 2,
  },
  cardFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, paddingTop: 10, borderTop: '1px dashed #e2e8f0',
  },
  cardStatus: (status) => ({
    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '3px 8px', borderRadius: 999,
    color:      status === 'active'    ? '#16a34a' : status === 'on_hold' ? '#d97706' : '#64748b',
    background: status === 'active'    ? '#dcfce7' : status === 'on_hold' ? '#fef3c7' : '#f1f5f9',
  }),
  openLink: {
    fontSize: 12, fontWeight: 700, color: '#0a2057',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  },

  footer: {
    textAlign: 'center', padding: '14px 0',
    fontSize: 10.5, color: '#94a3b8', letterSpacing: '0.05em',
  },
};
