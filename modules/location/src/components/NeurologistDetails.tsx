import React, { useState } from 'react'
import type { NeurologistProvider, Coordinates } from '../types/neurologist'
import { OpenStreetMapView } from './OpenStreetMapView'
import { DisclaimerBanner } from './DisclaimerBanner'
import {
  ArrowLeft,
  Star,
  MapPin,
  Phone,
  Globe,
  Building,
  GraduationCap,
  Calendar,
  DollarSign,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Clock,
  CheckCircle2,
  Compass,
  ListFilter,
} from 'lucide-react'

interface NeurologistDetailsProps {
  provider: NeurologistProvider
  userOrigin?: Coordinates | null
  userAddressLabel?: string
  onBack: () => void
  allProviders?: NeurologistProvider[]
  onSelectProvider?: (provider: NeurologistProvider) => void
}

export const NeurologistDetails: React.FC<NeurologistDetailsProps> = ({
  provider,
  userOrigin,
  userAddressLabel,
  onBack,
  allProviders = [],
  onSelectProvider,
}) => {
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [isMapExpanded, setIsMapExpanded] = useState(false)

  const handleCopyAddress = () => {
    if (provider.address) {
      navigator.clipboard.writeText(provider.address)
      setCopiedAddress(true)
      setTimeout(() => setCopiedAddress(false), 2000)
    }
  }

  const hasRating = typeof provider.rating === 'number' && !isNaN(provider.rating)

  const categoryLabel =
    provider.category === 'neurologist'
      ? 'Neurologist'
      : provider.category === 'neurosurgeon'
      ? 'Neurosurgeon'
      : provider.category === 'neurology_clinic'
      ? 'Neurology Clinic'
      : provider.category === 'hospital'
      ? 'Hospital'
      : provider.category === 'diagnostic_center'
      ? 'Diagnostic Center'
      : 'Healthcare Facility'

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 details-panel font-google-sans">
      {/* Navigation & Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E8D4CC]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            id="back-to-results-btn"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm sm:text-[15px] font-semibold text-[#54252D] bg-[#FFF3E7] border border-[#E8D4CC] hover:bg-[#F7E4D9] transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-[#713842]" />
            <span>Back to Search Results</span>
          </button>

          {isMapExpanded && (
            <span className="details-panel__section-label inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-semibold bg-[#54252D] text-[#FFF3E7]">
              Full Screen Map Active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-[#65464A]">
          <span className="details-panel__section-label text-[13px] sm:text-sm font-semibold text-[#54252D]">Reference ID:</span>
          <code className="font-mono text-xs sm:text-[13px] bg-[#FFF3E7] text-[#35171D] px-2.5 py-1 rounded-md border border-[#E8D4CC] font-semibold">
            {provider.osmId || provider.placeId || provider.id}
          </code>
        </div>
      </div>

      {/* Split Directory + Map Layout */}
      <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
        {/* ========================================================= */}
        {/* LEFT PANEL: 38% width on desktop with Google Sans Styling */}
        {/* ========================================================= */}
        {!isMapExpanded && (
          <div className="w-full lg:w-[38%] space-y-6 shrink-0 transition-all">
            <div className="p-6 sm:p-8 bg-[#FFF9F4] rounded-3xl border border-[#E8D4CC] shadow-sm space-y-7">
              {/* Facility Switching Control if multiple results exist */}
              {allProviders.length > 1 && onSelectProvider && (
                <div className="p-4 bg-white rounded-2xl border border-[#E8D4CC] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="details-panel__section-label text-sm font-semibold text-[#54252D] flex items-center gap-2">
                      <ListFilter className="w-4 h-4 text-[#713842]" />
                      Browse Other Facilities ({allProviders.length})
                    </span>
                  </div>
                  <select
                    id="facility-switcher-select"
                    value={provider.id}
                    onChange={(e) => {
                      const found = allProviders.find((p) => p.id === e.target.value)
                      if (found) onSelectProvider(found)
                    }}
                    className="w-full px-3.5 py-2.5 text-sm font-medium text-[#35171D] bg-[#FFF9F4] border border-[#E8D4CC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#713842] cursor-pointer"
                  >
                    {allProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.distanceKm !== undefined ? `(${p.distanceKm.toFixed(1)} km)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Facility Header with Clean Google Sans Typography */}
              <div className="space-y-2.5">
                <span className="inline-block text-xs sm:text-[13px] font-semibold text-[#54252D] py-1 px-3 rounded-full bg-[#F7E4D9] border border-[#E8D4CC]">
                  {categoryLabel}
                </span>

                <h1 className="details-panel__title text-[28px] sm:text-[34px] lg:text-[36px] text-[#35171D] font-bold tracking-tight leading-[1.2]">
                  {provider.name}
                </h1>

                {provider.clinicOrHospitalName && (
                  <div className="details-panel__subtitle text-[16px] sm:text-[17px] text-[#65464A] font-medium flex items-center gap-2 pt-0.5">
                    <Building className="w-4 h-4 text-[#713842] shrink-0" />
                    <span>{provider.clinicOrHospitalName}</span>
                  </div>
                )}
              </div>

              {/* Specialty & Care Information (High-Contrast Clean Panel) */}
              <div className="p-5 sm:p-6 bg-white rounded-2xl border border-[#E8D4CC] space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="details-panel__section-label text-[15px] sm:text-[16px] font-semibold text-[#54252D]">
                    Specialty & Care Information
                  </span>
                  <span className="text-xs sm:text-[13px] font-medium text-[#54252D] bg-[#FFF3E7] px-2.5 py-1 rounded-md border border-[#E8D4CC]">
                    {provider.isSpecialtyVerified ? 'Specialist Listing' : 'Healthcare Facility'}
                  </span>
                </div>

                {hasRating ? (
                  <div className="flex items-baseline gap-2.5 pt-0.5">
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
                      <span className="text-2xl font-bold text-[#35171D]">
                        {provider.rating?.toFixed(1)}
                      </span>
                    </div>
                    <span className="text-sm text-[#65464A]">
                      out of 5.0 ({provider.reviewCount?.toLocaleString() ?? 0} reviews)
                    </span>
                  </div>
                ) : provider.isSpecialtyVerified ? (
                  <div className="text-[16px] sm:text-[17px] text-[#35171D] font-semibold flex items-center gap-2 pt-0.5">
                    <CheckCircle2 className="w-5 h-5 text-[#54252D] shrink-0" />
                    <span>Verified Neurology Specialty</span>
                  </div>
                ) : (
                  <div className="text-[15px] text-[#35171D] font-normal leading-relaxed pt-0.5">
                    General healthcare facility. Contact clinic directly to confirm neurology appointment availability and services.
                  </div>
                )}

                <p className="text-[14px] text-[#65464A] leading-relaxed pt-2 border-t border-[#E8D4CC]">
                  Directory listing for informational guidance. Does not evaluate medical competency or patient outcomes.
                </p>
              </div>

              {/* Information Fields with Consistent Spacing & High-Contrast Typography */}
              <div className="space-y-6 text-[#35171D] pt-1">
                {/* 1. Qualifications & Degrees */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[#54252D]">
                    <GraduationCap className="w-4 h-4 text-[#713842] shrink-0" />
                    <span className="details-panel__section-label text-[15px] sm:text-[16px] font-semibold text-[#54252D]">
                      Qualifications & Degrees
                    </span>
                  </div>
                  {provider.qualifications && provider.qualifications.length > 0 ? (
                    <ul className="space-y-1.5 pl-1 pt-0.5">
                      {provider.qualifications.map((qual, idx) => (
                        <li key={idx} className="text-[#35171D] text-[15px] sm:text-[16px] flex items-center gap-2.5 font-normal">
                          <span className="w-2 h-2 rounded-full bg-[#713842] shrink-0" />
                          <span>{qual}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="details-panel__note text-[14px] sm:text-[15px] text-[#65464A] leading-relaxed">
                      Not publicly available in open directory. Confirm medical credentials directly with the provider or medical board.
                    </p>
                  )}
                </div>

                {/* 2. Professional Experience */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[#54252D]">
                    <Calendar className="w-4 h-4 text-[#713842] shrink-0" />
                    <span className="details-panel__section-label text-[15px] sm:text-[16px] font-semibold text-[#54252D]">
                      Years of Professional Experience
                    </span>
                  </div>
                  {provider.yearsExperience !== undefined ? (
                    <p className="text-[16px] sm:text-[17px] text-[#35171D] font-medium pt-0.5">
                      {provider.yearsExperience} years in clinical practice
                    </p>
                  ) : (
                    <p className="details-panel__note text-[14px] sm:text-[15px] text-[#65464A] leading-relaxed">
                      Not publicly available in open directory.
                    </p>
                  )}
                </div>

                {/* 3. Address */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[#54252D]">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#713842] shrink-0" />
                      <span className="details-panel__section-label text-[15px] sm:text-[16px] font-semibold text-[#54252D]">
                        Practice Address
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-semibold text-[#54252D] hover:text-[#35171D] px-2.5 py-1 rounded-lg hover:bg-white transition-all cursor-pointer border border-[#E8D4CC]"
                    >
                      {copiedAddress ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#54252D]" />
                          <span className="text-[#54252D]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#713842]" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[16px] sm:text-[17px] text-[#35171D] leading-relaxed font-normal pt-0.5 break-words">
                    {provider.formattedAddress || provider.address}
                  </p>
                  {provider.distanceKm !== undefined && (
                    <p className="text-[15px] text-[#65464A] pt-0.5">
                      Calculated distance: <strong className="text-[#35171D] font-semibold">{provider.distanceKm.toFixed(1)} km</strong> from search origin.
                    </p>
                  )}
                </div>

                {/* 4. Phone Number */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[#54252D]">
                    <Phone className="w-4 h-4 text-[#713842] shrink-0" />
                    <span className="details-panel__section-label text-[15px] sm:text-[16px] font-semibold text-[#54252D]">
                      Direct Telephone
                    </span>
                  </div>
                  {provider.phoneNumber ? (
                    <a
                      href={`tel:${provider.phoneNumber}`}
                      className="inline-flex items-center gap-2 text-[16px] sm:text-[17px] font-medium text-[#54252D] hover:text-[#35171D] hover:underline pt-0.5"
                    >
                      {provider.phoneNumber}
                    </a>
                  ) : (
                    <p className="details-panel__note text-[14px] sm:text-[15px] text-[#65464A] leading-relaxed">
                      Phone number not mapped in open directory.
                    </p>
                  )}
                </div>

                {/* 5. Official Website */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[#54252D]">
                    <Globe className="w-4 h-4 text-[#713842] shrink-0" />
                    <span className="details-panel__section-label text-[15px] sm:text-[16px] font-semibold text-[#54252D]">
                      Official Website
                    </span>
                  </div>
                  {provider.website ? (
                    <a
                      href={provider.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-[15px] sm:text-[16px] font-medium text-[#54252D] hover:text-[#35171D] hover:underline break-all pt-0.5"
                    >
                      <span>{provider.website}</span>
                      <ExternalLink className="w-4 h-4 shrink-0 text-[#713842]" />
                    </a>
                  ) : (
                    <p className="details-panel__note text-[14px] sm:text-[15px] text-[#65464A] leading-relaxed">
                      Official website not mapped in open directory.
                    </p>
                  )}
                </div>

                {/* 6. Opening Hours */}
                {provider.openingHoursRaw && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[#54252D]">
                      <Clock className="w-4 h-4 text-[#713842] shrink-0" />
                      <span className="details-panel__section-label text-[15px] sm:text-[16px] font-semibold text-[#54252D]">
                        Mapped Opening Hours
                      </span>
                    </div>
                    <p className="text-[15px] sm:text-[16px] text-[#35171D] font-normal pt-0.5">
                      {provider.openingHoursRaw}
                    </p>
                  </div>
                )}

                {/* 7. Consultation Fee */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[#54252D]">
                    <DollarSign className="w-4 h-4 text-[#713842] shrink-0" />
                    <span className="details-panel__section-label text-[15px] sm:text-[16px] font-semibold text-[#54252D]">
                      Consultation Fee
                    </span>
                  </div>
                  {provider.consultationFee ? (
                    <div className="p-4 bg-white rounded-2xl border border-[#E8D4CC] text-sm text-[#35171D] space-y-1.5">
                      <div className="text-2xl font-bold text-[#35171D]">
                        {provider.consultationFee.amount} {provider.consultationFee.currency}
                      </div>
                      {provider.consultationFee.sourceNotice && (
                        <p className="text-[14px] text-[#54252D] font-medium">
                          {provider.consultationFee.sourceNotice}
                        </p>
                      )}
                      {provider.consultationFee.dateVerified && (
                        <p className="text-xs text-[#65464A]">
                          Date checked: {provider.consultationFee.dateVerified}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-white rounded-2xl border border-[#E8D4CC] text-sm space-y-1">
                      <p className="font-semibold text-[15px] text-[#35171D]">
                        Consultation fee not publicly available in open directory.
                      </p>
                      <p className="text-[14px] text-[#65464A] leading-relaxed">
                        Fees vary by insurance plan and clinical complexity. Contact the clinic billing office directly.
                      </p>
                    </div>
                  )}
                </div>

                {/* 8. Source Reference Link */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2 text-[#54252D]">
                    <Layers className="w-4 h-4 text-[#713842] shrink-0" />
                    <span className="details-panel__section-label text-[15px] sm:text-[16px] font-semibold text-[#54252D]">
                      Directory Reference
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm bg-white p-3.5 rounded-xl border border-[#E8D4CC]">
                    <span className="text-[#65464A] text-[13px] sm:text-sm truncate mr-2 font-normal">
                      Reference: {provider.osmType || 'node'} #{provider.osmId || provider.placeId}
                    </span>
                    {provider.osmUrl && (
                      <a
                        href={provider.osmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-[#54252D] font-bold hover:underline shrink-0"
                      >
                        <span>View on OSM</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DisclaimerBanner />
          </div>
        )}

        {/* ========================================================= */}
        {/* RIGHT PANEL: 62% width on desktop, 100% when expanded     */}
        {/* ========================================================= */}
        <div className={`w-full ${isMapExpanded ? 'lg:w-full' : 'lg:w-[62%]'} space-y-4 transition-all`}>
          <OpenStreetMapView
            provider={provider}
            userOrigin={userOrigin}
            userAddressLabel={userAddressLabel}
            height={isMapExpanded ? '680px' : '560px'}
            isExpanded={isMapExpanded}
            onToggleExpand={() => setIsMapExpanded((prev) => !prev)}
            otherProviders={allProviders}
            onSelectProvider={onSelectProvider}
          />

          <div className="p-4 sm:p-5 rounded-2xl bg-[#FFF9F4] border border-[#E8D4CC] flex items-start gap-3.5 text-sm text-[#35171D]">
            <Compass className="w-5 h-5 text-[#713842] mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold text-[15px] sm:text-[16px] text-[#35171D]">OpenStreetMap Navigation & Map Controls</p>
              <p className="text-[14px] text-[#65464A] leading-relaxed">
                Clicking <strong>Get Directions</strong> opens turn-by-turn routing using OpenStreetMap OSRM routing engine with destination coordinates prefilled.
                Use the <strong>Expand map</strong> toggle button at the top-right of the map to enter full-width map mode.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
