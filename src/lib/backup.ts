import { makeVariantKey } from "./catalog";
import { BackupFileSchema, CollectionEntrySchema } from "./types";
import type { BackupFile, CatalogIndex, CollectionEntry, SavedDeck } from "./types";
import type { CollectionAnalyticsReport } from "./playset-engine";

export function exportBackupJson(
  collection: CollectionEntry[],
  decks: SavedDeck[]
): string {
  const payload: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "MyBOTCollection",
    collection,
    decks,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseBackupJson(raw: string): BackupFile {
  const parsed = JSON.parse(raw);
  return BackupFileSchema.parse(parsed);
}

export function exportCollectionCsv(collection: CollectionEntry[]): string {
  const header = "variantKey,print,rare,name,qtyStandard,qtyFoil,qtyFirstEd,totalQty,updatedAt";
  const rows = collection.map((c) => {
    const escapedName = `"${c.name.replace(/"/g, '""')}"`;
    return [
      c.variantKey,
      c.print,
      c.rare,
      escapedName,
      c.qtyStandard,
      c.qtyFoil,
      c.qtyFirstEd,
      c.totalQty,
      c.updatedAt,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCollectionCsv(
  csvText: string,
  catalog: CatalogIndex
): CollectionEntry[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const entries: CollectionEntry[] = [];
  const startIdx = lines[0].toLowerCase().includes("print") ? 1 : 0;
  const now = Date.now();

  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((s) => s.trim());
    if (cols.length < 4) continue;
    const print = cols[1];
    const rare = cols[2] || "C";
    const variantKey = cols[0] || makeVariantKey(print, rare);
    const catalogVariant =
      catalog.variantById.get(variantKey) ??
      catalog.printByCode.get(print)?.primaryVariant;
    const name = cols[3] || catalogVariant?.name || print;
    const qtyStandard = Math.max(0, Number(cols[4] ?? 0));
    const qtyFoil = Math.max(0, Number(cols[5] ?? 0));
    const qtyFirstEd = Math.max(0, Number(cols[6] ?? 0));
    const totalQty =
      cols[7] !== undefined && cols[7] !== ""
        ? Math.max(0, Number(cols[7]))
        : qtyStandard + qtyFoil + qtyFirstEd;

    const validated = CollectionEntrySchema.parse({
      variantKey: catalogVariant?.id ?? variantKey,
      print: catalogVariant?.print ?? print,
      rare: catalogVariant?.rare ?? rare,
      name,
      qtyStandard: Number.isFinite(qtyStandard) ? qtyStandard : totalQty,
      qtyFoil: Number.isFinite(qtyFoil) ? qtyFoil : 0,
      qtyFirstEd: Number.isFinite(qtyFirstEd) ? qtyFirstEd : 0,
      totalQty,
      updatedAt: Number(cols[8]) || now,
    });
    if (validated.totalQty > 0) {
      entries.push(validated);
    }
  }
  return entries;
}

export function generateCommunityPostText(
  mode: "hunting" | "surplus",
  analytics: CollectionAnalyticsReport,
  limit = 30
): string {
  if (mode === "hunting") {
    const items = analytics.missingHuntingItems.slice(0, limit);
    const totalBudget = items.reduce((s, it) => s + it.estimatedCostTHB, 0);
    const lines = [
      "🔍 [ตามหาการ์ด Battle of Talingchan - ขาดเข้า Playsets]",
      ...items.map((it, idx) => {
        const priceTxt =
          it.lowestPriceTHB !== null ? ` (เรทตลาด ~฿${it.lowestPriceTHB}/ใบ)` : "";
        return `${idx + 1}. ${it.concept.name} [${it.concept.defaultVariant.print}] x${it.missingQty} ใบ${priceTxt}`;
      }),
      "",
      `งบประเมินอ้างอิง TCG Thailand: ~฿${totalBudget.toLocaleString("th-TH")}`,
      "#BattleOfTalingchan #BOTTCG #MyBOTCollection",
    ];
    return lines.join("\n");
  }

  const items = analytics.surplusTradeItems.slice(0, limit);
  const totalValue = items.reduce((s, it) => s + it.surplusValueTHB, 0);
  const lines = [
    "💎 [ปล่อย / เทรดการ์ดซ้ำ Battle of Talingchan (เกินชุดเล่น 4 ใบ)]",
    ...items.map((it, idx) => {
      const priceTxt =
        it.unitPriceTHB > 0
          ? ` — ฿${it.unitPriceTHB}/ใบ (รวม ฿${it.surplusValueTHB.toLocaleString("th-TH")})`
          : "";
      return `${idx + 1}. ${it.variant.name} (${it.variant.print} ${it.variant.rare}) x${it.surplusCopies} ใบ${priceTxt}`;
    }),
    "",
    `มูลค่าใบซ้ำทั้งหมด (รายการนี้): ~฿${totalValue.toLocaleString("th-TH")}`,
    "สนใจทัก IB / นัดรับได้ครับ — #BattleOfTalingchan #BOTTCG #MyBOTCollection",
  ];
  return lines.join("\n");
}
