# 別件（テスト負債・要確認）: phase1「テーブル 6 つ」テストが現行スキーマ（7 テーブル）と不一致で失敗

最終更新: 2026-09-10
起票元: 撮影 spec 退避（`docs/decisions/0002-screenshot-spec-separation.md`）の回帰ゲート確認中に、before / after 双方の既存赤として検出。第5節 (3) の未解決項目を独立起票したもの。
重大度: 🟡 中（**現時点ではテストのみ**の可能性が濃厚だが、**スキーマ検証の要のテストが恒常的に赤**という点で放置は危険）。
トラック: 撮影 spec 分離とは**完全に独立**。本トラックではテストもプロダクトも変更しない（記録のみ）。

## 事象

`tests/e2e/phase1.spec.js` の

- **`1-1. smart_booking_ テーブル 6 つすべてが存在する`**（`:53`、アサーションは `:55`）

が **desktop / mobile 双方で失敗**する。

```js
// tests/e2e/phase1.spec.js 55行目
expect( snap.tables.sort() ).toEqual( EXPECTED_TABLES );
```

`snap.tables` は `tests/e2e/global-setup.js` が `listSmbTables()`（`tests/e2e/helpers.js:75`〜、`SHOW TABLES LIKE '%smart_booking\_%'`）で**実 DB から列挙**した値。期待値 `EXPECTED_TABLES` は `phase1.spec.js:30`〜`:38` のハードコード配列。

## 実測した現行スキーマ（7 テーブル）

`includes/class-activator.php` の `create_tables()`（`:475`〜`:634`）を実読した。dbDelta は **7 回**呼ばれる（`:627`〜`:633`）。docblock（`:466`）も「カスタムテーブル**7つ**を作成する」と明記している。

| # | テーブル（`{$wpdb->prefix}smart_booking_` + 以下） | CREATE 定義 | 期待値配列に在るか |
|---|---|---|---|
| 1 | `stores` | `:484` | ✅ |
| 2 | `staff` | `:507` | ✅ |
| 3 | `schedules` | `:528` | ✅ |
| 4 | `reservations` | `:550` | ✅ |
| 5 | `reservation_meta` | `:575` | ✅ |
| 6 | **`forms`** | `:589` | ❌ **欠落** |
| 7 | `custom_fields` | `:608` | ✅ |

**期待値配列に欠けているのは `wp_smart_booking_forms` の1件のみ**（`reservation_meta` は既に含まれている。ここは誤認されやすいので明記する）。

裏取り2件:

- `uninstall.php:32`〜`:38` は**同じ7テーブル**を `DROP TABLE IF EXISTS` している（`forms` は `:38`）。
- `tests/e2e/.db-snapshot.json`（2026-09-09 実測）の `tables` は **7件**で、`wp_smart_booking_forms` を含む。＝**現行 wp-env にテーブルは実在しており、欠けていない。**

## 根本原因の推定（**要確認**・断定しない）

**「テストの期待値が古い」疑いが濃厚**。時系列が整合する。

- `forms` テーブルは **2026-07-15 / commit `5a434dc`「feat(db): 複数フォーム(機能②)のDBスキーマ+冪等マイグレーション」**（v0.4.0）で追加された。
- 一方 `tests/e2e/phase1.spec.js` の最終更新は **2026-06-24 / commit `47f32eb`**（`smart_booking_` へのリネーム同期）。**`forms` 追加より約3週間前**で、以後一度も更新されていない。

さらに、**同じ陳腐化がドキュメント正本側にも波及している**（テスト単独の問題ではない）。

- `docs/smart-booking-spec.md:647`: 「カスタムテーブル6つ（stores, staff, schedules, reservations, reservation_meta, custom_fields）」＝ **`forms` 抜きの6件**で、`EXPECTED_TABLES` と完全一致する。
- `CLAUDE.md:65`: 「データ: カスタムテーブル 6つ」。

つまりテストは**当時の正本どおり**に書かれており、v0.4.0 でスキーマだけが前進し、テストと正本の両方が取り残された、という筋が最も自然。

**ただし、プロダクト側の可能性を完全には排除しない（要確認）**:

- このテストは**実 DB を列挙して比較する**ため、「テーブルが本当に欠けている」場合も同じ形で落ちる。現行 wp-env のスナップショットでは7件揃っているが、**別の環境・別の更新経路でも `forms` が確実に作られるか**は別途確認する価値がある。
- 該当経路: `forms` は `register_activation_hook`（`smart-booking.php:38`）だけでなく、自動更新向けに `admin_init` → `Smart_Booking_Activator::maybe_upgrade()`（`smart-booking.php:44`）→ `run_migrations()` の **0.4.0 ゲート `migrate_multi_forms()`**（`class-activator.php:133`〜）でも作られる設計になっている。この経路が実ユーザー環境で確実に発火しているかは未検証。

## これは回帰ではない（証跡）

- 撮影 spec 退避の **before / after 双方**で同一テストが同じく赤（2026-09-09 実測、決定 0002 第3節の「共通の既存赤29件」に含まれる）。＝**プリエグジスティングな失敗**。
- 撮影 spec 退避は `includes/**` / `src/**` を1バイトも変更していないため、因果関係は無い。
- 決定 0001（ベースライン差分）により、**回帰ゲートはブロックしない**。

## なぜ放置が危険か

このテストは **`smart_booking_` テーブル群の存在を検証する唯一のスキーマ検証テスト**である（phase1 の 1-2〜1-4 は行数カウントであってテーブル存在の網羅検証ではない）。

**赤のまま放置すると、「常に赤いから」で見過ごされ、本当にテーブルが欠けたとき（dbDelta 失敗・マイグレーション未発火・新規テーブル追加漏れ）に検知できない。** 検知網としての機能を既に失っている状態であり、重大度を 🟡 中としたのはこの理由による（現象そのものはユーザー影響ゼロ）。

## 修正方針の候補（本トラックでは実施しない）

1. **プロダクト側の確認を先に行う（順序として必須）**
   - 新規インストール（activate 経路）と、v0.3.x → 現行への更新（`maybe_upgrade` → `migrate_multi_forms()` 経路）の**両方**で `wp_smart_booking_forms` が作成されることを wp-env で実測する。
   - 欠けていればプロダクトのバグとして本項目を格上げし、テストは**直さない**（赤が正しく鳴っていたことになる）。
2. **テスト期待値の更新（プロダクトが正しかった場合）**
   - `tests/e2e/phase1.spec.js:30`〜`:38` の `EXPECTED_TABLES` に `'wp_smart_booking_forms'` を追加し、テスト名（`:53`）の「6 つ」を「7 つ」へ改める。
   - 再発防止として、期待値を**ハードコード配列ではなく `class-activator.php` の実定義から導出できないか**を検討する余地がある（ただし E2E から PHP 定義を読むのは複雑化しやすく、YAGNI との兼ね合いで要判断）。
3. **ドキュメント正本の同期（人間承認が必要）**
   - `docs/smart-booking-spec.md:647` と `CLAUDE.md:65` の「6つ」も同時に是正しないと、次に誰かがテストを書くとき同じ陳腐化を再生産する。
   - **`docs/smart-booking-spec.md` は凍結された正本であり、更新は人間承認を経ること**（本起票では変更していない）。

## 影響範囲

- **配布プラグインの挙動には影響しない**（現行 wp-env では7テーブルすべて実在を確認済み）。ユーザー影響ゼロ。
- 影響は E2E ハーネスの検知能力に限定される。ゲート運用上は、この1件（× desktop / mobile の2プロジェクト）を**ベースライン既存赤**として扱う。
- 関連記録: `docs/decisions/0002-screenshot-spec-separation.md` 第5節 (3)（本件の元の未解決項目）、第6節（`phase1.spec.js:53` が before / after で同じ赤だったことが、撮影 spec による DB 汚染の影響ゼロの根拠になっている）。
