const request = require('supertest')
const app = require('../server')
const db = require('../db')

// Push prefs routes never call fetch, but mock it anyway so nothing hits the network
global.fetch = jest.fn()

const endpoint = `https://push.example.com/test-prefs-${Date.now()}`
const keys = { p256dh: 'test-p256dh', auth: 'test-auth' }

afterAll(() => {
  try { db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint) } catch {}
})

describe('push preferences', () => {
  it('stores prefs on subscribe and returns them from GET /prefs', async () => {
    const prefs = { gameStart: true, severeWeather: false, greatLakeDay: true, lineDelays: false }

    const sub = await request(app)
      .post('/api/push/subscribe')
      .send({ endpoint, keys, prefs })
    expect(sub.status).toBe(200)
    expect(sub.body).toHaveProperty('ok', true)

    const res = await request(app).get('/api/push/prefs').query({ endpoint })
    expect(res.status).toBe(200)
    expect(res.body.prefs).toEqual(prefs)
  })

  it('POST /prefs updates preferences for an existing subscription', async () => {
    const update = await request(app)
      .post('/api/push/prefs')
      .send({ endpoint, prefs: { severeWeather: true, lineDelays: true } })
    expect(update.status).toBe(200)

    const res = await request(app).get('/api/push/prefs').query({ endpoint })
    expect(res.status).toBe(200)
    expect(res.body.prefs).toEqual({
      gameStart: true, severeWeather: true, greatLakeDay: true, lineDelays: true,
    })
  })

  it('GET /prefs returns 404 for an unknown endpoint', async () => {
    const res = await request(app)
      .get('/api/push/prefs')
      .query({ endpoint: 'https://push.example.com/does-not-exist' })
    expect(res.status).toBe(404)
  })

  it('POST /prefs returns 404 for an unknown endpoint', async () => {
    const res = await request(app)
      .post('/api/push/prefs')
      .send({ endpoint: 'https://push.example.com/does-not-exist', prefs: { gameStart: false } })
    expect(res.status).toBe(404)
  })
})

describe('alert engine', () => {
  it('module loads and exposes start()/runChecks() and sendToAll is exported', () => {
    const engine = require('../lib/alertEngine')
    expect(typeof engine.start).toBe('function')
    expect(typeof engine.runChecks).toBe('function')
    expect(typeof require('../routes/push').sendToAll).toBe('function')
  })
})
