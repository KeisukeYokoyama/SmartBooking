<?php
/**
 * Smart Booking - Shortcode
 *
 * `[smart_booking]` ショートコードを登録し、React 予約フォームのマウント用 DOM を出力する。
 * ショートコードが実際に使われているページでのみ frontend バンドルを enqueue する。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * フロントエンド ショートコード統括クラス。
 */
class Smart_Booking_Shortcode {

	/**
	 * ショートコード名。
	 */
	const SHORTCODE = 'smart_booking';

	/**
	 * フック登録。
	 *
	 * @return void
	 */
	public function init() {
		add_shortcode( self::SHORTCODE, array( $this, 'render' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	/**
	 * ショートコードのレンダラ。React マウント用の div を出力する。
	 *
	 * @param array $atts ショートコード属性.
	 * @return string
	 */
	public function render( $atts ) {
		$atts = shortcode_atts(
			array(
				'store_id' => 0,
			),
			$atts,
			self::SHORTCODE
		);

		$store_id = (int) $atts['store_id'];

		return sprintf(
			'<div id="smart-booking-app" data-store-id="%d"></div>',
			esc_attr( $store_id )
		);
	}

	/**
	 * 当該ページで [smart_booking] が使われている場合のみ frontend バンドルを enqueue する。
	 *
	 * @return void
	 */
	public function enqueue_assets() {
		if ( ! is_singular() ) {
			return;
		}

		$post = get_post();
		if ( ! $post || ! has_shortcode( $post->post_content, self::SHORTCODE ) ) {
			return;
		}

		$asset_file = SMART_BOOKING_PLUGIN_DIR . 'build/frontend.asset.php';
		if ( ! file_exists( $asset_file ) ) {
			return;
		}

		$asset = include $asset_file;
		$deps  = isset( $asset['dependencies'] ) && is_array( $asset['dependencies'] ) ? $asset['dependencies'] : array();
		$ver   = isset( $asset['version'] ) ? $asset['version'] : SMART_BOOKING_VERSION;

		wp_enqueue_script(
			'smart-booking-frontend',
			SMART_BOOKING_PLUGIN_URL . 'build/frontend.js',
			$deps,
			$ver,
			true
		);

		$css_path = SMART_BOOKING_PLUGIN_DIR . 'build/frontend.css';
		if ( file_exists( $css_path ) ) {
			wp_enqueue_style(
				'smart-booking-frontend',
				SMART_BOOKING_PLUGIN_URL . 'build/frontend.css',
				array(),
				$ver
			);
		}

		wp_localize_script(
			'smart-booking-frontend',
			'smartBookingFrontend',
			array(
				'restUrl'   => esc_url_raw( rest_url( 'smart-booking/v1/' ) ),
				'nonce'     => wp_create_nonce( 'wp_rest' ),
				'pluginUrl' => esc_url_raw( SMART_BOOKING_PLUGIN_URL ),
				'version'   => SMART_BOOKING_VERSION,
			)
		);
	}
}
