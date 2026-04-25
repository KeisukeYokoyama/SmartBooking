<?php
/**
 * Smart Booking - Google Calendar
 *
 * サービスアカウント JWT 認証で Google Calendar API を呼び出し、予約承認時にイベント作成、
 * キャンセル時にイベント削除を行う。機能 OFF / 設定不足 / HTTP 失敗 / 署名失敗 はすべてサイレント
 * に早期 return（予約フローを巻き込まないため）。composer / 外部 CDN は不使用。
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
 * Google カレンダー連携。
 */
class Smart_Booking_Google_Calendar {

	const TOKEN_URL       = 'https://oauth2.googleapis.com/token';
	const API_BASE        = 'https://www.googleapis.com/calendar/v3/calendars/';
	const TOKEN_TRANSIENT = 'smb_gcal_token';
	const HTTP_TIMEOUT    = 15;
	const META_KEY        = '_smb_gcal_event_id';

	/**
	 * 予約承認時に Google カレンダーへイベントを作成する。
	 *
	 * @param array $context Smart_Booking_Reservation_Context::build() 戻り値。
	 * @return void
	 */
	public function create_event( $context ) {
		if ( 1 !== (int) get_option( 'smb_google_calendar_enabled', 0 ) ) {
			return;
		}
		$config = $this->load_config();
		if ( null === $config ) {
			return;
		}
		if ( ! is_array( $context ) || empty( $context['reservation'] ) || empty( $context['formatted'] ) ) {
			return;
		}
		$reservation_id = (int) $context['reservation']['id'];
		if ( $reservation_id <= 0 ) {
			return;
		}
		$times = $this->resolve_times( $context );
		if ( null === $times ) {
			return;
		}
		$token = $this->get_access_token( $config );
		if ( '' === $token ) {
			return;
		}

		$f       = $context['formatted'];
		$summary = trim( (string) $f['store_name'] . ' / ' . (string) $f['customer_name'] );
		if ( '' === $summary ) {
			$summary = '予約 #' . (string) $f['reservation_id'];
		}
		$body     = array(
			'summary'     => $summary,
			'description' => "予約者: {$f['customer_name']}\n電話: {$f['customer_phone']}\n担当: {$f['staff_name']}\n予約番号: {$f['reservation_id']}",
			'start'       => array(
				'dateTime' => $times['start'],
				'timeZone' => $times['timezone'],
			),
			'end'         => array(
				'dateTime' => $times['end'],
				'timeZone' => $times['timezone'],
			),
		);
		$url      = self::API_BASE . rawurlencode( $config['calendar_id'] ) . '/events';
		$response = wp_remote_post(
			$url,
			array(
				'timeout' => self::HTTP_TIMEOUT,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( $body ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			return;
		}
		$decoded = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $decoded ) || empty( $decoded['id'] ) ) {
			return;
		}
		$this->save_event_id( $reservation_id, (string) $decoded['id'] );
	}

	/**
	 * 予約キャンセル時に Google カレンダーのイベントを削除する。
	 * 削除 API の成否に関わらず meta は除去し、stale 参照を残さない。
	 *
	 * @param array $context Smart_Booking_Reservation_Context::build() 戻り値。
	 * @return void
	 */
	public function delete_event( $context ) {
		if ( 1 !== (int) get_option( 'smb_google_calendar_enabled', 0 ) ) {
			return;
		}
		$config = $this->load_config();
		if ( null === $config ) {
			return;
		}
		if ( ! is_array( $context ) || empty( $context['reservation'] ) ) {
			return;
		}
		$reservation_id = (int) $context['reservation']['id'];
		if ( $reservation_id <= 0 ) {
			return;
		}
		$event_id = $this->load_event_id( $reservation_id );
		if ( '' === $event_id ) {
			return;
		}

		$token = $this->get_access_token( $config );
		if ( '' !== $token ) {
			$url = self::API_BASE . rawurlencode( $config['calendar_id'] ) . '/events/' . rawurlencode( $event_id );
			wp_remote_request(
				$url,
				array(
					'method'  => 'DELETE',
					'timeout' => self::HTTP_TIMEOUT,
					'headers' => array( 'Authorization' => 'Bearer ' . $token ),
				)
			);
			// 404 等も許容するためレスポンスは検証しない。
		}
		$this->delete_event_meta( $reservation_id );
	}

	/**
	 * 設定を読み出して有効化された認証情報を返す。
	 *
	 * @return array|null { calendar_id, client_email, private_key } もしくは不足時 null。
	 */
	private function load_config() {
		$calendar_id = trim( (string) get_option( 'smb_google_calendar_id', '' ) );
		$json        = (string) get_option( 'smb_google_calendar_credentials_json', '' );
		if ( '' === $calendar_id || '' === $json ) {
			return null;
		}
		$decoded = json_decode( $json, true );
		if ( ! is_array( $decoded ) || empty( $decoded['client_email'] ) || empty( $decoded['private_key'] ) ) {
			return null;
		}
		return array(
			'calendar_id'  => $calendar_id,
			'client_email' => (string) $decoded['client_email'],
			'private_key'  => (string) $decoded['private_key'],
		);
	}

	/**
	 * アクセストークンを取得する（Transient キャッシュあり）。
	 *
	 * @param array $config load_config() 戻り値。
	 * @return string アクセストークン。失敗時は空文字。
	 */
	private function get_access_token( $config ) {
		$cached = get_transient( self::TOKEN_TRANSIENT );
		if ( is_string( $cached ) && '' !== $cached ) {
			return $cached;
		}
		$jwt = $this->build_signed_jwt( $config['client_email'], $config['private_key'] );
		if ( '' === $jwt ) {
			return '';
		}
		$response = wp_remote_post(
			self::TOKEN_URL,
			array(
				'timeout' => self::HTTP_TIMEOUT,
				'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
				'body'    => array(
					'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
					'assertion'  => $jwt,
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			return '';
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			return '';
		}
		$decoded = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $decoded ) || empty( $decoded['access_token'] ) ) {
			return '';
		}
		$token = (string) $decoded['access_token'];
		set_transient( self::TOKEN_TRANSIENT, $token, 3500 );
		return $token;
	}

	/**
	 * RS256 署名済み JWT を組み立てる。openssl 不在 / 署名失敗時は空文字。
	 *
	 * @param string $client_email サービスアカウントのクライアントメール。
	 * @param string $private_key  PEM 形式の秘密鍵。
	 * @return string
	 */
	private function build_signed_jwt( $client_email, $private_key ) {
		if ( ! function_exists( 'openssl_sign' ) ) {
			return '';
		}
		$now        = time();
		$header     = array(
			'alg' => 'RS256',
			'typ' => 'JWT',
		);
		$claim      = array(
			'iss'   => $client_email,
			'scope' => 'https://www.googleapis.com/auth/calendar',
			'aud'   => self::TOKEN_URL,
			'exp'   => $now + 3600,
			'iat'   => $now,
		);
		$header_b64 = $this->base64url_encode( (string) wp_json_encode( $header ) );
		$claim_b64  = $this->base64url_encode( (string) wp_json_encode( $claim ) );
		$input      = $header_b64 . '.' . $claim_b64;
		$signature  = '';
		$ok         = openssl_sign( $input, $signature, $private_key, OPENSSL_ALGO_SHA256 );
		if ( ! $ok || '' === $signature ) {
			return '';
		}
		return $input . '.' . $this->base64url_encode( $signature );
	}

	/**
	 * Base64 URL セーフエンコード。
	 *
	 * @param string $data 入力。
	 * @return string
	 */
	private function base64url_encode( $data ) {
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		return rtrim( strtr( base64_encode( (string) $data ), '+/', '-_' ), '=' );
	}

	/**
	 * 予約コンテキストから ISO 形式の開始 / 終了時刻とタイムゾーンを抽出する。
	 * end_time は wp_smb_schedules を schedule_id で JOIN して引く。
	 *
	 * @param array $context Reservation context。
	 * @return array|null { start, end, timezone }
	 */
	private function resolve_times( $context ) {
		$reservation = isset( $context['reservation'] ) ? $context['reservation'] : array();
		$date        = isset( $reservation['schedule_date'] ) ? (string) $reservation['schedule_date'] : '';
		$start_time  = isset( $reservation['schedule_time'] ) ? (string) $reservation['schedule_time'] : '';
		$schedule_id = isset( $reservation['schedule_id'] ) ? (int) $reservation['schedule_id'] : 0;
		if ( '' === $date || '' === $start_time || $schedule_id <= 0 ) {
			return null;
		}
		global $wpdb;
		$schedules_table = $wpdb->prefix . 'smb_schedules';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$end_time = $wpdb->get_var( $wpdb->prepare( "SELECT end_time FROM {$schedules_table} WHERE id = %d", $schedule_id ) );
		if ( ! $end_time ) {
			return null;
		}
		$timezone = function_exists( 'wp_timezone_string' ) ? wp_timezone_string() : 'Asia/Tokyo';
		if ( '' === $timezone ) {
			$timezone = 'Asia/Tokyo';
		}
		$normalize = function ( $t ) {
			$t = (string) $t;
			return 5 === strlen( $t ) ? $t . ':00' : $t;
		};
		return array(
			'start'    => $date . 'T' . $normalize( $start_time ),
			'end'      => $date . 'T' . $normalize( (string) $end_time ),
			'timezone' => $timezone,
		);
	}

	/**
	 * イベント ID を予約 meta に保存する。
	 *
	 * @param int    $reservation_id 予約 ID。
	 * @param string $event_id       Google Calendar イベント ID。
	 * @return void
	 */
	private function save_event_id( $reservation_id, $event_id ) {
		global $wpdb;
		$meta_table = $wpdb->prefix . 'smb_reservation_meta';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->insert(
			$meta_table,
			array(
				'reservation_id' => (int) $reservation_id,
				'meta_key'       => self::META_KEY,
				'meta_value'     => (string) $event_id,
			),
			array( '%d', '%s', '%s' )
		);
	}

	/**
	 * 予約 meta からイベント ID を取得する。
	 *
	 * @param int $reservation_id 予約 ID。
	 * @return string 見つからなければ空文字。
	 */
	private function load_event_id( $reservation_id ) {
		global $wpdb;
		$meta_table = $wpdb->prefix . 'smb_reservation_meta';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$value = $wpdb->get_var( $wpdb->prepare( "SELECT meta_value FROM {$meta_table} WHERE reservation_id = %d AND meta_key = %s LIMIT 1", (int) $reservation_id, self::META_KEY ) );
		return is_string( $value ) ? $value : '';
	}

	/**
	 * 予約 meta からイベント ID 行を削除する。
	 *
	 * @param int $reservation_id 予約 ID。
	 * @return void
	 */
	private function delete_event_meta( $reservation_id ) {
		global $wpdb;
		$meta_table = $wpdb->prefix . 'smb_reservation_meta';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete(
			$meta_table,
			array(
				'reservation_id' => (int) $reservation_id,
				'meta_key'       => self::META_KEY,
			),
			array( '%d', '%s' )
		);
	}
}
