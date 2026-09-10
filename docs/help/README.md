# ⚠️ `docs/help/` を触る前に必ず読むこと

このディレクトリは **ヘルプマニュアルの正本ではない**。正本は公式サイト側リポジトリ
（`~/dev/smart-booking-website/`、別リポジトリ）にある。

判断の正本: **`docs/decisions/0002-screenshot-spec-separation.md` 第7節**

---

## 1. markdown の正本もサイト側。ここには `gtm.md` しか無い（欠落ではない）

**マニュアル原稿の正本はサイト側 `content/help/markdown/` である。** プラグイン側にあった
複製13本は 2026-09-10 に `git rm` した。かつてはサイト側が新しい stale な複製が並んでいた
（プラグイン側は 2026-05-22 以降更新が止まり、サイト側は 2026-09-09 まで更新継続。14本中7本が乖離）。

マニュアルの内容を直したい場合は、**サイト側 `content/help/markdown/` を編集すること。**

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
（コードから参照されている markdown は `gtm.md` の1本のみ。参照の無い他13本は §4 のとおり削除済み。）

## 4. ⛔ 削除した13本を復活させないこと

2026-09-10 に人間の判断で **案(a)（`gtm.md` 以外の13本を削除）** を採用した。決定 0002 第7節 7.5 に
整理した3案のうち、案(b)（`gtm.md` を `docs/` 直下へ移して `docs/help/` を廃止）を採らなかった
理由は、**出荷ファイル `src/frontend/utils/analytics.js` に差分が出る**ためである。

`analytics.js:8` の参照は docblock の1行コメントにすぎず、その直後にイベント名と `booking_step`
の対応表7行を**コード自身が保持している**。`gtm.md` を読み込む構造ではないので、移動しても挙動は
変わらない。それでも公開済みプラグインの再配布差分に、ディレクトリ命名の一貫性という審美的な
理由で出荷コードを載せる取引は割に合わない。**案(a) なら出荷コードは1バイトも動かない。**

したがってこのディレクトリは「`gtm.md` 1本だけが入った `help/markdown/`」という、名前と実態が
やや乖離した形で残る。**これは妥協ではなく意図した結果である。**ディレクトリを整理したくなっても、
`gtm.md` の移動は出荷コードの変更を伴うため**人間の承認が要る**。エージェントの裁量で実施しないこと。
