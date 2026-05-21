<?php
/**
 * Smart Booking - Integrations Bootstrap
 *
 * 外部連携クラス（メール、Google カレンダー、ChatWork）を読み込み、予約イベントの
 * フックに対応する handler を登録する。
 *
 * 各連携クラスは内部で「機能 OFF」を判定するため、ここでは無条件で wire する。
 *
 * Google Calendar 連携の発火タイミング:
 *   - 予約受付時 (received): カレンダーにイベント作成（承認待ちでも即時に枠を可視化し、
 *     管理者のダブルブッキングを防ぐため）。
 *   - 承認時 (approved): カレンダーには触れない（受付時に既に作成済み）。
 *   - キャンセル時 (cancelled): カレンダーからイベント削除。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once SMART_BOOKING_PLUGIN_DIR . 'includes/class-reservation-context.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/class-email.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/class-google-calendar.php';
require_once SMART_BOOKING_PLUGIN_DIR . 'includes/class-chatwork.php';

/**
 * 連携の起動と購読登録を担うブートストラッパ。
 */
class Smart_Booking_Integrations {

	/**
	 * フック登録。
	 *
	 * @return void
	 */
	public function init() {
		// 受付時: ユーザー宛 + 管理者宛メール / ChatWork 通知 / Google カレンダーへイベント作成.
		add_action( 'smart_booking_reservation_received', array( $this, 'on_received' ), 10, 1 );

		// 承認時: ユーザー宛確定メール（カレンダーには触れない）.
		add_action( 'smart_booking_reservation_approved', array( $this, 'on_approved' ), 10, 1 );

		// キャンセル時: Google カレンダーのイベント削除.
		add_action( 'smart_booking_reservation_cancelled', array( $this, 'on_cancelled' ), 10, 1 );
	}

	/**
	 * 予約受付時の dispatch。
	 *
	 * @param int $reservation_id 予約 ID.
	 * @return void
	 */
	public function on_received( $reservation_id ) {
		$ctx = Smart_Booking_Reservation_Context::build( (int) $reservation_id );
		if ( null === $ctx ) {
			return;
		}
		( new Smart_Booking_Email() )->send_receipt( $ctx );
		( new Smart_Booking_Chatwork() )->notify_received( $ctx );
		( new Smart_Booking_Google_Calendar() )->create_event( $ctx );
	}

	/**
	 * 予約承認時の dispatch。
	 *
	 * @param int $reservation_id 予約 ID.
	 * @return void
	 */
	public function on_approved( $reservation_id ) {
		$ctx = Smart_Booking_Reservation_Context::build( (int) $reservation_id );
		if ( null === $ctx ) {
			return;
		}
		( new Smart_Booking_Email() )->send_approval( $ctx );
	}

	/**
	 * 予約キャンセル時の dispatch。
	 *
	 * @param int $reservation_id 予約 ID.
	 * @return void
	 */
	public function on_cancelled( $reservation_id ) {
		$ctx = Smart_Booking_Reservation_Context::build( (int) $reservation_id );
		if ( null === $ctx ) {
			return;
		}
		( new Smart_Booking_Google_Calendar() )->delete_event( $ctx );
	}
}
