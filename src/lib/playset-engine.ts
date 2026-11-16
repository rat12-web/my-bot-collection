import { getSetGroup, getTcgThailandSearchUrl, RARITY_RANK } from "./catalog";
import type {
  CardConcept,
  CardVariant,
  CatalogIndex,
  CollectionEntry,
  ConceptOwnership,
  MarketPriceEntry,
} from "./types";

/**
 * Pure playset & unlimited surplus math.
 * Normal cards target 4 copies per name; Only #1 and Life target 1 copy per name.
 * Users can record unlimited copies (>4) which spill into `surplusCopies`.
 */
export function calculateConceptOwnership(
  name: string,
  playsetTarget: number,
  totalOwned: number
): ConceptOwnership {
  const safeOwned = Math.max(0, Math.floor(totalOwned));
  const safeTarget = Math.max(0, Math.floor(playsetTarget));
  const playsetFilled = Math.min(safeOwned, safeTarget);
  const missingForPlayset = Math.max(0, safeTarget - safeOwned);
  const surplusCopies = Math.max(0, safeOwned - safeTarget);

  return {
    name,
    playsetTarget: safeTarget,
    totalOwned: safeOwned,
    playsetFilled,
    missingForPlayset,
    surplusCopies,
    isPlaysetComplete: safeTarget > 0 ? safeOwned >= safeTarget : safeOwned > 0,
  };
}

export function buildOwnedByNameMap(
  entries: CollectionEntry[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const qty = Math.max(0, e.totalQty);
    if (qty > 0) {
      map.set(e.name, (map.get(e.name) ?? 0) + qty);
    }
  }
  return map;
}

export function buildOwnedByVariantMap(
  entries: CollectionEntry[]
): Map<string, CollectionEntry> {
  const map = new Map<string, CollectionEntry>();
  for (const e of entries) {
    if (e.totalQty > 0) {
      map.set(e.variantKey, e);
    }
  }
  return map;
}

export function getVariantMarketPrice(
  variant: CardVariant,
  priceMap: Map<string, MarketPriceEntry>,
  concept?: CardConcept
): { price: number | null; entry?: MarketPriceEntry; isFallback?: boolean } {
  const exact = priceMap.get(variant.id);
  if (exact && exact.minPriceTHB !== null && exact.minPriceTHB > 0) {
    return { price: exact.minPriceTHB, entry: exact, isFallback: false };
  }
  if (concept) {
    // Fallback to any priced variant of same print, then lowest priced of same name
    for (const v of concept.variants) {
      if (v.print === variant.print) {
        const p = priceMap.get(v.id);
        if (p && p.minPriceTHB !== null && p.minPriceTHB > 0) {
          return { price: p.minPriceTHB, entry: p, isFallback: true };
        }
      }
    }
    let cheapest: MarketPriceEntry | undefined;
    for (const v of concept.variants) {
      const p = priceMap.get(v.id);
      if (p && p.minPriceTHB !== null && p.minPriceTHB > 0) {
        if (!cheapest || p.minPriceTHB < (cheapest.minPriceTHB ?? Infinity)) {
          cheapest = p;
        }
      }
    }
    if (cheapest) {
      return { price: cheapest.minPriceTHB, entry: cheapest, isFallback: true };
    }
  }
  return { price: null, entry: exact };
}

export interface DimensionProgress {
  key: string;
  label: string;
  playsetOwnedCopies: number;
  playsetTargetCopies: number;
  playsetCompletedConcepts: number;
  playsetTotalConcepts: number;
  playsetPct: number;
  masterOwnedVariants: number;
  masterTotalVariants: number;
  masterPct: number;
}

export interface ValuedCardItem {
  variant: CardVariant;
  qtyOwned: number;
  unitPriceTHB: number;
  totalValueTHB: number;
  surplusCopies: number;
  surplusValueTHB: number;
  productUrl: string;
  searchUrl: string;
}

export interface CollectionAnalyticsReport {
  totalCardsOwned: number;
  totalUniqueNamesOwned: number;
  totalPlaysetConcepts: number;
  completedPlaysetsCount: number;
  playsetCompletionPct: number;
  totalPlaysetCopiesNeeded: number;
  totalPlaysetCopiesFilled: number;
  masterOwnedPrints: number;
  masterTotalPrints: number;
  masterOwnedVariants: number;
  masterTotalVariants: number;
  masterPrintPct: number;
  masterVariantPct: number;
  totalSurplusCopies: number;
  totalPortfolioValueTHB: number;
  totalSurplusTradeValueTHB: number;
  topValueCards: ValuedCardItem[];
  surplusTradeItems: ValuedCardItem[];
  missingHuntingItems: {
    concept: CardConcept;
    missingQty: number;
    lowestPriceTHB: number | null;
    estimatedCostTHB: number;
    searchUrl: string;
    productUrl: string;
  }[];
  bySetGroup: DimensionProgress[];
  bySetCode: DimensionProgress[];
  bySoi: DimensionProgress[];
  byColor: DimensionProgress[];
  byRarity: DimensionProgress[];
}

export function calculateCollectionAnalytics(
  catalog: CatalogIndex,
  entries: CollectionEntry[],
  priceMap: Map<string, MarketPriceEntry>
): CollectionAnalyticsReport {
  const ownedByName = buildOwnedByNameMap(entries);
  const ownedByVariant = buildOwnedByVariantMap(entries);

  let totalCardsOwned = 0;
  for (const e of entries) totalCardsOwned += Math.max(0, e.totalQty);

  const playableConcepts = catalog.concepts.filter((c) => c.playsetTarget > 0);
  let totalUniqueNamesOwned = 0;
  let completedPlaysetsCount = 0;
  let totalPlaysetCopiesNeeded = 0;
  let totalPlaysetCopiesFilled = 0;
  let totalSurplusCopies = 0;

  const missingHuntingItems: CollectionAnalyticsReport["missingHuntingItems"] = [];

  for (const c of playableConcepts) {
    const owned = ownedByName.get(c.name) ?? 0;
    const status = calculateConceptOwnership(c.name, c.playsetTarget, owned);
    if (owned > 0) totalUniqueNamesOwned++;
    if (status.isPlaysetComplete) completedPlaysetsCount++;
    totalPlaysetCopiesNeeded += status.playsetTarget;
    totalPlaysetCopiesFilled += status.playsetFilled;
    totalSurplusCopies += status.surplusCopies;

    if (status.missingForPlayset > 0) {
      let lowestPrice: number | null = null;
      let productUrl = getTcgThailandSearchUrl(c.name);
      for (const v of c.variants) {
        const res = getVariantMarketPrice(v, priceMap);
        if (res.price !== null && (lowestPrice === null || res.price < lowestPrice)) {
          lowestPrice = res.price;
          if (res.entry?.productUrl) productUrl = res.entry.productUrl;
        }
      }
      missingHuntingItems.push({
        concept: c,
        missingQty: status.missingForPlayset,
        lowestPriceTHB: lowestPrice,
        estimatedCostTHB: lowestPrice !== null ? lowestPrice * status.missingForPlayset : 0,
        searchUrl: getTcgThailandSearchUrl(c.name),
        productUrl,
      });
    }
  }

  // Master print & variant ownership
  let masterOwnedPrints = 0;
  for (const p of catalog.prints) {
    const hasPrint = p.variants.some((v) => (ownedByVariant.get(v.id)?.totalQty ?? 0) > 0);
    if (hasPrint) masterOwnedPrints++;
  }

  let masterOwnedVariants = 0;
  let totalPortfolioValueTHB = 0;
  let totalSurplusTradeValueTHB = 0;
  const valuedItems: ValuedCardItem[] = [];
  const surplusByConceptAllocated = new Map<string, number>();

  // Sort entries by highest price first so surplus value reflects excess copies accurately (lowest-value copies first for trade? Actually keep highest/owned variant order)
  const ownedVariantsWithPrice: {
    variant: CardVariant;
    qty: number;
    unitPrice: number;
    productUrl: string;
    searchUrl: string;
  }[] = [];

  for (const v of catalog.variants) {
    const entry = ownedByVariant.get(v.id);
    const qty = entry?.totalQty ?? 0;
    if (qty > 0) {
      masterOwnedVariants++;
      const concept = catalog.conceptByName.get(v.name);
      const { price, entry: mEntry } = getVariantMarketPrice(v, priceMap, concept);
      const unitPrice = price ?? 0;
      totalPortfolioValueTHB += unitPrice * qty;
      ownedVariantsWithPrice.push({
        variant: v,
        qty,
        unitPrice,
        productUrl: mEntry?.productUrl || getTcgThailandSearchUrl(v.name),
        searchUrl: mEntry?.searchUrl || getTcgThailandSearchUrl(v.name),
      });
    }
  }

  // Allocate surplus copies per concept across its owned variants (keeping cheapest copies as playset, higher-rarity extras or excess as trade surplus; or proportional)
  // Using standard player logic: keep lowest-rarity/cheapest copies up to playsetTarget for playing, sell/trade excess copies!
  const variantsByName = new Map<string, typeof ownedVariantsWithPrice>();
  for (const item of ownedVariantsWithPrice) {
    const list = variantsByName.get(item.variant.name) ?? [];
    list.push(item);
    variantsByName.set(item.variant.name, list);
  }

  const surplusTradeItems: ValuedCardItem[] = [];

  for (const [name, list] of variantsByName.entries()) {
    const concept = catalog.conceptByName.get(name);
    const target = concept?.playsetTarget ?? 4;
    // Sort ascending by rarity rank (keep base prints for playset, surplus includes extra/duplicate copies)
    const sorted = [...list].sort(
      (a, b) => (RARITY_RANK[a.variant.rare] ?? 99) - (RARITY_RANK[b.variant.rare] ?? 99)
    );
    let remainingToKeep = target;
    for (const item of sorted) {
      const kept = Math.min(item.qty, remainingToKeep);
      remainingToKeep -= kept;
      const surplus = item.qty - kept;
      const surplusVal = surplus * item.unitPrice;
      totalSurplusTradeValueTHB += surplusVal;
      surplusByConceptAllocated.set(
        item.variant.id,
        (surplusByConceptAllocated.get(item.variant.id) ?? 0) + surplus
      );

      const valued: ValuedCardItem = {
        variant: item.variant,
        qtyOwned: item.qty,
        unitPriceTHB: item.unitPrice,
        totalValueTHB: item.unitPrice * item.qty,
        surplusCopies: surplus,
        surplusValueTHB: surplusVal,
        productUrl: item.productUrl,
        searchUrl: item.searchUrl,
      };
      if (item.unitPrice > 0) valuedItems.push(valued);
      if (surplus > 0) surplusTradeItems.push(valued);
    }
  }

  valuedItems.sort((a, b) => b.totalValueTHB - a.totalValueTHB);
  surplusTradeItems.sort((a, b) => b.surplusValueTHB - a.surplusValueTHB || b.surplusCopies - a.surplusCopies);

  // Dimension builders
  function buildDimensionFromVariants(
    keyFn: (v: CardVariant) => string,
    labelFn: (k: string) => string = (k) => k
  ): DimensionProgress[] {
    const buckets = new Map<
      string,
      {
        concepts: Map<string, number>;
        masterOwned: number;
        masterTotal: number;
      }
    >();

    for (const v of catalog.variants) {
      const k = keyFn(v);
      let b = buckets.get(k);
      if (!b) {
        b = { concepts: new Map(), masterOwned: 0, masterTotal: 0 };
        buckets.set(k, b);
      }
      b.masterTotal++;
      if ((ownedByVariant.get(v.id)?.totalQty ?? 0) > 0) b.masterOwned++;
      if (v.playsetTarget > 0) {
        b.concepts.set(v.name, v.playsetTarget);
      }
    }

    const out: DimensionProgress[] = [];
    for (const [key, b] of buckets.entries()) {
      let playsetOwnedCopies = 0;
      let playsetTargetCopies = 0;
      let playsetCompletedConcepts = 0;
      const playsetTotalConcepts = b.concepts.size;

      for (const [name, target] of b.concepts.entries()) {
        const owned = ownedByName.get(name) ?? 0;
        playsetTargetCopies += target;
        playsetOwnedCopies += Math.min(owned, target);
        if (owned >= target) playsetCompletedConcepts++;
      }

      out.push({
        key,
        label: labelFn(key),
        playsetOwnedCopies,
        playsetTargetCopies,
        playsetCompletedConcepts,
        playsetTotalConcepts,
        playsetPct:
          playsetTargetCopies > 0
            ? Math.round((playsetOwnedCopies / playsetTargetCopies) * 1000) / 10
            : 0,
        masterOwnedVariants: b.masterOwned,
        masterTotalVariants: b.masterTotal,
        masterPct:
          b.masterTotal > 0
            ? Math.round((b.masterOwned / b.masterTotal) * 1000) / 10
            : 0,
      });
    }
    return out;
  }

  const bySetGroup = buildDimensionFromVariants((v) => getSetGroup(v.setCode)).sort((a, b) =>
    a.key.localeCompare(b.key)
  );
  const bySetCode = buildDimensionFromVariants((v) => v.setCode).sort((a, b) =>
    a.key.localeCompare(b.key)
  );
  const bySoi = buildDimensionFromVariants(
    (v) => String(v.soi),
    (k) => (k === "0" ? "อัดมั่ว (0)" : `ซอย ${k}`)
  ).sort((a, b) => Number(a.key) - Number(b.key));
  const byColor = buildDimensionFromVariants((v) => v.color);
  const byRarity = buildDimensionFromVariants((v) => v.rare).sort(
    (a, b) => (RARITY_RANK[a.key] ?? 99) - (RARITY_RANK[b.key] ?? 99)
  );

  return {
    totalCardsOwned,
    totalUniqueNamesOwned,
    totalPlaysetConcepts: playableConcepts.length,
    completedPlaysetsCount,
    playsetCompletionPct:
      totalPlaysetCopiesNeeded > 0
        ? Math.round((totalPlaysetCopiesFilled / totalPlaysetCopiesNeeded) * 1000) / 10
        : 0,
    totalPlaysetCopiesNeeded,
    totalPlaysetCopiesFilled,
    masterOwnedPrints,
    masterTotalPrints: catalog.prints.length,
    masterOwnedVariants,
    masterTotalVariants: catalog.variants.length,
    masterPrintPct:
      catalog.prints.length > 0
        ? Math.round((masterOwnedPrints / catalog.prints.length) * 1000) / 10
        : 0,
    masterVariantPct:
      catalog.variants.length > 0
        ? Math.round((masterOwnedVariants / catalog.variants.length) * 1000) / 10
        : 0,
    totalSurplusCopies,
    totalPortfolioValueTHB: Math.round(totalPortfolioValueTHB),
    totalSurplusTradeValueTHB: Math.round(totalSurplusTradeValueTHB),
    topValueCards: valuedItems.slice(0, 20),
    surplusTradeItems,
    missingHuntingItems,
    bySetGroup,
    bySetCode,
    bySoi,
    byColor,
    byRarity,
  };
}
