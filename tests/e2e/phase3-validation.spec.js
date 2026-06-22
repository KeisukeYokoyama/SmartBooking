/**
 * Phase 3 Eval-3: フロント予約フォーム 異常系・エッジケース.
 *
 * 検証範囲（CLAUDE 指示の Eval-3 範囲）:
 *   - バリデーション (仕様 3.5)
 *       * 必須3フィールド未入力 → エラー、送信されない
 *       * email 形式不正 → エラー、送信されない
 *       * 電話番号フォーマット → 数字以外混入時エラー
 *       * カスタムフィールド is_required=1 が空 → エラー
 *       * エラー時のフォーカス（最初のエラーフィールドへ）
 *   - 満席 (仕様 3.4 + 5.8)
 *       * 満席バッジ・disabled
 *       * 定員超過の REST POST → 409
 *   - 締切 (仕様 3.8)
 *       * 過ぎた日付タイル disabled
 *       * 過ぎた時間枠 closed バッジ + disabled
 *       * REST POST 直叩きで締切超過 → 400
 *   - 競合 (仕様 5.8 アトミック UPDATE)
 *       * capacity=1 の枠に並列 POST → 1 つ成功 / もう 1 つ 409
 *   - ハニーポット (仕様 5.10)
 *       * 値ありで POST → 400 smb_reservation_spam_rejected
 *       * フィールドが視覚非表示 + tab 到達不可
 *   - 不正データ
 *       * 存在しない schedule_id → 400
 *       * is_active=0 の schedule → 400
 *       * payload 必須欠如 → 400
 *   - エラー UI
 *       * 確定送信で失敗 → エラー表示 + ステップ confirm に留まる
 *       * エラー時の自動フォーカス
 */
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertSchedule,
	getScheduleBookedCount,
	countRows,
	publicRest,
	fillCoreFormAndGoConfirm,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );

// DB seed/restore があるため serial 実行.
test.describe.configure( { mode: 'serial' } );

/**
 * 必須3フィールド以外で必須フラグの「お問い合わせ内容」テキストエリアを追加する。
 * 戻り値: 追加した field_key ('inquiry')。
 */
function addRequiredCustomField() {
	const { execSync } = require( 'node:child_process' );
	const path = require( 'node:path' );
	const sql = `INSERT INTO wp_smabo_custom_fields (field_key, field_label, field_type, field_options, placeholder, is_required, sort_order, created_at) VALUES ('inquiry', 'お問い合わせ内容', 'textarea', '', '', 1, 100, NOW());`;
	execSync( `npx wp-env run cli wp db query "${ sql }"`, {
		cwd: path.resolve( __dirname, '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
	} );
	return 'inquiry';
}

/**
 * UPDATE で booked_count を直接上書きする（テスト用）。
 * @param scheduleId
 * @param count
 */
function setBookedCount( scheduleId, count ) {
	const { execSync } = require( 'node:child_process' );
	const path = require( 'node:path' );
	execSync(
		`npx wp-env run cli wp db query "UPDATE wp_smabo_schedules SET booked_count = ${ count } WHERE id = ${ scheduleId };"`,
		{
			cwd: path.resolve( __dirname, '..', '..' ),
			encoding: 'utf8',
			stdio: [ 'ignore', 'pipe', 'pipe' ],
		}
	);
}

/**
 * is_active を 0 にする（テスト用）。
 * @param scheduleId
 */
function deactivateSchedule( scheduleId ) {
	const { execSync } = require( 'node:child_process' );
	const path = require( 'node:path' );
	execSync(
		`npx wp-env run cli wp db query "UPDATE wp_smabo_schedules SET is_active = 0 WHERE id = ${ scheduleId };"`,
		{
			cwd: path.resolve( __dirname, '..', '..' ),
			encoding: 'utf8',
			stdio: [ 'ignore', 'pipe', 'pipe' ],
		}
	);
}

test.describe( 'Phase 3 Eval-3: フロント予約フォーム 異常系', () => {
	test.setTimeout( 60_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	// ============================================================
	// バリデーション（仕様 3.5）
	// ============================================================

	test( '必須3フィールドすべて空で送信 → エラー表示が出て次ステップに進まない', async ( {
		page,
	} ) => {
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await expect(
			page.getByRole( 'heading', { name: 'お客様情報の入力' } )
		).toBeVisible();

		// 全空のまま「確認画面へ進む」.
		await page.getByRole( 'button', { name: '確認画面へ進む' } ).click();

		// 確認画面に遷移していない.
		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toHaveCount( 0 );

		// 3 つのフィールドそれぞれにエラーメッセージが出ている.
		const errors = page.locator( '.smb-front-form__error' );
		await expect( errors ).toHaveCount( 3 );
		// 必須メッセージ（FormInput.jsx: 'この項目は必須です。'）.
		for ( let i = 0; i < 3; i++ ) {
			await expect( errors.nth( i ) ).toContainText( '必須' );
		}

		// 最初のエラーフィールド（sort_order の最小値を持つ必須フィールド）にフォーカスが当たる.
		// baseline でも DB 状態によって sort_order が変わる可能性があるため、
		// 「3 つのコアフィールドのいずれか」かつ「実際に DOM 上で最初の入力」が focused である事を確認する.
		const focusedId = await page.evaluate(
			() => document.activeElement && document.activeElement.id
		);
		expect( [
			'smb-front-field-customer_name',
			'smb-front-field-customer_email',
			'smb-front-field-customer_phone',
		] ).toContain( focusedId );
		// DOM 上の先頭 input と一致するはず（FormInput は orderedFields 順に描画している）.
		const firstInputId = await page
			.locator( '.smb-front-form input.smb-front-form__input' )
			.first()
			.getAttribute( 'id' );
		expect( focusedId ).toBe( firstInputId );
	} );

	test( '氏名のみ入力 → メール・電話に必須エラー、氏名は OK', async ( {
		page,
	} ) => {
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( 'テスト 太郎' );
		await page.getByRole( 'button', { name: '確認画面へ進む' } ).click();

		// 確認画面に遷移していない.
		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toHaveCount( 0 );

		// 氏名フィールドにはエラーが出ない、メール・電話に必須エラー.
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toHaveAttribute( 'aria-invalid', 'false' );
		await expect(
			page.locator( '#smb-front-field-customer_email' )
		).toHaveAttribute( 'aria-invalid', 'true' );
		await expect(
			page.locator( '#smb-front-field-customer_phone' )
		).toHaveAttribute( 'aria-invalid', 'true' );

		// フォーカスは「最初のエラーがあるフィールド」（DOM 上で 2 つの空フィールドのうち先頭）.
		const focusedId = await page.evaluate(
			() => document.activeElement && document.activeElement.id
		);
		// customer_email か customer_phone のいずれか（baseline の sort_order 次第）.
		expect( [
			'smb-front-field-customer_email',
			'smb-front-field-customer_phone',
		] ).toContain( focusedId );
		// 氏名以外の input のうち DOM 先頭のもの = focused.
		const firstNonNameInputId = await page
			.locator(
				'.smb-front-form input.smb-front-form__input:not(#smb-front-field-customer_name)'
			)
			.first()
			.getAttribute( 'id' );
		expect( focusedId ).toBe( firstNonNameInputId );
	} );

	test( 'メール形式不正 (abc, abc@, @abc.com) で送信 → 形式エラー、送信されない', async ( {
		page,
	} ) => {
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		const invalidEmails = [
			'abc',
			'abc@',
			'@abc.com',
			'abc def@example.com',
		];
		for ( const bad of invalidEmails ) {
			await page
				.locator( '#smb-front-field-customer_name' )
				.fill( 'テスト' );
			await page.locator( '#smb-front-field-customer_email' ).fill( bad );
			await page
				.locator( '#smb-front-field-customer_phone' )
				.fill( '090-1234-5678' );
			await page
				.getByRole( 'button', { name: '確認画面へ進む' } )
				.click();

			// 確認画面に遷移していない.
			await expect(
				page.getByRole( 'heading', { name: '予約内容の確認' } )
			).toHaveCount( 0 );

			// メールフィールドにエラーが出ている.
			const emailErr = page.locator(
				'#smb-front-field-customer_email-err'
			);
			await expect( emailErr ).toContainText( 'メールアドレスの形式' );

			// 入力をクリアして次のサイクルへ（クリア時に該当エラーは消える）.
			await page.locator( '#smb-front-field-customer_email' ).fill( '' );
		}
	} );

	test( '電話番号に数字以外（英字）が混入 → フォーマットエラー、送信されない', async ( {
		page,
	} ) => {
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		await page.locator( '#smb-front-field-customer_name' ).fill( 'テスト' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'test@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( 'phone-bad-1234' );
		await page.getByRole( 'button', { name: '確認画面へ進む' } ).click();

		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toHaveCount( 0 );

		const phoneErr = page.locator( '#smb-front-field-customer_phone-err' );
		await expect( phoneErr ).toContainText( '電話番号' );
	} );

	test( 'カスタムフィールド is_required=1 が空 → 必須エラー、送信されない', async ( {
		page,
	} ) => {
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		addRequiredCustomField();
		await gotoFrontForm( page );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		// 必須3フィールドは入力するが、カスタムフィールド (inquiry) は空のまま.
		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( 'テスト 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'test@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-1234-5678' );
		await page.getByRole( 'button', { name: '確認画面へ進む' } ).click();

		// 確認画面に遷移していない.
		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toHaveCount( 0 );

		const inquiryErr = page.locator( '#smb-front-field-inquiry-err' );
		await expect( inquiryErr ).toContainText( '必須' );

		// フォーカスはカスタムフィールド (inquiry) に当たる. テキストエリアでも focus は当たるはず.
		const focusedId = await page.evaluate(
			() => document.activeElement && document.activeElement.id
		);
		expect( focusedId ).toBe( 'smb-front-field-inquiry' );
	} );

	// ============================================================
	// 満席（仕様 3.4 + 5.8）
	// ============================================================

	test( '満席の時間枠ボタンは disabled でクリック不可', async ( {
		page,
	} ) => {
		setOption( 'smabo_calendar_view_mode', 'day_only' );
		const d = ymd( 1 );
		const fullSchedId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 1,
		} );
		setBookedCount( fullSchedId, 1 );
		// 同じ日に空き枠も用意してタイル自体は選択可能にしておく.
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '14:00:00',
			end: '15:00:00',
			capacity: 3,
		} );

		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();

		// 満席ボタン (10:00).
		const fullBtn = page.getByRole( 'button', {
			name: /^10:00から11:00 満席 選択不可$/,
		} );
		await expect( fullBtn ).toBeDisabled();

		// クリックを試みる（force:true）→ 状態変化なし.
		await fullBtn.click( { force: true } ).catch( () => {} );
		await expect(
			page.getByRole( 'heading', { name: 'お客様情報の入力' } )
		).toHaveCount( 0 );
	} );

	test( 'REST 直叩き: capacity 超過の予約は 409 smb_reservation_full', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
		const fullSchedId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 1,
		} );
		setBookedCount( fullSchedId, 1 );
		await gotoFrontForm( page );

		const res = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				schedule_id: fullSchedId,
				customer_name: '満席 太郎',
				customer_email: 'full@example.com',
				customer_phone: '090-0000-0000',
				honeypot: '',
			},
		} );
		expect( res.status ).toBe( 409 );
		expect( res.data && res.data.code ).toBe( 'smb_reservation_full' );
		// booked_count は 1 のまま、予約は増えていない.
		expect( getScheduleBookedCount( fullSchedId ) ).toBe( 1 );
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 0 );
	} );

	// ============================================================
	// 締切（仕様 3.8）
	// ============================================================

	test( 'deadline_days=10: 1日後の枠タイルは disabled で「締切」バッジ', async ( {
		page,
	} ) => {
		setOption( 'smabo_calendar_view_mode', 'day_only' );
		setOption( 'smabo_booking_deadline_days', 10 );
		const d = ymd( 1 );
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );

		const dayNum = new Date( d ).getDate();
		const tile = page.locator( '.smb-front-day-tile' ).filter( {
			has: page.locator( `.smb-front-day-tile__day:text("${ dayNum }")` ),
		} );
		await expect( tile ).toBeDisabled();
		await expect(
			tile.locator( '.smb-front-day-tile__badge.is-closed' )
		).toContainText( '締切' );
	} );

	test( 'REST 直叩き: 締切超過の schedule に POST → 400 smb_reservation_deadline_passed', async ( {
		page,
	} ) => {
		setOption( 'smabo_booking_deadline_days', 10 );
		const d = ymd( 1 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );

		const res = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				schedule_id: sid,
				customer_name: '締切 太郎',
				customer_email: 'late@example.com',
				customer_phone: '090-0000-0000',
				honeypot: '',
			},
		} );
		expect( res.status ).toBe( 400 );
		expect( res.data && res.data.code ).toBe(
			'smb_reservation_deadline_passed'
		);
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 0 );
		expect( getScheduleBookedCount( sid ) ).toBe( 0 );
	} );

	// ============================================================
	// 同時予約の競合防止（仕様 5.8 アトミック UPDATE） — 重要
	// ============================================================

	test( '競合: capacity=1 に並列 POST 2 件 → 1 件成功・もう 1 件 409', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 1,
		} );
		await gotoFrontForm( page );

		// page.evaluate 内で 2 つの fetch を Promise.all で並列実行.
		const results = await page.evaluate(
			async ( { scheduleId } ) => {
				const ctx = window.smartBookingFrontend;
				const url =
					ctx.restUrl.replace( /\/$/, '' ) + '/public/reservations';
				const headers = {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					'X-WP-Nonce': ctx.nonce,
				};
				const makeReq = ( name, email ) =>
					fetch( url, {
						method: 'POST',
						credentials: 'same-origin',
						headers,
						body: JSON.stringify( {
							schedule_id: scheduleId,
							customer_name: name,
							customer_email: email,
							customer_phone: '090-0000-0000',
							honeypot: '',
						} ),
					} ).then( async ( res ) => {
						let data = null;
						try {
							data = await res.json();
						} catch {
							/* noop */
						}
						return { status: res.status, code: data && data.code };
					} );
				return Promise.all( [
					makeReq( '競合A', 'a@example.com' ),
					makeReq( '競合B', 'b@example.com' ),
				] );
			},
			{ scheduleId: sid }
		);

		expect( results ).toHaveLength( 2 );
		const statuses = results.map( ( r ) => r.status ).sort();
		// アトミック UPDATE で 1 件成功 (200) ・もう 1 件 409 になることを確認.
		expect( statuses ).toEqual( [ 200, 409 ] );
		const conflict = results.find( ( r ) => r.status === 409 );
		expect( conflict.code ).toBe( 'smb_reservation_full' );

		// DB 状態: 予約 1 件、booked_count=1.
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 1 );
		expect( getScheduleBookedCount( sid ) ).toBe( 1 );
	} );

	// ============================================================
	// ハニーポット（仕様 5.10）
	// ============================================================

	test( 'ハニーポット: 値ありで POST → 400 smb_reservation_spam_rejected', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );

		const res = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				schedule_id: sid,
				customer_name: 'スパム 太郎',
				customer_email: 'spam@example.com',
				customer_phone: '090-0000-0000',
				honeypot: 'http://spam.example.com',
			},
		} );
		expect( res.status ).toBe( 400 );
		expect( res.data && res.data.code ).toBe(
			'smb_reservation_spam_rejected'
		);
		// 予約は作成されていない、booked_count も 0 のまま.
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 0 );
		expect( getScheduleBookedCount( sid ) ).toBe( 0 );
	} );

	test( 'ハニーポット: 視覚的に隠蔽されており aria-hidden=true / Tab で到達できない', async ( {
		page,
	} ) => {
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		// .smb-front-honeypot ラッパが aria-hidden=true.
		const wrapper = page.locator( '.smb-front-honeypot' );
		await expect( wrapper ).toHaveCount( 1 );
		await expect( wrapper ).toHaveAttribute( 'aria-hidden', 'true' );

		// 内側の input が tabindex=-1.
		const hpInput = wrapper.locator( 'input[name="email_confirm"]' );
		await expect( hpInput ).toHaveAttribute( 'tabindex', '-1' );

		// 視覚的に offscreen / non-visible：bounding box が viewport 外、または display:none/visibility:hidden 相当.
		// 実装: .smb-front-honeypot { position: absolute; left: -9999px; ... } を期待。
		// → bounding box の x が -1000 未満であることを確認.
		const box = await hpInput.boundingBox();
		// position absolute + left:-9999px のため box.x が大きく負になるはず. ただし null 許容（display:none の場合）.
		if ( box !== null ) {
			expect( box.x ).toBeLessThan( -100 );
		}

		// キーボード Tab で順送りしても honeypot にフォーカスが当たらない.
		await page.locator( '#smb-front-field-customer_name' ).focus();
		const visited = new Set();
		for ( let i = 0; i < 10; i++ ) {
			await page.keyboard.press( 'Tab' );
			const id = await page.evaluate( () => {
				const el = document.activeElement;
				if ( ! el ) {
					return null;
				}
				return el.id || el.getAttribute( 'name' ) || el.tagName;
			} );
			if ( id ) {
				visited.add( id );
			}
		}
		// 'email_confirm' という name の input には絶対に到達しない.
		expect( Array.from( visited ) ).not.toContain( 'email_confirm' );
	} );

	// ============================================================
	// 不正データ
	// ============================================================

	test( 'REST 直叩き: 存在しない schedule_id → 400 smb_reservation_schedule_not_found', async ( {
		page,
	} ) => {
		await gotoFrontForm( page );
		const res = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				schedule_id: 99999,
				customer_name: '不在 太郎',
				customer_email: 'absent@example.com',
				customer_phone: '090-0000-0000',
				honeypot: '',
			},
		} );
		expect( res.status ).toBe( 400 );
		expect( res.data && res.data.code ).toBe(
			'smb_reservation_schedule_not_found'
		);
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 0 );
	} );

	test( 'REST 直叩き: schedule_id 欠如 → 400 smb_reservation_schedule_required', async ( {
		page,
	} ) => {
		await gotoFrontForm( page );
		const res = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				customer_name: 'スケジュール無し',
				customer_email: 'noid@example.com',
				customer_phone: '090-0000-0000',
				honeypot: '',
			},
		} );
		expect( res.status ).toBe( 400 );
		expect( res.data && res.data.code ).toBe(
			'smb_reservation_schedule_required'
		);
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 0 );
	} );

	test( 'REST 直叩き: is_active=0 の schedule → 400 smb_reservation_schedule_not_found', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		deactivateSchedule( sid );
		await gotoFrontForm( page );

		const res = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				schedule_id: sid,
				customer_name: '無効 太郎',
				customer_email: 'inactive@example.com',
				customer_phone: '090-0000-0000',
				honeypot: '',
			},
		} );
		expect( res.status ).toBe( 400 );
		expect( res.data && res.data.code ).toBe(
			'smb_reservation_schedule_not_found'
		);
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 0 );
	} );

	test( 'REST 直叩き: 必須3フィールド (氏名/メール/電話) のいずれか欠如 → 400', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );

		const baseBody = {
			schedule_id: sid,
			customer_name: 'テスト',
			customer_email: 'test@example.com',
			customer_phone: '090-0000-0000',
			honeypot: '',
		};

		// 氏名欠如.
		const r1 = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: { ...baseBody, customer_name: '' },
		} );
		expect( r1.status ).toBe( 400 );
		expect( r1.data && r1.data.code ).toBe(
			'smb_reservation_name_required'
		);

		// メール欠如.
		const r2 = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: { ...baseBody, customer_email: '' },
		} );
		expect( r2.status ).toBe( 400 );
		expect( r2.data && r2.data.code ).toBe(
			'smb_reservation_email_required'
		);

		// 電話欠如.
		const r3 = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: { ...baseBody, customer_phone: '' },
		} );
		expect( r3.status ).toBe( 400 );
		expect( r3.data && r3.data.code ).toBe(
			'smb_reservation_phone_required'
		);

		// メール形式不正.
		const r4 = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: { ...baseBody, customer_email: 'not-an-email' },
		} );
		expect( r4.status ).toBe( 400 );
		expect( r4.data && r4.data.code ).toBe(
			'smb_reservation_email_invalid'
		);

		// すべて 0 件のまま.
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 0 );
		expect( getScheduleBookedCount( sid ) ).toBe( 0 );
	} );

	// ============================================================
	// エラー UI: 確認画面で送信失敗 → ステップは confirm に留まり、エラーが表示される
	// ============================================================

	test( '確認画面で送信失敗 (409 満席) → エラー表示 + ステップは confirm に留まる + フォーカス遷移', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 1,
		} );
		await gotoFrontForm( page );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await fillCoreFormAndGoConfirm( page, {
			name: '失敗 太郎',
			email: 'fail@example.com',
			phone: '090-0000-0000',
		} );

		// confirm 画面到達後、別チャネルで予約を埋めて満席にする.
		setBookedCount( sid, 1 );

		// 「予約を確定する」をクリック.
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();

		// エラー表示要素 (.smb-front-confirm__alert) が出る.
		const alert = page.locator( '.smb-front-confirm__alert' );
		await expect( alert ).toBeVisible( { timeout: 10_000 } );
		await expect( alert ).toContainText( /満席|時間枠/ );

		// ステップはまだ confirm（完了画面に遷移していない）.
		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toBeVisible();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toHaveCount( 0 );

		// エラー要素にフォーカスが当たっている (Gen-D 実装: ConfirmPage useEffect).
		const focused = await page.evaluate( () => {
			const el = document.activeElement;
			if ( ! el ) {
				return null;
			}
			return el.className || '';
		} );
		expect( focused ).toContain( 'smb-front-confirm__alert' );

		// 「予約を確定する」ボタンが再度有効になっており再送信可能.
		await expect(
			page.getByRole( 'button', { name: '予約を確定する' } )
		).toBeEnabled();

		// DB 検証: 競合検出のためレコード追加されない.
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 0 );
	} );

	test( '過去枠 (現在時刻より前) には POST できない: 400 smb_reservation_closed', async ( {
		page,
	} ) => {
		// 当日の早朝枠（00:30）を作成. テスト実行時刻 > 00:30 と仮定.
		const today = ymd( 0 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: today,
			start: '00:30:00',
			end: '01:30:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );

		const res = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				schedule_id: sid,
				customer_name: '過去 太郎',
				customer_email: 'past@example.com',
				customer_phone: '090-0000-0000',
				honeypot: '',
			},
		} );
		// 過去日 → 400 smb_reservation_closed が返る (deadline_days=0 でも過去枠チェックが先行する).
		expect( res.status ).toBe( 400 );
		expect( [
			'smb_reservation_closed',
			'smb_reservation_deadline_passed',
		] ).toContain( res.data && res.data.code );
		expect( countRows( 'wp_smabo_reservations' ) ).toBe( 0 );
		expect( getScheduleBookedCount( sid ) ).toBe( 0 );
	} );
} );
