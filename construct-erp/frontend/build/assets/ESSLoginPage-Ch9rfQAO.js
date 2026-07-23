import{r as n,u as M,j as e}from"./vendor-react-C3P8e1DV.js";import{n as j}from"./vendor-ui-BL8pBBi4.js";import{u as E,a as S}from"./index-BRq8-xqk.js";import"./vendor-data-693MZDSQ.js";import"./vendor-icons-ChManIqH.js";import"./vendor-forms-gVMGBE4b.js";function R(){const[c,s]=n.useState(""),[t,i]=n.useState(""),[d,w]=n.useState(!1),[y,g]=n.useState(!1),[m,p]=n.useState(""),[h,b]=n.useState(!1),[x,v]=n.useState(""),{login:k,user:f}=E(),u=M();n.useEffect(()=>{f&&u("/",{replace:!0})},[f,u]);async function N(a){a.preventDefault(),b(!0),v("");const l=await k(c,t);b(!1),l.success||v(l.error||"Invalid credentials. Please try again.")}async function F(){var a,l;if(m.trim())try{const{data:o}=await S.forgotPassword({email:m});j.success((o==null?void 0:o.message)||"Reset link sent — check your inbox"),g(!1),p("")}catch(o){j.error(((l=(a=o==null?void 0:o.response)==null?void 0:a.data)==null?void 0:l.error)||"Failed to send reset link")}}const z=new Date().getFullYear();return e.jsxs("div",{className:"bcim-login",children:[e.jsx("style",{children:C}),e.jsxs("div",{className:"page",children:[e.jsxs("header",{className:"topbar",children:[e.jsx("img",{className:"brand-img",src:"/bcim-logo.png",alt:"BCIM Engineering"}),e.jsx("span",{className:"brand-divider"}),e.jsx("span",{className:"brand-sub",children:"Employee Self Service"})]}),e.jsxs("div",{className:"main",children:[e.jsxs("section",{className:"login-card",children:[e.jsx("div",{className:"card-badge",children:"ESS Portal"}),e.jsxs("h1",{className:"greeting",children:["Hello there! ",e.jsx("span",{className:"wave",children:"👋"})]}),e.jsx("p",{className:"greeting-sub",children:"Sign in with your employee credentials to continue."}),x&&e.jsxs("div",{className:"error-banner",children:[e.jsx(r,{name:"alert",size:16}),e.jsx("span",{children:x})]}),e.jsxs("form",{onSubmit:N,noValidate:!0,children:[e.jsxs("div",{className:"field",children:[e.jsx("label",{htmlFor:"loginId",children:"Login ID"}),e.jsxs("div",{className:"input-wrap",children:[e.jsx(r,{name:"user",size:16,className:"field-icon"}),e.jsx("input",{id:"loginId",type:"text",placeholder:"Employee No / Email",autoComplete:"username",value:c,onChange:a=>s(a.target.value),required:!0})]})]}),e.jsxs("div",{className:"field",style:{marginBottom:"0.5rem"},children:[e.jsx("label",{htmlFor:"password",children:"Password"}),e.jsxs("div",{className:"input-wrap",children:[e.jsx(r,{name:"lock",size:16,className:"field-icon"}),e.jsx("input",{id:"password",type:d?"text":"password",placeholder:"Enter your password",autoComplete:"current-password",value:t,onChange:a=>i(a.target.value),required:!0}),e.jsx("button",{type:"button",className:"pw-toggle","aria-label":d?"Hide password":"Show password",onClick:()=>w(a=>!a),children:e.jsx(r,{name:d?"eyeOff":"eye",size:16})})]})]}),e.jsx("div",{className:"forgot-row",children:e.jsx("button",{type:"button",className:"forgot-link",onClick:()=>g(a=>!a),children:"Forgot password?"})}),e.jsx("button",{type:"submit",className:"btn-signin",disabled:h,children:h?e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"Signing in…"}),e.jsx(r,{name:"spinner",size:18,className:"spin"})]}):e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"Login"}),e.jsx(r,{name:"arrow",size:16})]})})]}),y&&e.jsxs("div",{className:"forgot-panel",children:[e.jsx("div",{className:"divider",children:"reset your password"}),e.jsxs("div",{className:"field",children:[e.jsx("label",{htmlFor:"resetEmail",children:"Registered Email"}),e.jsxs("div",{className:"input-wrap",children:[e.jsx(r,{name:"mail",size:16,className:"field-icon"}),e.jsx("input",{id:"resetEmail",type:"email",placeholder:"Enter registered email",value:m,onChange:a=>p(a.target.value)})]})]}),e.jsx("button",{type:"button",className:"btn-signin",style:{background:"#0F172A",boxShadow:"none",marginTop:"0.25rem"},onClick:F,children:"Send Reset Link"})]}),e.jsxs("div",{className:"card-foot",children:[e.jsx("span",{children:"Need access? "}),e.jsx("a",{href:"mailto:hr@bcim.in",children:"Contact HR at hr@bcim.in"})]})]}),e.jsxs("aside",{className:"promo",children:[e.jsxs("div",{className:"promo-eyebrow",children:["BCIM ",e.jsx("b",{children:"ESS Portal"})]}),e.jsxs("h2",{className:"promo-title",children:["Everything HR, ",e.jsx("em",{children:"one login away."})]}),e.jsxs("div",{className:"flow",children:[e.jsx("div",{className:"flow-col-head before",children:"The Old Way"}),e.jsx("div",{}),e.jsx("div",{className:"flow-col-head after",children:"With BCIM ESS"}),e.jsxs("div",{className:"steps",children:[e.jsxs("div",{className:"step tall",children:[e.jsx(r,{name:"file",size:14})," Paper leave form"]}),e.jsxs("div",{className:"step tall",children:[e.jsx(r,{name:"check",size:14})," Manager sign-off"]}),e.jsxs("div",{className:"step tall",children:[e.jsx(r,{name:"calendar",size:14})," Wait for HR"]}),e.jsxs("div",{className:"step tall",children:[e.jsx(r,{name:"chat",size:14})," Chase payslip"]})]}),e.jsx("div",{className:"flow-arrow",children:e.jsx(r,{name:"bigArrow",size:28})}),e.jsxs("div",{className:"steps",children:[e.jsxs("div",{className:"step highlight",children:[e.jsx(r,{name:"bolt",size:14})," Apply leave in-app"]}),e.jsxs("div",{className:"step done",children:[e.jsx(r,{name:"badgeCheck",size:14})," Instant approval"]}),e.jsxs("div",{className:"step done",children:[e.jsx(r,{name:"badgeCheck",size:14})," Payslip ready"]})]})]}),e.jsxs("div",{className:"chips",children:[e.jsxs("span",{className:"chip",children:[e.jsx(r,{name:"calendar",size:13})," Attendance & Leave"]}),e.jsxs("span",{className:"chip a",children:[e.jsx(r,{name:"file",size:13})," Payslips & Docs"]}),e.jsxs("span",{className:"chip v",children:[e.jsx(r,{name:"badgeCheck",size:13})," HR Requests"]})]}),e.jsx("div",{className:"promo-cta",children:e.jsxs("div",{className:"meta",children:[e.jsxs("span",{className:"m",children:[e.jsx(r,{name:"calendar",size:14})," Available 24 / 7"]}),e.jsx("span",{className:"sep",children:"|"}),e.jsxs("span",{className:"m",children:[e.jsx(r,{name:"clock",size:14})," Real-time sync"]})]})})]})]}),e.jsxs("footer",{className:"footer",children:["© ",z," BCIM Engineering Private Limited",e.jsx("span",{className:"dot",children:"·"}),e.jsx("a",{href:"#",children:"Privacy Policy"}),e.jsx("span",{className:"dot",children:"·"}),e.jsx("a",{href:"#",children:"Terms of Service"}),e.jsx("span",{className:"dot",children:"·"}),"BCIM Construct ERP v3.0"]})]})]})}function r({name:c,size:s=16,className:t=""}){const i={width:s,height:s,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",className:t};switch(c){case"user":return e.jsx("svg",{...i,children:e.jsx("path",{d:"M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"})});case"lock":return e.jsxs("svg",{...i,children:[e.jsx("rect",{x:"3",y:"11",width:"18",height:"11",rx:"2"}),e.jsx("path",{d:"M7 11V7a5 5 0 0110 0v4"})]});case"mail":return e.jsx("svg",{...i,children:e.jsx("path",{d:"M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"})});case"eye":return e.jsxs("svg",{...i,children:[e.jsx("path",{d:"M15 12a3 3 0 11-6 0 3 3 0 016 0z"}),e.jsx("path",{d:"M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"})]});case"eyeOff":return e.jsx("svg",{...i,children:e.jsx("path",{d:"M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"})});case"arrow":return e.jsx("svg",{...i,strokeWidth:2.5,children:e.jsx("path",{d:"M5 12h14M12 5l7 7-7 7"})});case"bigArrow":return e.jsx("svg",{width:s,height:s*.8,viewBox:"0 0 30 24",fill:"none",stroke:"currentColor",strokeWidth:2.5,strokeLinecap:"round",strokeLinejoin:"round",className:t,children:e.jsx("path",{d:"M2 12h24M18 4l8 8-8 8"})});case"spinner":return e.jsx("svg",{...i,strokeWidth:2.5,children:e.jsx("path",{d:"M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"})});case"alert":return e.jsxs("svg",{...i,children:[e.jsx("circle",{cx:"12",cy:"12",r:"10"}),e.jsx("path",{d:"M12 8v4m0 4h.01"})]});case"file":return e.jsxs("svg",{...i,children:[e.jsx("path",{d:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"}),e.jsx("path",{d:"M14 2v6h6"})]});case"check":return e.jsx("svg",{...i,children:e.jsx("path",{d:"M20 6L9 17l-5-5"})});case"calendar":return e.jsxs("svg",{...i,children:[e.jsx("rect",{x:"3",y:"4",width:"18",height:"18",rx:"2"}),e.jsx("path",{d:"M16 2v4M8 2v4M3 10h18"})]});case"chat":return e.jsx("svg",{...i,children:e.jsx("path",{d:"M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"})});case"bolt":return e.jsx("svg",{...i,children:e.jsx("path",{d:"M13 2L3 14h7l-1 8 10-12h-7z"})});case"badgeCheck":return e.jsxs("svg",{...i,children:[e.jsx("path",{d:"M9 12l2 2 4-4"}),e.jsx("path",{d:"M21 12a9 9 0 11-18 0 9 9 0 0118 0z"})]});case"clock":return e.jsxs("svg",{...i,children:[e.jsx("circle",{cx:"12",cy:"12",r:"10"}),e.jsx("path",{d:"M12 6v6l4 2"})]});default:return null}}const C=`
.bcim-login {
  --navy:#0F172A; --navy-600:#334155; --navy-400:#64748B; --navy-300:#94A3B8;
  --navy-200:#CBD5E1; --navy-100:#E2E8F0; --bg:#F1F5F9;
  --blue:#2563EB; --blue-dark:#1D4ED8; --blue-light:#EFF6FF;
  --amber:#F59E0B; --violet:#7C3AED; --white:#FFFFFF; --red:#E03131; --green:#16A34A;
  --font:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Roboto,sans-serif;
  font-family:var(--font); color:var(--navy); -webkit-font-smoothing:antialiased;
}
.bcim-login *,.bcim-login *::before,.bcim-login *::after { box-sizing:border-box; margin:0; padding:0; }
.bcim-login .page {
  min-height:100vh; display:flex; flex-direction:column;
  background:
    radial-gradient(1200px 500px at 85% -5%, rgba(124,58,237,0.07), transparent 60%),
    radial-gradient(900px 500px at 10% 110%, rgba(37,99,235,0.06), transparent 60%),
    var(--bg);
}
.bcim-login .topbar { padding:1.5rem 2.5rem; display:flex; align-items:center; gap:0.85rem; }
.bcim-login .brand-img { height:40px; width:auto; display:block; flex-shrink:0; }
.bcim-login .brand-divider { width:1px; height:26px; background:var(--navy-200); flex-shrink:0; }
.bcim-login .brand-sub { font-size:0.6875rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--blue); }

.bcim-login .main {
  flex:1; display:grid; grid-template-columns:1fr 1.15fr; gap:2rem; align-items:center;
  padding:0.5rem 3.5rem 2rem; max-width:1240px; width:100%; margin:0 auto;
}

.bcim-login .login-card {
  background:var(--white); border:1px solid var(--navy-100); border-radius:22px;
  padding:2.75rem 2.5rem 2.5rem;
  box-shadow:0 20px 50px -20px rgba(15,23,42,0.2),0 2px 8px rgba(15,23,42,0.04);
  max-width:430px; width:100%; margin:0 auto;
}
.bcim-login .card-badge {
  display:inline-flex; align-items:center; gap:0.4rem; padding:0.3rem 0.75rem;
  background:var(--blue-light); border:1px solid #BFDBFE; border-radius:99px;
  font-size:0.6875rem; font-weight:700; color:var(--blue);
  letter-spacing:0.08em; text-transform:uppercase; margin-bottom:1.5rem;
}
.bcim-login .card-badge::before {
  content:''; width:6px; height:6px; border-radius:50%; background:var(--blue);
  animation:bcim-pulse 2s ease-in-out infinite;
}
@keyframes bcim-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,.4)} 50%{box-shadow:0 0 0 5px rgba(37,99,235,0)} }
.bcim-login .greeting { font-size:1.75rem; font-weight:800; letter-spacing:-0.03em; margin-bottom:0.375rem; }
.bcim-login .wave { display:inline-block; animation:bcim-wave 2.4s ease-in-out infinite; transform-origin:70% 70%; }
@keyframes bcim-wave { 0%,60%,100%{transform:rotate(0)} 10%{transform:rotate(14deg)} 20%{transform:rotate(-8deg)} 30%{transform:rotate(14deg)} 40%{transform:rotate(-4deg)} 50%{transform:rotate(10deg)} }
.bcim-login .greeting-sub { font-size:0.875rem; color:var(--navy-400); margin-bottom:1.75rem; }

.bcim-login .error-banner {
  display:flex; align-items:center; gap:0.625rem; padding:0.75rem 1rem;
  background:#FFF5F5; border:1px solid #FED7D7; border-radius:10px;
  font-size:0.8125rem; color:var(--red); font-weight:500; margin-bottom:1.25rem;
}
.bcim-login .field { margin-bottom:1.125rem; }
.bcim-login .field label { display:block; font-size:0.75rem; font-weight:700; color:var(--navy-600); margin-bottom:0.5rem; }
.bcim-login .input-wrap { position:relative; }
.bcim-login .field-icon { position:absolute; left:0.9rem; top:50%; transform:translateY(-50%); color:var(--navy-300); pointer-events:none; transition:color 0.2s; }
.bcim-login .input-wrap:focus-within .field-icon { color:var(--blue); }
.bcim-login .input-wrap input {
  width:100%; padding:0.85rem 1rem 0.85rem 2.6rem; border:1.5px solid var(--navy-200);
  border-radius:11px; font-size:0.9375rem; font-family:var(--font); color:var(--navy);
  background:var(--white); outline:none; transition:border-color 0.2s,box-shadow 0.2s;
}
.bcim-login .input-wrap input::placeholder { color:var(--navy-300); }
.bcim-login .input-wrap input:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(37,99,235,0.12); }
.bcim-login .pw-toggle {
  position:absolute; right:0.875rem; top:50%; transform:translateY(-50%); background:none;
  border:none; cursor:pointer; color:var(--navy-400); display:flex; align-items:center;
  padding:4px; border-radius:4px; transition:color 0.15s;
}
.bcim-login .pw-toggle:hover { color:var(--navy); }
.bcim-login .forgot-row { display:flex; justify-content:flex-end; margin:-0.25rem 0 0.25rem; }
.bcim-login .forgot-link { background:none; border:none; cursor:pointer; font-family:var(--font); font-size:0.75rem; font-weight:600; color:var(--blue); transition:color 0.15s; }
.bcim-login .forgot-link:hover { color:var(--blue-dark); text-decoration:underline; }

.bcim-login .btn-signin {
  width:100%; margin-top:1.25rem; padding:0.9rem 1.5rem; background:var(--blue); color:var(--white);
  border:none; border-radius:11px; font-size:0.9375rem; font-weight:700; font-family:var(--font);
  cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.5rem;
  transition:background 0.2s,transform 0.15s,box-shadow 0.2s; box-shadow:0 8px 20px -6px rgba(37,99,235,0.5);
}
.bcim-login .btn-signin:hover { background:var(--blue-dark); transform:translateY(-1px); box-shadow:0 12px 26px -6px rgba(37,99,235,0.55); }
.bcim-login .btn-signin:active { transform:none; }
.bcim-login .btn-signin:disabled { opacity:0.75; cursor:default; transform:none; }
.bcim-login .spin { animation:bcim-spin .75s linear infinite; }
@keyframes bcim-spin { to { transform:rotate(360deg); } }

.bcim-login .card-foot { margin-top:1.75rem; padding-top:1.25rem; border-top:1px solid var(--navy-100); text-align:center; }
.bcim-login .card-foot span { font-size:0.75rem; color:var(--navy-400); }
.bcim-login .card-foot a { font-size:0.75rem; font-weight:700; color:var(--blue); text-decoration:none; }
.bcim-login .card-foot a:hover { text-decoration:underline; }

.bcim-login .forgot-panel { margin-top:0.5rem; }
.bcim-login .divider { display:flex; align-items:center; gap:0.75rem; margin:1.5rem 0 1.25rem; color:var(--navy-300); font-size:0.6875rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
.bcim-login .divider::before,.bcim-login .divider::after { content:''; flex:1; height:1px; background:var(--navy-100); }

.bcim-login .promo {
  background:linear-gradient(160deg,#F5F3FF 0%,#EFF6FF 55%,#FFFFFF 100%);
  border:1px solid var(--navy-100); border-radius:24px; padding:2.5rem 2.75rem;
  position:relative; overflow:hidden; box-shadow:0 20px 50px -24px rgba(37,99,235,0.25);
}
.bcim-login .promo::after {
  content:''; position:absolute; top:-60px; right:-60px; width:240px; height:240px; border-radius:50%;
  background:radial-gradient(circle,rgba(124,58,237,0.12),transparent 70%); pointer-events:none;
}
.bcim-login .promo-eyebrow { font-size:0.8125rem; font-weight:800; color:var(--navy-600); margin-bottom:0.375rem; }
.bcim-login .promo-eyebrow b { color:var(--violet); }
.bcim-login .promo-title { font-size:1.875rem; font-weight:800; letter-spacing:-0.03em; line-height:1.15; margin-bottom:1.75rem; }
.bcim-login .promo-title em { font-style:normal; color:var(--blue); }

.bcim-login .flow { display:grid; grid-template-columns:1fr auto 1fr; gap:0.5rem 1.25rem; align-items:start; margin-bottom:1.75rem; }
.bcim-login .flow-col-head { font-size:0.625rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; margin-bottom:0.75rem; text-align:center; }
.bcim-login .flow-col-head.before { color:var(--navy-300); }
.bcim-login .flow-col-head.after { color:var(--violet); }
.bcim-login .steps { display:flex; flex-direction:column; gap:0.5rem; }
.bcim-login .step { display:flex; align-items:center; gap:0.5rem; background:rgba(255,255,255,0.75); border:1px solid var(--navy-100); border-radius:10px; padding:0.5rem 0.7rem; font-size:0.75rem; font-weight:600; color:var(--navy-600); }
.bcim-login .step svg { flex-shrink:0; color:var(--navy-300); }
.bcim-login .step.tall { opacity:0.85; }
.bcim-login .step.highlight { background:var(--white); border:1.5px solid #DDD6FE; color:var(--navy); box-shadow:0 6px 16px -6px rgba(124,58,237,0.35); }
.bcim-login .step.highlight svg { color:var(--violet); }
.bcim-login .step.done svg { color:var(--green); }
.bcim-login .flow-arrow { grid-row:2/3; align-self:center; display:flex; align-items:center; justify-content:center; color:var(--violet); padding-top:1.5rem; }

.bcim-login .chips { display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:1.75rem; }
.bcim-login .chip { display:inline-flex; align-items:center; gap:0.4rem; background:var(--white); border:1px solid var(--navy-100); border-radius:99px; padding:0.4rem 0.85rem; font-size:0.75rem; font-weight:700; color:var(--navy-600); }
.bcim-login .chip svg { color:var(--blue); }
.bcim-login .chip.v svg { color:var(--violet); }
.bcim-login .chip.a svg { color:var(--amber); }

.bcim-login .promo-cta { display:flex; align-items:center; gap:1rem; padding-top:1.25rem; border-top:1px dashed var(--navy-200); }
.bcim-login .promo-cta .meta { display:flex; align-items:center; gap:0.9rem; font-size:0.8125rem; font-weight:600; color:var(--navy-600); }
.bcim-login .promo-cta .m { display:inline-flex; align-items:center; gap:0.35rem; }
.bcim-login .promo-cta .m svg { color:var(--blue); }
.bcim-login .promo-cta .sep { color:var(--navy-200); }

.bcim-login .footer { text-align:center; padding:1.25rem; font-size:0.6875rem; color:var(--navy-400); }
.bcim-login .footer a { color:var(--navy-400); text-decoration:none; }
.bcim-login .footer a:hover { color:var(--blue); }
.bcim-login .footer .dot { margin:0 0.4rem; color:var(--navy-200); }

@media (max-width:960px) {
  .bcim-login .main { grid-template-columns:1fr; padding:0.5rem 1.5rem 2rem; gap:1.5rem; }
  .bcim-login .promo { order:2; }
  .bcim-login .login-card { order:1; }
}
@media (max-width:560px) {
  .bcim-login .topbar { padding:1.25rem 1.5rem; }
  .bcim-login .login-card { padding:2rem 1.5rem; }
  .bcim-login .promo { padding:1.75rem 1.5rem; }
  .bcim-login .promo-title { font-size:1.5rem; }
  .bcim-login .flow { gap:0.4rem 0.6rem; }
  .bcim-login .promo-cta { flex-direction:column; align-items:flex-start; gap:0.75rem; }
}
@media (prefers-reduced-motion:reduce) {
  .bcim-login .wave,.bcim-login .card-badge::before,.bcim-login .spin { animation:none; }
}
`;export{R as default};
