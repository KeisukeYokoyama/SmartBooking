<?php
/**
 * Smart Booking - REST API ディスパッチャ
 *
 * 名前空間 `smart-booking/v1` のリソース別コントローラを読み込み、ルート登録を委譲する。
 *
 * セキュリティ方針:
 * - 全エンドポイントで `current_user_can( 'manage_options' )` を必須とする。
 * - WP REST API は Cookie 認証経由のリクエストに対し `X-WP-Nonce` ヘッダを自動検証する
 *   （`wp_create_nonce( 'wp_rest' )` が対応）。これにより CSRF を防止する。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once SMART_BOOKING_PLUGIN_DIR . 'includes/rest/class-rest-base.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/rest/class-rest-stores.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/rest/class-rest-staff.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/rest/class-rest-schedules.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/rest/class-rest-reservations.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/rest/class-rest-custom-fields.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/rest/class-rest-settings.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/rest/class-rest-public.php';

/**
 * REST API ディスパッチャクラス。
 */
class Smart_Booking_REST_API {

	/**
	 * REST API 名前空間。
	 */
	const NAMESPACE_V1 = 'smart-booking/v1';

	/**
	 * リソース別コントローラ。
	 *
	 * @var Smart_Booking_REST_Base[]
	 */
	private $controllers = array();

	/**
	 * フック登録。
	 *
	 * @return void
	 */
	public function init() {
		$this->controllers = array(
			new Smart_Booking_REST_Stores(),
			new Smart_Booking_REST_Staff(),
			new Smart_Booking_REST_Schedules(),
			new Smart_Booking_REST_Reservations(),
			new Smart_Booking_REST_Custom_Fields(),
			new Smart_Booking_REST_Settings(),
			new Smart_Booking_REST_Public(),
		);
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * 権限チェック（互換のため残す。各コントローラで基底クラスのメソッドを使用）。
	 *
	 * @return bool
	 */
	public function permission_check() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * ルートを各コントローラに委譲して登録する。
	 *
	 * @return void
	 */
	public function register_routes() {
		foreach ( $this->controllers as $controller ) {
			$controller->register_routes();
		}
	}
}
