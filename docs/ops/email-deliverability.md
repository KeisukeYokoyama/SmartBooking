# メール到達性 運用ガイド（SMTP ＋ SPF/DKIM/DMARC）

最終更新: 2026-07-13
対象: Smart Booking の予約通知メール（受付/承認）が「届かない」ときの環境側対処。
位置づけ: BUG-3 の主因は**送信トランスポート/到達性の環境要因**（コード経路は正常＝`wp_mail` は正しい宛先/件名/本文で発火）。本ガイドはコード変更ではなく**サーバ運用**での恒久対処。プラグイン側の (i) 失敗可視化（設定「メール通知」タブの注意表示）と併用する。

## なぜ届かないのか（切り分け）
1. **トランスポート未設定（最有力）**: `wp_mail()` は PHP `mail()`／MTA に依存。新規 VPS 等で MTA/SMTP 未設定だと**無言で捨てられる**。
2. **到達性（Gmail 等での拒否・迷惑振り分け）**: 差出人ドメインの認証（SPF/DKIM/DMARC）が未整備だと、サーバ直送メールが受信側で拒否・迷惑フォルダ送りになる。
3. **設定起因の無送信**: テンプレート未設定・宛先メール不正・管理者通知OFF＋店舗メール未設定 等（プラグインの「メール通知」タブの注意表示で気付ける）。

> プラグイン側で「直近の送信に失敗しました」等の注意が出る場合は 1/3、注意が出ないのに届かない場合は 2（受信側で弾かれている）を疑う。

## 対処1: SMTP 送信の導入（推奨・最優先）
サーバの `mail()` 直送をやめ、認証済み SMTP 経由で送る。WordPress では SMTP プラグインを使うのが簡単。
- 代表例: **WP Mail SMTP**、**FluentSMTP**、**Post SMTP** 等（いずれも公式ディレクトリ）。
- 送信元は次のいずれかの**認証済みサービス**を推奨（IP レピュテーション・DKIM 署名を代行）:
  - Google Workspace / Microsoft 365 の SMTP、または SendGrid / Amazon SES / Mailgun / Brevo 等の送信 API/SMTP。
- 設定要点:
  - **From アドレスを実在の独自ドメインのメールボックスに**する（`@gmail.com` を From にしてサーバ直送しない）。
  - SMTP プラグインの From と、Smart Booking 設定「メール通知」タブの差出人（`smart_booking_mail_from_email` / `smart_booking_mail_from_name`）を**一致**させる（不一致は DMARC で弾かれやすい）。
  - 送信テスト機能で実到達を確認する。

## 対処2: 差出人ドメインの認証（SPF / DKIM / DMARC）
独自ドメインの DNS に3レコードを整備する。SMTP/送信サービスの案内値を使う。

### SPF（送信元 IP の許可）
- DNS TXT（ドメイン直下 `@`）に1本。例（SES と Google を併用する例）:
  ```
  v=spf1 include:amazonses.com include:_spf.google.com ~all
  ```
- SPF レコードは**ドメインに1本のみ**（複数 `v=spf1` は不可、`include:` を並べる）。`~all`（softfail）または `-all`（fail）。

### DKIM（電子署名）
- 送信サービスが提供する **DKIM 用の CNAME/TXT レコード**（セレクタ付き）を DNS に追加。
- 例（セレクタ `s1`）: `s1._domainkey.example.com` に送信サービス指定の値。
- SMTP プラグイン/送信サービスの管理画面で DKIM 検証が「有効」になることを確認。

### DMARC（ポリシー）
- DNS TXT `_dmarc.example.com` に1本。まずは監視（`p=none`）から始め、集計レポートで整合を確認してから強化。
  ```
  v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com; fo=1
  ```
- SPF **または** DKIM が「From ドメインと整合（alignment）」していれば DMARC 合格。運用が安定したら `p=quarantine` → `p=reject` へ段階的に強化。

## 検証手順（本番/デモ）
1. SMTP プラグインの「テストメール送信」で自分宛に送り、受信を確認。
2. Gmail 宛に送り、受信メールの「メッセージのソースを表示」で **SPF=pass / DKIM=pass / DMARC=pass** を確認。
3. Smart Booking で実際に予約を1件作成し、受付メール（お客様宛・管理者宛）が届くことを確認。
4. 届かない/失敗する場合は、設定「メール通知」タブの注意表示（BUG-3 (i)）と、SMTP プラグインの送信ログを突き合わせる。

## ローカル開発（wp-env）での確認
- ローカルは実送信せず **MailHog / MailPit** 等でキャプチャして To/Cc/Subject/本文を目視確認する（外部到達性は検証しない）。
- wp-env にメールキャプチャが無い環境では実 `wp_mail` は失敗する（外部へ出ない）。これは想定内で、コード経路の検証は送信インターセプトで行う。

## 注意（プラグイン側の原則）
- Google カレンダー連携・ChatWork 通知は既定 OFF。ユーザーが明示的に有効化した場合のみ通信が発生する。通信先・目的・タイミングは readme.txt に明記済み。本ガイドの SMTP/DNS 整備は**サーバ運用側の対応**であり、プラグインが外部へ勝手に通信するものではない。
