"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Award,
  Wallet,
  TrendingUp,
  Share2,
  Download,
  Upload,
  Copy,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import {
  exportBackupJson,
  exportCollectionCsv,
  generateCommunityPostText,
  parseBackupJson,
  parseCollectionCsv,
} from "@/lib/backup";
import { db } from "@/lib/db";
import { analyzeDeckGap } from "@/lib/deck-importer";
import { calculateCollectionAnalytics } from "@/lib/playset-engine";
import type {
  CatalogIndex,
  CollectionEntry,
  MarketPriceEntry,
  SavedDeck,
} from "@/lib/types";

interface AnalyticsViewProps {
  catalog: CatalogIndex;
  collectionEntries: CollectionEntry[];
  decks: SavedDeck[];
  activeDeckId: string | null;
  priceMap: Map<string, MarketPriceEntry>;
}

type AnalyticsTab = "completion" | "valuation" | "deck-sim" | "trade-backup";

export function AnalyticsView({
  catalog,
  collectionEntries,
  decks,
  activeDeckId,
  priceMap,
}: AnalyticsViewProps) {
  const [tab, setTab] = useState<AnalyticsTab>("completion");
  const [completionDimension, setCompletionDimension] = useState<
    "setGroup" | "setCode" | "soi" | "color" | "rarity"
  >("setGroup");
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(activeDeckId);
  const [postMode, setPostMode] = useState<"hunting" | "surplus">("hunting");
  const [copiedPost, setCopiedPost] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const analytics = useMemo(
    () => calculateCollectionAnalytics(catalog, collectionEntries, priceMap),
    [catalog, collectionEntries, priceMap]
  );

  const simDeck = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) ?? decks[0] ?? null,
    [decks, selectedDeckId]
  );

  const simGap = useMemo(
    () =>
      simDeck
        ? analyzeDeckGap(simDeck, catalog, collectionEntries, priceMap, "cross-print")
        : null,
    [simDeck, catalog, collectionEntries, priceMap]
  );

  const completionRows = useMemo(() => {
    switch (completionDimension) {
      case "setCode":
        return analytics.bySetCode;
      case "soi":
        return analytics.bySoi;
      case "color":
        return analytics.byColor;
      case "rarity":
        return analytics.byRarity;
      default:
        return analytics.bySetGroup;
    }
  }, [analytics, completionDimension]);

  const communityPost = useMemo(
    () => generateCommunityPostText(postMode, analytics, 25),
    [postMode, analytics]
  );

  function triggerDownload(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportJsonBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupMsg(null);
    try {
      const parsed = parseBackupJson(await file.text());
      await db.collection.clear();
      await db.collection.bulkPut(parsed.collection);
      await db.decks.clear();
      await db.decks.bulkPut(parsed.decks);
      setBackupMsg(
        `กู้คืนข้อมูลสำเร็จ: การ์ด ${parsed.collection.length} รายการ และเด็ค ${parsed.decks.length} เด็ค`
      );
    } catch (err) {
      setBackupMsg(
        `เกิดข้อผิดพลาดในการตรวจสอบไฟล์ JSON (Zod): ${
          err instanceof Error ? err.message : "Invalid file"
        }`
      );
    }
    e.target.value = "";
  }

  async function handleImportCsvBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupMsg(null);
    try {
      const entries = parseCollectionCsv(await file.text(), catalog);
      await db.collection.bulkPut(entries);
      setBackupMsg(`นำเข้า CSV สำเร็จ (${entries.length} รายการ)`);
    } catch (err) {
      setBackupMsg(
        `นำเข้า CSV ล้มเหลว: ${err instanceof Error ? err.message : "Invalid CSV"}`
      );
    }
    e.target.value = "";
  }

  function handleDownloadSummaryPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 1080;
    canvas.height = 1350;

    // Background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Accent bar
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(0, 0, canvas.width, 16);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(
      postMode === "hunting"
        ? "ใบประกาศตามหาการ์ด (Hunting List)"
        : "ใบประกาศปล่อย/เทรดใบซ้ำ (Surplus Trade)",
      60,
      95
    );

    ctx.fillStyle = "#94a3b8";
    ctx.font = "24px sans-serif";
    ctx.fillText(
      `My BOT Collection • อ้างอิงราคา TCG Thailand (${new Date().toLocaleDateString("th-TH")})`,
      60,
      140
    );

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 175);
    ctx.lineTo(1020, 175);
    ctx.stroke();

    const lines = communityPost.split("\n").slice(1, 22);
    ctx.font = "26px sans-serif";
    let y = 230;
    for (const line of lines) {
      if (!line.trim()) continue;
      ctx.fillStyle = line.includes("฿") ? "#fbbf24" : "#f8fafc";
      ctx.fillText(line.slice(0, 68), 60, y);
      y += 48;
    }

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-bot-${postMode}-sheet.png`;
    a.click();
  }

  return (
    <div className="space-y-4">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" />
            Playsets Completion (4 ใบ/ชื่อ)
          </div>
          <div className="text-2xl font-bold font-mono mt-1">
            {analytics.playsetCompletionPct}%
          </div>
          <div className="text-[11px] text-slate-500">
            ครบชุดเล่น {analytics.completedPlaysetsCount} /{" "}
            {analytics.totalPlaysetConcepts} ชื่อ
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Master Set (รายรหัส &amp; แรร์)
          </div>
          <div className="text-2xl font-bold font-mono mt-1">
            {analytics.masterVariantPct}%
          </div>
          <div className="text-[11px] text-slate-500">
            {analytics.masterOwnedVariants} / {analytics.masterTotalVariants} Variants (
            {analytics.masterOwnedPrints}/{analytics.masterTotalPrints} Prints)
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-emerald-500" />
            มูลค่าคลังการ์ดรวม (TCG TH)
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-500 mt-1">
            ฿{analytics.totalPortfolioValueTHB.toLocaleString("th-TH")}
          </div>
          <div className="text-[11px] text-slate-500">
            จำนวนสะสมทั้งหมด {analytics.totalCardsOwned.toLocaleString()} ใบ
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Share2 className="w-4 h-4 text-purple-400" />
            มูลค่าการ์ดซ้ำเกินชุดเล่น (Surplus)
          </div>
          <div
            data-testid="surplus-trade-value"
            className="text-2xl font-bold font-mono text-purple-400 mt-1"
          >
            ฿{analytics.totalSurplusTradeValueTHB.toLocaleString("th-TH")}
          </div>
          <div className="text-[11px] text-slate-500">
            ใบซ้ำเกินชุดเล่น {analytics.totalSurplusCopies.toLocaleString()} ใบ
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5">
        {(
          [
            { id: "completion", label: "1. Playset vs Master Set" },
            { id: "valuation", label: "2. พอร์ต & ใบซ้ำ (Surplus)" },
            { id: "deck-sim", label: "3. กราฟเด็ค & Budget Sim" },
            { id: "trade-backup", label: "4. ใบประกาศขาย/ตามหา & Backup" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`analytics-tab-${item.id}`}
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              tab === item.id
                ? "bg-amber-500 text-slate-950"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Playset & Master Completion */}
      {tab === "completion" && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">
              ความคืบหน้า Playset (4 ใบ/ชื่อ) เทียบ Master Set
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "setGroup", label: "กลุ่มชุด (BT/SD/KD...)" },
                  { id: "setCode", label: "รายชุด (BT01-BT12)" },
                  { id: "soi", label: "ซอย 1-4" },
                  { id: "color", label: "สี" },
                  { id: "rarity", label: "ความหายาก" },
                ] as const
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setCompletionDimension(d.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                    completionDimension === d.id
                      ? "bg-amber-500 text-slate-950"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completionRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="playsetPct"
                  name="Playset % (ครบชุดเล่น)"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="masterPct"
                  name="Master % (สะสมครบแรร์)"
                  fill="#06b6d4"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {completionRows.map((row) => (
              <div
                key={row.key}
                className="rounded-xl p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>{row.label}</span>
                  <span className="font-mono text-amber-500">
                    {row.playsetPct}% / {row.masterPct}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${Math.min(100, row.playsetPct)}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 flex justify-between font-mono">
                  <span>
                    Playset: {row.playsetOwnedCopies}/{row.playsetTargetCopies}
                  </span>
                  <span>
                    Master: {row.masterOwnedVariants}/{row.masterTotalVariants}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Portfolio & Surplus Trade Valuation */}
      {tab === "valuation" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-bold">อันดับการ์ดมูลค่าสูงสุดในคลังของคุณ</h3>
            {analytics.topValueCards.length === 0 ? (
              <p className="text-xs text-slate-500">
                ยังไม่มีการ์ดที่มีราคาตลาดในคลัง — เพิ่มจำนวนการ์ดในหน้า Binder เพื่อประเมินมูลค่า
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {analytics.topValueCards.map((item) => (
                  <div
                    key={item.variant.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">
                        {item.variant.name} ({item.variant.print} {item.variant.rare})
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        มี {item.qtyOwned} ใบ × ฿{item.unitPriceTHB.toLocaleString("th-TH")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold font-mono text-emerald-500">
                        ฿{item.totalValueTHB.toLocaleString("th-TH")}
                      </div>
                      <a
                        href={item.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-amber-500 hover:underline inline-flex items-center gap-0.5"
                      >
                        TCG TH <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-bold">
              การ์ดซ้ำเกินชุดเล่น (Surplus &gt;4 ใบ / Only #1 &gt;1) พร้อมปล่อยขาย/เทรด
            </h3>
            {analytics.surplusTradeItems.length === 0 ? (
              <p className="text-xs text-slate-500">
                ยังไม่มีการ์ดที่เก็บเกิน 4 ใบ (หรือเกิน 1 ใบสำหรับ Only #1 / Life)
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {analytics.surplusTradeItems.map((item) => (
                  <div
                    key={`surplus-${item.variant.id}`}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-purple-500/5 border border-purple-500/20"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">
                        {item.variant.name} ({item.variant.print} {item.variant.rare})
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        เกินชุดเล่น {item.surplusCopies} ใบ (จากที่มี {item.qtyOwned} ใบ)
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="text-xs font-bold text-purple-400">
                        +฿{item.surplusValueTHB.toLocaleString("th-TH")}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ฿{item.unitPriceTHB}/ใบ
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Deck Curve & Budget Simulator */}
      {tab === "deck-sim" && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">
              กราฟสมดุลค่าร่าย (Cost), เม็ดเจม (Gem) &amp; เปรียบเทียบงบแต่งเด็ค
            </h3>
            {decks.length > 0 && (
              <select
                aria-label="เลือกเด็คเพื่อวิเคราะห์"
                value={simDeck?.id ?? ""}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!simDeck || !simGap ? (
            <p className="text-xs text-slate-500">
              กรุณานำเข้าเด็คในแท็บ &quot;เด็คแข่งขัน&quot; ก่อนเพื่อดูกราฟสมดุล Cost/Gem และ Budget Simulator
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70">
                  <div className="text-xs font-bold mb-2">
                    กราฟค่าร่าย Main Deck (Cost 0–10+)
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={simGap.costCurve}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis dataKey="cost" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="จำนวนใบ" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70">
                  <div className="text-xs font-bold mb-2">
                    สัดส่วนเม็ดเจมสำหรับทิ้งจ่ายค่าร่าย (Gem 0–4)
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={simGap.gemCurve}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis dataKey="gem" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="จำนวนใบ" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl p-3.5 bg-emerald-500/10 border border-emerald-500/30">
                  <div className="text-xs font-semibold text-emerald-500">
                    สายประหยัด (พิมพ์ต่ำสุดบน TCG Thailand)
                  </div>
                  <div className="text-xl font-bold font-mono mt-1">
                    ขาด ฿{simGap.budgetTotalMissingTHB.toLocaleString("th-TH")} / ทั้งเด็ค ฿
                    {simGap.budgetFullDeckCostTHB.toLocaleString("th-TH")}
                  </div>
                </div>
                <div className="rounded-xl p-3.5 bg-purple-500/10 border border-purple-500/30">
                  <div className="text-xs font-semibold text-purple-400">
                    สายฟอยล์ / อาร์ตพิเศษ (แรร์สูงสุดบน TCG Thailand)
                  </div>
                  <div className="text-xl font-bold font-mono mt-1">
                    ขาด ฿{simGap.blingTotalMissingTHB.toLocaleString("th-TH")} / ทั้งเด็ค ฿
                    {simGap.blingFullDeckCostTHB.toLocaleString("th-TH")}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Shareable Hunting/Trade Sheet & Backup */}
      {tab === "trade-backup" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Hunting & Trade Sheet Generator */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">
                สร้างใบประกาศคอมมูนิตี้ (Hunting &amp; Trade Sheet)
              </h3>
              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setPostMode("hunting")}
                  className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                    postMode === "hunting"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  ตามหาการ์ดขาด
                </button>
                <button
                  type="button"
                  onClick={() => setPostMode("surplus")}
                  className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                    postMode === "surplus"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  ปล่อยใบซ้ำ (&gt;4)
                </button>
              </div>
            </div>

            <textarea
              readOnly
              rows={11}
              value={communityPost}
              className="w-full p-3 rounded-xl text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(communityPost);
                  setCopiedPost(true);
                  setTimeout(() => setCopiedPost(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedPost ? "คัดลอกข้อความแล้ว!" : "คัดลอกข้อความโพสต์"}
              </button>
              <button
                type="button"
                onClick={handleDownloadSummaryPng}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                ดาวน์โหลดรูปภาพสรุป (.PNG)
              </button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Data Backup & Portability */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <h3 className="text-sm font-bold">
              สำรองและย้ายข้อมูลคลังสะสม &amp; เด็ค (Zod-Validated JSON / CSV)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  triggerDownload(
                    `my-bot-backup-${new Date().toISOString().slice(0, 10)}.json`,
                    exportBackupJson(collectionEntries, decks),
                    "application/json"
                  )
                }
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                <Download className="w-4 h-4" />
                ส่งออกทั้งหมด (.JSON)
              </button>

              <button
                type="button"
                onClick={() =>
                  triggerDownload(
                    `my-bot-collection-${new Date().toISOString().slice(0, 10)}.csv`,
                    exportCollectionCsv(collectionEntries),
                    "text/csv;charset=utf-8;"
                  )
                }
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
              >
                <Download className="w-4 h-4" />
                ส่งออกคลังการ์ด (.CSV)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <label className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 cursor-pointer">
                <Upload className="w-4 h-4 text-amber-500" />
                นำเข้ากู้คืน (.JSON)
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJsonBackup}
                  className="hidden"
                />
              </label>

              <label className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 cursor-pointer">
                <Upload className="w-4 h-4 text-sky-500" />
                นำเข้าคลังการ์ด (.CSV)
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCsvBackup}
                  className="hidden"
                />
              </label>
            </div>

            {backupMsg && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
                {backupMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
