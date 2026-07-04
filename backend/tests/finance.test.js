const request = require('supertest')
const app = require('../server')
const db = require('../db')

global.fetch = jest.fn()

// Finance sections cache in yelp_cache (fin_* / finance_stocks_*). The db is
// file-backed and shared across runs, so purge finance keys for determinism.
function clearFinanceCache() {
  db.prepare("DELETE FROM yelp_cache WHERE cache_key LIKE 'fin_%' OR cache_key LIKE 'finance_%'").run()
}

beforeEach(() => {
  fetch.mockClear()
  clearFinanceCache()
  delete process.env.FINNHUB_API_KEY
  delete process.env.FRED_API_KEY
})

// ── Upstream fixtures (shapes curl-verified 2026-07-03) ─────────────

const COINGECKO_BODY = {
  bitcoin:  { usd: 62683,   usd_24h_change: 2.3357 },
  ethereum: { usd: 1757.52, usd_24h_change: 3.5943 },
  solana:   { usd: 82.4,    usd_24h_change: 2.0879 },
}

const FNG_BODY = {
  name: 'Fear and Greed Index',
  data: [{ value: '22', value_classification: 'Extreme Fear', timestamp: '1783123200' }],
}

const FX_BODY = {
  amount: 1.0, base: 'USD', date: '2026-07-03',
  rates: { CAD: 1.4202, EUR: 0.87352, GBP: 0.74878, JPY: 161.15, MXN: 17.4472 },
}

const TREASURY_XML = `<?xml version="1.0"?>
<feed><entry><content><m:properties>
<d:NEW_DATE m:type="Edm.DateTime">2026-07-01T00:00:00</d:NEW_DATE>
<d:BC_3MONTH m:type="Edm.Double">3.85</d:BC_3MONTH>
<d:BC_2YEAR m:type="Edm.Double">4.17</d:BC_2YEAR>
<d:BC_10YEAR m:type="Edm.Double">4.48</d:BC_10YEAR>
<d:BC_30YEAR m:type="Edm.Double">4.97</d:BC_30YEAR>
</m:properties></content></entry>
<entry><content><m:properties>
<d:NEW_DATE m:type="Edm.DateTime">2026-07-02T00:00:00</d:NEW_DATE>
<d:BC_3MONTH m:type="Edm.Double">3.70</d:BC_3MONTH>
<d:BC_2YEAR m:type="Edm.Double">4.20</d:BC_2YEAR>
<d:BC_10YEAR m:type="Edm.Double">4.50</d:BC_10YEAR>
<d:BC_30YEAR m:type="Edm.Double">4.99</d:BC_30YEAR>
</m:properties></content></entry></feed>`

// 14 monthly CPI observations, newest first (June 2026 back to May 2025).
// YoY = 320.0 / 310.4 - 1 ≈ 3.09% → rendered as "3.1%".
const FRED_CPI = {
  observations: Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 5 - i, 1)).toISOString().slice(0, 10),
    value: String((320 - i * 0.8).toFixed(1)),
  })),
}

const FRED_SERIES = {
  CPIAUCSL: FRED_CPI,
  UNRATE:   { observations: [{ date: '2026-06-01', value: '4.1' }, { date: '2026-05-01', value: '4.3' }] },
  FEDFUNDS: { observations: [{ date: '2026-06-01', value: '3.9' }, { date: '2026-05-01', value: '4.1' }] },
  ILURN:    { observations: [{ date: '2026-05-01', value: '4.8' }, { date: '2026-04-01', value: '4.7' }] },
}

// Per-URL mock router. Pass overrides to make specific upstreams fail.
function mockUpstreams(overrides = {}) {
  fetch.mockImplementation(rawUrl => {
    const url = decodeURIComponent(String(rawUrl))

    if (url.includes('coingecko')) {
      if (overrides.coingecko === 'fail') return Promise.reject(new Error('coingecko down'))
      return Promise.resolve({ ok: true, json: async () => COINGECKO_BODY })
    }
    if (url.includes('alternative.me')) {
      if (overrides.fng === 'fail') return Promise.resolve({ ok: false, status: 503 })
      return Promise.resolve({ ok: true, json: async () => FNG_BODY })
    }
    if (url.includes('frankfurter')) {
      return Promise.resolve({ ok: true, json: async () => FX_BODY })
    }
    if (url.includes('treasury.gov')) {
      if (overrides.treasury === 'fail') return Promise.resolve({ ok: false, status: 500 })
      return Promise.resolve({ ok: true, text: async () => TREASURY_XML })
    }
    if (url.includes('ydr8-5enu')) {
      // current window has a single date bound; prior window has two (AND)
      const count = url.includes('AND') ? '2900' : '2697'
      return Promise.resolve({ ok: true, json: async () => [{ count_id: count }] })
    }
    if (url.includes('r5kz-chrr')) {
      const count = url.includes('license_start_date <=') ? '702' : '671'
      return Promise.resolve({ ok: true, json: async () => [{ count_id: count }] })
    }
    if (url.includes('stlouisfed')) {
      const series = Object.keys(FRED_SERIES).find(s => url.includes(`series_id=${s}`))
      return Promise.resolve({ ok: true, json: async () => FRED_SERIES[series] || { observations: [] } })
    }
    if (url.includes('finnhub')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ c: 100.5, d: 1.5, dp: 1.52, h: 101, l: 99, o: 99.5, pc: 99 }),
      })
    }
    return Promise.reject(new Error(`unmocked url: ${url}`))
  })
}

describe('GET /api/finance/stocks', () => {
  it('serves indicative Chicago quotes AND US ETF proxies without a Finnhub key', async () => {
    mockUpstreams()
    const res = await request(app).get('/api/finance/stocks')
    expect(res.status).toBe(200)
    expect(res.body.source).toBe('indicative')
    expect(res.body.quotes).toHaveLength(20)
    expect(res.body.etfs).toHaveLength(4)
    expect(res.body.etfs.map(e => e.symbol)).toEqual(['SPY', 'QQQ', 'DIA', 'IWM'])
    expect(res.body.etfs[0].price).toBeGreaterThan(0)
    expect(typeof res.body.marketOpen).toBe('boolean')
    expect(fetch).not.toHaveBeenCalled() // keyless mode never hits Finnhub
  })

  it('fetches live quotes for all 24 symbols when FINNHUB_API_KEY is set', async () => {
    process.env.FINNHUB_API_KEY = 'test-key'
    mockUpstreams()
    const res = await request(app).get('/api/finance/stocks')
    expect(res.status).toBe(200)
    expect(res.body.source).toBe('finnhub')
    expect(res.body.quotes).toHaveLength(20)
    expect(res.body.etfs).toHaveLength(4)
    expect(res.body.etfs[0]).toMatchObject({ symbol: 'SPY', price: 100.5, changePct: 1.52 })
    expect(fetch).toHaveBeenCalledTimes(24)
  })
})

describe('GET /api/finance/extras', () => {
  it('returns all sections with honest cadence chips when every upstream succeeds', async () => {
    mockUpstreams()
    const res = await request(app).get('/api/finance/extras')
    expect(res.status).toBe(200)

    // crypto — LIVE
    expect(res.body.crypto.cadence).toBe('LIVE')
    expect(res.body.crypto.source).toBe('coingecko')
    expect(res.body.crypto.data).toEqual([
      expect.objectContaining({ symbol: 'BTC', price: 62683 }),
      expect.objectContaining({ symbol: 'ETH', price: 1757.52 }),
      expect.objectContaining({ symbol: 'SOL', price: 82.4 }),
    ])
    expect(res.body.crypto.fetchedAt).toBeGreaterThan(0)

    // fear & greed — DAILY
    expect(res.body.fearGreed.cadence).toBe('DAILY')
    expect(res.body.fearGreed.data).toMatchObject({ value: 22, classification: 'Extreme Fear' })

    // fx — DAILY, fixed target order
    expect(res.body.fx.cadence).toBe('DAILY')
    expect(res.body.fx.data.rates.map(r => r.code)).toEqual(['EUR', 'GBP', 'JPY', 'CAD', 'MXN'])
    expect(res.body.fx.data.rates[0].rate).toBeCloseTo(0.87352)

    // treasury yields — DAILY, latest entry (07-02), 2s10s spread in bp
    expect(res.body.yields.cadence).toBe('DAILY')
    expect(res.body.yields.data.date).toBe('2026-07-02')
    expect(res.body.yields.data.points).toEqual([
      { label: '3M', value: 3.7 },
      { label: '2Y', value: 4.2 },
      { label: '10Y', value: 4.5 },
      { label: '30Y', value: 4.99 },
    ])
    expect(res.body.yields.data.spread2s10sBp).toBe(30)
    expect(res.body.yields.data.inverted).toBe(false)

    // city pulse — DAILY, 30d vs prior 30d
    expect(res.body.city.cadence).toBe('DAILY')
    expect(res.body.city.data.permits).toEqual({ current: 2697, prior: 2900 })
    expect(res.body.city.data.licenses).toEqual({ current: 671, prior: 702 })

    // pulse — indicative without a FRED key
    expect(res.body.pulse.cadence).toBe('INDICATIVE')
    expect(res.body.pulse.source).toBe('indicative')
    expect(res.body.pulse.data.length).toBeGreaterThan(0)
  })

  it('omits a failing section (no cache) without breaking the endpoint', async () => {
    mockUpstreams({ coingecko: 'fail', treasury: 'fail' })
    const res = await request(app).get('/api/finance/extras')
    expect(res.status).toBe(200)
    expect(res.body.crypto).toBeUndefined()
    expect(res.body.yields).toBeUndefined()
    // healthy sections still present
    expect(res.body.fearGreed.data.value).toBe(22)
    expect(res.body.fx.data.rates).toHaveLength(5)
    expect(res.body.city.data.permits.current).toBe(2697)
    expect(res.body.pulse.cadence).toBe('INDICATIVE')
  })

  it('serves stale cached data when a source fails after a prior success', async () => {
    const stale = {
      data: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 61000, change24h: -1.2 }],
      fetchedAt: Date.now() - 10 * 60 * 1000,
      source: 'coingecko',
      cadence: 'LIVE',
    }
    db.prepare('INSERT OR REPLACE INTO yelp_cache (cache_key, data, cached_at) VALUES (?, ?, ?)')
      .run('fin_crypto_v1', JSON.stringify(stale), Date.now() - 10 * 60 * 1000)

    mockUpstreams({ coingecko: 'fail' })
    const res = await request(app).get('/api/finance/extras')
    expect(res.status).toBe(200)
    expect(res.body.crypto.data[0].price).toBe(61000) // stale beats missing
  })

  it('serves the real FRED economic pulse when FRED_API_KEY is set', async () => {
    process.env.FRED_API_KEY = 'test-fred-key'
    mockUpstreams()
    const res = await request(app).get('/api/finance/extras')
    expect(res.status).toBe(200)
    expect(res.body.pulse.source).toBe('fred')
    expect(res.body.pulse.cadence).toBe('MONTHLY')
    const labels = res.body.pulse.data.map(r => r.label)
    expect(labels).toEqual([
      'US CPI Inflation (YoY)',
      'US Unemployment',
      'Fed Funds Rate',
      'Illinois Unemployment',
    ])
    // CPI YoY computed from CPIAUCSL: 320.0 / (320.0 - 12*0.8) - 1 ≈ 3.10%
    expect(res.body.pulse.data[0].value).toBe('3.1%')
    expect(res.body.pulse.data[1]).toMatchObject({ value: '4.1%', change: '-0.2%', trend: 'down' })
  })

  it('falls back to the indicative pulse when FRED itself fails', async () => {
    process.env.FRED_API_KEY = 'test-fred-key'
    mockUpstreams()
    fetch.mockImplementation(url =>
      String(url).includes('stlouisfed')
        ? Promise.reject(new Error('fred down'))
        : Promise.resolve({ ok: true, json: async () => COINGECKO_BODY, text: async () => TREASURY_XML })
    )
    const res = await request(app).get('/api/finance/extras')
    expect(res.status).toBe(200)
    expect(res.body.pulse.source).toBe('indicative')
    expect(res.body.pulse.cadence).toBe('INDICATIVE')
  })
})

describe('static finance routes', () => {
  it('GET /api/finance/rents returns the rent barometer list', async () => {
    const res = await request(app).get('/api/finance/rents')
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0]).toHaveProperty('neighborhood')
    expect(res.body[0]).toHaveProperty('avgRent')
  })

  it('GET /api/finance/indicators returns the indicative indicator list', async () => {
    const res = await request(app).get('/api/finance/indicators')
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0]).toHaveProperty('label')
    expect(res.body[0]).toHaveProperty('value')
  })
})
