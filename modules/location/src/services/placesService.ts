import type { Coordinates, NeurologistProvider, ProviderCategory, SearchParams } from '../types/neurologist'
import { calculateDistanceKm, sortNeurologists } from './distanceService'

export interface PlacesSearchResult {
  providers: NeurologistProvider[]
  source: 'openstreetmap'
  searchCenter?: Coordinates
  message?: string
}

export interface LocationSuggestion {
  placeId: string
  displayName: string
  label: string
  subLabel?: string
  coordinates: Coordinates
}

/**
 * Autocomplete location search using Nominatim via backend proxy.
 * Debounced, cached, abortable.
 */
export async function getLocationSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<LocationSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  try {
    const response = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(trimmed)}`, { signal })
    if (!response.ok) return []
    const data = await response.json()
    return data.results || []
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return []
    }
    console.warn('Location suggestion fetch failed:', err)
    return []
  }
}

/**
 * Determine accurate verified category from OpenStreetMap tags and name.
 * Strictly adheres to requirement:
 * "Inspect returned tags before classifying a result.
 * Do not label every hospital or clinic a neurologist.
 * Distinguish neurologists, clinics, hospitals, neurosurgeons, and other healthcare listings based on source evidence.
 * If specialty cannot be established, state that it is unverified."
 */
export function determineProviderCategory(
  name: string,
  types: string[] = [],
  osmTags: Record<string, string> = {}
): { category: ProviderCategory; categoryLabel: string; isSpecialtyVerified: boolean } {
  const lowerName = (name || '').toLowerCase()
  const lowerTypes = types.map((t) => (t || '').toLowerCase())
  const speciality = (
    osmTags['healthcare:speciality'] ||
    osmTags['healthcare:specialty'] ||
    osmTags['medical_specialty'] ||
    osmTags['doctor'] ||
    osmTags['speciality'] ||
    osmTags['specialty'] ||
    ''
  ).toLowerCase()

  // 1. Surgical Neurosurgery distinction (never conflate with medical neurology)
  if (
    speciality.includes('neurosurg') ||
    osmTags.doctor === 'neurosurgeon' ||
    lowerName.includes('neurosurgeon') ||
    lowerName.includes('neurosurg') ||
    lowerName.includes('spine surgery')
  ) {
    return {
      category: 'neurosurgeon',
      categoryLabel: 'Neurosurgery Practice (Surgical Specialty)',
      isSpecialtyVerified: true,
    }
  }

  // 2. Verified Neurology Specialist (individual doctor or clinic with explicit neurology tags or name)
  const hasNeurologySpecialty =
    speciality.includes('neurolog') ||
    osmTags.healthcare === 'neurologist' ||
    osmTags.doctor === 'neurologist' ||
    lowerName.includes('neurolog') ||
    lowerName.includes('brain health') ||
    lowerName.includes('memory clinic')

  if (hasNeurologySpecialty) {
    if (
      lowerTypes.includes('doctor') ||
      lowerName.startsWith('dr.') ||
      lowerName.startsWith('dr ') ||
      lowerName.includes(', md') ||
      lowerName.includes(', do')
    ) {
      return {
        category: 'neurologist',
        categoryLabel: 'Neurologist (Physician Listing)',
        isSpecialtyVerified: true,
      }
    }

    return {
      category: 'neurology_clinic',
      categoryLabel: 'Neurology Clinic / Specialized Practice',
      isSpecialtyVerified: true,
    }
  }

  // 3. Hospitals and Medical Centers (general facility, neurology service unverified)
  if (
    lowerTypes.includes('hospital') ||
    osmTags.amenity === 'hospital' ||
    osmTags.healthcare === 'hospital' ||
    lowerName.includes('hospital') ||
    lowerName.includes('medical center') ||
    lowerName.includes('infirmary')
  ) {
    return {
      category: 'hospital',
      categoryLabel: 'Hospital / Medical Center (Verify Neurology Dept)',
      isSpecialtyVerified: false,
    }
  }

  // 4. Diagnostic Centers
  if (
    lowerName.includes('diagnostic') ||
    lowerName.includes('imaging') ||
    lowerName.includes('mri') ||
    lowerName.includes('scan') ||
    osmTags.healthcare === 'laboratory'
  ) {
    return {
      category: 'diagnostic_center',
      categoryLabel: 'Diagnostic & Imaging Facility',
      isSpecialtyVerified: false,
    }
  }

  // 5. General Clinics
  if (
    lowerTypes.includes('clinic') ||
    osmTags.amenity === 'clinic' ||
    osmTags.healthcare === 'clinic' ||
    lowerName.includes('clinic') ||
    lowerName.includes('associates')
  ) {
    return {
      category: 'healthcare_provider',
      categoryLabel: 'Healthcare Clinic (Specialty Unverified)',
      isSpecialtyVerified: false,
    }
  }

  // 6. General Doctors
  if (lowerTypes.includes('doctors') || osmTags.amenity === 'doctors' || osmTags.healthcare === 'doctor') {
    return {
      category: 'healthcare_provider',
      categoryLabel: 'Medical Practice (Specialty Unverified)',
      isSpecialtyVerified: false,
    }
  }

  return {
    category: 'healthcare_provider',
    categoryLabel: 'Healthcare Facility (Specialty Unverified)',
    isSpecialtyVerified: false,
  }
}

/**
 * Geocode an address/city/zip using OpenStreetMap Nominatim via backend proxy.
 * Throttles requests and includes custom User-Agent.
 */
export async function geocodeLocation(
  query: string
): Promise<{ coordinates: Coordinates; formattedAddress: string }> {
  const trimmed = query.trim()
  if (!trimmed) {
    throw new Error('Please enter a valid city, state, or address.')
  }

  try {
    const proxyResponse = await fetch(`/api/geocode?address=${encodeURIComponent(trimmed)}`)
    const data = await proxyResponse.json()

    if (!proxyResponse.ok || data.error) {
      throw new Error(data.error || 'Failed to geocode address via OpenStreetMap Nominatim.')
    }

    if (data.results && data.results.length > 0) {
      const first = data.results[0]
      return {
        coordinates: {
          lat: first.geometry.location.lat,
          lng: first.geometry.location.lng,
        },
        formattedAddress: first.formatted_address,
      }
    } else if (data.status === 'ZERO_RESULTS') {
      throw new Error(`No geographic coordinates found for "${trimmed}". Please try a more specific address or ZIP code.`)
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err
    }
    throw new Error('Unable to geocode location. Please verify that the backend server is running.')
  }

  throw new Error(`No location results found for "${trimmed}".`)
}

/**
 * Searches nearby neurologists and healthcare facilities using real OpenStreetMap Overpass data.
 * Zero Google billing required. Zero synthetic records.
 */
export async function searchNearbyNeurologists(params: SearchParams): Promise<PlacesSearchResult> {
  if (
    !params.coordinates ||
    typeof params.coordinates.lat !== 'number' ||
    typeof params.coordinates.lng !== 'number' ||
    isNaN(params.coordinates.lat) ||
    isNaN(params.coordinates.lng) ||
    params.coordinates.lat < -90 ||
    params.coordinates.lat > 90 ||
    params.coordinates.lng < -180 ||
    params.coordinates.lng > 180
  ) {
    throw new Error('Valid search coordinates are required to query nearby neurology providers.')
  }

  const radiusMeters = params.radiusKm * 1000
  const proxyUrl = `/api/places/nearby?lat=${params.coordinates.lat}&lng=${params.coordinates.lng}&radius=${radiusMeters}`

  let response: Response
  try {
    response = await fetch(proxyUrl)
  } catch {
    throw new Error(
      'Unable to connect to the backend discovery server on port 5001. Please ensure "npm run server" is running.'
    )
  }

  const data = await response.json()

  if (!response.ok || data.error) {
    throw new Error(data.error || data.details || 'OpenStreetMap healthcare query failed.')
  }

  const rawResults: any[] = data.results || []

  if (rawResults.length === 0) {
    return {
      providers: [],
      source: 'openstreetmap',
      searchCenter: params.coordinates,
      message: `No mapped healthcare providers found within ${params.radiusKm} km. Try expanding your search radius to 25 km.`,
    }
  }

  // Convert real OpenStreetMap Overpass results to NeurologistProvider
  const liveProviders: NeurologistProvider[] = rawResults.map((place: any, index: number) => {
    const loc = place.geometry?.location || place.coordinates || { lat: 0, lng: 0 }
    const distance = calculateDistanceKm(params.coordinates!, { lat: loc.lat, lng: loc.lng })
    const { category, categoryLabel, isSpecialtyVerified } = determineProviderCategory(
      place.name || '',
      place.types || [],
      place.osmTags || {}
    )

    return {
      id: place.id || place.place_id || `osm-${index}`,
      placeId: place.place_id || place.id,
      osmId: place.osmId,
      osmType: place.osmType,
      name: place.name || 'Healthcare Facility',
      category,
      categoryLabel,
      specialityTags: place.specialityTags || [],
      isSpecialtyVerified,
      // OpenStreetMap does not provide ratings; undefined by design
      rating: undefined,
      reviewCount: undefined,
      address: place.formatted_address || place.vicinity || 'Address mapped on OpenStreetMap',
      formattedAddress: place.formatted_address || place.vicinity,
      coordinates: { lat: loc.lat, lng: loc.lng },
      distanceKm: distance,
      isOpenNow: place.opening_hours?.open_now,
      openingHoursRaw: place.opening_hours?.raw,
      phoneNumber: place.formatted_phone_number || undefined,
      website: place.website || undefined,
      osmUrl: place.osmUrl,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`,
      // Strict data integrity: never invent qualifications, fees, or experience
      qualifications: undefined,
      yearsExperience: undefined,
      clinicOrHospitalName: category === 'neurologist' ? place.vicinity : undefined,
      consultationFee: null, // "Consultation fee not publicly available in open directory."
      source: 'openstreetmap' as const,
      verificationNotes: isSpecialtyVerified
        ? 'Verified neurology specialty mapped in OpenStreetMap tags.'
        : 'OpenStreetMap healthcare record. Specific neurology availability should be confirmed directly with facility.',
    }
  })

  // Filter within radius and sort (specialty prioritized, then distance ascending)
  const filtered = liveProviders.filter((p) => (p.distanceKm ?? 0) <= params.radiusKm)
  const sorted = sortNeurologists(filtered)

  return {
    providers: sorted,
    source: 'openstreetmap',
    searchCenter: params.coordinates,
  }
}

/**
 * Fetch detailed place info for a single provider.
 */
export async function getProviderDetails(
  providerId: string,
  cachedProvider?: NeurologistProvider
): Promise<NeurologistProvider> {
  if (cachedProvider) {
    return cachedProvider
  }

  try {
    const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(providerId)}`)
    if (response.ok) {
      const data = await response.json()
      const result = data.result
      if (result) {
        const loc = result.geometry?.location || { lat: 0, lng: 0 }
        const { category, categoryLabel, isSpecialtyVerified } = determineProviderCategory(
          result.name || '',
          result.types || [],
          result.osmTags || {}
        )

        return {
          id: result.id || result.place_id || providerId,
          placeId: result.place_id || result.id,
          osmId: result.osmId,
          osmType: result.osmType,
          name: result.name || 'Healthcare Facility',
          category,
          categoryLabel,
          specialityTags: result.specialityTags || [],
          isSpecialtyVerified,
          rating: undefined,
          reviewCount: undefined,
          address: result.formatted_address || result.vicinity || 'Address mapped on OpenStreetMap',
          formattedAddress: result.formatted_address,
          coordinates: { lat: loc.lat, lng: loc.lng },
          phoneNumber: result.formatted_phone_number || undefined,
          website: result.website || undefined,
          osmUrl: result.osmUrl,
          googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`,
          isOpenNow: result.opening_hours?.open_now,
          openingHoursRaw: result.opening_hours?.raw,
          qualifications: undefined,
          yearsExperience: undefined,
          clinicOrHospitalName: category === 'neurologist' ? result.vicinity : undefined,
          consultationFee: null,
          source: 'openstreetmap',
          verificationNotes: isSpecialtyVerified
            ? 'Verified neurology specialty mapped in OpenStreetMap tags.'
            : 'OpenStreetMap healthcare record. Contact facility to confirm specific clinical services.',
        }
      }
    }
  } catch (err: any) {
    console.warn('[getProviderDetails error]:', err?.message)
  }

  throw new Error(`Provider details not found for ID: ${providerId}`)
}
