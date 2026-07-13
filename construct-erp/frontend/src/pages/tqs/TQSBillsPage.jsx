import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { tqsBillsAPI, projectAPI, tqsVendorsAPI, poAPI, inventoryAPI, subcontractorAPI, boqAPI } from '../../api/client';
import { BOQ_COST_HEADS } from '../../constants/boqCostHeads';
import { guessCostHead, guessBoqItem } from '../../utils/boqCostHeadGuess';
import MaterialCombobox from '../../components/shared/MaterialCombobox';
import SearchableSelect from '../../components/shared/SearchableSelect';
import { FIELD_HL } from '../../constants/fieldStyles';
import { Z_CARD, Z_HEAD } from '../../constants/zohoStyles';
import { clsx } from 'clsx';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { FileText, Plus, Search, ChevronRight, X, ChevronUp, ChevronDown, Pencil, Trash2, AlertTriangle, Upload, Download, CheckCircle2, IndianRupee, SlidersHorizontal, FileSpreadsheet, ChevronsRight, ExternalLink, Edit2, Building2, Truck, Receipt, StickyNote, Package } from 'lucide-react';
import dayjs from 'dayjs';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';

const STATUS_CONFIG = {
  pending:             { label: 'Pending',       cls: 'bg-amber-100 text-amber-700' },
  stores:              { label: 'Stores',        cls: 'bg-blue-100 text-blue-700' },
  document_controller: { label: 'Doc Control',   cls: 'bg-cyan-100 text-cyan-700' },
  qs:                  { label: 'QS Cert',       cls: 'bg-emerald-100 text-emerald-700' },
  accounts:            { label: 'Accounts',      cls: 'bg-purple-100 text-purple-700' },
  procurement:         { label: 'Procurement',   cls: 'bg-orange-100 text-orange-700' },
  qs_sign:             { label: 'QS Sign',       cls: 'bg-violet-100 text-violet-700' },
  paid:                { label: 'Paid',          cls: 'bg-emerald-100 text-emerald-700' },
  partial:             { label: 'Partial',       cls: 'bg-teal-100 text-teal-700' },
};

const moneyValue = (v) => {
  const rounded = Math.round(Number(v || 0));
  return Object.is(rounded, -0) ? 0 : rounded;
};
const inr = (v) => moneyValue(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = (v) => Number(v || 0) || 0;
const billBalanceDue = (bill = {}) => {
  const apiBalance = num(bill.balance_to_pay_display ?? bill.liability_balance ?? bill.balance_to_pay);
  const paid = num(bill.paid_amount);
  const deductions = num(bill.tds_deduction) + num(bill.other_deductions) + num(bill.advance_recovered);
  const invoiceTotal = num(bill.total_amount);
  const certifiedNet = num(bill.certified_net);
  const certifiedBalance = certifiedNet > 0 && (!invoiceTotal || certifiedNet <= invoiceTotal + 1)
    ? certifiedNet - paid
    : 0;
  const invoiceBalance = num(bill.total_amount) - deductions - paid;
  const calculatedBalance = Math.max(certifiedBalance, invoiceBalance, 0);

  if (bill.workflow_status === 'paid' || bill.payment_status === 'paid') {
    return calculatedBalance;
  }
  return Math.max(apiBalance, calculatedBalance, 0);
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

const EMPTY_FORM = {
  vendor_id: '', vendor_name: '', project_id: '', bill_type: 'po', tax_mode: 'intrastate',
  work_desc: '', po_id: '', grn_id: '', po_number: '', po_date: '',
  inv_number: '', inv_date: '', inv_month: '',
  received_date: '', basic_amount: '',
  transport_charges: '', transport_gst_pct: '', transport_gst_amt: '', transport_desc: '',
  other_charges: '', other_charges_desc: '',
  credit_note_num: '', credit_note_val: '', remarks: '',
  tcs_pct: '',
  // hire/rental fields
  hire_period_from: '', hire_period_to: '', equipment_type: '',
  // transient (not sent to backend)
  cgst_pct: '', sgst_pct: '', igst_pct: '',
};

const EMPTY_ITEM = { category: '', item_name: '', unit: '', quantity: '', rate: '', discount_amount: '', gst_pct: '18', po_item_id: '', wo_item_id: '', remaining_qty: null, boq_item_id: '', cost_head: '' };

const F = `w-full h-10 rounded-lg px-3 text-sm font-medium text-slate-900 outline-none transition-all border placeholder:text-slate-500 ${FIELD_HL}`;

function Lbl({ children, req }) {
  return <label className="block text-[11px] font-medium text-slate-500 mb-1 tracking-wide">{children}{req && <span className="text-red-400 ml-0.5">*</span>}</label>;
}

function calcItemRow(it, taxMode) {
  const qty = parseFloat(it.quantity || 0);
  const rate = parseFloat(it.rate || 0);
  const rawDiscount = parseFloat(it.discount_amount || 0);
  const legacyDiscount = !rawDiscount && qty === 0 && rate < 0 ? Math.abs(rate) : 0;
  const discount = Math.abs(rawDiscount || legacyDiscount);
  const gross = qty * rate;
  const basic = gross - discount;
  const gstPct = parseFloat(it.gst_pct || 0);
  const mode = taxMode === 'interstate' ? 'interstate' : 'intrastate';
  const gst = basic * gstPct / 100;
  return { gross, discount, basic, gst, total: basic + gst, mode };
}

function POWOWarningBanner({ warning }) {
  if (!warning) return null;
  const label = warning.kind || 'PO';
  if (warning.type === 'closed') {
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg border-2 border-red-300 bg-red-50 mt-2">
        <span className="text-red-500 text-xl leading-none mt-0.5">🔒</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-700">{label} Closed — {warning.pct}% Already Billed</p>
          <p className="text-xs text-red-600 mt-1">
            <strong>{warning.po_number}</strong> ({warning.vendor_name})<br />
            {label} Value: ₹{inr(warning.total_amount)} | Already Billed: ₹{inr(warning.billed_amount)}
          </p>
          <p className="text-xs text-red-600 mt-1.5 font-semibold bg-red-100 rounded px-2 py-1 inline-block">
            🚫 Bill creation is blocked. This {label} is fully consumed.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 mt-2">
      <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-700">Partial Bills Already Raised on This {label}</p>
        <p className="text-xs text-amber-600 mt-0.5">
          <strong>{warning.po_number}</strong> ({warning.vendor_name}) — ₹{inr(warning.billed_amount)} already billed out of ₹{inr(warning.total_amount)} ({warning.pct}%).
        </p>
      </div>
    </div>
  );
}

// Professional section-card wrapper used across the New/Edit Bill screens —
// icon chip + title + optional subtitle/badge, in place of the plain
// Z_CARD/Z_HEAD text-only headers.
function SectionCard({ icon: Icon, title, subtitle, badge, right, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-blue-600" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[13.5px] font-semibold text-slate-800 truncate">{title}</h3>
              {badge}
            </div>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function NewBillModal({ onClose, projects, defaultProjectId }) {
  // Local, calmer field styling for this form only — plain white/gray inputs
  // with a blue focus ring (matches the New MR page's look), replacing the
  // shared FIELD_HL "always-highlighted" style still used by Edit Bill /
  // Record Advance below. Shadows the module-level FIELD_HL/F/Lbl so every
  // input, label and table cell in this form picks it up automatically
  // without touching Edit Bill or Record Advance.
  const FIELD_HL = 'border-slate-300 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30';
  const F = 'w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30';
  function Lbl({ children, req }) {
    return <label className="block text-xs font-medium text-slate-500 mb-1">{children}{req && <span className="text-red-500 ml-0.5">*</span>}</label>;
  }

  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM, project_id: defaultProjectId || '' });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [showVendorList, setShowVendorList] = useState(false);
  const vendorInputRef = useRef(null);
  const [vendorDropPos, setVendorDropPos] = useState({ top: 0, left: 0, width: 0 });
  const [poWarning, setPoWarning] = useState(null); // { type: 'closed'|'partial', po_number, billed_amount, total_amount }

  const { data: vendors = [], isLoading: vendorsLoading, isError: vendorsError } = useQuery({
    queryKey: ['tqs-vendors'],
    queryFn: () => tqsVendorsAPI.list().then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
      return list;
    }),
    staleTime: 60000,
  });

  // Previous bills - used to show per-vendor invoice count in the dropdown
  const { data: allBills = [] } = useQuery({
    queryKey: ['tqs-bills-modal', form.project_id],
    queryFn: () => tqsBillsAPI.list(form.project_id ? { project_id: form.project_id } : {})
      .then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 5 * 60 * 1000,
  });

  // Inventory items from Store Ledger - for item-name autocomplete + category auto-fill
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-items-lookup'],
    queryFn: () => inventoryAPI.itemsLookup().then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  // Fast lookup map: lowercase material_name -> { category, unit }
  const itemLookupMap = React.useMemo(() => {
    const map = {};
    inventoryItems.forEach(item => {
      map[item.material_name.toLowerCase()] = item;
    });
    return map;
  }, [inventoryItems]);

  // BOQ items for the selected project — lets each bill line be tagged to a BOQ item + cost sub-heading
  const { data: boqItems = [] } = useQuery({
    queryKey: ['tqs-boq-items', form.project_id],
    queryFn: () => boqAPI.summary(form.project_id).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!form.project_id,
    staleTime: 60000,
  });

  // Vendor outstanding summary — shown once a vendor is selected
  const { data: vendorOutstanding } = useQuery({
    queryKey: ['vendor-outstanding', form.vendor_id, form.vendor_name],
    queryFn: () => tqsBillsAPI.vendorOutstanding(
      form.vendor_id ? { vendor_id: form.vendor_id } : { vendor_name: form.vendor_name }
    ).then(r => r.data?.data),
    enabled: !!(form.vendor_id || form.vendor_name?.trim().length > 1),
    staleTime: 30000,
  });

  // Duplicate invoice number detection — fires when vendor + inv_number both filled
  const { data: dupBills = [] } = useQuery({
    queryKey: ['dup-check', form.vendor_name, form.inv_number],
    queryFn: () => tqsBillsAPI.checkDuplicate({ vendor_name: form.vendor_name, inv_number: form.inv_number })
      .then(r => r.data?.data ?? []),
    enabled: !!(form.vendor_name?.trim() && form.inv_number?.trim().length >= 2),
    staleTime: 10000,
  });

  // Approved POs available for invoicing (filtered by project once selected)
  const { data: availablePOs = [] } = useQuery({
    queryKey: ['tqs-lookup-pos', form.project_id, form.vendor_id, form.vendor_name],
    queryFn: () => tqsBillsAPI.lookupPOs({
      ...(form.project_id ? { project_id: form.project_id } : {}),
      ...(form.vendor_id ? { vendor_id: form.vendor_id } : form.vendor_name ? { vendor_name: form.vendor_name } : {}),
    })
      .then(r => r.data?.data || []),
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });

  const { data: availableWOs = [] } = useQuery({
    queryKey: ['tqs-lookup-wos', form.project_id, form.vendor_id, form.vendor_name],
    queryFn: () => tqsBillsAPI.lookupWOs({
      ...(form.project_id ? { project_id: form.project_id } : {}),
      ...(form.vendor_id ? { vendor_id: form.vendor_id } : form.vendor_name ? { vendor_name: form.vendor_name } : {}),
    }).then(r => r.data?.data || []),
    staleTime: 5 * 60 * 1000,
    enabled: form.bill_type === 'wo' || form.bill_type === 'hire',
  });

  // When user picks a PO, auto-fill vendor, po_number, po_date AND fetch line items
  const handlePOPick = async (poId) => {
    if (!poId) {
      setForm(f => ({ ...f, po_id: '', grn_id: '' }));
      setPoWarning(null);
      return;
    }
    const po = availablePOs.find(p => p.id === poId);
    if (!po) return;

    // ── Check PO billing status before proceeding ──────────────────────────
    const billedAmt  = parseFloat(po.billed_amount  || 0);
    const totalAmt   = parseFloat(po.total_amount   || 0);
    const billedPct  = totalAmt > 0 ? Math.round((billedAmt / totalAmt) * 100) : 0;
    // Treat as fully closed if: line-item flag OR amount is ≥ 99% consumed
    const isClosed   = po.is_fully_billed || billedPct >= 99;

    if (isClosed) {
      setPoWarning({
        type: 'closed',
        po_number:    po.po_number,
        billed_amount: billedAmt,
        total_amount:  totalAmt,
        vendor_name:  po.vendor_name,
        pct:          billedPct,
      });
    } else if (billedAmt > 0) {
      setPoWarning({
        type: 'partial',
        po_number:    po.po_number,
        billed_amount: billedAmt,
        total_amount:  totalAmt,
        vendor_name:  po.vendor_name,
        pct:          billedPct,
      });
    } else {
      setPoWarning(null);
    }

    setForm(f => ({
      ...f,
      po_id: po.id,
      po_number: po.po_number || f.po_number,
      po_date: po.po_date ? po.po_date.slice(0, 10) : f.po_date,
      vendor_id: po.vendor_id || f.vendor_id,
      vendor_name: po.vendor_name || f.vendor_name,
      project_id: po.project_id || f.project_id,
      grn_id: '',
    }));
    setVendorSearch(po.vendor_name || '');

    // Fetch PO line items + remaining invoiceable balance
    try {
      const [poRes, balRes] = await Promise.all([
        poAPI.get(poId),
        tqsBillsAPI.lookupPOBalance(poId),
      ]);
      const poData  = poRes.data?.data || poRes.data;
      const poItems = poData?.items || poData?.po_items || [];
      const poIsTaxInclusive = Boolean(poData?.gst_inclusive);
      const balMap  = {};
      for (const b of (balRes.data?.data || [])) balMap[b.po_item_id] = b;

      if (poItems.length > 0) {
        setItems(poItems.map(it => {
          const bal = balMap[it.id] || {};
          const isDiscountLine = String(it.material_name || it.item_name || it.description || '').trim().toLowerCase() === 'discount'
            || Number(it.total_amount || 0) < 0;
          return {
            category:      '',
            item_name:     it.material_name || it.item_name || it.description || '',
            unit:          it.unit          || '',
            quantity:      isDiscountLine ? '0' : (bal.remaining_qty != null ? String(bal.remaining_qty) : (it.quantity || '')),
            rate:          isDiscountLine ? '0' : (it.rate || ''),
            gst_pct:       poIsTaxInclusive ? '0' : it.gst_rate != null ? String(it.gst_rate)
                         : it.gst_pct  != null ? String(it.gst_pct) : '18',
            po_item_id:    it.id            || '',
            wo_item_id:    '',
            // Carry over the chapter/cost-head tagged on the PO item itself, so a
            // bill raised against this PO keeps the same Budget Breakdown attribution
            // instead of falling back to a keyword guess (classifyItemCostHead).
            boq_item_id:   it.boq_item_id   || '',
            cost_head:     it.cost_head     || '',
            remaining_qty: bal.remaining_qty != null ? parseFloat(bal.remaining_qty) : null,
            discount_amount: it.discount_amount != null
              ? String(Math.abs(Number(it.discount_amount) || 0))
              : (isDiscountLine
                ? String(Math.abs(Number(it.total_amount || it.rate || 0)))
                : ''),
          };
        }));
        if (poIsTaxInclusive) {
          setForm(f => ({ ...f, cgst_pct: '0', sgst_pct: '0', igst_pct: '0' }));
        }
        if (!po.is_fully_billed) {
          toast.success(`PO ${po.po_number} linked — ${poItems.length} item${poItems.length > 1 ? 's' : ''} loaded`);
        }
      } else {
        if (!po.is_fully_billed) {
          toast.success(`PO ${po.po_number} linked — vendor & project auto-filled`);
        }
      }
    } catch {
      if (!po.is_fully_billed) {
        toast.success(`PO ${po.po_number} linked — vendor & project auto-filled`);
      }
    }
  };

  const handleWOPick = async (woNumber) => {
    const wo = availableWOs.find(w => w.wo_number === woNumber);
    if (!wo) {
      set('po_number', woNumber);
      setPoWarning(null);
      return;
    }

    // ── Check WO billing status before proceeding ──────────────────────────
    const billedAmt = parseFloat(wo.billed_amount || 0);
    const totalAmt  = parseFloat(wo.total_amount  || 0);
    const billedPct = totalAmt > 0 ? Math.round((billedAmt / totalAmt) * 100) : 0;
    const isClosed  = wo.is_fully_billed || billedPct >= 99;

    if (isClosed) {
      setPoWarning({
        type:         'closed',
        kind:         'WO',
        po_number:    wo.wo_number,
        billed_amount: billedAmt,
        total_amount:  totalAmt,
        vendor_name:  wo.vendor_name,
        pct:          billedPct,
      });
    } else if (billedAmt > 0) {
      setPoWarning({
        type:         'partial',
        kind:         'WO',
        po_number:    wo.wo_number,
        billed_amount: billedAmt,
        total_amount:  totalAmt,
        vendor_name:  wo.vendor_name,
        pct:          billedPct,
      });
    } else {
      setPoWarning(null);
    }

    setForm(f => ({
      ...f,
      po_number: wo.wo_number || f.po_number,
      po_date: wo.wo_date ? wo.wo_date.slice(0, 10) : f.po_date,
      vendor_id: wo.vendor_id || f.vendor_id,
      vendor_name: wo.vendor_name || f.vendor_name,
      project_id: wo.project_id || f.project_id,
      work_desc: wo.subject || f.work_desc,
      po_id: '',
      grn_id: '',
    }));
    setVendorSearch(wo.vendor_name || '');
    try {
      const woRes = await subcontractorAPI.getWorkOrder(wo.id);
      const woData = woRes.data?.data || woRes.data || {};
      const woItems = woData.items || [];

      if (woItems.length > 0) {
        setItems(woItems.map(it => {
          const remaining = it.remaining_qty != null
            ? Number(it.remaining_qty)
            : Math.max(Number(it.quantity || 0) - Number(it.billed_qty || 0), 0);
          const itemName = it.description || it.item_name || '';
          // Auto-link to BOQ item if the WO item was mapped (sc_wo_items.boq_item_id); user can override
          let boqItemId = it.boq_item_id || '';
          let costHead = '';
          const guessedHead = guessCostHead(itemName);
          if (guessedHead) {
            costHead = guessedHead;
            if (!boqItemId) {
              const guessedBoq = guessBoqItem(guessedHead, boqItems);
              if (guessedBoq) boqItemId = guessedBoq.id;
            }
          }
          return {
            category: '',
            item_name: itemName,
            unit: it.unit || '',
            quantity: String(remaining),
            rate: it.rate || '',
            gst_pct: it.gst_rate != null ? String(it.gst_rate)
              : it.gst_pct != null ? String(it.gst_pct) : '18',
            po_item_id: '',
            wo_item_id: it.id || '',
            boq_item_id: boqItemId,
            cost_head: costHead,
            remaining_qty: remaining,
            discount_amount: it.discount_amount != null ? String(Math.abs(Number(it.discount_amount) || 0)) : '',
          };
        }));
        if (!isClosed) toast.success(`WO ${wo.wo_number} linked — ${woItems.length} item${woItems.length > 1 ? 's' : ''} loaded`);
      } else {
        setItems([{ ...EMPTY_ITEM }]);
        if (!isClosed) toast.success(`WO ${wo.wo_number} linked — no line items found`);
      }
    } catch {
      if (!isClosed) toast.success(`WO ${wo.wo_number} linked — header details loaded`);
    }
  };

  // GRNs against the chosen PO (optional linkage)
  const { data: availableGRNs = [] } = useQuery({
    queryKey: ['tqs-lookup-grns', form.po_id, form.project_id],
    queryFn: () => tqsBillsAPI.lookupGRNs({
      ...(form.po_id ? { po_id: form.po_id } : {}),
      ...(form.project_id ? { project_id: form.project_id } : {}),
    }).then(r => r.data?.data || []),
    enabled: !!(form.po_id || form.project_id),
    staleTime: 5 * 60 * 1000,
  });

  // WO bill -> subcontractors & labour; PO bill -> everyone else (material, equipment, service providers, etc.)
  const normalizeVendorType = (type) =>
    String(type || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const WO_STRICT_TYPES = new Set(['subcontractor', 'sub_contractor', 'labour_contractor', 'labor_contractor']);

  const typeFilteredVendors = vendors.filter(v => {
    const vendorType = normalizeVendorType(v.vendor_type);
    if (form.bill_type === 'wo')   return WO_STRICT_TYPES.has(vendorType) || vendorType === 'service_provider';
    if (form.bill_type === 'hire') return ['equipment', 'plant', 'hire', 'rental', 'service_provider', 'supplier'].some(t => vendorType.includes(t)) || !WO_STRICT_TYPES.has(vendorType);
    if (form.bill_type === 'po')   return !WO_STRICT_TYPES.has(vendorType);
    return true;
  });

  const filteredVendors = typeFilteredVendors.filter(v =>
    !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectVendor = (v) => {
    setForm(f => ({ ...f, vendor_name: v.name, vendor_id: v.id, po_id: '', grn_id: '', po_number: '', po_date: '' }));
    setVendorSearch(v.name);
    setShowVendorList(false);
  };

  const updateItem = (i, k, v) => setItems(p => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  // When item_name is typed/selected: auto-fill category & unit from store ledger
  const handleItemName = (i, value) => {
    const match = itemLookupMap[value.toLowerCase()];
    const category = match?.category ?? '';
    setItems(p => p.map((it, idx) => {
      if (idx !== i) return it;
      const next = {
        ...it,
        item_name: value,
        // Category is ONLY set from store ledger - locked once matched, cleared if item changes to no-match
        category,
        unit:     match?.unit     ? match.unit : it.unit,
      };
      // Suggest a cost head / BOQ item from the item name + category — only when
      // the user hasn't already picked one (never overrides a manual/WO-linked choice)
      if (!next.cost_head) {
        const guessedHead = guessCostHead(`${value} ${category}`);
        if (guessedHead) {
          next.cost_head = guessedHead;
          if (!next.boq_item_id) {
            const guessedBoq = guessBoqItem(guessedHead, boqItems);
            if (guessedBoq) next.boq_item_id = guessedBoq.id;
          }
        }
      }
      return next;
    }));
  };

  const addItem    = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i));

  // Auto-fill basic_amount from items sum
  const itemsGross   = items.reduce((s, it) => s + calcItemRow(it, form.tax_mode).gross, 0);
  const itemsDiscount = items.reduce((s, it) => s + calcItemRow(it, form.tax_mode).discount, 0);
  const itemsBasic   = items.reduce((s, it) => s + calcItemRow(it, form.tax_mode).basic, 0);
  const itemsGST     = items.reduce((s, it) => s + calcItemRow(it, form.tax_mode).gst, 0);
  const manualBasic  = parseFloat(form.basic_amount) || 0;
  const effectBasic  = itemsBasic > 0 ? itemsBasic : manualBasic;

  // GST on basic (only used when no line items)
  const noItems = items.every(it => !it.item_name);
  const taxMode = form.tax_mode;
  let cgstPct = 0, sgstPct = 0, igstPct = 0, cgstAmt = 0, sgstAmt = 0, igstAmt = 0, totalGST = 0;
  if (noItems) {
    // manual GST entry via quick buttons - user sets raw totals
    cgstAmt = manualBasic * (parseFloat(form.cgst_pct) || 0) / 100;
    sgstAmt = manualBasic * (parseFloat(form.sgst_pct) || 0) / 100;
    igstAmt = manualBasic * (parseFloat(form.igst_pct) || 0) / 100;
    totalGST = cgstAmt + sgstAmt + igstAmt;
  } else {
    totalGST = itemsGST;
    if (taxMode === 'interstate') { igstPct = 0; igstAmt = totalGST; }
    else { cgstAmt = totalGST / 2; sgstAmt = totalGST / 2; }
  }

  const transportAmt = parseFloat(form.transport_charges) || 0;
  const transportGST = transportAmt * (parseFloat(form.transport_gst_pct) || 0) / 100;
  const otherAmt     = parseFloat(form.other_charges) || 0;
  const preTcsTotal  = effectBasic + totalGST + transportAmt + transportGST + otherAmt;
  // TCS is charged on the basic (ex-GST) amount only, not the full invoice value
  const tcsAmt       = effectBasic * (parseFloat(form.tcs_pct) || 0) / 100;
  const grandTotal   = preTcsTotal + tcsAmt;

  // Quick GST button handler (sets CGST+SGST for intrastate, IGST for interstate)
  const applyGST = (pct, isIGST = false) => {
    if (isIGST) {
      set('tax_mode', 'interstate');
      setForm(f => ({ ...f, tax_mode: 'interstate', cgst_pct: '0', sgst_pct: '0', igst_pct: String(pct) }));
      setItems(p => p.map(it => ({ ...it, gst_pct: String(pct) })));
    } else {
      const half = (pct / 2).toFixed(1);
      setForm(f => ({ ...f, tax_mode: 'intrastate', cgst_pct: half, sgst_pct: half, igst_pct: '0' }));
      setItems(p => p.map(it => ({ ...it, gst_pct: String(pct) })));
    }
  };

  const mutation = useMutation({
    mutationFn: (data) => tqsBillsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
      toast.success('Bill created');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create bill'),
  });

  // Convert empty strings to 0 for numeric DB columns
  const n = (v) => (v === '' || v == null) ? 0 : parseFloat(v) || 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vendor_name?.trim()) return toast.error('Vendor is required');
    if (!form.inv_number?.trim()) return toast.error('Invoice number is required');
    if (!form.inv_date) return toast.error('Invoice date is required');
    if (form.bill_type === 'hire') {
      if (!form.equipment_type?.trim()) return toast.error('Equipment / Plant description is required');
      if (!form.hire_period_from) return toast.error('Hire period start date is required');
      if (!form.hire_period_to) return toast.error('Hire period end date is required');
    }

    // ── Block if PO is fully consumed ────────────────────────────────────
    if (poWarning?.type === 'closed') {
      return toast.error(
        `Purchase Order ${poWarning.po_number} is fully billed (${poWarning.pct}% consumed). ` +
        `No remaining quantity available. Please use a different PO or create a manual bill.`,
        { duration: 6000 }
      );
    }

    // Client-side PO quantity guard - catch it before the round-trip
    for (const it of items) {
      if (!it.item_name?.trim()) continue;
      if (it.remaining_qty !== null && it.remaining_qty !== undefined) {
        const entered = parseFloat(it.quantity || 0);
        if (entered > it.remaining_qty + 0.0001) {
          return toast.error(
            `"${it.item_name}": quantity ${entered} exceeds available ${it.remaining_qty}. ` +
            `Reduce the quantity or raise a separate bill for the remainder.`
          );
        }
      }
    }

    mutation.mutate({
      ...form,
      // Sanitize every numeric field - Postgres rejects empty strings for numeric columns
      basic_amount:       effectBasic.toFixed(2),
      cgst_pct:           cgstPct,        cgst_amt:          cgstAmt.toFixed(2),
      sgst_pct:           sgstPct,        sgst_amt:          sgstAmt.toFixed(2),
      igst_pct:           igstPct,        igst_amt:          igstAmt.toFixed(2),
      gst_amount:         totalGST.toFixed(2),
      transport_charges:  n(form.transport_charges).toFixed(2),
      transport_gst_pct:  n(form.transport_gst_pct),
      transport_gst_amt:  transportGST.toFixed(2),
      other_charges:      n(form.other_charges).toFixed(2),
      credit_note_val:    n(form.credit_note_val).toFixed(2),
      tcs_pct:            n(form.tcs_pct),
      tcs_amt:            tcsAmt.toFixed(2),
      total_amount:       grandTotal.toFixed(2),
      items:              items.filter(it => it.item_name?.trim()).map(it => {
        const row = calcItemRow(it, form.tax_mode);
        return {
          ...it,
          discount_amount: row.discount.toFixed(2),
          basic_amount: row.basic.toFixed(2),
          gst_amount: row.gst.toFixed(2),
          total_amount: row.total.toFixed(2),
        };
      }),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>

      {/* ── Page header ── */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 bg-white border-b border-slate-200">
        <div>
          <div className="text-xs text-slate-400 mb-1">Bill Tracker <span className="text-slate-300">›</span> Bills <span className="text-slate-300">›</span> <b className="text-slate-500">New Bill</b></div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold text-slate-900">New Bill</h1>
            <span className={clsx('text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border',
              form.bill_type === 'wo' ? 'bg-orange-50 text-orange-700 border-orange-200'
                : form.bill_type === 'hire' ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-blue-50 text-blue-700 border-blue-200')}>
              {form.bill_type === 'wo' ? 'Work Order' : form.bill_type === 'hire' ? 'Hire / Rental' : 'Purchase Order'}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="w-full max-w-[1600px] mx-auto px-6 py-6 space-y-5">

          {/* ── SECTION 1: Vendor & PO Info ── */}
          <SectionCard icon={Building2} title="Vendor & PO Information" subtitle="Who you're billing from, and the linked PO / WO">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Project */}
              <div>
                <Lbl req>Project</Lbl>
                <SearchableSelect
                  value={form.project_id}
                  onChange={v => set('project_id', v)}
                  options={projects.map(p => ({ value: p.id, label: p.name }))}
                  placeholder="Select project…"
                  searchPlaceholder="Search projects…"
                />
              </div>

              {/* Bill Type */}
              <div>
                <Lbl>Bill Type</Lbl>
                <select className={F} value={form.bill_type} onChange={e => { set('bill_type', e.target.value); setVendorSearch(''); set('vendor_name', ''); set('vendor_id', ''); }}>
                  <option value="po">Purchase Order (PO)</option>
                  <option value="wo">Work Order (WO)</option>
                  <option value="hire">Hire / Rental</option>
                </select>
              </div>

              {/* Vendor combobox */}
              <div className="relative col-span-2 md:col-span-3">
                <Lbl req>Vendor / Supplier</Lbl>
                <input
                  ref={vendorInputRef}
                  className={F}
                  placeholder="Type to search vendors..."
                  value={vendorSearch}
                  onChange={e => { setVendorSearch(e.target.value); set('vendor_name', e.target.value); set('vendor_id', ''); setShowVendorList(true); }}
                  onFocus={() => {
                    if (vendorInputRef.current) {
                      const r = vendorInputRef.current.getBoundingClientRect();
                      setVendorDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
                    }
                    setShowVendorList(true);
                  }}
                  onBlur={() => setTimeout(() => setShowVendorList(false), 150)}
                  required
                />
                {showVendorList && ReactDOM.createPortal(
                  <div style={{ position: 'fixed', top: vendorDropPos.top, left: vendorDropPos.left, width: vendorDropPos.width, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                    {vendorsLoading ? (
                      <div className="px-3 py-3 text-xs text-slate-500 text-center">Loading vendors...</div>
                    ) : vendorsError ? (
                      <div className="px-3 py-3 text-xs text-red-500 text-center">Failed to load vendors</div>
                    ) : filteredVendors.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-slate-500 text-center">
                        {vendors.length === 0 ? 'No vendors found in database' : `No match for "${vendorSearch}"`}
                        <div className="text-slate-400 mt-1">You can still type the name manually</div>
                      </div>
                    ) : (
                      <>
                        {filteredVendors.length > 0 && (
                          <div className="px-3 py-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-100">
                            {form.bill_type === 'wo' ? 'Work Order Vendors' : form.bill_type === 'hire' ? 'Hire/Rental Vendors' : 'Purchase Order Vendors'} ({filteredVendors.length})
                          </div>
                        )}
                        {filteredVendors.map(v => {
                          const prevBills = allBills.filter(b => b.vendor_name?.toLowerCase() === v.name?.toLowerCase());
                          const typeLabel = {
                            material_supplier:  'Material Supplier',
                            equipment_supplier: 'Equipment Supplier',
                            service_provider:   'Service Provider',
                            subcontractor:      'Subcontractor',
                            labour_contractor:  'Labour Contractor',
                          }[v.vendor_type] || v.vendor_type || '';
                          return (
                            <button key={v.id} type="button" onMouseDown={() => selectVendor(v)}
                              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-slate-50 last:border-0 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-700 truncate">{v.name}</div>
                                {typeLabel && <div className="text-[10px] text-slate-400 mt-0.5">{typeLabel}</div>}
                              </div>
                              {prevBills.length > 0 && (
                                <span className="text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
                                  {prevBills.length} bill{prevBills.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>,
                  document.body
                )}

              </div>

              {/* Vendor outstanding summary card */}
              {vendorOutstanding && vendorOutstanding.bill_count > 0 && vendorOutstanding.total_outstanding > 0 && (
                <div className="col-span-2 md:col-span-3 flex items-center gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-amber-800">
                    This vendor has <strong>{vendorOutstanding.bill_count} unpaid bill{vendorOutstanding.bill_count > 1 ? 's' : ''}</strong> with ₹{Number(vendorOutstanding.total_outstanding || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} outstanding
                    {vendorOutstanding.oldest_inv_date && ` — oldest since ${dayjs(vendorOutstanding.oldest_inv_date).format('DD MMM YYYY')}`}.
                  </span>
                </div>
              )}

              {/* Work Description - only for WO */}
              {form.bill_type === 'wo' && (
                <div className="col-span-2 md:col-span-3">
                  <Lbl req>Work Description</Lbl>
                  <input className={F} placeholder="Brief description of work done"
                    value={form.work_desc} onChange={e => set('work_desc', e.target.value)} />
                </div>
              )}

              {/* Hire/Rental fields */}
              {form.bill_type === 'hire' && (<>
                <div className="col-span-2 md:col-span-3">
                  <Lbl req>Equipment / Plant Description</Lbl>
                  <input className={F} placeholder="e.g. JCB Excavator, Transit Mixer, Tower Crane"
                    value={form.equipment_type} onChange={e => set('equipment_type', e.target.value)} />
                </div>
                <div>
                  <Lbl req>Hire Period From</Lbl>
                  <input type="date" className={F} value={form.hire_period_from}
                    onChange={e => set('hire_period_from', e.target.value)} />
                </div>
                <div>
                  <Lbl req>Hire Period To</Lbl>
                  <input type="date" className={F} value={form.hire_period_to}
                    onChange={e => set('hire_period_to', e.target.value)} />
                </div>
              </>)}

              {/* Link to Procurement PO (auto-fills vendor/po#/date) */}
              {form.bill_type === 'po' && (
                <div className="col-span-2 md:col-span-3 space-y-2">
                  <Lbl>Link to Approved PO <span className="text-[10px] text-slate-400 font-normal">(optional — auto-fills vendor & PO details)</span></Lbl>
                  <select className={F} value={form.po_id} onChange={e => handlePOPick(e.target.value)}>
                    <option value="">Manual entry (no PO link)</option>
                    {availablePOs.map(po => (
                      <option key={po.id} value={po.id}>
                        {po.is_fully_billed ? '🔒 [CLOSED] ' : ''}{po.po_number} — {po.vendor_name} — ₹{inr(po.total_amount)}
                        {po.is_fully_billed ? ' — Fully Billed' : po.billed_amount > 0 ? ` — ₹${inr(po.billed_amount)} billed` : ''}
                      </option>
                    ))}
                  </select>

                  {/* PO Warning Banner */}
                  {poWarning && <POWOWarningBanner warning={poWarning} />}
                </div>
              )}

              {/* Link to Work Order — for WO and Hire bills */}
              {(form.bill_type === 'wo' || form.bill_type === 'hire') && (
                <div className="col-span-2 md:col-span-3 space-y-2">
                  <Lbl>Link to Work Order <span className="text-[10px] text-slate-400 font-normal">(auto-fills vendor & WO details)</span></Lbl>
                  <select className={F} value={form.po_number}
                    onChange={e => handleWOPick(e.target.value)}>
                    <option value="">Select Work Order…</option>
                    {availableWOs.map(wo => {
                      const billedPct = wo.total_amount > 0 ? Math.round((wo.billed_amount / wo.total_amount) * 100) : 0;
                      const closed    = wo.is_fully_billed || billedPct >= 99;
                      return (
                        <option key={wo.id} value={wo.wo_number}>
                          {closed ? '🔒 [CLOSED] ' : ''}{wo.wo_number} — {wo.vendor_name} — ₹{inr(wo.total_amount)}
                          {closed ? ' — Fully Billed' : wo.billed_amount > 0 ? ` — ₹${inr(wo.billed_amount)} billed` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {/* WO Warning Banner */}
                  {poWarning && <POWOWarningBanner warning={poWarning} />}
                </div>
              )}

              {/* PO/WO Number - editable but auto-filled from PO picker */}
              <div>
                <Lbl>
                  {form.bill_type === 'hire' ? 'WO Number (Hire)' : form.bill_type === 'wo' ? 'WO Number' : 'PO Number'}
                  {form.bill_type !== 'hire' && <span className="text-red-500 ml-0.5">*</span>}
                </Lbl>
                <input className={F}
                  placeholder={form.bill_type === 'hire' ? 'WO-2025-001 (optional)' : form.bill_type === 'wo' ? 'WO-2025-001' : 'PO-2025-001'}
                  list={form.bill_type === 'wo' || form.bill_type === 'hire' ? 'wo-number-options' : 'po-number-options'}
                  value={form.po_number}
                  onChange={e => {
                    const val = e.target.value;
                    if (form.bill_type === 'wo' || form.bill_type === 'hire') handleWOPick(val);
                    else {
                      const po = availablePOs.find(p => p.po_number === val);
                      if (po) handlePOPick(po.id);
                      else set('po_number', val);
                    }
                  }} />
                <datalist id="wo-number-options">
                  {availableWOs.map(wo => <option key={wo.id} value={wo.wo_number}>{wo.vendor_name}</option>)}
                </datalist>
                <datalist id="po-number-options">
                  {availablePOs.map(po => <option key={po.id} value={po.po_number}>{po.vendor_name}</option>)}
                </datalist>
              </div>


              {/* PO Date */}
              <div>
                <Lbl>{form.bill_type === 'wo' || form.bill_type === 'hire' ? 'WO Date' : 'PO Date'}</Lbl>
                <input type="date" className={F} value={form.po_date} onChange={e => set('po_date', e.target.value)} />
              </div>

              {/* IGN link (optional, shown only when PO linked and IGN/GRNs exist) */}
              {form.bill_type === 'po' && form.po_id && availableGRNs.length > 0 && (
                <div className="col-span-2 md:col-span-3">
                  <Lbl>Link to IGN <span className="text-[10px] text-slate-400 font-normal">(optional - ties invoice to material receipt)</span></Lbl>
                  <select className={F} value={form.grn_id} onChange={e => set('grn_id', e.target.value)}>
                    <option value="">- No IGN/GRN link -</option>
                    {availableGRNs.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.serial_no_formatted || g.grn_number || g.ign_number} - {(g.grn_date || g.date_time) ? dayjs(g.grn_date || g.date_time).format('DD-MM-YYYY') : '—'} - Qty {Number(g.total_quantity||0).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Invoice Number */}
              <div className="col-span-2 md:col-span-1">
                <Lbl req>Invoice Number</Lbl>
                <input className={`${F}${dupBills.length > 0 ? ' border-red-400 focus:border-red-500 focus:ring-red-500/30' : ''}`} placeholder="INV-001"
                  value={form.inv_number} onChange={e => set('inv_number', e.target.value.toUpperCase())} required style={{ textTransform: 'uppercase' }} />
                {dupBills.length > 0 && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Duplicate: <strong>{form.inv_number}</strong> already exists for this vendor
                      {dupBills.map(b => ` (SL ${b.sl_number}${b.project_name ? ` — ${b.project_name}` : ''})`).join(', ')}.
                    </span>
                  </div>
                )}
              </div>

              {/* Invoice Date - auto-derives Invoice Month */}
              <div>
                <Lbl req>Invoice Date</Lbl>
                <input type="date" className={F} value={form.inv_date}
                  onChange={e => {
                    const d = e.target.value;
                    const autoMonth = d
                      ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                          .toUpperCase().replace(' ', '-')
                      : '';
                    setForm(f => ({ ...f, inv_date: d, inv_month: autoMonth || f.inv_month }));
                  }}
                  required />
              </div>

              {/* Invoice Month - auto-filled from date, editable */}
              <div>
                <Lbl>Invoice Month</Lbl>
                <input className={F} placeholder="e.g. APRIL-2026"
                  value={form.inv_month} onChange={e => set('inv_month', e.target.value)} />
              </div>

              {/* Received Date */}
              <div>
                <Lbl>Received Date</Lbl>
                <input type="date" className={F} value={form.received_date} onChange={e => set('received_date', e.target.value)} />
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 2: Invoice Materials (Line Items) ── */}
          <SectionCard
            icon={Package}
            title="Invoice Materials"
            subtitle={`${items.filter(it => it.item_name?.trim()).length} line item${items.filter(it => it.item_name?.trim()).length === 1 ? '' : 's'}`}
            right={
              <div className="flex items-center gap-2">
                <select
                  className={`text-xs h-9 rounded-md px-2 text-slate-900 outline-none transition-colors border ${FIELD_HL}`}
                  value={form.tax_mode} onChange={e => set('tax_mode', e.target.value)}
                >
                  <option value="intrastate">Intrastate (CGST + SGST)</option>
                  <option value="interstate">Interstate (IGST)</option>
                </select>
                <button type="button" onClick={addItem}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-blue-50 hover:bg-blue-100 text-xs text-blue-700 font-semibold transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>
            }
          >
            {/* GST quick-select */}
            {(() => {
              const isIGST = form.tax_mode === 'interstate';
              const activePct = items.length > 0 && items.every(it => it.gst_pct === items[0].gst_pct)
                ? items[0].gst_pct : null;
              return (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="text-xs text-slate-500 self-center">Quick GST:</span>
                  {[0, 5, 12, 18, 28].map(pct => {
                    const active = !isIGST && activePct === String(pct);
                    return (
                      <button key={pct} type="button" onClick={() => applyGST(pct)}
                        className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-slate-200 hover:bg-blue-50 hover:border-blue-300 text-slate-600'
                        }`}>
                        {pct}%
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => applyGST(18, true)}
                    className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                      isIGST
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'border-amber-200 hover:bg-amber-50 text-amber-700'
                    }`}>
                    IGST 18%
                  </button>
                </div>
              );
            })()}

            {/* Items — one clearly-labeled card per line item (no cramped horizontal-scroll table) */}
            <div className="space-y-3">
              {items.map((it, i) => {
                const { basic, discount, gst, total } = calcItemRow(it, form.tax_mode);
                const rem = it.remaining_qty;
                const entered = parseFloat(it.quantity || 0);
                const exceeded = rem !== null && rem !== undefined && entered > rem + 0.0001;
                return (
                  <div key={i} className="border border-slate-200 rounded-xl bg-white p-3.5 space-y-3">
                    {/* Row 1 — item search + category badge + remove */}
                    <div className="flex items-start gap-2.5">
                      <div className="flex-1 min-w-0">
                        <Lbl>Item / Material</Lbl>
                        <MaterialCombobox
                          value={it.item_name}
                          inventoryItems={inventoryItems}
                          placeholder="Search or type item / material name"
                          onChange={(materialName) => handleItemName(i, materialName)}
                        />
                      </div>
                      <div className="shrink-0 pt-[22px]">
                        <div className={`px-2.5 h-10 flex items-center text-xs rounded-lg border font-medium whitespace-nowrap ${it.category ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-400 italic'}`}>
                          {it.category || 'Auto'}
                        </div>
                      </div>
                      <button type="button" onClick={() => removeItem(i)}
                        className="shrink-0 mt-[22px] w-10 h-10 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Row 2 — BOQ link + cost head */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div>
                        <Lbl>BOQ Item</Lbl>
                        <select
                          className={`w-full h-10 rounded-lg px-2.5 text-xs bg-white outline-none transition-all border ${FIELD_HL}`}
                          value={it.boq_item_id || ''}
                          onChange={e => updateItem(i, 'boq_item_id', e.target.value)}
                        >
                          <option value="">No BOQ item</option>
                          {boqItems.map(b => (
                            <option key={b.id} value={b.id}>{b.item_no ? `${b.item_no} — ` : ''}{b.description}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Lbl>Cost Sub-heading</Lbl>
                        <select
                          className={`w-full h-10 rounded-lg px-2.5 text-xs bg-white outline-none transition-all border ${FIELD_HL}`}
                          value={it.cost_head || ''}
                          onChange={e => updateItem(i, 'cost_head', e.target.value)}
                        >
                          <option value="">Unallocated</option>
                          {BOQ_COST_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Row 3 — qty/rate/gst inputs */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
                      <div>
                        <Lbl>Unit</Lbl>
                        <input className={`w-full h-10 rounded-lg px-2.5 text-xs outline-none transition-all border ${FIELD_HL}`}
                          placeholder="Nos"
                          value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)} />
                      </div>
                      <div>
                        <Lbl>Qty</Lbl>
                        <input
                          type="number" step="0.001"
                          max={rem !== null && rem !== undefined ? rem : undefined}
                          className={clsx('w-full h-10 rounded-lg px-2.5 text-xs text-right outline-none transition-all border',
                            exceeded
                              ? 'border-red-400 bg-red-50 text-red-700 shadow-[0_0_0_3px_rgba(248,113,113,0.15)] focus:border-red-500'
                              : FIELD_HL
                          )}
                          placeholder="0"
                          value={it.quantity}
                          onChange={e => updateItem(i, 'quantity', e.target.value)}
                        />
                        {rem !== null && rem !== undefined && (
                          <span className={`block text-[10px] mt-0.5 leading-tight ${exceeded ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                            {exceeded ? `Warning max ${rem}` : `Avail: ${rem}`}
                          </span>
                        )}
                      </div>
                      <div>
                        <Lbl>Rate (Rs )</Lbl>
                        <input type="number" step="0.01" className={`w-full h-10 rounded-lg px-2.5 text-xs text-right outline-none transition-all border ${FIELD_HL}`}
                          placeholder="0.00"
                          value={it.rate} onChange={e => updateItem(i, 'rate', e.target.value)} />
                      </div>
                      <div>
                        <Lbl>Discount (Rs )</Lbl>
                        <input type="number" step="0.01" className={`w-full h-10 rounded-lg px-2.5 text-xs text-right outline-none transition-all border ${FIELD_HL}`}
                          placeholder="0.00"
                          value={discount > 0 && !it.discount_amount ? discount.toFixed(2) : it.discount_amount}
                          onChange={e => updateItem(i, 'discount_amount', e.target.value)} />
                      </div>
                      <div>
                        <Lbl>GST %</Lbl>
                        <input type="number" step="0.5" className={`w-full h-10 rounded-lg px-2.5 text-xs text-center outline-none transition-all border ${FIELD_HL}`}
                          placeholder="18"
                          value={it.gst_pct} onChange={e => updateItem(i, 'gst_pct', e.target.value)} />
                      </div>
                    </div>

                    {/* Row 4 — computed totals for this line */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-500">Basic: <b className="text-slate-700">{basic !== 0 ? `Rs ${inr(basic)}` : '—'}</b></span>
                      <span className="text-slate-500">GST: <b className="text-slate-700">{gst !== 0 ? `Rs ${inr(gst)}` : '—'}</b></span>
                      <span className="ml-auto text-slate-500">Line Total: <b className="text-sm text-slate-800">{total !== 0 ? `Rs ${inr(total)}` : '—'}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>

            {itemsBasic > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-xs">
                <span className="font-semibold text-slate-600">Items Total:</span>
                {itemsDiscount > 0 && <span className="text-rose-500">Discount: <b>Rs {inr(itemsDiscount)}</b></span>}
                <span className="text-slate-600">Basic: <b>Rs {inr(itemsBasic)}</b></span>
                <span className="text-slate-400">GST: Rs {inr(itemsGST)}</span>
                <span className="ml-auto font-semibold text-slate-700">Grand Total: Rs {inr(itemsBasic + itemsGST)}</span>
              </div>
            )}

            {/* Manual basic amount - only when no items */}
            {itemsBasic === 0 && (
              <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500 mb-2">No line items - enter invoice amount manually:</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Lbl req>Basic Amount (Rs )</Lbl>
                    <input type="number" step="0.01" className={F} placeholder="0.00"
                      value={form.basic_amount} onChange={e => set('basic_amount', e.target.value)} />
                  </div>
                  {taxMode === 'intrastate' ? (<>
                    <div>
                      <Lbl>CGST %</Lbl>
                      <input type="number" step="0.5" className={F} placeholder="9"
                        value={form.cgst_pct} onChange={e => set('cgst_pct', e.target.value)} />
                    </div>
                    <div>
                      <Lbl>SGST %</Lbl>
                      <input type="number" step="0.5" className={F} placeholder="9"
                        value={form.sgst_pct} onChange={e => set('sgst_pct', e.target.value)} />
                    </div>
                  </>) : (
                    <div>
                      <Lbl>IGST %</Lbl>
                      <input type="number" step="0.5" className={F} placeholder="18"
                        value={form.igst_pct} onChange={e => set('igst_pct', e.target.value)} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          {/* ── SECTION 3: Additional Charges ── */}
          <SectionCard icon={Truck} title="Additional Charges" subtitle="Transport, packing/insurance and TCS">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Lbl>Transport Description</Lbl>
                <input className={F} placeholder="e.g. Freight, Delivery..."
                  value={form.transport_desc} onChange={e => set('transport_desc', e.target.value)} />
              </div>
              <div>
                <Lbl>Transport Amount (Rs )</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.00"
                  value={form.transport_charges} onChange={e => set('transport_charges', e.target.value)} />
              </div>
              <div>
                <Lbl>Transport GST %</Lbl>
                <input type="number" step="0.5" className={F} placeholder="18"
                  value={form.transport_gst_pct} onChange={e => set('transport_gst_pct', e.target.value)} />
              </div>
              <div>
                <Lbl>Transport GST Amt</Lbl>
                <input type="number" className={F + ' bg-slate-100 text-slate-500'} readOnly
                  value={transportGST > 0 ? transportGST.toFixed(2) : ''} placeholder="Auto" />
              </div>
              <div>
                <Lbl>Other Charges Description</Lbl>
                <input className={F} placeholder="e.g. Packing, Insurance..."
                  value={form.other_charges_desc} onChange={e => set('other_charges_desc', e.target.value)} />
              </div>
              <div>
                <Lbl>Other Charges (Rs )</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.00"
                  value={form.other_charges} onChange={e => set('other_charges', e.target.value)} />
              </div>
              <div>
                <Lbl>TCS %</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.1"
                  value={form.tcs_pct} onChange={e => set('tcs_pct', e.target.value)} />
              </div>
              <div>
                <Lbl>TCS Amount</Lbl>
                <input type="number" className={F + ' bg-slate-100 text-slate-500'} readOnly
                  value={tcsAmt > 0 ? tcsAmt.toFixed(2) : ''} placeholder="Auto" />
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 4: Credit Note ── */}
          <SectionCard icon={Receipt} title="Credit Note" badge={<span className="text-[10px] font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">Optional</span>}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Lbl>Credit Note Number</Lbl>
                <input className={F} placeholder="CN-001"
                  value={form.credit_note_num} onChange={e => set('credit_note_num', e.target.value)} />
              </div>
              <div>
                <Lbl>Credit Note Value (Rs )</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.00"
                  value={form.credit_note_val} onChange={e => set('credit_note_val', e.target.value)} />
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 5: Invoice Totals (read-only) ── */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-white border border-blue-200 flex items-center justify-center flex-shrink-0">
                <IndianRupee className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-[13.5px] font-semibold text-blue-900">Invoice Totals (Live)</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-0.5">Basic Amount</p>
                <p className="font-medium text-slate-800">Rs {inr(effectBasic)}</p>
              </div>
              {taxMode === 'intrastate' ? (<>
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-0.5">CGST</p>
                  <p className="font-medium text-slate-700">Rs {inr(totalGST / 2)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-0.5">SGST</p>
                  <p className="font-medium text-slate-700">Rs {inr(totalGST / 2)}</p>
                </div>
              </>) : (
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-0.5">IGST</p>
                  <p className="font-medium text-slate-700">Rs {inr(totalGST)}</p>
                </div>
              )}
              {(transportAmt > 0 || otherAmt > 0) && (
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-0.5">Extra Charges</p>
                  <p className="font-medium text-slate-700">Rs {inr(transportAmt + transportGST + otherAmt)}</p>
                </div>
              )}
              {tcsAmt > 0 && (
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-0.5">TCS ({form.tcs_pct}%)</p>
                  <p className="font-medium text-slate-700">Rs {inr(tcsAmt)}</p>
                </div>
              )}
            </div>
            <div className="border-t border-blue-200 pt-3 text-right">
              <span className="text-sm text-slate-900 mr-3">Total Invoice Amount:</span>
              <span className="text-xl font-medium text-blue-700">Rs {inr(grandTotal)}</span>
            </div>
          </div>

          {/* ── SECTION 6: Remarks ── */}
          <SectionCard icon={StickyNote} title="Remarks">
            <Lbl>Remarks / Notes</Lbl>
            <textarea rows={2} className={F + ' resize-none'}
              placeholder="Any initial remarks..."
              value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </SectionCard>

        </div>{/* /max-w-5xl */}
      </div>{/* /scrollable body */}

      {/* ── Sticky footer ── */}
      <div style={{ flexShrink: 0, background: '#ffffff', borderTop: '1px solid #e2e8f0' }}
        className="px-6 py-4 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        <div className="w-full max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          {/* Grand total preview */}
          <div className="flex items-center gap-6">
            <div className="text-[11px] text-slate-500 font-medium">
              Basic: <span className="font-medium text-slate-700 text-sm ml-1">
                ₹{inr(effectBasic)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              GST: <span className="font-medium text-slate-700 text-sm ml-1">
                ₹{inr(totalGST)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Grand Total: <span className="font-medium text-blue-700 text-lg ml-1">
                ₹{inr(grandTotal)}
              </span>
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 h-9 rounded-md border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit}
              disabled={mutation.isPending || poWarning?.type === 'closed'}
              title={poWarning?.type === 'closed' ? `PO ${poWarning.po_number} is fully billed — cannot create bill` : undefined}
              className={clsx('inline-flex items-center gap-2 px-5 h-9 rounded-md text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
                poWarning?.type === 'closed' ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700')}>
              {mutation.isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                : poWarning?.type === 'closed'
                  ? <><span>🔒</span> PO Closed — Cannot Bill</>
                  : <><FileText className="w-4 h-4" /> Create Bill</>}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

const ALL_COLUMNS = [
  { key: 'sl_number',       label: 'SL No',       align: 'left',  w: 'w-[86px]',  default: true  },
  { key: 'bill_type',       label: 'Type',         align: 'left',  w: 'w-[64px]',  default: true  },
  { key: 'vendor_name',     label: 'Vendor',       align: 'left',  w: 'w-[260px]', default: true  },
  { key: 'project_name',    label: 'Project',      align: 'left',  w: 'w-[220px]', default: false },
  { key: 'inv_number',      label: 'Invoice #',    align: 'left',  w: 'w-[170px]', default: true  },
  { key: 'inv_date',        label: 'Date',         align: 'left',  w: 'w-[110px]', default: true  },
  { key: 'po_number',       label: 'PO/WO',        align: 'left',  w: 'w-[130px]', default: true  },
  { key: 'total_amount',    label: 'Total',        align: 'right', w: 'w-[150px]', default: true  },
  { key: 'basic_amount',    label: 'Basic (excl. GST)', align: 'right', w: 'w-[150px]', default: false },
  { key: 'pc_number',       label: 'PC #',         align: 'left',  w: 'w-[150px]', default: false },
  { key: 'certified_net',   label: 'Cert',         align: 'right', w: 'w-[130px]', default: false },
  { key: 'tds_deduction',   label: 'TDS',          align: 'right', w: 'w-[130px]', default: true  },
  { key: 'balance_to_pay',  label: 'Balance',      align: 'right', w: 'w-[150px]', default: true  },
  { key: 'paid_amount',     label: 'Paid',         align: 'right', w: 'w-[150px]', default: true  },
  { key: 'payment_date',    label: 'Paid Date',    align: 'left',  w: 'w-[122px]', default: true  },
  { key: 'workflow_status', label: 'Status',       align: 'left',  w: 'w-[120px]', default: true  },
];

const trailingNum = (s) => { const m = String(s || '').match(/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

function sortRows(rows, col, dir) {
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    let av = a[col], bv = b[col];
    // SL number - extract trailing integer for proper 1,2,3...10,11 order
    if (col === 'sl_number') {
      av = trailingNum(av); bv = trailingNum(bv);
      return dir === 'asc' ? av - bv : bv - av;
    }
    // numeric columns
    if (col === 'balance_to_pay') {
      av = billBalanceDue(a); bv = billBalanceDue(b);
      return dir === 'asc' ? av - bv : bv - av;
    }
    if (['basic_amount','gst_amount','total_amount','certified_net','paid_amount','tds_deduction'].includes(col)) {
      av = parseFloat(av) || 0; bv = parseFloat(bv) || 0;
      return dir === 'asc' ? av - bv : bv - av;
    }
    // date
    if (col === 'inv_date') {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
      return dir === 'asc' ? av - bv : bv - av;
    }
    // string
    av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase();
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// ── Untagged Items Modal — bulk-tag line items with no cost head ──────────
function UntaggedItemsModal({ projectId, onClose }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState({}); // description -> boolean
  const [costHeads, setCostHeads] = useState({}); // description -> cost_head

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['tqs-untagged-items', projectId],
    queryFn: () => tqsBillsAPI.untaggedItems({ project_id: projectId || undefined }).then(r => r.data?.data ?? []),
  });

  const applyMut = useMutation({
    mutationFn: ({ line_item_ids, cost_head }) => tqsBillsAPI.bulkTagCostHead({ line_item_ids, cost_head }),
    onError: e => toast.error(e?.response?.data?.error || 'Failed to tag items'),
  });

  const handleApplyAll = async () => {
    const toApply = groups.filter(g => selected[g.description] && costHeads[g.description]);
    if (!toApply.length) { toast.error('Select at least one group and a cost head'); return; }
    let tagged = 0;
    for (const g of toApply) {
      const res = await applyMut.mutateAsync({ line_item_ids: g.line_item_ids, cost_head: costHeads[g.description] });
      tagged += res.data?.data?.tagged ?? 0;
    }
    toast.success(`Tagged ${tagged} line item${tagged === 1 ? '' : 's'}`);
    qc.invalidateQueries({ queryKey: ['tqs-untagged-items'] });
    qc.invalidateQueries({ queryKey: ['tqs-bills'] });
    setSelected({});
    setCostHeads({});
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Package className="w-4 h-4 text-indigo-600" /> Untagged Line Items</h3>
            <p className="text-xs text-slate-500 mt-0.5">Line items with no BOQ cost head, grouped by description — pick a cost head and tag them all in one go.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading untagged items…</div>
          ) : groups.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">Every line item already has a cost head tagged. Nothing to do here.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="py-1.5 pr-2 w-8"></th>
                  <th className="py-1.5 pr-2">Description</th>
                  <th className="py-1.5 pr-2">Bills</th>
                  <th className="py-1.5 pr-2 text-right">Total (excl. GST)</th>
                  <th className="py-1.5 pr-2">Cost Head</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.description} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-1.5 pr-2">
                      <input type="checkbox" checked={!!selected[g.description]}
                        onChange={e => setSelected(prev => ({ ...prev, [g.description]: e.target.checked }))} />
                    </td>
                    <td className="py-1.5 pr-2 text-slate-800">{g.description}<span className="text-slate-400 ml-1">({g.item_count})</span></td>
                    <td className="py-1.5 pr-2 text-xs text-slate-500 font-mono">{(g.bill_numbers || []).join(', ')}</td>
                    <td className="py-1.5 pr-2 text-right font-medium">₹{Number(g.total_basic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-1.5 pr-2">
                      <select className="border border-slate-200 rounded-md px-2 py-1 text-xs outline-none"
                        value={costHeads[g.description] || ''}
                        onChange={e => setCostHeads(prev => ({ ...prev, [g.description]: e.target.value }))}>
                        <option value="">— select —</option>
                        {BOQ_COST_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Close</button>
          <button
            onClick={handleApplyAll}
            disabled={applyMut.isPending || groups.length === 0}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
          >
            {applyMut.isPending ? 'Applying…' : 'Apply Tags'}
          </button>
        </div>
      </div>
    </div>
  );
}

// â"€â"€ Import Bills Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ImportBillsModal({ projects, defaultProjectId, onClose, onDone }) {
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = React.useRef();

  const downloadTemplate = async () => {
    try {
      const res = await tqsBillsAPI.downloadTemplate();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'DQS_Bills_Import_Template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Template download failed'); }
  };

  const handleImport = async () => {
    if (!projectId) return toast.error('Select a project first');
    if (!file) return toast.error('Select an Excel file');
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('project_id', projectId);
      const res = await tqsBillsAPI.bulkImport(fd);
      setResult(res.data);
      if (res.data.created > 0) toast.success(`${res.data.created} bill${res.data.created > 1 ? 's' : ''} imported`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Import failed');
    } finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-blue-600 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-white" />
            <h2 className="text-base font-medium text-white uppercase italic tracking-tight">Import Bills from Excel</h2>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1 - Template */}
          <div className="flex items-start gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium flex-shrink-0">1</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">Download the template</p>
              <p className="text-xs text-slate-900 font-medium mt-0.5">Fill it with your bills data and save as .xlsx</p>
              <button onClick={downloadTemplate}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-50 transition-all">
                <Download className="w-3.5 h-3.5" /> Download Template
              </button>
            </div>
          </div>

          {/* Step 2 - Project */}
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-900 flex items-center justify-center text-sm font-medium flex-shrink-0">2</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 font-medium mb-1.5">Select project</p>
              <SearchableSelect
                value={projectId}
                onChange={v => setProjectId(v)}
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                placeholder="Select project…"
                searchPlaceholder="Search projects…"
              />
            </div>
          </div>

          {/* Step 3 - Upload */}
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-900 flex items-center justify-center text-sm font-medium flex-shrink-0">3</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 font-medium mb-1.5">Upload filled Excel file</p>
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${file ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}>
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-blue-700">
                    <FileText className="w-5 h-5" />
                    <span className="text-sm font-semibold">{file.name}</span>
                    <span className="text-xs text-slate-400">({(file.size/1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 mx-auto mb-1 text-slate-400" />
                    <p className="text-sm text-slate-900 font-medium font-medium">Click to select .xlsx file</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { setFile(e.target.files[0] || null); setResult(null); }} />
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`rounded-xl p-4 border text-sm ${result.errors?.length ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className="flex items-center gap-2 font-medium mb-2 text-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Import Complete
              </div>
              <div className="flex gap-4 text-xs mb-2">
                <span className="text-emerald-700 font-bold">✓ {result.created} created</span>
                <span className="text-amber-700 font-bold">skipped {result.skipped} skipped (duplicates)</span>
                <span className="text-red-600 font-bold">x {result.errors?.length || 0} errors</span>
              </div>
              {result.errors?.length > 0 && (
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i} className="text-xs text-red-600">Row {e.row}: {e.reason}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button onClick={result?.created > 0 ? onDone : onClose}
            className="px-4 py-2 text-sm text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50">
            {result?.created > 0 ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button onClick={handleImport} disabled={importing || !file || !projectId}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2">
              {importing ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Importing...</> : <><Upload className="w-4 h-4" />Import Bills</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// â"€â"€ Edit Bill Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// ── Line item editor row (used inside EditBillModal) ────────────────────────
function LineItemEditRow({ billId, item, boqItems }) {
  const qc = useQueryClient();
  const [row, setRow] = useState({
    item_name:  item.item_name  || '',
    unit:       item.unit       || '',
    quantity:   String(item.quantity ?? ''),
    rate:       String(item.rate ?? ''),
    gst_pct:    String(item.gst_pct ?? ''),
    gst_mode:   item.gst_mode   || 'intrastate',
    cost_head:  item.cost_head  || '',
    boq_item_id:item.boq_item_id|| '',
  });
  const [dirty, setDirty] = useState(false);
  const set = (k, v) => { setRow(p => ({ ...p, [k]: v })); setDirty(true); };

  const qty = parseFloat(row.quantity) || 0;
  const rt  = parseFloat(row.rate) || 0;
  const basic = qty * rt;
  const gstAmt = basic * (parseFloat(row.gst_pct) || 0) / 100;
  const total = basic + gstAmt;

  const saveMut = useMutation({
    mutationFn: () => tqsBillsAPI.updateLineItem(billId, item.id, row),
    onSuccess: () => {
      toast.success('Line item updated');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['tqs-bill-detail', billId] });
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed to update line item'),
  });

  return (
    <tr className="border-t border-slate-100">
      <td className="px-2 py-1.5 min-w-[160px]">
        <input className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
          value={row.item_name} onChange={e => set('item_name', e.target.value)} />
        <div className="flex gap-1 mt-1">
          <select className="flex-1 min-w-0 border border-slate-200 rounded px-1 py-0.5 text-[10px] bg-white"
            value={row.boq_item_id} onChange={e => set('boq_item_id', e.target.value)} title="Link to BOQ item">
            <option value="">No BOQ item</option>
            {boqItems.map(b => (
              <option key={b.id} value={b.id}>{b.item_no ? `${b.item_no} — ` : ''}{b.description}</option>
            ))}
          </select>
          <select className="flex-1 min-w-0 border border-slate-200 rounded px-1 py-0.5 text-[10px] bg-white"
            value={row.cost_head} onChange={e => set('cost_head', e.target.value)} title="Cost sub-heading">
            <option value="">Unallocated</option>
            {BOQ_COST_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </td>
      <td className="px-2 py-1.5 w-20">
        <input className="w-full border border-slate-200 rounded px-2 py-1 text-xs" placeholder="Nos"
          value={row.unit} onChange={e => set('unit', e.target.value)} />
      </td>
      <td className="px-2 py-1.5 w-20">
        <input type="number" step="0.01" className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-right"
          value={row.quantity} onChange={e => set('quantity', e.target.value)} />
      </td>
      <td className="px-2 py-1.5 w-24">
        <input type="number" step="0.01" className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-right"
          value={row.rate} onChange={e => set('rate', e.target.value)} />
      </td>
      <td className="px-2 py-1.5 w-24">
        <input type="number" step="0.5" className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-right"
          value={row.gst_pct} onChange={e => set('gst_pct', e.target.value)} />
        <select className="w-full mt-1 border border-slate-200 rounded px-1 py-0.5 text-[10px] bg-white"
          value={row.gst_mode} onChange={e => set('gst_mode', e.target.value)} title="CGST+SGST or IGST for this line">
          <option value="intrastate">CGST+SGST</option>
          <option value="interstate">IGST</option>
        </select>
      </td>
      <td className="px-2 py-1.5 w-24 text-right text-xs text-slate-600">{inr(basic)}</td>
      <td className="px-2 py-1.5 w-28 text-right text-xs font-semibold text-slate-800">{inr(total)}</td>
      <td className="px-2 py-1.5 w-16 text-center">
        <button type="button" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}
          className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
            dirty ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400'
          } disabled:opacity-60`}>
          {saveMut.isPending ? '…' : 'Save'}
        </button>
      </td>
    </tr>
  );
}

// ── Line items section: fetches full bill detail (list rows don't include
// items) and renders each line editable, so the Edit Bill modal shows the
// same material/cost-head/BOQ detail as the Create form. ────────────────────
function BillLineItemsSection({ billId, projectId }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['tqs-bill-detail', billId],
    queryFn: () => tqsBillsAPI.get(billId).then(r => r.data?.data ?? r.data),
    enabled: !!billId,
  });
  const { data: boqItems = [] } = useQuery({
    queryKey: ['tqs-boq-items', projectId],
    queryFn: () => boqAPI.summary(projectId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const items = detail?.line_items || [];

  return (
    <div className={Z_CARD}>
      <h3 className={Z_HEAD}>
        Line Items {items.length > 0 && <span className="text-slate-400 normal-case font-normal">({items.length})</span>}
      </h3>
      <div className="p-4">
        {isLoading ? (
          <div className="text-xs text-slate-400 italic py-4 text-center">Loading line items…</div>
        ) : items.length === 0 ? (
          <div className="text-xs text-slate-400 italic py-4 text-center bg-slate-50 rounded-lg border border-slate-100">
            No material line items on this bill — header amounts only.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-2 py-2 text-left text-slate-500 font-medium">Item / BOQ / Cost Head</th>
                  <th className="px-2 py-2 text-left text-slate-500 font-medium">Unit</th>
                  <th className="px-2 py-2 text-right text-slate-500 font-medium">Qty</th>
                  <th className="px-2 py-2 text-right text-slate-500 font-medium">Rate</th>
                  <th className="px-2 py-2 text-right text-slate-500 font-medium">GST% / Mode</th>
                  <th className="px-2 py-2 text-right text-slate-500 font-medium">Basic</th>
                  <th className="px-2 py-2 text-right text-slate-500 font-medium">Total</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => <LineItemEditRow key={it.id} billId={billId} item={it} boqItems={boqItems} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EditBillModal({ bill, projects, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    vendor_name:      bill.vendor_name       || '',
    vendor_id:        bill.vendor_id         || '',
    project_id:       bill.project_id        || '',
    po_number:        bill.po_number         || '',
    po_date:          bill.po_date           ? bill.po_date.slice(0, 10) : '',
    inv_number:       bill.inv_number        || '',
    inv_date:         bill.inv_date          ? bill.inv_date.slice(0, 10) : '',
    inv_month:        bill.inv_month         || '',
    received_date:    bill.received_date     ? bill.received_date.slice(0, 10) : '',
    bill_type:        bill.bill_type         || 'po',
    work_desc:        bill.work_desc         || '',
    equipment_type:   bill.equipment_type    || '',
    hire_period_from: bill.hire_period_from  ? bill.hire_period_from.slice(0, 10) : '',
    hire_period_to:   bill.hire_period_to    ? bill.hire_period_to.slice(0, 10) : '',
    tax_mode:         bill.tax_mode          || 'intrastate',
    basic_amount:     bill.basic_amount      || '',
    cgst_pct:         bill.cgst_pct          || '9',
    sgst_pct:         bill.sgst_pct          || '9',
    igst_pct:         bill.igst_pct          || '0',
    transport_charges:bill.transport_charges || '',
    transport_gst_pct:bill.transport_gst_pct || '',
    other_charges:    bill.other_charges     || '',
    credit_note_num:  bill.credit_note_num   || '',
    credit_note_val:  bill.credit_note_val   || '',
    tcs_pct:          bill.tcs_pct           || '',
    remarks:          bill.remarks           || '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // â"€â"€ Line items (shares the cache key BillLineItemsSection populates) â"€â"€â"€â"€
  // Bills with line items can have a DIFFERENT GST% per line (e.g. one line at
  // 5%, another at 18%) — a single header CGST/SGST% can't represent that.
  // When line items exist, the header GST is derived by summing each line's
  // own basic/GST amounts instead of applying one flat rate.
  const { data: billDetail } = useQuery({
    queryKey: ['tqs-bill-detail', bill.id],
    queryFn: () => tqsBillsAPI.get(bill.id).then(r => r.data?.data ?? r.data),
    enabled: !!bill.id,
  });
  const lineItems = billDetail?.line_items || [];
  const hasLineItems = lineItems.length > 0;
  const distinctGstRates = [...new Set(lineItems.map(it => parseFloat(it.gst_pct) || 0))];
  const itemsBasic = lineItems.reduce((s, it) => s + (parseFloat(it.basic_amount) || 0), 0);
  const itemsCgst  = lineItems.reduce((s, it) => s + (parseFloat(it.cgst_amt) || 0), 0);
  const itemsSgst  = lineItems.reduce((s, it) => s + (parseFloat(it.sgst_amt) || 0), 0);
  const itemsIgst  = lineItems.reduce((s, it) => s + (parseFloat(it.igst_amt) || 0), 0);
  const itemsGst   = itemsCgst + itemsSgst + itemsIgst;

  // â"€â"€ Live calculations â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const taxMode      = form.tax_mode;
  const basicAmt     = hasLineItems ? itemsBasic : (parseFloat(form.basic_amount) || 0);
  const cgstAmt      = hasLineItems ? itemsCgst : (taxMode === 'intrastate' ? basicAmt * (parseFloat(form.cgst_pct) || 0) / 100 : 0);
  const sgstAmt      = hasLineItems ? itemsSgst : (taxMode === 'intrastate' ? basicAmt * (parseFloat(form.sgst_pct) || 0) / 100 : 0);
  const igstAmt      = hasLineItems ? itemsIgst : (taxMode === 'interstate' ? basicAmt * (parseFloat(form.igst_pct) || 0) / 100 : 0);
  const totalGST     = hasLineItems ? itemsGst : (cgstAmt + sgstAmt + igstAmt);
  const transportAmt = parseFloat(form.transport_charges)  || 0;
  const transportGST = transportAmt * (parseFloat(form.transport_gst_pct) || 0) / 100;
  const otherAmt     = parseFloat(form.other_charges)      || 0;
  const creditVal    = parseFloat(form.credit_note_val)    || 0;
  const preTcsTotal  = basicAmt + totalGST + transportAmt + transportGST + otherAmt - creditVal;
  // TCS is charged on the basic (ex-GST) amount only, not the full invoice value
  const tcsAmt       = basicAmt * (parseFloat(form.tcs_pct) || 0) / 100;
  const grandTotal   = preTcsTotal + tcsAmt;

  // Quick GST buttons
  const applyGST = (pct, isIGST = false) => {
    if (isIGST) {
      setForm(f => ({ ...f, tax_mode: 'interstate', cgst_pct: '0', sgst_pct: '0', igst_pct: String(pct) }));
    } else {
      const half = (pct / 2).toFixed(1);
      setForm(f => ({ ...f, tax_mode: 'intrastate', cgst_pct: half, sgst_pct: half, igst_pct: '0' }));
    }
  };

  const updateMut = useMutation({
    mutationFn: (data) => tqsBillsAPI.update(bill.id, data),
    onSuccess: () => {
      toast.success('Bill updated');
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Update failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vendor_name?.trim()) return toast.error('Vendor is required');
    if (!form.inv_number?.trim())  return toast.error('Invoice number is required');
    if (!form.inv_date)            return toast.error('Invoice date is required');
    if (form.bill_type === 'hire') {
      if (!form.equipment_type?.trim()) return toast.error('Equipment / Plant description is required');
      if (!form.hire_period_from) return toast.error('Hire period start date is required');
      if (!form.hire_period_to) return toast.error('Hire period end date is required');
    }

    // When line items exist, each line already has its own GST% and was saved
    // via its own Save button — the header just needs the summed totals for
    // reporting (blended % is informational only, not used to recompute tax).
    const blendedCgstPct = hasLineItems ? (basicAmt > 0 ? (cgstAmt / basicAmt) * 100 : 0) : (taxMode === 'intrastate' ? parseFloat(form.cgst_pct) || 0 : 0);
    const blendedSgstPct = hasLineItems ? (basicAmt > 0 ? (sgstAmt / basicAmt) * 100 : 0) : (taxMode === 'intrastate' ? parseFloat(form.sgst_pct) || 0 : 0);
    const blendedIgstPct = hasLineItems ? (basicAmt > 0 ? (igstAmt / basicAmt) * 100 : 0) : (taxMode === 'interstate' ? parseFloat(form.igst_pct) || 0 : 0);

    updateMut.mutate({
      ...form,
      basic_amount:      basicAmt.toFixed(2),
      cgst_pct:          Number(blendedCgstPct.toFixed(2)),
      cgst_amt:          cgstAmt.toFixed(2),
      sgst_pct:          Number(blendedSgstPct.toFixed(2)),
      sgst_amt:          sgstAmt.toFixed(2),
      igst_pct:          Number(blendedIgstPct.toFixed(2)),
      igst_amt:          igstAmt.toFixed(2),
      gst_amount:        totalGST.toFixed(2),
      transport_charges: transportAmt.toFixed(2),
      transport_gst_pct: parseFloat(form.transport_gst_pct) || 0,
      transport_gst_amt: transportGST.toFixed(2),
      other_charges:     otherAmt.toFixed(2),
      credit_note_val:   creditVal.toFixed(2),
      tcs_pct:           parseFloat(form.tcs_pct) || 0,
      tcs_amt:           tcsAmt.toFixed(2),
      total_amount:      grandTotal.toFixed(2),
    });
  };

  const inrFmt = inr;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>

      {/* ── Breadcrumb header (matches New Bill) ── */}
      <div className="flex items-center justify-between px-6 py-3.5 flex-shrink-0 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">
            Bill Tracker <span className="text-slate-300">›</span> Bills <span className="text-slate-300">›</span>{' '}
            <b className="text-slate-700">Edit Bill — SL #{bill.sl_number}</b>
          </div>
          <span className="text-xs text-slate-400">{(bill.vendor_name || '').toUpperCase()} · {bill.inv_number}</span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto bg-slate-50">
        <div className="w-full max-w-[1600px] mx-auto px-6 py-6 space-y-5">

          {/* ── SECTION 1: Bill Info ── */}
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}>Bill Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
              <div>
                <Lbl req>Vendor Name</Lbl>
                <input className={F} value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} />
              </div>
              <div>
                <Lbl req>Invoice Number</Lbl>
                <input className={F} value={form.inv_number} onChange={e => set('inv_number', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
              </div>
              <div>
                <Lbl req>Invoice Date</Lbl>
                <input type="date" className={F} value={form.inv_date}
                  onChange={e => {
                    const d = e.target.value;
                    const autoMonth = d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase().replace(' ', '-') : '';
                    setForm(f => ({ ...f, inv_date: d, inv_month: autoMonth || f.inv_month }));
                  }} />
              </div>
              <div>
                <Lbl>Invoice Month</Lbl>
                <input className={F} placeholder="e.g. APRIL-2026" value={form.inv_month} onChange={e => set('inv_month', e.target.value)} />
              </div>
              <div>
                <Lbl>PO / WO Number</Lbl>
                <input className={F} value={form.po_number} onChange={e => set('po_number', e.target.value)} />
              </div>
              <div>
                <Lbl>PO / WO Date</Lbl>
                <input type="date" className={F} value={form.po_date} onChange={e => set('po_date', e.target.value)} />
              </div>
              <div>
                <Lbl>Received Date</Lbl>
                <input type="date" className={F} value={form.received_date} onChange={e => set('received_date', e.target.value)} />
              </div>
              <div>
                <Lbl>Bill Type</Lbl>
                <select className={F} value={form.bill_type} onChange={e => set('bill_type', e.target.value)}>
                  <option value="po">Purchase Order (PO)</option>
                  <option value="wo">Work Order (WO)</option>
                  <option value="hire">Hire / Rental</option>
                  <option value="service">Service</option>
                  <option value="advance">Advance</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {projects.length > 0 && (
                <div className="col-span-2">
                  <Lbl>Project</Lbl>
                  <SearchableSelect
                    value={form.project_id}
                    onChange={v => set('project_id', v)}
                    options={projects.map(p => ({ value: p.id, label: p.name }))}
                    placeholder="Select project…"
                    searchPlaceholder="Search projects…"
                  />
                </div>
              )}
              {form.bill_type === 'wo' && (
                <div className="col-span-2">
                  <Lbl>Work Description</Lbl>
                  <input className={F} value={form.work_desc} onChange={e => set('work_desc', e.target.value)} placeholder="Brief description of work done" />
                </div>
              )}
              {form.bill_type === 'hire' && (<>
                <div className="col-span-2 md:col-span-3">
                  <Lbl req>Equipment / Plant Description</Lbl>
                  <input className={F} placeholder="e.g. JCB Excavator, Transit Mixer, Tower Crane"
                    value={form.equipment_type} onChange={e => set('equipment_type', e.target.value)} />
                </div>
                <div>
                  <Lbl req>Hire Period From</Lbl>
                  <input type="date" className={F} value={form.hire_period_from}
                    onChange={e => set('hire_period_from', e.target.value)} />
                </div>
                <div>
                  <Lbl req>Hire Period To</Lbl>
                  <input type="date" className={F} value={form.hire_period_to}
                    onChange={e => set('hire_period_to', e.target.value)} />
                </div>
              </>)}
            </div>
          </div>

          {/* ── SECTION 1B: Line Items ── */}
          <BillLineItemsSection billId={bill.id} projectId={form.project_id} />

          {/* â"€â"€ SECTION 2: GST & Amounts â"€â"€ */}
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}>Invoice Amounts &amp; GST</h3>
            <div className="p-4">
            {hasLineItems ? (
              <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-xs font-medium text-blue-700">
                  Basic Amount and GST are computed automatically from the {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''} above
                  {distinctGstRates.length > 1
                    ? <> — <b>mixed GST rates</b> ({distinctGstRates.sort((a, b) => a - b).map(r => `${r}%`).join(', ')})</>
                    : <> at {distinctGstRates[0] ?? 0}% GST</>}.
                  {' '}Edit a line's GST% in the Line Items section to change it.
                </p>
              </div>
            ) : (<>
              <div className="flex items-center justify-end mb-3">
                <select
                  className={`text-xs h-9 rounded-lg px-2 text-slate-900 outline-none transition-all border ${FIELD_HL}`}
                  value={form.tax_mode} onChange={e => set('tax_mode', e.target.value)}
                >
                  <option value="intrastate">Intrastate (CGST + SGST)</option>
                  <option value="interstate">Interstate (IGST)</option>
                </select>
              </div>

              {/* Quick GST buttons */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className="text-xs text-slate-900 font-medium self-center">Quick GST:</span>
                {[0, 5, 12, 18, 28].map(pct => {
                  const active = taxMode === 'intrastate' &&
                    parseFloat(form.cgst_pct) * 2 === pct;
                  return (
                    <button key={pct} type="button" onClick={() => applyGST(pct)}
                      className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                        active ? 'bg-blue-600 text-white border-blue-600'
                               : 'border-slate-200 hover:bg-blue-50 hover:border-blue-300 text-slate-600'
                      }`}>
                      {pct}%
                    </button>
                  );
                })}
                <button type="button" onClick={() => applyGST(18, true)}
                  className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                    taxMode === 'interstate' ? 'bg-amber-500 text-white border-amber-500'
                                            : 'border-amber-200 hover:bg-amber-50 text-amber-700'
                  }`}>
                  IGST 18%
                </button>
              </div>
            </>)}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Basic Amount */}
              <div>
                <Lbl req>Basic Amount (Rs )</Lbl>
                {hasLineItems ? (
                  <div className={F + ' pl-3 flex items-center bg-slate-50 text-slate-700 font-semibold'}>Rs {inrFmt(basicAmt)}</div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900 font-medium text-sm">Rs </span>
                    <input type="number" step="0.01" className={F + ' pl-7'} placeholder="0.00"
                      value={form.basic_amount} onChange={e => set('basic_amount', e.target.value)} />
                  </div>
                )}
              </div>

              {/* GST — read-only summed totals when line items exist, else manual entry */}
              {hasLineItems ? (<>
                <div>
                  <Lbl>CGST (auto-summed)</Lbl>
                  <div className={F + ' pl-3 flex items-center bg-slate-50 text-blue-700 font-semibold'}>Rs {inrFmt(cgstAmt)}</div>
                </div>
                <div>
                  <Lbl>SGST (auto-summed)</Lbl>
                  <div className={F + ' pl-3 flex items-center bg-slate-50 text-blue-700 font-semibold'}>Rs {inrFmt(sgstAmt)}</div>
                </div>
                {igstAmt > 0 && (
                  <div>
                    <Lbl>IGST (auto-summed)</Lbl>
                    <div className={F + ' pl-3 flex items-center bg-slate-50 text-amber-700 font-semibold'}>Rs {inrFmt(igstAmt)}</div>
                  </div>
                )}
              </>) : taxMode === 'intrastate' ? (<>
                <div>
                  <Lbl>CGST %</Lbl>
                  <input type="number" step="0.5" className={F} placeholder="9"
                    value={form.cgst_pct} onChange={e => set('cgst_pct', e.target.value)} />
                  <p className="text-xs text-blue-600 font-medium mt-1">
                    = Rs {inrFmt(cgstAmt)} <span className="text-slate-900 font-medium font-normal">(auto)</span>
                  </p>
                </div>
                <div>
                  <Lbl>SGST %</Lbl>
                  <input type="number" step="0.5" className={F} placeholder="9"
                    value={form.sgst_pct} onChange={e => set('sgst_pct', e.target.value)} />
                  <p className="text-xs text-blue-600 font-medium mt-1">
                    = Rs {inrFmt(sgstAmt)} <span className="text-slate-900 font-medium font-normal">(auto)</span>
                  </p>
                </div>
              </>) : (
                <div>
                  <Lbl>IGST %</Lbl>
                  <input type="number" step="0.5" className={F} placeholder="18"
                    value={form.igst_pct} onChange={e => set('igst_pct', e.target.value)} />
                  <p className="text-xs text-amber-600 font-medium mt-1">
                    = Rs {inrFmt(igstAmt)} <span className="text-slate-900 font-medium font-normal">(auto)</span>
                  </p>
                </div>
              )}

              {/* Transport */}
              <div>
                <Lbl>Transport Charges (Rs )</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.00"
                  value={form.transport_charges} onChange={e => set('transport_charges', e.target.value)} />
              </div>
              <div>
                <Lbl>Transport GST %</Lbl>
                <input type="number" step="0.5" className={F} placeholder="18"
                  value={form.transport_gst_pct} onChange={e => set('transport_gst_pct', e.target.value)} />
                {transportGST > 0 && (
                  <p className="text-xs text-slate-900 font-medium mt-1">= Rs {inrFmt(transportGST)}</p>
                )}
              </div>

              {/* Other & Credit */}
              <div>
                <Lbl>Other Charges (Rs )</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.00"
                  value={form.other_charges} onChange={e => set('other_charges', e.target.value)} />
              </div>
              <div>
                <Lbl>Credit Note Number</Lbl>
                <input className={F} placeholder="CN-001"
                  value={form.credit_note_num} onChange={e => set('credit_note_num', e.target.value)} />
              </div>
              <div>
                <Lbl>Credit Note Value (Rs )</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.00"
                  value={form.credit_note_val} onChange={e => set('credit_note_val', e.target.value)} />
              </div>
              <div>
                <Lbl>TCS %</Lbl>
                <input type="number" step="0.01" className={F} placeholder="0.1"
                  value={form.tcs_pct} onChange={e => set('tcs_pct', e.target.value)} />
                {tcsAmt > 0 && (
                  <p className="text-xs text-slate-900 font-medium mt-1">= Rs {inrFmt(tcsAmt)}</p>
                )}
              </div>
            </div>
            </div>
          </div>

          {/* â"€â"€ SECTION 3: Live Totals â"€â"€ */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs font-medium text-blue-500 uppercase tracking-widest mb-3">Invoice Totals (Live)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
              <div className="text-center bg-white rounded-lg p-2.5 border border-blue-100">
                <p className="text-xs text-slate-900 font-medium mb-0.5">Basic Amount</p>
                <p className="font-medium text-slate-800">Rs {inrFmt(basicAmt)}</p>
              </div>
              {hasLineItems ? (<>
                <div className="text-center bg-white rounded-lg p-2.5 border border-blue-100">
                  <p className="text-xs text-slate-900 font-medium mb-0.5">CGST (blended)</p>
                  <p className="font-medium text-blue-700">Rs {inrFmt(cgstAmt)}</p>
                </div>
                <div className="text-center bg-white rounded-lg p-2.5 border border-blue-100">
                  <p className="text-xs text-slate-900 font-medium mb-0.5">SGST (blended)</p>
                  <p className="font-medium text-blue-700">Rs {inrFmt(sgstAmt)}</p>
                </div>
                {igstAmt > 0 && (
                  <div className="text-center bg-white rounded-lg p-2.5 border border-amber-100">
                    <p className="text-xs text-slate-900 font-medium mb-0.5">IGST (blended)</p>
                    <p className="font-medium text-amber-700">Rs {inrFmt(igstAmt)}</p>
                  </div>
                )}
              </>) : taxMode === 'intrastate' ? (<>
                <div className="text-center bg-white rounded-lg p-2.5 border border-blue-100">
                  <p className="text-xs text-slate-900 font-medium mb-0.5">CGST ({form.cgst_pct || 0}%)</p>
                  <p className="font-medium text-blue-700">Rs {inrFmt(cgstAmt)}</p>
                </div>
                <div className="text-center bg-white rounded-lg p-2.5 border border-blue-100">
                  <p className="text-xs text-slate-900 font-medium mb-0.5">SGST ({form.sgst_pct || 0}%)</p>
                  <p className="font-medium text-blue-700">Rs {inrFmt(sgstAmt)}</p>
                </div>
              </>) : (
                <div className="text-center bg-white rounded-lg p-2.5 border border-amber-100">
                  <p className="text-xs text-slate-900 font-medium mb-0.5">IGST ({form.igst_pct || 0}%)</p>
                  <p className="font-medium text-amber-700">Rs {inrFmt(igstAmt)}</p>
                </div>
              )}
              <div className="text-center bg-white rounded-lg p-2.5 border border-blue-100">
                <p className="text-xs text-slate-900 font-medium mb-0.5">Total GST</p>
                <p className="font-medium text-slate-700">Rs {inrFmt(totalGST)}</p>
              </div>
            </div>
            {(transportAmt > 0 || otherAmt > 0 || creditVal > 0 || tcsAmt > 0) && (
              <div className="grid grid-cols-4 gap-3 text-sm mb-3">
                {transportAmt > 0 && (
                  <div className="text-center bg-white rounded-lg p-2 border border-slate-100">
                    <p className="text-xs text-slate-900 font-medium mb-0.5">Transport + GST</p>
                    <p className="font-medium text-slate-700">Rs {inrFmt(transportAmt + transportGST)}</p>
                  </div>
                )}
                {otherAmt > 0 && (
                  <div className="text-center bg-white rounded-lg p-2 border border-slate-100">
                    <p className="text-xs text-slate-900 font-medium mb-0.5">Other Charges</p>
                    <p className="font-medium text-slate-700">Rs {inrFmt(otherAmt)}</p>
                  </div>
                )}
                {creditVal > 0 && (
                  <div className="text-center bg-white rounded-lg p-2 border border-red-100">
                    <p className="text-xs text-slate-900 font-medium mb-0.5">Credit Note</p>
                    <p className="font-medium text-red-600">- Rs {inrFmt(creditVal)}</p>
                  </div>
                )}
                {tcsAmt > 0 && (
                  <div className="text-center bg-white rounded-lg p-2 border border-slate-100">
                    <p className="text-xs text-slate-900 font-medium mb-0.5">TCS ({form.tcs_pct}%)</p>
                    <p className="font-medium text-slate-700">Rs {inrFmt(tcsAmt)}</p>
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-blue-200 pt-3 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Total Invoice Amount:</span>
              <span className="text-2xl font-medium text-blue-700">Rs {inrFmt(grandTotal)}</span>
            </div>
          </div>

          {/* â"€â"€ SECTION 4: Remarks â"€â"€ */}
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}>Remarks / Notes</h3>
            <div className="p-4">
              <textarea rows={2} className={F + ' resize-none'}
                placeholder="Any remarks..."
                value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>
          </div>

        </div>
      </form>

      {/* ── Sticky footer ── */}
      <div style={{ flexShrink: 0, background: '#ffffff', borderTop: '1px solid #e2e8f0' }}
        className="px-6 py-4 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        <div className="w-full max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          {/* Grand total preview */}
          <div className="flex items-center gap-6">
            <div className="text-[11px] text-slate-500 font-medium">
              Basic: <span className="font-medium text-slate-700 text-sm ml-1">₹{inrFmt(basicAmt)}</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              GST: <span className="font-medium text-slate-700 text-sm ml-1">₹{inrFmt(totalGST)}</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Grand Total: <span className="font-medium text-blue-700 text-lg ml-1">₹{inrFmt(grandTotal)}</span>
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 h-9 rounded-md border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={updateMut.isPending}
              className="inline-flex items-center gap-2 px-5 h-9 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {updateMut.isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                : <><Pencil className="w-3.5 h-3.5" /> Save Changes</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* â"€â"€ Record Advance Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */
const PAYMENT_MODES_ADV = [
  { value: 'bank_transfer', label: 'Bank Transfer / NEFT' },
  { value: 'rtgs',          label: 'RTGS' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'upi',           label: 'UPI' },
  { value: 'cash',          label: 'Cash' },
  { value: 'dd',            label: 'Demand Draft' },
];

function RecordAdvanceModal({ onClose, projects, vendors, defaultProjectId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    project_id:       defaultProjectId || '',
    vendor_id:        '',
    vendor_name:      '',
    wo_number:        '',
    po_number:        '',
    amount:           '',
    payment_date:     new Date().toISOString().slice(0, 10),
    payment_mode:     'bank_transfer',
    reference_number: '',
    bank_name:        '',
    remarks:          '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const [vendorSearch, setVendorSearch] = useState('');
  const [showVendorDrop, setShowVendorDrop] = useState(false);

  const filteredVendors = (vendors || []).filter(v =>
    !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  const { data: availableWOs = [], isFetching: loadingWOs } = useQuery({
    queryKey: ['tqs-advance-wos', form.project_id, form.vendor_id, form.vendor_name],
    queryFn: () => tqsBillsAPI.lookupWOs({
      ...(form.project_id ? { project_id: form.project_id } : {}),
      ...(form.vendor_id ? { vendor_id: form.vendor_id } : form.vendor_name ? { vendor_name: form.vendor_name } : {}),
    }).then(r => r.data?.data ?? []),
    enabled: !!form.vendor_name,
    staleTime: 5 * 60 * 1000,
  });

  const handleVendorSelect = (vendor) => {
    setForm(p => ({
      ...p,
      vendor_id: vendor.id,
      vendor_name: vendor.name,
      wo_number: '',
      po_number: '',
    }));
    setVendorSearch('');
    setShowVendorDrop(false);
  };

  const handleWOPick = (woNumber) => {
    const wo = availableWOs.find(w => w.wo_number === woNumber);
    setForm(p => ({
      ...p,
      wo_number: woNumber,
      vendor_id: wo?.vendor_id || p.vendor_id,
      vendor_name: wo?.vendor_name || p.vendor_name,
      project_id: wo?.project_id || p.project_id,
    }));
  };

  const mutation = useMutation({
    mutationFn: d => tqsBillsAPI.recordAdvance(d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tqs-advances'] });
      qc.invalidateQueries({ queryKey: ['tqs-advances-pending'] });
      qc.invalidateQueries({ queryKey: ['liability-summary'] });
      qc.invalidateQueries({ queryKey: ['liability-ledger'] });
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
      const financeLinked = !!res.data?.data?.finance_payment_id;
      toast.success(financeLinked ? 'Advance recorded & Finance entry created!' : 'Advance recorded');
      onClose();
    },
    onError: e => toast.error(e.response?.data?.error || 'Failed to record advance'),
  });

  const handleSubmit = () => {
    if (!form.vendor_name) return toast.error('Vendor name required');
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Amount must be > 0');
    mutation.mutate(form);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Record Advance Payment</p>
            <p className="text-xs text-slate-900 font-medium mt-0.5">Against a Work Order or Purchase Order</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-900 font-medium hover:text-slate-900 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">

          {/* Info banner */}
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Recording an advance automatically creates a <strong>Finance payment entry</strong>.
              The pending balance will appear in the QS certification as <em>Advance Recovery</em> when bills come in.
            </p>
          </div>

          {/* Project */}
          <div>
            <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Project</label>
            <SearchableSelect
              value={form.project_id}
              onChange={v => set('project_id', v)}
              options={(projects || []).map(p => ({ value: p.id, label: p.name }))}
              placeholder="Select project…"
              searchPlaceholder="Search projects…"
            />
          </div>

          {/* Vendor */}
          <div className="relative">
            <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Vendor / Subcontractor *</label>
            <input className={F} placeholder="Type to search vendor..."
              value={vendorSearch || form.vendor_name}
              onFocus={() => setShowVendorDrop(true)}
              onChange={e => {
                setVendorSearch(e.target.value);
                setForm(p => ({ ...p, vendor_name: e.target.value, vendor_id: '', wo_number: '', po_number: '' }));
              }}
              onBlur={() => setTimeout(() => setShowVendorDrop(false), 180)}
            />
            {showVendorDrop && filteredVendors.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                {filteredVendors.slice(0, 20).map(v => (
                  <button key={v.id} type="button" onMouseDown={() => handleVendorSelect(v)} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors">
                    <span className="font-medium text-slate-800">{v.name}</span>
                    {v.vendor_type && <span className="ml-2 text-xs text-slate-400">{v.vendor_type.replace(/_/g,' ')}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* WO / PO reference */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-900 font-medium mb-1">
                Work Order {form.vendor_name && <span className="text-[10px] font-normal text-slate-400">(filtered)</span>}
              </label>
              {availableWOs.length > 0 ? (
                <select className={F} value={form.wo_number} onChange={e => handleWOPick(e.target.value)}>
                  <option value="">Select work order</option>
                  {availableWOs.map(wo => (
                    <option key={wo.id} value={wo.wo_number}>
                      {wo.wo_number} - Rs {inr(wo.total_amount)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={F}
                  placeholder={loadingWOs ? 'Loading work orders...' : 'e.g. WOTQS021-A1'}
                  value={form.wo_number}
                  onChange={e => set('wo_number', e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 font-medium mb-1">PO Number (optional)</label>
              <input className={F} placeholder="e.g. PO-2025-001" value={form.po_number} onChange={e => set('po_number', e.target.value)} />
            </div>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Advance Amount (Rs ) *</label>
              <input type="number" min="0" step="0.01" className={F} placeholder="0.00"
                value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Payment Date *</label>
              <input type="date" className={F} value={form.payment_date} onChange={e => set('payment_date', e.target.value)} />
            </div>
          </div>

          {/* Mode + Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Payment Mode</label>
              <select className={F} value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)}>
                {PAYMENT_MODES_ADV.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Reference / UTR / Cheque No.</label>
              <input className={F} placeholder="UTR or cheque number"
                value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
            </div>
          </div>

          {/* Bank + Remarks */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Bank Name</label>
              <input className={F} placeholder="e.g. HDFC, SBI"
                value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-900 font-medium mb-1">Remarks</label>
              <input className={F} placeholder="Optional note"
                value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>
          </div>

        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
            {mutation.isPending
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Recording...</>
              : '✓ Record Advance Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_VISIBLE = new Set(ALL_COLUMNS.filter(c => c.default).map(c => c.key));

function loadVisibleCols() {
  try {
    const saved = localStorage.getItem('tqs-cols-v4');
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(DEFAULT_VISIBLE);
}

export default function TQSBillsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { user, selectedProjectId } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [showUntagged, setShowUntagged] = useState(false);
  const [search, setSearch] = useState('');
  // Default to the globally-selected project (top nav chip) so the Bill
  // Tracker doesn't show every project's bills under the active project context.
  const [projectFilter, setProjectFilter] = useState(selectedProjectId || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [billTypeFilter, setBillTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [sortCol, setSortCol] = useState('sl_number');
  const [sortDir, setSortDir] = useState('desc');
  const [visibleCols, setVisibleCols] = useState(() => loadVisibleCols());
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef(null);
  const userModules = Array.isArray(user?.accessible_modules) ? user.accessible_modules : [];
  const roleText = String(user?.role || '').toLowerCase();
  const departmentText = String(user?.department || user?.department_name || '').toLowerCase();
  const canManageBillActions = roleText === 'super_admin'
    || roleText.includes('procurement')
    || departmentText.includes('procurement')
    || userModules.some(m => String(m).toLowerCase() === 'procurement');

  const deleteMut = useMutation({
    mutationFn: (id) => tqsBillsAPI.delete(id),
    onSuccess: () => {
      toast.success('Bill deleted');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Delete failed'),
  });

  const [moveProjectId, setMoveProjectId] = useState('');
  const moveMut = useMutation({
    mutationFn: ({ id, project_id }) => tqsBillsAPI.updateMeta(id, { project_id }),
    onSuccess: () => {
      toast.success('Bill moved to new project');
      setMoveTarget(null);
      setMoveProjectId('');
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Move failed'),
  });

  const advanceStageMut = useMutation({
    mutationFn: (id) => tqsBillsAPI.advanceStage(id),
    onSuccess: (_, id) => {
      toast.success('Stage advanced');
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed to advance stage'),
  });

  useEffect(() => {
    const handler = (e) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target)) {
        setShowColPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem('tqs-cols-v4', JSON.stringify([...next]));
      return next;
    });
  };

  const COLUMNS = ALL_COLUMNS.filter(c => visibleCols.has(c.key));

  useEffect(() => {
    const urlStatus = searchParams.get('status') || '';
    setStatusFilter(urlStatus);
  }, [searchParams]);

  const handleSort = (key) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  };

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.projects ?? d?.data ?? []);
    }),
  });

  const { data: pageVendors = [] } = useQuery({
    queryKey: ['tqs-vendors-page'],
    queryFn: () => tqsVendorsAPI.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 60000,
  });

  useEffect(() => {
    if (projects.length === 1 && !projectFilter) {
      setProjectFilter(projects[0].id);
    }
  }, [projects]);

  const activeProject = projects.find(p => p.id === projectFilter) || null;

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['tqs-bills', { search, projectFilter, statusFilter, billTypeFilter, dateFrom, dateTo }],
    queryFn: () => tqsBillsAPI.list({
      search: search || undefined,
      // Empty string means "All Projects" and blocks the global login project
      // interceptor from silently narrowing this list.
      project_id: projectFilter || '',
      status: statusFilter || undefined,
      bill_type: billTypeFilter || undefined,
      from_date: dateFrom || undefined,
      to_date: dateTo || undefined,
    }).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 5 * 60 * 1000,
  });

  const { data: agingData = [] } = useQuery({
    queryKey: ['tqs-aging', projectFilter],
    queryFn: () => tqsBillsAPI.getAPAging({ project_id: projectFilter || '' })
      .then(r => r.data?.data ?? []),
    staleTime: 0,
  });
  const aging30  = agingData.filter(b => b.aging_bucket === '0-30').reduce((s, b) => s + parseFloat(b.balance || 0), 0);
  const aging60  = agingData.filter(b => b.aging_bucket === '31-60').reduce((s, b) => s + parseFloat(b.balance || 0), 0);
  const aging90p = agingData.filter(b => ['61-90', '90+'].includes(b.aging_bucket)).reduce((s, b) => s + parseFloat(b.balance || 0), 0);

  const vendorOptions = React.useMemo(
    () => [...new Set(bills.map(b => b.vendor_name).filter(Boolean))].sort(),
    [bills]
  );

  const sorted = sortRows(
    vendorFilter ? bills.filter(b => b.vendor_name === vendorFilter) : bills,
    sortCol, sortDir
  );

  const kpiPending  = bills.filter(b => b.workflow_status === 'pending').length;
  const kpiPaid     = bills.filter(b => b.workflow_status === 'paid').length;
  const totalValue  = bills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
  // Basic (excl. GST) — matches Budget Control's "Received" figure, which
  // excludes GST since it's a pass-through tax, not project spend.
  const totalBasicValue = bills.reduce((s, b) => s + parseFloat(b.basic_amount || 0), 0);
  const totalGstValue   = totalValue - totalBasicValue;
  const paidValue   = bills.filter(b => b.workflow_status === 'paid').reduce((s, b) => s + parseFloat(b.paid_amount || 0), 0);
  const totalBalanceDue  = bills
    .reduce((s, b) => s + billBalanceDue(b), 0);

  // Status counts for Zoho-style tab bar
  const STATUS_TABS = [
    { key: '',                    label: 'All Bills',   count: bills.length },
    { key: 'pending',             label: 'Pending',     count: bills.filter(b => b.workflow_status === 'pending').length },
    { key: 'stores',              label: 'Stores',      count: bills.filter(b => b.workflow_status === 'stores').length },
    { key: 'document_controller', label: 'Doc Control', count: bills.filter(b => b.workflow_status === 'document_controller').length },
    { key: 'qs',                  label: 'QS',          count: bills.filter(b => b.workflow_status === 'qs').length },
    { key: 'accounts',            label: 'Accounts',    count: bills.filter(b => ['accounts','partial'].includes(b.workflow_status)).length },
    { key: 'procurement',         label: 'Procurement', count: bills.filter(b => b.workflow_status === 'procurement').length },
    { key: 'paid',                label: 'Paid',        count: bills.filter(b => b.workflow_status === 'paid').length },
  ].filter(t => t.key === '' || t.count > 0);

  const KPI = ({ label, value, sub, statusKey, color = 'blue', isAmount, kpiIcon: KpiIcon }) => {
    const active = statusKey !== undefined && statusFilter === statusKey;
    // All KPI cards share the same blue palette
    const cfg = { from: '#3b82f6', to: '#1d4ed8', shadow: '#1e40af' };

    const glow = (hex, a) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    };

    const baseShadow =
      `inset 0 1px 0 rgba(255,255,255,0.35),
       inset 0 -2px 0 ${glow(cfg.shadow, 0.4)},
       0 1px 2px rgba(15,23,42,0.10),
       0 6px 14px ${glow(cfg.shadow, 0.25)},
       0 12px 28px ${glow(cfg.shadow, 0.20)}`;

    const hoverShadow =
      `inset 0 1px 0 rgba(255,255,255,0.40),
       inset 0 -2px 0 ${glow(cfg.shadow, 0.45)},
       0 2px 4px rgba(15,23,42,0.12),
       0 14px 28px ${glow(cfg.shadow, 0.35)},
       0 22px 44px ${glow(cfg.shadow, 0.28)}`;

    const activeShadow =
      `inset 0 1px 0 rgba(255,255,255,0.45),
       inset 0 0 0 2px rgba(255,255,255,0.55),
       inset 0 -2px 0 ${glow(cfg.shadow, 0.45)},
       0 4px 12px rgba(15,23,42,0.12),
       0 18px 36px ${glow(cfg.shadow, 0.40)}`;

    return (
      <button
        onClick={() => statusKey !== undefined && setStatusFilter(p => p === statusKey ? '' : statusKey)}
        className="rounded-xl p-4 text-left relative overflow-hidden"
        style={{
          cursor: statusKey !== undefined ? 'pointer' : 'default',
          background: `linear-gradient(160deg, ${cfg.from} 0%, ${cfg.to} 100%)`,
          boxShadow: active ? activeShadow : baseShadow,
          transform: 'translateZ(0)',
          transition: 'box-shadow 0.25s cubic-bezier(0.16,1,0.3,1), transform 0.25s cubic-bezier(0.16,1,0.3,1)',
        }}
        onMouseEnter={e => {
          if (active) return;
          e.currentTarget.style.transform = 'translateY(-3px)';
          e.currentTarget.style.boxShadow = hoverShadow;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = active ? activeShadow : baseShadow;
        }}
      >
        {/* Top-right glossy highlight */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: -40, right: -40, width: 140, height: 140,
            background: 'radial-gradient(circle, rgba(255,255,255,0.30) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        {/* Bottom-left subtle dark shade */}
        <div
          aria-hidden
          style={{
            position: 'absolute', bottom: -30, left: -30, width: 120, height: 120,
            background: `radial-gradient(circle, ${glow(cfg.shadow, 0.25)} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
        <div className="flex items-start justify-between gap-2 relative">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium uppercase tracking-widest mb-1.5"
              style={{ color: '#bfdbfe', textShadow: '0 1px 0 rgba(0,0,0,0.20)' }}>
              {label}
            </div>
            <div className={`font-medium leading-tight ${isAmount ? 'text-lg' : 'text-2xl'}`}
              style={{ color: '#fde047', textShadow: '0 1px 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.18)' }}>
              {value}
            </div>
            {sub && <div className="text-[11px] mt-1" style={{ color: '#e0f2fe' }}>{sub}</div>}
          </div>
          {KpiIcon && (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.12) 100%)',
                boxShadow: `
                  inset 0 1px 0 rgba(255,255,255,0.40),
                  inset 0 -1px 0 rgba(0,0,0,0.10),
                  0 2px 4px rgba(0,0,0,0.12)
                `,
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              <KpiIcon style={{ width: 18, height: 18, color: '#ffffff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }} />
            </div>
          )}
        </div>
      </button>
    );
  };

  const inrCr = (v) => {
    const n = parseFloat(v) || 0;
    return `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const PRIMARY = Theme.navy;
  const ACCENT  = Theme.accent;
  const PAGE_BG = Theme.pageBg;
  const BORDER  = Theme.border;

  return (
    <div className="min-h-full font-sans" style={{ background: PAGE_BG }}>

      <PageHeader
        title="BCIM Bills Tracker"
        subtitle="Bill Tracker — Bills"
        breadcrumbs={[
          { label: 'Bill Tracker' },
          { label: 'Bills' },
          ...(activeProject ? [{ label: activeProject.name }] : []),
        ]}
        pills={[
          { label: 'Total Value',  value: inrCr(totalValue) },
          { label: 'Balance Due',  value: inrCr(totalBalanceDue), color: '#f87171' },
          { label: 'Paid',         value: inrCr(paidValue),       color: '#34d399' },
        ]}
        actions={<>
          {activeProject && (<>
            <button onClick={async () => {
              try {
                const res = await tqsBillsAPI.downloadTemplate();
                const url = URL.createObjectURL(new Blob([res.data]));
                const a = document.createElement('a'); a.href = url; a.download = 'DQS_Bills_Import_Template.xlsx'; a.click();
                URL.revokeObjectURL(url);
              } catch { toast.error('Template download failed'); }
            }} title="Download Template"
              className="p-2 rounded-lg transition-all hover:bg-white/10 text-white/70 hover:text-white">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={() => setShowImport(true)} title="Import Bills"
              className="p-2 rounded-lg transition-all hover:bg-white/10 text-white/70 hover:text-white">
              <Upload className="w-4 h-4" />
            </button>
            <button onClick={() => setShowUntagged(true)} title="Bulk-tag line items with no cost head"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/10 text-white/70 hover:text-white">
              <Package className="w-3.5 h-3.5" /> Untagged Items
            </button>
            <button onClick={() => setShowAdvance(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(232,67,26,0.20)', color: '#ffb59a', border: '1px solid rgba(232,67,26,0.4)' }}>
              <IndianRupee className="w-3.5 h-3.5" /> Advance
            </button>
          </>)}
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: '#ffffff', color: Theme.navy }}>
            <Plus className="w-4 h-4" /> New Bill
          </button>
        </>}
      />

      {/* Status Tabs — white bar below PageHeader */}
      <div className="bg-white" style={{ borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center overflow-x-auto scrollbar-none px-4">
          {STATUS_TABS.map(tab => (
            <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
              className="flex items-center gap-1.5 px-4 py-3 text-sm whitespace-nowrap flex-shrink-0 transition-all"
              style={{
                color: statusFilter === tab.key ? ACCENT : '#64748b',
                borderBottom: statusFilter === tab.key ? `2px solid ${ACCENT}` : '2px solid transparent',
                fontWeight: statusFilter === tab.key ? 700 : 500,
              }}>
              {tab.label}
              <span className="text-[11px] px-1.5 py-0.5 rounded font-bold"
                style={{
                  background: statusFilter === tab.key ? ACCENT : '#f1f5f9',
                  color: statusFilter === tab.key ? 'white' : '#64748b',
                }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── KPI Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <ThemeKpiCard label="Total Bills"  value={bills.length}                         sub={inrCr(totalValue)}  color="blue"    icon={FileText} />
          <ThemeKpiCard label="Pending"      value={kpiPending}                           color="amber"            icon={AlertTriangle}
            onClick={() => setStatusFilter(p => p === 'pending' ? '' : 'pending')}
            active={statusFilter === 'pending'} />
          <ThemeKpiCard label="In Progress"  value={bills.length - kpiPaid - kpiPending}  color="indigo"           icon={ChevronsRight} />
          <ThemeKpiCard label="Balance Due"  value={inrCr(totalBalanceDue)}               color="red"              icon={IndianRupee} />
          <ThemeKpiCard label="Paid"         value={kpiPaid}                              sub={inrCr(paidValue)}   color="emerald" icon={CheckCircle2}
            onClick={() => setStatusFilter(p => p === 'paid' ? '' : 'paid')}
            active={statusFilter === 'paid'} />
        </div>

        {/* ── AP Aging Alert Banner ── */}
        {(aging30 > 0 || aging60 > 0 || aging90p > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">AP Aging</span>
            </div>
            {aging30  > 0 && <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg">0–30 days: {inrCr(aging30)}</span>}
            {aging60  > 0 && <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2.5 py-1 rounded-lg">31–60 days: {inrCr(aging60)}</span>}
            {aging90p > 0 && <span className="text-xs font-semibold text-red-700 bg-red-100 px-2.5 py-1 rounded-lg">Overdue 60+: {inrCr(aging90p)}</span>}
          </div>
        )}

        {/* ── Basic Amount Summary ── */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2.5">Basic Amount Summary (excl. GST) — matches Budget Control</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-500">Basic Amount</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{inrCr(totalBasicValue)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total GST</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{inrCr(totalGstValue)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total (incl. GST)</p>
              <p className="text-sm font-semibold text-emerald-700 mt-0.5">{inrCr(totalValue)}</p>
            </div>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center shadow-sm" style={{ border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg px-3 py-1.5 bg-slate-50" style={{ border: `1px solid ${BORDER}` }}>
            <Search className="w-4 h-4 text-slate-900 font-medium flex-shrink-0" />
            <input className="flex-1 text-sm outline-none bg-transparent placeholder-slate-400 text-slate-800"
              placeholder="Search bills, vendors..."
              value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="text-slate-900 font-medium hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
          </div>

          {[
            { val: projectFilter, set: setProjectFilter, opts: [['', 'All Projects'], ...projects.map(p => [p.id, p.name])] },
            { val: billTypeFilter, set: setBillTypeFilter, opts: [['', 'All Types'], ['po', 'PO Bills'], ['wo', 'WO Bills'], ['hire', 'Hire/Rental']] },
            { val: vendorFilter, set: setVendorFilter, opts: [['', 'All Vendors'], ...vendorOptions.map(v => [v, v])], cls: 'max-w-[180px]' },
          ].map((s, i) => (
            <select key={i} value={s.val} onChange={e => s.set(e.target.value)}
              className={clsx('h-9 rounded-lg px-3 text-sm font-medium outline-none transition-all border', FIELD_HL, s.cls)}>
              {s.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}

          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-sm text-slate-900 outline-none bg-slate-50" style={{ border: `1px solid ${BORDER}` }} />
            <span className="text-slate-300 text-xs">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-sm text-slate-900 outline-none bg-slate-50" style={{ border: `1px solid ${BORDER}` }} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {(search || statusFilter || billTypeFilter || dateFrom || dateTo || vendorFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter(''); setBillTypeFilter(''); setDateFrom(''); setDateTo(''); setVendorFilter(''); }}
                className="text-xs text-slate-900 font-medium hover:text-red-500 transition-colors font-medium">✕ Clear</button>
            )}
            <div className="h-5 w-px bg-slate-200 hidden md:block" />
            <div className="relative" ref={colPickerRef}>
              <button onClick={() => setShowColPicker(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-900 hover:bg-slate-100 transition-all bg-slate-50"
                style={{ border: `1px solid ${BORDER}` }}>
                <SlidersHorizontal className="w-3.5 h-3.5" /> Columns
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl z-30 p-2 min-w-[200px]"
                  style={{ border: `1px solid ${BORDER}` }}>
                  {ALL_COLUMNS.map(col => (
                    <label key={col.key} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-slate-50 rounded-lg px-2">
                      <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <span className="text-sm text-slate-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button onClick={async () => {
              try {
                const res = await tqsBillsAPI.exportExcel({ project_id: projectFilter || '', status: statusFilter||undefined, bill_type: billTypeFilter||undefined, from_date: dateFrom||undefined, to_date: dateTo||undefined, search: search||undefined });
                const url = URL.createObjectURL(new Blob([res.data]));
                const a = document.createElement('a'); a.href = url; a.download = `DQS_Bills_${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
              } catch { toast.error('Export failed'); }
            }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-all shadow-sm"
              style={{ background: '#16a34a' }}>
              <FileSpreadsheet className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* ── Bills Table ── */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {isLoading ? 'Loading…' : `${sorted.length} Bill${sorted.length !== 1 ? 's' : ''}`}
            </h3>
            <p className="text-xs text-slate-500">
              {statusFilter ? `Status: ${STATUS_CONFIG[statusFilter]?.label ?? statusFilter}` : 'All statuses'}
              {projectFilter && activeProject ? ` · ${activeProject.name}` : ''}
            </p>
          </div>
        </div>

        <div
          className="bg-white rounded-xl shadow-sm tqs-bills-grid"
          style={{
            border: '1px solid #cbd5e1',
            maxWidth: 'calc(100vw - 2rem)',
            maxHeight: 'calc(100vh - 315px)',
            overflow: 'auto',
          }}
        >
          <style>{`
            .tqs-bills-grid {
              scrollbar-width: auto;
              scrollbar-color: #94a3b8 #f1f5f9;
            }
            .tqs-bills-grid::-webkit-scrollbar {
              width: 12px;
              height: 12px;
            }
            .tqs-bills-grid::-webkit-scrollbar-track {
              background: #f1f5f9;
              border-radius: 999px;
            }
            .tqs-bills-grid::-webkit-scrollbar-thumb {
              background: #94a3b8;
              border: 3px solid #f1f5f9;
              border-radius: 999px;
            }
            .tqs-bills-table { border: 1px solid #e2e8f0; }
            .tqs-bills-table th {
              position: sticky;
              top: 0;
              z-index: 10;
              background: #f8fafc;
              border-right: 1px solid #e2e8f0;
              border-bottom: 2px solid #e2e8f0;
            }
            .tqs-bills-table th:last-child { border-right: none; }
            .tqs-bills-table td {
              border-right: 1px solid #f1f5f9;
              border-bottom: 1px solid #f1f5f9;
              vertical-align: middle;
            }
            .tqs-bills-table td:last-child { border-right: none; }
            .tqs-bills-table tbody tr:last-child td { border-bottom: none; }
            .tqs-bills-table tbody tr:hover td { background-color: #f8fafc !important; }
            .tqs-bills-table tbody tr:hover td:first-child { box-shadow: inset 3px 0 0 ${ACCENT}; }
          `}</style>
          <table className="tqs-bills-table min-w-[1820px] w-full text-sm whitespace-nowrap table-fixed" style={{ borderCollapse: 'collapse' }}>
            <colgroup>
              {COLUMNS.map(col => <col key={col.key} className={col.w} />)}
              {canManageBillActions && <col className="w-[104px]" />}
            </colgroup>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {COLUMNS.map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)}
                    className={`px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.07em] cursor-pointer select-none transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    style={{ color: '#475569' }}
                    onMouseEnter={e => e.currentTarget.style.color='#1e293b'}
                    onMouseLeave={e => e.currentTarget.style.color='#475569'}>
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortCol === col.key
                        ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-emerald-500" /> : <ChevronDown className="w-3 h-3 text-emerald-500" />)
                        : <span className="flex flex-col opacity-30"><ChevronUp className="w-2.5 h-2.5 -mb-1" /><ChevronDown className="w-2.5 h-2.5" /></span>}
                    </span>
                  </th>
                ))}
                {canManageBillActions && (
                  <th className="px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-right" style={{ color: '#475569' }}>Actions</th>
                )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: COLUMNS.length + (canManageBillActions ? 1 : 0) }).map((__, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3.5 rounded-full bg-slate-100 animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + (canManageBillActions ? 1 : 0)} className="px-4 py-16 text-center">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No bills found</p>
                  <p className="text-xs text-slate-900 font-medium mt-1">Try adjusting your filters</p>
                </td>
              </tr>
            ) : sorted.map((b) => (
              <tr key={b.id} className="cursor-pointer" onClick={() => navigate(`/tqs/bills/${b.id}`)}>
                {COLUMNS.map(col => {
                  const cls = `px-3 py-2.5 ${col.align === 'right' ? 'text-right' : ''}`;
                  switch (col.key) {
                    case 'sl_number': {
                      const daysSince = b.updated_at ? Math.floor((Date.now() - new Date(b.updated_at)) / 86400000) : 0;
                      const isVeryStuck = b.workflow_status !== 'paid' && daysSince > 30;
                      const isStuck     = b.workflow_status !== 'paid' && daysSince > 7;
                      return (
                        <td key={col.key} className={cls}>
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: ACCENT }}>
                            {b.sl_number}
                            {isVeryStuck && <span title={`Stuck for ${daysSince} days`} className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] font-medium">!</span>}
                            {!isVeryStuck && isStuck && <span title={`Stuck for ${daysSince} days`} className="w-4 h-4 rounded-full bg-amber-400 text-white flex items-center justify-center text-[8px] font-medium">!</span>}
                          </span>
                        </td>
                      );
                    }
                    case 'bill_type':
                      return <td key={col.key} className={cls}>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${b.bill_type === 'wo' ? 'bg-orange-100 text-orange-700' : b.bill_type === 'hire' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {b.bill_type === 'wo' ? 'WO' : b.bill_type === 'hire' ? 'HIRE' : 'PO'}
                        </span>
                      </td>;
                    case 'vendor_name':
                      return <td key={col.key} className={cls}>
                        <span className="font-medium text-slate-900 text-[13px] block whitespace-normal leading-snug" title={(b.vendor_name || '').toUpperCase()}>{(b.vendor_name || '').toUpperCase()}</span>
                      </td>;
                    case 'project_name':
                      return <td key={col.key} className={cls}>
                        <span className="text-slate-900 text-[11px] font-medium whitespace-normal leading-snug block" title={(b.project_name || '').toUpperCase()}>{(b.project_name || '').toUpperCase() || '—'}</span>
                      </td>;
                    case 'inv_number':
                      return <td key={col.key} className={cls}>
                        <span className="font-mono text-slate-900 text-[12px] font-medium whitespace-normal break-words block" title={b.inv_number}>{(b.inv_number || '').toUpperCase()}</span>
                      </td>;
                    case 'inv_date':
                      return <td key={col.key} className={cls}>
                        <span className="text-slate-900 text-[12px] font-medium">{b.inv_date ? dayjs(b.inv_date).format('DD-MM-YYYY') : <span className="text-slate-400">—</span>}</span>
                      </td>;
                    case 'po_number':
                      return <td key={col.key} className={cls}>
                        <span className="font-mono text-slate-900 text-[11px] font-medium whitespace-normal break-words block" title={b.po_number || ''}>{b.po_number || <span className="text-slate-400">—</span>}</span>
                      </td>;
                    case 'total_amount':
                      return <td key={col.key} className={`${cls} text-right`}>
                        <span className="font-medium text-slate-900 text-[13px]">Rs {inr(b.total_amount)}</span>
                      </td>;
                    case 'basic_amount':
                      return <td key={col.key} className={`${cls} text-right`}>
                        <span className="font-medium text-slate-600 text-[13px]" title="Excludes GST — matches Budget Control's Received figure">Rs {inr(b.basic_amount)}</span>
                      </td>;
                    case 'pc_number':
                      return <td key={col.key} className={cls}>
                        {b.pc_number
                          ? <span className="font-mono text-[12px] font-bold" style={{ color: PRIMARY }}>{b.pc_number}</span>
                          : b.workflow_status === 'accounts'
                            ? <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">No PC</span>
                            : <span className="text-slate-400">—</span>}
                      </td>;
                    case 'certified_net': {
                      const certifiedValue = Number(b.certified_amount ?? b.qs_total ?? b.certified_net ?? 0);
                      return <td key={col.key} className={`${cls} text-right`}>
                        {certifiedValue > 0
                          ? <span className="font-medium text-slate-900 text-[13px]">Rs {inr(certifiedValue)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>;
                    }
                    case 'tds_deduction':
                      return <td key={col.key} className={`${cls} text-right`}>
                        {parseFloat(b.tds_deduction) > 0
                          ? <span className="text-orange-600 font-medium text-[12px]">Rs {inr(b.tds_deduction)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>;
                    case 'balance_to_pay': {
                      const bal = billBalanceDue(b);
                      return <td key={col.key} className={`${cls} text-right`}>
                        {bal > 0
                          ? <span className="font-medium text-red-500 text-[13px]">Rs {inr(bal)}</span>
                          : <span className="font-medium text-emerald-600 text-[12px]">Nil</span>}
                      </td>;
                    }
                    case 'paid_amount':
                      return <td key={col.key} className={`${cls} text-right`}>
                        {parseFloat(b.paid_amount) > 0
                          ? <span className="font-medium text-emerald-600 text-[13px]">Rs {inr(b.paid_amount)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>;
                    case 'payment_date':
                      return <td key={col.key} className={cls}>
                        <span className="text-slate-900 text-[12px] font-medium">
                          {b.payment_date ? dayjs(b.payment_date).format('DD-MM-YYYY') : <span className="text-slate-400">—</span>}
                        </span>
                      </td>;
                    case 'workflow_status': {
                      const WF_CFG = {
                        pending:             { badge: 'bg-amber-100 text-amber-800',   label: 'Pending' },
                        stores:              { badge: 'bg-blue-100 text-blue-700',     label: 'Stores' },
                        document_controller: { badge: 'bg-cyan-100 text-cyan-800',     label: 'Doc Ctrl' },
                        qs:                  { badge: 'bg-indigo-100 text-indigo-800', label: 'QS' },
                        accounts:            { badge: 'bg-violet-100 text-violet-800', label: 'Accounts' },
                        partial:             { badge: 'bg-sky-100 text-sky-800',       label: 'Partial' },
                        procurement:         { badge: 'bg-orange-100 text-orange-800', label: 'Procurement' },
                        paid:                { badge: 'bg-emerald-100 text-emerald-800', label: 'Paid' },
                      };
                      const wfCfg = WF_CFG[b.workflow_status] || { badge: 'bg-slate-100 text-slate-700', label: b.workflow_status };
                      const showTooltip = ['paid','partial'].includes(b.workflow_status) || b.payment_status === 'paid' || b.payment_status === 'partial';
                      const tooltipLines = showTooltip ? [
                        b.reference_number ? `UTR: ${b.reference_number}` : null,
                        b.bank_name        ? `Bank: ${b.bank_name}` : null,
                        b.payment_mode     ? `Mode: ${b.payment_mode}` : null,
                        b.paid_amount      ? `Paid: Rs ${inr(b.paid_amount)}${b.payment_date ? ' on ' + dayjs(b.payment_date).format('DD-MM-YYYY') : ''}` : null,
                      ].filter(Boolean) : [];
                      const badge = (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded text-[11px] font-medium ${wfCfg.badge}`}>
                          {wfCfg.label}
                        </span>
                      );
                      return (
                        <td key={col.key} className={cls}>
                          {tooltipLines.length > 0 ? (
                            <div className="relative group inline-block">
                              {badge}
                              <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 pointer-events-none">
                                <div className="bg-slate-900 text-white text-[11px] rounded-xl px-3 py-2 whitespace-nowrap shadow-xl leading-relaxed">
                                  {tooltipLines.map((line, i) => <div key={i}>{line}</div>)}
                                </div>
                              </div>
                            </div>
                          ) : badge}
                        </td>
                      );
                    }
                    default:
                      return <td key={col.key} className={cls}>
                        <span className="text-slate-900 font-medium text-[12px]">{b[col.key] ?? <span className="text-slate-200">—</span>}</span>
                      </td>;
                  }
                })}
                {canManageBillActions && (
                  <td className="px-3 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: 1 }}>
                      <button
                        onClick={() => navigate(`/tqs/bills/${b.id}`)}
                        className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="View Details"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingBill(b)}
                        className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setMoveTarget(b)}
                        className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Move to another project"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(b)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <NewBillModal
          onClose={() => setShowModal(false)}
          projects={projects}
          defaultProjectId={projectFilter || (projects.length === 1 ? projects[0].id : '')}
        />
      )}

      {/* â"€â"€ Edit Bill Modal â"€â"€ */}
      {editingBill && canManageBillActions && (
        <EditBillModal
          bill={editingBill}
          projects={projects}
          onClose={() => setEditingBill(null)}
        />
      )}

      {/* â"€â"€ Record Advance Modal â"€â"€ */}
      {showAdvance && (
        <RecordAdvanceModal
          onClose={() => setShowAdvance(false)}
          projects={projects}
          vendors={pageVendors}
          defaultProjectId={projectFilter}
        />
      )}

      {/* â"€â"€ Import Modal â"€â"€ */}
      {showImport && (
        <ImportBillsModal
          projects={projects}
          defaultProjectId={projectFilter}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); qc.invalidateQueries({ queryKey: ['tqs-bills'] }); }}
        />
      )}

      {/* Untagged Items — bulk cost-head tagging */}
      {showUntagged && (
        <UntaggedItemsModal
          projectId={projectFilter}
          onClose={() => setShowUntagged(false)}
        />
      )}

      {/* â"€â"€ Delete Confirm Modal â"€â"€ */}
      {/* ── Move to Project Modal ── */}
      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Move to Another Project</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {moveTarget.inv_number || moveTarget.sl_number} · {moveTarget.vendor_name}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Select Project</label>
              <select
                value={moveProjectId}
                onChange={e => setMoveProjectId(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">— Choose project —</option>
                {projects.filter(p => p.id !== moveTarget.project_id).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {moveTarget.project_id && (
                <p className="text-xs text-slate-400 mt-1.5">
                  Current project: <span className="font-medium text-slate-600">{projects.find(p => p.id === moveTarget.project_id)?.name || 'Unknown'}</span>
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => { setMoveTarget(null); setMoveProjectId(''); }}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => moveMut.mutate({ id: moveTarget.id, project_id: moveProjectId })}
                disabled={!moveProjectId || moveMut.isPending}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {moveMut.isPending ? 'Moving…' : 'Move Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && canManageBillActions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-slate-800">Delete Bill?</p>
                <p className="text-xs text-slate-900 font-medium mt-0.5">
                  SL #{deleteTarget.sl_number} - {deleteTarget.vendor_name} - Inv {deleteTarget.inv_number}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600">This action cannot be undone. All line items and workflow history for this bill will be permanently removed.</p>
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                {deleteMut.isPending ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
