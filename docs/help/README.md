# ⚠️ `docs/help/` を触る前に必ず読むこと

このディレクトリは **ヘルプマニュアルの正本ではない**。正本は公式サイト側リポジトリ
（`~/dev/smart-booking-website/`、別リポジトリ）にある。

判断の正本: **`docs/decisions/0002-screenshot-spec-separation.md` 第7節**

---

## 1. ここの markdown は複製であり、正本ではない

`docs/help/markdown/` の各ファイルは、サイト側 `content/help/markdown/` の**複製**である。
**サイト側が新しい**（プラグイン側は 2026-05-22 以降更新が止まり、サイト側は 2026-09-09 まで
更新が続いている。14本中7本が乖離）。

マニュアルの内容を直したい場合は、**サイト側 `content/help/markdown/` を編集すること。**
ここを直してもサイトには反映されないし、サイトを直してもここには反映されない。

## 2. `docs/help/images/` は意図的に削除されている（欠落ではない）

**画像の正本はサイト側 `content/help/images/` である。** プラグイン側の27枚は
2026-09-10 に `git rm` した。「画像が無い」のは**欠けているのではなく、そう決めたから**である。

### ⛔ 撮影結果をここに置かないこと

`docs/help/images/` を復活させると、回帰ゲートが壊れる。かつてここは git 追跡下のバイナリで、
**回帰スイート（`npx playwright test`）が実行のたびに一部を上書きしていた**。テストを走らせる
行為が作業ツリーを変更するため、`docs/decisions/0001-regression-gate-baseline-diff.md` が定める
**`git stash` ベースのベースライン差分比較が不安定化する**。

これは理屈上の懸念ではなく、実際に起きていた。削除直前の調査で、プラグイン側の
`installation/01-plugin-list.png` と `02-sidebar-menu.png` の2枚だけがサイト側と md5 相違して
おり、目視すると**回帰スイートの wp-env（WordPress 7.0）で撮り直された絵に置き換わっていた**
（サイト側の original は WordPress 6.9.4）。詳細は決定 0002 第2節 実害② と第7節 7.2。

### 正しい撮影フロー

| | 場所 |
|---|---|
| 撮影コマンド | `npm run screenshots` |
| 撮影の出力先 | **`docs/website-screenshots/<slug>/`**（`.gitignore` 済み・コミットしない） |
| 画像の正本 | **サイト側 `content/help/images/<slug>/`** |
| 受け渡し手順 | **`docs/website-screenshots/README.md`** |

なお `tests/screenshots/legacy/help-screenshots.spec.js` は、出自の記録として無編集で保存して
いる先代 spec であり、**その出力先は今も `docs/help/images/` のまま**である。実行対象外
（`playwright.screenshots.config.js` の `testIgnore: '**/legacy/**'`）なので現状は無害だが、
**セレクタと待ち方だけを参考にし、出力先パスは絶対に引き継がないこと。**

## 3. `gtm.md` だけは消さないこと

`docs/help/markdown/gtm.md` は、dataLayer イベント仕様の**同期先として出荷コードとテストから
名指しで参照されている**。

- `src/frontend/utils/analytics.js:8`
- `tests/e2e/gtm-datalayer.spec.ts:5`

`docs/help/markdown/` をまとめて消すと、この2箇所の参照が切れる。**`gtm.md` は残すこと。**
（コードから参照されている markdown は `gtm.md` の1本のみ。他13本には参照が無い。）

## 4. 13本（`gtm.md` 以外）の扱いは未決

サイト側との乖離をどう解消するか（削除するか／`gtm.md` を `docs/` 直下へ移して `docs/help/` を
廃止するか／現状維持か）は**人間の判断待ち**である。選択肢と各案のトレードオフは
**決定 0002 第7節 7.5** に整理してある。**エージェントの裁量で実施しないこと。**
