<?php
/**
 * Smart Booking - Google Calendar Stub
 *
 * Phase 4 Gen-B で本実装に置換される一時的な空クラス。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( class_exists( 'Smart_Booking_Google_Calendar' ) ) {
	return;
}

/**
 * Google カレンダー連携のスタブ。
 */
class Smart_Booking_Google_Calendar {

	/**
	 * イベント作成スタブ。
	 *
	 * @param array $context Reservation context.
	 * @return void
	 */
	public function create_event( $context ) {
		unset( $context );
	}

	/**
	 * イベント削除スタブ。
	 *
	 * @param array $context Reservation context.
	 * @return void
	 */
	public function delete_event( $context ) {
		unset( $context );
	}
}
