const $ = (id) => document.getElementById(id);
const API_URL = "/api/yahoo";
const DEFAULT_DOMESTIC_SHIPPING = 800;
const ZXING_URL = "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";

let yahooAppId = localStorage.getItem("joelnaYahooAppId") || "";
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
      return;
    }
    $("name").innerHTML = `<b>商品：</b>${escapeHtml(product.name)}`;
    $("jpPrice").textContent = product.price != null ? `¥${Number(product.price).toLocaleString("ja-JP")}` : "取得不能";
    $("jpStock").textContent = product.inStock === true ? "在庫あり" : product.inStock === false ? "在庫なし" : "取得不能";
    setStatus("JAN・Yahoo商品情報取得完了");
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
  await showProduct(code);
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
  if (yahooAppId) $("apiStatus").textContent = "Yahoo Client IDはこの端末に保存済みです。";

  $("saveYahoo").addEventListener("click", () => {
    const value = $("yahooAppId").value.trim();
    if (!value) {
      $("apiStatus").textContent = "Client IDを入力してください。";
      return;
    }
    localStorage.setItem("joelnaYahooAppId", value);
    yahooAppId = value;
    $("apiStatus").textContent = "保存完了。この端末からYahoo商品検索を利用できます。";
  });

  $("lookup").addEventListener("click", async () => {
    const code = $("manualJan").value.trim();
    $("jan").textContent = `JAN ${code || "—"}`;
    if (!validJan(code)) {
      setStatus("JANは13桁で入力してください。");
      return;
    }
    await showProduct(code);
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
