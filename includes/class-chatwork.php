<?php
/**
 * Smart Booking - ChatWork Stub
 *
 * Phase 4 Gen-C で本実装に置換される一時的な空クラス。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( class_exists( 'Smart_Booking_Chatwork' ) ) {
	return;
}

/**
 * ChatWork 通知のスタブ。
 */
class Smart_Booking_Chatwork {

	/**
	 * 受付通知スタブ。
	 *
	 * @param array $context Reservation context.
	 * @return void
	 */
	public function notify_received( $context ) {
		unset( $context );
	}
}
