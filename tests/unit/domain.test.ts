import { describe, expect, it } from "vitest";
import catalogSnapshot from "@/data/cards-catalog.json";
import { exportBackupJson, exportCollectionCsv, parseBackupJson, parseCollectionCsv } from "@/lib/backup";
import { buildCatalogHierarchy, resolveCardImageUrl } from "@/lib/catalog";
import { analyzeDeckGap, parseDeckRecipeText } from "@/lib/deck-importer";
import { calculateCollectionAnalytics, calculateConceptOwnership } from "@/lib/playset-engine";
import { validateCompetitiveDeck } from "@/lib/sin-list-validator";
import type { CollectionEntry, MarketPriceEntry, RawBotCard, SavedDeck } from "@/lib/types";

const catalog = buildCatalogHierarchy(
  (catalogSnapshot as { cards: RawBotCard[] }).cards
);

describe("CDN Image Resolver (verified module 549330)", () => {
  it("resolves standard, subfolder, and rarity-suffixed card image URLs accurately", () => {
    expect(resolveCardImageUrl("BT01-038", "C")).toBe(
      "https://cdn.bottcg.com/cards/BT01-038.png"
    );
    expect(resolveCardImageUrl("BT01-001", "SCR")).toBe(
      "https://cdn.bottcg.com/cards/BT01-001-SCR.png"
    );
    expect(resolveCardImageUrl("SD09-001", "C")).toBe(
      "https://cdn.bottcg.com/cards/123v1k1/SD09-001.png"
    );
    expect(resolveCardImageUrl("RM01-001", "C")).toBe(
      "https://cdn.bottcg.com/cards/0aslabe/RM01-001.png"
    );
    expect(resolveCardImageUrl("BT12-001", "UR")).toBe(
      "https://cdn.bottcg.com/cards/thankyoupnes/BT12-001.png"
    );
    expect(resolveCardImageUrl("B2SA-008", "C")).toBe(
      "https://cdn.bottcg.com/cards/thankyoupnes/B2SA-008-C.png"
    );
  });
});

describe("Playset & Unlimited Surplus Engine", () => {
  it("caps standard cards at 4 for playset while supporting unlimited surplus copies (e.g., 5, 10, 30)", () => {
    const partial = calculateConceptOwnership("ความเจริญ", 4, 3);
    expect(partial.playsetFilled).toBe(3);
    expect(partial.missingForPlayset).toBe(1);
    expect(partial.surplusCopies).toBe(0);
    expect(partial.isPlaysetComplete).toBe(false);

    const exact = calculateConceptOwnership("ความเจริญ", 4, 4);
    expect(exact.playsetFilled).toBe(4);
    expect(exact.missingForPlayset).toBe(0);
    expect(exact.surplusCopies).toBe(0);
    expect(exact.isPlaysetComplete).toBe(true);

    const surplus30 = calculateConceptOwnership("ความเจริญ", 4, 30);
    expect(surplus30.totalOwned).toBe(30);
    expect(surplus30.playsetFilled).toBe(4);
    expect(surplus30.missingForPlayset).toBe(0);
    expect(surplus30.surplusCopies).toBe(26);
    expect(surplus30.isPlaysetComplete).toBe(true);
  });

  it("caps Only #1 and Life cards at 1 for playset and moves extra copies to surplus", () => {
    const onlyOneCard = catalog.concepts.find((c) => c.ex === "Only #1");
    expect(onlyOneCard).toBeDefined();
    expect(onlyOneCard!.playsetTarget).toBe(1);

    const onlyOneOwned5 = calculateConceptOwnership(
      onlyOneCard!.name,
      onlyOneCard!.playsetTarget,
      5
    );
    expect(onlyOneOwned5.playsetFilled).toBe(1);
    expect(onlyOneOwned5.surplusCopies).toBe(4);
    expect(onlyOneOwned5.isPlaysetComplete).toBe(true);

    const lifeCard = catalog.concepts.find((c) => c.type === "Life");
    expect(lifeCard).toBeDefined();
    expect(lifeCard!.playsetTarget).toBe(1);

    const lifeOwned3 = calculateConceptOwnership(
      lifeCard!.name,
      lifeCard!.playsetTarget,
      3
    );
    expect(lifeOwned3.playsetFilled).toBe(1);
    expect(lifeOwned3.surplusCopies).toBe(2);
  });

  it("calculates surplus trade valuation accurately in analytics", () => {
    const concept = catalog.conceptByName.get("ความเจริญ");
    expect(concept).toBeDefined();
    const v0 = concept!.variants[0];
    const entries: CollectionEntry[] = [
      {
        variantKey: v0.id,
        print: v0.print,
        rare: v0.rare,
        name: v0.name,
        qtyStandard: 10,
        qtyFoil: 0,
        qtyFirstEd: 0,
        totalQty: 10,
        updatedAt: Date.now(),
      },
    ];
    const priceMap = new Map<string, MarketPriceEntry>([
      [
        v0.id,
        {
          key: v0.id,
          print: v0.print,
          rare: v0.rare,
          name: v0.name,
          minPriceTHB: 50,
          stockCount: 10,
          condition: "Near Mint (NM)",
          productUrl: "https://www.tcgthailand.com/product/test",
          searchUrl: "https://www.tcgthailand.com/product",
          fetchedAt: Date.now(),
        },
      ],
    ]);

    const report = calculateCollectionAnalytics(catalog, entries, priceMap);
    expect(report.totalCardsOwned).toBe(10);
    expect(report.totalSurplusCopies).toBe(6);
    expect(report.totalPortfolioValueTHB).toBe(500);
    expect(report.totalSurplusTradeValueTHB).toBe(300);
  });
});

describe("Cross-Print Deck Gap Resolution & Recipe Importer", () => {
  it("resolves ownership across different prints/rarities of the same card name in cross-print mode vs exact-print mode", () => {
    const multiPrintConcept = catalog.concepts.find((c) => c.variants.length >= 2);
    expect(multiPrintConcept).toBeDefined();

    const ownedVariant = multiPrintConcept!.variants[0];
    const deckVariant = multiPrintConcept!.variants[multiPrintConcept!.variants.length - 1];

    const entries: CollectionEntry[] = [
      {
        variantKey: ownedVariant.id,
        print: ownedVariant.print,
        rare: ownedVariant.rare,
        name: ownedVariant.name,
        qtyStandard: 4,
        qtyFoil: 0,
        qtyFirstEd: 0,
        totalQty: 4,
        updatedAt: Date.now(),
      },
    ];

    const deck = {
      main: [
        {
          print: deckVariant.print,
          rare: deckVariant.rare,
          name: deckVariant.name,
          quantity: 3,
        },
      ],
      life: [],
      side: [],
    };

    const crossReport = analyzeDeckGap(deck, catalog, entries, new Map(), "cross-print");
    expect(crossReport.totalOwnedMatched).toBe(3);
    expect(crossReport.totalMissing).toBe(0);

    const exactReport = analyzeDeckGap(deck, catalog, entries, new Map(), "exact-print");
    expect(exactReport.totalOwnedMatched).toBe(0);
    expect(exactReport.totalMissing).toBe(3);
  });

  it("parses Thai recipe names and print codes cleanly", () => {
    const recipe = `
# Test Deck
ความเจริญ 2
4x BT01-001
# Life Cards
1x BT01-051
# Side Deck
2 BT01-036
`;
    const parsed = parseDeckRecipeText(recipe, catalog);
    expect(parsed.name).toBe("Test Deck");
    expect(parsed.main.find((s) => s.name === "ความเจริญ")?.quantity).toBe(2);
    expect(parsed.main.find((s) => s.print === "BT01-001")?.quantity).toBe(4);
    expect(parsed.life).toHaveLength(1);
    expect(parsed.side).toHaveLength(1);
  });
});

describe("Sin-List & Tournament Legality Validator", () => {
  function getSlot(name: string, quantity = 1) {
    const c = catalog.conceptByName.get(name);
    if (!c) throw new Error(`Card not found in catalog: ${name}`);
    return {
      print: c.defaultVariant.print,
      rare: c.defaultVariant.rare,
      name: c.name,
      quantity,
    };
  }

  function buildLegalBaseDeck() {
    const main = [
      getSlot("วีรบุรุษปากซอย", 1),
      getSlot("พระอิศวร", 4),
      getSlot("พระนารายณ์", 4),
      getSlot("พระอินทร์", 4),
      getSlot("นนทก", 4),
      getSlot("ช่างแอร์ดวงซวย", 4),
      getSlot("เทวดานักมวย", 4),
      getSlot("เทวดาแบงค์", 4),
      getSlot("เด็กถ่ายเอกสาร", 4),
      getSlot("เทวดาตัวเปิด", 4),
      getSlot("ยักษ์ล้างส้วม", 4),
      getSlot("ยักษ์แบกปูน", 4),
      getSlot("เทวดาจิตบำบัด", 4),
      getSlot("เทวดาเลื่อยยนต์", 1),
    ];

    const life = [
      getSlot("ไม่นะ อิศวร !", 1),
      getSlot("ไม่นะ นนทก !", 1),
      getSlot("ไม่นะ อัปสร !", 1),
      getSlot("ไม่นะ ซาร่า !", 1),
      getSlot("ไม่นะ หลวงพ่อ !", 1),
    ];

    return { main, life, side: [] };
  }

  it("validates a tournament-legal 50+5 deck cleanly", () => {
    const base = buildLegalBaseDeck();
    const res = validateCompetitiveDeck(base, catalog);
    expect(res.violations).toEqual([]);
    expect(res.isValid).toBe(true);
    expect(res.isTournamentReady).toBe(true);
  });

  it("flags banned cards (e.g., ครูแกง สอนเลข, ล้มโต๊ะ) and choice pair bans (เจ้ากล้าดียังไง + ริกกี้ นักปลอมแปลง)", () => {
    const base = buildLegalBaseDeck();
    const withBanned = {
      ...base,
      side: [getSlot("ครูแกง สอนเลข", 1)],
    };
    const resBanned = validateCompetitiveDeck(withBanned, catalog);
    expect(resBanned.isValid).toBe(false);
    expect(resBanned.violations.some((v) => v.rule === "sin-ban-ครูแกง สอนเลข")).toBe(
      true
    );

    const withChoicePair = {
      ...base,
      side: [getSlot("เจ้ากล้าดียังไง", 1), getSlot("ริกกี้ นักปลอมแปลง", 1)],
    };
    const resPair = validateCompetitiveDeck(withChoicePair, catalog);
    expect(resPair.isValid).toBe(false);
    expect(
      resPair.violations.some((v) => v.rule.startsWith("sin-pair-"))
    ).toBe(true);
  });

  it("flags limited card copy overages (ความเจริญ max 2), ลำเอียง cards, and Life in Side Deck", () => {
    const base = buildLegalBaseDeck();
    const overLimited = {
      ...base,
      side: [getSlot("ความเจริญ", 3)],
    };
    const resLimited = validateCompetitiveDeck(overLimited, catalog);
    expect(resLimited.violations.some((v) => v.rule === "sin-limit-ความเจริญ")).toBe(
      true
    );

    const lamEiang = catalog.concepts.find((c) => c.ex === "ลำเอียง");
    if (lamEiang) {
      const resLam = validateCompetitiveDeck(
        {
          ...base,
          side: [getSlot(lamEiang.name, 1)],
        },
        catalog
      );
      expect(
        resLam.violations.some((v) => v.rule === "banned-symbol-lam-eiang")
      ).toBe(true);
    }

    const lifeCard = catalog.concepts.find((c) => c.type === "Life")!;
    const resLifeInSide = validateCompetitiveDeck(
      {
        ...base,
        side: [getSlot(lifeCard.name, 1)],
      },
      catalog
    );
    expect(
      resLifeInSide.violations.some((v) => v.rule === "no-life-in-side")
    ).toBe(true);
  });
});

describe("Zod-Validated Backup Import & Export", () => {
  it("round-trips JSON and CSV collection backups cleanly", () => {
    const sample = catalog.variants[0];
    const entries: CollectionEntry[] = [
      {
        variantKey: sample.id,
        print: sample.print,
        rare: sample.rare,
        name: sample.name,
        qtyStandard: 6,
        qtyFoil: 2,
        qtyFirstEd: 1,
        totalQty: 9,
        updatedAt: 1700000000000,
      },
    ];
    const decks: SavedDeck[] = [];

    const jsonStr = exportBackupJson(entries, decks);
    const restoredJson = parseBackupJson(jsonStr);
    expect(restoredJson.collection).toHaveLength(1);
    expect(restoredJson.collection[0].totalQty).toBe(9);

    const csvStr = exportCollectionCsv(entries);
    const restoredCsv = parseCollectionCsv(csvStr, catalog);
    expect(restoredCsv).toHaveLength(1);
    expect(restoredCsv[0].qtyStandard).toBe(6);
    expect(restoredCsv[0].qtyFoil).toBe(2);
    expect(restoredCsv[0].totalQty).toBe(9);
  });
});
