import { useEffect, useState } from 'react'
import { RiBuildingLine, RiLeafLine, RiAncientGateLine, RiLandscapeLine, RiBrainLine, RiHeartLine, RiHeartFill, RiCheckboxCircleLine, RiMapPinLine } from 'react-icons/ri'
import { addFavorite, removeFavorite, addVisited, removeVisited } from '../hooks/useMe'
import { nearestStation, fetchArrivals, LINE_COLORS } from '../utils/nearestStation'
import { LANDMARKS } from '../data/landmarks'
import './ExplorePage.css'

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

function haversineMin(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat * Math.PI/180) * Math.cos(b.lat * Math.PI/180) * Math.sin(dLon/2)**2
  const km = 2 * R * Math.asin(Math.sqrt(x))
  return Math.round(km / 4.8 * 60)  // 4.8 km/h walking speed
}

const CATEGORIES = ['all', 'icon', 'architecture', 'culture', 'nature', 'hidden']

const CAT_COLORS = {
  icon: '#00d4ff', architecture: '#f97316', culture: '#8b5cf6',
  nature: '#10b981', hidden: '#eab308', all: '#64748b'
}

function AIChatBox() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [streaming, setStreaming] = useState(false)

  async function ask() {
    if (!question.trim() || streaming) return
    setAnswer('')
    setStreaming(true)
    try {
      const res = await fetch(`${API}/api/ai/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: question, context: 'explore' })
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') { setStreaming(false); return }
          try {
            const p = JSON.parse(data)
            if (p.text) setAnswer(a => a + p.text)
          } catch { /* skip */ }
        }
      }
    } catch {
      setAnswer('AI unavailable — add ANTHROPIC_API_KEY to enable.')
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="explore-ai hud-panel hud-rise">
      <div className="explore-ai-head">
        <div className="hud-label explore-ai-label">
          <RiBrainLine />
          AI GUIDE <span className="slash">/</span> ASK YOUR CHICAGO GUIDE
        </div>
        <span className="hud-chip live"><span className="dot" />{streaming ? 'streaming' : 'online'}</span>
      </div>
      <div className="explore-ai-input-row">
        <input
          className="explore-ai-input"
          placeholder="What should I do this weekend? Best deep dish spots? Weekend day trips?"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask()}
        />
        <button className="explore-ai-btn" onClick={ask} disabled={streaming}>
          {streaming ? '...' : 'Ask'}
        </button>
      </div>
      {(answer || streaming) && (
        <div className="explore-ai-answer">
          {answer}
          {streaming && <span className="explore-ai-cursor">▊</span>}
        </div>
      )}
    </div>
  )
}

// Inline "Get me there" panel — nearest L station + next arrivals
function TransitPanel({ lat, lon }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    ;(async () => {
      try {
        const info = await nearestStation(lat, lon)
        if (!info) throw new Error('no stations')
        const arrivals = await fetchArrivals(info.station.mapId).catch(() => [])
        if (live) setState({ status: 'ready', info, arrivals })
      } catch {
        if (live) setState({ status: 'error' })
      }
    })()
    return () => { live = false }
  }, [lat, lon])

  if (state.status === 'loading') return <div className="explore-transit"><div className="gmt-status">…locating station</div></div>
  if (state.status === 'error')   return <div className="explore-transit"><div className="gmt-status gmt-error">transit data unavailable</div></div>

  const { info, arrivals } = state
  const { station, walkMin } = info
  return (
    <div className="explore-transit">
      <div className="gmt-station">
        <span className="gmt-station-name">{station.name}</span>
        {(station.lines || []).map(l => (
          <span key={l} className="gmt-dot" style={{ background: LINE_COLORS[l] || '#64748b' }} />
        ))}
      </div>
      <div className="gmt-walk">◈ {walkMin} MIN WALK</div>
      <div className="gmt-nearest">⊙ nearest L: {station.name} · {walkMin} min walk</div>
      {arrivals.length === 0 && <div className="gmt-arrival gmt-none">no upcoming arrivals</div>}
      {arrivals.map((a, i) => (
        <div key={i} className="gmt-arrival">
          <span className="gmt-bullet" style={{ background: LINE_COLORS[a.line] || '#64748b' }} />
          {a.line} → {a.destination} · {a.minutes <= 1 ? 'Due' : `${a.minutes} min`}
          {a.isDelayed && <span className="gmt-delay"> DLY</span>}
        </div>
      ))}
    </div>
  )
}

export default function ExplorePage() {
  const [category, setCategory] = useState('all')
  const [saved, setSaved] = useState({})
  const [tourMode, setTourMode] = useState(false)
  const [transitOpen, setTransitOpen] = useState(null)  // landmark name — one panel at a time
  const filtered = category === 'all' ? LANDMARKS : LANDMARKS.filter(l => l.category === category)

  return (
    <div className="explore-page">
      <header className="explore-header hud-rise">
        <div className="hud-label">ATLAS <span className="slash">/</span> EXPLORE</div>
        <h1 className="hud-title explore-title">Explore Chicago</h1>
        <div className="explore-header-chips">
          <span className="hud-chip live"><span className="dot" />{LANDMARKS.length} landmarks curated</span>
          <span className="hud-chip">New to the city — start here</span>
        </div>
      </header>

      <AIChatBox />

      <div className="explore-filters hud-rise">
        {CATEGORIES.map(c => (
          <button
            key={c}
            className={`hud-pill explore-filter-btn${category === c ? ' active' : ''}`}
            style={{ '--cat-color': CAT_COLORS[c] }}
            onClick={() => setCategory(c)}
          >{c}</button>
        ))}
        <button
          className={`hud-pill explore-tour-btn${tourMode ? ' active' : ''}`}
          onClick={() => setTourMode(t => !t)}
        >
          <RiMapPinLine /> {tourMode ? 'Exit Tour' : 'Walking Tour'}
        </button>
      </div>

      {tourMode && (
        <div className="explore-tour-panel hud-panel hud-corners hud-rise">
          <div className="explore-tour-header hud-label">Walking Tour <span className="slash">/</span> {filtered.length} stops</div>
          {filtered.map((lm, i) => (
            <div key={lm.name} className="explore-tour-stop">
              <span className="tour-stop-num">{i + 1}</span>
              <div className="tour-stop-info">
                <div className="tour-stop-name">{lm.name}</div>
                <div className="tour-stop-cat">{lm.category}</div>
              </div>
              {i < filtered.length - 1 && (
                <div className="tour-stop-walk">
                  {haversineMin(lm, filtered[i + 1])} min walk
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="explore-grid">
        {filtered.map(l => (
          <div key={l.name} className="explore-card hud-panel" style={{ '--cat-color': CAT_COLORS[l.category] }}>
            <div className="explore-card-cat">{l.category}</div>
            <div className="explore-card-name">{l.name}</div>
            <div className="explore-card-desc">{l.desc}</div>
            <div className="explore-card-tip">
              <span className="explore-tip-label">TIP</span>
              {l.tip}
            </div>
            <div className="explore-card-footer">
              <button
                className={`hud-pill explore-gmt-btn${transitOpen === l.name ? ' active' : ''}`}
                onClick={() => setTransitOpen(o => (o === l.name ? null : l.name))}
              >
                ◈ GET ME THERE
              </button>
            </div>
            {transitOpen === l.name && <TransitPanel lat={l.lat} lon={l.lon} />}
            <div className="explore-card-actions">
              <button
                className={`explore-action-btn${saved[l.name] === 'favorite' ? ' active' : ''}`}
                title={saved[l.name] === 'favorite' ? 'Remove from favorites' : 'Save to favorites'}
                onClick={() => {
                  if (saved[l.name] === 'favorite') {
                    removeFavorite(l.name)
                    setSaved(s => ({ ...s, [l.name]: null }))
                  } else {
                    addFavorite({ id: l.name, name: l.name, lat: l.lat, lon: l.lon })
                    setSaved(s => ({ ...s, [l.name]: 'favorite' }))
                  }
                }}
              >
                {saved[l.name] === 'favorite' ? <RiHeartFill /> : <RiHeartLine />}
              </button>
              <button
                className={`explore-action-btn${saved[l.name] === 'visited' ? ' active visited' : ''}`}
                title={saved[l.name] === 'visited' ? 'Remove from been there' : 'Mark as been there'}
                onClick={() => {
                  if (saved[l.name] === 'visited') {
                    removeVisited(l.name)
                    setSaved(s => ({ ...s, [l.name]: null }))
                  } else {
                    addVisited({ id: l.name, name: l.name, lat: l.lat, lon: l.lon })
                    setSaved(s => ({ ...s, [l.name]: 'visited' }))
                  }
                }}
              >
                <RiCheckboxCircleLine />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
