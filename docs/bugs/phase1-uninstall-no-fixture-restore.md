# 別件（テスト負債）: 破壊的スイート `phase1-uninstall.spec.js` が実行後に E2E 基線フィクスチャ（store/staff id=2）を復旧しない

最終更新: 2026-09-10
起票元: 2026-09-10 の回帰ゲート判定中に logic-evaluator が検出。破壊的スイート実行前後の DB 実測（PRE / POST / FINAL）を取った際に、テーブルとデフォルトデータは戻るが「2店舗 × 2担当者」フィクスチャが戻らないことが判明したため独立起票。
重大度: 🟡 中（**テストハーネスのみ**。配布プラグインの挙動・ユーザー影響はゼロだが、**後続 spec に「誤った赤」を発生させうる**ため放置は望ましくない）。
トラック: 出荷コードとは**完全に独立**。本起票では**テストも出荷コードも1バイトも変更しない（記録のみ）**。

## 事象

`tests/e2e/phase1-uninstall.spec.js`（破壊的スイート。通常の `npx playwright test` では `testIgnore` により除外され、`playwright.uninstall.config.js` 経由でのみ実行される）は、**実行後に E2E の基線フィクスチャを自己復旧しない。**

U-3（`tests/e2e/phase1-uninstall.spec.js:50`）は `wp plugin deactivate` → `wp plugin activate` で復旧を行うが、これで戻るのは次の2つだけである。

1. **テーブル構造**（7テーブル）
2. **`Smart_Booking_Activator` が seed するデフォルトデータ** — **store 1件・staff 1件のみ**（ともに `id=1`「デフォルト」）＋ オプション32件 ＋ 既定フォーム1件

一方、**多くの既存 spec が前提とする「2店舗 × 2担当者」フィクスチャ（`stores.id=2`「店舗1」／ `staff.id=2`「担当者1」）は復旧しない。** `Activator` はシステムエンティティ（`id=1`）しか作らないため、これは Activator の欠陥ではなく、**テストフィクスチャの復旧責務が誰にも割り当てられていない**という構造の問題である。

## 再現条件（重要）

**破壊的 spec を実行した直後に、`restoreSnapshot()` を `beforeEach` に持たない spec（自前シード系）を実行すると、`store id=2` / `staff id=2` の不在により誤った赤が出うる。**

- 該当しうる spec の例: `tests/e2e/phase1.spec.js`、`tests/e2e/bug124-scope-isolation.spec.js` など。
  - ⚠️ **これはあくまで「例」であり、`restoreSnapshot()` を持たない spec の全数調査は実施していない。** 実際にどの spec がどの程度影響を受けるかは未確認であり、断定しない。
- 逆に `phase2-*` / `phase3-*` 系は `beforeEach` で `tests/e2e/phase2-helpers.js:123` の `restoreSnapshot()` を呼ぶため**自動復旧する**。

`restoreSnapshot()` は次の決定論的な再構築を行うため、呼ばれさえすれば基線は必ず戻る。

1. `id > 1` の store / staff を削除（予約・スケジュール・reservation_meta も全消し）
2. `id=1`「デフォルト」を `UPDATE`（`is_system=1` / `is_active=1` に正規化）
3. `AUTO_INCREMENT=2` に固定した上で、`id=2`「店舗1」「担当者1」を**固定 ID で INSERT**
4. 最後に `AUTO_INCREMENT=3` へ戻す

## 実測（2026-09-10 / logic-evaluator）

| 項目 | 破壊前(PRE) | U-3 直後(POST) | 後続 spec 実行後(FINAL) |
|---|---|---|---|
| テーブル | 7 | 7 | 7 |
| stores | 2件（id1 デフォルト / id2 店舗1） | **1件（id1 のみ）** | 2件＝PRE と一致 |
| staff | 2件（id1 デフォルト / id2 担当者1） | **1件（id1 のみ）** | 2件＝PRE と一致 |
| `smart_booking_` オプション | 12件 | 32件（seed で純増・**損失ゼロ**） | 12件（内訳は別） |

**⚠️ 今回 FINAL が PRE に戻ったのは、評価者が後続で `phase2-settings.spec.js` / `phase3-flow.spec.js` を実行し `restoreSnapshot()` が走ったからにすぎない。＝ 復旧は設計ではなく偶然である。**

破壊的スイートを単独実行して**そのまま**別の spec を回した場合、DB は POST 列の状態（store / staff が `id=1` のみ）のままになる。

なお FINAL のオプション12件は件数として PRE と一致しているが、**内訳（キーの同一性）までは確認していない**。件数一致をもって「完全に同一状態へ戻った」と断定はしない。

## 構造的な位置づけ

これは `docs/decisions/0002-screenshot-spec-separation.md` 第5節（および同 §6.2 / §6.3）が撮影 spec について指摘した

> **曝露窓は DB reset を持たない spec のみ／被害限定は設計ではなく偶然**

という指摘と**まったく同じ構造の問題**である。撮影 spec 側は `tests/screenshots/legacy/` への退避で経路そのものが消滅したが、**破壊的スイート側には同じ構造が残っている**。

- 曝露窓 = `restoreSnapshot()` を持たない spec（＝ DB reset を持たない spec）
- 被害が限定されるのは「たまたま次に `phase2-*` を回したから」であって、ハーネスの設計として保証されていない

相互参照: `docs/decisions/0002-screenshot-spec-separation.md`（第5節 未解決 / §6.2 曝露窓 / §6.3「被害限定は設計ではなく偶然」）。

## なぜ放置が危険か

- **配布プラグインの挙動には影響しない**ため緊急性は低い。しかし「誤った赤」は**既存赤の仕分けコストを増やし、本物の回帰を見逃す方向に効く**。
- これは `docs/bugs/phase1-schema-expected-tables-stale.md` が「**赤の放置で検知網が機能を失う**」と指摘したのと同じ危険である。
- 加えて、`docs/decisions/0002-screenshot-spec-separation.md` 第5節 (2) のとおり**既存赤29件の仕分けが既に毎回のベースライン比較コスト**になっている。ここへ「実行順序に依存する非決定的な赤」が混ざると、ベースライン差分（決定 0001）の判定精度そのものが落ちる。

## 修正方針の候補（**本起票では実施しない**）

1. **`test.afterAll` による自己復旧**（logic-evaluator の提案）
   - `tests/e2e/phase1-uninstall.spec.js` に `test.afterAll` を追加し、`tests/e2e/phase2-helpers.js` の `restoreSnapshot()` を呼んで基線を戻す。
   - 破壊的スイート自身が後始末する形になるため、実行順序に依存しない。
2. **運用手順として明文化**
   - 「破壊的 spec の実行後は必ず `phase2-*` を1本回して基線を戻す」を手順書に明記する。
   - コード変更は不要だが、人間の手順遵守に依存する（忘れれば同じ問題が再発する）。

**どちらを採るかは人間判断。planner / generator の裁量で実施しない。** 本起票では `test.afterAll` の実装を含め、テストコード・出荷コードを一切変更していない（YAGNI）。

## 影響範囲

- **配布プラグインの挙動には影響しない**（テストハーネス内に閉じる問題）。**ユーザー影響ゼロ。**
- 影響は **E2E の判定信頼性のみ**。ただし上記「なぜ放置が危険か」のとおり、本物の回帰の見逃しにつながる方向の負債である。
- 破壊的スイートは通常の `npx playwright test` では実行されない（`playwright.uninstall.config.js` 経由のみ）ため、**常時発火する問題ではない**。発火するのは「破壊的スイートを回した直後のセッション」に限られる。

## 検証（修正する場合の完了条件・参考として記載）

破壊的 spec を**単独実行した直後**に、

- `tests/e2e/phase1.spec.js`
- 自前シード系 spec（例: `tests/e2e/bug124-scope-isolation.spec.js`）

を回し、**`store id=2` / `staff id=2` の不在に起因する赤が出ないこと。**

加えて、修正案1を採る場合は `restoreSnapshot()` 呼び出しが破壊的スイートの他のアサーション（U-1 の「事前状態で7テーブル」など）を壊さないことを確認する。
