// frontend/src/hooks/__tests__/useCTA.test.js
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// useCTA keeps a module-level train cache; re-import fresh per test so one
// test's fetch results don't leak into the next test's initial state.
async function freshUseCTA() {
  vi.resetModules()
  return (await import('../useCTA')).default
}

describe('useCTA', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns trains array after fetch resolves', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ trains: [{ rn: '101', lat: 41.87, lon: -87.63, line: 'Red' }] })
    }))

    const useCTA = await freshUseCTA()
    const { result } = renderHook(() => useCTA())
    await act(async () => { await Promise.resolve() })

    expect(result.current.trains).toHaveLength(1)
    expect(result.current.trains[0].rn).toBe('101')
  })

  it('exposes loading state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const useCTA = await freshUseCTA()
    const { result } = renderHook(() => useCTA())
    expect(result.current.loading).toBe(true)
  })
})
