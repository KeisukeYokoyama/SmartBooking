/**
 * Regression: 設定反映バグの修正検証.
 *
 * 修正前のバグ:
 *   - 管理画面は smart_booking_booking_flow_order を 'date-first' / 'form-first',
 *     smart_booking_calendar_view_mode を 'day-horizontal' / 'month-grid' / 'day-and-month' で保存する。
 *   - フロント React は 'A' / 'B' / 'day_only' / 'month_only' / 'toggle' しか理解しないため、
 *     公開 REST GET /public/settings が「未知の値」をデフォルトに正規化してしまい、
 *     管理画面の設定がフロントに反映されていなかった。
 *
 * 修正:
 *   includes/rest/class-rest-public.php::get_settings() に翻訳マップを追加し、
 *   管理画面 → フロントへ値が確実に橋渡しされるようにした。
 *
 * 本スペックでは下記 5 シナリオを検証する:
 *   A) flow_order = 'date-first' (= 'A') → 日付選択ステップが先に表示される
 *   B) flow_order = 'form-first' (= 'B') → フォーム入力ステップが先に表示される
 *   C) calendar_mode = 'day-horizontal' (= 'day_only') → 日ストリップ表示
 *   D) calendar_mode = 'month-grid' (= 'month_only') → 月グリッド表示
 *   E) End-to-End: 管理 UI で値を変更 → 保存 → フロント再読込で反映を確認
 *
 * Scenario A〜D は速度のため setOption (DB 直接) を使用。
 * Scenario E は管理 React UI 経由で保存し、ラウンドトリップ全体を検証する。
 */
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertSchedulesBulk,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );
const { bootstrapAdmin, restCall } = require( './phase2-helpers' );

// DB seed/restore を使うため serial 実行.
test.describe.configure( { mode: 'serial' } );

/**
 * フロント form/date ステップに到達できるよう、ベースライン (店舗1+担当者1) +
 * 1週間分のスケジュールを seed する。店舗・担当者ステップはスキップ。
 */
function seedWeekSlots() {
	const rows = [];
	for ( let i = 1; i <= 6; i++ ) {
		rows.push( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( i ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
	}
	insertSchedulesBulk( rows );
}

test.describe( 'Regression: 設定反映バグ修正の検証', () => {
	test.setTimeout( 60_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	// ============================================================
	// A) flow_order = 'date-first' (admin 値) → 日付ステップ先行
	// ============================================================

	test( "A) flow_order='date-first' (admin 値) → 日付選択ステップが先に表示される", async ( {
		page,
	} ) => {
		setOption( 'smart_booking_booking_flow_order', 'date-first' );
		seedWeekSlots();
		await gotoFrontForm( page );

		// 日付選択ステップが先に表示される.
		await expect(
			page.getByRole( 'heading', { name: '日付選択' } )
		).toBeVisible();
		// フォーム入力ステップは表示されない.
		await expect(
			page.getByRole( 'heading', { name: 'お客様情報の入力' } )
		).toHaveCount( 0 );
	} );

	// ============================================================
	// B) flow_order = 'form-first' (admin 値) → フォーム先行
	// ============================================================

	test( "B) flow_order='form-first' (admin 値) → フォーム入力ステップが先に表示される", async ( {
		page,
	} ) => {
		setOption( 'smart_booking_booking_flow_order', 'form-first' );
		seedWeekSlots();
		await gotoFrontForm( page );

		// flow_order='B' (form-first) では MainInputPage 内でフォームセクションが先に来る.
		// MainInputPage は 1 画面統合のため見出しは非表示 (hideHeader=true) だが、
		// フォームセクション (.smb-front-main-page__section--form) が先頭に配置される.
		const sections = page.locator( '.smb-front-main-page__section' );
		// 最初のセクションがフォームセクションであること.
		await expect( sections.first() ).toHaveClass( /smb-front-main-page__section--form/ );
		// フォームの入力フィールドが表示されている.
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();
		// 日付選択セクションも DOM 上に存在するが、後に来る.
		await expect(
			page.locator( '.smb-front-date-section-head' )
		).toBeVisible();
	} );

	// ============================================================
	// C) calendar_mode = 'day-horizontal' (admin 値) → 日ストリップ
	// ============================================================

	test( "C) calendar_mode='day-horizontal' (admin 値) → DateSelect が日ストリップを描画する", async ( {
		page,
	} ) => {
		setOption( 'smart_booking_calendar_view_mode', 'day-horizontal' );
		seedWeekSlots();
		await gotoFrontForm( page );

		await expect(
			page.getByRole( 'heading', { name: '日付選択' } )
		).toBeVisible();
		await page.waitForSelector( '.smb-front-day-strip', {
			timeout: 10_000,
		} );

		// 日ストリップは表示される.
		await expect( page.locator( '.smb-front-day-strip' ) ).toBeVisible();
		// 月グリッドは表示されない.
		await expect( page.locator( '.smb-front-month' ) ).toHaveCount( 0 );
	} );

	// ============================================================
	// D) calendar_mode = 'month-grid' (admin 値) → 月グリッド
	// ============================================================

	test( "D) calendar_mode='month-grid' (admin 値) → DateSelect が月グリッドを描画する", async ( {
		page,
	} ) => {
		setOption( 'smart_booking_calendar_view_mode', 'month-grid' );
		seedWeekSlots();
		await gotoFrontForm( page );

		await expect(
			page.getByRole( 'heading', { name: '日付選択' } )
		).toBeVisible();
		await page.waitForSelector( '.smb-front-month', { timeout: 10_000 } );

		// 月グリッドは表示される.
		await expect( page.locator( '.smb-front-month' ) ).toBeVisible();
		// 日ストリップは表示されない.
		await expect( page.locator( '.smb-front-day-strip' ) ).toHaveCount( 0 );
	} );

	// ============================================================
	// E) End-to-End: 管理 UI で保存 → フロント再読込で反映
	// ============================================================

	test( 'E) End-to-End: 管理 UI で flow_order と calendar_mode を変更 → フロント再読込で反映される', async ( {
		page,
	} ) => {
		seedWeekSlots();

		// --- ベースライン: 何も設定していない場合の挙動を確認 ---
		// フロントで初期描画が「日付を選択」(=デフォルト 'A') であること.
		await gotoFrontForm( page );
		await expect(
			page.getByRole( 'heading', { name: '日付選択' } )
		).toBeVisible();

		// 月グリッドはデフォルト 'day_only' なので表示されない.
		await expect( page.locator( '.smb-front-day-strip' ) ).toBeVisible();
		await expect( page.locator( '.smb-front-month' ) ).toHaveCount( 0 );

		// --- 管理 UI で値を変更して保存 ---
		await bootstrapAdmin( page, 'settings' );
		await page.waitForSelector( '.smb-page--settings', { timeout: 15000 } );

		// 予約フロー: フォーム → 日付・時間 (form-first を選択).
		await page
			.locator(
				'input[name="smart_booking_booking_flow_order"][value="form-first"]'
			)
			.check();
		// カレンダー表示モード: 月表示のみ (month_only を選択).
		await page
			.locator(
				'input[name="smart_booking_calendar_view_mode"][value="month_only"]'
			)
			.check();

		await page.getByRole( 'button', { name: '基本設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '基本設定', { timeout: 6000 } );

		// 永続化されていることを管理 REST 経由で確認 (生の管理画面値が保存されている).
		const adminGet = await restCall( page, 'GET', 'settings' );
		expect( adminGet.data.settings.smart_booking_booking_flow_order ).toBe(
			'form-first'
		);
		expect( adminGet.data.settings.smart_booking_calendar_view_mode ).toBe(
			'month_only'
		);

		// --- フロントで反映を確認 ---
		await gotoFrontForm( page );

		// 公開 REST が翻訳して 'B' / 'month_only' を返すことを確認.
		const publicSettings = await page.evaluate( async () => {
			const ctx = window.smartBookingFrontend || {};
			const url =
				( ctx.restUrl || '/wp-json/smart-booking/v1/' ).replace(
					/\/$/,
					''
				) + '/public/settings';
			const res = await fetch( url, {
				credentials: 'same-origin',
				headers: {
					Accept: 'application/json',
					'X-WP-Nonce': ctx.nonce,
				},
			} );
			return res.json();
		} );
		expect( publicSettings.flow_order ).toBe( 'B' );
		expect( publicSettings.calendar_mode ).toBe( 'month_only' );

		// flow_order='B' なので MainInputPage 内でフォームセクションが先頭に来る.
		// MainInputPage は 1 画面統合のため見出しは非表示 (hideHeader=true) だが、
		// フォームセクション (.smb-front-main-page__section--form) が先頭に配置される.
		const sections = page.locator( '.smb-front-main-page__section' );
		await expect( sections.first() ).toHaveClass( /smb-front-main-page__section--form/ );
		// フォームの入力フィールドが表示されている.
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();
		// 日付選択セクションも DOM 上に存在するが、後に来る.
		await expect(
			page.locator( '.smb-front-date-section-head' )
		).toBeVisible();
	} );
} );
