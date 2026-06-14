# Stores & Procurement Reports — Functional Requirements Document (FRD)

**System:** construct-erp | **Modules:** Stores, Procurement | **Prepared:** 2026-06-13

---

## 1. Purpose & Scope

This document specifies the complete reporting requirements for the **Procurement** (20 reports) and **Stores** (30 reports) modules of construct-erp, plus recommended dashboards, a Top-10 management MIS pack, and a report hierarchy (Operational → Tactical → Strategic).

Every report is cross-referenced against the **actual construct-erp schema and existing pages** so this document doubles as a build backlog.

## 2. Conventions

- **Currency**: all monetary values in ₹ (Indian Rupees).
- **No central item master**: materials are tracked as free-text `material_name` across `mrs_items`, `po_items`, `grn_items`, `inventory`, `min_items`, `indent_items`. Cross-table matching uses `lower(trim(material_name))`.
- **Project scoping**: stock (`inventory`), POs, MRS, GRN, MIN are all scoped by `project_id`. There is no separate "warehouse" master — physical location is the free-text `inventory.site_location`.
- **Two requisition types** exist and are both relevant to "Purchase Requisition" reports:
  - `material_requisitions` / `mrs_items` ("MRS") — site-level requests for materials, which can be fulfilled from stock or trigger a PO (`purchase_orders.mrs_id` / `mrs_ids` / `po_items.mrs_item_id`).
  - `material_indents` / `indent_items` ("Indent") — the formal procurement requisition with a Comparative-Statement (CS) workflow (`cs_status`, linked `quotations` / `quotation_items`, `cs_selected_vendor_id`) feeding into a PO.
- **"MIN" naming note**: in construct-erp, `material_issue_notes` / `min_items` = **M**aterial **I**ssue **N**ote (issue of stock to a site/contractor). This is unrelated to "Min" as in *minimum stock level* (`inventory.minimum_level`), which is used in Reports S18–S20. The two are not to be confused.
- **PO status values**: `draft, pending, verified_audit, checked_finance, released_mgmt, approved, sent, part_received, fully_received, cancelled` (plus `rejected` used in some flows). "Open" = not in `(fully_received, cancelled, rejected)`.
- **Implementation Status legend**:
  - ✅ **Existing** — report/data already available (page/table cited)
  - 🟡 **Partial** — underlying data exists, but no dedicated report UI (or only a basic version exists)
  - 🆕 **New** — requires a new backend aggregation endpoint and/or UI; schema gaps are called out

---

# SECTION A — PROCUREMENT REPORTS

## P1. Purchase Requisition Register

**Business Purpose:** Central register of all material requisitions raised by sites/projects (both `material_requisitions`/MRS and `material_indents`), showing their current status and whether they have progressed to a PO.

| | |
|---|---|
| **Key Filters** | Project, Date Range, Requisition Type (MRS / Indent), Status, Priority, Raised By |
| **Report Columns** | Requisition No. (`mrs_number` / `indent_number`), Date, Project, Raised By, Priority, Status, Item Count, Total Qty Requested, Total Qty Ordered (`mrs_items.ordered_qty`), Balance Qty, Required-By Date |
| **Calculations / KPIs** | % Converted to PO = Σordered_qty / Σeffective_qty; Days Open = today − `created_at` |
| **User Roles** | Site Engineer / Store In-charge (raise), Project Manager (approve), Procurement Manager (view, action) |
| **Drill-down Options** | Requisition No. → Requisition detail (items, approval trail, **Linked Purchase Orders** card) |
| **Implementation Status** | 🟡 Partial — MRS list/detail exists in `MRSPage.jsx` (`material_requisitions`/`mrs_items`) with linked-PO and balance-qty columns just added; `material_indents` has its own workflow but no register view. A combined register across both is 🆕 New. |

## P2. Pending Purchase Requisition Report

**Business Purpose:** Highlights requisitions (MRS line items or indents) that still have an un-ordered balance, so Procurement can prioritise PO creation.

| | |
|---|---|
| **Key Filters** | Project, Age (days pending), Priority, Status (`pending`/`approved` not yet `po_raised`) |
| **Report Columns** | Requisition No., Material, Unit, Requested Qty, Ordered Qty, Balance Qty, Required-By Date, Days Pending, Priority |
| **Calculations / KPIs** | Balance Qty = `mrs_items.effective_qty − ordered_qty`; Days Pending = today − `created_at`; Overdue flag if `required_by` < today |
| **User Roles** | Procurement Manager, Purchase Executive |
| **Drill-down Options** | Requisition No. → Requisition detail; "Raise PO" action → `POPage.jsx` add-from-MRS flow |
| **Implementation Status** | 🟡 Partial — the balance-qty calculation (`ordered_qty` CTE in `mrs.routes.js`) and "skip fully-ordered items" logic in `POPage.jsx` `addMRS()` already exist; a standalone filterable "Pending PR" list view is 🆕 New. For `material_indents`, pending = `status NOT IN ('po_raised','rejected')` — 🆕 New. |

## P3. PR Approval Status Report

**Business Purpose:** Tracks each requisition through its approval pipeline (site → PM/MD approval, and for indents, the CS verify/check/approve chain) to identify bottlenecks.

| | |
|---|---|
| **Key Filters** | Project, Status Stage, Date Range, Approver |
| **Report Columns** | Requisition No., Raised By, Raised Date, Current Stage, Approver, Approval Date, Days in Stage, `md_included`/`md_approved_qty` (MRS) or `cs_status`/`cs_verified_at`/`cs_checked_at`/`cs_approved_at` (Indent) |
| **Calculations / KPIs** | Avg. Approval Turnaround per Stage = `*_at − previous_stage_at`; Rejection Rate = rejected / total |
| **User Roles** | Project Manager, MD/Director, Procurement Head |
| **Drill-down Options** | Requisition No. → Approval pipeline detail (the existing "Approval Pipeline" card in `MRSPage.jsx`) |
| **Implementation Status** | 🟡 Partial — approval fields exist on `material_requisitions` (status, `md_included`, `md_approved_qty`) and `material_indents` (`cs_verified_by/at`, `cs_checked_by/at`, `cs_approved_by/at`); `MRSVerificationPage.jsx` drives the workflow. A turnaround-time report across stages is 🆕 New. |

## P4. Request for Quotation (RFQ) Report

**Business Purpose:** Lists RFQs issued to vendors against indents, tracking which vendors have responded and which RFQs are still open.

| | |
|---|---|
| **Key Filters** | Project, Indent No., Vendor, RFQ Status (sent/responded/expired), Date Range |
| **Report Columns** | RFQ No., Indent No., Project, Vendors Invited (count), Vendors Responded (count), Issue Date, Response Due Date, Status |
| **Calculations / KPIs** | Response Rate = responded / invited; Avg. Response Time = `quotation.created_at − rfq.created_at` |
| **User Roles** | Procurement Manager, Purchase Executive |
| **Drill-down Options** | RFQ No. → Vendor-wise response list → Quotation detail |
| **Implementation Status** | ✅ Existing (page) / 🟡 Partial (report) — `rfqs`, `rfq_vendors`, `rfq_settings` tables exist, with `RFQPage.jsx` (internal) and `VendorRFQPortalPage.jsx` (vendor-facing) already built. A consolidated RFQ status **report** view is 🆕 New. |

## P5. Vendor Quotation Comparison Report

**Business Purpose:** Side-by-side comparison of vendor quotations against an indent, supporting the Comparative Statement (CS) decision and recording which vendor was selected.

| | |
|---|---|
| **Key Filters** | Project, Indent No., Material, Vendor |
| **Report Columns** | Indent No., Material, Qty, Vendor 1..N Rate, GST%, Delivery Days, Payment Terms, Selected Vendor (`is_selected`), Selected Rate, Variance vs Lowest |
| **Calculations / KPIs** | Lowest Rate, Highest Rate, Avg Rate; Variance % = (Selected − Lowest) / Lowest; Savings = (Highest − Selected) × Qty |
| **User Roles** | Procurement Manager, CS Approver (cs_verified_by / cs_checked_by / cs_approved_by), MD |
| **Drill-down Options** | Indent No. → `ComparativeStatementPage.jsx` (existing CS screen) → Quotation detail |
| **Implementation Status** | ✅ Existing (workflow) / 🟡 Partial (report) — `ComparativeStatementPage.jsx`, `QuotationPage.jsx`, `QuotationEntryPage.jsx` and `quotations`/`quotation_items` already implement entry & selection. A standalone printable "comparison report" with savings KPI is 🆕 New. |

## P6. Purchase Order Register

**Business Purpose:** Master list of all purchase orders with vendor, value, and status — the core procurement audit trail.

| | |
|---|---|
| **Key Filters** | Date Range, Project, Vendor, Status |
| **Report Columns** | PO No. (`po_number`/`serial_no_formatted`), Date, Vendor, Project, Item/Material, Qty, Rate, Total Amount (`grand_total`), Status |
| **Calculations / KPIs** | Total PO Value (period); Count by Status |
| **User Roles** | Procurement Manager, Finance, Auditor, MD |
| **Drill-down Options** | PO No. → PO detail (`POPage.jsx`) → linked GRNs / linked MRS |
| **Implementation Status** | ✅ Existing — `ReportsPage.jsx` → `procurement-po` ("Purchase Order Register"), endpoint `/purchase-orders`, with Date Range + Project filters already implemented. |

## P7. Open Purchase Order Report

**Business Purpose:** Shows POs that are not yet fully received/cancelled, so Procurement can track outstanding commitments and follow up with vendors.

| | |
|---|---|
| **Key Filters** | Project, Vendor, Status (`pending`…`sent`/`part_received`), Date Range |
| **Report Columns** | PO No., Vendor, Date, Status, Ordered Qty, Received Qty (from `grn_items`), Pending Qty, Pending Value, Expected Delivery |
| **Calculations / KPIs** | Pending Qty = Σ`po_items.quantity` − Σ`grn_items.quantity_received`; Pending Value = Pending Qty × `rate`; Total Open Commitment Value |
| **User Roles** | Procurement Manager, Site Engineer (expediting) |
| **Drill-down Options** | PO No. → PO detail → GRN history |
| **Implementation Status** | 🆕 New — `purchase_orders.status NOT IN ('fully_received','cancelled','rejected')` filter on the existing PO Register, plus a `po_items` vs `grn_items` join for pending qty/value (no `received_qty` column on `po_items` today). |

## P8. Closed Purchase Order Report

**Business Purpose:** Lists POs that have been fully received or cancelled, for completion tracking and historical analysis.

| | |
|---|---|
| **Key Filters** | Project, Vendor, Status (`fully_received`/`cancelled`), Date Range |
| **Report Columns** | PO No., Vendor, Date, Order Value, Status, Closure Date (last `grn.grn_date` or `updated_at`), Total Received Qty |
| **Calculations / KPIs** | Closure Lead Time = Closure Date − `po_date`; Count & Value by closure reason |
| **User Roles** | Procurement Manager, Finance |
| **Drill-down Options** | PO No. → PO detail → GRN(s) raised against it |
| **Implementation Status** | 🆕 New — same `purchase_orders`/`grn` data as P7, filtered to `status IN ('fully_received','cancelled')`. |

## P9. Pending Delivery Report

**Business Purpose:** Item-level view of materials still due from vendors against open POs, used for delivery follow-up.

| | |
|---|---|
| **Key Filters** | Project, Vendor, Material, Overdue Only (req_date < today) |
| **Report Columns** | PO No., Vendor, Material, Unit, Ordered Qty, Received Qty, Pending Qty, Required Date (`po_items.req_date`), Days Overdue |
| **Calculations / KPIs** | Pending Qty = `po_items.quantity` − Σ`grn_items.quantity_received` (matched via `grn_items.po_item_id`); Days Overdue = today − `req_date` |
| **User Roles** | Procurement Manager, Store In-charge, Site Engineer |
| **Drill-down Options** | PO No. → PO detail; Material → all open POs for that material |
| **Implementation Status** | 🆕 New — `grn_items.po_item_id` exists for the join, but no aggregation endpoint exists yet. |

## P10. Purchase Order Aging Report

**Business Purpose:** Buckets open POs by age since `po_date` to surface stale orders needing escalation.

| | |
|---|---|
| **Key Filters** | Project, Vendor, Status, Aging Bucket |
| **Report Columns** | PO No., Vendor, Date, Status, Age (days), Aging Bucket (0–7 / 8–15 / 16–30 / 30+), Open Value |
| **Calculations / KPIs** | Age = today − `po_date`; Value-weighted aging distribution |
| **User Roles** | Procurement Manager, MD |
| **Drill-down Options** | Aging Bucket → list of POs in that bucket → PO detail |
| **Implementation Status** | 🆕 New — simple aging bucket query on `purchase_orders` filtered to open statuses; no existing endpoint. |

## P11. Vendor Performance Report

**Business Purpose:** Evaluates vendor reliability — on-time delivery, quality acceptance, and rate competitiveness — to inform future vendor selection.

| | |
|---|---|
| **Key Filters** | Vendor, Project, Date Range, Material Category |
| **Report Columns** | Vendor, PO Count, Total Value, On-time Deliveries (%), Avg. Delay (days), GRN Quality Status mix (`approved`/`partial`/`rejected`), Avg. Rate vs Market |
| **Calculations / KPIs** | On-time % = GRNs where `grn.grn_date ≤ po_items.req_date` / total GRNs; Rejection Rate = `quality_status='rejected'` GRNs / total; Avg. Delay = `grn_date − req_date` |
| **User Roles** | Procurement Manager, MD |
| **Drill-down Options** | Vendor → all POs/GRNs for that vendor → individual PO/GRN |
| **Implementation Status** | 🆕 New — needs a `purchase_orders` ⋈ `po_items` ⋈ `grn`/`grn_items` aggregation by `vendor_id`; `grn.quality_status` already captures acceptance outcome. |

## P12. Vendor-wise Purchase Analysis

**Business Purpose:** Spend analysis by vendor over time, to support vendor consolidation and negotiation decisions.

| | |
|---|---|
| **Key Filters** | Date Range, Project, Vendor, Category |
| **Report Columns** | Vendor, PO Count, Total Order Value, Avg. Order Value, Top Materials Supplied, % of Total Procurement Spend |
| **Calculations / KPIs** | Spend Share % = Vendor Total / Grand Total; YoY/MoM growth |
| **User Roles** | Procurement Manager, Finance |
| **Drill-down Options** | Vendor → PO list (filtered) → PO detail |
| **Implementation Status** | 🟡 Partial — "Vendor Register" exists (`ReportsPage.jsx` → `procurement-vendor`, `/vendors`) but is a master list, not a spend analysis; spend aggregation by `vendor_id` over `purchase_orders.grand_total` is 🆕 New. |

## P13. Item-wise Purchase Analysis

**Business Purpose:** Tracks purchase volume and price trends for individual materials across vendors and time, supporting price-benchmarking and "rate contract" decisions.

| | |
|---|---|
| **Key Filters** | Date Range, Project, Material (free-text search), Vendor |
| **Report Columns** | Material, Total Qty Purchased, Total Value, Avg Rate, Min Rate, Max Rate, Vendor(s), No. of POs |
| **Calculations / KPIs** | Rate Variance % = (Max − Min) / Min; Price Trend (rate over time, chart) |
| **User Roles** | Procurement Manager, Cost Engineer |
| **Drill-down Options** | Material → PO list for that material → PO detail |
| **Implementation Status** | 🟡 Partial — `RateContractPage.jsx` already aggregates `po_items`/`quotation_items` rates by `lower(trim(material_name))` (the same fallback-matching pattern used for MR↔PO linkage); turning this into a dedicated "Item-wise Purchase Analysis" report with qty/value totals is 🆕 New. |

## P14. Project-wise Procurement Report

**Business Purpose:** Compares procurement activity and spend across projects, for portfolio-level oversight.

| | |
|---|---|
| **Key Filters** | Date Range, Project (multi-select), Status |
| **Report Columns** | Project, PO Count, Total Order Value, GRN Value Received, Open Commitment Value, Top Vendors, Top Materials |
| **Calculations / KPIs** | % of Company Procurement Spend per Project; Open Commitment = Total Order − GRN Value |
| **User Roles** | Procurement Head, MD, Project Director |
| **Drill-down Options** | Project → PO Register filtered by project → PO detail |
| **Implementation Status** | 🟡 Partial — `purchase_orders.project_id` and the existing PO Register's Project filter already support per-project queries; a cross-project comparison summary is 🆕 New. |

## P15. Procurement Cost Analysis Report

**Business Purpose:** Breaks down procurement spend by cost category to support cost-control and forecasting.

| | |
|---|---|
| **Key Filters** | Date Range, Project, Cost Head/Category |
| **Report Columns** | Cost Head, Project, Budgeted Amount, Procured Value, % of Budget Consumed, Variance |
| **Calculations / KPIs** | % Consumed = Procured Value / `budget_items.budgeted_amount`; Variance = Budgeted − Procured |
| **User Roles** | Procurement Head, Finance, MD |
| **Drill-down Options** | Cost Head → PO list tagged to that cost head → PO detail |
| **Implementation Status** | 🆕 New — `budget_items` has `project_id`/`cost_head`/`budgeted_amount`/`actual_amount`, but `po_items`/`purchase_orders` carry no `cost_head` tag today; this report needs either a new `cost_head` column on `po_items`/`purchase_orders` or a category-mapping layer before it can be built. |

## P16. Budget vs Procurement Report

**Business Purpose:** Compares the approved project budget against actual procurement commitments (POs) and receipts (GRNs), separate from the existing bill-based "actual" tracking.

| | |
|---|---|
| **Key Filters** | Project, Cost Head, Date Range |
| **Report Columns** | Project, Cost Head, Budgeted Amount, PO Committed Value, GRN Received Value, Bill-paid Actual (`budget_items.actual_amount`), Remaining Budget |
| **Calculations / KPIs** | Committed % = PO Value / Budgeted; Remaining Budget = Budgeted − max(Committed, Actual) |
| **User Roles** | Procurement Head, Finance Controller, MD |
| **Drill-down Options** | Cost Head → PO list / Bill list (`tqs_bills`) for that head |
| **Implementation Status** | 🟡 Partial — `budget_items` already tracks `budgeted_amount` vs `actual_amount` (from paid `tqs_bills`); adding a "PO committed value" column requires the same `cost_head` tagging gap noted in P15, so this is 🆕 New pending that. |

## P17. Procurement Lead Time Report

**Business Purpose:** Measures the time taken from requisition to PO approval to material receipt, to identify process bottlenecks.

| | |
|---|---|
| **Key Filters** | Project, Date Range, Material Category, Vendor |
| **Report Columns** | Requisition No., PO No., Requisition Date, PO Approval Date, GRN Date, Requisition→PO (days), PO→Receipt (days), Total Lead Time (days) |
| **Calculations / KPIs** | Avg./Median Lead Time per stage; Lead Time by Vendor / Material |
| **User Roles** | Procurement Manager, Operations Head |
| **Drill-down Options** | Requisition No. → PO → GRN chain |
| **Implementation Status** | 🆕 New — all source dates exist (`mrs_items`/`material_indents.created_at`, `purchase_orders.released_mgmt_at`/`authorized_md_at`, `grn.grn_date`), but no consolidated lead-time query exists. |

## P18. Procurement Savings Report

**Business Purpose:** Quantifies cost savings achieved through the CS/negotiation process versus the highest quote or a reference rate.

| | |
|---|---|
| **Key Filters** | Date Range, Project, Vendor, Material |
| **Report Columns** | Indent No., Material, Qty, Highest Quoted Rate, Selected (PO) Rate, Savings per Unit, Total Savings, % Savings |
| **Calculations / KPIs** | Savings = (Highest Quote − Selected Rate) × Qty; % Savings = Savings / (Highest Quote × Qty); Cumulative Savings (period) |
| **User Roles** | Procurement Head, MD, Finance |
| **Drill-down Options** | Indent No. → Quotation Comparison (P5) → PO detail |
| **Implementation Status** | 🆕 New — needs `quotation_items.rate` (all vendors) vs the `is_selected` quotation's rate, joined to the resulting `po_items.rate`; no such comparison query exists yet. |

## P19. Rate Contract Utilization Report

**Business Purpose:** Tracks how often negotiated/contracted rates are actually used on subsequent POs, and flags deviations.

| | |
|---|---|
| **Key Filters** | Vendor, Material, Date Range, Contract Status |
| **Report Columns** | Material, Vendor, Contracted Rate, Contract Validity, POs Raised at Contract Rate, POs at Deviated Rate, Deviation %, Qty Utilized vs Contracted Qty |
| **Calculations / KPIs** | Utilization % = Qty ordered under contract / Contracted Qty; Rate Deviation % = (PO Rate − Contracted Rate) / Contracted Rate |
| **User Roles** | Procurement Head, MD |
| **Drill-down Options** | Material/Vendor → PO list at/over contract rate → PO detail |
| **Implementation Status** | 🆕 New (schema gap) — `RateContractPage.jsx` exists today but is a **derived historical-rate view** computed client-side from `po_items`/`quotation_items` (no validity period or contracted quantity). True "utilization" tracking needs a new `rate_contracts` table (vendor, material, contracted_rate, valid_from/to, contracted_qty). |

## P20. Purchase Return Report

**Business Purpose:** Register of materials returned to vendors (rejected/excess goods) and the associated credit notes.

| | |
|---|---|
| **Key Filters** | Project, Vendor, Date Range, Reason |
| **Report Columns** | Credit Note No., PO No., GRN No., Vendor, Material, Qty Returned, Rate, Value, Reason, Status |
| **Calculations / KPIs** | Total Return Value (period); Return Rate % = Returned Value / GRN Received Value |
| **User Roles** | Store In-charge, Procurement Manager, Finance |
| **Drill-down Options** | Credit Note No. → linked GRN/PO detail |
| **Implementation Status** | 🟡 Partial — `CreditNotePage.jsx` already implements credit-note entry against PO/GRN/vendor; a register-style report with return-rate KPI is 🆕 New. |

---

# SECTION B — STORES REPORTS

## S1. Stock Summary Report

**Business Purpose:** Point-in-time view of current stock quantities and values across materials, projects and locations.

| | |
|---|---|
| **Key Filters** | Project, Site/Location, Category, Material |
| **Report Columns** | Material, Category, Unit, Current Stock (`closing_stock`), Unit Rate, Stock Value, Min Level (`minimum_level`), Reorder Level, Location (`site_location`) |
| **Calculations / KPIs** | Stock Value = `closing_stock × unit_rate`; Below-Minimum flag = `closing_stock < minimum_level` |
| **User Roles** | Store In-charge, Stores Manager, Procurement Manager |
| **Drill-down Options** | Material → Stock Ledger (S2) for that material |
| **Implementation Status** | ✅ Existing — `StockReportPage.jsx` and `ReportsPage.jsx` → `stores-stock` ("Stock / Inventory Report"), endpoint `/inventory`, already shows `closing_stock`, `minimum_level`, `site_location`. |

## S2. Stock Ledger Report

**Business Purpose:** Chronological transaction history (receipts, issues, transfers, adjustments) for a material, with running balance — the audit trail for stock movements.

| | |
|---|---|
| **Key Filters** | Project, Material, Date Range, Transaction Type |
| **Report Columns** | Date, Transaction Type (`grn`/`issue`/`return`/`transfer_in`/`transfer_out`/`adjustment`), Reference No., Qty In, Qty Out, Running Balance, Rate, Value, Remarks |
| **Calculations / KPIs** | Running Balance = previous balance ± `stock_transactions.quantity`; Opening/Closing balance for the period |
| **User Roles** | Store In-charge, Stores Manager, Auditor |
| **Drill-down Options** | Reference No. → source document (GRN / MIN / Transfer / Adjustment) |
| **Implementation Status** | ✅ Existing — `StoreLedgerPage.jsx`, `inventoryAPI.ledger(inventory_id)`, backed by `stock_transactions`. |

## S3. Stock Movement Report

**Business Purpose:** Period summary of total stock movement (in/out/transfer/adjustment) per material or project, used for monthly review.

| | |
|---|---|
| **Key Filters** | Project, Month/Period, Material, Movement Type |
| **Report Columns** | Material, Opening Stock, Receipts (GRN), Issues, Returns, Transfers In, Transfers Out, Adjustments, Closing Stock |
| **Calculations / KPIs** | Closing Stock = Opening + Receipts + Returns + Transfers In − Issues − Transfers Out ± Adjustments |
| **User Roles** | Stores Manager, Project Manager |
| **Drill-down Options** | Material → Stock Ledger (S2) filtered to the period |
| **Implementation Status** | ✅ Existing — `StoreLedgerPage.jsx` "Movement" tab uses `inventoryAPI.monthlyReport({ month, project_id })`, grouping `stock_transactions` by type for the selected month. |

## S4. Material Receipt Register (GRN)

**Business Purpose:** Register of all goods received against POs, with quality status.

| | |
|---|---|
| **Key Filters** | Project, Vendor, Date Range, Quality Status |
| **Report Columns** | GRN No., PO No., Vendor, Material, Qty Received, Unit, Quality Status (`pending`/`verified_stores`/`approved`/`rejected`/`partial`), GRN Date, Project |
| **Calculations / KPIs** | Total Received Value (period); Rejection Rate = `rejected` GRNs / total |
| **User Roles** | Store In-charge, Procurement Manager, QC |
| **Drill-down Options** | GRN No. → GRN detail (`GRNPage.jsx`) → linked PO |
| **Implementation Status** | ✅ Existing — `ReportsPage.jsx` → `stores-grn` ("GRN Register"), endpoint `/grn`, with Date Range + Project filters; `GRNPage.jsx`/`GRNVerificationPage.jsx`/`GRNPrintPage.jsx` cover entry & verification. |

## S5. Pending GRN Report

**Business Purpose:** Identifies POs (or PO line items) where goods are due but no GRN — or only a partial GRN — has been recorded, to drive receiving follow-up.

| | |
|---|---|
| **Key Filters** | Project, Vendor, Status, Overdue Only |
| **Report Columns** | PO No., Vendor, Material, Ordered Qty, Received Qty, Pending Qty, Req. Date, Days Overdue |
| **Calculations / KPIs** | Pending Qty = `po_items.quantity − Σgrn_items.quantity_received`; Days Overdue = today − `req_date` |
| **User Roles** | Store In-charge, Procurement Manager |
| **Drill-down Options** | PO No. → PO detail → "Create GRN" action |
| **Implementation Status** | 🆕 New — same underlying join as P9 (Pending Delivery Report), viewed from the Stores side; no existing endpoint. |

## S6. Material Issue Register

**Business Purpose:** Register of all materials issued from store to sites/contractors via Material Issue Notes (MIN).

| | |
|---|---|
| **Key Filters** | Project, Date Range, Issued To, Material |
| **Report Columns** | MIN No. (`min_number`), Issue Date, Issued To (`issued_to`), Material, Qty Requested, Qty Issued, Rate, Value (`amount`), Linked MRS No., Vehicle No. |
| **Calculations / KPIs** | Total Issue Value (period); Issue Fulfilment % = `quantity_issued / quantity_requested` |
| **User Roles** | Store In-charge, Stores Manager, Site Engineer |
| **Drill-down Options** | MIN No. → MIN detail (`IssuePage.jsx` / `MINPrintTemplate.jsx`) → linked MRS |
| **Implementation Status** | ✅ Existing — `material_issue_notes`/`min_items` with `IssuePage.jsx` (create) and `MINVerificationPage.jsx` (verify); a register/report view with filters is 🟡 Partial. |

## S7. Material Return Register

**Business Purpose:** Tracks materials returned from site back to store (excess/unused materials), restoring stock.

| | |
|---|---|
| **Key Filters** | Project, Date Range, Material, Returned By |
| **Report Columns** | Return Ref No., Date, Material, Qty Returned, Unit, Returned From (site/contractor), Rate, Value, Remarks |
| **Calculations / KPIs** | Total Return Value (period); Return Rate = Return Qty / Issue Qty for the material |
| **User Roles** | Store In-charge, Stores Manager |
| **Drill-down Options** | Return Ref No. → Stock Ledger entry (`transaction_type='return'`) |
| **Implementation Status** | 🟡 Partial — `stock_transactions.transaction_type` includes `'return'`, so the data model supports it, but there is no dedicated entry form or register UI for site→store returns (distinct from the vendor-facing `CreditNotePage.jsx`). 🆕 New UI + report. |

## S8. Stock Transfer Register

**Business Purpose:** Register of inter-site / inter-location stock transfers.

| | |
|---|---|
| **Key Filters** | Project, From Location, To Location, Date Range, Material |
| **Report Columns** | Transfer No., Date, From Location, To Location, Material, Qty, Unit, Status, Authorized By |
| **Calculations / KPIs** | Total Transfer Value (period); Pending-Acceptance Count (transfers awaiting receiving confirmation) |
| **User Roles** | Store In-charge (both ends), Stores Manager |
| **Drill-down Options** | Transfer No. → Transfer detail (`MaterialTransferPage.jsx`) → Stock Ledger entries at both locations |
| **Implementation Status** | ✅ Existing — `material_transfers`/`material_transfer_items` (migration `028_material_transfer.sql`) with `MaterialTransferPage.jsx`. |

## S9. Project-wise Stock Report

**Business Purpose:** Compares stock holdings and values across projects, supporting redeployment decisions.

| | |
|---|---|
| **Key Filters** | Project (multi-select), Category, Material |
| **Report Columns** | Project, Material, Qty in Stock, Stock Value, Location(s), % of Company Stock Value |
| **Calculations / KPIs** | Stock Value Share % = Project Stock Value / Total Company Stock Value |
| **User Roles** | Stores Manager, Operations Head |
| **Drill-down Options** | Project → Stock Summary (S1) for that project |
| **Implementation Status** | 🟡 Partial — `inventory.project_id` and the existing Stock/Inventory Report's project filter already provide per-project data; a cross-project comparison view is 🆕 New. |

## S10. Site-wise Material Consumption Report

**Business Purpose:** Shows how much material has been consumed (issued) at each site/location over a period — key input for cost control and MRP.

| | |
|---|---|
| **Key Filters** | Project, Site/Location, Date Range, Material |
| **Report Columns** | Site/Location, Material, Unit, Qty Issued, Value Issued, No. of MINs |
| **Calculations / KPIs** | Consumption Rate (qty/day or qty/₹ of work done, if linked to DPR); Top Consumed Materials per Site |
| **User Roles** | Site Engineer, Stores Manager, Cost Engineer |
| **Drill-down Options** | Site → Material → MIN list (S6) for that site/material |
| **Implementation Status** | 🆕 New — `min_items.material_name`/`quantity_issued`/`amount` joined to `material_issue_notes.issued_to`/`issue_date`, grouped by site; no existing aggregation. |

## S11. Contractor-wise Material Issue Report

**Business Purpose:** Tracks materials issued to each subcontractor/work-order, for reconciliation against contractor BOQs and recovery billing.

| | |
|---|---|
| **Key Filters** | Project, Contractor/Work Order, Date Range, Material |
| **Report Columns** | Contractor (`issued_to`), Material, Qty Issued, Rate, Value, MIN No., Date, Linked Work Order |
| **Calculations / KPIs** | Total Value Issued per Contractor; Material Recovery Value (for billing against contractor) |
| **User Roles** | Stores Manager, QS/Billing team |
| **Drill-down Options** | Contractor → MIN list → MIN detail |
| **Implementation Status** | 🆕 New — `material_issue_notes.issued_to` (free text) and `issued_to_user` already capture this; grouping/aggregation by contractor is 🆕 New. |

## S12. Warehouse-wise Stock Report

**Business Purpose:** Compares stock across physical storage locations within/across projects.

| | |
|---|---|
| **Key Filters** | Project, Location (`site_location`), Material, Category |
| **Report Columns** | Location, Material, Qty, Unit, Stock Value, Last Movement Date |
| **Calculations / KPIs** | Stock Value Share % per Location; Idle Locations (no movement in N days) |
| **User Roles** | Stores Manager |
| **Drill-down Options** | Location → Stock Summary (S1) filtered to that location → Stock Ledger (S2) |
| **Implementation Status** | 🟡 Partial — *Note: construct-erp has no separate "warehouse" master; `inventory.site_location` is a free-text field, unique per `(project_id, material_name, site_location)`.* Grouping the existing Stock Report by `site_location` is straightforward but 🆕 New as a dedicated view. |

## S13. Inventory Valuation Report

**Business Purpose:** Values current stock using FIFO batch costing for accurate balance-sheet / WIP reporting.

| | |
|---|---|
| **Key Filters** | Project, Location, Material, As-of Date |
| **Report Columns** | Material, Unit, Qty in Stock, Batch-wise Qty & Rate (`inventory_batches`), FIFO Valuation, Avg. Cost Valuation (comparison) |
| **Calculations / KPIs** | FIFO Value = Σ(`current_quantity × batch rate`) per active batch (`status='active'`); Total Inventory Value (company-wide) |
| **User Roles** | Stores Manager, Finance, Auditor |
| **Drill-down Options** | Material → Batch list (`inventory_batches`, ordered by `idx_inventory_batches_fifo`) → originating GRN (`grn_id`) |
| **Implementation Status** | 🟡 Partial — `inventory_batches` (with `received_date`, `current_quantity`, `status`, FIFO index) already exists for batch tracking; a consolidated valuation **report** summing batch values is 🆕 New. |

## S14. Stock Aging Report

**Business Purpose:** Buckets stock quantity/value by how long it has been held, to flag aging inventory tying up working capital.

| | |
|---|---|
| **Key Filters** | Project, Location, Material, Aging Bucket |
| **Report Columns** | Material, Batch No., Received Date, Qty, Value, Age (days), Aging Bucket (0–30 / 31–60 / 61–90 / 90+) |
| **Calculations / KPIs** | Age = today − `inventory_batches.received_date`; Value-weighted aging distribution; % of stock value > 90 days |
| **User Roles** | Stores Manager, Finance |
| **Drill-down Options** | Aging Bucket → batch list → GRN detail |
| **Implementation Status** | 🆕 New — `inventory_batches.received_date` + `idx_inventory_batches_fifo` make this efficient to compute, but no report exists yet. |

## S15. Slow Moving Stock Report

**Business Purpose:** Identifies materials with low consumption frequency relative to stock held, for purchasing/inventory-reduction decisions.

| | |
|---|---|
| **Key Filters** | Project, Location, Category, Threshold (e.g. < N issues in last 90 days) |
| **Report Columns** | Material, Qty in Stock, Stock Value, Last Issue Date, Issues in Last 90 Days, Days Since Last Movement |
| **Calculations / KPIs** | Movement Frequency = count(`stock_transactions` where `transaction_type='issue'`) in period; Slow-Moving flag if below threshold |
| **User Roles** | Stores Manager, Procurement Manager (avoid re-ordering slow items) |
| **Drill-down Options** | Material → Stock Ledger (S2) |
| **Implementation Status** | 🆕 New — derivable from `stock_transactions` (type='issue') grouped by `inventory_id` with a date-window filter; no existing report. |

## S16. Non-Moving Stock Report

**Business Purpose:** Lists materials with **zero** outward movement over a defined period — stricter than "slow moving" — to highlight unused stock.

| | |
|---|---|
| **Key Filters** | Project, Location, Category, No-Movement Period (e.g. 90/180 days) |
| **Report Columns** | Material, Qty in Stock, Stock Value, Last Movement Date, Days Since Last Movement |
| **Calculations / KPIs** | Non-Moving = no `stock_transactions` of type `issue`/`transfer_out` in the period; Total Non-Moving Value |
| **User Roles** | Stores Manager, Finance |
| **Drill-down Options** | Material → Stock Ledger (S2) |
| **Implementation Status** | 🆕 New — same data source as S15 with a stricter (zero-movement) condition; share an aggregation endpoint with S15/S17. |

## S17. Dead Stock Report

**Business Purpose:** Identifies stock that is non-moving over a long horizon (e.g. >180–365 days) with no planned future use — candidates for write-off, transfer, or disposal.

| | |
|---|---|
| **Key Filters** | Project, Location, Category, Dead-Stock Threshold (days) |
| **Report Columns** | Material, Qty, Stock Value, Last Movement Date, Days Idle, Suggested Action (write-off/transfer/dispose) |
| **Calculations / KPIs** | Dead Stock Value = Σ value where Days Idle > threshold; % of Total Stock Value classified Dead |
| **User Roles** | Stores Manager, Finance, MD |
| **Drill-down Options** | Material → Stock Ledger (S2) → batch detail (for write-off reference) |
| **Implementation Status** | 🆕 New — extension of S16 with a longer threshold and a "suggested action" field (would need a small status column on `inventory` or a separate disposition log). |

## S18. Reorder Level Report

**Business Purpose:** Flags materials whose current stock has fallen to/below the configured reorder level, triggering replenishment requisitions.

| | |
|---|---|
| **Key Filters** | Project, Location, Category |
| **Report Columns** | Material, Unit, Current Stock, Reorder Level, Shortfall (Reorder Level − Current Stock), Last Procurement Rate, Suggested Order Qty |
| **Calculations / KPIs** | Below Reorder flag = `closing_stock <= reorder_level`; Suggested Order Qty = `reorder_level − closing_stock` (or up to `minimum_level`) |
| **User Roles** | Store In-charge, Procurement Manager |
| **Drill-down Options** | Material → "Raise Requisition" action → new MRS pre-filled |
| **Implementation Status** | 🟡 Partial — `inventory.reorder_level` and `minimum_level` columns **already exist** and are shown in the Stock/Inventory Report; a dedicated filtered "below reorder level" report (and the "raise requisition" shortcut) is 🆕 New. |

## S19. Minimum-Maximum Stock Report

**Business Purpose:** Compares current stock against configured minimum and maximum holding levels per material, to balance availability against over-stocking.

| | |
|---|---|
| **Key Filters** | Project, Location, Category, Status (Below Min / Within Range / Above Max) |
| **Report Columns** | Material, Unit, Current Stock, Minimum Level, Maximum Level, Status, Variance from Range |
| **Calculations / KPIs** | Status = Below Min if `closing_stock < minimum_level`; Above Max if `closing_stock > maximum_level`; else Within Range |
| **User Roles** | Stores Manager, Procurement Manager |
| **Drill-down Options** | Material → Stock Ledger (S2) |
| **Implementation Status** | 🆕 New (partial schema gap) — `inventory.minimum_level` exists, but there is **no `maximum_level` column** today; adding one is required for the "Maximum" half of this report. *(Reminder: do not confuse with `min_items` = Material Issue Note items — see Conventions.)* |

## S20. Excess Stock Report

**Business Purpose:** Identifies materials held in quantities exceeding the maximum level (or a defined excess threshold), indicating over-procurement.

| | |
|---|---|
| **Key Filters** | Project, Location, Category, Excess Threshold % |
| **Report Columns** | Material, Current Stock, Maximum/Target Level, Excess Qty, Excess Value, Last Procurement Date |
| **Calculations / KPIs** | Excess Qty = `closing_stock − maximum_level` (where positive); Excess Value = Excess Qty × `unit_rate`; Total Excess Value |
| **User Roles** | Stores Manager, Procurement Manager, MD |
| **Drill-down Options** | Material → Stock Ledger (S2) → recent GRNs (to see over-ordering source) |
| **Implementation Status** | 🆕 New — depends on the same `maximum_level` column gap noted in S19. |

## S21. Physical Stock Verification Report

**Business Purpose:** Records periodic physical stock counts and compares them against book (system) stock for reconciliation.

| | |
|---|---|
| **Key Filters** | Project, Location, Verification Date/Cycle, Material |
| **Report Columns** | Material, Location, Book Stock, Physical Stock, Variance Qty, Variance Value, Verified By, Verification Date, Remarks |
| **Calculations / KPIs** | Variance Qty = Physical − Book; Variance Value = Variance Qty × `unit_rate`; Accuracy % = (1 − |Variance| / Book) |
| **User Roles** | Store In-charge, Stores Manager, Auditor |
| **Drill-down Options** | Material → Stock Ledger (S2) (to investigate variance causes) |
| **Implementation Status** | 🆕 New (schema gap) — no physical-count table exists; requires a new `stock_verifications`/`stock_verification_items` table capturing counted qty per material/location/date, plus an `adjustment`-type `stock_transactions` entry to reconcile. |

## S22. Stock Variance Report

**Business Purpose:** Consolidated view of all stock variances (from physical verification, S21) across projects/periods, with root-cause classification.

| | |
|---|---|
| **Key Filters** | Project, Location, Date Range, Variance Type (shortage/excess), Material |
| **Report Columns** | Material, Location, Verification Date, Book Stock, Physical Stock, Variance Qty, Variance Value, Reason, Adjustment Status |
| **Calculations / KPIs** | Total Shortage Value, Total Excess Value (period); Variance % by Material/Location |
| **User Roles** | Stores Manager, Finance, Auditor |
| **Drill-down Options** | Variance row → linked `adjustment` stock transaction → verification record (S21) |
| **Implementation Status** | 🆕 New — depends on S21's new tables; this report is the aggregation/reporting layer over those verification records. |

## S23. Material Wastage Report

**Business Purpose:** Tracks material wastage/breakage recorded as stock adjustments, for cost-control and process-improvement.

| | |
|---|---|
| **Key Filters** | Project, Location, Date Range, Material, Reason |
| **Report Columns** | Date, Material, Qty Wasted, Unit, Value, Reason/Remarks, Recorded By |
| **Calculations / KPIs** | Total Wastage Value (period); Wastage % = Wastage Qty / Total Consumption Qty |
| **User Roles** | Site Engineer, Stores Manager, Finance |
| **Drill-down Options** | Material → Stock Ledger (S2) entries of type `adjustment` |
| **Implementation Status** | 🟡 Partial — `stock_transactions.transaction_type='adjustment'` with `remarks` already supports recording wastage; a dedicated wastage-reason field/report is 🆕 New. |

## S24. BOQ vs Material Consumption Report

**Business Purpose:** Compares actual material consumption (issues) against the Bill of Quantities (BOQ) estimate for the project, to flag over/under-consumption.

| | |
|---|---|
| **Key Filters** | Project, BOQ Item/Material, Date Range |
| **Report Columns** | BOQ Item, Material, BOQ Estimated Qty, Actual Consumed Qty (`min_items`), Variance Qty, Variance %, Estimated Value, Actual Value |
| **Calculations / KPIs** | Variance % = (Actual − Estimated) / Estimated; Cost Overrun Value = Variance Qty × `unit_rate` |
| **User Roles** | Project Manager, Cost Engineer, QS |
| **Drill-down Options** | BOQ Item → Material consumption detail (S10) |
| **Implementation Status** | 🆕 New (cross-module) — actual consumption is available via `min_items`, but no BOQ/estimate table was found in Stores/Procurement schema; this report needs integration with the Planning/QS BOQ data source. |

## S25. Material Cost Analysis Report

**Business Purpose:** Analyses cost trends for materials over time, combining GRN receipt rates and batch valuations, to support budgeting and forecasting.

| | |
|---|---|
| **Key Filters** | Project, Material, Date Range, Vendor |
| **Report Columns** | Material, Period, Avg. Receipt Rate, Min/Max Rate, Qty Received, Total Receipt Value, Rate Trend |
| **Calculations / KPIs** | Rate Trend = period-over-period % change in avg. rate; Cost Volatility = (Max − Min) / Avg |
| **User Roles** | Stores Manager, Procurement Manager, Finance |
| **Drill-down Options** | Material → GRN list (S4) with rates → PO detail |
| **Implementation Status** | 🆕 New — overlaps with P13 (Item-wise Purchase Analysis) but from the receipt (`grn_items`/`inventory_batches`) side rather than the PO side; no existing endpoint. |

## S26. Inventory Turnover Report

**Business Purpose:** Measures how efficiently inventory is being consumed relative to the value held — a key working-capital efficiency KPI.

| | |
|---|---|
| **Key Filters** | Project, Material, Period |
| **Report Columns** | Material/Project, Opening Stock Value, Closing Stock Value, Avg. Stock Value, Total Consumption Value (period), Turnover Ratio |
| **Calculations / KPIs** | Turnover Ratio = Consumption Value / Avg. Stock Value; Days Inventory Outstanding = 365 / Turnover Ratio |
| **User Roles** | Stores Manager, Finance, MD |
| **Drill-down Options** | Material → Stock Movement Report (S3) for the period |
| **Implementation Status** | 🆕 New — computed from S1 (stock value) + S3 (consumption value); no existing endpoint. |

## S27. Daily Stores Activity Report

**Business Purpose:** Single-page daily summary of all stores transactions (receipts, issues, transfers, adjustments) for a project/site — used in daily review meetings.

| | |
|---|---|
| **Key Filters** | Project, Date, Location |
| **Report Columns** | Transaction Type, Reference No. (GRN/MIN/Transfer/Adjustment), Material, Qty, Value, Time, User |
| **Calculations / KPIs** | Day totals by transaction type; Net Stock Movement Value for the day |
| **User Roles** | Store In-charge, Stores Manager, Project Manager |
| **Drill-down Options** | Reference No. → source document (GRN/MIN/Transfer detail) |
| **Implementation Status** | 🆕 New — `stock_transactions` already records all movement types with `transacted_at`/`transacted_by`; a single-day filtered view is 🆕 New (straightforward query). |

## S28. Monthly Stores Summary Report

**Business Purpose:** Monthly rollup of stores activity and valuation per project — the management summary version of S27/S3.

| | |
|---|---|
| **Key Filters** | Project, Month/Year |
| **Report Columns** | Project, Opening Stock Value, Receipts Value, Issues Value, Returns Value, Transfers Net, Adjustments Value, Closing Stock Value, No. of GRNs / MINs / Transfers |
| **Calculations / KPIs** | Closing Stock Value reconciliation (Opening + Receipts + Returns ± Transfers − Issues ± Adjustments); MoM variance |
| **User Roles** | Stores Manager, Project Manager, MD |
| **Drill-down Options** | Project → Daily Stores Activity (S27) for any day in the month |
| **Implementation Status** | 🟡 Partial — `StoreLedgerPage.jsx`'s existing `inventoryAPI.monthlyReport()` (used for S3) provides the quantity-side rollup; adding valuation (₹) columns and a project-level summary is 🆕 New. |

## S29. Site Material Balance Report

**Business Purpose:** Shows the running material balance (received − issued ± transfers) at each site/location — a quick "what's left on site" view for site teams.

| | |
|---|---|
| **Key Filters** | Project, Site/Location, Material |
| **Report Columns** | Site/Location, Material, Opening Balance, Received, Issued, Transferred In/Out, Closing Balance, Balance Value |
| **Calculations / KPIs** | Closing Balance = Opening + Received + Transfer In − Issued − Transfer Out; Balance Value = Closing Balance × `unit_rate` |
| **User Roles** | Site Engineer, Store In-charge, Stores Manager |
| **Drill-down Options** | Site/Location → Material → Stock Ledger (S2) filtered to that site |
| **Implementation Status** | 🟡 Partial — `inventory` is already keyed by `(project_id, material_name, site_location)`, so per-site balances exist; a consolidated "balance report" grouped by site is 🆕 New. |

## S30. Material Requirement Planning (MRP) Report

**Business Purpose:** Forecasts upcoming material needs by combining pending requisition balances, current stock, and typical procurement lead times — enabling proactive purchasing.

| | |
|---|---|
| **Key Filters** | Project, Material, Planning Horizon (30/60/90 days) |
| **Report Columns** | Material, Pending Requisition Qty (`mrs_items` balance), Current Stock, Net Requirement, Avg. Procurement Lead Time, Suggested Order-By Date, Suggested Order Qty |
| **Calculations / KPIs** | Net Requirement = Pending Requisition Qty − Current Stock (if positive); Suggested Order-By Date = Required-By Date − Avg. Lead Time |
| **User Roles** | Procurement Manager, Stores Manager, Project Manager |
| **Drill-down Options** | Material → Pending Purchase Requisition (P2) + Stock Summary (S1) + Procurement Lead Time (P17) |
| **Implementation Status** | 🆕 New — synthesises the balance-qty logic already built for MR↔PO linkage (`mrs_items.ordered_qty`/`effective_qty`), `inventory.closing_stock`, and the lead-time data from P17; no existing endpoint. |

---

# SECTION C — RECOMMENDED DASHBOARD KPIs: PROCUREMENT MANAGER

| KPI | Definition | Source |
|---|---|---|
| Open PO Value | Σ`grand_total` for POs with status NOT IN (fully_received, cancelled, rejected) | `purchase_orders` |
| Pending Approvals (Count / Value) | POs in `verified_audit`/`checked_finance`/`released_mgmt` awaiting next stage | `purchase_orders.status` |
| Pending Purchase Requisitions | MRS/Indent items where `ordered_qty < effective_qty` (or indent `status NOT IN ('po_raised','rejected')`) | `mrs_items`, `material_indents` |
| Avg. Procurement Lead Time (days) | MRS/Indent → PO approval → GRN, rolling 90-day avg | P17 |
| Vendor On-Time Delivery % | GRNs with `grn_date ≤ po_items.req_date` / total GRNs (rolling period) | P11 |
| Top 5 Vendors by Spend (MTD/QTD) | Σ`grand_total` grouped by `vendor_id`, ranked | P12 |
| Budget vs Procurement % | PO committed value vs `budget_items.budgeted_amount`, by project | P16 |
| Pending Deliveries (Count / Value) | Open PO line items with `pending_qty > 0` | P9 |
| Purchase Returns (MTD) | Σ value of credit notes raised this month | P20 |
| Rate Variance Alerts | Materials where latest PO rate deviates >X% from rolling avg rate | P13/P19 |

---

# SECTION D — RECOMMENDED DASHBOARD KPIs: STORES MANAGER

| KPI | Definition | Source |
|---|---|---|
| Total Stock Value | Σ FIFO batch value across all projects/locations | S13 |
| Pending GRNs (Count / Value) | Open PO line items with `received_qty < ordered_qty` | S5 |
| Stock Aging Distribution | % of stock value in 0–30 / 31–60 / 61–90 / 90+ day buckets | S14 |
| Slow / Non-Moving / Dead Stock Value | Σ value of items meeting S15/S16/S17 criteria | S15–S17 |
| Material Issued Today / This Week | Σ `min_items.amount` for `issue_date` in range | S6 |
| Pending Stock Transfers | Transfers awaiting receiving confirmation | S8 |
| Reorder Alerts (Count) | Materials with `closing_stock ≤ reorder_level` | S18 |
| Inventory Turnover Ratio | Consumption Value / Avg. Stock Value (rolling 90-day) | S26 |
| Top 5 High-Value Materials in Stock | Materials ranked by `closing_stock × unit_rate` | S1 |
| Material Wastage % (MTD) | Σ `adjustment`-type write-off value / Σ consumption value | S23 |

---

# SECTION E — TOP 10 MIS REPORTS FOR CONSTRUCTION COMPANY MANAGEMENT

| # | MIS Report | Combines | Audience |
|---|---|---|---|
| 1 | Project-wise Procurement vs Budget Summary | P14 + P16 | MD, Finance |
| 2 | Vendor Performance & Spend Summary | P11 + P12 | Procurement Head, MD |
| 3 | Company-wide Stock Valuation Summary | S1 + S13 + S9 | MD, Finance |
| 4 | Pending Requisitions & PO Aging Dashboard | P2 + P10 | Procurement Head |
| 5 | Material Cost Trend (Top Materials) | P13 + S25 | Procurement Head, Finance |
| 6 | Site-wise Consumption vs BOQ Summary | S10 + S24 | Project Director, QS |
| 7 | Monthly Stores Activity Rollup (All Projects) | S28 | MD, Operations Head |
| 8 | Procurement Lead Time & Savings Summary | P17 + P18 | Procurement Head, MD |
| 9 | Dead/Slow-Moving Stock Exposure (Working Capital) | S15–S17 | MD, Finance |
| 10 | 30/60/90-Day Material Requirement Forecast | S30 | MD, Procurement Head |

---

# SECTION F — SUGGESTED REPORT HIERARCHY

## Operational (Daily — Store/Purchase Executives)
- S2 Stock Ledger Report, S6 Material Issue Register, S7 Material Return Register, S8 Stock Transfer Register
- S4 Material Receipt Register (GRN), S5 Pending GRN Report, S27 Daily Stores Activity Report
- P1 Purchase Requisition Register, P2 Pending Purchase Requisition Report
- P4 RFQ Report, P5 Vendor Quotation Comparison Report, P6 Purchase Order Register, P7 Open PO Report
- S21 Physical Stock Verification Report

## Tactical (Weekly/Monthly — Stores & Procurement Managers, Site Engineers)
- S1 Stock Summary, S3 Stock Movement, S9 Project-wise Stock, S10 Site-wise Consumption, S11 Contractor-wise Issue, S12 Warehouse-wise Stock
- S14 Stock Aging, S15 Slow Moving, S16 Non-Moving, S18 Reorder Level, S19 Min-Max Stock, S20 Excess Stock, S22 Stock Variance, S23 Material Wastage, S28 Monthly Stores Summary, S29 Site Material Balance
- P3 PR Approval Status, P8 Closed PO Report, P9 Pending Delivery, P10 PO Aging, P11 Vendor Performance, P12 Vendor-wise Purchase Analysis, P13 Item-wise Purchase Analysis, P14 Project-wise Procurement, P17 Procurement Lead Time

## Strategic (Monthly/Quarterly — Directors, MD, CFO)
- S13 Inventory Valuation, S17 Dead Stock, S24 BOQ vs Consumption, S25 Material Cost Analysis, S26 Inventory Turnover, S30 MRP Report
- P15 Procurement Cost Analysis, P16 Budget vs Procurement, P18 Procurement Savings, P19 Rate Contract Utilization, P20 Purchase Return Report
- Section E — Top 10 MIS Reports (consolidated cross-functional pack)

---

# Implementation Status Summary

| Status | Procurement (of 20) | Stores (of 30) |
|---|---|---|
| ✅ Existing | 1 (P6) | 6 (S1, S2, S3, S4, S6, S8) |
| 🟡 Partial | 7 (P1–P5, P12, P19, P20\*) | 8 (S7, S9, S12, S13, S18, S23, S28, S29) |
| 🆕 New | 12 | 16 |

\* P20 also counted under Partial. Counts indicate the dominant status per report; several "Partial" reports have a 🆕 New reporting layer over existing data.

**Key schema additions identified for the 🆕 New items**: `cost_head` tagging on `po_items`/`purchase_orders` (P15, P16), a `rate_contracts` table (P19), an `inventory.maximum_level` column (S19, S20), and `stock_verifications`/`stock_verification_items` tables (S21, S22).
