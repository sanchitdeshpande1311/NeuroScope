import React from 'react'
import { MapPin, ArrowRight } from 'lucide-react'

export interface FindNearbyNeurologistsButtonProps {
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'outline' | 'compact'
  className?: string
  showArrow?: boolean
  label?: string
}

/**
 * Reusable entry button for Claude Code to drop into NeuroScope 3D navbar, hero, or analysis pages.
 * Styled with the Cherry Cola + Vanilla Cream design system.
 */
export const FindNearbyNeurologistsButton: React.FC<FindNearbyNeurologistsButtonProps> = ({
  onClick,
  variant = 'primary',
  className = '',
  showArrow = true,
  label = 'Find Nearby Neurologists',
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-[#54252D] hover:bg-[#35171D] text-[#FFF3E7] shadow-md hover:shadow-lg shadow-[#35171D]/25 border border-[#35171D]'
      case 'secondary':
        return 'bg-[#713842] hover:bg-[#54252D] text-[#FFF3E7] shadow-sm'
      case 'outline':
        return 'bg-[#FFF3E7] hover:bg-[#F7E4D9] text-[#54252D] border border-[#DCA9A4] shadow-xs'
      case 'compact':
        return 'bg-[#FFF3E7] hover:bg-[#F7E4D9] text-[#54252D] border border-[#DCA9A4] text-xs py-1.5 px-3'
      default:
        return 'bg-[#54252D] hover:bg-[#35171D] text-[#FFF3E7]'
    }
  }

  const isCompact = variant === 'compact'

  return (
    <button
      id="find-nearby-neurologists-btn"
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2.5 font-bold rounded-2xl transition-all duration-200 cursor-pointer active:scale-95 ${
        isCompact ? 'py-1.5 px-3.5 text-xs' : 'py-3 px-6 text-sm'
      } ${getVariantStyles()} ${className}`}
    >
      <div className="flex items-center justify-center p-1 rounded-lg bg-white/20">
        <MapPin className={`${isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-[#FFF3E7] shrink-0`} />
      </div>
      <span>{label}</span>
      {showArrow && (
        <ArrowRight
          className={`${
            isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'
          } opacity-80 group-hover:translate-x-0.5 transition-transform shrink-0`}
        />
      )}
    </button>
  )
}
