/**
 * v0.4.0 機能② 複数フォーム — フォーム CRUD + 上限（REST・管理 nonce）。
 *
 *  - POST /forms 作成 → 初期3フィールド（氏名/メール/電話）自動生成
 *  - 上限: デフォルト含め総数10まで作成でき、11個目で 403 smb_forms_limit
 *  - PUT /forms/{id} 改名 → GET /forms に反映
 *  - DELETE /forms/{id}（通常）→ custom_fields 0・reservations は残る
 *  - DELETE /forms/{defaultId} → 403 smb_form_default_protected
 *
 * 配布物外（検証専用）。beforeEach / afterAll でデフォルトフォーム1件へ復元する。
 */
const { test, expect } = require( '@playwright/test' );
const {
	restCall,
	bootstrapAdmin,
	restoreSnapshot,
} = require( './phase2-helpers' );
const {
	resetForms,
	getDefaultFormId,
	insertReservationForForm,
	countTable,
	CF,
	RES,
} = require( './v040-helpers' );

const CORE_KEYS = [ 'customer_name', 'customer_email', 'customer_phone' ];

test.describe.configure( { mode: 'serial' } );

test.describe( 'v0.4.0 ②: フォーム CRUD + 上限', () => {
	test.setTimeout( 120_000 );

	test.beforeEach( async () => {
		restoreSnapshot();
		resetForms();
	} );

	test.afterAll( async () => {
		restoreSnapshot();
		resetForms();
	} );

	test( '作成すると初期3フィールドが自動生成され、上限10で11個目は 403', async ( {
		page,
	} ) => {
		await bootstrapAdmin( page, 'schedule' );

		// --- 作成 + 初期3フィールド ---
		const created = await restCall( page, 'POST', 'forms', {
			name: '無料相談',
		} );
		expect(
			[ 200, 201 ].includes( created.status ),
			`create status=${ created.status } data=${ JSON.stringify(
				created.data
			) }`
		).toBe( true );
		expect( created.data ).toBeTruthy();
		const newId = created.data.id;
		expect( newId ).toBeGreaterThan( 0 );
		expect( created.data.name ).toBe( '無料相談' );

		const fields = await restCall( page, 'GET', 'custom-fields', null, {
			form_id: newId,
		} );
		expect( fields.status ).toBe( 200 );
		expect( Array.isArray( fields.data ) ).toBe( true );
		expect( fields.data.length ).toBe( 3 );
		const keys = fields.data.map( ( f ) => f.field_key ).sort();
		expect( keys ).toEqual( [ ...CORE_KEYS ].sort() );
		// 全て form_id が新フォームに紐づく。
		fields.data.forEach( ( f ) => expect( f.form_id ).toBe( newId ) );

		// --- 上限: 現在デフォルト + 無料相談 = 2 件。あと 8 件作れば総数 10。 ---
		for ( let i = 2; i <= 9; i++ ) {
			const r = await restCall( page, 'POST', 'forms', {
				name: `フォーム${ i }`,
			} );
			expect(
				[ 200, 201 ].includes( r.status ),
				`create #${ i } status=${ r.status }`
			).toBe( true );
		}
		// 総数 10 になったので 11 個目は 403 smb_forms_limit。
		const over = await restCall( page, 'POST', 'forms', {
			name: '超過フォーム',
		} );
		expect( over.status ).toBe( 403 );
		expect( over.data.code ).toBe( 'smb_forms_limit' );
		// DB 上も 10 件で頭打ち。
		expect( countTable( 'wp_smart_booking_forms' ) ).toBe( 10 );
	} );

	test( 'PUT /forms/{id} で改名すると GET /forms に反映される', async ( {
		page,
	} ) => {
		await bootstrapAdmin( page, 'schedule' );

		const created = await restCall( page, 'POST', 'forms', {
			name: '改名前フォーム',
		} );
		const id = created.data.id;
		expect( id ).toBeGreaterThan( 0 );

		const updated = await restCall( page, 'PUT', `forms/${ id }`, {
			name: '改名後フォーム',
		} );
		expect( updated.status ).toBe( 200 );
		expect( updated.data.name ).toBe( '改名後フォーム' );

		const list = await restCall( page, 'GET', 'forms' );
		expect( list.status ).toBe( 200 );
		const target = list.data.find( ( f ) => f.id === id );
		expect( target ).toBeTruthy();
		expect( target.name ).toBe( '改名後フォーム' );
	} );

	test( 'DELETE /forms/{id}（通常）で custom_fields は 0・reservations は残る', async ( {
		page,
	} ) => {
		await bootstrapAdmin( page, 'schedule' );

		const created = await restCall( page, 'POST', 'forms', {
			name: '削除対象フォーム',
		} );
		const id = created.data.id;
		expect( id ).toBeGreaterThan( 0 );
		// 自動生成された 3 フィールドがある。
		expect( countTable( CF, `form_id=${ id }` ) ).toBe( 3 );

		// このフォーム経由の予約を 1 件 seed（削除でも残ることを確認する）。
		insertReservationForForm( id );
		const resBefore = countTable( RES );
		expect( resBefore ).toBeGreaterThanOrEqual( 1 );

		const del = await restCall( page, 'DELETE', `forms/${ id }` );
		expect( del.status ).toBe( 200 );
		expect( del.data.deleted ).toBe( true );

		// フォームのフィールド定義は削除される。
		expect( countTable( CF, `form_id=${ id }` ) ).toBe( 0 );
		// 予約データは残る（件数が減っていない）。
		expect( countTable( RES ) ).toBe( resBefore );
		expect( countTable( RES, `form_id=${ id }` ) ).toBeGreaterThanOrEqual(
			1
		);
	} );

	test( 'DELETE /forms/{defaultId} は 403 smb_form_default_protected', async ( {
		page,
	} ) => {
		await bootstrapAdmin( page, 'schedule' );

		const defaultId = getDefaultFormId();
		expect( defaultId ).toBeGreaterThan( 0 );

		const del = await restCall( page, 'DELETE', `forms/${ defaultId }` );
		expect( del.status ).toBe( 403 );
		expect( del.data.code ).toBe( 'smb_form_default_protected' );
		// デフォルトフォームは残っている。
		expect(
			countTable( 'wp_smart_booking_forms', `id=${ defaultId }` )
		).toBe( 1 );
	} );
} );
