export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const params = new URLSearchParams({
    sort: url.searchParams.get("sort") || "newest",
    limit: url.searchParams.get("limit") || "12",
    offset: url.searchParams.get("offset") || "0",
    includeCards: url.searchParams.get("includeCards") || "false",
  });
  for (const k of ["deckname", "colors", "symbols"]) {
    const v = url.searchParams.get(k);
    if (v) params.set(k, v);
  }

  const res = await fetch(`https://bottcg.com/api/decks/public?${params.toString()}`, {
    headers: { "User-Agent": "MyBOTCollection/1.0" },
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
