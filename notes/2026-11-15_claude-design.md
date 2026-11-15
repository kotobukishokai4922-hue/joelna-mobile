# Claude Design（クロード・デザイン）調査ノート
記録日: 2026-11-15

## 概要（確認できた事実）
- 提供元: Anthropic（Claudeの開発元）
- 公開日: 2026-04-17（リサーチプレビュー＝試験提供）
- 公開時の搭載モデル: Claude Opus 4.7
- 内容: 会話（日本語で指示可）でデザインを作るツール
  - 作れるもの: 試作画面（プロトタイプ）、スライド、1枚資料（チラシ・説明書）、LP
  - ワイヤーフレーム（ラフ）／高精細の2モード
  - Claude Code へワンクリック引き渡し（作ったデザインをそのままコード化）
  - Canva と提携（書き出し連携）

## 利用条件
- 単体販売なし。有料プラン（Pro / Max / Team / Enterprise）に含まれる
- 無料プランでは使えない
- 通常のチャットとは別枠の「週ごとの利用上限」あり
- Enterprise は管理者が有効化する必要あり
- 料金は情報源で食い違いあり → claude.com/pricing で要確認

## 注意点
- 試験提供のため機能・料金は変更の可能性あり
- Figma への書き出しは公開時点では無し（第三者情報）

## JOELNA での使いどころ（案）
- Amazon / メルカリ / Shopee の商品画像・説明用の1枚資料
- 店舗用POP・チラシ
- 取引先向け提案スライド
- joelna-mobile アプリの画面試作 → Claude Code で実装

## 情報源
- https://support.claude.com/en/articles/14667344-claude-design-subscription-usage-and-pricing
- https://www.macrumors.com/2026/04/17/anthropic-claude-design
- https://venturebeat.com/ai/anthropic-just-launched-claude-design-an-ai-tool-that-turns-prompts-into-prototypes-and-challenges-figma
- https://www.techwyse.com/news/ai/anthropic-claude-design-research-preview-opus-4-7

---
## 追記: 商品画像に使えるか（2026-11-15）
結論: メイン画像は使えない。サブ画像（文字入り説明画像）は手間をかければ作れる。

### 根拠
- Claude Design は写真を生成しない。レイアウト（配置・文字・図）を作るツール。写真は自分でアップロードする
- 公式ヘルプに載っている書き出し形式: .zip / PDF / PPTX / Canva送信 / HTML
  - PNG・JPEG は公式の一覧に無い → Canva経由、またはPPTXをPowerPoint等で画像化する必要あり
- Amazon メイン画像要件（第三者解説、最新の正式な要件はセラーセントラルで確認）:
  純白背景 RGB(255,255,255) / 商品単体 / 文字・ロゴ・図の追加禁止 / 長辺1000px以上（ズーム用は1600px以上推奨）/ 商品が枠の85%以上
  → Claude Design の役割が無い（撮影・背景除去の領域）
- Amazon サブ画像: 文字・イラスト可 → Claude Design 向き（特徴説明・サイズ表・使用シーン・比較表）

### 運用案
1. 商品撮影 → 背景を白にする処理（別ツール）→ メイン画像
2. 撮影写真をアップ → Claude Designで説明画像の型を作る → Canvaへ送信 → PNG/JPEGで書き出し
3. 型を一度作れば商品ごとに差し替えて使い回せる

### 未確認（要調査）
- メルカリ / Shopeeシンガポールの画像仕様
- Canva経由の書き出し解像度が2000px四方を確保できるか（実機で確認）

### 追加の情報源
- https://support.claude.com/en/articles/14604416-get-started-with-claude-design
- https://www.sellersprite.com/jp/blog/amazon-main-image-guidelines-check
- https://www.commercepick.com/archives/33463
