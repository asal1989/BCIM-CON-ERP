// src/pages/tqs/QSRABillPrint.jsx
// BCIM Engineering — Vendor RA Bill Abstract, mirroring BCIM_QS_RA_Bill_Template.xlsx
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

const inr  = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt  = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
const n    = (v) => parseFloat(v || 0);
const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const lineItemsToRAItems = (bill) => (bill.line_items || []).map((it) => ({
  po_item_id: it.po_item_id || '',
  description: it.item_name || '',
  unit: it.unit || '',
  po_qty: it.quantity || '',
  po_rate: it.rate || '',
  gst_pct: it.gst_pct || '',
  inv_prev_qty: '',
  inv_pres_qty: it.quantity || '',
  qs_prev_qty: '',
  qs_pres_qty: it.quantity || '',
  weighment: '',
  msb: '',
  ign: '',
  grs: '',
  remarks: it.category || '',
}));

export default function QSRABillPrint() {
  const { id } = useParams();

  const { data: bill, isLoading } = useQuery({
    queryKey: ['tqs-bill-ra', id],
    queryFn:  () => tqsBillsAPI.get(id).then(r => r.data?.data ?? r.data),
    enabled: !!id,
  });

  useEffect(() => {
    if (bill) { const t = setTimeout(() => window.print(), 800); return () => clearTimeout(t); }
  }, [bill]);

  if (isLoading) return <div style={styles.loading}>Loading RA Bill Abstract…</div>;
  if (!bill)     return <div style={styles.loading}>Bill not found.</div>;

  const upd   = bill.bill_updates || {};
  const savedRAItems = asArray(upd.qs_ra_items);
  const items = savedRAItems.length > 0 ? savedRAItems : lineItemsToRAItems(bill);

  // GST rates — prefer saved RA rates, fall back to bill rates
  const cgstRate = n(upd.ra_cgst_pct ?? bill.cgst_pct ?? 9) / 100;
  const sgstRate = n(upd.ra_sgst_pct ?? bill.sgst_pct ?? 9) / 100;
  const igstRate = n(upd.ra_igst_pct ?? bill.igst_pct ?? 0) / 100;
  const cgstPct  = n(upd.ra_cgst_pct ?? bill.cgst_pct ?? 9);
  const sgstPct  = n(upd.ra_sgst_pct ?? bill.sgst_pct ?? 9);
  const igstPct  = n(upd.ra_igst_pct ?? bill.igst_pct ?? 0);

  // Item totals
  const sumInvPrevAmt = items.reduce((s,r)=>s+n(r.inv_prev_qty)*n(r.po_rate),0);
  const sumInvPresAmt = items.reduce((s,r)=>s+n(r.inv_pres_qty)*n(r.po_rate),0);
  const sumInvCumAmt  = sumInvPrevAmt + sumInvPresAmt;
  const sumQSPrevAmt  = items.reduce((s,r)=>s+n(r.qs_prev_qty)*n(r.po_rate),0);
  const sumQSPresAmt  = items.reduce((s,r)=>s+n(r.qs_pres_qty)*n(r.po_rate),0);
  const sumQSCumAmt   = sumQSPrevAmt + sumQSPresAmt;
  const sumPOAmt      = items.reduce((s,r)=>s+n(r.po_qty)*n(r.po_rate),0);

  // GST amounts for Invoice section
  const invCgst=sumInvPresAmt*cgstRate, invSgst=sumInvPresAmt*sgstRate, invIgst=sumInvPresAmt*igstRate;
  // GST amounts for QS section
  const qsCgst=sumQSPresAmt*cgstRate,  qsSgst=sumQSPresAmt*sgstRate,  qsIgst=sumQSPresAmt*igstRate;

  const totalGross  = n(upd.qs_total) || (sumQSPresAmt + qsCgst + qsSgst + qsIgst);
  const balanceQSAmt = sumPOAmt - sumQSCumAmt;

  const deductions = [
    { label: 'Mobilisation Advance', value: n(upd.advance_recovered) },
    { label: 'Retention Money',       value: n(upd.retention_money) },
    { label: 'TDS',                   value: n(upd.tds_deduction) },
    { label: 'Any Other Deductions',  value: n(upd.other_deductions) },
  ];
  const totalDed   = deductions.reduce((s, d) => s + d.value, 0);
  const certifiedNet = n(upd.certified_net) || (totalGross - totalDed);
  const raBillNo = upd.ra_bill_number || (upd.ra_sequence ? `RA-${upd.ra_sequence}` : `RA-${bill.sl_number || '1'}`);

  const sigBlocks = [
    { title: 'Quantity Surveyor\n— Site',  sub: 'Sign & Stamp' },
    { title: 'Site Incharge',               sub: 'Sign & Stamp' },
    { title: 'Project Manager',             sub: 'Sign & Stamp' },
    { title: 'Project Director',            sub: 'Sign & Stamp' },
    { title: 'Quantity Surveyor\n— HO',    sub: 'Sign & Stamp' },
    { title: 'DGM — F&A',                  sub: 'Sign & Stamp' },
    { title: 'Director',                    sub: 'Sign & Stamp' },
    { title: 'Managing Director',           sub: 'Sign & Stamp' },
  ];

  const SigBox = ({ sig }) => (
    <div style={styles.sigBox}>
      {sig.sig_img
        ? <img src={sig.sig_img} alt="sig" style={{ height: 40, objectFit:'contain', marginBottom: 4 }} />
        : <div style={{ height: 40 }} />}
      <div style={styles.sigLine} />
      <p style={styles.sigTitle}>{sig.title.replace('\n', ' ')}</p>
      <p style={styles.sigSub}>{sig.sub}</p>
      <p style={styles.sigDate}>Date: ___________</p>
    </div>
  );

  return (
    <>
      <style>{`
        @media print {
          @page { size: A3 landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; margin: 0; font-size: 10px; }
        table { border-collapse: collapse; }
        th, td { border: 1px solid #94a3b8; padding: 4px 6px; font-size: 9px; }
        th { background: #1e293b; color: #fff; font-weight: 700; text-align: center; }
      `}</style>

      {/* Screen controls */}
      <div className="no-print" style={{ display:'flex', gap:8, padding:'10px 20px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
        <button onClick={() => window.print()}
          style={{ padding:'8px 20px', background:'#4f46e5', color:'#fff', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer' }}>
          🖨 Print / Save PDF (A3 Landscape)
        </button>
        <button onClick={() => window.close()}
          style={{ padding:'8px 16px', border:'1px solid #cbd5e1', borderRadius:8, cursor:'pointer' }}>
          Close
        </button>
      </div>

      {/* A3 Page */}
      <div style={{ padding: '16px 20px', minWidth: 1080, background:'#fff' }}>

        {/* Title */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'3px solid #1b2d52', paddingBottom:8, marginBottom:10 }}>
          <img src="/bcim-logo.png" alt="BCIM Engineering" style={{ height:52, objectFit:'contain' }} />
          <div style={{ textAlign:'center', flex:1 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', letterSpacing:1 }}>
              BCIM ENGINEERING PRIVATE LIMITED
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:'#1e40af', marginTop:2 }}>
              VENDOR RA BILL ABSTRACT — QS CERTIFICATION
            </div>
          </div>
          <QRCodeSVG value={`${getPublicAppOrigin()}/verify/ra-bill/${bill.id}`} size={48} />
        </div>

        {/* Header info */}
        <table style={{ width:'100%', marginBottom: 8, border:'1px solid #cbd5e1' }}>
          <tbody>
            {[
              ['Project Name',        bill.project_name || '—',
               'RA Bill No.',         raBillNo],
              ['Package Description', bill.work_desc || items.map(r=>r.description).filter(Boolean).join(', ') || '—',
               'Invoice No.',        bill.inv_number || '—'],
              ['PO / WO No.',         (bill.po_number || '—') + (bill.po_date ? `  Dt. ${fmt(bill.po_date)}` : ''),
               'Date of Invoice',    fmt(bill.inv_date)],
              ['PO / WO Value',       `₹${inr(bill.total_amount)}`,
               'Report Date',        fmt(upd.qs_certified_date)],
              ['Vendor Name',         bill.vendor_name || '—',
               'Payment Terms',      '30 Days from date of supply'],
            ].map(([l1,v1,l2,v2], i) => (
              <tr key={i}>
                <td style={{ background:'#f1f5f9', fontWeight:600, width:'14%' }}>{l1}</td>
                <td style={{ width:'36%' }}>{v1}</td>
                <td style={{ background:'#f1f5f9', fontWeight:600, width:'14%' }}>{l2}</td>
                <td style={{ width:'36%' }}>{v2}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Main abstract table */}
        <table style={{ width:'100%', marginBottom: 8 }}>
          <thead>
            <tr>
              <th rowSpan={3} style={{ width:'3%' }}>Sr.</th>
              <th rowSpan={3} style={{ width:'4%' }}>RA No.</th>
              <th rowSpan={3} style={{ width:'18%' }}>DESCRIPTION</th>
              <th rowSpan={3} style={{ width:'4%' }}>Unit</th>
              <th colSpan={3} style={{ background:'#16a34a' }}>As per PO</th>
              <th colSpan={6} style={{ background:'#ca8a04' }}>As per Invoice</th>
              <th colSpan={4} style={{ background:'#0284c7' }}>Site Records</th>
              <th colSpan={6} style={{ background:'#7c3aed' }}>As per QS (Certified)</th>
              <th colSpan={2} style={{ background:'#b45309' }}>Balance</th>
              <th rowSpan={3} style={{ width:'4%' }}>REMARKS</th>
            </tr>
            <tr>
              <th rowSpan={2} style={{ background:'#dcfce7', color:'#166534' }}>Qty</th>
              <th rowSpan={2} style={{ background:'#dcfce7', color:'#166534' }}>Rate</th>
              <th rowSpan={2} style={{ background:'#dcfce7', color:'#166534' }}>Amt</th>
              <th colSpan={2} style={{ background:'#fef9c3', color:'#713f12' }}>Previous</th>
              <th colSpan={2} style={{ background:'#fef9c3', color:'#713f12' }}>Present</th>
              <th colSpan={2} style={{ background:'#fef9c3', color:'#713f12' }}>Cumulative</th>
              <th rowSpan={2} style={{ background:'#e0f2fe', color:'#0c4a6e', fontSize: 9 }}>As per<br/>weighment</th>
              <th rowSpan={2} style={{ background:'#e0f2fe', color:'#0c4a6e' }}>MSB</th>
              <th rowSpan={2} style={{ background:'#e0f2fe', color:'#0c4a6e' }}>IGN</th>
              <th rowSpan={2} style={{ background:'#e0f2fe', color:'#0c4a6e' }}>GRS</th>
              <th colSpan={2} style={{ background:'#ede9fe', color:'#4c1d95' }}>Previous</th>
              <th colSpan={2} style={{ background:'#ede9fe', color:'#4c1d95' }}>Present</th>
              <th colSpan={2} style={{ background:'#ede9fe', color:'#4c1d95' }}>Cumulative</th>
              <th rowSpan={2} style={{ background:'#fef3c7', color:'#92400e' }}>Qty</th>
              <th rowSpan={2} style={{ background:'#fef3c7', color:'#92400e' }}>Amt</th>
            </tr>
            <tr>
              {['Qty','Amt','Qty','Amt','Qty','Amt'].map((h,i)=><th key={`i${i}`} style={{background:'#fef9c3',color:'#713f12'}}>{h}</th>)}
              {['Qty','Amt','Qty','Amt','Qty','Amt'].map((h,i)=><th key={`q${i}`} style={{background:'#ede9fe',color:'#4c1d95'}}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? items.map((row, i) => {
              const poAmt      = n(row.po_qty)*n(row.po_rate);
              const invPrevAmt = n(row.inv_prev_qty)*n(row.po_rate);
              const invPresAmt = n(row.inv_pres_qty)*n(row.po_rate);
              const invCumAmt  = invPrevAmt + invPresAmt;
              const qsPrevAmt  = n(row.qs_prev_qty)*n(row.po_rate);
              const qsPresAmt  = n(row.qs_pres_qty)*n(row.po_rate);
              const qsCumAmt   = qsPrevAmt + qsPresAmt;
              const balQty     = n(row.po_qty) - (n(row.qs_prev_qty)+n(row.qs_pres_qty));
              const balAmt     = poAmt - qsCumAmt;
              return (
                <tr key={i} style={{ background: i%2===0?'#fff':'#f8fafc' }}>
                  <td style={{textAlign:'center'}}>{i+1}</td>
                  <td style={{textAlign:'center'}}>{raBillNo}</td>
                  <td>{row.description}</td>
                  <td style={{textAlign:'center'}}>{row.unit}</td>
                  <td style={{textAlign:'right',background:'#f0fdf4'}}>{row.po_qty}</td>
                  <td style={{textAlign:'right',background:'#f0fdf4'}}>{row.po_rate}</td>
                  <td style={{textAlign:'right',background:'#f0fdf4',fontWeight:600}}>₹{inr(poAmt)}</td>
                  <td style={{textAlign:'right',background:'#fefce8'}}>{row.inv_prev_qty||0}</td>
                  <td style={{textAlign:'right',background:'#fefce8'}}>₹{inr(invPrevAmt)}</td>
                  <td style={{textAlign:'right',background:'#fefce8'}}>{row.inv_pres_qty||0}</td>
                  <td style={{textAlign:'right',background:'#fefce8'}}>₹{inr(invPresAmt)}</td>
                  <td style={{textAlign:'right',background:'#fefce8'}}>{n(row.inv_prev_qty)+n(row.inv_pres_qty)}</td>
                  <td style={{textAlign:'right',background:'#fefce8'}}>₹{inr(invCumAmt)}</td>
                  <td style={{textAlign:'center',background:'#e0f2fe'}}>{row.weighment||''}</td>
                  <td style={{textAlign:'center',background:'#e0f2fe'}}>{row.msb||''}</td>
                  <td style={{textAlign:'center',background:'#e0f2fe'}}>{row.ign||''}</td>
                  <td style={{textAlign:'center',background:'#e0f2fe'}}>{row.grs||''}</td>
                  <td style={{textAlign:'right',background:'#f5f3ff',color:'#4c1d95'}}>{row.qs_prev_qty||0}</td>
                  <td style={{textAlign:'right',background:'#f5f3ff',color:'#4c1d95'}}>₹{inr(qsPrevAmt)}</td>
                  <td style={{textAlign:'right',background:'#f5f3ff',color:'#4c1d95',fontWeight:700}}>{row.qs_pres_qty||0}</td>
                  <td style={{textAlign:'right',background:'#f5f3ff',color:'#4c1d95',fontWeight:700}}>₹{inr(qsPresAmt)}</td>
                  <td style={{textAlign:'right',background:'#f5f3ff',color:'#4c1d95'}}>{n(row.qs_prev_qty)+n(row.qs_pres_qty)}</td>
                  <td style={{textAlign:'right',background:'#f5f3ff',color:'#4c1d95'}}>₹{inr(qsCumAmt)}</td>
                  <td style={{textAlign:'right',background:'#fef3c7',color:'#92400e'}}>{balQty.toFixed(2)}</td>
                  <td style={{textAlign:'right',background:'#fef3c7',color:'#92400e'}}>₹{inr(balAmt)}</td>
                  <td>{row.remarks||''}</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={27} style={{ textAlign:'center', color:'#94a3b8', padding:'16px' }}>
                  No QS RA items saved yet. Re-save QS Certification to store RA item quantities.
                </td>
              </tr>
            )}

            {/* GST Rows — shown in BOTH Invoice and QS sections */}
            {[
              {label:'CGST-', pct:cgstPct, invAmt:invCgst, qsAmt:qsCgst},
              {label:'SGST-', pct:sgstPct, invAmt:invSgst, qsAmt:qsSgst},
              {label:'IGST-', pct:igstPct, invAmt:invIgst, qsAmt:qsIgst},
            ].map(g => (
              <tr key={g.label} style={{ background:'#fffbeb' }}>
                <td /><td />
                <td style={{fontWeight:600,color:'#92400e'}}>{g.label}</td>
                <td />
                <td style={{textAlign:'right',background:'#f0fdf4',color:'#166534',fontSize:8}}>{g.pct}%</td>
                <td />
                <td style={{textAlign:'right',background:'#f0fdf4'}}>₹{inr(n(sumPOAmt)*n(g.pct)/100)}</td>
                {/* Invoice: Prev blank, Pres amt, Cum amt */}
                <td style={{background:'#fefce8'}}/><td style={{background:'#fefce8'}}/>
                <td style={{background:'#fefce8'}}/><td style={{textAlign:'right',background:'#fefce8',color:'#713f12',fontWeight:600}}>₹{inr(g.invAmt)}</td>
                <td style={{background:'#fefce8'}}/><td style={{textAlign:'right',background:'#fefce8',color:'#713f12',fontWeight:600}}>₹{inr(g.invAmt)}</td>
                {/* Site Records Blank */}
                <td style={{background:'#e0f2fe'}}/><td style={{background:'#e0f2fe'}}/><td style={{background:'#e0f2fe'}}/><td style={{background:'#e0f2fe'}}/>
                {/* QS: Prev blank, Pres amt, Cum amt */}
                <td style={{background:'#f5f3ff'}}/><td style={{background:'#f5f3ff'}}/>
                <td style={{background:'#f5f3ff'}}/><td style={{textAlign:'right',background:'#f5f3ff',color:'#4c1d95',fontWeight:700}}>₹{inr(g.qsAmt)}</td>
                <td style={{background:'#f5f3ff'}}/><td style={{textAlign:'right',background:'#f5f3ff',color:'#4c1d95',fontWeight:700}}>₹{inr(g.qsAmt)}</td>
                {/* Balance */}
                <td style={{background:'#fef3c7'}}/><td style={{background:'#fef3c7'}}/>
                <td/>
              </tr>
            ))}

            {/* Total Gross Certified */}
            <tr style={{background:'#1e293b',color:'#fff',fontWeight:700}}>
              <td colSpan={3}>Total Gross Certified</td>
              <td/><td/><td/>
              <td style={{textAlign:'right',color:'#fbbf24'}}>₹{inr(sumPOAmt)}</td>
              <td/><td/><td/>
              <td style={{textAlign:'right',color:'#ffd166'}}>₹{inr(sumInvPresAmt+invCgst+invSgst+invIgst)}</td>
              <td/>
              <td style={{textAlign:'right',color:'#ffd166'}}>₹{inr(sumInvCumAmt+invCgst+invSgst+invIgst)}</td>
              <td style={{background:'#1e293b'}}/><td style={{background:'#1e293b'}}/><td style={{background:'#1e293b'}}/><td style={{background:'#1e293b'}}/>
              <td/><td/><td/>
              <td style={{textAlign:'right',color:'#fbbf24',fontWeight:900}}>₹{inr(totalGross)}</td>
              <td/>
              <td style={{textAlign:'right',color:'#fbbf24',fontWeight:900}}>₹{inr(totalGross)}</td>
              <td/><td/><td/>
            </tr>
            <tr style={{background:'#fef2f2'}}>
              <td colSpan={26} style={{fontWeight:700,color:'#dc2626',fontSize:10}}>DEDUCTIONS</td>
            </tr>
            {deductions.map(d=>(
              <tr key={d.label} style={{background:'#fef9f9'}}>
                <td colSpan={2}/>
                <td style={{color:'#991b1b'}}>{d.label}</td>
                <td colSpan={19}/>
                <td style={{textAlign:'right',color:'#dc2626',fontWeight:600}}>−₹{inr(d.value)}</td>
                <td colSpan={3}/>
              </tr>
            ))}
            <tr style={{background:'#fecaca',fontWeight:700}}>
              <td colSpan={3} style={{color:'#991b1b'}}>Total for Deductions</td>
              <td colSpan={19}/>
              <td style={{textAlign:'right',color:'#dc2626'}}>−₹{inr(totalDed)}</td>
              <td colSpan={3}/>
            </tr>
            <tr style={{background:'#ecfdf5',fontWeight:800,fontSize:11}}>
              <td colSpan={3} style={{color:'#065f46'}}>TOTAL NET CERTIFIED</td>
              <td colSpan={17}/>
              <td style={{textAlign:'right',color:'#047857',fontWeight:900}}>₹{inr(certifiedNet)}</td>
              <td colSpan={5}/>
            </tr>
          </tbody>
        </table>

        {/* RA Running totals */}
        <div style={{ display:'flex', gap:12, marginBottom:16 }}>
          {[
            { label:'Previous Certified (Cumulative)',  value: upd.previous_certified_amount || 0,    color:'#64748b' },
            { label:'This Bill Net',                     value: certifiedNet,                           color:'#4f46e5' },
            { label:'Cumulative Certified to Date',      value: upd.cumulative_certified_amount || 0,  color:'#047857', bold:true },
          ].map((c,i) => (
            <div key={i} style={{ flex:1, border:`1.5px solid ${c.bold?'#6ee7b7':'#e2e8f0'}`, borderRadius:6, padding:'8px 12px', background: c.bold?'#ecfdf5':'#f8fafc' }}>
              <p style={{ fontSize:8, color:'#64748b', fontWeight:700, textTransform:'uppercase', margin:'0 0 3px' }}>{c.label}</p>
              <p style={{ fontSize: c.bold?13:11, fontWeight:c.bold?800:700, color:c.color, margin:0 }}>₹{inr(c.value)}</p>
            </div>
          ))}
        </div>

        {/* QS Remarks */}
        {upd.qs_remarks && (
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'8px 12px', marginBottom:16, fontSize:10 }}>
            <strong>QS Remarks: </strong>{upd.qs_remarks}
          </div>
        )}

        {/* Signature blocks — 8 columns as per template */}
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize:9, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Authorised Signatures</p>
          <div style={{ display:'flex', gap:8 }}>
            {sigBlocks.map((sig, i) => <SigBox key={i} sig={sig} />)}
          </div>
          {/* Site / HO separator */}
          <div style={{ display:'flex', marginTop:4 }}>
            <div style={{ flex:4, fontSize:8, fontWeight:700, color:'#64748b', textAlign:'center', borderTop:'1px dashed #cbd5e1', paddingTop:3 }}>PROJECT SITE</div>
            <div style={{ flex:4, fontSize:8, fontWeight:700, color:'#64748b', textAlign:'center', borderTop:'1px dashed #cbd5e1', paddingTop:3 }}>HEAD OFFICE</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop:12, borderTop:'1px solid #e2e8f0', paddingTop:8, display:'flex', justifyContent:'space-between', fontSize:8, color:'#94a3b8' }}>
          <span>BCIM Engineering Pvt. Ltd. — Bill Tracker</span>
          <span>PC: {upd.pc_number || '—'} | SL: {bill.sl_number}</span>
          <span>Generated: {new Date().toLocaleString('en-IN')}</span>
        </div>
      </div>
    </>
  );
}

const styles = {
  loading: { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontSize:14, color:'#64748b' },
  sigBox:  { flex:1, border:'1px solid #cbd5e1', borderRadius:6, padding:'8px 6px', textAlign:'center', minHeight:80 },
  sigLine: { borderTop:'1.5px solid #334155', marginTop:36, paddingTop:3 },
  sigTitle:{ fontSize:8, fontWeight:700, color:'#1e293b', margin:'2px 0 0', whiteSpace:'pre-line' },
  sigSub:  { fontSize:7, color:'#64748b', margin:'2px 0 0' },
  sigDate: { fontSize:7, color:'#94a3b8', margin:'4px 0 0' },
};
