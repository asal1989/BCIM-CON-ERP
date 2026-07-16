import{r as d,j as t}from"./vendor-react-C3P8e1DV.js";import{u as H}from"./vendor-data-693MZDSQ.js";import{aP as M,c as U}from"./index-CrTml0Fx.js";import{aP as w,R as V,D as $,bk as K,bl as Y}from"./vendor-icons-Cyo8p4BZ.js";import"./vendor-ui-BISbFNDL.js";import"./vendor-forms-gVMGBE4b.js";const q=()=>new Date().toISOString().slice(0,10),k=s=>new Date(s+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}),z={present:{bg:"#D1FAE5",color:"#065F46"},absent:{bg:"#FEE2E2",color:"#991B1B"},leave:{bg:"#FEF3C7",color:"#92400E"},half_day:{bg:"#DBEAFE",color:"#1E40AF"},holiday:{bg:"#EDE9FE",color:"#5B21B6"}},G={present:"P",absent:"A",leave:"L",half_day:"HD",holiday:"H"};function Q({status:s}){const p=(s||"absent").toLowerCase(),{bg:c,color:x}=z[p]||z.absent;return t.jsx("span",{style:{background:c,color:x,border:`1px solid ${x}33`,borderRadius:3,padding:"1px 7px",fontWeight:700,fontSize:10,letterSpacing:.5,display:"inline-block"},children:G[p]||p.toUpperCase()})}function X({name:s}){const p=(s||"?").split(" ").map(m=>m[0]).join("").slice(0,2).toUpperCase(),c=["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#84CC16"],x=(s||"").split("").reduce((m,b)=>m+b.charCodeAt(0),0)%c.length;return t.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:"50%",background:c[x],color:"#fff",fontSize:10,fontWeight:700,flexShrink:0},children:p})}const _={"EMP ID":"emp_id",Name:"name",Designation:"designation",Department:"department",Company:"company","P/A":"attendance_status","In Time":"in_time","Out Time":"out_time","Late\nMin":"late_minutes",Shift:"shift",Location:"location","Emp Status":"status",Reason:"reason"},J=`
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
`;function rt(){const[s,p]=d.useState(q()),[c,x]=d.useState("staff"),[m,b]=d.useState(""),[y,R]=d.useState([]),[l,T]=d.useState({total:0,present:0,half:0,absent:0,leave:0}),[h,L]=d.useState({companyName:"BCIM",projectName:"",projectCode:""}),[j,D]=d.useState(!1),[F,C]=d.useState(null),[g,N]=d.useState(null),[S,E]=d.useState("asc"),W=e=>{const i=_[e];i&&N(o=>o===i?(E(n=>n==="asc"?"desc":"asc"),i):(E("asc"),i))},v=g?[...y].sort((e,i)=>{let o=e[g]??"",n=i[g]??"";return g==="late_minutes"?(o=Number(o)||0,n=Number(n)||0):(o=String(o).toLowerCase(),n=String(n).toLowerCase()),o<n?S==="asc"?-1:1:o>n?S==="asc"?1:-1:0}):y,{data:A}=H({queryKey:["projects-active-ts"],queryFn:()=>U.list({is_active:!0}).then(e=>e.data)}),I=(A==null?void 0:A.data)||[],B=d.useCallback(async()=>{var e,i;D(!0),C(null);try{const n=(await M.timesheetReport({date:s,category:c,project_id:m||void 0})).data;R(n.data||[]),T(n.summary||{total:0,present:0,absent:0,leave:0}),L({companyName:n.companyName||"BCIM",projectName:n.projectName||"",projectCode:n.projectCode||""})}catch(o){C(((i=(e=o==null?void 0:o.response)==null?void 0:e.data)==null?void 0:i.error)||"Failed to load timesheet")}finally{D(!1)}},[s,c,m]);d.useEffect(()=>{B()},[B]);const P=()=>{const e=["S.No","EMP ID","Name","Designation","Department","Company","P/A","In Time","Out Time","Late Min","Hrs Worked","Overtime Hrs","Shift","Location","Emp Status","Reason"],i=v.map((a,f)=>[f+1,a.emp_id||"",a.name,a.designation,a.department,a.company,a.attendance_status,a.in_time||"",a.out_time||"",a.late_minutes||0,a.hours_worked||"",a.overtime_hours||"",a.shift,a.location,a.status,a.reason||""].map(u=>`"${String(u).replace(/"/g,'""')}"`).join(",")),o=new Blob([[e.join(","),...i].join(`
`)],{type:"text/csv"}),n=document.createElement("a");n.href=URL.createObjectURL(o),n.download=`timesheet_${s}.csv`,n.click(),URL.revokeObjectURL(n.href)},O=[{label:"Total Strength",val:l.total,accent:"#3B82F6",icon:"👥"},{label:"Present",val:l.present,accent:"#10B981",icon:"✅"},{label:"Half Day",val:l.half||0,accent:"#6366F1",icon:"⏰"},{label:"Absent",val:l.absent,accent:"#EF4444",icon:"❌"},{label:"On Leave",val:l.leave,accent:"#F59E0B",icon:"🏖"}];return t.jsxs("div",{style:{background:"#F8FAFC",minHeight:"100vh"},children:[t.jsx("style",{children:J}),t.jsxs("div",{className:"no-print",style:{background:"#fff",borderBottom:"0.5px solid #E5E7EB",padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12},children:[t.jsxs("div",{children:[t.jsxs("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:2},children:[t.jsx("span",{style:{fontSize:12,color:"#9CA3AF"},children:"HR Admin"}),t.jsx(w,{size:12,color:"#9CA3AF"}),t.jsx("span",{style:{fontSize:12,color:"#9CA3AF"},children:"Attendance"}),t.jsx(w,{size:12,color:"#9CA3AF"}),t.jsx("span",{style:{fontSize:12,color:"#1A56DB",fontWeight:600},children:"Daily Timesheet"})]}),t.jsx("h2",{style:{margin:0,fontSize:18,fontWeight:700,color:"#111827",letterSpacing:-.3},children:"Daily Timesheet Report"}),t.jsxs("p",{style:{margin:0,fontSize:12,color:"#6B7280",marginTop:2},children:["Attendance record for ",k(s)]})]}),t.jsxs("div",{style:{display:"flex",gap:8,flexShrink:0},children:[t.jsxs("button",{onClick:B,style:{display:"flex",alignItems:"center",gap:5,background:"#F9FAFB",color:"#374151",border:"0.5px solid #D1D5DB",borderRadius:7,padding:"6px 14px",fontSize:13,cursor:"pointer",fontWeight:500},children:[t.jsx(V,{size:13})," Refresh"]}),t.jsxs("button",{onClick:P,style:{display:"flex",alignItems:"center",gap:5,background:"#F0FDF4",color:"#15803D",border:"0.5px solid #86EFAC",borderRadius:7,padding:"6px 14px",fontSize:13,cursor:"pointer",fontWeight:500},children:[t.jsx($,{size:13})," Export CSV"]}),t.jsxs("button",{onClick:()=>window.print(),style:{display:"flex",alignItems:"center",gap:5,background:"#1A56DB",color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:13,cursor:"pointer",fontWeight:600},children:[t.jsx(K,{size:13})," Print / PDF"]})]})]}),t.jsxs("div",{className:"no-print",style:{background:"#fff",borderBottom:"0.5px solid #E5E7EB",padding:"10px 24px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"},children:[t.jsx(Y,{size:13,color:"#6B7280"}),t.jsx("span",{style:{fontSize:12,color:"#6B7280",fontWeight:500},children:"Filters:"}),t.jsx("input",{type:"date",value:s,onChange:e=>p(e.target.value),style:{border:"0.5px solid #D1D5DB",borderRadius:6,padding:"5px 10px",fontSize:13,color:"#374151",background:"#F9FAFB",outline:"none"}}),t.jsxs("select",{value:c,onChange:e=>x(e.target.value),style:{border:"0.5px solid #D1D5DB",borderRadius:6,padding:"5px 10px",fontSize:13,color:"#374151",background:"#F9FAFB",outline:"none"},children:[t.jsx("option",{value:"staff",children:"Staff Only"}),t.jsx("option",{value:"labour",children:"Labour / SC Workers"}),t.jsx("option",{value:"all",children:"All (Staff + Labour)"})]}),t.jsxs("select",{value:m,onChange:e=>b(e.target.value),style:{border:"0.5px solid #D1D5DB",borderRadius:6,padding:"5px 10px",fontSize:13,color:"#374151",background:"#F9FAFB",outline:"none",minWidth:180},children:[t.jsx("option",{value:"",children:"All Projects"}),t.jsx("option",{value:"HEAD_OFFICE",children:"Head Office"}),I.map(e=>t.jsxs("option",{value:e.id,children:[e.project_code?`[${e.project_code}] `:"",e.name]},e.id))]})]}),t.jsx("div",{className:"no-print",style:{padding:"16px 24px 0",display:"flex",gap:12,flexWrap:"wrap"},children:O.map(e=>t.jsxs("div",{style:{background:"#fff",border:"0.5px solid #E5E7EB",borderLeft:`3px solid ${e.accent}`,borderRadius:10,padding:"12px 20px",minWidth:130,display:"flex",flexDirection:"column",gap:4},children:[t.jsx("div",{style:{fontSize:11,color:"#6B7280",fontWeight:500},children:e.label}),t.jsx("div",{style:{fontSize:26,fontWeight:800,color:"#111827",lineHeight:1.1},children:j?t.jsx("span",{style:{fontSize:16,color:"#D1D5DB"},children:"—"}):e.val})]},e.label))}),t.jsxs("div",{id:"ts-print-root",style:{padding:"16px 24px 32px"},children:[t.jsx("div",{className:"print-only",style:{borderBottom:"3px solid #1B3A6B",paddingBottom:10,marginBottom:12},children:t.jsxs("div",{style:{display:"flex",alignItems:"center",gap:16},children:[t.jsx("img",{src:"/bcim-logo.png",alt:"BCIM Logo",style:{height:60,width:"auto",objectFit:"contain",flexShrink:0}}),t.jsxs("div",{style:{flex:1,textAlign:"center"},children:[t.jsx("div",{style:{fontSize:9,fontWeight:600,color:"#555",letterSpacing:2,textTransform:"uppercase"},children:h.companyName}),t.jsx("div",{style:{fontSize:16,fontWeight:800,color:"#1B3A6B",letterSpacing:.5,margin:"2px 0"},children:"DAILY ATTENDANCE / TIMESHEET REPORT"}),t.jsxs("div",{style:{fontSize:9,color:"#444"},children:[h.projectName?t.jsxs(t.Fragment,{children:["Project: ",t.jsx("strong",{children:h.projectName}),h.projectCode?` (${h.projectCode})`:""," | "]}):null,"Date: ",t.jsx("strong",{children:k(s)})," |  Category: ",t.jsx("strong",{children:c==="staff"?"STAFF ONLY":c==="labour"?"LABOUR / SC WORKERS":"ALL (STAFF + LABOUR)"})]})]}),t.jsx("table",{style:{border:"1px solid #1B3A6B",borderCollapse:"collapse",fontSize:8,flexShrink:0},children:t.jsx("tbody",{children:[["Total Strength",l.total],["Present (P)",l.present],["Half Day (HD)",l.half||0],["Absent (A)",l.absent],["On Leave (L)",l.leave]].map(([e,i])=>t.jsxs("tr",{children:[t.jsx("td",{style:{padding:"3px 8px",borderBottom:"1px solid #ccc",borderRight:"1px solid #ccc",fontWeight:600},children:e}),t.jsx("td",{style:{padding:"3px 10px",borderBottom:"1px solid #ccc",textAlign:"center",fontWeight:700,color:"#1B3A6B"},children:i})]},e))})})]})}),j&&t.jsx("div",{className:"no-print",style:{textAlign:"center",padding:48,color:"#6B7280"},children:"Loading..."}),F&&t.jsx("div",{style:{background:"#FEF2F2",border:"0.5px solid #FECACA",borderRadius:8,padding:16,color:"#B91C1C",marginBottom:16},children:F}),!j&&!F&&t.jsx("div",{className:"ts-table-wrap",style:{overflowX:"auto",marginTop:16},children:t.jsxs("table",{className:"print-table",style:{borderCollapse:"collapse",width:"100%",fontSize:12,background:"#fff",borderRadius:10,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"},children:[t.jsx("thead",{children:t.jsx("tr",{style:{background:"#F9FAFB",borderBottom:"1.5px solid #E5E7EB"},children:["S.No","EMP ID","Name","Designation","Department","Company","P/A","In Time","Out Time",`Late
Min`,"Hrs","OT","Shift","Location","Emp Status","Reason"].map(e=>{const i=_[e],o=g===i;return t.jsx("th",{onClick:()=>W(e),style:{padding:"9px 10px",whiteSpace:"pre",textAlign:"left",fontWeight:600,fontSize:11,color:o?"#1A56DB":"#6B7280",letterSpacing:.2,borderBottom:"none",background:o?"#EFF6FF":void 0,cursor:i?"pointer":"default",userSelect:"none"},children:t.jsxs("span",{style:{display:"flex",alignItems:"center",gap:4},children:[e,i&&t.jsx("span",{style:{opacity:o?1:.35,fontSize:9,lineHeight:1},children:o?S==="asc"?"▲":"▼":"⇅"})]})},e)})})}),t.jsx("tbody",{children:v.length===0?t.jsx("tr",{children:t.jsxs("td",{colSpan:16,style:{textAlign:"center",padding:48,color:"#9CA3AF",fontSize:13},children:["No records found for ",s]})}):v.map((e,i)=>{var o,n,a,f,u;return t.jsxs("tr",{style:{background:i%2===0?"#fff":"#FAFAFA",borderBottom:"0.5px solid #F3F4F6"},children:[t.jsx("td",{style:r,children:t.jsx("span",{style:{color:"#9CA3AF",fontSize:11},children:i+1})}),t.jsx("td",{style:{...r,fontWeight:600,color:"#1A56DB",fontSize:11},children:e.emp_id||"—"}),t.jsx("td",{style:{...r,whiteSpace:"nowrap"},children:t.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[t.jsx(X,{name:e.name}),t.jsxs("div",{children:[t.jsx("div",{style:{fontWeight:600,color:"#111827",fontSize:12},children:e.name}),e.company&&t.jsx("span",{style:{fontSize:9,fontWeight:700,letterSpacing:.3,background:(o=e.company)!=null&&o.toLowerCase().includes("bcim")?"#EFF6FF":"#FFF7ED",color:(n=e.company)!=null&&n.toLowerCase().includes("bcim")?"#1D4ED8":"#C2410C",borderRadius:3,padding:"0 5px",display:"inline-block"},children:(a=e.company)==null?void 0:a.toUpperCase()})]})]})}),t.jsx("td",{style:{...r,color:"#374151"},children:e.designation}),t.jsx("td",{style:{...r,color:"#374151"},children:e.department}),t.jsx("td",{style:r,children:t.jsx("span",{style:{fontSize:10,fontWeight:700,letterSpacing:.2,background:(f=e.company)!=null&&f.toLowerCase().includes("bcim")?"#EFF6FF":"#FFF7ED",color:(u=e.company)!=null&&u.toLowerCase().includes("bcim")?"#1D4ED8":"#C2410C",borderRadius:3,padding:"1px 6px",display:"inline-block"},children:e.company})}),t.jsx("td",{style:{...r,textAlign:"center"},children:t.jsx(Q,{status:e.attendance_status})}),t.jsx("td",{style:{...r,color:"#374151",fontVariantNumeric:"tabular-nums"},children:e.in_time||"—"}),t.jsx("td",{style:{...r,color:"#374151",fontVariantNumeric:"tabular-nums"},children:e.out_time||"—"}),t.jsx("td",{style:{...r,textAlign:"center",fontVariantNumeric:"tabular-nums"},children:e.late_minutes>0?t.jsxs("span",{style:{color:"#DC2626",fontWeight:700},children:[e.late_minutes,"m"]}):t.jsx("span",{style:{color:"#D1D5DB"},children:"—"})}),t.jsx("td",{style:{...r,textAlign:"center",color:"#475569",fontVariantNumeric:"tabular-nums"},children:e.hours_worked>0?e.hours_worked:t.jsx("span",{style:{color:"#D1D5DB"},children:"—"})}),t.jsx("td",{style:{...r,textAlign:"center"},children:e.overtime_hours>0?t.jsxs("span",{style:{background:"#FEF3C7",color:"#92400E",borderRadius:3,padding:"1px 6px",fontSize:10,fontWeight:700},children:["+",e.overtime_hours,"h"]}):t.jsx("span",{style:{color:"#D1D5DB"},children:"—"})}),t.jsx("td",{style:{...r,color:"#374151"},children:e.shift}),t.jsx("td",{style:{...r,color:"#374151"},children:e.location}),t.jsx("td",{style:r,children:t.jsx("span",{style:{fontSize:10,fontWeight:700,color:e.status==="ACTIVE"?"#15803D":"#B91C1C",background:e.status==="ACTIVE"?"#F0FDF4":"#FEF2F2",borderRadius:3,padding:"1px 6px",display:"inline-block"},children:e.status})}),t.jsx("td",{style:{...r,color:"#6B7280",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:e.reason||t.jsx("span",{style:{color:"#D1D5DB"},children:"—"})})]},e.user_id||i)})}),y.length>0&&t.jsx("tfoot",{children:t.jsxs("tr",{style:{background:"#F0F7FF",borderTop:"1.5px solid #BFDBFE"},children:[t.jsx("td",{colSpan:6,style:{...r,textAlign:"right",color:"#1E40AF",fontWeight:700,fontSize:12},children:"Grand Total"}),t.jsxs("td",{style:{...r,textAlign:"center"},children:[t.jsxs("span",{style:{color:"#15803D",fontWeight:800},children:[l.present,"P"]})," / ",t.jsxs("span",{style:{color:"#B91C1C",fontWeight:800},children:[l.absent,"A"]})]}),t.jsx("td",{colSpan:9,style:r})]})})]})}),t.jsxs("div",{className:"print-only sig-section",style:{marginTop:40,borderTop:"1px solid #ccc",paddingTop:16},children:[t.jsx("div",{style:{display:"flex",justifyContent:"space-between",gap:20},children:[{role:"Prepared By",name:"HR Executive"},{role:"Verified By",name:"HR Manager / Admin"},{role:"Site Incharge",name:"Project Manager"},{role:"Approved By",name:"Management / Director"}].map(e=>t.jsxs("div",{style:{flex:1,textAlign:"center"},children:[t.jsx("div",{style:{borderBottom:"1.5px solid #333",marginBottom:6,height:40}}),t.jsx("div",{style:{fontSize:9,fontWeight:700,color:"#1B3A6B"},children:e.role}),t.jsx("div",{style:{fontSize:8,color:"#555",marginTop:2},children:e.name}),t.jsx("div",{style:{fontSize:8,color:"#888",marginTop:2},children:"Date: ____________"})]},e.role))}),t.jsxs("div",{style:{textAlign:"center",marginTop:12,fontSize:8,color:"#888"},children:["This is a system-generated report - ",h.companyName," | Printed on: ",new Date().toLocaleString("en-IN")]})]})]})]})}const r={padding:"8px 10px",borderBottom:"0.5px solid #F3F4F6",color:"#111827",fontSize:12,verticalAlign:"middle"};export{rt as default};
