# Phase 1: System Architecture, Data Model & API Specification

## 1. Tech Stack
- **Framework:** Next.js 16 (App Router, React 19, TypeScript strict mode)
- **Styling & UI:** Tailwind CSS v4 + custom design tokens + Lucide Icons (Mobile-first responsive with `dvh` & safe-area support, PWA manifest ready)
- **Local Persistence:** Dexie.js (IndexedDB) via `dexie-react-hooks` for offline-capable, zero-latency collection & deck state
- **Virtualization & Charts:** `@tanstack/react-virtual` (60fps rendering across 2,014+ card rows) + `recharts` (Analytics dashboard)
- **Validation:** `zod` for API boundaries, JSON/CSV backup import/export, and deck parsing
- **Testing:** Vitest (unit & domain logic) + Playwright (end-to-end UI & zero-console-error verification)

---

## 2. Three-Level Card Hierarchy Schema (`src/lib/types.ts`)

```text
CardConcept (grouped by exact `name`, 1,166 concepts)
  ├── playsetTarget: 1 (if Life or Only #1) | 4 (standard) | customLimit
  ├── prints: CardPrint[]
  └── variants: CardVariant[]

CardPrint (grouped by `print`, 1,633 prints)
  ├── print: string ("BT01-038", "B2SA-008")
  ├── setCode: string ("BT01", "B2SA")
  ├── name, type, subtype, soi, cost, gem, power, symbol, color, ex, mainEffect, favorText, creator
  └── variants: CardVariant[]

CardVariant (unique SKU = `${print}__${rare}`, 2,014 variants)
  ├── id: `${print}__${rare}`
  ├── print: string
  ├── rare: CardRarity ("C" | "R" | "SR" | "UR" | "PR" | "CBR" | "SCR" | "USEC")
  ├── imageUrl: string (resolved via `resolveCardImageUrl`)
  └── finishes: ("standard" | "foil" | "firstEd")
```

### Playset & Unlimited Surplus State Engine (`src/lib/playset-engine.ts`)
For each `CardVariant` (and optionally per finish `standard` / `foil` / `firstEd`), IndexedDB stores `qtyOwned` (`number >= 0`, no upper limit).

Aggregated per `CardConcept` (`name`):
- `totalOwned = sum(qtyOwned across all prints & variants of name)`
- `playsetTarget = (type === "Life" || ex === "Only #1") ? 1 : (customLimit ?? 4)`
- `playsetFilled = Math.min(totalOwned, playsetTarget)`
- `missingForPlayset = Math.max(0, playsetTarget - totalOwned)`
- `surplusCopies = Math.max(0, totalOwned - playsetTarget)`
- `isPlaysetComplete = totalOwned >= playsetTarget`

---

## 3. Client IndexedDB Schema (`src/lib/db.ts` — Dexie.js)

1. **`collection` (`&variantKey`, `print`, `name`, `updatedAt`):**
   - `variantKey`: `${print}__${rare}`
   - `print`: string
   - `name`: string
   - `qtyStandard`: number (default 0)
   - `qtyFoil`: number (default 0)
   - `qtyFirstEd`: number (default 0)
   - `totalQty`: number (`qtyStandard + qtyFoil + qtyFirstEd`)
   - `updatedAt`: number (epoch ms)
2. **`decks` (`&id`, `name`, `sourceType`, `updatedAt`):**
   - `id`: string (UUID or `bottcg-${uuid}`)
   - `name`: string
   - `sourceType`: `"bottcg" | "text" | "json" | "manual"`
   - `sourceUrl?`: string
   - `main`: `DeckSlot[]` (`{ print, rare, name, quantity }`)
   - `life`: `DeckSlot[]`
   - `side`: `DeckSlot[]`
   - `createdAt`, `updatedAt`
3. **`priceCache` (`&key`, `print`, `rare`, `name`, `fetchedAt`):**
   - `key`: `${print}__${rare}`
   - `tcgProductId?`: string
   - `minPriceTHB`: number | null
   - `lastSoldTHB`: number | null
   - `stockCount`: number
   - `condition`: string (`"Near Mint (NM)"` etc.)
   - `productUrl`: string
   - `searchUrl`: string
   - `fetchedAt`: number

---

## 4. Server API Routes (`src/app/api/`)

1. **`GET /api/catalog` (`?refresh=1` optional):**
   - Returns local bundled catalog (`src/data/cards-catalog.json`, 2,014 cards) instantly; if `refresh=1`, probes `bottcg.com/cards` / `cdn.bottcg.com/data/cards.<hash>.json` and updates cache.
2. **`GET /api/market/tcgthailand` & `POST /api/market/tcgthailand`:**
   - Queries `https://api.tcgthailand.com/api/v1/member/products/search` using `X-Api-Key` (with auto-recovery if key rotates by scraping `window.__NUXT__.config.public.xApiKey`).
   - Supports:
     - `?names=ความเจริญ,นนทก นิ้วเพชร` (batch card-name lookups)
     - `?setCode=BT12` (full-set sync via `set_ids` UUID in 1–2 API calls)
     - `POST` `{ names?: string[], setCodes?: string[], forceRefresh?: boolean }`
   - Server-side persistent cache `.cache/tcgthailand-prices.json` (TTL: 8 hours), token-bucket rate limiter (max 2 req/sec + exponential backoff on 429/5xx), and secondary fallback to `https://bottcg.com/api/prices?cardId=...`.
   - Always attaches both `productUrl` (`https://www.tcgthailand.com/product/<id>`) and `searchUrl` (`https://www.tcgthailand.com/product?category_ids=0768f1bf-ae5c-44ac-b3b1-3212d4296f3a&search=<encodedName>`).
3. **`GET /api/decks/public`:**
   - Proxies `https://bottcg.com/api/decks/public` query parameters (`sort`, `limit`, `offset`, `deckname`, `colors`, `symbols`).
4. **`GET /api/decks/[uuid]`:**
   - Proxies `https://bottcg.com/api/decks/<uuid>` and normalizes response into `{ main, life, side }` resolved against the card catalog.

---

## 5. Responsive UI & Performance Architecture
- **App Shell:** Top responsive navigation (Desktop bar + Mobile bottom tab navigation inside `100dvh`) switching cleanly across:
  1. **Binder (สมุดสะสม)** — 60fps virtualized grid (`@tanstack/react-virtual`), instant multi-filter bar, grayscale vs. vibrant owned card states, playset progress badges (`3/4`, `ครบ 4/4 (+2 ซ้ำ)`), quick `−`/`+` steppers, and Rarity & Market Price Drawer.
  2. **Decks (เด็คแข่งขัน)** — Live `bottcg.com` public deck browser & URL importer, Thai/Print deck recipe parser, JSON/CSV upload, August 2026 Sin-List validator, Cross-Print vs. Exact-Print Gap Checker, and TCG Thailand Shopping List.
  3. **Analysis (วิเคราะห์พอร์ต)** — 4-Pillar Analytics (Playset vs. Master Set Completion, Portfolio & Surplus Trade Valuation, Deck Cost/Gem Telemetry & Budget vs. Bling Simulator, Shareable Hunting/Trade Sheet + JSON/CSV Backup).
