// src/pages/accounts/ProcurementStoresPage.jsx — live PO/GRN/Stock view inside Accounts
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { clsx } from 'clsx';
import { Truck, Package, ExternalLink } from 'lucide-react';
import { reportAPI } from '../../api/client';
import { inr } from '../dashboards/DashKPI';
import ProjectFilter from '../../components/ProjectFilter';

const PO_STATUS_CLS = {
  pending:        'bg-amber-50 text-amber-600 border-amber-100',
  approved:       'bg-blue-50 text-blue-600 border-blue-100',
  received:       'bg-emerald-50 text-emerald-600 border-emerald-100',
  rejected:       'bg-red-50 text-red-600 border-red-100',
  cancelled:      'bg-slate-100 text-slate-500 border-slate-200',
};

const GRN_STATUS_CLS = {
  pending:          'bg-amber-50 text-amber-600 border-amber-100',
  verified_stores:  'bg-blue-50 text-blue-600 border-blue-100',
  approved:         'bg-emerald-50 text-emerald-600 border-emerald-100',
  rejected:         'bg-red-50 text-red-600 border-red-100',
};

export default function ProcurementStoresPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['accounts-procurement-stores-summary'],
    queryFn: () => reportAPI.procurementStoresSummary().then(r => r.data),
  });

  const recentPos  = data?.recent_pos  ?? [];
  const recentGrns = data?.recent_grns ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center">
              <Truck className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Procurement &amp; Stores</h1>
              <p className="text-xs text-slate-400">Live PO and GRN/stock data — read-only view inside Accounts</p>
            </div>
          </div>
          <ProjectFilter />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs text-slate-400">Open POs</div>
              <div className="text-2xl font-semibold text-slate-800 mt-1">{data?.open_po_count ?? 0}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs text-slate-400">Open PO Value</div>
              <div className="text-2xl font-semibold text-slate-800 mt-1">{inr(data?.open_po_value)}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs text-slate-400">Goods Received, Not Invoiced</div>
              <div className="text-2xl font-semibold text-amber-600 mt-1">{inr(data?.grin_outstanding)}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">GRIN — GL code 2010</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs text-slate-400">Stock Value</div>
              <div className="text-2xl font-semibold text-slate-800 mt-1">{inr(data?.stock_value)}</div>
            </div>
          </div>

          <div className="px-6 pb-10 grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Recent Purchase Orders</span>
                <button onClick={() => navigate('/procurement/po')}
                  className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900">
                  Open Procurement <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              {recentPos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                  <Truck className="w-8 h-8 opacity-20" />
                  <p className="text-sm font-medium">No purchase orders found</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['PO No', 'Vendor', 'Date', 'Value (₹)', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {recentPos.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-amber-700">{r.po_number}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">{r.vendor_name}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.po_date ? dayjs(r.po_date).format('DD MMM YY') : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{inr(r.grand_total)}</td>
                        <td className="px-3 py-2">
                          <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize', PO_STATUS_CLS[r.status] || PO_STATUS_CLS.pending)}>
                            {r.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Recent GRNs</span>
                <button onClick={() => navigate('/stores/ign')}
                  className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900">
                  Open Stores <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              {recentGrns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                  <Package className="w-8 h-8 opacity-20" />
                  <p className="text-sm font-medium">No GRNs found</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['GRN No', 'Vendor', 'Date', 'Value (₹)', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {recentGrns.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-amber-700">{r.grn_number}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">{r.vendor_name}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.grn_date ? dayjs(r.grn_date).format('DD MMM YY') : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{inr(r.value)}</td>
                        <td className="px-3 py-2">
                          <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize', GRN_STATUS_CLS[r.quality_status] || GRN_STATUS_CLS.pending)}>
                            {r.quality_status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
