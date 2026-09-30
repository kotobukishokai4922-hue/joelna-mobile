const ALLOWED_ORIGINS = new Set([
  "https://joelna-mobile.vercel.app",
  "https://kotobukishokai4922-hue.github.io"
]);
const YAHOO_URL = "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";

function corsFor(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://joelna-mobile.vercel.app",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsFor(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsFor(request) });
    }
    if (request.method !== "GET") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);

    const url = new URL(request.url);
    if (url.searchParams.get("health") === "1") {
      return json(request, { ok: true, service: "yahoo-proxy-worker" });
    }

    const jan = (url.searchParams.get("jan") || "").trim();
    const appid = (url.searchParams.get("appid") || "").trim();
    if (!/^\d{13}$/.test(jan)) return json(request, { error: "INVALID_JAN" }, 400);
    if (!appid) return json(request, { error: "MISSING_APPID" }, 400);

    const yahoo = new URL(YAHOO_URL);
    yahoo.searchParams.set("appid", appid);
    yahoo.searchParams.set("jan_code", jan);
    yahoo.searchParams.set("condition", "new");
    yahoo.searchParams.set("results", "50");
    yahoo.searchParams.set("sort", "+price");

    let response;
    try {
      response = await fetch(yahoo, { headers: { Accept: "application/json" } });
    } catch {
      return json(request, { error: "YAHOO_NETWORK_ERROR" }, 502);
    }

    if (!response.ok) return json(request, { error: "YAHOO_HTTP_ERROR", status: response.status }, 502);

    let data;
    try {
      data = await response.json();
    } catch {
      return json(request, { error: "YAHOO_INVALID_JSON" }, 502);
    }

    const exact = (Array.isArray(data.hits) ? data.hits : []).filter(
      (hit) => String(hit.janCode || "") === jan && hit.condition === "new"
    );

    if (!exact.length) {
      return json(request, { jan, name: "", price: null, inStock: null, source: "Yahoo!ショッピング", url: "" });
    }

    const inStock = exact.filter((hit) => hit.inStock === true);
    const pool = inStock.length ? inStock : exact;
    const hit = pool.reduce((best, current) => Number(current.price) < Number(best.price) ? current : best);

    return json(request, {
      jan,
      name: hit.name || "",
      price: Number.isFinite(Number(hit.price)) ? Number(hit.price) : null,
      inStock: typeof hit.inStock === "boolean" ? hit.inStock : null,
      source: "Yahoo!ショッピング",
      url: hit.url || ""
    });
  }
};