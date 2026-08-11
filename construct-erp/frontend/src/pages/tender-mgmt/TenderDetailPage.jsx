import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Gavel, ArrowLeft, FileText, BarChart2, Upload, Clock, ShieldCheck,
  X, Trash2, Plus, CheckCircle, Circle,
} from 'lucide-react';
import { bidOpportunityAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_LABEL = {
  prospect: 'Registered', pursuing: 'Pursuing', bid_prepared: 'Bid Ready',
  submitted: 'Submitted', won: 'Won', lost: 'Lost', dropped: 'No Bid',
};
const STATUS_COLORS = {
  prospect:    'bg-slate-100 text-slate-900 border border-slate-200',
  pursuing:    'bg-blue-50 text-blue-700 border border-blue-200',
  bid_prepared:'bg-violet-50 text-violet-700 border border-violet-200',
  submitted:   'bg-amber-50 text-amber-700 border border-amber-200',
  won:         'bg-emerald-50 text-emerald-700 border border-emerald-200',
  lost:        'bg-red-50 text-red-700 border border-red-200',
  dropped:     'bg-slate-100 text-slate-900 font-medium border border-slate-200',
};
const STATUS_STEPS = ['prospect', 'pursuing', 'bid_prepared', 'submitted'];
const STATUS_TRANSITIONS = {
  prospect:     ['pursuing', 'dropped'],
  pursuing:     ['bid_prepared', 'dropped'],
  bid_prepared: ['submitted', 'dropped'],
  submitted:    ['won', 'lost'],
  won: [], lost: [], dropped: [],
};
const NEXT_BTN = {
  pursuing:     { label: 'Mark Pursuing',  cls: 'bg-blue-600 hover:bg-blue-700 text-white' },
  bid_prepared: { label: 'Bid Ready',      cls: 'bg-violet-600 hover:bg-violet-700 text-white' },
  submitted:    { label: 'Mark Submitted', cls: 'bg-amber-500 hover:bg-amber-600 text-white' },
  won:          { label: '🏆 Mark Won',     cls: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  lost:         { label: 'Mark Lost',      cls: 'border border-red-300 text-red-600 hover:bg-red-50 bg-white' },
  dropped:      { label: 'No Bid',         cls: 'border border-slate-300 text-slate-900 font-medium hover:bg-slate-50 bg-white' },
};

const fmtL = (n) => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export default function TenderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [tab, setTab]             = useState('overview');
  const [showTransition, setShowTransition] = useState(false);
  const [transStatus, setTransStatus]       = useState('');
  const [transNote, setTransNote]           = useState('');
  const [transReason, setTransReason]       = useState('');
  const [costEdit, setCostEdit]             = useState(null);
  const [emdEdit, setEmdEdit]               = useState(false);
  const [emdForm, setEmdForm]               = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['tender-detail', id],
    queryFn: () => bidOpportunityAPI.get(id).then(r => r.data?.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tender-detail', id] });
    qc.invalidateQueries({ queryKey: ['tender-mgmt-list'] });
    qc.invalidateQueries({ queryKey: ['tender-mgmt-stats'] });
  };

  const transMut = useMutation({
    mutationFn: (d) => bidOpportunityAPI.transition(id, d),
    onSuccess: () => {
      invalidate();
      toast.success('Status updated');
      setShowTransition(false);
      setTransNote('');
      setTransReason('');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: (d) => bidOpportunityAPI.update(id, d),
    onSuccess: () => { invalidate(); toast.success('Saved'); setEmdEdit(false); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const costSaveMut = useMutation({
    mutationFn: (items) => bidOpportunityAPI.saveCostItems(id, { items }),
    onSuccess: () => { invalidate(); toast.success('Cost estimate saved'); setCostEdit(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  if (isLoading) return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
      <p className="text-slate-500">Loading…</p>
    </div>
  );
  if (!data) return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
      <p className="text-slate-500">Tender not found</p>
    </div>
  );

  const t = data;
  const isFinal = ['won', 'lost', 'dropped'].includes(t.status);
  const transitions = STATUS_TRANSITIONS[t.status] || [];
  const stepIdx = STATUS_STEPS.indexOf(t.status);

  const tabs = [
    { key: 'overview',  label: 'Overview',      icon: FileText },
    { key: 'emd',       label: 'EMD & Dates',   icon: ShieldCheck },
    { key: 'cost',      label: 'Cost Estimate', icon: BarChart2 },
    { key: 'docs',      label: 'Documents',     icon: Upload },
    { key: 'activity',  label: 'Activity Log',  icon: Clock },
  ];

  const costItems = costEdit || t.cost_items || [];
  const costTotal = costItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  const probColor = (p) => p >= 70 ? 'text-emerald-600' : p >= 40 ? 'text-amber-500' : 'text-red-500';
  const probBg    = (p) => p >= 70 ? 'bg-emerald-500' : p >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9] space-y-5">

      {/* ── Back + Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/tender-management')}
          className="p-2 rounded-lg text-slate-900 font-medium hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-medium text-slate-900 truncate">{t.project_name}</h1>
          <p className="text-sm text-slate-500">
            {t.opportunity_number} · {t.client_name}
            {t.client_tender_ref ? ` · ${t.client_tender_ref}` : ''}
          </p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium shrink-0 ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>
          {STATUS_LABEL[t.status] || t.status}
        </span>
      </div>

      {/* ── Status stepper (active tenders) ── */}
      {!isFinal && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center">
            {STATUS_STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex flex-col items-center ${i <= stepIdx ? 'text-indigo-600' : 'text-slate-300'}`}>
                  {i <= stepIdx
                    ? <CheckCircle className="w-5 h-5" />
                    : <Circle className="w-5 h-5" />}
                  <span className={`text-xs mt-1 text-center leading-tight font-medium ${i <= stepIdx ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {STATUS_LABEL[s]}
                  </span>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-4 rounded-full ${i < stepIdx ? 'bg-indigo-400' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="flex gap-2 mt-5 flex-wrap">
            {transitions.map(s => (
              <button
                key={s}
                onClick={() => { setTransStatus(s); setShowTransition(true); }}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${NEXT_BTN[s]?.cls || ''}`}
              >
                {NEXT_BTN[s]?.label || s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Final status banner ── */}
      {isFinal && (
        <div className={`rounded-xl border p-4 ${
          t.status === 'won'  ? 'bg-emerald-50 border-emerald-200' :
          t.status === 'lost' ? 'bg-red-50 border-red-200' :
                                'bg-slate-50 border-slate-200'
        }`}>
          <p className={`font-medium ${
            t.status === 'won' ? 'text-emerald-700' : t.status === 'lost' ? 'text-red-700' : 'text-slate-500'
          }`}>
            {t.status === 'won' ? '🏆 Tender Won' : t.status === 'lost' ? '❌ Tender Lost' : 'No Bid Submitted'}
          </p>
          {(t.lost_reason || t.dropped_reason) && (
            <p className="text-sm text-slate-900 mt-1">{t.lost_reason || t.dropped_reason}</p>
          )}
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl shadow-sm p-1.5 overflow-x-auto">
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
              ${tab === tb.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-900 font-medium hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <tb.icon className="w-3.5 h-3.5" />
            {tb.label}
          </button>
        ))}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB: Overview                                                           */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left — Tender Details */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-2.5">
            <h3 className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Tender Details</h3>
            {[
              ['Register No.',        t.opportunity_number],
              ['Client Ref / NIT',    t.client_tender_ref || '—'],
              ['Client',              t.client_name],
              ['Client Type',         t.client_type || '—'],
              ['Location',            t.project_location || '—'],
              ['Category',            t.tender_category || '—'],
              ['Sector',              t.sector || '—'],
              ['Source',              t.source || '—'],
              ['Est. Bid Value',      fmtL(t.bid_value)],
              ['Our Bid Amount',      fmtL(t.our_bid_amount)],
              ['Submission Deadline', t.bid_submission_date ? dayjs(t.bid_submission_date).format('DD MMM YYYY') : '—'],
              ['Result Expected',     t.decision_date ? dayjs(t.decision_date).format('DD MMM YYYY') : '—'],
              ['Bid Manager',         t.bid_manager_name || '—'],
              ['Estimator',           t.estimator_name || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                <span className="text-slate-900 font-medium shrink-0">{k}</span>
                <span className="text-slate-900 font-medium text-right ml-4 font-medium">{v}</span>
              </div>
            ))}
          </div>

          {/* Right — Win Probability + NIT/Scope + Rank */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">Win Probability</h3>
              <div className={`text-5xl font-medium ${probColor(t.win_probability)}`}>
                {t.win_probability}%
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 mt-4">
                <div
                  className={`h-2.5 rounded-full transition-all ${probBg(t.win_probability)}`}
                  style={{ width: `${t.win_probability}%` }}
                />
              </div>
            </div>

            {t.notice_inviting_tender && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <h3 className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest mb-3">NIT / Scope</h3>
                <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">{t.notice_inviting_tender}</p>
              </div>
            )}

            {t.our_rank && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                <p className="text-xs text-slate-900 font-medium font-medium">Our Rank in Evaluation</p>
                <p className="text-3xl font-medium text-indigo-600 mt-1">L{t.our_rank}</p>
                {t.competitor_info && (
                  <p className="text-xs text-slate-900 font-medium mt-2">{t.competitor_info}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB: EMD & Dates                                                        */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'emd' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* EMD Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest">Earnest Money Deposit (EMD)</h3>
              {!emdEdit && (
                <button
                  onClick={() => { setEmdEdit(true); setEmdForm({ ...t }); }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Edit
                </button>
              )}
            </div>

            {emdEdit ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emdForm.emd_required || false}
                    onChange={e => setEmdForm(f => ({ ...f, emd_required: e.target.checked }))}
                    className="accent-indigo-600 w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">EMD Required</span>
                </label>

                {emdForm.emd_required && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-900 font-medium block mb-1">Amount (₹)</label>
                        <input
                          type="number"
                          value={emdForm.emd_amount || ''}
                          onChange={e => setEmdForm(f => ({ ...f, emd_amount: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-900 font-medium block mb-1">Mode</label>
                        <select
                          value={emdForm.emd_mode || 'DD'}
                          onChange={e => setEmdForm(f => ({ ...f, emd_mode: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                          {['DD', 'Bank Guarantee', 'Online Transfer', 'Exempted'].map(m => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={emdForm.emd_submitted || false}
                        onChange={e => setEmdForm(f => ({ ...f, emd_submitted: e.target.checked }))}
                        className="accent-indigo-600 w-4 h-4"
                      />
                      <span className="text-sm text-slate-700">EMD Submitted</span>
                    </label>

                    {emdForm.emd_submitted && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-900 font-medium block mb-1">Submitted Date</label>
                          <input
                            type="date"
                            value={emdForm.emd_submitted_date || ''}
                            onChange={e => setEmdForm(f => ({ ...f, emd_submitted_date: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-900 font-medium block mb-1">Ref / DD No.</label>
                          <input
                            value={emdForm.emd_ref_number || ''}
                            onChange={e => setEmdForm(f => ({ ...f, emd_ref_number: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-900 font-medium block mb-1">Valid Upto</label>
                          <input
                            type="date"
                            value={emdForm.emd_valid_upto || ''}
                            onChange={e => setEmdForm(f => ({ ...f, emd_valid_upto: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEmdEdit(false)}
                    className="flex-1 py-2 border border-slate-200 text-slate-900 font-medium rounded-lg text-sm hover:bg-slate-50"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => updateMut.mutate(emdForm)}
                    disabled={updateMut.isPending}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    {updateMut.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[
                  ['EMD Required',   t.emd_required ? 'Yes' : 'No'],
                  ['Amount',         fmtL(t.emd_amount)],
                  ['Mode',           t.emd_mode || '—'],
                  ['Submitted',      t.emd_submitted ? '✓ Yes' : 'Not Yet'],
                  ['Submitted Date', t.emd_submitted_date ? dayjs(t.emd_submitted_date).format('DD MMM YYYY') : '—'],
                  ['Ref / DD No.',   t.emd_ref_number || '—'],
                  ['Valid Upto',     t.emd_valid_upto ? dayjs(t.emd_valid_upto).format('DD MMM YYYY') : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <span className="text-slate-500">{k}</span>
                    <span className={`font-medium ${k === 'Submitted' && t.emd_submitted ? 'text-emerald-600' : 'text-black'}`}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Key Dates + Our Submission */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest">Key Dates</h3>
                {!emdEdit && (
                  <button
                    onClick={() => { setEmdEdit(true); setEmdForm({ ...t }); }}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Edit
                  </button>
                )}
              </div>
              <div className="space-y-2.5">
                {[
                  ['Pre-Bid Meeting',    t.pre_bid_date ? dayjs(t.pre_bid_date).format('DD MMM YYYY') : '—'],
                  ['Pre-Bid Venue',      t.pre_bid_venue || '—'],
                  ['Submission Deadline',t.bid_submission_date ? dayjs(t.bid_submission_date).format('DD MMM YYYY') : '—'],
                  ['Technical Opening',  t.bid_opening_date ? dayjs(t.bid_opening_date).format('DD MMM YYYY') : '—'],
                  ['Financial Opening',  t.financial_opening_date ? dayjs(t.financial_opening_date).format('DD MMM YYYY') : '—'],
                  ['Result Expected',    t.decision_date ? dayjs(t.decision_date).format('DD MMM YYYY') : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <span className="text-slate-500">{k}</span>
                    <span className="text-slate-900 font-medium font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest mb-4">Our Submission</h3>
              <div className="space-y-2.5">
                {[
                  ['Our Bid Amount',      fmtL(t.our_bid_amount)],
                  ['Date Submitted',      t.submitted_at ? dayjs(t.submitted_at).format('DD MMM YYYY') : '—'],
                  ['Our Rank (L#)',       t.our_rank ? `L${t.our_rank}` : '—'],
                  ['Evaluation Remarks', t.evaluation_remarks || '—'],
                  ['Competitor Info',    t.competitor_info || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <span className="text-slate-900 font-medium shrink-0">{k}</span>
                    <span className="text-slate-900 font-medium text-right max-w-[60%]">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB: Cost Estimate                                                      */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'cost' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium text-black">Cost Estimate</h3>
            <div className="flex gap-2">
              {costEdit ? (
                <>
                  <button
                    onClick={() => setCostEdit(null)}
                    className="px-3 py-1.5 border border-slate-200 text-slate-900 font-medium rounded-lg text-sm hover:bg-slate-50"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => costSaveMut.mutate(costEdit)}
                    disabled={costSaveMut.isPending}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm"
                  >
                    {costSaveMut.isPending ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setCostEdit(
                    t.cost_items?.length
                      ? [...t.cost_items]
                      : [{ category: '', description: '', quantity: '', unit: '', rate: '', amount: '', margin_pct: 0 }]
                  )}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Comparison bar */}
          {t.bid_value && costTotal > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-6 text-sm">
              <div>
                <p className="text-slate-900 font-medium text-xs">Est. Bid Value</p>
                <p className="text-slate-900 font-medium font-bold">{fmtL(t.bid_value)}</p>
              </div>
              <div>
                <p className="text-slate-900 font-medium text-xs">Cost Total</p>
                <p className="text-slate-900 font-medium font-bold">{fmtL(costTotal)}</p>
              </div>
              <div>
                <p className="text-slate-900 font-medium text-xs">Gross Margin</p>
                <p className={`font-medium ${(t.bid_value - costTotal) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {fmtL(t.bid_value - costTotal)} ({t.bid_value > 0 ? ((t.bid_value - costTotal) / t.bid_value * 100).toFixed(1) : 0}%)
                </p>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Category', 'Description', 'Qty', 'Unit', 'Rate (₹)', 'Amount (₹)', 'Margin %', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-slate-900 font-medium text-xs whitespace-nowrap uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/60">
                    {costEdit ? (
                      <>
                        <td className="px-3 py-2">
                          <input value={item.category || ''} onChange={e => { const a=[...costEdit]; a[idx].category=e.target.value; setCostEdit(a); }}
                            className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={item.description || ''} onChange={e => { const a=[...costEdit]; a[idx].description=e.target.value; setCostEdit(a); }}
                            className="w-44 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={item.quantity || ''} onChange={e => { const a=[...costEdit]; a[idx].quantity=e.target.value; a[idx].amount=((parseFloat(e.target.value)||0)*(parseFloat(a[idx].rate)||0)).toFixed(2); setCostEdit(a); }}
                            className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={item.unit || ''} onChange={e => { const a=[...costEdit]; a[idx].unit=e.target.value; setCostEdit(a); }}
                            className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={item.rate || ''} onChange={e => { const a=[...costEdit]; a[idx].rate=e.target.value; a[idx].amount=((parseFloat(a[idx].quantity)||0)*(parseFloat(e.target.value)||0)).toFixed(2); setCostEdit(a); }}
                            className="w-28 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </td>
                        <td className="px-3 py-2 text-slate-900 text-xs">{item.amount ? `₹${parseFloat(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                        <td className="px-3 py-2">
                          <input type="number" value={item.margin_pct || 0} onChange={e => { const a=[...costEdit]; a[idx].margin_pct=e.target.value; setCostEdit(a); }}
                            className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => { const a=[...costEdit]; a.splice(idx,1); setCostEdit(a); }}
                            className="text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-slate-900 font-medium text-xs">{item.category}</td>
                        <td className="px-3 py-2.5 text-slate-700">{item.description}</td>
                        <td className="px-3 py-2.5 text-slate-900 font-medium text-xs">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-slate-900 font-medium text-xs">{item.unit}</td>
                        <td className="px-3 py-2.5 text-slate-900 text-xs">{fmtL(item.rate)}</td>
                        <td className="px-3 py-2.5 text-slate-900 font-medium font-medium">{fmtL(item.amount)}</td>
                        <td className="px-3 py-2.5 text-slate-900 font-medium text-xs">{item.margin_pct}%</td>
                        <td />
                      </>
                    )}
                  </tr>
                ))}

                {costEdit && (
                  <tr>
                    <td colSpan={8} className="px-3 py-2">
                      <button
                        onClick={() => setCostEdit(c => [...c, { category:'', description:'', quantity:'', unit:'', rate:'', amount:'', margin_pct:0 }])}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        <Plus className="w-3 h-3" /> Add Row
                      </button>
                    </td>
                  </tr>
                )}

                {costTotal > 0 && (
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={5} className="px-3 py-2.5 text-slate-900 font-medium text-sm">Total</td>
                    <td className="px-3 py-2.5 text-slate-900 font-bold">{fmtL(costTotal)}</td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
            {costItems.length === 0 && !costEdit && (
              <div className="text-center py-10 text-slate-900 font-medium text-sm">No cost estimate — click Edit to start</div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB: Documents                                                          */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'docs' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <label className="block text-xs text-slate-900 font-medium mb-2">Upload Documents</label>
            <input
              type="file"
              multiple
              onChange={async (e) => {
                const fd = new FormData();
                Array.from(e.target.files).forEach(f => fd.append('files', f));
                fd.append('doc_type', 'general');
                try {
                  await bidOpportunityAPI.uploadDocs(id, fd);
                  invalidate();
                  toast.success('Uploaded');
                } catch {
                  toast.error('Upload failed');
                }
                e.target.value = '';
              }}
              className="block text-sm text-slate-900 font-medium
                file:mr-3 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:bg-indigo-600 file:text-white file:text-sm file:cursor-pointer
                hover:file:bg-indigo-700"
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {(t.documents || []).length === 0 ? (
              <div className="text-center py-10 text-slate-900 font-medium text-sm">No documents uploaded</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['File Name', 'Type', 'Uploaded By', 'Date', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-slate-900 font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.documents.map(doc => (
                    <tr key={doc.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-700">{doc.file_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full">
                          {doc.doc_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{doc.uploaded_by_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-900 font-medium text-xs">{dayjs(doc.uploaded_at).format('DD MMM YY HH:mm')}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={async () => {
                            await bidOpportunityAPI.removeDoc(id, doc.id);
                            invalidate();
                            toast.success('Deleted');
                          }}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB: Activity Log                                                       */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'activity' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-medium text-slate-900 font-medium mb-6">Activity Timeline</h3>
          {(t.activity_log || []).length === 0 ? (
            <p className="text-slate-900 font-medium text-sm">No activity recorded yet</p>
          ) : (
            <div className="relative">
              <div className="absolute left-2.5 top-1 bottom-1 w-px bg-slate-100" />
              <div className="space-y-6">
                {t.activity_log.map(log => (
                  <div key={log.id} className="flex gap-4">
                    <div className="w-5 h-5 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center z-10 mt-0.5 shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {log.to_status && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[log.to_status] || 'bg-slate-100 text-slate-600'}`}>
                            {STATUS_LABEL[log.to_status] || log.to_status}
                          </span>
                        )}
                        {log.from_status && (
                          <span className="text-xs text-slate-400">
                            from {STATUS_LABEL[log.from_status] || log.from_status}
                          </span>
                        )}
                        {!log.to_status && (
                          <span className="text-xs text-slate-900 font-medium capitalize">{log.action}</span>
                        )}
                      </div>
                      {log.note && <p className="text-sm text-slate-900 mt-1">{log.note}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">{log.performed_by_name || 'System'}</span>
                        <span className="text-xs text-slate-200">·</span>
                        <span className="text-xs text-slate-400">{dayjs(log.performed_at).format('DD MMM YYYY, HH:mm')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* Status Transition Modal                                                 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {showTransition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-base font-medium text-black">
                {NEXT_BTN[transStatus]?.label || `Move to ${transStatus}`}
              </h2>
              <button
                onClick={() => setShowTransition(false)}
                className="p-1.5 text-slate-900 font-medium hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1.5">Note (optional)</label>
                <textarea
                  value={transNote}
                  onChange={e => setTransNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 h-20 resize-none"
                  placeholder="Add a note about this status change…"
                />
              </div>
              {(transStatus === 'lost' || transStatus === 'dropped') && (
                <div>
                  <label className="block text-xs text-slate-900 font-medium mb-1.5">
                    {transStatus === 'lost' ? 'Reason for Loss' : 'Reason for No Bid'}
                  </label>
                  <textarea
                    value={transReason}
                    onChange={e => setTransReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 h-16 resize-none"
                    placeholder={transStatus === 'lost' ? 'e.g. Higher rate, technical disqualification…' : 'e.g. Insufficient resources, not in scope…'}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 p-5 pt-0">
              <button
                onClick={() => setShowTransition(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-900 font-medium rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={transMut.isPending}
                onClick={() => transMut.mutate({
                  status: transStatus,
                  note: transNote,
                  lost_reason: transStatus === 'lost' ? transReason : undefined,
                  dropped_reason: transStatus === 'dropped' ? transReason : undefined,
                })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-colors ${
                  transStatus === 'won'    ? 'bg-emerald-600 hover:bg-emerald-700' :
                  transStatus === 'lost' || transStatus === 'dropped' ? 'bg-red-600 hover:bg-red-700' :
                                             'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {transMut.isPending ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
