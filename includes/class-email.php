<?php
/**
 * Smart Booking - Email Stub
 *
 * Phase 4 Gen-A で本実装に置換される一時的な空クラス。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( class_exists( 'Smart_Booking_Email' ) ) {
	return;
}

/**
 * メール送信クラスのスタブ。
 */
class Smart_Booking_Email {

	/**
	 * 受付メール送信スタブ。
	 *
	 * @param array $context Reservation context.
	 * @return void
	 */
	public function send_receipt( $context ) {
		unset( $context );
	}

	/**
	 * 承認メール送信スタブ。
	 *
	 * @param array $context Reservation context.
	 * @return void
	 */
	public function send_approval( $context ) {
		unset( $context );
	}
}
