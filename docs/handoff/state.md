# Smart Booking 引き継ぎ state

最終更新: 2026-07-13

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
- 回帰ゲート＝ベースライン差分で新規失敗ゼロ（既知 stale 3件: phase3-fix1:45 / phase3-validation:115 / phase3-responsive:967 は別件）。

## 触ってはいけない
- デモ VPS 同居の Laravel（`api.konkatsu-scope.com`）と Python。
- 公開済みの REST 契約・DB 既存カラム（拡張は人間承認 → 正本反映 → 派生）。
