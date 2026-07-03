// backend/routes/search.js — unified search across places, stations, neighborhoods, events
const { Router } = require('express')
const db = require('../db')
const { getStations } = require('./stations')
const { NEIGHBORHOODS } = require('./neighborhoods')
const router = Router()

const MAX_PER_KIND = 6
const STATIONS_KEY = 'cta_stations_v1'
const EVENTS_KEY   = 'search_events_v1'
const EVENTS_TTL   = 10 * 60 * 1000  // 10 minutes

const BAR_KEYWORDS = ['bar', 'cocktail', 'lounge', 'wine', 'pub', 'brewery', 'tavern', 'club']

const stmtGet       = db.prepare('SELECT data, cached_at FROM yelp_cache WHERE cache_key = ?')
const stmtSet       = db.prepare('INSERT OR REPLACE INTO yelp_cache (cache_key, data, cached_at) VALUES (?, ?, ?)')
const stmtAllBlobs  = db.prepare('SELECT data FROM yelp_cache WHERE cache_key != ? AND cache_key != ?')

// ── Matching / ranking ─────────────────────────────────────────────────────────
// startsWith outranks includes; 0 = no match
function matchRank(title, q) {
  const t = (title || '').toLowerCase()
  if (t.startsWith(q)) return 2
  if (t.includes(q))   return 1
  return 0
}

function topMatches(items, q, titleOf) {
  return items
    .map(item => ({ item, rank: matchRank(titleOf(item), q) }))
    .filter(x => x.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_PER_KIND)
    .map(x => x.item)
}

// ── Places (from cached Overpass blobs) ────────────────────────────────────────
function looksLikeBar(p) {
  if (p.amenity === 'bar' || p.amenity === 'nightclub') return true
  const cats = (Array.isArray(p.categories) ? p.categories : []).join(' ').toLowerCase()
  return BAR_KEYWORDS.some(k => cats.includes(k))
}

function collectCachedPlaces() {
  const seen = new Map()
  for (const row of stmtAllBlobs.all(STATIONS_KEY, EVENTS_KEY)) {
    let parsed
    try { parsed = JSON.parse(row.data) } catch { continue }
    const list = Array.isArray(parsed?.places) ? parsed.places
               : Array.isArray(parsed)         ? parsed
               : []
    for (const p of list) {
      if (!p || !p.name || p.lat == null || p.lon == null) continue  // must look like a place
      const key = p.id || `${p.name}|${p.lat}`
      if (!seen.has(key)) seen.set(key, p)
    }
  }
  return [...seen.values()]
}

function searchPlaces(q) {
  return topMatches(collectCachedPlaces(), q, p => p.name).map(p => {
    const category = Array.isArray(p.categories) && p.categories[0] ? p.categories[0] : ''
    return {
      kind:     'place',
      id:       p.id,
      title:    p.name,
      subtitle: [category, p.address].filter(Boolean).join(' · '),
      lat:      p.lat,
      lon:      p.lon,
      ref:      p.id,
      bar:      looksLikeBar(p),
    }
  })
}

// ── Stations ───────────────────────────────────────────────────────────────────
async function searchStations(q) {
  const stations = await getStations()
  return topMatches(stations, q, s => s.name).map(s => ({
    kind:     'station',
    id:       s.mapId,
    title:    s.name,
    subtitle: `${s.lines.join(' · ')} Line`,
    lat:      s.lat,
    lon:      s.lon,
    ref:      s.mapId,
  }))
}

// ── Neighborhoods ──────────────────────────────────────────────────────────────
// NEIGHBORHOODS objects carry no coordinates (only separate polygon data), so lat/lon are omitted
function searchNeighborhoods(q) {
  return topMatches(NEIGHBORHOODS, q, n => n.name).map(n => ({
    kind:     'neighborhood',
    id:       n.id,
    title:    n.name,
    subtitle: n.tagline,
    ref:      n.id,
  }))
}

// ── Events (Ticketmaster, 10-minute cache) ─────────────────────────────────────
async function getSearchEvents() {
  const cached = stmtGet.get(EVENTS_KEY)
  if (cached && Date.now() - cached.cached_at < EVENTS_TTL) {
    return JSON.parse(cached.data)
  }

  const key = process.env.TICKETMASTER_KEY
  if (!key) return []  // skip events silently when no key is configured

  const now   = new Date()
  const start = now.toISOString().slice(0, 19) + 'Z'
  const end   = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19) + 'Z'
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?city=Chicago&stateCode=IL&size=50&sort=date%2Casc&startDateTime=${start}&endDateTime=${end}&apikey=${key}`

  const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`Ticketmaster ${r.status}`)
  const json = await r.json()

  const events = (json?._embedded?.events || []).map(e => ({
    id:    e.id,
    name:  e.name,
    date:  e.dates?.start?.dateTime || e.dates?.start?.localDate || '',
    venue: e._embedded?.venues?.[0]?.name || '',
    url:   e.url,
  }))
  stmtSet.run(EVENTS_KEY, JSON.stringify(events), Date.now())
  return events
}

async function searchEvents(q) {
  const events = await getSearchEvents()
  return topMatches(events, q, e => e.name).map(e => ({
    kind:     'event',
    id:       e.id,
    title:    e.name,
    subtitle: [e.venue, e.date ? String(e.date).slice(0, 10) : ''].filter(Boolean).join(' · '),
    ref:      e.id || e.url,
  }))
}

// ── Route ──────────────────────────────────────────────────────────────────────
// GET /api/search?q=<query>
router.get('/', async (req, res) => {
  const raw = req.query.q
  if (raw == null || String(raw).trim() === '') {
    return res.status(400).json({ error: 'q param required' })
  }
  const q = String(raw).trim().toLowerCase()
  if (q.length < 2) return res.json({ results: [] })

  const results = []
  // each source is independent — a failure just omits that section
  try { results.push(...searchPlaces(q)) } catch {}
  try { results.push(...await searchStations(q)) } catch {}
  try { results.push(...searchNeighborhoods(q)) } catch {}
  try { results.push(...await searchEvents(q)) } catch {}

  res.json({ results })
})

module.exports = router
