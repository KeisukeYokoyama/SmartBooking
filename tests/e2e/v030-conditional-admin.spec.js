/**
 * v0.3.0 機能③ 条件フィールド — 管理画面 条件UI DOM E2E（2g / ネスト両方向）。
 *
 *  (a) 通常フィールドの編集モーダルに「表示条件」があり、親候補 select に radio/select が出る。
 *      自分自身・非 radio/select・条件付きフィールドは候補に出ない。
 *  (b) system フィールド（氏名/メール/電話）の編集モーダルには「表示条件」が出ない。
 *  (c) 逆方向ネスト: 既に親になっているフィールドの編集モーダルには「表示条件」設定 UI が出ず、
 *      「他フィールドの親になっているため設定できない」旨の案内が出る。
 *  (d) 親候補 0 件（radio/select が無い）なら、スイッチの代わりに案内文が出る。
 *
 * 配布物外（検証専用）。afterAll で restoreSnapshot。
 */
const { execSync } = require( 'node:child_process' );
const { test, expect } = require( '@playwright/test' );
const { bootstrapAdmin, restoreSnapshot } = require( './phase2-helpers' );

const CF = 'wp_smart_booking_custom_fields';

function dbq( sql ) {
	execSync( `npx wp-env run cli wp db query ${ JSON.stringify( sql ) }`, {
		encoding: 'utf8',
	} );
}
function seedFull() {
	dbq(
		`INSERT INTO ${ CF } (field_key,field_label,field_type,field_options,placeholder,is_required,sort_order,condition_field_key,condition_value,created_at) VALUES ` +
			`('pref','都道府県','select','["北海道","東京"]','',0,40,NULL,NULL,NOW()),` +
			`('shiryo','資料送付','radio','["希望する","希望しない"]','',0,50,NULL,NULL,NOW()),` +
			`('addr','送付先住所','textarea','[]','',1,60,'shiryo','希望する',NOW()),` +
			`('memo','メモ','text','[]','',0,70,NULL,NULL,NOW());`
	);
}
function seedTextOnly() {
	dbq(
		`INSERT INTO ${ CF } (field_key,field_label,field_type,field_options,placeholder,is_required,sort_order,condition_field_key,condition_value,created_at) VALUES ` +
			`('memo','メモ','text','[]','',0,70,NULL,NULL,NOW());`
	);
}

async function openEdit( page, label ) {
	const row = page.locator( '.smb-field-list__row', { hasText: label } );
	await row.getByRole( 'button', { name: '編集' } ).click();
	await page.waitForSelector( '[role="dialog"].smb-modal', {
		timeout: 10_000,
	} );
	return page.getByRole( 'dialog' );
}

test.describe( 'v0.3.0 ③: 条件フィールド 管理UI', () => {
	test.setTimeout( 90_000 );

	test.beforeEach( async () => {
		restoreSnapshot();
	} );
	test.afterAll( async () => {
		restoreSnapshot();
	} );

	test( '(a) 通常フィールド: 表示条件セクション有・親候補に自身/非選択式/条件付きが出ない', async ( {
		page,
	} ) => {
		seedFull();
		await bootstrapAdmin( page, 'form-settings' );
		await page.waitForSelector( '.smb-page--form-settings', {
			timeout: 15_000,
		} );

		// select フィールド「都道府県」を編集 → 自己除外の検証に使う。
		const dialog = await openEdit( page, '都道府県' );
		await expect(
			dialog.getByText( '表示条件', { exact: true } )
		).toBeVisible();

		// 表示条件スイッチを ON。
		await dialog
			.locator( 'label.smb-switch' )
			.filter( { hasText: '常に表示する' } )
			.click();

		const parentSelect = dialog.getByLabel( '親フィールド' );
		await expect( parentSelect ).toBeVisible();
		const opts = (
			await parentSelect.locator( 'option' ).allTextContents()
		)
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		// radio「資料送付」は候補に出る。
		expect( opts ).toContain( '資料送付' );
		// 自分自身（都道府県）は出ない。
		expect( opts ).not.toContain( '都道府県' );
		// 条件付き & 非選択式（送付先住所=textarea）は出ない。
		expect( opts ).not.toContain( '送付先住所' );
	} );

	test( '(b) systemフィールド（氏名）: 表示条件セクションが出ない', async ( {
		page,
	} ) => {
		seedFull();
		await bootstrapAdmin( page, 'form-settings' );
		await page.waitForSelector( '.smb-page--form-settings', {
			timeout: 15_000,
		} );

		const dialog = await openEdit( page, 'お名前' );
		await expect( dialog ).toContainText( '初期フィールド' );
		await expect(
			dialog.getByText( '表示条件', { exact: true } )
		).toHaveCount( 0 );
	} );

	test( '(c) 逆方向ネスト: 既に親のフィールドは表示条件UIが出ず案内文が出る', async ( {
		page,
	} ) => {
		seedFull();
		await bootstrapAdmin( page, 'form-settings' );
		await page.waitForSelector( '.smb-page--form-settings', {
			timeout: 15_000,
		} );

		// 資料送付(shiryo) は addr の親 → 表示条件は設定不可。
		const dialog = await openEdit( page, '資料送付' );
		await expect(
			dialog.getByText( '表示条件', { exact: true } )
		).toBeVisible();
		await expect( dialog ).toContainText(
			'他フィールドの表示条件の親になっているため'
		);
		// 表示条件スイッチは出ない。
		await expect(
			dialog
				.locator( 'label.smb-switch' )
				.filter( { hasText: '常に表示する' } )
		).toHaveCount( 0 );
	} );

	test( '(d) 親候補0件: スイッチではなく案内文が出る', async ( { page } ) => {
		seedTextOnly();
		await bootstrapAdmin( page, 'form-settings' );
		await page.waitForSelector( '.smb-page--form-settings', {
			timeout: 15_000,
		} );

		const dialog = await openEdit( page, 'メモ' );
		await expect(
			dialog.getByText( '表示条件', { exact: true } )
		).toBeVisible();
		await expect( dialog ).toContainText(
			'選択式（ラジオ/セレクト）のフィールドを先に作成'
		);
		await expect(
			dialog
				.locator( 'label.smb-switch' )
				.filter( { hasText: '常に表示する' } )
		).toHaveCount( 0 );
	} );
} );
