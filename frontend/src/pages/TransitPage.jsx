import { useEffect, useRef, useState } from 'react'
import { RiWifiLine, RiRefreshLine, RiBusLine, RiBikeLine } from 'react-icons/ri'
import HudClock from '../components/hud/HudClock'
import useCTA from '../hooks/useCTA'
import useAtlasMap, { MAPBOX_TOKEN, mapboxgl } from '../hooks/useAtlasMap'
import { sharedTrainState } from '../hooks/trainAnimState'
import MapPlaceholder from '../components/MapPlaceholder'
import './TransitPage.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const LINE_COLOR_MAP = {
  Red: '#ff0033', Blue: '#3b82f6', Brn: '#92400e',
  G: '#10b981', Org: '#f97316', P: '#8b5cf6',
  Pink: '#ec4899', Y: '#eab308',
}
const LINE_NAME_MAP = {
  Red: 'Red Line', Blue: 'Blue Line', Brn: 'Brown Line',
  G: 'Green Line', Org: 'Orange Line', P: 'Purple Line',
  Pexp: 'Purple Line Express', Pink: 'Pink Line', Y: 'Yellow Line',
}

const LINES = [
  { id: 'Red',  label: 'Red Line',    color: '#ff0033' },
  { id: 'Blue', label: 'Blue Line',   color: '#3b82f6' },
  { id: 'Brn',  label: 'Brown Line',  color: '#92400e' },
  { id: 'G',    label: 'Green Line',  color: '#10b981' },
  { id: 'Org',  label: 'Orange Line', color: '#f97316' },
  { id: 'P',    label: 'Purple Line', color: '#8b5cf6' },
  { id: 'Pink', label: 'Pink Line',   color: '#ec4899' },
  { id: 'Y',    label: 'Yellow Line', color: '#eab308' },
]

let _routesCache = null

export default function TransitPage() {
  const trainDataRef  = useRef([])
  const trainStateRef = useRef(sharedTrainState)   // shared with HomePage — no position reset on navigate
  const phaseRef      = useRef({ glow: 0, ring: 0 })
  const GLIDE_MS = 14000
  const { trains, loading, refresh } = useCTA()
  const [showBuses, setShowBuses]   = useState(false)
  const [buses, setBuses]           = useState([])
  const [showDivvy, setShowDivvy]   = useState(false)

  useEffect(() => {
    trainDataRef.current = trains
    const now = Date.now()
    trains.forEach(t => {
      const prev = trainStateRef.current[t.rn]
      trainStateRef.current[t.rn] = {
        lat:     prev?.lat  ?? t.lat,
        lon:     prev?.lon  ?? t.lon,
        fromLat: prev?.lat  ?? t.lat,
        fromLon: prev?.lon  ?? t.lon,
        toLat:   t.lat,
        toLon:   t.lon,
        startTime: now,
      }
    })
  }, [trains])

  const { containerRef, mapRef } = useAtlasMap({
    center: [-87.6298, 41.8781],
    zoom: 11, pitch: 42, bearing: -12,
    onLoad: (map) => {
      // CTA route lines
      map.addSource('cta-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      ((_routesCache
        ? Promise.resolve(_routesCache)
        : fetch(`${API}/api/cta/routes`).then(r => r.json()).then(d => { _routesCache = d; return d })
      ).then(g => { if (map.getSource('cta-routes')) map.getSource('cta-routes').setData(g) }).catch(() => {}))

      const noGlowColor = ['case',
        ['any',
          ['==', ['get', 'color'], '#92400e'],
          ['==', ['get', 'color'], '#ec4899'],
          ['==', ['get', 'color'], '#ff0033'],
        ],
        'rgba(0,0,0,0)',
        ['get', 'color'],
      ]
      map.addLayer({ id: 'cta-routes-atmo', type: 'line', source: 'cta-routes',
        paint: { 'line-color': noGlowColor, 'line-width': 22, 'line-blur': 16, 'line-opacity': 0.04 }
      })
      map.addLayer({ id: 'cta-routes-glow', type: 'line', source: 'cta-routes',
        paint: { 'line-color': noGlowColor, 'line-width': 5, 'line-blur': 2, 'line-opacity': 0.22 }
      })
      map.addLayer({ id: 'cta-routes-solid', type: 'line', source: 'cta-routes',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.85 }
      })

      // Train layers
      map.addSource('trains', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'train-ring', type: 'circle', source: 'trains',
        paint: {
          'circle-radius': 8, 'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.35,
        }
      })
      map.addLayer({ id: 'train-dots', type: 'circle', source: 'trains',
        paint: {
          'circle-radius': 4.5, 'circle-color': ['get', 'color'],
          'circle-stroke-color': '#060b18', 'circle-stroke-width': 1.5, 'circle-opacity': 1,
        }
      })

      map.on('click', 'train-dots', e => {
        const { line, rn } = e.features[0].properties
        new mapboxgl.Popup({ closeButton: false })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<strong>${LINE_NAME_MAP[line] || line || 'CTA'}</strong><br>Train #${rn}`)
          .addTo(map)
      })
      map.on('mouseenter', 'train-dots', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'train-dots', () => { map.getCanvas().style.cursor = '' })

      // Divvy stations layer
      map.addSource('divvy', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'divvy-dots', type: 'circle', source: 'divvy',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 3.5,
          'circle-color': ['case', ['==', ['get', 'renting'], true], '#10b981', '#64748b'],
          'circle-stroke-color': '#060b18', 'circle-stroke-width': 1,
        }
      })
      map.on('click', 'divvy-dots', e => {
        const { name, bikes, docks, renting } = e.features[0].properties
        new mapboxgl.Popup({ closeButton: false })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(
            `<strong>${name}</strong>` +
            `<div style="margin-top:6px;font-size:11px">` +
            `<span style="color:#10b981">${bikes} bikes</span> · ` +
            `<span style="color:#00d4ff">${docks} docks</span>` +
            (!renting ? `<br><span style="color:#ef4444">Not currently renting</span>` : '') +
            `</div>`
          )
          .addTo(map)
      })
      map.on('mouseenter', 'divvy-dots', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'divvy-dots', () => { map.getCanvas().style.cursor = '' })

      // Load Divvy station data
      fetch(`${API}/api/divvy/stations`)
        .then(r => r.json())
        .then(d => {
          if (map.getSource('divvy')) {
            map.getSource('divvy').setData({
              type: 'FeatureCollection',
              features: (d.stations || []).map(s => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
                properties: { name: s.name, bikes: s.bikesAvailable, docks: s.docksAvailable, renting: s.isRenting },
              }))
            })
          }
        }).catch(() => {})

      // Bus dots layer
      map.addSource('cta-buses', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'bus-dots', type: 'circle', source: 'cta-buses',
        paint: {
          'circle-radius': 4, 'circle-color': '#f59e0b',
          'circle-stroke-color': '#060b18', 'circle-stroke-width': 1.2,
        }
      })
      map.on('click', 'bus-dots', e => {
        const { route, destination } = e.features[0].properties
        new mapboxgl.Popup({ closeButton: false })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<strong>Route ${route}</strong><br><small>${destination}</small>`)
          .addTo(map)
      })
      map.on('mouseenter', 'bus-dots', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'bus-dots', () => { map.getCanvas().style.cursor = '' })

    },
    onFrame: (map) => {
      const phase = phaseRef.current
      phase.glow += 0.006; phase.ring += 0.03

      if (map.getLayer('cta-routes-glow')) {
        const op = Math.max(0, 0.10 + Math.sin(phase.glow) * 0.16)
        map.setPaintProperty('cta-routes-glow', 'line-opacity', op)
        map.setPaintProperty('cta-routes-atmo', 'line-opacity', Math.max(0, 0.04 + Math.sin(phase.glow) * 0.06))
      }
      if (map.getLayer('train-ring')) {
        map.setPaintProperty('train-ring', 'circle-radius', 6 + Math.sin(phase.ring) * 4)
        map.setPaintProperty('train-ring', 'circle-stroke-opacity', Math.max(0, 0.08 + Math.sin(phase.ring) * 0.25))
      }

      const now = Date.now()
      const states = trainStateRef.current
      const trainList = trainDataRef.current
      if (trainList.length > 0) {
        for (const state of Object.values(states)) {
          const p = Math.min((now - state.startTime) / GLIDE_MS, 1)
          state.lat = state.fromLat + (state.toLat - state.fromLat) * p
          state.lon = state.fromLon + (state.toLon - state.fromLon) * p
        }
        if (map.getSource('trains') && map.isStyleLoaded()) {
          map.getSource('trains').setData({
            type: 'FeatureCollection',
            features: trainList.map(t => {
              const s = states[t.rn]
              return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [s?.lon ?? t.lon, s?.lat ?? t.lat] },
                properties: { rn: t.rn, line: t.line, color: LINE_COLOR_MAP[t.line] || '#00d4ff' }
              }
            })
          })
        }
      }
    },
  })

  // Bus fetch effect
  useEffect(() => {
    if (!showBuses) { setBuses([]); return }
    async function fetchBuses() {
      try {
        const r = await fetch(`${API}/api/cta/buses`)
        const d = await r.json()
        setBuses(d.buses || [])
      } catch {}
    }
    fetchBuses()
    const id = setInterval(fetchBuses, 30000)
    return () => clearInterval(id)
  }, [showBuses])

  // Sync bus positions to map source
  useEffect(() => {
    const src = mapRef.current?.getSource('cta-buses')
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: buses.map(b => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
        properties: { route: b.route, destination: b.destination },
      }))
    })
  }, [buses])

  // Toggle Divvy layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded() || !map.getLayer('divvy-dots')) return
    map.setLayoutProperty('divvy-dots', 'visibility', showDivvy ? 'visible' : 'none')
  }, [showDivvy])

  const trainsByLine = Object.fromEntries(LINES.map(l => [l.id, trains.filter(t => t.line === l.id)]))

  return (
    <div className="transit-page">
      {MAPBOX_TOKEN
        ? <div ref={containerRef} className="transit-map" />
        : <div className="transit-map"><MapPlaceholder /></div>}
      <div className="transit-vignette" />

      <aside className="transit-panel hud-panel hud-rise">
        <div className="transit-panel-header">
          <span className="hud-label"><span className="slash">▸</span> CTA NETWORK</span>
          <span className="transit-panel-title">CHICAGO&nbsp;“L”</span>
          <div className="transit-clock-row">
            <HudClock />
            <span className={`transit-count${loading ? ' loading' : ''}`}>
              {loading ? 'SYNCING…' : `${trains.length} TRAINS RUNNING`}
            </span>
          </div>
        </div>
        <div className="transit-lines">
          <span className="hud-label transit-lines-label">Lines</span>
          {LINES.map(line => (
            <div key={line.id} className="line-card">
              <span
                className="line-card-badge"
                style={{ background: line.color, boxShadow: `0 0 12px ${line.color}66` }}
              >
                {line.id.slice(0, 1)}
              </span>
              <span className="line-card-name">{line.label}</span>
              <span className="line-card-count" style={{ color: line.color }}>
                {trainsByLine[line.id]?.length || 0}
              </span>
            </div>
          ))}
        </div>
        <div className="transit-panel-footer">
          Click a train dot for details · Data © CTA
        </div>
      </aside>

      <div className="transit-controls">
        <span className="hud-chip live">
          <span className="dot" />
          <RiWifiLine size={10} />
          LIVE CTA DATA
        </span>
        <button
          className={`transit-ctl-btn${showDivvy ? ' active' : ''}`}
          onClick={() => setShowDivvy(s => !s)}
          title={showDivvy ? 'Hide Divvy stations' : 'Show Divvy stations'}
        >
          <RiBikeLine size={13} />
        </button>
        <button
          className={`transit-ctl-btn${showBuses ? ' active' : ''}`}
          onClick={() => setShowBuses(s => !s)}
          title={showBuses ? 'Hide buses' : 'Show buses'}
        >
          <RiBusLine size={13} />
        </button>
        <button
          className={`transit-ctl-btn refresh${loading ? ' spinning' : ''}`}
          onClick={refresh}
          title="Refresh train data"
        >
          <RiRefreshLine size={13} />
        </button>
      </div>

      <div className="transit-hints">
        <span><span className="hud-kbd">Drag</span> rotate</span>
        <span><span className="hud-kbd">Scroll</span> zoom</span>
        <span><span className="hud-kbd">⌘K</span> search</span>
      </div>
    </div>
  )
}
