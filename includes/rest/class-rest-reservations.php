<?php
/**
 * Smart Booking - REST: 予約 (/reservations)
 *
 * smart_booking_reservations テーブルに対する CRUD + CSV エクスポート。
 * 予約作成時は smart_booking_schedules へのアトミック UPDATE で空き枠確認＋更新を行う（spec 5.8）。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 予約エンドポイント。
 */
class Smart_Booking_REST_Reservations extends Smart_Booking_REST_Base {

	/**
	 * 有効なステータス値。
	 */
	const ALLOWED_STATUSES = array( 'pending', 'approved', 'cancelled' );

	/**
	 * ルート登録。
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/reservations',
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
			'/reservations/export/csv',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'export_csv' ),
				'permission_callback' => array( $this, 'permission_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/reservations/(?P<id>\d+)',
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
	 * 予約テーブル名。
	 *
	 * @return string
	 */
	private function table() {
		global $wpdb;
		return $wpdb->prefix . 'smart_booking_reservations';
	}

	/**
	 * 行をレスポンス整形 + メタ値付加.
	 *
	 * @param array $row       予約行.
	 * @param bool  $with_meta メタを含めるか.
	 * @return array
	 */
	private function format_row( $row, $with_meta = false ) {
		global $wpdb;

		// 関連エンティティの is_system フラグを取得（管理画面 React で表示制御に利用）。
		$store_is_system = 0;
		if ( ! empty( $row['store_id'] ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$flag            = $wpdb->get_var( $wpdb->prepare( "SELECT is_system FROM {$wpdb->prefix}smart_booking_stores WHERE id = %d", (int) $row['store_id'] ) );
			$store_is_system = ( null !== $flag && (int) $flag ) ? 1 : 0;
		}
		$staff_is_system = 0;
		if ( ! empty( $row['staff_id'] ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$flag            = $wpdb->get_var( $wpdb->prepare( "SELECT is_system FROM {$wpdb->prefix}smart_booking_staff WHERE id = %d", (int) $row['staff_id'] ) );
			$staff_is_system = ( null !== $flag && (int) $flag ) ? 1 : 0;
		}

		$data = array(
			'id'              => (int) $row['id'],
			'store_id'        => (int) $row['store_id'],
			'staff_id'        => (int) $row['staff_id'],
			'store_is_system' => $store_is_system,
			'staff_is_system' => $staff_is_system,
			'schedule_id'     => (int) $row['schedule_id'],
			'schedule_date'   => $row['schedule_date'],
			'schedule_time'   => $row['schedule_time'],
			'customer_name'   => $row['customer_name'],
			'customer_email'  => $row['customer_email'],
			'customer_phone'  => $row['customer_phone'],
			'status'          => $row['status'],
			'admin_memo'      => $row['admin_memo'],
			'created_at'      => $row['created_at'],
			'updated_at'      => $row['updated_at'],
		);
		if ( $with_meta ) {
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			$meta_rows = $wpdb->get_results(
				$wpdb->prepare( "SELECT meta_key, meta_value FROM {$wpdb->prefix}smart_booking_reservation_meta WHERE reservation_id = %d", (int) $row['id'] ),
				ARRAY_A
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			$meta = array();
			foreach ( $meta_rows as $m ) {
				$meta[ $m['meta_key'] ] = $m['meta_value'];
			}
			$data['meta'] = $meta;
		}
		return $data;
	}

	/**
	 * 一覧用フィルタクエリ構築。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return array{where: string, params: array}
	 */
	private function build_filter( $request ) {
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
		$status = (string) $request->get_param( 'status' );
		if ( in_array( $status, self::ALLOWED_STATUSES, true ) ) {
			$where[]  = 'status = %s';
			$params[] = $status;
		}
		$name = sanitize_text_field( (string) $request->get_param( 'customer_name' ) );
		if ( '' !== $name ) {
			global $wpdb;
			$where[]  = 'customer_name LIKE %s';
			$params[] = '%' . $wpdb->esc_like( $name ) . '%';
		}
		$email = sanitize_email( (string) $request->get_param( 'customer_email' ) );
		if ( '' !== $email ) {
			global $wpdb;
			$where[]  = 'customer_email LIKE %s';
			$params[] = '%' . $wpdb->esc_like( $email ) . '%';
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
		return array(
			'where'  => implode( ' AND ', $where ),
			'params' => $params,
		);
	}

	/**
	 * 一覧取得（ページネーション対応）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response
	 */
	public function get_items( $request ) {
		global $wpdb;
		$filter = $this->build_filter( $request );

		$orderby = (string) $request->get_param( 'orderby' );
		$allowed = array( 'id', 'schedule_date', 'schedule_time', 'customer_name', 'status', 'created_at' );
		if ( ! in_array( $orderby, $allowed, true ) ) {
			$orderby = 'schedule_date';
		}
		$order    = strtoupper( (string) $request->get_param( 'order' ) );
		$order    = ( 'ASC' === $order ) ? 'ASC' : 'DESC';
		$per_page = max( 1, min( 500, (int) $request->get_param( 'per_page' ) ? (int) $request->get_param( 'per_page' ) : 20 ) );
		$page     = max( 1, (int) $request->get_param( 'page' ) ? (int) $request->get_param( 'page' ) : 1 );
		$offset   = ( $page - 1 ) * $per_page;

		$sql    = "SELECT * FROM {$wpdb->prefix}smart_booking_reservations WHERE {$filter['where']} ORDER BY {$orderby} {$order}, id DESC LIMIT %d OFFSET %d";
		$params = array_merge( $filter['params'], array( $per_page, $offset ) );
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, PluginCheck.Security.DirectDB.UnescapedDBParameter
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $params ), ARRAY_A );
		if ( ! is_array( $rows ) ) {
			$rows = array();
		}

		// 総件数.
		$count_sql = "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_reservations WHERE {$filter['where']}";
		if ( ! empty( $filter['params'] ) ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, PluginCheck.Security.DirectDB.UnescapedDBParameter
			$total = (int) $wpdb->get_var( $wpdb->prepare( $count_sql, $filter['params'] ) );
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter
			$total = (int) $wpdb->get_var( $count_sql );
		}

		return rest_ensure_response(
			array(
				'items'    => array_map(
					function ( $r ) {
						return $this->format_row( $r, false );
					},
					$rows
				),
				'total'    => $total,
				'page'     => $page,
				'per_page' => $per_page,
			)
		);
	}

	/**
	 * 単一取得（メタ値含む）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_item( $request ) {
		global $wpdb;
		$id = (int) $request['id'];
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_reservations WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_reservation_not_found', '指定された予約が見つかりません。', 404 );
		}
		return rest_ensure_response( $this->format_row( $row, true ) );
	}

	/**
	 * 手動予約作成。spec 5.8 のアトミック UPDATE で満席判定。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_item( $request ) {
		global $wpdb;

		$schedule_id = absint( $request->get_param( 'schedule_id' ) );
		if ( $schedule_id <= 0 ) {
			return $this->error( 'smb_reservation_schedule_required', 'スケジュールを指定してください。', 400 );
		}
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$schedule = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_schedules WHERE id = %d", $schedule_id ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $schedule ) {
			return $this->error( 'smb_reservation_schedule_not_found', '指定されたスケジュールが見つかりません。', 404 );
		}
		if ( empty( $schedule['is_active'] ) ) {
			return $this->error( 'smb_reservation_schedule_inactive', 'このスケジュールは予約を受け付けていません。', 400 );
		}

		$name = sanitize_text_field( (string) $request->get_param( 'customer_name' ) );
		if ( '' === $name ) {
			return $this->error( 'smb_reservation_name_required', '予約者氏名を入力してください。', 400 );
		}
		$email = sanitize_email( (string) $request->get_param( 'customer_email' ) );
		if ( '' === $email || ! is_email( $email ) ) {
			return $this->error( 'smb_reservation_email_invalid', '有効なメールアドレスを入力してください。', 400 );
		}
		$phone = sanitize_text_field( (string) $request->get_param( 'customer_phone' ) );

		$status_in = (string) $request->get_param( 'status' );
		$status    = in_array( $status_in, self::ALLOWED_STATUSES, true ) ? $status_in : 'approved';
		$memo      = sanitize_textarea_field( (string) $request->get_param( 'admin_memo' ) );

		// アトミック: booked_count < capacity を満たすときだけ +1.
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$affected = $wpdb->query(
			$wpdb->prepare(
				"UPDATE {$wpdb->prefix}smart_booking_schedules SET booked_count = booked_count + 1, updated_at = %s WHERE id = %d AND booked_count < capacity AND is_active = 1",
				$this->now_mysql(),
				$schedule_id
			)
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		if ( 0 === (int) $affected ) {
			return $this->error(
				'smb_reservation_full',
				'この時間枠は満席です。別の時間枠を選択してください。',
				409
			);
		}

		$now = $this->now_mysql();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$ok = $wpdb->insert(
			$wpdb->prefix . 'smart_booking_reservations',
			array(
				'store_id'       => (int) $schedule['store_id'],
				'staff_id'       => (int) $schedule['staff_id'],
				'schedule_id'    => (int) $schedule['id'],
				'schedule_date'  => $schedule['schedule_date'],
				'schedule_time'  => $schedule['start_time'],
				'customer_name'  => $name,
				'customer_email' => $email,
				'customer_phone' => $phone,
				'status'         => $status,
				'admin_memo'     => $memo,
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
					$schedule_id
				)
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			return $this->error( 'smb_reservation_create_failed', '予約の作成に失敗しました。', 500 );
		}

		$id = (int) $wpdb->insert_id;

		// カスタムフィールド入力値を保存.
		$meta = $request->get_param( 'meta' );
		if ( is_array( $meta ) ) {
			foreach ( $meta as $key => $value ) {
				$key_clean   = sanitize_key( (string) $key );
				$value_clean = is_array( $value ) ? wp_json_encode( $value ) : sanitize_textarea_field( (string) $value );
				if ( '' === $key_clean ) {
					continue;
				}
				// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				$wpdb->insert(
					$wpdb->prefix . 'smart_booking_reservation_meta',
					array(
						'reservation_id' => $id,
						'meta_key'       => $key_clean,
						'meta_value'     => $value_clean,
					),
					array( '%d', '%s', '%s' )
				);
				// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			}
		}

		// 連携クラス（メール / ChatWork / Google カレンダー）が購読する受付フックを発火。
		// 管理画面からの手動作成でもフロント送信と同じ後続処理を走らせる。
		/** @param int $id */
		do_action( 'smart_booking_reservation_received', $id );

		$request->set_param( 'id', $id );
		return $this->get_item( $request );
	}

	/**
	 * 更新（ステータス変更 + admin_memo 更新のみ）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_item( $request ) {
		global $wpdb;
		$id = (int) $request['id'];
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_reservations WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_reservation_not_found', '指定された予約が見つかりません。', 404 );
		}

		$update = array();
		$format = array();

		if ( null !== $request->get_param( 'status' ) ) {
			$new_status = (string) $request->get_param( 'status' );
			if ( ! in_array( $new_status, self::ALLOWED_STATUSES, true ) ) {
				return $this->error( 'smb_reservation_status_invalid', 'ステータスの値が不正です。', 400 );
			}
			$update['status'] = $new_status;
			$format[]         = '%s';

			// pending/approved → cancelled へ変更したらスケジュール空き数を戻す。
			if ( 'cancelled' === $new_status && 'cancelled' !== $row['status'] && (int) $row['schedule_id'] > 0 ) {
				// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$wpdb->query(
					$wpdb->prepare(
						"UPDATE {$wpdb->prefix}smart_booking_schedules SET booked_count = GREATEST(booked_count - 1, 0) WHERE id = %d",
						(int) $row['schedule_id']
					)
				);
				// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			}
			// cancelled → pending/approved へ復活した場合は枠を再取得。
			if ( 'cancelled' === $row['status'] && 'cancelled' !== $new_status && (int) $row['schedule_id'] > 0 ) {
				// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$affected = $wpdb->query(
					$wpdb->prepare(
						"UPDATE {$wpdb->prefix}smart_booking_schedules SET booked_count = booked_count + 1 WHERE id = %d AND booked_count < capacity",
						(int) $row['schedule_id']
					)
				);
				// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				if ( 0 === (int) $affected ) {
					return $this->error(
						'smb_reservation_full',
						'この時間枠は満席のため、予約を復活できません。',
						409
					);
				}
			}
		}

		if ( null !== $request->get_param( 'admin_memo' ) ) {
			$update['admin_memo'] = sanitize_textarea_field( (string) $request->get_param( 'admin_memo' ) );
			$format[]             = '%s';
		}

		if ( empty( $update ) ) {
			return $this->get_item( $request );
		}
		$update['updated_at'] = $this->now_mysql();
		$format[]             = '%s';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update( $wpdb->prefix . 'smart_booking_reservations', $update, array( 'id' => $id ), $format, array( '%d' ) );

		// ステータス遷移ベースのフック発火（連携クラスが購読）。
		if ( isset( $update['status'] ) ) {
			$old = (string) $row['status'];
			$new = (string) $update['status'];
			if ( 'approved' === $new && 'approved' !== $old ) {
				/** @param int $id */
				do_action( 'smart_booking_reservation_approved', $id );
			}
			if ( 'cancelled' === $new && 'cancelled' !== $old ) {
				/** @param int $id */
				do_action( 'smart_booking_reservation_cancelled', $id );
			}
		}

		$request->set_param( 'id', $id );
		return $this->get_item( $request );
	}

	/**
	 * 削除。スケジュールの booked_count をデクリメント。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_item( $request ) {
		global $wpdb;
		$id = (int) $request['id'];

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_reservations WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_reservation_not_found', '指定された予約が見つかりません。', 404 );
		}

		if ( (int) $row['schedule_id'] > 0 && 'cancelled' !== $row['status'] ) {
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query(
				$wpdb->prepare(
					"UPDATE {$wpdb->prefix}smart_booking_schedules SET booked_count = GREATEST(booked_count - 1, 0) WHERE id = %d",
					(int) $row['schedule_id']
				)
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		}

		// 削除前にキャンセル相当のフックを発火（連携クラスが Google Calendar 等を後始末する）。
		// ステータスが既に cancelled なら重複発火しない。
		if ( 'cancelled' !== (string) $row['status'] ) {
			/** @param int $id */
			do_action( 'smart_booking_reservation_cancelled', $id );
		}

		// メタも削除.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete( $wpdb->prefix . 'smart_booking_reservation_meta', array( 'reservation_id' => $id ), array( '%d' ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete( $wpdb->prefix . 'smart_booking_reservations', array( 'id' => $id ), array( '%d' ) );

		return rest_ensure_response(
			array(
				'deleted' => true,
				'id'      => $id,
			)
		);
	}

	/**
	 * CSV エクスポート。UTF-8 BOM 付きで Excel 文字化け対策。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function export_csv( $request ) {
		global $wpdb;
		$filter = $this->build_filter( $request );

		$sql = "SELECT * FROM {$wpdb->prefix}smart_booking_reservations WHERE {$filter['where']} ORDER BY schedule_date ASC, schedule_time ASC, id ASC";
		if ( ! empty( $filter['params'] ) ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, PluginCheck.Security.DirectDB.UnescapedDBParameter
			$rows = $wpdb->get_results( $wpdb->prepare( $sql, $filter['params'] ), ARRAY_A );
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter
			$rows = $wpdb->get_results( $sql, ARRAY_A );
		}
		if ( ! is_array( $rows ) ) {
			$rows = array();
		}

		// 店舗名・担当者名を引く（表示用）.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$stores = $wpdb->get_results( "SELECT id, name, is_system FROM {$wpdb->prefix}smart_booking_stores", OBJECT_K );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$staff = $wpdb->get_results( "SELECT id, name, is_system FROM {$wpdb->prefix}smart_booking_staff", OBJECT_K );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$fields = $wpdb->get_results( "SELECT field_key, field_label, field_type FROM {$wpdb->prefix}smart_booking_custom_fields ORDER BY sort_order ASC", ARRAY_A );

		// 列を (label, meta_key) エントリのリストに一般化する。
		// address 型は 1フィールド = 2列（郵便番号 / 住所）。他は 1列。
		// 列は常時出力（条件フィールドで非表示だった行は meta 無し → 空欄）。
		$core_fields   = array( 'customer_name', 'customer_email', 'customer_phone' );
		$extra_columns = array();
		foreach ( $fields as $f ) {
			if ( in_array( $f['field_key'], $core_fields, true ) ) {
				continue;
			}
			$ftype = isset( $f['field_type'] ) ? (string) $f['field_type'] : '';
			if ( 'address' === $ftype ) {
				$extra_columns[] = array(
					'label'    => $f['field_label'] . '（郵便番号）',
					'meta_key' => $f['field_key'] . '_zip',
				);
				$extra_columns[] = array(
					'label'    => $f['field_label'] . '（住所）',
					'meta_key' => $f['field_key'] . '_address',
				);
			} else {
				$extra_columns[] = array(
					'label'    => $f['field_label'],
					'meta_key' => $f['field_key'],
				);
			}
		}
		$extra_labels = array();
		foreach ( $extra_columns as $col ) {
			$extra_labels[] = $col['label'];
		}

		// レスポンスをダウンロードとして返す。
		$filename = 'reservations-' . gmdate( 'Ymd-His' ) . '.csv';

		$status_labels = array(
			'pending'   => '承認待ち',
			'approved'  => '承認済み',
			'cancelled' => 'キャンセル',
		);

		$header = array_merge(
			array( '予約番号', '予約日', '予約時間', '予約者名', 'メール', '電話', '店舗', '担当者', 'ステータス', '作成日時' ),
			$extra_labels
		);

		$lines   = array();
		$lines[] = $this->csv_encode_row( $header );

		foreach ( $rows as $r ) {
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			$meta_rows = $wpdb->get_results(
				$wpdb->prepare( "SELECT meta_key, meta_value FROM {$wpdb->prefix}smart_booking_reservation_meta WHERE reservation_id = %d", (int) $r['id'] ),
				ARRAY_A
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			$meta_map = array();
			foreach ( $meta_rows as $m ) {
				$meta_map[ $m['meta_key'] ] = $m['meta_value'];
			}

			// is_system=1 のエンティティはユーザーには見えないため CSV でも「-」で出力する。
			$store_obj  = isset( $stores[ (int) $r['store_id'] ] ) ? $stores[ (int) $r['store_id'] ] : null;
			$store_name = '';
			if ( $store_obj ) {
				$store_name = ! empty( $store_obj->is_system ) ? '-' : (string) $store_obj->name;
			}
			$staff_obj  = isset( $staff[ (int) $r['staff_id'] ] ) ? $staff[ (int) $r['staff_id'] ] : null;
			$staff_name = '';
			if ( $staff_obj ) {
				$staff_name = ! empty( $staff_obj->is_system ) ? '-' : (string) $staff_obj->name;
			}
			$status     = isset( $status_labels[ $r['status'] ] ) ? $status_labels[ $r['status'] ] : $r['status'];

			$row_values = array(
				(string) $r['id'],
				$r['schedule_date'],
				substr( (string) $r['schedule_time'], 0, 5 ),
				$r['customer_name'],
				$r['customer_email'],
				$r['customer_phone'],
				$store_name,
				$staff_name,
				$status,
				$r['created_at'],
			);
			foreach ( $extra_columns as $col ) {
				$k            = $col['meta_key'];
				$row_values[] = isset( $meta_map[ $k ] ) ? $meta_map[ $k ] : '';
			}

			$lines[] = $this->csv_encode_row( $row_values );
		}

		$body = "\xEF\xBB\xBF" . implode( "\r\n", $lines ) . "\r\n";

		// REST サーバの自動 JSON シリアライズを回避し、CSV 本文を直接出力する。
		add_filter(
			'rest_pre_serve_request',
			function ( $served, $result, $req ) use ( $body, $filename ) {
				if ( '/smart-booking/v1/reservations/export/csv' !== $req->get_route() ) {
					return $served;
				}
				if ( ! headers_sent() ) {
					header( 'Content-Type: text/csv; charset=UTF-8' );
					header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
				}
				echo $body; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				return true;
			},
			10,
			3
		);

		return new WP_REST_Response( null, 200 );
	}

	/**
	 * CSV 1行エンコード（RFC 4180 ベース）。
	 *
	 * @param array $values 値配列.
	 * @return string
	 */
	private function csv_encode_row( $values ) {
		$escaped = array_map(
			static function ( $v ) {
				$s = (string) $v;
				// 先頭が =,+,-,@ で始まる場合は CSV インジェクション対策で ' を付与。
				if ( '' !== $s && in_array( $s[0], array( '=', '+', '-', '@' ), true ) ) {
					$s = "'" . $s;
				}
				if ( false !== strpos( $s, '"' ) || false !== strpos( $s, ',' ) || false !== strpos( $s, "\n" ) || false !== strpos( $s, "\r" ) ) {
					$s = '"' . str_replace( '"', '""', $s ) . '"';
				}
				return $s;
			},
			$values
		);
		return implode( ',', $escaped );
	}
}
