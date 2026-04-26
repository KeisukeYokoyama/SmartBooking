<?php
/**
 * Smart Booking - Email
 *
 * 予約受付・予約承認時のメール送信処理。
 * 件名・本文は wp_options に保存されたテンプレート（{customer_name} 等）を
 * Smart_Booking_Reservation_Context::render() で展開して送信する。
 *
 * - 受付メール: ユーザー宛 + 管理者宛（店舗メール / 担当者メールを CC）
 * - 承認メール: ユーザー宛のみ
 *
 * 送信失敗（wp_mail の戻り値 false）はサイレントに無視する。error_log は使わない。
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
 * メール送信クラス。
 */
class Smart_Booking_Email {

	/**
	 * wp_mail に渡す Content-Type。
	 *
	 * @var string
	 */
	const CONTENT_TYPE = 'text/plain; charset=UTF-8';

	/**
	 * 予約受付メール送信。ユーザー宛 + 管理者宛を送る。
	 *
	 * @param array $context Smart_Booking_Reservation_Context::build() 戻り値。
	 * @return void
	 */
	public function send_receipt( $context ) {
		if ( ! $this->is_valid_context( $context ) ) {
			return;
		}

		$formatted = $context['formatted'];

		// ユーザー宛は表示制御を反映させたコンテキストでテンプレートを展開する。
		$user_context = $this->context_for_user( $context );
		$this->send(
			(string) $formatted['customer_email'],
			(string) get_option( 'smb_mail_receipt_user_subject', '' ),
			(string) get_option( 'smb_mail_receipt_user_body', '' ),
			$user_context,
			array()
		);

		// 管理者宛（店舗メール）。担当者メールがあれば CC。表示制御に関わらず常に値を含める。.
		$cc          = array();
		$staff_email = (string) $formatted['staff_email'];
		if ( '' !== $staff_email && is_email( $staff_email ) ) {
			$cc[] = $staff_email;
		}
		$this->send(
			(string) $formatted['store_email'],
			(string) get_option( 'smb_mail_receipt_admin_subject', '' ),
			(string) get_option( 'smb_mail_receipt_admin_body', '' ),
			$context,
			$cc
		);
	}

	/**
	 * 予約承認メール送信。ユーザー宛のみ。
	 *
	 * @param array $context Smart_Booking_Reservation_Context::build() 戻り値。
	 * @return void
	 */
	public function send_approval( $context ) {
		if ( ! $this->is_valid_context( $context ) ) {
			return;
		}

		$formatted = $context['formatted'];

		// ユーザー宛は表示制御を反映させたコンテキストでテンプレートを展開する。
		$user_context = $this->context_for_user( $context );
		$this->send(
			(string) $formatted['customer_email'],
			(string) get_option( 'smb_mail_approval_user_subject', '' ),
			(string) get_option( 'smb_mail_approval_user_body', '' ),
			$user_context,
			array()
		);
	}

	/**
	 * ユーザー宛メール用に context を加工する。
	 *
	 * `smb_show_store_front` = 0 のとき `formatted.store_name` を空文字に置換し、
	 * `smb_show_staff_front` = 0 のとき `formatted.staff_name` を空文字に置換する。
	 * 管理者宛メールでは表示制御に関わらず元の値を保つ必要があるため、コピーを返す。
	 *
	 * @param array $context Smart_Booking_Reservation_Context::build() 戻り値。
	 * @return array
	 */
	private function context_for_user( $context ) {
		if ( ! is_array( $context ) || empty( $context['formatted'] ) || ! is_array( $context['formatted'] ) ) {
			return $context;
		}
		$show_store = ( (int) get_option( 'smb_show_store_front', 1 ) ) ? 1 : 0;
		$show_staff = ( (int) get_option( 'smb_show_staff_front', 1 ) ) ? 1 : 0;

		// システムエンティティ（is_system=1）に紐づく場合はユーザー宛では名前を出さない。
		$store_is_system = ( ! empty( $context['store'] ) && is_array( $context['store'] ) && ! empty( $context['store']['is_system'] ) ) ? 1 : 0;
		$staff_is_system = ( ! empty( $context['staff'] ) && is_array( $context['staff'] ) && ! empty( $context['staff']['is_system'] ) ) ? 1 : 0;

		if ( 1 === $show_store && 1 === $show_staff && 0 === $store_is_system && 0 === $staff_is_system ) {
			return $context;
		}
		$copy = $context;
		if ( 0 === $show_store || 1 === $store_is_system ) {
			$copy['formatted']['store_name'] = '';
		}
		if ( 0 === $show_staff || 1 === $staff_is_system ) {
			$copy['formatted']['staff_name'] = '';
		}
		return $copy;
	}

	/**
	 * $context が処理可能な形か検証する。
	 *
	 * @param mixed $context Reservation context.
	 * @return bool
	 */
	private function is_valid_context( $context ) {
		return is_array( $context ) && isset( $context['formatted'] ) && is_array( $context['formatted'] );
	}

	/**
	 * 1 通分の送信処理。宛先が空 / 不正な場合は何もしない。
	 *
	 * wp_mail_content_type フィルタは送信中だけ追加し、終了時に必ず除去する
	 * （他プラグインの mail に影響を残さないため）。
	 *
	 * @param string   $to      送信先メールアドレス。
	 * @param string   $subject 件名テンプレート。
	 * @param string   $body    本文テンプレート。
	 * @param array    $context Reservation context（テンプレート展開用）。
	 * @param string[] $cc      CC 用メールアドレス配列。
	 * @return void
	 */
	private function send( $to, $subject, $body, $context, $cc ) {
		if ( '' === $to || ! is_email( $to ) ) {
			return;
		}

		$rendered_subject = Smart_Booking_Reservation_Context::render( $subject, $context );
		$rendered_body    = Smart_Booking_Reservation_Context::render( $body, $context );

		// 件名 / 本文どちらかが空なら送信しない（テンプレート未設定とみなす）.
		if ( '' === trim( $rendered_subject ) || '' === trim( $rendered_body ) ) {
			return;
		}

		$headers = $this->build_headers( $cc );

		add_filter( 'wp_mail_content_type', array( $this, 'filter_content_type' ) );
		wp_mail( $to, $rendered_subject, $rendered_body, $headers );
		remove_filter( 'wp_mail_content_type', array( $this, 'filter_content_type' ) );
	}

	/**
	 * From ヘッダおよび CC ヘッダを構築する。
	 *
	 * @param string[] $cc CC メールアドレス配列。
	 * @return string[]
	 */
	private function build_headers( $cc ) {
		$headers = array();

		$from_email = (string) get_option( 'smb_mail_from_email', '' );
		if ( '' === $from_email || ! is_email( $from_email ) ) {
			$from_email = (string) get_option( 'admin_email', '' );
		}
		$from_name = (string) get_option( 'smb_mail_from_name', '' );
		if ( '' === $from_name ) {
			$from_name = (string) get_option( 'blogname', '' );
		}

		if ( '' !== $from_email && is_email( $from_email ) ) {
			if ( '' !== $from_name ) {
				$headers[] = sprintf( 'From: %s <%s>', $from_name, $from_email );
			} else {
				$headers[] = sprintf( 'From: %s', $from_email );
			}
		}

		if ( is_array( $cc ) ) {
			foreach ( $cc as $cc_addr ) {
				$cc_addr = (string) $cc_addr;
				if ( '' !== $cc_addr && is_email( $cc_addr ) ) {
					$headers[] = 'Cc: ' . $cc_addr;
				}
			}
		}

		return $headers;
	}

	/**
	 * wp_mail_content_type フィルタコールバック。
	 *
	 * 本クラスの送信中のみ add_filter され、送信完了で remove_filter される。
	 *
	 * @return string
	 */
	public function filter_content_type() {
		return self::CONTENT_TYPE;
	}
}
