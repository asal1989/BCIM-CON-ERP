// src/pages/stores/StoresReportViewer.jsx
// Universal viewer for all 36 Stores Module reports
import React, { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import {
  ChevronLeft, Download, RefreshCw, Filter, BarChart3,
  AlertCircle, Loader2, Warehouse,
} from 'lucide-react';

// ── API helper ────────────────────────────────────────────────────────────────
const storesReportAPI = {
  get: (type, params) => api.get(`/stores-reports/${type}`, { params }),
};

// ── Column formatters ─────────────────────────────────────────────────────────
const fmt = {
  date:  (v) => {
    if (!v) return '—';
    const x = new Date(v);
    if (isNaN(x.getTime())) return '—';
    return `${String(x.getDate()).padStart(2,'0')}-${String(x.getMonth()+1).padStart(2,'0')}-${x.getFullYear()}`;
  },
  dt:    (v) => {
    if (!v) return '—';
    const x = new Date(v);
    if (isNaN(x.getTime())) return '—';
    const d = `${String(x.getDate()).padStart(2,'0')}-${String(x.getMonth()+1).padStart(2,'0')}-${x.getFullYear()}`;
    return `${d} ${String(x.getHours()).padStart(2,'0')}:${String(x.getMinutes()).padStart(2,'0')}`;
  },
  num:   (v) => v == null ? '—' : Number(v).toLocaleString('en-IN'),
  dec:   (v) => v == null ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  qty:   (v) => v == null ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
  pct:   (v) => v == null ? '—' : `${Number(v).toFixed(1)}%`,
  str:   (v) => v ?? '—',
};

// ── Report metadata ────────────────────────────────────────────────────────────
// Each entry: { title, section, desc, showCategory, showDateRange, cols[] }
// col: { key, label, format, align, bold }
const REPORT_META = {
  'stock-ledger': {
    title: 'Stock Ledger', section: '1.1', showDateRange: true, showCategory: true,
    desc: 'Item-wise receipts, issues, and closing balances for any date range.',
    cols: [
      { key: 'transacted_at',  label: 'Date / Time',   format: fmt.dt,  },
      { key: 'project_name',   label: 'Project',        format: fmt.str  },
      { key: 'category',       label: 'Category',       format: fmt.str  },
      { key: 'material_name',  label: 'Material',       format: fmt.str, bold: true },
      { key: 'unit',           label: 'Unit',           format: fmt.str  },
      { key: 'txn_type',       label: 'Transaction',    format: fmt.str  },
      { key: 'quantity',       label: 'Qty',            format: fmt.qty, align: 'right' },
      { key: 'reference_number', label: 'Reference',   format: fmt.str  },
      { key: 'transacted_by',  label: 'By',             format: fmt.str  },
      { key: 'remarks',        label: 'Remarks',        format: fmt.str  },
    ],
  },
  'stock-statement': {
    title: 'Stock Statement', section: '1.2', showCategory: true,
    desc: 'Snapshot of all materials on hand with quantity, unit rate, and value.',
    cols: [
      { key: 'project_name',  label: 'Project',        format: fmt.str },
      { key: 'category',      label: 'Category',       format: fmt.str },
      { key: 'material_name', label: 'Material',       format: fmt.str, bold: true },
      { key: 'unit',          label: 'Unit',           format: fmt.str },
      { key: 'opening_stock', label: 'Opening',        format: fmt.qty, align: 'right' },
      { key: 'closing_stock', label: 'Closing',        format: fmt.qty, align: 'right' },
      { key: 'unit_rate',     label: 'Rate',           format: fmt.dec, align: 'right' },
      { key: 'stock_value',   label: 'Value (₹)',      format: fmt.dec, align: 'right', bold: true },
      { key: 'site_location', label: 'Location',       format: fmt.str },
      { key: 'last_updated',  label: 'Last Updated',   format: fmt.date },
    ],
    valueSumKey: 'stock_value',
  },
  'min-stock': {
    title: 'Minimum Stock Alert', section: '1.3', showCategory: true,
    desc: 'Items below re-order level across stores and project sites.',
    cols: [
      { key: 'project_name',  label: 'Project',        format: fmt.str },
      { key: 'category',      label: 'Category',       format: fmt.str },
      { key: 'material_name', label: 'Material',       format: fmt.str, bold: true },
      { key: 'unit',          label: 'Unit',           format: fmt.str },
      { key: 'current_stock', label: 'Current Stock',  format: fmt.qty, align: 'right' },
      { key: 'reorder_level', label: 'Reorder Level',  format: fmt.qty, align: 'right' },
      { key: 'minimum_level', label: 'Minimum Level',  format: fmt.qty, align: 'right' },
      { key: 'shortage',      label: 'Shortage',       format: fmt.qty, align: 'right' },
      { key: 'alert_level',   label: 'Alert',          format: fmt.str, bold: true },
    ],
  },
  'slow-moving': {
    title: 'Slow Moving & Non-Moving Stock', section: '1.4', showCategory: true,
    desc: 'Materials with no movement for a configurable number of days.',
    showDays: true,
    cols: [
      { key: 'project_name',      label: 'Project',         format: fmt.str },
      { key: 'category',          label: 'Category',        format: fmt.str },
      { key: 'material_name',     label: 'Material',        format: fmt.str, bold: true },
      { key: 'unit',              label: 'Unit',            format: fmt.str },
      { key: 'closing_stock',     label: 'Stock',           format: fmt.qty, align: 'right' },
      { key: 'unit_rate',         label: 'Rate',            format: fmt.dec, align: 'right' },
      { key: 'stock_value',       label: 'Value (₹)',       format: fmt.dec, align: 'right' },
      { key: 'last_movement_date',label: 'Last Movement',   format: fmt.date },
      { key: 'days_idle',         label: 'Days Idle',       format: fmt.num, align: 'right', bold: true },
    ],
    valueSumKey: 'stock_value',
  },
  'dead-stock': {
    title: 'Dead Stock Report', section: '1.5', showCategory: true,
    desc: 'Items with zero movement for more than 90 days.',
    cols: [
      { key: 'project_name',      label: 'Project',         format: fmt.str },
      { key: 'category',          label: 'Category',        format: fmt.str },
      { key: 'material_name',     label: 'Material',        format: fmt.str, bold: true },
      { key: 'unit',              label: 'Unit',            format: fmt.str },
      { key: 'closing_stock',     label: 'Stock',           format: fmt.qty, align: 'right' },
      { key: 'unit_rate',         label: 'Rate',            format: fmt.dec, align: 'right' },
      { key: 'stock_value',       label: 'Value (₹)',       format: fmt.dec, align: 'right' },
      { key: 'last_movement_date',label: 'Last Movement',   format: fmt.date },
      { key: 'days_idle',         label: 'Days Idle',       format: fmt.num, align: 'right', bold: true },
    ],
    valueSumKey: 'stock_value',
  },
  'item-summary': {
    title: 'Item-wise Stock Summary', section: '1.6', showDateRange: true, showCategory: true,
    desc: 'Consolidated stock position per item across all stores and sites.',
    cols: [
      { key: 'project_name',   label: 'Project',       format: fmt.str },
      { key: 'category',       label: 'Category',      format: fmt.str },
      { key: 'material_name',  label: 'Material',      format: fmt.str, bold: true },
      { key: 'unit',           label: 'Unit',          format: fmt.str },
      { key: 'opening_stock',  label: 'Opening',       format: fmt.qty, align: 'right' },
      { key: 'received',       label: 'Received',      format: fmt.qty, align: 'right' },
      { key: 'issued',         label: 'Issued',        format: fmt.qty, align: 'right' },
      { key: 'transferred',    label: 'Transferred',   format: fmt.qty, align: 'right' },
      { key: 'closing_stock',  label: 'Closing',       format: fmt.qty, align: 'right', bold: true },
      { key: 'closing_value',  label: 'Value (₹)',     format: fmt.dec, align: 'right' },
    ],
    valueSumKey: 'closing_value',
  },
  'mrn-register': {
    title: 'MRN Register', section: '2.1', showDateRange: true,
    desc: 'Chronological log of all inward material receipts with GRN references.',
    cols: [
      { key: 'grn_number',       label: 'GRN #',          format: fmt.str, bold: true },
      { key: 'grn_date',         label: 'Date',           format: fmt.date },
      { key: 'project_name',     label: 'Project',        format: fmt.str },
      { key: 'vendor_name',      label: 'Vendor',         format: fmt.str },
      { key: 'po_number',        label: 'PO #',           format: fmt.str },
      { key: 'invoice_number',   label: 'Invoice #',      format: fmt.str },
      { key: 'materials',        label: 'Materials',      format: fmt.str },
      { key: 'total_qty',        label: 'Total Qty',      format: fmt.qty, align: 'right' },
      { key: 'status',           label: 'QC Status',      format: fmt.str },
      { key: 'vehicle_number',   label: 'Vehicle',        format: fmt.str },
      { key: 'received_by_name', label: 'Received By',    format: fmt.str },
    ],
  },
  'mis-register': {
    title: 'MIS Register', section: '2.2', showDateRange: true, showCategory: true,
    desc: 'All material issues to site with requisition and cost-code mapping.',
    cols: [
      { key: 'issue_date',     label: 'Date',          format: fmt.date },
      { key: 'project_name',   label: 'Project',       format: fmt.str },
      { key: 'category',       label: 'Category',      format: fmt.str },
      { key: 'material_name',  label: 'Material',      format: fmt.str, bold: true },
      { key: 'unit',           label: 'Unit',          format: fmt.str },
      { key: 'issued_qty',     label: 'Issued Qty',    format: fmt.qty, align: 'right' },
      { key: 'mis_number',     label: 'MIS #',         format: fmt.str },
      { key: 'unit_rate',      label: 'Rate',          format: fmt.dec, align: 'right' },
      { key: 'value',          label: 'Value (₹)',     format: fmt.dec, align: 'right' },
      { key: 'issued_by',      label: 'Issued By',     format: fmt.str },
    ],
    valueSumKey: 'value',
  },
  'inter-store-transfer': {
    title: 'Inter-Store / Inter-Site Transfer', section: '2.3', showDateRange: true,
    desc: 'Materials transferred between stores or project sites.',
    cols: [
      { key: 'mtr_number',    label: 'MTR #',         format: fmt.str, bold: true },
      { key: 'transfer_date', label: 'Date',          format: fmt.date },
      { key: 'from_project',  label: 'From Project',  format: fmt.str },
      { key: 'to_project',    label: 'To Project',    format: fmt.str },
      { key: 'purpose',       label: 'Purpose',       format: fmt.str },
      { key: 'vehicle_number',label: 'Vehicle',       format: fmt.str },
      { key: 'status',        label: 'Status',        format: fmt.str },
      { key: 'requested_by',  label: 'Requested By',  format: fmt.str },
      { key: 'item_count',    label: 'Items',         format: fmt.num, align: 'right' },
      { key: 'total_value',   label: 'Value (₹)',     format: fmt.dec, align: 'right' },
    ],
    valueSumKey: 'total_value',
  },
  'material-return': {
    title: 'Material Return Report', section: '2.4', showDateRange: true,
    desc: 'Site-to-store material returns with quantity and condition details.',
    cols: [
      { key: 'return_date',   label: 'Date',          format: fmt.date },
      { key: 'project_name',  label: 'Project',       format: fmt.str },
      { key: 'category',      label: 'Category',      format: fmt.str },
      { key: 'material_name', label: 'Material',      format: fmt.str, bold: true },
      { key: 'unit',          label: 'Unit',          format: fmt.str },
      { key: 'return_qty',    label: 'Return Qty',    format: fmt.qty, align: 'right' },
      { key: 'return_ref',    label: 'Reference',     format: fmt.str },
      { key: 'returned_by',   label: 'Returned By',   format: fmt.str },
    ],
  },
  'gate-pass': {
    title: 'Gate Pass Register', section: '2.5', showDateRange: true,
    desc: 'Inward and outward gate passes — vehicles, materials, and timing.',
    cols: [
      { key: 'gate_pass_number', label: 'GP #',         format: fmt.str, bold: true },
      { key: 'pass_date',        label: 'Date',         format: fmt.date },
      { key: 'pass_type',        label: 'Type',         format: fmt.str },
      { key: 'project_name',     label: 'Project',      format: fmt.str },
      { key: 'vehicle_no',       label: 'Vehicle',      format: fmt.str },
      { key: 'issued_to',        label: 'Issued To',    format: fmt.str },
      { key: 'issued_by',        label: 'Issued By',    format: fmt.str },
      { key: 'authorised_by',    label: 'Authorised By',format: fmt.str },
      { key: 'status',           label: 'Status',       format: fmt.str },
      { key: 'item_count',       label: 'Items',        format: fmt.num, align: 'right' },
      { key: 'remarks',          label: 'Remarks',      format: fmt.str },
    ],
  },
  'rejection': {
    title: 'Rejection / Inspection Failure Report', section: '2.6', showDateRange: true,
    desc: 'Materials rejected at QC inspection with reason and vendor details.',
    cols: [
      { key: 'grn_number',        label: 'GRN #',           format: fmt.str, bold: true },
      { key: 'grn_date',          label: 'Date',            format: fmt.date },
      { key: 'project_name',      label: 'Project',         format: fmt.str },
      { key: 'vendor_name',       label: 'Vendor',          format: fmt.str },
      { key: 'po_number',         label: 'PO #',            format: fmt.str },
      { key: 'materials',         label: 'Materials',       format: fmt.str },
      { key: 'rejected_qty',      label: 'Rejected Qty',    format: fmt.qty, align: 'right' },
      { key: 'rejection_reason',  label: 'Reason',          format: fmt.str },
      { key: 'quality_status',    label: 'QC Status',       format: fmt.str },
    ],
  },
  'po-status': {
    title: 'Purchase Order Status Report', section: '3.1', showDateRange: true,
    desc: 'Open, closed, and partially fulfilled POs with delivery tracking.',
    cols: [
      { key: 'po_number',       label: 'PO #',            format: fmt.str, bold: true },
      { key: 'po_date',         label: 'PO Date',         format: fmt.date },
      { key: 'project_name',    label: 'Project',         format: fmt.str },
      { key: 'vendor_name',     label: 'Vendor',          format: fmt.str },
      { key: 'status',          label: 'Status',          format: fmt.str },
      { key: 'grand_total',     label: 'PO Value (₹)',    format: fmt.dec, align: 'right' },
      { key: 'delivery_date',   label: 'Delivery Date',   format: fmt.date },
      { key: 'received_value',  label: 'Received (₹)',    format: fmt.dec, align: 'right' },
      { key: 'pending_value',   label: 'Pending (₹)',     format: fmt.dec, align: 'right', bold: true },
      { key: 'payment_terms',   label: 'Payment Terms',   format: fmt.str },
    ],
    valueSumKey: 'grand_total',
  },
  'grn-invoice-recon': {
    title: 'GRN vs Invoice Reconciliation', section: '3.2', showDateRange: true,
    desc: 'Match goods received notes against supplier invoices for payment.',
    cols: [
      { key: 'grn_number',      label: 'GRN #',          format: fmt.str, bold: true },
      { key: 'grn_date',        label: 'GRN Date',       format: fmt.date },
      { key: 'project_name',    label: 'Project',        format: fmt.str },
      { key: 'vendor_name',     label: 'Vendor',         format: fmt.str },
      { key: 'invoice_number',  label: 'Invoice #',      format: fmt.str },
      { key: 'invoice_date',    label: 'Inv Date',       format: fmt.date },
      { key: 'received_qty',    label: 'Recd Qty',       format: fmt.qty,  align: 'right' },
      { key: 'invoice_amount',  label: 'Inv Amount (₹)', format: fmt.dec,  align: 'right' },
      { key: 'recon_status',    label: 'Recon',          format: fmt.str, bold: true },
      { key: 'bill_status',     label: 'Bill Status',    format: fmt.str },
    ],
  },
  'pending-mrs': {
    title: 'Pending Material Requisition Report', section: '3.3',
    desc: 'MRS/indents awaiting procurement action, sorted by urgency.',
    cols: [
      { key: 'mrs_number',   label: 'MRS #',        format: fmt.str, bold: true },
      { key: 'raised_date',  label: 'Raised Date',  format: fmt.date },
      { key: 'project_name', label: 'Project',      format: fmt.str },
      { key: 'raised_by',    label: 'Raised By',    format: fmt.str },
      { key: 'status',       label: 'Status',       format: fmt.str },
      { key: 'item_count',   label: 'Items',        format: fmt.num, align: 'right' },
      { key: 'materials',    label: 'Materials',    format: fmt.str },
      { key: 'age_days',     label: 'Age (days)',   format: fmt.num, align: 'right', bold: true },
    ],
  },
  'vendor-analysis': {
    title: 'Vendor-wise Purchase Analysis', section: '3.4', showDateRange: true,
    desc: 'Total purchase value, item count, and lead-time per vendor.',
    cols: [
      { key: 'vendor_name',           label: 'Vendor',           format: fmt.str, bold: true },
      { key: 'vendor_type',           label: 'Type',             format: fmt.str },
      { key: 'gstin',                 label: 'GSTIN',            format: fmt.str },
      { key: 'po_count',              label: 'PO Count',         format: fmt.num, align: 'right' },
      { key: 'total_purchase_value',  label: 'Total Value (₹)',  format: fmt.dec, align: 'right', bold: true },
      { key: 'avg_po_value',          label: 'Avg PO Value (₹)', format: fmt.dec, align: 'right' },
      { key: 'project_count',         label: 'Projects',         format: fmt.num, align: 'right' },
      { key: 'projects',              label: 'Project Names',    format: fmt.str },
    ],
    valueSumKey: 'total_purchase_value',
  },
  'rate-comparison': {
    title: 'Rate Comparison Statement', section: '3.5', showDateRange: true,
    desc: 'Quoted vs negotiated vs actual rates across vendors for key items.',
    cols: [
      { key: 'material_name', label: 'Material',    format: fmt.str, bold: true },
      { key: 'unit',          label: 'Unit',        format: fmt.str },
      { key: 'vendor_name',   label: 'Vendor',      format: fmt.str },
      { key: 'po_date',       label: 'PO Date',     format: fmt.date },
      { key: 'project_name',  label: 'Project',     format: fmt.str },
      { key: 'quoted_rate',   label: 'Rate (₹)',    format: fmt.dec, align: 'right' },
      { key: 'quantity',      label: 'Qty',         format: fmt.qty, align: 'right' },
      { key: 'line_total',    label: 'Line Total',  format: fmt.dec, align: 'right' },
      { key: 'min_rate',      label: 'Min Rate',    format: fmt.dec, align: 'right' },
      { key: 'max_rate',      label: 'Max Rate',    format: fmt.dec, align: 'right' },
      { key: 'avg_rate',      label: 'Avg Rate',    format: fmt.dec, align: 'right' },
    ],
  },
  'pending-delivery': {
    title: 'Pending Delivery Report (PO-wise)', section: '3.6',
    desc: 'Overdue and upcoming deliveries against active purchase orders.',
    cols: [
      { key: 'po_number',       label: 'PO #',            format: fmt.str, bold: true },
      { key: 'po_date',         label: 'PO Date',         format: fmt.date },
      { key: 'delivery_date',   label: 'Expected Delivery',format: fmt.date },
      { key: 'project_name',    label: 'Project',         format: fmt.str },
      { key: 'vendor_name',     label: 'Vendor',          format: fmt.str },
      { key: 'grand_total',     label: 'PO Value (₹)',    format: fmt.dec, align: 'right' },
      { key: 'received_value',  label: 'Received (₹)',    format: fmt.dec, align: 'right' },
      { key: 'balance_value',   label: 'Balance (₹)',     format: fmt.dec, align: 'right', bold: true },
      { key: 'overdue_days',    label: 'Overdue Days',    format: fmt.num, align: 'right' },
      { key: 'status',          label: 'Status',          format: fmt.str },
    ],
    valueSumKey: 'balance_value',
  },
  'budget-vs-actual': {
    title: 'Budgeted vs Actual Material Consumption', section: '4.1',
    desc: 'Compare planned material quantities against what was actually issued.',
    cols: [
      { key: 'project_name',             label: 'Project',          format: fmt.str, bold: true },
      { key: 'cost_head',                label: 'Cost Head',        format: fmt.str },
      { key: 'budgeted_amount',          label: 'Budget (₹)',       format: fmt.dec, align: 'right' },
      { key: 'actual_consumption_value', label: 'Actual (₹)',       format: fmt.dec, align: 'right' },
      { key: 'variance',                 label: 'Variance (₹)',     format: fmt.dec, align: 'right', bold: true },
      { key: 'pct_used',                 label: '% Used',           format: fmt.pct, align: 'right' },
    ],
  },
  'project-material-cost': {
    title: 'Project-wise Material Cost Report', section: '4.2', showDateRange: true,
    desc: 'Total material cost per project with category-wise breakdown.',
    cols: [
      { key: 'project_name',       label: 'Project',             format: fmt.str, bold: true },
      { key: 'category',           label: 'Category',            format: fmt.str },
      { key: 'item_count',         label: 'Items',               format: fmt.num,  align: 'right' },
      { key: 'total_issued_qty',   label: 'Issued Qty',          format: fmt.qty,  align: 'right' },
      { key: 'total_issue_value',  label: 'Issue Value (₹)',     format: fmt.dec,  align: 'right', bold: true },
      { key: 'closing_stock_value',label: 'Closing Stock (₹)',   format: fmt.dec,  align: 'right' },
    ],
    valueSumKey: 'total_issue_value',
  },
  'wo-material-issue': {
    title: 'Work Order-wise Material Issue Report', section: '4.3', showDateRange: true,
    desc: 'Materials issued against each work order for sub-contractor billing.',
    cols: [
      { key: 'issue_date',    label: 'Date',         format: fmt.date },
      { key: 'project_name', label: 'Project',       format: fmt.str },
      { key: 'wo_number',    label: 'WO #',         format: fmt.str, bold: true },
      { key: 'material_name',label: 'Material',      format: fmt.str },
      { key: 'category',     label: 'Category',      format: fmt.str },
      { key: 'unit',         label: 'Unit',          format: fmt.str },
      { key: 'issued_qty',   label: 'Issued Qty',   format: fmt.qty, align: 'right' },
      { key: 'unit_rate',    label: 'Rate',          format: fmt.dec, align: 'right' },
      { key: 'value',        label: 'Value (₹)',    format: fmt.dec, align: 'right' },
      { key: 'issued_by',    label: 'Issued By',    format: fmt.str },
    ],
    valueSumKey: 'value',
  },
  'wastage-scrap': {
    title: 'Wastage & Scrap Report', section: '4.4', showDateRange: true, showCategory: true,
    desc: 'Quantity and value of materials scrapped or written off by site.',
    cols: [
      { key: 'date',             label: 'Date',          format: fmt.date },
      { key: 'project_name',     label: 'Project',       format: fmt.str },
      { key: 'category',         label: 'Category',      format: fmt.str },
      { key: 'material_name',    label: 'Material',      format: fmt.str, bold: true },
      { key: 'unit',             label: 'Unit',          format: fmt.str },
      { key: 'qty',              label: 'Qty',           format: fmt.qty, align: 'right' },
      { key: 'unit_rate',        label: 'Rate',          format: fmt.dec, align: 'right' },
      { key: 'value',            label: 'Value (₹)',    format: fmt.dec, align: 'right' },
      { key: 'transaction_type', label: 'Type',          format: fmt.str },
      { key: 'remarks',          label: 'Remarks',       format: fmt.str },
      { key: 'recorded_by',      label: 'Recorded By',  format: fmt.str },
    ],
    valueSumKey: 'value',
  },
  'material-recon': {
    title: 'Material Reconciliation Report', section: '4.5', showDateRange: true,
    desc: 'Opening stock + receipts − issues = closing stock reconciliation.',
    cols: [
      { key: 'project_name',    label: 'Project',         format: fmt.str },
      { key: 'category',        label: 'Category',        format: fmt.str },
      { key: 'material_name',   label: 'Material',        format: fmt.str, bold: true },
      { key: 'unit',            label: 'Unit',            format: fmt.str },
      { key: 'opening_stock',   label: 'Opening',         format: fmt.qty, align: 'right' },
      { key: 'total_received',  label: 'Received',        format: fmt.qty, align: 'right' },
      { key: 'total_issued',    label: 'Issued',          format: fmt.qty, align: 'right' },
      { key: 'computed_closing',label: 'Computed Closing',format: fmt.qty, align: 'right' },
      { key: 'book_closing',    label: 'Book Closing',    format: fmt.qty, align: 'right' },
      { key: 'variance',        label: 'Variance',        format: fmt.qty, align: 'right', bold: true },
    ],
  },
  'cost-code': {
    title: 'Cost Code-wise Material Expenditure', section: '4.6', showDateRange: true,
    desc: 'Material spend mapped to BOQ cost codes for budget tracking.',
    cols: [
      { key: 'project_name',     label: 'Project',       format: fmt.str, bold: true },
      { key: 'cost_head',        label: 'Cost Head',     format: fmt.str },
      { key: 'category',         label: 'Category',      format: fmt.str },
      { key: 'item_count',       label: 'Items',         format: fmt.num, align: 'right' },
      { key: 'total_issued_qty', label: 'Total Issued',  format: fmt.qty, align: 'right' },
      { key: 'total_value',      label: 'Total Value (₹)',format: fmt.dec, align: 'right', bold: true },
    ],
    valueSumKey: 'total_value',
  },
  'inventory-valuation': {
    title: 'Inventory Valuation Report', section: '5.1', showCategory: true,
    desc: 'Stock value using Weighted Average cost method.',
    cols: [
      { key: 'project_name',        label: 'Project',       format: fmt.str },
      { key: 'category',            label: 'Category',      format: fmt.str },
      { key: 'material_name',       label: 'Material',      format: fmt.str, bold: true },
      { key: 'unit',                label: 'Unit',          format: fmt.str },
      { key: 'quantity',            label: 'Qty',           format: fmt.qty, align: 'right' },
      { key: 'weighted_avg_rate',   label: 'WA Rate (₹)',   format: fmt.dec, align: 'right' },
      { key: 'stock_value',         label: 'Stock Value (₹)',format: fmt.dec, align: 'right', bold: true },
      { key: 'site_location',       label: 'Location',      format: fmt.str },
      { key: 'last_updated',        label: 'Last Updated',  format: fmt.date },
    ],
    valueSumKey: 'stock_value',
  },
  'physical-vs-book': {
    title: 'Physical Verification vs Book Stock', section: '5.2', showDateRange: true,
    desc: 'Variance between physical count and system-recorded quantities.',
    cols: [
      { key: 'verification_date',  label: 'Date',            format: fmt.date },
      { key: 'project_name',       label: 'Project',         format: fmt.str },
      { key: 'material_name',      label: 'Material',        format: fmt.str, bold: true },
      { key: 'unit',               label: 'Unit',            format: fmt.str },
      { key: 'book_quantity',      label: 'Book Qty',        format: fmt.qty, align: 'right' },
      { key: 'physical_quantity',  label: 'Physical Qty',    format: fmt.qty, align: 'right' },
      { key: 'variance',           label: 'Variance',        format: fmt.qty, align: 'right', bold: true },
      { key: 'variance_type',      label: 'Variance Type',   format: fmt.str },
      { key: 'verified_by',        label: 'Verified By',     format: fmt.str },
      { key: 'remarks',            label: 'Remarks',         format: fmt.str },
    ],
  },
  'expiry-tracking': {
    title: 'Expiry & Shelf Life Tracking', section: '5.3', showCategory: true,
    desc: 'Items nearing or past expiry — chemicals, consumables, and coatings.',
    cols: [
      { key: 'project_name',   label: 'Project',          format: fmt.str },
      { key: 'category',       label: 'Category',         format: fmt.str },
      { key: 'material_name',  label: 'Material',         format: fmt.str, bold: true },
      { key: 'unit',           label: 'Unit',             format: fmt.str },
      { key: 'batch_number',   label: 'Batch #',          format: fmt.str },
      { key: 'qty',            label: 'Qty',              format: fmt.qty, align: 'right' },
      { key: 'received_date',  label: 'Received',         format: fmt.date },
      { key: 'expiry_date',    label: 'Expiry',           format: fmt.date, bold: true },
      { key: 'days_to_expiry', label: 'Days to Expiry',   format: fmt.num,  align: 'right' },
      { key: 'expiry_status',  label: 'Status',           format: fmt.str, bold: true },
    ],
  },
  'abc-analysis': {
    title: 'ABC Analysis Report', section: '5.4', showDateRange: true,
    desc: 'Classify inventory into A / B / C categories by consumption value.',
    cols: [
      { key: 'project_name',      label: 'Project',        format: fmt.str },
      { key: 'category',          label: 'Category',       format: fmt.str },
      { key: 'material_name',     label: 'Material',       format: fmt.str, bold: true },
      { key: 'unit',              label: 'Unit',           format: fmt.str },
      { key: 'consumption_value', label: 'Consumption (₹)',format: fmt.dec, align: 'right' },
      { key: 'pct',               label: '% of Total',     format: fmt.pct, align: 'right' },
      { key: 'cumulative_pct',    label: 'Cumulative %',   format: fmt.pct, align: 'right' },
      { key: 'abc_class',         label: 'Class',          format: fmt.str, bold: true },
    ],
    valueSumKey: 'consumption_value',
  },
  'stock-ageing': {
    title: 'Stock Ageing Report', section: '5.5', showCategory: true,
    desc: 'Age buckets (0–30, 31–60, 61–90, 90+ days) for all stock items.',
    cols: [
      { key: 'project_name',  label: 'Project',      format: fmt.str },
      { key: 'category',      label: 'Category',     format: fmt.str },
      { key: 'material_name', label: 'Material',     format: fmt.str, bold: true },
      { key: 'unit',          label: 'Unit',         format: fmt.str },
      { key: 'batch_number',  label: 'Batch #',     format: fmt.str },
      { key: 'qty',           label: 'Qty',          format: fmt.qty, align: 'right' },
      { key: 'unit_rate',     label: 'Rate',         format: fmt.dec, align: 'right' },
      { key: 'value',         label: 'Value (₹)',   format: fmt.dec, align: 'right' },
      { key: 'received_date', label: 'Received',     format: fmt.date },
      { key: 'age_days',      label: 'Age (days)',   format: fmt.num, align: 'right', bold: true },
      { key: 'age_bucket',    label: 'Bucket',       format: fmt.str },
    ],
    valueSumKey: 'value',
  },
  'audit-trail': {
    title: 'Audit Trail Report', section: '5.6', showDateRange: true, showCategory: true,
    desc: 'Full log of stock adjustments, corrections, and who made them.',
    cols: [
      { key: 'transacted_at',     label: 'Date / Time',    format: fmt.dt },
      { key: 'project_name',      label: 'Project',        format: fmt.str },
      { key: 'category',          label: 'Category',       format: fmt.str },
      { key: 'material_name',     label: 'Material',       format: fmt.str, bold: true },
      { key: 'unit',              label: 'Unit',           format: fmt.str },
      { key: 'transaction_type',  label: 'Transaction',    format: fmt.str },
      { key: 'quantity',          label: 'Qty',            format: fmt.qty, align: 'right' },
      { key: 'reference_number',  label: 'Reference',      format: fmt.str },
      { key: 'remarks',           label: 'Remarks',        format: fmt.str },
      { key: 'transacted_by',     label: 'By',             format: fmt.str },
    ],
  },
  'daily-activity': {
    title: 'Daily Store Activity Report', section: '6.1', showDateRange: true,
    desc: 'All receipts, issues, returns, and transfers for a selected date.',
    cols: [
      { key: 'activity_date',     label: 'Date',           format: fmt.date },
      { key: 'project_name',      label: 'Project',        format: fmt.str },
      { key: 'category',          label: 'Category',       format: fmt.str },
      { key: 'material_name',     label: 'Material',       format: fmt.str, bold: true },
      { key: 'unit',              label: 'Unit',           format: fmt.str },
      { key: 'transaction_type',  label: 'Transaction',    format: fmt.str },
      { key: 'quantity',          label: 'Qty',            format: fmt.qty, align: 'right' },
      { key: 'value',             label: 'Value (₹)',     format: fmt.dec, align: 'right' },
      { key: 'reference_number',  label: 'Reference',      format: fmt.str },
      { key: 'transacted_by',     label: 'By',             format: fmt.str },
    ],
    valueSumKey: 'value',
  },
  'monthly-consumption': {
    title: 'Monthly Material Consumption Summary', section: '6.2', showDateRange: true, showCategory: true,
    desc: 'Month-over-month consumption trends by item and category.',
    cols: [
      { key: 'month',           label: 'Month',          format: fmt.str, bold: true },
      { key: 'project_name',    label: 'Project',        format: fmt.str },
      { key: 'category',        label: 'Category',       format: fmt.str },
      { key: 'material_name',   label: 'Material',       format: fmt.str },
      { key: 'unit',            label: 'Unit',           format: fmt.str },
      { key: 'total_issued',    label: 'Total Issued',   format: fmt.qty, align: 'right' },
      { key: 'total_value',     label: 'Value (₹)',     format: fmt.dec, align: 'right' },
    ],
    valueSumKey: 'total_value',
  },
  'project-utilization': {
    title: 'Project-wise Store Utilization Report', section: '6.3', showDateRange: true,
    desc: 'Store throughput, utilization rate, and material flow per project.',
    cols: [
      { key: 'project_name',        label: 'Project',           format: fmt.str, bold: true },
      { key: 'item_types',          label: 'Item Types',        format: fmt.num, align: 'right' },
      { key: 'total_received',      label: 'Total Received',    format: fmt.qty, align: 'right' },
      { key: 'total_issued',        label: 'Total Issued',      format: fmt.qty, align: 'right' },
      { key: 'issue_value',         label: 'Issue Value (₹)',   format: fmt.dec, align: 'right', bold: true },
      { key: 'closing_stock_value', label: 'Closing Stock (₹)', format: fmt.dec, align: 'right' },
    ],
    valueSumKey: 'issue_value',
  },
  'category-summary': {
    title: 'Category-wise Material Summary', section: '6.4', showDateRange: true,
    desc: 'Stock and movement by material category — civil, MEP, safety, etc.',
    cols: [
      { key: 'project_name',      label: 'Project',          format: fmt.str, bold: true },
      { key: 'category',          label: 'Category',         format: fmt.str, bold: true },
      { key: 'item_count',        label: 'Items',            format: fmt.num, align: 'right' },
      { key: 'total_closing_qty', label: 'Closing Qty',      format: fmt.qty, align: 'right' },
      { key: 'closing_value',     label: 'Closing Value (₹)',format: fmt.dec, align: 'right' },
      { key: 'issued_qty',        label: 'Issued Qty',       format: fmt.qty, align: 'right' },
      { key: 'issued_value',      label: 'Issued Value (₹)', format: fmt.dec, align: 'right' },
    ],
    valueSumKey: 'closing_value',
  },
  'closing-stock': {
    title: 'Store-wise Closing Stock Report', section: '6.5', showCategory: true,
    desc: 'Closing balances across all stores and sites as of today.',
    cols: [
      { key: 'project_name',  label: 'Project',       format: fmt.str },
      { key: 'category',      label: 'Category',      format: fmt.str },
      { key: 'material_name', label: 'Material',      format: fmt.str, bold: true },
      { key: 'unit',          label: 'Unit',          format: fmt.str },
      { key: 'closing_stock', label: 'Closing Qty',  format: fmt.qty, align: 'right', bold: true },
      { key: 'unit_rate',     label: 'Rate (₹)',     format: fmt.dec, align: 'right' },
      { key: 'closing_value', label: 'Value (₹)',   format: fmt.dec, align: 'right' },
      { key: 'site_location', label: 'Location',     format: fmt.str },
      { key: 'reorder_level', label: 'Reorder Level',format: fmt.qty, align: 'right' },
      { key: 'status',        label: 'Status',       format: fmt.str },
    ],
    valueSumKey: 'closing_value',
  },
  'top-consumed': {
    title: 'Top Consumed Items Report', section: '6.6', showDateRange: true, showCategory: true,
    desc: 'Highest-consumption materials by quantity and value in a period.',
    cols: [
      { key: 'project_name',    label: 'Project',          format: fmt.str },
      { key: 'category',        label: 'Category',         format: fmt.str },
      { key: 'material_name',   label: 'Material',         format: fmt.str, bold: true },
      { key: 'unit',            label: 'Unit',             format: fmt.str },
      { key: 'total_issued_qty',label: 'Total Issued',     format: fmt.qty, align: 'right' },
      { key: 'unit_rate',       label: 'Rate (₹)',        format: fmt.dec, align: 'right' },
      { key: 'total_value',     label: 'Total Value (₹)', format: fmt.dec, align: 'right', bold: true },
      { key: 'issue_days',      label: 'Issue Days',       format: fmt.num, align: 'right' },
    ],
    valueSumKey: 'total_value',
  },
};

// ── CSV export ─────────────────────────────────────────────────────────────────
function exportCSV(cols, rows, filename) {
  const header = cols.map(c => `"${c.label}"`).join(',');
  const lines  = rows.map(row =>
    cols.map(c => {
      const raw = row[c.key];
      const val = raw == null ? '' : String(raw).replace(/"/g, '""');
      return `"${val}"`;
    }).join(',')
  );
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  page:    { minHeight: '100vh', background: '#F8FAFC', padding: '24px 24px 60px' },
  wrap:    { maxWidth: 1400, margin: '0 auto' },
  card:    { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' },
  filters: { display: 'flex', flexWrap: 'wrap', gap: 12, padding: '16px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' },
  label:   { fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, display: 'block', letterSpacing: '0.04em' },
  input:   { border: '1px solid #E2E8F0', borderRadius: 7, padding: '6px 10px', fontSize: 13, color: '#0F172A', background: '#fff', outline: 'none', width: '100%' },
  btn:     { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none' },
  thCell:  { padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' },
  tdCell:  { padding: '9px 12px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #F1F5F9' },
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function StoresReportViewer() {
  const { type } = useParams();
  const meta = REPORT_META[type];

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [fromDate,  setFromDate]  = useState(monthAgo);
  const [toDate,    setToDate]    = useState(today);
  const [projectId, setProjectId] = useState('');
  const [category,  setCategory]  = useState('');
  const [days,      setDays]      = useState('90');
  const [runKey,    setRunKey]    = useState(0);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list({ limit: 200 }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 300000,
  });

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['stores-report', type, fromDate, toDate, projectId, category, days, runKey],
    queryFn:  () => storesReportAPI.get(type, {
      from_date:  fromDate,
      to_date:    toDate,
      project_id: projectId || undefined,
      category:   category  || undefined,
      days:       days || '90',
    }).then(r => r.data?.data ?? []),
    enabled:   runKey > 0,
    staleTime: 0,
  });

  const rows = data ?? [];

  const totalValue = meta?.valueSumKey
    ? rows.reduce((s, r) => s + (parseFloat(r[meta.valueSumKey]) || 0), 0)
    : null;

  const handleRun = () => setRunKey(k => k + 1);

  const handleExport = useCallback(() => {
    if (!meta || !rows.length) return;
    exportCSV(meta.cols, rows, `${meta.section}-${meta.title.replace(/[^a-z0-9]/gi, '-')}.csv`);
  }, [meta, rows]);

  if (!meta) {
    return (
      <div style={{ ...S.page }}>
        <div style={{ ...S.wrap }}>
          <div style={{ ...S.card, padding: '40px', textAlign: 'center' }}>
            <AlertCircle size={36} color="#EF4444" style={{ marginBottom: 12 }} />
            <h2 style={{ color: '#0F172A' }}>Unknown report type: <code>{type}</code></h2>
            <Link to="/stores/reports" style={{ color: '#2563EB', fontSize: 14 }}>Back to Reports</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* ── Breadcrumb ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#64748B' }}>
          <Link to="/stores/reports" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748B', textDecoration: 'none' }}>
            <ChevronLeft size={15} />
            Stores Reports
          </Link>
          <span>·</span>
          <span style={{ color: '#0F172A', fontWeight: 600 }}>{meta.section} — {meta.title}</span>
        </div>

        {/* ── Page Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,#0F172A,#1E3A5F)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Warehouse size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>{meta.title}</h1>
              <p style={{ fontSize: 13, color: '#64748B', margin: '2px 0 0' }}>{meta.desc}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={handleExport} disabled={!rows.length}
              style={{ ...S.btn, background: rows.length ? '#F0FDF4' : '#F8FAFC', color: rows.length ? '#15803D' : '#94A3B8', border: '1px solid', borderColor: rows.length ? '#BBF7D0' : '#E2E8F0' }}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        {/* ── Filter Card ── */}
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={S.filters}>

            {meta.showDateRange !== false && (
              <>
                <div>
                  <span style={S.label}>From Date</span>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ ...S.input, width: 140 }} />
                </div>
                <div>
                  <span style={S.label}>To Date</span>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ ...S.input, width: 140 }} />
                </div>
              </>
            )}

            <div>
              <span style={S.label}>Project</span>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...S.input, width: 180 }}>
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {meta.showCategory && (
              <div>
                <span style={S.label}>Category</span>
                <input placeholder="e.g. Civil" value={category} onChange={e => setCategory(e.target.value)} style={{ ...S.input, width: 140 }} />
              </div>
            )}

            {meta.showDays && (
              <div>
                <span style={S.label}>Idle Days (&ge;)</span>
                <input type="number" min="1" value={days} onChange={e => setDays(e.target.value)} style={{ ...S.input, width: 100 }} />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button onClick={handleRun} style={{ ...S.btn, background: '#1E3A5F', color: '#fff' }}>
                {isFetching ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Filter size={14} />}
                {isFetching ? 'Loading…' : 'Run Report'}
              </button>
              {runKey > 0 && !isFetching && (
                <button onClick={handleRun} style={{ ...S.btn, background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          </div>

          {/* ── Summary Strip ── */}
          {runKey > 0 && !isFetching && !isError && (
            <div style={{ display: 'flex', gap: 24, padding: '10px 20px', borderTop: '1px solid #F1F5F9', background: '#fff' }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>{rows.length.toLocaleString('en-IN')}</span>
                <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 6 }}>rows</span>
              </div>
              {totalValue != null && (
                <div>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#15803D' }}>
                    ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                  <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 6 }}>total value</span>
                </div>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 12 }}>
                <BarChart3 size={13} />
                Section {meta.section}
              </div>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        {runKey === 0 && (
          <div style={{ ...S.card, padding: '60px 24px', textAlign: 'center', color: '#94A3B8' }}>
            <Filter size={36} color="#CBD5E1" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#64748B', margin: '0 0 6px' }}>Set filters and click Run Report</p>
            <p style={{ fontSize: 13 }}>Results will appear here.</p>
          </div>
        )}

        {runKey > 0 && isFetching && (
          <div style={{ ...S.card, padding: '60px 24px', textAlign: 'center', color: '#94A3B8' }}>
            <Loader2 size={32} color="#2563EB" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>Running report…</p>
          </div>
        )}

        {runKey > 0 && isError && (
          <div style={{ ...S.card, padding: '40px 24px', textAlign: 'center' }}>
            <AlertCircle size={32} color="#EF4444" style={{ marginBottom: 10 }} />
            <p style={{ color: '#EF4444', fontWeight: 600, margin: '0 0 4px' }}>Error loading report</p>
            <p style={{ color: '#64748B', fontSize: 13 }}>{error?.response?.data?.error || error?.message}</p>
          </div>
        )}

        {runKey > 0 && !isFetching && !isError && rows.length === 0 && (
          <div style={{ ...S.card, padding: '60px 24px', textAlign: 'center', color: '#94A3B8' }}>
            <BarChart3 size={36} color="#CBD5E1" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#64748B' }}>No data found for the selected filters.</p>
          </div>
        )}

        {runKey > 0 && !isFetching && !isError && rows.length > 0 && (
          <div style={{ ...S.card }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...S.thCell, width: 36, textAlign: 'center' }}>#</th>
                    {meta.cols.map(c => (
                      <th key={c.key} style={{ ...S.thCell, textAlign: c.align === 'right' ? 'right' : 'left' }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ ...S.tdCell, textAlign: 'center', color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</td>
                      {meta.cols.map(c => (
                        <td key={c.key} style={{
                          ...S.tdCell,
                          textAlign: c.align === 'right' ? 'right' : 'left',
                          fontWeight: c.bold ? 600 : undefined,
                          fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : undefined,
                        }}>
                          {c.format(row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length >= 2000 && (
              <div style={{ padding: '12px 20px', fontSize: 12, color: '#94A3B8', borderTop: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                Showing first 2,000 rows. Narrow filters for a smaller result set or use Export CSV for full data.
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg);} to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
