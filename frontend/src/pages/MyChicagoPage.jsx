import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { RiHeartFill, RiCheckboxCircleLine, RiDeleteBinLine, RiPencilLine, RiFileTextLine, RiRouteLine } from 'react-icons/ri'
import useAtlasMap, { MAPBOX_TOKEN, mapboxgl } from '../hooks/useAtlasMap'
import { LANDMARKS } from '../data/landmarks'
import './MyChicagoPage.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function getUserId() {
  let id = localStorage.getItem('chicago_user_id')
  if (!id) {
    id = 'user_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    localStorage.setItem('chicago_user_id', id)
  }
  return id
}

function useMe() {
  const [me, setMe] = useState({ favorites: [], visited: [] })
  const [loading, setLoading] = useState(true)
  const userId = getUserId()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/me`, { headers: { 'X-User-ID': userId } })
      const data = await res.json()
      setMe(data)
    } catch { /* graceful */ }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => { load() }, [load])

  async function deleteFavorite(placeId) {
    await fetch(`${API}/api/me/favorites/${placeId}`, { method: 'DELETE', headers: { 'X-User-ID': userId } })
    load()
  }

  async function deleteVisited(placeId) {
    await fetch(`${API}/api/me/visited/${placeId}`, { method: 'DELETE', headers: { 'X-User-ID': userId } })
    load()
  }

  async function saveNote(placeId, notes) {
    await fetch(`${API}/api/me/visited/${placeId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-ID': userId },
      body: JSON.stringify({ notes }),
    })
    load()
  }

  return { me, loading, deleteFavorite, deleteVisited, saveNote }
}

// ── Coordinate enrichment ──────────────────────────────────────────
// Favorites saved from Explore before coords were persisted (and day-plan
// stops, which only store id + name) are backfilled here by case-insensitive
// name match against the curated landmarks — no stored data needs touching.
const LANDMARK_BY_NAME = new Map(LANDMARKS.map(l => [l.name.trim().toLowerCase(), l]))

function hasCoords(p) {
  return p.lat != null && p.lon != null &&
    Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))
}

function enrichWithLandmark(place) {
  if (hasCoords(place)) return place
  const lm = LANDMARK_BY_NAME.get((place.place_name || '').trim().toLowerCase())
  return lm ? { ...place, lat: lm.lat, lon: lm.lon } : place
}

// ── Itinerary mini-map ─────────────────────────────────────────────
function routeStopsGeojson(places) {
  return {
    type: 'FeatureCollection',
    features: places.map((p, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] },
      properties: { num: String(i + 1), name: p.place_name },
    })),
  }
}

function routeLineGeojson(places) {
  return {
    type: 'FeatureCollection',
    features: places.length > 1 ? [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: places.map(p => [Number(p.lon), Number(p.lat)]) },
      properties: {},
    }] : [],
  }
}

function fitRouteBounds(map, places) {
  if (places.length < 1) return
  const bounds = new mapboxgl.LngLatBounds()
  places.forEach(p => bounds.extend([Number(p.lon), Number(p.lat)]))
  map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 600 })
}

function RouteMiniMap({ places }) {
  const placesRef = useRef(places)
  placesRef.current = places

  const { containerRef, mapRef } = useAtlasMap({
    center: [-87.6172, 41.8921], // Streeterville
    zoom: 12,
    onLoad: (map) => {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#45d8ff'

      map.addSource('route-line', { type: 'geojson', data: routeLineGeojson(placesRef.current) })
      map.addSource('route-stops', { type: 'geojson', data: routeStopsGeojson(placesRef.current) })

      map.addLayer({
        id: 'route-line', type: 'line', source: 'route-line',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': accent, 'line-width': 2, 'line-dasharray': [2, 2.5], 'line-opacity': 0.75 },
      })
      map.addLayer({
        id: 'route-stops', type: 'circle', source: 'route-stops',
        paint: {
          'circle-radius': 11, 'circle-color': accent,
          'circle-stroke-color': '#04121a', 'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: 'route-stop-nums', type: 'symbol', source: 'route-stops',
        layout: {
          'text-field': ['get', 'num'],
          'text-size': 11,
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff' },
      })

      map.on('click', 'route-stops', e => {
        const el = document.createElement('div')
        el.className = 'mc-map-popup'
        el.textContent = e.features[0].properties.name
        new mapboxgl.Popup({ closeButton: false })
          .setLngLat(e.features[0].geometry.coordinates)
          .setDOMContent(el)
          .addTo(map)
      })
      map.on('mouseenter', 'route-stops', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'route-stops', () => { map.getCanvas().style.cursor = '' })

      fitRouteBounds(map, placesRef.current)
    },
  })

  // Refresh data + refit when the saved places change after map init
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('route-stops')) return
    map.getSource('route-stops').setData(routeStopsGeojson(places))
    map.getSource('route-line').setData(routeLineGeojson(places))
    fitRouteBounds(map, places)
  }, [places, mapRef])

  return <div ref={containerRef} className="mc-route-map" />
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MyChicagoPage() {
  const { me, loading, deleteFavorite, deleteVisited, saveNote } = useMe()
  const [tab, setTab] = useState('favorites')
  const [noteModal, setNoteModal] = useState(null)   // { placeId, placeName, text }
  const [viewModal, setViewModal] = useState(null)   // { placeName, notes }
  const [noteDraft, setNoteDraft] = useState('')
  const [plan, setPlan] = useState(() => {
    try { return JSON.parse(localStorage.getItem('chicago_day_plan') || '[]') }
    catch { return [] }
  })

  // Favorites that carry coordinates (lat/lon are nullable in /api/me data);
  // rows without coords are backfilled by name from the curated landmarks.
  const mappable = useMemo(
    () => (me.favorites || []).map(enrichWithLandmark).filter(hasCoords),
    [me.favorites]
  )

  // Day-plan stops in plan order — coords come from the matching favorite
  // (food/nightlife saves) or the landmark name backfill (explore saves).
  const mappablePlan = useMemo(() => {
    const favs = me.favorites || []
    return plan
      .map(stop => {
        const fav = favs.find(f => f.place_id === stop.id)
        return enrichWithLandmark({ place_id: stop.id, place_name: stop.name, lat: fav?.lat, lon: fav?.lon })
      })
      .filter(hasCoords)
  }, [plan, me.favorites])

  // The mini-map plots plan stops (in plan order) on the Day Plan tab,
  // favorites order otherwise.
  const routePlaces = tab === 'plan' && plan.length > 0 ? mappablePlan : mappable

  function savePlan(newPlan) {
    setPlan(newPlan)
    localStorage.setItem('chicago_day_plan', JSON.stringify(newPlan))
  }

  function addToPlan(place) {
    if (plan.find(p => p.id === place.place_id)) return
    savePlan([...plan, { id: place.place_id, name: place.place_name }])
  }

  function removeFromPlan(id) {
    savePlan(plan.filter(p => p.id !== id))
  }

  function movePlan(i, dir) {
    const next = [...plan]
    const swap = i + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[i], next[swap]] = [next[swap], next[i]]
    savePlan(next)
  }

  function openWriteNote(v) {
    setNoteDraft(v.notes || '')
    setNoteModal({ placeId: v.place_id, placeName: v.place_name })
  }

  function openViewNote(v) {
    setViewModal({ placeName: v.place_name, notes: v.notes || '' })
  }

  async function handleSaveNote() {
    await saveNote(noteModal.placeId, noteDraft)
    setNoteModal(null)
  }

  return (
    <div className="mychicago-page">
      <div className="mychicago-header hud-rise">
        <span className="hud-label mychicago-eyebrow">ATLAS <span className="slash">/</span> MY CHICAGO</span>
        <span className="hud-title mychicago-title">My Chicago</span>
      </div>

      <div className="mychicago-stats hud-rise">
        <div className="mc-stat hud-panel">
          <span className="mc-stat-num">{me.favorites?.length ?? 0}</span>
          <span className="mc-stat-label hud-label">Favorites</span>
        </div>
        <div className="mc-stat hud-panel">
          <span className="mc-stat-num">{me.visited?.length ?? 0}</span>
          <span className="mc-stat-label hud-label">Been There</span>
        </div>
      </div>

      <div className="mychicago-tabs hud-rise">
        <button className={`mc-tab hud-pill${tab === 'favorites' ? ' active' : ''}`} onClick={() => setTab('favorites')}>
          <RiHeartFill /> Favorites
        </button>
        <button className={`mc-tab hud-pill${tab === 'visited' ? ' active' : ''}`} onClick={() => setTab('visited')}>
          <RiCheckboxCircleLine /> Been There
        </button>
        <button className={`mc-tab hud-pill${tab === 'plan' ? ' active' : ''}`} onClick={() => setTab('plan')}>
          <RiRouteLine /> Day Plan
        </button>
      </div>

      {loading && <div className="mc-loading">Loading your Chicago...</div>}

      {!loading && tab === 'favorites' && (
        <div className="mc-list">
          {me.favorites?.length === 0 && (
            <div className="mc-empty">No favorites yet — heart places on Food, Nightlife, or Explore pages</div>
          )}
          {me.favorites?.map(f => (
            <div key={f.id} className="mc-item">
              <RiHeartFill className="mc-item-icon mc-item-icon--heart" />
              <div className="mc-item-info">
                <div className="mc-item-name">{f.place_name}</div>
                <div className="mc-item-date">Saved {formatDate(f.added_at)}</div>
              </div>
              <button className="mc-delete-btn" onClick={() => deleteFavorite(f.place_id)} title="Remove">
                <RiDeleteBinLine />
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'visited' && (
        <div className="mc-list">
          {me.visited?.length === 0 && (
            <div className="mc-empty">No places checked in yet — mark places as "Been there" on Food, Nightlife, or Explore pages</div>
          )}
          {me.visited?.map(v => (
            <div key={v.id} className="mc-item">
              <RiCheckboxCircleLine className="mc-item-icon mc-item-icon--visited" />
              <div className="mc-item-info">
                <div className="mc-item-name">{v.place_name}</div>
                <div className="mc-item-date">Visited {formatDate(v.visited_at)}</div>
              </div>
              <button
                className={`mc-note-view-btn${v.notes ? ' has-notes' : ''}`}
                onClick={() => openViewNote(v)}
                title={v.notes ? 'View notes' : 'No notes yet'}
              >
                <RiFileTextLine />
              </button>
              <button className="mc-note-edit-btn" onClick={() => openWriteNote(v)} title="Write a note">
                <RiPencilLine />
              </button>
              <button className="mc-delete-btn" onClick={() => deleteVisited(v.place_id)} title="Remove">
                <RiDeleteBinLine />
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'plan' && (
        <div className="mc-plan">
          <div className="mc-plan-hint">Add stops from your Favorites to build a day plan</div>

          {me.favorites?.length > 0 && (
            <div className="mc-plan-fav-list">
              {me.favorites.map(f => (
                <button
                  key={f.id}
                  className="mc-plan-add-btn"
                  onClick={() => addToPlan(f)}
                  disabled={!!plan.find(p => p.id === f.place_id)}
                >
                  + {f.place_name}
                </button>
              ))}
            </div>
          )}

          {plan.length > 0 && (
            <div className="mc-plan-list">
              {plan.map((stop, i) => (
                <div key={stop.id} className="mc-plan-stop">
                  <span className="mc-plan-num">{i + 1}</span>
                  <span className="mc-plan-name">{stop.name}</span>
                  <div className="mc-plan-actions">
                    <button onClick={() => movePlan(i, -1)} disabled={i === 0}>↑</button>
                    <button onClick={() => movePlan(i,  1)} disabled={i === plan.length - 1}>↓</button>
                    <button onClick={() => removeFromPlan(stop.id)}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {plan.length === 0 && me.favorites?.length === 0 && (
            <div className="mc-empty">Save favorites first, then build your day plan here</div>
          )}
          {plan.length === 0 && me.favorites?.length > 0 && (
            <div className="mc-empty">Click a favorite above to add it to your plan</div>
          )}
        </div>
      )}

      {/* Itinerary mini-map */}
      {!loading && (tab === 'favorites' || tab === 'plan') && (
        <section className="mc-route-panel hud-panel hud-corners hud-rise">
          <span className="hud-label mc-route-eyebrow">ROUTE <span className="slash">/</span> MY DAY</span>
          {!MAPBOX_TOKEN ? (
            <>
              <div className="mc-empty mc-route-empty">save places from Food, Nightlife or Explore to build your route</div>
              <div className="mc-route-hint">map offline</div>
            </>
          ) : routePlaces.length === 0 ? (
            <div className="mc-empty mc-route-empty">save places from Food, Nightlife or Explore to build your route</div>
          ) : (
            <>
              <RouteMiniMap places={routePlaces} />
              {tab === 'plan' && plan.length > 0 ? (
                mappablePlan.length < plan.length && (
                  <div className="mc-route-hint">
                    {mappablePlan.length} of {plan.length} plan stops have map locations
                  </div>
                )
              ) : (
                mappable.length < (me.favorites?.length ?? 0) && (
                  <div className="mc-route-hint">
                    {mappable.length} of {me.favorites.length} saved places have map locations
                  </div>
                )
              )}
            </>
          )}
        </section>
      )}

      {/* Write note modal */}
      {noteModal && (
        <div className="mc-modal-overlay" onClick={() => setNoteModal(null)}>
          <div className="mc-modal hud-panel hud-corners" onClick={e => e.stopPropagation()}>
            <div className="mc-modal-title">
              <RiPencilLine />
              {noteModal.placeName}
            </div>
            <textarea
              className="mc-note-textarea"
              placeholder="Write your notes about this place…"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              autoFocus
              rows={5}
            />
            <div className="mc-modal-actions">
              <button className="mc-modal-cancel" onClick={() => setNoteModal(null)}>Cancel</button>
              <button className="mc-modal-save" onClick={handleSaveNote}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* View note modal */}
      {viewModal && (
        <div className="mc-modal-overlay" onClick={() => setViewModal(null)}>
          <div className="mc-modal hud-panel hud-corners" onClick={e => e.stopPropagation()}>
            <div className="mc-modal-title">
              <RiFileTextLine />
              {viewModal.placeName}
            </div>
            {viewModal.notes
              ? <p className="mc-note-body">{viewModal.notes}</p>
              : <p className="mc-note-empty">No notes yet — click the pencil icon to add one.</p>
            }
            <div className="mc-modal-actions">
              <button className="mc-modal-save" onClick={() => setViewModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
