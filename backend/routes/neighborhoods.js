// backend/routes/neighborhoods.js
const router = require('express').Router()
const db = require('../db')

const HOOD_COLORS = {
  'streeterville': '#1e40af',
  'wicker-park':   '#8b5cf6',
  'lincoln-park':  '#14b8a6',   // teal — gold now belongs to Gold Coast
  'logan-square':  '#f43f5e',
  'river-north':   '#f97316',
  'south-loop':    '#06b6d4',
  'bucktown':      '#84cc16',
  'andersonville': '#10b981',
  'pilsen':        '#ef4444',
  'hyde-park':     '#6366f1',
  'old-town':      '#ec4899',
  'west-loop':     '#00d4ff',
  'gold-coast':    '#ffd700',
  'fulton-market': '#d946ef',
}

const NEIGHBORHOODS = [
  {
    id: 'streeterville',
    name: 'Streeterville',
    tagline: 'Lake-front luxury, Magnificent Mile adjacent',
    vibe: ['upscale', 'lakefront', 'walkable'],
    walkScore: 97,
    transitScore: 84,
    avgRent: 3200,
    commute: '5 min to Mag Mile',
    topSpots: ['Navy Pier', 'Ohio Street Beach', 'Aster Hall'],
    description: 'Tucked between the Magnificent Mile and Lake Michigan, Streeterville is one of Chicago\'s most walkable neighborhoods. High-rises with lake views, world-class dining, and Navy Pier steps away.'
  },
  {
    id: 'wicker-park',
    name: 'Wicker Park',
    tagline: 'Indie soul, vintage shops, late nights',
    vibe: ['artsy', 'indie', 'nightlife'],
    walkScore: 95,
    transitScore: 89,
    avgRent: 2100,
    commute: '20 min on Blue Line',
    topSpots: ['Phyllis\' Musical Inn', 'Reckless Records', 'Big Star'],
    description: 'Chicago\'s creative heartbeat. Wicker Park blends dive bars with upscale dining, vintage boutiques with design studios. The Blue Line makes it an easy commute from Streeterville.'
  },
  {
    id: 'lincoln-park',
    name: 'Lincoln Park',
    tagline: 'Green space, brewpubs, families',
    vibe: ['green', 'family', 'bar scene'],
    walkScore: 91,
    transitScore: 79,
    avgRent: 2400,
    commute: '25 min on Red Line',
    topSpots: ['Lincoln Park Zoo', 'DePaul area bars', 'Armitage Ave'],
    description: 'Named after the 1,208-acre park on its doorstep. Tree-lined streets, excellent schools, a bustling bar scene around DePaul, and free access to Chicago\'s famous zoo.'
  },
  {
    id: 'logan-square',
    name: 'Logan Square',
    tagline: 'Michelin stars meet dive bars',
    vibe: ['hipster', 'foodie', 'diverse'],
    walkScore: 90,
    transitScore: 86,
    avgRent: 1900,
    commute: '30 min on Blue Line',
    topSpots: ['Lula Cafe', 'Revolution Brewing', 'Palmer Square'],
    description: 'One of Chicago\'s hottest neighborhoods. Logan Square punches above its weight on dining — home to some of the city\'s best restaurants, plus a thriving bar and coffee scene.'
  },
  {
    id: 'river-north',
    name: 'River North',
    tagline: 'Gallery district turned nightlife hub',
    vibe: ['nightlife', 'galleries', 'upscale'],
    walkScore: 96,
    transitScore: 82,
    avgRent: 2800,
    commute: '10 min walk to Mag Mile',
    topSpots: ['Bub City', 'RPM Italian', 'Chicago Riverwalk'],
    description: 'A short walk from Streeterville, River North transforms from gallery district by day to one of Chicago\'s prime nightlife zones by night. Dense with restaurants, rooftop bars, and clubs.'
  },
  {
    id: 'south-loop',
    name: 'South Loop',
    tagline: 'Museum campus, young professionals',
    vibe: ['professional', 'museums', 'mixed'],
    walkScore: 87,
    transitScore: 80,
    avgRent: 2000,
    commute: '20 min on Red/Green Line',
    topSpots: ['Grant Park', 'Shedd Aquarium', 'Soldier Field'],
    description: 'Just south of the Loop, this neighborhood has transformed dramatically. Condo towers for young professionals, proximity to Museum Campus, and easy lakefront access.'
  },
  {
    id: 'bucktown',
    name: 'Bucktown',
    tagline: 'Wicker Park\'s quieter sibling',
    vibe: ['residential', 'artsy', 'families'],
    walkScore: 90,
    transitScore: 85,
    avgRent: 2300,
    commute: '25 min on Blue Line',
    topSpots: ['Holstein Park', 'Bucktown Pub', 'Western Ave boutiques'],
    description: 'Just north of Wicker Park, Bucktown offers the same creative energy with a slightly more settled feel. Great brunch spots, independent boutiques, and tree-lined streets.'
  },
  {
    id: 'andersonville',
    name: 'Andersonville',
    tagline: 'LGBTQ+ friendly, Swedish heritage',
    vibe: ['inclusive', 'indie', 'community'],
    walkScore: 88,
    transitScore: 75,
    avgRent: 1800,
    commute: '35 min on Red Line',
    topSpots: ['The Hopleaf', 'Vintage cooking shops', 'Clark St'],
    description: 'One of Chicago\'s most welcoming neighborhoods. Andersonville has a rich Swedish heritage, a thriving LGBTQ+ community, and Clark Street lined with indie shops and restaurants.'
  },
  {
    id: 'pilsen',
    name: 'Pilsen',
    tagline: 'Mexican art mecca, gallery row',
    vibe: ['artistic', 'cultural', 'authentic'],
    walkScore: 85,
    transitScore: 78,
    avgRent: 1600,
    commute: '30 min on Pink Line',
    topSpots: ['National Museum of Mexican Art', 'La Paloma', 'Simone\'s'],
    description: 'Chicago\'s vibrant Mexican-American neighborhood. Murals cover nearly every building, the food scene is exceptional, and it houses the National Museum of Mexican Art. Rapidly gentrifying.'
  },
  {
    id: 'hyde-park',
    name: 'Hyde Park',
    tagline: 'Obama\'s neighborhood, UChicago campus',
    vibe: ['academic', 'historic', 'quiet'],
    walkScore: 82,
    transitScore: 70,
    avgRent: 1700,
    commute: '40 min on Metra',
    topSpots: ['Museum of Science and Industry', 'Medici', 'Promontory'],
    description: 'Home to the University of Chicago and Barack Obama\'s house, Hyde Park is an intellectually charged neighborhood on the South Side with beautiful architecture and lakefront access.'
  },
  {
    id: 'old-town',
    name: 'Old Town',
    tagline: 'Comedy, Second City, cobblestones',
    vibe: ['entertainment', 'historic', 'nightlife'],
    walkScore: 94,
    transitScore: 81,
    avgRent: 2600,
    commute: '15 min on Red Line',
    topSpots: ['Second City', 'The Spybar', 'Wells St'],
    description: 'Best known as home to The Second City comedy club, Old Town combines historic architecture with a lively entertainment scene. Wells Street is lined with restaurants and nightlife.'
  },
  {
    id: 'west-loop',
    name: 'West Loop',
    tagline: 'Restaurant row, tech offices, Fulton Market',
    vibe: ['foodie', 'tech', 'trendy'],
    walkScore: 92,
    transitScore: 83,
    avgRent: 2900,
    commute: '15 min on Green/Pink Line',
    topSpots: ['Randolph St restaurants', 'Fulton Market', 'Google HQ Chicago'],
    description: 'The hottest neighborhood in Chicago right now. Fulton Market has transformed from meatpacking district to restaurant row. Home to Google\'s Chicago HQ, upscale condos, and some of the city\'s best dining.'
  },
  {
    id: 'gold-coast',
    name: 'Gold Coast',
    tagline: 'Historic mansions, lakefront glamour',
    vibe: ['historic', 'upscale', 'lakefront'],
    walkScore: 96,
    transitScore: 81,
    avgRent: 3100,
    commute: '10 min to the Loop on Red Line',
    topSpots: ['Oak Street Beach', 'Astor Street District', 'The Drake Hotel'],
    description: 'Mansion-lined streets between the lake and Clark Street, anchored by the landmark Astor Street District. Oak Street\'s designer shopping, Rush Street dining, and Oak Street Beach make it Chicago\'s most polished lakefront address.'
  },
  {
    id: 'fulton-market',
    name: 'Fulton Market',
    tagline: 'Meatpacking grit turned restaurant row',
    vibe: ['foodie', 'industrial-chic', 'buzzing'],
    walkScore: 94,
    transitScore: 85,
    avgRent: 2850,
    commute: 'Morgan stop on Green/Pink Line',
    topSpots: ['Time Out Market', 'Green Street Smoked Meats', 'The Publishing House'],
    description: 'The old meatpacking district reborn as Chicago\'s hottest dining and tech corridor. James Beard-winning restaurants share cobblestone blocks with Google and McDonald\'s headquarters, galleries, and late-night cocktail bars under the old butcher signs.'
  }
]

router.get('/', (_req, res) => {
  res.json(NEIGHBORHOODS)
})

// Hardcoded approximate polygon boundaries for each neighborhood.
// Kept as the FALLBACK when the City of Chicago dataset is unreachable and nothing is cached.
const HOOD_POLYGONS = {
  'streeterville': [
    [-87.624, 41.883], [-87.616, 41.883], [-87.614, 41.890],
    [-87.617, 41.896], [-87.619, 41.901], [-87.624, 41.901],
    [-87.624, 41.883],
  ],
  'river-north': [
    [-87.646, 41.884], [-87.624, 41.884], [-87.624, 41.900], [-87.630, 41.901],
    [-87.646, 41.901], [-87.646, 41.884],
  ],
  'old-town': [
    [-87.649, 41.904], [-87.632, 41.904], [-87.632, 41.918], [-87.639, 41.919],
    [-87.649, 41.918], [-87.649, 41.904],
  ],
  'lincoln-park': [
    [-87.654, 41.918], [-87.638, 41.918], [-87.637, 41.926], [-87.637, 41.936],
    [-87.639, 41.944], [-87.654, 41.944], [-87.654, 41.918],
  ],
  'south-loop': [
    [-87.641, 41.855], [-87.619, 41.855], [-87.619, 41.876], [-87.630, 41.877],
    [-87.641, 41.876], [-87.641, 41.855],
  ],
  'west-loop': [
    [-87.666, 41.876], [-87.643, 41.876], [-87.643, 41.895], [-87.651, 41.895],
    [-87.666, 41.895], [-87.666, 41.876],
  ],
  'wicker-park': [
    [-87.692, 41.903], [-87.668, 41.903], [-87.668, 41.916], [-87.676, 41.917],
    [-87.692, 41.916], [-87.692, 41.903],
  ],
  'bucktown': [
    [-87.688, 41.915], [-87.668, 41.915], [-87.668, 41.928], [-87.675, 41.929],
    [-87.688, 41.928], [-87.688, 41.915],
  ],
  'logan-square': [
    [-87.720, 41.918], [-87.698, 41.918], [-87.698, 41.936], [-87.707, 41.937],
    [-87.720, 41.936], [-87.720, 41.918],
  ],
  'andersonville': [
    [-87.679, 41.973], [-87.659, 41.973], [-87.659, 41.989], [-87.666, 41.990],
    [-87.679, 41.989], [-87.679, 41.973],
  ],
  'pilsen': [
    [-87.676, 41.848], [-87.653, 41.848], [-87.653, 41.866], [-87.661, 41.867],
    [-87.676, 41.866], [-87.676, 41.848],
  ],
  'hyde-park': [
    [-87.611, 41.780], [-87.588, 41.780], [-87.588, 41.804], [-87.596, 41.805],
    [-87.611, 41.804], [-87.611, 41.780],
  ],
  'gold-coast': [
    [-87.632, 41.900], [-87.624, 41.900], [-87.625, 41.911],
    [-87.632, 41.911], [-87.632, 41.900],
  ],
  // Fulton Market District per city plan: Halsted→Ogden, Randolph→Hubbard.
  // Not in the official neighborhoods dataset, so this IS its polygon.
  'fulton-market': [
    [-87.648, 41.8843], [-87.666, 41.8843], [-87.666, 41.8895],
    [-87.648, 41.8895], [-87.648, 41.8843],
  ],
}

// Official street-accurate boundaries — City of Chicago "Boundaries - Neighborhoods"
const BOUNDARIES_URL   = 'https://data.cityofchicago.org/resource/y6yq-dbs2.json?$limit=100'
const BOUNDS_CACHE_KEY = 'hood_boundaries_v2'
const BOUNDS_TTL_MS    = 30 * 24 * 60 * 60 * 1000 // 30 days
const MAX_COORDS       = 3000 // per-neighborhood coordinate budget before decimation

const stmtGet = db.prepare('SELECT data, cached_at FROM yelp_cache WHERE cache_key = ?')
const stmtSet = db.prepare('INSERT OR REPLACE INTO yelp_cache (cache_key, data, cached_at) VALUES (?, ?, ?)')

// App name (lowercased) → dataset pri_neigh, for hoods with no exact name match.
// The dataset has no "South Loop" row — Near South Side is the official polygon for that
// area — and Pilsen is listed under its community-area name, Lower West Side.
const PRI_NEIGH_ALIASES = {
  'south loop': 'near south side',
  'pilsen':     'lower west side',
}

function countCoords(multi) {
  let n = 0
  for (const poly of multi) for (const ring of poly) n += ring.length
  return n
}

// Every-Nth-point decimation, preserving each ring's first and last (closing) points.
// Only applied when a single neighborhood exceeds MAX_COORDS coordinate pairs.
function simplifyMultiPolygon(multi) {
  const total = countCoords(multi)
  if (total <= MAX_COORDS) return multi
  const step = Math.ceil(total / MAX_COORDS)
  return multi.map(poly => poly.map(ring =>
    ring.filter((_, i) => i % step === 0 || i === ring.length - 1)
  ))
}

function fallbackFeature(n) {
  if (!HOOD_POLYGONS[n.id]) return null
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [HOOD_POLYGONS[n.id]],
    },
    properties: {
      id:      n.id,
      name:    n.name,
      color:   HOOD_COLORS[n.id] || '#00d4ff',
      tagline: n.tagline,
    },
  }
}

function fallbackCollection() {
  return {
    type: 'FeatureCollection',
    features: NEIGHBORHOODS.map(fallbackFeature).filter(Boolean),
  }
}

// Build features from the official dataset; any app hood we can't match keeps its
// hardcoded approximate polygon so the map never loses a neighborhood.
function buildOfficialCollection(rows) {
  const byName = new Map()
  for (const row of rows) {
    if (row && row.pri_neigh && row.the_geom && Array.isArray(row.the_geom.coordinates)) {
      byName.set(row.pri_neigh.toLowerCase(), row)
    }
  }

  const features = NEIGHBORHOODS.map(n => {
    const key = n.name.toLowerCase()
    const row = byName.get(key) || byName.get(PRI_NEIGH_ALIASES[key])
    if (!row) return fallbackFeature(n)
    return {
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: simplifyMultiPolygon(row.the_geom.coordinates),
      },
      properties: {
        id:      n.id,
        name:    n.name,
        color:   HOOD_COLORS[n.id] || '#00d4ff',
        tagline: n.tagline,
      },
    }
  }).filter(Boolean)

  return { type: 'FeatureCollection', features }
}

router.get('/boundaries', async (_req, res) => {
  const cached = stmtGet.get(BOUNDS_CACHE_KEY)
  if (cached && Date.now() - cached.cached_at < BOUNDS_TTL_MS) {
    return res.json(JSON.parse(cached.data))
  }

  try {
    const r = await fetch(BOUNDARIES_URL, {
      headers: { 'User-Agent': 'ChiAtlas/1.0 (chi atlas app; contact via github)' },
      signal: AbortSignal.timeout(14000),
    })
    if (!r.ok) throw new Error(`Socrata ${r.status}`)
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Empty boundaries dataset')

    const payload = buildOfficialCollection(rows)
    stmtSet.run(BOUNDS_CACHE_KEY, JSON.stringify(payload), Date.now())
    res.json(payload)
  } catch {
    // Stale cache beats the crude hardcoded shapes; hardcoded shapes beat nothing.
    if (cached) return res.json(JSON.parse(cached.data))
    res.json(fallbackCollection())
  }
})

router.get('/:id', (req, res) => {
  const n = NEIGHBORHOODS.find(n => n.id === req.params.id)
  if (!n) return res.status(404).json({ error: 'Not found' })
  res.json(n)
})

module.exports = router
// Expose the static data for other routes (e.g. routes/search.js)
module.exports.NEIGHBORHOODS = NEIGHBORHOODS
