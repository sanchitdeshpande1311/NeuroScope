import React from 'react'
import { Routes, Route, useParams, Link } from 'react-router-dom'
import { NearbyNeurologistsModule } from './components/NearbyNeurologistsModule'
import { FindNearbyNeurologistsButton } from './components/FindNearbyNeurologistsButton'
import { Activity } from 'lucide-react'

// Standalone Host Banner to showcase NeuroScope 3D context during local testing
const NeuroScopeHeader: React.FC = () => {
  return (
    <header className="bg-[#35171D] text-[#FFF3E7] border-b border-[#54252D] sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#54252D] border border-[#713842] flex items-center justify-center text-[#FFF3E7] font-black shadow-xs">
            <Activity className="w-5 h-5 text-[#FFF3E7]" />
          </div>
          <div>
            <div className="font-extrabold text-base tracking-tight leading-none text-[#FFF3E7]">
              NeuroScope <span className="text-[#DCA9A4]">3D</span>
            </div>
            <div className="text-[10px] text-[#DCA9A4]/90 font-medium tracking-wider uppercase mt-0.5">
              Brain Tumour Research & Clinical Discovery
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-3">
          <Link
            to="/nearby-neurologists"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-[#FFF3E7]/90 hover:text-[#FFF3E7] hover:bg-[#54252D] transition-colors"
          >
            Directory Route
          </Link>
        </nav>
      </div>
    </header>
  )
}

// Route 1: Showcase Page
const ShowcasePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#FFFDF9] flex flex-col justify-between">
      <div>
        <NeuroScopeHeader />

        {/* Hero Context Banner */}
        <div className="bg-gradient-to-b from-[#35171D] via-[#461F26] to-[#54252D] text-[#FFF3E7] py-10 px-4 sm:px-6 border-b border-[#713842]">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFF3E7] tracking-tight">
                Neuro-Oncology Findings to Real-Time Care
              </h2>
            </div>

            {/* Quick Action Button */}
            <div className="bg-[#35171D]/80 backdrop-blur-sm p-4 rounded-2xl border border-[#713842] space-y-2 text-center md:text-left shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#DCA9A4] block">
                Quick Action Button
              </span>
              <FindNearbyNeurologistsButton
                onClick={() => {
                  const element = document.getElementById('search-section')
                  element?.scrollIntoView({ behavior: 'smooth' })
                }}
              />
            </div>
          </div>
        </div>

        {/* Embedded Module Container */}
        <main id="search-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NearbyNeurologistsModule />
        </main>
      </div>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-[#F7E4D9] py-6 px-4 sm:px-6 text-xs text-[#76575A] mt-12 bg-transparent">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="font-semibold text-[#35171D]">
            NeuroScope 3D Clinical Healthcare Finder
          </div>
          <div className="text-[11px] text-[#76575A]">
            Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#54252D]">OpenStreetMap</a> contributors
          </div>
        </div>
      </footer>
    </div>
  )
}

// Route 2: Dedicated Full-page Route
const DedicatedRoutePage: React.FC = () => {
  const { providerId } = useParams<{ providerId?: string }>()

  return (
    <div className="min-h-screen bg-[#FFFDF9]">
      <NeuroScopeHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NearbyNeurologistsModule
          selectedProviderId={providerId}
        />
      </main>
    </div>
  )
}

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<ShowcasePage />} />
      <Route path="/nearby-neurologists" element={<DedicatedRoutePage />} />
      <Route path="/nearby-neurologists/:providerId" element={<DedicatedRoutePage />} />
    </Routes>
  )
}

export default App
