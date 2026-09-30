module.exports = async function handler(req, res) {
  const allowOrigin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

  const jan = String(req.query.jan || "").trim();
  const appid = String(req.query.appid || process.env.YAHOO_APP_ID || "").trim();

  if (!/^\d{13}$/.test(jan)) return res.status(400).json({ error: "INVALID_JAN" });
  if (!appid) return res.status(400).json({ error: "MISSING_APPID" });

  const y = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
  y.searchParams.set("appid", appid);
  y.searchParams.set("jan_code", jan);
  y.searchParams.set("condition", "new");
  y.searchParams.set("results", "50");
  y.searchParams.set("sort", "+price");

  let r;
  try {
    r = await fetch(y, { headers: { Accept: "application/json" } });
  } catch {
    return res.status(502).json({ error: "YAHOO_NETWORK_ERROR" });
  }

  if (!r.ok) {
    return res.status(502).json({ error: "YAHOO_HTTP_ERROR", status: r.status });
  }

  let d;
  try {
    d = await r.json();
  } catch {
    return res.status(502).json({ error: "YAHOO_INVALID_JSON" });
  }

  const exact = (Array.isArray(d.hits) ? d.hits : []).filter(
    h => String(h.janCode || "") === jan
  );
  if (!exact.length) {
    return res.status(200).json({
      jan,
      name: "",
      price: null,
      inStock: null,
      source: "Yahoo!ショッピング",
      url: ""
    });
  }

  const stocked = exact.filter(h => h.inStock === true);
  const pool = stocked.length ? stocked : exact;
  const hit = pool.reduce((a, b) => Number(b.price) < Number(a.price) ? b : a);

  return res.status(200).json({
    jan,
    name: hit.name || "",
    price: Number.isFinite(Number(hit.price)) ? Number(hit.price) : null,
    inStock: typeof hit.inStock === "boolean" ? hit.inStock : null,
    source: "Yahoo!ショッピング",
    url: hit.url || ""
  });
};