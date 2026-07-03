const request = require('supertest')
const app = require('../server')

describe('POST /api/ai/concierge', () => {
  it('returns 400 when question is missing', async () => {
    const res = await request(app).post('/api/ai/concierge').send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when question exceeds 500 chars', async () => {
    const res = await request(app)
      .post('/api/ai/concierge')
      .send({ question: 'x'.repeat(501) })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 503 when OPENAI_API_KEY is unset', async () => {
    const saved = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      const res = await request(app)
        .post('/api/ai/concierge')
        .send({ question: 'What should I do tonight?' })
      expect(res.status).toBe(503)
      expect(res.body).toHaveProperty('error')
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved
    }
  })
})
