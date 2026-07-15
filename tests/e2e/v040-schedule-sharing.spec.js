/**
 * v0.4.0 機能② 複数フォーム — 全フォームが同一スケジュールを共有（満席連動）。
 *
 * capacity=1 の枠に対し、フォームA（デフォルト）経由の予約が成功した直後、
 * フォームB（別 form_id）経由で同じ schedule_id へ予約すると満席（409）になる
 * ＝スケジュールはフォームで分かれず全フォームで共有されることを実証する。
 *
 * REST 中心（公開 REST を front ページ上で page.evaluate）のため desktop/mobile 両方で実行。
 * 配布物外（検証専用）。
 */
const { test, expect } = require( '@playwright/test' );
const {
	restoreBaseline,
	gotoFrontForm,
	insertSchedule,
	publicRest,
	getScheduleBookedCount,
	USER_STORE_ID,
	USER_STAFF_ID,
	ymd,
} = require( './phase3-helpers' );
const {
	resetForms,
	getDefaultFormId,
	insertForm,
} = require( './v040-helpers' );

test.describe.configure( { mode: 'serial' } );

test.describe( 'v0.4.0 ②: スケジュール共有（満席連動）', () => {
	test.setTimeout( 120_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		resetForms();
	} );

	test.afterAll( async () => {
		restoreBaseline();
		resetForms();
	} );

	test( 'フォームAで満席にするとフォームBからも同じ枠は満席（409）', async ( {
		page,
	} ) => {
		const defaultId = getDefaultFormId();
		expect( defaultId ).toBeGreaterThan( 0 );

		// 別フォームBを用意（form_id が有効であればよい）。
		const formBId = insertForm( '別フォームB' );
		expect( formBId ).toBeGreaterThan( 0 );
		expect( formBId ).not.toBe( defaultId );

		// capacity=1 の枠を近未来日に seed。
		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 2 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 1,
		} );
		expect( scheduleId ).toBeGreaterThan( 0 );

		// フロントページで smartBookingFrontend.nonce を得る（公開 REST 用）。
		await gotoFrontForm( page );

		const baseBody = {
			schedule_id: scheduleId,
			customer_name: '共有 太郎',
			customer_email: 'share@example.com',
			customer_phone: '09011112222',
			honeypot: '',
		};

		// --- フォームA（デフォルト）経由で予約 → 成功 ---
		const resA = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: { ...baseBody, form_id: defaultId },
		} );
		expect(
			resA.status,
			`A status=${ resA.status } data=${ JSON.stringify( resA.data ) }`
		).toBe( 200 );
		expect( getScheduleBookedCount( scheduleId ) ).toBe( 1 );

		// --- フォームB経由で同じ schedule_id へ予約 → 満席連動で 409 ---
		const resB = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				...baseBody,
				customer_name: '共有 次郎',
				customer_email: 'share2@example.com',
				form_id: formBId,
			},
		} );
		expect(
			resB.status,
			`B status=${ resB.status } data=${ JSON.stringify( resB.data ) }`
		).toBe( 409 );
		expect( resB.data.code ).toBe( 'smb_reservation_full' );
		// booked_count は増えていない（1 のまま）。
		expect( getScheduleBookedCount( scheduleId ) ).toBe( 1 );

		// --- availability でもその枠は full ---
		const avail = await publicRest( page, 'public/availability', {
			query: { date_from: ymd( 2 ), date_to: ymd( 2 ) },
		} );
		expect( avail.status ).toBe( 200 );
		const slot = ( avail.data.schedules || [] ).find(
			( s ) => s.start_time === '10:00'
		);
		expect( slot, 'seed した 10:00 枠が availability に存在' ).toBeTruthy();
		expect( slot.availability ).toBe( 'full' );
	} );
} );
