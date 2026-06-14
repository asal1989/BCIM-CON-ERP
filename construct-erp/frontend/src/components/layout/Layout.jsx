// src/components/layout/Layout.jsx  — Top-nav layout (full-screen content)
import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, FileSpreadsheet, Ruler, Receipt,
  DollarSign, CreditCard, Wallet, TrendingUp, Users, Clock,
  Banknote, FileText, ShoppingCart, Truck, Package, PieChart,
  HardHat, AlertTriangle, Shield, Cpu, Ticket, Key,
  Home, BarChart3, LogOut, Menu, Bell, ChevronDown,
  Activity, Building, ClipboardList, ArrowUpRight, BookOpen,
  Search, Settings, Warehouse, X, ChevronRight, ChevronLeft,
  ScrollText, BadgeCheck, FileSearch, FolderSearch, ClipboardCheck,
  Briefcase, UploadCloud, Upload, ChevronUp, Flag, CalendarDays, GanttChartSquare, Hammer,
  CalendarOff, FileBarChart, Star, UserCheck, Fingerprint, PackageCheck, ArrowLeftRight,
  Landmark, FileSignature, CircleSlash, ShieldCheck, Clock3, Lightbulb,
  Gavel, Target, Send, Coins, Replace, Link2, Wrench, Layers, MapPin, TrendingDown, FolderOpen, Calculator, IndianRupee
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import CommandPalette from './CommandPalette';
import { clsx } from 'clsx';
import LoadingScreen from '../common/LoadingScreen';
import { useLanguage, LANGUAGES } from '../../context/LanguageContext';
import NotificationPanel, { useNotificationCount } from './NotificationPanel';
import { initPushNotifications } from '../../utils/pushNotifications';
import api from '../../api/client';

// ── Navigation data ─────────────────────────────────────────────────────────
const navGroups = [
  { label: 'Overview', items: [
    { to: '/approvals', icon: BadgeCheck,      label: 'My Approvals' },
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/projects',  icon: Building2,       label: 'Projects' },
  ]},
  { label: 'Planning', items: [
    { to: '/planning',              icon: GanttChartSquare, label: 'P&E Dashboard' },
    { to: '/planning/p6-dashboard', icon: Activity,         label: 'P6 EVM Dashboard' },
    { to: '/planning/wbs',          icon: Layers,           label: 'WBS Editor' },
    { to: '/planning/activities',   icon: ClipboardList,    label: 'Schedule & Activities' },
    { to: '/planning/milestones',   icon: Flag,             label: 'Milestones' },
    { to: '/planning/look-ahead',   icon: CalendarDays,     label: 'Look-Ahead Plan' },
    { to: '/planning/progress',     icon: TrendingUp,       label: 'Progress & S-Curve' },
    { to: '/planning/delays',       icon: AlertTriangle,    label: 'Delay Analysis' },
    { to: '/planning/risks',        icon: ShieldCheck,      label: 'Risk Register' },
    { to: '/planning/mrp',          icon: Package,          label: 'Material Plan (MRP)' },
    { to: '/planning/engineer-log',  icon: ClipboardList,    label: 'Engineer Daily Log' },
    { to: '/planning/dpr',          icon: FileText,         label: 'Daily Progress (DPR)' },
    { to: '/planning/reports',      icon: BarChart3,        label: 'Planning Reports' },
    { to: '/planning/documents',    icon: FolderSearch,     label: 'Documents' },
  ]},
  { label: 'Procurement', items: [
    { to: '/procurement/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/procurement/material-request', icon: ClipboardList, label: 'Material Request (MRS)' },
    { to: '/procurement/vendors',          icon: Users,         label: 'Vendors' },
    { to: '/procurement/live-rate-checker',icon: Search,        label: 'Live Rate Checker' },
    { to: '/procurement/rate-contracts',   icon: Landmark,      label: 'Rate Contracts' },
    { to: '/procurement/rfqs',             icon: Send,          label: 'RFQ' },
    { to: '/procurement/quotations',       icon: FileText,      label: 'Quotations' },
    { to: '/procurement/comparative-statements', icon: ScrollText, label: 'Comparative Statements' },
    { to: '/procurement/po',               icon: ShoppingCart,  label: 'Purchase Orders' },
    { to: '/procurement/po-amendments',    icon: FileSignature, label: 'PO Amendments' },
    { to: '/procurement/po-register',      icon: ClipboardList, label: 'PO Register' },
    { to: '/procurement/po-bulk-import',   icon: Upload,        label: 'Import POs (Bulk)' },
    { to: '/procurement/work-orders',      icon: Hammer,        label: 'Work Orders' },
    { to: '/procurement/wo-register',      icon: ClipboardList, label: 'WO Register' },
    { to: '/procurement/wo-bulk-import',   icon: Upload,        label: 'Import WOs (Bulk)' },
    { to: '/procurement/vendor-performance',icon: Star,         label: 'Vendor Performance' },
    { to: '/procurement/vendor-payments',  icon: Wallet,        label: 'Vendor Payments' },
    { to: '/procurement/vendor-mapping',   icon: Link2,         label: 'Vendor–Project Mapping' },
    { to: '/procurement/inventory',        icon: Package,       label: 'Inventory' },
    { to: '/procurement/documents',        icon: FolderSearch,  label: 'Documents' },
    { to: '/procurement/reports',          icon: FileBarChart,  label: 'Reports' },
  ]},
  { label: 'Tender Management', items: [
    { to: '/tender-management',           icon: Gavel,         label: 'Tender Register' },
    { to: '/tender-management/issue',     icon: FileText,      label: 'Tender Issuance' },
    { to: '/tender-management/register',  icon: ClipboardList, label: 'Bid Opportunities' },
    { to: '/tender-management/documents', icon: FolderSearch,  label: 'Documents' },
  ]},
  { label: 'Stores', items: [
    { to: '/stores',                   icon: LayoutDashboard, label: 'Stores Dashboard' },
    { to: '/stores/mrs',               icon: ClipboardList,   label: 'Material Requisition' },
    { to: '/stores/po',                icon: ShoppingCart,    label: 'Purchase Orders' },
    { to: '/stores/po-register',       icon: ClipboardList,   label: 'PO Register' },
    { to: '/stores/work-orders',       icon: Hammer,          label: 'Work Orders' },
    { to: '/stores/wo-register',       icon: ClipboardList,   label: 'WO Register' },
    { to: '/stores/grn',               icon: PackageCheck,    label: 'GRN Receiving' },
    { to: '/stores/ledger',            icon: BookOpen,        label: 'Store Ledger' },
    { to: '/stores/issue',             icon: ArrowUpRight,    label: 'Issue Notes (MIN)' },
    { to: '/stores/mtr',               icon: Truck,           label: 'Material Transfer' },
    { to: '/stores/credit-notes',      icon: TrendingDown,    label: 'Credit Notes' },
    { to: '/stores/documents',         icon: FolderSearch,    label: 'Documents' },
  ]},
  { label: 'QS & Billing', items: [
    { to: '/qs',                      icon: LayoutDashboard, label: 'QS Dashboard' },
    { to: '/qs/boq',                  icon: FileSpreadsheet, label: 'BOQ & Estimation' },
    { to: '/qs/boq-mapping',          icon: Layers,          label: 'BOQ SC Mapping' },
    { to: '/qs/boq-dashboard',        icon: BarChart3,       label: 'BOQ Margin Dashboard' },
    { to: '/qs/measurements',         icon: Ruler,           label: 'Measurement Book' },
    { to: '/qs/ra-bills',             icon: Receipt,         label: 'RA Bills' },
    { to: '/qs/price-escalation',     icon: TrendingUp,      label: 'Price Escalation' },
    { to: '/qs/vendor-certifications',icon: FileSignature,   label: 'Vendor QS Certification' },
    { to: '/qs/retention-releases',   icon: ShieldCheck,     label: 'Retention Release' },
    { to: '/qs/variations',           icon: ArrowLeftRight,  label: 'Variation Orders' },
    { to: '/qs/material-recon',       icon: Activity,        label: 'Material Recon' },
    { to: '/qs/norms',                icon: FileSpreadsheet, label: 'Consumption Norms' },
    { to: '/qs/reports',              icon: BarChart3,       label: 'QS Reports' },
    { to: '/qs/documents',            icon: FolderSearch,    label: 'Documents' },
  ]},
  { label: 'Accounts', items: [
    { to: '/accounts',                          icon: LayoutDashboard, label: 'Overview' },
    { to: '/accounts/banking/accounts',         icon: Landmark,        label: 'Bank Accounts' },
    { to: '/accounts/banking/reconciliation',   icon: Banknote,        label: 'Bank Reconciliation' },
    { to: '/accounts/banking/cash-flow',        icon: TrendingUp,      label: 'Cash Flow' },
    { to: '/accounts/banking/cheque-tracker',   icon: BookOpen,        label: 'Cheque Tracker' },
    { to: '/accounts/banking/petty-cash',       icon: Coins,           label: 'Petty Cash' },
    { to: '/accounts/sales/customers',          icon: Users,           label: 'Customers' },
    { to: '/accounts/sales/invoices',           icon: FileText,        label: 'Invoices' },
    { to: '/accounts/sales/receipts',           icon: Receipt,         label: 'Receipts' },
    { to: '/accounts/sales/credit-notes',       icon: TrendingDown,    label: 'Credit Notes' },
    { to: '/accounts/sales/statements',         icon: Receipt,         label: 'Customer Statements' },
    { to: '/accounts/purchases/vendors',        icon: Users,           label: 'Vendors' },
    { to: '/accounts/purchases/bills',          icon: FileText,        label: 'Bills' },
    { to: '/accounts/purchases/bills/booking',  icon: ClipboardList,   label: 'Bill Booking' },
    { to: '/accounts/purchases/payments-made',  icon: CreditCard,      label: 'Payments Made' },
    { to: '/accounts/purchases/payment-run',    icon: Wallet,          label: 'Payment Run' },
    { to: '/accounts/purchases/debit-notes',    icon: ArrowUpRight,    label: 'Debit Notes' },
    { to: '/accounts/accountant/chart-of-accounts', icon: BookOpen,    label: 'Chart of Accounts' },
    { to: '/accounts/accountant/journal-entries',   icon: ScrollText,  label: 'Journal Entries' },
    { to: '/accounts/accountant/transactions',      icon: Activity,    label: 'Account Transactions' },
    { to: '/accounts/reports/financial',        icon: FileBarChart,    label: 'Financial Reports' },
    { to: '/accounts/reports/billing',          icon: BarChart3,       label: 'Billing Reports' },
    { to: '/accounts/reports/management-mis',   icon: BarChart3,       label: 'Management MIS' },
    { to: '/accounts/reports/control-dashboard',icon: Activity,        label: 'Control Dashboard' },
    { to: '/accounts/reports/budget',           icon: PieChart,        label: 'Budget vs Actual' },
    { to: '/accounts/taxes/gst',                icon: DollarSign,      label: 'GST' },
    { to: '/accounts/taxes/tds',                icon: ShieldCheck,     label: 'TDS' },
    { to: '/accounts/documents',                icon: FolderSearch,    label: 'Documents' },
  ]},
  { label: 'HR & Admin', items: [
    { to: '/hr-admin',                   icon: LayoutDashboard, label: 'HR Dashboard' },
    { to: '/ess',                        icon: UserCheck,       label: 'ESS Portal' },
    { to: '/hr-admin/advanced',          icon: Briefcase,       label: 'Advanced HR' },
    { to: '/hr-admin/employees',         icon: Users,           label: 'Employees' },
    { to: '/hr-admin/attendance',        icon: Clock,           label: 'Attendance' },
    { to: '/hr-admin/leaves',            icon: CalendarOff,     label: 'Leave Management' },
    { to: '/hr-admin/payroll',           icon: CreditCard,      label: 'Payroll' },
    { to: '/hr-admin/salary-structures', icon: Banknote,        label: 'Salary Structures' },
    { to: '/hr-admin/employee-salaries',  icon: IndianRupee,     label: 'Employee Salaries' },
    { to: '/hr-admin/departments',       icon: Building2,       label: 'Departments' },
    { to: '/hr-admin/loans',             icon: Wallet,          label: 'Loans & Advances' },
    { to: '/hr-admin/expenses',          icon: Receipt,         label: 'Expense Claims' },
    { to: '/hr-admin/appraisals',        icon: Star,            label: 'Appraisals' },
    { to: '/hr-admin/holidays',          icon: CalendarDays,    label: 'Holiday Calendar' },
    { to: '/hr-admin/essl-sync',         icon: Fingerprint,     label: 'ESSL Biometric' },
    { to: '/hr-admin/import',            icon: Upload,          label: 'Import Data' },
    { to: '/hr-admin/reports',           icon: FileBarChart,    label: 'HR Reports' },
    { to: '/hr-admin/documents',         icon: FolderSearch,    label: 'Documents' },
  ]},
  { label: 'Bill Tracker', items: [
    { to: '/tqs',                       icon: LayoutDashboard, label: 'Bill Tracker Dashboard' },
    { to: '/tqs/bills',                 icon: FileText,        label: 'Bills' },
    { to: '/tqs/transmittal',           icon: Send,            label: 'Transmittal' },
    { to: '/tqs/material-tracker',      icon: Package,         label: 'Material Tracker' },
    { to: '/tqs/analytics',             icon: TrendingUp,      label: 'Analytics' },
    { to: '/tqs/reports',               icon: BarChart3,       label: 'Reports' },
    { to: '/tqs/liability-register',    icon: BookOpen,        label: 'Liability Register' },
    { to: '/tqs/advance-tracker',       icon: Wallet,          label: 'Advance Tracker' },
    { to: '/tqs/deduction-register',    icon: CircleSlash,     label: 'Deduction Register' },
    { to: '/tqs/wo-bill-register',      icon: ClipboardList,   label: 'WO Bill Register' },
    { to: '/tqs/cash-flow',             icon: TrendingUp,      label: 'Cash Flow' },
    { to: '/tqs/cost-report',           icon: PieChart,        label: 'Cost Report' },
    { to: '/tqs/vendor-certifications', icon: FileSignature,   label: 'QS Certification' },
    { to: '/tqs/documents',             icon: FolderSearch,    label: 'Documents' },
  ]},
  { label: 'Quality (QA/QC)', items: [
    { to: '/quality',                    icon: LayoutDashboard, label: 'QA/QC Dashboard' },
    { to: '/quality/itp',                icon: ClipboardList, label: 'ITP Register' },
    { to: '/quality/method-statements',  icon: BookOpen,      label: 'Method Statements' },
    { to: '/quality/rfi',                icon: FileSearch,    label: 'RFI / WIR Ledger' },
    { to: '/quality/mir',                icon: PackageCheck,  label: 'Material Inspection' },
    { to: '/quality/mtc',                icon: ShieldCheck,   label: 'Test Certificates' },
    { to: '/quality/lab-tests',          icon: Activity,      label: 'Lab Certifications' },
    { to: '/quality/pour-cards',         icon: Layers,        label: 'Pour Cards' },
    { to: '/quality/ncr',                icon: AlertTriangle, label: 'NCR Ledger' },
    { to: '/quality/documents',          icon: FolderSearch,  label: 'Document Control' },
    { to: '/quality/templates',          icon: ClipboardCheck,label: 'Checklist Masters' },
    { to: '/quality/snags',              icon: Hammer,        label: 'Snag List' },
    { to: '/quality/audits',             icon: Shield,        label: 'Quality Audits' },
    { to: '/quality/reports',            icon: BarChart3,     label: 'QA/QC Reports' },
    { to: '/quality/doc-repository',     icon: UploadCloud,   label: 'Documents' },
    { to: '/quality/document-library',   icon: BookOpen,      label: 'QC Document Library' },
  ]},
  { label: 'HSE & Safety', items: [
    { to: '/hse',              icon: Shield,       label: 'Safety Dashboard' },
    { to: '/hse/incidents',    icon: AlertTriangle,label: 'Incident Hub' },
    { to: '/hse/permits',      icon: Key,          label: 'Permit to Work' },
    { to: '/hse/ppe',          icon: HardHat,      label: 'PPE Tracking' },
    { to: '/hse/documents',    icon: FolderSearch, label: 'Documents' },
  ]},
  { label: 'Assets & IT', items: [
    { to: '/assets/dashboard',      icon: LayoutDashboard, label: 'Asset Dashboard' },
    { to: '/assets/categories',     icon: Layers,          label: 'Asset Categories' },
    { to: '/assets',                icon: Truck,           label: 'Asset Master' },
    { to: '/assets/tracking',       icon: MapPin,          label: 'Asset Tracking' },
    { to: '/assets/allocation',     icon: ArrowLeftRight,  label: 'Allocation / Issuance' },
    { to: '/assets/maintenance',    icon: Wrench,          label: 'Maintenance Management' },
    { to: '/assets/work-orders',    icon: ClipboardList,   label: 'Work Orders' },
    { to: '/assets/disposal',       icon: CircleSlash,     label: 'Disposal / Scrap' },
    { to: '/assets/asset-docs',     icon: FileText,        label: 'Documents & Permits' },
    { to: '/assets/operations',     icon: Activity,        label: 'Fuel & Usage Logs' },
    { to: '/assets/depreciation',   icon: TrendingDown,    label: 'Depreciation' },
    { to: '/assets/reports',        icon: FileBarChart,    label: 'Reports & Analytics' },
    { to: '/assets/alerts',         icon: Bell,            label: 'Alerts & Notifications' },
    { to: '/assets/roles',          icon: Shield,          label: 'Roles & Permissions' },
    { to: '/it/assets',             icon: Cpu,             label: 'IT Register' },
    { to: '/it/tickets',            icon: Ticket,          label: 'Help Desk' },
    { to: '/it/licenses',           icon: Key,             label: 'Licenses / AMC' },
    { to: '/assets/documents',      icon: FolderSearch,    label: 'Module Documents' },
  ]},
  { label: 'DMS', items: [
    { to: '/dms',         icon: FolderOpen, label: 'Document Repository' },
    { to: '/dms/gfc-log', icon: Layers,     label: 'GFC Master Log' },
  ]},
  { label: 'Subcontractors', items: [
    { to: '/sc/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/sc/master',           icon: Users,           label: 'Subcontractor Master' },
    { to: '/sc/work-orders',      icon: Briefcase,       label: 'Work Order Management' },
    { to: '/sc/labour',           icon: HardHat,         label: 'Labour / Worker Attendance' },
    { to: '/sc/progress',         icon: Ruler,           label: 'Work Progress Entry' },
    { to: '/sc/bill-preparation', icon: Receipt,         label: 'Bill Preparation' },
    { to: '/sc/bill-approval',    icon: ShieldCheck,     label: 'Bill Approval' },
    { to: '/sc/payments',         icon: CreditCard,      label: 'Payment Tracking' },
    { to: '/sc/deductions',       icon: Calculator,      label: 'Retention / Deductions' },
    { to: '/sc/documents',        icon: FolderSearch,    label: 'Documents' },
    { to: '/sc/reports',          icon: BarChart3,       label: 'Reports' },
    { to: '/sc/settings',         icon: Settings,        label: 'Settings' },
  ]},
  { label: 'Administration', items: [
    { to: '/users', icon: Users, label: 'Team Members' },
  ]},
  { label: 'Automation Ideas', items: [
    { to: '/automation-ideas', icon: Lightbulb, label: 'Ideas Dashboard' },
    { to: '/approval-engine', icon: ShieldCheck, label: 'Approval Engine' },
  ]},
  { label: 'Reports', items: [
    { to: '/reports', icon: FileBarChart, label: 'Reports Hub' },
  ]},
];

const GROUP_COLORS = {
  'Overview':          '#6366F1',
  'Planning':          '#3B82F6',
  'Procurement':       '#F59E0B',
  'Tender Management': '#06B6D4',
  'Stores':            '#14B8A6',
  'QS & Billing':      '#10B981',
  'Accounts':          '#10B981',
  'HR & Admin':        '#7C3AED',
  'Bill Tracker':      '#6366F1',
  'Quality (QA/QC)':   '#3B82F6',
  'HSE & Safety':      '#EF4444',
  'Assets & IT':       '#64748B',
  'DMS':               '#0EA5E9',
  'Subcontractors':    '#F97316',
  'Administration':    '#A855F7',
  'Automation Ideas':   '#2563EB',
  'Approval Engine':    '#0F172A',
  'Reports':           '#F43F5E',
};

const NAV_SECTIONS = {
  'Planning': [
    { label: 'Dashboard',  paths: ['/planning','/planning/p6-dashboard'] },
    { label: 'Schedule',   paths: ['/planning/wbs','/planning/activities','/planning/milestones','/planning/look-ahead'] },
    { label: 'Progress',   paths: ['/planning/engineer-log','/planning/dpr','/planning/progress','/planning/delays','/planning/reports'] },
    { label: 'P6',         paths: ['/planning/risks','/planning/mrp'] },
    { label: 'Documents',  paths: ['/planning/documents'] },
  ],
  'Procurement': [
    { label: 'Dashboard',        paths: ['/procurement/dashboard'] },
    { label: 'Request',          paths: ['/procurement/material-request'] },
    { label: 'Vendors & Rates',  paths: ['/procurement/vendors','/procurement/vendor-mapping','/procurement/live-rate-checker','/procurement/rate-contracts'] },
    { label: 'RFQ',              paths: ['/procurement/rfqs'] },
    { label: 'Quotations',       paths: ['/procurement/quotations'] },
    { label: 'Comparative Statements', paths: ['/procurement/comparative-statements'] },
    { label: 'Purchase Orders',  paths: ['/procurement/po','/procurement/po-register','/procurement/po-bulk-import','/procurement/po-amendments'] },
    { label: 'Work Orders',      paths: ['/procurement/work-orders','/procurement/wo-register','/procurement/wo-bulk-import'] },
    { label: 'Performance & Payment', paths: ['/procurement/vendor-performance','/procurement/vendor-payments'] },
    { label: 'Stock',            paths: ['/procurement/inventory'] },
    { label: 'Documents',        paths: ['/procurement/documents'] },
    { label: 'Reports',          paths: ['/procurement/reports'] },
  ],
  'Stores': [
    { label: 'Overview',        paths: ['/stores'] },
    { label: 'Request',         paths: ['/stores/mrs'] },
    { label: 'Purchase Orders', paths: ['/stores/po','/stores/po-register'] },
    { label: 'Work Orders',     paths: ['/stores/work-orders','/stores/wo-register'] },
    { label: 'Receiving',       paths: ['/stores/grn'] },
    { label: 'Stock Control',   paths: ['/stores/ledger','/stores/issue'] },
    { label: 'Transfer',        paths: ['/stores/mtr'] },
    { label: 'Credit Notes',    paths: ['/stores/credit-notes'] },
    { label: 'Documents',       paths: ['/stores/documents'] },
  ],
  'Accounts': [
    { label: 'Dashboard',  paths: ['/accounts'] },
    { label: 'Banking',    paths: ['/accounts/banking/accounts','/accounts/banking/reconciliation','/accounts/banking/cash-flow','/accounts/banking/cheque-tracker','/accounts/banking/petty-cash'] },
    { label: 'Sales',      paths: ['/accounts/sales/customers','/accounts/sales/invoices','/accounts/sales/receipts','/accounts/sales/credit-notes','/accounts/sales/statements'] },
    { label: 'Purchases',  paths: ['/accounts/purchases/vendors','/accounts/purchases/bills','/accounts/purchases/bills/booking','/accounts/purchases/payments-made','/accounts/purchases/payment-run','/accounts/purchases/debit-notes'] },
    { label: 'Accountant', paths: ['/accounts/accountant/chart-of-accounts','/accounts/accountant/journal-entries','/accounts/accountant/transactions'] },
    { label: 'Reports',    paths: ['/accounts/reports/financial','/accounts/reports/billing','/accounts/reports/management-mis','/accounts/reports/control-dashboard','/accounts/reports/budget'] },
    { label: 'Taxes',      paths: ['/accounts/taxes/gst','/accounts/taxes/tds'] },
    { label: 'Documents',  paths: ['/accounts/documents'] },
  ],
  'HR & Admin': [
    { label: 'People',     paths: ['/hr-admin','/hr-admin/employees','/ess'] },
    { label: 'Time',       paths: ['/hr-admin/attendance','/hr-admin/leaves','/hr-admin/holidays'] },
    { label: 'Payroll',    paths: ['/hr-admin/payroll','/hr-admin/salary-structures','/hr-admin/employee-salaries','/hr-admin/loans','/hr-admin/expenses'] },
    { label: 'Admin',      paths: ['/hr-admin/departments','/hr-admin/appraisals','/hr-admin/advanced'] },
    { label: 'Integrate',  paths: ['/hr-admin/essl-sync','/hr-admin/import'] },
    { label: 'Reports',    paths: ['/hr-admin/reports'] },
    { label: 'Documents',  paths: ['/hr-admin/documents'] },
  ],
  'Bill Tracker': [
    { label: 'Bills',      paths: ['/tqs','/tqs/bills','/tqs/transmittal'] },
    { label: 'Trackers',   paths: ['/tqs/material-tracker','/tqs/advance-tracker','/tqs/liability-register'] },
    { label: 'Reports',    paths: ['/tqs/analytics','/tqs/reports','/tqs/deduction-register','/tqs/wo-bill-register','/tqs/cash-flow','/tqs/cost-report'] },
    { label: 'QS Cert',    paths: ['/tqs/vendor-certifications'] },
    { label: 'Documents',  paths: ['/tqs/documents'] },
  ],
  'QS & Billing': [
    { label: 'Overview',             paths: ['/qs','/qs/boq-dashboard'] },
    { label: 'Quantity Survey',      paths: ['/qs/boq','/qs/boq-mapping','/qs/measurements','/qs/ra-bills'] },
    { label: 'Vendor Certification', paths: ['/qs/vendor-certifications','/qs/retention-releases'] },
    { label: 'Controls',             paths: ['/qs/variations','/qs/material-recon','/qs/norms','/qs/reports'] },
    { label: 'Documents',            paths: ['/qs/documents'] },
  ],
  'Quality (QA/QC)': [
    { label: 'Dashboard',    paths: ['/quality'] },
    { label: 'Planning',     paths: ['/quality/itp','/quality/method-statements'] },
    { label: 'Inspection',   paths: ['/quality/rfi'] },
    { label: 'Materials',    paths: ['/quality/mir','/quality/mtc','/quality/lab-tests'] },
    { label: 'Pour Cards',   paths: ['/quality/pour-cards'] },
    { label: 'NCR & Snag',   paths: ['/quality/ncr','/quality/snags'] },
    { label: 'Audits',       paths: ['/quality/audits'] },
    { label: 'Doc Control',  paths: ['/quality/documents','/quality/templates','/quality/reports'] },
    { label: 'Documents',    paths: ['/quality/doc-repository','/quality/document-library'] },
  ],
  'HSE & Safety': [
    { label: 'Safety',    paths: ['/hse','/hse/incidents','/hse/permits','/hse/ppe'] },
    { label: 'Documents', paths: ['/hse/documents'] },
  ],
  'Assets & IT': [
    { label: 'Dashboard', paths: ['/assets/dashboard'] },
    { label: 'Register',  paths: ['/assets','/assets/categories'] },
    { label: 'Ops',       paths: ['/assets/tracking','/assets/allocation','/assets/maintenance','/assets/work-orders','/assets/disposal','/assets/asset-docs','/assets/operations'] },
    { label: 'Reports',   paths: ['/assets/reports','/assets/depreciation','/assets/alerts','/assets/roles'] },
    { label: 'IT',        paths: ['/it/assets','/it/tickets','/it/licenses'] },
    { label: 'Documents', paths: ['/assets/documents'] },
  ],
  'Tender Management': [
    { label: 'Tenders',   paths: ['/tender-management','/tender-management/issue'] },
    { label: 'Documents', paths: ['/tender-management/documents'] },
  ],
  'Subcontractors': [
    { label: 'Overview',    paths: ['/sc/dashboard','/sc/master'] },
    { label: 'Work Orders', paths: ['/sc/work-orders'] },
    { label: 'Site Work',   paths: ['/sc/labour','/sc/progress'] },
    { label: 'Billing',     paths: ['/sc/bill-preparation','/sc/bill-approval'] },
    { label: 'Payments',    paths: ['/sc/payments','/sc/deductions'] },
    { label: 'More',        paths: ['/sc/reports','/sc/documents','/sc/settings'] },
  ],
};

function getNavSections(group) {
  const config = NAV_SECTIONS[group.label];
  if (!config) return [{ label: null, items: group.items }];
  const used = new Set();
  const sections = config.map(s => ({
    label: s.label,
    items: s.paths.map(p => group.items.find(i => i.to === p || i.to.split('?')[0] === p)).filter(Boolean),
  })).filter(s => s.items.length > 0);
  sections.forEach(s => s.items.forEach(i => used.add(i.to)));
  const remaining = group.items.filter(i => !used.has(i.to));
  if (remaining.length) sections.push({ label: null, items: remaining });
  return sections;
}

function hexToRgba(hex, alpha) {
  const h = (hex || '#6366F1').replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0,2),16), g = parseInt(full.slice(2,4),16), b = parseInt(full.slice(4,6),16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(99,102,241,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Dropdown menu — groups expand to their own sub-menus (accordion) ─────────
function GroupDropdown({ group, onClose, pos, onKeepOpen, onStartClose }) {
  const location = useLocation();
  const { t } = useLanguage();
  const color = GROUP_COLORS[group.label] || '#6366F1';
  const sections = getNavSections(group);

  const matchesPath = (itemTo) => {
    const p = itemTo.split('?')[0];
    if (location.pathname === p) return true;
    const segs = p.split('/').filter(Boolean);
    return segs.length >= 2 && location.pathname.startsWith(p + '/');
  };

  // Any labelled section with 2+ items becomes an expandable sub-menu group
  const hasSubMenus = sections.some(s => s.label && s.items.length > 1);
  const activeSection = sections.find(s => s.items.some(i => matchesPath(i.to)));
  const [openGroups, setOpenGroups] = useState(() => new Set(activeSection?.label ? [activeSection.label] : []));
  const toggleGroup = (label) => setOpenGroups(prev => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

  const renderItem = (item) => {
    const active = matchesPath(item.to);
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={onClose}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 12px',
          borderRadius: 6, margin: '1px 4px',
          background: active ? hexToRgba(color, 0.08) : 'transparent',
          color: active ? color : '#0F172A',
          textDecoration: 'none',
          fontSize: 11, fontWeight: active ? 700 : 600,
          textTransform: 'uppercase', letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F8FAFC'; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon size={12} style={{ flexShrink: 0, color: active ? color : '#475569' }} />
        <span>{t(item.label)}</span>
        {item.badge && (
          <span style={{ marginLeft: 'auto', background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10 }}>
            {item.badge}
          </span>
        )}
      </NavLink>
    );
  };

  const vw = window.innerWidth;

  // ── Accordion mode: group headers expand to their own sub-menus ──
  if (hasSubMenus) {
    const dropW = 280;
    let left = pos.left;
    if (left + dropW > vw - 8) left = vw - dropW - 8;
    if (left < 8) left = 8;

    return (
      <div
        style={{
          position: 'fixed',
          top: pos.top,
          left,
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderTop: `3px solid ${color}`,
          borderRadius: '0 0 12px 12px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.14)',
          width: dropW,
          zIndex: 9999,
          padding: '8px 0 12px',
        }}
        data-nav-dropdown="true"
        onMouseEnter={onKeepOpen}
        onMouseLeave={onStartClose}
      >
        {/* Group header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 16px 8px',
          borderBottom: '1px solid #F1F5F9', marginBottom: 4,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t(group.label)}
          </span>
        </div>

        <div style={{ maxHeight: '72vh', overflowY: 'auto', padding: '0 4px' }}>
          {sections.map((section) => {
            const isGroup = section.label && section.items.length > 1;
            if (!isGroup) return section.items.map(item => renderItem(item));

            const isOpen    = openGroups.has(section.label);
            const hasActive = section.items.some(i => matchesPath(i.to));
            const HeadIcon  = section.items[0]?.icon || ChevronRight;
            return (
              <div key={section.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(section.label)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: 'calc(100% - 8px)',
                    padding: '6px 12px',
                    borderRadius: 6, margin: '1px 4px',
                    background: isOpen ? hexToRgba(color, 0.06) : 'transparent',
                    color: hasActive ? color : '#0F172A',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontSize: 11, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = isOpen ? hexToRgba(color, 0.06) : '#F8FAFC'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isOpen ? hexToRgba(color, 0.06) : 'transparent'; }}
                >
                  <HeadIcon size={12} style={{ flexShrink: 0, color: hasActive ? color : '#475569' }} />
                  <span>{t(section.label)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#94A3B8' }}>{section.items.length}</span>
                  <ChevronDown size={12} style={{
                    flexShrink: 0, color: '#94A3B8',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s',
                  }} />
                </button>
                {isOpen && (
                  <div style={{
                    margin: '0 4px 2px 14px',
                    paddingLeft: 6,
                    borderLeft: `2px solid ${hexToRgba(color, 0.25)}`,
                  }}>
                    {section.items.map(item => renderItem(item))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Flat mode (modules without sub-menu groups) — original grid layout ──
  const numCols = sections.length <= 2 ? 1 : sections.length <= 5 ? 2 : 3;
  const colW    = numCols === 1 ? 210 : numCols === 2 ? 230 : 220;
  const dropW   = numCols * colW + (numCols - 1) * 1 + 24; // columns + dividers + padding

  // Distribute sections into columns (balanced by section count)
  const cols = Array.from({ length: numCols }, () => []);
  sections.forEach((sec, i) => cols[i % numCols].push(sec));

  let left = pos.left;
  if (left + dropW > vw - 8) left = vw - dropW - 8;
  if (left < 8) left = 8;

  return (
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        left,
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderTop: `3px solid ${color}`,
        borderRadius: '0 0 12px 12px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.14)',
        width: dropW,
        zIndex: 9999,
        padding: '8px 0 12px',
      }}
      data-nav-dropdown="true"
      onMouseEnter={onKeepOpen}
      onMouseLeave={onStartClose}
    >
      {/* Group header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 16px 8px',
        borderBottom: '1px solid #F1F5F9', marginBottom: 4,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {t(group.label)}
        </span>
      </div>

      {/* Items — CSS grid columns */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numCols}, 1fr)`, gap: 0 }}>
        {cols.map((colSections, ci) => (
          <div key={ci} style={{
            borderLeft: ci > 0 ? '1px solid #F1F5F9' : 'none',
            padding: '0 4px',
          }}>
            {colSections.map((section, si) => (
              <div key={si} style={{ marginBottom: si < colSections.length - 1 ? 4 : 0 }}>
                {section.label && (
                  <div style={{
                    padding: '6px 12px 2px',
                    fontSize: 9, fontWeight: 900, color: color,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}>
                    {t(section.label)}
                  </div>
                )}
                {section.items.map(item => renderItem(item))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scrollable nav wrapper with left/right arrows ────────────────────────────
function NavScroller({ children }) {
  const navRef   = useRef(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);

  const check = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [check]);

  const scroll = (dir) => {
    navRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' });
  };

  const arrowStyle = (enabled) => ({
    flexShrink: 0,
    width: enabled ? 24 : 0, height: 50,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: enabled ? 'rgba(255,255,255,0.06)' : 'transparent',
    border: 'none', cursor: enabled ? 'pointer' : 'default',
    color: enabled ? 'rgba(255,255,255,0.7)' : 'transparent',
    transition: 'background 0.15s, width 0.15s',
    padding: 0,
    overflow: 'hidden',
  });

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', minWidth: 0, position: 'relative' }}>
      <button style={arrowStyle(canLeft)} onClick={() => scroll(-1)} tabIndex={-1}>
        <ChevronLeft size={14} />
      </button>
      <nav
        ref={navRef}
        style={{ flex: 1, display: 'flex', alignItems: 'center', overflowX: 'auto', minWidth: 0, gap: 4, padding: '0 8px' }}
        className="nav-scroll"
      >
        {children}
      </nav>
      <button style={arrowStyle(canRight)} onClick={() => scroll(1)} tabIndex={-1}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ── Nav group button ─────────────────────────────────────────────────────────
function NavGroupButton({ group, isActive, isOpen, onOpen, onClose, dropPos, setDropPos, closeTimer }) {
  const color = GROUP_COLORS[group.label] || '#6366F1';
  const { t } = useLanguage();
  const ref = useRef(null);

  const calcPos = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom, left: rect.left });
    }
  };

  const handleMouseEnter = () => {
    clearTimeout(closeTimer.current);
    calcPos();
    onOpen();
  };
  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(onClose, 200);
  };

  return (
    <div
      ref={ref}
      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 3px' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => { if (isOpen) { onClose(); } else { calcPos(); onOpen(); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 13px',
          height: 34,
          background: isActive
            ? hexToRgba(color, 0.22)
            : isOpen
              ? hexToRgba(color, 0.12)
              : 'transparent',
          border: isActive
            ? `1px solid ${hexToRgba(color, 0.55)}`
            : isOpen
              ? `1px solid ${hexToRgba(color, 0.3)}`
              : '1px solid transparent',
          borderRadius: 8,
          color: isActive ? '#FFFFFF' : isOpen ? '#FFFFFF' : 'rgba(255,255,255,0.92)',
          fontSize: 11.5, fontWeight: isActive ? 700 : 600,
          cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'all 0.15s ease',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          textShadow: isActive ? `0 0 12px ${hexToRgba(color, 0.6)}` : 'none',
        }}
        onMouseEnter={e => {
          if (!isActive && !isOpen) {
            e.currentTarget.style.background = hexToRgba(color, 0.15);
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.borderColor = hexToRgba(color, 0.35);
          }
        }}
        onMouseLeave={e => {
          if (!isActive && !isOpen) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.92)';
            e.currentTarget.style.borderColor = 'transparent';
          }
        }}
      >
        {/* Colored dot — always uses group colour */}
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: color,
          boxShadow: isActive ? `0 0 8px ${color}, 0 0 3px ${color}` : `0 0 5px ${hexToRgba(color, 0.5)}`,
          transition: 'all 0.15s',
        }} />
        {t(group.label)}
        <ChevronDown
          size={10}
          style={{
            opacity: isActive ? 0.9 : 0.6,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            marginLeft: 1,
          }}
        />
      </button>
    </div>
  );
}

// ── Page title hook ──────────────────────────────────────────────────────────
function usePageTitle() {
  const location = useLocation();
  const smartMatch = (itemTo) => {
    const p = itemTo.split('?')[0];
    if (location.pathname === p) return true;
    const segs = p.split('/').filter(Boolean);
    return segs.length >= 2 && location.pathname.startsWith(p + '/');
  };
  let best = null;
  for (const g of navGroups) {
    for (const item of g.items) {
      if (smartMatch(item.to)) {
        if (!best || item.to.length > best.item.to.length) best = { item, group: g.label };
      }
    }
  }
  if (best) return { title: best.item.label, group: best.group };
  return { title: 'ConstructERP', group: '' };
}

function useRecentPages() {
  const location = useLocation();
  const [recents, setRecents] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('erp-recents') || '[]'); }
    catch { return []; }
  });
  useEffect(() => {
    let best = null;
    for (const g of navGroups) {
      for (const item of g.items) {
        const p = item.to.split('?')[0];
        const segs = p.split('/').filter(Boolean);
        const hit = location.pathname === p || (segs.length >= 2 && location.pathname.startsWith(p + '/'));
        if (hit && (!best || item.to.length > best.to.length)) {
          best = { to: item.to, label: item.label, group: g.label };
        }
      }
    }
    if (!best) return;
    setRecents(prev => {
      const next = [best, ...prev.filter(r => r.to !== best.to)].slice(0, 6);
      sessionStorage.setItem('erp-recents', JSON.stringify(next));
      return next;
    });
  }, [location.pathname]);
  return recents;
}

// ── Mobile slide-in sidebar ──────────────────────────────────────────────────
function MobileSidebar({ open, onClose, navGroups, user, matchesPath, recentPages = [] }) {
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);
  const { t } = useLanguage();

  return (
    <>
      {open && <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" onClick={onClose} />}
      <div style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 280,
        background: 'linear-gradient(180deg,#1E40AF 0%,#172554 100%)',
        zIndex: 100, transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/bcim-logo.png" alt="BCIM" style={{ width: 32, height: 32, objectFit: 'contain', background: '#fff', borderRadius: 8, padding: 3 }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>BCIM ERP</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>v3.0</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'rgba(255,255,255,0.7)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Recent pages */}
        {recentPages.length > 0 && (
          <div style={{ padding: '6px 0 0' }}>
            <div style={{ padding: '4px 16px 6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <Clock3 size={10} />
              Recent
            </div>
            {recentPages.slice(0, 5).map(page => {
              const navItem = navGroups.flatMap(g => g.items).find(i => i.to === page.to);
              const Icon = navItem?.icon || Clock3;
              const isActive = matchesPath(page.to);
              return (
                <NavLink key={page.to} to={page.to} onClick={onClose}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px 7px 28px',
                    background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
                    textDecoration: 'none', fontSize: 13, fontWeight: isActive ? 600 : 400,
                    borderLeft: isActive ? '3px solid rgba(255,255,255,0.6)' : '3px solid transparent',
                  }}
                >
                  <Icon size={13} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.label}</span>
                </NavLink>
              );
            })}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 16px 4px' }} />
          </div>
        )}

        {/* Groups */}
        <div style={{ flex: 1, padding: '8px 0' }}>
          {navGroups.map(group => {
            const color = GROUP_COLORS[group.label] || '#6366F1';
            const hasActive = group.items.some(i => matchesPath(i.to));
            const isOpen = expandedGroup === group.label;
            return (
              <div key={group.label}>
                <button
                  onClick={() => setExpandedGroup(isOpen ? null : group.label)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 16px', background: 'transparent', border: 'none',
                    color: hasActive ? '#fff' : 'rgba(255,255,255,0.85)', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: hasActive ? `0 0 6px ${color}` : 'none' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>{t(group.label)}</span>
                  <ChevronDown size={12} style={{ opacity: 0.75, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {isOpen && (() => {
                  const renderLink = (item, nested) => {
                    const Icon = item.icon;
                    const active = matchesPath(item.to);
                    return (
                      <NavLink key={item.to} to={item.to} onClick={onClose}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: nested ? '7px 16px 7px 40px' : '7px 16px 7px 28px',
                          background: active ? hexToRgba(color, 0.18) : 'transparent',
                          color: active ? '#fff' : 'rgba(255,255,255,0.85)',
                          textDecoration: 'none', fontSize: 13,
                          fontWeight: active ? 600 : 400,
                          borderLeft: active ? `3px solid ${color}` : '3px solid transparent',
                        }}
                      >
                        <Icon size={13} />
                        {t(item.label)}
                      </NavLink>
                    );
                  };
                  return (
                    <div style={{ paddingBottom: 4 }}>
                      {getNavSections(group).map(section => {
                        const isSub = section.label && section.items.length > 1;
                        if (!isSub) return section.items.map(item => renderLink(item, false));
                        const key       = `${group.label}:${section.label}`;
                        const subOpen   = expandedSection === key;
                        const subActive = section.items.some(i => matchesPath(i.to));
                        const SubIcon   = section.items[0]?.icon || FolderSearch;
                        return (
                          <div key={key}>
                            <button
                              onClick={() => setExpandedSection(subOpen ? null : key)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                padding: '7px 16px 7px 28px', background: 'transparent', border: 'none',
                                color: subActive ? '#fff' : 'rgba(255,255,255,0.85)', cursor: 'pointer', textAlign: 'left',
                                fontSize: 13, fontWeight: 600,
                              }}
                            >
                              <SubIcon size={13} />
                              <span style={{ flex: 1 }}>{t(section.label)}</span>
                              <span style={{ fontSize: 10, opacity: 0.6 }}>{section.items.length}</span>
                              <ChevronDown size={11} style={{ opacity: 0.75, transform: subOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>
                            {subOpen && section.items.map(item => renderLink(item, true))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Desktop Sidebar ───────────────────────────────────────────────────────────
function DesktopSidebar({ navGroups, matchesPath, collapsed, onToggle, topOffset, recentPages = [] }) {
  const activeGroup = navGroups.find(group => group.items.some(item => matchesPath(item.to)))?.label;
  const [expandedGroup, setExpandedGroup] = useState(activeGroup || navGroups[0]?.label);
  const [expandedSection, setExpandedSection] = useState(null);
  const [hovered, setHovered] = useState(false);
  const { t } = useLanguage();
  const location = useLocation();

  // When pinned open and route changes, auto-open the active group
  useEffect(() => {
    if (activeGroup && !collapsed) setExpandedGroup(activeGroup);
  }, [activeGroup, collapsed]);

  // Auto-open the sub-group that contains the active page
  useEffect(() => {
    const grp = navGroups.find(g => g.label === expandedGroup);
    if (!grp) { setExpandedSection(null); return; }
    const act = getNavSections(grp).find(s => s.label && s.items.length > 1 && s.items.some(i => matchesPath(i.to)));
    setExpandedSection(act ? `${grp.label}:${act.label}` : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedGroup, location.pathname]);

  // Close on EVERY navigation — this is the reliable auto-hide trigger.
  // Works regardless of mouse position after clicking a link.
  useEffect(() => {
    setHovered(false);
  }, [location.pathname]);

  const isExpanded = !collapsed || hovered;
  // Clicking a nav link: close immediately + navigation useEffect also fires
  const handleNavClick = () => setHovered(false);

  return (
    <>
      {/* ── Layout gap ── keeps the correct space in the flex row (invisible) */}
      <div
        className="print:hidden desktop-sidebar"
        style={{ width: collapsed ? 64 : 264, flexShrink: 0, transition: 'width 0.22s ease' }}
      />

      {/* ── Actual sidebar ── always position:fixed so expanding NEVER shifts page content.
           position:absolute had a height:100% bug when parent flex item has no explicit height. */}
      <aside
        className="print:hidden desktop-sidebar"
        onMouseEnter={() => collapsed && setHovered(true)}
        onMouseLeave={() => collapsed && setHovered(false)}
        style={{
          position: 'fixed',
          top: topOffset,   // passed from Layout: 52px (no breadcrumb) or 80px (with breadcrumb)
          left: 0,
          bottom: 0,
          width: isExpanded ? 264 : 64,
          zIndex: 44,       // below header (50), above page content
          background: 'linear-gradient(180deg, #111e3a 0%, #172554 60%, #1e3a8a 100%)',
          borderRight: 'none',
          boxShadow: isExpanded ? '4px 0 24px rgba(0,0,0,0.35)' : '2px 0 12px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.22s ease, box-shadow 0.22s ease',
        }}
      >
        {isExpanded ? (
          /* ── Expanded: full nav list ── */
          <div style={{ flex: 1, overflowY: 'auto', padding: 8, minWidth: 264 }}>
            <div style={{ padding: '6px 8px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Navigation</div>
              <button
                onClick={onToggle}
                title={collapsed ? 'Pin sidebar open' : 'Switch to auto-hide'}
                style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.18s ease' }}
              >
                {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </button>
            </div>
            {recentPages.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ padding: '2px 10px 6px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <Clock3 size={9} />
                  Recent
                </div>
                {recentPages.slice(0, 5).map(page => {
                  const navItem = navGroups.flatMap(g => g.items).find(i => i.to === page.to);
                  const Icon = navItem?.icon || Clock3;
                  const isActive = matchesPath(page.to);
                  return (
                    <NavLink key={page.to} to={page.to} onClick={handleNavClick}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px',
                        borderRadius: 7, textDecoration: 'none', fontSize: 12.5, fontWeight: isActive ? 600 : 400,
                        color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                        background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                        transition: 'background 0.12s',
                      }}
                    >
                      <Icon size={13} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.6 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.label}</span>
                      <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)', fontWeight: 500, flexShrink: 0 }}>{page.group}</span>
                    </NavLink>
                  );
                })}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 4px 8px' }} />
              </div>
            )}
            {navGroups.map((group, gi) => {
              const hasActive = group.items.some(item => matchesPath(item.to));
              const isOpen = expandedGroup === group.label;
              const GroupIcon = group.items[0]?.icon || FolderSearch;

              const renderLink = (item, nested) => {
                const Icon = item.icon;
                const active = matchesPath(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={handleNavClick}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      margin: '1px 0',
                      padding: nested ? '6px 8px 6px 36px' : '6px 8px 6px 26px',
                      borderRadius: 6,
                      background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                      color: active ? '#fff' : 'rgba(255,255,255,0.75)',
                      textDecoration: 'none',
                      fontSize: 12, fontWeight: active ? 600 : 400,
                      borderLeft: active ? '3px solid rgba(255,255,255,0.8)' : '3px solid transparent',
                    }}
                  >
                    <Icon size={13} style={{ flexShrink: 0, opacity: active ? 1 : 0.55 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(item.label)}</span>
                  </NavLink>
                );
              };

              return (
                <div key={group.label}>
                  {gi > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 4px 8px' }} />}

                  {/* ── Module header ── */}
                  <button
                    onClick={() => setExpandedGroup(isOpen ? null : group.label)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '9px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: isOpen ? 'rgba(255,255,255,0.15)' : hasActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                      marginBottom: isOpen ? 4 : 0,
                      transition: 'background 0.15s',
                    }}
                  >
                    <GroupIcon size={15} style={{ color: '#fff', flexShrink: 0, opacity: isOpen || hasActive ? 1 : 0.6 }} />
                    <span style={{
                      flex: 1, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: isOpen || hasActive ? '#fff' : 'rgba(255,255,255,0.65)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {t(group.label)}
                    </span>
                    <ChevronDown size={13} style={{
                      color: 'rgba(255,255,255,0.45)',
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.18s', flexShrink: 0,
                    }} />
                  </button>

                  {isOpen && (
                    <div style={{ paddingBottom: 4 }}>
                      {getNavSections(group).map(section => {
                        const isSub = section.label && section.items.length > 1;
                        if (!isSub) return section.items.map(item => renderLink(item, false));
                        const subActive = section.items.some(i => matchesPath(i.to));
                        const SubIcon = section.items[0]?.icon || FolderSearch;
                        return (
                          <div key={section.label}>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '5px 8px 2px 20px',
                              color: subActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)',
                              fontSize: 10, fontWeight: 700,
                              textTransform: 'uppercase', letterSpacing: '0.07em',
                            }}>
                              <SubIcon size={10} style={{ flexShrink: 0 }} />
                              {t(section.label)}
                            </div>
                            {section.items.map(item => renderLink(item, true))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Collapsed: icon-only strip (hover to expand) ── */
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
            {recentPages.length > 0 && (
              <>
                {recentPages.slice(0, 3).map(page => {
                  const navItem = navGroups.flatMap(g => g.items).find(i => i.to === page.to);
                  const Icon = navItem?.icon || Clock3;
                  const isActive = matchesPath(page.to);
                  return (
                    <NavLink key={page.to} to={page.to} onClick={handleNavClick}
                      title={page.label}
                      style={{
                        width: 44, height: 38, margin: '2px auto 4px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', borderRadius: 9,
                        textDecoration: 'none',
                        background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
                        color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                      }}
                    >
                      <Icon size={16} />
                    </NavLink>
                  );
                })}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 8px 6px' }} />
              </>
            )}
            {navGroups.map(group => {
              const hasActive = group.items.some(item => matchesPath(item.to));
              const GroupIcon = group.items[0]?.icon || FolderSearch;
              return (
                <button
                  key={group.label}
                  onClick={() => setExpandedGroup(group.label)}
                  title={group.label}
                  style={{
                    width: 44, height: 42,
                    margin: '2px auto 6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 10, border: 'none',
                    background: hasActive ? 'rgba(255,255,255,0.18)' : 'transparent',
                    color: hasActive ? '#fff' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer', position: 'relative',
                  }}
                >
                  <GroupIcon size={18} />
                  {hasActive && <span style={{ position: 'absolute', left: 2, top: 10, bottom: 10, width: 3, borderRadius: 4, background: '#fff' }} />}
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </>
  );
}

const WELCOME_PARTICLES = [
  [10, 14, 0,    6],  [22, 8,  1.2, 8],  [38, 18, 0.5, 7],
  [55, 10, 2,   9],  [68, 16, 0.8, 6],  [80, 7,  1.5, 8],
  [90, 12, 0.3, 7],  [47, 9,  2.5, 9],
];

function WelcomeScreen({ user, onDone }) {
  const [phase, setPhase] = useState('enter'); // enter → stay → exit
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('exit'), 2600);
    const t2 = setTimeout(() => onDoneRef.current(), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const roleLabel = (user?.role || '').replace(/_/g, ' ');
  const firstName = (user?.name || 'there').split(' ')[0];

  return (
    <>
      <style>{`
        @keyframes ws-fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes ws-scaleIn  { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }
        @keyframes ws-slideUp  { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ws-barGrow  { from{width:0%} to{width:100%} }
        @keyframes ws-pulse    { 0%,100%{opacity:0.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }
        @keyframes ws-floatUp  { 0%{opacity:0;transform:translateY(0) scale(0.6)} 15%{opacity:0.6} 85%{opacity:0.15} 100%{opacity:0;transform:translateY(-120px) scale(1.2)} }
        @keyframes ws-shimmer  { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes ws-ringRot  { to{transform:rotate(360deg)} }
        @keyframes ws-out      { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(1.04)} }
        @keyframes ws-curtainUp { from{transform:translateY(0)} to{transform:translateY(-100%)} }
        @keyframes ws-gridFade { 0%,100%{opacity:0.02} 50%{opacity:0.06} }

        .ws-root {
          position:fixed; inset:0; z-index:10000;
          display:flex; align-items:center; justify-content:center;
          flex-direction:column;
          background:#06102a;
          overflow:hidden;
          animation: ${phase === 'exit' ? 'ws-curtainUp 0.6s cubic-bezier(0.4,0,0.2,1) both' : 'ws-fadeIn 0.35s ease both'};
        }
        .ws-grid {
          position:absolute; inset:0; pointer-events:none;
          background-image:
            linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),
            linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px);
          background-size:60px 60px;
          animation: ws-gridFade 4s ease-in-out infinite;
        }
        .ws-ring {
          position:absolute; border-radius:50%; pointer-events:none;
          border:1px solid rgba(201,162,39,0.12);
          animation: ws-ringRot linear infinite;
        }
        .ws-gold-bar {
          position:absolute; top:0; left:0; right:0; height:3px;
          background:linear-gradient(90deg,#c9a227,#f0d060,#e8c547,#c9a227);
          background-size:200% 100%;
          animation: ws-shimmer 2s linear infinite;
        }
        .ws-bottom-bar {
          position:absolute; bottom:0; left:0; right:0; height:3px;
          background:rgba(201,162,39,0.3);
        }
        .ws-progress {
          position:absolute; bottom:0; left:0; height:3px;
          background:linear-gradient(90deg,#c9a227,#f0d060);
          animation: ws-barGrow 2.4s 0.3s cubic-bezier(0.4,0,0.2,1) both;
        }
        .ws-content {
          position:relative; z-index:10;
          display:flex; flex-direction:column; align-items:center; gap:0;
          text-align:center;
        }
        .ws-logo-wrap {
          width:90px; height:90px; border-radius:20px;
          background:#fff; padding:10px;
          display:flex; align-items:center; justify-content:center;
          box-shadow:0 0 0 0 rgba(201,162,39,0.4);
          margin-bottom:28px;
          animation: ws-scaleIn 0.5s 0.1s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .ws-logo-wrap img { width:100%; height:100%; object-fit:contain; }
        .ws-company {
          font-size:13px; font-weight:700; color:rgba(255,255,255,0.45);
          letter-spacing:0.18em; text-transform:uppercase; margin-bottom:20px;
          animation: ws-slideUp 0.5s 0.4s ease both; opacity:0;
        }
        .ws-welcome-line {
          font-size:15px; font-weight:500; color:rgba(255,255,255,0.5);
          letter-spacing:0.06em; margin-bottom:8px;
          animation: ws-slideUp 0.5s 0.55s ease both; opacity:0;
        }
        .ws-name {
          font-size:44px; font-weight:800; color:#fff;
          letter-spacing:-0.02em; line-height:1.1;
          animation: ws-slideUp 0.6s 0.65s cubic-bezier(0.22,1,0.36,1) both; opacity:0;
        }
        .ws-name span { color:#e8c547; }
        .ws-role {
          margin-top:12px; display:inline-flex; align-items:center; gap:7px;
          background:rgba(201,162,39,0.12); border:1px solid rgba(201,162,39,0.25);
          border-radius:20px; padding:5px 14px;
          font-size:11px; font-weight:700; color:#c9a227;
          letter-spacing:0.1em; text-transform:uppercase;
          animation: ws-slideUp 0.5s 0.8s ease both; opacity:0;
        }
        .ws-role-dot { width:5px; height:5px; border-radius:50%; background:#c9a227; animation:ws-pulse 1.5s ease-in-out infinite; }
        .ws-modules {
          margin-top:36px; display:flex; gap:16px; flex-wrap:wrap; justify-content:center;
          animation: ws-slideUp 0.5s 0.95s ease both; opacity:0;
        }
        .ws-module-chip {
          display:flex; align-items:center; gap:6px;
          background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
          border-radius:8px; padding:7px 12px;
          font-size:11px; color:rgba(255,255,255,0.55); font-weight:500;
          transition:background 0.2s;
        }
        .ws-loading-text {
          position:absolute; bottom:12px; left:50%; transform:translateX(-50%);
          font-size:10px; color:rgba(255,255,255,0.25); letter-spacing:0.12em;
          text-transform:uppercase; white-space:nowrap;
          animation: ws-fadeIn 0.5s 1.2s ease both; opacity:0;
        }
        .ws-particle {
          position:absolute; bottom:-20px; border-radius:50%;
          background:rgba(201,162,39,0.3); pointer-events:none;
          animation: ws-floatUp ease-in-out infinite;
        }
      `}</style>

      <div className="ws-root">
        <div className="ws-grid" />
        <div className="ws-gold-bar" />

        {/* Rotating rings */}
        {[[380,30],[260,20],[160,15]].map(([size, dur], i) => (
          <div key={i} className="ws-ring" style={{ width:size, height:size, animationDuration:`${dur}s`, animationDirection: i%2?'reverse':'normal' }} />
        ))}

        {/* Floating particles */}
        {WELCOME_PARTICLES.map(([left, size, delay, dur], i) => (
          <div key={i} className="ws-particle" style={{ left:`${left}%`, width:size, height:size, animationDelay:`${delay}s`, animationDuration:`${dur}s` }} />
        ))}

        {/* Main content */}
        <div className="ws-content">
          <div className="ws-logo-wrap">
            <img src="/bcim-logo.png" alt="BCIM" />
          </div>

          <div className="ws-company">BCIM Engineering · ConstructERP</div>

          <div className="ws-welcome-line">Welcome back,</div>
          <div className="ws-name">
            Good {getGreeting()}, <span>{firstName}!</span>
          </div>

          {roleLabel && (
            <div className="ws-role">
              <span className="ws-role-dot" />
              {roleLabel}
            </div>
          )}

          <div className="ws-modules">
            {[
              { icon: Building2,   label: 'Projects'    },
              { icon: BarChart3,   label: 'Analytics'   },
              { icon: FileText,    label: 'Bills'        },
              { icon: Users,       label: 'Team'         },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="ws-module-chip">
                <Icon size={12} style={{ color: '#c9a227' }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="ws-bottom-bar" />
        <div className="ws-progress" />
        <div className="ws-loading-text">Loading your workspace…</div>
      </div>
    </>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

// ── Logout Screen ─────────────────────────────────────────────────────────────
function LogoutScreen({ user, onDone }) {
  const [phase, setPhase] = useState('enter');
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('exit'), 2200);
    const t2 = setTimeout(() => onDoneRef.current(), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const firstName = (user?.name || 'there').split(' ')[0];

  return (
    <>
      <style>{`
        @keyframes lo-fadeIn    { from{opacity:0}                            to{opacity:1} }
        @keyframes lo-scaleIn   { from{opacity:0;transform:scale(0.7)}       to{opacity:1;transform:scale(1)} }
        @keyframes lo-slideUp   { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
        @keyframes lo-barShrink { from{width:100%} to{width:0%} }
        @keyframes lo-pulse     { 0%,100%{opacity:0.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }
        @keyframes lo-floatUp   { 0%{opacity:0;transform:translateY(0) scale(0.6)} 15%{opacity:0.5} 85%{opacity:0.1} 100%{opacity:0;transform:translateY(-130px) scale(1.2)} }
        @keyframes lo-shimmer   { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes lo-ringRot   { to{transform:rotate(360deg)} }
        @keyframes lo-curtainDown { from{transform:translateY(0)} to{transform:translateY(100%)} }
        @keyframes lo-iconBob   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes lo-waveIn    { 0%{clip-path:circle(0% at 50% 50%)} 100%{clip-path:circle(150% at 50% 50%)} }
        @keyframes lo-checkDraw { from{stroke-dashoffset:60} to{stroke-dashoffset:0} }

        .lo-root {
          position:fixed; inset:0; z-index:10000;
          display:flex; align-items:center; justify-content:center; flex-direction:column;
          overflow:hidden;
          background: linear-gradient(160deg, #06102a 0%, #0a1f4e 50%, #06102a 100%);
          animation: ${phase === 'exit' ? 'lo-curtainDown 0.5s cubic-bezier(0.4,0,0.2,1) both' : 'lo-waveIn 0.55s cubic-bezier(0.22,1,0.36,1) both'};
        }
        .lo-grid {
          position:absolute; inset:0; pointer-events:none;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),
            linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);
          background-size:60px 60px;
        }
        .lo-gold-bar {
          position:absolute; top:0; left:0; right:0; height:3px;
          background:linear-gradient(90deg,#c9a227,#f0d060,#e8c547,#c9a227);
          background-size:200% 100%;
          animation: lo-shimmer 2s linear infinite;
        }
        .lo-ring {
          position:absolute; border-radius:50%; pointer-events:none;
          border:1px solid rgba(201,162,39,0.1);
          animation: lo-ringRot linear infinite;
        }
        .lo-particle {
          position:absolute; bottom:-20px; border-radius:50%;
          background:rgba(201,162,39,0.25); pointer-events:none;
          animation: lo-floatUp ease-in-out infinite;
        }

        .lo-content {
          position:relative; z-index:10;
          display:flex; flex-direction:column; align-items:center;
          text-align:center;
        }

        /* Goodbye icon circle */
        .lo-icon-circle {
          width:90px; height:90px; border-radius:50%;
          background:rgba(201,162,39,0.1);
          border:2px solid rgba(201,162,39,0.3);
          display:flex; align-items:center; justify-content:center;
          margin-bottom:28px;
          animation: lo-scaleIn 0.5s 0.1s cubic-bezier(0.34,1.56,0.64,1) both, lo-iconBob 3s 0.8s ease-in-out infinite;
          opacity:0;
        }
        .lo-icon-circle svg { width:40px; height:40px; }

        .lo-company {
          font-size:11px; font-weight:700; color:rgba(255,255,255,0.35);
          letter-spacing:0.18em; text-transform:uppercase; margin-bottom:18px;
          animation: lo-slideUp 0.5s 0.35s ease both; opacity:0;
        }
        .lo-bye-line {
          font-size:15px; font-weight:500; color:rgba(255,255,255,0.45);
          letter-spacing:0.06em; margin-bottom:8px;
          animation: lo-slideUp 0.5s 0.5s ease both; opacity:0;
        }
        .lo-name {
          font-size:44px; font-weight:800; color:#fff;
          letter-spacing:-0.02em; line-height:1.1;
          animation: lo-slideUp 0.6s 0.6s cubic-bezier(0.22,1,0.36,1) both; opacity:0;
        }
        .lo-name span { color:#e8c547; }
        .lo-sub {
          margin-top:14px; font-size:14px; color:rgba(255,255,255,0.4); font-weight:400;
          animation: lo-slideUp 0.5s 0.75s ease both; opacity:0;
        }
        .lo-divider {
          width:60px; height:2px; background:rgba(201,162,39,0.35);
          border-radius:2px; margin:22px auto;
          animation: lo-slideUp 0.4s 0.85s ease both; opacity:0;
        }
        .lo-info {
          font-size:12px; color:rgba(255,255,255,0.25); letter-spacing:0.06em;
          animation: lo-slideUp 0.4s 0.95s ease both; opacity:0;
        }

        /* Progress bar draining */
        .lo-bottom-bar {
          position:absolute; bottom:0; left:0; right:0; height:3px;
          background:rgba(201,162,39,0.2);
        }
        .lo-progress {
          position:absolute; bottom:0; left:0; height:3px;
          width:100%;
          background:linear-gradient(90deg,#c9a227,#f0d060);
          animation: lo-barShrink 2s 0.3s cubic-bezier(0.4,0,0.2,1) both;
        }
        .lo-signing-out {
          position:absolute; bottom:12px; left:50%; transform:translateX(-50%);
          font-size:10px; color:rgba(255,255,255,0.2); letter-spacing:0.12em;
          text-transform:uppercase; white-space:nowrap;
          animation: lo-fadeIn 0.5s 1s ease both; opacity:0;
        }
      `}</style>

      <div className="lo-root">
        <div className="lo-grid" />
        <div className="lo-gold-bar" />

        {/* Rotating rings */}
        {[[360, 28], [240, 18], [140, 13]].map(([size, dur], i) => (
          <div key={i} className="lo-ring" style={{ width: size, height: size, animationDuration: `${dur}s`, animationDirection: i % 2 ? 'reverse' : 'normal' }} />
        ))}

        {/* Floating particles */}
        {WELCOME_PARTICLES.map(([left, size, delay, dur], i) => (
          <div key={i} className="lo-particle" style={{ left: `${left}%`, width: size, height: size, animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
        ))}

        <div className="lo-content">
          {/* Goodbye icon */}
          <div className="lo-icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="#e8c547" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>

          <div className="lo-company">BCIM Engineering · ConstructERP</div>
          <div className="lo-bye-line">Goodbye,</div>
          <div className="lo-name"><span>{firstName}!</span></div>
          <div className="lo-sub">Thanks for using BCIM ERP today.</div>
          <div className="lo-divider" />
          <div className="lo-info">Your session has been securely closed.</div>
        </div>

        <div className="lo-bottom-bar" />
        <div className="lo-progress" />
        <div className="lo-signing-out">Signing out securely…</div>
      </div>
    </>
  );
}

// ── Current-project chip (header) ────────────────────────────────────────────
function ProjectChip() {
  const navigate = useNavigate();
  const { selectedProjectName, selectedProjectCode, selectedProjectId, user } = useAuthStore();
  const GLOBAL_ROLES = ['super_admin', 'admin', 'managing_director', 'director', 'ceo', 'cfo', 'md'];
  const isGlobal = GLOBAL_ROLES.includes(user?.role);

  if (!selectedProjectId && isGlobal) return null; // global users without picked project — hide chip
  return (
    <button
      onClick={() => navigate('/select-project')}
      title={selectedProjectName ? `Switch project (current: ${selectedProjectName})` : 'Select a project'}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 11px',
        borderRadius: 8,
        background: selectedProjectId ? 'rgba(255,255,255,0.10)' : 'rgba(239,68,68,0.18)',
        border: `1px solid ${selectedProjectId ? 'rgba(255,255,255,0.20)' : 'rgba(252,165,165,0.55)'}`,
        cursor: 'pointer',
        color: '#fff',
        maxWidth: 220,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = selectedProjectId ? 'rgba(255,255,255,0.10)' : 'rgba(239,68,68,0.18)'; }}
    >
      <Building2 size={13} style={{ flexShrink: 0, color: '#FBBF24' }} />
      <div style={{ overflow: 'hidden', textAlign: 'left' }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', lineHeight: 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Project
        </div>
        <div style={{
          fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 170,
        }}>
          {selectedProjectName || 'Select project'}
        </div>
      </div>
      <Replace size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
    </button>
  );
}

// ── Main Layout ──────────────────────────────────────────────────────────────
export default function Layout() {
  const [showWelcome,      setShowWelcome]      = useState(false);
  const [showLogout,       setShowLogout]       = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen,       setMobileOpen]       = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [langOpen,    setLangOpen]    = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [now,          setNow]         = useState(() => new Date());
  const notifCount = useNotificationCount();
  const recentPages = useRecentPages();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const isProcurementPage = location.pathname.startsWith('/procurement');
  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
  const { title: pageTitle, group: pageGroup } = usePageTitle();

  // Show welcome screen once per browser session on first load
  useEffect(() => {
    if (!sessionStorage.getItem('erp-welcomed')) {
      setShowWelcome(true);
    }
  }, []);

  // Register device for push notifications (Android only — no-op in browser)
  useEffect(() => {
    if (user?.id) {
      initPushNotifications(api).catch(() => {});
    }
  }, [user?.id]);

  // Ctrl+K → command palette
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const matchesPath = (itemTo) => {
    const p = itemTo.split('?')[0];
    if (location.pathname === p) return true;
    const segs = p.split('/').filter(Boolean);
    return segs.length >= 2 && location.pathname.startsWith(p + '/');
  };

  const filteredGroups = navGroups.filter(g => {
    if (['admin', 'super_admin'].includes(user?.role)) return true;
    // If no modules configured at all, show everything (fallback for unconfigured accounts)
    if (!user?.accessible_modules?.length) return true;
    const aliases = g.label === 'Bill Tracker' ? ['Bill Tracker', 'DQS Tracker'] : [g.label];
    return aliases.some(label => user?.accessible_modules?.includes(label));
  });

  const doLogout = useCallback(async () => {
    sessionStorage.removeItem('erp-welcomed');
    sessionStorage.removeItem('erp-recents');
    await logout();
    setShowLogout(false);
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleLogout = () => {
    setShowLogout(true);
  };

  const initials = (user?.name || 'U').split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
  const roleLabel = (user?.role || '').replace(/_/g, ' ');
  const clockTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const clockDate = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#F8F9FA' }} className="erp-layout-enter">

      {/* ── Top Navigation Bar ── */}
      <header
        className="print:hidden"
        style={{
          flexShrink: 0,
          background: 'linear-gradient(90deg, #111e3a 0%, #172554 35%, #1e3a8a 70%, #1d4ed8 100%)',
          height: 52,
          display: 'flex', alignItems: 'stretch',
          boxShadow: '0 1px 0 rgba(255,255,255,0.06), 0 4px 16px rgba(0,0,0,0.3)',
          position: 'relative', zIndex: 50,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Hamburger — desktop: toggles sidebar, mobile: opens slide-in */}
        <button
          className="lg-show"
          onClick={() => setSidebarCollapsed(c => !c)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ width: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)', border: 'none', borderRight: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', flexShrink: 0 }}
        >
          <Menu size={18} />
        </button>
        <button
          className="lg-hide"
          onClick={() => setMobileOpen(true)}
          style={{ width: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)', border: 'none', borderRight: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', flexShrink: 0 }}
        >
          <Menu size={18} />
        </button>

        {/* Logo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '0 14px',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.08)',
        }}>
          <div style={{ width: 28, height: 28, background: '#fff', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
            <img src="/bcim-logo.png" alt="BCIM" style={{ width: 24, height: 24, objectFit: 'contain' }} />
          </div>
          <div className="sm-show" style={{ display: 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2, letterSpacing: '0.02em' }}>BCIM ERP</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', lineHeight: 1, letterSpacing: '0.03em' }}>ConstructERP · v3.0</div>
          </div>
        </div>

        {/* Page title — always visible, flex spacer */}
        <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', padding: '0 14px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pageTitle}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.70)', lineHeight: 1.2 }}>{pageGroup || 'ERP Workspace'}</div>
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px', flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.1)' }}>

          {/* Search */}
          <button
            onClick={() => setPaletteOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.90)', cursor: 'pointer', fontSize: 12,
            }}
          >
            <Search size={13} />
            <span style={{ fontSize: 12 }}>Search</span>
            <kbd style={{ fontSize: 9, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', padding: '1px 5px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)' }}>⌘K</kbd>
          </button>

          {/* Language */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setLangOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 8, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => { if (!langOpen) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 14 }}>{currentLang.flag}</span>
              <ChevronDown size={10} style={{ opacity: 0.6 }} />
            </button>
            {langOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setLangOpen(false)} />
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid #E8EAED', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, padding: '4px 0', minWidth: 160 }}>
                  {LANGUAGES.map(lang => (
                    <button key={lang.code} onClick={() => { setLanguage(lang.code); setLangOpen(false); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: language === lang.code ? '#EFF6FF' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: 16 }}>{lang.flag}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: language === lang.code ? '#2563EB' : '#374151' }}>{lang.native}</div>
                        <div style={{ fontSize: 10, color: '#64748B' }}>{lang.label}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Current Project chip — switches project for the session */}
          <ProjectChip />

          {/* Notifications */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setNotifOpen(o => !o)}
              style={{ position: 'relative', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.90)', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => { if (!notifOpen) e.currentTarget.style.background = 'transparent'; }}
            >
              <Bell size={16} />
              {notifCount > 0 && (
                <span style={{ position: 'absolute', top: 5, right: 5, minWidth: 14, height: 14, borderRadius: '50%', background: '#EF4444', border: '1.5px solid #1E3A8A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>
                  {notifCount > 99 ? '99+' : notifCount}
                </span>
              )}
            </button>
            {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
          </div>

          {/* Profile + Logout */}
          <NavLink to="/profile"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 8, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.18)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ display: 'none' }} className="sm-show">
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{user?.name?.split(' ')[0] || 'User'}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.80)', lineHeight: 1, textTransform: 'capitalize' }}>{roleLabel}</div>
            </div>
          </NavLink>

          <button
            onClick={handleLogout}
            title="Logout"
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.80)', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#FCA5A5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.80)'; }}
          >
            <LogOut size={15} />
          </button>

        </div>
      </header>

      {/* ── Breadcrumb sub-bar ── */}
      {pageGroup && (
        <div
          className="print:hidden"
          style={{
            flexShrink: 0, height: 28,
            background: '#F8FAFC',
            borderBottom: '1px solid #E8EAED',
            display: 'flex', alignItems: 'center', gap: 5, padding: '0 16px',
            fontSize: 11.5,
          }}
        >
          {(() => {
            const grp = filteredGroups.find(g => g.label === pageGroup);
            const firstTo = grp?.items[0]?.to;
            return firstTo ? (
              <button onClick={() => navigate(firstTo)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#64748B', fontWeight: 500, fontSize: 'inherit', lineHeight: 'inherit', borderRadius: 4, transition: 'color 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
                onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
              >{pageGroup}</button>
            ) : (
              <span style={{ color: '#64748B', fontWeight: 500 }}>{pageGroup}</span>
            );
          })()}
          <ChevronRight size={11} style={{ color: '#94A3B8' }} />
          <span style={{ color: '#1E293B', fontWeight: 600 }}>{pageTitle}</span>
          <div
            className="erp-clock-pill"
            title={now.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 22,
              padding: '0 9px',
              borderRadius: 6,
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#1E293B',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              whiteSpace: 'nowrap',
            }}
          >
            <Clock3 size={12} style={{ color: '#2563EB', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{clockTime}</span>
            <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{clockDate}</span>
          </div>
        </div>
      )}

      {/* ── Page content: sidebar + main ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Desktop sidebar — hidden on mobile via CSS */}
        <DesktopSidebar
          navGroups={filteredGroups}
          matchesPath={matchesPath}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          topOffset={pageGroup ? 80 : 52}
          recentPages={recentPages}
        />
        <main style={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative' }} className="print:overflow-visible print:h-auto">
          <Suspense fallback={<LoadingScreen />}>
            <div key={location.key} className={clsx('page-enter', isProcurementPage && 'procurement-strong-text')}>
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>

      {/* Mobile sidebar */}
      <MobileSidebar
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        navGroups={filteredGroups}
        user={user}
        matchesPath={matchesPath}
        recentPages={recentPages}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        navGroups={filteredGroups}
        recentPages={recentPages}
      />

      {/* ── Welcome Screen ── */}
      {showWelcome && (
        <WelcomeScreen
          user={user}
          onDone={() => {
            sessionStorage.setItem('erp-welcomed', '1');
            setShowWelcome(false);
          }}
        />
      )}

      {/* ── Logout Screen ── */}
      {showLogout && (
        <LogoutScreen user={user} onDone={doLogout} />
      )}

      <style>{`
        .nav-scroll::-webkit-scrollbar { height: 0px; }
        .nav-scroll { scrollbar-width: none; }
        @media (min-width: 1024px) { .lg-hide { display: none !important; } }
        @media (max-width: 1023px) { .lg-show { display: none !important; } }
        @media (min-width: 640px)  { .sm-show { display: block !important; } }
        @media (max-width: 1180px) { .erp-clock-pill { display: none !important; } }
        /* Desktop sidebar hidden on mobile — MobileSidebar used instead */
        @media (max-width: 1023px) { .desktop-sidebar { display: none !important; } }

        /* ── Layout entry (login → ERP) ── */
        @keyframes erp-layout-in {
          0%   { opacity: 0; transform: scale(0.985) translateY(10px); }
          100% { opacity: 1; transform: none; }
        }
        .erp-layout-enter {
          /* backwards = apply initial keyframe before delay only; final state reverts to
             element's own CSS (no transform) so position:fixed children work correctly */
          animation: erp-layout-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }

        /* ── Header slides down ── */
        @keyframes header-slide-down {
          0%   { opacity: 0; transform: translateY(-100%); }
          100% { opacity: 1; transform: none; }
        }
        header.print\\:hidden {
          animation: header-slide-down 0.4s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }

        /* ── Page content fades up on every route change ── */
        @keyframes page-fade-up {
          0%   { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: none; }
        }
        .page-enter {
          /* backwards fill-mode prevents a permanent transform stacking context that
             would trap position:fixed modals rendered inside page content */
          animation: page-fade-up 0.28s cubic-bezier(0.22, 1, 0.36, 1) backwards;
          min-height: 100%;
        }

        /* ── Global table scroll: every page table overflows horizontally ── */
        main table {
          min-width: max-content;
        }
        /* Scrollbar styling — thin, consistent across all pages */
        main::-webkit-scrollbar,
        main *::-webkit-scrollbar { width: 6px; height: 6px; }
        main::-webkit-scrollbar-track,
        main *::-webkit-scrollbar-track { background: transparent; }
        main::-webkit-scrollbar-thumb,
        main *::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        main::-webkit-scrollbar-thumb:hover,
        main *::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}</style>
    </div>
  );
}
