<?php
/**
 * Smart Booking - REST API 基底クラス
 *
 * 各リソースコントローラが共通で利用するヘルパ群を提供する。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * REST API 基底クラス。サブクラスで register_routes() を実装する。
 */
abstract class Smart_Booking_REST_Base {

	/**
	 * REST API 名前空間。
	 */
	const NAMESPACE_V1 = 'smart-booking/v1';

	/**
	 * 権限チェック。管理者権限 + Cookie/Nonce による CSRF 保護。
	 *
	 * WP REST API は認証済みリクエストに対し X-WP-Nonce ヘッダを自動検証する。
	 *
	 * @return bool
	 */
	public function permission_check() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * サブクラスでルートを登録する。
	 *
	 * @return void
	 */
	abstract public function register_routes();

	/**
	 * 共通の HEX カラーバリデーション。
	 *
	 * @param string $color 入力値.
	 * @return string|null  有効ならサニタイズ済みの #RRGGBB、無効なら null.
	 */
	protected function sanitize_hex_color( $color ) {
		if ( ! is_string( $color ) ) {
			return null;
		}
		$color = trim( $color );
		if ( '' === $color ) {
			return null;
		}
		if ( preg_match( '/^#[0-9a-fA-F]{6}$/', $color ) ) {
			return $color;
		}
		return null;
	}

	/**
	 * 時刻文字列 (HH:MM / HH:MM:SS) の検証。
	 *
	 * @param string $time 入力値.
	 * @return string|null HH:MM:SS 形式、または null.
	 */
	protected function sanitize_time_string( $time ) {
		if ( ! is_string( $time ) ) {
			return null;
		}
		$time = trim( $time );
		if ( preg_match( '/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/', $time ) ) {
			return $time . ':00';
		}
		if ( preg_match( '/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/', $time ) ) {
			return $time;
		}
		return null;
	}

	/**
	 * 日付文字列 (YYYY-MM-DD) の検証。
	 *
	 * @param string $date 入力値.
	 * @return string|null Y-m-d 形式、または null.
	 */
	protected function sanitize_date_string( $date ) {
		if ( ! is_string( $date ) ) {
			return null;
		}
		$date = trim( $date );
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
			return null;
		}
		$parts = explode( '-', $date );
		if ( 3 !== count( $parts ) ) {
			return null;
		}
		if ( ! checkdate( (int) $parts[1], (int) $parts[2], (int) $parts[0] ) ) {
			return null;
		}
		return $date;
	}

	/**
	 * いま時刻の MySQL 文字列。
	 *
	 * @return string
	 */
	protected function now_mysql() {
		return current_time( 'mysql' );
	}

	/**
	 * エラーレスポンスのヘルパ。
	 *
	 * @param string $code    エラーコード.
	 * @param string $message メッセージ.
	 * @param int    $status  HTTP ステータス.
	 * @return WP_Error
	 */
	protected function error( $code, $message, $status = 400 ) {
		return new WP_Error( $code, $message, array( 'status' => $status ) );
	}
}
