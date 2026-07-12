# Mobile App — Stores / Procurement / Bill Tracker Parity Plan

## Context

`mobile-app/` is a real Expo/React Native app (~30 screens covering most ERP
modules), not a prototype. Roughly half its screens are fully custom-built
with real functionality; the other half are auto-generated via a shared
`src/screens/generic/makeListScreen.js` factory — a **read-only** list view
with no search, no filters, no create/edit actions, no pull-to-refresh. The
user flagged this as "half build, menus not working properly" and asked to
bring **Stores, Procurement, and Bill Tracker** to full web feature parity
with a modern UI.

**Gate Pass (Stores) is already done** (commit `444ad2d1`) — use it as the
reference pattern for every phase below: a custom list screen with a FAB, a
create form screen, and a detail screen with status-gated action buttons
(`Button` component, `useMutation` + `Alert.alert` confirm dialogs, cache
invalidation via `queryClient.invalidateQueries`).

Read these 3 files first to internalize the conventions before writing any
new screen:
- `src/screens/GatePassScreen.js` (list + FAB pattern)
- `src/screens/CreateGatePassScreen.js` (form + dynamic item rows pattern)
- `src/screens/GatePassDetailScreen.js` (detail + MetaRow + status actions pattern)
- `src/screens/GRSDetailScreen.js` (an older but equally good detail-screen example)

**Verification note:** there is no device/emulator available in a plain chat
session — every previous phase was verified only by Babel-parsing each file
with the project's own `babel-preset-expo` (catches syntax errors, not
runtime bugs) via:
```bash
node -e "require('@babel/core').transformFileSync('PATH', { presets: [require.resolve('babel-preset-expo')], filename: 'PATH' })"
```
Do this for every new/changed file. If a real emulator/device becomes
available, actually run the app and click through — don't skip that step if
you have the means to do it.

After each phase: update `src/navigation/RootNavigator.js` (import + register
new `Stack.Screen` entries — check for name collisions with
`grep -oE 'Stack\.Screen name="[A-Za-z]+"' src/navigation/RootNavigator.js | sort | uniq -d`),
commit, and push (per this repo's standing instruction: always push to main,
Railway/EAS doesn't auto-deploy mobile builds so no live-site risk from
pushing mobile-app changes).

---

## Phase 1 — Store Ledger (Stores)

**Current state:** `StoreLedgerScreen.js` is a 12-line generic stub calling
`storeLedgerAPI.list()` → `GET /inventory`.

**Backend reality:** there's a dedicated ledger endpoint that's better suited
here: `GET /inventory/ledger` (see `backend/src/routes/inventory.routes.js:386`).
Read that route handler to get its exact query params and response shape
before building — don't assume it matches `/inventory`'s shape.

**Build:**
- `StoreLedgerScreen.js` — real list using `GET /inventory/ledger`, showing
  item name, in/out quantity, running balance, date — likely needs a
  date-range or item filter given it's a ledger (check the web equivalent,
  `frontend/src/pages/stores/StoreLedgerPage.jsx`, for what filters/columns
  it exposes, and mirror the important ones)
- This is probably read-heavy (a ledger is a report, not usually something
  you create/edit from mobile) — likely no create screen needed, just a good
  list/detail view. Confirm by checking if the web page has any write actions.

---

## Phase 2 — Vendor Payments (Procurement)

**Current state:** `VendorPaymentsScreen.js` is a 13-line generic stub.

**Backend:** `backend/src/routes/payment.routes.js` — `GET /` (list),
`POST /` (create, `authorize('super_admin','admin','accountant')` — so the
create action should probably be hidden/disabled for other roles on mobile
too, check `useAuth()`'s user role), `DELETE /:id`, `GET /tds-report`.

**Build:**
- `VendorPaymentsScreen.js` — real list (vendor name, amount, date, mode,
  status) with a FAB → create, gated by role like the backend gates it
- `VendorPaymentDetailScreen.js` — full record view
- `CreatePaymentScreen.js` — form (read `POST /` handler for exact required
  fields — likely vendor_id/po_id linkage, amount, mode, date, reference)

---

## Phase 3 — Store Petty Cash (Stores) — SCOPE CAREFULLY

**Current state:** `PettyCashScreen.js` is a 13-line generic stub.

**⚠️ This is not a small module.** The backend
(`backend/src/routes/stores-petty-cash.routes.js`) has 40+ endpoints:
accounts, custodians, categories, a request→approve→issue workflow, expenses
with their own submit→approve flow, settlements, transfers, adjustments, and
6+ report endpoints. Building full parity here in one pass is unrealistic.

**Recommended scope for this phase — the core day-to-day loop only:**
- View my custodian account balance (`GET /custodians`, filtered to self)
- List my expenses (`GET /expenses`)
- Submit a new expense (`POST /expenses`, `POST /expenses/:id/submit`)
- If the logged-in user has an approver role: see pending approvals
  (`GET /approvals/pending`) and approve/reject
  (`POST /expenses/:id/approve`)

**Explicitly defer to a later phase** (don't build these unless asked):
accounts/custodian/category admin CRUD, settlements, transfers, adjustments,
all report screens. Note this scoping decision back to the user when this
phase is done so they can confirm or redirect.

---

## Phase 4 — Purchase Order detail (Procurement)

**Current state:** `PurchaseOrdersScreen.js` (74 lines, functional list) is
fine. `PODetailScreen.js` is only 24 lines — likely just header fields, no
line items, no status actions.

**Backend:** `backend/src/routes/po.routes.js` — `GET /:id`,
`GET /:id/amendment-context`, `POST /:id/amend`, `PATCH /:id` (update),
`GET /:id/bills` (linked bills), `PATCH /:id/reject`, `PATCH /:id/:stage`
(stage-based approval — read this handler carefully, it's the approval
workflow), `POST /:id/send-to-vendor`.

**Build:**
- Thicken `PODetailScreen.js`: line items, vendor info, linked bills
  (`GET /:id/bills`), and the stage-based approve/reject actions
  (`PATCH /:id/:stage`, `PATCH /:id/reject`) gated by role — check
  `PROCUREMENT_ROLES` in the backend file for which roles can act
- Amendment flow (`POST /:id/amend`) is a bigger sub-feature — build only if
  time allows after the core approve/reject/view flow works

---

## Phase 5 — Work Order detail (Procurement / Subcontractors)

**Current state:** `WorkOrdersScreen.js` (73 lines) is fine.
`WorkOrderDetailScreen.js` is only 23 lines.

**Backend:** `backend/src/routes/sc.routes.js` — `GET /work-orders/:id`,
`PATCH /work-orders/:id/approve`, `PATCH /work-orders/:id/close`,
`GET /work-orders/:id/final-account`.

**Build:**
- Thicken `WorkOrderDetailScreen.js`: full header + scope/value details,
  approve action (`PATCH /work-orders/:id/approve`, gated to
  `ADMIN`/`project_manager` roles per the backend), close action
  (`PATCH /work-orders/:id/close`, gated to `ADMIN`/`project_manager`/
  `qs_engineer`)
- Final account view (`GET /work-orders/:id/final-account`) — a nice-to-have,
  lower priority than the approve/close actions

---

## Phase 6 — IGN detail (Stores)

**Current state:** `IGNScreen.js` (71 lines) is fine, has a working
`CreateIGNScreen.js` (need to verify size/completeness — check it before
assuming it's done). `IGNDetailScreen.js` is only 27 lines.

**Backend:** `backend/src/routes/ign.routes.js` — `GET /:id`,
`PATCH /:id/receive`, `PATCH /:id/inspect`, `PATCH /:id/approve`,
`PATCH /:id/cancel`.

**Build:**
- Thicken `IGNDetailScreen.js`: item list, linked PO info, and the
  receive → inspect → approve status pipeline as sequential action buttons
  (only show the next valid action for the current status — check
  `STORES_WRITE` role list in the backend file for who can act)

---

## Phase 7 — MRS detail (Stores)

**Current state:** `MaterialRequestScreen.js` (71 lines, has FAB → Create) is
fine. `MRSDetailScreen.js` is only 25 lines.

**Backend:** `backend/src/routes/mrs.routes.js` — `GET /:id`,
`PATCH /:id/reject`, `PATCH /:id/:stage` (stage-based approval, same pattern
as PO), `PATCH /:id/cancel-items`.

**Build:**
- Thicken `MRSDetailScreen.js`: item list with quantities/status per line,
  stage-based approve/reject actions

---

## Phase 8 — Bills (Bill Tracker) — verify, don't rebuild

**Current state:** `BillsScreen.js` is already 362 lines — the most built-out
screen in the app besides the dashboards. `BillDetailScreen.js` is only 16
lines though, worth a look.

**Action:** Read `BillDetailScreen.js` first. If it's genuinely thin, thicken
it the same way as Phases 4-7 (check `backend/src/routes/tqs-bills.routes.js`
or wherever the mobile `billsAPI` actually points — `GET /tqs/bills/:id` per
`api/client.js`). If `BillsScreen.js`'s list already covers what users need
and the detail screen is adequate for viewing, this phase may need little to
no work — don't force changes where the module is already solid.

---

## General reminders for whoever picks this up

- Match the existing visual conventions exactly: `theme.js` tokens (never
  hardcode colors), `Card`/`Button`/`ScreenHeader`/`StatusBadge`/`FAB`
  components (don't recreate them), `Alert.alert` for confirmations,
  `useMutation` + `queryClient.invalidateQueries` for all writes.
- Always check the **actual backend route handler** for request/response
  shape before writing a screen against it — don't guess field names from the
  route path alone (this plan lists route locations, not full schemas, on
  purpose — several have `data: {...}` wrapping that varies).
- Gate any destructive or approval action behind the same role checks the
  backend enforces (`authorize(...)` calls) — check `useAuth()`'s `user.role`
  client-side too, even though the backend is the real enforcement point,
  so users don't see buttons they can't actually use.
- Babel-parse every file before considering a phase done (see command above).
- One phase per commit, with a clear commit message describing what was thin
  before and what's now built — matches the Gate Pass commit style.
