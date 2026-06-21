<?php
/**
 * Smart Booking - Uninstall
 *
 * プラグイン削除時に実行される。
 * - カスタムテーブル6つを DROP
 * - `smb_` プレフィックスで始まる wp_options を削除
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
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smb_reservation_meta" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smb_reservations" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smb_schedules" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smb_staff" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smb_stores" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}smb_custom_fields" );
	// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared

	// 削除対象のオプションを明示的に列挙する。
	// 広域削除（LIKE 'smb_%'）ではなく明示リストにすることで、削除範囲を限定する。
	$smart_booking_option_names = array(
		// 基本設定.
		'smb_booking_flow_order',
		'smb_calendar_view_mode',
		'smb_display_days',
		'smb_booking_deadline_days',
		'smb_booking_deadline_hours',
		'smb_show_store_front',
		'smb_show_staff_front',
		'smb_completion_message',
		// メール通知.
		'smb_mail_from_name',
		'smb_mail_from_email',
		'smb_mail_admin_notify_enabled',
		'smb_mail_receipt_user_subject',
		'smb_mail_receipt_user_body',
		'smb_mail_receipt_admin_subject',
		'smb_mail_receipt_admin_body',
		'smb_mail_approval_user_subject',
		'smb_mail_approval_user_body',
		// 外部連携.
		'smb_google_calendar_enabled',
		'smb_google_calendar_id',
		'smb_google_calendar_credentials_json',
		'smb_google_calendar_client_email',
		'smb_chatwork_enabled',
		'smb_chatwork_api_token',
		'smb_chatwork_room_id',
		// デザイン.
		'smb_color_button',
		'smb_color_date_selected',
		'smb_color_time_selected',
		'smb_color_required_mark',
		'smb_color_focus',
		// DB バージョン.
		'smb_db_version',
	);

	foreach ( $smart_booking_option_names as $smart_booking_option_name ) {
		delete_option( $smart_booking_option_name );
	}

	// Transient 削除（現行コードでは LIKE 'smb_%' で取りこぼしていた）.
	delete_transient( 'smb_gcal_token' );
}

smart_booking_run_uninstall();
