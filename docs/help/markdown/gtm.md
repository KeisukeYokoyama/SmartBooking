---
title: "GTM（Googleタグマネージャー）連携"
description: "Smart Bookingの予約フォームでGTMを使ったコンバージョン計測を設定する方法を解説します。"
order: 13
slug: "gtm"
---

# GTM（Googleタグマネージャー）連携

このページでは、予約フォームの各ステップで Smart Booking が自動的に送信する `dataLayer` イベントを使って、Googleタグマネージャー（GTM）経由で GA4 や Google広告のコンバージョン計測を行う方法を解説します。

> Smart Booking が行うのは **`window.dataLayer.push` の実行のみ** です。GTM コンテナタグ（`gtm.js`）のサイトへの埋め込みは別途必要です。

## 仕組みの概要

予約フォームの各ステップ（店舗選択 → 担当者選択 → 日付・時間選択 → フォーム入力 → 確認 → 完了）に到達するたびに、Smart Booking が `window.dataLayer` に決まった形のオブジェクトを 1 件ずつ追加します。GTM 側で **カスタムイベントトリガー** を設定すれば、これをきっかけに GA4 や Google広告のタグを発火できます。

`dataLayer` への追加は GTM が設置されていない環境でも常に行われますが、未消費のまま無害に残るだけなのでパフォーマンスへの影響はありません。Smart Booking 側に有効・無効スイッチは設けていません。

## 前提条件

- WordPressサイトに **GTM コンテナタグ** が埋め込まれていること
  - サイト全体への埋め込みは、テーマの `header.php` を直接編集するか、「Google Tag Manager」「Site Kit by Google」などのプラグインで行ってください。
  - Smart Booking はコンテナタグの埋め込みは行いません。
- GTM 側で GA4 設定タグや Google広告タグなど、発火させたいタグが用意されていること

## 送信されるイベント一覧

| ステップ | event 名 | booking_step 値 | 送信タイミング |
|---|---|---|---|
| 店舗選択 | `smart_booking_step` | `store_select` | 店舗選択画面の表示時 |
| 担当者選択 | `smart_booking_step` | `staff_select` | 担当者選択画面の表示時 |
| 日付選択 | `smart_booking_step` | `date_select` | カレンダー表示時 |
| 時間選択 | `smart_booking_step` | `time_select` | 時間枠リスト表示時 |
| フォーム入力 | `smart_booking_step` | `form_input` | 入力フォーム表示時 |
| 確認画面 | `smart_booking_step` | `confirm` | 確認画面表示時 |
| 完了画面 | `smart_booking_complete` | `complete` | 予約完了画面表示時（コンバージョン地点） |

> 設定で店舗選択ステップを OFF にしている場合は `store_select` イベントは送信されません。担当者選択ステップを OFF にしている場合も同様に `staff_select` は送信されず、その次のステップ（日付選択）から計測が始まります。
> 現実装ではフォーム上で「日付・時間選択」と「フォーム入力」が 1 画面に統合されているため、`date_select` / `time_select` / `form_input` の 3 イベントは画面遷移後にほぼ同時に積まれます。GTM 側で「ステップごとに 1 回だけ」発火させたい場合はイベント名と `booking_step` の組み合わせをトリガー条件に明記してください。

## dataLayer に積まれるオブジェクトの例

ブラウザの開発者ツール（DevTools）の Console タブで `window.dataLayer` を入力すると、現在までにプッシュされた配列を確認できます。完了画面まで到達した直後の例:

```javascript
> window.dataLayer
[
  { event: 'smart_booking_step',     booking_step: 'store_select' },
  { event: 'smart_booking_step',     booking_step: 'staff_select' },
  { event: 'smart_booking_step',     booking_step: 'date_select' },
  { event: 'smart_booking_step',     booking_step: 'time_select' },
  { event: 'smart_booking_step',     booking_step: 'form_input' },
  { event: 'smart_booking_step',     booking_step: 'confirm' },
  { event: 'smart_booking_complete', booking_step: 'complete' }
]
```

## GTM 側の設定手順

### 1. データレイヤー変数を作成（任意だが推奨）

GTM 管理画面 →「変数」→「ユーザー定義変数」→「新規」→ **データレイヤーの変数** を選び、次の通り作成します。

- 変数名: `DLV - booking_step`
- データレイヤーの変数名: `booking_step`

これで GA4 タグやトリガー条件で予約ステップ名を参照できるようになります。

### 2. カスタムイベントトリガーを作成

#### コンバージョン計測用トリガー（完了画面）

GTM 管理画面 →「トリガー」→「新規」→ **カスタムイベント** を選び、次の通り作成します。

- トリガー名: `Smart Booking - 予約完了`
- イベント名: `smart_booking_complete`
- 配信トリガー: すべてのカスタムイベント

このトリガーを GA4 イベントタグや Google広告コンバージョンタグに紐付けます。

#### ステップ別ファネル計測用トリガー（任意）

ステップ離脱率を可視化したい場合は、ステップごとにトリガーを作成します。

- トリガー名: `Smart Booking - 日付選択到達`
- イベント名: `smart_booking_step`
- 配信トリガー: 一部のカスタムイベント
- 条件: `DLV - booking_step` 等しい `date_select`

同じ要領で `store_select` / `staff_select` / `time_select` / `form_input` / `confirm` のトリガーを作成できます。

### 3. GA4 イベントタグを作成

GTM 管理画面 →「タグ」→「新規」→ **GA4 イベント** を選びます。

- 設定タグ: 既存の GA4 設定タグ（`G-XXXXXXX`）
- イベント名: `booking_complete`（GA4 上での名前。任意）
- イベントパラメータ: `booking_step` = `{{DLV - booking_step}}`
- トリガー: 手順 2 で作成した `Smart Booking - 予約完了`

### 4. Google広告コンバージョンタグを設定する場合

「タグ」→「新規」→ **Google広告のコンバージョントラッキング** を選び、コンバージョン ID とコンバージョンラベルを入力してください。トリガーは同じく `Smart Booking - 予約完了` を指定します。

## 動作確認

1. GTM 管理画面の右上「**プレビュー**」をクリックし、Tag Assistant を開きます。
2. 自分の WordPressサイトの URL を入力して接続します。
3. プレビュー用ウィンドウで Smart Booking の予約フォームから実際に予約を入れます。
4. Tag Assistant の左ペインに、ステップごとに `smart_booking_step`（または `smart_booking_complete`）のイベントが出現することを確認します。
5. 完了画面で目的のタグ（GA4 / Google広告）が「Tags Fired」に表示されれば設定完了です。

## ファネル分析の例（GA4）

ステップごとにイベントを送っているため、GA4 の「探索 → ファネルデータ探索」で離脱率を可視化できます。

例:

1. ステップ1: イベント `smart_booking_step` かつ `booking_step` = `store_select`
2. ステップ2: イベント `smart_booking_step` かつ `booking_step` = `date_select`
3. ステップ3: イベント `smart_booking_step` かつ `booking_step` = `form_input`
4. ステップ4: イベント `smart_booking_step` かつ `booking_step` = `confirm`
5. ステップ5: イベント `smart_booking_complete`

これで「日付選択までは 80% が到達するが、フォーム入力で 30% が離脱する」といった改善ポイントが見えるようになります。

## トラブルシューティング

| 症状 | 主な原因 |
|------|----------|
| イベントが Tag Assistant に出てこない | GTM コンテナタグがサイトに埋め込まれていない |
| `dataLayer` に何も入らない | 予約フォームの React アプリがマウントされる前に開発者ツールを開いている。フォーム表示後にもう一度 `window.dataLayer` を確認してください |
| 完了画面でも Google広告タグが発火しない | トリガーのイベント名が `smart_booking_complete` ではなく `smart_booking_step` のままになっている |
| ステップごとに同じタグが何度も発火する | トリガーで `booking_step` 条件を絞っていない。GA4 設定タグなど 1 度だけ発火させたいタグは「初期化のみ」に設定するのが安全です |

## 次のステップ

GTM 経由のコンバージョン計測まで設定できたら、サイトを公開してお客さまからの予約を受け付けてみましょう。
日々の予約状況の確認は [予約の管理](reservations.md) で行います。
