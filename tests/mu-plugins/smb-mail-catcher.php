<?php
/**
 * Plugin Name: Smart Booking Mail Catcher (E2E only)
 * Description: wp_mail() を傍受してオプションに保存し、E2E テスト用の REST 取得口を公開する。wp-env でしか有効化されない（本番には同梱しない）。
 *
 * @package Smart_Booking_Tests
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! defined( 'SMB_MAIL_CATCHER_OPTION' ) ) {
	define( 'SMB_MAIL_CATCHER_OPTION', 'smb_test_mail_log' );
}

if ( ! defined( 'SMB_MAIL_CATCHER_MAX' ) ) {
	define( 'SMB_MAIL_CATCHER_MAX', 100 );
}

/**
 * pre_wp_mail フィルタで送信を傍受し、ログに保存する。
 * true を返すと wp_mail 本体は実行されない（実際の送信は行わない）。
 *
 * オプトイン方式: `smb_mail_capture_enabled` オプションが '1' のときだけ傍受する。
 * 既定は OFF。これにより、ローカルでのブラウザテスト時は wp_mail() がそのまま PHPMailer
 * へ流れて MailPit (smb-mailpit-smtp.php) で受け取れる。
 * E2E テスト (phase4-email.spec.js) は beforeEach でこのオプションを 1 にセットする。
 *
 * @param null|bool $short_circuit pre_wp_mail の標準値。
 * @param array     $atts          wp_mail に渡された引数の連想配列。
 * @return null|bool
 */
function smb_mail_catcher_capture( $short_circuit, $atts ) {
	if ( '1' !== (string) get_option( 'smb_mail_capture_enabled', '0' ) ) {
		// 素通り: PHPMailer へ流して実際の送信を行う（MailPit などで受け取る）。
		return $short_circuit;
	}

	$entry = array(
		'to'         => isset( $atts['to'] ) ? $atts['to'] : '',
		'subject'    => isset( $atts['subject'] ) ? $atts['subject'] : '',
		'message'    => isset( $atts['message'] ) ? $atts['message'] : '',
		'headers'    => isset( $atts['headers'] ) ? $atts['headers'] : array(),
		'attachments' => isset( $atts['attachments'] ) ? $atts['attachments'] : array(),
		'captured_at' => gmdate( 'c' ),
	);

	$log = get_option( SMB_MAIL_CATCHER_OPTION, array() );
	if ( ! is_array( $log ) ) {
		$log = array();
	}
	$log[] = $entry;
	if ( count( $log ) > SMB_MAIL_CATCHER_MAX ) {
		$log = array_slice( $log, -1 * SMB_MAIL_CATCHER_MAX );
	}
	update_option( SMB_MAIL_CATCHER_OPTION, $log, false );

	return true;
}
add_filter( 'pre_wp_mail', 'smb_mail_catcher_capture', 10, 2 );

/**
 * E2E テスト用の REST ルートを登録する。
 * 認証は manage_options 必須（テストは admin Cookie でアクセスする）。
 *
 * @return void
 */
function smb_mail_catcher_register_routes() {
	register_rest_route(
		'smb-test/v1',
		'/mail',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'smb_mail_catcher_get',
				'permission_callback' => static function () {
					return current_user_can( 'manage_options' );
				},
			),
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => 'smb_mail_catcher_clear',
				'permission_callback' => static function () {
					return current_user_can( 'manage_options' );
				},
			),
		)
	);
}
add_action( 'rest_api_init', 'smb_mail_catcher_register_routes' );

/**
 * 取得ハンドラ。
 *
 * @return WP_REST_Response
 */
function smb_mail_catcher_get() {
	$log = get_option( SMB_MAIL_CATCHER_OPTION, array() );
	if ( ! is_array( $log ) ) {
		$log = array();
	}
	return rest_ensure_response(
		array(
			'count' => count( $log ),
			'items' => $log,
		)
	);
}

/**
 * クリアハンドラ。
 *
 * @return WP_REST_Response
 */
function smb_mail_catcher_clear() {
	delete_option( SMB_MAIL_CATCHER_OPTION );
	return rest_ensure_response( array( 'cleared' => true ) );
}
