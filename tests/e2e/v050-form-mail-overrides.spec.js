/**
 * v0.5.0 Eval: フォーム別メール文面の送信解決（専用/共通の出し分け）。
 *
 * `tests/mu-plugins/smb-mail-catcher.php` が pre_wp_mail を傍受してオプションに蓄積する前提で、
 * 予約 form_id に応じて「専用文面」か「共通文面」かが正しく選ばれることを本文で検証する。
 *
 * - フォームB の受付(ユーザー宛)だけ専用ON → フォームB予約は専用文面＋B変数展開／フォームA予約は共通。
 * - 同予約の受付(管理者宛)は共通のまま（種別独立）。
 * - 承認(ユーザー宛)専用ON → 承認メールが専用文面。
 * - 全OFF（初期状態）→ 本文が共通 option のパススルーとバイト一致（デグレ最重要）。
 * - フォーム削除後の既存予約の承認 → 共通文面へ自然フォールバック。
 *
 * 実行: `npx playwright test tests/e2e/v050-form-mail-overrides.spec.js --project=desktop`
 */
const { test, expect } = require( '@playwright/test' );
const {
	restoreBaseline,
	insertSchedule,
	publicRest,
	gotoFrontForm,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );
const { wpCli, loginAsAdmin } = require( './helpers' );
const { resetForms, getDefaultFormId } = require( './v040-helpers' );

test.describe.configure( { mode: 'serial' } );

function setOptionRaw( key, value ) {
	const safe = String( value ).replace( /"/g, '\\"' );
	wpCli( `option update ${ key } "${ safe }"` );
}
function setStoreEmail( storeId, email ) {
	const safe = String( email ).replace( /'/g, "''" );
	wpCli( `db query "UPDATE wp_smart_booking_stores SET email = '${ safe }' WHERE id = ${ storeId };"` );
}
function clearMailLog() {
	wpCli( `option delete smb_test_mail_log` );
}
function clearDefaultOverrides() {
	wpCli( `db query "UPDATE wp_smart_booking_forms SET mail_overrides = NULL;"` );
}
function fetchMailLog() {
	const out = wpCli(
		`eval 'echo wp_json_encode( get_option("smb_test_mail_log", array()) );'`
	);
	const m = out.match( /(\[[\s\S]*\])/ );
	if ( ! m ) return [];
	try {
		const v = JSON.parse( m[ 1 ] );
		return Array.isArray( v ) ? v : [];
	} catch {
		return [];
	}
}
const findMailTo = ( log, addr ) =>
	log.find( ( m ) => [].concat( m.to ).includes( addr ) );

/** フォームBに trial_course（text）カスタムフィールドを DB 直挿しする。 */
function insertFieldForForm( formId, key, label ) {
	wpCli(
		`db query "INSERT INTO wp_smart_booking_custom_fields (form_id, field_key, field_label, field_type, field_options, placeholder, is_required, sort_order, condition_field_key, condition_value, created_at) VALUES (${ formId }, '${ key }', '${ label }', 'text', '[]', '', 0, 30, NULL, NULL, NOW());"`
	);
}

/** admin REST（wpApiSettings.nonce）を叩く。要 loginAsAdmin 済み。 */
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

async function submitReservation( page, scheduleId, formId, customer, customFields ) {
	const res = await publicRest( page, 'public/reservations', {
		method: 'POST',
		body: {
			schedule_id: scheduleId,
			form_id: formId,
			customer_name: customer.name,
			customer_email: customer.email,
			customer_phone: customer.phone,
			custom_fields: customFields || {},
		},
	} );
	if ( res.status !== 200 && res.status !== 201 ) {
		throw new Error(
			`public/reservations failed: status=${ res.status } body=${ JSON.stringify( res.data ) }`
		);
	}
	return res.data;
}

// 共通テンプレート（固定マーカー付き）。
const COMMON_USER_BODY = '共通ユーザー受付\n{customer_name} 様\n予約番号: {reservation_id}';
const COMMON_ADMIN_BODY = '共通管理者受付\n{customer_name}\n予約番号: {reservation_id}';
const COMMON_APPROVAL_BODY = '共通承認\n{customer_name} 様\n予約番号: {reservation_id}';

test.describe( 'v0.5.0: フォーム別メール文面の出し分け', () => {
	test.setTimeout( 90_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		resetForms();
		clearDefaultOverrides();
		clearMailLog();
		setOptionRaw( 'smb_mail_capture_enabled', '1' );
		setStoreEmail( USER_STORE_ID, 'store-a@example.com' );
		setOptionRaw( 'smart_booking_mail_from_name', 'SB Test' );
		setOptionRaw( 'smart_booking_mail_from_email', 'noreply@example.com' );
		setOptionRaw( 'smart_booking_mail_receipt_user_subject', '共通受付件名' );
		setOptionRaw( 'smart_booking_mail_receipt_user_body', COMMON_USER_BODY );
		setOptionRaw( 'smart_booking_mail_receipt_admin_subject', '共通管理者件名' );
		setOptionRaw( 'smart_booking_mail_receipt_admin_body', COMMON_ADMIN_BODY );
		setOptionRaw( 'smart_booking_mail_approval_user_subject', '共通承認件名' );
		setOptionRaw( 'smart_booking_mail_approval_user_body', COMMON_APPROVAL_BODY );
		setOptionRaw( 'smart_booking_mail_admin_notify_enabled', '1' );
	} );

	test.afterAll( async () => {
		clearMailLog();
		try {
			wpCli( `option delete smb_mail_capture_enabled` );
		} catch ( _e ) {
			/* noop */
		}
		clearDefaultOverrides();
		resetForms();
		restoreBaseline();
	} );

	test( 'A: B受付ユーザー専用ON→専用文面＋B変数展開／A→共通／管理者宛は共通（種別独立）', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		// フォームB を作成（初期3フィールド付き）。
		const createRes = await adminRest( page, 'POST', 'forms', { name: '無料体験フォーム' } );
		expect( createRes.status, JSON.stringify( createRes.data ) ).toBe( 200 );
		const formB = Number( createRes.data.id );
		expect( formB ).toBeGreaterThan( 0 );
		const formA = getDefaultFormId();
		expect( formA ).toBeGreaterThan( 0 );
		expect( formB ).not.toBe( formA );

		// フォームB に固有カスタムフィールド trial_course を追加。
		insertFieldForForm( formB, 'trial_course', '体験コース' );

		// フォームB: reception_user だけ専用ON（B変数 {trial_course} を使う）。他はOFF。
		const putRes = await adminRest( page, 'PUT', `forms/${ formB }`, {
			mail_overrides: {
				reception_user: {
					enabled: true,
					subject: '専用受付件名B',
					body: '専用ユーザー受付B\n{customer_name} 様\nコース: {trial_course}\n予約番号: {reservation_id}',
				},
				reception_admin: { enabled: false, subject: '', body: '' },
				approval_user: { enabled: false, subject: '', body: '' },
			},
		} );
		expect( putRes.status, JSON.stringify( putRes.data ) ).toBe( 200 );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 5,
		} );
		expect( scheduleId ).toBeGreaterThan( 0 );

		// --- フォームB で予約 ---
		clearMailLog();
		await gotoFrontForm( page );
		const bRes = await submitReservation(
			page,
			scheduleId,
			formB,
			{ name: 'ビー 太郎', email: 'b-user@example.com', phone: '090-0000-0001' },
			{ trial_course: '週末コース' }
		);
		const bRid = Number( bRes?.id || bRes?.reservation_id );
		expect( bRid ).toBeGreaterThan( 0 );

		const bLog = fetchMailLog();
		const bUser = findMailTo( bLog, 'b-user@example.com' );
		const bAdmin = findMailTo( bLog, 'store-a@example.com' );
		expect( bUser, 'B user mail' ).toBeTruthy();
		expect( bAdmin, 'B admin mail' ).toBeTruthy();

		// ユーザー宛は専用文面＋B変数展開。
		expect( bUser.subject ).toBe( '専用受付件名B' );
		expect( bUser.message ).toContain( '専用ユーザー受付B' );
		expect( bUser.message ).toContain( 'コース: 週末コース' );
		expect( bUser.message ).toContain( `予約番号: ${ bRid }` );
		expect( bUser.message ).not.toContain( '共通ユーザー受付' );
		expect( bUser.message ).not.toContain( '{trial_course}' );

		// 管理者宛は共通のまま（reception_admin OFF＝種別独立）。
		expect( bAdmin.subject ).toBe( '共通管理者件名' );
		expect( bAdmin.message ).toContain( '共通管理者受付' );
		expect( bAdmin.message ).not.toContain( '専用' );

		// --- フォームA（デフォルト）で予約 → 共通文面 ---
		clearMailLog();
		const aRes = await submitReservation(
			page,
			insertSchedule( {
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: ymd( 2 ),
				start: '10:00:00',
				end: '11:00:00',
				capacity: 5,
			} ),
			formA,
			{ name: 'エー 花子', email: 'a-user@example.com', phone: '090-0000-0002' },
			{}
		);
		const aRid = Number( aRes?.id || aRes?.reservation_id );
		expect( aRid ).toBeGreaterThan( 0 );

		const aLog = fetchMailLog();
		const aUser = findMailTo( aLog, 'a-user@example.com' );
		expect( aUser, 'A user mail' ).toBeTruthy();
		expect( aUser.subject ).toBe( '共通受付件名' );
		expect( aUser.message ).toContain( '共通ユーザー受付' );
		expect( aUser.message ).not.toContain( '専用' );
	} );

	test( 'B: 全OFF（初期状態）のユーザー/管理者本文が共通 option のパススルーとバイト一致', async ( {
		page,
	} ) => {
		const formA = getDefaultFormId();
		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 3 ),
			start: '12:00:00',
			end: '13:00:00',
			capacity: 5,
		} );
		clearMailLog();
		await gotoFrontForm( page );
		const res = await submitReservation(
			page,
			scheduleId,
			formA,
			{ name: '無 加工', email: 'plain@example.com', phone: '090-0000-0003' },
			{}
		);
		const rid = Number( res?.id || res?.reservation_id );
		expect( rid ).toBeGreaterThan( 0 );

		const log = fetchMailLog();
		const user = findMailTo( log, 'plain@example.com' );
		const admin = findMailTo( log, 'store-a@example.com' );
		expect( user, 'user mail' ).toBeTruthy();
		expect( admin, 'admin mail' ).toBeTruthy();

		// override 無し（NULL）＝共通 option を render しただけの本文とバイト一致。
		const expectedUser = COMMON_USER_BODY.replace( '{customer_name}', '無 加工' ).replace(
			'{reservation_id}',
			String( rid )
		);
		const expectedAdmin = COMMON_ADMIN_BODY.replace( '{customer_name}', '無 加工' ).replace(
			'{reservation_id}',
			String( rid )
		);
		expect( user.message ).toBe( expectedUser );
		expect( admin.message ).toBe( expectedAdmin );
		expect( user.subject ).toBe( '共通受付件名' );
		expect( admin.subject ).toBe( '共通管理者件名' );
	} );

	test( 'C: 承認(ユーザー宛)専用ON → 承認メールが専用文面＋B変数展開', async ( { page } ) => {
		await loginAsAdmin( page );
		const createRes = await adminRest( page, 'POST', 'forms', { name: '承認専用フォーム' } );
		const formB = Number( createRes.data.id );
		insertFieldForForm( formB, 'trial_course', '体験コース' );
		await adminRest( page, 'PUT', `forms/${ formB }`, {
			mail_overrides: {
				reception_user: { enabled: false, subject: '', body: '' },
				reception_admin: { enabled: false, subject: '', body: '' },
				approval_user: {
					enabled: true,
					subject: '専用承認件名B',
					body: '専用承認B\n{customer_name} 様\nコース: {trial_course}',
				},
			},
		} );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 4 ),
			start: '14:00:00',
			end: '15:00:00',
			capacity: 5,
		} );
		await gotoFrontForm( page );
		const created = await submitReservation(
			page,
			scheduleId,
			formB,
			{ name: '承認 太郎', email: 'approve-b@example.com', phone: '090-0000-0004' },
			{ trial_course: '平日コース' }
		);
		const rid = Number( created?.id || created?.reservation_id );
		expect( rid ).toBeGreaterThan( 0 );

		clearMailLog();
		await loginAsAdmin( page );
		const patch = await adminRest( page, 'PUT', `reservations/${ rid }`, { status: 'approved' } );
		expect( patch.status, JSON.stringify( patch.data ) ).toBe( 200 );

		const log = fetchMailLog();
		const approval = findMailTo( log, 'approve-b@example.com' );
		expect( approval, 'approval mail' ).toBeTruthy();
		expect( approval.subject ).toBe( '専用承認件名B' );
		expect( approval.message ).toContain( '専用承認B' );
		expect( approval.message ).toContain( 'コース: 平日コース' );
		expect( approval.message ).not.toContain( '共通承認' );
	} );

	test( 'D: 専用ONフォームを削除後、既存予約の承認 → 共通文面へフォールバック', async ( { page } ) => {
		await loginAsAdmin( page );
		const createRes = await adminRest( page, 'POST', 'forms', { name: '削除予定フォーム' } );
		const formB = Number( createRes.data.id );
		insertFieldForForm( formB, 'trial_course', '体験コース' );
		await adminRest( page, 'PUT', `forms/${ formB }`, {
			mail_overrides: {
				reception_user: { enabled: false, subject: '', body: '' },
				reception_admin: { enabled: false, subject: '', body: '' },
				approval_user: {
					enabled: true,
					subject: '専用承認件名B',
					body: '専用承認B\n{customer_name}\nコース: {trial_course}',
				},
			},
		} );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 5 ),
			start: '16:00:00',
			end: '17:00:00',
			capacity: 5,
		} );
		await gotoFrontForm( page );
		const created = await submitReservation(
			page,
			scheduleId,
			formB,
			{ name: '残 予約', email: 'orphan@example.com', phone: '090-0000-0005' },
			{ trial_course: '夜間コース' }
		);
		const rid = Number( created?.id || created?.reservation_id );
		expect( rid ).toBeGreaterThan( 0 );

		// フォームB を削除（mail_overrides 行ごと消滅）。予約は残る。
		await loginAsAdmin( page );
		const del = await adminRest( page, 'DELETE', `forms/${ formB }` );
		expect( del.status, JSON.stringify( del.data ) ).toBe( 200 );

		// 既存予約を承認 → override 行が無いので共通承認文面になる。
		clearMailLog();
		const patch = await adminRest( page, 'PUT', `reservations/${ rid }`, { status: 'approved' } );
		expect( patch.status, JSON.stringify( patch.data ) ).toBe( 200 );

		const log = fetchMailLog();
		const approval = findMailTo( log, 'orphan@example.com' );
		expect( approval, 'approval mail' ).toBeTruthy();
		expect( approval.subject ).toBe( '共通承認件名' );
		expect( approval.message ).toContain( '共通承認' );
		expect( approval.message ).not.toContain( '専用承認B' );
	} );
} );
