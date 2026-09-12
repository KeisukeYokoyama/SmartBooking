# 未対応: Phase 9 リデザインに追従していないフロント spec が 5 本、赤のまま残っている

最終更新: 2026-09-12
起票元: 絞り込み回帰ゲートの盲点調査（`docs/investigation/narrowed-regression-gate-blind-spots-20260912.md`）で
フルスイートを流したところ検出。
重大度: 🔵 低（**テストの陳腐化。出荷コードの不具合ではない**）。ただし**5 本の spec が丸ごと信用できない状態**。
トラック: **未着手。記録のみ。**

## 事象

次の 5 テストが赤。**単独実行でも再現**（2026-09-12 実測。33 passed / 9 failed / 29 did-not-run）。

| spec:line | 期待しているもの | 実装の現在値 |
|---|---|---|
| `tests/e2e/phase3-fix1.spec.js:45` | 見出し `お客様情報の入力`（独立ステップ） | **存在しない**（Phase 9 で 1 画面に統合） |
| `tests/e2e/phase3-responsive.spec.js:967` | `.smb-front-form__actions` | `FormInput.jsx:504` にあるが `hideSubmit` で描画されない。実体は `.smb-front-main-page__actions`（`MainInputPage.jsx:203`） |
| `tests/e2e/phase3-validation.spec.js:178` | ボタン `確認画面へ進む` | **`予約内容の確認`**（`MainInputPage.jsx:209`） |
| `tests/e2e/phase5-ux.spec.js:179` | 見出し `日付を選択` | 埋め込み時は `<h3>日付選択</h3>`（`DateSelect.jsx:176`） |
| `tests/e2e/phase7-system-entity.spec.js:231` | 見出し `日付を選択` | 同上 |

`日付を選択` は `DateSelect.jsx:185` の `StepHeader`（**独立ステップ時のみ**）でしか出ない。
統合画面では `日付選択`（「を」が無い）。

## 原因（確定）

**Phase 9 のリデザインで「走っていた spec」だけが更新され、走っていない spec は取り残された。**

フロント予約フォームは Phase 9 で「store → staff → date → time → form」の別ステップ構成から
**1 画面統合（`MainInputPage`）** へ変わった。共有ヘルパー `tests/e2e/phase3-helpers.js:376-382` には

```js
// 旧版の FormInput 内ボタン「確認画面へ進む」も後方互換として一応探索する。
```

というフォールバックが入っており、**ヘルパー経由の spec（`phase3-flow` 等）は生き延びた**。
落ちているのは**ヘルパーを使わず直接ロケータを書いている spec** だけ。

さらにこの 5 本は **v0.5.3〜v0.5.6 の絞り込み回帰ゲートに一度も入っていない**
（`phase3-fix1` / `phase3-responsive` / `phase3-validation` は state.md に名前はあるがゲート対象ではなく、
`phase5-ux` / `phase7-system-entity` は §2 の「名前が一度も出ない 15 本」に含まれる）。
＝ **誰も走らせないので陳腐化に気づけなかった。**

> 同じ型の問題を今日 1 件クローズしている: `docs/bugs/phase9-form-width-mobile-285px.md`
> （実装されたことのない仕様をテストが固定していた）。

## 修正方針（案・未決）

**出荷コードは変更不要**（実装が正）。テストのみの変更で閉じられる見込み。

1. **案A（推奨）: 5 本のロケータを現行 UI に合わせる。**
   - ボタン: `確認画面へ進む` → `予約内容の確認`。ただし**直書きをやめて
     `phase3-helpers.js` の共有ヘルパー（後方互換フォールバック付き）を使う**方が再発しにくい。
   - 見出し: `日付を選択` → `日付選択`（または `getByRole('heading')` をやめて
     `.smb-front-section-title` で引く）。
   - `.smb-front-form__actions` → `.smb-front-main-page__actions`。
   - `お客様情報の入力` を期待する assert は、統合画面の実構造に置き換える。
2. 案B: 5 本を `test.skip` にする。**非推奨**（赤の原因を判定せずに隠すだけ）。

## 検証（修正時）

- 対象 5 spec を **desktop / mobile 両プロジェクト**で Green にする。
- 同 spec 内の他テストの状態が変わらないこと（`file:project:title` で突き合わせ）。
- **did-not-run を必ず数えること。** 単独実行でも serial describe の巻き添えで
  29 テストが did-not-run になっていた（赤が消えると実行されるテストが増える）。
