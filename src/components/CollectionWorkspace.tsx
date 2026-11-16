"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  Swords,
  BarChart3,
  Sun,
  Moon,
  Sparkles,
  Cloud,
} from "lucide-react";
import { buildCatalogHierarchy } from "@/lib/catalog";
import { db, upsertPricesToCache } from "@/lib/db";
import { buildOwnedByNameMap, buildOwnedByVariantMap } from "@/lib/playset-engine";
import { BinderView } from "./binder/BinderView";
import { DecksView } from "./decks/DecksView";
import { AnalyticsView } from "./analytics/AnalyticsView";
import { CloudSyncModal } from "./CloudSyncModal";
import type {
  CollectionEntry,
  MarketPriceEntry,
  RawBotCard,
  SavedDeck,
} from "@/lib/types";

interface CollectionWorkspaceProps {
  initialCards: RawBotCard[];
  initialCatalogMeta: { sourceUrl: string; syncedAt: string };
  initialPrices: Record<string, MarketPriceEntry>;
}

type MainSection = "binder" | "decks" | "analytics";

export function CollectionWorkspace({
  initialCards,
  initialCatalogMeta,
  initialPrices,
}: CollectionWorkspaceProps) {
  const [section, setSection] = useState<MainSection>("binder");
  const [isDark, setIsDark] = useState(true);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [livePricesOverlay, setLivePricesOverlay] = useState<
    Record<string, MarketPriceEntry>
  >(initialPrices);

  // Cloud Sync state
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncKey, setSyncKey] = useState("");
  const [autoSync, setAutoSync] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const skipNextAutoPushRef = useRef(false);

  // Sync dark class onto <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [isDark]);

  // Seed initial market snapshot into IndexedDB cache once if empty
  useEffect(() => {
    let mounted = true;
    (async () => {
      const count = await db.priceCache.count();
      if (count === 0 && mounted) {
        const list = Object.values(initialPrices);
        if (list.length > 0) {
          await upsertPricesToCache(list);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [initialPrices]);

  const catalog = useMemo(
    () => buildCatalogHierarchy(initialCards, initialCatalogMeta),
    [initialCards, initialCatalogMeta]
  );

  const collectionEntries = useLiveQuery(() => db.collection.toArray(), [], []);
  const decks = useLiveQuery(() => db.decks.orderBy("updatedAt").reverse().toArray(), [], []);
  const cachedPrices = useLiveQuery(() => db.priceCache.toArray(), [], []);

  const ownedByName = useMemo(
    () => buildOwnedByNameMap(collectionEntries),
    [collectionEntries]
  );
  const ownedByVariant = useMemo(
    () => buildOwnedByVariantMap(collectionEntries),
    [collectionEntries]
  );

  const priceMap = useMemo(() => {
    const map = new Map<string, MarketPriceEntry>();
    for (const [k, v] of Object.entries(livePricesOverlay)) {
      map.set(k, v);
    }
    for (const p of cachedPrices) {
      const existing = map.get(p.key);
      if (!existing || p.fetchedAt >= existing.fetchedAt) {
        map.set(p.key, p);
      }
    }
    return map;
  }, [livePricesOverlay, cachedPrices]);

  const totalOwnedCards = useMemo(
    () => collectionEntries.reduce((sum, e) => sum + e.totalQty, 0),
    [collectionEntries]
  );

  const pullFromCloud = useCallback(async (keyOverride?: string) => {
    const targetKey = (keyOverride ?? syncKey).trim();
    if (targetKey.length < 3) return;
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch(`/api/sync?key=${encodeURIComponent(targetKey)}`);
      const json = (await res.json()) as {
        success: boolean;
        found?: boolean;
        error?: string;
        data?: {
          collection: CollectionEntry[];
          decks: SavedDeck[];
          updatedAt: number;
        } | null;
      };
      if (!json.success) {
        setSyncStatus(json.error || "ดึงข้อมูลจาก Cloud ล้มเหลว");
        return;
      }
      if (!json.found || !json.data) {
        setSyncStatus("ยังไม่พบข้อมูลสำหรับรหัสนี้บน Cloud (กดบันทึกขึ้น Cloud เพื่อเริ่มใช้งาน)");
        return;
      }
      skipNextAutoPushRef.current = true;
      await db.collection.clear();
      if (json.data.collection.length > 0) {
        await db.collection.bulkPut(json.data.collection);
      }
      await db.decks.clear();
      if (json.data.decks.length > 0) {
        await db.decks.bulkPut(json.data.decks);
      }
      setLastSyncedAt(json.data.updatedAt);
      setSyncStatus(
        `ดึงข้อมูลสำเร็จ (${json.data.collection.length} รายการการ์ด, ${json.data.decks.length} เด็ค)`
      );
    } catch {
      setSyncStatus("ไม่สามารถเชื่อมต่อ Cloud Sync ได้");
    } finally {
      setIsSyncing(false);
    }
  }, [syncKey]);

  const pushToCloud = useCallback(async (keyOverride?: string) => {
    const targetKey = (keyOverride ?? syncKey).trim();
    if (targetKey.length < 3) return;
    setIsSyncing(true);
    try {
      const curCollection = await db.collection.toArray();
      const curDecks = await db.decks.toArray();
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syncKey: targetKey,
          collection: curCollection,
          decks: curDecks,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        updatedAt?: number;
        error?: string;
      };
      if (!json.success) {
        setSyncStatus(json.error || "บันทึกขึ้น Cloud ล้มเหลว");
        return;
      }
      setLastSyncedAt(json.updatedAt || Date.now());
      setSyncStatus(
        `บันทึกขึ้น Cloud สำเร็จ (${curCollection.length} รายการการ์ด, ${curDecks.length} เด็ค)`
      );
    } catch {
      setSyncStatus("ไม่สามารถบันทึกขึ้น Cloud ได้ในขณะนี้");
    } finally {
      setIsSyncing(false);
    }
  }, [syncKey]);

  // Restore saved Sync Key & ?sync=<key> URL param on mount
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const urlKey = sp.get("sync")?.trim();
    const savedKey = localStorage.getItem("mybot_sync_key")?.trim() || "";
    const savedAuto = localStorage.getItem("mybot_auto_sync");
    if (savedAuto !== null) setAutoSync(savedAuto === "1");

    const effectiveKey = urlKey || savedKey;
    if (effectiveKey && effectiveKey.length >= 3) {
      setSyncKey(effectiveKey);
      localStorage.setItem("mybot_sync_key", effectiveKey);
      pullFromCloud(effectiveKey);
    }
  }, [pullFromCloud]);

  // Debounced auto-push when local collection/decks mutate
  useEffect(() => {
    if (!autoSync || syncKey.trim().length < 3) return;
    if (skipNextAutoPushRef.current) {
      skipNextAutoPushRef.current = false;
      return;
    }
    if (collectionEntries.length === 0 && decks.length === 0) return;

    const timer = setTimeout(() => {
      pushToCloud(syncKey);
    }, 1200);
    return () => clearTimeout(timer);
  }, [collectionEntries, decks, autoSync, syncKey, pushToCloud]);

  function handleSyncKeyChange(next: string) {
    setSyncKey(next);
    localStorage.setItem("mybot_sync_key", next);
  }

  function handleAutoSyncChange(enabled: boolean) {
    setAutoSync(enabled);
    localStorage.setItem("mybot_auto_sync", enabled ? "1" : "0");
  }

  function handlePricesUpdated(updated: Record<string, MarketPriceEntry>) {
    setLivePricesOverlay((prev) => ({ ...prev, ...updated }));
  }

  const navItems = [
    { id: "binder", label: "สมุดสะสม", sub: "Binder", icon: BookOpen },
    { id: "decks", label: "เด็คแข่งขัน", sub: "Decks", icon: Swords },
    { id: "analytics", label: "วิเคราะห์พอร์ต", sub: "Analysis", icon: BarChart3 },
  ] as const;

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] pb-20 md:pb-6">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/85 dark:bg-slate-950/85 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-sm shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold tracking-tight leading-none truncate">
                My BOT Collection
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">
                {catalog.concepts.length.toLocaleString()} Concepts •{" "}
                {catalog.variants.length.toLocaleString()} Prints
              </p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav
            aria-label="เมนูหลัก"
            className="hidden md:flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-800"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`nav-${item.id}`}
                  onClick={() => setSection(item.id)}
                  className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Summary, Cloud Sync & Theme Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              data-testid="cloud-sync-btn"
              onClick={() => setSyncModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                syncKey
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-500"
                  : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-amber-500"
              }`}
              title="บันทึกและซิงก์ข้อมูลข้ามเครื่องผ่าน Cloud"
            >
              <Cloud className={`w-3.5 h-3.5 ${isSyncing ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline">
                {syncKey ? "ซิงก์แล้ว" : "ซิงก์ข้ามเครื่อง"}
              </span>
            </button>

            <div className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold">
              <span className="hidden sm:inline">คลัง: </span>
              <span className="text-amber-500">{totalOwnedCards}</span> ใบ
            </div>

            <button
              type="button"
              aria-label="สลับโหมดสว่าง/มืด"
              onClick={() => setIsDark((d) => !d)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 transition-colors cursor-pointer"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4">
        {section === "binder" && (
          <BinderView
            catalog={catalog}
            ownedByName={ownedByName}
            ownedByVariant={ownedByVariant}
            priceMap={priceMap}
            onPricesUpdated={handlePricesUpdated}
          />
        )}

        {section === "decks" && (
          <DecksView
            catalog={catalog}
            collectionEntries={collectionEntries}
            decks={decks}
            activeDeckId={activeDeckId}
            onSelectDeck={(id) => setActiveDeckId(id)}
            priceMap={priceMap}
            onPricesUpdated={handlePricesUpdated}
          />
        )}

        {section === "analytics" && (
          <AnalyticsView
            catalog={catalog}
            collectionEntries={collectionEntries}
            decks={decks}
            activeDeckId={activeDeckId}
            priceMap={priceMap}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="เมนูมือถือ"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 safe-pb"
      >
        <div className="grid grid-cols-3 gap-1 px-2 pt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={`mob-${item.id}`}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
                  active
                    ? "text-amber-500 bg-amber-500/10"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Cloud Sync Modal */}
      <CloudSyncModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        syncKey={syncKey}
        onSyncKeyChange={handleSyncKeyChange}
        autoSync={autoSync}
        onAutoSyncChange={handleAutoSyncChange}
        lastSyncedAt={lastSyncedAt}
        syncStatus={syncStatus}
        isSyncing={isSyncing}
        onPush={() => pushToCloud()}
        onPull={() => pullFromCloud()}
      />
    </div>
  );
}
