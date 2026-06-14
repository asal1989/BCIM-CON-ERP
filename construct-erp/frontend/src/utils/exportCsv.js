// src/utils/exportCsv.js — minimal CSV/PDF export helpers
export function downloadCsv(filename, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(row => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Lazy-load jsPDF + autotable so it's only pulled into the bundle when used
export async function downloadPdf(filename, title, rows) {
  const { default: jsPDF } = await import('jspdf');
  await import('jspdf-autotable');
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.autoTable({
    head: [rows[0]],
    body: rows.slice(1),
    startY: 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 64, 175] },
  });
  doc.save(filename);
}
