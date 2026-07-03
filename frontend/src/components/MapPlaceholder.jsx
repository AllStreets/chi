import { RiMapPinLine } from 'react-icons/ri'

export default function MapPlaceholder() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 300, gap: 10,
      background: 'var(--panel)',
      WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
      backdropFilter: 'blur(18px) saturate(1.3)',
      border: '1px dashed var(--border-strong)',
      borderRadius: 'var(--r-lg)',
      color: 'var(--text-muted)',
    }}>
      <RiMapPinLine style={{ fontSize: 32, color: 'var(--text-faint)' }} />
      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-faint)',
      }}>
        Map Offline
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>Map requires VITE_MAPBOX_TOKEN</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>Add token to frontend/.env to enable</div>
    </div>
  )
}
