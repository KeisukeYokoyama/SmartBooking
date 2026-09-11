/**
 * v0.5.4 D (H4): 条件フィールドの親を checkbox に変更するとデータが消える不具合の
 * 再現／回帰 E2E。
 *
 * 起票: docs/bugs/condition-parent-checkbox-silent-data-loss.md
 *
 * 壊れ方（修正前）:
 *   radio 親 + 条件付き子 を作ったあと、親の種別を checkbox に変更できてしまう。
 *   フロント（fieldConditions.js）は String(['希望する']) === '希望する' で条件成立と判定して
 *   子を表示し、確認画面にも出す。しかしサーバー（class-rest-public.php::condition_met）は
 *   配列を不成立として扱うため、必須チェックを素通りしたうえで meta 行を作らない。
 *   ＝ユーザーの入力が無言で消える。
 *
 * 本 spec の検証点:
 *   (1) 親の種別変更ガード（案3・サーバー）: 既に親のフィールドを radio/select 以外へ
 *       変更しようとすると 400 smb_field_parent_type_locked。
 *   (2) ガードが過剰でないこと: radio→select は許可／子の条件を解除すれば変更できる。
 *   (3) 管理UI（案3・フロント）: 既に親のフィールドは種別セレクタが disabled で理由を表示。
 *   (4) 配列判定の一致（案1・フロント）: 既に親が checkbox になっているサイトでも、
 *       子は最初から表示されない（＝入力させてから捨てる経路が消える）。
 *
 * 配布物外（検証専用）。beforeEach/afterAll で restoreBaseline により掃除する。
 */
const { execSync } = require( 'node:child_process' );
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertSchedule,
	USER_STORE_ID,
	USER_STAFF_ID,
	ymd,
} = require( './phase3-helpers' );
const { bootstrapAdmin, restCall } = require( './phase2-helpers' );

const CF = 'wp_smart_booking_custom_fields';
const RM = 'wp_smart_booking_reservation_meta';

function dbq( sql, extra = '' ) {
	return execSync(
		`npx wp-env run cli wp db query ${ JSON.stringify( sql ) } ${ extra }`,
		{ encoding: 'utf8' }
	);
}

/**
 * 親（資料送付）と条件付き子（送付先住所）を seed する。
 *
 * @param {string} parentType 親の field_type（'radio' | 'select' | 'checkbox'）.
 */
function seedParentAndChild( parentType = 'radio' ) {
	dbq(
		`INSERT INTO ${ CF } (field_key,field_label,field_type,field_options,placeholder,is_required,sort_order,condition_field_key,condition_value,created_at) VALUES ` +
			`('shiryo','資料送付','${ parentType }','["希望する","希望しない"]','',0,50,NULL,NULL,NOW()),` +
			`('addr','送付先住所','textarea','[]','',1,60,'shiryo','希望する',NOW()),` +
			`('memo','メモ','text','[]','',0,70,NULL,NULL,NOW());` +
			// v0.4.0: custom_fields は form_id 必須。直接 INSERT した行をデフォルトフォームへ紐付ける。
			` UPDATE ${ CF } SET form_id = (SELECT id FROM wp_smart_booking_forms WHERE is_default = 1 LIMIT 1) WHERE form_id = 0;`
	);
}

function fieldId( key ) {
	const out = dbq(
		`SELECT id FROM ${ CF } WHERE field_key='${ key }' ORDER BY id DESC LIMIT 1;`,
		'--skip-column-names'
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : 0;
}

function fieldType( key ) {
	const out = dbq(
		`SELECT field_type FROM ${ CF } WHERE field_key='${ key }' ORDER BY id DESC LIMIT 1;`,
		'--skip-column-names'
	);
	return out
		.split( '\n' )
		.map( ( s ) => s.trim() )
		.filter( ( s ) => /^[a-z]+$/.test( s ) )
		.pop();
}

function metaCount( key ) {
	const out = dbq(
		`SELECT COUNT(*) FROM ${ RM } WHERE meta_key='${ key }';`,
		'--skip-column-names'
	);
	const m = /(\d+)/.exec( out );
	return m ? parseInt( m[ 1 ], 10 ) : -1;
}

/**
 * 親フィールドの更新ペイロード（管理モーダルが送る形と同じ）。
 *
 * @param {string} type  変更後の field_type.
 * @param {string} label ラベル.
 */
function parentPayload( type, label = '資料送付' ) {
	return {
		field_label: label,
		field_key: 'shiryo',
		field_type: type,
		field_options: [ '希望する', '希望しない' ],
		placeholder: '',
		is_required: 0,
		condition_field_key: '',
		condition_value: '',
	};
}

async function openEdit( page, label ) {
	const row = page.locator( '.smb-field-list__row', { hasText: label } );
	await row.getByRole( 'button', { name: '編集' } ).click();
	await page.waitForSelector( '[role="dialog"].smb-modal', {
		timeout: 10_000,
	} );
	return page.getByRole( 'dialog' );
}

test.describe( 'v0.5.4 D: 条件フィールドの親を checkbox にできてしまう不具合', () => {
	test.setTimeout( 120_000 );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	test( '(1) 既に親のフィールドは checkbox へ種別変更できない（400）', async ( {
		page,
	} ) => {
		restoreBaseline();
		seedParentAndChild( 'radio' );
		await bootstrapAdmin( page, 'form-settings' );

		const res = await restCall(
			page,
			'PUT',
			`custom-fields/${ fieldId( 'shiryo' ) }`,
			parentPayload( 'checkbox' )
		);
		expect( res.status ).toBe( 400 );
		expect( res.data.code ).toBe( 'smb_field_parent_type_locked' );
		// DB は radio のまま（サイレントに壊れていない）。
		expect( fieldType( 'shiryo' ) ).toBe( 'radio' );
	} );

	test( '(2) ガードは過剰でない: radio→select は許可／ラベルのみの更新も通る', async ( {
		page,
	} ) => {
		restoreBaseline();
		seedParentAndChild( 'radio' );
		await bootstrapAdmin( page, 'form-settings' );
		const id = fieldId( 'shiryo' );

		// ラベルだけ変える（種別は据え置き）→ 200。
		const keep = await restCall(
			page,
			'PUT',
			`custom-fields/${ id }`,
			parentPayload( 'radio', '資料のご送付' )
		);
		expect( keep.status ).toBe( 200 );

		// radio → select（どちらも正当な親）→ 200。
		const toSelect = await restCall(
			page,
			'PUT',
			`custom-fields/${ id }`,
			parentPayload( 'select', '資料のご送付' )
		);
		expect( toSelect.status ).toBe( 200 );
		expect( fieldType( 'shiryo' ) ).toBe( 'select' );
	} );

	test( '(3) 子の表示条件を解除すれば親の種別は変更できる', async ( {
		page,
	} ) => {
		restoreBaseline();
		seedParentAndChild( 'radio' );
		await bootstrapAdmin( page, 'form-settings' );

		// 子(addr) の表示条件を解除 → shiryo は親でなくなる。
		const child = await restCall(
			page,
			'PUT',
			`custom-fields/${ fieldId( 'addr' ) }`,
			{
				field_label: '送付先住所',
				field_key: 'addr',
				field_type: 'textarea',
				field_options: [],
				placeholder: '',
				is_required: 1,
				condition_field_key: '',
				condition_value: '',
			}
		);
		expect( child.status ).toBe( 200 );

		const res = await restCall(
			page,
			'PUT',
			`custom-fields/${ fieldId( 'shiryo' ) }`,
			parentPayload( 'checkbox' )
		);
		expect( res.status ).toBe( 200 );
		expect( fieldType( 'shiryo' ) ).toBe( 'checkbox' );
	} );

	test( '(4) 管理UI: 既に親のフィールドは種別セレクタが disabled で理由が出る', async ( {
		page,
	} ) => {
		restoreBaseline();
		seedParentAndChild( 'radio' );
		await bootstrapAdmin( page, 'form-settings' );
		await page.waitForSelector( '.smb-page--form-settings', {
			timeout: 15_000,
		} );

		// 親（資料送付）→ 種別セレクタは disabled ＋ 理由の help。
		const parentDialog = await openEdit( page, '資料送付' );
		await expect(
			parentDialog.getByLabel( 'フィールドタイプ' )
		).toBeDisabled();
		await expect( parentDialog ).toContainText( '種別を変更できません' );
		await parentDialog
			.getByRole( 'button', { name: 'キャンセル' } )
			.click();
		await page.waitForSelector( '[role="dialog"].smb-modal', {
			state: 'detached',
			timeout: 10_000,
		} );

		// 親でないフィールド（メモ）は従来どおり変更できる。
		const plainDialog = await openEdit( page, 'メモ' );
		await expect(
			plainDialog.getByLabel( 'フィールドタイプ' )
		).toBeEnabled();
	} );

	test( '(5) 既に親が checkbox のサイトでも子は表示されない（フロント）', async ( {
		page,
	} ) => {
		restoreBaseline();
		setOption( 'smart_booking_show_store_front', 0 );
		setOption( 'smart_booking_show_staff_front', 0 );
		// 修正前の版で壊された状態を DB 直接 seed で再現する。
		seedParentAndChild( 'checkbox' );
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 2 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 5,
		} );

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

		// 「希望する」を1つだけチェック（＝修正前に子が出てしまう条件）。
		await page.locator( '#smb-front-field-shiryo-opt-0' ).check();
		// 子は表示されない（サーバーの condition_met と判定が一致している）。
		await expect( page.locator( '#smb-front-field-addr' ) ).toHaveCount(
			0
		);

		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( '配列 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'array@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-5555-6666' );
		await page.getByRole( 'button', { name: '予約内容の確認' } ).click();
		await page.waitForSelector(
			'.smb-front-confirm-page, .smb-front-confirm',
			{ timeout: 10_000 }
		);
		// 確認画面にも子は出ない（＝入力していないものを「受理された」と誤認させない）。
		await expect( page.getByText( '送付先住所' ) ).toHaveCount( 0 );

		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		// 子の meta 行は無い（そもそも入力させていない）。
		expect( metaCount( 'addr' ) ).toBe( 0 );
		// 一方で checkbox 親そのものの回答は従来どおり保存される（回帰確認）。
		expect( metaCount( 'shiryo' ) ).toBe( 1 );
	} );
} );
