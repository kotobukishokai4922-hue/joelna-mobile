module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const apiKey = String(body.apiKey || "").trim();
  const imageUrl = String(body.imageUrl || "").trim();

  if (!apiKey) return res.status(400).json({ error: "NEXSCOPE_API_KEY_NOT_SET" });

  let parsed;
  try { parsed = new URL(imageUrl); } catch {
    return res.status(400).json({ error: "INVALID_IMAGE_URL" });
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("yimg.jp")) {
    return res.status(400).json({ error: "UNTRUSTED_IMAGE_HOST" });
  }

  async function call(slug, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let r;
    try {
      r = await fetch(
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
    } catch (e) {
      clearTimeout(timeout);
      return { ok:false, status:502, body:{ error:e?.name==="AbortError" ? "NEXSCOPE_TIMEOUT" : "NEXSCOPE_NETWORK_ERROR" } };
    }
    clearTimeout(timeout);

    let data = null;
    try { data = await r.json(); } catch {}

    if (!r.ok) {
      return {
        ok:false,
        status:r.status === 401 || r.status === 402 ? r.status : 502,
        body:{
          error:r.status === 401 ? "NEXSCOPE_AUTH_ERROR"
            : r.status === 402 ? "NEXSCOPE_CREDIT_ERROR"
            : "NEXSCOPE_HTTP_ERROR",
          status:r.status
        }
      };
    }
    if (data && typeof data.code === "number" && data.code !== 0) {
      return { ok:false, status:502, body:{ error:"NEXSCOPE_BUSINESS_ERROR", code:data.code, msg:data.msg || null } };
    }
    return { ok:true, status:200, body:data };
  }

  const reverse = await call("reverse-product-image-search", {
    imageUrl,
    amazonDomain:"amazon.com",
    topN:5
  });

  if (!reverse.ok) return res.status(reverse.status).json(reverse.body);

  const reverseData = reverse.body?.data && typeof reverse.body.data === "object"
    ? reverse.body.data
    : reverse.body;

  const matches = Array.isArray(reverseData?.matches) ? reverseData.matches : [];
  const ranked = matches
    .filter(m => String(m?.title || "").trim())
    .sort((a,b) => Number(a.rank || 999) - Number(b.rank || 999))
    .slice(0,3);

  if (!ranked.length) {
    return res.status(200).json({
      visualMatch:false,
      amazonMatches:[],
      shopeeCandidate:null
    });
  }

  let shopeeCandidate = null;
  let usedAmazonMatch = null;

  for (const match of ranked.slice(0,1)) {
    const title = String(match.title || "").trim();
    const search = await call("shopee-product-search", {
      station:"SG",
      keyword:title,
      keywordType:2,
      orderBy:"price",
      orderByType:"ASC",
      page:1,
      pageSize:20
    });
    if (!search.ok) continue;

    const searchData = search.body?.data && typeof search.body.data === "object"
      ? search.body.data
      : search.body;
    const products = Array.isArray(searchData?.products) ? searchData.products : [];
    const candidates = products.filter(p => {
      try {
        const u = new URL(String(p.productUrl || ""));
        return u.protocol === "https:" && (u.hostname === "shopee.sg" || u.hostname.endsWith(".shopee.sg"));
      } catch {
        return false;
      }
    }).map(p => ({
      title:String(p.title || ""),
      imageUrl:String(p.imageUrl || ""),
      productUrl:String(p.productUrl || ""),
      price:Number.isFinite(Number(p.minPrice)) ? Number(p.minPrice)
        : Number.isFinite(Number(p.price)) ? Number(p.price) : null,
      sold30d:Number.isInteger(Number(p.sold)) && Number(p.sold) >= 0 ? Number(p.sold) : null,
      pid:String(p.pid || ""),
      shopId:String(p.shopId || "")
    })).filter(p => p.price !== null);

    if (candidates.length) {
      candidates.sort((a,b)=>a.price-b.price);
      shopeeCandidate = candidates[0];
      usedAmazonMatch = {
        rank:Number(match.rank || 0) || null,
        asin:String(match.asin || ""),
        title,
        imageUrl:String(match.imageUrl || "")
      };
      break;
    }
  }

  return res.status(200).json({
    visualMatch:true,
    amazonMatches:ranked.map(m => ({
      rank:Number(m.rank || 0) || null,
      asin:String(m.asin || ""),
      title:String(m.title || ""),
      imageUrl:String(m.imageUrl || "")
    })),
    usedAmazonMatch,
    shopeeCandidate,
    note:"IMAGE_DERIVED_CANDIDATE_NOT_EXACT_PRODUCT_PROOF"
  });
};