# Server API Routes

## Architecture Overview

The server has two routers that work together to fetch and serve card data:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Flow                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. User imports deck text or searches for cards                        │
│     ↓                                                                    │
│  2. Client calls POST /api/stream/cards                                 │
│     ↓                                                                    │
│  3. streamRouter queries Scryfall API, returns JSON with image URLs     │
│     { imageUrls: ["https://cards.scryfall.io/..."], colors, cmc, ... }  │
│     ↓                                                                    │
│  4. URLs stored in IndexedDB                                            │
│     ↓                                                                    │
│  5. WebGL workers need actual image bytes for processing                │
│     ↓                                                                    │
│  6. toProxied() wraps URL: /api/cards/images/proxy?url=...              │
│     ↓                                                                    │
│  7. imageRouter /proxy fetches, caches, and serves PNG bytes            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Distinction

| Router | Returns | Purpose |
|--------|---------|---------|
| `streamRouter` | **JSON** (metadata + URL strings) | Card lookup from Scryfall API |
| `imageRouter` | **Binary** (PNG/JPEG bytes) | Image caching + proxy layer |

---

## streamRouter (`/api/stream/`)

### POST `/cards`
**Purpose:** Fetch card data + image URLs via Server-Sent Events (SSE)

**Parameters:**
```typescript
{
  cardQueries: Array<{ name: string; set?: string; number?: string }>;
  language?: string;     // Default: "en"
  cardArt?: "art" | "prints";  // Default: "art"
}
```

- `cardArt: "art"` → Fast batch lookup, returns 1 image per card (deck import)
- `cardArt: "prints"` → Returns ALL prints progressively (ArtworkModal)

**SSE Events:**
| Event | Mode | Description |
|-------|------|-------------|
| `handshake` | both | `{ total, cardArt }` |
| `card-found` | art | Single card data with first image |
| `print-found` | prints | Individual print (streamed progressively) |
| `progress` | both | `{ processed, total }` |
| `card-error` | both | `{ query, error }` |
| `done` | both | Stream complete |

**Client Usage:**
- `UploadSection.tsx` → Deck text import (`cardArt: "art"`)
- `ArtworkModal.tsx` → Get all prints (`cardArt: "prints"`)
- `scryfallApi.ts` → `fetchCardWithPrints()` helper

---

## imageRouter (`/api/cards/images/`)

### GET `/proxy`
**Purpose:** Cache and proxy external images (Scryfall CDN)

The browser/workers don't fetch Scryfall directly. Instead:
1. `toProxied(url)` wraps URLs: `/api/cards/images/proxy?url=...`
2. Server fetches once, caches to disk
3. Subsequent requests served from cache

**Features:**
- Disk caching with LRU eviction (12GB max)
- `imageFetchLimit`: 10 concurrent outbound fetches
- `getWithRetry`: 2 retry attempts with exponential backoff
- 1-year browser cache headers

**Client Usage:**
- `bleed.webgl.worker.ts` → Image processing
- `pdf.worker.ts` → PDF export
- `ExportImagesZip.ts` → ZIP export

---

### GET `/mpc`
**Purpose:** Cache and proxy Google Drive images (MPC XML imports)

MPC Autofill stores images on Google Drive. This endpoint:
1. Accepts a Google Drive file ID
2. Tries multiple GDrive URL formats
3. Caches successful downloads

**Client Usage:** `Mpc.ts` → `getMpcImageUrl()`

---

### POST `/enrich`
**Purpose:** Batch fetch card metadata after MPC import

MPC imports don't include card metadata (colors, cmc, type_line). This endpoint:
1. Accepts up to 100 cards per request
2. Uses Scryfall Collection API (75 cards/batch)
3. Returns enriched metadata

**Client Usage:** `useCardEnrichment.ts`