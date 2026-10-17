import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NeurologistCard } from '../components/NeurologistCard'
import { NeurologistDetails } from '../components/NeurologistDetails'
import { RadiusSelector } from '../components/RadiusSelector'
import { DisclaimerBanner } from '../components/DisclaimerBanner'
import { FindNearbyNeurologistsButton } from '../components/FindNearbyNeurologistsButton'
import type { NeurologistProvider } from '../types/neurologist'

const mockOsmVerifiedNeurologist: NeurologistProvider = {
  id: 'osm-node-101',
  name: 'Boston Brain & Neurological Health',
  category: 'neurologist',
  categoryLabel: 'Neurologist (Physician Listing)',
  isSpecialtyVerified: true,
  address: '75 Francis St, Boston, MA 02115',
  formattedAddress: '75 Francis St, Boston, MA 02115, USA',
  coordinates: { lat: 42.3364, lng: -71.1072 },
  distanceKm: 2.1,
  isOpenNow: true,
  phoneNumber: '+1 (617) 555-0192',
  website: 'https://example.org/neuro/boston-brain',
  osmId: '101',
  osmType: 'node',
  osmUrl: 'https://www.openstreetmap.org/node/101',
  specialityTags: ['neurology'],
  source: 'openstreetmap',
}

const mockOsmGeneralHospital: NeurologistProvider = {
  id: 'osm-way-202',
  name: 'Metropolitan Community Hospital',
  category: 'hospital',
  categoryLabel: 'Hospital / Medical Center (Verify Neurology Dept)',
  isSpecialtyVerified: false,
  address: '100 Main St, Boston, MA',
  coordinates: { lat: 42.35, lng: -71.06 },
  distanceKm: 3.5,
  osmId: '202',
  osmType: 'way',
  osmUrl: 'https://www.openstreetmap.org/way/202',
  source: 'openstreetmap',
}

const mockProviderWithVerifiedFee: NeurologistProvider = {
  id: 'osm-node-303',
  name: 'Boston Headache & Neurology Clinic',
  category: 'neurology_clinic',
  categoryLabel: 'Neurology Clinic / Specialized Practice',
  isSpecialtyVerified: true,
  address: '55 Fruit St, Boston, MA',
  coordinates: { lat: 42.36, lng: -71.07 },
  distanceKm: 1.8,
  consultationFee: {
    amount: '$250',
    currency: 'USD',
    sourceNotice: 'Official self-pay fee schedule',
    dateVerified: 'October 2026',
  },
  source: 'openstreetmap',
}

describe('NeurologistCard', () => {
  it('renders verified neurologist card with category, specialty badge, distance, and contact details', () => {
    const onSelect = vi.fn()
    render(
      <NeurologistCard
        provider={mockOsmVerifiedNeurologist}
        userOrigin={{ lat: 42.355, lng: -71.06 }}
        onSelect={onSelect}
      />
    )

    expect(screen.getByText('Boston Brain & Neurological Health')).toBeInTheDocument()
    expect(screen.getByText('Neurology')).toBeInTheDocument()
    expect(screen.getByText('2.1 km away')).toBeInTheDocument()
    expect(screen.getByText('Neurologist')).toBeInTheDocument()
    expect(screen.getByText('+1 (617) 555-0192')).toBeInTheDocument()
    // Must NOT display raw technical source label on card
    expect(screen.queryByText('OpenStreetMap')).not.toBeInTheDocument()

    const viewDetailsBtn = screen.getByRole('button', { name: /view details/i })
    fireEvent.click(viewDetailsBtn)
    expect(onSelect).toHaveBeenCalledWith(mockOsmVerifiedNeurologist)
  })

  it('renders unverified facility honestly without fabricating ratings or false claims', () => {
    const onSelect = vi.fn()
    render(<NeurologistCard provider={mockOsmGeneralHospital} onSelect={onSelect} />)

    expect(screen.getByText('Metropolitan Community Hospital')).toBeInTheDocument()
    // Unwanted technical label removed
    expect(screen.queryByText('Specialty Unverified in OSM')).not.toBeInTheDocument()
    // Must NOT fabricate a rating of 0 or empty rating stars
    expect(screen.queryByText('0.0')).not.toBeInTheDocument()
    expect(screen.queryByText(/Google reviews/i)).not.toBeInTheDocument()
  })

  it('renders directions link utilizing coordinates', () => {
    render(
      <NeurologistCard
        provider={mockOsmVerifiedNeurologist}
        userOrigin={{ lat: 42.355, lng: -71.06 }}
        onSelect={vi.fn()}
      />
    )
    const dirLink = screen.getByRole('link', { name: /get directions/i })
    expect(dirLink).toHaveAttribute('href')
    expect(dirLink.getAttribute('href')).toContain('openstreetmap.org/directions')
  })
})

describe('NeurologistDetails', () => {
  it('displays provider details on left and interactive Leaflet map on right', () => {
    const onBack = vi.fn()
    render(
      <NeurologistDetails
        provider={mockOsmVerifiedNeurologist}
        userOrigin={{ lat: 42.35, lng: -71.06 }}
        onBack={onBack}
      />
    )

    // Heading & verification
    expect(screen.getByRole('heading', { level: 1, name: 'Boston Brain & Neurological Health' })).toBeInTheDocument()
    expect(screen.getByText(/Verified Neurology Specialty/i)).toBeInTheDocument()
    expect(screen.getByText(/Reference ID:/i)).toBeInTheDocument()
    expect(screen.getByText('101')).toBeInTheDocument()

    // Strict fee requirement when no fee is published
    expect(screen.getByText(/Consultation fee not publicly available/i)).toBeInTheDocument()

    // Interactive map title and live view badge
    expect(screen.getByText(/Interactive Map View/i)).toBeInTheDocument()
    expect(screen.getByText(/Live Map View/i)).toBeInTheDocument()

    // Back button
    const backBtn = screen.getByRole('button', { name: /back to search results/i })
    fireEvent.click(backBtn)
    expect(onBack).toHaveBeenCalled()
  })

  it('displays verified fee only when published with source notice', () => {
    render(
      <NeurologistDetails
        provider={mockProviderWithVerifiedFee}
        onBack={vi.fn()}
      />
    )

    expect(screen.getByText('$250 USD')).toBeInTheDocument()
    expect(screen.getByText(/Official self-pay fee schedule/)).toBeInTheDocument()
    expect(screen.getByText(/Date checked: October 2026/)).toBeInTheDocument()
  })

  it('toggles map between split layout and expanded view', () => {
    render(
      <NeurologistDetails
        provider={mockOsmVerifiedNeurologist}
        onBack={vi.fn()}
      />
    )

    const toggleBtn = screen.getByRole('button', { name: /expand map/i })
    expect(toggleBtn).toBeInTheDocument()

    // Expand the map
    fireEvent.click(toggleBtn)
    expect(screen.getByRole('button', { name: /restore directory view/i })).toBeInTheDocument()
    expect(screen.getByText(/full screen map active/i)).toBeInTheDocument()

    // Collapse back to split view
    const collapseBtn = screen.getByRole('button', { name: /restore directory view/i })
    fireEvent.click(collapseBtn)
    expect(screen.getByRole('button', { name: /expand map/i })).toBeInTheDocument()
    expect(screen.queryByText(/full screen map active/i)).not.toBeInTheDocument()
  })
})

describe('RadiusSelector', () => {
  it('renders 5km, 10km, and 25km options and signals changes', () => {
    const onChange = vi.fn()
    render(<RadiusSelector selectedRadius={10} onChange={onChange} />)

    expect(screen.getByRole('radio', { name: /^5 km$/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /10 km/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^25 km$/i })).toBeInTheDocument()

    // Click 25 km
    fireEvent.click(screen.getByRole('radio', { name: /^25 km$/i }))
    expect(onChange).toHaveBeenCalledWith(25)
  })
})

describe('DisclaimerBanner & Button', () => {
  it('renders neutral medical discovery disclaimer and omits unwanted explore text', () => {
    render(<DisclaimerBanner variant="medical" />)
    expect(screen.getByText(/Healthcare Directory & Medical Notice/i)).toBeInTheDocument()
    expect(screen.queryByText(/Explore nearby neurology providers/i)).not.toBeInTheDocument()
  })

  it('renders FindNearbyNeurologistsButton and triggers onClick', () => {
    const onClick = vi.fn()
    render(<FindNearbyNeurologistsButton onClick={onClick} />)

    const btn = screen.getByRole('button', { name: /find nearby neurologists/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalled()
  })
})

