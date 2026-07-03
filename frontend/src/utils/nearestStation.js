// frontend/src/utils/nearestStation.js — "Get me there" transit helpers
// Finds the nearest CTA L station to a point and fetches live arrivals for it.

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const LINE_COLORS = {
  Red: '#ff0033', Blue: '#3b82f6', Brn: '#92400e',
  G: '#10b981', Org: '#f97316', P: '#8b5cf6',
  Pink: '#ec4899', Y: '#eab308',
}

// Module-level promise cache — stations are fetched at most once per session
let stationsPromise = null

export function loadStations() {
  if (!stationsPromise) {
    stationsPromise = fetch(`${API}/api/cta/stations`)
      .then(r => {
        if (!r.ok) throw new Error(`stations ${r.status}`)
        return r.json()
      })
      .then(d => (Array.isArray(d.stations) ? d.stations : []))
      .catch(e => {
        stationsPromise = null  // allow retry on next call
        throw e
      })
  }
  return stationsPromise
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// → { station, distanceM, walkMin } or null when no stations are available
export async function nearestStation(lat, lon) {
  const stations = await loadStations()
  let best = null
  let bestDist = Infinity
  for (const s of stations) {
    if (s.lat == null || s.lon == null) continue
    const d = haversineM(lat, lon, s.lat, s.lon)
    if (d < bestDist) { bestDist = d; best = s }
  }
  if (!best) return null
  const distanceM = Math.round(bestDist)
  return { station: best, distanceM, walkMin: Math.max(1, Math.round(distanceM / 80)) }
}

// CTA arrT is wall-clock America/Chicago, 'yyyyMMdd HH:mm:ss' (or ISO-ish 'yyyy-MM-ddTHH:mm:ss')
function parseMinutesUntil(arrTime) {
  if (typeof arrTime !== 'string') return null
  const m = arrTime.match(/^(\d{4})-?(\d{2})-?(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const arr = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  if (isNaN(arr.getTime())) return null
  // Represent "now" as a Chicago wall-clock Date so the diff is timezone-correct
  let now
  try {
    now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  } catch {
    now = new Date()
  }
  if (isNaN(now.getTime())) now = new Date()
  return Math.max(0, Math.round((arr.getTime() - now.getTime()) / 60000))
}

// → up to 3 soonest arrivals: [{ line, destination, minutes, isDelayed }]
export async function fetchArrivals(mapId) {
  const r = await fetch(`${API}/api/cta/arrivals?mapid=${encodeURIComponent(mapId)}`)
  if (!r.ok) throw new Error(`arrivals ${r.status}`)
  const d = await r.json()
  const raw = Array.isArray(d.arrivals) ? d.arrivals : []
  return raw
    .map(a => ({
      line:        a.line,
      destination: a.destination || '',
      minutes:     parseMinutesUntil(a.arrTime),
      isDelayed:   !!a.isDelayed,
    }))
    .filter(a => a.minutes != null)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 3)
}

// Escape user/upstream strings before injecting into innerHTML
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

// Shared renderer for the popup slot (Food / Nightlife pages).
// Returns HTML for a resolved station + arrivals block.
export function renderTransitHTML(info, arrivals) {
  const { station, walkMin } = info
  const dots = (station.lines || [])
    .map(l => `<span class="gmt-dot" style="background:${LINE_COLORS[l] || '#64748b'}"></span>`)
    .join('')
  const rows = arrivals.length
    ? arrivals.map(a => {
        const color = LINE_COLORS[a.line] || '#64748b'
        const eta = a.minutes <= 1 ? 'Due' : `${a.minutes} min`
        return `<div class="gmt-arrival"><span class="gmt-bullet" style="background:${color}"></span>` +
          `${escapeHtml(a.line)} → ${escapeHtml(a.destination)} · ${eta}` +
          `${a.isDelayed ? ' <span class="gmt-delay">DLY</span>' : ''}</div>`
      }).join('')
    : '<div class="gmt-arrival gmt-none">no upcoming arrivals</div>'
  return (
    `<div class="gmt-station"><span class="gmt-station-name">${escapeHtml(station.name)}</span>${dots}</div>` +
    `<div class="gmt-walk">◈ ${walkMin} MIN WALK</div>` +
    `<div class="gmt-nearest">⊙ nearest L: ${escapeHtml(station.name)} · ${walkMin} min walk</div>` +
    rows
  )
}

// Delegated click handler used by FoodPage / NightlifePage popups.
// Attach once per page: document.addEventListener('click', handleGetMeThereClick)
export async function handleGetMeThereClick(e) {
  const btn = e.target.closest?.('.gmt-btn')
  if (!btn) return
  const slot = btn.closest('.gmt-slot')
  if (!slot) return
  const lat = parseFloat(slot.dataset.lat)
  const lon = parseFloat(slot.dataset.lon)
  if (isNaN(lat) || isNaN(lon)) return
  slot.innerHTML = '<div class="gmt-status">…locating station</div>'
  try {
    const info = await nearestStation(lat, lon)
    if (!info) throw new Error('no stations')
    const arrivals = await fetchArrivals(info.station.mapId).catch(() => [])
    if (!slot.isConnected) return
    slot.innerHTML = renderTransitHTML(info, arrivals)
  } catch {
    if (slot.isConnected) slot.innerHTML = '<div class="gmt-status gmt-error">transit data unavailable</div>'
  }
}
