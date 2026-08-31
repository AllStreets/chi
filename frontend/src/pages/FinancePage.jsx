import { useEffect, useState } from 'react'
import {
  RiArrowUpLine, RiArrowDownLine, RiSubtractLine, RiRefreshLine,
  RiBarChartLine, RiBuilding2Line, RiLineChartLine, RiBarChart2Line,
  RiExchangeLine, RiCoinsLine, RiExchangeDollarLine, RiGovernmentLine,
  RiEmotionLine, RiCommunityLine, RiGlobalLine,
} from 'react-icons/ri'
import './FinancePage.css'

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')
// Matches the backend's market-hours cache TTL (60s) — polling faster than
// the cache refreshes would only re-fetch identical data.
const POLL_MS = 60_000
// Extras: fastest section (crypto) is cached 90s server-side.
const EXTRAS_POLL_MS = 90_000

function useFinance() {
  const [stocks, setStocks]         = useState([])
  const [etfs, setEtfs]             = useState([])
  const [rents, setRents]           = useState([])
  const [indicators, setIndicators] = useState([])
  const [loading, setLoading]       = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [source, setSource]         = useState(null)
  const [marketOpen, setMarketOpen] = useState(null)

  async function load(showSync = true) {
    if (showSync) setLoading(true)
    try {
      const [s, r, i] = await Promise.all([
        fetch(`${API}/api/finance/stocks`).then(x => x.json()),
        fetch(`${API}/api/finance/rents`).then(x => x.json()),
        fetch(`${API}/api/finance/indicators`).then(x => x.json()),
      ])
      // Backend returns { quotes, etfs, fetchedAt, source, marketOpen };
      // tolerate the legacy bare-array shape too.
      const quotes = Array.isArray(s) ? s : (Array.isArray(s?.quotes) ? s.quotes : [])
      setStocks(quotes)
      setEtfs(Array.isArray(s?.etfs) ? s.etfs : [])
      setRents(Array.isArray(r) ? r : [])
      setIndicators(Array.isArray(i) ? i : [])
      // UPDATED chip shows the data's real age (backend fetchedAt), not render time.
      setLastUpdated(s?.fetchedAt ? new Date(s.fetchedAt) : new Date())
      setSource(s?.source ?? null)
      setMarketOpen(typeof s?.marketOpen === 'boolean' ? s.marketOpen : null)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    load(true)
    const timer = setInterval(() => load(false), POLL_MS)
    return () => clearInterval(timer)
  }, [])

  return { stocks, etfs, rents, indicators, loading, lastUpdated, source, marketOpen, refresh: () => load(true) }
}

// /api/finance/extras — per-section { data, fetchedAt, source, cadence }
// blocks: crypto, fearGreed, fx, yields, city, pulse. Sections can be absent
// when an upstream is down; tiles simply don't render.
function useExtras() {
  const [extras, setExtras] = useState(null)

  async function load() {
    try {
      const r = await fetch(`${API}/api/finance/extras`).then(x => x.json())
      if (r && typeof r === 'object') setExtras(r)
    } catch {}
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, EXTRAS_POLL_MS)
    return () => clearInterval(timer)
  }, [])

  return { extras, refreshExtras: load }
}

// ── Shared bits ──────────────────────────────────────────────────────

const CADENCE_TITLES = {
  LIVE:       'Refreshed at least every 2 minutes',
  DAILY:      'Source publishes once per day',
  WEEKLY:     'Source publishes weekly',
  MONTHLY:    'Source publishes monthly',
  INDICATIVE: 'Static reference data — not a live feed',
}

function CadenceChip({ cadence }) {
  if (!cadence) return null
  return (
    <span className={`fin-cadence-chip ${cadence.toLowerCase()}`} title={CADENCE_TITLES[cadence] || cadence}>
      {cadence === 'LIVE' && <span className="fin-cadence-dot" />}
      {cadence}
    </span>
  )
}

function TrendIcon({ trend, size = 12 }) {
  if (trend === 'up')   return <RiArrowUpLine size={size} style={{ color: '#22c55e' }} />
  if (trend === 'down') return <RiArrowDownLine size={size} style={{ color: '#ef4444' }} />
  return <RiSubtractLine size={size} style={{ color: '#64748b' }} />
}

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return <span style={{ width: 60, display: 'inline-block' }} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 60, H = 20
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const color = positive ? '#22c55e' : '#ef4444'
  return (
    <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

const fmtUsd = v => v == null ? '—'
  : '$' + v.toLocaleString('en-US', v >= 10_000
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── US markets strip (index ETF proxies) ─────────────────────────────

function UsMarkets({ etfs, source }) {
  if (!etfs.length) return null
  const cadence = source === 'finnhub' ? 'LIVE' : 'INDICATIVE'
  return (
    <div className="fin-panel fin-panel--usmkts hud-panel hud-rise" style={{ animationDelay: '0.05s' }}>
      <div className="fin-panel-label">
        <RiGlobalLine size={11} /> US MARKETS
        <span className="fin-label-note">INDEX ETF PROXIES</span>
        <CadenceChip cadence={cadence} />
      </div>
      <div className="fin-usmkt-grid">
        {etfs.map(e => {
          const pos = (e.change ?? 0) >= 0
          return (
            <div key={e.symbol} className="fin-usmkt-card">
              <div className="fin-usmkt-top">
                <span className="fin-usmkt-sym">{e.symbol}</span>
                <span className="fin-usmkt-name">{e.name}</span>
              </div>
              <div className="fin-usmkt-price">${e.price?.toFixed(2)}</div>
              <div className={`fin-usmkt-chg ${pos ? 'pos' : 'neg'}`}>
                {pos ? '+' : ''}{e.change?.toFixed(2)} ({pos ? '+' : ''}{e.changePct?.toFixed(2)}%)
              </div>
              {e.history && <Sparkline data={e.history} positive={pos} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Crypto tile — CoinGecko spot, LIVE ───────────────────────────────

function CryptoTile({ section }) {
  if (!section?.data?.length) return null
  return (
    <div className="fin-panel hud-panel">
      <div className="fin-panel-label">
        <RiCoinsLine size={11} /> CRYPTO
        <CadenceChip cadence={section.cadence} />
      </div>
      <div className="fin-crypto-rows">
        {section.data.map(c => {
          const pos = (c.change24h ?? 0) >= 0
          return (
            <div key={c.symbol} className="fin-crypto-row">
              <span className="fin-crypto-sym">{c.symbol}</span>
              <span className="fin-crypto-name">{c.name}</span>
              <span className="fin-crypto-price">{fmtUsd(c.price)}</span>
              <span className={`fin-crypto-chg ${pos ? 'pos' : 'neg'}`}>
                {pos ? <RiArrowUpLine size={10} /> : <RiArrowDownLine size={10} />}
                {pos ? '+' : ''}{c.change24h?.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
      <div className="fin-tile-foot">24H CHANGE · COINGECKO</div>
    </div>
  )
}

// ── FX tile — Frankfurter / ECB reference rates, DAILY ───────────────

function FxTile({ section }) {
  if (!section?.data?.rates?.length) return null
  const maxRate = Math.max(...section.data.rates.map(r => Math.log10(r.rate + 1)), 0.001)
  return (
    <div className="fin-panel hud-panel">
      <div className="fin-panel-label">
        <RiExchangeDollarLine size={11} /> DOLLAR FX
        <CadenceChip cadence={section.cadence} />
      </div>
      <div className="fin-fx-rows">
        {section.data.rates.map(r => (
          <div key={r.code} className="fin-fx-row">
            <span className="fin-fx-pair">USD<span className="fin-fx-arrow">→</span>{r.code}</span>
            <div className="fin-fx-bar-wrap">
              <div className="fin-fx-bar" style={{ width: `${Math.round((Math.log10(r.rate + 1) / maxRate) * 100)}%` }} />
            </div>
            <span className="fin-fx-rate">{r.rate?.toFixed(r.rate >= 20 ? 2 : 4)}</span>
          </div>
        ))}
      </div>
      <div className="fin-tile-foot">ECB FIX {section.data.date} · FRANKFURTER</div>
    </div>
  )
}

// ── Treasury yield curve tile, DAILY ─────────────────────────────────

function YieldCurveTile({ section }) {
  const d = section?.data
  if (!d?.points?.length) return null
  const W = 220, H = 64, PX = 18, PT = 14, PB = 6
  const vals = d.points.map(p => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 0.1
  const pts = d.points.map((p, i) => [
    PX + (i / (d.points.length - 1)) * (W - PX * 2),
    H - PB - ((p.value - min) / range) * (H - PT - PB),
  ])
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <div className="fin-panel hud-panel">
      <div className="fin-panel-label">
        <RiGovernmentLine size={11} /> YIELD CURVE
        <CadenceChip cadence={section.cadence} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fin-yield-svg" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={d.points[i].label}>
            <circle cx={p[0]} cy={p[1]} r={2.6} fill="var(--accent)" />
            <text x={p[0]} y={p[1] - 6} textAnchor="middle" className="fin-yield-val">
              {d.points[i].value.toFixed(2)}
            </text>
          </g>
        ))}
      </svg>
      <div className="fin-yield-tenors">
        {d.points.map(p => <span key={p.label}>{p.label}</span>)}
      </div>
      <div className={`fin-yield-spread ${d.inverted ? 'neg' : 'pos'}`}>
        2s10s {d.spread2s10sBp >= 0 ? '+' : ''}{d.spread2s10sBp}bp
        {d.inverted && <span className="fin-yield-inverted">INVERTED</span>}
      </div>
      <div className="fin-tile-foot">US TREASURY · {d.date || '—'}</div>
    </div>
  )
}

// ── Crypto Fear & Greed gauge, DAILY ─────────────────────────────────

function arcPath(cx, cy, r, a0, a1) {
  const rad = a => (Math.PI * a) / 180
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy - r * Math.sin(rad(a0))
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy - r * Math.sin(rad(a1))
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}

const FNG_BANDS = [
  { to: 25,  color: '#ef4444' },
  { to: 45,  color: '#f59e0b' },
  { to: 55,  color: '#eab308' },
  { to: 75,  color: '#84cc16' },
  { to: 100, color: '#22c55e' },
]

function fngColor(v) {
  return FNG_BANDS.find(b => v <= b.to)?.color || '#22c55e'
}

function FearGreedTile({ section }) {
  const d = section?.data
  if (d?.value == null) return null
  const cx = 80, cy = 74, r = 58
  const needleA = 180 - d.value * 1.8
  const rad = (Math.PI * needleA) / 180
  const nx = cx + (r - 12) * Math.cos(rad)
  const ny = cy - (r - 12) * Math.sin(rad)
  let from = 0
  return (
    <div className="fin-panel hud-panel">
      <div className="fin-panel-label">
        <RiEmotionLine size={11} /> CRYPTO FEAR &amp; GREED
        <CadenceChip cadence={section.cadence} />
      </div>
      <div className="fin-fng-body">
        <svg viewBox="0 0 160 84" className="fin-fng-svg">
          {FNG_BANDS.map(b => {
            const seg = arcPath(cx, cy, r, 180 - from * 1.8, 180 - b.to * 1.8)
            from = b.to
            return <path key={b.to} d={seg} fill="none" stroke={b.color} strokeWidth={7} strokeLinecap="butt" opacity={0.55} />
          })}
          <line x1={cx} y1={cy} x2={nx.toFixed(1)} y2={ny.toFixed(1)}
            stroke={fngColor(d.value)} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={3.4} fill={fngColor(d.value)} />
        </svg>
        <div className="fin-fng-value" style={{ color: fngColor(d.value) }}>{d.value}</div>
        <div className="fin-fng-class">{d.classification?.toUpperCase()}</div>
      </div>
      <div className="fin-tile-foot">0 FEAR — 100 GREED · ALTERNATIVE.ME</div>
    </div>
  )
}

// ── City pulse — Chicago open data, DAILY ────────────────────────────

function CityStat({ icon, label, current, prior }) {
  const delta = prior > 0 ? ((current - prior) / prior) * 100 : null
  const trend = delta == null || Math.abs(delta) < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down'
  const peak = Math.max(current, prior, 1)
  return (
    <div className="fin-city-stat">
      <div className="fin-city-stat-hdr">{icon} {label}</div>
      <div className="fin-city-stat-main">
        <span className="fin-city-count">{current?.toLocaleString('en-US')}</span>
        <span className={`fin-city-delta ${trend}`}>
          <TrendIcon trend={trend} size={11} />
          {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
        </span>
      </div>
      <div className="fin-city-bars">
        <div className="fin-city-bar-row">
          <span>30D</span>
          <div className="fin-city-bar-wrap"><div className="fin-city-bar now" style={{ width: `${(current / peak) * 100}%` }} /></div>
        </div>
        <div className="fin-city-bar-row">
          <span>PRIOR</span>
          <div className="fin-city-bar-wrap"><div className="fin-city-bar" style={{ width: `${(prior / peak) * 100}%` }} /></div>
        </div>
      </div>
    </div>
  )
}

function CityPulseTile({ section }) {
  const d = section?.data
  if (!d?.permits) return null
  return (
    <div className="fin-panel hud-panel">
      <div className="fin-panel-label">
        <RiCommunityLine size={11} /> CITY PULSE
        <span className="fin-label-note">LAST {d.windowDays}D VS PRIOR</span>
        <CadenceChip cadence={section.cadence} />
      </div>
      <div className="fin-city-stats">
        <CityStat icon={<RiBuilding2Line size={12} />} label="BUILDING PERMITS ISSUED"
          current={d.permits.current} prior={d.permits.prior} />
        <CityStat icon={<RiBarChartLine size={12} />} label="NEW BUSINESS LICENSES"
          current={d.licenses?.current} prior={d.licenses?.prior} />
      </div>
      <div className="fin-tile-foot">DATA.CITYOFCHICAGO.ORG</div>
    </div>
  )
}

// ── Existing sections ────────────────────────────────────────────────

function TopMovers({ stocks }) {
  if (!stocks.length) return null
  const sorted  = [...stocks].sort((a, b) => b.changePct - a.changePct)
  const gainers = sorted.slice(0, 4)
  const losers  = sorted.slice(-4).reverse()
  return (
    <div className="fin-panel fin-panel--movers hud-panel">
      <div className="fin-panel-label"><RiExchangeLine size={11} /> TOP MOVERS — TODAY</div>
      <div className="fin-movers-body">
        <div className="fin-movers-col">
          <div className="fin-movers-col-hdr up">GAINING</div>
          {gainers.map(s => (
            <div key={s.symbol} className="fin-mover-row">
              <div className="fin-mover-left">
                <span className="fin-mover-sym">{s.symbol}</span>
                <span className="fin-mover-name">{s.name}</span>
              </div>
              <div className="fin-mover-right">
                <span className="fin-mover-pct pos">+{s.changePct.toFixed(2)}%</span>
                <Sparkline data={s.history} positive={true} />
              </div>
            </div>
          ))}
        </div>
        <div className="fin-movers-divider" />
        <div className="fin-movers-col">
          <div className="fin-movers-col-hdr neg">DECLINING</div>
          {losers.map(s => (
            <div key={s.symbol} className="fin-mover-row">
              <div className="fin-mover-left">
                <span className="fin-mover-sym">{s.symbol}</span>
                <span className="fin-mover-name">{s.name}</span>
              </div>
              <div className="fin-mover-right">
                <span className="fin-mover-pct neg">{s.changePct.toFixed(2)}%</span>
                <Sparkline data={s.history} positive={false} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChicagoIndex({ stocks }) {
  const valid = stocks.filter(s => s.history && s.history.length >= 2)
  if (!valid.length) return null

  const LEN = 7
  const normalized = valid.map(s => {
    const base = s.history[0] || 1
    return s.history.map(v => (v / base) * 100)
  })
  const avg = Array.from({ length: LEN }, (_, i) =>
    normalized.reduce((sum, h) => sum + (h[i] ?? 100), 0) / normalized.length
  )

  const min = Math.min(...avg)
  const max = Math.max(...avg)
  const range = max - min || 0.01
  const W = 300, H = 80, PX = 6, PY = 4
  const pts = avg.map((v, i) => [
    PX + (i / (LEN - 1)) * (W - PX * 2),
    H - PY - ((v - min) / range) * (H - PY * 2),
  ])
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`
  const overallChg = ((avg[LEN - 1] - avg[0]) / avg[0]) * 100
  const pos = overallChg >= 0
  const color = pos ? '#22c55e' : '#ef4444'
  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'TODAY']

  return (
    <div className="fin-panel fin-panel--index hud-panel">
      <div className="fin-panel-label"><RiLineChartLine size={11} /> CHICAGO COMPOSITE — 7-DAY</div>
      <div className="fin-index-stat">
        <span className="fin-index-base">BASE 100</span>
        <span className={`fin-index-chg ${pos ? 'pos' : 'neg'}`}>
          {pos ? '+' : ''}{overallChg.toFixed(2)}% 7D
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: '100%', height: 88, display: 'block' }}>
        <defs>
          <linearGradient id="idx-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t, i) => (
          <line key={i}
            x1={PX} y1={PY + t * (H - PY * 2)}
            x2={W - PX} y2={PY + t * (H - PY * 2)}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        ))}
        <path d={areaD} fill="url(#idx-grad)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.5} fill={color} />
      </svg>
      <div className="fin-index-days">
        {DAYS.map((d, i) => (
          <span key={i} className={`fin-index-day${i === LEN - 1 ? ' active' : ''}`}>{d}</span>
        ))}
      </div>
    </div>
  )
}

function RangePositions({ stocks }) {
  const valid = stocks.filter(s => s.week52Low && s.week52High && s.price)
  if (!valid.length) return null
  return (
    <div className="fin-panel fin-panel--range hud-panel">
      <div className="fin-panel-label"><RiBarChart2Line size={11} /> 52-WEEK RANGE POSITION</div>
      <div className="fin-range-rows">
        {valid.slice(0, 10).map(s => {
          const pct = Math.max(0, Math.min(1,
            (s.price - s.week52Low) / (s.week52High - s.week52Low)
          ))
          const color = pct < 0.3 ? '#ef4444' : pct > 0.7 ? '#22c55e' : '#f59e0b'
          return (
            <div key={s.symbol} className="fin-range-row">
              <span className="fin-range-sym">{s.symbol}</span>
              <div className="fin-range-track">
                <div className="fin-range-fill" style={{ width: `${pct * 100}%`, background: color }} />
                <div className="fin-range-dot" style={{ left: `${pct * 100}%`, background: color }} />
              </div>
              <span className="fin-range-pct" style={{ color }}>{Math.round(pct * 100)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SectorHeatmap({ stocks }) {
  if (!stocks.length) return null
  const map = {}
  stocks.forEach(s => {
    if (!map[s.sector]) map[s.sector] = { sum: 0, count: 0 }
    map[s.sector].sum += (s.changePct || 0)
    map[s.sector].count++
  })
  const sectors = Object.entries(map)
    .map(([name, { sum, count }]) => ({ name, avg: sum / count }))
    .sort((a, b) => b.avg - a.avg)
  const maxAbs = Math.max(...sectors.map(s => Math.abs(s.avg)), 0.01)

  return (
    <div className="fin-panel fin-panel--sectors hud-panel">
      <div className="fin-panel-label"><RiBarChart2Line size={11} /> SECTOR PERFORMANCE</div>
      <div className="fin-sector-rows">
        {sectors.map(s => {
          const pos = s.avg >= 0
          const barW = Math.round((Math.abs(s.avg) / maxAbs) * 100)
          return (
            <div key={s.name} className="fin-sector-row">
              <span className="fin-sector-name">{s.name}</span>
              <div className="fin-sector-bar-wrap">
                <div className={`fin-sector-bar ${pos ? 'pos' : 'neg'}`} style={{ width: `${barW}%` }} />
              </div>
              <span className={`fin-sector-chg ${pos ? 'pos' : 'neg'}`}>
                {pos ? '+' : ''}{s.avg.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TickerStrip({ stocks }) {
  if (!stocks.length) return null
  const items = [...stocks, ...stocks]
  return (
    <div className="fin-ticker-wrap">
      <div className="fin-ticker-inner">
        {items.map((s, i) => (
          <span key={i} className="fin-ticker-item">
            <span className="fin-ticker-sym">{s.symbol}</span>
            <span className="fin-ticker-price">${s.price?.toFixed(2)}</span>
            <span className={`fin-ticker-chg${s.change >= 0 ? ' pos' : ' neg'}`}>
              {s.change >= 0 ? '+' : ''}{s.change?.toFixed(2)} ({s.changePct >= 0 ? '+' : ''}{s.changePct?.toFixed(2)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function EconomicPulse({ pulse, fallbackRows }) {
  const rows = pulse?.data?.length ? pulse.data : fallbackRows
  const cadence = pulse?.data?.length ? pulse.cadence : 'INDICATIVE'
  if (!rows?.length) return null
  return (
    <div className="fin-panel fin-panel--indicators hud-panel">
      <div className="fin-panel-label">
        <RiLineChartLine size={11} /> ECONOMIC PULSE
        <CadenceChip cadence={cadence} />
      </div>
      <div className="fin-indicators">
        {rows.map((ind, i) => (
          <div key={i} className="fin-ind-row">
            <div className="fin-ind-left">
              <span className="fin-ind-label">{ind.label}</span>
              <span className="fin-ind-note">{ind.note}</span>
            </div>
            <div className="fin-ind-right">
              <span className="fin-ind-value">{ind.value}</span>
              <span className={`fin-ind-chg ${ind.trend}`}>
                <TrendIcon trend={ind.trend} size={10} />
                {ind.change}
              </span>
            </div>
          </div>
        ))}
      </div>
      {pulse?.source === 'fred' && <div className="fin-tile-foot">FRED · ST. LOUIS FED</div>}
    </div>
  )
}

export default function FinancePage() {
  const { stocks, etfs, rents, indicators, loading, lastUpdated, source, marketOpen, refresh } = useFinance()
  const { extras, refreshExtras } = useExtras()

  const fmtTime = t => t
    ? t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '--'

  const statusText = loading
    ? 'SYNCING'
    : source === 'finnhub' ? 'MARKET DATA' : 'INDICATIVE DATA'

  const refreshAll = () => { refresh(); refreshExtras() }

  return (
    <div className="fin-page">
      <header className="fin-header hud-rise">
        <div className="fin-title-row">
          <div className="fin-header-text">
            <span className="hud-label">ATLAS <span className="slash">/</span> FINANCE</span>
            <h1 className="hud-title fin-title">Chicago Finance</h1>
          </div>
          <div className="fin-header-right">
            <span className="hud-chip live"><span className="dot" />{statusText}</span>
            {lastUpdated && (
              <span className={`hud-chip fin-last-updated${marketOpen === false ? ' fin-market-closed' : ''}`}>
                {marketOpen === false && <>MARKET CLOSED<span className="fin-chip-sep">·</span></>}
                UPDATED {fmtTime(lastUpdated)}
              </span>
            )}
            <button className={`fin-refresh${loading ? ' spinning' : ''}`} onClick={refreshAll} title="Refresh">
              <RiRefreshLine size={13} />
            </button>
          </div>
        </div>
        <TickerStrip stocks={stocks} />
      </header>

      <UsMarkets etfs={etfs} source={source} />

      <div className="fin-grid hud-rise" style={{ animationDelay: '0.1s' }}>
        <div className="fin-panel fin-panel--stocks hud-panel">
          <div className="fin-panel-label">
            <RiBarChartLine size={11} /> CHICAGO EQUITIES
            <CadenceChip cadence={source === 'finnhub' ? 'LIVE' : 'INDICATIVE'} />
          </div>
          <table className="fin-table">
            <thead>
              <tr>
                <th>SYMBOL</th>
                <th>COMPANY</th>
                <th className="fin-num">PRICE</th>
                <th className="fin-num">CHG</th>
                <th className="fin-num">CHG%</th>
                <th>SECTOR</th>
                <th className="fin-spark-th">7D</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map(s => (
                <tr key={s.symbol} className={s.change >= 0 ? 'pos-row' : 'neg-row'}>
                  <td className="fin-sym">{s.symbol}</td>
                  <td className="fin-name">{s.name}</td>
                  <td className="fin-num fin-price">${s.price?.toFixed(2)}</td>
                  <td className={`fin-num ${s.change >= 0 ? 'pos' : 'neg'}`}>
                    {s.change >= 0 ? '+' : ''}{s.change?.toFixed(2)}
                  </td>
                  <td className={`fin-num ${s.changePct >= 0 ? 'pos' : 'neg'}`}>
                    {s.changePct >= 0 ? '+' : ''}{s.changePct?.toFixed(2)}%
                  </td>
                  <td><span className="fin-sector">{s.sector}</span></td>
                  <td className="fin-spark-td">
                    <Sparkline data={s.history} positive={s.change >= 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="fin-right-col">
          <TopMovers stocks={stocks} />
          <ChicagoIndex stocks={stocks} />
        </div>
      </div>

      <div className="fin-mid-row hud-rise" style={{ animationDelay: '0.16s' }}>
        <SectorHeatmap stocks={stocks} />
        <RangePositions stocks={stocks} />
      </div>

      <div className="fin-macro-row hud-rise" style={{ animationDelay: '0.22s' }}>
        <CryptoTile section={extras?.crypto} />
        <FxTile section={extras?.fx} />
        <YieldCurveTile section={extras?.yields} />
        <FearGreedTile section={extras?.fearGreed} />
      </div>

      <div className="fin-local-row hud-rise" style={{ animationDelay: '0.28s' }}>
        <CityPulseTile section={extras?.city} />

        <div className="fin-panel fin-panel--rents hud-panel">
          <div className="fin-panel-label">
            <RiBuilding2Line size={11} /> CHICAGO RENT BAROMETER
            <CadenceChip cadence="INDICATIVE" />
          </div>
          <div className="fin-rent-grid">
            {rents.map(r => (
              <div key={r.neighborhood} className="fin-rent-row">
                <span className="fin-rent-hood">{r.neighborhood}</span>
                <div className="fin-rent-bar-wrap">
                  <div className="fin-rent-bar" style={{ width: `${Math.round((r.avgRent / 3500) * 100)}%` }} />
                </div>
                <span className="fin-rent-val">${r.avgRent.toLocaleString()}</span>
                <span className={`fin-rent-yoy ${r.trend}`}>
                  <TrendIcon trend={r.trend} size={10} />
                  {r.yoy > 0 ? '+' : ''}{r.yoy}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <EconomicPulse pulse={extras?.pulse} fallbackRows={indicators} />
      </div>
    </div>
  )
}
