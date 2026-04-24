<?php
/**
 * Plugin Name:       Smart Booking
 * Plugin URI:        https://www.wp-smart-booking.com/
 * Description:       無料で多機能。最短5分で導入できるWordPress予約プラグイン
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            株式会社リベルダージ
 * Author URI:        https://www.liberdade-inc.com/
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       smart-booking
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SMART_BOOKING_VERSION', '0.1.0' );
define( 'SMART_BOOKING_PLUGIN_FILE', __FILE__ );
define( 'SMART_BOOKING_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SMART_BOOKING_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
