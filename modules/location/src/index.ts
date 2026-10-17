// Reusable component exports for Claude Code integration into NeuroScope 3D
export { FindNearbyNeurologistsButton } from './components/FindNearbyNeurologistsButton'
export type { FindNearbyNeurologistsButtonProps } from './components/FindNearbyNeurologistsButton'

export { NearbyNeurologistsModule } from './components/NearbyNeurologistsModule'
export type { NearbyNeurologistsModuleProps } from './components/NearbyNeurologistsModule'

export { NeurologistCard } from './components/NeurologistCard'
export { NeurologistDetails } from './components/NeurologistDetails'
export { GoogleMapView } from './components/GoogleMapView'
export { SearchHeader } from './components/SearchHeader'
export { RadiusSelector } from './components/RadiusSelector'
export { DisclaimerBanner } from './components/DisclaimerBanner'

// Types
export * from './types/neurologist'

// Services & Utilities
export {
  calculateDistanceKm,
  formatDistance,
  sortNeurologists,
  buildGoogleMapsDirectionsUrl,
} from './services/distanceService'

export {
  searchNearbyNeurologists,
  getProviderDetails,
  geocodeLocation,
  determineProviderCategory,
} from './services/placesService'

export {
  getCurrentUserLocation,
  isGeolocationSupported,
} from './services/geolocationService'

