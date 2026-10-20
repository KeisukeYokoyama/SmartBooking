# 仕様追補 v0.6.2：予約可能数0の許可・手動作成（承認済み）の管理者宛メール停止

作成: 2026-10-20 ／ 既存の仕様書（`docs/smart-booking-spec.md`）と `docs/spec-amendment-v061-manual-reservation.md` は編集せず、本書を追補の正本とする。

## 修正1：予約可能数（capacity）に 0 を許可する

### 修正前の実態
- 管理画面の時間枠エディタ（`TimeSlotEditor.jsx`）は `min="1"`・`Math.max(1, …)` で 0 を 1 に丸め、追加/編集モーダルも「1以上」で検証していた。
- サーバー（`class-rest-schedules.php`）も作成時は `< 1 → 1`、更新時は `max(1, …)` で丸めていた。
- 公開の空き状況 API（`class-rest-public.php`）は `capacity > 0 && booked_count >= capacity` のときだけ `full` とし、
  **capacity=0 は `available`（予約可能）と返していた**。予約確定時のアトミック UPDATE（`booked_count < capacity`）で弾かれるため、
  「選べるのに確定で満席エラー」になる。依頼文の「既存ロジックどおり満席表示」は成立していなかった。

### 修正後
- 管理画面: 入力欄の下限を 0 にし、負数は 0 に丸める。検証文言は「予約可能数は0以上で入力してください。」。
- サーバー: 作成・更新とも下限 0（負数は 0）。既存の「予約数より少ない定員への変更は拒否」は不変。
- 空き状況 API: `booked_count >= capacity` で `full`（`capacity > 0` 条件を外した）。capacity≥1 の判定結果は従来と同一。
  担当者統合モード（合算）でも同じ式。フロント（`TimeSelect.jsx`）は `full` を従来どおり満席・選択不可で描画（無改変）。
- スケジュールコピー: 元から capacity をそのまま INSERT していたため無改変で 0 が複製される
  （保護された予約済み枠と衝突した場合の `GREATEST` も不変）。
- 手動作成・公開予約: アトミック UPDATE の `booked_count < capacity` により、capacity=0 の枠は従来どおり 409 `smb_reservation_full`。
- 公開契約・DB スキーマ: 変更なし（`capacity` カラムの DEFAULT 1 も不変）。

## 修正2：手動作成で「承認済み」を選んだときは管理者宛メールを送らない

- `Smart_Booking_Integrations::on_received()` の `approved` 分岐から `send_receipt_admin()` を削除。ユーザー宛の `send_approval()` は不変。
- `approved` で受付フックが発火するのは管理者の手動作成のみ（公開フォームは常に `pending` で作成）のため、公開予約の挙動は不変。
- 承認待ち（ユーザー宛受付＋管理者宛受付）・キャンセル（メールなし）・ChatWork・Google カレンダーは不変。
- `send_receipt_admin()` は `send_receipt()` の後半として引き続き使われる。

## 検証
- 新規 E2E `tests/e2e/v062-capacity-zero.spec.js`（C1〜C4）。`phase2-schedule.spec.js` の「0 を 1 にクランプ」テストを「0 を保存できる」に更新。
- `v061-manual-reservation.spec.js` の B2 を「ユーザー宛1通のみ・管理者宛0通」に更新。
