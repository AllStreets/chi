// routes/finance.js — CHI ATLAS finance data
//
// Endpoints:
//   GET /api/finance/stocks      Chicago equities + US index ETF proxies (Finnhub)
//   GET /api/finance/extras      crypto / fear&greed / fx / treasury yields /
//                                Chicago city pulse / economic pulse
//   GET /api/finance/rents       static neighborhood rent reference (indicative)
//   GET /api/finance/indicators  static economic indicators (indicative fallback)
//
// Data sources (all free tier; curl-verified):
//   Finnhub quotes ......... needs FINNHUB_API_KEY (free @ finnhub.io, 60 req/min).
//                            24 symbols/sweep @ 60s TTL during market hours = 24/min.
//                            Without the key we serve static indicative quotes.
//   CoinGecko .............. keyless. BTC/ETH/SOL spot + 24h change. Cached 90s.
//   alternative.me ......... keyless. Crypto Fear & Greed index. Updates daily; 1h TTL.
//   Frankfurter (ECB) ...... keyless. USD vs EUR/GBP/JPY/CAD/MXN. ECB fixes ~16:00 CET; 1h TTL.
//   treasury.gov ........... keyless XML. Daily yield curve (3M/2Y/10Y/30Y). 6h TTL.
//   data.cityofchicago.org . keyless Socrata. Building permits (ydr8-5enu) and
//                            business licenses (r5kz-chrr), 30d vs prior 30d. 6h TTL.
//   FRED ................... needs FRED_API_KEY (free @ fred.stlouisfed.org).
//                            CPIAUCSL (YoY computed), UNRATE, FEDFUNDS, ILURN. 12h TTL.
//                            Without the key the Economic Pulse stays indicative.
//
// Every section carries { data, fetchedAt, source, cadence } where cadence is one
// of LIVE / DAILY / MONTHLY / INDICATIVE so the UI can label honesty per tile.
// Each upstream has its own cache key + TTL (stale-while-revalidate); one failing
// source never breaks the endpoint — its section is served stale or omitted.

const { Router } = require('express')
const db = require('../db')
const router = Router()

const stmtGet = db.prepare('SELECT data, cached_at FROM yelp_cache WHERE cache_key = ?')
const stmtSet = db.prepare('INSERT OR REPLACE INTO yelp_cache (cache_key, data, cached_at) VALUES (?, ?, ?)')

const CHICAGO_STOCKS = [
  { symbol: 'CME',  name: 'CME Group',           sector: 'Finance'    },
  { symbol: 'BA',   name: 'Boeing',               sector: 'Aerospace'  },
  { symbol: 'UAL',  name: 'United Airlines',      sector: 'Travel'     },
  { symbol: 'ABT',  name: 'Abbott Labs',          sector: 'Healthcare' },
  { symbol: 'ABBV', name: 'AbbVie',               sector: 'Pharma'     },
  { symbol: 'EXC',  name: 'Exelon',               sector: 'Energy'     },
  { symbol: 'MORN', name: 'Morningstar',          sector: 'Finance'    },
  { symbol: 'ALL',  name: 'Allstate',             sector: 'Insurance'  },
  { symbol: 'H',    name: 'Hyatt Hotels',         sector: 'Hospitality'},
  { symbol: 'MCD',  name: "McDonald's",           sector: 'Food'       },
  { symbol: 'MSI',  name: 'Motorola Solutions',   sector: 'Tech'       },
  { symbol: 'WBA',  name: 'Walgreens',            sector: 'Retail'     },
  { symbol: 'KHC',  name: 'Kraft Heinz',          sector: 'Food'       },
  { symbol: 'NTRS', name: 'Northern Trust',       sector: 'Finance'    },
  { symbol: 'ITW',  name: 'Ill. Tool Works',      sector: 'Industry'   },
  { symbol: 'CDW',  name: 'CDW Corporation',      sector: 'Tech'       },
  { symbol: 'TRU',  name: 'TransUnion',           sector: 'Finance'    },
  { symbol: 'ZBRA', name: 'Zebra Technologies',   sector: 'Tech'       },
  { symbol: 'GATX', name: 'GATX Corporation',     sector: 'Industry'   },
  { symbol: 'USFD', name: 'US Foods',             sector: 'Food'       },
]

// US index ETF proxies — fetched in the same Finnhub sweep (24 symbols total,
// still inside the free tier's 60/min at a 60s market-hours TTL).
const US_ETFS = [
  { symbol: 'SPY', name: 'S&P 500',      note: 'SPY ETF' },
  { symbol: 'QQQ', name: 'Nasdaq 100',   note: 'QQQ ETF' },
  { symbol: 'DIA', name: 'Dow Jones',    note: 'DIA ETF' },
  { symbol: 'IWM', name: 'Russell 2000', note: 'IWM ETF' },
]

const MOCK_QUOTES = {
  CME:  { price: 227.84, change: 1.23,  changePct: 0.54,  high: 229.10, low: 225.30, open: 226.00, prevClose: 226.61, history: [224.10, 225.30, 223.80, 226.50, 225.90, 226.61, 227.84], week52Low: 185.20, week52High: 243.40 },
  BA:   { price: 172.45, change: -2.18, changePct: -1.25, high: 174.80, low: 171.20, open: 174.50, prevClose: 174.63, history: [178.20, 176.50, 175.80, 177.40, 175.20, 174.63, 172.45], week52Low: 159.80, week52High: 267.54 },
  UAL:  { price: 68.92,  change: 0.87,  changePct: 1.28,  high: 69.45,  low: 67.80,  open: 68.10,  prevClose: 68.05,  history: [65.80,  66.40,  67.10,  66.80,  68.20,  68.05,  68.92],  week52Low: 37.45,  week52High: 102.38 },
  ABT:  { price: 126.34, change: -0.45, changePct: -0.35, high: 127.20, low: 125.80, open: 126.70, prevClose: 126.79, history: [128.10, 127.50, 126.90, 127.80, 127.20, 126.79, 126.34], week52Low: 100.34, week52High: 137.80 },
  ABBV: { price: 171.24, change: 0.83,  changePct: 0.49,  high: 172.00, low: 170.10, open: 170.50, prevClose: 170.41, history: [168.50, 169.20, 170.10, 169.80, 170.90, 170.41, 171.24], week52Low: 148.70, week52High: 202.84 },
  EXC:  { price: 42.18,  change: 0.32,  changePct: 0.76,  high: 42.55,  low: 41.90,  open: 41.95,  prevClose: 41.86,  history: [41.20,  41.50,  42.10,  41.80,  42.30,  41.86,  42.18],  week52Low: 34.80,  week52High: 47.20  },
  MORN: { price: 289.60, change: 3.40,  changePct: 1.19,  high: 290.80, low: 286.20, open: 287.00, prevClose: 286.20, history: [281.20, 283.50, 285.80, 284.20, 287.00, 286.20, 289.60], week52Low: 240.10, week52High: 312.50 },
  ALL:  { price: 198.75, change: -1.05, changePct: -0.53, high: 200.10, low: 198.20, open: 199.50, prevClose: 199.80, history: [202.10, 201.50, 200.80, 201.20, 200.40, 199.80, 198.75], week52Low: 155.30, week52High: 218.90 },
  H:    { price: 156.22, change: 0.68,  changePct: 0.44,  high: 157.00, low: 155.40, open: 155.80, prevClose: 155.54, history: [153.40, 154.20, 155.80, 154.90, 156.10, 155.54, 156.22], week52Low: 128.50, week52High: 182.40 },
  MCD:  { price: 296.40, change: 1.95,  changePct: 0.66,  high: 297.50, low: 294.80, open: 295.10, prevClose: 294.45, history: [291.20, 293.50, 292.80, 294.10, 295.50, 294.45, 296.40], week52Low: 243.70, week52High: 316.95 },
  MSI:  { price: 484.30, change: -3.20, changePct: -0.66, high: 488.00, low: 483.10, open: 487.20, prevClose: 487.50, history: [492.10, 490.50, 488.20, 489.80, 487.50, 487.50, 484.30], week52Low: 362.40, week52High: 521.20 },
  WBA:  { price: 10.84,  change: -0.23, changePct: -2.08, high: 11.20,  low: 10.75,  open: 11.05,  prevClose: 11.07,  history: [12.40,  11.90,  11.50,  11.20,  11.10,  11.07,  10.84],  week52Low: 8.60,   week52High: 20.30  },
  KHC:  { price: 29.45,  change: 0.12,  changePct: 0.41,  high: 29.70,  low: 29.10,  open: 29.30,  prevClose: 29.33,  history: [28.90,  29.10,  29.30,  29.20,  29.40,  29.33,  29.45],  week52Low: 27.05,  week52High: 40.84  },
  NTRS: { price: 94.18,  change: -0.62, changePct: -0.65, high: 95.10,  low: 93.80,  open: 94.75,  prevClose: 94.80,  history: [96.20,  95.80,  95.20,  94.90,  95.40,  94.80,  94.18],  week52Low: 69.40,  week52High: 105.60 },
  ITW:  { price: 255.40, change: 1.85,  changePct: 0.73,  high: 256.20, low: 253.80, open: 254.10, prevClose: 253.55, history: [251.20, 252.80, 254.10, 253.50, 255.20, 253.55, 255.40], week52Low: 220.80, week52High: 285.30 },
  CDW:  { price: 187.30, change: -1.20, changePct: -0.64, high: 189.00, low: 186.90, open: 188.50, prevClose: 188.50, history: [192.10, 191.50, 190.20, 189.80, 189.10, 188.50, 187.30], week52Low: 165.20, week52High: 239.45 },
  TRU:  { price: 78.45,  change: 0.55,  changePct: 0.71,  high: 79.20,  low: 77.90,  open: 78.10,  prevClose: 77.90,  history: [76.80,  77.20,  77.90,  77.50,  78.30,  77.90,  78.45],  week52Low: 61.30,  week52High: 96.50  },
  ZBRA: { price: 312.80, change: -2.40, changePct: -0.76, high: 315.60, low: 311.20, open: 314.90, prevClose: 315.20, history: [318.50, 317.20, 315.90, 316.80, 315.40, 315.20, 312.80], week52Low: 240.10, week52High: 358.80 },
  GATX: { price: 126.55, change: 0.95,  changePct: 0.76,  high: 127.20, low: 125.90, open: 126.00, prevClose: 125.60, history: [123.80, 124.50, 125.20, 124.90, 125.80, 125.60, 126.55], week52Low: 98.40,  week52High: 142.60 },
  USFD: { price: 41.30,  change: 0.18,  changePct: 0.44,  high: 41.60,  low: 40.95,  open: 41.10,  prevClose: 41.12,  history: [40.20,  40.60,  40.90,  41.10,  41.30,  41.12,  41.30],  week52Low: 34.80,  week52High: 53.40  },
}

// Plausible static ETF quotes for keyless (indicative) mode.
const MOCK_ETF_QUOTES = {
  SPY: { price: 597.44, change: 3.12,  changePct: 0.52,  high: 599.10, low: 593.80, open: 594.60, prevClose: 594.32, history: [588.40, 591.20, 589.70, 593.10, 592.40, 594.32, 597.44], week52Low: 481.80, week52High: 613.23 },
  QQQ: { price: 529.87, change: 3.74,  changePct: 0.71,  high: 531.60, low: 525.10, open: 526.40, prevClose: 526.13, history: [517.90, 521.40, 519.80, 524.60, 523.10, 526.13, 529.87], week52Low: 402.39, week52High: 540.81 },
  DIA: { price: 426.12, change: 1.19,  changePct: 0.28,  high: 427.40, low: 424.30, open: 425.00, prevClose: 424.93, history: [421.30, 423.10, 422.20, 424.50, 423.80, 424.93, 426.12], week52Low: 366.85, week52High: 451.55 },
  IWM: { price: 210.35, change: -0.89, changePct: -0.42, high: 212.10, low: 209.60, open: 211.50, prevClose: 211.24, history: [213.60, 212.80, 211.90, 212.40, 211.70, 211.24, 210.35], week52Low: 171.73, week52High: 244.98 },
}

const RENT_DATA = [
  { neighborhood: 'Streeterville',  avgRent: 3200, trend: 'up',   yoy: 4.2 },
  { neighborhood: 'West Loop',      avgRent: 2900, trend: 'up',   yoy: 6.1 },
  { neighborhood: 'River North',    avgRent: 2800, trend: 'up',   yoy: 3.8 },
  { neighborhood: 'Old Town',       avgRent: 2600, trend: 'flat', yoy: 1.2 },
  { neighborhood: 'Lincoln Park',   avgRent: 2400, trend: 'up',   yoy: 2.9 },
  { neighborhood: 'Bucktown',       avgRent: 2300, trend: 'flat', yoy: 0.8 },
  { neighborhood: 'Wicker Park',    avgRent: 2100, trend: 'up',   yoy: 3.4 },
  { neighborhood: 'South Loop',     avgRent: 2000, trend: 'down', yoy: -1.1 },
  { neighborhood: 'Logan Square',   avgRent: 1900, trend: 'up',   yoy: 4.7 },
  { neighborhood: 'Andersonville',  avgRent: 1800, trend: 'up',   yoy: 2.1 },
  { neighborhood: 'Hyde Park',      avgRent: 1700, trend: 'flat', yoy: 0.5 },
  { neighborhood: 'Pilsen',         avgRent: 1600, trend: 'up',   yoy: 5.8 },
]

// Static economic indicators — served when FRED_API_KEY is absent (INDICATIVE).
const INDICATIVE_INDICATORS = [
  { label: 'Chicago Unemployment',    value: '4.1%',    change: '-0.2%',  trend: 'down', note: 'vs 4.3% last month' },
  { label: 'Chicago CPI (YoY)',        value: '3.2%',    change: '+0.1%',  trend: 'up',   note: 'Core inflation' },
  { label: 'Median Household Income',  value: '$65,781', change: '+2.1%',  trend: 'up',   note: 'City of Chicago' },
  { label: 'Office Vacancy Rate',      value: '22.4%',   change: '+1.2%',  trend: 'up',   note: 'Downtown Chicago' },
  { label: 'Hotel Occupancy',          value: '71.3%',   change: '+4.8%',  trend: 'up',   note: 'City-wide YTD' },
  { label: "O'Hare Passengers",        value: '8.2M',    change: '+5.1%',  trend: 'up',   note: 'YTD monthly avg' },
  { label: 'Chicago PMI',              value: '45.5',    change: '-2.3',   trend: 'down', note: 'Manufacturing index' },
  { label: 'Midway Cargo (tons)',       value: '19,840',  change: '+3.2%',  trend: 'up',   note: 'Monthly avg' },
]

// ── Shared fetch helpers ─────────────────────────────────────────────

const UA = { 'User-Agent': 'CHI-ATLAS/1.0 (chicago explorer dashboard)' }

async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, headers: UA })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, ms = 8000) {
  const r = await fetchWithTimeout(url, ms)
  if (!r.ok) throw new Error(`upstream ${r.status}`)
  return r.json()
}

async function fetchText(url, ms = 10000) {
  const r = await fetchWithTimeout(url, ms)
  if (!r.ok) throw new Error(`upstream ${r.status}`)
  return r.text()
}

// ── /stocks: Finnhub free tier is 60 calls/min (we make 24 per refresh,
//    one per symbol incl. the 4 US ETF proxies). A 60s TTL during market
//    hours = max 24 calls/min, comfortably within the limit. Off-hours
//    quotes don't change, so we stretch the TTL to stay polite. Without
//    FINNHUB_API_KEY the route serves static indicative quotes.
const CACHE_KEY = 'finance_stocks_v3'
const TTL_OPEN_MS   = 60 * 1000        // market hours: near-live
const TTL_CLOSED_MS = 10 * 60 * 1000   // market closed: data is static anyway

// NYSE/Nasdaq regular session in Chicago time: Mon–Fri 08:30–15:00 CT.
// (Ignores market holidays — worst case we poll a closed market politely.)
function isMarketOpen(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
    const get = t => parts.find(p => p.type === t)?.value
    const day = get('weekday')
    if (day === 'Sat' || day === 'Sun') return false
    const mins = (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10)
    return mins >= 8 * 60 + 30 && mins < 15 * 60
  } catch {
    return false
  }
}

function mockPayload() {
  return {
    quotes: CHICAGO_STOCKS.map(({ symbol, name, sector }) => ({
      symbol, name, sector, ...MOCK_QUOTES[symbol],
    })),
    etfs: US_ETFS.map(({ symbol, name, note }) => ({
      symbol, name, note, ...MOCK_ETF_QUOTES[symbol],
    })),
    fetchedAt: Date.now(),
    source: 'indicative',
  }
}

async function finnhubQuote(symbol, apiKey) {
  const q = await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
  )
  return {
    price:     q.c,
    change:    q.d,
    changePct: q.dp,
    high:      q.h,
    low:       q.l,
    open:      q.o,
    prevClose: q.pc,
  }
}

async function buildPayload() {
  const apiKey = process.env.FINNHUB_API_KEY
  if (apiKey) {
    try {
      const [quotes, etfs] = await Promise.all([
        Promise.all(CHICAGO_STOCKS.map(async ({ symbol, name, sector }) => ({
          symbol, name, sector, ...(await finnhubQuote(symbol, apiKey)),
        }))),
        Promise.all(US_ETFS.map(async ({ symbol, name, note }) => ({
          symbol, name, note, ...(await finnhubQuote(symbol, apiKey)),
        }))),
      ])
      // Finnhub returns c:0 for bad symbols / throttled keys — only trust
      // the batch if we actually got prices back.
      if (quotes.some(q => q.price)) {
        return { quotes, etfs, fetchedAt: Date.now(), source: 'finnhub' }
      }
    } catch {
      // fall through to indicative
    }
  }
  return mockPayload()
}

// Single-flight guard so concurrent requests trigger at most one upstream sweep.
let inflight = null
function refreshStocks() {
  if (!inflight) {
    inflight = buildPayload()
      .then(payload => {
        try { stmtSet.run(CACHE_KEY, JSON.stringify(payload), Date.now()) } catch {}
        return payload
      })
      .finally(() => { inflight = null })
  }
  return inflight
}

// GET /api/finance/stocks — stale-while-revalidate: cached data is returned
// immediately; if it's past TTL a background refresh is kicked off so the
// next poll gets fresh quotes. fetchedAt always reflects the data's real age.
router.get('/stocks', async (req, res) => {
  const marketOpen = isMarketOpen()
  const ttl = marketOpen ? TTL_OPEN_MS : TTL_CLOSED_MS

  let cachedPayload = null
  let cachedAt = 0
  try {
    const cached = stmtGet.get(CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached.data)
      if (parsed && Array.isArray(parsed.quotes)) {
        cachedPayload = parsed
        cachedAt = cached.cached_at
      }
    }
  } catch {}

  if (cachedPayload) {
    if (Date.now() - cachedAt >= ttl) {
      refreshStocks().catch(() => {}) // revalidate in the background
    }
    return res.json({ ...cachedPayload, marketOpen })
  }

  try {
    const payload = await refreshStocks()
    return res.json({ ...payload, marketOpen })
  } catch {
    return res.json({ ...mockPayload(), marketOpen })
  }
})

// ── /extras sections ─────────────────────────────────────────────────
// Generic per-section stale-while-revalidate. Fresh cache → serve it.
// Stale cache → serve it and revalidate in the background. No cache →
// fetch inline; on failure return null so the section is omitted.

const sectionInflight = Object.create(null)

async function getSection(key, ttlMs, fetcher) {
  let cached = null
  let cachedAt = 0
  try {
    const row = stmtGet.get(key)
    if (row) {
      cached = JSON.parse(row.data)
      cachedAt = row.cached_at
    }
  } catch {}

  const refresh = () => {
    if (!sectionInflight[key]) {
      sectionInflight[key] = Promise.resolve()
        .then(fetcher)
        .then(payload => {
          try { stmtSet.run(key, JSON.stringify(payload), Date.now()) } catch {}
          return payload
        })
        .finally(() => { delete sectionInflight[key] })
    }
    return sectionInflight[key]
  }

  if (cached && Date.now() - cachedAt < ttlMs) return cached
  if (cached) {
    refresh().catch(() => {}) // serve stale, revalidate in background
    return cached
  }
  try {
    return await refresh()
  } catch {
    return null
  }
}

// Crypto spot — CoinGecko keyless simple-price. Polite 90s cache. LIVE.
const CRYPTO_COINS = [
  ['bitcoin',  'BTC', 'Bitcoin'],
  ['ethereum', 'ETH', 'Ethereum'],
  ['solana',   'SOL', 'Solana'],
]

async function fetchCrypto() {
  const j = await fetchJson(
    'https://api.coingecko.com/api/v3/simple/price' +
    '?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'
  )
  const data = CRYPTO_COINS.map(([id, symbol, name]) => ({
    id, symbol, name,
    price: j?.[id]?.usd,
    change24h: j?.[id]?.usd_24h_change ?? null,
  }))
  if (!data.every(c => Number.isFinite(c.price))) throw new Error('bad coingecko payload')
  return { data, fetchedAt: Date.now(), source: 'coingecko', cadence: 'LIVE' }
}

// Crypto Fear & Greed — alternative.me, updates once a day. DAILY.
async function fetchFearGreed() {
  const j = await fetchJson('https://api.alternative.me/fng/')
  const row = j?.data?.[0]
  const value = parseInt(row?.value, 10)
  if (!Number.isFinite(value)) throw new Error('bad fng payload')
  return {
    data: { value, classification: row.value_classification, timestamp: Number(row.timestamp) || null },
    fetchedAt: Date.now(),
    source: 'alternative.me',
    cadence: 'DAILY',
  }
}

// FX — Frankfurter mirrors the ECB reference fix (one fix per business day,
// ~16:00 CET). DAILY.
const FX_TARGETS = ['EUR', 'GBP', 'JPY', 'CAD', 'MXN']

async function fetchFx() {
  const j = await fetchJson(
    `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${FX_TARGETS.join(',')}`
  )
  const rates = FX_TARGETS.map(code => ({ code, rate: j?.rates?.[code] }))
  if (!rates.every(r => Number.isFinite(r.rate))) throw new Error('bad frankfurter payload')
  return {
    data: { base: 'USD', date: j.date, rates },
    fetchedAt: Date.now(),
    source: 'frankfurter (ECB)',
    cadence: 'DAILY',
  }
}

// US Treasury daily yield curve — official XML feed, keyless. We take the
// most recent entry of the month (falling back to the prior month on the
// first business days). Regex parse: last occurrence of each field. DAILY.
const YIELD_TENORS = [
  ['3M',  'BC_3MONTH'],
  ['2Y',  'BC_2YEAR'],
  ['10Y', 'BC_10YEAR'],
  ['30Y', 'BC_30YEAR'],
]

function lastXmlValue(xml, tag) {
  const re = new RegExp(`<d:${tag}[^>]*>([^<]+)</d:${tag}>`, 'g')
  let m, last = null
  while ((m = re.exec(xml)) !== null) last = m[1]
  return last
}

function treasuryMonthParam(offsetMonths = 0) {
  const d = new Date()
  d.setUTCDate(15) // avoid month-length edge cases before shifting
  d.setUTCMonth(d.getUTCMonth() - offsetMonths)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function fetchYields() {
  let lastErr = new Error('no treasury data')
  for (const offset of [0, 1]) {
    try {
      const xml = await fetchText(
        'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml' +
        `?data=daily_treasury_yield_curve&field_tdr_date_value_month=${treasuryMonthParam(offset)}`
      )
      if (!xml.includes('<entry>')) continue
      const points = YIELD_TENORS.map(([label, tag]) => ({
        label,
        value: parseFloat(lastXmlValue(xml, tag)),
      }))
      if (!points.every(p => Number.isFinite(p.value))) continue
      const date = (lastXmlValue(xml, 'NEW_DATE') || '').slice(0, 10) || null
      const y2  = points.find(p => p.label === '2Y').value
      const y10 = points.find(p => p.label === '10Y').value
      const spread2s10sBp = Math.round((y10 - y2) * 100)
      return {
        data: { date, points, spread2s10sBp, inverted: spread2s10sBp < 0 },
        fetchedAt: Date.now(),
        source: 'treasury.gov',
        cadence: 'DAILY',
      }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

// City Pulse — Chicago open data (Socrata, keyless): building permits issued
// and new business licenses started, last 30 days vs the prior 30. Column
// names curl-verified: permits use issue_date, licenses use license_start_date
// + application_type='ISSUE'. Cached 6h. DAILY-ish.
function socrataCountUrl(dataset, where) {
  return `https://data.cityofchicago.org/resource/${dataset}.json` +
    `?$select=${encodeURIComponent('count(id)')}&$where=${encodeURIComponent(where)}`
}

async function socrataCount(dataset, where) {
  const j = await fetchJson(socrataCountUrl(dataset, where))
  const n = parseInt(j?.[0]?.count_id, 10)
  if (!Number.isFinite(n)) throw new Error('bad socrata count')
  return n
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10) + 'T00:00:00'
}

async function fetchCityPulse() {
  const d30 = isoDaysAgo(30)
  const d60 = isoDaysAgo(60)
  const lic = "application_type = 'ISSUE'"
  const [permitsCurrent, permitsPrior, licensesCurrent, licensesPrior] = await Promise.all([
    socrataCount('ydr8-5enu', `issue_date > '${d30}'`),
    socrataCount('ydr8-5enu', `issue_date > '${d60}' AND issue_date <= '${d30}'`),
    socrataCount('r5kz-chrr', `license_start_date > '${d30}' AND ${lic}`),
    socrataCount('r5kz-chrr', `license_start_date > '${d60}' AND license_start_date <= '${d30}' AND ${lic}`),
  ])
  return {
    data: {
      windowDays: 30,
      permits:  { current: permitsCurrent,  prior: permitsPrior },
      licenses: { current: licensesCurrent, prior: licensesPrior },
    },
    fetchedAt: Date.now(),
    source: 'data.cityofchicago.org',
    cadence: 'DAILY',
  }
}

// Economic Pulse — real FRED series when FRED_API_KEY is set (MONTHLY),
// otherwise the static indicative list. CPI YoY is computed from CPIAUCSL.
async function fredObservations(seriesId, limit) {
  const j = await fetchJson(
    'https://api.stlouisfed.org/fred/series/observations' +
    `?series_id=${seriesId}&api_key=${process.env.FRED_API_KEY}` +
    `&file_type=json&sort_order=desc&limit=${limit}`
  )
  const obs = (j?.observations || [])
    .filter(o => o.value !== '.' && o.value != null)
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
  if (!obs.length) throw new Error(`no FRED data for ${seriesId}`)
  return obs
}

function monthLabel(isoDate) {
  try {
    return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short', year: 'numeric', timeZone: 'UTC',
    })
  } catch {
    return isoDate
  }
}

function pulseRow(label, note, value, prev, unit = '%') {
  const delta = prev == null ? null : value - prev
  const trend = delta == null || Math.abs(delta) < 0.005 ? 'flat' : delta > 0 ? 'up' : 'down'
  return {
    label,
    value: `${value.toFixed(1)}${unit}`,
    change: delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}${unit}`,
    trend,
    note,
  }
}

async function fetchFredPulse() {
  const [cpi, unrate, fedfunds, ilurn] = await Promise.all([
    fredObservations('CPIAUCSL', 14), // 14 monthly obs → YoY now and last month
    fredObservations('UNRATE', 2),
    fredObservations('FEDFUNDS', 2),
    fredObservations('ILURN', 2),
  ])
  if (cpi.length < 14) throw new Error('not enough CPI history')
  const yoy     = (cpi[0].value / cpi[12].value - 1) * 100
  const yoyPrev = (cpi[1].value / cpi[13].value - 1) * 100
  const data = [
    pulseRow('US CPI Inflation (YoY)',  `BLS via FRED · ${monthLabel(cpi[0].date)}`,      yoy,               yoyPrev),
    pulseRow('US Unemployment',         `BLS via FRED · ${monthLabel(unrate[0].date)}`,   unrate[0].value,   unrate[1]?.value),
    pulseRow('Fed Funds Rate',          `FRB via FRED · ${monthLabel(fedfunds[0].date)}`, fedfunds[0].value, fedfunds[1]?.value),
    pulseRow('Illinois Unemployment',   `BLS via FRED · ${monthLabel(ilurn[0].date)}`,    ilurn[0].value,    ilurn[1]?.value),
  ]
  return { data, fetchedAt: Date.now(), source: 'fred', cadence: 'MONTHLY' }
}

function indicativePulse() {
  return {
    data: INDICATIVE_INDICATORS,
    fetchedAt: Date.now(),
    source: 'indicative',
    cadence: 'INDICATIVE',
  }
}

// Cache TTLs matched to each source's real update cadence.
const TTL_CRYPTO_MS   = 90 * 1000
const TTL_FNG_MS      = 60 * 60 * 1000
const TTL_FX_MS       = 60 * 60 * 1000
const TTL_TREASURY_MS = 6 * 60 * 60 * 1000
const TTL_CITY_MS     = 6 * 60 * 60 * 1000
const TTL_FRED_MS     = 12 * 60 * 60 * 1000

// GET /api/finance/extras — one payload, one { data, fetchedAt, source,
// cadence } block per section. Failed sections are served stale when a
// cache exists, otherwise omitted (pulse always falls back to indicative).
router.get('/extras', async (req, res) => {
  const [crypto, fearGreed, fx, yields, city, fredPulse] = await Promise.all([
    getSection('fin_crypto_v1',   TTL_CRYPTO_MS,   fetchCrypto),
    getSection('fin_fng_v1',      TTL_FNG_MS,      fetchFearGreed),
    getSection('fin_fx_v1',       TTL_FX_MS,       fetchFx),
    getSection('fin_yields_v1',   TTL_TREASURY_MS, fetchYields),
    getSection('fin_city_v1',     TTL_CITY_MS,     fetchCityPulse),
    process.env.FRED_API_KEY
      ? getSection('fin_fred_v1', TTL_FRED_MS,     fetchFredPulse)
      : Promise.resolve(null),
  ])

  const payload = { pulse: fredPulse || indicativePulse() }
  if (crypto)    payload.crypto    = crypto
  if (fearGreed) payload.fearGreed = fearGreed
  if (fx)        payload.fx        = fx
  if (yields)    payload.yields    = yields
  if (city)      payload.city      = city
  res.json(payload)
})

// GET /api/finance/rents
router.get('/rents', (req, res) => {
  res.json(RENT_DATA)
})

// GET /api/finance/indicators
router.get('/indicators', (req, res) => {
  res.json(INDICATIVE_INDICATORS)
})

module.exports = router
