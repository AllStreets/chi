// backend/routes/ai.js
const router = require('express').Router()
const db = require('../db')

const FALLBACK_RESPONSES = {
  neighborhood: () => 'This neighborhood has a unique character that makes it special. Explore the local streets, check out the restaurants, and talk to the locals to get a real feel for life here.',
  general: () => 'Chicago is an incredible city to call home. With world-class dining, rich cultural institutions, beautiful lakefront access, and a world-renowned music scene, you\'ll never run out of things to explore.',
}

router.post('/stream', async (req, res) => {
  const { prompt, context } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt required' })

  const key = process.env.OPENAI_API_KEY

  if (!key) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    const text = context === 'neighborhood' ? FALLBACK_RESPONSES.neighborhood() : FALLBACK_RESPONSES.general()
    const words = text.split(' ')
    let i = 0
    const interval = setInterval(() => {
      if (i >= words.length) {
        res.write('data: [DONE]\n\n')
        res.end()
        clearInterval(interval)
        return
      }
      res.write(`data: ${JSON.stringify({ text: words[i] + ' ' })}\n\n`)
      i++
    }, 50)
    return
  }

  try {
    const OpenAI = require('openai')
    const client = new OpenAI({ apiKey: key })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const systemPrompt = context === 'neighborhood'
      ? 'You are a Chicago local giving a new resident a warm, honest briefing about a neighborhood. Be specific, personal, and concise (3-4 sentences). No bullet points.'
      : 'You are a Chicago expert helping someone new to the city discover what makes it special. Be warm, specific, and concise (3-4 sentences).'

    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    })

    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`)
      }
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    } else {
      res.write('data: [DONE]\n\n')
      res.end()
    }
  }
})

// ── ATLAS concierge — tool-calling over internal data sources ────────────────

async function toolGetWeather() {
  try {
    const w = await require('../lib/weather').fetchWeather()
    return w || { error: 'No weather API key configured' }
  } catch (e) { return { error: e.message } }
}

async function toolGetEvents() {
  try {
    const key = process.env.TICKETMASTER_KEY
    if (!key) return { error: 'TICKETMASTER_KEY not set' }
    const start = new Date().toISOString().slice(0, 19) + 'Z'
    const end   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19) + 'Z'
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?city=Chicago&stateCode=IL&size=20&sort=date%2Casc&startDateTime=${start}&endDateTime=${end}&apikey=${key}`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(`Ticketmaster ${r.status}`)
    const json = await r.json()
    const events = (json?._embedded?.events || []).map(e => ({
      name:  e.name,
      date:  e.dates?.start?.dateTime || e.dates?.start?.localDate,
      venue: e._embedded?.venues?.[0]?.name || '',
    }))
    return { events }
  } catch (e) { return { error: e.message } }
}

// Chicago teams on the ESPN scoreboard (mirrors routes/sports.js TEAMS)
const CHI_TEAMS = [
  { name: 'Cubs',       sport: 'baseball',   league: 'mlb',   id: '112'  },
  { name: 'White Sox',  sport: 'baseball',   league: 'mlb',   id: '145'  },
  { name: 'Bears',      sport: 'football',   league: 'nfl',   id: '3'    },
  { name: 'Bulls',      sport: 'basketball', league: 'nba',   id: '4'    },
  { name: 'Blackhawks', sport: 'hockey',     league: 'nhl',   id: '4'    },
  { name: 'Fire',       sport: 'soccer',     league: 'usa.1', id: '1617' },
]

async function toolGetSportsToday() {
  try {
    const games = (await Promise.all(CHI_TEAMS.map(async t => {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${t.sport}/${t.league}/scoreboard`
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!r.ok) return []
        const json = await r.json()
        return (json?.events || [])
          .filter(e => (e.competitions?.[0]?.competitors || []).some(c => String(c.team?.id) === t.id))
          .map(e => ({ team: t.name, game: e.name, date: e.date, status: e.competitions?.[0]?.status?.type?.description || 'Scheduled' }))
      } catch { return [] }
    }))).flat()
    return { games }
  } catch (e) { return { error: e.message } }
}

// yelp_cache blob types per kind (cache keys written by routes/yelp.js)
const PLACE_TYPES = {
  food:      ['all', 'restaurants', 'cafes', 'pizza', 'sushi', 'tacos', 'brunch'],
  nightlife: ['nightlife_all', 'nightlife', 'bars', 'cocktailbars', 'danceclub', 'rooftop_bars', 'wine_bars', 'jazzandblues'],
}

function toolGetPlaces({ kind }) {
  try {
    const types = PLACE_TYPES[kind] || PLACE_TYPES.food
    const keys = types.map(t => JSON.stringify({ v: 3, type: t }))
    const rows = db.prepare(
      `SELECT data FROM yelp_cache WHERE cache_key IN (${keys.map(() => '?').join(',')}) ORDER BY cached_at DESC`
    ).all(...keys)
    const places = []
    for (const row of rows) {
      for (const p of JSON.parse(row.data)?.places || []) {
        if (places.length >= 25) break
        places.push({ name: p.name, category: p.categories?.[0] || p.amenity || '', address: p.address || '' })
      }
      if (places.length >= 25) break
    }
    return places.length ? { places } : { error: `no cached ${kind} places yet` }
  } catch (e) { return { error: e.message } }
}

async function toolGetTrainArrivals({ stationName }) {
  try {
    const stations = await require('./stations').getStations()
    const q = String(stationName || '').trim().toLowerCase()
    if (!q) return { error: 'stationName required' }
    const station = stations.find(s => s.name.toLowerCase() === q)
      || stations.find(s => s.name.toLowerCase().includes(q))
    if (!station) return { error: `No CTA station matching "${stationName}"` }
    const url = `http://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?mapid=${station.mapId}&max=8&key=${process.env.CTA_API_KEY}&outputType=JSON`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await r.json()
    const raw = data?.ctatt?.eta
    const arrivals = raw ? (Array.isArray(raw) ? raw : [raw]).map(e => ({
      station:       e.staNm,
      line:          e.rt,
      destination:   e.destNm,
      arrTime:       e.arrT,
      isApproaching: e.isApp === '1',
      isDelayed:     e.isDly === '1',
    })) : []
    return { station: station.name, lines: station.lines, arrivals }
  } catch (e) { return { error: e.message } }
}

async function toolGetCtaAlerts() {
  try {
    const r = await fetch('https://lapi.transitchicago.com/api/1.0/alerts.aspx?activeonly=true&outputType=JSON', { signal: AbortSignal.timeout(8000) })
    const data = await r.json()
    const raw = data?.CTAAlerts?.Alert
    const alerts = raw ? (Array.isArray(raw) ? raw : [raw]).map(a => ({
      headline: a.Headline,
      impact:   a.Impact,
      affected: a.ImpactedService?.Service?.map?.(s => s.ShortDescription) || [],
    })) : []
    return { alerts }
  } catch (e) { return { error: e.message } }
}

const CONCIERGE_TOOLS = [
  { type: 'function', function: { name: 'get_weather',        description: 'Current Chicago weather: temp, feels-like, daily high/low, wind, conditions.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_events',         description: 'Upcoming Chicago events (next 7 days) with name, date, and venue.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_sports_today',   description: "Today's games for Chicago teams (Cubs, White Sox, Bears, Bulls, Blackhawks, Fire) with status/scores.", parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_places',         description: 'Chicago restaurants/cafes (food) or bars/clubs (nightlife) with name, category, address.', parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['food', 'nightlife'] } }, required: ['kind'] } } },
  { type: 'function', function: { name: 'get_train_arrivals', description: 'Live CTA L train arrivals at a station, matched by station name (e.g. "Clark/Lake").', parameters: { type: 'object', properties: { stationName: { type: 'string' } }, required: ['stationName'] } } },
  { type: 'function', function: { name: 'get_cta_alerts',     description: 'Active CTA service alerts (delays, reroutes, closures).', parameters: { type: 'object', properties: {} } } },
]

async function runConciergeTool(name, args) {
  switch (name) {
    case 'get_weather':        return toolGetWeather()
    case 'get_events':         return toolGetEvents()
    case 'get_sports_today':   return toolGetSportsToday()
    case 'get_places':         return toolGetPlaces(args)
    case 'get_train_arrivals': return toolGetTrainArrivals(args)
    case 'get_cta_alerts':     return toolGetCtaAlerts()
    default:                   return { error: `unknown tool ${name}` }
  }
}

// POST /api/ai/concierge — { question } → { answer, toolsUsed }
router.post('/concierge', async (req, res) => {
  const { question } = req.body || {}
  if (typeof question !== 'string' || !question.trim() || question.length > 500) {
    return res.status(400).json({ error: 'question required (1–500 chars)' })
  }

  const key = process.env.OPENAI_API_KEY
  if (!key) return res.status(503).json({ error: 'OPENAI_API_KEY not configured' })

  try {
    const OpenAI = require('openai')
    const client = new OpenAI({ apiKey: key })

    const chicagoNow = new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })

    const messages = [
      { role: 'system', content: `You are ATLAS, the concierge for a Chicago city-intelligence app. Answer concisely (under 120 words), concretely, with specific place/line/time names from tool data. Current Chicago time: ${chicagoNow}.` },
      { role: 'user', content: question.trim() },
    ]

    const toolsUsed = []
    let answer = ''

    // Up to 4 tool-call rounds, then a final answer with tools withheld
    for (let round = 0; round <= 4; round++) {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        messages,
        ...(round < 4 ? { tools: CONCIERGE_TOOLS } : {}),
      })
      const msg = completion.choices?.[0]?.message
      if (!msg?.tool_calls?.length) {
        answer = msg?.content || ''
        break
      }
      messages.push(msg)
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name
        const short = String(name || '').replace(/^get_/, '')
        if (!toolsUsed.includes(short)) toolsUsed.push(short)
        let args = {}
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
        const result = await runConciergeTool(name, args)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
    }

    res.json({ answer, toolsUsed })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
