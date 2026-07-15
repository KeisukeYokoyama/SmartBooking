/**
 * v0.4.0 UX改善 — フォーム設定のショートコード表示。
 *
 * フォームセレクタで選択中フォームのショートコードがセレクタ直下に表示され、
 * セレクタ切替に追随することを DOM で確認する。
 *   - デフォルトフォーム選択時: [smart_booking]（form_id 省略）
 *   - 追加フォーム選択時:       [smart_booking form_id="N"]
 *
 * クリップボードの実コピーは環境（セキュアコンテキスト/権限）依存で E2E が不安定な
 * ため、表示文字列の追随を検証する（コピーボタンの存在・活性は確認する）。
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

test.describe( 'v0.4.0 UX: フォーム設定のショートコード表示', () => {
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

	test( 'セレクタ切替でショートコード表示が追随する', async ( { page } ) => {
		await bootstrapAdmin( page, 'form-settings' );

		const defaultId = getDefaultFormId();
		expect( defaultId ).toBeGreaterThan( 0 );

		// 追加フォームを作成（初期3フィールド自動生成）。
		const created = await restCall( page, 'POST', 'forms', {
			name: '来店予約フォーム',
		} );
		expect( [ 200, 201 ].includes( created.status ) ).toBe( true );
		const form2Id = created.data.id;
		expect( form2Id ).toBeGreaterThan( 0 );

		// UI に反映させるため再読込。
		await page.reload( { waitUntil: 'domcontentloaded' } );
		await page.waitForFunction( () => !! window.smartBookingAdmin?.nonce, {
			timeout: 15_000,
		} );

		const selector = page.locator( '.smb-form-selector-bar select' );
		await expect( selector ).toBeVisible( { timeout: 15_000 } );

		const code = page.locator( '.smb-shortcode-field__code' );
		const copyBtn = page.locator( '.smb-shortcode-field__copy' );

		// --- 初期表示: デフォルトフォーム → [smart_booking] ---
		await expect( selector ).toHaveValue( String( defaultId ) );
		await expect( code ).toHaveText( '[smart_booking]' );
		await expect( copyBtn ).toBeEnabled();

		// --- 追加フォームを選択 → [smart_booking form_id="N"] ---
		await selector.selectOption( String( form2Id ) );
		await expect( code ).toHaveText(
			`[smart_booking form_id="${ form2Id }"]`
		);

		// --- デフォルトへ戻す → 再び [smart_booking] ---
		await selector.selectOption( String( defaultId ) );
		await expect( code ).toHaveText( '[smart_booking]' );
	} );
} );
