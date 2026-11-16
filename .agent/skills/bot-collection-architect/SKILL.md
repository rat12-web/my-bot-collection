---
name: bot-collection-architect
description: Domain rules, data schemas, reverse-engineering targets, deck legality engine, collection playset analytics, and TCG Thailand price integration specifications for the My BOT Collection (Battle of Talingchan TCG) web application. Load this skill FIRST whenever planning, reverse-engineering, coding, or testing My BOT Collection.
---

# My BOT Collection — Master Domain & Architecture Skill

> **Empirically Verified via REA on 2026-11-16** — see `SKILL.md` in workspace root and `plans/01-rea-evidence-report.md` for full wire traces.

## 1. Domain Rules (Battle of Talingchan Official Standards)

### 1.1 Card Identity vs. Name Playset Rule (CRITICAL)
- **Catalog Scale (Verified Live):** `https://cdn.bottcg.com/data/cards.feab7649.json` serves **2,014** variant records across **1,633** unique `print` codes and **1,166** unique `name` concepts across **39** set codes.
- **Hierarchy (3 Levels):**
  1. `CardConcept` (grouped by exact `name`): Governs gameplay copy limits and Playset Completion.
  2. `CardPrint` (grouped by `print`, e.g., `BT11-001`, `SD01-005`, `RM01-001`): Specific set release; image served at `https://cdn.bottcg.com/cards/{subfolder}/{print}[-{rare}].png`.
  3. `CardVariant` (`print` + `rare` + `finish`): Specific collector SKU (`C`, `R`, `SR`, `UR`, `PR`, `CBR`, `SCR`, `USEC` × `Standard` / `Foil` / `1st Edition`).
- **Playset Target & Unlimited Over-Collection Rule:**
  - Standard cards (`Avatar`, `Magic`, `Construct`): **Playset Target = 4 copies per `name`**, UNLESS `ex === "Only #1"` or `customLimit` is specified.
  - Cards with `Only #1` have a **Target = 1 copy**.
  - `Life` cards have a **Target = 1 copy per `name`**.
  - **No Upper Bound on Ownership:** `qtyOwned` can exceed 4 (e.g., 5, 12, 50+). Always compute:
    - `playsetFilled = Math.min(totalOwnedByName, targetByName)`
    - `missingForPlayset = Math.max(0, targetByName - totalOwnedByName)`
    - `surplusCopies = Math.max(0, totalOwnedByName - targetByName)`

### 1.2 CDN Image Resolution (`cdn.bottcg.com`)
- Subfolders: `SD09 -> 123v1k1`, `RM01 -> 0aslabe`, `BT12 -> thankyoupnes`, `B2SA -> thankyoupnes`, `B2SB -> thankyoupnes`.
- Rarity filename suffix (`{print}-{rare}.png`): applied when `rare` is in `["SCR", "PR", "CBR"]` OR `setCode` is in `["B2SA", "B2SB"]`.

### 1.3 Tournament Deck & Sin-List ("การ์ดบาป", `August 2026`, `2026.08.01`)
- **Main Deck:** 50 cards (`Avatar`, `Magic`, `Construct`), mandatory 1 `Only #1`.
- **Life Deck:** 5 `Life` cards with distinct `name`s.
- **Side Deck:** 0–10 regular cards (+ optional 1 `Only #1` in official `bottcg.com` rules; `Life`/`Token` prohibited; `Main + Side` <= 4 per `name`).
- **Illegal Symbols:** `ex === "ลำเอียง"` is banned (`โดนใจ` is legal).
- **Sin-List Rules (`src/data/banlist.json`):** `BANNED`, `LIMITED` (max 1 & max 2), `CHOICE_PAIR_BAN` (4 pairs), and `CONDITIONAL` (`เมียพระอิศวร`, `ดาบศักดิ์สิทธิ์ เอกซ์คาลิเบอร์`, `สัญญาเลือด`).

## 2. Market Integration (`api.tcgthailand.com/api/v1` & `bottcg.com/api/prices`)
- **Primary Market API:** `https://api.tcgthailand.com/api/v1/member/products/search` with `X-Api-Key: b3f1c8d7-7c8e-4a1f-bc89-4fd0d8c216f3` and `category_ids=0768f1bf-ae5c-44ac-b3b1-3212d4296f3a`.
- **Search Gotcha (Verified):** `search` matches **card `name`** (Thai), NOT `product_code` (`BT09-033` returns `[]` while `ความเจริญ` returns all prints/rarities). For set-level scraping, use `set_ids=<uuid>&page_size=200`.
- **Cache & Rate Limit:** Server-side proxy (`/api/market/tcgthailand`) with 6–12h TTL cache, rate limiting, and `bottcg.com/api/prices` secondary fallback.
