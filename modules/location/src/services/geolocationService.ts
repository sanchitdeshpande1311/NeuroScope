import type { Coordinates } from '../types/neurologist'

export interface GeolocationResult {
  coordinates: Coordinates
  accuracyMeters: number
}

/**
 * Requests the user's current GPS/browser position with appropriate timeout and options.
 * Only called on explicit user action (e.g. clicking "Use My Current Location").
 */
export function getCurrentUserLocation(): Promise<GeolocationResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser. Please enter your location manually.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          coordinates: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          accuracyMeters: position.coords.accuracy,
        })
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(
              new Error(
                'Location access was denied. You can still search for neurologists by entering a city, state, or postal code.'
              )
            )
            break
          case error.POSITION_UNAVAILABLE:
            reject(
              new Error(
                'Location information is currently unavailable. Please enter your location manually.'
              )
            )
            break
          case error.TIMEOUT:
            reject(
              new Error(
                'The request to get your location timed out. Please try again or search manually.'
              )
            )
            break
          default:
            reject(new Error('An unexpected error occurred while retrieving your location.'))
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000, // Cache for 1 min
      }
    )
  })
}

/**
 * Check if Geolocation API is available in the current browser environment.
 */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}
