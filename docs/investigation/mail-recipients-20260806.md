# メール送信先ロジック 実装調査レポート

- 作成日: 2026-08-06
- 種別: **調査のみ**（コード変更・ビルド・コミットなし）
- 対象コミット: `main` HEAD `05dfe4d`（作業ツリー clean）
- 調査者所感: 相談内容の要件1は**すでに実装済み**、要件2は**未実装**。

---

## 1. 結論サマリ

1. **選ばれた店舗のメールアドレス宛には、すでに送信される。** 予約受付の「管理者宛」メールで、店舗メール（`stores.email`）が To に含まれる（`class-email.php:114-115` / `122-125`）。担当者メール（`staff.email`）は CC。
2. **店舗メールは管理画面から設定できる。** 店舗編集モーダルに「メールアドレス」欄が実在し（`StoreFormModal.jsx:146-154`）、REST も受付・返却・検証する（`class-rest-stores.php:94,177-181`）。**仕様書 §4.4 の「モーダルにメール欄なし」は実装と乖離しており、実装が正**。
3. **「管理者宛に任意の追加アドレスを複数登録」する機能は存在しない。** メール通知の設定は `smart_booking_mail_admin_notify_enabled`（ON/OFF トグル）のみで、追加宛先を入力する option は無い（whitelist: `class-rest-settings.php:51-59`）。
4. 注意点: 「管理者へのメール」トグル **OFF かつ店舗メール未設定**のとき、管理者系の通知は**一切送られない**（`class-email.php:122-124`）。BCC は全メール種別で未使用。
5. 補足（前提の訂正）: 「手動予約作成時はメール送信されない」というポリシーは**存在しない**。管理画面からの手動作成でもフロントと同じ受付フックが発火し、メールが送られる（`class-rest-reservations.php:397-400`）。

---

## 2. 調査結果（A〜D）

### A. 送信先の決定ロジック（`includes/class-email.php`）

送信の起点は 2 メソッド。`send_receipt()`（受付時＝ユーザー宛＋管理者宛）と `send_approval()`（承認時＝ユーザー宛のみ）。実際の `wp_mail()` 呼び出しは共通ヘルパー `send()` に集約。

#### A-1. 管理者宛メールの To / CC / BCC の組み立て

`send_receipt()` 内、`class-email.php:96-152` で組み立てる。**トグル `smart_booking_mail_admin_notify_enabled`（既定 ON=1・`class-email.php:102`）で分岐**。

- **ON（既定）** — `class-email.php:110-119`
  - To ＝ WP 標準 `admin_email`（`is_email` 通過時・`:111-113`）＋ 店舗メール `store_email`（非空かつ `is_email`・`:114-115`）
  - CC ＝ 担当者メール `staff_email`（非空かつ `is_email`・`:117-119`）
- **OFF** — `class-email.php:120-129`
  - `admin_email` は**使わない**
  - 店舗メールが空／不正なら **`return` して管理者宛は一切送らない**（`:122-124`）
  - To ＝ 店舗メールのみ（`:125`）、CC ＝ 担当者メール（`:126-128`）
- To は `array_unique` で重複除去（admin_email と店舗メールが同一の場合など・`:132`）。To が空なら送信しない（`:134-136`）。
- **BCC は存在しない。** ヘッダ生成 `build_headers()` は `From` と `Cc` のみを組む（`class-email.php:388-418`）。

#### A-2. `stores.email` を参照しているか / どのメール種別か

**参照している。** 使われるのは **予約受付・管理者宛（種別 `reception_admin`）のみ**。

- 供給元: `class-reservation-context.php:92` — `'store_email' => is_array($store) ? (string)$store['email'] : ''`（`SELECT * FROM ..._stores WHERE id=%d`・`:45`）。
- 消費: `class-email.php:103` で `$formatted['store_email']` を取得 → `:114-115`（ON）/ `:122-125`（OFF）で管理者宛 To に合流。
- ユーザー宛（受付・承認）は `customer_email` のみを宛先にし、店舗メールは使わない（`send_receipt` user: `class-email.php:87-94` / `send_approval`: `:173-180`）。

#### A-3. `store_email` が空／NULL のときのフォールバック

- DB カラムは `email varchar(255) NOT NULL DEFAULT ''`（`class-activator.php:488`）＝実質「空文字」。
- **ON 時**: 店舗メールが空でも `admin_email` が To に入るため送信は継続（店舗メールが単に追加されないだけ・`class-email.php:110-119`）。
- **OFF 時**: 店舗メールが空／不正なら **`return`（管理者宛を送らない）**＝フォールバック先なし（`class-email.php:122-124`）。
- さらに最終段 `send()` でも、To 配列が空になれば送信せず `record_error('skipped_invalid_recipient', ...)` で診断記録のみ（`class-email.php:293-297`）。
- 補足: 初期シードされる**システム店舗**（`is_system=1`）の email は `admin_email` が入る（`class-activator.php:656`）が、利用者が作成する通常店舗の初期 email は空（管理画面で入力するまで空・既定行の staff は空 `:687`）。

#### A-4. `staff.email` が CC か / 空のときの挙動

- **CC として使われる。** 供給元 `class-reservation-context.php:94`、消費 `class-email.php:104` → `:117-119`（ON）/ `:126-128`（OFF）。
- 空／不正なら CC に追加されないだけで挙動に影響なし（`build_headers()` も `is_email` チェック・`class-email.php:408-415`）。

#### A-5. カンマ区切り等の複数アドレスを `wp_mail()` にそのまま渡すか

- 管理者 To は**配列で組み立て**、`send()` は「配列 or 単一文字列」を受け、`array_filter` で **`is_email()` を通過した要素だけ**残す（`class-email.php:284-292`）。**カンマ区切り文字列の分割は行わない。**
- したがって、1 つのフィールドに `"a@x.com, b@y.com"` を入れると、その文字列全体が `is_email` 不通過 → 除外され送信されない。
- 店舗メール欄も REST 側で `sanitize_email()` ＋ `is_email()` の**単一アドレス検証**（`class-rest-stores.php:177-181`）。**1 フィールドに複数アドレスを入れることは不可**（不正なら `smb_store_email_invalid` 400）。
- 別々の宛先を「配列の別要素」として渡せば複数送信は可能だが、その配列を作っているのは `send_receipt` のロジック（admin_email＋店舗＋CC担当者）のみで、任意アドレスを注入する経路は現状ない。

---

### B. 管理画面から店舗メールを設定できるか

#### B-1. 店舗編集モーダルに「メールアドレス」入力欄が存在するか

**存在する。** `src/admin/pages/stores/StoreFormModal.jsx`:
- 初期値 `email: ''`（`:25`）
- 形式バリデーション（`:63-64`、不正時 `'メールアドレスの形式が正しくありません。'`）
- 入力欄 `label="メールアドレス" type="email"`＋**help「予約通知メールの送信先になります。」**（`:146-154`）
- 一覧カードにも表示: `StoreCard.jsx:53-56`（`store.email` を表示）
- **担当者モーダルにも同等のメール欄あり**（`StaffFormModal.jsx:135-139`、初期値 `:17`、検証 `:54-55`）。

#### B-2. REST が email を POST/PUT で受付・GET で返却・サニタイズ

- **受付（POST/PUT）**: `sanitize_input()` が email を受け取り、`sanitize_email()`（`:178`）＋ `is_email()`（`:179`）で検証。不正なら `smb_store_email_invalid` 400（`class-rest-stores.php:177-181`）。
- **返却（GET）**: `format_row()` が `'email' => $row['email']` を返す（`class-rest-stores.php:94`）。
- INSERT/UPDATE のフォーマット指定にも email 用 `%s` が含まれる（`:224` / `:263`）。

#### B-3. 「カラムだけあって UI が無い」状態か

**該当しない。** DB カラム（`class-activator.php:488`）・REST（受付/返却/検証）・管理 UI（入力/表示）の**三層すべてが揃っている**。店舗メールは実運用可能。
→ **仕様書 §4.4（店舗追加モーダルにメール欄なし）は古く、実装と乖離。実装が §8.2 の意図と整合する方向で成立している。**

---

### C. 管理者宛の送信先に関する設定項目

#### C-1 / C-2. 追加宛先を指定する option の有無

- **追加宛先を入力する option は存在しない。** 管理者宛に関する設定は **ON/OFF トグル `smart_booking_mail_admin_notify_enabled`（bool）** ただ 1 つ（whitelist `class-rest-settings.php:53`）。
- UI もトグル 1 個のみ（`MailSettingsTab.jsx:33,42`、OFF 化時に確認ダイアログ `:255-274`）。任意アドレスの入力欄は無い。
- 管理者宛の実効宛先は「`admin_email`（WP 標準）＋店舗メール＋担当者 CC」に**コードで固定**され、UI から追加アドレスを注入する手段はない。

#### C-3. `smart_booking_settings_email` 系 whitelist キー一覧

`includes/rest/class-rest-settings.php:51-59`（メール通知セクション）:

| option キー | 型 |
|---|---|
| `smart_booking_mail_from_name` | text |
| `smart_booking_mail_from_email` | email |
| `smart_booking_mail_admin_notify_enabled` | bool |
| `smart_booking_mail_receipt_user_subject` | text |
| `smart_booking_mail_receipt_user_body` | html |
| `smart_booking_mail_receipt_admin_subject` | text |
| `smart_booking_mail_receipt_admin_body` | html |
| `smart_booking_mail_approval_user_subject` | text |
| `smart_booking_mail_approval_user_body` | html |

（差出人 From は `class-email.php:388-406` で `smart_booking_mail_from_email` → 無ければ `admin_email`、`smart_booking_mail_from_name` → 無ければ `blogname`。宛先とは別軸。）

---

### D. 影響範囲の把握

#### D-1. v0.5.0 `mail_overrides`（フォーム別メール文面）が宛先に影響しないか

**影響しない（確認済み）。** `resolve_template()` / `get_form_override()` は **件名・本文のみ**を返す（`class-email.php:195-256`）。To / CC の組み立ては `send_receipt()` が**独立に**行い（`class-email.php:107-152`）、override は宛先ロジックに一切関与しない。

#### D-2. 手動予約作成時のメール送信ポリシー

**注意: 「手動作成では送らない」ポリシーは存在しない。** 手動作成 `create_item()` は保存後に受付フックを発火する:
`class-rest-reservations.php:397-400`
> `// 管理画面からの手動作成でもフロント送信と同じ後続処理を走らせる。`
> `do_action( 'smart_booking_reservation_received', $id );`

これを `Smart_Booking_Integrations::on_received()` が購読し `send_receipt()` を呼ぶ（`class-integrations.php:40,55-63`）。**手動作成でもユーザー宛・管理者宛の受付メールが送られる**（フロント予約と同一経路）。要件検討時はこの前提に注意。

#### D-3. 承認メール（ユーザー宛）は別系統か / 共通ヘルパー経由か

**共通ヘルパー経由。** `send_approval()` も `resolve_template()` ＋ `send()` を共有する（`class-email.php:160-181`）。ただし宛先は `customer_email` のみで、店舗メール・担当者 CC・追加アドレスは関与しない（承認は「ユーザーへの確定通知」のため設計上ユーザー宛限定）。

---

## 3. 仕様書 §8.2 と実装の一致・乖離

| 論点 | 仕様書 | 実装 | 判定 |
|---|---|---|---|
| 管理者宛＝店舗メール | §8.2「管理者宛＝店舗のメールアドレス」 | 店舗メールを管理者 To に含める（＋トグル ON 時は `admin_email` も） | **概ね一致**（実装は `admin_email` も併用・トグルで制御） |
| 担当者メールを CC | §8.2「担当者メールがあれば CC」 | `staff.email` を CC（`class-email.php:117-119`） | **一致** |
| 店舗追加モーダルの入力項目 | §4.4「メールアドレス欄なし」 | メール欄あり（`StoreFormModal.jsx:146-154`） | **乖離（実装が正）** |

→ 仕様書内の矛盾は「§8.2 が正しく、§4.4 の入力項目リストが古い」と読むのが実装と整合する。**実装は §8.2 に沿って store/staff メールを宛先に使うよう完成している。**

---

## 4. 相談への対応に必要な変更の候補と影響範囲

> 実装はしない（本タスクは調査のみ）。以下は工数感・リスクの見積り。

### 要望1「選ばれた店舗のメール宛にも送信できるか」

**→ 追加実装不要。すでに実現済み。** ユーザー案内で足りる:

- 各店舗の編集画面「メールアドレス」欄に校舎のアドレスを入力すれば、その店舗の予約受付通知が当該アドレス宛に届く。
- 「管理者へのメール」トグル **ON** なら `admin_email` と**併せて**店舗宛にも届く。**OFF** なら店舗宛のみ（この場合、店舗メール未設定だと管理者系は送られない点に注意）。
- 担当者にメールを設定すれば CC される。
- 制約: 店舗メールは**単一アドレスのみ**（1 校舎 1 アドレス）。

> 運用上の落とし穴として、**OFF かつ店舗メール空**だと管理者系通知が飛ばない現仕様（`class-email.php:122-124`）は、案内時に明示すべき。

### 要望2「管理者宛に別のメールアドレスを複数追加できるか」

**→ 未実装。新規実装が必要。** 候補 2 案。

#### 案A（推奨）: 追加宛先 option を新設し管理者 To/BCC に合流

- 新 option 例 `smart_booking_mail_admin_extra_recipients`（改行 or カンマ区切りの複数アドレス）。
- 変更点:
  - `class-rest-settings.php` の whitelist に追加＋**複数アドレス対応の sanitize 型**を新設（既存 `email` 型は単一前提のため流用不可）。
  - `MailSettingsTab.jsx` に textarea＋クライアント検証。
  - `class-email.php` の管理者 To（または BCC）組み立てに合流（`is_email` フィルタは既存 `send()` が担保）。
  - `class-activator.php` の defaults に空値追加、必要なら `readme.txt` 追記。
- 公開契約: **option 追加は「追加のみ・非破壊」**。DB スキーマ変更なし（option のみ）＝**マイグレーション不要**。v0.5.1（空き状況カスタマイズ）の option 追加パターンとほぼ同型。
- 工数感: **中**（バックエンド＝whitelist＋複数アドレス sanitize＋合流／フロント＝入力 UI＋検証／新規 E2E／logic・ux 検証）。
- リスク:
  - デグレは**初期値を空**にすれば回避可（空＝現行と byte 一致）。
  - 複数アドレス sanitize を既存の単一 `email` 型と混同しないこと。
  - **To に入れると受信者間でアドレスが相互に見える**。プライバシー観点で To/BCC どちらにするか要件確認が必要。
  - トグル OFF 時の追加宛先の扱い（OFF でも追加宛先は送る？）を仕様として明確化する必要。

#### 案B（非推奨）: 店舗メール欄を複数アドレス対応にする

- リスク大。既存 `stores.email` は**単一アドレス前提**（REST の `is_email` 検証、`reservation-context` の `store_email` 単一文字列、店舗カード表示、CSV 等が単一前提）。複数化は検証・context・表示の全層に波及し、**既存カラムの意味変更**（凍結対象の公開契約に抵触しうる）に近い。要望2 の解としては案A が適切。

いずれも本タスクの範囲外（人間承認のうえ別タスクで着手）。

---

## 5. 未確認事項（コードで断定できなかった点）

- 特になし。A〜D の各項目はすべてコード上の該当行で確認済み（ファイル名:行番号を本文に明記）。
- 実挙動（実際に wp-env で送信して To/CC を捕捉する `pre_wp_mail` 検証）は本調査では実施していない（静的コード読解のみ）。挙動の最終確証が必要なら logic-evaluator による送信捕捉テストを別途推奨。
