// frontend/src/components/hud/CommandPalette.jsx — global ⌘K navigator + deep search
import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiHome4Line, RiCompassDiscoverLine, RiSubwayLine, RiRestaurantLine,
  RiMoonLine, RiMoonClearLine, RiFootballLine, RiCalendarEventLine, RiCloudLine,
  RiCommunityLine, RiUser3Line, RiAlertLine, RiHeartPulseLine,
  RiNewspaperLine, RiLineChartLine, RiSettings3Line, RiSearchLine,
  RiMapPin2Line, RiSparklingLine,
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
  // Ask ATLAS — 'results' shows nav + deep search, 'answer' shows the concierge panel
  const [mode, setMode] = useState('results')
  const [ask, setAsk] = useState(null) // { question, status: 'thinking'|'done'|'error', answer, toolsUsed }
  const [typed, setTyped] = useState('')
  const modeRef = useRef('results')
  const askSeq = useRef(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => { modeRef.current = mode }, [mode])

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

  // Ask ATLAS pinned row — always the LAST index in the flat cursor
  const showAsk = query.trim().length >= 3
  const baseCount = results.length + sections.reduce((n, s) => n + s.items.length, 0)
  const askIndex = baseCount
  const totalCount = baseCount + (showAsk ? 1 : 0)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCursor(0)
    setMode('results')
    setAsk(null)
    setTyped('')
    askSeq.current++
  }, [])

  // Answer mode → results mode (← back button and Escape)
  const backToResults = useCallback(() => {
    setMode('results')
    setAsk(null)
    setTyped('')
    askSeq.current++
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        // In answer mode Escape steps back to results; from results it closes
        if (modeRef.current === 'answer') {
          e.preventDefault()
          backToResults()
        } else {
          close()
        }
      }
    }
    const openHandler = () => setOpen(true)
    window.addEventListener('keydown', handler)
    window.addEventListener('chi:open-palette', openHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('chi:open-palette', openHandler)
    }
  }, [close, backToResults])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Typewriter reveal (~20ms/char); instant under prefers-reduced-motion
  useEffect(() => {
    if (mode !== 'answer' || ask?.status !== 'done') return
    const text = ask.answer
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      setTyped(text)
      return
    }
    let i = 0
    const timer = setInterval(() => {
      i++
      setTyped(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, 20)
    return () => clearInterval(timer)
  }, [mode, ask])

  if (!open) return null

  const go = (to) => {
    navigate(to)
    close()
  }

  const startAsk = () => {
    const question = query.trim()
    if (!question) return
    const seq = ++askSeq.current
    setMode('answer')
    setAsk({ question, status: 'thinking', answer: '', toolsUsed: [] })
    setTyped('')
    fetch(`${API}/api/ai/concierge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        if (askSeq.current !== seq) return
        setAsk({
          question,
          status: 'done',
          answer: data?.answer || '',
          toolsUsed: Array.isArray(data?.toolsUsed) ? data.toolsUsed : [],
        })
      })
      .catch(() => {
        if (askSeq.current !== seq) return
        setAsk({ question, status: 'error', answer: '', toolsUsed: [] })
      })
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
    if (showAsk && index === askIndex) startAsk()
  }

  const onKeyDown = (e) => {
    if (mode === 'answer') return
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
            onChange={e => {
              setQuery(e.target.value)
              setCursor(0)
              if (mode === 'answer') backToResults()
            }}
            onKeyDown={onKeyDown}
            aria-label="Command palette search"
          />
          <span className="hud-kbd">ESC</span>
        </div>
        {mode === 'answer' ? (
          <div className="cmdk-answer" role="status" aria-live="polite">
            <div className="cmdk-answer-q">
              <span className="cmdk-answer-prefix">&gt;</span> {ask?.question}
            </div>
            {ask?.status === 'thinking' && (
              <div className="cmdk-answer-thinking">THINKING…</div>
            )}
            {ask?.status === 'error' && (
              <div className="cmdk-answer-text">
                <span className="cmdk-answer-prefix">&gt;</span> concierge offline — check OPENAI_API_KEY
              </div>
            )}
            {ask?.status === 'done' && (
              <div className="cmdk-answer-text">
                <span className="cmdk-answer-prefix">&gt;</span> {typed}
              </div>
            )}
            {ask?.status === 'done' && ask.toolsUsed.length > 0 && (
              <div className="cmdk-answer-tools">TOOLS: {ask.toolsUsed.join(' · ')}</div>
            )}
            <button className="cmdk-answer-back" onClick={backToResults}>← back</button>
          </div>
        ) : (
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
          {showAsk && (
            <li className="cmdk-ask-row">
              <button
                className={`cmdk-item${askIndex === cursor ? ' selected' : ''}`}
                onMouseEnter={() => setCursor(askIndex)}
                onClick={startAsk}
              >
                <RiSparklingLine className="cmdk-item-icon" />
                <span className="cmdk-item-label">Ask ATLAS: “{query.trim()}”</span>
                <span className="cmdk-item-hint">AI</span>
              </button>
            </li>
          )}
        </ul>
        )}
        <div className="cmdk-footer">
          <span><span className="hud-kbd">↑↓</span> navigate</span>
          <span><span className="hud-kbd">↵</span> open</span>
          <span className="cmdk-footer-brand">CHI ATLAS</span>
        </div>
      </div>
    </div>
  )
}
