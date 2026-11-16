import catalogSnapshot from "@/data/cards-catalog.json";
import initialPricesSnapshot from "@/data/initial-prices.json";
import { CollectionWorkspace } from "@/components/CollectionWorkspace";
import type { MarketPriceEntry, RawBotCard } from "@/lib/types";

export default function HomePage() {
  const catalogData = catalogSnapshot as {
    sourceUrl: string;
    syncedAt: string;
    cards: RawBotCard[];
  };

  const pricesData = initialPricesSnapshot as {
    prices: Record<string, MarketPriceEntry>;
  };

  return (
    <CollectionWorkspace
      initialCards={catalogData.cards}
      initialCatalogMeta={{
        sourceUrl: catalogData.sourceUrl,
        syncedAt: catalogData.syncedAt,
      }}
      initialPrices={pricesData.prices ?? {}}
    />
  );
}
