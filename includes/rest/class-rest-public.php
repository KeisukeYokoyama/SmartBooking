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
			'smart_booking_booking_flow_order'     => array(
				'key'     => 'flow_order',
				'default' => 'A',
				'type'    => 'text',
			),
			'smart_booking_calendar_view_mode'     => array(
				'key'     => 'calendar_mode',
				'default' => 'day_only',
				'type'    => 'text',
			),
			'smart_booking_display_days'           => array(
				'key'     => 'display_period_days',
				'default' => 7,
				'type'    => 'int',
			),
			'smart_booking_booking_deadline_days'  => array(
				'key'     => 'deadline_days',
				'default' => 0,
				'type'    => 'int',
			),
			'smart_booking_booking_deadline_hours' => array(
				'key'     => 'deadline_hours',
				'default' => 0,
				'type'    => 'int',
			),
			'smart_booking_show_store_front'       => array(
				'key'     => 'show_store_front',
				'default' => 0,
				'type'    => 'bool',
			),
			'smart_booking_show_staff_front'       => array(
				'key'     => 'show_staff_front',
				'default' => 0,
				'type'    => 'bool',
			),
			'smart_booking_store_label'            => array(
				'key'     => 'store_label',
				'default' => '',
				'type'    => 'text',
			),
			'smart_booking_staff_label'            => array(
				'key'     => 'staff_label',
				'default' => '',
				'type'    => 'text',
			),
			'smart_booking_completion_message'     => array(
				'key'     => 'completion_message',
				'default' => '',
				'type'    => 'html',
			),
			'smart_booking_color_button'           => array(
				'key'     => 'color_button',
				'default' => '',
				'type'    => 'color',
			),
			'smart_booking_color_date_selected'    => array(
				'key'     => 'color_date_selected',
				'default' => '',
				'type'    => 'color',
			),
			'smart_booking_color_time_selected'    => array(
				'key'     => 'color_time_selected',
				'default' => '',
				'type'    => 'color',
			),
			'smart_booking_color_required_mark'    => array(
				'key'     => 'color_required_mark',
				'default' => '',
				'type'    => 'color',
			),
			'smart_booking_color_focus'            => array(
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

		register_rest_route(
			self::NAMESPACE_V1,
			'/public/reservations',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'create_reservation' ),
				'permission_callback' => array( $this, 'permission_check' ),
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
		// テーブル名は内部生成値。プレースホルダでは識別子を扱えないため interpolation で対応。
		// is_system=1（システムエンティティ）はユーザーには見えないため公開 API でも返さない。
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			"SELECT id, name, description, image_id, calendar_color, prefecture, city, address_line, phone, sort_order
			FROM {$wpdb->prefix}smart_booking_stores
			WHERE is_active = 1 AND is_system = 0
			ORDER BY sort_order ASC, id ASC",
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
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

		$store_id = absint( $request->get_param( 'store_id' ) );

		// テーブル名は内部生成値。プレースホルダでは識別子を扱えないため interpolation で対応。
		// is_system=1（システムエンティティ）はユーザーには見えないため公開 API でも返さない。
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( $store_id > 0 ) {
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT id, store_id, name, description, image_id, sort_order
					FROM {$wpdb->prefix}smart_booking_staff
					WHERE is_active = 1 AND is_system = 0 AND store_id = %d
					ORDER BY sort_order ASC, id ASC",
					$store_id
				),
				ARRAY_A
			);
		} else {
			$rows = $wpdb->get_results(
				"SELECT id, store_id, name, description, image_id, sort_order
				FROM {$wpdb->prefix}smart_booking_staff
				WHERE is_active = 1 AND is_system = 0
				ORDER BY sort_order ASC, id ASC",
				ARRAY_A
			);
		}
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
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
				case 'bool':
					$out[ $def['key'] ] = ( (int) $raw ) ? true : false;
					break;
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

		// 管理画面が保存する値を、フロント React が解釈する正準値に正規化する。
		// 旧バージョンの値（date-first / form-first / day-horizontal / month-grid / day-and-month / toggle）も後方互換として受け付ける。
		$flow_map = array(
			'A'          => 'A',
			'B'          => 'B',
			'date-first' => 'A',
			'form-first' => 'B',
		);
		$calendar_map = array(
			'day_only'       => 'day_only',
			'month_only'     => 'month_only',
			'both'           => 'both',
			'toggle'         => 'both',
			'day-horizontal' => 'day_only',
			'month-grid'     => 'month_only',
			'day-and-month'  => 'both',
		);
		$out['flow_order']    = isset( $flow_map[ $out['flow_order'] ] ) ? $flow_map[ $out['flow_order'] ] : 'A';
		$out['calendar_mode'] = isset( $calendar_map[ $out['calendar_mode'] ] ) ? $calendar_map[ $out['calendar_mode'] ] : 'day_only';

		if ( $out['display_period_days'] <= 0 ) {
			$out['display_period_days'] = 7;
		}

		// 呼び方（店舗・担当者）の空文字フォールバック。
		// 未設定・空白のみはデフォルト表記に寄せ、フォールバック判定をここ（サーバ）に集約する。
		// フロントは受け取った値をそのまま表示する。
		if ( '' === trim( (string) $out['store_label'] ) ) {
			$out['store_label'] = '店舗';
		}
		if ( '' === trim( (string) $out['staff_label'] ) ) {
			$out['staff_label'] = '担当者';
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
		// テーブル名は内部生成値。プレースホルダでは識別子を扱えないため interpolation で対応。
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			"SELECT id, field_key, field_label, field_type, field_options, placeholder, is_required, sort_order, condition_field_key, condition_value
			FROM {$wpdb->prefix}smart_booking_custom_fields
			ORDER BY sort_order ASC, id ASC",
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
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
			$condition_field_key = ( isset( $row['condition_field_key'] ) && null !== $row['condition_field_key'] && '' !== (string) $row['condition_field_key'] )
				? (string) $row['condition_field_key']
				: null;
			$condition_value     = ( isset( $row['condition_value'] ) && null !== $row['condition_value'] && '' !== (string) $row['condition_value'] )
				? (string) $row['condition_value']
				: null;

			$out[] = array(
				'id'                  => (int) $row['id'],
				'field_key'           => (string) $row['field_key'],
				'field_label'         => (string) $row['field_label'],
				'field_type'          => (string) $row['field_type'],
				'field_options'       => $options,
				'placeholder'         => (string) $row['placeholder'],
				'is_required'         => (int) $row['is_required'] ? 1 : 0,
				'sort_order'          => (int) $row['sort_order'],
				'condition_field_key' => $condition_field_key,
				'condition_value'     => $condition_value,
			);
		}
		return rest_ensure_response( $out );
	}

	/**
	 * スケジュール一覧 + 空き状況（availability）を返す。
	 *
	 * - `is_active = 1` のスケジュールのみ。
	 * - `date_from` / `date_to` 未指定時は today 〜 today + `display_period_days` 日後まで。
	 * - 締切（`smart_booking_booking_deadline_days` / `smart_booking_booking_deadline_hours`）を超過した枠は `closed`。
	 * - 空き状況の判定:
	 *     closed    : 締切超過
	 *     full      : booked_count >= capacity
	 *     few_left  : 残席 <= 2 もしくは 残席 <= ceil(capacity * 0.3)
	 *                 （capacity が小さい枠でも最後の数席で「残りわずか」を出すため、
	 *                  絶対数（2 席）と残席率（30%）のいずれかが満たされれば few_left）
	 *     available : 上記いずれでもない
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response
	 */
	public function get_availability( $request ) {
		global $wpdb;

		$store_id = absint( $request->get_param( 'store_id' ) );
		$staff_id = absint( $request->get_param( 'staff_id' ) );

		// 担当者非表示モード: staff_id 未指定なら同一時刻枠を統合する。
		$show_staff_front = ( (int) get_option( 'smart_booking_show_staff_front', 0 ) ) ? 1 : 0;
		$aggregate_staff  = ( 0 === $show_staff_front && $staff_id <= 0 );

		$display_days = (int) get_option( 'smart_booking_display_days', 7 );
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
			$end_ts  = strtotime( $today_str . ' +' . ( $display_days - 1 ) . ' days' );
			$date_to = false !== $end_ts ? gmdate( 'Y-m-d', $end_ts ) : $today_str;
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
			FROM {$wpdb->prefix}smart_booking_schedules
			WHERE " . implode( ' AND ', $where ) . '
			ORDER BY schedule_date ASC, start_time ASC';

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, PluginCheck.Security.DirectDB.UnescapedDBParameter
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $params ), ARRAY_A );
		if ( ! is_array( $rows ) ) {
			$rows = array();
		}

		$deadline_days  = max( 0, (int) get_option( 'smart_booking_booking_deadline_days', 0 ) );
		$deadline_hours = max( 0, (int) get_option( 'smart_booking_booking_deadline_hours', 0 ) );

		// 締切判定用にサイトタイムゾーンの「現在時刻」を取得する。
		// phpcs:ignore WordPress.DateTime.CurrentTimeTimestamp.Requested -- サイトTZ基準の Unix 秒で日時計算するため明示的に timestamp を要求。
		$now_ts = (int) current_time( 'timestamp' );

		$out = array();
		foreach ( $rows as $row ) {
			$capacity     = (int) $row['capacity'];
			$booked_count = (int) $row['booked_count'];

			// 予約枠の開始日時（サイトタイムゾーン）を算出。start_time は HH:MM:SS。
			$slot_ts      = strtotime( $row['schedule_date'] . ' ' . $row['start_time'] );
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
			} elseif ( $capacity > 0 ) {
				$available    = $capacity - $booked_count;
				$ratio_thresh = (int) ceil( $capacity * 0.3 );
				if ( $available <= 2 || $available <= $ratio_thresh ) {
					$availability = 'few_left';
				}
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
				'_is_closed'    => $is_closed, // 内部用: 集約時の closed 判定で使用。
			);
		}

		// 担当者非表示モード: 同じ (store_id, schedule_date, start_time, end_time) を統合する。
		if ( $aggregate_staff && ! empty( $out ) ) {
			$out = $this->aggregate_by_timeslot( $out );
		} else {
			// 通常モード: 内部フラグを除去して返す。
			foreach ( $out as &$row_ref ) {
				unset( $row_ref['_is_closed'] );
			}
			unset( $row_ref );
		}

		return rest_ensure_response(
			array(
				'date_from' => $date_from,
				'date_to'   => $date_to,
				'schedules' => $out,
			)
		);
	}

	/**
	 * 担当者非表示モード時、同一 (store_id, schedule_date, start_time, end_time) の枠を統合する。
	 *
	 * - capacity, booked_count は合算。
	 * - id は最も小さい id を代表として採用（フロントから返ってきた際にこの id をそのまま渡せばよい）。
	 * - staff_id は 0（統合枠を示す）。
	 * - availability は合算後の値で再判定。`closed` は構成枠すべてが closed のときのみ。
	 *
	 * @param array $rows get_availability の中間結果（各行に `_is_closed` を含む）。
	 * @return array 統合後の rows（`_is_closed` は除去済み）。
	 */
	private function aggregate_by_timeslot( $rows ) {
		$buckets = array();
		foreach ( $rows as $row ) {
			$key = (int) $row['store_id'] . '|' . (string) $row['schedule_date'] . '|' . (string) $row['start_time'] . '|' . (string) $row['end_time'];
			if ( ! isset( $buckets[ $key ] ) ) {
				$buckets[ $key ] = array(
					'id'            => (int) $row['id'],
					'store_id'      => (int) $row['store_id'],
					'staff_id'      => 0,
					'schedule_date' => (string) $row['schedule_date'],
					'start_time'    => (string) $row['start_time'],
					'end_time'      => (string) $row['end_time'],
					'capacity'      => (int) $row['capacity'],
					'booked_count'  => (int) $row['booked_count'],
					'_all_closed'   => ! empty( $row['_is_closed'] ),
				);
				continue;
			}
			$bucket                  = &$buckets[ $key ];
			$bucket['capacity']     += (int) $row['capacity'];
			$bucket['booked_count'] += (int) $row['booked_count'];
			// 代表 id は最小値を採用。
			if ( (int) $row['id'] < (int) $bucket['id'] ) {
				$bucket['id'] = (int) $row['id'];
			}
			// すべての構成枠が closed の場合のみ、統合枠を closed とする。
			if ( empty( $row['_is_closed'] ) ) {
				$bucket['_all_closed'] = false;
			}
			unset( $bucket );
		}

		$out = array();
		foreach ( $buckets as $bucket ) {
			$capacity     = (int) $bucket['capacity'];
			$booked_count = (int) $bucket['booked_count'];

			$availability = 'available';
			if ( ! empty( $bucket['_all_closed'] ) ) {
				$availability = 'closed';
			} elseif ( $capacity > 0 && $booked_count >= $capacity ) {
				$availability = 'full';
			} elseif ( $capacity > 0 ) {
				$available    = $capacity - $booked_count;
				$ratio_thresh = (int) ceil( $capacity * 0.3 );
				if ( $available <= 2 || $available <= $ratio_thresh ) {
					$availability = 'few_left';
				}
			}

			$out[] = array(
				'id'            => (int) $bucket['id'],
				'store_id'      => (int) $bucket['store_id'],
				'staff_id'      => 0,
				'schedule_date' => (string) $bucket['schedule_date'],
				'start_time'    => (string) $bucket['start_time'],
				'end_time'      => (string) $bucket['end_time'],
				'capacity'      => $capacity,
				'booked_count'  => $booked_count,
				'availability'  => $availability,
			);
		}
		return $out;
	}

	/**
	 * 表示条件が成立するか（＝そのフィールドが表示中か）を判定する。
	 *
	 * - condition_field_key が空/NULL のフィールドは常に表示（true）。
	 * - それ以外は、送信された親フィールドの値が condition_value と一致するときのみ true。
	 *   親は radio/select（文字列値）であることを前提とし、フロントの判定結果は一切信用せず
	 *   送信ペイロードから再評価する。
	 *
	 * @param array $def                 フィールド定義（condition_field_key / condition_value を含む）.
	 * @param array $custom_fields_input 送信されたカスタムフィールド入力.
	 * @return bool 表示中なら true。
	 */
	private function condition_met( array $def, array $custom_fields_input ) {
		$parent = isset( $def['condition_field_key'] ) ? (string) $def['condition_field_key'] : '';
		if ( '' === $parent ) {
			return true;
		}
		$parent_value = isset( $custom_fields_input[ $parent ] ) ? $custom_fields_input[ $parent ] : '';
		if ( is_array( $parent_value ) ) {
			// 親は radio/select ＝単一文字列値のみを想定。配列は不成立扱い。
			return false;
		}
		$expected = (string) ( isset( $def['condition_value'] ) ? $def['condition_value'] : '' );
		$actual   = (string) $parent_value;
		return $expected === $actual;
	}

	/**
	 * 予約作成 (フロント予約フォームから).
	 *
	 * spec 3.5 (初期フィールド: 氏名/メール/電話), 3.6 (確認画面からのPOST), 5.8 (アトミック競合防止), 5.10 (ハニーポット).
	 *
	 * 実装ポリシー:
	 *   - ハニーポットに値があれば 400 を返して保存しない（テスト容易性優先。
	 *     ボット側に検知方法を明かしたくない場合は 200 の静黙も選択肢だが、
	 *     E2E テスト・管理者への可視性の観点から 400 を採用）。
	 *   - customer_name / customer_email / customer_phone は必須。email は is_email() で検証。
	 *   - smart_booking_custom_fields の is_required=1 のフィールドが空なら 400。
	 *   - smart_booking_schedules に対しアトミック UPDATE (+1) を投げ、0 行影響なら 409 (満席).
	 *   - INSERT 失敗時は booked_count を -1 でロールバック.
	 *   - status は 'pending'（管理者承認運用）。
	 *   - schedule_date / schedule_time は schedules から取得して非正規化保存.
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_reservation( $request ) {
		global $wpdb;

		// ハニーポット: 空でなければボット判定してブロック。
		$honeypot = $request->get_param( 'honeypot' );
		if ( is_string( $honeypot ) && '' !== trim( $honeypot ) ) {
			return $this->error(
				'smb_reservation_spam_rejected',
				'送信エラーが発生しました。お手数ですが時間をおいて再度お試しください。',
				400
			);
		}

		// schedule_id 存在確認.
		$schedule_id = absint( $request->get_param( 'schedule_id' ) );
		if ( $schedule_id <= 0 ) {
			return $this->error( 'smb_reservation_schedule_required', 'ご希望の時間枠を選択してください。', 400 );
		}
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$schedule = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_schedules WHERE id = %d", $schedule_id ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $schedule || empty( $schedule['is_active'] ) ) {
			return $this->error( 'smb_reservation_schedule_not_found', '指定された時間枠は予約を受け付けていません。', 400 );
		}

		// 過去日 / 締切超過チェック (get_availability と同等のロジック).
		// phpcs:ignore WordPress.DateTime.CurrentTimeTimestamp.Requested -- サイトTZ基準の Unix 秒で日時計算するため明示的に timestamp を要求。
		$now_ts  = (int) current_time( 'timestamp' );
		$slot_ts = strtotime( $schedule['schedule_date'] . ' ' . $schedule['start_time'] );
		if ( false === $slot_ts || $slot_ts <= $now_ts ) {
			return $this->error( 'smb_reservation_closed', 'この時間枠は予約受付を終了しました。', 400 );
		}
		$deadline_days  = max( 0, (int) get_option( 'smart_booking_booking_deadline_days', 0 ) );
		$deadline_hours = max( 0, (int) get_option( 'smart_booking_booking_deadline_hours', 0 ) );
		if ( $deadline_days > 0 || $deadline_hours > 0 ) {
			$deadlines = array();
			if ( $deadline_days > 0 ) {
				$deadlines[] = $slot_ts - ( $deadline_days * DAY_IN_SECONDS );
			}
			if ( $deadline_hours > 0 ) {
				$deadlines[] = $slot_ts - ( $deadline_hours * HOUR_IN_SECONDS );
			}
			$deadline_ts = min( $deadlines );
			if ( $now_ts >= $deadline_ts ) {
				return $this->error( 'smb_reservation_deadline_passed', 'この時間枠は予約締切を過ぎました。', 400 );
			}
		}

		// 必須3フィールド.
		$name = sanitize_text_field( (string) $request->get_param( 'customer_name' ) );
		if ( '' === $name ) {
			return $this->error( 'smb_reservation_name_required', 'お名前を入力してください。', 400 );
		}
		$email_raw = (string) $request->get_param( 'customer_email' );
		$email     = sanitize_email( $email_raw );
		if ( '' === trim( $email_raw ) ) {
			return $this->error( 'smb_reservation_email_required', 'メールアドレスを入力してください。', 400 );
		}
		if ( '' === $email || ! is_email( $email ) ) {
			return $this->error( 'smb_reservation_email_invalid', '有効なメールアドレスを入力してください。', 400 );
		}
		$phone = sanitize_text_field( (string) $request->get_param( 'customer_phone' ) );
		if ( '' === $phone ) {
			return $this->error( 'smb_reservation_phone_required', '電話番号を入力してください。', 400 );
		}

		// カスタムフィールド必須チェック.
		// テーブル名は内部生成値。プレースホルダでは識別子を扱えないため interpolation で対応。
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$field_defs = $wpdb->get_results(
			"SELECT field_key, field_label, field_type, is_required, condition_field_key, condition_value FROM {$wpdb->prefix}smart_booking_custom_fields ORDER BY sort_order ASC, id ASC",
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! is_array( $field_defs ) ) {
			$field_defs = array();
		}

		$custom_fields_input = $request->get_param( 'custom_fields' );
		if ( ! is_array( $custom_fields_input ) ) {
			$custom_fields_input = array();
		}

		$core_keys = array( 'customer_name', 'customer_email', 'customer_phone' );
		foreach ( $field_defs as $def ) {
			$key = (string) $def['field_key'];
			if ( in_array( $key, $core_keys, true ) ) {
				continue;
			}
			// 表示条件が不成立（非表示）なら必須チェックをスキップ（表示中のみ必須）。
			if ( ! $this->condition_met( $def, $custom_fields_input ) ) {
				continue;
			}
			if ( empty( $def['is_required'] ) ) {
				continue;
			}
			$val = isset( $custom_fields_input[ $key ] ) ? $custom_fields_input[ $key ] : '';
			if ( is_array( $val ) ) {
				$empty = ( 0 === count(
					array_filter(
						$val,
						static function ( $v ) {
							return '' !== trim( (string) $v );
						}
					)
				) );
			} else {
				$empty = ( '' === trim( (string) $val ) );
			}
			if ( $empty ) {
				return $this->error(
					'smb_reservation_custom_field_required',
					sprintf( '「%s」は必須項目です。', (string) $def['field_label'] ),
					400
				);
			}
		}

		// 担当者非表示モード判定。OFF のときは同一時刻枠の他担当者にも空きを探しに行く。
		$show_staff_front = ( (int) get_option( 'smart_booking_show_staff_front', 0 ) ) ? 1 : 0;

		// アトミック UPDATE 対象の schedule_id を決定する。
		$now             = $this->now_mysql();
		$booked_schedule = $schedule;
		$booked_id       = $schedule_id;
		$affected        = 0;

		if ( 0 === $show_staff_front ) {
			// 同一 (store_id, schedule_date, start_time) の有効な担当者枠を sort_order 順に走査。
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$candidates = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT s.id FROM {$wpdb->prefix}smart_booking_schedules s
					INNER JOIN {$wpdb->prefix}smart_booking_staff st ON s.staff_id = st.id
					WHERE s.store_id = %d
						AND s.schedule_date = %s
						AND s.start_time = %s
						AND s.is_active = 1
						AND st.is_active = 1
					ORDER BY st.sort_order ASC, st.id ASC, s.id ASC",
					(int) $schedule['store_id'],
					(string) $schedule['schedule_date'],
					(string) $schedule['start_time']
				)
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			if ( ! is_array( $candidates ) || 0 === count( $candidates ) ) {
				// フォールバック: 受け取った schedule_id 自体に対して試す（候補抽出に失敗した想定外ケース）。
				$candidates = array( $schedule_id );
			}
			foreach ( $candidates as $cand_id ) {
				$cand_id = (int) $cand_id;
				if ( $cand_id <= 0 ) {
					continue;
				}
				// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$try = $wpdb->query(
					$wpdb->prepare(
						"UPDATE {$wpdb->prefix}smart_booking_schedules SET booked_count = booked_count + 1, updated_at = %s WHERE id = %d AND booked_count < capacity AND is_active = 1",
						$now,
						$cand_id
					)
				);
				// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				if ( (int) $try > 0 ) {
					$affected  = (int) $try;
					$booked_id = $cand_id;
					if ( $cand_id !== $schedule_id ) {
						// 採用枠の詳細を取り直す（store_id / schedule_date / start_time は同じだが staff_id が変わる）。
						// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
						$booked_schedule = $wpdb->get_row(
							$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_schedules WHERE id = %d", $cand_id ),
							ARRAY_A
						);
						// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					}
					break;
				}
			}
		} else {
			// 通常モード: 受け取った schedule_id でそのままアトミック UPDATE。
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$affected = (int) $wpdb->query(
				$wpdb->prepare(
					"UPDATE {$wpdb->prefix}smart_booking_schedules SET booked_count = booked_count + 1, updated_at = %s WHERE id = %d AND booked_count < capacity AND is_active = 1",
					$now,
					$schedule_id
				)
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		}

		if ( 0 === (int) $affected ) {
			return $this->error(
				'smb_reservation_full',
				'申し訳ございません。この時間枠は満席になりました。別の時間枠をお選びください。',
				409
			);
		}

		if ( ! is_array( $booked_schedule ) ) {
			// 想定外: 採用 schedule の取得に失敗 → ロールバック。
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query(
				$wpdb->prepare(
					"UPDATE {$wpdb->prefix}smart_booking_schedules SET booked_count = booked_count - 1 WHERE id = %d AND booked_count > 0",
					$booked_id
				)
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			return $this->error( 'smb_reservation_create_failed', '予約の保存に失敗しました。時間をおいて再度お試しください。', 500 );
		}

		// 予約 INSERT.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$ok = $wpdb->insert(
			$wpdb->prefix . 'smart_booking_reservations',
			array(
				'store_id'       => (int) $booked_schedule['store_id'],
				'staff_id'       => (int) $booked_schedule['staff_id'],
				'schedule_id'    => (int) $booked_schedule['id'],
				'schedule_date'  => $booked_schedule['schedule_date'],
				'schedule_time'  => $booked_schedule['start_time'],
				'customer_name'  => $name,
				'customer_email' => $email,
				'customer_phone' => $phone,
				'status'         => 'pending',
				'admin_memo'     => '',
				'created_at'     => $now,
				'updated_at'     => $now,
			),
			array( '%d', '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);

		if ( false === $ok ) {
			// ロールバック: 空き数を戻す.
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query(
				$wpdb->prepare(
					"UPDATE {$wpdb->prefix}smart_booking_schedules SET booked_count = booked_count - 1 WHERE id = %d AND booked_count > 0",
					$booked_id
				)
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			return $this->error( 'smb_reservation_create_failed', '予約の保存に失敗しました。時間をおいて再度お試しください。', 500 );
		}

		$reservation_id = (int) $wpdb->insert_id;

		// カスタムフィールドの入力値を meta に保存.
		foreach ( $field_defs as $def ) {
			$key = (string) $def['field_key'];
			if ( in_array( $key, $core_keys, true ) ) {
				continue;
			}
			// 表示条件が不成立（非表示）なら値を破棄（meta 行を作らない → CSV/予約詳細は空欄）。
			if ( ! $this->condition_met( $def, $custom_fields_input ) ) {
				continue;
			}
			$key_clean = sanitize_key( $key );
			if ( '' === $key_clean ) {
				continue;
			}
			if ( ! array_key_exists( $key, $custom_fields_input ) ) {
				continue;
			}
			$raw = $custom_fields_input[ $key ];
			if ( is_array( $raw ) ) {
				$clean_arr = array_values(
					array_map( 'sanitize_text_field', array_map( 'strval', $raw ) )
				);
				$value     = wp_json_encode( $clean_arr );
			} else {
				$value = sanitize_textarea_field( (string) $raw );
			}
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			$wpdb->insert(
				$wpdb->prefix . 'smart_booking_reservation_meta',
				array(
					'reservation_id' => $reservation_id,
					'meta_key'       => $key_clean,
					'meta_value'     => $value,
				),
				array( '%d', '%s', '%s' )
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		}

		// 店舗名・担当者名を引いて返す（完了画面で利用）. 採用された booked_schedule を参照する。
		// システムエンティティ（is_system=1）はユーザーに見えないため空文字で返す。
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$store_row = $wpdb->get_row(
			$wpdb->prepare( "SELECT name, is_system FROM {$wpdb->prefix}smart_booking_stores WHERE id = %d", (int) $booked_schedule['store_id'] ),
			ARRAY_A
		);
		$staff_row = $wpdb->get_row(
			$wpdb->prepare( "SELECT name, is_system FROM {$wpdb->prefix}smart_booking_staff WHERE id = %d", (int) $booked_schedule['staff_id'] ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$store_name = '';
		if ( is_array( $store_row ) ) {
			$store_name = ! empty( $store_row['is_system'] ) ? '' : (string) $store_row['name'];
		}
		$staff_name = '';
		if ( is_array( $staff_row ) ) {
			$staff_name = ! empty( $staff_row['is_system'] ) ? '' : (string) $staff_row['name'];
		}

		/**
		 * 予約受付時のフック。
		 *
		 * メール / ChatWork / Google Calendar 連携クラスが購読する。エラーは握り潰してもよい
		 * （連携失敗で予約自体を失敗扱いにはしない）。
		 *
		 * @param int $reservation_id 受け付けた予約 ID。
		 */
		do_action( 'smart_booking_reservation_received', $reservation_id );

		return rest_ensure_response(
			array(
				'id'                => $reservation_id,
				'schedule_date'     => (string) $booked_schedule['schedule_date'],
				'schedule_time'     => substr( (string) $booked_schedule['start_time'], 0, 5 ),
				'schedule_end_time' => substr( (string) $booked_schedule['end_time'], 0, 5 ),
				'store_name'        => $store_name,
				'staff_name'        => $staff_name,
				'status'            => 'pending',
			)
		);
	}
}
