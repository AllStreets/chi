// backend/lib/alertEngine.js — checks live city conditions every 5 minutes and
// pushes web notifications through routes/push.js sendToAll(). Each alert is
// deduped via the alert_log table: one send per key per 12 hours.
const db = require('../db')
const { sendToAll } = require('../routes/push')

const INTERVAL_MS = 5 * 60 * 1000
const DEDUPE_MS = 12 * 60 * 60 * 1000

const LAT = 41.8919
const LON = -87.6197
const OWM_URL = () =>
  `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`

try {
  db.exec(`CREATE TABLE IF NOT EXISTS alert_log (
    key TEXT PRIMARY KEY,
    sent_at INTEGER NOT NULL
  )`)
} catch {}

// ── Dedupe helpers ───────────────────────────────────────────────────────────
function alreadySent(key) {
  const row = db.prepare('SELECT sent_at FROM alert_log WHERE key = ?').get(key)
  return !!row && Date.now() - row.sent_at < DEDUPE_MS
}

function markSent(key) {
  db.prepare('INSERT OR REPLACE INTO alert_log (key, sent_at) VALUES (?, ?)').run(key, Date.now())
}

async function notify(key, prefKey, title, body) {
  if (alreadySent(key)) return
  await sendToAll({ title, body }, prefKey)
  markSent(key)
}

// ── Chicago time helpers ─────────────────────────────────────────────────────
function chicagoDateKey() {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replace(/-/g, '')
}

function chicagoHour() {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', hour12: false,
  }).format(new Date())) % 24
}

function chicagoTime(date) {
  return new Date(date).toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit',
  })
}

// ── a. Game starting within 30 minutes (ESPN, same feeds as routes/sports.js) ─
const TEAMS = [
  { name: 'Cubs',       sport: 'baseball',   league: 'mlb',   id: '112',  verb: 'first pitch' },
  { name: 'White Sox',  sport: 'baseball',   league: 'mlb',   id: '145',  verb: 'first pitch' },
  { name: 'Bears',      sport: 'football',   league: 'nfl',   id: '3',    verb: 'kick off'    },
  { name: 'Bulls',      sport: 'basketball', league: 'nba',   id: '4',    verb: 'tip off'     },
  { name: 'Blackhawks', sport: 'hockey',     league: 'nhl',   id: '4',    verb: 'puck drop'   },
  { name: 'Fire',       sport: 'soccer',     league: 'usa.1', id: '1617', verb: 'kick off'    },
]

async function checkGameStart() {
  const scoreboards = {} // one fetch per league
  for (const team of TEAMS) {
    try {
      const lg = `${team.sport}/${team.league}`
      if (!(lg in scoreboards)) {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${lg}/scoreboard`
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
        scoreboards[lg] = r.ok ? (await r.json())?.events || [] : []
      }
      const games = scoreboards[lg].filter(e =>
        (e.competitions?.[0]?.competitors || []).some(c => String(c.team?.id) === String(team.id))
      )
      for (const game of games) {
        const state = game.competitions?.[0]?.status?.type?.state || 'pre'
        if (state !== 'pre') continue
        const untilStart = new Date(game.date).getTime() - Date.now()
        if (untilStart < 0 || untilStart > 30 * 60 * 1000) continue
        await notify(
          `game_${game.id}`,
          'gameStart',
          'Game starting soon',
          `${team.name} ${team.verb} at ${chicagoTime(game.date)}`
        )
      }
    } catch { /* one team failing must not block the rest */ }
  }
}

// ── b. Severe weather (OpenWeather, same source as routes/weather.js) ────────
async function checkSevereWeather() {
  if (!process.env.OPENWEATHER_API_KEY) return
  const r = await fetch(OWM_URL(), { signal: AbortSignal.timeout(8000) })
  const d = await r.json()
  const group = d?.weather?.[0]?.main || ''
  const description = d?.weather?.[0]?.description || group
  const windMph = (d?.wind?.speed ?? 0) * 2.237

  if (['Thunderstorm', 'Tornado', 'Squall'].includes(group)) {
    await notify(
      `wx_${chicagoDateKey()}_${group.toLowerCase()}`,
      'severeWeather',
      'Severe weather in Chicago',
      `${description.charAt(0).toUpperCase()}${description.slice(1)} conditions reported — stay aware.`
    )
  } else if (windMph > 40) {
    await notify(
      `wx_${chicagoDateKey()}_wind`,
      'severeWeather',
      'High wind warning',
      `Winds at ${Math.round(windMph)} mph in Chicago right now.`
    )
  }
}

// ── c. Great lake day (niceScore mirrors routes/lake.js, mornings only) ──────
function calcNiceScore({ tempC, windMps, description }) {
  let score = 50
  const desc = description.toLowerCase()

  if (tempC >= 22)      score += 25
  else if (tempC >= 18) score += 15
  else if (tempC >= 14) score += 0
  else if (tempC >= 10) score -= 15
  else                  score -= 35

  if (windMps < 2.5)    score += 20
  else if (windMps < 5) score += 10
  else if (windMps < 8) score -= 10
  else if (windMps < 12) score -= 25
  else                  score -= 40

  if (desc.includes('clear') || desc.includes('sunny'))  score += 20
  else if (desc.includes('few clouds') || desc.includes('partly')) score += 10
  else if (desc.includes('scattered'))                   score += 5
  else if (desc.includes('overcast') || desc.includes('broken')) score -= 10
  if (desc.includes('drizzle') || desc.includes('mist')) score -= 20
  if (desc.includes('rain'))                             score -= 35
  if (desc.includes('thunder') || desc.includes('storm')) score -= 50
  if (desc.includes('snow'))                             score -= 40

  return Math.min(100, Math.max(0, score))
}

async function checkGreatLakeDay() {
  const hour = chicagoHour()
  if (hour < 8 || hour >= 11) return
  if (!process.env.OPENWEATHER_API_KEY) return
  const r = await fetch(OWM_URL(), { signal: AbortSignal.timeout(8000) })
  const d = await r.json()
  const tempC = d?.main?.temp
  const windMps = d?.wind?.speed
  const description = d?.weather?.[0]?.description
  if (tempC == null || windMps == null || !description) return
  const niceScore = calcNiceScore({ tempC, windMps, description })
  if (niceScore < 80) return
  await notify(
    `lake_${chicagoDateKey()}`,
    'greatLakeDay',
    'Great lake day',
    `Lake Michigan is looking excellent — ${niceScore}/100. Get out there.`
  )
}

// ── d. CTA L line delays (same upstream feed as routes/cta.js /alerts) ───────
async function checkLineDelays() {
  const r = await fetch(
    'https://lapi.transitchicago.com/api/1.0/alerts.aspx?activeonly=true&outputType=JSON',
    { signal: AbortSignal.timeout(8000) }
  )
  const data = await r.json()
  const raw = data?.CTAAlerts?.Alert
  const alerts = raw ? (Array.isArray(raw) ? raw : [raw]) : []
  for (const a of alerts) {
    if (!String(a.Impact || '').includes('Delay')) continue
    const affected = a.ImpactedService?.Service?.map?.(s => s.ShortDescription)?.filter(Boolean) || []
    await notify(
      `cta_${a.AlertId}`,
      'lineDelays',
      affected.length ? `CTA delay — ${affected.join(', ')}` : 'CTA delay',
      a.Headline || 'Delays reported on the L.'
    )
  }
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function runChecks() {
  try { await checkGameStart() } catch {}
  try { await checkSevereWeather() } catch {}
  try { await checkGreatLakeDay() } catch {}
  try { await checkLineDelays() } catch {}
}

function start() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_EMAIL) {
    console.log('[alertEngine] VAPID keys not configured — alert engine disabled')
    return null
  }
  const tick = () => runChecks().catch(() => {})
  tick()
  const id = setInterval(tick, INTERVAL_MS)
  id.unref?.()
  return id
}

module.exports = { start, runChecks, INTERVAL_MS, DEDUPE_MS }
