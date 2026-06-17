// src/App.js
import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';
import Layout from './components/layout/Layout';
import LoadingScreen from './components/common/LoadingScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import InstallBanner from './components/common/InstallBanner';
import { LanguageProvider } from './context/LanguageContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime:              1000 * 60 * 15,  // 15 min — serve cache, no background refetch
      gcTime:                 1000 * 60 * 60,  // 60 min — keep data in memory longer
      refetchOnWindowFocus:   false,           // no refetch when switching tabs
      refetchOnReconnect:     false,           // no refetch on network reconnect
      refetchOnMount:         false,           // use cache if available, don't refetch on remount
      networkMode:            'offlineFirst',  // serve cache immediately, fetch in background
    },
  },
});

// Only login is truly critical — everything else lazy-loads
import LoginPage    from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import SelectProjectPage from './pages/auth/SelectProjectPage';

const ApprovalsPage = lazy(() => import('./pages/approvals/ApprovalsPage'));
const Dashboard   = lazy(() => import('./pages/DashboardProfessional'));
const ProfilePage = lazy(() => import('./pages/auth/ProfilePage'));
const NotFound    = lazy(() => import('./pages/NotFound'));

// Lazy load less critical pages
const ProjectList         = lazy(() => import('./pages/projects/ProjectList'));
const ProjectDetail       = lazy(() => import('./pages/projects/ProjectDetail'));
const ProjectCreate       = lazy(() => import('./pages/projects/ProjectCreate'));
const QSDashboardPage     = lazy(() => import('./pages/qs/QSDashboardPage'));
const BOQPage             = lazy(() => import('./pages/qs/BOQPage'));
const BOQMappingPage      = lazy(() => import('./pages/qs/BOQMappingPage'));
const BOQDashboardPage    = lazy(() => import('./pages/qs/BOQDashboardPage'));
const MeasurementPage     = lazy(() => import('./pages/qs/MeasurementPage'));
const MeasurementBookPage = lazy(() =>
  import('./pages/qs/mb/MeasurementBook').then(m => ({ default: m.MeasurementBookPage }))
);
const RABillPage           = lazy(() => import('./pages/qs/RABillPage'));
const RABillNewPage        = lazy(() => import('./pages/qs/RABillNewPage'));
const RABillDetail         = lazy(() => import('./pages/qs/RABillDetail'));
const PriceEscalationPage  = lazy(() => import('./pages/qs/PriceEscalationPage'));
const VendorQSCertificationPage = lazy(() => import('./pages/qs/VendorQSCertificationPage'));
const VendorQSCertificationDetailPage = lazy(() => import('./pages/qs/VendorQSCertificationDetailPage'));
const RetentionReleasePage = lazy(() => import('./pages/qs/RetentionReleasePage'));
const MaterialReconPage   = lazy(() => import('./pages/qs/MaterialReconPage'));
const VariationPage       = lazy(() => import('./pages/qs/VariationPage'));
const ConsumptionNormsPage = lazy(() => import('./pages/qs/ConsumptionNormsPage'));
const GSTPage             = lazy(() => import('./pages/finance/GSTPage'));
const TDSPage             = lazy(() => import('./pages/finance/TDSPage'));
const BudgetPage          = lazy(() => import('./pages/finance/BudgetPage'));
const PaymentsPage        = lazy(() => import('./pages/finance/PaymentsPage'));
const PettyCashPage       = lazy(() => import('./pages/finance/PettyCashPage'));
const ClientAdvanceRequestsPage = lazy(() => import('./pages/finance/ClientAdvanceRequestsPage'));
const AccountsDashboard   = lazy(() => import('./pages/dashboards/AccountsDashboard'));
const ChartOfAccountsPage     = lazy(() => import('./pages/accounts/ChartOfAccountsPage'));
const JournalEntryPage        = lazy(() => import('./pages/accounts/JournalEntryPage'));
const BillAccountsPage        = lazy(() => import('./pages/accounts/BillAccountsPage'));
const AccountTransactionsPage = lazy(() => import('./pages/accounts/AccountTransactionsPage'));
const AccountingReportsPage   = lazy(() => import('./pages/accounts/AccountingReportsPage'));
const AccountSettingsPage     = lazy(() => import('./pages/accounts/AccountSettingsPage'));
const TaxSummaryPage          = lazy(() => import('./pages/accounts/TaxSummaryPage'));
const BankAccountsPage        = lazy(() => import('./pages/accounts/BankAccountsPage'));
const CustomersPage           = lazy(() => import('./pages/accounts/CustomersPage'));
const InvoicesPage            = lazy(() => import('./pages/accounts/InvoicesPage'));
const DebitNotesPage          = lazy(() => import('./pages/accounts/DebitNotesPage'));
const CustomerStatementsPage = lazy(() => import('./pages/finance/CustomerStatementsPage'));
const BankReconciliationPage = lazy(() => import('./pages/finance/BankReconciliationPage'));
const PaymentRunPage         = lazy(() => import('./pages/finance/PaymentRunPage'));
const ChequeTrackerPage      = lazy(() => import('./pages/finance/ChequeTrackerPage'));
const ControlDashboardPage   = lazy(() => import('./pages/finance/ControlDashboardPage'));
const ManagementMISPage      = lazy(() => import('./pages/finance/ManagementMISPage'));
const VendorList                = lazy(() => import('./pages/procurement/VendorList'));
const VendorProjectMappingPage  = lazy(() => import('./pages/procurement/VendorProjectMappingPage'));
const LiveRateCheckerPage = lazy(() => import('./pages/procurement/LiveRateCheckerPage'));
const POAmendmentLogPage  = lazy(() => import('./pages/procurement/POAmendmentLogPage'));
const VendorPerformancePage = lazy(() => import('./pages/procurement/VendorPerformancePage'));
const RateContractPage    = lazy(() => import('./pages/procurement/RateContractPage'));
const VendorPaymentsPage  = lazy(() => import('./pages/procurement/VendorPaymentsPage'));
const POPage              = lazy(() => import('./pages/procurement/POPage'));
const GRNPage             = lazy(() => import('./pages/stores/GRNPage'));
const GRSPage             = lazy(() => import('./pages/stores/GRSPage'));
const IGNPage             = lazy(() => import('./pages/stores/IGNPage'));
const GatePassPage        = lazy(() => import('./pages/stores/GatePassPage'));
const InventoryPage       = lazy(() => import('./pages/procurement/InventoryPage'));
const QuotationPage       = lazy(() => import('./pages/procurement/QuotationPage'));
const RFQPage             = lazy(() => import('./pages/procurement/RFQPage'));
const QuotationEntryPage  = lazy(() => import('./pages/procurement/QuotationEntryPage'));
const ComparativeStatementPage = lazy(() => import('./pages/procurement/ComparativeStatementPage'));
const VendorRFQPortalPage = lazy(() => import('./pages/procurement/VendorRFQPortalPage'));
const WorkOrderPage         = lazy(() => import('./pages/procurement/WorkOrderPage'));
const POBulkImportPage      = lazy(() => import('./pages/procurement/POBulkImportPage'));
const PORegisterPage        = lazy(() => import('./pages/procurement/PORegisterPage'));
const WORegisterPage        = lazy(() => import('./pages/procurement/WORegisterPage'));
const WOBulkImportPage      = lazy(() => import('./pages/procurement/WOBulkImportPage'));
const ProcurementReportsPage = lazy(() => import('./pages/procurement/ProcurementReportsPage'));
const ProcurementAlertsPage  = lazy(() => import('./pages/procurement/ProcurementAlertsPage'));
const ProcurementDashboardPage = lazy(() => import('./pages/dashboards/ProcurementDashboard'));
const TenderListPage         = lazy(() => import('./pages/procurement/TenderListPage'));
const TenderDetailPage       = lazy(() => import('./pages/procurement/TenderDetailPage'));
const TenderBidEntryPage     = lazy(() => import('./pages/procurement/TenderBidEntryPage'));
const BidOpportunityPage       = lazy(() => import('./pages/procurement/BidOpportunityPage'));
const BidOpportunityDetailPage = lazy(() => import('./pages/procurement/BidOpportunityDetailPage'));
const TenderRegisterPage          = lazy(() => import('./pages/tender-mgmt/TenderRegisterPage'));
const TenderManagementPage        = lazy(() => import('./pages/tender-mgmt/TenderManagementPage'));
const DMSPage                     = lazy(() => import('./pages/documents/DMSPage'));
const GFCMasterLogPage            = lazy(() => import('./pages/documents/GFCMasterLogPage'));
const TenderMgmtDetailPage        = lazy(() => import('./pages/tender-mgmt/TenderDetailPage'));
const TenderIssuancePage          = lazy(() => import('./pages/tender-mgmt/TenderIssuancePage'));
const TenderIssuanceDetailPage    = lazy(() => import('./pages/tender-mgmt/TenderIssuanceDetailPage'));
const WorkerList          = lazy(() => import('./pages/hr/WorkerList'));
const AttendancePage      = lazy(() => import('./pages/hr/AttendancePage'));
const PayrollPage         = lazy(() => import('./pages/hr/PayrollPage'));
const DPRPage             = lazy(() => import('./pages/site/DPRPage'));
const DPRCreate           = lazy(() => import('./pages/site/DPRCreate'));
const HSEDashboard        = lazy(() => import('./pages/hse/HSEDashboard'));
const IncidentPage        = lazy(() => import('./pages/hse/IncidentPage'));
const PermitPage          = lazy(() => import('./pages/hse/PermitPage'));
const PPEPage             = lazy(() => import('./pages/hse/PPEPage'));
const QAQCDashboard       = lazy(() => import('./pages/quality/QAQCDashboard'));
const RFIPage             = lazy(() => import('./pages/quality/RFIPage'));
const NCRPage             = lazy(() => import('./pages/quality/NCRPage'));
const LabTestPage         = lazy(() => import('./pages/quality/LabTestPage'));
const DocumentControlPage = lazy(() => import('./pages/quality/DocumentControlPage'));
const ChecklistTemplatePage = lazy(() => import('./pages/quality/ChecklistTemplatePage'));
const SnagListPage          = lazy(() => import('./pages/quality/SnagListPage'));
const ITPPage               = lazy(() => import('./pages/quality/ITPPage'));
const QAQCDocumentLibraryPage = lazy(() => import('./pages/quality/QAQCDocumentLibraryPage'));
const MethodStatementPage   = lazy(() => import('./pages/quality/MethodStatementPage'));
const MIRPage               = lazy(() => import('./pages/quality/MIRPage'));
const MTCPage               = lazy(() => import('./pages/quality/MTCPage'));
const PourCardPage          = lazy(() => import('./pages/quality/PourCardPage'));
const AuditPage             = lazy(() => import('./pages/quality/AuditPage'));
const AssetPage             = lazy(() => import('./pages/assets/AssetPage'));
const AssetDashboard        = lazy(() => import('./pages/assets/AssetDashboard'));
const AssetCategoriesPage   = lazy(() => import('./pages/assets/AssetCategoriesPage'));
const AssetAllocationPage   = lazy(() => import('./pages/assets/AssetAllocationPage'));
const AssetWorkOrdersPage   = lazy(() => import('./pages/assets/AssetWorkOrdersPage'));
const AssetDisposalPage     = lazy(() => import('./pages/assets/AssetDisposalPage'));
const AssetDocumentsPage    = lazy(() => import('./pages/assets/AssetDocumentsPage'));
const AssetTrackingPage         = lazy(() => import('./pages/assets/AssetTrackingPage'));
const MaintenanceManagementPage = lazy(() => import('./pages/assets/MaintenanceManagementPage'));
const AssetDepreciationPage     = lazy(() => import('./pages/assets/AssetDepreciationPage'));
const AssetReportsDashboardPage = lazy(() => import('./pages/assets/AssetReportsDashboardPage'));
const AssetAlertsPage           = lazy(() => import('./pages/assets/AssetAlertsPage'));
const AssetRolesPage            = lazy(() => import('./pages/assets/AssetRolesPage'));
const AdminAssetPage        = lazy(() => import('./pages/assets/AdminAssetPage'));
const InventoryAssetPage    = lazy(() => import('./pages/assets/InventoryAssetPage'));
const AssetReportsPage      = lazy(() => import('./pages/assets/AssetReportsPage'));
const AssetOperationsPage   = lazy(() => import('./pages/assets/AssetOperationsPage'));
const PlanningDashboard     = lazy(() => import('./pages/planning/PlanningDashboard'));
const PlanningDPRPage       = lazy(() => import('./pages/planning/DPRPage'));
const EngineerDailyLogPage  = lazy(() => import('./pages/planning/EngineerDailyLogPage'));
const ActivitiesPage        = lazy(() => import('./pages/planning/ActivitiesPage'));
const MilestonePage         = lazy(() => import('./pages/planning/MilestonePage'));
const LookAheadPage         = lazy(() => import('./pages/planning/LookAheadPage'));
const ProgressDashboard     = lazy(() => import('./pages/planning/ProgressDashboard'));
const DelayAnalysisPage     = lazy(() => import('./pages/planning/DelayAnalysisPage'));
const PlanningReportsPage   = lazy(() => import('./pages/planning/PlanningReportsPage'));
const P6Dashboard           = lazy(() => import('./pages/planning/P6Dashboard'));
const WBSEditorPage         = lazy(() => import('./pages/planning/WBSEditorPage'));
const RiskRegisterPage      = lazy(() => import('./pages/planning/RiskRegisterPage'));
const MRPPage               = lazy(() => import('./pages/planning/MRPPage'));
const PlantDashboard      = lazy(() => import('./pages/plant/PlantDashboard'));
const PlantEquipment      = lazy(() => import('./pages/plant/PlantEquipment'));
const PlantMasters        = lazy(() => import('./pages/plant/PlantMasters'));
const PlantTransfers      = lazy(() => import('./pages/plant/PlantTransfers'));
const PlantHire           = lazy(() => import('./pages/plant/PlantHire'));
const PlantDeployment     = lazy(() => import('./pages/plant/PlantDeployment'));
const PlantFuel           = lazy(() => import('./pages/plant/PlantFuel'));
const PlantMaintenance    = lazy(() => import('./pages/plant/PlantMaintenance'));
const PlantOperators      = lazy(() => import('./pages/plant/PlantOperators'));
const PlantCompliance     = lazy(() => import('./pages/plant/PlantCompliance'));
const PlantCost           = lazy(() => import('./pages/plant/PlantCost'));
const PlantReports        = lazy(() => import('./pages/plant/PlantReports'));
const ITAssetPage         = lazy(() => import('./pages/it/ITAssetPage'));
const ITTicketPage        = lazy(() => import('./pages/it/ITTicketPage'));
const LicensePage         = lazy(() => import('./pages/it/LicensePage'));
const MRSPage                   = lazy(() => import('./pages/stores/MRSPage'));
const IssuePage                 = lazy(() => import('./pages/stores/IssuePage'));
const StoreLedgerPage           = lazy(() => import('./pages/stores/StoreLedgerPage'));
const MaterialTransferPage      = lazy(() => import('./pages/stores/MaterialTransferPage'));
const CreditNotePage            = lazy(() => import('./pages/stores/CreditNotePage'));
const StockVerificationPage     = lazy(() => import('./pages/stores/StockVerificationPage'));
const StoresDashboard           = lazy(() => import('./pages/dashboards/StoresDashboard'));
// StockReportPage merged into StoreLedgerPage as "Monthly Movement" tab
// GRNVerificationPage and GRNPrintPage merged into GRNPage
const VendorInvoicePage   = lazy(() => import('./pages/finance/VendorInvoicePage'));
const BillBookingPage     = lazy(() => import('./pages/finance/BillBookingPage'));
const ReportsPage         = lazy(() => import('./pages/reports/ReportsPage'));
const Project360Page      = lazy(() => import('./pages/reports/Project360Page'));
const BillsTrackerPage    = lazy(() => import('./pages/bills/BillsTrackerPage'));
const UsersPage           = lazy(() => import('./pages/users/UsersPage'));
const MRSVerificationPage = lazy(() => import('./pages/stores/MRSVerificationPage'));
const POVerificationPage = lazy(() => import('./pages/procurement/POVerificationPage'));
const GRNVerificationPage = lazy(() => import('./pages/stores/GRNVerificationPage'));
const MINVerificationPage = lazy(() => import('./pages/stores/MINVerificationPage'));
const SubcontractorPortalPage = lazy(() => import('./pages/subcontractor/PortalPage'));
// New SC Module — 12 separate pages
const SCDashboard        = lazy(() => import('./pages/sc/SCDashboard'));
const SCMaster           = lazy(() => import('./pages/sc/SCMaster'));
const SCWorkOrders       = lazy(() => import('./pages/sc/SCWorkOrders'));
const SCLabour           = lazy(() => import('./pages/sc/SCLabour'));
const SCProgress         = lazy(() => import('./pages/sc/SCProgress'));
const SCBillPreparation  = lazy(() => import('./pages/sc/SCBillPreparation'));
const SCBillApproval     = lazy(() => import('./pages/sc/SCBillApproval'));
const SCPayments         = lazy(() => import('./pages/sc/SCPayments'));
const SCDeductions       = lazy(() => import('./pages/sc/SCDeductions'));
const SCDocuments        = lazy(() => import('./pages/sc/SCDocuments'));
const SCReports          = lazy(() => import('./pages/sc/SCReports'));
const SCSettings         = lazy(() => import('./pages/sc/SCSettings'));
const QSReportsPage        = lazy(() => import('./pages/qs/ReportsPage'));
const BillingReportsPage    = lazy(() => import('./pages/billing/BillingReportsPage'));
const DocumentsPage             = lazy(() => import('./pages/documents/DocumentsPage'));
const FinanceIntelligencePage   = lazy(() => import('./pages/finance/FinanceIntelligencePage'));
const TQSDashboardPage      = lazy(() => import('./pages/tqs/TQSDashboardPage'));

const TQSBillsPage          = lazy(() => import('./pages/tqs/TQSBillsPage'));
const TQSBillNewPage        = lazy(() => import('./pages/tqs/TQSBillNewPage'));
const TQSBillDetailPage     = lazy(() => import('./pages/tqs/TQSBillDetailPage'));
const TQSPaymentCertPrint   = lazy(() => import('./pages/tqs/TQSPaymentCertPrint'));
const TQSMaterialTrackerPage    = lazy(() => import('./pages/tqs/TQSMaterialTrackerPage'));
const TQSConcreteTrackerPage    = lazy(() => import('./pages/tqs/TQSConcreteTrackerPage'));
const TQSReportsPage        = lazy(() => import('./pages/tqs/TQSReportsPage'));
const TQSAnalyticsPage      = lazy(() => import('./pages/tqs/TQSAnalyticsPage'));
const TQSTransmittalPage    = lazy(() => import('./pages/tqs/TQSTransmittalPage'));
const LiabilityRegisterPage    = lazy(() => import('./pages/tqs/LiabilityRegisterPage'));
const TQSAdvanceTrackerPage       = lazy(() => import('./pages/tqs/TQSAdvanceTrackerPage'));
const TQSAdvanceVoucherDetailPage = lazy(() => import('./pages/tqs/TQSAdvanceVoucherDetailPage'));
const TQSAdvanceVoucherPrint      = lazy(() => import('./pages/tqs/TQSAdvanceVoucherPrint'));
const TQSDeductionRegisterPage       = lazy(() => import('./pages/tqs/TQSDeductionRegisterPage'));
const TQSSubcontractorBillRegisterPage = lazy(() => import('./pages/tqs/TQSSubcontractorBillRegisterPage'));
const TQSCashFlowPage                = lazy(() => import('./pages/tqs/TQSCashFlowPage'));
const TQSCostReportPage              = lazy(() => import('./pages/tqs/TQSCostReportPage'));
const QSRABillPrint            = lazy(() => import('./pages/tqs/QSRABillPrint'));
const QAQCReportsPage       = lazy(() => import('./pages/quality/QAQCReportsPage'));
const ERPChatPage           = lazy(() => import('./pages/ERPChat'));
const AutomationIdeasPage   = lazy(() => import('./pages/automation/AutomationIdeasPage'));
const ApprovalEnginePage    = lazy(() => import('./pages/automation/ApprovalEnginePage'));
const HRDashboardPage       = lazy(() => import('./pages/hr-admin/HRDashboardPage'));
const HREmployeeListPage    = lazy(() => import('./pages/hr-admin/EmployeeListPage'));
const HREmployeeFormPage    = lazy(() => import('./pages/hr-admin/EmployeeFormPage'));
const HREmployeeDetailPage  = lazy(() => import('./pages/hr-admin/EmployeeDetailPage'));
const HRAttendancePage      = lazy(() => import('./pages/hr-admin/AttendancePage'));
const HRLeaveManagementPage = lazy(() => import('./pages/hr-admin/LeaveManagementPage'));
const HRPayrollPage         = lazy(() => import('./pages/hr-admin/PayrollPage'));
const HRPayslipPrintPage    = lazy(() => import('./pages/hr-admin/PayslipPrintPage'));
const HRSalaryStructurePage = lazy(() => import('./pages/hr-admin/SalaryStructurePage'));
const HREmployeeSalaryPage  = lazy(() => import('./pages/hr-admin/EmployeeSalaryPage'));
const HRDepartmentPage      = lazy(() => import('./pages/hr-admin/DepartmentPage'));
const HRLoanPage            = lazy(() => import('./pages/hr-admin/LoanPage'));
const HRExpenseClaimPage    = lazy(() => import('./pages/hr-admin/ExpenseClaimPage'));
const HRAppraisalPage       = lazy(() => import('./pages/hr-admin/AppraisalPage'));
const HRHolidayCalendarPage = lazy(() => import('./pages/hr-admin/HolidayCalendarPage'));
const HRESSLSyncPage        = lazy(() => import('./pages/hr-admin/ESSLSyncPage'));
const HRImportPage          = lazy(() => import('./pages/hr-admin/HRImportPage'));
const HRReportsPage         = lazy(() => import('./pages/hr-admin/HRReportsPage'));
const HRAdvancedPage        = lazy(() => import('./pages/hr-admin/HRAdvancedPage'));
const ESSPortalPage         = lazy(() => import('./pages/hr-admin/ESSPortalPage'));

// ── Home route resolver — sends each user to their first accessible page ──────
const MODULE_HOME = {
  'Overview':          '/dashboard',
  'Planning':          '/planning',
  'Procurement':       '/procurement/vendors',
  'Tender Management': '/tender-management',
  'Stores':            '/stores',
  'QS & Billing':      '/qs',
  'Finance':           '/accounts',
  'Bill Tracker':      '/tqs',
  'DQS Tracker':       '/tqs',
  'Quality (QA/QC)':   '/quality',
  'HSE & Safety':      '/hse',
  'Assets & IT':       '/assets/dashboard',
  'Documents':         '/documents',  // legacy fallback
  'Administration':    '/users',
  'Automation Ideas':   '/automation-ideas',
  'Approval Engine':    '/approval-engine',
  'Reports':           '/reports',
  'HR & Admin':        '/hr-admin',
};

// Roles that land on the Approvals page first (they primarily approve work)
const APPROVER_ROLES = [
  'site_engineer', 'qs_engineer', 'project_manager',
  'accounts', 'management', 'finance_head', 'procurement_manager',
  'md', 'ceo', 'cfo', 'director', 'managing_director',
];

// Roles considered "admin/manager" — get module-based home, not ESS
const ADMIN_ROLES = [
  'admin', 'super_admin', 'hr_admin', 'hr_manager',
  'site_engineer', 'qs_engineer', 'project_manager',
  'accounts', 'management', 'finance_head', 'procurement_manager',
  'md', 'ceo', 'cfo', 'director', 'managing_director',
];

function getHomeRoute(user) {
  if (!user) return '/login';
  const role = String(user.role || '').toLowerCase();
  // Super admin & admin → full dashboard
  if (['admin', 'super_admin'].includes(role)) return '/dashboard';
  // Approver / manager roles → My Approvals page as home
  if (APPROVER_ROLES.includes(role)) return '/approvals';
  const mods = user.accessible_modules;
  // Staff with no admin modules → ESS Portal (like GreytHR)
  if (!mods || mods.length === 0) return '/ess';
  const hasAdminModule = mods.some(m => MODULE_HOME[m]);
  if (!hasAdminModule) return '/ess';
  for (const mod of mods) {
    if (MODULE_HOME[mod]) return MODULE_HOME[mod];
  }
  return '/ess';
}

// Global roles bypass project selection (they see all projects company-wide)
const GLOBAL_ROLES = ['super_admin', 'admin', 'managing_director', 'director', 'ceo', 'cfo', 'md'];

// Route guard — blocks access until token is verified with backend.
// Also enforces a project selection for scoped users (anyone not in GLOBAL_ROLES).
const ProtectedRoute = ({ children, allowWithoutProject = false }) => {
  const { user, isInitialized, selectedProjectId } = useAuthStore();
  if (!isInitialized) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowWithoutProject && !GLOBAL_ROLES.includes(user.role) && !selectedProjectId) {
    return <Navigate to="/select-project" replace />;
  }
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, isInitialized, selectedProjectId } = useAuthStore();
  if (!isInitialized) return <LoadingScreen />;
  if (user) {
    // Non-global users must pick a project before entering the app
    if (!GLOBAL_ROLES.includes(user.role) && !selectedProjectId) {
      return <Navigate to="/select-project" replace />;
    }
    return <Navigate to={getHomeRoute(user)} replace />;
  }
  return children;
};

// Smart home redirect for the index route (already authenticated)
function HomeRedirect() {
  const { user, selectedProjectId } = useAuthStore();
  if (user && !GLOBAL_ROLES.includes(user.role) && !selectedProjectId) {
    return <Navigate to="/select-project" replace />;
  }
  return <Navigate to={getHomeRoute(user)} replace />;
}

// Module-level route guard — redirects to home if user lacks the required module
function RequireModule({ module, children }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (['admin', 'super_admin'].includes(user.role)) return children;
  const mods = user.accessible_modules;
  if (!mods || mods.length === 0) return children; // unconfigured account → full access
  const legacyAliases = [
    ...(module === 'Reports' ? ['CRM & Reports'] : []),
    ...(module === 'Bill Tracker' ? ['DQS Tracker'] : []),
    ...(module === 'DQS Tracker' ? ['Bill Tracker'] : []),
  ];
  if (mods.includes(module) || legacyAliases.some(alias => mods.includes(alias))) return children;
  return <Navigate to={getHomeRoute(user)} replace />;
}

function RequireAnyModule({ modules, children }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (['admin', 'super_admin'].includes(user.role)) return children;
  const mods = user.accessible_modules;
  if (!mods || mods.length === 0) return children;
  const expandedModules = modules.flatMap(module => {
    if (module === 'Bill Tracker') return ['Bill Tracker', 'DQS Tracker'];
    if (module === 'DQS Tracker') return ['DQS Tracker', 'Bill Tracker'];
    return [module];
  });
  if (expandedModules.some(module => mods.includes(module))) return children;
  return <Navigate to={getHomeRoute(user)} replace />;
}

// Initializer — runs once on mount, verifies stored token against backend
function AuthInitializer({ children }) {
  const { user, initialize, logout } = useAuthStore();
  const navigate = useNavigate();
  const IDLE_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours idle timeout
  const SESSION_MAX_MS = 8 * 60 * 60 * 1000; // 8 hours absolute

  useEffect(() => {
    const isPublicVendorPortal = window.location.pathname.startsWith('/vendor-rfq/');
    const handleAuthLogout = (event) => {
      queryClient.cancelQueries();
      queryClient.clear();
      if (!isPublicVendorPortal && !window.location.pathname.startsWith('/login')) {
        const reason = event?.detail?.reason || 'session_expired';
        navigate(`/login?reason=${reason}`, { replace: true });
      }
    };
    window.addEventListener('auth:logout', handleAuthLogout);

    // Check absolute session age before anything else
    const { loginAt } = useAuthStore.getState();
    if (!isPublicVendorPortal && loginAt && Date.now() - loginAt > SESSION_MAX_MS) {
      logout();
      navigate('/login?reason=session_expired', { replace: true });
      return;
    }

    initialize();

    // Idle Timeout Logic
    let idleTimer;
    const resetTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (useAuthStore.getState().user) {
          logout();
          navigate('/login?reason=session_expired', { replace: true });
        }
      }, IDLE_TIMEOUT);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(name => document.addEventListener(name, resetTimer));
    resetTimer();

    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
      if (idleTimer) clearTimeout(idleTimer);
      events.forEach(name => document.removeEventListener(name, resetTimer));
    };
  }, [initialize, logout, navigate]);

  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
    <LanguageProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
              <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
              <Route path="/select-project" element={
                <ProtectedRoute allowWithoutProject={true}><SelectProjectPage /></ProtectedRoute>
              } />
              
              {/* Public Verification Links */}
              <Route path="/verify/mrs/:id" element={<MRSVerificationPage />} />
              <Route path="/verify/po/:id" element={<POVerificationPage />} />
              <Route path="/verify/grn/:id" element={<GRNVerificationPage />} />
              <Route path="/verify/min/:id" element={<MINVerificationPage />} />
              <Route path="/vendor-rfq/:token" element={<VendorRFQPortalPage />} />

              {/* Print pages — ProtectedRoute but NO Layout sidebar */}
              <Route path="/tqs/bills/:id/payment-cert"    element={<ProtectedRoute><TQSPaymentCertPrint /></ProtectedRoute>} />
              <Route path="/tqs/bills/:id/ra-abstract"      element={<ProtectedRoute><QSRABillPrint /></ProtectedRoute>} />

              {/* Private — All ERP module routes now under ProtectedRoute */}
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<HomeRedirect />} />
                <Route path="approvals" element={<ProtectedRoute allowWithoutProject><ApprovalsPage /></ProtectedRoute>} />
                <Route path="dashboard" element={<RequireModule module="Overview"><Dashboard /></RequireModule>} />

                {/* Projects */}
                <Route path="projects" element={<RequireModule module="Overview"><ProjectList /></RequireModule>} />
                <Route path="projects/new" element={<RequireModule module="Overview"><ProjectCreate /></RequireModule>} />
                <Route path="projects/:id" element={<RequireModule module="Overview"><ProjectDetail /></RequireModule>} />
                <Route path="projects/:id/edit" element={<RequireModule module="Overview"><ProjectCreate /></RequireModule>} />

                {/* QS & Billing */}
                <Route path="qs" element={<RequireModule module="QS & Billing"><QSDashboardPage /></RequireModule>} />
                <Route path="qs/boq"           element={<RequireModule module="QS & Billing"><BOQPage /></RequireModule>} />
                <Route path="qs/boq-mapping"   element={<RequireModule module="QS & Billing"><BOQMappingPage /></RequireModule>} />
                <Route path="qs/boq-dashboard" element={<RequireModule module="QS & Billing"><BOQDashboardPage /></RequireModule>} />
                <Route path="qs/measurements" element={<RequireModule module="QS & Billing"><MeasurementPage /></RequireModule>} />
                <Route path="qs/measurements/book" element={<RequireModule module="QS & Billing"><MeasurementBookPage /></RequireModule>} />
                <Route path="qs/ra-bills" element={<RequireModule module="QS & Billing"><RABillPage /></RequireModule>} />
                <Route path="qs/ra-bills/new" element={<RequireModule module="QS & Billing"><RABillNewPage /></RequireModule>} />
                <Route path="qs/ra-bills/:id" element={<RequireModule module="QS & Billing"><RABillDetail /></RequireModule>} />
                <Route path="qs/vendor-certifications" element={<RequireModule module="QS & Billing"><VendorQSCertificationPage /></RequireModule>} />
                <Route path="qs/vendor-certifications/:id" element={<RequireModule module="QS & Billing"><VendorQSCertificationDetailPage /></RequireModule>} />
                <Route path="qs/price-escalation" element={<RequireModule module="QS & Billing"><PriceEscalationPage /></RequireModule>} />
                <Route path="qs/retention-releases" element={<RequireModule module="QS & Billing"><RetentionReleasePage /></RequireModule>} />
                <Route path="qs/material-recon" element={<RequireModule module="QS & Billing"><MaterialReconPage /></RequireModule>} />
                <Route path="qs/variations" element={<RequireModule module="QS & Billing"><VariationPage /></RequireModule>} />
                <Route path="qs/norms" element={<RequireModule module="QS & Billing"><ConsumptionNormsPage /></RequireModule>} />
                <Route path="qs/reports" element={<RequireModule module="QS & Billing"><QSReportsPage /></RequireModule>} />

                {/* Accounts (Zoho Books style) */}
                <Route path="accounts" element={<RequireModule module="Finance"><AccountsDashboard /></RequireModule>} />
                {/* Banking */}
                <Route path="accounts/banking/accounts" element={<RequireModule module="Finance"><BankAccountsPage /></RequireModule>} />
                <Route path="accounts/banking/reconciliation" element={<RequireModule module="Finance"><BankReconciliationPage /></RequireModule>} />
                <Route path="accounts/banking/cash-flow" element={<RequireModule module="Finance"><FinanceIntelligencePage /></RequireModule>} />
                <Route path="accounts/banking/cheque-tracker" element={<RequireModule module="Finance"><ChequeTrackerPage /></RequireModule>} />
                <Route path="accounts/banking/petty-cash" element={<RequireModule module="Finance"><PettyCashPage /></RequireModule>} />
                {/* Sales / Receivables */}
                <Route path="accounts/sales/customers" element={<RequireModule module="Finance"><CustomersPage /></RequireModule>} />
                <Route path="accounts/sales/invoices" element={<RequireModule module="Finance"><InvoicesPage /></RequireModule>} />
                <Route path="accounts/sales/receipts" element={<RequireModule module="Finance"><ClientAdvanceRequestsPage /></RequireModule>} />
                <Route path="accounts/sales/proforma-invoices" element={<RequireModule module="Finance"><ClientAdvanceRequestsPage /></RequireModule>} />
                <Route path="accounts/sales/credit-notes" element={<RequireModule module="Finance"><CreditNotePage /></RequireModule>} />
                <Route path="accounts/sales/statements" element={<RequireModule module="Finance"><CustomerStatementsPage /></RequireModule>} />
                {/* Purchases / Payables */}
                <Route path="accounts/purchases/vendors" element={<Navigate to="/procurement/vendors" replace />} />
                <Route path="accounts/purchases/bills" element={<RequireModule module="Finance"><VendorInvoicePage /></RequireModule>} />
                <Route path="accounts/purchases/bills/booking" element={<RequireModule module="Finance"><BillBookingPage /></RequireModule>} />
                <Route path="accounts/purchases/payments-made" element={<RequireModule module="Finance"><PaymentsPage /></RequireModule>} />
                <Route path="accounts/purchases/payment-run" element={<RequireModule module="Finance"><PaymentRunPage /></RequireModule>} />
                <Route path="accounts/purchases/debit-notes" element={<RequireModule module="Finance"><DebitNotesPage /></RequireModule>} />
                {/* Accountant */}
                <Route path="accounts/accountant/chart-of-accounts" element={<RequireModule module="Finance"><ChartOfAccountsPage /></RequireModule>} />
                <Route path="accounts/accountant/journal-entries" element={<RequireModule module="Finance"><JournalEntryPage /></RequireModule>} />
                <Route path="accounts/accountant/bill-automation" element={<RequireModule module="Finance"><BillAccountsPage /></RequireModule>} />
                <Route path="accounts/accountant/transactions" element={<RequireModule module="Finance"><AccountTransactionsPage /></RequireModule>} />
                {/* Reports */}
                <Route path="accounts/reports/financial" element={<RequireModule module="Finance"><AccountingReportsPage /></RequireModule>} />
                <Route path="accounts/reports/billing" element={<RequireModule module="Finance"><BillingReportsPage /></RequireModule>} />
                <Route path="accounts/reports/management-mis" element={<RequireModule module="Finance"><ManagementMISPage /></RequireModule>} />
                <Route path="accounts/reports/control-dashboard" element={<RequireModule module="Finance"><ControlDashboardPage /></RequireModule>} />
                <Route path="accounts/reports/budget" element={<RequireModule module="Finance"><BudgetPage /></RequireModule>} />
                {/* Taxes */}
                <Route path="accounts/taxes/summary" element={<RequireModule module="Finance"><TaxSummaryPage /></RequireModule>} />
                <Route path="accounts/taxes/gst" element={<RequireModule module="Finance"><GSTPage /></RequireModule>} />
                <Route path="accounts/taxes/tds" element={<RequireModule module="Finance"><TDSPage /></RequireModule>} />
                {/* Settings */}
                <Route path="accounts/settings" element={<RequireModule module="Finance"><AccountSettingsPage /></RequireModule>} />

                {/* Legacy /finance/* redirects */}
                <Route path="finance" element={<Navigate to="/accounts" replace />} />
                <Route path="finance/accounts-dashboard" element={<Navigate to="/accounts" replace />} />
                <Route path="finance/customer-statements" element={<Navigate to="/accounts/sales/statements" replace />} />
                <Route path="finance/bank-reconciliation" element={<Navigate to="/accounts/banking/reconciliation" replace />} />
                <Route path="finance/payment-run" element={<Navigate to="/accounts/purchases/payment-run" replace />} />
                <Route path="finance/cheque-tracker" element={<Navigate to="/accounts/banking/cheque-tracker" replace />} />
                <Route path="finance/control-dashboard" element={<Navigate to="/accounts/reports/control-dashboard" replace />} />
                <Route path="finance/management-mis" element={<Navigate to="/accounts/reports/management-mis" replace />} />
                <Route path="finance/gst" element={<Navigate to="/accounts/taxes/gst" replace />} />
                <Route path="finance/tds" element={<Navigate to="/accounts/taxes/tds" replace />} />
                <Route path="finance/budget" element={<Navigate to="/accounts/reports/budget" replace />} />
                <Route path="finance/payments" element={<Navigate to="/accounts/purchases/payments-made" replace />} />
                <Route path="finance/petty-cash" element={<Navigate to="/accounts/banking/petty-cash" replace />} />
                <Route path="finance/client-advances" element={<Navigate to="/accounts/sales/receipts" replace />} />
                <Route path="finance/invoices" element={<Navigate to="/accounts/purchases/bills" replace />} />
                <Route path="finance/invoices/booking" element={<Navigate to="/accounts/purchases/bills/booking" replace />} />
                <Route path="finance/billing-reports" element={<Navigate to="/accounts/reports/billing" replace />} />
                <Route path="finance/intelligence" element={<Navigate to="/accounts/banking/cash-flow" replace />} />

                {/* Procurement */}
                <Route path="procurement/dashboard" element={<RequireModule module="Procurement"><ProcurementDashboardPage /></RequireModule>} />
                <Route path="procurement/vendors" element={<RequireAnyModule modules={['Procurement', 'Bill Tracker']}><VendorList /></RequireAnyModule>} />
                <Route path="procurement/vendor-mapping" element={<VendorProjectMappingPage />} />
                <Route path="procurement/live-rate-checker" element={<RequireModule module="Procurement"><LiveRateCheckerPage /></RequireModule>} />
                <Route path="procurement/po-amendments" element={<RequireModule module="Procurement"><POAmendmentLogPage /></RequireModule>} />
                <Route path="procurement/vendor-performance" element={<RequireModule module="Procurement"><VendorPerformancePage /></RequireModule>} />
                <Route path="procurement/rate-contracts" element={<RequireModule module="Procurement"><RateContractPage /></RequireModule>} />
                <Route path="procurement/vendor-payments" element={<RequireModule module="Procurement"><VendorPaymentsPage /></RequireModule>} />
                <Route path="procurement/material-request" element={<RequireModule module="Procurement"><MRSPage /></RequireModule>} />
                <Route path="procurement/rfqs" element={<RequireModule module="Procurement"><QuotationPage mode="rfq" /></RequireModule>} />
                <Route path="procurement/quotations" element={<RequireModule module="Procurement"><QuotationPage mode="quotes" /></RequireModule>} />
                <Route path="procurement/comparative-statements" element={<RequireModule module="Procurement"><QuotationPage mode="cs" /></RequireModule>} />
                <Route path="procurement/rfq/:id" element={<RequireModule module="Procurement"><RFQPage /></RequireModule>} />
                <Route path="procurement/quotations/entry/:id" element={<RequireModule module="Procurement"><QuotationEntryPage /></RequireModule>} />
                <Route path="procurement/quotations/comparison/:id" element={<RequireModule module="Procurement"><ComparativeStatementPage /></RequireModule>} />
                <Route path="procurement/po" element={<RequireModule module="Procurement"><POPage /></RequireModule>} />
                <Route path="procurement/po-register" element={<RequireModule module="Procurement"><PORegisterPage /></RequireModule>} />
                <Route path="procurement/po-bulk-import" element={<RequireModule module="Procurement"><POBulkImportPage /></RequireModule>} />
                <Route path="procurement/inventory" element={<RequireModule module="Procurement"><InventoryPage /></RequireModule>} />
                <Route path="procurement/work-orders" element={<RequireModule module="Procurement"><WorkOrderPage /></RequireModule>} />
                <Route path="procurement/wo-register" element={<RequireModule module="Procurement"><WORegisterPage /></RequireModule>} />
                <Route path="procurement/wo-bulk-import" element={<RequireModule module="Procurement"><WOBulkImportPage /></RequireModule>} />
                <Route path="procurement/reports" element={<RequireModule module="Procurement"><ProcurementReportsPage /></RequireModule>} />
                <Route path="procurement/alerts" element={<RequireModule module="Procurement"><ProcurementAlertsPage /></RequireModule>} />
                <Route path="procurement/tenders" element={<RequireModule module="Procurement"><TenderListPage /></RequireModule>} />
                <Route path="procurement/tenders/:id" element={<RequireModule module="Procurement"><TenderDetailPage /></RequireModule>} />
                <Route path="procurement/tenders/:id/bid-entry" element={<RequireModule module="Procurement"><TenderBidEntryPage /></RequireModule>} />
                <Route path="procurement/bid-opportunities" element={<RequireModule module="Procurement"><BidOpportunityPage /></RequireModule>} />
                <Route path="procurement/bid-opportunities/:id" element={<RequireModule module="Procurement"><BidOpportunityDetailPage /></RequireModule>} />
                <Route path="procurement/budget-control" element={<RequireAnyModule modules={['Procurement', 'Finance']}><BudgetPage /></RequireAnyModule>} />

                {/* Stores */}
                <Route path="stores" element={<RequireModule module="Stores"><StoresDashboard /></RequireModule>} />
                <Route path="stores/po" element={<RequireModule module="Stores"><POPage /></RequireModule>} />
                <Route path="stores/po-register" element={<RequireModule module="Stores"><PORegisterPage /></RequireModule>} />
                <Route path="stores/work-orders" element={<RequireModule module="Stores"><WorkOrderPage /></RequireModule>} />
                <Route path="stores/wo-register" element={<RequireModule module="Stores"><WORegisterPage /></RequireModule>} />
                <Route path="stores/grs" element={<RequireModule module="Stores"><GRSPage /></RequireModule>} />
                <Route path="stores/ign" element={<RequireModule module="Stores"><IGNPage /></RequireModule>} />
                <Route path="stores/grn" element={<RequireModule module="Stores"><GRNPage /></RequireModule>} />
                <Route path="stores/gate-pass" element={<RequireModule module="Stores"><GatePassPage /></RequireModule>} />

                {/* Tender Management */}
                <Route path="tender-management" element={<RequireModule module="Tender Management"><TenderManagementPage /></RequireModule>} />
                <Route path="tender-management/register" element={<RequireModule module="Tender Management"><TenderRegisterPage /></RequireModule>} />
                <Route path="tender-management/issue" element={<RequireModule module="Tender Management"><TenderIssuancePage /></RequireModule>} />
                <Route path="tender-management/issue/:id" element={<RequireModule module="Tender Management"><TenderIssuanceDetailPage /></RequireModule>} />
                <Route path="tender-management/:id" element={<RequireModule module="Tender Management"><TenderMgmtDetailPage /></RequireModule>} />

                {/* Public vendor portal retained; ERP Subcontractor module is removed from navigation. */}
                <Route path="subcontractor/portal" element={<SubcontractorPortalPage />} />
                {/* New Subcontractor Module — 12 separate pages */}
                <Route path="sc/dashboard"        element={<RequireModule module="Subcontractors"><SCDashboard /></RequireModule>} />
                <Route path="sc/master"           element={<RequireModule module="Subcontractors"><SCMaster /></RequireModule>} />
                <Route path="sc/work-orders"      element={<RequireModule module="Subcontractors"><SCWorkOrders /></RequireModule>} />
                <Route path="sc/labour"           element={<RequireModule module="Subcontractors"><SCLabour /></RequireModule>} />
                <Route path="sc/progress"         element={<RequireModule module="Subcontractors"><SCProgress /></RequireModule>} />
                <Route path="sc/bill-preparation" element={<RequireModule module="Subcontractors"><SCBillPreparation /></RequireModule>} />
                <Route path="sc/bill-approval"    element={<RequireModule module="Subcontractors"><SCBillApproval /></RequireModule>} />
                <Route path="sc/payments"         element={<RequireModule module="Subcontractors"><SCPayments /></RequireModule>} />
                <Route path="sc/deductions"       element={<RequireModule module="Subcontractors"><SCDeductions /></RequireModule>} />
                <Route path="sc/documents"        element={<RequireModule module="Subcontractors"><SCDocuments /></RequireModule>} />
                <Route path="sc/reports"          element={<RequireModule module="Subcontractors"><SCReports /></RequireModule>} />
                <Route path="sc/settings"         element={<RequireModule module="Subcontractors"><SCSettings /></RequireModule>} />
                <Route path="subcontractor/*" element={<Navigate to="/dashboard" replace />} />

                {/* HR */}
                <Route path="hr/workers" element={<WorkerList />} />
                <Route path="hr/attendance" element={<AttendancePage />} />
                <Route path="hr/payroll" element={<PayrollPage />} />
                <Route path="ess" element={<ESSPortalPage />} />

                {/* HR & Admin */}
                <Route path="hr-admin" element={<RequireModule module="HR & Admin"><HRDashboardPage /></RequireModule>} />
                <Route path="hr-admin/employees" element={<RequireModule module="HR & Admin"><HREmployeeListPage /></RequireModule>} />
                <Route path="hr-admin/employees/new" element={<RequireModule module="HR & Admin"><HREmployeeFormPage /></RequireModule>} />
                <Route path="hr-admin/employees/:id" element={<RequireModule module="HR & Admin"><HREmployeeDetailPage /></RequireModule>} />
                <Route path="hr-admin/employees/:id/edit" element={<RequireModule module="HR & Admin"><HREmployeeFormPage /></RequireModule>} />
                <Route path="hr-admin/attendance" element={<RequireModule module="HR & Admin"><HRAttendancePage /></RequireModule>} />
                <Route path="hr-admin/leaves" element={<RequireModule module="HR & Admin"><HRLeaveManagementPage /></RequireModule>} />
                <Route path="hr-admin/payroll" element={<RequireModule module="HR & Admin"><HRPayrollPage /></RequireModule>} />
                <Route path="hr-admin/payroll/:id/payslip" element={<RequireModule module="HR & Admin"><HRPayslipPrintPage /></RequireModule>} />
                <Route path="hr-admin/salary-structures" element={<RequireModule module="HR & Admin"><HRSalaryStructurePage /></RequireModule>} />
                <Route path="hr-admin/employee-salaries" element={<RequireModule module="HR & Admin"><HREmployeeSalaryPage /></RequireModule>} />
                <Route path="hr-admin/departments" element={<RequireModule module="HR & Admin"><HRDepartmentPage /></RequireModule>} />
                <Route path="hr-admin/loans" element={<RequireModule module="HR & Admin"><HRLoanPage /></RequireModule>} />
                <Route path="hr-admin/expenses" element={<RequireModule module="HR & Admin"><HRExpenseClaimPage /></RequireModule>} />
                <Route path="hr-admin/appraisals" element={<RequireModule module="HR & Admin"><HRAppraisalPage /></RequireModule>} />
                <Route path="hr-admin/holidays" element={<RequireModule module="HR & Admin"><HRHolidayCalendarPage /></RequireModule>} />
                <Route path="hr-admin/essl-sync" element={<RequireModule module="HR & Admin"><HRESSLSyncPage /></RequireModule>} />
                <Route path="hr-admin/import" element={<RequireModule module="HR & Admin"><HRImportPage /></RequireModule>} />
                <Route path="hr-admin/reports" element={<RequireModule module="HR & Admin"><HRReportsPage /></RequireModule>} />
                <Route path="hr-admin/advanced" element={<RequireModule module="HR & Admin"><HRAdvancedPage /></RequireModule>} />
                <Route path="hr-admin/documents" element={<RequireModule module="HR & Admin"><DocumentsPage /></RequireModule>} />

                {/* Site */}
                <Route path="site/dpr" element={<DPRPage />} />
                <Route path="site/dpr/new" element={<DPRCreate />} />

                {/* Planning */}
                <Route path="planning" element={<RequireModule module="Planning"><PlanningDashboard /></RequireModule>} />
                <Route path="planning/engineer-log" element={<RequireModule module="Planning"><EngineerDailyLogPage /></RequireModule>} />
                <Route path="planning/dpr" element={<RequireModule module="Planning"><PlanningDPRPage /></RequireModule>} />
                <Route path="planning/activities" element={<RequireModule module="Planning"><ActivitiesPage /></RequireModule>} />
                <Route path="planning/milestones" element={<RequireModule module="Planning"><MilestonePage /></RequireModule>} />
                <Route path="planning/look-ahead" element={<RequireModule module="Planning"><LookAheadPage /></RequireModule>} />
                <Route path="planning/progress" element={<RequireModule module="Planning"><ProgressDashboard /></RequireModule>} />
                <Route path="planning/delays"       element={<RequireModule module="Planning"><DelayAnalysisPage /></RequireModule>} />
                <Route path="planning/reports"      element={<RequireModule module="Planning"><PlanningReportsPage /></RequireModule>} />
                <Route path="planning/p6-dashboard" element={<RequireModule module="Planning"><P6Dashboard /></RequireModule>} />
                <Route path="planning/wbs"          element={<RequireModule module="Planning"><WBSEditorPage /></RequireModule>} />
                <Route path="planning/risks"        element={<RequireModule module="Planning"><RiskRegisterPage /></RequireModule>} />
                <Route path="planning/mrp"          element={<RequireModule module="Planning"><MRPPage /></RequireModule>} />

                {/* HSE */}
                <Route path="hse" element={<RequireModule module="HSE & Safety"><HSEDashboard /></RequireModule>} />
                <Route path="hse/incidents" element={<RequireModule module="HSE & Safety"><IncidentPage /></RequireModule>} />
                <Route path="hse/permits" element={<RequireModule module="HSE & Safety"><PermitPage /></RequireModule>} />
                <Route path="hse/ppe" element={<RequireModule module="HSE & Safety"><PPEPage /></RequireModule>} />

                {/* Assets & IT */}
                <Route path="assets"                element={<RequireModule module="Assets & IT"><AssetPage /></RequireModule>} />
                <Route path="assets/:assetId"       element={<RequireModule module="Assets & IT"><AssetPage /></RequireModule>} />
                <Route path="assets/dashboard"   element={<RequireModule module="Assets & IT"><AssetDashboard /></RequireModule>} />
                <Route path="assets/categories"  element={<RequireModule module="Assets & IT"><AssetCategoriesPage /></RequireModule>} />
                <Route path="assets/tracking"    element={<RequireModule module="Assets & IT"><AssetTrackingPage /></RequireModule>} />
                <Route path="assets/allocation"  element={<RequireModule module="Assets & IT"><AssetAllocationPage /></RequireModule>} />
                <Route path="assets/maintenance" element={<RequireModule module="Assets & IT"><MaintenanceManagementPage /></RequireModule>} />
                <Route path="assets/work-orders" element={<RequireModule module="Assets & IT"><AssetWorkOrdersPage /></RequireModule>} />
                <Route path="assets/disposal"    element={<RequireModule module="Assets & IT"><AssetDisposalPage /></RequireModule>} />
                <Route path="assets/asset-docs"  element={<RequireModule module="Assets & IT"><AssetDocumentsPage /></RequireModule>} />
                <Route path="assets/admin"       element={<RequireModule module="Assets & IT"><AdminAssetPage /></RequireModule>} />
                <Route path="assets/operations"  element={<RequireModule module="Assets & IT"><AssetOperationsPage /></RequireModule>} />
                <Route path="assets/inventory"   element={<RequireModule module="Assets & IT"><InventoryAssetPage /></RequireModule>} />
                <Route path="assets/depreciation" element={<RequireModule module="Assets & IT"><AssetDepreciationPage /></RequireModule>} />
                <Route path="assets/reports"     element={<RequireModule module="Assets & IT"><AssetReportsDashboardPage /></RequireModule>} />
                <Route path="assets/alerts"      element={<RequireModule module="Assets & IT"><AssetAlertsPage /></RequireModule>} />
                <Route path="assets/roles"       element={<RequireModule module="Assets & IT"><AssetRolesPage /></RequireModule>} />
                <Route path="plant"              element={<RequireModule module="Assets & IT"><PlantDashboard /></RequireModule>} />
                <Route path="plant/dashboard"    element={<RequireModule module="Assets & IT"><PlantDashboard /></RequireModule>} />
                <Route path="plant/equipment"    element={<RequireModule module="Assets & IT"><PlantEquipment /></RequireModule>} />
                <Route path="plant/masters"      element={<RequireModule module="Assets & IT"><PlantMasters /></RequireModule>} />
                <Route path="plant/transfers"    element={<RequireModule module="Assets & IT"><PlantTransfers /></RequireModule>} />
                <Route path="plant/hire"         element={<RequireModule module="Assets & IT"><PlantHire /></RequireModule>} />
                <Route path="plant/deployment"   element={<RequireModule module="Assets & IT"><PlantDeployment /></RequireModule>} />
                <Route path="plant/fuel"         element={<RequireModule module="Assets & IT"><PlantFuel /></RequireModule>} />
                <Route path="plant/maintenance"  element={<RequireModule module="Assets & IT"><PlantMaintenance /></RequireModule>} />
                <Route path="plant/operators"    element={<RequireModule module="Assets & IT"><PlantOperators /></RequireModule>} />
                <Route path="plant/compliance"   element={<RequireModule module="Assets & IT"><PlantCompliance /></RequireModule>} />
                <Route path="plant/cost"         element={<RequireModule module="Assets & IT"><PlantCost /></RequireModule>} />
                <Route path="plant/reports"      element={<RequireModule module="Assets & IT"><PlantReports /></RequireModule>} />
                <Route path="it/assets"          element={<RequireModule module="Assets & IT"><ITAssetPage /></RequireModule>} />
                <Route path="it/tickets" element={<RequireModule module="Assets & IT"><ITTicketPage /></RequireModule>} />
                <Route path="it/licenses" element={<RequireModule module="Assets & IT"><LicensePage /></RequireModule>} />

                {/* Stores (remaining) */}
                <Route path="stores/mrs"    element={<RequireModule module="Stores"><MRSPage /></RequireModule>} />
                <Route path="stores/issue"  element={<RequireModule module="Stores"><IssuePage /></RequireModule>} />
                <Route path="stores/ledger" element={<RequireModule module="Stores"><StoreLedgerPage /></RequireModule>} />
                <Route path="stores/mtr"           element={<RequireModule module="Stores"><MaterialTransferPage /></RequireModule>} />
                <Route path="stores/credit-notes" element={<RequireModule module="Stores"><CreditNotePage /></RequireModule>} />
                <Route path="stores/stock-verification" element={<RequireModule module="Stores"><StockVerificationPage /></RequireModule>} />

                {/* Quality (QA/QC) */}
                <Route path="quality"                    element={<RequireModule module="Quality (QA/QC)"><QAQCDashboard /></RequireModule>} />
                <Route path="quality/reports"            element={<RequireModule module="Quality (QA/QC)"><QAQCReportsPage /></RequireModule>} />
                <Route path="quality/itp"                element={<RequireModule module="Quality (QA/QC)"><ITPPage /></RequireModule>} />
                <Route path="quality/method-statements"  element={<RequireModule module="Quality (QA/QC)"><MethodStatementPage /></RequireModule>} />
                <Route path="quality/mir"                element={<RequireModule module="Quality (QA/QC)"><MIRPage /></RequireModule>} />
                <Route path="quality/mtc"                element={<RequireModule module="Quality (QA/QC)"><MTCPage /></RequireModule>} />
                <Route path="quality/pour-cards"         element={<RequireModule module="Quality (QA/QC)"><PourCardPage /></RequireModule>} />
                <Route path="quality/audits"             element={<RequireModule module="Quality (QA/QC)"><AuditPage /></RequireModule>} />
                <Route path="quality/rfi"                element={<RequireModule module="Quality (QA/QC)"><RFIPage /></RequireModule>} />
                <Route path="quality/ncr"       element={<RequireModule module="Quality (QA/QC)"><NCRPage /></RequireModule>} />
                <Route path="quality/lab-tests"          element={<RequireModule module="Quality (QA/QC)"><LabTestPage /></RequireModule>} />
                <Route path="quality/document-library"  element={<RequireModule module="Quality (QA/QC)"><QAQCDocumentLibraryPage /></RequireModule>} />
                <Route path="quality/documents" element={<RequireModule module="Quality (QA/QC)"><DocumentControlPage /></RequireModule>} />
                <Route path="quality/templates" element={<RequireModule module="Quality (QA/QC)"><ChecklistTemplatePage /></RequireModule>} />
                <Route path="quality/snags"     element={<RequireModule module="Quality (QA/QC)"><SnagListPage /></RequireModule>} />

                {/* Documents — shared repo (legacy / direct link) */}
                <Route path="documents"     element={<DocumentsPage />} />
                <Route path="dms"           element={<DMSPage />} />
                <Route path="dms/gfc-log"   element={<GFCMasterLogPage />} />

                {/* Department document repositories */}
                <Route path="planning/documents"              element={<RequireModule module="Planning"><DocumentsPage /></RequireModule>} />
                <Route path="procurement/documents"           element={<RequireModule module="Procurement"><DocumentsPage /></RequireModule>} />
                <Route path="stores/documents"                element={<RequireModule module="Stores"><DocumentsPage /></RequireModule>} />
                <Route path="qs/documents"                    element={<RequireModule module="QS & Billing"><DocumentsPage /></RequireModule>} />
                <Route path="finance/documents"               element={<Navigate to="/accounts/documents" replace />} />
                <Route path="accounts/documents"              element={<RequireModule module="Finance"><DocumentsPage /></RequireModule>} />
                <Route path="tqs/documents"                   element={<RequireModule module="Bill Tracker"><DocumentsPage /></RequireModule>} />
                <Route path="quality/doc-repository"          element={<RequireModule module="Quality (QA/QC)"><DocumentsPage /></RequireModule>} />
                <Route path="hse/documents"                   element={<RequireModule module="HSE & Safety"><DocumentsPage /></RequireModule>} />
                <Route path="assets/documents"                element={<RequireModule module="Assets & IT"><DocumentsPage /></RequireModule>} />
                <Route path="tender-management/documents"     element={<RequireModule module="Tender Management"><DocumentsPage /></RequireModule>} />

                {/* Bill Tracker */}
                <Route path="tqs"                      element={<RequireModule module="Bill Tracker"><TQSDashboardPage /></RequireModule>} />
                <Route path="bills/tracker"            element={<RequireModule module="Bill Tracker"><BillsTrackerPage /></RequireModule>} />
                <Route path="tqs/bills"                element={<RequireModule module="Bill Tracker"><TQSBillsPage /></RequireModule>} />
                <Route path="tqs/bills/new"            element={<Navigate to="/tqs/bills" replace />} />
                <Route path="tqs/bills/:id"            element={<RequireModule module="Bill Tracker"><TQSBillDetailPage /></RequireModule>} />
                <Route path="tqs/material-tracker"     element={<RequireModule module="Bill Tracker"><TQSMaterialTrackerPage /></RequireModule>} />
                <Route path="tqs/concrete-tracker"    element={<RequireModule module="Bill Tracker"><TQSConcreteTrackerPage /></RequireModule>} />
                <Route path="tqs/reports"              element={<RequireModule module="Bill Tracker"><TQSReportsPage /></RequireModule>} />
                <Route path="tqs/analytics"            element={<RequireModule module="Bill Tracker"><TQSAnalyticsPage /></RequireModule>} />
                <Route path="tqs/vendors"              element={<RequireModule module="Bill Tracker"><Navigate to="/procurement/vendors" replace /></RequireModule>} />
                <Route path="tqs/transmittal"          element={<RequireModule module="Bill Tracker"><TQSTransmittalPage /></RequireModule>} />
                <Route path="tqs/liability-register"   element={<RequireModule module="Bill Tracker"><LiabilityRegisterPage /></RequireModule>} />
                <Route path="tqs/advance-tracker"      element={<RequireModule module="Bill Tracker"><TQSAdvanceTrackerPage /></RequireModule>} />
                <Route path="tqs/advances/:id"         element={<RequireModule module="Bill Tracker"><TQSAdvanceVoucherDetailPage /></RequireModule>} />
                <Route path="tqs/advances/:id/print"   element={<TQSAdvanceVoucherPrint />} />
                <Route path="tqs/deduction-register"   element={<RequireModule module="Bill Tracker"><TQSDeductionRegisterPage /></RequireModule>} />
                <Route path="tqs/wo-bill-register"     element={<RequireModule module="Bill Tracker"><TQSSubcontractorBillRegisterPage /></RequireModule>} />
                <Route path="tqs/cash-flow"            element={<RequireModule module="Bill Tracker"><TQSCashFlowPage /></RequireModule>} />
                <Route path="tqs/cost-report"          element={<RequireModule module="Bill Tracker"><TQSCostReportPage /></RequireModule>} />
                <Route path="tqs/vendor-certifications"     element={<RequireModule module="Bill Tracker"><VendorQSCertificationPage /></RequireModule>} />
                <Route path="tqs/vendor-certifications/:id" element={<RequireModule module="Bill Tracker"><VendorQSCertificationDetailPage /></RequireModule>} />

                {/* Reports */}
                <Route path="reports"     element={<RequireModule module="Reports"><ReportsPage /></RequireModule>} />
                <Route path="reports/360" element={<RequireModule module="Reports"><Project360Page /></RequireModule>} />

                {/* ERP Chat */}
                <Route path="chat" element={<ERPChatPage />} />

                {/* Administration */}
                <Route path="users" element={<RequireModule module="Administration"><UsersPage /></RequireModule>} />
                <Route path="automation-ideas" element={<RequireModule module="Automation Ideas"><AutomationIdeasPage /></RequireModule>} />
                <Route path="approval-engine" element={<RequireModule module="Approval Engine"><ApprovalEnginePage /></RequireModule>} />


                {/* Profile */}
                <Route path="profile" element={<ProfilePage />} />

                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </AuthInitializer>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#000' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
        <InstallBanner />
      </BrowserRouter>
    </QueryClientProvider>
    </LanguageProvider>
    </ErrorBoundary>
  );
}
