<?php
/**
 * Plugin Name: Smart Booking MailPit SMTP (dev only)
 * Description: wp-env コンテナ内の wp_mail() を MailPit (host.docker.internal:1025) へ向ける開発用 mu-plugin。本番には同梱しない（.distignore で tests/ ごと除外済み）。
 *
 * 仕組み:
 *   - phpmailer_init フック で PHPMailer インスタンスに SMTP 設定を注入。
 *   - 認証なし / TLS 無効 (MailPit はローカル開発用なので素のまま LAN 内で受信)。
 *   - smb_mail_catcher.php (オプトイン化済み) と共存可能。
 *     既定は catcher が素通り → ここで MailPit へ送信。
 *     E2E テスト時は smb_mail_capture_enabled=1 で catcher が傍受しこちらは呼ばれない。
 *
 * MailPit UI: http://localhost:8025/
 *
 * @package Smart_Booking_Tests
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * PHPMailer を MailPit に向ける。
 *
 * Docker Desktop (macOS / Windows) では `host.docker.internal` が
 * コンテナからホストへ解決される。Linux でも 20.10 以降は同名で動作する。
 *
 * @param PHPMailer\PHPMailer\PHPMailer $phpmailer
 * @return void
 */
function smb_mailpit_smtp_configure( $phpmailer ) {
	$phpmailer->isSMTP();
	$phpmailer->Host        = defined( 'SMB_MAILPIT_HOST' ) ? SMB_MAILPIT_HOST : 'host.docker.internal';
	$phpmailer->Port        = defined( 'SMB_MAILPIT_PORT' ) ? (int) SMB_MAILPIT_PORT : 1025;
	$phpmailer->SMTPAuth    = false;
	$phpmailer->SMTPSecure  = '';
	$phpmailer->SMTPAutoTLS = false;
	$phpmailer->Timeout     = 5;
}
add_action( 'phpmailer_init', 'smb_mailpit_smtp_configure' );
