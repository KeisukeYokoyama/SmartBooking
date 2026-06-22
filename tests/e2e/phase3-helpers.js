/**
 * Phase 3 Eval 用ヘルパー。
 *
 * - フロント予約フォームが設置された page_id=7 へナビゲートするユーティリティ
 * - DB seed / restore（店舗・担当者・スケジュール・設定）
 * - nonce 付き fetch を `smartBookingFrontend` global 経由で叩くヘルパー
 * - フォーム入力ヘルパ
 *
 * ⚠️ 本ファイルの DB 操作は wp-env CLI コンテナを同期実行する。複数テスト間で順序に
 * 依存するため、playwright.config.js の workers=1 前提で使用する。
 */
const path = require( 'node:path' );
const { execSync } = require( 'node:child_process' );

/**
 * wp-env CLI コマンドを同期実行する（pipe 出力を返す）。
 * @param cmd
 */
function wpCli( cmd ) {
	return execSync( `npx wp-env run cli ${ cmd }`, {
		cwd: path.resolve( __dirname, '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
		timeout: 60_000,
	} );
}

/**
 * フロント予約フォームが設置されているページの URL（固定: page_id=5）。
 * wp-env destroy 後の再構築では fresh install の auto_increment により page_id=5 となる。
 */
const FRONT_PAGE_PATH = '/?page_id=5';

/**
 * フロント予約フォームページに遷移して React がマウント完了し、
 * `smartBookingFrontend.nonce` が利用可能になるまで待機する。
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoFrontForm( page ) {
	await page.goto( FRONT_PAGE_PATH, { waitUntil: 'domcontentloaded' } );
	// React のマウント + nonce localize 待ち.
	await page.waitForFunction(
		() =>
			!! window.smartBookingFrontend &&
			!! window.smartBookingFrontend.nonce,
		{ timeout: 15_000 }
	);
	// 初期データロード完了（loading spinner の離脱）を待つ.
	await page
		.waitForSelector( '.smb-front-root .smb-front-loading', {
			state: 'detached',
			timeout: 15_000,
		} )
		.catch( () => {} );
}

/**
 * システムエンティティ方式（is_system カラム導入）に伴うベースライン:
 *
 * - id=1: name='デフォルト', is_system=1, is_active=1（ユーザーには非表示のシステムエンティティ）
 * - id=2: name='店舗1' / '担当者1', is_system=0, is_active=1（ユーザーが作成した相当）
 * - スケジュール 0、予約 0、初期カスタムフィールド 3
 *
 * 既存テストが ID=2 の「店舗1 / 担当者1」を期待するため、AUTO_INCREMENT を 2 に揃える。
 */
const USER_STORE_ID = 2;
const USER_STAFF_ID = 2;

function restoreBaseline() {
	wpCli(
		`wp db query "DELETE FROM wp_smabo_reservation_meta; DELETE FROM wp_smabo_reservations; DELETE FROM wp_smabo_schedules; DELETE FROM wp_smabo_staff WHERE id > 1; DELETE FROM wp_smabo_stores WHERE id > 1; UPDATE wp_smabo_stores SET name='デフォルト', is_active=1, is_system=1, calendar_color='#3B82F6' WHERE id = 1; UPDATE wp_smabo_staff SET name='デフォルト', is_active=1, is_system=1, store_id=1 WHERE id = 1; ALTER TABLE wp_smabo_stores AUTO_INCREMENT=2; ALTER TABLE wp_smabo_staff AUTO_INCREMENT=2; INSERT INTO wp_smabo_stores (id, name, phone, email, prefecture, city, address_line, description, image_id, calendar_color, is_active, is_system, sort_order, created_at, updated_at) VALUES (${ USER_STORE_ID }, '店舗1', '', '', '', '', '', '', 0, '#3B82F6', 1, 0, 10, NOW(), NOW()); INSERT INTO wp_smabo_staff (id, store_id, name, email, phone, description, image_id, sort_order, is_active, is_system, created_at, updated_at) VALUES (${ USER_STAFF_ID }, ${ USER_STORE_ID }, '担当者1', '', '', '', 0, 10, 1, 0, NOW(), NOW()); ALTER TABLE wp_smabo_stores AUTO_INCREMENT=3; ALTER TABLE wp_smabo_staff AUTO_INCREMENT=3; DELETE FROM wp_smabo_custom_fields WHERE field_key NOT IN ('customer_name','customer_email','customer_phone'); UPDATE wp_smabo_custom_fields SET field_label='お名前', field_type='text', is_required=1 WHERE field_key='customer_name'; UPDATE wp_smabo_custom_fields SET field_label='メールアドレス', field_type='email', is_required=1 WHERE field_key='customer_email'; UPDATE wp_smabo_custom_fields SET field_label='電話番号', field_type='tel', is_required=1 WHERE field_key='customer_phone';"`
	);
	// オプションのリセット: テスト中に書き換える可能性のあるキーは全て delete し、
	// 既定値（CLAUDE.md の class-activator.php と class-rest-public.php に基づく）に戻す.
	// NOTE: phase6-visibility 等で smabo_show_store_front / smabo_show_staff_front を 0 に
	// 上書きするテストがあるため、それらも必ずクリアする（残ると後続テストが
	// 「show_store_front=false → 店舗ステップスキップ」になり予期せぬ失敗を起こす）。
	const optionsToDelete = [
		'smabo_booking_flow_order',
		'smabo_completion_message',
		'smabo_booking_deadline_days',
		'smabo_booking_deadline_hours',
		'smabo_calendar_view_mode',
		'smabo_display_days',
		'smabo_color_button',
		'smabo_color_date_selected',
		'smabo_color_time_selected',
		'smabo_color_required_mark',
		'smabo_color_focus',
		'smabo_show_store_front',
		'smabo_show_staff_front',
	];
	optionsToDelete.forEach( ( k ) => {
		try {
			wpCli( `wp option delete ${ k }` );
		} catch ( _e ) {
			// 既に未設定なら無視.
		}
	} );
}

/**
 * システムエンティティ（id=1）のみが存在するベースライン。ユーザー店舗・担当者は 0 件。
 * 「ユーザー作成エンティティが 0 件」の挙動を確認したいテスト（phase7 等）で使う。
 */
function restoreBaselineSystemOnly() {
	wpCli(
		`wp db query "DELETE FROM wp_smabo_reservation_meta; DELETE FROM wp_smabo_reservations; DELETE FROM wp_smabo_schedules; DELETE FROM wp_smabo_staff WHERE id > 1; DELETE FROM wp_smabo_stores WHERE id > 1; UPDATE wp_smabo_stores SET name='デフォルト', is_active=1, is_system=1, calendar_color='#3B82F6' WHERE id = 1; UPDATE wp_smabo_staff SET name='デフォルト', is_active=1, is_system=1, store_id=1 WHERE id = 1; ALTER TABLE wp_smabo_stores AUTO_INCREMENT=2; ALTER TABLE wp_smabo_staff AUTO_INCREMENT=2; DELETE FROM wp_smabo_custom_fields WHERE field_key NOT IN ('customer_name','customer_email','customer_phone'); UPDATE wp_smabo_custom_fields SET field_label='お名前', field_type='text', is_required=1 WHERE field_key='customer_name'; UPDATE wp_smabo_custom_fields SET field_label='メールアドレス', field_type='email', is_required=1 WHERE field_key='customer_email'; UPDATE wp_smabo_custom_fields SET field_label='電話番号', field_type='tel', is_required=1 WHERE field_key='customer_phone';"`
	);
}

/**
 * 指定オプションを設定する。
 * @param key
 * @param value
 */
function setOption( key, value ) {
	// single quote は \" でエスケープしない（bash 経由なので "xxx" でラップ）。
	const safe = String( value ).replace( /"/g, '\\"' );
	wpCli( `wp option update ${ key } "${ safe }"` );
}

/**
 * 店舗を追加する。戻り値: 新しい store id。
 * @param name
 * @param root0
 * @param root0.is_active
 * @param root0.sort_order
 * @param root0.calendar_color
 */
function insertStore(
	name,
	{ is_active = 1, sort_order = 20, calendar_color = '#2271b1' } = {}
) {
	const sql = `INSERT INTO wp_smabo_stores (name, phone, email, prefecture, city, address_line, description, image_id, calendar_color, is_active, is_system, sort_order, created_at, updated_at) VALUES ('${ name.replace(
		/'/g,
		"''"
	) }', '', '', '', '', '', '', 0, '${ calendar_color }', ${ is_active }, 0, ${ sort_order }, NOW(), NOW());`;
	wpCli( `wp db query "${ sql }"` );
	const out = wpCli(
		`wp db query "SELECT MAX(id) FROM wp_smabo_stores;" --skip-column-names`
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : 0;
}

/**
 * 担当者を追加する。戻り値: 新しい staff id。
 * @param storeId
 * @param name
 * @param root0
 * @param root0.is_active
 * @param root0.sort_order
 */
function insertStaff( storeId, name, { is_active = 1, sort_order = 20 } = {} ) {
	const sql = `INSERT INTO wp_smabo_staff (store_id, name, email, phone, description, image_id, sort_order, is_active, is_system, created_at, updated_at) VALUES (${ storeId }, '${ name.replace(
		/'/g,
		"''"
	) }', '', '', '', 0, ${ sort_order }, ${ is_active }, 0, NOW(), NOW());`;
	wpCli( `wp db query "${ sql }"` );
	const out = wpCli(
		`wp db query "SELECT MAX(id) FROM wp_smabo_staff;" --skip-column-names`
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : 0;
}

/**
 * スケジュールを 1 件追加する。capacity デフォルト 3、booked_count=0、is_active=1。
 *
 * @param {Object} p
 * @param {number} p.storeId
 * @param {number} p.staffId
 * @param {string} p.date     YYYY-MM-DD
 * @param {string} p.start    HH:MM:SS
 * @param {string} p.end      HH:MM:SS
 * @param          p.capacity
 */
function insertSchedule( {
	storeId,
	staffId,
	date,
	start,
	end,
	capacity = 3,
} ) {
	const sql = `INSERT INTO wp_smabo_schedules (store_id, staff_id, schedule_date, start_time, end_time, capacity, booked_count, is_active, created_at, updated_at) VALUES (${ storeId }, ${ staffId }, '${ date }', '${ start }', '${ end }', ${ capacity }, 0, 1, NOW(), NOW());`;
	wpCli( `wp db query "${ sql }"` );
	const out = wpCli(
		`wp db query "SELECT MAX(id) FROM wp_smabo_schedules;" --skip-column-names`
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : 0;
}

/**
 * 複数スケジュールを 1 回の wp-cli 呼び出しでバルク挿入する。
 *
 * @param {Array<{storeId:number, staffId:number, date:string, start:string, end:string, capacity?:number}>} rows
 */
function insertSchedulesBulk( rows ) {
	if ( ! rows || rows.length === 0 ) {
		return;
	}
	const values = rows
		.map(
			( r ) =>
				`(${ r.storeId }, ${ r.staffId }, '${ r.date }', '${
					r.start
				}', '${ r.end }', ${ r.capacity || 3 }, 0, 1, NOW(), NOW())`
		)
		.join( ', ' );
	const sql = `INSERT INTO wp_smabo_schedules (store_id, staff_id, schedule_date, start_time, end_time, capacity, booked_count, is_active, created_at, updated_at) VALUES ${ values };`;
	wpCli( `wp db query "${ sql }"` );
}

/**
 * テーブル件数を返す。
 * @param table
 */
function countRows( table ) {
	const out = wpCli(
		`wp db query "SELECT COUNT(*) FROM ${ table };" --skip-column-names`
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : -1;
}

/**
 * 指定スケジュール行の booked_count を返す。
 * @param scheduleId
 */
function getScheduleBookedCount( scheduleId ) {
	const out = wpCli(
		`wp db query "SELECT booked_count FROM wp_smabo_schedules WHERE id = ${ scheduleId };" --skip-column-names`
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : -1;
}

/**
 * 最新の予約情報（id, status, customer_name, schedule_id）を返す。
 */
function getLatestReservation() {
	const out = wpCli(
		`wp db query "SELECT id, status, customer_name, schedule_id FROM wp_smabo_reservations ORDER BY id DESC LIMIT 1;" --skip-column-names`
	);
	const line = out
		.split( '\n' )
		.map( ( s ) => s.trim() )
		.find( ( s ) => /^\d/.test( s ) );
	if ( ! line ) {
		return null;
	}
	const parts = line.split( /\s+/ );
	return {
		id: parseInt( parts[ 0 ], 10 ),
		status: parts[ 1 ],
		customer_name: parts.slice( 2, -1 ).join( ' ' ),
		schedule_id: parseInt( parts[ parts.length - 1 ], 10 ),
	};
}

/**
 * YYYY-MM-DD 形式で today + offset 日後を返す（サーバ TZ を想定。
 * playwright は同 host で wp-env と同じタイムゾーン上で動作するため日付ズレは無視できる）。
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

/**
 * 指定 ymd の曜日 index を返す（日=0 〜 土=6）。
 * @param ymdStr
 */
function weekdayIndex( ymdStr ) {
	return new Date( ymdStr + 'T00:00:00' ).getDay();
}

/**
 * 公開 REST を `page.evaluate` 経由で叩く。smartBookingFrontend.nonce を使用。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          endpoint         'public/stores' など
 * @param {Object}                          [opts]
 * @param {string}                          [opts.method]    'GET' (default) / 'POST'
 * @param {Object}                          [opts.body]
 * @param {Object}                          [opts.query]
 * @param {boolean}                         [opts.sendNonce] default: true
 */
async function publicRest( page, endpoint, opts = {} ) {
	const method = opts.method || 'GET';
	const sendNonce = opts.sendNonce !== false;
	return page.evaluate(
		async ( { endpoint, method, body, query, sendNonce } ) => {
			const ctx = window.smartBookingFrontend || {};
			const restUrl = ctx.restUrl || '/wp-json/smart-booking/v1/';
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
				restUrl.replace( /\/$/, '' ) +
				'/' +
				endpoint.replace( /^\//, '' ) +
				qs;
			const headers = { Accept: 'application/json' };
			if ( sendNonce ) {
				headers[ 'X-WP-Nonce' ] = ctx.nonce;
			}
			const init = { method, credentials: 'same-origin', headers };
			if ( body !== null && body !== undefined ) {
				headers[ 'Content-Type' ] = 'application/json';
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
		{
			endpoint,
			method,
			body: opts.body || null,
			query: opts.query || null,
			sendNonce,
		}
	);
}

/**
 * 必須3フィールドにサンプル値を入れて確認画面へ進む。
 * @param page
 * @param root0
 * @param root0.name
 * @param root0.email
 * @param root0.phone
 */
async function fillCoreFormAndGoConfirm(
	page,
	{
		name = 'テスト 太郎',
		email = 'test@example.com',
		phone = '090-0000-0000',
	} = {}
) {
	await page.locator( '#smb-front-field-customer_name' ).fill( name );
	await page.locator( '#smb-front-field-customer_email' ).fill( email );
	await page.locator( '#smb-front-field-customer_phone' ).fill( phone );
	// Gen-A 以降: MainInputPage の集約ボタン「予約内容の確認」を押す。
	// 旧版の FormInput 内ボタン「確認画面へ進む」も後方互換として一応探索する。
	const newBtn = page.getByRole( 'button', { name: '予約内容の確認' } );
	if ( ( await newBtn.count() ) > 0 ) {
		await newBtn.click();
	} else {
		await page
			.getByRole( 'button', { name: '確認画面へ進む' } )
			.click();
	}
	await page.waitForSelector( '.smb-front-confirm-page, .smb-front-confirm', {
		timeout: 10_000,
	} );
}

module.exports = {
	FRONT_PAGE_PATH,
	gotoFrontForm,
	restoreBaseline,
	restoreBaselineSystemOnly,
	setOption,
	insertStore,
	insertStaff,
	insertSchedule,
	insertSchedulesBulk,
	countRows,
	getScheduleBookedCount,
	getLatestReservation,
	publicRest,
	fillCoreFormAndGoConfirm,
	ymd,
	weekdayIndex,
	USER_STORE_ID,
	USER_STAFF_ID,
};
