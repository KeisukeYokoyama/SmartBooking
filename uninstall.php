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

	$smart_booking_prefix = $wpdb->prefix . 'smb_';
	$smart_booking_tables = array(
		$smart_booking_prefix . 'reservation_meta',
		$smart_booking_prefix . 'reservations',
		$smart_booking_prefix . 'schedules',
		$smart_booking_prefix . 'staff',
		$smart_booking_prefix . 'stores',
		$smart_booking_prefix . 'custom_fields',
	);

	foreach ( $smart_booking_tables as $smart_booking_table ) {
		// テーブル名は信頼できる内部定数由来。プレースホルダでは識別子を扱えないため直接埋め込む。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( "DROP TABLE IF EXISTS {$smart_booking_table}" );
	}

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
