import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  determineProviderCategory,
  searchNearbyNeurologists,
  geocodeLocation,
} from '../services/placesService'

describe('placesService', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('determineProviderCategory (Honest OSM Tag Classification)', () => {
    it('classifies neurosurgery surgical practices distinctly from neurology', () => {
      const surg = determineProviderCategory('Boston Spine & NeuroSurgery Center', ['doctor'], {
        'healthcare:speciality': 'neurosurgery',
      })
      expect(surg.category).toBe('neurosurgeon')
      expect(surg.categoryLabel).toContain('Neurosurgery')
      expect(surg.isSpecialtyVerified).toBe(true)
    })

    it('classifies verified neurologist physician when explicit neurology tag or title is present', () => {
      // With explicit OSM healthcare:speciality tag
      const docWithTag = determineProviderCategory('Dr. Jane Doe, MD', ['doctor'], {
        'healthcare:speciality': 'neurology',
        amenity: 'doctors',
      })
      expect(docWithTag.category).toBe('neurologist')
      expect(docWithTag.isSpecialtyVerified).toBe(true)

      // With neurology in title
      const docWithName = determineProviderCategory('Dr. Alan Turing, MD - Neurologist', ['doctor'])
      expect(docWithName.category).toBe('neurologist')
      expect(docWithName.isSpecialtyVerified).toBe(true)
    })

    it('classifies neurology clinics accurately', () => {
      const clinic = determineProviderCategory('Cambridge Neurology Clinic & Associates', ['clinic'], {
        amenity: 'clinic',
      })
      expect(clinic.category).toBe('neurology_clinic')
      expect(clinic.isSpecialtyVerified).toBe(true)
    })

    it('identifies general hospitals honestly as unverified for neurology specialty', () => {
      const hosp = determineProviderCategory('Massachusetts General Hospital', ['hospital'], {
        amenity: 'hospital',
      })
      expect(hosp.category).toBe('hospital')
      expect(hosp.categoryLabel).toContain('Verify Neurology Dept')
      expect(hosp.isSpecialtyVerified).toBe(false)
    })

    it('identifies unverified general doctors honestly without fabricating a neurology specialty', () => {
      const generalDoc = determineProviderCategory('Dr. Arthur Conan, MD', ['doctor'], {
        amenity: 'doctors',
      })
      expect(generalDoc.category).toBe('healthcare_provider')
      expect(generalDoc.categoryLabel).toContain('Specialty Unverified')
      expect(generalDoc.isSpecialtyVerified).toBe(false)
    })
  })

  describe('searchNearbyNeurologists', () => {
    it('queries OpenStreetMap Overpass backend and returns mapped providers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          source: 'openstreetmap',
          results: [
            {
              id: 'osm-node-12345',
              name: 'Mass General Neurology Clinic',
              category: 'neurology_clinic',
              categoryLabel: 'Neurology Clinic',
              isSpecialtyVerified: true,
              address: '55 Fruit St, Boston, MA',
              coordinates: { lat: 42.362, lng: -71.069 },
              distanceKm: 0.8,
              osmId: '12345',
              osmType: 'node',
              osmUrl: 'https://www.openstreetmap.org/node/12345',
              source: 'openstreetmap',
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

      expect(res.source).toBe('openstreetmap')
      expect(res.providers.length).toBe(1)
      expect(res.providers[0].name).toBe('Mass General Neurology Clinic')
      expect(res.providers[0].osmId).toBe('12345')
      expect(res.providers[0].isSpecialtyVerified).toBe(true)
    })

    it('rejects invalid search coordinates', async () => {
      await expect(
        searchNearbyNeurologists({
          locationName: 'Invalid Location',
          coordinates: { lat: 999, lng: 999 }, // Out of range
          radiusKm: 10,
          isUsingCurrentLocation: false,
        })
      ).rejects.toThrow(/Valid search coordinates/i)
    })

    it('handles Overpass timeout and rate limiting honestly without falling back to fake doctors', async () => {
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

  describe('geocodeLocation (Nominatim geocoding)', () => {
    it('rejects empty or whitespace query', async () => {
      await expect(geocodeLocation('   ')).rejects.toThrow(/valid city/i)
    })

    it('geocodes valid city via Nominatim proxy', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              formatted_address: 'Boston, Suffolk County, Massachusetts, USA',
              geometry: { location: { lat: 42.3554, lng: -71.0605 } },
            },
          ],
        }),
      } as any)

      const geo = await geocodeLocation('Boston, MA')
      expect(geo.coordinates.lat).toBeCloseTo(42.355, 2)
      expect(geo.coordinates.lng).toBeCloseTo(-71.06, 2)
      expect(geo.formattedAddress).toContain('Boston')
    })

    it('throws meaningful error when Nominatim returns no results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [],
        }),
      } as any)

      await expect(geocodeLocation('NonExistentCityXYZ12345')).rejects.toThrow(/No location results found/i)
    })
  })
})

