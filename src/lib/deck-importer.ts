import { getTcgThailandSearchUrl, makeVariantKey, RARITY_RANK } from "./catalog";
import { buildOwnedByNameMap, buildOwnedByVariantMap, getVariantMarketPrice } from "./playset-engine";
import { SavedDeckSchema } from "./types";
import type {
  CardVariant,
  CatalogIndex,
  CollectionEntry,
  DeckGapItem,
  DeckGapMatchMode,
  DeckGapReport,
  DeckSlot,
  MarketPriceEntry,
  SavedDeck,
} from "./types";

export interface ParseDeckResult {
  name: string;
  main: DeckSlot[];
  life: DeckSlot[];
  side: DeckSlot[];
  unresolvedLines: string[];
}

function findBestCatalogVariant(
  query: string,
  catalog: CatalogIndex
): CardVariant | undefined {
  const cleaned = query.trim();
  if (!cleaned) return undefined;

  // 1. Exact print-rare pattern e.g. BT09-006-SCR or PRMO-001-PR
  const prMatch = cleaned.match(/^([A-Z0-9]+-\d+)-([A-Z0-9]+)$/i);
  if (prMatch) {
    const print = prMatch[1].toUpperCase();
    let rare = prMatch[2].toUpperCase();
    if (rare === "SEC") rare = "SCR";
    const exact = catalog.variantById.get(makeVariantKey(print, rare));
    if (exact) return exact;
    const printObj = catalog.printByCode.get(print);
    if (printObj) return printObj.primaryVariant;
  }

  // 2. Exact print code e.g. BT01-038
  const upper = cleaned.toUpperCase();
  const printObj = catalog.printByCode.get(upper);
  if (printObj) return printObj.primaryVariant;

  // 3. Exact Thai card name
  const exactConcept = catalog.conceptByName.get(cleaned);
  if (exactConcept) return exactConcept.defaultVariant;

  // 4. Case-insensitive / whitespace-collapsed name match
  const norm = cleaned.replace(/\s+/g, "").toLowerCase();
  for (const concept of catalog.concepts) {
    if (concept.name.replace(/\s+/g, "").toLowerCase() === norm) {
      return concept.defaultVariant;
    }
  }

  // 5. Prefix/partial fallback if unambiguous or longest match
  const partial = catalog.concepts.find((c) =>
    c.name.toLowerCase().includes(cleaned.toLowerCase())
  );
  return partial?.defaultVariant;
}

function pushSlot(list: DeckSlot[], variant: CardVariant, quantity: number) {
  const existing = list.find(
    (s) => s.print === variant.print && s.rare === variant.rare
  );
  if (existing) {
    existing.quantity += quantity;
  } else {
    list.push({
      print: variant.print,
      rare: variant.rare,
      name: variant.name,
      quantity,
    });
  }
}

/**
 * Parses:
 * - Official bottcg.com Deck Code (# Main Deck / # Life Cards / # Side Deck / 4x BT09-006-SCR)
 * - Thai Tournament Deck Recipes ("ความเจริญ 2", "2 ความเจริญ", "4x กุ่ย", "BT01-038 x2")
 */
export function parseDeckRecipeText(
  rawText: string,
  catalog: CatalogIndex,
  defaultName = "Imported Competitive Deck"
): ParseDeckResult {
  const lines = rawText.split(/\r?\n/);
  let deckName = defaultName;
  let currentSection: "auto" | "main" | "life" | "side" = "auto";
  const main: DeckSlot[] = [];
  const life: DeckSlot[] = [];
  const side: DeckSlot[] = [];
  const unresolvedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect section headings (# Main Deck, Main:, Life:, Side Deck:, etc.)
    if (/^(#|\/\/|\[)?\s*(main(\s*deck)?|เด็คหลัก)\s*:?\]?$/i.test(line)) {
      currentSection = "main";
      continue;
    }
    if (/^(#|\/\/|\[)?\s*(life(\s*(cards|deck))?|ไลฟ์(การ์ด)?)\s*:?\]?$/i.test(line)) {
      currentSection = "life";
      continue;
    }
    if (/^(#|\/\/|\[)?\s*(side(\s*deck)?|ไซด์(เด็ค)?)\s*:?\]?$/i.test(line)) {
      currentSection = "side";
      continue;
    }

    if (line.startsWith("#")) {
      const candidateTitle = line.replace(/^#+\s*/, "").trim();
      if (candidateTitle && deckName === defaultName && currentSection === "auto") {
        deckName = candidateTitle;
      }
      continue;
    }

    // Parse quantity + identifier:
    // Patterns:
    // A: "4x BT09-006-SCR" or "4 x ความเจริญ" or "4 ความเจริญ"
    // B: "ความเจริญ x2" or "BT01-038 x2" or "ความเจริญ 2"
    let qty = 1;
    let identifier = line;

    const prefixMatch = line.match(/^(\d+)\s*[x×*]?\s+(.+)$/i);
    const suffixMatch = line.match(/^(.+?)\s+[x×*]?\s*(\d+)$/i);
    const attachedSuffixMatch = line.match(/^(.+?)[x×*](\d+)$/i);

    if (prefixMatch && !/^[A-Z]+\d+-\d+/i.test(line)) {
      qty = Math.max(1, Number(prefixMatch[1]));
      identifier = prefixMatch[2].trim();
    } else if (attachedSuffixMatch) {
      identifier = attachedSuffixMatch[1].trim();
      qty = Math.max(1, Number(attachedSuffixMatch[2]));
    } else if (suffixMatch) {
      identifier = suffixMatch[1].trim();
      qty = Math.max(1, Number(suffixMatch[2]));
    }

    // Remove trailing rarity/set bracket comments like "(2)" or "[SR]" if needed
    identifier = identifier.replace(/\s+\([^)]+\)$/, "").trim();

    const variant = findBestCatalogVariant(identifier, catalog);
    if (!variant) {
      unresolvedLines.push(line);
      continue;
    }

    let targetSection = currentSection;
    if (targetSection === "auto") {
      targetSection = variant.type === "Life" ? "life" : "main";
    }

    if (targetSection === "life") {
      pushSlot(life, variant, qty);
    } else if (targetSection === "side") {
      pushSlot(side, variant, qty);
    } else {
      pushSlot(main, variant, qty);
    }
  }

  return { name: deckName, main, life, side, unresolvedLines };
}

export function formatOfficialDeckCode(deck: {
  name: string;
  main: DeckSlot[];
  life: DeckSlot[];
  side: DeckSlot[];
}): string {
  const lines: string[] = [];
  if (deck.name) {
    lines.push(`# ${deck.name}`, "");
  }
  if (deck.main.length > 0) {
    lines.push("# Main Deck");
    for (const s of deck.main) {
      lines.push(`${s.quantity}x ${s.print}-${s.rare}`);
    }
  }
  if (deck.life.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("# Life Cards");
    for (const s of deck.life) {
      lines.push(`${s.quantity}x ${s.print}-${s.rare}`);
    }
  }
  if (deck.side.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("# Side Deck");
    for (const s of deck.side) {
      lines.push(`${s.quantity}x ${s.print}-${s.rare}`);
    }
  }
  return lines.join("\n");
}

export function extractBottcgDeckUuid(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/bottcg\.com\/(?:api\/)?decks\/([A-Za-z0-9_-]{6,32})/i);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9_-]{8,24}$/.test(trimmed) && !trimmed.includes("-")) {
    return trimmed;
  }
  return null;
}

export interface BottcgDeckPayload {
  uuid: string;
  name: string;
  cards?: { print: string; rare: string; quantity: number }[];
  lifeCards?: { print: string; rare: string; quantity?: number }[];
  sideCards?: { print: string; rare: string; quantity: number }[];
}

export function normalizeBottcgDeck(
  payload: BottcgDeckPayload,
  catalog: CatalogIndex
): SavedDeck {
  const resolveSlot = (raw: { print: string; rare: string; quantity?: number }): DeckSlot => {
    const rare = raw.rare === "SEC" ? "SCR" : raw.rare || "C";
    const variant =
      catalog.variantById.get(makeVariantKey(raw.print, rare)) ??
      catalog.printByCode.get(raw.print)?.primaryVariant;
    return {
      print: raw.print,
      rare: variant?.rare || rare,
      name: variant?.name || raw.print,
      quantity: raw.quantity ?? 1,
    };
  };

  const now = Date.now();
  return {
    id: `bottcg-${payload.uuid}`,
    name: payload.name || `Deck ${payload.uuid}`,
    sourceType: "bottcg",
    sourceUrl: `https://bottcg.com/decks/${payload.uuid}`,
    main: (payload.cards ?? []).map(resolveSlot),
    life: (payload.lifeCards ?? []).map((c) => resolveSlot({ ...c, quantity: c.quantity ?? 1 })),
    side: (payload.sideCards ?? []).map(resolveSlot),
    createdAt: now,
    updatedAt: now,
  };
}

export function parseDeckImportJsonOrCsv(
  content: string,
  catalog: CatalogIndex
): SavedDeck {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
    const valid = SavedDeckSchema.safeParse(candidate);
    if (valid.success) {
      return valid.data;
    }
    // Try bottcg raw JSON shape
    if (candidate && Array.isArray(candidate.cards)) {
      return normalizeBottcgDeck(
        {
          uuid: candidate.uuid || `json-${Date.now()}`,
          name: candidate.name || "Imported JSON Deck",
          cards: candidate.cards,
          lifeCards: candidate.lifeCards,
          sideCards: candidate.sideCards,
        },
        catalog
      );
    }
    throw new Error("Invalid JSON deck structure");
  }

  // CSV format: section,name,print,rare,quantity
  const rows = trimmed.split(/\r?\n/).filter(Boolean);
  const main: DeckSlot[] = [];
  const life: DeckSlot[] = [];
  const side: DeckSlot[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && (cols[0].toLowerCase() === "section" || cols[0].toLowerCase() === "name")) {
      continue;
    }
    const section = cols[0]?.toLowerCase();
    if (section === "main" || section === "life" || section === "side") {
      const nameOrPrint = cols[1] || cols[2];
      const rare = cols[3] || "C";
      const qty = Math.max(1, Number(cols[4] ?? 1));
      const v =
        catalog.variantById.get(makeVariantKey(cols[2], rare)) ??
        findBestCatalogVariant(nameOrPrint, catalog);
      if (v) {
        const slot: DeckSlot = { print: v.print, rare: v.rare, name: v.name, quantity: qty };
        if (section === "life") life.push(slot);
        else if (section === "side") side.push(slot);
        else main.push(slot);
      }
    }
  }
  if (main.length === 0 && life.length === 0) {
    // Fallback to text parser
    const parsedText = parseDeckRecipeText(content, catalog, "Imported CSV Deck");
    const now = Date.now();
    return {
      id: `deck-${now}`,
      name: parsedText.name,
      sourceType: "text",
      main: parsedText.main,
      life: parsedText.life,
      side: parsedText.side,
      createdAt: now,
      updatedAt: now,
    };
  }
  const now = Date.now();
  return {
    id: `csv-${now}`,
    name: "Imported CSV Deck",
    sourceType: "json",
    main,
    life,
    side,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Analyzes Deck Gap against user's collection (Cross-Print Smart Resolution or Strict Exact-Print),
 * plus Budget (Lowest Print/Rarity) vs. Bling (Highest Rarity) cost comparison on TCG Thailand,
 * plus Cost & Gem Telemetry.
 */
export function analyzeDeckGap(
  deck: { main: DeckSlot[]; life: DeckSlot[]; side: DeckSlot[] },
  catalog: CatalogIndex,
  collectionEntries: CollectionEntry[],
  priceMap: Map<string, MarketPriceEntry>,
  mode: DeckGapMatchMode = "cross-print"
): DeckGapReport {
  const remainingByName = buildOwnedByNameMap(collectionEntries);
  const ownedByVariant = buildOwnedByVariantMap(collectionEntries);
  const remainingByVariant = new Map<string, number>();
  for (const [k, v] of ownedByVariant.entries()) {
    remainingByVariant.set(k, v.totalQty);
  }

  const items: DeckGapItem[] = [];

  const allSlots: { section: "main" | "life" | "side"; slot: DeckSlot }[] = [
    ...deck.main.map((slot) => ({ section: "main" as const, slot })),
    ...deck.life.map((slot) => ({ section: "life" as const, slot })),
    ...deck.side.map((slot) => ({ section: "side" as const, slot })),
  ];

  // Cost/Gem/Type/Symbol telemetry (Main + Life, primarily Main for cost/gem curve)
  const costBuckets = new Map<number, number>();
  const gemBuckets = new Map<number, number>();
  const typeBuckets = new Map<string, number>();
  const symbolBuckets = new Map<string, number>();

  for (let c = 0; c <= 10; c++) costBuckets.set(c, 0);
  for (let g = 0; g <= 4; g++) gemBuckets.set(g, 0);

  let totalRequired = 0;
  let totalOwnedMatched = 0;
  let budgetTotalMissingTHB = 0;
  let blingTotalMissingTHB = 0;
  let budgetFullDeckCostTHB = 0;
  let blingFullDeckCostTHB = 0;

  for (const { section, slot } of allSlots) {
    const concept = catalog.conceptByName.get(slot.name);
    const exactVariant =
      catalog.variantById.get(makeVariantKey(slot.print, slot.rare)) ??
      catalog.printByCode.get(slot.print)?.primaryVariant ??
      concept?.defaultVariant;

    // Telemetry only from Main Deck (and Life for type if helpful, keep Main for mana/cost/gem curve)
    if (section === "main" && exactVariant) {
      const cVal = Math.min(10, Math.max(0, exactVariant.cost));
      costBuckets.set(cVal, (costBuckets.get(cVal) ?? 0) + slot.quantity);
      if (exactVariant.type === "Avatar" || exactVariant.type === "Construct") {
        const gVal = Math.min(4, Math.max(0, exactVariant.gem));
        gemBuckets.set(gVal, (gemBuckets.get(gVal) ?? 0) + slot.quantity);
      }
      const typeLabel =
        exactVariant.type === "Magic" && exactVariant.subtype
          ? `Magic (${exactVariant.subtype})`
          : exactVariant.type;
      typeBuckets.set(typeLabel, (typeBuckets.get(typeLabel) ?? 0) + slot.quantity);
      if (exactVariant.symbol) {
        symbolBuckets.set(
          exactVariant.symbol,
          (symbolBuckets.get(exactVariant.symbol) ?? 0) + slot.quantity
        );
      }
    }

    // Owned matching
    let ownedMatched = 0;
    if (mode === "cross-print") {
      const avail = remainingByName.get(slot.name) ?? 0;
      ownedMatched = Math.min(slot.quantity, avail);
      remainingByName.set(slot.name, Math.max(0, avail - ownedMatched));
    } else {
      const key = makeVariantKey(slot.print, slot.rare);
      const avail = remainingByVariant.get(key) ?? 0;
      ownedMatched = Math.min(slot.quantity, avail);
      remainingByVariant.set(key, Math.max(0, avail - ownedMatched));
    }

    const missingQty = Math.max(0, slot.quantity - ownedMatched);
    totalRequired += slot.quantity;
    totalOwnedMatched += ownedMatched;

    // Compute Budget (cheapest print/rarity) vs. Bling (highest rarity priced or highest rarity variant)
    const candidateVariants = concept?.variants ?? (exactVariant ? [exactVariant] : []);
    let budgetVariant: CardVariant | undefined = exactVariant;
    let blingVariant: CardVariant | undefined = exactVariant;
    let budgetUnitPrice: number | null = null;
    let blingUnitPrice: number | null = null;
    let bestProductUrl = getTcgThailandSearchUrl(slot.name);

    // Budget: lowest priced variant across all prints of same name
    for (const v of candidateVariants) {
      const res = getVariantMarketPrice(v, priceMap);
      if (res.price !== null && res.price > 0) {
        if (budgetUnitPrice === null || res.price < budgetUnitPrice) {
          budgetUnitPrice = res.price;
          budgetVariant = v;
          if (res.entry?.productUrl) bestProductUrl = res.entry.productUrl;
        }
        if (blingUnitPrice === null || res.price > blingUnitPrice) {
          blingUnitPrice = res.price;
          blingVariant = v;
        }
      }
    }

    // If no priced higher-rarity variant found, still set blingVariant to highest rarity rank
    if (candidateVariants.length > 0 && blingUnitPrice === null) {
      const byRank = [...candidateVariants].sort(
        (a, b) => (RARITY_RANK[b.rare] ?? 0) - (RARITY_RANK[a.rare] ?? 0)
      );
      blingVariant = byRank[0];
    }

    const budgetMissingCostTHB = (budgetUnitPrice ?? 0) * missingQty;
    const blingMissingCostTHB = (blingUnitPrice ?? budgetUnitPrice ?? 0) * missingQty;
    budgetTotalMissingTHB += budgetMissingCostTHB;
    blingTotalMissingTHB += blingMissingCostTHB;
    budgetFullDeckCostTHB += (budgetUnitPrice ?? 0) * slot.quantity;
    blingFullDeckCostTHB += (blingUnitPrice ?? budgetUnitPrice ?? 0) * slot.quantity;

    items.push({
      slot,
      section,
      requiredQty: slot.quantity,
      ownedQty: ownedMatched,
      missingQty,
      budgetUnitPriceTHB: budgetUnitPrice,
      blingUnitPriceTHB: blingUnitPrice ?? budgetUnitPrice,
      budgetMissingCostTHB,
      blingMissingCostTHB,
      budgetVariant,
      blingVariant,
      tcgProductUrl: bestProductUrl,
      tcgSearchUrl: getTcgThailandSearchUrl(slot.name),
    });
  }

  const missingItems = items.filter((it) => it.missingQty > 0);
  const mainTotal = deck.main.reduce((a, b) => a + b.quantity, 0);
  const lifeTotal = deck.life.reduce((a, b) => a + b.quantity, 0);

  return {
    mode,
    totalRequired,
    totalOwnedMatched,
    totalMissing: Math.max(0, totalRequired - totalOwnedMatched),
    readyToPlay: mainTotal === 50 && lifeTotal === 5 && missingItems.length === 0,
    budgetTotalMissingTHB: Math.round(budgetTotalMissingTHB),
    blingTotalMissingTHB: Math.round(blingTotalMissingTHB),
    budgetFullDeckCostTHB: Math.round(budgetFullDeckCostTHB),
    blingFullDeckCostTHB: Math.round(blingFullDeckCostTHB),
    items,
    missingItems,
    costCurve: Array.from(costBuckets.entries()).map(([cost, count]) => ({
      cost: cost === 10 ? "10+" : String(cost),
      count,
    })),
    gemCurve: Array.from(gemBuckets.entries()).map(([gem, count]) => ({
      gem: `${gem} Gem`,
      count,
    })),
    typeSplit: Array.from(typeBuckets.entries()).map(([type, count]) => ({ type, count })),
    symbolSplit: Array.from(symbolBuckets.entries())
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((a, b) => b.count - a.count),
  };
}
