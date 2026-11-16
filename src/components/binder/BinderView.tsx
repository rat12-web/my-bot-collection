"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search,
  Filter,
  Plus,
  Minus,
  Layers,
  Grid,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { HOLO_RARITIES } from "@/lib/catalog";
import { adjustVariantStandardDelta, upsertPricesToCache } from "@/lib/db";
import { calculateConceptOwnership, getVariantMarketPrice } from "@/lib/playset-engine";
import { CardDetailDrawer } from "./CardDetailDrawer";
import type {
  CardConcept,
  CardVariant,
  CatalogIndex,
  CollectionEntry,
  MarketPriceEntry,
} from "@/lib/types";

interface BinderViewProps {
  catalog: CatalogIndex;
  ownedByName: Map<string, number>;
  ownedByVariant: Map<string, CollectionEntry>;
  priceMap: Map<string, MarketPriceEntry>;
  onPricesUpdated: (prices: Record<string, MarketPriceEntry>) => void;
}

type ViewMode = "concept" | "variant";
type OwnershipFilter = "all" | "owned" | "complete" | "missing" | "surplus";

export function BinderView({
  catalog,
  ownedByName,
  ownedByVariant,
  priceMap,
  onPricesUpdated,
}: BinderViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("concept");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSet, setSelectedSet] = useState("ALL");
  const [selectedSoi, setSelectedSoi] = useState("ALL");
  const [selectedColor, setSelectedColor] = useState("ALL");
  const [selectedType, setSelectedType] = useState("ALL");
  const [selectedRarity, setSelectedRarity] = useState("ALL");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [activeConcept, setActiveConcept] = useState<CardConcept | null>(null);
  const [syncingSet, setSyncingSet] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1120);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columnCount = useMemo(() => {
    if (containerWidth < 520) return 2;
    if (containerWidth < 768) return 3;
    if (containerWidth < 1024) return 4;
    if (containerWidth < 1320) return 5;
    return 6;
  }, [containerWidth]);

  // Build filtered items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (viewMode === "concept") {
      return catalog.concepts.filter((c) => {
        if (q) {
          const hitName = c.name.toLowerCase().includes(q);
          const hitEffect = c.mainEffect.toLowerCase().includes(q);
          const hitPrint = c.variants.some((v) => v.print.toLowerCase().includes(q));
          const hitCreator = c.variants.some((v) =>
            (v.creator || "").toLowerCase().includes(q)
          );
          if (!hitName && !hitEffect && !hitPrint && !hitCreator) return false;
        }
        if (
          selectedSet !== "ALL" &&
          !c.variants.some((v) => v.setCode === selectedSet)
        )
          return false;
        if (selectedSoi !== "ALL" && String(c.soi) !== selectedSoi) return false;
        if (selectedColor !== "ALL" && c.color !== selectedColor) return false;
        if (selectedType !== "ALL" && c.type !== selectedType) return false;
        if (
          selectedRarity !== "ALL" &&
          !c.variants.some((v) => v.rare === selectedRarity)
        )
          return false;

        const owned = ownedByName.get(c.name) ?? 0;
        const status = calculateConceptOwnership(c.name, c.playsetTarget, owned);
        if (ownershipFilter === "owned" && owned === 0) return false;
        if (ownershipFilter === "complete" && !status.isPlaysetComplete) return false;
        if (ownershipFilter === "missing" && status.missingForPlayset === 0) return false;
        if (ownershipFilter === "surplus" && status.surplusCopies === 0) return false;

        return true;
      });
    }

    // Master Set (variant mode)
    return catalog.variants.filter((v) => {
      if (q) {
        const hit =
          v.name.toLowerCase().includes(q) ||
          v.print.toLowerCase().includes(q) ||
          v.mainEffect.toLowerCase().includes(q) ||
          (v.creator || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (selectedSet !== "ALL" && v.setCode !== selectedSet) return false;
      if (selectedSoi !== "ALL" && String(v.soi) !== selectedSoi) return false;
      if (selectedColor !== "ALL" && v.color !== selectedColor) return false;
      if (selectedType !== "ALL" && v.type !== selectedType) return false;
      if (selectedRarity !== "ALL" && v.rare !== selectedRarity) return false;

      const qty = ownedByVariant.get(v.id)?.totalQty ?? 0;
      const totalNameQty = ownedByName.get(v.name) ?? 0;
      const status = calculateConceptOwnership(v.name, v.playsetTarget, totalNameQty);
      if (ownershipFilter === "owned" && qty === 0) return false;
      if (ownershipFilter === "complete" && !status.isPlaysetComplete) return false;
      if (ownershipFilter === "missing" && status.missingForPlayset === 0) return false;
      if (ownershipFilter === "surplus" && status.surplusCopies === 0) return false;

      return true;
    });
  }, [
    catalog,
    viewMode,
    searchQuery,
    selectedSet,
    selectedSoi,
    selectedColor,
    selectedType,
    selectedRarity,
    ownershipFilter,
    ownedByName,
    ownedByVariant,
  ]);

  const rowCount = Math.ceil(filteredItems.length / columnCount);
  const cardWidth = Math.max(140, (containerWidth - 32 - (columnCount - 1) * 12) / columnCount);
  const estimatedRowHeight = Math.round(cardWidth * (339 / 249)) + 108;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 3,
  });

  async function handleSyncCurrentSetPrices() {
    const targetSets =
      selectedSet !== "ALL" ? [selectedSet] : ["BT12", "B2SA", "B2SB", "RM01"];
    setSyncingSet(true);
    setSyncNotice(null);
    try {
      const res = await fetch("/api/market/tcgthailand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setCodes: targetSets, forceRefresh: true }),
      });
      const json = await res.json();
      if (json?.success && json.prices) {
        const entries = Object.values(json.prices) as MarketPriceEntry[];
        await upsertPricesToCache(entries);
        onPricesUpdated(json.prices);
        setSyncNotice(
          `อัปเดตราคา ${targetSets.join(", ")} สำเร็จ (${entries.length} รายการ)`
        );
      }
    } catch {
      setSyncNotice("ไม่สามารถเชื่อมต่อราคาตลาดได้ชั่วคราว (ใช้ราคาแคชล่าสุด)");
    } finally {
      setSyncingSet(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Top Filter & Mode Controls */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="ค้นหาการ์ด"
              placeholder="ค้นหาชื่อการ์ด, รหัสพิมพ์ (เช่น BT01-038), เอฟเฟกต์ หรือนักวาด..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-sm bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-amber-500 focus:bg-white dark:focus:bg-slate-950 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setViewMode("concept")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === "concept"
                    ? "bg-amber-500 text-slate-950 shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Playsets ({catalog.concepts.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("variant")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === "variant"
                    ? "bg-amber-500 text-slate-950 shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                Master ({catalog.variants.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                showFilters
                  ? "border-amber-500 bg-amber-500/10 text-amber-500"
                  : "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              ตัวกรอง
            </button>

            <button
              type="button"
              onClick={handleSyncCurrentSetPrices}
              disabled={syncingSet}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingSet ? "animate-spin" : ""}`} />
              {selectedSet !== "ALL"
                ? `อัปเดตราคา ${selectedSet}`
                : "อัปเดตราคาล่าสุด"}
            </button>
          </div>
        </div>

        {/* Expanded Filter Bar */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <select
              aria-label="ชุดการ์ด"
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
              className="px-2.5 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="ALL">ทุกชุดการ์ด ({catalog.sets.length})</option>
              {catalog.sets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              aria-label="ซอย"
              value={selectedSoi}
              onChange={(e) => setSelectedSoi(e.target.value)}
              className="px-2.5 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="ALL">ทุกซอย (SOI)</option>
              <option value="1">ซอย 1</option>
              <option value="2">ซอย 2</option>
              <option value="3">ซอย 3</option>
              <option value="0">ซอย 0 (อัดมั่ว)</option>
            </select>

            <select
              aria-label="สีการ์ด"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="px-2.5 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="ALL">ทุกสี</option>
              <option value="แดง">แดง</option>
              <option value="ฟ้า">ฟ้า</option>
              <option value="เขียว">เขียว</option>
              <option value="ม่วง">ม่วง</option>
              <option value="ไม่มีสี">ไม่มีสี</option>
            </select>

            <select
              aria-label="ประเภทการ์ด"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-2.5 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="ALL">ทุกประเภท</option>
              <option value="Avatar">Avatar</option>
              <option value="Magic">Magic</option>
              <option value="Construct">Construct</option>
              <option value="Life">Life</option>
              <option value="Token">Token</option>
            </select>

            <select
              aria-label="ระดับความหายาก"
              value={selectedRarity}
              onChange={(e) => setSelectedRarity(e.target.value)}
              className="px-2.5 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="ALL">ทุกระดับหายาก</option>
              {catalog.rarities.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              aria-label="สถานะการสะสม"
              value={ownershipFilter}
              onChange={(e) => setOwnershipFilter(e.target.value as OwnershipFilter)}
              className="px-2.5 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="all">สถานะ: ทั้งหมด</option>
              <option value="owned">มีในคลังแล้ว (&gt;0)</option>
              <option value="complete">ครบ Playset แล้ว</option>
              <option value="missing">ยังไม่ครบ Playset</option>
              <option value="surplus">มีใบซ้ำ Surplus (&gt;4)</option>
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            แสดงผล{" "}
            <strong className="font-mono text-slate-900 dark:text-white">
              {filteredItems.length.toLocaleString()}
            </strong>{" "}
            รายการ
          </span>
          {syncNotice && (
            <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {syncNotice}
            </span>
          )}
        </div>
      </div>

      {/* Virtualized 60fps Binder Grid */}
      <div
        ref={scrollContainerRef}
        className="h-[calc(100dvh-265px)] min-h-[440px] overflow-y-auto rounded-2xl bg-slate-100/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-3 sm:p-4"
        data-testid="binder-virtual-scroll"
      >
        {filteredItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm">
            ไม่พบการ์ดที่ตรงกับเงื่อนไขการค้นหา
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * columnCount;
              const rowItems = filteredItems.slice(startIndex, startIndex + columnCount);

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    display: "grid",
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                    gap: "12px",
                    paddingBottom: "12px",
                  }}
                >
                  {rowItems.map((item) => {
                    const isConcept = viewMode === "concept";
                    const concept = isConcept
                      ? (item as CardConcept)
                      : catalog.conceptByName.get((item as CardVariant).name)!;
                    const primaryVariant = isConcept
                      ? concept.defaultVariant
                      : (item as CardVariant);

                    const totalOwnedForName = ownedByName.get(concept.name) ?? 0;
                    const variantOwned =
                      ownedByVariant.get(primaryVariant.id)?.totalQty ?? 0;
                    const displayOwned = isConcept ? totalOwnedForName : variantOwned;
                    const ownership = calculateConceptOwnership(
                      concept.name,
                      concept.playsetTarget,
                      totalOwnedForName
                    );
                    const isOwned = displayOwned > 0;
                    const priceInfo = getVariantMarketPrice(
                      primaryVariant,
                      priceMap,
                      isConcept ? concept : undefined
                    );

                    return (
                      <article
                        key={isConcept ? concept.name : primaryVariant.id}
                        data-testid={`binder-card-${primaryVariant.print}`}
                        className={`group rounded-xl border transition-all duration-150 flex flex-col overflow-hidden ${
                          isOwned
                            ? "bg-white dark:bg-slate-900 border-amber-500/40 shadow-md shadow-amber-500/5"
                            : "bg-white/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        {/* Card Art Container */}
                        <button
                          type="button"
                          onClick={() => setActiveConcept(concept)}
                          className="relative w-full aspect-[249/339] overflow-hidden bg-slate-200 dark:bg-slate-800 cursor-pointer text-left"
                        >
                          <img
                            src={primaryVariant.imageUrl}
                            alt={primaryVariant.name}
                            loading="lazy"
                            className={`w-full h-full object-cover transition-all duration-200 ${
                              isOwned
                                ? "grayscale-0 opacity-100 group-hover:scale-[1.03]"
                                : "grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-90"
                            }`}
                          />

                          {isOwned && HOLO_RARITIES.has(primaryVariant.rare) && (
                            <div
                              className="absolute inset-0 pointer-events-none opacity-35"
                              style={{
                                background:
                                  "linear-gradient(115deg, transparent 25%, rgba(255,255,255,0.35) 50%, transparent 75%)",
                              }}
                            />
                          )}

                          {/* Top Badges */}
                          <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 pointer-events-none">
                            <span className="px-1.5 py-0.5 rounded bg-black/75 text-white font-mono text-[10px] font-bold">
                              {primaryVariant.print} • {primaryVariant.rare}
                            </span>
                            {priceInfo.price !== null && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono text-[10px] font-bold shadow-xs">
                                ฿{priceInfo.price.toLocaleString("th-TH")}
                              </span>
                            )}
                          </div>

                          {/* Bottom Playset Progress Pill */}
                          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 pointer-events-none">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono shadow-sm ${
                                ownership.surplusCopies > 0
                                  ? "bg-cyan-500 text-slate-950"
                                  : ownership.isPlaysetComplete
                                  ? "bg-emerald-500 text-slate-950"
                                  : totalOwnedForName > 0
                                  ? "bg-amber-400 text-slate-950"
                                  : "bg-slate-900/85 text-slate-300"
                              }`}
                            >
                              {concept.playsetTarget > 0
                                ? ownership.surplusCopies > 0
                                  ? `ครบ ${ownership.playsetFilled}/${ownership.playsetTarget} (+${ownership.surplusCopies} ซ้ำ)`
                                  : `${ownership.playsetFilled}/${ownership.playsetTarget}`
                                : `${totalOwnedForName} ใบ`}
                            </span>
                            {isConcept && concept.variants.length > 1 && (
                              <span className="px-1.5 py-0.5 rounded-full bg-black/75 text-white text-[10px] font-mono">
                                {concept.variants.length} แบบ
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Footer Info + Quick Steppers */}
                        <div className="p-2 flex flex-col gap-1.5 flex-1 justify-between">
                          <button
                            type="button"
                            onClick={() => setActiveConcept(concept)}
                            className="text-left cursor-pointer"
                          >
                            <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                              {concept.name}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                              {concept.type}
                              {concept.ex ? ` • ${concept.ex}` : ""}
                            </div>
                          </button>

                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                            <button
                              type="button"
                              aria-label={`ลดจำนวน ${primaryVariant.name}`}
                              onClick={() =>
                                adjustVariantStandardDelta(
                                  {
                                    variantKey: primaryVariant.id,
                                    print: primaryVariant.print,
                                    rare: primaryVariant.rare,
                                    name: primaryVariant.name,
                                  },
                                  -1
                                )
                              }
                              className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setActiveConcept(concept)}
                              className="flex-1 text-center font-mono text-xs font-bold text-slate-900 dark:text-white hover:text-amber-500 cursor-pointer"
                              title="คลิกเพื่อแก้ไขจำนวนแบบละเอียด / แยกฟอยล์"
                            >
                              {displayOwned} ใบ
                            </button>

                            <button
                              type="button"
                              aria-label={`เพิ่มจำนวน ${primaryVariant.name}`}
                              onClick={() =>
                                adjustVariantStandardDelta(
                                  {
                                    variantKey: primaryVariant.id,
                                    print: primaryVariant.print,
                                    rare: primaryVariant.rare,
                                    name: primaryVariant.name,
                                  },
                                  1
                                )
                              }
                              className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail & Rarity Variant Drawer */}
      <CardDetailDrawer
        concept={activeConcept}
        onClose={() => setActiveConcept(null)}
        ownedByVariant={ownedByVariant}
        priceMap={priceMap}
        onPricesUpdated={onPricesUpdated}
      />
    </div>
  );
}
