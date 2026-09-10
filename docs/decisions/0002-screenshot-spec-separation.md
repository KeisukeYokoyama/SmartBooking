# 決定 0002: 撮影用スクリーンショット spec を回帰スイート（`tests/e2e/`）から分離した理由

日付: 2026-09-09
ステータス: **決定・適用済み**（`git mv` 実行済み。出荷コードは無変更）
文脈: ヘルプ／公式サイト用のスクリーンショット撮影を自動化した `tests/e2e/help-screenshots.spec.js` が、既定の回帰スイート（`npx playwright test`）と同じ `testDir` に同居していた。撮影の都合（シードデータ依存・画像ファイルへの書き込み・実予約の投入）が回帰判定へ直接漏れ出しており、`docs/decisions/0001-regression-gate-baseline-diff.md` が定めた**ベースライン差分による回帰ゲート**の前提そのものを侵していた。

---

## 1. 決定

`tests/e2e/help-screenshots.spec.js` を **`tests/screenshots/legacy/help-screenshots.spec.js`** へ `git mv` した（**内容は無編集**。git 上も rename として認識されている）。

撮影は回帰スイートから切り離し、専用の実行系に分離する。

- 専用 config: `playwright.screenshots.config.js`
- 実行コマンド: `npm run screenshots`（= `playwright test --config=playwright.screenshots.config.js`）
- 撮影対象は `testDir: './tests/screenshots'` ＋ `testMatch: '*.spec.js'`、すなわち **`tests/screenshots/*.spec.js` のみ**。
- `legacy/` は**実行対象外**。`testMatch` の `'*.spec.js'` は basename マッチのためサブディレクトリにも一致してしまうので、`testIgnore: '**/legacy/**'` で明示的に除外している。

`legacy/` を削除せず残すのは、**動作実績のあるセレクタの参考資料**としての価値があるため。新しい撮影 spec（`tests/screenshots/help.spec.js`）を書くときに、実際に管理画面へ到達できたセレクタの実例が必要になる。実行はされないので回帰にもコスト的にも影響しない。

---

## 2. これは整理整頓ではなく、実害3件への対処である（最重要）

**この節が本記録の主目的である。** 「テストの置き場所を整理しただけ」に見えるため、将来のセッションが「同居に戻しても問題ない」と判断して逆流させる危険がある。以下は**すべて実測に基づく事実**であり、分離は美観ではなく機能上の必要から行われた。

### 実害①: 回帰スイートが構造的に絶対 Green にならなかった

撮影 spec は撮影用シードデータ（`渋谷店` など）に**ハード依存**している。一方、回帰の基線は正規化されたデータ（`stores: デフォルト, 店舗1` / `staff: デフォルト, 担当者1`）である。そのため `waitForSelector('text=渋谷店')` は**必ず 10 秒でタイムアウトする**。「たまたま落ちる」のではなく、正しい基線では**落ちることが確定していた**。

さらに撮影 spec は `test.describe.configure( { mode: 'serial' } )` を宣言しているため、先頭の失敗が後続を巻き込み、**後続8テスト × 2プロジェクト = 16件が "did not run"** に落ちていた。

実測（同一の正規化 DB 基線から開始）:

| | tests | failed | did not run |
|---|---|---|---|
| before（退避前） | 732 | 32 | 80 |
| after（退避後） | 712 | 30 | 59 |

**恒常的な赤2件と、無意味な did-not-run 16件が消滅した。** 退避前の回帰スイートは、プロダクトが完璧でも決して Green にならない構造だった。

### 実害②: 回帰スイートが git 追跡下のバイナリを毎回上書きしていた

`docs/help/images/**` は **git 追跡下の41ファイル**であり、撮影 spec の `shotPng()` はここへ直接書き込む。

ここが見落とされやすい点だが、**`installation` テストは最初の失敗（実害①）より前に走り、実際に pass する**。したがって `npx playwright test` を回すたびに、

- `docs/help/images/installation/01-plugin-list.png`
- `docs/help/images/installation/02-sidebar-menu.png`

が（desktop / mobile の2プロジェクト分、計2回）上書きされ、**作業ツリーが汚れていた**。

これは単なる不快事ではない。`.claude/agents/logic-evaluator.md` が回帰ゲートの正本手続きとして定める **`git stash` ベースのベースライン比較そのものを不安定化させる**。テストを走らせる行為が作業ツリーを変更するなら、「変更あり／変更なし」の比較対象が実行のたびにずれる。決定 0001 の手続き（⑤ `git stash pop` 後に md5 等で原状復帰を検証）が、テスト実行によって破られる状態にあった。

### 実害③: 条件付きで実予約が回帰スイートへ注入されていた

撮影 spec の `booking-form-frontend` は、フロント予約フォームから**実際に「予約を確定する」まで押す**。しかも `test.use({ viewport })` は viewport を上書きするだけで**プロジェクトを絞らない**ため desktop / mobile 双方で走り、**1スイートあたり最大2件の実予約＋`booked_count` 加算**が入りうる。

発火条件は「撮影用シードが DB に残っていること」。クリーンな基線では実害①の理由で早期に失敗して skip されるため発火しない（実測: before 実行で予約は1件も作られなかった）。

**しかし、その発火条件は撮影運用と必ず同時に成立する。** 撮影した直後に回帰を回せば、シードは残っており、実予約が注入される。「普段は出ないが、撮影した日だけ回帰結果が汚れる」という、**最も気づきにくい形の相互汚染**だった。

露出範囲も実測した。実行順序上、`help-screenshots` は残り49 spec のうち **43ファイルより上流**にある。ただし `phase2-*`（`tests/e2e/phase2-helpers.js` の `restoreSnapshot()`）と `phase3-*`（`tests/e2e/phase3-helpers.js`）は `beforeEach` で DB を全消しするため、実際の露出窓は **DB reset を持たない `phase1.spec.js` の1ファイルのみ**だった。結果的に被害は限定的だったが、それは設計ではなく偶然（他 spec がたまたま DB を消していたこと）に依存していた。

---

## 3. 回帰ゲートの判定結果（実測）

決定 0001 の手続きに従い、before / after を**全数比較**した（両実行とも同一の正規化 DB 基線から開始）。

- **after にだけ在る赤: 1件**
- **before にだけ在る赤: 3件**
- **共通の既存赤: 29件**

### after にだけ在る赤1件はプロダクト起因ではない

`phase8-ui-ux-fixes.spec.js:302`（mobile）の1件は、**インフラ由来のフレークと確定**した。根拠は次の3点。

1. 失敗の実本文が `Command failed: npx wp-env run cli ...` の `AggregateError [ETIMEDOUT]`（DNS は解決済み・TCP connect が undefined）であり、**アサーションに到達していない**。プロダクトの挙動を判定する前に落ちている。
2. **各ランに `Command failed: npx wp-env` はきっかり1件ずつしか無く、それが各ランの唯一の差分赤と完全に一致していた**（before: `phase3-calendar:639` / after: `phase8:302`）。つまり「差分赤」の正体は毎回1件出る wp-env タイムアウトが、その回どこに当たったかの違いでしかない。
3. 単体反復で再現しない。`phase8:302` が **5/5 pass**、`phase3-calendar:639` が **3/3 pass**。

### 出荷コードは無変更

`includes/**` / `src/**` / `smart-booking.php` / `uninstall.php` は **1バイトも変更していない**（`git status` 実測で空）。今回の変更はテスト配置と実行系のみに閉じている。

### 結論

**回帰ゲート Green。**

---

## 4. 併せて記録する設計判断

### 撮影は全カット 1280×720 / deviceScaleFactor 1 / PNG / `fullPage:false` に統一

根拠は実測。公式サイト `content/help/images/` の既存27枚が、**フロント予約フォームのカットも含め例外なくこの寸法**だった。マニュアル画像としての一貫性を優先し、新規カットもすべてこれに合わせる。

**モバイル幅の撮影は行わない。** 既存資産にモバイル幅のカットが1枚も無い以上、追加すると寸法が混在してマニュアルの見た目が崩れる。必要になった時点で人間の判断を仰ぐ（YAGNI）。

### 環境ノイズは CSS 注入（`page.addStyleTag`）で隠す。DB は書き換えない

隠す対象: WordPress 更新通知バー・更新カウント・コメント数バッジ。

DB 方式を採らない理由: **wp-env の実際の更新件数は時期によって変わる**ため、DB を書き換える方式では撮影のたびに絵が変わってしまい、マニュアル画像の再現性が保てない。CSS 注入なら環境の実状態に左右されず**毎回同じ絵**になり、かつ **WordPress のグローバル状態を汚さない**（実害②・③と同じ「撮影が環境へ漏れる」問題を新たに作らない）。

### 管理画面ロケールの ja 化はシードの一部として行い、purge で元に戻す

`WPLANG` オプションと管理者の `locale` user_meta を、レジストリ `smart_booking_screenshot_seed` に退避してから ja に切り替え、purge 時に復元する。

理由: **wp-env はグローバル状態を回帰スイートと共有している。** ja を固定してしまうと回帰スイートの前提（ラベル文言など）を恒久的に変えてしまう。ja にするのは**撮影セッションの間だけ**とする。これも「撮影の都合を回帰へ漏らさない」という本決定の一貫した方針の適用である。

---

## 5. 未解決（人間の判断待ち）

### (1) `docs/help/images/` と `docs/website-screenshots/` の二重管理

プラグイン側 `docs/help/images/`（27枚＋markdown 14本）と、今回新設した `docs/website-screenshots/`（生成物）が二重管理になっている。

調査結果:

- 画像: サイト側 `content/help/images/` と**ファイル名は27枚完全一致**。md5 は **25枚一致 / 2枚相違**で、相違した `installation/01`・`02` は**プラグイン側が stale**（＝実害②で回帰スイートが上書きし続けていた当の2枚）。
- markdown: **14本中7本が相違し、サイト側が新しい**。プラグイン側 `docs/help/` は 2026-05-22 以降更新が無く、サイト側は 2026-09-09 まで更新が続いている。

**提案（未実施・人間 GO 待ち）**:

- 正本はサイト側 `content/help/images/` とする。
- `docs/website-screenshots/` は gitignore 済みの**生成物ステージング**として扱う。
- プラグイン側 `docs/help/images/` は**廃止候補**。

**ただし `docs/help/markdown/` は残す必要がある。** `src/frontend/utils/analytics.js:8` と `tests/e2e/gtm-datalayer.spec.ts:5` が `docs/help/markdown/gtm.md` を**仕様の同期先として参照している**ため、まとめて消すと出荷コードとテストの参照が切れる。

### (2) 既存赤 29件が未台帳

`docs/bugs/phase9-form-width-mobile-285px.md` のファミリー3件のみ起票済みで、残りは未起票。決定 0001 により回帰ゲートはブロックしないが、**毎回のベースライン比較コスト**になっている（29件が既存赤か差分赤かを人手で仕分ける必要がある）。

### (3) `phase1.spec.js:53` の期待値が現行スキーマと不一致

テストは「テーブル 6 つ」を期待しているが、**現行スキーマは 7 テーブル**。テスト側の陳腐化が疑われるが、**スキーマ検証の要**であるため放置は危険。テストを直すのかスキーマ側に問題があるのかを確定させる必要がある。

→ **2026-09-10 に起票済み: `docs/bugs/phase1-schema-expected-tables-stale.md`。** 実読の結果、期待値リストに欠けているのは `reservation_meta` ではなく **`wp_smart_booking_forms`**（v0.4.0 で追加）であることが判明している。

### (4) E2E ハーネスの構造問題

DB 操作のたびに `execSync('npx wp-env run cli ...')` でプロセスを起動しているため、**約700テストあたり1回 `ETIMEDOUT` フレークが出る**（第3節の差分赤1件の正体）。`retries: 1` の導入、または DB 直結化で解消可能だが**未対応**。現状はベースライン比較のたびに差分赤1件を人手で「フレーク」と判定する運用でしのいでいる。

---

## 6. 追記（2026-09-10）: 実害③の DB 汚染は、実測の結果、回帰結果に影響していなかった

運用ルール「影響が確認された場合は `docs/bugs/` に起票。**影響が無かった場合も『無かった』ことを記録に残す**」に従い、実測結果をここに残す。

**結論: 影響は無かった。** 退避した撮影 spec（`tests/screenshots/legacy/help-screenshots.spec.js`）の `booking-form-frontend` は実際に DB へ予約を書き込むコードであり、退避前は回帰スイート（`tests/e2e/`）の最上流に居た。したがって「DB 汚染が回帰ゲートの信頼性を損なっていたのではないか」を検証したが、**before の回帰結果が汚染された形跡は無かった**。起票は不要（→ 6.4 の理由）。

### 6.1 根拠①: before 実行で実予約は1件も作られなかった

撮影 spec は撮影用シードデータ（`渋谷店` など）に**ハード依存**している（実害①）。正規化された回帰基線では先頭の `stores` テストが `waitForSelector('text=渋谷店')` で 10 秒タイムアウトして失敗し、`test.describe.configure( { mode: 'serial' } )` により**後続8テストが実行されない**。`booking-form-frontend` はこの後続8件に含まれるため、**予約を作るコードパスに到達していない**。

実測の裏取り: before の failed 一覧に現れた `help screenshots` は `stores` の **2件のみ**（desktop / mobile）。`booking-form-frontend` は **failed にも passed にも現れない**（＝ did not run）。

### 6.2 根拠②: 唯一の曝露窓 `phase1.spec.js:53` は before / after 双方で同じ赤だった

汚染が残りうるのは DB reset を持たない spec だけである。`phase2-*` は `tests/e2e/phase2-helpers.js` の `restoreSnapshot()`、`phase3-*` は `tests/e2e/phase3-helpers.js` が、それぞれ `beforeEach` で DB を全消しする。したがって実際の曝露窓は **`phase1.spec.js` の1ファイルのみ**（実害③に記載のとおり）。

その `phase1.spec.js:53` は、**撮影 spec の有無で挙動を変えていない（before / after ともに赤、かつ同じ赤）**。曝露窓が撮影 spec の在／不在に反応していない以上、汚染は回帰判定に影響していなかったと言える。

なお `phase1.spec.js:53` 自体の赤は**撮影とは無関係な独立した既存赤**であり、別途 `docs/bugs/phase1-schema-expected-tables-stale.md` に起票した（第5節 (3) の未解決項目に対応）。

### 6.3 ただし危険そのものは実在した（退避によって消滅した）

「影響が無かった」は「危険が無かった」ではない。撮影用シードが DB に残っている状態で `npx playwright test` を回せば撮影 spec は完走し、`test.use({ viewport })` がプロジェクトを絞らないため **desktop / mobile 双方で最大2件の実予約＋`booked_count` 加算**が回帰スイートへ注入される。

発火条件（＝撮影用シードが残っていること）は**撮影運用中と必ず一致する**。「普段は出ないが、撮影した日だけ回帰結果が汚れる」という最も気づきにくい形の相互汚染であり、被害が限定的だったのは設計ではなく偶然（他 spec がたまたま DB を消していたこと）に依存していた。

**本決定（`tests/screenshots/legacy/` への退避 ＋ `testIgnore: '**/legacy/**'`）により、この経路は消滅した。** 同居へ戻すと危険も戻る。

### 6.4 `docs/bugs/` に起票しない理由

`docs/bugs/` は「今後の対応が必要な事象」の台帳として運用されている（既存5件はいずれも未対応の不具合・テスト負債で、修正方針が未消化のまま残っている）。今回の件は次の3点をすべて満たすため、台帳に載せると**恒久的に空振りする対応待ち項目**になる。

1. 出荷コード（`includes/**` / `src/**`）に欠陥は無い。
2. ユーザー影響はゼロ（テストハーネス内部に閉じた話）。
3. **既に解消済み**（本決定の退避により発火経路が消滅）。

一方、本ファイルは既にこの分離判断の正本であり、第2節 実害③で同じ話題を扱っている。**「危険は実在したが実測では影響ゼロだった」という結論は、危険を記述した箇所と同じ場所に置くのが最も誤読されにくい**ため、ここへ追記する形を採った。
