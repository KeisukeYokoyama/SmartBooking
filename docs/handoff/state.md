# Smart Booking 引き継ぎ state

最終更新: 2026-09-12

## ✅ v0.5.4：**WordPress.org 公開済み**（SVN **rev 3690665**・2026-09-11）

`svn ci` 完了。git（`03d5966` + タグ `v0.5.4`）・SVN（`trunk` と `tags/0.5.4/`）とも反映済み。

> ⚠️ **WordPress.org API の反映ラグ**: commit 直後の
> `https://api.wordpress.org/plugins/info/1.0/smart-booking.json` はまだ `0.5.3` を返す。
> 反映は数分〜十数分かかる。**API が 0.5.3 のままでも commit 失敗ではない**（`svn log --limit 1` が正）。
>
> ⚠️ **`CHANGELOG.md` が SVN 上で binary 扱いになっている**: 今回 trunk に初めて追加した際、
> SVN が `svn:mime-type: application/octet-stream` を自動設定した（UTF-8 テキストなのに
> 「追加しています (バイナリ)」と表示された）。**配布物・プラグイン動作には影響しない**が、
> SVN 上で diff が取れない。次回リリース時に直すなら:
> `svn propset svn:mime-type text/plain trunk/CHANGELOG.md`（tags は原則いじらない）。

- **スコープ = D（H4）のみ**。条件フィールドの親を checkbox に変更すると子の回答が無言で消える不具合。
  A/B/C（`{schedule_time}` 表記・管理者トグル OFF 時の文言・無言 skip の可視化）は **v0.5.5 へ送った**
  （人間判断: 入力が消える修正を文言修正のために遅らせない）。計画は `docs/plans/v0.5.4-release-plan.md`。
- **実装**（出荷コード3ファイル・34行）:
  - `includes/rest/class-rest-custom-fields.php::update_item` — 既に親のフィールドは
    radio/select 以外へ**種別変更できない**（400 `smb_field_parent_type_locked`）。
    判定は「種別が実際に変わるとき」だけ＝**壊れた既存サイトの修復（checkbox→radio）は許可**。
  - `src/admin/pages/formsettings/CustomFieldModal.jsx` — 既存 `isAlreadyParent` で種別セレクタを `disabled` ＋ 理由を help 表示。
  - `src/frontend/fieldConditions.js::isFieldVisible` — 配列の親値は不成立（サーバー `condition_met()` と一致）。
  - 詳細と根拠は `docs/bugs/condition-parent-checkbox-silent-data-loss.md` の「修正内容」節が正本。
- **E2E 新規**: `tests/e2e/v054-condition-parent-guard.spec.js`（5×2=10）。**修正前 (1)(4)(5) Red → 修正後 10/10 Green**。
- **回帰ゲート Green（絞り込み比較・フルスイートは未実行）**:
  - 対象6 spec / **56テスト**（`v054` / `v030-conditional-fields` / `v030-conditional-admin` /
    `phase2-form-settings` / `v030-address-field` / `v042-mail-custom-fields`）。
  - `git stash` ベースライン 50 expected + 6 unexpected → 変更後 **56 expected**。
    **状態が変わったのは6件のみ、すべて `v054` の Red→Green。新規失敗ゼロ。**
  - **did-not-run 0 / skipped 0**（両ラン）。serial モードの取りこぼしは起きていない（JSON レポートを
    テスト単位で突き合わせて確認。失敗リストの差分だけでは仕分けしていない）。
  - **絞り込みの根拠（到達可能性）**: ①`isFieldVisible` の新分岐は `if (!parentKey) return true` の**後**にあり、
    表示条件を持たないフィールドからは到達不能 → 条件フィールドを作る spec のみが対象。
    ②`CustomFieldModal` の変更は型 `<Select>` の `disabled`/`help` のみで `isAlreadyParent` ガード下
    → フォーム設定画面のフィールド編集モーダルのみ。③`update_item` の新分岐は
    `PUT /custom-fields/{id}` でのみ実行され、**他に PUT する spec は `phase2-form-settings` だけ**（grep 実測）。
    `v042-mail-custom-fields` は安価な end-to-end の保険として追加（4テスト）。
- **静的ゲート**: `php -l` OK ／ phpcs 変更PHP **ERRORS 0 / WARNINGS 0** ／
  `wp-scripts lint-js` で `fieldConditions.js` clean ／
  **Plugin Check 配布スコープ 0/0**（指摘19件は全て `.distignore` 除外の dev 成果物で、
  **ZIP の31ファイルに1つも含まれないことを実測で突き合わせ済み**）。
- **配布物**: `smart-booking.zip` = **31ファイル**（`docs/` `tests/` `.claude/` `src/` の混入なし・実測）。
  ZIP 内 `Version: 0.5.4` / `SMART_BOOKING_VERSION 0.5.4` / `Stable tag: 0.5.4` を実測確認。
- **⚠️ `wp-scripts lint-js --fix <file>` はファイル引数を無視して全プロジェクトを整形する**。
  一度踏んで37ファイルが書き換わり、出荷対象外の差分を `git checkout` で全て戻した。
  **`--fix` は使わず、指摘箇所を手で直すこと。**

### v0.5.5：**WordPress.org 公開済み**（SVN **rev 3690888**・2026-09-11 15:13 JST）

`svn ci` 完了（人間 GO のうえ実行）。git（`7e2b74b` + タグ `v0.5.5`、push 済み）・
SVN（`trunk` と `tags/0.5.5/`）とも反映済み。計画は `docs/plans/v0.5.5-release-plan.md`。

- **commit 直前の実測検証**: `trunk` と `tags/0.5.5` の差分ゼロ（`.svn` 除く）／バージョン4箇所一致／
  ローカルビルド（`smart-booking.php` `readme.txt` `CHANGELOG.md` `includes/class-email.php`
  `build/admin.js` `build/admin.asset.php`）と SVN 作業コピーが byte 一致／`?` 無し。
- **WordPress.org API は commit 直後に 0.5.5 を返した**（`last_updated: 2026-09-11 6:13am GMT`）。
  v0.5.4 のときの反映ラグ（下記）は今回は発生していない。**API の値は commit 成否の判定基準ではない**
  という原則は維持（正は `svn log --limit 1 <URL>`）。
- ⚠️ **`svn log --limit 1` は作業コピーのパスに対して実行すると BASE までしか見ない。**
  commit 直後の確認は `svn log --limit 1 https://plugins.svn.wordpress.org/smart-booking`
  （＝リポジトリ URL 指定）か `svn up` 後に行う。v0.5.5 の確認時、WC 指定では r3690665（0.5.4）が
  返り「commit が消えた」と誤読しかけた。
- **v0.5.4 で binary 扱いだった `CHANGELOG.md` の `svn:mime-type` は `text/plain` へ是正済み**
  （trunk・tags/0.5.5 の両方）。

- **スコープ**: A（H1 `{schedule_time}` 表記）／B（H2案A 文言**4箇所**）／C（H2案C 無言skip可視化）／
  **H3（予約詳細のフォーム別入力項目）**／E（H5 readme の http→https）／F（H6 住所タイプ変更時の自動入力既定）。
  **H7 は見送り**（技術的負債トラック）。
- **git**: `db25f1e`（A/B/C/H6）→ `7d1a4e8`（H3・独立コミット）→ `7e2b74b`（release + H5）。
  タグ `v0.5.5` push 済み。
- **⚠️ H3 は A/B/C/H5/H6 と分けて実装・コミット・回帰判定した**（管理画面の状態管理に触るため）。
- **回帰ゲート Green（2セットに分けた絞り込み比較・フルスイートは未実行）**:

  | セット | 対象 | baseline | 変更後 |
  |---|---|---|---|
  | SET1（A/B/C/H5/H6） | 7 spec / 78 テスト | 64 expected・4 失敗・10 skipped | **78 expected・失敗0** |
  | SET2（H3） | 5 spec / 48 テスト | 41 expected・2 失敗・5 skipped | **47 expected・失敗0**（skipped 1 は意図的） |

  - **状態が変わったのは Red/skipped → Green のみ。新規失敗ゼロ。**
  - **baseline の既存赤4件（SET1 2件 / SET2 は新規specのみ）のうち、`phase4-email` と
    `v030-address-field` の2件は `npx wp-env run cli` の ETIMEDOUT**（既知のインフラフレーク。
    本ファイル下部にも既出）。スタックトレースで確認済みで、コードとは無関係。変更後は発生していない。
  - `v040-form-reservation.spec.js` mobile の skipped は `:41` の `test.skip( project !== 'desktop' )`
    による**意図的なもの**。
  - **did-not-run の取りこぼし対策**: JSON レポーターの出力をテスト単位で突き合わせ、
    skipped 件数も明示的に数えた（失敗リストの差分だけで仕分けない）。
- **絞り込みの根拠（到達可能性を grep で実測）**:
  - **B の旧文言を assert している既存テストはゼロ**（文言のみ・挙動不変）。
  - A の `{schedule_time}` 説明文を見ているテストもゼロ。`phase4-email.spec.js:277` が持つ
    `14:00〜15:00` は**メール本文の展開結果**で、変数一覧の説明文とは無関係。
  - C は `class-email.php` の宛先決定を触るので `phase4-email` ＋ `admin_notify` を触る
    唯一の既存 spec `v050-form-mail-overrides` を対象にした。
  - H6 は `CustomFieldModal` の `onTypeChange` なので `v030-address-field` /
    `phase2-form-settings` / `v054-condition-parent-guard`。
  - H5 は出荷コード無変更のためテスト対象なし。
  - H3 は `ReservationsPage` / `ReservationDetailModal` なので予約一覧系4本＋新規1本。
- **静的ゲート**: php -l OK ／ phpcs 変更PHP **ERRORS 0 / WARNINGS 0** ／ lint-js clean ／
  **Plugin Check 配布スコープ 0/0**（指摘20件は全て `.distignore` 除外で、ZIP の31ファイルに
  1つも含まれないことを実測で突き合わせ済み）。
- **配布物**: `smart-booking.zip` = **31ファイル**（混入なし・実測）。ZIP 内の版表記3箇所も実測確認。
- **SVN 作業コピー**（`~/dev/smart-booking-svn`・rev 3690879 から）: `trunk` 反映＋`tags/0.5.5/` 作成を経て
  **2026-09-11 に commit 済み（rev 3690888）**。`svn status` は意図した差分のみ（`?` なし）だった。
  **v0.5.4 で binary 扱いになっていた `trunk/CHANGELOG.md` の `svn:mime-type` を `text/plain` へ是正済み**
  （`MM` の2文字目がそれ）。

#### 実装上の判断（次セッションが蒸し返さないための記録）

- **B は依頼時「3箇所」だったが実際は4箇所。** `MailSettingsTab.jsx:350-352` のリード文にも
  同じ無条件の断定があった（ux-evaluator が発見、親が一次資料で裏取り）。
  役割分担は「リード文＝条件付きの一般則／トグル直下のヒント＝OFF の例外」。
- **H3 の手動予約作成モーダルは修正対象外。** UI にフォーム選択が無く、サーバが常に既定フォームへ
  解決するため（`class-rest-reservations.php:285`）、既定フォームの項目を渡すのが正しい。
  サイト側 `help-backlog.md` §H3 は手動予約作成も不具合として挙げているが、**実装上は不具合ではない**。
- **H3 に REST の変更は不要だった。** `src/admin/api.js:238-239` の `customFields.list( formId )` は
  元から form_id を受け取れ、呼び出し側が渡していなかっただけ。

#### ⚠️ サイト側の連動（未着手・プラグイン側からは書き込まない）

`~/dev/smart-booking-website` 側で次が必要。**本セッションでは未実施**。

- `docs/help-backlog.md`: §H1 / §H2 / §H3 / §H5 / §H6 を閉じる（§H4 は v0.5.4 で既に解決済みだが未クローズ）。§H7 は見送り。
- `content/help/markdown/conditional-fields.md`: 「親フィールドのタイプは変えないでください」節が
  v0.5.4 以降の実装と食い違う（現在は**そもそも種別を変更できない／子が表示されない**）。
- `content/help/markdown/forms.md`: 「予約詳細の『追加の入力項目』は既定のフォームの項目をもとに
  表示される」という注意書きは **v0.5.5 で不要になる**ので削除する。
- `content/help/markdown/address-field.md`: 「タイプを変更した場合は自動入力しない側で開く」の記述が
  **v0.5.5 で不要になる**（H6 修正）。
- `content/help/markdown/email.md`: OFF 時の挙動の記述は実装と一致しているが、
  v0.5.5 で警告バナーが出るようになったことを追記する余地がある。


## 🎨 v0.5.6：**WordPress.org 公開済み**（SVN **rev 3692196**・2026-09-12 08:19 JST）

`svn ci` 完了（人間 GO のうえ実行）。git（`ea26ed4` ＋ タグ `v0.5.6`、push 済み）・
SVN（`trunk` と `tags/0.5.6/`）とも反映済み。
計画と判断根拠は `docs/plans/v0.5.6-release-plan.md`、起票は
`docs/bugs/admin-disabled-select-arrow-tiling.md` が正本。

> ⚠️ **Changelog の日付は `2026-09-11`（作業日）だが、実際の commit は 2026-09-12 08:19 JST**。
> 作業が日付をまたいだため1日ずれている。配布物・動作に影響は無く、WordPress.org の
> 「最終更新」は commit 日時で表示されるため実害は無い。**次リリース時に直さない**
> （過去の Changelog を遡って書き換えると、公開済み ZIP との差分が生まれるため）。
> 次回以降は「Changelog の日付は commit 当日に合わせる」ことを手順に含める。

- **スコープ = セレクトボックスの矢印が壊れる件のみ**（同一原因の2症状）。
  - 症状1: `disabled` のセレクトで WP コアの矢印が**タイル状に敷き詰められる**（撮影中に発見）。
  - 症状2: `.smb-field.has-error` のセレクトで**矢印が消える**（今回の全件確認で新たに検出）。
  - 原因: `src/admin/admin.scss` の `background: <色>` ショートハンドが
    `background-repeat` / `background-position` / `background-image` を initial へ戻すこと。
- **出荷コードの変更は `src/admin/admin.scss` の3行だけ**（`background:` → `background-color:`）。
  PHP / JS / REST / DB には一切触れていない。同ブロックに理由つきコメントを追加した。
- **全件確認（「他に同じ潰しが無いか」）**:
  - 静的 grep: `background:` ショートハンドは admin 172件 / frontend 89件。
    background-image を持ちうる要素との突き合わせで**是正対象は上記3行のみ**と確定。
    フロントの select 矢印（linear-gradient 2枚）は**矢印ルールが共有ルールより後**にあり同特異度で
    後勝ちするため無傷。`.smb-card__placeholder` の gradient は自前で潰すルールが無く、
    `background-size` 未指定の linear-gradient はボックス全体を覆うので `repeat` でも見た目は不変。
  - 動的スイープ（ブラウザ実測）: 管理画面5ページ＋設定4タブ＋フィールド編集モーダル＋フロントで
    全要素を走査し「image あり かつ repeat」を抽出。**修正前2件→修正後は `.smb-card__placeholder` の1件のみ**
    （＝上記の無害な gradient）。`.has-error` を DOM 注入したセレクトの `background-image` も
    **none → 矢印あり**に復帰。フロントは前後とも0件。
- **回帰ゲート Green（絞り込み比較）**:

  | | spec数 | テスト数 | expected | unexpected | skipped |
  |---|---|---|---|---|---|
  | baseline（`git stash` で CSS を退避＋再ビルド） | 8 | 128 | 124 | 4 | 0 |
  | 変更後（再ビルド） | 8 | 128 | 124 | 4 | 0 |

  - **テスト単位の突き合わせで「状態が変わったテスト 0 件」「消えた/増えたテスト 0 件」**（JSON レポーターを
    file:line:project:title で照合）。**新規失敗ゼロ**。
  - 既存赤4件はベースラインにも同じ4件（`phase9-redesign-style:327` [mobile] /
    `regression-gen-a-visual:304` [mobile] / `regression-gen-a-visual:39` [desktop・mobile]）。
  - 絞り込みの根拠（`docs/plans/v0.5.6-release-plan.md` §4 が正本）: ①計算スタイルを assert する
    spec 全部（`phase9-redesign-style` / `regression-gen-a-visual` / `card-unification-visual`）
    ②変更対象の `.smb-input`/`.smb-select` を実際に操作する管理画面 spec
    （`phase2-form-settings` / `v030-conditional-admin` / `v054-condition-parent-guard` / `v030-address-field`）
    ③バンドル再生成のサニティとしてフロント通し（`phase3-flow`）。
  - **E2E は追加しない**（判断）。DOM・イベント・REST に触れない塗りだけの変更で、
    `background-repeat` を assert するテストは **WordPress コアの CSS 実装詳細に依存する脆いテスト**になるため。
    再発防止は SCSS のコメントと起票の検証手順で担保する。
- **静的ゲート**: `npm run build` 成功／**Plugin Check 配布スコープ 0/0**
  （指摘26ファイルを ZIP の31ファイルと機械照合し、**ZIP 内に該当ゼロ**を実測）。
- **配布物**: `smart-booking.zip` = **31ファイル**。ZIP 内の版表記3箇所も実測確認（0.5.6）。
- **同梱を検討して外したもの**（根拠は計画書 §5）: メールタブのレース
  （`v050-form-mail-tab-common-template-race.md`・JS 変更＋再現テストが要る＝v0.5.7 単独スコープ推奨）／
  mobile フォーム幅（`phase9-form-width-mobile-285px.md`・**意図幅の設計判断が未了**）／
  テスト負債2件（配布物に影響なし）／H7（見送り継続）。
- **docs のみの同梱**: v0.5.5 で解決した起票3件のステータスを「公開済み」へ更新。
- **公開後の撮り直し（2026-09-12・実施済み）**: シードを再投入して**全27枚を撮り直した**
  （1枚だけでなく全部にしたのは、フォーム id・相対日付・バージョンバッジを世代でそろえるため）。
  **27枚すべてを目視で再確認し、矢印のタイリング・矢印の消失はゼロ**。
  `06-parent-type-locked.png` は矢印が右端に1つだけになった。撮り直し後も purge 済み。

## 🧪 テスト負債の解消: フォーム幅テストの陳腐化（2026-09-12・**テストのみ／リリース無し**・commit `4e4fc07`）

**出荷コード（PHP / JS / CSS / REST / DB）は 1 行も変更していない ＝ 配布物・バージョン・WordPress.org は無関係。**
判断と実施内容の正本は `docs/bugs/phase9-form-width-mobile-285px.md`（**クローズ**）、
調査材料は `docs/investigation/front-main-page-width-375px-20260912.md` §8。

- **判断（人間・案A 採用）**: 「375px でフォーム幅 327px（`calc(100vw - 48px)`）」という期待値は、
  **CSS 宣言として一度も実装されたことがない**アーカイブ文書
  （`docs/legacy-ui-handover/spec-amendment-frontend-redesign.md:113-114`）のモック値。
  `frontend.css:2767` の Gen-D コメントが「**既存の** `width: calc(100vw - 48px)`」と誤記したまま
  語り継がれ、テストの期待値に流れ込んだ。**バグではなく、存在しなかった仕様に対してテストが書かれていた。**
  実装は `max-width: 450px; width: 100%`＝「器いっぱい、ただし最大 450px」で、375px の **285px は計算どおり**
  （`375 − テーマ 30×2 − .smb-front-root 15×2`）。テーマのグローバルパディングは `clamp(30px, 5vw, 50px)` で
  **テーマとビューポートで変わる ＝ ビューポート相対の絶対値はテストの期待値にできない。**
- **対応**: テスト 2 本の期待式を**構造的な性質**へ書き換えた
  （器の content box 幅いっぱい ±1px／450px 以下／ビューポートからはみ出さない／崩壊だけ捕捉する緩い下限）。
  各テストに理由と調査レポートへのリンクをコメントで残した。

  | ファイル | 備考 |
  |---|---|
  | `tests/e2e/phase9-redesign-flow.spec.js:273` | 起票時から既知の赤（mobile） |
  | `tests/e2e/phase9-redesign-confirm-responsive.spec.js:220` | **今回の全件確認で新たに発見**。`setViewportSize(375)` を自前で行うため **desktop / mobile 両方で赤**。さらに `mode: 'serial'` のため後続 2 本 ×2 プロジェクト = **4 テストを did-not-run にしていた** |

- ⚠️ **v0.5.3〜v0.5.6 の回帰ゲートは `phase9-redesign-confirm-responsive` を絞り込み対象に一度も含めていなかった**
  ため、この赤 2 件と did-not-run 4 件が記録に現れていなかった。
  **絞り込みは「変更が触る範囲」で正しいが、記録に出ない赤が別に存在しうることを忘れないこと。**
- **回帰ゲート Green（絞り込み比較）**: 対象 2 spec × 2 プロジェクト = **26 テスト**。

  | | テスト数 | expected | unexpected | skipped(did-not-run) |
  |---|---|---|---|---|
  | baseline（`git stash` で 2 ファイルを退避） | 26 | 19 | **3** | **4** |
  | 変更後 | 26 | **26** | **0** | **0** |

  JSON レポーターを `file:project:title` で突き合わせ、状態が変わった 12 件はすべて説明可能
  （改名 2 本 ×2 プロジェクトで旧 4 件消滅・新 4 件出現／serial abort の 4 件が skipped → expected）。
  **テスト実数 26 → 26（消えた/増えたテストゼロ）・新規失敗ゼロ。**
  `lint-js` 指摘件数は **37 → 37**（この 2 ファイルが元から抱える既存負債。`--fix` は使っていない）。
  **`npm run build` / Plugin Check は不要**（出荷コード無変更）。
- **全件確認（アーカイブ文書由来の誤記が他へ流れ込んでいないか）の結果**:
  - `tests/` の `100vw` / `vw − 48` 系の期待値は **上記 2 本で全部**（grep 実測）。他に無い。
  - `src/` の `100vw` は **2 箇所ともコメント**。うち `frontend.css:2767` が誤記の発生源。
    **コメントでも出荷コードの変更になるため本トラックでは触らず**、
    起票の「残課題 1」に記録した（次に `frontend.css` を触るリリースで是正）。
  - `src/` `tests/` の「既存の」表現 **33 件を全件確認**。**実装されていない仕様を「既存の」と
    呼んでいるのは `frontend.css:2767` の 1 件だけ**。他 32 件は実在するものを指していて問題なし。
    ただし同じコメントブロックの `frontend.css:2769`「既存の `@media (max-width: 480px)` ブロック
    （**Gen-C で追加済み**）」は**帰属が誤り**（実際は `177ba69` Phase 3 Gen-D）。
    ブロック自体は実在するので害は小さいが、調査レポート §6 がこの誤記をそのまま引き写していた
    （§8.2 で訂正）。**誤記は 1 つのコメントブロックに固まっている。**
  - **別件を 1 件発見 → 起票**: `docs/bugs/phase9-section-title-22px-mobile-stale.md`
    （`phase9-redesign-style.spec.js:327` が mobile で赤。実装は仕様どおり ≤768px で 20px に縮小するのに、
    テストが desktop の 22px を viewport 非依存で固定している。**原因は別だが「アーカイブ文書の数値を
    viewport を見ずに固定」という点が共通**）。**未対応。**
  - v0.5.6 のベースライン既存赤の残り 2 件（`regression-gen-a-visual:39` / `:304`）は
    **管理画面側でアーカイブ文書を参照していない**（grep 実測）。本件とは無関係。
- **判断保留のまま残したもの（今回は削除も変更もしない）**: 死んでいる
  `@media (max-width: 480px) { .smb-front-root { padding: 12px } }`（`frontend.css:1247`）。
  後続の `@media (max-width: 768px) { padding: 15px }`（`frontend.css:2774`）に同特異度・後勝ちで潰されている。
  判断材料を調査レポート §8.2 に追記した（git 履歴つき）。要点:
  - 12px = `177ba69`「Phase 3 Gen-D」（2026-04-25・**リデザイン前**。「横パディングを少し詰める」という意図コメントあり）。
    ＝ 調査レポート §6 の「Gen-C で追加」は**コメントの記述を引き写した誤り**（§8.2 で訂正済み）。
  - 15px = `cce3093`「Gen-D」（2026-04-27・リデザイン仕様「変更5 / タブレット（≤768px）」の「フォーム padding 15px」）。
  - **リデザイン仕様の「スマホ（≤480px）」節はルート余白に言及していない**（日付カード / 時間スロット /
    月表示ヘッダーのみ）。＝ 仕様の読みとしては「≤768px 以下は一律 15px」が素直で、12px は残骸と読める。
  - ただし `cce3093` に「12px を 15px へ統一する」旨の記述は無く、**意図的な上書きの証跡は無い**。
    ＝ **履歴だけでは断定できない。** 実害ゼロ（見た目は 15px で一貫）。
  - 対応候補は ①12px を削除して一律を明示（**表示不変**）／②12px を活かすため順序を入れ替える（**スマホ表示が 3px 動く**）。
    出荷コードに触るため、`frontend.css:2767` のコメント是正とまとめて次リリースで扱うのが筋。

## 📸 ヘルプ画像 フェーズ2: 実カット撮影（2026-09-11・**撮影完了／サイト側へのコピーは未実施**）

撮影基盤（2026-09-09 新設）の上に、サイト側バックログ `~/dev/smart-booking-website/docs/help-backlog.md`
§C2 / §C3 と、各原稿に埋め込まれた `<!-- 撮影: … -->` 指示に沿って**実カット 27 枚**を撮影した。
出力は `docs/website-screenshots/<slug>/NN-name.png`（**gitignore 済み**＝コミットされない）。
**全カット 1280×720 / PNG / fullPage:false / 管理画面ロケール ja**（既存27枚と同条件・実測確認済み）。

- **内訳**: `forms` 3 ／ `conditional-fields` 6 ／ `form-mail` 3 ／ `address-field` 3 ／ `settings` 3
  ／ `design` 2 ／ `custom-fields` 2 ／ `reservations` 2 ／ `email` 2 ／ `staff` 1。
  一覧と1枚ごとの内容は `docs/website-screenshots/README.md` の「撮影済みカット一覧」が正本。
- **v0.5.5 / v0.5.4 で変わった画面も込み**: B の文言4箇所（`email/02-admin-notify.png`＝リード文＋
  トグル直下ヒント、`email/03-admin-off-dialog.png`＝確認ダイアログ、`staff/02-staff-add-modal.png`＝
  担当者メール欄のヘルプ文）／H6（`address-field/03-address-type-autofill.png`）／
  H3（`reservations/02-status-change.png`）／v0.5.4 の種別セレクタ disabled
  （`conditional-fields/06-parent-type-locked.png`）。A（`{schedule_time}` の例示）は
  `form-mail/02` ・`email/02` ・`form-mail/03` の変数一覧に写り込んでいる。
- **コード**: 共通ヘルパーを `tests/screenshots/helpers.js` へ切り出し、
  `help-new-pages.spec.js`（新規5ページ）と `help-updates.spec.js`（既存差し替え＋v0.5.5 分）を追加。
  既存 `help.spec.js` は `stores` のみに縮小。**出荷コードは無変更**（`src/` `includes/` の差分ゼロ）。
- **シード拡張**（`tests/screenshots/seed/`）: 原稿の例示と名前を一致させるため
  `無料体験のお申し込み`（＋`体験コース`・ユーザー宛のみ専用メール文面 ON）を追加し、
  **既定フォーム「標準フォーム」へ `資料送付` / `送付先住所`（条件フィールド）/ `ご住所`（住所・自動入力 ON）
  を追加**（既定フォームの行と初期3項目は不変。`field_defs()` のスラッグ `default` が特別扱い）。
  さらに**メール共通文面6 option を activator の既定値へそろえる**（wp-env は回帰フィクスチャの
  「共通受付件名」等で汚れており、そのまま撮ると管理画面にテスト文字列が写るため）。
  **purge の完全復帰を実測で確認済み**（フォーム1件・フィールド3件・店舗2件・レジストリ option 削除・
  メール6 option が元のダミー値へ復元）。撮影後に purge 実行済み＝**wp-env は回帰スイート実行可能な状態**。
- **原稿どおりに撮れなかった点（1件）**: `form-mail/01-form-mail-tab.png` は原稿が
  「案内文から2種別目の見出しまで1枚に」と指定しているが 1280×720 に物理的に入らない。
  2種別目の見出しと OFF 表示は `form-mail/02-variable-helper.png` の下半分に収めた。
- ⛔ **`gtm` の4枚（§C1）は撮影対象外**。指示された絵は GTM の管理画面と DevTools の `dataLayer` で、
  **どちらも wp-env の中に存在しない**（外部サービスと撮影ブラウザの外側の UI）。この基盤では撮れない。
  サイト側 §C1 は未完のまま残り、`tests/e2e/help-pages.spec.ts` の `SLUGS_WITHOUT_IMAGES` からの
  `'gtm'` 除去も保留。**別途の対応方針は人間が判断する。**
- 🟡 **撮影中に発見した不具合＝`docs/bugs/admin-disabled-select-arrow-tiling.md`（新規起票）**:
  disabled のセレクトで WordPress の矢印アイコンが**タイル状に敷き詰められる**。
  原因は `src/admin/admin.scss` の `.smb-select` 系 `&:disabled { background: … }`（ショートハンド）が
  `background-repeat` / `background-position` を initial へ戻し、WP コアの `select:disabled` が与える
  `background-image` と組み合わさるため（`getComputedStyle` で `repeat` / `0% 0%` を実測）。
  **表示のみ・データ影響なし**だが `conditional-fields/06-parent-type-locked.png` に写る。
  修正は CSS 1〜2行だが `build/` に入る＝**リリースを伴うため GO 待ち**。
- **サイト側へのコピーは未実施**（このセッションではサイト側リポジトリに一切書き込んでいない）。
  コマンドは `docs/website-screenshots/README.md`「サイト側リポジトリへ渡す手順」。
  **`stores/` は差し替え依頼が無いためコピー対象外**（生成はされるが渡さない）。


## 🔴 現在の公開状況（最優先・2026-08-17 更新）

> ⚠️ 本ファイル下部の「現在地」節は 2026-07-30 時点の記述で **stale**（「公開版 v0.5.0／v0.5.1 未公開」は**誤り**）。**実体を優先すること**（下記「バージョン状態の確認手順」で必ず実機確認してから作業する）。

- **WordPress.org 公開版 = v0.5.4**（SVN **rev 3690665**・**2026-09-11 公開済み**）。条件フィールドの親を checkbox に変更すると子の回答が無言で消える不具合の修正（上記 v0.5.4 節）。
- 前版 **v0.5.3**（SVN **rev 3650340**・**2026-08-17**）。予約フォームのバリデーション表示（入力不備時にインラインエラー＋該当欄フォーカス）／主要項目の文字数上限（電話20・氏名/メール255）／予約一覧「受付日時」列を左から2番目へ移動／手動予約作成で電話番号必須。前版 v0.5.2（rev 3650270・2026-08-16）ほかは下記「公開履歴」表。
- **main = v0.5.3**（バージョン4箇所一致・**タグ `v0.5.3` push 済み**＝`origin` に `refs/tags/v0.5.3`。release commit `5facdc8`／機能 commit `77252b8`(A/B front-form)・`5a82106`(C 受付日時列)・`9aadbe1`(D 手動予約 phone 必須)・docs `9ffdd40`）。`origin/main..main` 空＝**main も push 済み**。
- **readme.txt は 2026-09-10 に `Tested up to: 7.1` へ更新済み**（SVN **rev 3689785**・`trunk` と `tags/0.5.3` の両方・バージョン据え置き）。Plugin Check の `outdated_tested_upto_header` ERROR は解消。詳細は下記「🔎 Tested up to を 7.1 へ是正」。
- **readme.txt は 2026-09-09 に英語ソース化**（git `8ec3547` / SVN **rev 3687408**・`trunk` と `tags/0.5.3` の両方）。バージョンは **0.5.3 のまま据え置き**（新タグなし・配布物は無変更）。詳細は下記「📦 readme.txt と配布物の運用」。
- **⚠️ 未コミットの開発成果は現在なし**（v0.5.3 は公開・コミット済み）。作業ツリーは clean（未追跡 `docs/investigation/` を除く）。

### 公開履歴（WordPress.org SVN）
| バージョン | SVN rev | 公開日 | 概要 |
|---|---|---|---|
| 0.2.2 | 3592043 | 2026-07-01 | 初回公開（readme 日本語化 rev 3592054） |
| 0.2.3 | 3605460 | 2026-07-13 | 不具合修正（copy スコープ／Plain パーマリンク REST／メール可視化／ロゴ同梱／few_left 色） |
| 0.3.0 | 3608167 | 2026-07-15 | 店舗・担当者の呼び方／条件フィールド／住所フィールド |
| 0.4.0 | 3608375 | 2026-07-15 | 複数フォーム（最大10・スケジュール共有） |
| 0.4.1 | 3608476 | 2026-07-15 | ショートコード表示＋コピー |
| 0.4.2 | 3609790 | 2026-07-16 | カスタムフィールドのメール変数展開／キー任意化 |
| 0.5.0 | 3618165 | 2026-07-22 | フォーム別メール文面（グローバル既定＋上書き） |
| 0.5.1 | 3627795 | 2026-07-30 | 空き状況表示のカスタマイズ（しきい値／文言／色） |
| 0.5.2 | 3650270 | 2026-08-16 | 店舗・担当者の並び順の修正（新規は末尾採番／↑↓ で全件保存／表示順UI撤去） |
| 0.5.3 | 3650340 | 2026-08-17 | 予約フォームのバリデーション表示／文字数上限（電話20・氏名/メール255）／受付日時列を左から2番目へ移動／手動予約で電話必須 |
| **0.5.4** | **3690665** | **2026-09-11** | **条件フィールドの親 checkbox 問題（H4）の修正＝無言のデータ消失を停止。`CHANGELOG.md` を配布物に初同梱（31ファイル） ← 最新公開** |

（rev/日付の出典: `svn log`。0.2.2 は CLAUDE.md 記載値。）

**readme.txt のみの更新（版据え置き・新タグなし）**:
| SVN rev | 公開日 | 内容 |
|---|---|---|
| 3687408 | 2026-09-09 | readme.txt を英語ソース化 |
| **3689785** | **2026-09-10** | **`Tested up to: 7.0` → `7.1`**（検索結果に出ない実損の是正） |

### バージョン状態の確認手順（state.md を信じる前に実体を確認する）
```
git ls-remote --tags origin                      # push 済みタグ（例: refs/tags/v0.5.1）
cd ~/dev/smart-booking-svn && svn log --limit 5  # WordPress.org 公開履歴（"Release X.Y.Z ..."）
```
※ 教訓: 2026-08 に本ファイルの stale（「v0.5.1 未公開」）を信じて「未公開」と誤認し、不要なリリース準備作業（ZIP 再生成・実機検証・SVN 準備）を実施してしまった。以後、公開状態は上記2コマンドで実体確認してから着手すること。

### v0.5.3 バリデーション表示・文字数上限・受付日時列移動・手動予約の電話必須（公開済み・SVN rev 3650340・2026-08-17）
- **背景/スコープ（4件）**: 外部要望・仕様乖離への対応。①予約フォームで入力不備時に「予約内容の確認」ボタンが押せない理由が表示されない不具合（前回調査で確定＝エラー表示機構は `FormInput` に実装済みだが、`MainInputPage` 統合で `handleSubmit` が発火せずデッド化していた）。②電話番号欄に桁あふれ値が入力可能（DB `varchar(20)` 切り捨てリスク）。③予約一覧の受付日時列の位置。④手動予約 POST が電話未入力でも作成可能（仕様 §3.5 乖離）。
- **実装（採用方針は人間 GO 済み）**:
  - A（B-1 方式）: `FormInput.jsx` を `forwardRef`＋`useImperativeHandle` で `validate()` 公開、`handleSubmit` 本体を `runValidation()` に切り出して両経路で共有。`MainInputPage.jsx` は確認ボタンの `disabled` を撤去し常時 clickable、`handleConfirmClick` で `validate({ focus: 日時選択済み })`＋日時未選択ヒント。既存のエラー描画 JSX/CSS/aria-invalid/role=alert/focus を無改造で再利用。
  - B: `FormInput.jsx` の text/email/tel 入力に `field_key` 分岐で `maxLength`（customer_phone=20／customer_name・customer_email=255＝DB カラム長準拠）。カスタムフィールドは meta_value(text) 保存で切り捨てリスクなく対象外。
  - C: `ReservationTable.jsx` の thead/tbody を lockstep で移動＝受付日時を予約番号の直後（左から2番目）へ。9列対応維持。ソート・CSV・モバイルカードは不変。
  - D: `class-rest-reservations.php::create_item` に電話必須チェック追加（公開エンドポイントと同一 `smb_reservation_phone_required`/400）。`update_item` 不変＝**既存の空電話予約の編集はブロックしない**。形式・桁数検証はスコープ外。
- **検証（全 Green）**: 静的＝`php -l` OK・`npm run build` 成功・phpcs 変更PHP 0/0・eslint 変更3ファイル新規ゼロ。A 実機7ケース（必須空3・メール形式・電話桁数・日時ヒント・**全妥当→確認画面へ遷移**）＋focus 移動＋aria-invalid/role=alert 実測。B maxLength 実機確認（phone=20/name・email=255）。C 管理E2E **40 passed**（表/カード・フィルタ・承認/詳細/削除・CSV DL・**CSV ヘッダ不変**）。D REST 空→400／正常→200（id227）／既存空電話の更新→200（非ブロック）。**回帰ゲート**＝baseline(v0.5.2) 差分で**新規失敗ゼロ**（既存赤2件のうち `phase3-validation:116` は旧セレクタ更新で緑化、`phase9-redesign-flow:271` は起票）。既存 E2E の確認ボタン disabled 依存3テスト（`v030-conditional-fields`/`phase9-redesign-flow`/`phase3-flow`）を新挙動へ最小更新。
- **リリース（2026-08-17）**: 機能 commit `77252b8`(A/B front-form・6ファイル)・`5a82106`(C 受付日時列)・`9aadbe1`(D 電話必須)・docs `9ffdd40`(phase9 幅テスト起票)＋bump `5facdc8`（smart-booking.php/readme.txt/package.json）→ push・タグ `v0.5.3` → SVN 公開 **rev 3650340**（`Release 0.5.3: show inline validation errors on the booking form, add input maxlength ...`）。ZIP 187K・0.5.3・混入なし・trunk 変更は7ファイルのみ（frontend.js+asset／admin.js+asset／class-rest-reservations.php／smart-booking.php／readme.txt）。

### v0.5.2 sort_order 修正（公開済み・SVN rev 3650270・2026-08-16）
- **背景**: 店舗・担当者の並び順（sort_order）に採番・並び替えの不具合。**3症状を解消**（コード調査＋実機検証で確定）:
  ① 新規追加が `sort_order=0` で一覧最上段＝割当最優先になる → **作成時に末尾採番**で解消。
  ② 一覧の ↑↓ が DB に self/target の2行しか書かず、リロードで UI と DB が乖離（未タッチ行が 0 のまま浮上）→ **全件を1リクエストで永続化**して解消。
  ③ 店舗選択 OFF（既定）で新店舗を追加すると、デフォルト店舗（= sort_order 最小）が空の新店舗へ**サイレント切替**し予約枠が消失 → **末尾採番**で解消。
- **実装（7ファイル・+126/−22・DB変更なし・公開契約は追加のみ非破壊）**:
  - A: `class-rest-stores.php`／`class-rest-staff.php` の `create_item` に `MAX(sort_order WHERE is_system=0)+10` 採番（明示 `sort_order>0` は尊重／`update_item` 不変）。
  - B: `POST /stores/reorder`・`POST /staff/reorder` 新設（`{items:[{id,sort_order}]}`・`smb_{store,staff}_reorder_invalid`・戻り `{updated}`＝custom-fields の reorder 踏襲）＋`api.js` に `stores.reorder`/`staff.reorder`。
  - C: `StoresPage.jsx move()` を全件 reorder→成功時 `load()`（`FormSettingsPage.moveField` 同型）。
  - D: `StaffFormModal.jsx`／`StoreFormModal.jsx` から「表示順」入力を撤去（`sort_order` は payload 維持＝API 互換・編集で保全）。
  - E: `BasicSettingsTab.jsx` の店舗/担当者ステップ help に OFF 時挙動の3行目追記（店舗=先頭が既定・新規は末尾／担当=並び順先頭から自動割当）。
- **実機検証（wp-env・全 PASS）**: 検証1（新規→末尾 sort_order=50・最上段化なし）／検証2（全件0から中間スワップ1回→DB 全件 10/20/30/40/50 永続化・リロード後も並び不変）／検証3（店舗OFF＋新店舗追加でもデフォルト店舗＝既存店舗維持・予約枠消えず）。**予約フロー全4組合せ**（店舗 ON/OFF × 担当 ON/OFF）完走＋**選択肢の並び = sort_order 昇順（管理と一致・担当C<担当B の非自明順も一致）**＋予約が正しい店舗/担当に紐付き（#221〜#225）。デグレ確認: 編集で sort_order 保全・CSV 出力正常・カスタムフィールド並び替え無傷・単一店舗/担当者で従来動作。静的: `php -l` OK・phpcs 変更2ファイル 0/0・`npm run build` 成功。
- **リリース完了（2026-08-16）**: 機能 `614ef07 fix(stores-staff): 新規追加を末尾採番にし並び替えを全件保存する`（7ファイル）＋ bump `b1b4cbd chore(release): bump version to 0.5.2 + readme Changelog（店舗・担当者の並び順の修正）`（3ファイル）→ push・タグ `v0.5.2`（push 済み）→ SVN 公開 **rev 3650270**（`Release 0.5.2: fix store and staff ordering (append new entries to end, persist up/down reorder fully, remove display-order number input)`）。ZIP 30ファイル・182K・0.5.2・混入なし・reorder 同梱。疎通確認 Green（管理5ページ・編集モーダルに「表示順」なし・予約 #226 完走）。

### 次の課題（未着手・v0.5.3 公開後）
- **【v0.5.3 由来の技術的負債（別トラック）】**:
  - ① **フロント検証ロジックの二重実装**: `FormInput.validateField` と `MainInputPage.isFieldValid`（＋`EMAIL_RE`/`PHONE_RE`/`normalizeValue` の重複）。単一の検証源への統合はスコープ大につき今回見送り。将来のバグ源（今回の不具合もリデザインで配線が切れたことに長く気づけなかった）。
  - ② **`ReservationTable.jsx` の thead/tbody 二重管理**: 列定義が配列 map でなく直書き2本立てのため、列変更時に thead/tbody がズレるリスク（今回は lockstep 手動移動＋9列目視で対処）。カラム定義配列化のリファクタは別トラック。
  - ③ **サーバー側の電話番号形式・桁数検証の不在**: フロントのみで形式・桁数を検証。空チェックは v0.5.3 で `create_item` に追加したが、形式・桁数はサーバ未検証。既存データ（過去に保存された不正形式）への影響調査が必要なため別トラック。
  - ④ **`phase9-redesign-flow:271` CSS 幅テストの既存赤**: mobile(375px) で `.smb-front-main-page` 実測285px vs 期待≒327px。v0.5.2 baseline でも失敗するプリエグジスティング（私の変更と無関係）。テスト期待値と CSS のどちらが正かは未確認。詳細＝`docs/bugs/phase9-form-width-mobile-285px.md`。
- **集約モードのしきい値ヘルプ文言追記**（v0.5.1 GO 前調査で確認・軽微・非デグレ）: 「残りわずかのしきい値」は担当者非表示（既定）時、同一時刻の**全担当者を合算した総空き数**で判定される（`aggregate_by_timeslot()` が capacity/booked を合算）。設定ヘルプに「担当者を表示しない場合は全担当者の空きを合算した数で判定します」を明記すると誤解を防げる。v0.5.1 の判定自体は v0.5.0 と byte-identical（新規デグレなし）で、これは説明の改善。
- **メール通知の配信性（未決）**: 管理者宛のみ未達となる非対称（v0.4.2 報告2）はコード正常＝配信性（SPF/DKIM/DMARC・迷惑メール判定）の問題。切り分けは `docs/ops/email-deliverability.md`＋readme FAQ に集約済み。SMTP プラグイン案内など運用面の継続課題。
- **v0.2.3 由来の backlog（REST パーマリンク／ロゴ 等）**: KEISUKE 把握の未着手項目。テスト系の既知例＝`tests/e2e/phase6-visibility.spec.js` の `page_id=7` ハードコード（Plain パーマリンクで nonce 未 localize）を `FRONT_PAGE_PATH` 化する別件（過去 state 記載）。ロゴ関連の具体内容は本セッション未確認＝要 KEISUKE 確認。
## 🔎 Tested up to を 7.1 へ是正（2026-09-10／**WordPress.org 公開済み・SVN rev 3689785**）

**背景**: Plugin Check が `ERROR,outdated_tested_upto_header`（`Tested up to: 7.0` < 7.1）を出しており、**最新版で未テストのプラグインは WordPress.org のディレクトリ検索結果に表示されない**。実損が出続けていた。

**変更（1行のみ）**: `readme.txt` の `Tested up to: 7.0` → `7.1`。併せて `.wp-env.json` の `core` を `WordPress/WordPress#7.0` → `#7.1` に**恒久変更**（readme が主張するバージョンと開発環境を一致させるため）。**バージョン4箇所は 0.5.3 のまま据え置き・出荷コードの差分は 0 バイト・readme Changelog へのエントリなし**（2026-09-09 の readme 英語ソース化と同じ「メタデータのみ・版据え置き」運用）。

### WP 7.1 + PHP 8.3 での実測（2026-09-10）
- 有効化 / 無効化サイクル正常・**7テーブル維持**・`smart_booking_db_version` 0.5.3 不変・`wp core update-db` は「already at latest」。
- **E2E フルスイート 607 passed / 32 failed / 8 skipped / 65 did not run（2.7h・desktop + mobile）**。
- **★スイート全体を通して PHP notices / warnings / deprecations がゼロ★**（`WP_DEBUG_LOG` を一時有効化して実行 → `debug.log` が1バイトも生成されなかった。検証後に削除済み）。**これが「WP 7.1 で動作する」ことの最も強い証拠。**
- **Plugin Check: ERROR 1 → 0**（`readme.txt` が結果から消滅）。残る WARNING 7件は `.gitignore` / `.distignore` / `.claude` / `CLAUDE.md` / `tests/mu-plugins/*` のみ＝**配布 ZIP に含まれない開発成果物**で before と同一。

### 32件の赤は WP 7.1 起因ではない（判定手続きと結論）
⚠️ **前提の訂正**: 「前回セッションで記録した既存赤の一覧」は**存在しない**。ADR 0002 §5(2) と本ファイル該当節が記録しているのは**件数だけ**（before 32赤 / after 30赤 / 共通29件）で、テスト名の列挙はどこにも無い（§5(2) 自身が「既存赤29件が未台帳」と明記）。そのため**同一コードの WP 7.0 ベースラインを本セッションで実測し直して**突き合わせた。

| 集合 | 件数 | 内訳 |
|---|---|---|
| WP 7.1 フルスイート | 32赤 | — |
| WP 7.0 ベースライン（該当18ファイル） | 28赤 | 1.2h |
| 共通（既存赤） | **24件** | — |
| 7.1 のみ | 8件 | → 単独再実行で判定（下記） |
| **7.0 のみ**（7.1 では緑） | **4件** | 失敗集合が**双方向に揺れている**＝バージョン起因ではない決定的証拠 |

**7.1 のみ 8件の判定（WP 7.1 で spec 単独再実行）**:
- **6件が緑＝フレーク確定**: `phase2-form-settings:79` / `phase2-settings:703` / `phase4-email:345`・`:476` / `regression-settings-reflection:168` / `v050-form-mail-overrides:155`・`:299`。
- **残る2件は `phase6-visibility:171`（desktop / mobile）＝起票済みの既存赤**。失敗本文は `page.goto('/?page_id=7')` → `waitForFunction` 90秒タイムアウトで、`docs/bugs/phase6-visibility-flaky-page-id-7.md`（2026-07-14 起票・`page_id=7` ハードコード・当時 `git stash` ベースラインで再現済み）と**完全一致**。

> **★教訓（serial モードの落とし穴）★**: `phase4-email` / `phase6-visibility` / `regression-settings-reflection` / `v050-form-mail-overrides` の4ファイルは `mode: 'serial'` を宣言している。**1件落ちると後続は "did not run" になり、失敗一覧にも成功一覧にも現れない。** 7.0 で `phase6-visibility:171`(desktop) が緑に見えたのは `:102` が先に落ちた結果の did-not-run であって **passed ではなかった**。「失敗リストの差分」だけで既存赤/新規赤を仕分けると**この穴に落ちる**。ADR 0002 §3 が記録した「差分赤の正体は毎回1件出る wp-env タイムアウトがどこに当たったかの違い」と同型の現象。

**結論: WP 7.1 起因の新規失敗ゼロ。readme 更新の根拠として十分。**

### SVN 公開（完了・2026-09-10）
`svn ci -m "Update Tested up to for WordPress 7.1"` → **rev 3689785**。`trunk/readme.txt` と `tags/0.5.3/readme.txt` の**両方**を更新（新タグは作らず・バージョンは 0.5.3 据え置き・配布 ZIP は無変更）。commit 後 `svn status` は空＝clean。

**反映確認（実測）**: `svn cat` でリモートの `trunk` / `tags/0.5.3` とも `Tested up to: 7.1` を確認。プラグインディレクトリ API
（`https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=smart-booking`）が
`"tested":"7.1"` / `"version":"0.5.3"` / `last_updated 2026-09-10 10:59am GMT` を返すことを確認済み。
※検索インデックスへの反映にはさらに時間がかかる場合がある。

> **なぜ tags/0.5.3 も要るか**: WordPress.org は `trunk/readme.txt` の `Stable Tag` を読み、その値が指す `tags/X.Y.Z/` を参照してページを組む。`trunk` だけ更新してもページには反映されない（本ファイル「📦 readme.txt と配布物の運用」節）。

## 📸 ヘルプ画像 撮影基盤の新設（2026-09-09／4コミット・**push 済み**〈2026-09-10 実測で確認。旧記述「未push」は誤り〉）

**成果**: 公式サイト（`~/dev/smart-booking-website`）のヘルプ画像を wp-env の実画面から再現性のある形で自動撮影する基盤を新設。**出荷コードは全4コミットで無変更**（`includes/ src/ smart-booking.php uninstall.php readme.txt` の差分ゼロ）。

| commit | 内容 |
|---|---|
| `39d0297` | 撮影基盤の新設＋回帰スイートからの分離（13 files, +2282/-1） |
| `2401f09` | デモ店舗の sort_order 採番＋DB汚染の実測記録＋phase1 起票（4 files, +208/-10） |
| `faaef2c` | ヘルプ画像の正本をサイト側へ一本化・プラグイン側27枚を廃止（30 files） |
| `b03d27e` | 見切れ許容の根拠＋FormMailTab レース起票（2 files, +159） |

### 使い方
```
npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/screenshots/seed/screenshot-seed.php   # シード（冪等）
npm run screenshots                                                                                            # 撮影
npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/screenshots/seed/screenshot-purge.php   # 復帰（回帰前に必須）
```
出力先 `docs/website-screenshots/<slug>/NN-name.png`（gitignore 済みの生成物ステージング）。手順は `docs/website-screenshots/README.md`、判断根拠は `docs/decisions/0002-screenshot-spec-separation.md`。

### 撮影条件（既存27枚の実測に厳密一致）
**1280×720 / 72dpi（deviceScaleFactor 1）/ PNG / `fullPage:false` / 管理画面ロケール ja**。モバイル幅は撮らない（既存セットに1枚も無く、混在すると不揃いになるため）。更新通知バー等の環境ノイズは DB を変えず CSS 注入で抑止。

### 画像の正本＝サイト側 `content/help/images/`
プラグイン側 `docs/help/images/` の27枚は**廃止（削除済み）**。`docs/help/markdown/` 14本は残す（`src/frontend/utils/analytics.js:8` と `tests/e2e/gtm-datalayer.spec.ts:5` が `gtm.md` を参照）。**撮影結果をここへ戻さないこと**＝`docs/help/README.md` に明記済み。

### 撮影 spec を回帰スイートから分離した理由（実害3件・重要）
先代 `tests/e2e/help-screenshots.spec.js` は `playwright.config.js` の `testDir` 配下にあり、`npx playwright test` で回帰と一緒に走っていた。
1. **git 追跡下のバイナリを毎回上書き**（`docs/help/images/installation/01・02`）＝ `logic-evaluator.md` が定める `git stash` ベースのベースライン比較そのものを不安定化させていた。
2. 撮影シードが残った状態で回帰を回すと**実予約が最大2件注入**される（撮影した日だけ回帰が汚れる、最も気づきにくい相互汚染）。
3. 恒常的な赤2件＋dead 16件で、**撮影 spec が居る限り回帰スイートは構造的に絶対 Green にならなかった**。

→ `tests/screenshots/legacy/` へ退避（`R100`・内容差分ゼロ）。回帰ゲートは **Green**（before 32赤 / after 30赤、変更起因の新規失敗ゼロ）。DB汚染の実測影響は**「無し」**（唯一の曝露窓 `phase1.spec.js:53` は before/after 双方で赤・挙動不変、before 実行で実予約ゼロ）。

### ⚠️ 「新しい方が正しい」とは限らない（今回の教訓）
サイト側と md5 が相違した2枚（`installation/01・02`）は、当初「プラグイン側が stale」と判断したが**逆**だった。プラグイン側は WP7.0・サイト側は WP6.9.4 で、プラグイン側は**回帰スイートに上書きされた新しい汚染物**。新しい方を採っていたら、その2枚だけ世代の違う絵がマニュアルに混入していた。詳細は ADR 0002 §7。

### 未解決（人間判断待ち）
- 🟡 **`v050-form-mail-tab.spec.js:105`**: プロダクト実レースに起因する既存不具合（mobile 単独反復 5回中4回失敗）。**我々の変更起因ではなく回帰ゲートは Green**。`get_form_override()` が空 override を共通へフォールバックし REST が 400 で弾くためメール破損・データ汚染は起きない＝実害は「空欄プリセット＋原因不明の400」という UX 不具合。起票＝`docs/bugs/v050-form-mail-tab-common-template-race.md`。
- ✅ **`phase1.spec.js:53` の正本同期 — 解決済み（2026-09-10）**: 実テーブルは**7つ**（7番目は `smart_booking_forms`＝v0.4.0 で追加）で、**プロダクトは正常・`uninstall.php` は7つ DROP 済み・`readme.txt:153` は元から正しかった**＝陳腐化はテスト期待値と `docs/` 正本だけだった。`c4ea76f`（`phase1.spec.js` の `EXPECTED_TABLES` ＋ `phase1-uninstall.spec.js` の `toBe(6)`→`(7)` 2箇所・テスト名）／`79c1940`（`docs/smart-booking-spec.md:368` ・§5.11 ・§5.2 に `smart_booking_forms` 節を新設）で是正。**残るは `CLAUDE.md:65`「カスタムテーブル 6つ」のみ＝人間確認待ち。** 起票はクローズ済み（`docs/bugs/phase1-schema-expected-tables-stale.md`、決着記録は ADR 0002 §8）。
- 🟡 **`docs/help/markdown/` 13本の扱い — 推奨は (b)。未実施・人間 GO 待ち**: コードから参照されるのは `gtm.md` のみ。3案は ADR 0002 §7.5 に記載（(a) 13本削除 ／ (b) `gtm.md` を `docs/` 直下へ移し `docs/help/` 廃止 ／ (c) 現状維持＋警告）。**次セッションが同じ検討を最初からやり直さないよう、推奨と根拠を以下に残す。**
  - **推奨 = (b)**: `gtm.md` を `docs/gtm-datalayer-spec.md` へ移し、`docs/help/` を廃止する。**出荷コードのコメント1行に触るため人間承認必須＝未実施・GO 待ち。**
  - **根拠1（`gtm.md` は開発者向け仕様書ではない）**: `title` / `description` / `order: 13` / `slug` の front matter を持つ**サイトビルド用のエンドユーザー向けヘルプ記事**で、本文の大半は GTM 管理画面の操作手順。これを「出荷コードの同期先」として `docs/help/markdown/` に置いている構造自体が実態と合っていない。
  - **根拠2（実測・2026-09-10）**: サイト側 `~/dev/smart-booking-website/content/help/markdown/` は **15本**、プラグイン側は **14本**。**サイト側にしかないのが `forms.md`**（v0.4.0 複数フォームのヘルプ）＝今回是正した「`forms` テーブルが仕様書に無い」のと**同じ取り残され方**をしている。md5 比較では 14本中 **7本が相違**（`booking-form` / `custom-fields` / `design` / `email` / `index` / `installation` / `reservations`）、いずれもサイト側が新しい（ADR 0002 §7.5 の実測記録）。**唯一の被参照ファイル `gtm.md` は現時点で md5 一致**＝差分吸収が不要で、**動かすなら今**。
  - **根拠3（(a) を採らない理由）**: 13本を消しても、**出荷コードがサイト側正本のコピーを指すという構造そのものは温存される**。名前（`help/markdown`）と実態（GTM 仕様1本）の乖離も残る。
  - **根拠4（(c) を採らない理由）**: `forms.md` の欠落が「**警告文だけでは乖離が増え続ける**」ことの実証になっている。
  - **構造評価**: `src/frontend/utils/analytics.js:8` の参照は「**正本がリポジトリ外（別リポジトリ）にある文書の、リポジトリ内 stale コピー**」を指しており妥当でない。かつ規範的内容（event 名 × `booking_step` 値の表）は `analytics.js:9`〜`:17` と `tests/e2e/gtm-datalayer.spec.ts:6`〜`:7` に**インラインで完結**しており、テストは md ではなく**実挙動に assert** している。＝**この md 参照は何も担保していない。**
  - **代替案の評価**: **コード内定数化は消費者が1箇所しかなく YAGNI 違反。** **サイト側へ一本化（リポジトリ側に記録を残さない）は不可** — dataLayer の event 名は GTM トリガー条件として**ユーザーのタグ設定に焼き込まれる事実上の公開契約**であり、リポジトリ側に記録が無いと改名を止められない。
  - **(b) の具体差分**: `src/frontend/utils/analytics.js:8`（**出荷ソース・1行**）と `tests/e2e/gtm-datalayer.spec.ts:5`（テスト・**配布物には入らない**）のコメント参照先を `docs/gtm-datalayer-spec.md` へ差し替えるだけ。`grep -c "docs/help/markdown" build/frontend.js` は **0**（production ビルドがコメントを除去）ゆえ**配布物は byte-identical になる見込み**だが、実施時は `npm run build` 前後の md5 突き合わせで**実証**すること。
  - ⚠️ **落とし穴**: `docs/help/README.md` を削除すると、**§2 の「撮影結果を `docs/help/images/` へ戻すな」という重要警告が失われる**（ADR 0002 §7.4 実害②の再発防止）。`docs/website-screenshots/README.md` か ADR 0002 へ**移設**すること。
  - 補足: `docs/help/` を指す参照はもう1件ある＝`tests/screenshots/legacy/help-screenshots.spec.js:2`・`:7`（`docs/help/images/`）。これは出自の記録として**無編集保存が意図**で実行対象外（`testIgnore: '**/legacy/**'`）のため、(b) の差し替え対象には含めない。
- **`店舗1` の見切れ**: 撮影で下端に約90px 残る。`phase6-visibility.spec.js:118` が「sort_order 最小の店舗1 が自動選択される」ことを前提とするため sort_order 退避は見送り＝**見切れ許容**（根拠は `docs/website-screenshots/README.md`）。削除は不可（`phase3-helpers.js:62-72` が id=2 を基線として再INSERT する load-bearing fixture）。
- 🟡 **`docs/bugs/phase1-uninstall-no-fixture-restore.md`（2026-09-10 起票）**: 破壊的スイート `phase1-uninstall.spec.js` が実行後に **E2E 基線フィクスチャ（store/staff `id=2`）を復旧しない**。戻るのはテーブル構造と Activator の seed（`id=1` のみ）だけ。破壊的 spec の直後に `restoreSnapshot()` を持たない自前シード系 spec を回すと**誤った赤**が出る。今回フィクスチャが戻ったのは後続 spec が偶然 `restoreSnapshot()` を走らせたからで、**設計ではなく偶然**。修正案＝`test.afterAll` で `phase2-helpers.restoreSnapshot()` を呼ぶ／運用手順の明文化。**修正は GO 待ち。**
- 🟡 **`docs/bugs/spec-schema-columns-stale.md`（2026-09-10 起票）**: `docs/smart-booking-spec.md` §5.2 が実装と**カラムレベル**で乖離（不足6件・4テーブル＝`stores.is_system` / `staff.is_system` / `reservations.form_id` / `custom_fields.form_id`・`condition_field_key`・`condition_value`）。テーブル数の陳腐化と**同一原因**で、テーブル数はその氷山の一角だった。ドキュメントのみ・ユーザー影響ゼロ。**是正は GO 待ち**（spec は凍結された正本）。
- 🔴 **`docs/bugs/condition-parent-checkbox-silent-data-loss.md`（2026-09-10 起票・最優先）**: 条件フィールドの親を後から `checkbox` に変更すると、**ユーザーが入力した子フィールドの回答が無言で消える**。フロント `fieldConditions.js:27-38` は `String(["希望する"]) === "希望する"` で**子を表示し確認画面にも出す**が、サーバー `class-rest-public.php:820-833` の `condition_met()` は配列を不成立扱いにし、`:994` で**必須チェックを素通り**させ `:1192` で**meta 行を書かない**。予約は正常完了するため誰も気づけない。原因は「親は radio/select のみ」という invariant が**子側（`class-rest-custom-fields.php:233`）からしか守られておらず、親自身の種別変更に裏口が開いている**こと。**推奨＝案3（`update_item` にガード＋管理UIで種別セレクタ disabled。`isAlreadyParent` は `CustomFieldModal.jsx:189` に既存）＋案1（フロントで配列を不成立に揃え既存被害を停止）。案2（サーバーで配列許容）は機能追加＝仕様書改訂が必要なため非推奨。** ⚠️ 失われた回答は meta 行が存在しないため**復旧不可**。**修正は GO 待ち。**
- 📋 **`docs/plans/v0.5.4-release-plan.md`（2026-09-10 起票）**: 上記 H1/H2/H4 を**1本のパッチリリースに束ねる**作業計画。各項目の変更範囲・ビルド要否・仕様書要否・依存順・ゲート・リリース手順を記載。**D（H4）が最優先で、D だけ先行させる判断もありうる**旨を明記。**実装は GO 待ち・コードは未変更。**
- 🟡 **`docs/bugs/mail-var-schedule-time-desc-stale.md`（2026-09-10 起票）**: `{schedule_time}` の説明が管理画面・仕様書とも「例: 14:00〜」だが実出力は「14:00〜15:00」。**ヘルプ（サイト側）が正・管理画面が誤**の逆転。変更は2行（`TemplateVariableHelper.jsx:15` ＋ `smart-booking-spec.md:596`）だが `build/admin.js` にバンドル済みのため**リリースを伴う**。**修正は GO 待ち。**
- 🟡 **`docs/bugs/mail-admin-off-store-empty-silent-skip.md`（2026-09-10 起票）**: 管理者トグル OFF ＋ 店舗メール未設定で、担当者メールがあっても管理者系通知が `class-email.php:123` で完全無言に抑止される（transient 記録も無いため警告バナーも出ない）。UI 文言3箇所（`MailSettingsTab.jsx:363`・`:422`／`StaffFormModal.jsx:141`）が逆のことを述べている。**推奨＝案A（文言是正）＋案C（無言 skip の可視化・スコープ付き）。案B（担当者を To へ昇格）は非推奨**＝既存サイトの通知先を無操作で変え、仕様書 §8.2「担当者＝CC」から逸脱するため。⚠️「ADR/起票に3案が記載済み」という前提は誤りで、**そのような記録は存在しない**（本起票で新規に整理）。**修正は GO 待ち。**
- **既存赤29件が未台帳**／**E2E の `npx wp-env run cli` 由来 ETIMEDOUT フレーク**（`retries: 1` 等で解消可）。

### 次の一手 → **2026-09-11 に実施済み**（下記「📸 ヘルプ画像 フェーズ2」節）
実カット 27 枚を撮影し、`docs/website-screenshots/` に出力済み。サイト側へのコピーは未実施（人間の判断待ち）。

---

## 🗂 スキーマ「テーブル数」の陳腐化を是正（2026-09-10／5コミット・**push 済み**〈2026-09-10 実測で確認。旧記述「未push」は誤り〉）

**確定結論**: 実テーブルは **7つ**。**プロダクトは正常**だった（`class-activator.php::create_tables()` が7つ dbDelta ／ `uninstall.php:32`〜`:38` が7つ DROP ／ `readme.txt:153` は元から "seven"）。**陳腐化していたのはテスト期待値と `docs/` 正本だけ。** 詳細は `docs/bugs/phase1-schema-expected-tables-stale.md`（クローズ済み）と ADR 0002 §8。

| commit | 内容 |
|---|---|
| `c4ea76f` | テスト期待値＝`phase1.spec.js` の `EXPECTED_TABLES` に `forms` 追加＋`toBe(6)`→`(7)` を2箇所（`phase1-uninstall.spec.js` の U-1／U-3） |
| `79c1940` | 正本 spec＝`docs/smart-booking-spec.md:368`・§5.11・§5.2 に `smart_booking_forms` 節を新設 |
| `e935c72` | ADR 0002 §8 追記・bug ledger クローズ・state 更新 |
| `480d110` | `CLAUDE.md:65` を「7つ」へ（**人間が直接実施**） |
| `53ad2a0` | `phase1-uninstall-no-fixture-restore.md` 起票 |

**すべてローカル・未 push。** 出荷コードの差分は **0バイト**。

なお §5.2 は**カラムレベルではまだ乖離が残っている**（不足6件）＝`docs/bugs/spec-schema-columns-stale.md`。**是正は GO 待ち。**

### 回帰ゲート = 🟢 GREEN（logic-evaluator 判定）
- `phase1.spec.js` の 1-1: **before 2 failed / 54 passed → after 56 passed**（desktop＋mobile）。
- 破壊的スイート `playwright.uninstall.config.js`: **U-1 / U-2 / U-3 の 3 passed**。
- 環境健全性サンプル `phase2-settings` ＋ `phase3-flow`: **79 passed / 1 failed**。その1件は `loginAsAdmin` の `TimeoutError` で、**単体反復 2/2 pass ＝インフラフレークと確定**（新規赤ゼロ）。
- eslint 0。

### 絞り込みの根拠（次回の再利用のため重要）
**フル2周（前回5時間超）に対し、実測 約16分で同等の判定精度**を得た。根拠は次の3点を**2者独立に実測**したこと。

1. 出荷コード差分が **0バイト**（`git diff -- includes/ src/ uninstall.php smart-booking.php readme.txt` が空）
2. 変更は**テスト2ファイル＋md 4ファイルのみ**
3. **markdown を実行時に読むコードは存在しない**

→ 結果が変わりうる spec は原理的に `phase1.spec.js` と `phase1-uninstall.spec.js` の**2本のみ**。**Plugin Check / phpcs / build は出荷コード差分ゼロを根拠に省略**（入力が不変なら検査結果も不変）。

### evaluator が見ていない範囲（正直な開示）
- 全56 spec 中 **4本のみ実行**。
- **既存赤29件との全数突き合わせは未実施。**
- **隔離ゲート未実施**（スケジュールのコピー・削除に触れないため対象外と判断）。
- **メール検証未実施。**

### 教訓
スキーマ追加時、「dbDelta 定義追加 ＋ `smart_booking_db_version` bump」だけでは**不足**。ADR 0002 §8.5 の3点セット（spec §5.2 ＋ §5.11 ／ `phase1.spec.js` の `EXPECTED_TABLES` ＋ `phase1-uninstall.spec.js` の件数アサーション ／ `uninstall.php` の DROP 文）を**同時更新**すること。`uninstall.php` だけが唯一漏れていなかったのは「消し忘れるとユーザーの DB にゴミが残る」という実害が見えるからで、**実害が見えにくいテストと仕様書こそ漏れる。**

---

## 📦 readme.txt と配布物の運用（2026-09-09 追記）

### readme.txt は英語ソース／日本語は GlotPress から供給する
- **2026-09-09: readme.txt を英語ソース化**（git `8ec3547` → SVN **rev 3687408**）。WordPress.org のプラグインディレクトリは**英語をベース言語として翻訳を扱い**、日本語表示は translate.wordpress.org（GlotPress）の ja 翻訳から出す。readme.txt を日本語で書くと「英語でもなく翻訳もされない」状態になるため、**日本語は今後 GlotPress の ja 翻訳から供給する**方針に変更した。
- **日本語原稿は `docs/readme-ja.md`**。v0.5.3 時点（commit `5facdc8`）の Installation / FAQ / Screenshots / External services / Changelog / Upgrade Notice を**無改変**で保存したもの。GlotPress へ ja 翻訳を投入する際の原稿なので**1文字も書き換えない**こと。
- **全リリース履歴は `CHANGELOG.md`**（リポジトリ直下・日本語・全13版）。readme.txt の Changelog は**直近3バージョンのみ**に絞り、末尾から GitHub の CHANGELOG.md へリンクする。
- **`== Upgrade Notice ==` セクションは 2026-09-09 に削除した**。このセクションで表示されるのは更新先バージョンの項目のみで、旧版（0.2.3 / 0.2.0 / 0.1.0）は今後永久に表示されない。かつ日本語ソースは GlotPress の翻訳対象を無駄に増やす。**必要になるのは破壊的変更を伴うリリース時のみで、そのとき該当バージョンの項目だけを英語で1つ足せばよい。**
- **git と SVN の readme.txt は md5 一致を維持する運用**とする。現在の一致値 `8ec8d9b3934ea415f6870d87ae26b800`（2026-09-10 の Tested up to 7.1 反映後。それ以前は `14f48486fe6bc23a076f6194bae0a589`）（`~/dev/smart-booking/readme.txt` ＝ `trunk/readme.txt` ＝ `tags/0.5.3/readme.txt` の3ファイル）。片方だけ直すとドリフトするので、SVN 更新後は必ず git 側へ `cp` して md5 で突き合わせる。

### ⚠️ readme.txt だけの更新でも trunk と tags/X.Y.Z の両方が要る
WordPress.org は **/trunk/readme.txt の `Stable Tag` を読み、その値が指す `/tags/X.Y.Z/` を参照して**公開ページを組み立てる。`Stable Tag: 0.5.3` かつ `tags/0.5.3/` が存在する状態では、**trunk だけ更新してもページには反映されない**。readme.txt のみの修正であっても `trunk/readme.txt` と `tags/X.Y.Z/readme.txt` の**両方**を更新すること（このとき新しいタグは作らず、バージョンも据え置く）。

### ⚠️ `.distignore` は `wp-scripts plugin-zip` では効かない
- 配布 ZIP の内容を決めているのは **`node_modules/@wordpress/scripts/scripts/plugin-zip.js` のホワイトリスト glob**（`package.json` に `files` フィールドが無い場合に通る分岐）:

  ```
  admin/**  build/**  includes/**  languages/**  public/**
  smart-booking.php  uninstall.php  block.json
  changelog.*  license.*  readme.*        ← caseSensitiveMatch: false
  ```

- **`docs/` が ZIP に入らないのは、このリストに無いから**であって `.distignore` の効果ではない。`.distignore` に何行足しても `plugin-zip` は読まない（「`.distignore` に書いたのに ZIP から消えない」という混乱を防ぐこと）。
- **`.distignore` が効くのは `wp dist-archive`（WP-CLI）を使う場合のみ。**
- 副作用として **`CHANGELOG.md` は `changelog.*` にマッチするため ZIP に同梱される**。2026-09-09 にこれを是認した（古い changelog を別ファイルへ逃がすのは WordPress.org 推奨の慣例であり、`changelog.*` がホワイトリストにあるのはそのため。ディレクトリが解析するのは readme.txt のみで、CHANGELOG.md が日本語でもページの言語には影響しない）。次リリースの ZIP は 30 → **31 ファイル**になるのが正常。

## v0.5.1 機能追加: 空き状況表示のカスタマイズ（実装・検証 完了／ローカル・未push・2026-07-29）

- **ブランチ `feat/v051-availability-display`（main=v0.5.0 から分岐・push なし・SVN 未操作）。バージョンは 0.5.0 据え置き**（bump/Changelog/readme はリリース準備タスクで別途）。仕様正本 `docs/spec-amendment-v051-availability-display.md`（v0.5.1 の生きた仕様。実装中に2度確定更新＝下記）。**DB 変更なし・option 追加のみ・公開契約は追加のみ非破壊・マイグレーションゲート不変**。
- **背景**：外部要望「今2件で『残りわずか』になるが1件で表示したい」。汎用化してしきい値・文言・色を管理者が設定可能に。**初期値はすべて現行と同一＝既存ユーザーの表示は1文字・1色も変わらない**（デグレ最重要）。
- **実装前の重要発見と確定（人間 GO 済み）**:
  - **しきい値**：現行の「残りわずか」判定は固定3ではなく**複合式**（`空き<=2 または 空き<=ceil(定員*0.3)`）だった（`class-rest-public.php::get_availability()` の通常/担当者統合の2箇所）。人間判断で **Option B** 確定＝**未設定（空欄）は現行複合式を byte-identical で維持／1〜99 明示時のみフラット判定 `空き<=しきい値`／0・負数・不正は未設定（自動）にフォールバック**。判定は共通ヘルパー `get_few_left_threshold()`（1〜99 or null）に集約し2箇所＋/public/settings で共用。仕様書「1. しきい値設定」を確定内容に訂正（誤記「固定3」→複合式）。
  - **色**：現行は単色でなく多階調パレット（警告=border #fbbf24＋薄背景 #fffbeb＋バッジ #fef3c7/#92400e、満席バッジ=赤 #fee2e2/#991b1b）。ux 指摘（単一色だと border/文字だけ変わりクラッシュ）を受け、人間判断で**単一設定色から App.jsx が陰影を導出して全面追従**（既存の CSS 変数注入に乗せる＝独自機構は作らない）方式に確定。仕様書「3. 色設定」に追記。
- **コミット（依存順・main..HEAD）**:
  - `9965284`(main) 仕様追補追加／`5ca2b61`(main) v0.5.0 公開反映の state 訂正／`eda845c` しきい値確定仕様／`7858ff1` 色確定仕様。
  - `c0c2d86` backend（option6・ヘルパー集約・複合式 byte-identical 維持・/public/settings フォールバック集約・whitelist・activator・uninstall）。
  - `c86c28f` フロント＋管理UI（TimeSelect/DateSelect 文言を settings 由来化＝バッジ＋aria-label 反映・CSS 色変数化・基本設定タブ「空き状況の表示」＝しきい値+文言3・ThemeColorPicker に色2）。
  - `ac36167` 新規E2E 2本（v051-threshold／v051-labels）。
  - `ef0103d` fix(ux): 色を陰影導出で全面追従（陰影トークン5変数追加・App.jsx mix 導出・満席赤バッジ含め設定時は統一・軽微 help/注記）。
  - `6f4fcac` fix(ux): 色既定値の**センチネル化**（activator が既定 hex を seed＝実運用で常に導出パスを通り few_left 可視シェードが微ズレ→デグレ。設定色が既定色/空/不正なら removeProperty で CSS 既定に戻す＝byte-identical。カスタム色のみ導出）。
- **設定キー（option・/public/settings 応答キー）**: しきい値 `smart_booking_few_left_threshold`（応答 `few_left_threshold` 0=自動・フロント非消費）／文言 `smart_booking_label_few_left`/`_full`/`_closed`（応答 `label_*`・20字切詰＋空→既定）／色 `smart_booking_color_availability_warning`/`_disabled`（応答同名・不正/空は ''→CSS 既定）。フロント色 CSS 変数 `--smb-front-color-availability-warning`(#fbbf24)/`-warning-soft`(#fffbeb)/`-warning-badge-bg`(#fef3c7)/`-warning-badge-fg`(#92400e)/`-disabled`(#6c757d)/`-disabled-badge-bg`(#fee2e2)/`-disabled-badge-fg`(#991b1b)。
- **検証（logic-evaluator／ux-evaluator 独立判定・全 Green）**:
  - **A 静的**: build 0エラー／php -l 4/4／phpcs 変更ファイル ERRORS 0（WARNINGS は既存方針の整形ドリフト）／**Plugin Check 配布スコープ 0/0**。
  - **B デグレ最重要**: しきい値未設定で `get_availability` 出力が **main(v0.5.0) と byte-identical**（通常＋担当者統合の両モード・全 capacity／worktree 差替えで同一フィクスチャ比較）。色は seed 済み既定状態で **computed style が v0.5.0 実値ちょうど**（#fffbeb/#fbbf24/#fef3c7/#92400e/#6c757d 等・センチネル修正後）。
  - **C 機能**: しきい値=1→空き1のみ few_left（空き2は通常）／明示3→フラット／文言反映（表示+aria）＋空→既定＋20字切詰／色カスタム（青/紫）で薄背景・バッジ・文字が整合追従（クラッシュ解消）／不正値（0/-1/abc/150→自動・色 #zzz→''）。新規E2E v051-threshold/v051-labels pass。
  - **D 回帰＋隔離**: 触った経路の既存 E2E（phase3-flow desktop 13＋mobile 13・few-left-visual-repro mobile 3・regression-settings-reflection 5・phase2-settings 27 ほか計61）で**新規失敗ゼロ**。管理画面 `ScheduleList`(20%式) 等は新 option 非参照・不変（隔離 Green）。
  - **UX（独立判定・実機 desktop/mobile）＝最終 Green**。ux 指摘（🟡色部分適用クラッシュ→陰影導出で解消／🔴色 byte-identity 破れ→センチネルで解消／🟡モバイル長文言→help に推奨字数）を全解消。🔵（プレビュー非対応・不正値フィードバック等）は軽量 help/注記で対応。
### v0.5.1 リリース準備：ローカル完了（2026-07-30・commit `2ac5547`・push なし）
機能実装＋検証＋handoff の上に、リリース bump を別コミット `2ac5547` で積んだ。**残りは人間 GO の不可逆操作のみ**（下記「v0.5.1 次の一手」）。
- ✅ **バージョン4箇所を 0.5.1 に一致更新**（smart-booking.php Version / SMART_BOOKING_VERSION / readme.txt Stable tag / package.json）。grep 4/4 一致実証・smart-booking.php／package.json に 0.5.0 残存ゼロ（readme は Changelog 履歴の 0.5.0 のみ）。
- ✅ **readme Changelog に 0.5.1 追記**（`= 0.5.1 - 2026-07-17 =`・空き状況表示のカスタマイズ＝しきい値／文言3／警告色・無効色・既存エントリ不変・readme 慣習の書式）。**External services は本件で外部通信の追加なし＝不変**（Google/ChatWork/zipcloud・目視確認）。
- ✅ **★マイグレーションゲート無害 実証★**（logic-evaluator 独立判定）：本リリースは DB スキーマ変更なし（option 追加のみ）。SMART_BOOKING_VERSION 0.5.0→0.5.1 で、db_version=0.5.0 環境の admin cookie 付き実HTTP `GET /wp-admin/`→admin_init→maybe_upgrade が1回発火するが全バージョンゲート（0.2.0/0.2.3/0.3.0/0.4.0/0.5.0）が false ＝**スキーマ副作用ゼロ**（7テーブル `SHOW CREATE TABLE` md5 不変・schedules UNIQUE(store_id,staff_id,schedule_date,start_time)／custom_fields UNIQUE(form_id,field_key) 不変）、**唯一 db_version が 0.5.1 へ前進**、2回目 GET は非発火（冪等）。v0.4.1/v0.4.2 と同型。
- ✅ **build 成功＋ZIP 検証**（`npx wp-scripts plugin-zip`・gitignore 済み・非コミット）：**30 ファイル**（v0.5.0 と同数＝**増減ゼロ**。v0.5.1 は build/admin.js バンドル＋既存 PHP＋readme＋バージョン文字列に収まり新規出荷ファイルなし）。docs/src/tests/node_modules/.DS_Store/.git/package.json/*.zip/credentials/.claude 混入ゼロ・ZIP 内 smart-booking.php Version／SMART_BOOKING_VERSION／readme Stable tag／Changelog が 0.5.1 同梱を実証。
- ✅ **Plugin Check 配布スコープ 0/0**（検出は全て .distignore 除外の dev 成果物）・php -l 26/26・phpcs 変更ファイル ERRORS 0/WARNINGS 0。
- ✅ **スモーク**（基本/投稿名 両パーマリンク）：admin 5ページ boot・v0.5.1 表示・BUG-A デグレなし・フロント予約完走・**空き状況デフォルト挙動が v0.5.0 と同一**（`few_left_threshold=0`＝自動＝複合式・文言 残りわずか/満席/締切・色 #fbbf24/#6c757d）。
- ✅ **E2E**：新規 `v051-threshold`/`v051-labels` **6/6**（desktop+mobile）＋touched（phase3-flow 26/26・few-left-visual-repro＋regression-settings-reflection＋phase2-settings 70/70）＝**新規失敗ゼロ**。既知 stale は非ブロック。

- **v0.5.1 次の一手（すべて人間 GO・不可逆）**: ①レビュー ②main マージ / `git push` / `git tag v0.5.1` ③SVN（`~/dev/smart-booking-svn`）trunk 反映 + `tags/0.5.1` + `svn ci` で WordPress.org 公開（Claude は認証情報を扱わない）。ZIP は `npx wp-scripts plugin-zip` で再生成可能。**ローカルのバージョンは 0.5.1 に更新済み**（リリース準備完了）。**併せて main のローカル未 push 2コミット（`9965284`/`5ca2b61`）も push 対象**。

## v0.5.0 機能追加: フォーム別メール文面（実装・検証 完了／ローカル・未push・2026-07-22）

- **ブランチ `feat/v050-form-mail-overrides`（main=v0.4.2 から分岐・push なし・SVN 未操作）。バージョンは 0.4.2 据え置き**（bump/Changelog/Stable tag/readme はリリース準備タスクで別途）。仕様正本 `docs/spec-amendment-v050-form-mail-overrides.md`（main に `1713167` でコミット済み。spec 本体は非編集）。
- **背景**：外部要望「フォームによって変数（カスタムフィールド）が異なるため、フォーム別にメール文面を変えたい」。設計＝**グローバル既定＋フォーム別オーバーライド**。共通「設定＞メール通知」は既定として維持し、フォーム×メール種別（受付ユーザー宛／受付管理者宛／承認ユーザー宛）ごとに独立トグルで専用件名・本文を上書き。**初期状態は全 OFF＝既存挙動と1文字も変わらない**（デグレ最重要）。差出人はフォーム別にしない（共通のまま）。
- **コミット（依存順・7本／main..HEAD）**:
  - `dc1f891` DB: `smart_booking_forms` に `mail_overrides longtext NULL` 追加。`create_tables()` の forms CREATE TABLE に列追加＋`run_migrations()` に 0.5.0 ゲート（`version_compare($current,'0.5.0','<')` で `create_tables()` 再適用＝dbDelta 冪等で欠損列のみ ADD）。**SMART_BOOKING_VERSION は 0.4.2 据え置き**（db_version 上限 0.4.2・0.5.0 ゲートは再有効化のたび発火＝冪等。リリース時に 0.5.0 へ bump するとゲートが閉じる＝v0.4.0 と同型）。列追加は冪等ゆえ readiness cap 不要・既存 db_version 確定ロジック無変更。uninstall.php は forms を含む7テーブル DROP 済み（変更不要）。
  - `16fba31` 送信解決＋REST: `class-email.php` に `resolve_template()`/`get_form_override()`。予約 form_id→`SELECT mail_overrides FROM ..._forms WHERE id=%d`→該当種別 enabled かつ件名・本文とも非空なら専用、それ以外は**共通 option を無加工パススルー**（＝全 OFF は現行と byte 一致）。判定は resolve_template の1箇所に集約。send_receipt が reception_user/reception_admin、send_approval が approval_user。削除フォームの予約は override 行ごと消えて自然フォールバック。カスタム変数展開は既存 `Reservation_Context::render()` が予約 form_id スコープで自動適用（追加実装なし）。`class-rest-forms.php`：`format_row` に mail_overrides の正規化形（常に3種別 `{enabled,subject,body}`）を **additive** 追加（GET list/single・UI hydrate 契約）。`update_item` を**部分更新化**（name/mail_overrides 独立・両省略 400 `smb_form_no_fields`）。`enabled=true` は件名・本文必須（`smb_form_mail_override_incomplete`/400）、非配列 `smb_form_mail_overrides_invalid`/400。件名=`sanitize_text_field`・本文=`wp_kses_post`（既存メールと同一基準）。OFF でも文面保持（再ONで復活）。
  - `0eea138` 管理UI: FormSettingsPage にタブ（**フィールド設定／メール の2つ**）を新設。セレクタ＋ショートコードは共有ヘッダ。**テーマタブは追加せず**（テーマは v0.4.0 で設定→デザインに集約済み＝仕様ワイヤーの古い認識を現行構成に整合）。`?smb_tab=mail`/`?smb_form=<id>` ディープリンク対応。新規 `FormMailTab`（3種別独立トグル・ON で共通テンプレ複製プリセット・OFF は薄色プレビューで文面保持・変数ヘルパーは選択中フォームの変数のみ）。共通側（設定→メール通知）に「○○フォームは専用文面を使用中」注記＋メールタブ導線。重複排除で `utils/mailVariables.js`（buildFormVariables）と `settings/MailBodyField.jsx`（BodyFieldWithHelper 抽出）を新設し MailSettingsTab/FormMailTab で共有（挙動不変）。
  - `829ac3d` test: 新規 E2E 2本（`v050-form-mail-overrides.spec.js`＝pre_wp_mail 出し分け／`v050-form-mail-tab.spec.js`＝タブUI）。
  - `37e3bb3` fix(ux): ux-evaluator 1回目指摘反映（🔴未保存破棄防止の ConfirmDialog＋dirty 検知／🔴共通側リンクに smb_form 付与／🟡保存前に種別名で未入力検証）。
  - `c7c79dd` fix(ux): 2回目指摘（🔴改名/フォーム追加が loadForms の formsLoading で FormMailTab をアンマウント→未保存破棄）。メールタブのマウント条件から `!formsLoading` 除去＋保留アクションを単一 `pendingAction` に統一し guardMailDirty で追加もガード（改名は非ガード＝アンマウントしないので保持）。
  - `a7d3ac7` fix(ux): 3回目指摘（🔴フォーム追加ガードで破棄確定→モーダルcancel すると mailDirty が失効しサイレント消失）。mailDirty の手動リセットを全廃し `FormMailTab` の onDirtyChange を単一情報源に（アンマウント時 false 通知の cleanup 追加）。
- **検証（logic-evaluator／ux-evaluator 独立判定・全 Green）**:
  - **A 静的**: build 0エラー／php -l 20 OK／phpcs 配布スコープ ERRORS 0・WARNINGS 0／**Plugin Check 配布スコープ 0/0**（検出は全て .distignore 除外の dev 成果物）。
  - **B 実挙動（pre_wp_mail 捕捉）**: ①B受付ユーザー専用ON→B予約は専用文面＋B変数展開／A予約は共通、②同予約の管理者宛は共通（種別独立）、③承認専用ON→専用文面、④OFF→再ON で文面復活、⑤フォーム削除後の承認→共通、⑥**★全OFF が共通 option render と byte 一致★**。
  - **C マイグレーション**: mail_overrides 列 DROP＋db_version=0.4.2 から 0.5.0 ゲート発火→列追加（longtext NULL）。他6テーブル `SHOW CREATE TABLE` md5 不変・schedules/custom_fields の UNIQUE 不変。2回目 no-op（冪等）。
  - **D 回帰＋新規E2E**: 触った経路の既存スイート 23/23（v040-forms-crud 改名含む・phase4-email 5/5 メールデグレ無し・v042-mail-custom-fields 2/2・phase2-form-settings 10/10 他）＝新規失敗ゼロ。新規 E2E `v050-form-mail-overrides` 4/4・`v050-form-mail-tab` 2/2。既知 stale（phase3/6/7/9 系）は非ブロック。
  - **UX（ux-evaluator 独立判定・実機 desktop/mobile）＝最終 Green**。指摘 🔴3件（未保存破棄／共通側リンク smb_form 欠落／フォーム追加ガードのサイレント消失）は上記 fix で全解消・回帰なし・誤発火なしを実機再確認。🔵1＝wp-env の共通メール option に旧検証セッション由来の非デフォルト値残存（コード無関係・配布物無影響）。
### v0.5.0 リリース準備：ローカル完了（2026-07-22・commit `533f620`・push なし）
機能実装7コミット＋handoff の上に、リリース bump を別コミット `533f620` で積んだ。**残りは人間 GO の不可逆操作のみ**（下記「v0.5.0 次の一手」）。
- ✅ **バージョン4箇所を 0.5.0 に一致更新**（smart-booking.php Version / SMART_BOOKING_VERSION / readme.txt Stable tag / package.json）。grep 4/4 一致実証・smart-booking.php／package.json に 0.4.2 残存ゼロ（readme は Changelog 履歴の 0.4.2 のみ）。
- ✅ **readme Changelog に 0.5.0 追記**（フォーム別メール文面＋専用文面編集画面の変数ヘルパー・既存エントリ不変・readme 書式に整合）。**External services は本件で外部通信の追加なし＝不変**（Google/ChatWork/zipcloud・目視確認）。
- ✅ **build 成功＋ZIP 検証**（`npx wp-scripts plugin-zip`・gitignore 済み・非コミット）：**30 ファイル**（v0.4.2 と同数＝**増減ゼロ**。v0.5.0 の新規 React ソース3本は build/admin.js にバンドル・PHP 変更は既存出荷ファイルの編集ゆえ新規出荷ファイルなし）。docs/src/tests/node_modules/.DS_Store/.git/package.json 混入ゼロ・ZIP 内 smart-booking.php Version／SMART_BOOKING_VERSION／readme Stable tag／Changelog が 0.5.0 同梱を実証。
- ✅ **★マイグレーション本番更新経路 実証★**（logic-evaluator 独立判定）：SMART_BOOKING_VERSION=0.5.0 のコードに対し、`mail_overrides` 列 DROP＋db_version=0.4.2 の既存ユーザー状態を再現 → **admin cookie 付き実HTTP `GET /wp-admin/`（admin_init→maybe_upgrade 自然発火・再有効化ではない）** で1回発火 → `mail_overrides`（longtext・NULL 許容）追加・**他6テーブル `SHOW CREATE TABLE` md5 不変**・schedules/custom_fields の UNIQUE 不変・db_version 0.4.2→0.5.0 前進。**2回目 GET は no-op（列重複なし・md5 不変・冪等）**。移行直後の全 override NULL 状態でユーザー宛/管理者宛メールが共通 option render と **byte 一致**。
- ✅ **Plugin Check 配布スコープ 0/0**（検出は全て .distignore 除外の dev 成果物）・php -l 28/28・phpcs 変更3ファイル ERRORS 0/WARNINGS 0。
- ✅ **スモーク**（基本/投稿名 両パーマリンク）：admin 5ページ boot・v0.5.0 表示・BUG-A デグレなし・フロント予約完走・**出し分け実測**（pre_wp_mail 捕捉：フォームB受付ユーザー専用ON→専用文面＋B変数展開／管理者宛は共通＝種別独立／A予約は共通）。
- ✅ **E2E**：新規 v050-form-mail-overrides 4/4＋v050-form-mail-tab 2/2＝6/6、回帰（v040-forms-crud・phase4-email 5/5 メールデグレ無し・v042-mail-custom-fields・phase2-form-settings 11/11）21/21＝**新規失敗ゼロ**。既知 stale は非ブロック。
- 🔵 非ブロッキング（掃除任意・出荷影響なし）：①`tests/e2e/v050-form-mail-overrides.spec.js` の adminREST ヘルパが `/wp-json/` をハードコードし Plain パーマリンク時のみ test A が harness 起因で失敗（product は localized `?rest_route=`・test B は両構造 pass・出し分けは投稿名で実証）。将来 helper を localized restUrl 化する余地（テストの書き方）。②リポジトリ root の `smart-booking.zip`・`.DS_Store` 残存（配布 ZIP には .distignore 除外で非混入）。

- **v0.5.0 次の一手（すべて人間 GO・不可逆）**: ①レビュー ②main マージ / `git push` / `git tag v0.5.0` ③SVN（`~/dev/smart-booking-svn`）trunk 反映 + `tags/0.5.0` + `svn ci` で WordPress.org 公開（Claude は認証情報を扱わない）。ZIP は `npx wp-scripts plugin-zip` で再生成可能。**ローカルのバージョンは 0.5.0 に更新済み**（リリース準備完了）。

## v0.4.2 不具合修正: カスタムフィールドのメール変数対応（実装・検証 完了／2026-07-16。以下は当時の記録・v0.4.2 は WordPress.org 公開済み）

- **ブランチ `feat/v042-custom-field-mail-vars`（main=v0.4.1 から分岐・push なし・SVN 未操作）。バージョンは 0.4.1 据え置き**（bump/Changelog/Stable tag はリリース準備タスクで別途）。調査正本 `docs/bugs/v0.4.2-external-report-ledger.md`、仕様追補 `docs/spec-amendment-v042-custom-field-mail-vars.md`（spec 本体は非編集）。
- **背景**：外部 Web 制作者の報告2件。報告1＝「資料送付項目を追加してテスト送信したらフィールドキーが未展開のまま届く」（原因：カスタムフィールドがメール変数として展開されず、CustomFieldModal:301 の UI 説明文が存在しない機能を約束）。報告2＝「管理者宛メールだけ届かない（自動返信は届く）」（コードは正常＝wp_mail 2回呼び出しを実測、未達は配信性問題）。方針は人間決定済み＝報告1=案A+関連改善／報告2=コード修正なし・FAQ 追記のみ。
- **コミット（依存順）**:
  - `d4d0985` docs: v0.4.1 を公開済み（SVN rev 3608476）に訂正・v0.4.2 を次バージョンに設定。
  - `b1ae78a` docs(bugs): 外部報告2件の調査正本を起票。
  - `ab5616c` feat: 実装本体（下記）。
  - `497ce00` fix(ux): ux-evaluator 指摘反映（変数チップの改行防止／address 3変数をフィールド一覧・モーダルでも明示／空欄作成時に自動採番キーをトースト提示）。
- **実装（案A＝メール変数展開）**:
  - `includes/class-reservation-context.php`: `template_vars()` にカスタムフィールドの `{field_key}`→回答値を追加（`custom_field_vars()`）。**address は `{key}`/`{key}_zip`/`{key}_address` の3変数**（結合は `〒郵便番号 住所`＝ReservationDetailModal と同形式・ハイフン無し）、**checkbox は「、」結合**、**条件非表示(meta無)は空文字**、**固定8変数と衝突時は固定を優先**（カスタムを先に組み固定で上書き）。`build()` の custom_field_defs を**予約の form_id でスコープ**（複数フォームで同一 field_key を混ぜない）。**マイグレーション不要**（保存済み meta を遡って展開）。ChatWork/GCal は `formatted[]` のみ消費で無影響（調査済み）。
  - `includes/rest/class-rest-custom-fields.php`: `RESERVED_TEMPLATE_KEYS`（固定8変数キー）を新規作成時に禁止（`smb_field_key_reserved` 400）。空キーは従来どおり `field_N` 自動採番。
  - 管理UI: `TemplateVariableHelper`/`MailSettingsTab` に**フォーム別カスタム変数チップ**を動的表示（forms+customFields を取得・クリック挿入・複数フォーム注記・取得失敗はフォールバック無害）。`CustomFieldModal` は**キー欄を任意化**（空欄=自動採番）＋説明文を実装に一致＋予約語バリデーション。`CustomFieldList` にキーの「メール変数 {key} として使用可」ヒント。`admin.scss` に `.smb-field-list__mailvar` / `.smb-var-helper__custom` 系。
  - `readme.txt`: FAQ「確認メールが届かない」に、送信失敗バナーが出なくても受信側で迷惑メール判定・拒否され得る旨（管理者宛のみ未達の非対称含む）を追記。
- **検証（全 Green）**:
  - build 成功 / php -l OK / **phpcs ERRORS 0・WARNINGS 0**（挿入で崩れた整列は修正済み） / JS lint 新規ゼロ / **Plugin Check 配布スコープ 0/0**（検出は全て .distignore 除外の dev 成果物＝.DS_Store 等）。
  - **wp-env 実測（eval-file・14/15、1件は検証スクリプト側の期待値タイポでコード出力は正）**：radio/checkbox「、」/address 3変数＋結合/条件非表示→空文字/複数フォームスコープ（同一 `{field_docs}` が form 毎に別値）/固定変数優先（`{store_name}`=店舗名）/予約語 REST 拒否/空キー自動採番 `field_N`。
  - **新規E2E `tests/e2e/v042-mail-custom-fields.spec.js` 2/2**（smb-mail-catcher の pre_wp_mail 捕捉でユーザー宛・管理者宛の両本文に展開／未入力は空文字・生キー残留なし）。
  - **回帰ゲート 新規失敗ゼロ**：phase4-email 5/5（固定変数 render 不変＝デグレ無し）・phase2-form-settings 10/10・v030-conditional-fields/admin/address・v040-forms-crud/form-reservation/fallback・phase2-settings。**phase2-form-settings のキー重複テストは、予約語 `customer_name` が新挙動で予約語エラーになるため非予約語キー（company_name）へ更新＋予約語の正例テストを追加**（挙動はブロック維持・メッセージがより的確化＝デグレではない）。
  - **UX 検証（ux-evaluator 独立判定・実機スクショ desktop/mobile）＝総合 Green**。report1 の混乱（日本語ラベルのみで `{field_N}` が生で届く）が実質解消を実機確認。指摘は 🟡1（変数チップの375px改行）＋🔵3。🟡＋🔵2（address 3変数の非対称説明・自動採番キーの不可視）を `497ce00` で反映。残る🔵1＝キー表示の配色コントラスト（約4.2:1）は**本改修固有でなく既存パターン踏襲のため据え置き**（次回配色見直し時に検討）。反映後に phase2-form-settings 10/10・v042 2/2 再走 Green。
### v0.4.2 リリース準備：ローカル完了（2026-07-16・commit `d99a8d0`・push なし）
リリース ZIP を出す直前までのローカル作業は全て完了。**残りは人間 GO の不可逆操作のみ**（下記「v0.4.2 次の一手」）。実装本体（`ab5616c`/`497ce00`）の上に、リリース bump を別コミット `d99a8d0` で積んだ。
- ✅ **バージョン4箇所を 0.4.2 に一致更新**（smart-booking.php Version / SMART_BOOKING_VERSION / readme.txt Stable tag / package.json）。grep 4/4 一致実証・smart-booking.php／package.json に 0.4.1 残存ゼロ（readme は Changelog 履歴の 0.4.1 のみ）。
- ✅ **readme Changelog に 0.4.2 追記**（カスタムフィールドのメール変数展開＋フィールドキー任意化＋メール未達切り分け FAQ 追記・既存エントリ不変。readme 慣習 `= x.y.z - date =`／`*` に整形）。**External services は本件で外部通信なし＝不変**（Google/ChatWork/zipcloud・目視確認）。Upgrade Notice は 0.3.0/0.4.0/0.4.1 と同様にエントリ追加せず。
- ✅ **build 成功＋ZIP 検証**（`npx wp-scripts plugin-zip`・コミット非対象・gitignore 済み）：**30 ファイル**（v0.4.1 と同数＝**増減ゼロ**。v0.4.2 は既存 PHP＋build/admin.js バンドル＋readme に収まり新規出荷ファイルなし）。docs/src/tests/node_modules/.DS_Store/.git 混入ゼロ・ZIP 内 smart-booking.php Version／SMART_BOOKING_VERSION／readme Stable tag／Changelog が 0.4.2 同梱を実証。
- ✅ **★マイグレーションゲート無害 実証★**（logic-evaluator 独立判定）：本リリースは DB スキーマ変更なし（メール変数展開は保存済み meta の読み取りのみ）。SMART_BOOKING_VERSION 0.4.1→0.4.2 で、db_version=0.4.1 環境の admin cookie 付き実HTTP `GET /wp-admin/`→admin_init→maybe_upgrade が1回発火するが全バージョンゲート（0.2.0/0.2.3/0.3.0/0.4.0）が false ＝**スキーマ副作用ゼロ**（4テーブル `SHOW CREATE TABLE` md5 不変・custom_fields/schedules の UNIQUE 2本不変）、**唯一 db_version が 0.4.2 へ前進**、2回目は非発火（冪等）。
- ✅ **Plugin Check 配布スコープ 0/0・php -l 21/21・phpcs ERRORS 0**（WARNINGS 35 は既存方針の整形ドリフト据え置き＝ゲート外）。
- ✅ **スモーク**（基本/投稿名 両パーマリンク）：admin 5ページ boot・v0.4.2 表示・BUG-A デグレなし・フロント予約完走。**メール変数展開を実測**（pre_wp_mail 捕捉：ユーザー宛・管理者宛の両本文に `会社: テスト商事`・checkbox「、」結合・address `〒1500002 東京都渋谷区渋谷` 結合が展開、生キー `{field}` 残留なし。未入力は空文字）。
- ✅ **E2E**：新規 v042-mail-custom-fields 2/2（投稿名・Plain 双方）＋phase4-email 5/5（固定変数 render 不変＝メールデグレ無し）＋phase2-form-settings 10/10＋v030-conditional/address・v040-forms-crud/form-reservation/fallback／touched 36 全 pass＝**新規失敗ゼロ**。既知 stale は非ブロック（未走）。ベースライン差分：作業ツリー変更はバージョン文字列＋Changelog のみ＝PHP ランタイム非改変ゆえ stash 比較は同一。
- 🔵 非ブロッキング（掃除任意・出荷影響なし）：リポジトリルートに古い `smart-booking.zip`・`.DS_Store` 等の dev 成果物残存（配布 ZIP には .distignore 除外で非混入）。

- **v0.4.2 次の一手（すべて人間 GO・不可逆）**: ①レビュー ②main マージ / `git push` / `git tag v0.4.2` ③SVN（`~/dev/smart-booking-svn`）trunk 反映 + `tags/0.4.2` + `svn ci` で WordPress.org 公開（Claude は認証情報を扱わない）。ZIP は `npx wp-scripts plugin-zip` で再生成可能。**ローカルのバージョンは 0.4.2 に更新済み**（リリース準備完了）。

## v0.4.1 UX改善: フォーム/店舗のショートコード表示（**WordPress.org 公開済み・2026-07-15・SVN rev 3608476**）

- **ブランチ `feat/shortcode-display`（main=v0.4.0 から分岐・push なし・SVN 未操作）。バージョンは 0.4.0 のまま据え置き・readme 非変更**（パッチ 0.4.1 の判断は人間）。背景＝複数フォームの埋め込み用ショートコード `[smart_booking form_id="N"]` を管理画面で確認する場所が無く、フォームを作っても id が分からず埋め込めなかった（実ユーザーフィードバック）。
- **実装（コミット）**:
  - `4e31e7b` フォーム側: 新規 `src/admin/utils/shortcode.js`（組み立て集約: デフォルト→`[smart_booking]` / 他→`[smart_booking form_id="N"]`）＋新規 `src/admin/components/ShortcodeField.jsx`（コード＋コピー＋「コピーしました」一時表示・`navigator.clipboard`→`execCommand` フォールバック・`compact` variant・Toast 非依存の自己完結）。FormSettingsPage のセレクタ直下・同 `.smb-section-card` 内に常時表示。`admin.scss` に `.smb-shortcode-field*`。新規 E2E `tests/e2e/shortcode-display.spec.js`（切替追随1本）。
  - `0e8cc52` 店舗側: StoreCard に compact 版で `[smart_booking store_id="N"]`。**システム店舗（is_system=1）は管理一覧に出ない**ため利用者作成の実店舗カードにのみ表示（`class-rest-stores.php:119` の一覧は `is_system=0` のみ）＝店舗別埋め込みが有用な多店舗運用でだけ現れる。担当者は shortcode 属性なしで対象外。
- **設計**: shortcode 属性はサーバ `includes/class-shortcode.php` の store_id/form_id の2つ。form_id 省略/不正は `resolve_form_id` でデフォルト解決＝デフォルトフォームは省略形 `[smart_booking]`。**PHP・REST・DB は無改修**（新規エンドポイント不要・公開契約非破壊）。
- **検証（logic-evaluator 独立判定・全 Green）**: 新規 E2E pass／DOM 実値 デフォルト`[smart_booking]`・追加`[smart_booking form_id="30"]`・店舗`[smart_booking store_id="2"]`・コピーボタン活性／回帰 **28/28 pass**（v040-selector-switch・v040-forms-crud・phase2-form-settings・phase2-stores-staff）＝新規失敗ゼロ／build 成功・**lint 新規ゼロ**（`npm run lint:js` 全体 482件は既存テスト spec の整形ドリフト＝ベースライン・私の変更ファイルは指摘ゼロ）・**PHP 非変更**（phpcs ERRORS 不変）。スクショで 1フォーム/1店舗でもレイアウト崩れなし・主張しすぎない を確認。
- **v0.4.1 リリース準備：ローカル完了（2026-07-15・commit `1ffde47`・push なし）**。上記3コミット（機能実装・0.4.0 据え置き）の上に、リリース bump を別コミットで積んだ。
  - ✅ **バージョン4箇所を 0.4.1 に一致更新**（smart-booking.php Version / SMART_BOOKING_VERSION / readme.txt Stable tag / package.json）。grep 4/4 実証。
  - ✅ **readme Changelog に 0.4.1 追記**（フォーム設定＋店舗一覧のショートコード表示＋コピー・既存エントリ不変）。External services は本件で外部通信なし＝**不変**（Google/ChatWork/zipcloud・目視確認）。
  - ✅ **build 成功＋ZIP 検証**：**30 ファイル**（v0.4.0 と同数＝**増減ゼロ**。本件は build/admin.js バンドルに収まり新規出荷ファイルなし）。docs/src/tests/.DS_Store 混入ゼロ・ZIP 内 0.4.1 同梱を実証（gitignore 済み・非コミット）。
  - ✅ **★マイグレーションゲート無害 実証★**（logic-evaluator）：本パッチは DB 変更なし・PHP 実体無改修。SMART_BOOKING_VERSION 0.4.0→0.4.1 で、db_version=0.4.0 環境の admin_init→maybe_upgrade は1回発火するが全バージョンゲート（0.2.0/0.2.3/0.3.0/0.4.0）が false ＝**スキーマ/データ副作用ゼロ**（forms/custom_fields/reservations/schedules・両 UNIQUE 不変）、**唯一 db_version が 0.4.1 へ前進**、2回目は非発火（冪等）。
  - ✅ **Plugin Check 配布スコープ 0/0・php -l 20/20・phpcs ERRORS 0**。
  - ✅ **スモーク**（基本/投稿名 両パーマリンク）：v0.4.1 表示・ショートコード表示レンダ・予約完走・BUG-A デグレなし。
  - ✅ **E2E**：shortcode-display／v040-selector-switch／phase2-form-settings 9/9／phase2-stores-staff 14/14 pass＝新規失敗ゼロ（phase3-flow の赤は WP-CLI 基盤 ETIMEDOUT フレーク＝state.md 既知・PHP 無改修で非回帰）。
- **v0.4.1 次の一手（すべて人間 GO・不可逆）**: ①レビュー ②main マージ / `git push` / `git tag v0.4.1` ③SVN（`~/dev/smart-booking-svn`）trunk 反映 + `tags/0.4.1` + `svn ci` で WordPress.org 公開（Claude は認証情報を扱わない）。ZIP は `npx wp-scripts plugin-zip` で再生成可能。

## v0.4.0 機能② 複数フォーム（実装時ローカル完了 → 現在は WordPress.org 公開済み・2026-07-15）

- **ブランチ `feat/v040-multi-forms`（main から分岐・push なし・SVN 未操作）。バージョンは 0.3.0 のまま据え置き**（v0.4.0 のバージョン更新・Changelog・External services 確認はリリース作業で別途）。仕様正本は `docs/spec-amendment-v030-v040.md`「② 複数フォーム」。
- **設計方針**: スケジュール（空き枠）はフォームで分けない＝全フォームが同一の店舗×担当者スケジュールを共有。予約枠・アトミックUPDATE競合防止・締切ロジックは一切不変。上限 `SMART_BOOKING_MAX_FORMS=10`（設定画面非公開）。
- **コミット（依存順）**:
  - `5a434dc` DB: 新テーブル `smart_booking_forms`（7テーブル化）／`custom_fields`・`reservations` に `form_id`／`field_key` UNIQUE を `(form_id, field_key)` 複合へ張替。`run_migrations()` に **0.4.0 ゲート + 冪等 `migrate_multi_forms()`**（forms確保→標準フォームシード→既存行 form_id バックフィル→明示ALTERでUNIQUE張替、複合実在確認後に単独DROP）。`$forms_ready` 失敗キャップでリリース時の再試行担保。`uninstall.php` 7テーブル対応。
  - `3782cfd` REST: `/forms` CRUD（上限403・作成時に初期3フィールド自動生成・デフォルト削除403・通常削除は custom_fields のみ削除し予約は残す）。`/custom-fields` を form_id スコープ化（衝突・条件親候補・逆ネスト・依存削除を `AND form_id`）。`/public/custom-fields?form_id`（不正→デフォルト fallback）。`/public/reservations` に form_id 存在検証（`smb_reservation_form_invalid` 400）。予約一覧 `format_row`/`build_filter` に form_id、CSV に「フォーム」列（店舗の隣・常時出力・削除済みは「(削除済みフォーム)」）。
  - `02839f1` 管理UI: フォームセレクタ+[編集]+[+追加]（`FormNameModal` 新規）。セレクタ切替で選択中フォームのフィールドへ。デフォルト削除導線なし。**親候補/キー重複は選択中フォームの fields を渡すことで form スコープに閉じる**（CustomFieldModal 無変更）。テーマ設定は設定→デザインのグローバルのまま（全フォーム共通）。
  - `c94ba7a` フロント+ショートコード: `[smart_booking form_id="2"]`。**不正/未指定は PHP 側 `resolve_form_id` でデフォルトの有効 id に解決**して `data-form-id` 出力（予約POSTの存在検証も通す）。フロントは form_id で取得し予約 payload に付与。
  - `ea81e7e` 予約一覧UI: フォーム列+フィルタ。**デグレ回避で `forms.length>1` のときのみ列/フィルタ表示**（1フォーム運用の一覧は v0.3.0 と同一の見た目）。CSV は常時出力。
  - `2cfe05c` fix: `migrate_multi_forms()` の `$prefix` 変数を廃しインライン補間へ（Plugin Check `UnescapedDBParameter` 誤検知4件を解消）。
  - `3cb82c1` test: 新規 E2E `tests/e2e/v040-*.spec.js`（5本+helper）。既存 spec の form_id 追随（複合UNIQUEに伴い直接SQL INSERT行をデフォルトフォームへ紐付けるUPDATE追記: v030-conditional-fields/admin, v030-address-field, phase3-validation）。
- **バージョン据え置きとマイグレーション発火の設計**: `SMART_BOOKING_VERSION=0.3.0` のため `db_version` は 0.3.0 頭打ち＝`migrate_multi_forms()` は**再有効化のたび発火（冪等ゆえ無害）**。リリース時に `SMART_BOOKING_VERSION` を 0.4.0 へ bump すると、既存 0.3.0 ユーザーの `maybe_upgrade()`（0.3.0<0.4.0）が**1回だけ発火**→ 移行 → db_version 0.4.0 へ前進（今のコードで本番経路も正しく動作）。
- **検証（logic-evaluator 独立判定 + 実測）全 Green**:
  - マイグレーション: v0.3.0→0.4.0 正当（既存フィールド/予約がデフォルトフォームに紐付き・③条件関係保持・schedules UNIQUE 無傷）／2-3回発火冪等／複合UNIQUE隔離（別フォームは同一 field_key 可・同一は1062拒否）／uninstall 7テーブル。
  - 機能: 新規 E2E 5本 desktop 8/8（forms CRUD+上限／セレクタ切替／form_id別予約／スケジュール共有＝満席連動409／不正idフォールバック）。
  - 1フォームデグレ: 管理一覧はフォーム列/フィルタ非表示（v0.3.0 同一）・CSV常時フォーム列・public は fallback。
  - Plugin Check **配布スコープ 0/0**（activator 誤検知は `2cfe05c` で解消）。php -l 全通過・phpcs ERRORS 0・build 成功。
  - 回帰ゲート: ②が触った経路の既存スイート（bug124／phase2-reservations 11/11／phase3-flow 13/13／phase2-form-settings／phase2-reservations-extra・smoke／v030-conditional-fields・admin・address 11/11）で **②起因の新規失敗ゼロ**（②で壊れた直接INSERT系4テストは form_id 追随で修正済み）。
### v0.4.0 リリース準備：ローカル作業 完了（2026-07-15・commit `b1f4a3d`・push なし）
リリース ZIP を出す直前までのローカル作業は全て完了。**残りは人間 GO の不可逆操作のみ**（下記「v0.4.0 次の一手」）。
- ✅ **バージョン4箇所を 0.4.0 に一致更新**（smart-booking.php Version / SMART_BOOKING_VERSION / readme.txt Stable tag / package.json）。grep で 4/4 一致実証。
- ✅ **readme.txt 更新**：Changelog に 0.4.0 追記（②複数フォーム・既存エントリ不変）／FAQ に「確認メールが届かない場合」1項目追加（WP Mail SMTP・SPF/DKIM/DMARC・設定>メール通知タブ）／External services は②で新規外部通信なし＝**不変**（Google/ChatWork/zipcloud）。目視で3サービス記載の整合を確認。
- ✅ **build 成功＋ZIP 検証**（`npx wp-scripts plugin-zip`・コミット非対象・gitignore 済み）：**30 ファイル**（v0.3.0 の 29 比 **+1＝`includes/rest/class-rest-forms.php`**＝②の唯一の新規出荷ファイル）。docs/src/tests/node_modules/.DS_Store 混入ゼロ。ZIP 内 smart-booking.php/readme.txt が 0.4.0 同梱を実証。
- ✅ **★マイグレーション本番経路 実証★**（logic-evaluator 独立判定）：SMART_BOOKING_VERSION=0.4.0 のコードに対し v0.3.0 相当DB（form_id 無・単独UNIQUE・③条件フィールド・予約データ有・db_version=0.3.0）を人為再現 → **admin cookie 付き実HTTP `GET /wp-admin/` で admin_init→maybe_upgrade を自然発火（再有効化ではない）** → 標準フォーム1件生成・全 custom_fields/reservations が form_id=デフォルト（form_id=0 残存ゼロ）・複合 uniq_form_field_key 実在＆単独 uniq_field_key DROP・③条件関係保持・schedules UNIQUE 無傷・db_version→0.4.0。2〜3回発火で差分ゼロ（冪等・重複フォーム生成なし）。複合UNIQUE隔離を 1062 で実証。
- ✅ **Plugin Check 配布スコープ 0/0**（検出 8E+4W は全て .distignore 除外の dev 成果物＝出荷ファイルからの検出ゼロ）・php -l 20/20・phpcs ERRORS 0。
- ✅ **スモーク**（パーマリンク 基本/投稿名 両方）：v0.4.0 表示・REST 到達（BUG-A デグレ無し）・**1フォーム／2フォーム両方**で予約完走。
- ✅ **E2E 最終再走**：新規 v040 5本 desktop 8/8・②touched（v030-conditional-fields/admin/address・phase3-validation）＋回帰（bug124・phase2-reservations・phase3-flow・phase2-form-settings 他）で **②起因の新規失敗ゼロ**（既知 stale のみ・wp-env CLI ETIMEDOUT フレークは再走で解消）。
- 🔵 非ブロッキング（掃除任意・出荷影響なし）：リポジトリルートに古い `smart-booking.zip`・`.DS_Store`（`includes/.DS_Store` 含む）が残存。配布 ZIP には含まれない（.distignore 除外）。

### v0.4.0 リリース（完了・WordPress.org 公開済み）
- **✅ 公開済み**（WordPress.org・SVN rev 3608375）。機能② 複数フォームを含む v0.3.0 → v0.4.0 の通常更新。main マージ / `git push` / SVN 公開は人間側で実施済み（Claude は認証情報を扱わない・git tag 等の詳細は人間側管理）。既存 v0.3.0 ユーザーには `maybe_upgrade()`（0.3.0<0.4.0）で本番マイグレーションが1回発火（実装時に実証済）。
- ✅ readme 精度（②由来）：FAQ のカスタムテーブル数を **「6つ」→「7つ」に修正済み**（forms テーブル追加＝実体7つ・uninstall.php の7テーブル DROP と整合）。

## 現在地
- **⚠️ 訂正（2026-08-16）**: 以下の旧記述「公開版 v0.5.0／main v0.5.0／v0.5.1 未公開・リリース準備完了」は**誤り**。正は本ファイル冒頭「🔴 現在の公開状況」を参照。**公開版・main とも v0.5.1**（v0.5.1 は **2026-07-30・SVN rev 3627795** で公開済み・タグ push 済み）。
- **公開バージョン: v0.5.1（WordPress.org・SVN rev 3627795・2026-07-30 公開済み）**。空き状況表示のカスタマイズ（しきい値／文言／色）を含む。前バージョンの rev・公開日は冒頭「公開履歴」表を参照（v0.5.0 rev 3618165 ほか）。
- **main = v0.5.1**（HEAD `05dfe4d`・バージョン4箇所一致・tag `v0.5.1` 作成＆push 済み）。SVN 公開・main マージ・push・tag は人間側で実施済み（Claude は認証情報を扱わない）。上記「v0.5.1」節はローカル実装・リリース準備の記録で、その後 WordPress.org 公開まで完了した。
- **旧・次バージョンとして起票されていた v0.4.2（外部ユーザー報告2件対応・不具合修正）は上記のとおり公開済み**。以下は当時の記録:調査正本 `docs/bugs/v0.4.2-external-report-ledger.md`。方針＝報告1（カスタムフィールドのメール変数展開）は案A+関連改善、報告2（管理者宛メール未達）はコード修正なし・readme FAQ 追記のみ。実装ブランチ `feat/v042-custom-field-mail-vars`。**リリース準備ローカル完了（2026-07-16・commit `d99a8d0` で 0.4.2 bump＋Changelog・push なし。上記「v0.4.2 リリース準備」節）。残りは人間 GO の不可逆操作（main マージ / push / tag / SVN 公開）のみ**。
- git（v0.2.3）: `main` にコミット・push 済み（release コミット `31354bd`、GitHub タグ `v0.2.3`）。作業ツリー クリーン。
- **v0.2.3 でリリース済み（全て Green・公開済み）**:
  - **BUG-1/2＋BUG-4＋自動更新フック(b)**（第1〜3報）: `includes/rest/class-rest-schedules.php` / `includes/class-activator.php` / `smart-booking.php`（copy_schedules 店舗×担当者スコープ／schedules UNIQUE＋dedup 移行／admin_init maybe_upgrade）。
  - **BUG-A（Plain パーマリンク REST 依存）**（第4報）: `src/admin/api.js` / `src/frontend/api.js`（buildUrl セパレータ修正）。
  - **BUG-3（メール未達）(iii)**（第5〜6報）: (i) 送信失敗の可視化＝`includes/class-email.php` / `includes/rest/class-rest-settings.php` / `src/admin/api.js` / `src/admin/pages/settings/MailSettingsTab.jsx` / `src/admin/admin.scss`。(ii) docs＝`docs/ops/email-deliverability.md`。
  - **BUG-B（管理画面ロゴ未同梱）(A)**（第8報）: `src/admin/App.jsx` / `src/admin/images/SmartBookingLogo.svg`（webpack import＝data URI 同梱）。
  - **few_left（残りわずか）視覚回帰**（第10報）: `src/frontend/styles/frontend.css`（警告色/バッジ復元・仕様3.4準拠）。
  - **readme 英語化**（WordPress.org 2025-07 ポリシー）: 短い説明＋Description を英語復元・`non_official_language` 0。
- 全案件、固有ゲート＋回帰（ベースライン差分・新規失敗ゼロ）＋配布物 Plugin Check 0/0（ZIP 実測・混入なし・全修正同梱）＋契約非破壊で Green。

## v0.3.0（WordPress.org 公開済み・2026-07-14・仕様は `docs/spec-amendment-v030-v040.md`）
- **機能① 店舗・担当者の呼び方設定：実装完了・検証 Green（2026-07-14）**。
  - ブランチ `feat/v030-store-staff-labels` にコミット（**push なし**）。**バージョンは 0.2.3 のまま据え置き**（v0.3.0 は ①③④ が揃った時点で別途リリース。readme Changelog 未着手）。
  - 内容: 設定に個別 option 2つ `smart_booking_store_label` / `smart_booking_staff_label`（新テーブル無し）。GET/POST `/settings` と GET `/public/settings` に2キー追加（**追加のみ・公開契約非破壊**）。空文字→デフォルト（店舗/担当者）フォールバックは `class-rest-public.php::get_settings()` 末尾に集約。管理画面 基本設定タブに入力UI（maxLength=20）。反映は**フロントのみ**（StoreSelect/StaffSelect 見出し・SelectionBar・DonePage ラベル・state.js 店舗固定エラー）。管理画面表記は意図的に不変。
  - 検証: logic-evaluator が全完了条件 Green（REST フォールバック決定的検証・新規 E2E `tests/e2e/v030-labels-front.spec.js` A/B pass・デグレ無し・回帰新規失敗ゼロ）。
  - 既知の非ブロッキング残件:
    - 🟡 phpcs 整形警告 +2（`class-rest-settings.php` の新2行 `DoubleArrowNotAligned`）。**意図的に既存の整列スタイルに合わせて据え置き**（この sniff は `wp plugin check` のゲート対象外・phpcbf で全ブロック再整列すると差分が肥大するため不採用）。ERRORS は 0/0。
    - 🔵 `tests/e2e/phase6-visibility.spec.js:B`（line 279-280）が本機能と無関係にプリエグジスティングで 90s タイムアウト（`page_id=7` ハードコードがリビジョン扱いで nonce 未 localize）。要別件起票（`page_id=7`→`FRONT_PAGE_PATH` 化）。ベースラインにも存在＝非回帰。
- **機能③ 条件フィールド：実装完了・検証 Green（2026-07-14）**。
  - 同ブランチにコミット（**push なし・0.2.3 据え置き**）。radio/select 親の選択値で子フィールドを表示/非表示。3制約（条件1つ・親は radio/select のみ・ネスト禁止1段）。
  - DB: `smart_booking_custom_fields` に `condition_field_key varchar(100) NULL` / `condition_value varchar(255) NULL` を dbDelta で追加（**db_version bump せず・0.3.0 移行判定はリリース時に確定**。開発は再有効化で適用）。
  - サーバ: 管理CRUD（条件バリデーション・**親削除の依存ブロック**・**逆方向ネスト `smb_field_condition_is_parent` も両側で塞いだ**）／公開取得／**予約作成のサーバ側再評価 `condition_met()`**（表示中のみ必須・非表示値は meta 破棄。フロント判定を信用しない）。REST は `condition_field_key`/`condition_value` を**追加のみ**で非破壊。CSV/予約詳細は meta 由来で自動空欄（無改修）。
  - フロント: 共有 `fieldConditions.js`（`isFieldVisible`）／FormInput・MainInputPage・ConfirmPage（表示中のみ描画/検証/payload除外＝送信時破棄）／CustomFieldModal「表示条件」UI（親候補フィルタ・system非表示・逆方向ネスト非表示）／FormSettingsPage。
  - 検証: logic-evaluator が全完了条件 Green（サーバ再評価を直接POSTで実証・CSV実出力で破棄空欄確認・管理UI DOM 実走）。新規 E2E `tests/e2e/v030-conditional-fields.spec.js`（A/B/C）＋`tests/e2e/v030-conditional-admin.spec.js`（2g・4ケース）。**デグレなし**（条件ゼロ時は従来同一）。回帰ゲートは planner が form/admin/flow/confirm/reservations 系を実走し新規失敗ゼロを確認。
- **機能④ 住所フィールド（郵便番号自動入力）：実装完了・検証 Green（2026-07-14）**。
  - 同ブランチにコミット（**push なし・0.2.3 据え置き**）。field_type `address` = 郵便番号+住所の複合フィールド。meta は `{key}_zip`/`{key}_address` の2キーで保存。CSV は常に2列出力（`{label}（郵便番号）`/`{label}（住所）`）。is_required は複合全体に適用。自動入力 ON/OFF チェックボックス（デフォルト ON）。address は③の子には成れるが親には成れない。
  - **外部通信は zipcloud（`https://zipcloud.ibsnet.co.jp/api/search`）**。CORS は人間側 Chrome DevTools で事前検証済（実行元 `https://demo.wp-smart-booking.com/`、ヒット `zipcode=1500002`→`東京都渋谷区渋谷`、0件 `zipcode=0000000`→`{results:null,status:200}`）。通信条件＝address フィールドが存在し自動入力 ON かつ利用者が郵便番号7桁を入力したときのみ。全角郵便番号は半角正規化（`normalizeZip`）。フェイルソフト（API 失敗/タイムアウト5s/0件でもブロックせず・console.error/warn 無し）。
  - サーバ: `class-rest-custom-fields.php`（ALLOWED_TYPES に address 追加・`field_options={autofill:bool}` 保存・`resolve_autofill`）／`class-rest-public.php`（address 分岐で autofill 出力・`normalize_zip` 全角対応・必須検証は zip 7桁+住所両方／任意時は zip があれば7桁・meta は `condition_met` 破棄の後に2行 insert・**フロント判定を信用せずサーバ再正規化**）／`class-rest-reservations.php`（CSV を (label, meta_key) リストへ一般化し address は2列を常時出力）。REST は field_options 経由で**追加のみ・非破壊**。
  - フロント: `src/frontend/addressLookup.js`（`normalizeZip`／`lookupAddress`＝AbortController 5s・`credentials:omit`・`cache:no-store`・失敗時 null）／`src/frontend/components/AddressField.jsx`（zip+住所の複合入力・500ms debounce・requestTokenRef で古い/アンマウント結果を無効化・ユーザー編集済みは上書きしない overwrite-guard）／FormInput・MainInputPage・ConfirmPage（address 分岐＝`〒{zip} {address}`）／管理: FieldTypeCards（address カード）・CustomFieldModal（「住所の自動入力」Switch・デフォルト ON）・CustomFieldRenderer・ManualReservationModal（`normalizeZip` で meta 展開）・ReservationDetailModal（`〒{zip} {address}` 表示）。
  - 検証: logic-evaluator が全完了条件 Green。新規 E2E `tests/e2e/v030-address-field.spec.js`（A 自動補完/全角/2キー・B フェイルソフト0件・C ③連携で非表示値破棄・D 自動入力OFF は無通信+直POSTバリデーション、desktop+mobile 8 pass、全て route intercept でモック）。REST 往復・全角「１５００００２」→「東京都渋谷区渋谷」→`dest_zip=1500002`/`dest_address`・自動入力OFF時 zipcloud リクエスト0件・console error 0・直POSTで `smb_reservation_zip_invalid`/`smb_reservation_custom_field_required`・address 親拒否 `smb_reservation`/`smb_field_condition_parent_invalid`・CSV 2列を実証。**デグレなし**（address 分岐は全て `field_type==='address'` ゲート）。回帰ゲートは planner が form-settings/reservations/flow（32 pass）を実走し新規失敗ゼロを確認。
  - 既知の非ブロッキング残件:
    - 🟢 2d 上書き防止・2j 予約詳細表示はコード確認済（専用 E2E は未追加だが実装は堅牢・test A が自動補完後の手編集を通過）。
    - 🟡 phpcs 整形警告 +3（address 分岐の整列）。①③と同方針で据え置き（`wp plugin check` ゲート対象外・ERRORS 0/0）。
    - 🔴 **リリース時 readme External services に zipcloud 追記必須**（下記チェックリスト。④コミットでは readme 未タッチ＝意図的にリリース作業へ集約）。
- **①③④ が全て揃い、v0.3.0 は 2026-07-14 に WordPress.org 公開済み（SVN rev 3608167）**。②は v0.4.0（上記セクション・ローカル準備完了）。

### v0.3.0 リリース準備：ローカル作業 完了（2026-07-14・ブランチ `feat/v030-store-staff-labels`・push なし）
リリース ZIP を出す直前までのローカル作業は全て完了。**残りは人間 GO の不可逆操作のみ**（下記「次の一手」）。
- **✅ readme.txt External services に zipcloud 追記済み**（通信先 `https://zipcloud.ibsnet.co.jp/api/search`・目的=郵便番号からの住所自動補完・タイミング=「住所フィールドが存在し自動入力ON かつ利用者が郵便番号7桁を入力したとき」・送信データ=郵便番号のみ）。総括文も「明示的に有効化・設定した場合のみ通信」に整合（zipcloud はフィールド追加＝有効）。**規約必須事項をクリア**。
- **✅ Changelog に 0.3.0 追記済み**（①呼び方設定・③条件フィールド・④住所フィールド。既存エントリ不変）。
- **✅ バージョン4箇所を 0.3.0 に一致更新**（`smart-booking.php` Version / `SMART_BOOKING_VERSION` / `readme.txt` Stable tag / `package.json`）。
- **✅ 既存ユーザーのアップグレード経路を修正**（`includes/class-activator.php`）。旧実装は `maybe_upgrade()` のゲートが `db_version < '0.2.3'` ハードコードで、既存 0.2.3 ユーザーが 0.3.0 に更新しても③の condition_* 列が追加されない不具合があった。ゲートを `SMART_BOOKING_VERSION` に変更し、`run_migrations()` に `create_tables()`（dbDelta 冪等再適用・`< '0.3.0'` ゲート）を追加。wp-env で 0.2.3 状態（列DROP・db_version=0.2.3）から `maybe_upgrade()` 発火 → condition_* 列再追加 & db_version→0.3.0 & 冪等（再発火 no-op）& schedules UNIQUE 4列 intact を実証。deactivate→activate の新規インストール相当も db_version=0.3.0・列2本で健全。
- **✅ Plugin Check 0 errors / 0 warnings**（配布スコープ＝ZIP 相当。wp-env の plugin-check プラグインで実測。dev ファイルは .distignore 相当を除外）。④が新規に持ち込んだ `WordPress.DB.SlowDBQuery.slow_db_query_meta_key` 誤検知3件は、CSV 列生成のローカル配列キー `meta_key`→`mkey` へ改名して発生源から解消（`includes/rest/class-rest-reservations.php`。phase2-reservations の CSV export テスト10 pass で挙動不変を実証）。
- **✅ ZIP 検証**（`npx wp-scripts plugin-zip`・コミット非対象・.gitignore 済み）: 29 ファイル（v0.2.3 と同一構成＝増減なし。③④は build/ バンドルと既存 `includes/rest/*.php` の内容更新に収まり新規出荷ファイルなし）。build/・includes/・languages/index.php・readme.txt・smart-booking.php・uninstall.php を同梱、docs/node_modules/tests/src/.git 等の混入ゼロ。ロゴは build/admin.js に data URI 同梱（別 SVG なし＝v0.2.3 BUG-B 方式）。
- **✅ スモーク**（パーマリンク「基本(Plain)」「投稿名」の両方）: 管理画面5ページ（schedule/reservations/stores/form-settings/settings）が boot し boot 中 REST に 4xx/5xx ゼロ・ヘッダ v0.3.0 表示、フロント予約フロー完走。**BUG-A（Plain で REST 404）デグレなしを両構造で実証**。全 PHP `php -l` OK、phpcs 出荷スコープ ERRORS 0（整形 WARNINGS 36 は①③同方針で据え置き・審査ゲートは Plugin Check 0/0）。

## v0.3.0 リリース（完了・WordPress.org 公開済み 2026-07-14）
- **✅ 公開済み**（SVN rev 3608167・公開ページ 0.3.0 表示・demo サイト 0.3.0 へ更新）。SVN 公開・`main` マージ / `git push` / `git tag v0.3.0` は人間側作業（Claude は認証情報を扱わない）。git 側の詳細状況は人間側管理。
- 残トラック（**v0.2.4／設計トラック送り**・非ブロッキング）: phase3 仕様乖離（`docs/bugs/spec-vs-shipped-booking-flow.md`）／BUG-3 UX 微改善（第6報）／BUG-B aria-label 二重発話（第8報）。

## 未解決 / 確認事項
- 検証資産の掃除候補（配布対象外・任意）: `tests/red/bug3-mail-failure-red.php`, `tests/red/bug3-mail-green-verify.php`, `tests/e2e/bug-a-plain-repro.spec.js`(skip), `tests/e2e/bug-b-logo-shipping.spec.js`, `tests/e2e/few-left-visual-repro.spec.js`。
- 🔵 **既存ギャップ（v0.5.1 で発見・スコープ外・別途起票候補）**: 月カレンダー表示（`calendar_view_mode=month_only`/`both`）で残りわずか/満席/締切の**視覚区別が無い**。`DateSelect.jsx` は月セルに `is-tone-*` クラスを付与するが CSS 側に `.smb-front-month-cell.is-tone-*` の背景スタイルが無く、各バッジも `display:none`。**main(v0.5.0) から存在＝v0.5.1 の回帰ではない**（`month-cell.is-tone` は main で 0 件）。日表示（既定 `day_only`）は `is-tone-few` 背景で正常表示。月表示にも空き状況表示を足すなら別タスク（新規表示の追加＝YAGNI 判断のうえ）。関連: `.smb-front-time-btn__badge` 等の満席/締切バッジは現行デザインで display:none（可視は few_left バッジのみ）、無効スロットの「×」は #e74c3c 固定マーカー。

## テスト運用メモ
- ⚠️ **モバイル/デスクトップ分岐は `testInfo.project.name` で判定する。要素の有無を `count()` で判定しない**
  （2026-09-11・v0.5.5 H3 の E2E ヘルパーで2度つまずいた点）。
  `ReservationsPage.jsx` は `isMobile` でデスクトップ＝行内「詳細」ボタン／モバイル(375px)＝カード全体クリックに
  分岐するが、**`page.getByRole('button', {name:'詳細'}).count()` は React 描画前に 0 を返すため、
  デスクトップでもモバイル経路に入り「クリックできない/モーダルが開かない」で落ちる。**
  `count()` は待ち合わせをしない即時評価（`expect(...).toHaveCount(n)` だけがリトライする）＝
  **「存在しない」と「まだ描画されていない」を区別できない。**
  正しい形は `tests/e2e/v055-reservation-detail-form-fields.spec.js:102-127`（`openDetail()`）:
  ①`waitForSelector('.smb-page--reservations')` でページ描画を待つ →
  ②対象行を `toBeVisible()` で待つ → ③分岐は `testInfo.project.name === 'mobile'`。
  既存 `phase2-reservations.spec.js` も同じくプロジェクト名で分岐しており、こちらが慣習。
  なお `toHaveCount(0)`（＝出ていないことの assert）は待ち合わせ付きなので用途が違い、使ってよい。
- 長時間スイートは**フォアグラウンド＋spec チャンク＋Bash ツール timeout**（シェル `timeout` は macOS 未インストール）。detached background は孤児化防止のため使わない。
- 回帰ゲート＝ベースライン差分で新規失敗ゼロ。既知 stale（ベースラインでも失敗＝別件・ブロックしない）:
  - phase3-fix1:45 / phase3-validation:115 / phase3-responsive:967（`docs/bugs/spec-vs-shipped-booking-flow.md` の仕様乖離）。
  - **phase3-validation:174 / :319 も同根**（統合設計 MainInputPage は「送信時エラー表示」ではなく「必須未入力時はボタン disabled」。旧多段ステップ前提のテストが古い）＝2026-07-14 の③回帰確認で stash 比較しベースラインでも同一失敗を確認。serial のため後続テストは巻き添えスキップされる。
  - **phase9-redesign-confirm-responsive:220**（375px 幅）もプリエグジスティング（stash 比較で確認）。
  - phase6-visibility:B（`docs/bugs/phase6-visibility-flaky-page-id-7.md`、page_id=7 ハードコード）。
  - **phase7-system-entity:231「B: ユーザーエンティティ0件で日付選択から始まる」**（2026-07-15 発見・②起因ではない既存 stale）。フロント動作は正常（店舗/担当者スキップ＋日付ピッカー表示を実画面で確認）だが、テストが見出しロール名 `日付を選択` を期待。統合設計の実見出しは `日付選択`（`src/frontend/steps/DateSelect.jsx:171`。`日付を選択` は line179 の `title=` 属性のみ）で、**Gen-C UI刷新 `3bb995b`（②より前）以来のテキスト不一致**。phase3-validation の旧多段ステップ stale と同種。要別件（テスト文言更新 or 見出しロール付与）。

## 触ってはいけない
- デモ VPS 同居の Laravel（`api.konkatsu-scope.com`）と Python。
- 公開済みの REST 契約・DB 既存カラム（拡張は人間承認 → 正本反映 → 派生）。
