# JOELNA 梱包シーン 縦長画像4枚＋5秒動画4本 制作ノート

作成日：2026-11-22
用途：SNS・ショップ用の縦長（9:16）素材。「商品を箱に詰めている場面」の4枚と、それぞれの5秒動画。

## 1. 今回の状況（記録）

| 項目 | 状況 |
|---|---|
| 添付ロゴ | チャットには届かなかった。Googleドライブの `JOELNA_ロゴ_丸_正式版.png`（2026-11-21作成）を使用 |
| 商品写真 | 社長の指示「みつくろえ」により、ドライブの出品画像から **3010（ピアス）** と **1001（ネックレス）** を選定（理由は2-2） |
| 画像・動画の生成 | この作業環境には、写真のような画像や動画を作る機能がない。下の指示文を画像生成AI・動画生成AIに入れて作る |
| このフォルダで作ったもの | `joelna_logo_sticker_round.png`：ロゴを丸く切り抜き、外側を透明にしたシール用画像（1212×1212px） |

## 2. ロゴの色（正式ロゴの画素から測った値）

| 部分 | 色コード | 使い方 |
|---|---|---|
| 地（クリーム） | #FBF2E7 | 箱・紙・背景の基調色 |
| 文字・猫（こげ茶） | #553221 | 締め色（木の机の濃い部分など、少しだけ使う） |
| 外枠（茶ベージュ） | #B58865 | 机・リボンなど |
| ハート（くすみピンクベージュ） | #D2997A | 差し色（入れすぎない） |
| 耳（淡いベージュ） | #EFCBAA | 包み紙・やわらかい影 |

## 2-2. 選んだ商品と理由

番号の付け方：ドライブ「出品画像（完成版）商品番号別」では、1000番台がネックレス、3000番台がピアス（写真で確認）。

| 役 | 商品番号 | 内容（出品画像の表記） | 選んだ理由 |
|---|---|---|---|
| ピアス | 3010 | ゴールドカラー／縦約2.5cm／花の形に透明の石 | 金色がロゴのクリーム・茶と合う。小さいので小箱・小袋に自然に収まる。石が光り、高級感が出る |
| ネックレス | 1001 | ステンレス／約39〜44cm／金色の月と星、透明の石 | ピアスと同じ金色で統一できる。月と星の形が上から撮っても分かりやすい |

生成AIに入れる参考画像（元の出品画像から、文字・タグ・JOELNAの帯を除いて商品だけ切り出したもの）：
- `ref_3010_earrings_gold_flower.jpg`
- `ref_1001_necklace_gold_moon_star.jpg`

元の出品画像を入れると、写真の中の文字やタグをAIが真似て描くことがあるため、必ず切り出した画像を使う。

### 崩れてはいけない点（できた画像はここを確認する）
- 3010：金色の枠。上は細長い透明の石が花びらのように並び、中心に小さな丸い石がある。下に細長い石が葉のように連なる。石の数と並び方は元の写真と同じにする。裏に透明の丸いキャッチがある
- 1001：金色の細いあずきチェーン。開いた三日月の形で、下側に透明の丸い石が一列に並ぶ。月の内側に、小さな石を敷きつめた星が短いチェーンで下がる

## 3. 作り方（共通の手順）

1. 画像生成AIのうち、**写真を添付して編集・合成できるもの**を使う。生成するときは次の3つを添付する。
   - 商品写真：1〜2枚目は `ref_3010_earrings_gold_flower.jpg`、3枚目は `ref_1001_necklace_gold_moon_star.jpg`
   - `joelna_logo_sticker_round.png`（4枚目のみ）
   - 前に作った画像（2枚目以降。手・机・箱の見た目を揃えるため）
2. 縦横比は **9:16**（例：1080×1920px）を指定する。
3. できた画像を、動画生成AIの「画像から動画を作る」機能に入れ、5秒で作る。
4. **最終確認**：商品の形・色・石の数、ロゴの文字「JOELNA」が崩れていないかを、元の写真と並べて見る。

### 注意（事実として知っておくこと）
- 生成AIは、商品の細かい形（金具・石の数・チェーンの編み方）や、ロゴの文字を**変えてしまうことがある**。崩れたら作り直すか、本物の商品写真やロゴ画像を画像編集ソフトで上から貼って直す。
- 4枚目のロゴシールは、生成AIに描かせるより、箱を閉じた画像を作ってから `joelna_logo_sticker_round.png` を後から貼るほうが確実。
- Amazonのメイン画像は白背景の実物写真が条件なので、これらの画像はサブ画像やSNS用に使う。

## 4. 共通の指示文（全部の画像に入れる）

```
Vertical 9:16 photo, top-down flat lay (camera directly overhead), luxury minimalist jewelry packing scene for an online accessory shop.
A light cream linen cloth on a warm light-wood desk. Soft natural window daylight from the left, bright, gentle soft shadows, high-end editorial product photography, sharp focus, realistic skin texture.
Only a young woman's hands and forearms are visible, entering from the bottom of the frame. Short natural nails with sheer nude polish. Cream knit sweater sleeves.
Color palette: cream #FBF2E7, beige #EFCBAA, warm tan #B58865, dusty rose-beige #D2997A, deep brown #553221 accents.
Use the attached accessory photos exactly as they are: keep shape, color, size, stone count and details unchanged.
Earrings (product 3010): small gold-tone stud earrings, about 2.5 cm tall, marquise-cut clear crystals arranged like a flower with a small round center stone, with a leaf-like cluster of marquise crystals below, clear round backings.
Necklace (product 1001): thin gold cable chain with an open crescent-moon pendant set with a row of small round clear stones, and a small pave star hanging inside the crescent.
Calm, clean, elegant, not cheap, not cluttered.
```

### 入れてはいけないもの（ネガティブ指示）
```
no text, no letters, no numbers, no price tags, no watermark, no brand marks or logos other than the attached JOELNA sticker, no face, no full body, no extra fingers, no deformed hands, no long nails, no bright nail colors, no plastic look, no clutter, no harsh shadows, do not change the jewelry design
```

## 5. 各画像の指示文

### 1枚目：箱を開けて、ピアスを1つつまみ上げたところ
```
In the center of the desk, a small cream-colored jewelry gift box with its lid open, lid placed beside it, soft cream cushion inside.
One hand gently picks up a single earring between thumb and index finger, lifting it just above the box. The second earring of the pair still rests in the box.
```
動画（5秒）：
```
5-second vertical video, static overhead camera. The hand slowly lifts one earring from the open cream box and holds it still for a moment; the earring catches soft daylight with a subtle sparkle. Smooth, calm, slow motion feel. No camera movement, no text.
```

### 2枚目：ピアスを小さな透明の袋に入れているところ
```
One hand holds open a small clear zip bag (transparent, no printing), the other hand slides the earring into it. The open cream box stays at the side of the frame.
```
動画（5秒）：
```
5-second vertical video, static overhead camera. Fingers open a small clear bag and gently slide the earring inside, then press the bag closed. Slow, careful, natural hand movement. No text.
```

### 3枚目：ネックレスを薄い紙で包んでいるところ
```
The necklace lies on a sheet of thin cream tissue paper; both hands fold the tissue paper softly over the necklace, part of the chain and pendant still visible. The cream box is nearby.
```
動画（5秒）：
```
5-second vertical video, static overhead camera. Both hands fold thin cream tissue paper over the necklace in two gentle folds; the paper rustles softly. Calm, elegant movement. No text.
```

### 4枚目：箱を閉じ、ロゴの丸シールをふたの真ん中に貼ったところ
```
The cream gift box is closed. A round sticker with the attached JOELNA logo is placed exactly at the center of the lid; reproduce the attached logo exactly, do not redraw or change its letters, colors or design. One index finger gently presses the edge of the sticker.
```
動画（5秒）：
```
5-second vertical video, static overhead camera. A hand closes the lid of the cream box, then places the round JOELNA logo sticker at the center of the lid and smooths it with one finger. Hands then move out of frame, leaving the finished box. No text other than the sticker.
```

## 6. 残っていること

- [x] 使う商品を決める → 3010（ピアス）・1001（ネックレス）。参考画像を切り出し済み（2026-11-22）
- [ ] 画像4枚を生成し、商品の形・ロゴの文字が崩れていないか確認する
- [ ] 画像から5秒動画4本を生成する

## 7. 無料で作る方法（2026-11-22 社長決定：お金をかけない）

経緯：Gemini APIのキー登録は見送り。APIの画像生成（Nano Banana Pro 約0.134ドル/枚）と動画生成（Veo 3.1 Fast 0.12ドル/秒、無料枠なし）は有料のため。

| 工程 | 担当 | 方法 | 費用 |
|---|---|---|---|
| 画像4枚 | 社長 | Geminiアプリ（gemini.google.com）の無料版で作る。1枚ずつ、このノートの指示文と参考画像を入れる | 0円（無料版の回数上限内） |
| 確認・ロゴ貼り | Claude | ドライブの「梱包画像」フォルダに入った画像を、元の商品写真と並べて確認。4枚目のロゴシールは正式ロゴ画像で貼り直す | 0円 |
| 5秒動画4本 | Claude | できた画像から、動画編集ソフト（ffmpeg）で9:16・5秒の動画を作る。ゆっくり寄る・光が流れる程度の動き | 0円 |

### 無料版で知っておくこと（調べた事実）
- Geminiアプリ無料版の画像の回数上限：2026年5月までは「1日20枚まで」と案内されていた。その後は数字の公表がなく、時間で回復する利用上限に変わったと報じられている（第三者の記事。Google公式のページでは未確認）
- 高画質版の Nano Banana Pro は、無料版では使えないとする記事がある
- 無料版でVeo（動画）が使えるという情報は見つからなかった。有料プランの特典として書かれている
- 無料版の画像の隅には、Geminiのマークが入ることがある。マークが入った場合は、作る段階でもう一度作り直すか、マークのない範囲で切り取る

### 無料で作る動画の限界
- 手が動く動画（ピアスをつまむ、袋に入れる等）は作れない。止まった画像に「ゆっくり寄る」「光がきらっと流れる」動きを付けた動画になる
- 手が動く動画が必要になったら、有料のVeoを1本ずつ試すか検討する
