"use client";

import React, { useState } from "react";
import {
  X,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Plus,
  Minus,
  PackageCheck,
} from "lucide-react";
import {
  getTcgThailandSearchUrl,
  HOLO_RARITIES,
  RARITY_RANK,
} from "@/lib/catalog";
import { setVariantQuantity, upsertPricesToCache } from "@/lib/db";
import { calculateConceptOwnership, getVariantMarketPrice } from "@/lib/playset-engine";
import { getCardBanInfo } from "@/lib/sin-list-validator";
import type {
  CardConcept,
  CollectionEntry,
  MarketPriceEntry,
} from "@/lib/types";

interface CardDetailDrawerProps {
  concept: CardConcept | null;
  onClose: () => void;
  ownedByVariant: Map<string, CollectionEntry>;
  priceMap: Map<string, MarketPriceEntry>;
  onPricesUpdated: (prices: Record<string, MarketPriceEntry>) => void;
}

const COLOR_BADGE_MAP: Record<string, string> = {
  แดง: "bg-red-500/15 text-red-500 border-red-500/30",
  ฟ้า: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  เขียว: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  ม่วง: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  ไม่มีสี: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const RARITY_BADGE_MAP: Record<string, string> = {
  C: "bg-slate-600 text-white",
  R: "bg-blue-600 text-white",
  SR: "bg-purple-600 text-white",
  UR: "bg-amber-500 text-slate-950",
  PR: "bg-white text-slate-900 border border-slate-400",
  CBR: "bg-amber-700 text-white",
  SCR: "bg-gradient-to-r from-pink-500 via-amber-400 to-cyan-400 text-slate-950",
  USEC: "bg-gradient-to-r from-red-600 to-zinc-900 text-white border border-red-400",
};

export function CardDetailDrawer({
  concept,
  onClose,
  ownedByVariant,
  priceMap,
  onPricesUpdated,
}: CardDetailDrawerProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (!concept) return null;

  const sortedVariants = [...concept.variants].sort(
    (a, b) => (RARITY_RANK[a.rare] ?? 99) - (RARITY_RANK[b.rare] ?? 99)
  );
  const activeVariant =
    sortedVariants.find((v) => v.id === selectedVariantId) ?? sortedVariants[0];

  const totalOwnedForName = sortedVariants.reduce(
    (sum, v) => sum + (ownedByVariant.get(v.id)?.totalQty ?? 0),
    0
  );
  const ownership = calculateConceptOwnership(
    concept.name,
    concept.playsetTarget,
    totalOwnedForName
  );
  const banInfos = getCardBanInfo(activeVariant);
  const activePrice = getVariantMarketPrice(activeVariant, priceMap, concept);

  async function handleRefreshMarket() {
    if (!concept) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/market/tcgthailand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names: [concept.name],
          forceRefresh: true,
          fallbackPrint: activeVariant.print,
          fallbackRare: activeVariant.rare,
        }),
      });
      const json = await res.json();
      if (json?.success && json.prices) {
        const entries = Object.values(json.prices) as MarketPriceEntry[];
        await upsertPricesToCache(entries);
        onPricesUpdated(json.prices);
      }
    } catch {
      // handled silently
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-end bg-black/70 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`รายละเอียดการ์ด ${concept.name}`}
    >
      <div
        className="w-full md:max-w-2xl h-[90dvh] md:h-full bg-white dark:bg-slate-900 border-t md:border-l border-slate-200 dark:border-slate-800 rounded-t-2xl md:rounded-none flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                {concept.name}
              </h2>
              {concept.ex && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    concept.ex === "ลำเอียง"
                      ? "bg-red-600 text-white"
                      : concept.ex === "Only #1"
                      ? "bg-amber-500 text-slate-950"
                      : "bg-pink-500/20 text-pink-400"
                  }`}
                >
                  {concept.ex}
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              {activeVariant.print} • {activeVariant.rare} •{" "}
              {concept.soi === 0 ? "ซอย อัดมั่ว" : `ซอย ${concept.soi}`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Top card preview + stats */}
          <div className="grid grid-cols-1 sm:grid-cols-[190px_1fr] gap-5">
            <div className="mx-auto sm:mx-0 w-44 sm:w-full">
              <div className="relative aspect-[249/339] rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-lg">
                <img
                  src={activeVariant.imageUrl}
                  alt={activeVariant.name}
                  className="w-full h-full object-cover"
                />
                {HOLO_RARITIES.has(activeVariant.rare) && (
                  <div
                    className="absolute inset-0 pointer-events-none animate-holo-shimmer opacity-45"
                    style={{
                      background:
                        "linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.28) 40%, rgba(255,200,80,0.22) 50%, transparent 70%)",
                      backgroundSize: "250% 100%",
                    }}
                  />
                )}
              </div>
            </div>

            <div className="space-y-3">
              {/* Playset Summary Card */}
              <div className="rounded-xl p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <PackageCheck className="w-4 h-4 text-amber-500" />
                    สถานะ Playset (ชุดเล่น)
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      ownership.isPlaysetComplete
                        ? "text-emerald-500"
                        : "text-amber-500"
                    }`}
                  >
                    {ownership.playsetFilled}/{ownership.playsetTarget} ใบ
                    {ownership.surplusCopies > 0 && (
                      <span className="ml-1.5 text-cyan-400">
                        (+{ownership.surplusCopies} ซ้ำ)
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      ownership.isPlaysetComplete ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{
                      width: `${
                        ownership.playsetTarget > 0
                          ? Math.min(
                              100,
                              (ownership.playsetFilled / ownership.playsetTarget) * 100
                            )
                          : 100
                      }%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  สะสมรวมทั้งหมดทุกพิมพ์:{" "}
                  <strong className="text-slate-900 dark:text-white font-mono">
                    {ownership.totalOwned}
                  </strong>{" "}
                  ใบ •{" "}
                  {ownership.missingForPlayset > 0
                    ? `ยังขาดอีก ${ownership.missingForPlayset} ใบเพื่อครบชุดเล่น`
                    : ownership.surplusCopies > 0
                    ? `มีใบซ้ำพร้อมขาย/เทรด ${ownership.surplusCopies} ใบ`
                    : "ครบชุดเล่นพอดี"}
                </p>
              </div>

              {/* Badges & Numeric Stats */}
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  {concept.type}
                  {concept.subtype ? ` • ${concept.subtype}` : ""}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    COLOR_BADGE_MAP[concept.color] ?? COLOR_BADGE_MAP["ไม่มีสี"]
                  }`}
                >
                  สี{concept.color}
                </span>
                {concept.symbol && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                    {concept.symbol}
                  </span>
                )}
              </div>

              {(concept.type === "Avatar" ||
                concept.type === "Construct" ||
                concept.type === "Magic") && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
                    <div className="text-[11px] text-slate-500">
                      {concept.type === "Magic" ? "เจม (Cost)" : "ค่าร่าย"}
                    </div>
                    <div className="text-base font-bold font-mono">{concept.cost}</div>
                  </div>
                  {concept.type !== "Magic" && (
                    <>
                      <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
                        <div className="text-[11px] text-slate-500">เจม (Gem)</div>
                        <div className="text-base font-bold font-mono">{concept.gem}</div>
                      </div>
                      <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
                        <div className="text-[11px] text-slate-500">พลัง (Power)</div>
                        <div className="text-base font-bold font-mono">{concept.power}</div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Market Price Quick Box */}
              <div className="rounded-xl p-3.5 bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                    ราคาตลาด TCG Thailand ({activeVariant.print} • {activeVariant.rare})
                  </div>
                  <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                    {activePrice.price !== null
                      ? `เริ่มต้น ฿${activePrice.price.toLocaleString("th-TH")}`
                      : "ยังไม่พบเรทราคา"}
                  </div>
                  {activePrice.entry && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      สต็อกในตลาด {activePrice.entry.stockCount} ใบ • สภาพ{" "}
                      {activePrice.entry.condition || "NM"}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefreshMarket}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                    />
                    อัปเดตราคา
                  </button>
                  <a
                    href={
                      activePrice.entry?.productUrl ||
                      getTcgThailandSearchUrl(concept.name)
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
                  >
                    TCG Thailand
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Sin-List Warnings */}
          {banInfos.length > 0 && (
            <div className="rounded-xl p-3.5 bg-red-500/10 border border-red-500/30 space-y-1.5">
              <div className="text-xs font-bold text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                สถานะการ์ดบาป / กฎพิเศษ
              </div>
              {banInfos.map((info, idx) => (
                <p key={idx} className="text-xs text-red-400">
                  • {info.message}
                </p>
              ))}
            </div>
          )}

          {/* Effect Text */}
          {concept.mainEffect && (
            <div className="rounded-xl p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
              <div className="text-xs font-semibold text-slate-500 mb-1">ความสามารถการ์ด</div>
              <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line">
                {concept.mainEffect}
              </p>
            </div>
          )}

          {/* All Prints & Rarities Breakdown */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2.5 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              จัดการจำนวนแยกตามรหัสพิมพ์ & ระดับความหายาก ({sortedVariants.length} แบบ)
            </h3>

            <div className="space-y-2.5">
              {sortedVariants.map((variant) => {
                const entry = ownedByVariant.get(variant.id);
                const qtyStd = entry?.qtyStandard ?? 0;
                const qtyFoil = entry?.qtyFoil ?? 0;
                const qtyFirst = entry?.qtyFirstEd ?? 0;
                const vPrice = getVariantMarketPrice(variant, priceMap);
                const isSelected = variant.id === activeVariant.id;

                return (
                  <div
                    key={variant.id}
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={`rounded-xl p-3 border transition-colors cursor-pointer ${
                      isSelected
                        ? "border-amber-500 bg-amber-500/5"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-slate-400 dark:hover:border-slate-600"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-black font-mono ${
                            RARITY_BADGE_MAP[variant.rare] ?? "bg-slate-600 text-white"
                          }`}
                        >
                          {variant.rare}
                        </span>
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          {variant.print}
                        </span>
                        {variant.dropRate && (
                          <span className="text-[11px] text-slate-500">
                            ({variant.dropRate})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-amber-500">
                          {vPrice.price !== null
                            ? `฿${vPrice.price.toLocaleString("th-TH")}`
                            : "N/A"}
                        </span>
                        {vPrice.entry && (
                          <span className="text-[11px] text-slate-500">
                            (สต็อก {vPrice.entry.stockCount})
                          </span>
                        )}
                        <a
                          href={
                            vPrice.entry?.productUrl ||
                            getTcgThailandSearchUrl(variant.name)
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-sky-500 hover:underline inline-flex items-center gap-0.5"
                        >
                          ซื้อ
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* 3 Finish Counters: Standard / Foil / 1st Ed */}
                    <div
                      className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(
                        [
                          { label: "ปกติ (Standard)", field: "qtyStandard", val: qtyStd },
                          { label: "ฟอยล์ (Foil)", field: "qtyFoil", val: qtyFoil },
                          { label: "1st Edition", field: "qtyFirstEd", val: qtyFirst },
                        ] as const
                      ).map((finish) => (
                        <div
                          key={finish.field}
                          className="flex items-center justify-between gap-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5"
                        >
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">
                            {finish.label}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`ลด ${finish.label} ${variant.print}`}
                              onClick={() =>
                                setVariantQuantity({
                                  variantKey: variant.id,
                                  print: variant.print,
                                  rare: variant.rare,
                                  name: variant.name,
                                  [finish.field]: Math.max(0, finish.val - 1),
                                })
                              }
                              className="w-6 h-6 rounded flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={0}
                              aria-label={`จำนวน ${finish.label} ${variant.print}`}
                              value={finish.val}
                              onChange={(e) =>
                                setVariantQuantity({
                                  variantKey: variant.id,
                                  print: variant.print,
                                  rare: variant.rare,
                                  name: variant.name,
                                  [finish.field]: Math.max(
                                    0,
                                    parseInt(e.target.value || "0", 10) || 0
                                  ),
                                })
                              }
                              className="w-11 text-center font-mono text-xs font-bold bg-transparent focus:outline-none"
                            />
                            <button
                              type="button"
                              aria-label={`เพิ่ม ${finish.label} ${variant.print}`}
                              onClick={() =>
                                setVariantQuantity({
                                  variantKey: variant.id,
                                  print: variant.print,
                                  rare: variant.rare,
                                  name: variant.name,
                                  [finish.field]: finish.val + 1,
                                })
                              }
                              className="w-6 h-6 rounded flex items-center justify-center bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
