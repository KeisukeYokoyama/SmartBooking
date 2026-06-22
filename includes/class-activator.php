<?php
/**
 * Smart Booking - Activator
 *
 * プラグイン有効化時に実行される処理。
 * - カスタムテーブル6つを dbDelta で作成
 * - デフォルトデータ（店舗1件・担当者1件・初期カスタムフィールド3件）を投入
 *
 * 注意: register_activation_hook 経由でのみ実行する。init フックでの呼び出しは禁止。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * テーブル作成・初期データ投入を担うアクティベータクラス。
 */
class Smart_Booking_Activator {

	/**
	 * プラグイン有効化時のエントリーポイント。
	 *
	 * @return void
	 */
	public static function activate() {
		self::create_tables();
		self::seed_default_data();
		self::seed_default_options();
		self::run_migrations();
		update_option( 'smabo_db_version', SMART_BOOKING_VERSION );
	}

	/**
	 * バージョン間マイグレーション。
	 *
	 * - 0.2.0: smabo_stores / smabo_staff に is_system カラムを追加し、既存のデフォルト
	 *   エントリ（最も若い id のもの）に is_system=1 を設定する。
	 *
	 * dbDelta が ALTER TABLE を担うため、ここでは値の埋め直しのみを行う。
	 *
	 * @return void
	 */
	private static function run_migrations() {
		global $wpdb;

		$current = (string) get_option( 'smabo_db_version', '0.0.0' );

		// 0.2.0: is_system 導入。
		if ( version_compare( $current, '0.2.0', '<' ) ) {
			// 既存の is_system=1 エントリが既にある場合は no-op（新規環境/再マイグレーションでも安全）。
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$has_system_store = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smabo_stores WHERE is_system = 1" );
			if ( 0 === $has_system_store ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$first_store_id = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}smabo_stores ORDER BY id ASC LIMIT 1" );
				if ( $first_store_id > 0 ) {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
					$wpdb->update(
						$wpdb->prefix . 'smabo_stores',
						array( 'is_system' => 1 ),
						array( 'id' => $first_store_id ),
						array( '%d' ),
						array( '%d' )
					);
				}
			}

			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$has_system_staff = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smabo_staff WHERE is_system = 1" );
			if ( 0 === $has_system_staff ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$first_staff_id = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}smabo_staff ORDER BY id ASC LIMIT 1" );
				if ( $first_staff_id > 0 ) {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
					$wpdb->update(
						$wpdb->prefix . 'smabo_staff',
						array( 'is_system' => 1 ),
						array( 'id' => $first_staff_id ),
						array( '%d' ),
						array( '%d' )
					);
				}
			}
		}
	}

	/**
	 * 初期設定値を投入する。add_option は既存キーがあれば no-op のため、再有効化でも上書きしない。
	 *
	 * @return void
	 */
	private static function seed_default_options() {
		$defaults = array(
			// 基本設定.
			'smabo_booking_flow_order'           => 'date-first',
			'smabo_calendar_view_mode'           => 'day_only',
			'smabo_display_days'                 => 14,
			'smabo_booking_deadline_days'        => 0,
			'smabo_booking_deadline_hours'       => 2,
			'smabo_show_store_front'             => 0,
			'smabo_show_staff_front'             => 0,
			'smabo_completion_message'           => 'ご予約を受け付けました。確認メールをお送りしましたのでご確認ください。',

			// メール（デフォルト文面）.
			'smabo_mail_from_name'               => get_option( 'blogname', 'Smart Booking' ),
			'smabo_mail_from_email'              => get_option( 'admin_email', '' ),
			'smabo_mail_admin_notify_enabled'    => 1,
			'smabo_mail_receipt_user_subject'    => '【{store_name}】ご予約を受け付けました',
			'smabo_mail_receipt_user_body'       => "{customer_name} 様\n\nご予約を受け付けました。\n下記内容にて承りました。\n\n▼ご予約内容\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n担当: {staff_name}\n予約番号: {reservation_id}\n\n内容に変更がある場合はご連絡ください。",
			'smabo_mail_receipt_admin_subject'   => '【新規予約】{customer_name} 様 ({schedule_date} {schedule_time})',
			'smabo_mail_receipt_admin_body'      => "新しい予約が入りました。\n\n予約番号: {reservation_id}\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n担当: {staff_name}\n予約者: {customer_name}\nメール: {customer_email}\n電話: {customer_phone}",
			'smabo_mail_approval_user_subject'   => '【{store_name}】ご予約が確定しました',
			'smabo_mail_approval_user_body'      => "{customer_name} 様\n\nご予約が確定しました。\n\n▼ご予約内容\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n担当: {staff_name}\n予約番号: {reservation_id}\n\n当日お待ちしております。",

			// 外部連携はデフォルト OFF（WordPress.org 審査ルール）.
			'smabo_google_calendar_enabled'      => 0,
			'smabo_google_calendar_id'           => '',
			// サービスアカウント JSON（autoload=no で別保存。下の add_option で個別に処理）.
			'smabo_google_calendar_client_email' => '',
			'smabo_chatwork_enabled'             => 0,
			'smabo_chatwork_api_token'           => '',
			'smabo_chatwork_room_id'             => '',

			// デザイン（フロント予約フォームのブランドカラー）.
			'smabo_color_button'                 => '#f43f5e',
			'smabo_color_date_selected'          => '#374151',
			'smabo_color_time_selected'          => '#374151',
			'smabo_color_required_mark'          => '#ef4444',
			'smabo_color_focus'                  => '#3498db',
		);

		foreach ( $defaults as $key => $value ) {
			add_option( $key, $value );
		}

		// JSON サービスアカウントは autoload=no で初期化（巨大化を避ける）.
		if ( false === get_option( 'smabo_google_calendar_credentials_json', false ) ) {
			add_option( 'smabo_google_calendar_credentials_json', '', '', 'no' );
		}
	}

	/**
	 * カスタムテーブル6つを作成する。
	 *
	 * dbDelta は冪等に動作するため、既存テーブルがあっても安全。
	 *
	 * @return void
	 */
	private static function create_tables() {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset_collate = $wpdb->get_charset_collate();
		$prefix          = $wpdb->prefix . 'smabo_';

		// smabo_stores（店舗マスター）.
		$sql_stores = "CREATE TABLE {$prefix}stores (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			name varchar(255) NOT NULL DEFAULT '',
			phone varchar(20) NOT NULL DEFAULT '',
			email varchar(255) NOT NULL DEFAULT '',
			prefecture varchar(10) NOT NULL DEFAULT '',
			city varchar(50) NOT NULL DEFAULT '',
			address_line varchar(255) NOT NULL DEFAULT '',
			description text NULL,
			image_id bigint(20) unsigned NOT NULL DEFAULT 0,
			calendar_color varchar(7) NOT NULL DEFAULT '#3B82F6',
			is_active tinyint(1) NOT NULL DEFAULT 1,
			is_system tinyint(1) NOT NULL DEFAULT 0,
			sort_order int(11) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_is_active (is_active),
			KEY idx_is_system (is_system),
			KEY idx_sort_order (sort_order)
		) {$charset_collate};";

		// smabo_staff（担当者マスター）.
		$sql_staff = "CREATE TABLE {$prefix}staff (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			store_id bigint(20) unsigned NOT NULL DEFAULT 0,
			name varchar(255) NOT NULL DEFAULT '',
			email varchar(255) NOT NULL DEFAULT '',
			phone varchar(20) NOT NULL DEFAULT '',
			description text NULL,
			image_id bigint(20) unsigned NOT NULL DEFAULT 0,
			is_active tinyint(1) NOT NULL DEFAULT 1,
			is_system tinyint(1) NOT NULL DEFAULT 0,
			sort_order int(11) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_store_id (store_id),
			KEY idx_is_active (is_active),
			KEY idx_is_system (is_system),
			KEY idx_sort_order (sort_order)
		) {$charset_collate};";

		// smabo_schedules（予約枠）.
		$sql_schedules = "CREATE TABLE {$prefix}schedules (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			store_id bigint(20) unsigned NOT NULL DEFAULT 0,
			staff_id bigint(20) unsigned NOT NULL DEFAULT 0,
			schedule_date date NOT NULL,
			start_time time NOT NULL,
			end_time time NOT NULL,
			capacity int(11) NOT NULL DEFAULT 1,
			booked_count int(11) NOT NULL DEFAULT 0,
			is_active tinyint(1) NOT NULL DEFAULT 1,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_store_staff_date (store_id,staff_id,schedule_date),
			KEY idx_schedule_date (schedule_date),
			KEY idx_is_active (is_active)
		) {$charset_collate};";

		// smabo_reservations（予約データ）.
		$sql_reservations = "CREATE TABLE {$prefix}reservations (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			store_id bigint(20) unsigned NOT NULL DEFAULT 0,
			staff_id bigint(20) unsigned NOT NULL DEFAULT 0,
			schedule_id bigint(20) unsigned NOT NULL DEFAULT 0,
			schedule_date date NOT NULL,
			schedule_time time NOT NULL,
			customer_name varchar(255) NOT NULL DEFAULT '',
			customer_email varchar(255) NOT NULL DEFAULT '',
			customer_phone varchar(20) NOT NULL DEFAULT '',
			status varchar(20) NOT NULL DEFAULT 'pending',
			admin_memo text NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_schedule_id (schedule_id),
			KEY idx_schedule_date (schedule_date),
			KEY idx_status (status),
			KEY idx_store_id (store_id),
			KEY idx_staff_id (staff_id)
		) {$charset_collate};";

		// smabo_reservation_meta（カスタムフィールド入力値）.
		$sql_reservation_meta = "CREATE TABLE {$prefix}reservation_meta (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			reservation_id bigint(20) unsigned NOT NULL DEFAULT 0,
			meta_key varchar(255) NOT NULL DEFAULT '',
			meta_value text NULL,
			PRIMARY KEY  (id),
			KEY idx_reservation_id (reservation_id),
			KEY idx_meta_key (meta_key(191))
		) {$charset_collate};";

		// smabo_custom_fields（フォームフィールド定義）.
		$sql_custom_fields = "CREATE TABLE {$prefix}custom_fields (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			field_key varchar(100) NOT NULL DEFAULT '',
			field_label varchar(255) NOT NULL DEFAULT '',
			field_type varchar(20) NOT NULL DEFAULT 'text',
			field_options text NULL,
			placeholder varchar(255) NOT NULL DEFAULT '',
			is_required tinyint(1) NOT NULL DEFAULT 0,
			sort_order int(11) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			UNIQUE KEY uniq_field_key (field_key),
			KEY idx_sort_order (sort_order)
		) {$charset_collate};";

		dbDelta( $sql_stores );
		dbDelta( $sql_staff );
		dbDelta( $sql_schedules );
		dbDelta( $sql_reservations );
		dbDelta( $sql_reservation_meta );
		dbDelta( $sql_custom_fields );
	}

	/**
	 * 初期データを投入する。既存データがある場合はスキップ（冪等）。
	 *
	 * @return void
	 */
	private static function seed_default_data() {
		global $wpdb;

		// デフォルト店舗: 未登録の場合のみ投入.
		// テーブル名は信頼できる内部生成値。プレースホルダでは識別子を扱えないため直接埋め込む。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$stores_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smabo_stores" );
		$store_id     = 0;
		if ( 0 === $stores_count ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->prefix . 'smabo_stores',
				array(
					'name'           => 'デフォルト',
					'phone'          => '',
					'email'          => get_option( 'admin_email', '' ),
					'prefecture'     => '',
					'city'           => '',
					'address_line'   => '',
					'description'    => '',
					'image_id'       => 0,
					'calendar_color' => '#3B82F6',
					'is_active'      => 1,
					'is_system'      => 1,
					'sort_order'     => 0,
					'created_at'     => current_time( 'mysql' ),
					'updated_at'     => current_time( 'mysql' ),
				),
				array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%d', '%d', '%d', '%s', '%s' )
			);
			$store_id = (int) $wpdb->insert_id;
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$store_id = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}smabo_stores ORDER BY id ASC LIMIT 1" );
		}

		// デフォルト担当者: 未登録の場合のみ投入.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$staff_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smabo_staff" );
		if ( 0 === $staff_count && $store_id > 0 ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->prefix . 'smabo_staff',
				array(
					'store_id'    => $store_id,
					'name'        => 'デフォルト',
					'email'       => '',
					'phone'       => '',
					'description' => '',
					'image_id'    => 0,
					'is_active'   => 1,
					'is_system'   => 1,
					'sort_order'  => 0,
					'created_at'  => current_time( 'mysql' ),
					'updated_at'  => current_time( 'mysql' ),
				),
				array( '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%d', '%s', '%s' )
			);
		}

		// デフォルトカスタムフィールド: 未登録の場合のみ投入.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$fields_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smabo_custom_fields" );
		if ( 0 === $fields_count ) {
			$defaults = array(
				array(
					'field_key'   => 'customer_name',
					'field_label' => '氏名',
					'field_type'  => 'text',
					'placeholder' => '山田 太郎',
					'is_required' => 1,
					'sort_order'  => 0,
				),
				array(
					'field_key'   => 'customer_email',
					'field_label' => 'メールアドレス',
					'field_type'  => 'email',
					'placeholder' => 'example@example.com',
					'is_required' => 1,
					'sort_order'  => 1,
				),
				array(
					'field_key'   => 'customer_phone',
					'field_label' => '電話番号',
					'field_type'  => 'tel',
					'placeholder' => '090-1234-5678',
					'is_required' => 1,
					'sort_order'  => 2,
				),
			);

			foreach ( $defaults as $field ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->insert(
					$wpdb->prefix . 'smabo_custom_fields',
					array(
						'field_key'     => $field['field_key'],
						'field_label'   => $field['field_label'],
						'field_type'    => $field['field_type'],
						'field_options' => '',
						'placeholder'   => $field['placeholder'],
						'is_required'   => $field['is_required'],
						'sort_order'    => $field['sort_order'],
						'created_at'    => current_time( 'mysql' ),
					),
					array( '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s' )
				);
			}
		}
	}
}
