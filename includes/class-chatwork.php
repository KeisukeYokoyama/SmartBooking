<?php
/**
 * Smart Booking - ChatWork
 *
 * 予約受付時に ChatWork ルームへ通知メッセージを投稿する。
 *
 * - 設定 `smabo_chatwork_enabled` が無効なら何もしない。
 * - APIトークン or ルームIDが未設定なら何もしない。
 * - 通信エラーや非 2xx 応答はサイレントに無視（予約処理を阻害しない）。
 * - error_log は使わない。
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
 * ChatWork 通知クラス。
 */
class Smart_Booking_Chatwork {

	/**
	 * ChatWork API エンドポイント。
	 *
	 * @var string
	 */
	const API_BASE = 'https://api.chatwork.com/v2';

	/**
	 * 予約受付通知。`smb_reservation_received` から呼ばれる。
	 *
	 * @param array $context Smart_Booking_Reservation_Context::build() 戻り値。
	 * @return void
	 */
	public function notify_received( $context ) {
		if ( '1' !== (string) get_option( 'smabo_chatwork_enabled', '0' ) ) {
			return;
		}

		$token   = trim( (string) get_option( 'smabo_chatwork_api_token', '' ) );
		$room_id = (int) get_option( 'smabo_chatwork_room_id', 0 );
		if ( '' === $token || $room_id <= 0 ) {
			return;
		}

		if ( ! is_array( $context ) || empty( $context['formatted'] ) || ! is_array( $context['formatted'] ) ) {
			return;
		}

		$body = $this->build_message( $context['formatted'], $context );
		if ( '' === $body ) {
			return;
		}

		$url = self::API_BASE . '/rooms/' . $room_id . '/messages';

		$response = wp_remote_post(
			$url,
			array(
				'timeout' => 10,
				'headers' => array(
					'X-ChatWorkToken' => $token,
				),
				'body'    => array(
					'body'        => $body,
					'self_unread' => '1',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return;
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		if ( $status < 200 || $status >= 300 ) {
			return;
		}
	}

	/**
	 * 通知メッセージ本文を構築する（プレーンテキスト固定フォーマット）。
	 *
	 * システムエンティティ（is_system=1）に紐づく予約では、店舗・担当者の行を含めない。
	 *
	 * @param array $f       Smart_Booking_Reservation_Context::build()['formatted'].
	 * @param array $context Smart_Booking_Reservation_Context::build() 戻り値（is_system 判定用）.
	 * @return string
	 */
	private function build_message( $f, $context = array() ) {
		$reservation_id = isset( $f['reservation_id'] ) ? (int) $f['reservation_id'] : 0;
		$customer_name  = isset( $f['customer_name'] ) ? (string) $f['customer_name'] : '';
		$customer_email = isset( $f['customer_email'] ) ? (string) $f['customer_email'] : '';
		$customer_phone = isset( $f['customer_phone'] ) ? (string) $f['customer_phone'] : '';
		$schedule_date  = isset( $f['schedule_date'] ) ? (string) $f['schedule_date'] : '';
		$schedule_time  = isset( $f['schedule_time'] ) ? (string) $f['schedule_time'] : '';
		$store_name     = isset( $f['store_name'] ) ? (string) $f['store_name'] : '';
		$staff_name     = isset( $f['staff_name'] ) ? (string) $f['staff_name'] : '';

		$store_is_system = ( is_array( $context ) && ! empty( $context['store'] ) && is_array( $context['store'] ) && ! empty( $context['store']['is_system'] ) ) ? 1 : 0;
		$staff_is_system = ( is_array( $context ) && ! empty( $context['staff'] ) && is_array( $context['staff'] ) && ! empty( $context['staff']['is_system'] ) ) ? 1 : 0;

		$datetime = trim( $schedule_date . ' ' . $schedule_time );

		$lines   = array();
		$lines[] = '新しい予約が入りました。';
		$lines[] = '';
		$lines[] = '予約番号: ' . $reservation_id;
		$lines[] = '予約者: ' . $customer_name;
		$lines[] = 'メール: ' . $customer_email;
		$lines[] = '電話: ' . $customer_phone;
		$lines[] = '日時: ' . $datetime;
		if ( 0 === $store_is_system ) {
			$lines[] = '店舗: ' . $store_name;
		}
		if ( 0 === $staff_is_system ) {
			$lines[] = '担当: ' . $staff_name;
		}

		return implode( "\n", $lines );
	}
}
