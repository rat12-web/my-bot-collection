import fs from "node:fs";
import path from "node:path";
import setsConfig from "@/data/tcgthailand-sets.json";
import type { MarketPriceEntry } from "./types";

const TCG_API_BASE = "https://api.tcgthailand.com/api/v1";
const TCG_CATEGORY_ID = setsConfig.categoryId;
let activeApiKey = "b3f1c8d7-7c8e-4a1f-bc89-4fd0d8c216f3";

const CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "tcgthailand-prices.json");
const INITIAL_SNAPSHOT_FILE = path.resolve(process.cwd(), "src", "data", "initial-prices.json");

interface ServerPriceCache {
  updatedAt: number;
  prices: Record<string, MarketPriceEntry>;
}

let memoryCache: ServerPriceCache | null = null;
let lastRequestTs = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rate limiter: max ~2 req/sec (500ms spacing) with exponential backoff on 429/5xx */
async function rateLimitedFetch(url: string, init?: RequestInit, retries = 2): Promise<Response> {
  const now = Date.now();
  const waitMs = Math.max(0, 480 - (now - lastRequestTs));
  if (waitMs > 0) await sleep(waitMs);
  lastRequestTs = Date.now();

  const res = await fetch(url, init);
  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    await sleep(600 * (3 - retries));
    return rateLimitedFetch(url, init, retries - 1);
  }
  return res;
}

async function refreshApiKeyIfExpired(): Promise<string> {
  try {
    const res = await fetch(
      `https://www.tcgthailand.com/product?category_ids=${TCG_CATEGORY_ID}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } }
    );
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/xApiKey:"([^"]+)"/);
      if (match?.[1]) {
        activeApiKey = match[1];
      }
    }
  } catch {
    // Keep existing key
  }
  return activeApiKey;
}

function loadInitialSnapshot(): Record<string, MarketPriceEntry> {
  try {
    if (fs.existsSync(INITIAL_SNAPSHOT_FILE)) {
      const raw = JSON.parse(fs.readFileSync(INITIAL_SNAPSHOT_FILE, "utf8"));
      return raw?.prices ?? {};
    }
  } catch {
    // ignore
  }
  return {};
}

export function loadServerPriceCache(): ServerPriceCache {
  if (memoryCache) return memoryCache;

  const basePrices = loadInitialSnapshot();
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as ServerPriceCache;
      memoryCache = {
        updatedAt: raw.updatedAt || Date.now(),
        prices: { ...basePrices, ...(raw.prices ?? {}) },
      };
      return memoryCache;
    }
  } catch {
    // fallback to snapshot
  }
  memoryCache = { updatedAt: Date.now(), prices: basePrices };
  return memoryCache;
}

function persistServerPriceCache(cache: ServerPriceCache) {
  memoryCache = cache;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch {
    // Read-only filesystems (e.g. serverless) gracefully fall back to in-memory cache
  }
}

function normalizeRarity(r?: string): string {
  if (!r || r === "-") return "C";
  if (r === "SEC") return "SCR";
  return r;
}

interface TcgProductDto {
  id: string;
  name: string;
  product_code?: string;
  rarity?: string;
  min_price?: string | number;
  stock_quantity?: number;
  condition?: string;
  printing?: string;
}

function mapProductToMarketEntry(p: TcgProductDto): MarketPriceEntry | null {
  if (!p.product_code) return null;
  const rare = normalizeRarity(p.rarity);
  const key = `${p.product_code}__${rare}`;
  const priceNum = Number(p.min_price ?? 0);
  return {
    key,
    print: p.product_code,
    rare,
    name: p.name,
    tcgProductId: p.id,
    minPriceTHB: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null,
    stockCount: Number(p.stock_quantity ?? 0),
    condition: p.condition || "Near Mint (NM)",
    printing: p.printing || "",
    productUrl: `https://www.tcgthailand.com/product/${p.id}`,
    searchUrl: `https://www.tcgthailand.com/product?category_ids=${TCG_CATEGORY_ID}&search=${encodeURIComponent(
      p.name
    )}`,
    fetchedAt: Date.now(),
    source: "tcgthailand",
  };
}

async function fetchTcgApiJson(url: string): Promise<{ ok: boolean; data?: { products?: TcgProductDto[]; pagination?: { total_pages?: number } } }> {
  let res = await rateLimitedFetch(url, {
    headers: {
      "User-Agent": "MyBOTCollection/1.0",
      Accept: "application/json",
      "X-Api-Key": activeApiKey,
    },
  });

  if (res.status === 401) {
    await refreshApiKeyIfExpired();
    res = await rateLimitedFetch(url, {
      headers: {
        "User-Agent": "MyBOTCollection/1.0",
        Accept: "application/json",
        "X-Api-Key": activeApiKey,
      },
    });
  }

  if (!res.ok) return { ok: false };
  const json = await res.json();
  return { ok: true, data: json?.data };
}

export async function fetchPricesByCardNames(
  names: string[],
  forceRefresh = false
): Promise<Record<string, MarketPriceEntry>> {
  const cache = loadServerPriceCache();
  const now = Date.now();
  const result: Record<string, MarketPriceEntry> = {};
  const uniqueNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));

  const namesToFetch: string[] = [];

  for (const name of uniqueNames) {
    const cachedMatches = Object.values(cache.prices).filter(
      (p) => p.name === name && now - p.fetchedAt < CACHE_TTL_MS && p.source === "tcgthailand"
    );
    if (!forceRefresh && cachedMatches.length > 0) {
      for (const m of cachedMatches) result[m.key] = m;
    } else {
      namesToFetch.push(name);
    }
  }

  let updatedAny = false;
  for (const name of namesToFetch.slice(0, 25)) {
    const url = `${TCG_API_BASE}/member/products/search?category_ids=${TCG_CATEGORY_ID}&search=${encodeURIComponent(
      name
    )}&page=1&page_size=50`;
    try {
      const apiRes = await fetchTcgApiJson(url);
      if (apiRes.ok && apiRes.data?.products) {
        for (const prod of apiRes.data.products) {
          const entry = mapProductToMarketEntry(prod);
          if (entry) {
            cache.prices[entry.key] = entry;
            result[entry.key] = entry;
            updatedAny = true;
          }
        }
      }
    } catch {
      // Fallback to cached snapshot for this card if live fetch fails
      for (const p of Object.values(cache.prices)) {
        if (p.name === name) result[p.key] = p;
      }
    }
  }

  // Also include any snapshot matches for names that had no live hits
  for (const name of uniqueNames) {
    for (const p of Object.values(cache.prices)) {
      if (p.name === name && !result[p.key]) {
        result[p.key] = p;
      }
    }
  }

  if (updatedAny) {
    cache.updatedAt = Date.now();
    persistServerPriceCache(cache);
  }
  return result;
}

export async function fetchPricesBySetCodes(
  setCodes: string[],
  forceRefresh = false
): Promise<Record<string, MarketPriceEntry>> {
  const cache = loadServerPriceCache();
  const now = Date.now();
  const result: Record<string, MarketPriceEntry> = {};
  const setsMap = setsConfig.sets as Record<string, { id: string; name: string }>;
  let updatedAny = false;

  for (const rawCode of setCodes) {
    const setCode = rawCode.toUpperCase();
    const setMeta = setsMap[setCode];
    if (!setMeta) continue;

    const existingForSet = Object.values(cache.prices).filter(
      (p) =>
        p.print.startsWith(`${setCode}-`) &&
        now - p.fetchedAt < CACHE_TTL_MS &&
        p.source === "tcgthailand"
    );
    if (!forceRefresh && existingForSet.length > 0) {
      for (const m of existingForSet) result[m.key] = m;
      continue;
    }

    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= 5) {
      const url = `${TCG_API_BASE}/member/products/search?category_ids=${TCG_CATEGORY_ID}&set_ids=${setMeta.id}&page=${page}&page_size=200`;
      try {
        const apiRes = await fetchTcgApiJson(url);
        if (!apiRes.ok || !apiRes.data?.products) break;
        totalPages = apiRes.data.pagination?.total_pages ?? 1;
        for (const prod of apiRes.data.products) {
          const entry = mapProductToMarketEntry(prod);
          if (entry) {
            cache.prices[entry.key] = entry;
            result[entry.key] = entry;
            updatedAny = true;
          }
        }
        page++;
      } catch {
        break;
      }
    }
  }

  if (updatedAny) {
    cache.updatedAt = Date.now();
    persistServerPriceCache(cache);
  }
  return result;
}

export async function fetchBottcgPriceBridge(
  print: string,
  rare: string
): Promise<{ productId?: string; price?: number; lastSold?: number } | null> {
  const cardId = print.startsWith("PRMO")
    ? `PRMO-${print.split("-")[1]}`
    : rare === "C"
    ? print
    : rare === "SEC"
    ? `${print}-SCR`
    : `${print}-${rare}`;

  try {
    const res = await fetch(`https://bottcg.com/api/prices?cardId=${encodeURIComponent(cardId)}`, {
      headers: { "User-Agent": "MyBOTCollection/1.0" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.success && json.data?.[cardId]) {
      return json.data[cardId];
    }
  } catch {
    // ignore
  }
  return null;
}
