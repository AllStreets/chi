const request = require('supertest')
const app = require('../server')
const db = require('../db')

global.fetch = jest.fn()
beforeEach(() => {
  fetch.mockClear()
  // default: any upstream call (Socrata, Ticketmaster) returns an empty dataset
  fetch.mockResolvedValue({ ok: true, json: async () => [] })
  db.prepare('DELETE FROM yelp_cache').run()
})

// Don't leave mocked datasets in the shared SQLite cache after the run
afterAll(() => {
  db.prepare("DELETE FROM yelp_cache WHERE cache_key IN ('cta_stations_v1','search_events_v1')").run()
})

describe('GET /api/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app).get('/api/search')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns empty results for q shorter than 2 chars', async () => {
    const res = await request(app).get('/api/search?q=x')
    expect(res.status).toBe(200)
    expect(res.body.results).toEqual([])
  })

  it('returns 200 with a results array', async () => {
    const res = await request(app).get('/api/search?q=xx')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.results)).toBe(true)
  })

  it('finds cached places and flags bars', async () => {
    db.prepare('INSERT OR REPLACE INTO yelp_cache (cache_key, data, cached_at) VALUES (?, ?, ?)').run(
      JSON.stringify({ v: 3, type: 'bars' }),
      JSON.stringify({ places: [
        { id: '42', name: 'Xxcelent Lounge', amenity: 'bar', categories: ['bar'], address: '1 W Elm St', lat: 41.9, lon: -87.63 },
        { id: '43', name: 'Unrelated Place', amenity: 'restaurant', categories: ['pizza'], address: '', lat: 41.88, lon: -87.62 },
      ] }),
      Date.now()
    )
    const res = await request(app).get('/api/search?q=xxc')
    expect(res.status).toBe(200)
    const place = res.body.results.find(r => r.kind === 'place')
    expect(place).toMatchObject({ id: '42', title: 'Xxcelent Lounge', ref: '42', bar: true })
    expect(res.body.results.some(r => r.title === 'Unrelated Place')).toBe(false)
  })

  it('matches neighborhoods by name', async () => {
    const res = await request(app).get('/api/search?q=wicker')
    expect(res.status).toBe(200)
    const hood = res.body.results.find(r => r.kind === 'neighborhood')
    expect(hood).toMatchObject({ id: 'wicker-park', title: 'Wicker Park' })
  })
})

describe('GET /api/cta/stations', () => {
  it('returns collapsed stations from the L-stops dataset', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { stop_id: '30001', station_name: 'Clark/Lake', station_descriptive_name: 'Clark/Lake (Blue Line)', map_id: '40380', red: false, blue: true, g: false, brn: false, p: false, pexp: false, y: false, pnk: false, o: false, location: { latitude: '41.885737', longitude: '-87.630886' } },
        { stop_id: '30002', station_name: 'Clark/Lake', station_descriptive_name: 'Clark/Lake (Green Line)', map_id: '40380', red: false, blue: false, g: true, brn: true, p: false, pexp: false, y: false, pnk: false, o: false, location: { latitude: '41.885737', longitude: '-87.630886' } },
      ],
    })
    const res = await request(app).get('/api/cta/stations')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.stations)).toBe(true)
    expect(res.body.stations).toHaveLength(1)
    const station = res.body.stations[0]
    expect(station).toMatchObject({ mapId: '40380', name: 'Clark/Lake', lat: 41.885737, lon: -87.630886 })
    expect(station.lines.sort()).toEqual(['Blue', 'Brn', 'G'])
  })

  it('serves from cache on second request', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { stop_id: '30001', station_name: 'Monroe', map_id: '41090', red: true, location: { latitude: '41.880745', longitude: '-87.627696' } },
      ],
    })
    await request(app).get('/api/cta/stations')
    const res = await request(app).get('/api/cta/stations')
    expect(res.status).toBe(200)
    expect(res.body.stations[0].name).toBe('Monroe')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
