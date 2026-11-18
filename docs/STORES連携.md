# STORES 連携ノート（JOELNA）

最終更新: 2026-11-18

## 1. 結論
- STORES は公式の外部公開 API（version 202211）を提供している。Claude からの操作はこの API 経由で行う。
- 利用には **開発パートナー登録 → プライベートアプリのクレデンシャル発行** が必須。発行前は一切操作できない。
- 操作ツール `tools/stores.mjs` は作成・モック検証済み。クレデンシャルを設定すれば即使える。

## 2. 公式根拠
| 項目 | 内容 | 出典 |
|---|---|---|
| API仕様 | https://heyinc.github.io/retail-api-docs/202211.html | heyinc/retail-api-docs |
| 接続先 | `https://api.stores.dev/retail/202211/...` | 同上 |
| 認証 | `Authorization: Bearer {クレデンシャル}` | 同上 |
| 料金 | API自体は無料 | development-partner-docs FAQ |
| プラン条件 | プライベートアプリでの利用は **スタンダードプラン** 申込が必要 | retail-api-docs README |
| 発行期間 | フォーム送信後 5営業日以内 | auth-credential.md |
| 権限範囲 | クレデンシャルは登録したストアURLと1対1。そのストアのみ参照・更新可 | auth-credential.md |
| レート制限 | 1分60リクエスト程度。超過で HTTP 429 | FAQ |
| Webhook | 未提供（注文の即時通知は不可。定期取得で対応） | FAQ |
| 問合せ | development-partner-support@st.inc | FAQ |

## 3. 社長がやること（クレデンシャル取得）
1. STORES の契約プランがスタンダードか確認（違えば変更）
2. 開発パートナー登録フォーム https://forms.gle/SM16fYxW6C7AXdqa6 に入力
   - 必須: メール / 開発担当者氏名 / STORESのストアURL / 事業形態 / 法人名（合同会社寿商会）/ 代表者氏名 / 生年月日 / 住所 / 規約同意
   - パートナーアプリの種類: **プライベートアプリ**
   - アプリ名（例: JOELNA業務ツール）/ 対象プロダクト: STORES ネットショップ / 利用用途（例: 在庫・受注・出品の自社管理）
3. 本人確認メールに返信
4. 5営業日以内に届くクレデンシャルを、Claude のクラウド環境の「ネットワークシークレット」（ホスト `api.stores.dev`）に保存
   - **チャットに貼らない**。流出するとストア情報が漏れる（公式警告）

## 4. できること（API 202211 の全機能）
| 区分 | コマンド | API |
|---|---|---|
| 接続確認 | `store` | GET /store |
| 注文一覧 | `orders --from 2026-11-01 --all` | GET /orders |
| 商品一覧 | `items --keyword 〇〇 --all` | GET /items |
| 商品作成 | `item-create 商品.json --images a.jpg,b.jpg` | POST /items/image_upload + POST /items |
| 商品更新 | `item-update 商品ID 変更.json` | PATCH /items/{id} |
| 在庫調整 | `stock バリエーションID --set 10 / --add -1 / --unlimited` | POST /variations/{id}/inventories/adjustment |
| 配送情報 | `delivery 注文ID --method ヤマト --tracking 123` | PATCH /orders/{id}/deliveries |
| 発送完了 | `shipped 注文ID` | POST /orders/{id}/shipped |
| カテゴリー | `categories` | GET /categories |
| 送料設定 | `shipping` | GET /shipping_fee_settings |
| 入金 | `remittances` / `remittance-orders 入金ID` | GET /remittances... |
| 店舗 | `sales-channels` | GET /sales_channels |
| クーポン | `coupon クーポン.json` | POST /coupons |

## 5. できないこと（API に存在しない）
- 商品の **削除**（非公開 `status: hidden` で代替）
- 注文のキャンセル・返金
- 顧客情報一覧、売上分析レポート、ショップデザイン変更
- 店舗（レジ）側の在庫数変更（ネットショップ在庫のみ）

## 6. 注意点（仕様上の落とし穴）
- `item-update` で `variations` を送ると、**id を書かなかった既存バリエーションは削除される**。
- 商品を公開(`shown`)にするには価格・説明・画像が必須。
- 配送方法・個数制限・販売期間の指定は、それぞれ STORES 側のアドオン ON が前提。
- 画像は png/jpg/gif、5MB以下。アップロード後に商品へ紐付けないと一定期間で削除される。
- 画像アップロード先（`post_endpoint`）は API の応答で初めて判明する別ホスト。クラウド環境で許可が必要になる可能性あり（初回実行時に確認）。
- `shipped` は購入者に発送完了メールが飛ぶ。取り消し不可のため実行前に必ず確認する。

## 7. 商品作成 JSON の例
```json
{
  "name": "ゴールドチェーンネックレス",
  "description": "商品説明",
  "status": "hidden",
  "type": "regular",
  "variations": [
    { "name": "F", "quantity": 1, "regular_price": 2980, "code": "JN-0001" }
  ]
}
```

## 8. 現状（2026-11-18時点）
- [x] 公式API仕様の調査
- [x] 操作ツール作成・モックサーバーで動作検証（ページ送り・在庫更新・エラー表示）
- [x] クラウド環境「joelna-mobile」（個人用）を作成し `api.stores.dev` を許可。本番APIへの到達を確認（認証なしで 401 Unauthorized ＝正常）
- [ ] 社長: 開発パートナー登録・クレデンシャル取得
- [ ] クレデンシャルを環境「joelna-mobile」のネットワークシークレット（ホスト api.stores.dev）に保存 → 本番接続確認

## 8-2. クレデンシャルの保存方法（2026-11-18 追記）
チャット上の保存フォームはアプリで押せなかった。代わりに設定画面から手動で保存する。
1. セッション上部のタイトル部分の「クラウド環境」メニュー → 環境「joelna-mobile」→ 編集（Edit）
2. 「ネットワークシークレット」（アプリが古い場合は「API credentials」）を追加
   - ホスト: `api.stores.dev`
   - ヘッダー: `Authorization` / 先頭語: `Bearer`
   - 値: STORESから届いたクレデンシャル
3. 保存後、環境「joelna-mobile」で**新しいセッション**を開始して接続確認

## 9. 実行方法（クラウド環境）
Node 組み込み fetch はプロキシ設定を自動で読まないため、以下の形で実行する。
```sh
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/stores.mjs store
```
今後 STORES を操作するセッションは、環境「joelna-mobile」を選んで開始すること（Default 環境では api.stores.dev が遮断される）。
