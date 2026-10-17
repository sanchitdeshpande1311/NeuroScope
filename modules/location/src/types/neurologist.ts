export interface Coordinates {
  lat: number
  lng: number
}

export interface LocationSuggestion {
  placeId: string
  displayName: string
  label: string
  subLabel?: string
  coordinates: Coordinates
}

export type ProviderCategory =
  | 'neurologist'
  | 'neurology_clinic'
  | 'neurosurgeon'
  | 'hospital'
  | 'diagnostic_center'
  | 'healthcare_provider'

export interface ConsultationFeeInfo {
  amount: string
  currency: string
  sourceNotice?: string
  dateVerified?: string
}

export interface NeurologistProvider {
  id: string
  placeId?: string
  osmId?: string
  osmType?: 'node' | 'way' | 'relation'
  name: string
  /**
   * Verified category based on OpenStreetMap tags (amenity, healthcare, healthcare:speciality).
   * If an individual neurologist cannot be verified from the listing,
   * category will be neurology_clinic, hospital, neurosurgeon, etc.
   */
  category: ProviderCategory
  categoryLabel: string
  /**
   * Speciality tags mapped in OpenStreetMap (e.g., neurology, neurosurgery).
   */
  specialityTags?: string[]
  isSpecialtyVerified?: boolean
  /**
   * Ratings: OpenStreetMap does not provide Google ratings.
   * Undefined for OSM listings. Never manufactured.
   */
  rating?: number
  reviewCount?: number
  address: string
  formattedAddress?: string
  coordinates: Coordinates
  distanceKm?: number
  isOpenNow?: boolean
  openingHoursRaw?: string
  phoneNumber?: string
  website?: string
  osmUrl?: string
  googleMapsUrl?: string
  /**
   * Strict medical integrity:
   * Only included if published by official source. Otherwise omitted.
   */
  qualifications?: string[]
  yearsExperience?: number
  clinicOrHospitalName?: string
  /**
   * Consultation fee: strictly null or explicit info.
   * Displays "Consultation fee not publicly available in open directory."
   */
  consultationFee?: ConsultationFeeInfo | null
  source: 'openstreetmap' | 'demo_data'
  verificationNotes?: string
  photoUrl?: string
}

export type SearchRadiusOption = 5 | 10 | 25

export interface SearchParams {
  locationName: string
  coordinates?: Coordinates
  radiusKm: SearchRadiusOption
  isUsingCurrentLocation: boolean
  useDemoData?: boolean
}

export type GeolocationPermissionState =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'

export interface UserLocationState {
  coordinates: Coordinates | null
  label: string
  permissionStatus: GeolocationPermissionState
  errorMessage: string | null
}
