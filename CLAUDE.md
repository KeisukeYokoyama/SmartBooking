# CLAUDE.md — Smart Booking 開発ガイド

このファイルは毎セッション読まれる。実装の前に必ず従うこと。
**詳細な仕様・決定・記録は `docs/` が正本。このファイルは「索引」と「恒常ルール」に寄せる。** 量のある記録はここに焼かず `docs/` を指す。

## プロジェクト概要

WordPress予約プラグイン「Smart Booking」。面談・相談型予約（弁護士/士業・結婚相談所・整体院・学習塾）に特化した**完全無料**プラグイン。収益は「無料配布 → カスタマイズ受託」。
仕様はすべて `docs/smart-booking-spec.md` に定義済み。**作業着手前に必ず該当セクションを再読すること。**

> ⚠️ 本プロジェクトは **WordPress.org で公開済み**（下記ステータス）。新規開発フェーズは完了しており、現在は**保守・不具合修正フェーズ**。「1から作る」前提の greenfield 手順は歴史記録として `docs/build-phases.md` に退避した（着手判断の参考のみ）。

## 現在のステータス（最優先）

| 項目 | 内容 |
|------|------|
| 公開状況 | **WordPress.org 公開済み**（slug `smart-booking`、公開バージョン **v0.2.2**、2026-07-01、SVN rev 3592043 / readme日本語化 rev 3592054） |
| 次バージョン | **v0.2.3（不具合修正）** |
| バグ正本 | `docs/bugs/v0.2.3-bug-ledger.md`（症状・再現条件・根本原因・修正方針・検証） |
| 引き継ぎ | `docs/handoff/state.md`（現在地・GO待ち。**セッション開始時に最初に読む**） |

## 開発元・関連情報

| 項目 | 内容 |
|------|------|
| 開発会社 | 株式会社リベルダージ（Liberdade Inc.） |
| 会社サイト | https://www.liberdade-inc.com/ |
| サービスサイト | https://www.wp-smart-booking.com/ |

以下のファイルで上記情報を使用する:

- **`smart-booking.php`（プラグインヘッダー）**: `Plugin Name: Smart Booking` / `Plugin URI: https://www.wp-smart-booking.com/` / `Author: 株式会社リベルダージ` / `Author URI: https://www.liberdade-inc.com/`
- **`readme.txt`**: Author、Plugin URI、Contributors 等
- **設定画面「サポート」タブ**: カスタマイズ相談の導線リンク先を `https://www.wp-smart-booking.com/` に設定

## 凍結する正本（最重要）

公開済みプラグインなので、次を「凍結された正本」として扱う。

- **公開契約**：REST のリクエスト/レスポンス形（`api.js` が前提にする形）と **DB スキーマの既存カラム**。内部ロジックは自由に直してよいが、**契約・既存カラムを壊さない**。
- **WordPress.org 審査規約**（下記コーディング規約）。1つでも破れば審査落ち。
- **3原則**：①現在のプログラムを壊さない ②デグレを発生させない ③影響範囲を調査する。

契約変更・既存カラム変更が必要なときは実装を止め、「拡張課題」として**人間承認を取ってから**正本に反映する（IA/UX 都合を勝手にエンジンへ逆流させない）。スキーマの**追加**（新カラム/UNIQUE 制約等）は「dbDelta 定義追加 ＋ `smart_booking_db_version` bump ＋ 既存データの吸収手順」をワンセットで。

## 前提条件

開発を開始する前に以下を確認する:

- **Docker Desktop** が起動していること（`docker info` で確認）
- **Node.js** v18以上
- **Git** が初期化されていること

```bash
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

`docs/reference-ui/` ディレクトリにスクリーンショットがある。スクリーンショットのUIデザインを参考にReactで再現・修正する。

> ⚠️ `docs/reference-ui/` が存在しない場合は、仕様書（`docs/smart-booking-spec.md`）の記述のみを頼りにUIを設計する。人間に確認を求めること。

### フロントエンド（ユーザー画面）

| ファイル | 内容 |
|---------|------|
| screenshot-1.png | 予約フォーム（横スクロール日表示 + 時間枠選択） |
| front-booking-mobile.png | 予約フォーム モバイル表示 |
| front-confirm-mobile.png | 確認画面 モバイル表示 |

### 管理画面 — スケジュール管理

| ファイル | 内容 |
|---------|------|
| screenshot-2.png | スケジュール管理トップ（月カレンダー + スケジュールリスト） |
| admin-schedule-add-modal.png | スケジュール追加モーダル |
| admin-schedule-copy-individual.png | スケジュールコピー — 日付個別選択モード |
| admin-schedule-copy-pattern.png | スケジュールコピー — パターン選択モード（曜日 + 期間） |
| admin-schedule-settings.png | 表示期間設定 + 予約締切日設定 |
| admin-store-filter.png | 店舗フィルタードロップダウン |

### 管理画面 — その他

| ファイル | 内容 |
|---------|------|
| screenshot-3.png | 予約一覧（フィルタ + テーブル + ステータス） |
| admin-store-add-modal.png | 店舗追加モーダル |
| screenshot-4.png / admin-form-fields.png | フォーム設定 フィールドタブ |
| admin-form-theme.png | テーマ設定タブ |
| admin-display-settings.png | カレンダー表示モード + セクション表示順序 |

## コーディング規約（必須）

WordPress.org 審査で却下されないための必須ルール。1つでも違反すると審査落ちする。

### PHP

- 全PHPファイル冒頭に `if (!defined('ABSPATH')) exit;`
- テーブル作成は `register_activation_hook` でのみ実行。`init` での毎回実行は禁止
- PHPネイティブセッション（`session_start()`）不使用
- 全DBクエリに `$wpdb->prepare()` 使用。例外なし
- 全出力に `esc_html()` / `esc_attr()` / `wp_kses_post()` 適用
- 全REST APIエンドポイントに nonce検証 + `current_user_can('manage_options')` チェック
- `file_get_contents()` 不使用。ファイル操作は `WP_Filesystem`
- `error_log()` は本番コードに含めない
- 外部CDNからのスクリプト/スタイル読み込み禁止

### React / JavaScript

- 全ライブラリを `@wordpress/scripts` でバンドル同梱。外部CDN読み込み禁止
- 状態管理はReact State（useState / useReducer）
- **REST URL はパーマリンク非依存**：ハードコードの `/wp-json/...` を避け、`wp_localize_script` で渡す `esc_url_raw(rest_url())` を root に組み立てる（Plain パーマリンクで壊れないこと。BUG-A 参照）

### 外部通信

- Googleカレンダー連携・ChatWork通知はデフォルトOFF
- ユーザーが設定画面で明示的に有効化した場合のみ通信が発生
- readme.txt に通信先・目的・タイミングを明記すること

### 命名規約（接頭辞）

- DBテーブル名・option/transientキーは接頭辞を `smart_booking_` に統一（例: `{$wpdb->prefix}smart_booking_stores`、`smart_booking_db_version`）。
- REST APIのエラーコード（例: `smb_reservation_full`）は名前空間ではなく**識別子**であり、安定性を優先して接頭辞 `smb_` を維持する。
- **エラーコードの `smb_` は移行漏れではなく意図的な設計判断。一括置換しないこと。**

> 経緯（段階8 / 2026-06-24）: 段階4 で DB 系を一旦 `smb_` → `smabo_` に変更したが、WordPress.org 再審査（2026-06-23）で主プレフィックス `smart_booking_` との**混在**を指摘されたため、段階8 で DB 系を `smart_booking_` に再統一した（既存ユーザーゼロのため純粋リネーム方式、DB マイグレーション無し）。エラーコード `smb_*` は上記の理由で維持。詳細は `docs/smart-booking-spec.md` 5.4「接頭辞の方針」を参照。

---

## エージェント構成（ハーネス）

サブエージェント定義は `.claude/agents/` にファイルで置く。**planner が指揮官**（依存順に手順化・委譲・整合監視、自分では実装しない）。実装は generator、検証は evaluator（読み取り専用・直さない）。

| エージェント | モデル | 役割 |
|---|---|---|
| `planner` | opus | オーケストレーション。実装しない。不可逆操作前に人間 GO 待ち |
| `backend-generator` | opus | PHP / REST / DB / メール / activator・uninstall |
| `frontend-generator` | sonnet | React 管理画面 + 予約フォーム |
| `logic-evaluator` | opus | wp-env で挙動・回帰・競合・隔離・メール呼び出しを検証（読取専用） |
| `ux-evaluator` | sonnet | 非技術者 UX・日本語ラベル・レスポンシブ（読取専用） |

各エージェントの詳細な行動規則・報告フォーマットは `.claude/agents/*.md` を参照（毎回そちらが正本）。

## バグ修正ループ（現在の運用）

```
1. 再現ファースト  logic-evaluator が失敗する再現テストを書く（Red）
2. 修正           backend-generator（必要なら frontend-generator）へ委譲
3. 回帰ゲート      再現テスト Green ＋ ベースライン差分で新規失敗ゼロ（git stash 比較）＋ Plugin Check 0/0 ＋ 隔離ゲート Green
4. UI があれば     frontend 修正後 ux-evaluator が検証
5. まとめ          state.md / bug ledger 更新 → 不可逆リリースは人間 GO
```

- 各ステップ完了ごとに「何をしたか・次は何か」を要約し、大きなファンアウト前に人間の確認を取る。
- 3回修正しても回帰ゲートが Green にならなければ**停止して報告**。

## ゲート（最重要）

- **回帰ゲート**：再現テスト Green ＋ **ベースライン差分で新規失敗ゼロ**（＝変更を `git stash` 退避した素のコードと同スイートを比較し、変更で新たに増えた赤が無いこと。既存の赤はベースラインにもあれば別件として `docs/bugs/` に起票しブロックしない）＋ Plugin Check 0 errors/0 warnings。ここが Green になるまで「修正完了」と扱わない。手続き詳細は `.claude/agents/logic-evaluator.md`。
- **店舗×担当者スコープ隔離ゲート**：複数店舗・複数担当者を作り、ある店舗/担当者への操作（特にスケジュールのコピー・上書き・削除）が**他の店舗・担当者の枠を一切変更・削除しない**ことを証明する（不具合1・2の捕捉点）。

## 不可逆リリースは人間 GO（自走させない）

`npm run build` → **バージョン4箇所を完全一致更新**（`smart-booking.php` の `Version:` ／ `SMART_BOOKING_VERSION` ／ `readme.txt` の `Stable tag:` ／ `package.json` の `version`）→ `readme.txt` Changelog 追記（日本語）→ `npx wp-scripts plugin-zip` → **SVN commit / WordPress.org 公開**。これらは planner が1ブロックずつ手順提示し、**人間の明示的 GO を待つ**。認証情報（SVN/SSH）は Claude が扱わない。

## 実装フェーズ（歴史記録）

新規開発時のフェーズ0〜5の詳細手順は `docs/build-phases.md` に退避済み（保守フェーズでは基本参照しない）。ただし次の原則は恒常:

- **メール通知・外部連携（旧フェーズ4）／仕上げ・リリース（旧フェーズ5）に相当する作業は、開始前に必ず停止し人間の確認を待つ。** APIキー等の提供が必要なため。

---

## wp-env 操作リファレンス

```bash
npx wp-env start                 # 起動
npx wp-env stop                  # 停止
npx wp-env run cli wp [コマンド]  # WP-CLI 実行
npx wp-env run cli wp plugin activate smart-booking
npx wp-env run cli wp plugin deactivate smart-booking
npx wp-env run cli wp db query "SQL文;"
npx wp-env logs

# ⛔ wp plugin delete は絶対に使用禁止（下記「やってはいけないこと」）
# アンインストール検証は wp eval-file で:
# npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/uninstall.php

# 管理画面: http://localhost:8888/wp-admin/（admin / password）
# フロント: http://localhost:8888/
```

Playwright は `playwright.config.js` を使用（`baseURL: http://localhost:8888`、desktop 1280 / mobile 375）。`npx playwright test` で実行。

---

## やってはいけないこと

- 旧コード（wp-smart-booking-lite）を参照・コピーしない
- Pro版・有料機能・ライセンスキーの仕組みを入れない
- 「後で使うかも」の機能を先に作らない（YAGNI）
- PHPセッション、外部CDN、`file_get_contents()` を使わない
- `error_log()` を本番コードに残さない
- `init` フックでテーブル作成しない
- **公開契約（REST 形・DB 既存カラム）を人間承認なしに変更しない**（逆流禁止）
- **不可逆リリース（build後のバージョン更新・ZIP・SVN commit）を人間 GO なしに実行しない**
- **⛔ `wp plugin delete` を wp-env 内で絶対に実行しない**（wp-env はホストディレクトリを bind mount しているため、コンテナ内で delete するとホスト側のソースコード・.git・docs が全削除される。アンインストール検証は `wp eval-file uninstall.php`）
- **⛔ `wp-env destroy` を git commit 前に実行しない**

### .claude/settings.local.json の deny ルール

以下は `.claude/settings.local.json` で deny 登録されており、Claude Code は実行できない:

```json
{
  "deny": [
    "wp plugin delete",
    "rm -rf"
  ]
}
```

---

## セッションの引き継ぎ（運用ルール）

- **開始時**：`docs/handoff/state.md` を読み、現在地・未解決・GO 待ちを把握してから着手。
- **終了時、または文脈が厚くなったら**：`state.md` を更新（直近の完了／進行中／次の一手／未解決／GO 待ち）。引き継ぎはチャットに流さず**ファイルに残す**。
- **大きな判断**は `docs/decisions/`（なければ作る）に追記。次セッションが推測で蒸し返さないための正本。

## 秘密情報の扱い（厳守）

- 鍵・トークンは `.env`／`credentials/`（**gitignore 済みであることを必ず確認**）だけに置く。**コード・CLAUDE.md・コミットに秘密値を書かない。**
- クライアント（ブラウザ）へ秘密キーを渡さない。