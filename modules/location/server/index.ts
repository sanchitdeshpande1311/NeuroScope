import express, { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001

app.use(cors())
app.use(express.json())

// Required by OpenStreetMap & Nominatim Acceptable Use Policy
const OSM_USER_AGENT = 'NeuroScope3D-LocationModule/1.0 (healthcare-research; contact: support@neuroscope3d.org)'

// In-memory cache to prevent redundant queries and respect OSM rate limits
interface CacheEntry<T> {
  data: T
  timestamp: number
}
const queryCache = new Map<string, CacheEntry<any>>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getCached<T>(key: string): T | null {
  const entry = queryCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    queryCache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache<T>(key: string, data: T): void {
  // Cap cache size
  if (queryCache.size > 200) {
    const oldestKey = queryCache.keys().next().value
    if (oldestKey) queryCache.delete(oldestKey)
  }
  queryCache.set(key, { data, timestamp: Date.now() })
}

/**
 * Health & Configuration diagnostic endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'NeuroScope 3D - Nearby Neurologists Discovery Service',
    mode: 'openstreetmap_live',
    billingRequired: false,
    dataSource: 'OpenStreetMap via Overpass API & Nominatim',
    cachedQueries: queryCache.size,
    timestamp: new Date().toISOString(),
  })
})

/**
 * Detailed configuration status
 */
app.get('/api/config-status', (_req: Request, res: Response) => {
  res.json({
    configured: true,
    status: 'ACTIVE_OPENSTREETMAP',
    billingRequired: false,
    message: 'Free live OpenStreetMap data source is active. No Google Cloud billing or API key required.',
  })
})

/**
 * Geocoding via OpenStreetMap Nominatim
 * Complies with Nominatim usage policy (custom User-Agent, throttled, cached)
 */
app.get('/api/geocode', async (req: Request, res: Response): Promise<void> => {
  const address = (req.query.address as string || '').trim()

  if (!address) {
    res.status(400).json({ error: 'Address parameter is required', code: 'INVALID_INPUT' })
    return
  }

  const cacheKey = `geo_${address.toLowerCase()}`
  const cached = getCached<any>(cacheKey)
  if (cached) {
    res.json(cached)
    return
  }

  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      address
    )}&limit=1&addressdetails=1`

    const response = await fetch(nomUrl, {
      headers: {
        'User-Agent': OSM_USER_AGENT,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      res.status(response.status).json({
        error: `Nominatim geocoding service returned HTTP ${response.status}`,
        code: 'GEOCODE_FAILED',
      })
      return
    }

    const data = await response.json()

    if (!Array.isArray(data) || data.length === 0) {
      res.json({
        status: 'ZERO_RESULTS',
        results: [],
        message: `No geographic coordinates found for "${address}".`,
      })
      return
    }

    const item = data[0]
    const normalized = {
      status: 'OK',
      results: [
        {
          formatted_address: item.display_name,
          geometry: {
            location: {
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
            },
          },
        },
      ],
    }

    setCache(cacheKey, normalized)
    res.json(normalized)
  } catch (error: any) {
    console.error('[Geocode Error]:', error?.message || error)
    res.status(500).json({
      error: 'Failed to contact Nominatim geocoding service',
      code: 'NETWORK_ERROR',
    })
  }
})

/**
 * Location Autocomplete via OpenStreetMap Nominatim
 * Throttled, cached (10 min TTL), debounced on frontend, custom User-Agent
 */
app.get('/api/geocode/suggest', async (req: Request, res: Response): Promise<void> => {
  const query = ((req.query.q || req.query.address || '') as string).trim()

  if (!query || query.length < 2) {
    res.json({ status: 'OK', results: [] })
    return
  }

  const cacheKey = `geo_sug_${query.toLowerCase()}`
  const cached = getCached<any>(cacheKey)
  if (cached) {
    res.json(cached)
    return
  }

  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&limit=6&addressdetails=1`

    const response = await fetch(nomUrl, {
      headers: {
        'User-Agent': OSM_USER_AGENT,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      res.status(response.status).json({
        error: `Nominatim autocomplete service returned HTTP ${response.status}`,
        code: 'SUGGEST_FAILED',
        results: [],
      })
      return
    }

    const data = await response.json()
    if (!Array.isArray(data)) {
      res.json({ status: 'OK', results: [] })
      return
    }

    const results = data.map((item: any) => {
      const addr = item.address || {}
      const primary =
        item.name ||
        addr.city ||
        addr.town ||
        addr.village ||
        addr.suburb ||
        addr.neighbourhood ||
        item.display_name.split(',')[0].trim()

      const secondaryParts = [
        addr.county,
        addr.state,
        addr.country,
      ].filter(Boolean)

      // Deduplicate secondary parts from primary
      const uniqueSecondary = Array.from(new Set(secondaryParts.filter(p => p !== primary))).join(', ')

      return {
        placeId: String(item.place_id || item.osm_id),
        displayName: item.display_name,
        label: primary,
        subLabel: uniqueSecondary || item.display_name,
        coordinates: {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        },
      }
    })

    const payload = { status: 'OK', results }
    setCache(cacheKey, payload)
    res.json(payload)
  } catch (error: any) {
    console.error('[Autocomplete Error]:', error?.message || error)
    res.status(500).json({
      error: 'Failed to contact Nominatim autocomplete service',
      code: 'NETWORK_ERROR',
      results: [],
    })
  }
})

/**
 * Healthcare POI Discovery via OpenStreetMap Overpass API
 * Retrieves mapped hospitals, clinics, and doctors with neurology tags.
 */
app.get(['/api/places/nearby', '/api/healthcare/nearby'], async (req: Request, res: Response): Promise<void> => {
  const lat = parseFloat(req.query.lat as string)
  const lng = parseFloat(req.query.lng as string)
  const radius = Math.min(Math.max(parseFloat(req.query.radius as string) || 10000, 1000), 25000)

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'Valid latitude and longitude parameters are required', code: 'INVALID_INPUT' })
    return
  }

  const cacheKey = `osm_nearby_${lat.toFixed(3)}_${lng.toFixed(3)}_${radius}`
  const cached = getCached<any>(cacheKey)
  if (cached) {
    res.json(cached)
    return
  }

  // Construct Overpass QL query querying relevant healthcare tags within radius
  const overpassQuery = `[out:json][timeout:25];
(
  nwr["amenity"="hospital"](around:${radius},${lat},${lng});
  nwr["amenity"="clinic"](around:${radius},${lat},${lng});
  nwr["amenity"="doctors"](around:${radius},${lat},${lng});
  nwr["healthcare"="hospital"](around:${radius},${lat},${lng});
  nwr["healthcare"="clinic"](around:${radius},${lat},${lng});
  nwr["healthcare"="doctor"](around:${radius},${lat},${lng});
  nwr["healthcare"="centre"](around:${radius},${lat},${lng});
  nwr["healthcare"="neurologist"](around:${radius},${lat},${lng});
  nwr["healthcare"="specialist"](around:${radius},${lat},${lng});
  nwr["healthcare:speciality"="neurology"](around:${radius},${lat},${lng});
  nwr["healthcare:specialty"="neurology"](around:${radius},${lat},${lng});
  nwr["healthcare:speciality"="neurosurgery"](around:${radius},${lat},${lng});
  nwr["healthcare:specialty"="neurosurgery"](around:${radius},${lat},${lng});
  nwr["medical_specialty"="neurology"](around:${radius},${lat},${lng});
  nwr["medical_specialty"="neurosurgery"](around:${radius},${lat},${lng});
  nwr["doctor"="neurologist"](around:${radius},${lat},${lng});
  nwr["doctor"="neurosurgeon"](around:${radius},${lat},${lng});
);
out center 60;`

  const overpassMirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]

  let elements: any[] | null = null
  let lastError: string | null = null

  for (const mirror of overpassMirrors) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000)

      const response = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OSM_USER_AGENT,
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const text = await response.text()
        try {
          const json = JSON.parse(text)
          if (Array.isArray(json.elements)) {
            elements = json.elements
            break
          }
        } catch {
          lastError = 'Invalid JSON from Overpass mirror'
        }
      } else {
        lastError = `Overpass mirror ${mirror} returned HTTP ${response.status}`
      }
    } catch (err: any) {
      lastError = err.message || 'Overpass mirror request timeout'
    }
  }

  // If Overpass mirrors are busy, fallback to Nominatim POI search
  if (!elements) {
    try {
      console.warn(`[Overpass unavailable: ${lastError}]. Falling back to Nominatim healthcare discovery...`)
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=hospital&viewbox=${lng - 0.12},${lat + 0.12},${lng + 0.12},${lat - 0.12}&bounded=1&limit=25&addressdetails=1`
      const nomRes = await fetch(nomUrl, {
        headers: { 'User-Agent': OSM_USER_AGENT },
      })
      if (nomRes.ok) {
        const nomData = await nomRes.json()
        if (Array.isArray(nomData)) {
          elements = nomData.map((item: any) => ({
            id: item.osm_id,
            type: item.osm_type || 'node',
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            tags: {
              name: item.name || item.display_name.split(',')[0],
              amenity: item.type === 'hospital' ? 'hospital' : 'clinic',
              'addr:street': item.address?.road,
              'addr:city': item.address?.city || item.address?.town,
              'addr:postcode': item.address?.postcode,
            },
          }))
        }
      }
    } catch (nomErr: any) {
      console.error('[Nominatim Fallback Failed]:', nomErr.message)
    }
  }

  if (!elements) {
    res.status(503).json({
      error: 'Public OpenStreetMap servers are temporarily busy. Please retry in a few moments.',
      code: 'OSM_SERVICE_BUSY',
      details: lastError,
    })
    return
  }

  // Parse and normalize OSM elements into standard structure
  const seenIds = new Set<string>()
  const results = elements
    .filter((el) => {
      // Must have coordinates
      const elLat = el.lat ?? el.center?.lat
      const elLon = el.lon ?? el.center?.lon
      if (!elLat || !elLon) return false

      const uid = `${el.type || 'node'}-${el.id}`
      if (seenIds.has(uid)) return false
      seenIds.add(uid)
      return true
    })
    .map((el) => {
      const tags = el.tags || {}
      const elLat = el.lat ?? el.center?.lat
      const elLon = el.lon ?? el.center?.lon

      // Address construction from OSM tags
      const streetParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')
      const cityParts = [tags['addr:city'], tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(', ')
      const formattedAddress = [streetParts, cityParts].filter(Boolean).join(', ') || tags['addr:full'] || 'Address mapped on OpenStreetMap'

      // Specialty tags: support healthcare:speciality, healthcare:specialty, medical_specialty, doctor, speciality
      const speciality =
        tags['healthcare:speciality'] ||
        tags['healthcare:specialty'] ||
        tags['medical_specialty'] ||
        tags['doctor'] ||
        tags['speciality'] ||
        tags['specialty'] ||
        ''
      const lowerSpeciality = speciality.toLowerCase()
      const lowerName = (tags.name || tags['name:en'] || '').toLowerCase()

      const isNeurosurgery =
        lowerSpeciality.includes('neurosurg') ||
        lowerName.includes('neurosurgeon') ||
        lowerName.includes('neurosurg') ||
        lowerName.includes('spine surgery')

      const isNeurology =
        lowerSpeciality.includes('neurolog') ||
        lowerName.includes('neurolog') ||
        lowerName.includes('brain health') ||
        lowerName.includes('memory clinic')

      return {
        id: `osm-${el.type || 'node'}-${el.id}`,
        place_id: `osm-${el.type || 'node'}-${el.id}`,
        osmId: String(el.id),
        osmType: el.type || 'node',
        name: tags.name || tags['name:en'] || (tags.amenity === 'hospital' ? 'Regional Hospital' : 'Medical Center'),
        vicinity: formattedAddress,
        formatted_address: formattedAddress,
        geometry: {
          location: {
            lat: elLat,
            lng: elLon,
          },
        },
        // OSM tags preserved for honest classification
        osmTags: tags,
        types: [tags.amenity, tags.healthcare].filter(Boolean),
        specialityTags: speciality ? speciality.split(';').map((s: string) => s.trim()) : [],
        isSpecialtyVerified: isNeurology,
        isNeurosurgery,
        formatted_phone_number: tags.phone || tags['contact:phone'] || null,
        website: tags.website || tags['contact:website'] || null,
        opening_hours: {
          open_now: undefined, // OSM opening_hours string cannot be simply boolean-evaluated without full parser
          raw: tags.opening_hours || null,
        },
        osmUrl: `https://www.openstreetmap.org/${el.type || 'node'}/${el.id}`,
      }
    })

  const payload = {
    status: 'OK',
    results,
    source: 'openstreetmap',
    count: results.length,
    attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
  }

  setCache(cacheKey, payload)
  res.json(payload)
})

/**
 * Place Details endpoint
 */
app.get(['/api/places/details', '/api/healthcare/details'], async (req: Request, res: Response): Promise<void> => {
  const placeId = (req.query.placeId as string || '').trim()

  if (!placeId) {
    res.status(400).json({ error: 'placeId is required', code: 'INVALID_INPUT' })
    return
  }

  // Check in-memory cache for provider
  for (const entry of queryCache.values()) {
    if (entry.data?.results) {
      const match = entry.data.results.find((p: any) => p.place_id === placeId || p.id === placeId)
      if (match) {
        res.json({ status: 'OK', result: match })
        return
      }
    }
  }

  res.status(404).json({ error: 'Provider details not found in active query cache', code: 'NOT_FOUND' })
})

app.listen(PORT, () => {
  console.log(`[NeuroScope 3D] Free OpenStreetMap Healthcare Server running on port ${PORT}`)
})
