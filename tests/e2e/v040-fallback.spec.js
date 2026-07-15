/**
 * v0.4.0 機能② 複数フォーム — 不正 form_id のフォールバック。
 *
 *  - ショートコード `[smart_booking form_id="99999"]`（存在しない）→ フロントの
 *    #smart-booking-app data-form-id はデフォルトフォームの id に解決される。
 *  - GET /public/custom-fields?form_id=99999 はデフォルトフォームのフィールド
 *    （初期3件相当）を返す。
 *
 * REST 中心（属性 + 公開 REST）のため desktop/mobile 両方で実行。配布物外（検証専用）。
 */
const { test, expect } = require( '@playwright/test' );
const {
	restoreBaseline,
	gotoFrontForm,
	publicRest,
} = require( './phase3-helpers' );
const {
	resetForms,
	getDefaultFormId,
	getFrontPageId,
	setFrontShortcode,
	restoreFrontShortcode,
} = require( './v040-helpers' );

const CORE_KEYS = [ 'customer_name', 'customer_email', 'customer_phone' ];

test.describe.configure( { mode: 'serial' } );

let frontPageId = 5;

test.describe( 'v0.4.0 ②: 不正 form_id のフォールバック', () => {
	test.setTimeout( 120_000 );

	test.beforeAll( () => {
		frontPageId = getFrontPageId();
	} );

	test.beforeEach( async () => {
		restoreBaseline();
		resetForms();
	} );

	test.afterAll( async () => {
		restoreFrontShortcode( frontPageId );
		restoreBaseline();
		resetForms();
	} );

	test( '存在しない form_id はデフォルトフォームへフォールバックする', async ( {
		page,
	} ) => {
		const defaultId = getDefaultFormId();
		expect( defaultId ).toBeGreaterThan( 0 );

		// 存在しない form_id=99999 を指定したショートコードへ差し替え。
		setFrontShortcode( frontPageId, '[smart_booking form_id="99999"]' );

		try {
			await gotoFrontForm( page );

			// data-form-id は 99999 ではなくデフォルトフォームの id に解決されている。
			const app = page.locator( '#smart-booking-app' );
			await expect( app ).toHaveAttribute(
				'data-form-id',
				String( defaultId )
			);
			await expect( app ).not.toHaveAttribute( 'data-form-id', '99999' );

			// 公開 custom-fields も form_id=99999 でデフォルトフォームのフィールドを返す。
			const cf = await publicRest( page, 'public/custom-fields', {
				query: { form_id: 99999 },
			} );
			expect( cf.status ).toBe( 200 );
			expect( Array.isArray( cf.data ) ).toBe( true );
			expect( cf.data.length ).toBe( 3 );
			const keys = cf.data.map( ( f ) => f.field_key ).sort();
			expect( keys ).toEqual( [ ...CORE_KEYS ].sort() );
			// 返ってきたフィールドはすべてデフォルトフォームに紐づく（フォールバックの証左）。
			cf.data.forEach( ( f ) => expect( f.form_id ).toBe( defaultId ) );
		} finally {
			restoreFrontShortcode( frontPageId );
		}
	} );
} );
