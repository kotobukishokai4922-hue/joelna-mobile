#!/usr/bin/env node
// STORES ネットショップ 操作ツール（公式 API version 202211 準拠）
// 仕様: https://heyinc.github.io/retail-api-docs/202211.html
// 認証: Authorization: Bearer {クレデンシャル}
//   - 環境変数 STORES_API_TOKEN があればそれを使う
//   - 無ければダミー値を送る（クラウド環境のネットワークシークレットがプロキシで本物に差し替える）
// レート制限: 公式FAQ「1分間で60リクエスト程度」→ 本ツールはリクエスト間隔を1.1秒空ける

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

const BASE = process.env.STORES_API_BASE || "https://api.stores.dev/retail/202211"; // 差し替えはテスト用
const TOKEN = process.env.STORES_API_TOKEN || "proxy-injected";
const INTERVAL_MS = 1100;
let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function api(method, path, { query, body } = {}) {
  await throttle();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`STORES API ${method} ${path} → HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// limit最大100・offsetで全件取得
async function fetchAll(path, key, query = {}) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api("GET", path, { query: { ...query, limit: 100, offset } });
    const rows = page?.[key] || [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return { [key]: out, count: out.length };
}

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) opt[k] = true;
      else { opt[k] = next; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" };

// 画像アップロード: 署名取得 → post_endpoint に multipart POST → signature.key を返す
async function uploadImage(file) {
  const type = MIME[extname(file).toLowerCase()];
  if (!type) throw new Error(`対応外の画像形式: ${file}（png/jpg/jpeg/gif のみ）`);
  const { size } = await stat(file);
  if (size > 5242880) throw new Error(`5MB超のため不可: ${file} (${size} bytes)`);
  const info = await api("POST", "/items/image_upload", {
    body: { name: basename(file), content_type: type, size }
  });
  const form = new FormData();
  for (const [k, v] of Object.entries(info.signature)) form.append(k, v);
  form.append("file", new Blob([await readFile(file)], { type }), basename(file));
  const res = await fetch(info.post_endpoint, { method: "POST", body: form });
  if (res.status !== 201 && !res.ok) {
    throw new Error(`画像POST失敗 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return info.signature.key;
}

const HELP = `使い方: node tools/stores.mjs <コマンド> [オプション]

【参照】
  store                                   ストア情報（接続確認）
  orders [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--numbers 1,2] [--all]
                                          注文一覧
  items [--keyword 文字] [--status shown|hidden|unlisted] [--in_stock true|false] [--all]
                                          商品一覧
  categories                              カテゴリー一覧
  shipping                                送料設定
  remittances [--from YYYY-MM-DD] [--to YYYY-MM-DD]
                                          入金一覧
  remittance-orders <入金ID>              入金対象の注文ID
  sales-channels                          店舗一覧

【更新】※実行すると即STORESに反映されます
  item-create <JSONファイル> [--images a.jpg,b.jpg]
                                          商品作成（画像は自動アップロード）
  item-update <商品ID> <JSONファイル> [--images a.jpg]
                                          商品更新（※variationsはid未指定の既存分が削除される仕様）
  stock <バリエーションID> --set N | --add N | --unlimited
                                          在庫調整（ネットショップ在庫のみ）
  image <画像ファイル>                     画像だけアップロードしてキーを表示
  delivery <注文ID> [--method 配送方法] [--tracking 番号] [--arrival 到着予定] [--message 文]
                                          配送情報更新
  shipped <注文ID>                        発送完了（購入者へ発送完了メール）
  coupon <JSONファイル>                   クーポン作成
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = parseArgs(rest);
  let result;

  switch (cmd) {
    case "store":
      result = await api("GET", "/store"); break;
    case "orders": {
      const q = { ordered_at_from: opt.from, ordered_at_to: opt.to, numbers: opt.numbers, ids: opt.ids };
      result = opt.all ? await fetchAll("/orders", "orders", q)
        : await api("GET", "/orders", { query: { ...q, limit: opt.limit || 20, offset: opt.offset || 0 } });
      break;
    }
    case "items": {
      const q = { keyword: opt.keyword, status: opt.status, in_stock: opt.in_stock, ids: opt.ids };
      result = opt.all ? await fetchAll("/items", "items", q)
        : await api("GET", "/items", { query: { ...q, limit: opt.limit || 20, offset: opt.offset || 0 } });
      break;
    }
    case "categories":
      result = await fetchAll("/categories", "categories"); break;
    case "shipping":
      result = await api("GET", "/shipping_fee_settings"); break;
    case "remittances":
      result = await fetchAll("/remittances", "remittances", {
        transferred_date_from: opt.from, transferred_date_to: opt.to
      });
      break;
    case "remittance-orders":
      if (!pos[0]) throw new Error("入金IDを指定してください");
      result = await api("GET", `/remittances/${encodeURIComponent(pos[0])}/order_ids`); break;
    case "sales-channels":
      result = await fetchAll("/sales_channels", "sales_channels"); break;

    case "item-create":
    case "item-update": {
      const isUpdate = cmd === "item-update";
      const id = isUpdate ? pos[0] : null;
      const file = isUpdate ? pos[1] : pos[0];
      if (!file || (isUpdate && !id)) throw new Error(HELP);
      const body = await readJson(file);
      if (opt.images) {
        const keys = [];
        for (const f of String(opt.images).split(",")) keys.push(await uploadImage(f.trim()));
        body.images = [...(body.images || []), ...keys];
      }
      result = isUpdate
        ? await api("PATCH", `/items/${encodeURIComponent(id)}`, { body })
        : await api("POST", "/items", { body });
      break;
    }
    case "stock": {
      if (!pos[0]) throw new Error("バリエーションIDを指定してください");
      let body;
      if (opt.unlimited) body = { update_type: "unlimited" };
      else if (opt.set !== undefined) body = { update_type: "absolute", quantity: Number(opt.set) };
      else if (opt.add !== undefined) body = { update_type: "relative", quantity: Number(opt.add) };
      else throw new Error("--set N / --add N / --unlimited のいずれかを指定してください");
      if ("quantity" in body && !Number.isInteger(body.quantity)) throw new Error("数量は整数で指定してください");
      result = await api("POST", `/variations/${encodeURIComponent(pos[0])}/inventories/adjustment`, { body });
      break;
    }
    case "image":
      if (!pos[0]) throw new Error("画像ファイルを指定してください");
      result = { key: await uploadImage(pos[0]) }; break;
    case "delivery": {
      if (!pos[0]) throw new Error("注文IDを指定してください");
      const body = {
        delivery_method_name: opt.method, tracking_number: opt.tracking,
        estimated_arrival_date: opt.arrival, shipped_mail_message: opt.message
      };
      for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
      result = await api("PATCH", `/orders/${encodeURIComponent(pos[0])}/deliveries`, { body });
      break;
    }
    case "shipped":
      if (!pos[0]) throw new Error("注文IDを指定してください");
      result = await api("POST", `/orders/${encodeURIComponent(pos[0])}/shipped`); break;
    case "coupon":
      if (!pos[0]) throw new Error("JSONファイルを指定してください");
      result = await api("POST", "/coupons", { body: await readJson(pos[0]) }); break;

    default:
      process.stdout.write(HELP);
      return;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((e) => {
  process.stderr.write(`エラー: ${e.message}\n`);
  if (e.data) process.stderr.write(JSON.stringify(e.data, null, 2) + "\n");
  if (e.status === 401 || e.status === 403) {
    process.stderr.write("→ クレデンシャル未設定・無効、または権限不足の可能性\n");
  }
  if (e.status === 429) process.stderr.write("→ レート制限（1分60回目安）。時間を置いて再実行\n");
  process.exit(1);
});
