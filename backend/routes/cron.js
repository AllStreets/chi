// backend/routes/cron.js — serverless replacements for the interval timers in
// lib/ctaRecorder.js and lib/alertEngine.js. On a long-lived server those run
// via setInterval from server.js; on Vercel there is no process between
// requests, so Vercel Cron hits these endpoints on a schedule instead.
const router = require('express').Router()
const { recordOnce } = require('../lib/ctaRecorder')
const { runChecks } = require('../lib/alertEngine')

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Reject anything else
// so these are not publicly triggerable. If CRON_SECRET is unset the routes
// stay disabled rather than falling open.
function authorize(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET not configured' })
    return false
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' })
    return false
  }
  return true
}

// GET /api/cron/cta — one CTA train-position snapshot for the time-machine
router.get('/cta', async (req, res) => {
  if (!authorize(req, res)) return
  try {
    const recorded = await recordOnce()
    res.json({ ok: true, recorded })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/cron/alerts — one pass of the push-notification condition checks
router.get('/alerts', async (req, res) => {
  if (!authorize(req, res)) return
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_EMAIL) {
    return res.json({ ok: true, skipped: 'VAPID keys not configured' })
  }
  try {
    await runChecks()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
