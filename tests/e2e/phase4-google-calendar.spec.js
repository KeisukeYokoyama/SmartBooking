/**
 * Phase 4 Eval-B: Google Calendar 連携 E2E テスト。
 *
 * 実 Google Calendar API を相手にしたエンドツーエンド検証。
 *   - 認証情報マスク（GET /settings は raw JSON を返さない）
 *   - 承認時にイベント作成（_smb_gcal_event_id meta が保存される）
 *   - キャンセル時にイベント削除（meta 行が消える）
 *   - 機能 OFF 時は no-op（meta が作られない）
 *   - 不正 JSON は 400 / smb_credentials_invalid
 *   - センチネル `***configured***` の round-trip では既存値が保持される
 *
 * 認証情報は credentials/.env と credentials/<service-account>.json から実行時に読み込む。
 * いずれかが欠けている場合は test.skip() でスキップする。
 *
 * 実行: `npx playwright test tests/e2e/phase4-google-calendar.spec.js --project=desktop`
 */
const { test, expect } = require( '@playwright/test' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const {
	restoreBaseline,
	insertSchedule,
	publicRest,
	gotoFrontForm,
	ymd,
} = require( './phase3-helpers' );
const { wpCli, loginAsAdmin } = require( './helpers' );

test.describe.configure( { mode: 'serial' } );

// ---------------------------------------------------------------
// 認証情報の読み込み（spec トップレベル: 早期 fail-fast 用）.
// ---------------------------------------------------------------
const CREDS_DIR = path.resolve( __dirname, '..', '..', 'credentials' );
const CREDS_JSON_PATH = path.join(
	CREDS_DIR,
	'smart-booking-494407-9dc22d97fd24.json'
);
const ENV_PATH = path.join( CREDS_DIR, '.env' );

let CREDENTIALS_AVAILABLE = false;
let CREDS_JSON_RAW = '';
let CLIENT_EMAIL = '';
let CALENDAR_ID = '';

try {
	if ( fs.existsSync( CREDS_JSON_PATH ) && fs.existsSync( ENV_PATH ) ) {
		CREDS_JSON_RAW = fs.readFileSync( CREDS_JSON_PATH, 'utf8' );
		const parsed = JSON.parse( CREDS_JSON_RAW );
		CLIENT_EMAIL = String( parsed.client_email || '' );

		const envText = fs.readFileSync( ENV_PATH, 'utf8' );
		const m = envText.match( /^GOOGLE_CALENDAR_ID=(.+)$/m );
		if ( m ) {
			CALENDAR_ID = m[ 1 ].trim();
		}

		if ( CLIENT_EMAIL && CALENDAR_ID ) {
			CREDENTIALS_AVAILABLE = true;
		}
	}
} catch ( _e ) {
	CREDENTIALS_AVAILABLE = false;
}

/**
 * SQL 文字列リテラルとして安全な形にエスケープ.
 * @param {string} v
 * @return {string}
 */
function sqlQuote( v ) {
	return String( v ).replace( /'/g, "''" );
}

/**
 * 直接 wp option update / wp eval で GCal 設定を書き換える（REST 経由のテスト 1 番以外で使用）.
 *
 * credentials JSON は改行 / シングルクォート / 特殊文字を含むため `wp db query` には渡せない。
 * base64 で wp eval に渡し、PHP 側でデコードして update_option する。
 *
 * @param {{enabled: number, calendarId?: string, json?: string, clientEmail?: string}} cfg
 */
function setGcalSettingsDirect( cfg ) {
	wpCli(
		`option update smb_google_calendar_enabled ${ cfg.enabled ? 1 : 0 }`
	);
	if ( typeof cfg.calendarId === 'string' ) {
		wpCli(
			`option update smb_google_calendar_id "${ cfg.calendarId.replace(
				/"/g,
				'\\"'
			) }"`
		);
	}
	if ( typeof cfg.json === 'string' ) {
		// base64 経由で安全に PHP に渡す.
		const b64 = Buffer.from( cfg.json, 'utf8' ).toString( 'base64' );
		// wp eval にシングルクォートで囲んだ PHP コードを渡す（base64 文字列はクォート不要）.
		const php = `update_option('smb_google_calendar_credentials_json', base64_decode('${ b64 }'), false);`;
		wpCli( `eval "${ php }"` );
	}
	if ( typeof cfg.clientEmail === 'string' ) {
		wpCli(
			`option update smb_google_calendar_client_email "${ cfg.clientEmail.replace(
				/"/g,
				'\\"'
			) }"`
		);
	}
}

/**
 * Google カレンダー連携設定を全削除する（クリーンアップ用）.
 */
function clearGcalSettings() {
	wpCli( `option delete smb_google_calendar_enabled` );
	wpCli( `option delete smb_google_calendar_id` );
	wpCli( `option delete smb_google_calendar_credentials_json` );
	wpCli( `option delete smb_google_calendar_client_email` );
	// トークン transient もクリア（前回テストの残存トークンが期限内に再利用されるのを避ける）.
	wpCli( `transient delete smb_gcal_token` );
}

/**
 * 指定 reservation_id の _smb_gcal_event_id meta を取得する。
 * @param {number} reservationId
 * @return {string} 見つからなければ空文字。
 */
function getGcalEventIdMeta( reservationId ) {
	const out = wpCli(
		`db query "SELECT meta_value FROM wp_smb_reservation_meta WHERE reservation_id=${ reservationId } AND meta_key='_smb_gcal_event_id' LIMIT 1;" --skip-column-names`
	);
	const lines = out
		.split( '\n' )
		.map( ( s ) => s.trim() )
		.filter( ( s ) => s.length > 0 && ! s.startsWith( 'ℹ' ) && ! s.startsWith( '✔' ) );
	return lines[ 0 ] || '';
}

/**
 * REST 経由で settings を一括 POST する。admin ログイン済みの page を使う。
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, any>} settings
 * @return {Promise<{ok:boolean,status:number,data:any}>}
 */
async function postSettings( page, settings ) {
	// admin nonce が必要なので wp-admin 配下に居る前提.
	const nonce = await page.evaluate( () => {
		return window.wpApiSettings && window.wpApiSettings.nonce
			? window.wpApiSettings.nonce
			: '';
	} );
	if ( ! nonce ) {
		throw new Error( 'admin nonce not available' );
	}
	return page.evaluate(
		async ( { settings, nonce } ) => {
			const res = await fetch(
				'/wp-json/smart-booking/v1/settings',
				{
					method: 'POST',
					credentials: 'same-origin',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': nonce,
						Accept: 'application/json',
					},
					body: JSON.stringify( { settings } ),
				}
			);
			let data = null;
			try {
				data = await res.json();
			} catch {
				/* noop */
			}
			return { ok: res.ok, status: res.status, data };
		},
		{ settings, nonce }
	);
}

/**
 * REST 経由で settings を GET する。admin ログイン済みの page で実行.
 * @param {import('@playwright/test').Page} page
 * @return {Promise<{ok:boolean,status:number,data:any}>}
 */
async function getSettings( page ) {
	const nonce = await page.evaluate( () => {
		return window.wpApiSettings && window.wpApiSettings.nonce
			? window.wpApiSettings.nonce
			: '';
	} );
	return page.evaluate( async ( { nonce } ) => {
		const res = await fetch( '/wp-json/smart-booking/v1/settings', {
			method: 'GET',
			credentials: 'same-origin',
			headers: {
				'X-WP-Nonce': nonce,
				Accept: 'application/json',
			},
		} );
		let data = null;
		try {
			data = await res.json();
		} catch {
			/* noop */
		}
		return { ok: res.ok, status: res.status, data };
	}, { nonce } );
}

/**
 * 予約の status を REST PATCH で変更する（admin ログイン済み page で）.
 * @param {import('@playwright/test').Page} page
 * @param {number} reservationId
 * @param {string} status
 */
async function patchReservationStatus( page, reservationId, status ) {
	const nonce = await page.evaluate( () => {
		return window.wpApiSettings && window.wpApiSettings.nonce
			? window.wpApiSettings.nonce
			: '';
	} );
	return page.evaluate(
		async ( { id, status, nonce } ) => {
			const res = await fetch(
				`/wp-json/smart-booking/v1/reservations/${ id }`,
				{
					method: 'PATCH',
					credentials: 'same-origin',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': nonce,
						Accept: 'application/json',
					},
					body: JSON.stringify( { status } ),
				}
			);
			let data = null;
			try {
				data = await res.json();
			} catch {
				/* noop */
			}
			return { ok: res.ok, status: res.status, data };
		},
		{ id: reservationId, status, nonce }
	);
}

/**
 * 公開 REST 経由で予約を作成する。
 * @param {import('@playwright/test').Page} page
 * @param {number} scheduleId
 * @param {{name:string,email:string,phone:string}} customer
 */
async function submitPublicReservation( page, scheduleId, customer ) {
	const res = await publicRest( page, 'public/reservations', {
		method: 'POST',
		body: {
			schedule_id: scheduleId,
			customer_name: customer.name,
			customer_email: customer.email,
			customer_phone: customer.phone,
		},
	} );
	if ( res.status !== 200 && res.status !== 201 ) {
		throw new Error(
			`public/reservations failed: status=${ res.status } body=${ JSON.stringify(
				res.data
			) }`
		);
	}
	return res.data;
}

// ---------------------------------------------------------------
// テスト本体.
// ---------------------------------------------------------------
test.describe( 'Phase 4 Eval-B: Google Calendar 連携', () => {
	test.skip(
		! CREDENTIALS_AVAILABLE,
		`credentials missing: ${ CREDS_JSON_PATH } / ${ ENV_PATH } のいずれかが見つからないか不正です`
	);

	test.setTimeout( 90_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		clearGcalSettings();
	} );

	test.afterAll( async () => {
		clearGcalSettings();
		restoreBaseline();
	} );

	// ----------------------------------------------------------------
	// 1. 設定保存とマスク
	// ----------------------------------------------------------------
	test( '設定保存後、GET /settings は credentials_json をマスクし client_email を返す', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking-settings', {
			waitUntil: 'domcontentloaded',
		} );
		// wpApiSettings nonce が読めるまで待つ.
		await page.waitForFunction(
			() => !! ( window.wpApiSettings && window.wpApiSettings.nonce ),
			{ timeout: 10_000 }
		);

		// 1) 保存.
		const post = await postSettings( page, {
			smb_google_calendar_enabled: 1,
			smb_google_calendar_id: CALENDAR_ID,
			smb_google_calendar_credentials_json: CREDS_JSON_RAW,
		} );
		expect(
			post.status,
			`POST /settings: ${ JSON.stringify( post ) }`
		).toBe( 200 );
		expect( post.data?.settings?.smb_google_calendar_credentials_json ).toBe(
			'***configured***'
		);

		// 2) GET でマスク確認.
		const get = await getSettings( page );
		expect( get.status ).toBe( 200 );
		const settings = get.data?.settings || {};
		expect( settings.smb_google_calendar_credentials_json ).toBe(
			'***configured***'
		);
		expect( settings.smb_google_calendar_credentials_json ).not.toContain(
			'private_key'
		);
		expect( settings.smb_google_calendar_client_email ).toBe( CLIENT_EMAIL );
		expect( Number( settings.smb_google_calendar_enabled ) ).toBe( 1 );
		expect( settings.smb_google_calendar_id ).toBe( CALENDAR_ID );
	} );

	// ----------------------------------------------------------------
	// 2. 承認時にイベント作成 + 3. キャンセル時にイベント削除（連続）
	// ----------------------------------------------------------------
	test( '承認 → イベント meta が保存される / キャンセル → meta が削除される', async ( {
		page,
	} ) => {
		// 直接オプションへ書き込み（REST 経由は test 1 で網羅済み）.
		setGcalSettingsDirect( {
			enabled: 1,
			calendarId: CALENDAR_ID,
			json: CREDS_JSON_RAW,
			clientEmail: CLIENT_EMAIL,
		} );

		// schedule + 予約.
		const scheduleId = insertSchedule( {
			storeId: 1,
			staffId: 1,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		expect( scheduleId ).toBeGreaterThan( 0 );

		await gotoFrontForm( page );
		const created = await submitPublicReservation( page, scheduleId, {
			name: 'GCal 太郎',
			email: 'gcal-taro@example.com',
			phone: '080-0000-1111',
		} );
		const reservationId = Number( created?.id || created?.reservation_id );
		expect( reservationId ).toBeGreaterThan( 0 );

		// admin ログインして承認 PATCH.
		await loginAsAdmin( page );
		await page.goto(
			'/wp-admin/admin.php?page=smart-booking-reservations',
			{ waitUntil: 'domcontentloaded' }
		);
		await page.waitForFunction(
			() => !! ( window.wpApiSettings && window.wpApiSettings.nonce ),
			{ timeout: 10_000 }
		);
		const approveRes = await patchReservationStatus(
			page,
			reservationId,
			'approved'
		);
		expect(
			approveRes.status,
			`PATCH approved: ${ JSON.stringify( approveRes ) }`
		).toBe( 200 );

		// API レイテンシ吸収 + meta poll. 最大 ~20s 待つ.
		let eventId = '';
		const t0 = Date.now();
		while ( Date.now() - t0 < 20_000 ) {
			eventId = getGcalEventIdMeta( reservationId );
			if ( eventId ) {
				break;
			}
			await new Promise( ( r ) => setTimeout( r, 1000 ) );
		}
		expect(
			eventId,
			`_smb_gcal_event_id meta が保存されない（API 失敗の可能性）`
		).not.toBe( '' );

		// 3. キャンセル → meta 削除.
		const cancelRes = await patchReservationStatus(
			page,
			reservationId,
			'cancelled'
		);
		expect(
			cancelRes.status,
			`PATCH cancelled: ${ JSON.stringify( cancelRes ) }`
		).toBe( 200 );

		// meta 行は削除フックで即座に DELETE される（API DELETE 結果に関わらず）.
		// 念のため数秒 poll.
		let removed = false;
		const t1 = Date.now();
		while ( Date.now() - t1 < 10_000 ) {
			if ( '' === getGcalEventIdMeta( reservationId ) ) {
				removed = true;
				break;
			}
			await new Promise( ( r ) => setTimeout( r, 500 ) );
		}
		expect(
			removed,
			`_smb_gcal_event_id meta がキャンセル後も残存`
		).toBe( true );
	} );

	// ----------------------------------------------------------------
	// 4. 無効化時は no-op
	// ----------------------------------------------------------------
	test( 'enabled=0 のときは承認しても _smb_gcal_event_id meta が作られない', async ( {
		page,
	} ) => {
		// 認証情報は揃っているが、enabled=0.
		setGcalSettingsDirect( {
			enabled: 0,
			calendarId: CALENDAR_ID,
			json: CREDS_JSON_RAW,
			clientEmail: CLIENT_EMAIL,
		} );

		const scheduleId = insertSchedule( {
			storeId: 1,
			staffId: 1,
			date: ymd( 1 ),
			start: '12:00:00',
			end: '13:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		const created = await submitPublicReservation( page, scheduleId, {
			name: 'GCal 無効',
			email: 'gcal-noop@example.com',
			phone: '080-0000-2222',
		} );
		const reservationId = Number( created?.id || created?.reservation_id );

		await loginAsAdmin( page );
		await page.goto(
			'/wp-admin/admin.php?page=smart-booking-reservations',
			{ waitUntil: 'domcontentloaded' }
		);
		await page.waitForFunction(
			() => !! ( window.wpApiSettings && window.wpApiSettings.nonce ),
			{ timeout: 10_000 }
		);
		const approveRes = await patchReservationStatus(
			page,
			reservationId,
			'approved'
		);
		expect( approveRes.status ).toBe( 200 );

		// 数秒待っても meta は無いはず.
		await new Promise( ( r ) => setTimeout( r, 3000 ) );
		const eventId = getGcalEventIdMeta( reservationId );
		expect(
			eventId,
			`enabled=0 でも meta が作られた: '${ eventId }'`
		).toBe( '' );
	} );

	// ----------------------------------------------------------------
	// 5. 不正 JSON 拒否
	// ----------------------------------------------------------------
	test( '不正な credentials JSON は 400 / smb_credentials_invalid を返す', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking-settings', {
			waitUntil: 'domcontentloaded',
		} );
		await page.waitForFunction(
			() => !! ( window.wpApiSettings && window.wpApiSettings.nonce ),
			{ timeout: 10_000 }
		);
		const res = await postSettings( page, {
			smb_google_calendar_credentials_json: '{"foo":"bar"}',
		} );
		expect( res.status ).toBe( 400 );
		expect( res.data?.code ).toBe( 'smb_credentials_invalid' );
	} );

	// ----------------------------------------------------------------
	// 6. センチネルラウンドトリップ
	// ----------------------------------------------------------------
	test( '`***configured***` を再 POST しても保存済み JSON は破壊されない', async ( {
		page,
	} ) => {
		// まず正規の認証情報を保存.
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking-settings', {
			waitUntil: 'domcontentloaded',
		} );
		await page.waitForFunction(
			() => !! ( window.wpApiSettings && window.wpApiSettings.nonce ),
			{ timeout: 10_000 }
		);
		const initialPost = await postSettings( page, {
			smb_google_calendar_enabled: 1,
			smb_google_calendar_id: CALENDAR_ID,
			smb_google_calendar_credentials_json: CREDS_JSON_RAW,
		} );
		expect( initialPost.status ).toBe( 200 );

		// client_email が保存されたことを確認.
		const before = await getSettings( page );
		expect( before.data?.settings?.smb_google_calendar_client_email ).toBe(
			CLIENT_EMAIL
		);

		// 改めてセンチネルだけを送る（あわせて calendar_id も別の値に変更してみる）.
		const newCalendarId = 'rotation-test-' + CALENDAR_ID;
		const second = await postSettings( page, {
			smb_google_calendar_id: newCalendarId,
			smb_google_calendar_credentials_json: '***configured***',
		} );
		expect( second.status ).toBe( 200 );

		// GET 後: client_email は維持、credentials_json は依然マスクで返る.
		const after = await getSettings( page );
		const settingsAfter = after.data?.settings || {};
		expect( settingsAfter.smb_google_calendar_credentials_json ).toBe(
			'***configured***'
		);
		expect( settingsAfter.smb_google_calendar_client_email ).toBe(
			CLIENT_EMAIL
		);
		expect( settingsAfter.smb_google_calendar_id ).toBe( newCalendarId );

		// DB 直接クエリで raw JSON が壊されていないことを確認.
		const out = wpCli(
			`db query "SELECT LENGTH(option_value) FROM wp_options WHERE option_name='smb_google_calendar_credentials_json';" --skip-column-names`
		);
		const lenLine = out
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.find( ( s ) => /^\d+$/.test( s ) );
		const len = lenLine ? parseInt( lenLine, 10 ) : 0;
		expect(
			len,
			`stored JSON length should be > 100 chars (got ${ len })`
		).toBeGreaterThan( 100 );
	} );
} );
