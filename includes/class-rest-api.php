<?php
/**
 * Smart Booking - REST API
 *
 * 名前空間 `smart-booking/v1` の REST エンドポイント骨格を登録する。
 * フェーズ1 では骨格のみ。実際のデータ処理はフェーズ2以降で実装する。
 *
 * セキュリティ方針:
 * - 全エンドポイントで `current_user_can( 'manage_options' )` を必須とする。
 * - WP REST API は Cookie 認証経由のリクエストに対し `X-WP-Nonce` ヘッダを自動検証する
 *   （`wp_create_nonce( 'wp_rest' )` が対応）。これにより CSRF を防止する。
 * - したがって permission_callback では capability を確認すれば、認証 + nonce の両方が担保される。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * REST API エンドポイント骨格クラス。
 */
class Smart_Booking_REST_API {

	/**
	 * REST API 名前空間。
	 */
	const NAMESPACE_V1 = 'smart-booking/v1';

	/**
	 * フック登録。
	 *
	 * @return void
	 */
	public function init() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * 権限チェック。管理者権限 + Cookie/Nonce による CSRF 保護を担保する。
	 *
	 * WordPress REST API は認証済みリクエストに対して X-WP-Nonce ヘッダを自動検証するため、
	 * ここでは管理者権限のみを確認する。
	 *
	 * @return bool
	 */
	public function permission_check() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * 全 REST ルートを登録する。
	 *
	 * @return void
	 */
	public function register_routes() {
		$this->register_resource_routes( 'stores' );
		$this->register_resource_routes( 'staff' );
		$this->register_resource_routes( 'schedules' );
		$this->register_resource_routes( 'reservations' );
		$this->register_resource_routes( 'custom-fields' );

		// Settings は単一リソースなので GET / POST のみ.
		register_rest_route(
			self::NAMESPACE_V1,
			'/settings',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'stub_collection' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'stub_item' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
			)
		);
	}

	/**
	 * CRUD 用のエンドポイント一式（`/base` コレクション + `/base/(?P<id>\d+)` アイテム）を登録する。
	 *
	 * @param string $base ベースパス（例: 'stores', 'staff', 'schedules', 'reservations', 'custom-fields'）.
	 * @return void
	 */
	private function register_resource_routes( $base ) {
		// コレクション: GET / POST.
		register_rest_route(
			self::NAMESPACE_V1,
			'/' . $base,
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'stub_collection' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'stub_item' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
			)
		);

		// 単一アイテム: GET / PUT / DELETE.
		register_rest_route(
			self::NAMESPACE_V1,
			'/' . $base . '/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'stub_item' ),
					'permission_callback' => array( $this, 'permission_check' ),
					'args'                => array(
						'id' => array(
							'type'     => 'integer',
							'required' => true,
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'stub_item' ),
					'permission_callback' => array( $this, 'permission_check' ),
					'args'                => array(
						'id' => array(
							'type'     => 'integer',
							'required' => true,
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'stub_item' ),
					'permission_callback' => array( $this, 'permission_check' ),
					'args'                => array(
						'id' => array(
							'type'     => 'integer',
							'required' => true,
						),
					),
				),
			)
		);
	}

	/**
	 * コレクション系エンドポイントの骨格レスポンス。
	 *
	 * @return WP_REST_Response
	 */
	public function stub_collection() {
		return rest_ensure_response( array() );
	}

	/**
	 * 単一アイテム系エンドポイントの骨格レスポンス。
	 *
	 * @return WP_REST_Response
	 */
	public function stub_item() {
		return rest_ensure_response( new stdClass() );
	}
}
