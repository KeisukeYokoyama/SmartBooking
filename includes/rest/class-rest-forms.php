<?php
/**
 * Smart Booking - REST: フォーム (/forms)
 *
 * smart_booking_forms テーブルに対する CRUD。各フォームは custom_fields を form_id で
 * 束ね、予約は form_id を持つ。スケジュール（空き枠）は全フォームで共有する。
 *
 * デフォルトフォーム（is_default=1）は削除禁止。フォーム作成時は初期3フィールド
 * （氏名 / メール / 電話）を自動生成し、メール通知の前提を構造的に担保する。
 * 上限は SMART_BOOKING_MAX_FORMS（性能ではなく UI 崩壊防止のハードキャップ）。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * フォームエンドポイント。
 */
class Smart_Booking_REST_Forms extends Smart_Booking_REST_Base {

	/**
	 * mail_overrides で扱うメール種別キー（この 3 種で厳密に固定）。
	 *
	 * @var string[]
	 */
	const MAIL_OVERRIDE_TYPES = array( 'reception_user', 'reception_admin', 'approval_user' );

	/**
	 * ルート登録。
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/forms',
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
			'/forms/(?P<id>\d+)',
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
	 * フォームテーブル名。
	 *
	 * @return string
	 */
	private function table() {
		global $wpdb;
		return $wpdb->prefix . 'smart_booking_forms';
	}

	/**
	 * デフォルトフォームの id を返す（他コントローラの form_id 解決に共有）。
	 *
	 * is_default=1 の最小 id を優先。無ければ表示順の先頭。それも無ければ 0。
	 *
	 * @return int
	 */
	public static function default_form_id() {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$id = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}smart_booking_forms WHERE is_default = 1 ORDER BY id ASC LIMIT 1" );
		if ( $id > 0 ) {
			return $id;
		}
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$id = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}smart_booking_forms ORDER BY sort_order ASC, id ASC LIMIT 1" );
		return $id > 0 ? $id : 0;
	}

	/**
	 * 指定 id のフォームが存在するか。
	 *
	 * @param int $id フォーム id.
	 * @return bool
	 */
	public static function form_exists( $id ) {
		global $wpdb;
		$id = (int) $id;
		if ( $id <= 0 ) {
			return false;
		}
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$count = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_forms WHERE id = %d", $id ) );
		return $count > 0;
	}

	/**
	 * 要求された form_id を有効なフォーム id に解決する（フォールバック用）。
	 *
	 * 存在すればそのまま、存在しなければデフォルトフォームへフォールバックする。
	 *
	 * @param int $requested 要求された form_id.
	 * @return int
	 */
	public static function resolve_form_id( $requested ) {
		$requested = (int) $requested;
		if ( $requested > 0 && self::form_exists( $requested ) ) {
			return $requested;
		}
		return self::default_form_id();
	}

	/**
	 * 行を整形する。
	 *
	 * @param array $row DB 行.
	 * @return array
	 */
	private function format_row( $row ) {
		global $wpdb;
		$id = (int) $row['id'];
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$field_count = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_custom_fields WHERE form_id = %d", $id ) );

		// mail_overrides を UI hydrate 用に正規化する（列が無い古い環境でも isset ガードで安全＝全種別 disabled）。
		$decoded = ( isset( $row['mail_overrides'] ) && '' !== (string) $row['mail_overrides'] )
			? json_decode( (string) $row['mail_overrides'], true )
			: null;

		return array(
			'id'             => $id,
			'name'           => (string) $row['name'],
			'is_default'     => (int) $row['is_default'] ? 1 : 0,
			'sort_order'     => (int) $row['sort_order'],
			'field_count'    => $field_count,
			'mail_overrides' => $this->normalize_mail_overrides( $decoded ),
			'created_at'     => $row['created_at'],
			'updated_at'     => $row['updated_at'],
		);
	}

	/**
	 * mail_overrides を「常に 3 種別を持つ」正規化配列へ整形する（読み取り整形用）。
	 *
	 * GET の UI hydrate と保存時の形を揃えるためのヘルパー。ここではサニタイズしない。
	 * 欠落種別・欠落キーは enabled=false / subject='' / body='' で補う。
	 *
	 * @param mixed $raw json_decode 済みの配列、または null / 非配列.
	 * @return array 3 種別（reception_user / reception_admin / approval_user）の連想配列.
	 */
	private function normalize_mail_overrides( $raw ) {
		$normalized = array();
		$src        = is_array( $raw ) ? $raw : array();
		foreach ( self::MAIL_OVERRIDE_TYPES as $type ) {
			$entry               = ( isset( $src[ $type ] ) && is_array( $src[ $type ] ) ) ? $src[ $type ] : array();
			$normalized[ $type ] = array(
				'enabled' => ! empty( $entry['enabled'] ),
				'subject' => isset( $entry['subject'] ) ? (string) $entry['subject'] : '',
				'body'    => isset( $entry['body'] ) ? (string) $entry['body'] : '',
			);
		}
		return $normalized;
	}

	/**
	 * mail_overrides を保存用にサニタイズ・検証する。
	 *
	 * 件名は sanitize_text_field、本文は wp_kses_post（既存メールテンプレの html 基準と同一）。
	 * enabled=true の種別は件名・本文の両方が必須。enabled=false でも文面は保持して格納する
	 * （OFF は破棄しない＝再 ON で復活）。
	 *
	 * @param mixed $raw リクエストの mail_overrides（配列想定）.
	 * @return array|WP_Error 3 種別の連想配列、または検証失敗時の WP_Error.
	 */
	private function sanitize_mail_overrides( $raw ) {
		if ( ! is_array( $raw ) ) {
			return $this->error( 'smb_form_mail_overrides_invalid', 'メール文面の形式が正しくありません。', 400 );
		}

		$sanitized = array();
		foreach ( self::MAIL_OVERRIDE_TYPES as $type ) {
			$entry   = ( isset( $raw[ $type ] ) && is_array( $raw[ $type ] ) ) ? $raw[ $type ] : array();
			$enabled = ! empty( $entry['enabled'] );
			$subject = sanitize_text_field( (string) ( isset( $entry['subject'] ) ? $entry['subject'] : '' ) );
			$body    = wp_kses_post( (string) ( isset( $entry['body'] ) ? $entry['body'] : '' ) );

			if ( $enabled && ( '' === trim( $subject ) || '' === trim( $body ) ) ) {
				return $this->error( 'smb_form_mail_override_incomplete', '専用文面を使う項目は、件名と本文の両方を入力してください。', 400 );
			}

			$sanitized[ $type ] = array(
				'enabled' => $enabled,
				'subject' => $subject,
				'body'    => $body,
			);
		}
		return $sanitized;
	}

	/**
	 * 一覧取得。
	 *
	 * @return WP_REST_Response
	 */
	public function get_items() {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}smart_booking_forms ORDER BY is_default DESC, sort_order ASC, id ASC", ARRAY_A );
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
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_forms WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_form_not_found', '指定されたフォームが見つかりません。', 404 );
		}
		return rest_ensure_response( $this->format_row( $row ) );
	}

	/**
	 * 作成。上限チェック → INSERT → 初期3フィールド自動生成。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_item( $request ) {
		global $wpdb;

		$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
		if ( '' === $name ) {
			return $this->error( 'smb_form_name_required', 'フォーム名を入力してください。', 400 );
		}

		// 上限チェック（デフォルト含む総数）。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_forms" );
		if ( $total >= SMART_BOOKING_MAX_FORMS ) {
			return $this->error(
				'smb_forms_limit',
				sprintf( 'フォームは最大%d個までです。', SMART_BOOKING_MAX_FORMS ),
				403
			);
		}

		// sort_order は現在の最大 + 1（末尾に追加）。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$max_order  = (int) $wpdb->get_var( "SELECT MAX(sort_order) FROM {$wpdb->prefix}smart_booking_forms" );
		$sort_order = $max_order + 1;

		$now = $this->now_mysql();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->insert(
			$this->table(),
			array(
				'name'       => $name,
				'is_default' => 0,
				'sort_order' => $sort_order,
				'created_at' => $now,
				'updated_at' => $now,
			),
			array( '%s', '%d', '%d', '%s', '%s' )
		);
		$new_id = (int) $wpdb->insert_id;

		// 初期フィールド（氏名 / メール / 電話）を自動生成。
		// フィールドゼロの壊れたフォームを排除し、メール通知の前提を担保する。
		Smart_Booking_Activator::seed_initial_fields_for_form( $new_id );

		$get_req = new WP_REST_Request( 'GET' );
		$get_req->set_param( 'id', $new_id );
		return $this->get_item( $get_req );
	}

	/**
	 * 更新（部分更新）。name の改名と mail_overrides の保存に対応する。
	 *
	 * name のみ送れば従来どおり改名（FormNameModal）。mail_overrides のみ送れば
	 * メール文面のみ更新（メールタブ）。どちらも省略なら 400。デフォルトフォームも改名可。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_item( $request ) {
		global $wpdb;
		$id = (int) $request['id'];
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_forms WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_form_not_found', '指定されたフォームが見つかりません。', 404 );
		}

		$update  = array();
		$formats = array();

		// name は送られたときだけ更新（未送信＝改名しない）。既存 FormNameModal は従来どおり動く。
		if ( null !== $request->get_param( 'name' ) ) {
			$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
			if ( '' === $name ) {
				return $this->error( 'smb_form_name_required', 'フォーム名を入力してください。', 400 );
			}
			$update['name'] = $name;
			$formats[]      = '%s';
		}

		// mail_overrides は送られたときだけ更新（サニタイズ・検証してから JSON 化）。
		$raw_overrides = $request->get_param( 'mail_overrides' );
		if ( null !== $raw_overrides ) {
			$sanitized = $this->sanitize_mail_overrides( $raw_overrides );
			if ( is_wp_error( $sanitized ) ) {
				return $sanitized;
			}
			$update['mail_overrides'] = wp_json_encode( $sanitized );
			$formats[]                = '%s';
		}

		if ( empty( $update ) ) {
			return $this->error( 'smb_form_no_fields', '更新する項目がありません。', 400 );
		}

		$update['updated_at'] = $this->now_mysql();
		$formats[]            = '%s';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update(
			$wpdb->prefix . 'smart_booking_forms',
			$update,
			array( 'id' => $id ),
			$formats,
			array( '%d' )
		);

		return $this->get_item( $request );
	}

	/**
	 * 削除。デフォルトフォームは削除禁止。通常フォームは custom_fields も削除する。
	 * reservations / reservation_meta は残す（予約データはフォームに従属させない）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_item( $request ) {
		global $wpdb;
		$id = (int) $request['id'];
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_forms WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_form_not_found', '指定されたフォームが見つかりません。', 404 );
		}

		if ( (int) $row['is_default'] ) {
			return $this->error( 'smb_form_default_protected', 'デフォルトフォームは削除できません。', 403 );
		}

		// フィールド定義はフォームに従属＝一緒に削除。予約データ（reservations / reservation_meta）は残す。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete( $wpdb->prefix . 'smart_booking_custom_fields', array( 'form_id' => $id ), array( '%d' ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete( $wpdb->prefix . 'smart_booking_forms', array( 'id' => $id ), array( '%d' ) );

		return rest_ensure_response(
			array(
				'deleted' => true,
				'id'      => $id,
			)
		);
	}
}
