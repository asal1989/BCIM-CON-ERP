// src/pages/planning/SiteWeatherPage.jsx — Site Weather (Planning)
// Live conditions, 14-day forecast, work-suitability advice and a verified
// rainfall archive per project — backed by weatherAPI (Open-Meteo, no API key).
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { weatherAPI, projectAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme, SectionTitle } from '../../theme';
import useAuthStore from '../../store/authStore';
import {
  Sun, Cloud, CloudRain, Wind, Thermometer, Droplets, MapPin,
  RefreshCw, Settings, X, AlertTriangle, CheckCircle2, AlertCircle,
  CalendarDays, TrendingUp, Gauge,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const BUCKET_ICON = {
  sunny:  { icon: Sun,         color: 'text-amber-500',  bg: 'bg-amber-50' },
  cloudy: { icon: Cloud,       color: 'text-slate-500',  bg: 'bg-slate-100' },
  rainy:  { icon: CloudRain,   color: 'text-blue-500',   bg: 'bg-blue-50' },
  hot:    { icon: Thermometer, color: 'text-red-500',    bg: 'bg-red-50' },
  windy:  { icon: Wind,        color: 'text-teal-500',   bg: 'bg-teal-50' },
};
const bucketCfg = (b) => BUCKET_ICON[b] || BUCKET_ICON.cloudy;

const WORK_STATUS_CFG = {
  ok:      { label: 'OK',      color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  caution: { label: 'Caution', color: 'bg-amber-100 text-amber-700',     icon: AlertTriangle },
  stop:    { label: 'Stop',    color: 'bg-red-100 text-red-700',         icon: AlertCircle },
};

function DayCard({ day, isToday }) {
  const cfg = bucketCfg(day.bucket);
  const Icon = cfg.icon;
  return (
    <div className={clsx(
      'flex-shrink-0 w-[110px] rounded-xl border p-3 text-center',
      isToday ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-white'
    )}>
      <div className="text-xs font-semibold text-slate-600">
        {isToday ? 'Today' : dayjs(day.date).format('ddd')}
      </div>
      <div className="text-[10px] text-slate-400 mb-1">{dayjs(day.date).format('DD MMM')}</div>
      <div className={clsx('w-9 h-9 mx-auto rounded-lg flex items-center justify-center my-1', cfg.bg)}>
        <Icon size={18} className={cfg.color} />
      </div>
      <div className="text-sm font-bold text-black">{Math.round(day.temp_max)}°</div>
      <div className="text-xs text-slate-400">{Math.round(day.temp_min)}°</div>
      {day.precipitation_mm > 0 && (
        <div className="text-[10px] text-blue-500 mt-1 flex items-center justify-center gap-0.5">
          <Droplets size={9} /> {day.precipitation_mm.toFixed(1)}mm
        </div>
      )}
      {day.is_rain_day && (
        <div className="text-[9px] font-semibold text-blue-600 mt-0.5">Rain day</div>
      )}
    </div>
  );
}

function LocationModal({ project, current, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    weather_location_name: current?.weather_location_name || '',
    latitude: current?.latitude ?? '',
    longitude: current?.longitude ?? '',
    rain_day_threshold_mm: current?.rain_day_threshold_mm ?? 2.5,
    contract_rain_days_per_month: current?.contract_rain_days_per_month ?? '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: (d) => weatherAPI.updateLocation({ project_id: project.id, ...d }),
    onSuccess: () => {
      toast.success('Weather settings updated');
      qc.invalidateQueries({ queryKey: ['weather-overview'] });
      qc.invalidateQueries({ queryKey: ['weather-history'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-600" /> Weather Location & Contract Terms
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-slate-500">
            Coordinates are auto-resolved from the project's city. Override here only if the
            site is far from the city centre or the automatic match looks wrong.
          </p>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Location Name</label>
            <input value={form.weather_location_name} onChange={e => set('weather_location_name', e.target.value)}
              placeholder="e.g. Gachibowli, Hyderabad"
              className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Latitude</label>
              <input type="number" step="0.000001" value={form.latitude} onChange={e => set('latitude', e.target.value)}
                className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Longitude</label>
              <input type="number" step="0.000001" value={form.longitude} onChange={e => set('longitude', e.target.value)}
                className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Rain-day threshold (mm)</label>
              <input type="number" step="0.1" value={form.rain_day_threshold_mm} onChange={e => set('rain_day_threshold_mm', e.target.value)}
                className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
              <p className="text-[10px] text-slate-400 mt-0.5">IMD default is 2.5mm</p>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Contract rain-days/month</label>
              <input type="number" value={form.contract_rain_days_per_month} onChange={e => set('contract_rain_days_per_month', e.target.value)}
                placeholder="optional"
                className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
              <p className="text-[10px] text-slate-400 mt-0.5">For EOT excess-day flagging</p>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button
            onClick={() => mut.mutate({
              weather_location_name: form.weather_location_name || null,
              latitude: form.latitude === '' ? null : Number(form.latitude),
              longitude: form.longitude === '' ? null : Number(form.longitude),
              rain_day_threshold_mm: form.rain_day_threshold_mm === '' ? null : Number(form.rain_day_threshold_mm),
              contract_rain_days_per_month: form.contract_rain_days_per_month === '' ? null : Number(form.contract_rain_days_per_month),
            })}
            disabled={mut.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
          >
            {mut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SiteWeatherPage() {
  const { selectedProjectId } = useAuthStore();
  const [projectId, setProjectId] = useState(selectedProjectId || '');
  const [showLocation, setShowLocation] = useState(false);
  const [historyDays, setHistoryDays] = useState(30);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-for-weather'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    staleTime: 60000,
  });

  React.useEffect(() => {
    if (!projectId && projects.length) setProjectId(selectedProjectId || projects[0].id);
  }, [projects, selectedProjectId]);

  const { data: overview, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['weather-overview', projectId],
    queryFn: () => weatherAPI.overview(projectId).then(r => r.data?.data ?? null),
    enabled: !!projectId,
    staleTime: 15 * 60 * 1000, // forecast doesn't need to be refetched constantly
  });

  const from = dayjs().subtract(historyDays, 'day').format('YYYY-MM-DD');
  const { data: history, isLoading: histLoading } = useQuery({
    queryKey: ['weather-history', projectId, historyDays],
    queryFn: () => weatherAPI.history(projectId, from).then(r => r.data?.data ?? null),
    enabled: !!projectId,
    staleTime: 60 * 60 * 1000,
  });

  const activeProject = projects.find(p => p.id === projectId);
  const today = dayjs().format('YYYY-MM-DD');

  const kpis = useMemo(() => {
    if (!overview?.configured) return [];
    const c = overview.current;
    return [
      { label: 'Current Temperature', value: `${Math.round(c.temperature)}°C`, sub: `Feels ${Math.round(c.feels_like)}°C`, icon: Thermometer, color: 'red' },
      { label: 'Humidity',            value: `${c.humidity}%`, sub: c.condition, icon: Droplets, color: 'blue' },
      { label: 'Wind Speed',          value: `${Math.round(c.wind_kmh)} km/h`, sub: 'current', icon: Wind, color: 'teal' },
      { label: 'Rain Days (Next 14)', value: overview.forecast_rain_days, sub: `≥ ${overview.rain_day_threshold_mm}mm/day`, icon: CloudRain, color: 'indigo' },
    ];
  }, [overview]);

  if (overview && overview.configured === false) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PageHeader title="Site Weather" subtitle="Live conditions, forecast and rainfall history per project" />
        <div className="p-6">
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-lg mx-auto">
            <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-600">{overview.message}</p>
            <button onClick={() => setShowLocation(true)}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              Set Location Manually
            </button>
          </div>
        </div>
        {showLocation && activeProject && (
          <LocationModal project={activeProject} current={overview} onClose={() => setShowLocation(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader
        title="Site Weather"
        subtitle="Live conditions, forecast and verified rainfall history — for DPR entry and EOT support"
        actions={
          <div className="flex items-center gap-2">
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="h-9 rounded-lg px-3 text-sm bg-white/10 text-white border border-white/20 outline-none">
              {projects.map(p => <option key={p.id} value={p.id} className="text-slate-900">{p.name}</option>)}
            </select>
            <button onClick={() => refetch()} title="Refresh"
              className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white">
              <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
            </button>
            <button onClick={() => setShowLocation(true)} title="Weather location & contract terms"
              className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="py-24 text-center text-slate-400 text-sm">Loading weather…</div>
        ) : !overview ? (
          <div className="py-24 text-center text-slate-400 text-sm">No data available.</div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <MapPin size={14} /> {overview.location.name} · {activeProject?.project_code}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
              {kpis.map(k => (
                <ThemeKpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} icon={k.icon} color={k.color} />
              ))}
            </div>

            {/* 14-day forecast strip */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <SectionTitle>14-Day Forecast</SectionTitle>
              <div className="flex gap-3 overflow-x-auto pb-2 mt-3">
                {overview.forecast.map(d => (
                  <DayCard key={d.date} day={d} isToday={d.date === today} />
                ))}
              </div>
            </div>

            {/* Today's work suitability */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <SectionTitle>Today's Work Suitability</SectionTitle>
              <p className="text-xs text-slate-400 mt-1 mb-3">
                Advisory only, based on rain, heat and wind forecast for today — the site engineer makes the final call.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {overview.workability.map(w => {
                  const cfg = WORK_STATUS_CFG[w.status];
                  const Icon = cfg.icon;
                  return (
                    <div key={w.activity} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-700">{w.activity}</span>
                        <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold', cfg.color)}>
                          <Icon size={10} /> {cfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{w.reason}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rainfall history — for EOT / delay claim support */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <SectionTitle>Rainfall History</SectionTitle>
                <select value={historyDays} onChange={e => setHistoryDays(Number(e.target.value))}
                  className="h-8 rounded-lg px-2 text-xs border border-slate-200 outline-none">
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                  <option value={180}>Last 6 months</option>
                  <option value={365}>Last 12 months</option>
                </select>
              </div>
              <p className="text-xs text-slate-400 mt-1 mb-3">
                Verified historical data (not forecast) — usable to substantiate weather-related EOT claims.
              </p>

              {histLoading ? (
                <div className="py-10 text-center text-slate-400 text-sm">Loading history…</div>
              ) : history && history.monthly?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                        <th className="py-1.5 pr-3">Month</th>
                        <th className="py-1.5 pr-3 text-right">Rain Days</th>
                        <th className="py-1.5 pr-3 text-right">Total Rainfall</th>
                        <th className="py-1.5 pr-3 text-right">Max Daily</th>
                        {history.contract_rain_days_per_month != null && (
                          <th className="py-1.5 pr-3 text-right">Excess Days</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {history.monthly.map(m => (
                        <tr key={m.month} className="border-b border-slate-50">
                          <td className="py-1.5 pr-3 font-medium text-slate-700">{dayjs(m.month + '-01').format('MMM YYYY')}</td>
                          <td className="py-1.5 pr-3 text-right">{m.rain_days} / {m.days}</td>
                          <td className="py-1.5 pr-3 text-right">{m.total_rainfall_mm} mm</td>
                          <td className="py-1.5 pr-3 text-right">{m.max_daily_mm} mm</td>
                          {history.contract_rain_days_per_month != null && (
                            <td className={clsx('py-1.5 pr-3 text-right font-semibold', m.excess_rain_days > 0 ? 'text-red-600' : 'text-slate-400')}>
                              {m.excess_rain_days > 0 ? `+${m.excess_rain_days}` : '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <TrendingUp size={12} /> {history.total_rain_days} rain day{history.total_rain_days === 1 ? '' : 's'} total in this window
                    {history.contract_rain_days_per_month != null && (
                      <span className="ml-2 text-slate-400">· Contract allowance: {history.contract_rain_days_per_month}/month</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-slate-400 text-sm">No historical data for this range yet.</div>
              )}
            </div>
          </>
        )}
      </div>

      {showLocation && activeProject && (
        <LocationModal
          project={activeProject}
          current={{ ...overview?.location, ...overview, latitude: overview?.location?.latitude, longitude: overview?.location?.longitude }}
          onClose={() => setShowLocation(false)}
        />
      )}
    </div>
  );
}
