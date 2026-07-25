import{j as t}from"./vendor-react-C3P8e1DV.js";const o=`
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
`,p=o.replace("@page { size: A4 portrait; margin: 12mm 10mm; }","@page { size: A4 landscape; margin: 10mm 8mm; }");function l({companyName:i="BCIM",reportTitle:e,subtitle:r}){return t.jsx("div",{className:"print-only",style:{borderBottom:"3px solid #1B3A6B",paddingBottom:10,marginBottom:14},children:t.jsxs("div",{style:{display:"flex",alignItems:"center",gap:16},children:[t.jsx("img",{src:"/bcim-logo.png",alt:"Company Logo",style:{height:52,width:"auto",objectFit:"contain",flexShrink:0}}),t.jsxs("div",{style:{flex:1,textAlign:"center"},children:[t.jsx("div",{style:{fontSize:9,fontWeight:600,color:"#555",letterSpacing:2,textTransform:"uppercase"},children:i}),t.jsx("div",{style:{fontSize:15,fontWeight:800,color:"#1B3A6B",letterSpacing:.5,margin:"2px 0"},children:e}),r&&t.jsx("div",{style:{fontSize:9,color:"#444"},children:r})]}),t.jsx("div",{style:{width:52,flexShrink:0}})]})})}const a=[{role:"Prepared By",name:"HR Executive"},{role:"Verified By",name:"HR Manager / Admin"},{role:"Site Incharge",name:"Project Manager"},{role:"Approved By",name:"Management / Director"}];function s({companyName:i="BCIM",signatories:e=a}){return t.jsxs("div",{className:"print-only report-sig-section",style:{marginTop:32,borderTop:"1px solid #ccc",paddingTop:14},children:[t.jsx("div",{style:{display:"flex",justifyContent:"space-between",gap:16},children:e.map(r=>t.jsxs("div",{style:{flex:1,textAlign:"center"},children:[t.jsx("div",{style:{borderBottom:"1.5px solid #333",marginBottom:6,height:36}}),t.jsx("div",{style:{fontSize:8.5,fontWeight:700,color:"#1B3A6B"},children:r.role}),t.jsx("div",{style:{fontSize:7.5,color:"#555",marginTop:2},children:r.name}),t.jsx("div",{style:{fontSize:7.5,color:"#888",marginTop:2},children:"Date: ____________"})]},r.role))}),t.jsxs("div",{style:{textAlign:"center",marginTop:10,fontSize:7.5,color:"#888"},children:["This is a system-generated report — ",i,"  |  Printed on: ",new Date().toLocaleString("en-IN")]})]})}export{s as R,p as a,l as b,o as c};
