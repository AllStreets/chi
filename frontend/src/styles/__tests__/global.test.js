import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('global.css design tokens', () => {
  let css

  beforeAll(() => {
    css = readFileSync(resolve(__dirname, '../global.css'), 'utf-8')
  })

  const REQUIRED_VARS = ['--bg', '--accent', '--text', '--text-muted', '--surface', '--border', '--font-ui', '--font-mono']

  REQUIRED_VARS.forEach(v => {
    it(`defines ${v}`, () => {
      expect(css).toContain(v + ':')
    })
  })

  it('uses Archivo as the UI font', () => {
    expect(css).toContain("'Archivo'")
  })

  it('uses IBM Plex Mono as the data font', () => {
    expect(css).toContain("'IBM Plex Mono'")
  })

  it('uses Michroma as the display font', () => {
    expect(css).toContain("'Michroma'")
  })
})
