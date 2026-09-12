# 未対応: bug-a-plain-regate が Plain パーマリンクを前提にするのに、自分で設定しない

最終更新: 2026-09-12
起票元: 絞り込み回帰ゲートの盲点調査（`docs/investigation/narrowed-regression-gate-blind-spots-20260912.md`）。
重大度: 🔵 低（**テストの前提条件の不備。出荷コードの不具合ではない**）。
ただし **BUG-A（Plain パーマリンクで REST が 404 になる件）の再発ゲートが実質機能していない**。
トラック: **未着手。記録のみ。**

## 事象

`tests/e2e/bug-a-plain-regate.spec.js` の 2 テストが赤。**単独実行でも再現**（2026-09-12 実測）。

```
Error: restUrl は Plain（rest_route=）形式であること
Expected substring: "rest_route="
Received string:    "http://localhost:8888/wp-json/smart-booking/v1/"
  tests/e2e/bug-a-plain-regate.spec.js:45  （(b) front）
  tests/e2e/bug-a-plain-regate.spec.js:95  （(a) admin）
```

## 原因（確定）

**この spec は Plain パーマリンクを前提に assert するが、自分では設定しない。**

- 実測: `wp option get permalink_structure` → `/%year%/%monthnum%/%day%/%postname%/`（＝ pretty）。
- 相方の `tests/e2e/bug-a-plain-repro.spec.js:27` は
  `test.describe.skip( 'BUG-A: Plain permalink REST 404 (double-?) [Red-only, ...]' )` で
  **丸ごと無効化**されている。
- `tests/e2e/` 全体で `permalink_structure` を設定するコードは無い（grep 実測）。

＝ **前提が一度も成立しないので、この再発ゲートは「常に赤」か「意味のない緑」にしかならない。**
v0.5.3〜v0.5.6 の絞り込み対象に一度も入っていないため（state.md に名前が 1 度も出ない 15 本の 1 つ）、
赤のまま放置されていた。

> BUG-A 自体（`api.js` の REST URL 組み立て）は修正済みで、
> 「REST URL はパーマリンク非依存」は CLAUDE.md のコーディング規約にも入っている。
> **壊れているのはゲートであって実装ではない。**

## 修正方針（案・未決）

1. **案A（推奨）: spec 自身が前提を作って戻す。**
   `beforeAll` で `wp option update permalink_structure ''` ＋ `wp rewrite flush`、
   `afterAll` で元の値へ復元（変更前の値を退避する）。
   - ⚠️ **パーマリンクは wp-env のグローバル状態**。復元に失敗すると後続の spec が
     Plain のまま走る。`try/finally` で確実に戻すこと。
   - ⚠️ フルスイートは単一ワーカー直列なので、途中で落ちた場合の影響が全 spec に及ぶ。
2. 案B: 撮影シードと同じ「宣言して purge で戻す」方式を、テスト用のヘルパーとして用意する。
3. 案C: `test.skip` にして「BUG-A の再発ゲートは存在しない」と明記する。
   **非推奨**（規約に載っている要件のゲートを失う）。

## 検証（修正時）

- 2 テストが Green になること。
- **後続 spec への波及が無いこと**を確認する: 修正後にフルスイート（少なくとも desktop 全 54 spec）を
  流し、`permalink_structure` が実行後も元の値であることを実測する。
