/**
 * Phase 5 軽微 UX 修正 5 件の E2E 検証.
 *
 * 検証対象コミット: fab13a7
 *
 *   ① UX-2:    few_left の境界条件 (残席<=2 OR 残席<=ceil(capacity*0.3))
 *   ② UX-3:    カレンダー toggle ボタンの aria-label
 *   ③ UX-9 追記: 409 後「日付を選び直す」で time/scheduleId/submitError リセット
 *   ④ UX-10:   ハニーポット label の日本語化
 *   ⑤ UX-12:   完了画面の日時フォーマット統一 (日付 + 時間 [start 〜 end])
 *
 * desktop プロジェクトで実行する想定（モバイル UA 固有挙動なし）。
 * DB seed/restore があるため serial 実行する。
 */
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertSchedule,
	publicRest,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );
const { execSync } = require( 'node:child_process' );
const path = require( 'node:path' );

function wpDb( sql ) {
	execSync(
		`npx wp-env run cli wp db query "${ sql.replace( /"/g, '\\"' ) }"`,
		{
			cwd: path.resolve( __dirname, '..', '..' ),
			stdio: [ 'ignore', 'pipe', 'pipe' ],
			timeout: 60_000,
		}
	);
}

test.describe.configure( { mode: 'serial' } );

test.describe( 'Phase 5 UX 修正 5 件 ピンポイント検証', () => {
	test.setTimeout( 60_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	// =========================================================================
	// ① UX-2: few_left の境界条件
	// =========================================================================
	test( 'UX-2: capacity=3/booked=1 (残2) → few_left（旧ロジックでは available）', async ( {
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
		wpDb(
			`UPDATE wp_smart_booking_schedules SET booked_count = 1 WHERE id = ${ sid };`
		);
		await gotoFrontForm( page );
		const res = await publicRest( page, 'public/availability', {
			query: {
				store_id: USER_STORE_ID,
				staff_id: USER_STAFF_ID,
				date_from: d,
				date_to: d,
			},
		} );
		expect( res.ok ).toBe( true );
		const slot = ( res.data.schedules || [] ).find( ( s ) => s.id === sid );
		expect( slot ).toBeTruthy();
		expect( slot.availability ).toBe( 'few_left' );
	} );

	test( 'UX-2: capacity=2/booked=1 (残1) → few_left（旧ロジックでは available）', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 2,
		} );
		wpDb(
			`UPDATE wp_smart_booking_schedules SET booked_count = 1 WHERE id = ${ sid };`
		);
		await gotoFrontForm( page );
		const res = await publicRest( page, 'public/availability', {
			query: {
				store_id: USER_STORE_ID,
				staff_id: USER_STAFF_ID,
				date_from: d,
				date_to: d,
			},
		} );
		expect( res.ok ).toBe( true );
		const slot = ( res.data.schedules || [] ).find( ( s ) => s.id === sid );
		expect( slot ).toBeTruthy();
		expect( slot.availability ).toBe( 'few_left' );
	} );

	test( 'UX-2: capacity=10/booked=7 (残3) → few_left（旧と不変）', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 10,
		} );
		wpDb(
			`UPDATE wp_smart_booking_schedules SET booked_count = 7 WHERE id = ${ sid };`
		);
		await gotoFrontForm( page );
		const res = await publicRest( page, 'public/availability', {
			query: {
				store_id: USER_STORE_ID,
				staff_id: USER_STAFF_ID,
				date_from: d,
				date_to: d,
			},
		} );
		expect( res.ok ).toBe( true );
		const slot = ( res.data.schedules || [] ).find( ( s ) => s.id === sid );
		expect( slot ).toBeTruthy();
		expect( slot.availability ).toBe( 'few_left' );
	} );

	test( 'UX-2: capacity=10/booked=6 (残4) → available（回帰確認）', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
		const sid = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 10,
		} );
		wpDb(
			`UPDATE wp_smart_booking_schedules SET booked_count = 6 WHERE id = ${ sid };`
		);
		await gotoFrontForm( page );
		const res = await publicRest( page, 'public/availability', {
			query: {
				store_id: USER_STORE_ID,
				staff_id: USER_STAFF_ID,
				date_from: d,
				date_to: d,
			},
		} );
		expect( res.ok ).toBe( true );
		const slot = ( res.data.schedules || [] ).find( ( s ) => s.id === sid );
		expect( slot ).toBeTruthy();
		expect( slot.availability ).toBe( 'available' );
	} );

	// =========================================================================
	// ② UX-3: カレンダー toggle ボタンの aria-label
	// =========================================================================
	test( 'UX-3: calendar_mode=toggle で「日表示に切り替え」「月表示に切り替え」aria-label が取得できる', async ( {
		page,
	} ) => {
		setOption( 'smart_booking_calendar_view_mode', 'toggle' );
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		await gotoFrontForm( page );
		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();
		// role=tab の aria-label で 2 ボタンが取得できる.
		const dayBtn = page.getByRole( 'tab', { name: '日表示に切り替え' } );
		const monthBtn = page.getByRole( 'tab', { name: '月表示に切り替え' } );
		await expect( dayBtn ).toBeVisible();
		await expect( monthBtn ).toBeVisible();
	} );

	// =========================================================================
	// ③ UX-9 追記: 409 後「日付を選び直す」で time/scheduleId リセット
	// =========================================================================
	test( 'UX-9 追記: 409 後 → 「日付を選び直す」 → date ステップで時間枠が「未選択状態」になる', async ( {
		page,
	} ) => {
		// 同じ日に 2 枠用意する: 1 つを満席化 (10:00) 、もう 1 つは空き (14:00) 。
		// ユーザーは 10:00 を選択して確認画面 → 別経路で 10:00 が満席化 → 409 → 「日付を選び直す」
		// → date ステップで日付タイルは是然 selected (state.date は維持) だが
		// time slot は未選択状態 (state.time / scheduleId が GO_TO_STEP リセットで消える) 。
		const d = ymd( 1 );
		const schedId10 = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 1,
		} );
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
		// 10:00 枠を選択.
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( 'リセット 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'reset@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-0000-0002' );
		await page.getByRole( 'button', { name: '確認画面へ進む' } ).click();
		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toBeVisible();

		// 別経路で 10:00 枠を満席化.
		const otherRes = await publicRest( page, 'public/reservations', {
			method: 'POST',
			body: {
				schedule_id: schedId10,
				customer_name: '先行 予約者',
				customer_email: 'first@example.com',
				customer_phone: '090-9999-0000',
				honeypot: '',
				custom_fields: {},
			},
		} );
		expect( otherRes.status ).toBe( 200 );

		// 確定 → 409 → 「日付を選び直す」.
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		const alert = page.locator( '.smb-front-confirm__alert' );
		await expect( alert ).toBeVisible( { timeout: 10_000 } );
		await alert.getByRole( 'button', { name: '日付を選び直す' } ).click();

		// date ステップへ戻る.
		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible( { timeout: 10_000 } );

		// state.date は維持されるので、選択中の日付に対する時間枠リストが既に表示されているはず.
		// (ConfirmPage 経由で SET_DATE 済みのまま date ステップに戻ったため、
		//  DateSelect は selectedDate を持ったままで時間枠領域を再描画する)
		await page.waitForSelector( '.smb-front-time-slots', {
			timeout: 10_000,
		} );

		// time-btn が「選択状態 (.is-selected または aria-pressed=true)」のものが 0 件であることを確認.
		// → state.time / scheduleId のリセット効果.
		const selectedTimeBtns = page.locator(
			'.smb-front-time-btn.is-selected, .smb-front-time-btn[aria-pressed="true"]'
		);
		await expect( selectedTimeBtns ).toHaveCount( 0 );

		// 14:00 枠 (空き) を選んで form ステップへ進めることを念のため回帰確認.
		await page.getByRole( 'button', { name: /14:00から15:00/ } ).click();
		await expect(
			page.getByRole( 'heading', { name: 'お客様情報の入力' } )
		).toBeVisible( {
			timeout: 10_000,
		} );
	} );

	// =========================================================================
	// ④ UX-10: ハニーポット label の日本語化
	// =========================================================================
	test( 'UX-10: フォームステップで「この欄は入力しないでください」が DOM にあり、旧文字列が無い', async ( {
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

		const hp = page.locator( '.smb-front-honeypot' );
		await expect( hp ).toHaveCount( 1 );
		await expect( hp ).toHaveAttribute( 'aria-hidden', 'true' );
		// 日本語化された label テキストを含む.
		await expect( hp ).toContainText( 'この欄は入力しないでください' );
		// 旧英語文字列は DOM 全体に存在しない.
		const bodyText = await page.locator( 'body' ).textContent();
		expect( bodyText || '' ).not.toContain( 'Leave this field empty' );
		// 子 input は tabIndex=-1.
		const hpInput = hp.locator( 'input[name="email_confirm"]' );
		await expect( hpInput ).toHaveAttribute( 'tabindex', '-1' );
	} );

	// =========================================================================
	// ⑤ UX-12: 完了画面の日時フォーマット統一 (日付 + 時間 [start 〜 end])
	// =========================================================================
	test( 'UX-12: 完了画面に「日付」「時間」の 2 行が表示され、旧「日時」が存在しない', async ( {
		page,
	} ) => {
		const d = ymd( 1 );
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
		await page.getByRole( 'button', { name: /14:00から15:00/ } ).click();
		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( '完了 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'done@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-1111-2222' );
		await page.getByRole( 'button', { name: '確認画面へ進む' } ).click();
		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toBeVisible();
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();

		// 完了画面.
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		const summary = page.locator( '.smb-front-done__summary' );
		await expect( summary ).toHaveCount( 1 );

		// 「日付」dt + 値 dd.
		const dtList = summary.locator( 'dt' );
		const dtTexts = await dtList.allTextContents();
		expect( dtTexts ).toContain( '日付' );
		expect( dtTexts ).toContain( '時間' );
		expect( dtTexts ).not.toContain( '日時' );

		// 「日付」 dd には「(月)（曜日）」が含まれる.
		// d は ymd(1) で today + 1day. 月日 + （曜日） の形.
		const dateDay = new Date( d ).getDate();
		const dateDd = summary.locator( 'dt:has-text("日付") + dd' );
		await expect( dateDd ).toContainText( String( dateDay ) );
		await expect( dateDd ).toContainText( '（' );

		// 「時間」 dd には "14:00 〜 15:00" が含まれる.
		const timeDd = summary.locator( 'dt:has-text("時間") + dd' );
		await expect( timeDd ).toContainText( '14:00' );
		await expect( timeDd ).toContainText( '〜' );
		await expect( timeDd ).toContainText( '15:00' );
	} );
} );
