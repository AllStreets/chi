// backend/lib/ctaRecorder.js — records CTA train positions every minute so
// the Transit time-machine can replay the last 24 hours.
const db = require('../db')
const { fetchLiveTrains } = require('../routes/cta')

const INTERVAL_MS = 60 * 1000
const RETENTION_MS = 24 * 60 * 60 * 1000

const stmtInsert = db.prepare('INSERT OR REPLACE INTO cta_snapshots (ts, data) VALUES (?, ?)')
const stmtPrune = db.prepare('DELETE FROM cta_snapshots WHERE ts < ?')

async function recordOnce() {
  const trains = await fetchLiveTrains()
  if (!trains.length) return 0
  const minimal = trains
    .filter(t => Number.isFinite(t.lat) && Number.isFinite(t.lon))
    .map(t => ({ rn: t.rn, line: t.line, lat: t.lat, lon: t.lon }))
  const ts = Date.now()
  stmtInsert.run(ts, JSON.stringify(minimal))
  stmtPrune.run(ts - RETENTION_MS)
  return minimal.length
}

function start() {
  const tick = () => recordOnce().catch(() => {})
  tick()
  const id = setInterval(tick, INTERVAL_MS)
  id.unref?.()
  return id
}

module.exports = { start, recordOnce, INTERVAL_MS, RETENTION_MS }
