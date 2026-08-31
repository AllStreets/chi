// frontend/src/App.jsx
import { Component, Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import CommandPalette from './components/hud/CommandPalette'
import './App.css'

// Route-level code splitting — keeps mapbox-gl and page chunks out of the
// initial bundle so first paint only ships the shell.
const HomePage          = lazy(() => import('./pages/HomePage'))
const TransitPage       = lazy(() => import('./pages/TransitPage'))
const FoodPage          = lazy(() => import('./pages/FoodPage'))
const NeighborhoodsPage = lazy(() => import('./pages/NeighborhoodsPage'))
const NightlifePage     = lazy(() => import('./pages/NightlifePage'))
const SportsPage        = lazy(() => import('./pages/SportsPage'))
const EventsPage        = lazy(() => import('./pages/EventsPage'))
const ExplorePage       = lazy(() => import('./pages/ExplorePage'))
const WeatherPage       = lazy(() => import('./pages/WeatherPage'))
const MyChicagoPage     = lazy(() => import('./pages/MyChicagoPage'))
const TonightPage       = lazy(() => import('./pages/TonightPage'))
const BeachPage         = lazy(() => import('./pages/BeachPage'))
const ReportsPage       = lazy(() => import('./pages/ReportsPage'))
const FinancePage       = lazy(() => import('./pages/FinancePage'))
const PoliticsPage      = lazy(() => import('./pages/PoliticsPage'))
const HealthPage        = lazy(() => import('./pages/HealthPage'))
const SettingsPage      = lazy(() => import('./pages/SettingsPage'))

function PageLoader() {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.3em',
      color: 'var(--text-faint)', textTransform: 'uppercase',
    }}>
      <span className="hud-chip live"><span className="dot" />Loading sector…</span>
    </div>
  )
}

class PageBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 32, color: '#64748b', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        Page error: {this.state.err.message}
      </div>
    )
    return this.props.children
  }
}

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

function applyAppearance() {
  const accent = localStorage.getItem('chi_ui_accent') || '#45d8ff'
  const density = localStorage.getItem('chi_ui_density') || 'normal'
  const r = parseInt(accent.slice(1, 3), 16) || 69
  const g = parseInt(accent.slice(3, 5), 16) || 216
  const b = parseInt(accent.slice(5, 7), 16) || 255
  document.documentElement.style.setProperty('--accent', accent)
  document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  document.documentElement.setAttribute('data-density', density)
}

export default function App() {
  useEffect(() => { applyAppearance() }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.register('/sw.js').then(async reg => {
      const r = await fetch(`${API}/api/push/vapid-key`)
      const { key } = await r.json()
      if (!key) return
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      })
      await fetch(`${API}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
            auth:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))),
          },
        }),
      })
    }).catch(() => {})
  }, [])

  return (
    <BrowserRouter>
      <Sidebar />
      <CommandPalette />
      <main className="main-content">
        <PageBoundary>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"              element={<HomePage />} />
            <Route path="/transit"       element={<TransitPage />} />
            <Route path="/food"          element={<FoodPage />} />
            <Route path="/neighborhoods" element={<NeighborhoodsPage />} />
            <Route path="/nightlife"     element={<NightlifePage />} />
            <Route path="/sports"        element={<SportsPage />} />
            <Route path="/events"        element={<EventsPage />} />
            <Route path="/explore"       element={<ExplorePage />} />
            <Route path="/weather"       element={<WeatherPage />} />
            <Route path="/me"            element={<MyChicagoPage />} />
            <Route path="/tonight"       element={<TonightPage />} />
            <Route path="/beach"         element={<BeachPage />} />
            <Route path="/311"           element={<ReportsPage />} />
            <Route path="/finance"       element={<FinancePage />} />
            <Route path="/news"           element={<PoliticsPage />} />
            <Route path="/health"        element={<HealthPage />} />
            <Route path="/settings"      element={<SettingsPage />} />
          </Routes>
          </Suspense>
        </PageBoundary>
      </main>
    </BrowserRouter>
  )
}
