import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CollectionEntrySchema, SavedDeckSchema } from "@/lib/types";

const SyncKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

const SyncPayloadSchema = z.object({
  syncKey: SyncKeySchema,
  collection: z.array(CollectionEntrySchema),
  decks: z.array(SavedDeckSchema),
});

interface VaultRecord {
  syncKey: string;
  collection: z.infer<typeof CollectionEntrySchema>[];
  decks: z.infer<typeof SavedDeckSchema>[];
  updatedAt: number;
}

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const VAULT_FILE = path.join(CACHE_DIR, "cloud-sync.json");

function readVaults(): Record<string, VaultRecord> {
  try {
    if (fs.existsSync(VAULT_FILE)) {
      return JSON.parse(fs.readFileSync(VAULT_FILE, "utf8")) as Record<string, VaultRecord>;
    }
  } catch {
    // ignore
  }
  return {};
}

function writeVaults(vaults: Record<string, VaultRecord>) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(VAULT_FILE, JSON.stringify(vaults, null, 2));
}

export async function GET(req: NextRequest) {
  const rawKey = req.nextUrl.searchParams.get("key") || "";
  const parsedKey = SyncKeySchema.safeParse(rawKey);
  if (!parsedKey.success) {
    return NextResponse.json(
      { success: false, error: "รหัสซิงก์ต้องเป็นตัวอักษรภาษาอังกฤษ/ตัวเลข/-/_ ความยาว 3-64 ตัวอักษร" },
      { status: 400 }
    );
  }
  const key = parsedKey.data.toLowerCase();
  const vaults = readVaults();
  const found = vaults[key] ?? null;

  return NextResponse.json({
    success: true,
    found: !!found,
    data: found,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SyncPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "ข้อมูลซิงก์ไม่ถูกต้องตามโครงสร้าง Schema" },
        { status: 400 }
      );
    }

    const key = parsed.data.syncKey.toLowerCase();
    const now = Date.now();
    const record: VaultRecord = {
      syncKey: key,
      collection: parsed.data.collection,
      decks: parsed.data.decks,
      updatedAt: now,
    };

    const vaults = readVaults();
    vaults[key] = record;
    writeVaults(vaults);

    return NextResponse.json({
      success: true,
      updatedAt: now,
      counts: {
        collection: record.collection.length,
        decks: record.decks.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to save cloud vault",
      },
      { status: 500 }
    );
  }
}
