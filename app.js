const $ = (id) => document.getElementById(id);
const API_URL = "/api/yahoo";
const DEFAULT_DOMESTIC_SHIPPING = 800;
const ZXING_URL = "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";

let yahooAppId = localStorage.getItem("joelnaYahooAppId") || "";
let nexscopeApiKey = localStorage.getItem("joelnaNexscopeApiKey") || "";
let mediaStream = null;
let zxingControls = null;
let nativeLoopTimer = null;
let scanning = false;

function validJan(code) {
  return /^\d{13}$/.test(String(code || "").trim());
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function setStatus(message) {
  $("status").innerHTML = `<b>${escapeHtml(message)}</b>`;
}

function resetProductView() {
  $("name").innerHTML = "<b>商品：</b>未特定";
  $("jpPrice").textContent = "取得不能";
  $("jpStock").textContent = "取得不能";
  $("shopeePrice").textContent = "取得不能";
  $("shopeeSold30d").textContent = "取得不能";
}

function stopCamera() {
  if (nativeLoopTimer) {
    clearTimeout(nativeLoopTimer);
    nativeLoopTimer = null;
  }
  if (zxingControls) {
    try { zxingControls.stop(); } catch (_) {}
    zxingControls = null;
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      try { track.stop(); } catch (_) {}
    }
    mediaStream = null;
  }
  const video = $("video");
  try { video.pause(); } catch (_) {}
  video.srcObject = null;
  $("cam").hidden = true;
  $("stop").hidden = true;
  $("start").disabled = false;
  scanning = false;
}

function cameraErrorMessage(error) {
  const name = error?.name || "UnknownError";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "カメラ権限が拒否されています。Chromeのサイト設定でカメラを許可してください。";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "利用できるカメラが見つかりません。";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "カメラを使用できません。他のアプリがカメラを使用していないか確認してください。";
  }
  if (name === "SecurityError") {
    return "ブラウザのセキュリティ設定でカメラを使用できません。";
  }
  return `カメラ起動エラー: ${name}`;
}


async function fetchShopeeByJan(code, productName = "") {
  if (!validJan(code)) throw new Error("INVALID_JAN");
  const response = await fetch("/api/shopee", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ jan: code, productName, apiKey: nexscopeApiKey })
  });

  let data = null;
  try { data = await response.json(); } catch (_) {}

  if (!response.ok) {
    const reason = data?.error ? `${data.error}${data.status ? `_${data.status}` : ""}` : `HTTP_${response.status}`;
    throw new Error(reason);
  }
  if (!data || String(data.jan || "") !== code) throw new Error("SHOPEE_JAN_MISMATCH");
  if (!["JAN_EXACT_PHRASE_IN_SHOPEE_TITLE","YAHOO_TITLE_MULTIWORD_AND","VERIFIED_SHOPEE_ITEM_BY_JAN_BARCODE"].includes(data.matchBasis)) throw new Error("SHOPEE_MATCH_BASIS_INVALID");
  return data;
}

async function showShopee(code, productName = "") {
  $("shopeePrice").textContent = "取得中…";
  $("shopeeSold30d").textContent = "取得中…";

  if (!nexscopeApiKey) {
    $("shopeePrice").textContent = "API未設定";
    $("shopeeSold30d").textContent = "API未設定";
    $("shopeeEvidence").textContent = "Nexscope API Key未設定。Shopee SGは推測せず未取得のまま表示します。";
    return;
  }

  try {
    const data = await fetchShopeeByJan(code, productName);
    if (!data.matchCount) {
      const exactVerified = data.matchBasis === "VERIFIED_SHOPEE_ITEM_BY_JAN_BARCODE";
      const byName = data.matchBasis === "YAHOO_TITLE_MULTIWORD_AND";
      $("shopeePrice").textContent = exactVerified ? "検証済掲載の取得失敗" : (byName ? "商品名一致なし" : "JANタイトル一致なし");
      $("shopeeSold30d").textContent = exactVerified ? "検証済掲載の取得失敗" : (byName ? "商品名一致なし" : "JANタイトル一致なし");
      $("shopeeEvidence").textContent = exactVerified
        ? "JANとShopee掲載画像のバーコード一致を事前確認済みですが、Nexscope APIから現在データを取得できませんでした。"
        : byName
          ? `Shopee SGの商品タイトルで、Yahoo商品名のAND検索「${data.searchedTitlePhrase || ""}」に一致する掲載は確認できませんでした。商品の不存在を意味するものではありません。`
          : "Shopee SGの商品タイトル内にJAN文字列が完全一致する掲載は確認できませんでした。商品の不存在を意味するものではありません。";
      return;
    }

    $("shopeePrice").textContent = data.price != null ? `S${Number(data.price).toFixed(2)}` : "取得不能";
    $("shopeeSold30d").textContent = Number.isInteger(data.sold30d) ? Number(data.sold30d).toLocaleString("ja-JP") : "取得不能";
    $("shopeeEvidence").textContent =
      data.matchBasis === "VERIFIED_SHOPEE_ITEM_BY_JAN_BARCODE"
        ? `JANとShopee掲載画像のバーコード一致を確認済み。表示価格と30日販売数は検証済みShopee掲載のNexscope実データです。estimateSoldは不使用。`
        : data.matchBasis === "YAHOO_TITLE_MULTIWORD_AND"
          ? `Yahoo商品名のAND検索で ${data.matchCount}件確認。検索語「${data.searchedTitlePhrase || ""}」。表示価格と30日販売数は最安掲載1件の実データです。JAN/GTINでの同一商品確認ではありません。`
          : `JAN文字列を商品タイトルに完全一致で含む掲載 ${data.matchCount}件確認。表示価格と30日販売数は最安掲載1件の実データです。estimateSoldは不使用。`;
  } catch (error) {
    const codeName = String(error?.message || error);
    $("shopeePrice").textContent = "取得不能";
    $("shopeeSold30d").textContent = "取得不能";
    $("shopeeEvidence").textContent = `Shopee SG取得エラー: ${codeName}`;
  }
}

async function showAllData(code) {
  const product = await showProduct(code);
  await showShopee(code, product?.name || "");
}

async function fetchProductByJan(code) {
  if (!validJan(code)) throw new Error("INVALID_JAN");
  if (!yahooAppId) throw new Error("YAHOO_CLIENT_ID_NOT_SET");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ jan: code, appid: yahooAppId })
  });

  let data = null;
  try { data = await response.json(); } catch (_) {}

  if (!response.ok) {
    const reason = data?.error ? `${data.error}${data.status ? `_${data.status}` : ""}` : `HTTP_${response.status}`;
    throw new Error(reason);
  }
  if (!data || String(data.jan || "") !== code) throw new Error("JAN_MISMATCH");
  if (data.inStock !== null && data.inStock !== undefined && typeof data.inStock !== "boolean") {
    throw new Error("INVALID_STOCK");
  }
  return data.name ? data : null;
}

async function showProduct(code) {
  resetProductView();
  $("name").innerHTML = "<b>商品：</b>商品情報を取得中…";
  try {
    const product = await fetchProductByJan(code);
    if (!product) {
      $("name").innerHTML = "<b>商品：</b>Yahoo!ショッピングで完全一致なし";
      setStatus("JAN読取完了・Yahoo完全一致なし");
      return null;
    }
    $("name").innerHTML = `<b>商品：</b>${escapeHtml(product.name)}`;
    $("jpPrice").textContent = product.price != null ? `¥${Number(product.price).toLocaleString("ja-JP")}` : "取得不能";
    $("jpStock").textContent = product.inStock === true ? "在庫あり" : product.inStock === false ? "在庫なし" : "取得不能";
    setStatus("JAN・Yahoo商品情報取得完了");
    return product;
  } catch (error) {
    const codeName = String(error?.message || error);
    if (codeName === "YAHOO_CLIENT_ID_NOT_SET") {
      setStatus("Yahoo Client ID未設定。Yahoo API設定から保存してください。");
    } else if (codeName === "INVALID_JAN") {
      setStatus("JANは13桁で入力してください。");
    } else {
      setStatus(`商品情報取得エラー: ${codeName}`);
    }
    $("name").innerHTML = "<b>商品：</b>取得不能";
    return null;
  }
}

async function acceptBarcode(rawValue) {
  const code = String(rawValue || "").trim();
  if (!validJan(code)) return false;
  $("jan").textContent = `JAN ${code}`;
  $("manualJan").value = code;
  stopCamera();
  if (navigator.vibrate) navigator.vibrate(120);
  setStatus("JAN読取完了");
  await showAllData(code);
  return true;
}

async function scanWithBarcodeDetector(video) {
  const supported = typeof BarcodeDetector.getSupportedFormats === "function"
    ? await BarcodeDetector.getSupportedFormats()
    : [];
  const formats = supported.includes("ean_13") ? ["ean_13"] : undefined;
  const detector = formats ? new BarcodeDetector({ formats }) : new BarcodeDetector();

  const tick = async () => {
    if (!scanning) return;
    try {
      const codes = await detector.detect(video);
      for (const item of codes) {
        if (await acceptBarcode(item.rawValue)) return;
      }
    } catch (_) {}
    if (scanning) nativeLoopTimer = setTimeout(tick, 180);
  };
  await tick();
}

async function scanWithZxing(video) {
  const module = await import(ZXING_URL);
  const Reader = module.BrowserMultiFormatReader;
  if (!Reader) throw new Error("ZXING_LOAD_FAILED");
  const reader = new Reader();
  zxingControls = await reader.decodeFromStream(mediaStream, video, async (result) => {
    if (!result || !scanning) return;
    await acceptBarcode(result.getText());
  });
}

async function startCamera() {
  if (scanning) return;
  if (!yahooAppId) {
    $("yahooSettings").open = true;
    setStatus("先にYahoo Client IDを保存してください。");
    $("yahooAppId").focus();
    return;
  }
  try {
    if (!window.isSecureContext) throw new DOMException("HTTPS required", "SecurityError");
    if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("getUserMedia unavailable", "NotSupportedError");

    scanning = true;
    $("start").disabled = true;
    $("stop").hidden = false;
    $("cam").hidden = false;
    setStatus("カメラ起動中…");

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    const video = $("video");
    video.srcObject = mediaStream;
    await video.play();
    setStatus("読取中…バーコードを枠内へ");

    if ("BarcodeDetector" in window) {
      await scanWithBarcodeDetector(video);
    } else {
      await scanWithZxing(video);
    }
  } catch (error) {
    stopCamera();
    setStatus(cameraErrorMessage(error));
  }
}

function numericValue(id) {
  const raw = $(id).value.trim();
  return raw === "" ? null : Number(raw);
}

function init() {
  $("domestic").value = String(DEFAULT_DOMESTIC_SHIPPING);
  $("yahooAppId").value = yahooAppId;
  $("nexscopeApiKey").value = nexscopeApiKey;
  if (yahooAppId) {
    $("apiStatus").textContent = "Yahoo Client IDはこの端末に保存済みです。";
  } else {
    $("yahooSettings").open = true;
    setStatus("Yahoo Client ID未設定。下のYahoo API設定から保存してください。");
  }

  $("saveYahoo").addEventListener("click", () => {
    const value = $("yahooAppId").value.trim();
    if (!value) {
      $("apiStatus").textContent = "Client IDを入力してください。";
      return;
    }
    localStorage.setItem("joelnaYahooAppId", value);
    yahooAppId = value;
    $("apiStatus").textContent = "保存完了。商品スキャンを利用できます。";
    setStatus("Yahoo Client ID保存完了。スキャンできます。");
  });

  $("saveNexscope").addEventListener("click", () => {
    const value = $("nexscopeApiKey").value.trim();
    if (!value) {
      $("nexscopeStatus").textContent = "Nexscope API Keyを入力してください。";
      return;
    }
    localStorage.setItem("joelnaNexscopeApiKey", value);
    nexscopeApiKey = value;
    $("nexscopeStatus").textContent = "保存完了。この端末からShopee SG実データを取得できます。";
  });

  if (nexscopeApiKey) {
    $("nexscopeStatus").textContent = "Nexscope API Keyはこの端末に保存済みです。";
  }


  $("lookup").addEventListener("click", async () => {
    const code = $("manualJan").value.trim();
    $("jan").textContent = `JAN ${code || "—"}`;
    if (!validJan(code)) {
      setStatus("JANは13桁で入力してください。");
      return;
    }
    await showAllData(code);
  });

  $("manualJan").addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("lookup").click();
  });

  $("start").addEventListener("click", startCamera);
  $("stop").addEventListener("click", () => {
    stopCamera();
    setStatus("カメラ停止");
  });

  $("calc").addEventListener("click", () => {
    const values = ["cost", "sellSgd", "fx", "domestic", "sls", "feeRate"].map(numericValue);
    if (values.some((value) => value === null || !Number.isFinite(value) || value < 0)) {
      $("profit").textContent = "取得不能";
      $("margin").textContent = "取得不能";
      return;
    }
    const [cost, sellSgd, fx, domestic, sls, feeRate] = values;
    const sales = sellSgd * fx;
    const fees = sales * (feeRate / 100);
    const profit = sales - cost - domestic - sls - fees;
    $("profit").textContent = `¥${Math.round(profit).toLocaleString("ja-JP")}`;
    $("margin").textContent = sales > 0 ? `${(profit / sales * 100).toFixed(1)}%` : "取得不能";
  });

  window.addEventListener("pagehide", stopCamera);
}

init();
