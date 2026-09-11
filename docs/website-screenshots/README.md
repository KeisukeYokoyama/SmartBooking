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
2. デモデータをシードする（冪等。何度実行しても同じ状態に収束する）。
   ```bash
   npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/screenshots/seed/screenshot-seed.php
   ```
3. 撮影する（デスクトップのみ、既定）。
   ```bash
   npm run screenshots                      # 全カット
   npm run screenshots -- --grep "email"    # 1テストだけ撮り直す
   ```
4. 出力先を確認する。
   ```
   docs/website-screenshots/<slug>/NN-name.png
   ```
   （画像は `.gitignore` 済みでコミットされない。README のみ追跡対象。）
5. **撮影が終わったら撤去する**（回帰スイートを回す前に必須）。
   ```bash
   npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/screenshots/seed/screenshot-purge.php
   ```

## ファイル構成（2026-09-11 時点）

| ファイル | 役割 |
|---|---|
| `tests/screenshots/helpers.js` | 共通ヘルパー（`shot` / `gotoAdminPage` / `scrollToTop` / `scrollInModal` / `openFormSettings` / `openFieldEditModal` / `closeModal` / `autoAcceptDialogs`）。**spec ではない**ので `testMatch: '*.spec.js'` には拾われない |
| `tests/screenshots/help.spec.js` | `stores` のカット |
| `tests/screenshots/help-new-pages.spec.js` | 新規ヘルプページ分（`forms` / `conditional-fields` / `form-mail` / `address-field` / `settings`） |
| `tests/screenshots/help-updates.spec.js` | 既存ページの差し替え分（`design` / `custom-fields` / `reservations` / `email` / `staff`） |
| `tests/screenshots/legacy/` | 先代 spec の退避先。**実行対象外** |

## カットを1つ追加する手順

`tests/screenshots/helpers.js` の共通ヘルパーを使う。

```js
// 撮影して docs/website-screenshots/<slug>/<name>.png へ保存する
await shot( page, 'stores', '03-store-added.png' );

// 管理画面ページへ遷移し、React マウント完了（readySelector 出現）まで待つ
await gotoAdminPage( page, 'smart-booking-stores', '.smb-page--stores' );
```

- `slug`: 公式サイト側ヘルプページの slug（下記一覧を参照）。
- `name`: `"NN-kebab-case.png"` 形式。`NN` は同一 slug 内の連番2桁。
- 出力ディレクトリは `shot()` 内部で `fs.mkdirSync(..., { recursive: true })` により自動作成される。
- 新しいテストケース（`test(...)`）を追加する場合、上表のいずれかの spec に追記するか、
  同じ `tests/screenshots/` 直下に別ファイル（`*.spec.js`）を作ってよい。
  **`tests/screenshots/legacy/` はデフォルトで対象外**（`playwright.screenshots.config.js` の
  `testMatch: '*.spec.js'` はサブディレクトリを拾わない）。

### 撮影時のハマりどころ（実測で踏んだもの）

- **「開閉するパネル」の初期状態を確認してからクリックする。** 予約一覧の絞り込み
  （`ReservationFilters`）は `useState( true )` ＝**既定で開いている**。無条件にトグルを押すと
  閉じてしまう。`aria-expanded` を読んでから押すこと（`setFiltersOpen()` 参照）。
- **未保存のモーダルを Escape で閉じると `window.confirm` が出る**（`src/admin/components/Modal.jsx`）。
  Playwright は既定でダイアログを **dismiss**（キャンセル）するため、ハンドラを付けないと
  モーダルが閉じず次のカットに前の画面が写り込む。各 test の先頭で `autoAcceptDialogs( page )` を呼ぶ。
- **`Switch` の実体は `<label class="smb-switch">` 配下の `<input role="switch">`** で、input は
  `.smb-switch__track` に覆われている。input を直接 click すると
  「intercepts pointer events」でタイムアウトするので、ラベル側（`.smb-switch`）を押す。
- **フォーカスリングが写る。** 入力直後は `blurActive( page )` でフォーカスを外してから撮る。
- **ページ末尾付近のカットは `scrollToTop()` の offset を大きめに取る。** 下までスクロールしきると
  フッターが画面の大半を占める。

### 既存 slug 一覧（公式サイト側ヘルプページ）

```
installation / stores / staff / schedule / schedule-copy / booking-form /
reservations / custom-fields / design / email / google-calendar / chatwork /
gtm / forms / conditional-fields / form-mail / address-field / settings
```

（後半 6 つは v0.3.0〜v0.5.0 の機能追加に伴ってサイト側に増えたページ。
`gtm` だけは撮影対象外＝下記「撮影対象から外したもの」を参照。）

### 確定済みデモデータ名（シード投入後に使える）

- 店舗: `渋谷店` / `新宿店` / `横浜店`
- 担当者: `山田 太郎`（渋谷店）/ `佐藤 花子`（渋谷店）/ `鈴木 一郎`（新宿店）/ `田中 次郎`（横浜店）
- フォーム: `標準フォーム`（既定・activator が作る）＋ `初回相談フォーム` ＋ `オンライン相談フォーム`
  ＋ `無料体験のお申し込み`
- `標準フォーム` に足す項目（ヘルプ原稿の例示と一致させてある）:
  `資料送付`（ラジオ: 希望する / 希望しない）／`送付先住所`（複数行テキスト・表示条件の子）／
  `ご住所`（住所（郵便番号）・自動入力 ON）
- `無料体験のお申し込み` の項目: `体験コース`（1行テキスト）。**選択式を含まない**ので
  「表示条件の親候補が0件」のカットに使える
- `無料体験のお申し込み` は `予約受付メール（ユーザー宛）` だけ専用文面 ON（他2種別は OFF）

> シードは**メール共通文面（6 option）も activator の既定値へそろえる**。wp-env は回帰スイートの
> フィクスチャ（「共通受付件名」等のダミー文字列）で上書きされていることがあり、そのまま撮ると
> 設定 → メール通知やフォーム設定のメールタブにテスト用の文字列が写り込むため。purge で元に戻る。

ただし、特定の店舗名・担当者名の出現を**厳しく待つテストはシード未投入時に落ちる**。
`tests/screenshots/help.spec.js` の `stores` テストでは、店舗名への依存を避け、一覧コンテナ
（`.smb-page--stores`）の描画を待機の基準にしている。カットを追加する際も、可能な限り
「シードが無くてもページ自体は開けて撮影できる」形を優先し、シード依存の文字列を待つ場合は
その旨をコメントで明記すること。

## 撮影済みカット一覧（初回 2026-09-11 → **v0.5.6 公開後に全27枚を撮り直し済み: 2026-09-12**）

サイト側 `docs/help-backlog.md` §C2 / §C3 と、原稿中の `<!-- 撮影: … -->` コメントが指示の正本。
**この一覧は「撮った結果」であって指示ではない。** 相違があれば原稿側が正。

| slug | ファイル | 内容 | 由来 |
|---|---|---|---|
| `forms` | `01-form-selector.png` | フォームセレクタ（既定でないフォーム選択・削除・form_id 付きショートコード） | §C2 |
| `forms` | `02-form-add-modal.png` | 「フォームを追加」モーダル（`入塾相談` 入力済み） | §C2 |
| `forms` | `03-reservation-form-column.png` | 予約一覧の「フォーム」列＋絞り込みの「フォーム」欄 | §C2 |
| `conditional-fields` | `01-condition-section.png` | 送付先住所の編集モーダル（親＝資料送付／値＝希望する） | §C2 |
| `conditional-fields` | `02-no-parent-candidate.png` | 親候補0件のフォームの編集モーダル（案内文のみ） | §C2 |
| `conditional-fields` | `03-front-hidden.png` | フロント: 希望しない → 送付先住所が出ない | §C2 |
| `conditional-fields` | `04-front-shown.png` | フロント: 希望する → 送付先住所が出る（03 と同一スクロール位置） | §C2 |
| `conditional-fields` | `05-parent-delete-blocked.png` | 親フィールド削除の依存エラー | §C2 |
| `conditional-fields` | `06-parent-type-locked.png` | 親フィールドは種別変更不可（v0.5.4） | v0.5.4 の表示変更 |
| `form-mail` | `01-form-mail-tab.png` | メールタブ冒頭（案内文＋ユーザー宛だけ ON） | §C2 |
| `form-mail` | `02-variable-helper.png` | 本文＋使える変数（固定8＋カスタム項目＋注記）＋2種別目の OFF 表示 | §C2 |
| `form-mail` | `03-override-note.png` | 設定→メール通知の「専用文面を使用中」注記 | §C2 |
| `address-field` | `01-address-field-modal.png` | 住所カードから開いた追加モーダル（自動入力 ON） | §C2 |
| `address-field` | `02-address-front.png` | フロント: 1500002 → 東京都渋谷区渋谷 が自動補完 | §C2 |
| `address-field` | `03-address-type-autofill.png` | 既存項目を住所へ変更 → 自動入力が ON で開く（v0.5.5 H6） | v0.5.5 の表示変更 |
| `settings` | `01-settings-tabs.png` | 設定を開いた直後（5タブ＋予約フロー冒頭） | §C2 |
| `settings` | `02-basic-availability.png` | 空き状況の表示セクション（空欄＋プレースホルダー） | §C2 |
| `settings` | `03-basic-front-display.png` | フロント表示（店舗 ON / 担当者 OFF で両方の文言） | §C2 |
| `design` | `01-design-tab.png` | デザインタブ冒頭（差し替え。旧画像は v0.2.0・5項目時代） | §C3 |
| `design` | `02-design-availability-colors.png` | 警告色・無効色＋デフォルトに戻す／テーマ設定を保存 | §C3 |
| `custom-fields` | `01-field-types.png` | フィールドタイプ 8 種（差し替え。旧画像は 7 種） | §C3 |
| `custom-fields` | `02-field-list.png` | 現在のフィールド一覧の表（差し替え。旧画像は 01 と同一物だった） | §C3 |
| `reservations` | `01-reservation-list.png` | 予約一覧（v0.5.3 の列順・フォーム列あり。差し替え） | §C3 |
| `reservations` | `02-status-change.png` | 予約詳細（既定以外のフォームの入力項目が出る＝v0.5.5 H3。差し替え） | v0.5.5 の表示変更 |
| `email` | `02-admin-notify.png` | 管理者宛セクションの説明文＋トグル直下のヒント（v0.5.5 B） | v0.5.5 の表示変更 |
| `email` | `03-admin-off-dialog.png` | 「管理者へのメールをオフにしますか？」の確認ダイアログ（v0.5.5 B） | v0.5.5 の表示変更 |
| `staff` | `02-staff-add-modal.png` | 担当者追加モーダル（メール欄のヘルプ文が v0.5.5 B で変更） | v0.5.5 の表示変更 |

`stores/01-store-list.png` / `stores/02-store-add-modal.png` も生成されるが、**差し替え依頼が
出ていない**ため、サイト側へのコピー対象には含めない（`stores` ディレクトリごと除外する）。

### 原稿の指示どおりに撮れなかった点

- **`form-mail/01-form-mail-tab.png`**: 原稿は「画面先頭の案内文から2種別目の見出しまでを1枚に」
  と指定しているが、1280×720 では**物理的に入らない**（ON 状態の件名＋本文8行＋変数ヘルパーで
  1画面ぶん埋まる）。案内文＋1種別目を 01 に、2種別目の見出しと OFF 表示（「未設定のため共通文面が
  使われます。」＋件名（共通））を **`02-variable-helper.png` の下半分**に写す形で分けた。
- ~~**`conditional-fields/06-parent-type-locked.png`**: disabled のセレクトに WordPress の矢印が
  タイル状に敷き詰められて写る。~~ → **v0.5.6（SVN rev 3692196・2026-09-12）で修正し、
  全27枚を撮り直した**（`docs/bugs/admin-disabled-select-arrow-tiling.md`）。
  撮り直し後、**27枚すべてを目視で再確認し、矢印のタイリング・矢印の消失はゼロ**。
  セレクトが写るカット（`conditional-fields/01・02・06` / `address-field/01・03` / `forms/01・03` /
  `reservations/02` / `staff/02` / `settings/01`）は、いずれも矢印が右端に1つだけ出ている。

### 撮影対象から外したもの

- **`gtm` の4枚（§C1）は撮影しない。** 指示されている絵が
  ①Google Tag Manager の管理画面（データレイヤー変数 / トリガー / GA4 タグ）②ブラウザの
  デベロッパーツールで `dataLayer` を覗いた状態 ——の2種類で、**どちらも wp-env の中には存在しない**
  （GTM は外部サービス、DevTools は撮影用ブラウザの外側の UI）。この撮影基盤では撮れないため、
  別途の対応方針を人間が判断する。サイト側 `docs/help-backlog.md` §C1 は未完のまま残る
  （`tests/e2e/help-pages.spec.ts` の `SLUGS_WITHOUT_IMAGES` から `'gtm'` を外すのも同様に保留）。

## 店舗一覧カットに写る `店舗1` の見切れは「許容」する（検討済み・変更しない）

`docs/website-screenshots/stores/01-store-list.png` の下端には、回帰スイートのフィクスチャ
`店舗1`（id=2・住所も電話もメールも空）のカード上部が約90px 残る。**これは既知であり、
解消しないと決定した。** 削除案・`sort_order` 退避案の両方を検討したうえでの結論なので、
蒸し返す前に以下を読むこと。

- **削除は不可**: `店舗1`（id=2）は回帰スイートの load-bearing fixture。
  `tests/e2e/phase3-helpers.js` の `restoreBaseline()` が `USER_STORE_ID = 2` として毎回
  再 INSERT し、`tests/e2e/bug-a-plain-regate.spec.js` / `phase2-reservations-smoke.spec.js` /
  `phase3-flow.spec.js` が `store_id: 2` に依存している。消すと回帰が壊れる。
- **デモ店舗の採番による押し下げは実施済み**: デモ店舗を `渋谷=1 / 新宿=2 / 横浜=3` に採番し、
  `店舗1`（`sort_order=10`）を4番目へ落とすところまでは**実施済み**。これにより `横浜店` が
  フレーム内に収まり、「空のカードが一等地を占める」問題は解消している。
- **`店舗1` 自体の `sort_order` を 999 等へ退避する案は、検討したうえで見送った**:
  `店舗1` の `sort_order` には回帰テストの依存が存在するため。依存の実体は
  `tests/e2e/phase6-visibility.spec.js:118` のコメント
  `// 店舗選択ステップは表示されない（OFF + 自動で sort_order 最小の店舗1 が選ばれる）。`
  — 同 spec は `insertStore( '渋谷店', { sort_order: 30 } )` を投入したうえで、
  **`店舗1`（`sort_order=10`）が「`sort_order` 最小のユーザー店舗」であり続けること**を前提に
  自動選択の挙動を検証している。
  ただし正確に書けば、`restoreBaseline()` が回帰実行のたびに `店舗1` を `sort_order=10` で
  再 INSERT するため、**撮影シード側で退避しても回帰実行時には自動的に戻り、回帰が壊れる経路は
  実際には無い**。それでも「`sort_order` に依存するテストが存在する」こと自体を尊重し、
  安全側に倒して見送った。

**結論**: カード4枚で 720px を約17px 超過するのは、v0.4.1 以降ショートコード行が追加されて
カードが縦に高くなったため。下端の見切れは**「リストが下に続く」ことを示すもの**として許容する。

> 将来 `tests/e2e/phase6-visibility.spec.js:118` の `sort_order` 依存が解消されたら、
> `店舗1` の `sort_order` 退避案を再検討してよい。

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
