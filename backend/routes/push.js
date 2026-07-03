// backend/routes/push.js
const router = require('express').Router()
const db = require('../db')

// Lazy-load web-push only if keys are configured
function getWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL
  if (!pub || !priv || !email) return null
  const webpush = require('web-push')
  webpush.setVapidDetails(`mailto:${email}`, pub, priv)
  return webpush
}

// Store subscriptions
try {
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE NOT NULL,
    keys TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`)
} catch {}

// Safe migration — per-subscription notification preferences
try { db.exec(`ALTER TABLE push_subscriptions ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}'`) } catch {}

function parsePrefs(raw) {
  try { return JSON.parse(raw || '{}') || {} } catch { return {} }
}

// Send a payload to every subscription. When prefKey is given, subscriptions
// whose parsed prefs[prefKey] === false are skipped (missing key = opted in).
// Subscriptions rejected upstream with 404/410 are deleted as expired.
async function sendToAll(payload, prefKey) {
  const webpush = getWebPush()
  if (!webpush) return { sent: 0 }
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const subs = db.prepare('SELECT * FROM push_subscriptions').all()
  let sent = 0
  for (const sub of subs) {
    if (prefKey && parsePrefs(sub.prefs)[prefKey] === false) continue
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: JSON.parse(sub.keys) }, body)
      sent++
    } catch (e) {
      const code = e?.statusCode
      if (code === 404 || code === 410) {
        try { db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint) } catch {}
      }
    }
  }
  return { sent }
}

// GET /api/push/vapid-key — public key for frontend subscription
router.get('/vapid-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY
  res.json({ key: key || null })
})

// POST /api/push/subscribe — save subscription (prefs optional; preserved on re-subscribe)
router.post('/subscribe', (req, res) => {
  const { endpoint, keys, prefs } = req.body
  if (!endpoint || !keys) return res.status(400).json({ error: 'endpoint and keys required' })
  try {
    const prefsJson = prefs && typeof prefs === 'object' ? JSON.stringify(prefs) : null
    db.prepare(`
      INSERT INTO push_subscriptions (endpoint, keys, prefs)
      VALUES (?, ?, COALESCE(?, '{}'))
      ON CONFLICT(endpoint) DO UPDATE SET
        keys  = excluded.keys,
        prefs = COALESCE(?, push_subscriptions.prefs)
    `).run(endpoint, JSON.stringify(keys), prefsJson, prefsJson)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/push/prefs?endpoint= — read preferences for one subscription
router.get('/prefs', (req, res) => {
  const { endpoint } = req.query
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' })
  const row = db.prepare('SELECT prefs FROM push_subscriptions WHERE endpoint = ?').get(endpoint)
  if (!row) return res.status(404).json({ error: 'unknown endpoint' })
  res.json({ prefs: parsePrefs(row.prefs) })
})

// POST /api/push/prefs { endpoint, prefs } — update preferences (merged into existing)
router.post('/prefs', (req, res) => {
  const { endpoint, prefs } = req.body
  if (!endpoint || !prefs || typeof prefs !== 'object') {
    return res.status(400).json({ error: 'endpoint and prefs required' })
  }
  const row = db.prepare('SELECT prefs FROM push_subscriptions WHERE endpoint = ?').get(endpoint)
  if (!row) return res.status(404).json({ error: 'unknown endpoint' })
  try {
    const merged = { ...parsePrefs(row.prefs), ...prefs }
    db.prepare('UPDATE push_subscriptions SET prefs = ? WHERE endpoint = ?').run(JSON.stringify(merged), endpoint)
    res.json({ ok: true, prefs: merged })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/push/send — send notification to all subscriptions
router.post('/send', async (req, res) => {
  if (!getWebPush()) return res.status(503).json({ error: 'VAPID keys not configured' })
  const { title, body } = req.body
  const { sent } = await sendToAll({ title, body })
  res.json({ sent })
})

module.exports = router
module.exports.sendToAll = sendToAll
