interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<unknown>;
}

interface Env {
  DB?: D1Database;
}

interface PagesContext {
  request: Request;
  env: Env;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validateSyncKey(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

async function ensureTable(db: D1Database) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS user_vaults (sync_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);"
  );
}

export const onRequestGet = async (context: PagesContext) => {
  const { request, env } = context;
  if (!env.DB) {
    return jsonResponse(
      { success: false, error: "Cloudflare D1 binding 'DB' is not configured" },
      500
    );
  }

  const url = new URL(request.url);
  const key = validateSyncKey(url.searchParams.get("key") || "");
  if (!key) {
    return jsonResponse(
      {
        success: false,
        error: "รหัสซิงก์ต้องเป็นตัวอักษรภาษาอังกฤษ/ตัวเลข/-/_ ความยาว 3-64 ตัวอักษร",
      },
      400
    );
  }

  await ensureTable(env.DB);
  const row = await env.DB.prepare(
    "SELECT sync_key, payload, updated_at FROM user_vaults WHERE sync_key = ?"
  )
    .bind(key)
    .first<{ sync_key: string; payload: string; updated_at: number }>();

  if (!row) {
    return jsonResponse({ success: true, found: false, data: null });
  }

  const parsed = JSON.parse(row.payload) as {
    collection: unknown[];
    decks: unknown[];
  };
  return jsonResponse({
    success: true,
    found: true,
    data: {
      syncKey: row.sync_key,
      collection: parsed.collection ?? [],
      decks: parsed.decks ?? [],
      updatedAt: row.updated_at,
    },
  });
};

export const onRequestPost = async (context: PagesContext) => {
  const { request, env } = context;
  if (!env.DB) {
    return jsonResponse(
      { success: false, error: "Cloudflare D1 binding 'DB' is not configured" },
      500
    );
  }

  try {
    const body = (await request.json()) as {
      syncKey?: string;
      collection?: unknown[];
      decks?: unknown[];
    };
    const key = validateSyncKey(body.syncKey || "");
    if (!key || !Array.isArray(body.collection) || !Array.isArray(body.decks)) {
      return jsonResponse(
        { success: false, error: "ข้อมูลซิงก์ไม่ถูกต้อง" },
        400
      );
    }

    const now = Date.now();
    const payload = JSON.stringify({
      collection: body.collection,
      decks: body.decks,
    });

    await ensureTable(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_vaults (sync_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(sync_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    )
      .bind(key, payload, now)
      .run();

    return jsonResponse({
      success: true,
      updatedAt: now,
      counts: {
        collection: body.collection.length,
        decks: body.decks.length,
      },
    });
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        error: err instanceof Error ? err.message : "Cloudflare D1 sync failed",
      },
      500
    );
  }
};
