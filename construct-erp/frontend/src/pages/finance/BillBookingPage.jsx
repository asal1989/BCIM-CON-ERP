// src/pages/finance/BillBookingPage.jsx
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, FileText, ShoppingCart, 
  Truck, Save, Calculator, AlertCircle,
  Plus, X, Box, Tag, DollarSign, Percent
} from 'lucide-react';
import { clsx } from 'clsx';
import { invoiceAPI, projectAPI, vendorAPI, poAPI, ignAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

export default function BillBookingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [formData, setFormData] = useState({
    project_id: '', vendor_id: '', po_id: '', grn_id: '',
    invoice_number: '', invoice_date: dayjs().format('YYYY-MM-DD'),
    due_date: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    remarks: '', tds_percent: 0
  });

  const [items, setItems] = useState([]);

  // Data Fetchers
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []) });
  const { data: vendors = []  } = useQuery({ queryKey: ['vendors'],  queryFn: () => vendorAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []) });

  const { data: pos = [] } = useQuery({
    queryKey: ['po-list', formData.vendor_id],
    queryFn: () => poAPI.list({ vendor_id: formData.vendor_id }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.vendor_id
  });

  const { data: grns = [] } = useQuery({
    queryKey: ['grn-list', formData.po_id],
    queryFn: () => ignAPI.list({ po_id: formData.po_id }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!formData.po_id
  });

  const { data: grnDetail } = useQuery({
    queryKey: ['grn-detail', formData.grn_id],
    queryFn: () => ignAPI.get(formData.grn_id).then(r => r.data?.data ?? r.data ?? null).catch(() => null),
    enabled: !!formData.grn_id
  });

  // Effect: When GRN is selected, pull items
  useEffect(() => {
    if (grnDetail?.items) {
      setItems(grnDetail.items.map(it => ({
        material_name: it.material_name,
        unit: it.unit,
        quantity_on_grn: it.quantity_received,
        quantity_invoiced: it.quantity_received,
        rate_on_po: it.po_rate || 0, // In a real app, match with PO item rate
        rate_invoiced: it.po_rate || 0,
        tax_percent: 18,
        tax_amount: 0,
        net_amount: 0
      })));
    }
  }, [grnDetail]);

  const totals = items.reduce((acc, it) => {
    const sub = (it.quantity_invoiced || 0) * (it.rate_invoiced || 0);
    const tax = sub * (it.tax_percent / 100);
    return {
      subtotal: acc.subtotal + sub,
      tax: acc.tax + tax,
      gross: acc.gross + sub + tax
    };
  }, { subtotal: 0, tax: 0, gross: 0 });

  const tdsAmount = totals.subtotal * (formData.tds_percent / 100);
  const finalPayable = totals.gross - tdsAmount;

  const createMut = useMutation({
    mutationFn: (d) => invoiceAPI.create(d),
    onSuccess: () => {
      toast.success('Bill booked successfully!');
      qc.invalidateQueries({ queryKey: ['vendor-invoices'] });
      navigate('/finance/invoices');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Booking failed'),
  });

  const handleBooking = () => {
    const payload = {
      ...formData,
      total_amount: totals.subtotal,
      tax_amount: totals.tax,
      net_amount: finalPayable,
      tax_details: { 
        tds_percent: formData.tds_percent, 
        tds_amount: tdsAmount,
        gross_total: totals.gross
      },
      items: items.map(it => ({
        ...it,
        tax_amount: (it.quantity_invoiced * it.rate_invoiced) * (it.tax_percent / 100),
        net_amount: (it.quantity_invoiced * it.rate_invoiced) * (1 + it.tax_percent / 100)
      }))
    };
    createMut.mutate(payload);
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-[1400px] mx-auto bg-slate-50 min-h-screen">
       <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-900 font-medium hover:text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-colors mb-2 w-fit group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-medium uppercase tracking-widest italic">Back to Ledger</span>
       </button>

       {/* Form Shell */}
       <div className="space-y-6">
          <div className="flex items-end justify-between">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                   <Calculator className="w-6 h-6 text-indigo-600 uppercase" />
                </div>
                <div>
                   <h1 className="text-2xl font-medium text-slate-900 uppercase tracking-tight italic">Commercial Bill Booking</h1>
                   <p className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-1">3-Way Matching: Purchase Order • Store GRN • Commercial Invoice</p>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
             {/* Left: Linkage Block */}
             <div className="xl:col-span-1 space-y-6">
                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-6 relative overflow-hidden group">
                   <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-50 rounded-full blur-2xl opacity-50 pointer-events-none transition-transform group-hover:scale-150"></div>
                   <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-100 pb-4 italic relative z-10"> <ShoppingCart className="w-3.5 h-3.5 text-indigo-500" /> Procurement Linkage</h3>
                   
                   <div className="space-y-5 relative z-10">
                      <div className="space-y-2">
                         <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Select Project Site</label>
                         <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 uppercase tracking-widest outline-none focus:border-indigo-400 transition-all shadow-sm appearance-none italic" value={formData.project_id} onChange={e => setFormData(p => ({ ...p, project_id: e.target.value }))}>
                            <option value="">Source Site...</option>
                            {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Select Vendor</label>
                         <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 uppercase tracking-widest outline-none focus:border-indigo-400 transition-all shadow-sm appearance-none italic" value={formData.vendor_id} onChange={e => setFormData(p => ({ ...p, vendor_id: e.target.value }))}>
                            <option value="">Creditor Account...</option>
                            {vendors?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Linked Purchase Order</label>
                         <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 uppercase tracking-widest outline-none focus:border-indigo-400 transition-all shadow-sm appearance-none italic" value={formData.po_id} onChange={e => setFormData(p => ({ ...p, po_id: e.target.value }))}>
                            <option value="">Reference PO...</option>
                            {pos?.map(p => <option key={p.id} value={p.id}>{p.po_number}</option>)}
                         </select>
                      </div>
                      <div className="space-y-2 pt-2">
                         <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic flex items-center justify-between">Validated GRN <Truck className="w-4 h-4 text-emerald-500" /></label>
                         <select className="w-full bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs font-medium text-emerald-700 uppercase tracking-widest outline-none focus:border-emerald-400 shadow-sm transition-all appearance-none italic" value={formData.grn_id} onChange={e => setFormData(p => ({ ...p, grn_id: e.target.value }))}>
                            <option value="">Reference Store Receipt...</option>
                            {grns?.map(g => <option key={g.id} value={g.id}>{g.grn_number} ({dayjs(g.grn_date).format('DD/MM/YY')})</option>)}
                         </select>
                      </div>
                   </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-6">
                   <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-100 pb-4 italic"> <FileText className="w-3.5 h-3.5 text-slate-500" /> Commercial Details</h3>
                   <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2 col-span-2">
                         <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Vendor Invoice No</label>
                         <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs uppercase font-mono font-medium text-indigo-600 outline-none focus:border-indigo-400 transition-all shadow-inner" placeholder="E.g. INV/2024/099" value={formData.invoice_number} onChange={e => setFormData(p => ({ ...p, invoice_number: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                         <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Inv Date</label>
                         <input type="date" className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all shadow-sm" value={formData.invoice_date} onChange={e => setFormData(p => ({ ...p, invoice_date: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                         <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Due Date</label>
                         <input type="date" className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs font-medium text-slate-900 outline-none focus:border-amber-400 transition-all shadow-sm" value={formData.due_date} onChange={e => setFormData(p => ({ ...p, due_date: e.target.value }))} />
                      </div>
                   </div>
                </div>
             </div>

             {/* Right: Reconciliation Sheet */}
             <div className="xl:col-span-2 space-y-6">
                <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col h-full">
                   <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                      <h3 className="text-[10px] font-medium text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2 italic"> <Box className="w-4 h-4 text-indigo-600" /> Quantitative Reconciliation</h3>
                      <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest bg-white border border-slate-200 px-3 py-1 rounded-lg shadow-sm">Verification Phase</span>
                   </div>
                   
                   <div className="overflow-x-auto flex-1">
                      <table className="w-full text-xs text-left">
                         <thead className="bg-slate-50/50 text-slate-900 font-medium border-b border-slate-100">
                            <tr>
                               <th className="p-5 font-medium uppercase tracking-widest italic">Material Manifest</th>
                               <th className="p-5 font-medium uppercase tracking-widest text-center italic">GRN Qty</th>
                               <th className="p-5 font-medium uppercase tracking-widest text-center italic">Inv Qty</th>
                               <th className="p-5 font-medium uppercase tracking-widest text-right italic">Invoiced Rate</th>
                               <th className="p-5 font-medium uppercase tracking-widest text-right italic">Net Subtotal</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {items.map((it, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                 <td className="p-5">
                                    <div className="font-medium text-slate-900 uppercase tracking-tight italic">{it.material_name}</div>
                                    <div className="text-[9px] text-slate-900 font-medium uppercase mt-1.5 tracking-widest">{it.unit}</div>
                                 </td>
                                 <td className="p-5 text-center">
                                    <span className="font-mono text-slate-900 font-medium font-bold">{it.quantity_on_grn}</span>
                                 </td>
                                 <td className="p-5 text-center">
                                    <input 
                                       type="number" 
                                       className="w-24 px-3 py-2 text-center bg-white border border-slate-200 rounded-xl focus:border-indigo-400 outline-none shadow-sm font-mono font-medium text-slate-900 transition-all" 
                                       value={it.quantity_invoiced}
                                       onChange={e => setItems(p => p.map((x, i) => i === idx ? { ...x, quantity_invoiced: e.target.value } : x))}
                                    />
                                 </td>
                                 <td className="p-5 text-right flex justify-end">
                                    <input 
                                       type="number" 
                                       className="w-32 px-3 py-2 text-right bg-white border border-slate-200 rounded-xl focus:border-indigo-400 outline-none shadow-sm font-mono font-medium text-indigo-600 transition-all" 
                                       value={it.rate_invoiced}
                                       onChange={e => setItems(p => p.map((x, i) => i === idx ? { ...x, rate_invoiced: e.target.value } : x))}
                                    />
                                 </td>
                                 <td className="p-5 text-right">
                                    <div className="font-mono font-medium text-slate-900 text-sm italic tracking-tighter">₹{(it.quantity_invoiced * it.rate_invoiced).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                 </td>
                              </tr>
                            ))}
                            {items.length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-16 text-center text-slate-900 font-medium uppercase tracking-[0.3em] italic">
                                   Please link a verified GRN reference above
                                </td>
                              </tr>
                            )}
                         </tbody>
                      </table>
                   </div>

                   {/* Final Tax Block */}
                   <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                      <div className="w-96 space-y-5">
                         <div className="flex justify-between items-center text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">
                            <span>Invoiced Subtotal</span>
                            <span className="font-mono text-slate-900 text-base tracking-tighter">₹{totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between items-center text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">
                            <span className="flex items-center gap-2">Output GST (18%) <Percent className="w-3 h-3 text-slate-400" /></span>
                            <span className="font-mono text-slate-900 text-base tracking-tighter">₹{totals.tax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between items-center text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">
                            <span className="text-amber-600">TDS Deduction (%)</span>
                            <input 
                              type="number" 
                              className="w-20 px-3 py-1.5 text-right bg-white border border-amber-200 rounded-lg focus:border-amber-400 outline-none shadow-sm font-mono font-medium text-amber-600 transition-all" 
                              value={formData.tds_percent}
                              onChange={e => setFormData(p => ({ ...p, tds_percent: e.target.value }))}
                            />
                         </div>
                         <div className="flex justify-between items-center text-[10px] font-medium text-amber-600 uppercase tracking-widest pt-3 border-t border-slate-200 italic">
                            <span>TDS Amount (Liability)</span>
                            <span className="font-mono text-sm tracking-tighter">(₹{tdsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                         </div>
                         
                         <div className="pt-6 border-t border-slate-200 mt-6">
                            <div className="flex justify-between items-center flex-wrap gap-2 mb-8">
                               <span className="text-[11px] font-medium text-slate-900 uppercase tracking-[0.2em] italic">Net Payable Value</span>
                               <div className="text-4xl font-medium text-indigo-600 font-mono italic tracking-tighter py-2 px-4 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm">
                                 ₹{finalPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                               </div>
                            </div>
                            <button 
                              onClick={handleBooking}
                              disabled={createMut.isPending || !items.length}
                              className="w-full bg-indigo-600 hover:bg-indigo-500 py-5 rounded-[2rem] text-white font-medium uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 transition-all disabled:opacity-50 italic"
                            >
                               <Save className="w-5 h-5" /> {createMut.isPending ? 'VALIDATING FISCAL MATCH...' : 'AUTHORIZE BILL BOOKING'}
                            </button>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}
