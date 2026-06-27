// src/pages/stores/StoresPettyCashPage.jsx
// Stores Petty Cash Tracker — site-level cash book mirroring the Excel register.
// 7 tabs: Dashboard · HO Receipts · Local Purchase · Salary Advances · Sub Contractor Advances · Ledger · Analytics · Budgets
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  Wallet, Plus, Search, Trash2, X, Package,
  ShoppingBag, Users, BarChart2, BookOpen, AlertTriangle,
  CheckCircle, Clock, TrendingUp, Printer, RefreshCw,
  Paperclip, Eye, Upload, Send, ThumbsUp, ThumbsDown,
  Rows3, CalendarRange, Hash, Mail, FileDown,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLocation } from 'react-router-dom';
import { PageHeader, Theme } from '../../theme';
import { storesPettyCashAPI, projectAPI, uploadAPI, subcontractorAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';

// ── Helpers ──────────────────────────────────────────────────────────────────
const inr = (v) =>
  '₹ ' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const F  = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white';
const FS = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white';

const DEFAULT_BUDGETS = {
  // Original heads
  Fuel: 3000, Safety: 12000, Stationery: 5000, Pantry: 3000,
  Transport: 5000, Utilities: 5000,
  // Construction materials
  Cement: 20000, Aggregates: 15000, Steel: 25000, Bricks: 10000, Sand: 8000,
  // Site items
  Consumables: 10000, Electrical: 8000, Plumbing: 5000, Timber: 8000, Paint: 5000,
  // People & movement
  Labour: 20000, Conveyance: 5000, Transport_Charges: 5000,
  // Site running
  Repairs: 8000, Medical: 3000, Housekeeping: 3000,
  // General
  Materials: 15000, Miscellaneous: 5000,
};

const CATEGORIES = Object.keys(DEFAULT_BUDGETS);

const CATEGORY_STYLE = {
  Fuel:              { bg: 'bg-amber-100',   text: 'text-amber-800',   bar: '#F59E0B' },
  Safety:            { bg: 'bg-red-100',     text: 'text-red-800',     bar: '#EF4444' },
  Stationery:        { bg: 'bg-blue-100',    text: 'text-blue-800',    bar: '#3B82F6' },
  Pantry:            { bg: 'bg-green-100',   text: 'text-green-800',   bar: '#22C55E' },
  Transport:         { bg: 'bg-orange-100',  text: 'text-orange-800',  bar: '#F97316' },
  Transport_Charges: { bg: 'bg-orange-100',  text: 'text-orange-800',  bar: '#F97316' },
  Utilities:         { bg: 'bg-purple-100',  text: 'text-purple-800',  bar: '#A855F7' },
  Materials:         { bg: 'bg-slate-100',   text: 'text-slate-700',   bar: '#64748B' },
  Labour:            { bg: 'bg-teal-100',    text: 'text-teal-800',    bar: '#14B8A6' },
  Conveyance:        { bg: 'bg-cyan-100',    text: 'text-cyan-800',    bar: '#06B6D4' },
  Repairs:           { bg: 'bg-indigo-100',  text: 'text-indigo-800',  bar: '#6366F1' },
  Medical:           { bg: 'bg-rose-100',    text: 'text-rose-800',    bar: '#F43F5E' },
  Miscellaneous:     { bg: 'bg-gray-100',    text: 'text-gray-700',    bar: '#9CA3AF' },
  Cement:            { bg: 'bg-stone-100',   text: 'text-stone-800',   bar: '#78716C' },
  Aggregates:        { bg: 'bg-yellow-100',  text: 'text-yellow-800',  bar: '#EAB308' },
  Steel:             { bg: 'bg-zinc-100',    text: 'text-zinc-800',    bar: '#71717A' },
  Bricks:            { bg: 'bg-red-100',     text: 'text-red-900',     bar: '#B91C1C' },
  Sand:              { bg: 'bg-yellow-50',   text: 'text-yellow-900',  bar: '#CA8A04' },
  Consumables:       { bg: 'bg-lime-100',    text: 'text-lime-800',    bar: '#84CC16' },
  Electrical:        { bg: 'bg-sky-100',     text: 'text-sky-800',     bar: '#0EA5E9' },
  Plumbing:          { bg: 'bg-blue-50',     text: 'text-blue-900',    bar: '#1D4ED8' },
  Timber:            { bg: 'bg-orange-50',   text: 'text-orange-900',  bar: '#C2410C' },
  Paint:             { bg: 'bg-pink-100',    text: 'text-pink-800',    bar: '#EC4899' },
  Housekeeping:      { bg: 'bg-emerald-100', text: 'text-emerald-800', bar: '#10B981' },
};

function categoryOf(text = '') {
  const d = (text || '').toLowerCase();
  if (/petrol|fuel|diesel/.test(d))                                                        return 'Fuel';
  if (/medical|medicine|first.?aid|hospital|clinic|bandage|ointment/.test(d))             return 'Medical';
  if (/safety|glove|shoe|flag|helmet|badge|banner|ppe/.test(d))                           return 'Safety';
  if (/cement|opc|ppc|53 grade|43 grade/.test(d))                                         return 'Cement';
  if (/aggregate|jelly|gravel|grit|m.?sand|quarry/.test(d))                               return 'Aggregates';
  if (/sand|fine aggr/.test(d))                                                            return 'Sand';
  if (/steel|tmt|rebar|rod|bar bending|ms plate|angle/.test(d))                           return 'Steel';
  if (/brick|block|aac|fly.?ash/.test(d))                                                  return 'Bricks';
  if (/electrical|cable|wire|switch|mcb|conduit|fitting|bulb|led|lamp/.test(d))           return 'Electrical';
  if (/plumb|pipe|fitting|pvc|cpvc|upvc|valve|tap|sanitary/.test(d))                      return 'Plumbing';
  if (/timber|wood|plywood|shuttering|plank|batten/.test(d))                              return 'Timber';
  if (/paint|primer|putty|distemper|enamel|varnish|thinner/.test(d))                      return 'Paint';
  if (/consumable|tool|drill|bit|blade|abrasive|sandpaper|nails|screw/.test(d))           return 'Consumables';
  if (/stationery|stationary|file|paper|pen|whitener|stamp|calc|stapler|a4|xerox|print/.test(d)) return 'Stationery';
  if (/pantry|sweet|food|sugar|tea|poha|zeera|mixture|coconut|biscuit|snack/.test(d))    return 'Pantry';
  if (/housekeep|cleaning|broom|phenyl|soap|dustbin|mop/.test(d))                         return 'Housekeeping';
  if (/labour|labor|wage|mason|helper|coolie|mazdoor|hamali/.test(d))                     return 'Labour';
  if (/loading|unloading/.test(d))                                                         return 'Labour';
  if (/conveyance|travel|parking|toll/.test(d))                                            return 'Conveyance';
  if (/transport|freight|lorry|truck|vehicle|bus|ticket|auto|cab|uber|ola/.test(d))       return 'Transport_Charges';
  if (/repair|maintenance|servic|spare|puncture/.test(d))                                 return 'Repairs';
  if (/electric|power|utility|mobile|recharge|internet/.test(d))                          return 'Utilities';
  if (/misc|sundry|other/.test(d))                                                        return 'Miscellaneous';
  return 'Materials';
}

const STATUS_STYLE = {
  Pending:     { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Pending'      },
  ph_approved: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'PH Approved'  },
  Approved:    { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Approved'     },
  Rejected:    { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Rejected'     },
};

function Badge({ label, className = '' }) {
  const s = STATUS_STYLE[label] || { bg: 'bg-slate-100', text: 'text-slate-600' };
  return (
    <span className={clsx('inline-block text-xs font-semibold px-2 py-0.5 rounded-full', s.bg, s.text, className)}>
      {label}
    </span>
  );
}

function CatBadge({ cat }) {
  const s = CATEGORY_STYLE[cat] || CATEGORY_STYLE.Materials;
  return (
    <span className={clsx('inline-block text-xs font-medium px-2 py-0.5 rounded-full', s.bg, s.text)}>
      {cat}
    </span>
  );
}

function Lbl({ children, req }) {
  return (
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {children}{req && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent = 'border-indigo-400', valueClass = 'text-slate-800' }) {
  return (
    <div className={clsx('bg-white rounded-xl border border-slate-200 p-4 border-l-4', accent)}>
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={clsx('text-xl font-bold', valueClass)}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────
function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map(({ label, value, color }, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-slate-500 font-semibold">{Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          <div className="w-full rounded-t" style={{ background: color, height: `${Math.max((value / max) * 88, 4)}px`, transition: 'height .4s ease' }} />
          <span className="text-[9px] text-slate-400 text-center leading-tight">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Print helper ─────────────────────────────────────────────────────────────
function printStatement({ entries, advances, scAdvances, receipts, projectName, period }) {
  const fmt  = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sc   = scAdvances || [];
  const totalRec   = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const totalLP    = entries.reduce((s, r) => s + Number(r.amount), 0);
  const totalAdv   = advances.reduce((s, r) => s + Number(r.amount), 0);
  const totalScAdv = sc.reduce((s, r) => s + Number(r.amount), 0);
  const balance    = totalRec - totalLP - totalAdv - totalScAdv;

  const TD = 'border:1px solid #000;padding:3px 5px;vertical-align:top;';
  const TH = 'border:1px solid #000;padding:4px 5px;font-weight:700;background:#f0f0f0;text-align:center;';

  const recRows = receipts.length
    ? receipts.map((r, i) => `<tr>
        <td style="${TD}text-align:center;">${i + 1}</td>
        <td style="${TD}">${dayjs(r.receipt_date).format('DD-MM-YYYY')}</td>
        <td style="${TD}">${r.voucher_no || '–'}</td>
        <td style="${TD}">${r.received_by || '–'}</td>
        <td style="${TD}text-align:right;font-weight:600;">${fmt(r.amount)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="${TD}text-align:center;color:#666;font-style:italic;padding:8px;">No receipts recorded</td></tr>`;

  const lpRows = entries.length
    ? entries.map((r, i) => `<tr>
        <td style="${TD}text-align:center;">${i + 1}</td>
        <td style="${TD}">${dayjs(r.entry_date).format('DD-MM-YYYY')}</td>
        <td style="${TD}font-family:monospace;font-size:10px;">${r.pc_voucher_no || '–'}</td>
        <td style="${TD}">${r.supplier || '–'}</td>
        <td style="${TD}">${(r.items || []).map(it => it.material_name).filter(Boolean).join(', ') || '–'}</td>
        <td style="${TD}">${r.invoice_no || '–'}</td>
        <td style="${TD}text-align:right;font-weight:600;">${fmt(r.amount)}</td>
      </tr>`).join('')
    : `<tr><td colspan="7" style="${TD}text-align:center;color:#666;font-style:italic;padding:8px;">No approved local purchases</td></tr>`;

  const advRows = advances.length
    ? advances.map((r, i) => `<tr>
        <td style="${TD}text-align:center;">${i + 1}</td>
        <td style="${TD}">${dayjs(r.advance_date).format('DD-MM-YYYY')}</td>
        <td style="${TD}">${r.payee_name || '–'}</td>
        <td style="${TD}">${r.description || '–'}</td>
        <td style="${TD}text-align:right;font-weight:600;">${fmt(r.amount)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="${TD}text-align:center;color:#666;font-style:italic;padding:8px;">No salary advances recorded</td></tr>`;

  const scRows = sc.length
    ? sc.map((r, i) => `<tr>
        <td style="${TD}text-align:center;">${i + 1}</td>
        <td style="${TD}">${dayjs(r.advance_date).format('DD-MM-YYYY')}</td>
        <td style="${TD}">${r.vendor_name || '–'}</td>
        <td style="${TD}">${r.wo_number || '–'}</td>
        <td style="${TD}text-align:right;font-weight:600;">${fmt(r.amount)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="${TD}text-align:center;color:#666;font-style:italic;padding:8px;">No SC advances recorded</td></tr>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Petty Cash Statement${projectName ? ' — ' + projectName : ''}</title>
  <style>
    @media print {
      @page { margin: 14mm 12mm 36mm 12mm; size: A4; }
      .pc-doc-head    { display: table-header-group; }
      .pc-foot-spacer { display: table-footer-group; }
      .pc-sig-footer  { position: fixed; bottom: 0; left: 0; right: 0; padding: 0 12mm 6mm; background: #fff; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body  { font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000; margin: 0; padding: 14mm 12mm 0; }
    h2    { font-size: 12px; font-weight: 700; text-decoration: underline; margin: 14px 0 5px; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>

<table style="width:100%;border-collapse:collapse;">
  <!-- doc code repeats on every page -->
  <thead class="pc-doc-head">
    <tr><td style="border:none;padding:0 0 4px;">
      <div style="text-align:right;font-weight:700;font-size:11px;">BCIM-STO-PC-01</div>
    </td></tr>
  </thead>
  <!-- spacer reserves footer band on every page -->
  <tfoot class="pc-foot-spacer">
    <tr><td style="border:none;padding:0;height:34mm;"></td></tr>
  </tfoot>
  <tbody>
    <tr><td style="border:none;padding:0;">

      <!-- TITLE + LOGO -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <img src="/bcim-logo.png" alt="BCIM" style="height:40px;object-fit:contain;">
        <div style="flex:1;text-align:center;">
          <h1 style="font-size:17px;font-weight:700;letter-spacing:0.5px;margin:0;">PETTY CASH STATEMENT</h1>
          ${projectName ? `<div style="font-size:12px;margin-top:2px;">${projectName}</div>` : ''}
        </div>
        <div style="width:40px;"></div>
      </div>

      <!-- COMPANY + META -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
        <tr>
          <td style="width:58%;vertical-align:top;padding:0;border:none;">
            <div style="font-weight:700;">BCIM ENGINEERING PRIVATE LIMITED</div>
            <div style="line-height:1.4;">#11, B Wing, Divyasree Chambers, O'Shaughnessy Road</div>
            <div>Bangalore, Karnataka &ndash; 560025</div>
            <div style="font-weight:700;margin-top:2px;">GSTIN : 29AAHCB6485A1ZL</div>
          </td>
          <td style="vertical-align:top;padding:0;border:none;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="font-weight:700;padding:1px 8px 1px 0;white-space:nowrap;vertical-align:top;border:none;">Project:</td>
                <td style="padding:1px 0;font-weight:700;border:none;">${projectName || '&mdash;'}</td>
              </tr>
              <tr>
                <td style="font-weight:700;padding:1px 8px 1px 0;white-space:nowrap;vertical-align:top;border:none;">Date:</td>
                <td style="padding:1px 0;border:none;">${dayjs().format('DD-MM-YYYY')}</td>
              </tr>
              ${period ? `<tr>
                <td style="font-weight:700;padding:1px 8px 1px 0;white-space:nowrap;vertical-align:top;border:none;">Period:</td>
                <td style="padding:1px 0;border:none;">${period}</td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
      </table>
      <div style="border-top:1.5px solid #000;margin-bottom:10px;"></div>

      <!-- A. CASH RECEIVED -->
      <h2>A. Cash Received from HO</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead>
          <tr>
            <th style="${TH}width:34px;">Sl No</th>
            <th style="${TH}width:88px;">Date</th>
            <th style="${TH}width:100px;">Voucher No</th>
            <th style="${TH}text-align:left;">Received By</th>
            <th style="${TH}width:120px;text-align:right;">Amount (&#8377;)</th>
          </tr>
        </thead>
        <tbody>${recRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="${TD}text-align:right;font-weight:700;background:#f0f0f0;">TOTAL RECEIVED</td>
            <td style="${TD}text-align:right;font-weight:700;font-size:12px;background:#f0f0f0;">${fmt(totalRec)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- B. LOCAL PURCHASES -->
      <h2>B. Local Purchases (Approved)</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead>
          <tr>
            <th style="${TH}width:34px;">Sl No</th>
            <th style="${TH}width:88px;">Date</th>
            <th style="${TH}width:110px;">Voucher No</th>
            <th style="${TH}width:130px;">Supplier</th>
            <th style="${TH}text-align:left;">Materials</th>
            <th style="${TH}width:80px;">Invoice No</th>
            <th style="${TH}width:110px;text-align:right;">Amount (&#8377;)</th>
          </tr>
        </thead>
        <tbody>${lpRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="6" style="${TD}text-align:right;font-weight:700;background:#f0f0f0;">TOTAL LOCAL PURCHASE</td>
            <td style="${TD}text-align:right;font-weight:700;font-size:12px;background:#f0f0f0;">${fmt(totalLP)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- C. SALARY ADVANCES -->
      <h2>C. Salary Advances</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead>
          <tr>
            <th style="${TH}width:34px;">Sl No</th>
            <th style="${TH}width:88px;">Date</th>
            <th style="${TH}width:160px;">Name</th>
            <th style="${TH}text-align:left;">Description</th>
            <th style="${TH}width:120px;text-align:right;">Amount (&#8377;)</th>
          </tr>
        </thead>
        <tbody>${advRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="${TD}text-align:right;font-weight:700;background:#f0f0f0;">TOTAL SALARY ADVANCES</td>
            <td style="${TD}text-align:right;font-weight:700;font-size:12px;background:#f0f0f0;">${fmt(totalAdv)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- D. SC ADVANCES -->
      <h2>D. Sub-Contractor Advances</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead>
          <tr>
            <th style="${TH}width:34px;">Sl No</th>
            <th style="${TH}width:88px;">Date</th>
            <th style="${TH}width:200px;">Sub-Contractor</th>
            <th style="${TH}text-align:left;">WO No</th>
            <th style="${TH}width:120px;text-align:right;">Amount (&#8377;)</th>
          </tr>
        </thead>
        <tbody>${scRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="${TD}text-align:right;font-weight:700;background:#f0f0f0;">TOTAL SC ADVANCES</td>
            <td style="${TD}text-align:right;font-weight:700;font-size:12px;background:#f0f0f0;">${fmt(totalScAdv)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- E. SUMMARY -->
      <h2>E. Summary</h2>
      <table style="width:50%;border-collapse:collapse;margin-bottom:14px;">
        <tr>
          <td style="${TD}font-weight:700;">Total Cash Received from HO</td>
          <td style="${TD}text-align:right;">${fmt(totalRec)}</td>
        </tr>
        <tr>
          <td style="${TD}">Less: Local Purchases</td>
          <td style="${TD}text-align:right;">(${fmt(totalLP)})</td>
        </tr>
        <tr>
          <td style="${TD}">Less: Salary Advances</td>
          <td style="${TD}text-align:right;">(${fmt(totalAdv)})</td>
        </tr>
        <tr>
          <td style="${TD}">Less: Sub Contractor Advances</td>
          <td style="${TD}text-align:right;">(${fmt(totalScAdv)})</td>
        </tr>
        <tr style="background:#f0f0f0;">
          <td style="border:1.5px solid #000;padding:5px 6px;font-weight:700;font-size:13px;">Cash in Hand (Closing Balance)</td>
          <td style="border:1.5px solid #000;padding:5px 6px;text-align:right;font-weight:700;font-size:13px;${balance < 0 ? 'color:#cc0000;' : ''}">
            ${balance < 0 ? '(' + fmt(Math.abs(balance)) + ') OVERDRAWN' : fmt(balance)}
          </td>
        </tr>
      </table>

    </td></tr>
  </tbody>
</table>

<!-- Signature footer — fixed to bottom of every printed page -->
<div class="pc-sig-footer">
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="width:25%;text-align:center;vertical-align:bottom;padding:2px 6px;">
        <div style="height:32px;"></div>
        <div style="font-weight:700;font-size:10px;border-top:1px solid #000;padding-top:2px;margin-top:2px;">Site Incharge</div>
      </td>
      <td style="width:25%;text-align:center;vertical-align:bottom;padding:2px 6px;">
        <div style="height:32px;"></div>
        <div style="font-weight:700;font-size:10px;border-top:1px solid #000;padding-top:2px;margin-top:2px;">Project Manager</div>
      </td>
      <td style="width:25%;text-align:center;vertical-align:bottom;padding:2px 6px;">
        <div style="height:32px;"></div>
        <div style="font-weight:700;font-size:10px;border-top:1px solid #000;padding-top:2px;margin-top:2px;">Accounts</div>
      </td>
      <td style="width:25%;text-align:center;vertical-align:bottom;padding:2px 6px;">
        <div style="height:32px;"></div>
        <div style="font-weight:700;font-size:10px;border-top:1px solid #000;padding-top:2px;margin-top:2px;">Managing Director</div>
      </td>
    </tr>
  </table>
  <div style="text-align:center;margin-top:4px;line-height:1.4;">
    <div style="font-weight:700;font-size:10px;">BCIM ENGINEERING PRIVATE LIMITED</div>
    <div style="font-size:9px;">&ldquo;B&rdquo; Wing, DivyaSree Chambers, No. 11, O&rsquo;Shaugnessy Road, Bangalore-560 025.</div>
  </div>
</div>

</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}

// ── PDF export helper (jsPDF + autoTable) ────────────────────────────────────
function exportPdf({ entries, advances, scAdvances, receipts, projectName, period }) {
  const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sc = scAdvances || [];

  const totalRec   = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const totalLP    = entries.reduce((s, r) => s + Number(r.amount), 0);
  const totalAdv   = advances.reduce((s, r) => s + Number(r.amount), 0);
  const totalScAdv = sc.reduce((s, r) => s + Number(r.amount), 0);
  const balance    = totalRec - totalLP - totalAdv - totalScAdv;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = 210;
  const MARGIN = 12;
  const COL_W  = PAGE_W - MARGIN * 2;

  const NAVY  = [15, 42, 82];
  const LGREY = [240, 240, 240];
  const BLACK = [0, 0, 0];

  const addPageHeader = () => {
    // Top doc-code line
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text('BCIM-STO-PC-01', PAGE_W - MARGIN, 10, { align: 'right' });

    // Title
    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('PETTY CASH STATEMENT', PAGE_W / 2, 18, { align: 'center' });
    if (projectName) {
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(projectName, PAGE_W / 2, 24, { align: 'center' });
    }

    // Company block
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('BCIM ENGINEERING PRIVATE LIMITED', MARGIN, 32);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('#11, B Wing, Divyasree Chambers, O\'Shaughnessy Road, Bangalore - 560025', MARGIN, 37);
    doc.text('GSTIN : 29AAHCB6485A1ZL', MARGIN, 41);

    // Right meta
    const rx = PAGE_W - MARGIN;
    doc.setFontSize(8);
    doc.text(`Date : ${dayjs().format('DD-MM-YYYY')}`, rx, 32, { align: 'right' });
    if (projectName) doc.text(`Project : ${projectName}`, rx, 37, { align: 'right' });
    if (period)      doc.text(`Period  : ${period}`,      rx, 41, { align: 'right' });

    // Divider
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.5);
    doc.line(MARGIN, 44, PAGE_W - MARGIN, 44);

    return 48; // y after header
  };

  const addSectionTitle = (y, label) => {
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(label, MARGIN, y);
    return y + 4;
  };

  const addTable = (y, head, body, foot) => {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head,
      body,
      foot,
      styles: { fontSize: 8, cellPadding: 1.8, textColor: BLACK, lineColor: [180,180,180], lineWidth: 0.2 },
      headStyles: { fillColor: NAVY, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: LGREY, textColor: BLACK, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      tableWidth: COL_W,
      didDrawPage: (data) => {
        addSignatureFooter();
      },
    });
    return doc.lastAutoTable.finalY + 6;
  };

  const addSignatureFooter = () => {
    const pageH = doc.internal.pageSize.getHeight();
    const y = pageH - 22;
    const labels = ['Site Incharge', 'Project Manager', 'Accounts', 'Managing Director'];
    const colW = COL_W / 4;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLACK);
    labels.forEach((lbl, i) => {
      const cx = MARGIN + colW * i + colW / 2;
      doc.setDrawColor(...BLACK); doc.setLineWidth(0.3);
      doc.line(cx - colW / 2 + 4, y, cx + colW / 2 - 4, y);
      doc.text(lbl, cx, y + 4, { align: 'center' });
    });
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('BCIM ENGINEERING PRIVATE LIMITED   |   "B" Wing, DivyaSree Chambers, No. 11, O\'Shaugnessy Road, Bangalore-560 025', PAGE_W / 2, pageH - 7, { align: 'center' });
  };

  // ── Page 1 ──
  let y = addPageHeader();

  // A. Cash Received
  y = addSectionTitle(y, 'A. Cash Received from HO');
  y = addTable(y,
    [['Sl', 'Date', 'Voucher No', 'Received By', 'Amount (₹)']],
    receipts.length
      ? receipts.map((r, i) => [i+1, dayjs(r.receipt_date).format('DD-MM-YYYY'), r.voucher_no||'–', r.received_by||'–', { content: fmt(r.amount), styles: { halign: 'right' } }])
      : [[{ content: 'No receipts recorded', colSpan: 5, styles: { halign: 'center', fontStyle: 'italic' } }]],
    [[{ content: 'TOTAL RECEIVED', colSpan: 4, styles: { halign: 'right' } }, { content: fmt(totalRec), styles: { halign: 'right' } }]]
  );

  // B. Local Purchases
  y = addSectionTitle(y, 'B. Local Purchases (Approved)');
  y = addTable(y,
    [['Sl', 'Date', 'Voucher No', 'Supplier', 'Materials', 'Invoice No', 'Amount (₹)']],
    entries.length
      ? entries.map((r, i) => [i+1, dayjs(r.entry_date).format('DD-MM-YYYY'), r.pc_voucher_no||'–', r.supplier||'–', (r.items||[]).map(it=>it.material_name).filter(Boolean).join(', ')||'–', r.invoice_no||'–', { content: fmt(r.amount), styles: { halign: 'right' } }])
      : [[{ content: 'No approved local purchases', colSpan: 7, styles: { halign: 'center', fontStyle: 'italic' } }]],
    [[{ content: 'TOTAL LOCAL PURCHASE', colSpan: 6, styles: { halign: 'right' } }, { content: fmt(totalLP), styles: { halign: 'right' } }]]
  );

  // C. Salary Advances
  y = addSectionTitle(y, 'C. Salary Advances');
  y = addTable(y,
    [['Sl', 'Date', 'Employee Name', 'Description', 'Amount (₹)']],
    advances.length
      ? advances.map((r, i) => [i+1, dayjs(r.advance_date).format('DD-MM-YYYY'), r.payee_name||'–', r.description||'–', { content: fmt(r.amount), styles: { halign: 'right' } }])
      : [[{ content: 'No salary advances recorded', colSpan: 5, styles: { halign: 'center', fontStyle: 'italic' } }]],
    [[{ content: 'TOTAL SALARY ADVANCES', colSpan: 4, styles: { halign: 'right' } }, { content: fmt(totalAdv), styles: { halign: 'right' } }]]
  );

  // D. SC Advances
  y = addSectionTitle(y, 'D. Sub-Contractor Advances');
  y = addTable(y,
    [['Sl', 'Date', 'Sub-Contractor', 'WO No', 'Amount (₹)']],
    sc.length
      ? sc.map((r, i) => [i+1, dayjs(r.advance_date).format('DD-MM-YYYY'), r.vendor_name||'–', r.wo_number||'–', { content: fmt(r.amount), styles: { halign: 'right' } }])
      : [[{ content: 'No SC advances recorded', colSpan: 5, styles: { halign: 'center', fontStyle: 'italic' } }]],
    [[{ content: 'TOTAL SC ADVANCES', colSpan: 4, styles: { halign: 'right' } }, { content: fmt(totalScAdv), styles: { halign: 'right' } }]]
  );

  // E. Summary
  y = addSectionTitle(y, 'E. Summary');
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN + COL_W / 2 },
    body: [
      ['Total Cash Received from HO', fmt(totalRec)],
      ['Less: Local Purchases',       `(${fmt(totalLP)})`],
      ['Less: Salary Advances',       `(${fmt(totalAdv)})`],
      ['Less: Sub Contractor Advances', `(${fmt(totalScAdv)})`],
    ],
    foot: [[
      { content: 'Cash in Hand (Closing Balance)', styles: { fontStyle: 'bold', fontSize: 9 } },
      { content: balance < 0 ? `(${fmt(Math.abs(balance))}) OVERDRAWN` : fmt(balance), styles: { halign: 'right', fontStyle: 'bold', fontSize: 9, textColor: balance < 0 ? [180, 0, 0] : BLACK } },
    ]],
    styles: { fontSize: 8, cellPadding: 2, textColor: BLACK, lineColor: [180,180,180], lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: [255,255,255] },
    footStyles: { fillColor: LGREY, textColor: BLACK },
    columnStyles: { 1: { halign: 'right' } },
    tableWidth: COL_W / 2,
  });

  addSignatureFooter();

  const fileName = `PettyCash_${projectName ? projectName.replace(/\s+/g, '_') + '_' : ''}${period ? period.replace(/[^a-zA-Z0-9]/g, '_') : dayjs().format('YYYY-MM-DD')}.pdf`;
  doc.save(fileName);
}

// ── Individual voucher print ─────────────────────────────────────────────────
function printVoucher(entry, projectName) {
  const fmt  = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const items = (entry.items || []).filter(it => it.material_name);
  const basic  = Number(entry.basic_amount  || entry.amount || 0);
  const gstAmt = Number(entry.gst_amount    || 0);
  const total  = Number(entry.total_amount  || entry.amount || 0);
  const gstPct = Number(entry.gst_pct       || 0);

  const TD = 'border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:10px;';
  const TH = 'border:1px solid #000;padding:4px 6px;font-weight:700;background:#f0f0f0;font-size:10px;text-align:center;';

  const itemRows = items.length
    ? items.map((it, i) => `<tr>
        <td style="${TD}text-align:center;">${i + 1}</td>
        <td style="${TD}">${it.material_name || '–'}</td>
        <td style="${TD}text-align:center;">${it.unit || '–'}</td>
        <td style="${TD}text-align:right;">${it.quantity || '–'}</td>
        <td style="${TD}text-align:right;">${it.rate ? fmt(it.rate) : '–'}</td>
        <td style="${TD}text-align:center;">${it.gst_pct != null ? it.gst_pct + '%' : gstPct ? gstPct + '%' : '–'}</td>
        <td style="${TD}text-align:right;font-weight:600;">${it.total ? fmt(it.total) : fmt(it.rate && it.quantity ? it.rate * it.quantity : 0)}</td>
      </tr>`).join('')
    : `<tr><td colspan="7" style="${TD}text-align:center;color:#888;font-style:italic;padding:10px;">No line items recorded</td></tr>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PC Voucher ${entry.pc_voucher_no || ''}</title>
  <style>
    @media print {
      @page { margin: 12mm 12mm 20mm 12mm; size: A4; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body { font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000; margin: 0; padding: 10mm 12mm; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
    <img src="/bcim-logo.png" alt="BCIM" style="height:44px;object-fit:contain;">
    <div style="text-align:center;flex:1;">
      <div style="font-size:16px;font-weight:700;letter-spacing:0.5px;">PETTY CASH VOUCHER</div>
      <div style="font-size:11px;margin-top:2px;">BCIM ENGINEERING PRIVATE LIMITED</div>
      <div style="font-size:9px;color:#333;">#11, B Wing, Divyasree Chambers, O'Shaughnessy Road, Bangalore - 560025 | GSTIN: 29AAHCB6485A1ZL</div>
    </div>
    <div style="text-align:right;font-size:9px;font-weight:700;color:#333;">BCIM-STO-PC-01</div>
  </div>
  <div style="border-top:1.5px solid #000;border-bottom:1px solid #000;padding:5px 0;margin-bottom:10px;">
    <table style="width:100%;">
      <tr>
        <td style="border:none;padding:2px 0;width:50%;font-size:10px;">
          <strong>Voucher No :</strong>
          <span style="font-family:monospace;font-size:12px;font-weight:700;margin-left:6px;">${entry.pc_voucher_no || '—'}</span>
        </td>
        <td style="border:none;padding:2px 0;text-align:right;font-size:10px;">
          <strong>Date :</strong> ${dayjs(entry.entry_date).format('DD-MM-YYYY')}
        </td>
      </tr>
      <tr>
        <td style="border:none;padding:2px 0;font-size:10px;">
          <strong>Project :</strong> ${projectName || '—'}
        </td>
        <td style="border:none;padding:2px 0;text-align:right;font-size:10px;">
          <strong>Status :</strong> ${entry.status || '—'}
        </td>
      </tr>
    </table>
  </div>

  <!-- Supplier block -->
  <table style="width:100%;margin-bottom:10px;">
    <tr>
      <td style="border:1px solid #000;padding:5px 8px;width:50%;">
        <div style="font-size:9px;font-weight:700;color:#555;margin-bottom:2px;">SUPPLIER</div>
        <div style="font-weight:700;font-size:11px;">${entry.supplier || '—'}</div>
      </td>
      <td style="border:1px solid #000;padding:5px 8px;border-left:none;">
        <div style="font-size:9px;font-weight:700;color:#555;margin-bottom:2px;">INVOICE DETAILS</div>
        <div><strong>Invoice No :</strong> ${entry.invoice_no || '—'}</div>
        ${entry.remarks ? `<div style="margin-top:2px;"><strong>Remarks :</strong> ${entry.remarks}</div>` : ''}
      </td>
    </tr>
  </table>

  <!-- Materials table -->
  <table style="width:100%;margin-bottom:10px;">
    <thead>
      <tr>
        <th style="${TH}width:30px;">#</th>
        <th style="${TH}text-align:left;">Material / Description</th>
        <th style="${TH}width:48px;">Unit</th>
        <th style="${TH}width:48px;">Qty</th>
        <th style="${TH}width:80px;">Rate (₹)</th>
        <th style="${TH}width:48px;">GST%</th>
        <th style="${TH}width:90px;">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      ${gstAmt ? `
      <tr>
        <td colspan="6" style="${TD}text-align:right;font-weight:700;background:#f8f8f8;">Basic Amount</td>
        <td style="${TD}text-align:right;font-weight:700;background:#f8f8f8;">${fmt(basic)}</td>
      </tr>
      <tr>
        <td colspan="6" style="${TD}text-align:right;background:#f8f8f8;">GST (${gstPct}%)</td>
        <td style="${TD}text-align:right;background:#f8f8f8;">${fmt(gstAmt)}</td>
      </tr>` : ''}
      <tr>
        <td colspan="6" style="${TD}text-align:right;font-weight:700;font-size:11px;background:#f0f0f0;">TOTAL AMOUNT</td>
        <td style="${TD}text-align:right;font-weight:700;font-size:12px;background:#f0f0f0;">${fmt(total)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Amount in words placeholder -->
  <div style="border:1px solid #000;padding:5px 8px;margin-bottom:14px;font-size:10px;">
    <strong>Amount in Words :</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Only
  </div>

  <!-- Signatures -->
  <table style="width:100%;border-collapse:collapse;margin-top:20px;">
    <tr>
      ${['Prepared By', 'Checked By', 'Site Incharge', 'Managing Director'].map(lbl => `
        <td style="border:none;width:25%;text-align:center;padding:0 6px;vertical-align:bottom;">
          <div style="height:36px;"></div>
          <div style="border-top:1px solid #000;padding-top:3px;font-weight:700;font-size:9px;">${lbl}</div>
        </td>`).join('')}
    </tr>
  </table>

</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}

// ── File opener — OneDrive links open directly; legacy /uploads/ links use auth fetch ──
async function openAttachment(url) {
  if (!url) return;
  // OneDrive sharing links and other absolute HTTPS URLs open directly
  if (url.startsWith('https://') || url.startsWith('http://')) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  // Legacy local /uploads/ path — needs Bearer token via fetch
  try {
    const token = sessionStorage.getItem('accessToken');
    const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const ct = resp.headers.get('content-type') || '';
    if (!resp.ok || ct.includes('text/html')) {
      alert('File not found on the server.\n\nThis attachment was stored locally and may have been lost after a server restart. Please re-upload it.');
      return;
    }
    const blob = new Blob([await resp.arrayBuffer()], { type: ct || 'application/octet-stream' });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch {
    alert('Could not open attachment.');
  }
}

// ── Entry Form (Local Purchase) ───────────────────────────────────────────────
const EMPTY_ITEM  = { material_name: '', unit: "NO'S", quantity: '', rate: '', gst_pct: '18', gst_amount: '', total: '' };
const EMPTY_ENTRY = { project_id: '', entry_date: dayjs().format('YYYY-MM-DD'), supplier: '', invoice_no: '', remarks: '', bill_file_url: '', bill_file_name: '', voucher_file_url: '', voucher_file_name: '' };
const GST_RATES = [0, 5, 12, 18, 28];

function SectionLabel({ icon: Icon, color, label }) {
  return (
    <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg mb-3', color)}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
    </div>
  );
}

function FileSlot({ label, fileUrl, fileName, uploading, onUpload, onView, onRemove, isUploading }) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      {fileUrl ? (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Paperclip className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-sm text-emerald-700 font-medium flex-1 truncate">{fileName || 'File attached'}</span>
          <button type="button" onClick={onView}
            className="flex items-center gap-1 text-xs text-emerald-700 font-semibold hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-lg transition-colors">
            <Eye className="w-3 h-3" /> View
          </button>
          <button type="button" onClick={onRemove}
            className="w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <label className={clsx('group flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all',
          isUploading ? 'opacity-50 pointer-events-none border-slate-200' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50')}>
          <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center flex-shrink-0 transition-colors">
            <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">{isUploading ? 'Uploading…' : `Attach ${label}`}</p>
            <p className="text-xs text-slate-400">PDF, image — max 10 MB</p>
          </div>
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={onUpload} disabled={isUploading} />
        </label>
      )}
    </div>
  );
}

function EntryForm({ initial, projects, defaultProjectId, budgets, catSpend, existingInvoices, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? { project_id: initial.project_id || '', entry_date: initial.entry_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          supplier: initial.supplier || '', invoice_no: initial.invoice_no || '',
          remarks: initial.remarks || '', bill_file_url: initial.bill_file_url || '', bill_file_name: initial.bill_file_name || '',
          voucher_file_url: initial.voucher_file_url || '', voucher_file_name: initial.voucher_file_name || '' }
      : { ...EMPTY_ENTRY, project_id: defaultProjectId || '' }
  );
  const [items, setItems] = useState(
    isEdit && initial.items?.length
      ? initial.items.map(it => ({
          material_name: it.material_name, unit: it.unit, quantity: it.quantity,
          rate: it.rate || '', gst_pct: it.gst_pct ?? '18',
          gst_amount: it.gst_amount || '', total: it.total_amount || '',
        }))
      : [{ ...EMPTY_ITEM }]
  );
  const [uploading, setUploading] = useState(null);

  const dupWarn = useMemo(() => {
    const inv = form.invoice_no?.trim();
    if (!inv || inv === '–') return null;
    const ex = existingInvoices?.[inv];
    if (!ex) return null;
    if (isEdit && ex.id === initial?.id) return null;
    return ex;
  }, [form.invoice_no, existingInvoices, isEdit, initial?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateItem = (idx, key, val) => setItems(prev => {
    const next = [...prev];
    const item = { ...next[idx], [key]: val };
    const qty  = parseFloat(key === 'quantity' ? val : item.quantity) || 0;
    const rate = parseFloat(key === 'rate'     ? val : item.rate)     || 0;
    const pct  = parseFloat(key === 'gst_pct'  ? val : item.gst_pct) || 0;
    const basic   = qty * rate;
    const gstAmt  = +(basic * pct / 100).toFixed(2);
    item.gst_amount = gstAmt || '';
    item.total      = +(basic + gstAmt).toFixed(2) || '';
    next[idx] = item;
    return next;
  });
  const addItem    = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => setItems(p => p.filter((_, i) => i !== idx));
  const applyGstAll = (pct) => setItems(prev => prev.map(item => {
    const qty   = parseFloat(item.quantity) || 0;
    const rate  = parseFloat(item.rate)     || 0;
    const basic = qty * rate;
    const gstAmt = +(basic * pct / 100).toFixed(2);
    return { ...item, gst_pct: String(pct), gst_amount: gstAmt || '', total: +(basic + gstAmt).toFixed(2) || '' };
  }));

  const totals = useMemo(() => {
    const basic = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0), 0);
    const gst   = items.reduce((s, it) => s + (parseFloat(it.gst_amount) || 0), 0);
    return { basic: +basic.toFixed(2), gst: +gst.toFixed(2), grand: +(basic + gst).toFixed(2) };
  }, [items]);

  const detectedCat   = categoryOf(items[0]?.material_name || form.supplier || '');
  const catCap        = budgets?.[detectedCat] ?? 0;
  const catSpent      = catSpend?.[detectedCat] ?? 0;
  const newTotal      = catSpent + totals.grand;
  const budgetPct     = catCap > 0 ? (newTotal / catCap) * 100 : 0;
  const budgetWarning = catCap > 0 && budgetPct >= 80;
  const budgetOver    = catCap > 0 && newTotal > catCap;

  const handleFileChange = (kind) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(kind);
    try {
      const res = await uploadAPI.uploadSingle(file);
      set(`${kind}_file_url`,  res.data.url);
      set(`${kind}_file_name`, file.name);
      toast.success(`${kind === 'bill' ? 'Bill' : 'Voucher'} attached`);
    } catch {
      toast.error('Upload failed — try again');
    } finally {
      setUploading(null);
    }
  };

  const saveMut = useMutation({
    mutationFn: (payload) => isEdit
      ? storesPettyCashAPI.updateEntry(initial.id, payload).then(r => r.data)
      : storesPettyCashAPI.createEntry(payload).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Entry updated' : 'Entry added — awaiting approval');
      qc.invalidateQueries({ queryKey: ['spc-entries'] });
      qc.invalidateQueries({ queryKey: ['spc-summary'] });
      onClose();
    },
    onError: (err, variables) => {
      if (err?.response?.status === 409 && err?.response?.data?.errorCode === 'DUPLICATE_INVOICE') {
        const ex = err.response.data.existing;
        const msg = `Invoice "${variables.invoice_no || ''}" already recorded in entry #${ex.sl_no} (${ex.supplier}, ${dayjs(ex.entry_date).format('DD-MM-YYYY')}).\n\nSave anyway?`;
        if (window.confirm(msg)) saveMut.mutate({ ...variables, force: true });
      } else {
        toast.error(err?.response?.data?.error || 'Save failed');
      }
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.supplier.trim()) return toast.error('Supplier is required');
    if (!form.entry_date) return toast.error('Date is required');
    if (!items.some(it => it.material_name?.trim())) return toast.error('Add at least one material line');
    saveMut.mutate({
      ...form,
      basic_amount: totals.basic,
      gst_amount:   totals.gst,
      amount:       totals.grand,
      items:        items.filter(it => it.material_name?.trim()),
      status:       'Pending',
    });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-100 flex flex-col">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <ShoppingBag style={{ width: 18, height: 18, color: '#fff' }} />
          </div>
          <div>
            <p className="font-bold text-slate-900">{isEdit ? `Edit Entry — Sl No ${initial.sl_no}` : 'New Local Purchase Entry'}</p>
            <p className="text-xs text-slate-500">Record a local purchase paid from petty cash</p>
          </div>
        </div>
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
          <X className="w-4 h-4" /> Close
        </button>
      </div>

      {/* ── Two-column body ── */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex">

        {/* LEFT — Purchase details + totals + remarks */}
        <div className="w-[380px] flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto flex flex-col">

          {/* Purchase Details */}
          <div className="px-5 pt-5 pb-4 border-b border-slate-100">
            <SectionLabel icon={BookOpen} color="bg-indigo-50 text-indigo-700" label="Purchase Details" />
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl req>Date</Lbl><input type="date" className={F} value={form.entry_date} onChange={e => set('entry_date', e.target.value)} required /></div>
              <div><Lbl>Project</Lbl>
                <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                  <option value="">— Not linked —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2"><Lbl req>Supplier Name</Lbl>
                <input className={F} placeholder="e.g. Ponam Hardware" value={form.supplier} onChange={e => set('supplier', e.target.value)} required />
              </div>
              <div className="col-span-2">
                <Lbl>Invoice No.</Lbl>
                <input className={F} placeholder="e.g. 49045" value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)} />
                {dupWarn && (
                  <div className="flex items-center gap-2 mt-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    Already in entry #{dupWarn.sl_no} — {dupWarn.supplier} · {dayjs(dupWarn.entry_date).format('DD-MM-YYYY')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Auto-computed totals */}
          <div className="px-5 py-4 border-b border-slate-100 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Basic Amount</span>
              <span className="font-semibold text-slate-700">{inr(totals.basic)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total GST</span>
              <span className="font-semibold text-slate-700">{inr(totals.gst)}</span>
            </div>
            <div className={clsx('flex justify-between items-center rounded-xl px-4 py-3 mt-1',
              budgetOver ? 'bg-red-50 border border-red-200' : budgetWarning ? 'bg-amber-50 border border-amber-200' : 'bg-indigo-50 border border-indigo-100')}>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grand Total</span>
              <span className={clsx('text-2xl font-bold', budgetOver ? 'text-red-700' : 'text-indigo-700')}>
                {inr(totals.grand)}
              </span>
            </div>
            {budgetWarning && (
              <div className="flex items-center gap-2 text-xs font-medium text-right justify-end">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className={budgetOver ? 'text-red-700' : 'text-amber-700'}>
                  {budgetOver
                    ? `${inr(newTotal - catCap)} over ${detectedCat} budget`
                    : `${budgetPct.toFixed(0)}% of ${detectedCat} budget used`}
                </span>
              </div>
            )}
          </div>

          {/* Remarks */}
          <div className="px-5 py-4 border-b border-slate-100">
            <Lbl>Remarks</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={3} placeholder="Any additional notes…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>

          {/* Attachments */}
          <div className="px-5 py-4 space-y-3">
            <SectionLabel icon={Paperclip} color="bg-purple-50 text-purple-700" label="Attachments" />
            <FileSlot label="Petty Cash Voucher" fileUrl={form.voucher_file_url} fileName={form.voucher_file_name}
              isUploading={uploading === 'voucher'} onUpload={handleFileChange('voucher')}
              onView={() => openAttachment(form.voucher_file_url)}
              onRemove={() => { set('voucher_file_url', ''); set('voucher_file_name', ''); }} />
            <FileSlot label="Bill / Invoice" fileUrl={form.bill_file_url} fileName={form.bill_file_name}
              isUploading={uploading === 'bill'} onUpload={handleFileChange('bill')}
              onView={() => openAttachment(form.bill_file_url)}
              onRemove={() => { set('bill_file_url', ''); set('bill_file_name', ''); }} />
          </div>
        </div>

        {/* RIGHT — Materials with per-line Rate + GST */}
        <div className="flex-1 overflow-y-auto flex flex-col bg-slate-50 min-w-0">
          {/* Quick GST bar */}
          <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Quick GST (all lines):</span>
            {GST_RATES.map(r => (
              <button key={r} type="button"
                onClick={() => applyGstAll(r)}
                className={clsx(
                  'px-3 py-1 rounded-full text-xs font-bold border transition-colors',
                  items.every(it => String(it.gst_pct) === String(r))
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-600'
                )}>
                {r}%
              </button>
            ))}
            <button type="button" onClick={addItem}
              className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="w-3 h-3" /> Add Line
            </button>
          </div>

          {/* Materials table */}
          <div className="flex-1 p-4 overflow-x-auto">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm min-w-[860px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-8">#</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Material Description</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-20">Unit</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-20">Qty</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">Rate (₹)</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">GST %</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">GST Amt (₹)</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-32">Total (₹)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-slate-400 font-mono text-xs">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <input className={F} placeholder="Material name" value={it.material_name} onChange={e => updateItem(idx, 'material_name', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input className={F} placeholder="NO'S" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="any" min="0" className={F} placeholder="0" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.01" min="0" className={F} placeholder="0.00" value={it.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.01" min="0" max="100" className={F} placeholder="18" value={it.gst_pct} onChange={e => updateItem(idx, 'gst_pct', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.01" className={clsx(F, 'bg-slate-50 text-slate-500 cursor-default')} placeholder="—" value={it.gst_amount} readOnly tabIndex={-1} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.01" className={clsx(F, 'bg-indigo-50 text-indigo-700 font-semibold cursor-default')} placeholder="—" value={it.total} readOnly tabIndex={-1} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Footer totals row */}
                {items.length > 1 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Totals</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-700 text-right pr-4">{inr(totals.basic)}</td>
                      <td />
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-700 text-right pr-4">{inr(totals.gst)}</td>
                      <td className="px-3 py-2.5 text-sm font-bold text-indigo-700 text-right pr-4">{inr(totals.grand)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </form>

      {/* ── Footer ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-t border-slate-200">
        <button type="button" onClick={onClose} className="px-5 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saveMut.isPending || !!uploading}
          className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors">
          {saveMut.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {saveMut.isPending ? 'Saving…' : isEdit ? 'Update Entry' : 'Save Entry'}
        </button>
      </div>
    </div>
  );
}

// ── Advance Form ──────────────────────────────────────────────────────────────
const EMPTY_ADVANCE = { project_id: '', advance_date: dayjs().format('YYYY-MM-DD'), payee_name: '', description: 'SALARY ADVANCE', amount: '', payment_mode: 'cash', reference_number: '', remarks: '' };

function AdvanceForm({ initial, projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? { project_id: initial.project_id || '', advance_date: initial.advance_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          payee_name: initial.payee_name || '', description: initial.description || 'SALARY ADVANCE', amount: initial.amount || '',
          payment_mode: initial.payment_mode || 'cash', reference_number: initial.reference_number || '', remarks: initial.remarks || '' }
      : { ...EMPTY_ADVANCE, project_id: defaultProjectId || '' }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: (payload) => isEdit
      ? storesPettyCashAPI.updateAdvance(initial.id, payload).then(r => r.data)
      : storesPettyCashAPI.createAdvance(payload).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Advance updated' : 'Advance recorded');
      qc.invalidateQueries({ queryKey: ['spc-advances'] });
      qc.invalidateQueries({ queryKey: ['spc-summary'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.payee_name.trim()) return toast.error('Name is required');
    if (!form.advance_date) return toast.error('Date is required');
    saveMut.mutate({ ...form, amount: parseFloat(form.amount) || 0 });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-100 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm">
            <Users style={{ width: 18, height: 18, color: '#fff' }} />
          </div>
          <div>
            <p className="font-bold text-slate-900">{isEdit ? 'Edit Salary Advance' : 'New Salary Advance'}</p>
            <p className="text-xs text-slate-500">Cash paid to contractor or employee from petty cash</p>
          </div>
        </div>
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
          <X className="w-4 h-4" /> Close
        </button>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex">

        {/* LEFT — main fields + amount */}
        <div className="w-[420px] flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="p-6 space-y-4">
            <SectionLabel icon={Users} color="bg-amber-50 text-amber-700" label="Advance Details" />
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl req>Date</Lbl><input type="date" className={F} value={form.advance_date} onChange={e => set('advance_date', e.target.value)} required /></div>
              <div><Lbl>Project</Lbl>
                <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                  <option value="">— Not linked —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div><Lbl req>Contractor / Employee Name</Lbl>
              <input className={F} placeholder="e.g. Mukesh 3250008" value={form.payee_name} onChange={e => set('payee_name', e.target.value)} required />
            </div>
            <div><Lbl>Description</Lbl>
              <input className={F} placeholder="SALARY ADVANCE" value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            {/* Amount */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <Lbl req>Amount Paid (₹)</Lbl>
              <input type="number" step="0.01"
                className="w-full border border-amber-200 bg-white rounded-xl px-4 py-3 text-2xl font-bold text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-amber-200"
                placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required autoFocus />
            </div>
          </div>
        </div>

        {/* RIGHT — payment + remarks */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-6 space-y-5 max-w-xl">
            <SectionLabel icon={Wallet} color="bg-green-50 text-green-700" label="Payment Details" />
            <div>
              <Lbl>Payment Mode</Lbl>
              <div className="grid grid-cols-4 gap-3">
                {['cash', 'upi', 'bank_transfer', 'cheque'].map(mode => (
                  <button key={mode} type="button" onClick={() => set('payment_mode', mode)}
                    className={clsx('flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-colors',
                      form.payment_mode === mode ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')}>
                    <span className="text-xl">{PAYMENT_MODE_ICON[mode]}</span>
                    <span className="capitalize">{mode.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            </div>
            {form.payment_mode !== 'cash' && (
              <div><Lbl>Reference No. / UPI ID / Cheque No.</Lbl>
                <input className={F} placeholder="Ref / ID / Cheque no." value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
              </div>
            )}
            <div><Lbl>Remarks</Lbl>
              <textarea className={clsx(F, 'resize-none')} rows={4} placeholder="Notes…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>

            {/* Info card */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 leading-relaxed">
              <p className="font-semibold mb-1">About Salary Advances</p>
              This advance is recorded as a debit to petty cash. It will be reconciled once the employee submits a settlement voucher. Approved advances appear in the petty cash balance sheet.
            </div>
          </div>
        </div>
      </form>

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-t border-slate-200">
        <button type="button" onClick={onClose} className="px-5 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saveMut.isPending}
          className="flex items-center gap-2 px-8 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50 shadow-sm transition-colors">
          {saveMut.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {saveMut.isPending ? 'Saving…' : isEdit ? 'Update Advance' : 'Record Advance'}
        </button>
      </div>
    </div>
  );
}

// ── SC Advance Form ───────────────────────────────────────────────────────────
const EMPTY_SC_ADV = { project_id: '', advance_date: dayjs().format('YYYY-MM-DD'), vendor_id: '', vendor_name: '', wo_number: '', amount: '', payment_mode: 'cash', reference_number: '', remarks: '' };

const PAYMENT_MODE_ICON = { cash: '💵', upi: '📱', bank_transfer: '🏦', cheque: '📄' };

function ScAdvanceForm({ projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_SC_ADV, project_id: defaultProjectId || '' });
  const [woSearch, setWoSearch] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Load all WOs for the selected project
  const { data: woData, isLoading: loadingWOs } = useQuery({
    queryKey: ['sc-advance-wos', form.project_id],
    queryFn: () => subcontractorAPI.listWorkOrders({ project_id: form.project_id || undefined, limit: 500 }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60000,
  });
  const allWOs = Array.isArray(woData) ? woData : (woData?.data ?? []);
  const filteredWOs = woSearch
    ? allWOs.filter(w => w.wo_number?.toLowerCase().includes(woSearch.toLowerCase()) || w.subject?.toLowerCase().includes(woSearch.toLowerCase()) || w.vendor_name?.toLowerCase().includes(woSearch.toLowerCase()))
    : allWOs;

  // Legacy vendor search fallback (still available if WO list is empty)
  const [vendorSearch, setVendorSearch] = useState('');
  const { data: vendorData } = useQuery({
    queryKey: ['spc-sc-vendors', vendorSearch],
    queryFn: () => storesPettyCashAPI.scVendorLookup({ search: vendorSearch || undefined }).then(r => r.data),
    enabled: vendorSearch.length > 0 && allWOs.length === 0,
  });
  const vendors = vendorData?.data || [];

  const saveMut = useMutation({
    mutationFn: (payload) => storesPettyCashAPI.createScAdvance(payload).then(r => r.data),
    onSuccess: () => {
      toast.success('Sub Contractor Advance recorded');
      qc.invalidateQueries({ queryKey: ['spc-sc-advances'] });
      qc.invalidateQueries({ queryKey: ['spc-summary'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vendor_name.trim()) return toast.error('Sub-contractor name is required');
    if (!form.advance_date)       return toast.error('Date is required');
    if (!parseFloat(form.amount)) return toast.error('Amount is required');
    saveMut.mutate({ ...form, amount: parseFloat(form.amount) || 0 });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-100 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm">
            <Send style={{ width: 18, height: 18, color: '#fff' }} />
          </div>
          <div>
            <p className="font-bold text-slate-900">New Sub Contractor Advance</p>
            <p className="text-xs text-slate-500">Petty cash paid to sub-contractor</p>
          </div>
        </div>
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
          <X className="w-4 h-4" /> Close
        </button>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex">

        {/* LEFT — date, project, amount */}
        <div className="w-[420px] flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="p-6 space-y-4">
            <SectionLabel icon={Send} color="bg-orange-50 text-orange-700" label="Advance Details" />
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl req>Date</Lbl><input type="date" className={F} value={form.advance_date} onChange={e => set('advance_date', e.target.value)} required /></div>
              <div><Lbl>Project</Lbl>
                <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                  <option value="">— Not linked —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {/* Amount */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <Lbl req>Amount Paid (₹)</Lbl>
              <input type="number" step="0.01"
                className="w-full border border-orange-200 bg-white rounded-xl px-4 py-3 text-2xl font-bold text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-400 placeholder:text-orange-200"
                placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required autoFocus />
            </div>

            {/* Payment mode */}
            <div>
              <Lbl>Payment Mode</Lbl>
              <div className="grid grid-cols-4 gap-2">
                {['cash', 'upi', 'bank_transfer', 'cheque'].map(mode => (
                  <button key={mode} type="button" onClick={() => set('payment_mode', mode)}
                    className={clsx('flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-colors',
                      form.payment_mode === mode ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')}>
                    <span className="text-xl">{PAYMENT_MODE_ICON[mode]}</span>
                    <span className="capitalize">{mode.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            </div>
            {form.payment_mode !== 'cash' && (
              <div><Lbl>Reference No. / UPI ID / Cheque No.</Lbl>
                <input className={F} placeholder="Ref / ID / Cheque no." value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
              </div>
            )}
            <div><Lbl>Remarks</Lbl>
              <textarea className={clsx(F, 'resize-none')} rows={3} placeholder="Notes…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>
          </div>
        </div>

        {/* RIGHT — Work Order selection */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-6">
            <SectionLabel icon={Search} color="bg-orange-50 text-orange-700" label="Work Order" />

            {loadingWOs ? (
              <div className="flex items-center gap-2 px-3 py-3 border border-slate-200 rounded-xl text-sm text-slate-400 bg-white">
                <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /> Loading work orders…
              </div>
            ) : allWOs.length > 0 ? (
              <div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input className={clsx(F, 'pl-10 bg-white')} placeholder="Search by WO No, subject or vendor…"
                    value={woSearch} onChange={e => setWoSearch(e.target.value)} />
                </div>
                {form.wo_number && (
                  <div className="mb-3 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
                    <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-orange-700">{form.wo_number}</span>
                    {form.vendor_name && <span className="text-sm text-orange-500">· {form.vendor_name}</span>}
                    <button type="button" onClick={() => { set('wo_number', ''); set('vendor_id', ''); set('vendor_name', ''); }}
                      className="ml-auto text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm max-h-[calc(100vh-340px)] overflow-y-auto">
                  {filteredWOs.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-10">No work orders match</p>
                  ) : filteredWOs.map(w => (
                    <button key={w.id} type="button"
                      onClick={() => { set('wo_number', w.wo_number); set('vendor_id', w.vendor_id); set('vendor_name', w.vendor_name || ''); }}
                      className={clsx('w-full text-left px-5 py-3 border-b border-slate-100 last:border-0 transition-colors flex items-start justify-between gap-3',
                        form.wo_number === w.wo_number ? 'bg-orange-50' : 'hover:bg-orange-50/50')}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{w.wo_number}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{w.subject || '—'}</p>
                        <p className="text-xs text-orange-600 font-medium mt-0.5">{w.vendor_name || '—'}</p>
                      </div>
                      {form.wo_number === w.wo_number && <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-1" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-w-lg">
                <div className="relative">
                  <input className={F} placeholder="Type sub-contractor name…"
                    value={vendorSearch || form.vendor_name}
                    onChange={e => { setVendorSearch(e.target.value); set('vendor_id', ''); set('vendor_name', e.target.value); }} />
                  {vendors.length > 0 && vendorSearch && (
                    <div className="absolute left-0 right-0 mt-1 border border-slate-200 rounded-xl bg-white shadow-lg max-h-40 overflow-y-auto z-20">
                      {vendors.map(v => (
                        <button key={v.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 text-slate-700 border-b border-slate-50 last:border-0"
                          onClick={() => { set('vendor_id', v.id); set('vendor_name', v.name); setVendorSearch(''); }}>
                          {v.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div><Lbl>Work Order No.</Lbl>
                  <input className={F} placeholder="e.g. WOLANLH10004" value={form.wo_number} onChange={e => set('wo_number', e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-t border-slate-200">
        <button type="button" onClick={onClose} className="px-5 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saveMut.isPending}
          className="flex items-center gap-2 px-8 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 shadow-sm transition-colors">
          {saveMut.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {saveMut.isPending ? 'Saving…' : 'Record SC Advance'}
        </button>
      </div>
    </div>
  );
}

// ── Receipt Form (HO Cash) ────────────────────────────────────────────────────
const EMPTY_RECEIPT = { project_id: '', receipt_date: dayjs().format('YYYY-MM-DD'), amount: '', received_by: '', voucher_no: '', payment_mode: 'cash', reference_number: '', remarks: '' };

function ReceiptForm({ initial, projects, defaultProjectId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(
    isEdit
      ? { project_id: initial.project_id || '', receipt_date: initial.receipt_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
          amount: initial.amount || '', received_by: initial.received_by || '', voucher_no: initial.voucher_no || '',
          payment_mode: initial.payment_mode || 'cash', reference_number: initial.reference_number || '', remarks: initial.remarks || '' }
      : { ...EMPTY_RECEIPT, project_id: defaultProjectId || '' }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: (payload) => isEdit
      ? storesPettyCashAPI.updateReceipt(initial.id, payload).then(r => r.data)
      : storesPettyCashAPI.createReceipt(payload).then(r => r.data),
    onSuccess: () => {
      toast.success(isEdit ? 'Receipt updated' : 'Receipt recorded');
      qc.invalidateQueries({ queryKey: ['spc-receipts'] });
      qc.invalidateQueries({ queryKey: ['spc-summary'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.receipt_date) return toast.error('Date is required');
    if (!parseFloat(form.amount)) return toast.error('Amount is required');
    saveMut.mutate({ ...form, amount: parseFloat(form.amount) || 0 });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[96vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-green-50 to-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center shadow-sm">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base">{isEdit ? 'Edit HO Receipt' : 'Record Cash from HO'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Cash received from Head Office</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Amount — top and most prominent */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <Lbl req>Amount Received (₹)</Lbl>
            <input type="number" step="0.01"
              className="w-full border border-green-200 bg-white rounded-xl px-4 py-3 text-2xl font-bold text-green-700 focus:outline-none focus:ring-2 focus:ring-green-400 placeholder:text-green-200"
              placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required autoFocus />
            <p className="text-xs text-green-600 mt-2 font-medium">This amount will be added to the petty cash balance</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Lbl req>Date Received</Lbl><input type="date" className={F} value={form.receipt_date} onChange={e => set('receipt_date', e.target.value)} required /></div>
            <div><Lbl>Project</Lbl>
              <select className={FS} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Not linked —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div><Lbl>Received By</Lbl>
            <input className={F} placeholder="e.g. Site Incharge" value={form.received_by} onChange={e => set('received_by', e.target.value)} />
          </div>

          <div><Lbl>HO Voucher / Ref No.</Lbl>
            <input className={F} placeholder="e.g. HO-PC-MAR-01" value={form.voucher_no} onChange={e => set('voucher_no', e.target.value)} />
          </div>

          <div>
            <Lbl>Payment Mode</Lbl>
            <div className="grid grid-cols-4 gap-2">
              {['cash', 'upi', 'bank_transfer', 'cheque'].map(mode => (
                <button key={mode} type="button" onClick={() => set('payment_mode', mode)}
                  className={clsx('flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-colors',
                    form.payment_mode === mode ? 'border-green-400 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')}>
                  <span className="text-base">{PAYMENT_MODE_ICON[mode]}</span>
                  <span className="capitalize">{mode.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {form.payment_mode !== 'cash' && (
            <div><Lbl>Reference No. / UPI ID / Cheque No.</Lbl>
              <input className={F} placeholder="Ref / ID / Cheque no." value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
            </div>
          )}

          <div><Lbl>Remarks</Lbl>
            <textarea className={clsx(F, 'resize-none')} rows={2} placeholder="Notes…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </form>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-white transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saveMut.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors">
            {saveMut.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Update Receipt' : 'Record Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Approval Modal ────────────────────────────────────────────────────────────
function ApprovalModal({ entry, mode, onConfirm, onClose }) {
  const [remarks, setRemarks] = useState('');
  const isApprove = mode === 'approve';
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', isApprove ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200')}>
              {isApprove ? <ThumbsUp className="w-4 h-4 text-green-600" /> : <ThumbsDown className="w-4 h-4 text-red-600" />}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{isApprove ? 'Approve Entry' : 'Reject Entry'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{entry.supplier} · {inr(entry.amount)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          {isApprove ? (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
              Approving this entry confirms the expense is valid and deducts <strong>{inr(entry.amount)}</strong> from the petty cash balance.
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              Rejecting this entry will exclude it from the petty cash balance. The entry remains visible for audit.
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{isApprove ? 'Approval Remarks (optional)' : 'Reason for Rejection *'}</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              rows={3}
              placeholder={isApprove ? 'Any notes for the project head record…' : 'State the reason for rejection…'}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => {
              if (!isApprove && !remarks.trim()) return toast.error('Please state a reason for rejection');
              onConfirm(remarks);
            }}
            className={clsx('px-5 py-2 text-white text-sm font-medium rounded-lg', isApprove ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')}
          >
            {isApprove ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ── Attach-Only Modal ────────────────────────────────────────────────────────
// Lets users upload / replace bill & voucher files on ANY entry (including
// Approved ones) without touching any other field.
function AttachOnlyModal({ entry, onClose, onSaved }) {
  const [voucherUrl,  setVoucherUrl]  = useState(entry.voucher_file_url  || '');
  const [voucherName, setVoucherName] = useState(entry.voucher_file_name || '');
  const [billUrl,     setBillUrl]     = useState(entry.bill_file_url     || '');
  const [billName,    setBillName]    = useState(entry.bill_file_name    || '');
  const [uploading,   setUploading]   = useState({ voucher: false, bill: false });
  const [saving,      setSaving]      = useState(false);

  const handleUpload = (kind) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(u => ({ ...u, [kind]: true }));
    try {
      const { data } = await uploadAPI.uploadSingle(file);
      if (kind === 'voucher') { setVoucherUrl(data.url); setVoucherName(file.name); }
      else                   { setBillUrl(data.url);     setBillName(file.name); }
      toast.success(`${kind === 'voucher' ? 'Voucher' : 'Bill'} uploaded`);
    } catch (err) { toast.error(err.message || 'Upload failed'); }
    finally { setUploading(u => ({ ...u, [kind]: false })); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await storesPettyCashAPI.updateEntry(entry.id, {
        ...entry,
        voucher_file_url: voucherUrl  || null,
        voucher_file_name: voucherName || null,
        bill_file_url:    billUrl     || null,
        bill_file_name:   billName    || null,
      });
      toast.success('Attachments saved');
      onSaved();
    } catch (err) { toast.error(err?.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-semibold text-slate-900">Upload Attachments</p>
            <p className="text-xs text-slate-400 mt-0.5">{entry.invoice_no || entry.supplier || 'Voucher'} · {entry.entry_date}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <FileSlot
            label="Petty Cash Voucher"
            fileUrl={voucherUrl} fileName={voucherName}
            isUploading={uploading.voucher}
            onUpload={handleUpload('voucher')}
            onView={() => openAttachment(voucherUrl)}
            onRemove={() => { setVoucherUrl(''); setVoucherName(''); }}
          />
          <FileSlot
            label="Bill / Invoice"
            fileUrl={billUrl} fileName={billName}
            isUploading={uploading.bill}
            onUpload={handleUpload('bill')}
            onView={() => openAttachment(billUrl)}
            onRemove={() => { setBillUrl(''); setBillName(''); }}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Attachments'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StoresPettyCashPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);
  const location = useLocation();
  const highlightId = location.state?.viewId || null;
  const highlightRef = useRef(null);
  const [tab, setTab] = useState(highlightId ? 'local' : 'dashboard');
  const [projectId, setProjectId] = useState('');
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });
  const [showEntryForm,   setShowEntryForm]   = useState(false);
  const [editEntry,       setEditEntry]       = useState(null);
  const [showAdvForm,     setShowAdvForm]     = useState(false);
  const [editAdv,         setEditAdv]         = useState(null);
  const [showScAdvForm,   setShowScAdvForm]   = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [approvalModal,   setApprovalModal]   = useState(null); // { entry, mode: 'approve'|'reject' }
  const [editReceipt,     setEditReceipt]     = useState(null);
  const [showRepl,        setShowRepl]        = useState(false);
  const [editBudgets,     setEditBudgets]     = useState(false);
  const [attachModal,     setAttachModal]     = useState(null); // { entry } — upload-only modal for any status
  const [localBudgets,    setLocalBudgets]    = useState(null);
  const [statusFilter,    setStatusFilter]    = useState(highlightId ? 'All' : 'All');
  const [catFilter,       setCatFilter]       = useState('All');
  const [printModal,      setPrintModal]      = useState(null); // null | { from: '', to: '' }
  const [weeklyModal,     setWeeklyModal]     = useState(null); // null | { from: '', to: '' }
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, [highlightId, highlightRef.current]);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list({ limit: 500 }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });

  const selectedProject = projects.find(p => p.id === projectId);

  const baseParams = useMemo(() => ({
    project_id: projectId || undefined,
    search: filters.search || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }), [projectId, filters]);

  const { data: entriesResp,  isLoading: loadingEntries  } = useQuery({
    queryKey: ['spc-entries', baseParams],
    queryFn: () => storesPettyCashAPI.listEntries({ ...baseParams, limit: 1000 }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: advancesResp, isLoading: loadingAdvances } = useQuery({
    queryKey: ['spc-advances', baseParams],
    queryFn: () => storesPettyCashAPI.listAdvances({ ...baseParams, limit: 1000 }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: receiptsResp, isLoading: loadingReceipts } = useQuery({
    queryKey: ['spc-receipts', baseParams],
    queryFn: () => storesPettyCashAPI.listReceipts({ project_id: projectId || undefined, limit: 500 }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: summaryResp } = useQuery({
    queryKey: ['spc-summary', projectId],
    queryFn: () => storesPettyCashAPI.summary({ project_id: projectId || undefined }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: budgetsResp } = useQuery({
    queryKey: ['spc-budgets', projectId],
    queryFn: () => storesPettyCashAPI.getBudgets({ project_id: projectId || undefined }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: scAdvancesResp, isLoading: loadingScAdv } = useQuery({
    queryKey: ['spc-sc-advances', projectId],
    queryFn: () => storesPettyCashAPI.listScAdvances({ project_id: projectId || undefined }).then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const entries    = entriesResp?.data    ?? [];
  const advances   = advancesResp?.data   ?? [];
  const receipts   = receiptsResp?.data   ?? [];
  const scAdvances = scAdvancesResp?.data ?? [];
  const summary    = summaryResp?.data    ?? {};
  const budgets    = useMemo(() => ({ ...DEFAULT_BUDGETS, ...(budgetsResp?.data ?? {}) }), [budgetsResp]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const deleteEntryMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteEntry(id),
    onSuccess: () => { toast.success('Entry deleted'); qc.invalidateQueries({ queryKey: ['spc-entries'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const deleteAdvMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteAdvance(id),
    onSuccess: () => { toast.success('Advance deleted'); qc.invalidateQueries({ queryKey: ['spc-advances'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const deleteScAdvMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteScAdvance(id),
    onSuccess: () => { toast.success('Sub Contractor Advance deleted'); qc.invalidateQueries({ queryKey: ['spc-sc-advances'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const deleteReceiptMut = useMutation({
    mutationFn: (id) => storesPettyCashAPI.deleteReceipt(id),
    onSuccess: () => { toast.success('Receipt deleted'); qc.invalidateQueries({ queryKey: ['spc-receipts'] }); qc.invalidateQueries({ queryKey: ['spc-summary'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });
  const patchStatusMut = useMutation({
    mutationFn: ({ id, status, remarks, rejected_reason }) => storesPettyCashAPI.patchStatus(id, status, remarks, rejected_reason),
    onSuccess: (_, vars) => {
      toast.success(vars.status === 'Approved' ? 'Entry approved ✓' : 'Entry rejected');
      setApprovalModal(null);
      qc.refetchQueries({ queryKey: ['spc-entries'] });
      qc.refetchQueries({ queryKey: ['spc-summary'] });
      qc.invalidateQueries({ queryKey: ['spc-budgets'] });
      qc.invalidateQueries({ queryKey: ['analytics-executive'] });
      qc.invalidateQueries({ queryKey: ['my-approvals'] });
      qc.invalidateQueries({ queryKey: ['spc-entries-accounts'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Status update failed'),
  });
  const saveBudgetsMut = useMutation({
    mutationFn: (data) => storesPettyCashAPI.updateBudgets(data),
    onSuccess: () => { toast.success('Budgets saved'); qc.invalidateQueries({ queryKey: ['spc-budgets'] }); setEditBudgets(false); },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  // ── Derived calculations ───────────────────────────────────────────────────
  const approvedEntries = useMemo(() => entries.filter(e => e.status === 'Approved'), [entries]);
  const pendingCount    = useMemo(() => entries.filter(e => e.status === 'Pending').length, [entries]);

  const totalReceived = summary.receipt_total       ?? 0;
  const totalLP       = summary.local_purchase_total ?? 0;
  const totalAdv      = summary.advance_total        ?? 0;
  const totalSC       = summary.sc_advance_total     ?? 0;
  const totalSpent    = totalLP + totalAdv + totalSC;
  const cashInHand    = totalReceived - totalSpent;

  // Running balance on filtered entries (chronological)
  const entriesWithBal = useMemo(() => {
    let bal = totalReceived;
    return [...entries]
      .sort((a, b) => a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : a.sl_no - b.sl_no)
      .map(r => { if (r.status !== 'Rejected') bal -= Number(r.amount); return { ...r, runBalance: bal }; });
  }, [entries, totalReceived]);

  // Filtered entries for Local Purchase tab
  const filteredEntries = useMemo(() => {
    return entriesWithBal.filter(r => {
      const s = statusFilter === 'All' || r.status === statusFilter;
      const cat = categoryOf((r.items?.[0]?.material_name || r.supplier || ''));
      const c = catFilter === 'All' || cat === catFilter;
      return s && c;
    });
  }, [entriesWithBal, statusFilter, catFilter]);

  // Duplicate invoice detection
  const dupInvoices = useMemo(() => {
    const map = {};
    entries.forEach(e => { if (e.invoice_no && e.invoice_no !== '–') { map[e.invoice_no] = map[e.invoice_no] || []; map[e.invoice_no].push(e.id); } });
    return Object.fromEntries(Object.entries(map).filter(([, ids]) => ids.length > 1));
  }, [entries]);

  // Category spend (approved only)
  const catSpend = useMemo(() => {
    const result = {};
    CATEGORIES.forEach(cat => { result[cat] = 0; });
    approvedEntries.forEach(e => {
      const cat = categoryOf((e.items?.[0]?.material_name || e.supplier || ''));
      result[cat] = (result[cat] || 0) + Number(e.amount);
    });
    return result;
  }, [approvedEntries]);

  // Invoice number → first entry record (for real-time duplicate warning in form)
  const existingInvoices = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      if (e.invoice_no && e.invoice_no !== '–') {
        const inv = e.invoice_no.trim();
        if (!map[inv]) map[inv] = { id: e.id, sl_no: e.sl_no, supplier: e.supplier, entry_date: e.entry_date, amount: e.amount };
      }
    });
    return map;
  }, [entries]);

  // Top suppliers
  const topSuppliers = useMemo(() => {
    const map = {};
    entries.forEach(e => { map[e.supplier] = map[e.supplier] || { count: 0, total: 0 }; map[e.supplier].count++; map[e.supplier].total += Number(e.amount); });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 7);
  }, [entries]);

  // Running cash ledger — all transaction types merged in date order
  const ledgerRows = useMemo(() => {
    const rows = [
      ...receipts.map(r => ({
        date: r.receipt_date, type: 'receipt', label: 'HO Receipt',
        desc: [r.received_by, r.voucher_no].filter(Boolean).join(' · '),
        credit: Number(r.amount), debit: 0, id: r.id,
        color: 'green',
      })),
      ...approvedEntries.map(e => ({
        date: e.entry_date, type: 'purchase', label: 'Local Purchase',
        desc: [e.supplier, e.invoice_no].filter(Boolean).join(' · '),
        voucherNo: e.pc_voucher_no,
        credit: 0, debit: Number(e.amount), id: e.id,
        color: 'blue',
      })),
      ...advances.map(a => ({
        date: a.advance_date, type: 'advance', label: 'Salary Advance',
        desc: [a.payee_name, a.description].filter(Boolean).join(' · '),
        credit: 0, debit: Number(a.amount), id: a.id,
        color: 'amber',
      })),
      ...scAdvances.map(s => ({
        date: s.advance_date, type: 'sc-advance', label: 'Sub Contractor Advance',
        desc: [s.vendor_name, s.wo_number].filter(Boolean).join(' · '),
        credit: 0, debit: Number(s.amount), id: s.id,
        color: 'orange',
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let bal = 0;
    return rows.map(r => { bal += r.credit - r.debit; return { ...r, balance: bal }; });
  }, [receipts, approvedEntries, advances, scAdvances]);

  // ── Tab helpers ────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'dashboard',    label: 'Dashboard',       Icon: BarChart2   },
    { id: 'receipts',     label: 'HO Receipts',     Icon: Wallet      },
    { id: 'local',        label: 'Local Purchase',  Icon: ShoppingBag },
    { id: 'advances',     label: 'Salary Advances', Icon: Users       },
    { id: 'sc-advances',  label: 'Sub Contractor Advances', Icon: Send },
    { id: 'ledger',       label: 'Ledger',          Icon: Rows3       },
    { id: 'analytics',    label: 'Analytics',       Icon: TrendingUp  },
    { id: 'budgets',      label: 'Budgets',         Icon: BookOpen    },
  ];

  const balanceColor = cashInHand < 0 ? 'text-red-600' : cashInHand < 5000 ? 'text-amber-600' : 'text-green-700';

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Stores Petty Cash"
        subtitle={`Site cash book${selectedProject ? ' · ' + selectedProject.name : ''}`}
        breadcrumbs={[{ label: 'Stores' }, { label: 'Petty Cash Tracker' }]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {pendingCount > 0 && (
              <button onClick={() => { setTab('local'); setStatusFilter('Pending'); }}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D' }}>
                <Clock className="w-3 h-3" /> {pendingCount} Pending
              </button>
            )}
            <div className={clsx('flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg',
              cashInHand < 0 ? 'bg-red-500/20 text-red-300' :
              cashInHand < 5000 ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300')}
              style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
              {cashInHand < 0 ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
              {inr(Math.abs(cashInHand))} {cashInHand < 0 ? 'OVERDRAWN' : 'in Hand'}
            </div>
            <button onClick={() => setPrintModal({ from: '', to: '' })}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={() => {
                const mon = dayjs().startOf('week').add(1, 'day'); // Monday
                setWeeklyModal({ from: mon.format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') });
              }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(59,130,246,0.25)', border: '1px solid rgba(59,130,246,0.5)', color: '#93c5fd' }}
              title="Email petty cash report to it@bcim.in"
            >
              <Mail className="w-3.5 h-3.5" /> Email Report
            </button>
            {isAdmin && (
              <button
                onClick={async () => {
                  if (!window.confirm(
                    projectId
                      ? `Clear file attachments (bill & voucher PDFs/images) from all entries in this project?\n\nThe voucher entries themselves (amount, date, supplier, items) will NOT be deleted.`
                      : `Clear file attachments (bill & voucher PDFs/images) from ALL project entries?\n\nThe voucher entries themselves (amount, date, supplier, items) will NOT be deleted.`
                  )) return;
                  try {
                    const r = await storesPettyCashAPI.clearAttachments(projectId || undefined);
                    toast.success(`Attachments cleared from ${r.data?.rows_updated ?? 0} voucher(s)`);
                    qc.invalidateQueries({ queryKey: ['spc-entries'] });
                  } catch (e) {
                    toast.error(e?.response?.data?.error || 'Failed to clear attachments');
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5' }}
                title="Remove all file attachments from vouchers (admin only)"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear Attachments
              </button>
            )}
            {isAdmin && (
              <button
                onClick={async () => {
                  if (!window.confirm('Assign PC voucher numbers to all existing entries that are missing them?\n\nThis runs once — entries that already have a number will not be changed.')) return;
                  const tid = toast.loading('Assigning voucher numbers…');
                  try {
                    const r = await storesPettyCashAPI.backfillVouchers();
                    toast.dismiss(tid);
                    toast.success(r.data?.message || `${r.data?.updated ?? 0} voucher(s) updated`);
                    qc.invalidateQueries({ queryKey: ['spc-entries'] });
                  } catch (e) {
                    toast.dismiss(tid);
                    toast.error(e?.response?.data?.error || 'Backfill failed');
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(234,179,8,0.2)', border: '1px solid rgba(234,179,8,0.4)', color: '#fde047' }}
                title="Assign voucher numbers to existing entries (admin only)"
              >
                <Hash className="w-3.5 h-3.5" /> Fill Voucher Nos
              </button>
            )}
          </div>
        }
      />

      {/* ── Project selector + Tab bar ── */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex items-center gap-3 pt-3 pb-0 flex-wrap">
          <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
            value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex gap-0 overflow-x-auto mt-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              <t.Icon className="w-3.5 h-3.5" /> {t.label}
              {t.id === 'local' && pendingCount > 0 && (
                <span className="ml-1 text-[10px] bg-amber-500 text-white rounded-full px-1.5 py-0.5 font-bold leading-none">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">

        {/* ══ DASHBOARD ══ */}
        {tab === 'dashboard' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Summary Overview</h2>
                <p className="text-sm text-slate-500 mt-0.5">All petty cash activity{selectedProject ? ` · ${selectedProject.name}` : ''}</p>
              </div>
              <button onClick={() => setShowRepl(true)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 shadow-sm">
                <RefreshCw className="w-4 h-4" /> Request Replenishment
              </button>
            </div>

            {/* Alerts */}
            {(cashInHand < 5000 || Object.keys(dupInvoices).length > 0) && (
              <div className="space-y-2">
                {cashInHand < 0 && (
                  <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-700">Cash overdrawn! Request replenishment from HO immediately.</span>
                  </div>
                )}
                {cashInHand >= 0 && cashInHand < 5000 && (
                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-amber-700">Cash in hand is low (below ₹5,000). Consider requesting replenishment.</span>
                  </div>
                )}
                {Object.entries(dupInvoices).map(([inv, ids]) => (
                  <div key={inv} className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-700">Duplicate invoice <b>{inv}</b> appears {ids.length} times — verify entries</span>
                  </div>
                ))}
              </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Total Received from HO" value={inr(totalReceived)} sub={`${summary.receipt_count || 0} transfers`} accent="border-green-400" valueClass="text-green-700" />
              <KpiCard label="Total Spent (Approved)" value={inr(totalSpent)} sub={`LP ${inr(totalLP)} · Adv ${inr(totalAdv)} · SC ${inr(totalSC)}`} accent="border-red-400" valueClass="text-red-700" />
              <KpiCard label="Cash in Hand" value={inr(Math.abs(cashInHand))} sub={cashInHand < 0 ? 'OVERDRAWN' : cashInHand < 5000 ? 'Low — request top-up' : 'Sufficient'} accent={cashInHand < 0 ? 'border-red-500' : cashInHand < 5000 ? 'border-amber-400' : 'border-green-400'} valueClass={balanceColor} />
              <KpiCard label="Pending Approval" value={pendingCount} sub="entries awaiting review" accent="border-amber-400" valueClass="text-amber-700" />
            </div>

            {/* Reconciliation */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-800 px-6 py-4">
                <p className="text-white font-bold text-sm">Cash Reconciliation Statement</p>
                <p className="text-slate-400 text-xs mt-0.5">Imprest Petty Cash — Site Cash Book</p>
              </div>
              <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-700 px-4 py-2.5 text-white text-sm font-semibold">Position</div>
                  <div className="p-4 space-y-2">
                    {[
                      ['Total Received from HO', inr(totalReceived), 'text-green-700 font-bold'],
                      ['Total Local Purchases (Approved)', inr(totalLP), 'text-red-600'],
                      ['Total Salary Advances', inr(totalAdv), 'text-red-600'],
                      ['Total SC Advances', inr(totalSC), 'text-red-600'],
                      ['Total Spent', inr(totalSpent), 'text-red-700 font-bold'],
                    ].map(([l, v, vc]) => (
                      <div key={l} className="flex justify-between py-1.5 border-b border-slate-50">
                        <span className="text-sm text-slate-500">{l}</span>
                        <span className={clsx('text-sm', vc)}>{v}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 mt-1">
                      <span className="text-sm font-bold text-slate-700">Cash in Hand (Closing)</span>
                      <span className={clsx('text-sm font-bold', balanceColor)}>{inr(cashInHand)}</span>
                    </div>
                    <div className="mt-2">
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(totalReceived > 0 ? (totalSpent / totalReceived) * 100 : 0, 100)}%`, background: cashInHand < 0 ? '#EF4444' : cashInHand < 5000 ? '#F59E0B' : '#22C55E' }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{totalReceived > 0 ? ((totalSpent / totalReceived) * 100).toFixed(1) : '0'}% utilisation</p>
                    </div>
                  </div>
                </div>

                {/* Category spend */}
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Spending by Category</p>
                  {CATEGORIES.map(cat => {
                    const s = CATEGORY_STYLE[cat] || CATEGORY_STYLE.Materials;
                    const spent = catSpend[cat] || 0;
                    const cap = budgets[cat] || DEFAULT_BUDGETS[cat] || 0;
                    const pct = cap > 0 ? Math.min((spent / cap) * 100, 100) : 0;
                    return (
                      <div key={cat} className="flex items-center gap-3 mb-2">
                        <CatBadge cat={cat} />
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.bar }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 w-24 text-right">{inr(spent)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Top suppliers */}
            {topSuppliers.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">Top Suppliers</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Supplier', 'Transactions', 'Total'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {topSuppliers.map(([sup, { count, total }], i) => (
                        <tr key={sup} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            {sup}{count >= 4 && <span className="ml-2 text-[10px] text-amber-600 font-semibold">⚠ high freq</span>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-center">{count}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 text-right">{inr(total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ HO RECEIPTS ══ */}
        {tab === 'receipts' && (
          <div className="space-y-4">
            {/* Summary banner */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-green-500">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Received</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{inr(totalReceived)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{summary.receipt_count || 0} transfers from HO</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-red-400">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Spent</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{inr(totalSpent)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Purchases + Advances</p>
              </div>
              <div className={clsx('bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4', cashInHand < 0 ? 'border-l-red-500' : cashInHand < 5000 ? 'border-l-amber-400' : 'border-l-indigo-400')}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash in Hand</p>
                <p className={clsx('text-2xl font-bold mt-1', balanceColor)}>{inr(Math.abs(cashInHand))}</p>
                <p className="text-xs text-slate-400 mt-0.5">{cashInHand < 0 ? 'OVERDRAWN' : 'Available balance'}</p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-slate-700">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''} recorded</p>
              <button onClick={() => { setEditReceipt(null); setShowReceiptForm(true); }}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 shadow-sm">
                <Plus className="w-3.5 h-3.5" /> Record Receipt
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingReceipts ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : receipts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <Wallet className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">No receipts recorded yet</p>
                  <button onClick={() => { setEditReceipt(null); setShowReceiptForm(true); }} className="text-sm text-green-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Record first receipt
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
                        {['#', 'Date', 'Amount Received', 'Received By', 'Voucher / Ref', 'Remarks', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {receipts.map((row, i) => (
                        <tr key={row.id} className={clsx('transition-colors cursor-pointer group', i % 2 === 0 ? 'bg-white hover:bg-green-50/40' : 'bg-slate-50/40 hover:bg-green-50/40')}
                          onClick={() => { setEditReceipt(row); setShowReceiptForm(true); }}>
                          <td className="px-4 py-3 text-slate-400 text-xs font-mono w-10">{i + 1}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-sm">{dayjs(row.receipt_date).format('DD-MM-YYYY')}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-6 rounded-full bg-green-400 flex-shrink-0" />
                              <span className="font-mono font-bold text-green-700 text-base">{inr(row.amount)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">{row.received_by || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{row.voucher_no || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs max-w-[180px] truncate">{row.remarks || '—'}</td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { if (window.confirm('Delete this receipt?')) deleteReceiptMut.mutate(row.id); }}
                              className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50 border-t-2 border-green-200">
                        <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold text-green-700 uppercase tracking-wider">Total Received ({receipts.length})</td>
                        <td className="px-4 py-3 font-mono font-bold text-green-700 text-lg">{inr(totalReceived)}</td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ LOCAL PURCHASE ══ */}
        {tab === 'local' && (
          <div className="space-y-4">
            {/* ── Toolbar ── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white"
                  placeholder="Search supplier or material…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
              </div>
              <select className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                {['All', 'Pending', 'ph_approved', 'Approved', 'Rejected'].map(s => <option key={s} value={s}>{s === 'ph_approved' ? 'PH Approved' : s}</option>)}
              </select>
              <select className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                <option value="All">All Categories</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>From</span>
                <input type="date" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={filters.from} onChange={e => setFilter('from', e.target.value)} />
                <span>To</span>
                <input type="date" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={filters.to} onChange={e => setFilter('to', e.target.value)} />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-400 whitespace-nowrap">{filteredEntries.length} entries · <span className="font-semibold text-slate-600">{inr(filteredEntries.filter(r=>r.status!=='Rejected').reduce((s,r)=>s+Number(r.amount),0))}</span></span>
                <button onClick={() => { setEditEntry(null); setShowEntryForm(true); }}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm whitespace-nowrap">
                  <Plus className="w-3.5 h-3.5" /> New Entry
                </button>
              </div>
            </div>

            {/* ── Table ── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingEntries ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : filteredEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <ShoppingBag className="w-10 h-10 opacity-20" />
                  <p className="text-sm font-medium">No entries found</p>
                  <button onClick={() => { setEditEntry(null); setShowEntryForm(true); }} className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add first entry
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
                        {['#', 'Date', 'Voucher No', 'Supplier & Materials', 'Invoice', 'Amount', 'Category', 'Status', 'Docs', 'Balance', 'Actions'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEntries.map((row, i) => {
                        const mat = row.items || [];
                        const matSummary = mat.length ? (mat.length === 1 ? mat[0].material_name : `${mat[0].material_name} +${mat.length - 1}`) : null;
                        const cat = categoryOf(mat[0]?.material_name || row.supplier || '');
                        const isDup = dupInvoices[row.invoice_no];
                        const lowBal = row.runBalance < 5000 && row.runBalance >= 0;
                        const negBal = row.runBalance < 0;
                        const isHighlight = row.id === highlightId;
                        return (
                          <tr key={row.id}
                            ref={isHighlight ? highlightRef : null}
                            className={clsx('transition-colors group',
                              isHighlight ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' :
                              i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-50'
                            )}>
                            {/* # */}
                            <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600 w-10">{row.sl_no}</td>
                            {/* Date */}
                            <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{dayjs(row.entry_date).format('DD-MM-YYYY')}</td>
                            {/* Voucher No */}
                            <td className="px-4 py-3">
                              {row.pc_voucher_no
                                ? <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                                    <Hash className="w-2.5 h-2.5" />{row.pc_voucher_no}
                                  </span>
                                : <span className="text-slate-300 text-xs">—</span>}
                            </td>
                            {/* Supplier + Materials */}
                            <td className="px-4 py-3 max-w-[220px]">
                              <p className="font-semibold text-slate-800 truncate text-sm">{row.supplier}</p>
                              {matSummary && <p className="text-xs text-slate-400 truncate mt-0.5" title={mat.map(m=>m.material_name).join(', ')}>{matSummary}</p>}
                            </td>
                            {/* Invoice */}
                            <td className="px-4 py-3 text-xs font-mono text-slate-500">
                              {isDup && <span title="Duplicate invoice" className="inline-block mr-1 text-red-500 font-bold">⚠</span>}
                              {row.invoice_no || <span className="text-slate-300">—</span>}
                            </td>
                            {/* Amount */}
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {row.status === 'Rejected'
                                ? <span className="font-mono text-xs text-slate-400 line-through">{inr(row.amount)}</span>
                                : <span className="font-mono font-bold text-slate-800">{inr(row.amount)}</span>}
                            </td>
                            {/* Category */}
                            <td className="px-4 py-3"><CatBadge cat={cat} /></td>
                            {/* Status */}
                            <td className="px-4 py-3">
                              <Badge label={row.status} />
                              {row.status === 'ph_approved' && row.ph_approved_by_name && (
                                <p className="text-[10px] text-blue-500 mt-1 whitespace-nowrap">by {row.ph_approved_by_name}</p>
                              )}
                              {row.status === 'Approved' && row.approved_by_name && (
                                <p className="text-[10px] text-green-600 mt-1 whitespace-nowrap">by {row.approved_by_name}</p>
                              )}
                              {row.status === 'Rejected' && row.rejected_reason && (
                                <p className="text-[10px] text-red-500 mt-1 truncate max-w-[100px]" title={row.rejected_reason}>{row.rejected_reason}</p>
                              )}
                            </td>
                            {/* Docs */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {row.voucher_file_url
                                  ? <button onClick={() => openAttachment(row.voucher_file_url)} title="View Voucher"
                                      className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded px-1.5 py-0.5">
                                      <Paperclip className="w-2.5 h-2.5" /> V
                                    </button>
                                  : <span className="text-slate-200 text-xs">—</span>}
                                {row.bill_file_url
                                  ? <button onClick={() => openAttachment(row.bill_file_url)} title="View Bill"
                                      className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded px-1.5 py-0.5">
                                      <Paperclip className="w-2.5 h-2.5" /> B
                                    </button>
                                  : null}
                              </div>
                            </td>
                            {/* Balance */}
                            <td className={clsx('px-4 py-3 font-mono text-xs font-bold text-right whitespace-nowrap', negBal ? 'text-red-600' : lowBal ? 'text-amber-600' : 'text-slate-500')}>
                              {inr(row.runBalance)}{lowBal && !negBal && <span className="ml-1 text-amber-500">⚠</span>}
                            </td>
                            {/* Actions */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                                {['Pending', 'ph_approved'].includes(row.status) && (
                                  <button onClick={() => setApprovalModal({ entry: row, mode: 'approve' })}
                                    className="p-1 rounded-md bg-green-50 text-green-600 hover:bg-green-100" title="Approve">
                                    <ThumbsUp className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {!['Approved', 'Rejected'].includes(row.status) && (
                                  <button onClick={() => setApprovalModal({ entry: row, mode: 'reject' })}
                                    className="p-1 rounded-md bg-red-50 text-red-500 hover:bg-red-100" title="Reject">
                                    <ThumbsDown className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {row.status !== 'Approved' && (
                                  <button onClick={() => { setEditEntry(row); setShowEntryForm(true); }}
                                    className="p-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100" title="Edit">
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button onClick={() => setAttachModal({ entry: row })}
                                  className="p-1 rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100" title="Upload / replace attachments">
                                  <Paperclip className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => printVoucher(row, selectedProject?.name)}
                                  className="p-1 rounded-md bg-indigo-50 text-indigo-500 hover:bg-indigo-100" title="Print voucher">
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => { if (window.confirm('Delete this entry?')) deleteEntryMut.mutate(row.id); }}
                                  className="p-1 rounded-md text-slate-300 hover:bg-red-50 hover:text-red-500" title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">{filteredEntries.length} entries</td>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-700 text-right">{inr(filteredEntries.filter(r => r.status !== 'Rejected').reduce((s, r) => s + Number(r.amount), 0))}</td>
                        <td colSpan={3} />
                        <td className={clsx('px-4 py-3 font-mono font-bold text-right text-sm', balanceColor)}>{inr(cashInHand)} in hand</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ SALARY ADVANCES ══ */}
        {tab === 'advances' && (
          <div className="space-y-4">
            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-amber-400">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Advances</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{inr(totalAdv)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{advances.length} payments</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-slate-300">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg per Advance</p>
                <p className="text-2xl font-bold text-slate-700 mt-1">{advances.length ? inr(totalAdv / advances.length) : '₹ 0'}</p>
                <p className="text-xs text-slate-400 mt-0.5">Average payment</p>
              </div>
              <div className={clsx('bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4', cashInHand < 0 ? 'border-l-red-500' : 'border-l-indigo-400')}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash in Hand</p>
                <p className={clsx('text-2xl font-bold mt-1', balanceColor)}>{inr(cashInHand)}</p>
                <p className="text-xs text-slate-400 mt-0.5">After all deductions</p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                  placeholder="Search contractor or employee…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
              </div>
              <div className="ml-auto">
                <button onClick={() => { setEditAdv(null); setShowAdvForm(true); }}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 shadow-sm whitespace-nowrap">
                  <Plus className="w-3.5 h-3.5" /> New Advance
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingAdvances ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : advances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <Users className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">No advances recorded yet</p>
                  <button onClick={() => { setEditAdv(null); setShowAdvForm(true); }} className="text-sm text-amber-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add first entry
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
                        {['Date', 'Contractor / Employee', 'Description', 'Remarks', 'Amount', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {advances
                        .filter(r => !filters.search || r.payee_name?.toLowerCase().includes(filters.search.toLowerCase()) || r.description?.toLowerCase().includes(filters.search.toLowerCase()))
                        .map((row, i) => (
                        <tr key={row.id} className={clsx('transition-colors cursor-pointer group', i % 2 === 0 ? 'bg-white hover:bg-amber-50/30' : 'bg-slate-50/40 hover:bg-amber-50/30')}
                          onClick={() => { setEditAdv(row); setShowAdvForm(true); }}>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{dayjs(row.advance_date).format('DD-MM-YYYY')}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{row.payee_name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-amber-50 text-amber-700 font-medium px-2 py-0.5 rounded-full">{row.description || 'Salary Advance'}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">{row.remarks || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-6 rounded-full bg-amber-400 flex-shrink-0" />
                              <span className="font-mono font-bold text-amber-700 text-base">{inr(row.amount)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { if (window.confirm('Delete this advance?')) deleteAdvMut.mutate(row.id); }}
                              className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-amber-50 border-t-2 border-amber-200">
                        <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold text-amber-700 uppercase tracking-wider">Total ({advances.length} entries)</td>
                        <td className="px-4 py-3 font-mono font-bold text-amber-700 text-lg">{inr(totalAdv)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ SC ADVANCES ══ */}
        {tab === 'sc-advances' && (() => {
          const scTotal = scAdvances.reduce((s, r) => s + Number(r.amount), 0);
          return (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-orange-400">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sub Contractor Advances</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{inr(scTotal)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{scAdvances.length} payments to sub-contractors</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-slate-300">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unique Sub-Contractors</p>
                <p className="text-2xl font-bold text-slate-700 mt-1">{new Set(scAdvances.map(r => r.vendor_name)).size}</p>
                <p className="text-xs text-slate-400 mt-0.5">Distinct vendors</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-indigo-300">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg per Payment</p>
                <p className="text-2xl font-bold text-slate-700 mt-1">{scAdvances.length ? inr(scTotal / scAdvances.length) : '₹ 0'}</p>
                <p className="text-xs text-slate-400 mt-0.5">Average advance amount</p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Recorded separately from salary advances — linked to sub-contractor billing</span>
              </div>
              <button onClick={() => setShowScAdvForm(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 shadow-sm whitespace-nowrap ml-auto">
                <Plus className="w-3.5 h-3.5" /> New Sub Contractor Advance
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loadingScAdv ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : scAdvances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <Send className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">No Sub Contractor Advances recorded yet</p>
                  <button onClick={() => setShowScAdvForm(true)} className="text-sm text-orange-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add first entry
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
                        {['Date', 'Sub-Contractor & WO', 'Project', 'Amount', 'Payment', 'Remarks', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scAdvances.map((row, i) => (
                        <tr key={row.id} className={clsx('transition-colors group', i % 2 === 0 ? 'bg-white hover:bg-orange-50/30' : 'bg-slate-50/40 hover:bg-orange-50/30')}>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{dayjs(row.advance_date).format('DD-MM-YYYY')}</td>
                          {/* Merged: Sub-Contractor + WO */}
                          <td className="px-4 py-3 max-w-[200px]">
                            <p className="font-semibold text-slate-800 truncate">{row.vendor_name}</p>
                            {row.wo_number && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{row.wo_number}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{row.project_name || '—'}</td>
                          {/* Amount with accent */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-6 rounded-full bg-orange-400 flex-shrink-0" />
                              <span className="font-mono font-bold text-orange-600 text-base">{inr(row.amount)}</span>
                            </div>
                          </td>
                          {/* Merged: Mode + Ref */}
                          <td className="px-4 py-3">
                            <p className="text-xs font-semibold text-slate-600 capitalize">{PAYMENT_MODE_ICON[row.payment_mode] || '💵'} {(row.payment_mode || 'cash').replace('_', ' ')}</p>
                            {row.reference_number && <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{row.reference_number}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs max-w-[140px] truncate">{row.remarks || '—'}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => { if (window.confirm('Delete this Sub Contractor Advance?')) deleteScAdvMut.mutate(row.id); }}
                              className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-orange-50 border-t-2 border-orange-200">
                        <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold text-orange-700 uppercase tracking-wider">Total ({scAdvances.length} entries)</td>
                        <td className="px-4 py-3 font-mono font-bold text-orange-600 text-lg">{inr(scTotal)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ══ LEDGER ══ */}
        {tab === 'ledger' && (() => {
          const TYPE_STYLE = {
            receipt:    { bg: 'bg-green-50',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700',  dot: 'bg-green-500'  },
            purchase:   { bg: 'bg-blue-50',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500'   },
            advance:    { bg: 'bg-amber-50',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500'  },
            'sc-advance':{ bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
          };
          const [ledgerFrom, setLedgerFrom] = useState('');
          const [ledgerTo,   setLedgerTo]   = useState('');
          const filtered = ledgerRows.filter(r =>
            (!ledgerFrom || r.date >= ledgerFrom) && (!ledgerTo || r.date <= ledgerTo)
          );
          // Re-compute running balance for the filtered slice
          let runBal = 0;
          const filteredWithBal = filtered.map(r => { runBal += r.credit - r.debit; return { ...r, runBal }; });
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Cash Ledger</h2>
                  <p className="text-sm text-slate-500 mt-0.5">All transactions in chronological order with running balance</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <CalendarRange className="w-3.5 h-3.5 text-slate-400" />
                    <input type="date" value={ledgerFrom} onChange={e => setLedgerFrom(e.target.value)}
                      className="text-xs border-none outline-none text-slate-700 bg-transparent" />
                    <span className="text-slate-400 text-xs">→</span>
                    <input type="date" value={ledgerTo} onChange={e => setLedgerTo(e.target.value)}
                      className="text-xs border-none outline-none text-slate-700 bg-transparent" />
                  </div>
                  {(ledgerFrom || ledgerTo) && (
                    <button onClick={() => { setLedgerFrom(''); setLedgerTo(''); }}
                      className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Balance strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Received', val: filteredWithBal.reduce((s,r) => s + r.credit, 0), color: 'border-green-400', tc: 'text-green-700' },
                  { label: 'Total Spent',    val: filteredWithBal.reduce((s,r) => s + r.debit,  0), color: 'border-red-400',   tc: 'text-red-700'   },
                  { label: 'Closing Balance', val: filteredWithBal.length ? filteredWithBal[filteredWithBal.length - 1].runBal : 0, color: 'border-indigo-400', tc: 'text-indigo-700' },
                  { label: 'Transactions', val: filteredWithBal.length, color: 'border-slate-300', tc: 'text-slate-700', isCnt: true },
                ].map(({ label, val, color, tc, isCnt }) => (
                  <div key={label} className={clsx('bg-white rounded-xl border border-slate-200 p-4 border-l-4', color)}>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
                    <p className={clsx('text-xl font-bold', tc)}>{isCnt ? val : inr(val)}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800 text-slate-100">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-[100px]">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-[120px]">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-[110px]">Voucher No</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider w-[120px] text-green-300">Credit (₹)</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider w-[120px] text-red-300">Debit (₹)</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider w-[130px]">Balance (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredWithBal.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-400 text-sm">No transactions in selected period</td></tr>
                      ) : filteredWithBal.map((row, i) => {
                        const s = TYPE_STYLE[row.type] || TYPE_STYLE.purchase;
                        return (
                          <tr key={row.id + i} className={clsx('transition-colors hover:bg-slate-50', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40')}>
                            <td className="px-4 py-3 text-slate-500 text-xs font-mono whitespace-nowrap">{dayjs(row.date).format('DD-MM-YYYY')}</td>
                            <td className="px-4 py-3">
                              <span className={clsx('inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full', s.badge)}>
                                <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', s.dot)} />
                                {row.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs font-mono text-slate-500">{row.voucherNo || '—'}</td>
                            <td className="px-4 py-3 text-slate-700 text-xs max-w-[260px] truncate" title={row.desc}>{row.desc || '—'}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-green-700 text-sm">
                              {row.credit > 0 ? inr(row.credit) : ''}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-red-600 text-sm">
                              {row.debit > 0 ? inr(row.debit) : ''}
                            </td>
                            <td className={clsx('px-4 py-3 text-right font-mono font-bold text-sm', row.runBal < 0 ? 'text-red-600' : 'text-slate-800')}>
                              {inr(Math.abs(row.runBal))}{row.runBal < 0 ? ' Dr' : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {filteredWithBal.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-300">
                          <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                            Totals ({filteredWithBal.length} entries)
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-green-700">
                            {inr(filteredWithBal.reduce((s, r) => s + r.credit, 0))}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-red-600">
                            {inr(filteredWithBal.reduce((s, r) => s + r.debit, 0))}
                          </td>
                          <td className={clsx('px-4 py-3 text-right font-mono font-bold',
                            filteredWithBal[filteredWithBal.length - 1].runBal < 0 ? 'text-red-600' : 'text-indigo-700')}>
                            {inr(Math.abs(filteredWithBal[filteredWithBal.length - 1].runBal))}
                            {filteredWithBal[filteredWithBal.length - 1].runBal < 0 ? ' Dr' : ''}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══ ANALYTICS ══ */}
        {tab === 'analytics' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Analytics & Trends</h2>
              <p className="text-sm text-slate-500 mt-0.5">Spend patterns, category breakdown, supplier insights</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Category bar chart */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <p className="text-sm font-semibold text-slate-700 mb-4">Spending by Category (Approved)</p>
                <BarChart data={CATEGORIES.map(cat => ({ label: cat, value: catSpend[cat] || 0, color: (CATEGORY_STYLE[cat] || CATEGORY_STYLE.Materials).bar }))} />
              </div>

              {/* Category table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">Category-wise Breakdown</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Category', 'Entries', 'Amount', '% of Total'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {CATEGORIES.map((cat, i) => {
                        const spent = catSpend[cat] || 0;
                        const count = approvedEntries.filter(e => categoryOf(e.items?.[0]?.material_name || e.supplier || '') === cat).length;
                        const pct = totalLP > 0 ? (spent / totalLP * 100).toFixed(1) : '0.0';
                        return (
                          <tr key={cat} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-4 py-2.5"><CatBadge cat={cat} /></td>
                            <td className="px-4 py-2.5 text-slate-500 text-center">{count}</td>
                            <td className="px-4 py-2.5 font-semibold text-slate-800">{inr(spent)}</td>
                            <td className="px-4 py-2.5 text-slate-500">{pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Supplier frequency */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Supplier Frequency — Audit Flags</p>
              {topSuppliers.filter(([, { count }]) => count >= 4).length === 0
                ? <p className="text-sm text-slate-400">No suppliers with unusually high transaction frequency.</p>
                : topSuppliers.filter(([, { count }]) => count >= 4).map(([sup, { count, total }]) => (
                  <div key={sup} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl mb-2">
                    <div>
                      <span className="text-sm font-semibold text-amber-800">{sup}</span>
                      <span className="text-xs text-slate-500 ml-2">appears {count} times · Total {inr(total)}</span>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Review</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ══ BUDGETS ══ */}
        {tab === 'budgets' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Category Budget Control</h2>
                <p className="text-sm text-slate-500 mt-0.5">Monthly caps per category vs actual spend (approved entries only)</p>
              </div>
              <div className="flex gap-2">
                {editBudgets ? (
                  <>
                    <button onClick={() => { setEditBudgets(false); setLocalBudgets(null); }}
                      className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                    <button onClick={() => saveBudgetsMut.mutate({ project_id: projectId || undefined, budgets: localBudgets || budgets })}
                      disabled={saveBudgetsMut.isPending}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {saveBudgetsMut.isPending ? 'Saving…' : 'Save Budgets'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => { setEditBudgets(true); setLocalBudgets({ ...budgets }); }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800">
                    <RefreshCw className="w-3.5 h-3.5" /> Edit Budgets
                  </button>
                )}
              </div>
            </div>

            {editBudgets && localBudgets && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                <p className="text-sm font-semibold text-indigo-800 mb-4">Set Monthly Budget Caps (₹)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {CATEGORIES.map(cat => (
                    <div key={cat}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{cat}</label>
                      <input type="number" step="100" className={F} value={localBudgets[cat] ?? 0}
                        onChange={e => setLocalBudgets(b => ({ ...b, [cat]: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {CATEGORIES.map(cat => {
                const s = CATEGORY_STYLE[cat] || CATEGORY_STYLE.Materials;
                const spent = catSpend[cat] || 0;
                const cap = (editBudgets && localBudgets ? localBudgets[cat] : budgets[cat]) || DEFAULT_BUDGETS[cat] || 0;
                const pct = cap > 0 ? (spent / cap) * 100 : 0;
                const over = spent > cap;
                return (
                  <div key={cat} className={clsx('bg-white rounded-xl border shadow-sm p-5', over ? 'border-red-300' : pct > 80 ? 'border-amber-300' : 'border-slate-200')}>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CatBadge cat={cat} />
                        {over && <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">OVER BUDGET</span>}
                        {!over && pct > 80 && <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Near Limit</span>}
                        {!over && pct <= 80 && cap > 0 && <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">On Track</span>}
                      </div>
                      <div className="text-right">
                        <span className={clsx('text-base font-bold', over ? 'text-red-700' : 'text-slate-800')}>{inr(spent)}</span>
                        <span className="text-sm text-slate-400"> / {inr(cap)}</span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(pct, 100)}%`, background: over ? '#EF4444' : pct > 80 ? '#F59E0B' : s.bar }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-slate-400">{pct.toFixed(1)}% utilised</span>
                      <span className={clsx('text-xs', over ? 'text-red-600 font-medium' : 'text-slate-400')}>
                        {over ? `${inr(spent - cap)} over budget` : cap > 0 ? `${inr(cap - spent)} remaining` : 'No cap set'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ── Modals ── */}
      {showEntryForm && (
        <EntryForm
          initial={editEntry}
          projects={projects}
          defaultProjectId={projectId}
          budgets={budgets}
          catSpend={catSpend}
          existingInvoices={existingInvoices}
          onClose={() => { setShowEntryForm(false); setEditEntry(null); }}
        />
      )}
      {showAdvForm && (
        <AdvanceForm
          initial={editAdv}
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => { setShowAdvForm(false); setEditAdv(null); }}
        />
      )}
      {showReceiptForm && (
        <ReceiptForm
          initial={editReceipt}
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => { setShowReceiptForm(false); setEditReceipt(null); }}
        />
      )}
      {showScAdvForm && (
        <ScAdvanceForm
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => setShowScAdvForm(false)}
        />
      )}
      {attachModal && (
        <AttachOnlyModal
          entry={attachModal.entry}
          onClose={() => setAttachModal(null)}
          onSaved={() => { setAttachModal(null); qc.invalidateQueries({ queryKey: ['spc-entries'] }); }}
        />
      )}
      {approvalModal && (
        <ApprovalModal
          entry={approvalModal.entry}
          mode={approvalModal.mode}
          onClose={() => setApprovalModal(null)}
          onConfirm={(remarks) => {
            const isApprove = approvalModal.mode === 'approve';
            patchStatusMut.mutate({
              id: approvalModal.entry.id,
              status: isApprove ? 'Approved' : 'Rejected',
              remarks: isApprove ? remarks : undefined,
              rejected_reason: !isApprove ? remarks : undefined,
            });
          }}
        />
      )}

      {/* ── Weekly Email Report Modal ── */}
      {weeklyModal && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Email Petty Cash Report</p>
                  <p className="text-xs text-slate-500 mt-0.5">Sends to it@bcim.in</p>
                </div>
              </div>
              <button onClick={() => setWeeklyModal(null)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <CalendarRange className="w-3.5 h-3.5" /> Report Period
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">From</label>
                    <input type="date" value={weeklyModal.from}
                      onChange={e => setWeeklyModal(m => ({ ...m, from: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">To</label>
                    <input type="date" value={weeklyModal.to}
                      onChange={e => setWeeklyModal(m => ({ ...m, to: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: 'This Week',  from: dayjs().startOf('week').add(1,'day').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
                    { label: 'Last Week',  from: dayjs().startOf('week').add(1,'day').subtract(7,'day').format('YYYY-MM-DD'), to: dayjs().startOf('week').format('YYYY-MM-DD') },
                    { label: 'This Month', from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
                    { label: 'Last Month', from: dayjs().subtract(1,'month').startOf('month').format('YYYY-MM-DD'), to: dayjs().subtract(1,'month').endOf('month').format('YYYY-MM-DD') },
                  ].map(({ label, from, to }) => (
                    <button key={label} onClick={() => setWeeklyModal({ from, to })}
                      className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-5 justify-end">
              <button onClick={() => setWeeklyModal(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                disabled={!weeklyModal.from || !weeklyModal.to}
                onClick={async () => {
                  const { from, to } = weeklyModal;
                  setWeeklyModal(null);
                  const tid = toast.loading('Sending report…');
                  try {
                    const r = await storesPettyCashAPI.emailWeeklyReport({ from, to });
                    toast.dismiss(tid);
                    toast.success(`Report sent to it@bcim.in (${dayjs(from).format('DD-MM-YYYY')} – ${dayjs(to).format('DD-MM-YYYY')})`);
                  } catch (e) {
                    toast.dismiss(tid);
                    toast.error(e?.response?.data?.error || 'Failed to send report');
                  }
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2">
                <Mail className="w-4 h-4" /> Send Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Date-Range Modal ── */}
      {printModal && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                  <Printer className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Print Statement</p>
                  <p className="text-xs text-slate-500 mt-0.5">Leave blank to print all entries</p>
                </div>
              </div>
              <button onClick={() => setPrintModal(null)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <CalendarRange className="w-3.5 h-3.5" /> Statement Period
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">From</label>
                    <input type="date" value={printModal.from}
                      onChange={e => setPrintModal(m => ({ ...m, from: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">To</label>
                    <input type="date" value={printModal.to}
                      onChange={e => setPrintModal(m => ({ ...m, to: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: 'This Month', from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().endOf('month').format('YYYY-MM-DD') },
                    { label: 'Last Month', from: dayjs().subtract(1,'month').startOf('month').format('YYYY-MM-DD'), to: dayjs().subtract(1,'month').endOf('month').format('YYYY-MM-DD') },
                    { label: 'This Week',  from: dayjs().startOf('week').format('YYYY-MM-DD'),  to: dayjs().endOf('week').format('YYYY-MM-DD')  },
                  ].map(({ label, from, to }) => (
                    <button key={label} onClick={() => setPrintModal({ from, to })}
                      className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-5 justify-end flex-wrap">
              <button onClick={() => setPrintModal(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => {
                  const f = printModal.from;
                  const t = printModal.to;
                  const filterByDate = (arr, dateKey) =>
                    (f || t) ? arr.filter(r => (!f || r[dateKey] >= f) && (!t || r[dateKey] <= t)) : arr;
                  const period = (f || t)
                    ? `${f ? dayjs(f).format('DD-MM-YYYY') : '—'} to ${t ? dayjs(t).format('DD-MM-YYYY') : '—'}`
                    : null;
                  exportPdf({
                    entries:    filterByDate(approvedEntries, 'entry_date'),
                    advances:   filterByDate(advances,        'advance_date'),
                    scAdvances: filterByDate(scAdvances,      'advance_date'),
                    receipts:   filterByDate(receipts,        'receipt_date'),
                    projectName: selectedProject?.name,
                    period,
                  });
                  setPrintModal(null);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
                <FileDown className="w-4 h-4" /> Export PDF
              </button>
              <button
                onClick={() => {
                  const f = printModal.from;
                  const t = printModal.to;
                  const filterByDate = (arr, dateKey) =>
                    (f || t) ? arr.filter(r => (!f || r[dateKey] >= f) && (!t || r[dateKey] <= t)) : arr;
                  const period = (f || t)
                    ? `${f ? dayjs(f).format('DD-MM-YYYY') : '—'} to ${t ? dayjs(t).format('DD-MM-YYYY') : '—'}`
                    : null;
                  printStatement({
                    entries:    filterByDate(approvedEntries, 'entry_date'),
                    advances:   filterByDate(advances,        'advance_date'),
                    scAdvances: filterByDate(scAdvances,      'advance_date'),
                    receipts:   filterByDate(receipts,        'receipt_date'),
                    projectName: selectedProject?.name,
                    period,
                  });
                  setPrintModal(null);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
                <Printer className="w-4 h-4" /> Print Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Replenishment Request Modal ── */}
      {showRepl && (
        <ReplenishmentModal
          totalReceived={totalReceived}
          totalSpent={totalSpent}
          cashInHand={cashInHand}
          projectName={selectedProject?.name}
          entries={approvedEntries}
          advances={advances}
          receipts={receipts}
          onClose={() => setShowRepl(false)}
        />
      )}
    </div>
  );
}

// ── Replenishment Request Modal ───────────────────────────────────────────────
function ReplenishmentModal({ totalReceived, totalSpent, cashInHand, projectName, entries, advances, receipts, onClose }) {
  const recommended = Math.max(totalSpent - totalReceived, 0) + 20000;

  const printRequest = () => {
    const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const today = dayjs().format('DD-MM-YYYY');
    const entriesRows = entries.map(e =>
      `<tr><td>${dayjs(e.entry_date).format('DD-MM-YYYY')}</td><td>${e.supplier}</td><td>${(e.items || []).map(i => i.material_name).join(', ') || '–'}</td><td style="text-align:right">${fmt(e.amount)}</td></tr>`
    ).join('');
    const advRows = advances.map(a =>
      `<tr><td>${dayjs(a.advance_date).format('DD-MM-YYYY')}</td><td>${a.payee_name}</td><td>${a.description || '–'}</td><td style="text-align:right">${fmt(a.amount)}</td></tr>`
    ).join('');

    const html = `<html><head><title>Petty Cash Replenishment Request</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1C2533; margin: 40px; }
      h1 { font-size: 20px; color: #1F3864; border-bottom: 2px solid #1F3864; padding-bottom: 8px; }
      h2 { font-size: 14px; color: #2E75B6; margin: 20px 0 6px; }
      .meta { display: flex; gap: 40px; margin: 16px 0; }
      .meta div { font-size: 12px; }
      .meta label { font-weight: bold; color: #4B5563; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #1F3864; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; }
      td { padding: 6px 10px; border-bottom: 1px solid #EEF0F3; }
      .summary-box { background: #EBF3FB; border: 1px solid #BDD7EE; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
      .summary-box table { margin: 0; }
      .summary-box td { border: none; padding: 5px 8px; }
      .highlight { font-size: 16px; font-weight: bold; color: #C55A11; }
      .sig { margin-top: 48px; display: flex; gap: 80px; }
      .sig div { border-top: 1px solid #333; padding-top: 6px; font-size: 11px; color: #4B5563; width: 180px; }
    </style></head><body>
    <h1>Petty Cash Replenishment Request</h1>
    <div class="meta">
      <div><label>Date:</label> ${today}</div>
      <div><label>Site / Project:</label> ${projectName || 'All Sites'}</div>
      <div><label>Prepared by:</label> Site Incharge / Store Keeper</div>
    </div>

    <div class="summary-box">
      <h2 style="margin-top:0">Financial Position Summary</h2>
      <table>
        <tr><td>Total Cash Received from HO</td><td style="text-align:right;font-weight:bold;color:#1E7145">${fmt(totalReceived)}</td></tr>
        <tr><td>Total Purchases (Approved)</td><td style="text-align:right;color:#C00000">${fmt(entries.reduce((s,e) => s+Number(e.amount),0))}</td></tr>
        <tr><td>Total Salary Advances</td><td style="text-align:right;color:#C00000">${fmt(advances.reduce((s,a) => s+Number(a.amount),0))}</td></tr>
        <tr><td>Total Spent</td><td style="text-align:right;font-weight:bold;color:#C00000">${fmt(totalSpent)}</td></tr>
        <tr><td><b>Current Cash in Hand</b></td><td style="text-align:right;font-weight:bold;color:${cashInHand < 0 ? '#C00000' : '#1E7145'}">${fmt(cashInHand)}</td></tr>
      </table>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid #BDD7EE">
        <span>Replenishment Requested: </span>
        <span class="highlight">${fmt(recommended)}</span>
        <span style="font-size:11px;color:#4B5563;margin-left:8px">(includes ₹20,000 buffer for upcoming expenses)</span>
      </div>
    </div>

    <h2>A. Local Purchases Breakdown</h2>
    <table><tr><th>Date</th><th>Supplier</th><th>Items</th><th>Amount</th></tr>
    ${entriesRows}
    <tr><td colspan="3" style="text-align:right;font-weight:bold">TOTAL</td><td style="text-align:right;font-weight:bold">${fmt(entries.reduce((s,e)=>s+Number(e.amount),0))}</td></tr>
    </table>

    <h2>B. Salary Advances</h2>
    <table><tr><th>Date</th><th>Name</th><th>Description</th><th>Amount</th></tr>
    ${advRows}
    <tr><td colspan="3" style="text-align:right;font-weight:bold">TOTAL</td><td style="text-align:right;font-weight:bold">${fmt(advances.reduce((s,a)=>s+Number(a.amount),0))}</td></tr>
    </table>

    <div class="sig">
      <div>Store Keeper / Prepared by</div>
      <div>Site Incharge</div>
      <div>Project Manager</div>
      <div>Accounts (HO)</div>
    </div>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Replenishment Request to HO</p>
              <p className="text-xs text-slate-500 mt-0.5">Generate a formal request for cash top-up</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            {[
              ['Period', 'Current'],
              ['Total Received from HO', inr(totalReceived)],
              ['Total Spent', inr(totalSpent)],
              ['Cash in Hand', inr(cashInHand)],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between">
                <span className="text-sm text-slate-600">{l}</span>
                <span className="text-sm font-semibold text-slate-800">{v}</span>
              </div>
            ))}
          </div>

          {/* Recommended amount */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700">Recommended Top-up Amount</span>
              <span className="text-xl font-bold text-orange-700">{inr(recommended)}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              = Amount spent beyond what was received ({inr(Math.max(totalSpent - totalReceived, 0))}) + ₹20,000 buffer for upcoming expenses
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700">
            Clicking <b>Print Request</b> opens a printable formal replenishment request with full spend breakdown, ready to submit to HO for approval.
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={printRequest}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700">
            <Printer className="w-4 h-4" /> Print / Download Request
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
