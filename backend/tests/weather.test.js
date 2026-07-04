const request = require('supertest')
const app = require('../server')

global.fetch = jest.fn()
beforeEach(() => fetch.mockClear())

// lib/weather.js fetches current conditions AND the forecast in parallel, so
// the mock must satisfy both calls (list: [] covers the forecast shape).
// NOTE: lib/weather caches for 5 min, so after the first request the OWM
// values below are served from cache for the rest of this file.
const OWM_RESPONSE = {
  main: { temp: 285, feels_like: 282, humidity: 65 },
  wind: { speed: 5.2, deg: 270 },
  weather: [{ description: 'partly cloudy', icon: '02d' }],
  name: 'Chicago',
  list: []
}

// NOAA CO-OPS water_temperature shape (v is °C as a string)
const NOAA_RESPONSE = {
  metadata: { id: '9087044', name: 'Calumet Harbor' },
  data: [{ t: '2026-07-03 20:18', v: '23.4', f: '0,0,0' }],
}

const NOAA_ERROR = { error: { message: 'No data was found.' } }

// routes/lake.js now calls NOAA in addition to the (cached) OWM fetches, so
// the mock is URL-conditional.
function mockOwmAndNoaa(noaaBody) {
  fetch.mockImplementation(url => Promise.resolve({
    ok: true,
    json: async () => String(url).includes('tidesandcurrents') ? noaaBody : OWM_RESPONSE,
  }))
}

describe('GET /api/weather', () => {
  it('returns current conditions', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => OWM_RESPONSE })
    const res = await request(app).get('/api/weather')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('temp')
    expect(res.body).toHaveProperty('wind')
    expect(res.body).toHaveProperty('description')
  })
})

describe('GET /api/lake', () => {
  // NOAA failures are NOT cached by routes/lake.js (successes are cached
  // 30 min), so this test must run BEFORE the success cases below.
  it('returns waterTempC null when NOAA has no data', async () => {
    mockOwmAndNoaa(NOAA_ERROR)
    const res = await request(app).get('/api/lake')
    expect(res.status).toBe(200)
    expect(res.body.waterTempC).toBeNull()
    expect(res.body.waterTempF).toBeNull()
    expect(res.body).toHaveProperty('niceScore')
  })

  it('returns a lake conditions object with a niceness score', async () => {
    mockOwmAndNoaa(NOAA_RESPONSE)
    const res = await request(app).get('/api/lake')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('niceScore')
    expect(typeof res.body.niceScore).toBe('number')
    expect(res.body.niceScore).toBeGreaterThanOrEqual(0)
    expect(res.body.niceScore).toBeLessThanOrEqual(100)
  })

  it('returns real NOAA water temperature alongside air temperature', async () => {
    mockOwmAndNoaa(NOAA_RESPONSE)
    const res = await request(app).get('/api/lake')
    expect(res.status).toBe(200)
    expect(res.body.waterTempC).toBe(23.4)
    expect(res.body.waterTempF).toBe(74)
    // legacy tempC is AIR temp, with an explicit alias
    expect(res.body).toHaveProperty('tempC')
    expect(res.body.airTempC).toBe(res.body.tempC)
  })

  it('returns niceLabel string', async () => {
    mockOwmAndNoaa(NOAA_RESPONSE)
    const res = await request(app).get('/api/lake')
    expect(res.body).toHaveProperty('niceLabel')
    expect(typeof res.body.niceLabel).toBe('string')
  })
})
