/**
 * v0.4.0 機能② 複数フォーム — E2E 共通ヘルパー（検証専用・配布物外）。
 *
 * - forms テーブル / custom_fields テーブルの form_id ベース掃除
 * - 追加フォーム・予約の直接 INSERT（seed）
 * - フロント予約フォームページ（page_id）のショートコード差し替え
 *
 * ⚠️ wp-env CLI コンテナは並列呼び出しで race するため、DB 操作は同期実行・直列前提
 *    （playwright.config.js の workers=1）。
 */
const path = require( 'node:path' );
const { execSync } = require( 'node:child_process' );

const ROOT = path.resolve( __dirname, '..', '..' );

const FORMS = 'wp_smart_booking_forms';
const CF = 'wp_smart_booking_custom_fields';
const RES = 'wp_smart_booking_reservations';

/**
 * wp db query を同期実行して stdout を返す。
 *
 * @param {string} sql   SQL 文.
 * @param {string} extra 追加フラグ（例 '--skip-column-names'）.
 * @return {string}
 */
function dbq( sql, extra = '' ) {
	return execSync(
		`npx wp-env run cli wp db query ${ JSON.stringify( sql ) } ${ extra }`,
		{
			cwd: ROOT,
			encoding: 'utf8',
			stdio: [ 'ignore', 'pipe', 'pipe' ],
			timeout: 60_000,
		}
	);
}

/**
 * SQL で 1 個の整数値を取り出す（--skip-column-names 前提）。
 *
 * @param {string} sql SQL 文.
 * @return {number}
 */
function scalarInt( sql ) {
	const out = dbq( sql, '--skip-column-names' );
	const m = /(-?\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : -1;
}

/**
 * デフォルトフォーム（is_default=1）の id を返す。
 *
 * @return {number}
 */
function getDefaultFormId() {
	return scalarInt(
		`SELECT id FROM ${ FORMS } WHERE is_default=1 ORDER BY id ASC LIMIT 1;`
	);
}

/**
 * 追加フォームと従属フィールドを掃除し「デフォルトフォーム1件だけ」の状態へ戻す。
 *
 * restoreSnapshot/restoreBaseline は custom_fields を field_key ベースで消すため、
 * 追加フォームの core フィールド（field_key='customer_name' 等だが form_id≠default）が
 * 残る。ここでは form_id ベースで掃除して確実に取りこぼしを無くす。
 *
 * @return {void}
 */
function resetForms() {
	const defId = getDefaultFormId();
	if ( defId > 0 ) {
		dbq(
			`DELETE FROM ${ CF } WHERE form_id NOT IN (${ defId }); DELETE FROM ${ FORMS } WHERE is_default=0;`
		);
	}
}

/**
 * 追加フォームを DB へ直接 INSERT する（REST を介さず form_id を用意したいとき用）。
 * 直接 INSERT なので初期3フィールドは付かない（フィールド不要な満席連動テスト等で使用）。
 *
 * @param {string} name             フォーム名.
 * @param {Object} [opts]
 * @param {number} [opts.sortOrder] 並び順.
 * @return {number} 新しい form id.
 */
function insertForm( name, { sortOrder = 20 } = {} ) {
	const safe = String( name ).replace( /'/g, "''" );
	dbq(
		`INSERT INTO ${ FORMS } (name, is_default, sort_order, created_at, updated_at) VALUES ('${ safe }', 0, ${ sortOrder }, NOW(), NOW());`
	);
	return scalarInt( `SELECT MAX(id) FROM ${ FORMS };` );
}

/**
 * 指定 form_id の予約を 1 件 DB へ直接 INSERT する（削除でも残ることの検証用 seed）。
 *
 * @param {number} formId            フォーム id.
 * @param {Object} [opts]
 * @param {number} [opts.scheduleId]
 * @param {number} [opts.storeId]
 * @param {number} [opts.staffId]
 * @return {number} 新しい reservation id.
 */
function insertReservationForForm(
	formId,
	{ scheduleId = 0, storeId = 2, staffId = 2 } = {}
) {
	dbq(
		`INSERT INTO ${ RES } (form_id, store_id, staff_id, schedule_id, schedule_date, schedule_time, customer_name, customer_email, customer_phone, status, admin_memo, created_at, updated_at) VALUES (${ formId }, ${ storeId }, ${ staffId }, ${ scheduleId }, '2099-01-01', '10:00:00', 'フォーム予約テスト', 'form-res@example.com', '09000000000', 'pending', '', NOW(), NOW());`
	);
	return scalarInt( `SELECT MAX(id) FROM ${ RES };` );
}

/**
 * テーブル件数（任意 WHERE 可）を返す。
 *
 * @param {string} table テーブル名.
 * @param {string} where 'form_id=2' 等（省略時は全件）.
 * @return {number}
 */
function countTable( table, where = '' ) {
	const clause = where ? ` WHERE ${ where }` : '';
	return scalarInt( `SELECT COUNT(*) FROM ${ table }${ clause };` );
}

/**
 * フロント予約フォームが設置されたページの ID を取得する（見つからなければ 5）。
 *
 * @return {number}
 */
function getFrontPageId() {
	try {
		const out = execSync(
			`npx wp-env run cli wp post list --post_type=page --post_status=publish --name=予約フォーム --fields=ID --format=csv --no-headers`,
			{
				cwd: ROOT,
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
				timeout: 30_000,
			}
		);
		const numericLine = out
			.split( '\n' )
			.find( ( l ) => /^\d+$/.test( l.trim() ) );
		return numericLine ? parseInt( numericLine.trim(), 10 ) : 5;
	} catch ( _e ) {
		return 5;
	}
}

/**
 * 指定ページのショートコードを差し替える。
 *
 * @param {number} pageId    ページ ID.
 * @param {string} shortcode 例 '[smart_booking form_id="2"]'.
 * @return {void}
 */
function setFrontShortcode( pageId, shortcode ) {
	const content =
		'<!-- wp:shortcode -->' + shortcode + '<!-- /wp:shortcode -->';
	execSync(
		`npx wp-env run cli wp post update ${ pageId } --post_content=${ JSON.stringify(
			content
		) }`,
		{
			cwd: ROOT,
			encoding: 'utf8',
			stdio: [ 'ignore', 'pipe', 'pipe' ],
			timeout: 30_000,
		}
	);
}

/**
 * フロントページを既定のショートコード `[smart_booking]`（form 指定なし）へ復元する。
 *
 * @param {number} pageId ページ ID.
 * @return {void}
 */
function restoreFrontShortcode( pageId ) {
	setFrontShortcode( pageId, '[smart_booking]' );
}

module.exports = {
	dbq,
	scalarInt,
	getDefaultFormId,
	resetForms,
	insertForm,
	insertReservationForForm,
	countTable,
	getFrontPageId,
	setFrontShortcode,
	restoreFrontShortcode,
	FORMS,
	CF,
	RES,
};
