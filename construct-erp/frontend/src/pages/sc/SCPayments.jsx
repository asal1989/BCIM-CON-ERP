import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, projectAPI } from '../../api/client';
import { RefreshCw, CreditCard, Plus, X, CheckCircle, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const fmt  = v => `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const fmt2 = v => `₹${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

// ── Payment Advice Print ──────────────────────────────────────────────────────
function printPaymentAdvice(bill, payments) {
  const totalPaid = payments.reduce((s,p) => s + parseFloat(p.amount||0), 0);
  const html = `
    <!DOCTYPE html><html><head><title>Payment Advice — ${bill.bill_number}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 24px; }
      h1 { font-size: 18px; color: #065f46; margin-bottom: 4px; }
      .subtitle { color: #64748b; font-size: 11px; margin-bottom: 20px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
      .card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
      .label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }
      .value { font-weight: bold; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #065f46; color: #fff; padding: 8px 10px; font-size: 10px; text-align: left; }
      td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
      tr:nth-child(even) td { background: #f8fafc; }
      .total-row td { font-weight: bold; background: #f0fdf4 !important; border-top: 2px solid #065f46; }
      .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <h1>Payment Advice</h1>
    <div class="subtitle">Generated: ${dayjs().format('DD MMM YYYY HH:mm')}</div>
    <div class="grid">
      <div class="card"><div class="label">Subcontractor</div><div class="value">${bill.sc_name}</div></div>
      <div class="card"><div class="label">Bill Number</div><div class="value">${bill.bill_number}</div></div>
      <div class="card"><div class="label">WO Number</div><div class="value">${bill.wo_number||'—'}</div></div>
      <div class="card"><div class="label">Bill Date</div><div class="value">${dayjs(bill.bill_date).format('DD MMM YYYY')}</div></div>
      <div class="card"><div class="label">Net Payable</div><div class="value" style="color:#065f46">${fmt2(bill.net_payable)}</div></div>
      <div class="card"><div class="label">Status</div><div class="value">${bill.status?.toUpperCase()}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>#</th><th>Payment Date</th><th>Mode</th><th>UTR / Reference</th><th>Remarks</th><th style="text-align:right">Amount</th>
      </tr></thead>
      <tbody>
        ${payments.length===0 ? '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">No payments recorded</td></tr>'
          : payments.map((p,i) => `<tr>
            <td>${i+1}</td>
            <td>${dayjs(p.payment_date).format('DD MMM YYYY')}</td>
            <td>${(p.payment_mode||'').replace('_',' ').toUpperCase()}</td>
            <td>${p.utr_number||p.reference_no||'—'}</td>
            <td>${p.remarks||'—'}</td>
            <td style="text-align:right;font-weight:bold">${fmt2(p.amount)}</td>
          </tr>`).join('')
        }
        <tr class="total-row">
          <td colspan="5" style="text-align:right">Total Paid</td>
          <td style="text-align:right">${fmt2(totalPaid)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="5" style="text-align:right">Balance Outstanding</td>
          <td style="text-align:right;color:${(parseFloat(bill.net_payable)-totalPaid)>0?'#dc2626':'#059669'}">${fmt2(Math.max(0,parseFloat(bill.net_payable)-totalPaid))}</td>
        </tr>
      </tbody>
    </table>
    <div class="footer">This is a system-generated payment advice. — BCIM Construction ERP</div>
    </body></html>`;
  const w = window.open('','_blank','width=800,height=600');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function PaymentModal({ bill, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ bill_id:bill.id, payment_date:new Date().toISOString().slice(0,10), amount:bill.net_payable-bill.paid_amount, payment_mode:'bank_transfer', reference_no:'', bank_name:'', remarks:'' });
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const maxPay = Math.max(0, parseFloat(bill.net_payable||0)-parseFloat(bill.paid_amount||0));

  const mut = useMutation({
    mutationFn:d=>scAPI.recordPayment(d),
    onSuccess:()=>{ toast.success('Payment recorded'); qc.invalidateQueries({queryKey:['sc-approved-bills']}); onClose(); },
    onError:e=>toast.error(e?.response?.data?.error||'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b bg-teal-600">
          <h2 className="font-bold text-white">Record Payment — {bill.bill_number}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-4">
          <div className="grid grid-cols-2 gap-3 p-3 bg-teal-50 rounded-xl border border-teal-200 text-sm">
            <div><p className="text-[10px] text-teal-500 uppercase">Vendor</p><p className="font-bold text-teal-900">{bill.sc_name}</p></div>
            <div><p className="text-[10px] text-teal-500 uppercase">Net Payable</p><p className="font-bold text-teal-900">{fmt(bill.net_payable)}</p></div>
            <div><p className="text-[10px] text-teal-500 uppercase">Already Paid</p><p className="font-bold text-orange-600">{fmt(bill.paid_amount)}</p></div>
            <div><p className="text-[10px] text-teal-500 uppercase">Balance</p><p className="font-bold text-emerald-700">{fmt(maxPay)}</p></div>
          </div>
          <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Amount (₹) *</label>
            <input type="number" value={form.amount} onChange={e=>set('amount',Math.min(parseFloat(e.target.value||0),maxPay))} max={maxPay} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Payment Date</label>
              <input type="date" value={form.payment_date} onChange={e=>set('payment_date',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
            <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Payment Mode</label>
              <select value={form.payment_mode} onChange={e=>set('payment_mode',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                {['bank_transfer','neft','rtgs','cheque','cash','upi'].map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}</select></div>
          </div>
          <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Reference / UTR Number</label>
            <input value={form.reference_no} onChange={e=>set('reference_no',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="Bank reference / UTR" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Remarks</label>
            <input value={form.remarks} onChange={e=>set('remarks',e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" /></div>
        </div>
        <div className="flex-shrink-0 flex justify-end gap-3 px-5 py-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancel</button>
          <button onClick={()=>mut.mutate(form)} disabled={!form.amount||parseFloat(form.amount)<=0||mut.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50">
            <CheckCircle className="w-4 h-4" />{mut.isPending?'Saving…':'Record Payment'}
          </button>
        </div>
    </div>
  );
}

export default function SCPayments() {
  const [projectFilter, setProject] = useState('');
  const [payModal,   setPayModal]   = useState(null);
  const { data:projects=[] } = useQuery({ queryKey:['projects'], queryFn:()=>projectAPI.list().then(r=>r.data?.data??[]) });
  const { data:bills=[], isLoading, refetch } = useQuery({
    queryKey:['sc-approved-bills', projectFilter],
    queryFn:()=>scAPI.listBills({project_id:projectFilter||undefined, status:'approved'}).then(r=>r.data?.data||[]),
    staleTime:0,
  });
  const { data:paidBills=[] } = useQuery({
    queryKey:['sc-paid-bills', projectFilter],
    queryFn:()=>scAPI.listBills({project_id:projectFilter||undefined, status:'paid'}).then(r=>r.data?.data||[]),
    staleTime:0,
  });

  // Fetch payments on-demand and print — avoids onSuccess (removed in RQ v5)
  const handlePrintAdvice = async (bill) => {
    try {
      const r = await scAPI.listPayments({ bill_id: bill.id });
      printPaymentAdvice(bill, r.data?.data || []);
    } catch(e) { toast.error('Failed to load payment data'); }
  };

  const totalApproved = bills.reduce((s,b) => s+parseFloat(b.net_payable||0), 0);
  const totalPaid     = bills.reduce((s,b) => s+parseFloat(b.paid_amount||0), 0)
                      + paidBills.reduce((s,b) => s+parseFloat(b.paid_amount||0), 0);
  const outstanding   = bills.reduce((s,b) => s+(parseFloat(b.net_payable||0)-parseFloat(b.paid_amount||0)), 0);

  return (
    <div className="p-6 md:p-8 min-h-screen bg-slate-50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-6 h-6 text-teal-600" />Payment Tracking</h1>
          <p className="text-sm text-slate-500 mt-0.5">Approved bills pending and completed payments</p>
        </div>
        <div className="flex gap-2">
          <select value={projectFilter} onChange={e=>setProject(e.target.value)} className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm min-w-48">
            <option value="">All Projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={()=>refetch()} className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50"><RefreshCw className="w-4 h-4 text-slate-500" /></button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[['Total Approved',fmt(totalApproved),'text-teal-700'],['Total Paid',fmt(totalPaid),'text-emerald-700'],['Outstanding',fmt(outstanding),'text-red-600']].map(([l,v,c])=>(
          <div key={l} className="bg-white rounded-2xl border border-slate-100 p-5 text-center">
            <div className={`text-2xl font-bold ${c}`}>{v}</div>
            <div className="text-xs text-slate-500 mt-1">{l}</div>
          </div>
        ))}
      </div>

      {isLoading?(<div className="flex items-center justify-center h-48"><RefreshCw className="w-6 h-6 animate-spin text-teal-500 mr-2" />Loading…</div>):(
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-teal-50 border-b border-teal-100 font-semibold text-teal-800 text-sm">Approved Bills — Pending Payment</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr>
                {['Bill#','Date','WO Number','Subcontractor','Net Payable','Paid','Balance','Action'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {[...bills,...paidBills].length===0?(<tr><td colSpan={8} className="py-12 text-center text-slate-400">No approved bills found</td></tr>)
                  :[...bills,...paidBills].map((b,i)=>{
                    const balance = parseFloat(b.net_payable||0)-parseFloat(b.paid_amount||0);
                    return (
                      <tr key={b.id} className={`border-b border-slate-50 ${i%2===0?'bg-white':'bg-slate-50/30'}`}>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-purple-600">{b.bill_number}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{new Date(b.bill_date).toLocaleDateString('en-IN')}</td>
                        <td className="px-4 py-3 font-mono text-xs">{b.wo_number}</td>
                        <td className="px-4 py-3 text-xs">{b.sc_name}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{fmt(b.net_payable)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(b.paid_amount)}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-500">{fmt(balance)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {balance>0.01&&b.status==='approved'&&(
                              <button onClick={()=>setPayModal(b)} className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700">
                                <Plus className="w-3 h-3" />Pay
                              </button>
                            )}
                            {b.status==='paid'&&<span className="text-xs font-semibold text-emerald-600">✓ Paid</span>}
                            {(b.status==='paid'||b.paid_amount>0)&&(
                              <button onClick={()=>handlePrintAdvice(b)} title="Print Payment Advice"
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50">
                                <Printer className="w-3.5 h-3.5"/>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {payModal&&<PaymentModal bill={payModal} onClose={()=>setPayModal(null)} />}
    </div>
  );
}
