<?php
/**
 * Smart Booking - REST: スケジュール (/schedules)
 *
 * smb_schedules テーブルに対する CRUD + コピー。
 * POST /schedules は配列での一括登録にも対応する（スケジュール追加モーダルの「時間枠追加」対応）。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * スケジュールエンドポイント。
 */
class Smart_Booking_REST_Schedules extends Smart_Booking_REST_Base {

	/**
	 * ルート登録。
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/schedules',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_items' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_item' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/schedules/copy',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'copy_schedules' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/schedules/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_item' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_item' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_item' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
			)
		);
	}

	/**
	 * スケジュールテーブル名。
	 *
	 * @return string
	 */
	private function table() {
		global $wpdb;
		return $wpdb->prefix . 'smb_schedules';
	}

	/**
	 * レスポンス用整形。
	 *
	 * @param array $row DB 行.
	 * @return array
	 */
	private function format_row( $row ) {
		return array(
			'id'            => (int) $row['id'],
			'store_id'      => (int) $row['store_id'],
			'staff_id'      => (int) $row['staff_id'],
			'schedule_date' => $row['schedule_date'],
			'start_time'    => $row['start_time'],
			'end_time'      => $row['end_time'],
			'capacity'      => (int) $row['capacity'],
			'booked_count'  => (int) $row['booked_count'],
			'is_active'     => (int) $row['is_active'] ? 1 : 0,
			'created_at'    => $row['created_at'],
			'updated_at'    => $row['updated_at'],
		);
	}

	/**
	 * 一覧取得。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_items( $request ) {
		global $wpdb;
		$table = $this->table();

		$where  = array( '1=1' );
		$params = array();
		if ( $request->get_param( 'store_id' ) ) {
			$where[]  = 'store_id = %d';
			$params[] = absint( $request->get_param( 'store_id' ) );
		}
		if ( $request->get_param( 'staff_id' ) ) {
			$where[]  = 'staff_id = %d';
			$params[] = absint( $request->get_param( 'staff_id' ) );
		}
		$from = $this->sanitize_date_string( (string) $request->get_param( 'date_from' ) );
		if ( $from ) {
			$where[]  = 'schedule_date >= %s';
			$params[] = $from;
		}
		$to = $this->sanitize_date_string( (string) $request->get_param( 'date_to' ) );
		if ( $to ) {
			$where[]  = 'schedule_date <= %s';
			$params[] = $to;
		}

		$sql = "SELECT * FROM {$table} WHERE " . implode( ' AND ', $where ) . ' ORDER BY schedule_date ASC, start_time ASC';
		if ( ! empty( $params ) ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$rows = $wpdb->get_results( $wpdb->prepare( $sql, $params ), ARRAY_A );
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results( $sql, ARRAY_A );
		}
		if ( ! is_array( $rows ) ) {
			$rows = array();
		}
		return rest_ensure_response( array_map( array( $this, 'format_row' ), $rows ) );
	}

	/**
	 * 単一取得。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_item( $request ) {
		global $wpdb;
		$id = (int) $request['id'];
		$t  = $this->table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_schedule_not_found', '指定されたスケジュールが見つかりません。', 404 );
		}
		return rest_ensure_response( $this->format_row( $row ) );
	}

	/**
	 * スケジュール1件のサニタイズ。
	 *
	 * @param array $input 入力配列.
	 * @return array|WP_Error
	 */
	private function sanitize_one( $input ) {
		if ( ! is_array( $input ) ) {
			return $this->error( 'smb_schedule_invalid', 'スケジュールのデータ形式が正しくありません。', 400 );
		}
		$store_id = isset( $input['store_id'] ) ? absint( $input['store_id'] ) : 0;
		$staff_id = isset( $input['staff_id'] ) ? absint( $input['staff_id'] ) : 0;
		$date     = $this->sanitize_date_string( isset( $input['schedule_date'] ) ? (string) $input['schedule_date'] : '' );
		$start    = $this->sanitize_time_string( isset( $input['start_time'] ) ? (string) $input['start_time'] : '' );
		$end      = $this->sanitize_time_string( isset( $input['end_time'] ) ? (string) $input['end_time'] : '' );
		$capacity = isset( $input['capacity'] ) ? (int) $input['capacity'] : 1;

		if ( $store_id <= 0 ) {
			return $this->error( 'smb_schedule_store_required', '店舗を選択してください。', 400 );
		}
		if ( $staff_id <= 0 ) {
			return $this->error( 'smb_schedule_staff_required', '担当者を選択してください。', 400 );
		}
		if ( null === $date ) {
			return $this->error( 'smb_schedule_date_invalid', '日付の形式が正しくありません（YYYY-MM-DD）。', 400 );
		}
		if ( null === $start || null === $end ) {
			return $this->error( 'smb_schedule_time_invalid', '時刻の形式が正しくありません（HH:MM）。', 400 );
		}
		if ( strcmp( $start, $end ) >= 0 ) {
			return $this->error( 'smb_schedule_time_range', '終了時刻は開始時刻より後にしてください。', 400 );
		}
		if ( $capacity < 1 ) {
			$capacity = 1;
		}

		return array(
			'store_id'      => $store_id,
			'staff_id'      => $staff_id,
			'schedule_date' => $date,
			'start_time'    => $start,
			'end_time'      => $end,
			'capacity'      => $capacity,
			'booked_count'  => 0,
			'is_active'     => ( isset( $input['is_active'] ) ? (int) $input['is_active'] : 1 ) ? 1 : 0,
		);
	}

	/**
	 * 作成（単一 or 配列）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_item( $request ) {
		global $wpdb;
		$items = $request->get_param( 'items' );
		if ( is_array( $items ) && ! empty( $items ) ) {
			$batch = $items;
		} else {
			$batch = array( $request->get_json_params() ? $request->get_json_params() : $request->get_params() );
		}

		$created_ids = array();
		$now         = $this->now_mysql();

		foreach ( $batch as $one ) {
			$data = $this->sanitize_one( $one );
			if ( is_wp_error( $data ) ) {
				// 失敗しても作成済みは残す（PARTIAL 成功）。メッセージで通知。
				return $this->error(
					$data->get_error_code(),
					$data->get_error_message() . ( count( $created_ids ) > 0 ? sprintf( '（%d 件は作成済み）', count( $created_ids ) ) : '' ),
					400
				);
			}
			$data['created_at'] = $now;
			$data['updated_at'] = $now;
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$this->table(),
				$data,
				array( '%d', '%d', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s' )
			);
			$created_ids[] = (int) $wpdb->insert_id;
		}

		return rest_ensure_response(
			array(
				'created' => count( $created_ids ),
				'ids'     => $created_ids,
			)
		);
	}

	/**
	 * 更新（start_time, end_time, capacity, is_active のみ）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_item( $request ) {
		global $wpdb;
		$id = (int) $request['id'];
		$t  = $this->table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_schedule_not_found', '指定されたスケジュールが見つかりません。', 404 );
		}

		$update = array();
		$format = array();

		if ( null !== $request->get_param( 'start_time' ) ) {
			$v = $this->sanitize_time_string( (string) $request->get_param( 'start_time' ) );
			if ( null === $v ) {
				return $this->error( 'smb_schedule_time_invalid', '開始時刻の形式が正しくありません。', 400 );
			}
			$update['start_time'] = $v;
			$format[]             = '%s';
		}
		if ( null !== $request->get_param( 'end_time' ) ) {
			$v = $this->sanitize_time_string( (string) $request->get_param( 'end_time' ) );
			if ( null === $v ) {
				return $this->error( 'smb_schedule_time_invalid', '終了時刻の形式が正しくありません。', 400 );
			}
			$update['end_time'] = $v;
			$format[]           = '%s';
		}
		if ( null !== $request->get_param( 'capacity' ) ) {
			$cap                = max( 1, (int) $request->get_param( 'capacity' ) );
			$update['capacity'] = $cap;
			$format[]           = '%d';
		}
		if ( null !== $request->get_param( 'is_active' ) ) {
			$update['is_active'] = $request->get_param( 'is_active' ) ? 1 : 0;
			$format[]            = '%d';
		}

		if ( empty( $update ) ) {
			return $this->get_item( $request );
		}

		// capacity < booked_count となる更新は拒否。
		if ( isset( $update['capacity'] ) && $update['capacity'] < (int) $row['booked_count'] ) {
			return $this->error(
				'smb_schedule_capacity_too_low',
				'既存の予約数より少ない定員には変更できません。',
				400
			);
		}

		$update['updated_at'] = $this->now_mysql();
		$format[]             = '%s';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update( $t, $update, array( 'id' => $id ), $format, array( '%d' ) );
		$request->set_param( 'id', $id );
		return $this->get_item( $request );
	}

	/**
	 * 削除。予約紐付きがあれば警告を返す（デフォルト拒否。force=true なら強制）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_item( $request ) {
		global $wpdb;
		$id           = (int) $request['id'];
		$t            = $this->table();
		$reservations = $wpdb->prefix . 'smb_reservations';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$exists = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$t} WHERE id = %d", $id ) );
		if ( 0 === $exists ) {
			return $this->error( 'smb_schedule_not_found', '指定されたスケジュールが見つかりません。', 404 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$used = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$reservations} WHERE schedule_id = %d", $id ) );
		if ( $used > 0 && ! $request->get_param( 'force' ) ) {
			return $this->error(
				'smb_schedule_has_reservations',
				sprintf( 'このスケジュールには %d 件の予約が紐づいています。削除すると予約も参照できなくなります。', $used ),
				409
			);
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete( $t, array( 'id' => $id ), array( '%d' ) );
		return rest_ensure_response(
			array(
				'deleted' => true,
				'id'      => $id,
			)
		);
	}

	/**
	 * スケジュールコピー。
	 *
	 * リクエスト: {
	 *   source_date: 'YYYY-MM-DD',
	 *   store_id?: int,      // 指定なしなら同日の全店舗・全担当者をコピー対象
	 *   staff_id?: int,
	 *   target_dates: ['YYYY-MM-DD', ...],
	 *   overwrite: bool      // true の場合、同日の既存スケジュールを削除してから挿入
	 * }
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function copy_schedules( $request ) {
		global $wpdb;
		$t = $this->table();

		$source_date = $this->sanitize_date_string( (string) $request->get_param( 'source_date' ) );
		if ( ! $source_date ) {
			return $this->error( 'smb_copy_source_invalid', 'コピー元の日付が正しくありません。', 400 );
		}

		$target_dates_raw = $request->get_param( 'target_dates' );
		if ( ! is_array( $target_dates_raw ) || empty( $target_dates_raw ) ) {
			return $this->error( 'smb_copy_targets_required', 'コピー先の日付を1件以上指定してください。', 400 );
		}

		$target_dates = array();
		foreach ( $target_dates_raw as $d ) {
			$clean = $this->sanitize_date_string( (string) $d );
			if ( $clean && $clean !== $source_date ) {
				$target_dates[ $clean ] = true;
			}
		}
		$target_dates = array_keys( $target_dates );
		if ( empty( $target_dates ) ) {
			return $this->error( 'smb_copy_targets_invalid', '有効なコピー先日付がありません。', 400 );
		}

		$overwrite = (bool) $request->get_param( 'overwrite' );

		// コピー元スケジュールを取得。
		$where  = array( 'schedule_date = %s' );
		$params = array( $source_date );
		if ( $request->get_param( 'store_id' ) ) {
			$where[]  = 'store_id = %d';
			$params[] = absint( $request->get_param( 'store_id' ) );
		}
		if ( $request->get_param( 'staff_id' ) ) {
			$where[]  = 'staff_id = %d';
			$params[] = absint( $request->get_param( 'staff_id' ) );
		}
		$sql = "SELECT * FROM {$t} WHERE " . implode( ' AND ', $where );
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$sources = $wpdb->get_results( $wpdb->prepare( $sql, $params ), ARRAY_A );
		if ( empty( $sources ) ) {
			return $this->error( 'smb_copy_no_source', 'コピー元のスケジュールが見つかりません。', 404 );
		}

		$now               = $this->now_mysql();
		$inserted_total    = 0;
		$skipped_total     = 0;
		$overwritten_total = 0;

		foreach ( $target_dates as $date ) {
			// 既存確認.
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$existing = (int) $wpdb->get_var(
				$wpdb->prepare( "SELECT COUNT(*) FROM {$t} WHERE schedule_date = %s", $date )
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared

			if ( $existing > 0 && ! $overwrite ) {
				$skipped_total += $existing;
				continue;
			}

			if ( $existing > 0 && $overwrite ) {
				// 既存の booked_count > 0 の枠は保護。
				// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$wpdb->query(
					$wpdb->prepare(
						"DELETE FROM {$t} WHERE schedule_date = %s AND booked_count = 0",
						$date
					)
				);
				// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$overwritten_total += $existing;
			}

			foreach ( $sources as $src ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->insert(
					$t,
					array(
						'store_id'      => (int) $src['store_id'],
						'staff_id'      => (int) $src['staff_id'],
						'schedule_date' => $date,
						'start_time'    => $src['start_time'],
						'end_time'      => $src['end_time'],
						'capacity'      => (int) $src['capacity'],
						'booked_count'  => 0,
						'is_active'     => (int) $src['is_active'],
						'created_at'    => $now,
						'updated_at'    => $now,
					),
					array( '%d', '%d', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s' )
				);
				++$inserted_total;
			}
		}

		return rest_ensure_response(
			array(
				'inserted'    => $inserted_total,
				'skipped'     => $skipped_total,
				'overwritten' => $overwritten_total,
			)
		);
	}
}
