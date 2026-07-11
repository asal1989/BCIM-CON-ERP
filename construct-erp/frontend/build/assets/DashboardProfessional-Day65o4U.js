const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PMDashboard-CJakmHLw.js","assets/vendor-react-Db2HHDvz.js","assets/vendor-data-41-IeaEn.js","assets/index-Cslg8Tj1.js","assets/vendor-ui-CyPmblEP.js","assets/vendor-icons-Da26IfvF.js","assets/vendor-forms-CYhUWCSQ.js","assets/index-D3WY9QsZ.css","assets/DashKPI-BLgsQTCG.js","assets/index-DGjryYBU.js","assets/SiteEngineerDashboard-BbrJj20-.js","assets/QSDashboard-H_I4juC1.js","assets/AccountsDashboard-CRkc6eH4.js","assets/ProjectFilter-CdUMg2QV.js","assets/HRDashboard-DyibKLF1.js","assets/vendor-charts-BvcFQVJv.js","assets/HSEDashboard-D6pzwj3E.js","assets/StoresDashboard-8rHUYmlm.js","assets/ProcurementDashboard-B-TQAsXh.js","assets/ApprovalsPage-DJ86VJLA.js"])))=>i.map(i=>d[i]);
import{u as ht,p as Le,_ as j,b as ut,c as gt,t as jt}from"./index-Cslg8Tj1.js";import{u as bt,j as e,r as i,L as D}from"./vendor-react-Db2HHDvz.js";import{e as yt,u as K,f as vt}from"./vendor-data-41-IeaEn.js";import{d as H,z as Me}from"./vendor-ui-CyPmblEP.js";import{R as wt,A as re,W as oe,aD as ae,F as Ee,aQ as kt,s as _t,a3 as Ie,ah as Nt,t as At,y as Dt,f as Rt,g as St,aR as Oe,o as Ct,am as Pt,a0 as zt,aS as Tt}from"./vendor-icons-Da26IfvF.js";import{R as Fe,A as Lt,C as Mt,X as Et,Y as It,T as $e,L as Ot,a as qe,P as Ft,b as $t,c as qt}from"./vendor-charts-BvcFQVJv.js";import{u as Q,a as U,b as Bt}from"./use-spring-C5eGaZXn.js";import{m as Vt}from"./proxy-BLEG8Upg.js";import"./vendor-forms-CYhUWCSQ.js";const Yt=i.lazy(()=>j(()=>import("./PMDashboard-CJakmHLw.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9]))),Kt=i.lazy(()=>j(()=>import("./SiteEngineerDashboard-BbrJj20-.js"),__vite__mapDeps([10,1,2,3,4,5,6,7,8]))),Qt=i.lazy(()=>j(()=>import("./QSDashboard-H_I4juC1.js"),__vite__mapDeps([11,1,2,3,4,5,6,7,8,9]))),Ut=i.lazy(()=>j(()=>import("./AccountsDashboard-CRkc6eH4.js"),__vite__mapDeps([12,3,1,2,4,5,6,7,9,13]))),Wt=i.lazy(()=>j(()=>import("./HRDashboard-DyibKLF1.js"),__vite__mapDeps([14,1,2,4,3,5,6,7,9,15]))),Ht=i.lazy(()=>j(()=>import("./HSEDashboard-D6pzwj3E.js"),__vite__mapDeps([16,1,2,3,4,5,6,7,8]))),Xt=i.lazy(()=>j(()=>import("./StoresDashboard-8rHUYmlm.js"),__vite__mapDeps([17,1,2,3,4,5,6,7,9]))),Gt=i.lazy(()=>j(()=>import("./ProcurementDashboard-B-TQAsXh.js"),__vite__mapDeps([18,1,2,3,4,5,6,7,8,9]))),Zt=i.lazy(()=>j(()=>import("./ApprovalsPage-DJ86VJLA.js"),__vite__mapDeps([19,1,2,3,4,5,6,7,9]))),Jt=["md","managing_director"],es=["stephen@bcim.in","it@bcim.in"],ts=r=>{if(!r)return!1;const s=String(r.role||"").toLowerCase();return Jt.includes(s)||["admin","super_admin"].includes(s)||es.includes((r.email||"").toLowerCase())},W=["#1e40af","#0e7490","#16a34a","#b45309","#b91c1c"],ne=r=>`₹${(parseFloat(r)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`,f=r=>{const s=Math.abs(parseFloat(r)||0),a=(parseFloat(r)||0)<0?"-":"";return s>=1e7?`${a}₹${(s/1e7).toFixed(s>=1e8?1:2)} Cr`:s>=1e5?`${a}₹${(s/1e5).toFixed(s>=1e6?1:2)} L`:s>=1e3?`${a}₹${(s/1e3).toFixed(1)} K`:`${a}₹${s.toFixed(0)}`},ss=r=>(parseFloat(r)||0).toLocaleString("en-IN"),Be=r=>{if(!r)return"—";const s=Math.max(0,(Date.now()-new Date(r).getTime())/1e3);return s<5?"just now":s<60?`${Math.floor(s)}s ago`:s<3600?`${Math.floor(s/60)} min ago`:s<86400?`${Math.floor(s/3600)} hr ago`:`${Math.floor(s/86400)} d ago`},rs=r=>{var s,a;return Array.isArray(r==null?void 0:r.data)?r.data:Array.isArray((s=r==null?void 0:r.data)==null?void 0:s.data)?(a=r.data)==null?void 0:a.data:[]},os=r=>{if(!r)return"—";try{return new Date(r).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}catch{return"—"}},ns=r=>{if(r==="all")return{dateFrom:null,dateTo:null};const s=H(),d={"7d":6,"30d":29,"90d":89,"1y":364}[r]??29;return{dateFrom:s.subtract(d,"day").format("YYYY-MM-DD"),dateTo:s.format("YYYY-MM-DD")}};function Ve(){return e.jsxs("div",{className:"prof-loader",children:[e.jsx("div",{className:"prof-spinner"}),e.jsx("span",{children:"Loading dashboard…"})]})}const Ye=({active:r,payload:s,label:a})=>!r||!(s!=null&&s.length)?null:e.jsxs("div",{className:"prof-tooltip",children:[a&&e.jsx("div",{className:"prof-tooltip-label",children:a}),s.map((d,h)=>e.jsxs("div",{className:"prof-tooltip-row",children:[e.jsx("span",{className:"prof-tooltip-dot",style:{background:d.color}}),e.jsx("span",{className:"prof-tooltip-name",children:d.name}),e.jsx("span",{className:"prof-tooltip-val",children:typeof d.value=="number"&&Math.abs(d.value)>=1e3?f(d.value):d.value})]},h))]}),Ke={default:{c:"#0f172a",accent:"#475569",glow:"rgba(71,85,105,0.15)"},primary:{c:"#1e40af",accent:"#1e40af",glow:"rgba(30,64,175,0.18)"},success:{c:"#15803d",accent:"#15803d",glow:"rgba(21,128,61,0.18)"},warning:{c:"#b45309",accent:"#b45309",glow:"rgba(180,83,9,0.18)"},danger:{c:"#b91c1c",accent:"#b91c1c",glow:"rgba(185,28,28,0.18)"},neutral:{c:"#475569",accent:"#94a3b8",glow:"rgba(148,163,184,0.15)"}};function l({label:r,value:s,sub:a,tone:d="default",icon:h,to:T,isCurrency:R=!1,deltaPct:v,loading:g=!1}){const b=Ke[d]||Ke.default,w=i.useRef(null),L=Q(0),y=Q(0),M=Q(0),k=Q(8),X=U(L,{stiffness:250,damping:22}),G=U(y,{stiffness:250,damping:22}),E=U(M,{stiffness:250,damping:22}),u=U(k,{stiffness:250,damping:22}),O=x=>{const _=w.current;if(!_)return;const m=_.getBoundingClientRect(),N=(x.clientX-m.left)/m.width,S=(x.clientY-m.top)/m.height;L.set((S-.5)*-6),y.set((N-.5)*6),M.set((N-.5)*-10),k.set(14+(S-.5)*4)},F=()=>{L.set(0),y.set(0),M.set(0),k.set(8)},n=e.jsxs(Vt.div,{ref:w,onMouseMove:O,onMouseLeave:F,className:"prof-kpi-3d",style:{rotateX:X,rotateY:G,boxShadow:Bt([E,u],([x,_])=>`${x}px ${_}px 24px -8px ${b.glow}, 0 1px 2px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,23,42,0.04)`),transformStyle:"preserve-3d"},children:[e.jsx("div",{className:"prof-kpi-3d-highlight"}),e.jsx("div",{className:"prof-kpi-3d-accent",style:{background:`linear-gradient(90deg, ${b.accent}, ${b.accent}66)`}}),e.jsxs("div",{className:"prof-kpi",style:{transform:"translateZ(0)"},children:[e.jsxs("div",{className:"prof-kpi-head",children:[e.jsx("span",{className:"prof-kpi-label",children:r}),h&&e.jsx("div",{className:"prof-kpi-icon",style:{background:`${b.accent}15`,color:b.accent},children:e.jsx(h,{size:12,strokeWidth:2.2})})]}),g?e.jsx("div",{className:"prof-kpi-skeleton"}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"prof-kpi-value",style:{color:b.c},title:R&&typeof s=="number"?ne(s):void 0,children:R&&typeof s=="number"?f(s):typeof s=="number"?ss(s):s}),(a||v!=null)&&e.jsxs("div",{className:"prof-kpi-sub",children:[v!=null&&e.jsxs("span",{className:`prof-delta ${v>=0?"up":"down"}`,children:[v>=0?e.jsx(zt,{size:10}):e.jsx(Tt,{size:10}),Math.abs(v).toFixed(1),"%"]}),a&&e.jsx("span",{children:a})]})]})]})]});return T?e.jsx(D,{to:T,className:"prof-kpi-link",children:n}):e.jsx("div",{className:"prof-kpi-link",children:n})}function I({kicker:r,title:s,count:a,action:d,to:h}){return e.jsxs("div",{className:"prof-section-header",children:[e.jsxs("div",{children:[e.jsx("div",{className:"prof-section-kicker",children:r}),e.jsxs("div",{className:"prof-section-title",children:[s,a!=null&&e.jsx("span",{className:"prof-section-count",children:a})]})]}),d&&h&&e.jsxs(D,{to:h,className:"prof-section-action",children:[d," ",e.jsx(ae,{size:13})]})]})}function A({title:r,action:s,to:a,children:d,className:h=""}){return e.jsxs("div",{className:`prof-panel ${h}`,children:[(r||s)&&e.jsxs("div",{className:"prof-panel-header",children:[r&&e.jsx("span",{className:"prof-panel-title",children:r}),s&&a&&e.jsxs(D,{to:a,className:"prof-panel-action",children:[s," ",e.jsx(ae,{size:11})]})]}),e.jsx("div",{className:"prof-panel-body",children:d})]})}function z({text:r}){return e.jsx("div",{className:"prof-empty",children:r})}function hs(){var ke,_e,Ne,Ae,De,Re,Se,Ce,Pe,ze,Te;const{user:r}=ht(),s=(r==null?void 0:r.role)||"",a=((r==null?void 0:r.department)||"").toLowerCase(),d=ts(r),h=bt(),T=yt();if(!["super_admin","admin"].includes(s)&&!d){let t=null;if(s==="project_manager"?t=Yt:s==="site_engineer"?t=Kt:s==="qs_engineer"?t=Qt:s==="accountant"?t=Ut:["hr","hr_admin","hr_manager"].includes(s)?t=Wt:s==="hse_officer"?t=Ht:a.includes("store")?t=Xt:(a.includes("procurement")||a.includes("purchase"))&&(t=Gt),t)return e.jsx(i.Suspense,{fallback:e.jsx(Ve,{}),children:e.jsx(t,{})})}const[R,v]=i.useState(0),[g,b]=i.useState("all"),[w,L]=i.useState("30d"),[y,M]=i.useState("all"),[k,X]=i.useState(()=>new Date),[,G]=i.useState(0),E=i.useCallback(()=>{v(t=>t+1),X(new Date)},[]);i.useEffect(()=>{const t=setInterval(()=>G(o=>o+1),3e4);return()=>clearInterval(t)},[]),i.useEffect(()=>{const t=o=>{const P=o.target.tagName;P==="INPUT"||P==="SELECT"||P==="TEXTAREA"||(o.key==="r"||o.key==="R")&&(o.preventDefault(),E())};return window.addEventListener("keydown",t),()=>window.removeEventListener("keydown",t)},[E]);const u=i.useMemo(()=>ns(w),[w]),O=i.useMemo(()=>({project_id:g!=="all"?g:void 0,business_unit:y!=="all"?y:void 0,date_from:u.dateFrom||void 0,date_to:u.dateTo||void 0}),[g,y,u.dateFrom,u.dateTo]),F=i.useMemo(()=>({project_id:g!=="all"?g:void 0,from_date:u.dateFrom||void 0,to_date:u.dateTo||void 0,limit:500}),[g,u.dateFrom,u.dateTo]),{data:n,isLoading:x}=K({queryKey:["analytics-executive",R,O],queryFn:()=>ut.executive(O).then(t=>{var o;return((o=t.data)==null?void 0:o.data)||null}).catch(()=>null),staleTime:0,refetchOnMount:"always",refetchOnWindowFocus:!0}),{data:_=[]}=K({queryKey:["dashboard-projects-fallback"],queryFn:()=>gt.list().then(rs).catch(()=>[]),staleTime:5*60*1e3}),{data:m=[]}=K({queryKey:["dashboard-tqs-bills",R,F],queryFn:()=>jt.list(F).then(t=>{var o;return Array.isArray(t.data)?t.data:((o=t.data)==null?void 0:o.data)??[]}).catch(()=>[]),staleTime:60*1e3}),{data:N=[]}=K({queryKey:["md-pending-advances",R],queryFn:()=>Le.list({approval_status:"procurement_approved"}).then(t=>{var o;return((o=t.data)==null?void 0:o.data)??[]}),enabled:d,staleTime:0,refetchOnMount:"always"}),S=vt({mutationFn:t=>Le.approveMD(t),onSuccess:()=>{Me.success("Advance voucher authorized"),T.invalidateQueries({queryKey:["md-pending-advances"]}),T.invalidateQueries({queryKey:["procurement-advances"]})},onError:t=>{var o,P;return Me.error(((P=(o=t==null?void 0:t.response)==null?void 0:o.data)==null?void 0:P.message)||"Authorization failed")}}),$=((ke=n==null?void 0:n.filters)==null?void 0:ke.options)||{},ie=(_e=$.projects)!=null&&_e.length?$.projects:_.map(t=>({id:t.id,name:t.name,project_code:t.project_code,type:t.type})),le=(Ne=$.business_units)!=null&&Ne.length?$.business_units:[...new Set(_.map(t=>t.type).filter(Boolean))].sort(),p=(n==null?void 0:n.kpis)||{},ce=(n==null?void 0:n.charts)||{},C=(n==null?void 0:n.recent)||{},Qe=(n==null?void 0:n.watchlists)||{},c=(n==null?void 0:n.pulse)||{},de=(n==null?void 0:n.exceptions)||[],Ue=Array.isArray(n==null?void 0:n.projects)?n.projects:[],pe=Array.isArray(C.payments)?C.payments:[],fe=Array.isArray(C.ra_bills)?C.ra_bills:[],We=Array.isArray(C.documents)?C.documents:[],He=p.total_contract_value??0,q=p.total_certified??0,Z=p.total_collections??0,J=p.receivables??q-Z,ee=p.pending_ra_bills??0,xe=p.pending_ra_value??0,B=q>0?Math.round(Z/q*100):0,te=ce.finance_trend||[],me=p.active_projects??0,he=p.delayed_projects??0,Xe=p.completed_projects??0,Ge=p.planning_projects??0,V=ce.project_status||[],ue=[...Qe.delayed_projects||[]].slice(0,6),Ze=p.low_stock_count??((Ae=c==null?void 0:c.procurement_stores)==null?void 0:Ae.low_stock_materials)??0,Je=((De=c==null?void 0:c.procurement_stores)==null?void 0:De.pos_requiring_attention)??0,et=((Re=c==null?void 0:c.procurement_stores)==null?void 0:Re.total_pos)??0,tt=((Se=c==null?void 0:c.procurement_stores)==null?void 0:Se.pending_vendor_bills)??ee,st=((Ce=c==null?void 0:c.procurement_stores)==null?void 0:Ce.pending_vendor_bill_value)??xe,rt=((Pe=c==null?void 0:c.procurement_stores)==null?void 0:Pe.top_low_stock_material)||"—",Y=p.safety_score,se=p.open_incidents??0,ot=p.open_rfis??0,ge=p.open_ncrs??0,je=p.expiring_permits??0,nt=((ze=c==null?void 0:c.quality_safety)==null?void 0:ze.permits_count)??je,at=p.workforce_count??0,it=p.documents_count??We.length,lt=m.length,ct=m.reduce((t,o)=>t+parseFloat(o.total_amount||0),0),be=m.reduce((t,o)=>t+parseFloat(o.certified_net||0),0),ye=m.reduce((t,o)=>t+parseFloat(o.paid_amount||0),0),dt=be-ye,pt=m.filter(t=>t.workflow_status==="paid").length,ft=m.filter(t=>t.workflow_status!=="paid").length,ve=[...m].sort((t,o)=>new Date(o.created_at||0)-new Date(t.created_at||0)).slice(0,5),we=new Date().getHours(),xt=we<12?"Good morning":we<17?"Good afternoon":"Good evening",mt={all:"All time","7d":"Last 7 days","30d":"Last 30 days","90d":"Last 90 days","1y":"Last 1 year"}[w];return e.jsxs("div",{className:"prof-dashboard",children:[e.jsxs("header",{className:"prof-header",children:[e.jsxs("div",{className:"prof-header-inner",children:[e.jsxs("div",{className:"prof-brand",children:[e.jsx("div",{className:"prof-brand-mark",children:"BCIM"}),e.jsxs("div",{className:"prof-brand-text",children:[e.jsx("div",{className:"prof-brand-title",children:"Executive Dashboard"}),e.jsxs("div",{className:"prof-brand-sub",children:[xt,", ",((Te=r==null?void 0:r.name)==null?void 0:Te.split(" ")[0])||"Admin"," · ",H().format("dddd, D MMMM YYYY")]})]})]}),e.jsxs("div",{className:"prof-header-actions",children:[e.jsxs("div",{className:"prof-refresh-meta",children:[x&&e.jsx("span",{className:"prof-mini-spinner"}),e.jsxs("span",{title:k.toLocaleString("en-IN"),children:["Updated ",Be(k)]})]}),e.jsxs("button",{onClick:E,className:"prof-refresh-btn",title:"Refresh (R)",children:[e.jsx(wt,{size:13})," Refresh"]})]})]}),e.jsxs("div",{className:"prof-filter-strip",children:[e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Project"}),e.jsxs("select",{value:g,onChange:t=>b(t.target.value),children:[e.jsxs("option",{value:"all",children:["All Projects (",ie.length,")"]}),ie.map(t=>e.jsx("option",{value:t.id,children:t.project_code?`${t.name} (${t.project_code})`:t.name},t.id))]})]}),e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Date Range"}),e.jsxs("select",{value:w,onChange:t=>L(t.target.value),children:[e.jsx("option",{value:"all",children:"All Time"}),e.jsx("option",{value:"7d",children:"Last 7 Days"}),e.jsx("option",{value:"30d",children:"Last 30 Days"}),e.jsx("option",{value:"90d",children:"Last 90 Days"}),e.jsx("option",{value:"1y",children:"Last 1 Year"})]})]}),le.length>0&&e.jsxs("div",{className:"prof-filter-group",children:[e.jsx("label",{children:"Business Unit"}),e.jsxs("select",{value:y,onChange:t=>M(t.target.value),children:[e.jsx("option",{value:"all",children:"All Units"}),le.map(t=>e.jsx("option",{value:t,children:t},t))]})]}),e.jsx("div",{className:"prof-filter-spacer"}),e.jsxs("div",{className:"prof-filter-meta",children:["Showing data for: ",e.jsx("strong",{children:mt})]})]})]}),de.length>0&&e.jsxs("div",{className:"prof-alerts",children:[e.jsx(re,{size:13,color:"#b45309"}),e.jsx("span",{className:"prof-alerts-label",children:"Items needing attention:"}),e.jsx("div",{className:"prof-alerts-list",children:de.slice(0,4).map(t=>e.jsxs(D,{to:t.to,className:"prof-alert-chip",style:{borderColor:`${t.tone}66`,color:t.tone},children:[t.label," ",e.jsx("strong",{style:{marginLeft:6},children:t.value})]},t.label))})]}),e.jsxs("main",{className:"prof-main",children:[d&&e.jsx("div",{style:{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"16px 18px",marginBottom:18,boxShadow:"0 1px 3px rgba(15,23,42,0.04)"},children:e.jsx(i.Suspense,{fallback:e.jsx(Ve,{}),children:e.jsx(Zt,{embedded:!0,mdMode:!0})})}),d&&N.length>0&&e.jsxs("div",{style:{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"16px 18px",marginBottom:18,boxShadow:"0 1px 3px rgba(15,23,42,0.04)"},children:[e.jsxs("div",{className:"flex items-center justify-between mb-3",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-base font-bold text-slate-800 flex items-center gap-2",children:[e.jsx(oe,{className:"w-4 h-4 text-indigo-600"}),"Advance Vouchers — Awaiting Your Authorization"]}),e.jsxs("p",{className:"text-xs text-slate-500 mt-0.5",children:[N.length," voucher",N.length!==1?"s":""," approved by Procurement · pending your sign-off"]})]}),e.jsxs(D,{to:"/procurement/advances",className:"prof-panel-action",style:{fontSize:11},children:["View all ",e.jsx(ae,{size:11})]})]}),e.jsx("div",{className:"overflow-x-auto",children:e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Voucher #"}),e.jsx("th",{children:"Vendor"}),e.jsx("th",{children:"Project"}),e.jsx("th",{className:"num",children:"Advance Amount"}),e.jsx("th",{children:"Proc. Approved By"}),e.jsx("th",{children:"Created"}),e.jsx("th",{children:"Actions"})]})}),e.jsx("tbody",{children:N.map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"font-medium text-slate-800",children:t.sl_number||t.voucher_number||"—"}),e.jsx("td",{children:t.vendor_name}),e.jsx("td",{children:t.project_name||"—"}),e.jsx("td",{className:"num font-semibold text-slate-800",children:ne(t.advance_value)}),e.jsx("td",{children:t.procurement_approved_by_name||"—"}),e.jsx("td",{children:os(t.created_at)}),e.jsx("td",{children:e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("button",{onClick:()=>h(`/procurement/advances/${t.id}`),className:"flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",style:{background:"#f1f5f9",color:"#475569"},onMouseEnter:o=>o.currentTarget.style.background="#e2e8f0",onMouseLeave:o=>o.currentTarget.style.background="#f1f5f9",children:[e.jsx(Ee,{className:"w-3 h-3"})," Review"]}),e.jsxs("button",{onClick:()=>S.mutate(t.id),disabled:S.isPending,className:"flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50",style:{background:"#15803d"},onMouseEnter:o=>{S.isPending||(o.currentTarget.style.background="#166534")},onMouseLeave:o=>o.currentTarget.style.background="#15803d",children:[e.jsx(kt,{className:"w-3 h-3"})," Authorize"]})]})})]},t.id))})]})})]}),e.jsxs("div",{className:"prof-kpi-strip",children:[e.jsx(l,{label:"Portfolio Value",value:He,isCurrency:!0,tone:"primary",icon:_t,to:"/projects",sub:`${Ue.length} projects`,loading:x}),e.jsx(l,{label:"Certified Billing",value:q,isCurrency:!0,icon:Ie,to:"/qs/ra-bills",sub:`${ee} pending`,loading:x}),e.jsx(l,{label:"Collections",value:Z,isCurrency:!0,tone:"success",icon:oe,to:"/finance/payments",sub:`${B}% of certified`,loading:x}),e.jsx(l,{label:"Receivables",value:J,isCurrency:!0,tone:J>0?"danger":"success",icon:Nt,to:"/finance/payments",sub:J<0?"over-collected":"outstanding",loading:x}),e.jsx(l,{label:"Active Projects",value:me,tone:"default",icon:At,to:"/projects",sub:`${he} delayed`,loading:x}),e.jsx(l,{label:"Safety Score",value:Y!=null?`${Math.round(Y)}/100`:"N/A",tone:Y!=null&&Y<70?"warning":"success",icon:Dt,to:"/hse",sub:`${se} incidents`,loading:x})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Department 01",title:"Finance & Quantity Survey",action:"Open Finance",to:"/finance"}),e.jsxs("div",{className:"prof-section-grid prof-grid-2-1",children:[e.jsx(A,{title:"Billing vs Collections trend",action:"View report",to:"/finance/reports",children:te.length===0||te.every(t=>!t.billed&&!t.collected)?e.jsx(z,{text:"No billing or collection data for the selected range"}):e.jsx(Fe,{width:"100%",height:220,children:e.jsxs(Lt,{data:te,margin:{top:8,right:14,left:0,bottom:0},children:[e.jsxs("defs",{children:[e.jsxs("linearGradient",{id:"profBill",x1:"0",y1:"0",x2:"0",y2:"1",children:[e.jsx("stop",{offset:"5%",stopColor:"#1e40af",stopOpacity:.3}),e.jsx("stop",{offset:"95%",stopColor:"#1e40af",stopOpacity:0})]}),e.jsxs("linearGradient",{id:"profCollect",x1:"0",y1:"0",x2:"0",y2:"1",children:[e.jsx("stop",{offset:"5%",stopColor:"#15803d",stopOpacity:.3}),e.jsx("stop",{offset:"95%",stopColor:"#15803d",stopOpacity:0})]})]}),e.jsx(Mt,{stroke:"#e2e8f0",strokeDasharray:"3 3",vertical:!1}),e.jsx(Et,{dataKey:"month",tick:{fill:"#64748b",fontSize:10},axisLine:{stroke:"#cbd5e1"},tickLine:!1}),e.jsx(It,{tick:{fill:"#64748b",fontSize:10},axisLine:!1,tickLine:!1,tickFormatter:t=>f(t).replace("₹","")}),e.jsx($e,{content:e.jsx(Ye,{})}),e.jsx(Ot,{wrapperStyle:{fontSize:11,color:"#475569"},iconType:"square"}),e.jsx(qe,{type:"monotone",dataKey:"billed",stroke:"#1e40af",strokeWidth:2,fill:"url(#profBill)",name:"Billed"}),e.jsx(qe,{type:"monotone",dataKey:"collected",stroke:"#15803d",strokeWidth:2,fill:"url(#profCollect)",name:"Collected"})]})})}),e.jsx(A,{title:"Financial summary",children:e.jsx("table",{className:"prof-table prof-table-stat",children:e.jsxs("tbody",{children:[e.jsxs("tr",{children:[e.jsx("td",{children:"Pending RA Bills"}),e.jsx("td",{className:"num",children:ee})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"Pending RA Value"}),e.jsx("td",{className:"num",children:f(xe)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"Collection rate"}),e.jsx("td",{className:"num",children:e.jsxs("strong",{style:{color:B>=70?"#15803d":B>=50?"#b45309":"#b91c1c"},children:[B,"%"]})})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Invoice value"}),e.jsx("td",{className:"num",children:f(ct)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Certified"}),e.jsx("td",{className:"num",children:f(be)})]}),e.jsxs("tr",{children:[e.jsx("td",{children:"DQS Paid"}),e.jsx("td",{className:"num",children:f(ye)})]}),e.jsxs("tr",{className:"highlight",children:[e.jsx("td",{children:"DQS Balance to pay"}),e.jsx("td",{className:"num",children:e.jsx("strong",{style:{color:"#b91c1c"},children:f(dt)})})]})]})})})]}),e.jsx(A,{title:`Recent DQS Vendor Bills (${lt} total · ${pt} paid · ${ft} pending)`,action:"Open DQS",to:"/tqs/bills",children:ve.length===0?e.jsx(z,{text:"No recent vendor bills"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Bill No."}),e.jsx("th",{children:"Vendor"}),e.jsx("th",{children:"Project"}),e.jsx("th",{className:"num",children:"Invoice"}),e.jsx("th",{className:"num",children:"Certified"}),e.jsx("th",{className:"num",children:"Paid"}),e.jsx("th",{children:"Status"})]})}),e.jsx("tbody",{children:ve.map(t=>{var o;return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx(D,{to:`/tqs/bills/${t.id}`,className:"prof-link",children:t.sl_number||t.bill_number||((o=t.id)==null?void 0:o.slice(0,8))})}),e.jsx("td",{className:"truncate",children:t.vendor_name||"—"}),e.jsx("td",{className:"truncate",children:t.project_name||"—"}),e.jsx("td",{className:"num",children:f(t.total_amount)}),e.jsx("td",{className:"num",children:f(t.certified_net)}),e.jsx("td",{className:"num",children:f(t.paid_amount)}),e.jsx("td",{children:e.jsx("span",{className:`prof-status prof-status-${t.workflow_status||"pending"}`,children:t.workflow_status||"pending"})})]},t.id)})})]})})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Department 02",title:"Projects & Planning",action:"All Projects",to:"/projects"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(l,{label:"Active",value:me,tone:"primary"}),e.jsx(l,{label:"Delayed",value:he,tone:"danger"}),e.jsx(l,{label:"Planning",value:Ge,tone:"neutral"}),e.jsx(l,{label:"Completed",value:Xe,tone:"success"})]}),e.jsxs("div",{className:"prof-section-grid prof-grid-1-2",children:[e.jsx(A,{title:"Project status breakdown",children:V.length===0?e.jsx(z,{text:"No project data"}):e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12},children:[e.jsx(Fe,{width:"50%",height:170,children:e.jsxs(Ft,{children:[e.jsx($t,{data:V,dataKey:"value",innerRadius:36,outerRadius:62,paddingAngle:2,children:V.map((t,o)=>e.jsx(qt,{fill:W[o%W.length],stroke:"none"},o))}),e.jsx($e,{content:e.jsx(Ye,{})})]})}),e.jsx("div",{style:{flex:1,display:"grid",gap:6},children:V.map((t,o)=>e.jsxs("div",{className:"prof-legend-row",children:[e.jsx("span",{style:{width:9,height:9,borderRadius:2,background:W[o%W.length]}}),e.jsx("span",{style:{flex:1,color:"#475569"},children:t.name}),e.jsx("strong",{children:t.value})]},t.name))})]})}),e.jsx(A,{title:"Delayed projects watchlist",action:"View all",to:"/projects?filter=delayed",children:ue.length===0?e.jsx(z,{text:"No delayed projects"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Project"}),e.jsx("th",{children:"City"}),e.jsx("th",{className:"num",children:"Contract"}),e.jsx("th",{className:"num",children:"Progress"})]})}),e.jsx("tbody",{children:ue.map(t=>{const o=Math.max(0,Math.min(100,parseFloat(t.progress_pct||0)));return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx(D,{to:`/projects/${t.id}`,className:"prof-link",children:t.name})}),e.jsx("td",{children:t.city||"—"}),e.jsx("td",{className:"num",children:f(t.contract_value)}),e.jsxs("td",{className:"num",children:[e.jsx("div",{className:"prof-progress",children:e.jsx("div",{className:"prof-progress-fill",style:{width:`${o}%`,background:o<30?"#b91c1c":o<60?"#b45309":"#15803d"}})}),e.jsxs("span",{style:{fontSize:10,fontWeight:700,color:"#475569"},children:[o,"%"]})]})]},t.id)})})]})})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Department 03",title:"Procurement & Stores",action:"Inventory",to:"/procurement/inventory"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(l,{label:"Total Purchase Orders",value:et,tone:"primary",icon:Rt}),e.jsx(l,{label:"POs Needing Attention",value:Je,tone:"warning",icon:re,to:"/procurement/po"}),e.jsx(l,{label:"Low-Stock Materials",value:Ze,tone:"danger",icon:St,to:"/procurement/inventory"}),e.jsx(l,{label:"Pending Vendor Bills",value:tt,tone:"default",icon:Ie,to:"/tqs/bills"}),e.jsx(l,{label:"Pending Vendor Bill Value",value:st,isCurrency:!0,tone:"default",icon:oe,to:"/tqs/bills"}),e.jsx(l,{label:"Top Low-Stock Item",value:rt,tone:"neutral"})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Department 04",title:"Quality, Safety & Documents",action:"HSE",to:"/hse"}),e.jsxs("div",{className:"prof-mini-kpi-row",children:[e.jsx(l,{label:"Open Incidents",value:se,tone:se>0?"warning":"success",icon:re,to:"/hse/incidents"}),e.jsx(l,{label:"Expiring Permits",value:je,tone:"warning",icon:Oe,to:"/hse/permits",sub:`${nt} permits on record`}),e.jsx(l,{label:"Open RFIs",value:ot,tone:"default",icon:Ee,to:"/quality/rfi"}),e.jsx(l,{label:"Open NCRs",value:ge,tone:ge>0?"danger":"success",icon:Oe,to:"/quality/ncr"}),e.jsx(l,{label:"Documents",value:it,tone:"default",icon:Ct,to:"/documents"}),e.jsx(l,{label:"Workforce",value:at,tone:"primary",icon:Pt,to:"/hr/workers"})]})]}),e.jsxs("section",{className:"prof-section",children:[e.jsx(I,{kicker:"Activity",title:"Recent activity across departments"}),e.jsxs("div",{className:"prof-section-grid prof-grid-1-1",children:[e.jsx(A,{title:"Recent Payments",action:"View all",to:"/finance/payments",children:pe.length===0?e.jsx(z,{text:"No payments recorded"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Date"}),e.jsx("th",{children:"Beneficiary"}),e.jsx("th",{children:"Type"}),e.jsx("th",{className:"num",children:"Amount"})]})}),e.jsx("tbody",{children:pe.slice(0,5).map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"muted",children:H(t.payment_date||t.created_at).format("DD MMM")}),e.jsx("td",{className:"truncate",children:t.entity_name||t.project_name||"Payment"}),e.jsx("td",{children:e.jsx("span",{className:"prof-tag prof-tag-success",children:(t.payment_type||"payment").toLowerCase()})}),e.jsx("td",{className:"num",title:ne(t.net_amount||t.amount),children:f(t.net_amount||t.amount)})]},t.id))})]})}),e.jsx(A,{title:"Recent RA Bills",action:"View all",to:"/qs/ra-bills",children:fe.length===0?e.jsx(z,{text:"No RA bills"}):e.jsxs("table",{className:"prof-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Date"}),e.jsx("th",{children:"Project / Vendor"}),e.jsx("th",{children:"Status"}),e.jsx("th",{className:"num",children:"Amount"})]})}),e.jsx("tbody",{children:fe.slice(0,5).map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:"muted",children:H(t.created_at).format("DD MMM")}),e.jsx("td",{className:"truncate",children:t.project_name||t.vendor_name||"—"}),e.jsx("td",{children:e.jsx("span",{className:`prof-tag prof-tag-${t.status||"pending"}`,children:t.status||"pending"})}),e.jsx("td",{className:"num",children:f(t.amount||t.total_amount)})]},t.id))})]})})]})]}),e.jsxs("div",{className:"prof-footer",children:[e.jsxs("span",{children:["BCIM Engineering ERP · v1.0 · Refreshed ",Be(k)]}),e.jsxs("span",{children:["Press ",e.jsx("kbd",{children:"R"})," to refresh"]})]})]}),e.jsx("style",{children:`
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
      `})]})}export{hs as default};
