// src/pages/procurement/GRNPage.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import { 
  Truck, Plus, X, CheckCircle, Clock, XCircle, 
  Search, Printer, CheckCircle2, ShieldCheck,
  UserCheck, Building2, MapPin, Check, Calculator,
  FastForward
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { grnAPI, vendorAPI, projectAPI, poAPI, default as api } from '../../api/client';
import toast from 'react-hot-toast';
import DataToolbar from '../../components/common/DataToolbar';
import TableActions from '../../components/common/TableActions';
import GRNPrintTemplate from './GRNPrintTemplate';

const UNITS = ['MT', 'Bags', 'CUM', 'SQM', 'Nos', 'RMT', 'KG', 'Litre', 'LS', 'Bundle', 'Roll', 'Coil', 'Yard'];

const STATUS_CONFIG = {
  pending:         { label: 'Pending Store',     class: 'bg-yellow-50 text-yellow-600 border border-yellow-100',  icon: Clock,        stage: 1 },
  verified_stores: { label: 'Stores Verified',   class: 'bg-amber-50 text-amber-600 border border-amber-100',   icon: UserCheck,    stage: 2 },
  approved:        { label: 'QC Passed',         class: 'bg-emerald-50 text-emerald-600 border border-emerald-100', icon: ShieldCheck,  stage: 3 },
  rejected:        { label: 'Rejected',          class: 'bg-red-50 text-red-600 border border-red-100',     icon: XCircle,      stage: 0 },
};

export default function GRNPage() {
  const { user } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [selectedGRN, setSelectedGRN] = useState(null);
  const [search, setSearch] = useState('');
  
  // Multi-item state
  const [items, setItems] = useState([{ material_name: '', quantity_received: '', unit: 'Nos', quality_remarks: '', batch_number: '', expiry_date: '' }]);
  const [formData, setFormData] = useState({ 
    project_id: '', 
    vendor_id: '',
    po_id: '',
    grn_date: dayjs().format('YYYY-MM-DD'), 
    vehicle_number: '', 
    driver_name: '', 
    challan_number: '', 
    invoice_number: '', 
    site_location: '',
    gate_pass_no: '',
    wb_slip_no: '',
    remarks: ''
  });

  const qc = useQueryClient();

  const { data: grnData = [] } = useQuery({
    queryKey: ['grns'],
    queryFn: () => grnAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: vendorsData = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  // Bug fix: include part_received POs so subsequent GRNs can be raised on the same PO
  const { data: poData = [] } = useQuery({
    queryKey: ['purchase-orders-for-grn'],
    queryFn: async () => {
      try {
        const [r1, r2] = await Promise.all([
          poAPI.list({ status: 'approved' }),
          poAPI.list({ status: 'part_received' }),
        ]);
        const approved  = r1.data?.data ?? r1.data ?? [];
        const partRcvd  = r2.data?.data ?? r2.data ?? [];
        // deduplicate by id
        const seen = new Set();
        return [...approved, ...partRcvd].filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      } catch { return []; }
    },
  });

  const { data: detailedGRN } = useQuery({
    queryKey: ['grns', selectedGRN?.id],
    queryFn: () => grnAPI.get(selectedGRN.id).then(r => r.data?.data ?? r.data ?? null).catch(() => null),
    enabled: !!selectedGRN?.id,
  });

  const createMutation = useMutation({
    mutationFn: (d) => grnAPI.create(d),
    onSuccess: () => {
      toast.success('Material inwarded! Waiting for QC sign-off.');
      setShowForm(false);
      setItems([{ material_name: '', quantity_received: '', unit: 'Nos', quality_remarks: '', batch_number: '', expiry_date: '' }]);
      setFormData({ 
        project_id: '', vendor_id: '', po_id: '', grn_date: dayjs().format('YYYY-MM-DD'), 
        vehicle_number: '', driver_name: '', challan_number: '', invoice_number: '', 
        site_location: '', gate_pass_no: '', wb_slip_no: '', remarks: ''
      });
      qc.invalidateQueries({ queryKey: ['grns'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Inwarding failed'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, stage }) => grnAPI.approve(id, stage),
    onSuccess: () => { 
      toast.success('Inwarding status updated'); 
      qc.invalidateQueries({ queryKey: ['grns'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Action failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/grn/${id}`),
    onSuccess: () => {
      toast.success('GRN record deleted successfully');
      qc.invalidateQueries({ queryKey: ['grns'] });
    },
    onError: () => toast.error('Failed to delete GRN')
  });

  const allGRNs = grnData ?? [];
  const filtered = allGRNs.filter(g => {
    if (search && !g.grn_number.toLowerCase().includes(search.toLowerCase()) &&
        !g.vendor_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handlePOSelect = async (poId) => {
    if (!poId) {
      // User cleared PO selection — reset to manual entry
      setFormData(prev => ({ ...prev, po_id: '', vendor_id: '', project_id: '' }));
      setItems([{ material_name: '', quantity_received: '', unit: 'Nos', quality_remarks: '', batch_number: '', expiry_date: '' }]);
      return;
    }
    try {
      const { data } = await poAPI.get(poId);
      const po = data.data ?? data;
      setFormData(prev => ({ ...prev, po_id: poId, vendor_id: po.vendor_id, project_id: po.project_id }));
      setItems((po.items || []).map(it => ({
        // PO items use material_name — keep as-is, fallback to description/name just in case
        material_name:     (it.material_name || it.description || it.name || '').trim(),
        // PO items store ordered qty as `quantity`, GRN expects `quantity_received`
        quantity_received: it.quantity ?? it.quantity_ordered ?? '',
        unit:              it.unit || 'Nos',
        quality_remarks:   '',
        po_item_id:        it.id,
        batch_number:      '',
        expiry_date:       ''
      })));
      toast.success('Materials auto-populated from PO');
    } catch (e) {
      toast.error('Could not fetch PO details');
    }
  };

  const stageActions = [
    { id: 'verify-stores', label: 'Verify (Stores)', status: 'pending',        color: 'bg-amber-600' },
    { id: 'approve-qc',    label: 'Approve (QC)',     status: 'verified_stores', color: 'bg-emerald-600' },
  ];

  const currentAction = stageActions.find(a => a.status === selectedGRN?.quality_status);

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-sm">
            <Truck className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-medium text-slate-900 uppercase tracking-tight italic">Material Receipts (GRN)</h1>
            <p className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-1">Two-Stage Inwarding & Quality Approval Flow</p>
          </div>
        </div>
        <DataToolbar 
          data={filtered} 
          fileName="GRN_Log_Export" 
          onAdd={() => setShowForm(true)} 
          addLabel="Inward New Material"
        />
      </div>

      {/* Signature Alert */}
      {!user?.signature_url && (
        <div className="flex items-center justify-between p-6 bg-red-50 border border-red-100 rounded-[2rem] shadow-sm">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white border border-red-100 flex items-center justify-center shadow-sm">
                 <ShieldCheck className="w-6 h-6 text-red-500" />
              </div>
              <div>
                 <p className="text-xs font-medium text-red-600 uppercase tracking-widest italic mb-1">Authorization Credentials Required</p>
                 <p className="text-[11px] text-red-500 font-medium tracking-tight">Store & QC sign-offs require a registered digital signature. Please upload yours in the Profile section.</p>
              </div>
           </div>
           <Link to="/profile" className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-[10px] font-medium uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-red-600/20 italic">GO TO PROFILE</Link>
        </div>
      )}

      {/* Stats Cluster */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['pending','verified_stores','approved'].map(s => (
          <div key={s} className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm">
             <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase font-medium text-slate-900 font-medium tracking-[0.2em] italic">{STATUS_CONFIG[s].label.split(' ')[0]}</span>
                {React.createElement(STATUS_CONFIG[s].icon, { className: "w-4 h-4 text-slate-400" })}
             </div>
             <div className="text-3xl font-medium text-slate-900 tracking-tighter italic font-mono">{allGRNs.filter(g => g.quality_status === s).length}</div>
          </div>
        ))}
        <div className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm">
           <div className="text-[9px] uppercase font-medium text-slate-900 font-medium tracking-[0.2em] mb-2 italic">Total Inward Unit</div>
           <div className="text-xl font-medium text-slate-900 tracking-tighter italic">Verified & Approved</div>
        </div>
      </div>

      {/* Primary Register */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-4 flex flex-col md:flex-row items-center gap-4 shadow-sm">
        <div className="relative flex-1 w-full text-slate-900">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-5 py-3.5 text-xs font-medium uppercase tracking-widest text-slate-900 outline-none focus:border-blue-400 transition-all placeholder:text-slate-300 placeholder:normal-case placeholder:tracking-normal" 
            placeholder="Search by GRN Number, Vendor or Vehicle..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />
        </div>
      </div>

      {/* GRN List Table */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Inward Ref</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Vendor & Location</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Logistics Data</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Quality Audit</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest italic text-right">Receipt Status</th>
                <th className="p-6 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(grn => {
                const cfg = STATUS_CONFIG[grn.quality_status] || STATUS_CONFIG.pending;
                return (
                  <tr key={grn.id} className="hover:bg-slate-50/50 transition-all cursor-pointer group" onClick={() => setSelectedGRN(grn)}>
                    <td className="p-6">
                      <div className="text-blue-600 font-medium text-sm tracking-tighter font-mono italic">{grn.serial_no_formatted || grn.grn_number}</div>
                      <div className="text-[10px] text-slate-900 font-medium mt-1.5 uppercase tracking-widest">{dayjs(grn.grn_date).format('D MMM YYYY')}</div>
                    </td>
                    <td className="p-6">
                       <div className="text-slate-900 font-medium text-xs uppercase tracking-tight italic">{grn.vendor_name || 'Direct Receipt'}</div>
                       <div className="text-[10px] text-slate-900 font-medium mt-1.5 truncate max-w-[180px] flex items-center gap-1.5 uppercase tracking-widest"><MapPin className="w-3 h-3 text-slate-400" /> {grn.site_location || 'Main Store'}</div>
                    </td>
                    <td className="p-6">
                      <div className="text-slate-900 font-medium text-xs uppercase tracking-tight italic">{grn.vehicle_number || '---'}</div>
                      <div className="text-[10px] text-slate-900 font-medium mt-1.5 uppercase tracking-widest">WB Slip: <span className="font-mono">{grn.wb_slip_no || '---'}</span></div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <span className={clsx('px-4 py-2 rounded-2xl text-[9px] font-medium uppercase tracking-widest shadow-sm italic', cfg.class)}>
                          {cfg.label}
                        </span>
                        <div className="flex gap-1.5 pt-0.5">
                          {[1,2,3].map(st => (
                            <div key={st} className={clsx('w-1.5 h-3 rounded-full transition-all duration-300', 
                              st <= cfg.stage ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]' : 'bg-slate-200'
                            )} />
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="p-6 text-right">
                      <div className="text-base font-medium text-slate-900 font-mono tracking-tighter italic">{parseFloat(grn.total_quantity).toLocaleString()} Unit</div>
                      <div className="text-[9px] text-slate-900 font-medium uppercase tracking-widest mt-1">Physical Inward</div>
                    </td>
                    <td className="p-6" onClick={e => e.stopPropagation()}>
                      <TableActions disableEdit onDelete={() => deleteMut.mutate(grn.id)} />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-slate-900 font-medium tracking-[0.3em] uppercase italic">No Material Receipts found matching your current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedGRN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
           <div className="bg-white border border-slate-200 rounded-[3.5rem] w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in duration-300">
              <div className="flex items-center justify-between p-8 bg-slate-50 border-b border-slate-100 shrink-0">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-sm"><Truck className="w-6 h-6 text-blue-600" /></div>
                    <div>
                       <h2 className="font-medium text-xl text-slate-900 tracking-tight uppercase italic">{selectedGRN.serial_no_formatted || selectedGRN.grn_number}</h2>
                       <p className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-1">Goods Receipt Audit Trail</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-3">
                   <button 
                     onClick={() => window.print()} 
                     disabled={!detailedGRN}
                     className={clsx(
                       "px-6 py-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest transition-all rounded-2xl shadow-sm italic",
                       !detailedGRN ? "opacity-30 grayscale cursor-not-allowed bg-slate-100 text-slate-400" : "bg-white border border-slate-200 text-slate-900 hover:border-slate-300 hover:text-slate-900"
                     )}
                   >
                     <Printer className="w-4 h-4" /> 
                     {!detailedGRN ? 'Awaiting Data...' : 'Industrial Print'}
                   </button>
                   <button onClick={() => setSelectedGRN(null)} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-900 font-medium hover:text-slate-900 transition-all shadow-sm"><X className="w-6 h-6" /></button>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
                 
                 {/* Logistics Metadata */}
                 <div className="grid grid-cols-4 gap-5">
                    <div className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm">
                       <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Vendor</span>
                       <div className="text-sm font-medium text-slate-900 mt-2 uppercase truncate italic">{selectedGRN.vendor_name || 'Direct'}</div>
                    </div>
                    <div className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm">
                       <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Vehicle</span>
                       <div className="text-sm font-medium text-blue-600 mt-2 uppercase font-mono italic">{selectedGRN.vehicle_number || '---'}</div>
                    </div>
                    <div className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm">
                       <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Gate Pass</span>
                       <div className="text-sm font-medium text-slate-900 mt-2 uppercase font-mono italic">{selectedGRN.gate_pass_no || '---'}</div>
                    </div>
                    <div className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm">
                       <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Receipt Date</span>
                       <div className="text-sm font-medium text-slate-900 mt-2 uppercase italic">{dayjs(selectedGRN.grn_date).format('DD MMM YYYY')}</div>
                    </div>
                 </div>

                 {/* Material Grid */}
                 <div className="border border-slate-200 rounded-[2.5rem] overflow-hidden bg-white shadow-sm">
                    <table className="w-full text-xs">
                       <thead className="bg-slate-50 border-b border-slate-100 uppercase">
                          <tr>
                             <th className="p-6 font-medium text-slate-900 font-medium tracking-widest border-r border-slate-100 text-left italic">Description</th>
                             <th className="p-6 font-medium text-slate-900 font-medium tracking-widest border-r border-slate-100 text-center w-40 italic">Qty Received</th>
                             <th className="p-6 font-medium text-slate-900 font-medium tracking-widest border-r border-slate-100 text-center w-32 italic">Batch/Lot</th>
                             <th className="p-6 font-medium text-slate-900 font-medium tracking-widest text-left italic">Quality Observation</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                          {(detailedGRN?.items || []).map((it, i) => (
                            <tr key={i} className="hover:bg-slate-50/50 transition-all">
                               <td className="p-6 border-r border-slate-100">
                                  <div className="text-slate-900 font-medium text-sm uppercase tracking-tight italic">{it.material_name}</div>
                               </td>
                               <td className="p-6 text-center border-r border-slate-100">
                                  <div className="text-blue-600 font-medium text-xl font-mono tracking-tighter italic">{parseFloat(it.quantity_received).toLocaleString()}</div>
                                  <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-1">{it.unit}</div>
                               </td>
                               <td className="p-6 text-center border-r border-slate-100">
                                  <div className="text-slate-900 font-medium text-[10px] uppercase tracking-tighter italic">{it.batch_number || '---'}</div>
                                  {it.expiry_date && <div className="text-[8px] font-medium text-slate-900 font-medium mt-1 uppercase">Exp: {dayjs(it.expiry_date).format('DD MMM YY')}</div>}
                               </td>
                               <td className="p-6 text-slate-900 font-medium italic">
                                  {it.quality_remarks || 'No issues observed during inwarding.'}
                               </td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>

                 {/* Dual Stage Approvalvisualization */}
                 <div className="space-y-6">
                    <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.2em] flex items-center gap-2 italic">
                       <ShieldCheck className="w-4 h-4 text-emerald-500" /> Administrative Authorization Chain
                    </h3>
                    <div className="grid grid-cols-2 gap-5">
                       {/* Stores Stage */}
                       <div className={clsx('bg-white p-6 border rounded-[2rem] transition-all relative overflow-hidden shadow-sm', 
                         selectedGRN.verified_stores_by ? 'border-amber-200' : 'border-slate-200 opacity-60 grayscale'
                       )}>
                          <div className="flex items-center gap-5 relative z-10">
                             <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm', 
                               selectedGRN.verified_stores_by ? 'bg-amber-50 border border-amber-100 text-amber-600' : 'bg-slate-50 border border-slate-200 text-slate-400'
                             )}>
                                <UserCheck className="w-6 h-6" />
                             </div>
                             <div>
                                <div className="text-[11px] font-medium text-slate-900 uppercase tracking-widest italic">Stores Verified</div>
                                <div className="text-[9px] text-slate-900 font-medium uppercase mt-1.5 tracking-tight">
                                   {selectedGRN.verified_stores_by ? `Confirmed on ${dayjs(selectedGRN.verified_stores_at).format('DD MMM')}` : 'Awaiting Storekeeper Sign-off'}
                                </div>
                             </div>
                          </div>
                       </div>

                       {/* QC Stage */}
                       <div className={clsx('bg-white p-6 border rounded-[2rem] transition-all relative overflow-hidden shadow-sm', 
                         selectedGRN.approved_qc_by ? 'border-emerald-200' : 'border-slate-200 opacity-60 grayscale'
                       )}>
                          <div className="flex items-center gap-5 relative z-10">
                             <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm', 
                               selectedGRN.approved_qc_by ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' : 'bg-slate-50 border border-slate-200 text-slate-400'
                             )}>
                                <ShieldCheck className="w-6 h-6" />
                             </div>
                             <div>
                                <div className="text-[11px] font-medium text-slate-100 uppercase tracking-widest italic">QC Approval (Inventory Entry)</div>
                                <div className="text-[9px] text-slate-900 font-medium uppercase mt-1.5 tracking-tight">
                                   {selectedGRN.approved_qc_by ? `Certified on ${dayjs(selectedGRN.approved_qc_at).format('DD MMM')}` : 'Awaiting Engineering / QC Clearance'}
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>

                 {/* Actions */}
                 {currentAction && (
                    <div className="p-8 border border-blue-200 bg-blue-50 rounded-[2.5rem] space-y-6 shadow-sm">
                       <div className="flex items-center gap-5">
                          <div className="w-14 h-14 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
                             <Check className="w-8 h-8" strokeWidth={3} />
                          </div>
                          <div>
                             <h3 className="text-xl font-medium text-slate-900 uppercase tracking-tight italic">Authorization Required: {currentAction.label}</h3>
                             <p className="text-[10px] text-blue-600 font-medium uppercase tracking-widest mt-1">Please confirm material inward details to proceed.</p>
                          </div>
                       </div>
                       <button 
                         onClick={() => approveMutation.mutate({ id: selectedGRN.id, stage: currentAction.id })}
                         disabled={approveMutation.isPending}
                         className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-blue-600/20 italic"
                       >
                         {approveMutation.isPending ? 'Signing Document...' : `Confirm & Authorize ${currentAction.label.split(' ')[0]}`}
                       </button>
                    </div>
                 )}
              </div>

              {/* Native Print - Invisible on Screen */}
              <div className="grn-print-zone">
                 <GRNPrintTemplate data={detailedGRN} />
              </div>

              <style dangerouslySetInnerHTML={{ __html: `
                 @media screen { .grn-print-zone { display: none !important; } }
                 @media print {
                   body * { visibility: hidden !important; }
                   .grn-print-zone, .grn-print-zone * { visibility: visible !important; }
                   .grn-print-zone { 
                     position: absolute !important; left: 0 !important; top: 0 !important; border: 0 !important;
                     width: 100% !important; display: flex !important; justify-content: center !important;
                     background: white !important; z-index: 999999 !important;
                   }
                   @page { size: A4 portrait; margin: 0; }
                 }
              `}} />
           </div>
        </div>
      )}

      {/* Inwarding Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="bg-white border border-slate-200 rounded-[3.5rem] w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in duration-300">
             <div className="flex items-center justify-between p-8 bg-slate-50 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-sm"><Plus className="w-6 h-6 text-blue-600" /></div>
                   <div>
                     <h2 className="text-xl font-medium text-slate-900 uppercase tracking-tight italic">Material Inward Entry</h2>
                     <p className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-1">Industrial Store Logistics Inwarding Form</p>
                   </div>
                </div>
                <button onClick={() => setShowForm(false)} className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-900 font-medium hover:text-slate-900 transition-all shadow-sm"><X className="w-6 h-6" /></button>
             </div>

             <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
                {/* PO Reconciliation */}
                <div className="bg-white border-2 border-slate-200 border-dashed p-8 rounded-[2.5rem]">
                   <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2 text-slate-500">
                        <FastForward className="w-4 h-4" />
                        <span className="text-[10px] font-medium uppercase tracking-widest italic">Rapid Link to Purchase Order</span>
                      </div>
                   </div>
                   <select 
                     className="w-full py-4 px-5 bg-slate-50 border border-slate-200 font-medium text-xs text-blue-600 uppercase tracking-widest rounded-2xl outline-none focus:border-blue-400 transition-all shadow-sm appearance-none italic"
                     value={formData.po_id}
                     onChange={(e) => handlePOSelect(e.target.value)}
                   >
                     <option value="">Manual Entry (No PO Reference)</option>
                     {(poData ?? []).map(po => (
                        <option key={po.id} value={po.id}>{po.serial_no_formatted || po.po_number} — {po.vendor_name}</option>
                     ))}
                   </select>
                </div>

                <div className="grid grid-cols-3 gap-6 bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
                   <div className="space-y-3">
                     <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Inwarding Project *</label>
                     <select className="w-full py-4 px-5 bg-slate-50 border border-slate-200 font-medium text-xs text-slate-900 uppercase tracking-widest rounded-2xl outline-none focus:border-blue-400 transition-all shadow-sm appearance-none italic" value={formData.project_id} onChange={e => setFormData(p => ({ ...p, project_id: e.target.value }))}>
                        <option value="">Select Project</option>
                        {(projectsData ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                   </div>
                   <div className="space-y-3">
                     <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Inwarding Date *</label>
                     <input type="date" className="w-full py-4 px-5 bg-slate-50 border border-slate-200 font-medium text-xs text-slate-900 uppercase tracking-widest rounded-2xl outline-none focus:border-blue-400 transition-all shadow-sm italic" value={formData.grn_date} onChange={e => setFormData(p => ({ ...p, grn_date: e.target.value }))} />
                   </div>
                   <div className="space-y-3">
                     <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Site In-Charge / Receiver</label>
                     <input className="w-full py-4 px-5 bg-slate-100 border border-slate-200 font-medium text-xs text-slate-900 font-medium uppercase tracking-widest rounded-2xl italic" value={user?.name} disabled />
                   </div>
                </div>

                {/* Shipping Metadata */}
                <div className="grid grid-cols-4 gap-6 bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
                   <div className="space-y-3">
                     <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Vehicle Number</label>
                     <input className="w-full bg-slate-50 border border-slate-200 py-3.5 px-4 rounded-xl text-xs font-medium text-slate-900 uppercase tracking-widest outline-none focus:border-blue-400 shadow-sm transition-all italic" placeholder="MH-XX-XXXX" value={formData.vehicle_number} onChange={e => setFormData(p => ({ ...p, vehicle_number: e.target.value }))} />
                   </div>
                   <div className="space-y-3">
                     <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Driver Name</label>
                     <input className="w-full bg-slate-50 border border-slate-200 py-3.5 px-4 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-blue-400 shadow-sm transition-all italic" placeholder="Driver Name" value={formData.driver_name} onChange={e => setFormData(p => ({ ...p, driver_name: e.target.value }))} />
                   </div>
                   <div className="space-y-3">
                     <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Challan Number</label>
                     <input className="w-full bg-slate-50 border border-slate-200 py-3.5 px-4 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-blue-400 shadow-sm transition-all uppercase italic" placeholder="CH-001" value={formData.challan_number} onChange={e => setFormData(p => ({ ...p, challan_number: e.target.value }))} />
                   </div>
                   <div className="space-y-3">
                     <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Gate Pass No</label>
                     <input className="w-full bg-slate-50 border border-slate-200 py-3.5 px-4 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-blue-400 shadow-sm transition-all uppercase italic" placeholder="GP-001" value={formData.gate_pass_no} onChange={e => setFormData(p => ({ ...p, gate_pass_no: e.target.value }))} />
                   </div>
                </div>

                {/* Items Block */}
                <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-sm space-y-6">
                   <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                      <h3 className="text-xs font-medium text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2 italic"><Calculator className="w-4 h-4 text-blue-500" /> Physical Material List</h3>
                      {!formData.po_id && (
                        <button onClick={() => setItems(p => [...p, { material_name: '', quantity_received: '', unit: 'Nos', quality_remarks: '' }])} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 hover:border-blue-300 hover:text-blue-600 text-[10px] font-medium rounded-xl transition-all shadow-sm uppercase tracking-widest italic">+ Add Item</button>
                      )}
                   </div>
                   <div className="space-y-4">
                      {items.map((it, i) => (
                        <div key={i} className="grid grid-cols-12 gap-4 p-6 bg-slate-50 border border-slate-200 rounded-[2rem] shadow-sm relative group hover:border-blue-300 transition-all">
                           <div className="col-span-3 space-y-2">
                              <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Material Description</label>
                              <input className="w-full bg-white border border-slate-200 py-3 px-4 rounded-xl text-xs font-medium text-slate-900 uppercase italic outline-none focus:border-blue-400 shadow-sm transition-all" value={it.material_name} onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, material_name: e.target.value } : x))} />
                           </div>
                           <div className="col-span-2 space-y-2">
                              <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Qty Recd</label>
                              <input type="number" step="any" min="0" className="w-full bg-white border border-slate-200 py-3 px-4 rounded-xl text-xs font-medium text-blue-600 font-mono outline-none focus:border-blue-400 shadow-sm transition-all" value={it.quantity_received} onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, quantity_received: e.target.value } : x))} />
                           </div>
                           <div className="col-span-2 space-y-2">
                              <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Unit</label>
                              <select className="w-full bg-white border border-slate-200 py-3 px-4 rounded-xl text-xs font-medium text-slate-900 uppercase tracking-widest outline-none focus:border-blue-400 shadow-sm transition-all appearance-none italic" value={it.unit} onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, unit: e.target.value } : x))}>
                                 {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                           </div>
                           <div className="col-span-2 space-y-2">
                              <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Batch/Lot #</label>
                              <input className="w-full bg-white border border-slate-200 py-3 px-4 rounded-xl text-xs font-medium text-slate-900 uppercase outline-none focus:border-blue-400 shadow-sm transition-all italic" placeholder="BAT-001" value={it.batch_number} onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, batch_number: e.target.value } : x))} />
                           </div>
                           <div className="col-span-2 space-y-2">
                              <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Expiry Date</label>
                              <input type="date" className="w-full bg-white border border-slate-200 py-3 px-4 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-blue-400 shadow-sm transition-all italic" value={it.expiry_date} onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, expiry_date: e.target.value } : x))} />
                           </div>
                           <div className="col-span-2 space-y-2">
                              <label className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">QC Remarks</label>
                              <input className="w-full bg-white border border-slate-200 py-3 px-4 rounded-xl text-xs font-medium text-slate-900 italic outline-none focus:border-blue-400 shadow-sm transition-all" placeholder="Visual OK" value={it.quality_remarks} onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, quality_remarks: e.target.value } : x))} />
                           </div>
                           <div className="col-span-1 flex items-end justify-center pb-1.5">
                              {!formData.po_id && (
                                <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200 rounded-xl transition-all shadow-sm"><X className="w-5 h-5" /></button>
                              )}
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
             </div>

             <div className="flex gap-4 p-6 bg-slate-50 border-t border-slate-100 shrink-0">
               <button onClick={() => setShowForm(false)} className="flex-1 py-5 bg-white border border-slate-200 text-slate-900 hover:text-slate-900 font-medium uppercase text-[11px] tracking-[0.2em] rounded-[2rem] transition-all hover:bg-slate-50 hover:border-slate-300 shadow-sm italic">Discard Receipt</button>
               <button 
                 onClick={() => {
                   if (!formData.project_id) return toast.error('Select a project');
                   if (!formData.grn_date)   return toast.error('Select a GRN date');
                   const badItem = items.findIndex(it => !it.material_name?.trim() || !it.quantity_received || !it.unit);
                   if (badItem !== -1) return toast.error(`Item ${badItem + 1}: fill in material name, quantity and unit`);
                   createMutation.mutate({ ...formData, items });
                 }}
                 disabled={createMutation.isPending || !formData.project_id || items.length === 0}
                 className="flex-[2] py-5 bg-blue-600 text-white font-medium uppercase text-[11px] tracking-[0.2em] rounded-[2rem] hover:bg-blue-500 disabled:opacity-50 transition-all shadow-xl shadow-blue-600/30 italic"
               >
                 {createMutation.isPending ? 'Processing Inwarding...' : 'Record Inward Delivery'}
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
