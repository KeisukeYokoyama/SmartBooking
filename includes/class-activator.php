<?php
/**
 * Smart Booking - Activator
 *
 * プラグイン有効化時に実行される処理。
 * - カスタムテーブル7つを dbDelta で作成
 * - デフォルトデータ（店舗1件・担当者1件・初期カスタムフィールド3件）を投入
 *
 * 注意: register_activation_hook 経由でのみ実行する。init フックでの呼び出しは禁止。
 *
 * @package Smart_Booking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * テーブル作成・初期データ投入を担うアクティベータクラス。
 */
class Smart_Booking_Activator {

	/**
	 * プラグイン有効化時のエントリーポイント。
	 *
	 * @return void
	 */
	public static function activate() {
		self::create_tables();
		self::seed_default_data();
		self::seed_default_options();
		// run_migrations() 内で smart_booking_db_version を確定する。
		// スキーマ移行（0.2.3 の UNIQUE 追加）が UNIQUE 実在検証に成功した場合のみ
		// db_version を前進させ、失敗時は据え置いて次回有効化で再試行できるようにする。
		self::run_migrations();
	}

	/**
	 * プラグイン自動更新（register_activation_hook が発火しない経路）でも
	 * スキーマ移行を一度だけ確実に実行するための公開エントリ。
	 *
	 * admin_init などから毎リクエスト呼ばれることを前提に、バージョンゲートで
	 * run_migrations() の呼び出し自体を絞る（性能目的の外側ゲート）。
	 *
	 * ゲート値は SMART_BOOKING_VERSION を用いる。スキーマ変更を伴うリリースごとに
	 * 個別のゲート文字列を書き換える運用は「書き換え漏れ＝既存ユーザーへ未適用」を招くため、
	 * 常に現行バージョン未満なら run_migrations() を1回通す方式にする（各バージョン固有の
	 * 移行は run_migrations() 内の version_compare で個別にゲートされる）。
	 *
	 * 例: 既存 v0.2.3 ユーザーは db_version='0.2.3' を持つ。0.3.0 へ更新すると
	 * 0.2.3 < 0.3.0 = true で1回発火し、run_migrations() が dbDelta（③の condition_* 列追加）を
	 * 適用して db_version を '0.3.0' へ前進させゲートが閉じる（＝1回だけ発火・冪等）。
	 * スキーマ移行が失敗した場合は db_version を現行未満に留め、次回 admin_init で再試行する。
	 *
	 * @return void
	 */
	public static function maybe_upgrade() {
		if ( version_compare( (string) get_option( 'smart_booking_db_version', '0.0.0' ), SMART_BOOKING_VERSION, '<' ) ) {
			self::run_migrations();
		}
	}

	/**
	 * バージョン間マイグレーション。
	 *
	 * - 0.2.0: smart_booking_stores / smart_booking_staff に is_system カラムを追加し、既存のデフォルト
	 *   エントリ（最も若い id のもの）に is_system=1 を設定する。
	 * - 0.2.3: smart_booking_schedules に UNIQUE(store_id, staff_id, schedule_date, start_time) を追加する。
	 *   既存の重複行を dedup（予約は survivor へ張り替え）してから明示 ALTER し、SHOW INDEX で実在を検証する。
	 *
	 * dbDelta が ALTER TABLE を担う移行は値の埋め直しのみを行う。UNIQUE 追加は dbDelta 任せにせず
	 * ここで明示的に実行し、検証成功時のみ db_version を前進させる。
	 *
	 * @return void
	 */
	private static function run_migrations() {
		global $wpdb;

		$current = (string) get_option( 'smart_booking_db_version', '0.0.0' );

		// 0.2.0: is_system 導入。
		if ( version_compare( $current, '0.2.0', '<' ) ) {
			// 既存の is_system=1 エントリが既にある場合は no-op（新規環境/再マイグレーションでも安全）。
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$has_system_store = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_stores WHERE is_system = 1" );
			if ( 0 === $has_system_store ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$first_store_id = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}smart_booking_stores ORDER BY id ASC LIMIT 1" );
				if ( $first_store_id > 0 ) {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
					$wpdb->update(
						$wpdb->prefix . 'smart_booking_stores',
						array( 'is_system' => 1 ),
						array( 'id' => $first_store_id ),
						array( '%d' ),
						array( '%d' )
					);
				}
			}

			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$has_system_staff = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_staff WHERE is_system = 1" );
			if ( 0 === $has_system_staff ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$first_staff_id = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}smart_booking_staff ORDER BY id ASC LIMIT 1" );
				if ( $first_staff_id > 0 ) {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
					$wpdb->update(
						$wpdb->prefix . 'smart_booking_staff',
						array( 'is_system' => 1 ),
						array( 'id' => $first_staff_id ),
						array( '%d' ),
						array( '%d' )
					);
				}
			}
		}

		// 0.2.3: smart_booking_schedules に UNIQUE(store_id, staff_id, schedule_date, start_time) を追加。
		// dedup → 明示 ALTER → SHOW INDEX 検証、の順で実行し、UNIQUE 実在を確認できた場合のみ true。
		$schedules_unique_ready = true;
		if ( version_compare( $current, '0.2.3', '<' ) ) {
			$schedules_unique_ready = self::migrate_schedules_unique_index();
		}

		// 0.3.0: 条件フィールド用の condition_field_key / condition_value 列を既存ユーザーへ適用する。
		// dbDelta は冪等（不足列のみ ADD）なので全テーブル再適用でも既存データは不変。schedules の
		// UNIQUE は上の migrate_schedules_unique_index() で確立済みのため dbDelta 側は no-op になる。
		if ( version_compare( $current, '0.3.0', '<' ) ) {
			self::create_tables();
		}

		// 0.4.0: 複数フォーム。forms テーブル + form_id 列 + field_key 複合 UNIQUE。
		$forms_ready = true;
		if ( version_compare( $current, '0.4.0', '<' ) ) {
			$forms_ready = self::migrate_multi_forms();
		}

		// 0.5.0: フォーム別メール文面。forms に mail_overrides 列を追加する（dbDelta 冪等・欠損列のみ ADD）。
		// UNIQUE と違い列追加は冪等なので、失敗リトライ用の readiness cap は不要。
		if ( version_compare( $current, '0.5.0', '<' ) ) {
			self::create_tables();
		}

		// db_version の確定。
		// - UNIQUE 移行が成功（実在検証 OK）した場合のみ 0.2.3 以上へ前進させる。
		// - 失敗時は 0.2.3 未満に留め、次回有効化で再試行できるようにする（エラーを握り潰さない）。
		// - 値は決して後退させない（冪等）。
		$target = SMART_BOOKING_VERSION;
		if ( $schedules_unique_ready ) {
			if ( version_compare( $target, '0.2.3', '<' ) ) {
				$target = '0.2.3';
			}
		} elseif ( version_compare( $target, '0.2.3', '>=' ) ) {
			$target = '0.2.2';
		}
		// forms 移行が失敗した場合は 0.4.0 以上へ前進させず再試行させる。
		if ( ! $forms_ready && version_compare( $target, '0.3.0', '>' ) ) {
			$target = '0.3.0';
		}
		if ( version_compare( $target, $current, '>' ) ) {
			update_option( 'smart_booking_db_version', $target );
		}
	}

	/**
	 * smart_booking_schedules に UNIQUE(store_id, staff_id, schedule_date, start_time) を追加する。
	 *
	 * 実行順序（順序が正しさの本体）:
	 *   1. 既存 UNIQUE があれば no-op（冪等）。
	 *   2. 重複行群を dedup。survivor（非キャンセル予約を持つ行を優先、無ければ最小 id）を選び、
	 *      削除対象行に紐づく reservations.schedule_id を survivor へ張り替えてから重複行を DELETE
	 *      （参照切れ＝孤児を出さない）。survivor の booked_count を張り替え後の非キャンセル予約数で
	 *      再計算し、capacity = max(グループ内最大 capacity, 再計算 booked_count) に補正する。
	 *   3. 明示 ALTER で UNIQUE を追加。
	 *   4. SHOW INDEX で UNIQUE の実在を検証。
	 *
	 * reservations は行データの UPDATE（張り替え）のみ・スキーマは触らない。
	 *
	 * @return bool UNIQUE が実在すれば true、追加に失敗すれば false。
	 */
	private static function migrate_schedules_unique_index() {
		global $wpdb;

		$now = current_time( 'mysql' );

		// 1. 既存 UNIQUE があれば no-op。
		if ( self::schedules_unique_index_exists() ) {
			return true;
		}

		// 2. 重複グループ (store_id, staff_id, schedule_date, start_time) を dedup。
		// 非 prepared のため単一行に置き、直前の phpcs:ignore で確実に抑止する。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
		$groups = $wpdb->get_results( "SELECT store_id, staff_id, schedule_date, start_time FROM {$wpdb->prefix}smart_booking_schedules GROUP BY store_id, staff_id, schedule_date, start_time HAVING COUNT(*) > 1", ARRAY_A );

		if ( is_array( $groups ) ) {
			foreach ( $groups as $g ) {
				// グループ内の全行（id 昇順）。
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$rows = $wpdb->get_results(
					$wpdb->prepare(
						"SELECT id, capacity FROM {$wpdb->prefix}smart_booking_schedules WHERE store_id = %d AND staff_id = %d AND schedule_date = %s AND start_time = %s ORDER BY id ASC",
						(int) $g['store_id'],
						(int) $g['staff_id'],
						$g['schedule_date'],
						$g['start_time']
					),
					ARRAY_A
				);
				if ( ! is_array( $rows ) || count( $rows ) < 2 ) {
					continue;
				}

				// survivor 選定: 非キャンセル予約を持つ最小 id の行を優先、無ければ最小 id。
				$survivor_id  = 0;
				$max_capacity = 0;
				foreach ( $rows as $r ) {
					$rid          = (int) $r['id'];
					$max_capacity = max( $max_capacity, (int) $r['capacity'] );
					if ( 0 === $survivor_id ) {
						// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
						$active = (int) $wpdb->get_var(
							$wpdb->prepare(
								"SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_reservations WHERE schedule_id = %d AND status <> %s",
								$rid,
								'cancelled'
							)
						);
						if ( $active > 0 ) {
							$survivor_id = $rid;
						}
					}
				}
				if ( 0 === $survivor_id ) {
					$survivor_id = (int) $rows[0]['id'];
				}

				// 削除対象 = survivor 以外。
				$victims = array();
				foreach ( $rows as $r ) {
					if ( (int) $r['id'] !== $survivor_id ) {
						$victims[] = (int) $r['id'];
					}
				}

				if ( ! empty( $victims ) ) {
					$placeholders = implode( ', ', array_fill( 0, count( $victims ), '%d' ) );

					// 予約を survivor へ張り替え（孤児化禁止）。IN 句は動的プレースホルダ（単一行）。
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
					$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}smart_booking_reservations SET schedule_id = %d WHERE schedule_id IN ({$placeholders})", array_merge( array( $survivor_id ), $victims ) ) );

					// 張り替え後に重複行を削除。IN 句は動的プレースホルダ（単一行）。
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare
					$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}smart_booking_schedules WHERE id IN ({$placeholders})", $victims ) );
				}

				// survivor の booked_count を張り替え後の非キャンセル予約数で再計算。
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$real_booked = (int) $wpdb->get_var(
					$wpdb->prepare(
						"SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_reservations WHERE schedule_id = %d AND status <> %s",
						$survivor_id,
						'cancelled'
					)
				);

				// capacity = max(グループ内最大 capacity, 再計算 booked_count)（過剰予約状態を作らない）。
				$new_capacity = max( $max_capacity, $real_booked );

				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->update(
					$wpdb->prefix . 'smart_booking_schedules',
					array(
						'booked_count' => $real_booked,
						'capacity'     => $new_capacity,
						'updated_at'   => $now,
					),
					array( 'id' => $survivor_id ),
					array( '%d', '%d', '%s' ),
					array( '%d' )
				);
			}
		}

		// 3. 明示 ALTER で UNIQUE 追加。
		// テーブル名は内部生成値、値も含まない DDL のためプレースホルダは使用しない（使用不可・単一行）。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
		$wpdb->query( "ALTER TABLE {$wpdb->prefix}smart_booking_schedules ADD UNIQUE KEY uniq_store_staff_date_time (store_id, staff_id, schedule_date, start_time)" );

		// 4. UNIQUE の実在を検証（成功時のみ true）。
		return self::schedules_unique_index_exists();
	}

	/**
	 * smart_booking_schedules に UNIQUE インデックス uniq_store_staff_date_time が実在するか。
	 *
	 * @return bool 実在すれば true。
	 */
	private static function schedules_unique_index_exists() {
		global $wpdb;
		// SHOW INDEX はテーブル名を識別子として扱い、Key_name の比較値のみプレースホルダで束縛する（単一行）。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$found = $wpdb->get_var( $wpdb->prepare( "SHOW INDEX FROM {$wpdb->prefix}smart_booking_schedules WHERE Key_name = %s", 'uniq_store_staff_date_time' ) );
		return ! empty( $found );
	}

	/**
	 * 0.4.0: 複数フォーム対応のスキーマ移行。冪等（2回実行して同一結果・途中失敗しても再実行で回復）。
	 *
	 * 実行順序（順序が正しさの本体）:
	 *   1. create_tables() で forms テーブル・custom_fields.form_id・reservations.form_id を dbDelta で確保。
	 *      maybe_upgrade() 経路では create_tables() が別途呼ばれないためここで確実に作る（冪等）。
	 *   2. ensure_default_form() でデフォルトフォーム id を確保（作成失敗なら false で中断＝再試行）。
	 *   3. 既存行（form_id = 0 のセンチネル）をデフォルトフォームへバックフィル（未移行行のみ＝冪等）。
	 *   4. field_key の一意性を単独 uniq_field_key から複合 uniq_form_field_key へ張り替え。
	 *      複合の実在を確認してからのみ単独を DROP する（一意保護を失わない順序）。
	 *
	 * @return bool 複合 UNIQUE が実在すれば true、途中失敗すれば false。
	 */
	private static function migrate_multi_forms() {
		global $wpdb;

		// 1. forms テーブル・form_id 列を確実に作る（冪等）。
		self::create_tables();

		// 2. デフォルトフォーム id を確保。作成失敗時は前進させず次回再試行。
		$default_id = self::ensure_default_form();
		if ( $default_id <= 0 ) {
			return false;
		}

		// 3. 既存行の form_id バックフィル（form_id = 0 の未移行行のみ＝冪等）。
		// AUTO_INCREMENT の実 form id は 1 以上なので、新規フォームの行が 0 になることはない。
		// テーブル名は他所と同じく {$wpdb->prefix}smart_booking_* をインライン補間する
		// （中間変数 $prefix を介すと plugin-check の UnescapedDBParameter 誤検知を招くため）。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}smart_booking_custom_fields SET form_id = %d WHERE form_id = 0", $default_id ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}smart_booking_reservations SET form_id = %d WHERE form_id = 0", $default_id ) );

		// 4. field_key の UNIQUE を単独から複合へ張り替え（バックフィル後に実行）。
		$has_composite = self::custom_fields_index_exists( 'uniq_form_field_key' );
		if ( ! $has_composite ) {
			// テーブル名は内部生成値、値も含まない DDL のためプレースホルダは使用しない（使用不可・単一行）。
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
			$wpdb->query( "ALTER TABLE {$wpdb->prefix}smart_booking_custom_fields ADD UNIQUE KEY uniq_form_field_key (form_id, field_key)" );
			$has_composite = self::custom_fields_index_exists( 'uniq_form_field_key' );
		}
		// 複合の実在を確認してからのみ単独 uniq_field_key を落とす（一意保護を失わない順序）。
		if ( $has_composite && self::custom_fields_index_exists( 'uniq_field_key' ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
			$wpdb->query( "ALTER TABLE {$wpdb->prefix}smart_booking_custom_fields DROP INDEX uniq_field_key" );
		}

		return $has_composite;
	}

	/**
	 * デフォルトフォーム（is_default=1）を確保し、その form id を返す。
	 *
	 * 既にデフォルトが存在すれば no-op で既存 id を返す（冪等）。無ければ「標準フォーム」を新規挿入する。
	 *
	 * @return int デフォルトフォームの id。作成に失敗した場合は 0。
	 */
	private static function ensure_default_form() {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$existing = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}smart_booking_forms WHERE is_default = 1 ORDER BY id ASC LIMIT 1" );
		if ( $existing > 0 ) {
			return $existing;
		}

		$now = current_time( 'mysql' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->insert(
			$wpdb->prefix . 'smart_booking_forms',
			array(
				'name'       => '標準フォーム',
				'is_default' => 1,
				'sort_order' => 0,
				'created_at' => $now,
				'updated_at' => $now,
			),
			array( '%s', '%d', '%d', '%s', '%s' )
		);

		return (int) $wpdb->insert_id;
	}

	/**
	 * smart_booking_custom_fields に指定名のインデックスが実在するか。
	 *
	 * @param string $key_name 確認するインデックス名（Key_name）。
	 * @return bool 実在すれば true。
	 */
	private static function custom_fields_index_exists( $key_name ) {
		global $wpdb;
		// SHOW INDEX はテーブル名を識別子として扱い、Key_name の比較値のみプレースホルダで束縛する（単一行）。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$found = $wpdb->get_var( $wpdb->prepare( "SHOW INDEX FROM {$wpdb->prefix}smart_booking_custom_fields WHERE Key_name = %s", $key_name ) );
		return ! empty( $found );
	}

	/**
	 * 初期設定値を投入する。add_option は既存キーがあれば no-op のため、再有効化でも上書きしない。
	 *
	 * @return void
	 */
	private static function seed_default_options() {
		$defaults = array(
			// 基本設定.
			'smart_booking_booking_flow_order'           => 'date-first',
			'smart_booking_calendar_view_mode'           => 'day_only',
			'smart_booking_display_days'                 => 14,
			'smart_booking_booking_deadline_days'        => 0,
			'smart_booking_booking_deadline_hours'       => 2,
			'smart_booking_show_store_front'             => 0,
			'smart_booking_show_staff_front'             => 0,
			'smart_booking_completion_message'           => 'ご予約を受け付けました。確認メールをお送りしましたのでご確認ください。',

			// メール（デフォルト文面）.
			'smart_booking_mail_from_name'               => get_option( 'blogname', 'Smart Booking' ),
			'smart_booking_mail_from_email'              => get_option( 'admin_email', '' ),
			'smart_booking_mail_admin_notify_enabled'    => 1,
			'smart_booking_mail_receipt_user_subject'    => '【{store_name}】ご予約を受け付けました',
			'smart_booking_mail_receipt_user_body'       => "{customer_name} 様\n\nご予約を受け付けました。\n下記内容にて承りました。\n\n▼ご予約内容\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n担当: {staff_name}\n予約番号: {reservation_id}\n\n内容に変更がある場合はご連絡ください。",
			'smart_booking_mail_receipt_admin_subject'   => '【新規予約】{customer_name} 様 ({schedule_date} {schedule_time})',
			'smart_booking_mail_receipt_admin_body'      => "新しい予約が入りました。\n\n予約番号: {reservation_id}\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n担当: {staff_name}\n予約者: {customer_name}\nメール: {customer_email}\n電話: {customer_phone}",
			'smart_booking_mail_approval_user_subject'   => '【{store_name}】ご予約が確定しました',
			'smart_booking_mail_approval_user_body'      => "{customer_name} 様\n\nご予約が確定しました。\n\n▼ご予約内容\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n担当: {staff_name}\n予約番号: {reservation_id}\n\n当日お待ちしております。",

			// 外部連携はデフォルト OFF（WordPress.org 審査ルール）.
			'smart_booking_google_calendar_enabled'      => 0,
			'smart_booking_google_calendar_id'           => '',
			// サービスアカウント JSON（autoload=no で別保存。下の add_option で個別に処理）.
			'smart_booking_google_calendar_client_email' => '',
			'smart_booking_chatwork_enabled'             => 0,
			'smart_booking_chatwork_api_token'           => '',
			'smart_booking_chatwork_room_id'             => '',

			// デザイン（フロント予約フォームのブランドカラー）.
			'smart_booking_color_button'                 => '#f43f5e',
			'smart_booking_color_date_selected'          => '#374151',
			'smart_booking_color_time_selected'          => '#374151',
			'smart_booking_color_required_mark'          => '#ef4444',
			'smart_booking_color_focus'                  => '#3498db',
		);

		foreach ( $defaults as $key => $value ) {
			add_option( $key, $value );
		}

		// JSON サービスアカウントは autoload=no で初期化（巨大化を避ける）.
		if ( false === get_option( 'smart_booking_google_calendar_credentials_json', false ) ) {
			add_option( 'smart_booking_google_calendar_credentials_json', '', '', 'no' );
		}
	}

	/**
	 * カスタムテーブル7つを作成する。
	 *
	 * dbDelta は冪等に動作するため、既存テーブルがあっても安全。
	 *
	 * @return void
	 */
	private static function create_tables() {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset_collate = $wpdb->get_charset_collate();
		$prefix          = $wpdb->prefix . 'smart_booking_';

		// smart_booking_stores（店舗マスター）.
		$sql_stores = "CREATE TABLE {$prefix}stores (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			name varchar(255) NOT NULL DEFAULT '',
			phone varchar(20) NOT NULL DEFAULT '',
			email varchar(255) NOT NULL DEFAULT '',
			prefecture varchar(10) NOT NULL DEFAULT '',
			city varchar(50) NOT NULL DEFAULT '',
			address_line varchar(255) NOT NULL DEFAULT '',
			description text NULL,
			image_id bigint(20) unsigned NOT NULL DEFAULT 0,
			calendar_color varchar(7) NOT NULL DEFAULT '#3B82F6',
			is_active tinyint(1) NOT NULL DEFAULT 1,
			is_system tinyint(1) NOT NULL DEFAULT 0,
			sort_order int(11) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_is_active (is_active),
			KEY idx_is_system (is_system),
			KEY idx_sort_order (sort_order)
		) {$charset_collate};";

		// smart_booking_staff（担当者マスター）.
		$sql_staff = "CREATE TABLE {$prefix}staff (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			store_id bigint(20) unsigned NOT NULL DEFAULT 0,
			name varchar(255) NOT NULL DEFAULT '',
			email varchar(255) NOT NULL DEFAULT '',
			phone varchar(20) NOT NULL DEFAULT '',
			description text NULL,
			image_id bigint(20) unsigned NOT NULL DEFAULT 0,
			is_active tinyint(1) NOT NULL DEFAULT 1,
			is_system tinyint(1) NOT NULL DEFAULT 0,
			sort_order int(11) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_store_id (store_id),
			KEY idx_is_active (is_active),
			KEY idx_is_system (is_system),
			KEY idx_sort_order (sort_order)
		) {$charset_collate};";

		// smart_booking_schedules（予約枠）.
		$sql_schedules = "CREATE TABLE {$prefix}schedules (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			store_id bigint(20) unsigned NOT NULL DEFAULT 0,
			staff_id bigint(20) unsigned NOT NULL DEFAULT 0,
			schedule_date date NOT NULL,
			start_time time NOT NULL,
			end_time time NOT NULL,
			capacity int(11) NOT NULL DEFAULT 1,
			booked_count int(11) NOT NULL DEFAULT 0,
			is_active tinyint(1) NOT NULL DEFAULT 1,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			UNIQUE KEY uniq_store_staff_date_time (store_id,staff_id,schedule_date,start_time),
			KEY idx_store_staff_date (store_id,staff_id,schedule_date),
			KEY idx_schedule_date (schedule_date),
			KEY idx_is_active (is_active)
		) {$charset_collate};";

		// smart_booking_reservations（予約データ）.
		// v0.4.0: 複数フォーム対応で form_id を追加。既存ユーザーへは run_migrations() の 0.4.0
		// ゲートで dbDelta 再適用＋バックフィルにより付与する（冪等）。
		$sql_reservations = "CREATE TABLE {$prefix}reservations (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			form_id bigint(20) unsigned NOT NULL DEFAULT 0,
			store_id bigint(20) unsigned NOT NULL DEFAULT 0,
			staff_id bigint(20) unsigned NOT NULL DEFAULT 0,
			schedule_id bigint(20) unsigned NOT NULL DEFAULT 0,
			schedule_date date NOT NULL,
			schedule_time time NOT NULL,
			customer_name varchar(255) NOT NULL DEFAULT '',
			customer_email varchar(255) NOT NULL DEFAULT '',
			customer_phone varchar(20) NOT NULL DEFAULT '',
			status varchar(20) NOT NULL DEFAULT 'pending',
			admin_memo text NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_form_id (form_id),
			KEY idx_schedule_id (schedule_id),
			KEY idx_schedule_date (schedule_date),
			KEY idx_status (status),
			KEY idx_store_id (store_id),
			KEY idx_staff_id (staff_id)
		) {$charset_collate};";

		// smart_booking_reservation_meta（カスタムフィールド入力値）.
		$sql_reservation_meta = "CREATE TABLE {$prefix}reservation_meta (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			reservation_id bigint(20) unsigned NOT NULL DEFAULT 0,
			meta_key varchar(255) NOT NULL DEFAULT '',
			meta_value text NULL,
			PRIMARY KEY  (id),
			KEY idx_reservation_id (reservation_id),
			KEY idx_meta_key (meta_key(191))
		) {$charset_collate};";

		// smart_booking_forms（フォームマスター）.
		// v0.4.0: 複数フォーム対応。各フォームは custom_fields を form_id で束ね、予約は form_id を持つ。
		// v0.5.0: フォーム別メール文面。mail_overrides（JSON）で種別ごとに件名/本文を上書きする（NULL=共通使用）。
		//   既存ユーザーへは run_migrations() の 0.5.0 ゲートで dbDelta 再適用により列を追加する（冪等）。
		$sql_forms = "CREATE TABLE {$prefix}forms (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			name varchar(255) NOT NULL DEFAULT '',
			is_default tinyint(1) NOT NULL DEFAULT 0,
			sort_order int(11) NOT NULL DEFAULT 0,
			mail_overrides longtext NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY idx_is_default (is_default),
			KEY idx_sort_order (sort_order)
		) {$charset_collate};";

		// smart_booking_custom_fields（フォームフィールド定義）.
		// v0.3.0: 条件フィールド用に condition_field_key / condition_value を追加。既存ユーザーへは
		// maybe_upgrade() → run_migrations() の 0.3.0 ゲートで dbDelta を再適用して列を追加する（冪等）。
		// v0.4.0: 複数フォーム対応で form_id を追加し、field_key の一意性を (form_id, field_key) の複合
		// UNIQUE へ拡張する。既存テーブルの UNIQUE 張り替えは dbDelta の不確実性に依存させず、
		// run_migrations() の 0.4.0 ゲート（migrate_multi_forms）が明示 ALTER で担う。
		$sql_custom_fields = "CREATE TABLE {$prefix}custom_fields (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			form_id bigint(20) unsigned NOT NULL DEFAULT 0,
			field_key varchar(100) NOT NULL DEFAULT '',
			field_label varchar(255) NOT NULL DEFAULT '',
			field_type varchar(20) NOT NULL DEFAULT 'text',
			field_options text NULL,
			placeholder varchar(255) NOT NULL DEFAULT '',
			is_required tinyint(1) NOT NULL DEFAULT 0,
			sort_order int(11) NOT NULL DEFAULT 0,
			condition_field_key varchar(100) DEFAULT NULL,
			condition_value varchar(255) DEFAULT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			UNIQUE KEY uniq_form_field_key (form_id, field_key),
			KEY idx_form_id (form_id),
			KEY idx_sort_order (sort_order)
		) {$charset_collate};";

		dbDelta( $sql_stores );
		dbDelta( $sql_staff );
		dbDelta( $sql_schedules );
		dbDelta( $sql_reservations );
		dbDelta( $sql_reservation_meta );
		dbDelta( $sql_forms );
		dbDelta( $sql_custom_fields );
	}

	/**
	 * 初期データを投入する。既存データがある場合はスキップ（冪等）。
	 *
	 * @return void
	 */
	private static function seed_default_data() {
		global $wpdb;

		// デフォルト店舗: 未登録の場合のみ投入.
		// テーブル名は信頼できる内部生成値。プレースホルダでは識別子を扱えないため直接埋め込む。
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$stores_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_stores" );
		$store_id     = 0;
		if ( 0 === $stores_count ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->prefix . 'smart_booking_stores',
				array(
					'name'           => 'デフォルト',
					'phone'          => '',
					'email'          => get_option( 'admin_email', '' ),
					'prefecture'     => '',
					'city'           => '',
					'address_line'   => '',
					'description'    => '',
					'image_id'       => 0,
					'calendar_color' => '#3B82F6',
					'is_active'      => 1,
					'is_system'      => 1,
					'sort_order'     => 0,
					'created_at'     => current_time( 'mysql' ),
					'updated_at'     => current_time( 'mysql' ),
				),
				array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%d', '%d', '%d', '%s', '%s' )
			);
			$store_id = (int) $wpdb->insert_id;
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$store_id = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}smart_booking_stores ORDER BY id ASC LIMIT 1" );
		}

		// デフォルト担当者: 未登録の場合のみ投入.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$staff_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_staff" );
		if ( 0 === $staff_count && $store_id > 0 ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->prefix . 'smart_booking_staff',
				array(
					'store_id'    => $store_id,
					'name'        => 'デフォルト',
					'email'       => '',
					'phone'       => '',
					'description' => '',
					'image_id'    => 0,
					'is_active'   => 1,
					'is_system'   => 1,
					'sort_order'  => 0,
					'created_at'  => current_time( 'mysql' ),
					'updated_at'  => current_time( 'mysql' ),
				),
				array( '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%d', '%s', '%s' )
			);
		}

		// デフォルトカスタムフィールド: 未登録の場合のみ投入.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$fields_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}smart_booking_custom_fields" );
		if ( 0 === $fields_count ) {
			// 初期フィールドはデフォルトフォームに束ねる（form_id を付与）。
			$form_id = self::ensure_default_form();
			self::seed_initial_fields_for_form( $form_id );
		}
	}

	/**
	 * 指定フォームに初期3フィールド（氏名 / メールアドレス / 電話番号）を投入する。
	 *
	 * 有効化時のデフォルトデータ投入と、新規フォーム作成直後の初期化で共有する。
	 * これらのフィールドは削除禁止（PROTECTED_KEYS）であり、メール通知の宛先解決
	 * （customer_email 等）が常に成立する前提を担保する。
	 *
	 * 注意: 本メソッドは無条件で挿入する。呼び出し側が「対象フォームがフィールドを
	 * 持たない（新規作成直後・または全体が空）」ことを保証すること。
	 *
	 * @param int $form_id 挿入先フォーム id.
	 * @return void
	 */
	public static function seed_initial_fields_for_form( $form_id ) {
		global $wpdb;

		$defaults = array(
			array(
				'field_key'   => 'customer_name',
				'field_label' => '氏名',
				'field_type'  => 'text',
				'placeholder' => '山田 太郎',
				'is_required' => 1,
				'sort_order'  => 0,
			),
			array(
				'field_key'   => 'customer_email',
				'field_label' => 'メールアドレス',
				'field_type'  => 'email',
				'placeholder' => 'example@example.com',
				'is_required' => 1,
				'sort_order'  => 1,
			),
			array(
				'field_key'   => 'customer_phone',
				'field_label' => '電話番号',
				'field_type'  => 'tel',
				'placeholder' => '090-1234-5678',
				'is_required' => 1,
				'sort_order'  => 2,
			),
		);

		foreach ( $defaults as $field ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->prefix . 'smart_booking_custom_fields',
				array(
					'form_id'       => (int) $form_id,
					'field_key'     => $field['field_key'],
					'field_label'   => $field['field_label'],
					'field_type'    => $field['field_type'],
					'field_options' => '',
					'placeholder'   => $field['placeholder'],
					'is_required'   => $field['is_required'],
					'sort_order'    => $field['sort_order'],
					'created_at'    => current_time( 'mysql' ),
				),
				array( '%d', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s' )
			);
		}
	}
}
