import React, { useState, useEffect, useCallback } from 'react'
import type {
  NeurologistProvider,
  SearchRadiusOption,
  Coordinates,
} from '../types/neurologist'
import {
  searchNearbyNeurologists,
  geocodeLocation,
} from '../services/placesService'
import { SearchHeader } from './SearchHeader'
import { NeurologistCard } from './NeurologistCard'
import { NeurologistDetails } from './NeurologistDetails'
import { DisclaimerBanner } from './DisclaimerBanner'
import {
  Building2,
  RefreshCw,
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown,
  Clock,
  Compass,
} from 'lucide-react'

export interface NearbyNeurologistsModuleProps {
  initialRadius?: SearchRadiusOption
  onProviderSelected?: (provider: NeurologistProvider) => void
  selectedProviderId?: string | null
  onClearSelectedProvider?: () => void
}

export const NearbyNeurologistsModule: React.FC<NearbyNeurologistsModuleProps> = ({
  initialRadius = 10,
  onProviderSelected,
  selectedProviderId,
  onClearSelectedProvider,
}) => {
  const [selectedRadius, setSelectedRadius] = useState<SearchRadiusOption>(initialRadius)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<NeurologistProvider[]>([])
  const [hasSearched, setHasSearched] = useState<boolean>(false)
  const [selectedProvider, setSelectedProvider] = useState<NeurologistProvider | null>(null)

  const [userOriginCoords, setUserOriginCoords] = useState<Coordinates | null>(null)
  const [searchLocationLabel, setSearchLocationLabel] = useState<string>('Boston, MA')
  const [lastSearchParams, setLastSearchParams] = useState<{
    locationName: string
    coordinates?: Coordinates
    radiusKm: SearchRadiusOption
    isUsingCurrentLocation: boolean
  } | null>(null)

  // Category filter state
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all')

  // Execute genuine live OpenStreetMap Overpass search
  const performSearch = useCallback(
    async (params: {
      locationName: string
      coordinates?: Coordinates
      radiusKm: SearchRadiusOption
      isUsingCurrentLocation: boolean
    }) => {
      setLoading(true)
      setError(null)
      setHasSearched(true)
      setLastSearchParams(params)

      try {
        let coords = params.coordinates

        // If coordinates weren't passed (manual text search), geocode with Nominatim
        if (!coords) {
          const geocodeRes = await geocodeLocation(params.locationName)
          coords = geocodeRes.coordinates
        }

        setUserOriginCoords(coords)
        setSearchLocationLabel(params.locationName)

        // Perform live OpenStreetMap Overpass query (strictly no demo fallback)
        const searchRes = await searchNearbyNeurologists({
          locationName: params.locationName,
          coordinates: coords,
          radiusKm: params.radiusKm,
          isUsingCurrentLocation: params.isUsingCurrentLocation,
        })

        setResults(searchRes.providers)
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('An unexpected error occurred while querying OpenStreetMap healthcare data.')
        }
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Run initial live search on mount
  useEffect(() => {
    performSearch({
      locationName: 'Boston, MA (Medical District)',
      coordinates: { lat: 42.3601, lng: -71.0589 },
      radiusKm: initialRadius,
      isUsingCurrentLocation: false,
    })
  }, [performSearch, initialRadius])

  // Sync external selectedProviderId if controlled by parent route
  useEffect(() => {
    if (selectedProviderId && results.length > 0) {
      const match = results.find((p) => p.id === selectedProviderId || p.placeId === selectedProviderId)
      if (match) {
        setSelectedProvider(match)
      }
    } else if (!selectedProviderId && selectedProvider) {
      setSelectedProvider(null)
    }
  }, [selectedProviderId, results])

  // Filtered results based on category filter
  const filteredResults = results.filter((p) => {
    if (activeCategoryFilter === 'all') return true
    if (activeCategoryFilter === 'neurologist') return p.category === 'neurologist'
    if (activeCategoryFilter === 'clinic') return p.category === 'neurology_clinic'
    if (activeCategoryFilter === 'hospital') return p.category === 'hospital'
    if (activeCategoryFilter === 'neurosurgeon') return p.category === 'neurosurgeon'
    return true
  })

  const handleSelectProvider = (provider: NeurologistProvider) => {
    setSelectedProvider(provider)
    if (onProviderSelected) {
      onProviderSelected(provider)
    }
  }

  const handleBackToSearch = () => {
    setSelectedProvider(null)
    if (onClearSelectedProvider) {
      onClearSelectedProvider()
    }
  }

  const isRateLimitOrTimeout =
    error?.toLowerCase().includes('rate limit') ||
    error?.toLowerCase().includes('timeout') ||
    error?.toLowerCase().includes('busy') ||
    error?.toLowerCase().includes('504') ||
    error?.toLowerCase().includes('502')

  // If a provider detail is opened, render dedicated split directory + map view (Requirement 9)
  if (selectedProvider) {
    return (
      <div className="w-full py-4 animate-in fade-in duration-200">
        <NeurologistDetails
          provider={selectedProvider}
          userOrigin={userOriginCoords}
          userAddressLabel={searchLocationLabel}
          onBack={handleBackToSearch}
          allProviders={filteredResults}
          onSelectProvider={handleSelectProvider}
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 py-2">
      {/* 1. Search Header with live search controls */}
      <SearchHeader
        onSearch={performSearch}
        loading={loading}
        selectedRadius={selectedRadius}
        onRadiusChange={(radius) => setSelectedRadius(radius)}
      />

      {/* 2. Results Header & Summary Stats */}
      {hasSearched && !error && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 pt-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#35171D] tracking-tight">
              Neurology & Healthcare Facilities
            </h2>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#FFF3E7] text-[#54252D] border border-[#DCA9A4] shadow-xs">
              {results.length} {results.length === 1 ? 'facility' : 'facilities'}
            </span>
          </div>

          {/* Category Filter Pills styled in Cherry Cola + Vanilla Cream */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[#76575A] text-[11px] font-bold mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3 text-[#713842]" /> Filter:
            </span>
            {[
              { id: 'all', label: 'All' },
              { id: 'neurologist', label: 'Neurologists' },
              { id: 'clinic', label: 'Clinics' },
              { id: 'hospital', label: 'Hospitals' },
              { id: 'neurosurgeon', label: 'Neurosurgeons' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategoryFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  activeCategoryFilter === tab.id
                    ? 'bg-[#54252D] text-[#FFF3E7] shadow-xs border border-[#35171D]'
                    : 'bg-[#FFF9F3] text-[#76575A] border border-[#F7E4D9] hover:bg-[#F7E4D9] hover:text-[#35171D]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Loading Skeleton State styled in soft cream */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-[#FFF9F3] border border-[#F7E4D9] space-y-4 animate-pulse shadow-xs"
            >
              <div className="flex justify-between items-center">
                <div className="h-5 w-28 bg-[#F7E4D9] rounded-full" />
                <div className="h-4 w-14 bg-[#F7E4D9] rounded-md" />
              </div>
              <div className="h-6 w-3/4 bg-[#F7E4D9] rounded-md" />
              <div className="h-4 w-1/2 bg-[#F7E4D9] rounded-md" />
              <div className="h-10 w-full bg-[#FFF3E7] rounded-lg" />
              <div className="flex gap-2 pt-2 border-t border-[#F7E4D9]">
                <div className="h-9 flex-1 bg-[#F7E4D9] rounded-xl" />
                <div className="h-9 w-28 bg-[#F7E4D9] rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. Actionable Error State with OpenStreetMap Diagnostics */}
      {error && !loading && (
        <div className="p-8 rounded-3xl bg-[#FFF9F3] border border-[#DCA9A4] shadow-sm max-w-2xl mx-auto space-y-5">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isRateLimitOrTimeout ? 'bg-[#FFF3E7] text-[#54252D] border border-[#DCA9A4]' : 'bg-[#FFF3E7] text-[#713842] border border-[#DCA9A4]'
              }`}
            >
              {isRateLimitOrTimeout ? <Clock className="w-6 h-6 text-[#54252D]" /> : <AlertTriangle className="w-6 h-6 text-[#713842]" />}
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-[#FFF3E7] text-[#54252D] border border-[#DCA9A4]">
                {isRateLimitOrTimeout ? 'OpenStreetMap Rate Limit / Timeout' : 'Live Healthcare Data Service Notice'}
              </div>
              <h3 className="text-lg font-bold text-[#35171D]">
                {isRateLimitOrTimeout
                  ? 'Overpass Query Timed Out or Rate-Limited'
                  : 'Unable to Retrieve Live Healthcare Data'}
              </h3>
              <p className="text-xs text-[#76575A] leading-relaxed">{error}</p>
            </div>
          </div>

          {isRateLimitOrTimeout && (
            <div className="p-4 rounded-2xl bg-[#FFF3E7] border border-[#DCA9A4] text-xs text-[#35171D] space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#54252D]">
                <Compass className="w-4 h-4 text-[#713842]" />
                <span>OpenStreetMap Overpass API Status</span>
              </div>
              <p className="leading-relaxed text-[#76575A]">
                The public Overpass API servers occasionally experience brief queue delays during high community demand.
                A 10-minute server-side cache is active to conserve bandwidth. You can retry in a few seconds or try a slightly smaller radius.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F7E4D9]">
            <span className="text-xs text-[#76575A]">
              Zero synthetic doctors are substituted. Only genuine mapped healthcare locations are queried.
            </span>

            <button
              type="button"
              onClick={() => {
                if (lastSearchParams) {
                  performSearch(lastSearchParams)
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-[#FFF3E7] bg-[#54252D] hover:bg-[#35171D] transition-colors cursor-pointer shadow-xs active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Search</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Empty State */}
      {!loading && !error && hasSearched && filteredResults.length === 0 && (
        <div className="p-10 rounded-3xl bg-[#FFF9F3] border border-[#F7E4D9] text-center max-w-lg mx-auto space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[#FFF3E7] text-[#54252D] border border-[#DCA9A4] flex items-center justify-center mx-auto">
            <Building2 className="w-6 h-6 text-[#713842]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[#35171D]">
              No mapped healthcare facilities found
            </h3>
            <p className="text-xs text-[#76575A] leading-relaxed">
              OpenStreetMap returned zero mapped hospitals, clinics, or doctors within {selectedRadius} km of{' '}
              <strong className="text-[#35171D]">{searchLocationLabel}</strong>.
            </p>
          </div>
          {selectedRadius < 25 && (
            <button
              type="button"
              onClick={() => {
                setSelectedRadius(25)
                if (lastSearchParams) {
                  performSearch({ ...lastSearchParams, radiusKm: 25 })
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-[#FFF3E7] bg-[#54252D] hover:bg-[#35171D] transition-colors cursor-pointer shadow-xs active:scale-95"
            >
              <span>Expand Radius to 25 km</span>
              <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
            </button>
          )}
        </div>
      )}

      {/* 6. Results Grid */}
      {!loading && !error && filteredResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredResults.map((provider) => (
            <NeurologistCard
              key={provider.id}
              provider={provider}
              userOrigin={userOriginCoords}
              onSelect={handleSelectProvider}
            />
          ))}
        </div>
      )}

      {/* 7. Bottom Medical Disclaimer */}
      <DisclaimerBanner />
    </div>
  )
}
