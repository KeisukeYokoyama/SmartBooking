# 別件: 予約フロー「仕様 vs 出荷済み設計」の乖離（phase3 赤3件の正体）

最終更新: 2026-07-12
起票元: v0.2.3 BUG-1/2・BUG-4・自動更新フック(b) の回帰確認中に検出。
重大度: 🟡 要プロダクト判断（テスト負債ではない）。
トラック: BUG-A/3/B とは独立。今回（v0.2.3 スコープ拡張作業）では決着しない。

## 事象
既存 E2E の phase3 で3件が恒常失敗:
- `tests/e2e/phase3-validation.spec.js:115`（必須3空送信 → 独立見出し「お客様情報の入力」に到達しない）
- `tests/e2e/phase3-fix1.spec.js:45`（flow_order=B の form→date→time→confirm の多段遷移）
- `tests/e2e/phase3-responsive.spec.js:967`（@media print でアクションボタン非表示）

## これは「本変更起因の回帰」ではない（証跡）
`git stash` で本作業の PHP 3変更（`class-rest-schedules.php` / `class-activator.php` / `smart-booking.php`）を退避し、素の公開 v0.2.2 コードで同3specを再実行 → **変更あり／ベースラインで同一アサートが同一に失敗**（両方 3 failed / 19 passed）。
- `build/`（フロントバンドル）は不変（公開 v0.2.2 と同一）。
- 作業ツリーは `git stash pop` 後に md5 一致で原状復帰確認済み（本変更は保持）。
→ 本作業パッケージのデグレではない。既存の乖離。

## 乖離の中身（仕様 vs 出荷）
- **仕様 3.1/3.2**: 店舗→担当者→日付→時間→フォーム を同一ページ内でステップ切替する多段フロー（と読める）。print 用の体裁も想定。
- **出荷済み設計（v0.2.2）**: `src/frontend/App.jsx:155-167` の単一ページ `MainInputPage` に **date + time + input を1画面統合**。`flow_order` A/B は独立ステップではなく**セクション並び**で吸収。独立見出し「お客様情報の入力」ステップ（`src/frontend/steps/FormInput.jsx:147` の標準ヘッダ）は `hideHeader` で抑制。print CSS の該当挙動は現行設計に無い。
- phase3 の3テストは「多段フロー／print CSS」前提で書かれており、現行の統合設計と食い違う。

## 解決候補（両論併記・要プロダクト判断）
- **候補【有力】: 出荷設計を正とする**
  - 仕様 3.1/3.2 を現行の統合 `MainInputPage` 設計に**追認更新**（正本を出荷実態に合わせる）。
  - phase3 の3テストを統合設計に**現状化**（多段遷移アサートを1画面内表示アサートへ、print CSS 期待は廃止）。
  - 影響小（テストとドキュメントのみ、フロント無改修）。既に出荷・稼働している挙動を追認するため利用者影響なし。
- **別案【影響大】: 多段フローを復元**
  - 仕様 3.1/3.2 の多段フローが要件として正なら、現行フロント（出荷済み）を多段へ改修。
  - frontend 改修＋回帰。出荷済み UX の変更＝利用者影響あり。慎重に。

## 次アクション
- 起点は**仕様書 3.1/3.2 と `MainInputPage` 設計意図の突合**（人間 or ux-evaluator/frontend-generator）。
- 決着後、候補採用に応じて frontend-generator（テスト現状化 or フロント改修）→ logic-evaluator 再確認。
- v0.2.3 リリースは BUG-A/3/B とあわせて本件決着後に人間 GO。
