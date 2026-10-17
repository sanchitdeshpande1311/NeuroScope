import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NearbyNeurologistsModule } from '../components/NearbyNeurologistsModule'

describe('NearbyNeurologistsModule Integration', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    // Default mock: successful OpenStreetMap Overpass results
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/geocode')) {
        return {
          ok: true,
          json: async () => ({
            results: [{ geometry: { location: { lat: 42.3601, lng: -71.0589 } }, formatted_address: 'Boston, MA, USA' }],
          }),
        } as any
      }
      return {
        ok: true,
        json: async () => ({
          status: 'OK',
          source: 'openstreetmap',
          results: [
            {
              id: 'osm-node-1',
              name: 'Dr. Elena Vance Neurology Clinic',
              category: 'neurologist',
              categoryLabel: 'Neurologist (Physician Listing)',
              isSpecialtyVerified: true,
              address: '75 Francis St, Boston, MA',
              coordinates: { lat: 42.3364, lng: -71.1072 },
              geometry: { location: { lat: 42.3364, lng: -71.1072 } },
              distanceKm: 2.1,
              osmId: '1',
              osmType: 'node',
              osmUrl: 'https://www.openstreetmap.org/node/1',
              phoneNumber: '+1 (617) 555-0192',
              source: 'openstreetmap',
            },
            {
              id: 'osm-way-2',
              name: 'St. Jude Regional Medical Center',
              category: 'hospital',
              categoryLabel: 'Hospital / Medical Center (Verify Neurology Dept)',
              isSpecialtyVerified: false,
              address: '730 Commonwealth Ave, Boston, MA',
              coordinates: { lat: 42.3505, lng: -71.1102 },
              geometry: { location: { lat: 42.3505, lng: -71.1102 } },
              distanceKm: 3.2,
              osmId: '2',
              osmType: 'way',
              osmUrl: 'https://www.openstreetmap.org/way/2',
              phoneNumber: '+1 (617) 555-0590',
              source: 'openstreetmap',
            },
          ],
        }),
      } as any
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders search page with heading, location input, and default 10 km radius', async () => {
    render(<NearbyNeurologistsModule />)

    expect(screen.getByRole('heading', { level: 1, name: /find nearby neurologist/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/e.g. Boston, MA or 02115/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use my current location/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /10 km/i })).toHaveAttribute('aria-checked', 'true')

    // Wait for live OSM results to load
    await waitFor(() => {
      expect(screen.getByText(/neurology & healthcare facilities/i)).toBeInTheDocument()
      expect(screen.getByText(/2 facilities/i)).toBeInTheDocument()
    })
  })

  it('allows filtering live results by category (Hospitals, Neurologists)', async () => {
    render(<NearbyNeurologistsModule />)

    await waitFor(() => {
      expect(screen.getByText(/neurology & healthcare facilities/i)).toBeInTheDocument()
    })

    // Filter by Hospitals
    const hospFilterBtn = screen.getByRole('button', { name: /^hospitals$/i })
    fireEvent.click(hospFilterBtn)

    // Should display clean hospital category badge
    expect(screen.getByText(/^hospital$/i)).toBeInTheDocument()
    expect(screen.queryByText(/Dr. Elena Vance Neurology Clinic/i)).not.toBeInTheDocument()
  })

  it('navigates from card list to detail page when View Details is clicked and returns on back click', async () => {
    render(<NearbyNeurologistsModule />)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /view details/i }).length).toBeGreaterThan(0)
    })

    const viewDetailsButtons = screen.getAllByRole('button', { name: /view details/i })
    fireEvent.click(viewDetailsButtons[0])

    // Should now be on detail page
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to search results/i })).toBeInTheDocument()
      expect(screen.getByText(/Reference ID:/i)).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    // Go back
    fireEvent.click(screen.getByRole('button', { name: /back to search results/i }))
    await waitFor(() => {
      expect(screen.getByText(/neurology & healthcare facilities/i)).toBeInTheDocument()
    })
  })

  it('renders honest OpenStreetMap service notice when Overpass timeout or rate limiting occurs', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      json: async () => ({
        error: 'Overpass query timed out or server is busy. Please try again with a smaller radius.',
        code: 'OVERPASS_TIMEOUT',
      }),
    } as any)

    render(<NearbyNeurologistsModule />)

    await waitFor(() => {
      expect(screen.getByText(/overpass query timed out or rate-limited/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry search/i })).toBeInTheDocument()
      expect(screen.getByText(/zero synthetic doctors are substituted/i)).toBeInTheDocument()
    })
  })
})

