/**
 * Gen-A 修正: 管理画面外観 + スケジュールUI軽微修正の視覚回帰テスト。
 *
 * 検証項目:
 * 1. ロゴ: docs/images/SmartBookingLogo.svg がヘッダーに表示される
 * 2. ヘッダー上部: .smb-app__header と #wpadminbar の間に隙間がない（±2px 許容）
 * 3. 背景色: 管理画面の .smb-app の背景が #f0f0f1
 * 4. トースト: 背景 #EEFF81 / 文字色 #1d2327 / border なし、右下表示
 * 5. SchedulePage ヘッダー: 「表示期間/締切」「スケジュールをコピー」が消え
 *    「スケジュールを追加」だけが残っている
 * 6. パターンコピーモード: 期間選択UI に上下マージン
 * 7. カレンダーセル: 残り枠表示が「残り○」形式
 * 8. 個別コピー: 日付ピッカー選択で自動リスト追加 / 「日付を追加」ボタンなし
 */
const { test, expect } = require( '@playwright/test' );
const {
	bootstrapAdmin,
	restCall,
	restoreSnapshot,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase2-helpers' );

test.describe.configure( { mode: 'default' } );

test.describe( 'Gen-A 視覚回帰: 管理画面外観 + スケジュールUI', () => {
	test.beforeEach( async ( { page } ) => {
		restoreSnapshot();
		await bootstrapAdmin( page, 'schedule' );
		await page.goto( '/wp-admin/admin.php?page=smart-booking' );
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
	} );

	test.afterAll( () => {
		restoreSnapshot();
	} );

	test( 'ロゴ: SmartBookingLogo.svg がヘッダーに表示される', async ( {
		page,
	} ) => {
		const logo = page.locator( '.smb-app__header img.smb-app__brand-logo' );
		await expect( logo ).toBeVisible();
		const src = await logo.getAttribute( 'src' );
		expect( src ).toContain( 'SmartBookingLogo.svg' );
		// アクセス可能であること。
		const status = await page.evaluate( async ( s ) => {
			const r = await fetch( s, { method: 'GET' } );
			return r.status;
		}, src );
		expect( status ).toBe( 200 );
		await page.screenshot( {
			path: `test-results/regression-gen-a-logo-${ test.info().project.name }.png`,
			fullPage: false,
		} );
	} );

	test( 'ヘッダー上部マージン: smb-app__header と #wpadminbar の間に隙間なし', async ( {
		page,
	} ) => {
		const gap = await page.evaluate( () => {
			const bar = document.querySelector( '#wpadminbar' );
			const header = document.querySelector( '.smb-app__header' );
			if ( ! bar || ! header ) return null;
			const barRect = bar.getBoundingClientRect();
			const headerRect = header.getBoundingClientRect();
			return headerRect.top - barRect.bottom;
		} );
		expect( gap ).not.toBeNull();
		expect( Math.abs( gap ) ).toBeLessThanOrEqual( 2 );
		await page.screenshot( {
			path: `test-results/regression-gen-a-header-gap-${ test.info().project.name }.png`,
			fullPage: false,
		} );
	} );

	test( '背景色: .smb-app が #f0f0f1', async ( { page } ) => {
		const bg = await page.evaluate( () => {
			const el = document.querySelector( '.smb-app' );
			if ( ! el ) return null;
			return window.getComputedStyle( el ).backgroundColor;
		} );
		expect( bg ).toBe( 'rgb(240, 240, 241)' );
	} );

	test( 'SchedulePage ヘッダー: 「スケジュールを追加」だけ残り、コピー/表示期間ボタンは消えている', async ( {
		page,
	} ) => {
		const header = page.locator(
			'.smb-page--schedule .smb-page__header .smb-page__actions'
		);
		await expect( header ).toBeVisible();
		// 「スケジュールを追加」は存在.
		await expect(
			header.getByRole( 'button', { name: /スケジュールを追加/ } )
		).toBeVisible();
		// 「スケジュールをコピー」「表示期間 / 締切」は存在しない.
		await expect(
			header.getByRole( 'button', { name: /スケジュールをコピー/ } )
		).toHaveCount( 0 );
		await expect(
			header.getByRole( 'button', { name: /表示期間/ } )
		).toHaveCount( 0 );
		await expect(
			header.getByRole( 'button', { name: /締切/ } )
		).toHaveCount( 0 );
		await page.screenshot( {
			path: `test-results/regression-gen-a-page-header-${ test.info().project.name }.png`,
			fullPage: false,
		} );
	} );

	test( 'トースト: 背景 #EEFF81 / 文字色 #1d2327 / border なし、右下表示', async ( {
		page,
	} ) => {
		// 「スケジュールを追加」モーダルから別日を追加してトーストを出す.
		const targetDate2 = ymd( 2 );
		await page
			.getByRole( 'button', { name: /スケジュールを追加/ } )
			.first()
			.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールを追加',
			} )
		).toBeVisible();
		await page.locator( '#smb-schedule-date' ).fill( targetDate2 );
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '保存' } )
			.click();

		const toast = page.locator( '.smb-toast' ).first();
		await expect( toast ).toBeVisible( { timeout: 5000 } );

		const styles = await toast.evaluate( ( el ) => {
			const cs = window.getComputedStyle( el );
			return {
				bg: cs.backgroundColor,
				color: cs.color,
				borderTopWidth: cs.borderTopWidth,
				borderRightWidth: cs.borderRightWidth,
				borderBottomWidth: cs.borderBottomWidth,
				borderLeftWidth: cs.borderLeftWidth,
				borderTopStyle: cs.borderTopStyle,
			};
		} );
		// #EEFF81 = rgb(238, 255, 129)
		expect( styles.bg ).toBe( 'rgb(238, 255, 129)' );
		// #1d2327 = rgb(29, 35, 39)
		expect( styles.color ).toBe( 'rgb(29, 35, 39)' );
		// border は実質なし（width=0px もしくは style=none）.
		const noBorder =
			[
				styles.borderTopWidth,
				styles.borderRightWidth,
				styles.borderBottomWidth,
				styles.borderLeftWidth,
			].every( ( w ) => w === '0px' ) || styles.borderTopStyle === 'none';
		expect( noBorder ).toBe( true );

		// 右下表示: stack の position fixed + right/bottom 設定を確認.
		const stackPos = await page.evaluate( () => {
			const el = document.querySelector( '.smb-toast-stack' );
			if ( ! el ) return null;
			const cs = window.getComputedStyle( el );
			return {
				position: cs.position,
				right: cs.right,
				bottom: cs.bottom,
			};
		} );
		expect( stackPos?.position ).toBe( 'fixed' );
		// モバイルでは left も設定されるが right は 16px のまま.
		expect( stackPos.right ).toMatch( /16px/ );
		expect( stackPos.bottom ).toMatch( /16px/ );

		await page.screenshot( {
			path: `test-results/regression-gen-a-toast-${ test.info().project.name }.png`,
			fullPage: false,
		} );
	} );

	test( 'パターンコピー: 期間選択UI に上下マージンがある', async ( {
		page,
	} ) => {
		// スケジュールを REST で 1 件作る → コピー対象として開く.
		const sourceDate = ymd( 3 );
		const r = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: sourceDate,
					start_time: '11:00',
					end_time: '12:00',
					capacity: 2,
					is_active: 1,
				},
			],
		} );
		expect( r.ok, JSON.stringify( r.data ) ).toBe( true );

		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );

		// カレンダーで sourceDate のセルを選択.
		await page
			.locator( `.smb-calendar__cell[aria-label="${ sourceDate } を選択"]` )
			.click();

		// DetailPane の「コピー」ボタン（smb-link-btn）を押す.
		await page
			.locator( '.smb-schedule-group__actions' )
			.getByRole( 'button', { name: 'コピー' } )
			.first()
			.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールをコピー',
			} )
		).toBeVisible();

		// パターンモード切替.
		await page.getByText( /パターンで選択/ ).click();

		const range = page.locator( '.smb-copy-pattern__range' );
		await expect( range ).toBeVisible();
		const margins = await range.evaluate( ( el ) => {
			const cs = window.getComputedStyle( el );
			return {
				top: parseFloat( cs.marginTop ),
				bottom: parseFloat( cs.marginBottom ),
			};
		} );
		// 上下に 8px 以上のマージン（仕様: 16px）を期待.
		expect( margins.top ).toBeGreaterThanOrEqual( 8 );
		expect( margins.bottom ).toBeGreaterThanOrEqual( 8 );
		await page.screenshot( {
			path: `test-results/regression-gen-a-copy-pattern-${ test.info().project.name }.png`,
			fullPage: false,
		} );
	} );

	test( '個別コピー: 日付ピッカー選択で自動リスト追加 / 「日付を追加」ボタンなし', async ( {
		page,
	} ) => {
		const sourceDate = ymd( 4 );
		const r = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: sourceDate,
					start_time: '12:00',
					end_time: '13:00',
					capacity: 2,
					is_active: 1,
				},
			],
		} );
		expect( r.ok, JSON.stringify( r.data ) ).toBe( true );

		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );

		await page
			.locator( `.smb-calendar__cell[aria-label="${ sourceDate } を選択"]` )
			.click();
		await page
			.locator( '.smb-schedule-group__actions' )
			.getByRole( 'button', { name: 'コピー' } )
			.first()
			.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールをコピー',
			} )
		).toBeVisible();

		// 個別モードがデフォルト.
		await expect( page.getByText( '日付を個別選択' ).first() ).toBeVisible();

		// 「日付を追加」ボタンが存在しない.
		await expect(
			page.getByRole( 'button', { name: /^日付を追加$/ } )
		).toHaveCount( 0 );

		// 日付ピッカーに値を入れた瞬間、リストに追加される.
		const target = ymd( 7 );
		await page
			.locator( 'input[aria-label="コピー先の日付"]' )
			.fill( target );

		const chipList = page.locator( '.smb-chip-list .smb-date-chip' );
		await expect( chipList ).toHaveCount( 1, { timeout: 3000 } );

		await page.screenshot( {
			path: `test-results/regression-gen-a-copy-individual-${ test.info().project.name }.png`,
			fullPage: false,
		} );
	} );

	test( 'カレンダーセル: 残り枠表示が「残り○」形式', async ( { page } ) => {
		const targetDate = ymd( 5 );
		const r = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: targetDate,
					start_time: '13:00',
					end_time: '14:00',
					capacity: 5,
					is_active: 1,
				},
			],
		} );
		expect( r.ok, JSON.stringify( r.data ) ).toBe( true );

		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );

		const cell = page.locator(
			`.smb-calendar__cell[aria-label*="${ targetDate }"]`
		);
		await expect( cell ).toBeVisible();
		const tag = cell.locator( '.smb-calendar__tag' );
		await expect( tag ).toBeVisible();
		const text = ( await tag.textContent() ) || '';
		expect( text ).toMatch( /残り\s*\d+/ );

		await page.screenshot( {
			path: `test-results/regression-gen-a-calendar-remain-${ test.info().project.name }.png`,
			fullPage: false,
		} );
	} );
} );
