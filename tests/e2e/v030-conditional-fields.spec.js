/**
 * v0.3.0 機能③ 条件フィールド — フロント/サーバ E2E（新規・再現/回帰）。
 *
 * 親 radio「資料送付」(希望する/希望しない) + 条件付き必須 textarea「送付先住所」
 * (condition_field_key=shiryo / condition_value=希望する)。
 *
 *  A. 親選択で子フィールドが表示/非表示に切り替わる。
 *  B. 非表示に戻した子の入力値が予約データ(meta)に残らない（DB 直接確認）。
 *  C. 表示中のみ必須が発動する（フロント＋直接 POST のサーバ側）。
 *
 * 配布物外（検証専用）。afterAll で restoreBaseline により条件フィールドを掃除する。
 */
const { execSync } = require( 'child_process' );
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

function dbq( sql, extra = '' ) {
	return execSync(
		`npx wp-env run cli wp db query ${ JSON.stringify( sql ) } ${ extra }`,
		{ encoding: 'utf8' }
	);
}
function insertConditionalFields() {
	dbq(
		`INSERT INTO ${ CF } (field_key,field_label,field_type,field_options,placeholder,is_required,sort_order,condition_field_key,condition_value,created_at) VALUES ('shiryo','資料送付','radio','["希望する","希望しない"]','',0,50,NULL,NULL,NOW()),('addr','送付先住所','textarea','[]','',1,60,'shiryo','希望する',NOW());`
	);
}
function addrMetaCount() {
	const out = dbq(
		`SELECT COUNT(*) FROM ${ RM } WHERE meta_key='addr';`,
		'--skip-column-names'
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : -1;
}

let scheduleId = 0;

test.describe.configure( { mode: 'serial' } );

test.describe( 'v0.3.0 ③: 条件フィールド', () => {
	test.setTimeout( 120_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		setOption( 'smart_booking_show_store_front', 0 );
		setOption( 'smart_booking_show_staff_front', 0 );
		insertConditionalFields();
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

	async function reachForm( page ) {
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 15_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await page.waitForSelector( '#smb-front-field-shiryo-opt-0', {
			timeout: 10_000,
		} );
	}

	test( 'A: 親選択で子フィールドが表示/非表示に切り替わる', async ( {
		page,
	} ) => {
		await reachForm( page );
		// 初期: 親未選択 → 子(addr)は非表示。
		await expect( page.locator( '#smb-front-field-addr' ) ).toHaveCount(
			0
		);
		// 「希望する」→ 子が出現。
		await page.locator( '#smb-front-field-shiryo-opt-0' ).check();
		await expect( page.locator( '#smb-front-field-addr' ) ).toBeVisible();
		// 「希望しない」→ 子が消失。
		await page.locator( '#smb-front-field-shiryo-opt-1' ).check();
		await expect( page.locator( '#smb-front-field-addr' ) ).toHaveCount(
			0
		);
	} );

	test( 'B: 非表示に戻した子の入力値は meta に残らない（DB確認）', async ( {
		page,
	} ) => {
		await reachForm( page );
		// 希望する → 住所入力 → 希望しない（非表示に戻す）→ 送信。
		await page.locator( '#smb-front-field-shiryo-opt-0' ).check();
		await page
			.locator( '#smb-front-field-addr' )
			.fill( '東京都テスト区1-2-3' );
		await page.locator( '#smb-front-field-shiryo-opt-1' ).check();
		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( '条件 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'cond@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-1111-2222' );
		await page.getByRole( 'button', { name: '予約内容の確認' } ).click();
		await page.waitForSelector(
			'.smb-front-confirm-page, .smb-front-confirm',
			{
				timeout: 10_000,
			}
		);
		// 確認画面に非表示フィールド(送付先住所)の行が出ない。
		await expect( page.getByText( '送付先住所' ) ).toHaveCount( 0 );
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );
		// DB: addr の meta 行は作られていない。
		expect( addrMetaCount() ).toBe( 0 );
	} );

	test( 'C: 表示中のみ必須（フロント＋サーバ直接POST）', async ( {
		page,
	} ) => {
		await reachForm( page );
		// 表示中(希望する)で addr 空のまま確認へ → フロント必須で確認画面に進めない。
		await page.locator( '#smb-front-field-shiryo-opt-0' ).check();
		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( '必須 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'req@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-3333-4444' );
		// フロント必須: 表示中(希望する)で addr 空 → 「予約内容の確認」ボタンが無効（押せない）。
		await expect(
			page.getByRole( 'button', { name: '予約内容の確認' } )
		).toBeDisabled();
		// addr を入力すると有効化される（＝表示中のみ必須が効いている証左）。
		await page.locator( '#smb-front-field-addr' ).fill( '確認テスト住所' );
		await expect(
			page.getByRole( 'button', { name: '予約内容の確認' } )
		).toBeEnabled();

		// --- サーバ側直接 POST（フロント判定を回避）---
		const base = {
			schedule_id: scheduleId,
			customer_name: 'サーバ 太郎',
			customer_email: 'srv@example.com',
			customer_phone: '09000000000',
			honeypot: '',
		};
		// 親=希望する かつ addr 空 → 400（必須）。
		const rVisible = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				...base,
				custom_fields: { shiryo: '希望する', addr: '' },
			},
		} );
		expect( rVisible.status ).toBe( 400 );
		expect( rVisible.data.code ).toBe(
			'smb_reservation_custom_field_required'
		);
		// 親=希望しない かつ addr 空 → 200（非表示なので必須スキップ）。
		const rHidden = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				...base,
				custom_fields: { shiryo: '希望しない', addr: '' },
			},
		} );
		expect( rHidden.status ).toBe( 200 );
	} );
} );
