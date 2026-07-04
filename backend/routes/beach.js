// backend/routes/beach.js
const { Router } = require('express')
const router = Router()
const { BEACHES, swimAdvisory } = require('../lib/beaches')
const { fetchWeather } = require('../lib/weather')

const BEACH_DESCRIPTIONS = {
  oak:      'Closest to Streeterville. Scenic skyline views.',
  north:    'Volleyball, concessions, boathouse. Most popular in summer.',
  '31st':   'South Side gem. Calmer, less crowded.',
  montrose: 'Dog beach and birding area. Most natural feel.',
}

// GET /api/beach — advisories for the four lakefront beaches.
// Uses the shared lib/weather fetch (same cached source as /api/weather and
// /api/lake) so beach tiles never contradict the lake scene.
router.get('/', async (_req, res) => {
  try {
    const w = await fetchWeather()
    if (!w) {
      return res.json({
        beaches: BEACHES.map(b => ({ ...b, description: BEACH_DESCRIPTIONS[b.id] || '', advisory: { label: 'Add OPENWEATHER_KEY', color: '#64748b', score: null }, weather: null })),
        keyMissing: true,
      })
    }

    const tempC   = w.temp
    const windMps = w.wind?.speed ?? 0
    const desc    = w.description || ''
    const advisory = swimAdvisory(tempC, windMps, desc)
    const weather = {
      tempF:    w.tempF,
      windMph:  w.windMph,
      humidity: w.humidity,
      desc,
    }

    res.json({
      beaches: BEACHES.map(b => ({
        ...b,
        description: BEACH_DESCRIPTIONS[b.id] || '',
        weather,
        advisory,
      })),
    })
  } catch (e) {
    res.status(502).json({ error: 'Beach data unavailable', detail: e.message })
  }
})

module.exports = router
