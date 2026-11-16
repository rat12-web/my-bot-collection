import { z } from "zod";

export type CardType = "Avatar" | "Magic" | "Life" | "Construct" | "Token";
export type MagicSubtype = "Normal" | "Modification" | "React" | "Land";
export type CardRarity = "C" | "R" | "SR" | "UR" | "PR" | "CBR" | "SCR" | "USEC" | "USAP" | "FR";
export type CardColor = "แดง" | "ฟ้า" | "ม่วง" | "เขียว" | "ไม่มีสี";
export type FinishType = "standard" | "foil" | "firstEd";

export interface RawBotCard {
  name: string;
  type: CardType | string;
  soi: number;
  print: string;
  rare: string;
  mainEffect?: string;
  cost?: number;
  gem?: number;
  power?: number;
  symbol?: string;
  color?: string;
  dropRate?: string;
  ex?: string;
  subtype?: string;
  favorText?: string;
  customLimit?: number;
  creator?: string;
  gemColor?: string;
  hashtagText?: string;
}

export interface CardVariant {
  id: string; // `${print}__${rare}`
  print: string;
  setCode: string;
  rare: string;
  name: string;
  type: CardType | string;
  subtype?: string;
  soi: number;
  cost: number;
  gem: number;
  power: number;
  symbol: string;
  color: CardColor;
  ex?: string;
  mainEffect: string;
  favorText?: string;
  dropRate?: string;
  customLimit?: number;
  creator?: string;
  hashtagText?: string;
  imageUrl: string;
  playsetTarget: number;
}

export interface CardPrint {
  print: string;
  setCode: string;
  name: string;
  primaryVariant: CardVariant;
  variants: CardVariant[];
}

export interface CardConcept {
  name: string;
  type: CardType | string;
  subtype?: string;
  soi: number;
  cost: number;
  gem: number;
  power: number;
  symbol: string;
  color: CardColor;
  ex?: string;
  mainEffect: string;
  playsetTarget: number;
  prints: CardPrint[];
  variants: CardVariant[];
  defaultVariant: CardVariant;
}

export interface CatalogIndex {
  sourceUrl: string;
  syncedAt: string;
  variants: CardVariant[];
  prints: CardPrint[];
  concepts: CardConcept[];
  variantById: Map<string, CardVariant>;
  conceptByName: Map<string, CardConcept>;
  printByCode: Map<string, CardPrint>;
  sets: string[];
  rarities: string[];
  symbols: string[];
}

export interface CollectionEntry {
  variantKey: string; // `${print}__${rare}`
  print: string;
  rare: string;
  name: string;
  qtyStandard: number;
  qtyFoil: number;
  qtyFirstEd: number;
  totalQty: number;
  updatedAt: number;
}

export interface ConceptOwnership {
  name: string;
  playsetTarget: number;
  totalOwned: number;
  playsetFilled: number;
  missingForPlayset: number;
  surplusCopies: number;
  isPlaysetComplete: boolean;
}

export interface MarketPriceEntry {
  key: string; // `${print}__${rare}`
  print: string;
  rare: string;
  name: string;
  tcgProductId?: string;
  minPriceTHB: number | null;
  lastSoldTHB?: number | null;
  stockCount: number;
  condition: string;
  printing?: string;
  productUrl: string;
  searchUrl: string;
  fetchedAt: number;
  source?: "tcgthailand" | "bottcg" | "snapshot";
}

export interface DeckSlot {
  print: string;
  rare: string;
  name: string;
  quantity: number;
}

export interface SavedDeck {
  id: string;
  name: string;
  sourceType: "bottcg" | "text" | "json" | "manual";
  sourceUrl?: string;
  main: DeckSlot[];
  life: DeckSlot[];
  side: DeckSlot[];
  createdAt: number;
  updatedAt: number;
}

export interface DeckViolation {
  rule: string;
  severity: "error" | "warning";
  message: string;
  names?: string[];
  prints?: string[];
}

export interface DeckValidationResult {
  isValid: boolean;
  isTournamentReady: boolean;
  mainCount: number;
  lifeCount: number;
  sideCount: number;
  onlyOneMainCount: number;
  violations: DeckViolation[];
}

export type DeckGapMatchMode = "cross-print" | "exact-print";

export interface DeckGapItem {
  slot: DeckSlot;
  section: "main" | "life" | "side";
  requiredQty: number;
  ownedQty: number;
  missingQty: number;
  budgetUnitPriceTHB: number | null;
  blingUnitPriceTHB: number | null;
  budgetMissingCostTHB: number;
  blingMissingCostTHB: number;
  budgetVariant?: CardVariant;
  blingVariant?: CardVariant;
  tcgProductUrl: string;
  tcgSearchUrl: string;
}

export interface DeckGapReport {
  mode: DeckGapMatchMode;
  totalRequired: number;
  totalOwnedMatched: number;
  totalMissing: number;
  readyToPlay: boolean;
  budgetTotalMissingTHB: number;
  blingTotalMissingTHB: number;
  budgetFullDeckCostTHB: number;
  blingFullDeckCostTHB: number;
  items: DeckGapItem[];
  missingItems: DeckGapItem[];
  costCurve: { cost: string; count: number }[];
  gemCurve: { gem: string; count: number }[];
  typeSplit: { type: string; count: number }[];
  symbolSplit: { symbol: string; count: number }[];
}

export const CollectionEntrySchema = z.object({
  variantKey: z.string().min(1),
  print: z.string().min(1),
  rare: z.string().min(1),
  name: z.string().min(1),
  qtyStandard: z.number().int().min(0),
  qtyFoil: z.number().int().min(0),
  qtyFirstEd: z.number().int().min(0),
  totalQty: z.number().int().min(0),
  updatedAt: z.number().int().min(0),
});

export const DeckSlotSchema = z.object({
  print: z.string().min(1),
  rare: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().min(1).max(60),
});

export const SavedDeckSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceType: z.enum(["bottcg", "text", "json", "manual"]),
  sourceUrl: z.string().optional(),
  main: z.array(DeckSlotSchema),
  life: z.array(DeckSlotSchema),
  side: z.array(DeckSlotSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const BackupFileSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  app: z.literal("MyBOTCollection"),
  collection: z.array(CollectionEntrySchema),
  decks: z.array(SavedDeckSchema),
});

export type BackupFile = z.infer<typeof BackupFileSchema>;
