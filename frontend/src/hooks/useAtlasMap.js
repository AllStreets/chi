// frontend/src/hooks/useAtlasMap.js — shared Mapbox lifecycle for all map pages.
// Owns creation, resize observation, rAF loop, and teardown so pages only
// declare their layers/interactions in onLoad and per-frame work in onFrame.
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''
if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN

export { mapboxgl }

export default function useAtlasMap({
  style = 'mapbox://styles/mapbox/dark-v11',
  center,
  zoom,
  pitch = 0,
  bearing = 0,
  antialias = true,
  config,          // Mapbox Standard style config (e.g. basemap lightPreset)
  onLoad,
  onFrame,
} = {}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)

  // Latest callbacks without retriggering the init effect
  const onLoadRef = useRef(onLoad)
  const onFrameRef = useRef(onFrame)
  onLoadRef.current = onLoad
  onFrameRef.current = onFrame

  useEffect(() => {
    if (mapRef.current || !MAPBOX_TOKEN || !containerRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style, center, zoom, pitch, bearing, antialias,
      ...(config ? { config } : {}),
    })
    mapRef.current = map
    if (import.meta.env.DEV) window.__atlasMap = map

    map.on('load', () => {
      onLoadRef.current?.(map)
      if (onFrameRef.current) {
        const loop = () => {
          onFrameRef.current?.(map)
          rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
      }
    })

    const ro = new ResizeObserver(() => mapRef.current?.resize())
    ro.observe(containerRef.current)

    // Arrow up/down = camera pitch — the axis drag/zoom/rotate don't cover.
    // Mapbox's own keyboard handler owns arrows only when the canvas is
    // focused; this works page-wide (but never while typing in a field).
    const onPitchKey = (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const m = mapRef.current
      if (!m || !m.getPitch) return
      e.preventDefault()
      const delta = e.key === 'ArrowUp' ? 5 : -5
      const next = Math.min(85, Math.max(0, m.getPitch() + delta))
      m.easeTo({ pitch: next, duration: 120 })
    }
    window.addEventListener('keydown', onPitchKey)

    return () => {
      window.removeEventListener('keydown', onPitchKey)
      ro.disconnect()
      cancelAnimationFrame(rafRef.current)
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { containerRef, mapRef }
}
