// src/pages/common/DocumentVerificationPage.jsx — Generic QR verification page
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import dayjs from 'dayjs';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const DOC_TYPES = {
  wo:           { label: 'Work Order',                  endpoint: '/subcontractors/public/verify',     numberField: 'wo_number',       dateField: 'start_date',  vendorField: 'contractor_name',  projectField: 'project_name', statusApproved: ['approved','active','in_progress','completed'] },
  grs:          { label: 'Goods Receipt (Security)',     endpoint: '/grs/public/verify',                numberField: 'grs_number',      dateField: 'date_time',   vendorField: null,               projectField: 'project_name', statusApproved: ['acknowledged'] },
  gatepass:     { label: 'Gate Pass',                    endpoint: '/gate-passes/public/verify',        numberField: 'gp_number',       dateField: 'date_time',   vendorField: 'issued_to',        projectField: 'project_name', statusApproved: ['open','returned','closed'] },
  ign:          { label: 'Inward Goods Note',            endpoint: '/ign/public/verify',                numberField: 'ign_number',      dateField: 'date_time',   vendorField: 'supplier_name',    projectField: 'project_name', statusApproved: ['gate_received','pending','inspected','approved'] },
  'ra-bill':    { label: 'RA Bill (Client Billing)',     endpoint: '/ra-bills/public/verify',           numberField: 'bill_number',     dateField: 'bill_date',   vendorField: 'contractor_name',  projectField: 'project_name', statusApproved: ['submitted','approved','certified','paid'] },
  'payment-cert':{ label: 'TQS Payment Certificate',    endpoint: '/tqs/bills/public/verify',          numberField: 'sl_number',       dateField: 'inv_date',    vendorField: 'vendor_name',      projectField: 'project_name', statusApproved: ['approved','paid','part_paid'] },
  eway:         { label: 'E-Way Bill',                   endpoint: '/eway-bills/public/verify',         numberField: 'ewb_no',          dateField: 'ewb_date',    vendorField: 'to_name',          projectField: 'project_name', statusApproved: ['active','completed'] },
  dpr:          { label: 'Daily Progress Report',        endpoint: '/dpr/public/verify',                numberField: 'dpr_number',      dateField: 'report_date', vendorField: null,               projectField: 'project_name', statusApproved: ['submitted','approved'] },
  payslip:      { label: 'Salary Slip',                  endpoint: '/hr-admin/payroll/public/verify',   numberField: 'employee_code',   dateField: null,          vendorField: 'employee_name',    projectField: 'department_name', statusApproved: ['approved','paid','finalized'] },
  advance:      { label: 'Advance Voucher',              endpoint: '/procurement/advances/public/verify', numberField: 'voucher_number', dateField: 'voucher_date', vendorField: 'vendor_name',    projectField: 'project_name', statusApproved: ['approved','paid'] },
  boq:          { label: 'BOQ Summary',                  endpoint: '/ra-bills/public/verify-boq',       numberField: 'project_code',    dateField: null,          vendorField: null,               projectField: 'project_name', statusApproved: [] },
};

export default function DocumentVerificationPage({ type }) {
  const { id } = useParams();
  const config = DOC_TYPES[type];

  const { data: doc, isLoading, error } = useQuery({
    queryKey: [`verify-${type}`, id],
    queryFn: () => axios.get(`${BASE_URL}${config.endpoint}/${id}`).then(r => r.data?.data ?? r.data).catch(() => null),
    enabled: !!config,
  });

  if (!config) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <ShieldCheck className="w-10 h-10 text-red-500 mb-4" />
      <h1 className="text-xl text-slate-100">Unknown Document Type</h1>
    </div>
  );

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950">
      <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
      <p className="text-slate-400 font-medium uppercase tracking-widest text-[10px] animate-pulse">Authenticating Document Reference...</p>
    </div>
  );

  if (error || !doc) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
        <ShieldCheck className="w-10 h-10 text-red-500" />
      </div>
      <h1 className="text-2xl font-medium text-slate-100 uppercase tracking-tight">Invalid Document</h1>
      <p className="text-slate-400 font-medium mt-2 text-center max-w-xs">
        This {config.label} record could not be verified. It may have been revoked or the reference is incorrect.
      </p>
      <Link to="/" className="mt-8 px-8 py-3 bg-slate-100 text-slate-900 font-medium rounded-xl text-xs uppercase tracking-widest">
        Back to Portal
      </Link>
    </div>
  );

  const status = (doc.status || '').toLowerCase();
  const isApproved = config.statusApproved.includes(status);
  const docNumber = doc[config.numberField] || doc.serial_no_formatted || '—';
  const docDate = config.dateField && doc[config.dateField] ? dayjs(doc[config.dateField]).format('DD-MM-YYYY') : null;
  const monthYear = doc.month && doc.year ? `${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][doc.month]} ${doc.year}` : null;

  const fields = [];
  if (config.projectField && doc[config.projectField]) fields.push({ label: type === 'payslip' ? 'Department' : 'Project', value: doc[config.projectField] });
  if (config.vendorField && doc[config.vendorField])   fields.push({ label: type === 'payslip' ? 'Employee' : type === 'gatepass' ? 'Issued To' : 'Vendor / Party', value: doc[config.vendorField] });
  if (doc.total_amount || doc.grand_total || doc.net_pay) fields.push({ label: 'Amount', value: `₹ ${parseFloat(doc.total_amount || doc.grand_total || doc.net_pay || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` });

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 selection:bg-blue-500 selection:text-white">
      <div className="max-w-xl mx-auto">

        {/* Verification Badge */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border-2 border-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.1)] relative">
            <ShieldCheck className="w-12 h-12 text-emerald-500" strokeWidth={2.5} />
            <div className="absolute -right-1 -bottom-1 w-8 h-8 bg-emerald-500 rounded-full border-4 border-slate-950 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-medium text-slate-100 uppercase tracking-tight leading-none mb-2">Certificate of Authenticity</h1>
          <p className="text-emerald-500/80 font-medium uppercase tracking-[0.25em] text-[10px]">Official Digital {config.label} Record</p>
        </div>

        {/* Main Document Card */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] overflow-hidden backdrop-blur-md shadow-2xl">

          {/* Status Banner */}
          <div className={isApproved ? 'bg-emerald-600 p-4 text-center' : 'bg-amber-600 p-4 text-center'}>
            <span className="text-white font-medium uppercase tracking-[0.3em] text-[11px]">
              {isApproved ? 'VERIFIED & AUTHORIZED' : `STATUS: ${(status || 'draft').toUpperCase()}`}
            </span>
          </div>

          <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-1">{config.label} Reference</p>
                <h2 className="text-2xl font-medium text-slate-100 font-mono tracking-tighter uppercase">{docNumber}</h2>
              </div>
              <div className="text-right">
                {docDate && (
                  <>
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-1">Date</p>
                    <div className="text-slate-200 font-bold">{docDate}</div>
                  </>
                )}
                {monthYear && (
                  <>
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-1">Period</p>
                    <div className="text-slate-200 font-bold">{monthYear}</div>
                  </>
                )}
              </div>
            </div>

            {/* Detail Fields */}
            {fields.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.map((f, i) => (
                  <div key={i} className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                    <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mb-1">{f.label}</p>
                    <p className="text-sm font-medium text-slate-100 uppercase leading-tight tracking-tighter">{f.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Items (if present) */}
            {doc.items && doc.items.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[10px] font-medium text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                  Line Items ({doc.items.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {doc.items.map((it, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0">
                      <div>
                        <p className="text-xs font-medium text-slate-100 uppercase tracking-tight leading-none">
                          {it.material_name || it.particulars || it.description || `Item ${i + 1}`}
                        </p>
                        <p className="text-[9px] text-slate-500 font-medium mt-1 uppercase tracking-tighter">
                          {it.unit ? `Unit: ${it.unit}` : ''} {it.quantity ? `| Qty: ${parseFloat(it.quantity)}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footnote */}
            <div className="text-center pt-4 border-t border-slate-800 flex flex-col items-center">
              <ShieldCheck className="w-6 h-6 text-slate-700 mb-2" />
              <p className="text-[9px] text-slate-500 font-medium uppercase tracking-widest leading-relaxed">
                This document is cryptographically linked to the ConstructERP Secure database.
                Any alteration of physical copies can be identified by scanning the original QR reference.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <p className="text-slate-600 text-[10px] font-medium uppercase tracking-widest">&copy; 2026 BCIM Construction Group &bull; Secure Document Portal</p>
        </div>
      </div>
    </div>
  );
}
