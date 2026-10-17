import React from 'react'
import type { NeurologistProvider, Coordinates } from '../types/neurologist'
import { formatDistance, buildGoogleMapsDirectionsUrl, buildOsmDirectionsUrl } from '../services/distanceService'
import {
  Star,
  MapPin,
  Phone,
  Globe,
  Navigation,
  ArrowRight,
  Clock,
  Building2,
  Stethoscope,
  Scissors,
  Activity,
  Layers,
  CheckCircle2,
} from 'lucide-react'

interface NeurologistCardProps {
  provider: NeurologistProvider
  userOrigin?: Coordinates | null
  onSelect: (provider: NeurologistProvider) => void
}

export const NeurologistCard: React.FC<NeurologistCardProps> = ({
  provider,
  userOrigin,
  onSelect,
}) => {
  const hasRating = typeof provider.rating === 'number' && !isNaN(provider.rating)

  const directionsUrl = userOrigin
    ? buildOsmDirectionsUrl(
        { coordinates: provider.coordinates },
        userOrigin ? { coordinates: userOrigin } : null
      )
    : buildGoogleMapsDirectionsUrl(
        {
          name: provider.name,
          address: provider.address,
          coordinates: provider.coordinates,
        },
        null
      )

  // Category Badge Icon & Styling with Cherry Cola + Vanilla Cream theme
  const getCategoryTheme = (category: string) => {
    switch (category) {
      case 'neurologist':
        return {
          bg: 'bg-[#F7E4D9] text-[#54252D] border-[#DCA9A4]',
          icon: <Stethoscope className="w-3.5 h-3.5 text-[#54252D]" />,
        }
      case 'neurology_clinic':
        return {
          bg: 'bg-[#FFF3E7] text-[#713842] border-[#DCA9A4]',
          icon: <Building2 className="w-3.5 h-3.5 text-[#713842]" />,
        }
      case 'neurosurgeon':
        return {
          bg: 'bg-[#54252D] text-[#FFF3E7] border-[#35171D]',
          icon: <Scissors className="w-3.5 h-3.5 text-[#FFF3E7]" />,
        }
      case 'hospital':
        return {
          bg: 'bg-[#F7E4D9]/80 text-[#54252D] border-[#DCA9A4]',
          icon: <Activity className="w-3.5 h-3.5 text-[#713842]" />,
        }
      case 'diagnostic_center':
        return {
          bg: 'bg-[#FFF3E7] text-[#713842] border-[#DCA9A4]',
          icon: <Layers className="w-3.5 h-3.5 text-[#713842]" />,
        }
      default:
        return {
          bg: 'bg-[#FFF3E7] text-[#76575A] border-[#F7E4D9]',
          icon: <Building2 className="w-3.5 h-3.5 text-[#76575A]" />,
        }
    }
  }

  const categoryTheme = getCategoryTheme(provider.category)

  return (
    <article
      aria-label={provider.name}
      className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white border border-[#F7E4D9] hover:border-[#DCA9A4] hover:shadow-md transition-all duration-200"
    >
      <div>
        {/* Top Header: Category & Open Status */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${categoryTheme.bg}`}
          >
            {categoryTheme.icon}
            <span>
              {provider.category === 'neurologist'
                ? 'Neurologist'
                : provider.category === 'neurosurgeon'
                ? 'Neurosurgeon'
                : provider.category === 'neurology_clinic'
                ? 'Neurology Clinic'
                : provider.category === 'hospital'
                ? 'Hospital'
                : provider.category === 'diagnostic_center'
                ? 'Diagnostic Center'
                : 'Healthcare Facility'}
            </span>
          </span>

          <div className="flex items-center gap-2">
            {provider.isOpenNow !== undefined && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md ${
                  provider.isOpenNow
                    ? 'bg-[#F7E4D9] text-[#54252D] border border-[#DCA9A4]'
                    : 'bg-[#FFF3E7] text-[#76575A] border border-[#F7E4D9]'
                }`}
              >
                <Clock className="w-3 h-3" />
                {provider.isOpenNow ? 'Open Now' : 'Closed'}
              </span>
            )}

            {provider.distanceKm !== undefined && (
              <span className="text-xs font-bold text-[#54252D] bg-[#F7E4D9] px-2.5 py-0.5 rounded-md border border-[#DCA9A4]/60">
                {formatDistance(provider.distanceKm)}
              </span>
            )}
          </div>
        </div>

        {/* Provider Title */}
        <h3 className="text-lg font-bold text-[#35171D] group-hover:text-[#54252D] transition-colors line-clamp-1 mb-1">
          {provider.name}
        </h3>

        {/* Clean Specialty or Rating Badge */}
        {(hasRating || provider.isSpecialtyVerified) && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {hasRating && (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center text-[#54252D] bg-[#F7E4D9] px-2 py-0.5 rounded-md border border-[#DCA9A4] text-xs font-bold">
                  <Star className="w-3.5 h-3.5 fill-[#713842] text-[#713842] mr-1" />
                  <span>{provider.rating?.toFixed(1)}</span>
                </div>
                {provider.reviewCount !== undefined && (
                  <span className="text-xs text-[#76575A]">
                    ({provider.reviewCount.toLocaleString()} reviews)
                  </span>
                )}
              </div>
            )}

            {provider.isSpecialtyVerified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#F7E4D9] text-[#54252D] border border-[#DCA9A4]">
                <CheckCircle2 className="w-3 h-3 text-[#713842]" />
                <span>{provider.category === 'neurosurgeon' ? 'Neurosurgery' : 'Neurology'}</span>
              </span>
            )}
          </div>
        )}

        {/* Address */}
        <div className="flex items-start gap-2 text-xs text-[#76575A] mb-3 leading-relaxed">
          <MapPin className="w-4 h-4 text-[#713842] shrink-0 mt-0.5" />
          <span className="line-clamp-2">{provider.address}</span>
        </div>

        {/* Contact Links & Opening Hours */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-[#76575A] mb-4 pt-2 border-t border-[#F7E4D9]">
          {provider.phoneNumber ? (
            <a
              href={`tel:${provider.phoneNumber}`}
              className="inline-flex items-center gap-1.5 text-[#713842] hover:text-[#35171D] hover:underline font-medium"
            >
              <Phone className="w-3.5 h-3.5 text-[#713842]" />
              <span>{provider.phoneNumber}</span>
            </a>
          ) : (
            <span className="text-[#76575A]/70 italic text-[11px]">Phone not mapped</span>
          )}

          {provider.website ? (
            <a
              href={provider.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[#713842] hover:text-[#35171D] hover:underline font-medium"
            >
              <Globe className="w-3.5 h-3.5 text-[#713842]" />
              <span>Official Website</span>
            </a>
          ) : (
            <span className="text-[#76575A]/70 italic text-[11px]">Website not mapped</span>
          )}

          {provider.openingHoursRaw && (
            <div className="text-[11px] text-[#76575A] truncate w-full flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#713842] shrink-0" />
              <span>Hours: {provider.openingHoursRaw}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="flex items-center gap-2 pt-3 border-t border-[#F7E4D9]">
        <button
          type="button"
          onClick={() => onSelect(provider)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-[#FFF3E7] bg-[#54252D] hover:bg-[#35171D] transition-colors cursor-pointer shadow-xs"
        >
          <span>View Details</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#DCA9A4]" />
        </button>

        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-[#54252D] bg-[#FFF3E7] border border-[#DCA9A4] hover:bg-[#F7E4D9] transition-colors"
          title="Open routing directions"
        >
          <Navigation className="w-3.5 h-3.5 text-[#713842]" />
          <span>Get Directions</span>
        </a>
      </div>
    </article>
  )
}
