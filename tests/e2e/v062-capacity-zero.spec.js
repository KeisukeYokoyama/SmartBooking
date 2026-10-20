/**
 * v0.6.2: 予約可能数（capacity）0 を許可する。
 *
 * - 管理 REST で capacity=0 の枠を作成・更新できる（従来は 1 にクランプ）。
 * - スケジュールコピーで capacity=0 がそのまま複製される。
 * - 予約フォームでは capacity=0 の枠は「満席」（disabled）で予約できない。
 * - 手動作成で capacity=0 の枠を選ぶと、従来どおり満席エラー（409）。
 *
 * 管理画面の入力欄で 0 を保存できることは phase2-schedule.spec.js で検証する。
 *
 * 実行: `npx playwright test tests/e2e/v062-capacity-zero.spec.js --project=desktop`
 */
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertSchedule,
	publicRest,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );
const { bootstrapAdmin, restCall } = require( './phase2-helpers' );

test.describe.configure( { mode: 'serial' } );

// insertSchedulesBulk は `capacity || 3` で 0 を 3 にしてしまうため、1件ずつ insertSchedule を使う。
function insertRows( rows ) {
	rows.forEach( ( r ) => insertSchedule( r ) );
}

async function getSchedulesOn( page, date ) {
	const res = await restCall( page, 'GET', 'schedules', null, {
		date_from: date,
		date_to: date,
	} );
	expect( res.ok ).toBe( true );
	return res.data;
}

test.describe( 'v0.6.2: 予約可能数0', () => {
	test.setTimeout( 90_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test( 'C1: 管理 REST で capacity=0 の作成・更新ができる', async ( {
		page,
	} ) => {
		await bootstrapAdmin( page, 'schedule' );
		const d = ymd( 4 );
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: d,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 0,
					is_active: 1,
				},
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: d,
					start_time: '10:00',
					end_time: '11:00',
					capacity: 3,
					is_active: 1,
				},
			],
		} );
		expect( res.ok, JSON.stringify( res.data ) ).toBe( true );
		let rows = await getSchedulesOn( page, d );
		const byStart = ( list, hm ) =>
			list.find( ( s ) => String( s.start_time ).startsWith( hm ) );
		expect( Number( byStart( rows, '09:00' ).capacity ) ).toBe( 0 );

		// 3 → 0 への更新も可能.
		const id10 = byStart( rows, '10:00' ).id;
		const put = await restCall( page, 'PUT', `schedules/${ id10 }`, {
			capacity: 0,
		} );
		expect( put.ok, JSON.stringify( put.data ) ).toBe( true );
		// 負数は 0 に丸める.
		const put2 = await restCall( page, 'PUT', `schedules/${ id10 }`, {
			capacity: -2,
		} );
		expect( put2.ok, JSON.stringify( put2.data ) ).toBe( true );
		rows = await getSchedulesOn( page, d );
		expect( Number( byStart( rows, '10:00' ).capacity ) ).toBe( 0 );
	} );

	test( 'C2: スケジュールコピーで capacity=0 がそのまま複製される', async ( {
		page,
	} ) => {
		const source = ymd( 2 );
		const target = ymd( 9 );
		insertRows( [
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: source,
				start: '09:00:00',
				end: '10:00:00',
				capacity: 0,
			},
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: source,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 4,
			},
		] );
		await bootstrapAdmin( page, 'schedule' );
		const copy = await restCall( page, 'POST', 'schedules/copy', {
			source_date: source,
			store_id: USER_STORE_ID,
			staff_id: USER_STAFF_ID,
			target_dates: [ target ],
			overwrite: false,
		} );
		expect( copy.ok, JSON.stringify( copy.data ) ).toBe( true );
		const rows = await getSchedulesOn( page, target );
		const caps = rows
			.map( ( s ) => [
				String( s.start_time ).slice( 0, 5 ),
				Number( s.capacity ),
			] )
			.sort();
		expect( caps ).toEqual( [
			[ '09:00', 0 ],
			[ '10:00', 4 ],
		] );
	} );

	test( 'C3: 予約フォームで capacity=0 の枠は満席表示・選択不可', async ( {
		page,
	} ) => {
		setOption( 'smart_booking_calendar_view_mode', 'day_only' );
		const d = ymd( 1 );
		insertRows( [
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '09:00:00',
				end: '10:00:00',
				capacity: 10,
			},
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '11:00:00',
				end: '12:00:00',
				capacity: 0,
			},
		] );

		await gotoFrontForm( page );

		// 公開 API でも full と返る.
		const avail = await publicRest( page, 'public/availability', {
			query: {
				store_id: USER_STORE_ID,
				staff_id: USER_STAFF_ID,
				date_from: d,
				date_to: d,
			},
		} );
		const list = Array.isArray( avail.data?.schedules )
			? avail.data.schedules
			: [];
		const zero = list.find( ( s ) => s.start_time === '11:00' );
		expect( zero, JSON.stringify( avail.data ) ).toBeTruthy();
		expect( zero.availability ).toBe( 'full' );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		const okBtn = page.getByRole( 'button', { name: /^09:00から10:00$/ } );
		await expect( okBtn ).toBeEnabled();
		const full = page.getByRole( 'button', {
			name: /^11:00から12:00 満席 選択不可$/,
		} );
		await expect( full ).toBeDisabled();
		await expect( full ).toHaveClass( /is-full/ );
	} );

	test( 'C4: 手動作成で capacity=0 の枠は満席エラー（従来どおり）', async ( {
		page,
	} ) => {
		const d = ymd( 3 );
		insertRows( [
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '09:00:00',
				end: '10:00:00',
				capacity: 0,
			},
		] );
		await bootstrapAdmin( page, 'reservations' );
		const rows = await getSchedulesOn( page, d );
		const res = await restCall( page, 'POST', 'reservations', {
			schedule_id: rows[ 0 ].id,
			customer_name: '満席 太郎',
			customer_email: 'v062-full@example.com',
			customer_phone: '09011112222',
			status: 'approved',
			meta: {},
		} );
		expect( res.status ).toBe( 409 );
		expect( res.data?.code ).toBe( 'smb_reservation_full' );
	} );
} );
