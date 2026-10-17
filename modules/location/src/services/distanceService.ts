import type { Coordinates, NeurologistProvider } from '../types/neurologist'

/**
 * Calculates great-circle distance between two coordinates in kilometers using the Haversine formula.
 */
export function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  const R = 6371 // Earth's mean radius in km
  const dLat = ((to.lat - from.lat) * Math.PI) / 180
  const dLng = ((to.lng - from.lng) * Math.PI) / 180
  const lat1 = (from.lat * Math.PI) / 180
  const lat2 = (to.lat * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return Math.round(R * c * 10) / 10 // Rounded to 1 decimal place
}

/**
 * Formats distance for display.
 */
export function formatDistance(distanceKm?: number): string {
  if (distanceKm === undefined || distanceKm === null || isNaN(distanceKm)) {
    return 'Distance unavailable'
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`
  }
  return `${distanceKm.toFixed(1)} km away`
}

/**
 * Ranking rules for OpenStreetMap healthcare discovery:
 * 1. Verified neurology specialists and clinics rank first.
 * 2. Ranked by closest distance ascending (proximity).
 * 3. If ratings are supplied by an external source, higher rated items take precedence.
 * 4. Stable secondary tie-breaker: provider name alphabetical.
 */
export function sortNeurologists(providers: NeurologistProvider[]): NeurologistProvider[] {
  return [...providers].sort((a, b) => {
    // 1. Specialty prioritization (Neurologist > Clinic > Neurosurgeon > Hospital)
    const priority = (p: NeurologistProvider) => {
      if (p.category === 'neurologist') return 4
      if (p.category === 'neurology_clinic') return 3
      if (p.category === 'neurosurgeon') return 2
      if (p.isSpecialtyVerified) return 2
      if (p.category === 'hospital' || p.category === 'healthcare_provider' || p.category === 'diagnostic_center') return 1
      return 0
    }

    const priorityA = priority(a)
    const priorityB = priority(b)
    if (priorityA !== priorityB) {
      return priorityB - priorityA // Higher priority first
    }

    // 2. Ratings precedence only if legitimately available from external source
    const hasRatingA = typeof a.rating === 'number' && !isNaN(a.rating)
    const hasRatingB = typeof b.rating === 'number' && !isNaN(b.rating)
    if (hasRatingA && hasRatingB && b.rating !== a.rating) {
      return b.rating! - a.rating!
    }

    // 3. Proximity: closest distance first
    if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
      if (a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm
      }
    }

    // 4. Stable alphabetical tie-breaker
    return a.name.localeCompare(b.name)
  })
}

/**
 * Construct an OpenStreetMap turn-by-turn routing URL.
 */
export function buildOsmDirectionsUrl(
  destination: { coordinates?: Coordinates },
  origin?: { coordinates?: Coordinates } | null
): string {
  if (destination.coordinates && origin?.coordinates) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(
      `${origin.coordinates.lat},${origin.coordinates.lng};${destination.coordinates.lat},${destination.coordinates.lng}`
    )}`
  }

  if (destination.coordinates) {
    return `https://www.openstreetmap.org/?mlat=${destination.coordinates.lat}&mlon=${destination.coordinates.lng}#map=16/${destination.coordinates.lat}/${destination.coordinates.lng}`
  }

  return 'https://www.openstreetmap.org/'
}

/**
 * Construct a general mapping directions URL using real coordinates.
 */
export function buildGoogleMapsDirectionsUrl(
  destination: { address?: string; coordinates?: Coordinates; name?: string },
  origin?: { address?: string; coordinates?: Coordinates } | null
): string {
  const params = new URLSearchParams({
    api: '1',
  })

  if (destination.coordinates) {
    params.set('destination', `${destination.coordinates.lat},${destination.coordinates.lng}`)
  } else if (destination.address) {
    params.set('destination', destination.address)
  } else if (destination.name) {
    params.set('destination', destination.name)
  }

  if (origin?.coordinates) {
    params.set('origin', `${origin.coordinates.lat},${origin.coordinates.lng}`)
  } else if (origin?.address) {
    params.set('origin', origin.address)
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`
}
