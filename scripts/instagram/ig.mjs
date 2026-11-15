#!/usr/bin/env node
// JOELNA Instagram 自動投稿ツール（Instagram API with Instagram Login / graph.instagram.com）
// 使い方:
//   node scripts/instagram/ig.mjs validate            キューの検査のみ（APIに接続しない）
//   node scripts/instagram/ig.mjs status              アカウント情報と投稿上限の照会
//   node scripts/instagram/ig.mjs publish [--dry-run] 予定時刻を過ぎた承認済み投稿を公開
//   node scripts/instagram/ig.mjs refresh-token       長期トークンの更新
// 環境変数: IG_ACCESS_TOKEN（必須・API接続時）, IG_USER_ID（任意。未設定なら /me から取得）,
//           IG_API_VERSION（任意。既定 v24.0）, IG_MEDIA_BASE_URL（任意。既定は GitHub Pages）

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const QUEUE_PATH = resolve(ROOT, "instagram/queue.json");
const API_VERSION = process.env.IG_API_VERSION || "v24.0";
const API = `https://graph.instagram.com/${API_VERSION}`;
const MEDIA_BASE = (process.env.IG_MEDIA_BASE_URL || "https://kotobukishokai4922-hue.github.io/joelna-mobile/instagram/media/").replace(/\/?$/, "/");

const MAX_HASHTAGS = 5;          // 2025年12月〜 Instagramの上限
const MAX_CAPTION = 2200;        // キャプション上限（文字）
const CAROUSEL_MIN = 2;
const CAROUSEL_MAX = 10;         // API側の上限が拡大していても安全側で10に固定
const IMAGE_EXT = /\.(jpe?g)$/i; // APIの画像はJPEGのみ
const VIDEO_EXT = /\.(mp4|mov)$/i;

function loadQueue() {
  return JSON.parse(readFileSync(QUEUE_PATH, "utf8"));
}
function saveQueue(queue) {
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2) + "\n");
}
function mediaUrl(file) {
  return /^https:\/\//.test(file) ? file : MEDIA_BASE + file.split("/").map(encodeURIComponent).join("/");
}
function countHashtags(text) {
  return (text.match(/(^|\s)#[^\s#]+/gu) || []).length;
}

export function validatePost(post) {
  const errors = [];
  if (!post.id) errors.push("id がありません");
  if (!["IMAGE", "REELS", "CAROUSEL"].includes(post.type)) errors.push(`type が不正: ${post.type}`);
  const caption = post.caption || "";
  if (!caption.trim()) errors.push("caption が空です");
  if ([...caption].length > MAX_CAPTION) errors.push(`caption が ${MAX_CAPTION} 文字を超えています`);
  const tags = countHashtags(caption);
  if (tags > MAX_HASHTAGS) errors.push(`ハッシュタグが ${tags} 個（上限 ${MAX_HASHTAGS}）`);
  if (post.scheduledAt && Number.isNaN(Date.parse(post.scheduledAt))) errors.push("scheduledAt の日時形式が不正");
  if (post.uses_voicevox && !caption.includes("VOICEVOX:ずんだもん")) errors.push("VOICEVOX:ずんだもん のクレジットが caption にありません");

  const media = Array.isArray(post.media) ? post.media : [];
  if (post.type === "IMAGE") {
    if (media.length !== 1) errors.push("IMAGE は media を1件指定");
    else if (!IMAGE_EXT.test(media[0])) errors.push("IMAGE は JPEG のみ");
  }
  if (post.type === "REELS") {
    if (media.length !== 1) errors.push("REELS は media を1件指定");
    else if (!VIDEO_EXT.test(media[0])) errors.push("REELS は MP4/MOV");
    if (post.cover && !IMAGE_EXT.test(post.cover)) errors.push("cover は JPEG のみ");
  }
  if (post.type === "CAROUSEL") {
    if (media.length < CAROUSEL_MIN || media.length > CAROUSEL_MAX) errors.push(`CAROUSEL は ${CAROUSEL_MIN}〜${CAROUSEL_MAX} 件`);
    for (const m of media) if (!IMAGE_EXT.test(m) && !VIDEO_EXT.test(m)) errors.push(`未対応の形式: ${m}`);
  }
  return errors;
}

async function api(method, path, params = {}) {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) throw new Error("IG_ACCESS_TOKEN が未設定です");
  const url = new URL(path.startsWith("http") ? path : `${API}${path}`);
  const init = { method };
  const all = { ...params, access_token: token };
  if (method === "GET") {
    for (const [k, v] of Object.entries(all)) url.searchParams.set(k, String(v));
  } else {
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    init.body = new URLSearchParams(Object.entries(all).map(([k, v]) => [k, String(v)]));
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(`API ${res.status} ${path}: ${e.message || text} (code=${e.code ?? "-"}, subcode=${e.error_subcode ?? "-"})`);
  }
  return data;
}

async function userId() {
  if (process.env.IG_USER_ID) return process.env.IG_USER_ID;
  const me = await api("GET", "/me", { fields: "user_id" });
  return me.user_id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFinished(containerId, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await api("GET", `/${containerId}`, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new Error(`コンテナ ${containerId} が ${s.status_code}: ${s.status || ""}`);
    }
    await sleep(10000);
  }
  throw new Error(`コンテナ ${containerId} の処理が時間内に完了しませんでした`);
}

async function createContainers(igId, post) {
  if (post.type === "IMAGE") {
    return api("POST", `/${igId}/media`, { image_url: mediaUrl(post.media[0]), caption: post.caption });
  }
  if (post.type === "REELS") {
    const p = { media_type: "REELS", video_url: mediaUrl(post.media[0]), caption: post.caption, share_to_feed: post.share_to_feed !== false };
    if (post.cover) p.cover_url = mediaUrl(post.cover);
    return api("POST", `/${igId}/media`, p);
  }
  const children = [];
  for (const m of post.media) {
    const isVideo = VIDEO_EXT.test(m);
    const c = await api("POST", `/${igId}/media`, isVideo
      ? { media_type: "VIDEO", video_url: mediaUrl(m), is_carousel_item: true }
      : { image_url: mediaUrl(m), is_carousel_item: true });
    await waitFinished(c.id);
    children.push(c.id);
  }
  return api("POST", `/${igId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption });
}

function duePosts(queue, now = new Date()) {
  return queue.posts.filter((p) =>
    p.status === "scheduled" && p.approved === true && p.scheduledAt && Date.parse(p.scheduledAt) <= now.getTime());
}

async function cmdValidate() {
  const queue = loadQueue();
  let bad = 0;
  for (const p of queue.posts) {
    const errs = validatePost(p);
    console.log(`${errs.length ? "NG" : "OK"} ${p.id} [${p.status}${p.approved ? "・承認済" : "・未承認"}] ${p.scheduledAt || "日時未定"}`);
    for (const e of errs) console.log(`   - ${e}`);
    if (errs.length && p.status === "scheduled") bad++;
  }
  if (bad) { console.error(`予約中の投稿に不備が ${bad} 件あります`); process.exit(1); }
}

async function cmdStatus() {
  const me = await api("GET", "/me", { fields: "user_id,username,account_type,followers_count,follows_count,media_count" });
  console.log("アカウント:", JSON.stringify(me, null, 2));
  const limit = await api("GET", `/${me.user_id}/content_publishing_limit`, { fields: "quota_usage,config" });
  console.log("投稿上限（直近24時間）:", JSON.stringify(limit, null, 2));
}

async function cmdPublish(dryRun) {
  const queue = loadQueue();
  const due = duePosts(queue);
  if (!due.length) { console.log("公開予定の投稿はありません"); return; }
  for (const p of due) {
    const errs = validatePost(p);
    if (errs.length) {
      p.status = "error"; p.lastError = `検査NG: ${errs.join(" / ")}`;
      console.error(`NG ${p.id}: ${p.lastError}`);
      continue;
    }
    if (dryRun) { console.log(`[dry-run] 公開対象: ${p.id} ${p.type} ${p.media.map(mediaUrl).join(", ")}`); continue; }
    try {
      const igId = await userId();
      const container = await createContainers(igId, p);
      await waitFinished(container.id);
      const published = await api("POST", `/${igId}/media_publish`, { creation_id: container.id });
      const info = await api("GET", `/${published.id}`, { fields: "permalink,timestamp" });
      p.status = "published";
      p.mediaId = published.id;
      p.permalink = info.permalink || null;
      p.publishedAt = info.timestamp || new Date().toISOString();
      delete p.lastError;
      console.log(`公開完了 ${p.id}: ${p.permalink}`);
    } catch (err) {
      p.status = "error";
      p.lastError = String(err.message || err);
      console.error(`失敗 ${p.id}: ${p.lastError}`);
    }
  }
  if (!dryRun) saveQueue(queue);
  if (queue.posts.some((p) => due.includes(p) && p.status === "error")) process.exitCode = 1;
}

async function cmdRefresh() {
  const token = process.env.IG_ACCESS_TOKEN;
  const r = await api("GET", "https://graph.instagram.com/refresh_access_token", { grant_type: "ig_refresh_token" });
  const days = Math.round((r.expires_in || 0) / 86400);
  console.log(`トークン更新: 有効期限 約${days}日`);
  if (r.access_token && r.access_token !== token) {
    console.error("更新で新しいトークン文字列が発行されました。GitHub Secrets の IG_ACCESS_TOKEN を新しい値に差し替えてください（値はログに出しません）。");
    process.exitCode = 2;
  }
}

const [cmd, ...args] = process.argv.slice(2);
const run = { validate: cmdValidate, status: cmdStatus, publish: () => cmdPublish(args.includes("--dry-run")), "refresh-token": cmdRefresh }[cmd];
if (!run) {
  console.log("使い方: node scripts/instagram/ig.mjs <validate|status|publish [--dry-run]|refresh-token>");
  process.exit(cmd ? 1 : 0);
}
run().catch((e) => { console.error(e.message || e); process.exit(1); });
