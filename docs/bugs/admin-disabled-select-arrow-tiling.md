# セレクトボックスの矢印が壊れる（無効時＝タイル状に敷き詰め / エラー時＝消える）

起票: 2026-09-11（ヘルプ画像の撮影中に発見）／重大度: 🟡 軽微（表示のみ・データ影響なし）
状態: **✅ 修正実装済み（v0.5.6 / 2026-09-11）。SVN commit は人間 GO 待ち。**

> 起票時の表題は「無効化されたセレクト…」だったが、**同じ原因の2つ目の症状**
> （エラー状態のセレクトで矢印が消える）を v0.5.6 の全件確認で検出したため改題した。

## 症状

管理画面で `disabled` になったセレクトボックスの背景に、WordPress コアのドロップダウン矢印
（SVG）が **2 行 × 十数個タイル状に繰り返し描画される**。正しくは右端に 1 個だけ出る。

実物: `docs/website-screenshots/conditional-fields/06-parent-type-locked.png`
（v0.5.4 で追加した「親フィールドは種別を変更できない」状態のカット。`フィールドタイプ` の
セレクトが disabled になっている）。

再現する箇所（いずれも `Select` コンポーネントの `disabled`）:

- フィールド編集モーダルの `フィールドタイプ`
  - 保護フィールド（お名前 / メールアドレス / 電話番号）を編集したとき（`isProtected`）
  - 他フィールドの表示条件の親になっているフィールドを編集したとき（`isAlreadyParent`・v0.5.4）
- `表示する値`（`condition_field_key` 未選択のとき）

### 症状2: エラー状態のセレクトで矢印が**消える**（2026-09-11 追記・同一原因）

`.smb-field.has-error`（`Select` に `error` を渡したとき）のセレクトでは、逆に
**ドロップダウン矢印が描画されない**。`background-image` が `none` になるため。
到達経路の例: フィールド編集モーダルで表示条件を ON にしたまま `表示する値` を選ばずに保存
（`表示条件の値を選択してください。`）。

## 再現条件

1. wp-env（WordPress 7.1）でフォーム設定を開く。
2. 表示条件の親になっているフィールド（例: 資料送付）の `編集` を押す。
3. `フィールドタイプ` のセレクトが disabled で表示される。

## 根本原因（実測で確認）

`getComputedStyle()` の実測値（disabled なセレクト）:

```
background-image  : url("data:image/svg+xml;…")   ← WordPress コアの矢印
background-repeat : repeat                        ← 本来は no-repeat
background-position: 0% 0%                        ← 本来は right 8px top 55%
```

カスケードの内訳:

| 由来 | セレクタ | 特異度 | 効いている longhand |
|---|---|---|---|
| WP コア `forms.css` | `.wp-core-ui select` | (0,1,1) | `background` ショートハンド（矢印 ＋ `no-repeat` ＋ `right 8px top 55%`） |
| WP コア `forms.css` | `.wp-core-ui select.disabled, .wp-core-ui select:disabled` | (0,2,1) | **`background-image` のみ**（グレーの矢印）。repeat / position は上の行に依存 |
| 本プラグイン `src/admin/admin.scss` | `.smb-input, .smb-textarea, .smb-select` の `&:disabled` | (0,2,0) | `background: var(--smb-color-bg);` ＝ **ショートハンドで repeat / position を initial に戻す** |
| 本プラグイン `src/admin/admin.scss` | `.smb-field.has-error { .smb-select }` | (0,3,0) | `background: var(--smb-color-danger-bg);` ＝ **コアより特異度が高く、image ごと消す**（症状2） |

`background-image` は WP の disabled ルール (0,2,1) が勝ち、`background-repeat` /
`background-position` は本プラグインの `:disabled` (0,2,0) が WP の `.wp-core-ui select` (0,1,1)
より特異度で勝つため initial（= `repeat` / `0% 0%`）になる。結果として
**「WP の矢印画像」×「本プラグインの repeat 指定」** が組み合わさり、タイル表示になる。

有効（enabled）なセレクトでは、`.smb-select`（0,1,0）が `.wp-core-ui select`（0,1,1）に
特異度で負けるため WP 側の指定がそのまま効き、矢印は正しく右端に 1 個だけ出る。
**通常状態だけが無事**なのはこのため。

症状2（`.has-error`）は特異度 (0,3,0) でコアの通常ルール (0,1,1) にも disabled ルール (0,2,1) にも
勝つため、`background-image` 自体が `none` になり矢印が消える。

### 実測値（修正前・`getComputedStyle`）

| 対象 | `background-image` | `background-repeat` | `background-position` |
|---|---|---|---|
| 通常のセレクト | WP の矢印 SVG | `no-repeat` | `calc(100% - 8px) 55%` |
| `select:disabled` | WP の矢印 SVG | **`repeat`** | **`0% 0%`** |
| `.has-error` のセレクト | **`none`** | `repeat` | `0% 0%` |

## 修正内容（v0.5.6 で実施）

`src/admin/admin.scss` の該当箇所で `background` ショートハンドをやめ、色だけを指定する。

```scss
.smb-input,
.smb-textarea,
.smb-select {
	background-color: var(--smb-color-bg-elev);   // ← background: から変更
	…
	&:disabled {
		background-color: var(--smb-color-bg);     // ← background: から変更
		…
	}
}
```

実際に変更したのは **`src/admin/admin.scss` の3行**（いずれも `background:` → `background-color:`）:

1. `.smb-field.has-error` 内の `.smb-input, .smb-textarea, .smb-select`（症状2）
2. `.smb-input, .smb-textarea, .smb-select` の基底ルール（潜在的な同型の事故を防ぐ）
3. 同ブロックの `&:disabled`（症状1）

併せて、当該ブロックに**理由つきのコメント**を置き、ここでショートハンドを使わない約束を明文化した。

- ショートハンドをやめれば `background-repeat` / `background-position` を initial へ戻さなくなり、
  WP コアの `no-repeat` / `right 8px top 55%` がそのまま効く。
- `background-color` だけの指定なので、入力欄・テキストエリアの見た目は変わらない
  （計算後の `backgroundColor` は同値）。
- **CSS のみの変更だが `build/admin.css` に入るためリリースを伴う**（不可逆リリースは人間 GO）。
- 他に同じショートハンドで背景画像を潰している箇所が無いことは、**静的な grep 全件**
  （admin 172件 / frontend 89件）と**ブラウザでの計算値スイープ**の両方で確認した。
  結果は `docs/plans/v0.5.6-release-plan.md` §2 の表が正本。

## 影響範囲

- 表示のみ。データ・REST・メールには影響しない。
- WordPress.org 審査に関わる項目でもない。
- ただし**ヘルプ画像に写る**ため、サイトのマニュアルに「壊れて見えるコントロール」が載る。
  `conditional-fields/06-parent-type-locked.png` を差し替える場合は、この修正を入れてから
  撮り直すのが望ましい。

## 検証方法（修正後）

1. `npm run build` 後、フォーム設定 → 表示条件の親フィールドの `編集`。
2. `フィールドタイプ` のセレクトで矢印が右端に 1 個だけであること。
3. `getComputedStyle` で `background-repeat: no-repeat` / `background-position: right 8px top 55%`
   になること（実測）。
4. 有効なセレクト（フォーム選択・ステータス変更など）の見た目が変わっていないこと。
