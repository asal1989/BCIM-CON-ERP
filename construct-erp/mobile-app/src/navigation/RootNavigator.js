import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

import DashboardScreen from '../screens/DashboardScreen';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import MoreScreen from '../screens/MoreScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatThreadScreen from '../screens/ChatThreadScreen';
import StoresScreen from '../screens/StoresScreen';
import IGNScreen from '../screens/IGNScreen';
import GRSScreen from '../screens/GRSScreen';
import GRSDetailScreen from '../screens/GRSDetailScreen';
import MRSDetailScreen from '../screens/MRSDetailScreen';
import IGNDetailScreen from '../screens/IGNDetailScreen';
import PODetailScreen from '../screens/PODetailScreen';
import WorkOrderDetailScreen from '../screens/WorkOrderDetailScreen';
import RABillDetailScreen from '../screens/RABillDetailScreen';
import VariationDetailScreen from '../screens/VariationDetailScreen';
import InvoiceDetailScreen from '../screens/InvoiceDetailScreen';
import TenderDetailScreen from '../screens/TenderDetailScreen';
import BillDetailScreen from '../screens/BillDetailScreen';
import AssetDetailScreen from '../screens/AssetDetailScreen';
import VendorDetailScreen from '../screens/VendorDetailScreen';
import MaterialTrackerDetailScreen from '../screens/MaterialTrackerDetailScreen';
import CreateMaterialTrackerEntryScreen from '../screens/CreateMaterialTrackerEntryScreen';
import AddMaterialTrackerLoadScreen from '../screens/AddMaterialTrackerLoadScreen';
import MaterialTrackerScreen from '../screens/MaterialTrackerScreen';
import MaterialRequestScreen from '../screens/MaterialRequestScreen';
import VendorsScreen from '../screens/VendorsScreen';
import PurchaseOrdersScreen from '../screens/PurchaseOrdersScreen';
import WorkOrdersScreen from '../screens/WorkOrdersScreen';
import BOQScreen from '../screens/BOQScreen';
import BudgetControlScreen from '../screens/BudgetControlScreen';
import BOQBudgetBreakdownScreen from '../screens/BOQBudgetBreakdownScreen';
import RABillsScreen from '../screens/RABillsScreen';
import VariationsScreen from '../screens/VariationsScreen';
import InvoicesScreen from '../screens/InvoicesScreen';
import ChartOfAccountsScreen from '../screens/ChartOfAccountsScreen';
import GSTScreen from '../screens/GSTScreen';
import MilestonesScreen from '../screens/MilestonesScreen';
import ActivitiesScreen from '../screens/ActivitiesScreen';
import TendersScreen from '../screens/TendersScreen';
import IncidentsScreen from '../screens/IncidentsScreen';
import ITAssetsScreen from '../screens/ITAssetsScreen';
import PlantScreen from '../screens/PlantScreen';
import HireRentalScreen from '../screens/HireRentalScreen';
import SubcontractorsScreen from '../screens/SubcontractorsScreen';
import BankAccountsScreen from '../screens/BankAccountsScreen';
import TDSScreen from '../screens/TDSScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import VendorPaymentsScreen from '../screens/VendorPaymentsScreen';
import StoreLedgerScreen from '../screens/StoreLedgerScreen';
import PettyCashScreen from '../screens/PettyCashScreen';
import GatePassScreen from '../screens/GatePassScreen';
import PayrollScreen from '../screens/PayrollScreen';
import EmployeeDirectoryScreen from '../screens/EmployeeDirectoryScreen';
import QualityITPScreen from '../screens/QualityITPScreen';
import QualityMIRScreen from '../screens/QualityMIRScreen';
import QualityAuditsScreen from '../screens/QualityAuditsScreen';
import PermitsScreen from '../screens/PermitsScreen';
import PPEScreen from '../screens/PPEScreen';
import ITTicketsScreen from '../screens/ITTicketsScreen';
import LookAheadScreen from '../screens/LookAheadScreen';
import EngineerLogScreen from '../screens/EngineerLogScreen';
import MethodStatementsScreen from '../screens/MethodStatementsScreen';
import MeasurementBookScreen from '../screens/MeasurementBookScreen';
import PerformanceScreen from '../screens/PerformanceScreen';
import UsersScreen from '../screens/UsersScreen';
import ModuleDashboardScreen from '../screens/ModuleDashboardScreen';
import ProcurementDashboardScreen from '../screens/ProcurementDashboardScreen';
import StoresDashboardScreen from '../screens/StoresDashboardScreen';
import QSDashboardScreen from '../screens/QSDashboardScreen';
import HRDashboardScreen from '../screens/HRDashboardScreen';
import AccountsDashboardScreen from '../screens/AccountsDashboardScreen';
import PMDashboardScreen from '../screens/PMDashboardScreen';
import HSEDashboardScreen from '../screens/HSEDashboardScreen';
import ProfitLossScreen from '../screens/ProfitLossScreen';
import ReportsHubScreen from '../screens/ReportsHubScreen';
import SettingsScreen from '../screens/SettingsScreen';
import BillsScreen from '../screens/BillsScreen';
import AssetsScreen from '../screens/AssetsScreen';
import DocumentsScreen from '../screens/DocumentsScreen';
import DPRScreen from '../screens/DPRScreen';
import ESSScreen from '../screens/ESSScreen';
import ApplyLeaveScreen from '../screens/ApplyLeaveScreen';
import PayslipDetailScreen from '../screens/PayslipDetailScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import CreateMaterialRequestScreen from '../screens/CreateMaterialRequestScreen';
import CreateIGNScreen from '../screens/CreateIGNScreen';
import CreateDPRScreen from '../screens/CreateDPRScreen';
import AttendanceCorrectionScreen from '../screens/AttendanceCorrectionScreen';
import HRRequestsScreen from '../screens/HRRequestsScreen';
import HolidaysScreen from '../screens/HolidaysScreen';
import CurrentSalaryScreen from '../screens/CurrentSalaryScreen';
import ITDeclarationScreen from '../screens/ITDeclarationScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
  Home:      'view-dashboard-outline',
  Chat:      'chat-processing-outline',
  Approvals: 'check-decagram-outline',
  Stores:    'warehouse',
  Menu:      'view-grid-outline',
  Profile:   'account-circle-outline',
};

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: { borderTopColor: theme.colors.border, height: 58, paddingBottom: 6, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name={TAB_ICONS[route.name]} color={color} size={size ?? 22} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Chat" component={ChatListScreen} options={{ title: 'Chat' }} />
      <Tab.Screen name="Approvals" component={ApprovalsScreen} />
      <Tab.Screen name="Stores" component={StoresScreen} />
      <Tab.Screen name="Menu" component={MoreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// The bottom tabs cover the 5 most-used destinations; every other module
// (from moduleRegistry.js) is reachable via the "Menu" tab and pushed as a
// full-screen stack route here.
export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ headerShown: true }} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="IGN" component={IGNScreen} />
      <Stack.Screen name="GRS" component={GRSScreen} />
      <Stack.Screen name="GRSDetail" component={GRSDetailScreen} />
      <Stack.Screen name="MRSDetail" component={MRSDetailScreen} />
      <Stack.Screen name="IGNDetail" component={IGNDetailScreen} />
      <Stack.Screen name="PODetail" component={PODetailScreen} />
      <Stack.Screen name="WorkOrderDetail" component={WorkOrderDetailScreen} />
      <Stack.Screen name="RABillDetail" component={RABillDetailScreen} />
      <Stack.Screen name="VariationDetail" component={VariationDetailScreen} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
      <Stack.Screen name="TenderDetail" component={TenderDetailScreen} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} />
      <Stack.Screen name="AssetDetail" component={AssetDetailScreen} />
      <Stack.Screen name="VendorDetail" component={VendorDetailScreen} />
      <Stack.Screen name="MaterialTrackerDetail" component={MaterialTrackerDetailScreen} />
      <Stack.Screen name="CreateMaterialTrackerEntry" component={CreateMaterialTrackerEntryScreen} />
      <Stack.Screen name="AddMaterialTrackerLoad" component={AddMaterialTrackerLoadScreen} />
      <Stack.Screen name="MaterialTracker" component={MaterialTrackerScreen} />
      <Stack.Screen name="MaterialRequest" component={MaterialRequestScreen} />
      <Stack.Screen name="Vendors" component={VendorsScreen} />
      <Stack.Screen name="PurchaseOrders" component={PurchaseOrdersScreen} />
      <Stack.Screen name="WorkOrders" component={WorkOrdersScreen} />
      <Stack.Screen name="BOQ" component={BOQScreen} />
      <Stack.Screen name="BudgetControl" component={BudgetControlScreen} />
      <Stack.Screen name="BOQBudgetBreakdown" component={BOQBudgetBreakdownScreen} />
      <Stack.Screen name="RABills" component={RABillsScreen} />
      <Stack.Screen name="Variations" component={VariationsScreen} />
      <Stack.Screen name="Invoices" component={InvoicesScreen} />
      <Stack.Screen name="ChartOfAccounts" component={ChartOfAccountsScreen} />
      <Stack.Screen name="GST" component={GSTScreen} />
      <Stack.Screen name="Milestones" component={MilestonesScreen} />
      <Stack.Screen name="Activities" component={ActivitiesScreen} />
      <Stack.Screen name="Tenders" component={TendersScreen} />
      <Stack.Screen name="Incidents" component={IncidentsScreen} />
      <Stack.Screen name="ITAssets" component={ITAssetsScreen} />
      <Stack.Screen name="Plant" component={PlantScreen} />
      <Stack.Screen name="HireRental" component={HireRentalScreen} />
      <Stack.Screen name="Subcontractors" component={SubcontractorsScreen} />
      <Stack.Screen name="BankAccounts" component={BankAccountsScreen} />
      <Stack.Screen name="TDS" component={TDSScreen} />
      <Stack.Screen name="Projects" component={ProjectsScreen} />
      <Stack.Screen name="VendorPayments" component={VendorPaymentsScreen} />
      <Stack.Screen name="StoreLedger" component={StoreLedgerScreen} />
      <Stack.Screen name="PettyCash" component={PettyCashScreen} />
      <Stack.Screen name="GatePass" component={GatePassScreen} />
      <Stack.Screen name="Payroll" component={PayrollScreen} />
      <Stack.Screen name="EmployeeDirectory" component={EmployeeDirectoryScreen} />
      <Stack.Screen name="QualityITP" component={QualityITPScreen} />
      <Stack.Screen name="QualityMIR" component={QualityMIRScreen} />
      <Stack.Screen name="QualityAudits" component={QualityAuditsScreen} />
      <Stack.Screen name="Permits" component={PermitsScreen} />
      <Stack.Screen name="PPE" component={PPEScreen} />
      <Stack.Screen name="ITTickets" component={ITTicketsScreen} />
      <Stack.Screen name="LookAhead" component={LookAheadScreen} />
      <Stack.Screen name="EngineerLog" component={EngineerLogScreen} />
      <Stack.Screen name="MethodStatements" component={MethodStatementsScreen} />
      <Stack.Screen name="MeasurementBook" component={MeasurementBookScreen} />
      <Stack.Screen name="Performance" component={PerformanceScreen} />
      <Stack.Screen name="Users" component={UsersScreen} />
      <Stack.Screen name="ModuleDashboard" component={ModuleDashboardScreen} />
      <Stack.Screen name="ProcurementDashboard" component={ProcurementDashboardScreen} />
      <Stack.Screen name="StoresDashboard" component={StoresDashboardScreen} />
      <Stack.Screen name="QSDashboard" component={QSDashboardScreen} />
      <Stack.Screen name="HRDashboard" component={HRDashboardScreen} />
      <Stack.Screen name="AccountsDashboard" component={AccountsDashboardScreen} />
      <Stack.Screen name="PMDashboard" component={PMDashboardScreen} />
      <Stack.Screen name="HSEDashboard" component={HSEDashboardScreen} />
      <Stack.Screen name="ProfitLoss" component={ProfitLossScreen} />
      <Stack.Screen name="ReportsHub" component={ReportsHubScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Bills" component={BillsScreen} />
      <Stack.Screen name="Assets" component={AssetsScreen} />
      <Stack.Screen name="Documents" component={DocumentsScreen} />
      <Stack.Screen name="DPR" component={DPRScreen} />
      <Stack.Screen name="ESS" component={ESSScreen} />
      <Stack.Screen name="ApplyLeave" component={ApplyLeaveScreen} />
      <Stack.Screen name="PayslipDetail" component={PayslipDetailScreen} />
      <Stack.Screen name="Placeholder" component={PlaceholderScreen} />
      <Stack.Screen name="CreateMaterialRequest" component={CreateMaterialRequestScreen} />
      <Stack.Screen name="CreateIGN" component={CreateIGNScreen} />
      <Stack.Screen name="CreateDPR" component={CreateDPRScreen} />
      <Stack.Screen name="AttendanceCorrection" component={AttendanceCorrectionScreen} />
      <Stack.Screen name="HRRequests" component={HRRequestsScreen} />
      <Stack.Screen name="Holidays" component={HolidaysScreen} />
      <Stack.Screen name="CurrentSalary" component={CurrentSalaryScreen} />
      <Stack.Screen name="ITDeclaration" component={ITDeclarationScreen} />
    </Stack.Navigator>
  );
}
