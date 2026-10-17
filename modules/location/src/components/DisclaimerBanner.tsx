import React from 'react'
import { ShieldAlert, Info } from 'lucide-react'

interface DisclaimerBannerProps {
  className?: string
  variant?: 'medical' | 'demo'
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({
  className = '',
  variant = 'medical',
}) => {
  if (variant === 'demo') {
    return (
      <aside
        aria-label="Demo mode notice"
        className={`flex items-start gap-3 p-4 rounded-2xl bg-[#FFF9F3] border border-[#DCA9A4] text-xs text-[#76575A] ${className}`}
      >
        <ShieldAlert className="w-4 h-4 text-[#713842] mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-bold text-[#35171D]">
            Demo Data Mode Active (For Local UI Testing)
          </p>
          <p className="text-[#76575A] leading-relaxed">
            Displaying curated test listings with real geographical coordinates to demonstrate UI functionality without external requests.
          </p>
        </div>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Medical disclaimer"
      className={`flex items-start gap-3 p-4 rounded-2xl bg-[#FFF3E7] border border-[#F7E4D9] text-xs text-[#76575A] shadow-xs ${className}`}
    >
      <Info className="w-4 h-4 text-[#713842] mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-bold text-[#35171D]">
          Healthcare Directory & Medical Notice
        </p>
        <p className="text-[#76575A] leading-relaxed">
          This directory is provided for informational guidance only and does not constitute medical advice or clinical evaluation. Always consult a qualified medical professional for health diagnoses, treatment planning, or emergency care.
        </p>
      </div>
    </aside>
  )
}
