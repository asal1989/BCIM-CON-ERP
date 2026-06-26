// src/pages/stores/StoresReportsPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Package, AlertTriangle, Clock, Skull, LayoutList,
  FileInput, FileOutput, ArrowLeftRight, RotateCcw, DoorOpen, XCircle,
  ShoppingCart, GitCompare, ClipboardList, Users, BarChart2, Truck,
  Scale, Layers, FileBarChart, Trash2, RefreshCcw, Tag,
  Calculator, Search, CalendarClock, Activity, Star, Warehouse,
  ArrowUpRight, CalendarDays, TrendingUp, BarChart3, Building2,
} from 'lucide-react';

// ─── Section / report definitions ────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'inventory',
    label: 'INVENTORY REPORTS',
    number: '1',
    accent: '#2563EB',
    lightBg: '#EFF6FF',
    badge: { bg: '#DBEAFE', text: '#1D4ED8' },
    reports: [
      {
        id: '1.1', title: 'Stock Ledger',
        desc: 'Item-wise receipts, issues, and closing balances for any date range.',
        icon: BookOpen, badge: 'Daily', link: '/stores/ledger',
      },
      {
        id: '1.2', title: 'Stock Statement',
        desc: 'Snapshot of all materials on hand — quantity, unit rate, and value.',
        icon: Package, badge: 'Snapshot', link: null,
      },
      {
        id: '1.3', title: 'Minimum Stock Alert',
        desc: 'Items below re-order level across stores and project sites.',
        icon: AlertTriangle, badge: 'Alert', link: null,
        badgeOverride: { bg: '#FEE2E2', text: '#B91C1C' },
      },
      {
        id: '1.4', title: 'Slow Moving & Non-Moving Stock',
        desc: 'Materials with no movement for a configurable number of days.',
        icon: Clock, badge: 'Review', link: null,
        badgeOverride: { bg: '#FEF9C3', text: '#854D0E' },
      },
      {
        id: '1.5', title: 'Dead Stock Report',
        desc: 'Items with zero movement for more than 90 days — candidate for write-off.',
        icon: Skull, badge: 'Review', link: null,
        badgeOverride: { bg: '#FEE2E2', text: '#991B1B' },
      },
      {
        id: '1.6', title: 'Item-wise Stock Summary',
        desc: 'Consolidated stock position per item across all stores and sites.',
        icon: LayoutList, badge: 'Summary', link: null,
      },
    ],
  },
  {
    id: 'movement',
    label: 'MATERIAL MOVEMENT REPORTS',
    number: '2',
    accent: '#059669',
    lightBg: '#F0FDF4',
    badge: { bg: '#D1FAE5', text: '#065F46' },
    reports: [
      {
        id: '2.1', title: 'Material Receipt Note (MRN) Register',
        desc: 'Chronological log of all inward material receipts with GRN references.',
        icon: FileInput, badge: 'Register', link: '/stores/reports/dmr',
      },
      {
        id: '2.2', title: 'Material Issue Slip (MIS) Register',
        desc: 'All material issues to site with requisition and cost-code mapping.',
        icon: FileOutput, badge: 'Register', link: null,
      },
      {
        id: '2.3', title: 'Inter-Store / Inter-Site Transfer',
        desc: 'Materials transferred between stores or project sites in a period.',
        icon: ArrowLeftRight, badge: 'Transfer', link: null,
      },
      {
        id: '2.4', title: 'Material Return Report',
        desc: 'Site-to-store material returns with quantity and condition details.',
        icon: RotateCcw, badge: 'Return', link: null,
      },
      {
        id: '2.5', title: 'Gate Pass Register',
        desc: 'Inward and outward gate passes — vehicles, materials, and timing.',
        icon: DoorOpen, badge: 'Register', link: null,
      },
      {
        id: '2.6', title: 'Rejection / Inspection Failure Report',
        desc: 'Materials rejected at QC inspection with reason and vendor details.',
        icon: XCircle, badge: 'QC', link: null,
        badgeOverride: { bg: '#FEE2E2', text: '#991B1B' },
      },
    ],
  },
  {
    id: 'procurement',
    label: 'PROCUREMENT & PURCHASE REPORTS',
    number: '3',
    accent: '#D97706',
    lightBg: '#FFFBEB',
    badge: { bg: '#FEF3C7', text: '#92400E' },
    reports: [
      {
        id: '3.1', title: 'Purchase Order Status Report',
        desc: 'Open, closed, and partially fulfilled POs with delivery tracking.',
        icon: ShoppingCart, badge: 'Status', link: null,
      },
      {
        id: '3.2', title: 'GRN vs Invoice Reconciliation',
        desc: 'Match goods received notes against supplier invoices for payment.',
        icon: GitCompare, badge: 'Reconcile', link: null,
      },
      {
        id: '3.3', title: 'Pending Material Requisition Report',
        desc: 'MRS/indents awaiting procurement action, sorted by urgency.',
        icon: ClipboardList, badge: 'Pending', link: null,
      },
      {
        id: '3.4', title: 'Vendor-wise Purchase Analysis',
        desc: 'Total purchase value, item count, and lead-time per vendor.',
        icon: Users, badge: 'Analysis', link: '/stores/reports/vendor-wise',
      },
      {
        id: '3.5', title: 'Rate Comparison Statement',
        desc: 'Quoted vs negotiated vs actual rates across vendors for key items.',
        icon: BarChart2, badge: 'Compare', link: null,
      },
      {
        id: '3.6', title: 'Pending Delivery Report (PO-wise)',
        desc: 'Overdue and upcoming deliveries against active purchase orders.',
        icon: Truck, badge: 'Pending', link: null,
        badgeOverride: { bg: '#FEE2E2', text: '#B91C1C' },
      },
    ],
  },
  {
    id: 'consumption',
    label: 'CONSUMPTION & PROJECT REPORTS',
    number: '4',
    accent: '#7C3AED',
    lightBg: '#F5F3FF',
    badge: { bg: '#EDE9FE', text: '#4C1D95' },
    reports: [
      {
        id: '4.1', title: 'Budgeted vs Actual Material Consumption',
        desc: 'Compare planned material quantities against what was actually issued.',
        icon: Scale, badge: 'Budget', link: null,
      },
      {
        id: '4.2', title: 'Project-wise Material Cost Report',
        desc: 'Total material cost per project with category-wise breakdown.',
        icon: Building2, badge: 'Project', link: null,
      },
      {
        id: '4.3', title: 'Work Order-wise Material Issue Report',
        desc: 'Materials issued against each work order for sub-contractor billing.',
        icon: Layers, badge: 'WO', link: null,
      },
      {
        id: '4.4', title: 'Wastage & Scrap Report',
        desc: 'Quantity and value of materials scrapped or written off by site.',
        icon: Trash2, badge: 'Wastage', link: null,
        badgeOverride: { bg: '#FEE2E2', text: '#991B1B' },
      },
      {
        id: '4.5', title: 'Material Reconciliation Report',
        desc: 'Opening stock + receipts − issues = closing stock reconciliation.',
        icon: RefreshCcw, badge: 'Recon', link: null,
      },
      {
        id: '4.6', title: 'Cost Code-wise Material Expenditure',
        desc: 'Material spend mapped to BOQ cost codes for budget tracking.',
        icon: Tag, badge: 'Cost Code', link: null,
      },
    ],
  },
  {
    id: 'valuation',
    label: 'VALUATION & AUDIT REPORTS',
    number: '5',
    accent: '#DC2626',
    lightBg: '#FFF5F5',
    badge: { bg: '#FEE2E2', text: '#991B1B' },
    reports: [
      {
        id: '5.1', title: 'Inventory Valuation Report',
        desc: 'Stock value using FIFO or Weighted Average cost methods.',
        icon: Calculator, badge: 'FIFO / WA', link: null,
      },
      {
        id: '5.2', title: 'Physical Verification vs Book Stock',
        desc: 'Variance between physical count and system-recorded quantities.',
        icon: Search, badge: 'Physical', link: null,
      },
      {
        id: '5.3', title: 'Expiry & Shelf Life Tracking',
        desc: 'Items nearing or past expiry — chemicals, consumables, and coatings.',
        icon: CalendarClock, badge: 'Expiry', link: null,
        badgeOverride: { bg: '#FEF3C7', text: '#92400E' },
      },
      {
        id: '5.4', title: 'ABC Analysis Report',
        desc: 'Classify inventory into A / B / C categories by consumption value.',
        icon: BarChart3, badge: 'ABC', link: null,
      },
      {
        id: '5.5', title: 'Stock Ageing Report',
        desc: 'Age buckets (0–30, 31–60, 61–90, 90+ days) for all stock items.',
        icon: CalendarDays, badge: 'Ageing', link: null,
        badgeOverride: { bg: '#FEF3C7', text: '#92400E' },
      },
      {
        id: '5.6', title: 'Audit Trail Report',
        desc: 'Full log of stock adjustments, corrections, and who made them.',
        icon: FileBarChart, badge: 'Audit', link: null,
      },
    ],
  },
  {
    id: 'mis',
    label: 'MIS & SUMMARY REPORTS',
    number: '6',
    accent: '#0891B2',
    lightBg: '#ECFEFF',
    badge: { bg: '#CFFAFE', text: '#164E63' },
    reports: [
      {
        id: '6.1', title: 'Daily Store Activity Report',
        desc: 'All receipts, issues, returns, and transfers for a selected date.',
        icon: Activity, badge: 'Daily', link: '/stores/reports/dmr',
      },
      {
        id: '6.2', title: 'Monthly Material Consumption Summary',
        desc: 'Month-over-month consumption trends by item and category.',
        icon: TrendingUp, badge: 'Monthly', link: null,
      },
      {
        id: '6.3', title: 'Project-wise Store Utilization Report',
        desc: 'Store throughput, utilization rate, and material flow per project.',
        icon: Building2, badge: 'Project', link: null,
      },
      {
        id: '6.4', title: 'Category-wise Material Summary',
        desc: 'Stock and movement by material category — civil, MEP, safety, etc.',
        icon: LayoutList, badge: 'Category', link: null,
      },
      {
        id: '6.5', title: 'Store-wise Closing Stock Report',
        desc: 'Closing balances across all stores and sites as of any date.',
        icon: Warehouse, badge: 'Snapshot', link: null,
      },
      {
        id: '6.6', title: 'Top Consumed Items Report',
        desc: 'Highest-consumption materials by quantity and value in a period.',
        icon: Star, badge: 'Top Items', link: null,
      },
    ],
  },
];

// ─── Report Card ─────────────────────────────────────────────────────────────
function ReportCard({ report, sectionAccent, defaultBadge }) {
  const Icon   = report.icon;
  const badge  = report.badgeOverride || defaultBadge;
  const active = !!report.link;

  const card = (
    <div style={{
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 12,
      padding: '18px 18px 14px',
      position: 'relative',
      cursor: active ? 'pointer' : 'default',
      opacity: active ? 1 : 0.72,
      transition: 'box-shadow 0.18s, transform 0.18s',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      height: '100%',
      boxSizing: 'border-box',
    }}
      onMouseEnter={e => {
        if (!active) return;
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* top row: icon + arrow */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 9,
          background: active ? `${sectionAccent}18` : '#F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={18} color={active ? sectionAccent : '#94A3B8'} />
        </div>
        {active
          ? <ArrowUpRight size={15} color={sectionAccent} style={{ marginTop: 2 }} />
          : <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', marginTop: 4 }}>COMING SOON</span>
        }
      </div>

      {/* title */}
      <div>
        <p style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 3 }}>
          {report.id}
        </p>
        <h3 style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A', lineHeight: 1.35, margin: 0 }}>
          {report.title}
        </h3>
      </div>

      {/* description */}
      <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.55, margin: 0, flex: 1 }}>
        {report.desc}
      </p>

      {/* badge */}
      <div>
        <span style={{
          display: 'inline-block',
          fontSize: '11px', fontWeight: 600,
          padding: '2px 10px',
          borderRadius: 999,
          background: badge.bg,
          color: badge.text,
        }}>
          {report.badge}
        </span>
      </div>
    </div>
  );

  if (active) {
    return (
      <Link to={report.link} style={{ textDecoration: 'none', display: 'flex' }}>
        {card}
      </Link>
    );
  }
  return <div style={{ display: 'flex' }}>{card}</div>;
}

// ─── Section ─────────────────────────────────────────────────────────────────
function Section({ section }) {
  const activeCount = section.reports.filter(r => r.link).length;
  return (
    <div style={{ marginBottom: 48 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: section.accent, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, flexShrink: 0,
        }}>
          {section.number}
        </div>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: section.accent, letterSpacing: '0.08em', marginBottom: 0 }}>
            {section.label}
          </p>
          <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: 1 }}>
            {activeCount} of {section.reports.length} report{section.reports.length !== 1 ? 's' : ''} available
          </p>
        </div>
        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
      </div>

      {/* Cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
        gap: 14,
      }}>
        {section.reports.map(report => (
          <ReportCard
            key={report.id}
            report={report}
            sectionAccent={section.accent}
            defaultBadge={section.badge}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StoresReportsPage() {
  const totalActive = SECTIONS.reduce((s, sec) => s + sec.reports.filter(r => r.link).length, 0);
  const totalReports = SECTIONS.reduce((s, sec) => s + sec.reports.length, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '28px 24px 60px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'linear-gradient(135deg,#0F172A 0%,#1E3A5F 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Warehouse size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Stores Module — Reports
              </h1>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                Construction ERP · Inventory &amp; material management reporting
              </p>
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
            {[
              { label: 'Total Reports', value: totalReports, color: '#0F172A' },
              { label: 'Available Now', value: totalActive, color: '#059669' },
              { label: 'Coming Soon', value: totalReports - totalActive, color: '#64748B' },
              { label: 'Categories', value: SECTIONS.length, color: '#7C3AED' },
            ].map(s => (
              <div key={s.label} style={{
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: 10, padding: '10px 18px',
              }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '3px 0 0', fontWeight: 500 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── All sections ── */}
        {SECTIONS.map(section => (
          <Section key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
