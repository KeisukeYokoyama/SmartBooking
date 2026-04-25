<?php
/**
 * Smart Booking - REST: 店舗 (/stores)
 *
 * smb_stores テーブルに対する CRUD。
 * 予約が紐づいている店舗は削除不可（409 Conflict）。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 店舗エンドポイント。
 */
class Smart_Booking_REST_Stores extends Smart_Booking_REST_Base {

	/**
	 * ルート登録。
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/stores',
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
			'/stores/(?P<id>\d+)',
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
		return $wpdb->prefix . 'smb_stores';
	}

	/**
	 * 行をAPIレスポンス向けに整形する。
	 *
	 * @param array $row DB 取得行.
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
			'id'             => (int) $row['id'],
			'name'           => $row['name'],
			'phone'          => $row['phone'],
			'email'          => $row['email'],
			'prefecture'     => $row['prefecture'],
			'city'           => $row['city'],
			'address_line'   => $row['address_line'],
			'description'    => $row['description'],
			'image_id'       => (int) $row['image_id'],
			'image_url'      => $image_url,
			'calendar_color' => $row['calendar_color'],
			'is_active'      => (int) $row['is_active'] ? 1 : 0,
			'sort_order'     => (int) $row['sort_order'],
			'created_at'     => $row['created_at'],
			'updated_at'     => $row['updated_at'],
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

		$where  = '1=1';
		$params = array();
		if ( null !== $request->get_param( 'is_active' ) ) {
			$where   .= ' AND is_active = %d';
			$params[] = (int) $request->get_param( 'is_active' ) ? 1 : 0;
		}

		$sql = "SELECT * FROM {$table} WHERE {$where} ORDER BY sort_order ASC, id ASC";
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

		$data = array_map( array( $this, 'format_row' ), $rows );
		return rest_ensure_response( $data );
	}

	/**
	 * 単一取得。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_item( $request ) {
		global $wpdb;
		$table = $this->table();
		$id    = (int) $request['id'];

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $row ) {
			return $this->error( 'smb_store_not_found', '指定された店舗が見つかりません。', 404 );
		}
		return rest_ensure_response( $this->format_row( $row ) );
	}

	/**
	 * 入力値をサニタイズ。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return array|WP_Error
	 */
	private function sanitize_input( $request ) {
		$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
		if ( '' === $name ) {
			return $this->error( 'smb_store_name_required', '店舗名を入力してください。', 400 );
		}

		$email = (string) $request->get_param( 'email' );
		$email = sanitize_email( $email );
		if ( '' !== $email && ! is_email( $email ) ) {
			return $this->error( 'smb_store_email_invalid', 'メールアドレスの形式が正しくありません。', 400 );
		}

		$color = $this->sanitize_hex_color( (string) $request->get_param( 'calendar_color' ) );
		if ( null === $color ) {
			$color = '#3B82F6';
		}

		return array(
			'name'           => $name,
			'phone'          => sanitize_text_field( (string) $request->get_param( 'phone' ) ),
			'email'          => $email,
			'prefecture'     => sanitize_text_field( (string) $request->get_param( 'prefecture' ) ),
			'city'           => sanitize_text_field( (string) $request->get_param( 'city' ) ),
			'address_line'   => sanitize_text_field( (string) $request->get_param( 'address_line' ) ),
			'description'    => sanitize_textarea_field( (string) $request->get_param( 'description' ) ),
			'image_id'       => absint( $request->get_param( 'image_id' ) ),
			'calendar_color' => $color,
			'is_active'      => $request->get_param( 'is_active' ) ? 1 : 0,
			'sort_order'     => (int) $request->get_param( 'sort_order' ),
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
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%d', '%d', '%s', '%s' )
		);
		if ( false === $result ) {
			return $this->error( 'smb_store_create_failed', '店舗の作成に失敗しました。', 500 );
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
			return $this->error( 'smb_store_not_found', '指定された店舗が見つかりません。', 404 );
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
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%d', '%d', '%s' ),
			array( '%d' )
		);

		$request->set_param( 'id', $id );
		return $this->get_item( $request );
	}

	/**
	 * 削除。予約が紐づいている場合は409。
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
			return $this->error( 'smb_store_not_found', '指定された店舗が見つかりません。', 404 );
		}

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$used = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COUNT(*) FROM {$reservations} WHERE store_id = %d", $id )
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( $used > 0 ) {
			return $this->error(
				'smb_store_has_reservations',
				'この店舗には予約が存在するため削除できません。先に予約を削除または移動してください。',
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
