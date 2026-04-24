# CLAUDE.md — Smart Booking 開発ガイド

## プロジェクト概要

WordPress予約プラグイン「Smart Booking」を1から新規開発する。
仕様はすべて `smart-booking-spec.md` に定義済み。**各フェーズ着手前に必ず該当セクションを再読すること。**

## 開発元・関連情報

| 項目 | 内容 |
|------|------|
| 開発会社 | 株式会社リベルダージ（Liberdade Inc.） |
| 会社サイト | https://www.liberdade-inc.com/ |
| サービスサイト | https://www.wp-smart-booking.com/ |

以下のファイルで上記情報を使用する:

- **`smart-booking.php`（プラグインヘッダー）**:
  - `Plugin Name: Smart Booking`
  - `Plugin URI: https://www.wp-smart-booking.com/`
  - `Author: 株式会社リベルダージ`
  - `Author URI: https://www.liberdade-inc.com/`
- **`readme.txt`**: Author、Plugin URI、Contributors 等
- **設定画面「サポート」タブ**: カスタマイズ相談の導線リンク先を `https://www.wp-smart-booking.com/` に設定

## 前提条件

開発を開始する前に以下を確認する:

- **Docker Desktop** が起動していること（`docker info` で確認）
- **Node.js** v18以上がインストールされていること
- **Git** が初期化されていること（`git init` 済みであること）

```bash
# 前提条件チェックコマンド
docker info > /dev/null 2>&1 && echo "✅ Docker OK" || echo "❌ Docker未起動"
node -v
npm -v
```

## 技術スタック

- バックエンド: PHP（WordPress Plugin API）
- フロントエンド: React（管理画面 + フロント予約フォーム両方）
- ビルド: @wordpress/scripts（webpack内蔵）
- データ: カスタムテーブル 6つ（$wpdb + dbDelta）
- 開発環境: @wordpress/env（Docker）
- E2Eテスト: Playwright

## UI参考

`docs/reference-ui/` ディレクトリに旧バージョンのスクリーンショットがある。
旧コードは参照しない。スクリーンショットのUIデザインのみを参考にReactで再現する。

> ⚠️ `docs/reference-ui/` が存在しない場合は、仕様書（smart-booking-spec.md）の記述のみを頼りにUIを設計する。人間に確認を求めること。

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

---

## エージェント構成（Claude Code Task ツール）

本プロジェクトでは、Claude Code の `Task` ツールを使ってサブエージェントに作業を委譲する。
メインエージェント（自分自身）は **Orchestrator** として振る舞い、直接コードを書かない。

### Orchestrator（メインエージェント = 自分自身）

**役割**: プロジェクト全体の進行管理と品質ゲート。

- 各フェーズの開始前に `smart-booking-spec.md` の該当セクションを再読する
- Generator に作業を委譲し、成果物を受け取る
- Evaluator にテスト作成・実行を委譲し、結果を受け取る
- Evaluator のフィードバックを Generator に伝えて修正を指示する
- 3回修正しても通らない場合は停止してレポートを出力する
- フェーズ4〜5の開始前は必ず停止して人間の確認を待つ

### Generator（Task サブエージェント）

**ペルソナ**: WordPress開発のエキスパートであり、Reactのエキスパート。バグの少ない安定したエンジニアリングを最重視する。UI/UX設計にも精通しており、ユーザーが直感的に使えるインターフェースを設計できる。

**行動規則**:
- 作業開始前に必ず `smart-booking-spec.md` の該当セクションと `docs/reference-ui/` のスクリーンショットを確認する
- CLAUDE.md の「コーディング規約」を厳守する。1つでも違反するとWordPress.org審査に落ちる
- コードを書いたら必ず自分でビルド（`npm run build`）を実行し、エラー0を確認してから完了報告する
- 1つのファイルが長くなりすぎないよう、適切にコンポーネント分割する
- 「後で使うかも」の機能は絶対に作らない（YAGNI）

**Task 呼び出し時のプロンプトに必ず含めるもの**:
1. 対象フェーズの作業内容（CLAUDE.mdからコピー）
2. 対象フェーズの完了条件（CLAUDE.mdからコピー）
3. `smart-booking-spec.md` の該当セクション全文
4. コーディング規約セクション全文
5. 前のフェーズで作成済みのファイル一覧（`find . -name '*.php' -o -name '*.jsx' -o -name '*.js' | head -50`）
6. Evaluator からのフィードバック（修正サイクル時のみ）

### Evaluator（Task サブエージェント）

**ペルソナ**: テストのプロフェッショナル。いくつものシナリオを想定して、バグを発見したりアプリの安定性を担保することに長けている。必ずPlaywrightで実際の画面を操作して検証する。ユーザー側から見た使い勝手の悪さや改善点を見つけるUI/UXのプロでもある。

**行動規則**:
- ハッピーパス（正常系）だけでなく、異常系・エッジケースを必ずテストする
  - 未入力でのフォーム送信、満席時の予約試行、同時アクセスでの競合
  - 存在しない店舗ID、無効な日付、過去日付の選択
- レスポンシブテスト: スマホ幅（375px）での操作確認を全画面で行う
- アクセシビリティ: キーボード操作、フォーカス順序、ラベルの適切さを確認する
- テスト結果は以下の形式で報告する:
  - ✅ パスしたテスト一覧
  - ❌ 失敗したテスト一覧（エラーメッセージ、スクリーンショットパス付き）
  - 💡 UI/UX改善提案（テスト合否に関わらず気づいた点）

**Task 呼び出し時のプロンプトに必ず含めるもの**:
1. 対象フェーズの完了条件（CLAUDE.mdからコピー）
2. テスト対象のURL（`http://localhost:8888` が wp-env のデフォルト）
3. WordPress管理画面のログイン情報（wp-env デフォルト: `admin` / `password`）
4. 現在のファイル構成（`find . -name '*.php' -o -name '*.jsx' | head -50`）
5. Generator が書いたコードの概要（どのエンドポイント、どのコンポーネントがあるか）

---

## 実装フェーズ

各フェーズの完了条件を満たしてから次に進む。

### フェーズ 0: プロジェクト初期化

**作業内容（Generator）:**
- `package.json` 作成（@wordpress/scripts, React, @wordpress/env）
- webpack設定（エントリーポイント2つ: admin, frontend）
- `.wp-env.json` 作成
- メインプラグインファイル `smart-booking.php`（プラグインヘッダーのみ）
- 空のエントリーポイント作成（`src/admin/index.js`, `src/frontend/index.js`）

**完了条件（Orchestrator が直接検証）:**

```bash
# 1. npm install が成功する
npm install

# 2. ビルドが成功する
npm run build

# 3. wp-env が起動する
npx wp-env start

# 4. プラグインが有効化できる
npx wp-env run cli wp plugin activate smart-booking

# 5. プラグインが有効化されていることを確認
npx wp-env run cli wp plugin list --status=active --format=csv | grep smart-booking
```

> ⚠️ フェーズ0は作業が小さいため、Orchestrator が直接実行してもよい。Task を使わなくてもよい。

### フェーズ 1: DB・有効化・REST API骨格

**作業内容（Generator）:**
- `class-activator.php`: テーブル6つの作成、デフォルト店舗・担当者の自動生成
- `class-admin.php`: 管理メニュー登録（5つのサブメニュー）、React用div出力
- `class-rest-api.php`: 全エンドポイントの骨格（CRUD for stores, staff, schedules, reservations, custom_fields, settings）
- `class-shortcode.php`: `[smart_booking]` ショートコード登録、React用div出力
- `uninstall.php`: 全テーブル・オプション削除
- ビルド実行して成功を確認

**テスト作成・実行（Evaluator）:**

Playwright テストファイル: `tests/e2e/phase1.spec.js`

テストシナリオ:
- プラグイン有効化でテーブル6つが作成される（WP-CLI で確認）
- デフォルトの店舗1つ・担当者1つが `smb_stores` / `smb_staff` に存在する
- WordPress管理画面のサイドバーに「Smart Booking」メニューが表示される
- REST APIエンドポイントがnonce付きリクエストに応答する（200 OK）
- nonce無しリクエストが拒否される（401/403）
- プラグイン削除で全テーブルが削除される

**検証用 WP-CLI コマンド:**

```bash
# テーブル確認
npx wp-env run cli wp db query "SHOW TABLES LIKE '%smb_%';"

# デフォルトデータ確認
npx wp-env run cli wp db query "SELECT id, name FROM $(npx wp-env run cli wp db prefix 2>/dev/null)smb_stores;"
npx wp-env run cli wp db query "SELECT id, name FROM $(npx wp-env run cli wp db prefix 2>/dev/null)smb_staff;"

# プラグイン無効化→削除→テーブル削除確認
npx wp-env run cli wp plugin deactivate smart-booking
npx wp-env run cli wp plugin delete smart-booking
npx wp-env run cli wp db query "SHOW TABLES LIKE '%smb_%';"
```

### フェーズ 2: 管理画面（React）

**作業内容（Generator）:**
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
- ビルド実行して成功を確認

**テスト作成・実行（Evaluator）:**

Playwright テストファイル: `tests/e2e/phase2-*.spec.js`（機能ごとに分割）

テストシナリオ:
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

異常系テスト:
- 必須項目未入力での店舗追加 → バリデーションエラー表示
- 予約が紐づいている店舗の削除 → 警告表示
- 存在しないスケジュールの編集 → エラーハンドリング

### フェーズ 3: フロント予約フォーム（React）

**作業内容（Generator）:**
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
- ビルド実行して成功を確認

**テスト作成・実行（Evaluator）:**

Playwright テストファイル: `tests/e2e/phase3-*.spec.js`（機能ごとに分割）

テストシナリオ（正常系）:
- ショートコード `[smart_booking]` でフォームが表示される
- 店舗選択→担当者選択→日付→時間→フォーム→確認→完了の全フローが完走する
- 店舗1つ・担当者1人の場合、いきなり日付選択から始まる
- 確認画面で「修正する」を押すと入力内容が保持されたまま戻る
- 完了画面に予約番号が表示される

テストシナリオ（異常系・エッジケース）:
- 満席の時間枠がグレーアウトされ選択不可
- 締切を過ぎた日付が選択不可になる
- 同一時間枠に定員以上の予約ができない（競合テスト: 複数タブで同時予約）
- 必須フィールド未入力でのフォーム送信 → バリデーションエラー
- 不正なメールアドレス形式 → バリデーションエラー
- ハニーポットフィールドに値がある場合 → 送信拒否

テストシナリオ（レスポンシブ）:
- スマホ幅（375px）で全ステップが操作可能
- タブレット幅（768px）でレイアウトが崩れない

### フェーズ 4: メール通知 + 外部連携

**⚠️ このフェーズは開始前に必ず停止し、人間の確認を待つ。自動で進めてはならない。**

**人間が提供するもの:**
- Google Calendar用サービスアカウントJSONキー
- ChatWork APIトークン + ルームID
- テスト用メール受信確認

**作業内容（Generator）:**
- `class-email.php`: メール送信ロジック、テンプレート変数置換
  - 予約受付時: ユーザー宛 + 管理者宛（店舗メール + 担当者CC）
  - 予約承認時: ユーザー宛
- `class-google-calendar.php`: サービスアカウント認証、イベント作成・削除
- `class-chatwork.php`: APIトークン認証、ルームへのメッセージ投稿（self_unread: 1）

**完了条件:**
- 予約送信時にユーザーと管理者にメールが届く
- 管理者が予約を承認するとユーザーに確認メールが届く
- メールテンプレートの変数（{customer_name}等）が正しく置換される
- Googleカレンダーに予約イベントが作成される
- ChatWorkの指定ルームに通知メッセージが投稿される

### フェーズ 5: 仕上げ

**⚠️ このフェーズは開始前に必ず停止し、人間の確認を待つ。自動で進めてはならない。**

**作業内容（Generator）:**
- PHPCS（WordPress Coding Standards）の全ファイル通過
- ESLintの全ファイル通過
- readme.txt 作成（WordPress.org形式）
- スクリーンショット撮影・配置
- プラグインヘッダー最終確認

**最終検証（Evaluator）:**
- 全Playwrightテストの最終実行（phase1〜phase3 全スペック）

**完了条件:**
- `phpcs --standard=WordPress-Extra` がエラー0
- `npx eslint` がエラー0
- `npm run build` が成功
- readme.txt がWordPress.org形式に準拠
- 全Playwrightテストがパス

---

## Generator / Evaluator フロー（Task ツール運用）

```
[Orchestrator] フェーズ開始
     ↓
[Orchestrator] smart-booking-spec.md の該当セクションを再読
     ↓
[Orchestrator] Task ツールで Generator を呼び出し
     ↓
[Generator] コードを書く + ビルド・リント実行（npm run build）
     ↓ ビルド失敗 → Generator が自分で修正して再ビルド
     ↓ ビルド成功 → Orchestrator に完了報告
     ↓
[Orchestrator] Task ツールで Evaluator を呼び出し
     ↓
[Evaluator] Playwright テストを作成・実行
     ↓ 全パス → Orchestrator に報告 + UI/UX改善提案
     ↓ 失敗あり → 失敗レポート（エラー内容 + スクリーンショット）
     ↓
[Orchestrator] 失敗時: Generator に修正を指示（フィードバック付き）
     ↓ ※最大3回まで修正サイクルを繰り返す
     ↓ ※3回修正しても通らない場合は停止してレポート出力
     ↓
[Orchestrator] 全パス確認後、次のフェーズへ（フェーズ0〜3のみ自動進行）
[Orchestrator] フェーズ4〜5は停止して人間の確認を待つ
```

### Playwright セットアップ（フェーズ1の Evaluator 初回呼び出し時に実行）

```bash
# Playwright インストール
npm install -D @playwright/test
npx playwright install chromium

# playwright.config.js を作成
cat > playwright.config.js << 'EOF'
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8888',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 667 } } },
  ],
});
EOF

# テスト用ディレクトリ作成
mkdir -p tests/e2e
```

### テスト実行コマンド

```bash
# 全テスト実行
npx playwright test

# 特定フェーズのテスト実行
npx playwright test tests/e2e/phase1.spec.js

# デスクトップのみ
npx playwright test --project=desktop

# モバイルのみ
npx playwright test --project=mobile

# テスト結果レポート表示
npx playwright show-report
```

---

## wp-env 操作リファレンス

```bash
# 起動
npx wp-env start

# 停止
npx wp-env stop

# リセット（データ全削除して再構築）
npx wp-env destroy && npx wp-env start

# WP-CLI 実行
npx wp-env run cli wp [コマンド]

# プラグイン有効化
npx wp-env run cli wp plugin activate smart-booking

# プラグイン無効化
npx wp-env run cli wp plugin deactivate smart-booking

# プラグイン削除（uninstall.php が実行される）
npx wp-env run cli wp plugin delete smart-booking

# DB直接クエリ
npx wp-env run cli wp db query "SQL文;"

# WordPress ログ確認
npx wp-env logs

# 管理画面URL: http://localhost:8888/wp-admin/
# ログイン: admin / password
# フロントURL: http://localhost:8888/
```

---

## やってはいけないこと

- 旧コード（wp-smart-booking-lite）を参照・コピーしない
- Pro版・有料機能・ライセンスキーの仕組みを入れない
- 「後で使うかも」の機能を先に作らない（YAGNI）
- PHPセッション、外部CDN、file_get_contents() を使わない
- error_log() を本番コードに残さない
- init フックでテーブル作成しない
- Orchestrator がフェーズ4〜5を人間の確認なしに開始しない
