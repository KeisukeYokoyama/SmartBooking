<?php
/**
 * Smart Booking - 公式サイト ヘルプページ用スクリーンショット撮影のためのデモデータ シーダ（開発用ツール）。
 *
 * ⚠️ 出荷対象外。`tests/` は .distignore で ZIP から除外されるため WordPress.org には含まれない。
 * 出荷コード（includes/ src/ smart-booking.php uninstall.php）には一切依存されない・変更しない。
 *
 * 実行は WP-CLI 経由（tests/screenshots/seed/screenshot-seed.php / screenshot-purge.php）。
 *
 * 設計の要点
 * ---------------------------------------------------------------------------
 * - **冪等**: 何度実行しても同じ状態に収束する。作成した行の id はすべてレジストリ option
 *   `smart_booking_screenshot_seed` に記録し、2 回目以降は「レジストリに載っている id の行だけ」を
 *   対象に UPDATE / DELETE する。TRUNCATE は使わない。DELETE は必ずレジストリ id の IN 句で絞る。
 * - **ユーザーの既存データを巻き込まない**: レジストリ外の行は読むだけで、作成・更新・削除しない。
 *   例外は「表示系オプション 2 件」と「管理画面ロケール（WPLANG / 管理者の locale user_meta）」で、
 *   これらは変更前の値をレジストリに退避し purge で完全復元する。
 * - **ロケールは撮影セッションの間だけ ja**: 既存マニュアル画像（日本語 UI）と揃えるため WPLANG を
 *   ja にする。回帰スイート（npx playwright test）は wp-env のグローバル状態を共有するため、
 *   ja を恒久化せず purge で必ず元へ戻せる形（レジストリ退避）に封じ込めている。
 *   言語パックのダウンロードは開発用シード内の処理であり、出荷コードの外部通信ではない。
 *   ダウンロードに失敗してもシード全体は落とさず、警告を出して他のデータ投入を続行する。
 * - **id 安定性**: 店舗 / 担当者 / フォーム / カスタムフィールドは DELETE→INSERT ではなく UPDATE で
 *   内容を揃える（ショートコード `[smart_booking form_id="N"]` の N を実行ごとに変えないため）。
 *   スケジュール / 予約は「今日からの相対日付」で作るためレジストリ id スコープで削除→再生成する（id は変わる）。
 * - **孤児を作らない**: 削除は 予約メタ → 予約 → スケジュール の順。さらにレジストリ外の予約から
 *   参照されているスケジュールは削除せず保護する（保護した id はレジストリに残す）。
 * - **デモ店舗 / デモ担当者は一覧の先頭に出す**: sort_order を 1 から固定採番する（DEMO_SORT_START）。
 *   回帰用フィクスチャ `店舗1` / `担当者1`（sort_order=10・tests/e2e/phase3-helpers.js が基線として
 *   再 INSERT する行）を消さずに、デモ側を上へ出すための非破壊の手段。フィクスチャの行には触れない。
 *   システムエンティティ `デフォルト`（is_system=1・sort_order=0）が最小である前提は崩さない。
 * - **出力は CLI テキスト**: `error_log()` は使わない。WP_CLI::log()（無い環境では echo）。
 *   HTML 文脈ではないため esc_html() は適用しない（ターミナル出力を壊さないため）。
 *
 * 実スキーマ（includes/class-activator.php::create_tables() 準拠）にのみ依存し、
 * dbDelta / smart_booking_db_version には一切触れない。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Smart_Booking_Screenshot_Seeder' ) ) {

	/**
	 * 撮影用デモデータの投入・撤去を担うシーダ（開発用）。
	 */
	class Smart_Booking_Screenshot_Seeder {

		/**
		 * 作成した行の id を記録するレジストリ option 名。
		 */
		const REGISTRY_OPTION = 'smart_booking_screenshot_seed';

		/**
		 * レジストリの構造バージョン（将来の構造変更時に読み替えるための互換キー）。
		 *
		 * 2: user_locales 区画（ユーザー個別ロケールの退避）を追加。
		 */
		const REGISTRY_VERSION = 2;

		/**
		 * スケジュールを生成する日数（今日から N 日間）。
		 */
		const SCHEDULE_DAYS = 21;

		/**
		 * 1 日あたりの枠（start, end）。面談型を想定した 60 分枠。
		 */
		const SLOTS = array(
			array( '10:00:00', '11:00:00' ),
			array( '11:00:00', '12:00:00' ),
			array( '14:00:00', '15:00:00' ),
			array( '15:00:00', '16:00:00' ),
		);

		/**
		 * 枠の状態パターン（capacity / booked_count）。
		 *
		 * includes/rest/class-rest-public.php::get_availability() の判定式に合わせている。
		 * 既定（smart_booking_few_left_threshold 未設定）は複合式:
		 *   few_left ⇔ 空き <= 2 または 空き <= ceil(capacity * 0.3)
		 *
		 *   capacity=6, booked=0 → 空き6 (>2, >ceil(1.8)=2) …… available（空きあり）
		 *   capacity=6, booked=4 → 空き2 (<=2)             …… few_left（残りわずか）
		 *   capacity=6, booked=6 → 空き0                   …… full（満席）
		 *
		 * パターン 0 と 1 はどちらも「空きあり」。1 は予約行の受け皿にする枠で、
		 * 予約を 1 件割り当てたときだけ booked_count を 1 にする（＝booked_count は
		 * 実在する非キャンセル予約数と厳密に一致する）。
		 */
		const SLOT_STATES = array(
			0 => array(
				'capacity' => 6,
				'booked'   => 0,
			),
			1 => array(
				'capacity' => 6,
				'booked'   => 0,
			),
			2 => array(
				'capacity' => 6,
				'booked'   => 4,
			),
			3 => array(
				'capacity' => 6,
				'booked'   => 6,
			),
		);

		/**
		 * 撮影のために変更する表示系オプション（キー => 設定値）。
		 *
		 * 変更前の値（存在有無を含む）はレジストリへ退避し、purge で完全に元へ戻す。
		 */
		const MANAGED_OPTIONS = array(
			'smart_booking_show_store_front'           => 1,
			'smart_booking_show_staff_front'           => 1,
			// メール共通文面（includes/class-activator.php の既定値と同一）。
			// wp-env は回帰スイートのフィクスチャ（「共通受付件名」等のダミー文字列）で
			// 上書きされていることがあり、そのまま撮ると「設定 → メール通知」タブや
			// フォーム設定のメールタブ（OFF 時の共通文面プレビュー）にテスト用の文字列が写る。
			// 既定値へそろえてから撮り、purge で撮影前の値へ完全に戻す。
			'smart_booking_mail_receipt_user_subject'  => '【{store_name}】ご予約を受け付けました',
			'smart_booking_mail_receipt_user_body'     => "{customer_name} 様\n\nご予約を受け付けました。\n下記内容にて承りました。\n\n▼ご予約内容\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n担当: {staff_name}\n予約番号: {reservation_id}\n\n内容に変更がある場合はご連絡ください。",
			'smart_booking_mail_receipt_admin_subject' => '【新規予約】{customer_name} 様 ({schedule_date} {schedule_time})',
			'smart_booking_mail_receipt_admin_body'    => "新しい予約が入りました。\n\n予約番号: {reservation_id}\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n担当: {staff_name}\n予約者: {customer_name}\nメール: {customer_email}\n電話: {customer_phone}",
			'smart_booking_mail_approval_user_subject' => '【{store_name}】ご予約が確定しました',
			'smart_booking_mail_approval_user_body'    => "{customer_name} 様\n\nご予約が確定しました。\n\n▼ご予約内容\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n担当: {staff_name}\n予約番号: {reservation_id}\n\n当日お待ちしております。",
		);

		/**
		 * デモ店舗 / デモ担当者に与える sort_order の開始値（以降 +1 ずつ）。
		 *
		 * なぜ「小さい固定値」なのか:
		 *   管理画面の一覧は sort_order ASC, id ASC（includes/rest/class-rest-stores.php::get_items() /
		 *   class-rest-staff.php::get_items()）。既存の回帰用フィクスチャ（`店舗1` / `担当者1`・
		 *   sort_order=10・tests/e2e/phase3-helpers.js が基線として再 INSERT する行）が先頭に居ると、
		 *   住所も電話も空のカードがマニュアル画像の一等地に写り込んでしまう。
		 *   フィクスチャは回帰スイートが依存する load-bearing な行なので削除も更新もできない。
		 *   そこで「デモ側の sort_order をフィクスチャ(10)より小さくして上に並べる」非破壊の方法を採る。
		 *   撤去（purge）でデモ行ごと消えるため元の並びに完全復帰する。
		 *
		 * 1 から始める理由:
		 *   0 はシステムエンティティ `デフォルト`（is_system=1）が使っており、
		 *   「デフォルト = sort_order 最小」という前提（v0.5.2）を崩さないため 0 は避ける。
		 *   負値も同じ理由で使わない。
		 *
		 * 既存ユーザー行との衝突について:
		 *   ユーザーの店舗が 1〜3 を使っていると同値になり id ASC で順序が決まる（デモが後ろになる）。
		 *   これは撮影用の開発ツールとして許容する。撮影は wp-env のクリーン環境で行う前提であり、
		 *   ユーザー行を書き換えて回避することは（非破壊の原則に反するため）しない。
		 */
		const DEMO_SORT_START = 1;

		/**
		 * 撮影時の管理画面ロケール。既存 27 枚のマニュアル画像が日本語 UI のため揃える。
		 */
		const TARGET_LOCALE = 'ja';

		/**
		 * サイト既定ロケールを保持する option 名（WordPress コア）。
		 *
		 * MANAGED_OPTIONS とは別扱いにしている（言語パックの導入可否で設定するか決めるため）が、
		 * 退避先は同じ registry['options'] 区画なので purge の復元経路は共通。
		 */
		const LOCALE_OPTION = 'WPLANG';

		/**
		 * 店舗定義（スラッグ => 値）。スラッグはレジストリのキーであり id 安定性の軸。
		 *
		 * @return array<string,array<string,mixed>>
		 */
		private static function store_defs() {
			return array(
				'shibuya'  => array(
					'name'           => '渋谷店',
					'phone'          => '03-0000-0001',
					'email'          => 'shibuya@example.com',
					'prefecture'     => '東京都',
					'city'           => '渋谷区',
					'address_line'   => '渋谷1-2-3 サンプルビル5F',
					'description'    => 'JR渋谷駅から徒歩5分。個室でご相談をお受けします。',
					'calendar_color' => '#3B82F6',
				),
				'shinjuku' => array(
					'name'           => '新宿店',
					'phone'          => '03-0000-0002',
					'email'          => 'shinjuku@example.com',
					'prefecture'     => '東京都',
					'city'           => '新宿区',
					'address_line'   => '西新宿2-4-5 サンプルタワー12F',
					'description'    => '新宿駅西口から徒歩7分。土曜も相談を受け付けています。',
					'calendar_color' => '#10B981',
				),
				'yokohama' => array(
					'name'           => '横浜店',
					'phone'          => '045-000-0003',
					'email'          => 'yokohama@example.com',
					'prefecture'     => '神奈川県',
					'city'           => '横浜市西区',
					'address_line'   => '北幸1-6-7 サンプル第2ビル3F',
					'description'    => '横浜駅きた西口から徒歩4分。駐車場をご用意しています。',
					'calendar_color' => '#F59E0B',
				),
			);
		}

		/**
		 * 担当者定義（スラッグ => 値）。store は store_defs() のスラッグ参照。
		 *
		 * @return array<string,array<string,mixed>>
		 */
		private static function staff_defs() {
			return array(
				'yamada' => array(
					'store'       => 'shibuya',
					'name'        => '山田 太郎',
					'email'       => 'yamada@example.com',
					'phone'       => '03-0000-0001',
					'description' => '初回相談を担当します。土日のご相談も承ります。',
				),
				'sato'   => array(
					'store'       => 'shibuya',
					'name'        => '佐藤 花子',
					'email'       => 'sato@example.com',
					'phone'       => '03-0000-0001',
					'description' => 'オンライン相談を中心に担当しています。',
				),
				'suzuki' => array(
					'store'       => 'shinjuku',
					'name'        => '鈴木 一郎',
					'email'       => 'suzuki@example.com',
					'phone'       => '03-0000-0002',
					'description' => '新宿店の相談窓口を担当しています。',
				),
				'tanaka' => array(
					'store'       => 'yokohama',
					'name'        => '田中 次郎',
					'email'       => 'tanaka@example.com',
					'phone'       => '045-000-0003',
					'description' => '横浜店の相談窓口を担当しています。',
				),
			);
		}

		/**
		 * フォーム定義（スラッグ => 値）。既存のデフォルトフォーム行（forms テーブル）には一切触れない。
		 *
		 * `mail_overrides` を持つ定義は、そのフォームの専用メール文面として JSON 列へ保存する
		 * （includes/rest/class-rest-forms.php::normalize_mail_overrides() と同じ 3 種別・同じ形）。
		 * enabled=true の種別は件名・本文の両方を必ず埋める（REST 側の検証と同条件）。
		 *
		 * `trial`（無料体験のお申し込み）はヘルプ原稿 form-mail.md / forms.md が例示に使っている
		 * フォーム名。原稿と画像の名前がずれないよう、この名前で固定する。
		 *
		 * @return array<string,array<string,mixed>>
		 */
		private static function form_defs() {
			return array(
				'first_consult'  => array( 'name' => '初回相談フォーム' ),
				'online_consult' => array( 'name' => 'オンライン相談フォーム' ),
				'trial'          => array(
					'name'           => '無料体験のお申し込み',
					'mail_overrides' => array(
						'reception_user'  => array(
							'enabled' => true,
							'subject' => '【無料体験】お申し込みを受け付けました（{store_name}）',
							'body'    => "{customer_name} 様\n\n無料体験のお申し込みを受け付けました。\n\n▼お申し込み内容\n日時: {schedule_date} {schedule_time}\n教室: {store_name}\n担当: {staff_name}\n受付番号: {reservation_id}\n\n当日は筆記用具をお持ちください。教室は駅東口から徒歩3分です。\nご不明な点がありましたらお気軽にご連絡ください。",
						),
						'reception_admin' => array(
							'enabled' => false,
							'subject' => '',
							'body'    => '',
						),
						'approval_user'   => array(
							'enabled' => false,
							'subject' => '',
							'body'    => '',
						),
					),
				),
			);
		}

		/**
		 * カスタムフィールド定義（フォームスラッグ => [フィールドスラッグ => 値]）。
		 *
		 * - field_key は ASCII（sanitize_key 相当）。日本語はラベル側に置く。
		 * - 氏名 / メールアドレス / 電話番号は保護フィールド（PROTECTED_KEYS）。REST 経由の
		 *   フォーム作成では自動生成されるが、ここでは直接 INSERT するため自前で用意し、
		 *   レジストリ管理下に置く（purge で確実に消えるようにするため）。
		 * - address 型は field_options に選択肢ではなく {"autofill":bool} を格納する
		 *   （includes/rest/class-rest-custom-fields.php::format_row() 準拠）。
		 * - 条件フィールドは condition_field_key（親の field_key）と condition_value（親の選択肢の値）。
		 *   親は radio/select のみ・ネスト禁止・sort_order は親より後ろ。
		 * - **スラッグ `default` は既定フォーム（forms.is_default = 1）を指す特別扱い**。
		 *   既定フォームの行そのものは作らない・触らないが、そこへ撮影用の項目だけを足す
		 *   （ヘルプ原稿 conditional-fields.md / address-field.md が「標準フォーム」を例示に
		 *   使っており、フロントの固定ページに貼られたショートコード `[smart_booking]` も
		 *   既定フォームを表示するため）。足した項目はレジストリ管理下なので purge で消え、
		 *   既定フォームの初期3項目（お名前 / メールアドレス / 電話番号）は一切変更しない。
		 *
		 * @return array<string,array<string,array<string,mixed>>>
		 */
		private static function field_defs() {
			return array(
				'first_consult'  => array(
					'customer_name'      => array(
						'field_key'   => 'customer_name',
						'field_label' => '氏名',
						'field_type'  => 'text',
						'placeholder' => '山田 太郎',
						'is_required' => 1,
						'sort_order'  => 0,
					),
					'customer_email'     => array(
						'field_key'   => 'customer_email',
						'field_label' => 'メールアドレス',
						'field_type'  => 'email',
						'placeholder' => 'example@example.com',
						'is_required' => 1,
						'sort_order'  => 1,
					),
					'customer_phone'     => array(
						'field_key'   => 'customer_phone',
						'field_label' => '電話番号',
						'field_type'  => 'tel',
						'placeholder' => '090-1234-5678',
						'is_required' => 1,
						'sort_order'  => 2,
					),
					'consult_body'       => array(
						'field_key'   => 'consult_body',
						'field_label' => 'ご相談内容',
						'field_type'  => 'textarea',
						'placeholder' => 'ご相談の概要をご記入ください。',
						'is_required' => 0,
						'sort_order'  => 3,
					),
					'consult_type'       => array(
						'field_key'     => 'consult_type',
						'field_label'   => 'ご相談の種別',
						'field_type'    => 'radio',
						'field_options' => array( '初めて', '2回目以降' ),
						'is_required'   => 1,
						'sort_order'    => 4,
					),
					'consult_address'    => array(
						'field_key'   => 'consult_address',
						'field_label' => 'ご住所',
						'field_type'  => 'address',
						'autofill'    => true,
						'is_required' => 0,
						'sort_order'  => 5,
					),
					'consult_first_note' => array(
						'field_key'           => 'consult_first_note',
						'field_label'         => '初回相談で気になる点',
						'field_type'          => 'textarea',
						'placeholder'         => '初めての方のみご記入ください。',
						'is_required'         => 0,
						'sort_order'          => 6,
						'condition_field_key' => 'consult_type',
						'condition_value'     => '初めて',
					),
				),
				'online_consult' => array(
					'customer_name'  => array(
						'field_key'   => 'customer_name',
						'field_label' => '氏名',
						'field_type'  => 'text',
						'placeholder' => '山田 太郎',
						'is_required' => 1,
						'sort_order'  => 0,
					),
					'customer_email' => array(
						'field_key'   => 'customer_email',
						'field_label' => 'メールアドレス',
						'field_type'  => 'email',
						'placeholder' => 'example@example.com',
						'is_required' => 1,
						'sort_order'  => 1,
					),
					'customer_phone' => array(
						'field_key'   => 'customer_phone',
						'field_label' => '電話番号',
						'field_type'  => 'tel',
						'placeholder' => '090-1234-5678',
						'is_required' => 1,
						'sort_order'  => 2,
					),
					'online_tool'    => array(
						'field_key'     => 'online_tool',
						'field_label'   => 'ご希望のオンラインツール',
						'field_type'    => 'select',
						'field_options' => array( 'Zoom', 'Google Meet' ),
						'is_required'   => 0,
						'sort_order'    => 3,
					),
				),
				'trial'          => array(
					'customer_name'  => array(
						'field_key'   => 'customer_name',
						'field_label' => '氏名',
						'field_type'  => 'text',
						'placeholder' => '山田 太郎',
						'is_required' => 1,
						'sort_order'  => 0,
					),
					'customer_email' => array(
						'field_key'   => 'customer_email',
						'field_label' => 'メールアドレス',
						'field_type'  => 'email',
						'placeholder' => 'example@example.com',
						'is_required' => 1,
						'sort_order'  => 1,
					),
					'customer_phone' => array(
						'field_key'   => 'customer_phone',
						'field_label' => '電話番号',
						'field_type'  => 'tel',
						'placeholder' => '090-1234-5678',
						'is_required' => 1,
						'sort_order'  => 2,
					),
					// form-mail.md 02-variable-helper が例示する「体験コース」。
					// 選択式（radio/select）をこのフォームに置かないこと。
					// conditional-fields.md 02-no-parent-candidate が「親候補0件のフォーム」
					// としてこのフォームの項目の編集モーダルを使う。
					'trial_course'   => array(
						'field_key'   => 'trial_course',
						'field_label' => '体験コース',
						'field_type'  => 'text',
						'placeholder' => '例：算数（小4）',
						'is_required' => 0,
						'sort_order'  => 3,
					),
				),
				'default'        => array(
					// conditional-fields.md が例示する親子ペア（資料送付 → 送付先住所）。
					// sort_order は既存の保護フィールド（10 / 20 / 30）より後ろに置く。
					'material_send'    => array(
						'field_key'     => 'material_send',
						'field_label'   => '資料送付',
						'field_type'    => 'radio',
						'field_options' => array( '希望する', '希望しない' ),
						'is_required'   => 0,
						'sort_order'    => 40,
					),
					'shipping_address' => array(
						'field_key'           => 'shipping_address',
						'field_label'         => '送付先住所',
						'field_type'          => 'textarea',
						'placeholder'         => '郵便番号・住所をご記入ください。',
						'is_required'         => 0,
						'sort_order'          => 50,
						'condition_field_key' => 'material_send',
						'condition_value'     => '希望する',
					),
					// address-field.md が例示する住所（郵便番号）項目。自動入力は既定 ON。
					'home_address'     => array(
						'field_key'   => 'home_address',
						'field_label' => 'ご住所',
						'field_type'  => 'address',
						'autofill'    => true,
						'is_required' => 0,
						'sort_order'  => 60,
					),
				),
			);
		}

		/**
		 * 予約定義。status は includes/rest/class-rest-reservations.php::ALLOWED_STATUSES の実値
		 * （pending=承認待ち / approved=承認済み / cancelled=キャンセル）。
		 *
		 * - store: 割り当て先スケジュールの店舗スラッグ（予約を 3 店舗に分散させる）。
		 * - meta: reservation_meta へ入れる回答値。address 型は {key}_zip（7桁・ハイフン無し）と
		 *   {key}_address の 2 行に分けて保存する（class-rest-public.php の保存形と同一）。
		 * - 条件フィールド consult_first_note は「ご相談の種別＝初めて」のときだけ meta を作る
		 *   （条件不成立なら meta 行を作らないという製品側の挙動に合わせる）。
		 *
		 * @return array<int,array<string,mixed>>
		 */
		private static function reservation_defs() {
			return array(
				array(
					'slug'   => 'takahashi',
					'form'   => 'first_consult',
					'store'  => 'shibuya',
					'name'   => '高橋 健太',
					'email'  => 'takahashi@example.com',
					'phone'  => '090-0000-0001',
					'status' => 'approved',
					'memo'   => '',
					'meta'   => array(
						'consult_body'         => '遺産分割の進め方について相談したいです。',
						'consult_type'         => '初めて',
						'consult_address_zip'  => '1500002',
						'consult_address_address' => '東京都渋谷区渋谷1-2-3 サンプルマンション101',
						'consult_first_note'   => '相談時間と費用の目安を知りたいです。',
					),
				),
				array(
					'slug'   => 'watanabe',
					'form'   => 'first_consult',
					'store'  => 'shinjuku',
					'name'   => '渡辺 さくら',
					'email'  => 'watanabe@example.com',
					'phone'  => '090-0000-0002',
					'status' => 'approved',
					'memo'   => '',
					'meta'   => array(
						'consult_body'        => '契約書の内容を確認してほしいです。',
						'consult_type'        => '2回目以降',
						'consult_address_zip' => '1600023',
						'consult_address_address' => '東京都新宿区西新宿2-4-5 サンプルコート302',
					),
				),
				array(
					'slug'   => 'nakamura',
					'form'   => 'first_consult',
					'store'  => 'yokohama',
					'name'   => '中村 大輔',
					'email'  => 'nakamura@example.com',
					'phone'  => '090-0000-0003',
					'status' => 'pending',
					'memo'   => '折り返しの電話は平日夜を希望。',
					'meta'   => array(
						'consult_body'        => '相続の手続きについて相談したいです。',
						'consult_type'        => '初めて',
						'consult_address_zip' => '2200004',
						'consult_address_address' => '神奈川県横浜市西区北幸1-6-7 サンプルハイツ505',
						'consult_first_note'  => '必要な書類を事前に知りたいです。',
					),
				),
				array(
					'slug'   => 'kobayashi',
					'form'   => 'online_consult',
					'store'  => 'shibuya',
					'name'   => '小林 みなみ',
					'email'  => 'kobayashi@example.com',
					'phone'  => '090-0000-0004',
					'status' => 'pending',
					'memo'   => '',
					'meta'   => array(
						'online_tool' => 'Zoom',
					),
				),
				array(
					'slug'   => 'kato',
					'form'   => 'online_consult',
					'store'  => 'shinjuku',
					'name'   => '加藤 隆',
					'email'  => 'kato@example.com',
					'phone'  => '090-0000-0005',
					'status' => 'approved',
					'memo'   => '',
					'meta'   => array(
						'online_tool' => 'Google Meet',
					),
				),
				array(
					'slug'   => 'yoshida',
					'form'   => 'first_consult',
					'store'  => 'yokohama',
					'name'   => '吉田 あかり',
					'email'  => 'yoshida@example.com',
					'phone'  => '090-0000-0006',
					'status' => 'cancelled',
					'memo'   => 'お客様都合によりキャンセル。',
					'meta'   => array(
						'consult_body' => '日程が合わなくなったため取り下げます。',
						'consult_type' => '2回目以降',
					),
				),
				array(
					'slug'   => 'yamaguchi',
					'form'   => 'first_consult',
					'store'  => 'shibuya',
					'name'   => '山口 拓也',
					'email'  => 'yamaguchi@example.com',
					'phone'  => '090-0000-0007',
					'status' => 'cancelled',
					'memo'   => '',
					'meta'   => array(
						'consult_body'       => '別日程で取り直します。',
						'consult_type'       => '初めて',
						'consult_first_note' => 'オンラインでも相談できますか。',
					),
				),
			);
		}

		/* ------------------------------------------------------------------ */
		/* テーブル名                                                          */
		/* ------------------------------------------------------------------ */

		/**
		 * テーブル名を返す（{$wpdb->prefix} + 固定文字列のみ）。
		 *
		 * @param string $name stores|staff|forms|custom_fields|schedules|reservations|reservation_meta.
		 * @return string
		 */
		private static function table( $name ) {
			global $wpdb;
			return $wpdb->prefix . 'smart_booking_' . $name;
		}

		/**
		 * 既定フォーム（forms.is_default = 1）の id を返す。無ければ 0。
		 *
		 * 既定フォームは activator が作る行でレジストリ管理下に無いため、
		 * field_defs() のスラッグ 'default' を解決するときだけ DB から引く。
		 * この関数は読むだけで、既定フォームの行は変更しない。
		 *
		 * @return int 既定フォームの id（見つからなければ 0）.
		 */
		private static function default_form_id() {
			global $wpdb;
			$table = self::table( 'forms' );
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- テーブル名は自前の定数由来.
			return (int) $wpdb->get_var( "SELECT id FROM {$table} WHERE is_default = 1 ORDER BY id ASC LIMIT 1" );
		}

		/* ------------------------------------------------------------------ */
		/* レジストリ                                                          */
		/* ------------------------------------------------------------------ */

		/**
		 * レジストリを読み込む（欠損キーは既定値で補完）。
		 *
		 * 構造:
		 *   version          … レジストリ構造バージョン（互換用）
		 *   stores/staff/forms/custom_fields … スラッグ => id（id 安定性を保つ対象）
		 *   schedules/reservations           … id の配列（毎回作り直す対象）
		 *   options          … option 名 => { existed: bool, value: mixed }（変更前の値。WPLANG を含む）
		 *   user_locales     … ユーザー id => { existed: bool, value: string, login: string }（変更前の locale user_meta）
		 *   seeded_at        … 最終シード日時
		 *
		 * @return array<string,mixed>
		 */
		private static function get_registry() {
			$registry = get_option( self::REGISTRY_OPTION, array() );
			if ( ! is_array( $registry ) ) {
				$registry = array();
			}
			$defaults = array(
				'version'       => self::REGISTRY_VERSION,
				'stores'        => array(),
				'staff'         => array(),
				'forms'         => array(),
				'custom_fields' => array(),
				'schedules'     => array(),
				'reservations'  => array(),
				'options'       => array(),
				'user_locales'  => array(),
				'seeded_at'     => '',
			);
			foreach ( $defaults as $key => $value ) {
				if ( ! isset( $registry[ $key ] ) || ( is_array( $value ) && ! is_array( $registry[ $key ] ) ) ) {
					$registry[ $key ] = $value;
				}
			}
			return $registry;
		}

		/**
		 * レジストリを保存する。
		 *
		 * @param array $registry レジストリ.
		 * @return void
		 */
		private static function save_registry( $registry ) {
			update_option( self::REGISTRY_OPTION, $registry, false );
		}

		/**
		 * レジストリの一区画から id の一覧を取り出す（スラッグ連想配列 / 単純配列の両方に対応）。
		 *
		 * @param array  $registry レジストリ.
		 * @param string $section  区画名.
		 * @return int[]
		 */
		private static function registry_ids( $registry, $section ) {
			$ids = array();
			if ( empty( $registry[ $section ] ) || ! is_array( $registry[ $section ] ) ) {
				return $ids;
			}
			foreach ( $registry[ $section ] as $value ) {
				$id = (int) $value;
				if ( $id > 0 ) {
					$ids[] = $id;
				}
			}
			return array_values( array_unique( $ids ) );
		}

		/* ------------------------------------------------------------------ */
		/* 低レベルヘルパ                                                      */
		/* ------------------------------------------------------------------ */

		/**
		 * CLI へ 1 行出力する（error_log は使わない）。
		 *
		 * @param string $message 出力する行.
		 * @return void
		 */
		public static function log( $message ) {
			if ( class_exists( 'WP_CLI' ) ) {
				WP_CLI::log( $message );
				return;
			}
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- CLI のテキスト出力であり HTML 文脈ではない（エスケープすると表示が壊れる）。
			echo $message . "\n";
		}

		/**
		 * 行が実在するか。
		 *
		 * @param string $table テーブル名.
		 * @param int    $id    id.
		 * @return bool
		 */
		private static function row_exists( $table, $id ) {
			global $wpdb;
			$id = (int) $id;
			if ( $id <= 0 ) {
				return false;
			}
			// テーブル名は {$wpdb->prefix} + 固定文字列。値は必ずプレースホルダで束縛する。
			$found = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE id = %d", $id ) ); // phpcs:ignore
			return ! empty( $found );
		}

		/**
		 * id の配列を IN 句のプレースホルダ文字列にする。
		 *
		 * @param int[] $ids id 配列.
		 * @return string 例: "%d, %d, %d"
		 */
		private static function placeholders( $ids ) {
			return implode( ', ', array_fill( 0, count( $ids ), '%d' ) );
		}

		/**
		 * レジストリ id スコープで DELETE する（WHERE は必ず id IN (...) のみ）。
		 *
		 * @param string $table テーブル名.
		 * @param int[]  $ids   削除対象 id.
		 * @return int 削除件数.
		 */
		private static function delete_by_ids( $table, $ids ) {
			global $wpdb;
			$ids = array_values( array_filter( array_map( 'intval', $ids ) ) );
			if ( empty( $ids ) ) {
				return 0;
			}
			$in = self::placeholders( $ids );
			// phpcs:ignore
			$deleted = $wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE id IN ({$in})", $ids ) );
			return (int) $deleted;
		}

		/**
		 * レジストリ外の行を数えたうえでの MAX(sort_order)。
		 *
		 * 既存ユーザーの行の「後ろ」に並ぶよう採番するためのベース値。自分（レジストリ）の行は
		 * 母数から外すので、2 回目以降の実行でも値が動かない（＝出力が安定する）。
		 *
		 * 現在の利用箇所はフォームのみ（$only_user = false）。店舗 / 担当者は逆に一覧の「先頭」へ
		 * 出したいので、この関数ではなく DEMO_SORT_START 起点の固定採番を使う（理由は同 docblock）。
		 *
		 * @param string $table       テーブル名.
		 * @param int[]  $exclude_ids レジストリ id（除外）.
		 * @param bool   $only_user   is_system = 0 に限定するか（stores / staff 用）.
		 * @return int
		 */
		private static function max_sort_order( $table, $exclude_ids, $only_user ) {
			global $wpdb;
			$exclude_ids = array_values( array_filter( array_map( 'intval', $exclude_ids ) ) );
			$where       = $only_user ? 'is_system = 0' : '1 = 1';
			if ( empty( $exclude_ids ) ) {
				// phpcs:ignore
				return (int) $wpdb->get_var( "SELECT MAX(sort_order) FROM {$table} WHERE {$where}" );
			}
			$in = self::placeholders( $exclude_ids );
			// phpcs:ignore
			return (int) $wpdb->get_var( $wpdb->prepare( "SELECT MAX(sort_order) FROM {$table} WHERE {$where} AND id NOT IN ({$in})", $exclude_ids ) );
		}

		/**
		 * レジストリ外から参照されている id を返す（削除してよいか判定するため）。
		 *
		 * @param string $type          stores|staff|forms|schedules.
		 * @param int[]  $ids           判定対象 id.
		 * @param array  $registry      レジストリ.
		 * @return int[] 参照されているため削除してはならない id。
		 */
		private static function foreign_referenced_ids( $type, $ids, $registry ) {
			global $wpdb;
			$ids = array_values( array_filter( array_map( 'intval', $ids ) ) );
			if ( empty( $ids ) ) {
				return array();
			}

			$own_reservations = self::registry_ids( $registry, 'reservations' );
			$own_schedules    = self::registry_ids( $registry, 'schedules' );
			$own_fields       = self::registry_ids( $registry, 'custom_fields' );

			$checks = array();
			switch ( $type ) {
				case 'schedules':
					$checks[] = array( self::table( 'reservations' ), 'schedule_id', $own_reservations );
					break;
				case 'stores':
					$checks[] = array( self::table( 'reservations' ), 'store_id', $own_reservations );
					$checks[] = array( self::table( 'schedules' ), 'store_id', $own_schedules );
					break;
				case 'staff':
					$checks[] = array( self::table( 'reservations' ), 'staff_id', $own_reservations );
					$checks[] = array( self::table( 'schedules' ), 'staff_id', $own_schedules );
					break;
				case 'forms':
					$checks[] = array( self::table( 'reservations' ), 'form_id', $own_reservations );
					$checks[] = array( self::table( 'custom_fields' ), 'form_id', $own_fields );
					break;
				default:
					return array();
			}

			$blocked = array();
			foreach ( $checks as $check ) {
				list( $table, $column, $own_ids ) = $check;
				$sql                              = "SELECT DISTINCT {$column} FROM {$table} WHERE {$column} IN (" . self::placeholders( $ids ) . ')';
				$params                           = $ids;
				if ( ! empty( $own_ids ) ) {
					$sql     .= ' AND id NOT IN (' . self::placeholders( $own_ids ) . ')';
					$params   = array_merge( $params, $own_ids );
				}
				// phpcs:ignore
				$found = $wpdb->get_col( $wpdb->prepare( $sql, $params ) );
				if ( is_array( $found ) ) {
					foreach ( $found as $value ) {
						$blocked[] = (int) $value;
					}
				}
			}
			return array_values( array_unique( $blocked ) );
		}

		/* ------------------------------------------------------------------ */
		/* シード本体                                                          */
		/* ------------------------------------------------------------------ */

		/**
		 * デモデータを投入する（冪等）。
		 *
		 * @return void
		 */
		public static function seed() {
			global $wpdb;

			$registry = self::get_registry();
			$now      = current_time( 'mysql' );
			$notes    = array();

			// 1. 表示系オプションと管理画面ロケール（どちらも変更前の値を退避してから設定）。
			$registry      = self::apply_options( $registry );
			$locale_result = self::apply_locale( $registry );
			$registry      = $locale_result['registry'];
			if ( '' !== $locale_result['warning'] ) {
				$notes[] = $locale_result['warning'];
			}

			// 2. 予約 → 予約メタ → スケジュール の順に、レジストリ id スコープで撤去。
			$removed  = self::remove_dynamic_rows( $registry );
			$registry = $removed['registry'];
			if ( ! empty( $removed['protected'] ) ) {
				$notes[] = 'レジストリ外の予約から参照されているスケジュールを保護しました（削除せず維持）: ' . count( $removed['protected'] ) . ' 件';
			}

			// 3. 店舗（UPDATE で id を保つ）。
			// sort_order は DEMO_SORT_START から +1 ずつの固定採番（1, 2, 3 ...）。
			// 既存行（回帰フィクスチャ `店舗1` = 10）より小さい値にして一覧の先頭へ出す。理由は
			// DEMO_SORT_START の docblock 参照。固定値なので 2 回目以降も値が動かない（＝冪等）。
			$i = 0;
			foreach ( self::store_defs() as $slug => $def ) {
				++$i;
				$data              = array(
					'name'           => $def['name'],
					'phone'          => $def['phone'],
					'email'          => $def['email'],
					'prefecture'     => $def['prefecture'],
					'city'           => $def['city'],
					'address_line'   => $def['address_line'],
					'description'    => $def['description'],
					'image_id'       => 0,
					'calendar_color' => $def['calendar_color'],
					'is_active'      => 1,
					'is_system'      => 0,
					'sort_order'     => self::DEMO_SORT_START + ( $i - 1 ),
					'updated_at'     => $now,
				);
				$formats           = array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%d', '%d', '%d', '%s' );
				$registry['stores'][ $slug ] = self::upsert(
					self::table( 'stores' ),
					isset( $registry['stores'][ $slug ] ) ? (int) $registry['stores'][ $slug ] : 0,
					$data,
					$formats,
					array( 'created_at' => $now ),
					array( '%s' )
				);
			}
			$registry = self::prune_slugs( $registry, 'stores', array_keys( self::store_defs() ), self::table( 'stores' ), $notes );

			// 4. 担当者（UPDATE で id を保つ）。
			// 店舗と同じ理由・同じ方式で固定採番する（担当者タブも sort_order ASC, id ASC のため、
			// 何もしないとフィクスチャ `担当者1`（sort_order=10）が先頭に写り込む）。
			$i = 0;
			foreach ( self::staff_defs() as $slug => $def ) {
				++$i;
				$store_id = isset( $registry['stores'][ $def['store'] ] ) ? (int) $registry['stores'][ $def['store'] ] : 0;
				if ( $store_id <= 0 ) {
					continue;
				}
				$data                       = array(
					'store_id'    => $store_id,
					'name'        => $def['name'],
					'email'       => $def['email'],
					'phone'       => $def['phone'],
					'description' => $def['description'],
					'image_id'    => 0,
					'is_active'   => 1,
					'is_system'   => 0,
					'sort_order'  => self::DEMO_SORT_START + ( $i - 1 ),
					'updated_at'  => $now,
				);
				$formats                    = array( '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%d', '%s' );
				$registry['staff'][ $slug ] = self::upsert(
					self::table( 'staff' ),
					isset( $registry['staff'][ $slug ] ) ? (int) $registry['staff'][ $slug ] : 0,
					$data,
					$formats,
					array( 'created_at' => $now ),
					array( '%s' )
				);
			}
			$registry = self::prune_slugs( $registry, 'staff', array_keys( self::staff_defs() ), self::table( 'staff' ), $notes );

			// 5. フォーム（既存のデフォルトフォームは触らない。追加 2 件のみ）。
			$form_base = self::max_sort_order( self::table( 'forms' ), self::registry_ids( $registry, 'forms' ), false );
			$i         = 0;
			foreach ( self::form_defs() as $slug => $def ) {
				++$i;
				// mail_overrides は定義がある場合のみ JSON 化する。無い場合は空文字
				// （format_row の isset ガードで全種別 disabled として読まれる）。
				$overrides_json             = isset( $def['mail_overrides'] )
					? wp_json_encode( $def['mail_overrides'] )
					: '';
				$data                       = array(
					'name'           => $def['name'],
					'is_default'     => 0,
					'sort_order'     => $form_base + $i,
					'mail_overrides' => $overrides_json,
					'updated_at'     => $now,
				);
				$formats                    = array( '%s', '%d', '%d', '%s', '%s' );
				$registry['forms'][ $slug ] = self::upsert(
					self::table( 'forms' ),
					isset( $registry['forms'][ $slug ] ) ? (int) $registry['forms'][ $slug ] : 0,
					$data,
					$formats,
					array( 'created_at' => $now ),
					array( '%s' )
				);
			}
			$registry = self::prune_slugs( $registry, 'forms', array_keys( self::form_defs() ), self::table( 'forms' ), $notes );

			// 6. カスタムフィールド（UPDATE で id を保つ。キーは "フォームスラッグ:フィールドスラッグ"）。
			$known_field_slugs = array();
			$default_form_id   = self::default_form_id();
			foreach ( self::field_defs() as $form_slug => $fields ) {
				// スラッグ 'default' は既定フォーム（is_default=1）を指す。行は作らず id だけ引く。
				if ( 'default' === $form_slug ) {
					$form_id = $default_form_id;
				} else {
					$form_id = isset( $registry['forms'][ $form_slug ] ) ? (int) $registry['forms'][ $form_slug ] : 0;
				}
				if ( $form_id <= 0 ) {
					if ( 'default' === $form_slug ) {
						$notes[] = '既定フォーム（is_default=1）が見つからないため、既定フォームへの撮影用項目の追加をスキップしました。';
					}
					continue;
				}
				foreach ( $fields as $field_slug => $def ) {
					$key                 = $form_slug . ':' . $field_slug;
					$known_field_slugs[] = $key;

					if ( 'address' === $def['field_type'] ) {
						$options_json = wp_json_encode( array( 'autofill' => ! empty( $def['autofill'] ) ) );
					} elseif ( isset( $def['field_options'] ) && is_array( $def['field_options'] ) ) {
						$options_json = wp_json_encode( $def['field_options'] );
					} else {
						$options_json = wp_json_encode( array() );
					}

					$data    = array(
						'form_id'             => $form_id,
						'field_key'           => $def['field_key'],
						'field_label'         => $def['field_label'],
						'field_type'          => $def['field_type'],
						'field_options'       => $options_json,
						'placeholder'         => isset( $def['placeholder'] ) ? $def['placeholder'] : '',
						'is_required'         => ! empty( $def['is_required'] ) ? 1 : 0,
						'sort_order'          => (int) $def['sort_order'],
						'condition_field_key' => isset( $def['condition_field_key'] ) ? $def['condition_field_key'] : null,
						'condition_value'     => isset( $def['condition_value'] ) ? $def['condition_value'] : null,
					);
					$formats = array( '%d', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s' );

					$registry['custom_fields'][ $key ] = self::upsert(
						self::table( 'custom_fields' ),
						isset( $registry['custom_fields'][ $key ] ) ? (int) $registry['custom_fields'][ $key ] : 0,
						$data,
						$formats,
						array( 'created_at' => $now ),
						array( '%s' )
					);
				}
			}
			$registry = self::prune_slugs( $registry, 'custom_fields', $known_field_slugs, self::table( 'custom_fields' ), $notes );

			// 7. スケジュール（今日からの相対日付なので毎回作り直す）。
			$schedule_result       = self::create_schedules( $registry, $now );
			$registry['schedules'] = array_values( array_unique( array_merge( self::registry_ids( $registry, 'schedules' ), $schedule_result['ids'] ) ) );
			if ( $schedule_result['skipped'] > 0 ) {
				$notes[] = '既存行（レジストリ外）と衝突したため作成をスキップした枠: ' . $schedule_result['skipped'] . ' 件';
			}

			// 8. 予約（実在するスケジュールにだけ紐づける）。
			$reservation_result       = self::create_reservations( $registry, $schedule_result['owned'], $now );
			$registry['reservations'] = $reservation_result['ids'];
			foreach ( $reservation_result['notes'] as $note ) {
				$notes[] = $note;
			}

			$registry['version']   = self::REGISTRY_VERSION;
			$registry['seeded_at'] = $now;
			self::save_registry( $registry );

			self::print_summary( $registry, $schedule_result, $reservation_result, $locale_result, $notes );
		}

		/**
		 * 1 行を UPDATE（既存）または INSERT（新規）して id を返す。
		 *
		 * レジストリに載っている id の行が実在するときだけ UPDATE する（＝id を保つ）。
		 * 実在しない場合のみ INSERT し、新しい id をレジストリへ載せ替える。
		 *
		 * @param string $table          テーブル名.
		 * @param int    $id             レジストリ上の id（0 なら新規）.
		 * @param array  $data           更新・挿入する列.
		 * @param array  $formats        $data に対応するフォーマット.
		 * @param array  $insert_only    INSERT 時のみ追加する列（created_at 等）.
		 * @param array  $insert_formats $insert_only に対応するフォーマット.
		 * @return int 行 id（失敗時 0）.
		 */
		private static function upsert( $table, $id, $data, $formats, $insert_only = array(), $insert_formats = array() ) {
			global $wpdb;

			$id = (int) $id;
			if ( $id > 0 && self::row_exists( $table, $id ) ) {
				// phpcs:ignore
				$wpdb->update( $table, $data, array( 'id' => $id ), $formats, array( '%d' ) );
				return $id;
			}

			// phpcs:ignore
			$wpdb->insert(
				$table,
				array_merge( $data, $insert_only ),
				array_merge( $formats, $insert_formats )
			);
			return (int) $wpdb->insert_id;
		}

		/**
		 * 定義から外れたスラッグの行を、レジストリ id スコープで削除する。
		 *
		 * 定義を変更した場合にだけ効く後片付け。参照されている行は保護して残す。
		 *
		 * @param array    $registry     レジストリ.
		 * @param string   $section      区画名.
		 * @param string[] $known_slugs  現在の定義スラッグ一覧.
		 * @param string   $table        テーブル名.
		 * @param array    $notes        メモ（参照渡し）.
		 * @return array 更新後のレジストリ.
		 */
		private static function prune_slugs( $registry, $section, $known_slugs, $table, &$notes ) {
			if ( empty( $registry[ $section ] ) || ! is_array( $registry[ $section ] ) ) {
				return $registry;
			}
			$stale_ids = array();
			foreach ( $registry[ $section ] as $slug => $id ) {
				if ( in_array( (string) $slug, array_map( 'strval', $known_slugs ), true ) ) {
					continue;
				}
				$stale_ids[ (string) $slug ] = (int) $id;
			}
			if ( empty( $stale_ids ) ) {
				return $registry;
			}

			$blocked = self::foreign_referenced_ids( $section, array_values( $stale_ids ), $registry );
			foreach ( $stale_ids as $slug => $id ) {
				if ( in_array( $id, $blocked, true ) ) {
					$notes[] = sprintf( '定義から外れた %s（id=%d）は他データから参照されているため削除せず保持しました。', $section, $id );
					continue;
				}
				self::delete_by_ids( $table, array( $id ) );
				unset( $registry[ $section ][ $slug ] );
			}
			return $registry;
		}

		/**
		 * 表示系オプションを設定する（変更前の値は backup_option でレジストリへ退避）。
		 *
		 * @param array $registry レジストリ.
		 * @return array 更新後のレジストリ.
		 */
		private static function apply_options( $registry ) {
			foreach ( self::MANAGED_OPTIONS as $key => $value ) {
				$registry = self::backup_option( $registry, $key );
				update_option( $key, $value );
			}
			return $registry;
		}

		/**
		 * option の変更前の値をレジストリへ退避する（まだ退避していないキーだけ）。
		 *
		 * 2 回目以降の実行で「自分が書いた値」を退避してしまわないよう、初回のみ記録する。
		 *
		 * @param array  $registry レジストリ.
		 * @param string $key      option 名.
		 * @return array 更新後のレジストリ.
		 */
		private static function backup_option( $registry, $key ) {
			if ( isset( $registry['options'][ $key ] ) ) {
				return $registry;
			}
			$sentinel                    = '__smart_booking_screenshot_missing__';
			$before                      = get_option( $key, $sentinel );
			$registry['options'][ $key ] = array(
				'existed' => ( $sentinel !== $before ),
				'value'   => ( $sentinel === $before ) ? '' : $before,
			);
			return $registry;
		}

		/* ------------------------------------------------------------------ */
		/* 管理画面ロケール（撮影セッションの間だけ ja）                        */
		/* ------------------------------------------------------------------ */

		/**
		 * 管理画面を日本語表示にする（撮影用）。
		 *
		 * 手順:
		 *   1. 言語パック ja が未導入ならダウンロードする（導入済みなら再ダウンロードしない＝冪等）。
		 *   2. option WPLANG を退避してから 'ja' にする（退避先は registry['options'] なので
		 *      purge の既存の復元経路でそのまま元へ戻る）。
		 *   3. 管理者ユーザーの locale user_meta が「サイト既定以外」なら WPLANG が効かないため、
		 *      変更前の値を registry['user_locales'] へ退避してから空にする。
		 *
		 * ダウンロードに失敗した場合はロケールを一切変更せず（＝退避も行わず）警告を返し、
		 * シード全体は続行する（オフライン環境でもデータ投入は成功させる）。
		 *
		 * @param array $registry レジストリ.
		 * @return array{registry: array, pack: string, warning: string}
		 */
		private static function apply_locale( $registry ) {
			$result = array(
				'registry' => $registry,
				'pack'     => 'installed',
				'warning'  => '',
			);

			if ( ! in_array( self::TARGET_LOCALE, self::installed_languages(), true ) ) {
				if ( self::download_language_pack( self::TARGET_LOCALE ) ) {
					$result['pack'] = 'downloaded';
				} else {
					$result['pack']    = 'failed';
					$result['warning'] = sprintf(
						'言語パック %1$s のダウンロードに失敗しました（ネットワーク不通など）。ロケールは変更していません（管理画面は英語のまま）。撮影前に `npx wp-env run cli wp language core install %1$s` を実行してから再度シードしてください。',
						self::TARGET_LOCALE
					);
					return $result;
				}
			}

			// サイト既定ロケール。
			$registry = self::backup_option( $registry, self::LOCALE_OPTION );
			update_option( self::LOCALE_OPTION, self::TARGET_LOCALE );

			// ユーザー個別ロケール（サイト既定を上書きしてしまうため空に戻す）。
			foreach ( self::admin_users() as $user_id => $login ) {
				$current = (string) get_user_meta( $user_id, 'locale', true );
				if ( '' === $current ) {
					continue; // 既にサイト既定。触らない。
				}
				if ( ! isset( $registry['user_locales'][ $user_id ] ) ) {
					$registry['user_locales'][ $user_id ] = array(
						'existed' => true,
						'value'   => $current,
						'login'   => $login,
					);
				}
				delete_user_meta( $user_id, 'locale' );
			}

			$result['registry'] = $registry;
			return $result;
		}

		/**
		 * 導入済み言語（WP_LANG_DIR 内の .mo 由来）の一覧。
		 *
		 * ネットワークに出ずに「再ダウンロード不要か」を判定するための関数。
		 *
		 * @return string[]
		 */
		private static function installed_languages() {
			if ( ! function_exists( 'get_available_languages' ) ) {
				return array();
			}
			return (array) get_available_languages();
		}

		/**
		 * 言語パックをダウンロードする（開発用シードのみ。出荷コードからは呼ばれない）。
		 *
		 * WordPress コアの管理画面用ファイルを読み込む必要があるため、CLI 文脈で明示的に require する。
		 * 失敗（オフライン・API 応答なし・書き込み不可）でも例外を投げず false を返す。
		 *
		 * @param string $locale ロケール（例: ja）.
		 * @return bool 成功したら true.
		 */
		private static function download_language_pack( $locale ) {
			if ( ! defined( 'ABSPATH' ) ) {
				return false;
			}
			$includes = array(
				ABSPATH . 'wp-admin/includes/file.php',
				ABSPATH . 'wp-admin/includes/misc.php',
				ABSPATH . 'wp-admin/includes/class-wp-upgrader.php',
				ABSPATH . 'wp-admin/includes/translation-install.php',
			);
			foreach ( $includes as $path ) {
				if ( ! is_readable( $path ) ) {
					return false;
				}
				require_once $path;
			}
			if ( ! function_exists( 'wp_download_language_pack' ) ) {
				return false;
			}

			// 戻り値は成功時ロケール文字列 / 失敗時 false または WP_Error。いずれの場合も
			// 例外にせず「実際に .mo が置かれたか」で最終判定する。
			wp_download_language_pack( $locale );

			return in_array( $locale, self::installed_languages(), true );
		}

		/**
		 * 管理者ユーザー（撮影で使うユーザー）の id => ログイン名。
		 *
		 * @return array<int,string>
		 */
		private static function admin_users() {
			$users = get_users(
				array(
					'role'   => 'administrator',
					'fields' => array( 'ID', 'user_login' ),
				)
			);
			$map = array();
			foreach ( (array) $users as $user ) {
				$map[ (int) $user->ID ] = (string) $user->user_login;
			}
			return $map;
		}

		/**
		 * レジストリ管理下の予約・予約メタ・スケジュールを撤去する。
		 *
		 * 順序: 予約メタ → 予約 → スケジュール（参照切れ＝孤児を作らない）。
		 * レジストリ外の予約から参照されているスケジュールは削除せずレジストリに残す。
		 *
		 * @param array $registry レジストリ.
		 * @return array{registry: array, protected: int[]}
		 */
		private static function remove_dynamic_rows( $registry ) {
			global $wpdb;

			$reservation_ids = self::registry_ids( $registry, 'reservations' );
			if ( ! empty( $reservation_ids ) ) {
				$in = self::placeholders( $reservation_ids );
				// phpcs:ignore
				$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}smart_booking_reservation_meta WHERE reservation_id IN ({$in})", $reservation_ids ) );
				self::delete_by_ids( self::table( 'reservations' ), $reservation_ids );
			}
			$registry['reservations'] = array();

			$schedule_ids = self::registry_ids( $registry, 'schedules' );
			$protected    = array();
			if ( ! empty( $schedule_ids ) ) {
				$protected   = self::foreign_referenced_ids( 'schedules', $schedule_ids, $registry );
				$deletable   = array_values( array_diff( $schedule_ids, $protected ) );
				self::delete_by_ids( self::table( 'schedules' ), $deletable );
			}
			$registry['schedules'] = $protected;

			return array(
				'registry'  => $registry,
				'protected' => $protected,
			);
		}

		/**
		 * スケジュールを生成して INSERT する。
		 *
		 * - 今日から SCHEDULE_DAYS 日間、平日（月〜金）のみ。
		 * - 1 日 4 枠（10:00 / 11:00 / 14:00 / 15:00）。
		 * - UNIQUE(store_id, staff_id, schedule_date, start_time) と衝突しないよう、
		 *   キーは生成ロジック上一意。さらにレジストリ外の既存行があれば INSERT せずスキップする
		 *   （ユーザーの行を上書きしない）。
		 *
		 * @param array  $registry レジストリ.
		 * @param string $now      現在日時（mysql 形式）.
		 * @return array{ids: int[], owned: array[], skipped: int, dates: array{from: string, to: string}, days: int}
		 */
		private static function create_schedules( $registry, $now ) {
			global $wpdb;

			$today = current_time( 'Y-m-d' );
			$start = new DateTimeImmutable( $today . ' 00:00:00', new DateTimeZone( 'UTC' ) );

			$staff_defs = self::staff_defs();
			$ids        = array();
			$owned      = array();
			$skipped    = 0;
			$weekdays   = 0;
			$date_to    = $today;

			$staff_index = 0;
			foreach ( $staff_defs as $staff_slug => $staff_def ) {
				$staff_id = isset( $registry['staff'][ $staff_slug ] ) ? (int) $registry['staff'][ $staff_slug ] : 0;
				$store_id = isset( $registry['stores'][ $staff_def['store'] ] ) ? (int) $registry['stores'][ $staff_def['store'] ] : 0;
				if ( $staff_id <= 0 || $store_id <= 0 ) {
					++$staff_index;
					continue;
				}

				$weekdays = 0;
				for ( $day = 0; $day < self::SCHEDULE_DAYS; $day++ ) {
					$date_obj = $start->modify( '+' . $day . ' days' );
					$date     = $date_obj->format( 'Y-m-d' );
					$date_to  = $date;
					// 平日（月=1 〜 金=5）のみ。
					if ( (int) $date_obj->format( 'N' ) > 5 ) {
						continue;
					}
					++$weekdays;

					foreach ( self::SLOTS as $slot_index => $slot ) {
						$state_index = ( $day + $slot_index + $staff_index ) % 4;
						$state       = self::SLOT_STATES[ $state_index ];

						// レジストリ外の既存行があれば触らない（ユーザーのデータを守る）。
						// テーブル名は {$wpdb->prefix} + 固定文字列。値はすべてプレースホルダで束縛している。
						// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
						$existing = (int) $wpdb->get_var(
							$wpdb->prepare(
								"SELECT id FROM {$wpdb->prefix}smart_booking_schedules WHERE store_id = %d AND staff_id = %d AND schedule_date = %s AND start_time = %s LIMIT 1",
								$store_id,
								$staff_id,
								$date,
								$slot[0]
							)
						);
						// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
						if ( $existing > 0 ) {
							++$skipped;
							continue;
						}

						// phpcs:ignore
						$wpdb->insert(
							self::table( 'schedules' ),
							array(
								'store_id'      => $store_id,
								'staff_id'      => $staff_id,
								'schedule_date' => $date,
								'start_time'    => $slot[0],
								'end_time'      => $slot[1],
								'capacity'      => (int) $state['capacity'],
								'booked_count'  => (int) $state['booked'],
								'is_active'     => 1,
								'created_at'    => $now,
								'updated_at'    => $now,
							),
							array( '%d', '%d', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s' )
						);
						$new_id = (int) $wpdb->insert_id;
						if ( $new_id <= 0 ) {
							continue;
						}
						$ids[] = $new_id;

						// 予約の受け皿になれる枠（今日より後・状態 0/1）を控えておく。
						//   状態 1（booked=0）… 非キャンセル予約 1 件を載せて booked_count=1 にする
						//   状態 0（booked=0）… キャンセル予約を載せる（booked_count は 0 のまま）
						if ( $date > $today && ( 0 === $state_index || 1 === $state_index ) ) {
							$owned[] = array(
								'id'          => $new_id,
								'store_slug'  => $staff_def['store'],
								'staff_slug'  => $staff_slug,
								'store_id'    => $store_id,
								'staff_id'    => $staff_id,
								'date'        => $date,
								'start_time'  => $slot[0],
								'role'        => ( 1 === $state_index ) ? 'active' : 'cancelled',
							);
						}
					}
				}
				++$staff_index;
			}

			return array(
				'ids'      => $ids,
				'owned'    => $owned,
				'skipped'  => $skipped,
				'dates'    => array(
					'from' => $today,
					'to'   => $date_to,
				),
				'weekdays' => $weekdays,
			);
		}

		/**
		 * 予約を作成する（メタ込み）。
		 *
		 * - 必ず実在するスケジュール行（今回作成したもの）を参照する。
		 * - 非キャンセル予約を載せた枠は booked_count を実件数（1）に更新する。
		 *   キャンセル予約は booked_count に数えない（製品のキャンセル処理と同じ扱い）。
		 * - メール送信フック（smart_booking_reservation_received）は発火させない（撮影用データ投入で
		 *   wp_mail を走らせないため）。
		 *
		 * @param array  $registry レジストリ.
		 * @param array  $owned    受け皿にできるスケジュール（create_schedules の owned）.
		 * @param string $now      現在日時（mysql 形式）.
		 * @return array{ids: int[], counts: array<string,int>, notes: string[]}
		 */
		private static function create_reservations( $registry, $owned, $now ) {
			global $wpdb;

			$ids    = array();
			$notes  = array();
			$counts = array(
				'pending'   => 0,
				'approved'  => 0,
				'cancelled' => 0,
			);
			$used   = array();

			$offset = 0;
			foreach ( self::reservation_defs() as $def ) {
				$role = ( 'cancelled' === $def['status'] ) ? 'cancelled' : 'active';
				$slot = null;
				foreach ( $owned as $candidate ) {
					if ( isset( $used[ $candidate['id'] ] ) ) {
						continue;
					}
					if ( $candidate['role'] !== $role || $candidate['store_slug'] !== $def['store'] ) {
						continue;
					}
					$slot = $candidate;
					break;
				}
				if ( null === $slot ) {
					$notes[] = sprintf( '予約「%s」に割り当てられる空き枠が見つからないため作成をスキップしました。', $def['name'] );
					continue;
				}
				$used[ $slot['id'] ] = true;

				$form_id = isset( $registry['forms'][ $def['form'] ] ) ? (int) $registry['forms'][ $def['form'] ] : 0;
				if ( $form_id <= 0 ) {
					$notes[] = sprintf( '予約「%s」のフォームが解決できないため作成をスキップしました。', $def['name'] );
					continue;
				}

				++$offset;
				$created_at = gmdate( 'Y-m-d H:i:s', strtotime( $now ) - ( $offset * 3 * HOUR_IN_SECONDS ) );

				// phpcs:ignore
				$wpdb->insert(
					self::table( 'reservations' ),
					array(
						'form_id'        => $form_id,
						'store_id'       => (int) $slot['store_id'],
						'staff_id'       => (int) $slot['staff_id'],
						'schedule_id'    => (int) $slot['id'],
						'schedule_date'  => $slot['date'],
						'schedule_time'  => $slot['start_time'],
						'customer_name'  => $def['name'],
						'customer_email' => $def['email'],
						'customer_phone' => $def['phone'],
						'status'         => $def['status'],
						'admin_memo'     => $def['memo'],
						'created_at'     => $created_at,
						'updated_at'     => $created_at,
					),
					array( '%d', '%d', '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
				);
				$reservation_id = (int) $wpdb->insert_id;
				if ( $reservation_id <= 0 ) {
					$notes[] = sprintf( '予約「%s」の作成に失敗しました。', $def['name'] );
					continue;
				}
				$ids[] = $reservation_id;
				++$counts[ $def['status'] ];

				// 非キャンセル予約を載せた枠の booked_count を実件数に合わせる。
				if ( 'active' === $role ) {
					// phpcs:ignore
					$wpdb->update(
						self::table( 'schedules' ),
						array(
							'booked_count' => 1,
							'updated_at'   => $now,
						),
						array( 'id' => (int) $slot['id'] ),
						array( '%d', '%s' ),
						array( '%d' )
					);
				}

				foreach ( $def['meta'] as $meta_key => $meta_value ) {
					// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
					$wpdb->insert(
						self::table( 'reservation_meta' ),
						array(
							'reservation_id' => $reservation_id,
							'meta_key'       => $meta_key,
							'meta_value'     => $meta_value,
						),
						array( '%d', '%s', '%s' )
					);
					// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				}
			}

			return array(
				'ids'    => $ids,
				'counts' => $counts,
				'notes'  => $notes,
			);
		}

		/**
		 * 投入結果のサマリを出力する。
		 *
		 * id と日付・件数以外は毎回同じ文字列になるよう、定義順に固定した書式で出す。
		 *
		 * @param array $registry           レジストリ.
		 * @param array $schedule_result    create_schedules の戻り値.
		 * @param array $reservation_result create_reservations の戻り値.
		 * @param array $locale_result      apply_locale の戻り値.
		 * @param array $notes              補足メモ.
		 * @return void
		 */
		private static function print_summary( $registry, $schedule_result, $reservation_result, $locale_result, $notes ) {
			self::log( '=== Smart Booking 撮影用デモデータ シード完了 ===' );
			self::log( 'registry option : ' . self::REGISTRY_OPTION . ' (version ' . self::REGISTRY_VERSION . ')' );

			self::log( '--- 店舗 (' . count( $registry['stores'] ) . ' 件) ---' );
			foreach ( self::store_defs() as $slug => $def ) {
				$id = isset( $registry['stores'][ $slug ] ) ? (int) $registry['stores'][ $slug ] : 0;
				self::log( sprintf( '  %-8s %-6s id=%d  shortcode=[smart_booking store_id="%d"]', $slug, $def['name'], $id, $id ) );
			}

			self::log( '--- 担当者 (' . count( $registry['staff'] ) . ' 件) ---' );
			foreach ( self::staff_defs() as $slug => $def ) {
				$id = isset( $registry['staff'][ $slug ] ) ? (int) $registry['staff'][ $slug ] : 0;
				self::log( sprintf( '  %-8s %-8s id=%d  store=%s', $slug, $def['name'], $id, $def['store'] ) );
			}

			self::log( '--- フォーム (' . count( $registry['forms'] ) . ' 件・既存デフォルトフォームは未変更) ---' );
			$field_defs = self::field_defs();
			foreach ( self::form_defs() as $slug => $def ) {
				$id          = isset( $registry['forms'][ $slug ] ) ? (int) $registry['forms'][ $slug ] : 0;
				$field_count = isset( $field_defs[ $slug ] ) ? count( $field_defs[ $slug ] ) : 0;
				self::log( sprintf( '  %-14s %-18s id=%d  fields=%d  shortcode=[smart_booking form_id="%d"]', $slug, $def['name'], $id, $field_count, $id ) );
			}

			self::log( '--- カスタムフィールド (' . count( $registry['custom_fields'] ) . ' 件) ---' );
			foreach ( $field_defs as $form_slug => $fields ) {
				foreach ( $fields as $field_slug => $def ) {
					$key       = $form_slug . ':' . $field_slug;
					$id        = isset( $registry['custom_fields'][ $key ] ) ? (int) $registry['custom_fields'][ $key ] : 0;
					$condition = isset( $def['condition_field_key'] )
						? sprintf( '  条件=%s:%s', $def['condition_field_key'], $def['condition_value'] )
						: '';
					self::log( sprintf( '  %-32s %-12s %-14s id=%d%s', $key, $def['field_type'], $def['field_label'], $id, $condition ) );
				}
			}

			self::log( '--- スケジュール (' . count( $registry['schedules'] ) . ' 件) ---' );
			self::log( sprintf( '  期間      : %s 〜 %s (%d 日間・平日のみ %d 日)', $schedule_result['dates']['from'], $schedule_result['dates']['to'], self::SCHEDULE_DAYS, (int) $schedule_result['weekdays'] ) );
			self::log( '  枠        : 10:00 / 11:00 / 14:00 / 15:00（定員 6）' );
			self::log( '  空き状況  : 1 日 4 枠に 空きあり×2 / 残りわずか×1 / 満席×1 が必ず混在' );
			if ( $schedule_result['skipped'] > 0 ) {
				self::log( '  スキップ  : ' . $schedule_result['skipped'] . ' 件（レジストリ外の既存行を保護）' );
			}

			$counts = $reservation_result['counts'];
			self::log( '--- 予約 (' . count( $registry['reservations'] ) . ' 件) ---' );
			self::log( sprintf( '  ステータス: pending(承認待ち)=%d / approved(承認済み)=%d / cancelled(キャンセル)=%d', $counts['pending'], $counts['approved'], $counts['cancelled'] ) );
			self::log( '  メール    : すべて @example.com / 電話 090-0000-0001〜（実在しない値）' );

			self::log( '--- 表示系オプション ---' );
			foreach ( self::MANAGED_OPTIONS as $key => $value ) {
				$backup = isset( $registry['options'][ $key ] ) ? $registry['options'][ $key ] : array( 'existed' => false );
				self::log( sprintf( '  %-32s = %s  (変更前: %s)', $key, $value, empty( $backup['existed'] ) ? '未設定' : (string) $backup['value'] ) );
			}

			self::log( '--- 管理画面ロケール ---' );
			self::log( self::locale_summary_line( $registry, $locale_result ) );

			if ( ! empty( $notes ) ) {
				self::log( '--- 注意 ---' );
				foreach ( $notes as $note ) {
					self::log( '  ' . $note );
				}
			}

			self::log( '撤去する場合: wp eval-file wp-content/plugins/smart-booking/tests/screenshots/seed/screenshot-purge.php' );
		}

		/**
		 * ロケールの状態を 1 行にまとめる（変更前 → 変更後 / 言語パックの要否 / ユーザー個別ロケール）。
		 *
		 * 「変更前」は実行時の現在値ではなくレジストリの退避値から作る。こうしないと
		 * 2 回目の実行で「ja → ja」と出てしまい、出力の冪等性が崩れるため。
		 *
		 * @param array $registry      レジストリ.
		 * @param array $locale_result apply_locale の戻り値.
		 * @return string
		 */
		private static function locale_summary_line( $registry, $locale_result ) {
			$pack_labels = array(
				'installed'  => '導入済み（再ダウンロードなし）',
				'downloaded' => '今回ダウンロード',
				'failed'     => 'ダウンロード失敗',
			);
			$pack_key    = isset( $locale_result['pack'] ) ? (string) $locale_result['pack'] : 'installed';
			$pack        = isset( $pack_labels[ $pack_key ] ) ? $pack_labels[ $pack_key ] : $pack_key;

			$users = array();
			foreach ( (array) $registry['user_locales'] as $user_id => $backup ) {
				$login   = isset( $backup['login'] ) ? (string) $backup['login'] : ( '#' . (int) $user_id );
				$users[] = sprintf( '%s（変更前 %s）', $login, isset( $backup['value'] ) ? (string) $backup['value'] : '' );
			}
			$user_label = empty( $users ) ? '変更なし（サイト既定のまま）' : '空に変更: ' . implode( ' / ', $users );

			if ( ! isset( $registry['options'][ self::LOCALE_OPTION ] ) ) {
				// 言語パックが用意できず、ロケールを変更しなかったケース。
				$current = (string) get_option( self::LOCALE_OPTION, '' );
				return sprintf(
					'  %s = %s のまま（変更していません）  (言語パック %s: %s / ユーザー個別ロケール: %s)',
					self::LOCALE_OPTION,
					( '' === $current ? '未設定(en_US)' : $current ),
					self::TARGET_LOCALE,
					$pack,
					$user_label
				);
			}

			$backup = $registry['options'][ self::LOCALE_OPTION ];
			$before = empty( $backup['existed'] ) ? '未設定(en_US)' : (string) $backup['value'];
			return sprintf(
				'  %s = %s → %s  (言語パック %s: %s / ユーザー個別ロケール: %s)',
				self::LOCALE_OPTION,
				$before,
				self::TARGET_LOCALE,
				self::TARGET_LOCALE,
				$pack,
				$user_label
			);
		}

		/* ------------------------------------------------------------------ */
		/* 撤去（purge）                                                       */
		/* ------------------------------------------------------------------ */

		/**
		 * レジストリ管理下の行だけを削除し、オプション（表示系 2 件 + WPLANG）と
		 * ユーザー個別ロケールを変更前の状態へ戻し、レジストリを空にする。
		 *
		 * 削除順序は 予約メタ → 予約 → スケジュール → カスタムフィールド → フォーム → 担当者 → 店舗。
		 * レジストリ外のデータから参照されている行は削除せず保持し、その id だけをレジストリに残す。
		 *
		 * @return void
		 */
		public static function purge() {
			global $wpdb;

			$registry = self::get_registry();
			$kept     = array();
			$removed  = array();

			// 予約メタ → 予約。
			$reservation_ids = self::registry_ids( $registry, 'reservations' );
			$meta_deleted    = 0;
			if ( ! empty( $reservation_ids ) ) {
				$in = self::placeholders( $reservation_ids );
				// phpcs:ignore
				$meta_deleted = (int) $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}smart_booking_reservation_meta WHERE reservation_id IN ({$in})", $reservation_ids ) );
			}
			$removed['reservation_meta'] = $meta_deleted;
			$removed['reservations']     = self::delete_by_ids( self::table( 'reservations' ), $reservation_ids );
			$registry['reservations']    = array();

			// スケジュール（レジストリ外の予約から参照されているものは保護）。
			$schedule_ids           = self::registry_ids( $registry, 'schedules' );
			$blocked                = self::foreign_referenced_ids( 'schedules', $schedule_ids, $registry );
			$removed['schedules']   = self::delete_by_ids( self::table( 'schedules' ), array_values( array_diff( $schedule_ids, $blocked ) ) );
			$registry['schedules']  = $blocked;
			if ( ! empty( $blocked ) ) {
				$kept[] = 'schedules: ' . count( $blocked ) . ' 件（レジストリ外の予約から参照されているため保持）';
			}

			// カスタムフィールド → フォーム → 担当者 → 店舗（子から親の順）。
			$sections = array(
				'custom_fields' => self::table( 'custom_fields' ),
				'forms'         => self::table( 'forms' ),
				'staff'         => self::table( 'staff' ),
				'stores'        => self::table( 'stores' ),
			);
			foreach ( $sections as $section => $table ) {
				$ids     = self::registry_ids( $registry, $section );
				$blocked = self::foreign_referenced_ids( $section, $ids, $registry );

				$deleted_count = 0;
				$remaining     = array();
				foreach ( (array) $registry[ $section ] as $slug => $id ) {
					$id = (int) $id;
					if ( $id <= 0 ) {
						continue;
					}
					if ( in_array( $id, $blocked, true ) ) {
						$remaining[ $slug ] = $id;
						continue;
					}
					$deleted_count += self::delete_by_ids( $table, array( $id ) );
				}
				$removed[ $section ]  = $deleted_count;
				$registry[ $section ] = $remaining;
				if ( ! empty( $remaining ) ) {
					$kept[] = $section . ': ' . count( $remaining ) . ' 件（レジストリ外のデータから参照されているため保持）';
				}
			}

			// 表示系オプションを変更前の状態へ戻す。
			$restored = array();
			foreach ( (array) $registry['options'] as $key => $backup ) {
				if ( empty( $backup['existed'] ) ) {
					delete_option( $key );
					$restored[] = 'option    ' . $key . ' = 削除（元から未設定）';
					continue;
				}
				update_option( $key, $backup['value'] );
				$restored[] = 'option    ' . $key . ' = ' . (string) $backup['value'] . '（復元）';
			}
			$registry['options'] = array();

			// 撮影のために空にしたユーザー個別ロケールを戻す。
			foreach ( (array) $registry['user_locales'] as $user_id => $backup ) {
				$user_id = (int) $user_id;
				if ( $user_id <= 0 ) {
					continue;
				}
				$login = isset( $backup['login'] ) ? (string) $backup['login'] : ( '#' . $user_id );
				if ( empty( $backup['existed'] ) ) {
					delete_user_meta( $user_id, 'locale' );
					$restored[] = sprintf( 'user_meta locale (%s) = 削除（元から未設定）', $login );
					continue;
				}
				update_user_meta( $user_id, 'locale', $backup['value'] );
				$restored[] = sprintf( 'user_meta locale (%s) = %s（復元）', $login, (string) $backup['value'] );
			}
			$registry['user_locales'] = array();

			// 何も残っていなければレジストリ自体を削除する。
			$leftovers = 0;
			foreach ( array( 'stores', 'staff', 'forms', 'custom_fields', 'schedules', 'reservations' ) as $section ) {
				$leftovers += count( self::registry_ids( $registry, $section ) );
			}
			if ( 0 === $leftovers ) {
				delete_option( self::REGISTRY_OPTION );
			} else {
				$registry['seeded_at'] = '';
				self::save_registry( $registry );
			}

			self::log( '=== Smart Booking 撮影用デモデータ 撤去完了 ===' );
			self::log( sprintf( '  削除: 店舗=%d / 担当者=%d / フォーム=%d / カスタムフィールド=%d / スケジュール=%d / 予約=%d / 予約メタ=%d', $removed['stores'], $removed['staff'], $removed['forms'], $removed['custom_fields'], $removed['schedules'], $removed['reservations'], $removed['reservation_meta'] ) );
			foreach ( $restored as $line ) {
				self::log( '  ' . $line );
			}
			if ( ! empty( $kept ) ) {
				self::log( '--- 保持したデータ ---' );
				foreach ( $kept as $line ) {
					self::log( '  ' . $line );
				}
				self::log( '  レジストリ option は保持データを指したまま残しています。' );
			} else {
				self::log( '  レジストリ option ' . self::REGISTRY_OPTION . ' を削除しました。' );
			}
		}
	}
}
