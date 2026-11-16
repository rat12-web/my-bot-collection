# Phase 1–3 Master Implementation Task Checklist

## Phase 1: Reconnaissance & Specification Lock (Argon 4)
- [x] Load `bot-collection-architect`, `craft-anything`, and `modern-web-guidance` skills
- [x] Reverse-engineer `bottcg.com/cards` -> extract `cards.feab7649.json` (2,014 records, 1,166 names, 1,633 prints)
- [x] Reverse-engineer `cdn.bottcg.com` image resolver (module `549330`) & verify 45/45 HTTP 200 OK
- [x] Reverse-engineer `bottcg.com/api/decks/public`, `/api/decks/<uuid>`, Official Deck Code (`รหัสเด็ค`), and `August 2026` Sin-List (`377670`)
- [x] Reverse-engineer `tcgthailand.com` (`api.tcgthailand.com/api/v1` + `X-Api-Key` + 35 set UUIDs + Nuxt SSR schema)
- [x] Persist `SKILL.md`, `.agent/skills/bot-collection-architect/SKILL.md`, and `plans/01..03`

## Phase 2: Core Data Engine, Market Price Proxy & Importers (Hydrogen)
- [x] Bootstrap Next.js App Router + TypeScript + Tailwind CSS + Vitest + Playwright
- [x] Create `scripts/sync-cards.ts` to sync `cards-catalog.json` (2,014 records) & `initial-prices.json` (1,068 TCG Thailand SKU prices)
- [x] Implement `src/lib/types.ts` & `src/lib/catalog.ts` (3-level hierarchy `CardConcept` / `CardPrint` / `CardVariant` + CDN image resolver)
- [x] Implement `src/lib/playset-engine.ts` (Playset 4/1 rule + Unlimited Surplus + 4-pillar analytics calculations)
- [x] Implement `src/data/banlist.json` & `src/lib/sin-list-validator.ts` (Main 50, Only #1, Life 5 unique, Side <= 10, `ลำเอียง`, Sin-List Ban/Limit/Pair/Conditional)
- [x] Implement `src/lib/deck-importer.ts` (URL/UUID, Official Deck Code, Thai/Print Recipe text, JSON/CSV + Cross-Print/Exact-Print Gap & Budget/Bling analysis)
- [x] Implement `src/lib/backup.ts` (Zod-validated JSON & CSV Collection/Deck Import & Export)
- [x] Implement Next.js Route Handlers (`/api/catalog`, `/api/market/tcgthailand`, `/api/decks/public`, `/api/decks/[uuid]`, `/api/sync`) + Cloudflare Pages Functions (`functions/api/*`) + D1 database (`my-bot-collection-db`)
- [x] Implement Dexie.js IndexedDB client store (`src/lib/db.ts`) & Cross-Device Cloud Sync (`src/components/CloudSyncModal.tsx`)

## Phase 3: High-FPS Responsive Binder UI & Analytics Dashboard (Hydrogen)
- [x] Configure responsive layout, theme toggle (Light/Dark), mobile bottom bar, PWA manifest, and `aspect-[249/339]` CLS-free cards
- [x] Build Interactive Binder (`src/components/binder/`) with `@tanstack/react-virtual`, full filters, vibrant/grayscale states, unlimited `+`/`−`/input steppers, and Rarity & TCG Thailand Price Drawer
- [x] Build Competitive Deck Importer & Validator (`src/components/decks/`) with Public Deck Explorer, Text/URL/File Importer, Sin-List Diagnostics, and Smart Gap + Shopping List
- [x] Build 4-Pillar Analytics Dashboard (`src/components/analytics/`) with Recharts graphs (Set/SOI/Color/Rarity Completion, Portfolio & Surplus Trade Valuation, Cost/Gem Curve & Budget vs. Bling Simulator, Shareable Hunting/Trade Sheet + Backup)

## Verification Gates & Deployment
- [x] `npx tsc --noEmit` -> 0 errors
- [x] `npm run lint` -> 0 errors, 0 warnings
- [x] `npm run build` & `npm run build:cf` -> 100% production build success
- [x] `npm run test` (Vitest) -> 10/10 unit tests passing
- [x] `npx playwright test` (Playwright E2E) -> passed with 0 console errors
- [x] Deploy live to Cloudflare Pages (`https://my-bot-collection.pages.dev`) with D1 cross-device sync verified live
- [x] Push complete repository to GitHub (`rat12-web/my-bot-collection`)
