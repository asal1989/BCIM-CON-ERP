const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PMDashboard-DLNRifD-.js","assets/vendor-react-Db2HHDvz.js","assets/vendor-data-41-IeaEn.js","assets/index-CF3-b6ig.js","assets/vendor-ui-BbXjBtRR.js","assets/vendor-icons-D-O2V3iZ.js","assets/vendor-forms-CYhUWCSQ.js","assets/index-fAgtJniE.css","assets/DashKPI-DP4zPTle.js","assets/SiteEngineerDashboard-wVffImE-.js","assets/QSDashboard-CYtlDm45.js","assets/index-jm6TLY7m.js","assets/AccountsDashboard-BT7Pv-2a.js","assets/HRDashboard-FKV1T4ju.js","assets/HSEDashboard-CuwywSOz.js","assets/StoresDashboard-NxsCvpiU.js","assets/ProcurementDashboard-DeRTlHfd.js","assets/vendor-charts-B4mgixeI.js","assets/ApprovalsPage-B9hobfU6.js"])))=>i.map(i=>d[i]);
import{u as lt,_ as b,b as ct,p as dt,t as pt}from"./index-CF3-b6ig.js";import{j as e,r as i,L as S}from"./vendor-react-Db2HHDvz.js";import{u as ee}from"./vendor-data-41-IeaEn.js";import{d as W}from"./vendor-ui-BbXjBtRR.js";import{R as ft,A as te,h as xt,Z as Ae,W as Re,a4 as mt,i as ht,n as gt,e as ut,f as jt,aF as Se,F as bt,V as yt,a7 as vt,O as kt,aG as wt,aq as Me}from"./vendor-icons-D-O2V3iZ.js";import{R as Ce,A as _t,C as Nt,X as Dt,Y as At,T as Pe,L as Rt,a as Le,P as St,b as Ct,c as Pt}from"./vendor-charts-B4mgixeI.js";import{u as Y,a as K,b as Lt}from"./use-spring-C5eGaZXn.js";import{m as Tt}from"./proxy-BLEG8Upg.js";import"./vendor-forms-CYhUWCSQ.js";const zt=i.lazy(()=>b(()=>import("./PMDashboard-DLNRifD-.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8]))),Et=i.lazy(()=>b(()=>import("./SiteEngineerDashboard-wVffImE-.js"),__vite__mapDeps([9,1,2,3,4,5,6,7,8]))),It=i.lazy(()=>b(()=>import("./QSDashboard-CYtlDm45.js"),__vite__mapDeps([10,1,2,3,4,5,6,7,8,11]))),Mt=i.lazy(()=>b(()=>import("./AccountsDashboard-BT7Pv-2a.js"),__vite__mapDeps([12,1,2,3,4,5,6,7,8]))),Ot=i.lazy(()=>b(()=>import("./HRDashboard-FKV1T4ju.js"),__vite__mapDeps([13,1,2,3,4,5,6,7,8]))),Ft=i.lazy(()=>b(()=>import("./HSEDashboard-CuwywSOz.js"),__vite__mapDeps([14,1,2,3,4,5,6,7,8]))),$t=i.lazy(()=>b(()=>import("./StoresDashboard-NxsCvpiU.js"),__vite__mapDeps([15,1,2,3,4,5,6,7]))),Bt=i.lazy(()=>b(()=>import("./ProcurementDashboard-DeRTlHfd.js"),__vite__mapDeps([16,1,2,3,4,5,6,7,8,17]))),qt=i.lazy(()=>b(()=>import("./ApprovalsPage-B9hobfU6.js"),__vite__mapDeps([18,1,2,3,4,5,6,7,11]))),Vt=["md","managing_director"],Yt=["stephen@bcim.in","it@bcim.in"],Kt=o=>{if(!o)return!1;const s=String(o.role||"").toLowerCase();return Vt.includes(s)||["admin","super_admin"].includes(s)||Yt.includes((o.email||"").toLowerCase())},U=["#1e40af","#0e7490","#16a34a","#b45309","#b91c1c"],Oe=o=>`₹${(parseFloat(o)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`,f=o=>{const s=Math.abs(parseFloat(o)||0),a=(parseFloat(o)||0)<0?"-":"";return s>=1e7?`${a}₹${(s/1e7).toFixed(s>=1e8?1:2)} Cr`:s>=1e5?`${a}₹${(s/1e5).toFixed(s>=1e6?1:2)} L`:s>=1e3?`${a}₹${(s/1e3).toFixed(1)} K`:`${a}₹${s.toFixed(0)}`},Ut=o=>(parseFloat(o)||0).toLocaleString("en-IN"),Te=o=>{if(!o)return"—";const s=Math.max(0,(Date.now()-new Date(o).getTime())/1e3);return s<5?"just now":s<60?`${Math.floor(s)}s ago`:s<3600?`${Math.floor(s/60)} min ago`:s<86400?`${Math.floor(s/3600)} hr ago`:`${Math.floor(s/86400)} d ago`},Wt=o=>{var s,a;return Array.isArray(o==null?void 0:o.data)?o.data:Array.isArray((s=o==null?void 0:o.data)==null?void 0:s.data)?(a=o.data)==null?void 0:a.data:[]},Ht=o=>{if(o==="all")return{dateFrom:null,dateTo:null};const s=W(),p={"7d":6,"30d":29,"90d":89,"1y":364}[o]??29;return{dateFrom:s.subtract(p,"day").format("YYYY-MM-DD"),dateTo:s.format("YYYY-MM-DD")}};function ze(){return e.jsxs("div",{className:"prof-loader",children:[e.jsx("div",{className:"prof-spinner"}),e.jsx("span",{children:"Loading dashboard…"})]})}const Ee=({active:o,payload:s,label:a})=>!o||!(s!=null&&s.length)?null:e.jsxs("div",{className:"prof-tooltip",children:[a&&e.jsx("div",{className:"prof-tooltip-label",children:a}),s.map((p,x)=>e.jsxs("div",{className:"prof-tooltip-row",children:[e.jsx("span",{className:"prof-tooltip-dot",style:{background:p.color}}),e.jsx("span",{className:"prof-tooltip-name",children:p.name}),e.jsx("span",{className:"prof-tooltip-val",children:typeof p.value=="number"&&Math.abs(p.value)>=1e3?f(p.value):p.value})]},x))]}),Ie={default:{c:"#0f172a",accent:"#475569",glow:"rgba(71,85,105,0.15)"},primary:{c:"#1e40af",accent:"#1e40af",glow:"rgba(30,64,175,0.18)"},success:{c:"#15803d",accent:"#15803d",glow:"rgba(21,128,61,0.18)"},warning:{c:"#b45309",accent:"#b45309",glow:"rgba(180,83,9,0.18)"},danger:{c:"#b91c1c",accent:"#b91c1c",glow:"rgba(185,28,28,0.18)"},neutral:{c:"#475569",accent:"#94a3b8",glow:"rgba(148,163,184,0.15)"}};function l({label:o,value:s,sub:a,tone:p="default",icon:x,to:M,isCurrency:h=!1,deltaPct:v,loading:D=!1}){const y=Ie[p]||Ie.default,k=i.useRef(null),C=Y(0),w=Y(0),P=Y(0),L=Y(8),T=K(C,{stiffness:250,damping:22}),g=K(w,{stiffness:250,damping:22}),O=K(P,{stiffness:250,damping:22}),F=K(L,{stiffness:250,damping:22}),n=m=>{const j=k.current;if(!j)return;const _=j.getBoundingClientRect(),E=(m.clientX-_.left)/_.width,c=(m.clientY-_.top)/_.height;C.set((c-.5)*-6),w.set((E-.5)*6),P.set((E-.5)*-10),L.set(14+(c-.5)*4)},u=()=>{C.set(0),w.set(0),P.set(0),L.set(8)},z=e.jsxs(Tt.div,{ref:k,onMouseMove:n,onMouseLeave:u,className:"prof-kpi-3d",style:{rotateX:T,rotateY:g,boxShadow:Lt([O,F],([m,j])=>`${m}px ${j}px 24px -8px ${y.glow}, 0 1px 2px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,23,42,0.04)`),transformStyle:"preserve-3d"},children:[e.jsx("div",{className:"prof-kpi-3d-highlight"}),e.jsx("div",{className:"prof-kpi-3d-accent",style:{background:`linear-gradient(90deg, ${y.accent}, ${y.accent}66)`}}),e.jsxs("div",{className:"prof-kpi",style:{transform:"translateZ(0)"},children:[e.jsxs("div",{className:"prof-kpi-head",children:[e.jsx("span",{className:"prof-kpi-label",children:o}),x&&e.jsx("div",{className:"prof-kpi-icon",style:{background:`${y.accent}15`,color:y.accent},children:e.jsx(x,{size:12,strokeWidth:2.2})})]}),D?e.jsx("div",{className:"prof-kpi-skeleton"}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"prof-kpi-value",style:{color:y.c},title:h&&typeof s=="number"?Oe(s):void 0,children:h&&typeof s=="number"?f(s):typeof s=="number"?Ut(s):s}),(a||v!=null)&&e.jsxs("div",{className:"prof-kpi-sub",children:[v!=null&&e.jsxs("span",{className:`prof-delta ${v>=0?"up":"down"}`,children:[v>=0?e.jsx(kt,{size:10}):e.jsx(wt,{size:10}),Math.abs(v).toFixed(1),"%"]}),a&&e.jsx("span",{children:a})]})]})]})]});return M?e.jsx(S,{to:M,className:"prof-kpi-link",children:z}):e.jsx("div",{className:"prof-kpi-link",children:z})}function I({kicker:o,title:s,count:a,action:p,to:x}){return e.jsxs("div",{className:"prof-section-header",children:[e.jsxs("div",{children:[e.jsx("div",{className:"prof-section-kicker",children:o}),e.jsxs("div",{className:"prof-section-title",children:[s,a!=null&&e.jsx("span",{className:"prof-section-count",children:a})]})]}),p&&x&&e.jsxs(S,{to:x,className:"prof-section-action",children:[p," ",e.jsx(Me,{size:13})]})]})}function N({title:o,action:s,to:a,children:p,className:x=""}){return e.jsxs("div",{className:`prof-panel ${x}`,children:[(o||s)&&e.jsxs("div",{className:"prof-panel-header",children:[o&&e.jsx("span",{className:"prof-panel-title",children:o}),s&&a&&e.jsxs(S,{to:a,className:"prof-panel-action",children:[s," ",e.jsx(Me,{size:11})]})]}),e.jsx("div",{className:"prof-panel-body",children:p})]})}function R({text:o}){return e.jsx("div",{className:"prof-empty",children:o})}function rs(){var ge,ue,je,be,ye,ve,ke,we,_e,Ne,De;const{user:o}=lt(),s=(o==null?void 0:o.role)||"",a=((o==null?void 0:o.department)||"").toLowerCase(),p=Kt(o);if(!["super_admin","admin"].includes(s)&&!p){let t=null;if(s==="project_manager"?t=zt:s==="site_engineer"?t=Et:s==="qs_engineer"?t=It:s==="accountant"?t=Mt:s==="hr"?t=Ot:s==="hse_officer"?t=Ft:a.includes("store")?t=$t:(a.includes("procurement")||a.includes("purchase"))&&(t=Bt),t)return e.jsx(i.Suspense,{fallback:e.jsx(ze,{}),children:e.jsx(t,{})})}const[x,M]=i.useState(0),[h,v]=i.useState("all"),[D,y]=i.useState("30d"),[k,C]=i.useState("all"),[w,P]=i.useState(()=>new Date),[,L]=i.useState(0),T=i.useCallback(()=>{M(t=>t+1),P(new Date)},[]);i.useEffect(()=>{const t=setInterval(()=>L(r=>r+1),3e4);return()=>clearInterval(t)},[]),i.useEffect(()=>{const t=r=>{const J=r.target.tagName;J==="INPUT"||J==="SELECT"||J==="TEXTAREA"||(r.key==="r"||r.key==="R")&&(r.preventDefault(),T())};return window.addEventListener("keydown",t),()=>window.removeEventListener("keydown",t)},[T]);const g=i.useMemo(()=>Ht(D),[D]),O=i.useMemo(()=>({project_id:h!=="all"?h:void 0,business_unit:k!=="all"?k:void 0,date_from:g.dateFrom||void 0,date_to:g.dateTo||void 0}),[h,k,g.dateFrom,g.dateTo]),F=i.useMemo(()=>({project_id:h!=="all"?h:void 0,from_date:g.dateFrom||void 0,to_date:g.dateTo||void 0,limit:500}),[h,g.dateFrom,g.dateTo]),{data:n,isLoading:u}=ee({queryKey:["analytics-executive",x,O],queryFn:()=>ct.executive(O).then(t=>{var r;return((r=t.data)==null?void 0:r.data)||null}).catch(()=>null),staleTime:0,refetchOnMount:"always",refetchOnWindowFocus:!0}),{data:z=[]}=ee({queryKey:["dashboard-projects-fallback"],queryFn:()=>dt.list().then(Wt).catch(()=>[]),staleTime:5*60*1e3}),{data:m=[]}=ee({queryKey:["dashboard-tqs-bills",x,F],queryFn:()=>pt.list(F).then(t=>{var r;return Array.isArray(t.data)?t.data:((r=t.data)==null?void 0:r.data)??[]}).catch(()=>[]),staleTime:60*1e3}),j=((ge=n==null?void 0:n.filters)==null?void 0:ge.options)||{},_=(ue=j.projects)!=null&&ue.length?j.projects:z.map(t=>({id:t.id,name:t.name,project_code:t.project_code,type:t.type})),E=(je=j.business_units)!=null&&je.length?j.business_units:[...new Set(z.map(t=>t.type).filter(Boolean))].sort(),c=(n==null?void 0:n.kpis)||{},se=(n==null?void 0:n.charts)||{},A=(n==null?void 0:n.recent)||{},Fe=(n==null?void 0:n.watchlists)||{},d=(n==null?void 0:n.pulse)||{},oe=(n==null?void 0:n.exceptions)||[],$e=Array.isArray(n==null?void 0:n.projects)?n.projects:[],re=Array.isArray(A.payments)?A.payments:[],ne=Array.isArray(A.ra_bills)?A.ra_bills:[],Be=Array.isArray(A.documents)?A.documents:[],qe=c.total_contract_value??0,$=c.total_certified??0,H=c.total_collections??0,Q=c.receivables??$-H,G=c.pending_ra_bills??0,ae=c.pending_ra_value??0,B=$>0?Math.round(H/$*100):0,X=se.finance_trend||[],ie=c.active_projects??0,le=c.delayed_projects??0,Ve=c.completed_projects??0,Ye=c.planning_projects??0,q=se.project_status||[],ce=[...Fe.delayed_projects||[]].slice(0,6),Ke=c.low_stock_count??((be=d==null?void 0:d.procurement_stores)==null?void 0:be.low_stock_materials)??0,Ue=((ye=d==null?void 0:d.procurement_stores)==null?void 0:ye.pos_requiring_attention)??0,We=((ve=d==null?void 0:d.procurement_stores)==null?void 0:ve.total_pos)??0,He=((ke=d==null?void 0:d.procurement_stores)==null?void 0:ke.pending_vendor_bills)??G,Qe=((we=d==null?void 0:d.procurement_stores)==null?void 0:we.pending_vendor_bill_value)??ae,Ge=((_e=d==null?void 0:d.procurement_stores)==null?void 0:_e.top_low_stock_material)||"—",V=c.safety_score,Z=c.open_incidents??0,Xe=c.open_rfis??0,de=c.open_ncrs??0,pe=c.expiring_permits??0,Ze=((Ne=d==null?void 0:d.quality_safety)==null?void 0:Ne.permits_count)??pe,Je=c.workforce_count??0,et=c.documents_count??Be.length,tt=m.length,st=m.reduce((t,r)=>t+parseFloat(r.total_amount||0),0),fe=m.reduce((t,r)=>t+parseFloat(r.certified_net||0),0),xe=m.reduce((t,r)=>t+parseFloat(r.paid_amount||0),0),ot=fe-xe,rt=m.filter(t=>t.workflow_status==="paid").length,nt=m.filter(t=>t.workflow_status!=="paid").length,me=[...m].sort((t,r)=>new Date(r.created_at||0)-new Date(t.created_at||0)).slice(0,5),he=new Date().getHours(),at=he<12?"Good morning":he<17?"Good afternoon":"Good evening",it={all:"All time","7d":"Last 7 days","30d":"Last 30 days","90d":"Last 90 days","1y":"Last 1 year"}[D];return e.jsxs("div",{className:"prof-dashboard",children:[e.jsxs("header",{className:"prof-header",children:[e.jsxs("div",{className:"prof-header-inner",children:[e.jsxs("div",{className:"prof-brand",children:[e.jsx("div",{className:"prof-brand-mark",children:"BCIM"}),e.jsxs("div",{className:"prof-brand-text",children:[e.jsx("div",{className:"prof-brand-title",children:"Executive Dashboard"}),e.jsxs("div",{className:"prof-brand-sub",children:[at,", ",((De=o==null?void 0:o.name)==null?void 0:De.split(" ")[0])||"Admin"," · ",W().format("dddd, D MMMM YYYY")]})]})]}),e.jsxs("div",{className:"prof-header-actions",children:[e.jsxs("div",{className:"prof-refresh-meta",children:[u&&e.jsx("span",{className:"prof-mini-spinner"}),e.jsxs("span",{title:w.toLocaleString("en-IN"),children:["Updated ",Te(w)]})]}),e.jsxs("button",{onClick:T,className:"prof-refresh-btn",title:"Refresh (R)",children:[e.jsx(ft,{size:13})," Refresh"]})]})]}),e.jsxs("div",{className:"prof-filter-strip",children:[e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Project"}),e.jsxs("select",{value:h,onChange:t=>v(t.target.value),children:[e.jsxs("option",{value:"all",children:["All Projects (",_.length,")"]}),_.map(t=>e.jsx("option",{value:t.id,children:t.project_code?`${t.name} (${t.project_code})`:t.name},t.id))]})]}),e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Date Range"}),e.jsxs("select",{value:D,onChange:t=>y(t.target.value),children:[e.jsx("option",{value:"all",children:"All Time"}),e.jsx("option",{value:"7d",children:"Last 7 Days"}),e.jsx("option",{value:"30d",children:"Last 30 Days"}),e.jsx("option",{value:"90d",children:"Last 90 Days"}),e.jsx("option",{value:"1y",children:"Last 1 Year"})]})]}),E.length>0&&e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Business Unit"}),e.jsxs("select",{value:k,onChange:t=>C(t.target.value),children:[e.jsx("option",{value:"all",children:"All Units"}),E.map(t=>e.jsx("option",{value:t,children:t},t))]})]}),e.jsx("div",{className:"prof-filter-spacer"}),e.jsxs("div",{className:"prof-filter-meta",children:["Showing data for: ",e.jsx("strong",{children:it})]})]})]}),oe.length>0&&e.jsxs("div",{className:"prof-alerts",children:[e.jsx(te,{size:13,color:"#b45309"}),e.jsx("span",{className:"prof-alerts-label",children:"Items needing attention:"}),e.jsx("div",{className:"prof-alerts-list",children:oe.slice(0,4).map(t=>e.jsxs(S,{to:t.to,className:"prof-alert-chip",style:{borderColor:`${t.tone}66`,color:t.tone},children:[t.label," ",e.jsx("strong",{style:{marginLeft:6},children:t.value})]},t.label))})]}),e.jsxs("main",{className:"prof-main",children:[p&&e.jsx("div",{style:{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"16px 18px",marginBottom:18,boxShadow:"0 1px 3px rgba(15,23,42,0.04)"},children:e.jsx(i.Suspense,{fallback:e.jsx(ze,{}),children:e.jsx(qt,{embedded:!0})})}),e.jsxs("div",{className:"prof-kpi-strip",children:[e.jsx(l,{label:"Portfolio Value",value:qe,isCurrency:!0,tone:"primary",icon:xt,to:"/projects",sub:`${$e.length} projects`,loading:u}),e.jsx(l,{label:"Certified Billing",value:$,isCurrency:!0,icon:Ae,to:"/qs/ra-bills",sub:`${G} pending`,loading:u}),e.jsx(l,{label:"Collections",value:H,isCurrency:!0,tone:"success",icon:Re,to:"/finance/payments",sub:`${B}% of certified`,loading:u}),e.jsx(l,{label:"Receivables",value:Q,isCurrency:!0,tone:Q>0?"danger":"success",icon:mt,to:"/finance/payments",sub:Q<0?"over-collected":"outstanding",loading:u}),e.jsx(l,{label:"Active Projects",value:ie,tone:"default",icon:ht,to:"/projects",sub:`${le} delayed`,loading:u}),e.jsx(l,{label:"Safety Score",value:V!=null?`${Math.round(V)}/100`:"N/A",tone:V!=null&&V<70?"warning":"success",icon:gt,to:"/hse",sub:`${Z} incidents`,loading:u})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Department 01",title:"Finance & Quantity Survey",action:"Open Finance",to:"/finance"}),e.jsxs("div",{className:"prof-section-grid prof-grid-2-1",children:[e.jsx(N,{title:"Billing vs Collections trend",action:"View report",to:"/finance/reports",children:X.length===0||X.every(t=>!t.billed&&!t.collected)?e.jsx(R,{text:"No billing or collection data for the selected range"}):e.jsx(Ce,{width:"100%",height:220,children:e.jsxs(_t,{data:X,margin:{top:8,right:14,left:0,bottom:0},children:[e.jsxs("defs",{children:[e.jsxs("linearGradient",{id:"profBill",x1:"0",y1:"0",x2:"0",y2:"1",children:[e.jsx("stop",{offset:"5%",stopColor:"#1e40af",stopOpacity:.3}),e.jsx("stop",{offset:"95%",stopColor:"#1e40af",stopOpacity:0})]}),e.jsxs("linearGradient",{id:"profCollect",x1:"0",y1:"0",x2:"0",y2:"1",children:[e.jsx("stop",{offset:"5%",stopColor:"#15803d",stopOpacity:.3}),e.jsx("stop",{offset:"95%",stopColor:"#15803d",stopOpacity:0})]})]}),e.jsx(Nt,{stroke:"#e2e8f0",strokeDasharray:"3 3",vertical:!1}),e.jsx(Dt,{dataKey:"month",tick:{fill:"#64748b",fontSize:10},axisLine:{stroke:"#cbd5e1"},tickLine:!1}),e.jsx(At,{tick:{fill:"#64748b",fontSize:10},axisLine:!1,tickLine:!1,tickFormatter:t=>f(t).replace("₹","")}),e.jsx(Pe,{content:e.jsx(Ee,{})}),e.jsx(Rt,{wrapperStyle:{fontSize:11,color:"#475569"},iconType:"square"}),e.jsx(Le,{type:"monotone",dataKey:"billed",stroke:"#1e40af",strokeWidth:2,fill:"url(#profBill)",name:"Billed"}),e.jsx(Le,{type:"monotone",dataKey:"collected",stroke:"#15803d",strokeWidth:2,fill:"url(#profCollect)",name:"Collected"})]})})}),e.jsx(N,{title:"Financial summary",children:e.jsx("table",{className:"prof-table prof-table-stat",children:e.jsxs("tbody",{children:[e.jsxs("tr",{children:[e.jsx("td",{children:"Pending RA Bills"}),e.jsx("td",{className:"num",children:G})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"Pending RA Value"}),e.jsx("td",{className:"num",children:f(ae)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"Collection rate"}),e.jsx("td",{className:"num",children:e.jsxs("strong",{style:{color:B>=70?"#15803d":B>=50?"#b45309":"#b91c1c"},children:[B,"%"]})})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Invoice value"}),e.jsx("td",{className:"num",children:f(st)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Certified"}),e.jsx("td",{className:"num",children:f(fe)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Paid"}),e.jsx("td",{className:"num",children:f(xe)})]}),e.jsxs("tr",{className:"highlight",children:[e.jsx("td",{children:"DQS Balance to pay"}),e.jsx("td",{className:"num",children:e.jsx("strong",{style:{color:"#b91c1c"},children:f(ot)})})]})]})})})]}),e.jsx(N,{title:`Recent DQS Vendor Bills (${tt} total · ${rt} paid · ${nt} pending)`,action:"Open DQS",to:"/tqs/bills",children:me.length===0?e.jsx(R,{text:"No recent vendor bills"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Bill No."}),e.jsx("th",{children:"Vendor"}),e.jsx("th",{children:"Project"}),e.jsx("th",{className:"num",children:"Invoice"}),e.jsx("th",{className:"num",children:"Certified"}),e.jsx("th",{className:"num",children:"Paid"}),e.jsx("th",{children:"Status"})]})}),e.jsx("tbody",{children:me.map(t=>{var r;return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx(S,{to:`/tqs/bills/${t.id}`,className:"prof-link",children:t.sl_number||t.bill_number||((r=t.id)==null?void 0:r.slice(0,8))})}),e.jsx("td",{className:"truncate",children:t.vendor_name||"—"}),e.jsx("td",{className:"truncate",children:t.project_name||"—"}),e.jsx("td",{className:"num",children:f(t.total_amount)}),e.jsx("td",{className:"num",children:f(t.certified_net)}),e.jsx("td",{className:"num",children:f(t.paid_amount)}),e.jsx("td",{children:e.jsx("span",{className:`prof-status prof-status-${t.workflow_status||"pending"}`,children:t.workflow_status||"pending"})})]},t.id)})})]})})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Department 02",title:"Projects & Planning",action:"All Projects",to:"/projects"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(l,{label:"Active",value:ie,tone:"primary"}),e.jsx(l,{label:"Delayed",value:le,tone:"danger"}),e.jsx(l,{label:"Planning",value:Ye,tone:"neutral"}),e.jsx(l,{label:"Completed",value:Ve,tone:"success"})]}),e.jsxs("div",{className:"prof-section-grid prof-grid-1-2",children:[e.jsx(N,{title:"Project status breakdown",children:q.length===0?e.jsx(R,{text:"No project data"}):e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12},children:[e.jsx(Ce,{width:"50%",height:170,children:e.jsxs(St,{children:[e.jsx(Ct,{data:q,dataKey:"value",innerRadius:36,outerRadius:62,paddingAngle:2,children:q.map((t,r)=>e.jsx(Pt,{fill:U[r%U.length],stroke:"none"},r))}),e.jsx(Pe,{content:e.jsx(Ee,{})})]})}),e.jsx("div",{style:{flex:1,display:"grid",gap:6},children:q.map((t,r)=>e.jsxs("div",{className:"prof-legend-row",children:[e.jsx("span",{style:{width:9,height:9,borderRadius:2,background:U[r%U.length]}}),e.jsx("span",{style:{flex:1,color:"#475569"},children:t.name}),e.jsx("strong",{children:t.value})]},t.name))})]})}),e.jsx(N,{title:"Delayed projects watchlist",action:"View all",to:"/projects?filter=delayed",children:ce.length===0?e.jsx(R,{text:"No delayed projects"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Project"}),e.jsx("th",{children:"City"}),e.jsx("th",{className:"num",children:"Contract"}),e.jsx("th",{className:"num",children:"Progress"})]})}),e.jsx("tbody",{children:ce.map(t=>{const r=Math.max(0,Math.min(100,parseFloat(t.progress_pct||0)));return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx(S,{to:`/projects/${t.id}`,className:"prof-link",children:t.name})}),e.jsx("td",{children:t.city||"—"}),e.jsx("td",{className:"num",children:f(t.contract_value)}),e.jsxs("td",{className:"num",children:[e.jsx("div",{className:"prof-progress",children:e.jsx("div",{className:"prof-progress-fill",style:{width:`${r}%`,background:r<30?"#b91c1c":r<60?"#b45309":"#15803d"}})}),e.jsxs("span",{style:{fontSize:10,fontWeight:700,color:"#475569"},children:[r,"%"]})]})]},t.id)})})]})})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Department 03",title:"Procurement & Stores",action:"Inventory",to:"/procurement/inventory"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(l,{label:"Total Purchase Orders",value:We,tone:"primary",icon:ut}),e.jsx(l,{label:"POs Needing Attention",value:Ue,tone:"warning",icon:te,to:"/procurement/po"}),e.jsx(l,{label:"Low-Stock Materials",value:Ke,tone:"danger",icon:jt,to:"/procurement/inventory"}),e.jsx(l,{label:"Pending Vendor Bills",value:He,tone:"default",icon:Ae,to:"/tqs/bills"}),e.jsx(l,{label:"Pending Vendor Bill Value",value:Qe,isCurrency:!0,tone:"default",icon:Re,to:"/tqs/bills"}),e.jsx(l,{label:"Top Low-Stock Item",value:Ge,tone:"neutral"})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Department 04",title:"Quality, Safety & Documents",action:"HSE",to:"/hse"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(l,{label:"Open Incidents",value:Z,tone:Z>0?"warning":"success",icon:te,to:"/hse/incidents"}),e.jsx(l,{label:"Expiring Permits",value:pe,tone:"warning",icon:Se,to:"/hse/permits",sub:`${Ze} permits on record`}),e.jsx(l,{label:"Open RFIs",value:Xe,tone:"default",icon:bt,to:"/quality/rfi"}),e.jsx(l,{label:"Open NCRs",value:de,tone:de>0?"danger":"success",icon:Se,to:"/quality/ncr"}),e.jsx(l,{label:"Documents",value:et,tone:"default",icon:yt,to:"/documents"}),e.jsx(l,{label:"Workforce",value:Je,tone:"primary",icon:vt,to:"/hr/workers"})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Activity",title:"Recent activity across departments"}),e.jsxs("div",{className:"prof-section-grid prof-grid-1-1",children:[e.jsx(N,{title:"Recent Payments",action:"View all",to:"/finance/payments",children:re.length===0?e.jsx(R,{text:"No payments recorded"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Date"}),e.jsx("th",{children:"Beneficiary"}),e.jsx("th",{children:"Type"}),e.jsx("th",{className:"num",children:"Amount"})]})}),e.jsx("tbody",{children:re.slice(0,5).map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"muted",children:W(t.payment_date||t.created_at).format("DD MMM")}),e.jsx("td",{className:"truncate",children:t.entity_name||t.project_name||"Payment"}),e.jsx("td",{children:e.jsx("span",{className:"prof-tag prof-tag-success",children:(t.payment_type||"payment").toLowerCase()})}),e.jsx("td",{className:"num",title:Oe(t.net_amount||t.amount),children:f(t.net_amount||t.amount)})]},t.id))})]})}),e.jsx(N,{title:"Recent RA Bills",action:"View all",to:"/qs/ra-bills",children:ne.length===0?e.jsx(R,{text:"No RA bills"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Date"}),e.jsx("th",{children:"Project / Vendor"}),e.jsx("th",{children:"Status"}),e.jsx("th",{className:"num",children:"Amount"})]})}),e.jsx("tbody",{children:ne.slice(0,5).map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"muted",children:W(t.created_at).format("DD MMM")}),e.jsx("td",{className:"truncate",children:t.project_name||t.vendor_name||"—"}),e.jsx("td",{children:e.jsx("span",{className:`prof-tag prof-tag-${t.status||"pending"}`,children:t.status||"pending"})}),e.jsx("td",{className:"num",children:f(t.amount||t.total_amount)})]},t.id))})]})})]})]}),e.jsxs("div",{className:"prof-footer",children:[e.jsxs("span",{children:["BCIM Engineering ERP · v1.0 · Refreshed ",Te(w)]}),e.jsxs("span",{children:["Press ",e.jsx("kbd",{children:"R"})," to refresh"]})]})]}),e.jsx("style",{children:`
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
      `})]})}export{rs as default};
