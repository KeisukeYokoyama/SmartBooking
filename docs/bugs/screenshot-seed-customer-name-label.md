# ✅ 解決: 撮影シードが回帰フィクスチャのラベル（お名前）を拾い、公開画像が実装と食い違っていた

最終更新: 2026-09-12（**解決・撮り直し済み／サイト側へのコピーは未実施**）
起票元: 公開中のヘルプ画像が「お名前」表示で、実際の新規インストール（`氏名`）と食い違うとの指摘（2026-09-12）。
重大度: 🟡 中（プラグインの動作には無影響。**公開済みマニュアル画像が実装と異なる**＝利用者の混乱要因）。
出荷コードの変更: **なし**（`tests/` と `docs/` のみ）。

## 事象

公開中のヘルプ画像が、氏名フィールドのラベルを **`お名前`** と表示していた。
実際の新規インストールでは **`氏名`**。さらに画像セット内部でも不統一で、
`conditional-fields/02` だけ `氏名`、`01` / `05` / `06` は `お名前` だった。

## 根本原因

**撮影環境（wp-env）の DB を回帰スイートと共有しているのに、撮影シードが初期3項目をそろえ直していなかった。**

| | 値 |
|---|---|
| 出荷コード `includes/class-activator.php::seed_initial_fields_for_form()` | `field_label = '氏名'` / `placeholder = '山田 太郎'` |
| 回帰フィクスチャ `tests/e2e/phase2-helpers.js:138` / `:167` の `restoreSnapshot()` | `UPDATE ... SET field_label='お名前' ... WHERE field_key='customer_name'`（`placeholder` は戻さない） |
| 撮影シード（修正前） | 既定フォームの初期3項目は**触らない**方針だった |

既定フォームの初期3項目は activator が作る行で、撮影シードのレジストリには載らない
（＝シードが作った行ではないので purge の対象外）。そこへ回帰フィクスチャが `お名前` を書き込むと、
**撮影シードはそれを上書きしないため、そのままマニュアル画像に写る**。

`conditional-fields/02` だけ `氏名` だったのは、このカットがデモフォーム
（`無料体験のお申し込み`＝シードが `field_defs()` で作る行）を使っているため。
デモフォーム側の定義は最初から `氏名` だった。＝ **画像セット内部の不統一も同じ原因の裏返し。**

### 撮影環境の実測値と実装の差（全件確認の結果）

`customer_name` のラベル以外にも 2 件ずれていた（どちらも今回の調査で新たに検出）。

| 列 | 撮影環境の値 | 出荷コードの初期値 | 画像への影響 |
|---|---|---|---|
| `customer_name.field_label` | `お名前` | **`氏名`** | あり（本件） |
| `customer_name.placeholder` | **空** | **`山田 太郎`** | あり（フロントの入力欄に薄字が出ない） |
| `customer_name.field_options` | `[]`（文字列） | **空文字** | 表示上は無害（text 型では読まれない） |
| `customer_name/email/phone.sort_order` | 10 / 20 / 30 | **0 / 1 / 2** | 無し（相対順序が同じ） |

店舗名・担当者名・フォーム名は実装の初期値（`デフォルト` / `標準フォーム`）と一致しており、ずれは無かった。

## 修正（2026-09-12）

**`tests/screenshots/seed/class-smart-booking-screenshot-seeder.php` に
`normalize_protected_fields()` を追加**し、シード時に既定フォームの初期3項目を
**出荷コードの初期値へそろえ直す**ようにした。

要点は **値をシード側へ複製しないこと**。複製すると出荷コードが変わったときに黙って
食い違う——それが本件そのもの。そこで

1. `Smart_Booking_Activator::seed_initial_fields_for_form()` を**実在しないフォーム id**
   （`PROBE_FORM_ID = 999999999`）に対して 1 度だけ実行し、
2. 生成された 3 行を読み、**読んだら必ず削除する**（実行前に前回の残骸も掃除）、
3. 読み取った値を既定フォームの同 `field_key` の行へ UPDATE する、

という「実コードから読む」方式にした。`forms` テーブルには一切触らないため、
管理画面に出るショートコードの `form_id` は動かない。

- 変更前の値は**初回だけ**レジストリ option の `protected_fields` 区画へ退避し、**purge で 1 列ずつ元へ戻す**
  （実測: purge 後に `お名前` / placeholder 空 / sort_order 10,20,30 へ完全復帰）。
- 2 回目以降のシードは `変更なし（すでに出荷コードの初期値と一致）` と出る（冪等・実測）。
- デモフォーム側（`field_defs()`）の保護フィールドは自動では書き換えず、出荷コードの初期値と
  食い違ったら**サマリに警告を出す**（`protected_field_drift()`）。今回は警告ゼロ＝一致を実測確認。
- レジストリ構造バージョンを 2 → 3 へ。

## 影響カットの特定（機械判定）

`tests/screenshots/helpers.js` の `shot()` に **テキストダンプ**を追加した。
撮影と同時に `screenshot-text/<slug>/<name>.txt` へ、そのページの `innerText` と
フォームコントロールの `placeholder` / `value` / 選択中 option を書き出す。
以後は `grep -rl 'お名前' screenshot-text/` で影響カットが機械的に出る。

判定は **修正前の DB 状態で 1 回・修正後で 1 回撮り、ダンプを 1 対 1 で diff** して行った。

### 差分が出たカット = 9 枚

| カット | 差分 |
|---|---|
| `address-field/01-address-field-modal.png` | お名前 → 氏名 |
| `address-field/02-address-front.png` | お名前 → 氏名 ＋ placeholder `山田 太郎` が付く |
| `conditional-fields/01-condition-section.png` | お名前 → 氏名 |
| `conditional-fields/03-front-hidden.png` | お名前 → 氏名 ＋ placeholder |
| `conditional-fields/04-front-shown.png` | お名前 → 氏名 ＋ placeholder |
| `conditional-fields/05-parent-delete-blocked.png` | お名前 → 氏名 |
| `conditional-fields/06-parent-type-locked.png` | お名前 → 氏名 |
| `custom-fields/01-field-types.png` | お名前 → 氏名 |
| `custom-fields/02-field-list.png` | お名前 → 氏名 |

### そのうち「画像に実際に写っていた」= 6 枚（目視で確認）

`address-field/01` / `conditional-fields/01` / `05` / `06` / `custom-fields/01` / `02`。

残り 3 枚（`address-field/02` / `conditional-fields/03` / `04`）は**フロント側のカットで、
氏名の入力欄がビューポートの外**にあり画像には写っていなかった（`fullPage: false` のため）。
＝ **ダンプは「DOM に出ていた文字」であって「画像に写っている文字」ではない。**
機械判定で候補を絞り、最後は目視で確認すること。

> 指摘にあった「`conditional-fields` の 02 は氏名、01・05・06 はお名前」と完全に一致した
> （02 はデモフォームを使うカットなので元から `氏名`）。

## 撮り直し（2026-09-12・実施済み）

**全 29 枚を 1 セッションで撮り直した**（差分の出た 9 枚だけでなく全部にしたのは、
予約 id・相対日付・バージョンバッジを世代でそろえるため。過去の運用と同じ）。
`stores/01-store-list.png` / `stores/02-store-add-modal.png` も含む（サイト側が旧画像のため）。
撮影後は purge 済み（＝回帰スイートの前提へ完全復帰・実測確認）。

## 残課題（別起票）

1. **`docs/bugs/form-preview-label-mismatch.md`** — 設定 → デザインタブの
   フォームプレビューが**出荷コードで `お名前` をハードコード**している
   （`src/admin/pages/formsettings/FormPreview.jsx:58`）。`design/01` `design/02` の 2 枚には
   今も `お名前` が写る。**出荷コードのため本トラックでは直していない。**
2. **`docs/bugs/screenshot-env-shares-regression-fixtures.md`** — 回帰フィクスチャ
   `店舗1` / `担当者1` が店舗一覧のカットに写る件。
