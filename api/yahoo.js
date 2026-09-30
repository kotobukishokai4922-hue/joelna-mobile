module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "GET" && String(req.query?.health || "") === "1") {
    return res.status(200).json({ ok: true, service: "yahoo-proxy" });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const jan = String((req.method === "GET" ? req.query?.jan : body.jan) || "").trim();
  const appid = String((req.method === "GET" ? req.query?.appid : body.appid) || process.env.YAHOO_APP_ID || "").trim();

  if (!/^\d{13}$/.test(jan)) return res.status(400).json({ error: "INVALID_JAN" });
  if (!appid) return res.status(400).json({ error: "MISSING_APPID" });

  const yahooUrl = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
  yahooUrl.searchParams.set("appid", appid);
  yahooUrl.searchParams.set("jan_code", jan);
  yahooUrl.searchParams.set("condition", "new");
  yahooUrl.searchParams.set("results", "50");
  yahooUrl.searchParams.set("sort", "+price");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let yahooResponse;
  try {
    yahooResponse = await fetch(yahooUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    return res.status(502).json({ error: error?.name === "AbortError" ? "YAHOO_TIMEOUT" : "YAHOO_NETWORK_ERROR" });
  }
  clearTimeout(timeout);

  if (!yahooResponse.ok) {
    return res.status(502).json({ error: "YAHOO_HTTP_ERROR", status: yahooResponse.status });
  }

  let data;
  try {
    data = await yahooResponse.json();
  } catch {
    return res.status(502).json({ error: "YAHOO_INVALID_JSON" });
  }

  const exact = (Array.isArray(data.hits) ? data.hits : []).filter(
    (hit) => String(hit.janCode || "") === jan && hit.condition === "new"
  );

  if (!exact.length) {
    return res.status(200).json({ jan, name: "", price: null, inStock: null, source: "Yahoo!ショッピング", url: "" });
  }

  const inStock = exact.filter((hit) => hit.inStock === true);
  const pool = inStock.length ? inStock : exact;
  const hit = pool.reduce((best, current) => Number(current.price) < Number(best.price) ? current : best);

  return res.status(200).json({
    jan,
    name: hit.name || "",
    price: Number.isFinite(Number(hit.price)) ? Number(hit.price) : null,
    inStock: typeof hit.inStock === "boolean" ? hit.inStock : null,
    source: "Yahoo!ショッピング",
    url: hit.url || ""
  });
};