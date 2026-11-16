"use client";

import React, { useMemo, useState } from "react";
import {
  Download,
  FileText,
  Globe,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Copy,
  Trash2,
  Sparkles,
  Upload,
} from "lucide-react";
import { db, upsertPricesToCache } from "@/lib/db";
import {
  analyzeDeckGap,
  extractBottcgDeckUuid,
  formatOfficialDeckCode,
  normalizeBottcgDeck,
  parseDeckImportJsonOrCsv,
  parseDeckRecipeText,
} from "@/lib/deck-importer";
import { validateCompetitiveDeck } from "@/lib/sin-list-validator";
import type {
  CatalogIndex,
  CollectionEntry,
  DeckGapMatchMode,
  MarketPriceEntry,
  SavedDeck,
} from "@/lib/types";

interface PublicDeckSummary {
  id: number;
  uuid: string;
  name: string;
  coverCardPrint: string;
  coverCardRare: string;
  likesCount: number;
  viewsCount: string | number;
  isValid: boolean;
  user?: { name?: string };
}

interface DecksViewProps {
  catalog: CatalogIndex;
  collectionEntries: CollectionEntry[];
  decks: SavedDeck[];
  activeDeckId: string | null;
  onSelectDeck: (id: string) => void;
  priceMap: Map<string, MarketPriceEntry>;
  onPricesUpdated: (prices: Record<string, MarketPriceEntry>) => void;
}

const SAMPLE_COMPETITIVE_RECIPE = `# เด็คตัวอย่าง: ไกรลาส & ปากซอย (Tournament Legal)
# Main Deck
1x SD02-005
4x SD01-001
4x SD01-002
4x SD01-003
4x SD01-004
4x SD01-006
4x SD01-007
4x SD01-008
4x SD01-009
4x SD01-010
4x SD01-011
4x SD01-012
4x SD01-013
1x SD01-014

# Life Cards
1x SD01-021
1x SD01-022
1x SD01-023
1x SD01-024
1x SD01-025

# Side Deck
2x SD01-015`;

export function DecksView({
  catalog,
  collectionEntries,
  decks,
  activeDeckId,
  onSelectDeck,
  priceMap,
  onPricesUpdated,
}: DecksViewProps) {
  const [importTab, setImportTab] = useState<"recipe" | "bottcg" | "file">("recipe");
  const [deckNameInput, setDeckNameInput] = useState("");
  const [recipeText, setRecipeText] = useState("");
  const [bottcgUrl, setBottcgUrl] = useState("");
  const [publicDecks, setPublicDecks] = useState<PublicDeckSummary[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [gapMode, setGapMode] = useState<DeckGapMatchMode>("cross-print");
  const [refreshingDeckPrices, setRefreshingDeckPrices] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const activeDeck = useMemo(
    () => decks.find((d) => d.id === activeDeckId) ?? decks[0] ?? null,
    [decks, activeDeckId]
  );

  const validation = useMemo(
    () => (activeDeck ? validateCompetitiveDeck(activeDeck, catalog) : null),
    [activeDeck, catalog]
  );

  const gapReport = useMemo(
    () =>
      activeDeck
        ? analyzeDeckGap(activeDeck, catalog, collectionEntries, priceMap, gapMode)
        : null,
    [activeDeck, catalog, collectionEntries, priceMap, gapMode]
  );

  async function saveAndSelectDeck(deck: SavedDeck) {
    await db.decks.put(deck);
    onSelectDeck(deck.id);
  }

  async function handleImportRecipe() {
    setImportError(null);
    setImportSuccess(null);
    if (!recipeText.trim()) {
      setImportError("กรุณาวางข้อความ Deck Recipe หรือกดโหลดตัวอย่าง");
      return;
    }
    const parsed = parseDeckRecipeText(
      recipeText,
      catalog,
      deckNameInput.trim() || "Competitive Deck"
    );
    if (parsed.main.length === 0 && parsed.life.length === 0 && parsed.side.length === 0) {
      setImportError("ไม่พบชื่อการ์ดหรือรหัสพิมพ์ที่ตรงกับฐานข้อมูล BOT");
      return;
    }
    const now = Date.now();
    const deck: SavedDeck = {
      id: `deck-${now}`,
      name: deckNameInput.trim() || parsed.name,
      sourceType: "text",
      main: parsed.main,
      life: parsed.life,
      side: parsed.side,
      createdAt: now,
      updatedAt: now,
    };
    await saveAndSelectDeck(deck);
    setImportSuccess(
      parsed.unresolvedLines.length > 0
        ? `นำเข้าสำเร็จ (ข้าม ${parsed.unresolvedLines.length} บรรทัดที่ไม่พบการ์ด: ${parsed.unresolvedLines.slice(0, 2).join(", ")})`
        : `นำเข้าเด็ค "${deck.name}" สำเร็จ`
    );
  }

  async function handleFetchPublicDecks() {
    setLoadingPublic(true);
    setImportError(null);
    try {
      const res = await fetch("/api/decks/public?sort=trending&limit=8&offset=0");
      const json = await res.json();
      if (json?.success && Array.isArray(json.decks)) {
        setPublicDecks(json.decks);
      } else {
        setImportError("ไม่สามารถดึงรายการเด็คสาธารณะจาก bottcg.com ได้");
      }
    } catch {
      setImportError("เชื่อมต่อ bottcg.com ไม่สำเร็จ");
    } finally {
      setLoadingPublic(false);
    }
  }

  async function handleImportBottcgUuid(rawUrlOrUuid: string) {
    setImportError(null);
    setImportSuccess(null);
    const uuid = extractBottcgDeckUuid(rawUrlOrUuid);
    if (!uuid) {
      setImportError("กรุณาระบุ URL ของเด็คจาก bottcg.com (เช่น https://bottcg.com/decks/QtS3zF9eXk) หรือรหัส UUID");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(uuid)}`);
      const json = await res.json();
      if (!json?.success || !json.deck) {
        throw new Error(json?.error || "ไม่พบเด็คนี้บน bottcg.com");
      }
      const deck = normalizeBottcgDeck(json.deck, catalog);
      await saveAndSelectDeck(deck);
      setImportSuccess(`นำเข้าเด็ค "${deck.name}" จาก bottcg.com สำเร็จ`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "นำเข้าเด็คจาก bottcg.com ล้มเหลว");
    } finally {
      setImporting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    try {
      const text = await file.text();
      const deck = parseDeckImportJsonOrCsv(text, catalog);
      await saveAndSelectDeck(deck);
      setImportSuccess(`นำเข้าไฟล์เด็ค "${deck.name}" สำเร็จ`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "ไฟล์ไม่ถูกต้อง");
    }
    e.target.value = "";
  }

  async function handleRefreshDeckPrices() {
    if (!activeDeck) return;
    setRefreshingDeckPrices(true);
    try {
      const names = Array.from(
        new Set([
          ...activeDeck.main.map((s) => s.name),
          ...activeDeck.life.map((s) => s.name),
          ...activeDeck.side.map((s) => s.name),
        ])
      );
      const res = await fetch("/api/market/tcgthailand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, forceRefresh: true }),
      });
      const json = await res.json();
      if (json?.success && json.prices) {
        const entries = Object.values(json.prices) as MarketPriceEntry[];
        await upsertPricesToCache(entries);
        onPricesUpdated(json.prices);
      }
    } finally {
      setRefreshingDeckPrices(false);
    }
  }

  async function handleCopyDeckCode() {
    if (!activeDeck) return;
    const code = formatOfficialDeckCode(activeDeck);
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[430px_1fr] gap-4">
      {/* Left Column: Importer & Saved Decks */}
      <div className="space-y-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-amber-500" />
              นำเข้าเด็คแข่งขันจริง
            </h2>
            <button
              type="button"
              onClick={() => {
                setImportTab("recipe");
                setDeckNameInput("ตัวอย่างเด็คยักษ์-เทพ");
                setRecipeText(SAMPLE_COMPETITIVE_RECIPE);
              }}
              className="text-xs font-semibold text-amber-500 hover:underline cursor-pointer"
            >
              ใส่ตัวอย่าง Recipe
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            {(
              [
                { id: "recipe", label: "ข้อความ/รหัส", icon: FileText },
                { id: "bottcg", label: "bottcg.com", icon: Globe },
                { id: "file", label: "JSON/CSV", icon: Upload },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setImportTab(tab.id)}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    importTab === tab.id
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {importTab === "recipe" && (
            <div className="space-y-2.5">
              <input
                type="text"
                placeholder="ตั้งชื่อเด็ค (ไม่ระบุจะใช้ชื่อจาก # หัวข้อ)"
                value={deckNameInput}
                onChange={(e) => setDeckNameInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-amber-500 focus:outline-none"
              />
              <textarea
                rows={8}
                aria-label="วางรายชื่อเด็คหรือรหัสเด็ค"
                placeholder={`วาง Deck Recipe หรือรหัสเด็ค เช่น:\nความเจริญ 2\n4x BT01-038\n# Life Cards\n1x BT01-051`}
                value={recipeText}
                onChange={(e) => setRecipeText(e.target.value)}
                className="w-full p-3 rounded-xl text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-amber-500 focus:outline-none resize-y"
              />
              <button
                type="button"
                data-testid="import-recipe-btn"
                onClick={handleImportRecipe}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
              >
                นำเข้าและตรวจสอบเด็คทันที
              </button>
            </div>
          )}

          {importTab === "bottcg" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="วาง URL เช่น https://bottcg.com/decks/QtS3zF9eXk"
                  value={bottcgUrl}
                  onChange={(e) => setBottcgUrl(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => handleImportBottcgUuid(bottcgUrl)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  นำเข้า
                </button>
              </div>

              <button
                type="button"
                onClick={handleFetchPublicDecks}
                disabled={loadingPublic}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPublic ? "animate-spin" : ""}`} />
                โหลดเด็คยอดนิยมจาก bottcg.com/decks/public
              </button>

              {publicDecks.length > 0 && (
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {publicDecks.map((pd) => (
                    <div
                      key={pd.uuid}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{pd.name}</div>
                        <div className="text-[11px] text-slate-500">
                          โดย {pd.user?.name || "Unknown"} • ❤️ {pd.likesCount} •{" "}
                          {pd.coverCardPrint}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleImportBottcgUuid(pd.uuid)}
                        className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer"
                      >
                        เลือก
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {importTab === "file" && (
            <div className="space-y-2.5">
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500 transition-colors cursor-pointer text-center">
                <Upload className="w-6 h-6 text-amber-500" />
                <span className="text-xs font-semibold">
                  อัปโหลดไฟล์เด็ค (.json หรือ .csv)
                </span>
                <input
                  type="file"
                  accept=".json,.csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {importError && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-500">
              {importError}
            </div>
          )}
          {importSuccess && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-500">
              {importSuccess}
            </div>
          )}
        </div>

        {/* Saved Decks List */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-2.5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            เด็คที่บันทึกไว้ ({decks.length})
          </h3>
          {decks.length === 0 ? (
            <p className="text-xs text-slate-500">
              ยังไม่มีเด็คที่บันทึก — นำเข้าเด็คด้านบนเพื่อเช็กใบที่ขาดและกติกาการ์ดบาป
            </p>
          ) : (
            <div className="space-y-2">
              {decks.map((d) => {
                const isActive = d.id === activeDeck?.id;
                const mainTotal = d.main.reduce((s, x) => s + x.quantity, 0);
                const lifeTotal = d.life.reduce((s, x) => s + x.quantity, 0);
                return (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-colors ${
                      isActive
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-400"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDeck(d.id)}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div className="text-xs font-bold truncate">{d.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Main {mainTotal} • Life {lifeTotal} • Side{" "}
                        {d.side.reduce((s, x) => s + x.quantity, 0)}
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`ลบเด็ค ${d.name}`}
                      onClick={() => db.decks.delete(d.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Validation, Gap Check & Shopping List */}
      <div className="space-y-4">
        {!activeDeck || !validation || !gapReport ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
            <Sparkles className="w-8 h-8 text-amber-500 mx-auto" />
            <h3 className="text-base font-bold">
              เลือกหรือนำเข้าเด็คแข่งขัน Battle of Talingchan
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              ระบบจะตรวจสอบกติกา Main 50 + Life 5 + Only #1 + กฎการ์ดบาป August 2026
              พร้อมคำนวณใบที่ขาดจากคลังของคุณและประมาณงบซื้อบน TCG Thailand ให้ทันที
            </p>
          </div>
        ) : (
          <>
            {/* Deck Header & Controls */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {activeDeck.name}
                    </h2>
                    <span
                      data-testid="deck-legality-badge"
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                        validation.isTournamentReady
                          ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                          : "bg-red-500/15 text-red-500 border border-red-500/30"
                      }`}
                    >
                      {validation.isTournamentReady ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          ผ่านกติกางานแข่ง
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          พบข้อผิดกติกา ({validation.violations.length})
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-500 mt-1">
                    Main {validation.mainCount}/50 • Only #1:{" "}
                    {validation.onlyOneMainCount}/1 • Life {validation.lifeCount}/5 •
                    Side {validation.sideCount}/10
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDeckCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedCode ? "คัดลอกแล้ว!" : "คัดลอกรหัสเด็ค"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRefreshDeckPrices}
                    disabled={refreshingDeckPrices}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        refreshingDeckPrices ? "animate-spin" : ""
                      }`}
                    />
                    อัปเดตราคาเด็คนี้
                  </button>
                </div>
              </div>

              {/* Violations List */}
              {validation.violations.length > 0 && (
                <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/30 space-y-1">
                  {validation.violations.map((v, idx) => (
                    <div key={idx} className="text-xs text-red-400">
                      • {v.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Gap Check Summary KPI */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500">ความพร้อมจากคลังของคุณ</div>
                  <div
                    data-testid="deck-gap-summary"
                    className={`text-xl font-bold font-mono mt-0.5 ${
                      gapReport.readyToPlay ? "text-emerald-500" : "text-amber-500"
                    }`}
                  >
                    {gapReport.totalOwnedMatched}/{gapReport.totalRequired} ใบ
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {gapReport.totalMissing === 0
                      ? "พร้อมลงแข่งทันที!"
                      : `ยังขาดอีก ${gapReport.totalMissing} ใบ`}
                  </div>
                </div>

                <div className="rounded-xl p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500">งบซื้อใบที่ขาด (สายประหยัด)</div>
                  <div
                    data-testid="deck-budget-missing-cost"
                    className="text-xl font-bold font-mono text-emerald-500 mt-0.5"
                  >
                    ฿{gapReport.budgetTotalMissingTHB.toLocaleString("th-TH")}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ราคาทั้งเด็คสายประหยัด ~฿
                    {gapReport.budgetFullDeckCostTHB.toLocaleString("th-TH")}
                  </div>
                </div>

                <div className="rounded-xl p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500">งบซื้อใบที่ขาด (สายฟอยล์/SEC)</div>
                  <div className="text-xl font-bold font-mono text-purple-400 mt-0.5">
                    ฿{gapReport.blingTotalMissingTHB.toLocaleString("th-TH")}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ราคาทั้งเด็คสูงสุด ~฿
                    {gapReport.blingFullDeckCostTHB.toLocaleString("th-TH")}
                  </div>
                </div>
              </div>

              {/* Match Mode Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  โหมดจับคู่การ์ดในคลัง (Deck Gap Check):
                </span>
                <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                  <button
                    type="button"
                    onClick={() => setGapMode("cross-print")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      gapMode === "cross-print"
                        ? "bg-amber-500 text-slate-950"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    จับคู่ข้ามรหัสพิมพ์ (ชื่อเดียวกัน)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGapMode("exact-print")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      gapMode === "exact-print"
                        ? "bg-amber-500 text-slate-950"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    บังคับตรงรหัสพิมพ์ &amp; แรร์
                  </button>
                </div>
              </div>
            </div>

            {/* Missing Cards & Full Deck Breakdown Table */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold">
                  รายการการ์ดในเด็ค &amp; ใบที่ต้องซื้อเพิ่ม ({gapReport.items.length}{" "}
                  สล็อต)
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-2.5">ส่วน</th>
                      <th className="px-4 py-2.5">การ์ด</th>
                      <th className="px-4 py-2.5 text-center">ต้องการ / มี / ขาด</th>
                      <th className="px-4 py-2.5 text-right">ราคาต่ำสุด</th>
                      <th className="px-4 py-2.5 text-right">ซื้อเพิ่ม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {gapReport.items.map((it, idx) => (
                      <tr
                        key={`${it.section}-${it.slot.print}-${it.slot.rare}-${idx}`}
                        className={
                          it.missingQty > 0
                            ? "bg-amber-500/5"
                            : "opacity-80"
                        }
                      >
                        <td className="px-4 py-2.5 uppercase font-mono text-[11px] text-slate-500">
                          {it.section}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {it.slot.name}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {it.slot.print} ({it.slot.rare})
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center font-mono">
                          <span className="font-bold">{it.requiredQty}</span> /{" "}
                          <span className="text-emerald-500">{it.ownedQty}</span> /{" "}
                          <span
                            className={
                              it.missingQty > 0
                                ? "text-amber-500 font-bold"
                                : "text-slate-400"
                            }
                          >
                            {it.missingQty}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {it.budgetUnitPriceTHB !== null
                            ? `฿${it.budgetUnitPriceTHB.toLocaleString("th-TH")}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <a
                            href={it.tcgProductUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-amber-500 hover:underline font-semibold"
                          >
                            TCG Thailand
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
