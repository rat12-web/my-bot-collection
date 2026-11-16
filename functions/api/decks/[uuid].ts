export const onRequestGet = async ({
  params,
}: {
  params: { uuid?: string };
}) => {
  const uuid = params.uuid || "";
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(uuid)) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid deck UUID" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const res = await fetch(`https://bottcg.com/api/decks/${encodeURIComponent(uuid)}`, {
    headers: { "User-Agent": "MyBOTCollection/1.0" },
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
