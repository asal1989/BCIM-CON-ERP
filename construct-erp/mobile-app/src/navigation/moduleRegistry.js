// Full menu registry mirroring the web app's sidebar (Layout.jsx).
// Each item has a `screen` name to navigate to. Items without a dedicated
// screen yet fall back to `Placeholder`, which shows a "coming soon" card
// and a link to open the same page on the web app.
export const MODULE_GROUPS = [
  {
    label: 'Overview',
    icon: 'view-dashboard-outline',
    items: [
      { label: 'My Approvals', screen: 'Approvals', icon: 'check-decagram-outline' },
      { label: 'Dashboard',    screen: 'Dashboard',  icon: 'view-dashboard-outline' },
      { label: 'Projects',     screen: 'Projects', icon: 'office-building-outline' },
    ],
  },
  {
    label: 'Planning',
    icon: 'chart-gantt',
    items: [
      { label: 'P&E Dashboard',        screen: 'ModuleDashboard', params: { title: 'P&E Dashboard' } },
      { label: 'Schedule & Activities',screen: 'Activities' },
      { label: 'Milestones',           screen: 'Milestones' },
      { label: 'Look-Ahead Plan',      screen: 'LookAhead' },
      { label: 'Engineer Daily Log',   screen: 'EngineerLog' },
      { label: 'Daily Progress (DPR)', screen: 'DPR' },
      { label: 'Planning Reports',     screen: 'ReportsHub' },
    ],
  },
  {
    label: 'Procurement',
    icon: 'cart-outline',
    items: [
      { label: 'Procurement Dashboard',  screen: 'ProcurementDashboard' },
      { label: 'Material Request (MRS)', screen: 'MaterialRequest' },
      { label: 'Vendors',                screen: 'Vendors' },
      { label: 'Purchase Orders',        screen: 'PurchaseOrders' },
      { label: 'Work Orders',            screen: 'WorkOrders' },
      { label: 'Vendor Payments',        screen: 'VendorPayments' },
      { label: 'Inventory',              screen: 'Stores' },
      { label: 'Budget Control',         screen: 'BudgetControl' },
      { label: 'Reports',                screen: 'ReportsHub' },
    ],
  },
  {
    label: 'Stores',
    icon: 'warehouse',
    items: [
      { label: 'Stores Dashboard',       screen: 'StoresDashboard' },
      { label: 'Goods Receipt (GRS)',    screen: 'GRS' },
      { label: 'Material Requisition',   screen: 'MaterialRequest' },
      { label: 'IGN (Inward Goods)',     screen: 'IGN' },
      { label: 'Gate Pass',              screen: 'GatePass' },
      { label: 'Material Tracker',       screen: 'MaterialTracker' },
      { label: 'Store Ledger',           screen: 'StoreLedger' },
      { label: 'Petty Cash Tracker',     screen: 'PettyCash' },
      { label: 'Reports',                screen: 'ReportsHub' },
    ],
  },
  {
    label: 'QS & Billing',
    icon: 'file-document-outline',
    items: [
      { label: 'QS Dashboard',          screen: 'ModuleDashboard', params: { title: 'QS Dashboard' } },
      { label: 'BOQ & Estimation',      screen: 'BOQ' },
      { label: 'Budget Breakdown',       screen: 'BOQBudgetBreakdown' },
      { label: 'Budget Control',         screen: 'BudgetControl' },
      { label: 'Measurement Book',      screen: 'MeasurementBook' },
      { label: 'RA Bills',              screen: 'RABills' },
      { label: 'Variation Orders',      screen: 'Variations' },
      { label: 'QS Reports',            screen: 'ReportsHub' },
    ],
  },
  {
    label: 'Accounts',
    icon: 'bank-outline',
    items: [
      { label: 'Accounts Dashboard',   screen: 'ModuleDashboard', params: { title: 'Accounts Dashboard' } },
      { label: 'Bank Accounts',       screen: 'BankAccounts' },
      { label: 'Invoices',            screen: 'Invoices' },
      { label: 'Bills',               screen: 'Bills' },
      { label: 'Chart of Accounts',   screen: 'ChartOfAccounts' },
      { label: 'Profit & Loss',       screen: 'ProfitLoss' },
      { label: 'GST',                 screen: 'GST' },
      { label: 'TDS',                 screen: 'TDS' },
    ],
  },
  {
    label: 'HR & Admin',
    icon: 'account-group-outline',
    items: [
      { label: 'HR Dashboard',        screen: 'ModuleDashboard', params: { title: 'HR Dashboard' } },
      { label: 'Employee Directory',  screen: 'EmployeeDirectory' },
      { label: 'Attendance',          screen: 'ESS' },
      { label: 'Leave Management',    screen: 'ESS' },
      { label: 'Payroll',             screen: 'Payroll' },
      { label: 'Performance',         screen: 'Performance' },
    ],
  },
  {
    label: 'Self Service',
    icon: 'account-circle-outline',
    items: [
      { label: 'ESS Portal',          screen: 'ESS' },
      { label: 'Assets',              screen: 'Assets' },
      { label: 'Documents',           screen: 'Documents' },
      { label: 'Profile',             screen: 'Profile' },
    ],
  },
  {
    label: 'Tender Management',
    icon: 'gavel',
    items: [
      { label: 'Tender Register',     screen: 'Tenders' },
      { label: 'Tender Issuance',     screen: 'Tenders' },
      { label: 'Bid Opportunities',   screen: 'Tenders' },
      { label: 'Documents',           screen: 'Documents' },
    ],
  },
  {
    label: 'Bill Tracker',
    icon: 'file-clock-outline',
    items: [
      { label: 'Bills',               screen: 'Bills' },
    ],
  },
  {
    label: 'Quality (QA/QC)',
    icon: 'shield-check-outline',
    items: [
      { label: 'Inspection Test Plans', screen: 'QualityITP' },
      { label: 'Method Statements',     screen: 'MethodStatements' },
      { label: 'Material Inspection',   screen: 'QualityMIR' },
      { label: 'Quality Audits',        screen: 'QualityAudits' },
    ],
  },
  {
    label: 'HSE & Safety',
    icon: 'hard-hat',
    items: [
      { label: 'Incidents',           screen: 'Incidents' },
      { label: 'Permits',             screen: 'Permits' },
      { label: 'PPE Tracker',         screen: 'PPE' },
    ],
  },
  {
    label: 'Assets & IT',
    icon: 'laptop',
    items: [
      { label: 'Assets',              screen: 'Assets' },
      { label: 'IT Assets',           screen: 'ITAssets' },
      { label: 'IT Tickets',          screen: 'ITTickets' },
    ],
  },
  {
    label: 'Plant & Machinery',
    icon: 'crane',
    items: [
      { label: 'Plant Register',      screen: 'Plant' },
    ],
  },
  {
    label: 'Hire & Rental',
    icon: 'truck-outline',
    items: [
      { label: 'Hire & Rental',       screen: 'HireRental' },
    ],
  },
  {
    label: 'DMS',
    icon: 'folder-multiple-outline',
    items: [
      { label: 'Documents',           screen: 'Documents' },
    ],
  },
  {
    label: 'Subcontractors',
    icon: 'account-hard-hat',
    items: [
      { label: 'Subcontractors',      screen: 'Subcontractors' },
    ],
  },
  {
    label: 'Administration',
    icon: 'cog-outline',
    items: [
      { label: 'Users',               screen: 'Users' },
      { label: 'Settings',            screen: 'Settings' },
    ],
  },
  {
    label: 'Reports',
    icon: 'chart-box-outline',
    items: [
      { label: 'Reports Hub',         screen: 'ReportsHub' },
    ],
  },
];

// Flat lookup, e.g. for search / deep-linking.
export const ALL_MODULE_ITEMS = MODULE_GROUPS.flatMap(g => g.items.map(i => ({ ...i, group: g.label })));
