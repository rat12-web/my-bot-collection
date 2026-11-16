# My BOT Collection

Production-grade web application and collector workbench for **Battle of Talingchan (BOT TCG)** — built with Next.js (App Router), TypeScript, Tailwind CSS, Dexie.js (IndexedDB), TanStack Virtual, Recharts, Vitest, Playwright, and Cloudflare Pages + D1 Cross-Device Cloud Sync.

🌐 **Live Web App (Cloudflare Pages):** https://my-bot-collection.pages.dev

## Features
1. **Official Card Catalog Sync (`scripts/sync-cards.ts` & `/api/catalog`):**
   - Syncs all **2,014** card variants across **1,633** print codes and **1,166** unique card names from `bottcg.com` (`cards.<hash>.json`), resolving official `cdn.bottcg.com` artwork including subfolder & rarity suffix rules (`SD09`, `RM01`, `BT12`, `B2SA`, `B2SB`, `SCR`, `PR`, `CBR`).
2. **Playset & Unlimited Surplus Engine + Cross-Device Cloud Sync:**
   - Standard cards target **4 copies per card `name`**; `Only #1` and `Life` cards target **1 copy per `name`**.
   - Supports unlimited ownership (`5, 10, 30+` copies), automatically computing `playsetFilled`, `missingForPlayset`, and `surplusCopies` for trade/sale planning.
   - Offline-first IndexedDB (`Dexie.js`) paired with **Cloudflare D1 Cross-Device Sync** (`/api/sync`) so players can save and resume their collection & decks seamlessly across mobile and desktop using a Sync Key or shareable URL (`/?sync=<key>`).
3. **TCG Thailand Market Price Connector (`/api/market/tcgthailand`):**
   - Server-side proxy querying `api.tcgthailand.com/api/v1` with persistent cache (8h TTL), rate limiting, retry backoff, and direct links to `tcgthailand.com/product/<id>`.
4. **Competitive Deck Importer & August 2026 Sin-List Validator:**
   - Imports from `bottcg.com/decks/<uuid>` URLs, public deck browser (`/api/decks/public`), Thai/Print Deck Recipe text, official `# Main Deck` / `# Life Cards` / `# Side Deck` Deck Codes, and JSON/CSV files.
   - Enforces tournament legality (Main 50, mandatory 1 `Only #1`, 5 unique `Life`, Side <= 10 with no `Life`, `Main+Side <= 4`, `ลำเอียง` symbol check) + complete August 2026 Sin-List (`BANNED`, `LIMITED`, `CHOICE_PAIR_BAN`, and `CONDITIONAL` rules).
   - Smart Deck Gap Check supporting both **Cross-Print** and **Exact-Print** matching with **Budget vs. Bling** THB cost estimation.
5. **4-Pillar Analytics Dashboard & Portable Backups:**
   - Playset vs. Master Set completion across Sets, SOI 1–4, Colors, and Rarities.
   - Portfolio & Surplus Trade Valuation (THB).
   - Deck Cost Curve (`0–10+`), Gem Distribution (`0–4`), and Budget vs. Bling simulator.
   - Shareable Hunting & Surplus Trade post + PNG summary generator, plus Zod-validated JSON & CSV backups.

## Quick Start

```bash
npm install
npm run sync-cards
npm run dev
```

## Verification Commands

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run test
npx playwright test
```
