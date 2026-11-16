import setsConfig from "../../../src/data/tcgthailand-sets.json";

const TCG_API_BASE = "https://api.tcgthailand.com/api/v1";
const TCG_CATEGORY_ID = setsConfig.categoryId;
let activeApiKey = "b3f1c8d7-7c8e-4a1f-bc89-4fd0d8c216f3";

interface PagesContext {
  request: Request;
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

function normalizeRarity(r?: string): string {
  if (!r || r === "-") return "C";
  if (r === "SEC") return "SCR";
  return r;
}

function mapProduct(p: TcgProductDto) {
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

async function refreshApiKeyIfExpired() {
  try {
    const res = await fetch(
      `https://www.tcgthailand.com/product?category_ids=${TCG_CATEGORY_ID}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/xApiKey:"([^"]+)"/);
      if (match?.[1]) activeApiKey = match[1];
    }
  } catch {
    // ignore
  }
}

async function queryTcg(url: string): Promise<TcgProductDto[]> {
  let res = await fetch(url, {
    headers: {
      "User-Agent": "MyBOTCollection/1.0",
      Accept: "application/json",
      "X-Api-Key": activeApiKey,
    },
  });
  if (res.status === 401) {
    await refreshApiKeyIfExpired();
    res = await fetch(url, {
      headers: {
        "User-Agent": "MyBOTCollection/1.0",
        Accept: "application/json",
        "X-Api-Key": activeApiKey,
      },
    });
  }
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: { products?: TcgProductDto[] } };
  return json?.data?.products ?? [];
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const onRequestGet = async ({ request }: PagesContext) => {
  const url = new URL(request.url);
  const namesParam = url.searchParams.get("names");
  const setParam = url.searchParams.get("setCode") || url.searchParams.get("setCodes");
  const setsMap = setsConfig.sets as Record<string, { id: string; name: string }>;
  const combined: Record<string, unknown> = {};

  if (setParam) {
    for (const rawCode of setParam.split(",").map((s) => s.trim()).filter(Boolean)) {
      const meta = setsMap[rawCode.toUpperCase()];
      if (!meta) continue;
      const products = await queryTcg(
        `${TCG_API_BASE}/member/products/search?category_ids=${TCG_CATEGORY_ID}&set_ids=${meta.id}&page=1&page_size=200`
      );
      for (const p of products) {
        const mapped = mapProduct(p);
        if (mapped) combined[mapped.key] = mapped;
      }
    }
  }

  if (namesParam) {
    for (const name of namesParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20)) {
      const products = await queryTcg(
        `${TCG_API_BASE}/member/products/search?category_ids=${TCG_CATEGORY_ID}&search=${encodeURIComponent(
          name
        )}&page=1&page_size=50`
      );
      for (const p of products) {
        const mapped = mapProduct(p);
        if (mapped) combined[mapped.key] = mapped;
      }
    }
  }

  return jsonResponse({
    success: true,
    updatedAt: Date.now(),
    count: Object.keys(combined).length,
    prices: combined,
  });
};

export const onRequestPost = async ({ request }: PagesContext) => {
  try {
    const body = (await request.json()) as {
      names?: string[];
      setCodes?: string[];
    };
    const setsMap = setsConfig.sets as Record<string, { id: string; name: string }>;
    const combined: Record<string, unknown> = {};

    for (const rawCode of (body.setCodes ?? []).slice(0, 6)) {
      const meta = setsMap[rawCode.toUpperCase()];
      if (!meta) continue;
      const products = await queryTcg(
        `${TCG_API_BASE}/member/products/search?category_ids=${TCG_CATEGORY_ID}&set_ids=${meta.id}&page=1&page_size=200`
      );
      for (const p of products) {
        const mapped = mapProduct(p);
        if (mapped) combined[mapped.key] = mapped;
      }
    }

    for (const name of (body.names ?? []).slice(0, 25)) {
      const products = await queryTcg(
        `${TCG_API_BASE}/member/products/search?category_ids=${TCG_CATEGORY_ID}&search=${encodeURIComponent(
          name
        )}&page=1&page_size=50`
      );
      for (const p of products) {
        const mapped = mapProduct(p);
        if (mapped) combined[mapped.key] = mapped;
      }
    }

    return jsonResponse({
      success: true,
      updatedAt: Date.now(),
      count: Object.keys(combined).length,
      prices: combined,
    });
  } catch (err) {
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : "Proxy error" },
      500
    );
  }
};
