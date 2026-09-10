# 別件（プロダクト不具合）: メールタブの種別トグルが「共通テンプレート未ロード」中に押されると空欄で確定する（レース条件）

最終更新: 2026-09-10
起票元: 撮影基盤の分離作業（`docs/decisions/0002-screenshot-spec-separation.md`）の回帰確認中に `tests/e2e/v050-form-mail-tab.spec.js:105` [mobile] の赤を logic-evaluator が切り分け、**テストの問題ではなくプロダクト側の実レース条件**と判明したため独立起票。
重大度: 🟡 中（**UX 不具合**。logic-evaluator の初期評価は 🔴 Critical だったが、planner の追加検証で**メール送信・データは壊れない**ことが確定したため補正。理由は「実害の範囲」節）。
トラック: 撮影基盤の変更とは**完全に無関係な既存バグ**。本トラックではプロダクトもテストも変更しない（記録のみ）。

## 事象

フォーム設定 → **メールタブ**で、種別トグル（例: 受付ユーザー宛）を ON にしたとき、**共通テンプレートがプリセットされず件名・本文が空のまま**になることがある。

さらに悪いことに、**一度空が入ると、あとから共通テンプレートが取得できても復元されない**（空欄が state に確定書き込みされるため）。

## 再現条件（タイミング依存）

**メールタブを開いた直後、`API.settings.get()` が解決する前にトグルを ON にする**と発生する。ネットワーク/描画が速いと発生しない。

logic-evaluator の実測:

```
npx playwright test tests/e2e/v050-form-mail-tab.spec.js --project=mobile --repeat-each=5
→ 5回中4回失敗（反復1のみ pass）
```

失敗は毎回同一のアサーション:

```
Expected: "タブ共通受付件名"
Received: ""
> 133 | await expect( subject ).toHaveValue( COMMON_USER_SUBJECT );
```

**サーバ側にデータは存在する**（`wp option get smart_booking_mail_receipt_user_subject` → `タブ共通受付件名`）。＝ **純粋にクライアント側のレース**であり、保存済みデータの欠損ではない。

> ⚠️ **ビューポート非依存**。今回 mobile で観測されたが、原因は非同期取得とクリックの競合であり **desktop でも同じ機構で発生しうる**。**mobile 固有の問題として扱わないこと**（desktop は評価者のツール上限のため未実行というだけ）。

## 根本原因

`src/admin/pages/formsettings/FormMailTab.jsx`

**(1) 共通テンプレートはマウント時の非同期取得で state に入る**（`:85`〜`:99`。取得失敗は握り潰す設計）:

```js
// FormMailTab.jsx:85〜
useEffect(() => {
    API.settings.get()
        .then((res) => { ... setCommonTemplates(res && res.settings ? res.settings : {}); })
        .catch(() => { /* noop: 補助情報のため失敗してもタブ本体は動かす */ });
}, []);
```

**(2) `handleToggle` は「クリック時点の `commonTemplates`」を読むだけ**（`:121`〜`:141`、確定書き込みは `:134`〜`:135`）:

```js
// FormMailTab.jsx:134〜
subject: commonTemplates[meta.subjectKey] || '',   // 未ロードなら '' が確定してしまう
body:    commonTemplates[meta.bodyKey] || '',
```

`commonTemplates` の初期値は `{}`（`:74`）。したがって **(1) が未解決のうちに (2) が走ると `''` が overrides state へ確定書き込みされる**。

そして `handleToggle` のプリセットは「件名・本文が両方とも空のときだけ」ではなく **`hasDraft` 判定を通ったブロック内での一度きり**であり、`commonTemplates` が後から到着しても**再プリセットする経路が存在しない**。＝ **一度空になったら復元されない**。

## 実害の範囲（重要 / severity 補正の根拠）

logic-evaluator は「空の override が保存された状態でメールがどう送られるか未検証」として 🔴 Critical と評価したが、**planner が送信経路を確認した結果、メール送信は壊れない**。

**(a) 送信時は空 override を共通へフォールバックする** — `includes/class-email.php` の `get_form_override()`（`:220`〜、ガードは `:247`〜`:250`）:

```php
// enabled でも件名 / 本文が空なら安全側で共通へフォールバックする。
if ( '' === trim( $subject ) || '' === trim( $body ) ) {
    return null;
}
```

→ **空件名のメールは送信されない**。共通テンプレートが使われる。

**(b) そもそも壊れた状態を永続化できない** — `includes/rest/class-rest-forms.php`（`:213`〜`:214`）は `enabled=true` かつ件名・本文が空の保存を **400 で拒否**する:

```php
if ( $enabled && ( '' === trim( $subject ) || '' === trim( $body ) ) ) {
    return $this->error( 'smb_form_mail_override_incomplete', '専用文面を使う項目は、件名と本文の両方を入力してください。', 400 );
}
```

**結論**: 実害は「**UI が空欄をプリセットし、保存しようとすると 400 エラーで弾かれる**」という混乱を招く UX 不具合であり、**メール文面の破損やデータ破壊ではない**。

ただし **ユーザーには原因が全く分からない**（なぜ空なのか、なぜ保存できないのか、どうすれば直るのかが画面から読み取れない。しかも「もう一度 OFF→ON」しても `hasDraft` 判定に阻まれず空のままになる経路がある）。**修正価値は高い。**

## これは撮影基盤の変更とは無関係（証跡）

- **出荷コード無変更**: `git status --short -- includes src smart-booking.php uninstall.php` が**空**（2026-09-10 実測）。
- **直近3コミット（`39d0297` / `2401f09` / `faaef2c`）の変更ファイルに `includes/` `src/` `tests/e2e/` が1件も含まれない**（触れたのは `docs/`・`tests/screenshots/`・`.distignore`・`.gitignore` のみ）。
- **実行バンドル無変更**: `build/admin.js` の mtime は **2026-08-17 10:23** で、今回の作業より古い。
- 該当 spec とコンポーネントの最終更新はいずれも **2026-07-22**（`FormMailTab.jsx` → `a7d3ac7`、`v050-form-mail-tab.spec.js` → `829ac3d`）。

## 回帰ゲートへの影響

**なし（Green を維持）**。本件は既存バグとしてブロックしない。

⚠️ ただし **「before も赤だから既存赤」という論法は本件には使えない**。before はインフラ起因の ETIMEDOUT でマスクされており、**製品を測れていなかった**。ブロックしない正しい根拠は、上記「証跡」節の**構造的証明**（出荷コード・バンドル・spec のいずれも未変更）＋ **purge 済みの素の基線での再現**である。

## 修正方針の候補（本トラックでは実施しない）

**1. プロダクト側（主）**

`handleToggle` が `commonTemplates` 未ロード時にプリセットを確定させないようにする。候補:

1. **ロード完了までトグルを disabled にする**（最も単純。ただしタブを開いた直後に操作できない一瞬が生まれる）
2. **ロード後に「空のままの override」を遅延補完する**（`commonTemplates` 到着時の `useEffect` で、`enabled` かつ subject/body が空のものだけ埋める）
3. **`handleToggle` 内で `API.settings.get()` を await してからプリセットする**（クリックごとに通信が走る点に注意）

**どれを採るかは実装時に判断**する。いずれの案でも「既に下書きがある場合は破棄しない」既存仕様（`hasDraft` 判定）を壊さないこと。

**2. テスト側（従）**

`tests/e2e/v050-form-mail-tab.spec.js` の `openMailTab()`（`:92`〜`:103`）は `window.smartBookingAdmin?.nonce` とトグルの出現しか待たず、**設定取得の完了を待たずに即クリック**している。待ち条件の追加が筋。

> ⚠️ **テストだけを直して赤を消すのは症状の隠蔽**になる。**プロダクト修正を先に行うこと。**

## 影響範囲

- 影響を受けるのは **管理画面のフォーム設定 → メールタブ**のみ。フロント予約フォーム・予約データ・スケジュールには波及しない。
- **送信されるメール文面は正しい**（共通テンプレートへフォールバックするため）。ユーザーに届くメールは壊れない。
- **DB に不正な状態は保存されない**（REST が 400 で拒否するため）。
- 関連: `docs/decisions/0002-screenshot-spec-separation.md`（起票元トラック）、`docs/bugs/phase1-schema-expected-tables-stale.md`（同トラックで独立起票した別件）。
