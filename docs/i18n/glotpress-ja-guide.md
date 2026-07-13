# Smart Booking readme 日本語化 — GlotPress 投入ガイド

WordPress.org のプラグインページ（日本語 ja）で、現在英語のままの **「短い説明」** と **「== Description ==」** を日本語表示にするための手順書。翻訳材料は同ディレクトリの [`glotpress-ja-readme.csv`](./glotpress-ja-readme.csv)（28 文字列）。

> **GlotPress への投入と PTE 申請は人間がブラウザで実施する。** 本リポジトリはコミットしても WordPress.org には自動反映されない（GlotPress は別システム）。

---

## 0. 背景（なぜこの作業が要るか）

- readme.txt の実体は既にほぼ日本語だが、**「短い説明（Short Description）」と「== Description ==」だけは英語**（WordPress.org 審査対応で英語本文にした経緯）。
- WordPress.org の ja ページでこの 2 セクションを日本語表示にするには、**readme.txt を書き換えるのではなく GlotPress（translate.wordpress.org）に日本語訳を登録**する。
- Installation / FAQ / Changelog / External services / Screenshots は **原文が既に日本語**なので、ja ページでもそのまま日本語表示され、翻訳登録は不要。
- プラグイン名「Smart Booking」と右サイドバー（Version / Tested up to / Requires / Tags）は **翻訳対象外**。英語のまま。

---

## 1. 貼り付け先

- プロジェクト: <https://translate.wordpress.org/projects/wp-plugins/smart-booking/>
- 言語: **日本語 (ja)** を選択
- サブプロジェクト: **Stable Readme (latest release)** を最優先で投入
  - 余力があれば **Development Readme (trunk)** にも同じ内容を投入しておくと、次リリース時に英語へ戻らない
- 対象: CSV の **28 文字列のみ**（短い説明 ×1 ＋ Description ×27）

各サブプロジェクトの URL 例:

- Stable: `.../wp-plugins/smart-booking/stable-readme/ja/default/`
- Development: `.../wp-plugins/smart-booking/dev-readme/ja/default/`

---

## 2. 照合ルール（どの原文にどの訳を貼るか）

- GlotPress は readme を **原文文字列（English original）単位**に分割して並べる。**その原文文字列に一致する日本語**を CSV から探して貼る。
- **id 順ではなく「原文一致」で対応づける。** GlotPress 側の分割境界が CSV の粒度と多少ずれても、**英語原文で照合**すれば必ず特定できる（CSV の `英語原文` 列は現行 readme.txt と逐語一致）。
- 短い説明（S1）は Description とは別の文字列として現れる。取り違えないこと。
- 対象 2 セクション以外の英語文字列（もしあれば）は触らない。

### 手順の流れ

1. ja のサブプロジェクトを開き、フィルタを **Untranslated（未翻訳）** に絞る。
2. 各原文について CSV から一致行を探し、`日本語訳` 列の値を訳文欄に貼る → 保存。
3. 28 文字列すべてを埋める。

---

## 3. 保持ルール（訳文でも原文どおり残すもの）

次は **翻訳せず原文のまま**訳文に含める:

- コードトークン: `[smart_booking]` / `window.dataLayer` / `$wpdb->prepare()` / `current_user_can('manage_options')` / `store_select` などのステップ名
- URL: `https://github.com/KeisukeYokoyama/SmartBooking` ／ Liberdade・wp-smart-booking の各 URL
- Markdown リンク記法: `[Liberdade Inc.](https://...)` の形をそのまま
- Markdown 強調: `**...**`
- 見出しの `= 見出し =` 記法（`= 主な機能 =` のように **両側の `=` を残す**）
- URL のみの行（D27）は**原文のまま**（翻訳不要）

### マーカーの扱い（重要）

CSV では **readme.txt の原文どおり**、箇条書きに先頭 `* `、見出しに `= =` を付けてある。GlotPress 側の原文文字列の見え方に合わせて調整すること:

- GlotPress の原文に `* ` や `= =` が**含まれていれば** → 訳文にも**そのまま付ける**（CSV の値をそのまま貼る）。
- GlotPress の原文が `* ` / `= =` を**外した本文だけ**で表示される場合 → 訳文からも**同じだけ外して**貼る（マーカーは GlotPress 側が再付与する）。
- 迷ったら「**原文のマーカー有無に、訳文のマーカー有無を合わせる**」が鉄則。二重に付く／消えるのを防ぐ。

---

## 4. 承認（PTE 申請）

- GlotPress の翻訳は登録しただけでは公開反映されず、**承認（approve）が必要**。
- 自分で承認できるように、日本語の **PTE（Project Translation Editor）** を申請する。
- 申請は make.wordpress.org/polyglots に投稿（英語）。付与されると自分の翻訳を current にできる。

### PTE 申請文（そのまま投稿）

```
#editor-requests
Please grant me PTE for the following plugin in Japanese (ja):
Plugin: Smart Booking — https://wordpress.org/plugins/smart-booking/
I am the plugin author (wp.org username: liberdadeinc) and have submitted
Japanese translations for the stable readme. Thank you!
```

> 補足: PTE 付与前でも翻訳の**提案（suggestion）登録**は可能。付与後にまとめて approve すると早い。GTE（一般翻訳エディタ）が先に承認してくれる場合もある。

---

## 5. 期待される表示結果

- **日本語表示になる**: プラグインページ ja の「短い説明」と「Description」本文（主な機能の箇条書き・予約フロー・外部連携・カスタマイズ相談・ソースコードの各段落）。
- **もともと日本語**: Installation / FAQ / Changelog / External services / Screenshots（readme 原文が日本語のため）。
- **英語のまま（翻訳対象外）**: プラグイン名「Smart Booking」、右サイドバー（Version / Tested up to / Requires PHP / Tags）。
- 反映タイミング: 承認後、translate.wordpress.org のビルドが回ってから数十分〜数時間でページに反映されることがある（即時ではない）。

---

## 6. 素材ファイル

| ファイル | 内容 |
|---|---|
| [`glotpress-ja-readme.csv`](./glotpress-ja-readme.csv) | 対訳表。列 = `id, 種別, 英語原文, 日本語訳`。28 行。全行が旧日本語 readme（git `2c9d4a3:readme.txt`）からの逐語再利用（新規翻訳ゼロ）。 |
| 本ファイル | 投入手順・照合／保持ルール・PTE 申請文。 |

対訳の出典:

- 英語原文 = 現行 `readme.txt`（`HEAD`）の「短い説明」「== Description ==」
- 日本語訳 = 全文日本語版 `readme.txt`（git rev `2c9d4a3`）の対応箇所
