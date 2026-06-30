// src/pages/tqs/TQSPaymentCertPrint.jsx
// BCIM Payment Certificate — guaranteed A4 single-page fit
import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { tqsBillsAPI } from '../../api/client';

const getPublicAppOrigin = () => {
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL || import.meta.env?.VITE_APP_URL || import.meta.env?.VITE_APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://bcim.ddns.net:3000';
  return window.location.origin;
};

const nv   = (v) => parseFloat(v || 0);
const inr  = (v) => nv(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function numToWords(n) {
  if (!n || n === 0) return 'Zero Rupees Only';
  const c = (num) => {
    if (num === 0) return '';
    if (num < 20)       return ones[num];
    if (num < 100)      return tens[Math.floor(num/10)] + (num%10?' '+ones[num%10]:'');
    if (num < 1000)     return ones[Math.floor(num/100)]+' Hundred'+(num%100?' '+c(num%100):'');
    if (num < 100000)   return c(Math.floor(num/1000))+' Thousand'+(num%1000?' '+c(num%1000):'');
    if (num < 10000000) return c(Math.floor(num/100000))+' Lakh'+(num%100000?' '+c(num%100000):'');
    return c(Math.floor(num/10000000))+' Crore'+(num%10000000?' '+c(num%10000000):'');
  };
  return c(Math.floor(n)) + ' Rupees Only';
}

// Key: all sizes in px, but print CSS zooms to fit A4
const printStyles = `
  @media print {
    body * { visibility: hidden !important; }
    #pc-wrap, #pc-wrap * { visibility: visible !important; }
    #pc-wrap {
      position: fixed !important;
      top: 0 !important; left: 0 !important;
      width: 210mm !important;
      height: 297mm !important;
      margin: 0 !important;
      padding: 8mm 10mm !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      background: white !important;
    }
    .no-print { display: none !important; }
    @page { size: A4 portrait; margin: 0; }
  }
  /* Global: all text bold + dark */
  #pc-wrap * {
    font-weight: 700 !important;
    color: #1e293b !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Keep table headers white */
  #pc-wrap thead th {
    color: white !important;
    background: #1b2d52 !important;
  }
  /* Keep green highlight row */
  #pc-wrap .green-row td {
    color: #14532d !important;
  }
  body { font-family: Arial, sans-serif; margin: 0; background: #e5e7eb; }
`;

function IR({ label, value }) {
  return (
    <div style={{ display:'flex', gap:3, fontSize:'8.5px', lineHeight:'1.45' }}>
      <span style={{ fontWeight:600, color:'#475569', width:118, flexShrink:0 }}>{label}</span>
      <span style={{ color:'#475569', flexShrink:0 }}>:</span>
      <span style={{ fontWeight:700, color:'#1e293b' }}>{value || '—'}</span>
    </div>
  );
}

export default function TQSPaymentCertPrint() {
  const { id } = useParams();
  const { data: bill, isLoading } = useQuery({
    queryKey: ['tqs-bill-print', id],
    queryFn: () => tqsBillsAPI.get(id).then(r => r.data?.data ?? r.data),
    enabled: !!id,
  });

  useEffect(() => {
    if (bill) { const t = setTimeout(() => window.print(), 900); return () => clearTimeout(t); }
  }, [bill]);

  if (isLoading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#64748b', fontFamily:'Arial' }}>Loading Payment Certificate…</div>;
  if (!bill)     return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#dc2626', fontFamily:'Arial' }}>Bill not found.</div>;

  const upd = bill.bill_updates || {};

  const raItems  = Array.isArray(upd.qs_ra_items) ? upd.qs_ra_items : [];
  const abstract = raItems.length > 0
    ? raItems.map((r,i) => ({ slNo:i+1, desc:r.description||'—', unit:r.unit||'', qty:nv(r.qs_pres_qty), rate:nv(r.po_rate), amt:nv(r.qs_pres_qty)*nv(r.po_rate) }))
    : [{ slNo:1, desc:'As per QS Certification', unit:'LS', qty:1, rate:nv(upd.qs_gross), amt:nv(upd.qs_gross) }];
  const absTotal = abstract.reduce((s,r)=>s+r.amt, 0);

  const qsGross    = nv(upd.qs_gross);
  const qsTax      = nv(upd.qs_tax);
  const gross      = qsGross + qsTax;
  const dedMob     = nv(upd.advance_recovered);
  const dedRet     = nv(upd.retention_money);
  const dedOther   = nv(upd.tds_deduction)+nv(upd.credit_note_amt)+nv(upd.other_deductions);
  const certNet    = nv(upd.certified_net) || (gross - dedMob - dedRet - dedOther);
  const prevCerts  = nv(upd.previous_certified_amount);
  const cumul      = nv(upd.cumulative_certified_amount) || (prevCerts + certNet);
  const poVal      = nv(bill.total_amount) || nv(bill.basic_amount);
  const balFin     = poVal - cumul;

  const sumRows = [
    ['1',  'Original Contract Value',                 poVal,    false, false],
    ['2',  'Net Change by Variation Orders',          0,        false, false],
    ['3',  'Final Contract Value to Date',            poVal,    true,  false],
    ['4',  'Advance Certified',                       0,        false, false],
    ['5',  'Gross Certified Till Date',               gross,    true,  false],
    ['6',  'Deduction of Mobilisation Advance',       dedMob,   false, false],
    ['7',  'Deduction of Retention Amount',           dedRet,   false, false],
    ['8',  'Any Other Deductions',                    dedOther, false, false],
    ['9',  'Total Net Certified Till Date',           cumul,    true,  false],
    ['10', 'Less Previous Certificates for Payments', prevCerts,false, false],
    ['11', 'Balance to Finish',                       balFin,   false, false],
    ['12', 'Current Net Payment Due',                 certNet,  true,  true ],
  ];

  const poRef = [bill.po_number, bill.po_date?`Dt. ${fmtD(bill.po_date)}`:''].filter(Boolean).join(' ');

  // Cell helpers
  const th = (s={}) => ({ border:'1px solid #1b2d52', padding:'3px 5px', background:'#1b2d52', color:'white', fontWeight:700, fontSize:'8px', ...s });
  const td = (s={}) => ({ border:'1px solid #c7d2e0', padding:'2.5px 5px', fontSize:'8.5px', ...s });

  const sigs = [
    { label:'QS Engineer',       role:'Prepared By'   },
    { label:'Director',          role:'Approved By'   },
    { label:'Managing Director', role:'Approved By'   },
  ];

  return (
    <>
      <style>{printStyles}</style>

      {/* Screen toolbar */}
      <div className="no-print" style={{ background:'#1e293b', padding:'7px 16px', display:'flex', alignItems:'center', gap:10, fontFamily:'Arial' }}>
        <img src="/bcim-logo.png" alt="BCIM" style={{ height:30, objectFit:'contain' }} />
        <span style={{ color:'#fff', fontSize:12, fontWeight:600, borderLeft:'1px solid #475569', paddingLeft:10 }}>Payment Certificate</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={() => window.print()} style={{ background:'#22c55e', color:'#fff', border:'none', borderRadius:5, padding:'5px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            🖨 Print / PDF
          </button>
          <button onClick={() => window.close()} style={{ background:'transparent', color:'#94a3b8', border:'1px solid #475569', borderRadius:5, padding:'5px 12px', fontSize:12, cursor:'pointer' }}>
            ✕ Close
          </button>
        </div>
      </div>

      {/* Certificate — shown both on screen and print */}
      <div id="pc-wrap" style={{
        background: '#fff',
        width: 794,
        minHeight: 1123,
        margin: '16px auto',
        padding: '24px 28px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '8.5px',
        boxSizing: 'border-box',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
      }}>

        {/* ── HEADER ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'2px solid #1b2d52', paddingBottom:7, marginBottom:8 }}>
          <img src="/bcim-logo.png" alt="BCIM" style={{ height:42, objectFit:'contain' }} />
          <div style={{ textAlign:'center', flex:1 }}>
            <div style={{ fontSize:'13px', fontWeight:900, color:'#1b2d52', letterSpacing:1.5, textTransform:'uppercase' }}>Payment Certificate</div>
            <div style={{ fontSize:'8px', color:'#64748b', marginTop:2 }}>BCIM Engineering Private Limited — QS &amp; Billing Department</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:'8.5px', fontWeight:700, color:'#1b2d52', background:'#eef2fa', border:'1px solid #c0cbdf', borderRadius:3, padding:'2px 7px', display:'inline-block' }}>
                PC No: {upd.pc_number || '—'}
              </div>
              <div style={{ marginTop:2, fontSize:'8px', color:'#555' }}>RA Bill: <b>{upd.ra_bill_number||'—'}</b></div>
              <div style={{ fontSize:'8px', color:'#555' }}>Date: <b>{fmtD(upd.pc_generated_at)}</b></div>
            </div>
            <QRCodeSVG value={`${getPublicAppOrigin()}/verify/payment-cert/${bill.id}`} size={40} />
          </div>
        </div>

        {/* ── META ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 18px', border:'1px solid #d0d7e8', borderRadius:3, padding:'6px 10px', marginBottom:7, background:'#fafbfe' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
            <IR label="Company Name"  value="BCIM ENGINEERING PRIVATE LIMITED" />
            <IR label="Project Name"  value={bill.project_name} />
            <IR label="Package Desc." value={bill.work_desc} />
            <IR label="PO / WO Ref."  value={poRef} />
            <IR label="PO / WO Value" value={`₹ ${inr(poVal)}`} />
            <IR label="Payment Terms" value="30 Days from date of supply" />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
            <IR label="Vendor Name"         value={bill.vendor_name} />
            <IR label="Date of Invoice"     value={fmtD(bill.inv_date)} />
            <IR label="Invoice Number"      value={bill.inv_number} />
            <IR label="MR Ref. No."         value={bill.linked_grn_number||'—'} />
            <IR label="Recommendation Date" value={fmtD(upd.qs_certified_date)} />
          </div>
        </div>

        {/* ── BILL ABSTRACT ── */}
        <div style={{ fontSize:'8px', fontWeight:700, color:'#1b2d52', textTransform:'uppercase', letterSpacing:0.7, marginBottom:3, borderLeft:'2px solid #1b2d52', paddingLeft:5 }}>Bill Abstract</div>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:6 }}>
          <thead>
            <tr>
              <th style={th({ textAlign:'center', width:24 })}>Sl.</th>
              <th style={th({ textAlign:'left' })}>Description</th>
              <th style={th({ textAlign:'center', width:45 })}>Unit</th>
              <th style={th({ textAlign:'right', width:45 })}>Qty</th>
              <th style={th({ textAlign:'right', width:90 })}>Rate (₹)</th>
              <th style={th({ textAlign:'right', width:95 })}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {abstract.map((r,i) => (
              <tr key={i} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                <td style={td({ textAlign:'center' })}>{r.slNo}</td>
                <td style={td()}>{r.desc}</td>
                <td style={td({ textAlign:'center' })}>{r.unit}</td>
                <td style={td({ textAlign:'right' })}>{r.qty}</td>
                <td style={td({ textAlign:'right' })}>{inr(r.rate)}</td>
                <td style={td({ textAlign:'right', fontWeight:600 })}>{inr(r.amt)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background:'#eef2fa', fontWeight:700 }}>
              <td colSpan={5} style={{ border:'1px solid #1b2d52', padding:'2.5px 5px', textAlign:'right', color:'#1b2d52', fontSize:'8px' }}>Total Abstract Value</td>
              <td style={{ border:'1px solid #1b2d52', padding:'2.5px 5px', textAlign:'right', color:'#1b2d52', fontWeight:700 }}>{inr(absTotal)}</td>
            </tr>
          </tfoot>
        </table>

        {/* ── CLAIM SUMMARY ── */}
        <div style={{ fontSize:'8px', fontWeight:700, color:'#1b2d52', textTransform:'uppercase', letterSpacing:0.7, marginBottom:3, borderLeft:'2px solid #1b2d52', paddingLeft:5 }}>Claim Summary</div>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:6 }}>
          <thead>
            <tr>
              <th style={th({ textAlign:'center', width:24 })}>No.</th>
              <th style={th({ textAlign:'left' })}>Description</th>
              <th style={th({ textAlign:'right', width:140 })}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {sumRows.map(([no, label, val, bold, green], i) => (
              <tr key={i} className={green ? 'green-row' : ''} style={{ background:green?'#dcfce7':bold?'#fffbeb':i%2===0?'#fff':'#f8fafc', fontWeight:bold?700:400 }}>
                <td style={td({ textAlign:'center' })}>{no}</td>
                <td style={td()}>{label}</td>
                <td style={td({ textAlign:'right', fontWeight:green?800:'inherit' })}>
                  {val === 0 ? '—' : `₹ ${inr(val)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Amount in words */}
        <div style={{ border:'1px solid #1b2d52', borderRadius:2, padding:'4px 8px', marginBottom:6, background:'#f0fdf4' }}>
          <span style={{ fontWeight:700, color:'#1b2d52', fontSize:'8px' }}>Amount Certified in Words: </span>
          <span style={{ fontWeight:600, color:'#15803d', fontSize:'8.5px' }}>{numToWords(certNet)}</span>
        </div>

        {/* ── REMARKS ── */}
        <div style={{ marginBottom:6, fontSize:'7.5px', lineHeight:1.5 }}>
          <span style={{ fontWeight:700, color:'#1b2d52', textTransform:'uppercase', letterSpacing:0.5 }}>Remarks: </span>
          <span style={{ color:'#444' }}>1. Any Statutory deductions required to be made apart from the above shall be made at Accounts Department. &nbsp;
          2. Payments made to be verified for correctness. &nbsp;
          3. All transactions in Indian Rupees.</span>
          {upd.qs_remarks && <span style={{ fontStyle:'italic', color:'#555' }}> QS: {upd.qs_remarks}</span>}
        </div>

        {/* ── SIGNATURES ── */}
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${sigs.length},1fr)`, gap:14, marginTop:14 }}>
          {sigs.map((sig,i) => (
            <div key={i} style={{ textAlign:'center', fontSize:'8px' }}>
              <div style={{ height:34, borderBottom:'1.5px solid #1b2d52', marginBottom:4 }} />
              <div style={{ fontWeight:700, color:'#1b2d52' }}>{sig.label}</div>
              <div style={{ color:'#64748b', marginTop:1 }}>{sig.role}</div>
              <div style={{ marginTop:4, color:'#94a3b8', fontSize:'7.5px' }}>Date: _______________</div>
            </div>
          ))}
        </div>

        {/* ── FOOTER ── */}
        <div style={{ marginTop:10, paddingTop:5, borderTop:'1.5px solid #1b2d52', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <img src="/bcim-logo.png" alt="BCIM" style={{ height:20, objectFit:'contain' }} />
          <div style={{ fontSize:'7px', color:'#94a3b8', textAlign:'center' }}>
            BCIM Engineering Private Limited &nbsp;•&nbsp; PC No. {upd.pc_number||'—'} &nbsp;•&nbsp; RA Bill: {upd.ra_bill_number||'—'} &nbsp;•&nbsp; Date: {fmtD(upd.pc_generated_at)}
          </div>
          <div style={{ width:55, height:20, border:'1px dashed #cbd5e1', borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'7px', color:'#cbd5e1' }}>
            Stamp
          </div>
        </div>

      </div>
    </>
  );
}
