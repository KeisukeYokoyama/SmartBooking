<?php
/**
 * Smart Booking - 撮影用デモデータの投入エントリ（開発用ツール・出荷対象外）。
 *
 * 実行:
 *   npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/screenshots/seed/screenshot-seed.php
 *
 * 撮影は日本語 UI 前提のため、管理画面ロケールを ja にする（言語パック未導入なら自動取得）。
 * 変更前のロケールはレジストリに退避され、screenshot-purge.php で元へ戻る。
 *
 * 何度実行しても同じ状態に収束する（冪等）。作成した行の id はレジストリ option
 * `smart_booking_screenshot_seed` に記録され、2 回目以降はその id の行だけを対象に更新／再生成する。
 * ユーザーの既存データ（レジストリ外の行）は読むだけで変更しない。
 *
 * 撤去は screenshot-purge.php を実行する。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/class-smart-booking-screenshot-seeder.php';

Smart_Booking_Screenshot_Seeder::seed();
