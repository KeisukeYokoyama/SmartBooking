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
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_reservations WHERE id = %d", $reservation_id ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		if ( ! $reservation ) {
			return null;
		}

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		$store     = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_stores WHERE id = %d", (int) $reservation['store_id'] ),
			ARRAY_A
		);
		$staff     = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_staff WHERE id = %d", (int) $reservation['staff_id'] ),
			ARRAY_A
		);
		$meta_rows = $wpdb->get_results(
			$wpdb->prepare( "SELECT meta_key, meta_value FROM {$wpdb->prefix}smart_booking_reservation_meta WHERE reservation_id = %d", $reservation_id ),
			ARRAY_A
		);
		// カスタムフィールド定義は「この予約が使ったフォーム」に限定して取得する。
		// 複数フォーム（v0.4.0）では同じ field_key が別フォームに存在し得るため、
		// メール変数の展開は予約の form_id スコープで行う（他フォームの定義を混ぜない）。
		$reservation_form_id = isset( $reservation['form_id'] ) ? (int) $reservation['form_id'] : 0;
		$field_defs          = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT field_key, field_label, field_type FROM {$wpdb->prefix}smart_booking_custom_fields WHERE form_id = %d ORDER BY sort_order ASC, id ASC",
				$reservation_form_id
			),
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
				"SELECT s.end_time FROM {$wpdb->prefix}smart_booking_schedules s INNER JOIN {$wpdb->prefix}smart_booking_reservations r ON r.schedule_id = s.id WHERE r.id = %d",
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

		// カスタムフィールドの回答を {field_key} 変数として先に組み立てる。
		// 直後に固定 8 変数を上書きするため、field_key が固定変数名と衝突しても固定側が優先される。
		$vars = self::custom_field_vars( $context );

		$vars['{customer_name}']  = (string) $f['customer_name'];
		$vars['{customer_email}'] = (string) $f['customer_email'];
		$vars['{customer_phone}'] = (string) $f['customer_phone'];
		$vars['{reservation_id}'] = (string) $f['reservation_id'];
		$vars['{schedule_date}']  = (string) $f['schedule_date'];
		$vars['{schedule_time}']  = (string) $f['schedule_time'];
		$vars['{store_name}']     = (string) $f['store_name'];
		$vars['{staff_name}']     = (string) $f['staff_name'];

		return $vars;
	}

	/**
	 * カスタムフィールドの回答値をテンプレート変数の置換マップとして返す。
	 *
	 * - 通常フィールド: {field_key} → 回答値（checkbox の複数選択は「、」で結合）。
	 * - address フィールド: {key}_zip / {key}_address / {key}（「〒郵便番号 住所」の結合）の 3 変数。
	 * - 表示条件で非表示だった（meta 行が無い）フィールドは空文字に展開する（未入力と同じ扱い）。
	 *
	 * meta は保存済みの回答（v0.3.0/v0.4.0 で作られた既存予約も含む）を遡って参照するため、
	 * マイグレーションは不要。
	 *
	 * @param array $context build() 戻り値.
	 * @return array<string,string>
	 */
	private static function custom_field_vars( $context ) {
		$vars = array();
		$defs = ( isset( $context['custom_field_defs'] ) && is_array( $context['custom_field_defs'] ) ) ? $context['custom_field_defs'] : array();
		$meta = ( isset( $context['meta'] ) && is_array( $context['meta'] ) ) ? $context['meta'] : array();

		foreach ( $defs as $def ) {
			$key = isset( $def['field_key'] ) ? (string) $def['field_key'] : '';
			if ( '' === $key ) {
				continue;
			}
			$type = isset( $def['field_type'] ) ? (string) $def['field_type'] : '';

			if ( 'address' === $type ) {
				// address は {key}_zip / {key}_address の 2 meta で保存される（class-rest-public.php）。
				$zip  = isset( $meta[ $key . '_zip' ] ) ? (string) $meta[ $key . '_zip' ] : '';
				$addr = isset( $meta[ $key . '_address' ] ) ? (string) $meta[ $key . '_address' ] : '';

				$vars[ '{' . $key . '_zip}' ]     = $zip;
				$vars[ '{' . $key . '_address}' ] = $addr;
				$vars[ '{' . $key . '}' ]         = self::format_address( $zip, $addr );
				continue;
			}

			// 通常フィールド。meta 行が無い（未入力 / 条件非表示）場合は空文字に展開する。
			$raw                      = isset( $meta[ $key ] ) ? (string) $meta[ $key ] : '';
			$vars[ '{' . $key . '}' ] = self::format_scalar_value( $raw, $type );
		}

		return $vars;
	}

	/**
	 * address の郵便番号・住所を「〒郵便番号 住所」形式に結合する。
	 *
	 * 予約フォーム確認画面・予約詳細（ReservationDetailModal）と同じ見た目に揃える
	 * （郵便番号はハイフン無しの正規化 7 桁のまま、半角スペース区切り、空要素は除外）。
	 *
	 * @param string $zip  正規化済み郵便番号（7 桁、空可）.
	 * @param string $addr 住所（空可）.
	 * @return string
	 */
	private static function format_address( $zip, $addr ) {
		$parts = array();
		if ( '' !== (string) $zip ) {
			$parts[] = '〒' . (string) $zip;
		}
		if ( '' !== trim( (string) $addr ) ) {
			$parts[] = (string) $addr;
		}
		return implode( ' ', $parts );
	}

	/**
	 * 通常フィールドの meta 値を表示用文字列に整形する。
	 *
	 * checkbox は複数選択を JSON 配列で保存しているため、読める区切り「、」で結合する
	 * （予約詳細の表示と同じ結合記号）。それ以外はそのまま返す。
	 *
	 * @param string $raw  meta_value.
	 * @param string $type field_type.
	 * @return string
	 */
	private static function format_scalar_value( $raw, $type ) {
		if ( 'checkbox' === $type && '' !== (string) $raw ) {
			$decoded = json_decode( (string) $raw, true );
			if ( is_array( $decoded ) ) {
				return implode( '、', array_map( 'strval', $decoded ) );
			}
		}
		return (string) $raw;
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
