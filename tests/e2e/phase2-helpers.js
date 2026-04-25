/**
 * Phase 2 共通ヘルパー。
 *
 * - REST API 呼び出しは `page.evaluate` で nonce 付き fetch を叩く
 *   （wp-env CLI コンテナの並列起動による race condition を回避）
 * - テストデータのクリーンアップは wp_smb_* テーブルを TRUNCATE/DELETE
 *   するのではなく、API 経由で個別削除するのが理想だが、高速化のため DB 直接も許容
 */
const path = require( 'node:path' );
const { execSync } = require( 'node:child_process' );
const { loginAsAdmin } = require( './helpers' );

/**
 * 管理画面の任意ページに遷移し、window.smartBookingAdmin (restUrl + nonce) を使って fetch を叩く。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          method
 * @param {string}                          endpoint - 'stores' / 'schedules/copy' など
 * @param {object|null}                     body     - JSON body
 * @param {object|null}                     query    - URL クエリ
 * @return {Promise<{ok: boolean, status: number, data: any}>}
 */
async function restCall( page, method, endpoint, body = null, query = null ) {
	return page.evaluate(
		async ( { method, endpoint, body, query } ) => {
			const ctx = window.smartBookingAdmin || {};
			const qs = query
				? '?' +
				  Object.entries( query )
						.filter(
							( [ , v ] ) =>
								v !== undefined && v !== null && v !== ''
						)
						.map(
							( [ k, v ] ) =>
								encodeURIComponent( k ) +
								'=' +
								encodeURIComponent( v )
						)
						.join( '&' )
				: '';
			const url =
				ctx.restUrl.replace( /\/$/, '' ) +
				'/' +
				endpoint.replace( /^\//, '' ) +
				qs;
			const init = {
				method,
				credentials: 'same-origin',
				headers: {
					'X-WP-Nonce': ctx.nonce,
					Accept: 'application/json',
				},
			};
			if ( body !== null && body !== undefined ) {
				init.headers[ 'Content-Type' ] = 'application/json';
				init.body = JSON.stringify( body );
			}
			const res = await fetch( url, init );
			let data = null;
			try {
				data = await res.json();
			} catch {
				// noop.
			}
			return { ok: res.ok, status: res.status, data };
		},
		{ method, endpoint, body, query }
	);
}

/**
 * ログインして admin ページを開き、REST API の window オブジェクトが使える状態にする。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          [pageKey] 'schedule' | 'reservations' | ...
 */
async function bootstrapAdmin( page, pageKey = 'schedule' ) {
	await loginAsAdmin( page );
	const slug =
		pageKey === 'schedule' ? 'smart-booking' : 'smart-booking-' + pageKey;
	await page.goto( `/wp-admin/admin.php?page=${ slug }` );
	// React 初期化を待つ（smartBookingAdmin global は class-admin.php で localize されているため常に存在）
	await page.waitForFunction( () => !! window.smartBookingAdmin?.nonce, {
		timeout: 15000,
	} );
}

/**
 * wp-cli で DB を直接クリアする（テスト start 時にクリーンに戻す）。
 *
 * 予約 → スケジュール（予約を消してから順に削除）→ は Phase 1 スナップショットに影響しない。
 * 店舗・担当者・カスタムフィールドはスナップショットと件数比較して差分だけ削除する。
 */
function resetSchedulesAndReservations() {
	try {
		execSync(
			'npx wp-env run cli wp db query "DELETE FROM wp_smb_reservation_meta; DELETE FROM wp_smb_reservations; DELETE FROM wp_smb_schedules;"',
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
				timeout: 30000,
			}
		);
	} catch ( _e ) {
		// noop.
	}
}

/**
 * Phase 1 スナップショットに存在しない余分な店舗・担当者・カスタムフィールドを削除する。
 */
function restoreSnapshot() {
	try {
		// id=1 の既定の店舗・担当者だけを残す + id=1 の状態を初期値にリセット.
		execSync(
			`npx wp-env run cli wp db query "DELETE FROM wp_smb_reservation_meta; DELETE FROM wp_smb_reservations; DELETE FROM wp_smb_schedules; DELETE FROM wp_smb_staff WHERE id > 1; DELETE FROM wp_smb_stores WHERE id > 1; UPDATE wp_smb_stores SET name='店舗1', is_active=1, calendar_color='#3B82F6' WHERE id = 1; UPDATE wp_smb_staff SET name='担当者1', is_active=1, store_id=1 WHERE id = 1;"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
				timeout: 30000,
			}
		);
		// 初期カスタムフィールド（customer_name/email/phone）以外を削除 + 初期フィールドの label/type/required をリセット.
		execSync(
			`npx wp-env run cli wp db query "DELETE FROM wp_smb_custom_fields WHERE field_key NOT IN ('customer_name','customer_email','customer_phone'); UPDATE wp_smb_custom_fields SET field_label='お名前', field_type='text', is_required=1 WHERE field_key='customer_name'; UPDATE wp_smb_custom_fields SET field_label='メールアドレス', field_type='email', is_required=1 WHERE field_key='customer_email'; UPDATE wp_smb_custom_fields SET field_label='電話番号', field_type='tel', is_required=1 WHERE field_key='customer_phone';"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
				timeout: 30000,
			}
		);
	} catch ( _e ) {
		// noop.
	}
}

/**
 * 店舗を DB に直接 INSERT する（REST POST の既知バグ回避用）。
 *
 * Bug: includes/rest/class-rest-stores.php `create_item` が
 * `get_item(new WP_REST_Request('GET', '', array('id' => $id)))` と
 * 構築しており、WP_REST_Request の3引数は $attributes なので id パラメタが
 * 渡らず常に 404 を返す（DB 挿入自体は成功する）。
 *
 * @return {number} insert_id
 */
/**
 * 末尾行 id を SELECT MAX で取得（LAST_INSERT_ID はセッション非共有のため使えない）。
 * @param table
 */
function maxId( table ) {
	const out = execSync(
		`npx wp-env run cli wp db query "SELECT MAX(id) FROM ${ table };" --skip-column-names`,
		{
			cwd: path.resolve( __dirname, '..', '..' ),
			encoding: 'utf8',
			stdio: [ 'ignore', 'pipe', 'pipe' ],
			timeout: 30000,
		}
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : 0;
}

function insertStoreDirectly( {
	name,
	calendar_color = '#2271b1',
	is_active = 1,
	sort_order = 20,
} ) {
	const sql = `INSERT INTO wp_smb_stores (name, phone, email, prefecture, city, address_line, description, image_id, calendar_color, is_active, sort_order, created_at, updated_at) VALUES ('${ name.replace(
		/'/g,
		"''"
	) }', '', '', '', '', '', '', 0, '${ calendar_color }', ${ is_active }, ${ sort_order }, NOW(), NOW());`;
	execSync( `npx wp-env run cli wp db query "${ sql }"`, {
		cwd: path.resolve( __dirname, '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
		timeout: 30000,
	} );
	return maxId( 'wp_smb_stores' );
}

/**
 * 担当者を DB に直接 INSERT する（REST POST の既知バグ回避用）。
 * @param root0
 * @param root0.store_id
 * @param root0.name
 * @param root0.is_active
 * @param root0.sort_order
 */
function insertStaffDirectly( {
	store_id,
	name,
	is_active = 1,
	sort_order = 20,
} ) {
	const sql = `INSERT INTO wp_smb_staff (store_id, name, email, phone, description, image_id, sort_order, is_active, created_at, updated_at) VALUES (${ store_id }, '${ name.replace(
		/'/g,
		"''"
	) }', '', '', '', 0, ${ sort_order }, ${ is_active }, NOW(), NOW());`;
	execSync( `npx wp-env run cli wp db query "${ sql }"`, {
		cwd: path.resolve( __dirname, '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
		timeout: 30000,
	} );
	return maxId( 'wp_smb_staff' );
}

/**
 * 指定テーブルの件数を返す。
 * @param table
 */
function countTable( table ) {
	const out = execSync(
		`npx wp-env run cli wp db query "SELECT COUNT(*) FROM ${ table };" --skip-column-names`,
		{
			cwd: path.resolve( __dirname, '..', '..' ),
			encoding: 'utf8',
			stdio: [ 'ignore', 'pipe', 'pipe' ],
			timeout: 30000,
		}
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : 0;
}

/**
 * 日付ヘルパ。
 * @param offsetDays
 */
function ymd( offsetDays = 0 ) {
	const d = new Date();
	d.setDate( d.getDate() + offsetDays );
	return (
		d.getFullYear() +
		'-' +
		String( d.getMonth() + 1 ).padStart( 2, '0' ) +
		'-' +
		String( d.getDate() ).padStart( 2, '0' )
	);
}

module.exports = {
	restCall,
	bootstrapAdmin,
	resetSchedulesAndReservations,
	restoreSnapshot,
	insertStoreDirectly,
	insertStaffDirectly,
	countTable,
	ymd,
};
