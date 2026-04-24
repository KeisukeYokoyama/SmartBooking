# CLAUDE.md — Smart Booking 開発ガイド

## プロジェクト概要

WordPress予約プラグイン「Smart Booking」を1から新規開発する。
仕様はすべて `docs/smart-booking-spec.md` に定義済み。必ず最初に読むこと。

## 技術スタック

- バックエンド: PHP（WordPress Plugin API）
- フロントエンド: React（管理画面 + フロント予約フォーム両方）
- ビルド: @wordpress/scripts（webpack内蔵）
- データ: カスタムテーブル 6つ（$wpdb + dbDelta）
- 開発環境: @wordpress/env（Docker）

## UI参考

`docs/reference-ui/` ディレクトリに旧バージョンのスクリーンショットがある。
旧コードは参照しない。スクリーンショットのUIデザインのみを参考にReactで再現する。

### フロントエンド（ユーザー画面）

| ファイル | 内容 |
|---------|------|
| screenshot-1.png | 予約フォーム（横スクロール日表示 + 時間枠選択） |
| front-booking-mobile.png | 予約フォーム モバイル表示（フォーム入力 + 日付・時間選択の全体像） |
| front-confirm-mobile.png | 確認画面 モバイル表示（予約日時 + 入力情報一覧 + 確定/修正ボタン） |

### 管理画面 — スケジュール管理

| ファイル | 内容 |
|---------|------|
| screenshot-2.png | スケジュール管理トップ（月カレンダー + スケジュールリスト） |
| admin-schedule-add-modal.png | スケジュール追加モーダル（日付・時間枠単位・時間枠追加・予約可能数） |
| admin-schedule-copy-individual.png | スケジュールコピー — 日付個別選択モード |
| admin-schedule-copy-pattern.png | スケジュールコピー — パターン選択モード（曜日選択 + 期間指定） |
| admin-schedule-settings.png | 表示期間設定 + 予約締切日設定（設定例付き） |
| admin-store-filter.png | 店舗フィルタードロップダウン |

### 管理画面 — 予約一覧

| ファイル | 内容 |
|---------|------|
| screenshot-3.png | 予約一覧（フィルタ + テーブル + ステータス表示） |

### 管理画面 — 店舗管理

| ファイル | 内容 |
|---------|------|
| admin-store-add-modal.png | 店舗追加モーダル（店舗名・説明・住所・電話番号・URL・GoogleMaps・カレンダー色・表示順・ステータス） |

### 管理画面 — フォーム設定

| ファイル | 内容 |
|---------|------|
| screenshot-4.png | フィールド設定タブ（フィールドタイプカード + フィールド一覧） |
| admin-form-fields.png | フィールド設定タブ（Pro機能なしバージョン） |
| admin-form-theme.png | テーマ設定タブ（ボタン色・日付選択色・時間帯色・必須マーク色・フォーカス色） |

### 管理画面 — 表示設定

| ファイル | 内容 |
|---------|------|
| admin-display-settings.png | カレンダー表示モード + セクション表示順序の設定 |

## コーディング規約（必須）

以下はWordPress.org審査で却下されないための必須ルール。1つでも違反すると審査落ちする。

### PHP

- 全PHPファイル冒頭に `if (!defined('ABSPATH')) exit;`
- テーブル作成は `register_activation_hook` でのみ実行。`init` での毎回実行は禁止
- PHPネイティブセッション（`session_start()`）不使用
- 全DBクエリに `$wpdb->prepare()` 使用。例外なし
- 全出力に `esc_html()` / `esc_attr()` / `wp_kses_post()` 適用
- 全REST APIエンドポイントに nonce検証 + `current_user_can('manage_options')` チェック
- `file_get_contents()` 不使用。ファイル操作は `WP_Filesystem` を使用
- `error_log()` は本番コードに含めない
- 外部CDNからのスクリプト/スタイル読み込み禁止

### React / JavaScript

- 全ライブラリを `@wordpress/scripts` でバンドル同梱
- 外部CDNからの読み込み禁止
- 状態管理はReact State（useState / useReducer）で行う

### 外部通信

- Googleカレンダー連携・ChatWork通知はデフォルトOFF
- ユーザーが設定画面で明示的に有効化した場合のみ通信が発生
- readme.txt に通信先・目的・タイミングを明記すること

## 実装フェーズ

各フェーズの完了条件を満たしてから次に進む。

### フェーズ 0: プロジェクト初期化

**作業内容:**
- `package.json` 作成（@wordpress/scripts, React, @wordpress/env）
- webpack設定（エントリーポイント2つ: admin, frontend）
- `.wp-env.json` 作成
- メインプラグインファイル `smart-booking.php`（プラグインヘッダーのみ）

**完了条件:**
- `npm install` が成功する
- `npm run build` が成功する（空のエントリーポイントでOK）
- `npx wp-env start` でWordPressが起動する
- プラグインが有効化できる（エラーなし）

### フェーズ 1: DB・有効化・REST API骨格

**作業内容:**
- `class-activator.php`: テーブル6つの作成、デフォルト店舗・担当者の自動生成
- `class-admin.php`: 管理メニュー登録（5つのサブメニュー）、React用div出力
- `class-rest-api.php`: 全エンドポイントの骨格（CRUD for stores, staff, schedules, reservations, custom_fields, settings）
- `class-shortcode.php`: `[smart_booking]` ショートコード登録、React用div出力
- `uninstall.php`: 全テーブル・オプション削除

**完了条件:**
- プラグイン有効化でテーブル6つが作成される
- デフォルトの店舗1つ・担当者1つが `smb_stores` / `smb_staff` に存在する
- WordPress管理画面のサイドバーに「Smart Booking」メニューが表示される
- REST APIエンドポイントがnonce付きリクエストに応答する（200 OK）
- nonce無しリクエストが拒否される（401/403）
- プラグイン削除で全テーブルが削除される

### フェーズ 2: 管理画面（React）

**作業内容:**
- 管理画面React App全体（src/admin/）
- ページ: Schedule, Reservations, Stores（担当者含む）, FormSettings, Settings（5タブ）
- スケジュール管理: 月カレンダー + スケジュールリスト表示
  - スケジュール追加: モーダルで日付・時間枠単位・時間枠（開始時間+予約可能数）を複数設定
  - スケジュール編集: 既存スケジュールの時間枠を変更
  - スケジュール削除
  - スケジュールコピー（日付個別）: コピー元スケジュールを選び、コピー先日付を1つずつ追加して複製
  - スケジュールコピー（パターン）: コピー元スケジュールを選び、曜日（日〜土チェックボックス）＋期間（開始日〜終了日）を指定して一括複製
  - コピー時の上書きオプション: 「既存スケジュールがある日付も上書きする」チェックボックス
- 予約一覧: フィルタ（名前、メール、店舗、担当者、日付範囲、ステータス）、テーブル表示、ステータス変更、手動予約作成、CSV出力
- 店舗・担当者: CRUD、画像アップロード（WPメディアライブラリ）、有効/無効切替、並び替え
- フォーム設定: フィールドタイプカード形式での追加、一覧表示、並び替え、編集、削除
- 設定: 5タブ（基本設定、メール通知、外部連携、デザイン、サポート）

**完了条件（Playwrightで検証）:**
- 全5ページが表示される（React描画エラーなし）
- スケジュールのCRUD操作が正常に動作する
- スケジュールコピー（日付個別）で指定日にスケジュールが複製される
- スケジュールコピー（パターン）で指定曜日・期間にスケジュールが一括複製される
- コピー時の上書きオプションが正しく動作する（上書きON/OFF）
- 予約一覧のフィルタ・ソート・ステータス変更が動作する
- 店舗・担当者の追加・編集・削除が動作する
- カスタムフィールドの追加・並び替え・削除が動作する
- 設定の保存・読み込みが動作する
- CSV出力でファイルがダウンロードされる

### フェーズ 3: フロント予約フォーム（React）

**作業内容:**
- 予約フォームReact App全体（src/frontend/）
- ステップ: StoreSelect → StaffSelect → DateSelect → TimeSelect → FormInput
- スキップルール実装（店舗1つならスキップ、担当者1人ならスキップ）
- 表示順序切替（日付・時間→フォーム / フォーム→日付・時間）
- カレンダーUI: 日表示（横スクロール）、月表示（グリッド）、切替トグル
- 日付選択後、カレンダー下に時間枠をボタン表示
- 空き状況表示（空きあり/残りわずか/満席/締切済み）
- 確認画面（別ページ遷移）
- 完了画面（別ページ遷移）
- 予約締切ロジック（○日前 / ○時間前）
- 同時予約の競合防止（アトミックUPDATEクエリ）
- ハニーポットスパム対策
- カラーカスタマイズ反映（CSSカスタムプロパティ）
- レスポンシブ対応

**完了条件（Playwrightで検証）:**
- ショートコード `[smart_booking]` でフォームが表示される
- 店舗選択→担当者選択→日付→時間→フォーム→確認→完了の全フローが完走する
- 店舗1つ・担当者1人の場合、いきなり日付選択から始まる
- 満席の時間枠がグレーアウトされる
- 締切を過ぎた日付が選択不可になる
- 確認画面で「修正する」を押すと入力内容が保持されたまま戻る
- 完了画面に予約番号が表示される
- 同一時間枠に定員以上の予約ができない（競合テスト）
- スマホ幅（375px）で全ステップが操作可能

### フェーズ 4: メール通知 + 外部連携

**⚠️ このフェーズは開始前に停止し、人間の確認を待つ**

**作業内容:**
- `class-email.php`: メール送信ロジック、テンプレート変数置換
  - 予約受付時: ユーザー宛 + 管理者宛（店舗メール + 担当者CC）
  - 予約承認時: ユーザー宛
- `class-google-calendar.php`: サービスアカウント認証、イベント作成・削除
- `class-chatwork.php`: APIトークン認証、ルームへのメッセージ投稿（self_unread: 1）

**人間が提供するもの:**
- Google Calendar用サービスアカウントJSONキー
- ChatWork APIトークン + ルームID
- テスト用メール受信確認

**完了条件:**
- 予約送信時にユーザーと管理者にメールが届く
- 管理者が予約を承認するとユーザーに確認メールが届く
- メールテンプレートの変数（{customer_name}等）が正しく置換される
- Googleカレンダーに予約イベントが作成される
- ChatWorkの指定ルームに通知メッセージが投稿される

### フェーズ 5: 仕上げ

**⚠️ このフェーズは開始前に停止し、人間の確認を待つ**

**作業内容:**
- PHPCS（WordPress Coding Standards）の全ファイル通過
- ESLintの全ファイル通過
- readme.txt 作成（WordPress.org形式）
- スクリーンショット撮影・配置
- プラグインヘッダー最終確認
- 全Playwrightテストの最終実行

**完了条件:**
- `phpcs --standard=WordPress-Extra` がエラー0
- `npx eslint` がエラー0
- `npm run build` が成功
- readme.txt がWordPress.org形式に準拠
- 全Playwrightテストがパス

## Generator / Evaluator フロー

```
[Generator] コードを書く
     ↓
[Generator] ビルド・リント実行（npm run build, phpcs, eslint）
     ↓ 失敗 → 自分で修正して再実行
     ↓ 成功
[Evaluator] Playwright E2Eテスト実行
     ↓ 失敗 → Generatorにフィードバック → 修正 → 再テスト
     ↓        ※3回修正しても通らない場合は停止してレポート出力
     ↓ 全パス
[次のフェーズへ自動で進む]（フェーズ0〜3のみ）
[停止して人間の確認を待つ]（フェーズ4〜5）
```

## やってはいけないこと

- 旧コード（wp-smart-booking-lite）を参照・コピーしない
- Pro版・有料機能・ライセンスキーの仕組みを入れない
- 「後で使うかも」の機能を先に作らない（YAGNI）
- PHPセッション、外部CDN、file_get_contents() を使わない
- error_log() を本番コードに残さない
- init フックでテーブル作成しない
