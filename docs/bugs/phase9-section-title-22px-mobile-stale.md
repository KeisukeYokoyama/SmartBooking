# 別件（未対応）: phase9「セクションタイトル 22px」テストが mobile で失敗（実測 20px）

最終更新: 2026-09-12
起票元: `docs/bugs/phase9-form-width-mobile-285px.md` の全件確認（「アーカイブ文書由来の誤記が他のテスト・コメントに流れ込んでいないか」）で検出。
重大度: 🔵 低（テストの期待式の問題。出荷コードの不具合ではない）。
トラック: **未着手。今回は記録のみ（テストも CSS も変更しない）。**

## 事象

`tests/e2e/phase9-redesign-style.spec.js:327`
**「セクションタイトル (.smb-front-section-title) の font-size は 22px」** が
**[mobile] プロジェクト（viewport 375px）で失敗**する。desktop（1280px）では成功。

```
expect( fontSize ).toBe( '22px' );   // :336
```

2026-09-12 に実測して再現を確認した（`--project=mobile -g 'font-size は 22px'`）。
v0.5.6 の回帰ゲートでもベースライン既存赤 4 件のうちの 1 件として記録済み
（`docs/handoff/state.md`）。**プリエグジスティングな失敗**。

## 原因（確定）

**テストが viewport を見ずに desktop の値を固定している。実装は仕様どおり。**

| 位置 | 内容 |
|---|---|
| `src/frontend/styles/frontend.css:1402-1403` | `.smb-front-section-title { font-size: 22px }`（既定 = desktop） |
| `src/frontend/styles/frontend.css:2784-2786` | `@media (max-width: 768px) { .smb-front-section-title { font-size: 20px } }` |
| `docs/legacy-ui-handover/spec-amendment-frontend-redesign.md`「変更5: レスポンシブ / タブレット（≤768px）」 | **「セクションタイトル 20px」** |
| `tests/e2e/phase9-redesign-style.spec.js:336` | `expect( fontSize ).toBe( '22px' )`（**分岐なし**） |

＝ **375px で 20px になるのは仕様どおりの正しい挙動**。テストが「変更2/変更3 の desktop トークン値」
だけを見て「変更5 のレスポンシブ上書き」を勘定に入れていない。

> `phase9-form-width-mobile-285px.md` との関係: あちらは「**実装されたことのない数式**を
> テストが固定していた」誤記由来の問題。こちらは「**実装されている値**だが、テストが
> viewport 非依存に書かれている」問題。**原因は別だが、どちらも
> アーカイブ文書の数値をテストが viewport を見ずに固定した点が共通**。

## 修正方針（案・未決）

1. **案A: viewport で分岐する**（`viewport.width <= 768` なら `20px`、それ以外は `22px`）。
   同 spec の他 8 テスト（色 6 件 / border-radius 8px / input padding 16px）は ≤768 / ≤480 の
   上書きが無いため分岐不要。**v0.5.6 の回帰ゲート実測でも mobile の赤はこの 1 件だけ**
   （`docs/handoff/state.md`）。**本テストだけが対象**。
2. 案B: desktop プロジェクト限定にする（`test.skip( viewport.width <= 768 )`）。
   カバレッジが落ちるので非推奨。

**出荷コード（CSS）は変更不要**（実装が正）。テストのみの変更で閉じられる見込み。

## 検証（修正時）

- `npx playwright test tests/e2e/phase9-redesign-style.spec.js` が desktop / mobile 両方で Green。
- 同 spec の他 8 テストの状態が変わらないこと（全 9 テスト）（`file:project:title` で突き合わせ）。
