# H1: `{schedule_time}` の説明が実装と食い違う（管理画面＝誤 / ヘルプ＝正の逆転）

最終更新: 2026-09-10
重大度: 🟡 中（**表示のみ**。メール本文の実出力は正しい）
状態: **調査完了・修正は GO 待ち**

## 事象

管理画面のメール変数ヘルパーが `{schedule_time}` を **「予約時間（例: 14:00〜）」** と説明しているが、
実際に展開されるのは **「14:00〜15:00」**（開始〜終了のレンジ）である。

通常「ヘルプが古く実装が正」だが、本件は**逆転している**。
サイト側ヘルプ `~/dev/smart-booking-website/content/help/markdown/email.md:54` は
`| {schedule_time} | 予約時間（例: 14:00〜15:00） |` と**正しく**書かれており、
**誤っているのは管理画面と仕様書の方**。

## 根本原因

`includes/class-reservation-context.php::format_time_range()`（`:125`〜`:140`）は

- `schedule_id` から `schedules.end_time` を逆引きできれば `14:00〜15:00`
- 逆引きできなければ（枠が削除された等）フォールバックで `14:00〜`

を返す。**説明文はこのフォールバック側の形だけを書いてしまっている。**
同ファイル `:119` の docblock は「`「14:00〜15:00」形式に整形する`」と正しく書かれており、
実装者の意図も通常ケース＝レンジであることは明確。

E2E も実出力がレンジであることを assert 済み:
`tests/e2e/phase4-email.spec.js:277` → `expect( userMail.message ).toContain( '14:00〜15:00' )`。

## 変更範囲（調査結果：該当行だけでは済まない。2行＋ビルド）

| # | 対象 | 内容 |
|---|---|---|
| 1 | `src/admin/pages/settings/TemplateVariableHelper.jsx:15` | `'予約時間（例: 14:00〜）'` → `'予約時間（例: 14:00〜15:00）'` |
| 2 | `docs/smart-booking-spec.md:596` | 同じ誤りが**凍結された正本にも**ある。同時に直さないと次セッションが仕様書を根拠に差し戻す |

**波及は上記2箇所のみ**（実測）:
- `MAIL_VARIABLES` の定義は `TemplateVariableHelper.jsx:9` の**1箇所だけ**。`MailBodyField.jsx:9` 経由で
  `MailSettingsTab` と `FormMailTab` の両方が同じ配列を共有しており、**重複定義は無い**。
- `readme.txt` / `CHANGELOG.md` / `docs/readme-ja.md` に同文字列は**無い**（grep 実測）。
- プラグイン側 `docs/help/markdown/` にも同文字列は**無い**。

## ⚠️ リリースを伴う（重要）

誤った文字列は **`build/admin.js` にバンドル済み**（`grep -o "予約時間（例: 14:00[^）]*）" build/admin.js` → `予約時間（例: 14:00〜）`）。
したがって修正には `npm run build` が必要で、**配布物が変わる＝バージョン bump を伴うリリースになる**。
readme の `Tested up to` のような「メタデータのみ・版据え置き」運用には**乗らない**。

## 推奨

単独リリースは割に合わない。**H2 の UI 文言修正（同じく `src/admin/` のビルドを伴う）と束ねて 1本のパッチリリースにする**のが適切。
