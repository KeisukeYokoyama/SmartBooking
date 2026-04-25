<?php
/**
 * Smart Booking - Admin
 *
 * 管理画面のメニュー登録・React アプリのマウント用 DOM 出力・スクリプトの enqueue を担う。
 * Smart Booking 関連画面にのみ admin バンドルを読み込む（他の管理画面ページでは読み込まない）。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 管理画面統括クラス。
 */
class Smart_Booking_Admin {

	/**
	 * トップメニューのスラッグ（= スケジュール画面のスラッグ）。
	 */
	const MENU_SLUG = 'smart-booking';

	/**
	 * Smart Booking 配下のサブメニュースラッグ一覧。enqueue 判定で使用する。
	 *
	 * @var array<string,string>
	 */
	private $page_slugs = array(
		'smart-booking'               => 'schedule',
		'smart-booking-reservations'  => 'reservations',
		'smart-booking-stores'        => 'stores',
		'smart-booking-form-settings' => 'form-settings',
		'smart-booking-settings'      => 'settings',
	);

	/**
	 * フック登録。プラグイン本体から呼び出される。
	 *
	 * @return void
	 */
	public function init() {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	/**
	 * トップメニュー + 5 サブメニューを登録する。
	 *
	 * @return void
	 */
	public function register_menu() {
		$capability = 'manage_options';

		add_menu_page(
			__( 'Smart Booking', 'smart-booking' ),
			__( 'Smart Booking', 'smart-booking' ),
			$capability,
			self::MENU_SLUG,
			array( $this, 'render_page' ),
			'dashicons-calendar-alt',
			30
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( 'スケジュール', 'smart-booking' ),
			__( 'スケジュール', 'smart-booking' ),
			$capability,
			self::MENU_SLUG,
			array( $this, 'render_page' )
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( '予約一覧', 'smart-booking' ),
			__( '予約一覧', 'smart-booking' ),
			$capability,
			'smart-booking-reservations',
			array( $this, 'render_page' )
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( '店舗・担当者', 'smart-booking' ),
			__( '店舗・担当者', 'smart-booking' ),
			$capability,
			'smart-booking-stores',
			array( $this, 'render_page' )
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( 'フォーム設定', 'smart-booking' ),
			__( 'フォーム設定', 'smart-booking' ),
			$capability,
			'smart-booking-form-settings',
			array( $this, 'render_page' )
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( '設定', 'smart-booking' ),
			__( '設定', 'smart-booking' ),
			$capability,
			'smart-booking-settings',
			array( $this, 'render_page' )
		);
	}

	/**
	 * 現在の管理画面ページのスラッグから、React に渡す page キーを解決する。
	 *
	 * @return string
	 */
	private function get_current_page_key() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- 参照のみ。権限チェックは add_menu_page/add_submenu_page の capability で担保。
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
		if ( isset( $this->page_slugs[ $page ] ) ) {
			return $this->page_slugs[ $page ];
		}
		return 'schedule';
	}

	/**
	 * React マウント先の DOM をレンダリングする。
	 *
	 * @return void
	 */
	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'このページにアクセスする権限がありません。', 'smart-booking' ) );
		}

		$page_key = $this->get_current_page_key();
		?>
		<div class="wrap">
			<div id="smart-booking-admin-app" data-page="<?php echo esc_attr( $page_key ); ?>"></div>
		</div>
		<?php
	}

	/**
	 * Smart Booking 管理ページでのみ admin バンドルを enqueue する。
	 *
	 * @param string $hook_suffix 現在の管理画面フック名。WordPress 側から自動で渡される。
	 * @return void
	 */
	public function enqueue_assets( $hook_suffix ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.Found
		unset( $hook_suffix );
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- 読み取りのみ。page パラメータで自プラグインのページかを判定する目的。
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
		if ( '' === $page || ! array_key_exists( $page, $this->page_slugs ) ) {
			return;
		}

		$asset_file = SMART_BOOKING_PLUGIN_DIR . 'build/admin.asset.php';
		if ( ! file_exists( $asset_file ) ) {
			return;
		}

		// 店舗/担当者の画像アップロードで WordPress メディアライブラリを使うため読み込む。
		// Smart Booking ページのみで読み込み、他画面には影響させない。
		wp_enqueue_media();

		$asset = include $asset_file;
		$deps  = isset( $asset['dependencies'] ) && is_array( $asset['dependencies'] ) ? $asset['dependencies'] : array();
		$ver   = isset( $asset['version'] ) ? $asset['version'] : SMART_BOOKING_VERSION;

		wp_enqueue_script(
			'smart-booking-admin',
			SMART_BOOKING_PLUGIN_URL . 'build/admin.js',
			$deps,
			$ver,
			true
		);

		$css_path = SMART_BOOKING_PLUGIN_DIR . 'build/admin.css';
		if ( file_exists( $css_path ) ) {
			wp_enqueue_style(
				'smart-booking-admin',
				SMART_BOOKING_PLUGIN_URL . 'build/admin.css',
				array(),
				$ver
			);
		}

		wp_localize_script(
			'smart-booking-admin',
			'smartBookingAdmin',
			array(
				'restUrl'   => esc_url_raw( rest_url( 'smart-booking/v1/' ) ),
				'restRoot'  => esc_url_raw( rest_url() ),
				'nonce'     => wp_create_nonce( 'wp_rest' ),
				'page'      => $this->page_slugs[ $page ],
				'adminUrl'  => esc_url_raw( admin_url() ),
				'pluginUrl' => esc_url_raw( SMART_BOOKING_PLUGIN_URL ),
				'version'   => SMART_BOOKING_VERSION,
			)
		);
	}
}
