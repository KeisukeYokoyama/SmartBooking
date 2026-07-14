# 別件（テスト負債）: phase6-visibility テストB が `page_id=7` ハードコードでタイムアウト

最終更新: 2026-07-14
起票元: v0.3.0 機能①（呼び方設定）の回帰確認中に logic-evaluator が検出。
重大度: 🔵 低（**テストのみ**。本番プロダクト挙動には無関係）。
トラック: 機能①③④とは独立。**テスト自体の修正は本トラックでは行わない（記録のみ）**。

## 事象

`tests/e2e/phase6-visibility.spec.js` の

- **テストB**「`B: show_staff_front=OFF + 担当者2 → 担当者ステップなし・capacity 合算・自動割当`」

が、2件目予約の再アクセス箇所（`:279`〜`:280` 付近）で **90 秒タイムアウトして失敗**する。

```js
// tests/e2e/phase6-visibility.spec.js 279行目付近
await page.goto( '/?page_id=7', { waitUntil: 'domcontentloaded' } );
await page.waitForFunction(
    () =>
        !! window.smartBookingFrontend &&
        !! window.smartBookingFrontend.nonce
);
```

`waitForFunction`（`smartBookingFrontend.nonce` の localize 待ち）が永遠に解決せずタイムアウトする。

## 根本原因

- 予約フォームが設置された固定ページは **`page_id=5`**（`phase3-helpers.js` の `FRONT_PAGE_PATH = '/?page_id=5'`）。
- テストBの2件目再アクセスだけが **`/?page_id=7` をハードコード**している。現行の wp-env DB では `page_id=7` は `post_status='inherit'`（リビジョン相当で閲覧不可）であり、ショートコードが実行されず `wp_localize_script` の `smartBookingFrontend`（nonce 含む）がページに出力されない。
- 結果、`waitForFunction` が nonce を検出できずタイムアウトする。
- **本機能（呼び方設定）とは無関係**。テストAの1件目予約フロー（`gotoFrontForm` 経由 = `page_id=5`）は正常に完走する。テストBの1件目も `gotoFrontForm` 経由のため成功し、2件目の直書き `page_id=7` のみが失敗する。

## これは回帰ではない（証跡）

- logic-evaluator が v0.3.0 機能①の全変更を `git stash` で退避した**素のコード（機能①適用前）**でも、同一箇所で同一の 90 秒タイムアウトを再現＝**ベースラインにも存在するプリエグジスティングな失敗**。
- 作業ツリーは stash/pop 後に md5 一致で原状復帰を確認済み。
- したがって回帰ゲート（ベースライン差分・新規失敗ゼロ）上は**既知 flaky として除外**して良い。

## 修正方針（提案・別途対応）

- `phase6-visibility.spec.js:279` の `'/?page_id=7'` を **`FRONT_PAGE_PATH`（= `/?page_id=5`）へ置換**する。あるいは `gotoFrontForm( page )` ヘルパー呼び出しに統一する（nonce localize 待ちまで内包しているため堅牢）。
- 併せて、テスト内で固定ページ ID を直書きしている箇所が他に無いかを grep で確認する（`page_id=` の直書き排除）。
- **注意**: 本タスク（機能①③④）では修正しない。テスト負債として別途クローズする。

## 影響範囲

- 本番プラグインの挙動・配布物には一切影響しない（E2E テストの設置ページ参照ミス）。
- ゲート運用上は、状態引き継ぎ（`docs/handoff/state.md`）に「既知 flaky」として記録済み。回帰判定時はこの1件をベースライン既知失敗として扱う。
