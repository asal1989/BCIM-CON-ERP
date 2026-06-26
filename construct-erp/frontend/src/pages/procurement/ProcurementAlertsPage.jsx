import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, TruckIcon, BarChart2, FileQuestion } from 'lucide-react';
import { procurementAlertsAPI } from '../../api/client';
import dayjs from 'dayjs';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const pct = (received, ordered) => ordered > 0 ? Math.round((received / ordered) * 100) : 0;

const TABS = [
  { key: 'overdue',   label: 'Overdue POs',       icon: Clock },
  { key: 'partial',   label: 'Partial Deliveries', icon: TruckIcon },
  { key: 'variance',  label: 'Rate Variances',     icon: BarChart2 },
  { key: 'orphan',    label: 'Orphan Bills',        icon: FileQuestion },
];

export default function ProcurementAlertsPage() {
  const [tab, setTab] = useState('overdue');

  const summary = useQuery({
    queryKey: ['proc-alerts-summary'],
    queryFn: () => procurementAlertsAPI.summary().then(r => r.data),
    staleTime: 60_000,
  });

  const overdue = useQuery({
    queryKey: ['proc-alerts-overdue'],
    queryFn: () => procurementAlertsAPI.overdue().then(r => r.data.data),
    staleTime: 60_000,
    enabled: tab === 'overdue',
  });

  const partial = useQuery({
    queryKey: ['proc-alerts-partial'],
    queryFn: () => procurementAlertsAPI.partial().then(r => r.data.data),
    staleTime: 60_000,
    enabled: tab === 'partial',
  });

  const variance = useQuery({
    queryKey: ['proc-alerts-variance'],
    queryFn: () => procurementAlertsAPI.rateVariance().then(r => r.data.data),
    staleTime: 60_000,
    enabled: tab === 'variance',
  });

  const orphan = useQuery({
    queryKey: ['proc-alerts-orphan'],
    queryFn: () => procurementAlertsAPI.orphanBills().then(r => r.data.data),
    staleTime: 60_000,
    enabled: tab === 'orphan',
  });

  const counts = summary.data || { overdue: 0, partial: 0, variance: 0, orphan: 0 };

  const KPI_CARDS = [
    { key: 'overdue',  label: 'Overdue POs',       count: counts.overdue,  color: 'red',    icon: Clock },
    { key: 'partial',  label: 'Partial Deliveries', count: counts.partial,  color: 'amber',  icon: TruckIcon },
    { key: 'variance', label: 'Rate Variances',     count: counts.variance, color: 'orange', icon: BarChart2 },
    { key: 'orphan',   label: 'Orphan Bills',       count: counts.orphan,   color: 'purple', icon: FileQuestion },
  ];

  const colorMap = {
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    num: 'text-red-600'    },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  num: 'text-amber-600'  },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', num: 'text-orange-600' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', num: 'text-purple-600' },
  };

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-amber-500" />
        <h1 className="text-[15px] font-semibold text-[#1a1d23]">Procurement Alerts</h1>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_CARDS.map(({ key, label, count, color, icon: Icon }) => {
          const c = colorMap[color];
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-3 p-4 rounded-xl border ${c.bg} ${c.border} text-left transition-all
                ${tab === key ? 'ring-2 ring-offset-1 ring-current shadow-sm' : 'hover:shadow-sm'} ${c.text}`}
            >
              <Icon size={20} />
              <div>
                <div className={`text-2xl font-bold leading-none ${c.num}`}>{count ?? '—'}</div>
                <div className="text-[11px] font-medium mt-0.5">{label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-[#e2e6ec]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors
              ${tab === key
                ? 'border-[#4a6fa5] text-[#4a6fa5]'
                : 'border-transparent text-[#6a6f7d] hover:text-[#1a1d23]'}`}
          >
            <Icon size={13} />
            {label}
            {counts[key] > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-semibold leading-none">
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'overdue' && <OverdueTable rows={overdue.data} loading={overdue.isLoading} />}
        {tab === 'partial' && <PartialTable rows={partial.data} loading={partial.isLoading} />}
        {tab === 'variance' && <VarianceTable rows={variance.data} loading={variance.isLoading} />}
        {tab === 'orphan'   && <OrphanTable  rows={orphan.data}   loading={orphan.isLoading}   />}
      </div>
    </div>
  );
}

function LoadingRow({ cols }) {
  return (
    <tr><td colSpan={cols} className="py-10 text-center text-[12px] text-[#9aa0ab]">Loading...</td></tr>
  );
}
function EmptyRow({ cols, msg }) {
  return (
    <tr><td colSpan={cols} className="py-10 text-center text-[12px] text-[#9aa0ab]">{msg}</td></tr>
  );
}

function TableWrap({ headers, children }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e2e6ec]">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-[#f5f7fa] text-[#6a6f7d] font-semibold text-left">
            {headers.map(h => (
              <th key={h} className="px-3 py-2.5 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0f2f5]">{children}</tbody>
      </table>
    </div>
  );
}

function OverdueTable({ rows, loading }) {
  return (
    <TableWrap headers={['PO #', 'Vendor', 'Project', 'PO Date', 'Delivery Date', 'Days Overdue', 'Ordered', 'Received', 'Status', 'Value (₹)']}>
      {loading ? <LoadingRow cols={10} /> :
       !rows?.length ? <EmptyRow cols={10} msg="No overdue POs — great!" /> :
       rows.map(r => (
         <tr key={r.id} className="hover:bg-[#f9fafb]">
           <td className="px-3 py-2 font-medium text-[#4a6fa5]">{r.serial_no_formatted || r.po_number}</td>
           <td className="px-3 py-2">{r.vendor_name || '—'}</td>
           <td className="px-3 py-2">{r.project_name}</td>
           <td className="px-3 py-2">{dayjs(r.po_date).format('DD-MM-YYYY')}</td>
           <td className="px-3 py-2 text-red-600 font-medium">{dayjs(r.delivery_date).format('DD-MM-YYYY')}</td>
           <td className="px-3 py-2">
             <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{r.days_overdue}d</span>
           </td>
           <td className="px-3 py-2 text-right">{fmt(r.total_ordered)}</td>
           <td className="px-3 py-2 text-right">{fmt(r.total_received)}</td>
           <td className="px-3 py-2">
             <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] capitalize">{r.status}</span>
           </td>
           <td className="px-3 py-2 text-right font-medium">₹{fmt(r.grand_total)}</td>
         </tr>
       ))}
    </TableWrap>
  );
}

function PartialTable({ rows, loading }) {
  return (
    <TableWrap headers={['PO #', 'Vendor', 'Project', 'PO Date', 'Delivery Date', 'Ordered', 'Received', '% Done', 'Value (₹)']}>
      {loading ? <LoadingRow cols={9} /> :
       !rows?.length ? <EmptyRow cols={9} msg="No partially received POs" /> :
       rows.map(r => {
         const done = pct(r.total_received, r.total_ordered);
         return (
           <tr key={r.id} className="hover:bg-[#f9fafb]">
             <td className="px-3 py-2 font-medium text-[#4a6fa5]">{r.serial_no_formatted || r.po_number}</td>
             <td className="px-3 py-2">{r.vendor_name || '—'}</td>
             <td className="px-3 py-2">{r.project_name}</td>
             <td className="px-3 py-2">{dayjs(r.po_date).format('DD-MM-YYYY')}</td>
             <td className="px-3 py-2">{r.delivery_date ? dayjs(r.delivery_date).format('DD-MM-YYYY') : '—'}</td>
             <td className="px-3 py-2 text-right">{fmt(r.total_ordered)}</td>
             <td className="px-3 py-2 text-right">{fmt(r.total_received)}</td>
             <td className="px-3 py-2">
               <div className="flex items-center gap-2">
                 <div className="flex-1 h-1.5 rounded-full bg-[#e2e6ec]">
                   <div className={`h-1.5 rounded-full ${done >= 80 ? 'bg-green-500' : done >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${done}%` }} />
                 </div>
                 <span className="text-[11px] font-semibold w-8 text-right">{done}%</span>
               </div>
             </td>
             <td className="px-3 py-2 text-right font-medium">₹{fmt(r.grand_total)}</td>
           </tr>
         );
       })}
    </TableWrap>
  );
}

function VarianceTable({ rows, loading }) {
  return (
    <TableWrap headers={['GRN #', 'Material', 'Vendor', 'Project', 'PO Rate', 'GRN Rate', 'Variance %', 'Qty', 'Unit']}>
      {loading ? <LoadingRow cols={9} /> :
       !rows?.length ? <EmptyRow cols={9} msg="No rate variances found" /> :
       rows.map(r => {
         const vp = parseFloat(r.variance_pct || 0);
         const isHigh = Math.abs(vp) > 15;
         return (
           <tr key={r.id} className="hover:bg-[#f9fafb]">
             <td className="px-3 py-2 font-medium text-[#4a6fa5]">{r.grn_number}</td>
             <td className="px-3 py-2 max-w-[140px] truncate" title={r.material_name}>{r.material_name}</td>
             <td className="px-3 py-2">{r.vendor_name || '—'}</td>
             <td className="px-3 py-2">{r.project_name}</td>
             <td className="px-3 py-2 text-right">₹{fmt(r.po_rate)}</td>
             <td className="px-3 py-2 text-right">₹{fmt(r.grn_rate)}</td>
             <td className="px-3 py-2 text-right">
               <span className={`px-2 py-0.5 rounded-full font-semibold text-[11px]
                 ${vp > 0
                   ? isHigh ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                   : 'bg-green-100 text-green-700'}`}>
                 {vp > 0 ? '+' : ''}{vp}%
               </span>
             </td>
             <td className="px-3 py-2 text-right">{r.qty}</td>
             <td className="px-3 py-2">{r.unit}</td>
           </tr>
         );
       })}
    </TableWrap>
  );
}

function OrphanTable({ rows, loading }) {
  return (
    <TableWrap headers={['Bill Ref', 'Vendor', 'Invoice #', 'Invoice Date', 'PO #', 'Project', 'Amount (₹)', 'Status']}>
      {loading ? <LoadingRow cols={8} /> :
       !rows?.length ? <EmptyRow cols={8} msg="No orphan bills found" /> :
       rows.map(r => (
         <tr key={r.id} className="hover:bg-[#f9fafb]">
           <td className="px-3 py-2 font-medium text-[#4a6fa5]">{r.sl_number}</td>
           <td className="px-3 py-2">{r.vendor_name}</td>
           <td className="px-3 py-2">{r.inv_number || '—'}</td>
           <td className="px-3 py-2">{r.inv_date ? dayjs(r.inv_date).format('DD-MM-YYYY') : '—'}</td>
           <td className="px-3 py-2">{r.po_number || '—'}</td>
           <td className="px-3 py-2">{r.project_name}</td>
           <td className="px-3 py-2 text-right font-medium">₹{fmt(r.total_amount)}</td>
           <td className="px-3 py-2">
             <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[11px] capitalize">
               {r.workflow_status}
             </span>
           </td>
         </tr>
       ))}
    </TableWrap>
  );
}
