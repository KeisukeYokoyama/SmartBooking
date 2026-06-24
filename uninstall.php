<?php
/**
 * Smart Booking - Uninstall
 *
 * プラグイン削除時に実行される。
 * - カスタムテーブル6つを DROP
 * - `smabo_` プレフィックスで始まる wp_options を削除
 *
 * 仕様書 5.11 に従い、データを残す選択肢は設けない。
 * マルチサイト対応は初期リリース範囲外（シングルサイト前提）。
 *
 * @package Smart_Booking
 */

// WordPress のアンインストーラ経由でのみ実行を許可.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/**
 * アンインストール処理本体。
 *
 * グローバルスコープで変数を持たないよう関数化している。
 *
 * @return void
 */
function smart_booking_run_uninstall() {
	global $wpdb;

	// テーブル名は wpdb->prefix と固定文字列のみで構成。プレースホルダでは識別子を扱えないため直接埋め込む。
	// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smart_booking_reservation_meta" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smart_booking_reservations" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smart_booking_schedules" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smart_booking_staff" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smart_booking_stores" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smart_booking_custom_fields" );
	// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared

	// 削除対象のオプションを明示的に列挙する。
	// 広域削除（LIKE 'smb_%'）ではなく明示リストにすることで、削除範囲を限定する。
	$smart_booking_option_names = array(
		// 基本設定.
		'smabo_booking_flow_order',
		'smabo_calendar_view_mode',
		'smabo_display_days',
		'smabo_booking_deadline_days',
		'smabo_booking_deadline_hours',
		'smabo_show_store_front',
		'smabo_show_staff_front',
		'smabo_completion_message',
		// メール通知.
		'smabo_mail_from_name',
		'smabo_mail_from_email',
		'smabo_mail_admin_notify_enabled',
		'smabo_mail_receipt_user_subject',
		'smabo_mail_receipt_user_body',
		'smabo_mail_receipt_admin_subject',
		'smabo_mail_receipt_admin_body',
		'smabo_mail_approval_user_subject',
		'smabo_mail_approval_user_body',
		// 外部連携.
		'smabo_google_calendar_enabled',
		'smabo_google_calendar_id',
		'smabo_google_calendar_credentials_json',
		'smabo_google_calendar_client_email',
		'smabo_chatwork_enabled',
		'smabo_chatwork_api_token',
		'smabo_chatwork_room_id',
		// デザイン.
		'smabo_color_button',
		'smabo_color_date_selected',
		'smabo_color_time_selected',
		'smabo_color_required_mark',
		'smabo_color_focus',
		// DB バージョン.
		'smabo_db_version',
	);

	foreach ( $smart_booking_option_names as $smart_booking_option_name ) {
		delete_option( $smart_booking_option_name );
	}

	// Transient 削除（現行コードでは LIKE 'smb_%' で取りこぼしていた）.
	delete_transient( 'smabo_gcal_token' );
}

smart_booking_run_uninstall();
