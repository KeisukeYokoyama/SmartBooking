/**
 * Phase 4 Eval-C: ChatWork 通知 E2E テスト。
 *
 * 実 ChatWork API を相手にしたエンドツーエンド検証。
 *   - 設定の保存と読み戻し（token は raw のまま返る仕様）
 *   - 受付時に ChatWork ルームに通知メッセージが投稿される
 *   - smabo_chatwork_enabled=0 のときは投稿されない
 *   - smabo_chatwork_api_token が空のときは投稿されない
 *   - 承認時には通知されない（受付時のみ）
 *
 * 認証情報は credentials/.env から実行時に読み込む。
 * 欠けている場合は test.skip() でスキップする。
 *
 * 投稿された各テストメッセージはテスト末尾で ChatWork DELETE API により削除する
 * （実ルームを汚染しないため）。
 *
 * 実行: `npx playwright test tests/e2e/phase4-chatwork.spec.js --project=desktop`
 */
const { test, expect, request: pwRequest } = require( '@playwright/test' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const {
	restoreBaseline,
	insertSchedule,
	publicRest,
	gotoFrontForm,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );
const { wpCli, loginAsAdmin } = require( './helpers' );

test.describe.configure( { mode: 'serial' } );

// ---------------------------------------------------------------
// 認証情報の読み込み
// ---------------------------------------------------------------
const CREDS_DIR = path.resolve( __dirname, '..', '..', 'credentials' );
const ENV_PATH = path.join( CREDS_DIR, '.env' );

let CREDENTIALS_AVAILABLE = false;
let CHATWORK_API_TOKEN = '';
let CHATWORK_ROOM_ID = '';

try {
	if ( fs.existsSync( ENV_PATH ) ) {
		const envText = fs.readFileSync( ENV_PATH, 'utf8' );
		const tokenMatch = envText.match( /^CHATWORK_API_TOKEN=(.+)$/m );
		const roomMatch = envText.match( /^CHATWORK_ROOM_ID=(.+)$/m );
		if ( tokenMatch ) {
			CHATWORK_API_TOKEN = tokenMatch[ 1 ].trim();
		}
		if ( roomMatch ) {
			CHATWORK_ROOM_ID = roomMatch[ 1 ].trim();
		}
		if ( CHATWORK_API_TOKEN && CHATWORK_ROOM_ID ) {
			CREDENTIALS_AVAILABLE = true;
		}
	}
} catch ( _e ) {
	CREDENTIALS_AVAILABLE = false;
}

const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

// ---------------------------------------------------------------
// ChatWork API ヘルパー
// ---------------------------------------------------------------

/**
 * ChatWork ルームの最新メッセージ一覧を取得する。
 * `force=1` で過去 100 件を取得（未読/既読に関わらず）。
 * @return {Promise<Array<{message_id:string, body:string, account:any}>>}
 */
async function fetchChatworkMessages() {
	const ctx = await pwRequest.newContext();
	try {
		const res = await ctx.get(
			`${ CHATWORK_API_BASE }/rooms/${ CHATWORK_ROOM_ID }/messages?force=1`,
			{
				headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN },
				timeout: 15_000,
			}
		);
		if ( res.status() === 204 ) {
			// 新規メッセージなし.
			return [];
		}
		if ( ! res.ok() ) {
			throw new Error(
				`ChatWork GET messages failed: status=${ res.status() } body=${ await res.text() }`
			);
		}
		const data = await res.json();
		return Array.isArray( data ) ? data : [];
	} finally {
		await ctx.dispose();
	}
}

/**
 * ChatWork のメッセージを削除する（テスト後のクリーンアップ用）.
 * @param {string} messageId
 */
async function deleteChatworkMessage( messageId ) {
	if ( ! messageId ) {
		return;
	}
	const ctx = await pwRequest.newContext();
	try {
		await ctx.delete(
			`${ CHATWORK_API_BASE }/rooms/${ CHATWORK_ROOM_ID }/messages/${ messageId }`,
			{
				headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN },
				timeout: 15_000,
			}
		);
		// エラーは無視（既に削除済み等のケースもあるため）.
	} catch ( _e ) {
		/* noop */
	} finally {
		await ctx.dispose();
	}
}

/**
 * 指定 substring を含むメッセージを最大 maxWaitMs 待ちながら poll する.
 * 見つかった場合 message オブジェクトを、見つからなければ null を返す.
 *
 * @param {string} needle
 * @param {number} maxWaitMs
 * @return {Promise<Object|null>}
 */
async function pollForMessage( needle, maxWaitMs = 15_000 ) {
	const t0 = Date.now();
	while ( Date.now() - t0 < maxWaitMs ) {
		const messages = await fetchChatworkMessages();
		const hit = messages.find(
			( m ) => typeof m.body === 'string' && m.body.includes( needle )
		);
		if ( hit ) {
			return hit;
		}
		await new Promise( ( r ) => setTimeout( r, 1500 ) );
	}
	return null;
}

// ---------------------------------------------------------------
// プラグイン側ヘルパー
// ---------------------------------------------------------------

/**
 * ChatWork 設定を直接 wp option update で書き換える.
 *
 * @param {{enabled?: number, token?: string, roomId?: string|number}} cfg
 */
function setChatworkSettingsDirect( cfg ) {
	if ( typeof cfg.enabled === 'number' ) {
		wpCli( `option update smabo_chatwork_enabled ${ cfg.enabled ? 1 : 0 }` );
	}
	if ( typeof cfg.token === 'string' ) {
		// option 行が無いと UPDATE が効かないので、まず add（既存なら失敗 → 無視）.
		try {
			const addSafe = cfg.token.replace( /"/g, '\\"' );
			wpCli( `option add smabo_chatwork_api_token "${ addSafe }"` );
		} catch ( _e ) {
			/* 既に存在する場合は SQL UPDATE 側で更新する */
		}
		// 空文字対応のため SQL UPDATE で確実に上書き（option update は空文字を弾くケースがあるため）.
		const safe = cfg.token.replace( /'/g, "''" );
		wpCli(
			`db query "UPDATE wp_options SET option_value = '${ safe }' WHERE option_name = 'smabo_chatwork_api_token';"`
		);
	}
	if ( cfg.roomId !== undefined ) {
		wpCli(
			`option update smabo_chatwork_room_id "${ String( cfg.roomId ) }"`
		);
	}
}

/**
 * ChatWork 設定を全削除（クリーンアップ）.
 */
function clearChatworkSettings() {
	try {
		wpCli( `option delete smabo_chatwork_enabled` );
	} catch ( _e ) {
		/* noop */
	}
	try {
		wpCli( `option delete smabo_chatwork_api_token` );
	} catch ( _e ) {
		/* noop */
	}
	try {
		wpCli( `option delete smabo_chatwork_room_id` );
	} catch ( _e ) {
		/* noop */
	}
}

/**
 * 管理画面 admin nonce 経由で /settings POST.
 * @param {import('@playwright/test').Page} page
 * @param {Object<string,any>}              settings
 */
async function postSettings( page, settings ) {
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
			const res = await fetch( '/wp-json/smart-booking/v1/settings', {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': nonce,
					Accept: 'application/json',
				},
				body: JSON.stringify( { settings } ),
			} );
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
 * /settings GET.
 * @param {import('@playwright/test').Page} page
 */
async function getSettings( page ) {
	const nonce = await page.evaluate( () => {
		return window.wpApiSettings && window.wpApiSettings.nonce
			? window.wpApiSettings.nonce
			: '';
	} );
	return page.evaluate(
		async ( { nonce } ) => {
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
		},
		{ nonce }
	);
}

/**
 * 予約のステータスを admin REST PATCH で変更する.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number}                          reservationId
 * @param {string}                          status
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
 *
 * @param {import('@playwright/test').Page}         page
 * @param {number}                                  scheduleId
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
			`public/reservations failed: status=${
				res.status
			} body=${ JSON.stringify( res.data ) }`
		);
	}
	return res.data;
}

// ---------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------
test.describe( 'Phase 4 Eval-C: ChatWork 通知', () => {
	test.skip(
		! CREDENTIALS_AVAILABLE,
		`credentials missing: ${ ENV_PATH } に CHATWORK_API_TOKEN / CHATWORK_ROOM_ID が無い`
	);

	test.setTimeout( 90_000 );

	// 各テストで投稿した message_id を集めて afterAll で削除する保険.
	/** @type {Array<string>} */
	const postedMessageIds = [];

	test.beforeEach( async () => {
		restoreBaseline();
		clearChatworkSettings();
	} );

	test.afterAll( async () => {
		// 取りこぼした投稿を最後にもう一度クリーンアップ.
		for ( const id of postedMessageIds ) {
			await deleteChatworkMessage( id );
		}
		clearChatworkSettings();
		restoreBaseline();
	} );

	// ----------------------------------------------------------------
	// 1. 設定保存と読み戻し（token はマスクしない仕様）
	// ----------------------------------------------------------------
	test( '設定保存後、GET /settings は token / room_id をそのまま返す', async ( {
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

		const post = await postSettings( page, {
			smabo_chatwork_enabled: 1,
			smabo_chatwork_api_token: CHATWORK_API_TOKEN,
			smabo_chatwork_room_id: CHATWORK_ROOM_ID,
		} );
		expect(
			post.status,
			`POST /settings: ${ JSON.stringify( post ) }`
		).toBe( 200 );

		const get = await getSettings( page );
		expect( get.status ).toBe( 200 );
		const settings = get.data?.settings || {};
		expect( Number( settings.smabo_chatwork_enabled ) ).toBe( 1 );
		expect( settings.smabo_chatwork_api_token ).toBe( CHATWORK_API_TOKEN );
		expect( String( settings.smabo_chatwork_room_id ) ).toBe(
			CHATWORK_ROOM_ID
		);
	} );

	// ----------------------------------------------------------------
	// 2. 受付時に ChatWork 通知が投稿される
	// ----------------------------------------------------------------
	test( '予約受付で ChatWork に通知が投稿される', async ( { page } ) => {
		setChatworkSettingsDirect( {
			enabled: 1,
			token: CHATWORK_API_TOKEN,
			roomId: CHATWORK_ROOM_ID,
		} );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		expect( scheduleId ).toBeGreaterThan( 0 );

		const uniqueName = `EvalC_Smoke_${ Date.now() }`;
		await gotoFrontForm( page );
		const created = await submitPublicReservation( page, scheduleId, {
			name: uniqueName,
			email: 'evalc-smoke@example.com',
			phone: '080-1111-2222',
		} );
		const reservationId = Number( created?.id || created?.reservation_id );
		expect( reservationId ).toBeGreaterThan( 0 );

		const hit = await pollForMessage( uniqueName, 15_000 );
		expect(
			hit,
			`ChatWork ルームに ${ uniqueName } を含むメッセージが見つからない`
		).not.toBeNull();
		expect( hit.body ).toContain( '新しい予約が入りました' );
		expect( hit.body ).toContain( '予約番号:' );
		expect( hit.body ).toContain( String( reservationId ) );

		if ( hit?.message_id ) {
			postedMessageIds.push( hit.message_id );
			await deleteChatworkMessage( hit.message_id );
		}
	} );

	// ----------------------------------------------------------------
	// 3. enabled=0 のときは no-op
	// ----------------------------------------------------------------
	test( 'enabled=0 のときは ChatWork に投稿されない', async ( { page } ) => {
		setChatworkSettingsDirect( {
			enabled: 0,
			token: CHATWORK_API_TOKEN,
			roomId: CHATWORK_ROOM_ID,
		} );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '12:00:00',
			end: '13:00:00',
			capacity: 3,
		} );

		const uniqueName = `EvalC_Disabled_${ Date.now() }`;
		await gotoFrontForm( page );
		await submitPublicReservation( page, scheduleId, {
			name: uniqueName,
			email: 'evalc-disabled@example.com',
			phone: '080-1111-3333',
		} );

		// 3.5 秒待機。投稿が走っていれば API は通常 1〜2 秒で反映する.
		await new Promise( ( r ) => setTimeout( r, 3500 ) );
		const messages = await fetchChatworkMessages();
		const hit = messages.find(
			( m ) => typeof m.body === 'string' && m.body.includes( uniqueName )
		);
		if ( hit?.message_id ) {
			// 万が一投稿されていたらクリーンアップして失敗を明示.
			postedMessageIds.push( hit.message_id );
			await deleteChatworkMessage( hit.message_id );
		}
		expect(
			hit,
			`enabled=0 にもかかわらず ChatWork に投稿された: ${ uniqueName }`
		).toBeUndefined();
	} );

	// ----------------------------------------------------------------
	// 4. 空トークン時は no-op
	// ----------------------------------------------------------------
	test( '空トークンのときは ChatWork に投稿されない', async ( { page } ) => {
		setChatworkSettingsDirect( {
			enabled: 1,
			token: '',
			roomId: CHATWORK_ROOM_ID,
		} );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '14:00:00',
			end: '15:00:00',
			capacity: 3,
		} );

		const uniqueName = `EvalC_EmptyToken_${ Date.now() }`;
		await gotoFrontForm( page );
		await submitPublicReservation( page, scheduleId, {
			name: uniqueName,
			email: 'evalc-empty@example.com',
			phone: '080-1111-4444',
		} );

		await new Promise( ( r ) => setTimeout( r, 3500 ) );
		const messages = await fetchChatworkMessages();
		const hit = messages.find(
			( m ) => typeof m.body === 'string' && m.body.includes( uniqueName )
		);
		if ( hit?.message_id ) {
			postedMessageIds.push( hit.message_id );
			await deleteChatworkMessage( hit.message_id );
		}
		expect(
			hit,
			`空トークンにもかかわらず ChatWork に投稿された: ${ uniqueName }`
		).toBeUndefined();
	} );

	// ----------------------------------------------------------------
	// 5. 承認は通知しない（受付時のみ）
	// ----------------------------------------------------------------
	test( '承認操作では ChatWork に追加投稿されない', async ( { page } ) => {
		setChatworkSettingsDirect( {
			enabled: 1,
			token: CHATWORK_API_TOKEN,
			roomId: CHATWORK_ROOM_ID,
		} );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '16:00:00',
			end: '17:00:00',
			capacity: 3,
		} );

		// 受付段階で 1 通投稿される（同テスト内でも uniqueName を変えて識別）.
		const baseName = `EvalC_Approve_${ Date.now() }`;
		const receivedName = `${ baseName }_received`;
		await gotoFrontForm( page );
		const created = await submitPublicReservation( page, scheduleId, {
			name: receivedName,
			email: 'evalc-approve@example.com',
			phone: '080-1111-5555',
		} );
		const reservationId = Number( created?.id || created?.reservation_id );
		expect( reservationId ).toBeGreaterThan( 0 );

		// 受付通知が来るまで待ち、message_id を控えておく.
		const recvHit = await pollForMessage( receivedName, 15_000 );
		expect(
			recvHit,
			`受付通知が見つからない（前段階としての sanity check）`
		).not.toBeNull();
		if ( recvHit?.message_id ) {
			postedMessageIds.push( recvHit.message_id );
		}

		// 承認操作 → 追加投稿されないこと.
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

		// 承認後 3.5 秒待って、受付通知以外に同 reservationId に紐づく追加メッセージが
		// 増えていないことを確認する。本プラグインは承認時に何も投稿しないため、
		// 受付通知本文（reservationId を含む）以外の出現を許さない.
		await new Promise( ( r ) => setTimeout( r, 3500 ) );
		const messages = await fetchChatworkMessages();
		const matches = messages.filter(
			( m ) =>
				typeof m.body === 'string' &&
				m.body.includes( '新しい予約が入りました' ) &&
				m.body.includes( `予約番号: ${ reservationId }` )
		);
		// 1 件のみ（受付通知）であるべき。
		expect(
			matches.length,
			`reservationId=${ reservationId } に対する通知が ${ matches.length } 件あった（期待: 1）`
		).toBe( 1 );

		// クリーンアップ.
		if ( recvHit?.message_id ) {
			await deleteChatworkMessage( recvHit.message_id );
		}
	} );
} );
