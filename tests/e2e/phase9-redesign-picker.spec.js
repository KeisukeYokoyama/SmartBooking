/**
 * Phase 9 Eval-3: フロント予約フォーム リデザイン（日付・時間ピッカー）検証。
 *
 * 仕様: docs/legacy-ui-handover/spec-amendment-frontend-redesign.md
 *   - 変更3: UIコンポーネント仕様（日/月トグル / 日表示 / 月表示 / 時間スロット）
 *
 * 検証範囲（動作面・構造面のみ。色のアサートは Eval-2 既出のためスキップ）:
 *   1) 日/月トグル表示・切替動作（calendar_mode='toggle' 時）
 *   2) 日表示: カードリスト表示 + 選択で .is-selected 付与
 *   3) 月表示: 7列グリッド + 曜日ヘッダー + 月ナビボタン + 選択で .is-selected 付与
 *   4) 日付選択後に時間スロットが表示される（縦並び）
 *   5) 時間スロットを選択すると .is-selected が付与される
 *   6) 満席時間枠は disabled かつ「×」プレフィックス付き
 *   7) calendar_mode='month_only' でフロント初期表示が月表示になる
 *
 * NOTE:
 *   - phase3-helpers の restoreBaseline は smb_calendar_view_mode を delete するため、
 *     option 変更後に他テストへ影響しない設計（毎テスト先頭で restoreBaseline）。
 *   - serial 実行 (workers=1 は playwright.config.js で強制済) を前提。
 */
const { test, expect } = require( '@playwright/test' );
const { execSync } = require( 'node:child_process' );
const path = require( 'node:path' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertSchedulesBulk,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );

test.describe.configure( { mode: 'serial' } );

/**
 * wp-env CLI 実行（ローカル定義: phase3-helpers から wpCli は export されていない）。
 *
 * @param {string} cmd
 * @return {string}
 */
function wpCli( cmd ) {
	return execSync( `npx wp-env run cli ${ cmd }`, {
		cwd: path.resolve( __dirname, '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
		timeout: 60_000,
	} );
}

/**
 * 今日から 1〜5 日後までの 10:00-11:00 / 14:00-15:00 スケジュールを投入する。
 */
function seedSchedules( capacity = 3 ) {
	const rows = [];
	for ( let i = 1; i <= 5; i++ ) {
		const d = ymd( i );
		rows.push( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity,
		} );
		rows.push( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '14:00:00',
			end: '15:00:00',
			capacity,
		} );
	}
	insertSchedulesBulk( rows );
}

test.describe( 'Phase 9 Eval-3: 日付・時間ピッカー検証', () => {
	test.setTimeout( 60_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	// ---- 1) 日/月トグル表示・切替 ----

	test( 'calendar_mode=toggle: 日/月トグルが表示され、クリックで日表示⇔月表示が切替わる', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'toggle' );
		seedSchedules();
		await gotoFrontForm( page );

		// 日付タイル描画完了まで待機.
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );

		// トグルが表示され、ボタンが2つある.
		const toggle = page.locator( '.smb-front-calendar-toggle' );
		await expect( toggle ).toBeVisible();
		const toggleBtns = toggle.locator( 'button' );
		await expect( toggleBtns ).toHaveCount( 2 );
		await expect( toggleBtns.nth( 0 ) ).toHaveText( /^日$/ );
		await expect( toggleBtns.nth( 1 ) ).toHaveText( /^月$/ );

		// 初期は日表示: .smb-front-date-list が見えて .smb-front-month-grid は無い.
		await expect( page.locator( '.smb-front-date-list' ) ).toBeVisible();
		await expect( page.locator( '.smb-front-month-grid' ) ).toHaveCount( 0 );

		// 「月」をクリック → 月表示に切替.
		await page.getByRole( 'tab', { name: '月表示に切り替え' } ).click();
		await expect( page.locator( '.smb-front-month-grid' ) ).toBeVisible();
		await expect( page.locator( '.smb-front-date-list' ) ).toHaveCount( 0 );

		// 「日」をクリック → 日表示に戻る.
		await page.getByRole( 'tab', { name: '日表示に切り替え' } ).click();
		await expect( page.locator( '.smb-front-date-list' ) ).toBeVisible();
		await expect( page.locator( '.smb-front-month-grid' ) ).toHaveCount( 0 );
	} );

	// ---- 2) 日表示: 横並びカード + 選択 ----

	test( '日表示: 複数の日付カードが表示され、クリックで .is-selected が付与される', async ( {
		page,
	} ) => {
		seedSchedules(); // calendar_mode=day_only (デフォルト)
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );

		// 日付カードが複数（display_period_days=7 がデフォルト）.
		const cards = page.locator( '.smb-front-date-card' );
		const count = await cards.count();
		expect( count ).toBeGreaterThanOrEqual( 5 );

		// 選択前は誰も .is-selected を持たない.
		await expect( page.locator( '.smb-front-day-tile.is-selected' ) ).toHaveCount( 0 );

		// 1つクリック → .is-selected が1つ付与.
		const target = page
			.locator( '.smb-front-day-tile:not(.is-disabled):not(:disabled)' )
			.first();
		await target.click();

		const selected = page.locator( '.smb-front-day-tile.is-selected' );
		await expect( selected ).toHaveCount( 1 );
		await expect( selected ).toHaveAttribute( 'aria-pressed', 'true' );
		// 色アサートは Eval-2 既出のためスキップ.
	} );

	// ---- 3) 月表示: 7列グリッド + 曜日ヘッダー + ナビボタン ----

	test( '月表示: 7列グリッド・曜日ヘッダー（日月火水木金土）・前後月ナビボタン・日付選択', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'month_only' );
		seedSchedules();
		await gotoFrontForm( page );

		// 月グリッド表示まで待機.
		await page.waitForSelector( '.smb-front-month-grid', { timeout: 10_000 } );

		// 曜日ヘッダー: 7セル、テキストは「日月火水木金土」.
		const weekdays = page.locator( '.smb-front-month__weekday' );
		await expect( weekdays ).toHaveCount( 7 );
		const weekdayTexts = await weekdays.allTextContents();
		expect( weekdayTexts.map( ( t ) => t.trim() ) ).toEqual( [
			'日',
			'月',
			'火',
			'水',
			'木',
			'金',
			'土',
		] );

		// ナビボタン: 前月・次月 の2つ.
		const navBtns = page.locator( '.smb-front-month-nav' );
		await expect( navBtns ).toHaveCount( 2 );
		await expect( page.getByRole( 'button', { name: '前の月' } ) ).toBeVisible();
		await expect( page.getByRole( 'button', { name: '次の月' } ) ).toBeVisible();

		// 選択可能セル（disabled でも other-month でも out-of-range でもない）が1件以上ある.
		const selectableCells = page.locator(
			'.smb-front-month-cell:not(.is-disabled):not(.is-other-month):not(.is-out-of-range)'
		);
		const selectableCount = await selectableCells.count();
		expect( selectableCount ).toBeGreaterThanOrEqual( 1 );

		// 1つクリック → .is-selected 付与.
		await selectableCells.first().click();
		const selected = page.locator( '.smb-front-month-cell.is-selected' );
		await expect( selected ).toHaveCount( 1 );
		await expect( selected ).toHaveAttribute( 'aria-pressed', 'true' );
	} );

	// ---- 4) 日付選択後に時間スロットが表示される（縦並び） ----

	test( '日付未選択時は時間スロットなし → 日付選択で時間スロット縦並び表示', async ( {
		page,
	} ) => {
		seedSchedules();
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );

		// 日付未選択時: 時間スロットは非表示（time region 自体が DOM に無い）.
		await expect( page.locator( '.smb-front-time-slot' ) ).toHaveCount( 0 );

		// 日付選択.
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled):not(:disabled)' )
			.first()
			.click();

		// 時間スロットが2件（10:00-11:00 / 14:00-15:00）表示される.
		const slots = page.locator( '.smb-front-time-slot' );
		await expect( slots ).toHaveCount( 2 );

		// 縦並び: 各スロットの y 座標が異なり、x 座標がほぼ同じ.
		const boxes = await Promise.all(
			( await slots.all() ).map( ( s ) => s.boundingBox() )
		);
		const validBoxes = boxes.filter( Boolean );
		expect( validBoxes.length ).toBe( 2 );
		expect( Math.abs( validBoxes[ 0 ].x - validBoxes[ 1 ].x ) ).toBeLessThan( 4 );
		expect( Math.abs( validBoxes[ 0 ].y - validBoxes[ 1 ].y ) ).toBeGreaterThanOrEqual( 20 );
	} );

	// ---- 5) 時間スロット選択 ----

	test( '時間スロットをクリックすると .is-selected が付与される', async ( { page } ) => {
		seedSchedules();
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled):not(:disabled)' )
			.first()
			.click();

		await page.waitForSelector( '.smb-front-time-slot', { timeout: 10_000 } );

		// 選択前は誰も .is-selected を持たない.
		await expect( page.locator( '.smb-front-time-slot.is-selected' ) ).toHaveCount( 0 );

		// 1つクリック.
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		const selected = page.locator( '.smb-front-time-slot.is-selected' );
		await expect( selected ).toHaveCount( 1 );
		await expect( selected ).toHaveAttribute( 'aria-pressed', 'true' );
		// 色アサートは Eval-2 既出のためスキップ.
	} );

	// ---- 6) 満席の時間枠が無効表示（× プレフィックス + disabled） ----

	test( '満席の時間枠は disabled かつ「×」プレフィックスが含まれる', async ( {
		page,
	} ) => {
		// capacity=1 の枠を 1つ作って、reservation を 1件 INSERT して満席にする.
		const dateStr = ymd( 1 );
		insertSchedulesBulk( [
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: dateStr,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 1,
			},
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: dateStr,
				start: '14:00:00',
				end: '15:00:00',
				capacity: 3,
			},
		] );
		// 該当枠を満席状態にする (booked_count = capacity).
		wpCli(
			`wp db query "UPDATE wp_smb_schedules SET booked_count=1 WHERE schedule_date='${ dateStr }' AND start_time='10:00:00';"`
		);

		try {
			await gotoFrontForm( page );

			await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
				timeout: 10_000,
			} );
			// 該当日付（今日+1）を選ぶ.
			await page
				.locator( '.smb-front-day-tile:not(.is-disabled):not(:disabled)' )
				.first()
				.click();

			await page.waitForSelector( '.smb-front-time-slot', { timeout: 10_000 } );

			// 満席スロット = is-full クラスが付くはず.
			const fullSlot = page.locator( '.smb-front-time-slot.is-full' ).first();
			await expect( fullSlot ).toBeVisible();
			await expect( fullSlot ).toBeDisabled();

			// テキスト内に「×」が含まれていること.
			const slotText = await fullSlot.textContent();
			expect( slotText ).toContain( '×' );

			// 14:00 のスロット（capacity=3, booked=0）は通常通り選択可能.
			const okSlot = page.getByRole( 'button', { name: /14:00から15:00/ } );
			await expect( okSlot ).toBeEnabled();
		} finally {
			// fixture 復元（restoreBaseline でも消えるが念のため）.
			wpCli(
				`wp db query "DELETE FROM wp_smb_schedules WHERE schedule_date='${ dateStr }';"`
			);
		}
	} );

	// ---- 7) calendar_mode=month_only で月表示が初期表示 ----

	test( 'calendar_mode=month_only: フロント初期表示で月グリッドが表示される', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'month_only' );
		seedSchedules();
		await gotoFrontForm( page );

		// 月グリッドが初期から見える.
		await expect( page.locator( '.smb-front-month-grid' ) ).toBeVisible();
		// 日表示は描画されていない.
		await expect( page.locator( '.smb-front-date-list' ) ).toHaveCount( 0 );
		// トグルも出ない（toggle モードではないため）.
		await expect( page.locator( '.smb-front-calendar-toggle' ) ).toHaveCount( 0 );
		// afterEach の restoreBaseline で smb_calendar_view_mode は delete される.
	} );
} );
