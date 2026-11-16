import type {
  CardColor,
  CardConcept,
  CardPrint,
  CardVariant,
  CatalogIndex,
  RawBotCard,
} from "./types";

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

export const RARITY_RANK: Record<string, number> = {
  C: 1,
  R: 2,
  SR: 3,
  UR: 4,
  FR: 5,
  PR: 6,
  CBR: 7,
  SCR: 8,
  SEC: 8,
  USEC: 9,
  USAP: 10,
};

export const HOLO_RARITIES = new Set(["SCR", "CBR", "PR", "USEC", "UR", "SR"]);

export function getSetCode(print: string): string {
  const parts = print.split("-");
  return (parts[0] || "UNKNOWN").toUpperCase();
}

export function getSetGroup(setCode: string): string {
  if (setCode.startsWith("BT")) return "BT (Booster)";
  if (setCode.startsWith("SD")) return "SD (Starter)";
  if (setCode.startsWith("KD")) return "KD (Krid)";
  if (setCode.startsWith("CC")) return "CC (Community)";
  if (setCode.startsWith("SL")) return "SL (Selection)";
  if (setCode.startsWith("RM")) return "RM (Remix)";
  if (setCode.startsWith("B2S")) return "B2SA/B2SB";
  return setCode;
}

/**
 * Exact CDN image resolver reverse-engineered from bottcg.com module 549330.
 */
export function resolveCardImageUrl(print: string, rare?: string, cors = false): string {
  const setCode = getSetCode(print);
  const folder = SET_SUBFOLDERS[setCode]?.replace(/^\/+|\/+$/g, "");
  const baseUrl = folder ? `${CDN_BASE}/${folder}` : CDN_BASE;
  const filename =
    rare && (RARITY_SUFFIX_RARES.includes(rare) || RARITY_SUFFIX_SETS.has(setCode))
      ? `${print}-${rare}`
      : print;
  return `${baseUrl}/${filename}.png${cors ? "?cors_img=1" : ""}`;
}

export function getTcgThailandSearchUrl(cardName: string): string {
  return `https://www.tcgthailand.com/product?category_ids=0768f1bf-ae5c-44ac-b3b1-3212d4296f3a&search=${encodeURIComponent(
    cardName
  )}`;
}

export function getPlaysetTarget(card: {
  type: string;
  ex?: string;
  customLimit?: number;
}): number {
  if (card.type === "Token") return 0;
  if (card.type === "Life") return 1;
  if (card.ex === "Only #1") return 1;
  if (typeof card.customLimit === "number" && card.customLimit > 0) {
    return card.customLimit;
  }
  return 4;
}

function normalizeColor(c?: string): CardColor {
  if (c === "แดง" || c === "ฟ้า" || c === "ม่วง" || c === "เขียว") return c;
  return "ไม่มีสี";
}

export function makeVariantKey(print: string, rare: string): string {
  return `${print}__${rare}`;
}

export function buildCatalogHierarchy(
  rawCards: RawBotCard[],
  meta = { sourceUrl: "https://cdn.bottcg.com/data/cards.feab7649.json", syncedAt: "" }
): CatalogIndex {
  const variants: CardVariant[] = [];
  const variantById = new Map<string, CardVariant>();
  const printVariantsMap = new Map<string, CardVariant[]>();
  const conceptVariantsMap = new Map<string, CardVariant[]>();
  const setsSet = new Set<string>();
  const raritiesSet = new Set<string>();
  const symbolsSet = new Set<string>();

  for (const raw of rawCards) {
    const setCode = getSetCode(raw.print);
    const rare = raw.rare || "C";
    const id = makeVariantKey(raw.print, rare);
    if (variantById.has(id)) continue;

    const variant: CardVariant = {
      id,
      print: raw.print,
      setCode,
      rare,
      name: raw.name.trim(),
      type: raw.type,
      subtype: raw.subtype,
      soi: typeof raw.soi === "number" ? raw.soi : 1,
      cost: typeof raw.cost === "number" ? raw.cost : 0,
      gem: typeof raw.gem === "number" ? raw.gem : 0,
      power: typeof raw.power === "number" ? raw.power : 0,
      symbol: raw.symbol || "",
      color: normalizeColor(raw.color),
      ex: raw.ex,
      mainEffect: raw.mainEffect || "",
      favorText: raw.favorText,
      dropRate: raw.dropRate,
      customLimit: raw.customLimit,
      creator: raw.creator,
      hashtagText: raw.hashtagText,
      imageUrl: resolveCardImageUrl(raw.print, rare),
      playsetTarget: getPlaysetTarget(raw),
    };

    variants.push(variant);
    variantById.set(id, variant);
    setsSet.add(setCode);
    raritiesSet.add(rare);
    if (variant.symbol) symbolsSet.add(variant.symbol);

    const pList = printVariantsMap.get(variant.print) ?? [];
    pList.push(variant);
    printVariantsMap.set(variant.print, pList);

    const cList = conceptVariantsMap.get(variant.name) ?? [];
    cList.push(variant);
    conceptVariantsMap.set(variant.name, cList);
  }

  const prints: CardPrint[] = [];
  const printByCode = new Map<string, CardPrint>();
  const conceptPrintsMap = new Map<string, CardPrint[]>();

  for (const [printCode, pVariants] of printVariantsMap.entries()) {
    const sorted = [...pVariants].sort(
      (a, b) => (RARITY_RANK[a.rare] ?? 99) - (RARITY_RANK[b.rare] ?? 99)
    );
    const primary = sorted[0];
    const cardPrint: CardPrint = {
      print: printCode,
      setCode: primary.setCode,
      name: primary.name,
      primaryVariant: primary,
      variants: sorted,
    };
    prints.push(cardPrint);
    printByCode.set(printCode, cardPrint);

    const cpList = conceptPrintsMap.get(primary.name) ?? [];
    cpList.push(cardPrint);
    conceptPrintsMap.set(primary.name, cpList);
  }

  const concepts: CardConcept[] = [];
  const conceptByName = new Map<string, CardConcept>();

  for (const [name, cVariants] of conceptVariantsMap.entries()) {
    const sortedVars = [...cVariants].sort((a, b) => {
      const rankDiff = (RARITY_RANK[a.rare] ?? 99) - (RARITY_RANK[b.rare] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return a.print.localeCompare(b.print);
    });
    const base = sortedVars[0];
    const cPrints = conceptPrintsMap.get(name) ?? [];
    const playsetTarget = sortedVars.reduce(
      (minTarget, v) => Math.min(minTarget, v.playsetTarget),
      4
    );
    const concept: CardConcept = {
      name,
      type: base.type,
      subtype: base.subtype,
      soi: base.soi,
      cost: base.cost,
      gem: base.gem,
      power: base.power,
      symbol: base.symbol,
      color: base.color,
      ex: base.ex,
      mainEffect: base.mainEffect,
      playsetTarget: base.type === "Token" ? 0 : playsetTarget,
      prints: cPrints,
      variants: sortedVars,
      defaultVariant: base,
    };
    concepts.push(concept);
    conceptByName.set(name, concept);
  }

  const sets = Array.from(setsSet).sort();
  const rarities = Array.from(raritiesSet).sort(
    (a, b) => (RARITY_RANK[a] ?? 99) - (RARITY_RANK[b] ?? 99)
  );
  const symbols = Array.from(symbolsSet).sort((a, b) => a.localeCompare(b, "th"));

  return {
    sourceUrl: meta.sourceUrl,
    syncedAt: meta.syncedAt,
    variants,
    prints,
    concepts,
    variantById,
    conceptByName,
    printByCode,
    sets,
    rarities,
    symbols,
  };
}
