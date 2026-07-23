import{r as v,j as e,R as ze,b as Oe}from"./vendor-react-C3P8e1DV.js";import{f as je,u as ne,g as se}from"./vendor-data-693MZDSQ.js";import{Q as ye}from"./index-fLdOWwHt.js";import{u as Qe}from"./vendor-forms-gVMGBE4b.js";import{ah as Y,d as He}from"./index-BkAFXOnn.js";import{d as c,c as $,z as j}from"./vendor-ui-BL8pBBi4.js";import{bm as xe,D as ve,K as de,a_ as Ne,a3 as We,ao as ue,aj as ge,ak as Ge,aE as ie,cS as Ve,p as Ke,cT as Xe,cU as Ze,aY as we,bx as Je,bN as es,cp as le,aQ as ss,ax as oe,h as ts,ay as _e,be as ke,S as as,X as te,cb as rs,cF as ls,a$ as Se,au as is,cG as ns,bo as ds,bl as os,aK as cs,aC as xs}from"./vendor-icons-BNTULxYJ.js";import{R as ps}from"./RecordAttachments-CxlQDTeI.js";function M(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}async function ms(){try{const h=await(await fetch("/bcim-logo.png")).blob();return await new Promise(n=>{const m=new FileReader;m.onloadend=()=>n(m.result),m.readAsDataURL(h)})}catch{return null}}function bs({value:t,title:h,subtitle:n,metaLabel:m="Asset Tag",metaValue:I,assetId:u,serialNumber:k,extraFields:L=[],className:N,size:E=130,companyName:w="BCIM Engineering Pvt Ltd",labelType:F="ASSET",labelSubtitle:r="Asset Management"}){var X;const R=v.useRef(null),y=String(u||I||t||"").trim(),S=String(h||"").trim(),C=String(k||((X=L.find(b=>/serial/i.test(b.label||"")))==null?void 0:X.value)||"").trim(),g=String(t||y||S||"").trim(),a=[`Company: ${w}`,`Item: ${S||"-"}`,`Serial: ${C||"-"}`,`Asset ID: ${y||g||"-"}`].join(`
`),i=[{label:"Company Name",value:w},{label:"Item Name",value:S},{label:"Serial Number",value:C},{label:"Asset ID",value:y||g}],U=async()=>{var D;if(!g)return;const b=window.open("","_blank","width=620,height=460");if(!b)return;const B=await ms(),z=B?`<img src="${B}" class="logo-img" alt="logo" />`:'<div class="logo-placeholder">BCIM</div>',O=((D=R.current)==null?void 0:D.innerHTML)||"",P=i.filter(Q=>Q.value).map(Q=>`
        <div class="field">
          <span class="field-label">${M(Q.label)}</span>
          <span class="field-value">${M(Q.value)}</span>
        </div>`).join("");b.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Asset Label - ${M(y||g)}</title>
  <style>
    @page { size: 105mm 65mm landscape; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: 103mm;
      height: 63mm;
      background: #fff;
      border: 2px solid #0f2d6b;
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      background: #0f2d6b;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 11mm;
      padding: 5px 10px;
    }
    .logo-img {
      width: 28px;
      height: 28px;
      object-fit: contain;
      background: #fff;
      border-radius: 4px;
      padding: 2px;
      flex-shrink: 0;
    }
    .logo-placeholder {
      width: 28px;
      height: 28px;
      background: #fff;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 7px;
      font-weight: 900;
      color: #0f2d6b;
      flex-shrink: 0;
    }
    .header-text { flex: 1; }
    .company-name {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffffff;
      line-height: 1.2;
    }
    .company-sub {
      font-size: 7px;
      font-weight: 600;
      color: rgba(255,255,255,0.75);
      letter-spacing: 0.05em;
    }
    .it-badge {
      background: #ffffff;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #0f2d6b;
      padding: 2px 7px;
      flex-shrink: 0;
    }

    /* Body */
    .body { display: flex; align-items: stretch; flex: 1; min-height: 0; }

    /* QR col */
    .qr-col {
      width: 38mm;
      background: #eef2ff;
      border-right: 1.5px dashed #93c5fd;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 6px 6px;
      gap: 4px;
      flex-shrink: 0;
    }
    .qr-box {
      background: #fff;
      border-radius: 4px;
      padding: 5px;
      box-shadow: 0 2px 8px rgba(15,45,107,0.18);
    }
    .qr-box svg { display: block; }
    .qr-box svg { width: 27mm; height: 27mm; }
    .scan-text {
      font-size: 6.5px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #374151;
      text-align: center;
    }

    /* Info col */
    .info-col {
      flex: 1;
      padding: 7px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .asset-tag {
      font-family: 'Courier New', monospace;
      font-size: 17px;
      font-weight: 900;
      color: #0f2d6b;
      letter-spacing: 0.06em;
      line-height: 1;
      word-break: break-word;
    }
    .device-line {
      font-size: 10px;
      font-weight: 800;
      color: #111827;
      margin-top: 2px;
      overflow-wrap: anywhere;
    }
    .type-line {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #374151;
    }
    .divider {
      border: none;
      border-top: 1.5px solid #d1d5db;
      margin: 4px 0;
    }
    .field { display: flex; align-items: baseline; gap: 5px; margin-bottom: 2.5px; }
    .field-label {
      font-size: 7px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #374151;
      min-width: 38%;
    }
    .field-value {
      font-size: 8px;
      font-weight: 800;
      color: #111827;
      flex: 1;
      word-break: break-all;
    }

    /* Footer */
    .footer {
      background: #0f2d6b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 3px 10px;
      min-height: 7mm;
    }
    .footer-left {
      font-size: 6.5px;
      font-weight: 700;
      color: rgba(255,255,255,0.85);
      letter-spacing: 0.05em;
    }
    .footer-right {
      font-size: 6.5px;
      font-weight: 700;
      color: rgba(255,255,255,0.65);
    }

    @media print {
      html, body { width: 105mm; height: 65mm; overflow: hidden; }
      body { min-height: unset; background: #fff; }
      .label { box-shadow: none; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="header">
      ${z}
      <div class="header-text">
        <div class="company-name">${M(w)}</div>
        <div class="company-sub">${M(r)}</div>
      </div>
      <span class="it-badge">${M(F)}</span>
    </div>

    <div class="body">
      <div class="qr-col">
        <div class="qr-box">${O}</div>
        <div class="scan-text">Scan to identify</div>
      </div>
      <div class="info-col">
        <div class="asset-tag">${M(y||g)}</div>
        <div class="device-line">${M(S||"")}</div>
        ${n?`<div class="type-line">${M(n)}</div>`:""}
        <hr class="divider"/>
        ${P}
      </div>
    </div>

    <div class="footer">
      <span class="footer-left">Scan QR code to view full asset details</span>
      <span class="footer-right">Property of ${M(w)}</span>
    </div>
  </div>
  <script>
    window.onload = function(){
      setTimeout(function(){ window.print(); }, 250);
    };
    window.onafterprint = function(){ setTimeout(function(){ window.close(); }, 250); };
  <\/script>
</body>
</html>`),b.document.close()},G=()=>{var D;const b=(D=R.current)==null?void 0:D.querySelector("svg");if(!b)return;const B=new XMLSerializer().serializeToString(b),z=new Blob([B],{type:"image/svg+xml"}),O=URL.createObjectURL(z),P=document.createElement("a");P.href=O,P.download=`${y||g}_QR.svg`,document.body.appendChild(P),P.click(),document.body.removeChild(P),URL.revokeObjectURL(O)};return g?e.jsxs("div",{className:N,children:[e.jsxs("div",{className:"overflow-hidden rounded-xl border-[2.5px] border-[#0f2d6b] shadow-xl",children:[e.jsxs("div",{className:"flex items-center gap-3 px-4 py-2.5",style:{background:"#0f2d6b"},children:[e.jsxs("div",{className:"h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white p-1 shadow-sm",children:[e.jsx("img",{src:"/bcim-logo.png",alt:"BCIM",className:"h-full w-full object-contain",onError:b=>{b.target.style.display="none",b.target.nextSibling.style.display="flex"}}),e.jsx("div",{className:"hidden h-full w-full items-center justify-center text-[9px] font-medium text-[#0f2d6b]",children:"BCIM"})]}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("div",{className:"text-[11px] font-medium uppercase tracking-[0.1em] text-white leading-tight",children:w}),e.jsx("div",{className:"text-[9px] font-semibold text-white/70 leading-tight mt-0.5",children:r})]}),e.jsx("div",{className:"shrink-0 rounded bg-white px-2.5 py-1 text-[9px] font-medium uppercase tracking-widest text-[#0f2d6b]",children:F})]}),e.jsxs("div",{className:"flex items-stretch bg-white",children:[e.jsxs("div",{className:"flex flex-col items-center justify-center gap-2 border-r-2 border-dashed border-blue-200 bg-[#eef2ff] px-5 py-4 shrink-0",children:[e.jsx("div",{className:"rounded-lg bg-white p-2.5 shadow-md ring-2 ring-[#0f2d6b]/20",children:e.jsx("div",{ref:R,children:e.jsx(ye,{value:a,size:E,includeMargin:!1,fgColor:"#0f2d6b",level:"M"})})}),e.jsx("p",{className:"text-[9px] font-medium uppercase tracking-[0.15em] text-gray-600",children:"Scan to identify"})]}),e.jsxs("div",{className:"flex flex-1 flex-col justify-center gap-1.5 px-5 py-4",children:[e.jsx("div",{className:"font-mono text-2xl font-medium leading-none tracking-wide text-[#0f2d6b]",children:y||g}),e.jsx("div",{className:"text-sm font-medium text-gray-900",children:S}),n&&e.jsx("div",{className:"text-[10px] font-bold uppercase tracking-widest text-gray-600",children:n}),e.jsx("div",{className:"my-1 border-t-2 border-gray-200"}),e.jsx("div",{className:"space-y-1.5",children:i.filter(b=>b.value).map((b,B)=>e.jsxs("div",{className:"flex items-baseline gap-2",children:[e.jsx("span",{className:"min-w-[92px] text-[9px] font-medium uppercase tracking-wider text-gray-500",children:b.label}),e.jsx("span",{className:"text-[11px] font-bold text-gray-900",children:b.value})]},B))})]})]}),e.jsxs("div",{className:"flex items-center justify-between px-4 py-1.5",style:{background:"#0f2d6b"},children:[e.jsx("span",{className:"text-[9px] font-bold text-white/80 tracking-wide",children:"Scan QR to view full asset details"}),e.jsxs("span",{className:"text-[8.5px] font-semibold text-white/60",children:["Property of ",w]})]})]}),e.jsxs("div",{className:"mt-3 flex gap-2",children:[e.jsxs("button",{type:"button",onClick:U,className:"flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white transition hover:opacity-90",style:{background:"#0f2d6b"},children:[e.jsx(xe,{className:"h-4 w-4"}),"Print Label"]}),e.jsxs("button",{type:"button",onClick:G,title:"Download QR as SVG",className:"flex items-center justify-center gap-2 rounded-lg border-2 border-[#0f2d6b] bg-white px-4 py-2.5 text-sm font-bold text-[#0f2d6b] transition hover:bg-blue-50",children:[e.jsx(ve,{className:"h-4 w-4"}),"QR"]})]})]}):null}const ce=[{key:"all",label:"All Assets",Icon:de,color:"#1a73e8"},{key:"laptop",label:"Laptops",Icon:Ve,color:"#1a73e8"},{key:"desktop",label:"Desktops",Icon:Ke,color:"#1a73e8"},{key:"server",label:"Servers",Icon:Xe,color:"#6c35de"},{key:"network",label:"Network",Icon:Ze,color:"#0f9d58"},{key:"cctv",label:"CCTV",Icon:we,color:"#f4a100"},{key:"biometric",label:"Biometric",Icon:Je,color:"#f4a100"},{key:"printer",label:"Printers",Icon:xe,color:"#5f6368"},{key:"ups",label:"UPS",Icon:es,color:"#d93025"},{key:"other",label:"Others",Icon:le,color:"#5f6368"}],fe=[{key:"all",label:"All Status",dot:"#9aa0a6"},{key:"in_use",label:"In Use",dot:"#0f9d58"},{key:"available",label:"Available",dot:"#1a73e8"},{key:"under_repair",label:"Under Repair",dot:"#f4a100"},{key:"retired",label:"Retired",dot:"#9aa0a6"},{key:"lost",label:"Lost / Stolen",dot:"#d93025"}],ae={in_use:"bg-green-50 text-green-700 border border-green-200",available:"bg-blue-50 text-blue-700 border border-blue-200",under_repair:"bg-yellow-50 text-yellow-700 border border-yellow-200",retired:"bg-gray-100 text-slate-600 border border-gray-200",lost:"bg-red-50 text-red-700 border border-red-200"},re={in_use:"In Use",available:"Available",under_repair:"Under Repair",retired:"Retired",lost:"Lost/Stolen"},K=Object.fromEntries(ce.slice(1).map(t=>[t.key,t])),x="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition",hs={laptop:"LT",desktop:"DT",server:"SRV",network:"NET",cctv:"CCTV",biometric:"BIO",printer:"PRN",ups:"UPS",other:"OTH"};function us(t,h="other"){const n=String(t||"").trim().toUpperCase().replace(/\s+/g,"-");if(!n||n.startsWith("BCIM-IT-"))return n;if(n.startsWith("BCIM-"))return`BCIM-IT-${n.slice(5).replace(/^IT-/,"")}`;if(n.startsWith("IT-"))return`BCIM-${n}`;const m=hs[String(h||"").toLowerCase()]||"OTH";return n.startsWith(`${m}-`)||n.startsWith(m)?`BCIM-IT-${n}`:`BCIM-IT-${m}-${n}`}function p({label:t,children:h,span:n=1}){return e.jsxs("div",{className:$("space-y-1",n===2&&"col-span-2",n===3&&"col-span-3"),children:[e.jsx("label",{className:"block text-xs font-medium text-gray-500",children:t}),h]})}function Ae(t){return`${t.brand||""} ${t.model||""}`.trim()||t.asset_tag||"-"}function gs(t){return["Company: BCIM Engineering Pvt Ltd",`Item: ${Ae(t)}`,`Serial: ${t.serial_number||"-"}`,`Asset ID: ${t.asset_tag||"-"}`].join(`
`)}function Is(){const[t,h]=v.useState(!1),[n,m]=v.useState(null),[I,u]=v.useState(null),[k,L]=v.useState(null),[N,E]=v.useState("all"),[w,F]=v.useState("all"),[r,R]=v.useState(""),[y,S]=v.useState(!1),[C,g]=v.useState(()=>new Set),a=je(),{register:i,handleSubmit:U,reset:G,setValue:X}=Qe(),b=ze.useRef(null),{data:B,isLoading:z,refetch:O}=ne({queryKey:["it-assets"],queryFn:()=>Y.list().then(s=>{var l;return(l=s.data)==null?void 0:l.data}).catch(()=>[])}),{data:P=[]}=ne({queryKey:["projects-list"],queryFn:()=>He.list().then(s=>{var l;return((l=s.data)==null?void 0:l.data)||s.data||[]}).catch(()=>[])}),D=se({mutationFn:s=>n?Y.update(n.id,s):Y.create(s),onSuccess:()=>{j.success(n?"Asset updated":"Asset registered"),G(),h(!1),m(null),a.invalidateQueries({queryKey:["it-assets"]})},onError:s=>{var l,d;return j.error(((d=(l=s==null?void 0:s.response)==null?void 0:l.data)==null?void 0:d.error)||"Save failed")}}),Q=se({mutationFn:s=>Y.delete(s),onSuccess:()=>{j.success("Asset deleted"),a.invalidateQueries({queryKey:["it-assets"]})},onError:s=>{var l,d;return j.error(((d=(l=s==null?void 0:s.response)==null?void 0:l.data)==null?void 0:d.error)||"Delete failed")}}),A=B||[],T=A.filter(s=>!(N!=="all"&&s.asset_type!==N||w!=="all"&&s.status!==w||r&&!`${s.asset_tag} ${s.brand} ${s.model} ${s.serial_number||""} ${s.location_description||""}`.toLowerCase().includes(r.toLowerCase()))),H=v.useMemo(()=>T.filter(s=>C.has(s.id)),[T,C]),pe=T.length>0&&T.every(s=>C.has(s.id)),Ie=s=>{g(l=>{const d=new Set(l);return d.has(s)?d.delete(s):d.add(s),d})},Ce=()=>{g(s=>{const l=new Set(s);return pe?T.forEach(d=>l.delete(d.id)):T.forEach(d=>l.add(d.id)),l})},Te=()=>{if(!H.length){j.error("Select IT assets to print QR labels");return}setTimeout(()=>window.print(),80)},Z=A.filter(s=>{const l=s.warranty_expiry?c(s.warranty_expiry).diff(c(),"day"):null;return l!==null&&l>=0&&l<=90}),J=A.filter(s=>s.antivirus_expiry?c(s.antivirus_expiry).diff(c(),"day")<=30:!1),Me=A.reduce((s,l)=>s+parseFloat(l.purchase_cost||0),0),$e=A.filter(s=>s.status==="in_use").length,Le=A.filter(s=>s.status==="available").length,Re=()=>{m(null),G({status:"available",asset_type:"laptop",asset_tag:"BCIM-IT-LT-"}),h(!0)},Pe=s=>{m(s),Object.entries(s).forEach(([l,d])=>X(l,d??"")),h(!0)},me=()=>{G(),h(!1),m(null)},De=()=>{const s=["asset_tag","asset_type","brand","model","serial_number","os","processor","ram_gb","storage_gb","ip_address","mac_address","status","assigned_to_name","location_description","purchase_date","purchase_cost","warranty_expiry","antivirus_status","antivirus_expiry","project_name","notes"],l=s.join(","),d=A.map(ee=>s.map(V=>{const W=ee[V]??"";return typeof W=="string"&&W.includes(",")?`"${W}"`:W}).join(",")),o=new Blob([l+`
`+d.join(`
`)],{type:"text/csv"}),f=URL.createObjectURL(o),q=document.createElement("a");q.href=f,q.download=`IT_Assets_${c().format("YYYY-MM-DD")}.csv`,document.body.appendChild(q),q.click(),document.body.removeChild(q),URL.revokeObjectURL(f),j.success(`Exported ${A.length} assets`)},Ee=()=>{const s=["asset_tag,asset_type,brand,model,serial_number,os,purchase_date,purchase_cost,warranty_expiry,status,location_description,notes","BCIM-IT-LT-001,laptop,Dell,Latitude 5540,SN1234567,Windows 11 Pro,2024-01-15,85000,2027-01-15,in_use,HO - Accounts Dept,Assigned to finance team","# asset_type: laptop | desktop | server | network | cctv | biometric | printer | ups | other","# status: in_use | available | under_repair | retired | lost"],l=new Blob([s.join(`
`)],{type:"text/csv"}),d=URL.createObjectURL(l),o=document.createElement("a");o.href=d,o.download="IT_Assets_Template.csv",document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(d)},Be=async s=>{var d,o,f,q;const l=(d=s.target.files)==null?void 0:d[0];if(l){s.target.value="",S(!0);try{const V=(await l.text()).split(`
`).map(_=>_.trim()).filter(_=>_&&!_.startsWith("#"));if(V.length<2){j.error("No data rows found");return}const W=V[0].split(",").map(_=>_.trim()),be=V.slice(1).map(_=>Object.fromEntries(W.map((Fe,Ue)=>{var he;return[Fe,((he=_.split(",")[Ue])==null?void 0:he.replace(/^"|"$/g,"").trim())||""]}))).filter(_=>_.asset_tag&&_.brand&&_.model);if(!be.length){j.error("No valid rows — need: asset_tag, brand, model");return}const Ye=await Y.import(be);j.success(((o=Ye.data)==null?void 0:o.message)||"Import complete"),a.invalidateQueries({queryKey:["it-assets"]})}catch(ee){j.error(((q=(f=ee.response)==null?void 0:f.data)==null?void 0:q.error)||"Import failed")}finally{S(!1)}}},qe=[{label:"Total Assets",value:A.length,icon:de,color:"text-blue-600",bg:"bg-blue-50"},{label:"In Use",value:$e,icon:Ne,color:"text-green-600",bg:"bg-green-50"},{label:"Available",value:Le,icon:We,color:"text-indigo-600",bg:"bg-indigo-50"},{label:"Warranty Alerts",value:Z.length,icon:ue,color:"text-amber-600",bg:"bg-amber-50"},{label:"Antivirus Alerts",value:J.length,icon:ge,color:"text-red-600",bg:"bg-red-50"},{label:"Capital Value",value:`₹${Number(Me).toLocaleString("en-IN",{maximumFractionDigits:0})}`,icon:Ge,color:"text-purple-600",bg:"bg-purple-50"}];return e.jsxs("div",{className:"flex h-full min-h-screen bg-gray-50",children:[e.jsx("style",{children:`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          body * { visibility: hidden !important; }
          .bulk-it-qr-print,
          .bulk-it-qr-print * { visibility: visible !important; }
          .bulk-it-qr-print {
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .bulk-it-qr-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 94mm);
            gap: 2.5mm;
            align-items: start;
          }
          .bulk-it-qr-label {
            width: 94mm !important;
            height: 62mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .bulk-it-qr-label > div:first-child {
            min-height: 8.5mm !important;
            padding: 1.5mm 3mm !important;
          }
          .bulk-it-qr-label > div:nth-child(2) {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            grid-template-columns: 40mm minmax(0, 1fr) !important;
          }
          .bulk-it-qr-label > div:last-child {
            min-height: 5mm !important;
            padding: 1mm 3mm !important;
          }
          .bulk-it-qr-label svg {
            width: 34mm !important;
            height: 34mm !important;
          }
        }
      `}),e.jsxs("aside",{className:"hidden w-56 shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col",children:[e.jsxs("div",{className:"border-b border-gray-200 px-4 py-4 flex items-center gap-2",children:[e.jsx(ie,{className:"h-5 w-5 text-blue-600"}),e.jsx("span",{className:"text-sm font-semibold text-gray-800",children:"IT Assets"})]}),e.jsxs("div",{className:"flex-1 overflow-y-auto py-3",children:[e.jsx("p",{className:"mb-1 px-4 text-[10px] font-medium uppercase tracking-wider text-gray-400",children:"Asset Categories"}),ce.map(({key:s,label:l,Icon:d})=>{const o=s==="all"?A.length:A.filter(f=>f.asset_type===s).length;return e.jsxs("button",{onClick:()=>E(s),className:$("flex w-full items-center gap-2.5 px-4 py-2 text-[13px] transition-colors",N===s?"bg-blue-50 font-semibold text-blue-700":"text-slate-600 hover:bg-gray-50"),children:[e.jsx(d,{className:$("h-4 w-4 shrink-0",N===s?"text-blue-600":"text-gray-400")}),e.jsx("span",{className:"flex-1 text-left",children:l}),e.jsx("span",{className:$("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",N===s?"bg-blue-100 text-blue-700":"bg-gray-100 text-gray-500"),children:o})]},s)}),e.jsx("p",{className:"mb-1 mt-4 px-4 text-[10px] font-medium uppercase tracking-wider text-gray-400",children:"Status"}),fe.map(({key:s,label:l,dot:d})=>e.jsxs("button",{onClick:()=>F(s),className:$("flex w-full items-center gap-2.5 px-4 py-2 text-[13px] transition-colors",w===s?"bg-blue-50 font-semibold text-blue-700":"text-slate-600 hover:bg-gray-50"),children:[e.jsx("span",{className:"h-2 w-2 shrink-0 rounded-full",style:{backgroundColor:d}}),l]},s))]})]}),e.jsxs("div",{className:"flex flex-1 flex-col overflow-hidden",children:[e.jsxs("header",{className:"flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3",children:[e.jsxs("div",{className:"flex items-center gap-1 text-sm text-gray-500",children:[e.jsx("span",{children:"Assets & IT"}),e.jsx(ss,{className:"h-4 w-4"}),e.jsx("span",{className:"font-semibold text-gray-800",children:"IT Assets"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("input",{ref:b,type:"file",accept:".csv",className:"hidden",onChange:Be}),e.jsxs("button",{onClick:()=>O(),className:"flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50",children:[e.jsx(oe,{className:"h-3.5 w-3.5"})," Refresh"]}),e.jsxs("button",{onClick:Ee,className:"flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50",children:[e.jsx(ts,{className:"h-3.5 w-3.5 text-green-600"})," Template"]}),e.jsxs("button",{onClick:()=>{var s;return(s=b.current)==null?void 0:s.click()},disabled:y,className:"flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50 disabled:opacity-50",children:[e.jsx(_e,{className:"h-3.5 w-3.5 text-blue-500"}),y?"Importing…":"Import CSV"]}),e.jsxs("button",{onClick:De,className:"flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50",children:[e.jsx(ve,{className:"h-3.5 w-3.5 text-indigo-500"})," Export"]}),e.jsxs("button",{onClick:Te,className:"flex items-center gap-1.5 rounded border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50",children:[e.jsx(xe,{className:"h-3.5 w-3.5"})," Print QR ",H.length?`(${H.length})`:""]}),e.jsxs("button",{onClick:Re,className:"flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700",children:[e.jsx(ke,{className:"h-3.5 w-3.5"})," Add Asset"]})]})]}),e.jsxs("div",{className:"flex-1 overflow-y-auto p-5 space-y-4",children:[e.jsx("div",{className:"grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6",children:qe.map(({label:s,value:l,icon:d,color:o,bg:f})=>e.jsxs("div",{className:"rounded-lg border border-gray-200 bg-white p-4 shadow-sm",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx("span",{className:"text-xs text-gray-400",children:s}),e.jsx("span",{className:$("rounded p-1",f),children:e.jsx(d,{className:$("h-4 w-4",o)})})]}),e.jsx("div",{className:"mt-2 text-xl font-bold text-gray-800",children:l})]},s))}),Z.length>0&&e.jsxs("div",{className:"rounded-lg border border-amber-200 bg-amber-50 px-4 py-3",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1.5",children:[e.jsx(ue,{className:"h-4 w-4 text-amber-600"}),e.jsxs("span",{className:"text-sm font-semibold text-amber-700",children:[Z.length," asset(s) warranty expiring in 90 days"]})]}),e.jsx("div",{className:"flex flex-wrap gap-1.5",children:Z.map(s=>e.jsxs("span",{className:"rounded border border-amber-200 bg-white px-2 py-0.5 text-xs text-amber-700",children:[s.asset_tag," — ",c(s.warranty_expiry).diff(c(),"day"),"d left"]},s.id))})]}),J.length>0&&e.jsxs("div",{className:"rounded-lg border border-red-200 bg-red-50 px-4 py-3",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1.5",children:[e.jsx(ge,{className:"h-4 w-4 text-red-600"}),e.jsxs("span",{className:"text-sm font-semibold text-red-700",children:[J.length," asset(s) antivirus expiring in 30 days"]})]}),e.jsx("div",{className:"flex flex-wrap gap-1.5",children:J.map(s=>e.jsxs("span",{className:"rounded border border-red-200 bg-white px-2 py-0.5 text-xs text-red-700",children:[s.asset_tag," — ",c(s.antivirus_expiry).diff(c(),"day"),"d left"]},s.id))})]}),e.jsxs("div",{className:"flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm",children:[e.jsx(as,{className:"h-4 w-4 shrink-0 text-gray-400"}),e.jsx("input",{className:"flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-gray-400",placeholder:"Search by tag, brand, model, serial, location…",value:r,onChange:s=>R(s.target.value)}),r&&e.jsx("button",{onClick:()=>R(""),children:e.jsx(te,{className:"h-4 w-4 text-gray-400 hover:text-gray-600"})})]}),e.jsxs("div",{className:"overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm",children:[e.jsxs("div",{className:"flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5",children:[e.jsxs("span",{className:"text-xs font-semibold text-gray-500 uppercase tracking-wider",children:[T.length," Asset",T.length!==1?"s":""]}),H.length>0&&e.jsxs("button",{onClick:()=>g(new Set),className:"text-xs font-semibold text-slate-500 hover:text-red-600",children:["Clear selected (",H.length,")"]})]}),e.jsx("div",{className:"overflow-x-auto",children:e.jsxs("table",{className:"w-full text-left",children:[e.jsx("thead",{children:e.jsxs("tr",{className:"border-b border-gray-100 bg-gray-50",children:[e.jsx("th",{className:"whitespace-nowrap px-4 py-3",children:e.jsx("input",{type:"checkbox",checked:pe,onChange:Ce,className:"h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500",title:"Select all filtered IT assets"})}),["Asset Tag","Type","Brand / Model","Specs","Status","Assigned To","Antivirus","Warranty","Actions"].map(s=>e.jsx("th",{className:"whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500",children:s},s))]})}),e.jsxs("tbody",{className:"divide-y divide-gray-100",children:[z&&e.jsx("tr",{children:e.jsx("td",{colSpan:10,className:"py-12 text-center",children:e.jsx(oe,{className:"mx-auto h-5 w-5 animate-spin text-gray-300"})})}),!z&&T.length===0&&e.jsx("tr",{children:e.jsxs("td",{colSpan:10,className:"py-14 text-center",children:[e.jsx(de,{className:"mx-auto mb-3 h-10 w-10 text-gray-200"}),e.jsx("p",{className:"text-sm text-gray-400",children:"No assets found"})]})}),T.map(s=>{const l=K[s.asset_type]||{label:"Other",Icon:le},{Icon:d}=l,o=s.warranty_expiry?c(s.warranty_expiry).diff(c(),"day"):null,f=s.antivirus_expiry?c(s.antivirus_expiry).diff(c(),"day"):null;return e.jsxs("tr",{className:"hover:bg-blue-50/20 transition-colors",children:[e.jsx("td",{className:"px-4 py-3",children:e.jsx("input",{type:"checkbox",checked:C.has(s.id),onChange:()=>Ie(s.id),className:"h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500",title:"Select for bulk QR print"})}),e.jsx("td",{className:"px-4 py-3",children:e.jsx("span",{className:"rounded bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700",children:s.asset_tag})}),e.jsx("td",{className:"whitespace-nowrap px-4 py-3",children:e.jsxs("div",{className:"flex items-center gap-1.5 text-xs text-gray-600",children:[e.jsx(d,{className:"h-3.5 w-3.5 text-gray-400"}),l.label]})}),e.jsxs("td",{className:"px-4 py-3",children:[e.jsxs("div",{className:"text-sm font-semibold text-gray-900",children:[s.brand," ",s.model]}),s.os&&e.jsx("div",{className:"text-xs text-gray-400",children:s.os})]}),e.jsx("td",{className:"px-4 py-3 text-xs text-gray-500",children:e.jsxs("div",{className:"flex flex-col gap-0.5",children:[s.processor&&e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx(ie,{className:"h-3 w-3"}),s.processor]}),(s.ram_gb||s.storage_gb)&&e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx(rs,{className:"h-3 w-3"}),s.ram_gb?`${s.ram_gb}GB RAM`:"",s.ram_gb&&s.storage_gb?" · ":"",s.storage_gb?`${s.storage_gb}GB`:""]}),s.ip_address&&e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx(ls,{className:"h-3 w-3"}),s.ip_address]}),!s.processor&&!s.ram_gb&&!s.ip_address&&e.jsx("span",{className:"text-gray-400",children:"—"})]})}),e.jsx("td",{className:"whitespace-nowrap px-4 py-3",children:e.jsx("span",{className:$("rounded-full px-2.5 py-0.5 text-[11px] font-semibold",ae[s.status]||ae.available),children:re[s.status]||s.status})}),e.jsxs("td",{className:"px-4 py-3 text-sm text-gray-700",children:[e.jsx("div",{className:"flex items-center gap-1",children:s.assigned_to_name?e.jsxs(e.Fragment,{children:[e.jsx(Se,{className:"h-3 w-3 text-gray-400"}),s.assigned_to_name]}):e.jsx("span",{className:"text-gray-400",children:"—"})}),s.location_description&&e.jsxs("div",{className:"text-xs text-gray-400 flex items-center gap-1 mt-0.5",children:[e.jsx(is,{className:"h-3 w-3"}),s.location_description]})]}),e.jsx("td",{className:"px-4 py-3 text-xs",children:f===null?e.jsx("span",{className:"text-gray-400",children:"—"}):f<0?e.jsx("span",{className:"text-red-600 font-semibold",children:"Expired"}):f<=30?e.jsxs("span",{className:"text-red-500 font-semibold",children:[f,"d ⚠️"]}):e.jsx("span",{className:"text-green-600",children:c(s.antivirus_expiry).format("DD MMM YY")})}),e.jsx("td",{className:"whitespace-nowrap px-4 py-3 text-xs",children:o===null?e.jsx("span",{className:"text-gray-400",children:"—"}):o<0?e.jsx("span",{className:"text-red-600 font-semibold",children:"Expired"}):o<=90?e.jsxs("span",{className:"text-amber-600 font-semibold",children:[o,"d ⚠️"]}):e.jsx("span",{className:"text-green-600",children:c(s.warranty_expiry).format("DD MMM YYYY")})}),e.jsx("td",{className:"whitespace-nowrap px-4 py-3",children:e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("button",{onClick:()=>u(s.id),title:"View details & history",className:"rounded p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors",children:e.jsx(we,{className:"h-3.5 w-3.5"})}),e.jsx("button",{onClick:()=>L(s),title:"QR code",className:"rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors",children:e.jsx(ns,{className:"h-3.5 w-3.5"})}),e.jsx("button",{onClick:()=>Pe(s),title:"Edit",className:"rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors",children:e.jsx(ds,{className:"h-3.5 w-3.5"})}),e.jsx("button",{onClick:()=>{window.confirm(`Delete ${s.asset_tag}?`)&&Q.mutate(s.id)},title:"Delete",className:"rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors",children:e.jsx(os,{className:"h-3.5 w-3.5"})})]})})]},s.id)})]})]})})]})]})]}),I&&e.jsx(fs,{assetId:I,onClose:()=>u(null)}),t&&e.jsx("div",{className:"fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm",children:e.jsxs("div",{className:"my-8 w-full max-w-3xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl",children:[e.jsxs("div",{className:"flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"flex h-8 w-8 items-center justify-center rounded bg-blue-600",children:e.jsx(ie,{className:"h-4 w-4 text-white"})}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-sm font-semibold text-gray-900",children:n?`Edit — ${n.asset_tag}`:"Add New IT Asset"}),e.jsx("p",{className:"text-xs text-gray-400",children:"Hardware details, specs, assignment"})]})]}),e.jsx("button",{onClick:me,className:"rounded p-1 text-gray-400 hover:bg-gray-100",children:e.jsx(te,{className:"h-5 w-5"})})]}),e.jsxs("form",{onSubmit:U(s=>D.mutate({...s,asset_tag:us(s.asset_tag,s.asset_type)})),className:"p-6 space-y-5",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3",children:"Identification"}),e.jsxs("div",{className:"grid grid-cols-3 gap-4",children:[e.jsx(p,{label:"Asset Tag *",children:e.jsx("input",{...i("asset_tag",{required:!0}),className:x,placeholder:"BCIM-IT-LT-001"})}),e.jsx(p,{label:"Asset Type *",children:e.jsxs("select",{...i("asset_type",{required:!0}),className:x,children:[e.jsx("option",{value:"",children:"Select type"}),ce.slice(1).map(s=>e.jsx("option",{value:s.key,children:s.label},s.key))]})}),e.jsx(p,{label:"Status",children:e.jsx("select",{...i("status"),className:x,children:fe.slice(1).map(s=>e.jsx("option",{value:s.key,children:s.label},s.key))})}),e.jsx(p,{label:"Brand *",children:e.jsx("input",{...i("brand",{required:!0}),className:x,placeholder:"Dell / HP / Lenovo"})}),e.jsx(p,{label:"Model *",children:e.jsx("input",{...i("model",{required:!0}),className:x,placeholder:"Latitude 5540"})}),e.jsx(p,{label:"Serial Number",children:e.jsx("input",{...i("serial_number"),className:x,placeholder:"SN1234567"})})]})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3",children:"Technical Specs"}),e.jsxs("div",{className:"grid grid-cols-3 gap-4",children:[e.jsx(p,{label:"OS / Firmware",children:e.jsx("input",{...i("os"),className:x,placeholder:"Windows 11 Pro"})}),e.jsx(p,{label:"Processor",children:e.jsx("input",{...i("processor"),className:x,placeholder:"i7-12th Gen"})}),e.jsx(p,{label:"RAM (GB)",children:e.jsx("input",{type:"number",...i("ram_gb"),className:x,placeholder:"16"})}),e.jsx(p,{label:"Storage (GB)",children:e.jsx("input",{type:"number",...i("storage_gb"),className:x,placeholder:"512"})}),e.jsx(p,{label:"IP Address",children:e.jsx("input",{...i("ip_address"),className:x,placeholder:"192.168.1.100"})}),e.jsx(p,{label:"MAC Address",children:e.jsx("input",{...i("mac_address"),className:x,placeholder:"00:1A:2B:3C:4D:5E"})})]})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3",children:"Purchase & Warranty"}),e.jsxs("div",{className:"grid grid-cols-3 gap-4",children:[e.jsx(p,{label:"Purchase Date",children:e.jsx("input",{type:"date",...i("purchase_date"),className:x})}),e.jsx(p,{label:"Purchase Cost (₹)",children:e.jsx("input",{type:"number",...i("purchase_cost"),className:x,placeholder:"85000"})}),e.jsx(p,{label:"Warranty Expiry",children:e.jsx("input",{type:"date",...i("warranty_expiry"),className:x})})]})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3",children:"Antivirus / Security"}),e.jsxs("div",{className:"grid grid-cols-3 gap-4",children:[e.jsx(p,{label:"Antivirus Software",children:e.jsxs("select",{...i("antivirus_status"),className:x,children:[e.jsx("option",{value:"",children:"Not Installed"}),e.jsx("option",{value:"active",children:"Active"}),e.jsx("option",{value:"expired",children:"Expired"}),e.jsx("option",{value:"not_required",children:"Not Required"})]})}),e.jsx(p,{label:"Antivirus Expiry",children:e.jsx("input",{type:"date",...i("antivirus_expiry"),className:x})})]})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3",children:"Assignment"}),e.jsxs("div",{className:"grid grid-cols-3 gap-4",children:[e.jsx(p,{label:"Assigned To (Name)",children:e.jsx("input",{...i("assigned_to_name"),className:x,placeholder:"Employee name"})}),e.jsx(p,{label:"Project",children:e.jsxs("select",{...i("location_project_id"),className:x,children:[e.jsx("option",{value:"",children:"HO / No Project"}),P.map(s=>e.jsx("option",{value:s.id,children:s.name},s.id))]})}),e.jsx(p,{label:"Location / Department",children:e.jsx("input",{...i("location_description"),className:x,placeholder:"HO - Accounts Dept"})}),e.jsx(p,{label:"Notes",span:3,children:e.jsx("textarea",{...i("notes"),className:x+" resize-none",rows:2,placeholder:"Additional notes…"})})]})]}),e.jsxs("div",{className:"flex items-center justify-end gap-3 border-t border-gray-100 pt-4",children:[e.jsx("button",{type:"button",onClick:me,className:"rounded border border-gray-200 px-4 py-2 text-sm text-slate-600 hover:bg-gray-50",children:"Cancel"}),e.jsx("button",{type:"submit",disabled:D.isPending,className:"rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50",children:D.isPending?"Saving…":n?"Update Asset":"Save Asset"})]})]})]})}),k&&e.jsx(js,{asset:k,onClose:()=>L(null)}),Oe.createPortal(e.jsx("div",{className:"bulk-it-qr-print hidden",children:e.jsx("div",{className:"bulk-it-qr-grid",children:H.map(s=>{var o;const l=((o=K[s.asset_type])==null?void 0:o.label)||"IT Asset",d=Ae(s);return e.jsxs("div",{className:"bulk-it-qr-label border-2 border-[#0f2d6b] rounded-md overflow-hidden bg-white",children:[e.jsxs("div",{className:"flex items-center gap-2 bg-[#0f2d6b] px-3 py-2",children:[e.jsx("img",{src:"/bcim-logo.png",alt:"BCIM",className:"h-7 w-7 rounded bg-white object-contain p-1"}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("div",{className:"text-[10px] font-black uppercase tracking-wide text-white",children:"BCIM Engineering Pvt Ltd"}),e.jsx("div",{className:"text-[8px] font-bold text-white/75",children:"IT Asset Management"})]}),e.jsx("div",{className:"rounded bg-white px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#0f2d6b]",children:"IT ASSET"})]}),e.jsxs("div",{className:"grid grid-cols-[45mm_1fr] min-h-[51mm]",children:[e.jsxs("div",{className:"flex flex-col items-center justify-center gap-1 border-r-2 border-dashed border-blue-200 bg-[#eef2ff] p-2",children:[e.jsx("div",{className:"rounded bg-white p-1 shadow",children:e.jsx(ye,{value:gs(s),size:148,includeMargin:!1,fgColor:"#0f2d6b",level:"M"})}),e.jsx("div",{className:"text-[8px] font-bold uppercase tracking-widest text-slate-600",children:"Scan to identify"})]}),e.jsxs("div",{className:"flex min-w-0 flex-col justify-center gap-1 px-3 py-2",children:[e.jsx("div",{className:"font-mono text-[15px] font-black leading-none tracking-wide text-[#0f2d6b] break-all",children:s.asset_tag||"-"}),e.jsx("div",{className:"text-[10px] font-black text-slate-950 break-words",children:d}),e.jsx("div",{className:"text-[8px] font-bold uppercase tracking-wide text-slate-600",children:l}),e.jsx("div",{className:"my-1 border-t border-slate-300"}),e.jsxs("div",{className:"grid grid-cols-[24mm_1fr] gap-y-1 text-[8px]",children:[e.jsx("span",{className:"font-black uppercase text-slate-500",children:"Company"}),e.jsx("span",{className:"font-bold text-slate-900",children:"BCIM Engineering Pvt Ltd"}),e.jsx("span",{className:"font-black uppercase text-slate-500",children:"Serial No"}),e.jsx("span",{className:"font-bold text-slate-900 break-all",children:s.serial_number||"-"}),e.jsx("span",{className:"font-black uppercase text-slate-500",children:"Asset ID"}),e.jsx("span",{className:"font-bold text-slate-900 break-all",children:s.asset_tag||"-"})]})]})]}),e.jsxs("div",{className:"flex justify-between bg-[#0f2d6b] px-3 py-1 text-[7px] font-bold text-white/80",children:[e.jsx("span",{children:"Scan QR to view IT asset details"}),e.jsx("span",{children:"Property of BCIM Engineering Pvt Ltd"})]})]},s.id)})})}),document.body)]})}function fs({assetId:t,onClose:h}){var y,S,C,g;const n=je(),[m,I]=v.useState(!1),[u,k]=v.useState({issue_type:"repair",description:"",vendor:"",cost:"",technician:""}),{data:L,isLoading:N}=ne({queryKey:["it-asset-detail",t],queryFn:()=>Y.get(t).then(a=>{var i;return(i=a.data)==null?void 0:i.data})}),E=()=>{n.invalidateQueries({queryKey:["it-assets"]}),n.invalidateQueries({queryKey:["it-asset-detail",t]})},w=se({mutationFn:a=>Y.addMaintenance(t,a),onSuccess:()=>{j.success("Maintenance logged"),E(),I(!1),k({issue_type:"repair",description:"",vendor:"",cost:"",technician:""})},onError:a=>{var i,U;return j.error(((U=(i=a==null?void 0:a.response)==null?void 0:i.data)==null?void 0:U.error)||"Failed")}}),F=se({mutationFn:({mid:a})=>Y.closeMaintenance(t,a,{}),onSuccess:()=>{j.success("Maintenance closed — asset set to Available"),E()}}),r=L,R=r?K[r.asset_type]||{label:"Other",Icon:le}:null;return e.jsxs("div",{className:"fixed inset-0 z-[100] flex",children:[e.jsx("div",{className:"flex-1 bg-black/30 backdrop-blur-sm",onClick:h}),e.jsxs("div",{className:"w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden",children:[e.jsxs("div",{className:"flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#0f2d6b] to-[#1a56db]",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[R&&e.jsx(R.Icon,{className:"h-5 w-5 text-white"}),e.jsxs("div",{children:[e.jsx("p",{className:"font-mono font-semibold text-white",children:(r==null?void 0:r.asset_tag)||"Loading…"}),e.jsxs("p",{className:"text-xs text-blue-200",children:[r==null?void 0:r.brand," ",r==null?void 0:r.model]})]})]}),e.jsx("button",{onClick:h,className:"text-blue-200 hover:text-white",children:e.jsx(te,{className:"h-5 w-5"})})]}),e.jsx("div",{className:"flex-1 overflow-y-auto p-5 space-y-5",children:N?e.jsx("div",{className:"flex items-center justify-center py-12",children:e.jsx(oe,{className:"h-5 w-5 animate-spin text-gray-300"})}):r?e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"grid grid-cols-3 gap-3",children:[{label:"Status",value:e.jsx("span",{className:$("rounded-full px-2 py-0.5 text-[11px] font-semibold",ae[r.status]||ae.available),children:re[r.status]||r.status})},{label:"Assigned",value:r.assigned_to_name||"—"},{label:"Location",value:r.location_description||r.project_name||"—"},{label:"OS",value:r.os||"—"},{label:"Processor",value:r.processor||"—"},{label:"RAM / SSD",value:`${r.ram_gb?r.ram_gb+"GB RAM":"—"} / ${r.storage_gb?r.storage_gb+"GB":"—"}`},{label:"IP Address",value:r.ip_address||"—"},{label:"Serial No.",value:r.serial_number||"—"},{label:"Purchase",value:r.purchase_cost?`₹${Number(r.purchase_cost).toLocaleString("en-IN")}`:"—"}].map(({label:a,value:i})=>e.jsxs("div",{className:"bg-slate-50 rounded-lg p-2.5",children:[e.jsx("p",{className:"text-[10px] text-slate-400 font-medium uppercase tracking-wide",children:a}),e.jsx("div",{className:"text-xs font-semibold text-slate-800 mt-0.5",children:i})]},a))}),e.jsxs("div",{className:"rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-4",children:[e.jsxs("div",{className:"mb-3 flex items-center justify-between gap-3",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-bold uppercase tracking-wide text-blue-900",children:"IT Asset Handover Documents"}),e.jsx("p",{className:"text-[11px] font-medium text-slate-500",children:"Attach handover form, acknowledgement, warranty card, invoice copy, or user declaration for this asset only."})]}),e.jsx(_e,{className:"h-5 w-5 shrink-0 text-blue-600"})]}),e.jsx(ps,{module:"it_asset_handover",recordId:r.id,projectId:r.location_project_id,label:"Handover Form / Documents"})]}),e.jsxs("div",{children:[e.jsxs("p",{className:"flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2",children:[e.jsx(cs,{className:"h-3.5 w-3.5"})," Assignment History (",((y=r.history)==null?void 0:y.length)||0,")"]}),((S=r.history)==null?void 0:S.length)>0?e.jsx("div",{className:"space-y-1.5",children:r.history.map(a=>e.jsxs("div",{className:"flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 text-xs",children:[e.jsx(Se,{className:"h-3.5 w-3.5 text-slate-400 shrink-0"}),e.jsxs("div",{className:"flex-1",children:[e.jsx("span",{className:"font-semibold text-slate-800",children:a.assigned_to_name||"Unknown"}),a.location&&e.jsxs("span",{className:"text-slate-400 ml-1",children:["— ",a.location]})]}),e.jsxs("div",{className:"text-slate-400 text-right",children:[e.jsx("div",{children:c(a.assigned_at).format("DD MMM YYYY")}),a.returned_at&&e.jsxs("div",{className:"text-emerald-600",children:["↩ ",c(a.returned_at).format("DD MMM YYYY")]}),!a.returned_at&&e.jsx("div",{className:"text-blue-600",children:"Current"})]})]},a.id))}):e.jsx("p",{className:"text-xs text-slate-400 text-center py-3",children:"No assignment history"})]}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center justify-between mb-2",children:[e.jsxs("p",{className:"flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide",children:[e.jsx(xs,{className:"h-3.5 w-3.5"})," Maintenance (",((C=r.maintenance)==null?void 0:C.length)||0,")"]}),e.jsxs("button",{onClick:()=>I(a=>!a),className:"text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1",children:[e.jsx(ke,{className:"h-3 w-3"})," Log Issue"]})]}),m&&e.jsxs("div",{className:"bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3 space-y-3",children:[e.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[e.jsxs("div",{children:[e.jsx("label",{className:"text-[10px] text-slate-500 mb-0.5 block",children:"Issue Type"}),e.jsxs("select",{value:u.issue_type,onChange:a=>k(i=>({...i,issue_type:a.target.value})),className:"w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400 bg-white",children:[e.jsx("option",{value:"repair",children:"Repair"}),e.jsx("option",{value:"preventive",children:"Preventive Maintenance"}),e.jsx("option",{value:"upgrade",children:"Upgrade"}),e.jsx("option",{value:"software",children:"Software Issue"})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"text-[10px] text-slate-500 mb-0.5 block",children:"Technician"}),e.jsx("input",{value:u.technician,onChange:a=>k(i=>({...i,technician:a.target.value})),className:"w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400 bg-white",placeholder:"Tech name"})]}),e.jsxs("div",{className:"col-span-2",children:[e.jsx("label",{className:"text-[10px] text-slate-500 mb-0.5 block",children:"Description *"}),e.jsx("input",{value:u.description,onChange:a=>k(i=>({...i,description:a.target.value})),className:"w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400 bg-white",placeholder:"Describe the issue…"})]})]}),e.jsxs("div",{className:"flex gap-2 justify-end",children:[e.jsx("button",{onClick:()=>I(!1),className:"px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-white",children:"Cancel"}),e.jsx("button",{onClick:()=>u.description.trim()?w.mutate(u):j.error("Description required"),className:"px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700",children:"Log Issue"})]})]}),((g=r.maintenance)==null?void 0:g.length)>0?e.jsx("div",{className:"space-y-1.5",children:r.maintenance.map(a=>{var i;return e.jsxs("div",{className:"bg-slate-50 rounded-lg px-3 py-2 text-xs",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx("span",{className:"font-semibold text-slate-800 capitalize",children:(i=a.issue_type)==null?void 0:i.replace("_"," ")}),e.jsx("span",{className:$("px-1.5 py-0.5 rounded-full text-[10px] font-medium",a.status==="closed"?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"),children:a.status})]}),e.jsx("p",{className:"text-slate-600 mt-0.5",children:a.description}),e.jsxs("div",{className:"flex items-center justify-between mt-1",children:[e.jsxs("span",{className:"text-slate-400",children:[c(a.start_date||a.created_at).format("DD MMM YYYY"),a.technician?` · ${a.technician}`:""]}),a.status!=="closed"&&e.jsxs("button",{onClick:()=>F.mutate({mid:a.id}),className:"text-emerald-600 hover:text-emerald-800 flex items-center gap-1",children:[e.jsx(Ne,{className:"h-3 w-3"})," Close"]})]})]},a.id)})}):!m&&e.jsx("p",{className:"text-xs text-slate-400 text-center py-3",children:"No maintenance records"})]})]}):e.jsx("p",{className:"text-sm text-gray-400 text-center py-12",children:"Asset not found"})})]})]})}function js({asset:t,onClose:h}){var L;const n=((L=K[t.asset_type])==null?void 0:L.label)||"IT Asset",m=`${t.brand||""} ${t.model||""}`.trim()||t.asset_tag,{Icon:I}=K[t.asset_type]||{Icon:le},u=t.warranty_expiry?c(t.warranty_expiry).diff(c(),"day"):null,k=[{label:"Asset Tag",value:t.asset_tag},{label:"Type",value:n},{label:"Brand/Model",value:`${t.brand||"—"} ${t.model||""}`},{label:"Serial No.",value:t.serial_number||"—"},{label:"OS",value:t.os||"—"},{label:"Processor",value:t.processor||"—"},{label:"RAM",value:t.ram_gb?`${t.ram_gb} GB`:"—"},{label:"Storage",value:t.storage_gb?`${t.storage_gb} GB`:"—"},{label:"IP Address",value:t.ip_address||"—"},{label:"Status",value:re[t.status]||t.status||"—"},{label:"Assigned To",value:t.assigned_to_name||"—"},{label:"Location",value:t.location_description||"—"},{label:"Purchased",value:t.purchase_date?c(t.purchase_date).format("DD MMM YYYY"):"—"},{label:"Cost",value:t.purchase_cost?`₹${Number(t.purchase_cost).toLocaleString("en-IN")}`:"—"},{label:"Warranty",value:u===null?"—":u<0?`Expired (${Math.abs(u)}d)`:`${c(t.warranty_expiry).format("DD MMM YYYY")} (${u}d)`},{label:"Antivirus",value:t.antivirus_status||"—"}];return e.jsx("div",{className:"fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm",children:e.jsxs("div",{className:"w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl",children:[e.jsxs("div",{className:"flex items-center justify-between border-b border-gray-100 px-6 py-4",style:{background:"linear-gradient(135deg, #0f2d6b 0%, #1a56db 100%)"},children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"flex h-10 w-10 items-center justify-center rounded-xl bg-white/15",children:e.jsx(I,{className:"h-5 w-5 text-white"})}),e.jsxs("div",{children:[e.jsx("h2",{className:"font-mono text-lg font-semibold tracking-wider text-white",children:t.asset_tag}),e.jsxs("p",{className:"text-xs text-blue-200",children:[m," · ",n]})]})]}),e.jsx("button",{onClick:h,className:"rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition",children:e.jsx(te,{className:"h-5 w-5"})})]}),e.jsxs("div",{className:"grid lg:grid-cols-[520px_minmax(360px,1fr)]",children:[e.jsxs("div",{className:"border-r border-gray-100 bg-slate-50 p-5",children:[e.jsx("p",{className:"mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400",children:"Asset Label"}),e.jsx(bs,{value:t.asset_tag,title:m,subtitle:n,metaLabel:"Asset Tag",metaValue:t.asset_tag,size:140,assetId:t.asset_tag,serialNumber:t.serial_number,labelType:"IT ASSET",labelSubtitle:"IT Asset Management",extraFields:[{label:"Serial",value:t.serial_number},{label:"Status",value:re[t.status]||t.status},{label:"IP",value:t.ip_address},{label:"Assigned",value:t.assigned_to_name}]})]}),e.jsxs("div",{className:"max-h-[70vh] overflow-y-auto p-5",children:[e.jsx("p",{className:"mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400",children:"Specifications"}),e.jsx("div",{className:"space-y-1",children:k.map(({label:N,value:E})=>e.jsxs("div",{className:"grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 rounded-lg px-3 py-2 odd:bg-gray-50",children:[e.jsx("span",{className:"text-[10px] font-semibold uppercase tracking-wider text-slate-400 pt-0.5",children:N}),e.jsx("span",{className:"min-w-0 whitespace-normal break-words text-xs font-semibold leading-5 text-gray-800",children:E})]},N))})]})]})]})})}export{Is as default};
