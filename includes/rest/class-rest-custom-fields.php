<?php
/**
 * Smart Booking - REST: カスタムフィールド (/custom-fields)
 *
 * smabo_custom_fields テーブルに対する CRUD + 並び替え。
 * 初期フィールド (customer_name / customer_email / customer_phone) は削除禁止。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * カスタムフィールドエンドポイント。
 */
class Smart_Booking_REST_Custom_Fields extends Smart_Booking_REST_Base {

	/**
	 * 保護フィールド（削除禁止）。
	 */
	const PROTECTED_KEYS = array( 'customer_name', 'customer_email', 'customer_phone' );

	/**
	 * 有効な field_type。
	 */
	const ALLOWED_TYPES = array( 'text', 'email', 'tel', 'textarea', 'select', 'radio', 'checkbox' );

	/**
	 * ルート登録。
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/custom-fields',
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
			'/custom-fields/reorder',
			array(
				'methods'             => WP_REST_Server::EDITABLE,
				'callback'            => array( $this, 'reorder' ),
				'permission_callback' => array( $this, 'permission_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/custom-fields/(?P<id>\d+)',
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
	 * テーブル名。
	 *
	 * @return string
	 */
	private function table() {
		global $wpdb;
		return $wpdb->prefix . 'smabo_custom_fields';
	}

	/**
	 * 行を整形する。
	 *
	 * @param array $row DB 行.
	 * @return array
	 */
	private function format_row( $row ) {
		$options = array();
		if ( ! empty( $row['field_options'] ) ) {
			$decoded = json_decode( $row['field_options'], true );
			if ( is_array( $decoded ) ) {
				$options = $decoded;
			}
		}
		return array(
			'id'            => (int) $row['id'],
			'field_key'     => $row['field_key'],
			'field_label'   => $row['field_label'],
			'field_type'    => $row['field_type'],
			'field_options' => $options,
			'placeholder'   => $row['placeholder'],
			'is_required'   => (int) $row['is_required'] ? 1 : 0,
			'sort_order'    => (int) $row['sort_order'],
			'is_protected'  => in_array( $row['field_key'], self::PROTECTED_KEYS, true ),
			'created_at'    => $row['created_at'],
		);
	}

	/**
	 * 一覧取得。
	 *
	 * @return WP_REST_Response
	 */
	public function get_items() {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}smabo_custom_fields ORDER BY sort_order ASC, id ASC", ARRAY_A );
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
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smabo_custom_fields WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_field_not_found', '指定されたフィールドが見つかりません。', 404 );
		}
		return rest_ensure_response( $this->format_row( $row ) );
	}

	/**
	 * 入力をサニタイズ（作成用）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return array|WP_Error
	 */
	private function sanitize_create( $request ) {
		global $wpdb;

		$label = sanitize_text_field( (string) $request->get_param( 'field_label' ) );
		if ( '' === $label ) {
			return $this->error( 'smb_field_label_required', 'ラベルを入力してください。', 400 );
		}

		$type = (string) $request->get_param( 'field_type' );
		if ( ! in_array( $type, self::ALLOWED_TYPES, true ) ) {
			return $this->error( 'smb_field_type_invalid', 'フィールド種別が不正です。', 400 );
		}

		$key = sanitize_key( (string) $request->get_param( 'field_key' ) );
		if ( '' === $key ) {
			// 自動生成: field_N.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$max = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smabo_custom_fields" );
			$key = 'field_' . ( $max + 1 );
		}

		// 既存 key との衝突チェック.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$exists = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}smabo_custom_fields WHERE field_key = %s", $key ) );
		if ( $exists > 0 ) {
			// 衝突した場合は suffix を付ける.
			$i = 2;
			do {
				$candidate = $key . '_' . $i;
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$exists = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}smabo_custom_fields WHERE field_key = %s", $candidate ) );
				++$i;
			} while ( $exists > 0 && $i < 100 );
			$key = $candidate;
		}

		$options_raw = $request->get_param( 'field_options' );
		$options     = array();
		if ( is_array( $options_raw ) ) {
			foreach ( $options_raw as $opt ) {
				$opt = sanitize_text_field( (string) $opt );
				if ( '' !== $opt ) {
					$options[] = $opt;
				}
			}
		}

		$needs_options = in_array( $type, array( 'select', 'radio', 'checkbox' ), true );
		if ( $needs_options && empty( $options ) ) {
			return $this->error( 'smb_field_options_required', '選択肢を1つ以上入力してください。', 400 );
		}

		return array(
			'field_key'     => $key,
			'field_label'   => $label,
			'field_type'    => $type,
			'field_options' => wp_json_encode( $options ),
			'placeholder'   => sanitize_text_field( (string) $request->get_param( 'placeholder' ) ),
			'is_required'   => $request->get_param( 'is_required' ) ? 1 : 0,
			'sort_order'    => (int) $request->get_param( 'sort_order' ),
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
		$data = $this->sanitize_create( $request );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$data['created_at'] = $this->now_mysql();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->insert(
			$this->table(),
			$data,
			array( '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s' )
		);
		$id      = (int) $wpdb->insert_id;
		$get_req = new WP_REST_Request( 'GET' );
		$get_req->set_param( 'id', $id );
		return $this->get_item( $get_req );
	}

	/**
	 * 更新（保護キーでも label / placeholder / is_required / sort_order / type などは更新可能。
	 * ただし field_key 自体は不変）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_item( $request ) {
		global $wpdb;
		$id = (int) $request['id'];
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smabo_custom_fields WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_field_not_found', '指定されたフィールドが見つかりません。', 404 );
		}

		$label = sanitize_text_field( (string) $request->get_param( 'field_label' ) );
		if ( '' === $label ) {
			return $this->error( 'smb_field_label_required', 'ラベルを入力してください。', 400 );
		}
		$type = (string) $request->get_param( 'field_type' );
		if ( ! in_array( $type, self::ALLOWED_TYPES, true ) ) {
			$type = $row['field_type'];
		}

		// 保護フィールドは type 変更不可（text/email/tel 固定）。
		if ( in_array( $row['field_key'], self::PROTECTED_KEYS, true ) ) {
			$type = $row['field_type'];
		}

		$options_raw = $request->get_param( 'field_options' );
		$options     = array();
		if ( is_array( $options_raw ) ) {
			foreach ( $options_raw as $opt ) {
				$opt = sanitize_text_field( (string) $opt );
				if ( '' !== $opt ) {
					$options[] = $opt;
				}
			}
		}

		$needs_options = in_array( $type, array( 'select', 'radio', 'checkbox' ), true );
		if ( $needs_options && empty( $options ) ) {
			return $this->error( 'smb_field_options_required', '選択肢を1つ以上入力してください。', 400 );
		}

		$update = array(
			'field_label'   => $label,
			'field_type'    => $type,
			'field_options' => wp_json_encode( $options ),
			'placeholder'   => sanitize_text_field( (string) $request->get_param( 'placeholder' ) ),
			'is_required'   => $request->get_param( 'is_required' ) ? 1 : 0,
			'sort_order'    => (int) $request->get_param( 'sort_order' ),
		);

		// 保護フィールドの is_required は常に 1（必須）強制.
		if ( in_array( $row['field_key'], self::PROTECTED_KEYS, true ) ) {
			$update['is_required'] = 1;
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update(
			$wpdb->prefix . 'smabo_custom_fields',
			$update,
			array( 'id' => $id ),
			array( '%s', '%s', '%s', '%s', '%d', '%d' ),
			array( '%d' )
		);
		return $this->get_item( $request );
	}

	/**
	 * 削除（保護フィールドは拒否）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_item( $request ) {
		global $wpdb;
		$id = (int) $request['id'];
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smabo_custom_fields WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_field_not_found', '指定されたフィールドが見つかりません。', 404 );
		}
		if ( in_array( $row['field_key'], self::PROTECTED_KEYS, true ) ) {
			return $this->error(
				'smb_field_protected',
				'このフィールド（氏名・メール・電話）は削除できません。',
				400
			);
		}
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete( $wpdb->prefix . 'smabo_custom_fields', array( 'id' => $id ), array( '%d' ) );
		return rest_ensure_response(
			array(
				'deleted' => true,
				'id'      => $id,
			)
		);
	}

	/**
	 * 並び替え。
	 *
	 * リクエスト: { items: [{id, sort_order}, ...] }
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function reorder( $request ) {
		global $wpdb;
		$items = $request->get_param( 'items' );
		if ( ! is_array( $items ) ) {
			return $this->error( 'smb_field_reorder_invalid', '並び替えデータの形式が正しくありません。', 400 );
		}

		$updated = 0;
		foreach ( $items as $item ) {
			if ( ! isset( $item['id'] ) ) {
				continue;
			}
			$id    = (int) $item['id'];
			$order = isset( $item['sort_order'] ) ? (int) $item['sort_order'] : 0;
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$result = $wpdb->update(
				$wpdb->prefix . 'smabo_custom_fields',
				array( 'sort_order' => $order ),
				array( 'id' => $id ),
				array( '%d' ),
				array( '%d' )
			);
			if ( false !== $result ) {
				++$updated;
			}
		}

		return rest_ensure_response( array( 'updated' => $updated ) );
	}
}
