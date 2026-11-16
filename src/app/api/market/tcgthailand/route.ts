import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchBottcgPriceBridge,
  fetchPricesByCardNames,
  fetchPricesBySetCodes,
  loadServerPriceCache,
} from "@/lib/market-server";

const MarketQueryBodySchema = z.object({
  names: z.array(z.string().min(1)).max(50).optional(),
  setCodes: z.array(z.string().min(2)).max(10).optional(),
  forceRefresh: z.boolean().optional(),
  fallbackPrint: z.string().optional(),
  fallbackRare: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const namesParam = sp.get("names");
  const setParam = sp.get("setCode") || sp.get("setCodes");
  const allSnapshot = sp.get("snapshot") === "1";
  const forceRefresh = sp.get("refresh") === "1";

  if (allSnapshot) {
    const cache = loadServerPriceCache();
    return NextResponse.json({
      success: true,
      updatedAt: cache.updatedAt,
      count: Object.keys(cache.prices).length,
      prices: cache.prices,
    });
  }

  const combined: Record<string, unknown> = {};

  if (setParam) {
    const sets = setParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const setPrices = await fetchPricesBySetCodes(sets, forceRefresh);
    Object.assign(combined, setPrices);
  }

  if (namesParam) {
    const names = namesParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const namePrices = await fetchPricesByCardNames(names, forceRefresh);
    Object.assign(combined, namePrices);
  }

  if (!setParam && !namesParam) {
    const cache = loadServerPriceCache();
    return NextResponse.json({
      success: true,
      updatedAt: cache.updatedAt,
      count: Object.keys(cache.prices).length,
      prices: cache.prices,
    });
  }

  return NextResponse.json({
    success: true,
    updatedAt: Date.now(),
    count: Object.keys(combined).length,
    prices: combined,
  });
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = MarketQueryBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid market query payload" },
        { status: 400 }
      );
    }

    const { names, setCodes, forceRefresh, fallbackPrint, fallbackRare } = parsed.data;
    const combined: Record<string, unknown> = {};

    if (setCodes && setCodes.length > 0) {
      const setRes = await fetchPricesBySetCodes(setCodes, !!forceRefresh);
      Object.assign(combined, setRes);
    }

    if (names && names.length > 0) {
      const nameRes = await fetchPricesByCardNames(names, !!forceRefresh);
      Object.assign(combined, nameRes);
    }

    let bridgeFallback = null;
    if (Object.keys(combined).length === 0 && fallbackPrint && fallbackRare) {
      bridgeFallback = await fetchBottcgPriceBridge(fallbackPrint, fallbackRare);
    }

    return NextResponse.json({
      success: true,
      updatedAt: Date.now(),
      count: Object.keys(combined).length,
      prices: combined,
      bridgeFallback,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch market prices",
      },
      { status: 500 }
    );
  }
}
