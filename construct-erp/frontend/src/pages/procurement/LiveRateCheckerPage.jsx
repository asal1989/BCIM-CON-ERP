// src/pages/procurement/LiveRateCheckerPage.jsx
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Download,
  Filter,
  IndianRupee,
  Layers,
  Package,
  RefreshCw,
  Search,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import api from '../../api/client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n, dec = 2) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtL = (n) => {
  const v = Number(n || 0);
  return `₹${fmt(v, 2)}`;
};

const stockStatus = (row) => {
  const stock = parseFloat(row.stock_qty || 0);
  const reorder = parseFloat(row.reorder_level || 0);
  const minimum = parseFloat(row.minimum_level || 0);
  if (stock === 0) return { label: 'Out', color: 'bg-red-100 text-red-700' };
  if (minimum > 0 && stock <= minimum) return { label: 'Critical', color: 'bg-red-100 text-red-700' };
  if (reorder > 0 && stock <= reorder) return { label: 'Reorder', color: 'bg-amber-100 text-amber-700' };
  return { label: 'Adequate', color: 'bg-emerald-100 text-emerald-700' };
};

const sourceBadge = (source_type) =>
  source_type === 'po'
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-violet-100 text-violet-700';

const sourceLabel = (source_type) => (source_type === 'po' ? 'PO' : 'INV');

// ─── Export CSV ───────────────────────────────────────────────────────────────
const exportCSV = (rows) => {
  const headers = ['#', 'Material', 'Category', 'Unit', 'Rate (₹)', 'GST%', 'Rate+GST (₹)', 'Stock Qty', 'Stock Value (₹)', 'Source', 'Status', 'Project', 'Vendor', 'Doc Ref'];
  const csvRows = [
    headers.join(','),
    ...rows.map((r, i) => {
      const st       = stockStatus(r);
      const gstPct   = Number(r.gst_rate || r.gst_percent || 0);
      const rateWithGst = Number(r.rate || 0) * (1 + gstPct / 100);
      return [
        i + 1,
        `"${r.material_name}"`,
        `"${r.category}"`,
        r.unit,
        r.rate,
        gstPct,
        fmt(rateWithGst),
        r.stock_qty,
        r.stock_value,
        sourceLabel(r.source_type),
        st.label,
        `"${r.project_name || ''}"`,
        `"${r.vendor_name || ''}"`,
        `"${r.doc_ref || ''}"`,
      ].join(',');
    }),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `live-rates-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, sub, color }) => (
  <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-3 min-w-0">
    <div className={`p-2 rounded-lg ${color}`}>
      <Icon size={16} className="text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-xs text-slate-900 font-medium truncate">{label}</p>
      <p className="text-base font-medium text-slate-900 font-medium leading-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  </div>
);

// ─── Category Summary Card ────────────────────────────────────────────────────
const CatCard = ({ cat, onClick, active }) => (
  <button
    onClick={onClick}
    className={`flex-shrink-0 rounded-lg border px-3 py-2 text-left transition-all
      ${active
        ? 'border-blue-500 bg-blue-50 text-blue-700'
        : 'border-gray-200 bg-white text-slate-900 hover:border-gray-300'}`}
  >
    <p className="text-xs font-medium truncate max-w-[120px]">{cat.category}</p>
    <p className="text-sm font-bold">{cat.count} items</p>
    <p className="text-xs text-gray-500">{fmtL(cat.total_value)}</p>
    <p className="text-xs text-gray-400">Avg ₹{fmt(cat.avg_rate, 0)}</p>
  </button>
);

// ─── Benchmark Panel Form ─────────────────────────────────────────────────────
const BenchmarkForm = ({ row, benchmarks, onSave, onDelete, isSaving }) => {
  const existing = benchmarks?.find(
    (b) => b.material_name.toLowerCase() === row.material_name.toLowerCase()
  );
  const [rate, setRate] = useState(existing?.benchmark_rate ?? '');
  const [remarks, setRemarks] = useState(existing?.remarks ?? '');

  const currentRate = parseFloat(row.rate || 0);
  const benchRate = parseFloat(existing?.benchmark_rate || 0);
  let rateVsBench = null;
  if (existing && benchRate > 0) {
    const diff = ((currentRate - benchRate) / benchRate) * 100;
    rateVsBench = diff;
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide mb-2 flex items-center gap-1">
        <Star size={11} /> Benchmark Rate
      </p>

      {existing && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-between
          ${rateVsBench === null ? 'bg-gray-50 text-gray-600'
            : rateVsBench <= 0 ? 'bg-emerald-50 text-emerald-700'
            : rateVsBench > 10 ? 'bg-red-50 text-red-700'
            : 'bg-amber-50 text-amber-700'}`}
        >
          <span>Your benchmark: ₹{fmt(existing.benchmark_rate)}</span>
          {rateVsBench !== null && (
            <span className="flex items-center gap-1 text-xs">
              {rateVsBench <= 0
                ? <><TrendingDown size={12} /> {Math.abs(rateVsBench).toFixed(1)}% below</>
                : <><TrendingUp size={12} /> {rateVsBench.toFixed(1)}% above</>}
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <input
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="Benchmark rate ₹"
          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => onSave({ material_name: row.material_name, category: row.category, unit: row.unit, benchmark_rate: parseFloat(rate), remarks })}
          disabled={!rate || isSaving}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '...' : existing ? 'Update' : 'Set'}
        </button>
        {existing && (
          <button
            onClick={() => onDelete(existing.id)}
            className="px-2 py-1.5 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100 border border-red-200"
            title="Remove benchmark"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <input
        type="text"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder="Remarks (optional)"
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    </div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────
const DetailPanel = ({ row, benchmarks, onClose, onSaveBenchmark, onDeleteBenchmark, isSaving }) => {
  if (!row) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-900 font-medium gap-2 p-8">
        <Package size={40} className="opacity-30" />
        <p className="text-sm">Click a row to view details</p>
      </div>
    );
  }

  const st = stockStatus(row);
  const stockValue = parseFloat(row.rate || 0) * parseFloat(row.stock_qty || 0);

  return (
    <div className="p-4 overflow-y-auto h-full">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-slate-900 font-medium text-sm leading-snug pr-2">{row.material_name}</h3>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {row.category}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-900 font-medium hover:text-slate-900 flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Rate */}
      <div className="bg-blue-50 rounded-lg px-4 py-3 mb-3">
        <p className="text-xs text-blue-600 font-medium">Current Rate</p>
        <p className="text-2xl font-medium text-blue-800">₹{fmt(row.rate)}</p>
        <p className="text-xs text-blue-500">per {row.unit}</p>
      </div>

      {/* Stock */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500">Opening Stock</p>
          <p className="text-sm font-medium text-gray-700">{fmt(row.opening_stock, 0)}</p>
          <p className="text-xs text-gray-400">{row.unit}</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500">Closing Stock</p>
          <p className="text-sm font-medium text-gray-700">{fmt(row.stock_qty, 0)}</p>
          <p className="text-xs text-gray-400">{row.unit}</p>
        </div>
      </div>

      {/* Stock Value */}
      <div className="bg-emerald-50 rounded-lg px-3 py-2 mb-3">
        <p className="text-xs text-emerald-600">Stock Value</p>
        <p className="text-base font-medium text-emerald-800">₹{fmt(stockValue)}</p>
        <p className="text-xs text-emerald-500">{fmt(row.stock_qty, 0)} × ₹{fmt(row.rate)}</p>
      </div>

      {/* Status & Source */}
      <div className="flex gap-2 mb-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceBadge(row.source_type)}`}>
          {sourceLabel(row.source_type)}
        </span>
      </div>

      {/* Meta */}
      <div className="text-xs text-slate-900 font-medium space-y-1 mb-3">
        {row.project_name && <p><span className="font-medium">Project:</span> {row.project_name}</p>}
        {row.vendor_name && <p><span className="font-medium">Vendor:</span> {row.vendor_name}</p>}
        {row.doc_ref && <p><span className="font-medium">Ref:</span> {row.doc_ref}</p>}
        {row.rate_date && (
          <p><span className="font-medium">Rate Date:</span> {new Date(row.rate_date).toLocaleDateString('en-IN')}</p>
        )}
        {parseFloat(row.reorder_level || 0) > 0 && (
          <p><span className="font-medium">Reorder Level:</span> {row.reorder_level}</p>
        )}
        {parseFloat(row.minimum_level || 0) > 0 && (
          <p><span className="font-medium">Minimum Level:</span> {row.minimum_level}</p>
        )}
      </div>

      {/* Benchmark */}
      <BenchmarkForm
        row={row}
        benchmarks={benchmarks}
        onSave={onSaveBenchmark}
        onDelete={onDeleteBenchmark}
        isSaving={isSaving}
      />
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LiveRateCheckerPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedRow, setSelectedRow] = useState(null);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const {
    data: ratesData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['live-rates'],
    queryFn: () => api.get('/procurement/live-rates').then((r) => r.data?.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: benchmarksData } = useQuery({
    queryKey: ['live-rates-benchmarks'],
    queryFn: () => api.get('/procurement/live-rates/benchmarks').then((r) => r.data?.data),
    staleTime: 5 * 60 * 1000 * 1000,
  });

  const { mutate: saveBenchmark, isPending: isSaving } = useMutation({
    mutationFn: (data) => api.post('/procurement/live-rates/benchmarks', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['live-rates-benchmarks'] }),
  });

  const { mutate: deleteBenchmark } = useMutation({
    mutationFn: (id) => api.delete(`/procurement/live-rates/benchmarks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['live-rates-benchmarks'] }),
  });

  const rates = ratesData?.rates ?? [];
  const summary = ratesData?.summary;
  const benchmarks = benchmarksData ?? [];

  // ── Unique categories ────────────────────────────────────────────────────────
  const uniqueCategories = useMemo(() => {
    const cats = new Set(rates.map((r) => r.category));
    return Array.from(cats).sort();
  }, [rates]);

  // ── Filtered rows ────────────────────────────────────────────────────────────
  const filteredRates = useMemo(() => {
    return rates.filter((r) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q || r.material_name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
      const matchCat = !selectedCat || r.category === selectedCat;
      const matchSrc =
        sourceFilter === 'all' ||
        (sourceFilter === 'inv' && r.source_type === 'inventory') ||
        (sourceFilter === 'po' && r.source_type === 'po');
      return matchSearch && matchCat && matchSrc;
    });
  }, [rates, search, selectedCat, sourceFilter]);

  // ── Totals row ───────────────────────────────────────────────────────────────
  const filteredTotalValue = useMemo(
    () => filteredRates.reduce((acc, r) => acc + parseFloat(r.stock_value || 0), 0),
    [filteredRates]
  );

  const avgRate = useMemo(() => {
    if (!rates.length) return 0;
    return rates.reduce((acc, r) => acc + parseFloat(r.rate || 0), 0) / rates.length;
  }, [rates]);

  const poCount = useMemo(() => rates.filter((r) => r.source_type === 'po').length, [rates]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-900 font-medium gap-3">
        <RefreshCw size={18} className="animate-spin" />
        <span>Loading live rates…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-base font-medium text-slate-900 font-medium flex items-center gap-2">
            <BarChart3 size={18} className="text-blue-600" />
            LIVE RATE CHECKER
          </h1>
          <p className="text-xs text-slate-900 font-medium mt-0.5">
            DQS Yelahanka
            {summary && (
              <>
                {' '}· <span className="font-medium">{summary.total_items} materials</span>
                {' '}· <span className="font-medium">{fmtL(summary.total_value)} value</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCSV(filteredRates)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-900 border border-gray-300 rounded hover:bg-gray-50"
          >
            <Download size={13} />
            Export CSV
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPI Bar ─────────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 flex gap-3 flex-shrink-0 overflow-x-auto">
        <KpiCard icon={Package} label="Total Materials" value={summary?.total_items ?? 0} color="bg-blue-500" />
        <KpiCard icon={IndianRupee} label="Total Stock Value" value={fmtL(summary?.total_value)} color="bg-emerald-500" />
        <KpiCard icon={Layers} label="PO Rates Tracked" value={poCount} sub="from purchase orders" color="bg-indigo-500" />
        <KpiCard icon={Tag} label="Avg Rate" value={`₹${fmt(avgRate, 0)}`} sub="across all items" color="bg-violet-500" />
      </div>

      {/* ── Category Cards ───────────────────────────────────────────────────── */}
      {summary?.categories?.length > 0 && (
        <div className="px-5 pb-2 flex gap-2 overflow-x-auto flex-shrink-0">
          <CatCard
            cat={{ category: 'All', count: rates.length, total_value: summary.total_value, avg_rate: avgRate }}
            onClick={() => setSelectedCat('')}
            active={!selectedCat}
          />
          {summary.categories.map((c) => (
            <CatCard
              key={c.category}
              cat={c}
              onClick={() => setSelectedCat(selectedCat === c.category ? '' : c.category)}
              active={selectedCat === c.category}
            />
          ))}
        </div>
      )}

      {/* ── Filters Bar ─────────────────────────────────────────────────────── */}
      <div className="px-5 py-2 flex items-center gap-3 flex-shrink-0 bg-white border-y border-gray-100">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search material or category…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-900 font-medium hover:text-gray-600">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Filter size={13} className="text-slate-900 font-medium flex-shrink-0" />
          {['all', ...uniqueCategories.slice(0, 6)].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat === 'all' ? '' : cat === selectedCat ? '' : cat)}
              className={`flex-shrink-0 text-xs px-2 py-1 rounded-full border transition-all
                ${(!selectedCat && cat === 'all') || selectedCat === cat
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-900 border-gray-300 hover:border-blue-400'}`}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>

        {/* Source filter */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          {['all', 'inv', 'po'].map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`text-xs px-2.5 py-1 rounded border transition-all
                ${sourceFilter === s
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-slate-900 border-gray-300 hover:border-gray-400'}`}
            >
              {s === 'all' ? 'All' : s.toUpperCase()}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-900 font-medium flex-shrink-0">
          {filteredRates.length} / {rates.length}
        </p>
      </div>

      {/* ── Main Content: Table + Detail Panel ─────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className={`${selectedRow ? 'w-[65%]' : 'w-full'} overflow-auto transition-all duration-200`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-900 font-medium w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Material</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-900 font-medium hidden md:table-cell">Category</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Rate (₹)</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Stock</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-900 font-medium hidden lg:table-cell">Value (₹)</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                <th className="px-3 py-2 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredRates.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-gray-400">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    <p>No materials match your filters</p>
                  </td>
                </tr>
              ) : (
                filteredRates.map((row, i) => {
                  const st = stockStatus(row);
                  const isSelected = selectedRow?.source_id === row.source_id;
                  const hasBenchmark = benchmarks.some(
                    (b) => b.material_name.toLowerCase() === row.material_name.toLowerCase()
                  );

                  return (
                    <tr
                      key={`${row.source_type}-${row.source_id}`}
                      onClick={() => setSelectedRow(isSelected ? null : row)}
                      className={`cursor-pointer transition-colors
                        ${isSelected
                          ? 'bg-blue-50 border-l-2 border-l-blue-500'
                          : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${sourceBadge(row.source_type)}`}>
                            {sourceLabel(row.source_type)}
                          </span>
                          <span className="text-xs font-medium text-slate-900 font-medium truncate max-w-[160px]">
                            {row.material_name}
                          </span>
                          {hasBenchmark && (
                            <Star size={10} className="text-amber-400 flex-shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-900 font-medium hidden md:table-cell truncate max-w-[100px]">
                        {row.category}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{row.unit}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium text-gray-800">
                        {fmt(row.rate)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gray-600">
                        {fmt(row.stock_qty, 0)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-slate-900 hidden lg:table-cell">
                        {fmt(parseFloat(row.rate || 0) * parseFloat(row.stock_qty || 0), 0)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        <ChevronRight size={12} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Totals footer */}
            {filteredRates.length > 0 && (
              <tfoot className="sticky bottom-0 bg-gray-100 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-xs font-medium text-gray-600">
                    Total ({filteredRates.length} items)
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-medium text-slate-900 font-medium hidden lg:table-cell">
                    {fmt(filteredTotalValue, 0)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Detail Panel */}
        {selectedRow && (
          <div className="w-[35%] border-l border-gray-200 bg-white overflow-hidden flex-shrink-0 flex flex-col">
            <DetailPanel
              row={selectedRow}
              benchmarks={benchmarks}
              onClose={() => setSelectedRow(null)}
              onSaveBenchmark={saveBenchmark}
              onDeleteBenchmark={deleteBenchmark}
              isSaving={isSaving}
            />
          </div>
        )}
      </div>
    </div>
  );
}
