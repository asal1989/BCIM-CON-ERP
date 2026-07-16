// src/pages/users/UsersPage.jsx — Team Members (Redesigned)
import React, { useMemo, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Users, Plus, Edit2, Trash2, RotateCcw, Key,
  Mail, Phone, Shield, CheckCircle2, XCircle,
  Search, X, Eye, EyeOff, UserCheck, UserX, Building2,
  Download, Upload, FileSpreadsheet, ChevronDown,
  LayoutGrid, List, MoreVertical, Lock, RefreshCw,
  Briefcase, Calendar, LogIn, Filter, Sparkles,
  AlertTriangle, Check, Link2
} from 'lucide-react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../../api/client';
import useAuthStore from '../../store/authStore';
dayjs.extend(relativeTime);

/* ═══════════════════════════════════════════════════════ CONSTANTS */

const ROLES = [
  { value: 'super_admin',           label: 'Super Admin',            color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
  { value: 'admin',                 label: 'Admin',                  color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  { value: 'managing_director',     label: 'Managing Director (MD)', color: '#9333EA', bg: '#FAF5FF', border: '#E9D5FF' },
  { value: 'management',            label: 'Management',             color: '#9333EA', bg: '#FAF5FF', border: '#E9D5FF' },
  { value: 'project_head',          label: 'Project Head',           color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
  { value: 'project_manager',       label: 'Project Manager',        color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  { value: 'planning_engineer',     label: 'Planning Engineer',      color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  { value: 'site_engineer',         label: 'Site Engineer',          color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
  { value: 'qs_engineer',           label: 'QS Engineer',            color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
  { value: 'billing_engineer',      label: 'Billing Engineer',       color: '#F97316', bg: '#FFF7ED', border: '#FED7AA' },
  { value: 'contracts_manager',     label: 'Contracts Manager',      color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  { value: 'procurement_manager',   label: 'Procurement Manager',    color: '#CA8A04', bg: '#FEFCE8', border: '#FEF08A' },
  { value: 'purchase_executive',    label: 'Purchase Executive',     color: '#A16207', bg: '#FEFCE8', border: '#FEF08A' },
  { value: 'stores_manager',        label: 'Stores Manager',         color: '#0F766E', bg: '#F0FDFA', border: '#99F6E4' },
  { value: 'store_keeper',          label: 'Store Keeper',           color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
  { value: 'accountant',            label: 'Accountant',             color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { value: 'accounts_manager',      label: 'Accounts Manager',       color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  { value: 'finance_manager',       label: 'Finance Manager',        color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
  { value: 'hse_officer',           label: 'HSE Officer',            color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3' },
  { value: 'safety_supervisor',     label: 'Safety Supervisor',      color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  { value: 'quality_manager',       label: 'Quality Manager',        color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  { value: 'qa_qc_engineer',        label: 'QA/QC Engineer',         color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  { value: 'hr',                    label: 'HR',                     color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { value: 'hr_admin',              label: 'HR Admin',               color: '#6D28D9', bg: '#F5F3FF', border: '#C4B5FD' },
  { value: 'hr_manager',            label: 'HR Manager',             color: '#5B21B6', bg: '#F5F3FF', border: '#A78BFA' },
  { value: 'document_controller',   label: 'Document Controller',    color: '#475569', bg: '#F8FAFC', border: '#E2E8F0' },
  { value: 'subcontractor_manager', label: 'SC Manager',             color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
  { value: 'sc_coordinator',        label: 'SC Coordinator',         color: '#F97316', bg: '#FFF7ED', border: '#FED7AA' },
  { value: 'tender_manager',        label: 'Tender Manager',         color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
  { value: 'plant_manager',         label: 'P&M Manager',            color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  { value: 'it_admin',              label: 'IT Admin',               color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
  { value: 'security_guard',        label: 'Security Guard',         color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  { value: 'employee',              label: 'Employee',               color: '#0F766E', bg: '#F0FDFA', border: '#99F6E4' },
  { value: 'viewer',                label: 'Viewer',                  color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
];

const DEPARTMENTS = [
  'Board / Directors','Management','Projects','Civil & Structural',
  'QS & Estimation','Billing','Planning','Procurement','Stores',
  'Finance & Accounts','HR & Admin','Quality (QA/QC)','HSE',
  'Electrical','Plumbing & MEP','Mechanical','Tender','Contracts',
  'Bill Tracker','Document Control','CRM','Plant & Machinery',
  'Assets','IT','Legal & Compliance','Security','Survey',
  'Subcontractor Management','Administration','Automation','Housekeeping',
];

const AVAILABLE_MODULES = [
  'Overview','Planning','HR & Admin','Procurement','Tender Management',
  'Stores','Stores Petty Cash',
  'QS & Billing','Finance','Bill Tracker',
  'Quality (QA/QC)','HSE & Safety',
  'Plant & Machinery','Hire & Rental','Assets & IT',
  'Subcontractors','DMS','Documents','Administration',
  'Automation Ideas','Approval Engine','Reports',
];

const ROLE_MODULE_PRESETS = {
  management:            ['Overview','Planning','Procurement','Tender Management','Stores','QS & Billing','Finance','Bill Tracker','Quality (QA/QC)','HSE & Safety','Subcontractors','Plant & Machinery','Hire & Rental','Reports','Assets & IT','DMS','Documents','Automation Ideas','Approval Engine'],
  project_head:          ['Overview','Planning','Procurement','Stores','QS & Billing','Subcontractors','Quality (QA/QC)','HSE & Safety','Plant & Machinery','Hire & Rental','Reports','Assets & IT','Documents','Approval Engine'],
  project_manager:       ['Overview','Planning','Procurement','Stores','QS & Billing','Subcontractors','Quality (QA/QC)','HSE & Safety','Plant & Machinery','Hire & Rental','Reports','Documents'],
  planning_engineer:     ['Overview','Planning','Documents','Reports'],
  site_engineer:         ['Overview','Planning','Stores','Quality (QA/QC)','HSE & Safety','Hire & Rental','Documents'],
  qs_engineer:           ['Overview','QS & Billing','Subcontractors','Bill Tracker','Hire & Rental','Reports','Documents'],
  billing_engineer:      ['Overview','QS & Billing','Subcontractors','Finance','Bill Tracker','Hire & Rental','Reports'],
  contracts_manager:     ['Overview','Procurement','QS & Billing','Subcontractors','Documents'],
  subcontractor_manager: ['Overview','Subcontractors','QS & Billing','Procurement','Stores','Finance','Reports','Documents'],
  sc_coordinator:        ['Overview','Subcontractors','QS & Billing','Documents'],
  procurement_manager:   ['Overview','Procurement','Tender Management','Stores','Finance','Reports','Documents'],
  purchase_executive:    ['Overview','Procurement','Stores','Documents'],
  stores_manager:        ['Overview','Stores','Procurement','Quality (QA/QC)','Documents'],
  store_keeper:          ['Overview','Stores','Documents'],
  accountant:            ['Overview','Finance','Procurement','QS & Billing','Subcontractors','Bill Tracker','Hire & Rental','Reports'],
  accounts_manager:      ['Overview','Finance','Procurement','QS & Billing','Subcontractors','Bill Tracker','Hire & Rental','Reports'],
  finance_manager:       ['Overview','Finance','Procurement','QS & Billing','Subcontractors','Bill Tracker','Hire & Rental','Reports'],
  hse_officer:           ['Overview','HSE & Safety','Documents','Reports'],
  safety_supervisor:     ['Overview','HSE & Safety','Documents'],
  quality_manager:       ['Overview','Quality (QA/QC)','Stores','Documents','Reports'],
  qa_qc_engineer:        ['Overview','Quality (QA/QC)','Stores','Documents'],
  hr:                    ['Overview','HR & Admin','Administration','Reports'],
  document_controller:   ['Overview','Documents','DMS','Planning','Quality (QA/QC)','HSE & Safety'],
  tender_manager:        ['Overview','Tender Management','Procurement','Reports','Documents'],
  it_admin:              ['Overview','Assets & IT','Administration','Documents'],
  employee:              ['Overview','Documents'],
  viewer:                ['Overview','Reports'],
};

const BLANK_FORM = {
  name:'', email:'', phone:'', password:'',
  role:'site_engineer', designation:'', department:'Civil & Structural',
  accessible_modules:[], accessible_menus:{}, project_ids:[], vendor_id:'',
};

// Menu items per module — mirrors navGroups in Layout.jsx (paths only, no icons needed here)
const MENU_CONFIG = {
  'Overview': [
    { to:'/approvals', label:'My Approvals' },
    { to:'/dashboard', label:'Dashboard' },
    { to:'/projects',  label:'Projects' },
  ],
  'Planning': [
    { to:'/planning',               label:'P&E Dashboard' },
    { to:'/planning/p6-dashboard',  label:'P6 EVM Dashboard' },
    { to:'/planning/wbs',           label:'WBS Editor' },
    { to:'/planning/activities',    label:'Schedule & Activities' },
    { to:'/planning/milestones',    label:'Milestones' },
    { to:'/planning/look-ahead',    label:'Look-Ahead Plan' },
    { to:'/planning/progress',      label:'Progress & S-Curve' },
    { to:'/planning/delays',        label:'Delay Analysis' },
    { to:'/planning/risks',         label:'Risk Register' },
    { to:'/planning/mrp',           label:'Material Plan (MRP)' },
    { to:'/planning/engineer-log',  label:'Engineer Daily Log' },
    { to:'/planning/dpr-console',   label:'Daily Progress (DPR)' },
    { to:'/planning/reports',       label:'Planning Reports' },
    { to:'/planning/documents',     label:'Documents' },
  ],
  'Procurement': [
    { to:'/procurement/dashboard',            label:'Dashboard' },
    { to:'/procurement/material-request',     label:'Material Request (MRS)' },
    { to:'/procurement/vendors',              label:'Vendors' },
    { to:'/procurement/live-rate-checker',    label:'Live Rate Checker' },
    { to:'/procurement/rate-contracts',       label:'Rate Contracts' },
    { to:'/procurement/rfqs',                 label:'RFQ' },
    { to:'/procurement/quotations',           label:'Quotations' },
    { to:'/procurement/comparative-statements', label:'Comparative Statements' },
    { to:'/procurement/po',                   label:'Purchase Orders' },
    { to:'/procurement/po-amendments',        label:'PO Amendments' },
    { to:'/procurement/po-register',          label:'PO Register' },
    { to:'/procurement/budget-control',       label:'Budget & Cost Control' },
    { to:'/procurement/po-bulk-import',       label:'Import POs (Bulk)' },
    { to:'/procurement/work-orders',          label:'Work Orders' },
    { to:'/procurement/wo-register',          label:'WO Register' },
    { to:'/procurement/wo-bulk-import',       label:'Import WOs (Bulk)' },
    { to:'/procurement/vendor-performance',   label:'Vendor Performance' },
    { to:'/procurement/vendor-payments',      label:'Vendor Payments' },
    { to:'/procurement/vendor-mapping',       label:'Vendor–Project Mapping' },
    { to:'/procurement/inventory',            label:'Inventory' },
    { to:'/procurement/documents',            label:'Documents' },
    { to:'/procurement/reports',              label:'Reports' },
    { to:'/procurement/alerts',               label:'Alerts' },
    { to:'/procurement/tenders',              label:'Tenders (BD)' },
    { to:'/procurement/bid-opportunities',    label:'Bid Opportunities' },
  ],
  'Tender Management': [
    { to:'/tender-management',           label:'Tender Register' },
    { to:'/tender-management/issue',     label:'Tender Issuance' },
    { to:'/tender-management/register',  label:'Bid Opportunities' },
    { to:'/tender-management/documents', label:'Documents' },
  ],
  'Stores': [
    { to:'/stores',                    label:'Stores Dashboard' },
    { to:'/stores/mrs',                label:'Material Requisition' },
    { to:'/stores/po',                 label:'Purchase Orders' },
    { to:'/stores/po-register',        label:'PO Register' },
    { to:'/stores/work-orders',        label:'Work Orders' },
    { to:'/stores/wo-register',        label:'WO Register' },
    { to:'/stores/grs',                label:'GRS (Security Gate)' },
    { to:'/stores/ign',                label:'IGN (Inward Goods)' },
    { to:'/stores/gate-pass',          label:'Gate Pass' },
    { to:'/stores/material-tracker',   label:'Material Tracker' },
    { to:'/stores/ledger',             label:'Store Ledger' },
    { to:'/stores/issue',              label:'Issue Slip' },
    { to:'/stores/mtr',                label:'Material Transfer' },
    { to:'/stores/stock-verification', label:'Stock Verification' },
    { to:'/stores/credit-notes',       label:'Credit Notes' },
    { to:'/stores/petty-cash',         label:'Petty Cash Tracker' },
    { to:'/stores/documents',          label:'Documents' },
  ],
  'QS & Billing': [
    { to:'/qs',                        label:'QS Dashboard' },
    { to:'/qs/boq',                    label:'BOQ & Estimation' },
    { to:'/qs/boq-mapping',            label:'BOQ SC Mapping' },
    { to:'/qs/boq-dashboard',          label:'BOQ Margin Dashboard' },
    { to:'/procurement/boq-budget',    label:'BOQ Budget Breakdown' },
    { to:'/qs/measurements',           label:'Measurement Book' },
    { to:'/qs/ra-bills',               label:'RA Bills' },
    { to:'/qs/po',                     label:'Purchase Orders' },
    { to:'/qs/po-register',            label:'PO Register' },
    { to:'/qs/work-orders',            label:'Work Orders' },
    { to:'/qs/wo-register',            label:'WO Register' },
    { to:'/qs/price-escalation',       label:'Price Escalation' },
    { to:'/qs/vendor-certifications',  label:'Vendor QS Certification' },
    { to:'/qs/retention-releases',     label:'Retention Release' },
    { to:'/qs/variations',             label:'Variation Orders' },
    { to:'/qs/material-recon',         label:'Material Recon' },
    { to:'/qs/norms',                  label:'Consumption Norms' },
    { to:'/qs/reports',                label:'QS Reports' },
    { to:'/qs/documents',              label:'Documents' },
  ],
  'Accounts': [
    { to:'/accounts',                                  label:'Dashboard' },
    // Banking
    { to:'/accounts/banking/accounts',                 label:'Bank Accounts' },
    { to:'/accounts/banking/bank-rules',               label:'Bank Rules' },
    { to:'/accounts/banking/reconciliation',           label:'Bank Reconciliation' },
    { to:'/accounts/banking/cash-flow',                label:'Cash Flow' },
    { to:'/accounts/banking/cheque-tracker',           label:'Cheque Tracker' },
    { to:'/accounts/banking/petty-cash',               label:'Petty Cash' },
    // Items
    { to:'/accounts/items',                            label:'Items & Services' },
    // Sales
    { to:'/accounts/sales/customers',                  label:'Customers' },
    { to:'/accounts/sales/estimates',                  label:'Estimates' },
    { to:'/accounts/sales/invoices',                   label:'Invoices' },
    { to:'/accounts/sales/recurring-invoices',         label:'Recurring Invoices' },
    { to:'/accounts/sales/proforma-invoices',          label:'Proforma Invoices' },
    { to:'/accounts/sales/customer-payments',          label:'Customer Payments' },
    { to:'/accounts/sales/credit-notes',               label:'Credit Notes' },
    { to:'/accounts/sales/delivery-challans',          label:'Delivery Challans' },
    { to:'/accounts/sales/statements',                 label:'Customer Statements' },
    // Purchases
    { to:'/accounts/purchases/expenses',               label:'Expenses' },
    { to:'/accounts/purchases/purchase-orders',        label:'Purchase Orders' },
    { to:'/accounts/purchases/bills',                  label:'Bills' },
    { to:'/accounts/purchases/bills/booking',          label:'Bill Booking' },
    { to:'/accounts/purchases/recurring-bills',        label:'Recurring Bills' },
    { to:'/accounts/purchases/payments-made',          label:'Vendor Payments' },
    { to:'/accounts/purchases/vendor-credits',         label:'Vendor Credits' },
    { to:'/accounts/purchases/payment-run',            label:'Payment Run' },
    // Accountant
    { to:'/accounts/accountant/chart-of-accounts',     label:'Chart of Accounts' },
    { to:'/accounts/accountant/journal-entries',       label:'Manual Journals' },
    { to:'/accounts/accountant/transactions',          label:'Transactions' },
    { to:'/accounts/accountant/opening-balances',      label:'Opening Balances' },
    { to:'/accounts/accountant/bill-automation',       label:'Bill Accounts Auto' },
    // Reports
    { to:'/accounts/reports/profit-loss',              label:'Profit & Loss' },
    { to:'/accounts/reports/balance-sheet',            label:'Balance Sheet' },
    { to:'/accounts/reports/trial-balance',            label:'Trial Balance' },
    { to:'/accounts/reports/cash-flow-statement',      label:'Cash Flow Statement' },
    { to:'/accounts/reports/ar-aging',                 label:'Receivable Aging' },
    { to:'/accounts/reports/sales-by-customer',        label:'Sales by Customer' },
    { to:'/accounts/reports/sales-by-item',            label:'Sales by Item' },
    { to:'/accounts/reports/ap-aging',                 label:'Payable Aging' },
    { to:'/accounts/reports/purchase-by-vendor',       label:'Purchase by Vendor' },
    { to:'/accounts/reports/expense-report',           label:'Expense Report' },
    { to:'/accounts/reports/general-ledger',           label:'General Ledger' },
    { to:'/accounts/reports/day-book',                 label:'Day Book' },
    { to:'/accounts/reports/journal-report',           label:'Journal Report' },
    { to:'/accounts/reports/financial',                label:'Financial Reports' },
    { to:'/accounts/reports/billing',                  label:'Billing Reports' },
    { to:'/accounts/reports/management-mis',           label:'Management MIS' },
    { to:'/accounts/reports/control-dashboard',        label:'Control Dashboard' },
    { to:'/accounts/reports/budget',                   label:'Budget vs Actual' },
    // Taxes
    { to:'/accounts/taxes/gst',                        label:'GST' },
    { to:'/accounts/taxes/gstr1',                      label:'GSTR-1' },
    { to:'/accounts/taxes/gstr3b',                     label:'GSTR-3B' },
    { to:'/accounts/taxes/tds',                        label:'TDS' },
    { to:'/accounts/taxes/eway-bills',                 label:'E-Way Bills' },
    { to:'/accounts/taxes/summary',                    label:'Tax Summary' },
    // Compliance
    { to:'/accounts/compliance',                       label:'Compliance Overview' },
    { to:'/accounts/compliance/gst',                   label:'GST Compliance' },
    { to:'/accounts/compliance/tds',                   label:'TDS Returns & Certs' },
    { to:'/accounts/compliance/labour',                label:'Labour Law (PF/ESI/PT)' },
    // Documents & Settings
    { to:'/accounts/documents',                        label:'Documents' },
    { to:'/accounts/settings',                         label:'Settings' },
  ],
  'HR & Admin': [
    { to:'/hr-admin',                    label:'HR Dashboard' },
    { to:'/hr-admin/employees',          label:'Employees' },
    { to:'/hr-admin/attendance',         label:'Attendance' },
    { to:'/hr-admin/leaves',             label:'Leave Management' },
    { to:'/hr-admin/holidays',           label:'Holiday Calendar' },
    { to:'/hr-admin/payroll',            label:'Payroll' },
    { to:'/hr-admin/salary-structures',  label:'Salary Structures' },
    { to:'/hr-admin/employee-salaries',  label:'Employee Salaries' },
    { to:'/hr-admin/loans',              label:'Loans & Advances' },
    { to:'/hr-admin/expenses',           label:'Expense Claims' },
    { to:'/hr-admin/departments',        label:'Departments' },
    { to:'/hr-admin/appraisals',         label:'Appraisals' },
    { to:'/hr-admin/advanced',           label:'Advanced HR' },
    { to:'/hr-admin/shifts',             label:'Shifts & OT' },
    { to:'/hr-admin/fnf',                label:'Full & Final' },
    { to:'/hr-admin/letters',            label:'Letter Generation' },
    { to:'/hr-admin/training',           label:'Training' },
    { to:'/hr-admin/emp-assets',         label:'Employee Assets' },
    { to:'/hr-admin/travel',             label:'Travel Requests' },
    { to:'/hr-admin/recruitment',        label:'Recruitment' },
    { to:'/hr/workers',                  label:'Site Workers' },
    { to:'/hr/attendance',               label:'Worker Attendance' },
    { to:'/hr/payroll',                  label:'Worker Payroll' },
    { to:'/hr-admin/essl-sync',          label:'ESSL Biometric' },
    { to:'/hr-admin/import',             label:'Import Data' },
    { to:'/hr-admin/reports',            label:'HR Reports' },
    { to:'/ess',                         label:'ESS Portal' },
    { to:'/hr-admin/documents',          label:'Documents' },
  ],
  'Bill Tracker': [
    { to:'/tqs',                       label:'Bill Tracker Dashboard' },
    { to:'/tqs/bills',                 label:'Bills' },
    { to:'/tqs/transmittal',           label:'Transmittal' },
    { to:'/tqs/material-tracker',      label:'Material Tracker' },
    { to:'/tqs/concrete-tracker',      label:'Concrete Tracker' },
    { to:'/tqs/analytics',             label:'Analytics' },
    { to:'/tqs/reports',               label:'Reports' },
    { to:'/tqs/liability-register',    label:'Liability Register' },
    { to:'/tqs/advance-tracker',       label:'Advance Tracker' },
    { to:'/tqs/deduction-register',    label:'Deduction Register' },
    { to:'/tqs/wo-bill-register',      label:'WO Bill Register' },
    { to:'/tqs/cash-flow',             label:'Cash Flow' },
    { to:'/tqs/cost-report',           label:'Cost Report' },
    { to:'/tqs/vendor-certifications', label:'QS Certification' },
    { to:'/tqs/documents',             label:'Documents' },
  ],
  'Quality (QA/QC)': [
    { to:'/quality',                    label:'QA/QC Dashboard' },
    { to:'/quality/itp',                label:'ITP Register' },
    { to:'/quality/method-statements',  label:'Method Statements' },
    { to:'/quality/rfi',                label:'RFI / WIR Ledger' },
    { to:'/quality/mir',                label:'Material Inspection' },
    { to:'/quality/mtc',                label:'Test Certificates' },
    { to:'/quality/lab-tests',          label:'Lab Certifications' },
    { to:'/quality/pour-cards',         label:'Pour Cards' },
    { to:'/quality/ncr',                label:'NCR Ledger' },
    { to:'/quality/documents',          label:'Document Control' },
    { to:'/quality/templates',          label:'Checklist Masters' },
    { to:'/quality/snags',              label:'Snag List' },
    { to:'/quality/audits',             label:'Quality Audits' },
    { to:'/quality/reports',            label:'QA/QC Reports' },
    { to:'/quality/doc-repository',     label:'Documents' },
    { to:'/quality/document-library',   label:'QC Document Library' },
  ],
  'HSE & Safety': [
    { to:'/hse',             label:'Safety Dashboard' },
    { to:'/hse/incidents',   label:'Incident Hub' },
    { to:'/hse/permits',     label:'Permit to Work' },
    { to:'/hse/ppe',         label:'PPE Tracking' },
    { to:'/hse/documents',   label:'Documents' },
  ],
  'Assets & IT': [
    { to:'/assets/dashboard',   label:'Asset Dashboard' },
    { to:'/assets/categories',  label:'Asset Categories' },
    { to:'/assets',             label:'Asset Master' },
    { to:'/assets/tracking',    label:'Asset Tracking' },
    { to:'/assets/allocation',  label:'Allocation / Issuance' },
    { to:'/assets/maintenance', label:'Maintenance Management' },
    { to:'/assets/work-orders', label:'Work Orders' },
    { to:'/assets/disposal',    label:'Disposal / Scrap' },
    { to:'/assets/asset-docs',  label:'Documents & Permits' },
    { to:'/assets/operations',  label:'Fuel & Usage Logs' },
    { to:'/assets/depreciation',label:'Depreciation' },
    { to:'/assets/reports',     label:'Reports & Analytics' },
    { to:'/assets/alerts',      label:'Alerts & Notifications' },
    { to:'/assets/roles',       label:'Roles & Permissions' },
    { to:'/it/assets',          label:'IT Register' },
    { to:'/it/tickets',         label:'Help Desk' },
    { to:'/it/licenses',        label:'Licenses / AMC' },
    { to:'/assets/documents',   label:'Module Documents' },
  ],
  'Plant & Machinery': [
    { to:'/plant/dashboard',    label:'Fleet Dashboard' },
    { to:'/plant/masters',      label:'Masters' },
    { to:'/plant/transfers',    label:'Transfers & Disposals' },
    { to:'/plant/hire',         label:'Hire Management' },
    { to:'/plant/deployment',   label:'Deployment & Utilisation' },
    { to:'/plant/fuel',         label:'Fuel Management' },
    { to:'/plant/equipment-log',label:'Equipment Daily Log' },
    { to:'/plant/maintenance',  label:'Maintenance & Repairs' },
    { to:'/plant/operators',    label:'Operator Management' },
    { to:'/plant/compliance',   label:'Document Compliance' },
    { to:'/plant/cost',         label:'Cost Allocation' },
    { to:'/plant/reports',      label:'Reports & Analytics' },
  ],
  'Hire & Rental': [
    { to:'/hire-rental',                 label:'Dashboard' },
    { to:'/plant/hire',                  label:'Hire Work Orders' },
    { to:'/plant/deployment',            label:'Equipment Allocation' },
    { to:'/plant/equipment-log',         label:'Daily Usage / Log Sheet' },
    { to:'/hire-rental/invoices',        label:'Vendor Invoice Entry' },
    { to:'/hire-rental/certify',         label:'QS Certification' },
    { to:'/hire-rental/approvals',       label:'Approvals' },
    { to:'/hire-rental/payments',        label:'Payment Status' },
    { to:'/hire-rental/reports',         label:'Reports' },
    { to:'/plant/masters',               label:'Settings' },
    { to:'/hire-rental/crane-log',       label:'Crane Log Sheet' },
  ],
  'DMS': [
    { to:'/dms',         label:'Document Repository' },
    { to:'/dms/gfc-log', label:'GFC Master Log' },
  ],
  'Subcontractors': [
    { to:'/sc/dashboard',          label:'Dashboard' },
    { to:'/sc/master',             label:'Subcontractor Master' },
    { to:'/sc/work-orders',        label:'Work Order Management' },
    { to:'/sc/labour',             label:'Labour / Worker Attendance' },
    { to:'/sc/progress',           label:'Work Progress Entry' },
    { to:'/sc/bill-preparation',   label:'Bill Preparation' },
    { to:'/sc/hire-usage-tracker', label:'Hire Usage Tracker' },
    { to:'/sc/bill-approval',      label:'Bill Approval' },
    { to:'/sc/payments',           label:'Payment Tracking' },
    { to:'/sc/deductions',         label:'Retention / Deductions' },
    { to:'/sc/documents',          label:'Documents' },
    { to:'/sc/reports',            label:'Reports' },
    { to:'/sc/settings',           label:'Settings' },
  ],
  'Administration': [
    { to:'/users',              label:'Team Members' },
    { to:'/accounts/settings',  label:'Company Profile' },
    { to:'/audit-log',          label:'Audit Log' },
    { to:'/mail-center',        label:'Mail Center' },
    { to:'/role-permissions',   label:'Roles & Module Access' },
  ],
  'Automation Ideas': [
    { to:'/automation-ideas', label:'Ideas Dashboard' },
    { to:'/approval-engine',  label:'Approval Engine' },
  ],
  'Reports': [
    { to:'/reports', label:'Reports Hub' },
  ],
};

/* ═══════════════════════════════════════════════════════ HELPERS */

const roleInfo = (r) => ROLES.find(x => x.value === r) || {
  value: r, label: r?.replace(/_/g,' ') || 'Unknown',
  color:'#475569', bg:'#F1F5F9', border:'#CBD5E1',
};

const normalizeModules = (m) => {
  if (Array.isArray(m)) return m;
  if (typeof m === 'string') { try { const p = JSON.parse(m); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
};

const getInitials = (name='') => name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() || 'U';

const AVATAR_GRADIENTS = [
  ['#6366F1','#8B5CF6'], ['#3B82F6','#06B6D4'], ['#10B981','#059669'],
  ['#F59E0B','#EF4444'], ['#EC4899','#8B5CF6'], ['#14B8A6','#3B82F6'],
  ['#F97316','#EF4444'], ['#8B5CF6','#EC4899'], ['#06B6D4','#10B981'],
];
const avatarGradient = (name='') => {
  const idx = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
  return `linear-gradient(135deg, ${AVATAR_GRADIENTS[idx][0]}, ${AVATAR_GRADIENTS[idx][1]})`;
};

/* ═══════════════════════════════════════════════════════ SUB-COMPONENTS */

function RoleBadge({ role, size = 'sm' }) {
  const r = roleInfo(role);
  return (
    <span className={clsx('inline-flex items-center font-semibold rounded-full whitespace-nowrap',
      size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1')}
      style={{ background: r.bg, color: r.color, border: `1px solid ${r.border}` }}>
      {r.label}
    </span>
  );
}

function Avatar({ name, role, size = 40 }) {
  return (
    <div className="rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 shadow-md"
      style={{ width: size, height: size, fontSize: size * 0.32, background: avatarGradient(name), boxShadow: `0 4px 12px ${roleInfo(role).color}30` }}>
      {getInitials(name)}
    </div>
  );
}

/* ── Member Card ─────────────────────────────────────────────── */
function MemberCard({ user, isMe, isAdmin, onEdit, onReset, onDeactivate, onReactivate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const r = roleInfo(user.role);

  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden hover:shadow-lg hover:border-slate-200 transition-all duration-200 group relative">
      {/* Top color bar */}
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${r.color}60, ${r.color}20)` }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} role={user.role} size={44} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-slate-900 truncate leading-tight">{user.name}</p>
                {isMe && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">YOU</span>}
              </div>
              <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                {user.employee_code && <span className="font-mono text-slate-500">{user.employee_code} · </span>}
                {user.designation || 'Team Member'}
              </p>
            </div>
          </div>

          {/* Status dot + menu */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', user.is_active ? 'bg-emerald-400' : 'bg-slate-300')} />
            {isAdmin && (
              <div className="relative">
                <button onClick={() => setMenuOpen(v => !v)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100">
                  <MoreVertical size={13} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-1 min-w-[150px] text-xs">
                      <button onClick={() => { setMenuOpen(false); onEdit(user); }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 font-medium">
                        <Edit2 size={12} className="text-blue-500" /> Edit Member
                      </button>
                      <button onClick={() => { setMenuOpen(false); navigate(`/hr-admin/employees/${user.id}/edit`); }}
                        className={clsx('flex items-center gap-2 w-full px-3 py-2 rounded-lg font-medium',
                          user.has_hr_profile ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-amber-50 text-amber-700')}>
                        <Link2 size={12} className={user.has_hr_profile ? 'text-indigo-500' : 'text-amber-500'} />
                        {user.has_hr_profile ? 'Edit HR Profile' : 'Create HR Profile'}
                      </button>
                      <button onClick={() => { setMenuOpen(false); onReset(user); }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 font-medium">
                        <Key size={12} className="text-amber-500" /> Reset Password
                      </button>
                      {user.is_active && !isMe && (
                        <button onClick={() => { setMenuOpen(false); onDeactivate(user); }}
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-red-50 text-red-500 font-medium">
                          <UserX size={12} /> Deactivate
                        </button>
                      )}
                      {!user.is_active && (
                        <button onClick={() => { setMenuOpen(false); onReactivate(user.id); }}
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-emerald-50 text-emerald-600 font-medium">
                          <RotateCcw size={12} /> Reactivate
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Role badge + HR profile badge */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <RoleBadge role={user.role} />
          {!user.has_hr_profile && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
              <Link2 size={8} /> No HR Profile
            </span>
          )}
        </div>
        {user.department && (
          <div className="flex items-center gap-1.5 mb-3">
            <Building2 size={11} className="text-slate-400 flex-shrink-0" />
            <span className="text-[10px] text-slate-500 font-medium truncate">{user.department}</span>
          </div>
        )}

        {/* Contact */}
        <div className="space-y-1 pt-2 border-t border-slate-50">
          <div className="flex items-center gap-1.5">
            <Mail size={10} className="text-slate-400 flex-shrink-0" />
            <span className="text-[10px] text-slate-500 truncate">{user.email}</span>
          </div>
          {user.phone && (
            <div className="flex items-center gap-1.5">
              <Phone size={10} className="text-slate-400 flex-shrink-0" />
              <span className="text-[10px] text-slate-500">{user.phone}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <LogIn size={10} className="text-slate-400 flex-shrink-0" />
            <span className="text-[10px] text-slate-400 italic">
              {user.last_login ? dayjs(user.last_login).fromNow() : 'Never logged in'}
            </span>
          </div>
        </div>
      </div>

      {/* Inactive overlay */}
      {!user.is_active && (
        <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center backdrop-blur-[1px]">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white border border-slate-200 px-3 py-1.5 rounded-full">
            Inactive
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Table Row ───────────────────────────────────────────────── */
function MemberRow({ user, isMe, isAdmin, onEdit, onReset, onDeactivate, onReactivate }) {
  const navigate = useNavigate();
  return (
    <tr className="hover:bg-slate-50/60 transition-colors group">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} role={user.role} size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-800 truncate">{user.name}</span>
              {isMe && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">YOU</span>}
              {!user.has_hr_profile && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">No HR Profile</span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">{user.employee_code || '—'}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
      <td className="px-4 py-3 text-[11px] text-slate-500">{user.department || '—'}</td>
      <td className="px-4 py-3">
        <div className="text-[11px] text-slate-600">{user.email}</div>
        {user.phone && <div className="text-[10px] text-slate-400">{user.phone}</div>}
      </td>
      <td className="px-4 py-3">
        <div className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold',
          user.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200')}>
          {user.is_active ? <><CheckCircle2 size={10} />Active</> : <><XCircle size={10} />Inactive</>}
        </div>
      </td>
      <td className="px-4 py-3 text-[10px] text-slate-400 italic">
        {user.last_login ? dayjs(user.last_login).fromNow() : 'Never'}
      </td>
      {isAdmin && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(user)} title="Edit Member"
              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center text-slate-500 transition-colors">
              <Edit2 size={12} />
            </button>
            <button onClick={() => navigate(`/hr-admin/employees/${user.id}/edit`)}
              title={user.has_hr_profile ? 'Edit HR Profile' : 'Create HR Profile'}
              className={clsx('w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                user.has_hr_profile
                  ? 'bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600 text-slate-500'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-500')}>
              <Link2 size={12} />
            </button>
            <button onClick={() => onReset(user)} title="Reset Password"
              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-amber-100 hover:text-amber-600 flex items-center justify-center text-slate-500 transition-colors">
              <Key size={12} />
            </button>
            {user.is_active && !isMe && (
              <button onClick={() => onDeactivate(user)} title="Deactivate"
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-slate-500 transition-colors">
                <UserX size={12} />
              </button>
            )}
            {!user.is_active && (
              <button onClick={() => onReactivate(user.id)} title="Reactivate"
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-emerald-100 hover:text-emerald-600 flex items-center justify-center text-slate-500 transition-colors">
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

/* ── Slide-over Drawer ───────────────────────────────────────── */
function Drawer({ open, title, subtitle, onClose, children, footer }) {
  return (
    <>
      {/* Backdrop */}
      <div className={clsx('fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        onClick={onClose} />

      {/* Panel */}
      <div className={clsx('fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out',
        open ? 'translate-x-0' : 'translate-x-full')}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)' }}>
          <div>
            <h2 className="text-base font-bold text-white">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Form Field ──────────────────────────────────────────────── */
const Inp = 'w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all';
const Label = ({ children, required }) => (
  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
    {children}{required && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

/* ── Module Picker ───────────────────────────────────────────── */
function ModulePicker({ value, onChange, role, onPreset }) {
  const isAdmin = ['admin','super_admin'].includes(role);
  if (isAdmin) return (
    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
      <Check size={14} className="text-emerald-600 flex-shrink-0" />
      <span className="text-xs font-semibold text-emerald-700">Admin has full access to all modules</span>
    </div>
  );
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={onPreset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold hover:bg-blue-100 transition-colors">
          <Sparkles size={11} /> Role Preset
        </button>
        <button type="button" onClick={() => onChange(AVAILABLE_MODULES)}
          className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 transition-colors">
          All
        </button>
        <button type="button" onClick={() => onChange([])}
          className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 transition-colors">
          Clear
        </button>
        <span className="ml-auto text-[10px] text-slate-400 font-semibold">{value?.length || 0}/{AVAILABLE_MODULES.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {AVAILABLE_MODULES.map(m => {
          const checked = value?.includes(m);
          return (
            <label key={m} className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-all text-[11px] font-medium',
              checked ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-50')}>
              <input type="checkbox" checked={checked} className="w-3.5 h-3.5 accent-blue-600"
                onChange={e => e.target.checked ? onChange([...(value||[]), m]) : onChange((value||[]).filter(x => x !== m))} />
              {m}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ── Menu Permissions Picker ─────────────────────────────────── */
function MenuPicker({ selectedModules, value, onChange, role }) {
  const isAdmin = ['admin','super_admin'].includes(role);
  if (isAdmin) return (
    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
      <Check size={14} className="text-emerald-600 flex-shrink-0" />
      <span className="text-xs font-semibold text-emerald-700">Admin has full access to all menus</span>
    </div>
  );

  const configurableModules = selectedModules.filter(m => MENU_CONFIG[m]);
  const [expanded, setExpanded] = useState(null);

  const isAllAccess = (mod) => !value[mod] || value[mod] === null;
  const selectedCount = (mod) => {
    if (isAllAccess(mod)) return MENU_CONFIG[mod].length;
    return (value[mod] || []).length;
  };

  const enableRestriction = (mod) => {
    onChange({ ...value, [mod]: MENU_CONFIG[mod].map(m => m.to) });
  };
  const clearRestriction = (mod) => {
    const next = { ...value };
    delete next[mod];
    onChange(next);
  };
  const toggleItem = (mod, path) => {
    const cur = Array.isArray(value[mod]) ? value[mod] : MENU_CONFIG[mod].map(m => m.to);
    const next = cur.includes(path) ? cur.filter(p => p !== path) : [...cur, path];
    onChange({ ...value, [mod]: next.length > 0 ? next : [] });
  };
  const selectAll  = (mod) => onChange({ ...value, [mod]: MENU_CONFIG[mod].map(m => m.to) });
  const clearAll   = (mod) => onChange({ ...value, [mod]: [] });

  if (configurableModules.length === 0) return (
    <div className="text-center py-10">
      <p className="text-sm font-semibold text-slate-500">No modules assigned yet.</p>
      <p className="text-xs text-slate-400 mt-1">Go to the <strong>Modules</strong> tab and assign at least one module first.</p>
    </div>
  );

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-3">
        Configure which menu items are visible for each module. Leave at "All" to show everything.
      </p>
      {configurableModules.map(mod => {
        const items    = MENU_CONFIG[mod];
        const allAcc   = isAllAccess(mod);
        const selCount = selectedCount(mod);
        const isOpen   = expanded === mod;

        return (
          <div key={mod} className="border border-slate-200 rounded-xl overflow-hidden">
            {/* Accordion header */}
            <button type="button" onClick={() => setExpanded(isOpen ? null : mod)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left">
              <span className="flex-1 text-sm font-semibold text-slate-800">{mod}</span>
              <span className={clsx('text-[10px] font-bold px-2.5 py-0.5 rounded-full',
                allAcc ? 'bg-emerald-100 text-emerald-700' : selCount === 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700')}>
                {allAcc ? 'All Menus' : `${selCount} / ${items.length}`}
              </span>
              <ChevronDown size={14} className={clsx('text-slate-400 flex-shrink-0 transition-transform', isOpen && 'rotate-180')} />
            </button>

            {isOpen && (
              <div className="border-t border-slate-100 p-4 bg-slate-50/60">
                {/* Mode toggle */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <button type="button" onClick={() => clearRestriction(mod)}
                    className={clsx('px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all',
                      allAcc ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-400 hover:text-emerald-700')}>
                    All Menus
                  </button>
                  <button type="button" onClick={() => enableRestriction(mod)}
                    className={clsx('px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all',
                      !allAcc ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400 hover:text-indigo-700')}>
                    Custom Selection
                  </button>
                  {!allAcc && (
                    <span className="ml-auto flex gap-1.5">
                      <button type="button" onClick={() => selectAll(mod)}
                        className="px-2.5 py-1 text-[9px] font-bold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                        Select All
                      </button>
                      <button type="button" onClick={() => clearAll(mod)}
                        className="px-2.5 py-1 text-[9px] font-bold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                        Clear
                      </button>
                    </span>
                  )}
                </div>

                {allAcc ? (
                  <p className="text-[11px] text-slate-400 italic">
                    All {items.length} menu items in <strong>{mod}</strong> are visible to this user.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                    {items.map(item => {
                      const checked = (value[mod] || []).includes(item.to);
                      return (
                        <label key={item.to}
                          className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-all text-[11px] font-medium',
                            checked ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50')}>
                          <input type="checkbox" checked={checked} className="w-3.5 h-3.5 accent-indigo-600 flex-shrink-0"
                            onChange={() => toggleItem(mod, item.to)} />
                          <span className="truncate">{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Project Access ──────────────────────────────────────────── */
function ProjectPicker({ projects, value, onChange, role }) {
  const isAdmin = ['admin','super_admin'].includes(role);
  return (
    <div>
      {isAdmin && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl mb-3">
          <Shield size={13} className="text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-700 font-semibold">Admin can access all projects by default</span>
        </div>
      )}
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => onChange(projects.map(p => p.id))}
          className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 transition-colors">
          Select All
        </button>
        <button type="button" onClick={() => onChange([])}
          className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 transition-colors">
          Clear
        </button>
        <span className="ml-auto text-[10px] text-slate-400 font-semibold self-center">{value?.length || 0}/{projects.length}</span>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {projects.map(p => {
          const checked = (value||[]).includes(p.id);
          return (
            <label key={p.id} className={clsx('flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer border transition-all',
              checked ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-200')}>
              <input type="checkbox" checked={checked} className="w-3.5 h-3.5 accent-blue-600"
                onChange={e => e.target.checked ? onChange([...new Set([...(value||[]), p.id])]) : onChange((value||[]).filter(x => x !== p.id))} />
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold text-slate-700 truncate">{p.name}</span>
                <span className="block text-[10px] text-slate-400">{p.project_code || 'Project'}</span>
              </div>
            </label>
          );
        })}
        {projects.length === 0 && <p className="text-center text-xs text-slate-400 py-4">No projects available</p>}
      </div>
    </div>
  );
}

/* ── Member Form (shared add/edit) ───────────────────────────── */
function MemberForm({ form, setF, setRole, applyPreset, showPw, setShowPw, projects, roleOptions, departmentOptions, isEdit }) {
  const [tab, setTab] = useState('info');
  const TABS = [
    { id:'info',     label:'Basic Info' },
    { id:'access',   label:'Modules' },
    { id:'menus',    label:'Menu Access' },
    { id:'projects', label:'Projects' },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-6 bg-white sticky top-0 z-10">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('px-4 py-3.5 text-[11px] font-bold uppercase tracking-widest border-b-2 -mb-px transition-colors',
              tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-4">

        {/* ── Info Tab ── */}
        {tab === 'info' && (
          <div className="space-y-4">
            <div>
              <Label required>Full Name</Label>
              <input className={Inp} placeholder="e.g. Ramesh Kumar"
                value={form.name} onChange={e => setF('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Email Address</Label>
                <input type="email" className={Inp} placeholder="ramesh@bcimeng.in"
                  value={form.email} onChange={e => setF('email', e.target.value)} />
              </div>
              <div>
                <Label>Mobile</Label>
                <input className={Inp} placeholder="9876543210"
                  value={form.phone} onChange={e => setF('phone', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Role</Label>
                <select className={Inp} value={form.role}
                  onChange={e => e.target.value === '__custom__' ? setF('role','custom_role') : setRole(e.target.value)}>
                  {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  <option value="__custom__">+ Custom Role</option>
                </select>
              </div>
              <div>
                <Label>Department</Label>
                <select className={Inp} value={form.department}
                  onChange={e => e.target.value === '__custom__' ? setF('department','Custom') : setF('department', e.target.value)}>
                  {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  <option value="__custom__">+ Custom</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Designation</Label>
              <input className={Inp} placeholder="e.g. Senior Site Engineer"
                value={form.designation} onChange={e => setF('designation', e.target.value)} />
            </div>
            {!isEdit && (
              <div>
                <Label required>Password <span className="normal-case font-normal text-slate-400">(min 8 chars)</span></Label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} className={clsx(Inp, 'pr-10')}
                    placeholder="Set login password" value={form.password}
                    onChange={e => setF('password', e.target.value)} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}
            {/* Role preview */}
            {form.role && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: roleInfo(form.role).bg }}>
                  <Shield size={14} style={{ color: roleInfo(form.role).color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700">{roleInfo(form.role).label}</p>
                  <p className="text-[10px] text-slate-400">
                    {['admin','super_admin'].includes(form.role) ? 'Full access to all modules' :
                      `${ROLE_MODULE_PRESETS[form.role]?.length || 0} modules in preset`}
                  </p>
                </div>
                <RoleBadge role={form.role} />
              </div>
            )}
          </div>
        )}

        {/* ── Access Tab ── */}
        {tab === 'access' && (
          <ModulePicker value={form.accessible_modules} role={form.role}
            onChange={v => setF('accessible_modules', v)}
            onPreset={applyPreset} />
        )}

        {/* ── Menu Access Tab ── */}
        {tab === 'menus' && (
          <MenuPicker
            selectedModules={form.accessible_modules || []}
            value={form.accessible_menus || {}}
            onChange={v => setF('accessible_menus', v)}
            role={form.role}
          />
        )}

        {/* ── Projects Tab ── */}
        {tab === 'projects' && (
          <ProjectPicker projects={projects} value={form.project_ids} role={form.role}
            onChange={v => setF('project_ids', v)} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ MAIN PAGE */

export default function UsersPage() {
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = ['admin','super_admin'].includes(me?.role);

  // State
  const [search, setSearch]           = useState('');
  const [filterRole, setFilterRole]   = useState('');
  const [filterDept, setFilterDept]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterNoHR, setFilterNoHR]     = useState(false);
  const [view, setView]               = useState('grid'); // 'grid' | 'list'
  const [drawer, setDrawer]           = useState(null);   // 'add' | 'edit' | 'reset' | 'deactivate'
  const [selected, setSelected]       = useState(null);
  const [form, setForm]               = useState(BLANK_FORM);
  const [showPw, setShowPw]           = useState(false);
  const [resetPw, setResetPw]         = useState('');
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef                  = useRef(null);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  /* Queries */
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['users-projects'],
    queryFn: () => api.get('/projects').then(r => r.data?.data || r.data || []),
    staleTime: 300000,
  });

  const roleOptions = useMemo(() => {
    const seen = new Set();
    return [...ROLES, ...(data||[]).map(u => roleInfo(u.role))].filter(r => {
      if (!r.value || seen.has(r.value)) return false;
      seen.add(r.value); return true;
    });
  }, [data]);

  const departmentOptions = useMemo(() => {
    const seen = new Set();
    return [...DEPARTMENTS, ...(data||[]).map(u => u.department).filter(Boolean)].filter(d => {
      const k = d.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }, [data]);

  /* Filtered list */
  const users = (data||[]).filter(u => {
    const q = search.toLowerCase();
    const ms = !q || [u.name,u.email,u.employee_code,u.phone,u.designation,u.department,roleInfo(u.role).label]
      .some(v => v?.toLowerCase().includes(q));
    return ms
      && (!filterRole   || u.role === filterRole)
      && (!filterDept   || u.department === filterDept)
      && (!filterStatus || (filterStatus==='active' ? u.is_active : !u.is_active))
      && (!filterNoHR   || !u.has_hr_profile);
  });

  /* KPIs */
  const all       = data||[];
  const kpis = [
    { label:'Total',          value: all.length,                                            color:'#3B82F6', bg:'#EFF6FF', icon: Users     },
    { label:'Active',         value: all.filter(u=>u.is_active).length,                   color:'#10B981', bg:'#ECFDF5', icon: UserCheck  },
    { label:'Inactive',       value: all.filter(u=>!u.is_active).length,                  color:'#94A3B8', bg:'#F8FAFC', icon: UserX      },
    { label:'Roles',          value: new Set(all.map(u=>u.role)).size,                    color:'#8B5CF6', bg:'#F5F3FF', icon: Shield     },
    { label:'No HR Profile',  value: all.filter(u=>!u.has_hr_profile).length,             color:'#D97706', bg:'#FFFBEB', icon: Link2      },
  ];

  /* Mutations */
  const createMut = useMutation({
    mutationFn: d => api.post('/users', d),
    onSuccess: () => { toast.success('Member added!'); qc.invalidateQueries({queryKey:['users']}); setDrawer(null); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to create'),
  });
  const updateMut = useMutation({
    mutationFn: ({id,...d}) => api.put(`/users/${id}`, d),
    onSuccess: () => { toast.success('Member updated'); qc.invalidateQueries({queryKey:['users']}); setDrawer(null); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to update'),
  });
  const resetMut = useMutation({
    mutationFn: ({id,new_password}) => api.patch(`/users/${id}/reset-password`,{new_password}),
    onSuccess: () => { toast.success('Password reset'); setDrawer(null); setResetPw(''); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const deactivateMut = useMutation({
    mutationFn: id => api.delete(`/users/${id}`),
    onSuccess: () => { toast.success('Member deactivated'); qc.invalidateQueries({queryKey:['users']}); setDrawer(null); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const reactivateMut = useMutation({
    mutationFn: id => api.put(`/users/${id}`,{is_active:true}),
    onSuccess: () => { toast.success('Member reactivated'); qc.invalidateQueries({queryKey:['users']}); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  /* Handlers */
  const openAdd  = () => { setForm(BLANK_FORM); setShowPw(false); setDrawer('add'); };
  const openEdit = u => {
    setSelected(u);
    setForm({ name:u.name, email:u.email, phone:u.phone||'', password:'',
               role:u.role, designation:u.designation||'', department:u.department||'',
               accessible_modules:normalizeModules(u.accessible_modules),
               accessible_menus: u.accessible_menus && typeof u.accessible_menus === 'object' ? u.accessible_menus : {},
               project_ids:Array.isArray(u.project_ids)?u.project_ids:[], vendor_id:u.vendor_id||'' });
    setDrawer('edit');
  };
  const openReset = u => { setSelected(u); setResetPw(''); setDrawer('reset'); };
  const openDeactivate = u => { setSelected(u); setDrawer('deactivate'); };

  const setRole = role => setForm(f => ({
    ...f, role,
    accessible_modules: ['admin','super_admin'].includes(role) ? [] : (ROLE_MODULE_PRESETS[role] || f.accessible_modules || []),
  }));
  const applyPreset = () => {
    const p = ROLE_MODULE_PRESETS[form.role];
    if (!p?.length) return toast.error('No preset for this role');
    setF('accessible_modules', p); toast.success('Preset applied');
  };

  const handleCreate = () => {
    if (!form.name||!form.email||!form.password||!form.role) return toast.error('Name, email, password & role required');
    if (form.password.length < 8) return toast.error('Password must be ≥ 8 characters');
    createMut.mutate(form);
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/users/import/template',{responseType:'blob'});
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href=url; a.download='Team_Members_Import_Template.xlsx'; a.click();
      URL.revokeObjectURL(url); toast.success('Template downloaded');
    } catch { toast.error('Failed to download'); }
  };

  const handleImport = async e => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value='';
    setImporting(true);
    try {
      const fd = new FormData(); fd.append('file',file);
      const res = await api.post('/users/bulk-import',fd,{headers:{'Content-Type':'multipart/form-data'}});
      setImportResult(res.data); qc.invalidateQueries({queryKey:['users']}); toast.success(res.data.message);
    } catch(err) { toast.error(err?.response?.data?.error||'Import failed'); }
    finally { setImporting(false); }
  };

  const hasFilters = search||filterRole||filterDept||filterStatus||filterNoHR;
  const clearFilters = () => { setSearch(''); setFilterRole(''); setFilterDept(''); setFilterStatus(''); setFilterNoHR(false); };

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-[#F4F6FA]">

      {/* ── Hero Header ──────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%)' }}>
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #60A5FA, transparent)' }} />
        <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #818CF8, transparent)' }} />

        <div className="relative px-6 md:px-8 py-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                  <Users size={16} className="text-white" />
                </div>
                <h1 className="text-xl font-bold text-white tracking-tight">Team Members</h1>
              </div>
              <p className="text-sm text-slate-400">Manage access, roles and module permissions for your team</p>
            </div>

            {/* Actions */}
            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <FileSpreadsheet size={13} /> Template
                </button>
                <label className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors',
                  importing ? 'opacity-50 pointer-events-none' : 'text-white/80 hover:text-white')}
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <Upload size={13} /> {importing ? 'Importing…' : 'Import'}
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} disabled={importing} />
                </label>
                <button onClick={openAdd}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-100"
                  style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)', boxShadow: '0 4px 14px rgba(59,130,246,0.4)' }}>
                  <Plus size={14} /> Add Member
                </button>
              </div>
            )}
          </div>

          {/* KPI strip */}
          <div className="flex items-center gap-3 mt-5 flex-wrap">
            {kpis.map(k => (
              <div key={k.label}
                onClick={k.label === 'No HR Profile' ? () => setFilterNoHR(v => !v) : undefined}
                className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl transition-all',
                  k.label === 'No HR Profile'
                    ? 'cursor-pointer hover:bg-amber-500/20 ' + (filterNoHR ? 'ring-2 ring-amber-400' : '')
                    : '')}
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <k.icon size={13} style={{ color: k.color }} />
                <span className="text-lg font-bold text-white leading-none">{k.value}</span>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{k.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="px-6 md:px-8 py-5 space-y-4">

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, code, role…"
              className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13} /></button>}
          </div>

          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="h-9 bg-white border border-slate-200 rounded-xl px-3 text-xs text-slate-600 outline-none focus:border-blue-300 shadow-sm">
            <option value="">All Roles</option>
            {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="h-9 bg-white border border-slate-200 rounded-xl px-3 text-xs text-slate-600 outline-none focus:border-blue-300 shadow-sm">
            <option value="">All Departments</option>
            {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="h-9 bg-white border border-slate-200 rounded-xl px-3 text-xs text-slate-600 outline-none focus:border-blue-300 shadow-sm">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button onClick={() => setFilterNoHR(v => !v)}
            className={clsx('h-9 px-3 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5',
              filterNoHR
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100')}>
            <Link2 size={12} /> No HR Profile
          </button>

          {hasFilters && (
            <button onClick={clearFilters}
              className="h-9 px-3 rounded-xl bg-red-50 border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-100 transition-colors flex items-center gap-1.5">
              <X size={12} /> Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium mr-1">{users.length} member{users.length !== 1 ? 's' : ''}</span>
            <button onClick={() => setView('grid')}
              className={clsx('w-8 h-8 rounded-lg flex items-center justify-center transition-colors', view==='grid' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-400 hover:text-slate-600')}>
              <LayoutGrid size={14} />
            </button>
            <button onClick={() => setView('list')}
              className={clsx('w-8 h-8 rounded-lg flex items-center justify-center transition-colors', view==='list' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-400 hover:text-slate-600')}>
              <List size={14} />
            </button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty */}
        {!isLoading && users.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Users size={24} className="text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No members found</p>
            <p className="text-xs text-slate-400 mt-1">{hasFilters ? 'Try adjusting your filters' : 'Add your first team member to get started'}</p>
            {isAdmin && !hasFilters && (
              <button onClick={openAdd} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors">
                <Plus size={13} /> Add Member
              </button>
            )}
          </div>
        )}

        {/* Grid view */}
        {!isLoading && users.length > 0 && view === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {users.map(u => (
              <MemberCard key={u.id} user={u} isMe={u.id===me?.id} isAdmin={isAdmin}
                onEdit={openEdit} onReset={openReset}
                onDeactivate={openDeactivate}
                onReactivate={id => reactivateMut.mutate(id)} />
            ))}
          </div>
        )}

        {/* List view */}
        {!isLoading && users.length > 0 && view === 'list' && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    {['Member','Role','Department','Contact','Status','Last Login', isAdmin?'Actions':''].filter(Boolean).map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map(u => (
                    <MemberRow key={u.id} user={u} isMe={u.id===me?.id} isAdmin={isAdmin}
                      onEdit={openEdit} onReset={openReset}
                      onDeactivate={openDeactivate}
                      onReactivate={id => reactivateMut.mutate(id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════ DRAWERS ═════════════════════ */}

      {/* Add Member */}
      <Drawer open={drawer==='add'} title="Add Team Member" subtitle="Create login credentials and assign access" onClose={() => setDrawer(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setDrawer(null)} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button onClick={handleCreate} disabled={createMut.isPending}
              className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20">
              {createMut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              {createMut.isPending ? 'Creating…' : 'Add Member'}
            </button>
          </div>
        }>
        <MemberForm form={form} setF={setF} setRole={setRole} applyPreset={applyPreset}
          showPw={showPw} setShowPw={setShowPw} projects={projects}
          roleOptions={roleOptions} departmentOptions={departmentOptions} isEdit={false} />
      </Drawer>

      {/* Edit Member */}
      <Drawer open={drawer==='edit'} title={`Edit — ${selected?.name || ''}`} subtitle="Update profile, role and module access" onClose={() => setDrawer(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setDrawer(null)} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button onClick={() => updateMut.mutate({id:selected.id,...form})} disabled={updateMut.isPending}
              className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20">
              {updateMut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {updateMut.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        }>
        <MemberForm form={form} setF={setF} setRole={setRole} applyPreset={applyPreset}
          showPw={showPw} setShowPw={setShowPw} projects={projects}
          roleOptions={roleOptions} departmentOptions={departmentOptions} isEdit />
      </Drawer>

      {/* Reset Password */}
      <Drawer open={drawer==='reset'} title="Reset Password" subtitle={selected?.name} onClose={() => setDrawer(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setDrawer(null)} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors">Cancel</button>
            <button onClick={() => resetMut.mutate({id:selected.id,new_password:resetPw})}
              disabled={resetMut.isPending||resetPw.length<8}
              className="px-6 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center gap-2">
              {resetMut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
              {resetMut.isPending ? 'Resetting…' : 'Reset Password'}
            </button>
          </div>
        }>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
            <p className="text-xs font-medium text-amber-700">
              This will immediately invalidate <strong>{selected?.name}</strong>'s current password and terminate all active sessions.
            </p>
          </div>
          <div>
            <Label required>New Password <span className="normal-case font-normal text-slate-400">(min 8 chars)</span></Label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} className={clsx(Inp,'pr-10')}
                placeholder="Enter new password" value={resetPw} onChange={e => setResetPw(e.target.value)} />
              <button type="button" onClick={() => setShowPw(v=>!v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
            {resetPw.length > 0 && resetPw.length < 8 && (
              <p className="text-[10px] text-red-500 mt-1 font-medium">Minimum 8 characters required</p>
            )}
          </div>
        </div>
      </Drawer>

      {/* Deactivate confirm */}
      <Drawer open={drawer==='deactivate'} title="Deactivate Member" subtitle={selected?.name} onClose={() => setDrawer(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setDrawer(null)} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors">Cancel</button>
            <button onClick={() => deactivateMut.mutate(selected.id)} disabled={deactivateMut.isPending}
              className="px-6 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-2">
              {deactivateMut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <UserX size={14} />}
              {deactivateMut.isPending ? 'Deactivating…' : 'Yes, Deactivate'}
            </button>
          </div>
        }>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <XCircle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-xs font-medium text-red-700">
              <strong>{selected?.name}</strong> will lose access immediately. Their data will be preserved. You can reactivate at any time.
            </p>
          </div>
          {selected && (
            <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <Avatar name={selected.name} role={selected.role} size={40} />
              <div>
                <p className="text-sm font-bold text-slate-800">{selected.name}</p>
                <p className="text-xs text-slate-500">{selected.email}</p>
                <RoleBadge role={selected.role} />
              </div>
            </div>
          )}
        </div>
      </Drawer>

      {/* Import Results */}
      {importResult && (
        <Drawer open={!!importResult} title="Import Results" subtitle={importResult.message} onClose={() => setImportResult(null)}
          footer={
            <div className="flex justify-end">
              <button onClick={() => setImportResult(null)} className="px-6 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors">Close</button>
            </div>
          }>
          <div className="p-6 space-y-5">
            {importResult.created?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-emerald-600 mb-2 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">{importResult.created.length}</span>
                  Members Created
                </p>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-50 border-b border-slate-100">
                      {['Row','Name','Email','Code'].map(h => <th key={h} className="text-left p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {importResult.created.map((r,i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td className="p-3 text-slate-400 font-mono text-[10px]">{r.row}</td>
                          <td className="p-3 font-semibold text-slate-800">{r.name}</td>
                          <td className="p-3 text-slate-500">{r.email}</td>
                          <td className="p-3 font-mono text-emerald-600 font-bold">{r.employee_code}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {importResult.skipped?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-red-500 mb-2 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold">{importResult.skipped.length}</span>
                  Rows Skipped
                </p>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-50 border-b border-slate-100">
                      {['Row','Email','Reason'].map(h => <th key={h} className="text-left p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {importResult.skipped.map((r,i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td className="p-3 text-slate-400 font-mono text-[10px]">{r.row}</td>
                          <td className="p-3 text-slate-600">{r.email}</td>
                          <td className="p-3 text-red-500 font-medium">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Drawer>
      )}

    </div>
  );
}
