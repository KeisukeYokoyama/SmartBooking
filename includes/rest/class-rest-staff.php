<?php
/**
 * Smart Booking - REST: 担当者 (/staff)
 *
 * smb_staff テーブルに対する CRUD。
 * 予約が紐づいている担当者は削除不可（409 Conflict）。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 担当者エンドポイント。
 */
class Smart_Booking_REST_Staff extends Smart_Booking_REST_Base {

	/**
	 * ルート登録。
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/staff',
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
			'/staff/(?P<id>\d+)',
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
	 * テーブル名を取得する。
	 *
	 * @return string
	 */
	private function table() {
		global $wpdb;
		return $wpdb->prefix . 'smb_staff';
	}

	/**
	 * 行を整形する。
	 *
	 * @param array $row DB 行.
	 * @return array
	 */
	private function format_row( $row ) {
		$image_url = '';
		if ( ! empty( $row['image_id'] ) ) {
			$url = wp_get_attachment_image_url( (int) $row['image_id'], 'medium' );
			if ( $url ) {
				$image_url = $url;
			}
		}
		return array(
			'id'          => (int) $row['id'],
			'store_id'    => (int) $row['store_id'],
			'name'        => $row['name'],
			'email'       => $row['email'],
			'phone'       => $row['phone'],
			'description' => $row['description'],
			'image_id'    => (int) $row['image_id'],
			'image_url'   => $image_url,
			'is_active'   => (int) $row['is_active'] ? 1 : 0,
			'sort_order'  => (int) $row['sort_order'],
			'created_at'  => $row['created_at'],
			'updated_at'  => $row['updated_at'],
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

		if ( null !== $request->get_param( 'is_active' ) ) {
			$where[]  = 'is_active = %d';
			$params[] = (int) $request->get_param( 'is_active' ) ? 1 : 0;
		}
		if ( $request->get_param( 'store_id' ) ) {
			$where[]  = 'store_id = %d';
			$params[] = absint( $request->get_param( 'store_id' ) );
		}

		$sql = "SELECT * FROM {$table} WHERE " . implode( ' AND ', $where ) . ' ORDER BY sort_order ASC, id ASC';
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
		$id    = (int) $request['id'];
		$table = $this->table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_staff_not_found', '指定された担当者が見つかりません。', 404 );
		}
		return rest_ensure_response( $this->format_row( $row ) );
	}

	/**
	 * 入力値をサニタイズ + store_id の整合性チェック。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return array|WP_Error
	 */
	private function sanitize_input( $request ) {
		global $wpdb;
		$stores_table = $wpdb->prefix . 'smb_stores';

		$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
		if ( '' === $name ) {
			return $this->error( 'smb_staff_name_required', '担当者名を入力してください。', 400 );
		}

		$store_id = absint( $request->get_param( 'store_id' ) );
		if ( 0 === $store_id ) {
			return $this->error( 'smb_staff_store_required', '所属店舗を選択してください。', 400 );
		}
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$store_exists = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$stores_table} WHERE id = %d", $store_id ) );
		if ( 0 === $store_exists ) {
			return $this->error( 'smb_staff_store_invalid', '指定された所属店舗が存在しません。', 400 );
		}

		$email = sanitize_email( (string) $request->get_param( 'email' ) );
		if ( '' !== $email && ! is_email( $email ) ) {
			return $this->error( 'smb_staff_email_invalid', 'メールアドレスの形式が正しくありません。', 400 );
		}

		return array(
			'store_id'    => $store_id,
			'name'        => $name,
			'email'       => $email,
			'phone'       => sanitize_text_field( (string) $request->get_param( 'phone' ) ),
			'description' => sanitize_textarea_field( (string) $request->get_param( 'description' ) ),
			'image_id'    => absint( $request->get_param( 'image_id' ) ),
			'is_active'   => $request->get_param( 'is_active' ) ? 1 : 0,
			'sort_order'  => (int) $request->get_param( 'sort_order' ),
		);
	}

	/**
	 * 作成。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_item( $request ) {
		global $wpdb;
		$data = $this->sanitize_input( $request );
		if ( is_wp_error( $data ) ) {
			return $data;
		}

		$now                = $this->now_mysql();
		$data['created_at'] = $now;
		$data['updated_at'] = $now;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$result = $wpdb->insert(
			$this->table(),
			$data,
			array( '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s' )
		);
		if ( false === $result ) {
			return $this->error( 'smb_staff_create_failed', '担当者の作成に失敗しました。', 500 );
		}
		$id      = (int) $wpdb->insert_id;
		$get_req = new WP_REST_Request( 'GET' );
		$get_req->set_param( 'id', $id );
		return $this->get_item( $get_req );
	}

	/**
	 * 更新。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_item( $request ) {
		global $wpdb;
		$id    = (int) $request['id'];
		$table = $this->table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$exists = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE id = %d", $id ) );
		if ( 0 === $exists ) {
			return $this->error( 'smb_staff_not_found', '指定された担当者が見つかりません。', 404 );
		}

		$data = $this->sanitize_input( $request );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$data['updated_at'] = $this->now_mysql();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update(
			$table,
			$data,
			array( 'id' => $id ),
			array( '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s' ),
			array( '%d' )
		);
		$request->set_param( 'id', $id );
		return $this->get_item( $request );
	}

	/**
	 * 削除。予約紐付きがあれば409。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_item( $request ) {
		global $wpdb;
		$id           = (int) $request['id'];
		$table        = $this->table();
		$reservations = $wpdb->prefix . 'smb_reservations';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$exists = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE id = %d", $id ) );
		if ( 0 === $exists ) {
			return $this->error( 'smb_staff_not_found', '指定された担当者が見つかりません。', 404 );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$used = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$reservations} WHERE staff_id = %d", $id ) );
		if ( $used > 0 ) {
			return $this->error(
				'smb_staff_has_reservations',
				'この担当者には予約が存在するため削除できません。先に予約を削除または移動してください。',
				409
			);
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete( $table, array( 'id' => $id ), array( '%d' ) );
		return rest_ensure_response(
			array(
				'deleted' => true,
				'id'      => $id,
			)
		);
	}
}
