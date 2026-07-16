# Android App — Full Module Parity Master Plan

## Context

`mobile-app/` is a real Expo/React Native app already covering nearly every
web ERP module in its bottom-tab/menu navigation (`src/navigation/
moduleRegistry.js`). Screens split into three tiers:

- **Solid** — fully custom, real functionality (dashboards, Approvals, ESS,
  Bills list, GRS, Material Tracker, Chat, Budget Control, etc.)
- **Thin** — a real custom screen exists but is missing depth (usually a
  detail screen that's 16-27 lines: shows a couple of header fields but no
  line items, no status actions, no linked records)
- **Stub** — `makeListScreen()` factory output (12-15 lines): read-only list,
  no search/filter, no create, no detail beyond whatever generic card it
  renders

**Gate Pass (Stores) is already done end-to-end** (commit `444ad2d1`) and is
the reference pattern for every phase below — read these 3 files before
building anything:
- `src/screens/GatePassScreen.js` (list + FAB)
- `src/screens/CreateGatePassScreen.js` (form + dynamic item rows)
- `src/screens/GatePassDetailScreen.js` (detail + `MetaRow` + status-gated
  action buttons)

There is also a narrower, more detailed plan already written for the Stores/
Procurement/Bill Tracker modules specifically:
**`mobile-app/MOBILE_PARITY_PLAN.md`** — read that first if working on those
modules; this document covers everything else plus the overall priority
order across the whole app.

## Standing rules for every phase (don't skip these)

1. **Read the actual backend route handler before writing a screen against
   it.** This plan gives route *file names*, not full schemas — several
   wrap responses in `{ data: {...} }`, some don't; field names vary.
2. **Match existing conventions exactly**: `theme.js` tokens (never hardcode
   colors), reuse `Card`/`Button`/`ScreenHeader`/`StatusBadge`/`FAB`/
   `EmptyState`/`ErrorState`/`ListSkeleton` components, `Alert.alert` for
   confirmations, `useMutation` + `queryClient.invalidateQueries(...)` for
   every write.
3. **Gate actions by role** the same way the backend does (`authorize(...)`
   calls in the route file) — check `useAuth()`'s `user.role` client-side too
   so users don't see buttons they can't actually use.
4. **Verify by Babel-parsing every new/changed file** (no device/emulator
   available in a plain chat session):
   ```bash
   node -e "require('@babel/core').transformFileSync('PATH', { presets: [require.resolve('babel-preset-expo')], filename: 'PATH' })"
   ```
   If a real device/emulator becomes available, actually run and click
   through — don't skip that step if you have the means.
5. **One phase per commit**, clear message stating what was thin/stub before
   and what's built now (see commit `444ad2d1` for the style).
6. **After each phase**: register any new screens in
   `src/navigation/RootNavigator.js`, check for name collisions with
   `grep -oE 'Stack\.Screen name="[A-Za-z]+"' src/navigation/RootNavigator.js | sort | uniq -d`,
   then push to main (mobile app changes don't auto-deploy anywhere — no live
   -site risk from pushing).

---

## Priority order across the whole app

Ranked by how central the module is to daily site/office use, per the user's
own earlier prioritization (they picked Stores/Procurement/Bill Tracker
first). Adjust freely if the user redirects.

### Track A — Stores / Procurement / Bill Tracker
Already has its own detailed 8-phase breakdown with exact backend route/line
references. **See `MOBILE_PARITY_PLAN.md`.** Phase 0 (Gate Pass) done;
Phases 1-8 (Store Ledger, Vendor Payments, Store Petty Cash, PO/Work Order/
IGN/MRS detail thickening, Bills verification) still open.

### Track B — HR & Admin / Self Service
Daily-use for every employee, not just office staff — high value.

- **HR Dashboard** (245 lines) — already solid, minor polish only.
- **Attendance / Leave (ESS)** — `ESSScreen.js` (492 lines) is the most
  built-out screen in the app besides dashboards. Likely near-complete;
  verify against `frontend/src/pages/ess/*` before assuming gaps.
- **Employee Directory** — 15-line stub. Backend: `hr-employees.routes.js`.
  Build: real searchable list (name, designation, department, contact) +
  detail view. Given company-wide data, decide whether the mobile detail view
  needs the same document/lifecycle tabs as the web `EmployeeDetailPage.jsx`
  or just contact info — check with the user if unsure, this could be a
  privacy-sensitive scope call.
- **Payroll** — 14-line stub. Backend: `hr-payroll.routes.js`,
  `payroll.routes.js`. `CurrentSalaryScreen.js` (107 lines) and
  `PayslipDetailScreen.js` (115 lines) already exist and look solid — the
  14-line `PayrollScreen.js` might just be a thin list wrapper around
  screens that already work; check whether this needs real work or if it's
  actually fine because the two detail screens carry the real functionality.
- **Performance** — 15-line stub. Backend: `hr-appraisals.routes.js`,
  `hr-evaluations.routes.js`. Build: list of appraisals/reviews + detail.
- **Assets (Self Service)** — `AssetsScreen.js` (65 lines, functional) +
  `AssetDetailScreen.js` (19 lines, thin). Backend: `asset.routes.js`,
  `asset-mgmt.routes.js`, `hr-employee-assets.routes.js` (employee-assigned
  assets specifically — check which one the "Self Service → Assets" menu
  item should actually hit; the web app may use a different endpoint here
  than the "Assets & IT" admin module below).
- **Documents** — 59 lines, moderate. Backend: `documents.routes.js`,
  `dms.routes.js`. Check if this needs file preview/download (mobile file
  handling needs `expo-file-system` / `expo-sharing`, not yet a dependency —
  add if building download support).
- **Profile / Settings** — 108 / 42 lines, reasonably built already. Lower
  priority.

### Track C — QS & Billing
Used by QS engineers and site management for measurement/billing.

- **QS Dashboard** (299 lines) — solid.
- **BOQ** — 92 lines, moderate (list-level, likely no line-item editing).
  Backend: `boq.routes.js`. Decide if mobile needs BOQ editing at all, or
  read-only browse is sufficient (web BOQ editing is a heavy spreadsheet-like
  UI, probably not worth porting to mobile — confirm with user before
  attempting).
- **Budget Breakdown** (244 lines) / **Budget Control** (231 lines) — both
  solid.
- **Measurement Book** — 13-line stub. Backend: `measurement.routes.js`.
  Build: list + detail (this is usually read/reference data on mobile,
  unlikely to need a create flow — verify against web usage pattern first).
- **RA Bills** — 75 lines (functional list) + `RABillDetailScreen.js` (19
  lines, thin). Backend: `raBill.routes.js`. Build: thicken detail with line
  items and approval status/actions.
- **Variations** — 74 lines (functional list) + `VariationDetailScreen.js`
  (23 lines, thin). Backend: `variation.routes.js`,
  `variation-statement.routes.js`. Thicken detail similarly.

### Track D — Accounts
Used by accountants; also has some overlap with Bill Tracker (Track A).

- **Accounts Dashboard** (254 lines) — solid.
- **Bank Accounts** — 13-line stub. Backend: `bank-accounts.routes.js`.
  Likely just needs a real list + detail (account number, balance, linked
  transactions) — check if any create/edit is warranted on mobile or if
  that's admin-only and should stay web-only.
- **Invoices** — 75 lines (functional list) + `InvoiceDetailScreen.js` (19
  lines, thin). Backend: `invoice.routes.js`, `recurring-invoices.routes.js`.
  Thicken detail with line items and GST breakdown.
- **Chart of Accounts** — 77 lines, moderate. Backend:
  `chart-of-accounts.routes.js`. Probably fine as a read-only browse tree;
  low priority to expand further.
- **Profit & Loss** — 85 lines, moderate. Read-only report; likely fine.
- **GST** — 70 lines, moderate. Backend: (check `invoice.routes.js` GST
  endpoints or a dedicated GST route if one exists — wasn't found as a
  separate file, may be embedded in invoice/tds routes).
- **TDS** — 13-line stub. Backend: `tds.routes.js`. Build: real list + detail.

### Track E — Planning
Used by planning engineers/PMs for schedule tracking.

- **P&E Dashboard (PMDashboard)** (253 lines) — solid.
- **Schedule & Activities** — 13-line stub. Backend: `planning.routes.js`,
  `planning-p6.routes.js`. Build: real list (activity name, WBS, dates,
  % complete) + detail. Given `planning-p6.routes.js` exists, check if this
  is Primavera P6-integrated data — if so, mobile is very likely read-only
  browse, not an editing surface.
- **Milestones** — 13-line stub. Same backend area. Build: list + detail.
- **Look-Ahead Plan** — 13-line stub. Same backend area.
- **Engineer Daily Log** — 12-line stub. Backend: `engineer-log.routes.js`.
  This one plausibly needs a **create** flow too (a daily log is something
  engineers fill in from site, arguably even more mobile-native than most
  modules) — worth asking the user if this should get create-from-mobile
  priority over the read-only modules above it.
- **Daily Progress (DPR)** — `DPRScreen.js` (62 lines) + `CreateDPRScreen.js`
  (132 lines, solid) — already has a working create flow. Check if the list/
  detail side needs anything more; likely low priority, already decent.
- **Planning Reports** → routes to the shared `ReportsHubScreen.js` (54
  lines) — see Track H below.

### Track F — Quality (QA/QC) & HSE/Safety
All four Quality screens and all three HSE screens are 12-13 line stubs —
this is the single most under-built area of the app proportionally.

- **Quality**: Inspection Test Plans (`QualityITPScreen.js`, 12 lines,
  backend `quality-itp.routes.js`), Method Statements (`MethodStatementsScreen.js`,
  12 lines, backend likely under `quality.routes.js` — check), Material
  Inspection (`QualityMIRScreen.js`, 12 lines, backend `quality-mir.routes.js`),
  Quality Audits (`QualityAuditsScreen.js`, 13 lines, backend
  `quality-audit.routes.js`). There's also `quality-pour.routes.js` (pour
  requests) not currently in `moduleRegistry.js` at all — worth checking with
  the user whether that should be added as a new menu item.
- **HSE**: `HSEDashboardScreen.js` (238 lines) is solid. Incidents (13-line
  stub, backend `incident.routes.js`), Permits (13-line stub, backend
  `permit.routes.js`), PPE Tracker (13-line stub, backend `ppe.routes.js`).

Build pattern for all of these: real list (title/type, status, date,
project) + detail view. Incidents and Permits plausibly need a **create**
flow from mobile (site staff reporting an incident or requesting a permit is
a very mobile-native use case) — flag this to the user as worth prioritizing
within this track rather than doing all 7 screens as read-only-only.

### Track G — Assets & IT / Plant & Machinery / Hire & Rental / Subcontractors / Administration
Lower daily-use frequency, likely fine as read-only browse+detail for now
unless the user says otherwise.

- **IT Assets** — 13-line stub, backend `itAsset.routes.js`.
- **IT Tickets** — 14-line stub, backend: search for a dedicated IT ticket
  route (not found in the routes listing — may be a table under a more
  general route file; check `role-permissions.routes.js` area or search
  `it.tickets` / `it_tickets` in the backend). This one plausibly needs a
  **create** flow (raising a ticket is inherently something you'd do from
  your phone) — same reasoning as Incidents/Permits above.
- **Plant Register** — 13-line stub, backend `plant.routes.js`.
- **Hire & Rental** — 13-line stub, backend: search for a hire/rental route
  (not found directly in the routes listing under an obvious name — check
  `subcontractor-mgmt.routes.js` or a dedicated file, this may be misfiled).
- **Subcontractors** — 15-line stub, backend `subcontractor.routes.js`,
  `subcontractor-mgmt.routes.js`.
- **Users** — 15-line stub, backend `users.routes.js`, `role-permissions.routes.js`.
  This is an **admin-only** screen — building real functionality here means
  also building the same role-gating the web `UsersPage.jsx` has (don't let
  a non-admin edit roles). Low priority for a mobile app generally; consider
  leaving this one as a simple read-only directory rather than full CRUD.
- **Tenders** — 15-line stub + `TenderDetailScreen.js` (17 lines, thin).
  Backend `tender.routes.js`, `tender-mgmt.routes.js`.

### Track H — Reports Hub
`ReportsHubScreen.js` (54 lines) is a shared destination for "Reports" menu
items across Planning/Procurement/Stores/QS. Check what it currently shows —
if it's a generic list-of-report-links, decide with the user whether mobile
needs actual report rendering (charts/tables) or just deep-links back to the
web app for report viewing (the latter is a much smaller, more realistic
scope for a phone screen).

---

## Recommended execution order

1. Finish Track A (already scoped in detail in `MOBILE_PARITY_PLAN.md`) —
   it's the module set the user explicitly prioritized first.
2. Track F (Quality/HSE) — worst proportional gap (7 near-empty stub
   screens), and Incidents/Permits are strong create-from-mobile candidates.
3. Track B (HR & Self Service) — highest daily-use frequency for the average
   employee.
4. Track C/D (QS & Billing / Accounts) — used by a smaller group (QS/
   accounts staff) but each item is well-scoped (thicken existing thin
   detail screens, same pattern as Track A phases 4-7).
5. Track E (Planning) — ask the user whether Engineer Daily Log should jump
   the queue for a create flow, since it's a strong mobile-native use case.
6. Track G (Assets/IT/Plant/Subcontractors/Admin) — lowest daily-use
   frequency; Users/Administration should probably stay minimal/read-only
   given the role-security implications of building real admin CRUD on
   mobile.
7. Track H (Reports Hub) — needs a scope decision from the user (render
   reports natively vs. deep-link to web) before any building starts.

This is a large amount of work — probably 15-20+ individual screen-building
phases in total once Track A's 8 phases are included. Recommend tackling one
track (or even one phase within a track) per session rather than attempting
multiple tracks at once, so each piece gets the same verification rigor Gate
Pass got.
