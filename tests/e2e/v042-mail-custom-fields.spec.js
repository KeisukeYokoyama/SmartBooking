/**
 * v0.4.2 Eval: カスタムフィールドのメール変数展開（外部ユーザー報告1・案A）。
 *
 * `tests/mu-plugins/smb-mail-catcher.php` が wp_mail() を傍受してオプションに蓄積する前提で、
 * 予約受付メールの本文にカスタムフィールドの回答（{field_key}）が展開されることを
 * ユーザー宛・管理者宛の両方で検証する。
 *
 * 実行: `npx playwright test tests/e2e/v042-mail-custom-fields.spec.js --project=desktop`
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
const { wpCli } = require( './helpers' );

test.describe.configure( { mode: 'serial' } );

/**
 * option を wp-cli で設定する（改行を含む本文もそのまま渡す）。
 * @param {string} key
 * @param {string} value
 */
function setOptionRaw( key, value ) {
	const safe = String( value ).replace( /"/g, '\\"' );
	wpCli( `option update ${ key } "${ safe }"` );
}

/**
 * 店舗メールを直接 SQL で設定する。
 * @param {number} storeId
 * @param {string} email
 */
function setStoreEmail( storeId, email ) {
	const safe = String( email ).replace( /'/g, "''" );
	wpCli(
		`db query "UPDATE wp_smart_booking_stores SET email = '${ safe }' WHERE id = ${ storeId };"`
	);
}

/** メールキャプチャログを削除する。 */
function clearMailLog() {
	wpCli( `option delete smb_test_mail_log` );
}

/**
 * メールキャプチャログを取得する。
 * @return {Array<{to:string|string[], subject:string, message:string, headers:any}>}
 */
function fetchMailLog() {
	const out = wpCli(
		`eval 'echo wp_json_encode( get_option("smb_test_mail_log", array()) );'`
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

const findMailTo = ( log, addr ) =>
	log.find( ( m ) => [].concat( m.to ).includes( addr ) );

/**
 * デフォルトフォームにカスタムフィールドを 1 件挿入する（サーバ側で完結）。
 *
 * field_options はメール変数の展開（template_vars は field_type のみ参照）にも、
 * 公開予約の保存（checkbox は選択肢を検証しない）にも影響しないため空配列 '[]' で足りる。
 * 管理 REST + ブラウザログインを介さず、DB へ直接入れて安定させる。
 *
 * @param {string} key   field_key（予約語以外）
 * @param {string} label field_label
 * @param {string} type  field_type（text / checkbox / address 等）
 */
function insertCustomField( key, label, type ) {
	wpCli(
		`db query "INSERT INTO wp_smart_booking_custom_fields (form_id, field_key, field_label, field_type, field_options, placeholder, is_required, sort_order, condition_field_key, condition_value, created_at) SELECT id, '${ key }', '${ label }', '${ type }', '[]', '', 0, 20, NULL, NULL, NOW() FROM wp_smart_booking_forms WHERE is_default = 1 LIMIT 1;"`
	);
}

/**
 * 標準3フィールド（company=text / topics=checkbox / addr=address）をデフォルトフォームに作成する。
 */
function createStandardFields() {
	insertCustomField( 'company', '会社名', 'text' );
	insertCustomField( 'topics', 'ご相談内容', 'checkbox' );
	insertCustomField( 'addr', 'ご住所', 'address' );
}

/**
 * 公開予約を作成する（custom_fields を付与）。
 * @param {import('@playwright/test').Page} page
 * @param {number} scheduleId
 * @param {{name:string,email:string,phone:string}} customer
 * @param {object} customFields
 */
async function submitPublicReservation( page, scheduleId, customer, customFields ) {
	const res = await publicRest( page, 'public/reservations', {
		method: 'POST',
		body: {
			schedule_id: scheduleId,
			customer_name: customer.name,
			customer_email: customer.email,
			customer_phone: customer.phone,
			custom_fields: customFields || {},
		},
	} );
	if ( res.status !== 200 && res.status !== 201 ) {
		throw new Error(
			`public/reservations failed: status=${ res.status } body=${ JSON.stringify(
				res.data
			) }`
		);
	}
	return res.data;
}

test.describe( 'v0.4.2: カスタムフィールドのメール変数展開', () => {
	test.setTimeout( 60_000 );

	// 本文に固定変数＋カスタム変数（{company} {topics} {addr} {addr_zip}）を含める。
	const BODY =
		'{customer_name} 様\n会社: {company}\n相談: {topics}\n住所: {addr}\n郵便: {addr_zip}\n予約番号: {reservation_id}';

	test.beforeEach( async () => {
		restoreBaseline();
		clearMailLog();
		// mu-plugin smb-mail-catcher はオプトイン式。E2E では明示的に有効化する。
		setOptionRaw( 'smb_mail_capture_enabled', '1' );
		setStoreEmail( USER_STORE_ID, 'store-a@example.com' );
		setOptionRaw( 'smart_booking_mail_from_name', 'SB Test' );
		setOptionRaw( 'smart_booking_mail_from_email', 'noreply@example.com' );
		setOptionRaw( 'smart_booking_mail_receipt_user_subject', 'ご予約受付' );
		setOptionRaw( 'smart_booking_mail_receipt_user_body', BODY );
		setOptionRaw( 'smart_booking_mail_receipt_admin_subject', '新規予約' );
		setOptionRaw( 'smart_booking_mail_receipt_admin_body', BODY );
	} );

	test.afterAll( async () => {
		clearMailLog();
		try {
			wpCli( `option delete smb_mail_capture_enabled` );
		} catch ( _e ) {
			/* 既に未設定なら無視 */
		}
		restoreBaseline();
	} );

	test( 'A: text/checkbox/address のカスタム変数がユーザー宛・管理者宛の両本文に展開される', async ( {
		page,
	} ) => {
		createStandardFields();

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '14:00:00',
			end: '15:00:00',
			capacity: 3,
		} );
		expect( scheduleId ).toBeGreaterThan( 0 );

		await gotoFrontForm( page );
		const created = await submitPublicReservation(
			page,
			scheduleId,
			{ name: '山田 太郎', email: 'yamada@example.com', phone: '090-1111-2222' },
			{
				company: 'テスト商事',
				topics: [ '相続', '遺言' ],
				addr: { zip: '1500002', address: '東京都渋谷区渋谷' },
			}
		);
		const rid = Number( created?.id || created?.reservation_id );
		expect( rid ).toBeGreaterThan( 0 );

		const log = fetchMailLog();
		expect( log.length ).toBe( 2 );
		const userMail = findMailTo( log, 'yamada@example.com' );
		const adminMail = findMailTo( log, 'store-a@example.com' );
		expect( userMail, 'user mail exists' ).toBeTruthy();
		expect( adminMail, 'admin mail exists' ).toBeTruthy();

		for ( const mail of [ userMail, adminMail ] ) {
			expect( mail.message ).toContain( '会社: テスト商事' );
			// checkbox の複数選択は「、」で結合される。
			expect( mail.message ).toContain( '相談: 相続、遺言' );
			// address の {addr} は「〒郵便番号 住所」で結合される。
			expect( mail.message ).toContain( '住所: 〒1500002 東京都渋谷区渋谷' );
			// {addr_zip} は正規化7桁。
			expect( mail.message ).toContain( '郵便: 1500002' );
			expect( mail.message ).toContain( `予約番号: ${ rid }` );
			// 生の未展開キーが残っていないこと（報告1の症状の再発防止）。
			expect( mail.message ).not.toContain( '{company}' );
			expect( mail.message ).not.toContain( '{topics}' );
			expect( mail.message ).not.toContain( '{addr}' );
			expect( mail.message ).not.toContain( '{addr_zip}' );
		}
	} );

	test( 'B: 未入力のカスタム変数は空文字に展開され、生キーが残らない', async ( {
		page,
	} ) => {
		createStandardFields();

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '16:00:00',
			end: '17:00:00',
			capacity: 3,
		} );
		expect( scheduleId ).toBeGreaterThan( 0 );

		await gotoFrontForm( page );
		// company だけ入力、topics / addr は未入力（＝③条件非表示と同じく meta 無し）。
		const created = await submitPublicReservation(
			page,
			scheduleId,
			{ name: '佐藤 花子', email: 'sato@example.com', phone: '090-3333-4444' },
			{ company: '株式会社サンプル' }
		);
		expect( Number( created?.id || created?.reservation_id ) ).toBeGreaterThan( 0 );

		const log = fetchMailLog();
		const userMail = findMailTo( log, 'sato@example.com' );
		expect( userMail, 'user mail exists' ).toBeTruthy();
		expect( userMail.message ).toContain( '会社: 株式会社サンプル' );
		// 未入力のカスタム変数は空文字に展開され、生キーは残らない。
		expect( userMail.message ).not.toContain( '{topics}' );
		expect( userMail.message ).not.toContain( '{addr}' );
		expect( userMail.message ).not.toContain( '{addr_zip}' );
		expect( userMail.message ).not.toContain( '{company}' );
	} );
} );
