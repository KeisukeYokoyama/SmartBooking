<?php
/**
 * Plugin Name:       Smart Booking
 * Plugin URI:        https://www.wp-smart-booking.com/
 * Description:       無料で多機能。最短5分で導入できるWordPress予約プラグイン
 * Version:           0.4.2
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            株式会社リベルダージ
 * Author URI:        https://www.liberdade-inc.com/
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       smart-booking
 * Domain Path:       /languages
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SMART_BOOKING_VERSION', '0.4.2' );
// 複数フォームの上限（性能ではなく UI 崩壊防止のためのハードキャップ）。設定画面には出さない。
define( 'SMART_BOOKING_MAX_FORMS', 10 );
define( 'SMART_BOOKING_PLUGIN_FILE', __FILE__ );
define( 'SMART_BOOKING_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SMART_BOOKING_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

// クラスファイルの読み込み.
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/class-activator.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/class-admin.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/class-rest-api.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/class-shortcode.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/class-integrations.php';

// 有効化フック: テーブル作成 + 初期データ投入（init ではなくここでのみ実行）.
register_activation_hook( __FILE__, array( 'Smart_Booking_Activator', 'activate' ) );

// 自動更新ギャップ対策: 有効化フックが発火しない自動更新でも、スキーマ移行
// （0.2.3 の UNIQUE 追加）を一度だけ実行する。maybe_upgrade 内のバージョン
// ゲート（< 0.2.3）で発火を絞るため無条件実行ではない。init での無条件
// テーブル作成ではなく、管理コンテキスト限定の冪等な移行再利用に留める。
add_action( 'admin_init', array( 'Smart_Booking_Activator', 'maybe_upgrade' ) );

/**
 * プラグインの各コンポーネントを初期化する。
 *
 * @return void
 */
function smart_booking_bootstrap() {
	// 管理画面（メニュー + React マウント + enqueue）.
	if ( is_admin() ) {
		$admin = new Smart_Booking_Admin();
		$admin->init();
	}

	// REST API（管理画面・フロント両方で必要）.
	$rest_api = new Smart_Booking_REST_API();
	$rest_api->init();

	// フロントショートコード.
	$shortcode = new Smart_Booking_Shortcode();
	$shortcode->init();

	// 外部連携 (メール / Google カレンダー / ChatWork). 内部で OFF を判定するので無条件 wire.
	$integrations = new Smart_Booking_Integrations();
	$integrations->init();
}
add_action( 'plugins_loaded', 'smart_booking_bootstrap' );
