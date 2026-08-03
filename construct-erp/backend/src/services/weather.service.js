// src/services/weather.service.js
// Site weather for the Planning department — forecast, live conditions and a
// verified historical archive used to substantiate weather-related EOT claims.
//
// Provider: Open-Meteo (https://open-meteo.com). Chosen because it needs no API
// key or account, so nothing has to be provisioned per environment, and because
// it exposes a historical archive going back decades — the forecast alone is no
// use when a delay claim is argued months after the fact.
const logger = require('../utils/logger');

const GEO_API      = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_API  = 'https://archive-api.open-meteo.com/v1/archive';

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_hours',
  'wind_speed_10m_max',
].join(',');

// India Meteorological Department counts a "rainy day" as >= 2.5 mm.
const DEFAULT_RAIN_DAY_MM = 2.5;

// WMO 4677 weather codes -> plain labels + the coarse buckets the DPR and
// Engineer Daily Log dropdowns already use ('sunny','cloudy','rainy','hot','windy').
const WMO = {
  0:  ['Clear sky', 'sunny'],
  1:  ['Mainly clear', 'sunny'],
  2:  ['Partly cloudy', 'cloudy'],
  3:  ['Overcast', 'cloudy'],
  45: ['Fog', 'cloudy'],
  48: ['Depositing rime fog', 'cloudy'],
  51: ['Light drizzle', 'rainy'],
  53: ['Moderate drizzle', 'rainy'],
  55: ['Dense drizzle', 'rainy'],
  56: ['Light freezing drizzle', 'rainy'],
  57: ['Dense freezing drizzle', 'rainy'],
  61: ['Slight rain', 'rainy'],
  63: ['Moderate rain', 'rainy'],
  65: ['Heavy rain', 'rainy'],
  66: ['Light freezing rain', 'rainy'],
  67: ['Heavy freezing rain', 'rainy'],
  71: ['Slight snowfall', 'rainy'],
  73: ['Moderate snowfall', 'rainy'],
  75: ['Heavy snowfall', 'rainy'],
  77: ['Snow grains', 'rainy'],
  80: ['Slight rain showers', 'rainy'],
  81: ['Moderate rain showers', 'rainy'],
  82: ['Violent rain showers', 'rainy'],
  85: ['Slight snow showers', 'rainy'],
  86: ['Heavy snow showers', 'rainy'],
  95: ['Thunderstorm', 'rainy'],
  96: ['Thunderstorm with slight hail', 'rainy'],
  99: ['Thunderstorm with heavy hail', 'rainy'],
};

function describeCode(code) {
  const hit = WMO[Number(code)];
  return { label: hit ? hit[0] : 'Unknown', bucket: hit ? hit[1] : 'cloudy' };
}

// Pick the DPR-style bucket from the whole day, not just the code: a 41 °C
// clear day is 'hot' and a gusty day is 'windy' even though the code says clear.
function dayBucket({ weather_code, temp_max, wind_max }) {
  const { bucket } = describeCode(weather_code);
  if (bucket === 'rainy') return 'rainy';
  if (Number(temp_max) >= 38) return 'hot';
  if (Number(wind_max) >= 40) return 'windy';
  return bucket;
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Weather provider returned ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.reason || 'Weather provider error');
  return body;
}

/** Resolve a project's city/state to coordinates. Returns null when not found. */
async function geocode(city, state, country = 'IN') {
  const name = String(city || '').trim();
  if (!name) return null;
  const url = `${GEO_API}?name=${encodeURIComponent(name)}&count=5&country=${country}&language=en&format=json`;
  try {
    const body = await getJson(url);
    const results = body.results || [];
    if (!results.length) return null;
    // Prefer a hit whose admin1 matches the project's state, else take the top.
    const wanted = String(state || '').trim().toLowerCase();
    const match = wanted
      ? results.find(r => String(r.admin1 || '').toLowerCase().includes(wanted))
      : null;
    const hit = match || results[0];
    return {
      latitude: hit.latitude,
      longitude: hit.longitude,
      resolved_name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
    };
  } catch (err) {
    logger?.warn?.(`[weather] geocode failed for "${name}": ${err.message}`);
    return null;
  }
}

function normaliseDaily(daily, rainDayMm) {
  const out = [];
  const t = (daily && daily.time) || [];
  for (let i = 0; i < t.length; i++) {
    const precip   = Number(daily.precipitation_sum?.[i] ?? 0);
    const tempMax  = daily.temperature_2m_max?.[i];
    const tempMin  = daily.temperature_2m_min?.[i];
    const windMax  = daily.wind_speed_10m_max?.[i];
    const code     = daily.weather_code?.[i];
    out.push({
      date: t[i],
      weather_code: code,
      condition: describeCode(code).label,
      bucket: dayBucket({ weather_code: code, temp_max: tempMax, wind_max: windMax }),
      temp_max: tempMax,
      temp_min: tempMin,
      precipitation_mm: precip,
      precipitation_hours: Number(daily.precipitation_hours?.[i] ?? 0),
      wind_max_kmh: windMax,
      is_rain_day: precip >= rainDayMm,
    });
  }
  return out;
}

/** Live conditions + N-day forecast for a coordinate. */
async function getForecast(latitude, longitude, { days = 14, rainDayMm = DEFAULT_RAIN_DAY_MM } = {}) {
  const url = `${FORECAST_API}?latitude=${latitude}&longitude=${longitude}`
    + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m`
    + `&daily=${DAILY_FIELDS}&timezone=auto&forecast_days=${days}`;
  const body = await getJson(url);
  const cur = body.current || {};
  return {
    current: {
      observed_at: cur.time,
      temperature: cur.temperature_2m,
      feels_like: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      precipitation_mm: cur.precipitation,
      wind_kmh: cur.wind_speed_10m,
      weather_code: cur.weather_code,
      condition: describeCode(cur.weather_code).label,
      bucket: describeCode(cur.weather_code).bucket,
    },
    daily: normaliseDaily(body.daily, rainDayMm),
    timezone: body.timezone,
  };
}

/** Verified past weather between two ISO dates (inclusive). */
async function getArchive(latitude, longitude, startDate, endDate, { rainDayMm = DEFAULT_RAIN_DAY_MM } = {}) {
  const url = `${ARCHIVE_API}?latitude=${latitude}&longitude=${longitude}`
    + `&start_date=${startDate}&end_date=${endDate}&daily=${DAILY_FIELDS}&timezone=auto`;
  const body = await getJson(url);
  return normaliseDaily(body.daily, rainDayMm);
}

// ── Work suitability ───────────────────────────────────────────────────────
// Thresholds reflect ordinary site practice: concrete shouldn't be placed in
// rain or extreme heat, tower cranes stop in high wind, paint and waterproofing
// need dry surfaces. Advisory only — the site engineer still decides.
const WORK_RULES = [
  {
    activity: 'Concrete Pour',
    assess: d => d.precipitation_mm >= 2.5 ? ['stop', 'Rain during placement — risk to surface finish and w/c ratio']
      : d.temp_max >= 40 ? ['stop', 'Extreme heat — rapid slump loss and plastic shrinkage cracking']
      : d.precipitation_mm >= 0.5 ? ['caution', 'Light rain expected — keep covers ready']
      : d.temp_max >= 35 ? ['caution', 'Hot weather concreting precautions required']
      : ['ok', 'Suitable for placement'],
  },
  {
    activity: 'Crane / Lifting',
    assess: d => d.wind_max_kmh >= 60 ? ['stop', 'Wind above safe lifting limit']
      : d.wind_max_kmh >= 45 ? ['caution', 'High wind — restrict large-area loads']
      : ['ok', 'Wind within working limits'],
  },
  {
    activity: 'Painting / Finishing',
    assess: d => d.precipitation_mm >= 0.5 ? ['stop', 'Wet surfaces — poor adhesion']
      : ['ok', 'Dry conditions'],
  },
  {
    activity: 'Waterproofing',
    assess: d => d.precipitation_mm >= 0.5 ? ['stop', 'Substrate will not be dry']
      : ['ok', 'Dry conditions'],
  },
  {
    activity: 'Excavation / Earthwork',
    assess: d => d.precipitation_mm >= 10 ? ['stop', 'Heavy rain — flooding and side-slope instability']
      : d.precipitation_mm >= 2.5 ? ['caution', 'Wet ground — dewatering may be needed']
      : ['ok', 'Ground conditions workable'],
  },
];

function assessWorkability(day) {
  if (!day) return [];
  return WORK_RULES.map(rule => {
    const [status, reason] = rule.assess(day);
    return { activity: rule.activity, status, reason };
  });
}

/** Roll daily rows up into per-month rain-day counts for EOT tracking. */
function summariseRainDays(days) {
  const months = new Map();
  for (const d of days) {
    const key = String(d.date).slice(0, 7);
    if (!months.has(key)) {
      months.set(key, { month: key, days: 0, rain_days: 0, total_rainfall_mm: 0, max_daily_mm: 0 });
    }
    const m = months.get(key);
    m.days += 1;
    if (d.is_rain_day) m.rain_days += 1;
    m.total_rainfall_mm += Number(d.precipitation_mm || 0);
    m.max_daily_mm = Math.max(m.max_daily_mm, Number(d.precipitation_mm || 0));
  }
  return Array.from(months.values()).map(m => ({
    ...m,
    total_rainfall_mm: Number(m.total_rainfall_mm.toFixed(1)),
    max_daily_mm: Number(m.max_daily_mm.toFixed(1)),
  }));
}

module.exports = {
  geocode,
  getForecast,
  getArchive,
  assessWorkability,
  summariseRainDays,
  describeCode,
  DEFAULT_RAIN_DAY_MM,
};
