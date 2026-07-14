# Smart Booking 引き継ぎ state

最終更新: 2026-07-14

## 現在地
- **公開バージョン: v0.2.3（WordPress.org・SVN rev 3605460、2026-07-13 公開）**。前バージョン v0.2.2（rev 3592043）。
- git: v0.2.3 の全作業を `main` にコミット・push 済み（release コミット `31354bd`、GitHub タグ `v0.2.3`）。作業ツリー クリーン。
- **v0.2.3 でリリース済み（全て Green・公開済み）**:
  - **BUG-1/2＋BUG-4＋自動更新フック(b)**（第1〜3報）: `includes/rest/class-rest-schedules.php` / `includes/class-activator.php` / `smart-booking.php`（copy_schedules 店舗×担当者スコープ／schedules UNIQUE＋dedup 移行／admin_init maybe_upgrade）。
  - **BUG-A（Plain パーマリンク REST 依存）**（第4報）: `src/admin/api.js` / `src/frontend/api.js`（buildUrl セパレータ修正）。
  - **BUG-3（メール未達）(iii)**（第5〜6報）: (i) 送信失敗の可視化＝`includes/class-email.php` / `includes/rest/class-rest-settings.php` / `src/admin/api.js` / `src/admin/pages/settings/MailSettingsTab.jsx` / `src/admin/admin.scss`。(ii) docs＝`docs/ops/email-deliverability.md`。
  - **BUG-B（管理画面ロゴ未同梱）(A)**（第8報）: `src/admin/App.jsx` / `src/admin/images/SmartBookingLogo.svg`（webpack import＝data URI 同梱）。
  - **few_left（残りわずか）視覚回帰**（第10報）: `src/frontend/styles/frontend.css`（警告色/バッジ復元・仕様3.4準拠）。
  - **readme 英語化**（WordPress.org 2025-07 ポリシー）: 短い説明＋Description を英語復元・`non_official_language` 0。
- 全案件、固有ゲート＋回帰（ベースライン差分・新規失敗ゼロ）＋配布物 Plugin Check 0/0（ZIP 実測・混入なし・全修正同梱）＋契約非破壊で Green。

## v0.3.0 進行中（未リリース・仕様は `docs/spec-amendment-v030-v040.md`）
- **機能① 店舗・担当者の呼び方設定：実装完了・検証 Green（2026-07-14）**。
  - ブランチ `feat/v030-store-staff-labels` にコミット（**push なし**）。**バージョンは 0.2.3 のまま据え置き**（v0.3.0 は ①③④ が揃った時点で別途リリース。readme Changelog 未着手）。
  - 内容: 設定に個別 option 2つ `smart_booking_store_label` / `smart_booking_staff_label`（新テーブル無し）。GET/POST `/settings` と GET `/public/settings` に2キー追加（**追加のみ・公開契約非破壊**）。空文字→デフォルト（店舗/担当者）フォールバックは `class-rest-public.php::get_settings()` 末尾に集約。管理画面 基本設定タブに入力UI（maxLength=20）。反映は**フロントのみ**（StoreSelect/StaffSelect 見出し・SelectionBar・DonePage ラベル・state.js 店舗固定エラー）。管理画面表記は意図的に不変。
  - 検証: logic-evaluator が全完了条件 Green（REST フォールバック決定的検証・新規 E2E `tests/e2e/v030-labels-front.spec.js` A/B pass・デグレ無し・回帰新規失敗ゼロ）。
  - 既知の非ブロッキング残件:
    - 🟡 phpcs 整形警告 +2（`class-rest-settings.php` の新2行 `DoubleArrowNotAligned`）。**意図的に既存の整列スタイルに合わせて据え置き**（この sniff は `wp plugin check` のゲート対象外・phpcbf で全ブロック再整列すると差分が肥大するため不採用）。ERRORS は 0/0。
    - 🔵 `tests/e2e/phase6-visibility.spec.js:B`（line 279-280）が本機能と無関係にプリエグジスティングで 90s タイムアウト（`page_id=7` ハードコードがリビジョン扱いで nonce 未 localize）。要別件起票（`page_id=7`→`FRONT_PAGE_PATH` 化）。ベースラインにも存在＝非回帰。
- **機能③ 条件フィールド：実装完了・検証 Green（2026-07-14）**。
  - 同ブランチにコミット（**push なし・0.2.3 据え置き**）。radio/select 親の選択値で子フィールドを表示/非表示。3制約（条件1つ・親は radio/select のみ・ネスト禁止1段）。
  - DB: `smart_booking_custom_fields` に `condition_field_key varchar(100) NULL` / `condition_value varchar(255) NULL` を dbDelta で追加（**db_version bump せず・0.3.0 移行判定はリリース時に確定**。開発は再有効化で適用）。
  - サーバ: 管理CRUD（条件バリデーション・**親削除の依存ブロック**・**逆方向ネスト `smb_field_condition_is_parent` も両側で塞いだ**）／公開取得／**予約作成のサーバ側再評価 `condition_met()`**（表示中のみ必須・非表示値は meta 破棄。フロント判定を信用しない）。REST は `condition_field_key`/`condition_value` を**追加のみ**で非破壊。CSV/予約詳細は meta 由来で自動空欄（無改修）。
  - フロント: 共有 `fieldConditions.js`（`isFieldVisible`）／FormInput・MainInputPage・ConfirmPage（表示中のみ描画/検証/payload除外＝送信時破棄）／CustomFieldModal「表示条件」UI（親候補フィルタ・system非表示・逆方向ネスト非表示）／FormSettingsPage。
  - 検証: logic-evaluator が全完了条件 Green（サーバ再評価を直接POSTで実証・CSV実出力で破棄空欄確認・管理UI DOM 実走）。新規 E2E `tests/e2e/v030-conditional-fields.spec.js`（A/B/C）＋`tests/e2e/v030-conditional-admin.spec.js`（2g・4ケース）。**デグレなし**（条件ゼロ時は従来同一）。回帰ゲートは planner が form/admin/flow/confirm/reservations 系を実走し新規失敗ゼロを確認。
- **機能④ 住所フィールド（郵便番号自動入力）：実装完了・検証 Green（2026-07-14）**。
  - 同ブランチにコミット（**push なし・0.2.3 据え置き**）。field_type `address` = 郵便番号+住所の複合フィールド。meta は `{key}_zip`/`{key}_address` の2キーで保存。CSV は常に2列出力（`{label}（郵便番号）`/`{label}（住所）`）。is_required は複合全体に適用。自動入力 ON/OFF チェックボックス（デフォルト ON）。address は③の子には成れるが親には成れない。
  - **外部通信は zipcloud（`https://zipcloud.ibsnet.co.jp/api/search`）**。CORS は人間側 Chrome DevTools で事前検証済（実行元 `https://demo.wp-smart-booking.com/`、ヒット `zipcode=1500002`→`東京都渋谷区渋谷`、0件 `zipcode=0000000`→`{results:null,status:200}`）。通信条件＝address フィールドが存在し自動入力 ON かつ利用者が郵便番号7桁を入力したときのみ。全角郵便番号は半角正規化（`normalizeZip`）。フェイルソフト（API 失敗/タイムアウト5s/0件でもブロックせず・console.error/warn 無し）。
  - サーバ: `class-rest-custom-fields.php`（ALLOWED_TYPES に address 追加・`field_options={autofill:bool}` 保存・`resolve_autofill`）／`class-rest-public.php`（address 分岐で autofill 出力・`normalize_zip` 全角対応・必須検証は zip 7桁+住所両方／任意時は zip があれば7桁・meta は `condition_met` 破棄の後に2行 insert・**フロント判定を信用せずサーバ再正規化**）／`class-rest-reservations.php`（CSV を (label, meta_key) リストへ一般化し address は2列を常時出力）。REST は field_options 経由で**追加のみ・非破壊**。
  - フロント: `src/frontend/addressLookup.js`（`normalizeZip`／`lookupAddress`＝AbortController 5s・`credentials:omit`・`cache:no-store`・失敗時 null）／`src/frontend/components/AddressField.jsx`（zip+住所の複合入力・500ms debounce・requestTokenRef で古い/アンマウント結果を無効化・ユーザー編集済みは上書きしない overwrite-guard）／FormInput・MainInputPage・ConfirmPage（address 分岐＝`〒{zip} {address}`）／管理: FieldTypeCards（address カード）・CustomFieldModal（「住所の自動入力」Switch・デフォルト ON）・CustomFieldRenderer・ManualReservationModal（`normalizeZip` で meta 展開）・ReservationDetailModal（`〒{zip} {address}` 表示）。
  - 検証: logic-evaluator が全完了条件 Green。新規 E2E `tests/e2e/v030-address-field.spec.js`（A 自動補完/全角/2キー・B フェイルソフト0件・C ③連携で非表示値破棄・D 自動入力OFF は無通信+直POSTバリデーション、desktop+mobile 8 pass、全て route intercept でモック）。REST 往復・全角「１５００００２」→「東京都渋谷区渋谷」→`dest_zip=1500002`/`dest_address`・自動入力OFF時 zipcloud リクエスト0件・console error 0・直POSTで `smb_reservation_zip_invalid`/`smb_reservation_custom_field_required`・address 親拒否 `smb_reservation`/`smb_field_condition_parent_invalid`・CSV 2列を実証。**デグレなし**（address 分岐は全て `field_type==='address'` ゲート）。回帰ゲートは planner が form-settings/reservations/flow（32 pass）を実走し新規失敗ゼロを確認。
  - 既知の非ブロッキング残件:
    - 🟢 2d 上書き防止・2j 予約詳細表示はコード確認済（専用 E2E は未追加だが実装は堅牢・test A が自動補完後の手編集を通過）。
    - 🟡 phpcs 整形警告 +3（address 分岐の整列）。①③と同方針で据え置き（`wp plugin check` ゲート対象外・ERRORS 0/0）。
    - 🔴 **リリース時 readme External services に zipcloud 追記必須**（下記チェックリスト。④コミットでは readme 未タッチ＝意図的にリリース作業へ集約）。
- **①③④ が全て揃った。次は v0.3.0 リリース作業（下記チェックリスト・すべて人間 GO）**。②は v0.4.0。

### ⚠️ v0.3.0 リリースチェックリスト（機能④で発生した規約必須事項）
- **readme.txt の External services セクションに住所検索 API（zipcloud）を必ず追記する**（通信先 `https://zipcloud.ibsnet.co.jp/api/search`・目的=郵便番号からの住所自動補完・タイミング=「住所フィールドが存在し自動入力ON かつ利用者が郵便番号7桁を入力したとき」・送信データ=郵便番号のみ・提供元 zipcloud）。**本機能はプラグイン初の「予約フロー中の外部通信」。追記漏れは WordPress.org 規約違反**。④実装コミットでは readme を触っていない（意図的にリリース作業へ集約）。
- 通常のリリース手順: バージョン4箇所更新（`smart-booking.php` Version / `SMART_BOOKING_VERSION` / `readme.txt` Stable tag / `package.json`）＋ Changelog（日本語）＋ `npx wp-scripts plugin-zip` ＋ SVN commit。すべて人間 GO。

## 次の一手
1. **約24時間後（2026-07-14 目安）に https://wordpress.org/plugins/smart-booking/ で バージョン 0.2.3 表示・Changelog を目視確認**（WP.org 配布反映の遅延は正常）。
2. 残トラック（**v0.2.4／設計トラック送り**・いずれも非ブロッキング）:
   - **phase3 仕様乖離**（`docs/bugs/spec-vs-shipped-booking-flow.md`：仕様 3.1/3.2 の多段ステップ vs 出荷済み統合設計）＝要プロダクト判断。
   - **BUG-3 UX 微改善**（第6報：skip 種別ごとの誘導文・SMTP 表現の具体化）。
   - **BUG-B aria-label 二重発話の統一**（第8報）。
- **GO 待ち・未リリース事項はクリア**（v0.2.3 公開完了）。ゲート定義の CLAUDE.md／`.claude/agents/logic-evaluator.md` 反映（decision 0001）は反映・コミット済み（`a61be83` / `e59b3f5`）。

## 未解決 / 確認事項
- 検証資産の掃除候補（配布対象外・任意）: `tests/red/bug3-mail-failure-red.php`, `tests/red/bug3-mail-green-verify.php`, `tests/e2e/bug-a-plain-repro.spec.js`(skip), `tests/e2e/bug-b-logo-shipping.spec.js`, `tests/e2e/few-left-visual-repro.spec.js`。

## テスト運用メモ
- 長時間スイートは**フォアグラウンド＋spec チャンク＋Bash ツール timeout**（シェル `timeout` は macOS 未インストール）。detached background は孤児化防止のため使わない。
- 回帰ゲート＝ベースライン差分で新規失敗ゼロ。既知 stale（ベースラインでも失敗＝別件・ブロックしない）:
  - phase3-fix1:45 / phase3-validation:115 / phase3-responsive:967（`docs/bugs/spec-vs-shipped-booking-flow.md` の仕様乖離）。
  - **phase3-validation:174 / :319 も同根**（統合設計 MainInputPage は「送信時エラー表示」ではなく「必須未入力時はボタン disabled」。旧多段ステップ前提のテストが古い）＝2026-07-14 の③回帰確認で stash 比較しベースラインでも同一失敗を確認。serial のため後続テストは巻き添えスキップされる。
  - **phase9-redesign-confirm-responsive:220**（375px 幅）もプリエグジスティング（stash 比較で確認）。
  - phase6-visibility:B（`docs/bugs/phase6-visibility-flaky-page-id-7.md`、page_id=7 ハードコード）。

## 触ってはいけない
- デモ VPS 同居の Laravel（`api.konkatsu-scope.com`）と Python。
- 公開済みの REST 契約・DB 既存カラム（拡張は人間承認 → 正本反映 → 派生）。
