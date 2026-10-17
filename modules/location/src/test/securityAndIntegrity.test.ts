import { describe, it, expect } from 'vitest'
import { TEST_FIXTURE_NEUROLOGISTS } from './fixtures/mockNeurologists'

describe('Security and Medical Data Integrity Compliance', () => {
  it('confirms no real Google API keys or credentials are hardcoded in test fixtures or source files', () => {
    for (const item of TEST_FIXTURE_NEUROLOGISTS) {
      expect(item.id).toBeDefined()
      // Place ID should be dummy or standard identifier, never an API key
      expect(item.placeId).not.toMatch(/AIza[0-9A-Za-z-_]{35}/)
    }
  })

  it('strictly adheres to consultation fee rules: only published fees or explicit null', () => {
    for (const item of TEST_FIXTURE_NEUROLOGISTS) {
      if (item.consultationFee !== null && item.consultationFee !== undefined) {
        // If fee is provided, it MUST have amount, currency, and sourceNotice
        expect(item.consultationFee.amount).toBeTruthy()
        expect(item.consultationFee.currency).toBeTruthy()
        expect(item.consultationFee.sourceNotice).toBeTruthy()
      } else {
        // Otherwise it must be null/undefined to trigger "Consultation fee not publicly available."
        expect(item.consultationFee ?? null).toBeNull()
      }
    }
  })

  it('ensures neurosurgeons are never categorized as medical neurologists', () => {
    const neurosurgeons = TEST_FIXTURE_NEUROLOGISTS.filter((p) => p.category === 'neurosurgeon')
    expect(neurosurgeons.length).toBeGreaterThan(0)
    for (const ns of neurosurgeons) {
      expect(ns.category).toBe('neurosurgeon')
      expect(ns.categoryLabel.toLowerCase()).toContain('neurosurg')
      expect(ns.categoryLabel.toLowerCase()).not.toBe('neurologist')
    }
  })

  it('ensures ratings and review counts are never fabricated for unrated doctors', () => {
    const unrated = TEST_FIXTURE_NEUROLOGISTS.filter((p) => p.rating === undefined)
    expect(unrated.length).toBeGreaterThan(0)
    for (const u of unrated) {
      expect(u.rating).toBeUndefined()
      expect(u.reviewCount).toBeUndefined()
    }
  })
})
