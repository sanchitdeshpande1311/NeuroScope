import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { SearchRadiusOption, Coordinates, LocationSuggestion } from '../types/neurologist'
import { RadiusSelector } from './RadiusSelector'
import { getCurrentUserLocation } from '../services/geolocationService'
import { getLocationSuggestions } from '../services/placesService'
import { Search, MapPin, LocateFixed, Loader2, AlertCircle } from 'lucide-react'

interface SearchHeaderProps {
  onSearch: (params: {
    locationName: string
    coordinates?: Coordinates
    radiusKm: SearchRadiusOption
    isUsingCurrentLocation: boolean
  }) => void
  loading: boolean
  selectedRadius: SearchRadiusOption
  onRadiusChange: (radius: SearchRadiusOption) => void
}

export const SearchHeader: React.FC<SearchHeaderProps> = ({
  onSearch,
  loading,
  selectedRadius,
  onRadiusChange,
}) => {
  const [locationInput, setLocationInput] = useState<string>('')
  const [locatingUser, setLocatingUser] = useState<boolean>(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [activeLocationLabel, setActiveLocationLabel] = useState<string | null>(null)
  const [cachedUserCoords, setCachedUserCoords] = useState<Coordinates | null>(null)

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false)
  const [showDropdown, setShowDropdown] = useState<boolean>(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<LocationSuggestion | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch suggestions with debounce and cancellation of outdated requests
  const fetchSuggestions = useCallback((query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setIsSuggesting(false)
      setShowDropdown(false)
      return
    }

    setIsSuggesting(true)
    debounceTimerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const results = await getLocationSuggestions(trimmed, controller.signal)
        setSuggestions(results)
        setShowDropdown(true)
        setHighlightedIndex(-1)
      } catch {
        setSuggestions([])
      } finally {
        setIsSuggesting(false)
      }
    }, 350)
  }, [])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocationInput(val)
    if (locationError) setLocationError(null)

    // User is editing: invalidate previous coordinate selection
    setSelectedSuggestion(null)
    setCachedUserCoords(null)

    fetchSuggestions(val)
  }

  const handleSelectSuggestion = (suggestion: LocationSuggestion) => {
    setLocationInput(suggestion.displayName)
    setSelectedSuggestion(suggestion)
    setCachedUserCoords(suggestion.coordinates)
    setActiveLocationLabel(suggestion.label)
    setSuggestions([])
    setShowDropdown(false)
    setHighlightedIndex(-1)

    // Trigger search immediately with selected coordinates
    onSearch({
      locationName: suggestion.displayName,
      coordinates: suggestion.coordinates,
      radiusKm: selectedRadius,
      isUsingCurrentLocation: false,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === 'Escape') {
        setShowDropdown(false)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
        break
      case 'Enter':
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          e.preventDefault()
          handleSelectSuggestion(suggestions[highlightedIndex])
        }
        break
      case 'Escape':
        setShowDropdown(false)
        setHighlightedIndex(-1)
        break
      default:
        break
    }
  }

  // Current location GPS button
  const handleUseCurrentLocation = async () => {
    setLocationError(null)
    setLocatingUser(true)
    setShowDropdown(false)

    try {
      const result = await getCurrentUserLocation()
      setCachedUserCoords(result.coordinates)
      setSelectedSuggestion(null)
      setActiveLocationLabel('Current Location (GPS)')
      setLocationInput('')

      onSearch({
        locationName: 'Current Location',
        coordinates: result.coordinates,
        radiusKm: selectedRadius,
        isUsingCurrentLocation: true,
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        setLocationError(err.message)
      } else {
        setLocationError('Unable to detect current location. Please type your city or address.')
      }
    } finally {
      setLocatingUser(false)
    }
  }

  // Manual form submission
  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || locatingUser) return

    const trimmed = locationInput.trim()
    if (!trimmed) {
      setLocationError('Please enter a city, ZIP code, or address.')
      return
    }

    setLocationError(null)
    setShowDropdown(false)
    setActiveLocationLabel(trimmed)

    onSearch({
      locationName: trimmed,
      coordinates: selectedSuggestion?.coordinates || cachedUserCoords || undefined,
      radiusKm: selectedRadius,
      isUsingCurrentLocation: false,
    })
  }

  return (
    <div className="bg-[#FFF9F3] rounded-3xl border border-[#F7E4D9] p-6 sm:p-8 shadow-sm space-y-6">
      {/* 1. Simplified Centered Page Heading (Requirement 3) */}
      <div className="text-center py-2">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#35171D] tracking-tight">
          Find Nearby Neurologist
        </h1>
      </div>

      {/* 2. Main Search Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-end">
        {/* Location Text Input with Autocomplete Dropdown */}
        <form onSubmit={handleManualSearch} className="lg:col-span-8 space-y-1.5 relative">
          <label
            htmlFor="location-search-input"
            className="block text-xs font-semibold uppercase tracking-wider text-[#76575A]"
          >
            Search Location (City, Address, or ZIP Code)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <MapPin className="w-4 h-4 text-[#713842] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                id="location-search-input"
                type="text"
                value={locationInput}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0) setShowDropdown(true)
                }}
                placeholder="e.g. Boston, MA or 02115"
                disabled={loading || locatingUser}
                autoComplete="off"
                className="w-full pl-10 pr-10 py-2.5 bg-white border border-[#DCA9A4] rounded-xl text-sm text-[#35171D] placeholder-[#76575A]/60 focus:outline-none focus:ring-2 focus:ring-[#54252D] focus:border-[#54252D] transition-all"
              />
              {isSuggesting && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Loader2 className="w-4 h-4 animate-spin text-[#713842]" />
                </div>
              )}

              {/* Autocomplete Dropdown Menu */}
              {showDropdown && (
                <div
                  ref={dropdownRef}
                  className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#DCA9A4] rounded-2xl shadow-lg z-50 overflow-hidden max-h-72 overflow-y-auto animate-in fade-in-50 duration-150"
                >
                  {suggestions.length > 0 ? (
                    <ul role="listbox" aria-label="Location suggestions" className="py-1 divide-y divide-[#F7E4D9]/60">
                      {suggestions.map((item, idx) => {
                        const isHighlighted = idx === highlightedIndex
                        return (
                          <li
                            key={item.placeId || idx}
                            role="option"
                            aria-selected={isHighlighted}
                            onClick={() => handleSelectSuggestion(item)}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            className={`flex items-start gap-2.5 px-4 py-2.5 cursor-pointer transition-colors ${
                              isHighlighted
                                ? 'bg-[#54252D] text-[#FFF3E7]'
                                : 'hover:bg-[#FFF3E7] text-[#35171D]'
                            }`}
                          >
                            <MapPin
                              className={`w-4 h-4 mt-0.5 shrink-0 ${
                                isHighlighted ? 'text-[#DCA9A4]' : 'text-[#713842]'
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <div
                                className={`text-sm font-semibold truncate ${
                                  isHighlighted ? 'text-[#FFF3E7]' : 'text-[#35171D]'
                                }`}
                              >
                                {item.label}
                              </div>
                              {item.subLabel && (
                                <div
                                  className={`text-xs truncate ${
                                    isHighlighted ? 'text-[#DCA9A4]' : 'text-[#76575A]'
                                  }`}
                                >
                                  {item.subLabel}
                                </div>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    !isSuggesting && (
                      <div className="px-4 py-3 text-xs text-[#76575A] text-center">
                        No matching locations found.
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Search Button */}
            <button
              type="submit"
              disabled={loading || locatingUser}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-[#FFF3E7] bg-[#54252D] hover:bg-[#35171D] disabled:opacity-50 transition-colors shadow-xs cursor-pointer shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#FFF3E7]" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 text-[#FFF3E7]" />
                  <span>Search</span>
                </>
              )}
            </button>

            {/* Use My Location Button */}
            <button
              id="use-my-location-btn"
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={loading || locatingUser}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[#54252D] bg-[#F7E4D9] border border-[#DCA9A4] hover:bg-[#EBD3C5] disabled:opacity-50 transition-colors cursor-pointer shrink-0"
              title="Detect your device GPS coordinates"
            >
              {locatingUser ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#54252D]" />
                  <span>Locating...</span>
                </>
              ) : (
                <>
                  <LocateFixed className="w-4 h-4 text-[#54252D]" />
                  <span>Use My Current Location</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Radius Selector */}
        <div className="lg:col-span-4">
          <RadiusSelector
            selectedRadius={selectedRadius}
            onChange={(radius) => {
              onRadiusChange(radius)
              if (activeLocationLabel || cachedUserCoords || selectedSuggestion) {
                onSearch({
                  locationName: activeLocationLabel || selectedSuggestion?.displayName || 'Current Location',
                  coordinates: selectedSuggestion?.coordinates || cachedUserCoords || undefined,
                  radiusKm: radius,
                  isUsingCurrentLocation: Boolean(cachedUserCoords && !selectedSuggestion),
                })
              }
            }}
            disabled={loading || locatingUser}
          />
        </div>
      </div>

      {/* Error state if location denied or service unavailable */}
      {locationError && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-2xl bg-[#FFF3E7] border border-[#DCA9A4] text-xs text-[#54252D] animate-in fade-in"
        >
          <AlertCircle className="w-4 h-4 text-[#713842] mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-bold text-[#35171D]">Location Notice</p>
            <p className="text-[#76575A] leading-relaxed">{locationError}</p>
          </div>
          <button
            type="button"
            onClick={() => setLocationError(null)}
            className="text-[#713842] hover:text-[#35171D] font-bold px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Search Pill */}
      {activeLocationLabel && !locationError && (
        <div className="flex items-center gap-2 text-xs text-[#76575A]">
          <span className="font-medium">Searching near:</span>
          <span className="font-bold text-[#35171D] bg-[#F7E4D9] px-2.5 py-1 rounded-lg border border-[#DCA9A4]">
            {activeLocationLabel}
          </span>
          <span className="text-[#76575A]/80">within</span>
          <span className="font-bold text-[#54252D] bg-[#F7E4D9] px-2.5 py-1 rounded-lg border border-[#DCA9A4]">
            {selectedRadius} km
          </span>
        </div>
      )}
    </div>
  )
}
