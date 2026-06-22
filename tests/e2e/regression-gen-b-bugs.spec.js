/**
 * Gen-B 修正のリグレッションテスト。
 *
 * 検証項目:
 *  1. 重複登録防止 (バックエンド + UI)
 *     - 同一 (店舗, 担当者, 日付, 開始時刻) の重複 POST が二重作成されない
 *     - レスポンスに created/updated/skipped カウントが含まれる
 *     - フロント追加モーダルで既存時間がグレーアウト + 警告表示
 *  2. 予約付き既存枠の保護
 *     - booked_count > 0 の枠は重複 POST で skipped に入り capacity が変わらない
 *  3. 隣月セルクリック
 *     - 隣月日付クリック時、月見出しは変わらない
 *     - 追加モーダルに正しく日付が渡る
 *     - 隣月セルが is-other-month クラスを保ったまま残数表示する
 *  4. スケジュール一覧テーブル化
 *     - <table> 要素を含む
 *     - 8カラムのヘッダーがある
 *     - 編集/コピー/削除ボタンが存在
 *     - モバイル幅で横スクロール可能
 */
const { test, expect } = require( '@playwright/test' );
const {
	bootstrapAdmin,
	restCall,
	restoreSnapshot,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase2-helpers' );
const path = require( 'node:path' );
const { execSync } = require( 'node:child_process' );

// 来月 15 日。テストに使う日付（重複系・テーブル系）。
function nextMonth15() {
	const d = new Date();
	d.setMonth( d.getMonth() + 1 );
	d.setDate( 15 );
	return (
		d.getFullYear() +
		'-' +
		String( d.getMonth() + 1 ).padStart( 2, '0' ) +
		'-' +
		String( d.getDate() ).padStart( 2, '0' )
	);
}

// 当月の月初 + 翌月初（隣月クリックテスト用）。
function currentMonthFirst() {
	const d = new Date();
	d.setDate( 1 );
	return d;
}

function nextMonthFirstYmd() {
	const d = currentMonthFirst();
	d.setMonth( d.getMonth() + 1 );
	return (
		d.getFullYear() +
		'-' +
		String( d.getMonth() + 1 ).padStart( 2, '0' ) +
		'-' +
		String( d.getDate() ).padStart( 2, '0' )
	);
}

// DB 直接クエリ。
function dbQuery( sql ) {
	return execSync(
		`npx wp-env run cli wp db query "${ sql }" --skip-column-names`,
		{
			cwd: path.resolve( __dirname, '..', '..' ),
			encoding: 'utf8',
			stdio: [ 'ignore', 'pipe', 'pipe' ],
			timeout: 30000,
		}
	);
}

test.describe.configure( { mode: 'default' } );

test.describe( 'Gen-B リグレッション: 重複登録防止 + 隣月対応 + テーブル化', () => {
	test.beforeEach( async ( { page } ) => {
		restoreSnapshot();
		await bootstrapAdmin( page, 'schedule' );
		await page.goto( '/wp-admin/admin.php?page=smart-booking' );
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
	} );

	test.afterAll( () => {
		restoreSnapshot();
	} );

	// ---------------------------------------------------------------
	// テスト1: 重複登録防止 (API レベル)
	// ---------------------------------------------------------------
	test( '重複登録防止: 同一 (店舗,担当者,日付,開始時刻) は created -> updated に変わる', async ( {
		page,
	} ) => {
		const targetDate = nextMonth15();

		// 1回目: 新規 capacity=2.
		const r1 = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: targetDate,
					start_time: '10:00',
					end_time: '11:00',
					capacity: 2,
				},
			],
		} );
		expect( r1.ok ).toBeTruthy();
		expect( r1.data.created ).toBe( 1 );
		expect( r1.data.updated || 0 ).toBe( 0 );
		expect( r1.data.skipped || 0 ).toBe( 0 );

		// 2回目: 同 payload + capacity=5 で送信. 予約なしなので updated=1 のはず.
		const r2 = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: targetDate,
					start_time: '10:00',
					end_time: '11:00',
					capacity: 5,
				},
			],
		} );
		expect( r2.ok ).toBeTruthy();
		expect( r2.data.created ).toBe( 0 );
		expect( r2.data.updated ).toBe( 1 );
		expect( r2.data.skipped ).toBe( 0 );

		// DB: 1 行のみ存在。capacity が 5 に上書きされている。
		const out = dbQuery(
			`SELECT COUNT(*), MAX(capacity) FROM wp_smabo_schedules WHERE schedule_date='${ targetDate }' AND start_time='10:00:00';`
		);
		const m = out.match( /(\d+)\s+(\d+)/ );
		expect( m ).not.toBeNull();
		expect( Number( m[ 1 ] ) ).toBe( 1 );
		expect( Number( m[ 2 ] ) ).toBe( 5 );
	} );

	// ---------------------------------------------------------------
	// テスト2: 予約付き既存枠の保護
	// ---------------------------------------------------------------
	test( '予約付き既存枠: 重複 POST は skipped に分類され capacity が変わらない', async ( {
		page,
	} ) => {
		const targetDate = nextMonth15();

		// セットアップ: capacity=1 の枠を 1 件作る → booked_count=1 にする.
		dbQuery(
			`INSERT INTO wp_smabo_schedules (store_id, staff_id, schedule_date, start_time, end_time, capacity, booked_count, is_active, created_at, updated_at) VALUES (${ USER_STORE_ID }, ${ USER_STAFF_ID }, '${ targetDate }', '14:00:00', '15:00:00', 1, 1, 1, NOW(), NOW());`
		);

		// 同じ枠を再 POST.
		const r = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: targetDate,
					start_time: '14:00',
					end_time: '15:00',
					capacity: 99, // 変更しようとするが skipped となるはず.
				},
			],
		} );
		expect( r.ok ).toBeTruthy();
		expect( r.data.created ).toBe( 0 );
		expect( r.data.updated ).toBe( 0 );
		expect( r.data.skipped ).toBe( 1 );

		// DB: capacity も booked_count も変わっていないこと.
		const out = dbQuery(
			`SELECT capacity, booked_count FROM wp_smabo_schedules WHERE schedule_date='${ targetDate }' AND start_time='14:00:00';`
		);
		const m = out.match( /(\d+)\s+(\d+)/ );
		expect( m ).not.toBeNull();
		expect( Number( m[ 1 ] ) ).toBe( 1 );
		expect( Number( m[ 2 ] ) ).toBe( 1 );
	} );

	// ---------------------------------------------------------------
	// テスト3: 重複登録防止 (UI レベル) - 既存時間がグレーアウト
	// ---------------------------------------------------------------
	test( 'UI: 既存登録済み時間は追加モーダル内でグレーアウト + 警告表示', async ( { page } ) => {
		// loadSchedules は currentMonth ±7日 を取得するため、当月内の日付を使う必要がある.
		// 今日の日付を使えば必ず取得範囲に入る.
		const today = new Date();
		const targetDate =
			today.getFullYear() +
			'-' +
			String( today.getMonth() + 1 ).padStart( 2, '0' ) +
			'-' +
			String( today.getDate() ).padStart( 2, '0' );

		// 既存スケジュールを 1 件作成 (10:00).
		await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: targetDate,
					start_time: '10:00',
					end_time: '11:00',
					capacity: 2,
				},
			],
		} );

		// ページをリロードして再取得.
		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
		// 取得完了 (テーブルに行が出るまで) を待つ.
		await page.waitForSelector(
			'.smb-schedule-table-flat tbody tr',
			{ timeout: 10000 }
		);

		// 「スケジュールを追加」モーダルを開く.
		await page
			.locator( '.smb-page__actions .smb-btn--primary' )
			.first()
			.click();
		await page.waitForSelector( '.smb-modal', { timeout: 5000 } );

		// 日付を入力 (date input). 今日の日付が defaultDate なので既に入っているはずだが念のため.
		await page
			.locator( '#smb-schedule-date' )
			.fill( targetDate );

		// 店舗・担当者は既に1つだけなので自動選択されている (defaultStoreId/defaultStaffId).
		// 既存スケジュール (10:00) がある日付でモーダルを開くと、編集モードで既存スロットがロードされる.
		// モーダルタイトルが「スケジュールを設定」であり、既存スロットが1行目に表示されることを期待.
		await expect(
			page.locator( '.smb-modal__title', { hasText: 'スケジュールを設定' } )
		).toBeVisible();
		// 既存スケジュールの注意メッセージが表示される.
		await expect(
			page.locator( '.smb-schedule-form__notice' )
		).toBeVisible();
		// 1 行目: 既存 10:00 スロット（id あり・編集行）が表示される.
		const firstRow = page.locator( '.smb-slot-editor__list li' ).first();
		await expect( firstRow ).toBeVisible();
		// start_time が 10:00 の input が表示されている.
		await expect( firstRow.locator( 'input[type="time"]' ) ).toHaveValue( '10:00' );

		// 「時間枠を追加」を押して 11:00 (新規) 行を追加.
		await page
			.locator( 'button.smb-btn--secondary', { hasText: '時間枠を追加' } )
			.click();

		// 2 行目 (新規行) が追加される.
		const secondRow = page.locator( '.smb-slot-editor__list li' ).nth( 1 );
		await expect( secondRow ).toBeVisible();

		// 「保存」ボタンをクリックして送信. レスポンスを傍受.
		const responsePromise = page.waitForResponse(
			( res ) =>
				/\/wp-json\/smart-booking\/v1\/schedules$/.test( res.url() ) &&
				res.request().method() === 'POST',
			{ timeout: 10000 }
		);
		await page
			.locator( '.smb-modal__footer .smb-btn--primary' )
			.click();
		const resp = await responsePromise;
		const body = await resp.json();

		// 既存 10:00 行はフロント側で送信から除外される設計のため、items=1 件のみ送信.
		// → created=1, updated=0, skipped=0 を期待.
		expect( body.created ).toBe( 1 );
		expect( body.updated || 0 ).toBe( 0 );
		expect( body.skipped || 0 ).toBe( 0 );

		// DB: 10:00 はそのまま (capacity=2)、11:00 が新規追加で計 2 行.
		const out = dbQuery(
			`SELECT COUNT(*) FROM wp_smabo_schedules WHERE schedule_date='${ targetDate }';`
		);
		const m = out.match( /(\d+)/ );
		expect( m ).not.toBeNull();
		expect( Number( m[ 1 ] ) ).toBe( 2 );

		const cap10 = dbQuery(
			`SELECT capacity FROM wp_smabo_schedules WHERE schedule_date='${ targetDate }' AND start_time='10:00:00';`
		);
		expect( Number( cap10.match( /(\d+)/ )[ 1 ] ) ).toBe( 2 );
	} );

	// ---------------------------------------------------------------
	// テスト4: 隣月セルクリック (月見出し変わらず、隣月日付に状態が乗る)
	// ---------------------------------------------------------------
	test( '隣月セル: クリックしても月見出しは変わらず、追加モーダルに渡る', async ( { page } ) => {
		// 当月の月見出しを取得.
		const monthHeadingBefore = await page
			.locator( '.smb-schedule-toolbar__month' )
			.textContent();
		expect( monthHeadingBefore ).toBeTruthy();

		// 隣月セル (.is-other-month) を1つクリック.
		const otherMonthCells = page.locator(
			'.smb-calendar__cell.is-other-month'
		);
		await expect( otherMonthCells.first() ).toBeVisible();
		const otherMonthCount = await otherMonthCells.count();
		expect( otherMonthCount ).toBeGreaterThan( 0 );

		// クリック対象の aria-label から日付を取得.
		const target = otherMonthCells.first();
		const ariaLabel = await target.getAttribute( 'aria-label' );
		// ex: "2026-05-01 を選択"
		const ymdMatch = ariaLabel.match( /(\d{4}-\d{2}-\d{2})/ );
		expect( ymdMatch ).not.toBeNull();
		const otherYmd = ymdMatch[ 1 ];

		await target.click();

		// 月見出しが変わっていない (隣月への自動ジャンプが無い).
		const monthHeadingAfter = await page
			.locator( '.smb-schedule-toolbar__month' )
			.textContent();
		expect( monthHeadingAfter ).toBe( monthHeadingBefore );

		// セル自体が is-other-month を保っている.
		await expect( target ).toHaveClass( /is-other-month/ );

		// 「スケジュールを追加」をページヘッダから押す → モーダル日付に隣月の日付が入る.
		await page
			.locator( '.smb-page__actions .smb-btn--primary' )
			.first()
			.click();
		await page.waitForSelector( '.smb-modal', { timeout: 5000 } );
		const dateInput = page.locator( '#smb-schedule-date' );
		await expect( dateInput ).toHaveValue( otherYmd );

		// モーダルを閉じる.
		await page
			.locator( '.smb-modal__footer .smb-btn--secondary' )
			.click();
	} );

	// ---------------------------------------------------------------
	// テスト5: 隣月日付にスケジュールがある場合、薄く残数表示
	// ---------------------------------------------------------------
	test( '隣月日付: スケジュール存在時は is-other-month のまま残数バッジ表示', async ( {
		page,
	} ) => {
		// 翌月初の日付に直接スケジュールを 1 件 INSERT.
		const otherYmd = nextMonthFirstYmd();
		dbQuery(
			`INSERT INTO wp_smabo_schedules (store_id, staff_id, schedule_date, start_time, end_time, capacity, booked_count, is_active, created_at, updated_at) VALUES (${ USER_STORE_ID }, ${ USER_STAFF_ID }, '${ otherYmd }', '13:00:00', '14:00:00', 3, 0, 1, NOW(), NOW());`
		);

		// ページをリロード.
		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
		// データ取得完了を待つ. ScheduleList セクションのテーブル or empty state が出るまで.
		await page.waitForFunction(
			() =>
				!! document.querySelector( '.smb-schedule-table-flat' ) ||
				!! document.querySelector( '.smb-schedule-list--empty' ),
			null,
			{ timeout: 10000 }
		);

		// 翌月初の隣月セルを特定 (aria-label).
		const cell = page.locator(
			`.smb-calendar__cell[aria-label="${ otherYmd } を選択"]`
		);
		await expect( cell ).toBeVisible();
		await expect( cell ).toHaveClass( /is-other-month/ );
		await expect( cell ).toHaveClass( /has-schedules/ );

		// 残数表示 (.smb-calendar__tag) が描画されている.
		const tag = cell.locator( '.smb-calendar__tag' );
		await expect( tag ).toBeVisible();
		// 隣月セル独自のスタイル: .smb-calendar__summary が opacity < 1 で薄く表示.
		const summary = cell.locator( '.smb-calendar__summary' );
		const opacity = await summary.evaluate( ( el ) =>
			parseFloat( window.getComputedStyle( el ).opacity )
		);
		expect( opacity ).toBeLessThan( 1.0 );
	} );

	// ---------------------------------------------------------------
	// テスト6: スケジュール一覧テーブル化
	// ---------------------------------------------------------------
	test( 'ScheduleList: <table> 構造 + 8 カラムヘッダー + 操作ボタン', async ( {
		page,
	} ) => {
		const targetDate = nextMonth15();

		// 当月にスケジュールを2件作成 (テスト3と日付重ならぬよう11:00,12:00).
		// nextMonth15 は当月リストには載らないので「現在月」の日付を使う.
		const today = new Date();
		const ymdToday =
			today.getFullYear() +
			'-' +
			String( today.getMonth() + 1 ).padStart( 2, '0' ) +
			'-' +
			String( today.getDate() ).padStart( 2, '0' );

		await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: ymdToday,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 1,
				},
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: ymdToday,
					start_time: '11:00',
					end_time: '12:00',
					capacity: 2,
				},
			],
		} );

		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );

		// ScheduleList セクションが <table> を含む.
		const tableWrap = page.locator( '.smb-schedule-table-wrap' );
		await expect( tableWrap ).toBeVisible();
		const table = tableWrap.locator( 'table.smb-schedule-table-flat' );
		await expect( table ).toBeVisible();

		// ヘッダーカラム: 日付/時間/店舗/担当者/定員/予約/状態/操作.
		const headers = await table.locator( 'thead th' ).allTextContents();
		expect( headers ).toEqual( [
			'日付',
			'時間',
			'店舗',
			'担当者',
			'定員',
			'予約',
			'状態',
			'操作',
		] );

		// 行が 2 件以上.
		const rowCount = await table.locator( 'tbody tr' ).count();
		expect( rowCount ).toBeGreaterThanOrEqual( 2 );

		// 操作ボタン: 編集/コピー/削除がある (グループ先頭行のみだが少なくとも1組).
		const editBtn = table.locator( 'button.smb-link-btn', { hasText: '編集' } );
		const copyBtn = table.locator( 'button.smb-link-btn', { hasText: 'コピー' } );
		const deleteBtn = table.locator( 'button.smb-link-btn', { hasText: '削除' } );
		await expect( editBtn.first() ).toBeVisible();
		await expect( copyBtn.first() ).toBeVisible();
		await expect( deleteBtn.first() ).toBeVisible();
	} );

	// ---------------------------------------------------------------
	// テスト7: モバイル幅でテーブルが横スクロール可能
	// ---------------------------------------------------------------
	test( 'ScheduleList モバイル: テーブルが横スクロール (overflow-x)', async ( {
		page,
	} ) => {
		const today = new Date();
		const ymdToday =
			today.getFullYear() +
			'-' +
			String( today.getMonth() + 1 ).padStart( 2, '0' ) +
			'-' +
			String( today.getDate() ).padStart( 2, '0' );

		await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: ymdToday,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 1,
				},
			],
		} );

		await page.reload();
		await page.waitForSelector( '.smb-schedule-table-wrap', { timeout: 15000 } );

		// モバイル幅にリサイズ.
		await page.setViewportSize( { width: 375, height: 667 } );
		await page.waitForTimeout( 200 );

		const wrap = page.locator( '.smb-schedule-table-wrap' );
		await expect( wrap ).toBeVisible();

		const overflowX = await wrap.evaluate(
			( el ) => window.getComputedStyle( el ).overflowX
		);
		// auto / scroll のいずれかであれば OK.
		expect( [ 'auto', 'scroll' ] ).toContain( overflowX );
	} );
} );
