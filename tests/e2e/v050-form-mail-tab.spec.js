/**
 * v0.5.0 Eval: フォーム設定「メール」タブ UI（FormMailTab）。
 *
 * - トグルON で共通テンプレートがプリセット反映される。
 * - 件名/本文を編集して保存 → 永続化（再読込で復活）。
 * - 変数ヘルパーが選択中フォームのカスタム変数（{trial_course}）を表示する。
 * - トグルOFF で共通文面プレビューが出る。OFF 保存でも下書きは破棄されず（DB に残存）、再ONで復活。
 *
 * 実行: `npx playwright test tests/e2e/v050-form-mail-tab.spec.js --project=desktop`
 */
const { test, expect } = require( '@playwright/test' );
const { restoreBaseline } = require( './phase3-helpers' );
const { wpCli, loginAsAdmin } = require( './helpers' );
const { resetForms } = require( './v040-helpers' );

test.describe.configure( { mode: 'serial' } );

function setOptionRaw( key, value ) {
	const safe = String( value ).replace( /"/g, '\\"' );
	wpCli( `option update ${ key } "${ safe }"` );
}
function insertFieldForForm( formId, key, label ) {
	wpCli(
		`db query "INSERT INTO wp_smart_booking_custom_fields (form_id, field_key, field_label, field_type, field_options, placeholder, is_required, sort_order, condition_field_key, condition_value, created_at) VALUES (${ formId }, '${ key }', '${ label }', 'text', '[]', '', 0, 30, NULL, NULL, NOW());"`
	);
}
function readOverridesJson( formId ) {
	// mail_overrides は wp_json_encode で \uXXXX エスケープ格納されるため、PHP 側で
	// json_decode → JSON_UNESCAPED_UNICODE で再エンコードして生 UTF-8 を得る
	// （シェル往復での二重エスケープを避け、格納値そのものを検証する）。
	const out = wpCli(
		`eval 'global $wpdb; $v=$wpdb->get_var("SELECT mail_overrides FROM wp_smart_booking_forms WHERE id=${ formId }"); echo wp_json_encode( json_decode( (string) $v, true ), JSON_UNESCAPED_UNICODE );'`
	);
	const m = String( out ).match( /(\{[\s\S]*\})/ );
	if ( ! m ) return null;
	try {
		return JSON.parse( m[ 1 ] );
	} catch {
		return null;
	}
}

async function adminRest( page, method, path, body ) {
	return page.evaluate(
		async ( { method, path, body } ) => {
			const nonce =
				window.wpApiSettings && window.wpApiSettings.nonce
					? window.wpApiSettings.nonce
					: '';
			const res = await fetch( `/wp-json/smart-booking/v1/${ path }`, {
				method,
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': nonce,
					Accept: 'application/json',
				},
				body: body ? JSON.stringify( body ) : undefined,
			} );
			let data = null;
			try {
				data = await res.json();
			} catch {
				/* noop */
			}
			return { ok: res.ok, status: res.status, data };
		},
		{ method, path, body }
	);
}

const COMMON_USER_SUBJECT = 'タブ共通受付件名';
const COMMON_USER_BODY = 'タブ共通ユーザー受付\n{customer_name} 様\n予約番号: {reservation_id}';

test.describe( 'v0.5.0: メールタブ UI', () => {
	test.setTimeout( 90_000 );

	let formB = 0;

	test.beforeAll( async () => {
		restoreBaseline();
		resetForms();
		setOptionRaw( 'smart_booking_mail_receipt_user_subject', COMMON_USER_SUBJECT );
		setOptionRaw( 'smart_booking_mail_receipt_user_body', COMMON_USER_BODY );
	} );

	test.afterAll( async () => {
		resetForms();
		restoreBaseline();
	} );

	async function openMailTab( page, formId ) {
		await page.goto(
			`/wp-admin/admin.php?page=smart-booking-form-settings&smb_tab=mail&smb_form=${ formId }`
		);
		await page.waitForFunction(
			() => !! window.smartBookingAdmin?.nonce,
			{ timeout: 15000 }
		);
		await page.waitForSelector( '#smb-form-mail-toggle-reception_user', {
			timeout: 15000,
		} );
	}

	test( 'A: トグルON でプリセット反映・変数ヘルパー表示・編集保存が永続化', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		const created = await adminRest( page, 'POST', 'forms', { name: 'タブ検証フォーム' } );
		expect( created.status, JSON.stringify( created.data ) ).toBe( 200 );
		formB = Number( created.data.id );
		expect( formB ).toBeGreaterThan( 0 );
		insertFieldForForm( formB, 'trial_course', '体験コース' );

		await openMailTab( page, formB );

		const section = page.locator( '.smb-settings-section', {
			has: page.locator( '#smb-form-mail-toggle-reception_user' ),
		} );

		// 初期は OFF＝共通プレビュー（読み取り専用）が出る。
		await expect(
			section.locator( '.smb-mail-override-preview' )
		).toBeVisible();

		// トグル ON。
		const toggle = page.locator( '#smb-form-mail-toggle-reception_user' );
		await toggle.click( { force: true } );

		// ON でその時点の共通テンプレートがプリセットされる。
		const subject = section.locator( 'input[type="text"]' ).first();
		const body = section.locator( 'textarea' ).first();
		await expect( subject ).toHaveValue( COMMON_USER_SUBJECT );
		await expect( body ).toHaveValue( COMMON_USER_BODY );

		// 変数ヘルパーが選択中フォームのカスタム変数 {trial_course} を表示する。
		await expect(
			section.locator( '.smb-var-chip code', { hasText: '{trial_course}' } )
		).toBeVisible();

		// 専用文面へ編集して保存。
		await subject.fill( '専用件名（タブ編集）' );
		await body.fill( '専用本文（タブ編集）\n{customer_name} 様\nコース: {trial_course}' );
		await page.getByRole( 'button', { name: 'メール文面を保存' } ).click();
		// 保存トースト。
		await expect( page.getByText( 'メール文面を保存しました' ) ).toBeVisible( {
			timeout: 10000,
		} );

		// DB 永続化を確認。
		const saved = readOverridesJson( formB );
		expect( saved ).toBeTruthy();
		expect( saved.reception_user.enabled ).toBe( true );
		expect( saved.reception_user.subject ).toBe( '専用件名（タブ編集）' );
		expect( saved.reception_user.body ).toContain( 'コース: {trial_course}' );

		// 再読込で ON・編集値が復活する。
		await openMailTab( page, formB );
		const section2 = page.locator( '.smb-settings-section', {
			has: page.locator( '#smb-form-mail-toggle-reception_user' ),
		} );
		await expect(
			section2.locator( 'input[type="text"]' ).first()
		).toHaveValue( '専用件名（タブ編集）' );
	} );

	test( 'B: OFF 保存で下書きは破棄されず（DB残存）・再ONで復活・共通プレビュー表示', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		await openMailTab( page, formB );

		const toggle = page.locator( '#smb-form-mail-toggle-reception_user' );
		// 現在 ON（前テストで保存済み）→ OFF にする。
		await toggle.click( { force: true } );

		const section = page.locator( '.smb-settings-section', {
			has: page.locator( '#smb-form-mail-toggle-reception_user' ),
		} );
		// OFF で共通プレビュー（読み取り専用）が出る。
		await expect(
			section.locator( '.smb-mail-override-preview' )
		).toBeVisible();

		await page.getByRole( 'button', { name: 'メール文面を保存' } ).click();
		await expect( page.getByText( 'メール文面を保存しました' ) ).toBeVisible( {
			timeout: 10000,
		} );

		// OFF でも subject/body は破棄されず DB に残存する。
		const saved = readOverridesJson( formB );
		expect( saved.reception_user.enabled ).toBe( false );
		expect( saved.reception_user.subject ).toBe( '専用件名（タブ編集）' );
		expect( saved.reception_user.body ).toContain( 'コース: {trial_course}' );

		// 再読込 → 再 ON で下書きが復活する（プリセットで上書きされない）。
		await openMailTab( page, formB );
		const toggle2 = page.locator( '#smb-form-mail-toggle-reception_user' );
		await toggle2.click( { force: true } );
		const section2 = page.locator( '.smb-settings-section', {
			has: page.locator( '#smb-form-mail-toggle-reception_user' ),
		} );
		await expect(
			section2.locator( 'input[type="text"]' ).first()
		).toHaveValue( '専用件名（タブ編集）' );
	} );
} );
