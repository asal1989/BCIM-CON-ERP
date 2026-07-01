// src/pages/stores/MINPrintTemplate.jsx
import React from 'react';
import dayjs from 'dayjs';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const getPublicAppOrigin = () => {
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL || import.meta.env?.VITE_APP_URL || import.meta.env?.VITE_APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://bcim.ddns.net:3000';
  return window.location.origin;
};

export default function MINPrintTemplate({ min }) {
  if (!min) return null;

  const verificationUrl = `${getPublicAppOrigin()}/verify/min/${min.id}`;

  return (
    <div className="print-area p-10 bg-white text-slate-900 font-sans min-h-[297mm]">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; }
          .print-area { width: 210mm; min-height: 297mm; padding: 15mm !important; }
        }
      `}</style>

      {/* Header Grid */}
      <div className="flex justify-between items-start border-b-4 border-slate-800 pb-6 mb-8">
        <div className="space-y-1">
          <h1 className="text-4xl font-medium tracking-tighter text-slate-900">MATERIAL ISSUE NOTE</h1>
          <div className="bg-slate-800 text-white px-3 py-1 text-sm font-bold uppercase tracking-widest inline-block">
            {min.status === 'draft' ? 'PROVISIONAL DRAFT' : 'OFFICIAL OUTWARD RECORD'}
          </div>
          <p className="text-xs text-slate-500 font-bold mt-2 uppercase tracking-wide">BCIM Construction Suite • Logistics Dept</p>
        </div>
        <div className="text-right flex flex-col items-end">
            <div className="mb-4">
                <QRCode value={verificationUrl} size={64} level="H" />
            </div>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest leading-none mb-1">Document Serial</p>
            <p className="text-2xl font-medium tabular-nums tracking-tighter">{min.min_number}</p>
        </div>
      </div>

      {/* Info Matrix */}
      <div className="grid grid-cols-2 gap-x-12 gap-y-6 mb-10">
        <div className="space-y-4">
          <div>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest block mb-1">Project Site / Store Source</span>
            <p className="text-lg font-medium leading-tight uppercase">{min.project_name}</p>
            <p className="text-xs text-slate-600 font-bold uppercase mt-1">Cost Center: {String(min.project_id || '').slice(0,8)}</p>
          </div>
          <div>
             <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest block mb-1">Site Activity / Location</span>
             <p className="text-base font-bold text-slate-800 uppercase leading-snug">{min.activity_name || 'GENERAL MAINTENANCE / UNSPECIFIED'}</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest block mb-1">Issue Date</span>
              <p className="text-sm font-medium">{dayjs(min.issue_date).format('DD-MM-YYYY')}</p>
            </div>
            <div>
               <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest block mb-1">Vehicle No.</span>
               <p className="text-sm font-medium uppercase">{min.vehicle_number || 'Internal Transfer'}</p>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest block mb-1">Issued To / Receiver</span>
            <p className="text-base font-medium uppercase text-slate-800">{min.issued_to || 'SITE TEAM'}</p>
            <p className="text-xs font-bold text-slate-500 uppercase mt-0.5 tracking-tight">Agency / Context: {min.contractor_name || 'LOCAL / INTERNAL WORK'}</p>
          </div>
        </div>
      </div>

      {/* Item Table */}
      <div className="mb-10">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 border-y-2 border-slate-800">
              <th className="p-3 text-left text-[10px] font-medium uppercase tracking-widest">S#</th>
              <th className="p-3 text-left text-[10px] font-medium uppercase tracking-widest">Material Specification</th>
              <th className="p-3 text-center text-[10px] font-medium uppercase tracking-widest">Requested</th>
              <th className="p-3 text-center text-[10px] font-medium uppercase tracking-widest">Issued</th>
              <th className="p-3 text-left text-[10px] font-medium uppercase tracking-widest">Unit</th>
              <th className="p-3 text-right text-[10px] font-medium uppercase tracking-widest">Purpose / Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 border-b-2 border-slate-800">
            {(min.items || []).map((it, idx) => (
              <tr key={idx} className="page-break-inside-avoid">
                <td className="p-3 text-xs font-mono text-slate-400">{idx + 1}</td>
                <td className="p-3 text-sm font-medium uppercase text-slate-800">{it.material_name}</td>
                <td className="p-3 text-center text-sm font-mono text-slate-500">{it.quantity_requested}</td>
                <td className="p-3 text-center text-sm font-medium font-mono">{it.quantity_issued}</td>
                <td className="p-3 text-[10px] font-bold uppercase text-slate-500">{it.unit}</td>
                <td className="p-3 text-right text-[10px] font-medium italic text-slate-500">{it.purpose || '---'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MIN Notes bracket */}
      {(min.material_notes || min.instructions_notes || min.remarks) && (
        <div className="mb-10 border-2 border-slate-800 overflow-hidden">
          <div className="bg-slate-800 px-4 py-2 flex items-center gap-3">
            <span className="text-xs font-black text-white uppercase tracking-widest">MIN Notes</span>
            <span className="text-[10px] text-slate-400 font-medium">Material Condition · Instructions · Notes</span>
          </div>
          <div className="grid grid-cols-3 divide-x-2 divide-slate-300">
            {[
              { lbl: 'M — Material Condition', val: min.material_notes, bg: 'bg-amber-50' },
              { lbl: 'I — Instructions to Receiver', val: min.instructions_notes, bg: 'bg-white' },
              { lbl: 'N — Notes / Remarks', val: min.remarks, bg: 'bg-indigo-50' },
            ].map(col => (
              <div key={col.lbl} className={`${col.bg} p-4`}>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">{col.lbl}</p>
                <p className="text-xs italic text-slate-700 leading-relaxed">{col.val || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signatures */}
      <div className="mt-auto pt-16 grid grid-cols-3 gap-12">
        <div className="text-center space-y-3">
          <div className="h-20 border-b border-slate-300 flex items-end justify-center pb-2">
            {min.issued_by_name && <span className="text-[10px] font-medium italic text-slate-300 opacity-50 uppercase tracking-[0.3em]">Electronically Signed</span>}
          </div>
          <div>
            <p className="text-sm font-medium uppercase">{min.issued_by_name || 'Storekeeper'}</p>
            <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">ISSUING OFFICER (STORES)</p>
          </div>
        </div>
        <div className="text-center space-y-3">
          <div className="h-20 border-b border-slate-300 flex items-end justify-center pb-2">
             {min.verified_receiver_sig && <span className="text-[10px] font-medium italic text-emerald-600 uppercase tracking-[0.3em]">Site Verified</span>}
          </div>
          <div>
            <p className="text-sm font-medium uppercase">{min.receiver_name || 'Site Engineer'}</p>
            <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">RECEIVING OFFICER (SITE)</p>
          </div>
        </div>
        <div className="text-center space-y-3">
          <div className="h-20 border-b border-slate-300"></div>
          <div>
            <p className="text-sm font-medium uppercase">Project Manager</p>
            <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">AUTHORIZING AUTHORITY</p>
          </div>
        </div>
      </div>

      {/* Forensic Trace */}
      <div className="mt-20 border-t border-slate-100 pt-6 flex justify-between items-center opacity-30 group grayscale">
        <p className="text-[8px] font-medium uppercase tracking-[0.4em] text-slate-400">
          Traceable Audit Record • BCIM-LOG-MIN-{String(min.id || '').slice(0,8)}
        </p>
        <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-slate-400 font-mono">
          Page 1 of 1
        </p>
      </div>

    </div>
  );
}
