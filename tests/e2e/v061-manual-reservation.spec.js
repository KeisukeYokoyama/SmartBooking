/**
 * v0.6.1: 管理画面「予約を手動で作成」の修正。
 *
 * 修正A: 手動作成でも表示条件（親 radio の選択値）を評価する。
 *   - 親が未選択／条件不成立なら、必須の子（住所）は非表示で、作成できる。
 *   - 条件成立なら子が表示され、空欄は必須エラー。
 *   - 子に入力してから親を戻すと、子の値は保存されない（meta 行なし）。
 *   - REST に直接、条件不成立の親＋子の値を送ると、子の値は破棄されて作成が成功する。
 *
 * 修正B: 作成時ステータスにメールを連動させる。
 *   - 承認待ち: 修正前と同一（ユーザー宛受付＋管理者宛受付）。
 *   - 承認済み: ユーザー宛は承認メール1通のみ／管理者宛は承認待ち時と同じ受付メール。
 *   - フォーム専用の承認文面が ON なら専用文面。
 *   - キャンセル: 0通。
 *   - 承認済みで作成した予約を編集・保存しても再送しない。
 *   - 承認待ちで作成した予約を一覧で承認すると承認メール1通。
 *
 * メールは tests/mu-plugins/smb-mail-catcher.php（pre_wp_mail 傍受）で検証する。
 * 配布物外（検証専用）。
 *
 * 実行: `npx playwright test tests/e2e/v061-manual-reservation.spec.js --project=desktop`
 */
const path = require( 'node:path' );
const { execSync } = require( 'node:child_process' );
const { test, expect } = require( '@playwright/test' );
const {
	restoreBaseline,
	insertSchedule,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );
const { bootstrapAdmin, restCall } = require( './phase2-helpers' );
const { resetForms, getDefaultFormId } = require( './v040-helpers' );

test.describe.configure( { mode: 'serial' } );

const CF = 'wp_smart_booking_custom_fields';
const ADMIN_EMAIL = 'wordpress@example.com';
const STORE_EMAIL = 'store-v061@example.com';
const CUSTOMER_EMAIL = 'v061-customer@example.com';

const USER_RECEIPT_BODY =
	'共通ユーザー受付\n{customer_name} 様\n予約番号: {reservation_id}';
const ADMIN_RECEIPT_BODY =
	'共通管理者受付\n{customer_name}\n予約番号: {reservation_id}';
const APPROVAL_BODY =
	'共通承認\n{customer_name} 様\n予約番号: {reservation_id}';

function wpCli( cmd ) {
	return execSync( `npx wp-env run cli ${ cmd }`, {
		cwd: path.resolve( __dirname, '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
		timeout: 60_000,
	} );
}
function setOptionRaw( key, value ) {
	const safe = String( value ).replace( /"/g, '\\"' );
	wpCli( `wp option update ${ key } "${ safe }"` );
}
function dbq( sql ) {
	return wpCli( `wp db query "${ sql }" --skip-column-names` );
}
function clearMailLog() {
	try {
		wpCli( 'wp option delete smb_test_mail_log' );
	} catch ( _e ) {
		/* 未設定なら無視 */
	}
}
function fetchMailLog() {
	const out = wpCli(
		`wp eval 'echo wp_json_encode( get_option("smb_test_mail_log", array()) );'`
	);
	const m = out.match( /(\[[\s\S]*\])/ );
	if ( ! m ) {
		return [];
	}
	try {
		const v = JSON.parse( m[ 1 ] );
		return Array.isArray( v ) ? v : [];
	} catch {
		return [];
	}
}
const mailsTo = ( log, addr ) =>
	log.filter( ( m ) => [].concat( m.to ).includes( addr ) );

/**
 * 予約の meta を { meta_key: meta_value } で返す。
 * @param reservationId
 */
function getMeta( reservationId ) {
	const out = dbq(
		`SELECT meta_key, meta_value FROM wp_smart_booking_reservation_meta WHERE reservation_id = ${ Number(
			reservationId
		) } ORDER BY id`
	);
	const meta = {};
	out.split( '\n' )
		.map( ( l ) => l.trim() )
		.filter( Boolean )
		.forEach( ( l ) => {
			const [ k, ...rest ] = l.split( '\t' );
			meta[ k ] = rest.join( '\t' );
		} );
	return meta;
}
function countReservations() {
	return Number(
		dbq( 'SELECT COUNT(*) FROM wp_smart_booking_reservations' )
			.trim()
			.split( '\n' )
			.pop()
	);
}

/** 既定フォームに「資料送付（radio）」と、その子「送付先住所（address・必須）」を作る。 */
function seedConditionalAddress() {
	dbq(
		`INSERT INTO ${ CF } (form_id,field_key,field_label,field_type,field_options,placeholder,is_required,sort_order,condition_field_key,condition_value,created_at) VALUES ` +
			`(${ getDefaultFormId() },'shiryo','資料送付','radio','[\\"希望する\\",\\"希望しない\\"]','',0,50,NULL,NULL,NOW()),` +
			`(${ getDefaultFormId() },'addr','送付先住所','address','[]','',1,60,'shiryo','希望する',NOW());`
	);
}

function setupMail() {
	setOptionRaw( 'smb_mail_capture_enabled', '1' );
	dbq(
		`UPDATE wp_smart_booking_stores SET email = '${ STORE_EMAIL }' WHERE id = ${ USER_STORE_ID }`
	);
	dbq( 'UPDATE wp_smart_booking_forms SET mail_overrides = NULL' );
	setOptionRaw( 'smart_booking_mail_from_name', 'SB Test' );
	setOptionRaw( 'smart_booking_mail_from_email', 'noreply@example.com' );
	setOptionRaw( 'smart_booking_mail_receipt_user_subject', '共通受付件名' );
	setOptionRaw( 'smart_booking_mail_receipt_user_body', USER_RECEIPT_BODY );
	setOptionRaw(
		'smart_booking_mail_receipt_admin_subject',
		'共通管理者件名'
	);
	setOptionRaw( 'smart_booking_mail_receipt_admin_body', ADMIN_RECEIPT_BODY );
	setOptionRaw( 'smart_booking_mail_approval_user_subject', '共通承認件名' );
	setOptionRaw( 'smart_booking_mail_approval_user_body', APPROVAL_BODY );
	setOptionRaw( 'smart_booking_mail_admin_notify_enabled', '1' );
	clearMailLog();
}

function newSchedule( hour = 10 ) {
	const hh = String( hour ).padStart( 2, '0' );
	const hh2 = String( hour + 1 ).padStart( 2, '0' );
	return insertSchedule( {
		storeId: USER_STORE_ID,
		staffId: USER_STAFF_ID,
		date: ymd( 3 ),
		start: `${ hh }:00:00`,
		end: `${ hh2 }:00:00`,
		capacity: 5,
	} );
}

async function createManual( page, scheduleId, status, meta = {} ) {
	const res = await restCall( page, 'POST', 'reservations', {
		schedule_id: scheduleId,
		customer_name: '手動 太郎',
		customer_email: CUSTOMER_EMAIL,
		customer_phone: '09011112222',
		status,
		meta,
	} );
	expect( res.status, JSON.stringify( res.data ) ).toBe( 200 );
	return Number( res.data.id );
}

/**
 * 手動作成モーダルを開き、枠を選んでステップ2（予約者情報）まで進める。
 * @param page
 */
async function openModalToStep2( page ) {
	await page.reload();
	await page.waitForSelector( '.smb-page--reservations', {
		timeout: 15_000,
	} );
	await page.getByRole( 'button', { name: /予約を手動で作成/ } ).click();
	const dialog = page.getByRole( 'dialog' );
	await dialog.locator( '#smb-manual-date' ).fill( ymd( 3 ) );
	await dialog.locator( '.smb-slot-btn' ).first().click();
	await dialog.getByRole( 'button', { name: '次へ: 予約者情報' } ).click();
	await dialog.getByPlaceholder( '山田 太郎' ).fill( 'モーダル 花子' );
	await dialog
		.getByPlaceholder( 'example@example.com' )
		.fill( 'modal@example.com' );
	await dialog.getByPlaceholder( '03-1234-5678' ).fill( '0311112222' );
	return dialog;
}

test.describe( 'v0.6.1 修正A: 手動作成の表示条件', () => {
	test.setTimeout( 120_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		resetForms();
		seedConditionalAddress();
	} );

	test.afterAll( async () => {
		resetForms();
		restoreBaseline();
	} );

	test( 'A1: 親が未選択なら必須の住所は非表示で、作成できる', async ( {
		page,
	} ) => {
		newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		const before = countReservations();
		const dialog = await openModalToStep2( page );

		await expect(
			dialog.getByRole( 'radio', { name: '希望する' } )
		).toBeVisible();
		await expect(
			dialog.getByLabel( '送付先住所（郵便番号）' )
		).toHaveCount( 0 );

		await dialog.getByRole( 'button', { name: '予約を作成する' } ).click();
		await expect( page.getByRole( 'dialog' ) ).toHaveCount( 0, {
			timeout: 10_000,
		} );
		expect( countReservations() ).toBe( before + 1 );
	} );

	test( 'A1b: 親が条件不成立（希望しない）でも住所は非表示で、作成できる', async ( {
		page,
	} ) => {
		newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		const before = countReservations();
		const dialog = await openModalToStep2( page );

		await dialog.getByRole( 'radio', { name: '希望しない' } ).check();
		await expect(
			dialog.getByLabel( '送付先住所（郵便番号）' )
		).toHaveCount( 0 );

		await dialog.getByRole( 'button', { name: '予約を作成する' } ).click();
		await expect( page.getByRole( 'dialog' ) ).toHaveCount( 0, {
			timeout: 10_000,
		} );
		expect( countReservations() ).toBe( before + 1 );
	} );

	test( 'A2: 親の条件が成立すると住所が表示され、空欄なら必須エラー', async ( {
		page,
	} ) => {
		newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		const before = countReservations();
		const dialog = await openModalToStep2( page );

		await dialog.getByRole( 'radio', { name: '希望する' } ).check();
		await expect(
			dialog.getByLabel( '送付先住所（郵便番号）' )
		).toBeVisible();

		await dialog.getByRole( 'button', { name: '予約を作成する' } ).click();
		await expect(
			dialog.locator( '.smb-field__error', {
				hasText: '入力してください。',
			} )
		).toBeVisible();
		await expect( page.getByRole( 'dialog' ) ).toBeVisible();
		expect( countReservations() ).toBe( before );
	} );

	test( 'A3: 子に入力してから親を戻すと、子の値は保存されない', async ( {
		page,
	} ) => {
		newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		const dialog = await openModalToStep2( page );

		await dialog.getByRole( 'radio', { name: '希望する' } ).check();
		await dialog.getByLabel( '送付先住所（郵便番号）' ).fill( '1500002' );
		await dialog
			.getByLabel( '送付先住所（住所）' )
			.fill( '東京都渋谷区渋谷1-2-3' );
		await dialog.getByRole( 'radio', { name: '希望しない' } ).check();
		await expect(
			dialog.getByLabel( '送付先住所（郵便番号）' )
		).toHaveCount( 0 );

		// 親を戻しても、非表示にした子の値は state から除外されている（空で再表示）。
		await dialog.getByRole( 'radio', { name: '希望する' } ).check();
		await expect(
			dialog.getByLabel( '送付先住所（郵便番号）' )
		).toHaveValue( '' );
		await dialog.getByRole( 'radio', { name: '希望しない' } ).check();

		await dialog.getByRole( 'button', { name: '予約を作成する' } ).click();
		await expect( page.getByRole( 'dialog' ) ).toHaveCount( 0, {
			timeout: 10_000,
		} );

		const id = Number(
			dbq( 'SELECT MAX(id) FROM wp_smart_booking_reservations' )
				.trim()
				.split( '\n' )
				.pop()
		);
		const meta = getMeta( id );
		expect( meta.shiryo ).toBe( '希望しない' );
		expect( meta ).not.toHaveProperty( 'addr_zip' );
		expect( meta ).not.toHaveProperty( 'addr_address' );
		expect( meta ).not.toHaveProperty( 'addr' );
	} );

	test( 'A4: REST に条件不成立の親＋子の値を送ると、子は破棄されて作成成功', async ( {
		page,
	} ) => {
		const sid = newSchedule();
		await bootstrapAdmin( page, 'reservations' );

		// 条件不成立（希望しない）。
		const id1 = await createManual( page, sid, 'pending', {
			shiryo: '希望しない',
			addr_zip: '1500002',
			addr_address: '東京都渋谷区',
			memo_free: '自由キー',
		} );
		const m1 = getMeta( id1 );
		expect( m1.shiryo ).toBe( '希望しない' );
		expect( m1 ).not.toHaveProperty( 'addr_zip' );
		expect( m1 ).not.toHaveProperty( 'addr_address' );
		// 定義に無いキーは従来どおり保存される（挙動不変）。
		expect( m1.memo_free ).toBe( '自由キー' );

		// 親未送信も不成立。
		const id2 = await createManual( page, sid, 'pending', {
			addr_zip: '1500002',
			addr_address: '東京都渋谷区',
		} );
		const m2 = getMeta( id2 );
		expect( m2 ).not.toHaveProperty( 'addr_zip' );
		expect( m2 ).not.toHaveProperty( 'addr_address' );

		// 条件成立なら従来どおり保存される。
		const id3 = await createManual( page, sid, 'pending', {
			shiryo: '希望する',
			addr_zip: '1500002',
			addr_address: '東京都渋谷区',
		} );
		const m3 = getMeta( id3 );
		expect( m3.addr_zip ).toBe( '1500002' );
		expect( m3.addr_address ).toBe( '東京都渋谷区' );
	} );
} );

test.describe( 'v0.6.1 修正B: 作成時ステータスとメール', () => {
	test.setTimeout( 120_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		resetForms();
		setupMail();
	} );

	test.afterAll( async () => {
		clearMailLog();
		try {
			wpCli( 'wp option delete smb_mail_capture_enabled' );
		} catch ( _e ) {
			/* noop */
		}
		dbq( 'UPDATE wp_smart_booking_forms SET mail_overrides = NULL' );
		resetForms();
		restoreBaseline();
	} );

	test( 'B1: 承認待ちで作成 → ユーザー宛受付＋管理者宛受付（修正前と同一）', async ( {
		page,
	} ) => {
		const sid = newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		clearMailLog();
		const id = await createManual( page, sid, 'pending' );

		const log = fetchMailLog();
		expect( log ).toHaveLength( 2 );
		const user = mailsTo( log, CUSTOMER_EMAIL );
		expect( user ).toHaveLength( 1 );
		expect( user[ 0 ].subject ).toBe( '共通受付件名' );
		expect( user[ 0 ].message ).toBe(
			`共通ユーザー受付\n手動 太郎 様\n予約番号: ${ id }`
		);
		const admin = mailsTo( log, ADMIN_EMAIL );
		expect( admin ).toHaveLength( 1 );
		expect( [].concat( admin[ 0 ].to ) ).toEqual( [
			ADMIN_EMAIL,
			STORE_EMAIL,
		] );
		expect( admin[ 0 ].subject ).toBe( '共通管理者件名' );
		expect( admin[ 0 ].message ).toBe(
			`共通管理者受付\n手動 太郎\n予約番号: ${ id }`
		);
		// 順序もユーザー宛 → 管理者宛（修正前と同じ）。
		expect( [].concat( log[ 0 ].to ) ).toEqual( [ CUSTOMER_EMAIL ] );
	} );

	test( 'B2: 承認済みで作成 → ユーザー宛は承認メール1通のみ／管理者宛は受付メール', async ( {
		page,
	} ) => {
		const sid = newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		clearMailLog();
		const id = await createManual( page, sid, 'approved' );

		const log = fetchMailLog();
		expect( log ).toHaveLength( 2 );
		const user = mailsTo( log, CUSTOMER_EMAIL );
		expect( user ).toHaveLength( 1 );
		expect( user[ 0 ].subject ).toBe( '共通承認件名' );
		expect( user[ 0 ].message ).toBe(
			`共通承認\n手動 太郎 様\n予約番号: ${ id }`
		);
		const admin = mailsTo( log, ADMIN_EMAIL );
		expect( admin ).toHaveLength( 1 );
		expect( [].concat( admin[ 0 ].to ) ).toEqual( [
			ADMIN_EMAIL,
			STORE_EMAIL,
		] );
		expect( admin[ 0 ].subject ).toBe( '共通管理者件名' );
		expect( admin[ 0 ].message ).toBe(
			`共通管理者受付\n手動 太郎\n予約番号: ${ id }`
		);
	} );

	test( 'B3: フォーム専用の承認文面が ON なら、承認済み作成で専用文面が使われる', async ( {
		page,
	} ) => {
		const sid = newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		const formId = getDefaultFormId();
		const put = await restCall( page, 'PUT', `forms/${ formId }`, {
			mail_overrides: {
				reception_user: { enabled: false, subject: '', body: '' },
				reception_admin: { enabled: false, subject: '', body: '' },
				approval_user: {
					enabled: true,
					subject: '専用承認件名',
					body: '専用承認\n{customer_name} 様\n予約番号: {reservation_id}',
				},
			},
		} );
		expect( put.status, JSON.stringify( put.data ) ).toBe( 200 );
		clearMailLog();
		const id = await createManual( page, sid, 'approved' );

		const user = mailsTo( fetchMailLog(), CUSTOMER_EMAIL );
		expect( user ).toHaveLength( 1 );
		expect( user[ 0 ].subject ).toBe( '専用承認件名' );
		expect( user[ 0 ].message ).toBe(
			`専用承認\n手動 太郎 様\n予約番号: ${ id }`
		);
	} );

	test( 'B4: キャンセルで作成 → メール0通', async ( { page } ) => {
		const sid = newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		clearMailLog();
		await createManual( page, sid, 'cancelled' );
		expect( fetchMailLog() ).toHaveLength( 0 );
	} );

	test( 'B5: 承認済みで作成した予約を編集・保存しても再送しない', async ( {
		page,
	} ) => {
		const sid = newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		const id = await createManual( page, sid, 'approved' );
		clearMailLog();

		const r1 = await restCall( page, 'PUT', `reservations/${ id }`, {
			admin_memo: 'メモ更新',
		} );
		expect( r1.status ).toBe( 200 );
		const r2 = await restCall( page, 'PUT', `reservations/${ id }`, {
			status: 'approved',
			admin_memo: 'メモ再更新',
		} );
		expect( r2.status ).toBe( 200 );
		expect( fetchMailLog() ).toHaveLength( 0 );
	} );

	test( 'B6: 承認待ちで作成した予約を一覧で承認すると承認メールが1通', async ( {
		page,
	} ) => {
		const sid = newSchedule();
		await bootstrapAdmin( page, 'reservations' );
		const id = await createManual( page, sid, 'pending' );
		clearMailLog();

		const r = await restCall( page, 'PUT', `reservations/${ id }`, {
			status: 'approved',
		} );
		expect( r.status ).toBe( 200 );
		const log = fetchMailLog();
		expect( log ).toHaveLength( 1 );
		expect( [].concat( log[ 0 ].to ) ).toEqual( [ CUSTOMER_EMAIL ] );
		expect( log[ 0 ].subject ).toBe( '共通承認件名' );
		expect( log[ 0 ].message ).toBe(
			`共通承認\n手動 太郎 様\n予約番号: ${ id }`
		);
	} );
} );
