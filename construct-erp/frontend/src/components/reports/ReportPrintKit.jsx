import React from 'react';

// Shared A4-portrait print template for HR Admin → Reports pages.
// Usage: wrap report content in <div id="report-print-root">, include
// <style>{REPORT_PRINT_CSS}</style> once, and place <ReportPrintHeader/>
// before the table and <ReportPrintSignature/> after it. Give the visible
// table className="report-print-table" so borders/header colors print.
export const REPORT_PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm 10mm; }
  html, body {
    margin:0 !important; padding:0 !important; background:#fff !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  nav, header, footer, aside, .no-print,
  .sidebar, .topbar, .app-header, .app-sidebar,
  [class*="sidebar"], [class*="Sidebar"], [class*="topbar"], [class*="Topbar"],
  [class*="navbar"], [class*="Navbar"] {
    display:none !important; width:0 !important; height:0 !important; overflow:hidden !important;
  }
  .print-only { display:block !important; }
  #report-print-root {
    display:block !important; position:static !important; overflow:visible !important;
    width:100% !important; margin:0 !important; padding:0 !important; background:#fff !important;
    font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color:#000;
  }
  .report-print-table {
    width:100% !important; border-collapse:collapse !important; font-size:8pt !important;
    table-layout:auto !important; page-break-inside:auto !important;
    box-shadow:none !important; border-radius:0 !important;
  }
  .report-print-table thead { display:table-header-group !important; }
  .report-print-table tfoot { display:table-footer-group !important; }
  .report-print-table tr { page-break-inside:avoid !important; page-break-after:auto !important; }
  .report-print-table th {
    background:#1B3A6B !important; color:#fff !important;
    padding:4px 5px !important; border:1px solid #1B3A6B !important;
    text-align:left !important; font-size:7.5pt !important; font-weight:700 !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  .report-print-table td {
    padding:3px 5px !important; border:1px solid #bbb !important;
    vertical-align:middle !important; font-size:8pt !important;
  }
  .report-print-table tr:nth-child(even) td {
    background:#F3F6FB !important;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;
  }
  .report-sig-section { page-break-inside:avoid !important; margin-top:24px !important; }
}
@media screen {
  .print-only { display:none !important; }
  #report-print-root { display:block; }
}
`;

// Landscape variant — for genuinely wide grid/pivot reports where portrait
// would make columns illegible (Timesheet, Manpower).
export const REPORT_PRINT_CSS_LANDSCAPE = REPORT_PRINT_CSS.replace(
  '@page { size: A4 portrait; margin: 12mm 10mm; }',
  '@page { size: A4 landscape; margin: 10mm 8mm; }'
);

// A3 landscape variant — for the widest day-grid reports (Monthly Attendance:
// 4 fixed columns + up to 31 days x In/Out = 66+ columns, which doesn't fit
// legibly on A4 landscape). Also tightens table font/padding a notch further
// since even A3 is fitting 60+ columns.
export const REPORT_PRINT_CSS_A3_LANDSCAPE = REPORT_PRINT_CSS
  .replace(
    '@page { size: A4 portrait; margin: 12mm 10mm; }',
    '@page { size: A3 landscape; margin: 10mm 8mm; }'
  )
  .replace(
    ".report-print-table {\n    width:100% !important; border-collapse:collapse !important; font-size:8pt !important;",
    ".report-print-table {\n    width:100% !important; border-collapse:collapse !important; font-size:7.5pt !important;"
  )
  .replace(
    "padding:4px 5px !important; border:1px solid #1B3A6B !important;\n    text-align:left !important; font-size:7.5pt !important; font-weight:700 !important;",
    "padding:3px 4px !important; border:1px solid #1B3A6B !important;\n    text-align:left !important; font-size:7pt !important; font-weight:700 !important;"
  )
  .replace(
    ".report-print-table td {\n    padding:3px 5px !important; border:1px solid #bbb !important;\n    vertical-align:middle !important; font-size:8pt !important;\n  }",
    ".report-print-table td {\n    padding:2px 4px !important; border:1px solid #bbb !important;\n    vertical-align:middle !important; font-size:7.5pt !important;\n  }"
  );

export function ReportPrintHeader({ companyName = 'BCIM', reportTitle, subtitle }) {
  return (
    <div className="print-only" style={{ borderBottom: '3px solid #1B3A6B', paddingBottom: 10, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src="/bcim-logo.png" alt="Company Logo"
          style={{ height: 52, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>
            {companyName}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1B3A6B', letterSpacing: 0.5, margin: '2px 0' }}>
            {reportTitle}
          </div>
          {subtitle && <div style={{ fontSize: 9, color: '#444' }}>{subtitle}</div>}
        </div>
        <div style={{ width: 52, flexShrink: 0 }} />
      </div>
    </div>
  );
}

const DEFAULT_SIGNATORIES = [
  { role: 'Prepared By',  name: 'HR Executive' },
  { role: 'Verified By',  name: 'HR Manager / Admin' },
  { role: 'Site Incharge', name: 'Project Manager' },
  { role: 'Approved By',  name: 'Management / Director' },
];

export function ReportPrintSignature({ companyName = 'BCIM', signatories = DEFAULT_SIGNATORIES }) {
  return (
    <div className="print-only report-sig-section" style={{ marginTop: 32, borderTop: '1px solid #ccc', paddingTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        {signatories.map(sig => (
          <div key={sig.role} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderBottom: '1.5px solid #333', marginBottom: 6, height: 36 }} />
            <div style={{ fontSize: 8.5, fontWeight: 700, color: '#1B3A6B' }}>{sig.role}</div>
            <div style={{ fontSize: 7.5, color: '#555', marginTop: 2 }}>{sig.name}</div>
            <div style={{ fontSize: 7.5, color: '#888', marginTop: 2 }}>Date: ____________</div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 7.5, color: '#888' }}>
        This is a system-generated report — {companyName} &nbsp;|&nbsp; Printed on: {new Date().toLocaleString('en-IN')}
      </div>
    </div>
  );
}
