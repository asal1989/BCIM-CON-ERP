// src/components/chat/TeamsMeeting.jsx — Teams meeting creation modal
// (participant picker + deep-link fallback) and the Meetings sidebar/tab
// pane with meeting history. Extracted from ERPChat.jsx (component split).
import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, Copy, ExternalLink, Clock, Check, X, Search, UserPlus,
  MessageSquare, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { Av } from './chatShared';
import { C } from './chatTheme';

export function TeamsLogo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="#5058E5"/>
      <text x="4" y="17" fontFamily="Arial,sans-serif" fontWeight="800" fontSize="13" fill="#fff">T</text>
      <circle cx="17" cy="7" r="3.5" fill="#fff"/>
      <rect x="12.5" y="11" width="9" height="7" rx="2" fill="#fff"/>
    </svg>
  );
}

export function TeamsMeetingModal({ onClose, onMeetingCreated, employees = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = (() => {
    const h = new Date().getHours() + 1;
    return `${String(h % 24).padStart(2, '0')}:00`;
  })();

  const [subject,    setSubject]    = useState('');
  const [dateStr,    setDateStr]    = useState(today);
  const [startTime,  setStartTime]  = useState(defaultStart);
  const [endTime,    setEndTime]    = useState(`${String((parseInt(defaultStart) + 1) % 24).padStart(2, '0')}:00`);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [copied,     setCopied]     = useState(false);
  const [permError,  setPermError]  = useState(null);
  const [attendees,  setAttendees]  = useState([]);
  const [empSearch,  setEmpSearch]  = useState('');
  const [empOpen,    setEmpOpen]    = useState(false);
  const [opened,     setOpened]     = useState(false);

  const empList = useMemo(() => {
    const q = empSearch.toLowerCase();
    return employees
      .filter(e => {
        if (attendees.find(a => a.id === e.id)) return false;
        const name = (e.full_name || e.name || '').toLowerCase();
        const des  = (e.designation_name || e.designation || '').toLowerCase();
        return !q || name.includes(q) || des.includes(q);
      })
      .slice(0, 7);
  }, [employees, empSearch, attendees]);

  const removeAttendee = id => setAttendees(prev => prev.filter(a => a.id !== id));
  const addAttendee    = emp => { setAttendees(prev => [...prev, emp]); setEmpSearch(''); };

  // Build Teams deep-link as fallback (works without API permissions)
  const teamsDeepLink = useMemo(() => {
    const start = new Date(`${dateStr}T${startTime}:00`).toISOString();
    const end   = new Date(`${dateStr}T${endTime}:00`).toISOString();
    const emails = attendees.map(a => a.email).filter(Boolean).join(',');
    return `https://teams.microsoft.com/l/meeting/new?subject=${encodeURIComponent(subject || 'Team Meeting')}&startTime=${encodeURIComponent(start)}&endTime=${encodeURIComponent(end)}${emails ? `&attendees=${encodeURIComponent(emails)}` : ''}`;
  }, [subject, dateStr, startTime, endTime, attendees]);

  const createMeeting = async () => {
    if (!subject.trim()) { toast.error('Please enter a meeting title'); return; }
    setLoading(true); setPermError(null);
    try {
      const startDT = new Date(`${dateStr}T${startTime}:00`).toISOString();
      const endDT   = new Date(`${dateStr}T${endTime}:00`).toISOString();
      const res = await api.post('/chat/teams-meeting', {
        subject:       subject.trim(),
        startDateTime: startDT,
        endDateTime:   endDT,
        attendeeEmails: attendees.map(a => a.email).filter(Boolean),
      });
      setResult(res.data.meeting);
      toast.success('Teams meeting created!');
    } catch (err) {
      const data = err?.response?.data || {};
      if (data.isPermissionError || err?.response?.status === 403) {
        setPermError(data);
      } else {
        toast.error(data.error || 'Failed to create meeting');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(result.joinUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareToChat = () => {
    if (!result) return;
    const start = new Date(result.startDateTime);
    const end   = new Date(result.endDateTime);
    const attendeeNames = attendees.map(a => a.full_name || a.name).filter(Boolean).join(', ');
    const text = [
      `📅 Teams Meeting: ${result.subject}`,
      `🕐 ${start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      attendeeNames ? `👥 ${attendeeNames}` : '',
      `🔗 Join: ${result.joinUrl}`,
    ].filter(Boolean).join('\n');
    onMeetingCreated(text);
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '9px 11px', borderRadius: 10,
    border: `1.5px solid ${C.border}`, outline: 'none',
    fontSize: 13.5, color: C.text, background: C.bg, boxSizing: 'border-box',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        style={{
          width: '100%', maxWidth: 500, background: C.card,
          borderRadius: 20, boxShadow: '0 28px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '18px 20px 16px',
          background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
        }}>
          <TeamsLogo size={34} />
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>New Teams Meeting</h3>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Schedule a virtual meeting for your team</p>
          </div>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} color="#fff" />
          </button>
        </div>

        <div style={{ padding: '18px 20px 20px' }}>
          {/* ── Permission error ── */}
          {permError && !result && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              style={{ background: '#FEF9F0', borderRadius: 12, border: '1px solid #FCD34D', padding: '12px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 12.5, color: '#92400E', margin: 0 }}>
                ⚠️ API permission not set up yet — use <strong>Open in Teams</strong> below to create the meeting now.
              </p>
            </motion.div>
          )}

          {/* ── Create form ── */}
          {!result && (
            <>
              {/* Title */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meeting Title</label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Weekly Standup, Project Seminar, Site Review…"
                  autoFocus
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = C.primary}
                  onBlur={e => e.target.style.borderColor = C.border}
                  onKeyDown={e => e.key === 'Enter' && !loading && createMeeting()} />
              </div>

              {/* Date + times */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Date', type: 'date', val: dateStr, set: setDateStr },
                  { label: 'Start', type: 'time', val: startTime, set: setStartTime },
                  { label: 'End', type: 'time', val: endTime, set: setEndTime },
                ].map(({ label, type, val, set }) => (
                  <div key={label}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                    <input type={type} value={val} onChange={e => set(e.target.value)}
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = C.primary}
                      onBlur={e => e.target.style.borderColor = C.border} />
                  </div>
                ))}
              </div>

              {/* Participants */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Participants <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— optional</span>
                </label>

                {/* Selected chips */}
                {attendees.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {attendees.map(a => (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: C.primaryLight, border: `1px solid ${C.primaryBorder}`,
                        borderRadius: 999, padding: '3px 10px 3px 6px',
                      }}>
                        <Av name={a.full_name || a.name} size={20} photo={a.profile_photo_url} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.primary }}>
                          {a.full_name || a.name}
                        </span>
                        <button onClick={() => removeAttendee(a.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: C.primary }}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search input */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, borderRadius: 10, padding: '8px 12px', border: `1.5px solid ${empOpen ? C.primary : C.border}`, transition: 'border-color 0.15s' }}>
                    <Search size={13} color={C.subtle} />
                    <input
                      value={empSearch}
                      onChange={e => { setEmpSearch(e.target.value); setEmpOpen(true); }}
                      onFocus={() => setEmpOpen(true)}
                      onBlur={() => setTimeout(() => setEmpOpen(false), 150)}
                      placeholder="Search team members to invite…"
                      style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: C.text }}
                    />
                    <UserPlus size={13} color={C.muted} />
                  </div>

                  {/* Dropdown */}
                  <AnimatePresence>
                    {empOpen && empList.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                          background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
                          boxShadow: C.shadowLg, overflow: 'hidden', marginTop: 4,
                        }}>
                        {empList.map(emp => (
                          <button key={emp.id}
                            onMouseDown={() => addAttendee(emp)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                              padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer',
                              textAlign: 'left', borderBottom: `1px solid ${C.borderLight}`,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.bg}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <Av name={emp.full_name || emp.name} size={32} photo={emp.profile_photo_url} />
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{emp.full_name || emp.name}</p>
                              <p style={{ fontSize: 11.5, color: C.muted }}>{emp.designation_name || emp.designation || emp.email || ''}</p>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Primary action — Open in Teams */}
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (!subject.trim()) { toast.error('Please enter a meeting title'); return; }
                  window.open(teamsDeepLink, '_blank');
                  setOpened(true);
                }}
                disabled={!subject.trim()}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                  background: !subject.trim() ? C.border : 'linear-gradient(135deg, #4F46E5, #6366F1)',
                  color: !subject.trim() ? C.subtle : '#fff',
                  fontSize: 15, fontWeight: 700,
                  cursor: !subject.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: !subject.trim() ? 'none' : '0 4px 16px rgba(79,70,229,0.4)',
                  transition: 'all 0.2s', marginBottom: 10,
                }}>
                <ExternalLink size={16} />
                {opened ? 'Open in Teams Again' : 'Open in Microsoft Teams'}
              </motion.button>

              {opened && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  style={{ background: '#F0FDF4', borderRadius: 10, border: '1px solid #BBF7D0', padding: '10px 14px', marginBottom: 10, textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#166534', margin: 0 }}>
                    ✅ Teams opened — click <strong>Send</strong> inside Teams to confirm the meeting.
                  </p>
                </motion.div>
              )}

              {/* Secondary — create via API */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontSize: 11, color: C.subtle }}>or create via API (needs Azure setup)</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              <motion.button whileTap={{ scale: 0.96 }}
                onClick={createMeeting}
                disabled={loading || !subject.trim()}
                style={{
                  width: '100%', padding: '9px 0', borderRadius: 10, border: `1.5px solid ${C.border}`,
                  background: C.bg, color: C.muted,
                  fontSize: 13, fontWeight: 600,
                  cursor: loading || !subject.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  transition: 'all 0.2s',
                }}>
                {loading ? (
                  <>
                    <motion.div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.15)', borderTop: `2px solid ${C.muted}` }}
                      animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }} />
                    Creating…
                  </>
                ) : (
                  <><CalendarDays size={13} /> Create Meeting Link (API)</>
                )}
              </motion.button>
            </>
          )}

          {/* ── Result ── */}
          {result && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  style={{ width: 56, height: 56, borderRadius: '50%', background: '#D1FAE5', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={26} color="#16A34A" />
                </motion.div>
                <h4 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Meeting Ready!</h4>
                <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{result.subject}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 10 }}>
                <Clock size={14} color={C.muted} />
                <span style={{ fontSize: 13, color: C.text }}>
                  {new Date(result.startDateTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' · '}
                  {new Date(result.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(result.endDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {attendees.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 10 }}>
                  <Users size={13} color={C.muted} />
                  <span style={{ fontSize: 13, color: C.muted }}>
                    {attendees.map(a => a.full_name || a.name).join(', ')}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', background: '#EEF2FF', borderRadius: 10, border: '1px solid #C7D2FE', marginBottom: 14 }}>
                <span style={{ flex: 1, fontSize: 12, color: '#4338CA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {result.joinUrl}
                </span>
                <button onClick={copyLink} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}>
                  {copied ? <Check size={14} color="#16A34A" /> : <Copy size={14} color="#4F46E5" />}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button whileTap={{ scale: 0.95 }} onClick={shareToChat}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
                    color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  <MessageSquare size={14} /> Share to Chat
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => window.open(result.joinUrl, '_blank')}
                  style={{
                    padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${C.border}`,
                    background: C.bg, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                  <ExternalLink size={13} /> Open
                </motion.button>
              </div>

              <button onClick={() => { setResult(null); setSubject(''); setAttendees([]); }}
                style={{ width: '100%', marginTop: 10, padding: '7px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: C.muted, fontWeight: 500 }}>
                + Schedule another meeting
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function MeetingsPane({ onNewMeeting, compact = false }) {
  const [meetings, setMeetings] = useState([]);
  useEffect(() => {
    api.get('/chat/meetings').then(r => setMeetings(r.data?.meetings || [])).catch(() => {});
  }, []);

  const TIPS = [
    { icon: '📅', title: 'Seminars', desc: 'Host company-wide seminars with up to 1,000 attendees via Teams Live Events.' },
    { icon: '👥', title: 'Team Meetings', desc: 'Virtual project sync-ups with screen sharing, chat, and recording built in.' },
    { icon: '🖥️', title: 'Screen Share', desc: 'Present drawings, BOQ sheets, or site plans directly in the call.' },
    { icon: '🔗', title: 'Join Link', desc: 'Share the join link in any chat channel — no Teams account required for guests.' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      {/* Hero */}
      <div style={{
        padding: compact ? '16px 16px 14px' : '32px 32px 28px',
        background: 'linear-gradient(135deg, #4F46E5 0%, #2563EB 100%)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: compact ? 12 : 20 }}>
          <div style={{ width: compact ? 36 : 52, height: compact ? 36 : 52, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TeamsLogo size={compact ? 22 : 32} />
          </div>
          <div>
            <h2 style={{ fontSize: compact ? 15 : 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Microsoft Teams</h2>
            <p style={{ fontSize: compact ? 11 : 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Virtual meetings & seminars</p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={onNewMeeting}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: compact ? '9px 16px' : '12px 22px',
            borderRadius: 10, border: 'none',
            background: '#fff', color: '#4F46E5',
            fontSize: compact ? 13 : 15, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
          <CalendarDays size={compact ? 14 : 17} />
          Schedule a Meeting
        </motion.button>
      </div>

      {/* Tips grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 32px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          What you can do
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {TIPS.map(({ icon, title, desc }) => (
            <motion.div key={title}
              whileHover={{ y: -2, boxShadow: C.shadowMd }}
              style={{
                background: C.card, borderRadius: 14, padding: '16px 14px',
                border: `1px solid ${C.border}`, boxShadow: C.shadow,
                transition: 'box-shadow 0.2s',
              }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 5 }}>{title}</p>
              <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>{desc}</p>
            </motion.div>
          ))}
        </div>

        {/* How it works */}
        <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 28, marginBottom: 14 }}>
          How it works
        </p>
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {[
            { step: '1', text: 'Click "Schedule a Meeting" and fill in the title, date & time.' },
            { step: '2', text: "A Teams meeting is created instantly using your organisation's Microsoft 365 account." },
            { step: '3', text: 'Share the join link in any channel or DM — teammates can join with one click.' },
            { step: '4', text: 'The meeting opens directly in Microsoft Teams with full audio, video & screen share.' },
          ].map(({ step, text }, i) => (
            <div key={step} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px',
              borderTop: i > 0 ? `1px solid ${C.borderLight}` : 'none',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11.5, fontWeight: 800, color: C.primary,
              }}>{step}</div>
              <p style={{ fontSize: 13, color: C.text, lineHeight: 1.55, margin: 0 }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Meeting history */}
        {meetings.length > 0 && (
          <>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 28, marginBottom: 12 }}>
              Recent Meetings
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {meetings.slice(0, 10).map(m => (
                <div key={m.id} style={{
                  background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
                  padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CalendarDays size={17} color="#4F46E5" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</p>
                    <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {new Date(m.start_dt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}
                      {new Date(m.start_dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' – '}
                      {new Date(m.end_dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p style={{ fontSize: 11.5, color: C.subtle, marginTop: 1 }}>{m.organizer_name}</p>
                  </div>
                  <button onClick={() => window.open(m.join_url, '_blank')}
                    style={{ background: '#EEF2FF', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4F46E5', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ExternalLink size={11} /> Join
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
