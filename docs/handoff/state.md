# Smart Booking 引き継ぎ state

最終更新: 2026-07-12

## 現在地
- 公開済み: v0.2.2（WordPress.org, SVN rev 3592043 / readme日本語化 rev 3592054）。次バージョン: v0.2.3（不具合修正）。
- **【クローズ】BUG-1/2（コピーの店舗×担当者スコープ無視＝データ損失）＋ BUG-4（schedules UNIQUE 欠如）＋ 自動更新フック(b) = 実装完了・全固有ゲート Green・未リリース**で確定。
  - 変更ファイル（未コミット・未リリース）: `includes/rest/class-rest-schedules.php` / `includes/class-activator.php` / `smart-booking.php`。
  - 検証: 詳細は `docs/bugs/v0.2.3-bug-ledger.md`（第1〜3報）。自動更新シナリオ（activate 非経由・admin_init だけで dedup＋UNIQUE が1回発火・冪等・失敗時 bump なし）を実測証明済み。
- **回帰ゲート定義を改訂**（人間 (C) 選択）: 「既存 phase1〜3 全 Green」→「ベースライン差分で変更起因の新規失敗ゼロ」。決定の正本＝`docs/decisions/0001-regression-gate-baseline-diff.md`。**CLAUDE.md と `.claude/agents/logic-evaluator.md` への実反映はユーザー確認待ち**（設定/CLAUDE.md はエージェント指示だけで変更しない方針のため。提案差分は decision に記載）。
- ハーネス: planner / backend-generator / frontend-generator / logic-evaluator / ux-evaluator（`.claude/agents/`）。

## 別件トラック（今回決着しない）
- **phase3 予約フロー赤3件 = 仕様 vs 出荷済み設計の乖離**（本変更起因ではない・`git stash` ベースライン同値で証明）。正本: `docs/bugs/spec-vs-shipped-booking-flow.md`。要プロダクト判断（有力＝出荷設計を正とし仕様 3.1/3.2 追認＋テスト現状化）。BUG-A/3/B とは独立。

## 進行中 / 次の一手（別途着手指示待ち）
1. 残バグ: BUG-A（Plain パーマリンク REST 依存）、BUG-3（メール診断可視化＋環境対応）、BUG-B（ロゴ同梱）。
2. phase3 乖離（`docs/bugs/spec-vs-shipped-booking-flow.md`）のプロダクト判断。
3. 上記すべて決着後に v0.2.3 リリース手順（人間 GO）。

## 未解決 / 確認事項
- ゲート定義の CLAUDE.md／logic-evaluator.md への反映（ユーザー確認待ち・decision 0001）。
- phase3 乖離の (A)/(B) プロダクト判断。
- readme.txt 英語readme言語 ERROR 2件（WordPress.org 2025-07 新ポリシー。既存事項・再審査時に実害）。
- 一時プローブ `tests/red/_tmp_migration_probe.php` 残置（`.distignore` で配布対象外・掃除候補）。
- BUG-3 のメール到達は環境要因（SMTP/SPF/DKIM/DMARC）。
- wp-env 状態ドリフト（オプション消失→再シードで回復）。テスト前に fixture 状態を要確認。

## GO 待ち（不可逆・人間の明示 GO が必要）
- `npm run build` 後のバージョン4箇所更新・Changelog 追記・`plugin-zip` 生成。
- SVN commit / WordPress.org 公開（不可逆）。

## 触ってはいけない
- デモ VPS 同居の Laravel（`api.konkatsu-scope.com`）と Python。
- 公開済みの REST 契約・DB 既存カラム（拡張は人間承認 → 正本反映 → 派生）。
