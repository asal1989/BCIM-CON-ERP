// src/pages/auth/LoginPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Eye, EyeOff, Lock, Mail, AlertCircle, ArrowRight,
  ClipboardList, FileText, Package, Users, HardHat, ShieldCheck,
  Building2, TrendingUp, Search, MapPin, Loader2, LogOut,
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { authAPI, projectAPI } from '../../api/client';
import { CursorSpotlight } from '../../components/ui/cursor-spotlight';

const schema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const MODULES = [
  { icon: ClipboardList, label: 'Project & BOQ Management'    },
  { icon: FileText,      label: 'RA Bills & QS Certification' },
  { icon: Package,       label: 'Procurement & Store Control' },
  { icon: Users,         label: 'HR, Payroll & Attendance'    },
  { icon: HardHat,       label: 'Site Execution & Quality'    },
  { icon: ShieldCheck,   label: 'Compliance & Reporting'      },
];

const STATS = [
  { icon: Building2,   label: 'Projects',         target: 24,   suffix: '+' },
  { icon: FileText,    label: 'Bills Processed',  target: 335,  suffix: '+' },
  { icon: TrendingUp,  label: 'Crores Managed',   target: 42,   suffix: 'Cr+' },
];

const ESS_MODULES = [
  { icon: ClipboardList, label: 'Attendance & Leave'        },
  { icon: FileText,      label: 'Payslips & Tax Documents'  },
  { icon: Package,       label: 'Document Uploads'          },
  { icon: Users,         label: 'HR Requests & Approvals'   },
  { icon: HardHat,       label: 'Site & Duty Schedules'     },
  { icon: ShieldCheck,   label: 'Compliance Acknowledgements' },
];

const isEssDomain = () => typeof window !== 'undefined' && window.location.hostname === 'bcimhr.bcim.in';

const GLOBAL_ROLES = ['super_admin', 'admin', 'managing_director', 'director', 'ceo', 'cfo', 'md'];

function isGlobalRole(role) {
  return GLOBAL_ROLES.includes(role);
}

// Floating particle positions (left%, size, delay-s, duration-s, opacity)
const PARTICLES = [
  [8,  18, 0,    7,  0.5],
  [20, 10, 1.2,  9,  0.4],
  [35, 14, 0.4,  8,  0.35],
  [50, 8,  2.5,  11, 0.3],
  [62, 20, 1,    7,  0.45],
  [75, 12, 0.7,  10, 0.4],
  [88, 7,  3,    8,  0.25],
  [45, 16, 1.8,  9,  0.35],
];

// Animated counter hook
function useCountUp(target, duration = 1400, startDelay = 600) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const steps = 40;
      const inc   = target / steps;
      let cur     = 0;
      const id    = setInterval(() => {
        cur += inc;
        if (cur >= target) { setVal(target); clearInterval(id); }
        else setVal(Math.floor(cur));
      }, duration / steps);
      return () => clearInterval(id);
    }, startDelay);
    return () => clearTimeout(t);
  }, [target, duration, startDelay]);
  return val;
}

function StatCard({ stat, delay }) {
  const val = useCountUp(stat.target, 1400, 600 + delay);
  const Icon = stat.icon;
  return (
    <div className="lp-stat" style={{ animationDelay: `${0.9 + delay / 1000}s` }}>
      <div className="lp-stat-icon"><Icon size={14} /></div>
      <div className="lp-stat-val">{val}{stat.suffix}</div>
      <div className="lp-stat-label">{stat.label}</div>
    </div>
  );
}

export default function LoginPage() {
  const [showPass,     setShowPass]     = useState(false);
  const [lastError,    setLastError]    = useState('');
  const [resetEmail,   setResetEmail]   = useState('');
  const [resetSent,    setResetSent]    = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [mounted,      setMounted]      = useState(false);
  const [loginStep,    setLoginStep]    = useState('credentials');
  const [projects,     setProjects]     = useState([]);
  const [projectSearch,setProjectSearch]= useState('');
  const [projectLoading,setProjectLoading]=useState(false);
  const [projectError, setProjectError] = useState('');
  const [pickingId,    setPickingId]    = useState('');
  const [pendingUser,  setPendingUser]  = useState(null);
  const {
    user,
    selectedProjectId,
    login,
    logout,
    isLoading,
    setSelectedProject,
    clearSelectedProject,
  } = useAuthStore();
  const navigate             = useNavigate();
  const [searchParams]       = useSearchParams();
  const redirectReason       = searchParams.get('reason');

  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  // ESS custom-domain theme: light, HR-SaaS-style palette instead of the
  // dark navy/gold ERP branding. Computed once so scattered inline styles
  // (which can't be reached by the .ess-theme CSS class alone) stay in sync.
  const ess            = isEssDomain();
  const accent         = ess ? '#2F6FED' : '#0a2057';
  const accentSoft      = ess ? '#14B8A6' : '#c9a227';
  const accentPale      = ess ? '#EAF1FF' : '#eef3fb';
  const accentPaleHover = ess ? '#DCE9FF' : '#dbeafe';

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.project_code || p.code || '').toLowerCase().includes(q) ||
      (p.city || p.location || '').toLowerCase().includes(q) ||
      (p.client_name || '').toLowerCase().includes(q)
    );
  }, [projects, projectSearch]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const loadProjectsForUser = async (currentUser) => {
    setPendingUser(currentUser);
    setProjectError('');
    setProjectLoading(true);
    setLoginStep('project');
    try {
      sessionStorage.removeItem('selectedProjectId');
      const { data: projectResponse } = await projectAPI.list({ status: 'active' });
      const list = projectResponse?.data || projectResponse || [];
      setProjects(Array.isArray(list) ? list : []);
      toast.success('Welcome back. Select your project.');
    } catch (err) {
      const message = err?.response?.data?.error || 'Login succeeded, but projects could not be loaded.';
      if (isGlobalRole(currentUser?.role)) {
        clearSelectedProject();
        toast.success('Welcome back!');
        navigate('/', { replace: true });
      } else {
        setProjectError(message);
      }
    } finally {
      setProjectLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (selectedProjectId) {
      navigate('/', { replace: true });
      return;
    }
    if (loginStep === 'credentials') {
      loadProjectsForUser(user);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedProjectId, loginStep]);

  const onSubmit = async (data) => {
    setLastError('');
    setProjectError('');
    const result = await login(data.email, data.password);
    if (!result.success) {
      setLastError(result.error || 'Invalid credentials. Please try again.');
    }
    // loadProjectsForUser is triggered by the useEffect below when user?.id changes
  };

  const openProject = (project) => {
    setPickingId(project.id);
    setSelectedProject(project);
    toast.success(`Project selected: ${project.name}`);
    setTimeout(() => navigate('/', { replace: true }), 80);
  };

  const openAllProjects = () => {
    clearSelectedProject();
    toast.success('All projects view selected');
    navigate('/', { replace: true });
  };

  const backToCredentials = async () => {
    setProjectSearch('');
    setProjects([]);
    setProjectError('');
    setPendingUser(null);
    setPickingId('');
    await logout();
    setLoginStep('credentials');
  };

  const requestReset = async () => {
    if (!resetEmail) return toast.error('Enter your email address first');
    setSendingReset(true); setResetSent(false);
    try {
      const { data } = await authAPI.forgotPassword({ email: resetEmail });
      if (data?.mail_status) {
        setResetSent(false);
        toast.error(`Reset email not sent: ${data.mail_status}`);
        return;
      }
      setResetSent(true);
      toast.success(data?.message || 'Reset link sent if the email exists');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to send reset link');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Keyframes ── */
        @keyframes lp-fadeUp   { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:translateY(0); } }
        @keyframes lp-fadeDown { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes lp-fadeIn   { from { opacity:0; } to { opacity:1; } }
        @keyframes lp-slideRight { from { opacity:0; transform:translateX(-22px); } to { opacity:1; transform:translateX(0); } }
        @keyframes lp-slideLeft  { from { opacity:0; transform:translateX(28px); } to { opacity:1; transform:translateX(0); } }

        @keyframes lp-logoPulse {
          0%,100% { box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 0 rgba(201,162,39,0.5); }
          50%      { box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 12px rgba(201,162,39,0); }
        }
        @keyframes lp-goldShimmer {
          0%   { background-position:-200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes lp-goldGrow {
          from { transform: scaleX(0); transform-origin: left; }
          to   { transform: scaleX(1); transform-origin: left; }
        }
        @keyframes lp-edgeGrow {
          from { transform: scaleY(0); transform-origin: top; }
          to   { transform: scaleY(1); transform-origin: top; }
        }
        @keyframes lp-floatUp {
          0%   { opacity:0; transform:translateY(0) scale(0.7); }
          15%  { opacity:0.7; }
          85%  { opacity:0.15; }
          100% { opacity:0; transform:translateY(-140px) scale(1.3); }
        }
        @keyframes lp-dotPulse {
          0%,100% { opacity:0.4; transform:scale(1); }
          50%     { opacity:1;   transform:scale(1.5); }
        }
        @keyframes lp-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes lp-spinSlow {
          to { transform: rotate(360deg); }
        }
        @keyframes lp-bobFloat {
          0%,100% { transform:translateY(0) rotate(0deg); }
          33%     { transform:translateY(-10px) rotate(3deg); }
          66%     { transform:translateY(-5px) rotate(-2deg); }
        }
        @keyframes lp-shimmerCard {
          0%   { transform:translateX(-100%); }
          100% { transform:translateX(300%); }
        }
        @keyframes lp-countUp {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes lp-borderPulse {
          0%,100% { border-color: #e2e8f0; }
          50%     { border-color: #c7d8f5; }
        }

        /* ── Base ── */
        .lp-root {
          min-height: 100vh;
          display: flex;
          font-family: 'Inter', -apple-system, sans-serif;
          background: #fff;
        }

        /* ════ LEFT PANEL ════ */
        .lp-left {
          display: none;
          flex: 0 0 52%;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          background: #061230;
        }
        @media (min-width: 1024px) { .lp-left { display: flex; } }

        .lp-pattern {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 52px 52px;
        }
        .lp-diagonal {
          position: absolute; top:-10%; right:-8%;
          width:55%; height:130%;
          background: linear-gradient(180deg,#0d2d6e 0%,#061230 100%);
          transform: skewX(-8deg); opacity: 0.5;
        }

        /* Gold bar — animated grow */
        .lp-gold-bar {
          position: absolute; top:0; left:0; right:0; height:4px;
          background: linear-gradient(90deg,#c9a227,#f0d060,#e8c547,#c9a227);
          background-size: 200% 100%;
        }
        .lp-mounted .lp-gold-bar {
          animation: lp-goldGrow 0.8s cubic-bezier(0.4,0,0.2,1) both,
                     lp-goldShimmer 3s linear 0.8s infinite;
        }
        .lp-left-edge {
          position: absolute; left:0; top:0; bottom:0; width:4px;
          background: linear-gradient(180deg,#c9a227,#e8c547 50%,#c9a227);
        }
        .lp-mounted .lp-left-edge { animation: lp-edgeGrow 1s 0.3s cubic-bezier(0.4,0,0.2,1) both; }

        /* Floating rotating ring in background */
        .lp-ring {
          position: absolute; top: 15%; right: 8%;
          width: 260px; height: 260px; border-radius: 50%;
          border: 1px solid rgba(201,162,39,0.08);
          pointer-events: none;
        }
        .lp-ring::before {
          content:''; position:absolute; inset:20px; border-radius:50%;
          border: 1px solid rgba(201,162,39,0.06);
        }
        .lp-ring::after {
          content:''; position:absolute; inset:50px; border-radius:50%;
          border: 1px dashed rgba(201,162,39,0.05);
        }
        .lp-mounted .lp-ring { animation: lp-spinSlow 40s linear infinite; }

        /* Inner content */
        .lp-left-inner {
          position:relative; z-index:10;
          display:flex; flex-direction:column;
          height:100%; padding:32px 44px;
        }

        /* Brand */
        .lp-brand {
          display:flex; align-items:center; gap:14px;
          padding-bottom:24px;
          border-bottom:1px solid rgba(255,255,255,0.08);
          margin-bottom:28px;
          opacity:0;
        }
        .lp-mounted .lp-brand { animation: lp-fadeDown 0.6s 0.15s ease both; }

        .lp-logo-box {
          width:52px; height:52px; border-radius:10px; background:#fff;
          display:flex; align-items:center; justify-content:center;
          padding:5px; flex-shrink:0;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .lp-mounted .lp-logo-box { animation: lp-logoPulse 2.5s 1s ease-in-out infinite; }
        .lp-logo-box img { width:100%; height:100%; object-fit:contain; }

        .lp-brand-text-top { font-size:15px; font-weight:800; color:#fff; letter-spacing:0.04em; line-height:1.2; }
        .lp-brand-text-sub { font-size:10px; color:#c9a227; font-weight:600; letter-spacing:0.12em; margin-top:3px; text-transform:uppercase; }

        /* Headline */
        .lp-headline {
          font-size:30px; font-weight:800; color:#fff;
          line-height:1.25; letter-spacing:-0.02em; margin-bottom:12px;
          opacity:0;
        }
        .lp-mounted .lp-headline { animation: lp-fadeUp 0.7s 0.35s ease both; }
        .lp-headline-accent { color:#e8c547; }

        .lp-tagline {
          font-size:12.5px; color:#7fa3d1; line-height:1.6;
          margin-bottom:28px; max-width:380px; opacity:0;
        }
        .lp-mounted .lp-tagline { animation: lp-fadeUp 0.7s 0.5s ease both; }

        /* Module list */
        .lp-module-title {
          font-size:10px; font-weight:700; color:#4a7ab5;
          letter-spacing:0.12em; text-transform:uppercase; margin-bottom:10px;
          opacity:0;
        }
        .lp-mounted .lp-module-title { animation: lp-fadeUp 0.5s 0.6s ease both; }

        .lp-modules { display:flex; flex-direction:column; gap:6px; }
        .lp-module-row {
          display:flex; align-items:center; gap:12px;
          padding:8px 14px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.07);
          border-radius:10px;
          transition:background 0.2s, border-color 0.2s, transform 0.2s;
          opacity:0; cursor:default;
          position:relative; overflow:hidden;
        }
        .lp-module-row::after {
          content:''; position:absolute; inset:0;
          background:linear-gradient(90deg,transparent,rgba(201,162,39,0.06),transparent);
          transform:translateX(-100%);
          transition:transform 0.5s;
        }
        .lp-module-row:hover::after { transform:translateX(100%); }
        .lp-module-row:hover {
          background:rgba(255,255,255,0.08);
          border-color:rgba(201,162,39,0.25);
          transform:translateX(4px);
        }
        .lp-mounted .lp-module-row { animation: lp-slideRight 0.5s ease both; }

        .lp-module-icon {
          width:30px; height:30px; border-radius:7px;
          background:rgba(201,162,39,0.12);
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
          transition:background 0.2s;
        }
        .lp-module-row:hover .lp-module-icon { background:rgba(201,162,39,0.22); }
        .lp-module-name { font-size:12.5px; font-weight:500; color:#b8cfe8; }
        .lp-module-dot {
          margin-left:auto; width:6px; height:6px; border-radius:50%;
          background:rgba(201,162,39,0.5); flex-shrink:0;
          animation: lp-dotPulse 2.5s ease-in-out infinite;
        }

        /* Stats row */
        .lp-stats {
          display:flex; gap:0; margin-top:auto; padding-top:18px;
          border-top:1px solid rgba(255,255,255,0.07);
          opacity:0;
        }
        .lp-mounted .lp-stats { animation: lp-fadeUp 0.6s 1.1s ease both; }
        .lp-stat {
          flex:1; display:flex; flex-direction:column; align-items:center; gap:3px;
          padding:10px 8px;
          border-right:1px solid rgba(255,255,255,0.07);
          opacity:0;
          transition:background 0.2s;
          border-radius:8px;
        }
        .lp-stat:last-child { border-right:none; }
        .lp-stat:hover { background:rgba(255,255,255,0.04); }
        .lp-mounted .lp-stat { animation: lp-countUp 0.5s ease both; }
        .lp-stat-icon { color:#4a7ab5; margin-bottom:2px; }
        .lp-stat-val { font-size:20px; font-weight:800; color:#e8c547; line-height:1; }
        .lp-stat-label { font-size:10px; color:#4a7ab5; font-weight:500; text-align:center; }

        /* Floating particles */
        .lp-particle {
          position:absolute; bottom:-20px; border-radius:50%;
          background:rgba(201,162,39,0.25);
          pointer-events:none;
        }
        .lp-mounted .lp-particle { animation: lp-floatUp ease-in-out infinite; }

        /* ════ RIGHT PANEL ════ */
        .lp-right {
          flex:1; display:flex; align-items:center; justify-content:center;
          padding:20px 28px; background:#f8fafd; position:relative;
          height:100vh; overflow-y:auto;
        }
        .lp-right-top-bar {
          position:absolute; top:0; left:0; right:0; height:4px; background:#0a2057;
        }
        @media (min-width:1024px) { .lp-right-top-bar { display:none; } }

        .lp-form-wrap { width:100%; max-width:400px; opacity:0; }
        .lp-mounted .lp-form-wrap { animation: lp-slideLeft 0.7s 0.25s ease both; }

        /* Mobile brand */
        .lp-mobile-brand { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
        @media (min-width:1024px) { .lp-mobile-brand { display:none; } }

        /* Welcome */
        .lp-welcome { margin-bottom:16px; }
        .lp-welcome-label {
          display:inline-flex; align-items:center; gap:6px;
          background:#eef3fb; border:1px solid #c7d8f5;
          border-radius:20px; padding:3px 10px; margin-bottom:8px;
          animation: lp-borderPulse 3s ease-in-out infinite;
        }
        .lp-welcome-dot {
          width:5px; height:5px; border-radius:50%; background:#0a2057;
          animation: lp-dotPulse 2s ease-in-out infinite;
        }
        .lp-welcome-tag { font-size:10px; font-weight:700; color:#0a2057; letter-spacing:0.07em; }
        .lp-welcome h2 { font-size:22px; font-weight:800; color:#0a2057; letter-spacing:-0.02em; line-height:1.2; margin-bottom:4px; }
        .lp-welcome p  { font-size:12px; color:#64748b; }

        /* Card */
        .lp-card {
          background:#fff; border:1px solid #e2e8f0; border-radius:14px;
          padding:22px 22px 18px;
          box-shadow:0 4px 24px rgba(10,32,87,0.07),0 1px 4px rgba(10,32,87,0.05);
          position:relative; overflow:hidden;
        }
        /* Shimmer sweep on card load */
        .lp-card::before {
          content:''; position:absolute; top:0; left:0; width:40%; height:100%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent);
          pointer-events:none;
        }
        .lp-mounted .lp-card::before { animation: lp-shimmerCard 0.9s 0.6s ease both; }

        /* Label */
        .lp-label { display:block; font-size:10px; font-weight:700; color:#64748b; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.08em; }

        /* Input */
        .lp-input-wrap { position:relative; }
        .lp-icon-box {
          position:absolute; left:12px; top:50%; transform:translateY(-50%);
          width:20px; height:20px; border-radius:5px; background:#eef3fb;
          display:flex; align-items:center; justify-content:center; pointer-events:none;
          transition:background 0.2s;
        }
        .lp-input-wrap:focus-within .lp-icon-box { background:#dbeafe; }
        .lp-input {
          width:100%; padding:10px 14px 10px 42px;
          background:#f8fafd; border:1.5px solid #e2e8f0; border-radius:9px;
          color:#0f172a; font-size:13.5px; outline:none; font-family:inherit;
          transition:border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }
        .lp-input::placeholder { color:#94a3b8; }
        .lp-input:focus { border-color:#0a2057; box-shadow:0 0 0 3px rgba(10,32,87,0.08); background:#fff; }
        .lp-eye-btn {
          position:absolute; right:12px; top:50%; transform:translateY(-50%);
          background:none; border:none; cursor:pointer; color:#94a3b8;
          padding:4px; border-radius:6px; display:flex; align-items:center; justify-content:center;
          transition:color 0.2s;
        }
        .lp-eye-btn:hover { color:#0a2057; }

        /* Error text */
        .lp-field-error { display:flex; align-items:center; gap:4px; margin-top:4px; font-size:11px; color:#ef4444; }

        /* Error banner */
        .lp-error-banner {
          display:flex; align-items:center; gap:10px;
          padding:10px 12px; border-radius:9px; margin-bottom:12px;
          background:#fef2f2; border:1px solid #fecaca;
          color:#dc2626; font-size:12px;
          animation: lp-fadeDown 0.4s ease both;
        }

        /* Submit button */
        .lp-btn {
          width:100%; padding:11px 0; background:#0a2057;
          border:none; border-radius:9px; color:#fff; font-size:13.5px; font-weight:700;
          cursor:pointer; font-family:inherit;
          display:flex; align-items:center; justify-content:center; gap:8px;
          box-shadow:0 4px 16px rgba(10,32,87,0.3);
          transition:background 0.2s, transform 0.15s, box-shadow 0.2s;
          letter-spacing:0.02em; position:relative; overflow:hidden;
        }
        .lp-btn::after {
          content:''; position:absolute; inset:0;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent);
          transform:translateX(-100%); transition:transform 0.4s;
        }
        .lp-btn:hover:not(:disabled)::after { transform:translateX(100%); }
        .lp-btn:hover:not(:disabled) { background:#0d2a6e; transform:translateY(-2px); box-shadow:0 10px 28px rgba(10,32,87,0.4); }
        .lp-btn:active:not(:disabled) { transform:translateY(0); }
        .lp-btn:disabled { opacity:0.65; cursor:wait; }

        @keyframes lp-spin { to { transform:rotate(360deg); } }
        .lp-spinner {
          width:16px; height:16px; border-radius:50%;
          border:2px solid rgba(255,255,255,0.3); border-top-color:#fff;
          animation:lp-spin 0.75s linear infinite; flex-shrink:0;
        }

        .lp-project-head {
          display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
          margin-bottom:14px;
        }
        .lp-project-title { font-size:18px; font-weight:800; color:#0a2057; letter-spacing:-0.01em; }
        .lp-project-sub { font-size:11.5px; color:#64748b; line-height:1.45; margin-top:3px; }
        .lp-project-back {
          border:1px solid #e2e8f0; background:#fff; color:#64748b;
          border-radius:8px; padding:7px 9px; display:flex; align-items:center; gap:5px;
          font-size:11px; font-weight:800; cursor:pointer; white-space:nowrap;
        }
        .lp-project-search { position:relative; margin-bottom:12px; }
        .lp-project-search svg {
          position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8;
        }
        .lp-project-list {
          display:flex; flex-direction:column; gap:9px; max-height:300px;
          overflow:auto; padding-right:3px; margin-bottom:12px;
        }
        .lp-project-card {
          width:100%; text-align:left; border:1.5px solid #e2e8f0; background:#fff;
          border-radius:11px; padding:12px; cursor:pointer; font-family:inherit;
          transition:border-color 0.18s, box-shadow 0.18s, transform 0.18s;
        }
        .lp-project-card:hover:not(:disabled) {
          border-color:#0a2057; box-shadow:0 8px 22px rgba(10,32,87,0.12); transform:translateY(-1px);
        }
        .lp-project-card:disabled { cursor:wait; opacity:0.75; }
        .lp-project-main { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
        .lp-project-name { font-size:13px; color:#0f172a; font-weight:800; line-height:1.25; }
        .lp-project-code {
          font-size:10px; color:#0a2057; font-weight:800; background:#eef3fb;
          border:1px solid #c7d8f5; border-radius:999px; padding:3px 8px; white-space:nowrap;
        }
        .lp-project-meta {
          display:flex; align-items:center; gap:5px; color:#64748b; font-size:11px;
          margin-top:7px; min-height:16px;
        }
        .lp-project-all {
          border-color:#c9a227; background:#fffaf0;
        }
        .lp-project-state {
          border:1px dashed #cbd5e1; border-radius:10px; padding:18px 14px;
          display:flex; align-items:center; justify-content:center; gap:9px;
          color:#64748b; font-size:12px; background:#f8fafd; margin:8px 0 12px;
        }

        /* Divider */
        .lp-divider { display:flex; align-items:center; gap:10px; margin:14px 0; }
        .lp-divider hr { flex:1; border:none; border-top:1px solid #e2e8f0; }
        .lp-divider span { font-size:10px; color:#94a3b8; font-weight:600; text-transform:uppercase; letter-spacing:0.07em; white-space:nowrap; }

        /* Footer */
        .lp-footer { text-align:center; margin-top:12px; }
        .lp-footer-note { font-size:11px; color:#94a3b8; margin-bottom:6px; }
        .lp-version { position:absolute; bottom:10px; right:16px; font-size:10px; color:#cbd5e1; letter-spacing:0.05em; }

        /* ═══════════════════════════════════════════════════════════
           ESS PORTAL THEME — light HR-SaaS palette (Zoho People / GreytHR
           style) instead of the dark navy/gold ERP branding. Scoped to
           .ess-theme so the main ERP login is untouched.
           ═══════════════════════════════════════════════════════════ */
        .ess-theme.lp-root { background:#fff; }
        .ess-theme .lp-left {
          background: linear-gradient(160deg, #EEF4FF 0%, #F5F9FF 45%, #F6FBFA 100%);
        }
        .ess-theme .lp-pattern,
        .ess-theme .lp-diagonal,
        .ess-theme .lp-gold-bar,
        .ess-theme .lp-left-edge,
        .ess-theme .lp-ring,
        .ess-theme .lp-particle { display:none; }

        .ess-theme .lp-brand { border-bottom-color: rgba(15,23,42,0.08); }
        .ess-theme .lp-brand-text-sub { color:#2F6FED; }
        .ess-theme .lp-headline { color:#0f172a; }
        .ess-theme .lp-headline-accent { color:#2F6FED; }
        .ess-theme .lp-tagline { color:#5b6b85; }
        .ess-theme .lp-module-title { color:#7c8aa5; }
        .ess-theme .lp-module-row { background:#fff; border-color:#e6ecf7; box-shadow:0 1px 3px rgba(15,23,42,0.05); }
        .ess-theme .lp-module-row::after { background:linear-gradient(90deg,transparent,rgba(47,111,237,0.08),transparent); }
        .ess-theme .lp-module-row:hover { background:#f5f9ff; border-color:#2F6FED; }
        .ess-theme .lp-module-icon { background:rgba(47,111,237,0.1); }
        .ess-theme .lp-module-row:hover .lp-module-icon { background:rgba(47,111,237,0.18); }
        .ess-theme .lp-module-name { color:#334155; }
        .ess-theme .lp-module-dot { background:#14B8A6; }

        /* Right panel accents */
        .ess-theme .lp-right { background:#fbfcfe; }
        .ess-theme .lp-right-top-bar { background:#2F6FED; }
        .ess-theme .lp-welcome-label { background:#EAF1FF; border-color:#C9DCFF; }
        .ess-theme .lp-welcome-dot { background:#2F6FED; }
        .ess-theme .lp-welcome-tag { color:#2F6FED; }
        .ess-theme .lp-welcome h2 { color:#0f172a; }
        .ess-theme .lp-card { box-shadow:0 4px 24px rgba(47,111,237,0.08),0 1px 4px rgba(47,111,237,0.05); }
        .ess-theme .lp-icon-box { background:#EAF1FF; }
        .ess-theme .lp-input-wrap:focus-within .lp-icon-box { background:#DCE9FF; }
        .ess-theme .lp-input:focus { border-color:#2F6FED; box-shadow:0 0 0 3px rgba(47,111,237,0.12); }
        .ess-theme .lp-eye-btn:hover { color:#2F6FED; }
        .ess-theme .lp-btn { background:#2F6FED; box-shadow:0 4px 16px rgba(47,111,237,0.3); }
        .ess-theme .lp-btn:hover:not(:disabled) { background:#2557C7; box-shadow:0 10px 28px rgba(47,111,237,0.4); }
        .ess-theme .lp-project-code { color:#2F6FED; background:#EAF1FF; border-color:#C9DCFF; }
        .ess-theme .lp-project-card:hover:not(:disabled) { border-color:#2F6FED; box-shadow:0 8px 22px rgba(47,111,237,0.12); }
        .ess-theme .lp-project-all { border-color:#14B8A6; background:#F0FDFA; }

        /* Illustration */
        .ess-blob { position:absolute; border-radius:50%; filter:blur(1px); opacity:0.6; pointer-events:none; }
        .ess-blob-1 { width:220px; height:220px; background:radial-gradient(circle,#DCE9FF,transparent 70%); top:8%; right:6%; }
        .ess-blob-2 { width:190px; height:190px; background:radial-gradient(circle,#D3F5EE,transparent 70%); bottom:16%; left:2%; }
        .ess-blob-3 { width:150px; height:150px; background:radial-gradient(circle,#FEF3D6,transparent 70%); bottom:36%; right:18%; }

        .ess-illustration { position:relative; margin:10px auto 26px; width:100%; max-width:300px; height:190px; z-index:5; }
        .ess-illust-card {
          position:absolute; inset:18px 28px; background:#fff; border-radius:16px;
          box-shadow:0 20px 40px rgba(15,23,42,0.12); padding:16px;
          animation: lp-bobFloat 6s ease-in-out infinite;
        }
        .ess-illust-card-header { display:flex; gap:5px; margin-bottom:14px; }
        .ess-illust-dot { width:8px; height:8px; border-radius:50%; }
        .ess-illust-row { height:9px; border-radius:5px; background:#EEF2F9; margin-bottom:9px; }
        .ess-illust-row.short { width:60%; }
        .ess-chip {
          position:absolute; width:38px; height:38px; border-radius:11px; background:#fff;
          display:flex; align-items:center; justify-content:center;
          box-shadow:0 8px 20px rgba(15,23,42,0.14);
          animation: lp-bobFloat 5s ease-in-out infinite;
        }
        .ess-chip-1 { top:-4px; left:-10px; color:#2F6FED; animation-delay:0.3s; }
        .ess-chip-2 { top:14%; right:-16px; color:#14B8A6; animation-delay:1s; }
        .ess-chip-3 { bottom:-8px; left:20%; color:#F59E0B; animation-delay:1.6s; }
        .ess-chip-4 { bottom:16%; right:8%; color:#EC4899; animation-delay:0.7s; }
      `}</style>

      <div className={`lp-root${mounted ? ' lp-mounted' : ''}${ess ? ' ess-theme' : ''}`}>

        {/* ════════════ LEFT — Navy Brand Panel ════════════ */}
        <CursorSpotlight
          className="lp-left"
          baseColor="transparent"
          spotlightSize={320}
          spotlightOpacity={0.1}
          falloff="65%"
          childrenClassName="absolute inset-0 flex flex-col"
        >
          <div className="lp-pattern" />
          <div className="lp-diagonal" />
          <div className="lp-gold-bar" />
          <div className="lp-left-edge" />
          <div className="lp-ring" />

          {/* Floating particles */}
          {PARTICLES.map(([left, size, delay, duration, opacity], i) => (
            <div
              key={i}
              className="lp-particle"
              style={{
                left: `${left}%`,
                width: size, height: size,
                opacity,
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
              }}
            />
          ))}

          {/* ESS theme: light illustration replacing the navy corporate decor */}
          {ess && (
            <>
              <div className="ess-blob ess-blob-1" />
              <div className="ess-blob ess-blob-2" />
              <div className="ess-blob ess-blob-3" />
              <div className="ess-illustration">
                <div className="ess-illust-card">
                  <div className="ess-illust-card-header">
                    <span className="ess-illust-dot" style={{ background: '#2F6FED' }} />
                    <span className="ess-illust-dot" style={{ background: '#14B8A6' }} />
                    <span className="ess-illust-dot" style={{ background: '#F59E0B' }} />
                  </div>
                  <div className="ess-illust-row" />
                  <div className="ess-illust-row short" />
                  <div className="ess-illust-row" />
                </div>
                <div className="ess-chip ess-chip-1"><ClipboardList size={17} /></div>
                <div className="ess-chip ess-chip-2"><FileText size={17} /></div>
                <div className="ess-chip ess-chip-3"><Users size={17} /></div>
                <div className="ess-chip ess-chip-4"><ShieldCheck size={17} /></div>
              </div>
            </>
          )}

          <div className="lp-left-inner">

            {/* Brand */}
            <div className="lp-brand">
              <div className="lp-logo-box">
                <img src="/bcim-logo.png" alt="BCIM" />
              </div>
              <div>
                <div className="lp-brand-text-top">BCIM ENGINEERING</div>
                <div className="lp-brand-text-sub">Private Limited</div>
              </div>
            </div>

            {/* Headline */}
            {ess ? (
              <>
                <div className="lp-headline">
                  Employee Self<br />
                  <span className="lp-headline-accent">Service Portal</span>
                </div>
                <p className="lp-tagline">
                  Your one-stop portal for attendance, leave, payslips, documents and HR
                  requests — powered by the same BCIM ERP your organization runs on.
                </p>
              </>
            ) : (
              <>
                <div className="lp-headline">
                  Enterprise ERP for<br />
                  <span className="lp-headline-accent">Construction Industry</span>
                </div>
                <p className="lp-tagline">
                  A fully integrated management platform purpose-built for construction companies —
                  covering projects, billing, procurement, HR and statutory compliance.
                </p>
              </>
            )}

            {/* Modules */}
            <div className="lp-module-title">{ess ? 'Self Service Features' : 'Integrated Modules'}</div>
            <div className="lp-modules">
              {(ess ? ESS_MODULES : MODULES).map(({ icon: Icon, label }, idx) => (
                <div
                  className="lp-module-row"
                  key={label}
                  style={{ animationDelay: `${0.65 + idx * 0.08}s` }}
                >
                  <div className="lp-module-icon">
                    <Icon style={{ width: 14, height: 14, color: accentSoft }} />
                  </div>
                  <span className="lp-module-name">{label}</span>
                  <div className="lp-module-dot" style={{ animationDelay: `${idx * 0.4}s` }} />
                </div>
              ))}
            </div>

            {/* Stats — ERP only; not relevant to the employee-facing ESS portal */}
            {!ess && (
              <div className="lp-stats">
                {STATS.map((stat, idx) => (
                  <StatCard key={stat.label} stat={stat} delay={idx * 150} />
                ))}
              </div>
            )}

          </div>
        </CursorSpotlight>

        {/* ════════════ RIGHT — Login Form ════════════ */}
        <div className="lp-right">
          <div className="lp-right-top-bar" />

          <div className="lp-form-wrap">

            {/* Mobile brand */}
            <div className="lp-mobile-brand">
              <div style={{ width:46,height:46,borderRadius:10,background:accent,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',padding:6 }}>
                <img src="/bcim-logo.png" alt="BCIM" style={{ width:'100%',height:'100%',objectFit:'contain',filter:'brightness(0) invert(1)' }} />
              </div>
              <div>
                <div style={{ fontSize:15,fontWeight:800,color:accent }}>BCIM ENGINEERING</div>
                <div style={{ fontSize:10,color:'#64748b',letterSpacing:'0.08em',marginTop:2 }}>PRIVATE LIMITED</div>
              </div>
            </div>

            {/* Welcome */}
            <div className="lp-welcome">
              <div className="lp-welcome-label">
                <span className="lp-welcome-dot" />
                <span className="lp-welcome-tag">{ess ? 'ESS PORTAL' : 'ERP PORTAL'}</span>
              </div>
              <h2>Welcome Back</h2>
              <p>{ess ? 'Sign in with your employee credentials' : 'Sign in with your credentials to access the system'}</p>
            </div>

            {/* Session / token expiry banners */}
            {redirectReason === 'session_expired' && !lastError && (
              <div className="lp-error-banner" style={{ background:'#fffbeb',borderColor:'#fde68a',color:'#92400e' }}>
                <AlertCircle style={{ width:15,height:15,flexShrink:0 }} />
                <span>Your session expired after 8 hours. Please sign in again.</span>
              </div>
            )}
            {redirectReason === 'token_expired' && !lastError && (
              <div className="lp-error-banner">
                <AlertCircle style={{ width:15,height:15,flexShrink:0 }} />
                <span>Your session has ended. Please sign in to continue.</span>
              </div>
            )}

            {/* Error */}
            {lastError && (
              <div className="lp-error-banner">
                <AlertCircle style={{ width:15,height:15,flexShrink:0 }} />
                <span>{lastError}</span>
              </div>
            )}

            {/* Card */}
            <div className="lp-card">
              {loginStep === 'credentials' ? (
              <form onSubmit={handleSubmit(onSubmit)} noValidate>

                {/* Email */}
                <div style={{ marginBottom:12 }}>
                  <label className="lp-label">Email Address</label>
                  <div className="lp-input-wrap">
                    <div className="lp-icon-box">
                      <Mail style={{ width:13,height:13,color:accent }} />
                    </div>
                    <input
                      {...register('email')}
                      type="email"
                      placeholder="yourname@bcimengineering.in"
                      autoComplete="email"
                      autoFocus
                      className="lp-input"
                    />
                  </div>
                  {errors.email && (
                    <p className="lp-field-error">
                      <AlertCircle style={{ width:12,height:12 }} /> {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div style={{ marginBottom:4 }}>
                  <label className="lp-label">Password</label>
                  <div className="lp-input-wrap">
                    <div className="lp-icon-box">
                      <Lock style={{ width:13,height:13,color:accent }} />
                    </div>
                    <input
                      {...register('password')}
                      type={showPass ? 'text' : 'password'}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="lp-input"
                      style={{ paddingRight:44 }}
                    />
                    <button type="button" className="lp-eye-btn" onClick={() => setShowPass(v => !v)}>
                      {showPass
                        ? <EyeOff style={{ width:16,height:16 }} />
                        : <Eye    style={{ width:16,height:16 }} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="lp-field-error">
                      <AlertCircle style={{ width:12,height:12 }} /> {errors.password.message}
                    </p>
                  )}
                </div>

                <div className="lp-divider">
                  <hr /><span>secure login</span><hr />
                </div>

                {/* Forgot password */}
                <div style={{ marginBottom:14,padding:10,border:'1px solid #e2e8f0',borderRadius:9,background:'#f8fafd' }}>
                  <label className="lp-label">Forgot Password</label>
                  <div style={{ display:'flex',gap:8 }}>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      placeholder="Enter registered email"
                      className="lp-input"
                      style={{ paddingLeft:14 }}
                    />
                    <button
                      type="button"
                      onClick={requestReset}
                      disabled={sendingReset}
                      style={{ minWidth:112,border:'none',borderRadius:10,background:accentPale,color:accent,fontSize:11,fontWeight:800,textTransform:'uppercase',cursor:sendingReset?'wait':'pointer',transition:'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.background=accentPaleHover}
                      onMouseLeave={e => e.currentTarget.style.background=accentPale}
                    >
                      {sendingReset ? 'Sending…' : 'Send Link'}
                    </button>
                  </div>
                  {resetSent && (
                    <p style={{ marginTop:8,fontSize:12,color:'#16a34a',fontWeight:600 }}>
                      If the email exists, a reset link has been sent.
                    </p>
                  )}
                </div>

                {/* Submit */}
                <button type="submit" disabled={isLoading} className="lp-btn">
                  {isLoading
                    ? <><span className="lp-spinner" /> Authenticating…</>
                    : <>Sign In to Portal <ArrowRight style={{ width:16,height:16 }} /></>
                  }
                </button>

              </form>
              ) : (
                <div>
                  <div className="lp-project-head">
                    <div>
                      <div className="lp-project-title">Select Project</div>
                      <div className="lp-project-sub">
                        {pendingUser?.name ? `${pendingUser.name}, choose your working project.` : 'Choose your working project.'}
                      </div>
                    </div>
                    <button type="button" className="lp-project-back" onClick={backToCredentials}>
                      <LogOut size={13} /> Back
                    </button>
                  </div>

                  {isGlobalRole(pendingUser?.role) && (
                    <button type="button" className="lp-project-card lp-project-all" onClick={openAllProjects}>
                      <div className="lp-project-main">
                        <div>
                          <div className="lp-project-name">All Projects</div>
                          <div className="lp-project-meta">Management dashboard without project filter</div>
                        </div>
                        <span className="lp-project-code">GLOBAL</span>
                      </div>
                    </button>
                  )}

                  <div className="lp-project-search" style={{ marginTop: isGlobalRole(pendingUser?.role) ? 11 : 0 }}>
                    <Search size={14} />
                    <input
                      type="text"
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder="Search project name, code, city..."
                      className="lp-input"
                      style={{ paddingLeft:38 }}
                    />
                  </div>

                  {projectLoading && (
                    <div className="lp-project-state">
                      <Loader2 size={16} style={{ animation:'lp-spin 0.75s linear infinite', color:accent }} />
                      Loading active projects...
                    </div>
                  )}

                  {!projectLoading && projectError && (
                    <div className="lp-project-state" style={{ color:'#dc2626', borderColor:'#fecaca', background:'#fef2f2' }}>
                      <AlertCircle size={15} /> {projectError}
                    </div>
                  )}

                  {!projectLoading && !projectError && filteredProjects.length === 0 && (
                    <div className="lp-project-state">
                      <Building2 size={16} /> No active projects found.
                    </div>
                  )}

                  {!projectLoading && !projectError && filteredProjects.length > 0 && (
                    <div className="lp-project-list">
                      {filteredProjects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          className="lp-project-card"
                          disabled={pickingId === project.id}
                          onClick={() => openProject(project)}
                        >
                          <div className="lp-project-main">
                            <div>
                              <div className="lp-project-name">{project.name}</div>
                              <div className="lp-project-meta">
                                <MapPin size={11} />
                                <span>{project.city || project.location || project.client_name || 'Location not set'}</span>
                              </div>
                            </div>
                            <span className="lp-project-code">{project.project_code || project.code || 'PROJECT'}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="lp-footer">
              <p className="lp-footer-note">Contact your system administrator for access</p>
            </div>

          </div>

          <div className="lp-version">BCIM Construct ERP · v3.0</div>
        </div>

      </div>
    </>
  );
}
