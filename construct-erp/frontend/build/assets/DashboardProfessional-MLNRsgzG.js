const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PMDashboard-hSV4dyLv.js","assets/vendor-react-C3P8e1DV.js","assets/vendor-data-693MZDSQ.js","assets/index-D9eTSKm8.js","assets/vendor-ui-BISbFNDL.js","assets/vendor-icons-CLRO9G7v.js","assets/vendor-forms-gVMGBE4b.js","assets/index-xSlFwenk.css","assets/DashKPI-DDdqUGZr.js","assets/index-BZJb_SGm.js","assets/SiteEngineerDashboard-Vo9f1tSL.js","assets/QSDashboard-CftpxrWt.js","assets/AccountsDashboard-D-wxmi-U.js","assets/ProjectFilter-D7oDsLTr.js","assets/HRDashboard-DatdQcEg.js","assets/vendor-charts-Cwp-w7kO.js","assets/HSEDashboard-CI832Hu5.js","assets/StoresDashboard-B2s6rnq1.js","assets/ProcurementDashboard-DOEYzr8p.js","assets/ApprovalsPage-yK8E70XW.js"])))=>i.map(i=>d[i]);
import{u as jt,p as Me,_ as R,b as yt,c as vt,t as wt}from"./index-D9eTSKm8.js";import{u as kt,j as e,r as l,L as A}from"./vendor-react-C3P8e1DV.js";import{f as _t,u as H,g as Nt}from"./vendor-data-693MZDSQ.js";import{d as F,z as Ie}from"./vendor-ui-BISbFNDL.js";import{R as St,A as ie,a4 as ae,aO as ce,F as Ee,a_ as Ct,J as At,ae as Be,as as Rt,O as zt,Z as Dt,f as Tt,g as Pt,a$ as $e,o as Lt,ax as Mt,ab as It,b0 as Et,S as Bt,b1 as $t,b2 as Ot,az as Ft}from"./vendor-icons-CLRO9G7v.js";import{R as Oe,A as Vt,C as Wt,X as qt,Y as Yt,T as Fe,L as Kt,a as Ve,P as Ut,b as Ht,c as Gt}from"./vendor-charts-Cwp-w7kO.js";import{u as G,a as Q,b as Qt}from"./use-spring-CqOemPJs.js";import{m as Xt}from"./proxy-BFOfasLI.js";import"./vendor-forms-gVMGBE4b.js";const Jt=l.lazy(()=>R(()=>import("./PMDashboard-hSV4dyLv.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9]))),Zt=l.lazy(()=>R(()=>import("./SiteEngineerDashboard-Vo9f1tSL.js"),__vite__mapDeps([10,1,2,3,4,5,6,7,8]))),es=l.lazy(()=>R(()=>import("./QSDashboard-CftpxrWt.js"),__vite__mapDeps([11,1,2,3,4,5,6,7,8,9]))),ts=l.lazy(()=>R(()=>import("./AccountsDashboard-D-wxmi-U.js"),__vite__mapDeps([12,3,1,2,4,5,6,7,9,13]))),ss=l.lazy(()=>R(()=>import("./HRDashboard-DatdQcEg.js"),__vite__mapDeps([14,1,2,4,3,5,6,7,9,15]))),ns=l.lazy(()=>R(()=>import("./HSEDashboard-CI832Hu5.js"),__vite__mapDeps([16,1,2,3,4,5,6,7,8]))),rs=l.lazy(()=>R(()=>import("./StoresDashboard-B2s6rnq1.js"),__vite__mapDeps([17,1,2,3,4,5,6,7,9]))),os=l.lazy(()=>R(()=>import("./ProcurementDashboard-DOEYzr8p.js"),__vite__mapDeps([18,1,2,3,4,5,6,7,8,9]))),is=l.lazy(()=>R(()=>import("./ApprovalsPage-yK8E70XW.js"),__vite__mapDeps([19,1,2,3,4,5,6,7,9]))),as=["md","managing_director"],ls=["stephen@bcim.in"],cs=n=>{if(!n)return!1;const r=String(n.role||"").toLowerCase();return as.includes(r)||["admin","super_admin"].includes(r)||ls.includes((n.email||"").toLowerCase())},X=["#1e40af","#0e7490","#16a34a","#b45309","#b91c1c"],le=n=>`₹${(parseFloat(n)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`,y=n=>{const r=Math.abs(parseFloat(n)||0),a=(parseFloat(n)||0)<0?"-":"";return r>=1e7?`${a}₹${(r/1e7).toFixed(r>=1e8?1:2)} Cr`:r>=1e5?`${a}₹${(r/1e5).toFixed(r>=1e6?1:2)} L`:r>=1e3?`${a}₹${(r/1e3).toFixed(1)} K`:`${a}₹${r.toFixed(0)}`},ds=n=>(parseFloat(n)||0).toLocaleString("en-IN"),We=n=>{if(!n)return"—";const r=Math.max(0,(Date.now()-new Date(n).getTime())/1e3);return r<5?"just now":r<60?`${Math.floor(r)}s ago`:r<3600?`${Math.floor(r/60)} min ago`:r<86400?`${Math.floor(r/3600)} hr ago`:`${Math.floor(r/86400)} d ago`},ps=n=>{var r,a;return Array.isArray(n==null?void 0:n.data)?n.data:Array.isArray((r=n==null?void 0:n.data)==null?void 0:r.data)?(a=n.data)==null?void 0:a.data:[]},fs=n=>{if(!n)return"—";try{return new Date(n).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}catch{return"—"}},xs=n=>{if(n==="all")return{dateFrom:null,dateTo:null};const r=F(),d={"7d":6,"30d":29,"90d":89,"1y":364}[n]??29;return{dateFrom:r.subtract(d,"day").format("YYYY-MM-DD"),dateTo:r.format("YYYY-MM-DD")}};function qe(){return e.jsxs("div",{className:"prof-loader",children:[e.jsx("div",{className:"prof-spinner"}),e.jsx("span",{children:"Loading dashboard…"})]})}const Ye=({active:n,payload:r,label:a})=>!n||!(r!=null&&r.length)?null:e.jsxs("div",{className:"prof-tooltip",children:[a&&e.jsx("div",{className:"prof-tooltip-label",children:a}),r.map((d,v)=>e.jsxs("div",{className:"prof-tooltip-row",children:[e.jsx("span",{className:"prof-tooltip-dot",style:{background:d.color}}),e.jsx("span",{className:"prof-tooltip-name",children:d.name}),e.jsx("span",{className:"prof-tooltip-val",children:typeof d.value=="number"&&Math.abs(d.value)>=1e3?y(d.value):d.value})]},v))]}),J={active:{label:"Active",bg:"#f0fdf4",text:"#16a34a",border:"#bbf7d0",dot:"#16a34a"},delayed:{label:"Delayed",bg:"#fff1f2",text:"#e11d48",border:"#fecdd3",dot:"#e11d48"},planning:{label:"Planning",bg:"#eff6ff",text:"#2563eb",border:"#bfdbfe",dot:"#2563eb"},on_hold:{label:"On Hold",bg:"#fafafa",text:"#737373",border:"#e5e5e5",dot:"#a3a3a3"},completed:{label:"Completed",bg:"#f0fdf4",text:"#15803d",border:"#86efac",dot:"#15803d"}},Ke=["#4f46e5","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#db2777","#ea580c"],Ue=n=>Ke[(n||"").charCodeAt(0)%Ke.length],He=n=>(n||"?").split(" ").map(r=>r[0]).slice(0,2).join("").toUpperCase();function hs({projects:n,allCount:r,activeCount:a,planningCount:d,delayedCount:v,completedCount:T}){const[_,C]=l.useState(""),[g,N]=l.useState("all"),[m,z]=l.useState(!0),S=n.filter(s=>(s.status||"").toLowerCase()==="on_hold").length,P=[{key:"all",label:"All",count:r||n.length},{key:"active",label:"Active",count:a||0},{key:"planning",label:"Planning",count:d||0},{key:"delayed",label:"Delayed",count:v||0},{key:"on_hold",label:"On Hold",count:S},{key:"completed",label:"Completed",count:T||0}],w=n.filter(s=>{const p=(s.status||"").toLowerCase();return g!=="all"&&p!==g?!1:_?[s.name,s.project_code,s.city,s.type,s.pm_name].some(u=>(u||"").toLowerCase().includes(_.toLowerCase())):!0}),L=s=>s&&F(s).isValid()?F(s).format("DD MMM YYYY"):"—",D=s=>{const p=Number(s||0);return p>=1e7?`₹${(p/1e7).toFixed(2)} Cr`:p>=1e5?`₹${(p/1e5).toFixed(2)} L`:`₹${p.toLocaleString("en-IN")}`};return e.jsxs("div",{style:{marginBottom:24},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10},children:[e.jsxs("div",{children:[e.jsx("h2",{style:{fontSize:18,fontWeight:800,color:"#0f172a",margin:0,letterSpacing:"-0.01em"},children:"Projects"}),e.jsxs("p",{style:{fontSize:12,color:"#64748b",margin:"2px 0 0",fontWeight:500},children:[r||n.length," Projects"]})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[e.jsxs("div",{style:{position:"relative"},children:[e.jsx(Bt,{size:13,style:{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#94a3b8"}}),e.jsx("input",{value:_,onChange:s=>C(s.target.value),placeholder:"Search projects...",style:{height:34,border:"1px solid #e2e8f0",borderRadius:10,background:"#f8fafc",paddingLeft:28,paddingRight:12,fontSize:12,color:"#374151",outline:"none",width:190}})]}),e.jsx("button",{onClick:()=>z(!0),style:{width:34,height:34,borderRadius:8,border:`1px solid ${m?"#4f46e5":"#e2e8f0"}`,background:m?"#4f46e5":"#fff",color:m?"#fff":"#64748b",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx($t,{size:14})}),e.jsx("button",{onClick:()=>z(!1),style:{width:34,height:34,borderRadius:8,border:`1px solid ${m?"#e2e8f0":"#4f46e5"}`,background:m?"#fff":"#4f46e5",color:m?"#64748b":"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx(Ot,{size:14})})]})]}),e.jsx("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:16,flexWrap:"wrap"},children:P.map(s=>e.jsxs("button",{onClick:()=>N(s.key),style:{height:30,padding:"0 12px",borderRadius:999,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s",background:g===s.key?"#4f46e5":"#f1f5f9",color:g===s.key?"#fff":"#475569"},children:[s.label," ",e.jsx("span",{style:{opacity:.75},children:s.count})]},s.key))}),w.length===0?e.jsx("div",{style:{textAlign:"center",padding:"40px 0",color:"#94a3b8",fontSize:13},children:"No projects found"}):m?e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",gap:14},children:w.map(s=>{const p=(s.status||"active").toLowerCase(),u=J[p]||J.active,b=Math.max(0,Math.min(100,parseFloat(s.progress_pct||0))),i=b<30?"#ef4444":b<60?"#f59e0b":"#22c55e";return e.jsx(A,{to:`/projects/${s.id}`,style:{textDecoration:"none"},children:e.jsxs("div",{style:{background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,padding:"16px",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",transition:"box-shadow .15s, transform .15s",cursor:"pointer"},onMouseEnter:c=>{c.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.10)",c.currentTarget.style.transform="translateY(-1px)"},onMouseLeave:c=>{c.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.05)",c.currentTarget.style.transform="translateY(0)"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:10},children:[e.jsxs("div",{style:{minWidth:0},children:[e.jsx("div",{style:{fontSize:14,fontWeight:800,color:"#0f172a",lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180},children:s.name}),e.jsx("div",{style:{fontSize:11,color:"#94a3b8",fontWeight:500,marginTop:2},children:s.type||s.project_code||"—"})]}),e.jsxs("span",{style:{flexShrink:0,display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:999,fontSize:11,fontWeight:700,background:u.bg,color:u.text,border:`1px solid ${u.border}`},children:[e.jsx("span",{style:{width:5,height:5,borderRadius:"50%",background:u.dot,display:"inline-block"}}),u.label]})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12},children:[["CONTRACT VALUE",D(s.contract_value)],["SPENT",D(s.total_spent)]].map(([c,j])=>e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:9,fontWeight:700,color:"#94a3b8",letterSpacing:"0.1em",marginBottom:2},children:c}),e.jsx("div",{style:{fontSize:13,fontWeight:800,color:"#0f172a",fontVariantNumeric:"tabular-nums"},children:j})]},c))}),e.jsxs("div",{style:{marginBottom:12},children:[e.jsx("div",{style:{fontSize:9,fontWeight:700,color:"#94a3b8",letterSpacing:"0.1em",marginBottom:5},children:"PROGRESS"}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[e.jsx("div",{style:{flex:1,height:6,borderRadius:999,background:"#f1f5f9",overflow:"hidden"},children:e.jsx("div",{style:{width:`${b}%`,height:"100%",borderRadius:999,background:i,transition:"width .4s ease"}})}),e.jsxs("span",{style:{fontSize:12,fontWeight:800,color:"#374151",minWidth:30,textAlign:"right",fontVariantNumeric:"tabular-nums"},children:[b,"%"]})]})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12},children:[["START DATE",L(s.start_date)],["END DATE",L(s.end_date)]].map(([c,j])=>e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:9,fontWeight:700,color:"#94a3b8",letterSpacing:"0.1em",marginBottom:2},children:c}),e.jsx("div",{style:{fontSize:11,fontWeight:600,color:"#374151"},children:j})]},c))}),e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"1px solid #f1f5f9",paddingTop:10},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:7},children:[e.jsx("div",{style:{width:28,height:28,borderRadius:14,background:Ue(s.pm_name||s.name),color:"#fff",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},children:He(s.pm_name||s.name)}),e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:11,fontWeight:700,color:"#374151"},children:s.pm_name||"Unassigned"}),e.jsx("div",{style:{fontSize:10,color:"#94a3b8",fontWeight:500},children:"Project Manager"})]})]}),e.jsx("div",{style:{width:28,height:28,borderRadius:8,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"},children:e.jsx(Ft,{size:12})})]})]})},s.id)})}):e.jsx("div",{style:{background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,overflow:"hidden"},children:e.jsxs("table",{style:{width:"100%",borderCollapse:"collapse",fontSize:13},children:[e.jsx("thead",{children:e.jsx("tr",{style:{background:"#f8fafc",borderBottom:"1px solid #e2e8f0"},children:["Project","Type","Status","Contract Value","Spent","Progress","End Date","PM"].map(s=>e.jsx("th",{style:{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#94a3b8",textAlign:"left",whiteSpace:"nowrap"},children:s},s))})}),e.jsx("tbody",{children:w.map((s,p)=>{const u=(s.status||"active").toLowerCase(),b=J[u]||J.active,i=Math.max(0,Math.min(100,parseFloat(s.progress_pct||0))),c=i<30?"#ef4444":i<60?"#f59e0b":"#22c55e";return e.jsxs("tr",{style:{borderBottom:p<w.length-1?"1px solid #f1f5f9":"none"},children:[e.jsxs("td",{style:{padding:"12px 14px"},children:[e.jsx(A,{to:`/projects/${s.id}`,style:{fontWeight:700,color:"#0f172a",textDecoration:"none",fontSize:13},children:s.name}),s.project_code&&e.jsx("div",{style:{fontSize:10,color:"#94a3b8",marginTop:1},children:s.project_code})]}),e.jsx("td",{style:{padding:"12px 14px",fontSize:12,color:"#64748b"},children:s.type||"—"}),e.jsx("td",{style:{padding:"12px 14px"},children:e.jsx("span",{style:{padding:"3px 9px",borderRadius:999,fontSize:11,fontWeight:700,background:b.bg,color:b.text,border:`1px solid ${b.border}`},children:b.label})}),e.jsx("td",{style:{padding:"12px 14px",fontWeight:700,color:"#0f172a",fontVariantNumeric:"tabular-nums"},children:D(s.contract_value)}),e.jsx("td",{style:{padding:"12px 14px",fontVariantNumeric:"tabular-nums",color:"#374151"},children:D(s.total_spent)}),e.jsx("td",{style:{padding:"12px 14px",minWidth:120},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[e.jsx("div",{style:{flex:1,height:5,borderRadius:999,background:"#f1f5f9"},children:e.jsx("div",{style:{width:`${i}%`,height:"100%",borderRadius:999,background:c}})}),e.jsxs("span",{style:{fontSize:11,fontWeight:700,color:"#374151",minWidth:28,textAlign:"right"},children:[i,"%"]})]})}),e.jsx("td",{style:{padding:"12px 14px",fontSize:12,color:"#64748b"},children:L(s.end_date)}),e.jsx("td",{style:{padding:"12px 14px"},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:6},children:[e.jsx("div",{style:{width:24,height:24,borderRadius:12,background:Ue(s.pm_name||s.name),color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"},children:He(s.pm_name||s.name)}),e.jsx("span",{style:{fontSize:12,color:"#374151",fontWeight:500},children:s.pm_name||"—"})]})})]},s.id)})})]})})]})}const Ge={default:{c:"#0f172a",accent:"#475569",glow:"rgba(71,85,105,0.15)"},primary:{c:"#1e40af",accent:"#1e40af",glow:"rgba(30,64,175,0.18)"},success:{c:"#15803d",accent:"#15803d",glow:"rgba(21,128,61,0.18)"},warning:{c:"#b45309",accent:"#b45309",glow:"rgba(180,83,9,0.18)"},danger:{c:"#b91c1c",accent:"#b91c1c",glow:"rgba(185,28,28,0.18)"},neutral:{c:"#475569",accent:"#94a3b8",glow:"rgba(148,163,184,0.15)"}};function f({label:n,value:r,sub:a,tone:d="default",icon:v,to:T,isCurrency:_=!1,deltaPct:C,loading:g=!1}){const N=Ge[d]||Ge.default,m=l.useRef(null),z=G(0),S=G(0),P=G(0),w=G(8),L=Q(z,{stiffness:250,damping:22}),D=Q(S,{stiffness:250,damping:22}),s=Q(P,{stiffness:250,damping:22}),p=Q(w,{stiffness:250,damping:22}),u=c=>{const j=m.current;if(!j)return;const k=j.getBoundingClientRect(),M=(c.clientX-k.left)/k.width,E=(c.clientY-k.top)/k.height;z.set((E-.5)*-6),S.set((M-.5)*6),P.set((M-.5)*-10),w.set(14+(E-.5)*4)},b=()=>{z.set(0),S.set(0),P.set(0),w.set(8)},i=e.jsxs(Xt.div,{ref:m,onMouseMove:u,onMouseLeave:b,className:"prof-kpi-3d",style:{rotateX:L,rotateY:D,boxShadow:Qt([s,p],([c,j])=>`${c}px ${j}px 24px -8px ${N.glow}, 0 1px 2px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,23,42,0.04)`),transformStyle:"preserve-3d"},children:[e.jsx("div",{className:"prof-kpi-3d-highlight"}),e.jsx("div",{className:"prof-kpi-3d-accent",style:{background:`linear-gradient(90deg, ${N.accent}, ${N.accent}66)`}}),e.jsxs("div",{className:"prof-kpi",style:{transform:"translateZ(0)"},children:[e.jsxs("div",{className:"prof-kpi-head",children:[e.jsx("span",{className:"prof-kpi-label",children:n}),v&&e.jsx("div",{className:"prof-kpi-icon",style:{background:`${N.accent}15`,color:N.accent},children:e.jsx(v,{size:12,strokeWidth:2.2})})]}),g?e.jsx("div",{className:"prof-kpi-skeleton"}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"prof-kpi-value",style:{color:N.c},title:_&&typeof r=="number"?le(r):void 0,children:_&&typeof r=="number"?y(r):typeof r=="number"?ds(r):r}),(a||C!=null)&&e.jsxs("div",{className:"prof-kpi-sub",children:[C!=null&&e.jsxs("span",{className:`prof-delta ${C>=0?"up":"down"}`,children:[C>=0?e.jsx(It,{size:10}):e.jsx(Et,{size:10}),Math.abs(C).toFixed(1),"%"]}),a&&e.jsx("span",{children:a})]})]})]})]});return T?e.jsx(A,{to:T,className:"prof-kpi-link",children:i}):e.jsx("div",{className:"prof-kpi-link",children:i})}function V({kicker:n,title:r,count:a,action:d,to:v}){return e.jsxs("div",{className:"prof-section-header",children:[e.jsxs("div",{children:[e.jsx("div",{className:"prof-section-kicker",children:n}),e.jsxs("div",{className:"prof-section-title",children:[r,a!=null&&e.jsx("span",{className:"prof-section-count",children:a})]})]}),d&&v&&e.jsxs(A,{to:v,className:"prof-section-action",children:[d," ",e.jsx(ce,{size:13})]})]})}function I({title:n,action:r,to:a,children:d,className:v=""}){return e.jsxs("div",{className:`prof-panel ${v}`,children:[(n||r)&&e.jsxs("div",{className:"prof-panel-header",children:[n&&e.jsx("span",{className:"prof-panel-title",children:n}),r&&a&&e.jsxs(A,{to:a,className:"prof-panel-action",children:[r," ",e.jsx(ce,{size:11})]})]}),e.jsx("div",{className:"prof-panel-body",children:d})]})}function O({text:n}){return e.jsx("div",{className:"prof-empty",children:n})}function _s(){var _e,Ne,Se,Ce,Ae,Re,ze,De,Te,Pe,Le;const{user:n}=jt(),r=(n==null?void 0:n.role)||"",a=((n==null?void 0:n.department)||"").toLowerCase(),d=cs(n),v=kt(),T=_t();if(!["super_admin","admin"].includes(r)&&!d){let t=null;if(r==="project_manager"?t=Jt:r==="site_engineer"?t=Zt:r==="qs_engineer"?t=es:r==="accountant"?t=ts:["hr","hr_admin","hr_manager"].includes(r)?t=ss:r==="hse_officer"?t=ns:a.includes("store")?t=rs:(a.includes("procurement")||a.includes("purchase"))&&(t=os),t)return e.jsx(l.Suspense,{fallback:e.jsx(qe,{}),children:e.jsx(t,{})})}const[_,C]=l.useState(0),[g,N]=l.useState("all"),[m,z]=l.useState("30d"),[S,P]=l.useState("all"),[w,L]=l.useState(()=>new Date),[,D]=l.useState(0),s=l.useCallback(()=>{C(t=>t+1),L(new Date)},[]);l.useEffect(()=>{const t=setInterval(()=>D(o=>o+1),3e4);return()=>clearInterval(t)},[]),l.useEffect(()=>{const t=o=>{const $=o.target.tagName;$==="INPUT"||$==="SELECT"||$==="TEXTAREA"||(o.key==="r"||o.key==="R")&&(o.preventDefault(),s())};return window.addEventListener("keydown",t),()=>window.removeEventListener("keydown",t)},[s]);const p=l.useMemo(()=>xs(m),[m]),u=l.useMemo(()=>({project_id:g!=="all"?g:void 0,business_unit:S!=="all"?S:void 0,date_from:p.dateFrom||void 0,date_to:p.dateTo||void 0}),[g,S,p.dateFrom,p.dateTo]),b=l.useMemo(()=>({project_id:g!=="all"?g:void 0,from_date:p.dateFrom||void 0,to_date:p.dateTo||void 0,limit:500}),[g,p.dateFrom,p.dateTo]),{data:i,isLoading:c}=H({queryKey:["analytics-executive",_,u],queryFn:()=>yt.executive(u).then(t=>{var o;return((o=t.data)==null?void 0:o.data)||null}).catch(()=>null),staleTime:0,refetchOnMount:"always",refetchOnWindowFocus:!0}),{data:j=[]}=H({queryKey:["dashboard-projects-fallback"],queryFn:()=>vt.list().then(ps).catch(()=>[]),staleTime:5*60*1e3}),{data:k=[]}=H({queryKey:["dashboard-tqs-bills",_,b],queryFn:()=>wt.list(b).then(t=>{var o;return Array.isArray(t.data)?t.data:((o=t.data)==null?void 0:o.data)??[]}).catch(()=>[]),staleTime:60*1e3}),{data:M=[]}=H({queryKey:["md-pending-advances",_],queryFn:()=>Me.list({approval_status:"procurement_approved"}).then(t=>{var o;return((o=t.data)==null?void 0:o.data)??[]}),enabled:d,staleTime:0,refetchOnMount:"always"}),E=Nt({mutationFn:t=>Me.approveMD(t),onSuccess:()=>{Ie.success("Advance voucher authorized"),T.invalidateQueries({queryKey:["md-pending-advances"]}),T.invalidateQueries({queryKey:["procurement-advances"]})},onError:t=>{var o,$;return Ie.error((($=(o=t==null?void 0:t.response)==null?void 0:o.data)==null?void 0:$.message)||"Authorization failed")}}),W=((_e=i==null?void 0:i.filters)==null?void 0:_e.options)||{},de=(Ne=W.projects)!=null&&Ne.length?W.projects:j.map(t=>({id:t.id,name:t.name,project_code:t.project_code,type:t.type})),pe=(Se=W.business_units)!=null&&Se.length?W.business_units:[...new Set(j.map(t=>t.type).filter(Boolean))].sort(),h=(i==null?void 0:i.kpis)||{},fe=(i==null?void 0:i.charts)||{},B=(i==null?void 0:i.recent)||{},Qe=(i==null?void 0:i.watchlists)||{},x=(i==null?void 0:i.pulse)||{},xe=(i==null?void 0:i.exceptions)||[],Xe=Array.isArray(i==null?void 0:i.projects)?i.projects:[],he=Array.isArray(B.payments)?B.payments:[],me=Array.isArray(B.ra_bills)?B.ra_bills:[],Je=Array.isArray(B.documents)?B.documents:[],Ze=h.total_contract_value??0,q=h.total_certified??0,Z=h.total_collections??0,ee=h.receivables??q-Z,te=h.pending_ra_bills??0,ge=h.pending_ra_value??0,Y=q>0?Math.round(Z/q*100):0,se=fe.finance_trend||[],ne=h.active_projects??0,re=h.delayed_projects??0,et=h.completed_projects??0,tt=h.planning_projects??0,K=fe.project_status||[],ue=[...Qe.delayed_projects||[]].slice(0,6),st=h.low_stock_count??((Ce=x==null?void 0:x.procurement_stores)==null?void 0:Ce.low_stock_materials)??0,nt=((Ae=x==null?void 0:x.procurement_stores)==null?void 0:Ae.pos_requiring_attention)??0,rt=((Re=x==null?void 0:x.procurement_stores)==null?void 0:Re.total_pos)??0,ot=((ze=x==null?void 0:x.procurement_stores)==null?void 0:ze.pending_vendor_bills)??te,it=((De=x==null?void 0:x.procurement_stores)==null?void 0:De.pending_vendor_bill_value)??ge,at=((Te=x==null?void 0:x.procurement_stores)==null?void 0:Te.top_low_stock_material)||"—",U=h.safety_score,oe=h.open_incidents??0,lt=h.open_rfis??0,be=h.open_ncrs??0,je=h.expiring_permits??0,ct=((Pe=x==null?void 0:x.quality_safety)==null?void 0:Pe.permits_count)??je,dt=h.workforce_count??0,pt=h.documents_count??Je.length,ft=k.length,xt=k.reduce((t,o)=>t+parseFloat(o.total_amount||0),0),ye=k.reduce((t,o)=>t+parseFloat(o.certified_net||0),0),ve=k.reduce((t,o)=>t+parseFloat(o.paid_amount||0),0),ht=ye-ve,mt=k.filter(t=>t.workflow_status==="paid").length,gt=k.filter(t=>t.workflow_status!=="paid").length,we=[...k].sort((t,o)=>new Date(o.created_at||0)-new Date(t.created_at||0)).slice(0,5),ke=new Date().getHours(),ut=ke<12?"Good morning":ke<17?"Good afternoon":"Good evening",bt={all:"All time","7d":"Last 7 days","30d":"Last 30 days","90d":"Last 90 days","1y":"Last 1 year"}[m];return e.jsxs("div",{className:"prof-dashboard",children:[e.jsxs("header",{className:"prof-header",children:[e.jsxs("div",{className:"prof-header-inner",children:[e.jsxs("div",{className:"prof-brand",children:[e.jsx("div",{className:"prof-brand-mark",children:"BCIM"}),e.jsxs("div",{className:"prof-brand-text",children:[e.jsx("div",{className:"prof-brand-title",children:"Executive Dashboard"}),e.jsxs("div",{className:"prof-brand-sub",children:[ut,", ",((Le=n==null?void 0:n.name)==null?void 0:Le.split(" ")[0])||"Admin"," · ",F().format("dddd, D MMMM YYYY")]})]})]}),e.jsxs("div",{className:"prof-header-actions",children:[e.jsxs("div",{className:"prof-refresh-meta",children:[c&&e.jsx("span",{className:"prof-mini-spinner"}),e.jsxs("span",{title:w.toLocaleString("en-IN"),children:["Updated ",We(w)]})]}),e.jsxs("button",{onClick:s,className:"prof-refresh-btn",title:"Refresh (R)",children:[e.jsx(St,{size:13})," Refresh"]})]})]}),e.jsxs("div",{className:"prof-filter-strip",children:[e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Project"}),e.jsxs("select",{value:g,onChange:t=>N(t.target.value),children:[e.jsxs("option",{value:"all",children:["All Projects (",de.length,")"]}),de.map(t=>e.jsx("option",{value:t.id,children:t.project_code?`${t.name} (${t.project_code})`:t.name},t.id))]})]}),e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Date Range"}),e.jsxs("select",{value:m,onChange:t=>z(t.target.value),children:[e.jsx("option",{value:"all",children:"All Time"}),e.jsx("option",{value:"7d",children:"Last 7 Days"}),e.jsx("option",{value:"30d",children:"Last 30 Days"}),e.jsx("option",{value:"90d",children:"Last 90 Days"}),e.jsx("option",{value:"1y",children:"Last 1 Year"})]})]}),pe.length>0&&e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Business Unit"}),e.jsxs("select",{value:S,onChange:t=>P(t.target.value),children:[e.jsx("option",{value:"all",children:"All Units"}),pe.map(t=>e.jsx("option",{value:t,children:t},t))]})]}),e.jsx("div",{className:"prof-filter-spacer"}),e.jsxs("div",{className:"prof-filter-meta",children:["Showing data for: ",e.jsx("strong",{children:bt})]})]})]}),xe.length>0&&e.jsxs("div",{className:"prof-alerts",children:[e.jsx(ie,{size:13,color:"#b45309"}),e.jsx("span",{className:"prof-alerts-label",children:"Items needing attention:"}),e.jsx("div",{className:"prof-alerts-list",children:xe.slice(0,4).map(t=>e.jsxs(A,{to:t.to,className:"prof-alert-chip",style:{borderColor:`${t.tone}66`,color:t.tone},children:[t.label," ",e.jsx("strong",{style:{marginLeft:6},children:t.value})]},t.label))})]}),e.jsxs("main",{className:"prof-main",children:[d&&e.jsx("div",{style:{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"16px 18px",marginBottom:18,boxShadow:"0 1px 3px rgba(15,23,42,0.04)"},children:e.jsx(l.Suspense,{fallback:e.jsx(qe,{}),children:e.jsx(is,{embedded:!0,mdMode:!0})})}),d&&M.length>0&&e.jsxs("div",{style:{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"16px 18px",marginBottom:18,boxShadow:"0 1px 3px rgba(15,23,42,0.04)"},children:[e.jsxs("div",{className:"flex items-center justify-between mb-3",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-base font-bold text-slate-800 flex items-center gap-2",children:[e.jsx(ae,{className:"w-4 h-4 text-indigo-600"}),"Advance Vouchers — Awaiting Your Authorization"]}),e.jsxs("p",{className:"text-xs text-slate-500 mt-0.5",children:[M.length," voucher",M.length!==1?"s":""," approved by Procurement · pending your sign-off"]})]}),e.jsxs(A,{to:"/procurement/advances",className:"prof-panel-action",style:{fontSize:11},children:["View all ",e.jsx(ce,{size:11})]})]}),e.jsx("div",{className:"overflow-x-auto",children:e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Voucher #"}),e.jsx("th",{children:"Vendor"}),e.jsx("th",{children:"Project"}),e.jsx("th",{className:"num",children:"Advance Amount"}),e.jsx("th",{children:"Proc. Approved By"}),e.jsx("th",{children:"Created"}),e.jsx("th",{children:"Actions"})]})}),e.jsx("tbody",{children:M.map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"font-medium text-slate-800",children:t.sl_number||t.voucher_number||"—"}),e.jsx("td",{children:t.vendor_name}),e.jsx("td",{children:t.project_name||"—"}),e.jsx("td",{className:"num font-semibold text-slate-800",children:le(t.advance_value)}),e.jsx("td",{children:t.procurement_approved_by_name||"—"}),e.jsx("td",{children:fs(t.created_at)}),e.jsx("td",{children:e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("button",{onClick:()=>v(`/procurement/advances/${t.id}`),className:"flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",style:{background:"#f1f5f9",color:"#475569"},onMouseEnter:o=>o.currentTarget.style.background="#e2e8f0",onMouseLeave:o=>o.currentTarget.style.background="#f1f5f9",children:[e.jsx(Ee,{className:"w-3 h-3"})," Review"]}),e.jsxs("button",{onClick:()=>E.mutate(t.id),disabled:E.isPending,className:"flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50",style:{background:"#15803d"},onMouseEnter:o=>{E.isPending||(o.currentTarget.style.background="#166534")},onMouseLeave:o=>o.currentTarget.style.background="#15803d",children:[e.jsx(Ct,{className:"w-3 h-3"})," Authorize"]})]})})]},t.id))})]})})]}),e.jsxs("div",{className:"prof-kpi-strip",children:[e.jsx(f,{label:"Portfolio Value",value:Ze,isCurrency:!0,tone:"primary",icon:At,to:"/projects",sub:`${Xe.length} projects`,loading:c}),e.jsx(f,{label:"Certified Billing",value:q,isCurrency:!0,icon:Be,to:"/qs/ra-bills",sub:`${te} pending`,loading:c}),e.jsx(f,{label:"Collections",value:Z,isCurrency:!0,tone:"success",icon:ae,to:"/finance/payments",sub:`${Y}% of certified`,loading:c}),e.jsx(f,{label:"Receivables",value:ee,isCurrency:!0,tone:ee>0?"danger":"success",icon:Rt,to:"/finance/payments",sub:ee<0?"over-collected":"outstanding",loading:c}),e.jsx(f,{label:"Active Projects",value:ne,tone:"default",icon:zt,to:"/projects",sub:`${re} delayed`,loading:c}),e.jsx(f,{label:"Safety Score",value:U!=null?`${Math.round(U)}/100`:"N/A",tone:U!=null&&U<70?"warning":"success",icon:Dt,to:"/hse",sub:`${oe} incidents`,loading:c})]}),j.length>0&&e.jsx("section",{className:"prof-section",children:e.jsx(hs,{projects:j,allCount:j.length,activeCount:ne,planningCount:h.planning_projects??0,delayedCount:re,completedCount:h.completed_projects??0})}),e.jsxs("section",{className:"prof-section",children:[e.jsx(V,{kicker:"Department 01",title:"Finance & Quantity Survey",action:"Open Finance",to:"/finance"}),e.jsxs("div",{className:"prof-section-grid prof-grid-2-1",children:[e.jsx(I,{title:"Billing vs Collections trend",action:"View report",to:"/finance/reports",children:se.length===0||se.every(t=>!t.billed&&!t.collected)?e.jsx(O,{text:"No billing or collection data for the selected range"}):e.jsx(Oe,{width:"100%",height:220,children:e.jsxs(Vt,{data:se,margin:{top:8,right:14,left:0,bottom:0},children:[e.jsxs("defs",{children:[e.jsxs("linearGradient",{id:"profBill",x1:"0",y1:"0",x2:"0",y2:"1",children:[e.jsx("stop",{offset:"5%",stopColor:"#1e40af",stopOpacity:.3}),e.jsx("stop",{offset:"95%",stopColor:"#1e40af",stopOpacity:0})]}),e.jsxs("linearGradient",{id:"profCollect",x1:"0",y1:"0",x2:"0",y2:"1",children:[e.jsx("stop",{offset:"5%",stopColor:"#15803d",stopOpacity:.3}),e.jsx("stop",{offset:"95%",stopColor:"#15803d",stopOpacity:0})]})]}),e.jsx(Wt,{stroke:"#e2e8f0",strokeDasharray:"3 3",vertical:!1}),e.jsx(qt,{dataKey:"month",tick:{fill:"#64748b",fontSize:10},axisLine:{stroke:"#cbd5e1"},tickLine:!1}),e.jsx(Yt,{tick:{fill:"#64748b",fontSize:10},axisLine:!1,tickLine:!1,tickFormatter:t=>y(t).replace("₹","")}),e.jsx(Fe,{content:e.jsx(Ye,{})}),e.jsx(Kt,{wrapperStyle:{fontSize:11,color:"#475569"},iconType:"square"}),e.jsx(Ve,{type:"monotone",dataKey:"billed",stroke:"#1e40af",strokeWidth:2,fill:"url(#profBill)",name:"Billed"}),e.jsx(Ve,{type:"monotone",dataKey:"collected",stroke:"#15803d",strokeWidth:2,fill:"url(#profCollect)",name:"Collected"})]})})}),e.jsx(I,{title:"Financial summary",children:e.jsx("table",{className:"prof-table prof-table-stat",children:e.jsxs("tbody",{children:[e.jsxs("tr",{children:[e.jsx("td",{children:"Pending RA Bills"}),e.jsx("td",{className:"num",children:te})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"Pending RA Value"}),e.jsx("td",{className:"num",children:y(ge)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"Collection rate"}),e.jsx("td",{className:"num",children:e.jsxs("strong",{style:{color:Y>=70?"#15803d":Y>=50?"#b45309":"#b91c1c"},children:[Y,"%"]})})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Invoice value"}),e.jsx("td",{className:"num",children:y(xt)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Certified"}),e.jsx("td",{className:"num",children:y(ye)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Paid"}),e.jsx("td",{className:"num",children:y(ve)})]}),e.jsxs("tr",{className:"highlight",children:[e.jsx("td",{children:"DQS Balance to pay"}),e.jsx("td",{className:"num",children:e.jsx("strong",{style:{color:"#b91c1c"},children:y(ht)})})]})]})})})]}),e.jsx(I,{title:`Recent DQS Vendor Bills (${ft} total · ${mt} paid · ${gt} pending)`,action:"Open DQS",to:"/tqs/bills",children:we.length===0?e.jsx(O,{text:"No recent vendor bills"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Bill No."}),e.jsx("th",{children:"Vendor"}),e.jsx("th",{children:"Project"}),e.jsx("th",{className:"num",children:"Invoice"}),e.jsx("th",{className:"num",children:"Certified"}),e.jsx("th",{className:"num",children:"Paid"}),e.jsx("th",{children:"Status"})]})}),e.jsx("tbody",{children:we.map(t=>{var o;return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx(A,{to:`/tqs/bills/${t.id}`,className:"prof-link",children:t.sl_number||t.bill_number||((o=t.id)==null?void 0:o.slice(0,8))})}),e.jsx("td",{className:"truncate",children:t.vendor_name||"—"}),e.jsx("td",{className:"truncate",children:t.project_name||"—"}),e.jsx("td",{className:"num",children:y(t.total_amount)}),e.jsx("td",{className:"num",children:y(t.certified_net)}),e.jsx("td",{className:"num",children:y(t.paid_amount)}),e.jsx("td",{children:e.jsx("span",{className:`prof-status prof-status-${t.workflow_status||"pending"}`,children:t.workflow_status||"pending"})})]},t.id)})})]})})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(V,{kicker:"Department 02",title:"Projects & Planning",action:"All Projects",to:"/projects"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(f,{label:"Active",value:ne,tone:"primary"}),e.jsx(f,{label:"Delayed",value:re,tone:"danger"}),e.jsx(f,{label:"Planning",value:tt,tone:"neutral"}),e.jsx(f,{label:"Completed",value:et,tone:"success"})]}),e.jsxs("div",{className:"prof-section-grid prof-grid-1-2",children:[e.jsx(I,{title:"Project status breakdown",children:K.length===0?e.jsx(O,{text:"No project data"}):e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12},children:[e.jsx(Oe,{width:"50%",height:170,children:e.jsxs(Ut,{children:[e.jsx(Ht,{data:K,dataKey:"value",innerRadius:36,outerRadius:62,paddingAngle:2,children:K.map((t,o)=>e.jsx(Gt,{fill:X[o%X.length],stroke:"none"},o))}),e.jsx(Fe,{content:e.jsx(Ye,{})})]})}),e.jsx("div",{style:{flex:1,display:"grid",gap:6},children:K.map((t,o)=>e.jsxs("div",{className:"prof-legend-row",children:[e.jsx("span",{style:{width:9,height:9,borderRadius:2,background:X[o%X.length]}}),e.jsx("span",{style:{flex:1,color:"#475569"},children:t.name}),e.jsx("strong",{children:t.value})]},t.name))})]})}),e.jsx(I,{title:"Delayed projects watchlist",action:"View all",to:"/projects?filter=delayed",children:ue.length===0?e.jsx(O,{text:"No delayed projects"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Project"}),e.jsx("th",{children:"City"}),e.jsx("th",{className:"num",children:"Contract"}),e.jsx("th",{className:"num",children:"Progress"})]})}),e.jsx("tbody",{children:ue.map(t=>{const o=Math.max(0,Math.min(100,parseFloat(t.progress_pct||0)));return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx(A,{to:`/projects/${t.id}`,className:"prof-link",children:t.name})}),e.jsx("td",{children:t.city||"—"}),e.jsx("td",{className:"num",children:y(t.contract_value)}),e.jsxs("td",{className:"num",children:[e.jsx("div",{className:"prof-progress",children:e.jsx("div",{className:"prof-progress-fill",style:{width:`${o}%`,background:o<30?"#b91c1c":o<60?"#b45309":"#15803d"}})}),e.jsxs("span",{style:{fontSize:10,fontWeight:700,color:"#475569"},children:[o,"%"]})]})]},t.id)})})]})})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(V,{kicker:"Department 03",title:"Procurement & Stores",action:"Inventory",to:"/procurement/inventory"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(f,{label:"Total Purchase Orders",value:rt,tone:"primary",icon:Tt}),e.jsx(f,{label:"POs Needing Attention",value:nt,tone:"warning",icon:ie,to:"/procurement/po"}),e.jsx(f,{label:"Low-Stock Materials",value:st,tone:"danger",icon:Pt,to:"/procurement/inventory"}),e.jsx(f,{label:"Pending Vendor Bills",value:ot,tone:"default",icon:Be,to:"/tqs/bills"}),e.jsx(f,{label:"Pending Vendor Bill Value",value:it,isCurrency:!0,tone:"default",icon:ae,to:"/tqs/bills"}),e.jsx(f,{label:"Top Low-Stock Item",value:at,tone:"neutral"})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(V,{kicker:"Department 04",title:"Quality, Safety & Documents",action:"HSE",to:"/hse"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(f,{label:"Open Incidents",value:oe,tone:oe>0?"warning":"success",icon:ie,to:"/hse/incidents"}),e.jsx(f,{label:"Expiring Permits",value:je,tone:"warning",icon:$e,to:"/hse/permits",sub:`${ct} permits on record`}),e.jsx(f,{label:"Open RFIs",value:lt,tone:"default",icon:Ee,to:"/quality/rfi"}),e.jsx(f,{label:"Open NCRs",value:be,tone:be>0?"danger":"success",icon:$e,to:"/quality/ncr"}),e.jsx(f,{label:"Documents",value:pt,tone:"default",icon:Lt,to:"/documents"}),e.jsx(f,{label:"Workforce",value:dt,tone:"primary",icon:Mt,to:"/hr/workers"})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(V,{kicker:"Activity",title:"Recent activity across departments"}),e.jsxs("div",{className:"prof-section-grid prof-grid-1-1",children:[e.jsx(I,{title:"Recent Payments",action:"View all",to:"/finance/payments",children:he.length===0?e.jsx(O,{text:"No payments recorded"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Date"}),e.jsx("th",{children:"Beneficiary"}),e.jsx("th",{children:"Type"}),e.jsx("th",{className:"num",children:"Amount"})]})}),e.jsx("tbody",{children:he.slice(0,5).map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"muted",children:F(t.payment_date||t.created_at).format("DD MMM")}),e.jsx("td",{className:"truncate",children:t.entity_name||t.project_name||"Payment"}),e.jsx("td",{children:e.jsx("span",{className:"prof-tag prof-tag-success",children:(t.payment_type||"payment").toLowerCase()})}),e.jsx("td",{className:"num",title:le(t.net_amount||t.amount),children:y(t.net_amount||t.amount)})]},t.id))})]})}),e.jsx(I,{title:"Recent RA Bills",action:"View all",to:"/qs/ra-bills",children:me.length===0?e.jsx(O,{text:"No RA bills"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Date"}),e.jsx("th",{children:"Project / Vendor"}),e.jsx("th",{children:"Status"}),e.jsx("th",{className:"num",children:"Amount"})]})}),e.jsx("tbody",{children:me.slice(0,5).map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"muted",children:F(t.created_at).format("DD MMM")}),e.jsx("td",{className:"truncate",children:t.project_name||t.vendor_name||"—"}),e.jsx("td",{children:e.jsx("span",{className:`prof-tag prof-tag-${t.status||"pending"}`,children:t.status||"pending"})}),e.jsx("td",{className:"num",children:y(t.amount||t.total_amount)})]},t.id))})]})})]})]}),e.jsxs("div",{className:"prof-footer",children:[e.jsxs("span",{children:["BCIM Engineering ERP · v1.0 · Refreshed ",We(w)]}),e.jsxs("span",{children:["Press ",e.jsx("kbd",{children:"R"})," to refresh"]})]})]}),e.jsx("style",{children:`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }

        .prof-dashboard {
          background: #f8fafc; min-height: 100vh;
          font-family: 'Inter','Segoe UI',-apple-system,sans-serif;
          color: #0f172a; font-size: 13px;
        }

        /* ── HEADER ── */
        .prof-header {
          background: #fff; border-bottom: 1px solid #e2e8f0;
          position: sticky; top: 0; z-index: 30;
        }
        .prof-header-inner {
          padding: 14px 28px; display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
        }
        .prof-brand { display: flex; align-items: center; gap: 14px; }
        .prof-brand-mark {
          width: 42px; height: 42px; border-radius: 6px;
          background: #1e293b; color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 13px; letter-spacing: 0.5px;
        }
        .prof-brand-title { font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.1; }
        .prof-brand-sub   { font-size: 11px; color: #64748b; margin-top: 2px; }

        .prof-header-actions { display: flex; align-items: center; gap: 12px; }
        .prof-refresh-meta { font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 6px; }
        .prof-mini-spinner {
          width: 12px; height: 12px; border: 2px solid #cbd5e1; border-top-color: #1e40af;
          border-radius: 50%; animation: prof-spin 1s linear infinite; display: inline-block;
        }
        .prof-refresh-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 14px; border: 1px solid #cbd5e1; background: #fff;
          border-radius: 4px; font-size: 12px; font-weight: 600; color: #334155; cursor: pointer;
          transition: all .12s;
        }
        .prof-refresh-btn:hover { border-color: #1e40af; color: #1e40af; }

        /* ── FILTER STRIP ── */
        .prof-filter-strip {
          padding: 10px 28px; display: flex; align-items: center; gap: 16px;
          background: #f8fafc; border-top: 1px solid #f1f5f9;
        }
        .prof-filter-group { display: flex; align-items: center; gap: 8px; }
        .prof-filter-group label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
        .prof-filter-group select {
          height: 30px; min-width: 160px; padding: 0 26px 0 10px; border: 1px solid #cbd5e1;
          border-radius: 4px; background: #fff; font-size: 12px; color: #0f172a; font-family: inherit;
          outline: none; cursor: pointer;
        }
        .prof-filter-group select:focus { border-color: #1e40af; }
        .prof-filter-spacer { flex: 1; }
        .prof-filter-meta { font-size: 11px; color: #64748b; }
        .prof-filter-meta strong { color: #0f172a; font-weight: 700; }

        /* ── ALERTS ── */
        .prof-alerts {
          background: #fffbeb; border-bottom: 1px solid #fef3c7;
          padding: 8px 28px; display: flex; align-items: center; gap: 10px;
          font-size: 12px; flex-wrap: wrap;
        }
        .prof-alerts-label { font-weight: 700; color: #92400e; }
        .prof-alerts-list { display: flex; gap: 6px; flex-wrap: wrap; }
        .prof-alert-chip {
          padding: 3px 10px; border: 1px solid; border-radius: 999px;
          background: #fff; font-size: 11px; font-weight: 600; text-decoration: none;
        }
        .prof-alert-chip strong { font-weight: 800; }

        /* ── MAIN ── */
        .prof-main { padding: 20px 28px 40px; max-width: 1600px; margin: 0 auto; }

        /* ── TOP KPI STRIP — 3D cards with breathing room ── */
        .prof-kpi-strip {
          display: grid; grid-template-columns: repeat(6, minmax(0,1fr));
          gap: 12px; margin-bottom: 24px;
          perspective: 1200px;
        }
        @media (max-width: 1280px) { .prof-kpi-strip { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        @media (max-width: 720px)  { .prof-kpi-strip { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (max-width: 480px)  { .prof-kpi-strip { grid-template-columns: 1fr; } }

        .prof-kpi-link { text-decoration: none; color: inherit; display: block; }

        /* 3D wrapper */
        .prof-kpi-3d {
          position: relative;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          border-radius: 10px;
          overflow: hidden;
          transform-origin: center center;
          will-change: transform, box-shadow;
          transition: background .15s;
        }
        .prof-kpi-3d::before {
          /* Glossy top sheen */
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 40%;
          background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0) 100%);
          pointer-events: none;
          border-radius: 10px 10px 0 0;
        }
        .prof-kpi-3d-highlight {
          position: absolute; top: 0; left: 8%; right: 8%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent);
          pointer-events: none;
        }
        .prof-kpi-3d-accent {
          position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
          pointer-events: none;
          opacity: 0.85;
        }
        .prof-kpi-link:hover .prof-kpi-3d { background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%); }

        .prof-kpi { padding: 14px 14px 16px; position: relative; }
        .prof-kpi-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .prof-kpi-label {
          font-size: 10px; font-weight: 700; color: #64748b;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .prof-kpi-icon {
          width: 22px; height: 22px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 0 rgba(255,255,255,0.6);
        }
        .prof-kpi-value {
          font-size: 22px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.1;
          text-shadow: 0 1px 0 rgba(255,255,255,0.7);
        }
        .prof-kpi-sub { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11px; color: #64748b; }
        .prof-delta { display: inline-flex; align-items: center; gap: 2px; font-weight: 700; font-size: 10px; padding: 1px 5px; border-radius: 3px; }
        .prof-delta.up   { color: #15803d; background: #dcfce7; }
        .prof-delta.down { color: #b91c1c; background: #fee2e2; }
        .prof-kpi-skeleton { height: 22px; width: 70%; background: linear-gradient(90deg,#e2e8f0 25%,#f1f5f9 50%,#e2e8f0 75%); background-size: 200% 100%; animation: prof-shimmer 1.4s infinite; border-radius: 3px; }

        /* ── SECTION ── */
        .prof-section { margin-bottom: 28px; }
        .prof-section-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;
        }
        .prof-section-kicker {
          font-size: 10px; font-weight: 800; color: #1e40af;
          text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 3px;
        }
        .prof-section-title { font-size: 17px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 10px; }
        .prof-section-count {
          background: #1e293b; color: #fff; font-size: 11px; font-weight: 700;
          padding: 1px 8px; border-radius: 999px;
        }
        .prof-section-action {
          font-size: 11px; font-weight: 700; color: #1e40af; text-decoration: none;
          display: flex; align-items: center; gap: 2px;
        }
        .prof-section-action:hover { text-decoration: underline; }

        .prof-section-grid { display: grid; gap: 14px; margin-bottom: 14px; }
        .prof-grid-2-1 { grid-template-columns: 2fr 1fr; }
        .prof-grid-1-2 { grid-template-columns: 1fr 2fr; }
        .prof-grid-1-1 { grid-template-columns: 1fr 1fr; }
        @media (max-width: 1024px) {
          .prof-grid-2-1, .prof-grid-1-2, .prof-grid-1-1 { grid-template-columns: 1fr; }
        }

        /* ── MINI KPI ROW (inside dept sections) — 3D too ── */
        .prof-mini-kpi-row {
          display: grid; grid-template-columns: repeat(6, minmax(0,1fr));
          gap: 10px; margin-bottom: 14px;
          perspective: 1200px;
        }
        @media (max-width: 1024px) { .prof-mini-kpi-row { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        @media (max-width: 560px)  { .prof-mini-kpi-row { grid-template-columns: repeat(2, minmax(0,1fr)); } }

        /* ── PANEL ── */
        .prof-panel {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;
          box-shadow: 0 1px 2px rgba(15,23,42,0.04);
        }
        .prof-panel-header {
          padding: 10px 14px; border-bottom: 1px solid #f1f5f9;
          display: flex; align-items: center; justify-content: space-between;
          background: #fafbfc;
        }
        .prof-panel-title {
          font-size: 11px; font-weight: 800; color: #334155;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .prof-panel-action {
          font-size: 11px; color: #1e40af; text-decoration: none; font-weight: 600;
          display: flex; align-items: center; gap: 2px;
        }
        .prof-panel-action:hover { text-decoration: underline; }
        .prof-panel-body { padding: 12px 14px; }

        /* ── TABLES ── */
        .prof-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .prof-table thead th {
          text-align: left; padding: 6px 10px; border-bottom: 1px solid #cbd5e1;
          font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;
          background: #f8fafc;
        }
        .prof-table thead th.num,
        .prof-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .prof-table tbody td {
          padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a; vertical-align: middle;
        }
        .prof-table tbody tr:last-child td { border-bottom: none; }
        .prof-table tbody tr:hover { background: #f8fafc; }
        .prof-table .truncate { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .prof-table .muted { color: #94a3b8; font-size: 11px; }
        .prof-table-stat tbody td { padding: 6px 10px; font-size: 12px; }
        .prof-table-stat tbody td:first-child { color: #64748b; font-weight: 500; }
        .prof-table-stat tbody tr.highlight td { background: #f8fafc; font-weight: 700; }

        /* ── STATUS / TAGS ── */
        .prof-status, .prof-tag {
          display: inline-block; padding: 1px 8px; border-radius: 3px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .prof-status-pending,   .prof-tag-pending   { background: #fef3c7; color: #92400e; }
        .prof-status-qs,        .prof-tag-qs        { background: #dbeafe; color: #1e40af; }
        .prof-status-accounts,  .prof-tag-accounts  { background: #ede9fe; color: #6d28d9; }
        .prof-status-paid,      .prof-tag-paid,
        .prof-tag-success                          { background: #dcfce7; color: #15803d; }
        .prof-status-rejected,  .prof-tag-rejected  { background: #fee2e2; color: #b91c1c; }
        .prof-status-procurement,
        .prof-status-qs_sign                       { background: #f1f5f9; color: #334155; }

        .prof-link { color: #1e40af; text-decoration: none; font-weight: 600; }
        .prof-link:hover { text-decoration: underline; }

        .prof-progress {
          display: inline-block; vertical-align: middle; width: 60px; height: 6px;
          background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-right: 6px;
        }
        .prof-progress-fill { height: 100%; border-radius: 999px; }

        .prof-legend-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
        .prof-legend-row strong { color: #0f172a; font-weight: 700; }

        .prof-empty { padding: 24px 0; text-align: center; color: #94a3b8; font-size: 11px; font-style: italic; }

        /* ── FOOTER ── */
        .prof-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 0 0; margin-top: 12px; border-top: 1px solid #e2e8f0;
          font-size: 11px; color: #94a3b8;
        }
        .prof-footer kbd {
          padding: 1px 5px; border: 1px solid #cbd5e1; border-radius: 3px;
          background: #f1f5f9; font-family: inherit; font-size: 10px; font-weight: 700; color: #475569;
        }

        /* ── TOOLTIP ── */
        .prof-tooltip {
          background: #fff; border: 1px solid #cbd5e1; border-radius: 6px;
          padding: 8px 12px; box-shadow: 0 6px 18px rgba(15,23,42,0.12);
          font-size: 11px; min-width: 150px;
        }
        .prof-tooltip-label { font-weight: 700; color: #0f172a; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #f1f5f9; }
        .prof-tooltip-row { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
        .prof-tooltip-dot { width: 8px; height: 8px; border-radius: 2px; }
        .prof-tooltip-name { color: #64748b; flex: 1; }
        .prof-tooltip-val { color: #0f172a; font-weight: 700; font-variant-numeric: tabular-nums; }

        /* ── LOADER ── */
        .prof-loader { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 60vh; color: #64748b; font-size: 13px; }
        .prof-spinner { width: 24px; height: 24px; border: 3px solid #cbd5e1; border-top-color: #1e40af; border-radius: 50%; animation: prof-spin 0.8s linear infinite; }

        @keyframes prof-spin { to { transform: rotate(360deg); } }
        @keyframes prof-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        select option { background: #fff; color: #0f172a; }

        /* Print friendly */
        @media print {
          .prof-header-actions, .prof-refresh-btn, .prof-section-action, .prof-panel-action { display: none !important; }
          .prof-dashboard { background: #fff; }
          .prof-panel { box-shadow: none; }
        }
      `})]})}export{_s as default};
