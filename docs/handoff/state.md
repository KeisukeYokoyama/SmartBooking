# Smart Booking 引き継ぎ state

最終更新: 2026-07-13

## 現在地
- 公開済み: v0.2.2（WordPress.org, SVN rev 3592043 / readme日本語化 rev 3592054）。次バージョン: v0.2.3（不具合修正）。
- **【クローズ】BUG-1/2（コピーの店舗×担当者スコープ無視）＋ BUG-4（schedules UNIQUE 欠如）＋ 自動更新フック(b)**: 実装完了・全固有ゲート Green・未リリース。変更（未コミット）: `includes/rest/class-rest-schedules.php` / `includes/class-activator.php` / `smart-booking.php`。詳細 `docs/bugs/v0.2.3-bug-ledger.md`（第1〜3報）。
- **【クローズ】BUG-A（REST パーマリンク依存＝Plain で二重 `?` により 404）**: 実装完了・**Plain/pretty 両動作 Green・回帰新規失敗ゼロ・契約非破壊・未リリース**。変更（未コミット）: `src/admin/api.js` / `src/frontend/api.js`（`buildUrl` セパレータを `base.indexOf('?')` で `?`/`&` 切替＋ハードコード `/wp-json/` フォールバック除去）。`build/` 反映済み。詳細 `docs/bugs/v0.2.3-bug-ledger.md`（第4報）。
- **回帰ゲート定義を改訂**（人間 (C) 選択）: 「既存 phase1〜3 全 Green」→「ベースライン差分で変更起因の新規失敗ゼロ」。正本 `docs/decisions/0001-regression-gate-baseline-diff.md`。**CLAUDE.md と `.claude/agents/logic-evaluator.md` への実反映はユーザー確認待ち**（設定/CLAUDE.md はエージェント指示だけで変更しない方針。提案差分は decision に記載）。
- ハーネス: planner / backend-generator / frontend-generator / logic-evaluator / ux-evaluator（`.claude/agents/`）。

## 別件トラック（今回決着しない）
- **phase3 予約フロー赤3件 = 仕様 vs 出荷済み設計の乖離**（本変更起因ではない・`git stash` ベースライン同値で証明）。正本 `docs/bugs/spec-vs-shipped-booking-flow.md`。要プロダクト判断。
- **「残りわずか(few_left)」視覚表現の無効化（新規・BUG-A 非関連）**: `frontend.css` の相反ルール（`:794`/`:2305` 背景色上書き＋`:2360` バッジ非表示）でテキストも色も消え、`available` と見分け不可（aria-label のみ残存）。出荷済み CSS のデグレ疑い。正本 `docs/bugs/v0.2.3-bug-ledger.md`（第4報の付記）。frontend 切り出し推奨。

## 進行中 / 次の一手（別途着手指示待ち）
1. 残バグ: BUG-3（メール診断可視化＋環境対応）、BUG-B（ロゴ同梱）。
2. phase3 乖離・few_left 視覚表現のプロダクト判断。
3. ゲート定義の CLAUDE.md / logic-evaluator.md 反映（ユーザー確認）。
4. 上記すべて決着後に v0.2.3 リリース手順（人間 GO）。

## 未解決 / 確認事項
- ゲート定義の CLAUDE.md／logic-evaluator.md 反映（ユーザー確認待ち・decision 0001）。
- phase3 乖離の (A)/(B) 判断・few_left 視覚表現の扱い。
- readme.txt 英語readme言語 ERROR 2件（WordPress.org 2025-07 新ポリシー。既存事項・再審査時に実害）。
- 一時プローブ `tests/red/_tmp_migration_probe.php` 残置（配布対象外・掃除候補）。BUG-A の Red 実証 spec `tests/e2e/bug-a-plain-repro.spec.js` は `describe.skip` 済み（正ゲートは `bug-a-plain-regate.spec.js`）。
- BUG-3 のメール到達は環境要因（SMTP/SPF/DKIM/DMARC）。

## GO 待ち（不可逆・人間の明示 GO が必要）
- `npm run build` 後のバージョン4箇所更新・Changelog 追記・`plugin-zip` 生成。
- SVN commit / WordPress.org 公開（不可逆）。

## 触ってはいけない
- デモ VPS 同居の Laravel（`api.konkatsu-scope.com`）と Python。
- 公開済みの REST 契約・DB 既存カラム（拡張は人間承認 → 正本反映 → 派生）。
