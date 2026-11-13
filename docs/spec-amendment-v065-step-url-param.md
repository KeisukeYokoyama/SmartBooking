# 仕様追補 v0.6.5：確認画面・完了画面の URL パラメータ付与

作成: 2026-11-13 ／ 既存の仕様書（`docs/smart-booking-spec.md`）は編集せず、本書を追補の正本とする。

## 目的

確認画面と完了画面を表示した時点で、ページの URL にパラメータを追加できるようにする（ページ遷移・再読み込みはしない）。
GTM を使っていないサイトでも、GA4 の拡張計測（ブラウザの履歴イベントに基づくページの変更）や広告媒体の
「URL 条件のコンバージョン」で、確認画面への到達と予約完了を計測できるようにする。

| 画面 | 付与するパラメータ |
|---|---|
| 確認画面 | `?smt_booking=confirm` |
| 完了画面 | `?smt_booking=complete` |

## 設定

| 項目 | 仕様 |
|---|---|
| 設定場所 | 設定 → 外部連携タブに 1 項目（サイト全体で 1 つ。フォーム単位の設定は作らない） |
| オプション名 | `smart_booking_step_url_param_enabled`（bool・初期値 0＝OFF） |
| 公開設定のキー | `/public/settings` の `step_url_param_enabled`（true / false）。**追加のみ**で既存キーは不変 |
| パラメータ | キー `smt_booking` 固定、値 `confirm` / `complete` 固定。管理画面で変更する機能は作らない |
| 外部通信 | なし（ブラウザの URL を書き換えるだけ） |

管理画面の文言:

- 見出し（ラベル）: `確認画面・完了画面でURLパラメータを付ける`
- 説明文: `有効にすると、確認画面の表示時にページのURLへ「?smt_booking=confirm」を、予約完了画面の表示時に「?smt_booking=complete」を追加します。Googleアナリティクス4（GA4）や広告媒体で、URLを条件にしたコンバージョン計測ができるようになります。ページの再読み込みは発生しません。`
- スイッチ: 既存の Google カレンダー連携・ChatWork 通知と同じ「有効/無効」行（`有効（URLパラメータを付ける）` / `無効（URLを変更しない）`）

## URL の変化（ステップの遷移に合わせる）

| 遷移 | URL の扱い |
|---|---|
| 入力画面 → 確認画面 | `smt_booking=confirm` を付ける |
| 確認画面 → 完了画面 | 値を `complete` に置き換える（`confirm` と `complete` を両方付けない） |
| 確認画面 →「入力内容を修正する」で入力画面に戻る | `smt_booking` を取り除く |
| 確認画面の送信エラー（409 満席）→「日付を選び直す」で入力画面に戻る | `smt_booking` を取り除く |
| 確認画面の送信エラー（409 以外） | 確認画面に留まるため URL は `confirm` のまま |
| 店舗選択・担当者選択・入力画面の間の移動 | URL は触らない |
| フォームの初回表示時（再読み込みを含む） | URL は触らない（URL に `smt_booking` が残っていても除去しない） |

確認画面から出る遷移はコード上この 3 つ（`GO_BACK_FROM_CONFIRM` / `GO_TO_STEP 'date'` / `SUBMIT_SUCCESS`）のみで、
確認画面から店舗選択等へ直接戻る遷移は存在しない（2026-11-13 調査）。

## 実装上の決まり

| 項目 | 仕様 |
|---|---|
| 付与・除去の方法 | すべて `window.history.pushState`（`replaceState` は使わない） |
| 実装場所 | `src/frontend/App.jsx` で `state.step` の変化を見る `useEffect` 1 か所。処理本体は `src/frontend/utils/stepUrlParam.js` |
| 重複の防止 | 目標の URL が現在と同じなら `pushState` しない |
| 既存の URL | 既存のクエリ（utm_* など）とハッシュは元の表記のまま保持する（`smt_booking` 以外の項目は再エンコードしない） |
| dataLayer | 既存の push（ConfirmPage / DonePage の `useEffect`）は無改変。React は子の effect を親より先に実行するため、順序は dataLayer push → URL 変更 |
| 戻るボタン（popstate） | 対応処理は作らない |
| 失敗時 | `history` API が使えない環境では何もせず、例外を外に出さない |
| OFF のとき | URL に一切触れない（改修前と同じ動作） |

## 削除・初期化

- `includes/class-activator.php` の初期値に 0 を追加（`add_option` のため既存サイトは上書きしない。未設定でも `get_option` の既定値 0 で OFF）。
- `uninstall.php` の削除対象に追加。

## 検証

- `tests/e2e/gtm-datalayer.spec.ts` に 4 ケース追加（OFF で URL 不変・dataLayer 従来どおり／ON で confirm → complete／ON で「修正する」で除去／ON ＋ `utm_source=test` の保持）。
- `tests/e2e/phase3-helpers.js` の `restoreBaseline()` に本オプションの削除を追加（ON が後続テストへ漏れないため）。
