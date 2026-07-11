import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import {
  Download, FileText, CreditCard, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, IndianRupee, Building2,
  Loader2, Printer, RefreshCw, Filter,
} from 'lucide-react';
import { clsx } from 'clsx';
import { hrPayrollAPI, hrPayrollExtAPI, companySettingsAPI, projectAPI } from '../../api/client';
import { PageHeader } from '../../theme';
import useAuthStore from '../../store/authStore';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function fmt(n)  { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function fmtNum(n){ return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function fyOptions() {
  const curr = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => curr - i);
}

// ── Load logo as base64 for jsPDF (auth-protected endpoint) ──────────────────
async function fetchLogoBase64(logoUrl, token) {
  if (!logoUrl || !token) return null;
  try {
    const resp = await fetch(logoUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Draw company letterhead on jsPDF page ─────────────────────────────────────
function drawLetterhead(doc, company, logoBase64, opts = {}) {
  const { PW = 210, ML = 14, MR = 14 } = opts;
  const CW = PW - ML - MR;
  const INDIGO = [79, 70, 229];

  // Top accent bar
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, PW, 1.5, 'F');

  let y = 8;

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, y, 22, 14, undefined, 'FAST');
    } catch {}
    // Company info to the right of logo
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(company.name || 'Company', ML + 26, y + 6);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const addr = [company.address, company.city, company.state, company.pincode].filter(Boolean).join(', ');
    if (addr) doc.text(addr, ML + 26, y + 11);
    const contacts = [company.gstin && `GSTIN: ${company.gstin}`, company.pan && `PAN: ${company.pan}`, company.phone].filter(Boolean).join('  ·  ');
    if (contacts) doc.text(contacts, ML + 26, y + 16);
    y += 20;
  } else {
    // No logo — full-width text block
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(company.name || 'Company', PW / 2, y + 7, { align: 'center' });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const addr = [company.address, company.city, company.state, company.pincode].filter(Boolean).join(', ');
    if (addr) { doc.text(addr, PW / 2, y + 13, { align: 'center' }); }
    const contacts = [company.gstin && `GSTIN: ${company.gstin}`, company.pan && `PAN: ${company.pan}`, company.phone].filter(Boolean).join('  ·  ');
    if (contacts) { doc.text(contacts, PW / 2, y + 18, { align: 'center' }); }
    y += 22;
  }

  // Divider
  doc.setDrawColor(...INDIGO); doc.setLineWidth(0.5);
  doc.line(ML, y, ML + CW, y);
  return y + 4;
}

// ── Draw footer on every page ─────────────────────────────────────────────────
function drawFooters(doc, company, PW = 210, ML = 14) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const PH = doc.internal.pageSize.getHeight();
    doc.setFillColor(248, 250, 252);
    doc.rect(0, PH - 10, PW, 10, 'F');
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
    doc.line(ML, PH - 10, PW - ML, PH - 10);
    doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(company.name || '', ML, PH - 4.5);
    doc.text(`Page ${p} of ${pages}`, PW - ML, PH - 4.5, { align: 'right' });
    doc.text(`Confidential — Generated ${new Date().toLocaleDateString('en-IN')}`, PW / 2, PH - 4.5, { align: 'center' });
  }
}

// ── Generate Form 16 PDF for one employee ─────────────────────────────────────
async function generateForm16PDF(r, fyYear, company, logoBase64) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW   = 210; const ML = 14; const MR = 14; const CW = PW - ML - MR;
  const INDIGO = [79, 70, 229];

  let y = drawLetterhead(doc, company, logoBase64, { PW, ML, MR });

  // Report title
  doc.setFillColor(...INDIGO);
  doc.roundedRect(ML, y, CW, 9, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text(`FORM 16 — Certificate of Tax Deducted at Source`, PW / 2, y + 6, { align: 'center' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(`Under Section 203 of the Income Tax Act, 1961  ·  FY ${fyYear - 1}–${String(fyYear).slice(-2)}`, PW / 2, y + 13, { align: 'center' });
  y += 18;

  // Employee info box
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(ML, y, CW, 22, 2, 2, 'F');
  doc.setTextColor(71, 85, 105); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text('EMPLOYEE DETAILS', ML + 4, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(15, 23, 42);

  const empFields = [
    ['Name',        r.full_name || '—'],
    ['Employee ID', r.emp_code  || '—'],
    ['Designation', r.designation || '—'],
    ['PAN',         r.pan_number  || 'Not Set'],
  ];
  empFields.forEach(([lbl, val], i) => {
    const col = i < 2 ? 0 : 1;
    const row = i % 2;
    const cx  = ML + 4 + col * (CW / 2);
    const cy  = y + 10 + row * 6;
    doc.setTextColor(100, 116, 139); doc.setFontSize(7);
    doc.text(lbl, cx, cy);
    doc.setTextColor(15, 23, 42); doc.setFontSize(8.5);
    doc.text(val, cx, cy + 4);
  });
  y += 26;

  // ── Part B: Salary details ──
  const sectionHeader = (title, color = INDIGO) => {
    doc.setFillColor(...color);
    doc.rect(ML, y, 3, 6, 'F');
    doc.setTextColor(...color); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(title, ML + 5, y + 4.5);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
    doc.line(ML, y + 7, ML + CW, y + 7);
    y += 10;
  };

  const tableRow = (label, value, bold = false, color = null) => {
    if (y > 268) { doc.addPage(); y = 14; }
    doc.setFontSize(8.5);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(bold ? 15 : 51, bold ? 23 : 65, bold ? 42 : 85);
    if (color) doc.setTextColor(...color);
    doc.text(label, ML + 4, y);
    doc.setTextColor(...(color || (bold ? [15,23,42] : [51,65,85])));
    doc.text(value, ML + CW - 2, y, { align: 'right' });
    doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.1);
    doc.line(ML + 4, y + 1.5, ML + CW, y + 1.5);
    y += 6;
  };

  // Earnings
  sectionHeader('PART B — SALARY & EARNINGS');
  tableRow('Basic Salary',              fmt(r.total_basic));
  tableRow('House Rent Allowance (HRA)',fmt(r.total_hra));
  tableRow('Conveyance Allowance',      fmt(r.total_conveyance));
  tableRow('Medical Allowance',         fmt(r.total_medical));
  tableRow('Special Allowance',         fmt(r.total_special));
  if (+r.total_other_earnings) tableRow('Other Earnings', fmt(r.total_other_earnings));
  doc.setFillColor(239, 246, 255);
  doc.rect(ML, y - 1, CW, 7, 'F');
  tableRow('Gross Salary (A)', fmt(r.total_gross), true, [37, 99, 235]);
  y += 2;

  // Deductions
  sectionHeader('STATUTORY DEDUCTIONS', [16, 185, 129]);
  tableRow('Provident Fund (Employee) — u/s 80C', fmt(r.total_pf_employee));
  tableRow('Professional Tax',                     fmt(r.total_pt));
  tableRow('ESI (Employee Contribution)',           fmt(r.total_esi_employee));
  tableRow('Standard Deduction — u/s 16(ia)',      fmt(r.standard_deduction || 75000));
  doc.setFillColor(240, 253, 244);
  doc.rect(ML, y - 1, CW, 7, 'F');
  tableRow('Total Deductions (B)', fmt(r.total_deductions), true, [5, 150, 105]);
  y += 2;

  // Tax computation
  sectionHeader('TAX COMPUTATION', [245, 158, 11]);
  tableRow('Gross Salary (A)', fmt(r.total_gross));
  tableRow('Less: Total Deductions (B)', `- ${fmt(r.total_deductions)}`);
  doc.setFillColor(255, 251, 235);
  doc.rect(ML, y - 1, CW, 7, 'F');
  tableRow('Taxable Income (A - B)', fmt(r.taxable_income), true, [180, 83, 9]);
  y += 2;

  doc.setFillColor(254, 242, 242);
  doc.roundedRect(ML, y, CW, 10, 1.5, 1.5, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(185, 28, 28);
  doc.text('Total TDS Deducted & Deposited', ML + 4, y + 7);
  doc.text(fmt(r.total_tds), ML + CW - 2, y + 7, { align: 'right' });
  y += 14;

  doc.setFillColor(240, 253, 244);
  doc.roundedRect(ML, y, CW, 10, 1.5, 1.5, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(5, 150, 105);
  doc.text('Net Salary (Take Home)', ML + 4, y + 7);
  doc.text(fmt(r.total_net_pay), ML + CW - 2, y + 7, { align: 'right' });
  y += 16;

  // Attendance summary
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(ML, y, CW, 12, 1.5, 1.5, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  const attArr = [
    [`Months Processed: ${r.months_processed || '—'}`],
    [`Working Days: ${r.total_working_days || '—'}`],
    [`Days Paid: ${r.total_paid_days || '—'}`],
    [`LOP Days: ${r.total_lop_days || '0'}`],
  ];
  attArr.forEach((a, i) => doc.text(a[0], ML + 4 + i * (CW / 4), y + 8));
  y += 18;

  // Employer declaration
  if (y > 250) { doc.addPage(); y = 18; }
  doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 116, 139);
  const decl = `Certified that the tax mentioned above has been deducted and deposited to the credit of the Central Government. This certificate is issued u/s 203 of the Income Tax Act, 1961.`;
  const declLines = doc.splitTextToSize(decl, CW);
  doc.text(declLines, ML, y);
  y += declLines.length * 4 + 8;

  // Signature block
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3);
  doc.line(ML, y + 8, ML + 55, y + 8);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
  doc.text('Authorized Signatory', ML, y + 12);
  doc.text(company.name || '', ML, y + 16);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, ML + CW, y + 12, { align: 'right' });

  drawFooters(doc, company, PW, ML);
  doc.save(`Form16_${r.full_name?.replace(/\s+/g,'_')}_FY${fyYear - 1}_${fyYear}.pdf`);
}

// ── Generate Bulk Form 16 Summary PDF ─────────────────────────────────────────
async function generateBulkForm16PDF(rows, fyYear, company, logoBase64, projectName) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW  = 297; const PH = 210; const ML = 14; const MR = 14; const CW = PW - ML - MR;

  let y = drawLetterhead(doc, company, logoBase64, { PW, ML, MR });

  // Title
  const INDIGO = [79, 70, 229];
  doc.setFillColor(...INDIGO);
  doc.roundedRect(ML, y, CW, 9, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(`Form 16 — TDS Summary   ·   FY ${fyYear - 1}–${String(fyYear).slice(-2)}${projectName ? `   ·   ${projectName}` : ''}`, PW / 2, y + 6, { align: 'center' });
  y += 14;

  // KPI strip
  const totalGross   = rows.reduce((s, r) => s + +r.total_gross,   0);
  const totalTDS     = rows.reduce((s, r) => s + +r.total_tds,     0);
  const totalNetPay  = rows.reduce((s, r) => s + +r.total_net_pay, 0);
  const kpis = [
    { label: 'Total Employees', value: String(rows.length),    color: INDIGO },
    { label: 'Total Gross',     value: fmt(totalGross),        color: [37,99,235]   },
    { label: 'Total TDS',       value: fmt(totalTDS),          color: [185,28,28]   },
    { label: 'Total Net Pay',   value: fmt(totalNetPay),       color: [5,150,105]   },
  ];
  const kW = CW / 4 - 2;
  kpis.forEach((k, i) => {
    const kx = ML + i * (kW + 2.5);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(kx, y, kW, 12, 1.5, 1.5, 'F');
    doc.setTextColor(...k.color); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(k.value, kx + 3, y + 7);
    doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(k.label, kx + 3, y + 11);
  });
  y += 16;

  // Table
  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [[
      '#', 'Employee Name', 'Emp ID', 'Designation', 'PAN',
      'Basic', 'HRA', 'Gross', 'PF', 'PT', 'TDS', 'Net Pay',
    ]],
    body: rows.map((r, i) => [
      i + 1,
      r.full_name,
      r.emp_code || '—',
      r.designation || '—',
      r.pan_number  || 'N/A',
      fmtNum(r.total_basic),
      fmtNum(r.total_hra),
      fmtNum(r.total_gross),
      fmtNum(r.total_pf_employee),
      fmtNum(r.total_pt),
      fmtNum(r.total_tds),
      fmtNum(r.total_net_pay),
    ]),
    foot: [[
      '', 'TOTAL', '', '', '',
      fmtNum(rows.reduce((s, r) => s + +r.total_basic, 0)),
      fmtNum(rows.reduce((s, r) => s + +r.total_hra,   0)),
      fmtNum(totalGross),
      fmtNum(rows.reduce((s, r) => s + +r.total_pf_employee, 0)),
      fmtNum(rows.reduce((s, r) => s + +r.total_pt, 0)),
      fmtNum(totalTDS),
      fmtNum(totalNetPay),
    ]],
    styles:     { fontSize: 7.5, cellPadding: 2.5, lineColor: [226,232,240], lineWidth: 0.1 },
    headStyles: { fillColor: INDIGO, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [241,245,249], textColor: [15,23,42], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248,250,252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
      8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' },
    },
  });

  drawFooters(doc, company, PW, ML);
  doc.save(`Form16_Summary_FY${fyYear - 1}_${fyYear}.pdf`);
}

// ── Generate Bank Transfer Advice PDF ─────────────────────────────────────────
async function generateBankAdvicePDF(month, year, payrollRows, company, logoBase64, projectName) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW  = 297; const ML = 14; const MR = 14; const CW = PW - ML - MR;
  const TEAL = [13, 148, 136];

  let y = drawLetterhead(doc, company, logoBase64, { PW, ML, MR });

  // Title banner
  doc.setFillColor(...TEAL);
  doc.roundedRect(ML, y, CW, 10, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  const projSuffix = projectName ? `  ·  ${projectName}` : '';
  doc.text(`Salary Disbursement Advice  ·  ${MONTHS[month - 1]} ${year}${projSuffix}`, PW / 2, y + 7, { align: 'center' });
  y += 14;

  const totalNet = payrollRows.reduce((s, r) => s + +r.net_salary, 0);
  const kpis = [
    { label: 'Total Employees', value: String(payrollRows.length),   color: [79,70,229]   },
    { label: 'Total Amount',    value: fmt(totalNet),                 color: TEAL          },
    { label: 'Transfer Month',  value: `${MONTHS[month - 1]} ${year}`, color: [245,158,11] },
    { label: 'Mode',            value: 'NEFT / RTGS',                 color: [71,85,105]   },
  ];
  const kW = CW / 4 - 2;
  kpis.forEach((k, i) => {
    const kx = ML + i * (kW + 2.5);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(kx, y, kW, 12, 1.5, 1.5, 'F');
    doc.setTextColor(...k.color); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(k.value, kx + 3, y + 7);
    doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(k.label, kx + 3, y + 11);
  });
  y += 16;

  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [['#', 'Employee Name', 'Employee ID', 'Bank Name', 'Account Number', 'IFSC Code', 'Gross (₹)', 'Deductions (₹)', 'Net Salary (₹)']],
    body: payrollRows.map((r, i) => [
      i + 1,
      r.employee_name || r.full_name || '—',
      r.employee_code  || r.emp_code || '—',
      r.bank_name      || '—',
      r.account_number || '—',
      r.ifsc_code      || '—',
      fmtNum(r.gross_salary  || r.gross_earnings),
      fmtNum(r.total_deductions),
      fmtNum(r.net_salary    || r.net_pay),
    ]),
    foot: [['', 'TOTAL', '', '', '', '',
      fmtNum(payrollRows.reduce((s, r) => s + +(r.gross_salary || r.gross_earnings || 0), 0)),
      fmtNum(payrollRows.reduce((s, r) => s + +(r.total_deductions || 0), 0)),
      fmtNum(totalNet),
    ]],
    styles:     { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [240,253,250], textColor: [5,150,105], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248,250,252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
    },
  });

  // Signature block after table
  const afterY = doc.lastAutoTable.finalY + 10;
  const SIG_Y  = Math.min(afterY, doc.internal.pageSize.getHeight() - 30);
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3);
  doc.line(ML, SIG_Y + 8, ML + 55, SIG_Y + 8);
  doc.line(PW - MR - 55, SIG_Y + 8, PW - MR, SIG_Y + 8);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
  doc.text('Prepared by (HR)', ML, SIG_Y + 12);
  doc.text('Authorized Signatory', PW - MR - 55, SIG_Y + 12);
  doc.text(`${company.name || ''}`, PW - MR - 55, SIG_Y + 16);

  drawFooters(doc, company, PW, ML);
  doc.save(`Salary_Transfer_${MONTHS[month - 1]}_${year}.pdf`);
}

// ── Form 16 Row ───────────────────────────────────────────────────────────────
function Form16Row({ r, expanded, onToggle, onDownloadPDF, downloading }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden mb-2 bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/80 text-left transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
            {(r.full_name?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-slate-800">{r.full_name}</div>
            <div className="text-xs text-slate-400">{r.emp_code} · {r.designation || 'N/A'} · PAN: {r.pan_number || <span className="text-amber-500">Not set</span>}</div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-slate-400">Gross</div>
            <div className="text-sm font-semibold text-slate-700">{fmt(r.total_gross)}</div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-slate-400">TDS</div>
            <div className="text-sm font-semibold text-red-600">{fmt(r.total_tds)}</div>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-[10px] text-slate-400">Net Pay</div>
            <div className="text-sm font-semibold text-emerald-600">{fmt(r.total_net_pay)}</div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDownloadPDF(r); }}
            disabled={downloading}
            className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5"
          >
            {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Form 16
          </button>
          <div className="text-slate-300">{expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Earnings */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Earnings ({r.months_processed} months)</p>
              <table className="w-full text-sm">
                <tbody>
                  {[['Basic', r.total_basic],['HRA', r.total_hra],['Conveyance', r.total_conveyance],['Medical', r.total_medical],['Special Allowance', r.total_special],['Other', r.total_other_earnings]].map(([l,v]) => (
                    <tr key={l} className="border-b border-slate-100">
                      <td className="py-1 text-slate-600">{l}</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{fmt(v)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-blue-50">
                    <td className="py-1.5 px-1 text-blue-700 rounded-l">Gross</td>
                    <td className="py-1.5 px-1 text-right tabular-nums text-blue-700 rounded-r">{fmt(r.total_gross)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Deductions */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Deductions</p>
              <table className="w-full text-sm">
                <tbody>
                  {[['PF (Employee)', r.total_pf_employee],['ESI (Employee)', r.total_esi_employee],['Professional Tax', r.total_pt],['TDS', r.total_tds],['Loan Deduction', r.total_loan_deduction]].map(([l,v]) => (
                    <tr key={l} className="border-b border-slate-100">
                      <td className="py-1 text-slate-600">{l}</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{fmt(v)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-emerald-50">
                    <td className="py-1.5 px-1 text-emerald-700 rounded-l">Total Deductions</td>
                    <td className="py-1.5 px-1 text-right tabular-nums text-emerald-700 rounded-r">{fmt(r.total_deductions)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tax computation */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Tax Computation</p>
              <div className="space-y-1.5 text-sm">
                {[
                  ['Gross Salary',       fmt(r.total_gross),         'text-slate-700'],
                  ['Less: PF',           `- ${fmt(r.total_pf_employee)}`, 'text-red-500'],
                  ['Less: Std Deduction',`- ${fmt(r.standard_deduction || 50000)}`, 'text-red-500'],
                ].map(([l,v,c]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-500">{l}</span>
                    <span className={clsx('tabular-nums font-medium', c)}>{v}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold border-t pt-1 border-slate-200">
                  <span className="text-amber-700">Taxable Income</span>
                  <span className="tabular-nums text-amber-700">{fmt(r.taxable_income)}</span>
                </div>
                <div className="flex justify-between font-bold bg-red-50 rounded px-2 py-1.5">
                  <span className="text-red-700">TDS Deducted</span>
                  <span className="tabular-nums text-red-700">{fmt(r.total_tds)}</span>
                </div>
                <div className="flex justify-between font-bold bg-emerald-50 rounded px-2 py-1.5">
                  <span className="text-emerald-700">Net Pay</span>
                  <span className="tabular-nums text-emerald-700">{fmt(r.total_net_pay)}</span>
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  Working: {r.total_working_days}d · Paid: {r.total_paid_days}d · LOP: {r.total_lop_days || 0}d
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bank Transfer Section ─────────────────────────────────────────────────────
function BankTransferSection({ company, logoBase64, projects }) {
  const accessToken = useAuthStore(s => s.accessToken);
  const currDate    = new Date();
  const [month, setMonth]         = useState(currDate.getMonth() + 1);
  const [year,  setYear]          = useState(currDate.getFullYear());
  const [projectId, setProjectId] = useState('');
  const [downloading, setDl]      = useState(null);

  const { data: payrollData, isLoading } = useQuery({
    queryKey: ['payroll-bank-list', month, year, projectId],
    queryFn: () => hrPayrollAPI.list({ month, year, project_id: projectId || undefined }).then(r => r.data?.data || []),
    enabled: true,
  });

  const rows = payrollData || [];
  const totalNet = rows.reduce((s, r) => s + +(r.net_salary || r.net_pay || 0), 0);

  const handleDownloadFile = async (format) => {
    setDl(format);
    try {
      const response = await hrPayrollExtAPI.bankTransfer({ month, year, format, project_id: projectId || undefined });
      const blob  = response.data instanceof Blob ? response.data : new Blob([response.data]);
      const ext   = format === 'text' ? 'txt' : 'csv';
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href = url; a.download = `salary_transfer_${MONTHS[month-1]}_${year}.${ext}`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed: ' + (err?.response?.data?.error || err.message));
    } finally { setDl(null); }
  };

  const handleDownloadPDF = async () => {
    if (!rows.length) return;
    setDl('pdf');
    try {
      const projName = projects?.find(p => String(p.id) === String(projectId))?.name;
      await generateBankAdvicePDF(month, year, rows, company, logoBase64, projName);
    } finally { setDl(null); }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
          <select value={month} onChange={e => setMonth(+e.target.value)}
            className="h-9 border border-slate-200 rounded-xl px-3 text-sm focus:outline-none focus:border-indigo-400">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
          <select value={year} onChange={e => setYear(+e.target.value)}
            className="h-9 border border-slate-200 rounded-xl px-3 text-sm focus:outline-none focus:border-indigo-400">
            {fyOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Project</label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="h-9 border border-slate-200 rounded-xl px-3 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">All Projects</option>
            {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => handleDownloadFile('csv')} disabled={!!downloading || !rows.length}
            className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-2">
            {downloading === 'csv' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            CSV
          </button>
          <button onClick={() => handleDownloadFile('text')} disabled={!!downloading || !rows.length}
            className="h-9 px-4 rounded-xl bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-2">
            {downloading === 'text' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            TXT (NEFT)
          </button>
          <button onClick={handleDownloadPDF} disabled={!!downloading || !rows.length}
            className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-2">
            {downloading === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download PDF
          </button>
        </div>
      </div>

      {/* Summary KPI */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Employees', value: rows.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Total Net Salary', value: fmt(totalNet), color: 'text-teal-600', bg: 'bg-teal-50' },
            { label: 'Month', value: `${MONTHS[month-1]} ${year}`, color: 'text-slate-700', bg: 'bg-slate-50' },
          ].map(k => (
            <div key={k.label} className={clsx('rounded-2xl border border-slate-200 px-5 py-4 shadow-sm', k.bg)}>
              <div className={clsx('text-xl font-bold', k.color)}>{k.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Employee table preview */}
      {isLoading && <div className="py-12 text-center text-slate-400 text-sm">Loading salary data…</div>}
      {!isLoading && rows.length === 0 && (
        <div className="py-12 text-center bg-white rounded-2xl border border-slate-200">
          <IndianRupee className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">No approved payroll found for {MONTHS[month-1]} {year}</p>
          <p className="text-xs text-slate-400 mt-1">Run and approve payroll first</p>
        </div>
      )}
      {!isLoading && rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Salary Transfer — {MONTHS[month-1]} {year}</p>
            <span className="text-xs text-slate-400">{rows.length} employees</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#','Employee','ID','Bank','Account No.','IFSC','Gross','Deductions','Net Salary'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.user_id || i} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 text-slate-400">{i+1}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{r.employee_name || r.full_name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 font-mono text-[10px]">{r.employee_code || r.emp_code || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.bank_name || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-slate-600">{r.account_number || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-slate-600">{r.ifsc_code || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmt(r.gross_salary || r.gross_earnings)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{fmt(r.total_deductions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-700">{fmt(r.net_salary || r.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                  <td colSpan={6} className="px-3 py-2.5 text-slate-700">TOTAL</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmt(rows.reduce((s,r)=>s++(r.gross_salary||r.gross_earnings||0),0))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{fmt(rows.reduce((s,r)=>s++(r.total_deductions||0),0))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{fmt(totalNet)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 space-y-1">
        <div className="font-semibold">Before uploading to bank:</div>
        <div>• Ensure employee bank details (Account No, IFSC) are set in Employee Profile → Banking tab</div>
        <div>• Only employees with status <strong>approved</strong> or <strong>paid</strong> appear in the file</div>
        <div>• CSV format works with HDFC, ICICI, Axis, SBI bulk payment portals</div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PayrollReportsPage() {
  const accessToken = useAuthStore(s => s.accessToken);
  const currYear    = new Date().getFullYear();
  const [fyYear, setFyYear]       = useState(currYear);
  const [projectId, setProjectId] = useState('');
  const [expandedId, setExpandedId]   = useState(null);
  const [activeTab, setActiveTab]     = useState('form16');
  const [downloading, setDownloading] = useState(null);
  const [logoBase64, setLogoBase64]   = useState(null);

  // ── Company settings ──
  const { data: companyData } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => companySettingsAPI.get().then(r => r.data?.data || r.data),
    staleTime: 10 * 60 * 1000,
  });
  const company = companyData || {};

  // ── Projects ──
  const { data: projectsData } = useQuery({
    queryKey: ['projects-list-payroll-reports'],
    queryFn: () => projectAPI.list({ limit: 200 }).then(r => r.data?.data || r.data || []),
  });
  const projects = projectsData || [];

  // ── Load logo as base64 for PDF ──
  useEffect(() => {
    if (!company.logo_url || !accessToken) return;
    fetchLogoBase64(company.logo_url, accessToken).then(b64 => { if (b64) setLogoBase64(b64); });
  }, [company.logo_url, accessToken]);

  // ── Logo for display (blob URL, auth-fetched) ──
  const [logoDisplayUrl, setLogoDisplayUrl] = useState(null);
  useEffect(() => {
    if (!company.logo_url || !accessToken) return;
    let url = null;
    fetch(company.logo_url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) { url = URL.createObjectURL(blob); setLogoDisplayUrl(url); } })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [company.logo_url, accessToken]);

  // ── Form 16 query ──
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['form16', fyYear, projectId],
    queryFn: () => hrPayrollExtAPI.form16({ year: fyYear, project_id: projectId || undefined }),
    select: r => r.data,
    enabled: activeTab === 'form16',
  });
  const rows = data?.data || [];

  const handleDownloadOneForm16 = async (r) => {
    setDownloading(r.user_id);
    try { await generateForm16PDF(r, fyYear, company, logoBase64); }
    finally { setDownloading(null); }
  };

  const handleDownloadBulkForm16 = async () => {
    if (!rows.length) return;
    setDownloading('bulk');
    try {
      const projName = projects.find(p => String(p.id) === String(projectId))?.name;
      await generateBulkForm16PDF(rows, fyYear, company, logoBase64, projName);
    } finally { setDownloading(null); }
  };

  const companyAddr = [company.address, company.city, company.state].filter(Boolean).join(', ');

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader
        title="Payroll Reports"
        subtitle="Form 16 · TDS Summary · Bank Transfer"
        breadcrumbs={[{ label: 'HR & Admin' }, { label: 'Payroll Reports' }]}
      />

      <div className="flex-1 overflow-auto p-5 md:p-6 space-y-5">

        {/* Company info banner */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-4">
          {logoDisplayUrl ? (
            <img src={logoDisplayUrl} alt="Logo" className="h-12 w-auto object-contain flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-indigo-600" />
            </div>
          )}
          <div>
            <p className="text-base font-bold text-slate-900">{company.name || 'Company Name'}</p>
            {companyAddr && <p className="text-xs text-slate-500 mt-0.5">{companyAddr}</p>}
            <div className="flex gap-3 mt-1 flex-wrap">
              {company.gstin && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-medium">GSTIN: {company.gstin}</span>}
              {company.pan   && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">PAN: {company.pan}</span>}
              {company.cin   && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">CIN: {company.cin}</span>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { id: 'form16', label: 'Form 16 / TDS', icon: FileText   },
            { id: 'bank',   label: 'Bank Transfer',  icon: CreditCard },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={clsx('flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}>
              <Icon size={15}/>{label}
            </button>
          ))}
        </div>

        {/* ── Form 16 Tab ── */}
        {activeTab === 'form16' && (
          <div className="space-y-4">
            {/* Filters + actions */}
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Financial Year</label>
                <select value={fyYear} onChange={e => setFyYear(+e.target.value)}
                  className="h-9 border border-slate-200 rounded-xl px-3 text-sm focus:outline-none focus:border-indigo-400">
                  {fyOptions().map(y => <option key={y} value={y}>FY {y-1}–{String(y).slice(-2)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Project</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)}
                  className="h-9 border border-slate-200 rounded-xl px-3 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">All Projects</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {rows.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-4">
                  <CheckCircle2 size={13} className="text-emerald-500"/>
                  {rows.length} employee{rows.length !== 1 ? 's' : ''}
                </div>
              )}
              {rows.length > 0 && (
                <button onClick={handleDownloadBulkForm16} disabled={!!downloading}
                  className="ml-auto h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-2">
                  {downloading === 'bulk' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Download All (PDF)
                </button>
              )}
            </div>

            {/* States */}
            {isLoading && <div className="py-16 text-center text-slate-400 text-sm">Loading Form 16 data…</div>}
            {isError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm">
                <AlertCircle size={16}/>{error?.response?.data?.error || error?.message || 'Failed to load data'}
              </div>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
                <IndianRupee size={40} className="text-slate-200 mx-auto mb-3"/>
                <p className="text-slate-500">No approved payroll for FY {fyYear-1}–{String(fyYear).slice(-2)}</p>
                <p className="text-xs text-slate-400 mt-1">Run and approve payroll for at least one employee first.</p>
              </div>
            )}

            {/* Employee rows */}
            {rows.map(r => (
              <Form16Row
                key={r.user_id}
                r={r}
                expanded={expandedId === r.user_id}
                onToggle={() => setExpandedId(expandedId === r.user_id ? null : r.user_id)}
                onDownloadPDF={handleDownloadOneForm16}
                downloading={downloading === r.user_id}
              />
            ))}

            {/* Totals */}
            {rows.length > 0 && (
              <div className="bg-white border-2 border-indigo-100 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                {[
                  ['Total Employees', rows.length,                                                     'text-slate-800'],
                  ['Total Gross',     fmt(rows.reduce((s,r) => s + +r.total_gross,   0)),              'text-blue-700' ],
                  ['Total TDS',       fmt(rows.reduce((s,r) => s + +r.total_tds,     0)),              'text-red-600'  ],
                  ['Total Net Pay',   fmt(rows.reduce((s,r) => s + +r.total_net_pay, 0)),              'text-emerald-700'],
                ].map(([label, val, cls]) => (
                  <div key={label}>
                    <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wide">{label}</div>
                    <div className={clsx('font-bold text-xl', cls)}>{val}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Bank Transfer Tab ── */}
        {activeTab === 'bank' && (
          <BankTransferSection company={company} logoBase64={logoBase64} projects={projects} />
        )}
      </div>
    </div>
  );
}
