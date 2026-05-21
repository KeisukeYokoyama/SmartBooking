<?php
/**
 * Smart Booking - Reservation Context
 *
 * 予約 ID から、メール / ChatWork / Google Calendar 連携が必要とする全データを 1 度の
 * クエリ束ねで構築する。各連携クラスは個別に SQL を書かず、ここから値を引く。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 予約コンテキスト。連携クラス共通のデータプロバイダ。
 */
class Smart_Booking_Reservation_Context {

	/**
	 * 予約 ID から正規化済みコンテキスト配列を構築する。
	 *
	 * @param int $reservation_id 予約 ID。
	 * @return array|null 構築失敗時は null。
	 */
	public static function build( $reservation_id ) {
		global $wpdb;
		$reservation_id = (int) $reservation_id;
		if ( $reservation_id <= 0 ) {
			return null;
		}

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		$reservation = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smb_reservations WHERE id = %d", $reservation_id ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		if ( ! $reservation ) {
			return null;
		}

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		$store      = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smb_stores WHERE id = %d", (int) $reservation['store_id'] ),
			ARRAY_A
		);
		$staff      = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smb_staff WHERE id = %d", (int) $reservation['staff_id'] ),
			ARRAY_A
		);
		$meta_rows  = $wpdb->get_results(
			$wpdb->prepare( "SELECT meta_key, meta_value FROM {$wpdb->prefix}smb_reservation_meta WHERE reservation_id = %d", $reservation_id ),
			ARRAY_A
		);
		$field_defs = $wpdb->get_results(
			"SELECT field_key, field_label, field_type FROM {$wpdb->prefix}smb_custom_fields ORDER BY sort_order ASC, id ASC",
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value

		$meta = array();
		if ( is_array( $meta_rows ) ) {
			foreach ( $meta_rows as $row ) {
				$meta[ (string) $row['meta_key'] ] = (string) $row['meta_value'];
			}
		}

		// 連携クラスが利用しやすいよう、表示用に整形した補助フィールドを付与する。
		$schedule_date = (string) $reservation['schedule_date'];
		$schedule_time = (string) $reservation['schedule_time'];

		return array(
			'reservation'       => $reservation,
			'store'             => is_array( $store ) ? $store : array(),
			'staff'             => is_array( $staff ) ? $staff : array(),
			'meta'              => $meta,
			'custom_field_defs' => is_array( $field_defs ) ? $field_defs : array(),
			'formatted'         => array(
				'reservation_id' => (int) $reservation['id'],
				'customer_name'  => (string) $reservation['customer_name'],
				'customer_email' => (string) $reservation['customer_email'],
				'customer_phone' => (string) $reservation['customer_phone'],
				'store_name'     => is_array( $store ) ? (string) $store['name'] : '',
				'store_email'    => is_array( $store ) ? (string) $store['email'] : '',
				'staff_name'     => is_array( $staff ) ? (string) $staff['name'] : '',
				'staff_email'    => is_array( $staff ) ? (string) $staff['email'] : '',
				'schedule_date'  => self::format_date_jp( $schedule_date ),
				'schedule_time'  => self::format_time_range( $schedule_time, $reservation_id ),
				'schedule_iso'   => $schedule_date . 'T' . $schedule_time, // GCal 用 ISO 風（タイムゾーン無し）.
			),
		);
	}

	/**
	 * 日付を「2026年5月1日（金）」形式に整形する。
	 *
	 * @param string $date YYYY-MM-DD.
	 * @return string
	 */
	private static function format_date_jp( $date ) {
		$ts = strtotime( (string) $date );
		if ( false === $ts ) {
			return (string) $date;
		}
		$weekday = array( '日', '月', '火', '水', '木', '金', '土' );
		$w       = (int) gmdate( 'w', $ts );
		return sprintf( '%d年%d月%d日（%s）', (int) gmdate( 'Y', $ts ), (int) gmdate( 'n', $ts ), (int) gmdate( 'j', $ts ), $weekday[ $w ] );
	}

	/**
	 * 「14:00〜15:00」形式に整形する。end_time は schedules から逆引きする。
	 *
	 * @param string $start_time HH:MM:SS.
	 * @param int    $reservation_id 予約 ID（end_time の引き戻しに使用）.
	 * @return string
	 */
	private static function format_time_range( $start_time, $reservation_id ) {
		global $wpdb;
		$start_short = substr( (string) $start_time, 0, 5 );

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$end_time = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT s.end_time FROM {$wpdb->prefix}smb_schedules s INNER JOIN {$wpdb->prefix}smb_reservations r ON r.schedule_id = s.id WHERE r.id = %d",
				(int) $reservation_id
			)
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $end_time ) {
			return $start_short . '〜';
		}
		return $start_short . '〜' . substr( (string) $end_time, 0, 5 );
	}

	/**
	 * メール本文用テンプレート変数の置換マップを返す。
	 *
	 * @param array $context build() 戻り値.
	 * @return array<string,string>
	 */
	public static function template_vars( $context ) {
		if ( ! is_array( $context ) || empty( $context['formatted'] ) ) {
			return array();
		}
		$f = $context['formatted'];
		return array(
			'{customer_name}'  => (string) $f['customer_name'],
			'{customer_email}' => (string) $f['customer_email'],
			'{customer_phone}' => (string) $f['customer_phone'],
			'{reservation_id}' => (string) $f['reservation_id'],
			'{schedule_date}'  => (string) $f['schedule_date'],
			'{schedule_time}'  => (string) $f['schedule_time'],
			'{store_name}'     => (string) $f['store_name'],
			'{staff_name}'     => (string) $f['staff_name'],
		);
	}

	/**
	 * 文字列に対しテンプレート変数を一括置換する。
	 *
	 * @param string $text 元文字列.
	 * @param array  $context build() 戻り値.
	 * @return string
	 */
	public static function render( $text, $context ) {
		$vars = self::template_vars( $context );
		if ( empty( $vars ) ) {
			return (string) $text;
		}
		return strtr( (string) $text, $vars );
	}
}
