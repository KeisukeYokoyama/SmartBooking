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

	// smb_ プレフィックスのオプションを全削除.
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
	$smart_booking_option_names = $wpdb->get_col(
		$wpdb->prepare(
			"SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
			$wpdb->esc_like( 'smb_' ) . '%'
		)
	);

	if ( is_array( $smart_booking_option_names ) ) {
		foreach ( $smart_booking_option_names as $smart_booking_option_name ) {
			delete_option( $smart_booking_option_name );
		}
	}
}

smart_booking_run_uninstall();
