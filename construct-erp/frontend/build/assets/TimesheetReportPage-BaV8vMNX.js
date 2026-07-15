import{r as l,j as t}from"./vendor-react-C3P8e1DV.js";import{u as I}from"./vendor-data-693MZDSQ.js";import{aO as O,c as H}from"./index-D_MZdTEz.js";import{bl as M,R as U,D as $,bk as K}from"./vendor-icons-CG0p88Pq.js";import"./vendor-ui-BISbFNDL.js";import"./vendor-forms-gVMGBE4b.js";const V=()=>new Date().toISOString().slice(0,10),E=d=>new Date(d+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}),C={present:{bg:"#D1FAE5",color:"#065F46"},absent:{bg:"#FEE2E2",color:"#991B1B"},leave:{bg:"#FEF3C7",color:"#92400E"},half_day:{bg:"#DBEAFE",color:"#1E40AF"},holiday:{bg:"#EDE9FE",color:"#5B21B6"}},Y={present:"P",absent:"A",leave:"L",half_day:"HD",holiday:"H"};function q({status:d}){const m=(d||"absent").toLowerCase(),{bg:p,color:g}=C[m]||C.absent;return t.jsx("span",{style:{background:p,color:g,border:`1px solid ${g}33`,borderRadius:3,padding:"1px 7px",fontWeight:700,fontSize:10,letterSpacing:.5,display:"inline-block"},children:Y[m]||m.toUpperCase()})}const w={"EMP ID":"emp_id",Name:"name",Designation:"designation",Department:"department",Company:"company","P/A":"attendance_status","In Time":"in_time","Out Time":"out_time","Late\nMin":"late_minutes",Shift:"shift",Location:"location","Emp Status":"status",Reason:"reason"},G=`
@media print {
  @page { size: A3 landscape; margin: 8mm 10mm; }
  html, body {
    margin:0 !important; padding:0 !important;
    background:#fff !important;
    overflow:visible !important;
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
  /* Hide everything except print root */
  nav, header, footer, aside,
  .no-print,
  .sidebar, .topbar, .app-header, .app-sidebar,
  [class*="sidebar"], [class*="Sidebar"],
  [class*="topbar"], [class*="Topbar"],
  [class*="navbar"], [class*="Navbar"] {
    display:none !important;
    width:0 !important; height:0 !important;
    overflow:hidden !important;
  }
  .print-only { display:block !important; }

  /* Make all ancestors of print root visible and static */
  #ts-print-root,
  #ts-print-root * {
    visibility:visible !important;
  }
  #ts-print-root {
    display:block !important;
    position:static !important;
    overflow:visible !important;
    width:100% !important;
    margin:0 !important; padding:4px !important;
    background:#fff !important;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt;
    color: #000;
  }
  /* Ensure parent containers don't clip */
  #ts-print-root .ts-table-wrap,
  #ts-print-root .ts-table-wrap > * {
    overflow:visible !important;
    width:100% !important;
    position:static !important;
    max-height:none !important;
    height:auto !important;
  }
  .print-table {
    width:100% !important;
    border-collapse:collapse !important;
    font-size: 7.5pt !important;
    table-layout:auto !important;
    page-break-inside:auto !important;
    box-shadow:none !important;
    border-radius:0 !important;
  }
  .print-table thead {
    display:table-header-group !important;
  }
  .print-table tfoot {
    display:table-footer-group !important;
  }
  .print-table tbody {
    display:table-row-group !important;
  }
  .print-table tr {
    page-break-inside:avoid !important;
    page-break-after:auto !important;
  }
  .print-table th {
    background:#1B3A6B !important; color:#fff !important;
    padding:4px 4px !important; border:1px solid #1B3A6B !important;
    text-align:left !important; font-size:7pt !important; font-weight:700 !important;
    white-space:nowrap !important;
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
  .print-table td {
    padding:3px 4px !important;
    border:1px solid #bbb !important;
    vertical-align:middle !important;
    font-size:7.5pt !important;
    white-space:nowrap !important;
  }
  .print-table tr:nth-child(even) td {
    background:#F0F4FF !important;
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
  .sig-section {
    page-break-inside:avoid !important;
    margin-top:16px !important;
  }
  /* Shrink pills for print */
  .print-table span {
    font-size:7pt !important;
    padding:0px 4px !important;
  }
}
@media screen {
  .print-only { display:none !important; }
  #ts-print-root { display:block; }
}
`;function ot(){const[d,m]=l.useState(V()),[p,g]=l.useState("staff"),[h,D]=l.useState(""),[b,_]=l.useState([]),[s,k]=l.useState({total:0,present:0,half:0,absent:0,leave:0}),[c,R]=l.useState({companyName:"BCIM",projectName:"",projectCode:""}),[S,F]=l.useState(!1),[f,A]=l.useState(null),[x,z]=l.useState(null),[u,B]=l.useState("asc"),T=e=>{const o=w[e];o&&z(n=>n===o?(B(r=>r==="asc"?"desc":"asc"),o):(B("asc"),o))},y=x?[...b].sort((e,o)=>{let n=e[x]??"",r=o[x]??"";return x==="late_minutes"?(n=Number(n)||0,r=Number(r)||0):(n=String(n).toLowerCase(),r=String(r).toLowerCase()),n<r?u==="asc"?-1:1:n>r?u==="asc"?1:-1:0}):b,{data:j}=I({queryKey:["projects-active-ts"],queryFn:()=>H.list({is_active:!0}).then(e=>e.data)}),L=(j==null?void 0:j.data)||[],v=l.useCallback(async()=>{var e,o;F(!0),A(null);try{const r=(await O.timesheetReport({date:d,category:p,project_id:h||void 0})).data;_(r.data||[]),k(r.summary||{total:0,present:0,absent:0,leave:0}),R({companyName:r.companyName||"BCIM",projectName:r.projectName||"",projectCode:r.projectCode||""})}catch(n){A(((o=(e=n==null?void 0:n.response)==null?void 0:e.data)==null?void 0:o.error)||"Failed to load timesheet")}finally{F(!1)}},[d,p,h]);l.useEffect(()=>{v()},[v]);const N=()=>{const e=["S.No","EMP ID","Name","Designation","Department","Company","P/A","In Time","Out Time","Late Min","Hrs Worked","Overtime Hrs","Shift","Location","Emp Status","Reason"],o=y.map((a,W)=>[W+1,a.emp_id||"",a.name,a.designation,a.department,a.company,a.attendance_status,a.in_time||"",a.out_time||"",a.late_minutes||0,a.hours_worked||"",a.overtime_hours||"",a.shift,a.location,a.status,a.reason||""].map(P=>`"${String(P).replace(/"/g,'""')}"`).join(",")),n=new Blob([[e.join(","),...o].join(`
`)],{type:"text/csv"}),r=document.createElement("a");r.href=URL.createObjectURL(n),r.download=`timesheet_${d}.csv`,r.click(),URL.revokeObjectURL(r.href)};return t.jsxs("div",{style:{background:"#F8FAFC",minHeight:"100vh"},children:[t.jsx("style",{children:G}),t.jsxs("div",{className:"no-print",style:{background:"#fff",borderBottom:"1px solid #E5E7EB",padding:"12px 24px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"},children:[t.jsxs("div",{style:{flex:1},children:[t.jsx("h2",{style:{margin:0,fontSize:17,fontWeight:700,color:"#111827"},children:"Daily Timesheet Report"}),t.jsxs("p",{style:{margin:0,fontSize:12,color:"#6B7280"},children:["Attendance record for ",E(d)]})]}),t.jsx(M,{size:14,color:"#6B7280"}),t.jsx("input",{type:"date",value:d,onChange:e=>m(e.target.value),style:{border:"1px solid #D1D5DB",borderRadius:6,padding:"5px 10px",fontSize:13}}),t.jsxs("select",{value:p,onChange:e=>g(e.target.value),style:{border:"1px solid #D1D5DB",borderRadius:6,padding:"5px 10px",fontSize:13},children:[t.jsx("option",{value:"staff",children:"Staff Only"}),t.jsx("option",{value:"labour",children:"Labour / SC Workers"}),t.jsx("option",{value:"all",children:"All (Staff + Labour)"})]}),t.jsxs("select",{value:h,onChange:e=>D(e.target.value),style:{border:"1px solid #D1D5DB",borderRadius:6,padding:"5px 10px",fontSize:13,minWidth:160},children:[t.jsx("option",{value:"",children:"All Projects"}),L.map(e=>t.jsxs("option",{value:e.id,children:[e.project_code?`[${e.project_code}] `:"",e.name]},e.id))]}),t.jsxs("button",{onClick:v,style:{display:"flex",alignItems:"center",gap:5,background:"#2563EB",color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontSize:13,cursor:"pointer",fontWeight:600},children:[t.jsx(U,{size:13})," Refresh"]}),t.jsxs("button",{onClick:N,style:{display:"flex",alignItems:"center",gap:5,background:"#F0FDF4",color:"#15803D",border:"1px solid #86EFAC",borderRadius:6,padding:"6px 14px",fontSize:13,cursor:"pointer",fontWeight:600},children:[t.jsx($,{size:13})," Export CSV"]}),t.jsxs("button",{onClick:()=>window.print(),style:{display:"flex",alignItems:"center",gap:5,background:"#F5F3FF",color:"#7C3AED",border:"1px solid #C4B5FD",borderRadius:6,padding:"6px 14px",fontSize:13,cursor:"pointer",fontWeight:600},children:[t.jsx(K,{size:13})," Print / PDF"]})]}),t.jsx("div",{className:"no-print",style:{padding:"16px 24px 0",display:"flex",gap:12,flexWrap:"wrap"},children:[{label:"Total",val:s.total,bg:"#F0F9FF",border:"#BAE6FD",text:"#0369A1"},{label:"Present",val:s.present,bg:"#F0FDF4",border:"#86EFAC",text:"#15803D"},{label:"Half Day",val:s.half||0,bg:"#EFF6FF",border:"#BFDBFE",text:"#1D4ED8"},{label:"Absent",val:s.absent,bg:"#FEF2F2",border:"#FECACA",text:"#B91C1C"},{label:"On Leave",val:s.leave,bg:"#FFFBEB",border:"#FDE68A",text:"#B45309"}].map(e=>t.jsxs("div",{style:{background:e.bg,border:`1px solid ${e.border}`,borderRadius:8,padding:"10px 20px",minWidth:110,textAlign:"center"},children:[t.jsx("div",{style:{fontSize:24,fontWeight:800,color:e.text},children:e.val}),t.jsx("div",{style:{fontSize:11,color:e.text,fontWeight:600,marginTop:2},children:e.label})]},e.label))}),t.jsxs("div",{id:"ts-print-root",style:{padding:"16px 24px 32px"},children:[t.jsx("div",{className:"print-only",style:{borderBottom:"3px solid #1B3A6B",paddingBottom:10,marginBottom:12},children:t.jsxs("div",{style:{display:"flex",alignItems:"center",gap:16},children:[t.jsx("img",{src:"/bcim-logo.png",alt:"BCIM Logo",style:{height:60,width:"auto",objectFit:"contain",flexShrink:0}}),t.jsxs("div",{style:{flex:1,textAlign:"center"},children:[t.jsx("div",{style:{fontSize:9,fontWeight:600,color:"#555",letterSpacing:2,textTransform:"uppercase"},children:c.companyName}),t.jsx("div",{style:{fontSize:16,fontWeight:800,color:"#1B3A6B",letterSpacing:.5,margin:"2px 0"},children:"DAILY ATTENDANCE / TIMESHEET REPORT"}),t.jsxs("div",{style:{fontSize:9,color:"#444"},children:[c.projectName?t.jsxs(t.Fragment,{children:["Project: ",t.jsx("strong",{children:c.projectName}),c.projectCode?` (${c.projectCode})`:""," | "]}):null,"Date: ",t.jsx("strong",{children:E(d)})," |  Category: ",t.jsx("strong",{children:p==="staff"?"STAFF ONLY":p==="labour"?"LABOUR / SC WORKERS":"ALL (STAFF + LABOUR)"})]})]}),t.jsx("table",{style:{border:"1px solid #1B3A6B",borderCollapse:"collapse",fontSize:8,flexShrink:0},children:t.jsx("tbody",{children:[["Total Strength",s.total],["Present (P)",s.present],["Half Day (HD)",s.half||0],["Absent (A)",s.absent],["On Leave (L)",s.leave]].map(([e,o])=>t.jsxs("tr",{children:[t.jsx("td",{style:{padding:"3px 8px",borderBottom:"1px solid #ccc",borderRight:"1px solid #ccc",fontWeight:600},children:e}),t.jsx("td",{style:{padding:"3px 10px",borderBottom:"1px solid #ccc",textAlign:"center",fontWeight:700,color:"#1B3A6B"},children:o})]},e))})})]})}),S&&t.jsx("div",{className:"no-print",style:{textAlign:"center",padding:48,color:"#6B7280"},children:"Loading..."}),f&&t.jsx("div",{style:{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:16,color:"#B91C1C",marginBottom:16},children:f}),!S&&!f&&t.jsx("div",{className:"ts-table-wrap",style:{overflowX:"auto"},children:t.jsxs("table",{className:"print-table",style:{borderCollapse:"collapse",width:"100%",fontSize:12,background:"#fff",borderRadius:8,boxShadow:"0 1px 6px rgba(0,0,0,0.07)"},children:[t.jsx("thead",{children:t.jsx("tr",{style:{background:"#1B3A6B",color:"#fff"},children:["S.No","EMP ID","Name","Designation","Department","Company","P/A","In Time","Out Time",`Late
Min`,"Hrs","OT","Shift","Location","Emp Status","Reason"].map(e=>{const o=w[e],n=x===o;return t.jsx("th",{onClick:()=>T(e),style:{padding:"7px 8px",whiteSpace:"pre",textAlign:"left",fontWeight:700,fontSize:11,letterSpacing:.3,borderRight:"1px solid #2d527a",cursor:o?"pointer":"default",userSelect:"none",background:n?"#2d527a":void 0},children:t.jsxs("span",{style:{display:"flex",alignItems:"center",gap:4},children:[e,o&&t.jsx("span",{style:{opacity:n?1:.35,fontSize:9,lineHeight:1},children:n?u==="asc"?"▲":"▼":"⇅"})]})},e)})})}),t.jsx("tbody",{children:y.length===0?t.jsx("tr",{children:t.jsxs("td",{colSpan:16,style:{textAlign:"center",padding:40,color:"#6B7280",fontSize:13},children:["No records found for ",d]})}):y.map((e,o)=>t.jsxs("tr",{style:{background:o%2===0?"#fff":"#F8FAFC"},children:[t.jsx("td",{style:i,children:o+1}),t.jsx("td",{style:{...i,fontWeight:600,color:"#2563EB"},children:e.emp_id||"—"}),t.jsx("td",{style:{...i,fontWeight:600,whiteSpace:"nowrap"},children:e.name}),t.jsx("td",{style:i,children:e.designation}),t.jsx("td",{style:i,children:e.department}),t.jsx("td",{style:i,children:e.company}),t.jsx("td",{style:{...i,textAlign:"center"},children:t.jsx(q,{status:e.attendance_status})}),t.jsx("td",{style:i,children:e.in_time||"—"}),t.jsx("td",{style:i,children:e.out_time||"—"}),t.jsx("td",{style:{...i,textAlign:"center",color:e.late_minutes>0?"#DC2626":"#111"},children:e.late_minutes>0?e.late_minutes:"—"}),t.jsx("td",{style:{...i,textAlign:"center",color:"#475569"},children:e.hours_worked>0?e.hours_worked:"—"}),t.jsx("td",{style:{...i,textAlign:"center"},children:e.overtime_hours>0?t.jsxs("span",{style:{background:"#FEF3C7",color:"#92400E",borderRadius:3,padding:"1px 6px",fontSize:10,fontWeight:700},children:["+",e.overtime_hours,"h"]}):"—"}),t.jsx("td",{style:i,children:e.shift}),t.jsx("td",{style:i,children:e.location}),t.jsx("td",{style:i,children:t.jsx("span",{style:{fontSize:10,fontWeight:700,color:e.status==="ACTIVE"?"#15803D":"#B91C1C"},children:e.status})}),t.jsx("td",{style:{...i,color:"#6B7280",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:e.reason||"—"})]},e.user_id||o))}),b.length>0&&t.jsx("tfoot",{children:t.jsxs("tr",{style:{background:"#EFF6FF",fontWeight:700},children:[t.jsx("td",{colSpan:6,style:{...i,textAlign:"right",color:"#1E40AF",fontWeight:700},children:"Grand Total"}),t.jsxs("td",{style:{...i,textAlign:"center"},children:[t.jsxs("span",{style:{color:"#15803D",fontWeight:800},children:[s.present,"P"]})," / ",t.jsxs("span",{style:{color:"#B91C1C",fontWeight:800},children:[s.absent,"A"]})]}),t.jsx("td",{colSpan:9,style:i})]})})]})}),t.jsxs("div",{className:"print-only sig-section",style:{marginTop:40,borderTop:"1px solid #ccc",paddingTop:16},children:[t.jsx("div",{style:{display:"flex",justifyContent:"space-between",gap:20},children:[{role:"Prepared By",name:"HR Executive"},{role:"Verified By",name:"HR Manager / Admin"},{role:"Site Incharge",name:"Project Manager"},{role:"Approved By",name:"Management / Director"}].map(e=>t.jsxs("div",{style:{flex:1,textAlign:"center"},children:[t.jsx("div",{style:{borderBottom:"1.5px solid #333",marginBottom:6,height:40}}),t.jsx("div",{style:{fontSize:9,fontWeight:700,color:"#1B3A6B"},children:e.role}),t.jsx("div",{style:{fontSize:8,color:"#555",marginTop:2},children:e.name}),t.jsx("div",{style:{fontSize:8,color:"#888",marginTop:2},children:"Date: ____________"})]},e.role))}),t.jsxs("div",{style:{textAlign:"center",marginTop:12,fontSize:8,color:"#888"},children:["This is a system-generated report - ",c.companyName," | Printed on: ",new Date().toLocaleString("en-IN")]})]})]})]})}const i={padding:"6px 8px",borderBottom:"1px solid #E5E7EB",borderRight:"1px solid #F3F4F6",color:"#111827",fontSize:11,verticalAlign:"middle"};export{ot as default};
