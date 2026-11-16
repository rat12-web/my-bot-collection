# Phase 1: Reverse-Engineering Anything (REA) Empirical Evidence Report

**Inspection Date:** 2026-11-16  
**Inspecting Agent:** Argon 4 (`bot-collection-architect` + `reverse-engineer-anything` methodology)  
**Targets Inspected:**
1. `https://bottcg.com/cards`, `https://bottcg.com/decks/public`, `https://bottcg.com/decks/<uuid>`
2. `https://www.tcgthailand.com/product?category_ids=0768f1bf-ae5c-44ac-b3b1-3212d4296f3a`

---

## 1. Target 1: Official Battle of Talingchan Database & Deck Portal (`bottcg.com`)

### 1.1 Card Catalog Database (`cards.<hash>.json`)
- **Discovery Source:** `https://bottcg.com/cards` HTML -> Next.js Turbopack chunk `/_next/static/immutable/chunks/1xiyee9nkpzg7.js` (module `269362` & `772822`).
- **Active Verified URL:** `https://cdn.bottcg.com/data/cards.feab7649.json` (HTTP `200 OK`).
- **Empirical Dataset Telemetry (measured directly from live JSON):**
  - **Total Variant Records (`CardVariant`):** `2,014`
  - **Unique `name` Concepts (`CardConcept`):** `1,166`
  - **Unique `print` Codes (`CardPrint`):** `1,633`
  - **All 19 Observed Fields:**
    - `name`: string (Thai card name)
    - `type`: `"Avatar" | "Magic" | "Life" | "Construct" | "Token"`
    - `soi`: `0 | 1 | 2 | 3` (`0` is rendered as `"อัดมั่ว"`)
    - `print`: string (e.g., `"SD01-001"`, `"BT12-076"`, `"B2SA-008"`)
    - `rare`: `"C" | "R" | "SR" | "UR" | "PR" | "CBR" | "SCR" | "USEC"`
    - `mainEffect`: string (supports markup tags `[Link ...]`, `[คู่หู - ...]`, `{symbol ...}`, `{mod}`, `{magic}`, `{react}`, `{land}`, `{only}`, `<red>...</red>`, `<partner>...</partner>`)
    - `cost`: number
    - `gem`: number (Avatar/Construct only)
    - `power`: number (Avatar/Construct only)
    - `symbol`: string (22 symbols: `เทพ`, `ยักษ์`, `จอมเวทย์`, `คน`, `แมลง`, `สัตว์`, `รัททาทุย`, `นรก`, `ผี`, `หุ่นยนต์`, `ทหาร`, `ปลา`, `ต่างชาติ`, `ต้นไม้`, `สิ่งก่อสร้าง`, `เปรต`, `ฤษี`, `เอเลี่ยน`, `กะปอม`, `สัตว์วิเศษ`, `ไซเบอร์`, `มังกร`)
    - `color`: `"แดง" | "ฟ้า" | "ม่วง" | "เขียว"` (optional/absent -> `"ไม่มีสี"`)
    - `dropRate`: string (e.g., `"2 / กล่อง"`)
    - `ex`: `"Only #1" | "โดนใจ" | "ลำเอียง"` (optional)
    - `subtype`: `"Normal" | "Modification" | "React" | "Land"` (Magic only)
    - `favorText`: string (optional)
    - `customLimit`: number (optional)
    - `creator`: string (artist name, optional)
    - `gemColor`: string (optional)
    - `hashtagText`: string (optional)
  - **39 Observed Set Prefixes:**
    `SD01`, `SD02`, `SD03`, `SD04`, `SD05`, `SD06`, `SD07`, `SD08`, `SD09`, `BT01`, `BT02`, `BT03`, `BT04`, `BT05`, `BT06`, `BT07`, `BT08`, `BT09`, `BT10`, `BT11`, `BT12`, `CC01`, `CC02`, `ODY1`, `PRE0`, `PRMO`, `STOR`, `SL01`, `SL02`, `KD00`, `KD01`, `KD02`, `KD03`, `KD04`, `FPRO`, `RM01`, `APFD`, `B2SA`, `B2SB`.

### 1.2 CDN Card Image URL Resolver (`cdn.bottcg.com`)
- **Discovery Source:** Chunk `1xiyee9nkpzg7.js`, module `549330`.
- **Exact Extracted Function:**
  - Base URL: `https://cdn.bottcg.com/cards`
  - Subfolder overrides (`SET_SUBFOLDERS`):
    - `SD09` -> `123v1k1`
    - `RM01` -> `0aslabe`
    - `BT12` -> `thankyoupnes`
    - `B2SA` -> `thankyoupnes`
    - `B2SB` -> `thankyoupnes`
  - Rarity filename suffix (`{print}-{rare}.png`): applied when `rare` is `"SCR"`, `"PR"`, or `"CBR"`, OR when `setCode` is `"B2SA"` or `"B2SB"`.
  - Optional CORS query parameter for `<canvas>` rendering: `?cors_img=1`.
- **Live Verification Result:** Sampled 45 distinct sets & special rarities (`HEAD` requests) -> **45/45 HTTP 200 OK (0 failures)**.

### 1.3 Public Decks & Deck Detail API + Official Deck Code
- **Discovery Source:** `https://bottcg.com/decks/public` -> chunks `25v51x_j4isrq.js` (module `685892`), `2pc3s9s6duylq.js` (module `433119`), `16i_e4r90d187.js`.
- **Public Decks List Endpoint:**
  - `GET https://bottcg.com/api/decks/public?sort=newest&limit=20&offset=0&includeCards=false`
  - Valid `sort`: `newest`, `likes`, `trending`, `trending-week`, `trending-month`, `views`.
  - Optional query params: `colors`, `symbols`, `deckname`, `coverCard` (`print:rare`), `includeCards=true|false`.
- **Single Deck Detail Endpoint (Verified Live with `QtS3zF9eXk`):**
  - `GET https://bottcg.com/api/decks/QtS3zF9eXk` -> HTTP `200 OK`.
  - Schema: `{ success: true, deck: { id, uuid, userId, name, coverCardPrint, coverCardRare, cards: [{ rare, print, colorId, quantity, symbolId }], lifeCards: [{ rare, print }], sideCards: [{ rare, print, quantity }], isPublic, description, tags, likesCount, viewsCount, createdAt, updatedAt, user } }`.
- **Official Deck Code ("รหัสเด็ค") Format (module `433119`):**
  ```text
  # <Deck Name>

  # Main Deck
  <qty>x <print>-<rare>

  # Life Cards
  1x <print>-<rare>

  # Side Deck
  <qty>x <print>-<rare>
  ```

### 1.4 Official Banlist / Sin-List Engine (`August 2026`, `2026.08.01`)
- **Discovery Source:** Chunk `3nhu6_z8vdw7u.js`, module `377670`.
- **Extracted Rules:**
  - `ban` (0 copies in `main` + `side`): `ครูแกง สอนเลข`, `ไสยเวท ย้อนกลับ`, `ช็อตกัน นัยนาวุธ`, `ขวานเงิน`, `ล้มโต๊ะ`.
  - `limit` max 1 (`main` + `side`): `ริกกี้ นักปลอมแปลง`, `เจ้ากล้าดียังไง`, `กฎร้าน`, `แอสการ์ดคือสถานที่ไม่ใช่ผู้คน`, `SD Plaza สายเหนือเก่า`, `นายนิรยบาล ตัวใหญ่พิเศษ`, `น้ำซุปชาบู`, `มนุษย์ดัดแปลง`, `พญายักษ์ ทศกัณฑ์`, `ลุ้นเยี่ยวเหนียว`, `ไม้เกาหลัง`, `Micro Plaza สะพานพลาสติก`.
  - `limit` max 2 (`main` + `side`): `ชายจากอนาคต`, `ความเจริญ`, `ลูกแม่ศรีนวล`, `การสละชีพของเทพธิดา`, `แมลงปอมีพิษ`, `ไอ นีด เมดิก`, `กุมภกรรณ ทดน้ำ`, `เพื่อชาติ`, `อีช่า - สาวน้อยคนเก่ง`, `เลือกมันสำหรับพวก จน !!!`, `เจค นักฆ่ามือเก๋า`, `งี่เง่า และ งอแง`, `โคลัมบัส นักท่องเรือ`, `อาเธอร์ ราชาแห่งอัศวินโต๊ะกลม`, `อุบัติเหตุ!!!`, `พระนารายณ์ เทพผู้พิทักษ์`, `ไปเลยมอนตี้`, `พี่หน่วง พิธีกรผมสวย`, `มยุราซัง ไอดอลยุค 80`.
  - `conditional` pairs (`main` + `side`):
    - `เจ้ากล้าดียังไง` <-> `ริกกี้ นักปลอมแปลง`
    - `พี่หน่วง พิธีกรผมสวย` <-> `เลือกมันสำหรับพวก จน !!!`
    - `จอมเวทย์ กาลู` <-> `โคกอีสานนูน`
    - `หมู่บ้านเห็ด` <-> `คาถา เสกควายเข้าท้อง`
  - `custom` checks: `เมียพระอิศวร`, `ดาบศักดิ์สิทธิ์ เอกซ์คาลิเบอร์`, `สัญญาเลือด`.

### 1.5 `bottcg.com` Built-in Price Proxy (`/api/prices`)
- **Discovery Source:** Chunk `3nhu6_z8vdw7u.js` (module `560484` & `316290`).
- **Key Formatter (`cardId`):**
  - `PRMO-xxx` -> `PRMO-xxx`
  - `rare === "C"` -> `${print}`
  - `rare === "SEC"` -> `${print}-SCR`
  - Other -> `${print}-${rare}`
- **Live Test:** `GET https://bottcg.com/api/prices?cardId=BT01-001-UR` -> HTTP `200 OK`: `{"success":true,"data":{"BT01-001-UR":{"productId":"34f2da80-acf1-4ae2-b432-c20ced2e50b2","price":100,"lastSold":200}}}`. Returns `data: {}` for some newer prints (hence TCG Thailand direct API is the primary live price source).

---

## 2. Target 2: TCG Thailand Marketplace (`tcgthailand.com`)

### 2.1 SSR & API Architecture
- **Technology Stack:** Nuxt 3 SSR (`__NUXT_DATA__`) backed by REST API `https://api.tcgthailand.com/api/v1`.
- **Extracted Public Client Config (`window.__NUXT__.config.public` & `/_nuxt/edifKHGB.js`):**
  - `baseApi`: `"https://api.tcgthailand.com/api/v1"`
  - `xApiKey`: `"b3f1c8d7-7c8e-4a1f-bc89-4fd0d8c216f3"`
  - `category_ids` (Battle of Talingchan): `"0768f1bf-ae5c-44ac-b3b1-3212d4296f3a"` (35 sets, 2,117+ products).
- **Authentication Probe Result:**
  - Request without `X-Api-Key` -> HTTP `401 {"status_code":401,"error_code":"UNAUTHORIZED","message":"Invalid API key"}`.
  - Request with `X-Api-Key: b3f1c8d7-7c8e-4a1f-bc89-4fd0d8c216f3` -> HTTP `200 OK` JSON with zero Cloudflare challenge!

### 2.2 Verified Product Search & Listing Endpoints
1. **Product Search / Set Sync:**
   - `GET https://api.tcgthailand.com/api/v1/member/products/search`
   - Supported query params: `category_ids`, `set_ids`, `rarity_ids`, `search`, `page`, `page_size` (tested working up to `page_size=100+`), `sort`, `group_by_product`.
   - **CRITICAL EMPIRICAL GOTCHA:** The `search` parameter searches by **Thai card `name`** (e.g., `search=ความเจริญ` -> HTTP 200 with 5 variants across `B2SA-008` and `KD04-018`), whereas searching by `product_code` (e.g., `search=BT09-033` or `search=BT01-001`) returns `products: []`!
   - **Solution:** Single-card lookup MUST query `search=<cardName>` and filter returned records by `product_code === card.print` (and rarity `SEC` <-> `SCR` normalization). Bulk set sync MUST query `set_ids=<tcgSetUuid>&page_size=200` (e.g., `BT12` UUID `01a1d3be-9525-7d01-beb8-ff63ff1efa9c` returned all 98 BT12 SKUs in 1 request!).
2. **Product Fields Returned:**
   - `id`: UUID (direct URL: `https://www.tcgthailand.com/product/<id>`)
   - `name`: string (Thai name)
   - `product_code`: string (matches `bottcg.com` `print`, e.g., `"B2SA-008"`, `"BT09-033"`)
   - `set_code`: string (e.g., `"B2SA"`, `"BT09"`)
   - `rarity`: string (`"C"`, `"R"`, `"SR"`, `"UR"`, `"PR"`, `"CBR"`, `"SEC"`, `"-"`)
   - `min_price`: string decimal THB (`"850.00"`, `"40.00"` -> matches UI `"เริ่มต้น ฿..."`)
   - `stock_quantity`: number (matches UI `"จำนวน ..."` across shops)
   - `condition`: string (e.g., `"Near Mint (NM)"`)
   - `printing`: string (`"F1RST"`, `"UNLIMIT"`, `""`)
3. **Individual Shop Stock Endpoint:**
   - `GET https://api.tcgthailand.com/api/v1/member/products/<productUuid>/stocks?page=1&page_size=20`
   - Returns individual shop listings: `condition_name`, `printing_name`, `quantity`, `price`, `shipping_fee`, `shop.name`.

### 2.3 Extracted Battle of Talingchan Set UUID Map (35 Sets)
Verified from `__NUXT_DATA__` on `https://www.tcgthailand.com/product?category_ids=0768f1bf-ae5c-44ac-b3b1-3212d4296f3a`:
- `BT12`: `01a1d3be-9525-7d01-beb8-ff63ff1efa9c`
- `B2SB`: `01a1b442-4e3c-7876-a3b1-e44d15ee7053`
- `B2SA`: `01a1b442-30ec-7ff0-b0c1-944840b18df4`
- `RM01`: `01a124ca-fe3b-78e1-94af-07938849d432`
- `SD09`: `01a09bb1-ed80-7e85-ad4c-7fa932faabbf`
- `BT11`: `019ffe4c-f656-72d6-9056-0e03da7d7ef7`
- `SL02`: `02a00c6b-96a8-4703-964f-9bffa6e3402c`
- `SD08`: `7e58b6c4-2b9e-4d3e-97af-a7867bc2a11b`
- `BT10`: `642ca97a-3163-493e-b906-f2e3e058f43f`
- `KD00`..`KD04`, `BT01`..`BT09`, `SD01`..`SD07`, `CC01`, `CC02`, `SL01`, `ODY1`, `PRMO` (all 35 UUIDs extracted and stored in `src/data/tcgthailand-sets.json`).
