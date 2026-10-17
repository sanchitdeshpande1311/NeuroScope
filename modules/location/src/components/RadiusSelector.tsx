import React from 'react'
import type { SearchRadiusOption } from '../types/neurologist'

interface RadiusSelectorProps {
  selectedRadius: SearchRadiusOption
  onChange: (radius: SearchRadiusOption) => void
  disabled?: boolean
}

const RADIUS_OPTIONS: { value: SearchRadiusOption; label: string; description: string }[] = [
  { value: 5, label: '5 km', description: 'Immediate local area' },
  { value: 10, label: '10 km', description: 'Standard regional search (Default)' },
  { value: 25, label: '25 km', description: 'Extended metropolitan range' },
]

export const RadiusSelector: React.FC<RadiusSelectorProps> = ({
  selectedRadius,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-[#76575A]">
          Search Radius
        </label>
        <span className="text-xs font-semibold text-[#54252D] bg-[#F7E4D9] px-2.5 py-0.5 rounded-full border border-[#DCA9A4]">
          Radius: <strong className="font-bold">{selectedRadius} km</strong>
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Search Radius Options"
        className="grid grid-cols-3 gap-2 bg-[#F7E4D9]/50 p-1.5 rounded-xl border border-[#DCA9A4]/60"
      >
        {RADIUS_OPTIONS.map((option) => {
          const isSelected = selectedRadius === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`relative flex flex-col items-center justify-center py-2 px-3 rounded-lg text-xs transition-all ${
                isSelected
                  ? 'bg-[#54252D] text-[#FFF3E7] shadow-xs font-bold ring-1 ring-[#35171D]'
                  : 'text-[#76575A] font-medium hover:text-[#35171D] hover:bg-[#FFF3E7]/90'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span>{option.label}</span>
              {option.value === 10 && (
                <span className={`text-[9px] ${isSelected ? 'text-[#FFF3E7]/80 font-normal' : 'text-[#713842] font-medium'}`}>
                  Default
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
