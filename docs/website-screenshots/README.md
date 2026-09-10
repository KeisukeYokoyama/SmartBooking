# 公式サイト ヘルプページ用スクリーンショット撮影基盤

公式サイト（`~/dev/smart-booking-website`、別リポジトリ）のヘルプページに使うスクリーンショットを、
wp-env の実画面から再現性のある形で自動撮影するための基盤。**これは開発用ツールであり、
プラグイン本体（`src/` `includes/` 等）とは無関係。**

## 回帰スイートと分離している理由

先代の撮影スクリプトは `tests/e2e/help-screenshots.spec.js` として回帰スイート
（`playwright.config.js` の `testDir: './tests/e2e'`）の中に置かれていた。
`testIgnore` は `phase1-uninstall.spec.js` のみだったため、`npx playwright test` を実行すると
撮影テストも一緒に走ってしまっていた。さらに `booking-form-frontend` テストは実際に予約を
1件作成して DB を汚す副作用があり、logic-evaluator の回帰ゲート（ベースライン差分比較）の
正本を汚すリスクがあった。

そのため撮影用のコードは `tests/screenshots/`・専用設定 `playwright.screenshots.config.js`・
専用 npm script `npm run screenshots` に完全分離した。**既存の `playwright.config.js` は一切
変更していない。**

## 既存画像の寸法調査結果と、それに合わせた設定値

`~/dev/smart-booking-website/content/help/images/` 配下の既存27枚を実測した結果、
フロント予約フォームのカットも含めて全て例外なく次の条件で統一されていた:

- **1280 × 720 px**
- **72 dpi（`deviceScaleFactor: 1`）**
- **PNG**
- **`fullPage: false`**（ビューポートのみ、ページ全体スクロールではない）

**全カット 1280 × 720 / 72dpi(deviceScaleFactor 1) / PNG / `fullPage: false` に統一する。**
マニュアル画像としての一貫性を優先し、新規カットもこの寸法に厳密に一致させる。
**スマートフォン幅の撮影は行わない。** 既存セットにモバイル画像は1枚も存在せず、混在させると
寸法が不揃いになる。モバイル表示の訴求が必要になった場合は別タスクとして設計する。
`playwright.screenshots.config.js` の `desktop` プロジェクトのみが定義されており
（モバイル用の別プロジェクトは用意していない）、`viewport: { width: 1280, height: 720 },
deviceScaleFactor: 1` に設定してある。`tests/screenshots/help.spec.js` 側も
`page.screenshot({ fullPage: false })` で PNG 出力する（`type`/`quality` は指定しない。
path の拡張子 `.png` により自動的に PNG になる）。

## 撮影の実行手順

1. wp-env を起動する。
   ```bash
   npx wp-env start
   ```
2. デモデータをシードする（シードスクリプトは別途整備中）。
   ```bash
   npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/screenshots/seed/screenshot-seed.php
   ```
3. 撮影する（デスクトップのみ、既定）。
   ```bash
   npm run screenshots
   ```
4. 出力先を確認する。
   ```
   docs/website-screenshots/<slug>/NN-name.png
   ```
   （画像は `.gitignore` 済みでコミットされない。README のみ追跡対象。）

## カットを1つ追加する手順

`tests/screenshots/help.spec.js` にある共通ヘルパーを使う。

```js
// 撮影して docs/website-screenshots/<slug>/<name>.png へ保存する
await shot( page, 'stores', '03-store-added.png' );

// 管理画面ページへ遷移し、React マウント完了（readySelector 出現）まで待つ
await gotoAdminPage( page, 'smart-booking-stores', '.smb-page--stores' );
```

- `slug`: 公式サイト側ヘルプページの slug（下記一覧を参照）。
- `name`: `"NN-kebab-case.png"` 形式。`NN` は同一 slug 内の連番2桁。
- 出力ディレクトリは `shot()` 内部で `fs.mkdirSync(..., { recursive: true })` により自動作成される。
- 新しいテストケース（`test(...)`）を追加する場合、`tests/screenshots/help.spec.js` に追記するか、
  同じ `tests/screenshots/` 直下に別ファイル（`*.spec.js`）を作ってよい。
  **`tests/screenshots/legacy/` はデフォルトで対象外**（`playwright.screenshots.config.js` の
  `testMatch: '*.spec.js'` はサブディレクトリを拾わない）。

### 既存 slug 一覧（公式サイト側ヘルプページ）

```
installation / stores / staff / schedule / schedule-copy / booking-form /
reservations / custom-fields / design / email / google-calendar / chatwork
```

### 確定済みデモデータ名（シード投入後に使える）

- 店舗: `渋谷店` / `新宿店` / `横浜店`
- 担当者: `山田 太郎`（渋谷店）/ `佐藤 花子`（渋谷店）/ `鈴木 一郎`（新宿店）/ `田中 次郎`（横浜店）
- フォーム: デフォルト ＋ `初回相談フォーム` ＋ `オンライン相談フォーム`

ただし、特定の店舗名・担当者名の出現を**厳しく待つテストはシード未投入時に落ちる**。
`tests/screenshots/help.spec.js` の `stores` テストでは、店舗名への依存を避け、一覧コンテナ
（`.smb-page--stores`）の描画を待機の基準にしている。カットを追加する際も、可能な限り
「シードが無くてもページ自体は開けて撮影できる」形を優先し、シード依存の文字列を待つ場合は
その旨をコメントで明記すること。

## サイト側リポジトリへ渡す手順

> ⛔ **渡し先はサイト側だけ。プラグイン側 `docs/help/images/` は廃止済みなので、そこへは戻さない。**
> （2026-09-10 に27枚を `git rm`。画像の正本はサイト側 `content/help/images/`。復活させると回帰スイートが
> git 追跡下のバイナリを上書きし、ベースライン差分比較が壊れる。→ `docs/decisions/0002-screenshot-spec-separation.md` 第7節・`docs/help/README.md`）

1. 生成した画像を、公式サイトリポジトリの対応ディレクトリへコピーする。
   ```bash
   cp -r docs/website-screenshots/<slug>/. ~/dev/smart-booking-website/content/help/images/<slug>/
   ```
2. サイト側リポジトリで同期スクリプトを実行する（サイト側 `package.json` に定義済み）。
   ```bash
   cd ~/dev/smart-booking-website
   npm run sync:help-images
   ```
   実体: `"sync:help-images": "cp -r content/help/images/. public/help/images/"`

**`~/dev/smart-booking-website/` はこのリポジトリから編集しない。** 画像のコピーはホスト上の
ファイル操作であり、Smart Booking 側のコード変更ではない。

## 先代 spec の所在

`tests/screenshots/legacy/help-screenshots.spec.js` は、既存27枚を実際に生成した実績のある
先代スクリプト（`git mv` で `tests/e2e/help-screenshots.spec.js` から移動）。動くセレクタ・
待ち方の参考資料として保存してあるだけで、**実行対象ではない**（`playwright.screenshots.config.js`
の `testMatch` はこのサブディレクトリを拾わない。中身も出自の記録として無編集で保存している）。

## シードの後始末（注意）

撮影用シードは wp-env の DB にデモデータ（店舗・担当者・スケジュール・予約等）を投入する。
**回帰スイート（`npx playwright test`）を走らせる前に、シードで投入したデータを purge するか、
シード投入前に回帰スイートを実行しておくことを推奨する。**

※ purge の具体的な手順は、シードスクリプト（`tests/screenshots/seed/screenshot-seed.php`、別エージェント担当）
の実装確定後にここへ追記する。

## 画像はコミットしない

`docs/website-screenshots/**/*.png` は `.gitignore` 済み。生成された画像はコミット対象外で、
このディレクトリの `README.md` のみ追跡する。
