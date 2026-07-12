# Android App — Full Parity Plan (All Modules, Numbered Phases)

Single linear roadmap merging `MOBILE_PARITY_PLAN.md` (Stores/Procurement/
Bill Tracker detail) and `ANDROID_APP_MASTER_PLAN.md` (everything else) into
one ordered phase list. Work top to bottom unless the user redirects
priority. Do **one phase per session/commit** — don't batch multiple phases
into a single unreviewed push.

## Before starting any phase

1. **Read the reference implementation** — Gate Pass (Stores module, done in
   commit `444ad2d1`) is the pattern for every phase below:
   - `src/screens/GatePassScreen.js` (list + FAB)
   - `src/screens/CreateGatePassScreen.js` (form + dynamic item rows)
   - `src/screens/GatePassDetailScreen.js` (detail + `MetaRow` + status-gated
     action buttons)
2. **Read the actual backend route handler before writing a screen against
   it.** This plan gives route file names, not full schemas — response
   shapes vary (`{ data: {...} }` wrapping, field names, etc.).
3. **Match existing conventions**: `theme.js` tokens only (never hardcode
   colors), reuse `Card`/`Button`/`ScreenHeader`/`StatusBadge`/`FAB`/
   `EmptyState`/`ErrorState`/`ListSkeleton`, `Alert.alert` for confirmations,
   `useMutation` + `queryClient.invalidateQueries(...)` for every write.
4. **Gate actions by role** the same way the backend does (`authorize(...)`
   in the route file) — check `useAuth()`'s `user.role` client-side too.
5. **Verify with Babel** (no device/emulator guaranteed available):
   ```bash
   node -e "require('@babel/core').transformFileSync('PATH', { presets: [require.resolve('babel-preset-expo')], filename: 'PATH' })"
   ```
   If a real device/emulator is available, actually run and click through.
6. **Register new screens** in `src/navigation/RootNavigator.js`, check for
   name collisions:
   `grep -oE 'Stack\.Screen name="[A-Za-z]+"' src/navigation/RootNavigator.js | sort | uniq -d`
7. **Commit with a clear before/after message** (see `444ad2d1` style), push
   to main (mobile app changes don't auto-deploy anywhere, so pushing is
   safe — no live-site risk).

---

## ✅ Phase 0 — Gate Pass (Stores) — DONE

Commit `444ad2d1`. Was a 13-line read-only stub; now has full list, create
form, and detail view with return/close/cancel actions.

---

## Phase 1 — Store Ledger (Stores)

Stub (12 lines). Backend: `GET /inventory/ledger` in
`backend/src/routes/inventory.routes.js:386` — read this handler for exact
params/shape (don't reuse the plain `/inventory` list endpoint the stub
currently calls). Likely read-only (a ledger is a report) — check the web
equivalent `frontend/src/pages/stores/StoreLedgerPage.jsx` for which
filters/columns matter (item, date range, running balance) and whether any
write action exists there at all.

## Phase 2 — Vendor Payments (Procurement)

Stub (13 lines). Backend: `backend/src/routes/payment.routes.js` — `GET /`
(list), `POST /` (create, restricted to `super_admin`/`admin`/`accountant`),
`DELETE /:id`, `GET /tds-report`. Build: real list (vendor, amount, date,
mode, status) + FAB gated to the allowed roles + detail screen + create form.

## Phase 3 — Store Petty Cash (Stores) — scope carefully

Stub (13 lines). Backend `backend/src/routes/stores-petty-cash.routes.js`
has **40+ endpoints** (accounts, custodians, categories, request→approve→
issue workflow, expenses with their own submit→approve flow, settlements,
transfers, adjustments, 6+ report endpoints) — do not attempt full parity in
one phase. Scope this phase to the **core loop only**:
- View my custodian balance (`GET /custodians`, filtered to self)
- List my expenses (`GET /expenses`)
- Submit an expense (`POST /expenses`, `POST /expenses/:id/submit`)
- If the user has an approver role: `GET /approvals/pending` +
  `POST /expenses/:id/approve`

Explicitly **defer** account/custodian/category admin CRUD, settlements,
transfers, adjustments, and all report screens to a later phase — note this
scoping decision back to the user when the phase is done.

## Phase 4 — Purchase Order detail (Procurement)

List (74 lines) is fine; `PODetailScreen.js` is thin (24 lines). Backend
`backend/src/routes/po.routes.js`: `GET /:id`, `GET /:id/bills` (linked
bills), `PATCH /:id/reject`, `PATCH /:id/:stage` (stage-based approval —
read carefully), `POST /:id/send-to-vendor`, `GET /:id/amendment-context` +
`POST /:id/amend` (bigger sub-feature, build only if time allows after the
core view/approve/reject flow works). Check `PROCUREMENT_ROLES` in the file
for who can act.

## Phase 5 — Work Order detail (Procurement/Subcontractors)

List (73 lines) is fine; `WorkOrderDetailScreen.js` is thin (23 lines).
Backend `backend/src/routes/sc.routes.js`: `GET /work-orders/:id`,
`PATCH /work-orders/:id/approve` (gated to `ADMIN`/`project_manager`),
`PATCH /work-orders/:id/close` (gated to `ADMIN`/`project_manager`/
`qs_engineer`), `GET /work-orders/:id/final-account` (lower priority,
nice-to-have).

## Phase 6 — IGN detail (Stores)

List (71 lines) + `CreateIGNScreen.js` (143 lines) already work;
`IGNDetailScreen.js` is thin (27 lines). Backend
`backend/src/routes/ign.routes.js`: `GET /:id`, `PATCH /:id/receive`,
`PATCH /:id/inspect`, `PATCH /:id/approve`, `PATCH /:id/cancel`. Build a
sequential receive → inspect → approve action flow — only show the next
valid action for the current status. Check `STORES_WRITE` role list.

## Phase 7 — MRS detail (Stores)

List (71 lines, has FAB → Create) is fine; `MRSDetailScreen.js` is thin (25
lines). Backend `backend/src/routes/mrs.routes.js`: `GET /:id`,
`PATCH /:id/reject`, `PATCH /:id/:stage` (same stage-based pattern as PO),
`PATCH /:id/cancel-items`.

## Phase 8 — Bills detail verification (Bill Tracker)

`BillsScreen.js` (362 lines) is already the most built-out screen besides
dashboards; `BillDetailScreen.js` is only 16 lines though — check it first.
If genuinely thin, thicken the same way as Phases 4-7 (backend: wherever
mobile `billsAPI` actually points — `GET /tqs/bills/:id` per
`api/client.js`, check `tqs-bills.routes.js` or equivalent). If the list
already covers what users need, this phase may need little to no work —
don't force changes where the module is already solid.

## Phase 9 — Quality: Inspection Test Plans

Stub (12 lines). Backend: `backend/src/routes/quality-itp.routes.js`. Build
real list + detail; check web `frontend/src/pages/quality/*ITP*` for whether
a create flow matters on mobile.

## Phase 10 — Quality: Material Inspection (MIR)

Stub (12 lines). Backend: `backend/src/routes/quality-mir.routes.js`.

## Phase 11 — Quality: Method Statements

Stub (12 lines). Backend: likely under `backend/src/routes/quality.routes.js`
— confirm exact route file before building (wasn't a dedicated
`method-statement.routes.js` file found; search for the model name).

## Phase 12 — Quality: Quality Audits

Stub (13 lines). Backend: `backend/src/routes/quality-audit.routes.js`.
Note: `backend/src/routes/quality-pour.routes.js` (pour requests) exists but
isn't in `moduleRegistry.js` at all — ask the user whether it should be
added as a new menu item while working this track.

## Phase 13 — HSE: Incidents (create-flow candidate)

Stub (13 lines). Backend: `backend/src/routes/incident.routes.js`. Reporting
an incident from the field is a strong mobile-native use case — prioritize
building a **create form**, not just list/detail, for this one.

## Phase 14 — HSE: Permits (create-flow candidate)

Stub (13 lines). Backend: `backend/src/routes/permit.routes.js`. Same
reasoning as Incidents — a create flow is likely more valuable here than on
most other stub screens.

## Phase 15 — HSE: PPE Tracker

Stub (13 lines). Backend: `backend/src/routes/ppe.routes.js`.

## Phase 16 — Employee Directory (HR)

Stub (15 lines). Backend: `backend/src/routes/hr-employees.routes.js`. Build
a real searchable list (name, designation, department, contact) + detail.
**Scope decision needed from the user**: does the mobile detail view need
the same document/lifecycle tabs as web's `EmployeeDetailPage.jsx`, or is
contact-info-only sufficient? This touches other employees' data — treat it
as a privacy-sensitive scope call, not a default "build everything" case.

## Phase 17 — Payroll (HR) — verify before rebuilding

`PayrollScreen.js` is a 14-line stub, but `CurrentSalaryScreen.js` (107
lines) and `PayslipDetailScreen.js` (115 lines) already exist and look
solid. Check whether the stub is actually load-bearing or if the two solid
screens already carry the real functionality — don't rebuild something
that's already covered elsewhere under a different screen name.

## Phase 18 — Performance (HR)

Stub (15 lines). Backend: `backend/src/routes/hr-appraisals.routes.js`,
`hr-evaluations.routes.js`. Build: list of appraisals/reviews + detail.

## Phase 19 — Assets (Self Service)

`AssetsScreen.js` (65 lines, functional) + `AssetDetailScreen.js` (19 lines,
thin). Backend: `asset.routes.js`, `asset-mgmt.routes.js`,
`hr-employee-assets.routes.js`. **Check which endpoint "Self Service →
Assets" should actually hit** — employee-assigned assets specifically
(`hr-employee-assets.routes.js`) vs. the general asset register, since the
web app may split these differently than mobile currently does.

## Phase 20 — Documents (Self Service / DMS)

Moderate (59 lines). Backend: `documents.routes.js`, `dms.routes.js`. If
building download/preview support, note `expo-file-system` /
`expo-sharing` aren't yet dependencies — add them if needed.

## Phase 21 — RA Bills detail (QS & Billing)

List (75 lines) is fine; `RABillDetailScreen.js` is thin (19 lines).
Backend: `backend/src/routes/raBill.routes.js`. Thicken with line items and
approval status/actions.

## Phase 22 — Variations detail (QS & Billing)

List (74 lines) is fine; `VariationDetailScreen.js` is thin (23 lines).
Backend: `variation.routes.js`, `variation-statement.routes.js`.

## Phase 23 — Measurement Book (QS & Billing)

Stub (13 lines). Backend: `backend/src/routes/measurement.routes.js`.
Likely read/reference data — verify against web usage before assuming a
create flow is needed.

## Phase 24 — BOQ (QS & Billing) — scope decision needed

Moderate (92 lines), list-level only. Backend: `boq.routes.js`. Web BOQ
editing is a heavy spreadsheet-like UI — **ask the user** whether mobile
needs actual BOQ editing or if read-only browse is sufficient before
building anything beyond viewing.

## Phase 25 — Invoices detail (Accounts)

List (75 lines) is fine; `InvoiceDetailScreen.js` is thin (19 lines).
Backend: `invoice.routes.js`, `recurring-invoices.routes.js`. Thicken with
line items and GST breakdown.

## Phase 26 — Bank Accounts (Accounts)

Stub (13 lines). Backend: `backend/src/routes/bank-accounts.routes.js`.
Build real list + detail (account number, balance, linked transactions).
**Ask the user** whether any create/edit belongs on mobile or should stay
web/admin-only.

## Phase 27 — TDS (Accounts)

Stub (13 lines). Backend: `backend/src/routes/tds.routes.js`.

## Phase 28 — GST (Accounts) — verify current state

Moderate (70 lines) already. Confirm the backend route it's actually using
(GST fields may be embedded in `invoice.routes.js` rather than a standalone
GST route) before assuming more work is needed.

## Phase 29 — Chart of Accounts / Profit & Loss (Accounts) — likely low priority

Both moderate (77 / 85 lines) and read-only-report in nature; probably fine
as-is. Only revisit if the user specifically flags a gap.

## Phase 30 — Schedule & Activities (Planning)

Stub (13 lines). Backend: `planning.routes.js`, `planning-p6.routes.js`.
If this is Primavera P6-integrated data, mobile is very likely read-only
browse, not an editing surface — confirm before building any write actions.

## Phase 31 — Milestones (Planning)

Stub (13 lines). Same backend area as Phase 30.

## Phase 32 — Look-Ahead Plan (Planning)

Stub (13 lines). Same backend area.

## Phase 33 — Engineer Daily Log (Planning) — create-flow candidate

Stub (12 lines). Backend: `backend/src/routes/engineer-log.routes.js`. A
daily log is filled in from site — arguably as strong a create-from-mobile
candidate as Incidents/Permits (Phases 13-14). **Ask the user** if this
should be reprioritized earlier in the sequence.

## Phase 34 — Tenders detail (Tender Management)

List (15 lines, thin) + `TenderDetailScreen.js` (17 lines, thin). Backend:
`tender.routes.js`, `tender-mgmt.routes.js`.

## Phase 35 — IT Tickets (Assets & IT) — create-flow candidate

Stub (14 lines). Backend: search for the actual IT ticket route file (not
found under an obvious name in the routes listing — check for an
`it-ticket` model or search the codebase for `it_tickets` table references
before assuming which file owns it). Raising a ticket from your phone is a
strong mobile-native use case — prioritize a create form here too.

## Phase 36 — IT Assets (Assets & IT)

Stub (13 lines). Backend: `backend/src/routes/itAsset.routes.js`.

## Phase 37 — Plant Register (Plant & Machinery)

Stub (13 lines). Backend: `backend/src/routes/plant.routes.js`.

## Phase 38 — Hire & Rental

Stub (13 lines). Backend route not confirmed in the initial survey — search
the backend for the actual hire/rental model/route file before starting
(may be misfiled under `subcontractor-mgmt.routes.js` or a separate file not
yet located).

## Phase 39 — Subcontractors

Stub (15 lines). Backend: `subcontractor.routes.js`,
`subcontractor-mgmt.routes.js`.

## Phase 40 — Users (Administration) — keep minimal, security-sensitive

Stub (15 lines). Backend: `users.routes.js`, `role-permissions.routes.js`.
This is admin-only and touches role/permission data — building real CRUD
here means replicating the same access controls as web's `UsersPage.jsx`.
**Recommend leaving this as a simple read-only directory** rather than full
CRUD, unless the user explicitly asks for mobile user management.

## Phase 41 — Reports Hub — scope decision needed before starting

`ReportsHubScreen.js` (54 lines) is a shared destination for "Reports" menu
items across Planning/Procurement/Stores/QS. **Ask the user**: does mobile
need actual report rendering (charts/tables), or should this just deep-link
back to the web app for report viewing? The latter is far more realistic for
a phone screen and is probably the right default absent a specific request.

## Phase 42 — Projects list (Overview)

Stub (13 lines). Backend: `projects.routes.js` equivalent used by
`projectsAPI`/`projectAPI` already in `api/client.js`. Build a real list +
detail (most users only interact with this via `ProjectSelectScreen.js`
already, so check whether this menu item is even meaningfully different from
that flow before investing effort — may be low-value to rebuild).

---

## Notes on pacing

This is 40+ phases in total. Realistically: **one phase per session**,
verified with Babel parsing (and a real device/emulator run whenever one is
available), committed and pushed individually. Don't attempt to batch
multiple phases into one pass — the value of this plan is that each phase is
small enough to execute and verify with confidence; collapsing several
together reintroduces the same "half-built, unverified" risk this whole
effort is trying to fix.

Several phases explicitly call out a scope decision that needs the user's
input before building (BOQ editing depth, Reports Hub rendering vs.
deep-link, Employee Directory privacy scope, Bank Accounts write access,
Users CRUD). Surface those questions rather than guessing when you reach
them.
