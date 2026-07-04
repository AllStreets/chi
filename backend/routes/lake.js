// backend/routes/lake.js
const { Router } = require('express')
const router = Router()
const { fetchWeather } = require('../lib/weather')

// NOAA CO-OPS water temperature — real Lake Michigan readings, free, no key.
// Stations tried in order: Calumet Harbor (Chicago side), Milwaukee, Holland MI.
// Calumet Harbor and Milwaukee no longer publish water_temperature, so Holland
// (across the lake) is the usual responder. Verified 2026-07.
const NOAA_STATIONS = ['9087044', '9087072', '9087031']
const NOAA_TTL = 30 * 60 * 1000
let _water = null    // { tempC: number, station: string }
let _waterAt = 0

function noaaUrl(station) {
  return `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=${station}&product=water_temperature&units=metric&time_zone=lst_ldt&format=json`
}

// Returns { tempC, station } or null. Successes are cached 30 min; failures
// are not cached so the next request retries.
async function fetchWaterTemp() {
  if (_water && Date.now() - _waterAt < NOAA_TTL) return _water
  for (const station of NOAA_STATIONS) {
    try {
      const r = await fetch(noaaUrl(station), { signal: AbortSignal.timeout(6000) })
      const j = await r.json()
      const v = parseFloat(j?.data?.[0]?.v)
      if (Number.isFinite(v)) {
        _water = { tempC: v, station }
        _waterAt = Date.now()
        return _water
      }
    } catch { /* station unavailable — try the next one */ }
  }
  return null
}

function calcNiceScore({ tempC, windMps, description }) {
  let score = 50
  const desc = description.toLowerCase()

  // Water temperature — Lake Michigan swimmability
  if (tempC >= 22)                    score += 25   // perfect swimming
  else if (tempC >= 18)               score += 15   // comfortable
  else if (tempC >= 14)               score += 0    // cool but okay
  else if (tempC >= 10)               score -= 15   // cold
  else                                score -= 35   // dangerously cold

  // Wind — lake surface chop and feel
  if (windMps < 2.5)                  score += 20   // calm, glassy
  else if (windMps < 5)               score += 10   // light breeze
  else if (windMps < 8)               score -= 10   // noticeable, choppy
  else if (windMps < 12)              score -= 25   // windy, rough
  else                                score -= 40   // dangerous

  // Sky conditions
  if (desc.includes('clear') || desc.includes('sunny'))  score += 20
  else if (desc.includes('few clouds') || desc.includes('partly'))  score += 10
  else if (desc.includes('scattered'))                   score += 5
  else if (desc.includes('overcast') || desc.includes('broken'))    score -= 10
  if (desc.includes('drizzle') || desc.includes('mist')) score -= 20
  if (desc.includes('rain'))                             score -= 35
  if (desc.includes('thunder') || desc.includes('storm'))score -= 50
  if (desc.includes('snow'))                             score -= 40

  return Math.min(100, Math.max(0, score))
}

// GET /api/lake — lake conditions + niceness score
// Air conditions come from the shared lib/weather cache (same source as
// /api/weather and /api/beach); water temperature comes from NOAA CO-OPS.
router.get('/', async (_req, res) => {
  try {
    const [w, water] = await Promise.all([fetchWeather(), fetchWaterTemp()])
    if (!w) return res.status(503).json({ error: 'No weather API key configured' })

    const airTempC    = w.temp
    const windMps     = w.wind?.speed ?? 0
    const description = w.description || ''
    const waterTempC  = water ? Math.round(water.tempC * 10) / 10 : null

    // Score against real water temp when NOAA answers; fall back to air temp.
    const niceScore = calcNiceScore({ tempC: waterTempC ?? airTempC, windMps, description })

    res.json({
      tempC:        airTempC,   // legacy field — AIR temperature (kept for backward compat)
      airTempC,                 // explicit alias so nobody mistakes it for water again
      waterTempC,               // real Lake Michigan water temp (°C) or null if NOAA is down
      waterTempF:   waterTempC != null ? Math.round(waterTempC * 9 / 5 + 32) : null,
      waterStation: water?.station ?? null,
      windMps:      Math.round(windMps * 10) / 10,
      description,
      niceScore,
      niceLabel: niceScore >= 75 ? 'Great day' : niceScore >= 40 ? 'Decent' : 'Stay inside',
    })
  } catch (e) {
    res.status(502).json({ error: 'Lake conditions unavailable', detail: e.message })
  }
})

module.exports = router
