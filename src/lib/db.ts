import Dexie, { type Table } from "dexie";
import type { CollectionEntry, MarketPriceEntry, SavedDeck } from "./types";

class BotCollectionDatabase extends Dexie {
  collection!: Table<CollectionEntry, string>;
  decks!: Table<SavedDeck, string>;
  priceCache!: Table<MarketPriceEntry, string>;

  constructor() {
    super("MyBOTCollectionDB");
    this.version(1).stores({
      collection: "&variantKey, print, name, updatedAt",
      decks: "&id, name, sourceType, updatedAt",
      priceCache: "&key, print, rare, name, fetchedAt",
    });
  }
}

export const db = new BotCollectionDatabase();

export async function setVariantQuantity(
  params: {
    variantKey: string;
    print: string;
    rare: string;
    name: string;
    qtyStandard?: number;
    qtyFoil?: number;
    qtyFirstEd?: number;
  }
): Promise<void> {
  const existing = await db.collection.get(params.variantKey);
  const qtyStandard = Math.max(
    0,
    Math.floor(params.qtyStandard ?? existing?.qtyStandard ?? 0)
  );
  const qtyFoil = Math.max(0, Math.floor(params.qtyFoil ?? existing?.qtyFoil ?? 0));
  const qtyFirstEd = Math.max(
    0,
    Math.floor(params.qtyFirstEd ?? existing?.qtyFirstEd ?? 0)
  );
  const totalQty = qtyStandard + qtyFoil + qtyFirstEd;

  if (totalQty === 0) {
    await db.collection.delete(params.variantKey);
    return;
  }

  await db.collection.put({
    variantKey: params.variantKey,
    print: params.print,
    rare: params.rare,
    name: params.name,
    qtyStandard,
    qtyFoil,
    qtyFirstEd,
    totalQty,
    updatedAt: Date.now(),
  });
}

export async function adjustVariantStandardDelta(
  params: { variantKey: string; print: string; rare: string; name: string },
  delta: number
): Promise<number> {
  const existing = await db.collection.get(params.variantKey);
  const curStd = existing?.qtyStandard ?? 0;
  const curFoil = existing?.qtyFoil ?? 0;
  const curFirst = existing?.qtyFirstEd ?? 0;
  const nextStd = Math.max(0, curStd + delta);
  const nextTotal = nextStd + curFoil + curFirst;

  if (nextTotal === 0) {
    await db.collection.delete(params.variantKey);
    return 0;
  }

  await db.collection.put({
    variantKey: params.variantKey,
    print: params.print,
    rare: params.rare,
    name: params.name,
    qtyStandard: nextStd,
    qtyFoil: curFoil,
    qtyFirstEd: curFirst,
    totalQty: nextTotal,
    updatedAt: Date.now(),
  });
  return nextTotal;
}

export async function upsertPricesToCache(entries: MarketPriceEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db.priceCache.bulkPut(entries);
}
