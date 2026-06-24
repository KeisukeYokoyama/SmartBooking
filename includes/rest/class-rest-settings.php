<?php
/**
 * Smart Booking - REST: 設定 (/settings)
 *
 * wp_options に smabo_* プレフィックスで保存される設定値を取得・更新する。
 * ホワイトリストされたキー以外は受け付けない。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 設定エンドポイント。
 */
class Smart_Booking_REST_Settings extends Smart_Booking_REST_Base {

	/**
	 * 値を入れ替えずそのまま保持する／返却するためのセンチネル。
	 * フロントが入力欄に表示しているマスク文字列と一致する場合は更新をスキップする。
	 */
	const CREDENTIAL_SET_SENTINEL = '***configured***';

	/**
	 * 許可する設定キー一覧とサニタイザ。'text' / 'bool' / 'int' / 'color' / 'email' / 'html' / 'json_credentials'
	 *
	 * @return array<string,string>
	 */
	private function schema() {
		return array(
			// 基本設定.
			'smart_booking_booking_flow_order'               => 'text',
			'smart_booking_calendar_view_mode'               => 'text',
			'smart_booking_display_days'                     => 'int',
			'smart_booking_booking_deadline_days'            => 'int',
			'smart_booking_booking_deadline_hours'           => 'int',
			'smart_booking_show_store_front'                 => 'bool',
			'smart_booking_show_staff_front'                 => 'bool',
			'smart_booking_completion_message'               => 'html',

			// メール通知.
			'smart_booking_mail_from_name'                   => 'text',
			'smart_booking_mail_from_email'                  => 'email',
			'smart_booking_mail_admin_notify_enabled'        => 'bool',
			'smart_booking_mail_receipt_user_subject'        => 'text',
			'smart_booking_mail_receipt_user_body'           => 'html',
			'smart_booking_mail_receipt_admin_subject'       => 'text',
			'smart_booking_mail_receipt_admin_body'          => 'html',
			'smart_booking_mail_approval_user_subject'       => 'text',
			'smart_booking_mail_approval_user_body'          => 'html',

			// 外部連携.
			'smart_booking_google_calendar_enabled'          => 'bool',
			'smart_booking_google_calendar_id'               => 'text',
			'smart_booking_google_calendar_credentials_json' => 'json_credentials',
			'smart_booking_google_calendar_client_email'     => 'readonly_text',
			'smart_booking_chatwork_enabled'                 => 'bool',
			'smart_booking_chatwork_api_token'               => 'text',
			'smart_booking_chatwork_room_id'                 => 'text',

			// デザイン.
			'smart_booking_color_button'                     => 'color',
			'smart_booking_color_date_selected'              => 'color',
			'smart_booking_color_time_selected'              => 'color',
			'smart_booking_color_required_mark'              => 'color',
			'smart_booking_color_focus'                      => 'color',
		);
	}

	/**
	 * ルート登録。
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/settings',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_all' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'update_all' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
			)
		);
	}

	/**
	 * 設定キーをサニタイズする。
	 *
	 * @param string $key  設定キー.
	 * @param mixed  $raw  値.
	 * @return mixed
	 */
	private function sanitize_value( $key, $raw ) {
		$schema = $this->schema();
		$type   = isset( $schema[ $key ] ) ? $schema[ $key ] : 'text';
		switch ( $type ) {
			case 'bool':
				return $raw ? 1 : 0;
			case 'int':
				return (int) $raw;
			case 'email':
				$email = sanitize_email( (string) $raw );
				return is_email( $email ) ? $email : '';
			case 'color':
				$c = $this->sanitize_hex_color( (string) $raw );
				return null === $c ? '' : $c;
			case 'html':
				return wp_kses_post( (string) $raw );
			case 'json_credentials':
				// 上位で個別ハンドリング。ここに来るのは想定外。
				return '';
			case 'readonly_text':
				// 上位で書き込み拒否。ここに来るのは想定外。
				return '';
			case 'text':
			default:
				return sanitize_text_field( (string) $raw );
		}
	}

	/**
	 * 全設定取得。json_credentials 型は値を返さずセンチネルに置換する。
	 *
	 * @return WP_REST_Response
	 */
	public function get_all() {
		$result = array();
		$schema = $this->schema();
		foreach ( $schema as $key => $type ) {
			$value = get_option( $key, '' );
			if ( 'json_credentials' === $type ) {
				$value = ( '' !== (string) $value ) ? self::CREDENTIAL_SET_SENTINEL : '';
			}
			$result[ $key ] = $value;
		}
		return rest_ensure_response( array( 'settings' => $result ) );
	}

	/**
	 * 一括更新。
	 *
	 * - json_credentials 型: センチネル一致なら no-op、空なら削除、それ以外はサービスアカウント JSON として検証して保存。
	 * - readonly_text 型: クライアントからの書き込みを無視（サーバ側でのみ更新）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_all( $request ) {
		$settings = $request->get_param( 'settings' );
		if ( ! is_array( $settings ) ) {
			return $this->error( 'smb_settings_invalid', '設定データの形式が正しくありません。', 400 );
		}

		$schema  = $this->schema();
		$updated = array();

		foreach ( $settings as $key => $value ) {
			if ( ! isset( $schema[ $key ] ) ) {
				continue; // ホワイトリスト外はスキップ.
			}
			$type = $schema[ $key ];

			if ( 'readonly_text' === $type ) {
				// 読み取り専用: 書き込み拒否.
				continue;
			}

			if ( 'json_credentials' === $type ) {
				$raw = is_string( $value ) ? $value : '';
				if ( self::CREDENTIAL_SET_SENTINEL === $raw ) {
					continue; // 変更なし.
				}
				if ( '' === trim( $raw ) ) {
					update_option( $key, '' );
					if ( 'smart_booking_google_calendar_credentials_json' === $key ) {
						update_option( 'smart_booking_google_calendar_client_email', '' );
					}
					$updated[ $key ] = '';
					continue;
				}
				$decoded = json_decode( $raw, true );
				if ( ! is_array( $decoded ) || empty( $decoded['client_email'] ) || empty( $decoded['private_key'] ) ) {
					return $this->error(
						'smb_credentials_invalid',
						'サービスアカウント JSON の形式が正しくありません（client_email / private_key が必須）。',
						400
					);
				}
				update_option( $key, $raw, false );
				if ( 'smart_booking_google_calendar_credentials_json' === $key ) {
					update_option( 'smart_booking_google_calendar_client_email', sanitize_email( (string) $decoded['client_email'] ) );
				}
				$updated[ $key ] = self::CREDENTIAL_SET_SENTINEL;
				continue;
			}

			$clean = $this->sanitize_value( $key, $value );
			update_option( $key, $clean );
			$updated[ $key ] = $clean;
		}

		return rest_ensure_response(
			array(
				'updated'  => count( $updated ),
				'settings' => $updated,
			)
		);
	}
}
