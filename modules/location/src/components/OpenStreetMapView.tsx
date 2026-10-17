import React, { useEffect, useRef } from 'react'
import type { Coordinates, NeurologistProvider } from '../types/neurologist'
import { buildOsmDirectionsUrl, buildGoogleMapsDirectionsUrl } from '../services/distanceService'
import { Navigation, ExternalLink, AlertCircle, Compass, Layers, Plus, Minus } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface OpenStreetMapViewProps {
  provider: NeurologistProvider
  userOrigin?: Coordinates | null
  userAddressLabel?: string
  height?: string
  isExpanded?: boolean
  onToggleExpand?: () => void
  otherProviders?: NeurologistProvider[]
  onSelectProvider?: (provider: NeurologistProvider) => void
}

export const OpenStreetMapView: React.FC<OpenStreetMapViewProps> = ({
  provider,
  userOrigin,
  userAddressLabel,
  height = '500px',
  isExpanded = false,
  onToggleExpand,
  otherProviders,
  onSelectProvider,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  const hasValidProviderCoords =
    provider.coordinates &&
    typeof provider.coordinates.lat === 'number' &&
    typeof provider.coordinates.lng === 'number' &&
    !isNaN(provider.coordinates.lat) &&
    !isNaN(provider.coordinates.lng) &&
    (provider.coordinates.lat !== 0 || provider.coordinates.lng !== 0)

  useEffect(() => {
    if (!mapContainerRef.current || !hasValidProviderCoords) {
      return
    }

    // Clean up existing map instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    try {
      const pLat = provider.coordinates.lat
      const pLng = provider.coordinates.lng

      const map = L.map(mapContainerRef.current, {
        center: [pLat, pLng],
        zoom: 14,
        zoomControl: true,
      })
      mapInstanceRef.current = map

      // Official OpenStreetMap tile layer complying with OSM Tile Usage Policy
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map)

      // Other nearby facility markers if provided
      if (otherProviders && otherProviders.length > 0) {
        otherProviders.forEach((other) => {
          if (
            other.id !== provider.id &&
            other.coordinates &&
            typeof other.coordinates.lat === 'number' &&
            typeof other.coordinates.lng === 'number' &&
            !isNaN(other.coordinates.lat) &&
            !isNaN(other.coordinates.lng) &&
            (other.coordinates.lat !== 0 || other.coordinates.lng !== 0)
          ) {
            const otherIcon = L.divIcon({
              className: 'custom-osm-secondary-marker',
              html: `
                <div style="
                  background: #713842;
                  color: #FFF3E7;
                  width: 26px;
                  height: 26px;
                  border-radius: 8px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  box-shadow: 0 2px 5px rgba(53, 23, 29, 0.25);
                  border: 2px solid #FFF3E7;
                  cursor: pointer;
                  transition: transform 0.15s;
                ">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF3E7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3" fill="#FFF3E7"/>
                  </svg>
                </div>
              `,
              iconSize: [26, 26],
              iconAnchor: [13, 26],
              popupAnchor: [0, -26],
            })

            const marker = L.marker([other.coordinates.lat, other.coordinates.lng], {
              icon: otherIcon,
            }).addTo(map)

            marker.bindPopup(`
              <div style="font-family: inherit; font-size: 12px; line-height: 1.4; padding: 2px;">
                <strong style="color: #35171D; font-size: 13px;">${other.name}</strong><br/>
                <span style="color: #713842; font-weight: 600;">${other.categoryLabel}</span><br/>
                <span style="color: #76575A; font-size: 11px;">${other.address}</span>
              </div>
            `)

            if (onSelectProvider) {
              marker.on('click', () => {
                onSelectProvider(other)
              })
            }
          }
        })
      }

      // Custom SVG Marker Icon for Selected Provider in Cherry Cola palette
      const providerIcon = L.divIcon({
        className: 'custom-osm-marker',
        html: `
          <div style="
            background: #54252D;
            color: #FFF3E7;
            width: 36px;
            height: 36px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(53, 23, 29, 0.4);
            border: 3px solid #FFF3E7;
            transform: scale(1.1);
          ">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFF3E7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3" fill="#FFF3E7"/>
            </svg>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36],
      })

      const providerMarker = L.marker([pLat, pLng], { icon: providerIcon }).addTo(map)
      providerMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4; padding: 2px;">
          <strong style="color: #35171D; font-size: 13px;">${provider.name}</strong><br/>
          <span style="color: #713842; font-weight: 600;">${provider.categoryLabel}</span><br/>
          <span style="color: #76575A; font-size: 11px;">${provider.address}</span>
        </div>
      `)

      // Open selected provider popup by default
      providerMarker.openPopup()

      // User Origin Marker if available
      if (userOrigin && userOrigin.lat !== 0 && userOrigin.lng !== 0) {
        const userIcon = L.divIcon({
          className: 'custom-user-marker',
          html: `
            <div style="
              background: #35171D;
              color: white;
              width: 26px;
              height: 26px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              border: 2px solid #FFF3E7;
              box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            ">
              <div style="width: 8px; height: 8px; background: #DCA9A4; border-radius: 50%;"></div>
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        })

        const userMarker = L.marker([userOrigin.lat, userOrigin.lng], { icon: userIcon }).addTo(map)
        userMarker.bindPopup(`<strong>${userAddressLabel || 'Your Search Origin'}</strong>`)

        // Fit map bounds to view both user and provider
        const bounds = L.latLngBounds([
          [pLat, pLng],
          [userOrigin.lat, userOrigin.lng],
        ])
        map.fitBounds(bounds, { padding: [50, 50] })
      }
    } catch (err) {
      console.warn('[Leaflet Map Init Error]:', err)
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [hasValidProviderCoords, provider, userOrigin, userAddressLabel, otherProviders, onSelectProvider])

  // Invalidate map size on expand/collapse transition so tiles render without glitching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize()
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [isExpanded])

  const osmDirectionsUrl = buildOsmDirectionsUrl(
    { coordinates: hasValidProviderCoords ? provider.coordinates : undefined },
    userOrigin ? { coordinates: userOrigin } : null
  )

  const directMapsUrl =
    provider.osmUrl ||
    (hasValidProviderCoords
      ? `https://www.openstreetmap.org/?mlat=${provider.coordinates.lat}&mlon=${provider.coordinates.lng}#map=16/${provider.coordinates.lat}/${provider.coordinates.lng}`
      : 'https://www.openstreetmap.org/')

  const googleMapsDirectionsUrl = buildGoogleMapsDirectionsUrl(
    {
      name: provider.name,
      address: provider.address,
      coordinates: hasValidProviderCoords ? provider.coordinates : undefined,
    },
    userOrigin ? { coordinates: userOrigin } : null
  )

  return (
    <div className="flex flex-col rounded-3xl overflow-hidden border border-[#F7E4D9] bg-white shadow-sm transition-all">
      {/* Map Header Toolbar with Expand/Collapse Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[#FFF9F3] border-b border-[#F7E4D9]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#F7E4D9] text-[#54252D]">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#76575A]">
              Interactive Map View
            </span>
            <div className="text-sm font-bold text-[#35171D] truncate max-w-[260px] sm:max-w-[340px]">
              {provider.name}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-[#F7E4D9] text-[#54252D] border border-[#DCA9A4]">
            <Layers className="w-3.5 h-3.5 text-[#713842]" />
            Live Map View
          </span>

          {/* Expand/Collapse Toggle Button (Requirement 9) */}
          {onToggleExpand && (
            <button
              type="button"
              id="map-expand-collapse-toggle"
              onClick={onToggleExpand}
              aria-label={isExpanded ? 'Restore directory view' : 'Expand map'}
              title={isExpanded ? 'Restore directory view' : 'Expand map'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#54252D] bg-[#FFF3E7] border border-[#DCA9A4] rounded-xl hover:bg-[#F7E4D9] transition-all cursor-pointer shadow-xs active:scale-95"
            >
              {isExpanded ? (
                <>
                  <Minus className="w-3.5 h-3.5 text-[#54252D] stroke-[2.5]" />
                  <span className="hidden sm:inline">Restore directory view</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 text-[#54252D] stroke-[2.5]" />
                  <span className="hidden sm:inline">Expand map</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main Map Canvas */}
      <div className="relative w-full bg-[#FFF3E7]" style={{ height: isExpanded ? '650px' : height }}>
        {hasValidProviderCoords ? (
          <div ref={mapContainerRef} className="w-full h-full z-0" />
        ) : (
          /* Address has no coordinates */
          <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#FFF9F3]">
            <div className="w-12 h-12 rounded-2xl bg-[#F7E4D9] text-[#54252D] flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6 text-[#713842]" />
            </div>
            <h4 className="text-sm font-bold text-[#35171D] mb-1">Coordinates Not Provided in OSM</h4>
            <p className="text-xs text-[#76575A] max-w-sm mb-4 leading-relaxed">
              Precise GPS coordinates were not mapped for this listing. You can still navigate using the verified street address.
            </p>
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(provider.name + ' ' + provider.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#54252D] text-[#FFF3E7] rounded-xl text-xs font-bold hover:bg-[#35171D] transition-colors"
            >
              Search on OpenStreetMap <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Directions & Navigation Footer */}
      <div className="p-4 bg-[#FFF9F3] border-t border-[#F7E4D9] flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          {userOrigin ? (
            <div className="text-xs text-[#76575A]">
              {provider.distanceKm !== undefined ? (
                <span>
                  Approx. <strong className="text-[#35171D] font-bold">{provider.distanceKm.toFixed(1)} km</strong> from your origin
                </span>
              ) : (
                <span>Route calculation ready</span>
              )}
            </div>
          ) : (
            <div className="text-xs text-[#76575A]">
              Origin not set. Turn-by-turn navigation will use device GPS.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Styled View on OSM button */}
          <a
            href={directMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-[#54252D] bg-[#FFF3E7] border border-[#DCA9A4] rounded-xl hover:bg-[#F7E4D9] transition-colors shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#713842]" />
            View on OSM
          </a>

          {/* Styled Get Directions button */}
          <a
            id="get-directions-btn"
            href={userOrigin ? osmDirectionsUrl : googleMapsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-[#FFF3E7] bg-[#54252D] hover:bg-[#35171D] rounded-xl shadow-xs transition-colors"
          >
            <Navigation className="w-3.5 h-3.5 text-[#FFF3E7]" />
            Get Directions
          </a>
        </div>
      </div>
    </div>
  )
}

// Backward-compatible alias export
export const GoogleMapView = OpenStreetMapView
