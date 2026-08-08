// src/components/hr/id-card/idCardPdf.js
// jsPDF export for ID cards — manual mm-coordinate drawing, same convention
// as PayrollReportsPage's generateForm16PDF (no html2canvas dependency).
import jsPDF from 'jspdf';

const CARD_W = 85.6, CARD_H = 54; // CR80, mm

function drawCard(doc, x, y, employee, company) {
  doc.setFillColor(10, 31, 92);
  doc.roundedRect(x, y, CARD_W, 16, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text(company?.name || 'Company', x + 4, y + 10);

  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, y, CARD_W, CARD_H, 2, 2, 'S');

  try {
    if (employee.profile_photo_url?.startsWith('data:image')) {
      doc.addImage(employee.profile_photo_url, x + 4, y + 20, 16, 18);
    }
  } catch { /* skip photo if it fails to embed */ }

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(employee.name || '', x + 23, y + 25, { maxWidth: 40 });
  doc.setFontSize(7.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(employee.designation_name || employee.designation || '', x + 23, y + 30, { maxWidth: 38 });
  doc.text(employee.department_name || '', x + 23, y + 34, { maxWidth: 38 });
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(37, 99, 235);
  doc.text(`ID: ${employee.employee_code || ''}`, x + 23, y + 40);

  try {
    if (employee.qr_code_data?.startsWith('data:image')) {
      doc.addImage(employee.qr_code_data, x + CARD_W - 20, y + 20, 16, 16);
    }
  } catch { /* skip QR if it fails to embed */ }
}

export function downloadSingleCardPdf(employee, company) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [CARD_W + 10, CARD_H + 10] });
  drawCard(doc, 5, 5, employee, company);
  doc.save(`ID-Card-${employee.employee_code || employee.name}.pdf`);
}

export function downloadBulkCardsPdf(cards, company) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 10, marginY = 10, gapX = 8, gapY = 8;
  const perRow = 2, perCol = 4, perPage = perRow * perCol;
  cards.forEach((employee, i) => {
    const pos = i % perPage;
    if (i > 0 && pos === 0) doc.addPage();
    const col = pos % perRow, row = Math.floor(pos / perRow);
    const x = marginX + col * (CARD_W + gapX);
    const y = marginY + row * (CARD_H + gapY);
    drawCard(doc, x, y, employee, company);
  });
  doc.save(`ID-Cards-Bulk-${cards.length}.pdf`);
}
