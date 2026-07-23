// src/pages/procurement/POPage.jsx
import RecordAttachments from '../../components/shared/RecordAttachments';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import {
  ShoppingCart, Plus, X, Check, Clock, Search, Download,
  Printer, AlertCircle, ChevronRight, Trash2, Activity,
  Package, Building2, Calendar, BadgeCheck, FileText,
  CheckCircle2, UserCheck, Landmark, XCircle, Upload,
  Receipt, TrendingUp, IndianRupee, FileSpreadsheet,
  Mail, Send, Edit2, ChevronsUpDown, ChevronUp, ChevronDown, Lock, AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { poAPI, vendorAPI, projectAPI, mrsAPI, inventoryAPI, companySettingsAPI, boqAPI } from '../../api/client';
import MaterialCombobox from '../../components/shared/MaterialCombobox';
import SearchableSelect from '../../components/shared/SearchableSelect';
import VendorSelect from '../../components/shared/VendorSelect';
import { BOQ_COST_HEADS } from '../../constants/boqCostHeads';
import { getBillingAddress, getDeliveryAddress, isLancoProject } from '../../constants/poAddresses';
import { Z_INP, Z_CARD, Z_HEAD, Z_LABEL } from '../../constants/zohoStyles';
import { FIELD_HL } from '../../constants/fieldStyles';
import toast from 'react-hot-toast';
import POPrintTemplate from './POPrintTemplate';

const DEFAULT_PO_INTRO = 'We hereby place an order on you for supply of the following materials with same terms and conditions as per original order.';
const DEFAULT_PO_TERMS = `1. All Bills and DCs should contain the Reference of the Concerned PO.
2. All materials supplied will be subject to inspections & test when received at our site.
3. Final Bill shall be cleared after Certification by the Concerned Engg & on actual measurements taken at Site.
4. If any Goods damaged or rejected must be replaced immediately at the suppliers own expenses.
5. Payment : 60Days from the date of supply
6. Lead Time : Immediate
7. Transportation & Loading inclusive, unloading our end
8. Contact details of Supplier:
9. Bill Requirement: Bill must carry details of Specific Order number, site acceptance signature along with seal, buyer and supplier GST number, HSN Code, Bill number, LUT details, Transporter challan etc.
10. Quantity Certification: Quantity mentioned in the Order may be approximate, actual & mutually certified measurement will be accounted for the payment.
11. Price Escalation: Above mentioned in price is absolute frozen for this Order, in case of any price escalation "after" or "before/in-between" will be considered breach of Contract terms & will not be entertained.
12. Cancellation: Time is of the essence in this order. Buyer reserves the right to cancel this order, or any portion of this order, without liability, if delivery is not made when and as specified, or Seller fails to meet contract commitments as to exact time, price, quality or quantity.
13. Any dispute or difference shall be subject to jurisdiction of courts at Bangalore.
14. GST TERMS: If input tax credit is denied due to vendor non-compliance, BCIM may withhold/recover such amounts from subsequent payments until credit is reinstated.
15. TDS as may be applicable under Income Tax Laws and GST Laws shall be deducted at applicable rates.
16. Supplier shall ensure environment, health and safety compliance during transit and delivery.
17. Three copies of Tax invoice (original, duplicate & triplicate) to be submitted along with each consignment supply.
18. Order to be acknowledged and accepted or reverted if any changes within 4 hours, otherwise it will be considered as accepted.`;

import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';

// 2-Stage Approval: Procurement → MD
// Flow: pending → verified_audit (Procurement Approved) → approved (MD Authorized)
const STATUS_CONFIG = {
  draft:          { label: 'Draft',               short: 'Draft',       color: 'bg-slate-100 text-slate-600 border-slate-200',    dot: 'bg-slate-400',   icon: FileText,     stage: 0 },
  pending:        { label: 'Pending Procurement', short: 'Pending',     color: 'bg-yellow-50 text-yellow-700 border-yellow-200',  dot: 'bg-yellow-500',  icon: Clock,        stage: 1 },
  verified_audit: { label: 'Procurement Approved',short: 'Proc OK',    color: 'bg-blue-50 text-blue-700 border-blue-200',        dot: 'bg-blue-500',    icon: UserCheck,    stage: 2 },
  released_mgmt:  { label: 'Procurement Approved',short: 'Proc OK',    color: 'bg-blue-50 text-blue-700 border-blue-200',        dot: 'bg-blue-500',    icon: UserCheck,    stage: 2 },
  approved:       { label: 'MD Authorized',       short: 'Authorized',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200',dot: 'bg-emerald-500', icon: CheckCircle2, stage: 3 },
  part_received:  { label: 'Part Received',       short: 'Part Rcvd',  color: 'bg-cyan-50 text-cyan-700 border-cyan-200',        dot: 'bg-cyan-500',    icon: Package,      stage: 4 },
  fully_received: { label: 'Fully Received',      short: 'Received',    color: 'bg-green-50 text-green-700 border-green-200',     dot: 'bg-green-500',   icon: Check,        stage: 5 },
  rejected:       { label: 'Rejected',            short: 'Rejected',    color: 'bg-red-50 text-red-700 border-red-200',           dot: 'bg-red-400',     icon: XCircle,      stage: 0 },
  cancelled:      { label: 'Terminated',          short: 'Terminated',  color: 'bg-orange-50 text-orange-700 border-orange-200',  dot: 'bg-orange-400',  icon: XCircle,      stage: 0 },
};

const STAGE_ACTIONS = [
  { id: 'procurement-approve', label: 'Procurement Approve', reqStatus: 'pending'        },
  { id: 'md-approve',          label: 'MD Authorize',        reqStatus: 'verified_audit' },
];

const inr  = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrCompact = v => {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};
const fmt  = d => d ? dayjs(d).format('DD-MM-YYYY') : '—';

/* ─── Kpi3DCard — tilt-on-hover 3D stat tile ─── */
function Kpi3DCard({ icon: Icon, value, label, sub, iconBg, iconText, active, onClick, index = 0, title }) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 });

  const handleMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ rx: (0.5 - py) * 12, ry: (px - 0.5) * 12, gx: px * 100, gy: py * 100 });
  };
  const handleLeave = () => setTilt({ rx: 0, ry: 0, gx: 50, gy: 50 });

  const Tag = onClick ? motion.button : motion.div;
  return (
    <Tag
      ref={ref}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      title={title}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.035, ease: 'easeOut' }}
      style={{ perspective: 700 }}
      className="relative text-left"
    >
      <motion.div
        animate={{ rotateX: tilt.rx, rotateY: tilt.ry, scale: tilt.rx || tilt.ry ? 1.03 : 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        style={{ transformStyle: 'preserve-3d' }}
        className={clsx(
          'relative bg-white border rounded-2xl p-4 overflow-hidden',
          active ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-lg' : 'border-slate-200 shadow-sm hover:shadow-xl'
        )}
      >
        <div className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-200"
          style={{
            opacity: tilt.rx || tilt.ry ? 1 : 0,
            background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(99,102,241,0.14), transparent 62%)`,
          }} />
        <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-3 shadow-sm', iconBg)}
          style={{ transform: 'translateZ(24px)' }}>
          <Icon className={clsx('w-4.5 h-4.5', iconText)} style={{ transform: 'translateZ(4px)' }} />
        </div>
        <div className="text-2xl font-bold text-slate-800 leading-tight" style={{ transform: 'translateZ(18px)' }}>{value}</div>
        <div className="text-xs text-slate-400 mt-0.5" style={{ transform: 'translateZ(10px)' }}>{label}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-1 truncate" style={{ transform: 'translateZ(10px)' }}>{sub}</div>}
      </motion.div>
    </Tag>
  );
}

/* ─── Signature Pad Modal ─── */
function SignaturePadModal({ signerName, signerRole, onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const lastPos   = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };
  const startDraw = e => { e.preventDefault(); drawing.current = true; lastPos.current = getPos(e, canvasRef.current); };
  const draw = e => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    lastPos.current = pos;
  };
  const endDraw = () => { drawing.current = false; };
  const clear = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };
  const save = () => {
    const canvas = canvasRef.current;
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const hasSign = Array.from(data).some((v, i) => i % 4 !== 3 && v < 240);
    if (!hasSign) return toast.error('Please draw your signature first');
    onSave(canvas.toDataURL('image/png'));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-medium text-slate-800">Digital Signature</h3>
            <p className="text-xs text-slate-500 mt-0.5">{signerRole} — {signerName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs text-slate-500 mb-2 text-center">Draw your signature in the box below</p>
          <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white cursor-crosshair">
            <canvas ref={canvasRef} width={420} height={160}
              style={{ display: 'block', width: '100%', height: '160px', touchAction: 'none' }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-slate-400 italic">Use mouse or touch to sign</p>
            <button onClick={clear} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>
        <div className="mx-5 mb-4 p-3 bg-slate-50 rounded-lg">
          <p className="text-[11px] text-slate-500">
            Signing as: <span className="font-medium text-slate-700">{signerName}</span>
            &nbsp;·&nbsp; {signerRole}
            &nbsp;·&nbsp; {dayjs().format('DD-MM-YYYY HH:mm')}
          </p>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 hover:bg-slate-50">Cancel</button>
          <button onClick={save} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Confirm Signature
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap', cfg.color)}>
      <Icon size={11} strokeWidth={2.5} />
      {cfg.short}
    </span>
  );
}

function SendPOMailModal({ po, onClose, onSent }) {
  const [form, setForm] = useState({ to: '', cc: '', subject: '', body: '' });
  const { data, isLoading } = useQuery({
    queryKey: ['po-mail-preview', po.id],
    queryFn: () => poAPI.mailPreview(po.id).then(r => r.data?.data),
    enabled: !!po?.id,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      to: (data.to || []).join(', '),
      cc: (data.cc || []).join(', '),
      subject: data.subject || '',
      body: data.body || '',
    });
  }, [data]);

  const sendMut = useMutation({
    mutationFn: () => poAPI.sendToVendor(po.id, form),
    onSuccess: (res) => {
      if (res.data?.data?.sent) {
        toast.success('PO sent to vendor');
      } else {
        toast.error(res.data?.data?.mail_result?.reason || 'Mail not sent');
      }
      onSent?.();
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to send PO mail'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Mail className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Send Purchase Order to Vendor</h3>
              <p className="text-xs text-slate-500">{po.po_ref_no || po.po_number || po.serial_no_formatted} - {(po.vendor_name || '').toUpperCase()}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-400">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading mail preview...
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">To - Vendor Email *</label>
              <input value={form.to} onChange={e => set('to', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                placeholder="vendor@example.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">CC - Internal Team</label>
              <input value={form.cc} onChange={e => set('cc', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                placeholder="procurement@bcim.in, accounts@bcim.in, pm@bcim.in" />
              <p className="text-[11px] text-slate-400 mt-1">Separate multiple email IDs with comma.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
              <input value={form.subject} onChange={e => set('subject', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Mail Message</label>
              <textarea value={form.body} onChange={e => set('body', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[130px] outline-none focus:border-indigo-400"
                placeholder="Dear Sir/Madam, ..." />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              The email includes PO summary and line items. Use Print in the PO screen if a separate PDF copy is required.
            </div>
          </div>
        )}

        <div className="px-5 py-4 border-t bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white">Cancel</button>
          <button onClick={() => sendMut.mutate()} disabled={!form.to.trim() || sendMut.isPending || isLoading}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            <Send className="w-4 h-4" /> {sendMut.isPending ? 'Sending...' : 'Send to Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

const INP = Z_INP;

/* ─── New PO Modal ─── */
function NewPOModal({ onClose, vendors, projects, mrsList = [], onCreate, onUpdate, isPending, prefill, editingPO, company }) {
  const queryClient = useQueryClient();
  const isEditing = !!editingPO;
  const [form, setForm] = useState({
    mrs_id:           editingPO?.mrs_id       || prefill?.mrs_id       || '',
    mrs_ids:          editingPO?.mrs_ids?.length ? editingPO.mrs_ids
                        : (editingPO?.mrs_id ? [editingPO.mrs_id]
                          : (prefill?.mrs_id ? [prefill.mrs_id] : [])),
    vendor_id:        editingPO?.vendor_id    || prefill?.vendor_id    || '',
    project_id:       editingPO?.project_id   || prefill?.project_id   || '',
    po_date:          editingPO?.po_date      ? dayjs(editingPO.po_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    delivery_date:    editingPO?.delivery_date ? dayjs(editingPO.delivery_date).format('YYYY-MM-DD') : '',
    po_req_no:        editingPO?.po_req_no    || prefill?.mrs_ref || '',
    po_req_date:      editingPO?.po_req_date  ? dayjs(editingPO.po_req_date).format('YYYY-MM-DD') : '',
    approval_no:      editingPO?.approval_no  || '',
    delivery_address: editingPO?.delivery_address || '',
    order_intro:      editingPO?.order_intro  || DEFAULT_PO_INTRO,
    notes:            editingPO?.notes        || (prefill?.mrs_ref ? `Ref: CS / ${prefill.mrs_ref}` : ''),
    payment_terms:    editingPO?.payment_terms || '',
    tcs_amount:       editingPO?.tcs_amount   || '',
    terms_conditions: editingPO?.terms_conditions || DEFAULT_PO_TERMS,
    // ── Mockup parity fields ──
    department:       editingPO?.department   || '',
    cost_head:        editingPO?.cost_head    || '',
    currency:         editingPO?.currency     || 'INR',
    billing_address:  editingPO?.billing_address || '',
    freight_mode:     editingPO?.freight_mode || 'FOB – Destination',
    transport_mode:   editingPO?.transport_mode || 'Road',
    tax_type:         editingPO?.tax_type     || 'intra',
    gst_inclusive:    false,
    freight_charges:  editingPO?.freight_charges || '',
    loading_unloading_charges: editingPO?.loading_unloading_charges || '',
    insurance_charges: editingPO?.insurance_charges || '',
    tds_percent:      editingPO?.tds_percent  || '0',
    internal_remarks: editingPO?.internal_remarks || '',
    delivery_instructions: editingPO?.delivery_instructions || '',
  });
  const [step, setStep] = useState(1);
  const PO_WIZARD_STEPS = ['Vendor & Terms', 'Items & Pricing', 'Charges & Attachments', 'Review & Submit'];
  const [items, setItems] = useState(
    editingPO?.items?.length
      ? editingPO.items.map(it => ({
          material_name: it.material_name || '',
          quantity:      String(it.quantity || ''),
          unit:          it.unit || 'Nos',
          rate:          String(it.rate || ''),
          gst_rate:      String(it.gst_rate ?? '18'),
          hsn_code:      it.hsn_code || '',
          req_date:      it.req_date ? dayjs(it.req_date).format('YYYY-MM-DD') : '',
          mrs_item_id:   it.mrs_item_id || null,
          boq_item_id:   it.boq_item_id || '',
          boq_chapter:   it.boq_chapter || '',
          cost_head:     it.cost_head || '',
        }))
      : prefill?.items?.length
        ? prefill.items
        : [{ material_name: '', make_model: '', quantity: '', unit: 'Nos', rate: '', gst_rate: '18', hsn_code: '', req_date: '', item_code: '', discount_pct: '0', boq_item_id: '', boq_chapter: '', cost_head: '' }]
  );

  // Vendors mapped to the selected project — restricts the Vendor dropdown so
  // procurement users only see vendors approved for that project.
  const { data: projectVendors } = useQuery({
    queryKey: ['project-vendors-for-po', form.project_id],
    queryFn: () => vendorAPI.projectMap({ project_id: form.project_id }).then(r => r.data?.data || []),
    enabled: !!form.project_id,
  });
  // Inventory lookup — for material name combobox
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-lookup'],
    queryFn: () => inventoryAPI.itemsLookup().then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  // BOQ items for the selected project — drives Chapter + Line Item dropdowns on each PO line
  const { data: boqItemsRaw = [], isLoading: boqLoading } = useQuery({
    queryKey: ['boq-items-for-po', form.project_id],
    queryFn: () => boqAPI.list({ project_id: form.project_id }).then(r => r.data?.data ?? []),
    enabled: !!form.project_id,
    staleTime: 2 * 60 * 1000,
  });
  // Deduplicate by chapter_name (all items share chapter_no "01", so chapter_name is the real grouping key)
  const boqChapters = useMemo(() => {
    const seen = new Set();
    return boqItemsRaw
      .filter(it => {
        const key = it.chapter_name || it.chapter_no;
        if (!key || String(key).trim() === '') return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(it => ({ chapter_no: it.chapter_no, chapter_name: it.chapter_name || it.chapter_no }));
  }, [boqItemsRaw]);

  let vendorOptions = form.project_id && projectVendors?.length ? projectVendors : vendors;
  // Always include the PO's original vendor even if it's not in the project's
  // mapped list, so editing an existing PO never hides its current vendor.
  if (editingPO?.vendor_id && !vendorOptions.some(v => v.id === editingPO.vendor_id)) {
    const original = vendors.find(v => v.id === editingPO.vendor_id);
    if (original) vendorOptions = [...vendorOptions, original];
  }

  // Clear the selected vendor if it's not available for the now-selected project.
  // Skip this for the vendor the PO/prefill was already created with, so editing
  // an older PO (created before its vendor was mapped to the project) doesn't
  // silently wipe out the existing vendor.
  const originalVendorId = editingPO?.vendor_id || prefill?.vendor_id || '';
  useEffect(() => {
    if (form.project_id && form.vendor_id && form.vendor_id !== originalVendorId
        && projectVendors?.length && !projectVendors.some(v => v.id === form.vendor_id)) {
      setForm(p => ({ ...p, vendor_id: '' }));
    }
  }, [form.project_id, projectVendors]);

  // Auto-fill Billing / Delivery address from the selected project's known
  // addresses (same lookup used by the print template) — only when the user
  // hasn't already typed something into those fields.
  useEffect(() => {
    if (!form.project_id) return;
    const proj = projects.find(p => p.id === form.project_id);
    if (!proj) return;
    // Build billing address from live company settings, fall back to hardcoded default
    const BAD_ADDRESSES = ['jayanagar', 'bcim office', '29aaxcb2929p1z1'];
    const isLanco = isLancoProject(proj.project_code, proj.name);
    let billingAddr;
    if (isLanco) {
      billingAddr = getBillingAddress(proj.project_code, proj.name);
    } else if (company?.name && !BAD_ADDRESSES.some(b => (company.address || '').toLowerCase().includes(b))) {
      const lines = [company.name];
      if (company.address) lines.push(company.address);
      const cityState = [company.city, company.state && company.pincode ? `${company.state} – ${company.pincode}` : company.state].filter(Boolean).join(', ');
      if (cityState) lines.push(cityState);
      if (company.gstin) lines.push(`GSTIN: ${company.gstin}`);
      billingAddr = lines.join('\n');
    } else {
      billingAddr = getBillingAddress(proj.project_code, proj.name);
    }
    setForm(p => ({
      ...p,
      billing_address:  p.billing_address  || billingAddr,
      delivery_address: p.delivery_address || getDeliveryAddress(proj),
    }));
  }, [form.project_id]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const handleAddVendor = async (name) => {
    try {
      const res = await vendorAPI.create({ name });
      const newVendor = res.data?.data || res.data;
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      if (newVendor?.id) set('vendor_id', newVendor.id);
      toast.success(`Vendor "${name}" added`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add vendor');
    }
  };
  const setItem = (i, k, v) => setItems(p => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems(p => [...p, { material_name: '', make_model: '', quantity: '', unit: 'Nos', rate: '', gst_rate: '18', hsn_code: '', req_date: '', item_code: '', discount_pct: '0', boq_item_id: '', boq_chapter: '', cost_head: '' }]);
  const removeItem = i => setItems(p => p.filter((_, idx) => idx !== i));
  // Show an MR only if at least one item still has unordered quantity remaining.
  // Fully-covered MRs (all items ordered_qty >= quantity) are hidden.
  // MRs with no items are kept — they may be text-only or data is still loading.
  const hasBalance = (m) =>
    !m.items?.length || m.items.some(it => (parseFloat(it.quantity) || 0) > (parseFloat(it.ordered_qty) || 0));
  const activeMrsList = mrsList.filter(m => m.status !== 'rejected' && hasBalance(m));

  const mrLabel = (m) => m ? (m.serial_no_formatted || m.mrs_number || m.id?.slice(0, 8)) : '';
  const refsFor = (ids) => ids
    .map(id => mrLabel(activeMrsList.find(m => m.id === id)))
    .filter(Boolean)
    .join(', ');

  // Add an MR to the PO — appends its items to the existing list (multiple MRS per PO)
  const addMRS = (mrsId) => {
    if (!mrsId || form.mrs_ids.includes(mrsId)) return;
    const selected = activeMrsList.find(m => m.id === mrsId);
    if (!selected) return;
    // All MRS on one PO must belong to the same project
    if (form.project_id && selected.project_id && String(selected.project_id) !== String(form.project_id)) {
      toast.error('All MRs in one PO must belong to the same project');
      return;
    }
    const newIds = [...form.mrs_ids, mrsId];
    setForm(p => ({
      ...p,
      mrs_ids: newIds,
      mrs_id: newIds[0],
      project_id: p.project_id || selected.project_id || '',
      po_req_no: refsFor(newIds),
      po_req_date: p.po_req_date || (selected.created_at ? dayjs(selected.created_at).format('YYYY-MM-DD') : ''),
      delivery_date: p.delivery_date || (selected.required_by ? dayjs(selected.required_by).format('YYYY-MM-DD') : ''),
      notes: `Against MR ${refsFor(newIds)}`,
    }));
    const itemsWithBalance = (selected.items || []).map(it => {
      const reqQty = Number(it.effective_qty ?? it.md_approved_qty ?? it.quantity ?? 0);
      const orderedQty = Number(it.ordered_qty || 0);
      const balanceQty = Math.max(reqQty - orderedQty, 0);
      return { it, reqQty, orderedQty, balanceQty };
    });
    const fullyOrdered = itemsWithBalance.filter(x => x.orderedQty > 0 && x.balanceQty <= 0).length;
    const partiallyOrdered = itemsWithBalance.filter(x => x.orderedQty > 0 && x.balanceQty > 0).length;
    const appended = itemsWithBalance
      .filter(x => x.balanceQty > 0)
      .map(({ it, reqQty, orderedQty, balanceQty }) => ({
        material_name: it.material_name || it.description || '',
        make_model: '',
        quantity: orderedQty > 0 ? String(balanceQty) : (it.quantity || ''),
        unit: it.unit || 'Nos',
        rate: '',
        gst_rate: '18',
        hsn_code: it.hsn_code || '',
        req_date: selected.required_by ? dayjs(selected.required_by).format('YYYY-MM-DD') : '',
        mrs_item_id: it.id || null,
        _mrs_id: mrsId,
        _requested_qty: reqQty,
        _ordered_qty: orderedQty,
      }));
    if (fullyOrdered > 0) {
      toast(`${fullyOrdered} item(s) in ${mrLabel(selected)} already fully covered by a previous PO — skipped.`, { icon: '✅', duration: 5000 });
    }
    if (partiallyOrdered > 0) {
      toast(`${partiallyOrdered} item(s) in ${mrLabel(selected)} are partially ordered — quantities set to the remaining balance.`, { icon: '⚠️', duration: 5000 });
    }
    setItems(prev => {
      // Drop the single empty starter row before adding the first MR's items
      const base = (prev.length === 1 && !prev[0].material_name && !prev[0].quantity && !prev[0].rate) ? [] : prev;
      return appended.length ? [...base, ...appended] : base.length ? base : prev;
    });
  };

  // Remove an MR — drops the rows that came from it
  const removeMRS = (mrsId) => {
    const newIds = form.mrs_ids.filter(id => id !== mrsId);
    setForm(p => ({
      ...p,
      mrs_ids: newIds,
      mrs_id: newIds[0] || '',
      po_req_no: refsFor(newIds),
      notes: newIds.length ? `Against MR ${refsFor(newIds)}` : p.notes,
    }));
    setItems(prev => {
      const kept = prev.filter(it => it._mrs_id !== mrsId);
      return kept.length ? kept
        : [{ material_name: '', make_model: '', quantity: '', unit: 'Nos', rate: '', gst_rate: '18', hsn_code: '', req_date: '', item_code: '', discount_pct: '0' }];
    });
  };

  // Selected vendor object — drives the vendor preview card + state detection
  const selectedVendor = (vendorOptions.find(v => v.id === form.vendor_id) || vendors.find(v => v.id === form.vendor_id)) || null;

  // Per-line maths (taxable = qty × rate less line discount)
  const lineCalc = (it) => {
    const q = parseFloat(it.quantity) || 0, rt = parseFloat(it.rate) || 0;
    const disc = parseFloat(it.discount_pct) || 0, gr = parseFloat(it.gst_rate) || 0;
    const gross = q * rt;
    const taxable = gross * (1 - disc / 100);
    const gstAmt = taxable * gr / 100;
    return { gross, discountAmt: gross - taxable, taxable, gstAmt, total: taxable + gstAmt };
  };
  const grossTotal = items.reduce((s, it) => s + lineCalc(it).gross, 0);
  const totalDiscount = items.reduce((s, it) => s + lineCalc(it).discountAmt, 0);
  const subTotal = items.reduce((s, it) => s + lineCalc(it).taxable, 0); // taxable amount
  const totalGST = items.reduce((s, it) => s + lineCalc(it).gstAmt, 0);
  const tcsValue = parseFloat(form.tcs_amount || 0) || 0;
  const freight  = parseFloat(form.freight_charges || 0) || 0;
  const loading  = parseFloat(form.loading_unloading_charges || 0) || 0;
  const insurance = parseFloat(form.insurance_charges || 0) || 0;
  const freightGst = freight * 0.18;
  const tdsValue = subTotal * ((parseFloat(form.tds_percent) || 0) / 100);
  const isInter = form.tax_type === 'inter';
  const cgst = isInter ? 0 : totalGST / 2;
  const sgst = isInter ? 0 : totalGST / 2;
  const igst = isInter ? totalGST : 0;
  const grandTotal = subTotal + totalGST + tcsValue + freight + loading + insurance + freightGst - tdsValue;

  // GST break-up by rate, tracking which item numbers fall under each rate
  const gstByRate = {}; // rate -> { amount, nums: [] }
  items.forEach((it, idx) => {
    const c = lineCalc(it), r = parseFloat(it.gst_rate) || 0;
    if (c.taxable <= 0 || r <= 0) return;
    if (!gstByRate[r]) gstByRate[r] = { amount: 0, nums: [] };
    gstByRate[r].amount += c.gstAmt;
    gstByRate[r].nums.push(idx + 1);
  });
  const gstRates = Object.keys(gstByRate).map(Number).sort((a, b) => a - b);
  // Collapse item numbers into compact ranges: [1,2,5..20,23] -> "1-2, 5-20, 23"
  const fmtNos = (nums) => {
    const s = [...nums].sort((a, b) => a - b), out = [];
    let start = s[0], prev = s[0];
    for (let k = 1; k <= s.length; k++) {
      if (k < s.length && s[k] === prev + 1) { prev = s[k]; continue; }
      out.push(start === prev ? `${start}` : `${start}-${prev}`);
      if (k < s.length) { start = s[k]; prev = s[k]; }
    }
    return out.join(', ');
  };

  const PO_STEP_VALIDATORS = {
    1: () => {
      if (!form.vendor_id)  return 'Select a vendor';
      if (!form.project_id) return 'Select a project';
      if (!form.po_date)    return 'Enter the PO date';
      return null;
    },
    2: () => {
      if (items.some(it => !it.material_name?.trim() || !it.quantity || !it.rate))
        return 'All items need description, quantity and rate';
      return null;
    },
    3: () => null,
  };
  const goNext = () => {
    const err = PO_STEP_VALIDATORS[step]?.();
    if (err) return toast.error(err);
    setStep(s => Math.min(s + 1, PO_WIZARD_STEPS.length));
  };
  const goBack = () => setStep(s => Math.max(s - 1, 1));
  const saveDraft = () => {
    if (!form.project_id) return toast.error('Select a project before saving draft');
    const payload = { ...form, items, status: 'draft' };
    onCreate(payload);
  };

  const handleSubmit = (sendToVendor = false) => {
    for (const n of [1, 2]) {
      const err = PO_STEP_VALIDATORS[n]?.();
      if (err) { setStep(n); return toast.error(err); }
    }
    const payload = {
      ...form,
      delivery_date: form.delivery_date || null,
      items,
      mrs_ids: form.mrs_ids,
      mrs_id: form.mrs_ids[0] || prefill?.mrs_id || null,
      _send_to_vendor: sendToVendor,
    };
    if (isEditing) onUpdate(payload);
    else onCreate(payload);
  };

  const vendorInitials = (selectedVendor?.name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
  const PO_CHARGE_FIELDS = [
    ['Freight Charges (₹)', 'freight_charges', '18% GST'],
    ['Loading / Unloading (₹)', 'loading_unloading_charges', null],
    ['Insurance (₹)', 'insurance_charges', null],
  ];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div className="w-full h-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 flex-shrink-0 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400">Procurement <span className="text-slate-300">›</span> Purchase Orders <span className="text-slate-300">›</span> <b className="text-slate-700">{isEditing ? editingPO.po_number : 'New PO'}</b></div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-mono">{isEditing ? editingPO.po_number : 'Auto-generated'}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps bar */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white flex-shrink-0 overflow-x-auto">
          {PO_WIZARD_STEPS.map((label, i) => {
            const n = i + 1, done = n < step, active = n === step;
            return (
              <div key={label} className={clsx('flex items-center gap-2 py-2.5 pr-5 text-xs font-semibold whitespace-nowrap',
                done ? 'text-emerald-600' : active ? 'text-blue-600' : 'text-slate-400')}>
                <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500')}>
                  {done ? <Check className="w-3 h-3" /> : n}
                </span>
                {label}
                {n < PO_WIZARD_STEPS.length && <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-2" />}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">

          {prefill?.mrs_ref && step === 1 && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800">
              <ShoppingCart className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span><strong>Pre-filled from approved CS</strong> — rates and quantities pulled from comparative statement. Review before submitting.</span>
            </div>
          )}

          {/* ════════ STEP 1 — Vendor & Terms ════════ */}
          {step === 1 && <>
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}>PO Header</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 p-4">
              <Field label="PO Number"><input className={clsx(INP, 'bg-slate-50 text-slate-400 font-mono')} value={isEditing ? editingPO.po_number : 'Auto-generated'} readOnly /></Field>
              <Field label="PO Date *"><input type="date" className={INP} value={form.po_date} onChange={e => set('po_date', e.target.value)} /></Field>
              <Field label="Required By *"><input type="date" className={INP} value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} /></Field>
              <Field label="Project / Work Order *">
                <SearchableSelect value={form.project_id} onChange={v => set('project_id', v)}
                  options={projects.map(p => ({ value: p.id, label: p.name }))}
                  placeholder="Select project…" searchPlaceholder="Search projects…" footerLabel="projects" />
              </Field>
              <Field label="Department">
                <select className={INP} value={form.department} onChange={e => set('department', e.target.value)}>
                  <option value="">— Select —</option>
                  {['Civil Works', 'MEP', 'Finishing', 'Admin'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Cost Head">
                <select className={INP} value={form.cost_head} onChange={e => set('cost_head', e.target.value)}>
                  <option value="">— Select —</option>
                  {BOQ_COST_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
              <Field label="Currency">
                <select className={INP} value={form.currency} onChange={e => set('currency', e.target.value)}>
                  <option value="INR">INR – Indian Rupee</option>
                  <option value="USD">USD – US Dollar</option>
                </select>
              </Field>
            </div>
          </div>

          <div className={Z_CARD}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-[13px] font-semibold text-slate-700"><Building2 className="w-3.5 h-3.5 inline mr-1.5 text-blue-500" />Vendor Information</h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
              <div className="space-y-3">
                <Field label="Vendor *">
                  <VendorSelect value={form.vendor_id} onChange={v => set('vendor_id', v)}
                    options={vendorOptions.map(v => ({ value: v.id, label: v.name, sublabel: v.vendor_type ? v.vendor_type.replace(/_/g, ' ') : '' }))}
                    placeholder="Select vendor…" searchPlaceholder="Search vendors…" footerLabel="vendors"
                    onAddNew={handleAddVendor} addNewLabel="vendor" />
                </Field>
                {selectedVendor && (
                  <div className="flex gap-3 items-start rounded-md border border-blue-100 bg-blue-50 px-3.5 py-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{vendorInitials}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-blue-700 truncate">{selectedVendor.name}</p>
                      <p className="text-[11px] text-slate-600 truncate">
                        {selectedVendor.city || selectedVendor.state ? `📍 ${[selectedVendor.city, selectedVendor.state].filter(Boolean).join(', ')}` : ''}
                        {selectedVendor.phone ? `  ☎ ${selectedVendor.phone}` : ''}
                      </p>
                      {selectedVendor.gstin && <p className="text-[11px] font-mono text-slate-500 mt-0.5">GSTIN: {selectedVendor.gstin}</p>}
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {selectedVendor.gstin && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">✓ GST Registered</span>}
                        <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-medium', isInter ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>{isInter ? 'Inter State' : 'Same State'}</span>
                      </div>
                    </div>
                  </div>
                )}
                <Field label="MR Number(s)">
                  <select className={INP} value="" onChange={e => { addMRS(e.target.value); e.target.value = ''; }}>
                    <option value="">+ Add MR / Manual PO...</option>
                    {activeMrsList
                      .filter(m => !form.mrs_ids.includes(m.id))
                      .filter(m => !form.project_id || String(m.project_id) === String(form.project_id))
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {(m.serial_no_formatted || m.mrs_number || m.id?.slice(0, 8))} — {(m.status || 'raised').replaceAll('_', ' ')}
                        </option>
                      ))}
                  </select>
                  {form.mrs_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {form.mrs_ids.map(id => (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-800">
                          {mrLabel(activeMrsList.find(m => m.id === id)) || id.slice(0, 8)}
                          <button type="button" onClick={() => removeMRS(id)} className="hover:text-amber-950"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </Field>
              </div>
              <div className="space-y-3">
                <Field label="Billing Address">
                  <textarea rows={2} className={clsx(INP, 'h-auto py-2 resize-none')} placeholder="Vendor billing address" value={form.billing_address} onChange={e => set('billing_address', e.target.value)} />
                </Field>
                <Field label="Delivery Address">
                  <textarea rows={2} className={clsx(INP, 'h-auto py-2 resize-none')} placeholder="Site delivery address, contact & phone" value={form.delivery_address} onChange={e => set('delivery_address', e.target.value)} />
                </Field>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 px-4 pb-4">
              <Field label="Payment Terms">
                <input className={INP} list="payment-terms-list" placeholder="e.g. Net 30 Days" value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} />
                <datalist id="payment-terms-list">
                  {['Net 30 Days', 'Net 15 Days', 'Advance 50% + Net 30', 'On Delivery', '100% Advance'].map(o => <option key={o} value={o} />)}
                </datalist>
              </Field>
              <Field label="Freight / Delivery">
                <select className={INP} value={form.freight_mode} onChange={e => set('freight_mode', e.target.value)}>
                  {['FOB – Destination', 'FOB – Origin', 'Ex-Works'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Mode of Transport">
                <select className={INP} value={form.transport_mode} onChange={e => set('transport_mode', e.target.value)}>
                  {['Road', 'Rail', 'Air'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          </div>
          </>}

          {/* ════════ STEP 2 — Items & Pricing ════════ */}
          {step === 2 && <>
          <div className={Z_CARD}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-[13px] font-semibold text-slate-700"><Package className="w-3.5 h-3.5 inline mr-1.5 text-blue-500" />Material / Service Items</h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  GST:
                  <div className="flex border border-slate-200 rounded-md overflow-hidden">
                    {['Excl.', 'Incl.'].map((l, i) => (
                      <button key={l} type="button" onClick={() => set('gst_inclusive', i === 1)}
                        className={clsx('px-2.5 py-1 text-[11px] font-medium', (form.gst_inclusive ? i === 1 : i === 0) ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500')}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  Tax:
                  <div className="flex border border-slate-200 rounded-md overflow-hidden">
                    {[['intra', 'CGST+SGST'], ['inter', 'IGST']].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => set('tax_type', v)}
                        className={clsx('px-2.5 py-1 text-[11px] font-medium', form.tax_type === v ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500')}>{l}</button>
                    ))}
                  </div>
                </div>
                <button onClick={addItem} className="flex items-center gap-1.5 px-3 h-7 rounded-md text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors">
                  <Plus className="w-3 h-3" /> Add Line Item
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[1180px]">
                <div className="grid gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wide"
                  style={{ gridTemplateColumns: '32px 90px minmax(200px,2fr) 80px 64px 70px 90px 60px 60px 100px 90px 100px 32px' }}>
                  {['#', 'Item Code', 'Description', 'HSN/SAC', 'UOM', 'Qty', 'Unit Rate', 'Disc%', 'GST%', 'Taxable', 'GST Amt', 'Total', ''].map((h, i) => (
                    <div key={i} className={i >= 9 && i <= 11 ? 'text-right' : ''}>{h}</div>
                  ))}
                </div>
                {items.map((it, i) => {
                  const c = lineCalc(it);
                  return (
                  <div key={i} className={clsx('px-4 py-2 border-b border-slate-100 last:border-b-0', i % 2 === 1 && 'bg-slate-50/50')}>
                    <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '32px 90px minmax(200px,2fr) 80px 64px 70px 90px 60px 60px 100px 90px 100px 32px' }}>
                      <div className="text-center text-xs font-mono text-slate-400">{i + 1}</div>
                      <input className={clsx(Z_INP, 'font-mono !px-2')} placeholder="Code" value={it.item_code || ''} onChange={e => setItem(i, 'item_code', e.target.value)} />
                      <MaterialCombobox value={it.material_name} inventoryItems={inventoryItems} placeholder="Description"
                        onChange={(materialName, unit) => { setItem(i, 'material_name', materialName); if (unit) setItem(i, 'unit', unit); }} />
                      <input className={clsx(Z_INP, '!px-2')} placeholder="HSN" value={it.hsn_code} onChange={e => setItem(i, 'hsn_code', e.target.value)} />
                      <select className={clsx(Z_INP, '!px-1')} value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)}>
                        {it.unit && !UNITS.includes(it.unit) && <option key={it.unit}>{it.unit}</option>}
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                      <input type="number" className={clsx(Z_INP, 'text-right !px-2')} placeholder="0" value={it.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} />
                      <input type="number" className={clsx(Z_INP, 'text-right !px-2')} placeholder="0.00" value={it.rate} onChange={e => setItem(i, 'rate', e.target.value)} />
                      <input type="number" className={clsx(Z_INP, 'text-center !px-1')} placeholder="0" value={it.discount_pct || ''} onChange={e => setItem(i, 'discount_pct', e.target.value)} />
                      <input type="number" className={clsx(Z_INP, 'text-center !px-1')} value={it.gst_rate} onChange={e => setItem(i, 'gst_rate', e.target.value)} />
                      <div className="text-right font-mono text-xs text-slate-600">{c.taxable ? inr(c.taxable) : '—'}</div>
                      <div className="text-right font-mono text-xs text-amber-600">{c.gstAmt ? inr(c.gstAmt) : '—'}</div>
                      <div className="text-right font-mono text-xs font-semibold text-slate-800">{c.total ? inr(c.total) : '—'}</div>
                      <button onClick={() => removeItem(i)} disabled={items.length === 1}
                        className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* BOQ linkage sub-row */}
                    <div className="flex flex-wrap gap-2 pt-1 pb-0.5 pl-[calc(32px+8px+90px+8px)]">
                      {!form.project_id ? (
                        <span className="text-[10px] text-slate-400 italic">Select a project in Step 1 to link BOQ chapter / cost head</span>
                      ) : boqLoading ? (
                        <span className="text-[10px] text-slate-400 italic">Loading BOQ…</span>
                      ) : boqChapters.length === 0 ? (
                        <span className="text-[10px] text-slate-400 italic">No BOQ items found for this project</span>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">Chapter</span>
                            <select
                              className="h-6 text-[11px] border border-slate-200 rounded-md px-1.5 text-slate-600 bg-white focus:border-indigo-400 focus:outline-none min-w-[160px]"
                              value={it.boq_chapter || ''}
                              onChange={e => {
                                setItem(i, 'boq_chapter', e.target.value);
                                setItem(i, 'boq_item_id', '');
                              }}
                            >
                              <option value="">— Select chapter —</option>
                              {boqChapters.map(ch => (
                                <option key={ch.chapter_name} value={ch.chapter_name}>
                                  {ch.chapter_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">Cost Head</span>
                            <select
                              className="h-6 text-[11px] border border-slate-200 rounded-md px-1.5 text-slate-600 bg-white focus:border-indigo-400 focus:outline-none min-w-[160px]"
                              value={it.cost_head || ''}
                              onChange={e => setItem(i, 'cost_head', e.target.value)}
                            >
                              <option value="">— Select cost head —</option>
                              {BOQ_COST_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
          </>}

          {/* ════════ STEP 3 — Charges & Attachments ════════ */}
          {step === 3 && <>
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}>Additional Charges</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 p-4">
              {PO_CHARGE_FIELDS.map(([label, key, addon]) => (
                <Field key={key} label={label}>
                  <div className="flex">
                    <input type="number" min="0" className={clsx(INP, addon && 'rounded-r-none')} placeholder="0" value={form[key]} onChange={e => set(key, e.target.value)} />
                    {addon && <span className="px-2 flex items-center text-[11px] text-slate-400 border border-l-0 border-slate-300 rounded-r-md bg-slate-50 whitespace-nowrap">{addon}</span>}
                  </div>
                </Field>
              ))}
              <Field label="TDS Deduction %">
                <select className={INP} value={form.tds_percent} onChange={e => set('tds_percent', e.target.value)}>
                  <option value="0">None</option>
                  <option value="1">1% – Sec 194C</option>
                  <option value="2">2% – Sec 194C (Company)</option>
                  <option value="10">10% – Sec 194J</option>
                </select>
              </Field>
              <Field label="TCS / Other Tax (₹)">
                <input type="number" min="0" className={INP} placeholder="0" value={form.tcs_amount} onChange={e => set('tcs_amount', e.target.value)} />
              </Field>
            </div>
          </div>

          <div className={Z_CARD}>
            <h3 className={Z_HEAD}>Attachments</h3>
            <div className="p-4">
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-400">
                <Upload className="w-6 h-6 text-blue-400" />
                <span className="text-sm font-medium text-slate-600">Drag &amp; drop quotations, approvals, or rate comparisons here</span>
                <span className="text-xs text-slate-400">PDF, JPG, PNG, XLSX – max 10MB each</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">File attachments can be added from the PO detail screen after creation.</p>
            </div>
          </div>

          <div className={Z_CARD}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 p-4">
              <Field label="Terms & Conditions">
                <textarea rows={5} className={clsx(INP, 'h-auto py-2 resize-y font-mono text-[11px] leading-relaxed')} value={form.terms_conditions} onChange={e => set('terms_conditions', e.target.value)} />
              </Field>
              <Field label="Internal Remarks">
                <textarea rows={5} className={clsx(INP, 'h-auto py-2 resize-y')} placeholder="Internal notes (not printed on PO)" value={form.internal_remarks} onChange={e => set('internal_remarks', e.target.value)} />
              </Field>
              <Field label="Delivery Instructions">
                <textarea rows={5} className={clsx(INP, 'h-auto py-2 resize-y')} placeholder="Site-specific instructions" value={form.delivery_instructions} onChange={e => set('delivery_instructions', e.target.value)} />
              </Field>
            </div>
          </div>
          </>}

          {/* ════════ STEP 4 — Review & Submit ════════ */}
          {step === 4 && <>
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}>PO Header</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 p-4 text-sm">
              {[
                ['Vendor', selectedVendor?.name || '—'],
                ['Project', projects.find(p => p.id === form.project_id)?.name || '—'],
                ['PO Date', form.po_date ? dayjs(form.po_date).format('DD-MM-YYYY') : '—'],
                ['Required By', form.delivery_date ? dayjs(form.delivery_date).format('DD-MM-YYYY') : '—'],
                ['Department', form.department || '—'],
                ['Payment Terms', form.payment_terms || '—'],
                ['Freight', form.freight_mode || '—'],
                ['Transport', form.transport_mode || '—'],
              ].map(([l, v]) => (
                <div key={l}><p className="text-[11px] text-slate-400 uppercase tracking-wide">{l}</p><p className="font-semibold text-slate-800 truncate">{v}</p></div>
              ))}
            </div>
          </div>

          <div className={Z_CARD}>
            <h3 className={Z_HEAD}>Line Items ({items.filter(it => it.material_name && it.quantity).length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-slate-400 uppercase tracking-wider text-[11px] font-medium">
                  <th className="text-left px-3 py-2">#</th><th className="text-left px-3 py-2">Description</th>
                  <th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Rate</th>
                  <th className="text-right px-3 py-2">Taxable</th><th className="text-right px-3 py-2">GST</th><th className="text-right px-3 py-2">Total</th>
                </tr></thead>
                <tbody>
                  {items.filter(it => it.material_name && it.quantity).map((it, idx) => {
                    const c = lineCalc(it);
                    return (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{it.material_name}</td>
                        <td className="px-3 py-2 text-right font-mono">{it.quantity} {it.unit}</td>
                        <td className="px-3 py-2 text-right font-mono">{inr(parseFloat(it.rate) || 0)}</td>
                        <td className="px-3 py-2 text-right font-mono">{inr(c.taxable)}</td>
                        <td className="px-3 py-2 text-right font-mono text-amber-600">{inr(c.gstAmt)}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{inr(c.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Approval chain */}
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}>Approval Workflow</h3>
            <div className="p-4">
              <p className="text-xs text-slate-400 mb-3">After submission, this PO will follow the standard approval chain:</p>
              <div className="flex items-center">
                {[{ s: 'AC', l: 'Procurement', st: 'Pending', state: 'pending' }, { s: 'PM', l: 'Proj. Mgr', st: 'Waiting' }, { s: 'MD', l: 'MD', st: 'Waiting' }].map((node, i, arr) => (
                  <React.Fragment key={i}>
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold border-2',
                        node.state === 'pending' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-400')}>{node.s}</div>
                      <span className="text-[11px] text-slate-500">{node.l}</span>
                      <span className={clsx('text-[10.5px] font-semibold', node.state === 'pending' ? 'text-amber-600' : 'text-slate-400')}>{node.st}</span>
                    </div>
                    {i < arr.length - 1 && <div className="w-10 h-0.5 bg-slate-200" />}
                  </React.Fragment>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">PO value above ₹5L requires MD approval. Estimated turnaround: <strong>2 business days</strong>.</p>
            </div>
          </div>
          </>}

          </div>

          {/* ── Tax Summary sidebar (visible all steps) ── */}
          <div className="w-full lg:w-[320px] shrink-0">
            <div className="rounded-md border border-slate-200 overflow-hidden bg-white sticky top-0">
              <div className="px-4 py-2.5 bg-slate-800 text-white text-xs font-semibold uppercase tracking-wide">Tax Summary</div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">Subtotal (before tax)</span><span className="font-mono">{inr(grossTotal)}</span></div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">Total Discount</span><span className="font-mono text-rose-600">– {inr(totalDiscount)}</span></div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">Taxable Amount</span><span className="font-mono">{inr(subTotal)}</span></div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">CGST</span><span className="font-mono">{cgst ? inr(cgst) : '–'}</span></div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">SGST</span><span className="font-mono">{sgst ? inr(sgst) : '–'}</span></div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">IGST</span><span className="font-mono">{igst ? inr(igst) : '–'}</span></div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">Freight + Loading</span><span className="font-mono">{inr(freight + loading + insurance)}</span></div>
              <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">GST on Freight</span><span className="font-mono">{freightGst ? inr(freightGst) : '–'}</span></div>
              {tcsValue > 0 && <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">TCS / Other Tax</span><span className="font-mono">{inr(tcsValue)}</span></div>}
              {tdsValue > 0 && <div className="flex justify-between px-4 py-2 border-b border-slate-100 text-xs"><span className="text-slate-500">TDS Deduction</span><span className="font-mono text-rose-600">– {inr(tdsValue)}</span></div>}
              <div className="flex justify-between px-4 py-3 bg-blue-50 text-sm font-bold"><span className="text-blue-700">Grand Total</span><span className="font-mono text-blue-700">{inr(grandTotal)}</span></div>
            </div>
          </div>

          </div>
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white flex-shrink-0">
          <div className="text-xs text-slate-600">
            Grand Total: <strong className="font-mono text-slate-900">{inr(grandTotal)}</strong>
            &nbsp;|&nbsp; {items.filter(it => it.material_name && it.quantity).length} line items
            &nbsp;|&nbsp; {isInter ? 'IGST' : 'CGST + SGST'} applicable
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 h-9 rounded-md border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Discard</button>
            {!isEditing && <button onClick={saveDraft} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md border border-blue-300 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"><Download className="w-4 h-4" /> Save Draft</button>}
            {step > 1 && <button onClick={goBack} className="px-4 h-9 rounded-md border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Back</button>}
            {step < PO_WIZARD_STEPS.length ? (
              <button onClick={goNext} className="inline-flex items-center gap-2 px-5 h-9 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">Next <ChevronRight className="w-4 h-4" /></button>
            ) : (
              <>
                {!isEditing && <button onClick={() => handleSubmit(true)} disabled={isPending} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"><Mail className="w-4 h-4" /> Send to Vendor</button>}
                <button onClick={() => handleSubmit(false)} disabled={isPending}
                  className="inline-flex items-center gap-2 px-5 h-9 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  <Check className="w-4 h-4" />
                  {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Submit for Approval'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const STAGE_LABELS = {
  'procurement-approve': 'Procurement Approval',
  'md-approve':          'MD Authorization',
};

// Designated users who may action PO approvals regardless of role/department.
const PO_APPROVER_EMAILS = ['stephen@bcim.in', 'it@bcim.in'];

// Which roles / departments can action each stage. Roles are matched EXACTLY
// (no substring) so broad roles like "site_manager" no longer leak into the
// procurement-approve stage. Procurement is additionally matched as a keyword
// so any procurement_* role / department qualifies.
const STAGE_ROLES = {
  'procurement-approve': { roles: ['procurement_manager'],              depts: ['procurement','purchase'], keyword: 'procurement' },
  'md-approve':          { roles: ['md','ceo','managing_director'],     depts: ['md','managing director','ceo'] },
};

function canApproveStage(stageId, user) {
  if (!user) return false;
  const role  = (user.role || '').toLowerCase();
  const dept  = (user.department || '').toLowerCase();
  const email = (user.email || '').toLowerCase();
  // Super admin and designated approvers can action any stage.
  if (role === 'super_admin' || PO_APPROVER_EMAILS.includes(email)) return true;
  const allowed = STAGE_ROLES[stageId];
  if (!allowed) return false;
  if (allowed.roles.some(r => role === r)) return true;
  if (allowed.depts.some(d => dept.includes(d))) return true;
  if (allowed.keyword && (role.includes(allowed.keyword) || dept.includes(allowed.keyword))) return true;
  return false;
}

/* ─── PO Reject Reason Modal ─── */
function PORejectModal({ po, onClose, onConfirm, isPending }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Reject Purchase Order</p>
              <p className="text-xs text-slate-500">{po?.po_ref_no || po?.po_number || po?.serial_no_formatted}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm">
            <p className="font-semibold text-red-800">{(po?.vendor_name || '').toUpperCase()}</p>
            <p className="text-xs text-red-600 mt-0.5">{inr(po?.grand_total)} · {fmt(po?.po_date)}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Rejection Reason <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
            <textarea
              rows={3}
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Budget exceeded, vendor not approved, specifications mismatch…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 resize-none transition-all"
            />
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => onConfirm(reason)} disabled={isPending}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-black disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg,#EF4444,#DC2626)' }}>
            {isPending ? 'Rejecting…' : 'Reject PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── PO Terminate Modal ─── */
function POTerminateModal({ po, onClose, onConfirm, isPending }) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Terminate Purchase Order</p>
              <p className="text-xs text-slate-500">{po?.po_ref_no || po?.po_number || po?.serial_no_formatted}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-sm">
            <p className="font-semibold text-orange-800">{(po?.vendor_name || '').toUpperCase()}</p>
            <p className="text-xs text-orange-600 mt-0.5">{inr(po?.grand_total)} — Supply/work stopped midway</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Reason for Termination <span className="text-red-500">*</span></label>
            <textarea
              rows={3}
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Vendor unable to supply, non-performance, financial default…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50 resize-none transition-all"
            />
            {!canSubmit && <p className="text-[11px] text-slate-400 mt-1">Reason is required to record why the order was stopped.</p>}
            <p className="text-[11px] text-slate-400 mt-1.5">The linked MR's items will immediately become available again for a new PO.</p>
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => onConfirm(reason.trim())} disabled={isPending || !canSubmit}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-black disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg,#F97316,#EA580C)' }}>
            {isPending ? 'Terminating…' : 'Terminate PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail Slide-over ─── */
const BILL_STATUS = {
  draft:    { label: 'Draft',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending:  { label: 'Pending',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-600 border-red-200' },
  paid:     { label: 'Paid',     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
};

// Editing/deleting a PO is restricted to procurement & super admin users
function canManageProcurement(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'super_admin' || role === 'managing_director' || role.includes('procurement');
}

function PODetailPanel({ po, detailedPO, company, onClose, onEdit, onApprove, onReject, onTerminate, isApproving, isRejecting, isTerminating, user }) {
  const qc = useQueryClient();
  const [sigModal,    setSigModal]    = useState(null);  // { stage }
  const [mailModal,   setMailModal]   = useState(false);
  const [rejectModal, setRejectModal] = useState(false); // reject reason modal
  const [terminateModal, setTerminateModal] = useState(false);
  const liveStatus = detailedPO?.status ?? po.status;
  const printZoneRef = React.useRef(null);

  // ── Print in a new isolated window — bypasses all CSS fighting ────────────
  const handlePrint = () => {
    if (!detailedPO || !printZoneRef.current) return;
    const html = printZoneRef.current.innerHTML;
    const win  = window.open('', '_blank', 'width=900,height=700');
    if (!win) { window.print(); return; }           // fallback if popup blocked
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title></title>
  <style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
    body { margin: 0; padding: 0 10mm; background: white; font-family: 'Times New Roman', Times, serif; color: #000; }
    table { border-collapse: collapse; }
    .po-doc > thead { display: table-header-group; }
    /* tfoot spacer reserves 36mm on every page; fixed footer draws into it */
    .po-doc > tfoot { display: table-footer-group; }
    .po-items-table thead { display: table-header-group; }
    .po-items-table tbody tr { page-break-inside: avoid; }
    .po-terms-block li { page-break-inside: avoid; break-inside: avoid; }
    .po-sig-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 36mm; background: white; padding: 4px 10mm 6mm; }
    @page { size: A4 portrait; margin: 0; }
  </style>
</head>
<body>${html}</body>
</html>`);
    win.document.close();
    // onload fires when images are ready; fallback timeout if onload never fires (e.g. no images)
    let printed = false;
    const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); win.close(); };
    win.onload = doPrint;
    setTimeout(doPrint, 1200);
  };

  // Linked bills
  const { data: billsData } = useQuery({
    queryKey: ['po-bills', po.id],
    queryFn:  () => poAPI.bills(po.id).then(r => r.data),
    enabled:  !!po.id,
  });
  const linkedBills   = billsData?.bills   || [];
  const billsSummary  = billsData?.summary || {};
  const currentAction = STAGE_ACTIONS.find(a =>
    a.reqStatus === liveStatus || (a.id === 'md-approve' && liveStatus === 'released_mgmt')
  );
  const cfg = STATUS_CONFIG[liveStatus] || STATUS_CONFIG.pending;
  const signatures = detailedPO?.signatures || {};
  const isTaxInclusive = Boolean(detailedPO?.gst_inclusive ?? po.gst_inclusive);

  return (
    <>
    <div className="fixed inset-0 z-50 bg-[#f4f6f9] flex flex-col overflow-hidden">

        {/* ── Full-window Header ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-white flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all mr-1">
              <X className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-base font-medium text-slate-900 font-mono">{po.po_ref_no || po.po_number || po.serial_no_formatted}</p>
              <p className="text-xs text-slate-500 mt-0.5">{(po.vendor_name || '').toUpperCase()} · {fmt(po.po_date)}</p>
            </div>
            <StatusBadge status={liveStatus} />
          </div>
          <div className="flex items-center gap-2">
            {/* KPI pills in header */}
            <div className="hidden md:flex items-center gap-1 mr-4">
              {[
                { label: 'Sub Total',   value: inr(po.sub_total),   color: 'text-slate-700' },
                { label: 'GST',         value: isTaxInclusive ? 'Inclusive' : inr(po.total_gst), color: 'text-amber-600' },
                { label: 'Grand Total', value: inr(po.grand_total), color: 'text-indigo-700 font-extrabold' },
              ].map((k, i) => (
                <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">{k.label}</span>
                  <span className={clsx('text-sm font-bold', k.color)}>{k.value}</span>
                </div>
              ))}
            </div>
            {liveStatus !== 'approved' && onEdit && canManageProcurement(user) && (
              <button onClick={() => onEdit(detailedPO ?? po)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-all">
                <Edit2 className="w-3.5 h-3.5" /> Edit PO
              </button>
            )}
            {liveStatus === 'approved' && (
              <span className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs font-medium">
                <Lock className="w-3.5 h-3.5" /> MD Approved — Locked
              </span>
            )}
            <button onClick={handlePrint} disabled={!detailedPO}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-slate-200 text-xs font-medium text-slate-900 hover:border-slate-300 disabled:opacity-40 transition-all">
              <Printer className="w-3.5 h-3.5" /> {!detailedPO ? '…' : 'Print'}
            </button>
            {/* Bug fix: was floating outside header div — moved here */}
            <button onClick={() => setMailModal(true)} disabled={!detailedPO}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 transition-all shadow-sm">
              <Mail className="w-3.5 h-3.5" /> Send to Vendor
            </button>
          </div>
        </div>

        {/* ── Two-column Body ── */}
        <div className="flex-1 overflow-hidden flex">

          {/* LEFT — PO details + line items */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 border-r border-slate-200">

          {/* Info grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Vendor',         (po.vendor_name || '').toUpperCase()],
              ['Project',        (po.project_name || '').toUpperCase()],
              ['PO Date',        fmt(po.po_date)],
              ['Delivery',       fmt(po.delivery_date)],
              ['Payment Terms',  po.payment_terms || '—'],
              ['Narration',      po.narration || po.notes || '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-sm font-medium text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Line items */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-900 uppercase tracking-wider">Line Items</span>
              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {(detailedPO?.items || []).length} items
              </span>
            </div>
            {!detailedPO ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {(isTaxInclusive
                      ? ['#', 'Material', 'Unit', 'Qty', 'Rate (Incl. GST)', 'Amount']
                      : ['#', 'Material', 'Unit', 'Qty', 'Rate', 'Basic', 'GST', 'Total with GST']
                    ).map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 uppercase tracking-wider bg-slate-50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(detailedPO.items || []).map((it, i) => {
                    const basic = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
                    const gst = isTaxInclusive ? 0 : parseFloat(it.gst_amount || 0);
                    const total = parseFloat(it.total_amount || 0) || basic + gst;
                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-800">
                          {it.material_name}
                          {it.make_model && <div className="text-xs text-indigo-600 font-medium">{it.make_model}</div>}
                          {it.hsn_code && <div className="text-slate-400 text-xs">HSN: {it.hsn_code}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium uppercase">{it.unit}</span>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-indigo-600">{parseFloat(it.quantity)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{inr(it.rate)}</td>
                        {isTaxInclusive ? (
                          <td className="px-3 py-2.5 font-medium text-slate-800">{inr(total)}</td>
                        ) : (<>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{inr(basic)}</td>
                          <td className="px-3 py-2.5 text-amber-600">{inr(gst)}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{inr(total)}</td>
                        </>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {po.notes && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Notes / Narration</p>
              <p className="text-sm text-slate-600">{po.notes}</p>
            </div>
          )}

          </div>{/* end left column */}

          {/* RIGHT column — bills + approval + action */}
          <div className="w-[420px] xl:w-[480px] flex-shrink-0 overflow-y-auto p-6 space-y-4 bg-[#f4f6f9]">

          {/* Action panel — shown first so it's always visible */}
          {currentAction && (() => {
            const authorized = canApproveStage(currentAction.id, user);
            return (
              <div className={clsx('border rounded-xl p-4 space-y-3', authorized ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200')}>
                <div className="flex items-center gap-3">
                  <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center', authorized ? 'bg-emerald-100 border-emerald-200' : 'bg-slate-100 border-slate-200')}>
                    <CheckCircle2 className={clsx('w-4 h-4', authorized ? 'text-emerald-600' : 'text-slate-400')} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{authorized ? 'Action Required' : 'Awaiting Authorization'}</p>
                    <p className={clsx('text-xs font-medium', authorized ? 'text-emerald-700' : 'text-slate-500')}>
                      {authorized ? `${currentAction.label} — click to authorize` : `${STAGE_LABELS[currentAction.id]} — not your approval level`}
                    </p>
                  </div>
                </div>
                {authorized ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => onApprove(currentAction.id)}
                      disabled={isApproving}
                      className="flex-[2] h-9 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isApproving ? 'Processing…' : currentAction.id === 'procurement-approve' ? 'Procurement Approve' : 'Review & Authorize'}
                    </button>
                    <button
                      onClick={() => setRejectModal(true)}
                      disabled={isRejecting}
                      className="flex-1 h-9 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {isRejecting ? '…' : 'Reject'}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic px-1">
                    This PO is waiting for the {STAGE_LABELS[currentAction.id]} team to act.
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── Linked Bills ─────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Receipt className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-900 uppercase tracking-wider">Linked Bills / Invoices</span>
              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {billsSummary.count ?? 0} bills
              </span>
            </div>

            {/* Bill KPI strip */}
            {billsSummary.count > 0 && (
              <div className="grid grid-cols-3 gap-px bg-slate-100 border-b border-slate-100">
                {[
                  { label: 'Total Billed',  value: inr(billsSummary.total_billed),   color: 'text-slate-800' },
                  { label: 'Approved',      value: inr(billsSummary.total_approved), color: 'text-emerald-600' },
                  { label: 'Pending',       value: inr(billsSummary.total_pending),  color: 'text-amber-600' },
                ].map((k, i) => (
                  <div key={i} className="bg-white p-3 text-center">
                    <p className="text-[10px] text-slate-400 mb-0.5">{k.label}</p>
                    <p className={clsx('text-xs font-bold', k.color)}>{k.value}</p>
                  </div>
                ))}
              </div>
            )}

            {linkedBills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                <Receipt className="w-6 h-6 opacity-30" />
                <p className="text-xs">No bills linked to this PO yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['SL', 'Invoice No.', 'Inv Date', 'Amount', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {linkedBills.map((b, i) => {
                      const st = BILL_STATUS[b.workflow_status] || BILL_STATUS.pending;
                      return (
                        <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2.5 text-slate-400 font-mono">{b.sl_number}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">
                            {b.inv_number || '—'}
                            {b.work_desc && <div className="text-slate-400 truncate max-w-[140px]">{b.work_desc}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                            {b.inv_date ? dayjs(b.inv_date).format('DD-MM-YYYY') : '—'}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{inr(b.total_amount)}</td>
                          <td className="px-3 py-2.5">
                            <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border', st.cls)}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={3} className="px-3 py-2.5 text-xs font-medium text-slate-500 uppercase">Total</td>
                      <td className="px-3 py-2.5 text-xs font-medium text-indigo-700">{inr(billsSummary.total_billed)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Utilisation bar */}
            {billsSummary.count > 0 && parseFloat(po.grand_total) > 0 && (
              <div className="px-4 pb-4 pt-2">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>PO Utilisation</span>
                  <span className="font-medium text-slate-600">
                    {Math.min(100, ((billsSummary.total_billed / parseFloat(po.grand_total)) * 100)).toFixed(1)}%
                    {' '}of {inr(po.grand_total)}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all',
                      billsSummary.total_billed > parseFloat(po.grand_total) ? 'bg-red-500' : 'bg-indigo-500'
                    )}
                    style={{ width: `${Math.min(100, (billsSummary.total_billed / parseFloat(po.grand_total)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Approval pipeline */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-900 uppercase tracking-wider">Approval Pipeline</span>
            </div>
            <div className="p-4">
              <div className="relative">
                <div className="absolute bg-slate-200 left-[17px] top-5" style={{ width: 1, height: 'calc(100% - 40px)' }} />
                <div className="space-y-3">
                  {STAGE_ACTIONS.map((stage, idx) => {
                    const curStage = (STATUS_CONFIG[liveStatus] || STATUS_CONFIG.pending).stage;
                    const isDone   = curStage > idx + 1;
                    const isActive = curStage === idx + 1;
                    const sig      = signatures[stage.id];
                    return (
                      <div key={stage.id} className="flex items-start gap-3 relative">
                        <div className={clsx(
                          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 mt-0.5',
                          isDone   ? 'bg-emerald-500 border-emerald-500' :
                          isActive ? 'bg-indigo-600 border-indigo-600'   :
                                     'bg-white border-slate-200'
                        )}>
                          {isDone
                            ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            : <span className={clsx('text-xs font-bold', isActive ? 'text-white' : 'text-slate-400')}>{idx + 1}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={clsx('text-xs font-semibold',
                            isDone ? 'text-slate-900 font-medium line-through' : isActive ? 'text-slate-900' : 'text-slate-400'
                          )}>{stage.label}</p>
                          {sig?.img && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <img src={sig.img} alt="signature"
                                className="h-8 max-w-[120px] object-contain bg-white border border-slate-200 rounded px-1" />
                              <span className="text-[10px] text-slate-400">{sig.by} · {sig.at ? dayjs(sig.at).format('DD-MM-YYYY HH:mm') : ''}</span>
                            </div>
                          )}
                        </div>
                        {isDone   && !sig?.img && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 mt-0.5">Done</span>}
                        {isActive && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 animate-pulse mt-0.5">Pending</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          </div>{/* end right column */}
        </div>{/* end two-column body */}

        {/* Terminate button — visible while the PO is still active */}
        {!['fully_received', 'rejected', 'cancelled'].includes(liveStatus) && (
          <div className="px-6 py-3 border-t border-slate-100 bg-orange-50 flex items-center justify-between gap-3">
            <p className="text-xs text-orange-700 font-medium">Vendor unable to supply or work stopped midway?</p>
            <button
              onClick={() => setTerminateModal(true)}
              disabled={isTerminating}
              className="shrink-0 px-4 h-8 rounded-lg border border-orange-300 bg-white text-orange-700 text-xs font-semibold hover:bg-orange-100 transition-colors disabled:opacity-50">
              {isTerminating ? 'Terminating…' : '✕ Terminate PO'}
            </button>
          </div>
        )}

        {/* Termination reason — shown once terminated */}
        {liveStatus === 'cancelled' && (detailedPO || po)?.termination_reason && (
          <div className="px-6 py-3 border-t border-slate-100 bg-orange-50 flex items-start gap-2">
            <XCircle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-orange-800">Terminated</p>
              <p className="text-xs text-orange-700 mt-0.5">{(detailedPO || po).termination_reason}</p>
            </div>
          </div>
        )}

        {/* Attachments */}
        <div className="px-6 py-4 border-t border-slate-100">
          <RecordAttachments
            module="purchase_order"
            recordId={po.id}
            projectId={po.project_id}
            label="PO Attachments — Contracts, Delivery Notes, Approvals"
          />
        </div>

        {/* Reject reason modal — Bug fix: was silent reject with no reason */}
        {rejectModal && (
          <PORejectModal
            po={detailedPO || po}
            isPending={isRejecting}
            onClose={() => setRejectModal(false)}
            onConfirm={(reason) => { onReject(reason); setRejectModal(false); }}
          />
        )}
        {terminateModal && (
          <POTerminateModal
            po={detailedPO || po}
            isPending={isTerminating}
            onClose={() => setTerminateModal(false)}
            onConfirm={(reason) => { onTerminate(reason); setTerminateModal(false); }}
          />
        )}
        {mailModal && (
          <SendPOMailModal
            po={detailedPO || po}
            onClose={() => setMailModal(false)}
            onSent={() => {
              qc.invalidateQueries({ queryKey: ['purchase-orders'] });
              qc.invalidateQueries({ queryKey: ['purchase-orders', po.id] });
            }}
          />
        )}
    </div>

    {/* Hidden print zone — content captured via ref, printed in new window */}
    <div ref={printZoneRef} style={{ display: 'none' }} aria-hidden="true">
      <POPrintTemplate data={detailedPO} company={company} />
    </div>
    </>
  );
}

/* ─── PO Import Modal — Excel version ─── */
function POImportModal({ onClose, vendors, projects, onImported }) {
  const [step, setStep]           = useState(1); // 1=upload, 2=review, 3=done
  const [file, setFile]           = useState(null);
  const [header, setHeader]       = useState({});
  const [items, setItems]         = useState([]);
  const [projectId, setProjectId] = useState('');
  const [vendorId, setVendorId]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [parseWarning, setParseWarning] = useState('');
  const fileRef = React.useRef();

  /* ── No separate template needed — import your existing BCIM PO Excel directly ── */

  /* ── Parse uploaded Excel — reads BCIM's own PO format directly ── */
  const handleUpload = async () => {
    if (!file) return toast.error('Please select an Excel file');
    setLoading(true);
    setParseWarning('');
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

      // Use the first sheet (or the one named "PO")
      const sheetName = wb.SheetNames.find(n => n.toUpperCase() === 'PO') || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];

      // Convert to 2D array for easy scanning
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

      // ── Helper: find a label anywhere in a row, return the next non-null cell value ──
      const findLabelValue = (label) => {
        const lc = label.toLowerCase();
        for (const row of rows) {
          for (let c = 0; c < row.length; c++) {
            const v = String(row[c] ?? '').toLowerCase().trim();
            if (v.includes(lc)) {
              for (let k = c + 1; k < row.length; k++) {
                if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
              }
            }
          }
        }
        return '';
      };

      // ── Date formatter — handles "22.05.2026", "2026-05-22", Excel date objects ──
      const fmtDate = (v) => {
        if (!v) return '';
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        const s = String(v).trim();
        const m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
        if (m) {
          const yr = m[3].length === 2 ? '20' + m[3] : m[3];
          return `${yr}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        }
        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        return '';
      };

      // ── Extract header fields ──
      const poNumber    = findLabelValue('PO No');
      const poDate      = fmtDate(findLabelValue('Date'));
      const projectName = findLabelValue('Project');
      const poReqNo     = findLabelValue('PO Req No');

      // Vendor: find row starting with "M/s." or the row after "To,"
      let vendorName = '';
      let vendorGstin = '';
      for (let i = 0; i < rows.length; i++) {
        const firstCell = String(rows[i]?.[0] ?? '').trim();
        if (/^M\/s\./i.test(firstCell)) { vendorName = firstCell; break; }
        if (/^To[,.]?\s*$/i.test(firstCell) && rows[i+1]) {
          vendorName = String(rows[i+1][0] ?? '').trim(); break;
        }
      }
      // Vendor GST — value may be in the same cell as the label ("GST No: 29AKVPA0583B1Z7")
      // or in the next cell. Try both.
      let vendorGstinRaw = '';
      for (const row of rows) {
        for (let c = 0; c < row.length; c++) {
          const v = String(row[c] ?? '');
          if (/GST\s*No|GSTIN/i.test(v)) {
            // Check if value is embedded in the same cell after a colon
            const colonPart = v.split(':').slice(1).join(':').trim();
            if (colonPart && /^[0-9A-Z]{10,15}$/i.test(colonPart.replace(/\s/g,''))) {
              vendorGstinRaw = colonPart.trim();
              break;
            }
            // Otherwise look in next cells
            for (let k = c + 1; k < row.length; k++) {
              const nv = String(row[k] ?? '').trim();
              if (nv && /^[0-9A-Z]{10,15}$/i.test(nv.replace(/\s/g,''))) {
                vendorGstinRaw = nv; break;
              }
            }
            if (vendorGstinRaw) break;
          }
        }
        if (vendorGstinRaw) break;
      }
      vendorGstin = vendorGstinRaw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 15);

      // Narration
      let narration = '';
      for (const row of rows) {
        for (let c = 0; c < row.length; c++) {
          if (String(row[c] ?? '').toLowerCase().includes('narration')) {
            // narration is usually in the same cell after "Narration: " or next cell
            const full = String(row[c]).replace(/^narration\s*[:—-]?\s*/i, '').trim();
            if (full) { narration = full; break; }
            for (let k = c + 1; k < row.length; k++) {
              if (row[k] != null && String(row[k]).trim()) { narration = String(row[k]).trim(); break; }
            }
            if (narration) break;
          }
        }
        if (narration) break;
      }

      // ── Find line-items header row ──
      // Look for a row that has "Description" in one of the cells
      let hdrRowIdx = -1;
      let colDesc = -1, colUnit = -1, colQty = -1, colRate = -1, colAmt = -1, colHsn = -1;
      for (let i = 0; i < rows.length; i++) {
        const joined = (rows[i] || []).map(c => String(c ?? '').toLowerCase()).join(' ');
        if (joined.includes('description') && (joined.includes('qty') || joined.includes('quantity') || joined.includes('uom'))) {
          hdrRowIdx = i;
          rows[i].forEach((v, j) => {
            const lv = String(v ?? '').toLowerCase().trim();
            if (lv.includes('description') || lv.includes('particular')) colDesc = j;
            else if (lv.includes('uom') || lv === 'unit')               colUnit = j;
            else if (lv.includes('qty') || lv.includes('quantity'))     colQty  = j;
            else if (lv.includes('rate'))                               colRate = j;
            else if (lv.includes('amount') || lv === 'amt')             colAmt  = j;
            else if (lv.includes('hsn'))                                colHsn  = j;
          });
          break;
        }
      }

      // ── Extract line items ──
      const STOP = new Set(['sub total','subtotal','grand total','total','cgst','sgst','igst','gst','rupees','narration']);
      const isStopRow = (row) => {
        // Check column A (row[0]) and the description column — stop if either is a summary keyword
        const checkCols = [0, colDesc >= 0 ? colDesc : 1];
        return checkCols.some(c => {
          const v = String(row[c] ?? '').toLowerCase().trim();
          if (!v) return false;
          if (STOP.has(v)) return true;
          return Array.from(STOP).some(k => v.startsWith(k));
        });
      };
      const parsedItems = [];

      if (hdrRowIdx >= 0) {
        for (let i = hdrRowIdx + 1; i < rows.length; i++) {
          const row = rows[i] || [];
          if (isStopRow(row)) break;

          const desc = String(row[colDesc >= 0 ? colDesc : 1] ?? '').replace(/\s+/g, ' ').trim();
          const unit = String(row[colUnit >= 0 ? colUnit : 3] ?? 'Nos').trim() || 'Nos';
          const qty  = parseFloat(row[colQty  >= 0 ? colQty  : 4]) || 0;
          const rate = parseFloat(row[colRate >= 0 ? colRate : 5]) || 0;
          const amt  = parseFloat(row[colAmt  >= 0 ? colAmt  : 6]) || (qty * rate);
          const hsn  = String(row[colHsn  >= 0 ? colHsn  : 99] ?? '').trim();

          // Skip rows with no description and no qty/rate
          if (!desc && qty === 0 && rate === 0) continue;
          if (!desc) continue;

          parsedItems.push({
            material_name: desc.slice(0, 2000),
            unit: unit.slice(0, 20),
            quantity: qty,
            rate,
            gst_rate: 18,   // default; can be edited in review step
            hsn_code: hsn,
            amount: amt,
          });
        }
      }

      if (!parsedItems.length) {
        setParseWarning(
          hdrRowIdx < 0
            ? 'Could not find the line items table. Make sure your file contains a row with "Description", "Quantity", "Rate" column headers.'
            : 'No line items found after the header row. Check your file.'
        );
      }

      setHeader({
        po_number:     poNumber,
        po_date:       poDate,
        vendor_name:   vendorName,
        vendor_gstin:  vendorGstin,
        project_name:  projectName,
        po_req_no:     poReqNo,
        narration,
        notes: narration,
      });
      setItems(parsedItems);

      // Auto-match vendor by name or GSTIN
      if (vendorGstin) {
        const byGst = vendors.find(v => v.gstin?.toUpperCase() === vendorGstin.toUpperCase());
        if (byGst) { setVendorId(byGst.id); }
      }
      if (!vendorId && vendorName) {
        const vLower = vendorName.toLowerCase().replace(/^m\/s\.?\s*/i, '').trim();
        const byName = vendors.find(v => {
          const nLower = (v.name || '').toLowerCase().replace(/^m\/s\.?\s*/i, '').trim();
          return nLower.includes(vLower) || vLower.includes(nLower);
        });
        if (byName) setVendorId(byName.id);
      }

      setStep(2);
    } catch (err) {
      console.error(err);
      toast.error('Could not read the Excel file. Please check the file format.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!projectId) return toast.error('Please select a project');
    if (!vendorId)  return toast.error('Please select a vendor');
    if (!items.length) return toast.error('Please add at least one line item');
    setLoading(true);
    try {
      const res = await poAPI.importConfirm({ project_id: projectId, vendor_id: vendorId, header, items });
      setResult(res.data);
      setStep(3);
      onImported();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save PO');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (i, field, val) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  };
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const addItem = () => setItems(prev => [...prev, { material_name: '', unit: 'Nos', quantity: 0, rate: 0, gst_rate: 18, hsn_code: '' }]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[92vh]">

        {/* Header */}
        <div className="px-6 py-4 bg-indigo-600 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-base font-medium text-white">Import Purchase Order from Excel</p>
            <p className="text-xs text-indigo-200 mt-0.5">
              {step === 1 ? 'Upload filled Excel file' : step === 2 ? 'Review & correct data before saving' : 'Import complete'}
            </p>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-slate-100 flex-shrink-0">
          {['Upload Excel', 'Review Data', 'Done'].map((label, i) => (
            <div key={i} className={clsx('flex-1 py-3 text-center text-xs font-medium border-b-2 transition-colors',
              step === i+1 ? 'border-indigo-500 text-indigo-600' : step > i+1 ? 'border-emerald-400 text-emerald-600' : 'border-transparent text-slate-400')}>
              {label}
            </div>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-6">

          {/* Step 1: Upload Excel */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Info banner */}
              <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-indigo-800">Upload your existing BCIM PO Excel file</p>
                  <p className="text-xs text-indigo-600 mt-1">
                    The system reads your standard PO format directly — PO number, date, project, vendor, and all line items
                    are extracted automatically. You can review and edit everything before saving.
                  </p>
                </div>
              </div>

              {/* File drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all',
                  file ? 'border-emerald-400 bg-emerald-50' : 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50'
                )}
              >
                {file ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
                    <p className="text-xs text-emerald-600 mt-1">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">Click to select a PO Excel file</p>
                    <p className="text-xs text-slate-500 mt-1">.xlsx or .xls · max 10 MB</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => setFile(e.target.files[0])} />
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <p className="font-semibold text-slate-700">What gets extracted automatically:</p>
                <p>• PO Number, PO Date, Project Name, Vendor Name &amp; GSTIN</p>
                <p>• All line items — Description, UOM, Quantity, Rate, Amount</p>
                <p>• Narration / notes</p>
                <p className="text-slate-400 mt-1">Vendor will be auto-matched by name or GSTIN. You can change it in the next step.</p>
              </div>

              <div className="flex justify-end">
                <button onClick={handleUpload} disabled={!file || loading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-6 py-2 flex items-center gap-2">
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Reading…</>
                    : <><Upload className="w-4 h-4" /> Extract Data →</>}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Review */}
          {step === 2 && (
            <div className="space-y-5">
              {parseWarning && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Warning</p>
                    <p className="mt-0.5">{parseWarning}</p>
                  </div>
                </div>
              )}
              {/* Header fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Project *</label>
                  <select value={projectId} onChange={e => setProjectId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {header.project_name && (
                    <p className="text-xs text-slate-500 mt-1">From file: <span className="font-medium text-slate-700">{(header.project_name || '').toUpperCase()}</span></p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Vendor *</label>
                  <select value={vendorId} onChange={e => setVendorId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">Select vendor…</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {header.vendor_name && (
                    <p className="text-xs text-slate-500 mt-1">
                      From file: <span className="font-medium text-slate-700">{(header.vendor_name || '').toUpperCase()}</span>
                      {header.vendor_gstin && <span className="ml-1 text-indigo-600"> · GST: {header.vendor_gstin}</span>}
                      {!vendorId && <span className="ml-1 text-amber-600"> — not matched, please select manually</span>}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">PO Number</label>
                  <input value={header.po_number || ''} onChange={e => setHeader(h => ({ ...h, po_number: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">PO Date</label>
                  <input type="date" value={header.po_date || ''} onChange={e => setHeader(h => ({ ...h, po_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Delivery Date</label>
                  <input type="date" value={header.delivery_date || ''} onChange={e => setHeader(h => ({ ...h, delivery_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                  <input value={header.notes || ''} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-700">Line Items ({items.length})</p>
                  <button onClick={addItem} className="text-xs text-indigo-600 hover:underline font-semibold">+ Add Row</button>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Material / Description', 'Unit', 'Qty', 'Rate', 'GST%', 'HSN', ''].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-slate-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.length === 0 && (
                        <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">No items extracted — add rows manually or check your Excel Line Items sheet</td></tr>
                      )}
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1"><input value={it.material_name || ''} onChange={e => updateItem(i,'material_name',e.target.value)} className="w-full border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-400 min-w-[180px]" /></td>
                          <td className="px-2 py-1">
                            <select value={it.unit || 'Nos'} onChange={e => updateItem(i,'unit',e.target.value)} className="border border-slate-200 rounded px-1 py-1 text-xs outline-none focus:border-indigo-400">
                              {it.unit && !UNITS.includes(it.unit) && <option key={it.unit}>{it.unit}</option>}
                              {UNITS.map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1"><input type="number" step="any" min="0" value={it.quantity || ''} onChange={e => updateItem(i,'quantity',e.target.value)} className="w-16 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-400" /></td>
                          <td className="px-2 py-1"><input type="number" step="any" min="0" value={it.rate || ''} onChange={e => updateItem(i,'rate',e.target.value)} className="w-20 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-400" /></td>
                          <td className="px-2 py-1"><input type="number" step="any" min="0" value={it.gst_rate ?? 18} onChange={e => updateItem(i,'gst_rate',e.target.value)} className="w-12 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-400" /></td>
                          <td className="px-2 py-1"><input value={it.hsn_code || ''} onChange={e => updateItem(i,'hsn_code',e.target.value)} className="w-16 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-400" /></td>
                          <td className="px-2 py-1"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="border border-slate-200 text-slate-900 text-sm font-medium rounded-lg px-4 py-2">← Back</button>
                <button onClick={handleConfirm} disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center justify-center gap-2">
                  {loading ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</> : 'Confirm & Import PO'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && result && (
            <div className="text-center py-10">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">Purchase Order Imported!</h3>
              <p className="text-sm text-slate-600 mb-4">PO <strong>{result.po_number}</strong> has been created with status <strong>Pending Audit</strong>.</p>
              <button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-6 py-2">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function POPage() {
  const { user, selectedProjectId } = useAuthStore();
  const qc = useQueryClient();
  const location = useLocation();
  const [filterSeries, setFilterSeries] = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [prefillData, setPrefillData] = useState(null);
  const [editingPO, setEditingPO]     = useState(null);
  const [selectedPO, setSelectedPO]   = useState(null);
  const [attachPOId, setAttachPOId]   = useState(null); // PO id whose attachment panel is open
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState(selectedProjectId || 'all');
  const [sortConfig, setSortConfig]   = useState({ key: 'po_date', dir: 'desc' });

  useEffect(() => {
    if (location.state?.fromCS) {
      setPrefillData(location.state.fromCS);
      setShowForm(true);
      window.history.replaceState({}, '');
    }
    if (location.state?.searchPO) {
      setSearch(location.state.searchPO);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    setProjectFilter(selectedProjectId || 'all');
  }, [selectedProjectId]);

  const projectParams = projectFilter !== 'all' ? { project_id: projectFilter } : {};

  const { data: poData = [], isError: poError } = useQuery({
    queryKey: ['purchase-orders', projectFilter],
    queryFn: () => poAPI
      .list(projectParams, { skipProjectInject: true })
      .then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: vendorsData = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? d?.vendors ?? []); }),
  });
  const { data: projectsData = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.projects ?? d?.data ?? []); }),
  });
  const { data: mrsData = [] } = useQuery({
    queryKey: ['mrs-for-po', projectFilter],
    queryFn: () => mrsAPI
      .list(projectParams, { skipProjectInject: true })
      .then(r => r.data?.data || []),
  });
  const { data: detailedPO } = useQuery({
    queryKey: ['purchase-orders', selectedPO?.id],
    queryFn: () => poAPI.get(selectedPO.id).then(r => { const d = r.data; return d?.data ?? d; }),
    enabled: !!selectedPO?.id,
  });
  const { data: companyData } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => companySettingsAPI.get().then(r => r.data?.data ?? r.data),
    staleTime: Infinity,
  });

  // Auto-open PO when navigated from Approvals dashboard
  useEffect(() => {
    const viewId = location.state?.viewId;
    if (!viewId || !poData.length) return;
    const found = poData.find(p => p.id === viewId);
    if (found) {
      setSelectedPO(found);
      window.history.replaceState({}, '');
    }
  }, [location.state, poData]);

  const createMutation = useMutation({
    mutationFn: d => poAPI.create(d),
    onSuccess: (res, vars) => {
      toast.success(vars.status === 'draft' ? 'Draft saved' : 'PO submitted for audit');
      setShowForm(false);
      setPrefillData(null);
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['mrs-for-po'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to create PO'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, stage }) => poAPI.approve(id, stage, {}),
    onSuccess: () => {
      toast.success('Authorized successfully');
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders', selectedPO?.id] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Action failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => poAPI.approve(id, 'reject', { reason }),
    onSuccess: () => {
      toast.success('PO rejected');
      setSelectedPO(null);
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Reject failed'),
  });

  const terminateMutation = useMutation({
    mutationFn: ({ id, reason }) => poAPI.terminate(id, reason),
    onSuccess: () => {
      toast.success('Purchase Order terminated — linked MR items are available again');
      setSelectedPO(null);
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Termination failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => poAPI.update(id, data),
    onSuccess: (res) => {
      toast.success('PO updated successfully');
      setEditingPO(null);
      // Refresh detail and list
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders', selectedPO?.id] });
      qc.invalidateQueries({ queryKey: ['mrs-for-po'] });
      if (selectedPO && res?.data?.data) setSelectedPO(res.data.data);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to update PO'),
  });

  const isRecvUnbilled = p => {
    const recv = parseFloat(p.received_value) || 0;
    const billed = parseFloat(p.billed_amount) || 0;
    return recv > 0 && recv > billed + 100;
  };

  const filtered = poData.filter(p => {
    if (filterSeries) {
      const ref = (p.po_ref_no || p.serial_no_formatted || p.po_number || '').toUpperCase();
      if (!ref.startsWith(filterSeries.toUpperCase())) return false;
    }
    if (projectFilter !== 'all' && String(p.project_id) !== String(projectFilter)) return false;
    if (statusFilter === 'recv_unbilled') { if (!isRecvUnbilled(p)) return false; }
    else if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        p.po_number?.toLowerCase().includes(q) ||
        p.po_ref_no?.toLowerCase().includes(q) ||
        p.serial_no_formatted?.toLowerCase().includes(q) ||
        p.vendor_name?.toLowerCase().includes(q) ||
        p.project_name?.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q) ||
        p.narration?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const sortAccessors = {
    po_ref:       p => (p.po_ref_no || p.po_number || p.serial_no_formatted || '').toLowerCase(),
    vendor_name:  p => (p.vendor_name || '').toLowerCase(),
    project_name: p => (p.project_name || '').toLowerCase(),
    po_date:      p => (p.po_date ? new Date(p.po_date).getTime() : 0),
    delivery:    p => (p.delivery_date ? new Date(p.delivery_date).getTime() : 0),
    grand_total: p => (parseFloat(p.grand_total) || 0),
    billed_amount: p => (parseFloat(p.billed_amount) || 0),
    paid_amount:   p => (parseFloat(p.paid_amount) || 0),
    status:      p => (p.status || '').toLowerCase(),
  };
  const sorted = [...filtered].sort((a, b) => {
    const acc = sortAccessors[sortConfig.key] || sortAccessors.po_date;
    const av = acc(a), bv = acc(b);
    if (av < bv) return sortConfig.dir === 'asc' ? -1 : 1;
    if (av > bv) return sortConfig.dir === 'asc' ? 1 : -1;
    return 0;
  });
  const toggleSort = (key) =>
    setSortConfig(c => c.key === key
      ? { key, dir: c.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });

  const exportCSV = () => {
    const headers = ['PO Number', 'Vendor', 'Project', 'PO Date', 'Grand Total', 'Billed', 'Paid', 'Status'];
    const rows = filtered.map(p => [
      p.po_ref_no || p.po_number || p.serial_no_formatted, p.vendor_name, p.project_name,
      fmt(p.po_date), p.grand_total, p.billed_amount || 0, p.paid_amount || 0, p.status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `PO_Log_${dayjs().format('YYYY-MM-DD')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Exporting PO log…');
  };

  const stats = [
    { key: 'pending',        label: 'Pending Audit', icon: Clock,        iconBg: 'bg-amber-50',   iconText: 'text-amber-600'   },
    { key: 'verified_audit', label: 'Audit OK',       icon: UserCheck,    iconBg: 'bg-blue-50',    iconText: 'text-blue-600'    },
    { key: 'released_mgmt',  label: 'Mgmt Released',  icon: Building2,    iconBg: 'bg-violet-50',  iconText: 'text-violet-600'  },
    { key: 'approved',       label: 'Authorized',     icon: CheckCircle2, iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
    { key: 'part_received',  label: 'Receiving',      icon: Package,      iconBg: 'bg-cyan-50',    iconText: 'text-cyan-600'    },
    { key: 'fully_received', label: 'Received',       icon: Check,        iconBg: 'bg-green-50',   iconText: 'text-green-600'   },
  ];

  const totalPOValue    = poData.reduce((s, p) => s + (parseFloat(p.grand_total) || 0), 0);
  const totalBilled     = poData.reduce((s, p) => s + (parseFloat(p.billed_amount) || 0), 0);
  const totalPaid       = poData.reduce((s, p) => s + (parseFloat(p.paid_amount) || 0), 0);
  const billedPct       = totalPOValue > 0 ? (totalBilled / totalPOValue) * 100 : 0;

  const recvUnbilledList = poData.filter(isRecvUnbilled);
  const recvUnbilledGap  = recvUnbilledList.reduce((s, p) =>
    s + Math.max((parseFloat(p.received_value) || 0) - (parseFloat(p.billed_amount) || 0), 0), 0);

  const financeCards = [
    { label: 'Total POs',        value: poData.length,              sub: projectFilter === 'all' ? 'All projects' : 'This project', icon: ShoppingCart,    iconBg: 'bg-slate-100',  iconText: 'text-slate-600' },
    { label: 'Total PO Value',   value: inrCompact(totalPOValue),   sub: inr(totalPOValue),  icon: IndianRupee,     iconBg: 'bg-indigo-50',  iconText: 'text-indigo-600', full: inr(totalPOValue) },
    { label: 'Total Billed',     value: inrCompact(totalBilled),    sub: `${billedPct.toFixed(1)}% of PO value`, icon: Receipt,         iconBg: 'bg-blue-50',    iconText: 'text-blue-600',   full: inr(totalBilled) },
    { label: 'Total Paid',       value: inrCompact(totalPaid),      sub: totalBilled > 0 ? `${((totalPaid / totalBilled) * 100).toFixed(1)}% of billed` : '—', icon: CheckCircle2, iconBg: 'bg-green-50',   iconText: 'text-green-600',  full: inr(totalPaid) },
    { label: 'Recv\'d Unbilled', value: recvUnbilledList.length > 0 ? `${recvUnbilledList.length} PO${recvUnbilledList.length > 1 ? 's' : ''}` : '—',
      sub: recvUnbilledList.length > 0 ? `${inrCompact(recvUnbilledGap)} gap` : 'All receipts invoiced',
      icon: AlertTriangle,       iconBg: recvUnbilledList.length > 0 ? 'bg-amber-50' : 'bg-slate-50',
      iconText: recvUnbilledList.length > 0 ? 'text-amber-600' : 'text-slate-400',
      filterKey: 'recv_unbilled', full: recvUnbilledList.length > 0 ? `${recvUnbilledList.length} POs with ${inr(recvUnbilledGap)} received but not yet invoiced` : 'No unbilled receipts' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto min-h-screen bg-slate-50">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium mb-1">
            <ShoppingCart className="w-3.5 h-3.5" /> Procurement
          </div>
          <h1 className="text-xl font-semibold text-slate-800">Purchase Orders</h1>
          <p className="text-sm text-slate-400 mt-0.5">4-stage authorization workflow</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-4 h-9 bg-white border border-slate-300 text-slate-600 text-sm font-medium rounded-md hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 h-9 bg-white border border-blue-200 text-blue-600 text-sm font-medium rounded-md hover:bg-blue-50 transition-colors">
            <Upload className="w-4 h-4" /> Import Excel
          </button>
          <button onClick={() => { setPrefillData(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 h-9 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> New Purchase Order
          </button>
        </div>
      </div>

      {/* Signature alert */}
      {!user?.signature_url && (
        <div className="mb-5 bg-yellow-50 border border-yellow-200 border-l-4 border-l-yellow-400 rounded-lg p-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
          <p className="text-xs text-yellow-800 font-medium">
            Digital signature required to authorize POs.{' '}
            <Link to="/profile" className="underline font-medium hover:text-yellow-900">Upload in Profile →</Link>
          </p>
        </div>
      )}

      {/* Financial summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        {financeCards.map(({ label, value, sub, icon, iconBg, iconText, full, filterKey }, i) => (
          <Kpi3DCard key={label} index={i} icon={icon} value={value} label={label} sub={sub}
            iconBg={iconBg} iconText={iconText} title={full}
            active={filterKey && statusFilter === filterKey}
            onClick={filterKey ? () => setStatusFilter(statusFilter === filterKey ? 'all' : filterKey) : undefined} />
        ))}
      </div>

      {/* Workflow stage KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {stats.map(({ key, label, icon, iconBg, iconText }, i) => {
          const count = poData.filter(p => p.status === key).length;
          return (
            <Kpi3DCard key={key} index={i + financeCards.length} icon={icon} value={count} label={label}
              iconBg={iconBg} iconText={iconText} active={statusFilter === key}
              onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)} />
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="relative min-w-52">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-900 font-medium outline-none focus:border-indigo-400 transition-all appearance-none cursor-pointer"
          >
            <option value="all">All Projects</option>
            {projectsData.map(p => (
              <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ${p.name}` : p.name}</option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search PO number, vendor, project…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none focus:border-indigo-400 transition-all" />
        </div>
        {/* Series filter */}
        <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
          {[['', 'All Series'], ['POTQS', 'POTQS'], ['PODQS', 'PODQS']].map(([val, lbl]) => (
            <button key={val} onClick={() => setFilterSeries(val)}
              className={clsx(
                'px-3 h-7 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all border',
                filterSeries === val
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-amber-400 hover:text-amber-600'
              )}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            ['all',            'All'       ],
            ['pending',        'Pending'   ],
            ['verified_audit', 'Audit OK'  ],
            ['released_mgmt',  'Released'  ],
            ['approved',       'Authorized'],
            ['part_received',  'Part Rcvd' ],
            ['fully_received', 'Received'  ],
            ['rejected',       'Rejected'  ],
          ].map(([val, lbl]) => (
            <button key={val} onClick={() => setStatusFilter(val)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                statusFilter === val
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              )}>
              {lbl}
              {val !== 'all' && <span className="ml-1 opacity-70">{poData.filter(p => p.status === val).length}</span>}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 ml-auto hidden sm:block">{filtered.length} of {poData.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {[
                  { label: 'PO Reference',   key: 'po_ref' },
                  { label: 'Vendor',         key: 'vendor_name' },
                  { label: 'Project',        key: 'project_name' },
                  { label: 'PO Date',        key: 'po_date' },
                  { label: 'Delivery',       key: 'delivery' },
                  { label: 'Receipt',        key: null },
                  { label: 'Total with GST', key: 'grand_total' },
                  { label: 'Billed',         key: 'billed_amount' },
                  { label: 'Paid',           key: 'paid_amount' },
                  { label: 'Status',         key: 'status' },
                  { label: '',               key: null },
                ].map(h => (
                  <th key={h.label || 'actions'} className="px-5 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h.key ? (
                      <button onClick={() => toggleSort(h.key)} className="inline-flex items-center gap-1 hover:text-indigo-600 transition-colors uppercase tracking-wider">
                        {h.label}
                        {sortConfig.key === h.key
                          ? (sortConfig.dir === 'asc'
                              ? <ChevronUp className="w-3.5 h-3.5 text-indigo-600" />
                              : <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />)
                          : <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />}
                      </button>
                    ) : h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(po => (
                <React.Fragment key={po.id}>
                <tr onClick={() => setSelectedPO(po)}
                  className="cursor-pointer hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="text-xs font-medium font-mono text-indigo-600 group-hover:underline">
                      {po.po_ref_no || po.po_number || po.serial_no_formatted}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-slate-800 max-w-56 truncate">{(po.vendor_name || '').toUpperCase()}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="text-xs text-slate-400 truncate max-w-56">{(po.project_name || '').toUpperCase()}</div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs font-medium text-slate-700">{fmt(po.po_date)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-400">{fmt(po.delivery_date)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {po.items_total > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${po.items_received >= po.items_total ? 'bg-green-500' : po.items_received > 0 ? 'bg-amber-400' : 'bg-slate-200'}`}
                            style={{ width: `${Math.round((po.items_received / po.items_total) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{po.items_received}/{po.items_total}</span>
                      </div>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-800">{inr(po.grand_total)}</div>
                    <div className="text-xs text-slate-400">{po.gst_inclusive ? 'Tax inclusive' : 'Basic + GST'}</div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="text-sm font-medium text-blue-700">{inrCompact(po.billed_amount)}</div>
                    {parseFloat(po.grand_total) > 0 && (
                      <div className="text-xs text-slate-400">{((parseFloat(po.billed_amount || 0) / parseFloat(po.grand_total)) * 100).toFixed(0)}% of PO</div>
                    )}
                    {isRecvUnbilled(po) && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                        <span className="text-[10px] font-medium text-amber-600">
                          {inrCompact((parseFloat(po.received_value) || 0) - (parseFloat(po.billed_amount) || 0))} recv'd unbilled
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="text-sm font-medium text-green-700">{inrCompact(po.paid_amount)}</div>
                    {parseFloat(po.billed_amount) > 0 && (
                      <div className="text-xs text-slate-400">{((parseFloat(po.paid_amount || 0) / parseFloat(po.billed_amount)) * 100).toFixed(0)}% of billed</div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <StatusBadge status={po.status} />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setAttachPOId(attachPOId === po.id ? null : po.id)}
                        title="Attachments"
                        className={clsx(
                          'flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all',
                          attachPOId === po.id
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 opacity-0 group-hover:opacity-100'
                        )}
                      >
                        <Upload className="w-3 h-3" />
                        {attachPOId === po.id ? 'Close' : 'Attach'}
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                    </div>
                  </td>
                </tr>
                {attachPOId === po.id && (
                  <tr>
                    <td colSpan={9} className="px-6 pb-4 bg-indigo-50/30 border-b border-indigo-100">
                      <RecordAttachments
                        module="purchase_order"
                        recordId={po.id}
                        projectId={po.project_id}
                        label="PO Attachments — Contracts, Delivery Challans, Approvals, Invoices"
                      />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
              {poError && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-red-500 text-sm">
                    Failed to load purchase orders. Please refresh.
                  </td>
                </tr>
              )}
              {!poError && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-400">No purchase orders found</p>
                    <p className="text-xs text-slate-300 mt-1">Adjust filters or create a new PO</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
          Showing {filtered.length} of {poData.length} purchase orders
        </div>
      </div>

      {/* Detail slide-over */}
      {selectedPO && (
        <PODetailPanel
          po={selectedPO}
          detailedPO={detailedPO}
          company={companyData}
          onClose={() => setSelectedPO(null)}
          onEdit={(po) => setEditingPO(po)}
          onApprove={(stage) => {
            approveMutation.mutate({ id: selectedPO.id, stage });
          }}
          onReject={(reason) => rejectMutation.mutate({ id: selectedPO.id, reason })}
          onTerminate={(reason) => terminateMutation.mutate({ id: selectedPO.id, reason })}
          isApproving={approveMutation.isPending}
          isRejecting={rejectMutation.isPending}
          isTerminating={terminateMutation.isPending}
          user={user}
        />
      )}

      {/* New PO modal */}
      {showForm && (
        <NewPOModal
          onClose={() => { setShowForm(false); setPrefillData(null); }}
          vendors={vendorsData}
          projects={projectsData}
          mrsList={mrsData}
          onCreate={d => createMutation.mutate(d)}
          isPending={createMutation.isPending}
          prefill={prefillData}
          company={companyData}
        />
      )}

      {/* Edit PO modal */}
      {editingPO && (
        <NewPOModal
          onClose={() => setEditingPO(null)}
          vendors={vendorsData}
          projects={projectsData}
          mrsList={mrsData}
          onUpdate={d => updateMutation.mutate({ id: editingPO.id, data: d })}
          isPending={updateMutation.isPending}
          editingPO={editingPO}
          company={companyData}
        />
      )}

      {showImport && (
        <POImportModal
          onClose={() => setShowImport(false)}
          vendors={vendorsData}
          projects={projectsData}
          onImported={() => qc.invalidateQueries({ queryKey: ['purchase-orders'] })}
        />
      )}
    </div>
  );
}
