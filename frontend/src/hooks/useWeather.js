// frontend/src/hooks/useWeather.js
import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

export default function useWeather() {
  const [weather, setWeather] = useState(null)
  const [lake, setLake] = useState(null)

  useEffect(() => {
    fetch(`${API}/api/weather`)
      .then(r => r.json())
      .then(d => setWeather(d))
      .catch(() => {})

    fetch(`${API}/api/lake`)
      .then(r => r.json())
      .then(d => setLake(d))
      .catch(() => {})
  }, [])

  return { weather, lake }
}
