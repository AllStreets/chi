// backend/routes/stations.js — CTA L stations from the City of Chicago open data portal
const { Router } = require('express')
const db = require('../db')
const router = Router()

const DATASET_URL = 'https://data.chicago.gov/resource/8pix-ypme.json?$limit=1000'
const CACHE_KEY   = 'cta_stations_v1'
const TTL_MS      = 7 * 24 * 60 * 60 * 1000  // 7 days

// dataset flag → line id used across the app (see cta.js LINE_COLORS)
const LINE_FLAGS = [
  ['red',  'Red'],
  ['blue', 'Blue'],
  ['g',    'G'],
  ['brn',  'Brn'],
  ['p',    'P'],
  ['pexp', 'P'],
  ['y',    'Y'],
  ['pnk',  'Pink'],
  ['o',    'Org'],
]

const stmtGet = db.prepare('SELECT data, cached_at FROM yelp_cache WHERE cache_key = ?')
const stmtSet = db.prepare('INSERT OR REPLACE INTO yelp_cache (cache_key, data, cached_at) VALUES (?, ?, ?)')

// Socrata checkbox fields may arrive as booleans or "true"/"false" strings
const truthy = v => v === true || v === 'true'

// Collapse per-stop rows into unique stations keyed by map_id
function collapseStations(rows) {
  const byId = new Map()
  for (const row of rows) {
    const mapId = row.map_id
    if (!mapId) continue
    let station = byId.get(mapId)
    if (!station) {
      station = {
        mapId,
        name:  row.station_name || row.station_descriptive_name || '',
        lines: new Set(),
        lat:   row.location?.latitude  != null ? parseFloat(row.location.latitude)  : null,
        lon:   row.location?.longitude != null ? parseFloat(row.location.longitude) : null,
      }
      byId.set(mapId, station)
    }
    // a station has a line if ANY of its stop rows has that flag true
    for (const [flag, line] of LINE_FLAGS) {
      if (truthy(row[flag])) station.lines.add(line)
    }
  }
  return [...byId.values()].map(s => ({ ...s, lines: [...s.lines] }))
}

// Returns the collapsed stations array (cached 7 days; stale-on-error fallback).
// Also consumed by routes/search.js.
async function getStations() {
  const cached = stmtGet.get(CACHE_KEY)
  if (cached && Date.now() - cached.cached_at < TTL_MS) {
    return JSON.parse(cached.data)
  }
  try {
    const r = await fetch(DATASET_URL, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error(`L-stops dataset ${r.status}`)
    const rows = await r.json()
    const stations = collapseStations(Array.isArray(rows) ? rows : [])
    stmtSet.run(CACHE_KEY, JSON.stringify(stations), Date.now())
    return stations
  } catch (e) {
    if (cached) return JSON.parse(cached.data)  // serve stale on upstream failure
    throw e
  }
}

// GET /api/cta/stations
router.get('/stations', async (_req, res) => {
  try {
    const stations = await getStations()
    res.json({ stations })
  } catch (e) {
    res.status(502).json({ error: 'CTA stations unavailable', detail: e.message })
  }
})

module.exports = { router, getStations }
