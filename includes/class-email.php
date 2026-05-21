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

		$this->send(
			(string) $formatted['customer_email'],
			(string) get_option( 'smb_mail_receipt_user_subject', '' ),
			(string) get_option( 'smb_mail_receipt_user_body', '' ),
			$context,
			array()
		);

		// 管理者系通知の宛先を「管理者へのメール」トグルの状態で組み立てる。
		//
		// ON  : admin_email を常に To に含める（店舗有無に関わらず）。店舗があれば追加 To。
		//       担当者は CC（あれば）。
		// OFF : admin_email は使わない。店舗があれば To。担当者があれば CC。
		//       店舗が空のときは（担当者の有無に関わらず）何も送らない。
		$admin_enabled = ( 1 === (int) get_option( 'smb_mail_admin_notify_enabled', 1 ) );
		$store_email   = (string) $formatted['store_email'];
		$staff_email   = (string) $formatted['staff_email'];
		$wp_admin_to   = (string) get_option( 'admin_email', '' );

		$to_list = array();
		$cc_list = array();

		if ( $admin_enabled ) {
			if ( '' !== $wp_admin_to && is_email( $wp_admin_to ) ) {
				$to_list[] = $wp_admin_to;
			}
			if ( '' !== $store_email && is_email( $store_email ) ) {
				$to_list[] = $store_email;
			}
			if ( '' !== $staff_email && is_email( $staff_email ) ) {
				$cc_list[] = $staff_email;
			}
		} else {
			// OFF: 店舗メールがなければ送らない（担当者だけのケースも送信しない）。
			if ( '' === $store_email || ! is_email( $store_email ) ) {
				return;
			}
			$to_list[] = $store_email;
			if ( '' !== $staff_email && is_email( $staff_email ) ) {
				$cc_list[] = $staff_email;
			}
		}

		// 同一アドレスの重複を除外（admin_email と店舗メールが一致するケース等）。
		$to_list = array_values( array_unique( $to_list ) );

		if ( empty( $to_list ) ) {
			return;
		}

		$this->send(
			$to_list,
			(string) get_option( 'smb_mail_receipt_admin_subject', '' ),
			(string) get_option( 'smb_mail_receipt_admin_body', '' ),
			$context,
			$cc_list
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

		$this->send(
			(string) $formatted['customer_email'],
			(string) get_option( 'smb_mail_approval_user_subject', '' ),
			(string) get_option( 'smb_mail_approval_user_body', '' ),
			$context,
			array()
		);
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
	 * @param string|string[] $to      送信先メールアドレス（単一 or 複数）。
	 * @param string          $subject 件名テンプレート。
	 * @param string          $body    本文テンプレート。
	 * @param array           $context Reservation context（テンプレート展開用）。
	 * @param string[]        $cc      CC 用メールアドレス配列。
	 * @return void
	 */
	private function send( $to, $subject, $body, $context, $cc ) {
		// 単一文字列 / 配列を許容し、フィルタした上で wp_mail に渡す。
		$to_list = is_array( $to ) ? $to : array( (string) $to );
		$to_list = array_values(
			array_filter(
				$to_list,
				static function ( $addr ) {
					return is_string( $addr ) && '' !== $addr && is_email( $addr );
				}
			)
		);
		if ( empty( $to_list ) ) {
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
		wp_mail( $to_list, $rendered_subject, $rendered_body, $headers );
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
