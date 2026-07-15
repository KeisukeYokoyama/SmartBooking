/**
 * v0.4.0 機能② 複数フォーム — form_id 別の予約が記録される（フロント完走）。
 *
 * page_id を `[smart_booking form_id="<form2>"]` に差し替え → フロント予約フローを
 * 完走 → 記録された予約の form_id が form2 であることを DB で確認する。
 *
 * UI 完走のため desktop プロジェクト限定。配布物外（検証専用）。
 */
const { test, expect } = require( '@playwright/test' );
const { restCall, bootstrapAdmin } = require( './phase2-helpers' );
const {
	restoreBaseline,
	gotoFrontForm,
	insertSchedule,
	fillCoreFormAndGoConfirm,
	USER_STORE_ID,
	USER_STAFF_ID,
	ymd,
} = require( './phase3-helpers' );
const {
	resetForms,
	getFrontPageId,
	setFrontShortcode,
	restoreFrontShortcode,
	scalarInt,
	RES,
} = require( './v040-helpers' );

test.describe.configure( { mode: 'serial' } );

let frontPageId = 5;

test.describe( 'v0.4.0 ②: form_id 別予約の記録（フロント完走）', () => {
	test.setTimeout( 120_000 );

	test.beforeAll( () => {
		frontPageId = getFrontPageId();
	} );

	test.beforeEach( async ( {}, testInfo ) => {
		test.skip(
			testInfo.project.name !== 'desktop',
			'UI 完走のため desktop 限定'
		);
		restoreBaseline();
		resetForms();
	} );

	test.afterAll( async () => {
		restoreFrontShortcode( frontPageId );
		restoreBaseline();
		resetForms();
	} );

	test( 'form2 経由の予約が reservations.form_id=form2 で記録される', async ( {
		page,
	} ) => {
		// form2 を作成（初期3フィールド自動生成 → フロントで氏名/メール/電話が描画される）。
		await bootstrapAdmin( page, 'schedule' );
		const created = await restCall( page, 'POST', 'forms', {
			name: '相談フォーム2',
		} );
		expect( [ 200, 201 ].includes( created.status ) ).toBe( true );
		const form2Id = created.data.id;
		expect( form2Id ).toBeGreaterThan( 0 );

		// スケジュールを近未来日に seed（店舗1 / 担当者1）。
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 2 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );

		// ショートコードを form2 指定に差し替え。
		setFrontShortcode(
			frontPageId,
			`[smart_booking form_id="${ form2Id }"]`
		);

		// フロントへ遷移し、data-form-id が form2 で出力されていることを確認。
		await gotoFrontForm( page );
		await expect( page.locator( '#smart-booking-app' ) ).toHaveAttribute(
			'data-form-id',
			String( form2Id )
		);

		// 予約フローを完走: 日付 → 時間 → フォーム入力 → 確認 → 確定。
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 15_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await fillCoreFormAndGoConfirm( page, {
			name: 'フォーム 二郎',
			email: 'form2@example.com',
			phone: '090-2222-2222',
		} );
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 15_000 } );

		// DB: 直近予約の form_id が form2。
		const latestFormId = scalarInt(
			`SELECT form_id FROM ${ RES } ORDER BY id DESC LIMIT 1;`
		);
		expect( latestFormId ).toBe( form2Id );
	} );
} );
