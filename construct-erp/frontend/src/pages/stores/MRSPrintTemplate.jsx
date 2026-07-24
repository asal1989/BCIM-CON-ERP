// src/pages/stores/MRSPrintTemplate.jsx
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import dayjs from 'dayjs';

function getSigBox(stageId, data) {
  const map = {
    'stores-approve': { label: 'Store Manager',        name: data.stores_verified_name,   date: data.stores_approved_at,    badge: 'APPROVED',   done: !!data.stores_approved_at },
    'verify-tower':   { label: 'Tower / Incharge',     name: data.verified_tower_name,    date: data.verified_tower_mgr_at, badge: 'VERIFIED',   done: !!data.verified_tower_mgr_at },
    'approve-pm':     { label: 'Project Manager',      name: data.approved_pm_name,       date: data.approved_pm_at,        badge: 'APPROVED',   done: !!data.approved_pm_at },
    'approve-srpm':   { label: 'Sr. Project Manager',  name: data.approved_srpm_name,     date: data.approved_sr_pm_at,     badge: 'APPROVED',   done: !!data.approved_sr_pm_at },
    'approve-mgmt':   { label: 'Project Director',     name: data.approved_mgmt_name,     date: data.approved_mgmt_at,      badge: 'APPROVED',   done: !!data.approved_mgmt_at },
    'approve-md':     { label: 'Managing Director',    name: data.approved_md_name,       date: data.approved_md_at,        badge: 'AUTHORIZED', done: !!data.approved_md_at },
  };
  return map[stageId] || null;
}

const ALL_STAGE_IDS = ['stores-approve', 'approve-pm', 'approve-mgmt', 'approve-md'];

const fmtDate = (value, fallback = '-') => value ? dayjs(value).format('DD-MM-YYYY') : fallback;
const val = (value, fallback = '-') => value || fallback;
const qty = (item) => item?.quantity ?? item?.qty ?? '';
const material = (item) => item?.material_name || item?.material || item?.description || '';
const getPublicAppOrigin = () => {
  const configured =
    import.meta.env?.VITE_PUBLIC_APP_URL ||
    import.meta.env?.VITE_APP_URL ||
    import.meta.env?.VITE_APP_ORIGIN;

  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';

  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://bcim.ddns.net:3000';
  }

  return window.location.origin;
};

function InfoLine({ label, value }) {
  return (
    <div className="mrs-info-line">
      <span>{label}</span>
      <strong>{val(value)}</strong>
    </div>
  );
}

function ApprovalBox({ title, name, date, badge, done }) {
  return (
    <div className={`mrs-approval-box ${done ? 'is-done' : ''}`}>
      <div className="mrs-approval-title">{title}</div>
      <div className="mrs-sign-space" />
      <div className="mrs-approval-row"><span>Name</span><strong>{val(name)}</strong></div>
      <div className="mrs-approval-row"><span>Date</span><strong>{fmtDate(date)}</strong></div>
      <div className={`mrs-approval-badge ${done ? 'is-done' : ''}`}>{done ? badge : 'PENDING'}</div>
    </div>
  );
}

const MRSPrintTemplate = React.forwardRef(({ data }, ref) => {
  if (!data || !data.id) return <div ref={ref} style={{ padding: 40, textAlign: 'center' }}>Preparing document...</div>;

  const verificationUrl = `${getPublicAppOrigin()}/verify/mrs/${data.id}`;
  const items = data.items || [];
  const enabledStageIds = (data?.mrs_workflow?.stages || ALL_STAGE_IDS).filter(id => ALL_STAGE_IDS.includes(id));
  const printStageIds = enabledStageIds.length ? enabledStageIds : ALL_STAGE_IDS;
  const sigBoxes = printStageIds.map(id => getSigBox(id, data)).filter(Boolean);
  const rowCount = Math.max(items.length, items.length <= 12 ? 12 : items.length);

  return (
    <div ref={ref} className="mrs-print-doc">
      <style>{`
        @page {
          size: A4 landscape;
          margin: 8mm;
        }

        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            width: 100% !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .mrs-print-doc {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .mrs-sheet {
            width: 100% !important;
            min-height: 178mm !important;
          }
          /* Guard against global print CSS (Layout.jsx hides header/nav
             elements app-wide when printing) ever hiding the doc header. */
          .mrs-header {
            display: grid !important;
          }
        }

        .mrs-print-doc {
          width: 281mm;
          max-width: none;
          color: #111827;
          background: #fff;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          line-height: 1.25;
        }

        .mrs-sheet {
          border: 1.4px solid #111827;
          background: #fff;
          width: 100%;
        }

        .mrs-header {
          display: grid;
          grid-template-columns: 230px 1fr 300px;
          border-bottom: 1.4px solid #111827;
          min-height: 74px;
        }

        .mrs-logo-box,
        .mrs-title-box,
        .mrs-doc-box {
          padding: 8px 10px;
          display: flex;
          align-items: center;
        }

        .mrs-logo-box,
        .mrs-title-box {
          border-right: 1.4px solid #111827;
        }

        .mrs-logo-box img {
          width: 46px;
          height: 46px;
          object-fit: contain;
          margin-right: 10px;
        }

        .mrs-company {
          font-size: 15px;
          font-weight: 900;
          letter-spacing: .01em;
          line-height: 1.05;
          text-transform: uppercase;
        }

        .mrs-company-sub {
          margin-top: 4px;
          color: #111827;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .mrs-title-box {
          justify-content: center;
          text-align: center;
          flex-direction: column;
        }

        .mrs-title {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .mrs-subtitle {
          margin-top: 5px;
          padding: 3px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          color: #111827;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          background: #f8fafc;
        }

        .mrs-doc-box {
          gap: 8px;
          justify-content: space-between;
          align-items: stretch;
        }

        .mrs-doc-meta {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 7px;
          min-width: 0;
        }

        .mrs-doc-top-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 76px;
          gap: 10px;
          align-items: start;
        }

        .mrs-doc-field {
          min-width: 0;
        }

        .mrs-doc-label {
          display: block;
          color: #111827;
          font-weight: 800;
          text-transform: uppercase;
          font-size: 7.5px;
          letter-spacing: .06em;
          margin-bottom: 2px;
        }

        .mrs-doc-value {
          display: block;
          font-size: 9.5px;
          font-weight: 900;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .mrs-doc-value.nowrap {
          white-space: nowrap;
          overflow-wrap: normal;
        }

        .mrs-status-line {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .mrs-status-pill {
          padding: 3px 8px;
          border: 1px solid #bbf7d0;
          border-radius: 999px;
          color: #166534;
          background: #f0fdf4;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .mrs-doc-line {
          display: grid;
          grid-template-columns: 48px 1fr;
          gap: 4px;
          margin-bottom: 5px;
          font-size: 9px;
        }

        .mrs-doc-line span {
          color: #111827;
          font-weight: 800;
          text-transform: uppercase;
        }

        .mrs-doc-line strong {
          font-size: 10px;
          font-weight: 900;
        }

        .mrs-info-grid {
          display: grid;
          grid-template-columns: 1.35fr 1fr 1fr;
          border-bottom: 1.4px solid #111827;
        }

        .mrs-info-card {
          padding: 8px 10px;
          min-height: 82px;
          border-right: 1.4px solid #111827;
        }

        .mrs-info-card:last-child {
          border-right: 0;
        }

        .mrs-section-label {
          margin-bottom: 6px;
          color: #1e3a8a;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .1em;
          text-transform: uppercase;
        }

        .mrs-info-line {
          display: grid;
          grid-template-columns: 96px 1fr;
          gap: 8px;
          margin-bottom: 4px;
        }

        .mrs-info-line span {
          color: #111827;
          font-weight: 800;
        }

        .mrs-info-line strong {
          color: #0f172a;
          font-weight: 800;
        }

        .mrs-items {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 9px;
        }

        .mrs-items thead {
          display: table-header-group;
        }

        .mrs-items th {
          background: #1e3a8a;
          color: #fff;
          padding: 6px 5px;
          border-right: 1px solid #0f172a;
          border-bottom: 1.4px solid #111827;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .04em;
          text-transform: uppercase;
          text-align: center;
        }

        .mrs-items th:last-child,
        .mrs-items td:last-child {
          border-right: 0;
        }

        .mrs-items td {
          padding: 5px 6px;
          border-right: 1px solid #cbd5e1;
          border-bottom: 1px solid #cbd5e1;
          vertical-align: top;
          min-height: 22px;
        }

        .mrs-items tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .mrs-items tbody tr:nth-child(even) td {
          background: #f8fafc;
        }

        .mrs-num,
        .mrs-unit,
        .mrs-qty,
        .mrs-date {
          text-align: center;
          font-weight: 800;
        }

        .mrs-desc {
          font-weight: 800;
          color: #111827;
        }

        .mrs-muted {
          color: #374151;
          font-weight: 700;
        }

        .mrs-footer {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .mrs-purchase {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          padding: 8px 10px;
          border-top: 1.4px solid #111827;
          background: #f8fafc;
        }

        .mrs-purchase-title {
          margin-bottom: 6px;
          font-size: 8px;
          font-weight: 900;
          color: #1e3a8a;
          letter-spacing: .1em;
          text-transform: uppercase;
        }

        .mrs-write-line {
          display: grid;
          grid-template-columns: 132px 1fr;
          gap: 8px;
          margin-top: 5px;
          font-size: 9px;
          font-weight: 800;
        }

        .mrs-write-line div:last-child {
          border-bottom: 1px solid #94a3b8;
          min-height: 13px;
        }

        .mrs-approval-grid {
          display: grid;
          border-top: 1.4px solid #111827;
        }

        .mrs-approval-box {
          min-height: 92px;
          padding: 6px;
          border-right: 1px solid #cbd5e1;
          background: #fff;
        }

        .mrs-approval-box:last-child {
          border-right: 0;
        }

        .mrs-approval-box.is-done {
          background: #f0fdf4;
        }

        .mrs-approval-title {
          min-height: 22px;
          color: #0f172a;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          text-align: center;
        }

        .mrs-sign-space {
          height: 20px;
          margin: 4px 0 5px;
          border-bottom: 1px dashed #94a3b8;
        }

        .mrs-approval-row {
          display: grid;
          grid-template-columns: 30px 1fr;
          gap: 4px;
          margin-bottom: 3px;
          font-size: 8px;
        }

        .mrs-approval-row span {
          color: #374151;
          font-weight: 900;
          text-transform: uppercase;
        }

        .mrs-approval-row strong {
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .mrs-approval-badge {
          margin-top: 5px;
          padding: 2px 4px;
          border: 1px solid #cbd5e1;
          color: #374151;
          border-radius: 4px;
          text-align: center;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .08em;
        }

        .mrs-approval-badge.is-done {
          border-color: #86efac;
          color: #166534;
          background: #dcfce7;
        }

        .mrs-workflow-note {
          padding: 5px 8px;
          color: #374151;
          border-top: 1px solid #cbd5e1;
          font-size: 8px;
          font-weight: 700;
          text-align: right;
        }
      `}</style>

      <div className="mrs-sheet">
        {/* Deliberately a <div>, not <header>: Layout.jsx's global print CSS
            hides every semantic <header> element (to remove app chrome when
            printing), which deleted this whole block — logo, MRS No, QR —
            from printed output. */}
        <div className="mrs-header">
          <div className="mrs-logo-box">
            <img src="/bcim-logo.png" alt="BCIM" />
            <div>
              <div className="mrs-company">BCIM Engineering</div>
              <div className="mrs-company-sub">Private Limited</div>
            </div>
          </div>

          <div className="mrs-title-box">
            <div className="mrs-title">Material / Service Requisition</div>
            <div className="mrs-subtitle">Stores controlled document</div>
          </div>

          <div className="mrs-doc-box">
            <div className="mrs-doc-meta">
              <div className="mrs-doc-top-row">
                <div className="mrs-doc-field">
                  <span className="mrs-doc-label">MRS No</span>
                  <strong className="mrs-doc-value">{val(data.serial_no_formatted || data.mrs_number)}</strong>
                </div>
                <div className="mrs-doc-field">
                  <span className="mrs-doc-label">Date</span>
                  <strong className="mrs-doc-value nowrap">{fmtDate(data.created_at)}</strong>
                </div>
              </div>
              <div className="mrs-status-line">
                <span className="mrs-doc-label">Status</span>
                <strong className="mrs-status-pill">{String(data.status || 'pending').replaceAll('_', ' ')}</strong>
              </div>
            </div>
            <QRCodeSVG value={verificationUrl} size={48} />
          </div>
        </div>

        <section className="mrs-info-grid">
          <div className="mrs-info-card">
            <div className="mrs-section-label">Project Details</div>
            <InfoLine label="Project" value={data.project_name} />
            <InfoLine label="Project Code" value={data.project_code} />
            <InfoLine label="Department" value={data.department || 'Projects'} />
            <InfoLine label="Site Incharge" value={data.site_incharge} />
          </div>
          <div className="mrs-info-card">
            <div className="mrs-section-label">Request Details</div>
            <InfoLine label="Raised By" value={data.raised_by_name} />
            <InfoLine label="Required By" value={fmtDate(data.required_by)} />
            <InfoLine label="Priority" value={String(data.priority || 'normal').toUpperCase()} />
            <InfoLine label="Items" value={items.length} />
          </div>
          <div className="mrs-info-card">
            <div className="mrs-section-label">Purchase Tracking</div>
            <InfoLine label="Received Date" value={fmtDate(data.purchase_received_date)} />
            <InfoLine label="PO No. / Date" value={data.po_no_date} />
            <InfoLine label="Expected Delivery" value={fmtDate(data.expected_delivery_date)} />
            <InfoLine label="Processed By" value={data.processed_by_name} />
          </div>
        </section>

        <table className="mrs-items">
          <colgroup>
            <col style={{ width: 30 }} />
            <col style={{ width: 64 }} />
            <col />
            <col style={{ width: 80 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 48 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Sl</th>
              <th>Item Code</th>
              <th>Description</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Required</th>
              <th>Vendor / Supplier</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(rowCount)].map((_, i) => {
              const item = items[i];
              return (
                <tr key={i}>
                  <td className="mrs-num">{item ? i + 1 : ''}</td>
                  <td className="mrs-muted">{item?.item_code || ''}</td>
                  <td className="mrs-desc">{item ? material(item) : ''}</td>
                  <td style={{ fontWeight: 700 }}>{item?.category || ''}</td>
                  <td className="mrs-unit">{item?.unit || ''}</td>
                  <td className="mrs-qty">{qty(item)}</td>
                  <td className="mrs-date">{item ? fmtDate(item.required_date || item.date_required, '') : ''}</td>
                  <td>{item?.preferred_vendor_name || item?.vendor || ''}</td>
                  <td>{item?.purpose || item?.remarks || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <footer className="mrs-footer">
          <section className="mrs-purchase">
            <div>
              <div className="mrs-purchase-title">For use of purchase / stores department</div>
              <div className="mrs-write-line"><div>Received Date</div><div>{fmtDate(data.purchase_received_date, '')}</div></div>
              <div className="mrs-write-line"><div>Purchase Order No. / Date</div><div>{data.po_no_date || ''}</div></div>
            </div>
            <div>
              <div className="mrs-purchase-title">Processing details</div>
              <div className="mrs-write-line"><div>Processed By / Date</div><div>{data.processed_by_name || ''} {data.processed_at ? `- ${fmtDate(data.processed_at)}` : ''}</div></div>
              <div className="mrs-write-line"><div>Expected Delivery Date</div><div>{fmtDate(data.expected_delivery_date, '')}</div></div>
            </div>
          </section>

          <section
            className="mrs-approval-grid"
            style={{ gridTemplateColumns: `repeat(${Math.max(sigBoxes.length + 1, 4)}, minmax(0, 1fr))` }}
          >
            <ApprovalBox
              title="Requested By"
              name={data.raised_by_name}
              date={data.created_at}
              badge="SUBMITTED"
              done
            />
            {sigBoxes.map((box, idx) => (
              <ApprovalBox
                key={`${box.label}-${idx}`}
                title={box.label}
                name={box.name}
                date={box.date}
                badge={box.badge}
                done={box.done}
              />
            ))}
          </section>

          {data.mrs_workflow?.stages && (
            <div className="mrs-workflow-note">
              Approval workflow: {sigBoxes.map(b => b.label).join(' / ')}
            </div>
          )}
        </footer>
      </div>
    </div>
  );
});

export default MRSPrintTemplate;
