<?php
/**
 * Smart Booking - REST: カスタムフィールド (/custom-fields)
 *
 * smart_booking_custom_fields テーブルに対する CRUD + 並び替え。
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
	const ALLOWED_TYPES = array( 'text', 'email', 'tel', 'textarea', 'select', 'radio', 'checkbox', 'address' );

	/**
	 * メールテンプレートの固定変数と衝突する予約語（field_key に使用不可）。
	 *
	 * これらを field_key に許すと、メール本文の {store_name} 等が常に固定変数として
	 * 展開され、カスタムフィールドの回答が差し込まれない（固定 8 変数が優先されるため）。
	 * 混乱を避けるため作成時に禁止する。customer_name / customer_email / customer_phone は
	 * 保護フィールドとして各フォームに既存するので、ユーザーが同名で作成しようとしても
	 * 複合 UNIQUE 衝突で採番される（この防御が主に効くのは残り 5 語）。
	 *
	 * @see Smart_Booking_Reservation_Context::template_vars()
	 */
	const RESERVED_TEMPLATE_KEYS = array(
		'customer_name',
		'customer_email',
		'customer_phone',
		'reservation_id',
		'schedule_date',
		'schedule_time',
		'store_name',
		'staff_name',
	);

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
		return $wpdb->prefix . 'smart_booking_custom_fields';
	}

	/**
	 * リクエストの form_id を有効なフォーム id へ解決する。
	 *
	 * 省略時・不正な id はデフォルトフォームへフォールバックする（フォーム定義の
	 * 一意性はデフォルトフォーム側に集約される）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return int
	 */
	private function resolve_form_id( $request ) {
		return Smart_Booking_REST_Forms::resolve_form_id( absint( $request->get_param( 'form_id' ) ) );
	}

	/**
	 * 行を整形する。
	 *
	 * @param array $row DB 行.
	 * @return array
	 */
	private function format_row( $row ) {
		$type     = (string) $row['field_type'];
		$options  = array();
		$autofill = false;
		if ( 'address' === $type ) {
			// address: field_options には選択肢ではなく自動入力フラグ（JSON）を格納する。
			// 出力の field_options は選択肢が無いため空配列。autofill は未設定/デコード失敗時 true。
			$autofill = true;
			if ( ! empty( $row['field_options'] ) ) {
				$decoded = json_decode( $row['field_options'], true );
				if ( is_array( $decoded ) && array_key_exists( 'autofill', $decoded ) ) {
					$autofill = (bool) $decoded['autofill'];
				}
			}
		} elseif ( ! empty( $row['field_options'] ) ) {
			$decoded = json_decode( $row['field_options'], true );
			if ( is_array( $decoded ) ) {
				$options = $decoded;
			}
		}
		$condition_field_key = ( isset( $row['condition_field_key'] ) && null !== $row['condition_field_key'] && '' !== (string) $row['condition_field_key'] )
			? (string) $row['condition_field_key']
			: null;
		$condition_value     = ( isset( $row['condition_value'] ) && null !== $row['condition_value'] && '' !== (string) $row['condition_value'] )
			? (string) $row['condition_value']
			: null;
		return array(
			'id'                  => (int) $row['id'],
			'form_id'             => (int) $row['form_id'],
			'field_key'           => $row['field_key'],
			'field_label'         => $row['field_label'],
			'field_type'          => $row['field_type'],
			'field_options'       => $options,
			'autofill'            => (bool) $autofill,
			'placeholder'         => $row['placeholder'],
			'is_required'         => (int) $row['is_required'] ? 1 : 0,
			'sort_order'          => (int) $row['sort_order'],
			'condition_field_key' => $condition_field_key,
			'condition_value'     => $condition_value,
			'validation_rules'    => $this->decode_validation_rules( isset( $row['validation_rules'] ) ? $row['validation_rules'] : null ),
			'is_protected'        => in_array( $row['field_key'], self::PROTECTED_KEYS, true ),
			'created_at'          => $row['created_at'],
		);
	}

	/**
	 * 表示条件（condition_field_key / condition_value）の入力を検証・正規化する。
	 *
	 * 3制約: (1) 条件は1つのみ (2) 親は radio/select のみ (3) ネスト禁止（親が条件付きでない）。
	 *
	 * @param WP_REST_Request $request      リクエスト.
	 * @param string          $self_key     自身の field_key（自己参照防止・自己除外に使用）.
	 * @param bool            $is_protected 保護フィールド（氏名/メール/電話）か.
	 * @param int             $form_id      対象フォーム id（親候補・依存対象を同一フォーム内に限定）.
	 * @return array|WP_Error condition_field_key / condition_value（各 string|null）または WP_Error.
	 */
	private function sanitize_condition( $request, $self_key, $is_protected, $form_id ) {
		global $wpdb;

		$form_id = (int) $form_id;

		// 保護フィールド（system）は条件の子になれない → 強制 NULL。
		if ( $is_protected ) {
			return array(
				'condition_field_key' => null,
				'condition_value'     => null,
			);
		}

		$parent_key = sanitize_key( (string) $request->get_param( 'condition_field_key' ) );

		// 未指定 → 常時表示（両方 NULL）。
		if ( '' === $parent_key ) {
			return array(
				'condition_field_key' => null,
				'condition_value'     => null,
			);
		}

		// 自己参照は不可。
		if ( '' !== (string) $self_key && $parent_key === (string) $self_key ) {
			return $this->error( 'smb_field_condition_self', '表示条件に自分自身は指定できません。', 400 );
		}

		// ネスト禁止（逆方向）: 自身が既に他フィールドの表示条件の親になっている場合、
		// 自身に条件を設定すると 2 段ネストになるため不可。
		if ( '' !== (string) $self_key ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$is_parent = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_custom_fields WHERE condition_field_key = %s AND form_id = %d", (string) $self_key, $form_id ) );
			if ( $is_parent > 0 ) {
				return $this->error( 'smb_field_condition_is_parent', 'このフィールドは他フィールドの表示条件の親になっているため、表示条件を設定できません。', 400 );
			}
		}

		// 親フィールドの取得（同一フォーム内のみ）。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$parent = $wpdb->get_row( $wpdb->prepare( "SELECT field_type, condition_field_key FROM {$wpdb->prefix}smart_booking_custom_fields WHERE field_key = %s AND form_id = %d", $parent_key, $form_id ), ARRAY_A );
		if ( ! $parent || ! in_array( (string) $parent['field_type'], array( 'radio', 'select' ), true ) ) {
			return $this->error( 'smb_field_condition_parent_invalid', '表示条件の親は選択式（ラジオ/セレクト）のフィールドのみ指定できます。', 400 );
		}

		// ネスト禁止: 親自身が条件付きなら不可。
		if ( isset( $parent['condition_field_key'] ) && null !== $parent['condition_field_key'] && '' !== (string) $parent['condition_field_key'] ) {
			return $this->error( 'smb_field_condition_nested', '表示条件付きのフィールドを親には指定できません。', 400 );
		}

		$value = sanitize_text_field( (string) $request->get_param( 'condition_value' ) );
		if ( '' === $value ) {
			return $this->error( 'smb_field_condition_value_required', '表示条件の値を選択してください。', 400 );
		}

		// condition_value が親の選択肢に含まれなくてもエラーにしない（仕様: 永遠に不成立＝常に非表示で許容）。
		return array(
			'condition_field_key' => $parent_key,
			'condition_value'     => $value,
		);
	}

	/**
	 * 一覧取得（form_id で絞り込み。省略時はデフォルトフォーム）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return WP_REST_Response
	 */
	public function get_items( $request ) {
		global $wpdb;
		$form_id = $this->resolve_form_id( $request );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_custom_fields WHERE form_id = %d ORDER BY sort_order ASC, id ASC", $form_id ), ARRAY_A );
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
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_custom_fields WHERE id = %d", $id ), ARRAY_A );
		if ( ! $row ) {
			return $this->error( 'smb_field_not_found', '指定されたフィールドが見つかりません。', 404 );
		}
		return rest_ensure_response( $this->format_row( $row ) );
	}

	/**
	 * address 型の自動入力フラグ（address_autofill）を解決する。
	 *
	 * 未指定（null）はデフォルト true。指定があれば真偽にキャスト。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @return bool
	 */
	private function resolve_autofill( $request ) {
		$raw = $request->get_param( 'address_autofill' );
		return ( null === $raw ) ? true : (bool) $raw;
	}

	/**
	 * DB の validation_rules（JSON 文字列）を出力用の連想配列へ復元する（管理・公開共通）。
	 *
	 * 不正・空・列欠如はすべて null（ルールなし）として扱う。既知キーのみ通す。
	 *
	 * @param mixed $raw DB 上の値.
	 * @return array|null charset/min_length/max_length/match_field_key を持つ配列、または null.
	 */
	private function decode_validation_rules( $raw ) {
		if ( null === $raw || '' === $raw ) {
			return null;
		}
		$decoded = json_decode( (string) $raw, true );
		if ( ! is_array( $decoded ) || empty( $decoded ) ) {
			return null;
		}
		$out = array();
		if ( isset( $decoded['charset'] ) && is_string( $decoded['charset'] ) && '' !== $decoded['charset'] ) {
			$out['charset'] = (string) $decoded['charset'];
		}
		if ( isset( $decoded['min_length'] ) && is_numeric( $decoded['min_length'] ) ) {
			$out['min_length'] = (int) $decoded['min_length'];
		}
		if ( isset( $decoded['max_length'] ) && is_numeric( $decoded['max_length'] ) ) {
			$out['max_length'] = (int) $decoded['max_length'];
		}
		if ( isset( $decoded['match_field_key'] ) && is_string( $decoded['match_field_key'] ) && '' !== $decoded['match_field_key'] ) {
			$out['match_field_key'] = (string) $decoded['match_field_key'];
		}
		return empty( $out ) ? null : $out;
	}

	/**
	 * 文字数（min_length / max_length）の入力値を解釈する。
	 *
	 * 空欄・null・未指定は null（未設定）。1〜9999 の整数のみ許可し、それ以外は WP_Error。
	 *
	 * @param array  $raw リクエストの validation_rules 連想配列.
	 * @param string $key 'min_length' または 'max_length'.
	 * @return int|null|WP_Error 整数 / null / エラー.
	 */
	private function parse_length_value( $raw, $key ) {
		if ( ! isset( $raw[ $key ] ) || null === $raw[ $key ] || '' === $raw[ $key ] ) {
			return null;
		}
		if ( ! is_numeric( $raw[ $key ] ) ) {
			return $this->error( 'smb_field_rule_length_invalid', '文字数には1〜9999の整数を指定してください。', 400 );
		}
		$f = (float) $raw[ $key ];
		if ( floor( $f ) !== $f ) {
			return $this->error( 'smb_field_rule_length_invalid', '文字数には1〜9999の整数を指定してください。', 400 );
		}
		$n = (int) $f;
		if ( $n < 1 || $n > 9999 ) {
			return $this->error( 'smb_field_rule_length_invalid', '文字数には1〜9999の整数を指定してください。', 400 );
		}
		return $n;
	}

	/**
	 * 入力ルール（validation_rules）を検証・サニタイズする（保存用）。仕様 §6。
	 *
	 * 未知の charset・範囲外の数値・最小 > 最大・存在しない/型不適合な match_field_key・
	 * 自己参照・対象外の型への設定・システム3項目への設定は 400 で拒否する。
	 * すべて未設定なら null（＝ルールなし）。未知キーは破棄する。
	 *
	 * @param WP_REST_Request $request      リクエスト.
	 * @param string          $field_type   対象フィールドの型.
	 * @param bool            $is_protected システム3項目か（ルール設定不可）.
	 * @param string          $self_key     自身の field_key（自己参照判定用）.
	 * @param int             $form_id      対象フォーム id.
	 * @return string|null|WP_Error JSON 文字列 / null / WP_Error.
	 */
	private function sanitize_validation_rules( $request, $field_type, $is_protected, $self_key, $form_id ) {
		global $wpdb;

		$raw = $request->get_param( 'validation_rules' );
		if ( ! is_array( $raw ) ) {
			// 未指定・null・非配列はルールなし。
			return null;
		}

		$charset_types = array( 'text', 'textarea' );     // 文字種・文字数の対象型.
		$match_types   = array( 'text', 'email', 'tel' );  // 一致ルールの対象型.
		$allowed_cs    = array( 'numeric', 'alpha', 'alnum', 'katakana', 'hiragana', 'kana' );

		$rules = array();

		// 文字種.
		if ( isset( $raw['charset'] ) && null !== $raw['charset'] && '' !== $raw['charset'] ) {
			$cs = (string) $raw['charset'];
			if ( ! in_array( $cs, $allowed_cs, true ) ) {
				return $this->error( 'smb_field_rule_charset_invalid', '文字種の指定が不正です。', 400 );
			}
			$rules['charset'] = $cs;
		}

		// 文字数（最小・最大）.
		$min = $this->parse_length_value( $raw, 'min_length' );
		if ( is_wp_error( $min ) ) {
			return $min;
		}
		$max = $this->parse_length_value( $raw, 'max_length' );
		if ( is_wp_error( $max ) ) {
			return $max;
		}
		if ( null !== $min && null !== $max && $min > $max ) {
			return $this->error( 'smb_field_rule_length_range', '文字数の最小値が最大値を上回っています。', 400 );
		}
		if ( null !== $min ) {
			$rules['min_length'] = $min;
		}
		if ( null !== $max ) {
			$rules['max_length'] = $max;
		}

		// 一致する項目.
		if ( isset( $raw['match_field_key'] ) && null !== $raw['match_field_key'] && '' !== $raw['match_field_key'] ) {
			$match = sanitize_key( (string) $raw['match_field_key'] );
			if ( '' !== $match ) {
				if ( $match === $self_key ) {
					return $this->error( 'smb_field_rule_match_self', '一致する項目に自分自身は指定できません。', 400 );
				}
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$target = $wpdb->get_row( $wpdb->prepare( "SELECT field_type FROM {$wpdb->prefix}smart_booking_custom_fields WHERE field_key = %s AND form_id = %d", $match, (int) $form_id ), ARRAY_A );
				if ( ! $target ) {
					return $this->error( 'smb_field_rule_match_missing', '一致する項目の比較先フィールドが見つかりません。', 400 );
				}
				if ( ! in_array( (string) $target['field_type'], $match_types, true ) ) {
					return $this->error( 'smb_field_rule_match_type', '一致する項目の比較先は1行テキスト・メール・電話のいずれかにしてください。', 400 );
				}
				$rules['match_field_key'] = $match;
			}
		}

		// すべて未設定なら null（空オブジェクトは保存しない）。
		if ( empty( $rules ) ) {
			return null;
		}

		// 型・保護の制約。システム3項目はルール設定不可。
		if ( $is_protected ) {
			return $this->error( 'smb_field_rule_protected', 'この項目（氏名・メール・電話）には入力ルールを設定できません。', 400 );
		}
		$has_cs_or_len = isset( $rules['charset'] ) || isset( $rules['min_length'] ) || isset( $rules['max_length'] );
		if ( $has_cs_or_len && ! in_array( $field_type, $charset_types, true ) ) {
			return $this->error( 'smb_field_rule_type', '文字種・文字数の入力ルールは1行テキスト・複数行テキストにのみ設定できます。', 400 );
		}
		if ( isset( $rules['match_field_key'] ) && ! in_array( $field_type, $match_types, true ) ) {
			return $this->error( 'smb_field_rule_type', '一致する項目の入力ルールは1行テキスト・メール・電話にのみ設定できます。', 400 );
		}

		return wp_json_encode( $rules );
	}

	/**
	 * 入力をサニタイズ（作成用）。
	 *
	 * @param WP_REST_Request $request リクエスト.
	 * @param int             $form_id 対象フォーム id（field_key の衝突判定・親候補の範囲）.
	 * @return array|WP_Error
	 */
	private function sanitize_create( $request, $form_id ) {
		global $wpdb;

		$form_id = (int) $form_id;

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
			// 自動生成: field_N（日本語ラベル等でキー候補が空でも作成を完了できる）。
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$max = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_custom_fields" );
			$key = 'field_' . ( $max + 1 );
		} elseif ( in_array( $key, self::RESERVED_TEMPLATE_KEYS, true ) ) {
			// 明示指定されたキーがメール変数の予約語なら拒否する（採番済みの field_N は該当しない）。
			return $this->error( 'smb_field_key_reserved', 'このフィールドキーはメール変数の予約語のため使用できません。別のキー名を指定してください。', 400 );
		}

		// 既存 key との衝突チェック（同一フォーム内で一意にする＝複合 UNIQUE(form_id, field_key)）.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$exists = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_custom_fields WHERE form_id = %d AND field_key = %s", $form_id, $key ) );
		if ( $exists > 0 ) {
			// 衝突した場合は suffix を付ける.
			$i = 2;
			do {
				$candidate = $key . '_' . $i;
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$exists = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_custom_fields WHERE form_id = %d AND field_key = %s", $form_id, $candidate ) );
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

		$is_protected = in_array( $key, self::PROTECTED_KEYS, true );
		$condition    = $this->sanitize_condition( $request, $key, $is_protected, $form_id );
		if ( is_wp_error( $condition ) ) {
			return $condition;
		}

		$validation_rules = $this->sanitize_validation_rules( $request, $type, $is_protected, $key, $form_id );
		if ( is_wp_error( $validation_rules ) ) {
			return $validation_rules;
		}

		// address 型は field_options に選択肢ではなく自動入力フラグ（JSON）を保存する。
		$field_options_json = ( 'address' === $type )
			? wp_json_encode( array( 'autofill' => $this->resolve_autofill( $request ) ) )
			: wp_json_encode( $options );

		return array(
			'field_key'           => $key,
			'field_label'         => $label,
			'field_type'          => $type,
			'field_options'       => $field_options_json,
			'placeholder'         => sanitize_text_field( (string) $request->get_param( 'placeholder' ) ),
			'is_required'         => $request->get_param( 'is_required' ) ? 1 : 0,
			'sort_order'          => (int) $request->get_param( 'sort_order' ),
			'condition_field_key' => $condition['condition_field_key'],
			'condition_value'     => $condition['condition_value'],
			'validation_rules'    => $validation_rules,
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
		$form_id = $this->resolve_form_id( $request );
		$data    = $this->sanitize_create( $request, $form_id );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		// form_id を先頭に配置（format 配列の先頭 %d と対応）。
		$data               = array_merge( array( 'form_id' => $form_id ), $data );
		$data['created_at'] = $this->now_mysql();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		// 列順: form_id, field_key, field_label, field_type, field_options, placeholder,
		// is_required, sort_order, condition_field_key, condition_value, validation_rules, created_at.
		$wpdb->insert(
			$this->table(),
			$data,
			array( '%d', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%s', '%s' )
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
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_custom_fields WHERE id = %d", $id ), ARRAY_A );
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

		// 表示条件の親は radio/select のみ（invariant）。自身が既に他フィールドの親に
		// なっている場合、選択式以外への種別変更を拒否する。
		// 許すと、フロント（配列を文字列化して比較＝成立）とサーバー（配列は不成立）の判定が
		// 食い違い、子フィールドの回答が検証も保存もされずに捨てられる。
		// 既存の壊れた行（親が checkbox 等）を編集不能にしないため「種別が実際に変わるとき」
		// だけ判定する（radio/select へ戻す修復は常に許可）。
		if ( $type !== (string) $row['field_type'] && ! in_array( $type, array( 'radio', 'select' ), true ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$is_parent = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_custom_fields WHERE condition_field_key = %s AND form_id = %d", (string) $row['field_key'], (int) $row['form_id'] ) );
			if ( $is_parent > 0 ) {
				return $this->error(
					'smb_field_parent_type_locked',
					'このフィールドは他フィールドの表示条件の親になっているため、選択式（ラジオ/セレクト）以外の種別には変更できません。先に子フィールドの表示条件を解除してください。',
					400
				);
			}
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

		$is_protected = in_array( $row['field_key'], self::PROTECTED_KEYS, true );
		// form_id は不変。対象行の form_id を条件検証のスコープに使う（同一フォーム内のみ親候補）。
		$condition = $this->sanitize_condition( $request, (string) $row['field_key'], $is_protected, (int) $row['form_id'] );
		if ( is_wp_error( $condition ) ) {
			return $condition;
		}

		// 入力ルール（§6 §9）: validation_rules が「配列で送られてきたときだけ」更新する。
		// 送られない（未指定）ときは既存値を温存する。仕様 §9「型を対象外に変更したときは
		// セクションを非表示にし、保存済みのルールは消去しない（評価側で無視される）」を満たすため。
		$vr_param         = $request->get_param( 'validation_rules' );
		$vr_provided      = is_array( $vr_param );
		$validation_rules = null;
		if ( $vr_provided ) {
			$validation_rules = $this->sanitize_validation_rules( $request, $type, $is_protected, (string) $row['field_key'], (int) $row['form_id'] );
			if ( is_wp_error( $validation_rules ) ) {
				return $validation_rules;
			}
		}

		// address 型は field_options に選択肢ではなく自動入力フラグ（JSON）を保存する。
		$field_options_json = ( 'address' === $type )
			? wp_json_encode( array( 'autofill' => $this->resolve_autofill( $request ) ) )
			: wp_json_encode( $options );

		$update  = array(
			'field_label'         => $label,
			'field_type'          => $type,
			'field_options'       => $field_options_json,
			'placeholder'         => sanitize_text_field( (string) $request->get_param( 'placeholder' ) ),
			'is_required'         => $request->get_param( 'is_required' ) ? 1 : 0,
			'sort_order'          => (int) $request->get_param( 'sort_order' ),
			'condition_field_key' => $condition['condition_field_key'],
			'condition_value'     => $condition['condition_value'],
		);
		$formats = array( '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s' );

		// 保護フィールドの is_required は常に 1（必須）強制.
		if ( $is_protected ) {
			$update['is_required'] = 1;
		}

		// validation_rules は送られたときだけ UPDATE 対象に含める（null は SQL NULL＝ルール解除）。
		if ( $vr_provided ) {
			$update['validation_rules'] = $validation_rules;
			$formats[]                  = '%s';
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update(
			$wpdb->prefix . 'smart_booking_custom_fields',
			$update,
			array( 'id' => $id ),
			$formats,
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
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}smart_booking_custom_fields WHERE id = %d", $id ), ARRAY_A );
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

		// 依存チェック: このフィールドを表示条件の親にしている子フィールドが同一フォーム内にある場合は削除をブロック。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$dependents = $wpdb->get_col( $wpdb->prepare( "SELECT field_label FROM {$wpdb->prefix}smart_booking_custom_fields WHERE condition_field_key = %s AND form_id = %d", (string) $row['field_key'], (int) $row['form_id'] ) );
		if ( is_array( $dependents ) && count( $dependents ) > 0 ) {
			return $this->error(
				'smb_field_has_dependents',
				sprintf(
					'このフィールドは他フィールドの表示条件の親になっています（依存: %s）。先に表示条件を解除してください。',
					implode( ', ', array_map( 'strval', $dependents ) )
				),
				400
			);
		}

		// 依存チェック（§5）: このフィールドを入力ルール「一致する項目」の比較先にしている
		// フィールドが同一フォーム内にある場合は削除をブロックする（v0.5.4 の親ガードと同方式）。
		// validation_rules は JSON 列のため SQL では絞れず、非 NULL 行を PHP 側で走査する。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rule_rows        = $wpdb->get_results( $wpdb->prepare( "SELECT field_label, validation_rules FROM {$wpdb->prefix}smart_booking_custom_fields WHERE form_id = %d AND validation_rules IS NOT NULL", (int) $row['form_id'] ), ARRAY_A );
		$match_dependents = array();
		if ( is_array( $rule_rows ) ) {
			foreach ( $rule_rows as $rr ) {
				$parsed = json_decode( (string) $rr['validation_rules'], true );
				if ( is_array( $parsed ) && isset( $parsed['match_field_key'] ) && (string) $parsed['match_field_key'] === (string) $row['field_key'] ) {
					$match_dependents[] = (string) $rr['field_label'];
				}
			}
		}
		if ( count( $match_dependents ) > 0 ) {
			return $this->error(
				'smb_field_match_referenced',
				sprintf(
					'このフィールドは他フィールドの入力ルール「一致する項目」の比較先になっています（依存: %s）。先に一致ルールを解除してください。',
					implode( ', ', $match_dependents )
				),
				400
			);
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete( $wpdb->prefix . 'smart_booking_custom_fields', array( 'id' => $id ), array( '%d' ) );
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
				$wpdb->prefix . 'smart_booking_custom_fields',
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
