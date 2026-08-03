// src/routes/weather.routes.js — Site Weather for the Planning department
//
// Serves live conditions, a 14-day forecast, work-suitability advice and a
// verified rainfall archive per project. Observations are also written to
// project_weather_daily so a rain-day claim can be evidenced from data captured
// at the time rather than re-queried years later.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { userCanAccessProject } = require('../middleware/projectScope');
const weather = require('../services/weather.service');

const router = express.Router();
router.use(authenticate);

/* ── Auto-migrate ──────────────────────────────────────────────────────── */
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch {} };
  await safe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6)`);
  await safe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6)`);
  await safe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS weather_location_name TEXT`);
  // Contractual rain-day allowance, used to flag when EOT entitlement starts.
  await safe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS rain_day_threshold_mm NUMERIC(5,2) DEFAULT 2.5`);
  await safe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_rain_days_per_month INTEGER`);
  await safe(`
    CREATE TABLE IF NOT EXISTS project_weather_daily (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id          UUID,
      project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      obs_date            DATE NOT NULL,
      weather_code        INTEGER,
      condition           TEXT,
      bucket              TEXT,
      temp_max            NUMERIC(5,2),
      temp_min            NUMERIC(5,2),
      precipitation_mm    NUMERIC(7,2),
      precipitation_hours NUMERIC(5,2),
      wind_max_kmh        NUMERIC(6,2),
      is_rain_day         BOOLEAN DEFAULT FALSE,
      source              TEXT DEFAULT 'open-meteo',
      captured_at         TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (project_id, obs_date)
    )
  `);
  await safe(`CREATE INDEX IF NOT EXISTS idx_pwd_project_date ON project_weather_daily(project_id, obs_date DESC)`);
})();

/* ── Helpers ───────────────────────────────────────────────────────────── */

async function loadProject(req, projectId) {
  if (!projectId) {
    const err = new Error('project_id is required');
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await query(
    `SELECT id, company_id, name, project_code, city, state, location,
            latitude, longitude, weather_location_name,
            rain_day_threshold_mm, contract_rain_days_per_month
       FROM projects WHERE id = $1 AND company_id = $2`,
    [projectId, req.user.company_id]
  );
  const project = rows[0];
  if (!project) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }
  if (!userCanAccessProject(req, project.id)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
  return project;
}

// Coordinates are resolved once from the project's city/state and cached on the
// row, so the geocoder isn't hit on every page load.
async function ensureCoordinates(project) {
  if (project.latitude != null && project.longitude != null) {
    return {
      latitude: Number(project.latitude),
      longitude: Number(project.longitude),
      resolved_name: project.weather_location_name || project.city,
    };
  }
  const hit = await weather.geocode(project.city, project.state);
  if (!hit) return null;
  await query(
    `UPDATE projects SET latitude=$1, longitude=$2, weather_location_name=$3 WHERE id=$4`,
    [hit.latitude, hit.longitude, hit.resolved_name, project.id]
  );
  return hit;
}

// Persist observed days so the archive survives independently of the provider.
async function recordObservations(project, days) {
  for (const d of days) {
    try {
      await query(`
        INSERT INTO project_weather_daily (
          company_id, project_id, obs_date, weather_code, condition, bucket,
          temp_max, temp_min, precipitation_mm, precipitation_hours,
          wind_max_kmh, is_rain_day
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (project_id, obs_date) DO UPDATE SET
          weather_code=EXCLUDED.weather_code, condition=EXCLUDED.condition,
          bucket=EXCLUDED.bucket, temp_max=EXCLUDED.temp_max, temp_min=EXCLUDED.temp_min,
          precipitation_mm=EXCLUDED.precipitation_mm,
          precipitation_hours=EXCLUDED.precipitation_hours,
          wind_max_kmh=EXCLUDED.wind_max_kmh, is_rain_day=EXCLUDED.is_rain_day,
          captured_at=NOW()
      `, [
        project.company_id, project.id, d.date, d.weather_code, d.condition, d.bucket,
        d.temp_max, d.temp_min, d.precipitation_mm, d.precipitation_hours,
        d.wind_max_kmh, d.is_rain_day,
      ]);
    } catch { /* archiving is best-effort; never block the response */ }
  }
}

const noLocation = (project) => ({
  configured: false,
  project: { id: project.id, name: project.name, code: project.project_code },
  message: `No location set for ${project.name}. Add the project's city (or set coordinates) to enable site weather.`,
});

/* ── GET /planning/weather/overview ────────────────────────────────────── */
// Live conditions, 14-day forecast and today's work-suitability advice.
router.get('/overview', async (req, res) => {
  try {
    const project = await loadProject(req, req.query.project_id);
    const coords = await ensureCoordinates(project);
    if (!coords) return res.json({ data: noLocation(project) });

    const rainDayMm = Number(project.rain_day_threshold_mm || weather.DEFAULT_RAIN_DAY_MM);
    const fc = await weather.getForecast(coords.latitude, coords.longitude, { days: 14, rainDayMm });

    // Only past/present days are real observations — don't archive forecasts.
    const today = new Date().toISOString().slice(0, 10);
    await recordObservations(project, fc.daily.filter(d => d.date <= today));

    const todayRow = fc.daily.find(d => d.date === today) || fc.daily[0];
    res.json({
      data: {
        configured: true,
        project: { id: project.id, name: project.name, code: project.project_code },
        location: {
          name: coords.resolved_name || project.city,
          latitude: coords.latitude,
          longitude: coords.longitude,
          timezone: fc.timezone,
        },
        rain_day_threshold_mm: rainDayMm,
        current: fc.current,
        today: todayRow,
        forecast: fc.daily,
        workability: weather.assessWorkability(todayRow),
        forecast_rain_days: fc.daily.filter(d => d.is_rain_day).length,
        source: 'Open-Meteo',
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/* ── GET /planning/weather/history ─────────────────────────────────────── */
// Verified past weather for a date range, with monthly rain-day rollup.
router.get('/history', async (req, res) => {
  try {
    const project = await loadProject(req, req.query.project_id);
    const coords = await ensureCoordinates(project);
    if (!coords) return res.json({ data: noLocation(project) });

    const today = new Date();
    const defaultFrom = new Date(today.getTime() - 89 * 86400000).toISOString().slice(0, 10);
    // The archive lags ~5 days behind real time; clamp so it never 400s.
    const maxTo = new Date(today.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    const from = req.query.from || defaultFrom;
    let to = req.query.to || maxTo;
    if (to > maxTo) to = maxTo;
    if (from > to) return res.json({ data: { configured: true, days: [], monthly: [] } });

    const rainDayMm = Number(project.rain_day_threshold_mm || weather.DEFAULT_RAIN_DAY_MM);
    const days = await weather.getArchive(coords.latitude, coords.longitude, from, to, { rainDayMm });
    await recordObservations(project, days);

    const monthly = weather.summariseRainDays(days);
    const allowance = project.contract_rain_days_per_month;
    res.json({
      data: {
        configured: true,
        from, to,
        rain_day_threshold_mm: rainDayMm,
        contract_rain_days_per_month: allowance,
        days,
        monthly: monthly.map(m => ({
          ...m,
          // Days beyond the contractual allowance are the ones an EOT claim rests on.
          excess_rain_days: allowance == null ? null : Math.max(0, m.rain_days - allowance),
        })),
        total_rain_days: days.filter(d => d.is_rain_day).length,
        source: 'Open-Meteo',
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/* ── GET /planning/weather/today ───────────────────────────────────────── */
// Compact payload for auto-filling the DPR / Engineer Daily Log weather field.
router.get('/today', async (req, res) => {
  try {
    const project = await loadProject(req, req.query.project_id);
    const coords = await ensureCoordinates(project);
    if (!coords) return res.json({ data: { configured: false } });

    const rainDayMm = Number(project.rain_day_threshold_mm || weather.DEFAULT_RAIN_DAY_MM);
    const fc = await weather.getForecast(coords.latitude, coords.longitude, { days: 1, rainDayMm });
    const today = fc.daily[0] || null;
    res.json({
      data: {
        configured: true,
        date: today?.date,
        bucket: today?.bucket || fc.current.bucket,   // matches the existing dropdown values
        condition: today?.condition || fc.current.condition,
        temp_max: today?.temp_max,
        temp_min: today?.temp_min,
        precipitation_mm: today?.precipitation_mm,
        wind_max_kmh: today?.wind_max_kmh,
        is_rain_day: today?.is_rain_day || false,
        current_temperature: fc.current.temperature,
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/* ── PATCH /planning/weather/location ──────────────────────────────────── */
// Override coordinates / thresholds when the city lookup isn't precise enough.
router.patch('/location', async (req, res) => {
  try {
    const { project_id, latitude, longitude, weather_location_name,
            rain_day_threshold_mm, contract_rain_days_per_month } = req.body;
    const project = await loadProject(req, project_id);

    if (latitude != null && (Number(latitude) < -90 || Number(latitude) > 90)) {
      return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
    }
    if (longitude != null && (Number(longitude) < -180 || Number(longitude) > 180)) {
      return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
    }

    const { rows } = await query(`
      UPDATE projects SET
        latitude = COALESCE($1, latitude),
        longitude = COALESCE($2, longitude),
        weather_location_name = COALESCE($3, weather_location_name),
        rain_day_threshold_mm = COALESCE($4, rain_day_threshold_mm),
        contract_rain_days_per_month = COALESCE($5, contract_rain_days_per_month)
      WHERE id = $6
      RETURNING latitude, longitude, weather_location_name,
                rain_day_threshold_mm, contract_rain_days_per_month
    `, [
      latitude ?? null, longitude ?? null, weather_location_name ?? null,
      rain_day_threshold_mm ?? null, contract_rain_days_per_month ?? null,
      project.id,
    ]);
    res.json({ data: rows[0], message: 'Weather settings updated' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
