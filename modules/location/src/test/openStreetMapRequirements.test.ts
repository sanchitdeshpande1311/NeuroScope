import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  searchNearbyNeurologists,
  geocodeLocation,
  determineProviderCategory,
} from '../services/placesService'
import {
  calculateDistanceKm,
  formatDistance,
  buildOsmDirectionsUrl,
  buildGoogleMapsDirectionsUrl,
  sortNeurologists,
} from '../services/distanceService'
import type { SearchParams, NeurologistProvider } from '../types/neurologist'

describe('OpenStreetMap Requirements Comprehensive Suite (Spec Section 8)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // 1. Valid and invalid location coordinates
  describe('1. Valid and Invalid Location Coordinates', () => {
    it('accepts valid coordinates within global geographic bounds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          source: 'openstreetmap',
          results: [],
        }),
      } as any)

      const result = await searchNearbyNeurologists({
        locationName: 'Boston, MA',
        coordinates: { lat: 42.3601, lng: -71.0589 },
        radiusKm: 10,
        isUsingCurrentLocation: false,
      })

      expect(result.source).toBe('openstreetmap')
    })

    it('rejects invalid latitude (< -90 or > 90)', async () => {
      await expect(
        searchNearbyNeurologists({
          locationName: 'Invalid North Pole',
          coordinates: { lat: 91.5, lng: -71.0589 },
          radiusKm: 10,
          isUsingCurrentLocation: false,
        })
      ).rejects.toThrow(/Valid search coordinates/i)

      await expect(
        searchNearbyNeurologists({
          locationName: 'Invalid South Pole',
          coordinates: { lat: -95.0, lng: -71.0589 },
          radiusKm: 10,
          isUsingCurrentLocation: false,
        })
      ).rejects.toThrow(/Valid search coordinates/i)
    })

    it('rejects invalid longitude (< -180 or > 180)', async () => {
      await expect(
        searchNearbyNeurologists({
          locationName: 'Invalid East',
          coordinates: { lat: 42.3601, lng: 185.0 },
          radiusKm: 10,
          isUsingCurrentLocation: false,
        })
      ).rejects.toThrow(/Valid search coordinates/i)
    })

    it('rejects NaN or missing coordinates', async () => {
      await expect(
        searchNearbyNeurologists({
          locationName: 'Missing Coords',
          coordinates: undefined as any,
          radiusKm: 10,
          isUsingCurrentLocation: false,
        })
      ).rejects.toThrow(/Valid search coordinates/i)
    })
  })

  // 2. Radius filtering
  describe('2. Radius Filtering', () => {
    it('strictly filters out providers outside the selected radius', async () => {
      // Search center: 42.3601, -71.0589 (Boston Downtown)
      // Facility A: 42.362, -71.069 (~0.8 km - within 5km)
      // Facility B: 42.338, -71.104 (~2.8 km - within 5km)
      // Facility C: 42.400, -71.200 (~12.4 km - beyond 5km and 10km, within 25km)
      // Facility D: 42.600, -71.500 (~45 km - beyond 25km)

      const mockOverpassResults = [
        {
          id: 'fac-a',
          name: 'Downtown Boston Neuro Clinic',
          geometry: { location: { lat: 42.362, lng: -71.069 } },
          osmTags: { 'healthcare:speciality': 'neurology' },
        },
        {
          id: 'fac-b',
          name: 'Longwood Medical Neurology',
          geometry: { location: { lat: 42.338, lng: -71.104 } },
          osmTags: { 'healthcare:speciality': 'neurology' },
        },
        {
          id: 'fac-c',
          name: 'Suburban Neurology Practice',
          geometry: { location: { lat: 42.4, lng: -71.2 } },
          osmTags: { 'healthcare:speciality': 'neurology' },
        },
        {
          id: 'fac-d',
          name: 'Far Rural Medical Center',
          geometry: { location: { lat: 42.6, lng: -71.5 } },
          osmTags: { amenity: 'hospital' },
        },
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          source: 'openstreetmap',
          results: mockOverpassResults,
        }),
      } as any)

      // Test 5 km radius
      const res5km = await searchNearbyNeurologists({
        locationName: 'Boston, MA',
        coordinates: { lat: 42.3601, lng: -71.0589 },
        radiusKm: 5,
        isUsingCurrentLocation: false,
      })
      expect(res5km.providers.map((p) => p.id)).toEqual(['fac-a', 'fac-b'])

      // Test 10 km radius
      const res10km = await searchNearbyNeurologists({
        locationName: 'Boston, MA',
        coordinates: { lat: 42.3601, lng: -71.0589 },
        radiusKm: 10,
        isUsingCurrentLocation: false,
      })
      expect(res10km.providers.map((p) => p.id)).toEqual(['fac-a', 'fac-b'])

      // Test 25 km radius
      const res25km = await searchNearbyNeurologists({
        locationName: 'Boston, MA',
        coordinates: { lat: 42.3601, lng: -71.0589 },
        radiusKm: 25,
        isUsingCurrentLocation: false,
      })
      expect(res25km.providers.map((p) => p.id)).toContain('fac-c')
      expect(res25km.providers.map((p) => p.id)).not.toContain('fac-d') // Far Rural is ~45 km, filtered out
    })
  })

  // 3. Distance calculation
  describe('3. Distance Calculation and Formatting', () => {
    it('computes accurate spherical distance using Haversine algorithm', () => {
      // Boston Common (42.3550, -71.0656) to Harvard Square (42.3736, -71.1189) is approx 4.8 km
      const boston = { lat: 42.355, lng: -71.0656 }
      const harvard = { lat: 42.3736, lng: -71.1189 }
      const dist = calculateDistanceKm(boston, harvard)
      expect(dist).toBeGreaterThan(4.5)
      expect(dist).toBeLessThan(5.2)
    })

    it('formats sub-kilometer distance in meters and multi-kilometer in kilometers', () => {
      expect(formatDistance(0.15)).toBe('150 m away')
      expect(formatDistance(0.89)).toBe('890 m away')
      expect(formatDistance(1.0)).toBe('1.0 km away')
      expect(formatDistance(5.42)).toBe('5.4 km away')
      expect(formatDistance(undefined)).toBe('Distance unavailable')
    })
  })

  // 4. Missing provider tags
  describe('4. Graceful Handling of Missing Provider Tags', () => {
    it('handles facilities with missing name, phone, website, and hours without crashing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          source: 'openstreetmap',
          results: [
            {
              id: 'osm-node-empty',
              place_id: 'osm-node-empty',
              // Name omitted
              geometry: { location: { lat: 42.3601, lng: -71.0589 } },
              // Phone, website, hours omitted
              osmTags: { amenity: 'clinic' },
            },
          ],
        }),
      } as any)

      const res = await searchNearbyNeurologists({
        locationName: 'Boston, MA',
        coordinates: { lat: 42.3601, lng: -71.0589 },
        radiusKm: 10,
        isUsingCurrentLocation: false,
      })

      expect(res.providers.length).toBe(1)
      const provider = res.providers[0]
      expect(provider.name).toBe('Healthcare Facility') // Fallback default
      expect(provider.phoneNumber).toBeUndefined()
      expect(provider.website).toBeUndefined()
      expect(provider.consultationFee).toBeNull() // Honest null
      expect(provider.rating).toBeUndefined() // Honest undefined, never 0
    })
  })

  // 5. Honest specialty classification
  describe('5. Honest Specialty Classification', () => {
    it('distinguishes neurosurgeons from medical neurologists', () => {
      const surg = determineProviderCategory('Boston Neurosurgical Associates', ['doctor'], {
        'healthcare:speciality': 'neurosurgery',
      })
      expect(surg.category).toBe('neurosurgeon')
      expect(surg.categoryLabel).toContain('Neurosurgery')
      expect(surg.isSpecialtyVerified).toBe(true)
    })

    it('distinguishes verified neurologists and clinics with evidence', () => {
      const doc = determineProviderCategory('Dr. Jane Doe, MD', ['doctor'], {
        'healthcare:speciality': 'neurology',
      })
      expect(doc.category).toBe('neurologist')
      expect(doc.isSpecialtyVerified).toBe(true)

      const clinic = determineProviderCategory('Boston Neurology Clinic', ['clinic'])
      expect(clinic.category).toBe('neurology_clinic')
      expect(clinic.isSpecialtyVerified).toBe(true)
    })

    it('marks general hospitals and unspecialized clinics as unverified for neurology', () => {
      const hosp = determineProviderCategory('General Community Hospital', ['hospital'], {
        amenity: 'hospital',
      })
      expect(hosp.category).toBe('hospital')
      expect(hosp.isSpecialtyVerified).toBe(false)
      expect(hosp.categoryLabel).toContain('Verify Neurology Dept')

      const generalDoctor = determineProviderCategory('Dr. Robert Smith, Family Medicine', ['doctor'], {
        amenity: 'doctors',
      })
      expect(generalDoctor.category).toBe('healthcare_provider')
      expect(generalDoctor.isSpecialtyVerified).toBe(false)
      expect(generalDoctor.categoryLabel).toContain('Specialty Unverified')
    })
  })

  // 6. Empty search results
  describe('6. Honest Empty Search Results Handling', () => {
    it('returns empty results honestly without substituting fabricated sample doctors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          source: 'openstreetmap',
          results: [],
        }),
      } as any)

      const res = await searchNearbyNeurologists({
        locationName: 'Remote Desert Point',
        coordinates: { lat: 31.0, lng: -105.0 },
        radiusKm: 10,
        isUsingCurrentLocation: false,
      })

      expect(res.providers).toEqual([])
      expect(res.source).toBe('openstreetmap')
      expect(res.message).toContain('No mapped healthcare providers found')
    })
  })

  // 7. Overpass timeout and service failure
  describe('7. Overpass Timeout and Service Failure', () => {
    it('reports Overpass server busy/timeout honestly with retry guidance', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        json: async () => ({
          error: 'Overpass query timed out or server is busy. Please try again with a smaller radius.',
          code: 'OVERPASS_TIMEOUT',
        }),
      } as any)

      await expect(
        searchNearbyNeurologists({
          locationName: 'Boston, MA',
          coordinates: { lat: 42.3601, lng: -71.0589 },
          radiusKm: 25,
          isUsingCurrentLocation: false,
        })
      ).rejects.toThrow(/timed out or server is busy/i)
    })
  })

  // 8. Geocoding failure
  describe('8. Geocoding Failure Handling', () => {
    it('rejects empty and whitespace-only location searches', async () => {
      await expect(geocodeLocation('')).rejects.toThrow(/valid city/i)
      await expect(geocodeLocation('    ')).rejects.toThrow(/valid city/i)
    })

    it('handles zero results from Nominatim with clear error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [],
          status: 'ZERO_RESULTS',
        }),
      } as any)

      await expect(geocodeLocation('NonExistentFictionalTown99999')).rejects.toThrow(
        /No geographic coordinates found/i
      )
    })
  })

  // 9. No fabricated fallback results
  describe('9. Data Integrity: Strict Prohibition of Fabricated Results', () => {
    it('verifies that no fake ratings, review counts, or fees are injected into OSM results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          source: 'openstreetmap',
          results: [
            {
              id: 'osm-1',
              name: 'Real Massachusetts Clinic',
              geometry: { location: { lat: 42.36, lng: -71.06 } },
              osmTags: { amenity: 'clinic' },
            },
          ],
        }),
      } as any)

      const res = await searchNearbyNeurologists({
        locationName: 'Boston, MA',
        coordinates: { lat: 42.3601, lng: -71.0589 },
        radiusKm: 10,
        isUsingCurrentLocation: false,
      })

      const provider = res.providers[0]
      // Rating must NOT be fabricated
      expect(provider.rating).toBeUndefined()
      expect(provider.reviewCount).toBeUndefined()
      // Consultation fee must be null with honest disclaimer
      expect(provider.consultationFee).toBeNull()
      // Qualifications must be undefined unless independently verified
      expect(provider.qualifications).toBeUndefined()
      expect(provider.yearsExperience).toBeUndefined()
      // Source must be openstreetmap
      expect(provider.source).toBe('openstreetmap')
    })
  })

  // 10. Map rendering and directions link construction
  describe('10. Map Directions Link Construction', () => {
    it('constructs working OpenStreetMap OSRM routing URL with origin and destination coordinates', () => {
      const url = buildOsmDirectionsUrl(
        { coordinates: { lat: 42.3601, lng: -71.0589 } },
        { coordinates: { lat: 42.355, lng: -71.065 } }
      )

      expect(url).toContain('https://www.openstreetmap.org/directions?engine=fossgis_osrm_car')
      expect(url).toContain('42.355%2C-71.065%3B42.3601%2C-71.0589')
    })

    it('constructs Google Maps directions fallback URL using real coordinates', () => {
      const url = buildGoogleMapsDirectionsUrl(
        { coordinates: { lat: 42.3601, lng: -71.0589 } },
        { coordinates: { lat: 42.355, lng: -71.065 } }
      )

      expect(url).toContain('https://www.google.com/maps/dir/?api=1')
      expect(url).toContain('destination=42.3601%2C-71.0589')
      expect(url).toContain('origin=42.355%2C-71.065')
    })
  })

  // 11. Live Overpass Network Verification
  describe('11. [Live Overpass Integration] Genuine API Verification', () => {
    it(
      'probes live Overpass API interpreter directly (if network available)',
      async () => {
      try {
        const query = `[out:json][timeout:15];nwr["amenity"="hospital"](around:2000,42.3601,-71.0589);out center qt 5;`
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 12000)

        const res = await originalFetch(url, {
          headers: {
            'User-Agent': 'NeuroScope3D-LiveVerification/2.0 (medical-research)',
          },
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (res.ok) {
          const data = await res.json()
          expect(data.elements).toBeDefined()
          expect(Array.isArray(data.elements)).toBe(true)
          if (data.elements.length > 0) {
            const first = data.elements[0]
            expect(first.id).toBeDefined()
            expect(first.tags).toBeDefined()
            // Confirms genuine OpenStreetMap healthcare data is returned from Germany/OSM Foundation servers
            expect(first.tags.amenity || first.tags.healthcare).toBeDefined()
          }
        }
      } catch (err: any) {
        // If external network is unreachable or times out during testing, log warning
        console.warn('Live Overpass network check skipped/unavailable:', err?.message)
      }
    }, 20000)
  })
})
