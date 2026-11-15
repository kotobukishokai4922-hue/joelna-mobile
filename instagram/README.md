# JOELNA Instagram 自動投稿（@joelna_official）

## 仕組み
1. `instagram/media/` に画像（JPEG）・動画（MP4）を置く → GitHub Pages で公開URLになる（Instagram APIは公開URLから素材を取得する仕様）
2. `instagram/queue.json` に投稿を書く
3. 社長が内容を確認し `"status": "scheduled"` と `"approved": true` にする（**承認がない投稿は絶対に公開されない**）
4. GitHub Actions が毎時17分に確認し、予定時刻を過ぎた承認済み投稿を公開。結果（permalink または エラー内容）を queue.json に書き戻す

自動の検査：ハッシュタグ5個以内、キャプション2,200文字以内、画像はJPEGのみ、カルーセル2〜10枚、ジョー動画は「VOICEVOX:ずんだもん」クレジット必須。

## 初回設定（社長の作業）
> 注：Metaの画面名は変更されることがあります。この環境から developers.facebook.com に接続できず、現行画面は未確認です。

1. https://developers.facebook.com/ で開発者登録 → 「アプリを作成」
2. ユースケースで Instagram の「メッセージとコンテンツを管理」を選択
3. 「Instagramログインによる API 設定」→ @joelna_official（ビジネスアカウント）を追加 → **アクセストークンを生成**
   - 必要な権限：`instagram_business_basic`、`instagram_business_content_publish`
4. GitHub リポジトリ → Settings → Secrets and variables → Actions → New repository secret
   - `IG_ACCESS_TOKEN`：手順3のトークン（**チャットに貼らないこと**）
   - `IG_USER_ID`：任意（未設定なら自動取得）
5. このブランチを main にマージ（予約実行は main ブランチでのみ動く）
6. Actions → 「Instagram 自動投稿」→ Run workflow → `status` を実行し、アカウント名・投稿上限が表示されれば接続完了

## 運用コマンド（Actions の Run workflow から選択）
| コマンド | 内容 |
|---|---|
| validate | キューの検査のみ |
| status | フォロワー数・投稿数・24時間の投稿上限 |
| publish --dry-run | 公開対象の確認のみ（投稿しない） |
| publish | 公開 |
| refresh-token | トークン更新（毎週月曜に自動実行） |

## 注意
- リポジトリは公開設定のため、`instagram/` 内の素材と投稿文は公開前でも第三者が閲覧可能
- 長期トークンは60日で失効。毎週自動更新するが、更新で新しい文字列が発行された場合は失敗表示になるので Secret を差し替える
