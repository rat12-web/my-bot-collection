import fs from "node:fs";
import path from "node:path";
import setsConfig from "../src/data/tcgthailand-sets.json";

const DEFAULT_CARDS_JSON = "https://cdn.bottcg.com/data/cards.feab7649.json";
const TCG_API_BASE = "https://api.tcgthailand.com/api/v1";
const TCG_CATEGORY_ID = "0768f1bf-ae5c-44ac-b3b1-3212d4296f3a";
const DEFAULT_TCG_API_KEY = "b3f1c8d7-7c8e-4a1f-bc89-4fd0d8c216f3";

async function discoverLatestCardsJsonUrl(): Promise<string> {
  try {
    const pageRes = await fetch("https://bottcg.com/cards", {
      headers: { "User-Agent": "MyBOTCollection/1.0" },
    });
    if (!pageRes.ok) return DEFAULT_CARDS_JSON;
    const html = await pageRes.text();
    const chunks = [...html.matchAll(/\/_next\/static\/immutable\/chunks\/[^"']+\.js/g)].map(
      (m) => m[0]
    );
    for (const chunk of chunks) {
      const cRes = await fetch(`https://bottcg.com${chunk}`);
      if (!cRes.ok) continue;
      const text = await cRes.text();
      const match = text.match(/https:\/\/cdn\.bottcg\.com\/data\/cards\.[a-f0-9]+\.json/);
      if (match) return match[0];
    }
  } catch {
    // Fallback to verified URL
  }
  return DEFAULT_CARDS_JSON;
}

async function discoverTcgApiKey(): Promise<string> {
  try {
    const res = await fetch(
      `https://www.tcgthailand.com/product?category_ids=${TCG_CATEGORY_ID}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/xApiKey:"([^"]+)"/);
      if (match?.[1]) return match[1];
    }
  } catch {
    // Fallback to verified key
  }
  return DEFAULT_TCG_API_KEY;
}

interface TcgProductRaw {
  id: string;
  name: string;
  product_code?: string;
  set_code?: string;
  rarity?: string;
  min_price?: string | number;
  stock_quantity?: number;
  condition?: string;
  printing?: string;
}

function normalizeRarity(r?: string): string {
  if (!r || r === "-") return "C";
  if (r === "SEC") return "SCR";
  return r;
}

async function syncInitialTcgPrices(
  apiKey: string,
  existingPrices: Record<string, {
    key: string;
    print: string;
    rare: string;
    name: string;
    tcgProductId: string;
    minPriceTHB: number;
    stockCount: number;
    condition: string;
    printing: string;
    productUrl: string;
    searchUrl: string;
    fetchedAt: number;
  }> = {}
) {
  const pricesByKey = { ...existingPrices };

  const setEntries = Object.entries(setsConfig.sets) as [string, { id: string; name: string }][];
  console.log(`Syncing TCG Thailand market snapshot across ${setEntries.length} sets...`);

  for (const [setCode, meta] of setEntries) {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const url = `${TCG_API_BASE}/member/products/search?category_ids=${TCG_CATEGORY_ID}&set_ids=${meta.id}&page=${page}&page_size=200`;
      try {
        let res = await fetch(url, {
          headers: {
            "User-Agent": "MyBOTCollection/1.0",
            Accept: "application/json",
            "X-Api-Key": apiKey,
          },
        });
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 2500));
          res = await fetch(url, {
            headers: {
              "User-Agent": "MyBOTCollection/1.0",
              Accept: "application/json",
              "X-Api-Key": apiKey,
            },
          });
        }
        if (!res.ok) {
          console.warn(`  [WARN] Set ${setCode} page ${page} returned ${res.status}`);
          break;
        }
        const json = await res.json();
        const products: TcgProductRaw[] = json?.data?.products ?? [];
        totalPages = json?.data?.pagination?.total_pages ?? 1;
        const now = Date.now();
        for (const p of products) {
          if (!p.product_code) continue;
          const rare = normalizeRarity(p.rarity);
          const key = `${p.product_code}__${rare}`;
          const parsedPrice = Number(p.min_price ?? 0);
          pricesByKey[key] = {
            key,
            print: p.product_code,
            rare,
            name: p.name,
            tcgProductId: p.id,
            minPriceTHB: Number.isFinite(parsedPrice) ? parsedPrice : 0,
            stockCount: Number(p.stock_quantity ?? 0),
            condition: p.condition || "Near Mint (NM)",
            printing: p.printing || "",
            productUrl: `https://www.tcgthailand.com/product/${p.id}`,
            searchUrl: `https://www.tcgthailand.com/product?category_ids=${TCG_CATEGORY_ID}&search=${encodeURIComponent(p.name)}`,
            fetchedAt: now,
          };
        }
        page++;
        await new Promise((r) => setTimeout(r, 550));
      } catch (err) {
        console.warn(`  [WARN] Failed fetching ${setCode}:`, err);
        break;
      }
    }
  }
  return pricesByKey;
}

async function main() {
  const dataDir = path.resolve(process.cwd(), "src", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  console.log("1. Discovering active bottcg.com cards JSON URL...");
  const cardsUrl = await discoverLatestCardsJsonUrl();
  console.log("   Active URL:", cardsUrl);

  const cardsRes = await fetch(cardsUrl);
  if (!cardsRes.ok) {
    throw new Error(`Failed to fetch catalog: ${cardsRes.status}`);
  }
  const cards = await cardsRes.json();
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error("Catalog JSON is empty or invalid");
  }

  const catalogOut = path.join(dataDir, "cards-catalog.json");
  fs.writeFileSync(catalogOut, JSON.stringify({ sourceUrl: cardsUrl, syncedAt: new Date().toISOString(), cards }, null, 2));
  console.log(`   Saved ${cards.length} card records to ${catalogOut}`);

  console.log("2. Syncing initial TCG Thailand market price snapshot...");
  const pricesOut = path.join(dataDir, "initial-prices.json");
  let existingPrices = {};
  if (fs.existsSync(pricesOut)) {
    try {
      existingPrices = JSON.parse(fs.readFileSync(pricesOut, "utf8"))?.prices ?? {};
    } catch {
      existingPrices = {};
    }
  }
  const apiKey = await discoverTcgApiKey();
  const prices = await syncInitialTcgPrices(apiKey, existingPrices);
  fs.writeFileSync(
    pricesOut,
    JSON.stringify({ syncedAt: new Date().toISOString(), count: Object.keys(prices).length, prices }, null, 2)
  );
  console.log(`   Saved ${Object.keys(prices).length} TCG Thailand SKU prices to ${pricesOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
