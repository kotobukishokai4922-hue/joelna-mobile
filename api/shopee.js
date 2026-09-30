module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "GET" && String(req.query?.health || "") === "1") {
    return res.status(200).json({ ok: true, service: "shopee-sg-nexscope" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const jan = String(body.jan || "").trim();
  const apiKey = String(body.apiKey || process.env.NEXSCOPE_API_KEY || "").trim();

  if (!/^\d{13}$/.test(jan)) {
    return res.status(400).json({ error: "INVALID_JAN" });
  }
  if (!apiKey) {
    return res.status(400).json({ error: "NEXSCOPE_API_KEY_NOT_SET" });
  }

  const VERIFIED_BY_JAN = {
    "4901626036618": {
      pid: "24593867439",
      shopId: "932028991",
      productUrl: "https://shopee.sg/Sanko-Seika-Round-Soy-Bean-Crackers-Senbei-Japanese-Snacks%E3%80%90Delivery-from-Japan%E3%80%91-i.932028991.24593867439"
    }
  };
  const verified = VERIFIED_BY_JAN[jan] || null;

  const productName = String(body.productName || "").trim();
  const productKeyword = productName
    .replace(/[×xX]\s*1\s*(袋|個|本|セット)\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  const useProductName = productKeyword.length > 0;
  const payload = verified ? {
    station: "SG",
    pids: verified.pid,
    orderBy: "price",
    orderByType: "ASC",
    page: 1,
    pageSize: 20
  } : {
    station: "SG",
    keyword: useProductName ? productKeyword : jan,
    keywordType: useProductName ? 2 : 1,
    orderBy: "price",
    orderByType: "ASC",
    page: 1,
    pageSize: 100
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let upstream;
  try {
    upstream = await fetch(
      "https://api.nexscope.ai/api/skill-api/v1/skills/shopee-product-search/run",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );
  } catch (error) {
    clearTimeout(timeout);
    return res.status(502).json({
      error: error?.name === "AbortError" ? "SHOPEE_DATA_TIMEOUT" : "SHOPEE_DATA_NETWORK_ERROR"
    });
  }
  clearTimeout(timeout);

  let data = null;
  try { data = await upstream.json(); } catch {}

  if (!upstream.ok) {
    return res.status(upstream.status === 401 || upstream.status === 402 ? upstream.status : 502).json({
      error: upstream.status === 401 ? "NEXSCOPE_AUTH_ERROR"
        : upstream.status === 402 ? "NEXSCOPE_CREDIT_ERROR"
        : "NEXSCOPE_HTTP_ERROR",
      status: upstream.status
    });
  }

  if (data && typeof data.code === "number" && data.code !== 0) {
    return res.status(502).json({
      error: "NEXSCOPE_BUSINESS_ERROR",
      code: data.code,
      msg: data.msg || null
    });
  }

  const resultData = data && data.data && typeof data.data === "object" ? data.data : data;
  const products = Array.isArray(resultData?.products) ? resultData.products : [];
  const sgProducts = products.filter((p) => {
    try {
      const u = new URL(String(p.productUrl || ""));
      return u.protocol === "https:" && (u.hostname === "shopee.sg" || u.hostname.endsWith(".shopee.sg"));
    } catch {
      return false;
    }
  }).filter((p) => !verified || String(p.pid || "") === verified.pid).map((p) => {
    const minPrice = Number(p.minPrice);
    const price = Number(p.price);
    const bestPrice = Number.isFinite(minPrice) && minPrice >= 0
      ? minPrice
      : Number.isFinite(price) && price >= 0 ? price : null;
    const sold = Number(p.sold);
    const historicalSold = Number(p.historicalSold);
    return {
      title: String(p.title || ""),
      productUrl: String(p.productUrl || ""),
      price: bestPrice,
      sold30d: Number.isInteger(sold) && sold >= 0 ? sold : null,
      historicalSold: Number.isInteger(historicalSold) && historicalSold >= 0 ? historicalSold : null,
      pid: String(p.pid || ""),
      shopId: String(p.shopId || "")
    };
  }).filter((p) => p.price !== null);

  if (!sgProducts.length) {
    return res.status(200).json({
      jan,
      matchBasis: verified ? "VERIFIED_SHOPEE_ITEM_BY_JAN_BARCODE" : (useProductName ? "YAHOO_TITLE_MULTIWORD_AND" : "JAN_EXACT_PHRASE_IN_SHOPEE_TITLE"),
      exactJanVerified: Boolean(verified),
      verifiedProductUrl: verified?.productUrl || "",
      matchCount: 0,
      searchedTitlePhrase: verified ? verified.pid : (useProductName ? productKeyword : jan),
      apiProductCount: products.length,
      price: null,
      sold30d: null,
      historicalSold: null,
      productUrl: ""
    });
  }

  sgProducts.sort((a, b) => a.price - b.price);
  const cheapest = sgProducts[0];

  return res.status(200).json({
    jan,
    matchBasis: verified ? "VERIFIED_SHOPEE_ITEM_BY_JAN_BARCODE" : (useProductName ? "YAHOO_TITLE_MULTIWORD_AND" : "JAN_EXACT_PHRASE_IN_SHOPEE_TITLE"),
    exactJanVerified: Boolean(verified),
    verifiedProductUrl: verified?.productUrl || "",
    matchCount: sgProducts.length,
    searchedTitlePhrase: verified ? verified.pid : (useProductName ? productKeyword : jan),
    apiProductCount: products.length,
    title: cheapest.title,
    price: cheapest.price,
    sold30d: cheapest.sold30d,
    historicalSold: cheapest.historicalSold,
    productUrl: cheapest.productUrl,
    pid: cheapest.pid,
    shopId: cheapest.shopId
  });
};