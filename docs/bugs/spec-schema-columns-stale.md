# 別件（ドキュメント負債）: `docs/smart-booking-spec.md` §5.2 のテーブル定義が実装とカラムレベルで乖離（6カラム欠落）

最終更新: 2026-09-10
ステータス: 🟢 **クローズ（2026-09-10 是正済み・未リリース）**。不足6カラムを実装の列順どおりの位置へ挿入し、全7節の機械照合で**不足0・余剰0・列順一致**を確認した。是正コミットは末尾「進捗更新」節。
起票元: テーブル数陳腐化の是正（commit `79c1940`）作業中に backend-generator がスコープ外の発見として報告し、人間承認のうえ起票。
重大度: 🟡 中（**配布プラグインの挙動には影響しない**＝ユーザー影響ゼロ。ただし `docs/smart-booking-spec.md` は `CLAUDE.md` が「凍結された正本」と定める文書であり、新規実装・外部委託・次セッションの参照元になるため、乖離は誤実装の温床である）。
トラック: 出荷コードとは**完全に独立**。本起票では**コードもテストも `docs/smart-booking-spec.md` 本体も1バイトも変更しない（記録のみ）**。是正は**人間 GO 待ち**。

## 事象

`docs/smart-booking-spec.md` §5.2「DB設計」のテーブル定義表が、実装（`includes/class-activator.php::create_tables()` の dbDelta 定義）と**カラムレベルで乖離**している。

2026-09-10 に是正した「テーブル数の陳腐化」（`docs/bugs/phase1-schema-expected-tables-stale.md`／commit `c4ea76f`・`79c1940`）と**同一原因**であり、**テーブル数はその氷山の一角だった**。テーブル1つ（`smart_booking_forms`）が丸ごと抜けていたのと同じ理由で、**既存テーブルの列も抜けていた**。

## 照合の前提（スコープと方法）

**照合対象**: §5.2 の全7節について、**カラム名・型・列順**の3点のみ。

**照合対象外**:

- **インデックス定義（`PRIMARY KEY` / `UNIQUE KEY` / `KEY`）** — §5.2 の既存節は `| カラム | 型 | 説明 |` の3列表であり、そもそもインデックスを扱う粒度になっていない。実装には `UNIQUE KEY uniq_store_staff_date_time`（`class-activator.php:541`）や `UNIQUE KEY uniq_form_field_key`（`:622`）等が存在するが、これらは既存節の記法の対象外なので**乖離としては数えない**。インデックスまで正本化すべきかは別論点（本起票では判断しない）。
- **「説明」列の記述内容の妥当性** — 例えば `field_type` の列挙が実装の受理値と一致するか等。カラムの有無・型・順序とは別の話であり、本起票では見ていない。

**照合方法（再現可能）**: spec 側は `#### smart_booking_*` 節の表からカラム名と型の列を機械抽出、実装側は `$sql_* = "CREATE TABLE ..."` の本体行から `PRIMARY KEY` / `UNIQUE KEY` / `KEY` 行を除いた定義行を機械抽出し、集合差と相対順序を突き合わせた。**7節すべてを全数比較しており、サンプリングではない。**

**行番号の基準**: 本文中の spec 行番号は commit `79c1940`（`smart_booking_forms` 節を追加した後）時点の `docs/smart-booking-spec.md` を実読して確定した値。`class-activator.php` の行番号も同時点で実読した値。

## 全数照合の結果（§5.2 全7節）

### サマリ

| # | テーブル | spec 節（行） | 実装（行） | spec カラム数 | 実装カラム数 | 判定 |
|---|---|---|---|---|---|---|
| 1 | `smart_booking_stores` | `:372`（表 `:376`〜`:389`） | `$sql_stores`（`:484`〜`:504`） | 14 | 15 | ❌ **1カラム不足** |
| 2 | `smart_booking_staff` | `:391`（表 `:395`〜`:405`） | `$sql_staff`（`:507`〜`:525`） | 11 | 12 | ❌ **1カラム不足** |
| 3 | `smart_booking_schedules` | `:407`（表 `:411`〜`:421`） | `$sql_schedules`（`:528`〜`:545`） | 11 | 11 | ✅ 一致 |
| 4 | `smart_booking_reservations` | `:423`（表 `:427`〜`:439`） | `$sql_reservations`（`:550`〜`:572`） | 13 | 14 | ❌ **1カラム不足** |
| 5 | `smart_booking_reservation_meta` | `:441`（表 `:445`〜`:448`） | `$sql_reservation_meta`（`:575`〜`:583`） | 4 | 4 | ✅ 一致 |
| 6 | `smart_booking_forms` | `:450`（表 `:454`〜`:460`） | `$sql_forms`（`:589`〜`:600`） | 7 | 7 | ✅ 一致（`79c1940` で新設したばかり） |
| 7 | `smart_booking_custom_fields` | `:462`（表 `:466`〜`:474`） | `$sql_custom_fields`（`:608`〜`:625`） | 9 | 12 | ❌ **3カラム不足** |

**不足カラムは合計6件・4テーブル。余剰（spec にあって実装に無いカラム）はゼロ。**

### 不足カラム 6件の内訳

| テーブル | 不足カラム | 実装の定義（行） | 挿入位置（実装の列順） | 追加バージョン | 追加バージョンの根拠 |
|---|---|---|---|---|---|
| `smart_booking_stores` | `is_system` | `tinyint(1) NOT NULL DEFAULT 0`（`:496`） | `is_active` の直後・`sort_order` の直前 | **v0.2.0** | `class-activator.php:66`〜`:67`（`run_migrations()` docblock「0.2.0: smart_booking_stores / smart_booking_staff に is_system カラムを追加」） |
| `smart_booking_staff` | `is_system` | `tinyint(1) NOT NULL DEFAULT 0`（`:516`） | `is_active` の直後・`sort_order` の直前 | **v0.2.0** | 同上（`:66`〜`:67`） |
| `smart_booking_reservations` | `form_id` | `bigint(20) unsigned NOT NULL DEFAULT 0`（`:552`） | **`id` の直後**（先頭から2番目）・`store_id` の直前 | **v0.4.0** | `class-activator.php:548`（「v0.4.0: 複数フォーム対応で form_id を追加」） |
| `smart_booking_custom_fields` | `form_id` | `bigint(20) unsigned NOT NULL DEFAULT 0`（`:610`） | **`id` の直後**（先頭から2番目）・`field_key` の直前 | **v0.4.0** | `class-activator.php:605`（「v0.4.0: 複数フォーム対応で form_id を追加し、field_key の一意性を (form_id, field_key) の複合 UNIQUE へ拡張する」） |
| `smart_booking_custom_fields` | `condition_field_key` | `varchar(100) DEFAULT NULL`（`:618`） | `sort_order` の直後・`created_at` の直前 | **v0.3.0** | `class-activator.php:603`（「v0.3.0: 条件フィールド用に condition_field_key / condition_value を追加」） |
| `smart_booking_custom_fields` | `condition_value` | `varchar(255) DEFAULT NULL`（`:619`） | `condition_field_key` の直後・`created_at` の直前 | **v0.3.0** | 同上（`:603`） |

> 追加バージョンは**いずれも `class-activator.php` のコード内コメントを根拠**とした（「未確認」は無し）。ただし**コミット履歴との突き合わせまでは行っていない**ため、コメント自体が誤っている可能性は排除できない。

### 列順の照合（重要な補足）

**実装に在って spec に無いカラムを除けば、7節すべてで共有カラムの相対順序は実装と完全に一致していた。** つまり「既存の行が並べ替わっている」種類の乖離は**存在しない**。列順に関する唯一の論点は、**不足6カラムを追記するときに末尾へ足してはいけない**という点である。

- `reservations.form_id` と `custom_fields.form_id` は、実装では **`id` の直後（先頭から2番目）**にある。表の末尾に足すと実装と列順がずれる。
- `stores.is_system` / `staff.is_system` は `is_active` と `sort_order` の**間**。
- `custom_fields.condition_field_key` / `condition_value` は `sort_order` と `created_at` の**間**。

### 型の照合

**共有カラムに型相違はゼロ。** ただし spec は既存節すべてで**省略記法**を採っている（実装 `bigint(20) unsigned NOT NULL AUTO_INCREMENT` → spec `bigint PK`、実装 `int(11) NOT NULL DEFAULT 0` → spec `int`、外部キー相当は `bigint FK` 等）。これは7節を通じて一貫しており、**乖離ではなく既存の書式**である。是正時もこの書式に合わせること（`NOT NULL` / `DEFAULT` 句を新規カラムだけに書くと、その節の中で書式が不揃いになる）。

## 根本原因

**スキーマを変更したときに仕様書が追随しない。** `docs/bugs/phase1-schema-expected-tables-stale.md` と**同一原因**である。

- v0.2.0 で `is_system` を足した → spec §5.2 未更新
- v0.3.0 で `condition_field_key` / `condition_value` を足した → spec §5.2 未更新
- v0.4.0 で `form_id`（2テーブル）と `forms` テーブルを足した → spec §5.2 未更新（**テーブルの方だけ 2026-09-10 に是正済み**）
- v0.5.0 で `mail_overrides` を足した → **spec §5.2 に反映されている**（`79c1940` で `forms` 節を新設した際に `$sql_forms` から起こしたため）

つまり **`forms` テーブルだけが「新設時に実装から起こした」ので正しく、それ以外は追加のたびに取り残されていた**。テーブル数の是正（`79c1940`）は乖離の一部を消したにすぎず、**カラムレベルの乖離は残ったままである。**

## 再発防止は既に明文化済み（ただし対象範囲の拡張が要る）

`docs/decisions/0002-screenshot-spec-separation.md` §8.5 に、スキーマ変更時に同時更新すべき**3点セット**が明文化されている。

1. `docs/smart-booking-spec.md` §5.2 のテーブル節（＋ §5.11 の列挙とテーブル数）
2. `tests/e2e/phase1.spec.js` の `EXPECTED_TABLES`（＋ `phase1-uninstall.spec.js` の件数アサーション）
3. `uninstall.php` の DROP 文

**この3点セットは、カラム追加にも同じ理由で効く。** ただし §8.5 は文面上「**テーブルを追加・削除する変更**」を対象に書かれており、**カラム追加は明示的に対象へ入っていない**。本件が示すとおり、実際に漏れたのは**カラムの方が件数として多い**（テーブル1件に対しカラム6件）。

**指摘**: §8.5 のトリガ条件を「テーブルの追加・削除」から「**スキーマの変更（テーブル追加・削除 ＋ カラム追加・削除・型変更）**」へ広げるべきである。カラム追加の場合、上記のうち実際に影響するのは (1) のみ（(2) はテーブル名の集合、(3) は DROP TABLE なのでカラムには反応しない）。**つまりカラム追加は「唯一の受け皿が仕様書だけ」であり、テーブル追加よりも検知網が薄い。** 本件が2〜3世代にわたり気づかれなかったのはこのためと考えられる。

> ⚠️ **ADR 0002 本体（§8.5）の書き換えは本起票では行わない。** 上記はあくまで指摘であり、ADR の改訂は人間の判断による。

## 修正方針の候補（本起票では実施しない）

1. `includes/class-activator.php` の dbDelta 定義（`:484`〜`:625`）を実読し、上表の**不足6カラム**を `docs/smart-booking-spec.md` §5.2 の該当節へ追記する。
2. 書式は既存節に**厳密に合わせる** — `| カラム | 型 | 説明 |` の3列表・省略記法の MySQL 型名（`bigint PK` / `bigint FK` / `int` / `tinyint(1)` / `varchar(N)` / `text` / `longtext` / `datetime`）。`NOT NULL` / `DEFAULT` 句は書かない。
3. 挿入位置は**実装の列順どおり**にする（上記「列順の照合」参照）。末尾追記は不可。
4. 「説明」列には、`forms` 節の `mail_overrides` に倣って**追加バージョンを併記**すると、次に読む人が世代を追える（例: 「…（v0.4.0で追加）」）。

> **実施は人間 GO 待ちであり、planner / generator の裁量で行わない。** `docs/smart-booking-spec.md` は `CLAUDE.md` が「凍結された正本」と定める文書であり、更新には人間承認が要る（`phase1-schema-expected-tables-stale.md` の修正方針候補3と同じ扱い）。

## 影響範囲

- **ドキュメントのみ。** 出荷コード（`includes/` / `src/` / `uninstall.php` / `smart-booking.php` / `readme.txt`）にもテストにも影響しない。
- **配布プラグインの挙動には影響しない**（実装が正しく、仕様書が古いだけ）。**ユーザー影響ゼロ。**
- **回帰ゲートはブロックしない。** 仕様書を読むコードもテストも存在しない。
- 実害が出るのは「仕様書を信じて実装・調査する」場面に限られる。具体的には次のような誤りを誘発しうる:
  - `custom_fields` を扱う新規コードが `form_id` を無視し、**全フォームのフィールドを混在させる**（v0.4.0 の複数フォーム分離が壊れる）。
  - `stores` / `staff` を扱う新規コードが `is_system` を無視し、**削除できないはずのデフォルト店舗・担当者を削除可能にする**。
  - 外部委託先が §5.2 だけを見て `INSERT` 文を書き、必須でない列を落として意図しない既定値になる。

## 相互参照

- `docs/bugs/phase1-schema-expected-tables-stale.md` — 同一原因の先行事例（テーブル数の陳腐化。2026-09-10 クローズ済み）。本件はその**続き**にあたる。
- `docs/decisions/0002-screenshot-spec-separation.md` §8 — テーブル数陳腐化の決着記録。§8.5 が再発防止の3点セット。
- `includes/class-activator.php::create_tables()`（`:475`〜`:634`）— **スキーマの実質的な正本**。カラム定義の唯一の出所であり、列を追加する `ALTER TABLE` は存在しない（`:290` / `:348` / `:354` はいずれもインデックス操作のみ）ため、`create_tables()` を読めば現行スキーマのカラムは完全に確定できる。


---

## 進捗更新（2026-09-10）: 是正完了・クローズ

人間の GO を受けて是正した。**出荷コードは1バイトも変更していない**（`docs/smart-booking-spec.md` のみ）。

### 是正した6カラム（すべて実装の列順どおりの位置へ挿入。表の末尾には足していない）

| テーブル | カラム | 挿入位置 | 追加Ver |
|---|---|---|---|
| `stores` | `is_system` | `is_active` と `sort_order` の間 | v0.2.0 |
| `staff` | `is_system` | `is_active` と `sort_order` の間 | v0.2.0 |
| `reservations` | `form_id` | `id` の直後（2番目） | v0.4.0 |
| `custom_fields` | `form_id` | `id` の直後（2番目） | v0.4.0 |
| `custom_fields` | `condition_field_key` | `sort_order` と `created_at` の間 | v0.3.0 |
| `custom_fields` | `condition_value` | `condition_field_key` の直後 | v0.3.0 |

### 追加バージョンの裏取り（起票時の宿題を解消）

起票時点では追加バージョンが `class-activator.php` のコメント由来で、**コメント自体の誤りが排除できていなかった**。コミット履歴と突き合わせて確定した。

| カラム | 導入コミット | 日付 | 時点の `package.json` | → 出荷版 |
|---|---|---|---|---|
| `is_system` | `9030e3b` Gen-A: システムエンティティ方式 | 2026-04-26 | 0.1.0 | **v0.2.0** |
| `condition_field_key` / `condition_value` | `14a2c9c` feat(custom-fields): 条件フィールド | 2026-07-14 | 0.2.3 | **v0.3.0** |
| `form_id`（reservations / custom_fields） | `5a434dc` feat(db): 複数フォームのDBスキーマ | 2026-07-15 | 0.3.0 | **v0.4.0** |

判定方法: コミット時点の `package.json` は**リリース bump 前の版**なので、機能はその次のリリースで出荷される。3件とも `class-activator.php` のコメント記載と一致し、**コメントに誤りは無かった**。

### 機械照合の結果（是正後）

実装 DDL（`create_tables()` の `CREATE TABLE` 定義からキー行を除外して抽出）と §5.2 の表を全7節で突き合わせた。

```
OK stores             impl=15 spec=15 missing=[] extra=[] order_match=True
OK staff              impl=12 spec=12 missing=[] extra=[] order_match=True
OK schedules          impl=11 spec=11 missing=[] extra=[] order_match=True
OK reservations       impl=14 spec=14 missing=[] extra=[] order_match=True
OK reservation_meta   impl= 4 spec= 4 missing=[] extra=[] order_match=True
OK forms              impl= 7 spec= 7 missing=[] extra=[] order_match=True
OK custom_fields      impl=12 spec=12 missing=[] extra=[] order_match=True
```

**不足0・余剰0・列順一致。** 起票時に「照合対象外」とした `UNIQUE KEY` 等のインデックス定義は、既存 spec 節の粒度外という判断を維持し、今回も正本化していない（`custom_fields.form_id` の説明文に複合 UNIQUE の存在だけは明記した）。
