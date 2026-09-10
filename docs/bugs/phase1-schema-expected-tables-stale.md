# 別件（テスト負債・要確認）: phase1「テーブル 6 つ」テストが現行スキーマ（7 テーブル）と不一致で失敗

最終更新: 2026-09-10
ステータス: 🟢 **クローズ（2026-09-10 是正済み・未リリース）**。確定結論は「**テスト側の期待値の陳腐化**」で、プロダクト（スキーマ）は正常だった。是正コミット: `c4ea76f`（テスト期待値）/ `79c1940`（正本 spec）。詳細は末尾「進捗更新」節。
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

> ✅ **2026-09-10 に確定済み。** 以下の推定（テスト側の陳腐化）が**正しかった**。確定の裏取りと是正内容は末尾「進捗更新 2026-09-10（クローズ）」節を参照。**以下の本文は起票当時の記述のまま残す。**

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

> ✅ **2026-09-10 の決着: 採用したのは候補2（テスト期待値の更新）＋候補3（ドキュメント正本の同期）。**
> - **候補1**（プロダクト側の確認）は「順序として必須」の前提どおり**先に実施**し、**プロダクトは正常**と確定した（コード実読による裏取り3点。末尾クローズ節 参照）。よって格上げはしない。
> - **候補2 の後半**（期待値を `class-activator.php` の実定義から導出する）は **YAGNI として採らなかった**。代わりに「スキーマ追加時に更新する3点セット」を `docs/decisions/0002-screenshot-spec-separation.md` §8.5 に再発防止として明文化した。
> - **候補3 は人間承認のうえ実施**。ただし `CLAUDE.md:65` のみ未是正で残る（クローズ節「残件」参照）。

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

---

## 進捗更新 2026-09-10（クローズ）: テスト側の陳腐化と確定・是正完了（出荷コード無変更）

**ステータス**: 🟢 **クローズ**（是正済み・未リリース。出荷コードを変更していないため、リリースを伴わない）。

### 確定した結論

**テストの期待値が古かった**（起票時の推定どおり）。**プロダクトは正常**であり、格上げは不要。

- **プロダクトは正常** — `includes/class-activator.php::create_tables()` は7テーブルを dbDelta する（`:627`〜`:633`。docblock `:469` も「カスタムテーブル7つ」）。
- **`uninstall.php` は7つ DROP 済み** — `:32`〜`:38`（`forms` は `:38`）。**削除漏れは無く、ユーザーの DB にゴミは残らない。**
- **`readme.txt` は元から正しかった** — `:153` "removes the **seven** custom tables"。ユーザー向けドキュメントに陳腐化は波及していなかった。

陳腐化していたのは **E2E の期待値と `docs/` 正本だけ**である。

### 是正内容（変更ファイルは4つ。`includes/**` `src/**` `uninstall.php` `smart-booking.php` `readme.txt` は1バイトも変更していない）

**commit `c4ea76f`** — `test(phase1): テーブル期待値を現行スキーマの7つへ同期（forms 追加）`

- `tests/e2e/phase1.spec.js` — `EXPECTED_TABLES`（`:30`〜）に `'wp_smart_booking_forms'` を追加（`.sort()` 済みだが可読性のためアルファベット順の位置へ）／テスト 1-1（`:53`）の名称「6 つ」→「7 つ」。
- `tests/e2e/phase1-uninstall.spec.js` — U-1（`:24`）と U-3（`:50`）のテスト名を「7 つ」へ、実アサーション `toBe( 6 )` → `toBe( 7 )` を**2箇所**（U-1 事前確認 `:30` ／ U-3 再生成後 `:59`）。
  - ⚠️ **U-3 の `:59` は本起票の grep 一覧から漏れていた。** `EXPECTED_TABLES` だけ直して U-1/U-3 を放置すると、今度は破壊的スイート側が落ちる。同時是正が必要だった点を記録として残す。

**commit `79c1940`** — `docs(spec): DB設計を7テーブルへ同期し smart_booking_forms 節を追加`

- `docs/smart-booking-spec.md:368` — 「6テーブル構成」→「7テーブル構成」。
- `docs/smart-booking-spec.md` §5.11 — 列挙を7つにし `smart_booking_forms` を追加（順序は dbDelta 実行順に一致）。
- `docs/smart-booking-spec.md` §5.2 — `#### smart_booking_forms（フォームマスター）` 節を新設（reservation_meta 節の直後・custom_fields 節の直前）。出典は `$sql_forms`（`class-activator.php:589`〜`:600`）と直上コメント（`:585`〜`:588`）。

記録は `docs/decisions/0002-screenshot-spec-separation.md` §8（第5節 (3) の決着）と `docs/handoff/state.md` にも反映済み。

### 残件（人間確認待ち）

- **`CLAUDE.md:65`「データ: カスタムテーブル 6つ（$wpdb + dbDelta）」は未是正。** `CLAUDE.md` は generator の裁量で編集しない運用のため、人間確認を経て是正する。ここが残る限り、次のセッションが同じ誤解から出発する余地は消えていない。
- **回帰判定は logic-evaluator が行う。** 本クローズは「是正の適用」までで、`npx playwright test` による Green 確認は未実施（generator は回帰判定をしない）。U-1 / U-3 は破壊的スイート（`playwright.uninstall.config.js`）でのみ実行される点に注意。
- **`maybe_upgrade()` → `migrate_multi_forms()` の更新経路の実測は未実施**（起票時「別途確認する価値がある」とした論点）。今回の確定はコード実読と現行 wp-env スナップショット（7件）に基づく。新規 activate 経路は U-3 が実測でカバーする。

### 検知網としての回復

起票時に「**赤のまま放置され、本当にテーブルが欠けたときに検知できない**」と指摘した状態は解消した。1-1 は今後、**7テーブルの過不足を正しく検知する**。
