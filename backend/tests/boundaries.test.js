const request = require('supertest')
const app = require('../server')
const db = require('../db')

global.fetch = jest.fn()

// One row matching a real app neighborhood (Streeterville), one row the app doesn't use.
const TRIANGLE = [[[
  [-87.62, 41.88],
  [-87.61, 41.88],
  [-87.615, 41.89],
  [-87.62, 41.88],
]]]

const DATASET = [
  {
    pri_neigh: 'Streeterville',
    sec_neigh: 'STREETERVILLE',
    the_geom: { type: 'MultiPolygon', coordinates: TRIANGLE },
  },
  {
    pri_neigh: 'Grand Boulevard',
    sec_neigh: 'BRONZEVILLE',
    the_geom: {
      type: 'MultiPolygon',
      coordinates: [[[[-87.63, 41.81], [-87.60, 41.81], [-87.615, 41.83], [-87.63, 41.81]]]],
    },
  },
]

beforeEach(() => {
  fetch.mockClear()
  fetch.mockResolvedValue({ ok: true, json: async () => DATASET })
  db.prepare("DELETE FROM yelp_cache WHERE cache_key = 'hood_boundaries_v2'").run()
})

// Don't leave the mocked dataset in the shared SQLite cache after the run
afterAll(() => {
  db.prepare("DELETE FROM yelp_cache WHERE cache_key = 'hood_boundaries_v2'").run()
})

describe('GET /api/neighborhoods/boundaries', () => {
  it('returns a FeatureCollection with a feature per app neighborhood', async () => {
    const res = await request(app).get('/api/neighborhoods/boundaries')
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('FeatureCollection')
    expect(res.body.features).toHaveLength(14)
    for (const f of res.body.features) {
      expect(f.type).toBe('Feature')
      expect(f.properties).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        color: expect.stringMatching(/^#/),
        tagline: expect.any(String),
      })
    }
  })

  it('serves the official MultiPolygon for a matched neighborhood, keeping app properties', async () => {
    const res = await request(app).get('/api/neighborhoods/boundaries')
    expect(res.status).toBe(200)
    const sv = res.body.features.find(f => f.properties.id === 'streeterville')
    expect(sv).toBeDefined()
    expect(sv.geometry.type).toBe('MultiPolygon')
    expect(sv.geometry.coordinates).toEqual(TRIANGLE)
    expect(sv.properties).toEqual({
      id: 'streeterville',
      name: 'Streeterville',
      color: '#1e40af',
      tagline: 'Lake-front luxury, Magnificent Mile adjacent',
    })
  })

  it('falls back to the hardcoded polygon for app neighborhoods missing from the dataset', async () => {
    const res = await request(app).get('/api/neighborhoods/boundaries')
    expect(res.status).toBe(200)
    const wp = res.body.features.find(f => f.properties.id === 'wicker-park')
    expect(wp).toBeDefined()
    expect(wp.geometry.type).toBe('Polygon')
    // First vertex of the hardcoded wicker-park polygon
    expect(wp.geometry.coordinates[0][0]).toEqual([-87.692, 41.903])
    expect(wp.properties).toMatchObject({ name: 'Wicker Park', color: '#8b5cf6' })
  })

  it('caches the built collection and skips the upstream on the next request', async () => {
    await request(app).get('/api/neighborhoods/boundaries')
    const res = await request(app).get('/api/neighborhoods/boundaries')
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    const sv = res.body.features.find(f => f.properties.id === 'streeterville')
    expect(sv.geometry.coordinates).toEqual(TRIANGLE)
  })

  it('serves all hardcoded polygons when the upstream fails and nothing is cached', async () => {
    fetch.mockRejectedValue(new Error('network down'))
    const res = await request(app).get('/api/neighborhoods/boundaries')
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('FeatureCollection')
    expect(res.body.features).toHaveLength(14)
    const sv = res.body.features.find(f => f.properties.id === 'streeterville')
    expect(sv.geometry.type).toBe('Polygon')
    expect(sv.geometry.coordinates[0][0]).toEqual([-87.624, 41.883])
  })
})
