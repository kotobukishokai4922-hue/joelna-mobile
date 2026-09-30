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
  let payload = verified ? {
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

  async function callNexscope(slug, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let upstream;
    try {
      upstream = await fetch(
        `https://api.nexscope.ai/api/skill-api/v1/skills/${slug}/run`,
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
      return {
        ok: false,
        status: 502,
        body: { error: error?.name === "AbortError" ? "NEXSCOPE_TIMEOUT" : "NEXSCOPE_NETWORK_ERROR" }
      };
    }
    clearTimeout(timeout);

    let body = null;
    try { body = await upstream.json(); } catch {}

    if (!upstream.ok) {
      return {
        ok: false,
        status: upstream.status === 401 || upstream.status === 402 ? upstream.status : 502,
        body: {
          error: upstream.status === 401 ? "NEXSCOPE_AUTH_ERROR"
            : upstream.status === 402 ? "NEXSCOPE_CREDIT_ERROR"
            : "NEXSCOPE_HTTP_ERROR",
          status: upstream.status
        }
      };
    }

    if (body && typeof body.code === "number" && body.code !== 0) {
      return {
        ok: false,
        status: 502,
        body: {
          error: "NEXSCOPE_BUSINESS_ERROR",
          code: body.code,
          msg: body.msg || null
        }
      };
    }

    return { ok: true, status: 200, body };
  }

  let verifiedDetail = null;
  if (verified) {
    const detailCall = await callNexscope("shopee-product-detail", {
      productUrl: verified.productUrl
    });
    if (detailCall.ok) {
      const detailData = detailCall.body && detailCall.body.data && typeof detailCall.body.data === "object"
        ? detailCall.body.data
        : detailCall.body;
      verifiedDetail = detailData?.product || null;
    }

    payload = {
      station: "SG",
      shopIdList: String(verifiedDetail?.shopId || verified.shopId),
      page: 1,
      pageSize: 1000
    };
  }

  const searchCall = await callNexscope("shopee-product-search", payload);
  if (!searchCall.ok) {
    if (verified && verifiedDetail) {
      const rawPrice = verifiedDetail.price;
      const detailPrice = Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : null;
      return res.status(200).json({
        jan,
        matchBasis: "VERIFIED_SHOPEE_ITEM_BY_JAN_BARCODE",
        exactJanVerified: true,
        verifiedProductUrl: verified.productUrl,
        matchCount: 1,
        searchedTitlePhrase: verified.pid,
        apiProductCount: 0,
        title: String(verifiedDetail.name || ""),
        price: detailPrice,
        currency: String(verifiedDetail.currency || "SGD"),
        sold30d: null,
        sold30dSource: "UNAVAILABLE",
        productUrl: verified.productUrl,
        pid: String(verifiedDetail.itemId || verified.pid),
        shopId: String(verifiedDetail.shopId || verified.shopId),
        detailSource: "NEXSCOPE_SHOPEE_PRODUCT_DETAIL"
      });
    }
    return res.status(searchCall.status).json(searchCall.body);
  }

  const data = searchCall.body;
  const resultData = data && data.data && typeof data.data === "object" ? data.data : data;
  const products = Array.isArray(resultData?.products) ? resultData.products : [];
  const sgProducts = products.filter((p) => {
    try {
      const u = new URL(String(p.productUrl || ""));
      return u.protocol === "https:" && (u.hostname === "shopee.sg" || u.hostname.endsWith(".shopee.sg"));
    } catch {
      return false;
    }
  }).filter((p) => {
    if (!verified) return true;
    const productUrl = String(p.productUrl || "");
    const shopId = String(verifiedDetail?.shopId || verified.shopId);
    const itemId = String(verifiedDetail?.itemId || verified.pid);
    const exactUrlSuffix = `-i.${shopId}.${itemId}`;
    return productUrl.includes(exactUrlSuffix) ||
      (String(p.shopId || "") === shopId && String(p.title || "").trim() === String(verifiedDetail?.name || "").trim());
  }).map((p) => {
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
    if (verified && verifiedDetail) {
      const rawPrice = verifiedDetail.price;
      const detailPrice = Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : null;
      return res.status(200).json({
        jan,
        matchBasis: "VERIFIED_SHOPEE_ITEM_BY_JAN_BARCODE",
        exactJanVerified: true,
        verifiedProductUrl: verified.productUrl,
        matchCount: 1,
        searchedTitlePhrase: verified.pid,
        apiProductCount: products.length,
        title: String(verifiedDetail.name || ""),
        price: detailPrice,
        currency: String(verifiedDetail.currency || "SGD"),
        sold30d: null,
        sold30dSource: "UNAVAILABLE",
        historicalSold: null,
        productUrl: verified.productUrl,
        pid: String(verifiedDetail.itemId || verified.pid),
        shopId: String(verifiedDetail.shopId || verified.shopId),
        detailSource: "NEXSCOPE_SHOPEE_PRODUCT_DETAIL"
      });
    }
    return res.status(200).json({
      jan,
      matchBasis: useProductName ? "YAHOO_TITLE_MULTIWORD_AND" : "JAN_EXACT_PHRASE_IN_SHOPEE_TITLE",
      exactJanVerified: false,
      verifiedProductUrl: "",
      matchCount: 0,
      searchedTitlePhrase: useProductName ? productKeyword : jan,
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
    searchedTitlePhrase: verified ? String(verifiedDetail?.name || verified.pid) : (useProductName ? productKeyword : jan),
    apiProductCount: products.length,
    title: cheapest.title,
    price: cheapest.price,
    sold30d: cheapest.sold30d,
    sold30dSource: cheapest.sold30d !== null ? "NEXSCOPE_SHOPEE_PRODUCT_SEARCH_SOLD_30D" : "UNAVAILABLE",
    historicalSold: cheapest.historicalSold,
    productUrl: cheapest.productUrl,
    pid: cheapest.pid,
    shopId: cheapest.shopId
  });
};