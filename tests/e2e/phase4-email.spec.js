/**
 * Phase 4 Eval-A: メール連携 E2E テスト。
 *
 * `tests/mu-plugins/smb-mail-catcher.php` が wp_mail() を傍受してオプションへ蓄積し、
 * GET/DELETE /wp-json/smb-test/v1/mail で参照・クリアできる前提でテストを書く。
 *
 * テスト対象:
 *   - 予約受付時に「ユーザー宛 + 管理者宛(担当者CC)」が送信される
 *   - 担当者メール空 → CC ヘッダなし
 *   - 店舗メール空  → 管理者宛はスキップ、ユーザー宛のみ
 *   - 承認時に「ユーザー宛 1 通」が送信される
 *   - From 関連オプションが空でも送信は成功する
 *   - テンプレ変数が render される（{customer_name}, {schedule_date}, {schedule_time},
 *     {reservation_id}, {store_name}, {staff_name}）
 *
 * 実行: `npx playwright test tests/e2e/phase4-email.spec.js --project=desktop`
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

/**
 * wp option update を介して任意のオプションを設定する。
 * 値はシングルクォートを「''」へ置換し、bash には "..." でラップする。
 *
 * @param {string} key
 * @param {string} value
 */
function setOptionRaw( key, value ) {
	const safe = String( value ).replace( /"/g, '\\"' );
	wpCli( `option update ${ key } "${ safe }"` );
}

/**
 * 指定 SQL 文字列でオプションを更新する（NULL や空文字を直接入れるため）。
 * @param {string} key
 * @param {string} sqlValue 例 "''"（シングルクォートで囲んだ文字列リテラル）
 */
function setOptionSql( key, sqlValue ) {
	wpCli(
		`db query "UPDATE wp_options SET option_value = ${ sqlValue } WHERE option_name = '${ key }';"`
	);
}

/**
 * 店舗 / 担当者の email を直接 SQL で更新する（NULL / 空文字を確実に入れるため）。
 * @param {number} storeId
 * @param {string} email
 */
function setStoreEmail( storeId, email ) {
	const safe = String( email ).replace( /'/g, "''" );
	wpCli(
		`db query "UPDATE wp_smb_stores SET email = '${ safe }' WHERE id = ${ storeId };"`
	);
}

/**
 * @param {number} staffId
 * @param {string} email
 */
function setStaffEmail( staffId, email ) {
	const safe = String( email ).replace( /'/g, "''" );
	wpCli(
		`db query "UPDATE wp_smb_staff SET email = '${ safe }' WHERE id = ${ staffId };"`
	);
}

/**
 * メールキャプチャをクリアする（admin Cookie が必要なので REST 経由ではなく wp eval を使用）。
 * 安全のため wp option delete でも代替できる。
 */
function clearMailLog() {
	wpCli( `option delete smb_test_mail_log` );
}

/**
 * メールログを取得する。配列で items を返す。
 *
 * @return {Array<{to:string, subject:string, message:string, headers:any}>}
 */
function fetchMailLog() {
	const out = wpCli(
		`eval 'echo wp_json_encode( get_option("smb_test_mail_log", array()) );'`
	);
	// wp-env stdout には装飾行が混じるので、JSON 配列の先頭を見つけて抽出する。
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

/**
 * headers を平坦な文字列配列にして返す。string でもよし、array でもよし。
 *
 * @param {string|string[]} headers
 * @return {string[]}
 */
function headerLines( headers ) {
	if ( ! headers ) {
		return [];
	}
	if ( Array.isArray( headers ) ) {
		return headers.flatMap( ( h ) =>
			String( h )
				.split( /\r?\n/ )
				.map( ( s ) => s.trim() )
				.filter( Boolean )
		);
	}
	return String( headers )
		.split( /\r?\n/ )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
}

/**
 * 公開予約を作成して reservation_id を返す。失敗時は throw。
 * @param {import('@playwright/test').Page}         page
 * @param {number}                                  scheduleId
 * @param {{name:string,email:string,phone:string}} customer
 */
async function submitPublicReservation( page, scheduleId, customer ) {
	const res = await publicRest( page, 'public/reservations', {
		method: 'POST',
		body: {
			schedule_id: scheduleId,
			customer_name: customer.name,
			customer_email: customer.email,
			customer_phone: customer.phone,
		},
	} );
	if ( res.status !== 200 && res.status !== 201 ) {
		throw new Error(
			`public/reservations failed: status=${
				res.status
			} body=${ JSON.stringify( res.data ) }`
		);
	}
	return res.data;
}

test.describe( 'Phase 4 Eval-A: Email 連携', () => {
	test.setTimeout( 60_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		clearMailLog();
		// mu-plugin smb-mail-catcher.php はオプトイン式のため、E2E テストでは明示的に有効化する。
		// 既定 OFF の理由: ローカルブラウザ操作時に MailPit (smb-mailpit-smtp.php) で実送信を確認したいケースがあるため。
		setOptionRaw( 'smb_mail_capture_enabled', '1' );
		// 受付/承認テンプレの既定値を確認するため、起動時の値で固定し直す。
		setOptionRaw( 'smb_mail_from_name', 'Smart Booking Test' );
		setOptionRaw( 'smb_mail_from_email', 'noreply@example.com' );
		setOptionRaw(
			'smb_mail_receipt_user_subject',
			'【{store_name}】ご予約を受け付けました'
		);
		setOptionRaw(
			'smb_mail_receipt_user_body',
			'{customer_name} 様\n日時: {schedule_date} {schedule_time}\n店舗: {store_name}\n予約番号: {reservation_id}'
		);
		setOptionRaw(
			'smb_mail_receipt_admin_subject',
			'【新規予約】{customer_name}（{store_name}）'
		);
		setOptionRaw(
			'smb_mail_receipt_admin_body',
			'予約者: {customer_name}\nメール: {customer_email}\n電話: {customer_phone}\n日時: {schedule_date} {schedule_time}\n予約番号: {reservation_id}'
		);
		setOptionRaw(
			'smb_mail_approval_user_subject',
			'【{store_name}】ご予約が確定しました'
		);
		setOptionRaw(
			'smb_mail_approval_user_body',
			'{customer_name} 様\n予約が確定しました。\n日時: {schedule_date} {schedule_time}\n予約番号: {reservation_id}'
		);
	} );

	test.afterAll( async () => {
		clearMailLog();
		// 後続テストで catcher が誤動作しないよう必ず OFF に戻す。
		try {
			wpCli( `option delete smb_mail_capture_enabled` );
		} catch ( _e ) {
			// 既に未設定なら無視。
		}
		restoreBaseline();
	} );

	// ----------------------------------------------------------------
	// 1. 受付メール: ユーザー宛 + 管理者宛(担当者CC) 2 通 / 変数 render
	// ----------------------------------------------------------------
	test( '受付メール: ユーザー宛 + 管理者宛(担当者CC) 2 通、変数が render される', async ( {
		page,
	} ) => {
		// 店舗 / 担当者にメールを設定。
		setStoreEmail( USER_STORE_ID, 'store-a@example.com' );
		setStaffEmail( USER_STAFF_ID, 'staff-a@example.com' );

		// 明日の 14:00-15:00 のスケジュール.
		const dateStr = ymd( 1 );
		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: dateStr,
			start: '14:00:00',
			end: '15:00:00',
			capacity: 3,
		} );
		expect( scheduleId ).toBeGreaterThan( 0 );

		await gotoFrontForm( page );

		const created = await submitPublicReservation( page, scheduleId, {
			name: '山田 花子',
			email: 'hanako@example.com',
			phone: '090-1111-2222',
		} );
		const reservationId = Number( created?.id || created?.reservation_id );
		expect( reservationId ).toBeGreaterThan( 0 );

		const log = fetchMailLog();
		expect( log.length ).toBe( 2 );

		// 宛先で分類.
		const userMail = log.find( ( m ) => m.to === 'hanako@example.com' );
		const adminMail = log.find( ( m ) => m.to === 'store-a@example.com' );
		expect(
			userMail,
			'user mail to hanako@example.com exists'
		).toBeTruthy();
		expect(
			adminMail,
			'admin mail to store-a@example.com exists'
		).toBeTruthy();

		// 件名: 店舗名 render.
		expect( userMail.subject ).toContain( '店舗1' );
		expect( userMail.subject ).toContain( 'ご予約を受け付けました' );
		expect( adminMail.subject ).toContain( '山田 花子' );

		// 本文: 各種変数が展開されている.
		expect( userMail.message ).toContain( '山田 花子' );
		// schedule_date は「YYYY年M月D日（曜）」形式.
		expect( userMail.message ).toMatch(
			/\d{4}年\d{1,2}月\d{1,2}日（[日月火水木金土]）/
		);
		// schedule_time は「14:00〜15:00」形式.
		expect( userMail.message ).toContain( '14:00〜15:00' );
		// 予約番号は数値が render される.
		expect( userMail.message ).toContain( String( reservationId ) );

		// 管理者本文: customer_email / phone も入っている.
		expect( adminMail.message ).toContain( 'hanako@example.com' );
		expect( adminMail.message ).toContain( '090-1111-2222' );

		// CC: 担当者メールがある.
		const adminHeaders = headerLines( adminMail.headers );
		const userHeaders = headerLines( userMail.headers );
		expect(
			adminHeaders.some( ( h ) =>
				/^Cc:\s*staff-a@example\.com$/i.test( h )
			),
			`admin headers should contain staff Cc; got: ${ JSON.stringify(
				adminHeaders
			) }`
		).toBe( true );
		// ユーザー宛には Cc が付かない.
		expect(
			userHeaders.some( ( h ) => /^Cc:/i.test( h ) ),
			`user headers should NOT contain Cc; got: ${ JSON.stringify(
				userHeaders
			) }`
		).toBe( false );
	} );

	// ----------------------------------------------------------------
	// 2. 担当者メール空 → CC ヘッダ無し
	// ----------------------------------------------------------------
	test( '担当者メール空: 管理者宛から Cc ヘッダが消える', async ( {
		page,
	} ) => {
		setStoreEmail( USER_STORE_ID, 'store-a@example.com' );
		setStaffEmail( USER_STAFF_ID, '' );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '11:00:00',
			end: '12:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await submitPublicReservation( page, scheduleId, {
			name: '佐藤 一郎',
			email: 'sato@example.com',
			phone: '090-3333-4444',
		} );

		const log = fetchMailLog();
		expect( log.length ).toBe( 2 );
		const adminMail = log.find( ( m ) => m.to === 'store-a@example.com' );
		expect( adminMail ).toBeTruthy();
		const adminHeaders = headerLines( adminMail.headers );
		expect(
			adminHeaders.some( ( h ) => /^Cc:/i.test( h ) ),
			`admin headers should NOT contain Cc when staff email empty; got: ${ JSON.stringify(
				adminHeaders
			) }`
		).toBe( false );
	} );

	// ----------------------------------------------------------------
	// 3. 承認メール: PATCH で status=approved にすると 1 通追加で送られる
	// ----------------------------------------------------------------
	test( '承認時: ユーザー宛 1 通 (件名は smb_mail_approval_user_subject)', async ( {
		page,
	} ) => {
		setStoreEmail( USER_STORE_ID, 'store-a@example.com' );
		setStaffEmail( USER_STAFF_ID, 'staff-a@example.com' );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '15:00:00',
			end: '16:00:00',
			capacity: 3,
		} );

		// 公開予約は admin ログイン無しで page.goto で十分（nonce はフロントから取得）。
		await gotoFrontForm( page );
		const created = await submitPublicReservation( page, scheduleId, {
			name: '承認 太郎',
			email: 'approve@example.com',
			phone: '080-1111-2222',
		} );
		const reservationId = Number( created?.id || created?.reservation_id );
		expect( reservationId ).toBeGreaterThan( 0 );

		// 受付時点で 2 通入っているはず。クリアして承認だけを観測する.
		clearMailLog();

		// 管理者ログイン → admin REST で PATCH.
		await loginAsAdmin( page );
		// REST 用 nonce を取得する。WP 管理画面では window.wpApiSettings.nonce が利用可能.
		const adminNonce = await page.evaluate( () => {
			return window.wpApiSettings && window.wpApiSettings.nonce
				? window.wpApiSettings.nonce
				: '';
		} );
		expect(
			adminNonce,
			'admin nonce available via wpApiSettings'
		).toBeTruthy();

		const patchRes = await page.evaluate(
			async ( { id, nonce } ) => {
				const res = await fetch(
					`/wp-json/smart-booking/v1/reservations/${ id }`,
					{
						method: 'PATCH',
						credentials: 'same-origin',
						headers: {
							'Content-Type': 'application/json',
							'X-WP-Nonce': nonce,
							Accept: 'application/json',
						},
						body: JSON.stringify( { status: 'approved' } ),
					}
				);
				let data = null;
				try {
					data = await res.json();
				} catch {
					/* noop */
				}
				return { ok: res.ok, status: res.status, data };
			},
			{ id: reservationId, nonce: adminNonce }
		);
		expect(
			patchRes.status,
			`PATCH response: ${ JSON.stringify( patchRes ) }`
		).toBe( 200 );

		// 承認メール 1 通だけが追加されているはず.
		const log = fetchMailLog();
		expect( log.length ).toBe( 1 );
		const approval = log[ 0 ];
		expect( approval.to ).toBe( 'approve@example.com' );
		expect( approval.subject ).toContain( 'ご予約が確定しました' );
		expect( approval.subject ).toContain( '店舗1' );
		expect( approval.message ).toContain( '承認 太郎' );
		expect( approval.message ).toContain( '15:00〜16:00' );
		expect( approval.message ).toContain( String( reservationId ) );
	} );

	// ----------------------------------------------------------------
	// 4. 店舗メール空 → 管理者メールが送られない（ユーザー宛のみ）
	// ----------------------------------------------------------------
	test( '店舗メール空: 管理者宛はスキップ、ユーザー宛 1 通のみ', async ( {
		page,
	} ) => {
		setStoreEmail( USER_STORE_ID, '' );
		setStaffEmail( USER_STAFF_ID, 'staff-a@example.com' );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '13:00:00',
			end: '14:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await submitPublicReservation( page, scheduleId, {
			name: '店舗空 テスト',
			email: 'no-store@example.com',
			phone: '090-7777-8888',
		} );

		const log = fetchMailLog();
		expect( log.length ).toBe( 1 );
		expect( log[ 0 ].to ).toBe( 'no-store@example.com' );
		expect( log[ 0 ].subject ).toContain( 'ご予約を受け付けました' );
	} );

	// ----------------------------------------------------------------
	// 5. From 系オプションが空でも送信は成功する（フォールバック確認）
	// ----------------------------------------------------------------
	test( 'smb_mail_from_name / smb_mail_from_email が空でも送信は成功する', async ( {
		page,
	} ) => {
		setStoreEmail( USER_STORE_ID, 'store-a@example.com' );
		setStaffEmail( USER_STAFF_ID, '' );
		setOptionSql( 'smb_mail_from_name', "''" );
		setOptionSql( 'smb_mail_from_email', "''" );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '16:00:00',
			end: '17:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await submitPublicReservation( page, scheduleId, {
			name: 'From 空',
			email: 'fromempty@example.com',
			phone: '080-9999-0000',
		} );

		const log = fetchMailLog();
		// ユーザー宛 + 管理者宛 = 2 通。送信が成功していれば log は 2 件以上.
		expect( log.length ).toBe( 2 );
		const userMail = log.find( ( m ) => m.to === 'fromempty@example.com' );
		expect( userMail ).toBeTruthy();
		// From ヘッダ: blogname または admin_email にフォールバック、もしくは無い場合もあり得る.
		// 明示的に「From: が含まれる場合は <...@...> 形式が正しい」程度の緩い検証に留める.
		const userHeaders = headerLines( userMail.headers );
		const fromLines = userHeaders.filter( ( h ) => /^From:/i.test( h ) );
		// From ヘッダが付くなら不正な形式でないこと（admin_email へのフォールバック想定）.
		fromLines.forEach( ( line ) => {
			expect( line ).toMatch( /From:\s*.+/ );
		} );
	} );
} );
