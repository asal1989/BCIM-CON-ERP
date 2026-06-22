const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PMDashboard-BMZ4peDf.js","assets/vendor-react-Db2HHDvz.js","assets/vendor-data-41-IeaEn.js","assets/index-BqhTYDcO.js","assets/vendor-ui-BbXjBtRR.js","assets/vendor-icons-D-O2V3iZ.js","assets/vendor-forms-CYhUWCSQ.js","assets/index-_IkYQ5O0.css","assets/DashKPI-DP4zPTle.js","assets/SiteEngineerDashboard-7m1k0saA.js","assets/QSDashboard-k0qmWB3m.js","assets/index-jm6TLY7m.js","assets/AccountsDashboard-DGRTiCFN.js","assets/HRDashboard-BgIW8NxV.js","assets/HSEDashboard-CF0FyHk1.js","assets/StoresDashboard-ClqIuSxL.js","assets/ProcurementDashboard-C4tzYeqB.js","assets/vendor-charts-B4mgixeI.js"])))=>i.map(i=>d[i]);
import{u as at,_ as v,b as it,p as lt,t as ct}from"./index-BqhTYDcO.js";import{j as e,r as l,L as S}from"./vendor-react-Db2HHDvz.js";import{u as ee}from"./vendor-data-41-IeaEn.js";import{d as W}from"./vendor-ui-BbXjBtRR.js";import{R as dt,A as te,h as pt,Z as Ae,W as De,a4 as ft,i as xt,n as mt,e as ht,f as gt,aF as Re,F as ut,V as jt,a7 as bt,O as yt,aG as vt,aq as Ie}from"./vendor-icons-D-O2V3iZ.js";import{R as Se,A as kt,C as wt,X as _t,Y as Nt,T as Ce,L as At,a as Pe,P as Dt,b as Rt,c as St}from"./vendor-charts-B4mgixeI.js";import{u as V,a as Y,b as Ct}from"./use-spring-C5eGaZXn.js";import{m as Pt}from"./proxy-BLEG8Upg.js";import"./vendor-forms-CYhUWCSQ.js";const Tt=l.lazy(()=>v(()=>import("./PMDashboard-BMZ4peDf.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8]))),zt=l.lazy(()=>v(()=>import("./SiteEngineerDashboard-7m1k0saA.js"),__vite__mapDeps([9,1,2,3,4,5,6,7,8]))),Lt=l.lazy(()=>v(()=>import("./QSDashboard-k0qmWB3m.js"),__vite__mapDeps([10,1,2,3,4,5,6,7,8,11]))),It=l.lazy(()=>v(()=>import("./AccountsDashboard-DGRTiCFN.js"),__vite__mapDeps([12,1,2,3,4,5,6,7,8]))),Et=l.lazy(()=>v(()=>import("./HRDashboard-BgIW8NxV.js"),__vite__mapDeps([13,1,2,3,4,5,6,7,8]))),Mt=l.lazy(()=>v(()=>import("./HSEDashboard-CF0FyHk1.js"),__vite__mapDeps([14,1,2,3,4,5,6,7,8]))),Ft=l.lazy(()=>v(()=>import("./StoresDashboard-ClqIuSxL.js"),__vite__mapDeps([15,1,2,3,4,5,6,7]))),$t=l.lazy(()=>v(()=>import("./ProcurementDashboard-C4tzYeqB.js"),__vite__mapDeps([16,1,2,3,4,5,6,7,8,17]))),K=["#1e40af","#0e7490","#16a34a","#b45309","#b91c1c"],Ee=o=>`₹${(parseFloat(o)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`,f=o=>{const s=Math.abs(parseFloat(o)||0),a=(parseFloat(o)||0)<0?"-":"";return s>=1e7?`${a}₹${(s/1e7).toFixed(s>=1e8?1:2)} Cr`:s>=1e5?`${a}₹${(s/1e5).toFixed(s>=1e6?1:2)} L`:s>=1e3?`${a}₹${(s/1e3).toFixed(1)} K`:`${a}₹${s.toFixed(0)}`},Ot=o=>(parseFloat(o)||0).toLocaleString("en-IN"),Te=o=>{if(!o)return"—";const s=Math.max(0,(Date.now()-new Date(o).getTime())/1e3);return s<5?"just now":s<60?`${Math.floor(s)}s ago`:s<3600?`${Math.floor(s/60)} min ago`:s<86400?`${Math.floor(s/3600)} hr ago`:`${Math.floor(s/86400)} d ago`},qt=o=>{var s,a;return Array.isArray(o==null?void 0:o.data)?o.data:Array.isArray((s=o==null?void 0:o.data)==null?void 0:s.data)?(a=o.data)==null?void 0:a.data:[]},Bt=o=>{if(o==="all")return{dateFrom:null,dateTo:null};const s=W(),p={"7d":6,"30d":29,"90d":89,"1y":364}[o]??29;return{dateFrom:s.subtract(p,"day").format("YYYY-MM-DD"),dateTo:s.format("YYYY-MM-DD")}};function Vt(){return e.jsxs("div",{className:"prof-loader",children:[e.jsx("div",{className:"prof-spinner"}),e.jsx("span",{children:"Loading dashboard…"})]})}const ze=({active:o,payload:s,label:a})=>!o||!(s!=null&&s.length)?null:e.jsxs("div",{className:"prof-tooltip",children:[a&&e.jsx("div",{className:"prof-tooltip-label",children:a}),s.map((p,x)=>e.jsxs("div",{className:"prof-tooltip-row",children:[e.jsx("span",{className:"prof-tooltip-dot",style:{background:p.color}}),e.jsx("span",{className:"prof-tooltip-name",children:p.name}),e.jsx("span",{className:"prof-tooltip-val",children:typeof p.value=="number"&&Math.abs(p.value)>=1e3?f(p.value):p.value})]},x))]}),Le={default:{c:"#0f172a",accent:"#475569",glow:"rgba(71,85,105,0.15)"},primary:{c:"#1e40af",accent:"#1e40af",glow:"rgba(30,64,175,0.18)"},success:{c:"#15803d",accent:"#15803d",glow:"rgba(21,128,61,0.18)"},warning:{c:"#b45309",accent:"#b45309",glow:"rgba(180,83,9,0.18)"},danger:{c:"#b91c1c",accent:"#b91c1c",glow:"rgba(185,28,28,0.18)"},neutral:{c:"#475569",accent:"#94a3b8",glow:"rgba(148,163,184,0.15)"}};function i({label:o,value:s,sub:a,tone:p="default",icon:x,to:h,isCurrency:L=!1,deltaPct:g,loading:U=!1}){const m=Le[p]||Le.default,I=l.useRef(null),k=V(0),C=V(0),P=V(0),w=V(8),u=Y(k,{stiffness:250,damping:22}),E=Y(C,{stiffness:250,damping:22}),M=Y(P,{stiffness:250,damping:22}),n=Y(w,{stiffness:250,damping:22}),b=y=>{const _=I.current;if(!_)return;const N=_.getBoundingClientRect(),c=(y.clientX-N.left)/N.width,T=(y.clientY-N.top)/N.height;k.set((T-.5)*-6),C.set((c-.5)*6),P.set((c-.5)*-10),w.set(14+(T-.5)*4)},F=()=>{k.set(0),C.set(0),P.set(0),w.set(8)},j=e.jsxs(Pt.div,{ref:I,onMouseMove:b,onMouseLeave:F,className:"prof-kpi-3d",style:{rotateX:u,rotateY:E,boxShadow:Ct([M,n],([y,_])=>`${y}px ${_}px 24px -8px ${m.glow}, 0 1px 2px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,23,42,0.04)`),transformStyle:"preserve-3d"},children:[e.jsx("div",{className:"prof-kpi-3d-highlight"}),e.jsx("div",{className:"prof-kpi-3d-accent",style:{background:`linear-gradient(90deg, ${m.accent}, ${m.accent}66)`}}),e.jsxs("div",{className:"prof-kpi",style:{transform:"translateZ(0)"},children:[e.jsxs("div",{className:"prof-kpi-head",children:[e.jsx("span",{className:"prof-kpi-label",children:o}),x&&e.jsx("div",{className:"prof-kpi-icon",style:{background:`${m.accent}15`,color:m.accent},children:e.jsx(x,{size:12,strokeWidth:2.2})})]}),U?e.jsx("div",{className:"prof-kpi-skeleton"}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"prof-kpi-value",style:{color:m.c},title:L&&typeof s=="number"?Ee(s):void 0,children:L&&typeof s=="number"?f(s):typeof s=="number"?Ot(s):s}),(a||g!=null)&&e.jsxs("div",{className:"prof-kpi-sub",children:[g!=null&&e.jsxs("span",{className:`prof-delta ${g>=0?"up":"down"}`,children:[g>=0?e.jsx(yt,{size:10}):e.jsx(vt,{size:10}),Math.abs(g).toFixed(1),"%"]}),a&&e.jsx("span",{children:a})]})]})]})]});return h?e.jsx(S,{to:h,className:"prof-kpi-link",children:j}):e.jsx("div",{className:"prof-kpi-link",children:j})}function z({kicker:o,title:s,count:a,action:p,to:x}){return e.jsxs("div",{className:"prof-section-header",children:[e.jsxs("div",{children:[e.jsx("div",{className:"prof-section-kicker",children:o}),e.jsxs("div",{className:"prof-section-title",children:[s,a!=null&&e.jsx("span",{className:"prof-section-count",children:a})]})]}),p&&x&&e.jsxs(S,{to:x,className:"prof-section-action",children:[p," ",e.jsx(Ie,{size:13})]})]})}function A({title:o,action:s,to:a,children:p,className:x=""}){return e.jsxs("div",{className:`prof-panel ${x}`,children:[(o||s)&&e.jsxs("div",{className:"prof-panel-header",children:[o&&e.jsx("span",{className:"prof-panel-title",children:o}),s&&a&&e.jsxs(S,{to:a,className:"prof-panel-action",children:[s," ",e.jsx(Ie,{size:11})]})]}),e.jsx("div",{className:"prof-panel-body",children:p})]})}function R({text:o}){return e.jsx("div",{className:"prof-empty",children:o})}function Jt(){var he,ge,ue,je,be,ye,ve,ke,we,_e,Ne;const{user:o}=at(),s=(o==null?void 0:o.role)||"",a=((o==null?void 0:o.department)||"").toLowerCase();if(!["super_admin","admin"].includes(s)){let t=null;if(s==="project_manager"?t=Tt:s==="site_engineer"?t=zt:s==="qs_engineer"?t=Lt:s==="accountant"?t=It:s==="hr"?t=Et:s==="hse_officer"?t=Mt:a.includes("store")?t=Ft:(a.includes("procurement")||a.includes("purchase"))&&(t=$t),t)return e.jsx(l.Suspense,{fallback:e.jsx(Vt,{}),children:e.jsx(t,{})})}const[p,x]=l.useState(0),[h,L]=l.useState("all"),[g,U]=l.useState("30d"),[m,I]=l.useState("all"),[k,C]=l.useState(()=>new Date),[,P]=l.useState(0),w=l.useCallback(()=>{x(t=>t+1),C(new Date)},[]);l.useEffect(()=>{const t=setInterval(()=>P(r=>r+1),3e4);return()=>clearInterval(t)},[]),l.useEffect(()=>{const t=r=>{const J=r.target.tagName;J==="INPUT"||J==="SELECT"||J==="TEXTAREA"||(r.key==="r"||r.key==="R")&&(r.preventDefault(),w())};return window.addEventListener("keydown",t),()=>window.removeEventListener("keydown",t)},[w]);const u=l.useMemo(()=>Bt(g),[g]),E=l.useMemo(()=>({project_id:h!=="all"?h:void 0,business_unit:m!=="all"?m:void 0,date_from:u.dateFrom||void 0,date_to:u.dateTo||void 0}),[h,m,u.dateFrom,u.dateTo]),M=l.useMemo(()=>({project_id:h!=="all"?h:void 0,from_date:u.dateFrom||void 0,to_date:u.dateTo||void 0,limit:500}),[h,u.dateFrom,u.dateTo]),{data:n,isLoading:b}=ee({queryKey:["analytics-executive",p,E],queryFn:()=>it.executive(E).then(t=>{var r;return((r=t.data)==null?void 0:r.data)||null}).catch(()=>null),staleTime:0,refetchOnMount:"always",refetchOnWindowFocus:!0}),{data:F=[]}=ee({queryKey:["dashboard-projects-fallback"],queryFn:()=>lt.list().then(qt).catch(()=>[]),staleTime:5*60*1e3}),{data:j=[]}=ee({queryKey:["dashboard-tqs-bills",p,M],queryFn:()=>ct.list(M).then(t=>{var r;return Array.isArray(t.data)?t.data:((r=t.data)==null?void 0:r.data)??[]}).catch(()=>[]),staleTime:60*1e3}),y=((he=n==null?void 0:n.filters)==null?void 0:he.options)||{},_=(ge=y.projects)!=null&&ge.length?y.projects:F.map(t=>({id:t.id,name:t.name,project_code:t.project_code,type:t.type})),N=(ue=y.business_units)!=null&&ue.length?y.business_units:[...new Set(F.map(t=>t.type).filter(Boolean))].sort(),c=(n==null?void 0:n.kpis)||{},T=(n==null?void 0:n.charts)||{},D=(n==null?void 0:n.recent)||{},Me=(n==null?void 0:n.watchlists)||{},d=(n==null?void 0:n.pulse)||{},se=(n==null?void 0:n.exceptions)||[],Fe=Array.isArray(n==null?void 0:n.projects)?n.projects:[],oe=Array.isArray(D.payments)?D.payments:[],re=Array.isArray(D.ra_bills)?D.ra_bills:[],$e=Array.isArray(D.documents)?D.documents:[],Oe=c.total_contract_value??0,$=c.total_certified??0,Q=c.total_collections??0,G=c.receivables??$-Q,X=c.pending_ra_bills??0,ne=c.pending_ra_value??0,O=$>0?Math.round(Q/$*100):0,H=T.finance_trend||[],ae=c.active_projects??0,ie=c.delayed_projects??0,qe=c.completed_projects??0,Be=c.planning_projects??0,q=T.project_status||[],le=[...Me.delayed_projects||[]].slice(0,6),Ve=c.low_stock_count??((je=d==null?void 0:d.procurement_stores)==null?void 0:je.low_stock_materials)??0,Ye=((be=d==null?void 0:d.procurement_stores)==null?void 0:be.pos_requiring_attention)??0,Ke=((ye=d==null?void 0:d.procurement_stores)==null?void 0:ye.total_pos)??0,We=((ve=d==null?void 0:d.procurement_stores)==null?void 0:ve.pending_vendor_bills)??X,Ue=((ke=d==null?void 0:d.procurement_stores)==null?void 0:ke.pending_vendor_bill_value)??ne,Qe=((we=d==null?void 0:d.procurement_stores)==null?void 0:we.top_low_stock_material)||"—",B=c.safety_score,Z=c.open_incidents??0,Ge=c.open_rfis??0,ce=c.open_ncrs??0,de=c.expiring_permits??0,Xe=((_e=d==null?void 0:d.quality_safety)==null?void 0:_e.permits_count)??de,He=c.workforce_count??0,Ze=c.documents_count??$e.length,Je=j.length,et=j.reduce((t,r)=>t+parseFloat(r.total_amount||0),0),pe=j.reduce((t,r)=>t+parseFloat(r.certified_net||0),0),fe=j.reduce((t,r)=>t+parseFloat(r.paid_amount||0),0),tt=pe-fe,st=j.filter(t=>t.workflow_status==="paid").length,ot=j.filter(t=>t.workflow_status!=="paid").length,xe=[...j].sort((t,r)=>new Date(r.created_at||0)-new Date(t.created_at||0)).slice(0,5),me=new Date().getHours(),rt=me<12?"Good morning":me<17?"Good afternoon":"Good evening",nt={all:"All time","7d":"Last 7 days","30d":"Last 30 days","90d":"Last 90 days","1y":"Last 1 year"}[g];return e.jsxs("div",{className:"prof-dashboard",children:[e.jsxs("header",{className:"prof-header",children:[e.jsxs("div",{className:"prof-header-inner",children:[e.jsxs("div",{className:"prof-brand",children:[e.jsx("div",{className:"prof-brand-mark",children:"BCIM"}),e.jsxs("div",{className:"prof-brand-text",children:[e.jsx("div",{className:"prof-brand-title",children:"Executive Dashboard"}),e.jsxs("div",{className:"prof-brand-sub",children:[rt,", ",((Ne=o==null?void 0:o.name)==null?void 0:Ne.split(" ")[0])||"Admin"," · ",W().format("dddd, D MMMM YYYY")]})]})]}),e.jsxs("div",{className:"prof-header-actions",children:[e.jsxs("div",{className:"prof-refresh-meta",children:[b&&e.jsx("span",{className:"prof-mini-spinner"}),e.jsxs("span",{title:k.toLocaleString("en-IN"),children:["Updated ",Te(k)]})]}),e.jsxs("button",{onClick:w,className:"prof-refresh-btn",title:"Refresh (R)",children:[e.jsx(dt,{size:13})," Refresh"]})]})]}),e.jsxs("div",{className:"prof-filter-strip",children:[e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Project"}),e.jsxs("select",{value:h,onChange:t=>L(t.target.value),children:[e.jsxs("option",{value:"all",children:["All Projects (",_.length,")"]}),_.map(t=>e.jsx("option",{value:t.id,children:t.project_code?`${t.name} (${t.project_code})`:t.name},t.id))]})]}),e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Date Range"}),e.jsxs("select",{value:g,onChange:t=>U(t.target.value),children:[e.jsx("option",{value:"all",children:"All Time"}),e.jsx("option",{value:"7d",children:"Last 7 Days"}),e.jsx("option",{value:"30d",children:"Last 30 Days"}),e.jsx("option",{value:"90d",children:"Last 90 Days"}),e.jsx("option",{value:"1y",children:"Last 1 Year"})]})]}),N.length>0&&e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Business Unit"}),e.jsxs("select",{value:m,onChange:t=>I(t.target.value),children:[e.jsx("option",{value:"all",children:"All Units"}),N.map(t=>e.jsx("option",{value:t,children:t},t))]})]}),e.jsx("div",{className:"prof-filter-spacer"}),e.jsxs("div",{className:"prof-filter-meta",children:["Showing data for: ",e.jsx("strong",{children:nt})]})]})]}),se.length>0&&e.jsxs("div",{className:"prof-alerts",children:[e.jsx(te,{size:13,color:"#b45309"}),e.jsx("span",{className:"prof-alerts-label",children:"Items needing attention:"}),e.jsx("div",{className:"prof-alerts-list",children:se.slice(0,4).map(t=>e.jsxs(S,{to:t.to,className:"prof-alert-chip",style:{borderColor:`${t.tone}66`,color:t.tone},children:[t.label," ",e.jsx("strong",{style:{marginLeft:6},children:t.value})]},t.label))})]}),e.jsxs("main",{className:"prof-main",children:[e.jsxs("div",{className:"prof-kpi-strip",children:[e.jsx(i,{label:"Portfolio Value",value:Oe,isCurrency:!0,tone:"primary",icon:pt,to:"/projects",sub:`${Fe.length} projects`,loading:b}),e.jsx(i,{label:"Certified Billing",value:$,isCurrency:!0,icon:Ae,to:"/qs/ra-bills",sub:`${X} pending`,loading:b}),e.jsx(i,{label:"Collections",value:Q,isCurrency:!0,tone:"success",icon:De,to:"/finance/payments",sub:`${O}% of certified`,loading:b}),e.jsx(i,{label:"Receivables",value:G,isCurrency:!0,tone:G>0?"danger":"success",icon:ft,to:"/finance/payments",sub:G<0?"over-collected":"outstanding",loading:b}),e.jsx(i,{label:"Active Projects",value:ae,tone:"default",icon:xt,to:"/projects",sub:`${ie} delayed`,loading:b}),e.jsx(i,{label:"Safety Score",value:B!=null?`${Math.round(B)}/100`:"N/A",tone:B!=null&&B<70?"warning":"success",icon:mt,to:"/hse",sub:`${Z} incidents`,loading:b})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(z,{kicker:"Department 01",title:"Finance & Quantity Survey",action:"Open Finance",to:"/finance"}),e.jsxs("div",{className:"prof-section-grid prof-grid-2-1",children:[e.jsx(A,{title:"Billing vs Collections trend",action:"View report",to:"/finance/reports",children:H.length===0||H.every(t=>!t.billed&&!t.collected)?e.jsx(R,{text:"No billing or collection data for the selected range"}):e.jsx(Se,{width:"100%",height:220,children:e.jsxs(kt,{data:H,margin:{top:8,right:14,left:0,bottom:0},children:[e.jsxs("defs",{children:[e.jsxs("linearGradient",{id:"profBill",x1:"0",y1:"0",x2:"0",y2:"1",children:[e.jsx("stop",{offset:"5%",stopColor:"#1e40af",stopOpacity:.3}),e.jsx("stop",{offset:"95%",stopColor:"#1e40af",stopOpacity:0})]}),e.jsxs("linearGradient",{id:"profCollect",x1:"0",y1:"0",x2:"0",y2:"1",children:[e.jsx("stop",{offset:"5%",stopColor:"#15803d",stopOpacity:.3}),e.jsx("stop",{offset:"95%",stopColor:"#15803d",stopOpacity:0})]})]}),e.jsx(wt,{stroke:"#e2e8f0",strokeDasharray:"3 3",vertical:!1}),e.jsx(_t,{dataKey:"month",tick:{fill:"#64748b",fontSize:10},axisLine:{stroke:"#cbd5e1"},tickLine:!1}),e.jsx(Nt,{tick:{fill:"#64748b",fontSize:10},axisLine:!1,tickLine:!1,tickFormatter:t=>f(t).replace("₹","")}),e.jsx(Ce,{content:e.jsx(ze,{})}),e.jsx(At,{wrapperStyle:{fontSize:11,color:"#475569"},iconType:"square"}),e.jsx(Pe,{type:"monotone",dataKey:"billed",stroke:"#1e40af",strokeWidth:2,fill:"url(#profBill)",name:"Billed"}),e.jsx(Pe,{type:"monotone",dataKey:"collected",stroke:"#15803d",strokeWidth:2,fill:"url(#profCollect)",name:"Collected"})]})})}),e.jsx(A,{title:"Financial summary",children:e.jsx("table",{className:"prof-table prof-table-stat",children:e.jsxs("tbody",{children:[e.jsxs("tr",{children:[e.jsx("td",{children:"Pending RA Bills"}),e.jsx("td",{className:"num",children:X})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"Pending RA Value"}),e.jsx("td",{className:"num",children:f(ne)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"Collection rate"}),e.jsx("td",{className:"num",children:e.jsxs("strong",{style:{color:O>=70?"#15803d":O>=50?"#b45309":"#b91c1c"},children:[O,"%"]})})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Invoice value"}),e.jsx("td",{className:"num",children:f(et)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Certified"}),e.jsx("td",{className:"num",children:f(pe)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Paid"}),e.jsx("td",{className:"num",children:f(fe)})]}),e.jsxs("tr",{className:"highlight",children:[e.jsx("td",{children:"DQS Balance to pay"}),e.jsx("td",{className:"num",children:e.jsx("strong",{style:{color:"#b91c1c"},children:f(tt)})})]})]})})})]}),e.jsx(A,{title:`Recent DQS Vendor Bills (${Je} total · ${st} paid · ${ot} pending)`,action:"Open DQS",to:"/tqs/bills",children:xe.length===0?e.jsx(R,{text:"No recent vendor bills"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Bill No."}),e.jsx("th",{children:"Vendor"}),e.jsx("th",{children:"Project"}),e.jsx("th",{className:"num",children:"Invoice"}),e.jsx("th",{className:"num",children:"Certified"}),e.jsx("th",{className:"num",children:"Paid"}),e.jsx("th",{children:"Status"})]})}),e.jsx("tbody",{children:xe.map(t=>{var r;return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx(S,{to:`/tqs/bills/${t.id}`,className:"prof-link",children:t.sl_number||t.bill_number||((r=t.id)==null?void 0:r.slice(0,8))})}),e.jsx("td",{className:"truncate",children:t.vendor_name||"—"}),e.jsx("td",{className:"truncate",children:t.project_name||"—"}),e.jsx("td",{className:"num",children:f(t.total_amount)}),e.jsx("td",{className:"num",children:f(t.certified_net)}),e.jsx("td",{className:"num",children:f(t.paid_amount)}),e.jsx("td",{children:e.jsx("span",{className:`prof-status prof-status-${t.workflow_status||"pending"}`,children:t.workflow_status||"pending"})})]},t.id)})})]})})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(z,{kicker:"Department 02",title:"Projects & Planning",action:"All Projects",to:"/projects"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(i,{label:"Active",value:ae,tone:"primary"}),e.jsx(i,{label:"Delayed",value:ie,tone:"danger"}),e.jsx(i,{label:"Planning",value:Be,tone:"neutral"}),e.jsx(i,{label:"Completed",value:qe,tone:"success"})]}),e.jsxs("div",{className:"prof-section-grid prof-grid-1-2",children:[e.jsx(A,{title:"Project status breakdown",children:q.length===0?e.jsx(R,{text:"No project data"}):e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12},children:[e.jsx(Se,{width:"50%",height:170,children:e.jsxs(Dt,{children:[e.jsx(Rt,{data:q,dataKey:"value",innerRadius:36,outerRadius:62,paddingAngle:2,children:q.map((t,r)=>e.jsx(St,{fill:K[r%K.length],stroke:"none"},r))}),e.jsx(Ce,{content:e.jsx(ze,{})})]})}),e.jsx("div",{style:{flex:1,display:"grid",gap:6},children:q.map((t,r)=>e.jsxs("div",{className:"prof-legend-row",children:[e.jsx("span",{style:{width:9,height:9,borderRadius:2,background:K[r%K.length]}}),e.jsx("span",{style:{flex:1,color:"#475569"},children:t.name}),e.jsx("strong",{children:t.value})]},t.name))})]})}),e.jsx(A,{title:"Delayed projects watchlist",action:"View all",to:"/projects?filter=delayed",children:le.length===0?e.jsx(R,{text:"No delayed projects"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Project"}),e.jsx("th",{children:"City"}),e.jsx("th",{className:"num",children:"Contract"}),e.jsx("th",{className:"num",children:"Progress"})]})}),e.jsx("tbody",{children:le.map(t=>{const r=Math.max(0,Math.min(100,parseFloat(t.progress_pct||0)));return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx(S,{to:`/projects/${t.id}`,className:"prof-link",children:t.name})}),e.jsx("td",{children:t.city||"—"}),e.jsx("td",{className:"num",children:f(t.contract_value)}),e.jsxs("td",{className:"num",children:[e.jsx("div",{className:"prof-progress",children:e.jsx("div",{className:"prof-progress-fill",style:{width:`${r}%`,background:r<30?"#b91c1c":r<60?"#b45309":"#15803d"}})}),e.jsxs("span",{style:{fontSize:10,fontWeight:700,color:"#475569"},children:[r,"%"]})]})]},t.id)})})]})})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(z,{kicker:"Department 03",title:"Procurement & Stores",action:"Inventory",to:"/procurement/inventory"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(i,{label:"Total Purchase Orders",value:Ke,tone:"primary",icon:ht}),e.jsx(i,{label:"POs Needing Attention",value:Ye,tone:"warning",icon:te,to:"/procurement/po"}),e.jsx(i,{label:"Low-Stock Materials",value:Ve,tone:"danger",icon:gt,to:"/procurement/inventory"}),e.jsx(i,{label:"Pending Vendor Bills",value:We,tone:"default",icon:Ae,to:"/tqs/bills"}),e.jsx(i,{label:"Pending Vendor Bill Value",value:Ue,isCurrency:!0,tone:"default",icon:De,to:"/tqs/bills"}),e.jsx(i,{label:"Top Low-Stock Item",value:Qe,tone:"neutral"})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(z,{kicker:"Department 04",title:"Quality, Safety & Documents",action:"HSE",to:"/hse"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(i,{label:"Open Incidents",value:Z,tone:Z>0?"warning":"success",icon:te,to:"/hse/incidents"}),e.jsx(i,{label:"Expiring Permits",value:de,tone:"warning",icon:Re,to:"/hse/permits",sub:`${Xe} permits on record`}),e.jsx(i,{label:"Open RFIs",value:Ge,tone:"default",icon:ut,to:"/quality/rfi"}),e.jsx(i,{label:"Open NCRs",value:ce,tone:ce>0?"danger":"success",icon:Re,to:"/quality/ncr"}),e.jsx(i,{label:"Documents",value:Ze,tone:"default",icon:jt,to:"/documents"}),e.jsx(i,{label:"Workforce",value:He,tone:"primary",icon:bt,to:"/hr/workers"})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(z,{kicker:"Activity",title:"Recent activity across departments"}),e.jsxs("div",{className:"prof-section-grid prof-grid-1-1",children:[e.jsx(A,{title:"Recent Payments",action:"View all",to:"/finance/payments",children:oe.length===0?e.jsx(R,{text:"No payments recorded"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Date"}),e.jsx("th",{children:"Beneficiary"}),e.jsx("th",{children:"Type"}),e.jsx("th",{className:"num",children:"Amount"})]})}),e.jsx("tbody",{children:oe.slice(0,5).map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"muted",children:W(t.payment_date||t.created_at).format("DD MMM")}),e.jsx("td",{className:"truncate",children:t.entity_name||t.project_name||"Payment"}),e.jsx("td",{children:e.jsx("span",{className:"prof-tag prof-tag-success",children:(t.payment_type||"payment").toLowerCase()})}),e.jsx("td",{className:"num",title:Ee(t.net_amount||t.amount),children:f(t.net_amount||t.amount)})]},t.id))})]})}),e.jsx(A,{title:"Recent RA Bills",action:"View all",to:"/qs/ra-bills",children:re.length===0?e.jsx(R,{text:"No RA bills"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Date"}),e.jsx("th",{children:"Project / Vendor"}),e.jsx("th",{children:"Status"}),e.jsx("th",{className:"num",children:"Amount"})]})}),e.jsx("tbody",{children:re.slice(0,5).map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"muted",children:W(t.created_at).format("DD MMM")}),e.jsx("td",{className:"truncate",children:t.project_name||t.vendor_name||"—"}),e.jsx("td",{children:e.jsx("span",{className:`prof-tag prof-tag-${t.status||"pending"}`,children:t.status||"pending"})}),e.jsx("td",{className:"num",children:f(t.amount||t.total_amount)})]},t.id))})]})})]})]}),e.jsxs("div",{className:"prof-footer",children:[e.jsxs("span",{children:["BCIM Engineering ERP · v1.0 · Refreshed ",Te(k)]}),e.jsxs("span",{children:["Press ",e.jsx("kbd",{children:"R"})," to refresh"]})]})]}),e.jsx("style",{children:`
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
      `})]})}export{Jt as default};
