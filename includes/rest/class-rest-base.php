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

	/**
	 * 表示条件が成立するか（＝そのフィールドが表示中か）を判定する。
	 *
	 * 公開予約（POST /public/reservations）と手動予約作成（POST /reservations）で共有する（v0.6.1）。
	 *
	 * - condition_field_key が空/NULL のフィールドは常に表示（true）。
	 * - それ以外は、送信された親フィールドの値が condition_value と一致するときのみ true。
	 *   親は radio/select（文字列値）であることを前提とし、フロントの判定結果は一切信用せず
	 *   送信ペイロードから再評価する。
	 *
	 * @param array $def                 フィールド定義（condition_field_key / condition_value を含む）.
	 * @param array $custom_fields_input 送信されたカスタムフィールド入力.
	 * @return bool 表示中なら true。
	 */
	protected function condition_met( array $def, array $custom_fields_input ) {
		$parent = isset( $def['condition_field_key'] ) ? (string) $def['condition_field_key'] : '';
		if ( '' === $parent ) {
			return true;
		}
		$parent_value = isset( $custom_fields_input[ $parent ] ) ? $custom_fields_input[ $parent ] : '';
		if ( is_array( $parent_value ) ) {
			// 親は radio/select ＝単一文字列値のみを想定。配列は不成立扱い。
			return false;
		}
		$expected = (string) ( isset( $def['condition_value'] ) ? $def['condition_value'] : '' );
		$actual   = (string) $parent_value;
		return $expected === $actual;
	}
}
