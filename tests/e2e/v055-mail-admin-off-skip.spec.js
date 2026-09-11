/**
 * v0.5.5 C (H2 案C): 管理者系通知の無言スキップを可視化する。
 *
 * 起票: docs/bugs/mail-admin-off-store-empty-silent-skip.md
 * 計画: docs/plans/v0.5.5-release-plan.md §2-C
 *
 * 壊れ方（修正前）:
 *   「管理者へのメール」トグルが OFF のとき、店舗メールが未設定だと
 *   `includes/class-email.php` の OFF 分岐が裸の `return;` で抜けるため、
 *   担当者メールが設定されていても担当者宛の CC すら送られない。
 *   `send()` に到達しないので transient にも記録されず、管理画面の警告バナーも出ない
 *   ＝ 管理者は「通知が来ない」ことに気づく手がかりを一切持たない。
 *
 * 本 spec の検証点:
 *   (1) OFF ＋ 店舗メール空 ＋ 担当者メール**あり** → skipped_no_admin_recipient が記録される
 *   (2) OFF ＋ 店舗メール空 ＋ 担当者メール**も空** → 記録されない（意図的に止めている運用なのでノイズを出さない）
 *   (3) OFF ＋ 店舗メール**あり**              → 管理者宛が送信され、記録もされない（回帰）
 *   (4) 管理画面のメール通知タブに、追加した日本語ラベルのバナーが出る
 *
 * いずれのケースでも **お客様宛メールは常に送信される**ことを併せて確認する
 * （管理者側の抑止がお客様体験に波及していないことの証明）。
 *
 * 配布物外（検証専用）。
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

test.describe.configure( { mode: 'serial' } );

const MAIL_ERROR_TRANSIENT = 'smart_booking_last_mail_error';

function setOptionRaw( key, value ) {
	const safe = String( value ).replace( /"/g, '\\"' );
	wpCli( `option update ${ key } "${ safe }"` );
}

function setStoreEmail( storeId, email ) {
	const safe = String( email ).replace( /'/g, "''" );
	wpCli(
		`db query "UPDATE wp_smart_booking_stores SET email = '${ safe }' WHERE id = ${ storeId };"`
	);
}

function setStaffEmail( staffId, email ) {
	const safe = String( email ).replace( /'/g, "''" );
	wpCli(
		`db query "UPDATE wp_smart_booking_staff SET email = '${ safe }' WHERE id = ${ staffId };"`
	);
}

function clearMailError() {
	wpCli( `transient delete ${ MAIL_ERROR_TRANSIENT }` );
}

function clearMailLog() {
	wpCli( `option delete smb_test_mail_log` );
}

/**
 * 直近のメール失敗/スキップ記録（transient）を返す。記録が無ければ null。
 *
 * @return {Object|null}
 */
function fetchMailError() {
	const out = wpCli(
		`eval 'echo wp_json_encode( get_transient("${ MAIL_ERROR_TRANSIENT }") );'`
	);
	const m = out.match( /(\{[\s\S]*?\})/ );
	if ( ! m ) {
		// transient 無し → wp_json_encode( false ) === "false"
		return null;
	}
	try {
		const v = JSON.parse( m[ 1 ] );
		return v && typeof v === 'object' ? v : null;
	} catch {
		return null;
	}
}

/**
 * メールキャプチャログを返す。
 *
 * @return {Array<{to:*, subject:string}>}
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

const mailTo = ( log, addr ) =>
	log.find( ( m ) => [].concat( m.to ).includes( addr ) );

const CUSTOMER_EMAIL = 'okyakusama@example.com';

/**
 * 店舗/担当者のメール設定を与えて公開予約を1件作り、記録とメールログを返す。
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object}                          opts
 * @param {string}                          opts.storeEmail
 * @param {string}                          opts.staffEmail
 */
async function bookOnce( page, { storeEmail, staffEmail } ) {
	setStoreEmail( USER_STORE_ID, storeEmail );
	setStaffEmail( USER_STAFF_ID, staffEmail );
	clearMailError();
	clearMailLog();

	const scheduleId = insertSchedule( {
		storeId: USER_STORE_ID,
		staffId: USER_STAFF_ID,
		date: ymd( 2 ),
		start: '10:00:00',
		end: '11:00:00',
		capacity: 5,
	} );

	await gotoFrontForm( page );
	const res = await publicRest( page, 'public/reservations', {
		method: 'POST',
		body: {
			schedule_id: scheduleId,
			customer_name: '通知 太郎',
			customer_email: CUSTOMER_EMAIL,
			customer_phone: '09011112222',
			honeypot: '',
		},
	} );
	expect( res.status ).toBe( 200 );

	return { error: fetchMailError(), log: fetchMailLog() };
}

test.describe( 'v0.5.5 C: 管理者トグル OFF 時の無言スキップの可視化', () => {
	test.setTimeout( 120_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		// wp_mail を傍受してオプションへ蓄積する（実送信しない）。
		setOptionRaw( 'smb_mail_capture_enabled', '1' );
		// 「管理者へのメール」トグルを OFF にする＝本 spec の前提。
		setOptionRaw( 'smart_booking_mail_admin_notify_enabled', '0' );
	} );

	test.afterAll( async () => {
		wpCli( `option delete smb_mail_capture_enabled` );
		wpCli( `option delete smart_booking_mail_admin_notify_enabled` );
		clearMailError();
		clearMailLog();
		restoreBaseline();
	} );

	test( '(1) 店舗メール空＋担当者メールあり → skipped_no_admin_recipient が記録される', async ( {
		page,
	} ) => {
		const { error, log } = await bookOnce( page, {
			storeEmail: '',
			staffEmail: 'tantou@example.com',
		} );

		expect( error ).not.toBeNull();
		expect( error.category ).toBe( 'skipped_no_admin_recipient' );
		expect( error.to_type ).toBe( 'admin' );

		// お客様宛は常に送信される（管理者側の抑止が波及していない）。
		expect( mailTo( log, CUSTOMER_EMAIL ) ).toBeTruthy();
		// 担当者宛は実際に送られていない（記録されるのは「送られなかった」事実）。
		expect( mailTo( log, 'tantou@example.com' ) ).toBeFalsy();
	} );

	test( '(2) 店舗メールも担当者メールも空 → 記録しない（意図的に止めている運用）', async ( {
		page,
	} ) => {
		const { error, log } = await bookOnce( page, {
			storeEmail: '',
			staffEmail: '',
		} );

		// 誰も宛先を設定していない＝全通知を意図的に止めている。
		// ここでバナーを出すと毎予約のノイズになるため記録しない。
		expect( error ).toBeNull();
		expect( mailTo( log, CUSTOMER_EMAIL ) ).toBeTruthy();
	} );

	test( '(3) 店舗メールあり → 管理者宛が届き、記録もされない（回帰）', async ( {
		page,
	} ) => {
		const { error, log } = await bookOnce( page, {
			storeEmail: 'tenpo@example.com',
			staffEmail: 'tantou@example.com',
		} );

		expect( error ).toBeNull();
		expect( mailTo( log, 'tenpo@example.com' ) ).toBeTruthy();
		expect( mailTo( log, CUSTOMER_EMAIL ) ).toBeTruthy();
	} );

	test( '(4) 管理画面のメール通知タブに日本語のバナーが出る', async ( {
		page,
	} ) => {
		await bookOnce( page, {
			storeEmail: '',
			staffEmail: 'tantou@example.com',
		} );

		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking-settings' );
		await page.waitForFunction( () => !! window.smartBookingAdmin?.nonce, {
			timeout: 15_000,
		} );
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'メール通知' } )
			.click();

		const banner = page.locator( '.smb-alert--warning' );
		await expect( banner ).toBeVisible( { timeout: 10_000 } );
		// 未知カテゴリのフォールバック文言ではなく、追加した専用ラベルが出ること。
		await expect( banner ).toContainText(
			'店舗のメールアドレスが未登録のため、担当者宛の通知も送信されませんでした'
		);
	} );
} );
