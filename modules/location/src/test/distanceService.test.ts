import { describe, it, expect } from 'vitest'
import {
  calculateDistanceKm,
  formatDistance,
  sortNeurologists,
  buildOsmDirectionsUrl,
  buildGoogleMapsDirectionsUrl,
} from '../services/distanceService'
import type { NeurologistProvider } from '../types/neurologist'

describe('distanceService', () => {
  it('calculates accurate Haversine distance between coordinates', () => {
    // Boston Common (42.3550, -71.0656) to MIT (42.3601, -71.0942) is approx 2.4 km
    const bostonCommon = { lat: 42.355, lng: -71.0656 }
    const mit = { lat: 42.3601, lng: -71.0942 }
    const distance = calculateDistanceKm(bostonCommon, mit)

    expect(distance).toBeGreaterThan(2.0)
    expect(distance).toBeLessThan(3.0)
  })

  it('formats distance correctly for sub-kilometer and multi-kilometer distances', () => {
    expect(formatDistance(0.4)).toBe('400 m away')
    expect(formatDistance(2.34)).toBe('2.3 km away')
    expect(formatDistance(undefined)).toBe('Distance unavailable')
  })

  it('ranks verified neurology specialists first, then by closest distance', () => {
    const providers: NeurologistProvider[] = [
      {
        id: '1',
        name: 'General Community Hospital',
        category: 'hospital',
        categoryLabel: 'Hospital',
        isSpecialtyVerified: false,
        distanceKm: 0.8,
        address: '123 Main St',
        coordinates: { lat: 42.36, lng: -71.06 },
        source: 'openstreetmap',
      },
      {
        id: '2',
        name: 'Boston Neurology Center',
        category: 'neurologist',
        categoryLabel: 'Neurologist',
        isSpecialtyVerified: true,
        distanceKm: 2.5,
        address: '456 Elm St',
        coordinates: { lat: 42.37, lng: -71.07 },
        source: 'openstreetmap',
      },
      {
        id: '3',
        name: 'Neurology Associates Clinic',
        category: 'neurology_clinic',
        categoryLabel: 'Neurology Clinic',
        isSpecialtyVerified: true,
        distanceKm: 1.2,
        address: '789 Oak St',
        coordinates: { lat: 42.35, lng: -71.05 },
        source: 'openstreetmap',
      },
    ]

    const sorted = sortNeurologists(providers)
    // Provider 2 is individual neurologist (priority 3)
    expect(sorted[0].id).toBe('2')
    // Provider 3 is neurology clinic (priority 2)
    expect(sorted[1].id).toBe('3')
    // Provider 1 is general hospital (priority 1)
    expect(sorted[2].id).toBe('1')
  })

  it('sorts by closest distance when providers share the same priority level', () => {
    const providers: NeurologistProvider[] = [
      {
        id: 'far-doc',
        name: 'Dr. Far, Neurologist',
        category: 'neurologist',
        categoryLabel: 'Neurologist',
        isSpecialtyVerified: true,
        distanceKm: 8.5,
        address: 'Far Away Rd',
        coordinates: { lat: 42.4, lng: -71.1 },
        source: 'openstreetmap',
      },
      {
        id: 'near-doc',
        name: 'Dr. Near, Neurologist',
        category: 'neurologist',
        categoryLabel: 'Neurologist',
        isSpecialtyVerified: true,
        distanceKm: 1.1,
        address: 'Nearby St',
        coordinates: { lat: 42.36, lng: -71.06 },
        source: 'openstreetmap',
      },
    ]

    const sorted = sortNeurologists(providers)
    expect(sorted[0].id).toBe('near-doc')
    expect(sorted[1].id).toBe('far-doc')
  })

  it('constructs correct OpenStreetMap directions URL with OSRM routing', () => {
    const url = buildOsmDirectionsUrl(
      { coordinates: { lat: 42.3601, lng: -71.0589 } },
      { coordinates: { lat: 42.35, lng: -71.06 } }
    )

    expect(url).toContain('https://www.openstreetmap.org/directions?engine=fossgis_osrm_car')
    expect(url).toContain('42.35%2C-71.06%3B42.3601%2C-71.0589')
  })

  it('constructs correct Google Maps Directions fallback URL with destination coordinates', () => {
    const url = buildGoogleMapsDirectionsUrl(
      {
        name: 'Boston Neurology Center',
        coordinates: { lat: 42.3601, lng: -71.0589 },
      },
      {
        coordinates: { lat: 42.35, lng: -71.06 },
      }
    )

    expect(url).toContain('https://www.google.com/maps/dir/?api=1')
    expect(url).toContain('destination=42.3601%2C-71.0589')
    expect(url).toContain('origin=42.35%2C-71.06')
  })
})

