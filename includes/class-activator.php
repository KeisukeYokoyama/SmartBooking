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
		update_option( 'smb_db_version', SMART_BOOKING_VERSION );
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
		$prefix          = $wpdb->prefix . 'smb_';

		// smb_stores（店舗マスター）.
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
			sort_order int(11) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_is_active (is_active),
			KEY idx_sort_order (sort_order)
		) {$charset_collate};";

		// smb_staff（担当者マスター）.
		$sql_staff = "CREATE TABLE {$prefix}staff (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			store_id bigint(20) unsigned NOT NULL DEFAULT 0,
			name varchar(255) NOT NULL DEFAULT '',
			email varchar(255) NOT NULL DEFAULT '',
			phone varchar(20) NOT NULL DEFAULT '',
			description text NULL,
			image_id bigint(20) unsigned NOT NULL DEFAULT 0,
			is_active tinyint(1) NOT NULL DEFAULT 1,
			sort_order int(11) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_store_id (store_id),
			KEY idx_is_active (is_active),
			KEY idx_sort_order (sort_order)
		) {$charset_collate};";

		// smb_schedules（予約枠）.
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

		// smb_reservations（予約データ）.
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

		// smb_reservation_meta（カスタムフィールド入力値）.
		$sql_reservation_meta = "CREATE TABLE {$prefix}reservation_meta (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			reservation_id bigint(20) unsigned NOT NULL DEFAULT 0,
			meta_key varchar(255) NOT NULL DEFAULT '',
			meta_value text NULL,
			PRIMARY KEY  (id),
			KEY idx_reservation_id (reservation_id),
			KEY idx_meta_key (meta_key(191))
		) {$charset_collate};";

		// smb_custom_fields（フォームフィールド定義）.
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

		$stores_table        = $wpdb->prefix . 'smb_stores';
		$staff_table         = $wpdb->prefix . 'smb_staff';
		$custom_fields_table = $wpdb->prefix . 'smb_custom_fields';

		// デフォルト店舗: 未登録の場合のみ投入.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$stores_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$stores_table}" );
		$store_id     = 0;
		if ( 0 === $stores_count ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$stores_table,
				array(
					'name'           => '店舗1',
					'phone'          => '',
					'email'          => get_option( 'admin_email', '' ),
					'prefecture'     => '',
					'city'           => '',
					'address_line'   => '',
					'description'    => '',
					'image_id'       => 0,
					'calendar_color' => '#3B82F6',
					'is_active'      => 1,
					'sort_order'     => 0,
					'created_at'     => current_time( 'mysql' ),
					'updated_at'     => current_time( 'mysql' ),
				),
				array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%d', '%d', '%s', '%s' )
			);
			$store_id = (int) $wpdb->insert_id;
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$store_id = (int) $wpdb->get_var( "SELECT id FROM {$stores_table} ORDER BY id ASC LIMIT 1" );
		}

		// デフォルト担当者: 未登録の場合のみ投入.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$staff_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$staff_table}" );
		if ( 0 === $staff_count && $store_id > 0 ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$staff_table,
				array(
					'store_id'    => $store_id,
					'name'        => '担当者1',
					'email'       => '',
					'phone'       => '',
					'description' => '',
					'image_id'    => 0,
					'is_active'   => 1,
					'sort_order'  => 0,
					'created_at'  => current_time( 'mysql' ),
					'updated_at'  => current_time( 'mysql' ),
				),
				array( '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s' )
			);
		}

		// デフォルトカスタムフィールド: 未登録の場合のみ投入.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$fields_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$custom_fields_table}" );
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
					$custom_fields_table,
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
