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
 * 送信失敗・無言スキップは診断のため transient `smart_booking_last_mail_error` に
 * 直近 1 件だけ記録する（管理者が REST /mail-error で気付ける経路）。error_log は使わない。
 * wp_mail_failed の購読は自身の送信中だけ（他プラグインの失敗は拾わない）。
 * 送信成功時は記録を削除し、誤検知（古い通知の残留）を防ぐ。
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
	 * 直近の送信失敗 / 無言スキップを記録する transient キー。
	 *
	 * @var string
	 */
	const LAST_ERROR_KEY = 'smart_booking_last_mail_error';

	/**
	 * 記録の有効期限（秒）。この期間だけ直近 1 件を保持する。
	 *
	 * @var int
	 */
	const LAST_ERROR_TTL = 30 * DAY_IN_SECONDS;

	/**
	 * 現在 wp_mail 中の宛先種別（user / admin など）。wp_mail_failed リスナが参照する。
	 *
	 * @var string
	 */
	private $current_to_type = '';

	/**
	 * 現在の送信で wp_mail_failed を捕捉済みか（false 戻り値との二重記録を防ぐ）。
	 *
	 * @var bool
	 */
	private $wp_mail_failed_captured = false;

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
			(string) get_option( 'smart_booking_mail_receipt_user_subject', '' ),
			(string) get_option( 'smart_booking_mail_receipt_user_body', '' ),
			$context,
			array(),
			'user'
		);

		// 管理者系通知の宛先を「管理者へのメール」トグルの状態で組み立てる。
		//
		// ON  : admin_email を常に To に含める（店舗有無に関わらず）。店舗があれば追加 To。
		//       担当者は CC（あれば）。
		// OFF : admin_email は使わない。店舗があれば To。担当者があれば CC。
		//       店舗が空のときは（担当者の有無に関わらず）何も送らない。
		$admin_enabled = ( 1 === (int) get_option( 'smart_booking_mail_admin_notify_enabled', 1 ) );
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
			(string) get_option( 'smart_booking_mail_receipt_admin_subject', '' ),
			(string) get_option( 'smart_booking_mail_receipt_admin_body', '' ),
			$context,
			$cc_list,
			'admin'
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
			(string) get_option( 'smart_booking_mail_approval_user_subject', '' ),
			(string) get_option( 'smart_booking_mail_approval_user_body', '' ),
			$context,
			array(),
			'user'
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
	 * @param string          $to_type 宛先種別（user / admin）。記録用のラベル。
	 * @return void
	 */
	private function send( $to, $subject, $body, $context, $cc, $to_type = '' ) {
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
			// 宛先が空 / 不正（is_email 不通過）。無言スキップを診断のため記録する。
			$this->record_error( 'skipped_invalid_recipient', '送信先メールアドレスが未設定または不正です。', $to_type );
			return;
		}

		$rendered_subject = Smart_Booking_Reservation_Context::render( $subject, $context );
		$rendered_body    = Smart_Booking_Reservation_Context::render( $body, $context );

		// 件名 / 本文どちらかが空なら送信しない（テンプレート未設定とみなす）.
		if ( '' === trim( $rendered_subject ) || '' === trim( $rendered_body ) ) {
			// テンプレート空による無言スキップを診断のため記録する。
			$this->record_error( 'skipped_empty_template', 'メールの件名または本文テンプレートが空です。', $to_type );
			return;
		}

		$headers = $this->build_headers( $cc );

		// content_type と同様に、自身の送信中だけ wp_mail_failed を購読する
		// （他プラグインの送信失敗を拾わないようスコープする）。
		$this->current_to_type         = $to_type;
		$this->wp_mail_failed_captured = false;

		add_filter( 'wp_mail_content_type', array( $this, 'filter_content_type' ) );
		add_action( 'wp_mail_failed', array( $this, 'on_wp_mail_failed' ) );
		$sent = wp_mail( $to_list, $rendered_subject, $rendered_body, $headers );
		remove_action( 'wp_mail_failed', array( $this, 'on_wp_mail_failed' ) );
		remove_filter( 'wp_mail_content_type', array( $this, 'filter_content_type' ) );

		if ( true === $sent ) {
			// 送信成功。直近の失敗記録をクリアして誤検知（古い通知の残留）を防ぐ。
			$this->clear_error();
		} elseif ( ! $this->wp_mail_failed_captured ) {
			// wp_mail が false（wp_mail_failed が発火しないケースの保険として記録）。
			$this->record_error( 'transport_failed', 'メール送信に失敗しました（wp_mail が false を返しました）。', $to_type );
		}
	}

	/**
	 * wp_mail_failed アクションコールバック。
	 *
	 * 本クラスの送信中のみ add_action され、送信完了で remove_action される。
	 * 実トランスポート失敗（PHPMailer 例外など）を診断のため記録する。
	 *
	 * @param WP_Error|mixed $error wp_mail_failed が渡す WP_Error。
	 * @return void
	 */
	public function on_wp_mail_failed( $error ) {
		$reason = 'メール送信に失敗しました。';
		if ( is_wp_error( $error ) ) {
			$message = $error->get_error_message();
			if ( is_string( $message ) && '' !== $message ) {
				$reason = $message;
			}
		}
		$this->wp_mail_failed_captured = true;
		$this->record_error( 'transport_failed', $reason, $this->current_to_type );
	}

	/**
	 * 直近の送信失敗 / 無言スキップを transient に 1 件だけ記録する。
	 *
	 * @param string $category transport_failed / skipped_empty_template / skipped_invalid_recipient.
	 * @param string $reason   失敗理由の要約。
	 * @param string $to_type  宛先種別（user / admin）。
	 * @return void
	 */
	private function record_error( $category, $reason, $to_type ) {
		set_transient(
			self::LAST_ERROR_KEY,
			array(
				'time'     => time(),
				'category' => (string) $category,
				'reason'   => (string) $reason,
				'to_type'  => (string) $to_type,
			),
			self::LAST_ERROR_TTL
		);
	}

	/**
	 * 記録済みの直近失敗をクリアする（送信成功時）。
	 *
	 * @return void
	 */
	private function clear_error() {
		delete_transient( self::LAST_ERROR_KEY );
	}

	/**
	 * From ヘッダおよび CC ヘッダを構築する。
	 *
	 * @param string[] $cc CC メールアドレス配列。
	 * @return string[]
	 */
	private function build_headers( $cc ) {
		$headers = array();

		$from_email = (string) get_option( 'smart_booking_mail_from_email', '' );
		if ( '' === $from_email || ! is_email( $from_email ) ) {
			$from_email = (string) get_option( 'admin_email', '' );
		}
		$from_name = (string) get_option( 'smart_booking_mail_from_name', '' );
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
