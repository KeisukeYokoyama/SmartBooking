/**
 * v0.4.0 機能② 複数フォーム — 管理画面フォームセレクタ切替（UI）。
 *
 * フォーム設定画面のセレクタでフォームを切り替えると、フィールド一覧が
 * そのフォームのフィールドへ切り替わることを DOM で確認する。
 *   - form1（デフォルト）固有フィールド「メモ1」が form1 選択時のみ表示
 *   - form2 固有フィールド「来店きっかけ」が form2 選択時のみ表示
 *
 * UI セレクタ依存のため desktop プロジェクト限定。配布物外（検証専用）。
 */
const { test, expect } = require( '@playwright/test' );
const {
	restCall,
	bootstrapAdmin,
	restoreSnapshot,
} = require( './phase2-helpers' );
const { resetForms, getDefaultFormId } = require( './v040-helpers' );

test.describe.configure( { mode: 'serial' } );

test.describe( 'v0.4.0 ②: 管理画面フォームセレクタ切替', () => {
	test.setTimeout( 120_000 );

	test.beforeEach( async ( {}, testInfo ) => {
		test.skip(
			testInfo.project.name !== 'desktop',
			'UI セレクタ依存のため desktop 限定'
		);
		restoreSnapshot();
		resetForms();
	} );

	test.afterAll( async () => {
		restoreSnapshot();
		resetForms();
	} );

	test( 'セレクタでフォームを切り替えるとフィールド一覧が切り替わる', async ( {
		page,
	} ) => {
		// フォーム設定画面を開いて smartBookingAdmin（nonce）を使える状態にする。
		await bootstrapAdmin( page, 'form-settings' );

		const defaultId = getDefaultFormId();
		expect( defaultId ).toBeGreaterThan( 0 );

		// form2 を作成（初期3フィールド自動生成）。
		const created = await restCall( page, 'POST', 'forms', {
			name: '来店予約フォーム',
		} );
		expect( [ 200, 201 ].includes( created.status ) ).toBe( true );
		const form2Id = created.data.id;
		expect( form2Id ).toBeGreaterThan( 0 );

		// form1（デフォルト）固有フィールド「メモ1」を追加。
		const memo = await restCall( page, 'POST', 'custom-fields', {
			field_type: 'text',
			field_label: 'メモ1',
			is_required: 0,
			sort_order: 100,
			form_id: defaultId,
		} );
		expect( [ 200, 201 ].includes( memo.status ) ).toBe( true );

		// form2 固有フィールド「来店きっかけ」（select）を追加。
		const trigger = await restCall( page, 'POST', 'custom-fields', {
			field_type: 'select',
			field_label: '来店きっかけ',
			field_options: [ 'Web検索', 'ご紹介' ],
			is_required: 0,
			sort_order: 100,
			form_id: form2Id,
		} );
		expect( [ 200, 201 ].includes( trigger.status ) ).toBe( true );

		// UI に反映させるため再読込。
		await page.reload( { waitUntil: 'domcontentloaded' } );
		await page.waitForFunction( () => !! window.smartBookingAdmin?.nonce, {
			timeout: 15_000,
		} );
		const selector = page.locator( '.smb-form-selector-bar select' );
		await expect( selector ).toBeVisible( { timeout: 15_000 } );

		const memoRow = page.locator( '.smb-field-list__label-text', {
			hasText: 'メモ1',
		} );
		const triggerRow = page.locator( '.smb-field-list__label-text', {
			hasText: '来店きっかけ',
		} );

		// --- 初期表示: デフォルトフォームが選択されている ---
		await expect( memoRow ).toBeVisible( { timeout: 15_000 } );
		await expect( triggerRow ).toHaveCount( 0 );

		// --- form2 を選択 → フィールド一覧が form2 のものへ切り替わる ---
		await selector.selectOption( String( form2Id ) );
		await expect( triggerRow ).toBeVisible( { timeout: 15_000 } );
		// form1 固有フィールドは消える。
		await expect( memoRow ).toHaveCount( 0 );

		// --- デフォルトへ戻す → メモ1 が再表示・来店きっかけは消える ---
		await selector.selectOption( String( defaultId ) );
		await expect( memoRow ).toBeVisible( { timeout: 15_000 } );
		await expect( triggerRow ).toHaveCount( 0 );
	} );
} );
