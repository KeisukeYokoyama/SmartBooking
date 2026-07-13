# Smart Booking 引き継ぎ state

最終更新: 2026-07-13

## 現在地
- 公開済み: v0.2.2（WordPress.org）。次バージョン: v0.2.3（不具合修正）。**未リリース**（実装は未コミット作業ツリー）。
- **【クローズ】BUG-1/2＋BUG-4＋自動更新フック(b)**: 実装完了・全固有ゲート Green。変更: `includes/rest/class-rest-schedules.php` / `includes/class-activator.php` / `smart-booking.php`。ledger 第1〜3報。
- **【クローズ】BUG-A（REST パーマリンク依存）**: Plain/pretty 両動作 Green・回帰新規失敗ゼロ・契約非破壊。変更: `src/admin/api.js` / `src/frontend/api.js` / `tests/e2e/bug-a-plain-repro.spec.js`(skip化)。ledger 第4報。
- **【クローズ】BUG-3（メール未達）(iii) 両方**: (i) 失敗可視化＝実装完了・全ゲート Green（A Red→Green PASS=18／B 回帰 新規失敗ゼロ／C Plugin Check 0／D 契約非破壊／ux Green）。(ii) docs 整備＝完了。変更: `includes/class-email.php` / `includes/rest/class-rest-settings.php` / `src/admin/api.js` / `src/admin/pages/settings/MailSettingsTab.jsx` / `src/admin/admin.scss` ＋ `docs/ops/email-deliverability.md`。ledger 第5〜6報。主因（到達性）は環境側対処＝人間対応（docs 提供済み）。
- **回帰ゲート定義を改訂**（人間 (C) 選択）: 正本 `docs/decisions/0001-regression-gate-baseline-diff.md`。**CLAUDE.md / `.claude/agents/logic-evaluator.md` への実反映はユーザー確認待ち**（提案差分は decision に記載）。

## 別件トラック（今回決着しない）
- phase3 予約フロー赤3件 = 仕様 vs 出荷済み設計の乖離。正本 `docs/bugs/spec-vs-shipped-booking-flow.md`。
- 「残りわずか(few_left)」視覚表現の無効化（出荷済み CSS デグレ疑い）。ledger 第4報付記。
- BUG-3 の非ブロッキング UX 改善2点（`skipped_invalid_recipient` の to_type 別誘導／`transport_failed` の SMTP 表現具体化）。ledger 第6報。

## 進行中 / 次の一手（別途着手指示待ち）
1. 残バグ: BUG-B（管理画面ロゴが配布ZIPに未同梱＝`src/admin/App.jsx` が `docs/images/...` 参照）。
2. phase3 乖離・few_left・BUG-3 UX 改善のプロダクト判断。
3. ゲート定義の CLAUDE.md / logic-evaluator.md 反映（ユーザー確認）。
4. 上記決着後に v0.2.3 リリース手順（人間 GO）。

## 未解決 / 確認事項
- BUG-B 未着手。ゲート定義反映（ユーザー確認・decision 0001）。phase3 乖離・few_left・BUG-3 UX 改善の扱い。
- readme.txt 英語readme言語 ERROR 2件（WordPress.org 2025-07 新ポリシー・既存事項）。
- 一時プローブ/検証資産（`tests/red/_tmp_migration_probe.php`, `tests/red/bug3-mail-*.php`）残置＝配布対象外・掃除候補。
- BUG-3 到達性は環境要因（SMTP/SPF/DKIM/DMARC）＝人間対応。`docs/ops/email-deliverability.md` に手順あり。
- テスト運用: 長時間スイートは**フォアグラウンド＋チャンク**（シェル `timeout` は macOS 未インストール→Bash ツール timeout 使用）。detached は孤児化防止のため避ける。

## GO 待ち（不可逆・人間の明示 GO が必要）
- `npm run build` 後のバージョン4箇所更新・Changelog 追記・`plugin-zip` 生成。SVN commit / WordPress.org 公開（不可逆）。

## 触ってはいけない
- デモ VPS 同居の Laravel（`api.konkatsu-scope.com`）と Python。
- 公開済みの REST 契約・DB 既存カラム（拡張は人間承認 → 正本反映 → 派生）。
