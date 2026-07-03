import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import IntelFeed from '../IntelFeed'

const mockWeather = { temp: 18, tempF: 64, description: 'partly cloudy', wind: { speed: 4.2 } }
const mockLake = { niceLabel: 'Great day', niceScore: 78, tempC: 16 }
const mockTrains = [
  { rn: '101', line: 'Red', nextStation: 'Grand', arrTime: '20260323 14:02:00' }
]

describe('IntelFeed', () => {
  it('renders weather temp', () => {
    render(<MemoryRouter><IntelFeed weather={mockWeather} lake={mockLake} trains={mockTrains} /></MemoryRouter>)
    expect(screen.getByText(/64/)).toBeInTheDocument()
  })

  it('renders lake niceness label', () => {
    render(<MemoryRouter><IntelFeed weather={mockWeather} lake={mockLake} trains={mockTrains} /></MemoryRouter>)
    expect(screen.getByText(/Great day/i)).toBeInTheDocument()
  })

  it('renders train arrivals', () => {
    render(<MemoryRouter><IntelFeed weather={mockWeather} lake={mockLake} trains={mockTrains} /></MemoryRouter>)
    expect(screen.getByText(/Red/i)).toBeInTheDocument()
    expect(screen.getByText(/Grand/i)).toBeInTheDocument()
  })
})
