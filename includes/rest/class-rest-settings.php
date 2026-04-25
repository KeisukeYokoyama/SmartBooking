<?php
/**
 * Smart Booking - REST: 設定 (/settings)
 *
 * wp_options に smb_* プレフィックスで保存される設定値を取得・更新する。
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
	 * 許可する設定キー一覧とサニタイザ。'text' / 'bool' / 'int' / 'color' / 'email' / 'html' / 'json'
	 *
	 * @return array<string,string>
	 */
	private function schema() {
		return array(
			// 基本設定.
			'smb_booking_flow_order'         => 'text',
			'smb_calendar_view_mode'         => 'text',
			'smb_display_days'               => 'int',
			'smb_booking_deadline_days'      => 'int',
			'smb_booking_deadline_hours'     => 'int',
			'smb_completion_message'         => 'html',

			// メール通知.
			'smb_mail_from_name'             => 'text',
			'smb_mail_from_email'            => 'email',
			'smb_mail_receipt_user_subject'  => 'text',
			'smb_mail_receipt_user_body'     => 'html',
			'smb_mail_receipt_admin_subject' => 'text',
			'smb_mail_receipt_admin_body'    => 'html',
			'smb_mail_approval_user_subject' => 'text',
			'smb_mail_approval_user_body'    => 'html',

			// 外部連携.
			'smb_google_calendar_enabled'    => 'bool',
			'smb_google_calendar_id'         => 'text',
			'smb_chatwork_enabled'           => 'bool',
			'smb_chatwork_api_token'         => 'text',
			'smb_chatwork_room_id'           => 'text',

			// デザイン.
			'smb_color_button'               => 'color',
			'smb_color_date_selected'        => 'color',
			'smb_color_time_selected'        => 'color',
			'smb_color_required_mark'        => 'color',
			'smb_color_focus'                => 'color',
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
			case 'text':
			default:
				return sanitize_text_field( (string) $raw );
		}
	}

	/**
	 * 全設定取得。
	 *
	 * @return WP_REST_Response
	 */
	public function get_all() {
		$result = array();
		foreach ( array_keys( $this->schema() ) as $key ) {
			$result[ $key ] = get_option( $key, '' );
		}
		return rest_ensure_response( array( 'settings' => $result ) );
	}

	/**
	 * 一括更新。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response
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
