// frontend/src/components/hud/CommandPalette.jsx — global ⌘K navigator + deep search
import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiHome4Line, RiCompassDiscoverLine, RiSubwayLine, RiRestaurantLine,
  RiMoonLine, RiMoonClearLine, RiFootballLine, RiCalendarEventLine, RiCloudLine,
  RiCommunityLine, RiUser3Line, RiAlertLine, RiHeartPulseLine,
  RiNewspaperLine, RiLineChartLine, RiSettings3Line, RiSearchLine,
  RiMapPin2Line,
} from 'react-icons/ri'
import './CommandPalette.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const DESTINATIONS = [
  { to: '/',              icon: RiHome4Line,           label: 'Home',           hint: 'Live city map' },
  { to: '/tonight',       icon: RiMoonClearLine,       label: 'Tonight',        hint: 'Plan for tonight' },
  { to: '/transit',       icon: RiSubwayLine,          label: 'Transit',        hint: 'CTA lines + Divvy' },
  { to: '/explore',       icon: RiCompassDiscoverLine, label: 'Explore',        hint: 'Landmarks + AI guide' },
  { to: '/food',          icon: RiRestaurantLine,      label: 'Food & Drink',   hint: 'Restaurants map' },
  { to: '/sports',        icon: RiFootballLine,        label: 'Sports',         hint: 'Live scores' },
  { to: '/nightlife',     icon: RiMoonLine,            label: 'Nightlife',      hint: 'Bars + scenes' },
  { to: '/events',        icon: RiCalendarEventLine,   label: 'Events',         hint: 'Ticketmaster listings' },
  { to: '/health',        icon: RiHeartPulseLine,      label: 'Health',         hint: 'Gyms + wellness' },
  { to: '/news',          icon: RiNewspaperLine,       label: 'News',           hint: 'Chicago headlines' },
  { to: '/weather',       icon: RiCloudLine,           label: 'Weather & Lake', hint: 'Conditions + lake scene' },
  { to: '/finance',       icon: RiLineChartLine,       label: 'Finance',        hint: 'Markets + local economy' },
  { to: '/neighborhoods', icon: RiCommunityLine,       label: 'Neighborhoods',  hint: 'Profiles + AI advisor' },
  { to: '/311',           icon: RiAlertLine,           label: 'Chicago 311',    hint: 'City service reports' },
  { to: '/me',            icon: RiUser3Line,           label: 'My Chicago',     hint: 'Saved places' },
  { to: '/settings',      icon: RiSettings3Line,       label: 'Settings',       hint: 'Appearance + server' },
]

const KIND_ORDER = ['place', 'station', 'neighborhood', 'event']
const KIND_META = {
  place:        { header: 'Places',        icon: RiMapPin2Line },
  station:      { header: 'Stations',      icon: RiSubwayLine },
  neighborhood: { header: 'Neighborhoods', icon: RiCommunityLine },
  event:        { header: 'Events',        icon: RiCalendarEventLine },
}
const SECTION_CAP = 5

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [apiResults, setApiResults] = useState([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DESTINATIONS
    return DESTINATIONS.filter(d =>
      d.label.toLowerCase().includes(q) || d.hint.toLowerCase().includes(q)
    )
  }, [query])

  // Deep search — 250ms debounce, aborts stale requests
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setApiResults([])
      setSearching(false)
      return
    }
    const ctrl = new AbortController()
    setSearching(true)
    const timer = setTimeout(() => {
      fetch(`${API}/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(data => {
          setApiResults(Array.isArray(data?.results) ? data.results : [])
          setSearching(false)
        })
        .catch(err => {
          if (err?.name !== 'AbortError') {
            setApiResults([])
            setSearching(false)
          }
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])

  // Grouped, capped sections in fixed kind order — with flat cursor offsets
  const sections = useMemo(() => {
    let offset = results.length
    return KIND_ORDER
      .map(kind => ({ kind, items: apiResults.filter(r => r.kind === kind).slice(0, SECTION_CAP) }))
      .filter(s => s.items.length > 0)
      .map(s => {
        const start = offset
        offset += s.items.length
        return { ...s, start }
      })
  }, [results, apiResults])

  const totalCount = results.length + sections.reduce((n, s) => n + s.items.length, 0)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCursor(0)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        close()
      }
    }
    const openHandler = () => setOpen(true)
    window.addEventListener('keydown', handler)
    window.addEventListener('chi:open-palette', openHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('chi:open-palette', openHandler)
    }
  }, [close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const go = (to) => {
    navigate(to)
    close()
  }

  const selectApiResult = (r) => {
    if (r.kind === 'place' && r.lon != null && r.lat != null) {
      navigate(`${r.bar ? '/nightlife' : '/food'}?focus=${r.lon},${r.lat},${encodeURIComponent(r.title)}`)
    } else if (r.kind === 'station' && r.lon != null && r.lat != null) {
      navigate(`/transit?focus=${r.lon},${r.lat},${encodeURIComponent(r.title)}`)
    } else if (r.kind === 'neighborhood') {
      navigate(`/neighborhoods#${r.ref}`)
    } else if (r.kind === 'event') {
      navigate('/events')
    }
    close()
  }

  const selectAt = (index) => {
    if (index < results.length) {
      go(results[index].to)
      return
    }
    for (const s of sections) {
      if (index >= s.start && index < s.start + s.items.length) {
        selectApiResult(s.items[index - s.start])
        return
      }
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, Math.max(totalCount - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && totalCount > 0) {
      selectAt(Math.min(cursor, totalCount - 1))
    }
  }

  const showPagesHeader = results.length > 0 && (sections.length > 0 || searching)

  return (
    <div className="cmdk-backdrop" onMouseDown={close}>
      <div className="cmdk hud-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <RiSearchLine className="cmdk-search-icon" />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search pages, places, stations…"
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onKeyDown}
            aria-label="Command palette search"
          />
          <span className="hud-kbd">ESC</span>
        </div>
        <ul className="cmdk-list">
          {totalCount === 0 && !searching && (
            <li className="cmdk-empty">No matches — try “transit” or “food”</li>
          )}
          {showPagesHeader && (
            <li className="cmdk-section hud-label" aria-hidden="true">Pages</li>
          )}
          {results.map(({ to, icon: Icon, label, hint }, i) => (
            <li key={to}>
              <button
                className={`cmdk-item${i === cursor ? ' selected' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(to)}
              >
                <Icon className="cmdk-item-icon" />
                <span className="cmdk-item-label">{label}</span>
                <span className="cmdk-item-hint">{hint}</span>
              </button>
            </li>
          ))}
          {sections.map(({ kind, items, start }) => {
            const { header, icon: Icon } = KIND_META[kind]
            return (
              <Fragment key={kind}>
                <li className="cmdk-section hud-label" aria-hidden="true">{header}</li>
                {items.map((r, j) => {
                  const i = start + j
                  return (
                    <li key={`${kind}-${r.id ?? j}`}>
                      <button
                        className={`cmdk-item${i === cursor ? ' selected' : ''}`}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => selectApiResult(r)}
                      >
                        <Icon className="cmdk-item-icon" />
                        <span className="cmdk-item-label">{r.title}</span>
                        {r.subtitle && <span className="cmdk-item-hint">{r.subtitle}</span>}
                      </button>
                    </li>
                  )
                })}
              </Fragment>
            )
          })}
          {searching && <li className="cmdk-searching">SEARCHING…</li>}
        </ul>
        <div className="cmdk-footer">
          <span><span className="hud-kbd">↑↓</span> navigate</span>
          <span><span className="hud-kbd">↵</span> open</span>
          <span className="cmdk-footer-brand">CHI ATLAS</span>
        </div>
      </div>
    </div>
  )
}
