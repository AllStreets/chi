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
    })
    mapRef.current = map

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

    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafRef.current)
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { containerRef, mapRef }
}
