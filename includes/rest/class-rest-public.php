<?php
/**
 * Smart Booking - REST: 公開エンドポイント (/public/*)
 *
 * フロント予約フォームから認証なし（ただし nonce 検証付き）で呼び出されるエンドポイント群。
 *
 * - 管理画面エンドポイント（`manage_options` 必須）とは別系統。
 * - 内部用カラム（メールアドレス、管理メモ等）は返さない。
 * - 書き込み系は nonce 検証必須。読み取り系もセッション乱用防止のため nonce を検証する。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 公開エンドポイント。基底クラスの `permission_check()` はオーバーライドする。
 */
class Smart_Booking_REST_Public extends Smart_Booking_REST_Base {

	/**
	 * 公開設定として返すキーとそれに対応するクライアント向けプロパティ名。
	 *
	 * フロント表示に必要なものだけをホワイトリスト化する。
	 * 認証情報（Chatwork APIトークン、Google カレンダー ID）や管理者宛メール本文などは返さない。
	 *
	 * @return array<string,array{default:mixed,type:string}>
	 */
	private function public_settings_schema() {
		return array(
			'smb_booking_flow_order'     => array(
				'key'     => 'flow_order',
				'default' => 'A',
				'type'    => 'text',
			),
			'smb_calendar_view_mode'     => array(
				'key'     => 'calendar_mode',
				'default' => 'day_only',
				'type'    => 'text',
			),
			'smb_display_days'           => array(
				'key'     => 'display_period_days',
				'default' => 7,
				'type'    => 'int',
			),
			'smb_booking_deadline_days'  => array(
				'key'     => 'deadline_days',
				'default' => 0,
				'type'    => 'int',
			),
			'smb_booking_deadline_hours' => array(
				'key'     => 'deadline_hours',
				'default' => 0,
				'type'    => 'int',
			),
			'smb_completion_message'     => array(
				'key'     => 'completion_message',
				'default' => '',
				'type'    => 'html',
			),
			'smb_color_button'           => array(
				'key'     => 'color_button',
				'default' => '',
				'type'    => 'color',
			),
			'smb_color_date_selected'    => array(
				'key'     => 'color_date_selected',
				'default' => '',
				'type'    => 'color',
			),
			'smb_color_time_selected'    => array(
				'key'     => 'color_time_selected',
				'default' => '',
				'type'    => 'color',
			),
			'smb_color_required_mark'    => array(
				'key'     => 'color_required_mark',
				'default' => '',
				'type'    => 'color',
			),
			'smb_color_focus'            => array(
				'key'     => 'color_focus',
				'default' => '',
				'type'    => 'color',
			),
		);
	}

	/**
	 * 公開エンドポイントの権限チェック。
	 *
	 * ログイン不要のため `manage_options` は要求しない。ただし CSRF 対策として
	 * WordPress 標準の `X-WP-Nonce` を検証する。ショートコードでページに埋め込まれる
	 * `smartBookingFrontend.nonce`（`wp_create_nonce( 'wp_rest' )`）がこれを満たす。
	 *
	 * @return bool|WP_Error
	 */
	public function permission_check() {
		$nonce = '';
		if ( isset( $_SERVER['HTTP_X_WP_NONCE'] ) ) {
			$nonce = sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_WP_NONCE'] ) );
		}
		if ( '' === $nonce && isset( $_REQUEST['_wpnonce'] ) ) {
			$nonce = sanitize_text_field( wp_unslash( $_REQUEST['_wpnonce'] ) );
		}
		if ( '' === $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new WP_Error(
				'smb_public_nonce_invalid',
				'セッションの有効期限が切れました。ページを再読み込みしてください。',
				array( 'status' => 403 )
			);
		}
		return true;
	}

	/**
	 * ルート登録。
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/public/stores',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_stores' ),
				'permission_callback' => array( $this, 'permission_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/public/staff',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_staff' ),
				'permission_callback' => array( $this, 'permission_check' ),
				'args'                => array(
					'store_id' => array(
						'required' => false,
						'type'     => 'integer',
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/public/settings',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_settings' ),
				'permission_callback' => array( $this, 'permission_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/public/custom-fields',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_custom_fields' ),
				'permission_callback' => array( $this, 'permission_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/public/availability',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_availability' ),
				'permission_callback' => array( $this, 'permission_check' ),
				'args'                => array(
					'store_id'  => array(
						'required' => false,
						'type'     => 'integer',
					),
					'staff_id'  => array(
						'required' => false,
						'type'     => 'integer',
					),
					'date_from' => array(
						'required' => false,
						'type'     => 'string',
					),
					'date_to'   => array(
						'required' => false,
						'type'     => 'string',
					),
				),
			)
		);
	}

	/**
	 * 公開店舗一覧。`is_active = 1` のみ、表示順。
	 *
	 * @return WP_REST_Response
	 */
	public function get_stores() {
		global $wpdb;
		$table = $wpdb->prefix . 'smb_stores';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared
		$rows = $wpdb->get_results(
			"SELECT id, name, description, image_id, calendar_color, prefecture, city, address_line, phone, sort_order
			FROM {$table}
			WHERE is_active = 1
			ORDER BY sort_order ASC, id ASC",
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			$rows = array();
		}

		$out = array();
		foreach ( $rows as $row ) {
			$image_url = '';
			if ( ! empty( $row['image_id'] ) ) {
				$url = wp_get_attachment_image_url( (int) $row['image_id'], 'medium' );
				if ( $url ) {
					$image_url = $url;
				}
			}
			$out[] = array(
				'id'             => (int) $row['id'],
				'name'           => (string) $row['name'],
				'description'    => (string) $row['description'],
				'image_id'       => (int) $row['image_id'],
				'image_url'      => $image_url,
				'calendar_color' => (string) $row['calendar_color'],
				'prefecture'     => (string) $row['prefecture'],
				'city'           => (string) $row['city'],
				'address_line'   => (string) $row['address_line'],
				'phone'          => (string) $row['phone'],
				'sort_order'     => (int) $row['sort_order'],
			);
		}
		return rest_ensure_response( $out );
	}

	/**
	 * 公開担当者一覧。`is_active = 1` のみ。`store_id` でフィルタ可能。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response
	 */
	public function get_staff( $request ) {
		global $wpdb;
		$table = $wpdb->prefix . 'smb_staff';

		$store_id = absint( $request->get_param( 'store_id' ) );

		if ( $store_id > 0 ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT id, store_id, name, description, image_id, sort_order
					FROM {$table}
					WHERE is_active = 1 AND store_id = %d
					ORDER BY sort_order ASC, id ASC",
					$store_id
				),
				ARRAY_A
			);
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared
			$rows = $wpdb->get_results(
				"SELECT id, store_id, name, description, image_id, sort_order
				FROM {$table}
				WHERE is_active = 1
				ORDER BY sort_order ASC, id ASC",
				ARRAY_A
			);
		}
		if ( ! is_array( $rows ) ) {
			$rows = array();
		}

		$out = array();
		foreach ( $rows as $row ) {
			$image_url = '';
			if ( ! empty( $row['image_id'] ) ) {
				$url = wp_get_attachment_image_url( (int) $row['image_id'], 'medium' );
				if ( $url ) {
					$image_url = $url;
				}
			}
			$out[] = array(
				'id'          => (int) $row['id'],
				'store_id'    => (int) $row['store_id'],
				'name'        => (string) $row['name'],
				'description' => (string) $row['description'],
				'image_id'    => (int) $row['image_id'],
				'image_url'   => $image_url,
				'sort_order'  => (int) $row['sort_order'],
			);
		}
		return rest_ensure_response( $out );
	}

	/**
	 * 公開設定の取得。
	 *
	 * @return WP_REST_Response
	 */
	public function get_settings() {
		$schema = $this->public_settings_schema();
		$out    = array();
		foreach ( $schema as $option_key => $def ) {
			$raw = get_option( $option_key, $def['default'] );
			switch ( $def['type'] ) {
				case 'int':
					$out[ $def['key'] ] = (int) $raw;
					break;
				case 'color':
					$clean              = $this->sanitize_hex_color( (string) $raw );
					$out[ $def['key'] ] = null === $clean ? '' : $clean;
					break;
				case 'html':
					$out[ $def['key'] ] = wp_kses_post( (string) $raw );
					break;
				case 'text':
				default:
					$out[ $def['key'] ] = sanitize_text_field( (string) $raw );
					break;
			}
		}

		// 意味のあるデフォルトを補完する。
		if ( ! in_array( $out['flow_order'], array( 'A', 'B' ), true ) ) {
			$out['flow_order'] = 'A';
		}
		if ( ! in_array( $out['calendar_mode'], array( 'day_only', 'month_only', 'toggle' ), true ) ) {
			$out['calendar_mode'] = 'day_only';
		}
		if ( $out['display_period_days'] <= 0 ) {
			$out['display_period_days'] = 7;
		}

		return rest_ensure_response( $out );
	}

	/**
	 * 公開カスタムフィールド定義。
	 *
	 * @return WP_REST_Response
	 */
	public function get_custom_fields() {
		global $wpdb;
		$table = $wpdb->prefix . 'smb_custom_fields';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared
		$rows = $wpdb->get_results(
			"SELECT id, field_key, field_label, field_type, field_options, placeholder, is_required, sort_order
			FROM {$table}
			ORDER BY sort_order ASC, id ASC",
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			$rows = array();
		}

		$out = array();
		foreach ( $rows as $row ) {
			$options = array();
			if ( ! empty( $row['field_options'] ) ) {
				$decoded = json_decode( $row['field_options'], true );
				if ( is_array( $decoded ) ) {
					$options = array_values( array_map( 'strval', $decoded ) );
				}
			}
			$out[] = array(
				'id'            => (int) $row['id'],
				'field_key'     => (string) $row['field_key'],
				'field_label'   => (string) $row['field_label'],
				'field_type'    => (string) $row['field_type'],
				'field_options' => $options,
				'placeholder'   => (string) $row['placeholder'],
				'is_required'   => (int) $row['is_required'] ? 1 : 0,
				'sort_order'    => (int) $row['sort_order'],
			);
		}
		return rest_ensure_response( $out );
	}

	/**
	 * スケジュール一覧 + 空き状況（availability）を返す。
	 *
	 * - `is_active = 1` のスケジュールのみ。
	 * - `date_from` / `date_to` 未指定時は today 〜 today + `display_period_days` 日後まで。
	 * - 締切（`smb_booking_deadline_days` / `smb_booking_deadline_hours`）を超過した枠は `closed`。
	 * - 空き状況の判定:
	 *     closed    : 締切超過
	 *     full      : booked_count >= capacity
	 *     few_left  : booked_count >= capacity * 0.7（残り3割未満）
	 *     available : 上記いずれでもない
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response
	 */
	public function get_availability( $request ) {
		global $wpdb;
		$table = $wpdb->prefix . 'smb_schedules';

		$store_id = absint( $request->get_param( 'store_id' ) );
		$staff_id = absint( $request->get_param( 'staff_id' ) );

		$display_days = (int) get_option( 'smb_display_days', 7 );
		if ( $display_days <= 0 ) {
			$display_days = 7;
		}

		// 今日・表示期間終端はサイトタイムゾーン基準で算出する。
		$today_str = current_time( 'Y-m-d' );

		$date_from = $this->sanitize_date_string( (string) $request->get_param( 'date_from' ) );
		$date_to   = $this->sanitize_date_string( (string) $request->get_param( 'date_to' ) );
		if ( null === $date_from ) {
			$date_from = $today_str;
		}
		if ( null === $date_to ) {
			// 今日 + (display_days - 1) 日後までを含める。
			$end_ts    = strtotime( $today_str . ' +' . ( $display_days - 1 ) . ' days' );
			$date_to   = false !== $end_ts ? gmdate( 'Y-m-d', $end_ts ) : $today_str;
		}
		if ( strcmp( $date_from, $date_to ) > 0 ) {
			// 範囲が逆転している場合は空配列を返す。
			return rest_ensure_response( array( 'schedules' => array() ) );
		}

		$where  = array( 'is_active = 1', 'schedule_date >= %s', 'schedule_date <= %s' );
		$params = array( $date_from, $date_to );
		if ( $store_id > 0 ) {
			$where[]  = 'store_id = %d';
			$params[] = $store_id;
		}
		if ( $staff_id > 0 ) {
			$where[]  = 'staff_id = %d';
			$params[] = $staff_id;
		}

		$sql = "SELECT id, store_id, staff_id, schedule_date, start_time, end_time, capacity, booked_count
			FROM {$table}
			WHERE " . implode( ' AND ', $where ) . '
			ORDER BY schedule_date ASC, start_time ASC';

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $params ), ARRAY_A );
		if ( ! is_array( $rows ) ) {
			$rows = array();
		}

		$deadline_days  = max( 0, (int) get_option( 'smb_booking_deadline_days', 0 ) );
		$deadline_hours = max( 0, (int) get_option( 'smb_booking_deadline_hours', 0 ) );

		// 締切判定用にサイトタイムゾーンの「現在時刻」を取得する。
		$now_ts = (int) current_time( 'timestamp' );

		$out = array();
		foreach ( $rows as $row ) {
			$capacity     = (int) $row['capacity'];
			$booked_count = (int) $row['booked_count'];

			// 予約枠の開始日時（サイトタイムゾーン）を算出。start_time は HH:MM:SS。
			$slot_ts = strtotime( $row['schedule_date'] . ' ' . $row['start_time'] );
			$availability = 'available';

			$is_closed = false;

			// 過去の枠は常に closed。
			if ( false === $slot_ts || $slot_ts <= $now_ts ) {
				$is_closed = true;
			}

			// deadline_days / deadline_hours のうち、より早い（厳しい）締切を採用。
			if ( ! $is_closed && ( $deadline_days > 0 || $deadline_hours > 0 ) ) {
				$deadlines = array();
				if ( $deadline_days > 0 ) {
					$deadlines[] = $slot_ts - ( $deadline_days * DAY_IN_SECONDS );
				}
				if ( $deadline_hours > 0 ) {
					$deadlines[] = $slot_ts - ( $deadline_hours * HOUR_IN_SECONDS );
				}
				$deadline_ts = min( $deadlines );
				if ( $now_ts >= $deadline_ts ) {
					$is_closed = true;
				}
			}

			if ( $is_closed ) {
				$availability = 'closed';
			} elseif ( $capacity > 0 && $booked_count >= $capacity ) {
				$availability = 'full';
			} elseif ( $capacity > 0 && $booked_count >= (int) ceil( $capacity * 0.7 ) ) {
				$availability = 'few_left';
			}

			// start_time / end_time は HH:MM に整形してフロントへ返す（表示用）。
			$start_hm = substr( (string) $row['start_time'], 0, 5 );
			$end_hm   = substr( (string) $row['end_time'], 0, 5 );

			$out[] = array(
				'id'            => (int) $row['id'],
				'store_id'      => (int) $row['store_id'],
				'staff_id'      => (int) $row['staff_id'],
				'schedule_date' => (string) $row['schedule_date'],
				'start_time'    => $start_hm,
				'end_time'      => $end_hm,
				'capacity'      => $capacity,
				'booked_count'  => $booked_count,
				'availability'  => $availability,
			);
		}

		return rest_ensure_response(
			array(
				'date_from' => $date_from,
				'date_to'   => $date_to,
				'schedules' => $out,
			)
		);
	}
}
