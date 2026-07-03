// frontend/src/components/hud/CommandPalette.jsx — global ⌘K navigator
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiHome4Line, RiCompassDiscoverLine, RiSubwayLine, RiRestaurantLine,
  RiMoonLine, RiMoonClearLine, RiFootballLine, RiCalendarEventLine, RiCloudLine,
  RiCommunityLine, RiUser3Line, RiAlertLine, RiHeartPulseLine,
  RiNewspaperLine, RiLineChartLine, RiSettings3Line, RiSearchLine,
} from 'react-icons/ri'
import './CommandPalette.css'

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

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DESTINATIONS
    return DESTINATIONS.filter(d =>
      d.label.toLowerCase().includes(q) || d.hint.toLowerCase().includes(q)
    )
  }, [query])

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

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && results[cursor]) {
      go(results[cursor].to)
    }
  }

  return (
    <div className="cmdk-backdrop" onMouseDown={close}>
      <div className="cmdk hud-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <RiSearchLine className="cmdk-search-icon" />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Jump to a page…"
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onKeyDown}
            aria-label="Command palette search"
          />
          <span className="hud-kbd">ESC</span>
        </div>
        <ul className="cmdk-list">
          {results.length === 0 && (
            <li className="cmdk-empty">No matches — try “transit” or “food”</li>
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
