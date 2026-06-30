import React from 'react';
import dayjs from 'dayjs';
import { QRCodeSVG } from 'qrcode.react';
import bcimLogo from '../../assets/bcim-logo.png';

export const safeInr = (value) => {
  const num = Number(value || 0);
  return `Rs. ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const safeDate = (date, format = 'DD.MM.YYYY') => {
  if (!date) return '---';
  const d = dayjs(date);
  return d.isValid() ? d.format(format) : '---';
};

export const inr = safeInr;

export const PrintPage = ({ children, orientation = 'landscape' }) => (
  <div className={`ra-print-page ${orientation === 'portrait' ? 'ra-print-portrait' : 'ra-print-landscape'}`}>
    <style dangerouslySetInnerHTML={{ __html: `
      @page portrait { size: A4 portrait; margin: 10mm 8mm 12mm; }
      @page landscape { size: A4 landscape; margin: 10mm 8mm 12mm; }

      .ra-print-page {
        position: relative;
        width: 100%;
        min-height: 100%;
        margin: 0 auto;
        background: #ffffff;
        color: #0f172a;
        box-sizing: border-box;
        font-family: Arial, Helvetica, sans-serif;
      }

      .ra-print-portrait { min-height: 277mm; max-height: 277mm; overflow: hidden; }
      .ra-print-landscape { min-height: 190mm; max-height: 190mm; overflow: hidden; }

      @media print {
        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .ra-print-page {
          break-after: page;
          page-break-after: always;
          break-inside: avoid;
        }

        .ra-print-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        .ra-print-portrait { page: portrait; }
        .ra-print-landscape { page: landscape; }
      }
    `}} />

    {children}
  </div>
);

export const PrintHeader = ({ title, subtitle, billNumber, qrUrl }) => (
  <div className="border-b border-slate-300 bg-white">
    <div className="h-2 bg-slate-900" />
    <div className="px-7 py-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0">
        <img src={bcimLogo} alt="BCIM" className="w-14 h-14 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[18px] font-medium tracking-tight text-slate-900 leading-none">BCIM Engineering Private Limited</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-slate-900 font-medium font-semibold">
            {subtitle || 'Running Account Bill Certificate'}
          </div>
          <div className="mt-2 text-[9px] uppercase tracking-[0.18em] text-slate-400">
            {title || 'Quantity Survey and Certified Payment Document'}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 flex-shrink-0">
        <div className="text-right">
          <div className="inline-flex items-center px-3 py-1 rounded-full border border-slate-300 text-[9px] uppercase tracking-[0.24em] text-slate-900 font-medium bg-slate-50">
            Client Copy
          </div>
          <div className="mt-2 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.2em]">Bill No.</div>
          <div className="text-[18px] font-mono font-medium text-slate-900 leading-none">{billNumber || '---'}</div>
        </div>
        {qrUrl && <QRCodeSVG value={qrUrl} size={48} />}
      </div>
    </div>
  </div>
);

export const ProjectStrip = ({ items }) => (
  <div className="px-7 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-slate-200 bg-slate-50">
    {items.map((it, idx) => (
      <div key={idx} className="space-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <span className="block text-[8px] font-medium text-slate-900 font-medium uppercase tracking-[0.2em]">{it.label}</span>
        <span className="block text-[10px] font-medium text-slate-900 leading-snug">{it.value || '---'}</span>
      </div>
    ))}
  </div>
);

export const PrintFooter = () => (
  <div className="border-t border-slate-200 px-7 py-3 mt-auto flex justify-between items-center text-[8px] text-slate-900 font-medium uppercase tracking-[0.2em] bg-white">
    <div>Generated: {dayjs().format('DD.MM.YYYY HH:mm')}</div>
    <div>BCIM ERP | Client Submission Document</div>
  </div>
);

export const SectionTitle = ({ title }) => (
  <div className="border-b border-slate-900 mb-3 mt-4 pb-1">
    <h2 className="text-[10px] font-medium text-slate-900 uppercase tracking-[0.22em]">{title}</h2>
  </div>
);

export const SignatureBlock = ({ label, role, date, name }) => (
  <div className="text-center pt-3 border-t border-slate-300 flex-1">
    <div className="text-[11px] font-medium text-slate-900 min-h-[16px]">{name || '---'}</div>
    <div className="text-[8px] font-medium text-slate-900 uppercase tracking-[0.18em]">{role || label}</div>
    <div className="text-[8px] text-slate-900 font-medium mt-1 uppercase">{date ? `Date: ${safeDate(date)}` : ''}</div>
  </div>
);
