# Smart Booking 引き継ぎ state

最終更新: 2026-07-13

## 現在地
- 公開済み: v0.2.2（WordPress.org）。次バージョン: v0.2.3（不具合修正）。**未リリース**（実装は未コミット作業ツリー）。
- **v0.2.3 対象バグ＝全てクローズ・未リリース**:
  - **BUG-1/2＋BUG-4＋自動更新フック(b)**（ledger 第1〜3報）: `includes/rest/class-rest-schedules.php` / `includes/class-activator.php` / `smart-booking.php`。
  - **BUG-A（Plain パーマリンク REST 依存）**（第4報）: `src/admin/api.js` / `src/frontend/api.js` / `tests/e2e/bug-a-plain-repro.spec.js`(skip化)。
  - **BUG-3（メール未達）(iii)**（第5〜6報）: (i) 失敗可視化＝`includes/class-email.php` / `includes/rest/class-rest-settings.php` / `src/admin/api.js` / `src/admin/pages/settings/MailSettingsTab.jsx` / `src/admin/admin.scss`。(ii) docs＝`docs/ops/email-deliverability.md`。
  - **BUG-B（管理画面ロゴ未同梱）(A)**（第8報）: `src/admin/App.jsx` / 新規 `src/admin/images/SmartBookingLogo.svg`。data URI インライン同梱・配布ZIP実行時解決まで Green。
- 全案件、固有ゲート＋回帰（ベースライン差分・新規失敗ゼロ）＋Plugin Check＋契約非破壊で Green。

## 次の一手（人間 GO / 判断待ち）
1. **v0.2.3 リリース手順（人間の明示 GO・不可逆）**: `npm run build` → バージョン4箇所更新（`smart-booking.php` の `Version:` ／ `SMART_BOOKING_VERSION` ／ `readme.txt` `Stable tag:` ／ `package.json` `version`）→ readme.txt Changelog 追記（日本語）→ `plugin-zip` → SVN commit / WordPress.org 公開。planner が1ブロックずつ提示して GO を待つ。
2. **リリース前に整理が要る別トラック（人間判断）**:
   - readme.txt 英語readme言語 ERROR 2件（WordPress.org 2025-07 新ポリシー）＝再審査で実害。**リリース前に要対応の可能性**。
   - ゲート定義の CLAUDE.md／`.claude/agents/logic-evaluator.md` 反映（decision 0001・ユーザー確認待ち）。
   - phase3 仕様 vs 出荷乖離（`docs/bugs/spec-vs-shipped-booking-flow.md`）／few_left 視覚表現（第4報）／BUG-3 UX 改善（第6報）／BUG-B aria-label 二重（第8報）＝いずれも非ブロッキング別件。

## 未解決 / 確認事項
- 上記別トラックの取り扱い（特に readme.txt 英語ポリシーはリリース審査に影響）。
- 検証資産の掃除候補: `tests/red/_tmp_migration_probe.php`, `tests/red/bug3-mail-*.php`, `tests/e2e/bug-a-plain-repro.spec.js`(skip), `tests/e2e/bug-b-logo-shipping.spec.js`（配布対象外だが整理判断）。
- 変更は未コミット。リリース前に commit 方針（ブランチ/メッセージ）を人間と確認。

## テスト運用メモ
- 長時間スイートは**フォアグラウンド＋spec チャンク＋Bash ツール timeout**（シェル `timeout` は macOS 未インストール）。detached background は孤児化防止のため使わない。
- 回帰ゲート＝ベースライン差分で新規失敗ゼロ（既知 stale 3件: phase3-fix1:45 / phase3-validation:115 / phase3-responsive:967 は別件）。

## 触ってはいけない
- デモ VPS 同居の Laravel（`api.konkatsu-scope.com`）と Python。
- 公開済みの REST 契約・DB 既存カラム（拡張は人間承認 → 正本反映 → 派生）。
