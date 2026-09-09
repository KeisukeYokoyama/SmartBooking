<?php
/**
 * Smart Booking - 撮影用デモデータの撤去エントリ（開発用ツール・出荷対象外）。
 *
 * 実行:
 *   npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/screenshots/seed/screenshot-purge.php
 *
 * レジストリ option `smart_booking_screenshot_seed` に載っている行「だけ」を削除し、
 * 変更した表示系オプションと管理画面ロケール（WPLANG / 管理者の locale user_meta）を
 * 変更前の状態へ戻し、レジストリを空にする。
 * レジストリ外のデータ（ユーザーの店舗・予約など）には一切触れない。
 *
 * 別ファイルにしている理由: `wp eval-file` は引数を渡せず、`npx wp-env run cli` 経由では
 * 環境変数の受け渡しも安定しないため、モード分岐よりファイル分離のほうが誤爆しにくい。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/class-smart-booking-screenshot-seeder.php';

Smart_Booking_Screenshot_Seeder::purge();
