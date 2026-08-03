// src/pages/plant/PlantEquipmentLog.jsx — Daily hour-meter / KM / diesel stock
// ledger per equipment (DG sets, JCBs, and any other equipment in the Asset
// Register). Generalises the old standalone DG/JCB log trackers into one
// DB-backed page that works for any equipment unit.
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { Trash2, Fuel, Clock, Gauge, TrendingDown } from 'lucide-react';
import { plantAPI, projectAPI } from '../../api/client';
import { PageShell, Table, Modal, KpiRow, inputCls, ddmmyyyy } from './_shared';

const fmt = (n, d = 2) => (n == null || n === '' || isNaN(n)) ? '—' : Number(n).toFixed(d);
const num = (v) => parseFloat(v) || 0;

/* ── Mini CSS bar chart (no chart-library dependency) ─────────────────────── */
function MiniBarChart({ data, valueKey, labelKey, color, label, unit = '' }) {
  const max = Math.max(...data.map((d) => num(d[valueKey])), 1);
  return (
    <div>
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
      {data.length === 0 ? (
        <div className="flex h-20 items-center justify-center text-xs text-gray-300">No data</div>
      ) : (
        <div className="flex h-20 items-end gap-1">
          {data.map((d, i) => {
            const h = Math.round((num(d[valueKey]) / max) * 80);
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t" style={{ height: h || 2, minHeight: 2, background: color }}
                  title={`${d[labelKey]}: ${fmt(d[valueKey], 1)} ${unit}`} />
                <div className="max-h-8 overflow-hidden text-[8px] text-gray-400" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                  {String(d[labelKey] || '').slice(-6)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Field MUST stay at module scope. Defined inside EntryForm it would be a new
   function identity on every render, so React would treat it as a different
   component type, unmount the whole subtree and mount fresh <input> nodes —
   killing focus after every keystroke. That let you type exactly one character
   per click into any field in this form. */
function Field({ label, span, children }) {
  return (
    <div className={span === 2 ? 'col-span-2 space-y-1' : 'space-y-1'}>
      <label className="block text-xs font-medium text-gray-500">{label}</label>{children}
    </div>
  );
}

/* ── Add / Edit Entry Modal ────────────────────────────────────────────────── */
function EntryForm({ equipmentId, equipmentName, supportsKm, projects, initial, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const { data: lastLog } = useQuery({
    queryKey: ['pm-equipment-log-last', equipmentId],
    queryFn: () => plantAPI.lastEquipmentLog(equipmentId).then((r) => r.data?.data),
    enabled: !isEdit && !!equipmentId,
  });

  const [f, setF] = useState({
    project_id: '', log_date: dayjs().format('YYYY-MM-DD'), shift: 'Day', break_hours: '',
    km_start: '', km_end: '', hr_start: '', hr_end: '',
    opening_stock: '', diesel_issued: '0', consumption: '0',
    description: '', remarks: '',
  });

  useEffect(() => {
    if (isEdit) {
      setF({
        project_id: initial.project_id || '', log_date: initial.log_date?.slice(0, 10) || dayjs().format('YYYY-MM-DD'),
        shift: initial.shift || 'Day', break_hours: initial.break_hours ?? '',
        km_start: initial.km_start ?? '', km_end: initial.km_end ?? '',
        hr_start: initial.hr_start ?? '', hr_end: initial.hr_end ?? '',
        opening_stock: initial.opening_stock ?? '', diesel_issued: initial.diesel_issued ?? '0',
        consumption: initial.consumption ?? '0', description: initial.description || '', remarks: initial.remarks || '',
      });
    } else if (lastLog?.closing_stock != null) {
      setF((s) => ({ ...s, opening_stock: lastLog.closing_stock }));
    }
  }, [isEdit, initial, lastLog]);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const kmTotal = Math.max(0, num(f.km_end) - num(f.km_start));
  const hrTotal = Math.max(0, num(f.hr_end) - num(f.hr_start));
  const totalStock = num(f.opening_stock) + num(f.diesel_issued);
  const closingStock = totalStock - num(f.consumption);

  const save = useMutation({
    mutationFn: (payload) => isEdit
      ? plantAPI.updateEquipmentLog(initial.id, payload)
      : plantAPI.createEquipmentLog(payload),
    onSuccess: () => {
      toast.success(isEdit ? 'Entry updated' : 'Entry added');
      qc.invalidateQueries({ queryKey: ['pm-equipment-logs'] });
      qc.invalidateQueries({ queryKey: ['pm-equipment-log-summary'] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!f.log_date) return toast.error('Date is required');
    save.mutate({ ...f, equipment_id: equipmentId });
  };

  return (
    <Modal title={isEdit ? `Edit Entry — ${equipmentName}` : `New Entry — ${equipmentName}`} onClose={onClose} maxW="max-w-3xl"
      footer={
        <>
          <button onClick={onClose} className="rounded border border-gray-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-gray-50">Cancel</button>
          <button form="eq-log-form" type="submit" disabled={save.isPending} className="rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {save.isPending ? 'Saving…' : isEdit ? 'Update Entry' : 'Save Entry'}
          </button>
        </>
      }>
      <form id="eq-log-form" onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Date *"><input type="date" className={inputCls} value={f.log_date} onChange={(e) => set('log_date', e.target.value)} /></Field>
        <Field label="Shift">
          <select className={inputCls} value={f.shift} onChange={(e) => set('shift', e.target.value)}>
            <option>Day</option><option>Night</option>
          </select>
        </Field>
        <Field label="Break Hours"><input type="number" step="0.1" className={inputCls} value={f.break_hours} onChange={(e) => set('break_hours', e.target.value)} /></Field>
        <Field label="Project / Site">
          <select className={inputCls} value={f.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        {supportsKm && <>
          <Field label="KM Start"><input type="number" step="0.1" className={inputCls} value={f.km_start} onChange={(e) => set('km_start', e.target.value)} /></Field>
          <Field label="KM End"><input type="number" step="0.1" className={inputCls} value={f.km_end} onChange={(e) => set('km_end', e.target.value)} /></Field>
        </>}
        <Field label="HR Start (meter)"><input type="number" step="0.1" className={inputCls} value={f.hr_start} onChange={(e) => set('hr_start', e.target.value)} /></Field>
        <Field label="HR End (meter)"><input type="number" step="0.1" className={inputCls} value={f.hr_end} onChange={(e) => set('hr_end', e.target.value)} /></Field>
        <Field label="Opening Stock (L)"><input type="number" step="0.01" className={inputCls} value={f.opening_stock} onChange={(e) => set('opening_stock', e.target.value)} /></Field>
        <Field label="Diesel Issued (L)"><input type="number" step="0.01" className={inputCls} value={f.diesel_issued} onChange={(e) => set('diesel_issued', e.target.value)} /></Field>
        <Field label="Consumption (L)"><input type="number" step="0.01" className={inputCls} value={f.consumption} onChange={(e) => set('consumption', e.target.value)} /></Field>
        <Field label="Work Description" span={2}><input className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Remarks"><input className={inputCls} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>

        <div className="col-span-2 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 sm:col-span-3 sm:grid-cols-4">
          {[
            ...(supportsKm ? [['KM Run', `${fmt(kmTotal, 0)} km`]] : []),
            ['Hours Run', `${fmt(hrTotal, 1)} hr`],
            ['Total Stock', `${fmt(totalStock)} L`],
            ['Closing Stock', `${fmt(closingStock)} L`],
          ].map(([l, v]) => (
            <div key={l}>
              <div className="text-[10px] font-bold uppercase text-gray-400">{l}</div>
              <div className="text-sm font-bold text-gray-800">{v}</div>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export default function PlantEquipmentLog() {
  const qc = useQueryClient();
  const [equipmentId, setEquipmentId] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  const { data: equipment = [] } = useQuery({
    queryKey: ['pm-equipment'],
    queryFn: () => plantAPI.listEquipment().then((r) => r.data?.data || []).catch(() => []),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then((r) => r.data?.data || r.data || []).catch(() => []),
  });

  // Default to the first equipment once the list loads
  useEffect(() => { if (!equipmentId && equipment.length) setEquipmentId(equipment[0].id); }, [equipment, equipmentId]);

  const currentEquipment = equipment.find((e) => e.id === equipmentId);
  // Vehicles / movable plant track KM; stationary gensets etc. don't — heuristic on category/name.
  const supportsKm = /jcb|backhoe|loader|excavator|crane|vehicle|truck|tipper|roller/i.test(
    `${currentEquipment?.name || ''} ${currentEquipment?.category_name || ''}`
  );

  const { data: logsResp, isLoading: loadingLogs } = useQuery({
    queryKey: ['pm-equipment-logs', equipmentId, month],
    queryFn: () => plantAPI.listEquipmentLogs({ equipment_id: equipmentId, month }).then((r) => r.data?.data || []),
    enabled: !!equipmentId,
  });
  const { data: summary = [] } = useQuery({
    queryKey: ['pm-equipment-log-summary', equipmentId],
    queryFn: () => plantAPI.equipmentLogSummary(equipmentId).then((r) => r.data?.data || []),
    enabled: !!equipmentId,
  });

  const monthRows = logsResp || [];
  const filteredRows = useMemo(() =>
    monthRows.filter((r) => !search ||
      r.description?.toLowerCase().includes(search.toLowerCase()) ||
      ddmmyyyy(r.log_date).includes(search)
    ), [monthRows, search]);

  const delMut = useMutation({
    mutationFn: (id) => plantAPI.deleteEquipmentLog(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['pm-equipment-logs'] }); qc.invalidateQueries({ queryKey: ['pm-equipment-log-summary'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const totalHours    = monthRows.reduce((a, r) => a + num(r.hr_total), 0);
  const totalKm       = monthRows.reduce((a, r) => a + num(r.km_total), 0);
  const totalIssued   = monthRows.reduce((a, r) => a + num(r.diesel_issued), 0);
  const totalConsumed = monthRows.reduce((a, r) => a + num(r.consumption), 0);
  const lastRow       = monthRows[monthRows.length - 1];
  const closingStock  = lastRow?.closing_stock ?? 0;
  const lph           = totalHours > 0 ? (totalIssued / totalHours).toFixed(2) : '—';

  const totalCumHours  = summary.reduce((a, r) => a + num(r.hours_run), 0);
  const totalCumIssued = summary.reduce((a, r) => a + num(r.issued), 0);
  const totalCumKm     = summary.reduce((a, r) => a + num(r.km_run), 0);

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['pm-equipment-logs'] });
    qc.invalidateQueries({ queryKey: ['pm-equipment-log-summary'] });
  };

  const dailyCols = [
    { key: 'log_date', label: 'Date', render: (r) => ddmmyyyy(r.log_date) },
    { key: 'shift', label: 'Shift' },
    ...(supportsKm ? [
      { key: 'km_start', label: 'KM Start', render: (r) => fmt(r.km_start, 0) },
      { key: 'km_end', label: 'KM End', render: (r) => fmt(r.km_end, 0) },
      { key: 'km_total', label: 'KM Run', render: (r) => <b className="text-blue-600">{fmt(r.km_total, 0)}</b> },
    ] : []),
    { key: 'hr_start', label: 'HR Start', render: (r) => fmt(r.hr_start, 1) },
    { key: 'hr_end', label: 'HR End', render: (r) => fmt(r.hr_end, 1) },
    { key: 'hr_total', label: 'Hours Run', render: (r) => <b className={num(r.hr_total) > 0 ? 'text-emerald-600' : 'text-gray-400'}>{fmt(r.hr_total, 1)}</b> },
    { key: 'opening_stock', label: 'Open Stock', render: (r) => fmt(r.opening_stock) },
    { key: 'diesel_issued', label: 'Issued (L)', render: (r) => num(r.diesel_issued) > 0 ? <span className="font-bold text-amber-600">{fmt(r.diesel_issued)}</span> : <span className="text-gray-400">—</span> },
    { key: 'consumption', label: 'Consumed', render: (r) => num(r.consumption) > 0 ? <span className="font-semibold text-red-500">{fmt(r.consumption)}</span> : <span className="text-gray-400">—</span> },
    { key: 'closing_stock', label: 'Close Stock', render: (r) => fmt(r.closing_stock) },
    { key: 'description', label: 'Description' },
    { key: 'project_name', label: 'Project' },
    { key: '_a', label: '', render: (r) => (
      <div className="flex gap-1">
        <button onClick={() => { setEditEntry(r); setShowForm(true); }} className="rounded px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50">Edit</button>
        <button onClick={() => window.confirm('Delete this entry?') && delMut.mutate(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    ) },
  ];

  const summaryCols = [
    { key: 'month', label: 'Month' },
    ...(supportsKm ? [{ key: 'km_run', label: 'KM Run', render: (r) => <b className="text-blue-600">{fmt(r.km_run, 0)}</b> }] : []),
    { key: 'hours_run', label: 'Hours Run', render: (r) => <b>{fmt(r.hours_run, 1)}</b> },
    { key: 'open_stock', label: 'Open Stock', render: (r) => fmt(r.open_stock) },
    { key: 'issued', label: 'Issued (L)', render: (r) => <span className="font-bold text-amber-600">{fmt(r.issued)}</span> },
    { key: 'consumed', label: 'Consumed', render: (r) => num(r.consumed) > 0 ? <span className="font-semibold text-red-500">{fmt(r.consumed)}</span> : '—' },
    { key: 'close_stock', label: 'Close Stock', render: (r) => fmt(r.close_stock) },
  ];

  return (
    <PageShell
      title="Equipment Daily Log"
      onRefresh={equipmentId ? handleRefresh : undefined}
      onAdd={equipmentId ? () => { setEditEntry(null); setShowForm(true); } : undefined}
      addLabel="Add Entry"
      exportData={tab === 'daily' ? filteredRows : summary}
      exportName={`pm_equipment_log_${currentEquipment?.code || ''}_${tab}`}
      extra={
        <select className={clsx(inputCls, 'w-64')} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          <option value="">— Select Equipment —</option>
          {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.code} · {eq.name}</option>)}
        </select>
      }>

      {!equipmentId ? (
        <div className="rounded-lg border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
          Select an equipment from the Asset Register to view or add daily log entries.
        </div>
      ) : (
        <>
          <div className="flex gap-1 border-b border-gray-200">
            {[['dashboard', 'Dashboard'], ['daily', 'Daily Log'], ['summary', 'Monthly Summary']].map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)}
                className={clsx('px-4 py-2 text-xs font-medium transition',
                  tab === k ? 'border-b-2 border-teal-600 text-teal-700' : 'text-slate-500 hover:text-slate-700')}>
                {lbl}
              </button>
            ))}
          </div>

          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500">Viewing Month:</label>
                <input type="month" className={clsx(inputCls, 'w-44')} value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>

              <KpiRow cards={[
                ...(supportsKm ? [{ label: 'KM This Month', value: `${fmt(totalKm, 0)} km`, icon: Gauge, color: 'text-blue-600', bg: 'bg-blue-50' }] : []),
                { label: 'Hours Run', value: `${fmt(totalHours, 1)} hr`, icon: Clock, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Diesel Issued', value: `${fmt(totalIssued)} L`, icon: Fuel, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Diesel Consumed', value: `${fmt(totalConsumed)} L`, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50' },
                { label: 'Closing Stock', value: `${fmt(closingStock)} L` },
                { label: 'L / Hour', value: lph === '—' ? '—' : `${lph} L` },
              ]} />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <MiniBarChart data={summary.slice(-12)} valueKey="hours_run" labelKey="month" color="#0d9488" label="Hours Run — Last 12 Months" unit="hr" />
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <MiniBarChart data={summary.slice(-12)} valueKey="issued" labelKey="month" color="#f59e0b" label="Diesel Issued — Last 12 Months" unit="L" />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-3 text-sm font-bold text-gray-800">Recent Log — {month}</div>
                <Table columns={dailyCols} rows={monthRows.slice(-6)} isLoading={loadingLogs} empty="No entries for this month" />
              </div>
            </div>
          )}

          {/* ── DAILY LOG ── */}
          {tab === 'daily' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input type="month" className={clsx(inputCls, 'w-44')} value={month} onChange={(e) => setMonth(e.target.value)} />
                <input className={clsx(inputCls, 'min-w-[200px] flex-1')} placeholder="Search date or description…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="ml-auto flex gap-2 text-xs font-bold">
                  <span className="rounded bg-teal-600 px-3 py-1.5 text-white">{fmt(totalHours, 1)} hr</span>
                  <span className="rounded bg-amber-500 px-3 py-1.5 text-white">{fmt(totalIssued)} L issued</span>
                </div>
              </div>
              <Table columns={dailyCols} rows={filteredRows} isLoading={loadingLogs} empty="No entries found" />
            </div>
          )}

          {/* ── MONTHLY SUMMARY ── */}
          {tab === 'summary' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-3">
                  <div className="text-sm font-bold text-gray-800">Monthly Summary — {currentEquipment?.name}</div>
                  <div className="text-xs text-gray-400">Cumulative running hours / KM and diesel stock ledger, by month</div>
                </div>
                <Table columns={summaryCols} rows={summary} empty="No data yet" />
                {summary.length > 0 && (
                  <div className="flex flex-wrap gap-6 border-t border-gray-100 bg-gray-50 px-5 py-3">
                    {[
                      ['Total Months', summary.length],
                      ...(supportsKm ? [['Total KM', fmt(totalCumKm, 0)]] : []),
                      ['Total Hours', fmt(totalCumHours, 1) + ' hr'],
                      ['Total Issued', fmt(totalCumIssued) + ' L'],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <div className="text-[10px] font-bold uppercase text-gray-400">{l}</div>
                        <div className="text-sm font-bold text-amber-600">{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {showForm && equipmentId && (
        <EntryForm
          equipmentId={equipmentId}
          equipmentName={currentEquipment?.name}
          supportsKm={supportsKm}
          projects={projects}
          initial={editEntry}
          onClose={() => { setShowForm(false); setEditEntry(null); }}
        />
      )}
    </PageShell>
  );
}
