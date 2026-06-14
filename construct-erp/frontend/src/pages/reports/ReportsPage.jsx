// src/pages/reports/ReportsPage.jsx — ERP Reports Hub (Generate Reports)
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BarChart3, FileText, Users, Package, ShieldCheck, AlertTriangle,
  TrendingUp, Receipt, IndianRupee, Layers, Activity, Calendar,
  HardHat, Briefcase, Search, FileBarChart, Building2, Truck,
  PackageCheck, FileSearch, Gavel, Send, Star, Clock, CreditCard,
  Flag, Ruler, BookOpen, ClipboardList, Target, ChevronRight,
  Printer, Download, RefreshCw, X, Filter, SlidersHorizontal,
  CheckCircle2, Circle, ChevronDown, Eye, FileSpreadsheet,
  ArrowUpRight, Wallet, DollarSign, AlertCircle, Info,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { clsx } from 'clsx';
import api from '../../api/client';

const CHART_COLORS = ['#d97706', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#0d9488', '#ea580c', '#0891b2', '#4f46e5', '#b45309'];

// ── Colour palette — one distinct, muted enterprise colour per department ─────
const C = {
  navy:   { bg:'bg-[#eef2fb]', icon:'text-[#1e3a8a]', badge:'bg-[#e0e9fa] text-[#1e3a8a]', btn:'bg-[#1e3a8a] hover:bg-[#172d6e]', ring:'ring-[#c3d2f0]', hdr:'bg-[#1e3a8a]' },
  blue:   { bg:'bg-[#eff6ff]', icon:'text-[#2563eb]', badge:'bg-[#dbeafe] text-[#1d4ed8]', btn:'bg-[#2563eb] hover:bg-[#1d4ed8]', ring:'ring-[#bfdbfe]', hdr:'bg-[#2563eb]' },
  red:    { bg:'bg-[#fef2f2]', icon:'text-[#dc2626]', badge:'bg-[#fee2e2] text-[#b91c1c]', btn:'bg-[#dc2626] hover:bg-[#b91c1c]', ring:'ring-[#fecaca]', hdr:'bg-[#dc2626]' },
  gold:   { bg:'bg-[#fffbeb]', icon:'text-[#b45309]', badge:'bg-[#fef3c7] text-[#92400e]', btn:'bg-[#b45309] hover:bg-[#92400e]', ring:'ring-[#fde68a]', hdr:'bg-[#b45309]' },
  slate:  { bg:'bg-[#f8fafc]', icon:'text-[#475569]', badge:'bg-[#e2e8f0] text-[#334155]', btn:'bg-[#475569] hover:bg-[#334155]', ring:'ring-[#cbd5e1]', hdr:'bg-[#475569]' },
  indigo: { bg:'bg-[#eef2ff]', icon:'text-[#4f46e5]', badge:'bg-[#e0e7ff] text-[#4338ca]', btn:'bg-[#4f46e5] hover:bg-[#4338ca]', ring:'ring-[#c7d2fe]', hdr:'bg-[#4f46e5]' },
  emerald:{ bg:'bg-[#ecfdf5]', icon:'text-[#059669]', badge:'bg-[#d1fae5] text-[#047857]', btn:'bg-[#059669] hover:bg-[#047857]', ring:'ring-[#a7f3d0]', hdr:'bg-[#059669]' },
  amber:  { bg:'bg-[#fffbeb]', icon:'text-[#d97706]', badge:'bg-[#fef3c7] text-[#b45309]', btn:'bg-[#d97706] hover:bg-[#b45309]', ring:'ring-[#fde68a]', hdr:'bg-[#d97706]' },
  violet: { bg:'bg-[#f5f3ff]', icon:'text-[#7c3aed]', badge:'bg-[#ede9fe] text-[#6d28d9]', btn:'bg-[#7c3aed] hover:bg-[#6d28d9]', ring:'ring-[#ddd6fe]', hdr:'bg-[#7c3aed]' },
  teal:   { bg:'bg-[#f0fdfa]', icon:'text-[#0d9488]', badge:'bg-[#ccfbf1] text-[#0f766e]', btn:'bg-[#0d9488] hover:bg-[#0f766e]', ring:'ring-[#99f6e4]', hdr:'bg-[#0d9488]' },
  orange: { bg:'bg-[#fff7ed]', icon:'text-[#ea580c]', badge:'bg-[#ffedd5] text-[#c2410c]', btn:'bg-[#ea580c] hover:bg-[#c2410c]', ring:'ring-[#fed7aa]', hdr:'bg-[#ea580c]' },
  cyan:   { bg:'bg-[#ecfeff]', icon:'text-[#0891b2]', badge:'bg-[#cffafe] text-[#0e7490]', btn:'bg-[#0891b2] hover:bg-[#0e7490]', ring:'ring-[#a5f3fc]', hdr:'bg-[#0891b2]' },
};

// ── Departments ────────────────────────────────────────────────────────────────
const DEPTS = [
  { key:'all',            label:'All Reports',       icon:BarChart3,     color:'navy' },
  { key:'tqs',            label:'Bill Tracker',      icon:Send,          color:'indigo' },
  { key:'finance',        label:'Finance',           icon:IndianRupee,   color:'emerald' },
  { key:'hr',             label:'HR & Admin',        icon:Users,         color:'violet' },
  { key:'procurement',    label:'Procurement',       icon:Truck,         color:'amber' },
  { key:'stores',         label:'Stores',            icon:Package,       color:'teal' },
  { key:'qs',             label:'QS & Billing',      icon:Layers,        color:'navy' },
  { key:'planning',       label:'Planning',          icon:Flag,          color:'blue' },
  { key:'quality',        label:'Quality (QA/QC)',   icon:ShieldCheck,   color:'cyan' },
  { key:'hse',            label:'HSE & Safety',      icon:AlertTriangle, color:'red' },
  { key:'tender',         label:'Tender',            icon:Gavel,         color:'gold' },
  { key:'assets',         label:'Assets & IT',       icon:Briefcase,     color:'slate' },
];

// ── Report definitions (with columns + api endpoint) ──────────────────────────
// Endpoints match actual backend routes in server.js
export const REPORTS = [
  // ── TQS ──────────────────────────────────────────────────────────────────────
  {
    key:'tqs-bill-register', dept:'tqs', title:'Bill Register', icon:FileText, color:'indigo',
    desc:'All invoices with vendor, amount, status, and dates',
    filters:['dateRange','project'],
    endpoint:'/tqs/bills',
    // backend returns { data: [...] }
    dataKey:'data',
    // date filter params used by this route
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'sl_number',       label:'Bill No',      mono:true },
      { key:'vendor_name',     label:'Vendor' },
      { key:'inv_number',      label:'Invoice No',   mono:true },
      { key:'inv_date',        label:'Date',         type:'date' },
      { key:'total_amount',      label:'Amount (₹)',   type:'amount' },
      { key:'workflow_status', label:'Status',       type:'status' },
      { key:'project_name',    label:'Project' },
    ],
  },
  {
    key:'tqs-aging', dept:'tqs', title:'Invoice Ageing', icon:Clock, color:'indigo',
    desc:'Ageing analysis — how long invoices have been pending',
    filters:['project'],
    endpoint:'/tqs/bills',
    dataKey:'data',
    columns:[
      { key:'sl_number',       label:'Bill No',     mono:true },
      { key:'vendor_name',     label:'Vendor' },
      { key:'total_amount',      label:'Amount (₹)',  type:'amount' },
      { key:'workflow_status', label:'Status',      type:'status' },
      { key:'days_pending',    label:'Days Pending',type:'number' },
    ],
    transform: rows => rows
      .filter(r => !['paid','rejected'].includes(r.workflow_status))
      .map(r => ({
        ...r,
        days_pending: r.received_date
          ? Math.floor((Date.now() - new Date(r.received_date)) / 86400000)
          : r.created_at
            ? Math.floor((Date.now() - new Date(r.created_at)) / 86400000)
            : 0,
      }))
      .sort((a,b) => b.days_pending - a.days_pending),
  },
  {
    key:'tqs-vendor-summary', dept:'tqs', title:'Vendor-wise Summary', icon:Users, color:'indigo',
    desc:'Invoice count and total amounts grouped by vendor',
    filters:['dateRange','project'],
    endpoint:'/tqs/bills',
    dataKey:'data',
    columns:[
      { key:'vendor_name',  label:'Vendor' },
      { key:'count',        label:'Bills',       type:'number' },
      { key:'total_amount', label:'Total (₹)',   type:'amount' },
      { key:'paid',         label:'Paid (₹)',    type:'amount' },
      { key:'pending',      label:'Pending (₹)', type:'amount' },
    ],
    aggregate: rows => {
      const m = {};
      rows.forEach(r => {
        const v = r.vendor_name || 'Unknown';
        if (!m[v]) m[v] = { vendor_name:v, count:0, total_amount:0, paid:0, pending:0 };
        m[v].count++;
        m[v].total_amount += parseFloat(r.total_amount)||0;
        if (['paid','approved'].includes(r.workflow_status)) m[v].paid += parseFloat(r.total_amount)||0;
        else m[v].pending += parseFloat(r.total_amount)||0;
      });
      return Object.values(m).sort((a,b) => b.total_amount - a.total_amount);
    },
  },
  {
    key:'tqs-ap-aging', dept:'tqs', title:'AP Ageing Report', icon:TrendingUp, color:'indigo',
    desc:'Accounts payable ageing buckets: current, 30, 60, 90+ days',
    filters:['project'],
    endpoint:'/tqs/bills/ap-aging',
    dataKey:'data',
    columns:[
      { key:'vendor_name', label:'Vendor' },
      { key:'current',     label:'0-30 Days (₹)',  type:'amount' },
      { key:'days_30',     label:'31-60 Days (₹)', type:'amount' },
      { key:'days_60',     label:'61-90 Days (₹)', type:'amount' },
      { key:'days_90',     label:'Unscheduled (₹)',type:'amount' },
      { key:'over_90',     label:'90+ Days (₹)',   type:'amount' },
      { key:'total',       label:'Total (₹)',      type:'amount' },
    ],
    // pivot individual bill rows into vendor-wise aging buckets
    aggregate: rows => {
      const m = {};
      rows.forEach(r => {
        const v = r.vendor_name || 'Unknown';
        if (!m[v]) m[v] = { vendor_name:v, current:0, days_30:0, days_60:0, days_90:0, over_90:0, total:0 };
        const amt = parseFloat(r.balance) || 0;
        const bucket = r.aging_bucket;
        if (bucket === '0-30')       m[v].current += amt;
        else if (bucket === '31-60') m[v].days_30  += amt;
        else if (bucket === '61-90') m[v].days_60  += amt;
        else if (bucket === '90+')   m[v].over_90  += amt;
        else                         m[v].days_90  += amt; // 'unscheduled'
        m[v].total += amt;
      });
      return Object.values(m).sort((a,b) => b.total - a.total);
    },
  },

  {
    key:'tqs-deduction-register', dept:'tqs', title:'Deduction Register', icon:ClipboardList, color:'indigo',
    desc:'Retention, advance recovery, TDS & deductions aggregated per subcontractor WO',
    filters:['dateRange','project'],
    endpoint:'/tqs/bills/deduction-register',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'wo_number',        label:'WO Number',       mono:true },
      { key:'vendor_name',      label:'Vendor' },
      { key:'bill_count',       label:'Bills',           type:'number' },
      { key:'gross_billed',     label:'Gross Billed (₹)',type:'amount' },
      { key:'retention_held',   label:'Retention (₹)',   type:'amount' },
      { key:'advance_recovered',label:'Adv. Recovered (₹)',type:'amount' },
      { key:'tds_deducted',     label:'TDS (₹)',         type:'amount' },
      { key:'total_deductions', label:'Total Ded. (₹)',  type:'amount' },
      { key:'net_payable',      label:'Net Payable (₹)', type:'amount' },
      { key:'total_paid',       label:'Paid (₹)',        type:'amount' },
    ],
  },
  {
    key:'tqs-wo-bill-register', dept:'tqs', title:'WO Bill Register', icon:FileText, color:'indigo',
    desc:'All RA bills for WOTQS subcontractor work orders with status',
    filters:['dateRange','project'],
    endpoint:'/tqs/bills',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'sl_number',       label:'Bill No',      mono:true },
      { key:'po_number',       label:'WO Number',    mono:true },
      { key:'vendor_name',     label:'Vendor' },
      { key:'inv_number',      label:'Invoice No',   mono:true },
      { key:'inv_date',        label:'Inv Date',     type:'date' },
      { key:'basic_amount',    label:'Basic (₹)',    type:'amount' },
      { key:'gst_amount',      label:'GST (₹)',      type:'amount' },
      { key:'total_amount',    label:'Total (₹)',    type:'amount' },
      { key:'workflow_status', label:'Status',       type:'status' },
    ],
    transform: rows => rows.filter(r => r.bill_type === 'wo' || /^WOTQS/i.test(r.po_number || '') || /^WOTQS/i.test(r.wo_number || '')),
  },
  {
    key:'tqs-advance-register', dept:'tqs', title:'Advance Register', icon:Wallet, color:'indigo',
    desc:'Advance vouchers issued to subcontractors — disbursed, recovered, outstanding',
    filters:['project'],
    endpoint:'/tqs/advances',
    dataKey:'data',
    columns:[
      { key:'sl_number',       label:'Voucher No',   mono:true },
      { key:'vendor_name',     label:'Vendor' },
      { key:'wo_number',       label:'WO Number',    mono:true },
      { key:'voucher_date',    label:'Date',         type:'date' },
      { key:'order_value',     label:'Order Value (₹)',type:'amount' },
      { key:'advance_value',   label:'Advance (₹)', type:'amount' },
      { key:'paid_amount',     label:'Disbursed (₹)',type:'amount' },
      { key:'recovered_amount',label:'Recovered (₹)',type:'amount' },
      { key:'status',          label:'Status',       type:'status' },
    ],
  },

  // ── Finance ──────────────────────────────────────────────────────────────────
  {
    key:'finance-tds', dept:'finance', title:'TDS Register', icon:FileText, color:'emerald',
    desc:'TDS deductions by vendor/entity with PAN and gross amounts',
    filters:['dateRange'],
    endpoint:'/reports/tds',
    dataKey:'data',
    columns:[
      { key:'entity_name',  label:'Vendor / Party' },
      { key:'entity_pan',   label:'PAN',           mono:true },
      { key:'gross_paid',   label:'Gross Paid (₹)', type:'amount' },
      { key:'tds_amount',   label:'TDS (₹)',        type:'amount' },
      { key:'transactions', label:'Txn Count',      type:'number' },
    ],
  },
  {
    key:'finance-payments', dept:'finance', title:'Payment Register', icon:Wallet, color:'emerald',
    desc:'All payments made with mode, reference, and amount',
    filters:['dateRange','project'],
    endpoint:'/payments',
    dataKey:'data',
    columns:[
      { key:'payment_date',     label:'Date',         type:'date' },
      { key:'entity_name',      label:'Vendor / Party' },
      { key:'amount',           label:'Amount (₹)',   type:'amount' },
      { key:'tds_deducted',     label:'TDS (₹)',      type:'amount' },
      { key:'net_amount',       label:'Net Paid (₹)', type:'amount' },
      { key:'payment_mode',     label:'Mode' },
      { key:'reference_number', label:'Reference',    mono:true },
      { key:'remarks',          label:'Remarks' },
    ],
  },
  {
    key:'finance-invoices', dept:'finance', title:'Vendor Payables', icon:Receipt, color:'emerald',
    desc:'Outstanding vendor invoices, due dates, and ageing',
    filters:['dateRange','project'],
    endpoint:'/invoices',
    dataKey:null,
    columns:[
      { key:'invoice_number', label:'Invoice No',  mono:true },
      { key:'vendor_name',    label:'Vendor' },
      { key:'invoice_date',   label:'Date',        type:'date' },
      { key:'total_amount',   label:'Amount (₹)',  type:'amount' },
      { key:'paid_amount',    label:'Paid (₹)',    type:'amount' },
      { key:'balance',        label:'Balance (₹)', type:'amount' },
      { key:'status',         label:'Status',      type:'status' },
    ],
  },

  // ── HR ────────────────────────────────────────────────────────────────────────
  {
    key:'hr-employees', dept:'hr', title:'Employee List', icon:Users, color:'violet',
    desc:'All employees with department, designation, and status',
    filters:[],
    endpoint:'/hr-admin/employees',
    dataKey:'data',
    columns:[
      { key:'employee_code', label:'Code',         mono:true },
      { key:'name',          label:'Name' },
      { key:'department',    label:'Department' },
      { key:'designation',   label:'Designation' },
      { key:'phone',         label:'Phone',        mono:true },
      { key:'role',          label:'Role',         type:'status' },
    ],
  },
  {
    key:'hr-payroll', dept:'hr', title:'Payroll Register', icon:IndianRupee, color:'violet',
    desc:'Monthly salary disbursement, deductions, and net pay',
    filters:['dateRange'],
    endpoint:'/hr-admin/payroll',
    dataKey:'data',
    columns:[
      { key:'employee_name',    label:'Employee' },
      { key:'employee_code',    label:'Code',            mono:true },
      { key:'basic',            label:'Basic (₹)',       type:'amount' },
      { key:'gross_earnings',   label:'Gross (₹)',       type:'amount' },
      { key:'total_deductions', label:'Deductions (₹)',  type:'amount' },
      { key:'net_pay',          label:'Net Pay (₹)',     type:'amount' },
      { key:'status',           label:'Status',          type:'status' },
    ],
  },

  // ── Procurement ───────────────────────────────────────────────────────────────
  // -- Purchase Requisition Reports --
  {
    key:'procurement-mrs-register', dept:'procurement', category:'Purchase Requisition Reports', title:'Purchase Requisition Register', icon:ClipboardList, color:'amber',
    desc:'All material requisitions with items, quantities, and status',
    filters:['dateRange','project'],
    endpoint:'/stores/mrs',
    dataKey:null,
    transform: rows => rows.map(r => ({
      ...r,
      requested_by: r.raised_by_name || r.requested_by,
      items_summary: summarizeItems(r.items),
      total_quantity: sumItemQuantity(r.items),
    })),
    columns:[
      { key:'mrs_number',     label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'project_name',   label:'Project' },
      { key:'requested_by',   label:'Requested By' },
      { key:'items_summary',  label:'Material' },
      { key:'total_quantity', label:'Total Qty',    type:'number' },
      { key:'status',         label:'Status',       type:'status' },
      { key:'created_at',     label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-mrs-pending', dept:'procurement', category:'Purchase Requisition Reports', title:'Pending Requisition Report', icon:Clock, color:'amber',
    desc:'Material requisitions awaiting approval',
    filters:['dateRange','project'],
    endpoint:'/stores/mrs',
    dataKey:null,
    transform: rows => rows
      .filter(r => r.status === 'pending')
      .map(r => ({
        ...r,
        requested_by: r.raised_by_name || r.requested_by,
        items_summary: summarizeItems(r.items),
        total_quantity: sumItemQuantity(r.items),
      })),
    columns:[
      { key:'mrs_number',     label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'project_name',   label:'Project' },
      { key:'requested_by',   label:'Requested By' },
      { key:'items_summary',  label:'Material' },
      { key:'total_quantity', label:'Total Qty',    type:'number' },
      { key:'created_at',     label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-mrs-approved', dept:'procurement', category:'Purchase Requisition Reports', title:'Approved Requisition Report', icon:CheckCircle2, color:'amber',
    desc:'Material requisitions that have been approved',
    filters:['dateRange','project'],
    endpoint:'/stores/mrs',
    dataKey:null,
    transform: rows => rows
      .filter(r => r.status === 'approved')
      .map(r => ({
        ...r,
        requested_by: r.raised_by_name || r.requested_by,
        approved_by: r.approved_by_name,
        items_summary: summarizeItems(r.items),
        total_quantity: sumItemQuantity(r.items),
      })),
    columns:[
      { key:'mrs_number',     label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'project_name',   label:'Project' },
      { key:'requested_by',   label:'Requested By' },
      { key:'approved_by',    label:'Approved By' },
      { key:'items_summary',  label:'Material' },
      { key:'total_quantity', label:'Total Qty',    type:'number' },
      { key:'created_at',     label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-mrs-rejected', dept:'procurement', category:'Purchase Requisition Reports', title:'Rejected Requisition Report', icon:AlertTriangle, color:'amber',
    desc:'Material requisitions that have been rejected',
    filters:['dateRange','project'],
    endpoint:'/stores/mrs',
    dataKey:null,
    transform: rows => rows
      .filter(r => r.status === 'rejected')
      .map(r => ({
        ...r,
        requested_by: r.raised_by_name || r.requested_by,
        items_summary: summarizeItems(r.items),
        total_quantity: sumItemQuantity(r.items),
      })),
    columns:[
      { key:'mrs_number',     label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'project_name',   label:'Project' },
      { key:'requested_by',   label:'Requested By' },
      { key:'items_summary',  label:'Material' },
      { key:'total_quantity', label:'Total Qty',    type:'number' },
      { key:'created_at',     label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-mrs-project-wise', dept:'procurement', category:'Purchase Requisition Reports', title:'Project-wise Requisition Report', icon:Layers, color:'amber',
    desc:'Requisition counts and quantities grouped by project',
    filters:['dateRange'],
    endpoint:'/stores/mrs',
    dataKey:null,
    aggregate: rows => {
      const m = {};
      rows.forEach(r => {
        const key = r.project_name || 'Unknown';
        if (!m[key]) m[key] = { project_name:key, total_requisitions:0, pending:0, approved:0, rejected:0, total_quantity:0 };
        m[key].total_requisitions++;
        if (r.status === 'pending')  m[key].pending++;
        if (r.status === 'approved') m[key].approved++;
        if (r.status === 'rejected') m[key].rejected++;
        m[key].total_quantity += sumItemQuantity(r.items);
      });
      return Object.values(m).sort((a,b) => b.total_requisitions - a.total_requisitions);
    },
    columns:[
      { key:'project_name',      label:'Project' },
      { key:'total_requisitions',label:'Total MRS',    type:'number' },
      { key:'pending',           label:'Pending',      type:'number' },
      { key:'approved',          label:'Approved',     type:'number' },
      { key:'rejected',          label:'Rejected',     type:'number' },
      { key:'total_quantity',    label:'Total Qty',    type:'number' },
    ],
  },

  // -- RFQ Reports --
  {
    key:'procurement-rfq-register', dept:'procurement', category:'RFQ Reports', title:'RFQ Register', icon:Send, color:'amber',
    desc:'All RFQs issued to vendors with response status',
    filters:['dateRange','project'],
    endpoint:'/quotations/rfqs',
    dataKey:null,
    columns:[
      { key:'rfq_number',   label:'RFQ No',       mono:true },
      { key:'mrs_number',   label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'project_name', label:'Project' },
      { key:'due_date',     label:'Due Date',     type:'date' },
      { key:'vendor_count', label:'Vendors Invited', type:'number' },
      { key:'quote_count',  label:'Quotes Received', type:'number' },
      { key:'status',       label:'Status',       type:'status' },
      { key:'created_at',   label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-rfq-pending', dept:'procurement', category:'RFQ Reports', title:'RFQ Pending Report', icon:Clock, color:'amber',
    desc:'RFQs awaiting vendor responses',
    filters:['project'],
    endpoint:'/quotations/rfqs',
    dataKey:null,
    transform: rows => rows.filter(r => Number(r.quote_count || 0) < Number(r.vendor_count || 0)),
    columns:[
      { key:'rfq_number',   label:'RFQ No',       mono:true },
      { key:'mrs_number',   label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'project_name', label:'Project' },
      { key:'due_date',     label:'Due Date',     type:'date' },
      { key:'vendor_count', label:'Vendors Invited', type:'number' },
      { key:'quote_count',  label:'Quotes Received', type:'number' },
      { key:'status',       label:'Status',       type:'status' },
    ],
  },

  {
    key:'procurement-rfq-comparison', dept:'procurement', category:'RFQ Reports', title:'RFQ Comparison / Vendor Participation', icon:Users, color:'amber',
    desc:'Vendor-wise RFQ invitations, response rate, quotes submitted, and L1 wins',
    filters:[],
    endpoint:'/quotations/vendor-participation',
    dataKey:'data',
    columns:[
      { key:'vendor_name',        label:'Vendor' },
      { key:'rfqs_invited',       label:'RFQs Invited',    type:'number' },
      { key:'rfqs_responded',     label:'RFQs Responded',  type:'number' },
      { key:'response_rate_pct',  label:'Response Rate %', type:'number' },
      { key:'quotes_submitted',   label:'Quotes Submitted',type:'number' },
      { key:'l1_wins',            label:'L1 Wins',         type:'number' },
      { key:'win_rate_pct',       label:'Win Rate %',      type:'number' },
    ],
  },

  // -- Quotation Reports --
  {
    key:'procurement-quotation-register', dept:'procurement', category:'Quotation Reports', title:'Vendor Quotation Report', icon:FileText, color:'amber',
    desc:'All vendor quotations received against requisitions',
    filters:['dateRange','project'],
    endpoint:'/quotations',
    dataKey:null,
    columns:[
      { key:'quotation_number', label:'Quotation No', mono:true },
      { key:'mrs_number',       label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'vendor_name',      label:'Vendor' },
      { key:'unit_rate',        label:'Unit Rate (₹)',type:'amount' },
      { key:'gst_rate',         label:'GST %',        type:'number' },
      { key:'delivery_days',    label:'Delivery (Days)', type:'number' },
      { key:'is_selected',      label:'Selected',     type:'status' },
      { key:'created_at',       label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-comparative-statement', dept:'procurement', category:'Quotation Reports', title:'Comparative Statement Report', icon:BarChart3, color:'amber',
    desc:'Vendor-wise comparative statement summary for each requisition — L1, L2, and highest bid',
    filters:['dateRange','project'],
    endpoint:'/quotations/cs-summary',
    dataKey:'data',
    columns:[
      { key:'mrs_number',     label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'project_name',   label:'Project' },
      { key:'vendor_count',   label:'Vendors Quoted', type:'number' },
      { key:'l1_vendor',      label:'L1 Vendor' },
      { key:'l1_amount',      label:'L1 Amount (₹)', type:'amount' },
      { key:'l2_vendor',      label:'L2 Vendor' },
      { key:'l2_amount',      label:'L2 Amount (₹)', type:'amount' },
      { key:'cs_status',      label:'CS Status',     type:'status' },
      { key:'created_at',     label:'Date',          type:'date' },
    ],
    chart:{ type:'bar', xKey:'mrs_number', limit:8, bars:[
      { key:'l1_amount',      label:'L1 Amount (₹)' },
      { key:'highest_amount', label:'Highest Quote (₹)' },
    ] },
  },
  {
    key:'procurement-l1-vendor', dept:'procurement', category:'Quotation Reports', title:'L1 Vendor Report', icon:Target, color:'amber',
    desc:'Lowest (L1) bidder selected for each requisition',
    filters:['dateRange','project'],
    endpoint:'/quotations/cs-summary',
    dataKey:'data',
    transform: rows => rows.filter(r => r.l1_vendor),
    columns:[
      { key:'mrs_number',   label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'project_name', label:'Project' },
      { key:'l1_vendor',    label:'L1 Vendor' },
      { key:'l1_amount',    label:'L1 Amount (₹)', type:'amount' },
      { key:'vendor_count', label:'Vendors Quoted', type:'number' },
      { key:'cs_status',    label:'CS Status',     type:'status' },
      { key:'created_at',   label:'Date',          type:'date' },
    ],
  },
  {
    key:'procurement-negotiation-savings', dept:'procurement', category:'Quotation Reports', title:'Negotiation Savings Report', icon:DollarSign, color:'amber',
    desc:'Savings achieved between the highest quoted amount and the finalized L1 amount',
    filters:['dateRange','project'],
    endpoint:'/quotations/cs-summary',
    dataKey:'data',
    transform: rows => rows.filter(r => r.l1_vendor && r.savings_amount > 0),
    columns:[
      { key:'mrs_number',      label:'MRS No',       mono:true, keys:['serial_no_formatted'] },
      { key:'project_name',    label:'Project' },
      { key:'l1_vendor',       label:'L1 Vendor' },
      { key:'l1_amount',       label:'L1 Amount (₹)', type:'amount' },
      { key:'highest_amount',  label:'Highest Quote (₹)', type:'amount' },
      { key:'savings_amount',  label:'Savings (₹)',   type:'amount' },
      { key:'savings_pct',     label:'Savings %',     type:'number' },
    ],
  },

  {
    key:'procurement-savings', dept:'procurement', category:'Quotation Reports', title:'Procurement Savings Report', icon:TrendingUp, color:'amber',
    desc:'Savings from negotiation — highest quoted rate vs selected vendor rate, per material',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/savings',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'mrs_number',       label:'MRS No',         mono:true },
      { key:'project_name',     label:'Project' },
      { key:'mrs_date',         label:'Date',           type:'date' },
      { key:'material_name',    label:'Material' },
      { key:'unit',             label:'Unit' },
      { key:'qty',              label:'Qty',            type:'number' },
      { key:'vendor_count',     label:'Vendors Quoted', type:'number' },
      { key:'highest_rate',     label:'Highest Rate (₹)', type:'amount' },
      { key:'selected_rate',    label:'Selected Rate (₹)', type:'amount' },
      { key:'selected_vendor',  label:'Selected Vendor' },
      { key:'savings_per_unit', label:'Saving/Unit (₹)', type:'amount' },
      { key:'total_savings',    label:'Total Saving (₹)', type:'amount' },
      { key:'pct_savings',      label:'% Saving',       type:'number' },
    ],
    chart:{ type:'bar', xKey:'material_name', limit:8, bars:[{ key:'total_savings', label:'Total Savings (₹)', type:'amount' }] },
  },

  // -- Purchase Order Reports --
  {
    key:'procurement-po', dept:'procurement', category:'Purchase Order Reports', title:'Purchase Order Register', icon:FileText, color:'amber',
    desc:'All POs with vendor, project, value, and status',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders',
    dataKey:null,
    columns:[
      { key:'po_number',     label:'PO No',        mono:true, keys:['serial_no_formatted'] },
      { key:'vendor_name',   label:'Vendor' },
      { key:'project_name',  label:'Project' },
      { key:'sub_total',     label:'Sub Total (₹)',type:'amount' },
      { key:'total_gst',     label:'GST (₹)',      type:'amount' },
      { key:'grand_total',   label:'Grand Total (₹)', type:'amount' },
      { key:'status',        label:'Status',       type:'status' },
      { key:'po_date',       label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-po-open', dept:'procurement', category:'Purchase Order Reports', title:'Open PO Report', icon:FileText, color:'amber',
    desc:'POs that are active and not yet rejected or cancelled',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders',
    dataKey:null,
    transform: rows => rows.filter(r => !['rejected','cancelled'].includes(r.status)),
    columns:[
      { key:'po_number',     label:'PO No',        mono:true, keys:['serial_no_formatted'] },
      { key:'vendor_name',   label:'Vendor' },
      { key:'project_name',  label:'Project' },
      { key:'grand_total',   label:'Grand Total (₹)', type:'amount' },
      { key:'status',        label:'Status',       type:'status' },
      { key:'po_date',       label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-po-pending-approval', dept:'procurement', category:'Purchase Order Reports', title:'Pending Approval PO Report', icon:Clock, color:'amber',
    desc:'POs awaiting procurement or management approval',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders',
    dataKey:null,
    transform: rows => rows.filter(r => ['pending','verified_audit','released_mgmt'].includes(r.status)),
    columns:[
      { key:'po_number',     label:'PO No',        mono:true, keys:['serial_no_formatted'] },
      { key:'vendor_name',   label:'Vendor' },
      { key:'project_name',  label:'Project' },
      { key:'grand_total',   label:'Grand Total (₹)', type:'amount' },
      { key:'status',        label:'Status',       type:'status' },
      { key:'po_date',       label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-po-cancelled', dept:'procurement', category:'Purchase Order Reports', title:'Cancelled / Rejected PO Report', icon:AlertTriangle, color:'amber',
    desc:'POs that have been rejected or cancelled',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders',
    dataKey:null,
    transform: rows => rows.filter(r => ['rejected','cancelled'].includes(r.status)),
    columns:[
      { key:'po_number',     label:'PO No',        mono:true, keys:['serial_no_formatted'] },
      { key:'vendor_name',   label:'Vendor' },
      { key:'project_name',  label:'Project' },
      { key:'grand_total',   label:'Grand Total (₹)', type:'amount' },
      { key:'status',        label:'Status',       type:'status' },
      { key:'po_date',       label:'Date',         type:'date' },
    ],
  },
  {
    key:'procurement-closed-po', dept:'procurement', category:'Purchase Order Reports', title:'Closed PO Report', icon:CheckCircle2, color:'amber',
    desc:'Fully received and cancelled POs — closure lead time and total received value',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/closed-po',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'po_number',             label:'PO No',          mono:true },
      { key:'vendor_name',           label:'Vendor' },
      { key:'project_name',          label:'Project' },
      { key:'po_date',               label:'PO Date',        type:'date' },
      { key:'status',                label:'Status',         type:'status' },
      { key:'grand_total',           label:'PO Value (₹)',   type:'amount' },
      { key:'total_received_value',  label:'Received (₹)',   type:'amount' },
      { key:'closure_date',          label:'Closed On',      type:'date' },
      { key:'closure_lead_days',     label:'Lead Days',      type:'number' },
    ],
  },
  {
    key:'procurement-po-vendor-wise', dept:'procurement', category:'Purchase Order Reports', title:'Vendor-wise PO Report', icon:Star, color:'amber',
    desc:'PO count and value grouped by vendor',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders',
    dataKey:null,
    aggregate: rows => {
      const m = {};
      rows.forEach(r => {
        const key = r.vendor_name || 'Unknown';
        if (!m[key]) m[key] = { vendor_name:key, po_count:0, sub_total:0, total_gst:0, grand_total:0 };
        m[key].po_count++;
        m[key].sub_total   += parseFloat(r.sub_total)   || 0;
        m[key].total_gst   += parseFloat(r.total_gst)   || 0;
        m[key].grand_total += parseFloat(r.grand_total) || 0;
      });
      return Object.values(m).sort((a,b) => b.grand_total - a.grand_total);
    },
    columns:[
      { key:'vendor_name',  label:'Vendor' },
      { key:'po_count',     label:'No. of POs',   type:'number' },
      { key:'sub_total',    label:'Sub Total (₹)',type:'amount' },
      { key:'total_gst',    label:'GST (₹)',      type:'amount' },
      { key:'grand_total',  label:'Grand Total (₹)', type:'amount' },
    ],
  },
  {
    key:'procurement-po-project-wise', dept:'procurement', category:'Purchase Order Reports', title:'Project-wise PO Report', icon:Layers, color:'amber',
    desc:'PO count and value grouped by project',
    filters:['dateRange'],
    endpoint:'/purchase-orders',
    dataKey:null,
    aggregate: rows => {
      const m = {};
      rows.forEach(r => {
        const key = r.project_name || 'Unknown';
        if (!m[key]) m[key] = { project_name:key, po_count:0, grand_total:0 };
        m[key].po_count++;
        m[key].grand_total += parseFloat(r.grand_total) || 0;
      });
      return Object.values(m).sort((a,b) => b.grand_total - a.grand_total);
    },
    columns:[
      { key:'project_name', label:'Project' },
      { key:'po_count',     label:'No. of POs',   type:'number' },
      { key:'grand_total',  label:'Grand Total (₹)', type:'amount' },
    ],
  },
  {
    key:'procurement-po-monthly', dept:'procurement', category:'Purchase Order Reports', title:'Monthly PO Analysis Report', icon:TrendingUp, color:'amber',
    desc:'PO count and value trend by month',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders',
    dataKey:null,
    aggregate: rows => {
      const m = {};
      rows.forEach(r => {
        const d = r.po_date || r.created_at;
        const key = d ? String(d).slice(0,7) : 'Unknown';
        if (!m[key]) m[key] = { month:key, po_count:0, grand_total:0 };
        m[key].po_count++;
        m[key].grand_total += parseFloat(r.grand_total) || 0;
      });
      return Object.values(m).sort((a,b) => a.month.localeCompare(b.month));
    },
    columns:[
      { key:'month',       label:'Month' },
      { key:'po_count',    label:'No. of POs',   type:'number' },
      { key:'grand_total', label:'Grand Total (₹)', type:'amount' },
    ],
    chart:{ type:'bar', xKey:'month', bars:[{ key:'grand_total', label:'Grand Total (₹)', type:'amount' }] },
  },

  // -- Delivery Reports --
  {
    key:'procurement-item-wise-po', dept:'procurement', category:'Delivery Reports', title:'Item-wise PO Report', icon:PackageCheck, color:'amber',
    desc:'Line-item level PO data with ordered, received, and remaining quantities',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders/items-report',
    dataKey:'data',
    columns:[
      { key:'po_number',          label:'PO No',        mono:true, keys:['serial_no_formatted'] },
      { key:'vendor_name',        label:'Vendor' },
      { key:'project_name',       label:'Project' },
      { key:'material_name',      label:'Material' },
      { key:'unit',                label:'Unit' },
      { key:'quantity',            label:'Ordered Qty', type:'number' },
      { key:'received_quantity',   label:'Received Qty',type:'number' },
      { key:'remaining_quantity',  label:'Remaining Qty', type:'number' },
      { key:'total_amount',        label:'Amount (₹)',  type:'amount' },
      { key:'delivery_status',     label:'Status',      type:'status' },
    ],
    chart:{ type:'pie', groupBy:'delivery_status', label:'Delivery Status' },
  },
  {
    key:'procurement-pending-delivery', dept:'procurement', category:'Delivery Reports', title:'Pending Delivery Report', icon:Clock, color:'amber',
    desc:'PO line items with quantities yet to be delivered',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders/items-report',
    dataKey:'data',
    transform: rows => rows.filter(r => r.delivery_status !== 'Completed'),
    columns:[
      { key:'po_number',          label:'PO No',        mono:true, keys:['serial_no_formatted'] },
      { key:'vendor_name',        label:'Vendor' },
      { key:'project_name',       label:'Project' },
      { key:'material_name',      label:'Material' },
      { key:'unit',                label:'Unit' },
      { key:'quantity',            label:'Ordered Qty', type:'number' },
      { key:'received_quantity',   label:'Received Qty',type:'number' },
      { key:'remaining_quantity',  label:'Remaining Qty', type:'number' },
      { key:'delivery_date',       label:'Due Date',    type:'date' },
      { key:'delivery_status',     label:'Status',      type:'status' },
    ],
  },
  {
    key:'procurement-overdue-delivery', dept:'procurement', category:'Delivery Reports', title:'Overdue Delivery Report', icon:AlertTriangle, color:'amber',
    desc:'PO line items pending delivery past the committed delivery date',
    filters:['project'],
    endpoint:'/purchase-orders/items-report',
    dataKey:'data',
    transform: rows => rows.filter(r =>
      r.delivery_status !== 'Completed' &&
      r.delivery_date && new Date(r.delivery_date) < new Date()
    ),
    columns:[
      { key:'po_number',          label:'PO No',        mono:true, keys:['serial_no_formatted'] },
      { key:'vendor_name',        label:'Vendor' },
      { key:'project_name',       label:'Project' },
      { key:'material_name',      label:'Material' },
      { key:'remaining_quantity',  label:'Remaining Qty', type:'number' },
      { key:'delivery_date',       label:'Due Date',    type:'date' },
      { key:'delivery_status',     label:'Status',      type:'status' },
    ],
  },

  {
    key:'procurement-lead-time', dept:'procurement', category:'Delivery Reports', title:'Procurement Lead Time Report', icon:Activity, color:'amber',
    desc:'Time from MRS creation to PO to first GRN — identifies bottlenecks per MRS/PO',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/lead-time',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'mrs_number',         label:'MRS No',        mono:true },
      { key:'po_number',          label:'PO No',         mono:true },
      { key:'project_name',       label:'Project' },
      { key:'vendor_name',        label:'Vendor' },
      { key:'mrs_date',           label:'MRS Date',      type:'date' },
      { key:'po_date',            label:'PO Date',       type:'date' },
      { key:'first_grn_date',     label:'First GRN',     type:'date' },
      { key:'mrs_to_po_days',     label:'MRS→PO (days)', type:'number' },
      { key:'po_to_receipt_days', label:'PO→GRN (days)', type:'number' },
      { key:'total_lead_days',    label:'Total (days)',   type:'number' },
    ],
    chart:{ type:'bar', xKey:'po_number', limit:10, bars:[
      { key:'mrs_to_po_days',     label:'MRS→PO' },
      { key:'po_to_receipt_days', label:'PO→GRN' },
    ]},
  },

  // -- Vendor Reports --
  {
    key:'procurement-vendor', dept:'procurement', category:'Vendor Reports', title:'Vendor Master Report', icon:Star, color:'amber',
    desc:'Vendors with contact, category, and status — optionally filtered to those mapped to a project',
    filters:['project'],
    endpoint:'/vendors',
    dataKey:null,
    columns:[
      { key:'name',          label:'Vendor' },
      { key:'contact_person',label:'Contact' },
      { key:'phone',         label:'Phone',        mono:true },
      { key:'email',         label:'Email' },
      { key:'category',      label:'Category',     keys:['vendor_type'] },
      { key:'status',        label:'Status',       type:'status' },
    ],
  },
  {
    key:'procurement-vendor-performance', dept:'procurement', category:'Vendor Reports', title:'Vendor Performance Report', icon:TrendingUp, color:'amber',
    desc:'PO value, delivery timeliness, and invoicing per vendor',
    filters:[],
    endpoint:'/vendors/performance',
    dataKey:null,
    columns:[
      { key:'vendor',           label:'Vendor' },
      { key:'vendor_type',      label:'Category' },
      { key:'po_count',         label:'No. of POs',   type:'number' },
      { key:'po_value',         label:'PO Value (₹)', type:'amount' },
      { key:'grn_count',        label:'GRNs',         type:'number' },
      { key:'on_time_count',    label:'On-Time GRNs', type:'number' },
      { key:'delayed_count',    label:'Delayed GRNs', type:'number' },
      { key:'invoice_count',    label:'Invoices',     type:'number' },
      { key:'invoice_value',    label:'Invoice Value (₹)', type:'amount' },
    ],
  },
  {
    key:'procurement-vendor-rating', dept:'procurement', category:'Vendor Reports', title:'Vendor Rating Report', icon:Star, color:'amber',
    desc:'Overall vendor score based on delivery, quality, and pricing performance',
    filters:[],
    endpoint:'/vendors/performance',
    dataKey:null,
    columns:[
      { key:'vendor',     label:'Vendor' },
      { key:'vendor_type',label:'Category' },
      { key:'delivery',   label:'Delivery Score', type:'number' },
      { key:'quality',    label:'Quality Score',  type:'number' },
      { key:'pricing',    label:'Pricing Score',  type:'number' },
      { key:'overall',    label:'Overall Score',  type:'number' },
      { key:'tag',        label:'Rating',         type:'status' },
      { key:'remarks',    label:'Remarks' },
    ],
    chart:{ type:'bar', xKey:'vendor', limit:10, bars:[
      { key:'delivery', label:'Delivery' },
      { key:'quality',  label:'Quality' },
      { key:'pricing',  label:'Pricing' },
    ] },
  },
  {
    key:'procurement-vendor-lead-time', dept:'procurement', category:'Vendor Reports', title:'Vendor Lead Time Analysis', icon:Clock, color:'amber',
    desc:'Average lead time (PO date to GRN date) per vendor',
    filters:[],
    endpoint:'/vendors/performance',
    dataKey:null,
    transform: rows => rows.filter(r => r.avgLeadDays != null),
    columns:[
      { key:'vendor',       label:'Vendor' },
      { key:'vendor_type',  label:'Category' },
      { key:'grnCount',     label:'GRNs',           type:'number', keys:['grn_count'] },
      { key:'avgLeadDays',  label:'Avg Lead Time (Days)', type:'number' },
      { key:'onTimeCount',  label:'On-Time GRNs',   type:'number', keys:['on_time_count'] },
      { key:'delayedCount', label:'Delayed GRNs',   type:'number', keys:['delayed_count'] },
    ],
  },

  // -- Cost Analysis Reports --
  {
    key:'procurement-cost-analysis', dept:'procurement', category:'Cost Analysis Reports', title:'Purchase Cost Analysis', icon:IndianRupee, color:'amber',
    desc:'Material-wise purchase value, quantity, and average rate across all POs',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders/items-report',
    dataKey:'data',
    aggregate: rows => {
      const m = {};
      rows.forEach(r => {
        const key = r.material_name || 'Unknown';
        if (!m[key]) m[key] = { material_name: key, unit: r.unit, total_quantity: 0, total_amount: 0, po_count: 0 };
        m[key].total_quantity += parseFloat(r.quantity) || 0;
        m[key].total_amount += parseFloat(r.total_amount) || 0;
        m[key].po_count += 1;
      });
      return Object.values(m).map(r => ({
        ...r,
        avg_rate: r.total_quantity > 0 ? r.total_amount / r.total_quantity : 0,
      })).sort((a, b) => b.total_amount - a.total_amount);
    },
    columns:[
      { key:'material_name', label:'Material' },
      { key:'unit',           label:'Unit' },
      { key:'po_count',       label:'No. of POs',   type:'number' },
      { key:'total_quantity', label:'Total Qty',    type:'number' },
      { key:'avg_rate',       label:'Avg Rate (₹)', type:'amount' },
      { key:'total_amount',   label:'Total Amount (₹)', type:'amount' },
    ],
    chart:{ type:'bar', xKey:'material_name', limit:8, bars:[{ key:'total_amount', label:'Total Amount (₹)', type:'amount' }] },
  },
  {
    key:'procurement-material-price-trend', dept:'procurement', category:'Cost Analysis Reports', title:'Material Price Trend Report', icon:TrendingUp, color:'amber',
    desc:'Chronological rate history for each material across purchase orders',
    filters:['dateRange','project'],
    endpoint:'/purchase-orders/items-report',
    dataKey:'data',
    transform: rows => [...rows].sort((a, b) =>
      (a.material_name || '').localeCompare(b.material_name || '') ||
      new Date(a.po_date || 0) - new Date(b.po_date || 0)
    ),
    columns:[
      { key:'material_name', label:'Material' },
      { key:'po_date',       label:'PO Date',    type:'date' },
      { key:'po_number',     label:'PO No',      mono:true, keys:['serial_no_formatted'] },
      { key:'vendor_name',   label:'Vendor' },
      { key:'unit',          label:'Unit' },
      { key:'rate',          label:'Rate (₹)',   type:'amount' },
    ],
  },
  {
    key:'procurement-budget-vs-actual', dept:'procurement', category:'Cost Analysis Reports', title:'Budget vs Actual Procurement Cost Report', icon:Wallet, color:'amber',
    desc:'Budgeted vs actual cost per project cost head, with PO spend and variance',
    filters:['project'],
    endpoint:'/reports/budget-vs-actual-procurement',
    dataKey:'data',
    columns:[
      { key:'project_name',     label:'Project' },
      { key:'cost_head',        label:'Cost Head' },
      { key:'budgeted_amount',  label:'Budgeted (₹)', type:'amount' },
      { key:'actual_amount',    label:'Actual (₹)',   type:'amount' },
      { key:'po_spend',         label:'PO Spend (₹)', type:'amount' },
      { key:'variance_amount',  label:'Variance (₹)', type:'amount' },
      { key:'variance_pct',     label:'Variance %',   type:'number' },
    ],
  },
  {
    key:'procurement-costhead-analysis', dept:'procurement', category:'Cost Analysis Reports', title:'Procurement Spend by Cost Head', icon:DollarSign, color:'amber',
    desc:'PO spend grouped by cost category — vs budgeted amount, % consumed, and variance',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/costhead-analysis',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'project_name',     label:'Project' },
      { key:'cost_head',        label:'Cost Head' },
      { key:'po_count',         label:'POs',              type:'number' },
      { key:'budgeted_amount',  label:'Budgeted (₹)',     type:'amount' },
      { key:'procured_value',   label:'Procured (₹)',     type:'amount' },
      { key:'pct_consumed',     label:'% Consumed',       type:'number' },
      { key:'variance',         label:'Variance (₹)',     type:'amount' },
    ],
    chart:{ type:'bar', xKey:'cost_head', limit:8, bars:[
      { key:'budgeted_amount', label:'Budgeted (₹)',  type:'amount' },
      { key:'procured_value',  label:'Procured (₹)',  type:'amount' },
    ]},
  },
  {
    key:'procurement-budget-vs-procurement', dept:'procurement', category:'Cost Analysis Reports', title:'Budget vs Procurement (Detail)', icon:ArrowUpRight, color:'amber',
    desc:'Cost-head breakdown: budgeted vs PO committed vs GRN received vs bill-paid actual',
    filters:['project'],
    endpoint:'/reports/procurement/budget-vs-procurement',
    dataKey:'data',
    columns:[
      { key:'project_name',      label:'Project' },
      { key:'cost_head',         label:'Cost Head' },
      { key:'budgeted_amount',   label:'Budgeted (₹)',   type:'amount' },
      { key:'committed_value',   label:'PO Committed (₹)', type:'amount' },
      { key:'committed_pct',     label:'Committed %',    type:'number' },
      { key:'received_value',    label:'GRN Received (₹)', type:'amount' },
      { key:'bill_paid_actual',  label:'Bill-paid (₹)',  type:'amount' },
      { key:'remaining_budget',  label:'Remaining (₹)',  type:'amount' },
    ],
  },
  {
    key:'procurement-rate-contract-utilization', dept:'procurement', category:'Cost Analysis Reports', title:'Rate Contract Utilization Report', icon:CreditCard, color:'amber',
    desc:'Actual PO rates compared against benchmark/contract rates, with variance and compliance',
    filters:['dateRange','project'],
    endpoint:'/live-rates/utilization',
    dataKey:'data',
    columns:[
      { key:'material_name',  label:'Material' },
      { key:'po_number',      label:'PO No',          mono:true },
      { key:'vendor_name',    label:'Vendor' },
      { key:'po_rate',        label:'PO Rate (₹)',    type:'amount' },
      { key:'benchmark_rate', label:'Benchmark Rate (₹)', type:'amount' },
      { key:'variance_pct',   label:'Variance %',     type:'number' },
      { key:'compliance',     label:'Compliance',     type:'status' },
      { key:'po_date',        label:'Date',           type:'date' },
    ],
  },

  {
    key:'procurement-pending-pr', dept:'procurement', title:'Pending Purchase Requisitions', icon:ClipboardList, color:'amber',
    desc:'MRS items with un-ordered balance qty — drives PO creation priority',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/pending-pr',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'mrs_number',    label:'MRS No',         mono:true },
      { key:'project_name',  label:'Project' },
      { key:'raised_by',     label:'Raised By' },
      { key:'material_name', label:'Material' },
      { key:'unit',          label:'Unit' },
      { key:'requested_qty', label:'Requested Qty',  type:'number' },
      { key:'ordered_qty',   label:'Ordered Qty',    type:'number' },
      { key:'balance_qty',   label:'Balance Qty',    type:'number' },
      { key:'priority',      label:'Priority',       type:'status' },
      { key:'days_pending',  label:'Days Pending',   type:'number' },
      { key:'required_by',   label:'Required By',    type:'date' },
    ],
  },
  {
    key:'procurement-pr-approval', dept:'procurement', title:'PR Approval Status', icon:Clock, color:'amber',
    desc:'Requisitions stuck in approval pipeline — identify bottlenecks by stage',
    filters:['project'],
    endpoint:'/reports/procurement/pr-approval-status',
    dataKey:'data',
    columns:[
      { key:'mrs_number',   label:'MRS No',      mono:true },
      { key:'project_name', label:'Project' },
      { key:'raised_by',    label:'Raised By' },
      { key:'status',       label:'Stage',        type:'status' },
      { key:'priority',     label:'Priority',     type:'status' },
      { key:'item_count',   label:'Items',        type:'number' },
      { key:'days_open',    label:'Days Open',    type:'number' },
    ],
  },
  {
    key:'procurement-open-pos', dept:'procurement', title:'Open PO Report', icon:Target, color:'amber',
    desc:'POs with pending delivery — ordered vs received vs pending value',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/open-pos',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'po_number',     label:'PO No',            mono:true },
      { key:'vendor_name',   label:'Vendor' },
      { key:'project_name',  label:'Project' },
      { key:'po_date',       label:'PO Date',           type:'date' },
      { key:'status',        label:'Status',            type:'status' },
      { key:'ordered_qty',   label:'Ordered Qty',       type:'number' },
      { key:'received_qty',  label:'Received Qty',      type:'number' },
      { key:'pending_qty',   label:'Pending Qty',       type:'number' },
      { key:'pending_value', label:'Pending Value (₹)', type:'amount' },
    ],
  },
  {
    key:'procurement-pending-delivery', dept:'procurement', title:'Pending Delivery Report', icon:Truck, color:'amber',
    desc:'Item-level materials still due from vendors — flags overdue lines',
    filters:['project'],
    endpoint:'/reports/procurement/pending-delivery',
    dataKey:'data',
    columns:[
      { key:'po_number',     label:'PO No',           mono:true },
      { key:'vendor_name',   label:'Vendor' },
      { key:'material_name', label:'Material' },
      { key:'unit',          label:'Unit' },
      { key:'ordered_qty',   label:'Ordered Qty',     type:'number' },
      { key:'received_qty',  label:'Received Qty',    type:'number' },
      { key:'pending_qty',   label:'Pending Qty',     type:'number' },
      { key:'req_date',      label:'Required Date',   type:'date' },
      { key:'days_overdue',  label:'Days Overdue',    type:'number' },
      { key:'project_name',  label:'Project' },
    ],
  },
  {
    key:'procurement-po-aging', dept:'procurement', title:'PO Aging Report', icon:Calendar, color:'amber',
    desc:'Open POs bucketed by age — surface stale orders needing vendor follow-up',
    filters:['project'],
    endpoint:'/reports/procurement/po-aging',
    dataKey:'data',
    columns:[
      { key:'po_number',    label:'PO No',          mono:true },
      { key:'vendor_name',  label:'Vendor' },
      { key:'project_name', label:'Project' },
      { key:'po_date',      label:'PO Date',         type:'date' },
      { key:'status',       label:'Status',          type:'status' },
      { key:'age_days',     label:'Age (Days)',      type:'number' },
      { key:'aging_bucket', label:'Aging Bucket' },
      { key:'open_value',   label:'Open Value (₹)',  type:'amount' },
    ],
  },
  {
    key:'procurement-vendor-performance', dept:'procurement', title:'Vendor Performance', icon:Star, color:'amber',
    desc:'GRN acceptance rate, rejection rate and total spend per vendor',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/vendor-performance',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'vendor_name',    label:'Vendor' },
      { key:'po_count',       label:'POs',             type:'number' },
      { key:'total_value',    label:'Total Value (₹)', type:'amount' },
      { key:'grn_count',      label:'GRNs',            type:'number' },
      { key:'accepted_grns',  label:'Accepted GRNs',   type:'number' },
      { key:'rejected_grns',  label:'Rejected GRNs',   type:'number' },
      { key:'acceptance_pct', label:'Accept %' },
      { key:'rejection_pct',  label:'Reject %' },
    ],
  },
  {
    key:'procurement-vendor-spend', dept:'procurement', title:'Vendor-wise Spend Analysis', icon:IndianRupee, color:'amber',
    desc:'Total procurement spend by vendor with % share of company total',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/vendor-spend',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'vendor_name',  label:'Vendor' },
      { key:'po_count',     label:'POs',             type:'number' },
      { key:'total_value',  label:'Total Spend (₹)', type:'amount' },
      { key:'avg_value',    label:'Avg PO (₹)',      type:'amount' },
      { key:'spend_pct',    label:'Spend %' },
    ],
  },
  {
    key:'procurement-item-analysis', dept:'procurement', title:'Item-wise Purchase Analysis', icon:FileBarChart, color:'amber',
    desc:'Price trend by material — avg, min, max rates across all vendors and POs',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/item-analysis',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'material_name', label:'Material' },
      { key:'unit',          label:'Unit' },
      { key:'po_count',      label:'POs',             type:'number' },
      { key:'vendor_count',  label:'Vendors',         type:'number' },
      { key:'total_qty',     label:'Total Qty',       type:'number' },
      { key:'total_value',   label:'Total Value (₹)', type:'amount' },
      { key:'avg_rate',      label:'Avg Rate (₹)',    type:'amount' },
      { key:'min_rate',      label:'Min Rate (₹)',    type:'amount' },
      { key:'max_rate',      label:'Max Rate (₹)',    type:'amount' },
    ],
  },
  {
    key:'procurement-project-wise', dept:'procurement', title:'Project-wise Procurement', icon:Building2, color:'amber',
    desc:'PO count, total value, open commitment and vendor count per project',
    filters:['dateRange'],
    endpoint:'/reports/procurement/project-procurement',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'project_name',  label:'Project' },
      { key:'project_code',  label:'Code',            mono:true },
      { key:'po_count',      label:'POs',             type:'number' },
      { key:'vendor_count',  label:'Vendors',         type:'number' },
      { key:'total_value',   label:'Total Value (₹)', type:'amount' },
      { key:'open_value',    label:'Open Value (₹)',  type:'amount' },
      { key:'closed_value',  label:'Closed (₹)',      type:'amount' },
    ],
  },
  {
    key:'procurement-purchase-returns', dept:'procurement', title:'Purchase Return Register', icon:ArrowUpRight, color:'amber',
    desc:'Credit notes raised for vendor returns, rejections and price adjustments',
    filters:['dateRange','project'],
    endpoint:'/reports/procurement/purchase-returns',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'cn_number',     label:'CN No',            mono:true },
      { key:'cn_date',       label:'Date',             type:'date' },
      { key:'vendor_name',   label:'Vendor' },
      { key:'project_name',  label:'Project' },
      { key:'po_number',     label:'PO No',            mono:true },
      { key:'material_name', label:'Material' },
      { key:'quantity',      label:'Qty',              type:'number' },
      { key:'return_value',  label:'Return Value (₹)', type:'amount' },
      { key:'cn_type',       label:'Type',             type:'status' },
      { key:'status',        label:'Status',           type:'status' },
    ],
  },

  // ── Stores ────────────────────────────────────────────────────────────────────
  {
    key:'stores-grn', dept:'stores', title:'GRN Register', icon:PackageCheck, color:'teal',
    desc:'Goods received notes by vendor, material, and project',
    filters:['dateRange','project'],
    endpoint:'/grn',
    dataKey:null,
    columns:[
      { key:'grn_number',    label:'GRN No',       mono:true },
      { key:'vendor_name',   label:'Vendor' },
      { key:'items_summary', label:'Material',      keys:['material_name','item_name'] },
      { key:'report_quantity_received', label:'Qty Received', type:'number', keys:['total_quantity','quantity_received','received_qty'] },
      { key:'unit_summary',  label:'Unit',          keys:['unit'] },
      { key:'status',        label:'Status',        type:'status', keys:['quality_status'] },
      { key:'grn_date',      label:'Date',          type:'date', keys:['received_date'] },
      { key:'project_name',  label:'Project' },
    ],
  },
  {
    key:'stores-stock', dept:'stores', title:'Stock / Inventory Report', icon:Package, color:'teal',
    desc:'Current inventory levels and minimum stock alerts',
    filters:['project'],
    endpoint:'/inventory',
    dataKey:null,
    columns:[
      { key:'material_name', label:'Material',      keys:['item_name'] },
      { key:'category',      label:'Category' },
      { key:'closing_stock', label:'Stock',         type:'number', keys:['current_stock'] },
      { key:'unit',          label:'Unit' },
      { key:'minimum_level', label:'Min Stock',     type:'number', keys:['reorder_level','min_stock'] },
      { key:'site_location', label:'Location',      keys:['location'] },
    ],
  },
  {
    key:'stores-mrs', dept:'stores', title:'Material Requisition (MRS)', icon:ClipboardList, color:'teal',
    desc:'Material requisitions with approval and fulfilment status',
    filters:['dateRange','project'],
    endpoint:'/stores/mrs',
    dataKey:null,
    transform: rows => rows.map(r => ({
      ...r,
      requested_by: r.raised_by_name || r.requested_by,
      items_summary: summarizeItems(r.items),
      total_quantity: sumItemQuantity(r.items),
    })),
    columns:[
      { key:'mrs_number',    label:'MRS No',       mono:true },
      { key:'requested_by',  label:'Requested By' },
      { key:'items_summary', label:'Material' },
      { key:'total_quantity', label:'Total Qty',   type:'number' },
      { key:'department',    label:'Department' },
      { key:'status',        label:'Status',       type:'status' },
      { key:'created_at',    label:'Date',         type:'date' },
    ],
  },

  // ── Stores (new reports) ──────────────────────────────────────────────────────
  {
    key:'stores-pending-grn', dept:'stores', title:'Pending GRN Report', icon:Truck, color:'teal',
    desc:'PO line items where goods are due but GRN is missing or partial',
    filters:['project'],
    endpoint:'/reports/stores/pending-grn',
    dataKey:'data',
    columns:[
      { key:'po_number',     label:'PO No',         mono:true },
      { key:'vendor_name',   label:'Vendor' },
      { key:'material_name', label:'Material' },
      { key:'unit',          label:'Unit' },
      { key:'ordered_qty',   label:'Ordered Qty',   type:'number' },
      { key:'received_qty',  label:'Received Qty',  type:'number' },
      { key:'pending_qty',   label:'Pending Qty',   type:'number' },
      { key:'required_date', label:'Required Date', type:'date' },
      { key:'days_overdue',  label:'Days Overdue',  type:'number' },
      { key:'project_name',  label:'Project' },
    ],
  },
  {
    key:'stores-project-stock', dept:'stores', title:'Project-wise Stock Report', icon:Building2, color:'teal',
    desc:'Stock quantity and value summarised across projects',
    filters:['project'],
    endpoint:'/reports/stores/project-wise-stock',
    dataKey:'data',
    columns:[
      { key:'project_name',    label:'Project' },
      { key:'item_count',      label:'Items',         type:'number' },
      { key:'stock_value',     label:'Stock Value (₹)', type:'amount' },
      { key:'below_min_count', label:'Below Min',     type:'number' },
      { key:'share_pct',       label:'Share %',       type:'number' },
    ],
  },
  {
    key:'stores-site-consumption', dept:'stores', title:'Site-wise Consumption', icon:BarChart3, color:'teal',
    desc:'Material issued from store to each site or contractor',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/site-consumption',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'site_location',  label:'Site / Issued To' },
      { key:'material_name',  label:'Material' },
      { key:'unit',           label:'Unit' },
      { key:'project_name',   label:'Project' },
      { key:'qty_issued',     label:'Qty Issued',    type:'number' },
      { key:'value_issued',   label:'Value (₹)',     type:'amount' },
      { key:'min_count',      label:'MINs',          type:'number' },
    ],
  },
  {
    key:'stores-warehouse', dept:'stores', title:'Warehouse-wise Stock', icon:Layers, color:'teal',
    desc:'Stock holdings grouped by physical storage location',
    filters:['project'],
    endpoint:'/reports/stores/warehouse-stock',
    dataKey:'data',
    columns:[
      { key:'location',     label:'Location' },
      { key:'project_name', label:'Project' },
      { key:'item_count',   label:'Items',         type:'number' },
      { key:'total_qty',    label:'Total Qty',     type:'number' },
      { key:'stock_value',  label:'Stock Value (₹)', type:'amount' },
    ],
  },
  {
    key:'stores-valuation', dept:'stores', title:'Inventory Valuation', icon:IndianRupee, color:'teal',
    desc:'FIFO batch-cost valuation of current stock per material',
    filters:['project'],
    endpoint:'/reports/stores/inventory-valuation',
    dataKey:'data',
    columns:[
      { key:'material_name',   label:'Material' },
      { key:'unit',            label:'Unit' },
      { key:'category',        label:'Category' },
      { key:'location',        label:'Location' },
      { key:'project_name',    label:'Project' },
      { key:'current_stock',   label:'Stock Qty',  type:'number' },
      { key:'unit_rate',       label:'Rate (₹)',   type:'number' },
      { key:'fifo_value',      label:'Value (₹)',  type:'amount' },
      { key:'active_batches',  label:'Batches',    type:'number' },
    ],
  },
  {
    key:'stores-stock-aging', dept:'stores', title:'Stock Aging Report', icon:Calendar, color:'teal',
    desc:'Batch-wise stock bucketed by age — flags old inventory tying up capital',
    filters:['project'],
    endpoint:'/reports/stores/stock-aging',
    dataKey:'data',
    columns:[
      { key:'material_name',  label:'Material' },
      { key:'project_name',   label:'Project' },
      { key:'location',       label:'Location' },
      { key:'batch_number',   label:'Batch No',     mono:true },
      { key:'received_date',  label:'Received',     type:'date' },
      { key:'qty',            label:'Qty',          type:'number' },
      { key:'value',          label:'Value (₹)',    type:'amount' },
      { key:'age_days',       label:'Age (days)',   type:'number' },
      { key:'aging_bucket',   label:'Aging Bucket', type:'status' },
    ],
  },
  {
    key:'stores-slow-moving', dept:'stores', title:'Slow Moving Stock', icon:AlertTriangle, color:'teal',
    desc:'Materials with fewer than 2 issues in the last 90 days',
    filters:['project'],
    endpoint:'/reports/stores/slow-moving',
    dataKey:'data',
    columns:[
      { key:'material_name',        label:'Material' },
      { key:'unit',                 label:'Unit' },
      { key:'project_name',         label:'Project' },
      { key:'location',             label:'Location' },
      { key:'closing_stock',        label:'Stock Qty',      type:'number' },
      { key:'stock_value',          label:'Stock Value (₹)', type:'amount' },
      { key:'issues_last_90_days',  label:'Issues (90d)',   type:'number' },
      { key:'last_issue_date',      label:'Last Issue',     type:'date' },
      { key:'days_since_issue',     label:'Days Idle',      type:'number' },
    ],
  },
  {
    key:'stores-non-moving', dept:'stores', title:'Non-Moving Stock', icon:AlertCircle, color:'teal',
    desc:'Materials with zero issue or transfer-out in the last 90 days',
    filters:['project'],
    endpoint:'/reports/stores/non-moving',
    dataKey:'data',
    columns:[
      { key:'material_name',      label:'Material' },
      { key:'unit',               label:'Unit' },
      { key:'project_name',       label:'Project' },
      { key:'location',           label:'Location' },
      { key:'closing_stock',      label:'Stock Qty',      type:'number' },
      { key:'stock_value',        label:'Stock Value (₹)', type:'amount' },
      { key:'last_movement_date', label:'Last Movement',  type:'date' },
      { key:'idle_period',        label:'Idle Period' },
    ],
  },
  {
    key:'stores-reorder', dept:'stores', title:'Reorder Level Alerts', icon:Flag, color:'teal',
    desc:'Items where current stock is at or below the reorder level',
    filters:['project'],
    endpoint:'/reports/stores/reorder-alerts',
    dataKey:'data',
    columns:[
      { key:'material_name',  label:'Material' },
      { key:'unit',           label:'Unit' },
      { key:'project_name',   label:'Project' },
      { key:'location',       label:'Location' },
      { key:'current_stock',  label:'Current Stock', type:'number' },
      { key:'reorder_level',  label:'Reorder Level', type:'number' },
      { key:'minimum_level',  label:'Min Level',     type:'number' },
      { key:'shortfall',      label:'Shortfall',     type:'number' },
      { key:'unit_rate',      label:'Rate (₹)',      type:'number' },
    ],
  },
  {
    key:'stores-daily', dept:'stores', title:'Daily Stores Activity', icon:Activity, color:'teal',
    desc:'All stock transactions for a selected date — receipts, issues, transfers, adjustments',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/daily-activity',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'transaction_type',     label:'Type',         type:'status' },
      { key:'reference_number',     label:'Reference',    mono:true },
      { key:'material_name',        label:'Material' },
      { key:'unit',                 label:'Unit' },
      { key:'project_name',         label:'Project' },
      { key:'quantity',             label:'Qty',          type:'number' },
      { key:'value',                label:'Value (₹)',    type:'amount' },
      { key:'transacted_at',        label:'Time',         type:'date' },
      { key:'transacted_by_name',   label:'By' },
    ],
  },
  {
    key:'stores-monthly', dept:'stores', title:'Monthly Stores Summary', icon:FileBarChart, color:'teal',
    desc:'Period rollup of receipts, issues, returns, transfers and adjustments per project',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/monthly-summary',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'project_name',       label:'Project' },
      { key:'receipts_value',     label:'Receipts (₹)',     type:'amount' },
      { key:'issues_value',       label:'Issues (₹)',       type:'amount' },
      { key:'returns_value',      label:'Returns (₹)',      type:'amount' },
      { key:'transfers_value',    label:'Transfers (₹)',    type:'amount' },
      { key:'adjustments_value',  label:'Adjustments (₹)', type:'amount' },
      { key:'grn_count',          label:'GRNs',             type:'number' },
      { key:'min_count',          label:'MINs',             type:'number' },
      { key:'transfer_count',     label:'Transfers',        type:'number' },
    ],
  },
  {
    key:'stores-site-balance', dept:'stores', title:'Site Material Balance', icon:Ruler, color:'teal',
    desc:'Closing stock balance by site/location — quick "what\'s on site" view',
    filters:['project'],
    endpoint:'/reports/stores/site-balance',
    dataKey:'data',
    columns:[
      { key:'site_location',   label:'Site / Location' },
      { key:'project_name',    label:'Project' },
      { key:'material_name',   label:'Material' },
      { key:'unit',            label:'Unit' },
      { key:'closing_balance', label:'Closing Qty',   type:'number' },
      { key:'unit_rate',       label:'Rate (₹)',      type:'number' },
      { key:'balance_value',   label:'Balance (₹)',   type:'amount' },
    ],
  },
  {
    key:'stores-min-max', dept:'stores', title:'Min-Max Stock Report', icon:Target, color:'teal',
    desc:'Stock status against minimum and maximum holding levels per item',
    filters:['project'],
    endpoint:'/reports/stores/min-max',
    dataKey:'data',
    columns:[
      { key:'material_name',  label:'Material' },
      { key:'unit',           label:'Unit' },
      { key:'project_name',   label:'Project' },
      { key:'location',       label:'Location' },
      { key:'current_stock',  label:'Current Stock', type:'number' },
      { key:'minimum_level',  label:'Min Level',     type:'number' },
      { key:'maximum_level',  label:'Max Level',     type:'number' },
      { key:'reorder_level',  label:'Reorder Level', type:'number' },
      { key:'unit_rate',      label:'Rate (₹)',      type:'number' },
      { key:'stock_status',   label:'Status',        type:'status' },
    ],
  },
  {
    key:'stores-excess', dept:'stores', title:'Excess Stock Report', icon:AlertCircle, color:'teal',
    desc:'Items held above maximum level — flags over-procurement',
    filters:['project'],
    endpoint:'/reports/stores/excess-stock',
    dataKey:'data',
    columns:[
      { key:'material_name',  label:'Material' },
      { key:'unit',           label:'Unit' },
      { key:'project_name',   label:'Project' },
      { key:'location',       label:'Location' },
      { key:'current_stock',  label:'Current Stock',    type:'number' },
      { key:'maximum_level',  label:'Max Level',        type:'number' },
      { key:'excess_qty',     label:'Excess Qty',       type:'number' },
      { key:'unit_rate',      label:'Rate (₹)',         type:'number' },
      { key:'excess_value',   label:'Excess Value (₹)', type:'amount' },
    ],
  },
  {
    key:'procurement-rate-contracts-report', dept:'procurement', title:'Rate Contract Utilization', icon:ShieldCheck, color:'amber',
    desc:'Formal rate contracts vs actual PO rates — variance and utilization',
    filters:['dateRange'],
    endpoint:'/reports/procurement/rate-contracts',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'material_name',    label:'Material' },
      { key:'vendor_name',      label:'Vendor' },
      { key:'contracted_rate',  label:'Contracted Rate', type:'number' },
      { key:'avg_po_rate',      label:'Avg PO Rate',     type:'number' },
      { key:'rate_variance',    label:'Variance (₹)',    type:'number' },
      { key:'variance_pct',     label:'Variance %',      type:'number' },
      { key:'utilized_qty',     label:'Utilized Qty',    type:'number' },
      { key:'contracted_qty',   label:'Contracted Qty',  type:'number' },
      { key:'po_count',         label:'POs',             type:'number' },
      { key:'valid_from',       label:'Valid From',      type:'date' },
      { key:'valid_to',         label:'Valid To',        type:'date' },
      { key:'validity_status',  label:'Validity',        type:'status' },
    ],
  },

  {
    key:'stores-issue-register', dept:'stores', title:'Material Issue Register', icon:Send, color:'teal',
    desc:'All material issues from store to site — MIN no., issued to, quantity, value',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/issue-register',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'min_number',      label:'MIN No',       mono:true },
      { key:'issue_date',      label:'Date',         type:'date' },
      { key:'project_name',    label:'Project' },
      { key:'issued_to',       label:'Issued To' },
      { key:'material_name',   label:'Material' },
      { key:'unit',            label:'Unit' },
      { key:'qty_requested',   label:'Req. Qty',     type:'number' },
      { key:'qty_issued',      label:'Issued Qty',   type:'number' },
      { key:'rate',            label:'Rate (₹)',      type:'amount' },
      { key:'value',           label:'Value (₹)',     type:'amount' },
      { key:'vehicle_number',  label:'Vehicle' },
      { key:'status',          label:'Status',       type:'status' },
    ],
  },
  {
    key:'stores-return-register', dept:'stores', title:'Material Return Register', icon:ArrowUpRight, color:'teal',
    desc:'Materials returned from site back to store — restoring stock after excess/unused issues',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/return-register',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'return_ref',    label:'Ref No',       mono:true },
      { key:'return_date',   label:'Date',         type:'date' },
      { key:'project_name',  label:'Project' },
      { key:'material_name', label:'Material' },
      { key:'unit',          label:'Unit' },
      { key:'qty_returned',  label:'Qty Returned', type:'number' },
      { key:'rate',          label:'Rate (₹)',      type:'amount' },
      { key:'value',         label:'Value (₹)',     type:'amount' },
      { key:'returned_from', label:'Returned From' },
      { key:'remarks',       label:'Remarks' },
    ],
  },
  {
    key:'stores-transfer-register', dept:'stores', title:'Stock Transfer Register', icon:Truck, color:'teal',
    desc:'Inter-site and inter-store material transfers with status and value',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/transfer-register',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'mtr_number',    label:'MTR No',       mono:true },
      { key:'transfer_date', label:'Date',         type:'date' },
      { key:'transfer_type', label:'Type' },
      { key:'from_project',  label:'From Project' },
      { key:'from_location', label:'From Location' },
      { key:'to_project',    label:'To Project' },
      { key:'to_location',   label:'To Location' },
      { key:'item_count',    label:'Items',        type:'number' },
      { key:'total_amount',  label:'Value (₹)',    type:'amount' },
      { key:'status',        label:'Status',       type:'status' },
    ],
  },
  {
    key:'stores-contractor-issue', dept:'stores', title:'Contractor-wise Issue Report', icon:HardHat, color:'teal',
    desc:'Materials issued to each contractor — total qty and value per material for reconciliation',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/contractor-issue',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'contractor',       label:'Contractor / Issued To' },
      { key:'project_name',     label:'Project' },
      { key:'material_name',    label:'Material' },
      { key:'unit',             label:'Unit' },
      { key:'total_qty',        label:'Total Qty',    type:'number' },
      { key:'total_value',      label:'Total (₹)',    type:'amount' },
      { key:'min_count',        label:'MINs',         type:'number' },
      { key:'last_issue_date',  label:'Last Issue',   type:'date' },
    ],
    chart:{ type:'bar', xKey:'contractor', limit:8, bars:[{ key:'total_value', label:'Issue Value (₹)', type:'amount' }] },
  },
  {
    key:'stores-dead-stock', dept:'stores', title:'Dead Stock Report', icon:AlertCircle, color:'teal',
    desc:'Stock idle for >180 days with no planned use — candidates for write-off or disposal',
    filters:['project'],
    endpoint:'/reports/stores/dead-stock',
    dataKey:'data',
    columns:[
      { key:'material_name',      label:'Material' },
      { key:'unit',               label:'Unit' },
      { key:'project_name',       label:'Project' },
      { key:'location',           label:'Location' },
      { key:'current_qty',        label:'Qty',           type:'number' },
      { key:'unit_rate',          label:'Rate (₹)',       type:'amount' },
      { key:'stock_value',        label:'Value (₹)',      type:'amount' },
      { key:'last_movement_date', label:'Last Movement',  type:'date' },
      { key:'days_idle',          label:'Days Idle',      type:'number' },
      { key:'suggested_action',   label:'Action',         type:'status' },
    ],
  },
  {
    key:'stores-wastage', dept:'stores', title:'Material Wastage Report', icon:AlertTriangle, color:'teal',
    desc:'Negative stock adjustments recorded as wastage/breakage — with reason and value',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/wastage',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'date',          label:'Date',         type:'date' },
      { key:'project_name',  label:'Project' },
      { key:'location',      label:'Location' },
      { key:'material_name', label:'Material' },
      { key:'unit',          label:'Unit' },
      { key:'qty_wasted',    label:'Qty Wasted',   type:'number' },
      { key:'rate',          label:'Rate (₹)',      type:'amount' },
      { key:'value',         label:'Value (₹)',     type:'amount' },
      { key:'reason',        label:'Reason' },
      { key:'recorded_by',   label:'Recorded By' },
    ],
  },
  {
    key:'stores-material-cost-analysis', dept:'stores', title:'Material Cost Analysis', icon:TrendingUp, color:'teal',
    desc:'Receipt rate trends by material and month — avg, min, max rate and cost volatility',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/material-cost-analysis',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'material_name',       label:'Material' },
      { key:'unit',                label:'Unit' },
      { key:'project_name',        label:'Project' },
      { key:'month',               label:'Month' },
      { key:'grn_count',           label:'GRNs',           type:'number' },
      { key:'total_qty',           label:'Total Qty',      type:'number' },
      { key:'min_rate',            label:'Min Rate (₹)',   type:'amount' },
      { key:'max_rate',            label:'Max Rate (₹)',   type:'amount' },
      { key:'avg_rate',            label:'Avg Rate (₹)',   type:'amount' },
      { key:'total_value',         label:'Total (₹)',      type:'amount' },
      { key:'cost_volatility_pct', label:'Volatility %',   type:'number' },
    ],
    chart:{ type:'bar', xKey:'month', limit:12, bars:[{ key:'avg_rate', label:'Avg Rate (₹)', type:'amount' }] },
  },
  {
    key:'stores-inventory-turnover', dept:'stores', title:'Inventory Turnover Report', icon:BarChart3, color:'teal',
    desc:'Consumption vs closing stock — turnover ratio and days inventory outstanding per item',
    filters:['project'],
    endpoint:'/reports/stores/inventory-turnover',
    dataKey:'data',
    columns:[
      { key:'material_name',           label:'Material' },
      { key:'unit',                    label:'Unit' },
      { key:'project_name',            label:'Project' },
      { key:'closing_stock',           label:'Closing Qty',    type:'number' },
      { key:'unit_rate',               label:'Rate (₹)',        type:'amount' },
      { key:'closing_stock_value',     label:'Stock Value (₹)', type:'amount' },
      { key:'consumption_value',       label:'Consumed (₹)',    type:'amount' },
      { key:'turnover_ratio',          label:'Turnover Ratio',  type:'number' },
      { key:'days_inventory_outstanding', label:'DIO (days)',   type:'number' },
    ],
  },
  {
    key:'stores-mrp', dept:'stores', title:'Material Requirement Planning', icon:ClipboardList, color:'teal',
    desc:'Net material requirement = pending MRS qty − current stock, with suggested order-by date',
    filters:['project'],
    endpoint:'/reports/stores/mrp',
    dataKey:'data',
    columns:[
      { key:'project_name',            label:'Project' },
      { key:'material_name',           label:'Material' },
      { key:'pending_requisition_qty', label:'Pending MRS Qty', type:'number' },
      { key:'current_stock',           label:'Current Stock',   type:'number' },
      { key:'net_requirement',         label:'Net Requirement', type:'number' },
      { key:'avg_lead_days',           label:'Lead Time (days)', type:'number' },
      { key:'suggested_order_by',      label:'Order By',        type:'date' },
    ],
  },
  {
    key:'stores-stock-verification', dept:'stores', title:'Physical Stock Verification', icon:CheckCircle2, color:'teal',
    desc:'Recorded physical counts vs book stock — accuracy and variance by item',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/stock-verification',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'verification_date',   label:'Date',         type:'date' },
      { key:'project_name',        label:'Project' },
      { key:'location',            label:'Location' },
      { key:'material_name',       label:'Material' },
      { key:'unit',                label:'Unit' },
      { key:'book_stock',          label:'Book Stock',   type:'number' },
      { key:'physical_stock',      label:'Physical',     type:'number' },
      { key:'variance_qty',        label:'Variance Qty', type:'number' },
      { key:'variance_value',      label:'Variance (₹)', type:'amount' },
      { key:'accuracy_pct',        label:'Accuracy %',   type:'number' },
      { key:'adjustment_status',   label:'Status',       type:'status' },
      { key:'reason',              label:'Reason' },
      { key:'verified_by',         label:'Verified By' },
    ],
  },
  {
    key:'stores-stock-variance', dept:'stores', title:'Stock Variance Report', icon:AlertTriangle, color:'teal',
    desc:'Items with physical vs book stock discrepancy — shortages and excesses',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/stock-variance',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'verification_date', label:'Date',          type:'date' },
      { key:'project_name',      label:'Project' },
      { key:'location',          label:'Location' },
      { key:'material_name',     label:'Material' },
      { key:'unit',              label:'Unit' },
      { key:'book_stock',        label:'Book Stock',    type:'number' },
      { key:'physical_stock',    label:'Physical',      type:'number' },
      { key:'variance_qty',      label:'Variance Qty',  type:'number' },
      { key:'variance_value',    label:'Variance (₹)',  type:'amount' },
      { key:'variance_type',     label:'Type',          type:'status' },
      { key:'variance_pct',      label:'Variance %',    type:'number' },
      { key:'reason',            label:'Reason' },
      { key:'adjustment_status', label:'Adj. Status',   type:'status' },
    ],
  },
  {
    key:'stores-boq-vs-consumption', dept:'stores', title:'BOQ vs Material Consumption', icon:Layers, color:'teal',
    desc:'BOQ estimated quantities vs actual material issues — over/under consumption per item',
    filters:['dateRange','project'],
    endpoint:'/reports/stores/boq-vs-consumption',
    dataKey:'data',
    dateParams:{ from:'from_date', to:'to_date' },
    columns:[
      { key:'chapter_name',     label:'Chapter' },
      { key:'item_no',          label:'Item No' },
      { key:'boq_item',         label:'BOQ Description' },
      { key:'project_name',     label:'Project' },
      { key:'unit',             label:'Unit' },
      { key:'boq_qty',          label:'BOQ Qty',        type:'number' },
      { key:'consumed_qty',     label:'Consumed Qty',   type:'number' },
      { key:'variance_qty',     label:'Variance Qty',   type:'number' },
      { key:'variance_pct',     label:'Variance %',     type:'number' },
      { key:'estimated_value',  label:'Est. Value (₹)', type:'amount' },
      { key:'actual_value',     label:'Actual (₹)',     type:'amount' },
    ],
    chart:{ type:'bar', xKey:'boq_item', limit:10, bars:[
      { key:'boq_qty',      label:'BOQ Qty' },
      { key:'consumed_qty', label:'Consumed' },
    ]},
  },

  // ── Subcontractors ────────────────────────────────────────────────────────────
  {
    key:'sub-wo', dept:'subcontractors', title:'Work Order Register', icon:Briefcase, color:'orange',
    desc:'All work orders with subcontractor, contract value, and status',
    filters:['project'],
    endpoint:'/subcontractors/work-orders',
    dataKey:null,
    columns:[
      { key:'wo_number',          label:'WO No',         mono:true },
      { key:'subcontractor_name', label:'Subcontractor' },
      { key:'subject',            label:'Scope / Subject' },
      { key:'total_value',        label:'Contract (₹)',  type:'amount' },
      { key:'total_billed',       label:'Billed (₹)',    type:'amount' },
      { key:'status',             label:'Status',        type:'status' },
    ],
  },
  {
    key:'sub-bills', dept:'subcontractors', title:'RA Bill Summary', icon:Receipt, color:'orange',
    desc:'Running account bills — gross, deductions, net payable',
    filters:['project'],
    endpoint:'/subcontractors/bills',
    dataKey:null,
    columns:[
      { key:'bill_number',      label:'Bill No',      mono:true },
      { key:'wo_number',        label:'WO No',        mono:true },
      { key:'gross_amount',     label:'Gross (₹)',    type:'amount' },
      { key:'retention_amount', label:'Retention (₹)',type:'amount' },
      { key:'net_payable',      label:'Net (₹)',      type:'amount' },
      { key:'status',           label:'Status',       type:'status' },
    ],
  },
  {
    key:'sub-ledger', dept:'subcontractors', title:'Subcontractor Ledger', icon:Receipt, color:'orange',
    desc:'Per-vendor running statement of bills with all deductions and payment status',
    filters:['dateRange'],
    endpoint:'/subcontractors/reports/ledger',
    dataKey:null,
    columns:[
      { key:'vendor_name',      label:'Vendor' },
      { key:'bill_number',      label:'Bill No',     mono:true },
      { key:'bill_type',        label:'Type' },
      { key:'bill_date',        label:'Date',         type:'date' },
      { key:'gross_amount',     label:'Gross (₹)',    type:'amount' },
      { key:'tds_amount',       label:'TDS (₹)',      type:'amount' },
      { key:'retention_amount', label:'Retention (₹)',type:'amount' },
      { key:'net_payable',      label:'Net (₹)',      type:'amount' },
      { key:'status',           label:'Status',       type:'status' },
    ],
  },
  {
    key:'sub-deductions', dept:'subcontractors', title:'Deduction Summary', icon:ClipboardList, color:'orange',
    desc:'Per-vendor totals: TDS, retention, security, advance recovery, other deductions',
    filters:['dateRange'],
    endpoint:'/subcontractors/reports/deduction-summary',
    dataKey:null,
    columns:[
      { key:'vendor_name',             label:'Vendor' },
      { key:'bill_count',              label:'Bills' },
      { key:'gross_total',             label:'Gross (₹)',     type:'amount' },
      { key:'tds_total',               label:'TDS (₹)',       type:'amount' },
      { key:'retention_total',         label:'Retention (₹)', type:'amount' },
      { key:'security_total',          label:'Security (₹)',  type:'amount' },
      { key:'advance_recovery_total',  label:'Adv. Rec (₹)',  type:'amount' },
      { key:'other_deductions_total',  label:'Other (₹)',     type:'amount' },
      { key:'net_payable_total',       label:'Net (₹)',       type:'amount' },
    ],
  },
  {
    key:'sub-wo-utilization', dept:'subcontractors', title:'WO Utilization', icon:Briefcase, color:'orange',
    desc:'Per-work-order contract vs billed vs paid + utilization %',
    filters:['project'],
    endpoint:'/subcontractors/reports/wo-utilization',
    dataKey:null,
    columns:[
      { key:'wo_number',       label:'WO No',         mono:true },
      { key:'vendor_name',     label:'Subcontractor' },
      { key:'project_name',    label:'Project' },
      { key:'contract_value',  label:'Contract (₹)',  type:'amount' },
      { key:'billed_amount',   label:'Billed (₹)',    type:'amount' },
      { key:'paid_amount',     label:'Paid (₹)',      type:'amount' },
      { key:'utilization_pct', label:'Util %' },
      { key:'status',          label:'Status',        type:'status' },
    ],
  },

  // ── QS ───────────────────────────────────────────────────────────────────────
  {
    key:'qs-measurements', dept:'qs', title:'Measurement Book', icon:Ruler, color:'emerald',
    desc:'All measurements recorded and verified',
    filters:['project'],
    endpoint:'/measurements',
    dataKey:null,
    columns:[
      { key:'description',      label:'Description' },
      { key:'quantity',         label:'Qty',          type:'number' },
      { key:'unit',             label:'Unit' },
      { key:'rate',             label:'Rate (₹)',     type:'amount' },
      { key:'amount',           label:'Amount (₹)',   type:'amount' },
      { key:'status',           label:'Status',       type:'status' },
    ],
  },
  {
    key:'qs-ra-bills', dept:'qs', title:'RA Bills', icon:Receipt, color:'emerald',
    desc:'Client running account bills with certified and balance amounts',
    filters:['project'],
    endpoint:'/ra-bills',
    dataKey:null,
    columns:[
      { key:'bill_number',      label:'Bill No',      mono:true },
      { key:'bill_date',        label:'Date',         type:'date' },
      { key:'gross_amount',     label:'Gross (₹)',    type:'amount' },
      { key:'certified_amount', label:'Certified (₹)',type:'amount' },
      { key:'status',           label:'Status',       type:'status' },
    ],
  },

  // ── Planning ─────────────────────────────────────────────────────────────────
  {
    key:'planning-dpr', dept:'planning', title:'Daily Progress Report', icon:FileText, color:'blue',
    desc:'Site activity, manpower, equipment and progress per day',
    filters:['dateRange','project'],
    endpoint:'/dpr',
    dataKey:null,
    columns:[
      { key:'report_date',      label:'Date',         type:'date' },
      { key:'project_name',     label:'Project' },
      { key:'total_manpower',   label:'Manpower',     type:'number' },
      { key:'work_done',        label:'Work Done' },
      { key:'remarks',          label:'Remarks' },
    ],
  },

  // ── Quality ───────────────────────────────────────────────────────────────────
  {
    key:'quality-rfi', dept:'quality', title:'RFI Register', icon:FileSearch, color:'blue',
    desc:'Requests for information — open, responded, and closed',
    filters:['dateRange','project'],
    endpoint:'/quality/rfi',
    dataKey:null,
    columns:[
      { key:'rfi_number',       label:'RFI No',       mono:true },
      { key:'subject',          label:'Subject',      keys:['activity_name','location','checklist_name'] },
      { key:'raised_by_name',   label:'Raised By',    keys:['raised_by'] },
      { key:'created_at',       label:'Date',         type:'date' },
      { key:'status',           label:'Status',       type:'status' },
    ],
  },
  {
    key:'quality-ncr', dept:'quality', title:'NCR Register', icon:AlertTriangle, color:'blue',
    desc:'Non-conformance reports with corrective action status',
    filters:['dateRange','project'],
    endpoint:'/quality/ncr',
    dataKey:null,
    columns:[
      { key:'ncr_number',       label:'NCR No',       mono:true },
      { key:'description',      label:'Description',  keys:['title'] },
      { key:'location',         label:'Location',     keys:['rfi_activity'] },
      { key:'created_at',       label:'Date',         type:'date' },
      { key:'status',           label:'Status',       type:'status' },
    ],
  },

  // ── HSE ───────────────────────────────────────────────────────────────────────
  {
    key:'hse-incidents', dept:'hse', title:'Incident Register', icon:AlertTriangle, color:'red',
    desc:'All safety incidents with severity, location, and status',
    filters:['dateRange','project'],
    endpoint:'/incidents',
    dataKey:null,
    columns:[
      { key:'incident_date',    label:'Date',         type:'date' },
      { key:'incident_type',    label:'Type' },
      { key:'location',         label:'Location' },
      { key:'severity',         label:'Severity',     type:'status' },
      { key:'reported_by',      label:'Reported By' },
      { key:'status',           label:'Status',       type:'status' },
    ],
  },

  // ── Tender ────────────────────────────────────────────────────────────────────
  {
    key:'tender-register', dept:'tender', title:'Tender Register', icon:Gavel, color:'cyan',
    desc:'All tenders issued, received, and awarded with values',
    filters:['dateRange'],
    endpoint:'/tenders',
    dataKey:null,
    columns:[
      { key:'tender_number',    label:'Tender No',    mono:true },
      { key:'title',            label:'Title' },
      { key:'estimated_value',  label:'Est. Value (₹)',type:'amount' },
      { key:'submission_date',  label:'Due Date',     type:'date' },
      { key:'status',           label:'Status',       type:'status' },
      { key:'awarded_to',       label:'Awarded To' },
    ],
  },

  // ── Assets ────────────────────────────────────────────────────────────────────
  {
    key:'assets-register', dept:'assets', title:'Asset Register', icon:Briefcase, color:'slate',
    desc:'All assets with status, location, and assigned user',
    filters:[],
    endpoint:'/assets',
    dataKey:null,
    columns:[
      { key:'asset_code',       label:'Asset Code',   mono:true },
      { key:'asset_name',       label:'Asset Name',   keys:['name'] },
      { key:'asset_type',       label:'Category',     keys:['category'] },
      { key:'current_project_name', label:'Location', keys:['location'] },
      { key:'assigned_to_name', label:'Assigned To',  keys:['assigned_to'] },
      { key:'status',           label:'Status',       type:'status' },
      { key:'purchase_value',   label:'Value (₹)',    type:'amount' },
    ],
  },
].filter((report) => report.dept !== 'subcontractors');

// ── Status colour map ──────────────────────────────────────────────────────────
const STATUS_COLOR = {
  paid:'bg-emerald-100 text-emerald-700', approved:'bg-emerald-100 text-emerald-700',
  active:'bg-blue-100 text-blue-700', open:'bg-blue-100 text-blue-700',
  pending:'bg-amber-100 text-amber-700', submitted:'bg-amber-100 text-amber-700',
  draft:'bg-slate-100 text-slate-600',
  rejected:'bg-red-100 text-red-700', closed:'bg-slate-100 text-slate-600',
  high:'bg-red-100 text-red-700', medium:'bg-amber-100 text-amber-700', low:'bg-blue-100 text-blue-700',
};

function firstValue(row, col) {
  const keys = [col.key, ...(col.keys || [])];
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function summarizeItems(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items
    .map(item => item.material_name || item.material || item.item_name)
    .filter(Boolean)
    .join(', ');
}

function sumItemQuantity(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  return items.reduce((sum, item) => sum + (parseFloat(item.quantity || item.qty || item.quantity_received) || 0), 0);
}

function dateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmt(val, type) {
  if (val === null || val === undefined || val === '') return <span className="text-slate-300">—</span>;
  if (type === 'amount') return '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
  if (type === 'date') return val ? new Date(val).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  if (type === 'number') return Number(val).toLocaleString('en-IN');
  if (type === 'status') {
    const cls = STATUS_COLOR[String(val).toLowerCase()] || 'bg-slate-100 text-slate-600';
    return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide', cls)}>{val}</span>;
  }
  return String(val);
}

// ── Generic report chart (bar / pie) driven by report.chart config ────────────
function ReportChart({ report, rows }) {
  const { chart } = report;
  if (!chart || !rows?.length) return null;

  if (chart.type === 'pie') {
    const counts = {};
    rows.forEach(r => {
      const key = r[chart.groupBy] ?? 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
    return (
      <div className="flex flex-col items-center">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{chart.label || 'Breakdown'}</p>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <RTooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // bar chart
  const limit = chart.limit || 12;
  const data = rows.slice(0, limit).map(r => {
    const entry = { name: String(firstValue(r, { key: chart.xKey }) ?? '') };
    chart.bars.forEach(bar => {
      entry[bar.key] = parseFloat(firstValue(r, bar)) || 0;
    });
    return entry;
  });
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 10 }} />
        <RTooltip formatter={(v) => Number(v).toLocaleString('en-IN')} />
        {chart.bars.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {chart.bars.map((bar, i) => (
          <Bar key={bar.key} dataKey={bar.key} name={bar.label} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [dept, setDept] = useState('tqs');
  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);

  // select first report of tqs by default
  useEffect(() => {
    const first = REPORTS.find(r => r.dept === 'tqs');
    if (first) setSelectedReport(first);
  }, []);

  const countByDept = useMemo(() => {
    const m = {};
    REPORTS.forEach(r => { m[r.dept] = (m[r.dept] || 0) + 1; });
    return m;
  }, []);

  const visibleReports = useMemo(() => {
    let list = dept === 'all' ? REPORTS : REPORTS.filter(r => r.dept === dept);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q));
    }
    return list;
  }, [dept, search]);

  const handleSelectDept = (key) => {
    setDept(key);
    setSearch('');
    const first = REPORTS.find(r => key === 'all' ? true : r.dept === key);
    if (first) setSelectedReport(first);
  };

  return (
    <div className="flex h-full min-h-0 bg-slate-50 overflow-hidden max-xl:flex-col">

      {/* ── Department sidebar ─────────────────────────────────────────────── */}
      <aside className="report-hub-dept-sidebar w-60 flex-shrink-0 flex flex-col overflow-hidden bg-white border-r border-slate-200 max-xl:w-full max-xl:max-h-[200px]">

        {/* Header */}
        <div className="px-4 pt-4 pb-3.5 flex-shrink-0 border-b border-slate-100 max-xl:pt-3 max-xl:pb-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                 style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)' }}>
              <FileBarChart className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">Reports Hub</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{REPORTS.length} reports · {DEPTS.length - 1} departments</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-0.5 max-xl:flex max-xl:gap-1.5 max-xl:space-y-0 max-xl:overflow-x-auto max-xl:overflow-y-hidden max-xl:pb-3
                        [&::-webkit-scrollbar]:w-1
                        [&::-webkit-scrollbar-track]:transparent
                        [&::-webkit-scrollbar-thumb]:rounded-full
                        [&::-webkit-scrollbar-thumb]:bg-slate-200">
          <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest max-xl:hidden">Departments</p>
          {DEPTS.map((d, idx) => {
            const Icon = d.icon;
            const active = dept === d.key;
            const c = C[d.color] || C.navy;
            const cnt = d.key === 'all' ? REPORTS.length : (countByDept[d.key] || 0);
            return (
              <React.Fragment key={d.key}>
                {idx === 1 && (
                  <div className="mx-2 my-2 border-t border-slate-100 max-xl:hidden" />
                )}
                <button
                  onClick={() => handleSelectDept(d.key)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 relative group max-xl:w-auto max-xl:min-w-[140px]',
                    active
                      ? clsx(c.bg, 'shadow-sm')
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  )}
                >
                  {/* Left accent bar for active */}
                  {active && (
                    <span className={clsx('absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full', c.btn.split(' ')[0])} />
                  )}

                  {/* Icon */}
                  <div className={clsx(
                    'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150',
                    active ? 'bg-white shadow-sm' : 'bg-slate-100 group-hover:bg-slate-200'
                  )}>
                    <Icon className={clsx('w-3.5 h-3.5', active ? c.icon : 'text-slate-400 group-hover:text-slate-600')} />
                  </div>

                  <span className={clsx(
                    'text-xs flex-1 truncate leading-none',
                    active ? clsx('font-semibold', c.icon) : 'font-medium'
                  )}>{d.label}</span>

                  <span className={clsx(
                    'text-[10px] px-1.5 py-0.5 rounded-md min-w-[20px] text-center leading-none tabular-nums font-semibold',
                    active ? c.badge : 'bg-slate-100 text-slate-400'
                  )}>{cnt}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </aside>

      {/* ── Report list ────────────────────────────────────────────────────── */}
      <div className="report-hub-list-panel w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden max-xl:w-full max-xl:max-h-[260px] max-xl:border-r-0 max-xl:border-b">

        {/* Panel header */}
        <div className="px-3.5 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
          {/* Dept label */}
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              {DEPTS.find(d => d.key === dept)?.label || 'Reports'}
            </span>
            <span className="text-[10px] font-medium text-slate-400 tabular-nums bg-slate-100 px-2 py-0.5 rounded-full">
              {visibleReports.length} report{visibleReports.length !== 1 ? 's' : ''}
            </span>
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200
                          focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:bg-white transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reports…"
              className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Report cards */}
        <div className="flex-1 overflow-y-auto py-2.5 px-2.5 max-xl:grid max-xl:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] max-xl:gap-1.5
                        [&::-webkit-scrollbar]:w-1
                        [&::-webkit-scrollbar-track]:transparent
                        [&::-webkit-scrollbar-thumb]:rounded-full
                        [&::-webkit-scrollbar-thumb]:bg-slate-200">
          {visibleReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2.5 text-slate-400">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <Search className="w-4 h-4 opacity-50" />
              </div>
              <p className="text-xs font-medium">No reports found</p>
            </div>
          ) : (
            visibleReports.map(r => {
              const Icon = r.icon;
              const active = selectedReport?.key === r.key;
              const c = C[r.color] || C.navy;
              return (
                <button
                  key={r.key}
                  onClick={() => setSelectedReport(r)}
                  className={clsx(
                    'w-full text-left px-3 py-3 rounded-xl mb-1.5 transition-all duration-150 relative overflow-hidden group border max-xl:mb-0',
                    active
                      ? clsx(c.bg, 'border-transparent shadow-sm ring-1', c.ring)
                      : 'border-transparent hover:bg-slate-50 hover:border-slate-100'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-150',
                      active ? 'bg-white shadow-sm' : 'bg-slate-100 group-hover:bg-white group-hover:shadow-sm'
                    )}>
                      <Icon className={clsx('w-4 h-4 transition-all duration-150', active ? c.icon : 'text-slate-400 group-hover:text-slate-600')} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={clsx(
                        'text-xs leading-tight',
                        active ? 'font-semibold text-slate-900' : 'font-medium text-slate-700 group-hover:text-slate-900'
                      )}>{r.title}</p>
                      <p className="text-[10.5px] text-slate-400 mt-1 leading-snug line-clamp-2">{r.desc}</p>
                    </div>
                    {active && (
                      <ChevronRight className={clsx('w-3.5 h-3.5 flex-shrink-0 mt-1', c.icon)} />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Report generator ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
        {selectedReport
          ? <ReportGenerator report={selectedReport} />
          : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <FileBarChart className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a report to generate</p>
            </div>
          )
        }
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function ReportGenerator({ report }) {
  const now = new Date();
  const today = dateInputValue(now);
  const firstOfMonth = dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate]     = useState(today);
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects]   = useState([]);

  const [loading, setLoading]  = useState(false);
  const [rows, setRows]        = useState(null);
  const [error, setError]      = useState('');
  const [generated, setGenerated] = useState(false);

  const hasDateFilter    = report.filters?.includes('dateRange');
  const hasProjectFilter = report.filters?.includes('project');

  // load projects list for filter
  useEffect(() => {
    if (!hasProjectFilter) return;
    api.get('/projects').then(r => setProjects(Array.isArray(r.data) ? r.data : r.data?.data || [])).catch(() => {});
  }, [hasProjectFilter]);

  // reset when report changes
  useEffect(() => {
    setRows(null);
    setError('');
    setGenerated(false);
  }, [report.key]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    setRows(null);
    try {
      const params = {};
      if (hasDateFilter) {
        // some routes use from/to, others from_date/to_date
        const fp = report.dateParams?.from || 'from_date';
        const tp = report.dateParams?.to   || 'to_date';
        params[fp] = fromDate;
        params[tp] = toDate;
        // also send the common aliases so any route can pick it up
        params.from = fromDate;
        params.to   = toDate;
      }
      if (hasProjectFilter && projectId) params.project_id = projectId;
      const res = await api.get(report.endpoint, { params });

      // extract array from response — try dataKey first, then common shapes
      const dk = report.dataKey;
      let data = dk && Array.isArray(res.data?.[dk]) ? res.data[dk]
               : Array.isArray(res.data)             ? res.data
               : Array.isArray(res.data?.data)       ? res.data?.data
               : Array.isArray(res.data?.rows)        ? res.data.rows
               : Array.isArray(res.data?.bills)       ? res.data.bills
               : Array.isArray(res.data?.records)     ? res.data.records
               : [];
      if (report.transform) data = report.transform(data);
      if (report.aggregate) data = report.aggregate(data);
      setRows(data);
      setGenerated(true);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e.message || 'Failed to load data';
      setError(`${e?.response?.status ? `[${e.response.status}] ` : ''}${msg}`);
    } finally {
      setLoading(false);
    }
  }, [report, fromDate, toDate, projectId, hasDateFilter, hasProjectFilter]);

  const handlePrint = () => {
    const landscape = report.columns.length > 6;
    const style = document.createElement('style');
    style.id = '__rpt-print-style__';
    style.textContent = `
      @media print {
        @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm 10mm; }

        /* ── 1. Force ALL overflow containers to be visible so table can paginate ── */
        html, body {
          height: auto !important;
          overflow: visible !important;
        }
        /* Every flex/overflow container must become visible for multi-page printing */
        body * {
          overflow: visible !important;
          max-height: none !important;
        }
        /* Undo fixed/absolute heights on flex wrappers */
        .flex, .flex-col, .flex-1, [class*="overflow"] {
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
        }

        /* ── 2. Hide the 3-panel layout chrome ── */
        .report-hub-dept-sidebar,
        .report-hub-list-panel,
        .report-hub-filter-bar,
        .report-hub-header { display: none !important; }

        /* ── 3. Report output card ── */
        #report-output {
          box-shadow: none !important;
          border-radius: 0 !important;
          border: none !important;
          overflow: visible !important;
          width: 100% !important;
        }

        /* ── 4. Print header ── */
        #report-print-header {
          display: flex !important;
          background: #fff !important;
          color: #000 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          padding: 0 0 10px !important;
        }

        /* ── 5. Table — allow rows to flow across pages ── */
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          table-layout: auto !important;
        }
        thead { display: table-header-group !important; }
        tfoot { display: table-footer-group !important; }
        tbody tr { page-break-inside: avoid; break-inside: avoid; }

        thead tr, thead th {
          background: #1e3a8a !important;
          color: #fff !important;
          font-size: 7pt !important;
          padding: 5px 6px !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        tbody tr:nth-child(even) {
          background: #f8fafc !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        tbody td {
          font-size: 7.5pt !important;
          padding: 4px 6px !important;
          border-bottom: 0.5pt solid #e2e8f0 !important;
        }
        tfoot tr {
          background: #f1f5f9 !important;
          border-top: 1.5pt solid #1e3a8a !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        tfoot td {
          font-size: 7.5pt !important;
          font-weight: bold !important;
          padding: 4px 6px !important;
        }
      }
    `;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  };

  const handleExport = () => {
    if (!rows || !rows.length) return;
    const headers = report.columns.map(c => c.label);
    const csvRows = [
      headers.join(','),
      ...rows.map(r =>
        report.columns.map(c => {
          const v = firstValue(r, c);
          if (v === null || v === undefined) return '';
          return `"${String(v).replace(/"/g,'""')}"`;
        }).join(',')
      )
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${report.title.replace(/\s+/g,'-')}-${today}.csv`;
    a.click();
  };

  const c = C[report.color] || C.navy;
  const Icon = report.icon;

  // totals for amount columns
  const totals = useMemo(() => {
    if (!rows) return {};
    const t = {};
    report.columns.forEach(col => {
      if (col.type === 'amount' || col.type === 'number') {
        t[col.key] = rows.reduce((s, r) => s + (parseFloat(firstValue(r, col)) || 0), 0);
      }
    });
    return t;
  }, [rows, report]);

  return (
    <div className="flex flex-col h-full min-h-0 print:h-auto print:overflow-visible">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="report-hub-header bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
          <div className="flex items-center gap-3.5">
            <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ring-1', c.bg, c.ring)}>
              <Icon className={clsx('w-5 h-5', c.icon)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 leading-tight">{report.title}</h2>
                <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide', c.badge)}>
                  {DEPTS.find(d => d.key === report.dept)?.label || report.dept}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{report.desc}</p>
            </div>
          </div>
          {generated && rows && (
            <div className="flex items-center gap-2 max-md:w-full max-md:flex-wrap">
              <button
                onClick={handleExport}
                className="flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm max-md:flex-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Export CSV
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm max-md:flex-1"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                Print
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filters + Generate button ──────────────────────────────────────── */}
      <div className="report-hub-filter-bar bg-white border-b border-slate-200 px-6 py-3.5 flex-shrink-0">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 self-end h-9 pr-1 text-slate-400">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Filters</span>
          </div>
          {hasDateFilter && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="text-xs h-9 border border-slate-200 rounded-lg px-3 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 bg-white shadow-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="text-xs h-9 border border-slate-200 rounded-lg px-3 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 bg-white shadow-sm"
                />
              </div>
            </>
          )}
          {hasProjectFilter && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Project</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="text-xs h-9 border border-slate-200 rounded-lg px-3 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 bg-white shadow-sm min-w-[200px] max-sm:min-w-0 max-sm:w-full"
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.project_name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className={clsx(
              'flex items-center justify-center gap-2 px-5 h-9 rounded-lg text-white text-xs font-semibold transition-all shadow-sm max-sm:w-full',
              loading ? 'opacity-60 cursor-not-allowed bg-slate-400' : `${c.btn}`
            )}
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
            {loading ? 'Generating…' : 'Generate Report'}
          </button>
          {generated && rows && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 h-9 self-end">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {rows.length} record{rows.length !== 1 ? 's' : ''} found
            </span>
          )}
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4 print:overflow-visible print:h-auto">

        {/* Not yet generated */}
        {!generated && !loading && !error && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className={clsx('w-20 h-20 rounded-2xl flex items-center justify-center ring-1', c.bg, c.ring)}>
              <Icon className={clsx('w-9 h-9 opacity-50', c.icon)} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">Ready to generate</p>
              <p className="text-xs text-slate-400 mt-1">Set your filters above and click <span className={clsx('font-semibold', c.icon)}>Generate Report</span></p>
              <p className="text-[11px] text-slate-400 mt-0.5">Results appear here as a table you can print or export to Excel</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 text-sm text-red-700 shadow-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Could not generate this report</p>
              <p className="text-xs mt-0.5 text-red-600">{error}</p>
            </div>
          </div>
        )}

        {/* Empty results */}
        {generated && !loading && rows && rows.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <Info className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No records found for the selected filters</p>
            <p className="text-xs text-slate-400">Try widening the date range or selecting a different project</p>
          </div>
        )}

        {/* Data table */}
        {rows && rows.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="report-output">
            {/* Print header (only visible on print) */}
            <div id="report-print-header" className="hidden flex-col px-6 py-4 mb-0 border-b-[2.5px] border-[#1e3a8a]">
              <div className="flex items-start justify-between gap-4">
                {/* Left: Logo + Company */}
                <div className="flex items-start gap-3">
                  <img src="/bcim-logo.png" alt="BCIM" className="h-12 object-contain" />
                  <div className="text-[9px] text-slate-700 leading-snug">
                    <p className="text-[12px] font-bold text-slate-900 m-0">BCIM ENGINEERING PRIVATE LIMITED</p>
                    <p className="m-0">No 579, 1st 'A' Main Road, Jayanagar 8th Block, Bangalore – 560070</p>
                    <p className="m-0">GSTIN: 29AAXCB2929P1Z1 &nbsp;|&nbsp; Tel: +91 80 26650194</p>
                  </div>
                </div>
                {/* Right: Report meta */}
                <div className="text-right">
                  <p className="text-base font-bold text-[#1e3a8a] m-0">{report.title}</p>
                  <p className="text-[10px] font-semibold text-slate-600 mt-0.5 m-0">
                    Project: {hasProjectFilter && projectId ? (projects.find(p => p.id === projectId)?.name || projects.find(p => p.id === projectId)?.project_name || 'Selected Project') : 'All Projects'}
                  </p>
                  {hasDateFilter && (
                    <p className="text-[10px] text-slate-500 m-0">Period: {new Date(fromDate).toLocaleDateString('en-IN')} — {new Date(toDate).toLocaleDateString('en-IN')}</p>
                  )}
                  <p className="text-[9px] text-slate-400 mt-0.5 m-0">Generated: {new Date().toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>


            {/* Summary strip (screen only) */}
            <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 print:hidden">
              <div className="flex items-center gap-3">
                <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center ring-1', c.bg, c.ring)}>
                  <Icon className={clsx('w-4 h-4', c.icon)} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{report.title}</p>
                  <p className="text-[11px] text-slate-400">
                    {rows.length} record{rows.length !== 1 ? 's' : ''}
                    {hasDateFilter && ` · ${new Date(fromDate).toLocaleDateString('en-IN')} – ${new Date(toDate).toLocaleDateString('en-IN')}`}
                    {hasProjectFilter && projectId && ` · ${projects.find(p => p.id === projectId)?.name || 'Project'}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {report.columns.filter(col => col.type === 'amount' && totals[col.key] !== undefined).slice(0, 3).map(col => (
                  <div key={col.key} className="px-3.5 py-2 rounded-lg bg-white border border-slate-200 shadow-sm">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block leading-none mb-1">{col.label}</span>
                    <span className="text-[13px] font-bold text-slate-800 tabular-nums leading-none">
                      ₹{Number(totals[col.key]).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart */}
            {report.chart && (
              <div className="px-5 py-4 border-b border-slate-100 print:hidden">
                <ReportChart report={report} rows={rows} />
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1e3a8a] text-white">
                    <th className="px-3.5 py-3 text-left font-semibold text-[10px] uppercase tracking-wider w-10">#</th>
                    {report.columns.map(col => (
                      <th key={col.key} className={clsx(
                        'px-3.5 py-3 font-semibold text-[10px] uppercase tracking-wider whitespace-nowrap',
                        col.type === 'amount' || col.type === 'number' ? 'text-right' : 'text-left'
                      )}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={clsx('transition-colors hover:bg-indigo-50/40', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60')}>
                      <td className="px-3.5 py-2.5 text-slate-400 font-medium text-[10px] tabular-nums border-b border-slate-100">{i + 1}</td>
                      {report.columns.map(col => (
                        <td key={col.key} className={clsx(
                          'px-3.5 py-2.5 text-slate-700 border-b border-slate-100',
                          col.mono ? 'font-mono text-[10.5px] font-medium text-slate-600' : '',
                          col.type === 'amount' || col.type === 'number' ? 'text-right tabular-nums font-medium' : ''
                        )}>
                          {fmt(firstValue(row, col), col.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {/* Totals row */}
                {Object.keys(totals).length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-[#1e3a8a]">
                      <td className="px-3.5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</td>
                      {report.columns.map(col => (
                        <td key={col.key} className={clsx(
                          'px-3.5 py-3 text-[11.5px]',
                          col.type === 'amount' || col.type === 'number' ? 'text-right tabular-nums font-bold text-[#1e3a8a]' : ''
                        )}>
                          {totals[col.key] !== undefined
                            ? col.type === 'amount'
                              ? '₹' + Number(totals[col.key]).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })
                              : Number(totals[col.key]).toLocaleString('en-IN')
                            : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
