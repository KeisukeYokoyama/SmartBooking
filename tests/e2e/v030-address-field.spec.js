/**
 * v0.3.0 機能④ 住所フィールド（郵便番号自動入力）— フロント/サーバ E2E（新規）。
 *
 *  A. 自動補完: route モックでヒット → 全角郵便番号 → 住所補完 → {key}_zip/{key}_address の2キー保存。
 *  B. フェイルソフト: 0件レスポンス → 補完されないが手入力で予約完走・console エラー無し。
 *  C. ③連携: 住所を条件の子に → 「希望する」で出現/入力 → 「希望しない」で破棄（meta 不保存）。
 *  D. 自動入力OFF無通信（2e）＋ サーバ直接POSTバリデーション（2g）。
 *
 * 実 API 非依存（すべて page.route intercept）。配布物外（検証専用）。afterAll で restoreBaseline。
 */
const { execSync } = require( 'node:child_process' );
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	USER_STORE_ID,
	USER_STAFF_ID,
	insertSchedule,
	publicRest,
	ymd,
} = require( './phase3-helpers' );

const CF = 'wp_smart_booking_custom_fields';
const RM = 'wp_smart_booking_reservation_meta';

const HIT_JSON = JSON.stringify( {
	message: null,
	results: [
		{
			address1: '東京都',
			address2: '渋谷区',
			address3: '渋谷',
			kana1: 'ﾄｳｷｮｳﾄ',
			kana2: 'ｼﾌﾞﾔｸ',
			kana3: 'ｼﾌﾞﾔ',
			prefcode: '13',
			zipcode: '1500002',
		},
	],
	status: 200,
} );
const EMPTY_JSON = JSON.stringify( {
	message: null,
	results: null,
	status: 200,
} );

function dbq( sql, extra = '' ) {
	return execSync(
		`npx wp-env run cli wp db query ${ JSON.stringify( sql ) } ${ extra }`,
		{ encoding: 'utf8' }
	);
}
function insertAddressField(
	key,
	label,
	{
		autofill = true,
		required = 0,
		sort = 60,
		cond_key = null,
		cond_val = null,
	} = {}
) {
	const opts = JSON.stringify( { autofill } ).replace( /'/g, "''" );
	const ck = cond_key === null ? 'NULL' : `'${ cond_key }'`;
	const cv = cond_val === null ? 'NULL' : `'${ cond_val }'`;
	dbq(
		`INSERT INTO ${ CF } (field_key,field_label,field_type,field_options,placeholder,is_required,sort_order,condition_field_key,condition_value,created_at) VALUES ('${ key }','${ label }','address','${ opts }','',${ required },${ sort },${ ck },${ cv },NOW());` +
			// v0.4.0: custom_fields は form_id 必須。直接 INSERT した行をデフォルトフォームへ紐付ける。
			` UPDATE ${ CF } SET form_id = (SELECT id FROM wp_smart_booking_forms WHERE is_default = 1 LIMIT 1) WHERE form_id = 0;`
	);
}
function insertRadio( key, label, options, sort ) {
	const opts = JSON.stringify( options ).replace( /'/g, "''" );
	dbq(
		`INSERT INTO ${ CF } (field_key,field_label,field_type,field_options,placeholder,is_required,sort_order,condition_field_key,condition_value,created_at) VALUES ('${ key }','${ label }','radio','${ opts }','',0,${ sort },NULL,NULL,NOW());` +
			// v0.4.0: custom_fields は form_id 必須。直接 INSERT した行をデフォルトフォームへ紐付ける。
			` UPDATE ${ CF } SET form_id = (SELECT id FROM wp_smart_booking_forms WHERE is_default = 1 LIMIT 1) WHERE form_id = 0;`
	);
}
function metaVal( reservationId, metaKey ) {
	const out = dbq(
		`SELECT meta_value FROM ${ RM } WHERE reservation_id=${ reservationId } AND meta_key='${ metaKey }';`,
		'--skip-column-names'
	);
	return out.trim();
}
function metaCount( metaKey ) {
	const out = dbq(
		`SELECT COUNT(*) FROM ${ RM } WHERE meta_key='${ metaKey }';`,
		'--skip-column-names'
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : -1;
}
function latestReservationId() {
	const out = dbq(
		`SELECT id FROM wp_smart_booking_reservations ORDER BY id DESC LIMIT 1;`,
		'--skip-column-names'
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : 0;
}

let scheduleId = 0;

test.describe.configure( { mode: 'serial' } );

test.describe( 'v0.3.0 ④: 住所フィールド', () => {
	test.setTimeout( 120_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		setOption( 'smart_booking_show_store_front', 0 );
		setOption( 'smart_booking_show_staff_front', 0 );
		scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 2 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 5,
		} );
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	async function pickDateTime( page, zipSelector ) {
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 15_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		if ( zipSelector ) {
			await page.waitForSelector( zipSelector, { timeout: 10_000 } );
		}
	}

	test( 'A: 自動補完（全角→半角正規化・住所補完・2キー保存）', async ( {
		page,
	} ) => {
		insertAddressField( 'dest', 'お届け先住所', {
			autofill: true,
			required: 0,
			sort: 60,
		} );
		await page.route( '**/zipcloud.ibsnet.co.jp/**', ( route ) =>
			route.fulfill( {
				status: 200,
				contentType: 'application/json',
				body: HIT_JSON,
			} )
		);
		await pickDateTime( page, '#smb-front-field-dest-zip' );

		// 全角郵便番号を入力 → デバウンス後に住所が補完される。
		await page
			.locator( '#smb-front-field-dest-zip' )
			.fill( '１５００００２' );
		await expect(
			page.locator( '#smb-front-field-dest-address' )
		).toHaveValue( '東京都渋谷区渋谷', { timeout: 8_000 } );

		// 番地を追記（手編集）。
		await page
			.locator( '#smb-front-field-dest-address' )
			.fill( '東京都渋谷区渋谷1-2-3' );

		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( '住所 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'addr@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-1111-2222' );
		await page.getByRole( 'button', { name: '予約内容の確認' } ).click();
		await page.waitForSelector(
			'.smb-front-confirm-page, .smb-front-confirm',
			{ timeout: 10_000 }
		);
		// 確認画面に 〒1500002 住所 が表示される。
		await expect(
			page.getByText( '〒1500002 東京都渋谷区渋谷1-2-3' )
		).toBeVisible();

		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		const rid = latestReservationId();
		expect( metaVal( rid, 'dest_zip' ) ).toBe( '1500002' );
		expect( metaVal( rid, 'dest_address' ) ).toBe(
			'東京都渋谷区渋谷1-2-3'
		);
	} );

	test( 'B: フェイルソフト（0件→補完なし・手入力で完走・console エラー無し）', async ( {
		page,
	} ) => {
		insertAddressField( 'dest', 'お届け先住所', {
			autofill: true,
			required: 0,
			sort: 60,
		} );
		const consoleErrors = [];
		const pageErrors = [];
		page.on( 'console', ( msg ) => {
			if ( msg.type() === 'error' ) {
				consoleErrors.push( msg.text() );
			}
		} );
		page.on( 'pageerror', ( err ) => pageErrors.push( String( err ) ) );
		await page.route( '**/zipcloud.ibsnet.co.jp/**', ( route ) =>
			route.fulfill( {
				status: 200,
				contentType: 'application/json',
				body: EMPTY_JSON,
			} )
		);
		await pickDateTime( page, '#smb-front-field-dest-zip' );

		await page.locator( '#smb-front-field-dest-zip' ).fill( '1500002' );
		// デバウンス+fetch を待っても住所は補完されない（0件）。
		await page.waitForTimeout( 1_200 );
		await expect(
			page.locator( '#smb-front-field-dest-address' )
		).toHaveValue( '' );

		// 手入力で完走。
		await page
			.locator( '#smb-front-field-dest-address' )
			.fill( '東京都テスト区9-9-9' );
		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( 'フェイル 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'fs@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-3333-4444' );
		await page.getByRole( 'button', { name: '予約内容の確認' } ).click();
		await page.waitForSelector(
			'.smb-front-confirm-page, .smb-front-confirm',
			{ timeout: 10_000 }
		);
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		const rid = latestReservationId();
		expect( metaVal( rid, 'dest_zip' ) ).toBe( '1500002' );
		expect( metaVal( rid, 'dest_address' ) ).toBe( '東京都テスト区9-9-9' );
		expect( pageErrors ).toEqual( [] );
		expect( consoleErrors ).toEqual( [] );
	} );

	test( 'C: ③連携（希望する で出現/入力 → 希望しない で破棄）', async ( {
		page,
	} ) => {
		insertRadio( 'shiryo', '資料送付', [ '希望する', '希望しない' ], 50 );
		insertAddressField( 'dest', '送付先住所', {
			autofill: true,
			required: 0,
			sort: 60,
			cond_key: 'shiryo',
			cond_val: '希望する',
		} );
		await page.route( '**/zipcloud.ibsnet.co.jp/**', ( route ) =>
			route.fulfill( {
				status: 200,
				contentType: 'application/json',
				body: HIT_JSON,
			} )
		);
		await pickDateTime( page, '#smb-front-field-shiryo-opt-0' );

		// 初期: 子(住所)は非表示。
		await expect( page.locator( '#smb-front-field-dest-zip' ) ).toHaveCount(
			0
		);
		// 希望する → 出現。
		await page.locator( '#smb-front-field-shiryo-opt-0' ).check();
		await expect(
			page.locator( '#smb-front-field-dest-zip' )
		).toBeVisible();
		await page.locator( '#smb-front-field-dest-zip' ).fill( '1500002' );
		await page
			.locator( '#smb-front-field-dest-address' )
			.fill( '東京都渋谷区渋谷5-5-5' );
		// 希望しない → 消失。
		await page.locator( '#smb-front-field-shiryo-opt-1' ).check();
		await expect( page.locator( '#smb-front-field-dest-zip' ) ).toHaveCount(
			0
		);

		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( '条件 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'cond@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-5555-6666' );
		await page.getByRole( 'button', { name: '予約内容の確認' } ).click();
		await page.waitForSelector(
			'.smb-front-confirm-page, .smb-front-confirm',
			{ timeout: 10_000 }
		);
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		// 破棄: dest_zip / dest_address の meta は保存されない。
		expect( metaCount( 'dest_zip' ) ).toBe( 0 );
		expect( metaCount( 'dest_address' ) ).toBe( 0 );
	} );

	test( 'D: 自動入力OFF無通信 ＋ 直接POSTバリデーション', async ( {
		page,
	} ) => {
		insertAddressField( 'destoff', '住所OFF', {
			autofill: false,
			required: 1,
			sort: 60,
		} );
		insertAddressField( 'destopt', '住所任意', {
			autofill: true,
			required: 0,
			sort: 61,
		} );

		const zipcloudHits = [];
		page.on( 'request', ( req ) => {
			if ( req.url().includes( 'zipcloud' ) ) {
				zipcloudHits.push( req.url() );
			}
		} );
		// 万一の実通信をブロックしつつ記録（fulfill しても record は request で拾える）。
		await page.route( '**/zipcloud.ibsnet.co.jp/**', ( route ) =>
			route.fulfill( {
				status: 200,
				contentType: 'application/json',
				body: HIT_JSON,
			} )
		);
		await pickDateTime( page, '#smb-front-field-destoff-zip' );

		// autofill OFF フィールドに7桁入力 → zipcloud へのリクエストが発生しない。
		await page.locator( '#smb-front-field-destoff-zip' ).fill( '1500002' );
		await page.waitForTimeout( 1_200 );
		expect( zipcloudHits ).toEqual( [] );

		// --- サーバ直接POST（フロント回避）---
		const base = {
			schedule_id: scheduleId,
			customer_name: 'サーバ 太郎',
			customer_email: 'srv@example.com',
			customer_phone: '09000000000',
			honeypot: '',
		};
		// 必須・両方空 → 400 required。
		const r1 = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				...base,
				custom_fields: { destoff: { zip: '', address: '' } },
			},
		} );
		expect( r1.status ).toBe( 400 );
		expect( r1.data.code ).toBe( 'smb_reservation_custom_field_required' );
		// 必須・郵便番号のみ（住所空）→ 400 required。
		const r2 = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				...base,
				custom_fields: { destoff: { zip: '1500002', address: '' } },
			},
		} );
		expect( r2.status ).toBe( 400 );
		expect( r2.data.code ).toBe( 'smb_reservation_custom_field_required' );
		// 必須・郵便番号が7桁でない → 400 zip_invalid。
		const r3 = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				...base,
				custom_fields: { destoff: { zip: '123', address: '住所X' } },
			},
		} );
		expect( r3.status ).toBe( 400 );
		expect( r3.data.code ).toBe( 'smb_reservation_zip_invalid' );
		// 任意フィールドで zip 非空・非7桁 → 400 zip_invalid（必須は満たす）。
		const r4 = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				...base,
				custom_fields: {
					destoff: { zip: '1500002', address: '住所X' },
					destopt: { zip: '99', address: '' },
				},
			},
		} );
		expect( r4.status ).toBe( 400 );
		expect( r4.data.code ).toBe( 'smb_reservation_zip_invalid' );
		// 妥当 → 200。
		const r5 = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				...base,
				custom_fields: {
					destoff: { zip: '1500002', address: '住所X' },
				},
			},
		} );
		expect( r5.status ).toBe( 200 );
	} );
} );
