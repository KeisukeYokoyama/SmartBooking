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

global $wpdb;

$prefix = $wpdb->prefix . 'smb_';
$tables = array(
	$prefix . 'reservation_meta',
	$prefix . 'reservations',
	$prefix . 'schedules',
	$prefix . 'staff',
	$prefix . 'stores',
	$prefix . 'custom_fields',
);

foreach ( $tables as $table ) {
	// テーブル名は信頼できる内部定数由来。プレースホルダでは識別子を扱えないため直接埋め込む。
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	$wpdb->query( "DROP TABLE IF EXISTS {$table}" );
}

// smb_ プレフィックスのオプションを全削除.
// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
$option_names = $wpdb->get_col(
	$wpdb->prepare(
		"SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
		$wpdb->esc_like( 'smb_' ) . '%'
	)
);

if ( is_array( $option_names ) ) {
	foreach ( $option_names as $option_name ) {
		delete_option( $option_name );
	}
}
