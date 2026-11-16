---
name: bot-collection-architect
description: Complete empirically verified domain skill, reverse-engineered API specifications, 3-level card hierarchy schema, Playset & Unlimited Surplus math engine, August 2026 Sin-List validator, and TCG Thailand market pricing connector for the My BOT Collection (Battle of Talingchan TCG) production web application.
---

# My BOT Collection — Production Domain & Architecture Skill

> **Verification Date:** 2026-11-16 (Empirical Reverse-Engineering via REA against live `bottcg.com` and `tcgthailand.com`)

---

## 1. Domain Rules (Battle of Talingchan Official Standards)

### 1.1 Card Identity vs. Name Playset Rule (CRITICAL)
- **Live Catalog Endpoint:** `https://cdn.bottcg.com/data/cards.feab7649.json` (discovered in Next.js chunk `/_next/static/immutable/chunks/1xiyee9nkpzg7.js`, module `269362`).
  - Dynamic discovery rule: Fetch `https://bottcg.com/cards`, inspect `/_next/static/immutable/chunks/*.js`, match `https://cdn\.bottcg\.com/data/cards\.[a-f0-9]+\.json`, fallback to `cards.feab7649.json`.
- **Verified Live Scale (2026-11-16):**
  - **2,014** variant records (`print` + `rare` combinations)
  - **1,633** unique `print` codes (`CardPrint`)
  - **1,166** unique `name` concepts (`CardConcept`)
  - **39** set prefixes: `SD01`–`SD09`, `BT01`–`BT12`, `CC01`, `CC02`, `ODY1`, `PRE0`, `PRMO`, `STOR`, `SL01`, `SL02`, `KD00`–`KD04`, `FPRO`, `RM01`, `APFD`, `B2SA`, `B2SB`.
  - **19 Raw JSON Fields:** `name`, `type` (`Avatar` | `Magic` | `Life` | `Construct` | `Token`), `soi` (`0` | `1` | `2` | `3`, where `0` = `"อัดมั่ว"`), `print`, `rare` (`C` | `R` | `SR` | `UR` | `PR` | `CBR` | `SCR` | `USEC`), `mainEffect`, `cost`, `gem`, `power`, `symbol` (22 symbols), `color` (`แดง` | `ฟ้า` | `ม่วง` | `เขียว`), `dropRate`, `ex` (`"Only #1"` | `"โดนใจ"` | `"ลำเอียง"`), `subtype` (`Normal` | `Modification` | `React` | `Land`), `favorText`, `customLimit`, `creator`, `gemColor`, `hashtagText`.
- **3-Level Collector Hierarchy:**
  1. `CardConcept` (keyed by exact `name`): Governs gameplay copy limits and Playset Completion.
  2. `CardPrint` (keyed by `print`, e.g., `BT11-001`, `SD01-005`, `RM01-001`): Specific set print; governs Master Set print tracking.
  3. `CardVariant` (keyed by `print` + `rare` + `finish`): Specific collector SKU (`C`, `R`, `SR`, `UR`, `PR`, `CBR`, `SCR`, `USEC` × `Standard` / `Foil` / `1st Edition` (`F1RST` / `UNLIMIT`)).
- **Playset Target & Unlimited Over-Collection Rule:**
  - Standard cards (`Avatar`, `Magic`, `Construct`): **Playset Target = 4 copies per `name`** (or `customLimit` if defined).
  - Cards with `ex === "Only #1"`: **Playset Target = 1 copy per `name`**.
  - `Life` cards (`type === "Life"`): **Playset Target = 1 copy per `name`** (since a Life Deck requires 5 distinct `Life` names).
  - `Token` cards (`type === "Token"`): Excluded from deck construction (playable target = `0` for tournament decks, tracked as collectible extras).
  - **No Upper Bound on Ownership:** `qtyOwned` can be any non-negative integer (`0, 1, 4, 5, 12, 30, 100+`). Always compute:
    - `playsetFilled = Math.min(totalOwnedByName, playsetTarget)`
    - `missingForPlayset = Math.max(0, playsetTarget - totalOwnedByName)`
    - `surplusCopies = Math.max(0, totalOwnedByName - playsetTarget)` (used for Trade Binder & Surplus Valuation).

### 1.2 Verified CDN Card Image Resolver (`cdn.bottcg.com` — module `549330`)
Tested 45/45 HTTP 200 OK across sets and special rarities:
```ts
const CDN_BASE = "https://cdn.bottcg.com/cards";
const RARITY_SUFFIX_RARES = ["SCR", "PR", "CBR"];
const RARITY_SUFFIX_SETS = new Set(["B2SA", "B2SB"]);
const SET_SUBFOLDERS: Record<string, string> = {
  SD09: "123v1k1",
  RM01: "0aslabe",
  BT12: "thankyoupnes",
  B2SA: "thankyoupnes",
  B2SB: "thankyoupnes",
};

export function resolveCardImageUrl(print: string, rare?: string): string {
  const setCode = print.split("-")[0];
  const folder = SET_SUBFOLDERS[setCode]?.replace(/^\/+|\/+$/g, "");
  const baseUrl = folder ? `${CDN_BASE}/${folder}` : CDN_BASE;
  const filename =
    rare && (RARITY_SUFFIX_RARES.includes(rare) || RARITY_SUFFIX_SETS.has(setCode))
      ? `${print}-${rare}`
      : print;
  return `${baseUrl}/${filename}.png`;
}
```
Append `?cors_img=1` when drawing into `<canvas>` for shareable Trade/Hunting Sheet PNG export.

### 1.3 Tournament Deck & Official Sin-List ("การ์ดบาป") Rules (`August 2026`, `2026.08.01`)
Extracted directly from `bottcg.com` module `377670`:
- **Main Deck:** Exactly 50 cards (`Avatar`, `Magic`, `Construct`; `Life` and `Token` prohibited).
- **Mandatory `Only #1`:** Exactly 1 `Only #1` card in Main Deck for tournament readiness.
- **Life Deck:** Exactly 5 `Life` cards; all 5 must have distinct `name`s (`type === "Life"` only).
- **Side Deck:** 0–10 regular cards + up to 1 `Only #1` card (max 10 regular / max 11 total in `bottcg.com` builder; strictly 0–10 for standard Best-of-3 enforcement; `Life` and `Token` prohibited; `Main + Side` combined cannot exceed copy limits per `name`).
- **Banned Symbols:** Cards with `ex === "ลำเอียง"` (or `SAMPLE` watermark) are illegal in standard tournaments (`ex === "โดนใจ"` is legal).
- **Official Sin-List Rules (`src/data/banlist.json`, effective `2026-08-01`):**
  - `BANNED` (0 copies in `main` + `side`): `ครูแกง สอนเลข`, `ไสยเวท ย้อนกลับ`, `ช็อตกัน นัยนาวุธ`, `ขวานเงิน`, `ล้มโต๊ะ`.
  - `LIMITED` Max 1 (`main` + `side`): `ริกกี้ นักปลอมแปลง`, `เจ้ากล้าดียังไง`, `กฎร้าน`, `แอสการ์ดคือสถานที่ไม่ใช่ผู้คน`, `SD Plaza สายเหนือเก่า`, `นายนิรยบาล ตัวใหญ่พิเศษ`, `น้ำซุปชาบู`, `มนุษย์ดัดแปลง`, `พญายักษ์ ทศกัณฑ์`, `ลุ้นเยี่ยวเหนียว`, `ไม้เกาหลัง`, `Micro Plaza สะพานพลาสติก`.
  - `LIMITED` Max 2 (`main` + `side`): `ชายจากอนาคต`, `ความเจริญ`, `ลูกแม่ศรีนวล`, `การสละชีพของเทพธิดา`, `แมลงปอมีพิษ`, `ไอ นีด เมดิก`, `กุมภกรรณ ทดน้ำ`, `เพื่อชาติ`, `อีช่า - สาวน้อยคนเก่ง`, `เลือกมันสำหรับพวก จน !!!`, `เจค นักฆ่ามือเก๋า`, `งี่เง่า และ งอแง`, `โคลัมบัส นักท่องเรือ`, `อาเธอร์ ราชาแห่งอัศวินโต๊ะกลม`, `อุบัติเหตุ!!!`, `พระนารายณ์ เทพผู้พิทักษ์`, `ไปเลยมอนตี้`, `พี่หน่วง พิธีกรผมสวย`, `มยุราซัง ไอดอลยุค 80`.
  - `CHOICE_PAIR_BAN` (cannot include both across `main` + `side`):
    1. `เจ้ากล้าดียังไง` <-> `ริกกี้ นักปลอมแปลง`
    2. `พี่หน่วง พิธีกรผมสวย` <-> `เลือกมันสำหรับพวก จน !!!`
    3. `จอมเวทย์ กาลู` <-> `โคกอีสานนูน`
    4. `หมู่บ้านเห็ด` <-> `คาถา เสกควายเข้าท้อง`
  - `CONDITIONAL` (custom synergy constraints):
    1. `เมียพระอิศวร`: Every other `Avatar` in Main and Side must have `symbol === "เทพ"` or reference `symbol เทพ` / `{เทพ}` in `mainEffect`.
    2. `ดาบศักดิ์สิทธิ์ เอกซ์คาลิเบอร์`: Every `Avatar` in Main and Side must include `"อัศวินโต๊ะกลม"` in `name` or `mainEffect` (or empty `mainEffect`).
    3. `สัญญาเลือด`: The `Only #1` card in Main/Side must have `symbol === "นรก"`.

---

## 2. Verified External APIs & Server Proxies

### 2.1 Target A — `bottcg.com` Public Decks & Price Bridge
- **Public Decks Listing:** `GET https://bottcg.com/api/decks/public?sort=newest&limit=20&offset=0&includeCards=false`
  - Supported `sort`: `newest`, `likes`, `trending`, `trending-week`, `trending-month`, `views`.
  - Optional filters: `colors`, `symbols`, `deckname`, `coverCard` (`print:rare`).
- **Single Deck Detail:** `GET https://bottcg.com/api/decks/<uuid>`
  - Returns `{ success: true, deck: { id, uuid, name, coverCardPrint, coverCardRare, cards, lifeCards, sideCards, isValid, violations, user } }`.
- **Official Deck Code Format (`รหัสเด็ค`):**
  - Section headers `# Main Deck`, `# Life Cards`, `# Side Deck` with lines formatted as `<qty>x <print>-<rare>`.
- **Secondary Official Price Bridge:** `GET https://bottcg.com/api/prices?cardId=<cardId>`
  - Key transformer: `print.startsWith("PRMO") ? "PRMO-" + print.split("-")[1] : rare === "C" ? print : rare === "SEC" ? print + "-SCR" : print + "-" + rare`
  - Returns `{ success: true, data: { [cardId]: { productId, price, lastSold } } }`.

### 2.2 Target B — TCG Thailand Market API (`api.tcgthailand.com/api/v1`)
Extracted from `https://www.tcgthailand.com/_nuxt/edifKHGB.js` and `window.__NUXT__.config.public`:
- **Never call directly from browser client** — always route through Next.js Route Handler `/api/market/tcgthailand` with server-side cache (TTL 6–12h), rate-limiter, and retry backoff.
- **Base API:** `https://api.tcgthailand.com/api/v1`
- **Required Header:** `X-Api-Key: b3f1c8d7-7c8e-4a1f-bc89-4fd0d8c216f3` (with auto-refresh scraper reading `window.__NUXT__.config.public.xApiKey` from `https://www.tcgthailand.com/product?category_ids=0768f1bf-ae5c-44ac-b3b1-3212d4296f3a` if 401 occurs).
- **Category ID (Battle of Talingchan):** `0768f1bf-ae5c-44ac-b3b1-3212d4296f3a` (35 sets, 2,117+ products).
- **Search by Card Name:**
  `GET /member/products/search?category_ids=0768f1bf-ae5c-44ac-b3b1-3212d4296f3a&search=<cardName>&page=1&page_size=50`
  - *Important REA Finding:* TCG Thailand's `search` parameter matches `name` (Thai card name) and returns `[]` for print codes like `BT09-033`. Always query by `name` (or `set_ids` UUID for full-set batch sync) and match returned `product_code` + `rarity` (`SEC` <-> `SCR`).
- **Batch Sync by Set UUID:**
  `GET /member/products/search?category_ids=0768f1bf-ae5c-44ac-b3b1-3212d4296f3a&set_ids=<setUuid>&page=1&page_size=200`
- **Seller Listings (Optional Deep View):**
  `GET /member/products/<productUuid>/stocks?page=1&page_size=20`
- **Direct Product & Search URLs:**
  - Product URL: `https://www.tcgthailand.com/product/${productId}`
  - Search URL: `https://www.tcgthailand.com/product?category_ids=0768f1bf-ae5c-44ac-b3b1-3212d4296f3a&search=${encodeURIComponent(cardName)}`

---

## 3. Core Engineering Standards & Modules

1. **Client Persistence:** Dexie.js (IndexedDB) storing `collection` (`variantKey` -> `qtyOwned`, `finish`, `updatedAt`), `decks` (imported/custom tournament decks), `priceCache`, and `settings`.
2. **Performance (60fps Binder):** `@tanstack/react-virtual` virtual grid + `aspect-[249/339]` reserved image boxes + dynamic viewport `dvh` mobile-first layout.
3. **4-Pillar Analytics:** Playset vs. Master Set completion, Portfolio & Surplus Trade Valuation, Deck Cost/Gem Curve & Budget vs. Bling Simulator, and Shareable Hunting/Trade Sheet + Zod-validated JSON/CSV backup.
4. **Verification Gates:** `npx tsc --noEmit`, `npm run lint`, `npm run build`, Vitest unit tests, and Playwright E2E tests must all pass cleanly.
