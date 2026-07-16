// src/pages/admin/MailCenterPage.jsx — Administration: Mail Center
// One place to see mail configuration status and send/trigger every ERP email.
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { mailAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import { Mail, Send, CheckCircle2, XCircle, RefreshCw, CalendarDays, FlaskConical } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

function StatusPill({ ok, label }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#fff', border: `1px solid ${Theme.border}` }}>
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
      <span className="text-xs font-semibold" style={{ color: Theme.navyDark }}>{label}</span>
      <span className={clsx('ml-auto text-[10px] font-bold uppercase', ok ? 'text-emerald-600' : 'text-red-500')}>
        {ok ? 'Ready' : 'Not set'}
      </span>
    </div>
  );
}

function MailCard({ icon: Icon, title, description, children, onSend, pending, sendLabel = 'Send Now' }) {
  return (
    <div className="rounded-xl p-5" style={{ background: Theme.cardBg, border: `1px solid ${Theme.border}` }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: Theme.pageBg }}>
          <Icon className="w-4.5 h-4.5" style={{ color: Theme.navy }} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: Theme.navyDark }}>{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
      <button
        onClick={onSend}
        disabled={pending}
        className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition shadow-sm disabled:opacity-60"
        style={{ background: Theme.navy, color: '#fff' }}
      >
        <Send className="w-3.5 h-3.5" />
        {pending ? 'Sending…' : sendLabel}
      </button>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-xs rounded-lg border outline-none focus:ring-2 focus:ring-blue-100';
const inputStyle = { borderColor: Theme.border, color: Theme.navyDark };

export default function MailCenterPage() {
  const { data: status, refetch, isFetching } = useQuery({
    queryKey: ['mail-status'],
    queryFn: () => mailAPI.status().then(r => r.data),
  });

  // Per-card optional overrides
  const [digestTo, setDigestTo] = useState('');
  const [weeklyTo, setWeeklyTo] = useState('');
  const [weeklyFrom, setWeeklyFrom] = useState('');
  const [weeklyToDate, setWeeklyToDate] = useState('');
  const [testTo, setTestTo] = useState('');

  const provider = status?.graph_configured ? 'Microsoft Graph' : status?.smtp_configured ? 'SMTP' : 'None';
  const canSend = status?.graph_configured || status?.smtp_configured;

  const summarize = (res) => {
    const rows = res?.results || [];
    const items = rows.reduce((s, r) => s + (r.items || 0), 0);
    const to = rows[0]?.recipients?.join(', ') || res?.sent_to?.join?.(', ') || '';
    return { items, to };
  };

  const digestMut = useMutation({
    mutationFn: () => mailAPI.dailyDigest({ recipients: digestTo || undefined }).then(r => r.data),
    onMutate: () => toast.loading('Sending daily digest…', { id: 'm' }),
    onSuccess: (res) => { const { items, to } = summarize(res); toast.success(`Daily digest sent${to ? ` to ${to}` : ''} · ${items} item(s)`, { id: 'm', duration: 6000 }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to send', { id: 'm' }),
  });

  const weeklyMut = useMutation({
    mutationFn: () => mailAPI.weeklySummary({
      recipients: weeklyTo || undefined,
      fromDate: weeklyFrom || undefined,
      toDate: weeklyToDate || undefined,
    }).then(r => r.data),
    onMutate: () => toast.loading('Sending weekly summary…', { id: 'm' }),
    onSuccess: (res) => { const { items, to } = summarize(res); toast.success(`Weekly summary sent${to ? ` to ${to}` : ''} · ${items} item(s)`, { id: 'm', duration: 6000 }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to send', { id: 'm' }),
  });

  const erpReportMut = useMutation({
    mutationFn: () => mailAPI.erpDailyReport().then(r => r.data),
    onMutate: () => toast.loading('Sending ERP update report…', { id: 'm' }),
    onSuccess: (res) => toast.success(`Report sent to ${(res.sent_to || []).join(', ')} · ${res.commits ?? 0} change(s)`, { id: 'm', duration: 6000 }),
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to send', { id: 'm' }),
  });

  const testMut = useMutation({
    mutationFn: () => mailAPI.test(testTo).then(r => r.data),
    onMutate: () => toast.loading('Sending test email…', { id: 'm' }),
    onSuccess: () => toast.success(`Test email sent to ${testTo}`, { id: 'm' }),
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to send', { id: 'm' }),
  });

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Mail Center"
        subtitle="Configuration status and one-click sending for every ERP email"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Mail Center' }]}
        actions={
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm"
            style={{ background: '#fff', color: Theme.navyDark }}>
            <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} /> Refresh
          </button>
        }
      />

      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        {/* Configuration status */}
        <div className="rounded-xl p-5" style={{ background: Theme.cardBg, border: `1px solid ${Theme.border}` }}>
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-4 h-4" style={{ color: Theme.navy }} />
            <h2 className="text-sm font-bold" style={{ color: Theme.navyDark }}>Mail Configuration</h2>
            <span className={clsx('ml-auto text-[10px] font-bold uppercase px-2.5 py-1 rounded-full',
              canSend ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
              Provider: {provider}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <StatusPill ok={status?.graph_configured} label="Microsoft Graph" />
            <StatusPill ok={status?.smtp_configured} label="SMTP fallback" />
            <StatusPill ok={!!status?.mail_from} label={`From: ${status?.mail_from || '—'}`} />
            <StatusPill ok={status?.azure_tenant_set} label="Azure Tenant ID" />
            <StatusPill ok={status?.azure_client_set} label="Azure Client ID" />
            <StatusPill ok={status?.azure_secret_set} label="Azure Secret" />
          </div>
          {!canSend && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              No mail provider is configured — emails will not be delivered. Set Microsoft Graph (Azure) or SMTP credentials on the server.
            </p>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Leave the recipient field blank on any card to use the default recipients configured on the server
            (<code>DAILY_ACTIVITY_DIGEST_EMAILS</code>, default <code>it@bcim.in</code>).
          </p>
        </div>

        {/* Mailers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MailCard
            icon={CalendarDays}
            title="Daily Activity Digest"
            description="All-departments summary of everything logged today (also auto-sent 8 PM IST)."
            onSend={() => digestMut.mutate()}
            pending={digestMut.isPending}
          >
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Recipients (optional)</label>
            <input className={inputCls} style={inputStyle} placeholder="it@bcim.in, md@bcim.in"
              value={digestTo} onChange={e => setDigestTo(e.target.value)} />
          </MailCard>

          <MailCard
            icon={CalendarDays}
            title="Weekly Activity Summary"
            description="All-departments activity across a date range (defaults Monday → today)."
            onSend={() => weeklyMut.mutate()}
            pending={weeklyMut.isPending}
          >
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">From</label>
                <input type="date" className={inputCls} style={inputStyle} value={weeklyFrom} onChange={e => setWeeklyFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">To</label>
                <input type="date" className={inputCls} style={inputStyle} value={weeklyToDate} onChange={e => setWeeklyToDate(e.target.value)} />
              </div>
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Recipients (optional)</label>
            <input className={inputCls} style={inputStyle} placeholder="it@bcim.in, md@bcim.in"
              value={weeklyTo} onChange={e => setWeeklyTo(e.target.value)} />
          </MailCard>

          <MailCard
            icon={Send}
            title="ERP Daily Update Report"
            description="Today's ERP activity + system changes deployed, to MD & IT."
            onSend={() => erpReportMut.mutate()}
            pending={erpReportMut.isPending}
          >
            <p className="text-[11px] text-slate-400">Fixed recipients: stephen@bcim.in, it@bcim.in</p>
          </MailCard>

          <MailCard
            icon={FlaskConical}
            title="Test Email"
            description="Send a diagnostic test email to verify delivery is working."
            onSend={() => testTo ? testMut.mutate() : toast.error('Enter a recipient address')}
            pending={testMut.isPending}
            sendLabel="Send Test"
          >
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Send to</label>
            <input className={inputCls} style={inputStyle} placeholder="you@bcim.in"
              value={testTo} onChange={e => setTestTo(e.target.value)} />
          </MailCard>
        </div>
      </div>
    </div>
  );
}
