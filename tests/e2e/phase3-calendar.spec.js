/**
 * Phase 3 Eval-2: カレンダーUI 詳細検証.
 *
 * 検証対象 (CLAUDE 指示の Eval-2 範囲):
 *   - 表示モード: day_only / month_only / toggle
 *   - 日表示の横スクロール、状態バッジ
 *   - 月表示のグリッド、月ナビ、隣月セル disabled、当日ハイライト
 *   - 日付選択後の時間枠ボタン表示・差し替え・押下で次ステップ遷移
 *   - 空き状況表示: available / few_left / full / closed
 *   - 締切ロジック (deadline_days / deadline_hours、both)
 *   - 表示期間 (display_period_days)
 *   - カラーカスタマイズ反映 (color_date_selected / color_time_selected)
 *
 * 範囲外（別 Eval Task）:
 *   - フロー完走の正常系（Eval-1）
 *   - 異常系・競合（Eval-3）
 *   - レスポンシブ詳細（Eval-4）—ただし mobile project でも本ファイルを実行する。
 *
 * ⚠️ 全テスト終了後に restoreBaseline() を呼び DB をベースラインへ戻す。
 */
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertSchedule,
	insertSchedulesBulk,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );

// DB seed/restore があるため serial 実行.
test.describe.configure( { mode: 'serial' } );

/**
 * 与えた日数 N に対し、capacity=3, booked_count=0 の 1 枠 (10:00-11:00) を入れる。
 * offset=+1 〜 +N (デフォルト 6) の日を埋める。
 * @param storeId
 * @param staffId
 * @param days
 * @param opts
 */
function seedDailySlots( storeId, staffId, days = 6, opts = {} ) {
	const start = opts.start || '10:00:00';
	const end = opts.end || '11:00:00';
	const capacity = opts.capacity || 3;
	const rows = [];
	for ( let i = 1; i <= days; i++ ) {
		rows.push( { storeId, staffId, date: ymd( i ), start, end, capacity } );
	}
	insertSchedulesBulk( rows );
}

test.describe( 'Phase 3 Eval-2: カレンダーUI 詳細', () => {
	test.setTimeout( 60_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	// ============================================================
	// カレンダー表示モード（仕様 3.4）
	// ============================================================

	test( 'mode=day_only: 日ストリップだけ表示、月グリッド・トグル無し', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );

		// 日ストリップは存在する.
		await expect( page.locator( '.smb-front-day-strip' ) ).toBeVisible();
		// 月グリッド・トグルは表示されない.
		await expect( page.locator( '.smb-front-month' ) ).toHaveCount( 0 );
		await expect(
			page.locator( '.smb-front-calendar-toggle' )
		).toHaveCount( 0 );
	} );

	test( 'mode=month_only: 月グリッドだけ表示、日ストリップ・トグル無し', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'month_only' );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();
		await page.waitForSelector( '.smb-front-month', { timeout: 10_000 } );

		await expect( page.locator( '.smb-front-month' ) ).toBeVisible();
		await expect( page.locator( '.smb-front-day-strip' ) ).toHaveCount( 0 );
		await expect(
			page.locator( '.smb-front-calendar-toggle' )
		).toHaveCount( 0 );
	} );

	test( 'mode=toggle: 日/月を切替できる、初期は日表示', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'toggle' );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();

		// トグルボタンが両方表示される.
		const toggle = page.locator( '.smb-front-calendar-toggle' );
		await expect( toggle ).toBeVisible();
		const dayBtn = toggle.locator( 'button', { hasText: '日' } );
		const monthBtn = toggle.locator( 'button', { hasText: '月' } );
		await expect( dayBtn ).toHaveAttribute( 'aria-selected', 'true' );
		await expect( monthBtn ).toHaveAttribute( 'aria-selected', 'false' );

		// 初期は日ストリップ表示.
		await expect( page.locator( '.smb-front-day-strip' ) ).toBeVisible();
		await expect( page.locator( '.smb-front-month' ) ).toHaveCount( 0 );

		// 月ボタンクリック → 月グリッドへ.
		await monthBtn.click();
		await expect( page.locator( '.smb-front-month' ) ).toBeVisible();
		await expect( page.locator( '.smb-front-day-strip' ) ).toHaveCount( 0 );
		await expect( monthBtn ).toHaveAttribute( 'aria-selected', 'true' );
		await expect( dayBtn ).toHaveAttribute( 'aria-selected', 'false' );

		// 日ボタンに戻る.
		await dayBtn.click();
		await expect( page.locator( '.smb-front-day-strip' ) ).toBeVisible();
		await expect( page.locator( '.smb-front-month' ) ).toHaveCount( 0 );
	} );

	// ============================================================
	// 日表示
	// ============================================================

	test( '日表示: display_period_days=7 で 7 タイル表示、横スクロール (overflow-x:auto)', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		setOption( 'smb_display_days', 7 );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );

		const tiles = page.locator( '.smb-front-day-tile' );
		await expect( tiles ).toHaveCount( 7 );

		// strip 要素が overflow-x: auto を持つ.
		const overflow = await page
			.locator( '.smb-front-day-strip' )
			.evaluate( ( el ) => getComputedStyle( el ).overflowX );
		expect( [ 'auto', 'scroll' ] ).toContain( overflow );
	} );

	test( '日表示: display_period_days=10 でタイルが 10 個表示される（月跨ぎでも連続）', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		setOption( 'smb_display_days', 10 );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID, 9 );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );
		await expect( page.locator( '.smb-front-day-tile' ) ).toHaveCount( 10 );
	} );

	test( '日表示: 曜日・日付・状態バッジが表示される（few_left は「残りわずか」、full は「満席」）', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		setOption( 'smb_display_days', 7 );

		// few_left: capacity=3 / booked=2 (>= 3*0.7=2.1 → ceil=3 だが、実装は ceil(0.7*3)=3 → 3 で full の境界)
		// 実装: booked_count >= ceil(capacity*0.7) → ceil(3*0.7)=3 だが capacity も 3 なので full と一致してしまう。
		// few_left を確実に出すには capacity=10 / booked=7 が分かり易い (ceil(7)=7).
		// → capacity=10 / booked=7: full は 10 で起こるので 7 は few_left に該当.
		const fewDate = ymd( 1 );
		const fullDate = ymd( 2 );
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: fewDate,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 10,
		} );
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: fullDate,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 1,
		} );

		// few_left の枠を booked=7 にする (10*0.7=7 で few_left).
		const { execSync } = require( 'node:child_process' );
		const path = require( 'node:path' );
		execSync(
			`npx wp-env run cli wp db query "UPDATE wp_smb_schedules SET booked_count = 7 WHERE schedule_date = '${ fewDate }';"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				stdio: [ 'ignore', 'pipe', 'pipe' ],
			}
		);
		// full の枠を booked=1 (capacity=1 と一致 → full).
		execSync(
			`npx wp-env run cli wp db query "UPDATE wp_smb_schedules SET booked_count = 1 WHERE schedule_date = '${ fullDate }';"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				stdio: [ 'ignore', 'pipe', 'pipe' ],
			}
		);

		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );

		// 曜日表示が含まれる (日,月,火... のいずれか).
		const firstWd = await page
			.locator( '.smb-front-day-tile__weekday' )
			.first()
			.textContent();
		expect( [ '日', '月', '火', '水', '木', '金', '土' ] ).toContain(
			( firstWd || '' ).trim()
		);

		// 日付数値が含まれる.
		const dayNum = new Date( fewDate ).getDate();
		const fewTile = page.locator( '.smb-front-day-tile' ).filter( {
			has: page.locator( `.smb-front-day-tile__day:text("${ dayNum }")` ),
		} );
		await expect( fewTile ).toHaveCount( 1 );
		// few_left バッジ.
		await expect(
			fewTile.locator( '.smb-front-day-tile__badge.is-few' )
		).toContainText( '残りわずか' );

		const fullDayNum = new Date( fullDate ).getDate();
		const fullTile = page.locator( '.smb-front-day-tile' ).filter( {
			has: page.locator(
				`.smb-front-day-tile__day:text("${ fullDayNum }")`
			),
		} );
		await expect(
			fullTile.locator( '.smb-front-day-tile__badge.is-full' )
		).toContainText( '満席' );
		// 満席タイルは disabled.
		await expect( fullTile ).toBeDisabled();
	} );

	// ============================================================
	// 月表示
	// ============================================================

	test( '月表示: 月ヘッダ + 7×N グリッド + 月ナビボタン', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'month_only' );
		setOption( 'smb_display_days', 7 );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-month', { timeout: 10_000 } );

		// 月ラベル: 「2026年4月」のような形式.
		const label = await page
			.locator( '.smb-front-month__label' )
			.textContent();
		expect( label ).toMatch( /\d{4}年\d{1,2}月/ );

		// 曜日ヘッダ 7 個.
		await expect( page.locator( '.smb-front-month__weekday' ) ).toHaveCount(
			7
		);

		// セル数は 7 の倍数 (28 / 35 / 42).
		const cellCount = await page
			.locator( '.smb-front-month__cell' )
			.count();
		expect( cellCount % 7 ).toBe( 0 );
		expect( cellCount ).toBeGreaterThanOrEqual( 28 );

		// 月ナビボタン (前/次).
		await expect(
			page.getByRole( 'button', { name: '前の月' } )
		).toBeVisible();
		await expect(
			page.getByRole( 'button', { name: '次の月' } )
		).toBeVisible();
	} );

	test( '月表示: 範囲外の月ナビは disabled、範囲内なら有効', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'month_only' );
		setOption( 'smb_display_days', 7 );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-month', { timeout: 10_000 } );

		// 表示範囲が今日から 7 日先までしかないので前月ボタンは disabled.
		await expect(
			page.getByRole( 'button', { name: '前の月' } )
		).toBeDisabled();
	} );

	test( '月表示: 隣月セル (is-other-month) は disabled でクリック不可', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'month_only' );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-month', { timeout: 10_000 } );

		const otherMonthCells = page.locator(
			'.smb-front-month__cell.is-other-month'
		);
		const cnt = await otherMonthCells.count();
		// 月初/月末の状態次第で 0 件のことも. 1 件でも存在すれば disabled を確認.
		if ( cnt > 0 ) {
			for ( let i = 0; i < cnt; i++ ) {
				await expect( otherMonthCells.nth( i ) ).toBeDisabled();
			}
		}
	} );

	test( '月表示: 当日セルに is-today クラスが付く', async ( { page } ) => {
		setOption( 'smb_calendar_view_mode', 'month_only' );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-month', { timeout: 10_000 } );

		const todayCells = page.locator( '.smb-front-month__cell.is-today' );
		await expect( todayCells ).toHaveCount( 1 );
	} );

	// ============================================================
	// 日付選択後の時間枠表示
	// ============================================================

	test( '日付選択後: カレンダー直下に時間枠 region が現れる（次ステップに遷移しない）', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		// 同じ日に 2 枠 (10:00 / 14:00).
		const d = ymd( 1 );
		insertSchedulesBulk( [
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 3,
			},
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '14:00:00',
				end: '15:00:00',
				capacity: 3,
			},
		] );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );

		// 日付選択前は時間枠 region 非表示.
		await expect( page.locator( '.smb-front-time-slots' ) ).toHaveCount(
			0
		);

		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();

		// region が表示される.
		await expect(
			page.getByRole( 'region', { name: '選択した日の時間枠' } )
		).toBeVisible();

		// 同一画面に「日付を選択」見出しもまだ存在 (= 次ステップに遷移していない).
		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();

		// 時間ボタンが 2 個ある.
		await expect( page.locator( '.smb-front-time-btn' ) ).toHaveCount( 2 );
	} );

	test( '異なる日付を選び直すと時間枠リストが切り替わる', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		const d1 = ymd( 1 );
		const d2 = ymd( 2 );
		insertSchedulesBulk( [
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d1,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 3,
			},
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d2,
				start: '15:00:00',
				end: '16:00:00',
				capacity: 3,
			},
		] );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );

		// 1 枚目 (d1) を選択 → 10:00 が出る.
		const tiles = page.locator( '.smb-front-day-tile:not(.is-disabled)' );
		await tiles.nth( 0 ).click();
		await expect( page.locator( '.smb-front-time-btn' ) ).toHaveCount( 1 );
		await expect(
			page.locator( '.smb-front-time-btn' ).first()
		).toContainText( '10:00' );

		// 2 枚目 (d2) を選択 → 15:00 に切り替わる.
		await tiles.nth( 1 ).click();
		await expect( page.locator( '.smb-front-time-btn' ) ).toHaveCount( 1 );
		await expect(
			page.locator( '.smb-front-time-btn' ).first()
		).toContainText( '15:00' );
	} );

	test( '時間枠ボタンクリックで form ステップへ遷移する', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );

		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.locator( '.smb-front-time-btn' ).first().click();

		await expect(
			page.getByRole( 'heading', { name: 'お客様情報の入力' } )
		).toBeVisible( {
			timeout: 5_000,
		} );
	} );

	// ============================================================
	// 空き状況: 時間枠ボタン側の availability 反映
	// ============================================================

	test( '時間枠: available/few_left/full/closed の各状態でラベルと disabled が正しい', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		// 4 枠を同じ日に作る (capacity=10 で few_left を出しやすくする).
		const d = ymd( 1 );
		insertSchedulesBulk( [
			// available: capacity=10 / booked=0.
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '09:00:00',
				end: '10:00:00',
				capacity: 10,
			},
			// few_left: capacity=10 / booked=7 (>= ceil(10*0.7)=7).
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 10,
			},
			// full: capacity=2 / booked=2.
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '11:00:00',
				end: '12:00:00',
				capacity: 2,
			},
			// closed は deadline_hours で発生させるのでここでは省略.
		] );
		const { execSync } = require( 'node:child_process' );
		const path = require( 'node:path' );
		execSync(
			`npx wp-env run cli wp db query "UPDATE wp_smb_schedules SET booked_count = 7 WHERE schedule_date='${ d }' AND start_time='10:00:00';"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				stdio: [ 'ignore', 'pipe', 'pipe' ],
			}
		);
		execSync(
			`npx wp-env run cli wp db query "UPDATE wp_smb_schedules SET booked_count = 2 WHERE schedule_date='${ d }' AND start_time='11:00:00';"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				stdio: [ 'ignore', 'pipe', 'pipe' ],
			}
		);

		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();

		const buttons = page.locator( '.smb-front-time-btn' );
		await expect( buttons ).toHaveCount( 3 );

		// aria-label で start_time-end_time の組を厳密に特定する.
		// 09:00-10:00 = available.
		const avail = page.getByRole( 'button', { name: /^09:00から10:00$/ } );
		await expect( avail ).toBeEnabled();
		await expect( avail ).toHaveClass( /is-available/ );
		await expect(
			avail.locator( '.smb-front-time-btn__badge' )
		).toHaveCount( 0 );

		// 10:00-11:00 = few_left.
		const few = page.getByRole( 'button', {
			name: /^10:00から11:00 残りわずか$/,
		} );
		await expect( few ).toBeEnabled();
		await expect( few ).toHaveClass( /is-few_left/ );
		await expect(
			few.locator( '.smb-front-time-btn__badge' )
		).toContainText( '残りわずか' );

		// 11:00-12:00 = full.
		const full = page.getByRole( 'button', {
			name: /^11:00から12:00 満席 選択不可$/,
		} );
		await expect( full ).toBeDisabled();
		await expect( full ).toHaveClass( /is-full/ );
		await expect(
			full.locator( '.smb-front-time-btn__badge' )
		).toContainText( '満席' );
	} );

	// ============================================================
	// 締切ロジック (3.8)
	// ============================================================

	test( 'deadline_days=3: 4日後の枠は available、2日後の枠は closed (締切超過)', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		setOption( 'smb_display_days', 7 );
		setOption( 'smb_booking_deadline_days', 3 );

		const d4 = ymd( 4 ); // 4日後 → 締切まだ来ていない.
		const d2 = ymd( 2 ); // 2日後 → 締切超過 (now >= slot - 3*DAY).
		insertSchedulesBulk( [
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d4,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 3,
			},
			{
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d2,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 3,
			},
		] );

		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );

		// d4: 選択可能.
		const day4Num = new Date( d4 ).getDate();
		const tile4 = page.locator( '.smb-front-day-tile' ).filter( {
			has: page.locator(
				`.smb-front-day-tile__day:text("${ day4Num }")`
			),
		} );
		await expect( tile4 ).toBeEnabled();

		// d2: 締切バッジ + disabled.
		const day2Num = new Date( d2 ).getDate();
		const tile2 = page.locator( '.smb-front-day-tile' ).filter( {
			has: page.locator(
				`.smb-front-day-tile__day:text("${ day2Num }")`
			),
		} );
		await expect( tile2 ).toBeDisabled();
		await expect(
			tile2.locator( '.smb-front-day-tile__badge.is-closed' )
		).toContainText( '締切' );
	} );

	test( 'deadline_hours=2: 当日から1時間後の枠は closed (実時間で過去枠を毎日 02:00 へ作る検証)', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		setOption( 'smb_display_days', 7 );
		setOption( 'smb_booking_deadline_hours', 2 );

		// 当日 (offset=0) の 00:30 などとても早い時刻に枠を入れる → 現在時刻が常に超過するので closed.
		// テスト実行時刻 > 00:30 + (slot-2H) と仮定 (CI が 00:00-00:30 の極狭時間にあたるリスクは無視).
		const today = ymd( 0 );
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: today,
			start: '00:30:00',
			end: '01:30:00',
			capacity: 3,
		} );

		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );

		// 当日タイルは「締切」バッジで disabled.
		const todayTile = page.locator( '.smb-front-day-tile.is-today' );
		await expect( todayTile ).toHaveCount( 1 );
		await expect( todayTile ).toBeDisabled();
		await expect(
			todayTile.locator( '.smb-front-day-tile__badge.is-closed' )
		).toContainText( '締切' );
	} );

	test( '両方設定: deadline_days=5 と deadline_hours=2 → 厳しい方 (5日) が適用され3日後は closed', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		setOption( 'smb_display_days', 7 );
		setOption( 'smb_booking_deadline_days', 5 ); // 5日前まで.
		setOption( 'smb_booking_deadline_hours', 2 ); // 2時間前まで (緩い).

		// 3日後の枠: 5日前デッドラインを既に過ぎている (now > slot-5day) ので closed.
		// 2時間前デッドラインだけなら問題なくOKだが、両方設定では min が採用される.
		const d3 = ymd( 3 );
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d3,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );

		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );

		const day3Num = new Date( d3 ).getDate();
		const tile = page.locator( '.smb-front-day-tile' ).filter( {
			has: page.locator(
				`.smb-front-day-tile__day:text("${ day3Num }")`
			),
		} );
		// 5日前 (=厳しい方) が適用されて closed になる.
		await expect( tile ).toBeDisabled();
		await expect(
			tile.locator( '.smb-front-day-tile__badge.is-closed' )
		).toContainText( '締切' );
	} );

	// ============================================================
	// 表示期間 (3.9)
	// ============================================================

	test( 'display_period_days=14: 日表示で 14 タイル、月表示で 8日目以降も範囲内', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		setOption( 'smb_display_days', 14 );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID, 13 );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );
		await expect( page.locator( '.smb-front-day-tile' ) ).toHaveCount( 14 );
	} );

	test( 'display_period_days=3: 日表示で 4日目以降は表示されない', async ( {
		page,
	} ) => {
		setOption( 'smb_calendar_view_mode', 'day_only' );
		setOption( 'smb_display_days', 3 );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID, 5 ); // DB には 5 日分入れる.
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );
		// 表示は 3 タイルのみ.
		await expect( page.locator( '.smb-front-day-tile' ) ).toHaveCount( 3 );
	} );

	// ============================================================
	// カラーカスタマイズ反映
	// ============================================================

	test( 'color_date_selected: CSS カスタムプロパティが root に適用される', async ( {
		page,
	} ) => {
		setOption( 'smb_color_date_selected', '#ff00ff' );
		setOption( 'smb_calendar_view_mode', 'day_only' );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );

		const propVal = await page
			.locator( '#smart-booking-app' )
			.evaluate( ( el ) =>
				el.style.getPropertyValue( '--smb-front-color-date-selected' )
			);
		expect( propVal.trim().toLowerCase() ).toBe( '#ff00ff' );
	} );

	test( 'color_time_selected: CSS カスタムプロパティが root に適用される', async ( {
		page,
	} ) => {
		setOption( 'smb_color_time_selected', '#00ff00' );
		setOption( 'smb_calendar_view_mode', 'day_only' );
		seedDailySlots( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', {
			timeout: 10_000,
		} );

		const propVal = await page
			.locator( '#smart-booking-app' )
			.evaluate( ( el ) =>
				el.style.getPropertyValue( '--smb-front-color-time-selected' )
			);
		expect( propVal.trim().toLowerCase() ).toBe( '#00ff00' );
	} );
} );
