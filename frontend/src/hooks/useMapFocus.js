// Reads ?focus=lon,lat,name once, flies the map there and drops a themed popup.
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mapboxgl } from './useAtlasMap'

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default function useMapFocus(mapRef) {
  // In the app these pages always render inside the Router; some unit tests
  // render them bare. useSearchParams throws its Router-context invariant
  // before registering any stateful hooks, so catching keeps hook order stable.
  let searchParams = null
  let setSearchParams = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ;[searchParams, setSearchParams] = useSearchParams()
  } catch {
    // No Router context — nothing to focus.
  }
  const focus = searchParams?.get('focus') ?? null

  useEffect(() => {
    if (!focus || !setSearchParams) return

    const [lonStr, latStr, ...nameParts] = focus.split(',')
    const lon = parseFloat(lonStr)
    const lat = parseFloat(latStr)
    const name = nameParts.join(',').trim()

    // Consume the param so refreshes / back-nav don't re-trigger the fly-to
    const clearFocusParam = () => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('focus')
        return next
      }, { replace: true })
    }

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      clearFocusParam()
      return
    }

    let tries = 0
    const MAX_TRIES = 50 // 50 × 200ms ≈ 10s, then give up
    const interval = setInterval(() => {
      const map = mapRef.current
      if (map && map.isStyleLoaded?.()) {
        clearInterval(interval)
        map.flyTo?.({ center: [lon, lat], zoom: 15.5, duration: 2000 })
        new mapboxgl.Popup({ closeButton: false, offset: 12 })
          .setLngLat([lon, lat])
          .setHTML(`<strong>${escapeHtml(name)}</strong>`)
          .addTo(map)
        clearFocusParam()
      } else if (++tries >= MAX_TRIES) {
        clearInterval(interval)
        clearFocusParam()
      }
    }, 200)

    return () => clearInterval(interval)
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps
}
